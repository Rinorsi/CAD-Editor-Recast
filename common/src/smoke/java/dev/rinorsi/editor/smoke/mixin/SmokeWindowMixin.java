package dev.rinorsi.editor.smoke.mixin;
import dev.rinorsi.editor.smoke.MatrixSmoke;
import com.mojang.blaze3d.platform.Window;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
@Mixin(Window.class)
public class SmokeWindowMixin {
    // SDL replaces GLFW in 26.3; flags are set before native window creation.
    //? if <26.3 {
    /*@Inject(method="createGlfwWindow",at=@At(value="INVOKE",target="Lorg/lwjgl/glfw/GLFW;glfwCreateWindow(IILjava/lang/CharSequence;JJ)J"))
    private static void hidden(CallbackInfoReturnable<Long> ci) {
        org.lwjgl.glfw.GLFW.glfwWindowHint(org.lwjgl.glfw.GLFW.GLFW_FOCUSED,0);
        org.lwjgl.glfw.GLFW.glfwWindowHint(org.lwjgl.glfw.GLFW.GLFW_FOCUS_ON_SHOW,0);
        org.lwjgl.glfw.GLFW.glfwWindowHint(org.lwjgl.glfw.GLFW.GLFW_VISIBLE,0);
        org.lwjgl.glfw.GLFW.glfwWindowHint(org.lwjgl.glfw.GLFW.GLFW_POSITION_X,-32000);
        org.lwjgl.glfw.GLFW.glfwWindowHint(org.lwjgl.glfw.GLFW.GLFW_POSITION_Y,-32000);
    }
    *///?} else {
    @ModifyArg(method="createWindow",at=@At(value="INVOKE",target="Lcom/mojang/renderpearl/api/device/GpuBackend;createWindow(Ljava/lang/String;IIJ)J"),index=3)
    private long hidden(long flags){return flags|org.lwjgl.sdl.SDLVideo.SDL_WINDOW_HIDDEN|org.lwjgl.sdl.SDLVideo.SDL_WINDOW_NOT_FOCUSABLE;}
    //?}
}
