package dev.rinorsi.editor.clientonly.mixin;
import dev.rinorsi.editor.clientonly.CommandAudit;
import net.minecraft.client.multiplayer.ClientPacketListener;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(ClientPacketListener.class)
public final class CommandAuditMixin {
    @Inject(method="sendCommand",at=@At("HEAD"))
    private void auditCommand(String command,CallbackInfo ci){CommandAudit.record(command);}
}
