package dev.rinorsi.editor.vault;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.*;
import net.minecraft.network.protocol.common.ClientboundCustomPayloadPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.server.network.*;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.server.players.ServerOpListEntry;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.*;
import net.minecraft.world.level.GameType;

/** Isolated dedicated server + detached real ServerPlayer; records network writes, never opens a client. */
public final class PermissionServerProbe implements ModInitializer {
    private final JsonObject receipt=new JsonObject();
    private final List<JsonObject> replies=new ArrayList<>();
    private final List<String> packets=new ArrayList<>();
    private int checks;
    public void onInitialize() {
        PayloadTypeRegistry.clientboundPlay().register(EditorPackets.Reply.TYPE,EditorPackets.Reply.CODEC);
        ServerLifecycleEvents.SERVER_STARTED.register(this::run);
    }
    private void run(MinecraftServer server) {
        try {
            var level=server.overworld();var profile=new GameProfile(UUID.randomUUID(),"PermissionProbe");
            var p=new ServerPlayer(server,level,profile,ClientInformation.createDefault());
            p.connection=new RecordingListener(server,p,profile);p.setPos(0.5,65,0.5);p.setHealth(20);
            p.initInventoryMenu();
            var policy=EditorMod.class.getDeclaredField("policy");policy.setAccessible(true);policy.set(null,new EditorPolicy(4,true));
            for(GameType mode:GameType.values())for(boolean gm:List.of(true,false)) {
                setPermission(server,p,gm);p.setGameMode(mode);
                check(EditorPolicy.gameMaster(p)==gm,"live permission "+mode+" gm="+gm);
                boolean allowed=gm||mode==GameType.CREATIVE;
                try {new EditorPolicy(4,true).require(p);check(allowed,"mode policy allows "+mode+" gm="+gm);}catch(EditorSessions.Failure failure){check(!allowed&&failure.code.equals("permission_denied"),"mode policy rejects "+mode+" gm="+gm);}
            }
            setPermission(server,p,true);p.setGameMode(GameType.SURVIVAL);
            packets.clear();
            var stack=PermissionTest.typed();
            var give=new JsonObject();give.addProperty("op","vault_give");give.addProperty("requestId","survival-give");give.addProperty("slot","inventory");give.add("stack",StackCodec.snapshot(stack,p.registryAccess(),new JsonObject(),""));
            JsonObject first=dispatch(p,give);check(first.get("confirmed").getAsBoolean()&&first.get("inventoryIndex").getAsInt()==9,"survival gamemaster gets real server slot");
            check(ItemStack.matches(stack,p.getInventory().getItem(9)),"survival give preserves long float nested container");
            check(packets.contains("ClientboundSetPlayerInventoryPacket"),"explicit inventory sync dispatched");
            check(packets.contains("ClientboundContainerSetContentPacket"),"full inventory content sync dispatched");
            check(dispatch(p,give).get("inventoryIndex").getAsInt()==9&&p.getInventory().getItem(10).isEmpty(),"wire requestId replay inserts once");
            var changed=give.deepCopy();changed.addProperty("inventoryIndex",10);check(dispatch(p,changed).get("code").getAsString().equals("request_id_conflict"),"same wire id different payload refused");
            setPermission(server,p,false);check(dispatch(p,give).get("code").getAsString().equals("permission_denied"),"replayed give rechecks revoked permission");setPermission(server,p,true);
            var occupied=give.deepCopy();occupied.addProperty("requestId","occupied");occupied.addProperty("inventoryIndex",9);check(dispatch(p,occupied).get("code").getAsString().equals("slot_changed"),"occupied slot never overwritten");
            for(int index=9;index<36;index++)p.getInventory().setItem(index,new ItemStack(Items.STONE,64));
            var full=give.deepCopy();full.addProperty("requestId","full");check(dispatch(p,full).get("code").getAsString().equals("inventory_full"),"full inventory reports clear code");
            p.getInventory().setItem(0,new ItemStack(Items.PAPER));
            var slot=new JsonObject();slot.addProperty("kind","inventory");slot.addProperty("index",0);
            JsonObject opened=dispatch(p,request("open","item-open",slot));var item=opened.getAsJsonObject("item");
            JsonObject apply=item.deepCopy();apply.addProperty("op","apply");apply.addProperty("requestId","item-survival");apply.getAsJsonObject("comps").addProperty("custom_name","生存管理员修改");
            check(dispatch(p,apply).get("status").getAsString().equals("saved")&&p.getMainHandItem().getHoverName().getString().equals("生存管理员修改"),"survival main hand apply authoritative");
            p.getInventory().setItem(0,new ItemStack(Items.APPLE));apply.addProperty("requestId","stale");check(dispatch(p,apply).get("code").getAsString().equals("slot_changed"),"baseline detects concurrent item change");
            var chest=new SimpleContainer(27);chest.setItem(0,new ItemStack(Items.PAPER));p.containerMenu=ChestMenu.threeRows(7,p.getInventory(),chest);
            var menuSlot=new JsonObject();menuSlot.addProperty("kind","menu");menuSlot.addProperty("menuId",7);menuSlot.addProperty("index",0);
            var menuItem=dispatch(p,request("open","menu-open",menuSlot)).getAsJsonObject("item");menuItem.addProperty("op","apply");menuItem.addProperty("requestId","menu-apply");menuItem.getAsJsonObject("comps").addProperty("custom_name","生存容器修改");
            check(dispatch(p,menuItem).get("status").getAsString().equals("saved")&&chest.getItem(0).getHoverName().getString().equals("生存容器修改"),"survival container apply authoritative");
            p.containerMenu=p.inventoryMenu;InventoryWrites.remove(p.getUUID());
            for(GameType mode:List.of(GameType.ADVENTURE,GameType.SPECTATOR)) {
                p.setGameMode(mode);var req=give.deepCopy();req.addProperty("requestId","give-"+mode.getName());req.addProperty("inventoryIndex",mode==GameType.ADVENTURE?1:2);
                check(dispatch(p,req).get("confirmed").getAsBoolean(),"gamemaster give "+mode);
                InventoryWrites.remove(p.getUUID());p.getInventory().setItem(0,new ItemStack(Items.PAPER));
                var draft=dispatch(p,request("open","open-"+mode.getName(),slot)).getAsJsonObject("item");
                draft.addProperty("op","apply");draft.addProperty("requestId","apply-"+mode.getName());draft.getAsJsonObject("comps").addProperty("custom_name","管理员模式无关");
                check(dispatch(p,draft).get("status").getAsString().equals("saved"),"gamemaster inventory apply "+mode);
            }
            p.setGameMode(GameType.CREATIVE);var creative=give.deepCopy();creative.addProperty("requestId","creative-wire");check(dispatch(p,creative).get("code").getAsString().equals("creative_path_required"),"creative server give refuses wrong path");
            InventoryWrites.remove(p.getUUID());setPermission(server,p,false);p.getInventory().setItem(0,new ItemStack(Items.PAPER));
            var noOpCreative=dispatch(p,request("open","creative-open",slot)).getAsJsonObject("item");
            noOpCreative.addProperty("op","apply");noOpCreative.addProperty("requestId","creative-apply");noOpCreative.getAsJsonObject("comps").addProperty("custom_name","保留创造路径");
            var commit=dispatch(p,noOpCreative);check(commit.get("status").getAsString().equals("commit"),"unprivileged creative retains two-phase vanilla packet path");
            check(!p.getMainHandItem().has(net.minecraft.core.component.DataComponents.CUSTOM_NAME),"creative commit does not prematurely mutate server");
            p.setGameMode(GameType.SURVIVAL);noOpCreative.addProperty("requestId","no-permission-survival");check(dispatch(p,noOpCreative).get("code").getAsString().equals("permission_denied"),"unprivileged survival item write denied");
            setPermission(server,p,true);p.setGameMode(GameType.CREATIVE);noOpCreative.addProperty("requestId","gamemaster-creative");
            check(dispatch(p,noOpCreative).get("status").getAsString().equals("saved"),"gamemaster creative inventory apply authoritative");
            p.setGameMode(GameType.SURVIVAL);var oversized=give.deepCopy();oversized.addProperty("requestId","oversized");oversized.addProperty("extra","x".repeat(EditorPackets.MAX_JSON));
            check(dispatch(p,oversized).get("code").getAsString().equals("payload_too_large"),"oversized request refused before insertion");
            var captures=new JsonArray();replies.forEach(captures::add);receipt.add("replies",captures);var sent=new JsonArray();packets.forEach(sent::add);receipt.add("packets",sent);receipt.addProperty("checks",checks);receipt.addProperty("passed",true);
        }catch(Throwable failure){failure.printStackTrace();receipt.addProperty("passed",false);receipt.addProperty("error",failure.toString());}
        finally {try {Files.writeString(Path.of(System.getProperty("cadeditor.permission.receipt")),new GsonBuilder().setPrettyPrinting().create().toJson(receipt));}catch(Exception failure){throw new RuntimeException(failure);}finally{server.halt(false);}}
    }
    private void setPermission(MinecraftServer server,ServerPlayer p,boolean gm) {
        if(gm)server.getPlayerList().getOps().add(new ServerOpListEntry(p.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));
        else server.getPlayerList().getOps().remove(p.nameAndId());
    }
    private JsonObject request(String op,String id,JsonObject slot) {var r=new JsonObject();r.addProperty("op",op);r.addProperty("requestId",id);r.add("slot",slot);return r;}
    private JsonObject dispatch(ServerPlayer p,JsonObject request) throws Exception {
        int before=replies.size();var handle=EditorMod.class.getDeclaredMethod("handle",ServerPlayer.class,String.class);handle.setAccessible(true);handle.invoke(null,p,request.toString());
        check(replies.size()>before,"request returned reply "+request.get("requestId"));return replies.getLast();
    }
    private void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;receipt.addProperty(name,true);}
    private final class RecordingListener extends ServerGamePacketListenerImpl {
        RecordingListener(MinecraftServer server,ServerPlayer p,GameProfile profile){super(server,new Connection(PacketFlow.SERVERBOUND),p,CommonListenerCookie.createInitial(profile,false));}
        @Override public void send(Packet<?> packet){packets.add(packet.getClass().getSimpleName());if(packet instanceof ClientboundCustomPayloadPacket custom&&custom.payload() instanceof EditorPackets.Reply reply)replies.add(JsonParser.parseString(reply.json()).getAsJsonObject());}
        @Override public void send(Packet<?> packet,io.netty.channel.ChannelFutureListener listener){send(packet);}
    }
}
