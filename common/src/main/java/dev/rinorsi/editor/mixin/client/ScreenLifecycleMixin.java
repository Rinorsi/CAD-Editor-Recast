package dev.rinorsi.editor.mixin.client;

import dev.rinorsi.editor.client.EditorLayerScreen;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

// No public cross-loader API pushes a modal screen without disposing the old menu.
//? if >=26.2 {
@Mixin(value = net.minecraft.client.gui.Gui.class, remap = false)
//?} else
//@Mixin(value = net.minecraft.client.Minecraft.class, remap = false)
public abstract class ScreenLifecycleMixin {
    @Redirect(method = "setScreen", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/screens/Screen;removed()V"), require = 1)
    private void cadeditor$keepSuspendedInventory(Screen previous) {
        EditorLayerScreen.removeForTransition(previous);
    }
}
