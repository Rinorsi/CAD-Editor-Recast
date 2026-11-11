package dev.rinorsi.editor.mixin.client;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Options;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Vanilla exposes no API for removing a library-only shortcut after loader registration. */
@Mixin(Options.class)
public interface EditorOptionsAccessor {
    @Mutable
    @Accessor("keyMappings")
    void cadeditor$setKeyMappings(KeyMapping[] mappings);
}
