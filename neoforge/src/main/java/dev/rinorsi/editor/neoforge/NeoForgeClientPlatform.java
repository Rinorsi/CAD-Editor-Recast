package dev.rinorsi.editor.neoforge;

import com.mojang.brigadier.CommandDispatcher;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.platform.ClientPlatform;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiPredicate;
import java.util.function.Consumer;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.ResourceManagerReloadListener;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.*;
import net.neoforged.neoforge.client.event.lifecycle.ClientStoppingEvent;
import net.neoforged.neoforge.client.network.ClientPacketDistributor;
import net.neoforged.neoforge.client.network.event.RegisterClientPayloadHandlersEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.TagsUpdatedEvent;

public final class NeoForgeClientPlatform implements ClientPlatform {
    private final List<KeyMapping> keys = new ArrayList<>();
    private final List<Runnable> reloads = new ArrayList<>();
    private Consumer<EditorPackets.Reply> receiver;
    void initialize(IEventBus bus) {
        bus.addListener((RegisterKeyMappingsEvent e) -> keys.forEach(e::register));
        bus.addListener((AddClientReloadListenersEvent e) -> e.addListener(Identifier.parse("cadeditor:registry_invalidation"),
                (ResourceManagerReloadListener) r -> reloads.forEach(Runnable::run)));
        bus.addListener((RegisterClientPayloadHandlersEvent e) -> e.register(EditorPackets.Reply.TYPE, (p, c) -> receiver.accept(p)));
    }
    public KeyMapping registerKey(KeyMapping key) { keys.add(key); return key; }
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onCommands(Consumer<CommandDispatcher<Object>> c) { NeoForge.EVENT_BUS.addListener((RegisterClientCommandsEvent e) -> c.accept((CommandDispatcher)e.getDispatcher())); }
    public void onTick(Consumer<Minecraft> c) { NeoForge.EVENT_BUS.addListener((ClientTickEvent.Post e) -> c.accept(Minecraft.getInstance())); }
    public void onStopping(Consumer<Minecraft> c) { NeoForge.EVENT_BUS.addListener((ClientStoppingEvent e) -> c.accept(Minecraft.getInstance())); }
    public void onDisconnect(Consumer<Minecraft> c) { NeoForge.EVENT_BUS.addListener((ClientPlayerNetworkEvent.LoggingOut e) -> c.accept(Minecraft.getInstance())); }
    public void onScreenKey(BiPredicate<Screen, KeyEvent> allow) { NeoForge.EVENT_BUS.addListener((ScreenEvent.KeyPressed.Pre e) -> { if (!allow.test(e.getScreen(), e.getKeyEvent())) e.setCanceled(true); }); }
    public void onResourcesReload(Runnable c) { reloads.add(c); }
    public void onTagsReload(Runnable c) { NeoForge.EVENT_BUS.addListener((TagsUpdatedEvent.ClientPacketReceived e) -> c.run()); }
    public boolean canSend(CustomPacketPayload.Type<?> type) { var c = Minecraft.getInstance().getConnection(); return c != null && c.hasChannel(type.id()); }
    public void send(EditorPackets.Request request) { ClientPacketDistributor.sendToServer(request); }
    public void receive(Consumer<EditorPackets.Reply> c) { receiver = c; }
}
