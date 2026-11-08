package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.OrielScreen;
import net.minecraft.client.Minecraft;

/** Minecraft/Oriel wiring kept separate from the OS-free clipboard policy. */
final class EditorClipboardHost {
    private EditorClipboardHost() {}

    static void declare(JsonObject data) {
        data.addProperty("hostClip", true);
    }

    static void attach(OrielScreen owner, EditorClipboard bridge) {
        owner.driver().onMessage("clipboard", value -> {
            var mc = Minecraft.getInstance();
            bridge.accept(value, mc::execute, () -> mc.gui.screen() == owner,
                    text -> mc.keyboardHandler.setClipboard(text));
        });
    }
}
