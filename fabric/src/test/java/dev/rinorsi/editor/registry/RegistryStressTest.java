package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import java.util.function.Supplier;

/** Synthetic registry-scale capture through the production warmup/index/paging implementation. */
public final class RegistryStressTest {
    public static void main(String[] args) throws Exception {
        RegistryWarmup.prime();
        // The real client has constructed/loaded item classes before join; prime the synthetic row factory likewise.
        rows("enchantment", 1).next();
        Map<String, Supplier<Iterator<JsonObject>>> sources = new LinkedHashMap<>();
        sources.put("minecraft:item", () -> rows("item", 50_000));
        sources.put("minecraft:sound_event", () -> rows("sound", 20_000));
        sources.put("minecraft:enchantment", () -> rows("enchantment", 5_000));
        var warmup = new RegistryWarmup("stress", sources);
        long baseline = used(), peak = baseline, maxTick = 0; int frames = 0;
        while (!warmup.complete()) {
            long before = System.nanoTime(); warmup.tick(); maxTick = Math.max(maxTick, System.nanoTime() - before);
            peak = Math.max(peak, used()); frames++;
            // Emulate 20 client ticks/s; warmup background work continues between slices.
            Thread.sleep(50);
            if (frames > 6000) throw new AssertionError("stress warmup did not finish");
        }
        JsonObject metrics = warmup.metrics();
        metrics.addProperty("items", 50_000); metrics.addProperty("sounds", 20_000); metrics.addProperty("enchantments", 5_000);
        metrics.addProperty("peak_heap_mib", peak / 1048576.0); metrics.addProperty("incremental_peak_heap_mib", (peak - baseline) / 1048576.0);
        metrics.addProperty("measured_max_tick_ms", maxTick / 1_000_000.0);
        long opening = System.nanoTime();
        RegistryIndex items = warmup.index("minecraft:item"); String firstPage = items.pages().getFirst();
        // Consume the same pre-encoded first-page payload a local driver receives.
        if (JsonParser.parseString(firstPage).getAsJsonObject().getAsJsonArray("entries").isEmpty()) throw new AssertionError("empty first page");
        metrics.addProperty("cached_homepage_ms", (System.nanoTime() - opening) / 1_000_000.0);
        if (items.size != 50_000 || warmup.index("minecraft:sound_event").size != 20_000 || warmup.index("minecraft:enchantment").size != 5_000)
            throw new AssertionError("stress rows omitted");
        if (items.find("stress:item_49999") == null || items.search("合成 item 49999", 2).isEmpty()) throw new AssertionError("indexed id/search failed");
        System.out.println("REGISTRY_STRESS " + metrics);
        if (args.length > 0) java.nio.file.Files.writeString(java.nio.file.Path.of(args[0]), metrics.toString());
        System.out.println("PASS 50000 items / 20000 sounds / 5000 enchantments with tag and item relations; generation cache, id/search index and first cached page");
    }
    private static Iterator<JsonObject> rows(String kind, int size) {
        return new Iterator<>() {
            int i;
            public boolean hasNext() { return i < size; }
            public JsonObject next() {
                JsonObject row = new JsonObject(); row.addProperty("id", "stress:" + kind + "_" + i); row.addProperty("name", "合成 " + kind + " " + i);
                if (kind.equals("enchantment")) {
                    JsonArray tags = new JsonArray(), supported = new JsonArray(), exclusive = new JsonArray();
                    for (int j = 0; j < 8; j++) { tags.add("stress:tag_" + j); supported.add("stress:item_" + ((i + j) % 50_000)); }
                    exclusive.add("stress:enchantment_" + ((i + 1) % size));
                    row.add("tags", tags); row.add("supported", supported); row.add("exclusive", exclusive);
                }
                i++; return row;
            }
        };
    }
    private static long used() { return Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory(); }
}
