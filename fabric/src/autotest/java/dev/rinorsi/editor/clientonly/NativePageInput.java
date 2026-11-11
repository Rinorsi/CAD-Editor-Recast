package dev.rinorsi.editor.clientonly;

import com.google.gson.JsonObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.input.MouseButtonInfo;
import org.lwjgl.glfw.GLFW;

/** Test-only input routed through the open Oriel screen; never included in the Editor release. */
final class NativePageInput {
    private static String savedClipboard;

    private NativePageInput() {}

    static void pointer(Minecraft mc, JsonObject in, JsonObject out) throws Exception {
        Screen screen = requireScreen(mc);
        String selector = in.get("selector").getAsString();
        if (selector.length() > 200) throw new IllegalArgumentException("Selector too long");
        Object automation = automation();
        @SuppressWarnings("unchecked")
        Optional<float[]> found = (Optional<float[]>) automation.getClass().getMethod("rect", String.class).invoke(automation, selector);
        float[] rect = found.orElseThrow(() -> new IllegalArgumentException("No visible page element: " + selector));
        float sx = 1, sy = 1;
        if (in.has("pageUnits") && in.get("pageUnits").getAsBoolean()) {
            String js = "(function(){var r=document.querySelector(" + new JsonPrimitive(selector) + ").getBoundingClientRect();return {width:r.width,height:r.height};})()";
            @SuppressWarnings("unchecked")
            Optional<JsonElement> size = (Optional<JsonElement>) automation.getClass().getMethod("eval", String.class).invoke(automation, js);
            JsonObject page = size.orElseThrow(() -> new IllegalStateException("No page geometry")).getAsJsonObject();
            sx = rect[2] / page.get("width").getAsFloat();
            sy = rect[3] / page.get("height").getAsFloat();
            if (!Float.isFinite(sx) || !Float.isFinite(sy) || sx <= 0 || sy <= 0) throw new IllegalStateException("Invalid page geometry");
        }
        float x = point(in, "fromX", rect[0], rect[2], rect[0] + rect[2] / 2f, sx, true);
        float y = point(in, "fromY", rect[1], rect[3], rect[1] + rect[3] / 2f, sy, true);
        float toX = point(in, "toX", rect[0], rect[2], x, sx, false);
        float toY = point(in, "toY", rect[1], rect[3], y, sy, false);
        int modifiers = modifiers(in);
        MouseButtonInfo button = new MouseButtonInfo(GLFW.GLFW_MOUSE_BUTTON_LEFT, modifiers);
        move(screen, x, y);
        boolean moveOnly = in.has("moveOnly") && in.get("moveOnly").getAsBoolean();
        boolean pressed = !moveOnly && screen.mouseClicked(new MouseButtonEvent(x, y, button), false);
        boolean drag = !moveOnly && (in.has("toX") || in.has("toY"));
        if (drag) {
            float px = x, py = y;
            for (int step = 1; step <= 8; step++) {
                float nx = x + (toX - x) * step / 8f, ny = y + (toY - y) * step / 8f;
                move(screen, nx, ny);
                screen.mouseDragged(new MouseButtonEvent(nx, ny, button), nx - px, ny - py);
                px = nx; py = ny;
            }
        }
        boolean released = !moveOnly && screen.mouseReleased(new MouseButtonEvent(toX, toY, button));
        out.addProperty("pressed", pressed);
        out.addProperty("released", released);
        out.addProperty("drag", drag);
        out.addProperty("moveOnly", moveOnly);
        out.addProperty("pageScaleX", sx); out.addProperty("pageScaleY", sy);
        out.addProperty("fromX", x); out.addProperty("fromY", y);
        out.addProperty("toX", toX); out.addProperty("toY", toY);
        JsonObject box = new JsonObject();
        box.addProperty("x", rect[0]); box.addProperty("y", rect[1]);
        box.addProperty("width", rect[2]); box.addProperty("height", rect[3]);
        out.add("elementRect", box);
    }

    static void key(Minecraft mc, JsonObject in, JsonObject out) {
        Screen screen = requireScreen(mc);
        int code = keyCode(in.get("key").getAsString());
        KeyEvent event = new KeyEvent(code, GLFW.glfwGetKeyScancode(code), modifiers(in));
        out.addProperty("pressed", screen.keyPressed(event));
        out.addProperty("released", screen.keyReleased(event));
    }

