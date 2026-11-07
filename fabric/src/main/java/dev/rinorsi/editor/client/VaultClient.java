package dev.rinorsi.editor.client;

import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.registry.RegistryBridge;
import java.util.ArrayList;
import java.util.function.BooleanSupplier;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

/** World-independent entry to the same editor page and its local channels. */
public final class VaultClient {
    public static final String PAGE = "cadeditor:ui/index.html";
    private static BooleanSupplier busy = () -> false;
    private static boolean queued;
    private VaultClient() {}

    public static void initialize(BooleanSupplier editorBusy) {
        busy = editorBusy;
        var key = KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.cadeditor.vault", GLFW.GLFW_KEY_V, KeyMapping.Category.INVENTORY));
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registry) -> dispatcher.register(
                LiteralArgumentBuilder.<FabricClientCommandSource>literal("cadeditor").then(
                        LiteralArgumentBuilder.<FabricClientCommandSource>literal("vault").executes(c -> {
                            queued = true; return 1;
                        }))));
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if (queued) { queued = false; open(); }
            while (key.consumeClick()) if (mc.screen == null) open();
        });
        ScreenEvents.AFTER_INIT.register((mc, screen, width, height) -> {
            // Scope screen shortcuts to menus; never steal V while typing or rebinding controls.
            if (!(screen instanceof TitleScreen || screen instanceof PauseScreen)) return;
            ScreenKeyboardEvents.allowKeyPress(screen).register((owner, event) -> {
                if (!key.matches(event) || event.modifiers() != 0) return true;
                open(); return false;
            });
            var button = Button.builder(Component.translatable("gui.cadeditor.vault"), b -> open())
                    .bounds(4, 4, Math.max(60, mc.font.width(Component.translatable("gui.cadeditor.vault")) + 16), 20)
                    .tooltip(Tooltip.create(Component.translatable("gui.cadeditor.vault.tooltip"))).build();
            Screens.getWidgets(screen).add(button);
            position(screen, button);
            // Recheck after all AFTER_INIT listeners and later mod-added controls.
            ScreenEvents.beforeExtract(screen).register((owner, graphics, mouseX, mouseY, delta) -> position(owner, button));
        });
    }

    private static void position(Screen screen, Button button) {
        var occupied = new ArrayList<VaultButtonLayout.Box>();
        for (var child : screen.children()) if (child instanceof AbstractWidget widget && widget != button && widget.visible)
            occupied.add(new VaultButtonLayout.Box(widget.getX(), widget.getY(), widget.getWidth(), widget.getHeight()));
        var box = VaultButtonLayout.place(screen.width, screen.height, button.getWidth(), occupied);
        button.visible = box != null;
        if (box != null) { button.setX(box.x()); button.setY(box.y()); }
    }

    public static JsonObject initialData() {
        var data = new JsonObject();
        data.addProperty("mode", "vault");
        data.add("world", JsonNull.INSTANCE);
        data.add("stack", JsonNull.INSTANCE);
        data.add("prefs", EditorPrefs.read());
        data.addProperty("hostPrefs", true);
        return data;
    }

    public static void open() {
        var mc = Minecraft.getInstance();
        if (busy.getAsBoolean() || mc.screen instanceof OrielScreen) return;
        var screen = new VaultScreen(mc.screen);
        // Same public OrielScreen/DocumentDriver path as OrielScreens.open; subclass restores the parent.
        screen.driver().pushData(initialData().toString());
        RegistryBridge.attach(screen.driver());
        screen.driver().onMessage("prefs", EditorPrefs::accept).onClose(EditorPrefs::flush);
        mc.setScreen(screen);
    }

    private static final class VaultScreen extends OrielScreen {
        private final Screen previous;
        VaultScreen(Screen previous) { super(PAGE, null, -1); this.previous = previous; }
        @Override public void onClose() { Minecraft.getInstance().setScreen(previous); }
    }
}
