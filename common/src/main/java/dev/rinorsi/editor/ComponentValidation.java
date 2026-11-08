package dev.rinorsi.editor;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.nbt.TagParser;
import net.minecraft.resources.Identifier;

/** The component's actual persistent codec; no guessed schemas or permitted-id lists. */
public final class ComponentValidation {
    private ComponentValidation() {}

    public static DataComponentType<?> type(String id) {
        Identifier key = Identifier.tryParse(id);
        if (key == null || !BuiltInRegistries.DATA_COMPONENT_TYPE.containsKey(key))
            throw new IllegalArgumentException("未知组件：" + id);
        var type = BuiltInRegistries.DATA_COMPONENT_TYPE.getValue(key);
        if (type.codec() == null) throw new IllegalArgumentException("组件没有持久化 Codec：" + id);
        return type;
    }

    public static Tag parseSnbt(String text) {
        if (text.length() > 8192) throw new IllegalArgumentException("SNBT 超过 8192 字符");
        try { return TagParser.create(NbtOps.INSTANCE).parseFully(text); }
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
            if (value == null) throw new IllegalArgumentException("缺少 value 或 snbt");
            normalize(out, type(id), format, value, access);
            if (out.toString().length() > 23980) throw new IllegalArgumentException("规范化结果超过 24000 字符");
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
            if (!input.isJsonPrimitive() || !input.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("SNBT 必须是字符串");
            value = type.codec().parse(nbt, parseSnbt(input.getAsString())).getOrThrow();
        } else if (format.equals("json")) value = type.codec().parse(json, input).getOrThrow();
        else throw new IllegalArgumentException("format 仅支持 snbt 或 json");
        String snbt = type.codec().encodeStart(nbt, value).getOrThrow().toString();
        JsonElement encoded = type.codec().encodeStart(json, value).getOrThrow();
        out.addProperty("format", format); out.addProperty("snbt", snbt); out.add("json", encoded);
        out.add("normalized", format.equals("snbt") ? new com.google.gson.JsonPrimitive(snbt) : encoded.deepCopy());
    }
}
