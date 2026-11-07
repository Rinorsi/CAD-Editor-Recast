package dev.rinorsi.editor.livetest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.oriel.mod.client.OrielHud;
import dev.rinorsi.editor.client.EditorToast;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

/** File-based page inspection for the isolated live-test probe only. */
public final class LivePageProbe implements ClientModInitializer {
    private String previous = "";

    @Override
    public void onInitializeClient() {
        if (!"live-smoke".equals(System.getProperty("editor.autotest"))) return;
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            Path request = mc.gameDirectory.toPath().resolve("page-request.json");
            if (!Files.exists(request)) return;
            JsonObject result = new JsonObject();
            try {
                JsonObject input = JsonParser.parseString(Files.readString(request)).getAsJsonObject();
                String id = input.get("id").getAsString();
                if (id.equals(previous)) return;
                previous = id;
                result.addProperty("id", id);
                if (input.has("toast")) EditorToast.show(EditorToast.Level.OK, input.get("toast").getAsString());
                if (input.has("js")) {
                    Object page = ((Optional<?>) Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();
                    Object value = ((Optional<?>) page.getClass().getMethod("eval", String.class).invoke(page, input.get("js").getAsString())).orElseThrow();
                    result.add("value", (com.google.gson.JsonElement) value);
                }
                result.addProperty("visible", GLFW.glfwGetWindowAttrib(mc.getWindow().handle(), GLFW.GLFW_VISIBLE));
                result.addProperty("focused", GLFW.glfwGetWindowAttrib(mc.getWindow().handle(), GLFW.GLFW_FOCUSED));
                result.addProperty("toastShown", OrielHud.isShown(Identifier.parse("cadeditor:toast")));
                result.addProperty("inputBackend", Class.forName("dev.oriel.engine.input.InputBackend").getMethod("configured").invoke(null).toString());
            } catch (Exception e) {
                result.addProperty("error", e.toString());
            }
            try {
                Files.writeString(request.resolveSibling("page-response.json"), result.toString());
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        });
    }
}
