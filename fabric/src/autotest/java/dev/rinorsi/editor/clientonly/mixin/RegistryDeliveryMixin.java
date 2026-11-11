package dev.rinorsi.editor.clientonly.mixin;
import dev.rinorsi.editor.clientonly.RegistryDelivery;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Pseudo
@Mixin(targets="dev.oriel.mod.client.DocumentDriver",remap=false)
public final class RegistryDeliveryMixin {
    @Inject(method="patchJson(Ljava/lang/String;Ljava/lang/String;)V",at=@At("HEAD"),cancellable=true,remap=false)
    private void holdRegistry(String key,String json,CallbackInfo ci){if(RegistryDelivery.capture(this,key,json))ci.cancel();}
}
