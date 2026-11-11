package dev.rinorsi.editor.neoforge;

import com.mojang.brigadier.CommandDispatcher;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.platform.Platform;
import java.nio.file.Path;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.neoforged.fml.ModList;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.TagsUpdatedEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartingEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.network.PacketDistributor;

public final class NeoForgePlatform implements Platform {
    private BiConsumer<ServerPlayer, EditorPackets.Request> receiver;
    public Path configDir() { return FMLPaths.CONFIGDIR.get(); }
    public List<String> modIds() { return ModList.get().getMods().stream().map(m -> m.getModId()).toList(); }
    public String modVersion(String id) { return ModList.get().getModContainerById(id).map(m -> m.getModInfo().getVersion().toString()).orElse("unknown"); }
    public String tagTranslationKey(TagKey<?> tag) {
        return net.neoforged.neoforge.common.Tags.getTagTranslationKey(tag);
    }
    public void onServerStarting(Consumer<MinecraftServer> c) { NeoForge.EVENT_BUS.addListener((ServerStartingEvent e) -> c.accept(e.getServer())); }
    public void onServerStopped(Consumer<MinecraftServer> c) { NeoForge.EVENT_BUS.addListener((ServerStoppedEvent e) -> c.accept(e.getServer())); }
    public void onDataReload(Runnable c) { NeoForge.EVENT_BUS.addListener((TagsUpdatedEvent.ServerDataLoad e) -> c.run()); }
    public void onDisconnect(Consumer<ServerPlayer> c) { NeoForge.EVENT_BUS.addListener((PlayerEvent.PlayerLoggedOutEvent e) -> { if (e.getEntity() instanceof ServerPlayer p) c.accept(p); }); }
    public void onCommands(Consumer<CommandDispatcher<CommandSourceStack>> c) { NeoForge.EVENT_BUS.addListener((RegisterCommandsEvent e) -> c.accept(e.getDispatcher())); }
    public void receive(BiConsumer<ServerPlayer, EditorPackets.Request> c) { receiver = c; }
    void receiveRequest(ServerPlayer player, EditorPackets.Request p) { receiver.accept(player, p); }
    public void send(ServerPlayer p, EditorPackets.Reply reply) { for(String frame:dev.rinorsi.editor.EditorWire.frames(reply.json()))PacketDistributor.sendToPlayer(p, new EditorPackets.Reply(frame)); }
}
