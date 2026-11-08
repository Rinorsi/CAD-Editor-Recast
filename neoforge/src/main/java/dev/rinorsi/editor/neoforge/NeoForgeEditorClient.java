package dev.rinorsi.editor.neoforge;

import dev.rinorsi.editor.client.EditorClient;
import dev.rinorsi.editor.platform.ClientPlatform;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

@Mod(value = "cadeditor", dist = Dist.CLIENT)
public final class NeoForgeEditorClient {
    public NeoForgeEditorClient(IEventBus bus) {
        ((NeoForgeClientPlatform)ClientPlatform.get()).initialize(bus);
        new EditorClient().onInitializeClient();
    }
}
