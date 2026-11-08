package dev.rinorsi.editor.fabric;

import dev.rinorsi.editor.EditorMod;
import dev.rinorsi.editor.EditorPackets;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;

public final class FabricEditor implements ModInitializer {
    @Override public void onInitialize() {
        PayloadTypeRegistry.serverboundPlay().register(EditorPackets.Request.TYPE, EditorPackets.Request.CODEC);
        PayloadTypeRegistry.clientboundPlay().register(EditorPackets.Reply.TYPE, EditorPackets.Reply.CODEC);
        new EditorMod().onInitialize();
    }
}
