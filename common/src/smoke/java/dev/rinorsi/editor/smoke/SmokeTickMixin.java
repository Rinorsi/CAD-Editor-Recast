package dev.rinorsi.editor.smoke;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(Minecraft.class)
public class SmokeTickMixin {
    @Inject(method="tick",at=@At("TAIL")) private void tick(CallbackInfo ci){MatrixSmoke.tick((Minecraft)(Object)this);}
}
