package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.vehicle.ContainerEntity;
import net.minecraft.world.entity.vehicle.minecart.AbstractMinecart;

/** Real detached factories and codecs; never starts or ticks a game server. */
public final class EntityVehicleViewTest {
    private static RegistryAccess access;
    private static EntitySchemaTestLevel level;
    private static int checks;
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        access=EntitySchemaTest.access();level=new EntitySchemaTestLevel(access);
        for(var type:List.of(EntityType.CHEST_MINECART,EntityType.HOPPER_MINECART,EntityType.OAK_CHEST_BOAT,EntityType.BAMBOO_CHEST_RAFT))container(type);
        for(var type:List.of(EntityType.MINECART,EntityType.FURNACE_MINECART,EntityType.TNT_MINECART,EntityType.SPAWNER_MINECART,EntityType.COMMAND_BLOCK_MINECART)) {
            var entity=create(type);var before=save(entity);var view=views(entity).getAsJsonObject("minecart_display");
            check(!view.get("CustomDisplayTile").getAsBoolean()&&view.get("DisplayState").isJsonNull(),"default custom state absent");
            var prepared=edit(entity,"{minecart_display:{DisplayState:{Name:'minecraft:oak_log',Properties:{axis:'x'}},DisplayOffset:12}}");
            check(prepared.getInt("DisplayOffset").orElseThrow()==12,"offset retained");EntityWorldEdit.load(entity,prepared,access);
            check(views(entity).getAsJsonObject("minecart_display").get("CustomDisplayTile").getAsBoolean(),"derived display flag");
            var clear=edit(entity,"{minecart_display:{DisplayState:null,DisplayOffset:null}}");check(!clear.contains("DisplayState")&&!clear.contains("DisplayOffset"),"display cleared to vanilla defaults");
            check(!edit(entity,"{minecart_display:{DisplayOffset:"+((AbstractMinecart)entity).getDefaultDisplayOffset()+"}}").contains("DisplayOffset"),"explicit default offset canonicalized");
            for(String bad:List.of("{CustomDisplayTile:true}","{DisplayOffset:2147483648}","{DisplayOffset:1.5}","{DisplayState:{Name:'missing:block'}}","{DisplayState:{Name:'minecraft:oak_log',Properties:{axis:'bad'}}}","{DisplayState:{Name:'minecraft:stone',Properties:{bad:'x'}}}","{unknown:null}"))reject(()->edit(entity,"{minecart_display:"+bad+"}"));
        }
        for(var type:List.of(EntityType.OAK_BOAT,EntityType.OAK_CHEST_BOAT,EntityType.BAMBOO_RAFT,EntityType.BAMBOO_CHEST_RAFT)) {
            var entity=create(type);check(views(entity).getAsJsonObject("boat_type").get("readOnly").getAsBoolean(),"boat kind readonly");reject(()->edit(entity,"{boat_type:{}}"));
        }
        var command=create(EntityType.COMMAND_BLOCK_MINECART);var saved=edit(command,"{minecart_command:{Command:'say vehicle-test'}}");check(saved.getString("Command").orElseThrow().equals("say vehicle-test"),"command retained without executing");
        EntityWorldEdit.load(command,saved,access);check(views(command).getAsJsonObject("minecart_command").get("Command").getAsString().equals("say vehicle-test"),"command read");
        for(String bad:List.of("{LastOutput:null}","{Command:null}","{Command:1}","{unknown:0}"))reject(()->edit(command,"{minecart_command:"+bad+"}"));
        var zombie=create(EntityType.ZOMBIE);for(String section:List.of("vehicle_container","minecart_display","minecart_command","zombie_conversion","boat_type"))reject(()->edit(zombie,"{"+section+":{}}"));
        var converted=create(EntityType.ZOMBIE_VILLAGER);check(views(converted).getAsJsonObject("zombie_conversion").get("readOnly").getAsBoolean(),"conversion readonly");reject(()->edit(converted,"{zombie_conversion:{ConversionTime:100}}"));
        // Existing schema owns these fields: prevent duplicate UI and prove the current 26.1.2 paths.
        covered(EntityType.FURNACE_MINECART,"Fuel","PushX","PushZ");covered(EntityType.TNT_MINECART,"fuse");
        covered(EntityType.SPAWNER_MINECART,"Delay","MinSpawnDelay","MaxSpawnDelay","SpawnCount","MaxNearbyEntities","RequiredPlayerRange","SpawnRange");
        covered(EntityType.COMMAND_BLOCK_MINECART,"TrackOutput");covered(EntityType.VILLAGER,"Xp");covered(EntityType.ZOMBIE_VILLAGER,"Xp","ConversionTime");
        raw(create(EntityType.FURNACE_MINECART),"{Fuel:120s,PushX:1.5d,PushZ:-0.5d}");
        raw(create(EntityType.TNT_MINECART),"{fuse:120}");
        raw(create(EntityType.SPAWNER_MINECART),"{Delay:40s,SpawnCount:2s}");
        raw(create(EntityType.COMMAND_BLOCK_MINECART),"{TrackOutput:0b}");
        reject(()->raw(create(EntityType.FURNACE_MINECART),"{Fuel:32768}"));
        reject(()->raw(create(EntityType.TNT_MINECART),"{TNTFuse:100}"));
        for(var type:List.of(EntityType.VILLAGER,EntityType.ZOMBIE_VILLAGER)) {
            raw(create(type),"{Xp:25}");
            var schema=EntitySchema.describe(type,level,access);var variants=schema.getAsJsonArray("variants");
            for(String id:List.of("villager/profession","villager/level","minecraft:villager/variant")) {
                var variant=variants.asList().stream().map(JsonElement::getAsJsonObject).filter(v->v.get("id").getAsString().equals(id)).findFirst().orElseThrow(()->new AssertionError("Missing live villager variant "+id));
                check(!variant.getAsJsonArray("options").isEmpty(),"live villager options "+id);
                var entity=create(type);var base=save(entity);var candidate=base.copy();var path=variant.getAsJsonObject("nbt").getAsJsonArray("path").asList().stream().map(JsonElement::getAsString).toList();
                var option=variant.getAsJsonArray("options").get(0).getAsJsonObject();EntitySchema.put(candidate,path,WorldNbt.parse("{value:"+option.get("snbt").getAsString()+"}").get("value"));
                WorldNbt.requireEditedFieldsRetained(base,candidate,WorldTarget.copyEntity(entity,candidate,level,access));checks++;
            }
        }
        System.out.println("PASS EntityVehicleViewTest "+checks+" checks; detached factories, no server/client started");
    }
    private static void raw(Entity entity,String snbt) {
        var base=save(entity);var candidate=base.copy();candidate.merge(WorldNbt.parse(snbt));
        WorldNbt.requireEditedFieldsRetained(base,candidate,WorldTarget.copyEntity(entity,candidate,level,access));checks++;
    }
    private static void covered(EntityType<?> type,String... keys) {
        var schema=EntitySchema.describe(type,level,access);
        for(String key:keys)check(schema.getAsJsonArray("extras").asList().stream().anyMatch(v->v.getAsJsonObject().has("key")&&v.getAsJsonObject().get("key").getAsString().equals(key)),"generic schema covers "+type+"/"+key);
    }
    private static void container(EntityType<?> type) {
        var entity=create(type);var before=save(entity);int size=((ContainerEntity)entity).getContainerSize();var view=views(entity).getAsJsonObject("vehicle_container");
        check(view.get("size").getAsInt()==size&&view.getAsJsonArray("slots").size()==size,"actual capacity");
        var saved=edit(entity,"{vehicle_container:{slots:[{slot:"+(size-1)+",stack:{id:'minecraft:diamond',count:2,comps:{custom_name:{text:'Cargo'}},removed:{}}}]}}");
        check(save(entity).equals(before),"validation leaves original inventory untouched");EntityWorldEdit.load(entity,saved,access);
        var stack=((ContainerEntity)entity).getItemStacks().get(size-1);check(stack.getCount()==2&&stack.getHoverName().getString().equals("Cargo"),"last slot full stack retained");
        var cleared=edit(entity,"{vehicle_container:{slots:[{slot:"+(size-1)+",stack:{empty:true}}]}}");EntityWorldEdit.load(entity,cleared,access);check(((ContainerEntity)entity).getItemStacks().get(size-1).isEmpty(),"empty sentinel clears");
        for(String slots:List.of("[{slot:"+size+",stack:{empty:true}}]","[{slot:-1,stack:{empty:true}}]","[{slot:0.5,stack:{empty:true}}]","[{slot:0,stack:null}]","[{slot:0,stack:{empty:true}},{slot:0,stack:{empty:true}}]","[{slot:0,stack:{id:'missing:item',count:1}}]","[{slot:0,stack:{id:'minecraft:diamond',count:65,comps:{},removed:{}}}]","null"))reject(()->edit(entity,"{vehicle_container:{slots:"+slots+"}}"));
        reject(()->edit(entity,"{vehicle_container:{Items:[]}}"));
        ((ContainerEntity)entity).setContainerLootTable(net.minecraft.resources.ResourceKey.create(net.minecraft.core.registries.Registries.LOOT_TABLE,net.minecraft.resources.Identifier.parse("minecraft:chests/simple_dungeon")));
        check(views(entity).getAsJsonObject("vehicle_container").get("unresolved_loot").getAsBoolean(),"loot inspection does not unpack");reject(()->edit(entity,"{vehicle_container:{slots:[]}}"));
    }
    private static Entity create(EntityType<?> type) { return EntitySchema.create(type,level); }
    private static CompoundTag save(Entity e) { return WorldTarget.saveEntity(e,access); }
    private static JsonObject views(Entity e) { return EntityWorldEdit.views(e,save(e),access); }
    private static CompoundTag edit(Entity e,String json) { return EntityWorldEdit.prepare(e,save(e),JsonParser.parseString(json).getAsJsonObject(),level,access); }
    private static void check(boolean ok,String message) { if(!ok)throw new AssertionError(message);checks++; }
    private static void reject(Runnable action) { try{action.run();}catch(RuntimeException expected){checks++;return;}throw new AssertionError("Expected rejection"); }
}
