package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.registry.search.Pinyin;
import dev.rinorsi.editor.testing.TooltipFixtures;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import net.minecraft.SharedConstants;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.*;
import net.minecraft.network.chat.Component;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.*;

/** Real vanilla registries; no window, server, world, input or test-only data registry. */
public final class VaultTest {
  private static int checks;
  private static RegistryAccess access;
  private static VaultStore.Validator validator;
  private static Pinyin pinyin;
  private static final AtomicLong time = new AtomicLong(1794050000000L);
  private static final JsonObject captures = new JsonObject();

  private static void check(boolean pass, String name) {
    if (!pass) throw new AssertionError(name);
    checks++;
    System.out.println("PASS " + name);
  }

  private static void rejects(String code, Runnable action) {
    try {
      action.run();
      throw new AssertionError("Expected " + code);
    } catch (VaultStore.Failure e) {
      check(e.code.equals(code), "reject " + code + " got " + e.code);
    }
  }

  private static JsonObject req(String op) {
    JsonObject r = new JsonObject();
    r.addProperty("op", op);
    r.addProperty("requestId", "test-" + op);
    return r;
  }

  private static JsonObject idReq(String op, String id) {
    JsonObject r = req(op);
    r.addProperty("id", id);
    return r;
  }

  private static JsonObject idsReq(String op, String... ids) {
    JsonObject r = req(op);
    JsonArray a = new JsonArray();
    for (String id : ids) a.add(id);
    r.add("ids", a);
    return r;
  }

  private static JsonObject saveReq(ItemStack stack) {
    JsonObject r = req("save");
    r.add("stack", StackCodec.snapshot(stack, access, new JsonObject(), ""));
    return r;
  }

  private static VaultStore open(Path p) {
    return new VaultStore(
        p,
        SharedConstants.getCurrentVersion().dataVersion().version(),
        "0.99.1",
        pinyin,
        time::get);
  }

  private static String id(JsonObject result) {
    return result.getAsJsonObject("entry").get("id").getAsString();
  }

  private static JsonObject run(VaultStore s, JsonObject r) {
    JsonObject out = s.execute(r, validator);
    check(out.toString().length() <= 24000, "response cap " + r.get("op"));
    String op = r.get("op").getAsString();
    if (!captures.has(op)) {
      JsonObject pair = new JsonObject();
      pair.add("request", r.deepCopy());
      pair.add("response", out.deepCopy());
      captures.add(op, pair);
    }
    return out;
  }

  private static String export(VaultStore s, JsonObject r) {
    StringBuilder b = new StringBuilder();
    long revision = -1;
    while (true) {
      JsonObject out = run(s, r);
      if (revision < 0) revision = out.get("revision").getAsLong();
      check(revision == out.get("revision").getAsLong(), "stable export revision");
      b.append(out.get("text").getAsString());
      if (out.get("done").getAsBoolean()) return b.toString();
      r.addProperty("offset", out.get("nextOffset").getAsInt());
    }
  }

