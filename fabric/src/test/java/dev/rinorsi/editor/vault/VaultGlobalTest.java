package dev.rinorsi.editor.vault;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;

/** Pure storage/schema fixtures: no Minecraft needed for machine path/migration/locking. */
public final class VaultGlobalTest {
  private static int checks;

  private static void check(boolean pass, String label) {
    if (!pass) throw new AssertionError(label);
    checks++;
    System.out.println("PASS " + label);
  }

  private static VaultStore open(Path p) {
    return new VaultStore(p, 4790, "test", null, System::currentTimeMillis);
  }

  private static JsonObject req(String op) {
    JsonObject o = new JsonObject();
    o.addProperty("op", op);
    return o;
  }

  private static VaultStore.Validator validator =
      stack -> new VaultStore.Validated(stack, "纸", "纸", new JsonObject());

  private static JsonObject save() {
    JsonObject r = req("save");
    r.addProperty("name", "旧条目");
    r.addProperty("note", "保留原说明");
    JsonArray tags = new JsonArray();
    tags.add("收藏");
    r.add("tags", tags);
    JsonObject stack = new JsonObject();
    stack.addProperty("id", "minecraft:paper");
    stack.addProperty("count", 1);
    JsonObject comps = new JsonObject();
    comps.add("custom_data", JsonParser.parseString("{\"n\":9007199254740993}"));
    stack.add("comps", comps);
    stack.add("removed", new JsonObject());
    JsonObject snbt = new JsonObject();
    snbt.addProperty("custom_data", "{n:9007199254740993L,f:0.8f,a:[L;9223372036854775807L]}");
    stack.add("component_snbt", snbt);
    r.add("stack", stack);
    return r;
  }

  private static int count(VaultStore s) {
    return s.execute(req("stats"), validator).get("entries").getAsInt();
  }

