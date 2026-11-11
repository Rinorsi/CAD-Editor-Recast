package dev.rinorsi.editor.mixin.client;

import java.util.Map;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The loaded atlas has no public sprite enumeration API. Read only on the client thread. */
@Mixin(TextureAtlas.class)
public interface EditorAtlasAccessor {
    @Accessor("texturesByName") Map<Identifier, TextureAtlasSprite> cadeditor$sprites();
}
