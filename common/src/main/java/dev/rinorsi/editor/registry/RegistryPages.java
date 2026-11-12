package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

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
    /** Opt-in for scope-guarded entity responses. Ordinary v1 pages remain byte-compatible. */
    public static List<JsonObject> splitLossless(String name, String generation, JsonArray entries, JsonObject context) {
        int overhead = envelope(name, generation, 0, entries.size(), new JsonArray(), context).toString().length() + 64;
        for (JsonElement entry : entries) if (entry.toString().length() + 1 > MAX_CHARS - overhead)
            return RegistryFragments.split(complete(name, generation, entries, context));
        return split(name, generation, entries, context);
    }
    public static List<JsonObject> split(String name, String generation, JsonArray entries, JsonObject context, int limit) {
        List<JsonObject> result = new ArrayList<>();
        JsonArray page = new JsonArray();
        int offset = 0, chars = 0;
        if (limit < 1024 || limit > MAX_CHARS) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.registrypages.41bc1b9f30"));
        int overhead = envelope(name, generation, 0, entries.size(), new JsonArray(), context).toString().length() + 64;
        int budget = limit - overhead;
        for (JsonElement entry : entries) {
            int size = entry.toString().length() + 1;
            // Oversized single rows still use the v1 24000-char maximum rather than truncating fields.
            if (size > MAX_CHARS - overhead) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.registrypages.2171f491df", (name), (size), ((entry.isJsonObject() ? " id=" + entry.getAsJsonObject().get("id") + " fields=" + entry.getAsJsonObject().entrySet().stream().map(e -> e.getKey()+":"+e.getValue().toString().length()).toList() : " type=non-object"))));
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
        JsonObject p = complete(name, generation, entries, context);
        p.addProperty("offset", offset); p.addProperty("total", total); p.addProperty("done", offset + entries.size() == total);
        if (p.toString().length() > MAX_CHARS) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.registrypages.9892d5b6fe"));
        return p;
    }
    private static JsonObject complete(String name, String generation, JsonArray entries, JsonObject context) {
        JsonObject p = new JsonObject();
        context.entrySet().forEach(e -> p.add(e.getKey(), e.getValue()));
        p.addProperty("version", 1); p.addProperty("generation", generation); p.addProperty("name", name);
        p.addProperty("offset", 0); p.addProperty("total", entries.size()); p.add("entries", entries); p.addProperty("done", true);
        return p;
    }
}
