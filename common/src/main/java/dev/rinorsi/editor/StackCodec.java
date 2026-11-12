package dev.rinorsi.editor;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;

/** The page exchanges component PATCHES, never a flattened default-component map. */
public final class StackCodec {
    // Each component accepts up to 1 Mi characters of typed SNBT. Transport
    // and vault entries also enforce their own total UTF-8 payload limits.
    private static final int MAX_COMPONENT_SNBT_CHARS = EditorWire.MAX_NBT_CHARS;
    private StackCodec() {}

    public static JsonObject snapshot(ItemStack stack, RegistryAccess registries, JsonObject slot, String label) {
        var ops = registries.createSerializationContext(JsonOps.INSTANCE);
        var patch = DataComponentPatch.CODEC.encodeStart(ops, stack.getComponentsPatch()).getOrThrow().getAsJsonObject();
        JsonObject comps = new JsonObject();
        JsonObject removed = new JsonObject();
        for (var entry : patch.entrySet()) {
            String key = entry.getKey();
            if (key.startsWith("!")) removed.addProperty(shortId(key.substring(1)), 1);
            else comps.add(shortId(key), pageJson(entry.getValue()));
        }
        JsonObject out = new JsonObject();
        out.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        out.addProperty("count", stack.getCount());
        out.add("comps", comps);
        JsonObject snbt = new JsonObject();
        for (var entry : dev.rinorsi.editor.ComponentPatches.entries(stack.getComponentsPatch())) {
            if (entry.getValue().isPresent() && entry.getKey().codec() != null) {
                String id = shortId(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(entry.getKey()).toString());
                snbt.addProperty(id, encodeSnbt(entry.getKey(), entry.getValue().get(), registries));
            }
        }
        if (!snbt.isEmpty()) out.add("component_snbt", snbt);
        out.add("removed", removed);
        out.add("slot", slot.deepCopy());
        out.addProperty("label", label);
        return out;
    }

