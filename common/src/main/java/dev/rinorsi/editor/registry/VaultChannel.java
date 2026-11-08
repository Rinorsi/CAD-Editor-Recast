package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.platform.ClientPlatform;
import com.google.gson.*;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.client.EditorToast;
import dev.rinorsi.editor.registry.search.Pinyin;
import dev.rinorsi.editor.vault.*;
import java.util.*;
import java.util.concurrent.*;
import net.minecraft.client.Minecraft;
import net.minecraft.network.protocol.game.ServerboundSetCreativeModeSlotPacket;

/** Local storage. Only explicit give can send a detached stack to the current server. */
public final class VaultChannel {
  private static final Map<DocumentDriver, State> STATES = new WeakHashMap<>();
  private static boolean initialized;
  private static CompletableFuture<VaultStore> store;
  private static Object validatorWorld, validatorLanguage;
  private static VaultStore.Validator activeValidator;
  private static Object reservationPlayer;
  private static final Set<Integer> reservedSlots = new HashSet<>();
  private record PendingGive(DocumentDriver driver, Object document, Object connection, String pageId, String entryId, long deadline) {}
  private static final Map<String, PendingGive> GIVES = new HashMap<>();

  private static final class State {
    Object document;
    long second;
    int requests;
    final LinkedHashMap<String, JsonObject> lists = new LinkedHashMap<>();
    String uploadToken;
    StringBuilder upload;
    long uploadUntil;
    final LinkedHashMap<String, JsonObject> giveReplies = new LinkedHashMap<>();
  }

  private VaultChannel() {}

