package dev.rinorsi.editor.smoke.neomixin;
import com.mojang.blaze3d.platform.Window;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** NeoForge 26.3 shows the SDL window even when earlyWindowControl is disabled. Test mod only. */
@Pseudo
@Mixin(targets="net.neoforged.neoforge.client.loading.earlydisplay.EarlyWindowHandoff",remap=false)
public class NeoWindowHandoffMixin {
    @Inject(method="completeWindowHandoff",at=@At("HEAD"),cancellable=true)
    private static void hidden(Window window,CallbackInfo ci){ci.cancel();}
}
