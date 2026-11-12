package dev.rinorsi.editor;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.Identifier;

/** The component's actual persistent codec; no guessed schemas or permitted-id lists. */
public final class ComponentValidation {
    private ComponentValidation() {}

    public static DataComponentType<?> type(String id) {
        Identifier key = Identifier.tryParse(id);
        if (key == null || !BuiltInRegistries.DATA_COMPONENT_TYPE.containsKey(key))
            throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.9026297c8a", (id)));
        var type = BuiltInRegistries.DATA_COMPONENT_TYPE.getValue(key);
        if (type.codec() == null) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.942e7e98a3", (id)));
        return type;
    }

    public static Tag parseSnbt(String text) {
        return parseSnbt(text, 8192);
    }

    /** The caller owns its transport/storage budget. The quick validation
     * endpoint has a smaller budget than chunked vault storage. */
    public static Tag parseSnbt(String text, int maxChars) {
        if (text.length() > maxChars) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.a06b98cd3b", (maxChars)));
        try { return SpecialFloatingPointSnbt.parse(text); }
        catch (com.mojang.brigadier.exceptions.CommandSyntaxException e) { throw new IllegalArgumentException(e.getMessage(), e); }
    }

    public static JsonObject validate(JsonObject request, RegistryAccess access) {
        JsonObject out = new JsonObject();
        if (request.has("requestId") && request.get("requestId").isJsonPrimitive()) out.add("requestId", request.get("requestId"));
        try {
            String id = StackCodec.string(request, "component");
            out.addProperty("component", Identifier.parse(id).toString());
            String format = request.has("format") ? StackCodec.string(request, "format") : request.has("snbt") ? "snbt" : "json";
            JsonElement value = request.has("snbt") ? request.get("snbt") : request.get("value");
            if (value == null) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.5204b5471b"));
            normalize(out, type(id), format, value, access);
            if (out.toString().length() > 23980) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.ab4c6addd1"));
            out.addProperty("ok", true);
        } catch (RuntimeException e) {
            out.remove("normalized"); out.remove("snbt"); out.remove("json");
            out.addProperty("ok", false);
            String error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            out.addProperty("error", error.substring(0, Math.min(error.length(), 2000)));
        }
        return out;
    }

    private static <T> void normalize(JsonObject out, DataComponentType<T> type, String format, JsonElement input, RegistryAccess access) {
        T value;
        var nbt = access.createSerializationContext(NbtOps.INSTANCE);
        var json = access.createSerializationContext(JsonOps.INSTANCE);
        if (format.equals("snbt")) {
            if (!input.isJsonPrimitive() || !input.getAsJsonPrimitive().isString()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.6c88d71e81"));
            value = type.codec().parse(nbt, parseSnbt(input.getAsString())).getOrThrow();
        } else if (format.equals("json")) value = type.codec().parse(json, input).getOrThrow();
        else throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.componentvalidation.24b8fa6c8a"));
        String snbt = type.codec().encodeStart(nbt, value).getOrThrow().toString();
        JsonElement encoded = StackCodec.pageJson(type.codec().encodeStart(json, value).getOrThrow());
        out.addProperty("format", format); out.addProperty("snbt", snbt); out.add("json", encoded);
        out.add("normalized", format.equals("snbt") ? new com.google.gson.JsonPrimitive(snbt) : encoded.deepCopy());
    }
}
