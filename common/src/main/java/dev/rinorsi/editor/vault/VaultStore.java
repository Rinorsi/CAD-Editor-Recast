package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.registry.search.Pinyin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;

/** Local storage. No Minecraft objects or page-selected filesystem paths cross this boundary. */
public final class VaultStore implements AutoCloseable {
  public static final int MAX_ENTRIES = 2000,
      MAX_ENTRY_BYTES = 65536,
      MAX_FILE_BYTES = 8 * 1024 * 1024;
  public static final int RESPONSE_CHARS = 24000;
  public static final long WRITE_DELAY_MS = 300, FLUSH_TIMEOUT_MS = 5000;

  public record Validated(
      JsonObject stack, String name, String translatedName, JsonObject summary) {}

  @FunctionalInterface
  public interface Validator {
    Validated validate(JsonObject stack);
  }

  public static final class Failure extends IllegalArgumentException {
    public final String code;

    public Failure(String code, String message) {
      super(message);
      this.code = code;
    }
  }

  private final Path path;
  private final ScheduledExecutorService writer;
  private final LongSupplier clock;
  private final Pinyin pinyin;
  private final LinkedHashMap<String, JsonObject> entries = new LinkedHashMap<>();

  private record Cached(JsonObject source, Validator validator, JsonObject fields) {}

  private final Map<String, Cached> cachedRows = new HashMap<>();
  private String exportKey, exportText;
  private long exportRevision = -1;
  private List<JsonObject> deleted = List.of();
  private String undoToken;
  private long undoUntil, revision, persisted;
  private ScheduledFuture<?> pending;
  private String warning = "", writeError = "";
  private String migration = "";
  private boolean readOnly;
  private java.nio.channels.FileChannel lockChannel;
  private java.nio.channels.FileLock fileLock;
  private boolean lockUnavailable;
  private final int dataVersion;
  private final String modVersion;

  public VaultStore(
      Path path, int dataVersion, String modVersion, Pinyin pinyin, LongSupplier clock) {
    this.path = path;
    this.dataVersion = dataVersion;
    this.modVersion = modVersion;
    this.pinyin = pinyin;
    this.clock = clock;
    writer =
        Executors.newSingleThreadScheduledExecutor(
            r -> {
              Thread t = new Thread(r, "cadeditor-vault-writer");
              t.setDaemon(true);
              return t;
            });
    acquireLock();
    load();
    if (lockUnavailable && readOnly) warning = "STORAGE_LOCKED";
  }

  private void acquireLock() {
    try {
      Files.createDirectories(path.toAbsolutePath().getParent());
      lockChannel =
          java.nio.channels.FileChannel.open(
              path.resolveSibling(path.getFileName() + ".lock"),
              StandardOpenOption.CREATE,
              StandardOpenOption.WRITE);
      fileLock = lockChannel.tryLock();
      if (fileLock == null) throw new IOException("另一个Minecraft实例占用保险库");
      lockUnavailable = false;
    } catch (IOException | java.nio.channels.OverlappingFileLockException failure) {
      lockUnavailable = true;
      // Missing/unwritable directories still retain editable memory and WRITE_FAILED semantics.
      if (Files.isDirectory(path.toAbsolutePath().getParent())) {
        readOnly = true;
        warning = "STORAGE_LOCKED";
      }
      if (lockChannel != null)
        try {
          lockChannel.close();
        } catch (IOException ignored) {
        }
      lockChannel = null;
    }
  }

  /** Only migrate a fully validated source; never delete or rewrite legacy files. */
  public synchronized void migrateFrom(Path legacy) {
    if (path.toAbsolutePath().normalize().equals(legacy.toAbsolutePath().normalize())
        || !Files.isRegularFile(legacy)) return;
    if (Files.exists(path) || !entries.isEmpty()) {
      try {
        if (Files.size(path) != Files.size(legacy) || Files.mismatch(path, legacy) != -1)
          System.getLogger(VaultStore.class.getName())
              .log(System.Logger.Level.INFO, "全局保险库与旧库内容不同，未自动合并；可使用merge-legacy.ps1");
      } catch (IOException ignored) {
      }
      return;
    }
    if (readOnly || lockUnavailable) return;
    try {
      readFile(legacy);
      migration = "legacy";
      System.getLogger(VaultStore.class.getName())
          .log(System.Logger.Level.INFO, "已迁移当前旧保险库到全局目录，旧文件保留");
      changed();
    } catch (IOException | RuntimeException invalid) {
      entries.clear();
      warning = "MIGRATION_FAILED";
      System.getLogger(VaultStore.class.getName())
          .log(System.Logger.Level.WARNING, "旧保险库迁移失败，原文件未修改：" + invalid);
    }
  }

  public String storageLabel() {
    Path absolute = path.toAbsolutePath().normalize();
    int n = absolute.getNameCount();
    String parent = n >= 2 ? absolute.getName(n - 2).toString() : "";
    String account = System.getProperty("user.name", "");
    Path home = Path.of(System.getProperty("user.home", "."));
    if (parent.equalsIgnoreCase(account)
        || (home.getFileName() != null && parent.equalsIgnoreCase(home.getFileName().toString())))
      return "…/" + absolute.getFileName();
    return absolute.subpath(Math.max(0, n - 2), n).toString();
  }

