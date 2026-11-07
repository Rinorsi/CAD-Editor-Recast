package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.registry.search.Pinyin;
import dev.rinorsi.editor.vault.*;
import java.util.*;
import java.util.concurrent.*;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.network.protocol.game.ServerboundSetCreativeModeSlotPacket;

/** Client-local only: no payload registration, remote server or filesystem capability. */
public final class VaultChannel {
  private static final Map<DocumentDriver, State> STATES = new WeakHashMap<>();
  private static boolean initialized;
  private static CompletableFuture<VaultStore> store;
  private static Object validatorWorld, validatorLanguage;
  private static VaultStore.Validator activeValidator;
  private static Object reservationPlayer;
  private static final Set<Integer> reservedSlots = new HashSet<>();

  private static final class State {
    Object document;
    long second;
    int requests;
    final LinkedHashMap<String, JsonObject> lists = new LinkedHashMap<>();
    String uploadToken;
    StringBuilder upload;
    long uploadUntil;
  }

  private VaultChannel() {}

  public static void attach(DocumentDriver driver) {
    if (driver.serverSession() || STATES.containsKey(driver)) return;
    STATES.put(driver, new State());
    driver.onMessage("vault", value -> accept(driver, value));
    driver.onClose(() -> STATES.remove(driver));
    if (!initialized) {
      initialized = true;
      store =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  return new VaultStore(
                      FabricLoader.getInstance().getConfigDir().resolve("cadeditor/vault.json"),
                      net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version(),
                      FabricLoader.getInstance()
                          .getModContainer("cadeditor")
                          .map(m -> m.getMetadata().getVersion().getFriendlyString())
                          .orElse("unknown"),
                      new Pinyin(
                          VaultChannel.class.getResourceAsStream(
                              "/assets/cadeditor/ui/js/pinyin-data.js")),
                      System::currentTimeMillis);
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              });
      ClientTickEvents.END_CLIENT_TICK.register(mc -> tick());
      ClientLifecycleEvents.CLIENT_STOPPING.register(
          mc -> {
            try {
              store.join().close();
            } catch (RuntimeException ignored) {
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
        throw new VaultStore.Failure("NOT_READY", "正在加载本地保险库，请稍后重试");
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

  private static void tick() {
    validator();
    refreshReservations();
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
      result = give(r);
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
        if (op.equals("save")) r.add("stack", payload);
        else {
          r.add("entries", payload.get("entries"));
          if (payload.has("version")) r.add("version", payload.get("version"));
        } /* Keep upload for subsequent import pages; expires after 30 seconds idle. */
        s.uploadUntil = System.currentTimeMillis() + 30000;
      }
      if (op.equals("save") && Minecraft.getInstance().level == null)
        throw new VaultStore.Failure("UNAVAILABLE", "保存需要进入世界以严格验证组件");
      result = store.join().execute(r, validator());
    }
    driver.patchJson("vault.result", result.toString());
  }

  private static JsonObject give(JsonObject r) {
    var mc = Minecraft.getInstance();
    if (mc.player == null || mc.level == null || mc.getConnection() == null)
      throw new VaultStore.Failure("UNAVAILABLE", "当前未进入世界");
    if (!mc.player.isCreative()) throw new VaultStore.Failure("NOT_ALLOWED", "仅创造模式可以取出到背包");
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
    int from = target.equals("hotbar") ? 0 : 9, to = target.equals("hotbar") ? 9 : 36;
    var slot =
        mc.player.inventoryMenu.slots.stream()
            .filter(
                v ->
                    v.container == mc.player.getInventory()
                        && v.getContainerSlot() >= from
                        && v.getContainerSlot() < to
                        && v.index >= 1
                        && v.index <= 45
                        && !reservedSlots.contains(v.getContainerSlot())
                        && !v.hasItem())
            .findFirst()
            .orElseThrow(() -> new VaultStore.Failure("INVENTORY_FULL", "目标区域没有空槽位"));
    mc.player.connection.send(new ServerboundSetCreativeModeSlotPacket(slot.index, stack));
    // Vanilla may not echo this packet. Keep an unconfirmed empty slot reserved
    // until an actual inventory update makes it occupied (or the player reconnects).
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
    return out;
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
    driver.patch("vault.result", out);
  }
}
