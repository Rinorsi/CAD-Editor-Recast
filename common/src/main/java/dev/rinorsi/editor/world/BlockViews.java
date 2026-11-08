package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.*;
import dev.rinorsi.editor.EditorSessions;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.*;
import net.minecraft.world.item.ItemStack;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.state.properties.StructureMode;
import net.minecraft.world.level.block.entity.vault.VaultBlockEntity;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.block.entity.*;

/** Normalized fields use vanilla codecs, then the existing detached loadWithComponents gate. */
public final class BlockViews {
    private BlockViews() {}
    private static final Codec<Boolean> CRAFTER_TRIGGERED = Codec.BOOL;
    private record Field(String key, Codec<?> codec, boolean component) {}
    private static Map<String,List<Field>> fields(BlockEntity block) {
        var groups = new LinkedHashMap<String,List<Field>>();
        if (block instanceof net.minecraft.world.Nameable) groups.put("nameable",List.of(f("CustomName",net.minecraft.network.chat.ComponentSerialization.CODEC)));
        if (block instanceof SignBlockEntity) groups.put("sign", List.of(f("front_text",SignText.CODEC), f("back_text",SignText.CODEC), f("is_waxed",Codec.BOOL)));
        if (block instanceof BannerBlockEntity) groups.put("banner",List.of(f("patterns",BannerPatternLayers.CODEC)));
        if (block instanceof BeehiveBlockEntity) groups.put("beehive",List.of(f("bees",BeehiveBlockEntity.Occupant.LIST_CODEC)));
        if (block instanceof LecternBlockEntity) groups.put("lectern",List.of(f("Book",ItemStack.CODEC),f("Page",Codec.INT)));
        if (block instanceof JukeboxBlockEntity) groups.put("jukebox",List.of(f("RecordItem",ItemStack.CODEC)));
        if (block instanceof DecoratedPotBlockEntity) groups.put("decorated_pot",List.of(f("sherds",PotDecorations.CODEC)));
        if (block instanceof ChiseledBookShelfBlockEntity) groups.put("chiseled_bookshelf",List.of(f("last_interacted_slot",Codec.INT)));
        if (block instanceof CommandBlockEntity) groups.put("command_block",List.of(f("Command",Codec.STRING),f("TrackOutput",Codec.BOOL),f("auto",Codec.BOOL),f("powered",Codec.BOOL)));
        // 26.3 furnace timers persist as ints, replacing shorts.
        //? if <26.3 {
        /*if (block instanceof AbstractFurnaceBlockEntity) groups.put("furnace",List.of(f("cooking_time_spent",Codec.SHORT),f("cooking_total_time",Codec.SHORT),f("lit_time_remaining",Codec.SHORT),f("lit_total_time",Codec.SHORT)));
        *///?} else {
        if (block instanceof AbstractFurnaceBlockEntity) groups.put("furnace",List.of(f("cooking_time_spent",Codec.INT),f("cooking_total_time",Codec.INT),f("lit_time_remaining",Codec.INT),f("lit_total_time",Codec.INT)));
        //?}
        if (block instanceof CrafterBlockEntity) groups.put("crafter",List.of(f("disabled_slots",Codec.INT_STREAM),f("triggered",CRAFTER_TRIGGERED)));
        if (block instanceof BeaconBlockEntity) groups.put("beacon",List.of(f("primary_effect",net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec()),f("secondary_effect",net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec()),f("Levels",Codec.INT)));
        if (block instanceof HopperBlockEntity) groups.put("hopper",List.of(f("TransferCooldown",Codec.INT)));
        // 26.3 brewing timers/fuel persist as ints instead of short/byte.
        //? if <26.3 {
        /*if (block instanceof BrewingStandBlockEntity) groups.put("brewing_stand",List.of(f("BrewTime",Codec.SHORT),f("Fuel",Codec.BYTE)));
        *///?} else {
        if (block instanceof BrewingStandBlockEntity) groups.put("brewing_stand",List.of(f("BrewTime",Codec.INT),f("Fuel",Codec.INT)));
        //?}
        if (block instanceof CampfireBlockEntity) groups.put("campfire",List.of(f("CookingTimes",Codec.INT_STREAM),f("CookingTotalTimes",Codec.INT_STREAM)));
        if (block instanceof SkullBlockEntity) groups.put("skull",List.of(new Field("minecraft:profile",DataComponents.PROFILE.codec(),true),new Field("minecraft:custom_name",DataComponents.CUSTOM_NAME.codec(),true)));
        if (block instanceof TheEndGatewayBlockEntity) groups.put("end_gateway",List.of(f("exit_portal",BlockPos.CODEC),f("ExactTeleport",Codec.BOOL),f("Age",Codec.LONG)));
        if (block instanceof StructureBlockEntity) groups.put("structure_block",List.of(f("name",Codec.STRING),f("author",Codec.STRING),f("metadata",Codec.STRING),f("posX",Codec.INT),f("posY",Codec.INT),f("posZ",Codec.INT),f("sizeX",Codec.INT),f("sizeY",Codec.INT),f("sizeZ",Codec.INT),f("rotation",Rotation.LEGACY_CODEC),f("mirror",Mirror.LEGACY_CODEC),f("mode",StructureMode.LEGACY_CODEC),f("ignoreEntities",Codec.BOOL),f("powered",Codec.BOOL),f("showair",Codec.BOOL),f("showboundingbox",Codec.BOOL),f("integrity",Codec.FLOAT),f("seed",Codec.LONG)));
        if (block instanceof JigsawBlockEntity) groups.put("jigsaw",List.of(f("name",Identifier.CODEC),f("target",Identifier.CODEC),f("pool",JigsawBlockEntity.POOL_CODEC),f("final_state",Codec.STRING),f("joint",JigsawBlockEntity.JointType.CODEC)));
        if (block instanceof SculkSensorBlockEntity) groups.put("sculk_sensor",List.of(f("last_vibration_frequency",Codec.INT),f("listener.event_delay",net.minecraft.util.ExtraCodecs.NON_NEGATIVE_INT)));
        if (block instanceof SculkShriekerBlockEntity) groups.put("sculk_shrieker",List.of(f("warning_level",Codec.INT),f("listener.event_delay",net.minecraft.util.ExtraCodecs.NON_NEGATIVE_INT)));
        if (block instanceof VaultBlockEntity) groups.put("vault",List.of(f("config.key_item",ItemStack.CODEC),f("config.loot_table",LootTable.KEY_CODEC),f("config.activation_range",Codec.DOUBLE),f("config.deactivation_range",Codec.DOUBLE),f("server_data.rewarded_players",net.minecraft.core.UUIDUtil.CODEC_LINKED_SET)));
        return groups;
    }
    private static boolean nullable(Field field) { return field.component || field.codec == ItemStack.CODEC || field.key.equals("exit_portal") || field.key.equals("CustomName") || field.key.equals("primary_effect") || field.key.equals("secondary_effect"); }
    private static Field f(String key,Codec<?> codec) { return new Field(key,codec,false); }
    private static void requireInteger(JsonElement value,long min,long max) {
        try {
            if(!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber())throw new IllegalArgumentException();
            var number=value.getAsBigDecimal();
            if(number.compareTo(java.math.BigDecimal.valueOf(min))<0 || number.compareTo(java.math.BigDecimal.valueOf(max))>0 || number.stripTrailingZeros().scale()>0)throw new IllegalArgumentException();
        } catch(RuntimeException e) {throw new EditorSessions.Failure("invalid_nbt","字段必须为 "+min+" 至 "+max+" 的整数");}
    }
    private static void requireSignSide(JsonElement value,RegistryAccess access) {
        if(!value.isJsonObject())throw new EditorSessions.Failure("invalid_nbt","标牌每面必须是对象");
        for(var entry:value.getAsJsonObject().entrySet()) {
            if(!Set.of("messages","filtered_messages","color","has_glowing_text").contains(entry.getKey()))throw new EditorSessions.Failure("invalid_nbt","未知标牌字段："+entry.getKey());
            if(entry.getKey().equals("has_glowing_text") && (!entry.getValue().isJsonPrimitive() || !entry.getValue().getAsJsonPrimitive().isBoolean()))throw new EditorSessions.Failure("invalid_nbt","has_glowing_text 必须为布尔");
            if(entry.getKey().equals("messages") || entry.getKey().equals("filtered_messages")) {
                if(!entry.getValue().isJsonArray() || entry.getValue().getAsJsonArray().size()!=SignText.LINES)throw new EditorSessions.Failure("invalid_nbt","标牌必须恰好有 "+SignText.LINES+" 行");
                for(var line:entry.getValue().getAsJsonArray())encode(net.minecraft.network.chat.ComponentSerialization.CODEC,line,access);
            }
        }
    }
    private static void requireColors(JsonElement json) {
        if(json.isJsonArray()) {json.getAsJsonArray().forEach(BlockViews::requireColors);return;}
        if(!json.isJsonObject())return;
        for(var entry:json.getAsJsonObject().entrySet()) {
            if(entry.getKey().equals("color")) {
                if(!entry.getValue().isJsonPrimitive() || java.util.Arrays.stream(net.minecraft.world.item.DyeColor.values()).noneMatch(c -> c.getName().equals(entry.getValue().getAsString())))
                    throw new EditorSessions.Failure("invalid_nbt","颜色不在原版 DyeColor 枚举中："+entry.getValue());
            } else if(!entry.getKey().equals("messages") && !entry.getKey().equals("filtered_messages")) requireColors(entry.getValue());
        }
    }
    // Skull's implicit components save to profile/custom_name, as proven by its vanilla saveAdditional.
    private static Tag get(CompoundTag nbt,Field field) {
        if(field.key.contains(".")) {var path=field.key.split("\\.",2);return nbt.getCompound(path[0]).map(parent->parent.get(path[1])).orElse(null);}
        if(field.key.equals("triggered"))return ByteTag.valueOf(nbt.getInt("triggered").orElse(CrafterBlockEntity.SLOT_ENABLED)==CrafterBlockEntity.SLOT_DISABLED);
        return nbt.get(field.component ? field.key.substring(10) : field.key);
    }
    private static void put(CompoundTag nbt,Field field,Tag tag) {
        if(field.key.contains(".")) {var path=field.key.split("\\.",2);var parent=nbt.getCompound(path[0]).orElseGet(CompoundTag::new);if(tag==null)parent.remove(path[1]);else parent.put(path[1],tag);nbt.put(path[0],parent);return;}
        String key=field.component ? field.key.substring(10) : field.key;
        if(field.key.equals("triggered") && tag instanceof ByteTag value) {nbt.putInt(key,value.byteValue()!=0 ? CrafterBlockEntity.SLOT_DISABLED : CrafterBlockEntity.SLOT_ENABLED);return;}
        if (tag == null) nbt.remove(key); else nbt.put(key,tag);
    }
    private static Tag effectiveTag(BlockEntity block,CompoundTag nbt,Field field,RegistryAccess access) {
        var tag=get(nbt,field);
        if(tag!=null || !(block instanceof VaultBlockEntity vault))return tag;
        var config=vault.getConfig();
        return switch(field.key) {
            case "config.key_item" -> config.keyItem().isEmpty() ? null : ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),config.keyItem()).getOrThrow();
            case "config.loot_table" -> LootTable.KEY_CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),config.lootTable()).getOrThrow();
            case "config.activation_range" -> DoubleTag.valueOf(config.activationRange());
            case "config.deactivation_range" -> DoubleTag.valueOf(config.deactivationRange());
            case "server_data.rewarded_players" -> new ListTag();
            default -> null;
        };
    }
    private static <T> Tag encode(Codec<T> codec,JsonElement json,RegistryAccess access) {
        var value = codec.parse(access.createSerializationContext(JsonOps.INSTANCE),json).getOrThrow(s -> new EditorSessions.Failure("invalid_nbt",s));
        return codec.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),value).getOrThrow(s -> new EditorSessions.Failure("invalid_nbt",s));
    }
    private static <T> JsonElement decode(Codec<T> codec,Tag tag,RegistryAccess access) {
        var value = codec.parse(access.createSerializationContext(NbtOps.INSTANCE),tag).getOrThrow();
        return codec.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow();
    }
    public static void add(JsonObject views,BlockEntity block,RegistryAccess access,CompoundTag nbt) {
        fields(block).forEach((group,fields) -> {
            var value = new JsonObject(); var subset = new CompoundTag(); var properties = new JsonObject();
            for (var field : fields) {
                Tag tag = effectiveTag(block,nbt,field,access);
                // Include real runtime defaults even if vanilla omits them from a sparse save.
                if (tag == null && block instanceof BannerBlockEntity b && field.key.equals("patterns")) tag = encode(field.codec, BannerPatternLayers.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),b.getPatterns()).getOrThrow(),access);
                if (tag == null && block instanceof DecoratedPotBlockEntity p && field.key.equals("sherds")) tag = encode(field.codec,PotDecorations.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),p.getDecorations()).getOrThrow(),access);
                if (tag == null && field.key.equals("ExactTeleport")) tag=ByteTag.valueOf(false);
                value.add(field.key,tag == null ? JsonNull.INSTANCE : decode(field.codec,tag,access));
                if(tag != null) subset.put(field.key,field.key.equals("triggered") && nbt.get(field.key)!=null ? nbt.get(field.key).copy() : tag.copy());
                var schema = new JsonObject(); schema.addProperty("authority","vanilla_codec_and_loadWithComponents"); schema.addProperty("codec",field.codec.toString()); schema.addProperty("nullable",nullable(field));
                if(field.codec==Codec.BOOL)schema.addProperty("type","boolean");
                if(field.codec==Codec.STRING)schema.addProperty("type","string");
                if(field.codec==Codec.INT)schema.addProperty("type","integer");
                if(field.codec==Codec.DOUBLE) {schema.addProperty("type","number");schema.addProperty("min",-Double.MAX_VALUE);schema.addProperty("max",Double.MAX_VALUE);schema.addProperty("constraint","config.activation_range <= config.deactivation_range; VaultConfig codec");}
                if(block instanceof VaultBlockEntity) {
                    if(field.key.equals("server_data.rewarded_players"))schema.addProperty("read_only",true);
                    if(field.key.equals("config.loot_table")) {
                        net.minecraft.core.HolderLookup.Provider lookup=block.getLevel() instanceof net.minecraft.server.level.ServerLevel level ? level.getServer().reloadableRegistries().lookup() : access;
                        var registry=lookup.lookup(net.minecraft.core.registries.Registries.LOOT_TABLE);var values=new JsonArray();registry.ifPresent(tables->tables.listElementIds().map(key->key.identifier().toString()).sorted().forEach(values::add));
                        schema.add("candidates",values);schema.addProperty("candidates_available",registry.isPresent());schema.addProperty("candidate_source","server reloadable LOOT_TABLE registry when available; resource keys may reference absent tables");
                    }
                    if(field.key.equals("config.key_item"))schema.addProperty("candidate_source","ItemStack.CODEC + runtime ITEM registry; same item picker as other stack fields");
                }
                if(field.key.contains("."))schema.addProperty("saved_path",field.key);
                if(field.codec==net.minecraft.util.ExtraCodecs.NON_NEGATIVE_INT) {schema.addProperty("type","integer");schema.addProperty("min",0);schema.addProperty("max",Integer.MAX_VALUE);}
                if(field.component) schema.addProperty("saved_path",field.key.substring(10));
                if(field.codec == BeehiveBlockEntity.Occupant.LIST_CODEC) schema.addProperty("vanilla_max_occupants",BeehiveBlockEntity.MAX_OCCUPANTS);
                if(field.codec == Codec.SHORT) {schema.addProperty("min",Short.MIN_VALUE);schema.addProperty("max",Short.MAX_VALUE);schema.addProperty("bounds","NBT short storage; vanilla loader validates semantics");}
                if(field.codec == Codec.BYTE) {schema.addProperty("min",Byte.MIN_VALUE);schema.addProperty("max",Byte.MAX_VALUE);}
                if(field.codec == Codec.INT) {schema.addProperty("min",Integer.MIN_VALUE);schema.addProperty("max",Integer.MAX_VALUE);}
                if(block instanceof ChiseledBookShelfBlockEntity && field.key.equals("last_interacted_slot")) {schema.addProperty("min",-1);schema.addProperty("max",WorldTarget.inventory(block).size()-1);schema.addProperty("bounds","runtime container slots or vanilla no-interaction sentinel");}
                if(field.codec == Codec.INT_STREAM && tag instanceof IntArrayTag array) schema.addProperty("length",array.getAsIntArray().length);
                if(field.codec == SignText.CODEC) { schema.addProperty("messages_length",SignText.LINES); var colors = new JsonArray(); for(var color:net.minecraft.world.item.DyeColor.values()) colors.add(color.getName());schema.add("colors",colors); }
                if(block instanceof BeaconBlockEntity) {
                    if(field.key.equals("Levels")) {schema.addProperty("read_only",true);schema.addProperty("source","vanilla pyramid calculation");}
                    else if(field.key.equals("primary_effect") || field.key.equals("secondary_effect")) {var candidates=new JsonArray();BeaconBlockEntity.BEACON_EFFECTS.stream().flatMap(List::stream).distinct().forEach(effect->candidates.add(net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec().encodeStart(access.createSerializationContext(JsonOps.INSTANCE),effect).getOrThrow()));schema.add("candidates",candidates);schema.addProperty("candidate_source","BeaconBlockEntity.BEACON_EFFECTS + MOB_EFFECT registry");}
                }
                if(block instanceof CrafterBlockEntity crafter) {
                    if(field.key.equals("disabled_slots")) {schema.remove("length");schema.addProperty("type","array");schema.addProperty("item_min",0);schema.addProperty("item_max",crafter.getContainerSize()-1);schema.addProperty("unique_items",true);schema.addProperty("empty_slots_only",true);}
                    if(field.key.equals("triggered")) {schema.addProperty("type","boolean");schema.addProperty("saved_type","int");}
                }
                if(field.codec == Codec.LONG) {schema.addProperty("type","integer");schema.addProperty("min",Long.MIN_VALUE);schema.addProperty("max",Long.MAX_VALUE);schema.addProperty("precision","JSON integer; use lossless JSON for values beyond 2^53");}
                if(field.codec == Codec.FLOAT) {schema.addProperty("type","number");schema.addProperty("min",-Float.MAX_VALUE);schema.addProperty("max",Float.MAX_VALUE);}
                if(block instanceof StructureBlockEntity && (field.key.startsWith("pos") || field.key.startsWith("size"))) {schema.addProperty("min",field.key.startsWith("pos") ? -StructureBlockEntity.MAX_OFFSET_PER_AXIS : 0);schema.addProperty("max",field.key.startsWith("pos") ? StructureBlockEntity.MAX_OFFSET_PER_AXIS : StructureBlockEntity.MAX_SIZE_PER_AXIS);}
                if(field.codec==Rotation.LEGACY_CODEC) candidates(schema,Rotation.LEGACY_CODEC,Rotation.values(),access);
                if(field.codec==Mirror.LEGACY_CODEC) candidates(schema,Mirror.LEGACY_CODEC,Mirror.values(),access);
                if(field.codec==StructureMode.LEGACY_CODEC) candidates(schema,StructureMode.LEGACY_CODEC,StructureMode.values(),access);
                if(field.codec==JigsawBlockEntity.JointType.CODEC) candidates(schema,JigsawBlockEntity.JointType.CODEC,JigsawBlockEntity.JointType.values(),access);
                if(field.codec==BlockPos.CODEC) {schema.addProperty("type","array");schema.addProperty("length",3);schema.addProperty("bounds","BlockPos.CODEC + Level.isInSpawnableBounds; vanilla loader retention");}
                properties.add(field.key,schema);
            }
            var schema = new JsonObject();schema.add("fields",properties);
            if(block instanceof BannerBlockEntity banner) schema.addProperty("base_color",banner.getBaseColor().getName());
            if(block instanceof ChiseledBookShelfBlockEntity) schema.addProperty("items_write_path","container.slots");
            var row = new JsonObject();row.add("value",value);row.addProperty("snbt",subset.toString());row.add("schema",schema);views.add(group,row);
        });
        if(block instanceof SculkCatalystBlockEntity) {
            var value=new JsonObject();var cursors=nbt.get("cursors");value.add("cursors",cursors==null ? new JsonArray() : decode(net.minecraft.world.level.block.SculkSpreader.ChargeCursor.CODEC.listOf(),cursors,access));
            readOnly(views,"sculk_catalyst",value,"SculkSpreader.ChargeCursor.CODEC; live spread cursors",nbt);
        }
        if(block instanceof BellBlockEntity bell) {
            var value=new JsonObject();value.addProperty("ticks",bell.ticks);value.addProperty("shaking",bell.shaking);
            readOnly(views,"bell",value,"Runtime only; vanilla BellBlockEntity has no saved timer fields",nbt);
        }
        if(block instanceof ConduitBlockEntity conduit) {
            var value=new JsonObject();var target=nbt.get("Target");value.add("Target",target==null ? JsonNull.INSTANCE : NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE,target));
            value.addProperty("Active",conduit.isActive());value.addProperty("Hunting",conduit.isHunting());
            readOnly(views,"conduit",value,"Target is saved entity reference; Active/Hunting are live runtime state",nbt);
        }
    }
    private static void readOnly(JsonObject views,String group,JsonObject value,String source,CompoundTag nbt) {
        var properties=new JsonObject();for(var entry:value.entrySet()) {var field=new JsonObject();field.addProperty("read_only",true);field.addProperty("nullable",entry.getValue().isJsonNull());field.addProperty("source",source);properties.add(entry.getKey(),field);}
        var schema=new JsonObject();schema.add("fields",properties);var row=new JsonObject();row.add("value",value);row.add("schema",schema);row.addProperty("snbt",nbt.toString());views.add(group,row);
    }
    private static <T> void candidates(JsonObject schema,Codec<T> codec,T[] values,RegistryAccess access) {
        var candidates=new JsonArray();for(var value:values)candidates.add(codec.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow());
        schema.add("candidates",candidates);schema.addProperty("candidate_source","runtime vanilla enum + saving codec");
    }
    public static CompoundTag apply(BlockEntity block,CompoundTag nbt,JsonObject edits,RegistryAccess access) {
        var result = nbt.copy();var groups=fields(block);
        for(var group:edits.entrySet()) {
            var allowed=groups.get(group.getKey());
            if(allowed==null || !group.getValue().isJsonObject()) throw new EditorSessions.Failure("invalid_request","目标不支持字段视图："+group.getKey());
            for(var entry:group.getValue().getAsJsonObject().entrySet()) {
                var field=allowed.stream().filter(f->f.key.equals(entry.getKey())).findFirst().orElseThrow(()->new EditorSessions.Failure("invalid_request","未知视图字段："+entry.getKey()));
                var json=entry.getValue();
                if(block instanceof VaultBlockEntity && field.key.equals("server_data.rewarded_players"))throw new EditorSessions.Failure("invalid_request","已奖励玩家列表只读");
                if(block instanceof BeaconBlockEntity && field.key.equals("Levels"))throw new EditorSessions.Failure("invalid_request","信标等级由金字塔计算，只读");
                if(block instanceof BeaconBlockEntity && (field.key.equals("primary_effect") || field.key.equals("secondary_effect")) && !json.isJsonNull()) {
                    var effect=net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec().parse(access.createSerializationContext(JsonOps.INSTANCE),json).getOrThrow(s->new EditorSessions.Failure("invalid_nbt",s));
                    if(BeaconBlockEntity.BEACON_EFFECTS.stream().flatMap(List::stream).noneMatch(effect::equals))throw new EditorSessions.Failure("invalid_nbt","不是原版信标允许的效果");
                }
                if(json.isJsonNull()) {
                    if(nullable(field)) {put(result,field,null);continue;}
                    throw new EditorSessions.Failure("invalid_nbt","此字段不允许清空："+field.key);
                }
                // Sign sides accept a partial object; unedited lines/filtered messages remain intact.
                if(field.codec==SignText.CODEC)requireSignSide(json,access);
                if(field.codec==Codec.DOUBLE && (!json.isJsonPrimitive() || !json.getAsJsonPrimitive().isNumber() || !Double.isFinite(json.getAsDouble())))throw new EditorSessions.Failure("invalid_nbt","必须为有限 double");
                if(field.codec==net.minecraft.util.ExtraCodecs.NON_NEGATIVE_INT)requireInteger(json,0,Integer.MAX_VALUE);
                if(field.codec==Codec.LONG)requireInteger(json,Long.MIN_VALUE,Long.MAX_VALUE);
                if(field.codec==Codec.FLOAT && (!json.isJsonPrimitive() || !json.getAsJsonPrimitive().isNumber() || !Float.isFinite(json.getAsFloat())))throw new EditorSessions.Failure("invalid_nbt","必须为有限 float");
                if(field.codec==Codec.STRING && (!json.isJsonPrimitive() || !json.getAsJsonPrimitive().isString()))throw new EditorSessions.Failure("invalid_nbt","必须为字符串");
                if(field.codec==BlockPos.CODEC) {if(!json.isJsonArray() || json.getAsJsonArray().size()!=3)throw new EditorSessions.Failure("invalid_nbt","坐标必须为三个整数");for(var coordinate:json.getAsJsonArray())requireInteger(coordinate,Integer.MIN_VALUE,Integer.MAX_VALUE);}
                if(block instanceof StructureBlockEntity && (field.key.startsWith("pos") || field.key.startsWith("size")))requireInteger(json,field.key.startsWith("pos") ? -StructureBlockEntity.MAX_OFFSET_PER_AXIS : 0,field.key.startsWith("pos") ? StructureBlockEntity.MAX_OFFSET_PER_AXIS : StructureBlockEntity.MAX_SIZE_PER_AXIS);
                if(field.codec==Codec.SHORT)requireInteger(json,Short.MIN_VALUE,Short.MAX_VALUE);
                if(field.codec==Codec.BYTE)requireInteger(json,Byte.MIN_VALUE,Byte.MAX_VALUE);
                if(field.codec==Codec.INT)requireInteger(json,Integer.MIN_VALUE,Integer.MAX_VALUE);
                if(block instanceof ChiseledBookShelfBlockEntity && field.key.equals("last_interacted_slot"))requireInteger(json,-1,WorldTarget.inventory(block).size()-1);
                if((field.codec==Codec.BOOL || field.codec==CRAFTER_TRIGGERED) && (!json.isJsonPrimitive() || !json.getAsJsonPrimitive().isBoolean()))throw new EditorSessions.Failure("invalid_nbt","布尔字段不能使用字符串或数字");
                if(block instanceof CrafterBlockEntity && field.key.equals("disabled_slots")) {
                    if(!json.isJsonArray())throw new EditorSessions.Failure("invalid_nbt","禁用槽位必须为数组");
                    var crafter=(CrafterBlockEntity)WorldTarget.copyBlock(block,result,access);var slots=new TreeSet<Integer>();
                    for(var slot:json.getAsJsonArray()) {
                        requireInteger(slot,0,crafter.getContainerSize()-1);int index=slot.getAsInt();
                        if(!slots.add(index) || !crafter.getItem(index).isEmpty())throw new EditorSessions.Failure("invalid_nbt","禁用槽位必须唯一且为空");
                    }
                    var sorted=new JsonArray();slots.forEach(sorted::add);json=sorted;
                }
                if(field.codec==Codec.INT_STREAM && !(block instanceof CrafterBlockEntity)) {
                    var original=get(result,field);
                    if(!json.isJsonArray() || (original instanceof IntArrayTag array && array.getAsIntArray().length!=json.getAsJsonArray().size()))throw new EditorSessions.Failure("invalid_nbt","进度数组长度必须与实际营火一致");
                    for(var element:json.getAsJsonArray())requireInteger(element,Integer.MIN_VALUE,Integer.MAX_VALUE);
                }
                if(field.codec==SignText.CODEC && json.isJsonObject() && get(result,field)!=null) {
                    var merged=decode(field.codec,get(result,field),access).getAsJsonObject();json.getAsJsonObject().entrySet().forEach(e->merged.add(e.getKey(),e.getValue()));json=merged;
                }
                if(field.codec==SignText.CODEC || field.codec==BannerPatternLayers.CODEC)requireColors(json);
                var encoded=encode(field.codec,json,access);
                // Vanilla omits default banner layers/pot decorations rather than saving empty fields.
                if(field.codec==BannerPatternLayers.CODEC && encoded instanceof ListTag list && list.isEmpty()) encoded=null;
                if(field.codec==PotDecorations.CODEC && PotDecorations.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),encoded).getOrThrow().equals(PotDecorations.EMPTY))encoded=null;
                if(block instanceof TheEndGatewayBlockEntity && field.key.equals("ExactTeleport") && !json.getAsBoolean())encoded=null;
                put(result,field,encoded);
            }
        }
        if(block instanceof JukeboxBlockEntity && !Objects.equals(nbt.get("RecordItem"),result.get("RecordItem")))result.remove(JukeboxBlockEntity.TICKS_SINCE_SONG_STARTED_TAG_ID);
        requireUnwaxed(block,nbt,result);
        if(block instanceof TheEndGatewayBlockEntity || block instanceof StructureBlockEntity || block instanceof JigsawBlockEntity || block instanceof SculkSensorBlockEntity || block instanceof SculkShriekerBlockEntity)
            WorldNbt.requireEditedFieldsRetained(nbt,result,WorldTarget.copyBlock(block,result,access).saveWithFullMetadata(access));
        if(block instanceof VaultBlockEntity && edits.has("vault")) {
            var baseline=WorldTarget.copyBlock(block,nbt,access);
            var copy=WorldTarget.copyBlock(block,result,access);var saved=copy.saveWithFullMetadata(access);var changes=edits.getAsJsonObject("vault");
            // VaultConfig uses lenient defaults and omits default values. Compare semantic values
            // for ALL exposed config fields before adopting only edited canonical saved paths.
            for(var field:groups.get("vault")) {
                if(!field.key.startsWith("config."))continue;
                var expected=changes.has(field.key) && changes.get(field.key).isJsonNull() ? null : effectiveTag(baseline,result,field,access);
                if(!Objects.equals(expected,effectiveTag(copy,saved,field,access)))throw new EditorSessions.Failure("invalid_nbt","原版宝库加载器未保留配置："+field.key);
            }
            for(var field:groups.get("vault"))if(changes.has(field.key))put(result,field,get(saved,field));
        }
        return result;
    }
    public static void requireUnwaxed(BlockEntity block,CompoundTag before,CompoundTag after) {
        if(block instanceof SignBlockEntity && before.getBoolean("is_waxed").orElse(false) && after.getBoolean("is_waxed").orElse(false)
            && (!Objects.equals(before.get("front_text"),after.get("front_text")) || !Objects.equals(before.get("back_text"),after.get("back_text"))))
            throw new EditorSessions.Failure("sign_waxed","标牌已涂蜡；修改文字须在同一笔请求中设置 is_waxed:false");
    }
    /** Content-derived flags change only when content changes; standalone state edits stay explicit. */
    public static net.minecraft.world.level.block.state.BlockState contentState(BlockEntity source,CompoundTag before,CompoundTag after,net.minecraft.world.level.block.state.BlockState state,RegistryAccess access) {
        if(source instanceof StructureBlockEntity && !Objects.equals(before.get("mode"),after.get("mode")))
            return state.setValue(net.minecraft.world.level.block.StructureBlock.MODE,((StructureBlockEntity)WorldTarget.copyBlock(source,after,access)).getMode());
        if(source instanceof LecternBlockEntity && !Objects.equals(before.get("Book"),after.get("Book")))
            return state.setValue(net.minecraft.world.level.block.LecternBlock.HAS_BOOK,!((LecternBlockEntity)WorldTarget.copyBlock(source,after,access)).getBook().isEmpty());
        if(source instanceof JukeboxBlockEntity && !Objects.equals(before.get("RecordItem"),after.get("RecordItem")))
            return state.setValue(net.minecraft.world.level.block.JukeboxBlock.HAS_RECORD,!WorldTarget.inventory(WorldTarget.copyBlock(source,after,access)).get(0).isEmpty());
        if(source instanceof ChiseledBookShelfBlockEntity && !Objects.equals(before.get("Items"),after.get("Items"))) {
            var items=WorldTarget.inventory(WorldTarget.copyBlock(source,after,access));
            var properties=net.minecraft.world.level.block.ChiseledBookShelfBlock.SLOT_OCCUPIED_PROPERTIES;
            for(int i=0;i<items.size();i++)state=state.setValue(properties.get(i),!items.get(i).isEmpty());
        }
        return state;
    }
}
