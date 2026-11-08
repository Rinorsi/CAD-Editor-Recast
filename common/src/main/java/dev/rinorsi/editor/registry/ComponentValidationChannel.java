package dev.rinorsi.editor.registry;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.ComponentValidation;
import net.minecraft.client.Minecraft;

/** Validation is a local read-only preview, never an authorization to save an item. */
final class ComponentValidationChannel {
    private ComponentValidationChannel() {}
    static void attach(DocumentDriver driver) {
        long[] rate = {0, 0};
        driver.onMessage("validate_component", value -> {
            if (driver.serverSession() || value == null || !value.isJsonObject()) return;
            var request = value.getAsJsonObject();
            var mc = Minecraft.getInstance();
            mc.execute(() -> {
                JsonObject result;
                long second = System.nanoTime() / 1_000_000_000L;
                if (rate[0] != second) { rate[0] = second; rate[1] = 0; }
                if (request.toString().length() > 8192 || ++rate[1] > 20 || mc.level == null) {
                    result = new JsonObject(); result.addProperty("ok", false);
                    if (request.has("requestId") && request.get("requestId").isJsonPrimitive()) result.add("requestId", request.get("requestId"));
                    result.addProperty("error", mc.level == null ? "已经离开世界" : "校验请求超过大小或频率限制，请稍后重试");
                } else result = ComponentValidation.validate(request, mc.level.registryAccess());
                driver.patchJson("validate_component.result", result.toString());
            });
        });
    }
}
