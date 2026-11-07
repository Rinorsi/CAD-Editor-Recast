package dev.rinorsi.editor.registry;
import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
import net.minecraft.nbt.*;
import net.minecraft.core.*;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.*;
import net.minecraft.world.level.storage.ValueOutput;
/** Real NBT types and fake mod extension state; no volatile catalog is required. */
public final class WorldMergeTest {
    private static int checks;
    public static void main(String[] args)throws Exception{
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        for(String id:List.of("minecraft:mob_spawner","minecraft:trial_spawner","example:unknown_machine")){
            var base=tag("{id:'"+id+"',Delay:20,unknown_timer:100,nested:{progress:0,foo:2},CustomName:'base'}");var mine=base.copy();mine.putString("CustomName","mine");var current=base.copy();current.putInt("Delay",19);current.putInt("unknown_timer",101);current.getCompound("nested").orElseThrow().putInt("progress",1);
            var merged=WorldMerge.merge(base,mine,current);check(merged.getInt("unknown_timer").orElseThrow()==101&&merged.getInt("Delay").orElseThrow()==19,"all timers keep live values "+id);check(merged.getString("CustomName").orElseThrow().equals("mine"),"independent name accepted "+id);
            var after=merged.copy();after.getCompound("nested").orElseThrow().putInt("foo",9);var undo=WorldMerge.merge(merged,current,after);check(undo.getString("CustomName").orElseThrow().equals("base")&&undo.getCompound("nested").orElseThrow().getInt("foo").orElseThrow()==9,"undo touches only changed name "+id);
            current.putString("CustomName","other");conflict(base,mine,current,List.of("CustomName"));current.putString("CustomName","mine");check(WorldMerge.merge(base,mine,current).equals(current),"same edit accepted");
        }
        var base=tag("{id:'minecraft:chest',Items:[{Slot:0b,id:'minecraft:stone',count:1},{Slot:1b,id:'minecraft:stone',count:2}]}");var mine=base.copy();mine.getList("Items").orElseThrow().getCompound(0).orElseThrow().putInt("count",3);var current=base.copy();current.getList("Items").orElseThrow().getCompound(1).orElseThrow().putInt("count",7);var merged=WorldMerge.merge(base,mine,current);check(merged.getList("Items").orElseThrow().getCompound(0).orElseThrow().getInt("count").orElseThrow()==3&&merged.getList("Items").orElseThrow().getCompound(1).orElseThrow().getInt("count").orElseThrow()==7,"different slots merge even with duplicate item ids");
        current.getList("Items").orElseThrow().getCompound(0).orElseThrow().putInt("count",8);var error=conflict(base,mine,current,null);check(error.paths.getFirst().getLast().equals("count")&&error.paths.getFirst().get(1).startsWith("[Slot="),"slot conflict path");
        list("active_effects","[{id:'minecraft:speed',amplifier:0},{id:'minecraft:strength',amplifier:0}]","[{id:'minecraft:speed',amplifier:1},{id:'minecraft:strength',amplifier:0}]","[{id:'minecraft:strength',amplifier:2},{id:'minecraft:speed',amplifier:0}]",2);
        list("Passengers","[{UUID:[I;1,2,3,4],Health:20},{UUID:[I;5,6,7,8],Health:20}]","[{UUID:[I;1,2,3,4],Health:10},{UUID:[I;5,6,7,8],Health:20}]","[{UUID:[I;1,2,3,4],Health:20},{UUID:[I;5,6,7,8],Health:15}]",2);
        list("bees","[{entity_data:{UUID:[I;1,2,3,4]},ticks_in_hive:1},{entity_data:{UUID:[I;5,6,7,8]},ticks_in_hive:1}]","[{entity_data:{UUID:[I;1,2,3,4]},ticks_in_hive:2},{entity_data:{UUID:[I;5,6,7,8]},ticks_in_hive:1}]","[{entity_data:{UUID:[I;1,2,3,4]},ticks_in_hive:1},{entity_data:{UUID:[I;5,6,7,8]},ticks_in_hive:3}]",2);
        var unknown=tag("{list:[{x:1},{x:2}]}");var a=tag("{list:[{x:3},{x:2}]}");var b=tag("{list:[{x:1},{x:4}]}");conflict(unknown,a,b,List.of("list"));
        var deleted=tag("{obj:{x:1,y:2},empty:[]}");var removal=deleted.copy();removal.getCompound("obj").orElseThrow().remove("x");var changed=deleted.copy();changed.getCompound("obj").orElseThrow().putInt("y",3);check(!WorldMerge.merge(deleted,removal,changed).getCompound("obj").orElseThrow().contains("x"),"deletion merges with unrelated change");changed.getCompound("obj").orElseThrow().putInt("x",4);conflict(deleted,removal,changed,List.of("obj","x"));
        var e=tag("{id:'minecraft:zombie',UUID:[I;1,2,3,4],Pos:[0d,64d,0d],Health:20f,Brain:{memories:{}},CustomName:'old'}");var name=e.copy();name.putString("CustomName","new");var moving=e.copy();moving.put("Pos",tag("{v:[2d,64d,0d]}").get("v"));moving.putFloat("Health",9);moving.getCompound("Brain").orElseThrow().putLong("unknown_memory",20);var result=WorldMerge.merge(e,name,moving);check(result.getFloat("Health").orElseThrow()==9&&result.get("Pos").equals(moving.get("Pos"))&&result.get("Brain").equals(moving.get("Brain")),"walking brain changes and damage do not stop name edit");name.putFloat("Health",15);conflict(e,name,moving,List.of("Health"));moving.putString("id","minecraft:pig");conflict(e,e,moving,List.of("id"));moving=e.copy();moving.put("UUID",tag("{v:[I;9,2,3,4]}").get("v"));conflict(e,e,moving,List.of("UUID"));
        var many=new CompoundTag();var ours=new CompoundTag();var theirs=new CompoundTag();for(int i=0;i<50;i++){many.putInt("k"+i,0);ours.putInt("k"+i,1);theirs.putInt("k"+i,2);}var capped=conflict(many,ours,theirs,null);check(capped.json().size()==20&&capped.json().get(0).getAsJsonObject().get("path").isJsonArray(),"at most 20 path arrays");
        var p=tag("{id:'minecraft:player',UUID:'player'}");var pv=JsonParser.parseString("{abilities:{flying:false,mayfly:true},container:{slots:[{slot:0,stack:{empty:true}},{slot:1,stack:{empty:true}}]},CustomName:null}").getAsJsonObject();var pm=pv.deepCopy();pm.getAsJsonObject("abilities").addProperty("flying",true);var pc=pv.deepCopy();pc.add("CustomName",JsonParser.parseString("{text:'live'}"));var playerMerged=WorldMerge.merge(PlayerWorldEdit.with(p,pv),PlayerWorldEdit.with(p,pm),PlayerWorldEdit.with(p,pc));check(PlayerWorldEdit.data(playerMerged).getAsJsonObject("abilities").get("flying").getAsBoolean()&&PlayerWorldEdit.data(playerMerged).get("CustomName").isJsonObject(),"player JSON keeps booleans and null types");
        var effectsBase=tag("{UUID:[I;1,2,3,4],Pos:[0d,0d,0d],active_effects:[{id:'minecraft:speed',duration:100,amplifier:0},{id:'minecraft:strength',duration:50,amplifier:0}]}");
        var effectsMine=effectsBase.copy();effectsMine.getList("active_effects").orElseThrow().getCompound(0).orElseThrow().putInt("amplifier",1);
        var effectsLive=tag("{UUID:[I;1,2,3,4],Pos:[0d,0d,0d],active_effects:[{id:'minecraft:strength',duration:49,amplifier:0},{id:'minecraft:speed',duration:99,amplifier:0}]}");
        var effects=WorldMerge.merge(effectsBase,EntityVolatile.rebase(effectsBase,effectsMine,effectsLive,false),effectsLive).getList("active_effects").orElseThrow();
        check(effects.getCompound(1).orElseThrow().getInt("duration").orElseThrow()==99&&effects.getCompound(1).orElseThrow().getInt("amplifier").orElseThrow()==1,"effect countdown finds current id after reordering");
        var blockBase=tag("{cad_session_block:'minecraft:chest',cad_session_nbt:{id:'minecraft:chest'},cad_session_state:{facing:'north'}}");var blockCurrent=blockBase.copy();blockCurrent.putString("cad_session_block","minecraft:trapped_chest");conflict(blockBase,blockBase,blockCurrent,List.of("block"));
        var huge=tag("{entries:[{UUID:9007199254740992L,v:1},{UUID:9007199254740993L,v:1}]}");var hugeMine=huge.copy();hugeMine.getList("entries").orElseThrow().getCompound(0).orElseThrow().putInt("v",2);var hugeLive=huge.copy();hugeLive.getList("entries").orElseThrow().getCompound(1).orElseThrow().putInt("v",3);check(WorldMerge.merge(huge,hugeMine,hugeLive).getList("entries").orElseThrow().size()==2,"large integral stable keys never lose precision");
        var access=EntitySchemaTest.access();var fake=new UnknownMachine();fake.counter=10;var fb=fake.saveWithFullMetadata(access);var fm=fb.copy();fm.putInt("setting",2);fake.counter=11;var fc=fake.saveWithFullMetadata(access);check(WorldMerge.merge(fb,fm,fc).getInt("new_mod_tick_counter").orElseThrow()==11,"actual fake BE unknown saved timer needs no whitelist");
        var raw=tag("{timer:1,setting:0,legacy:9}");var canonical=tag("{timer:2,setting:0,defaulted:1}");var normalized=canonical.copy();normalized.putInt("setting",3);var intent=WorldMerge.projectChanges(canonical,normalized,raw);check(intent.getInt("timer").orElseThrow()==1&&intent.contains("legacy")&&!intent.contains("defaulted")&&intent.getInt("setting").orElseThrow()==3,"incidental loader normalization is never user intent");
        conflict(tag("{lines:['a','b']}"),tag("{lines:['c','b']}"),tag("{lines:['a','d']}"),List.of("lines"));
        check(WorldMerge.merge(tag("{Tags:['a']}"),tag("{Tags:['a','b']}"),tag("{Tags:['a','c']}")).getList("Tags").orElseThrow().size()==3,"known tag set additions merge");
        var modBlock=tag("{cad_session_block:'example:machine',cad_session_nbt:{id:'example:machine',UUID:'old-binding',setting:1}}");var modMine=modBlock.copy();modMine.getCompound("cad_session_nbt").orElseThrow().putInt("setting",2);var modLive=modBlock.copy();modLive.getCompound("cad_session_nbt").orElseThrow().putString("UUID","new-binding");check(WorldMerge.merge(modBlock,modMine,modLive).getCompound("cad_session_nbt").orElseThrow().getString("UUID").orElseThrow().equals("new-binding"),"BE-specific UUID is ordinary data, not entity identity");
        System.out.println("PASS WorldMergeTest "+checks+" checks");
    }
    private static void list(String key,String base,String mine,String current,int size){var merged=WorldMerge.merge(tag("{"+key+":"+base+"}"),tag("{"+key+":"+mine+"}"),tag("{"+key+":"+current+"}"));check(merged.getList(key).orElseThrow().size()==size,"stable list "+key);}
    private static CompoundTag tag(String s){return WorldNbt.parse(s);}
    private static WorldMerge.Conflict conflict(CompoundTag base,CompoundTag mine,CompoundTag current,List<String> path){try{WorldMerge.merge(base,mine,current);throw new AssertionError("expected conflict");}catch(WorldMerge.Conflict e){check(path==null||e.paths.contains(path),"exact path "+path+" got "+e.paths);return e;}}
    private static void check(boolean b,String s){if(!b)throw new AssertionError(s);checks++;}
    private static final class UnknownMachine extends BlockEntity {
        int counter;
        UnknownMachine(){super(BlockEntityType.CHEST,BlockPos.ZERO,Blocks.CHEST.defaultBlockState());}
        @Override protected void saveAdditional(ValueOutput out){super.saveAdditional(out);out.putInt("new_mod_tick_counter",counter);out.putInt("setting",1);}
    }
}
