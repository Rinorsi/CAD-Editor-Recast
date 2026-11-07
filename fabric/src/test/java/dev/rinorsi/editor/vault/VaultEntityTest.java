package dev.rinorsi.editor.vault;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.SharedConstants;
import net.minecraft.nbt.*;
import net.minecraft.server.Bootstrap;

/** Real NBT parser and registries; no game window or user files. */
public final class VaultEntityTest {
  private static int checks;
  private static dev.rinorsi.editor.registry.search.Pinyin pinyin;
  private static final JsonObject captures = new JsonObject();
  private static final VaultStore.Validator ITEMS =
      s -> new VaultStore.Validated(s, "Stone", "石头", new JsonObject());

  private static void check(boolean b, String label) {
    if (!b) throw new AssertionError(label);
    checks++;
    System.out.println("PASS " + label);
  }

  private static JsonObject req(String op) {
    var r = new JsonObject();
    r.addProperty("op", op);
    r.addProperty("requestId", "entity-" + op);
    return r;
  }

  private static JsonObject run(VaultStore s, JsonObject r) {
    var out = s.execute(r, ITEMS);
    var pair = new JsonObject();
    pair.add("request", r.deepCopy());
    pair.add("response", out.deepCopy());
    synchronized (captures) {
      boolean useful =
          !r.get("op").getAsString().equals("list")
              || (r.has("kind")
                  && r.get("kind").getAsString().equals("entity")
                  && !out.getAsJsonArray("entries").isEmpty());
      if (useful && !captures.has(r.get("op").getAsString()))
        captures.add(r.get("op").getAsString(), pair);
    }
    return out;
  }

  private static JsonObject save(String snbt) {
    var r = req("save");
    r.addProperty("kind", "entity");
    r.addProperty("snbt", snbt);
    r.addProperty("name", "僵尸模板");
    r.addProperty("note", "类型保真");
    var tags = new JsonArray();
    tags.add("共享");
    r.add("tags", tags);
    return r;
  }

  private static JsonObject select(String op, String id) {
    var r = req(op);
    r.addProperty("id", id);
    var ids = new JsonArray();
    ids.add(id);
    r.add("ids", ids);
    return r;
  }

  private static String id(JsonObject out) {
    return out.getAsJsonObject("entry").get("id").getAsString();
  }

  private static VaultStore open(Path p) {
    return new VaultStore(p, 1, "test", pinyin, System::currentTimeMillis);
  }

  private static void rejects(String code, Runnable r) {
    try {
      r.run();
      throw new AssertionError("expected " + code);
    } catch (VaultStore.Failure f) {
      check(f.code.equals(code), code + " got " + f.code);
    }
  }

  private static int total(VaultStore s, String kind) {
    var r = req("list");
    if (kind != null) r.addProperty("kind", kind);
    return run(s, r).get("total").getAsInt();
  }

