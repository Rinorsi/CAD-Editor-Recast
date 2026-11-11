package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

/** Strict native-scale persistence; runs without initializing Minecraft or the global preferences holder. */
public final class EditorScalePrefsTest {
    public static void main(String[] args) throws Exception { run(); }
    static void run() throws Exception {
        Path dir = Files.createTempDirectory("editor-scale-prefs-");
        try {
            Path file = dir.resolve("prefs.json");
            var store = new EditorPrefs.Store(file, () -> 0);
            for (int scale = 0; scale <= 4; scale++) {
                send(store, "uiScale", Integer.toString(scale));
                check(store.read().get("uiScale").getAsInt() == scale, "visible before disk flush");
                store.flush();
                check(new EditorPrefs.Store(file, () -> 0).read().get("uiScale").getAsInt() == scale, "reopen persists " + scale);
            }
            for (String invalid : new String[] {"-1", "5", "100", "2.5", "true", "null", "\"2\"", "{}", "[]"}) {
                send(store, "uiScale", invalid);
                check(store.read().get("uiScale").getAsInt() == 4, "invalid ignored: " + invalid);
            }
            Files.writeString(file, "{\"uiScale\":135,\"uiScaleAuto\":false,\"heroView\":\"3d\",\"winW\":640}");
            var migrated = new EditorPrefs.Store(file, () -> 0).read();
            check(!migrated.has("uiScale") && !migrated.has("uiScaleAuto"), "legacy percentages use automatic fallback");
            check(migrated.get("heroView").getAsString().equals("3d") && migrated.get("winW").getAsInt() == 640, "unrelated settings retained");
            System.out.println("PASS native scale prefs: 0..4, immediate read, flush/reopen, invalid/legacy rejection, unrelated settings retained.");
        } finally {
            try (var files = Files.walk(dir)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
            }
        }
    }
    private static void send(EditorPrefs.Store store, String key, String value) {
        var message = new JsonObject(); message.addProperty("key", key);
        message.add("value", JsonParser.parseString(value)); store.accept(message);
    }
    private static void check(boolean value, String reason) { if (!value) throw new AssertionError(reason); }
}
