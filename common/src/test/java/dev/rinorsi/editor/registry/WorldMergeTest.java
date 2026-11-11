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
        beeTimerMerges();
        effectDurationMerges();
        System.out.println("PASS WorldMergeTest "+checks+" checks");
    }
    private static void beeTimerMerges(){
        var base=tag("{id:'minecraft:beehive',bees:[{entity_data:{id:'minecraft:bee',Health:20f,custom:{s:2s,l:9007199254740993L,a:[L;9223372036854775807L]}},ticks_in_hive:9,min_ticks_in_hive:600}]}");
        var live=base.copy();bee(live,0).putInt("ticks_in_hive",30);
        for(boolean health:new boolean[]{false,true}){
            var mine=base.copy();if(health)bee(mine,0).getCompound("entity_data").orElseThrow().putFloat("Health",10);else bee(mine,0).putInt("min_ticks_in_hive",1200);
            var prepared=BlockVolatile.merge(mine,base,live);
            var result=WorldMerge.merge(base,prepared,live);
            check(bee(result,0).getInt("ticks_in_hive").orElseThrow()==30,"untouched bee tick inherits current");
            check(health?bee(result,0).getCompound("entity_data").orElseThrow().getFloat("Health").orElseThrow()==10:bee(result,0).getInt("min_ticks_in_hive").orElseThrow()==1200,"normal UUID-less bee edit merges");
            check(bee(result,0).getCompound("entity_data").orElseThrow().get("custom").equals(bee(base,0).getCompound("entity_data").orElseThrow().get("custom")),"bee nested types and long preserved");
            var wrapped=WorldMerge.merge(BlockSessionData.pack(base,Blocks.BEEHIVE.defaultBlockState()),BlockSessionData.pack(prepared,Blocks.BEEHIVE.defaultBlockState()),BlockSessionData.pack(live,Blocks.BEEHIVE.defaultBlockState()));
            check(BlockSessionData.data(wrapped).equals(result),"real block-session wrapper uses same merge");
            var later=result.copy();bee(later,0).putInt("ticks_in_hive",35);
            var undo=WorldMerge.merge(result,live,later);
            check(bee(undo,0).getInt("ticks_in_hive").orElseThrow()==35&&bee(undo,0).getInt("min_ticks_in_hive").orElseThrow()==600&&bee(undo,0).getCompound("entity_data").orElseThrow().getFloat("Health").orElseThrow()==20,"undo restores edited field without rewinding timer");
        }
        var mine=base.copy();bee(mine,0).putInt("min_ticks_in_hive",1200);
        var other=live.copy();bee(other,0).putInt("min_ticks_in_hive",900);conflict(base,mine,other,List.of("bees"));
        var gone=live.copy();gone.put("bees",new ListTag());conflict(base,mine,gone,List.of("bees"));
        var replaced=live.copy();bee(replaced,0).getCompound("entity_data").orElseThrow().putFloat("Health",19);conflict(base,mine,replaced,List.of("bees"));
        var timerEdit=base.copy();bee(timerEdit,0).putInt("ticks_in_hive",41);conflict(base,timerEdit,live,List.of("bees"));
        var modBase=base.copy();modBase.putString("id","example:machine");var modMine=mine.copy();modMine.putString("id","example:machine");var modLive=live.copy();modLive.putString("id","example:machine");conflict(modBase,modMine,modLive,List.of("bees"));
        var two=base.copy();var second=bee(base,0).copy();second.getCompound("entity_data").orElseThrow().putString("CustomName","other");two.getList("bees").orElseThrow().add(second);
        var twoMine=two.copy();bee(twoMine,0).putInt("min_ticks_in_hive",1200);var reordered=two.copy();Collections.reverse(reordered.getList("bees").orElseThrow());conflict(two,twoMine,reordered,List.of("bees"));
        check(bee(base,0).getInt("ticks_in_hive").orElseThrow()==9&&bee(live,0).getInt("ticks_in_hive").orElseThrow()==30,"merge does not mutate original baseline/current");
    }
    private static CompoundTag bee(CompoundTag data,int index){return data.getList("bees").orElseThrow().getCompound(index).orElseThrow();}
    private static CompoundTag effect(CompoundTag data){return data.getList("active_effects").orElseThrow().getCompound(0).orElseThrow();}
    private static void effectDurationMerges(){
        var base=tag("{id:'minecraft:slime',UUID:[I;1,2,3,4],Pos:[0d,64d,0d],active_effects:[{id:'minecraft:speed',amplifier:2b,duration:451,show_icon:1b,extra:{v:9007199254740993L}}]}");
        var mine=base.copy();effect(mine).putInt("duration",2400);var live=base.copy();effect(live).putInt("duration",430);
        var result=WorldMerge.merge(base,EntityVolatile.rebase(base,mine,live,false),live);
        check(effect(result).getInt("duration").orElseThrow()==2400,"real duration451 to120s survives natural countdown430");
        check(effect(result).get("extra").equals(effect(base).get("extra")),"unknown typed fields survive duration edit");
        var wrappedBase=new CompoundTag();wrappedBase.put("cad_entity_nbt",base);var wrappedMine=new CompoundTag();wrappedMine.put("cad_entity_nbt",mine);var wrappedLive=new CompoundTag();wrappedLive.put("cad_entity_nbt",live);
        check(effect(WorldMerge.merge(wrappedBase,wrappedMine,wrappedLive).getCompound("cad_entity_nbt").orElseThrow()).getInt("duration").orElseThrow()==2400,"entity session wrapper rebases countdown");
        var untouched=base.copy();untouched.putString("CustomName","renamed");check(effect(WorldMerge.merge(base,untouched,live)).getInt("duration").orElseThrow()==430,"untouched duration never rewinds");
        var remove=base.copy();remove.put("active_effects",new ListTag());check(WorldMerge.merge(base,remove,live).getList("active_effects").orElseThrow().isEmpty(),"remove ticking effect without reopening");
        var removeKey=base.copy();removeKey.remove("active_effects");
        check(!WorldMerge.merge(base,removeKey,live).contains("active_effects"),"production last-effect delete removes key during countdown without manufacturing an empty list");
        check(!WorldMerge.merge(base,EntityVolatile.rebase(base,removeKey,live,false),live).contains("active_effects"),"last-effect deletion survives actual volatile preprocessing");
        var wrappedDelete=new CompoundTag();wrappedDelete.put("cad_entity_nbt",removeKey);
        check(!WorldMerge.merge(wrappedBase,wrappedDelete,wrappedLive).getCompound("cad_entity_nbt").orElseThrow().contains("active_effects"),"wrapped entity last-effect deletion");
        for(int ticks:new int[]{452,-1,0}){var changed=live.copy();effect(changed).putInt("duration",ticks);conflict(base,removeKey,changed,null);}
        for(String field:List.of("amplifier","show_icon","extension")){var changed=live.copy();effect(changed).putInt(field,9);conflict(base,removeKey,changed,null);}
        var newlyAdded=live.copy();newlyAdded.getList("active_effects").orElseThrow().add(tag("{id:'minecraft:strength',duration:200}"));conflict(base,removeKey,newlyAdded,null);
        var duplicateDelete=live.copy();duplicateDelete.getList("active_effects").orElseThrow().add(effect(live).copy());conflict(base,removeKey,duplicateDelete,null);
        var malformedDelete=base.copy();malformedDelete.putString("active_effects","not a list");conflict(base,malformedDelete,live,null);
        var reorderedBase=base.copy();reorderedBase.getList("active_effects").orElseThrow().add(tag("{id:'minecraft:strength',duration:200}"));
        var reorderedLive=live.copy();var reordered=new ListTag();reordered.add(tag("{id:'minecraft:strength',duration:180}"));reordered.add(effect(live).copy());reorderedLive.put("active_effects",reordered);
        check(!WorldMerge.merge(reorderedBase,removeKey,reorderedLive).contains("active_effects"),"remove whole effect set tolerates countdown and ID reordering only");
        check(!removeKey.contains("active_effects")&&effect(base).getInt("duration").orElseThrow()==451,"key-removal merge preserves request absence and original baseline");
        var infinite=mine.copy();effect(infinite).putInt("duration",-1);check(effect(WorldMerge.merge(base,infinite,live)).getInt("duration").orElseThrow()==-1,"explicit infinite duration survives finite countdown");
        for(int ticks:new int[]{452,-1,0}){var changed=live.copy();effect(changed).putInt("duration",ticks);conflict(base,mine,changed,null);}
        for(String field:List.of("amplifier","show_icon","extension")){var changed=live.copy();effect(changed).putInt(field,9);conflict(base,mine,changed,null);}
        var gone=live.copy();gone.put("active_effects",new ListTag());conflict(base,mine,gone,null);
        var replacement=live.copy();effect(replacement).putString("id","minecraft:strength");conflict(base,mine,replacement,null);
        var duplicate=live.copy();duplicate.getList("active_effects").orElseThrow().add(effect(live).copy());conflict(base,mine,duplicate,null);
        var mistyped=live.copy();effect(mistyped).putFloat("duration",430);conflict(base,mine,mistyped,null);
        var hiddenBase=base.copy();effect(hiddenBase).put("hidden_effect",tag("{id:'minecraft:speed',amplifier:0b,duration:700}"));
        var hiddenMine=hiddenBase.copy();effect(hiddenMine).putInt("duration",2400);var hiddenLive=hiddenBase.copy();effect(hiddenLive).putInt("duration",430);effect(hiddenLive).getCompound("hidden_effect").orElseThrow().putInt("duration",679);
        var hidden=WorldMerge.merge(hiddenBase,hiddenMine,hiddenLive);check(effect(hidden).getInt("duration").orElseThrow()==2400&&effect(hidden).getCompound("hidden_effect").orElseThrow().getInt("duration").orElseThrow()==679,"hidden countdown preserved alongside explicit main duration");
        check(!WorldMerge.merge(hiddenBase,removeKey,hiddenLive).contains("active_effects"),"last-effect delete includes hidden countdown");
        effect(hiddenMine).getCompound("hidden_effect").orElseThrow().putInt("duration",900);check(effect(WorldMerge.merge(hiddenBase,hiddenMine,hiddenLive)).getCompound("hidden_effect").orElseThrow().getInt("duration").orElseThrow()==900,"explicit hidden duration survives countdown");
        effect(hiddenLive).getCompound("hidden_effect").orElseThrow().putByte("amplifier",(byte)1);conflict(hiddenBase,hiddenMine,hiddenLive,null);
        conflict(hiddenBase,removeKey,hiddenLive,null);
        var blockBase=base.copy();blockBase.remove("Pos");blockBase.putString("id","example:machine");var blockMine=blockBase.copy();effect(blockMine).putInt("duration",2400);var blockLive=blockBase.copy();effect(blockLive).putInt("duration",430);conflict(blockBase,blockMine,blockLive,null);
        var nestedBase=tag("{id:'minecraft:slime',UUID:[I;1,2,3,4],Pos:[0d,64d,0d],custom:{active_effects:[{id:'minecraft:speed',duration:451}]}}");var nestedMine=nestedBase.copy();effect(nestedMine.getCompound("custom").orElseThrow()).putInt("duration",2400);var nestedLive=nestedBase.copy();effect(nestedLive.getCompound("custom").orElseThrow()).putInt("duration",430);conflict(nestedBase,nestedMine,nestedLive,null);
        var player=tag("{id:'minecraft:player',UUID:[I;1,2,3,4],Pos:[0d,64d,0d]}");var pb=JsonParser.parseString("{active_effects:[{id:'minecraft:speed',duration:451,amplifier:2}]} ").getAsJsonObject();var pm=pb.deepCopy();pm.getAsJsonArray("active_effects").get(0).getAsJsonObject().addProperty("duration",2400);var pc=pb.deepCopy();pc.getAsJsonArray("active_effects").get(0).getAsJsonObject().addProperty("duration",430);
        var pr=PlayerWorldEdit.data(WorldMerge.merge(PlayerWorldEdit.with(player,pb),PlayerWorldEdit.with(player,pm),PlayerWorldEdit.with(player,pc)));check(pr.getAsJsonArray("active_effects").get(0).getAsJsonObject().get("duration").getAsInt()==2400,"player JSON uses same countdown semantics");
        var playerDelete=pb.deepCopy();playerDelete.remove("active_effects");
        check(!PlayerWorldEdit.data(WorldMerge.merge(PlayerWorldEdit.with(player,pb),PlayerWorldEdit.with(player,playerDelete),PlayerWorldEdit.with(player,pc))).has("active_effects"),"player JSON absent key deletes last ticking effect");
        var playerNull=pb.deepCopy();playerNull.add("active_effects",com.google.gson.JsonNull.INSTANCE);conflict(PlayerWorldEdit.with(player,pb),PlayerWorldEdit.with(player,playerNull),PlayerWorldEdit.with(player,pc),null);
        pc.getAsJsonArray("active_effects").get(0).getAsJsonObject().addProperty("amplifier",4);conflict(PlayerWorldEdit.with(player,pb),PlayerWorldEdit.with(player,pm),PlayerWorldEdit.with(player,pc),null);
        conflict(PlayerWorldEdit.with(player,pb),PlayerWorldEdit.with(player,playerDelete),PlayerWorldEdit.with(player,pc),null);
        check(effect(base).getInt("duration").orElseThrow()==451&&effect(mine).getInt("duration").orElseThrow()==2400&&effect(live).getInt("duration").orElseThrow()==430,"effect merge inputs unchanged");
    }
    private static void list(String key,String base,String mine,String current,int size){var merged=WorldMerge.merge(tag("{"+key+":"+base+"}"),tag("{"+key+":"+mine+"}"),tag("{"+key+":"+current+"}"));check(merged.getList(key).orElseThrow().size()==size,"stable list "+key);}
    private static CompoundTag tag(String s){return WorldNbt.parse(s);}
    private static WorldMerge.Conflict conflict(CompoundTag base,CompoundTag mine,CompoundTag current,List<String> path){try{WorldMerge.merge(base,mine,current);throw new AssertionError("expected conflict");}catch(WorldMerge.Conflict e){check(path==null||e.paths.contains(path),"exact path "+path+" got "+e.paths);return e;}}
    private static void check(boolean b,String s){if(!b)throw new AssertionError(s);checks++;}
    private static final class UnknownMachine extends BlockEntity {
        int counter;
        UnknownMachine(){super(BlockEntityTypes.CHEST,BlockPos.ZERO,Blocks.CHEST.defaultBlockState());}
        @Override protected void saveAdditional(ValueOutput out){super.saveAdditional(out);out.putInt("new_mod_tick_counter",counter);out.putInt("setting",1);}
    }
}
