package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.util.*;
import net.minecraft.SharedConstants;
import net.minecraft.nbt.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.datafix.DataFixTypes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.storage.*;

/** Offline player writes preserve unexposed data and never fall back to non-atomic replacement. */
public final class OfflinePlayerEdit {
    private OfflinePlayerEdit() {}
    public static final int RETENTION=5;
    private static final long MAX_BYTES=8L*1024*1024;
    // Security allowlist, not candidate data. Only keys actually serialized by vanilla are exposed.
    private static final Set<String> FIELDS=Set.of("Inventory","EnderItems","SelectedItemSlot","Health","foodLevel","foodSaturationLevel","XpLevel","XpP","XpTotal");
    public record Snapshot(Path path,String fingerprint,CompoundTag data,CompoundTag editable,JsonObject summary){
        public JsonObject value(){var v=new JsonObject();v.addProperty("snbt",editable.toString());v.add("summary",summary.deepCopy());return v;}
    }
    static void guard(MinecraftServer server,UUID uuid){
        if(!server.isSameThread())PlayerExtendedEditor.fail("invalid_request",EditorI18n.tr("cadeditor.message.offlineplayeredit.ae7ba8e185"));
        if(server.getPlayerList().getPlayer(uuid)!=null)PlayerExtendedEditor.fail("player_online",EditorI18n.tr("cadeditor.message.offlineplayeredit.3e733344c4"));
        var owner=server.getSingleplayerProfile();if(server.isSingleplayer()&&owner!=null&&owner.id().equals(uuid))PlayerExtendedEditor.fail("offline_owner_unsupported",EditorI18n.tr("cadeditor.message.offlineplayeredit.1db2f79900"));
    }
    public static Snapshot read(MinecraftServer server,UUID uuid){
        guard(server,uuid);
        var root=server.getWorldPath(LevelResource.PLAYER_DATA_DIR).toAbsolutePath().normalize();var path=root.resolve(uuid+".dat");
        try {
            if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS))PlayerExtendedEditor.fail("offline_missing",EditorI18n.tr("cadeditor.message.offlineplayeredit.9f7c96042f"));
            byte[] bytes=bytes(path);var raw=NbtIo.readCompressed(new ByteArrayInputStream(bytes),NbtAccounter.create(MAX_BYTES));
            if(raw.getIntOr("DataVersion",-1)>SharedConstants.getCurrentVersion().dataVersion().version())
                PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.eb7711e46e"));
            var data=DataFixTypes.PLAYER.updateToCurrentVersion(server.getFixerUpper(),raw,raw.getIntOr("DataVersion",-1));
            var nativeData=roundTrip(server,uuid,data);var editable=new CompoundTag();
            for(String k:new TreeSet<>(FIELDS))if(nativeData.contains(k))editable.put(k,nativeData.get(k).copy());
            if(editable.toString().length()>WorldNbt.MAX_SNBT)PlayerExtendedEditor.fail("payload_too_large",EditorI18n.tr("cadeditor.message.offlineplayeredit.afb27aa384"));
            var summary=PlayerProfiles.loaded(server,data,p->PlayerProfiles.summary(p,PlayerProfiles.name(server,uuid)));
            return new Snapshot(path,PlayerExtendedEditor.hash(bytes),data,editable,summary);
        }catch(IOException e){throw io(e);}
    }
    /** Full editor baseline: no SNBT text projection or its 24K text limit. */
    static Snapshot readFull(MinecraftServer server,UUID uuid){
        guard(server,uuid);var path=server.getWorldPath(LevelResource.PLAYER_DATA_DIR).toAbsolutePath().normalize().resolve(uuid+".dat");
        try {
            if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS))PlayerExtendedEditor.fail("offline_missing",EditorI18n.tr("cadeditor.message.offlineplayeredit.9f7c96042f"));
            var bytes=bytes(path);var raw=NbtIo.readCompressed(new ByteArrayInputStream(bytes),NbtAccounter.create(MAX_BYTES));
            if(raw.getIntOr("DataVersion",-1)>SharedConstants.getCurrentVersion().dataVersion().version())PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.eb7711e46e"));
            var data=DataFixTypes.PLAYER.updateToCurrentVersion(server.getFixerUpper(),raw,raw.getIntOr("DataVersion",-1));
            return new Snapshot(path,PlayerExtendedEditor.hash(bytes),data,new CompoundTag(),new JsonObject());
        }catch(IOException e){throw io(e);}
    }
    private static byte[] bytes(Path path)throws IOException {if(Files.size(path)>MAX_BYTES)PlayerExtendedEditor.fail("payload_too_large",EditorI18n.tr("cadeditor.message.offlineplayeredit.d8991c4cbc"));try(var input=Files.newInputStream(path)){var bytes=input.readNBytes((int)MAX_BYTES+1);if(bytes.length>MAX_BYTES)PlayerExtendedEditor.fail("payload_too_large",EditorI18n.tr("cadeditor.message.offlineplayeredit.d8991c4cbc"));return bytes;}}
    static CompoundTag readData(MinecraftServer server,UUID uuid){
        var path=server.getWorldPath(LevelResource.PLAYER_DATA_DIR).resolve(uuid+".dat");
        try {
            if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS))PlayerExtendedEditor.fail("offline_missing",EditorI18n.tr("cadeditor.message.offlineplayeredit.9f7c96042f"));
            var raw=NbtIo.readCompressed(new ByteArrayInputStream(bytes(path)),NbtAccounter.create(MAX_BYTES));
            if(raw.getIntOr("DataVersion",-1)>SharedConstants.getCurrentVersion().dataVersion().version())PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.aaa4df2534"));
            return DataFixTypes.PLAYER.updateToCurrentVersion(server.getFixerUpper(),raw,raw.getIntOr("DataVersion",-1));
        }catch(IOException e){throw io(e);}
    }
    private static CompoundTag roundTrip(MinecraftServer server,UUID uuid,CompoundTag data){
        // A detached vanilla Player avoids ServerPlayer's PlayerList stats/advancement caches.
        var player=new Player(server.overworld(),new GameProfile(uuid,"OfflineEditor")){
            @Override public GameType gameMode(){return GameType.SURVIVAL;}
        };
        var problems=new ProblemReporter.Collector();
        try {
            player.load(TagValueInput.create(problems,server.registryAccess(),data));
            var output=TagValueOutput.createWithContext(problems,server.registryAccess());player.saveWithoutId(output);
            if(!problems.isEmpty())PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.00aef8c274", (problems.getReport())));
            return output.buildResult();
        }catch(EditorSessions.Failure e){throw e;}catch(RuntimeException e){throw new EditorSessions.Failure("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.16c36a9f94", (e.getMessage())));}
    }
    public static Runnable prepare(MinecraftServer server,UUID uuid,Snapshot baseline,JsonElement patch){
        guard(server,uuid);var object=patch.getAsJsonObject();PlayerExtendedEditor.keys(object,Set.of("snbt"));
        var requested=WorldNbt.parse(StackCodec.string(object,"snbt"));
        if(!requested.keySet().equals(baseline.editable.keySet()))PlayerExtendedEditor.fail("protected_field",EditorI18n.tr("cadeditor.message.offlineplayeredit.43b43b733e"));
        var desired=baseline.data.copy();
        for(String key:requested.keySet())if(!Objects.equals(requested.get(key),baseline.editable.get(key)))desired.put(key,requested.get(key).copy());
        var loaded=roundTrip(server,uuid,desired);
        // Reject ignored/clamped values, malformed stacks, wrong NBT types and edits to duplicate slots.
        WorldNbt.requireEditedFieldsRetained(baseline.editable,requested,loaded);
        checkRanges(requested);
        desired.putInt("DataVersion",SharedConstants.getCurrentVersion().dataVersion().version());
        return ()->replace(server,uuid,baseline,desired);
    }
    private static void checkRanges(CompoundTag data){
        for(String key:List.of("Health","foodSaturationLevel","XpP")){if(data.contains(key)){double v=data.getDouble(key).orElse(Double.NaN);if(!Double.isFinite(v)||v<0||(key.equals("XpP")&&v>=1))PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.12040f7657", (key)));}}
        for(String key:List.of("XpLevel","XpTotal","foodLevel","SelectedItemSlot"))if(data.contains(key)){int v=data.getInt(key).orElse(-1);int max=key.equals("foodLevel")?20:key.equals("SelectedItemSlot")?net.minecraft.world.entity.player.Inventory.getSelectionSize()-1:key.equals("XpLevel")?1000000:Integer.MAX_VALUE;if(v<0||v>max)PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.dad54b56f0", (key)));}
        if(data.getFloatOr("foodSaturationLevel",0)>data.getIntOr("foodLevel",20))PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.f539c013e9"));
    }
    static void replace(MinecraftServer server,UUID uuid,Snapshot baseline,CompoundTag desired){
        Path temporary=null;
        try {
            guard(server,uuid);requireUnchanged(baseline);
            temporary=Files.createTempFile(baseline.path.getParent(),".cadeditor-"+uuid+"-",".dat");
            NbtIo.writeCompressed(desired,temporary);
            try(var channel=FileChannel.open(temporary,StandardOpenOption.WRITE)){channel.force(true);}
            if(!desired.equals(NbtIo.readCompressed(temporary,NbtAccounter.create(MAX_BYTES))))PlayerExtendedEditor.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayeredit.3d94439b04"));
            guard(server,uuid);requireUnchanged(baseline);
            var backups=baseline.path.getParent().resolve("cadeditor-backups").resolve(uuid.toString());Files.createDirectories(backups);
            var backup=backups.resolve(String.format(Locale.ROOT,"%019d-%s.dat",System.currentTimeMillis(),UUID.randomUUID()));
            Files.copy(baseline.path,backup);
            try(var channel=FileChannel.open(backup,StandardOpenOption.WRITE)){channel.force(true);}
            if(!PlayerExtendedEditor.hash(bytes(backup)).equals(baseline.fingerprint))PlayerExtendedEditor.fail("target_changed",EditorI18n.tr("cadeditor.message.offlineplayeredit.bf4a7169a9"));
            // Same server thread: a login queued during validation cannot interleave with this final check/move.
            guard(server,uuid);requireUnchanged(baseline);
            Files.move(temporary,baseline.path,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);temporary=null;
            // Retention is housekeeping; an error after a committed replacement must not claim it was rejected.
            try(var paths=Files.list(backups)){var list=paths.filter(p->p.getFileName().toString().endsWith(".dat")).sorted(Comparator.reverseOrder()).toList();for(int i=RETENTION;i<list.size();i++)Files.delete(list.get(i));}catch(IOException e){org.slf4j.LoggerFactory.getLogger("OfflinePlayerEdit").warn("Backup retention failed for {}",uuid,e);}
        }catch(IOException e){throw io(e);}finally{if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(IOException ignored){}}
    }
    private static void requireUnchanged(Snapshot baseline)throws IOException {if(!Files.isRegularFile(baseline.path,LinkOption.NOFOLLOW_LINKS)||!PlayerExtendedEditor.hash(bytes(baseline.path)).equals(baseline.fingerprint))PlayerExtendedEditor.fail("target_changed",EditorI18n.tr("cadeditor.message.offlineplayeredit.f7ad84e11f"));}
    private static EditorSessions.Failure io(IOException e){return new EditorSessions.Failure("offline_io",EditorI18n.tr("cadeditor.message.offlineplayeredit.20ff61ef46", (e.getMessage())));}
}
