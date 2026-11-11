package dev.rinorsi.editor.client;

import net.minecraft.client.KeyMapping;
import net.minecraft.resources.Identifier;

/** One shared controls category, registered once for all editor shortcuts. */
final class EditorKeyBindings {
    static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(Identifier.parse("cadeditor:editor"));

    private EditorKeyBindings() {}
}
