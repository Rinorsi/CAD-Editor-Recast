package dev.rinorsi.editor.world;
import com.google.gson.*;
import dev.rinorsi.editor.*;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.block.state.BlockState;
/** Compile normalized edits on an opened copy, merge, then validate on a live copy. */
public record WorldMergePlan(CompoundTag nbt,BlockState blockState,CompoundTag partnerNbt) {
    public WorldMergePlan(CompoundTag nbt,BlockState state){this(nbt,state,null);}
    public static WorldMergePlan prepare(WorldTarget target,CompoundTag base,CompoundTag undo,JsonObject request){
        WorldMerge.requireIdentity(base,target.sessionData());
        return target.partner==null?prepareSingle(target,base,undo,request):DoubleChestEdit.prepare(target,base,undo,request);
    }
    static WorldMergePlan prepareSingle(WorldTarget target,CompoundTag base,CompoundTag undo,JsonObject request){
        var current=target.save();var currentSession=target.singleSessionData();var opened=data(base,target);
        var openedState=state(base,target.blockState());CompoundTag mine;BlockState mineState;
        if(undo!=null){mine=data(undo,target);mineState=state(undo,target.blockState());}
        else {
            var draft=target.draft(opened,openedState);var requested=request.has("snbt")?WorldNbt.parse(StackCodec.string(request,"snbt")):opened.copy();
            WorldNbt.protect(opened,requested,target.entity!=null);
            if(request.has("views")&&draft.block!=null)requested=BlockViews.apply(draft.block,requested,StackCodec.object(request,"views"),request.has("views_snbt")?StackCodec.object(request,"views_snbt"):new com.google.gson.JsonObject(),target.level.registryAccess());
            var canonicalInput=draft.prepare(requested,new JsonObject());
            var canonicalMine=draft.prepare(requested,request);
            // Only the user's SNBT delta plus the explicit normalized-operation delta is mine.
            // A factory/loader adding defaults is not a user edit to an untouched path.
            mine=WorldMerge.projectChanges(canonicalInput,canonicalMine,requested);
            var edits=request.has("block_state")?StackCodec.object(request,"block_state"):new JsonObject();
            mineState=openedState==null?null:BlockStateEdit.prepare(request.has("block_type")?BlockStateEdit.commandType(openedState,StackCodec.string(request,"block_type")):openedState,edits);
        }
        if(target.entity!=null)mine=EntityVolatile.rebase(opened,mine,current,undo!=null);
        mine=BlockVolatile.merge(mine,opened,current);
        var mineSession=target.entity!=null?EntitySessionData.pack(mine,target.entity):BlockSessionData.pack(mine,mineState);
        var merged=WorldMerge.applyEdits(base,mineSession,currentSession);var mergedData=data(merged,target);
        // Slot-key merges retain current ordering; vanilla chest saves in slot order.
        // Normalize that representational difference before the loader-retention check.
        if(target.block instanceof net.minecraft.world.level.block.entity.ChestBlockEntity)
            mergedData.getList("Items").ifPresent(items->items.sort(java.util.Comparator.comparingInt(item->((CompoundTag)item).getByte("Slot").orElse((byte)0)&255)));
        var next=target.prepare(mergedData,new JsonObject());WorldNbt.requireEditedFieldsRetained(current,mergedData,next);
        if (GenericSchema.hasEdits(request)) GenericSchema.requireRetained(mergedData,next);
        var nextState=state(merged,target.blockState());
        if(target.block!=null)nextState=BlockViews.contentState(target.block,current,next,nextState,target.level.registryAccess());
        return new WorldMergePlan(next,nextState);
    }
    private static CompoundTag data(CompoundTag session,WorldTarget target){return target.entity!=null?EntitySessionData.data(session):BlockSessionData.data(session);}
    private static BlockState state(CompoundTag session,BlockState current){
        if(current==null)return null;if(!session.contains("cad_session_state"))return current;
        String id=session.getString("cad_session_block").orElseThrow();String actual=net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(current.getBlock()).toString();
        var start=id.equals(actual)?current:BlockStateEdit.commandType(current,id);
        return BlockStateEdit.prepare(start,BlockStateEdit.json(session.getCompound("cad_session_state").orElseThrow()));
    }
}
