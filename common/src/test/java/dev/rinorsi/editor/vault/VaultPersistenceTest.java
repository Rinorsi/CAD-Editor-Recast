package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.StackCodec;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.CustomData;

/** Regression for immediate exit, continuous mutations, load races and null pagination. */
public final class VaultPersistenceTest {
  private static int checks;
  private static RegistryAccess registries;
  private static VaultStore.Validator validator;
  private static JsonObject saved;

  private static void check(boolean yes, String label) {
    if (!yes) throw new AssertionError(label);
    checks++;
    System.out.println("PASS " + label);
  }

  private static JsonObject request(String op) {
    JsonObject r = new JsonObject();
    r.addProperty("op", op);
    r.addProperty("requestId", "persist-" + op);
    return r;
  }

  private static VaultStore open(Path path) {
    return new VaultStore(path, 4790, "test", null, System::currentTimeMillis);
  }

  private static JsonObject call(VaultStore store, String op) {
    return store.execute(request(op), validator);
  }

  private static void rejects(String code, Runnable action) {
    try {
      action.run();
      throw new AssertionError("expected " + code);
    } catch (VaultStore.Failure e) {
      check(e.code.equals(code), "rejected " + code + ": " + e.getMessage());
    }
  }

  private static void init() {
    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();
    var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
    BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
    registries = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
    validator = stack -> VaultStacks.validate(stack, registries);
    ItemStack item = new ItemStack(Items.PAPER);
    var tag = new net.minecraft.nbt.CompoundTag();
    tag.putLong("precise", 9007199254740993L);
    tag.putFloat("fraction", 0.8f);
    tag.putLongArray("typed", new long[] {Long.MIN_VALUE, Long.MAX_VALUE});
    item.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
    saved = request("save");
    saved.addProperty("name", "退出保真");
    saved.addProperty("note", "退出前立即保存");
    JsonArray tags = new JsonArray();
    tags.add("测试");
    saved.add("tags", tags);
    saved.add("stack", StackCodec.snapshot(item, registries, new JsonObject(), ""));
  }

  private static void verify(Path path) {
    try (VaultStore reopened = open(path)) {
      JsonObject list = call(reopened, "list");
      check(list.get("total").getAsInt() >= 1, "reopen same fixed path retains entry");
      var row = list.getAsJsonArray("entries").get(0).getAsJsonObject();
      check(
          row.get("note").equals(saved.get("note")) && row.get("tags").equals(saved.get("tags")),
          "tags and note exact");
      JsonObject get = request("get");
      JsonArray ids = new JsonArray();
      ids.add(row.get("id"));
      get.add("ids", ids);
      JsonObject stack =
          reopened
              .execute(get, validator)
              .getAsJsonArray("entries")
              .get(0)
              .getAsJsonObject()
              .getAsJsonObject("stack");
      check(
          ItemStack.matches(
              StackCodec.decode(stack, registries),
              StackCodec.decode(saved.getAsJsonObject("stack"), registries)),
          "typed long float arrays exact after reopen");
    }
  }