  public static void main(String[] args) throws Exception {
    if (args.length == 2 && args[0].equals("hold-lock")) {
      try (VaultStore held = open(Path.of(args[1]))) {
        System.out.println("LOCK_READY");
        System.out.flush();
        System.in.read();
      }
      return;
    }
    Path dir = Files.createTempDirectory("vault-global-");
    try (VaultStore privateLabel =
        open(dir.resolve(System.getProperty("user.name")).resolve("vault.json"))) {
      check(
          privateLabel.storageLabel().equals("…/vault.json"),
          "account-named override directory is redacted from stats");
    }
    String home = dir.resolve("home").toString();
    check(
        VaultPaths.resolve(
                null, "Windows 11", home, Map.of("APPDATA", dir.resolve("roaming").toString()))
            .equals(dir.resolve("roaming/cadeditor/vault.json")),
        "Windows APPDATA path");
    check(
        VaultPaths.resolve(null, "Windows 11", home, Map.of())
            .equals(Path.of(home, "AppData/Roaming/cadeditor/vault.json")),
        "Windows missing APPDATA fallback");
    check(
        VaultPaths.resolve(null, "Mac OS X", home, Map.of())
            .equals(Path.of(home, "Library/Application Support/cadeditor/vault.json")),
        "macOS path");
    check(
        VaultPaths.resolve(
                null, "Linux", home, Map.of("XDG_DATA_HOME", dir.resolve("xdg").toString()))
            .equals(dir.resolve("xdg/cadeditor/vault.json")),
        "XDG path");
    check(
        VaultPaths.resolve(null, "Linux", home, Map.of())
            .equals(Path.of(home, ".local/share/cadeditor/vault.json")),
        "Linux home fallback");
    String previous = System.getProperty("cadeditor.vault.dir");
    check(
        VaultPaths.resolve("custom-vault", "Windows 11", home, Map.of())
            .equals(Path.of(home, "custom-vault/vault.json")),
        "relative override anchored to home, never gameDir");
    try {
      System.setProperty("cadeditor.vault.dir", dir.resolve("override").toString());
      check(
          VaultPaths.file().equals(dir.resolve("override/vault.json")),
          "system property override independent of gameDir");
    } finally {
      if (previous == null) System.clearProperty("cadeditor.vault.dir");
      else System.setProperty("cadeditor.vault.dir", previous);
    }
    Path legacy = dir.resolve("old/config/cadeditor/vault.json");
    try (VaultStore old = open(legacy)) {
      old.execute(save(), validator);
      check(old.flushNow(), "legacy fixture persisted");
    }
    String original = Files.readString(legacy);
    Path global = dir.resolve("global/cadeditor/vault.json");
    try (VaultStore migrated = open(global)) {
      check(Files.isDirectory(global.getParent()), "global directory created automatically");
      migrated.migrateFrom(legacy);
      check(
          count(migrated) == 1 && migrated.flushNow(),
          "legacy exists new missing migrates then flushes");
      check(
          migrated.execute(req("stats"), validator).get("migration").getAsString().equals("legacy"),
          "migration success is informational, not corruption warning");
      check(
          migrated
              .execute(req("stats"), validator)
              .get("storage")
              .getAsString()
              .equals(Path.of("cadeditor/vault.json").toString()),
          "stats contains last two path levels only");
    }
    check(Files.readString(legacy).equals(original), "legacy bytes untouched");
    try (VaultStore migrated = open(global)) {
      check(count(migrated) == 1, "new global reload retained entry");
      String now = Files.readString(global);
      migrated.migrateFrom(dir.resolve("missing/vault.json"));
      check(Files.readString(global).equals(now), "old missing new existing unchanged");
      JsonObject extra = save();
      extra.addProperty("force", true);
      try (VaultStore old = open(legacy)) {
        old.execute(extra, validator);
        old.flushNow();
      }
      migrated.migrateFrom(legacy);
      check(count(migrated) == 1, "both exist different no automatic merge");
    }
    check(
        JsonParser.parseString(Files.readString(global))
            .getAsJsonObject()
            .getAsJsonArray("entries")
            .get(0)
            .getAsJsonObject()
            .getAsJsonObject("stack")
            .equals(save().get("stack")),
        "migration preserves typed sidecar and precise JSON numbers");
    Path bad = dir.resolve("bad.json");
    Files.writeString(bad, "{\"version\":1,\"entries\":[{}]}");
    Path fresh = dir.resolve("invalid-new/vault.json");
    try (VaultStore s = open(fresh)) {
      s.migrateFrom(bad);
      check(
          count(s) == 0 && !Files.exists(fresh),
          "invalid legacy does not create empty replacement vault");
      check(
          s.execute(req("stats"), validator)
              .get("warning")
              .getAsString()
              .equals("MIGRATION_FAILED"),
          "migration error visible");
    }
    check(Files.readString(bad).contains("entries"), "invalid legacy never quarantined or deleted");
    Path locked = dir.resolve("concurrent/vault.json");
    try (VaultStore first = open(locked)) {
      first.execute(save(), validator);
      first.flushNow();
      try (VaultStore second = open(locked)) {
        check(
            second
                .execute(req("stats"), validator)
                .get("warning")
                .getAsString()
                .equals("STORAGE_LOCKED"),
            "second instance sees exclusive lock and read-only state");
        try {
          second.execute(save(), validator);
          throw new AssertionError("second instance wrote");
        } catch (VaultStore.Failure expected) {
          check(expected.code.equals("STORAGE_LOCKED"), "second instance cannot overwrite first");
        }
        check(count(second) == 1, "locked instance can still read existing entries");
      }
    }
    try (VaultStore reopened = open(locked)) {
      check(
          !reopened.execute(req("stats"), validator).get("readOnly").getAsBoolean(),
          "lock released after close");
    }
    Path cross = dir.resolve("cross-process/vault.json");
    Process child =
        new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin/java.exe").toString(),
                "-cp",
                System.getProperty("java.class.path"),
                VaultGlobalTest.class.getName(),
                "hold-lock",
                cross.toString())
            .redirectErrorStream(true)
            .start();
    try {
      var ready =
          java.util.concurrent.CompletableFuture.supplyAsync(
              () -> {
                try {
                  return new java.io.BufferedReader(
                          new java.io.InputStreamReader(child.getInputStream()))
                      .readLine();
                } catch (java.io.IOException e) {
                  throw new RuntimeException(e);
                }
              });
      check(
          "LOCK_READY".equals(ready.get(10, java.util.concurrent.TimeUnit.SECONDS)),
          "child JVM acquired OS file lock");
      try (VaultStore blocked = open(cross)) {
        check(
            blocked.execute(req("stats"), validator).get("readOnly").getAsBoolean(),
            "separate JVM cannot overwrite globally locked vault");
      }
    } finally {
      child.getOutputStream().write(1);
      child.getOutputStream().flush();
      check(
          child.waitFor(10, java.util.concurrent.TimeUnit.SECONDS) && child.exitValue() == 0,
          "child JVM exits normally and releases lock");
    }
    System.out.println("PASS VaultGlobalTest " + checks + " checks; " + dir);
  }
}
