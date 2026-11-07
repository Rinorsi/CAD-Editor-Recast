package dev.rinorsi.editor.accept.mixin;
import dev.rinorsi.editor.client.EditorClient;
import dev.rinorsi.editor.registry.AcceptanceProbe;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** Captures the real host instance in the opt-in probe only. */
@Mixin(EditorClient.class)
public class AcceptanceClientMixin {
    @Inject(method="onInitializeClient", at=@At("TAIL"))
    private void capture(CallbackInfo ci) { AcceptanceProbe.editor = (EditorClient)(Object)this; }
}
