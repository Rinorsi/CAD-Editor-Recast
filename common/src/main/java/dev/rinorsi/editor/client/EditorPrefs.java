package dev.rinorsi.editor.client;

import dev.rinorsi.editor.platform.Platform;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/** Client-thread-only UI preferences; page values and disk contents share validation. */
public final class EditorPrefs {
    private EditorPrefs() {}
    private static final class Holder {
        static final Executor WRITER = Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "editor-prefs-writer"); thread.setDaemon(true); return thread;
        });
        static final Store STORE = new Store(Platform.get().configDir().resolve("cadeditor-ui.json"), System::nanoTime, WRITER);
    }
    public static JsonObject read() {
        var result = Holder.STORE.read();
        String scope = WorldDraftHost.scope();
        if (scope != null) result.addProperty("worldDraftScope", scope);
        return result;
    }
    static void accept(JsonElement message) { Holder.STORE.accept(message); }
    static void tick() { Holder.STORE.tick(); }
    public static void flush() { Holder.STORE.flush(); }
    public static boolean putDraft(String key, String value) { return Holder.STORE.putDraft(key, value); }
    public static JsonElement getDraft(String key) { return Holder.STORE.getDraft(key); }
    /** Read without changing LRU or queuing another disk write. */
    public static String peekDraft(String key) { return Holder.STORE.peekDraft(key); }
    public static boolean clearDraft(String key) { return Holder.STORE.clearDraft(key); }
    public static final int MAX_DRAFT_BYTES = 8 * 1024 * 1024;
    public static final int MAX_DRAFTS_BYTES = 64 * 1024 * 1024;
    public static final int MAX_DRAFTS = 8;

    static final class Store {
        private static final long DELAY = 500_000_000L;
        private record Pending(JsonElement value, long due) {}
        private final Path path;
        private final LongSupplier clock;
        private final Map<String, Pending> pending = new HashMap<>();
        private final Executor writer;
        private JsonObject cached;
        private CompletableFuture<Boolean> writing;
        private Map<String, Pending> inFlight;
        private JsonObject frozen;
        private long nextWrite;

        Store(Path path, LongSupplier clock) { this(path, clock, Runnable::run); }
        Store(Path path, LongSupplier clock, Executor writer) { this.path = path; this.clock = clock; this.writer = writer; }

        JsonObject read() {
            finishWrite(false);
            if (cached == null) cached = readDisk();
            JsonObject out = cached.deepCopy();
            pending.forEach((key, value) -> out.add(key, value.value.deepCopy()));
            return out;
        }

        void accept(JsonElement message) {
            if (message == null || !message.isJsonObject()) return;
            var object = message.getAsJsonObject();
            var key = object.get("key");
            if (key == null || !key.isJsonPrimitive() || !key.getAsJsonPrimitive().isString()) return;
            String name = key.getAsString();
            JsonElement value = valid(name, object.get("value"));
            if (value == null) return;
            Pending previous = pending.get(name);
            if (previous == null || !(name.equals("drafts") ? previous.value.toString().equals(value.toString()) : previous.value.equals(value)))
                pending.put(name, new Pending(value.deepCopy(), clock.getAsLong() + DELAY));
        }

        void tick() { flush(false); }
        void flush() { flush(true); }

        private JsonObject drafts() {
            JsonObject prefs = read();
            return prefs.has("drafts") ? prefs.getAsJsonObject("drafts") : new JsonObject();
        }
        boolean putDraft(String key, String value) {
            if (!validDraftKey(key) || !validDraft(value)) return false;
            JsonObject drafts = drafts();
            drafts.remove(key); drafts.addProperty(key, value);
            while (drafts.size() > MAX_DRAFTS || bytes(drafts.toString()) > MAX_DRAFTS_BYTES) {
                // Never silently evict a recoverable world/entity draft to store a new one.
                // Rejecting leaves both the prior on-disk draft and the live page untouched.
                String oldest = drafts.keySet().stream().filter(k -> !k.startsWith("world|") && !k.equals(key)).findFirst().orElse(null);
                if (oldest == null) return false;
                drafts.remove(oldest);
            }
            queueDrafts(drafts); return true;
        }
        JsonElement getDraft(String key) {
            if (!validDraftKey(key)) return com.google.gson.JsonNull.INSTANCE;
            JsonObject drafts = drafts(); JsonElement value = drafts.remove(key);
            if (value == null) return com.google.gson.JsonNull.INSTANCE;
            drafts.add(key, value); queueDrafts(drafts); return value.deepCopy();
        }
        String peekDraft(String key) {
            if (!validDraftKey(key)) return null;
            finishWrite(false); if (cached == null) cached = readDisk();
            Pending update = pending.get("drafts");
            JsonElement all = update == null ? cached.get("drafts") : update.value;
            JsonElement value = all != null && all.isJsonObject() ? all.getAsJsonObject().get(key) : null;
            return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString() ? value.getAsString() : null;
        }
        boolean clearDraft(String key) {
            if (!validDraftKey(key)) return false;
            JsonObject drafts = drafts();
            if (drafts.remove(key) != null) queueDrafts(drafts);
            return true;
        }
        private void queueDrafts(JsonObject drafts) {
            pending.put("drafts", new Pending(drafts.deepCopy(), clock.getAsLong() + DELAY));
        }

        private void flush(boolean all) {
            finishWrite(all);
            if (writing != null) return;
            if (pending.isEmpty()) return;
            long now = clock.getAsLong();
            if (!all && now - nextWrite < 0) return;
            var due = new HashMap<String, Pending>();
            pending.forEach((key, value) -> { if (all || now - value.due >= 0) due.put(key, value); });
            if (due.isEmpty()) return;
            if (cached == null) cached = readDisk();
            JsonObject out = cached.deepCopy();
            due.forEach((key, value) -> out.add(key, value.value));
            // Only detached, immutable JSON crosses threads; toString and disk I/O stay on writer.
            frozen = out; inFlight = due; nextWrite = now + DELAY;
            writing = CompletableFuture.supplyAsync(() -> write(out), writer);
            finishWrite(all);
        }

        private void finishWrite(boolean wait) {
            if (writing == null || (!wait && !writing.isDone())) return;
            boolean success;
            try { success = writing.join(); } catch (RuntimeException error) { dev.rinorsi.editor.EditorDiagnostics.failure("prefs.write_task", path.getFileName().toString(), error); success = false; }
            if (success) cached = frozen;
            long retryAt = clock.getAsLong() + DELAY;
            for (var entry : inFlight.entrySet()) {
                // New edits made while the previous snapshot was writing must survive its receipt.
                if (pending.get(entry.getKey()) != entry.getValue()) continue;
                if (success) pending.remove(entry.getKey());
                else pending.put(entry.getKey(), new Pending(entry.getValue().value, retryAt));
            }
            writing = null; inFlight = null; frozen = null;
        }

        private JsonObject readDisk() {
            JsonObject out = new JsonObject();
            try {
                if (!Files.isRegularFile(path) || Files.size(path) > MAX_DRAFTS_BYTES + 16_384) return out;
                var parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
                if (parsed.isJsonObject()) parsed.getAsJsonObject().entrySet().forEach(entry -> {
                    var value = valid(entry.getKey(), entry.getValue());
                    if (value != null) out.add(entry.getKey(), value.deepCopy());
                });
            } catch (IOException | RuntimeException error) { dev.rinorsi.editor.EditorDiagnostics.warning("prefs.read", path.getFileName().toString(), error); }
            return out;
        }

        private boolean write(JsonObject prefs) {
            Path temp = null;
            try {
                Files.createDirectories(path.getParent());
                temp = Files.createTempFile(path.getParent(), "editor-ui-", ".tmp");
                Files.writeString(temp, prefs.toString(), StandardCharsets.UTF_8);
                Files.move(temp, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                return true;
            } catch (IOException error) { dev.rinorsi.editor.EditorDiagnostics.failure("prefs.write", path.getFileName().toString(), error); return false; }
            finally {
                if (temp != null) try { Files.deleteIfExists(temp); } catch (IOException ignored) {}
            }
        }
    }

    private static JsonElement valid(String key, JsonElement value) {
        if (key.equals("drafts")) return validDrafts(value);
        if (key.equals("itemHistory")) return validItemHistory(value);
        if (value == null || !value.isJsonPrimitive()) return null;
        var primitive = value.getAsJsonPrimitive();
        if (key.equals("windowMode"))
            return primitive.isString() && switch (primitive.getAsString()) {
                case "remember", "maximized", "windowed" -> true;
                default -> false;
            } ? value : null;
        if (key.equals("uiFont"))
            return primitive.isString() && (primitive.getAsString().equals("mc") || primitive.getAsString().equals("smooth")) ? value : null;
        if (key.equals("heroView"))
            return primitive.isString() && (primitive.getAsString().equals("2d") || primitive.getAsString().equals("3d")) ? value : null;
        if (key.equals("windowMax") || key.equals("uiSound") || key.equals("uiAnimations") || key.equals("stageOpen") || key.equals("statsOpen") || key.equals("debug"))
            return primitive.isBoolean() ? value : null;
        int min, max;
        switch (key) {
            case "heroWidth" -> { min = 100; max = 320; }
            case "advNavWidth", "advListWidth" -> { min = 40; max = 800; }
            case "winW" -> { min = 320; max = 1600; }
            case "winH" -> { min = 200; max = 1000; }
            case "uiScale" -> { min = 0; max = 4; }
            case "codeFontSize" -> { min = 8; max = 20; }
            default -> { return null; }
        }
        if (!primitive.isNumber()) return null;
        try {
            int number = primitive.getAsBigDecimal().intValueExact();
            // Zero is the explicit "use the responsive default" marker for saved window geometry.
            return ((number >= min && number <= max) || (number == 0 && !key.equals("codeFontSize"))) ? value : null;
        } catch (ArithmeticException | NumberFormatException ignored) { return null; }
    }
    private static JsonElement validItemHistory(JsonElement value) {
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().size() > 48 || value.toString().length() > 16000) return null;
        for (var element : value.getAsJsonArray()) {
            if (!element.isJsonObject()) return null;
            var entry = element.getAsJsonObject();
            if (entry.size() != 2 || !entry.has("id") || !entry.has("snap") ||
                !entry.get("id").isJsonPrimitive() || !entry.getAsJsonPrimitive("id").isString() ||
                !entry.get("snap").isJsonPrimitive() || !entry.getAsJsonPrimitive("snap").isString()) return null;
            if (net.minecraft.resources.Identifier.tryParse(entry.get("id").getAsString()) == null || !validDraft(entry.get("snap").getAsString())) return null;
        }
        return value;
    }
    private static JsonElement validDrafts(JsonElement value) {
        if (value == null || !value.isJsonObject()) return null;
        JsonObject map = value.getAsJsonObject();
        if (map.size() > MAX_DRAFTS || bytes(map.toString()) > MAX_DRAFTS_BYTES) return null;
        for (var entry : map.entrySet()) {
            var draft = entry.getValue();
            if (!validDraftKey(entry.getKey()) || !draft.isJsonPrimitive() || !draft.getAsJsonPrimitive().isString() || !validDraft(draft.getAsString())) return null;
        }
        return value;
    }
    public static boolean validDraftKey(String key) {
        if (key == null || key.isBlank() || bytes(key) > 1024 || key.chars().anyMatch(c -> c < 32 || c == 127)) return false;
        for (int i = 0; i < key.length(); i++) {
            char c = key.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (i + 1 == key.length() || !Character.isLowSurrogate(key.charAt(++i))) return false;
            } else if (Character.isLowSurrogate(c)) return false;
        }
        return true;
    }
    public static boolean validDraft(String value) {
        if (value == null || bytes(value) > MAX_DRAFT_BYTES) return false;
        int depth = 0; boolean quoted = false, escaped = false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (i + 1 == value.length() || !Character.isLowSurrogate(value.charAt(i + 1))) return false;
                i++; continue;
            }
            if (Character.isLowSurrogate(c)) return false;
            if (quoted) {
                if (escaped) escaped = false; else if (c == '\\') escaped = true; else if (c == '"') quoted = false;
            } else if (c == '"') quoted = true;
            else if (c == '{' || c == '[') { if (++depth > 128) return false; }
            else if (c == '}' || c == ']') depth--;
        }
        try (JsonReader reader = new JsonReader(new StringReader(value))) {
            reader.setStrictness(Strictness.STRICT);
            if (reader.peek() == JsonToken.END_DOCUMENT) return false;
            JsonParser.parseReader(reader); return reader.peek() == JsonToken.END_DOCUMENT;
        } catch (IOException | RuntimeException e) { return false; }
    }
    private static int bytes(String value) { return value.getBytes(StandardCharsets.UTF_8).length; }
}