    static void type(Minecraft mc, JsonObject in, JsonObject out) throws Exception {
        requireScreen(mc);
        String text = in.get("text").getAsString();
        if (text.length() > 8192) throw new IllegalArgumentException("Typed text too long");
        Object automation = automation();
        automation.getClass().getMethod("type", String.class).invoke(automation, text);
        out.addProperty("typed", text.length());
    }

    static void pushClipboard(Minecraft mc, JsonObject in, JsonObject out) {
        if (savedClipboard != null) throw new IllegalStateException("Test clipboard already saved");
        String value = in.get("text").getAsString();
        if (value.length() > 32767) throw new IllegalArgumentException("Clipboard fixture too long");
        savedClipboard = mc.keyboardHandler.getClipboard();
        mc.keyboardHandler.setClipboard(value);
        out.addProperty("saved", true);
        out.addProperty("fixtureLength", value.length());
    }

    static void readClipboard(Minecraft mc, JsonObject out) {
        if (savedClipboard == null) throw new IllegalStateException("Test clipboard was not saved");
        out.addProperty("clipboard", mc.keyboardHandler.getClipboard());
    }

    static void popClipboard(Minecraft mc, JsonObject out) {
        if (savedClipboard == null) { out.addProperty("restored", false); return; }
        mc.keyboardHandler.setClipboard(savedClipboard);
        savedClipboard = null;
        out.addProperty("restored", true);
    }

    private static Object automation() throws Exception {
        Object value = Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null);
        return ((Optional<?>) value).orElseThrow(() -> new IllegalStateException("No open Oriel screen"));
    }

    private static Screen requireScreen(Minecraft mc) {
        if (mc.screen == null) throw new IllegalStateException("No open screen");
        return mc.screen;
    }

    private static void move(Screen screen, float x, float y) {
        screen.mouseMoved(x, y);
        screen.afterMouseMove();
    }

    private static float point(JsonObject in, String name, float origin, float size, float fallback, float scale, boolean bounded) {
        float value = in.has(name) ? origin + in.get(name).getAsFloat() * scale : fallback;
        if (!Float.isFinite(value) || Math.abs(value) > 32767 || (bounded && (value < origin + 0.1f || value > origin + size - 0.1f))) throw new IllegalArgumentException(name + " outside element");
        return value;
    }

    private static int modifiers(JsonObject in) {
        int mods = 0;
        if (in.has("shift") && in.get("shift").getAsBoolean()) mods |= GLFW.GLFW_MOD_SHIFT;
        if (in.has("ctrl") && in.get("ctrl").getAsBoolean()) mods |= GLFW.GLFW_MOD_CONTROL;
        if (in.has("alt") && in.get("alt").getAsBoolean()) mods |= GLFW.GLFW_MOD_ALT;
        if (in.has("meta") && in.get("meta").getAsBoolean()) mods |= GLFW.GLFW_MOD_SUPER;
        return mods;
    }

    private static int keyCode(String key) {
        if (key.length() == 1) {
            char c = Character.toUpperCase(key.charAt(0));
            if (c >= 'A' && c <= 'Z') return GLFW.GLFW_KEY_A + c - 'A';
            if (c >= '0' && c <= '9') return GLFW.GLFW_KEY_0 + c - '0';
        }
        return switch (key) {
            case "Enter" -> GLFW.GLFW_KEY_ENTER;
            case "Tab" -> GLFW.GLFW_KEY_TAB;
            case "Escape" -> GLFW.GLFW_KEY_ESCAPE;
            case "Home" -> GLFW.GLFW_KEY_HOME;
            case "End" -> GLFW.GLFW_KEY_END;
            case "ArrowLeft" -> GLFW.GLFW_KEY_LEFT;
            case "ArrowRight" -> GLFW.GLFW_KEY_RIGHT;
            case "ArrowUp" -> GLFW.GLFW_KEY_UP;
            case "ArrowDown" -> GLFW.GLFW_KEY_DOWN;
            case "Backspace" -> GLFW.GLFW_KEY_BACKSPACE;
            case "Delete" -> GLFW.GLFW_KEY_DELETE;
            default -> throw new IllegalArgumentException("Unsupported test key: " + key);
        };
    }
}
