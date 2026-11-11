package dev.rinorsi.editor.clientonly.mixin;
import dev.rinorsi.editor.clientonly.InboundDelay;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundContainerSetSlotPacket;
import net.minecraft.network.protocol.game.ClientboundContainerSetContentPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(ClientPacketListener.class)
public final class DelayedInventoryMixin {
    @Inject(method="handleContainerSetSlot",at=@At("HEAD"),cancellable=true)
    private void delaySlot(ClientboundContainerSetSlotPacket p, CallbackInfo ci) {
        if(InboundDelay.hold && Minecraft.getInstance().isSameThread()) {
            InboundDelay.queued.add(() -> ((ClientPacketListener)(Object)this).handleContainerSetSlot(p)); ci.cancel();
        }
    }
    @Inject(method="handleContainerContent",at=@At("HEAD"),cancellable=true)
    private void delayContent(ClientboundContainerSetContentPacket p, CallbackInfo ci) {
        if(InboundDelay.hold && Minecraft.getInstance().isSameThread()) {
            InboundDelay.queued.add(() -> ((ClientPacketListener)(Object)this).handleContainerContent(p)); ci.cancel();
        }
    }
}
