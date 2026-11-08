package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.vault.PermissionTest;
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
            for(String view:List.of("position","respawn","recipes","advancements","stats","offline","players")){
                var request=request(p,"read",view);if(view.equals("offline")){request.getAsJsonObject("target").addProperty("offline",true);request.getAsJsonObject("target").addProperty("uuid",other.getStringUUID());}
                code(call(p,request),"player_forbidden");request.addProperty("action","apply");request.addProperty("revision","not-authorized");request.add("patch",new JsonObject());code(call(p,request),"player_forbidden");
            }
            var deniedExport=request(p,"export_preset","");deniedExport.remove("view");code(call(p,deniedExport),"player_forbidden");
            var forbiddenSlot=json("{kind:'entity',player:'offline',uuid:'"+UUID.randomUUID()+"',dim:'minecraft:overworld'}");code(call(p,worldRequest("open",forbiddenSlot)),"player_forbidden");
            server.getPlayerList().getOps().add(new ServerOpListEntry(p.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));
            switchTargets(p,other);
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
            displayMetadata(p);
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
            other.getInventory().setItem(0,PermissionTest.typed());other.getEnderChestInventory().setItem(2,PermissionTest.typed());other.setItemSlot(net.minecraft.world.entity.EquipmentSlot.HEAD,new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.IRON_HELMET));other.setItemSlot(net.minecraft.world.entity.EquipmentSlot.OFFHAND,PermissionTest.typed());other.getInventory().setSelectedSlot(3);other.setGameMode(net.minecraft.world.level.GameType.ADVENTURE);other.setHealth(17);other.getFoodData().setFoodLevel(12);other.experienceLevel=6;other.setServerLevel(nether);
            var offline=UUID.randomUUID();var directory=server.getWorldPath(LevelResource.PLAYER_DATA_DIR);Files.createDirectories(directory);var path=directory.resolve(offline+".dat");var out=TagValueOutput.createWithContext(ProblemReporter.DISCARDING,server.registryAccess());other.saveWithoutId(out);var data=out.buildResult();data.putString("cadeditor_probe_unknown","keep");data.putInt("DataVersion",net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version());NbtIo.writeCompressed(data,path);
            profiles(server,p,other,offline,path);
            var off=offlineRequest(p,offline,"read");var baseline=opened(call(p,off));var edit=WorldNbt.parse(baseline.getAsJsonObject("value").get("snbt").getAsString());edit.putInt("XpLevel",7);var opatch=new JsonObject();opatch.addProperty("snbt"," ".repeat(17000)+edit.toString());saved(offlineApply(p,offline,baseline,opatch));check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getIntOr("XpLevel",-1)==7,"offline vanilla load/save and atomic replacement");check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getStringOr("cadeditor_probe_unknown","").equals("keep"),"unknown field preserved");
            var backups=directory.resolve("cadeditor-backups").resolve(offline.toString());try(var list=Files.list(backups)){var backup=list.findFirst().orElseThrow();check(NbtIo.readCompressed(backup,NbtAccounter.unlimitedHeap()).equals(data),"backup is exact original NBT");}
            baseline=opened(call(p,off));byte[] before=Files.readAllBytes(path);edit=WorldNbt.parse(baseline.getAsJsonObject("value").get("snbt").getAsString());edit.putInt("XpLevel",-1);opatch.addProperty("snbt",edit.toString());code(offlineApply(p,offline,baseline,opatch),"invalid_nbt");check(Arrays.equals(before,Files.readAllBytes(path)),"failed validation leaves file byte-identical");
            edit.putInt("XpLevel",8);opatch.addProperty("snbt",edit.toString());var snap=OfflinePlayerEdit.read(server,offline);var plan=OfflinePlayerEdit.prepare(server,offline,snap,opatch);online.put(offline,other);try{reject(plan,"player_online");}finally{online.remove(offline);}check(Arrays.equals(before,Files.readAllBytes(path)),"login between prepare and commit rejects without disk mutation");
            var changed=NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap());changed.putInt("XpLevel",9);NbtIo.writeCompressed(changed,path);reject(plan,"target_changed");check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getIntOr("XpLevel",0)==9,"external file conflict retained");
            for(int i=10;i<16;i++){snap=OfflinePlayerEdit.read(server,offline);edit=snap.editable().copy();edit.putInt("XpLevel",i);opatch.addProperty("snbt",edit.toString());OfflinePlayerEdit.prepare(server,offline,snap,opatch).run();}try(var list=Files.list(backups)){check(list.count()==OfflinePlayerEdit.RETENTION,"backup retention bounded");}
            var latest=NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap());var future=latest.copy();future.putInt("DataVersion",Integer.MAX_VALUE);NbtIo.writeCompressed(future,path);reject(()->OfflinePlayerEdit.read(server,offline),"invalid_nbt");NbtIo.writeCompressed(latest,path);
            var savedOwner=server.getSingleplayerProfile();server.setSingleplayerProfile(new GameProfile(offline,"OfflineOwner"));try{reject(()->OfflinePlayerEdit.read(server,offline),"offline_owner_unsupported");}finally{server.setSingleplayerProfile(savedOwner);}
            var liveOffline=offlineRequest(p,other.getUUID(),"read");code(call(p,liveOffline),"player_online");var missing=offlineRequest(p,UUID.randomUUID(),"read");code(call(p,missing),"offline_missing");
            fullPlayerEditors(server,p,other);
            var deniedBase=read(p,"stats");server.getPlayerList().getOps().remove(p.nameAndId());code(apply(p,"stats",deniedBase,entries(stat)),"player_forbidden");
            check(packets.contains("ClientboundRecipeBookAddPacket")&&packets.contains("ClientboundAwardStatsPacket")&&packets.contains("ClientboundUpdateAdvancementsPacket"),"vanilla synchronization packets sent");
            var result=new JsonObject();result.addProperty("passed",true);result.addProperty("checks",checks);result.add("evidence",evidence);var sent=new JsonArray();packets.forEach(sent::add);result.add("packets",sent);return result;
        }finally{for(var player:List.of(p,other)){online.remove(player.getUUID());server.getPlayerList().getPlayers().remove(player);player.discard();}PlayerExtendedEditor.clear();}
    }
    private static void profiles(MinecraftServer server,ServerPlayer p,ServerPlayer source,UUID offline,Path path)throws Exception {
        var list=server.getPlayerList();var stats=new HashMap<>(list.stats);var advancements=new HashMap<>(list.advancements);var bytes=Files.readAllBytes(path);
        var legacy=server.getWorldPath(LevelResource.PLAYER_STATS_DIR).resolve("ArchiveReader.json");Files.createDirectories(legacy.getParent());Files.writeString(legacy,"{}");
        var statsFiles=archiveFiles(server.getWorldPath(LevelResource.PLAYER_STATS_DIR));var advancementFiles=archiveFiles(server.getWorldPath(LevelResource.PLAYER_ADVANCEMENTS_DIR));
        var players=request(p,"read","players");players.remove("target");var page=opened(call(p,players));
        check(page.get("revision").isJsonNull()&&page.getAsJsonObject("target").isEmpty(),"players read has no editing revision");
        var rows=page.getAsJsonObject("value").getAsJsonArray("entries");
        var self=profileRow(rows,p.getUUID());check(self.get("self").getAsBoolean()&&self.get("online").getAsBoolean()&&self.get("last_played_ms").isJsonNull(),"players self and online metadata");
        var unknown=profileRow(rows,offline);check(unknown.get("name").isJsonNull()&&!unknown.get("online").getAsBoolean()&&!unknown.get("self").getAsBoolean()&&unknown.get("last_played_ms").getAsLong()==Files.getLastModifiedTime(path).toMillis(),"offline unknown name and file mtime");
        var unnamed=opened(call(p,offlineRequest(p,offline,"read")));check(unnamed.getAsJsonObject("value").getAsJsonObject("summary").get("name").isJsonNull(),"offline summary preserves missing name null");
        check(profileRow(rows,source.getUUID()).get("name").getAsString().equals(source.getGameProfile().name()),"online player included without a playerdata file");
        list.getServer().services().nameToIdCache().add(new NameAndId(offline,"CachedArchive"));
        players.addProperty("query","cAcHeDaRc");players.addProperty("limit",1);page=opened(call(p,players));check(page.get("total").getAsInt()==1&&profileRow(page.getAsJsonObject("value").getAsJsonArray("entries"),offline).get("name").getAsString().equals("CachedArchive"),"local cached name search case insensitive");
        players.addProperty("query",offline.toString().substring(0,8));page=opened(call(p,players));check(page.get("total").getAsInt()==1,"UUID substring search");
        players.remove("query");players.addProperty("offset",1);page=opened(call(p,players));check(page.getAsJsonObject("value").getAsJsonArray("entries").size()==1&&page.get("total").getAsInt()==rows.size(),"players filtered pagination");
        players.addProperty("action","apply");code(call(p,players),"invalid_request");players.addProperty("action","read");players.remove("offset");players.remove("limit");
        var savedOwner=server.getSingleplayerProfile();server.setSingleplayerProfile(p.getGameProfile());
        try{var ownerPage=opened(call(p,players));check(profileRow(ownerPage.getAsJsonObject("value").getAsJsonArray("entries"),p.getUUID()).get("owner").getAsBoolean(),"singleplayer owner and self flags coexist");}finally{server.setSingleplayerProfile(savedOwner);}
        var offlineRead=opened(call(p,offlineRequest(p,offline,"read")));var summary=offlineRead.getAsJsonObject("value").getAsJsonObject("summary");
        check(summary.equals(PlayerProfiles.summary(source,"CachedArchive")),"offline summary exactly matches native loaded state");
        check(summary.get("game_mode").getAsString().equals("adventure")&&summary.get("health").getAsInt()==17&&summary.get("food").getAsInt()==12&&summary.get("xp_level").getAsInt()==6,"summary mode health food experience");
        check(summary.get("dimension").getAsString().equals("minecraft:the_nether")&&summary.get("selected_slot").getAsInt()==3&&summary.get("inventory_count").getAsInt()==1&&summary.get("ender_count").getAsInt()==1,"summary dimension selection counts");
        check(summary.getAsJsonObject("equipment").get("head").getAsString().equals("minecraft:iron_helmet")&&summary.getAsJsonObject("equipment").get("feet").isJsonNull(),"summary equipped IDs and empty null");
        var export=request(p,"export_preset","");export.remove("view");export.getAsJsonObject("target").addProperty("uuid",source.getStringUUID());
        var onlineExport=call(p,export);check(onlineExport.get("status").getAsString().equals("exported"),"online preset exported without view");
        export.getAsJsonObject("target").addProperty("uuid",offline.toString());export.getAsJsonObject("target").addProperty("offline",true);var offlineExport=call(p,export);
        check(offlineExport.get("status").getAsString().equals("exported")&&offlineExport.get("template").equals(onlineExport.get("template")),"offline preset equals online VaultTemplates capture including typed stacks");
        var capture=new JsonObject();capture.add("template",offlineExport.get("template"));check(dev.rinorsi.editor.vault.VaultTemplates.capture("player_preset",capture).equals(offlineExport.get("template")),"export VaultTemplates roundtrip");
        export.add("sections",JsonParser.parseString("['inventory','effects']"));var partial=call(p,export);check(partial.getAsJsonObject("template").getAsJsonObject("sections").size()==2,"export selected sections only");
        export.add("sections",JsonParser.parseString("['inventory','inventory']"));code(call(p,export),"invalid_request");export.remove("sections");
        server.setSingleplayerProfile(new GameProfile(offline,"ArchiveOwner"));
        try{page=opened(call(p,players));check(profileRow(page.getAsJsonObject("value").getAsJsonArray("entries"),offline).get("owner").getAsBoolean(),"offline owner listed");check(call(p,export).get("status").getAsString().equals("exported"),"offline owner native selected archive read only");code(call(p,offlineRequest(p,offline,"read")),"offline_owner_unsupported");}finally{server.setSingleplayerProfile(savedOwner);}
        export.getAsJsonObject("target").addProperty("uuid",source.getStringUUID());code(call(p,export),"player_online");
        var broken=OfflinePlayerEdit.readData(server,offline);broken.putString("Health","broken");reject(()->PlayerProfiles.loaded(server,broken,player->PlayerProfiles.summary(player,null)),"invalid_nbt");
        check(Arrays.equals(bytes,Files.readAllBytes(path)),"all profile reads leave archive byte identical");check(stats.equals(list.stats)&&advancements.equals(list.advancements),"temporary player reads leave native caches unchanged");
        check(Files.readString(legacy).equals("{}")&&statsFiles.equals(archiveFiles(server.getWorldPath(LevelResource.PLAYER_STATS_DIR)))&&advancementFiles.equals(archiveFiles(server.getWorldPath(LevelResource.PLAYER_ADVANCEMENTS_DIR))),"read-only profile never migrates legacy stats or writes stat/advancement files");
    }
    private static void switchTargets(ServerPlayer p,ServerPlayer other)throws Exception {
        p.level().getChunk(0,0);
        String dim=p.level().dimension().identifier().toString();
        var self=dev.rinorsi.editor.client.WorldPageTarget.playerSlot(json("{self:true}"),dim);var remote=dev.rinorsi.editor.client.WorldPageTarget.playerSlot(json("{uuid:'"+other.getStringUUID()+"'}"),dim);
        var first=call(p,worldRequest("open",self));check(first.get("status").getAsString().equals("opened"),"navigation opens self");var a=dev.rinorsi.editor.client.WorldPageTarget.Binding.opened(first.getAsJsonObject("world"));
        var second=call(p,worldRequest("open",remote));check(second.get("status").getAsString().equals("opened"),"navigation opens online player without crosshair");var b=dev.rinorsi.editor.client.WorldPageTarget.Binding.opened(second.getAsJsonObject("world"));
        var edit=worldRequest("apply",a.slot());edit.addProperty("revision",a.revision());edit.add("entity",json("{player:{SelectedItemSlot:1}}"));code(call(p,edit),"session_lost");
        edit.add("slot",b.slot());var saved=call(p,b.bind(edit,false));check(saved.get("status").getAsString().equals("saved")&&other.getInventory().getSelectedSlot()==1&&p.getInventory().getSelectedSlot()==0,"new binding applies only to new player");b=dev.rinorsi.editor.client.WorldPageTarget.Binding.opened(saved.getAsJsonObject("world"));
        var undo=worldRequest("undo",b.slot());check(call(p,b.bind(undo,true)).get("status").getAsString().equals("saved")&&other.getInventory().getSelectedSlot()==0,"new binding undo restores new player");
        var roundtrip=call(p,worldRequest("open",remote));check(roundtrip.getAsJsonObject("world").getAsJsonObject("views").getAsJsonObject("player").get("SelectedItemSlot").getAsInt()==0,"A apply undo reopen current player state");
        var back=call(p,worldRequest("open",self));check(back.get("status").getAsString().equals("opened")&&back.getAsJsonObject("world").getAsJsonObject("slot").get("uuid").getAsString().equals(p.getStringUUID()),"navigation returns to self");a=dev.rinorsi.editor.client.WorldPageTarget.Binding.opened(back.getAsJsonObject("world"));
        var oldPos=other.position();other.setPos(100,65,100);code(call(p,worldRequest("open",remote)),"out_of_reach");other.setPos(oldPos);
        var missing=remote.deepCopy();missing.addProperty("uuid",UUID.randomUUID().toString());code(call(p,worldRequest("open",missing)),"player_offline");
        edit=worldRequest("apply",a.slot());edit.add("entity",json("{player:{SelectedItemSlot:0}}"));check(call(p,a.bind(edit,false)).get("status").getAsString().equals("saved"),"rejected navigation leaves previous server session usable");
        var onlineWorld=call(p,worldRequest("open",remote)).getAsJsonObject("world");var onlineSaved=fullApply(p,onlineWorld,json("{Health:19}"));saved(onlineSaved);var onlineAgain=call(p,worldRequest("open",remote)).getAsJsonObject("world");check(onlineSaved.getAsJsonObject("world").get("views").equals(onlineAgain.get("views")),"A open apply reopen complete normalized equality");
    }
    private static JsonObject fullOpen(ServerPlayer actor,JsonObject selector)throws Exception {
        var slot=dev.rinorsi.editor.client.WorldPageTarget.playerSlot(selector,actor.level().dimension().identifier().toString());var reply=call(actor,worldRequest("open",slot));
        check(reply.get("status").getAsString().equals("opened"),"full editor opened: "+reply);return reply.getAsJsonObject("world");
    }
    private static JsonObject fullApply(ServerPlayer actor,JsonObject world,JsonObject patch)throws Exception {
        return call(actor,fullEdit(world,patch));
    }
    private static JsonObject fullEdit(JsonObject world,JsonObject patch){
        var request=worldRequest("apply",world.getAsJsonObject("slot"));request.add("revision",world.get("revision"));var entity=new JsonObject();entity.add("player",patch);request.add("entity",entity);return request;
    }
    private static void fullPlayerEditors(MinecraftServer server,ServerPlayer actor,ServerPlayer source)throws Exception {
        var originalStats=new HashMap<>(server.getPlayerList().stats);var originalAdvancements=new HashMap<>(server.getPlayerList().advancements);
        var target=UUID.randomUUID();var path=server.getWorldPath(LevelResource.PLAYER_DATA_DIR).resolve(target+".dat");var data=WorldTarget.saveEntity(source,server.registryAccess());data.putIntArray("UUID",net.minecraft.core.UUIDUtil.uuidToIntArray(target));data.putString("cadeditor_full_unknown","keep");NbtIo.writeCompressed(data,path);
        var selector=json("{uuid:'"+target+"',offline:true}");var baseline=fullOpen(actor,selector);check(baseline.getAsJsonObject("player").get("offline").getAsBoolean()&&!baseline.get("canUndo").getAsBoolean(),"B offline full metadata and no undo");check(baseline.getAsJsonObject("slot").get("uuid").getAsString().equals(target.toString())&&baseline.getAsJsonObject("player").get("uuid").getAsString().equals(target.toString()),"B canonical session identity uses archive UUID, not temporary construction UUID");
        var before=Files.readAllBytes(path);var patch=json("{experience:{XpLevel:23},food:{foodLevel:19,saturation:3},Health:15,playerGameType:'creative',abilities:{flySpeed:0.123456789},CustomName:{text:'Archive'},Tags:['z_probe','a_probe'],active_effects:[{id:'minecraft:speed',duration:400,amplifier:1}]}");
        var result=fullApply(actor,baseline,patch);saved(result);var savedWorld=result.getAsJsonObject("world");var reopened=fullOpen(actor,selector);check(savedWorld.get("views").equals(reopened.get("views")),"B open apply reopen normalized equality including mode abilities effects");
        check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getStringOr("cadeditor_full_unknown","").equals("keep"),"B preserves unknown file data");
        var backups=path.getParent().resolve("cadeditor-backups").resolve(target.toString());try(var files=Files.list(backups)){check(Arrays.equals(Files.readAllBytes(files.findFirst().orElseThrow()),before),"B backup is byte-identical preimage");}
        before=Files.readAllBytes(path);code(fullApply(actor,reopened,json("{experience:{XpLevel:-2}}")),"invalid_request");check(Arrays.equals(before,Files.readAllBytes(path)),"B invalid normalized patch leaves file unchanged");
        online.put(target,source);try{code(fullApply(actor,reopened,json("{Health:14}")),"player_online");}finally{online.remove(target);}check(Arrays.equals(before,Files.readAllBytes(path)),"B login race rejects full editor write");
        var owner=server.getSingleplayerProfile();server.setSingleplayerProfile(new GameProfile(target,"FullOwner"));try{var slot=reopened.getAsJsonObject("slot");code(call(actor,worldRequest("open",slot)),"offline_owner_unsupported");}finally{server.setSingleplayerProfile(owner);}
        var previousMode=PlayerProfiles.loaded(server,OfflinePlayerEdit.readData(server,target),p->p.gameMode.getPreviousGameModeForPlayer());
        for(int i=0;i<6;i++){var r=fullApply(actor,reopened,json("{experience:{XpLevel:"+(30+i)+"}}"));saved(r);reopened=r.getAsJsonObject("world");}try(var files=Files.list(backups)){check(files.count()==5,"B full editor backup retention five");}
        check(previousMode==PlayerProfiles.loaded(server,OfflinePlayerEdit.readData(server,target),p->p.gameMode.getPreviousGameModeForPlayer()),"B editing experience preserves previous game mode");
        var concurrent=NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap());concurrent.putInt("XpTotal",1234);NbtIo.writeCompressed(concurrent,path);var merged=fullApply(actor,reopened,json("{Health:14}"));saved(merged);reopened=merged.getAsJsonObject("world");check(reopened.getAsJsonObject("views").getAsJsonObject("player").getAsJsonObject("experience").get("XpTotal").getAsInt()==1234,"B three-way merge preserves unrelated file edit");
        concurrent=NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap());concurrent.putFloat("Health",13);NbtIo.writeCompressed(concurrent,path);before=Files.readAllBytes(path);code(fullApply(actor,reopened,json("{Health:12}")),"target_changed");check(Arrays.equals(before,Files.readAllBytes(path)),"B same-field conflict leaves external edit intact");
        var checkFile=OfflinePlayerEdit.readFull(server,target);var changed=checkFile.data().copy();changed.putInt("XpLevel",98);NbtIo.writeCompressed(changed,path);reject(()->OfflinePlayerEdit.replace(server,target,checkFile,checkFile.data()),"target_changed");check(NbtIo.readCompressed(path,NbtAccounter.unlimitedHeap()).getIntOr("XpLevel",0)==98,"B final writer detects external fingerprint change");
        // Vault page uses exactly the production local model, but a real server Level registry in this probe.
        var vaultFile=server.getWorldPath(LevelResource.ROOT).resolve("full-player-preset-probe.json");
        try(var store=new dev.rinorsi.editor.vault.VaultStore(vaultFile,1,"probe",null,System::currentTimeMillis)){
            dev.rinorsi.editor.vault.VaultStore.Validator validator=stack->dev.rinorsi.editor.vault.VaultStacks.validate(stack,server.registryAccess());
            var save=json("{op:'save',kind:'player_preset',name:'ProbePreset',tags:['keep'],note:'preserved'}");save.add("template",PlayerProfiles.export(source,dev.rinorsi.editor.vault.VaultTemplates.allSections(),"source").get("template"));
            String id=store.execute(save,validator).getAsJsonObject("entry").get("id").getAsString();
            var page=new dev.rinorsi.editor.vault.PlayerPresetPage(store,validator,server.overworld(),id);var opened=page.world();check(opened.getAsJsonObject("player").get("preset").getAsBoolean()&&opened.getAsJsonObject("player").getAsJsonArray("sections").size()==6,"C complete player snapshot and saved sections");
            var metadata=json("{op:'update',id:'"+id+"',name:'RenamedDuringEdit'}");store.execute(metadata,validator);
            var edit=json("{playerGameType:'creative',container:{slots:[{slot:0,stack:{empty:true}}]},active_effects:[{id:'minecraft:speed',duration:120,amplifier:0}]}");
            var receipt=page.apply(fullEdit(opened,edit));saved(receipt);var again=new dev.rinorsi.editor.vault.PlayerPresetPage(store,validator,server.overworld(),id).world();check(receipt.getAsJsonObject("world").get("views").equals(again.get("views")),"C open apply reopen normalized equality");
            var entry=store.playerPreset(id);check(entry.get("name").getAsString().equals("RenamedDuringEdit")&&entry.get("note").getAsString().equals("preserved")&&entry.getAsJsonArray("tags").get(0).getAsString().equals("keep"),"C preserves latest metadata during template update");
            var capture=new JsonObject();capture.add("world",again);capture.add("sections",dev.rinorsi.editor.vault.VaultTemplates.allSections());var captured=dev.rinorsi.editor.vault.VaultTemplates.capture("player_preset",capture);
            var comparison=new JsonObject();comparison.add("captured",captured);comparison.add("stored",entry.get("template"));Files.writeString(vaultFile.resolveSibling("full-player-preset-roundtrip.json"),comparison.toString());
            // Compare the actual JSON contract, not Gson Float versus parsed-number wrapper classes.
            check(JsonParser.parseString(captured.toString()).equals(JsonParser.parseString(entry.get("template").toString())),"C native page capture equals stored VaultTemplates template");
            reject(()->page.apply(fullEdit(page.world(),json("{Health:1}"))),"protected_field");
            var quotaBefore=store.playerPreset(id);var huge=json("{attributes:[{id:'minecraft:max_health',base:20,modifiers:[{id:'probe:big',amount:0,operation:'add_value'}]}]}");huge.getAsJsonArray("attributes").get(0).getAsJsonObject().getAsJsonArray("modifiers").get(0).getAsJsonObject().addProperty("id","probe:"+"a".repeat(70000));
            try{page.apply(fullEdit(page.world(),huge));throw new AssertionError("oversized page accepted");}catch(EditorSessions.Failure e){check(e.code.equals("payload_too_large"),"C oversized page refused before commit");}catch(dev.rinorsi.editor.vault.VaultStore.Failure e){check(e.code.equals("ENTRY_TOO_LARGE"),"C oversized entry refused before commit");}check(store.playerPreset(id).equals(quotaBefore),"C quota failure leaves stored template unchanged");
            var stale=new dev.rinorsi.editor.vault.PlayerPresetPage(store,validator,server.overworld(),id);page.apply(fullEdit(page.world(),json("{playerGameType:'adventure'}")));
            try{stale.apply(fullEdit(stale.world(),json("{playerGameType:'spectator'}")));throw new AssertionError("stale template accepted");}catch(dev.rinorsi.editor.vault.VaultStore.Failure e){check(e.code.equals("target_changed"),"C stale page template CAS rejects");}
            var partial=json("{op:'save',kind:'player_preset',template:{sections:{effects:[]}}}");String partialId=store.execute(partial,validator).getAsJsonObject("entry").get("id").getAsString();var partialPage=new dev.rinorsi.editor.vault.PlayerPresetPage(store,validator,server.overworld(),partialId);
            check(partialPage.world().getAsJsonObject("player").getAsJsonArray("sections").size()==1,"C partial template exposes only saved sections");reject(()->partialPage.apply(fullEdit(partialPage.world(),json("{playerGameType:'creative'}"))),"protected_field");reject(()->partialPage.apply(fullEdit(partialPage.world(),json("{container:{slots:[{slot:0,stack:{empty:true}}]}}"))),"protected_field");
            partialPage.apply(fullEdit(partialPage.world(),json("{active_effects:[{id:'minecraft:haste',duration:60}]}")));check(store.playerPreset(partialId).getAsJsonObject("template").getAsJsonObject("sections").size()==1,"C edit does not invent missing preset sections");
            var sparse=json("{op:'save',kind:'player_preset',template:{sections:{inventory:{slots:[{slot:0,stack:{empty:true}}]},attributes:[],game_mode:'survival'}}}");String sparseId=store.execute(sparse,validator).getAsJsonObject("entry").get("id").getAsString();var sparsePage=new dev.rinorsi.editor.vault.PlayerPresetPage(store,validator,server.overworld(),sparseId);sparsePage.apply(fullEdit(sparsePage.world(),json("{playerGameType:'adventure'}")));var sparseSections=store.playerPreset(sparseId).getAsJsonObject("template").getAsJsonObject("sections");check(sparseSections.getAsJsonObject("inventory").getAsJsonArray("slots").size()==1&&sparseSections.getAsJsonArray("attributes").isEmpty(),"C unrelated edits preserve sparse imported slots and attributes");
            var evidenceRow=new JsonObject();evidenceRow.addProperty("case","preset_full_roundtrip");evidenceRow.add("opened",opened);evidenceRow.add("saved",receipt);evidenceRow.add("reopened",again);evidence.add(evidenceRow);
        }
        check(originalStats.equals(server.getPlayerList().stats)&&originalAdvancements.equals(server.getPlayerList().advancements),"B/C temporary editing leaves player caches unchanged");
    }
    private static JsonObject worldRequest(String op,JsonObject slot){var r=new JsonObject();r.addProperty("op",op);r.addProperty("requestId",UUID.randomUUID().toString());r.add("slot",slot);return r;}
    private static Map<String,String> archiveFiles(Path dir)throws Exception{var result=new TreeMap<String,String>();if(Files.isDirectory(dir))try(var paths=Files.walk(dir)){for(var path:paths.filter(Files::isRegularFile).toList())result.put(dir.relativize(path).toString(),PlayerExtendedEditor.hash(Files.readAllBytes(path)));}return result;}
    private static JsonObject profileRow(JsonArray rows,UUID uuid){for(var raw:rows){var row=raw.getAsJsonObject();if(row.get("uuid").getAsString().equals(uuid.toString()))return row;}throw new AssertionError("missing profile "+uuid);}
    private static void displayMetadata(ServerPlayer p)throws Exception{
        var full=PlayerExtendedEditor.value(p,"advancements").getAsJsonObject().getAsJsonArray("entries");
        JsonObject root=null,recipe=null;int displayed=0;
        for(var raw:full){var row=raw.getAsJsonObject();String id=row.get("id").getAsString();
            if(id.equals("minecraft:story/root"))root=row;
            if(id.startsWith("minecraft:recipes/"))recipe=row;
            if(row.get("has_display").getAsBoolean())displayed++;
        }
        check(root!=null&&root.get("has_display").getAsBoolean()&&root.get("title_key").getAsString().equals("advancements.story.root.title"),"vanilla root display title key");
        check(root.get("description_key").getAsString().equals("advancements.story.root.description"),"vanilla root description key");
        check(recipe!=null&&!recipe.get("has_display").getAsBoolean()&&!recipe.has("title_key"),"internal recipe advancement has no display");
        var request=request(p,"read","advancements");request.addProperty("displayed",true);request.addProperty("limit",64);
        int count=0;var seen=new HashSet<String>();
        while(true){var page=opened(call(p,request));check(page.get("total").getAsInt()==displayed,"displayed total matches native definitions");
            for(var raw:page.getAsJsonObject("value").getAsJsonArray("entries")){var row=raw.getAsJsonObject();String id=row.get("id").getAsString();check(row.get("has_display").getAsBoolean()&&!id.startsWith("minecraft:recipes/")&&seen.add(id),"displayed page excludes internal recipes and duplicates");count++;}
            if(page.get("nextOffset").isJsonNull())break;request.add("offset",page.get("nextOffset"));
        }
        check(count==displayed,"displayed pagination total is exact");
        request.remove("offset");request.addProperty("query","recipes/");var page=opened(call(p,request));check(page.get("total").getAsInt()==0&&page.getAsJsonObject("value").getAsJsonArray("entries").isEmpty(),"displayed and query filters stack");
        request.addProperty("query","minecraft:story/root");page=opened(call(p,request));check(page.get("total").getAsInt()==1,"displayed root search");
        request.addProperty("displayed",false);request.remove("query");page=opened(call(p,request));check(page.get("total").getAsInt()==full.size(),"displayed false retains all native advancements");
        request.addProperty("query","recipes/");page=opened(call(p,request));check(page.get("total").getAsInt()>0&&!page.getAsJsonObject("value").getAsJsonArray("entries").get(0).getAsJsonObject().get("has_display").getAsBoolean(),"recipe advancement visible in default unfiltered protocol");
        request.addProperty("displayed","true");code(call(p,request),"invalid_request");
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
