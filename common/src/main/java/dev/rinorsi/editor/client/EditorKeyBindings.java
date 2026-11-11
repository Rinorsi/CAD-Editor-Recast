package dev.rinorsi.editor.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.oriel.kit.ReferenceContent;
import dev.rinorsi.editor.mixin.client.EditorOptionsAccessor;
import java.util.Arrays;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

/** One shared controls category, registered once for all editor shortcuts. */
final class EditorKeyBindings {
    static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(Identifier.parse("cadeditor:editor"));

    private EditorKeyBindings() {}

    /** Run after both loaders finish registering keys and loading saved bindings. */
    static void removeUnavailableLibraryHome(Minecraft client) {
        // An explicitly installed full Oriel still owns its gallery shortcut.
        if (ReferenceContent.available()) return;
        boolean removed = false;
        for (KeyMapping mapping : client.options.keyMappings) {
            if (!mapping.getName().equals("key.oriel.home")) continue;
            mapping.setKey(InputConstants.UNKNOWN);
            mapping.setDown(false);
            while (mapping.consumeClick()) { /* Discard a queued press of the old binding. */ }
            removed = true;
        }
        if (!removed) return;
        ((EditorOptionsAccessor) client.options).cadeditor$setKeyMappings(Arrays.stream(client.options.keyMappings)
                .filter(mapping -> !mapping.getName().equals("key.oriel.home"))
                .toArray(KeyMapping[]::new));
        // KeyMapping keeps a separate dispatch table; hiding the row alone leaves old keys active.
        KeyMapping.resetMapping();
    }
}
