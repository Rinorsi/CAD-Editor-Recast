package dev.rinorsi.editor.neoforge;

import dev.rinorsi.editor.EditorMod;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.platform.Platform;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.minecraft.server.level.ServerPlayer;

@Mod("cadeditor")
public final class NeoForgeEditor {
    public NeoForgeEditor(IEventBus bus) {
        new EditorMod().onInitialize();
        bus.addListener((RegisterPayloadHandlersEvent e) -> {
            var registrar = e.registrar("1").optional();
            registrar.playToClient(EditorPackets.Reply.TYPE, EditorPackets.Reply.CODEC);
            registrar.playToServer(EditorPackets.Request.TYPE, EditorPackets.Request.CODEC, (p, c) -> {
                if (c.player() instanceof ServerPlayer player) ((NeoForgePlatform)Platform.get()).receiveRequest(player, p);
            });
        });
    }
}