  public static void main(String[] args) throws Exception {
    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();
    var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
    BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
    var builtins = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
    access =
        new RegistryAccess() {
          public <E> Optional<Registry<E>> lookup(
              net.minecraft.resources.ResourceKey<? extends Registry<? extends E>> k) {
            return builtins.lookup(k);
          }

          public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>> registries() {
            return builtins.registries();
          }

          public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(
              com.mojang.serialization.DynamicOps<V> ops) {
            return lookup.createSerializationContext(ops);
          }
        };
    validator = stack -> VaultStacks.validate(stack, access);
    pinyin =
        new Pinyin(
            Files.newInputStream(
                Path.of("common/src/main/resources/assets/cadeditor/ui/js/pinyin-data.js")));
    // The vanilla JAR carries its actual English language; no client asset download is needed.
    // Chinese text and pinyin are exercised by the explicit custom item/entry names below.
    String translatedSword = Component.translatable(Items.DIAMOND_SWORD.getDescriptionId()).getString();
    check(!translatedSword.equals(Items.DIAMOND_SWORD.getDescriptionId()),
        "vanilla language resolves a translated registry name");
    Path dir = Files.createTempDirectory("cadeditor-vault-test-");
    Path file = dir.resolve("vault.json");
    Map<String, ItemStack> fixtures = new LinkedHashMap<>(TooltipFixtures.create(lookup));
    ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
    sword.set(DataComponents.CUSTOM_NAME, Component.literal("钻石剑·保险库"));
    sword.set(DataComponents.LORE, new ItemLore(List.of(Component.literal("自定义描述"))));
    sword.set(
        DataComponents.ATTRIBUTE_MODIFIERS,
        Items.DIAMOND_SWORD.components().get(DataComponents.ATTRIBUTE_MODIFIERS));
    sword.enchant(
        lookup
            .lookupOrThrow(Registries.ENCHANTMENT)
            .getOrThrow(net.minecraft.world.item.enchantment.Enchantments.SHARPNESS),
        5);
    fixtures.put("enchanted_sword", sword);
    ItemStack typed = new ItemStack(Items.PAPER);
    var tag = new net.minecraft.nbt.CompoundTag();
    tag.putByte("b", (byte) 7);
    tag.putShort("s", (short) 23);
    tag.putLong("long", 9007199254740993L);
    tag.putFloat("f", 0.8f);
    tag.putDouble("d", 0.123456789012345);
    tag.putByteArray("ba", new byte[] {-1, 0, 127});
    tag.putIntArray("ia", new int[] {1, 2, 3});
    tag.putLongArray("la", new long[] {Long.MIN_VALUE, Long.MAX_VALUE});
    typed.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
    fixtures.put("all_typed", typed);
    JsonObject browser = saveReq(typed).getAsJsonObject("stack");
    browser
        .getAsJsonObject("comps")
        .getAsJsonObject("custom_data")
        .addProperty("long", 9007199254740992D);
    browser
        .getAsJsonObject("comps")
        .getAsJsonObject("custom_data")
        .getAsJsonArray("la")
        .set(1, new JsonPrimitive((double) Long.MAX_VALUE));
    check(
        ItemStack.matches(typed, StackCodec.decode(browser, access)),
        "browser IEEE754 projection retains precise typed sidecar");
    List<String> saved = new ArrayList<>();
    try (VaultStore store = open(file)) {
      check(run(store, req("stats")).get("entries").getAsInt() == 0, "missing file empty");
      for (var fixture : fixtures.entrySet()) {
        JsonObject result = run(store, saveReq(fixture.getValue()));
        String id = id(result);
        saved.add(id);
        JsonObject got =
            run(store, idsReq("get", id))
                .getAsJsonArray("entries")
                .get(0)
                .getAsJsonObject()
                .getAsJsonObject("stack");
        ItemStack decoded = StackCodec.decode(VaultStore.parse(got.toString()), access);
        check(
            ItemStack.matches(decoded, fixture.getValue()),
            "bit-exact save/get/apply " + fixture.getKey());
        var originalNbt =
            ItemStack.CODEC
                .encodeStart(
                    access.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE),
                    fixture.getValue())
                .getOrThrow();
        var afterNbt =
            ItemStack.CODEC
                .encodeStart(
                    access.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE), decoded)
                .getOrThrow();
        check(originalNbt.equals(afterNbt), "typed NBT identity " + fixture.getKey());
      }
      JsonObject duplicate = run(store, saveReq(typed));
      check(duplicate.get("duplicate").getAsBoolean(), "typed hash dedup");
      JsonObject byteOne = saveReq(new ItemStack(Items.PAPER));
      JsonObject formatsOne = new JsonObject();
      formatsOne.addProperty("custom_data", "snbt");
      byteOne.getAsJsonObject("stack").add("component_formats", formatsOne);
      byteOne
          .getAsJsonObject("stack")
          .getAsJsonObject("comps")
          .addProperty("custom_data", "{a:1b,b:2s}");
      String byteId = id(run(store, byteOne));
      JsonObject reversed = byteOne.deepCopy();
      reversed
          .getAsJsonObject("stack")
          .getAsJsonObject("comps")
          .addProperty("custom_data", "{b:2s,a:1b}");
      check(id(run(store, reversed)).equals(byteId), "compound key order does not defeat dedup");
      JsonObject intOne = byteOne.deepCopy();
      intOne
          .getAsJsonObject("stack")
          .getAsJsonObject("comps")
          .addProperty("custom_data", "{a:1,b:2s}");
      check(!id(run(store, intOne)).equals(byteId), "different NBT number types never dedup");
      JsonObject force = saveReq(typed);
      force.addProperty("force", true);
      check(!run(store, force).get("duplicate").getAsBoolean(), "force duplicate");
      String target = saved.get(saved.size() - 2);
      JsonObject update = idReq("update", target);
      update.addProperty("name", "收藏钻石剑");
      update.addProperty("note", "测试武器");
      JsonArray tags = new JsonArray();
      tags.add("武器");
      update.add("tags", tags);
      run(store, update);
      for (String query : List.of("钻石", "zuanshi", "zsj", "diamond_sword", "测试武器", translatedSword)) {
        JsonObject r = req("list");
        r.addProperty("query", query);
        check(
            run(store, r).get("total").getAsInt() > 0,
            "Chinese/translated/pinyin/id search " + query);
      }
      run(store, req("tags"));
      JsonObject filtered = req("list");
      filtered.add("tags", tags);
      check(run(store, filtered).get("total").getAsInt() == 1, "AND tag filter");
      JsonObject del = run(store, idsReq("delete", target));
      check(
          run(store, idsReq("get", target)).getAsJsonArray("entries").isEmpty(), "delete removes");
      JsonObject restore = req("restore");
      restore.add("token", del.get("token"));
      check(run(store, restore).get("restored").getAsInt() == 1, "restore once");
      JsonObject consumed = restore;
      rejects("UNDO_EXPIRED", () -> run(store, consumed));
      run(store, idReq("duplicate", target));
      del = run(store, idsReq("delete", target));
      restore = req("restore");
      restore.add("token", del.get("token"));
      time.addAndGet(30001);
      JsonObject expired = restore;
      rejects("UNDO_EXPIRED", () -> run(store, expired));
      JsonObject exportReq = req("export");
      exportReq.addProperty("all", true);
      String backup = export(store, exportReq);
      try (VaultStore imported = open(dir.resolve("import.json"))) {
        JsonObject imp = req("import");
        imp.addProperty("text", backup);
        JsonObject receipt = run(imported, imp);
        check(
            receipt.getAsJsonArray("results").asList().stream()
                .allMatch(e -> e.getAsJsonObject().get("ok").getAsBoolean()),
            "import per-entry success");
        JsonObject again = req("export");
        again.addProperty("all", true);
        check(
            VaultStore.parse(export(imported, again)).equals(VaultStore.parse(backup)),
            "import export exact typed identity");
        JsonObject incompatible =
            VaultStore.parse(backup).getAsJsonArray("entries").get(0).getAsJsonObject().deepCopy();
        incompatible.addProperty("id", UUID.randomUUID().toString());
        incompatible.getAsJsonObject("stack").addProperty("id", "absent:version_changed");
        incompatible.addProperty("mcDataVersion", 1);
        JsonArray a = new JsonArray();
        a.add(incompatible);
        a.add(new JsonObject());
        imp = req("import");
        imp.add("entries", a);
        receipt = run(imported, imp);
        check(
            receipt
                .getAsJsonArray("results")
                .get(0)
                .getAsJsonObject()
                .get("incompatible")
                .getAsBoolean(),
            "incompatible retained");
        check(
            !receipt.getAsJsonArray("results").get(1).getAsJsonObject().get("ok").getAsBoolean(),
            "import per-entry error");
        JsonObject got =
            run(imported, idsReq("get", incompatible.get("id").getAsString()))
                .getAsJsonArray("entries")
                .get(0)
                .getAsJsonObject();
        check(
            got.get("incompatible").getAsBoolean()
                && got.get("stack").equals(incompatible.get("stack")),
            "incompatible never migrated or deleted");
      }
      JsonObject bad = saveReq(typed);
      bad.getAsJsonObject("stack").addProperty("id", "missing:no");
      rejects("INVALID_STACK", () -> run(store, bad));
      JsonObject invalid = idReq("update", "../vault.json");
      rejects("BAD_ID", () -> run(store, invalid));
      JsonObject tooBig = saveReq(typed);
      tooBig.addProperty("force", true);
      tooBig
          .getAsJsonObject("stack")
          .getAsJsonObject("comps")
          .addProperty("custom_data", "{value:\"" + "x".repeat(VaultStore.MAX_ENTRY_BYTES + 1) + "\"}");
      JsonObject formats = new JsonObject();
      formats.addProperty("custom_data", "snbt");
      tooBig.getAsJsonObject("stack").add("component_formats", formats);
      rejects("ENTRY_TOO_LARGE", () -> run(store, tooBig));
      ExecutorService pool = Executors.newFixedThreadPool(2);
      try {
        var a =
            pool.submit(
                () -> {
                  var r = saveReq(typed);
                  r.addProperty("force", true);
                  return store.execute(r, validator);
                });
        var b =
            pool.submit(
                () -> {
                  var r = saveReq(typed);
                  r.addProperty("force", true);
                  return store.execute(r, validator);
                });
        check(!id(a.get()).equals(id(b.get())), "two quick saves distinct and serialized");
      } finally {
        pool.shutdown();
      }
      store.flush();
      check(Files.size(file) > 0, "atomic persistence");
      JsonObject r = saveReq(typed);
      r.addProperty("force", true);
      run(store, r);
      store.flush();
      check(Files.exists(dir.resolve("vault.json.bak")), "backup created");
    }
    try (VaultStore reloaded = open(file)) {
      String typedId = saved.get(saved.size() - 1);
      JsonObject wire =
          run(reloaded, idsReq("get", typedId))
              .getAsJsonArray("entries")
              .get(0)
              .getAsJsonObject()
              .getAsJsonObject("stack");
      check(
          ItemStack.matches(typed, StackCodec.decode(wire, access)),
          "close/reopen disk retains exact NBT numeric/array types");
    }
    for (String corrupt : List.of("{\"version\":1,\"entries\":[", "not json")) {
      Files.writeString(file, corrupt);
      try (VaultStore recovered = open(file)) {
        JsonObject stats = run(recovered, req("stats"));
        check(
            stats.get("warning").getAsString().equals("RECOVERED_BACKUP")
                && stats.get("entries").getAsInt() > 0,
            "corrupt primary falls back backup");
        recovered.flush();
      }
    }
    try (var files = Files.list(dir)) {
      check(
          files.filter(p -> p.getFileName().toString().contains(".corrupt-")).count() >= 2,
          "bad files quarantined");
    }
    Files.delete(file);
    try (VaultStore recovered = open(file)) {
      check(
          run(recovered, req("stats")).get("warning").getAsString().equals("RECOVERED_BACKUP"),
          "missing primary backup recovery");
    }
    Path broken = dir.resolve("broken.json");
    Files.writeString(broken, "{");
    try (VaultStore recovered = open(broken)) {
      check(
          run(recovered, req("stats")).get("warning").getAsString().equals("RECOVERY_EMPTY"),
          "both missing or bad visible warning");
    }
    Path future = dir.resolve("future.json");
    Files.writeString(future, "{\"version\":99,\"entries\":[]}");
    try (VaultStore blocked = open(future)) {
      rejects("STORAGE_READ_ONLY", () -> run(blocked, saveReq(typed)));
      check(Files.readString(future).contains("99"), "future schema never overwritten");
    }
    Path failureDir = dir.resolve("not-directory");
    Files.writeString(failureDir, "blocking file");
    try (VaultStore blocked = open(failureDir.resolve("vault.json"))) {
      run(blocked, saveReq(typed));
      blocked.flush();
      check(
          run(blocked, req("stats")).get("storageError").getAsString().equals("WRITE_FAILED"),
          "write failure observable and pending");
    }
    quotaTests(dir, typed);
    Files.createDirectories(Path.of("logs/vault"));
    Files.writeString(Path.of("logs/vault/jvm-responses.json"), captures.toString());
    System.out.println(
        "PASS VaultTest "
            + checks
            + " checks; real registries, no game started; temp files "
            + dir);
  }

  private static JsonObject diskEntry(JsonObject stack) {
    JsonObject e = new JsonObject();
    e.addProperty("id", UUID.randomUUID().toString());
    e.addProperty("name", "quota");
    e.add("tags", new JsonArray());
    e.addProperty("note", "");
    e.addProperty("created", time.get());
    e.addProperty("updated", time.get());
    e.addProperty("mcDataVersion", SharedConstants.getCurrentVersion().dataVersion().version());
    e.addProperty("modVersion", "0.99.1");
    e.add("stack", stack);
    return e;
  }

  private static void quotaTests(Path dir, ItemStack typed) throws Exception {
    JsonObject small =
        VaultStacks.validate(saveReq(typed).getAsJsonObject("stack"), access).stack();
    JsonObject root = new JsonObject();
    root.addProperty("version", 1);
    JsonArray rows = new JsonArray();
    for (int i = 0; i < 2000; i++) rows.add(diskEntry(small));
    root.add("entries", rows);
    Path many = dir.resolve("many.json");
    Files.writeString(many, root.toString());
    try (VaultStore s = open(many)) {
      check(run(s, req("stats")).get("entries").getAsInt() == 2000, "exact entry cap loads");
      JsonObject r = saveReq(typed);
      r.addProperty("force", true);
      rejects("ENTRY_LIMIT", () -> run(s, r));
      JsonObject list = req("list");
      list.addProperty("limit", 100);
      check(run(s, list).getAsJsonArray("entries").size() <= 100, "list pages bounded at capacity");
      list.addProperty("limit", 101);
      rejects("BAD_REQUEST", () -> run(s, list));
    }
    ItemStack big = new ItemStack(Items.PAPER);
    var data = new net.minecraft.nbt.CompoundTag();
    data.putString("payload", "x".repeat(28000));
    big.set(DataComponents.CUSTOM_DATA, CustomData.of(data));
    JsonObject canonical =
        VaultStacks.validate(saveReq(big).getAsJsonObject("stack"), access).stack();
    rows = new JsonArray();
    root = new JsonObject();
    root.addProperty("version", 1);
    root.add("entries", rows);
    int entryBytes =
        diskEntry(canonical).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
    int count = (VaultStore.MAX_FILE_BYTES - root.toString().length() - 1) / (entryBytes + 1);
    for (int i = 0; i < count; i++) rows.add(diskEntry(canonical));
    Path full = dir.resolve("full.json");
    Files.writeString(full, root.toString());
    check(Files.size(full) <= VaultStore.MAX_FILE_BYTES, "fixture within 8MiB cap");
    try (VaultStore s = open(full)) {
      JsonObject r = saveReq(big);
      r.addProperty("force", true);
      rejects("FILE_LIMIT", () -> run(s, r));
      JsonObject get = idsReq("get", rows.get(0).getAsJsonObject().get("id").getAsString());
      rejects("RESPONSE_LIMIT", () -> run(s, get));
      String exported =
          export(s, idsReq("export", rows.get(0).getAsJsonObject().get("id").getAsString()));
      check(
          VaultStore.parse(exported)
              .getAsJsonArray("entries")
              .get(0)
              .getAsJsonObject()
              .get("stack")
              .equals(canonical),
          "large entry paged export exact");
    }
    Path oversized = dir.resolve("oversized.json");
    Files.writeString(oversized, "x".repeat(VaultStore.MAX_FILE_BYTES + 1));
    try (VaultStore s = open(oversized)) {
      check(
          run(s, req("stats")).get("warning").getAsString().equals("RECOVERY_EMPTY"),
          "oversized file quarantined");
    }
    rejects(
        "BAD_REQUEST",
        () -> VaultStore.parse("{\"x\":" + "[".repeat(100) + "0" + "]".repeat(100) + "}"));
  }

}