  public static void attach(DocumentDriver driver) {
    if (driver.serverSession() || STATES.containsKey(driver)) return;
    STATES.put(driver, new State());
    driver.onMessage("vault", value -> accept(driver, value));
    driver.onClose(
        () -> {
          STATES.remove(driver);
          flushNow();
        });
    if (!initialized) {
      initialized = true;
      store =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  VaultStore loaded =
                      new VaultStore(
                          VaultPaths.file(),
                          net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version(),
                          Platform.get().modVersion("cadeditor"),
                          new Pinyin(
                              VaultChannel.class.getResourceAsStream(
                                  "/assets/cadeditor/ui/js/pinyin-data.js")),
                          System::currentTimeMillis);
                  loaded.migrateFrom(
                      Platform.get().configDir().resolve("cadeditor/vault.json"));
                  if (!loaded.flushNow())
                    System.getLogger(VaultChannel.class.getName())
                        .log(System.Logger.Level.WARNING, "全局保险库初始化存在尚未落盘数据");
                  return loaded;
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              });
      ClientPlatform.get().onTick(mc -> tick());
      ClientPlatform.get().onDisconnect(mc -> flushNow());
      ClientPlatform.get().onStopping(
          mc -> {
            try {
              VaultStore.awaitReady(store, VaultStore.FLUSH_TIMEOUT_MS).close();
            } catch (RuntimeException failure) {
              System.getLogger(VaultChannel.class.getName())
                  .log(System.Logger.Level.WARNING, "保险库退出保存失败：" + failure);
            }
          });
    }
  }

  private static void reset(DocumentDriver d, State s) {
    if (s.document != d.document()) {
      s.document = d.document();
      s.lists.clear();
      s.requests = 0;
      s.upload = null;
      s.uploadToken = null;
      s.giveReplies.clear();
    }
  }

  private static void accept(DocumentDriver driver, JsonElement message) {
    var mc = Minecraft.getInstance();
    if (!mc.isSameThread()) {
      JsonElement detached = message == null ? null : message.deepCopy();
      mc.execute(() -> accept(driver, detached));
      return;
    }
    State s = STATES.get(driver);
    if (s == null || driver.serverSession()) return;
    reset(driver, s);
    String id = "", op = "";
    try {
      if (message == null || !message.isJsonObject() || message.toString().length() > 8192)
        throw new VaultStore.Failure("BAD_REQUEST", "请求最多8192字符");
      VaultStore.checkDepth(message);
      JsonObject r = message.getAsJsonObject();
      id = VaultStore.text(r, "requestId", "", 128);
      op = VaultStore.text(r, "op", "", 32);
      String view = VaultStore.text(r, "view", "vault", 128);
      if (id.isEmpty() || view.isEmpty())
        throw new VaultStore.Failure("BAD_REQUEST", "缺少 requestId 或 view");
      if (op.equals("list")) {
        if (!s.lists.containsKey(view) && s.lists.size() >= 8)
          throw new VaultStore.Failure("BUSY", "最多8个固定view");
        s.lists.put(view, null);
      }
      long second = System.nanoTime() / 1_000_000_000L;
      if (second != s.second) {
        s.second = second;
        s.requests = 0;
      }
      if (++s.requests > 20) throw new VaultStore.Failure("BUSY", "每秒最多20次保险库请求");
      if (store == null || !store.isDone())
        throw new VaultStore.Failure("NOT_READY", "正在加载本地保险库，请在250毫秒后重试；当前结果不代表空库");
      if (store.isCompletedExceptionally())
        throw new VaultStore.Failure("STORAGE_FAILED", "保险库加载失败");
      if (op.equals("list")) {
        s.lists.put(view, r.deepCopy());
        return;
      }
      reply(driver, r, s);
    } catch (RuntimeException e) {
      error(driver, id, op, e);
    }
  }

  private static VaultStore.Validator validator() {
    var mc = Minecraft.getInstance();
    Object language = net.minecraft.locale.Language.getInstance();
    if (activeValidator == null || validatorWorld != mc.level || validatorLanguage != language) {
      if (store != null && store.isDone() && !store.isCompletedExceptionally())
        store.join().invalidateRows();
      validatorWorld = mc.level;
      validatorLanguage = language;
      var level = mc.level;
      activeValidator =
          stack -> {
            if (level == null) throw new VaultStore.Failure("UNAVAILABLE", "未进入世界，暂时无法解析物品组件");
            return VaultStacks.validate(stack, level.registryAccess());
          };
    }
    return activeValidator;
  }

  /** Close/disconnect must not discard pending writes, and must not wait forever. */
  public static boolean flushNow() {
    if (store == null) return true;
    try {
      return VaultStore.awaitReady(store, VaultStore.FLUSH_TIMEOUT_MS).flushNow();
    } catch (RuntimeException failure) {
      System.getLogger(VaultChannel.class.getName())
          .log(System.Logger.Level.WARNING, "保险库flush失败：" + failure);
      return false;
    }
  }

  private static void tick() {
    validator();
    refreshReservations();
    for (var entry : new ArrayList<>(GIVES.entrySet())) {
      var pending = entry.getValue();
      var mc = Minecraft.getInstance();
      if (mc.getConnection() != pending.connection || System.nanoTime() > pending.deadline) {
        if (mc.getConnection() != pending.connection) GIVES.remove(entry.getKey());
        else GIVES.put(entry.getKey(), new PendingGive(pending.driver, pending.document, pending.connection, pending.pageId, pending.entryId, Long.MAX_VALUE));
        giveReply(pending, false, mc.getConnection() != pending.connection ? "not_connected" : "request_timeout",
                mc.getConnection() != pending.connection ? "连接已断开，请核对背包后重试" : "未收到取出回执，结果未知；请先核对背包，勿重复点击", null);
      }
    }
    for (var entry : List.copyOf(STATES.entrySet())) {
      var driver = entry.getKey();
      var s = entry.getValue();
      reset(driver, s);
      if (s.upload != null && System.currentTimeMillis() >= s.uploadUntil) {
        s.upload = null;
        s.uploadToken = null;
      }
      for (var view : new ArrayList<>(s.lists.entrySet())) {
        JsonObject r = view.getValue();
        if (r == null) continue;
        try {
          if (!store.join().warm(validator(), 8)) return;
          s.lists.put(view.getKey(), null);
          reply(driver, r, s);
        } catch (RuntimeException e) {
          s.lists.put(view.getKey(), null);
          error(driver, VaultStore.text(r, "requestId", "", 128), "list", e);
        }
        return;
      }
    }
  }

  private static void reply(DocumentDriver driver, JsonObject r, State s) {
    String op = VaultStore.text(r, "op", "", 32);
    JsonObject result;
    if (op.equals("upload")) {
      long now = System.currentTimeMillis();
      String token = VaultStore.text(r, "token", "", 36);
      String chunk = VaultStore.text(r, "text", "", 6000);
      if (token.isEmpty()) {
        s.upload = new StringBuilder();
        s.uploadToken = UUID.randomUUID().toString();
      } else if (!token.equals(s.uploadToken) || s.upload == null || now >= s.uploadUntil)
        throw new VaultStore.Failure("UPLOAD_EXPIRED", "上传已过期");
      if (s.upload.length() + chunk.length() > VaultStore.MAX_FILE_BYTES) {
        s.upload = null;
        s.uploadToken = null;
        throw new VaultStore.Failure("FILE_LIMIT", "上传最多8Mi字符，解析后最多8MiB");
      }
      s.upload.append(chunk);
      s.uploadUntil = now + 30000;
      result = new JsonObject();
      result.addProperty("ok", true);
      result.addProperty("version", 1);
      result.addProperty("op", op);
      result.addProperty("requestId", VaultStore.text(r, "requestId", "", 128));
      result.addProperty("token", s.uploadToken);
      result.addProperty("chars", s.upload.length());
      result.addProperty("expires", s.uploadUntil);
    } else if (op.equals("give")) {
      String pageId = VaultStore.text(r, "requestId", "", 128);
      if (s.giveReplies.containsKey(pageId)) { driver.patch("vault.result", s.giveReplies.get(pageId)); return; }
      if (s.giveReplies.size() >= 4096) throw new VaultStore.Failure("rate_limited", "本页面取出请求过多，请重新打开页面");
      String entryId = VaultStore.text(r, "id", "", 36);
      for (var pending : GIVES.values()) if (pending.connection == Minecraft.getInstance().getConnection() && ((pending.driver == driver && pending.pageId.equals(pageId)) || pending.entryId.equals(entryId))) {
        if (pending.driver == driver && pending.pageId.equals(pageId)) return;
        throw new VaultStore.Failure("request_pending", "同一条目的取出正在等待服务端回执，请勿重复点击");
      }
      result = give(driver, r);
      if (result == null) return;
      remember(s, pageId, result);
    } else {
      if (r.has("uploadToken")) {
        if (!Set.of("save", "import").contains(op))
          throw new VaultStore.Failure("BAD_REQUEST", "上传仅支持 save/import");
        String token = VaultStore.text(r, "uploadToken", "", 36);
        if (!token.equals(s.uploadToken)
            || s.upload == null
            || System.currentTimeMillis() >= s.uploadUntil)
          throw new VaultStore.Failure("UPLOAD_EXPIRED", "上传已过期");
        JsonObject payload = VaultStore.parse(s.upload.toString());
        r = r.deepCopy();
        if (op.equals("save")) {
          if (VaultStore.text(r, "kind", "item", 16).equals("entity"))
            r.addProperty("snbt", VaultStore.text(payload, "snbt", "", VaultStore.MAX_FILE_BYTES));
          else r.add("stack", payload);
        } else {
          r.add("entries", payload.get("entries"));
          if (payload.has("version")) r.add("version", payload.get("version"));
        } /* Keep upload for subsequent import pages; expires after 30 seconds idle. */
        s.uploadUntil = System.currentTimeMillis() + 30000;
      }
      if (op.equals("save")
          && !VaultStore.text(r, "kind", "item", 16).equals("entity")
          && Minecraft.getInstance().level == null)
        throw new VaultStore.Failure("UNAVAILABLE", "保存需要进入世界以严格验证组件");
      result = store.join().execute(r, validator());
    }
    driver.patchJson("vault.result", result.toString());
  }

  private static JsonObject give(DocumentDriver driver, JsonObject r) {
    store.join().stack(VaultStore.text(r, "id", "", 36)); // Reject entity kind before permission/connection checks.
    var mc = Minecraft.getInstance();
    if (mc.player == null || mc.level == null || mc.getConnection() == null)
      throw new VaultStore.Failure("UNAVAILABLE", "当前未进入世界");
    if (InventoryWrites.givePath(mc.player.isCreative(), ClientPlatform.get().canSend(EditorPackets.Request.TYPE)) != InventoryWrites.GivePath.CREATIVE) {
      if (!ClientPlatform.get().canSend(EditorPackets.Request.TYPE))
        throw new VaultStore.Failure("not_connected", "服务器没有安装物品工坊，生存模式不能写回；冒险和旁观模式同样需要服务端支持");
      var request = new JsonObject();
      if (GIVES.size() >= 8) throw new VaultStore.Failure("request_pending", "最多同时等待8笔取出回执，请先核对背包");
      String networkId = "vault-give-" + UUID.randomUUID();
      request.addProperty("op", "vault_give"); request.addProperty("requestId", networkId);
      request.add("stack", store.join().stack(VaultStore.text(r, "id", "", 36)));
      request.addProperty("slot", VaultStore.text(r, "slot", "inventory", 16));
      if (r.has("inventoryIndex")) request.add("inventoryIndex", r.get("inventoryIndex").deepCopy());
      String json = request.toString();
      if (json.length() > EditorPackets.MAX_JSON) throw new VaultStore.Failure("payload_too_large", "保险库取出数据超过32767字符，未发送请求");
      GIVES.put(networkId, new PendingGive(driver, driver.document(), mc.getConnection(),
              VaultStore.text(r, "requestId", "", 128), VaultStore.text(r, "id", "", 36), System.nanoTime()+10_000_000_000L));
      try { ClientPlatform.get().send(new EditorPackets.Request(json)); }
      catch (RuntimeException failure) { GIVES.remove(networkId); throw failure; }
      return null;
    }
    String target = VaultStore.text(r, "slot", "inventory", 16);
    if (target.equals("cursor"))
      throw new VaultStore.Failure("UNSUPPORTED_SLOT", "没有安全的原版光标写回路径，请使用背包或快捷栏");
    if (!Set.of("inventory", "hotbar").contains(target))
      throw new VaultStore.Failure("BAD_REQUEST", "slot 无效");
    // Never overwrite an item or write into a currently open container.
    if (mc.player.containerMenu != mc.player.inventoryMenu)
      throw new VaultStore.Failure("NOT_ALLOWED", "请先关闭容器界面");
    JsonObject wire = store.join().stack(VaultStore.text(r, "id", "", 36));
    net.minecraft.world.item.ItemStack stack;
    try {
      stack = StackCodec.decode(wire, mc.level.registryAccess());
    } catch (RuntimeException invalid) {
      throw new VaultStore.Failure("INVALID_STACK", VaultStore.reason(invalid));
    }
    refreshReservations();
    int requestedIndex = r.has("inventoryIndex") ? StackCodec.integer(r, "inventoryIndex", 0, 35) : -1;
    if (requestedIndex >= 0 && !mc.player.getInventory().getItem(requestedIndex).isEmpty())
      throw new VaultStore.Failure("slot_changed", "指定槽位已被占用，没有覆盖原物品");
    int from = target.equals("hotbar") ? 0 : 9, to = target.equals("hotbar") ? 9 : 36;
    var slot =
        mc.player.inventoryMenu.slots.stream()
            .filter(
                v ->
                    v.container == mc.player.getInventory()
                        && (requestedIndex >= 0 ? v.getContainerSlot() == requestedIndex : v.getContainerSlot() >= from && v.getContainerSlot() < to)
                        && v.index >= 1
                        && v.index <= 45
                        && !reservedSlots.contains(v.getContainerSlot())
                        && !v.hasItem())
            .findFirst()
            .orElseThrow(() -> new VaultStore.Failure("INVENTORY_FULL", "目标区域没有空槽位"));
    mc.player.connection.send(new ServerboundSetCreativeModeSlotPacket(slot.index, stack));
    // Creative inventory ignores ordinary server refreshes: update the owned client inventory too.
    mc.player.getInventory().setItem(slot.getContainerSlot(), stack.copy());
    mc.player.getInventory().setChanged();
    // Client inventory is visibly occupied immediately; never claim server acknowledgement.
    reservedSlots.add(slot.getContainerSlot());
    JsonObject out = new JsonObject();
    out.addProperty("version", 1);
    out.addProperty("ok", true);
    out.addProperty("op", "give");
    out.addProperty("requestId", VaultStore.text(r, "requestId", "", 128));
    out.addProperty("status", "sent");
    out.addProperty("confirmed", false);
    out.addProperty("inventoryIndex", slot.getContainerSlot());
    out.addProperty("creativeSlot", slot.index);
    out.addProperty("code", "ok"); out.addProperty("path", "creative");
    var item = new JsonObject(); item.addProperty("id", wire.get("id").getAsString()); item.addProperty("count", stack.getCount()); out.add("item", item);
    out.addProperty("reason", slot.getContainerSlot() < 9 ? "已放进快捷栏第"+(slot.getContainerSlot()+1)+"格（客户端已显示，待服务端处理）" : "已放进背包第"+(slot.getContainerSlot()-8)+"格（槽位"+slot.getContainerSlot()+"，客户端已显示，待服务端处理）");
    EditorToast.show(EditorToast.Level.OK, out.get("reason").getAsString());
    return out;
  }

  public static boolean receive(JsonObject result) {
    if (!result.has("op") || !result.get("op").getAsString().equals("vault_give")) return false;
    String id = result.has("requestId") ? result.get("requestId").getAsString() : "";
    var pending = GIVES.remove(id);
    if (pending == null) return true;
    boolean ok = result.has("ok") && result.get("ok").getAsBoolean();
    giveReply(pending, ok, result.has("code") ? result.get("code").getAsString() : "invalid_request",
            result.has("reason") ? result.get("reason").getAsString() : "保险库取出失败", result);
    return true;
  }

  private static void remember(State state, String id, JsonObject result) {
    state.giveReplies.put(id, result.deepCopy());
  }

  private static void giveReply(PendingGive pending, boolean ok, String code, String reason, JsonObject result) {
    if (Minecraft.getInstance().getConnection() != pending.connection && ok) return;
    var out = result == null ? new JsonObject() : result.deepCopy();
    out.addProperty("version", 1); out.addProperty("op", "give"); out.addProperty("requestId", pending.pageId);
    out.addProperty("ok", ok); out.addProperty("code", code); out.addProperty("reason", reason); out.addProperty("path", "server");
    if (!ok) out.addProperty("error", code);
    var state = STATES.get(pending.driver);
    if (state != null && pending.driver.document() == pending.document) { remember(state, pending.pageId, out); pending.driver.patch("vault.result", out); }
    EditorToast.show(ok ? EditorToast.Level.OK : EditorToast.Level.ERROR, reason);
  }

  private static void refreshReservations() {
    var player = Minecraft.getInstance().player;
    if (reservationPlayer != player) {
      reservedSlots.clear();
      reservationPlayer = player;
    }
    if (player != null) reservedSlots.removeIf(i -> !player.getInventory().getItem(i).isEmpty());
  }

  private static void error(DocumentDriver driver, String id, String op, RuntimeException e) {
    JsonObject out = new JsonObject();
    out.addProperty("version", 1);
    out.addProperty("requestId", id);
    out.addProperty("op", op);
    out.addProperty("ok", false);
    out.addProperty("error", e instanceof VaultStore.Failure f ? f.code : "BAD_REQUEST");
    out.addProperty("reason", VaultStore.reason(e));
    if (op.equals("give")) {
      String code = e instanceof VaultStore.Failure f ? f.code : "invalid_request";
      out.addProperty("code", switch (code) { case "UNAVAILABLE" -> "not_connected"; case "BAD_REQUEST" -> "invalid_request"; default -> code.toLowerCase(Locale.ROOT); });
      EditorToast.show(EditorToast.Level.ERROR, VaultStore.reason(e));
    }
    if (e instanceof VaultStore.Failure f && f.code.equals("NOT_READY")) {
      out.addProperty("retryAfterMs", 250);
      out.addProperty("loading", true);
    }
    driver.patch("vault.result", out);
  }
}
