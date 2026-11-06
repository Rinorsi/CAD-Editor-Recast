package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.JsonOps;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.component.CustomData;

/** The prototype map, not an empty ItemStack component patch. */
public final class ItemDefaults {
    private ItemDefaults() {}
    public static JsonArray entries(RegistryAccess access, Identifier only) {
        var registry = access.lookup(Registries.ITEM).orElse(BuiltInRegistries.ITEM);
        if (only != null && !registry.containsKey(only)) throw new IllegalArgumentException("未知物品: " + only);
        var ops = access.createSerializationContext(JsonOps.INSTANCE);
        JsonArray entries = new JsonArray();
        registry.listElements().filter(h -> only == null || h.key().identifier().equals(only))
                .sorted(java.util.Comparator.comparing(h -> h.key().identifier().toString())).forEach(holder -> {
                    JsonObject row = new JsonObject(), comps = new JsonObject(), formats = new JsonObject();
                    JsonArray unsupported = new JsonArray(), tags = new JsonArray();
                    row.addProperty("id", holder.key().identifier().toString());
                    for (var component : holder.value().components()) {
                        var componentId = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.type());
                        if (componentId == null) throw new IllegalArgumentException("物品默认组件没有注册id: " + holder.key().identifier());
                        String id = componentId.toString();
                        if (id.startsWith("minecraft:")) id = id.substring(10);
                        if (component.type().codec() == null) { unsupported.add(id); continue; }
                        if (component.value() instanceof CustomData data) {
                            formats.addProperty(id, "snbt");
                        }
                        comps.add(id, encode(component, ops));
                    }
                    holder.tags().map(t -> t.location().toString()).sorted().forEach(tags::add);
                    row.add("comps", comps); row.add("tags", tags);
                    if (!formats.isEmpty()) row.add("component_formats", formats);
                    if (!unsupported.isEmpty()) row.add("unsupported_components", unsupported);
                    entries.add(row);
                });
        return entries;
    }
    static JsonElement encode(net.minecraft.core.component.TypedDataComponent<?> component, com.mojang.serialization.DynamicOps<JsonElement> ops) {
        return component.value() instanceof CustomData data ? new JsonPrimitive(data.copyTag().toString()) : component.encodeValue(ops).getOrThrow();
    }
}
