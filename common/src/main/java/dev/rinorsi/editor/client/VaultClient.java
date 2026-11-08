package dev.rinorsi.editor.client;

import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.platform.ClientPlatform;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.oriel.mod.client.OrielScreen;
import java.util.function.BooleanSupplier;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import com.mojang.blaze3d.platform.InputConstants;

/** World-independent entry to the same editor page and its local channels. */
public final class VaultClient {
    public static final String PAGE = "cadeditor:ui/index.html";
    private static BooleanSupplier busy = () -> false;
    private static boolean queued;
    private VaultClient() {}

    public static void initialize(BooleanSupplier editorBusy) {
        busy = editorBusy;
        var key = ClientPlatform.get().registerKey(new KeyMapping(
                "key.cadeditor.vault", InputConstants.KEY_O, KeyMapping.Category.INVENTORY));
        ClientPlatform.get().onCommands(dispatcher -> dispatcher.register(
                LiteralArgumentBuilder.<Object>literal("cadeditor").then(
                        LiteralArgumentBuilder.<Object>literal("vault").executes(c -> {
                            queued = true; return 1;
                        }))));
        ClientPlatform.get().onTick(mc -> {
            if (queued) { queued = false; open(); }
            while (key.consumeClick()) if (mc.gui.screen() == null && !modifiersDown(mc)) open();
        });
        ClientPlatform.get().onScreenKey((screen, event) -> {
            // Scope shortcuts to menus; never steal O while typing or rebinding controls.
            if (!(screen instanceof TitleScreen || screen instanceof PauseScreen)) return true;
            if (!key.matches(event) || event.modifiers() != 0) return true;
            open(); return false;
        });
    }

    private static boolean modifiersDown(Minecraft mc) {
        for(int code:new int[]{InputConstants.KEY_LSHIFT,InputConstants.KEY_RSHIFT,InputConstants.KEY_LCONTROL,InputConstants.KEY_RCONTROL,InputConstants.KEY_LALT,InputConstants.KEY_RALT})
            if(com.mojang.blaze3d.platform.InputConstants.isKeyDown(code))return true;
        return false;
    }

    public static JsonObject initialData() {
        var data = new JsonObject();
        data.addProperty("mode", "vault");
        data.add("world", JsonNull.INSTANCE);
        data.add("stack", JsonNull.INSTANCE);
        data.add("prefs", EditorPrefs.read());
        return data;
    }

    public static void open() {
        var mc = Minecraft.getInstance();
        if (busy.getAsBoolean() || mc.gui.screen() instanceof OrielScreen) return;
        var screen = new VaultScreen(mc.gui.screen());
        EditorPageHost.attachCommon(screen, initialData());
        screen.driver().onClose(EditorPrefs::flush);
        mc.gui.setScreen(screen);
    }

    private static final class VaultScreen extends OrielScreen {
        private final Screen previous;
        VaultScreen(Screen previous) { super(PAGE, null, -1); this.previous = previous; }
        @Override public void onClose() { Minecraft.getInstance().gui.setScreen(previous); }
    }
}
