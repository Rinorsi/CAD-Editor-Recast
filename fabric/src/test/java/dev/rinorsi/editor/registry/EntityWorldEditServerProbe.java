package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.*;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.npc.villager.AbstractVillager;
import net.minecraft.world.item.*;
import net.minecraft.world.item.trading.*;
import net.minecraft.world.level.block.Blocks;

/** Opt-in test-only dedicated-server mod. Runs only in a newly created scratch world. */
public final class EntityWorldEditServerProbe implements ModInitializer {
    private final JsonObject receipt=new JsonObject();private Entity zombie;private CompoundTag opened;private int ticks;private boolean finished;
    public void onInitialize(){ServerLifecycleEvents.SERVER_STARTED.register(this::start);ServerTickEvents.END_SERVER_TICK.register(this::tick);}
    private void start(MinecraftServer server){try{
        var level=server.overworld();var access=level.registryAccess();receipt.addProperty("mode","real-dedicated-ServerLevel");
        level.setChunkForced(0,0,true);level.getChunk(0,0);for(int x=-1;x<8;x++)for(int z=-1;z<4;z++)level.setBlock(new BlockPos(x,64,z),Blocks.STONE.defaultBlockState(),3);
        zombie=net.minecraft.world.entity.EntityTypes.ZOMBIE.create(level,EntitySpawnReason.COMMAND);zombie.setPos(0.5,65,0.5);zombie.setPermanentlyInvulnerable(true);level.addFreshEntity(zombie);((Mob)zombie).getNavigation().moveTo(5.5,65,0.5,1.0);zombie.setDeltaMovement(0.3,0,0);opened=WorldTarget.saveEntity(zombie,access);
        for(var type:java.util.List.of(net.minecraft.world.entity.EntityTypes.VILLAGER,net.minecraft.world.entity.EntityTypes.WANDERING_TRADER)){
            var merchant=(AbstractVillager)type.create(level,EntitySpawnReason.COMMAND);merchant.setPos(2,65,2);
            var offers=new MerchantOffers();offers.add(new MerchantOffer(new ItemCost(Items.EMERALD,2),new ItemStack(Items.BREAD,3),12,5,0.05f));
            var seed=WorldTarget.saveEntity(merchant,access);seed.put("Offers",MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),offers).getOrThrow());EntityWorldEdit.load(merchant,seed,access);level.addFreshEntity(merchant);
            var before=WorldTarget.saveEntity(merchant,access);var view=EntityWorldEdit.views(merchant,before,access);require(view.getAsJsonObject("trades").get("available").getAsBoolean(),"trades on ServerLevel");
            var list=view.getAsJsonObject("trades").getAsJsonArray("offers").deepCopy();list.get(0).getAsJsonObject().addProperty("uses",3);var edit=new JsonObject();edit.add("offers",list);
            var next=EntityWorldEdit.prepare(merchant,before,edit,level,access);EntityWorldEdit.load(merchant,next,access);require(merchant.getOffers().get(0).getUses()==3,"offer write persisted on server");capture(type.toString(),merchant,level);
            edit.add("offers",new JsonArray());var cleared=EntityWorldEdit.prepare(merchant,WorldTarget.saveEntity(merchant,access),edit,level,access);EntityWorldEdit.load(merchant,cleared,access);require(merchant.getOffers().isEmpty(),"empty offers do not regenerate");
            EntityWorldEdit.load(merchant,before,access);require(merchant.getOffers().size()==1,"offer preimage undo");
        }
        var stand=net.minecraft.world.entity.EntityTypes.ARMOR_STAND.create(level,EntitySpawnReason.COMMAND);apply(stand,"{pose:{Head:[15,25,35],LeftArm:[-90,0,0],ShowArms:true,Small:true,NoBasePlate:true}}",level);capture("armor_stand",stand,level);
        var frame=net.minecraft.world.entity.EntityTypes.ITEM_FRAME.create(level,EntitySpawnReason.COMMAND);apply(frame,"{item_frame:{item:{id:'minecraft:diamond',count:1,comps:{},removed:{}},ItemRotation:3,Invisible:true,Fixed:true,ItemDropChance:0.5}}",level);capture("item_frame",frame,level);
        var text=net.minecraft.world.entity.EntityTypes.TEXT_DISPLAY.create(level,EntitySpawnReason.COMMAND);apply(text,"{display:{text:{text:'Server text',bold:true},line_width:120,alignment:'left',shadow:true,see_through:true,background:-16777216,text_opacity:-1,transformation:{translation:[1,2,3],scale:[1,1,1],left_rotation:[0,0,0,1],right_rotation:[0,0,0,1]},interpolation_duration:20,start_interpolation:5}}",level);capture("text_display",text,level);require(WorldTarget.saveEntity(text,access).get("text").toString().contains("Server text"),"text retained by real server resolver");
        var vehicle=net.minecraft.world.entity.EntityTypes.ZOMBIE.create(level,EntitySpawnReason.COMMAND);var cat=net.minecraft.world.entity.EntityTypes.CAT.create(level,EntitySpawnReason.COMMAND);vehicle.setPos(4,65,1);cat.setPos(vehicle.position());level.addFreshEntity(vehicle);level.addFreshEntity(cat);EntityRiding.tryRide(cat,vehicle);capture("cat_riding_zombie",vehicle,level);
    }catch(Throwable error){fail(server,error);}}
    private void tick(MinecraftServer server){if(finished||zombie==null)return;try{++ticks;if(zombie.tickCount<10){require(ticks<200,"forced chunk did not tick probe entity");return;}
        var level=server.overworld();var current=WorldTarget.saveEntity(zombie,level.registryAccess());
        var evidence=new JsonObject();evidence.addProperty("before",opened.toString());evidence.addProperty("current",current.toString());receipt.add("walking_zombie",evidence);
        require(!opened.get("Pos").equals(current.get("Pos")),"zombie moved over ten real server ticks");require(WorldNbt.revision(opened).equals(WorldNbt.revision(current)),"walking zombie stable revision; remaining differences="+EntitySchema.diff(EntityVolatile.stable(opened),EntityVolatile.stable(current)));
        var draft=opened.copy();draft.putString("CustomName","walking mob edited");var merged=EntityVolatile.rebase(opened,draft,current,false);var prepared=WorldTarget.copyEntity(zombie,merged,level,level.registryAccess());EntityWorldEdit.load(zombie,prepared,level.registryAccess());
        var after=WorldTarget.saveEntity(zombie,level.registryAccess());require(after.get("Pos").equals(current.get("Pos")),"name apply never rewinds position");var row=new JsonObject();row.addProperty("tickBefore",0);row.addProperty("tickAfter",ticks);row.addProperty("before",opened.toString());row.addProperty("current",current.toString());row.addProperty("after",after.toString());receipt.add("walking_zombie",row);
        ((LivingEntity)zombie).setHealth(7);require(!WorldNbt.revision(after).equals(WorldNbt.revision(WorldTarget.saveEntity(zombie,level.registryAccess()))),"concurrent Health conflicts");
        receipt.addProperty("passed",true);finish(server);
    }catch(Throwable error){fail(server,error);}}
    private void apply(Entity source,String json,ServerLevel level){var next=EntityWorldEdit.prepare(source,WorldTarget.saveEntity(source,level.registryAccess()),JsonParser.parseString(json).getAsJsonObject(),level,level.registryAccess());EntityWorldEdit.load(source,next,level.registryAccess());}
    private void capture(String id,Entity source,ServerLevel level){var row=new JsonObject();var nbt=WorldTarget.saveEntity(source,level.registryAccess());row.addProperty("snbt",nbt.toString());var views=EntityWorldEdit.views(source,nbt,level.registryAccess());if(source instanceof Display.TextDisplay)require(views.getAsJsonObject("display").getAsJsonObject("text").getAsJsonPrimitive("bold").isBoolean(),"text component styles use Codec JSON booleans, not NBT byte projections");row.add("views",views);receipt.add(id,row);}
    private void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    private void fail(MinecraftServer server,Throwable error){error.printStackTrace();receipt.addProperty("passed",false);receipt.addProperty("error",error.toString());finish(server);}
    private void finish(MinecraftServer server){finished=true;try{Path path=Path.of(System.getProperty("cadeditor.entity.receipt"));Files.createDirectories(path.toAbsolutePath().getParent());Files.writeString(path,new GsonBuilder().serializeNulls().setPrettyPrinting().create().toJson(receipt));}catch(Exception error){throw new RuntimeException(error);}finally{server.halt(false);}}
}
