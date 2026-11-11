package dev.rinorsi.editor.world;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import java.util.*;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.ChestType;

/** Two independently validated block entities, one container/session transaction. */
public final class DoubleChestEdit {
    static final String PARTNER="cad_chest_partner", TOPOLOGY="cad_chest_topology";
    private DoubleChestEdit() {}
    static void connect(WorldTarget target) {
        if(target.blockPos==null||!(target.blockState().getBlock() instanceof ChestBlock)||target.blockState().getValue(ChestBlock.TYPE)==ChestType.SINGLE)return;
        var pos=target.blockPos.relative(ChestBlock.getConnectedDirection(target.blockState()));
        if(!WorldAccess.isLoaded(target.level,pos))throw changed();
        var other=target.level.getBlockEntity(pos);
        if(!(target.block instanceof ChestBlockEntity)||target.block.isRemoved()||!(other instanceof ChestBlockEntity)||other.isRemoved()||!connected(target.blockPos,target.blockState(),pos,target.level.getBlockState(pos)))throw changed();
        target.partner=target.half(other);
    }
    public static boolean connected(BlockPos pos,BlockState state,BlockPos otherPos,BlockState other) {
        return state.getBlock() instanceof ChestBlock && other.is(state.getBlock())
            && state.getValue(ChestBlock.TYPE)!=ChestType.SINGLE
            && other.getValue(ChestBlock.TYPE)==state.getValue(ChestBlock.TYPE).getOpposite()
            && state.getValue(ChestBlock.FACING)==other.getValue(ChestBlock.FACING)
            && pos.relative(ChestBlock.getConnectedDirection(state)).equals(otherPos)
            && otherPos.relative(ChestBlock.getConnectedDirection(other)).equals(pos);
    }
    public static boolean first(BlockState state) {return ChestBlock.getBlockType(state)==DoubleBlockCombiner.BlockType.FIRST;}
    static WorldMerge.Conflict changed(){return new WorldMerge.Conflict(List.of(List.of("container","double")),"identity");}
    static CompoundTag topology(WorldTarget target) {
        var result=new CompoundTag();result.put("self",identity(target));result.put("partner",identity(target.partner));return result;
    }
    private static CompoundTag identity(WorldTarget target){
        var result=new CompoundTag();result.putInt("x",target.blockPos.getX());result.putInt("y",target.blockPos.getY());result.putInt("z",target.blockPos.getZ());
        result.putString("block",net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(target.blockState().getBlock()).toString());
        result.putString("block_entity",net.minecraft.core.registries.BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(target.block.getType()).toString());
        result.putString("type",target.blockState().getValue(ChestBlock.TYPE).getSerializedName());result.putString("facing",target.blockState().getValue(ChestBlock.FACING).getSerializedName());return result;
    }
    /** Called before normal resolution so removing the clicked half also reports identity loss. */
    static void requirePresent(Level level,CompoundTag baseline){
        if(!baseline.contains(TOPOLOGY))return;
        var topology=baseline.getCompound(TOPOLOGY).orElseThrow();
        var self=topology.getCompound("self").orElseThrow();var pos=new BlockPos(self.getInt("x").orElseThrow(),self.getInt("y").orElseThrow(),self.getInt("z").orElseThrow());
        if(!WorldAccess.isLoaded(level,pos)||!(level.getBlockEntity(pos) instanceof ChestBlockEntity))throw changed();
        var target=WorldTarget.forBlock(level,level.getBlockEntity(pos));
        if(target.partner==null||!topology.equals(topology(target)))throw changed();
    }
    static CompoundTag single(CompoundTag session){var copy=session.copy();copy.remove(PARTNER);copy.remove(TOPOLOGY);return copy;}
    static void addView(JsonObject out,WorldTarget target,CompoundTag captured){
        var access=target.level.registryAccess();
        var a=WorldTarget.copyBlock(target.block,BlockSessionData.data(captured),access);
        var b=WorldTarget.copyBlock(target.partner.block,BlockSessionData.data(captured.getCompound(PARTNER).orElseThrow()),access);
        var container=out.getAsJsonObject("container");var detail=new JsonObject();var pos=new JsonObject();
        pos.addProperty("x",b.getBlockPos().getX());pos.addProperty("y",b.getBlockPos().getY());pos.addProperty("z",b.getBlockPos().getZ());detail.add("partner",pos);detail.addProperty("size",54);detail.addProperty("order","vanilla");container.add("double",detail);container.addProperty("size",54);
        boolean loot=((ChestBlockEntity)a).getLootTable()!=null||((ChestBlockEntity)b).getLootTable()!=null;container.addProperty("unresolved_loot",loot);
        var slots=new JsonArray();var first=first(target.blockState())?a:b;var second=first==a?b:a;
        if(!loot)for(int i=0;i<54;i++){var row=new JsonObject();row.addProperty("slot",i);row.add("stack",WorldTarget.stack(WorldTarget.inventory(i<27?first:second).get(i%27),access));slots.add(row);}container.add("slots",slots);
    }
    static WorldMergePlan prepare(WorldTarget target,CompoundTag base,CompoundTag undo,JsonObject request){
        WorldMerge.requireIdentity(base,target.sessionData());
        var own=request.deepCopy();var other=new JsonObject();
        if(request.has("container")){
            var a=new JsonArray();var b=new JsonArray();var seen=new HashSet<Integer>();
            for(var value:StackCodec.object(request,"container").getAsJsonArray("slots")){
                var row=value.getAsJsonObject().deepCopy();int slot=StackCodec.integer(row,"slot",0,53);
                if(!seen.add(slot))EditorSessions.fail("invalid_request","容器槽位重复");
                row.addProperty("slot",slot%27);((slot<27)==first(target.blockState())?a:b).add(row);
            }
            var ca=new JsonObject();ca.add("slots",a);own.add("container",ca);var cb=new JsonObject();cb.add("slots",b);other.add("container",cb);
        }
        var primary=WorldMergePlan.prepareSingle(target,single(base),undo==null?null:single(undo),own);
        WorldMergePlan secondary;
        try{secondary=WorldMergePlan.prepareSingle(target.partner,base.getCompound(PARTNER).orElseThrow(),undo==null?null:undo.getCompound(PARTNER).orElseThrow(),other);}
        catch(WorldMerge.Conflict conflict){var paths=new ArrayList<List<String>>();for(var path:conflict.paths){var p=new ArrayList<String>();p.add("container");p.add("double");p.add("partner");p.addAll(path);paths.add(p);}throw new WorldMerge.Conflict(paths,conflict.stale);}
        if(!connected(target.blockPos,primary.blockState(),target.partner.blockPos,secondary.blockState())||first(primary.blockState())!=first(target.blockState()))throw changed();
        if(secondary.nbt().toString().length()>WorldNbt.MAX_SNBT)EditorSessions.fail("payload_too_large","另一半箱子 NBT 超出上限");
        return new WorldMergePlan(primary.nbt(),primary.blockState(),secondary.nbt());
    }
    public static JsonObject preview(WorldTarget target,WorldMergePlan plan,JsonObject slot,boolean undo){
        var result=target.preview(plan.nbt(),slot,undo,plan.blockState());
        if(target.partner!=null){var captured=BlockSessionData.pack(plan.nbt(),plan.blockState());captured.put(PARTNER,BlockSessionData.pack(plan.partnerNbt(),target.partner.blockState()));addView(result,target,captured);}return result;
    }
    /** Caller includes response construction in this transaction via afterWrite. */
    public static void write(WorldTarget target,WorldMergePlan plan,boolean neighbors,Runnable afterWrite){
        var beforeSession=target.sessionData();
        var before=target.save();var state=target.blockState();var partnerBefore=target.partner==null?null:target.partner.save();var partnerState=target.partner==null?null:target.partner.blockState();
        if(target.partner!=null)requirePresent(target.level,beforeSession);
        try{
            // Load both halves before publishing neighbor notifications.
            target.write(plan.nbt(),plan.blockState(),target.partner==null&&neighbors);
            if(target.partner!=null){
                target.partner.write(plan.partnerNbt(),partnerState,false);
                requirePresent(target.level,beforeSession);
                if(neighbors){
                    notify(target);notify(target.partner);
                    if(!state.equals(plan.blockState()))target.level.updateNeighborsAt(target.blockPos,plan.blockState().getBlock(),null);
                }
                requirePresent(target.level,beforeSession);
            }
            afterWrite.run();
        }catch(RuntimeException failure){
            try{target.write(before,state,false);}catch(RuntimeException rollback){failure.addSuppressed(rollback);}
            if(target.partner!=null)try{target.partner.write(partnerBefore,partnerState,false);}catch(RuntimeException rollback){failure.addSuppressed(rollback);}
            if(failure.getSuppressed().length>0)org.slf4j.LoggerFactory.getLogger("WorldEditor").error("World edit rollback failed target={}",target.blockPos,failure);
            throw failure;
        }
    }
    private static void notify(WorldTarget half){half.block.setChanged();half.level.updateNeighbourForOutputSignal(half.blockPos,half.blockState().getBlock());}
}
