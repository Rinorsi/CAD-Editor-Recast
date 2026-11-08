package dev.rinorsi.editor.fabric;

import com.mojang.brigadier.CommandDispatcher;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.platform.ClientPlatform;
import java.util.function.BiPredicate;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

public final class FabricClientPlatform implements ClientPlatform {
    public KeyMapping registerKey(KeyMapping key) { return KeyMappingHelper.registerKeyMapping(key); }
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onCommands(Consumer<CommandDispatcher<Object>> c) { ClientCommandRegistrationCallback.EVENT.register((d, r) -> c.accept((CommandDispatcher)d)); }
    public void onTick(Consumer<Minecraft> c) { ClientTickEvents.END_CLIENT_TICK.register(c::accept); }
    public void onStopping(Consumer<Minecraft> c) { ClientLifecycleEvents.CLIENT_STOPPING.register(c::accept); }
    public void onDisconnect(Consumer<Minecraft> c) { ClientPlayConnectionEvents.DISCONNECT.register((h, mc) -> c.accept(mc)); }
    public void onScreenKey(BiPredicate<Screen, KeyEvent> allow) { ScreenEvents.AFTER_INIT.register((mc, s, w, h) -> ScreenKeyboardEvents.allowKeyPress(s).register(allow::test)); }
    public void onResourcesReload(Runnable c) { net.fabricmc.fabric.api.resource.v1.ResourceLoader.get(net.minecraft.server.packs.PackType.CLIENT_RESOURCES).registerReloadListener(Identifier.parse("cadeditor:registry_invalidation"), (net.minecraft.server.packs.resources.ResourceManagerReloadListener) r -> c.run()); }
    public void onTagsReload(Runnable c) { net.fabricmc.fabric.api.event.lifecycle.v1.CommonLifecycleEvents.TAGS_LOADED.register((r, client) -> { if(client) c.run(); }); }
    public boolean canSend(CustomPacketPayload.Type<?> type) { return ClientPlayNetworking.canSend(type); }
    public void send(EditorPackets.Request request) { ClientPlayNetworking.send(request); }
    public void receive(Consumer<EditorPackets.Reply> c) { ClientPlayNetworking.registerGlobalReceiver(EditorPackets.Reply.TYPE, (p, ctx) -> ctx.client().execute(() -> c.accept(p))); }
}
