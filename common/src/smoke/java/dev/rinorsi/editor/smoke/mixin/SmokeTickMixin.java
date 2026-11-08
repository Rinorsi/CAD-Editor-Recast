package dev.rinorsi.editor.smoke.mixin;
import dev.rinorsi.editor.smoke.MatrixSmoke;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(Minecraft.class)
public class SmokeTickMixin {
    // 26.2 explicitly shows the GLFW window after creation; suppress this in the test-only probe.
    //? if >=26.2 && <26.3 {
    /*@Redirect(method="<init>",at=@At(value="INVOKE",target="Lorg/lwjgl/glfw/GLFW;glfwShowWindow(J)V"))
    private void noShow(long window) {}
    *///?}

    @Inject(method="tick",at=@At("HEAD")) private void tick(CallbackInfo ci){MatrixSmoke.tick((Minecraft)(Object)this);}
}
