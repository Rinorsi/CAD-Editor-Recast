package dev.rinorsi.editor.world;

import com.google.gson.*;
import dev.rinorsi.editor.StackCodec;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.world.ItemStackWithSlot;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.animal.equine.*;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** Horse relations and storage. Variants and equipment keep their existing schema/edit paths. */
final class EntityViewsHorse {
    private EntityViewsHorse() {}
    static boolean supports(String key) { return key.equals("horse") || key.equals("chested"); }
    static void views(JsonObject out, Entity entity, CompoundTag saved, RegistryAccess access) {
        if (!(entity instanceof AbstractHorse horse)) return;
        var view=new JsonObject();view.addProperty("Tame",horse.isTamed());view.addProperty("Temper",horse.getTemper());
        var owner=horse.getOwnerReference();view.add("Owner",owner==null?JsonNull.INSTANCE:new JsonPrimitive(owner.getUUID().toString()));
        var players=new JsonArray();var server=entity.level().getServer();
        if(server!=null)for(var player:server.getPlayerList().getPlayers()) {
            var row=new JsonObject();row.addProperty("uuid",player.getStringUUID());row.addProperty("name",player.getName().getString());players.add(row);
        }
        view.add("players",players);view.addProperty("available",server!=null);
        // These describe the existing entity.equipment route, not duplicate stack fields.
        view.add("equipment",equipment(horse));out.add("horse",view);
        if(horse instanceof AbstractChestedHorse chest) {
            var storage=new JsonObject();storage.addProperty("ChestedHorse",chest.hasChest());storage.addProperty("capacity",chest.getInventorySize());
            var items=new JsonArray();for(var item:items(saved,access)) {
                var row=new JsonObject();row.addProperty("slot",item.slot());row.add("stack",EntityWorldEdit.stack(item.stack(),access));items.add(row);
            }
            storage.add("Items",items);out.add("chested",storage);
        }
    }
    private static JsonArray equipment(AbstractHorse horse) {
        var rows=new JsonArray();for(var slot:List.of(EquipmentSlot.SADDLE,EquipmentSlot.BODY)) {
            var row=new JsonObject();row.addProperty("slot",slot.getSerializedName());row.addProperty("nbtPath","equipment."+slot.getSerializedName());
            row.addProperty("canHold",horse.canUseSlot(slot));var options=new JsonArray();
            BuiltInRegistries.ITEM.stream().filter(item->horse.isEquippableInSlot(item.getDefaultInstance(),slot)).forEach(item->options.add(BuiltInRegistries.ITEM.getKey(item).toString()));
            row.add("options",options);row.addProperty("allowManual",true);rows.add(row);
        }return rows;
    }
    static void schema(JsonObject out,Entity entity,RegistryAccess access) {
        if(!(entity instanceof AbstractHorse))return;
        var section=new JsonObject();section.addProperty("write","entity.horse");var fields=new JsonObject();
        fields.add("Tame",field("boolean","Tame",false));var temper=field("int","Temper",false);temper.addProperty("min",Integer.MIN_VALUE);temper.addProperty("max",Integer.MAX_VALUE);fields.add("Temper",temper);
        var owner=field("UUID string","Owner",true);owner.addProperty("codec","EntityReference.codec()");owner.addProperty("candidates","world.views.horse.players; live PlayerList; unchanged offline owner allowed");owner.addProperty("null","clear owner; Tame remains independently editable");fields.add("Owner",owner);
        section.add("fields",fields);section.addProperty("equipment","entity.equipment; world.views.horse.equipment provides live canHold/options for saddle/body");out.add("horse",section);
        if(entity instanceof AbstractChestedHorse) {
            var chest=new JsonObject();chest.addProperty("write","entity.chested");var storage=new JsonObject();storage.add("ChestedHorse",field("boolean","ChestedHorse",false));
            var items=field("array of {slot:int,stack:StackCodec}","Items",false);items.addProperty("replacement",true);items.addProperty("slotRange","0 <= slot < detached horse.getInventorySize() after Strength/ChestedHorse load");items.addProperty("codec","ItemStackWithSlot.CODEC");items.addProperty("registry","minecraft:item");storage.add("Items",items);chest.add("fields",storage);out.add("chested",chest);
        }
    }
    private static JsonObject field(String type,String path,boolean nullable) {
        var field=new JsonObject();field.addProperty("type",type);field.addProperty("nbtPath",path);field.addProperty("nullable",nullable);return field;
    }
    static void apply(Entity source,CompoundTag nbt,JsonObject edit,Level level,RegistryAccess access) {
        if(edit.has("horse")) {
            require(source instanceof AbstractHorse,"horse requires AbstractHorse");var data=edit.getAsJsonObject("horse");
            require(Set.of("Tame","Temper","Owner").containsAll(data.keySet()),"Unknown horse field");
            if(data.has("Tame"))nbt.putBoolean("Tame",bool(data.get("Tame")));
            if(data.has("Temper"))nbt.putInt("Temper",integer(data.get("Temper")));
            if(data.has("Owner")) {
                var value=data.get("Owner");
                if(value.isJsonNull())nbt.remove("Owner");
                else {
                    require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isString(),"Owner requires UUID string or null");
                    var id=UUID.fromString(value.getAsString());require(id.toString().equalsIgnoreCase(value.getAsString()),"Owner requires canonical UUID");
                    var current=((AbstractHorse)source).getOwnerReference();var server=level.getServer();
                    require(current!=null&&current.getUUID().equals(id)||server!=null&&server.getPlayerList().getPlayer(id)!=null,"New owner must be an online player");
                    nbt.put("Owner",EntityReference.<LivingEntity>codec().encodeStart(access.createSerializationContext(NbtOps.INSTANCE),EntityReference.of(id)).getOrThrow());
                }
            }
        }
        if(edit.has("chested")) {
            require(source instanceof AbstractChestedHorse,"chested requires AbstractChestedHorse");var data=edit.getAsJsonObject("chested");
            require(Set.of("ChestedHorse","Items").containsAll(data.keySet()),"Unknown chested field");
            if(data.has("ChestedHorse"))nbt.putBoolean("ChestedHorse",bool(data.get("ChestedHorse")));
            if(data.has("Items")) {
                require(data.get("Items").isJsonArray(),"Items requires an array");var prior=new HashMap<Integer,ItemStack>();items(nbt,access).forEach(item->prior.put(item.slot(),item.stack()));
                var rows=new TreeMap<Integer,ItemStackWithSlot>();
                for(var raw:data.getAsJsonArray("Items")) {
                    var row=raw.getAsJsonObject();require(row.keySet().equals(Set.of("slot","stack")),"Items row requires slot and stack only");int slot=integer(row.get("slot"));
                    require(slot>=0&&!rows.containsKey(slot),"Negative or duplicate container slot");
                    var stack=StackCodec.decode(row.getAsJsonObject("stack"),access,prior.getOrDefault(slot,ItemStack.EMPTY));
                    require(!stack.isEmpty(),"Items uses nonempty stacks; omit a slot to clear it");rows.put(slot,new ItemStackWithSlot(slot,stack));
                }
                nbt.put("Items",ItemStackWithSlot.CODEC.listOf().encodeStart(access.createSerializationContext(NbtOps.INSTANCE),new ArrayList<>(rows.values())).getOrThrow());
            }
        }
        if(source instanceof AbstractChestedHorse) {
            // Load the submitted Strength and chest flag before measuring capacity. Never silently
            // discard existing stacks when reducing Strength or removing a nonempty chest.
            var probe=(AbstractChestedHorse)source.getType().create(level,EntitySpawnReason.COMMAND);require(probe!=null,"Horse factory unavailable");EntityWorldEdit.load(probe,nbt,access);
            for(var item:items(nbt,access))require(probe.hasChest()&&item.isValidInContainer(probe.getInventorySize()),"Items slot exceeds current horse inventory capacity");
            if(!probe.hasChest())nbt.remove("Items");
            else if(!nbt.contains("Items"))nbt.put("Items",new ListTag());
        }
    }
    static ItemStack equipment(LivingEntity living,EquipmentSlot slot,ItemStack stack) {
        if(living instanceof AbstractHorse&&!stack.isEmpty())require(living.isEquippableInSlot(stack,slot),"Item is not equippable in horse slot: "+slot.getSerializedName());
        return stack;
    }
    static void verify(Entity source,CompoundTag requested,CompoundTag prepared,RegistryAccess access) {
        if(!(source instanceof AbstractHorse))return;
        var copy=source.getType().create(source.level(),EntitySpawnReason.COMMAND);require(copy!=null,"Horse factory unavailable");EntityWorldEdit.load(copy,prepared,access);
        var saved=WorldTarget.saveEntity(copy,access);
        for(String key:List.of("equipment","Tame","Temper","Owner","ChestedHorse","Items")) {
            require(Objects.equals(prepared.get(key),saved.get(key)),"Vanilla did not retain horse field: "+key);
            if(!key.equals("equipment"))require(Objects.equals(requested.get(key),prepared.get(key)),"Vanilla did not retain requested horse field: "+key);
        }
    }
    private static List<ItemStackWithSlot> items(CompoundTag nbt,RegistryAccess access) {
        return nbt.contains("Items")?ItemStackWithSlot.CODEC.listOf().parse(access.createSerializationContext(NbtOps.INSTANCE),nbt.get("Items")).getOrThrow():List.of();
    }
    private static boolean bool(JsonElement value) {require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isBoolean(),"Field requires boolean");return value.getAsBoolean();}
    private static int integer(JsonElement value) {require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber(),"Field requires integer");return value.getAsBigDecimal().intValueExact();}
    private static void require(boolean ok,String message) {if(!ok)throw new IllegalArgumentException(message);}
}
