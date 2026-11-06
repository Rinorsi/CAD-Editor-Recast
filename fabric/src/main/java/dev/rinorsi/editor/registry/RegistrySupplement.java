package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraft.world.item.crafting.SmithingTrimRecipe;
import net.minecraft.world.level.block.state.properties.Property;

/** Extra read-only choices whose authority is not a normal synchronized registry. */
public final class RegistrySupplement {
    private RegistrySupplement() {}
    private record Capture(Object world, java.util.Iterator<JsonObject> rows, JsonArray captured, CompletableFuture<Result> future) {}
    private static final java.util.ArrayDeque<Capture> CAPTURES = new java.util.ArrayDeque<>();
    private static boolean initialized;
    public static void initialize() {
        if (initialized) return;
        initialized = true;
        net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            long start = System.nanoTime();
            while (!CAPTURES.isEmpty() && System.nanoTime() - start < 350_000) {
                Capture capture = CAPTURES.peek();
                if (capture.world() != mc.level) {
                    CAPTURES.remove(); capture.future().completeExceptionally(new IllegalStateException("已经离开世界")); continue;
                }
                try {
                    if (capture.rows().hasNext()) capture.captured().add(capture.rows().next());
                    else { CAPTURES.remove(); capture.future().complete(new Result(capture.captured(), context("block_state_definition", true))); }
                } catch (RuntimeException error) { CAPTURES.remove(); capture.future().completeExceptionally(error); }
            }
        });
    }
    public record Result(JsonArray entries, JsonObject context) {}
    public static boolean handles(String raw) {
        return switch (raw) {
            case "block_properties", "loot_table", "minecraft:loot_table", "loot_tables",
                    "recipe", "minecraft:recipe", "recipes", "dimension", "minecraft:dimension", "dimensions",
                    "trim_patterns", "trim_pattern", "minecraft:trim_pattern" -> true;
            default -> false;
        };
    }
    public static CompletableFuture<Result> read(Minecraft mc, String raw, Identifier only) {
        if (raw.equals("block_properties")) {
            if (only != null && BuiltInRegistries.BLOCK.getOptional(only).isEmpty())
                throw new IllegalArgumentException("未知方块: " + only);
            var rows = BuiltInRegistries.BLOCK.entrySet().stream()
                    .filter(entry -> only == null || only.equals(entry.getKey().identifier()))
                    .map(entry -> blockRow(entry.getKey().identifier(), entry.getValue())).iterator();
            CompletableFuture<Result> future = new CompletableFuture<>();
            CAPTURES.add(new Capture(mc.level, rows, new JsonArray(), future));
            return future;
        }
        if (raw.equals("dimension") || raw.equals("minecraft:dimension") || raw.equals("dimensions")) {
            JsonArray rows = new JsonArray();
            mc.getConnection().levels().stream().map(k -> k.identifier().toString()).sorted().forEach(id -> rows.add(row(id)));
            return CompletableFuture.completedFuture(new Result(rows, context("connection_levels", true)));
        }
        boolean patterns = raw.equals("trim_patterns") || raw.equals("trim_pattern") || raw.equals("minecraft:trim_pattern");
        JsonArray patternRows = patterns ? new RegistrySnapshot(mc.level.registryAccess(), id -> null)
                .entries(Registries.TRIM_PATTERN.identifier()) : null;
        var server = mc.getSingleplayerServer();
        if (server == null) return CompletableFuture.completedFuture(unavailable(patternRows));
        // Never inspect integrated-server reloadable registries or recipes on the client thread.
        return server.submit(() -> {
            JsonArray rows = new JsonArray();
            if (patterns) {
                java.util.Map<String, java.util.Set<String>> templates = new java.util.HashMap<>();
                var ops = server.registryAccess().createSerializationContext(JsonOps.INSTANCE);
                for (var holder : server.getRecipeManager().getRecipes()) {
                    if (!(holder.value() instanceof SmithingTrimRecipe trim)) continue;
                    var json = Recipe.CODEC.encodeStart(ops, trim).getOrThrow().getAsJsonObject();
                    // Inline holders have no registry ID to associate with a registered pattern.
                    if (!json.has("pattern") || !json.get("pattern").isJsonPrimitive()) continue;
                    String pattern = json.get("pattern").getAsString();
                    var ids = templates.computeIfAbsent(pattern, key -> new java.util.TreeSet<>());
                    trim.templateIngredient().ifPresent(ingredient -> ingredient.items().forEach(item ->
                            item.unwrapKey().ifPresent(key -> ids.add(key.identifier().toString()))));
                }
                for (var element : patternRows) {
                    var row = element.getAsJsonObject(); JsonArray ids = new JsonArray();
                    templates.getOrDefault(row.get("id").getAsString(), java.util.Set.of()).forEach(ids::add);
                    row.add("template_items", ids); row.addProperty("template_status", "complete");
                    if (!ids.isEmpty()) row.addProperty("template_item", ids.get(0).getAsString());
                }
                return new Result(patternRows, context("integrated_server_recipes", true));
            }
            if (raw.equals("recipe") || raw.equals("minecraft:recipe") || raw.equals("recipes")) {
                server.getRecipeManager().getRecipes().stream().map(h -> h.id().identifier().toString()).sorted()
                        .forEach(id -> rows.add(row(id)));
                return new Result(rows, context("integrated_server_recipes", true));
            }
            server.reloadableRegistries().lookup().lookupOrThrow(Registries.LOOT_TABLE).listElementIds()
                    .map(k -> k.identifier().toString()).sorted().forEach(id -> rows.add(row(id)));
            return new Result(rows, context("integrated_server_loot_registry", true));
        });
    }
    static Result unavailable(JsonArray patternRows) {
        JsonObject context = context("remote_server", false);
        context.addProperty("reason", patternRows == null ? "服务器未向客户端同步完整列表，请手动输入 ID"
                : "服务器未同步纹饰配方与模板关联，请手动输入模板物品 ID");
        return new Result(patternRows == null ? new JsonArray() : patternRows, context);
    }
    public static JsonArray blockProperties(Identifier only) {
        JsonArray rows = new JsonArray();
        if (only != null && BuiltInRegistries.BLOCK.getOptional(only).isEmpty())
            throw new IllegalArgumentException("未知方块: " + only);
        BuiltInRegistries.BLOCK.entrySet().stream().filter(e -> only == null || only.equals(e.getKey().identifier()))
                .sorted(java.util.Comparator.comparing(e -> e.getKey().identifier().toString())).forEach(entry -> {
            rows.add(blockRow(entry.getKey().identifier(), entry.getValue()));
        });
        return rows;
    }
    private static JsonObject blockRow(Identifier id, net.minecraft.world.level.block.Block block) {
        JsonObject row = row(id.toString()); row.addProperty("name", block.getName().getString());
        JsonObject properties = new JsonObject();
        for (var property : block.getStateDefinition().getProperties())
            properties.add(property.getName(), property(block.defaultBlockState(), property));
        row.add("properties", properties); return row;
    }
    private static <T extends Comparable<T>> JsonObject property(net.minecraft.world.level.block.state.BlockState state, Property<T> property) {
        JsonObject value = new JsonObject(); JsonArray allowed = new JsonArray();
        property.getPossibleValues().forEach(v -> allowed.add(property.getName(v)));
        value.add("values", allowed); value.addProperty("default", property.getName(state.getValue(property))); return value;
    }
    static JsonObject context(String source, boolean available) {
        JsonObject context = new JsonObject(); context.addProperty("source", source);
        context.addProperty("availability", available ? "complete" : "unavailable"); return context;
    }
    static JsonObject row(String id) {
        JsonObject row = new JsonObject(); row.addProperty("id", id); row.addProperty("name", id); return row;
    }
}