  public static void main(String[] args) throws Exception {
    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();
    pinyin =
        new dev.rinorsi.editor.registry.search.Pinyin(
            Files.newInputStream(
                Path.of("fabric/src/main/resources/assets/cadeditor/ui/js/pinyin-data.js")));
    Path dir = Files.createTempDirectory("vault-entities-"),
        path = dir.resolve("global/vault.json");
    String typed =
        "{id:'minecraft:zombie',Age:-10,CustomName:'测试',equipment:{head:{id:'minecraft:stone',count:1}},attributes:[{id:'minecraft:max_health',base:40d}],active_effects:[{id:'minecraft:speed',duration:300}],data:{n:9223372036854775807L,f:1.25f,b:1b,s:2s,d:2.5d,bytes:[B;1b,-2b],ints:[I;1,2],longs:[L;3L,4L]},UUID:[I;1,2,3,4],Pos:[1d,2d,3d],Motion:[0d,0d,0d],Passengers:[{id:'minecraft:pig'}],Brain:{},Leash:{},Dimension:'minecraft:overworld',Air:3s}";
    String savedId, canonical;
    try (var s = open(path)) {
      var response = run(s, save(typed));
      savedId = id(response);
      check(response.getAsJsonArray("stripped").contains(new JsonPrimitive("UUID")), "strip UUID");
      check(response.getAsJsonArray("stripped").contains(new JsonPrimitive("Pos")), "strip Pos");
      check(
          response.getAsJsonArray("warnings").contains(new JsonPrimitive("PASSENGERS_DROPPED")),
          "passenger warning");
      var summary = response.getAsJsonObject("entry").getAsJsonObject("summary");
      check(
          summary.get("baby").getAsBoolean() && summary.get("hasCustomName").getAsBoolean(),
          "baby and name summary");
      check(
          summary.get("equipmentCount").getAsInt() == 1
              && summary.get("attributeCount").getAsInt() == 1
              && summary.get("effectCount").getAsInt() == 1,
          "equipment attribute effect counts");
      check(run(s, save(typed)).get("duplicate").getAsBoolean(), "entity dedup");
      var full = run(s, select("get", savedId)).getAsJsonArray("entries").get(0).getAsJsonObject();
      canonical = full.get("snbt").getAsString();
      var parsed = (CompoundTag) TagParser.create(NbtOps.INSTANCE).parseFully(canonical);
      var original = (CompoundTag) TagParser.create(NbtOps.INSTANCE).parseFully(typed);
      check(
          parsed.get("data").equals(original.get("data")), "all numeric and array NBT types exact");
      for (String key : VaultEntities.strippedFields())
        check(!parsed.contains(key), "runtime stripped " + key);
      check(
          total(s, null) == 0 && total(s, "entity") == 1 && total(s, "all") == 1,
          "kind defaults and filtering");
      for (String query : List.of("僵尸", "jiangshi", "jsmb")) {
        var search = req("list");
        search.addProperty("kind", "entity");
        search.addProperty("query", query);
        check(run(s, search).get("total").getAsInt() == 1, "entity Chinese pinyin search " + query);
      }
      var list = req("list");
      list.addProperty("kind", "entity");
      var row = run(s, list).getAsJsonArray("entries").get(0).getAsJsonObject();
      check(!row.has("snbt"), "list light row");
      var update = select("update", savedId);
      update.addProperty("note", "更新备注");
      run(s, update);
      check(id(run(s, select("duplicate", savedId))).length() == 36, "duplicate entity");
      var deleted = run(s, select("delete", savedId));
      var restore = req("restore");
      restore.add("token", deleted.get("token"));
      check(run(s, restore).get("restored").getAsInt() == 1, "delete restore entity");
      rejects("wrong_kind", () -> s.stack(savedId));
      run(s, save("{id:'example:unknown',x:2L}"));
      var unknownList = req("list");
      unknownList.addProperty("kind", "entity");
      unknownList.addProperty("query", "example:unknown");
      check(
          run(s, unknownList)
              .getAsJsonArray("entries")
              .get(0)
              .getAsJsonObject()
              .get("compatibilityUnknown")
              .getAsBoolean(),
          "unknown registry id preserved");
      rejects("INVALID_ENTITY", () -> run(s, save("{broken")));
      rejects("INVALID_ENTITY_ID", () -> run(s, save("{Health:2f}")));
      rejects("INVALID_ENTITY_ID", () -> run(s, save("{id:'bad ID'}")));
      rejects("INVALID_ENTITY_ID", () -> run(s, save("{id:12}")));
      rejects(
          "ENTRY_TOO_LARGE",
          () -> run(s, save("{id:'minecraft:pig',x:'" + "界".repeat(23000) + "'}")));
      var item = req("save");
      item.add(
          "stack", JsonParser.parseString("{id:'minecraft:stone',count:1,comps:{},removed:{}}"));
      item.add("tags", save(typed).get("tags"));
      run(s, item);
      check(total(s, null) == 1 && total(s, "all") == 4, "mixed entries");
      var stats = run(s, req("stats"));
      check(
          stats.get("entities").getAsInt() == 3 && stats.get("items").getAsInt() == 1,
          "stats split");
      check(
          run(s, req("tags"))
                  .getAsJsonArray("tags")
                  .get(0)
                  .getAsJsonObject()
                  .get("count")
                  .getAsInt()
              == 4,
          "shared tags");
      var export = req("export");
      export.addProperty("all", true);
      String text = run(s, export).get("text").getAsString();
      check(
          JsonParser.parseString(text).getAsJsonObject().get("version").getAsInt() == 2,
          "schema v2 export");
      try (var other = open(dir.resolve("import/vault.json"))) {
        var imp = req("import");
        imp.addProperty("text", text);
        var imported = run(other, imp);
        check(
            imported.getAsJsonArray("results").size() == 4 && total(other, "all") == 4,
            "mixed export import");
        check(
            run(other, select("get", savedId))
                .getAsJsonArray("entries")
                .get(0)
                .getAsJsonObject()
                .get("snbt")
                .getAsString()
                .equals(canonical),
            "import typed exact");
      }
      check(s.flushNow(), "entity flushNow");
    }
    try (var s = open(path)) {
      var e = run(s, select("get", savedId)).getAsJsonArray("entries").get(0).getAsJsonObject();
      check(
          e.get("snbt").getAsString().equals(canonical)
              && e.get("note").getAsString().equals("更新备注")
              && e.getAsJsonArray("tags").size() == 1,
          "reopen global entity typed metadata");
      try (var second = open(path)) {
        rejects("STORAGE_LOCKED", () -> run(second, save("{id:'minecraft:pig'}")));
      }
    }
    JsonObject old = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
    old.addProperty("version", 1);
    var onlyItems = new JsonArray();
    for (var raw : old.getAsJsonArray("entries"))
      if (raw.getAsJsonObject().has("stack")) {
        var e = raw.getAsJsonObject().deepCopy();
        e.remove("kind");
        onlyItems.add(e);
      }
    old.add("entries", onlyItems);
    Path legacy = dir.resolve("legacy.json");
    Files.writeString(legacy, old.toString());
    try (var s = open(legacy)) {
      check(total(s, null) == 1, "v1 file no kind loads item");
    }
    try (var s = open(dir.resolve("old-import.json"))) {
      var imp = req("import");
      imp.addProperty("text", old.toString());
      run(s, imp);
      check(total(s, null) == 1, "v1 export imports item");
    }
    var many = new JsonArray();
    var template = onlyItems.get(0).getAsJsonObject();
    for (int i = 0; i < 1999; i++) {
      var e = template.deepCopy();
      e.addProperty("id", UUID.randomUUID().toString());
      many.add(e);
    }
    var root = new JsonObject();
    root.addProperty("version", 2);
    root.add("entries", many);
    Path quota = dir.resolve("quota.json");
    Files.writeString(quota, root.toString());
    try (var s = open(quota)) {
      run(s, save("{id:'minecraft:pig'}"));
      check(total(s, "all") == 2000, "combined quota accepts 2000");
      rejects("ENTRY_LIMIT", () -> run(s, save("{id:'minecraft:cow'}")));
    }
    rejects(
        "ENTRY_TOO_LARGE",
        () -> VaultEntities.validate("{id:'minecraft:pig',data:'" + "x".repeat(65537) + "'}"));
    // Every audited field is actually present, including legacy UUID halves.
    CompoundTag runtime =
        (CompoundTag)
            TagParser.create(NbtOps.INSTANCE)
                .parseFully("{id:'minecraft:pig',nested:{UUID:3L,Pos:[1f]},Age:-100}");
    for (String key : VaultEntities.strippedFields()) runtime.putInt(key, 1);
    var strippedAll = VaultEntities.validate(runtime.toString());
    check(
        strippedAll.stripped().size() == VaultEntities.strippedFields().size(),
        "all audited fields stripped and reported");
    var clean = (CompoundTag) TagParser.create(NbtOps.INSTANCE).parseFully(strippedAll.snbt());
    check(
        clean.get("nested").equals(runtime.get("nested")) && clean.getInt("Age").orElse(0) == -100,
        "nested fields and age unchanged");
    var reordered = VaultEntities.validate("{data:{b:1b,a:2L},id:'minecraft:pig'}");
    check(
        reordered
            .snbt()
            .equals(VaultEntities.validate("{id:'minecraft:pig',data:{a:2L,b:1b}}").snbt()),
        "key order canonical for dedup");
    try (var s = open(dir.resolve("concurrent.json"))) {
      var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
      try {
        var a = pool.submit(() -> run(s, save("{id:'minecraft:pig',data:1L}")));
        var b = pool.submit(() -> run(s, save("{id:'minecraft:pig',data:2L}")));
        a.get();
        b.get();
        check(s.flushNow(), "two concurrent entities flush");
      } finally {
        pool.shutdownNow();
      }
    }
    try (var s = open(dir.resolve("concurrent.json"))) {
      check(total(s, "entity") == 2, "two concurrent saves persisted");
    }
    try (var s = open(dir.resolve("migrated/vault.json"))) {
      s.migrateFrom(path);
      check(total(s, "entity") == 3 && s.flushNow(), "v2 entities migrate to global path");
    }
    var future = dir.resolve("future.json");
    Files.writeString(future, "{\"version\":3,\"entries\":[]}");
    try (var s = open(future)) {
      check(run(s, req("stats")).get("readOnly").getAsBoolean(), "future schema read only");
      rejects("STORAGE_READ_ONLY", () -> run(s, save("{id:'minecraft:pig'}")));
    }
    var futureBackup = dir.resolve("future-backup.json");
    Files.writeString(futureBackup, "{");
    Files.writeString(dir.resolve("future-backup.json.bak"), Files.readString(future));
    try (var s = open(futureBackup)) {
      check(
          run(s, req("stats")).get("readOnly").getAsBoolean()
              && Files.exists(dir.resolve("future-backup.json.bak")),
          "future backup retained read only");
    }
    var largeEntries = new JsonArray();
    for (int i = 0; i < 137; i++) {
      var e = template.deepCopy();
      e.addProperty("id", UUID.randomUUID().toString());
      e.addProperty("kind", "entity");
      e.remove("stack");
      e.addProperty(
          "snbt", "{id:'minecraft:pig',data:'" + "x".repeat(60000) + "',index:" + i + "}");
      largeEntries.add(e);
    }
    largeEntries.add(template.deepCopy());
    var largeRoot = new JsonObject();
    largeRoot.addProperty("version", 2);
    largeRoot.add("entries", largeEntries);
    var largePath = dir.resolve("bytes.json");
    Files.writeString(largePath, largeRoot.toString());
    try (var s = open(largePath)) {
      boolean capped = false;
      for (int i = 0; i < 4; i++)
        try {
          run(s, save("{id:'minecraft:pig',data:'" + "y".repeat(60000) + "',index:" + i + "}"));
        } catch (VaultStore.Failure f) {
          check(f.code.equals("FILE_LIMIT"), "combined item entity byte quota " + f.code);
          capped = true;
          break;
        }
      check(capped, "8MiB quota enforced for entities and items");
    }
    Files.createDirectories(Path.of("logs/vault-entity"));
    Files.writeString(
        Path.of("logs/vault-entity/captured.json"),
        new GsonBuilder().setPrettyPrinting().create().toJson(captures));
    System.out.println("PASS VaultEntityTest " + checks + " checks; temp=" + dir);
  }
}
