package dev.rinorsi.editor.registry;
import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
import java.nio.file.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.*;
import net.minecraft.world.level.block.Blocks;

/** Real route/sessions and real horse/chicken ticks; reply sink replaces network only. */
public final class WorldRevisionServerProbe implements ModInitializer {
    private final JsonObject receipt=new JsonObject();private final JsonArray events=new JsonArray();private ServerPlayer player;private WorldTarget target;private JsonObject world;private int ticks,phase,checks;private boolean finished;private long lastAt;private String oldRevision;
    public void onInitialize(){ServerLifecycleEvents.SERVER_STARTED.register(this::start);ServerTickEvents.END_SERVER_TICK.register(this::tick);}
    private void start(MinecraftServer server){try{
        var l=server.overworld();l.setChunkForced(0,0,true);l.getChunk(0,0);for(int x=0;x<15;x++)for(int z=0;z<8;z++)l.setBlock(new BlockPos(x,64,z),Blocks.STONE.defaultBlockState(),3);
        player=new ServerPlayer(server,l,new GameProfile(UUID.randomUUID(),"RevisionProbe"),ClientInformation.createDefault());player.setPos(6,65,5);
        server.getPlayerList().getOps().add(new net.minecraft.server.players.ServerOpListEntry(player.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));
        var horse=net.minecraft.world.entity.EntityTypes.HORSE.create(l,EntitySpawnReason.COMMAND);horse.setPos(6.5,65,5.5);horse.setPermanentlyInvulnerable(true);horse.getAttribute(net.minecraft.world.entity.ai.attributes.Attributes.MOVEMENT_SPEED);l.addFreshEntity(horse);
        var chicken=net.minecraft.world.entity.EntityTypes.CHICKEN.create(l,EntitySpawnReason.COMMAND);chicken.setPos(horse.position());chicken.setAge(-200);chicken.setInLoveTime(200);chicken.eggTime=200;l.addFreshEntity(chicken);if(!chicken.startRiding(horse,true,true))throw new AssertionError("mount failed");
        var slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("dim",l.dimension().identifier().toString());slot.addProperty("uuid",horse.getStringUUID());target=WorldTarget.resolve(player,slot);
        var opening=target.sessionData();receipt.addProperty("sessionBeforeOpen",opening.toString());var reply=call("open",slot,null,null);receipt.add("opened",reply);world=reply.getAsJsonObject("world");
        receipt.addProperty("returnedRevision",world.get("revision").getAsString());receipt.addProperty("storedRevision",state().revision);receipt.addProperty("storedBaseline",state().baseline.toString());
        var snap=EntitySessionData.pack(WorldNbt.parse(world.get("snbt").getAsString()),horse);receipt.addProperty("snapshotSession",snap.toString());receipt.add("stableDiff",new Gson().toJsonTree(EntitySchema.diff(EntityVolatile.stable(opening),EntityVolatile.stable(snap))));
        horse.setDeltaMovement(0.25,0,0);horse.getNavigation().moveTo(11,65,5,1);
        lastAt=System.nanoTime();receipt.add("events",events);
    }catch(Throwable e){finish(server,e);}}
    private WorldEditSessions.State state()throws Exception{var sf=WorldEditor.class.getDeclaredField("SESSIONS");sf.setAccessible(true);var sessions=sf.get(null);var f=WorldEditSessions.class.getDeclaredField("states");f.setAccessible(true);return ((Map<UUID,WorldEditSessions.State>)f.get(sessions)).get(player.getUUID());}
    private void tick(MinecraftServer server){if(finished||world==null)return;try{if(++ticks>300)throw new AssertionError("probe timed out");if(ticks<20||System.nanoTime()-lastAt<600_000_000L)return;lastAt=System.nanoTime();player.setPos(target.entity.getX()+1,target.entity.getY(),target.entity.getZ());
        var draft=WorldNbt.parse(world.get("snbt").getAsString());
        if(phase==0){
            var current=target.sessionData();receipt.addProperty("ticks",ticks);receipt.addProperty("current",current.toString());receipt.addProperty("baselineAfterTicks",state().baseline.toString());require(state().baseline.toString().equals(receipt.get("storedBaseline").getAsString()),"ticks never mutate frozen session baseline");
            var baseData=EntitySessionData.data(state().baseline);var liveData=EntitySessionData.data(current);receipt.add("passengerTickDiff",new Gson().toJsonTree(EntitySchema.diff(baseData.getList("Passengers").orElseThrow().getCompound(0).orElseThrow(),liveData.getList("Passengers").orElseThrow().getCompound(0).orElseThrow())));
            try{WorldNbt.requireRevision(WorldNbt.revision(state().baseline),current);throw new AssertionError("legacy full-current check unexpectedly accepted tick changes");}catch(EditorSessions.Failure e){receipt.addProperty("legacyCode",e.code);receipt.addProperty("legacyReason",e.getMessage());checks++;}
            oldRevision=world.get("revision").getAsString();draft.putString("CustomName","Horse probe");accept(draft);
            var baseline=state().baseline.toString();var beforeAck=call("apply",world.getAsJsonObject("slot"),oldRevision,draft.toString());events.add(beforeAck);require(beforeAck.get("code").getAsString().equals("rate_limited")&&beforeAck.get("retryAfterMs").getAsInt()>0,"rapid before-ack stale request gets retry delay");
            var afterAck=call("apply",world.getAsJsonObject("slot"),world.get("revision").getAsString(),draft.toString());events.add(afterAck);require(afterAck.get("code").getAsString().equals("rate_limited")&&afterAck.get("retryAfterMs").getAsInt()<=beforeAck.get("retryAfterMs").getAsInt(),"rapid after-ack request does not extend rate window");require(state().baseline.toString().equals(baseline),"rate-limited clicks do not change baseline");
        }else if(phase==1){
            var baseline=state().baseline.toString();var stale=call("apply",world.getAsJsonObject("slot"),oldRevision,draft.toString());events.add(stale);require(stale.get("code").getAsString().equals("target_changed")&&stale.get("stale").getAsString().equals("client_revision"),"genuinely old successful-save revision diagnosed");require(state().baseline.toString().equals(baseline),"stale request never changes baseline");
        }else if(phase==2){
            ((net.minecraft.world.entity.AgeableMob)target.entity.getPassengers().getFirst()).setAge(0);receipt.addProperty("adultPassengerBefore",WorldTarget.saveEntity(target.entity.getPassengers().getFirst(),target.level.registryAccess()).toString());
            var attrs=draft.getList("attributes").orElseThrow();boolean found=false;for(var raw:attrs)if(raw instanceof net.minecraft.nbt.CompoundTag row&&row.getString("id").orElse("").equals("minecraft:movement_speed")){row.putDouble("base",row.getDouble("base").orElseThrow()+0.01);found=true;}require(found,"real horse saved movement attribute");accept(draft);
        }else if(phase==3){var child=WorldTarget.saveEntity(target.entity.getPassengers().getFirst(),target.level.registryAccess());receipt.addProperty("adultPassengerCurrent",child.toString());require(child.getInt("EggLayTime").orElseThrow()<200,"adult rider egg timer actually ticked");try{WorldNbt.requireRevision(WorldNbt.revision(state().baseline),target.sessionData());throw new AssertionError("legacy adult egg timer unexpectedly accepted");}catch(EditorSessions.Failure e){receipt.addProperty("legacyAdultEggReason",e.getMessage());checks++;}var tags=new net.minecraft.nbt.ListTag();tags.add(net.minecraft.nbt.StringTag.valueOf("cadeditor_merge2"));draft.put("Tags",tags);accept(draft);
        }else {draft.putString("CustomName","Second acknowledged name");accept(draft);receipt.addProperty("checks",checks);finish(server,null);return;}
        phase++;
    }catch(Throwable e){finish(server,e);}}
    private void accept(net.minecraft.nbt.CompoundTag draft)throws Exception{var reply=call("apply",world.getAsJsonObject("slot"),world.get("revision").getAsString(),draft.toString());events.add(reply);require(reply.get("status").getAsString().equals("saved"),"horse edit accepted: "+reply);world=reply.getAsJsonObject("world");require(world.get("revision").getAsString().equals(state().revision),"ack revision equals frozen server revision");require(WorldNbt.parse(world.get("snbt").getAsString()).equals(EntitySessionData.data(state().baseline)),"ack SNBT equals exact captured server baseline");require(target.entity.getPassengers().size()==1,"editing preserves actual chicken rider");}
    private void require(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;}
    private JsonObject call(String op,JsonObject slot,String revision,String snbt){var req=new JsonObject();req.addProperty("op",op);req.addProperty("requestId",op+"-"+UUID.randomUUID());req.add("slot",slot);if(revision!=null)req.addProperty("revision",revision);if(snbt!=null)req.addProperty("snbt",snbt);var out=new ArrayList<JsonObject>();WorldEditor.route(player,req,()->new EditorPolicy(2,false),out::add);return out.getFirst();}
    private void finish(MinecraftServer s,Throwable e){finished=true;try{if(e!=null){e.printStackTrace();receipt.addProperty("error",e.toString());}receipt.addProperty("passed",e==null);Files.writeString(Path.of(System.getProperty("cadeditor.revision.receipt")),new GsonBuilder().setPrettyPrinting().create().toJson(receipt));}catch(Exception x){throw new RuntimeException(x);}finally{s.halt(false);}}
}
