package dev.rinorsi.editor.mixin.client;

import dev.oriel.mod.client.DocumentDriver;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Three normal back steps must not trigger the shared driver's emergency close. */
@Mixin(value = DocumentDriver.class, remap = false)
public abstract class EditorEscapeMixin {
    @Shadow public abstract String name();

    // The driver has no per-page switch for this fallback. Shift+Escape still bypasses page handlers.
    @Inject(method = "keptTooManyEscapes", at = @At("HEAD"), cancellable = true)
    private void cadeditor$keepBackNavigation(long now, CallbackInfoReturnable<Boolean> result) {
        if ("cadeditor:ui/index.html".equals(name())) result.setReturnValue(false);
    }
}
