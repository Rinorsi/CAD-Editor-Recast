package dev.rinorsi.editor.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.EditorDiagnostics;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/** Read-only notes from this mod's bundled CHANGELOG, loaded only when settings requests them. */
final class EditorChangelog {
    private static final Pattern VERSION = Pattern.compile("^## +([^ ]+)(?: +[(]([^)]+)[)])?.*$");
    private static JsonArray releases;
    private EditorChangelog() {}

    static void attach(DocumentDriver driver) {
        if (driver.serverSession()) return;
        driver.onMessage("editor_changelog", value -> {
            JsonObject result = new JsonObject();
            try {
                if (value == null || !value.isJsonObject() || value.toString().length() > 512)
                    throw new IllegalArgumentException("更新日志请求无效");
                var message = value.getAsJsonObject();
                String request = message.get("requestId").getAsString();
                if (request.isBlank() || request.length() > 80) throw new IllegalArgumentException("更新日志请求编号无效");
                result.addProperty("requestId", request);
                JsonArray notes = notes();
                if (message.has("version")) {
                    String version = message.get("version").getAsString();
                    JsonObject found = null;
                    for (var release : notes) if (release.getAsJsonObject().get("version").getAsString().equals(version)) { found = release.getAsJsonObject(); break; }
                    if (found == null) throw new IllegalArgumentException("此包没有该版本的更新日志");
                    result.add("release", found.deepCopy());
                } else {
                    JsonArray index = new JsonArray();
                    for (var release : notes) {
                        var note = release.getAsJsonObject(); var entry = new JsonObject();
                        entry.add("version", note.get("version")); entry.add("date", note.get("date"));
                        int count = 0; for (var section : note.getAsJsonArray("sections")) count += section.getAsJsonObject().getAsJsonArray("items").size();
                        entry.addProperty("count", count); index.add(entry);
                    }
                    result.add("releases", index);
                }
                if (result.toString().length() > 24000) throw new IllegalArgumentException("此版本日志过长，请查看包内 CHANGELOG.md");
                result.addProperty("status", "ok");
            } catch (IOException | RuntimeException error) {
                result.remove("release"); result.remove("releases");
                result.addProperty("status", "error"); result.addProperty("reason", "更新日志读取失败，可重试");
                EditorDiagnostics.failure("settings.changelog", "request=" + result.get("requestId"), error);
            }
            driver.patch("editor_changelog", result);
        });
    }

    private static JsonArray notes() throws IOException {
        if (releases != null) return releases;
        byte[] bytes;
        try (var input = EditorChangelog.class.getResourceAsStream("/assets/cadeditor/CHANGELOG.md")) {
            if (input == null) throw new IOException("包内缺少 assets/cadeditor/CHANGELOG.md");
            bytes = input.readNBytes(262145);
        }
        if (bytes.length > 262144) throw new IOException("包内更新日志超过256KiB");
        JsonArray parsed = new JsonArray(); JsonObject release = null, section = null;
        for (String raw : new String(bytes, StandardCharsets.UTF_8).lines().toList()) {
            String line = raw.trim(); var match = VERSION.matcher(line);
            if (match.matches()) {
                release = new JsonObject(); release.addProperty("version", match.group(1));
                release.addProperty("date", match.group(2) == null ? "" : match.group(2));
                release.add("intro", new JsonArray()); release.add("sections", new JsonArray());
                parsed.add(release); section = null; continue;
            }
            if (release == null || line.isEmpty()) continue;
            if (line.startsWith("### ")) {
                section = section(release, line.substring(4).trim()); continue;
            }
            if (line.startsWith("- ")) {
                if (section == null) section = section(release, "改进与修复");
                section.getAsJsonArray("items").add(line.substring(2));
            } else if (section == null) release.getAsJsonArray("intro").add(line);
            else {
                var items = section.getAsJsonArray("items");
                if (items.isEmpty()) items.add(line);
                else items.set(items.size() - 1, new com.google.gson.JsonPrimitive(items.get(items.size() - 1).getAsString() + " " + line));
            }
        }
        if (parsed.isEmpty()) throw new IOException("包内更新日志没有版本条目");
        releases = parsed; return releases;
    }

    private static JsonObject section(JsonObject release, String title) {
        var section = new JsonObject(); section.addProperty("title", title); section.add("items", new JsonArray());
        release.getAsJsonArray("sections").add(section); return section;
    }
}
