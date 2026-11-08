package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;

/** Built solely from detached JSON on a background executor; never holds Minecraft objects. */
public final class RegistryIndex {
    public final String name, generation;
    public final int size;
    private final Map<String, JsonObject> byId;
    private final List<String> pages;
    private RegistryIndex(String name, String generation, int size, Map<String, JsonObject> byId, List<String> pages) {
        this.name = name; this.generation = generation; this.size = size; this.byId = Map.copyOf(byId); this.pages = List.copyOf(pages);
    }
    public static RegistryIndex build(String name, String generation, List<JsonObject> detached) {
        Map<String, JsonObject> byId = new LinkedHashMap<>(); JsonArray rows = new JsonArray();
        detached.sort(Comparator.comparing(row -> row.get("id").getAsString()));
        for (JsonObject row : detached) {
            String id = row.get("id").getAsString(), display = row.has("name") ? row.get("name").getAsString() : id;
            row.addProperty("search_key", (display + " " + id).toLowerCase(Locale.ROOT));
            byId.put(id, row); rows.add(row);
        }
        List<String> pages = new ArrayList<>();
        for (var page : RegistryPages.split(name, generation, rows, new JsonObject(), 20_000)) pages.add(page.toString());
        return new RegistryIndex(name, generation, rows.size(), byId, pages);
    }
    public static RegistryIndex error(String name, String generation, Throwable error) {
        JsonObject page = RegistryPages.split(name, generation, new JsonArray()).getFirst();
        String message = error.getMessage(); page.addProperty("error", message == null ? error.getClass().getSimpleName() : message.substring(0, Math.min(512, message.length())));
        return new RegistryIndex(name, generation, 0, Map.of(), List.of(page.toString()));
    }
    public static RegistryIndex indexOnly(String name,String generation,int count){return new RegistryIndex(name,generation,count,Map.of(),List.of());}
    public boolean indexOnly(){return pages.isEmpty();}
    public List<String> pages() { return pages; }
    public JsonObject find(String id) { var row = byId.get(id); return row == null ? null : row.deepCopy(); }
    public JsonArray search(String query, int limit) {
        String lower = query.toLowerCase(Locale.ROOT); JsonArray rows = new JsonArray();
        for (JsonObject row : byId.values()) if (row.get("search_key").getAsString().contains(lower)) {
            rows.add(row.deepCopy()); if (rows.size() >= limit) break;
        }
        return rows;
    }
}
