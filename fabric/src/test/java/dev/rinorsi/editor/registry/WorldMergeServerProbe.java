package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.*;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.entity.*;
import net.minecraft.world.item.*;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.*;

/** Dedicated scratch ServerLevel, actual ticks, native loaders and merge plan. No client. */
public final class WorldMergeServerProbe implements ModInitializer {
    private final JsonObject receipt=new JsonObject();private int ticks,checks;
    private WorldTarget furnace,zombie,chest,stand;private CompoundTag fb,zb,cb,sb;
    public void onInitialize(){ServerLifecycleEvents.SERVER_STARTED.register(s->{try{setup(s);}catch(Throwable e){finish(s,e);}});ServerTickEvents.END_SERVER_TICK.register(s->{if(fb!=null)try{++ticks;if(ticks>200)throw new AssertionError("forced chunk entity did not tick");if(ticks>=20&&zombie.entity.tickCount>=10){run(s);finish(s,null);}}catch(Throwable e){finish(s,e);}});}
    private WorldTarget target(net.minecraft.server.level.ServerLevel l,BlockEntity b,Entity e)throws Exception{var ctor=WorldTarget.class.getDeclaredConstructor(net.minecraft.world.level.Level.class,BlockEntity.class,Entity.class);ctor.setAccessible(true);return ctor.newInstance(l,b,e);}
    private void setup(MinecraftServer server)throws Exception{
        var l=server.overworld();l.setChunkForced(0,0,true);l.getChunk(0,0);
        var fp=new BlockPos(2,65,2);l.setBlock(fp,Blocks.FURNACE.defaultBlockState(),3);var f=(AbstractFurnaceBlockEntity)l.getBlockEntity(fp);f.setItem(0,new ItemStack(Items.RAW_IRON,3));f.setItem(1,new ItemStack(Items.COAL,3));furnace=target(l,f,null);fb=furnace.sessionData();
        var cp=new BlockPos(3,65,2);l.setBlock(cp,Blocks.CHEST.defaultBlockState(),3);var c=(ChestBlockEntity)l.getBlockEntity(cp);c.setItem(0,new ItemStack(Items.STONE,1));c.setItem(1,new ItemStack(Items.DIRT,2));chest=target(l,c,null);cb=chest.sessionData();
        for(int x=5;x<14;x++)for(int z=5;z<9;z++)l.setBlock(new BlockPos(x,64,z),Blocks.STONE.defaultBlockState(),3);
        var z=EntityType.ZOMBIE.create(l,EntitySpawnReason.COMMAND);z.setPos(6.5,65,6.5);z.setInvulnerable(true);l.addFreshEntity(z);z.getNavigation().moveTo(12.5,65,6.5,1);z.setDeltaMovement(0.3,0,0);zombie=target(l,null,z);zb=zombie.sessionData();
        var a=EntityType.ARMOR_STAND.create(l,EntitySpawnReason.COMMAND);a.setPos(4.5,65,4.5);l.addFreshEntity(a);var cat=EntityType.CAT.create(l,EntitySpawnReason.COMMAND);cat.setPos(a.position());l.addFreshEntity(cat);require(cat.startRiding(a,true,true),"real passenger attached");stand=target(l,null,a);sb=stand.sessionData();
    }
    private void run(MinecraftServer server)throws Exception{
        var fc=furnace.save();receipt.addProperty("ticks",ticks);receipt.addProperty("zombieTicks",zombie.entity.tickCount);receipt.addProperty("furnaceBefore",BlockSessionData.data(fb).toString());receipt.addProperty("furnaceCurrent",fc.toString());require(!fc.equals(BlockSessionData.data(fb)),"real furnace tick changed saved data");var draft=BlockSessionData.data(fb);draft.putString("CustomName","Warm furnace");var req=new JsonObject();req.addProperty("snbt",draft.toString());var plan=WorldMergePlan.prepare(furnace,fb,null,req);require(plan.nbt().get("lit_time_remaining").equals(fc.get("lit_time_remaining")),"furnace current fuel timer retained");require(plan.blockState().equals(furnace.blockState()),"furnace lit state retained");furnace.write(plan.nbt(),plan.blockState(),false);require(furnace.save().getString("CustomName").orElse("").contains("Warm furnace"),"furnace name applied");
        ((ChestBlockEntity)chest.block).setItem(1,new ItemStack(Items.DIRT,7));var chestBefore=chest.sessionData();var container=JsonParser.parseString("{container:{slots:[{slot:0,stack:{id:'minecraft:diamond',count:3,comps:{},removed:{}}}]}}").getAsJsonObject();var change=WorldMergePlan.prepare(chest,cb,null,container);chest.write(change.nbt());require(((ChestBlockEntity)chest.block).getItem(0).is(Items.DIAMOND)&&((ChestBlockEntity)chest.block).getItem(1).getCount()==7,"native normalized container keeps other live slot");var after=chest.sessionData();((ChestBlockEntity)chest.block).setItem(1,new ItemStack(Items.DIRT,9));var undo=WorldMergePlan.prepare(chest,after,chestBefore,new JsonObject());chest.write(undo.nbt());require(((ChestBlockEntity)chest.block).getItem(0).is(Items.STONE)&&((ChestBlockEntity)chest.block).getItem(1).getCount()==9,"native undo restores only own slot");
        var z=(net.minecraft.world.entity.LivingEntity)zombie.entity;z.setHealth(9);var zc=zombie.save();var zd=EntitySessionData.data(zb);zd.putString("CustomName","Moving mob");var zr=new JsonObject();zr.addProperty("snbt",zd.toString());var zp=WorldMergePlan.prepare(zombie,zb,null,zr);require(zp.nbt().getFloat("Health").orElseThrow()==9,"name merge preserves received damage");require(zp.nbt().get("Pos").equals(zc.get("Pos"))&&zp.nbt().get("Brain").equals(zc.get("Brain")),"real movement and brain retained");require(!zc.get("Pos").equals(EntitySessionData.data(zb).get("Pos")),"zombie position changed over real ticks");zombie.write(zp.nbt());require(z.getHealth()==9&&z.getCustomName().getString().equals("Moving mob"),"native mob write applied");receipt.addProperty("zombieBefore",EntitySessionData.data(zb).toString());receipt.addProperty("zombieCurrent",zc.toString());receipt.addProperty("zombieAfter",zombie.save().toString());zd.putFloat("Health",15);zr.addProperty("snbt",zd.toString());try{WorldMergePlan.prepare(zombie,zb,null,zr);throw new AssertionError("expected Health conflict");}catch(WorldMerge.Conflict conflict){require(conflict.paths.contains(java.util.List.of("Health")),"real Health conflict has path");receipt.add("conflict",conflict.json());}
        var pose=JsonParser.parseString("{entity:{pose:{Head:[15,20,25],ShowArms:true}}}").getAsJsonObject();var sp=WorldMergePlan.prepare(stand,sb,null,pose);stand.write(sp.nbt());require(stand.entity.getPassengers().size()==1,"entity with passengers accepts normalized pose");require(((net.minecraft.world.entity.decoration.ArmorStand)stand.entity).getHeadPose().x()==15,"native pose applied");
        receipt.addProperty("scope","Real ServerLevel ticks + native merge plan/load/write; no network client; spawner/trial/mod timers covered by JVM data tests only");
    }
    private void require(boolean b,String m){if(!b)throw new AssertionError(m);checks++;}
    private void finish(MinecraftServer s,Throwable e){try{if(e!=null){e.printStackTrace();receipt.addProperty("error",e.toString());}receipt.addProperty("passed",e==null);receipt.addProperty("checks",checks);Files.writeString(Path.of(System.getProperty("cadeditor.merge.receipt")),new GsonBuilder().setPrettyPrinting().create().toJson(receipt));}catch(Exception x){throw new RuntimeException(x);}finally{fb=null;s.halt(false);}}
}
