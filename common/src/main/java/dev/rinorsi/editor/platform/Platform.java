package dev.rinorsi.editor.platform;

import com.mojang.brigadier.CommandDispatcher;
import dev.rinorsi.editor.EditorPackets;
import java.nio.file.Path;
import java.util.List;
import java.util.ServiceLoader;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;

/** Loader services only; editing and validation remain in common. No client types on this boundary. */
public interface Platform {
    static Platform get() { return Holder.INSTANCE; }
    final class Holder {
        private static final Platform INSTANCE = ServiceLoader.load(Platform.class).findFirst().orElseThrow();
        private Holder() {}
    }
    Path configDir();
    List<String> modIds();
    String modVersion(String id);
    default boolean isModLoaded(String id) { return modIds().contains(id); }
    String tagTranslationKey(TagKey<?> tag);
    void onServerStarting(Consumer<MinecraftServer> callback);
    void onServerStopped(Consumer<MinecraftServer> callback);
    void onDataReload(Runnable callback);
    void onDisconnect(Consumer<ServerPlayer> callback);
    void onCommands(Consumer<CommandDispatcher<CommandSourceStack>> callback);
    void receive(BiConsumer<ServerPlayer, EditorPackets.Request> callback);
    void send(ServerPlayer player, EditorPackets.Reply reply);
}
