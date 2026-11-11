package dev.rinorsi.editor.clientonly;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.nio.file.*;
import java.util.Optional;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import org.lwjgl.glfw.GLFW;

/** Independent instrumentation: no Editor/Oriel imports or permission overrides. */
public final class LanProbe implements ClientModInitializer {
    private String previous = "";
    private Path run;
    @Override public void onInitializeClient() {
        run = FabricLoader.getInstance().getGameDir();
        JsonArray mods = new JsonArray();
        FabricLoader.getInstance().getAllMods().forEach(m -> {
            JsonObject v = new JsonObject(); v.addProperty("id", m.getMetadata().getId());
            v.addProperty("version", m.getMetadata().getVersion().getFriendlyString());
            var origin = m.getOrigin();
            v.addProperty("origin", origin.getKind() == net.fabricmc.loader.api.metadata.ModOrigin.Kind.PATH ? origin.getPaths().toString() : origin.getKind().toString()); mods.add(v);
        });
        write("mods.json", mods);
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            try { Files.writeString(run.resolve("messages.jsonl"), new Gson().toJson(message.getString()) + "\n", StandardOpenOption.CREATE, StandardOpenOption.APPEND); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }
    private static void hoverOwnedInventory(Minecraft mc, int index) throws Exception {
        var screen = (net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?>) mc.screen;
        boolean wrapped = screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
        if (wrapped) {
            var select = screen.getClass().getDeclaredMethod("selectTab", net.minecraft.world.item.CreativeModeTab.class);
            select.setAccessible(true);
            select.invoke(screen, net.minecraft.core.registries.BuiltInRegistries.CREATIVE_MODE_TAB.getValue(net.minecraft.world.item.CreativeModeTabs.INVENTORY));
        }
        int number = wrapped ? mc.player.inventoryMenu.slots.stream().filter(s -> s.container == mc.player.getInventory() && s.getContainerSlot() == index).findFirst().orElseThrow().index : index;
        var slot = screen.getMenu().slots.stream().filter(s -> s.container == mc.player.getInventory() && s.getContainerSlot() == number).findFirst().orElseThrow();
        var field = net.minecraft.client.gui.screens.inventory.AbstractContainerScreen.class.getDeclaredField("hoveredSlot"); field.setAccessible(true); field.set(screen, slot);
    }
    private void tick(Minecraft mc) {
        Path path = run.resolve("request.json");
        if (!Files.exists(path)) return;
        JsonObject out = new JsonObject();
        try {
            JsonObject in = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
            String id = in.get("id").getAsString(); if (id.equals(previous)) return; previous = id;
            out.addProperty("id", id);
            String action = in.get("action").getAsString();
            if (action.equals("publish")) {
                var server = mc.getSingleplayerServer();
                if (server == null) throw new IllegalStateException("No integrated server");
                // Test accounts have no Microsoft session. Only this isolated LAN uses
                // offline authentication; item permissions and commands remain vanilla.
                server.setUsesAuthentication(false);
                out.addProperty("published", server.publishServer(GameType.SURVIVAL, false, in.get("port").getAsInt()));
                out.addProperty("onlineAuthentication", server.usesAuthentication());
                out.addProperty("port", server.getPort());
            } else if (action.equals("operator")) {
                var server = mc.getSingleplayerServer();
                server.submit(() -> {
                    var player=server.getPlayerList().getPlayerByName(in.get("name").getAsString());
                    if (in.get("grant").getAsBoolean()) server.getPlayerList().op(player.nameAndId());
                    else server.getPlayerList().deop(player.nameAndId());
                    return true;
                }).get();
            } else if (action.equals("serverCommand")) {
                var server = mc.getSingleplayerServer();
                if (server == null) throw new IllegalStateException("Host only");
                server.submit(() -> { server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), in.get("command").getAsString()); return true; }).get();
            } else if (action.equals("ownedBackupProceed")) {
                if (System.getProperty("editor.clientOnly.owner", "").isBlank()
                        || !(mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen))
                    throw new IllegalStateException("Owned isolated BackupConfirmScreen only");
                String label=net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString();
                var buttons=mc.screen.children().stream().filter(child->child instanceof net.minecraft.client.gui.components.Button button&&button.getMessage().getString().equals(label)).toList();
                if(buttons.size()!=1)throw new IllegalStateException("Unique vanilla continue button missing");
                out.addProperty("actualVanillaButton",label);
                ((net.minecraft.client.gui.components.Button)buttons.getFirst()).onPress(new net.minecraft.client.input.KeyEvent(GLFW.GLFW_KEY_ENTER,0,0));
            } else if (action.equals("registryDelivery")) {
                out.add("delivery",RegistryDelivery.action(mc,in.get("operation").getAsString()));
            } else if (action.equals("registryFacts")) {
                var server=mc.getSingleplayerServer();if(server==null)throw new IllegalStateException("Host registry readback only");
                out.add("registryFacts",server.submit(()->{
                    var registry=server.registryAccess().lookupOrThrow(net.minecraft.core.registries.Registries.ENCHANTMENT);
                    var rows=new JsonArray();for(var enchantId:registry.keySet()){
                        var row=new JsonObject();row.addProperty("id",enchantId.toString());
                        row.addProperty("max",registry.getValue(enchantId).getMaxLevel());rows.add(row);
                    }
                    var result=new JsonObject();result.addProperty("source","host-server-thread-read-only-dynamic-enchantment-registry");result.add("enchantments",rows);return result;
                }).get());
            } else if (action.equals("registryResourceReload")) {
                // Real public resource reload, not a fabricated RegistryBridge epoch or fact.
                mc.reloadResourcePacks();out.addProperty("reloadRequested",true);
            } else if (action.equals("entityFields")) {
                var server=mc.getSingleplayerServer();if(server==null)throw new IllegalStateException("Host only");
                var uuid=java.util.UUID.fromString(in.get("uuid").getAsString());
                out.add("entityFields",server.submit(()->{var entity=server.overworld().getEntity(uuid);if(entity==null)throw new IllegalStateException("Fixture entity missing");
                    var row=new JsonObject();row.addProperty("source","host-server-thread-read-only");row.addProperty("uuid",entity.getStringUUID());row.addProperty("entityId",entity.getId());
                    var saved=net.minecraft.world.level.storage.TagValueOutput.createWithContext(net.minecraft.util.ProblemReporter.DISCARDING,entity.registryAccess());entity.saveWithoutId(saved);var tag=saved.buildResult();row.addProperty("snbt",tag.toString());row.addProperty("noAI",tag.getBoolean("NoAI").orElse(false));row.addProperty("health",tag.getFloat("Health").orElse(-1f));
                    row.addProperty("invulnerable",entity.isInvulnerable());row.addProperty("silent",entity.isSilent());row.addProperty("noGravity",entity.isNoGravity());
                    var passengers=new JsonArray();for(var p:entity.getPassengers()){var pr=new JsonObject();pr.addProperty("uuid",p.getStringUUID());pr.addProperty("type",net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(p.getType()).toString());var ps=net.minecraft.world.level.storage.TagValueOutput.createWithContext(net.minecraft.util.ProblemReporter.DISCARDING,p.registryAccess());p.saveWithoutId(ps);pr.addProperty("snbt",ps.buildResult().toString());passengers.add(pr);}row.add("passengers",passengers);return row;}).get());
            } else if (action.equals("openEntity")) {
                var entity=mc.level.getEntity(in.get("entityId").getAsInt());if(entity==null)throw new IllegalStateException("Client fixture entity missing");
                mc.hitResult=new net.minecraft.world.phys.EntityHitResult(entity);
                var method=Class.forName("dev.rinorsi.editor.client.WorldEditorClient").getDeclaredMethod("open",String.class,JsonObject.class);method.setAccessible(true);method.invoke(null,"entity",null);
            } else if (action.equals("playerFields")) {
                var server = mc.getSingleplayerServer();
                if (server == null) throw new IllegalStateException("Host server readback only");
                out.add("playerFields", server.submit(() -> PlayerFields.read(server.getPlayerList()
                        .getPlayerByName(in.get("name").getAsString()))).get());
            } else if (action.equals("enterBee")) {
                var server=mc.getSingleplayerServer();if(server==null)throw new IllegalStateException("Host fixture only");
                var pos=new net.minecraft.core.BlockPos(in.get("x").getAsInt(),in.get("y").getAsInt(),in.get("z").getAsInt());
                var uuid=java.util.UUID.fromString(in.get("uuid").getAsString());
                out.add("enterBee",server.submit(()->{var block=server.overworld().getBlockEntity(pos);var entity=server.overworld().getEntity(uuid);if(!(block instanceof net.minecraft.world.level.block.entity.BeehiveBlockEntity hive)||!(entity instanceof net.minecraft.world.entity.animal.bee.Bee bee))throw new IllegalStateException("Actual bee/hive fixture missing");var row=new JsonObject();row.addProperty("path","vanilla BeehiveBlockEntity.addOccupant(real summoned Bee), no NBT response rewrite");row.addProperty("entityUuid",bee.getStringUUID());hive.addOccupant(bee);row.addProperty("occupants",hive.getOccupantCount());row.addProperty("saved",hive.saveWithFullMetadata(server.registryAccess()).toString());return row;}).get());
            } else if (action.equals("blockFields")) {
                var server=mc.getSingleplayerServer();if(server==null)throw new IllegalStateException("Host only");
                var pos=new net.minecraft.core.BlockPos(in.get("x").getAsInt(),in.get("y").getAsInt(),in.get("z").getAsInt());
                out.add("blockFields",server.submit(()->{var block=server.overworld().getBlockEntity(pos);if(block==null)throw new IllegalStateException("No fixture block entity");var row=new JsonObject();var tag=block.saveWithFullMetadata(server.registryAccess());row.addProperty("source","host-server-thread-read-only");row.addProperty("snbt",tag.toString());row.addProperty("type",net.minecraft.core.registries.BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(block.getType()).toString());if(tag.getList("bees").isPresent()){var b=tag.getList("bees").orElseThrow();if(!b.isEmpty()&&b.get(0) instanceof net.minecraft.nbt.CompoundTag bee)row.addProperty("beeEntitySnbt",bee.getCompound("entity_data").orElseThrow().toString());}return row;}).get());
            } else if (action.equals("openBlock")) {
                var pos=new net.minecraft.core.BlockPos(in.get("x").getAsInt(),in.get("y").getAsInt(),in.get("z").getAsInt());
                mc.hitResult=new net.minecraft.world.phys.BlockHitResult(net.minecraft.world.phys.Vec3.atCenterOf(pos),net.minecraft.core.Direction.UP,pos,false);
                var method=Class.forName("dev.rinorsi.editor.client.WorldEditorClient").getDeclaredMethod("open",String.class,JsonObject.class);method.setAccessible(true);method.invoke(null,"block",null);
            } else if (action.equals("collisionAt")) {
                var server=mc.getSingleplayerServer();if(server==null)throw new IllegalStateException("Host only");
                out.add("collisionAt",server.submit(()->{var player=server.getPlayerList().getPlayerByName(in.get("name").getAsString());double x=in.get("x").getAsDouble(),y=in.get("y").getAsDouble(),z=in.get("z").getAsDouble();var pos=net.minecraft.core.BlockPos.containing(x,y,z);var row=new JsonObject();row.addProperty("x",x);row.addProperty("y",y);row.addProperty("z",z);row.addProperty("source","host-server-thread-read-only-no-teleport");row.addProperty("dimension",player.level().dimension().identifier().toString());row.addProperty("collisionFree",player.level().noCollision(player,player.getBoundingBox().move(x-player.getX(),y-player.getY(),z-player.getZ())));for(int dy=0;dy<=1;dy++)row.addProperty("block"+dy,net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(player.level().getBlockState(pos.offset(0,dy,0)).getBlock()).toString());return row;}).get());
            } else if (action.equals("command")) { mc.getConnection().sendCommand(in.get("command").getAsString());
            } else if (action.equals("resizeWindow")) {
                int width=in.get("width").getAsInt(), height=in.get("height").getAsInt();
                if(width<640||width>1920||height<360||height>1080)throw new IllegalArgumentException("Owned layout dimensions only");
                GLFW.glfwSetWindowSize(mc.getWindow().handle(),width,height);
                out.addProperty("requestedWidth",width);out.addProperty("requestedHeight",height);
            } else if (action.equals("eval")) {
                var automation=Class.forName("dev.oriel.mod.client.OrielAutomation");
                Object page = in.has("hud") ? ((Optional<?>) automation.getMethod("hud",net.minecraft.resources.Identifier.class).invoke(null,net.minecraft.resources.Identifier.parse(in.get("hud").getAsString()))).orElseThrow()
                        : ((Optional<?>) automation.getMethod("screen").invoke(null)).orElseThrow();
                Object value = ((Optional<?>) page.getClass().getMethod("eval", String.class).invoke(page, in.get("js").getAsString())).orElseThrow();
                out.add("value", (JsonElement)value);
            } else if (action.equals("pagePointer")) { NativePageInput.pointer(mc,in,out);
            } else if (action.equals("pageKey")) { NativePageInput.key(mc,in,out);
            } else if (action.equals("pageType")) { NativePageInput.type(mc,in,out);
            } else if (action.equals("clipboardPush")) { NativePageInput.pushClipboard(mc,in,out);
            } else if (action.equals("clipboardRead")) { NativePageInput.readClipboard(mc,out);
            } else if (action.equals("clipboardPop")) { NativePageInput.popClipboard(mc,out);
            } else if (action.equals("reloadPage")) {
                var type=Class.forName("dev.oriel.mod.client.DocumentDriver");
                Object driver=type.getMethod("of",net.minecraft.client.gui.screens.Screen.class).invoke(null,mc.screen);
                Object before=type.getMethod("document").invoke(driver);
                type.getMethod("reload").invoke(driver);
                Object after=type.getMethod("document").invoke(driver);
                out.addProperty("documentBefore",System.identityHashCode(before));
                out.addProperty("documentAfter",System.identityHashCode(after));
                out.addProperty("documentChanged",before!=after);
            } else if (action.equals("holdQueries")) { QueryDelay.hold=true;QueryDelay.passBeforeHolding=0;
            } else if (action.equals("holdConfirmationQuery")) { QueryDelay.hold=true;QueryDelay.passBeforeHolding=1;
            } else if (action.equals("releaseQueries")) { QueryDelay.release();
            } else if (action.equals("occupyQuery")) {
                mc.getConnection().getDebugQueryHandler().queryEntityTag(mc.player.getId(),tag -> write("independent-query-callback.json",new com.google.gson.JsonPrimitive(tag.toString())));
            } else if (action.equals("disconnectSelf")) {
                mc.getConnection().getConnection().disconnect(net.minecraft.network.chat.Component.literal("Owned LAN test disconnect"));
            } else if (action.equals("reconnectSelf")) {
                int port=in.get("port").getAsInt();if(port<25781||port>25783)throw new IllegalArgumentException("Owned LAN ports only");
                if(mc.getConnection()!=null)throw new IllegalStateException("Already connected");
                var address=new net.minecraft.client.multiplayer.resolver.ServerAddress("127.0.0.1",port);
                var data=new net.minecraft.client.multiplayer.ServerData("Owned LAN fixture","127.0.0.1:"+port,net.minecraft.client.multiplayer.ServerData.Type.LAN);
                net.minecraft.client.gui.screens.ConnectScreen.startConnecting(new net.minecraft.client.gui.screens.TitleScreen(),mc,address,data,false,null);
            } else if (action.equals("holdInventory")) { InboundDelay.hold=true;
            } else if (action.equals("releaseInventory")) { InboundDelay.release();
            } else if (action.equals("openChest")) {
                var pos=mc.player.blockPosition().south();
                mc.gameMode.useItemOn(mc.player,net.minecraft.world.InteractionHand.MAIN_HAND,new net.minecraft.world.phys.BlockHitResult(net.minecraft.world.phys.Vec3.atCenterOf(pos),net.minecraft.core.Direction.UP,pos,false));
            } else if (action.equals("hoverOwnedInventory")) {
                hoverOwnedInventory(mc, in.get("index").getAsInt());
                net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(mc.screen).invoker().allowKeyPress(mc.screen,new net.minecraft.client.input.KeyEvent(GLFW.GLFW_KEY_I,0,0));
            } else if (action.equals("hoverMenu")) {
                var field = net.minecraft.client.gui.screens.inventory.AbstractContainerScreen.class.getDeclaredField("hoveredSlot");field.setAccessible(true);
                field.set(mc.screen, mc.player.containerMenu.getSlot(in.get("menuSlot").getAsInt()));
                net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(mc.screen).invoker().allowKeyPress(mc.screen,new net.minecraft.client.input.KeyEvent(GLFW.GLFW_KEY_I,0,0));
            } else if (action.equals("inventory")) {
                mc.setScreen(new net.minecraft.client.gui.screens.inventory.InventoryScreen(mc.player));
                out.addProperty("parentScreenIdentity", System.identityHashCode(mc.screen));
                var inventorySlot = mc.player.inventoryMenu.getSlot(in.get("menuSlot").getAsInt());
                hoverOwnedInventory(mc, inventorySlot.getContainerSlot());
                net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(mc.screen).invoker().allowKeyPress(mc.screen,new net.minecraft.client.input.KeyEvent(GLFW.GLFW_KEY_I,0,0));
            } else if (action.equals("openVault")) { net.minecraft.client.KeyMapping.click(com.mojang.blaze3d.platform.InputConstants.Type.KEYSYM.getOrCreate(GLFW.GLFW_KEY_O));
            } else if (action.equals("open")) { net.minecraft.client.KeyMapping.click(com.mojang.blaze3d.platform.InputConstants.Type.KEYSYM.getOrCreate(GLFW.GLFW_KEY_I));
            } else if (action.equals("close")) { mc.setScreen(null);
            } else if (action.equals("select")) {
                mc.player.getInventory().setSelectedSlot(in.get("slot").getAsInt());
                mc.getConnection().send(new net.minecraft.network.protocol.game.ServerboundSetCarriedItemPacket(in.get("slot").getAsInt()));
            } else if (action.equals("screenshot")) { Screenshot.grab(mc.gameDirectory, in.get("name").getAsString(), mc.getMainRenderTarget(), 1, c -> {});
            } else if (action.equals("stop")) { mc.stop();
            } else if (!action.equals("state")) throw new IllegalArgumentException(action);
            out.addProperty("visible", GLFW.glfwGetWindowAttrib(mc.getWindow().handle(), GLFW.GLFW_VISIBLE));
            out.addProperty("focused", GLFW.glfwGetWindowAttrib(mc.getWindow().handle(), GLFW.GLFW_FOCUSED));
            out.addProperty("screen", mc.screen == null ? "" : mc.screen.getClass().getName());
            out.addProperty("screenIdentity", System.identityHashCode(mc.screen));
            if (mc.player != null) {
                out.addProperty("menuIdentity", System.identityHashCode(mc.player.containerMenu));
                out.addProperty("menuId", mc.player.containerMenu.containerId);
            }
            if (mc.screen instanceof net.minecraft.client.gui.screens.DisconnectedScreen) {
                var field = mc.screen.getClass().getDeclaredField("details"); field.setAccessible(true);
                out.addProperty("disconnectReason", ((net.minecraft.network.DisconnectionDetails)field.get(mc.screen)).reason().getString());
            }
            out.addProperty("connected", mc.player != null && mc.level != null);
            out.addProperty("integrated", mc.getSingleplayerServer() != null);
            out.addProperty("delayedInventoryPackets", InboundDelay.queued.size());
            out.addProperty("commandAttempts", CommandAudit.attempts);
            out.add("playerSyncEpochs", PlayerSyncAudit.snapshot());
            out.addProperty("delayedQueryReplies",QueryDelay.queued.size());
            out.add("tagQueryReplies",QueryDelay.replies.deepCopy());
            if (mc.player != null) {
                out.addProperty("creative", mc.player.isCreative());
                out.addProperty("uuid", mc.player.getUUID().toString());
                out.addProperty("gamemaster", mc.player.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER));
                JsonArray roots = new JsonArray();
                mc.getConnection().getCommands().getRoot().getChildren().forEach(c -> roots.add(c.getName()));
                out.add("commandRoots", roots);
                out.addProperty("selected", mc.player.getInventory().getSelectedSlot());
                JsonArray items = new JsonArray();
                var ops = mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE);
                for (int n=0;n<36;n++) items.add(ItemStack.OPTIONAL_CODEC.encodeStart(ops, mc.player.getInventory().getItem(n)).getOrThrow());
                out.add("inventory", items);
            }
            var server = mc.getSingleplayerServer();
            if (server != null) out.add("serverPlayers", server.submit(() -> {
                JsonArray players = new JsonArray();
                for (var player : server.getPlayerList().getPlayers()) {
                    JsonObject p = new JsonObject(); p.addProperty("name", player.getPlainTextName()); p.addProperty("uuid", player.getUUID().toString());
                    p.addProperty("gamemaster", player.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER));
                    JsonArray items = new JsonArray(); var ops = server.registryAccess().createSerializationContext(JsonOps.INSTANCE);
                    for (int n=0;n<36;n++) items.add(ItemStack.OPTIONAL_CODEC.encodeStart(ops, player.getInventory().getItem(n)).getOrThrow());
                    p.add("inventory", items); players.add(p);
                    JsonArray typed = new JsonArray(); var nbtOps = server.registryAccess().createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE);
                    for (int n=0;n<36;n++) typed.add(ItemStack.OPTIONAL_CODEC.encodeStart(nbtOps, player.getInventory().getItem(n)).getOrThrow().toString());
                    p.add("inventorySnbt", typed);
                }
                return players;
            }).get());
        } catch (Throwable e) { out.addProperty("error", e.toString()); }
        write("response.json", out);
    }
    private void write(String file, JsonElement value) {
        try { Files.writeString(run.resolve(file), value.toString()); } catch (Exception e) { throw new RuntimeException(e); }
    }
}
