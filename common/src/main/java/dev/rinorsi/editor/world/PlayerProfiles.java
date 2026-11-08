package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.vault.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.function.Function;
import net.minecraft.core.registries.*;
import net.minecraft.nbt.*;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.Container;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.*;

/** Read-only archive projections. Never registers a player/entity or invokes PlayerList.save/remove. */
public final class PlayerProfiles {
    private PlayerProfiles() {}
    public static boolean owner(MinecraftServer server,UUID uuid) {
        var profile=server.getSingleplayerProfile();
        return server.isSingleplayer()&&profile!=null&&profile.id().equals(uuid);
    }
    public static String name(MinecraftServer server,UUID uuid) {
        var online=server.getPlayerList().getPlayer(uuid);
        if(online!=null)return online.getGameProfile().name();
        if(owner(server,uuid))return server.getSingleplayerProfile().name();
        // The UUID overload reads profilesByUUID only; the String overload may contact auth services.
        return server.services().nameToIdCache().get(uuid).map(p->p.name()).orElse(null);
    }
    public static JsonObject players(ServerPlayer actor) {
        var server=actor.level().getServer();var ids=new TreeSet<UUID>();var paths=new HashMap<UUID,Path>();
        var root=server.getWorldPath(LevelResource.PLAYER_DATA_DIR);
        try {
            if(Files.isDirectory(root))try(var files=Files.list(root)) {
                for(var path:files.filter(p->Files.isRegularFile(p,LinkOption.NOFOLLOW_LINKS)).toList()) {
                    String filename=path.getFileName().toString();if(!filename.endsWith(".dat"))continue;
                    String text=filename.substring(0,filename.length()-4);
                    try {var uuid=UUID.fromString(text);if(!uuid.toString().equalsIgnoreCase(text))continue;ids.add(uuid);paths.put(uuid,path);}catch(IllegalArgumentException ignored){}
                }
            }
            server.getPlayerList().getPlayers().forEach(p->ids.add(p.getUUID()));
            var owner=server.getSingleplayerProfile();if(server.isSingleplayer()&&owner!=null)ids.add(owner.id());
            var entries=new JsonArray();
            for(var uuid:ids) {
                var r=new JsonObject();boolean online=server.getPlayerList().getPlayer(uuid)!=null,isOwner=owner(server,uuid);
                r.addProperty("uuid",uuid.toString());r.addProperty("name",name(server,uuid));r.addProperty("online",online);r.addProperty("self",uuid.equals(actor.getUUID()));r.addProperty("owner",isOwner);
                Path path=isOwner?server.getWorldPath(LevelResource.LEVEL_DATA_FILE):paths.get(uuid);
                r.add("last_played_ms",JsonNull.INSTANCE);if(!online&&path!=null&&Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS))r.addProperty("last_played_ms",Files.getLastModifiedTime(path,LinkOption.NOFOLLOW_LINKS).toMillis());
                entries.add(r);
            }
            var value=new JsonObject();value.add("entries",entries);return value;
        }catch(IOException e){throw new EditorSessions.Failure("offline_io","无法读取存档玩家名单："+e.getMessage());}
    }
    public static JsonObject summary(ServerPlayer p,String name) {
        var s=new JsonObject();s.addProperty("name",name);s.addProperty("game_mode",p.gameMode().getName());s.addProperty("health",p.getHealth());s.addProperty("food",p.getFoodData().getFoodLevel());s.addProperty("xp_level",p.experienceLevel);
        s.addProperty("dimension",p.level().dimension().identifier().toString());s.addProperty("x",p.getX());s.addProperty("y",p.getY());s.addProperty("z",p.getZ());s.addProperty("selected_slot",p.getInventory().getSelectedSlot());
        s.addProperty("inventory_count",count(p.getInventory(),Inventory.INVENTORY_SIZE));s.addProperty("ender_count",count(p.getEnderChestInventory(),p.getEnderChestInventory().getContainerSize()));
        var equipment=new JsonObject();for(var slot:EquipmentSlot.values())if(slot.getType()==EquipmentSlot.Type.HUMANOID_ARMOR||slot==EquipmentSlot.OFFHAND) {
            var stack=p.getItemBySlot(slot);equipment.addProperty(slot.getSerializedName(),stack.isEmpty()?null:BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        }
        s.add("equipment",equipment);return s;
    }
    private static int count(Container container,int size){int n=0;for(int i=0;i<size;i++)if(!container.getItem(i).isEmpty())n++;return n;}
    /** No real definitions: even datapack automatic rewards must never run during an archive read. */
    public static net.minecraft.server.ServerAdvancementManager emptyAdvancements() {
        // 26.3 eagerly reads the advancement registry in the constructor; older managers start empty.
        //? if >=26.3 {
        var empty=new net.minecraft.core.MappedRegistry<net.minecraft.advancements.Advancement>(Registries.ADVANCEMENT,com.mojang.serialization.Lifecycle.stable()).freeze();
        return new net.minecraft.server.ServerAdvancementManager(net.minecraft.core.HolderLookup.Provider.create(java.util.stream.Stream.of(empty)));
        //?} else {
        /*return new net.minecraft.server.ServerAdvancementManager(net.minecraft.core.RegistryAccess.EMPTY);
        *///?}
    }
    public static JsonObject export(ServerPlayer p,JsonElement sections,String name) {
        var world=new JsonObject();world.add("player",new JsonObject());var views=new JsonObject();views.add("player",PlayerWorldEdit.values(p));world.add("views",views);
        var request=new JsonObject();request.add("world",world);request.add("sections",sections==null?VaultTemplates.allSections():sections);
        var result=new JsonObject();
        try{result.add("template",VaultTemplates.capture("player_preset",request));}
        catch(VaultStore.Failure e){throw new EditorSessions.Failure("invalid_request","预设分区无效或重复："+e.getMessage());}
        result.add("summary",summary(p,name));return result;
    }
    public static <T> T offline(MinecraftServer server,UUID uuid,Function<ServerPlayer,T> projection) {
        if(server.getPlayerList().getPlayer(uuid)!=null)PlayerExtendedEditor.fail("player_online","目标玩家已上线，请重新打开在线玩家");
        // Native PlayerList.loadPlayerData resolves the singleplayer UUID in all supported versions.
        // Read its selected file ourselves: PlayerDataStorage.load creates backups on corrupt reads.
        UUID stored=owner(server,uuid)&&server.getWorldData().getSinglePlayerUUID()!=null?server.getWorldData().getSinglePlayerUUID():uuid;
        return loaded(server,OfflinePlayerEdit.readData(server,stored),projection);
    }
    public static <T> T loaded(MinecraftServer server,CompoundTag data,Function<ServerPlayer,T> projection) {
        if(!server.isSameThread())PlayerExtendedEditor.fail("invalid_request","玩家档案必须在服务端线程读取");
        var problems=new ProblemReporter.Collector();var input=TagValueInput.create(problems,server.registryAccess(),data.copy());
        var dimension=input.read("Dimension",ResourceKey.codec(Registries.DIMENSION)).orElse(Level.OVERWORLD);
        var level=server.getLevel(dimension);if(level==null)PlayerExtendedEditor.fail("unknown_dimension","玩家存档维度不在当前服务器中："+dimension.identifier());
        UUID temporary;Path unused;var list=server.getPlayerList();
        do{temporary=UUID.randomUUID();unused=server.getWorldPath(LevelResource.PLAYER_DATA_DIR).resolve(".cadeditor-read-"+temporary);}while(list.stats.containsKey(temporary)||list.advancements.containsKey(temporary)||list.getPlayer(temporary)!=null||Files.exists(unused,LinkOption.NOFOLLOW_LINKS));
        try {
            // Bypass locateStatsFile's legacy-name migration and automatic advancement rewards.
            // These native read-only instances have an absent path and an independent empty manager.
            list.stats.put(temporary,new net.minecraft.stats.ServerStatsCounter(server,unused));
            list.advancements.put(temporary,new net.minecraft.server.PlayerAdvancements(server.getFixerUpper(),list,emptyAdvancements(),unused,null));
            var player=new ServerPlayer(server,level,new GameProfile(temporary,"ArchiveReader"),ClientInformation.createDefault());
            player.load(input);
            if(!problems.isEmpty())PlayerExtendedEditor.fail("invalid_nbt","原版玩家加载校验失败："+problems.getReport());
            return projection.apply(player);
        }catch(EditorSessions.Failure e){throw e;}catch(RuntimeException e){throw new EditorSessions.Failure("invalid_nbt","原版玩家加载失败："+e.getMessage());}
        finally {
            list.stats.remove(temporary);var advancements=list.advancements.remove(temporary);
            if(advancements!=null) {
                //? if >=26.2 {
                advancements.clearTriggers();
                //?} else {
                /*advancements.stopListening();
                *///?}
            }
        }
    }
}
