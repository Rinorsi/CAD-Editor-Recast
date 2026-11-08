package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;

/** Wire pages, measured in UTF-16 characters as in Oriel, including the envelope. */
public final class RegistryPages {
    public static final int MAX_CHARS = 24_000;
    private RegistryPages() {}
    public static List<JsonObject> split(String name, String generation, JsonArray entries) {
        return split(name, generation, entries, new JsonObject());
    }
    public static List<JsonObject> split(String name, String generation, JsonArray entries, JsonObject context) {
        return split(name, generation, entries, context, MAX_CHARS);
    }
    public static List<JsonObject> split(String name, String generation, JsonArray entries, JsonObject context, int limit) {
        List<JsonObject> result = new ArrayList<>();
        JsonArray page = new JsonArray();
        int offset = 0, chars = 0;
        if (limit < 1024 || limit > MAX_CHARS) throw new IllegalArgumentException("分页大小无效");
        int overhead = envelope(name, generation, 0, entries.size(), new JsonArray(), context).toString().length() + 64;
        int budget = limit - overhead;
        for (JsonElement entry : entries) {
            int size = entry.toString().length() + 1;
            // Oversized single rows still use the v1 24000-char maximum rather than truncating fields.
            if (size > MAX_CHARS - overhead) throw new IllegalArgumentException("注册表条目超过分页大小: " + name + " " + entry.getAsJsonObject().get("id") + " chars=" + size + " fields=" + entry.getAsJsonObject().entrySet().stream().map(e -> e.getKey()+":"+e.getValue().toString().length()).toList());
            if (!page.isEmpty() && chars + size > budget) {
                result.add(envelope(name, generation, offset, entries.size(), page, context));
                offset += page.size(); page = new JsonArray(); chars = 0;
            }
            page.add(entry); chars += size;
        }
        result.add(envelope(name, generation, offset, entries.size(), page, context));
        return result;
    }
    private static JsonObject envelope(String name, String generation, int offset, int total, JsonArray entries, JsonObject context) {
        JsonObject p = new JsonObject();
        context.entrySet().forEach(e -> p.add(e.getKey(), e.getValue()));
        p.addProperty("version", 1); p.addProperty("generation", generation); p.addProperty("name", name);
        p.addProperty("offset", offset); p.addProperty("total", total); p.add("entries", entries);
        p.addProperty("done", offset + entries.size() == total);
        if (p.toString().length() > MAX_CHARS) throw new IllegalArgumentException("注册表分页信封过长");
        return p;
    }
}
