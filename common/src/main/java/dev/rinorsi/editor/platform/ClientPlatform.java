package dev.rinorsi.editor.platform;

import com.mojang.brigadier.CommandDispatcher;
import dev.rinorsi.editor.EditorPackets;
import java.util.ServiceLoader;
import java.util.function.BiPredicate;
import java.util.function.Consumer;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Physical-client-only services. Commands never inspect a loader-specific source. */
public interface ClientPlatform {
    static ClientPlatform get() { return Holder.INSTANCE; }
    final class Holder {
        private static final ClientPlatform INSTANCE = ServiceLoader.load(ClientPlatform.class).findFirst().orElseThrow();
        private Holder() {}
    }
    KeyMapping registerKey(KeyMapping key);
    void onCommands(Consumer<CommandDispatcher<Object>> callback);
    void onTick(Consumer<Minecraft> callback);
    void onStopping(Consumer<Minecraft> callback);
    void onDisconnect(Consumer<Minecraft> callback);
    void onScreenKey(BiPredicate<Screen, KeyEvent> allow);
    void onResourcesReload(Runnable callback);
    void onTagsReload(Runnable callback);
    boolean canSend(CustomPacketPayload.Type<?> type);
    void send(EditorPackets.Request request);
    void receive(Consumer<EditorPackets.Reply> callback);
}
