package dev.rinorsi.editor.fabric;

import dev.rinorsi.editor.client.EditorClient;
import net.fabricmc.api.ClientModInitializer;

public final class FabricEditorClient implements ClientModInitializer {
    @Override public void onInitializeClient() { new EditorClient().onInitializeClient(); }
}
