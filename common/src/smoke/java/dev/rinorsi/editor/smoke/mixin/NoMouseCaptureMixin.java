package dev.rinorsi.editor.smoke.mixin;
import dev.rinorsi.editor.smoke.MatrixSmoke;

import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Only shipped in the separate test probe, never in the Editor release. */
@Mixin(MouseHandler.class)
public final class NoMouseCaptureMixin {
    @Inject(method = "grabMouse", at = @At("HEAD"), cancellable = true)
    private void editorProbeNoCapture(CallbackInfo callback) {
        if (System.getProperty("editor.autotest") != null) callback.cancel();
    }
}