  public static void main(String[] args) throws Exception {
    init();
    if (args.length == 2) {
      try (VaultStore s = open(Path.of(args[1]))) {
        s.execute(saved, validator);
        if (args[0].equals("immediate-halt")) Runtime.getRuntime().halt(0);
        if (args[0].equals("flush-halt")) {
          if (!s.flushNow()) throw new AssertionError("flush failed");
        } else {
          long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
          while (!call(s, "stats").get("persisted").getAsBoolean()) {
            if (System.nanoTime() > deadline) throw new AssertionError("background deadline");
            Thread.sleep(10);
          }
        }
        Runtime.getRuntime().halt(0);
      }
      return;
    }
    Path dir = Files.createTempDirectory("vault-persist-");
    for (String mode : List.of("flush-halt", "background-halt", "immediate-halt")) {
      Path path = dir.resolve(mode + ".json");
      Process process =
          new ProcessBuilder(
                  Path.of(System.getProperty("java.home"), "bin/java.exe").toString(),
                  "-cp",
                  System.getProperty("java.class.path"),
                  VaultPersistenceTest.class.getName(),
                  mode,
                  path.toString())
              .redirectErrorStream(true)
              .redirectOutput(dir.resolve(mode + ".log").toFile())
              .start();
      check(
          process.waitFor(30, TimeUnit.SECONDS) && process.exitValue() == 0,
          "actual Runtime.halt without close " + mode);
      if (mode.equals("immediate-halt")) {
        try (VaultStore reopened = open(path)) {
          int count = call(reopened, "list").get("total").getAsInt();
          check(count == 0 || count == 1, "immediate hard-kill is not guaranteed durable");
          System.out.println("EVIDENCE unflushed immediate hard kill retained=" + count + " of 1");
        }
      } else verify(path);
    }
    Path continuous = dir.resolve("continuous.json");
    try (VaultStore s = open(continuous)) {
      long start = System.nanoTime();
      for (int i = 0; i < 30; i++) {
        JsonObject r = saved.deepCopy();
        r.addProperty("force", true);
        s.execute(r, validator);
        Thread.sleep(30);
        if (i == 15)
          check(Files.exists(continuous), "continuous saves cannot postpone first 300ms deadline");
      }
      check(s.flushNow(), "disconnect/close barrier flushes pending mutations");
      check(
          call(s, "stats").get("persisted").getAsBoolean(),
          "next stats immediately reports persisted true");
      System.out.println(
          "continuous elapsed_ms=" + TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
    }
    try (VaultStore s = open(dir.resolve("offset.json"))) {
      for (String op : List.of("list", "tags", "import", "export")) {
        JsonObject r = request(op);
        if (op.equals("import")) r.add("entries", new JsonArray());
        if (op.equals("export")) r.addProperty("all", true);
        check(
            s.execute(r, validator).get("ok").getAsBoolean(), op + " missing offset defaults zero");
        r.add("offset", JsonNull.INSTANCE);
        check(s.execute(r, validator).get("ok").getAsBoolean(), op + " null offset defaults zero");
        r.addProperty("offset", -1);
        rejects("BAD_REQUEST", () -> s.execute(r, validator));
        r.addProperty("offset", Long.MAX_VALUE);
        rejects("BAD_REQUEST", () -> s.execute(r, validator));
      }
    }
    CompletableFuture<String> loading = new CompletableFuture<>();
    rejects("NOT_READY", () -> VaultStore.awaitReady(loading, 5));
    loading.complete("ready");
    check(
        VaultStore.awaitReady(loading, 5).equals("ready"),
        "NOT_READY retry sees actual completed data");
    CompletableFuture<String> failed =
        CompletableFuture.failedFuture(new java.io.IOException("disk"));
    rejects("STORAGE_FAILED", () -> VaultStore.awaitReady(failed, 5));
    Path blocker = dir.resolve("blocker");
    Files.writeString(blocker, "file");
    try (VaultStore s = open(blocker.resolve("vault.json"))) {
      s.execute(saved, validator);
      check(!s.flushNow(), "write failure never falsely acknowledges durable save");
      check(
          call(s, "stats").get("storageError").getAsString().equals("WRITE_FAILED"),
          "write failure observable");
      check(call(s, "list").get("total").getAsInt() == 1, "write failure keeps memory entry");
      Files.delete(blocker);
      Files.createDirectory(blocker);
      check(s.flushNow(), "storage becomes writable: retained entry flush retries successfully");
      check(!call(s, "stats").has("storageError"), "successful retry clears storageError");
    }
    verify(blocker.resolve("vault.json"));
    // Reproduce reported main-menu state using its actual file, read-only copy only.
    Path evidence =
        Path.of(
            "../Oriel-UI-Workspace/daily/2026-11-08/run/editor-mod-client/config/cadeditor/vault.json");
    if (Files.isRegularFile(evidence)) {
      Path copy = dir.resolve("user-copy.json");
      Files.copy(evidence, copy);
      try (VaultStore s = open(copy)) {
        VaultStore.Validator unavailable =
            stack -> {
              throw new VaultStore.Failure("UNAVAILABLE", "main menu");
            };
        JsonObject list = s.execute(request("list"), unavailable);
        System.out.println(
            "EVIDENCE main-menu copied user vault total="
                + list.get("total")
                + " persisted="
                + list.get("persisted"));
        check(
            list.get("total").getAsInt() >= 2,
            "reported user's two entries present on disk and visible without world");
      }
    }
    System.out.println("PASS VaultPersistenceTest " + checks + " checks; " + dir);
  }
}