  private Path backup() {
    return path.resolveSibling(path.getFileName() + ".bak");
  }

  private static int bytes(String text) {
    return text.getBytes(StandardCharsets.UTF_8).length;
  }

  private static Failure fail(String code, String reason) {
    return new Failure(code, reason);
  }

  public static String text(JsonObject o, String key, String fallback, int max) {
    if (!o.has(key)) {
      if (fallback.length() > max) throw fail("BAD_REQUEST", key + " 默认值超出长度限制");
      return fallback;
    }
    JsonElement v = o.get(key);
    if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString())
      throw fail("BAD_REQUEST", key + " 必须为文本");
    String s = v.getAsString();
    if (s.length() > max || s.chars().anyMatch(c -> c == 0))
      throw fail("BAD_REQUEST", key + " 超出长度限制");
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (Character.isHighSurrogate(c)) {
        if (++i >= s.length() || !Character.isLowSurrogate(s.charAt(i)))
          throw fail("BAD_REQUEST", "无效 Unicode");
      } else if (Character.isLowSurrogate(c)) throw fail("BAD_REQUEST", "无效 Unicode");
    }
    return s;
  }

  private static int integer(JsonObject o, String key, int fallback, int min, int max) {
    if (!o.has(key) || (key.equals("offset") && o.get(key).isJsonNull())) return fallback;
    try {
      var v = o.get(key);
      if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isNumber())
        throw new ArithmeticException();
      int n = v.getAsBigDecimal().intValueExact();
      if (n < min || n > max) throw new ArithmeticException();
      return n;
    } catch (RuntimeException e) {
      throw fail("BAD_REQUEST", key + " 必须为 " + min + " 到 " + max + " 的整数");
    }
  }

  private static boolean bool(JsonObject o, String key) {
    if (!o.has(key)) return false;
    var v = o.get(key);
    if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isBoolean())
      throw fail("BAD_REQUEST", key + " 必须为布尔值");
    return v.getAsBoolean();
  }

  private static String uuid(String id) {
    try {
      if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException();
      return id;
    } catch (RuntimeException e) {
      throw fail("BAD_ID", "无效的保险库条目 ID");
    }
  }

  private static JsonArray tags(JsonObject o) {
    JsonArray out = new JsonArray();
    if (!o.has("tags")) return out;
    var v = o.get("tags");
    if (!v.isJsonArray() || v.getAsJsonArray().size() > 8) throw fail("BAD_REQUEST", "最多8个标签");
    Set<String> seen = new HashSet<>();
    for (var t : v.getAsJsonArray()) {
      if (!t.isJsonPrimitive() || !t.getAsJsonPrimitive().isString())
        throw fail("BAD_REQUEST", "标签必须为文本");
      String s = t.getAsString().strip();
      if (s.isEmpty() || s.length() > 24) throw fail("BAD_REQUEST", "标签长度为1到24");
      if (seen.add(s)) out.add(s);
    }
    return out;
  }

  private static List<String> ids(JsonObject o, int max) {
    if (!o.has("ids") || !o.get("ids").isJsonArray() || o.getAsJsonArray("ids").size() > max)
      throw fail("BAD_REQUEST", "ids 数量无效");
    List<String> out = new ArrayList<>();
    for (var id : o.getAsJsonArray("ids")) {
      if (!id.isJsonPrimitive() || !id.getAsJsonPrimitive().isString())
        throw fail("BAD_ID", "ID 必须为文本");
      String s = uuid(id.getAsString());
      if (!out.contains(s)) out.add(s);
    }
    return out;
  }

  private static JsonObject object(JsonObject o, String key) {
    if (!o.has(key) || !o.get(key).isJsonObject()) throw fail("BAD_REQUEST", key + " 必须为对象");
    return o.getAsJsonObject(key);
  }

  private JsonObject require(String id) {
    JsonObject e = entries.get(uuid(id));
    if (e == null) throw fail("NOT_FOUND", "保险库条目不存在");
    return e;
  }

  public synchronized JsonObject stack(String id) {
    JsonObject e = require(id);
    if (kind(e).equals("entity")) throw fail("wrong_kind", "生物条目不能作为物品取出");
    return object(e, "stack").deepCopy();
  }

  private JsonObject envelope(Collection<JsonObject> values) {
    JsonObject out = new JsonObject();
    out.addProperty("version", 2);
    JsonArray a = new JsonArray();
    values.forEach(a::add);
    out.add("entries", a);
    return out;
  }

  private void checkQuota(Collection<JsonObject> values) {
    if (values.size() > MAX_ENTRIES) throw fail("ENTRY_LIMIT", "保险库最多2000个条目");
    for (var e : values)
      if (bytes(e.toString()) > MAX_ENTRY_BYTES) throw fail("ENTRY_TOO_LARGE", "单个条目最多64KiB");
    if (bytes(envelope(values).toString()) > MAX_FILE_BYTES)
      throw fail("FILE_LIMIT", "保险库文件最多8MiB");
  }

  private void put(JsonObject e) {
    if (readOnly)
      throw fail(
          lockUnavailable ? "STORAGE_LOCKED" : "STORAGE_READ_ONLY", "保险库只读：其他实例占用、目录权限不足或文件版本较新");
    LinkedHashMap<String, JsonObject> candidate = new LinkedHashMap<>(entries);
    candidate.put(e.get("id").getAsString(), e);
    checkQuota(candidate.values());
    entries.clear();
    entries.putAll(candidate);
    changed();
  }

  private void changed() {
    cachedRows.keySet().retainAll(entries.keySet());
    exportText = null;
    revision++;
    // First-dirty deadline, not trailing debounce: continuous saves cannot postpone disk forever.
    if (pending == null || pending.isDone())
      pending = writer.schedule(this::write, WRITE_DELAY_MS, TimeUnit.MILLISECONDS);
  }

  private void load() {
    if (!Files.exists(path) && !Files.exists(backup())) return;
    try {
      readFile(path);
      return;
    } catch (Exception e) {
      warning = "CORRUPT_PRIMARY";
      if (e instanceof Failure f && f.code.equals("SCHEMA_VERSION")) {
        readOnly = true;
        warning = "SCHEMA_VERSION";
        return;
      }
      quarantine(path);
    }
    try {
      readFile(backup());
      if (!readOnly) warning = "RECOVERED_BACKUP";
      changed();
    } catch (Exception e) {
      if (e instanceof Failure f && f.code.equals("SCHEMA_VERSION")) {
        readOnly = true;
        warning = "SCHEMA_VERSION";
        return;
      }
      quarantine(backup());
      if (!readOnly) warning = "RECOVERY_EMPTY";
      if (!readOnly) changed();
    }
  }

  private void quarantine(Path bad) {
    if (lockUnavailable) return;
    try {
      if (Files.exists(bad))
        Files.move(
            bad,
            bad.resolveSibling(
                bad.getFileName()
                    + ".corrupt-"
                    + System.currentTimeMillis()
                    + "-"
                    + UUID.randomUUID()));
    } catch (IOException e) {
      readOnly = true;
      warning = "QUARANTINE_FAILED";
    }
  }

  private void readFile(Path source) throws IOException {
    if (Files.size(source) > MAX_FILE_BYTES) throw fail("FILE_LIMIT", "文件过大");
    JsonObject root = parse(Files.readString(source));
    if (!Set.of(1, 2).contains(integer(root, "version", 0, 0, Integer.MAX_VALUE)))
      throw fail("SCHEMA_VERSION", "不支持的保险库文件版本");
    if (!root.has("entries") || !root.get("entries").isJsonArray())
      throw fail("BAD_REQUEST", "缺少 entries");
    LinkedHashMap<String, JsonObject> read = new LinkedHashMap<>();
    for (var raw : root.getAsJsonArray("entries")) {
      JsonObject e = raw.getAsJsonObject().deepCopy();
      validateStored(e);
      String id = e.get("id").getAsString();
      if (read.put(id, e) != null) throw fail("BAD_ID", "重复 ID");
    }
    checkQuota(read.values());
    entries.clear();
    entries.putAll(read);
  }

  private static void validateStored(JsonObject e) {
    for (String key :
        List.of("id", "name", "tags", "note", "created", "updated", "mcDataVersion", "modVersion"))
      if (!e.has(key)) throw fail("BAD_REQUEST", "缺少条目字段：" + key);
    uuid(text(e, "id", "", 36));
    text(e, "name", "", 256);
    text(e, "note", "", 200);
    e.add("tags", tags(e));
    for (String k : List.of("created", "updated"))
      try {
        if (!e.get(k).isJsonPrimitive()
            || !e.getAsJsonPrimitive(k).isNumber()
            || e.get(k).getAsBigDecimal().longValueExact() < 0) throw new ArithmeticException();
      } catch (RuntimeException bad) {
        throw fail("BAD_REQUEST", "时间戳必须为非负整数");
      }
    e.addProperty("kind", kind(e));
    text(e, "modVersion", "", 128);
    integer(e, "mcDataVersion", 0, 0, Integer.MAX_VALUE);
    if (kind(e).equals("entity")) {
      var valid = VaultEntities.validate(text(e, "snbt", "", MAX_FILE_BYTES));
      e.addProperty("snbt", valid.snbt());
      e.addProperty("hash", entityHash(valid.snbt()));
      e.remove("stack");
      return;
    }
    JsonObject stack = object(e, "stack");
    if (!stack.has("count")) throw fail("BAD_REQUEST", "缺少stack.count");
    if (!text(stack, "id", "", 256).matches("[a-z0-9_.-]+:[a-z0-9_./-]+"))
      throw fail("BAD_REQUEST", "无效物品 ID");
    integer(stack, "count", 1, 1, 99);
    object(stack, "comps");
    object(stack, "removed");
    for (String key : List.of("component_snbt", "component_formats"))
      if (stack.has(key))
        for (var entry : object(stack, key).entrySet())
          if (!entry.getValue().isJsonPrimitive()
              || !entry.getValue().getAsJsonPrimitive().isString())
            throw fail("BAD_REQUEST", "组件格式/SNBT必须为文本");
    text(e, "modVersion", "", 128);
    integer(e, "mcDataVersion", 0, 0, Integer.MAX_VALUE);
  }

  public static JsonObject parse(String text) {
    if (bytes(text) > MAX_FILE_BYTES) throw fail("FILE_LIMIT", "导入最多8MiB");
    int depth = 0;
    boolean quote = false, escape = false;
    for (char c : text.toCharArray()) {
      if (quote) {
        if (escape) escape = false;
        else if (c == '\\') escape = true;
        else if (c == '"') quote = false;
      } else if (c == '"') quote = true;
      else if (c == '{' || c == '[') {
        if (++depth > 96) throw fail("BAD_REQUEST", "JSON 嵌套过深");
      } else if (c == '}' || c == ']') depth--;
    }
    try (var reader = new com.google.gson.stream.JsonReader(new StringReader(text))) {
      reader.setStrictness(Strictness.STRICT);
      var root = JsonParser.parseReader(reader);
      if (reader.peek() != com.google.gson.stream.JsonToken.END_DOCUMENT || !root.isJsonObject())
        throw fail("BAD_REQUEST", "JSON 必须为对象");
      return root.getAsJsonObject();
    } catch (IOException | JsonParseException e) {
      throw fail("BAD_REQUEST", "JSON 无效");
    }
  }

  private void write() {
    JsonObject snapshot;
    long captured;
    synchronized (this) {
      pending = null;
      if (revision == persisted || readOnly) return;
      // Stored entries are immutable after publication: updates always replace a copy.
      // Only the small envelope/list is copied under the lock, never the entire file.
      snapshot = envelope(entries.values());
      captured = revision;
    }
    Path temp = null;
    try {
      if (lockUnavailable && !readOnly) acquireLock();
      if (lockUnavailable) throw new IOException("无法取得保险库独占文件锁");
      Files.createDirectories(path.getParent());
      temp = Files.createTempFile(path.getParent(), "vault-", ".tmp");
      byte[] encoded = snapshot.toString().getBytes(StandardCharsets.UTF_8);
      try (var file = java.nio.channels.FileChannel.open(temp, StandardOpenOption.WRITE)) {
        java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(encoded);
        while (buffer.hasRemaining()) file.write(buffer);
        file.force(true);
      }
      // The backup is also replaced atomically. A crash never exposes a half-copied backup.
      if (Files.exists(path)) {
        Path bakTemp = Files.createTempFile(path.getParent(), "vault-bak-", ".tmp");
        try {
          Files.copy(path, bakTemp, StandardCopyOption.REPLACE_EXISTING);
          Files.move(
              bakTemp,
              backup(),
              StandardCopyOption.ATOMIC_MOVE,
              StandardCopyOption.REPLACE_EXISTING);
        } finally {
          Files.deleteIfExists(bakTemp);
        }
      }
      Files.move(temp, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      synchronized (this) {
        persisted = captured;
        writeError = "";
      }
    } catch (IOException | RuntimeException e) {
      synchronized (this) {
        if (writeError.isEmpty())
          System.getLogger(VaultStore.class.getName())
              .log(System.Logger.Level.WARNING, "WRITE_FAILED：保险库尚未落盘，保留内存数据并重试：" + e);
        writeError = "WRITE_FAILED";
        if (!writer.isShutdown()) pending = writer.schedule(this::write, 2, TimeUnit.SECONDS);
      }
    } finally {
      if (temp != null)
        try {
          Files.deleteIfExists(temp);
        } catch (IOException ignored) {
        }
    }
  }

  public void flush() {
    flushNow();
  }

  /** Bounded synchronous barrier; false is observable failure, never a false durable receipt. */
  public boolean flushNow() {
    Future<?> barrier;
    synchronized (this) {
      if (pending != null) pending.cancel(false);
      pending = null;
      if (writer.isShutdown()) return persisted == revision;
      barrier = writer.submit(this::write);
    }
    try {
      barrier.get(FLUSH_TIMEOUT_MS, TimeUnit.MILLISECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    } catch (ExecutionException | TimeoutException e) {
      synchronized (this) {
        writeError = e instanceof TimeoutException ? "FLUSH_TIMEOUT" : "WRITE_FAILED";
      }
      System.getLogger(VaultStore.class.getName())
          .log(System.Logger.Level.WARNING, "保险库退出落盘失败：" + e);
      return false;
    }
    synchronized (this) {
      return persisted == revision;
    }
  }

  public void close() {
    synchronized (this) {
      if (pending != null) pending.cancel(false);
    }
    flush();
    writer.shutdown();
    try {
      if (writer.awaitTermination(FLUSH_TIMEOUT_MS, TimeUnit.MILLISECONDS)) releaseLock();
      else {
        Thread release =
            new Thread(
                () -> {
                  try {
                    while (!writer.awaitTermination(1, TimeUnit.DAYS)) {}
                    releaseLock();
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                  }
                },
                "vault-lock-release");
        release.setDaemon(true);
        release.start();
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private void releaseLock() {
    try {
      if (fileLock != null) fileLock.release();
      if (lockChannel != null) lockChannel.close();
    } catch (IOException e) {
      System.getLogger(VaultStore.class.getName())
          .log(System.Logger.Level.WARNING, "保险库文件锁关闭失败：" + e);
    }
  }

  public static <T> T awaitReady(CompletableFuture<T> future, long timeoutMs) {
    try {
      return future.get(timeoutMs, TimeUnit.MILLISECONDS);
    } catch (TimeoutException e) {
      throw fail("NOT_READY", "保险库仍在加载，请在250毫秒后重试；当前结果不代表空库");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw fail("NOT_READY", "保险库加载等待被中断，请重试");
    } catch (ExecutionException e) {
      throw fail("STORAGE_FAILED", "保险库加载失败：" + reason(e));
    }
  }

  private static JsonElement sorted(JsonElement e) {
    if (e.isJsonObject()) {
      JsonObject o = new JsonObject();
      e.getAsJsonObject().keySet().stream()
          .sorted()
          .forEach(k -> o.add(k, sorted(e.getAsJsonObject().get(k))));
      return o;
    }
    if (e.isJsonArray()) {
      JsonArray a = new JsonArray();
      e.getAsJsonArray().forEach(v -> a.add(sorted(v)));
      return a;
    }
    return e;
  }

  private static String hash(JsonObject stack) {
    JsonObject typed = new JsonObject();
    for (String k : List.of("id", "count", "comps", "component_snbt", "removed"))
      if (stack.has(k)) typed.add(k, stack.get(k));
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(sorted(typed).toString().getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new AssertionError(e);
    }
  }

  private Validated validate(Validator validator, JsonObject stack) {
    try {
      return validator.validate(stack.deepCopy());
    } catch (Failure e) {
      throw e;
    } catch (RuntimeException e) {
      throw fail("INVALID_STACK", reason(e));
    }
  }

  public static String reason(Exception e) {
    String s = e.getMessage();
    if (s == null) s = e.getClass().getSimpleName();
    return s.substring(0, Math.min(512, s.length()));
  }

  private static String kind(JsonObject e) {
    String k = text(e, "kind", "item", 16);
    if (!Set.of("item", "entity").contains(k)) throw fail("BAD_REQUEST", "kind必须为item或entity");
    return k;
  }

  private static String entityHash(String snbt) {
    JsonObject o = new JsonObject();
    o.addProperty("id", "entity");
    o.addProperty("comps", snbt);
    return hash(o);
  }

  private JsonObject row(JsonObject stored, Validator validator, boolean full) {
    JsonObject out = new JsonObject();
    stored
        .entrySet()
        .forEach(
            e -> {
              if (!e.getKey().equals("hash")
                  && (full || (!e.getKey().equals("stack") && !e.getKey().equals("snbt"))))
                out.add(e.getKey(), e.getValue().deepCopy());
            });
    out.addProperty("kind", kind(stored));
    if (kind(stored).equals("entity")) {
      String entryId = stored.get("id").getAsString();
      Cached cached = cachedRows.get(entryId);
      if (cached == null || cached.source() != stored || cached.validator() != validator) {
        var valid = VaultEntities.validate(stored.get("snbt").getAsString());
        JsonObject fields = new JsonObject(), entity = new JsonObject();
        entity.addProperty("id", valid.id());
        fields.add("entity", entity);
        fields.add("summary", valid.summary());
        fields.addProperty("translatedName", valid.name());
        boolean known = VaultEntities.registered(valid.id());
        fields.addProperty("compatibility", known);
        if (!known) fields.addProperty("compatibilityUnknown", true);
        cached = new Cached(stored, validator, fields);
        cachedRows.put(entryId, cached);
      }
      cached.fields().entrySet().forEach(e -> out.add(e.getKey(), e.getValue().deepCopy()));
      return out;
    }
    JsonObject stack = object(stored, "stack");
    JsonObject item = new JsonObject();
    item.add("id", stack.get("id"));
    item.add("count", stack.get("count"));
    out.add("item", item);
    String id = stored.get("id").getAsString();
    Cached cached = cachedRows.get(id);
    if (cached == null || cached.source() != stored || cached.validator() != validator) {
      JsonObject fields = new JsonObject();
      try {
        var valid = validate(validator, stack);
        fields.add("summary", valid.summary());
        fields.addProperty("translatedName", valid.translatedName());
      } catch (Failure e) {
        fields.addProperty(
            e.code.equals("UNAVAILABLE") ? "compatibilityUnknown" : "incompatible", true);
        fields.addProperty("reason", e.getMessage());
      }
      cached = new Cached(stored, validator, fields);
      cachedRows.put(id, cached);
    }
    cached.fields().entrySet().forEach(e -> out.add(e.getKey(), e.getValue().deepCopy()));
    if (!full) out.remove("stack");
    return out;
  }

  /** Client tick preflight: bound first-open/version/language compatibility work per tick. */
  public synchronized boolean warm(Validator validator, int budget) {
    for (var e : entries.values()) {
      Cached c = cachedRows.get(e.get("id").getAsString());
      if (c == null || c.source() != e || c.validator() != validator) {
        if (budget-- <= 0) return false;
        row(e, validator, false);
      }
    }
    return true;
  }

  public synchronized void invalidateRows() {
    cachedRows.clear();
  }

  private JsonObject saveEntity(JsonObject request, Validator validator) {
    var valid = VaultEntities.validate(text(request, "snbt", "", MAX_FILE_BYTES));
    String digest = entityHash(valid.snbt());
    JsonObject e = null;
    if (!bool(request, "force"))
      for (var candidate : entries.values())
        if (kind(candidate).equals("entity")
            && digest.equals(candidate.get("hash").getAsString())) {
          e = candidate;
          break;
        }
    boolean duplicate = e != null;
    if (!duplicate) {
      e = new JsonObject();
      e.addProperty("id", UUID.randomUUID().toString());
      e.addProperty("kind", "entity");
      e.addProperty("snbt", valid.snbt());
      e.addProperty("hash", digest);
      String name = text(request, "name", valid.name(), 256).strip();
      e.addProperty("name", name.isEmpty() ? valid.name() : name);
      e.add("tags", tags(request));
      e.addProperty("note", text(request, "note", "", 200));
      e.addProperty("created", clock.getAsLong());
      e.addProperty("updated", clock.getAsLong());
      e.addProperty("mcDataVersion", dataVersion);
      e.addProperty("modVersion", modVersion);
      put(e);
    }
    JsonObject out = new JsonObject();
    out.add("entry", row(e, validator, false));
    out.addProperty("duplicate", duplicate);
    out.add("stripped", valid.stripped());
    out.add("warnings", valid.warnings());
    return out;
  }

  private JsonObject save(JsonObject request, Validator validator) {
    if (kind(request).equals("entity")) return saveEntity(request, validator);
    if (bytes(object(request, "stack").toString()) > MAX_ENTRY_BYTES)
      throw fail("ENTRY_TOO_LARGE", "单个条目最多64KiB");
    Validated valid = validate(validator, object(request, "stack"));
    String digest = hash(valid.stack());
    if (!bool(request, "force"))
      for (var e : entries.values())
        if (kind(e).equals("item") && digest.equals(hash(object(e, "stack")))) {
          JsonObject out = new JsonObject();
          out.add("entry", row(e, validator, false));
          out.addProperty("duplicate", true);
          return out;
        }
    JsonObject e = new JsonObject();
    e.addProperty("id", UUID.randomUUID().toString());
    String name = text(request, "name", valid.name(), 256).strip();
    e.addProperty("name", name.isEmpty() ? valid.name() : name);
    e.add("tags", tags(request));
    e.addProperty("note", text(request, "note", "", 200));
    long now = clock.getAsLong();
    e.addProperty("created", now);
    e.addProperty("updated", now);
    e.addProperty("mcDataVersion", dataVersion);
    e.addProperty("modVersion", modVersion);
    e.addProperty("kind", "item");
    e.add("stack", valid.stack().deepCopy());
    e.addProperty("hash", digest);
    put(e);
    JsonObject out = new JsonObject();
    out.add("entry", row(e, validator, false));
    out.addProperty("duplicate", false);
    return out;
  }

  /** Detached replies; synchronization serializes two quick saves and writer snapshots. */
  public synchronized JsonObject execute(JsonObject request, Validator validator) {
    checkDepth(request);
    String op = text(request, "op", "", 32);
    JsonObject out = new JsonObject();
    if (readOnly
        && Set.of("save", "update", "delete", "restore", "duplicate", "import").contains(op))
      throw fail(
          lockUnavailable ? "STORAGE_LOCKED" : "STORAGE_READ_ONLY", "保险库只读：其他实例占用、目录权限不足或文件版本较新");
    switch (op) {
      case "save" -> out = save(request, validator);
      case "list" -> {
        String filter = text(request, "kind", "item", 16);
        if (!Set.of("item", "entity", "all").contains(filter))
          throw fail("BAD_REQUEST", "kind必须为item、entity或all");
        String query = text(request, "query", "", 128).toLowerCase(Locale.ROOT).strip();
        JsonArray wanted = tags(request);
        int offset = integer(request, "offset", 0, 0, MAX_ENTRIES),
            limit = integer(request, "limit", 40, 1, 100);
        String sort = text(request, "sort", "recent", 16);
        if (!Set.of("recent", "name", "item").contains(sort)) throw fail("BAD_REQUEST", "sort 无效");
        List<JsonObject> rows = new ArrayList<>();
        for (var e : entries.values()) {
          if (!filter.equals("all") && !filter.equals(kind(e))) continue;
          boolean matches = true;
          for (var t : wanted)
            if (!e.getAsJsonArray("tags").contains(t)) {
              matches = false;
              break;
            }
          if (!matches) continue;
          JsonObject r = row(e, validator, false);
          String hay =
              (text(e, "name", "", 256)
                      + " "
                      + text(e, "note", "", 200)
                      + " "
                      + e.get("tags")
                      + " "
                      + (kind(e).equals("entity")
                          ? r.getAsJsonObject("entity").get("id").getAsString()
                          : object(e, "stack").get("id").getAsString())
                      + " "
                      + text(r, "translatedName", "", 256))
                  .toLowerCase(Locale.ROOT);
          if (query.isEmpty()
              || hay.contains(query)
              || (pinyin != null && pinyin.matches(hay, query))) rows.add(r);
        }
        Comparator<JsonObject> cmp =
            switch (sort) {
              case "name" ->
                  Comparator.comparing(
                      e -> e.get("name").getAsString(), String.CASE_INSENSITIVE_ORDER);
              case "item" ->
                  Comparator.comparing(
                      e ->
                          e.getAsJsonObject(kind(e).equals("entity") ? "entity" : "item")
                              .get("id")
                              .getAsString());
              default ->
                  Comparator.<JsonObject>comparingLong(e -> e.get("updated").getAsLong())
                      .reversed();
            };
        rows.sort(cmp.thenComparing(e -> e.get("id").getAsString()));
        JsonArray page = new JsonArray();
        int size = 0;
        for (int i = offset; i < rows.size() && page.size() < limit; i++) {
          int n = rows.get(i).toString().length();
          if (size + n > 20000) break;
          page.add(rows.get(i));
          size += n;
        }
        out.add("entries", page);
        out.addProperty("total", rows.size());
        out.addProperty("offset", offset);
        out.addProperty("nextOffset", offset + page.size());
        out.addProperty("done", offset + page.size() >= rows.size());
      }
      case "get" -> {
        JsonArray found = new JsonArray(), missing = new JsonArray();
        for (String id : ids(request, 32)) {
          var e = entries.get(id);
          if (e == null) missing.add(id);
          else found.add(row(e, validator, true));
        }
        out.add("entries", found);
        out.add("missing", missing);
        if (out.toString().length() > 22000)
          throw fail("RESPONSE_LIMIT", "完整条目过大，请使用 export 分页文本读取");
      }
      case "update" -> {
        JsonObject e = require(text(request, "id", "", 36)).deepCopy();
        if (request.has("name")) {
          String n = text(request, "name", "", 256).strip();
          if (n.isEmpty()) throw fail("BAD_REQUEST", "名称不能为空");
          e.addProperty("name", n);
        }
        if (request.has("tags")) e.add("tags", tags(request));
        if (request.has("note")) e.addProperty("note", text(request, "note", "", 200));
        e.addProperty("updated", clock.getAsLong());
        put(e);
        out.add("entry", row(e, validator, false));
      }
      case "delete" -> {
        List<String> ids = ids(request, 50);
        List<JsonObject> removed = new ArrayList<>();
        for (String id : ids) removed.add(require(id));
        for (String id : ids) entries.remove(id);
        deleted = List.copyOf(removed);
        undoToken = UUID.randomUUID().toString();
        undoUntil = clock.getAsLong() + 30000;
        changed();
        out.addProperty("deleted", removed.size());
        out.addProperty("token", undoToken);
        out.addProperty("expires", undoUntil);
      }
      case "restore" -> {
        if (undoToken == null
            || !undoToken.equals(text(request, "token", "", 36))
            || clock.getAsLong() >= undoUntil) throw fail("UNDO_EXPIRED", "撤销已过期");
        var candidate = new LinkedHashMap<>(entries);
        for (var e : deleted) {
          String id = e.get("id").getAsString();
          if (candidate.containsKey(id)) throw fail("ID_CONFLICT", "撤销条目 ID 已被占用");
          candidate.put(id, e);
        }
        checkQuota(candidate.values());
        entries.clear();
        entries.putAll(candidate);
        out.addProperty("restored", deleted.size());
        deleted = List.of();
        undoToken = null;
        changed();
      }
      case "duplicate" -> {
        JsonObject e = require(text(request, "id", "", 36)).deepCopy();
        e.addProperty("id", UUID.randomUUID().toString());
        long now = clock.getAsLong();
        e.addProperty("created", now);
        e.addProperty("updated", now);
        put(e);
        out.add("entry", row(e, validator, false));
      }
      case "import" -> {
        JsonObject root =
            request.has("text") ? parse(text(request, "text", "", MAX_FILE_BYTES)) : request;
        if (!Set.of(1, 2).contains(integer(root, "version", 1, 1, Integer.MAX_VALUE)))
          throw fail("SCHEMA_VERSION", "导入版本不支持");
        if (!root.has("entries") || !root.get("entries").isJsonArray())
          throw fail("BAD_REQUEST", "缺少 entries");
        JsonArray input = root.getAsJsonArray("entries");
        if (input.size() > MAX_ENTRIES) throw fail("ENTRY_LIMIT", "导入最多2000项");
        int offset = integer(request, "offset", 0, 0, MAX_ENTRIES),
            limit = integer(request, "limit", 32, 1, 32);
        JsonArray results = new JsonArray();
        for (int i = offset; i < input.size() && results.size() < limit; i++) {
          // Reserve enough space for a maximally escaped 512-character Codec reason.
          if (results.toString().length() > 18000) break;
          JsonObject result = new JsonObject();
          result.addProperty("index", i);
          try {
            JsonObject e = input.get(i).getAsJsonObject().deepCopy();
            if (kind(e).equals("entity")) {
              var valid = VaultEntities.validate(text(e, "snbt", "", MAX_FILE_BYTES));
              result.add("stripped", valid.stripped());
              result.add("warnings", valid.warnings());
              if (!VaultEntities.registered(valid.id()))
                result.addProperty("compatibilityUnknown", true);
            }
            validateStored(e);
            String id = e.get("id").getAsString();
            if (entries.containsKey(id)) throw fail("ID_CONFLICT", "ID 已存在");
            // Preserve incompatible stacks verbatim; importing never silently migrates them.
            try {
              if (kind(e).equals("item")) {
                var v = validate(validator, object(e, "stack"));
                e.add("stack", v.stack());
                e.addProperty("hash", hash(v.stack()));
              }
            } catch (Failure bad) {
              result.addProperty(
                  bad.code.equals("UNAVAILABLE") ? "compatibilityUnknown" : "incompatible", true);
              result.addProperty("reason", bad.getMessage());
              e.remove("hash");
            }
            put(e);
            result.addProperty("ok", true);
            result.addProperty("id", id);
          } catch (RuntimeException bad) {
            result.addProperty("ok", false);
            result.addProperty("error", bad instanceof Failure f ? f.code : "BAD_REQUEST");
            result.addProperty("reason", reason(bad));
          }
          results.add(result);
        }
        out.add("results", results);
        out.addProperty("nextOffset", offset + results.size());
        out.addProperty("done", offset + results.size() >= input.size());
      }
      case "export" -> {
        boolean allEntries = bool(request, "all");
        List<String> selectedIds = allEntries ? List.of() : ids(request, MAX_ENTRIES);
        String key = allEntries ? "*" : String.join(",", selectedIds);
        if (exportText == null || exportRevision != revision || !key.equals(exportKey)) {
          List<JsonObject> selected = new ArrayList<>();
          if (allEntries) selected.addAll(entries.values());
          else for (String id : selectedIds) selected.add(require(id));
          exportText =
              envelope(
                      selected.stream()
                          .map(
                              e -> {
                                JsonObject copy = e.deepCopy();
                                copy.remove("hash");
                                return copy;
                              })
                          .toList())
                  .toString();
          exportKey = key;
          exportRevision = revision;
        }
        String all = exportText;
        int offset = integer(request, "offset", 0, 0, all.length()),
            limit = integer(request, "limit", 6000, 1, 6000);
        if (offset > 0
            && offset < all.length()
            && Character.isLowSurrogate(all.charAt(offset))
            && Character.isHighSurrogate(all.charAt(offset - 1)))
          throw fail("BAD_REQUEST", "offset不能切开Unicode字符");
        int end = Math.min(all.length(), offset + limit);
        if (end < all.length()
            && end > 0
            && Character.isHighSurrogate(all.charAt(end - 1))
            && Character.isLowSurrogate(all.charAt(end))) end++;
        out.addProperty("text", all.substring(offset, end));
        out.addProperty("offset", offset);
        out.addProperty("nextOffset", end);
        out.addProperty("total", all.length());
        out.addProperty("done", end == all.length());
        out.addProperty("revision", revision);
      }
      case "tags" -> {
        Map<String, Integer> counts = new TreeMap<>();
        entries
            .values()
            .forEach(
                e ->
                    e.getAsJsonArray("tags")
                        .forEach(t -> counts.merge(t.getAsString(), 1, Integer::sum)));
        JsonArray a = new JsonArray();
        int offset = integer(request, "offset", 0, 0, MAX_ENTRIES * 8),
            limit = integer(request, "limit", 100, 1, 100);
        counts.entrySet().stream()
            .skip(offset)
            .limit(limit)
            .forEach(
                t -> {
                  JsonObject r = new JsonObject();
                  r.addProperty("name", t.getKey());
                  r.addProperty("count", t.getValue());
                  a.add(r);
                });
        out.add("tags", a);
        out.addProperty("total", counts.size());
        out.addProperty("nextOffset", offset + a.size());
        out.addProperty("done", offset + a.size() >= counts.size());
      }
      case "stats" -> {
        out.addProperty("storage", storageLabel());
        if (!migration.isEmpty()) out.addProperty("migration", migration);
        out.addProperty("entries", entries.size());
        long entities = entries.values().stream().filter(e -> kind(e).equals("entity")).count();
        out.addProperty("entities", entities);
        out.addProperty("items", entries.size() - entities);
        out.addProperty("bytes", bytes(envelope(entries.values()).toString()));
        out.addProperty("maxEntries", MAX_ENTRIES);
        out.addProperty("maxEntryBytes", MAX_ENTRY_BYTES);
        out.addProperty("maxFileBytes", MAX_FILE_BYTES);
      }
      default -> throw fail("UNKNOWN_OP", "未知的保险库操作");
    }
    out.addProperty("ok", true);
    out.addProperty("version", 1);
    out.addProperty("op", op);
    out.addProperty("requestId", text(request, "requestId", "", 128));
    out.addProperty("revision", revision);
    out.addProperty("persisted", persisted == revision);
    out.addProperty("readOnly", readOnly);
    if (!warning.isEmpty()) out.addProperty("warning", warning);
    if (!writeError.isEmpty()) out.addProperty("storageError", writeError);
    if (out.toString().length() > RESPONSE_CHARS) throw fail("RESPONSE_LIMIT", "响应超过24000字符");
    return out;
  }

  public static void checkDepth(JsonElement value) {
    record Node(JsonElement value, int depth) {}
    ArrayDeque<Node> todo = new ArrayDeque<>();
    todo.add(new Node(value, 0));
    while (!todo.isEmpty()) {
      Node n = todo.removeLast();
      if (n.depth() > 96) throw fail("BAD_REQUEST", "JSON 嵌套过深");
      if (n.value().isJsonObject())
        n.value()
            .getAsJsonObject()
            .entrySet()
            .forEach(e -> todo.add(new Node(e.getValue(), n.depth() + 1)));
      else if (n.value().isJsonArray())
        n.value().getAsJsonArray().forEach(e -> todo.add(new Node(e, n.depth() + 1)));
    }
  }
}
