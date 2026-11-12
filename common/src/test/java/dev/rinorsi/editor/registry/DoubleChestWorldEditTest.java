package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.world.CompoundContainer;
import net.minecraft.world.item.*;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.ChestType;

/** Real chest factories/loaders with a map-backed Level, without a server or ticks. */
public final class DoubleChestWorldEditTest {
    private static int checks;
    public static void run(RegistryAccess access) {
        for(var block:List.of(Blocks.CHEST,Blocks.TRAPPED_CHEST))for(var facing:Direction.Plane.HORIZONTAL){
            var level=new ChestLevel(access);var pos=new BlockPos(0,64,0);
            var state=block.defaultBlockState().setValue(ChestBlock.TYPE,ChestType.RIGHT).setValue(ChestBlock.FACING,facing);
            var otherPos=pos.relative(ChestBlock.getConnectedDirection(state));
            var first=level.put(pos,state);var second=level.put(otherPos,state.setValue(ChestBlock.TYPE,ChestType.LEFT));
            first.setItem(0,new ItemStack(Items.STONE,2));second.setItem(0,new ItemStack(Items.PAPER,3));second.setItem(26,new ItemStack(Items.DIAMOND,4));
            var vanilla=ChestBlock.getContainer((ChestBlock)block,state,level,pos,true);
            check(vanilla instanceof CompoundContainer,"vanilla recognizes pair");
            var target=WorldTarget.forBlock(level,first);var opposite=WorldTarget.forBlock(level,second);var slot=slot(pos);
            var view=target.snapshot(slot,false).getAsJsonObject("container");var oppositeView=opposite.snapshot(slot(otherPos),false).getAsJsonObject("container");
            check(view.get("size").getAsInt()==54&&view.getAsJsonObject("double").get("order").getAsString().equals("vanilla"),"54 metadata");
            check(view.get("slots").equals(oppositeView.get("slots")),"same numbering from either half "+facing+block);
            for(int i=0;i<54;i++){
                var stack=view.getAsJsonArray("slots").get(i).getAsJsonObject().getAsJsonObject("stack");
                check(vanilla.getItem(i).isEmpty()?stack.get("empty").getAsBoolean():stack.get("count").getAsInt()==vanilla.getItem(i).getCount(),"vanilla slot "+i);
            }
            var base=target.sessionData();var sessions=new WorldEditSessions();var player=UUID.randomUUID();var session=sessions.open(player,slot,base);
            // Live unrelated edits on both halves must survive a cross-half write and undo.
            first.setItem(5,new ItemStack(Items.COAL,5));second.setItem(6,new ItemStack(Items.GOLD_INGOT,6));
            check(!WorldNbt.revision(base).equals(WorldNbt.revision(target.sessionData())),"fingerprint covers live changes in both halves");
            var current=target.sessionData();var plan=WorldMergePlan.prepare(target,base,null,edit(0,27));
            var preview=DoubleChestEdit.preview(target,plan,slot,true).getAsJsonObject("container");check(preview.getAsJsonArray("slots").get(27).getAsJsonObject().getAsJsonObject("stack").get("empty").getAsBoolean(),"partner preview uses prepared data");
            DoubleChestEdit.write(target,plan,false,()->{});check(first.getItem(0).isEmpty()&&second.getItem(0).isEmpty(),"writes both halves");
            check(first.getItem(5).getCount()==5&&second.getItem(6).getCount()==6,"preserves both live slots");
            session.saved(current,target.sessionData(),false);second.setItem(7,new ItemStack(Items.EMERALD,7));
            var undo=WorldMergePlan.prepare(target,session.baseline,session.preimage(),new JsonObject());DoubleChestEdit.write(target,undo,false,()->{});
            check(first.getItem(0).getCount()==2&&second.getItem(0).getCount()==3&&second.getItem(7).getCount()==7,"undo both halves preserves later changes");
            var waterBase=target.sessionData();var waterPlan=WorldMergePlan.prepare(target,waterBase,null,JsonParser.parseString("{block_state:{waterlogged:true}}").getAsJsonObject());
            DoubleChestEdit.write(target,waterPlan,true,()->{});check(level.neighborUpdates==1&&first.getBlockState().getValue(ChestBlock.WATERLOGGED),"state edit notifies neighbors after pair load");
            DoubleChestEdit.write(target,WorldMergePlan.prepare(target,target.sessionData(),waterBase,new JsonObject()),false,()->{});
            var addedBase=target.sessionData();var added=edit(1,28);
            for(var row:added.getAsJsonObject("container").getAsJsonArray("slots"))row.getAsJsonObject().add("stack",JsonParser.parseString("{id:'minecraft:paper',count:4,comps:{},removed:{}}"));
            DoubleChestEdit.write(target,WorldMergePlan.prepare(target,addedBase,null,added),false,()->{});
            check(first.getItem(1).getCount()==4&&second.getItem(1).getCount()==4,"inserts cross-half slots despite later live slots");
            DoubleChestEdit.write(target,WorldMergePlan.prepare(target,target.sessionData(),addedBase,new JsonObject()),false,()->{});
            var reverseBase=opposite.sessionData();var reverse=WorldMergePlan.prepare(opposite,reverseBase,null,edit(0,53));DoubleChestEdit.write(opposite,reverse,false,()->{});
            check(first.getItem(0).isEmpty()&&second.getItem(26).isEmpty(),"opposite click writes same global slots");
            DoubleChestEdit.write(opposite,WorldMergePlan.prepare(opposite,opposite.sessionData(),reverseBase,new JsonObject()),false,()->{});
            var invalidBefore=target.sessionData();var invalid=edit(0,27);invalid.getAsJsonObject("container").getAsJsonArray("slots").get(1).getAsJsonObject().add("stack",JsonParser.parseString("{id:'minecraft:paper',count:65,comps:{},removed:{}}"));
            try{WorldMergePlan.prepare(target,invalidBefore,null,invalid);throw new AssertionError("expected invalid partner stack");}catch(RuntimeException expected){check(target.sessionData().equals(invalidBefore),"invalid partner leaves both halves intact");}
            var conflictBase=target.sessionData();second.setItem(0,new ItemStack(Items.PAPER,9));
            var overwrite=WorldMergePlan.prepare(target,conflictBase,null,edit(27));
            check(overwrite.partnerNbt().getList("Items").orElse(new ListTag()).stream().noneMatch(raw->raw instanceof CompoundTag row&&row.getByte("Slot").orElse((byte)-1)==0),"explicit partner slot deletion overrides concurrent edit");
            check(second.getItem(0).getCount()==9,"overwrite preparation leaves live partner intact");
            var before=target.sessionData();var rollbackPlan=WorldMergePlan.prepare(target,before,null,edit(0,27));
            for(var failAt:List.of(pos,otherPos)){
                level.failAt=failAt;
                try{DoubleChestEdit.write(target,rollbackPlan,false,()->{});throw new AssertionError("expected write failure");}catch(IllegalStateException expected){check(target.sessionData().equals(before),"either-half write failure rolls back both");}
            }
            try{DoubleChestEdit.write(target,rollbackPlan,false,()->{throw new IllegalStateException("reply failed");});throw new AssertionError("expected reply failure");}catch(IllegalStateException expected){check(target.sessionData().equals(before),"response failure rolls back both");}
            var splitBaseline=target.sessionData();
            changed(()->WorldMergePlan.prepare(target,splitBaseline,null,JsonParser.parseString("{block_state:{type:'single'}}").getAsJsonObject()));
            sessions.open(player,slot,splitBaseline);
            second.setBlockState(state.setValue(ChestBlock.TYPE,ChestType.SINGLE));
            changed(()->sessions.requireDoubleChestPresent(player,slot,level));check(first.getItem(0).getCount()==2,"split rejects before any write");
            second.setBlockState(state.setValue(ChestBlock.TYPE,ChestType.LEFT));level.blocks.remove(otherPos);changed(()->sessions.requireDoubleChestPresent(player,slot,level));
            level.blocks.put(otherPos,second);level.blocks.remove(pos);changed(()->sessions.requireDoubleChestPresent(player,slot,level));
            level.blocks.put(pos,first);level.blocks.put(otherPos,new BarrelBlockEntity(otherPos,Blocks.BARREL.defaultBlockState()));changed(()->sessions.requireDoubleChestPresent(player,slot,level));
            level.blocks.remove(otherPos);first.setBlockState(block.defaultBlockState());var single=WorldTarget.forBlock(level,first);var singleView=single.snapshot(slot,false).getAsJsonObject("container");
            check(singleView.get("size").getAsInt()==27&&!singleView.has("double"),"single chest unchanged");
            var singlePlan=WorldMergePlan.prepare(single,single.sessionData(),null,edit(0));DoubleChestEdit.write(single,singlePlan,false,()->{});check(first.getItem(0).isEmpty(),"single write unchanged");
        }
        System.out.println("PASS DoubleChestWorldEditTest "+checks+" checks; map-backed Level, vanilla factories/loaders; no server ticks");
    }
    private static JsonObject slot(BlockPos p){var s=JsonParser.parseString("{kind:'block',dim:'minecraft:overworld',token:'double'}").getAsJsonObject();s.addProperty("x",p.getX());s.addProperty("y",p.getY());s.addProperty("z",p.getZ());return s;}
    private static JsonObject edit(int... slots){var request=new JsonObject();var container=new JsonObject();var rows=new JsonArray();for(int index:slots){var row=new JsonObject();row.addProperty("slot",index);row.add("stack",JsonParser.parseString("{empty:true}"));rows.add(row);}container.add("slots",rows);request.add("container",container);return request;}
    private static void changed(Runnable run){try{run.run();throw new AssertionError("expected topology conflict");}catch(WorldMerge.Conflict e){check(e.paths.contains(List.of("container","double")),"clear topology path");}}
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    private static final class ChestLevel extends EntitySchemaTestLevel {
        final Map<BlockPos,BlockEntity> blocks=new HashMap<>();BlockPos failAt;int neighborUpdates;
        private final net.minecraft.world.level.chunk.ChunkSource chunks=new net.minecraft.world.level.chunk.ChunkSource(){
            @Override public boolean hasChunk(int x,int z){return true;}
            @Override public net.minecraft.world.level.chunk.ChunkAccess getChunk(int x,int z,net.minecraft.world.level.chunk.status.ChunkStatus status,boolean load){throw new AssertionError("map-backed chest fixture must not load chunks");}
            @Override public void tick(java.util.function.BooleanSupplier time,boolean tickChunks){throw new AssertionError("map-backed chest fixture must not tick chunks");}
            @Override public String gatherStats(){return "map-backed chest fixture";}
            @Override public int getLoadedChunksCount(){return 0;}
            @Override public net.minecraft.world.level.lighting.LevelLightEngine getLightEngine(){return null;}
            @Override public net.minecraft.world.level.BlockGetter getLevel(){return ChestLevel.this;}
        };
        ChestLevel(RegistryAccess access){super(access);}
        @Override public net.minecraft.world.level.chunk.ChunkSource getChunkSource(){return chunks;}
        ChestBlockEntity put(BlockPos p,BlockState state){var be=(ChestBlockEntity)((EntityBlock)state.getBlock()).newBlockEntity(p,state);blocks.put(p,be);return be;}
        @Override public boolean hasChunkAt(BlockPos p){return true;}
        @Override public BlockEntity getBlockEntity(BlockPos p){return blocks.get(p);}
        @Override public BlockState getBlockState(BlockPos p){var be=blocks.get(p);return be==null?Blocks.AIR.defaultBlockState():be.getBlockState();}
        @Override public void blockEntityChanged(BlockPos p){if(p.equals(failAt)){failAt=null;throw new IllegalStateException("injected second-half write failure");}}
        @Override public void updateNeighborsAt(BlockPos p,Block block,net.minecraft.world.level.redstone.Orientation orientation){neighborUpdates++;}
        @Override public void updateNeighbourForOutputSignal(BlockPos p,Block block){}
        @Override public boolean setBlock(BlockPos p,BlockState state,int flags){blocks.get(p).setBlockState(state);return true;}
    }
}
