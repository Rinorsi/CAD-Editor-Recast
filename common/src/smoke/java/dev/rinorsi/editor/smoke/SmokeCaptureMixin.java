package dev.rinorsi.editor.smoke;
import dev.rinorsi.editor.client.EditorClient;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** Captures the real host instance in the opt-in probe only. */
@Mixin(EditorClient.class)
public class SmokeCaptureMixin {
    @Inject(method="onInitializeClient", at=@At("TAIL"))
    private void capture(CallbackInfo ci) { MatrixSmoke.editor = (EditorClient)(Object)this; }
}
