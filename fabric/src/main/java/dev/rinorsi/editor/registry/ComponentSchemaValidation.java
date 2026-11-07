package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.ComponentValidation;
import dev.rinorsi.editor.StackCodec;
import net.minecraft.core.RegistryAccess;

/** Additive path diagnostics; old validate_component response stays unchanged. */
public final class ComponentSchemaValidation {
    private ComponentSchemaValidation() {}
    public static JsonObject validate(JsonObject request, RegistryAccess access) {
        JsonObject out = ComponentValidation.validate(request, access);
        var errors = new JsonArray();
        if (!out.get("ok").getAsBoolean()) {
            boolean snbt = request.has("snbt") || request.has("format") && request.get("format").isJsonPrimitive() && request.get("format").getAsString().equals("snbt");
            if (!snbt && request.has("value")) {
                try { errors = ComponentSchema.errors(ComponentSchema.derive(StackCodec.string(request, "component"), access), request.get("value"), access); }
                catch (RuntimeException ignored) { /* full-codec error below is authoritative */ }
            }
            if (errors.isEmpty()) ComponentSchema.addError(errors, "$", "codec", out.get("error").getAsString());
        }
        // Preserve SNBT semantics and full parse outcome. Partial schema never declares ok:true.
        boolean truncated = errors.size() > 16;
        while (errors.size() > 16) errors.remove(errors.size() - 1);
        out.add("errors", errors);
        if (truncated) out.addProperty("errors_truncated", true);
        out.addProperty("path_precision", errors.isEmpty() ? "none" : errors.size() == 1 && errors.get(0).getAsJsonObject().get("path").getAsString().equals("$") ? "component" : "field");
        if (out.toString().length() > 24000) {
            out.remove("normalized"); out.remove("snbt"); out.remove("json"); out.addProperty("ok", false);
            out.addProperty("error", "规范化结果超过字段校验消息大小限制");
            var limited = new JsonArray(); ComponentSchema.addError(limited, "$", "result_limit", out.get("error").getAsString());
            out.add("errors", limited); out.addProperty("path_precision", "component");
        }
        return out;
    }
}
