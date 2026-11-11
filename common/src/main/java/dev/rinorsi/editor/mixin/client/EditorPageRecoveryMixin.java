package dev.rinorsi.editor.mixin.client;

import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.client.EditorPageRecovery;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Only the local Editor page replaces the shared driver's generic error panel. */
@Mixin(value = DocumentDriver.class, remap = false)
public abstract class EditorPageRecoveryMixin {
    @Shadow private dev.oriel.engine.dom.Document document;
    @Unique private boolean cadeditor$recoveryDrawn;
    @Inject(method = "fail", at = @At("HEAD"))
    private void cadeditor$failure(String title, Throwable error, CallbackInfo ci) {
        EditorPageRecovery.failed((DocumentDriver) (Object) this, title, error, document);
    }
    @Inject(method = "extractPage", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativePanel(GuiGraphicsExtractor g, int mouseX, int mouseY, CallbackInfo ci) {
        cadeditor$recoveryDrawn = EditorPageRecovery.draw((DocumentDriver) (Object) this, g, mouseX, mouseY);
        if (cadeditor$recoveryDrawn) ci.cancel();
    }
    @Inject(method = "extractPage", at = @At("RETURN"))
    private void cadeditor$firstFailureFrame(GuiGraphicsExtractor g, int mouseX, int mouseY, CallbackInfo ci) {
        if (!cadeditor$recoveryDrawn) EditorPageRecovery.draw((DocumentDriver) (Object) this, g, mouseX, mouseY);
    }
    @Inject(method = "mouseClicked", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeClick(MouseButtonEvent event, CallbackInfoReturnable<Boolean> ci) {
        if (EditorPageRecovery.active((DocumentDriver) (Object) this)) ci.setReturnValue(EditorPageRecovery.click((DocumentDriver) (Object) this, event));
    }
    @Inject(method = "mouseReleased", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeRelease(MouseButtonEvent event, CallbackInfoReturnable<Boolean> ci) {
        if (EditorPageRecovery.active((DocumentDriver) (Object) this)) ci.setReturnValue(true);
    }
    @Inject(method = "keyPressed", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeKey(KeyEvent event, CallbackInfoReturnable<Boolean> ci) {
        if (EditorPageRecovery.active((DocumentDriver) (Object) this)) ci.setReturnValue(EditorPageRecovery.key((DocumentDriver) (Object) this, event));
    }
    @Inject(method = "mouseMoved", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeMove(double x, double y, CallbackInfoReturnable<Boolean> ci) { cadeditor$blockPageInput(ci); }
    @Inject(method = "mouseScrolled", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeScroll(double x, double y, double dx, double dy, CallbackInfoReturnable<Boolean> ci) { cadeditor$blockPageInput(ci); }
    @Inject(method = "keyReleased", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeKeyRelease(KeyEvent event, CallbackInfoReturnable<Boolean> ci) { cadeditor$blockPageInput(ci); }
    @Inject(method = "charTyped", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeCharacter(net.minecraft.client.input.CharacterEvent event, CallbackInfoReturnable<Boolean> ci) { cadeditor$blockPageInput(ci); }
    @Inject(method = "preedit", at = @At("HEAD"), cancellable = true)
    private void cadeditor$nativeComposition(net.minecraft.client.input.PreeditEvent event, CallbackInfoReturnable<Boolean> ci) { cadeditor$blockPageInput(ci); }
    @Unique private void cadeditor$blockPageInput(CallbackInfoReturnable<Boolean> ci) {
        if (EditorPageRecovery.active((DocumentDriver) (Object) this)) ci.setReturnValue(true);
    }
}
