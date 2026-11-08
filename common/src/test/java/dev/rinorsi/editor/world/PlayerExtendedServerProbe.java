package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.nbt.*;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.server.network.*;
import net.minecraft.server.permissions.*;
import net.minecraft.server.players.*;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.level.storage.*;

/** Real dedicated server, native registries/setters/files; no connected UI or system input. */
public final class PlayerExtendedServerProbe {
    private static int checks;
    private static JsonArray evidence=new JsonArray();
    private static final List<String> packets=new ArrayList<>();
    private static Map<UUID,ServerPlayer> online;
    public static JsonObject run(MinecraftServer server)throws Exception{
        checks=0;evidence=new JsonArray();packets.clear();
        var field=PlayerList.class.getDeclaredField("playersByUUID");field.setAccessible(true);
        @SuppressWarnings("unchecked") var map=(Map<UUID,ServerPlayer>)field.get(server.getPlayerList());online=map;
        var p=player(server,"ExtendedProbe");var other=player(server,"ExtendedOther");
        try{
            for(String view:List.of("position","respawn","recipes","advancements","stats","offline")){
                var request=request(p,"read",view);if(view.equals("offline")){request.getAsJsonObject("target").addProperty("offline",true);request.getAsJsonObject("target").addProperty("uuid",other.getStringUUID());}
                code(call(p,request),"player_forbidden");request.addProperty("action","apply");request.addProperty("revision","not-authorized");request.add("patch",new JsonObject());code(call(p,request),"player_forbidden");
            }
            server.getPlayerList().getOps().add(new ServerOpListEntry(p.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));
            var pos=read(p,"position");var patch=pos.getAsJsonObject("value").deepCopy();patch.addProperty("x",32.5);patch.addProperty("z",32.5);patch.addProperty("yaw",80.25);patch.addProperty("pitch",20.5);
            saved(apply(p,"position",pos,patch));check(p.getX()==32.5&&p.getYRot()==80.25f&&p.getXRot()==20.5f,"teleport loads chunk and applies rotation");
            var foreignPosition=request(p,"read","position");foreignPosition.getAsJsonObject("target").addProperty("uuid",other.getStringUUID());var foreignBaseline=opened(call(p,foreignPosition));var foreignPatch=foreignBaseline.getAsJsonObject("value").deepCopy();foreignPatch.addProperty("x",8.5);foreignPosition.addProperty("action","apply");foreignPosition.addProperty("revision",foreignBaseline.get("revision").getAsString());foreignPosition.add("patch",foreignPatch);saved(call(p,foreignPosition));check(other.getX()==8.5&&p.getX()==32.5,"explicit other UUID edits target without redirecting to self");
            pos=read(p,"position");patch.addProperty("dimension","cadeditor:missing");code(apply(p,"position",pos,patch),"unknown_dimension");
            patch.addProperty("dimension",p.level().dimension().identifier().toString());patch.addProperty("pitch",91);code(apply(p,"position",pos,patch),"invalid_request");
            patch.addProperty("pitch",0);patch.addProperty("x",29999999);code(apply(p,"position",pos,patch),"protected_area");
            patch.addProperty("x",32.5);p.setPos(33,p.getY(),p.getZ());code(apply(p,"position",pos,patch),"target_changed");
            pos=read(p,"position");patch=pos.getAsJsonObject("value").deepCopy();var nether=server.getLevel(net.minecraft.world.level.Level.NETHER);check(nether!=null,"live nether available");patch.addProperty("dimension",nether.dimension().identifier().toString());saved(apply(p,"position",pos,patch));check(p.level()==nether,"cross dimension teleport");
            pos=read(p,"position");patch.addProperty("dimension",server.overworld().dimension().identifier().toString());saved(apply(p,"position",pos,patch));
            var spawn=read(p,"respawn");var respawn=json("{dimension:'minecraft:overworld',x:2,y:64,z:3,yaw:45,forced:true}");saved(apply(p,"respawn",spawn,respawn));check(p.getRespawnConfig().forced()&&p.getRespawnConfig().respawnData().yaw()==45,"respawn set");
            spawn=read(p,"respawn");respawn.addProperty("x",1.5);code(apply(p,"respawn",spawn,respawn),"invalid_request");var cleared=apply(p,"respawn",spawn,JsonNull.INSTANCE);saved(cleared);check(p.getRespawnConfig()==null&&cleared.getAsJsonObject("playerExtended").get("value").isJsonNull(),"respawn clear and explicit null wire reply");
            var recipe=server.getRecipeManager().getRecipes().iterator().next();String recipeId=recipe.id().identifier().toString();
            var recipes=read(p,"recipes");var recipePatch=entries(json("{id:'"+recipeId+"',unlocked:true,highlighted:true}"));saved(apply(p,"recipes",recipes,recipePatch));check(p.getRecipeBook().contains(recipe.id())&&p.getRecipeBook().pack().highlight().contains(recipe.id()),"recipe unlock highlight");
            recipes=read(p,"recipes");recipePatch=entries(json("{id:'"+recipeId+"',unlocked:false,highlighted:false}"));saved(apply(p,"recipes",recipes,recipePatch));check(!p.getRecipeBook().contains(recipe.id())&&!p.getRecipeBook().pack().highlight().contains(recipe.id()),"recipe revoke clears native book");
            recipes=read(p,"recipes");var badBatch=entries(json("{id:'"+recipeId+"',unlocked:true,highlighted:true}"),json("{id:'cadeditor:missing',unlocked:true,highlighted:false}"));code(apply(p,"recipes",recipes,badBatch),"unknown_recipe");check(!p.getRecipeBook().contains(recipe.id()),"invalid batch changes no recipe");
            var a=server.getAdvancements().getAllAdvancements().stream().filter(h->!h.value().criteria().isEmpty()).findFirst().orElseThrow();var criterion=a.value().criteria().keySet().iterator().next();
            var advancements=read(p,"advancements");var ap=entries(json("{id:'"+a.id()+"',criteria:[{name:'"+criterion+"',done:true}]}"));saved(apply(p,"advancements",advancements,ap));check(p.getAdvancements().getOrStartProgress(a).getCriterion(criterion).isDone(),"native award criterion");
            advancements=read(p,"advancements");ap.getAsJsonArray("entries").get(0).getAsJsonObject().getAsJsonArray("criteria").get(0).getAsJsonObject().addProperty("done",false);saved(apply(p,"advancements",advancements,ap));check(!p.getAdvancements().getOrStartProgress(a).getCriterion(criterion).isDone(),"native revoke criterion");
            var foreign=request(p,"read","advancements");foreign.getAsJsonObject("target").addProperty("uuid",other.getStringUUID());code(call(p,foreign),"advancement_self_only");
            advancements=read(p,"advancements");code(apply(p,"advancements",advancements,entries(json("{id:'"+a.id()+"',criteria:[{name:'cadeditor_missing',done:true}]}"))),"unknown_advancement");
            var stats=read(p,"stats");var stat=stats.getAsJsonObject("value").getAsJsonArray("entries").get(0).getAsJsonObject().deepCopy();stat.addProperty("value",42);saved(apply(p,"stats",stats,entries(stat)));
            var live=PlayerExtendedEditor.value(p,"stats").getAsJsonObject().getAsJsonArray("entries");check(live.get(0).getAsJsonObject().get("value").getAsInt()==42,"native stats set");
            stats=read(p,"stats");p.getStats().setValue(p,net.minecraft.stats.Stats.CUSTOM.get(net.minecraft.stats.Stats.PLAY_TIME),123);stat.addProperty("value",43);saved(apply(p,"stats",stats,entries(stat)));check(p.getStats().getValue(net.minecraft.stats.Stats.CUSTOM.get(net.minecraft.stats.Stats.PLAY_TIME))==123,"unrelated ticking stats preserved");
            stats=read(p,"stats");var samePath=stat.deepCopy();samePath.addProperty("value",44);PlayerExtendedEditor.prepare(p,"stats",entries(samePath)).run();stat.addProperty("value",45);code(apply(p,"stats",stats,entries(stat)),"target_changed");
            stats=read(p,"stats");stat.addProperty("value",-1);code(apply(p,"stats",stats,entries(stat)),"invalid_request");stat.addProperty("value",1);stat.addProperty("id","cadeditor:missing");code(apply(p,"stats",stats,entries(stat)),"unknown_stat");
            var pagination=request(p,"read","recipes");pagination.addProperty("limit",1);var page=opened(call(p,pagination));check(page.getAsJsonObject("value").getAsJsonArray("entries").size()==1&&!page.get("nextOffset").isJsonNull(),"real candidates paginated");
            var offline=UUID.randomUUID();var directory=server.getWorldPath(LevelResource.PLAYER_DATA_DIR);Files.createDirectories(directory);var path=directory.resolve(offline+".dat");var out=TagValueOutput.createWithContext(ProblemReporter.DISCARDING,server.registryAccess());other.saveWithoutId(out);var data=out.buildResult();data.putString("cadeditor_probe_unknown","keep");data.putInt("DataVersion",net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version());NbtIo.writeCompressed(data,path);
            var off=offlineRequest(p,offline,"read");var baseline=opened(call(p,off));var edit=WorldNbt.parse(baseline.getAsJsonObject("value").get("snbt").getAsString());edit.putInt("XpLevel",7);var opatch=new JsonObject();opatch.addProperty("snbt"," ".repeat(17000)+edit.toString());saved(offlineApply(p,offline,baseline,opatch));check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getIntOr("XpLevel",-1)==7,"offline vanilla load/save and atomic replacement");check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getStringOr("cadeditor_probe_unknown","").equals("keep"),"unknown field preserved");
            var backups=directory.resolve("cadeditor-backups").resolve(offline.toString());try(var list=Files.list(backups)){var backup=list.findFirst().orElseThrow();check(NbtIo.readCompressed(backup,NbtAccounter.unlimitedHeap()).equals(data),"backup is exact original NBT");}
            baseline=opened(call(p,off));byte[] before=Files.readAllBytes(path);edit=WorldNbt.parse(baseline.getAsJsonObject("value").get("snbt").getAsString());edit.putInt("XpLevel",-1);opatch.addProperty("snbt",edit.toString());code(offlineApply(p,offline,baseline,opatch),"invalid_nbt");check(Arrays.equals(before,Files.readAllBytes(path)),"failed validation leaves file byte-identical");
            edit.putInt("XpLevel",8);opatch.addProperty("snbt",edit.toString());var snap=OfflinePlayerEdit.read(server,offline);var plan=OfflinePlayerEdit.prepare(server,offline,snap,opatch);online.put(offline,other);try{reject(plan,"player_online");}finally{online.remove(offline);}check(Arrays.equals(before,Files.readAllBytes(path)),"login between prepare and commit rejects without disk mutation");
            var changed=NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap());changed.putInt("XpLevel",9);NbtIo.writeCompressed(changed,path);reject(plan,"target_changed");check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getIntOr("XpLevel",0)==9,"external file conflict retained");
            for(int i=10;i<16;i++){snap=OfflinePlayerEdit.read(server,offline);edit=snap.editable().copy();edit.putInt("XpLevel",i);opatch.addProperty("snbt",edit.toString());OfflinePlayerEdit.prepare(server,offline,snap,opatch).run();}try(var list=Files.list(backups)){check(list.count()==OfflinePlayerEdit.RETENTION,"backup retention bounded");}
            var latest=NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap());var future=latest.copy();future.putInt("DataVersion",Integer.MAX_VALUE);NbtIo.writeCompressed(future,path);reject(()->OfflinePlayerEdit.read(server,offline),"invalid_nbt");NbtIo.writeCompressed(latest,path);
            var savedOwner=server.getSingleplayerProfile();server.setSingleplayerProfile(new GameProfile(offline,"OfflineOwner"));try{reject(()->OfflinePlayerEdit.read(server,offline),"offline_owner_unsupported");}finally{server.setSingleplayerProfile(savedOwner);}
            var liveOffline=offlineRequest(p,other.getUUID(),"read");code(call(p,liveOffline),"player_online");var missing=offlineRequest(p,UUID.randomUUID(),"read");code(call(p,missing),"offline_missing");
            var deniedBase=read(p,"stats");server.getPlayerList().getOps().remove(p.nameAndId());code(apply(p,"stats",deniedBase,entries(stat)),"player_forbidden");
            check(packets.contains("ClientboundRecipeBookAddPacket")&&packets.contains("ClientboundAwardStatsPacket")&&packets.contains("ClientboundUpdateAdvancementsPacket"),"vanilla synchronization packets sent");
            var result=new JsonObject();result.addProperty("passed",true);result.addProperty("checks",checks);result.add("evidence",evidence);var sent=new JsonArray();packets.forEach(sent::add);result.add("packets",sent);return result;
        }finally{for(var player:List.of(p,other)){online.remove(player.getUUID());server.getPlayerList().getPlayers().remove(player);player.discard();}PlayerExtendedEditor.clear();}
    }
    private static ServerPlayer player(MinecraftServer s,String name){var profile=new GameProfile(UUID.randomUUID(),name);var p=new ServerPlayer(s,s.overworld(),profile,ClientInformation.createDefault());p.connection=new Listener(s,p,profile);p.setPos(0.5,65,0.5);online.put(p.getUUID(),p);s.getPlayerList().getPlayers().add(p);return p;}
    private static JsonObject json(String s){return JsonParser.parseString(s).getAsJsonObject();}
    private static JsonObject entries(JsonObject... rows){var p=new JsonObject();var a=new JsonArray();for(var row:rows)a.add(row);p.add("entries",a);return p;}
    private static JsonObject request(ServerPlayer p,String action,String view){var r=new JsonObject();r.addProperty("op","player_extended");r.addProperty("requestId",UUID.randomUUID().toString());r.addProperty("action",action);r.addProperty("view",view);var t=new JsonObject();t.addProperty("uuid",p.getStringUUID());r.add("target",t);return r;}
    private static JsonObject offlineRequest(ServerPlayer p,UUID target,String action){var r=request(p,action,"offline");r.getAsJsonObject("target").addProperty("uuid",target.toString());r.getAsJsonObject("target").addProperty("offline",true);return r;}
    private static JsonObject offlineApply(ServerPlayer p,UUID target,JsonObject baseline,JsonElement patch)throws Exception{var r=offlineRequest(p,target,"apply");r.addProperty("revision",baseline.get("revision").getAsString());r.add("patch",patch);return call(p,r);}
    private static JsonObject read(ServerPlayer p,String view)throws Exception{return opened(call(p,request(p,"read",view)));}
    private static JsonObject apply(ServerPlayer p,String view,JsonObject baseline,JsonElement patch)throws Exception{var r=request(p,"apply",view);r.addProperty("revision",baseline.get("revision").getAsString());r.add("patch",patch);return call(p,r);}
    private static JsonObject call(ServerPlayer p,JsonObject request)throws Exception{Thread.sleep(510);var replies=new ArrayList<JsonObject>();var transmitted=WorldWire.decode(JsonParser.parseString(WorldWire.encode(request)).getAsJsonObject());check(WorldEditor.route(p,transmitted,()->new EditorPolicy(2,false),r->replies.add(WorldWire.decode(JsonParser.parseString(WorldWire.encode(r)).getAsJsonObject()))),"request routed through real wire encode/decode");check(replies.size()==1,"one reply");var reply=replies.get(0);var row=new JsonObject();row.add("request",request.deepCopy());row.add("reply",reply.deepCopy());evidence.add(row);return reply;}
    private static JsonObject opened(JsonObject r){check(r.get("status").getAsString().equals("opened"),"opened: "+r);return r.getAsJsonObject("playerExtended");}
    private static void saved(JsonObject r){check(r.get("status").getAsString().equals("saved"),"saved: "+r);}
    private static void code(JsonObject r,String code){check(r.has("code")&&r.get("code").getAsString().equals(code),"expected "+code+": "+r);}
    private static void check(boolean b,String message){if(!b)throw new AssertionError(message);checks++;}
    private static void reject(Runnable plan,String code){try{plan.run();throw new AssertionError("expected "+code);}catch(EditorSessions.Failure e){check(e.code.equals(code),"expected "+code+" got "+e.code);}}
    private static final class Listener extends ServerGamePacketListenerImpl{
        Listener(MinecraftServer s,ServerPlayer p,GameProfile profile){super(s,new Connection(PacketFlow.SERVERBOUND),p,CommonListenerCookie.createInitial(profile,false));}
        @Override public void send(Packet<?> packet){packets.add(packet.getClass().getSimpleName());}
        @Override public void send(Packet<?> packet,io.netty.channel.ChannelFutureListener listener){send(packet);}
    }
}
