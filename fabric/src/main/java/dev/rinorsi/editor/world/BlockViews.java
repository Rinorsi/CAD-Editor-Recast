package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.*;
import dev.rinorsi.editor.EditorSessions;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.*;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.*;

/** Normalized fields use vanilla codecs, then the existing detached loadWithComponents gate. */
public final class BlockViews {
    private BlockViews() {}
    private record Field(String key, Codec<?> codec, boolean component) {}
    private static Map<String,List<Field>> fields(BlockEntity block) {
        var groups = new LinkedHashMap<String,List<Field>>();
        if (block instanceof net.minecraft.world.Nameable) groups.put("nameable",List.of(f("CustomName",net.minecraft.network.chat.ComponentSerialization.CODEC)));
        if (block instanceof SignBlockEntity) groups.put("sign", List.of(f("front_text",SignText.DIRECT_CODEC), f("back_text",SignText.DIRECT_CODEC), f("is_waxed",Codec.BOOL)));
        if (block instanceof BannerBlockEntity) groups.put("banner",List.of(f("patterns",BannerPatternLayers.CODEC)));
        if (block instanceof BeehiveBlockEntity) groups.put("beehive",List.of(f("bees",BeehiveBlockEntity.Occupant.LIST_CODEC)));
        if (block instanceof LecternBlockEntity) groups.put("lectern",List.of(f("Book",ItemStack.CODEC),f("Page",Codec.INT)));
        if (block instanceof JukeboxBlockEntity) groups.put("jukebox",List.of(f("RecordItem",ItemStack.CODEC)));
        if (block instanceof DecoratedPotBlockEntity) groups.put("decorated_pot",List.of(f("sherds",PotDecorations.CODEC)));
        if (block instanceof ChiseledBookShelfBlockEntity) groups.put("chiseled_bookshelf",List.of(f("last_interacted_slot",Codec.INT)));
        if (block instanceof CommandBlockEntity) groups.put("command_block",List.of(f("Command",Codec.STRING),f("TrackOutput",Codec.BOOL),f("auto",Codec.BOOL),f("powered",Codec.BOOL)));
        if (block instanceof AbstractFurnaceBlockEntity) groups.put("furnace",List.of(f("cooking_time_spent",Codec.SHORT),f("cooking_total_time",Codec.SHORT),f("lit_time_remaining",Codec.SHORT),f("lit_total_time",Codec.SHORT)));
        if (block instanceof BeaconBlockEntity) groups.put("beacon",List.of(f("primary_effect",net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec()),f("secondary_effect",net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec()),f("Levels",Codec.INT)));
        if (block instanceof HopperBlockEntity) groups.put("hopper",List.of(f("TransferCooldown",Codec.INT)));
        if (block instanceof BrewingStandBlockEntity) groups.put("brewing_stand",List.of(f("BrewTime",Codec.SHORT),f("Fuel",Codec.BYTE)));
        if (block instanceof CampfireBlockEntity) groups.put("campfire",List.of(f("CookingTimes",Codec.INT_STREAM),f("CookingTotalTimes",Codec.INT_STREAM)));
        if (block instanceof SkullBlockEntity) groups.put("skull",List.of(new Field("minecraft:profile",DataComponents.PROFILE.codec(),true),new Field("minecraft:custom_name",DataComponents.CUSTOM_NAME.codec(),true)));
        return groups;
    }
    private static boolean nullable(Field field) { return field.component || field.codec == ItemStack.CODEC || field.key.equals("CustomName") || field.key.equals("primary_effect") || field.key.equals("secondary_effect"); }
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
    private static Tag get(CompoundTag nbt,Field field) { return nbt.get(field.component ? field.key.substring(10) : field.key); }
    private static void put(CompoundTag nbt,Field field,Tag tag) {
        String key=field.component ? field.key.substring(10) : field.key;
        if (tag == null) nbt.remove(key); else nbt.put(key,tag);
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
                Tag tag = get(nbt,field);
                // Include real runtime defaults even if vanilla omits them from a sparse save.
                if (tag == null && block instanceof BannerBlockEntity b && field.key.equals("patterns")) tag = encode(field.codec, BannerPatternLayers.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),b.getPatterns()).getOrThrow(),access);
                if (tag == null && block instanceof DecoratedPotBlockEntity p && field.key.equals("sherds")) tag = encode(field.codec,PotDecorations.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),p.getDecorations()).getOrThrow(),access);
                value.add(field.key,tag == null ? JsonNull.INSTANCE : decode(field.codec,tag,access));
                if(tag != null) subset.put(field.key,tag.copy());
                var schema = new JsonObject(); schema.addProperty("authority","vanilla_codec_and_loadWithComponents"); schema.addProperty("codec",field.codec.toString()); schema.addProperty("nullable",nullable(field));
                if(field.component) schema.addProperty("saved_path",field.key.substring(10));
                if(field.codec == BeehiveBlockEntity.Occupant.LIST_CODEC) schema.addProperty("vanilla_max_occupants",BeehiveBlockEntity.MAX_OCCUPANTS);
                if(field.codec == Codec.SHORT) {schema.addProperty("min",Short.MIN_VALUE);schema.addProperty("max",Short.MAX_VALUE);schema.addProperty("bounds","NBT short storage; vanilla loader validates semantics");}
                if(field.codec == Codec.BYTE) {schema.addProperty("min",Byte.MIN_VALUE);schema.addProperty("max",Byte.MAX_VALUE);}
                if(field.codec == Codec.INT) {schema.addProperty("min",Integer.MIN_VALUE);schema.addProperty("max",Integer.MAX_VALUE);}
                if(block instanceof ChiseledBookShelfBlockEntity && field.key.equals("last_interacted_slot")) {schema.addProperty("min",-1);schema.addProperty("max",WorldTarget.inventory(block).size()-1);schema.addProperty("bounds","runtime container slots or vanilla no-interaction sentinel");}
                if(field.codec == Codec.INT_STREAM && tag instanceof IntArrayTag array) schema.addProperty("length",array.getAsIntArray().length);
                if(field.codec == SignText.DIRECT_CODEC) { schema.addProperty("messages_length",SignText.LINES); var colors = new JsonArray(); for(var color:net.minecraft.world.item.DyeColor.values()) colors.add(color.getName());schema.add("colors",colors); }
                if(block instanceof BeaconBlockEntity) {
                    if(field.key.equals("Levels")) {schema.addProperty("read_only",true);schema.addProperty("source","vanilla pyramid calculation");}
                    else {var candidates=new JsonArray();BeaconBlockEntity.BEACON_EFFECTS.stream().flatMap(List::stream).distinct().forEach(effect->candidates.add(net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec().encodeStart(access.createSerializationContext(JsonOps.INSTANCE),effect).getOrThrow()));schema.add("candidates",candidates);schema.addProperty("candidate_source","BeaconBlockEntity.BEACON_EFFECTS + MOB_EFFECT registry");}
                }
                properties.add(field.key,schema);
            }
            var schema = new JsonObject();schema.add("fields",properties);
            if(block instanceof BannerBlockEntity banner) schema.addProperty("base_color",banner.getBaseColor().getName());
            if(block instanceof ChiseledBookShelfBlockEntity) schema.addProperty("items_write_path","container.slots");
            var row = new JsonObject();row.add("value",value);row.addProperty("snbt",subset.toString());row.add("schema",schema);views.add(group,row);
        });
        if(block instanceof TheEndGatewayBlockEntity || block instanceof StructureBlockEntity) {
            var row = new JsonObject();row.addProperty("supported",false);row.addProperty("reason","仅完整 SNBT；尚无安全的专用字段编辑器");views.add("unsupported",row);
        }
    }
    public static CompoundTag apply(BlockEntity block,CompoundTag nbt,JsonObject edits,RegistryAccess access) {
        var result = nbt.copy();var groups=fields(block);
        for(var group:edits.entrySet()) {
            var allowed=groups.get(group.getKey());
            if(allowed==null || !group.getValue().isJsonObject()) throw new EditorSessions.Failure("invalid_request","目标不支持字段视图："+group.getKey());
            for(var entry:group.getValue().getAsJsonObject().entrySet()) {
                var field=allowed.stream().filter(f->f.key.equals(entry.getKey())).findFirst().orElseThrow(()->new EditorSessions.Failure("invalid_request","未知视图字段："+entry.getKey()));
                var json=entry.getValue();
                if(block instanceof BeaconBlockEntity && field.key.equals("Levels"))throw new EditorSessions.Failure("invalid_request","信标等级由金字塔计算，只读");
                if(block instanceof BeaconBlockEntity && !json.isJsonNull()) {
                    var effect=net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec().parse(access.createSerializationContext(JsonOps.INSTANCE),json).getOrThrow(s->new EditorSessions.Failure("invalid_nbt",s));
                    if(BeaconBlockEntity.BEACON_EFFECTS.stream().flatMap(List::stream).noneMatch(effect::equals))throw new EditorSessions.Failure("invalid_nbt","不是原版信标允许的效果");
                }
                if(json.isJsonNull()) {
                    if(nullable(field)) {put(result,field,null);continue;}
                    throw new EditorSessions.Failure("invalid_nbt","此字段不允许清空："+field.key);
                }
                // Sign sides accept a partial object; unedited lines/filtered messages remain intact.
                if(field.codec==SignText.DIRECT_CODEC)requireSignSide(json,access);
                if(field.codec==Codec.SHORT)requireInteger(json,Short.MIN_VALUE,Short.MAX_VALUE);
                if(field.codec==Codec.BYTE)requireInteger(json,Byte.MIN_VALUE,Byte.MAX_VALUE);
                if(field.codec==Codec.INT)requireInteger(json,Integer.MIN_VALUE,Integer.MAX_VALUE);
                if(block instanceof ChiseledBookShelfBlockEntity && field.key.equals("last_interacted_slot"))requireInteger(json,-1,WorldTarget.inventory(block).size()-1);
                if(field.codec==Codec.BOOL && (!json.isJsonPrimitive() || !json.getAsJsonPrimitive().isBoolean()))throw new EditorSessions.Failure("invalid_nbt","布尔字段不能使用字符串或数字");
                if(field.codec==Codec.INT_STREAM) {
                    var original=get(result,field);
                    if(!json.isJsonArray() || (original instanceof IntArrayTag array && array.getAsIntArray().length!=json.getAsJsonArray().size()))throw new EditorSessions.Failure("invalid_nbt","进度数组长度必须与实际营火一致");
                    for(var element:json.getAsJsonArray())requireInteger(element,Integer.MIN_VALUE,Integer.MAX_VALUE);
                }
                if(field.codec==SignText.DIRECT_CODEC && json.isJsonObject() && get(result,field)!=null) {
                    var merged=decode(field.codec,get(result,field),access).getAsJsonObject();json.getAsJsonObject().entrySet().forEach(e->merged.add(e.getKey(),e.getValue()));json=merged;
                }
                if(field.codec==SignText.DIRECT_CODEC || field.codec==BannerPatternLayers.CODEC)requireColors(json);
                var encoded=encode(field.codec,json,access);
                // Vanilla omits default banner layers/pot decorations rather than saving empty fields.
                if(field.codec==BannerPatternLayers.CODEC && encoded instanceof ListTag list && list.isEmpty()) encoded=null;
                if(field.codec==PotDecorations.CODEC && PotDecorations.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),encoded).getOrThrow().equals(PotDecorations.EMPTY))encoded=null;
                put(result,field,encoded);
            }
        }
        if(block instanceof JukeboxBlockEntity && !Objects.equals(nbt.get("RecordItem"),result.get("RecordItem")))result.remove(JukeboxBlockEntity.TICKS_SINCE_SONG_STARTED_TAG_ID);
        requireUnwaxed(block,nbt,result);
        return result;
    }
    public static void requireUnwaxed(BlockEntity block,CompoundTag before,CompoundTag after) {
        if(block instanceof SignBlockEntity && before.getBoolean("is_waxed").orElse(false) && after.getBoolean("is_waxed").orElse(false)
            && (!Objects.equals(before.get("front_text"),after.get("front_text")) || !Objects.equals(before.get("back_text"),after.get("back_text"))))
            throw new EditorSessions.Failure("sign_waxed","标牌已涂蜡；修改文字须在同一笔请求中设置 is_waxed:false");
    }
    /** Content-derived flags change only when content changes; standalone state edits stay explicit. */
    public static net.minecraft.world.level.block.state.BlockState contentState(BlockEntity source,CompoundTag before,CompoundTag after,net.minecraft.world.level.block.state.BlockState state,RegistryAccess access) {
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
