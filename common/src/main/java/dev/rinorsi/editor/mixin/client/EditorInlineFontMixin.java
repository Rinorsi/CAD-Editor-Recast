package dev.rinorsi.editor.mixin.client;

import java.util.List;
import dev.rinorsi.editor.registry.InlineTextFont;
import net.minecraft.network.chat.FontDescription;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The same vanilla glyph style drives both Oriel measurement and drawing. */
@Mixin(targets = "dev.oriel.mod.internal.client.render.McFontMetrics", remap = false)
public abstract class EditorInlineFontMixin {
    @Inject(method = "font", at = @At("HEAD"), cancellable = true)
    private void cadeditor$inlineSprite(List<String> families, CallbackInfoReturnable<FontDescription> result) {
        FontDescription font = InlineTextFont.resolve(families);
        if (font != null) result.setReturnValue(font);
    }
}
