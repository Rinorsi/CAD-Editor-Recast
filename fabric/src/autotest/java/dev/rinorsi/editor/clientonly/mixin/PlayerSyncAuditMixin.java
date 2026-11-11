package dev.rinorsi.editor.clientonly.mixin;

import dev.rinorsi.editor.clientonly.PlayerSyncAudit;
import dev.rinorsi.editor.clientonly.QueryDelay;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.*;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientPacketListener.class)
public final class PlayerSyncAuditMixin {
    @Inject(method="handleTagQueryPacket",at=@At("HEAD"),cancellable=true)
    private void queryDelay(ClientboundTagQueryPacket packet,CallbackInfo ci){
        if(Minecraft.getInstance().isSameThread()&&QueryDelay.shouldHold()){
            QueryDelay.queued.add(()->((ClientPacketListener)(Object)this).handleTagQueryPacket(packet));ci.cancel();
        }
    }
    @Inject(method="handleTagQueryPacket",at=@At("TAIL"))
    private void queryAudit(ClientboundTagQueryPacket packet,CallbackInfo ci){
        if(Minecraft.getInstance().isSameThread())QueryDelay.record(packet);
    }
    @Inject(method="handleSetExperience", at=@At("TAIL"))
    private void experience(ClientboundSetExperiencePacket packet, CallbackInfo ci) { PlayerSyncAudit.record("experience"); }
    @Inject(method="handleMovePlayer", at=@At("TAIL"))
    private void position(ClientboundPlayerPositionPacket packet, CallbackInfo ci) { PlayerSyncAudit.record("position"); }
    @Inject(method="handleRotatePlayer", at=@At("TAIL"))
    private void rotation(ClientboundPlayerRotationPacket packet, CallbackInfo ci) { PlayerSyncAudit.record("rotation"); }
    @Inject(method="handleGameEvent", at=@At("TAIL"))
    private void mode(ClientboundGameEventPacket packet, CallbackInfo ci) {
        if (packet.getEvent() == ClientboundGameEventPacket.CHANGE_GAME_MODE) PlayerSyncAudit.record("gameMode");
    }
    @Inject(method="handleUpdateAttributes", at=@At("TAIL"))
    private void attributes(ClientboundUpdateAttributesPacket packet, CallbackInfo ci) {
        var player = Minecraft.getInstance().player;
        if (player != null && packet.getEntityId() == player.getId()) PlayerSyncAudit.record("attributes");
    }
}
