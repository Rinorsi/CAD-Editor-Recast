package dev.rinorsi.editor.clientonly.mixin;

import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Only shipped in the separate test probe, never in the Editor release. */
@Mixin(MouseHandler.class)
public final class NoCaptureMixin {
    @Inject(method = "grabMouse", at = @At("HEAD"), cancellable = true)
    private void editorProbeNoCapture(CallbackInfo callback) {
        if (System.getProperty("editor.autotest") != null) callback.cancel();
    }

    // Vanilla continuous attack requires logical mouse capture. Keep native capture
    // disabled, while allowing MCTest's in-game key state to drive the real loop.
    @Inject(method = "isMouseGrabbed", at = @At("HEAD"), cancellable = true)
    private void editorProbeVirtualCapture(CallbackInfoReturnable<Boolean> callback) {
        if (!"live-smoke".equals(System.getProperty("editor.autotest"))) return;
        var mc = net.minecraft.client.Minecraft.getInstance();
        if (mc.level != null && mc.screen == null) callback.setReturnValue(true);
    }
}