    public static ItemStack decode(JsonObject edit, RegistryAccess registries) {
        String id = string(edit, "id");
        Identifier itemId = Identifier.tryParse(id);
        if (itemId == null || !BuiltInRegistries.ITEM.containsKey(itemId)) fail(EditorI18n.tr("cadeditor.message.stackcodec.b792ab06a7", (id)));
        int count = integer(edit, "count", 1, 99);
        JsonObject comps = object(edit, "comps");
        JsonObject removed = object(edit, "removed");
        if (comps.size() + removed.size() > 256) fail(EditorI18n.tr("cadeditor.message.stackcodec.5d54767f85"));
        JsonObject patch = new JsonObject();
        for (var entry : comps.entrySet()) {
            String key = componentId(entry.getKey());
            if (patch.has(key)) fail(EditorI18n.tr("cadeditor.message.stackcodec.d5d0bbb3c8", (key)));
            patch.add(key, entry.getValue());
        }
        for (var entry : removed.entrySet()) {
            String key = componentId(entry.getKey());
            if (!entry.getValue().equals(new com.google.gson.JsonPrimitive(1))) fail(EditorI18n.tr("cadeditor.message.stackcodec.26f8819f77"));
            if (patch.has(key)) fail(EditorI18n.tr("cadeditor.message.stackcodec.fad66eee18", (key)));
            patch.add("!" + key, new JsonObject());
        }
        JsonObject serialized = new JsonObject();
        serialized.addProperty("id", id);
        serialized.addProperty("count", count);
        serialized.add("components", patch);
        ItemStack next;
        if (edit.has("component_formats") || edit.has("component_snbt")) {
            var formats = edit.has("component_formats") ? object(edit, "component_formats") : new JsonObject();
            // Resolve typed fields BEFORE converting JSON. Their page projection
            // can contain rounded longs or null for a non-finite numeric tag.
            var nbt = new net.minecraft.nbt.CompoundTag();
            nbt.putString("id", id); nbt.putInt("count", count);
            var nbtPatch = new net.minecraft.nbt.CompoundTag(); nbt.put("components", nbtPatch);
            if (edit.has("component_snbt")) for (var entry : object(edit, "component_snbt").entrySet()) {
                if (!comps.has(entry.getKey()) || formats.has(entry.getKey())) continue;
                // An edited JSON value invalidates its old sidecar. Explicit format wins below.
                var typed = sidecar(ComponentValidation.type(componentId(entry.getKey())), string(object(edit, "component_snbt"), entry.getKey()), comps.get(entry.getKey()), registries);
                if (typed != null) nbtPatch.put(componentId(entry.getKey()), typed);
            }
            for (var entry : formats.entrySet()) {
                String key = componentId(entry.getKey());
                if (!entry.getValue().isJsonPrimitive() || !entry.getValue().getAsString().equals("snbt")) fail(EditorI18n.tr("cadeditor.message.stackcodec.e04104f0da", (entry.getKey())));
                if (!comps.has(entry.getKey())) fail(EditorI18n.tr("cadeditor.message.stackcodec.1b2c50a05f", (entry.getKey())));
                ComponentValidation.type(key);
                nbtPatch.put(key, ComponentValidation.parseSnbt(string(comps, entry.getKey()), MAX_COMPONENT_SNBT_CHARS));
            }
            for (var entry : patch.entrySet()) {
                if (nbtPatch.contains(entry.getKey())) continue;
                if (entry.getKey().startsWith("!")) nbtPatch.put(entry.getKey(), new net.minecraft.nbt.CompoundTag());
                else nbtPatch.put(entry.getKey(), encodeJsonComponent(ComponentValidation.type(entry.getKey()), entry.getValue(), registries));
            }
            next = ItemStack.CODEC.parse(registries.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE), nbt).getOrThrow();
        } else next = ItemStack.CODEC.parse(registries.createSerializationContext(JsonOps.INSTANCE), serialized).getOrThrow();
        ItemStack.validateStrict(next).getOrThrow();
        // Trial-spawner configs are a server-only registry. The client can validate the
        // component codec, but must leave that additional world-config check to the server.
        var blockData = next.get(net.minecraft.core.component.DataComponents.BLOCK_ENTITY_DATA);
        if (blockData == null || blockData.type() != net.minecraft.world.level.block.entity.BlockEntityTypes.TRIAL_SPAWNER
                || registries.lookup(net.minecraft.core.registries.Registries.TRIAL_SPAWNER_CONFIG).isPresent())
            dev.rinorsi.editor.registry.SpawnerData.validate(next, registries);
        if (next.isEmpty() || count > next.getMaxStackSize()) fail(EditorI18n.tr("cadeditor.message.stackcodec.62b8b41f9a"));
        return next;
    }

    public static ItemStack decode(JsonObject edit, RegistryAccess registries, ItemStack original) {
        ItemStack next = decode(edit, registries);
        JsonObject before = snapshot(original, registries, new JsonObject(), "");
        // JsonOps cannot preserve every NBT numeric/array type. Keep the actual untouched component values.
        for (var entry : dev.rinorsi.editor.ComponentPatches.entries(original.getComponentsPatch())) {
            String key = shortId(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(entry.getKey()).toString());
            if ((!edit.has("component_formats") || !object(edit, "component_formats").has(key))
                    && !sidecarChangesOriginal(edit, key, entry.getKey(), entry.getValue(), registries)
                    && samePageJson(before.getAsJsonObject("comps").get(key), edit.getAsJsonObject("comps").get(key))
                    && java.util.Objects.equals(before.getAsJsonObject("removed").get(key), edit.getAsJsonObject("removed").get(key))) {
                restore(next, entry.getKey(), entry.getValue());
            }
        }
        ItemStack.validateStrict(next).getOrThrow();
        return next;
    }
    private static <T> void restore(ItemStack stack, net.minecraft.core.component.DataComponentType<T> type, java.util.Optional<?> value) {
        if (value.isPresent()) {
            @SuppressWarnings("unchecked") T original = (T) value.get();
            stack.set(type, original);
        } else stack.remove(type);
    }
    private static <T> String encodeSnbt(net.minecraft.core.component.DataComponentType<T> type, Object value, RegistryAccess registries) {
        @SuppressWarnings("unchecked") T typed = (T) value;
        return type.codec().encodeStart(registries.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE), typed).getOrThrow().toString();
    }
    private static <T> net.minecraft.nbt.Tag encodeJsonComponent(net.minecraft.core.component.DataComponentType<T> type, JsonElement json, RegistryAccess registries) {
        T value = type.codec().parse(registries.createSerializationContext(JsonOps.INSTANCE), json).getOrThrow();
        return type.codec().encodeStart(registries.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE), value).getOrThrow();
    }
    private static boolean sidecarChangesOriginal(JsonObject edit, String key, net.minecraft.core.component.DataComponentType<?> type, java.util.Optional<?> original, RegistryAccess registries) {
        if (!edit.has("component_snbt") || !object(edit, "component_snbt").has(key) || !edit.getAsJsonObject("comps").has(key)) return false;
        var tag = sidecar(type, string(object(edit, "component_snbt"), key), edit.getAsJsonObject("comps").get(key), registries);
        return tag != null && (original.isEmpty() || !tag.toString().equals(encodeSnbt(type, original.get(), registries)));
    }
    private static <T> net.minecraft.nbt.Tag sidecar(net.minecraft.core.component.DataComponentType<T> type, String text, JsonElement json, RegistryAccess registries) {
        try {
            var nbt = registries.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE);
            var tag = ComponentValidation.parseSnbt(text, MAX_COMPONENT_SNBT_CHARS);
            T typed = type.codec().parse(nbt, tag).getOrThrow();
            // Browser JSON numbers have already passed through IEEE754. Preserve a
            // matching typed sidecar there too; exact numeric edits use explicit SNBT.
            return samePageJson(type.codec().encodeStart(registries.createSerializationContext(JsonOps.INSTANCE), typed).getOrThrow(), json)
                    ? type.codec().encodeStart(nbt, typed).getOrThrow() : null;
        } catch (RuntimeException e) { throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.stackcodec.7e15a34875"), e); }
    }
    /** JsonOps can contain NaN/Infinity JsonPrimitives, but those are not valid JSON
     * wire values. The exact NBT sidecar restores these null projections on read. */
    static JsonElement pageJson(JsonElement value) {
        if (value == null || value.isJsonNull()) return com.google.gson.JsonNull.INSTANCE;
        if (value.isJsonPrimitive()) {
            var primitive = value.getAsJsonPrimitive();
            if (primitive.isNumber() && !Double.isFinite(primitive.getAsDouble())) return com.google.gson.JsonNull.INSTANCE;
            return primitive.deepCopy();
        }
        if (value.isJsonArray()) {
            var out = new com.google.gson.JsonArray(); value.getAsJsonArray().forEach(element -> out.add(pageJson(element))); return out;
        }
        var out = new JsonObject(); value.getAsJsonObject().entrySet().forEach(entry -> out.add(entry.getKey(), pageJson(entry.getValue()))); return out;
    }

    /** JsonPrimitive.equals compares Float(0.8f) as its binary double against parsed
     * decimal 0.8. Compare the decimal wire values, without rounding large integers. */
    public static boolean sameJson(JsonElement left, JsonElement right) {
        return compareJson(left, right, false);
    }
    /** Page JS has already projected numbers to IEEE754. If the entire component is
     * unchanged in that view, keep its exact original value; precise edits use SNBT. */
    public static boolean samePageJson(JsonElement left, JsonElement right) {
        return compareJson(left, right, true);
    }
    private static boolean compareJson(JsonElement left, JsonElement right, boolean pageNumbers) {
        if (left == null || right == null) return left == right;
        if (left.isJsonNull() && right.isJsonNull()) return true;
        if (pageNumbers && (left.isJsonNull() || right.isJsonNull())) {
            JsonElement numeric = left.isJsonNull() ? right : left;
            return numeric.isJsonPrimitive() && numeric.getAsJsonPrimitive().isNumber() && !Double.isFinite(numeric.getAsDouble());
        }
        if (left.isJsonObject() && right.isJsonObject()) {
            var a = left.getAsJsonObject(); var b = right.getAsJsonObject();
            if (!a.keySet().equals(b.keySet())) return false;
            for (String key : a.keySet()) if (!compareJson(a.get(key), b.get(key), pageNumbers)) return false;
            return true;
        }
        if (left.isJsonArray() && right.isJsonArray()) {
            var a = left.getAsJsonArray(); var b = right.getAsJsonArray();
            if (a.size() != b.size()) return false;
            for (int i = 0; i < a.size(); i++) if (!compareJson(a.get(i), b.get(i), pageNumbers)) return false;
            return true;
        }
        if (left.isJsonPrimitive() && right.isJsonPrimitive()
                && left.getAsJsonPrimitive().isNumber() && right.getAsJsonPrimitive().isNumber()) {
            if (pageNumbers) return Double.compare(Double.parseDouble(left.getAsString()), Double.parseDouble(right.getAsString())) == 0;
            return new java.math.BigDecimal(left.getAsString()).compareTo(new java.math.BigDecimal(right.getAsString())) == 0;
        }
        return left.equals(right);
    }

    private static String componentId(String key) {
        String full = key.indexOf(':') < 0 ? "minecraft:" + key : key;
        Identifier id = Identifier.tryParse(full);
        if (id == null || !BuiltInRegistries.DATA_COMPONENT_TYPE.containsKey(id)) fail(EditorI18n.tr("cadeditor.message.componentvalidation.9026297c8a", (key)));
        return full;
    }
    private static String shortId(String id) { return id.startsWith("minecraft:") ? id.substring(10) : id; }
    public static JsonObject object(JsonObject o, String key) {
        if (!o.has(key) || !o.get(key).isJsonObject()) fail(EditorI18n.tr("cadeditor.message.stackcodec.1b6dd48506", (key)));
        return o.getAsJsonObject(key);
    }
    public static String string(JsonObject o, String key) {
        JsonElement v = o.get(key);
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString()) fail(EditorI18n.tr("cadeditor.message.stackcodec.372b828248", (key)));
        return v.getAsString();
    }
    public static int integer(JsonObject o, String key, int min, int max) {
        JsonElement v = o.get(key);
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isNumber()) fail(EditorI18n.tr("cadeditor.message.stackcodec.316b3d97f4", (key)));
        double n = v.getAsDouble();
        if (!Double.isFinite(n) || n != Math.rint(n) || n < min || n > max) fail(EditorI18n.tr("cadeditor.message.stackcodec.17bddb25f9", (key), (min), (max)));
        return (int) n;
    }
    public static void fail(String message) { throw new IllegalArgumentException(message); }
}
