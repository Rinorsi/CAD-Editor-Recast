package dev.rinorsi.editor.fabric;

import com.mojang.brigadier.CommandDispatcher;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.platform.Platform;
import java.nio.file.Path;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;

public final class FabricPlatform implements Platform {
    public Path configDir() { return FabricLoader.getInstance().getConfigDir(); }
    public List<String> modIds() { return FabricLoader.getInstance().getAllMods().stream().map(m -> m.getMetadata().getId()).toList(); }
    public String modVersion(String id) { return FabricLoader.getInstance().getModContainer(id).map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("unknown"); }
    public String tagTranslationKey(TagKey<?> tag) { return ((net.fabricmc.fabric.api.tag.FabricTagKey)(Object)tag).getTranslationKey(); }
    public void onServerStarting(Consumer<MinecraftServer> c) { ServerLifecycleEvents.SERVER_STARTING.register(c::accept); }
    public void onServerStopped(Consumer<MinecraftServer> c) { ServerLifecycleEvents.SERVER_STOPPED.register(c::accept); }
    public void onDataReload(Runnable c) { ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((s, r, ok) -> c.run()); }
    public void onDisconnect(Consumer<ServerPlayer> c) { ServerPlayConnectionEvents.DISCONNECT.register((h, s) -> c.accept(h.player)); }
    public void onCommands(Consumer<CommandDispatcher<CommandSourceStack>> c) { CommandRegistrationCallback.EVENT.register((d, r, e) -> c.accept(d)); }
    public void receive(BiConsumer<ServerPlayer, EditorPackets.Request> c) { ServerPlayNetworking.registerGlobalReceiver(EditorPackets.Request.TYPE, (p, ctx) -> ctx.server().execute(() -> c.accept(ctx.player(), p))); }
    public void send(ServerPlayer p, EditorPackets.Reply reply) { ServerPlayNetworking.send(p, reply); }
}
