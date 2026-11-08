package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.StackComparison;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.vehicle.ContainerEntity;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.entity.vehicle.minecart.*;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;

/** Missing vehicle views; numeric fields already exposed by EntitySchemaDetails stay there. */
final class EntityViewsVehicle {
    private EntityViewsVehicle() {}
    static boolean supports(String key) { return Set.of("vehicle_container","minecart_display","minecart_command","boat_type").contains(key); }
    static void views(JsonObject out,Entity entity,CompoundTag saved,RegistryAccess access) {
        if(entity instanceof ContainerEntity container) {
            var view=new JsonObject();view.addProperty("size",container.getContainerSize());
            boolean loot=container.getContainerLootTable()!=null;view.addProperty("unresolved_loot",loot);
            var slots=new JsonArray();
            if(!loot)for(int i=0;i<container.getContainerSize();i++) {
                var row=new JsonObject();row.addProperty("slot",i);row.add("stack",EntityWorldEdit.stack(container.getItemStacks().get(i),access));slots.add(row);
            }
            view.add("slots",slots);out.add("vehicle_container",view);
        }
        if(entity instanceof AbstractMinecart cart) {
            var view=new JsonObject();view.addProperty("CustomDisplayTile",saved.contains("DisplayState"));
            view.add("DisplayState",saved.contains("DisplayState")?BlockStateWire.ui(EntityWorldEdit.json(saved.get("DisplayState"))):JsonNull.INSTANCE);
            view.addProperty("DisplayOffset",cart.getDisplayOffset());out.add("minecart_display",view);
        }
        if(entity instanceof MinecartCommandBlock) {
            var view=new JsonObject();view.addProperty("Command",saved.getString("Command").orElse(""));
            view.add("LastOutput",saved.contains("LastOutput")?EntityWorldEdit.component(saved.get("LastOutput"),access):JsonNull.INSTANCE);
            out.add("minecart_command",view);
        }
        if(entity instanceof AbstractBoat) {
            var view=new JsonObject();view.addProperty("readOnly",true);
            view.addProperty("entityType",BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString());
            view.addProperty("reason","Wood and boat/raft kind are determined by entity type");out.add("boat_type",view);
        }
    }
    static void schema(JsonObject out,Entity entity,RegistryAccess access) {
        if(entity instanceof ContainerEntity container) {
            var view=new JsonObject();view.addProperty("write","entity.vehicle_container");view.addProperty("size",container.getContainerSize());
            view.addProperty("shape","{slots:[{slot:int,stack:StackCodec|{empty:true}}]}");view.addProperty("nbtPath","Items");
            view.addProperty("slotMin",0);view.addProperty("slotMax",container.getContainerSize()-1);view.addProperty("stackFormat","StackCodec; live item/component registries");
            view.addProperty("null","rejected; empty:true clears a slot");out.add("vehicle_container",view);
        }
        if(entity instanceof AbstractMinecart cart) {
            var view=new JsonObject();view.addProperty("write","entity.minecart_display");var fields=new JsonObject();
            var state=new JsonObject();state.addProperty("type","BlockState.CODEC");state.addProperty("registry","minecraft:block");state.addProperty("nullable",true);fields.add("DisplayState",state);
            var offset=new JsonObject();offset.addProperty("type","int");offset.addProperty("min",Integer.MIN_VALUE);offset.addProperty("max",Integer.MAX_VALUE);offset.addProperty("default",cart.getDefaultDisplayOffset());offset.addProperty("nullable",true);fields.add("DisplayOffset",offset);
            var custom=new JsonObject();custom.addProperty("type","boolean");custom.addProperty("readOnly",true);custom.addProperty("source","presence of DisplayState; not a saved NBT key");fields.add("CustomDisplayTile",custom);
            view.add("fields",fields);view.addProperty("source","26.1.2 AbstractMinecart save/load; live BlockState.CODEC and StateDefinition");out.add("minecart_display",view);
        }
        if(entity instanceof MinecartCommandBlock) {
            var view=new JsonObject();view.addProperty("write","entity.minecart_command");var fields=new JsonObject();
            var command=new JsonObject();command.addProperty("type","string");command.addProperty("nullable",false);fields.add("Command",command);
            var output=new JsonObject();output.addProperty("type","component or null");output.addProperty("readOnly",true);fields.add("LastOutput",output);
            view.add("fields",fields);view.addProperty("TrackOutput","existing entity_schema extras; actual saved byte boolean");out.add("minecart_command",view);
        }
    }
    static void apply(Entity source,CompoundTag nbt,JsonObject edit,RegistryAccess access) {
        require(!edit.has("boat_type"),"Boat type is read-only");
        if(edit.has("vehicle_container")) {
            require(source instanceof ContainerEntity,"Target has no vehicle inventory");
            var original=(ContainerEntity)source;require(original.getContainerLootTable()==null&&!nbt.contains("LootTable"),"Unresolved loot table; open container in game first");
            var data=edit.getAsJsonObject("vehicle_container");require(data.size()==1&&data.has("slots"),"vehicle_container accepts only slots");
            var copy=source.getType().create(source.level(),EntitySpawnReason.COMMAND);require(copy instanceof ContainerEntity,"Cannot create vehicle inventory copy");
            EntityWorldEdit.load(copy,nbt,access);var target=(ContainerEntity)copy;var seen=new HashSet<Integer>();
            // Read/write backing stacks without unpacking loot or invoking world callbacks.
            var before=target.getItemStacks().stream().map(ItemStack::copy).toList();
            for(var raw:data.getAsJsonArray("slots")) {
                var row=raw.getAsJsonObject();require(row.size()==2&&row.has("slot")&&row.has("stack"),"Slot row accepts only slot and stack");
                var index=row.get("slot");require(index.isJsonPrimitive()&&index.getAsJsonPrimitive().isNumber(),"Slot must be integer");int slot=index.getAsBigDecimal().intValueExact();
                require(slot>=0&&slot<target.getContainerSize()&&seen.add(slot),"Invalid or duplicate vehicle slot");var wire=row.getAsJsonObject("stack");
                ItemStack stack;
                if(wire.has("empty")) {require(wire.size()==1&&wire.get("empty").isJsonPrimitive()&&wire.getAsJsonPrimitive("empty").isBoolean()&&wire.get("empty").getAsBoolean(),"Empty stack requires {empty:true}");stack=ItemStack.EMPTY;}
                else stack=StackCodec.decode(wire,access,before.get(slot));
                require(stack.isEmpty()||target.canPlaceItem(slot,stack)&&stack.getCount()<=target.getMaxStackSize(stack),"Stack violates container limits");
                target.getItemStacks().set(slot,stack);
            }
            var saved=WorldTarget.saveEntity(copy,access);
            var verified=source.getType().create(source.level(),EntitySpawnReason.COMMAND);EntityWorldEdit.load(verified,saved,access);var inventory=(ContainerEntity)verified;
            for(int i=0;i<target.getContainerSize();i++)require(StackComparison.matches(target.getItemStacks().get(i),inventory.getItemStacks().get(i),access),"Vanilla did not retain inventory slot "+i);
            if(saved.contains("Items"))nbt.put("Items",saved.get("Items").copy());else nbt.remove("Items");
        }
        if(edit.has("minecart_display")) {
            require(source instanceof AbstractMinecart,"Target is not a minecart");
            for(var field:edit.getAsJsonObject("minecart_display").entrySet()) {
                String key=field.getKey();var value=field.getValue();require(Set.of("DisplayState","DisplayOffset").contains(key),"Unknown or read-only display field: "+key);
                if(value.isJsonNull()){nbt.remove(key);continue;}
                if(key.equals("DisplayOffset")) {
                    require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber(),"Offset must be integer");int offset=value.getAsBigDecimal().intValueExact();
                    if(offset==((AbstractMinecart)source).getDefaultDisplayOffset())nbt.remove(key);else nbt.putInt(key,offset);
                } else {
                    var wire=value.getAsJsonObject();require(Set.of("Name","Properties").containsAll(wire.keySet()),"Unknown block state field");
                    var state=BlockState.CODEC.parse(access.createSerializationContext(JsonOps.INSTANCE),BlockStateWire.game(wire)).getOrThrow();
                    require(BuiltInRegistries.BLOCK.getKey(state.getBlock()).equals(Identifier.parse(wire.get("Name").getAsString())),"Unknown block ID");
                    if(wire.has("Properties"))BlockStateEdit.prepare(state,wire.getAsJsonObject("Properties"));
                    nbt.put(key,BlockState.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),state).getOrThrow());
                }
            }
        }
        if(edit.has("minecart_command")) {
            require(source instanceof MinecartCommandBlock,"Target is not command block minecart");
            for(var field:edit.getAsJsonObject("minecart_command").entrySet()) {
                require(field.getKey().equals("Command"),"Unknown or read-only command field: "+field.getKey());var value=field.getValue();
                require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isString(),"Command requires string");nbt.putString("Command",value.getAsString());
            }
        }
    }
    static void verify(CompoundTag requested,CompoundTag saved,JsonObject edit) {
        if(edit.has("minecart_display"))for(String key:edit.getAsJsonObject("minecart_display").keySet())
            require(Objects.equals(requested.get(key),saved.get(key)),"Vanilla did not retain display field: "+key);
        if(edit.has("vehicle_container"))require(Objects.equals(requested.get("Items"),saved.get("Items")),"Vanilla did not retain vehicle inventory");
    }
    private static void require(boolean ok,String message) { if(!ok)throw new IllegalArgumentException(message); }
}
