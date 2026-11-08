package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.*;
import dev.rinorsi.editor.StackCodec;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.item.*;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.EnderMan;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** Additional typed views; writes still pass the detached vanilla load/save gate. */
final class EntityViewsSimple {
    private EntityViewsSimple() {}
    private record Field(Codec<?> codec, String type, boolean nullable) {}
    private static Map<String,Map<String,Field>> sections(Entity entity,CompoundTag saved) {
        var sections=new LinkedHashMap<String,Map<String,Field>>();
        if(entity instanceof ItemEntity) {
            var fields=primitives(saved,"PickupDelay","Age");fields.put("Item",new Field(ItemStack.CODEC,"stack",false));sections.put("dropped_item",fields);
        }
        if(entity instanceof FallingBlockEntity) {
            var fields=primitives(saved,"Time","FallHurtAmount","FallHurtMax");
            booleans(fields,"DropItem","HurtEntities","CancelDrop");fields.put("BlockState",new Field(BlockState.CODEC,"BlockState.CODEC",false));sections.put("falling_block",fields);
        }
        if(entity instanceof PrimedTnt)sections.put("tnt",primitives(saved,"fuse"));
        if(entity instanceof Creeper)sections.put("creeper",primitives(saved,"Fuse","ExplosionRadius"));
        if(entity instanceof EnderMan)sections.put("enderman",Map.of("carriedBlockState",new Field(BlockState.CODEC,"BlockState.CODEC",true)));
        if(entity instanceof AreaEffectCloud) {
            var fields=primitives(saved,"Age","Duration","WaitTime","ReapplicationDelay","DurationOnUse","RadiusOnUse","RadiusPerTick","Radius");
            fields.put("potion_contents",new Field(PotionContents.CODEC,"PotionContents.CODEC",true));
            fields.put("custom_particle",new Field(ParticleTypes.CODEC,"ParticleTypes.CODEC",true));
            fields.put("potion_duration_scale",new Field(Codec.FLOAT,"float",true));sections.put("area_effect_cloud",fields);
        }
        if(entity instanceof ExperienceOrb)sections.put("experience_orb",primitives(saved,"Value"));
        if(entity instanceof AbstractArrow) {
            var fields=primitives(saved,"damage");fields.put("pickup",new Field(AbstractArrow.Pickup.LEGACY_CODEC,"pickup",false));sections.put("arrow",fields);
        }
        if(entity instanceof Interaction) {
            var fields=primitives(saved,"width","height");booleans(fields,"response");sections.put("interaction",fields);
        }
        return sections;
    }
    private static void booleans(Map<String,Field> fields,String... names) {
        for(String key:names)fields.put(key,new Field(Codec.BOOL,"boolean",false));
    }
    private static LinkedHashMap<String,Field> primitives(CompoundTag saved,String... names) {
        var fields=new LinkedHashMap<String,Field>();
        for(String key:names) {
            Tag tag=saved.get(key);Codec<?> codec;
            if(tag instanceof ShortTag)codec=Codec.SHORT;
            else if(tag instanceof ByteTag)codec=Codec.BYTE;
            else if(tag instanceof IntTag)codec=Codec.INT;
            else if(tag instanceof FloatTag)codec=Codec.FLOAT;
            else if(tag instanceof DoubleTag)codec=Codec.DOUBLE;
            else throw new IllegalStateException("Unsupported vanilla field: "+key);
            fields.put(key,new Field(codec,tag.getType().getName(),false));
        }
        return fields;
    }
    static boolean supports(String section) { return Set.of("owner","dropped_item","falling_block","tnt","creeper","enderman","area_effect_cloud","experience_orb","arrow","interaction","leash","team").contains(section); }
    static void views(JsonObject out, Entity entity, CompoundTag saved, RegistryAccess access) {
        for(var section:sections(entity,saved).entrySet()) {
            var view=new JsonObject();
            for(var field:section.getValue().entrySet()) {
                String key=field.getKey();
                if(field.getValue().type.equals("stack"))view.add(key,EntityWorldEdit.stack(((ItemEntity)entity).getItem(),access));
                else if(field.getValue().codec==Codec.BOOL)view.addProperty(key,saved.getBoolean(key).orElseThrow());
                else view.add(key,saved.contains(key)?EntityWorldEdit.json(saved.get(key)):JsonNull.INSTANCE);
            }
            out.add(section.getKey(),view);
        }
        var scoreboard=entity.level().getScoreboard();var team=new JsonObject();team.addProperty("readOnly",true);team.addProperty("available",scoreboard!=null);
        var names=new JsonArray();if(scoreboard!=null)scoreboard.getTeamNames().stream().sorted().forEach(names::add);team.add("options",names);
        var membership=scoreboard==null?null:scoreboard.getPlayersTeam(entity.getScoreboardName());team.add("name",membership==null?JsonNull.INSTANCE:new JsonPrimitive(membership.getName()));out.add("team",team);
        if(entity instanceof Leashable leashable) {
            var leash=new JsonObject();leash.addProperty("readOnly",true);leash.addProperty("reason","Leash relationships are protected; no graph-safe write/undo adapter");
            var data=leashable.getLeashData();leash.add("data",data==null?JsonNull.INSTANCE:Leashable.LeashData.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),data).getOrThrow());out.add("leash",leash);
        }
        if(entity instanceof TamableAnimal tame) {
            var view=new JsonObject();var owner=tame.getOwnerReference();
            view.add("Owner",owner==null?JsonNull.INSTANCE:new JsonPrimitive(owner.getUUID().toString()));
            var players=new JsonArray();var server=entity.level().getServer();
            if(server!=null)for(var player:server.getPlayerList().getPlayers()) {
                var row=new JsonObject();row.addProperty("uuid",player.getStringUUID());row.addProperty("name",player.getName().getString());players.add(row);
            }
            view.add("players",players);view.addProperty("available",server!=null);out.add("owner",view);
        }
    }
    static void schema(JsonObject out, Entity entity, RegistryAccess access) {
        var saved=WorldTarget.saveEntity(entity,access);
        for(var section:sections(entity,saved).entrySet()) {
            var schema=new JsonObject();var fields=new JsonObject();schema.addProperty("write","entity."+section.getKey());
            for(var entry:section.getValue().entrySet()) {
                var field=new JsonObject();var spec=entry.getValue();String key=entry.getKey();
                field.addProperty("type",spec.type);field.addProperty("nbtPath",key);field.addProperty("nullable",spec.nullable);
                field.addProperty("source","live vanilla save type / Codec; changed value must survive detached load/save");
                if(spec.codec==Codec.SHORT){field.addProperty("min",Short.MIN_VALUE);field.addProperty("max",Short.MAX_VALUE);}
                if(spec.codec==Codec.BYTE){field.addProperty("min",Byte.MIN_VALUE);field.addProperty("max",Byte.MAX_VALUE);}
                if(spec.codec==Codec.INT){field.addProperty("min",Integer.MIN_VALUE);field.addProperty("max",Integer.MAX_VALUE);}
                if(spec.codec==BlockState.CODEC){field.addProperty("registry","minecraft:block");field.addProperty("properties","live Block StateDefinition; block_properties registry channel");}
                if(spec.type.equals("pickup"))field.add("options",pickupOptions());
                if(spec.codec==PotionContents.CODEC){field.addProperty("registry","minecraft:potion");field.addProperty("effectsRegistry","minecraft:mob_effect");}
                if(spec.codec==ParticleTypes.CODEC)field.addProperty("registry","minecraft:particle_type");
                if(entity instanceof AreaEffectCloud&&key.equals("Radius")&&!entity.level().isClientSide()) {
                    var low=(AreaEffectCloud)entity.getType().create(entity.level(),EntitySpawnReason.COMMAND);var high=(AreaEffectCloud)entity.getType().create(entity.level(),EntitySpawnReason.COMMAND);
                    low.setRadius(-Float.MAX_VALUE);high.setRadius(Float.MAX_VALUE);field.addProperty("min",low.getRadius());field.addProperty("max",high.getRadius());
                }
                fields.add(key,field);
            }
            schema.add("fields",fields);out.add(section.getKey(),schema);
        }
        // Read-only relation views carry their metadata inline to keep near-budget schemas small.
        if(entity instanceof TamableAnimal) {
            var section=new JsonObject();section.addProperty("write","entity.owner");
            section.addProperty("field","Owner");section.addProperty("type","UUID string or null");
            section.addProperty("candidates","world.views.owner.players; live server PlayerList");
            section.addProperty("codec","EntityReference.codec()");section.addProperty("null","clear owner and tame state");out.add("owner",section);
        }
    }
    static void apply(Entity source, CompoundTag nbt, JsonObject edit, Level level, RegistryAccess access) {
        require(!edit.has("team"),"Team view is read-only");require(!edit.has("leash"),"Leash relationship is read-only");
        var available=sections(source,nbt);
        for(var section:edit.entrySet()) {
            if(!supports(section.getKey())||section.getKey().equals("owner"))continue;
            require(available.containsKey(section.getKey()),"Section not supported by this entity: "+section.getKey());
            for(var entry:section.getValue().getAsJsonObject().entrySet()) {
                String key=entry.getKey();var spec=available.get(section.getKey()).get(key);require(spec!=null,"Unknown entity field: "+key);var value=entry.getValue();
                if(value.isJsonNull()){require(spec.nullable,"Field does not accept null: "+key);nbt.remove(key);continue;}
                if(spec.type.equals("stack")) {
                    var stack=StackCodec.decode(value.getAsJsonObject(),access,((ItemEntity)source).getItem());require(!stack.isEmpty(),"Dropped item cannot be empty");
                    nbt.put(key,ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),stack).getOrThrow());
                } else nbt.put(key,encode(spec,value,access));
            }
        }
        if(edit.has("owner")) {
            require(source instanceof TamableAnimal,"Owner requires TamableAnimal");
            var data=edit.getAsJsonObject("owner");require(data.size()==1&&data.has("Owner"),"owner accepts only Owner");
            var value=data.get("Owner");
            if(value.isJsonNull())nbt.remove("Owner");
            else {
                require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isString(),"Owner must be a UUID string or null");
                var id=UUID.fromString(value.getAsString());require(id.toString().equalsIgnoreCase(value.getAsString()),"Owner requires canonical UUID format");
                var current=((TamableAnimal)source).getOwnerReference();var server=level.getServer();
                require(current!=null&&current.getUUID().equals(id)||server!=null&&server.getPlayerList().getPlayer(id)!=null,"New owner must be an online player");
                nbt.put("Owner",EntityReference.<LivingEntity>codec().encodeStart(access.createSerializationContext(NbtOps.INSTANCE),EntityReference.of(id)).getOrThrow());
            }
        }
    }
    private static JsonArray pickupOptions() {
        var options=new JsonArray();for(var pickup:AbstractArrow.Pickup.values()) {
            var row=new JsonObject();row.addProperty("label",pickup.name());row.add("value",AbstractArrow.Pickup.LEGACY_CODEC.encodeStart(JsonOps.INSTANCE,pickup).getOrThrow());options.add(row);
        }return options;
    }
    private static <T> Tag encoded(Codec<T> codec,JsonElement value,RegistryAccess access) {
        return codec.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),codec.parse(access.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow()).getOrThrow();
    }
    private static Tag encode(Field field,JsonElement value,RegistryAccess access) {
        var codec=field.codec;
        if(field.type.equals("pickup")) {
            require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber(),"Pickup requires an integer codec value");int requested=value.getAsBigDecimal().intValueExact();
            require(pickupOptions().asList().stream().anyMatch(option->option.getAsJsonObject().get("value").getAsInt()==requested),"Unknown pickup mode");
        }
        if(codec==Codec.BOOL)require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isBoolean(),"Field requires boolean");
        if(codec==BlockState.CODEC) {
            var wire=value.getAsJsonObject();require(Set.of("Name","Properties").containsAll(wire.keySet()),"Unknown block state field");
            var state=BlockState.CODEC.parse(access.createSerializationContext(JsonOps.INSTANCE),wire).getOrThrow();
            require(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString().equals(net.minecraft.resources.Identifier.parse(wire.get("Name").getAsString()).toString()),"Unknown block state ID");
            if(wire.has("Properties"))BlockStateEdit.prepare(state,wire.getAsJsonObject("Properties"));
        }
        if(codec==Codec.BYTE||codec==Codec.SHORT||codec==Codec.INT||codec==Codec.FLOAT||codec==Codec.DOUBLE) {
            require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber(),"Field requires a number");
            if(codec==Codec.FLOAT)require(Float.isFinite(value.getAsFloat()),"Float must be finite");
            else if(codec==Codec.DOUBLE)require(Double.isFinite(value.getAsDouble()),"Double must be finite");
            else {
                int n=value.getAsBigDecimal().intValueExact();
                if(codec==Codec.SHORT)require(n>=Short.MIN_VALUE&&n<=Short.MAX_VALUE,"Short out of range");
                if(codec==Codec.BYTE)require(n>=Byte.MIN_VALUE&&n<=Byte.MAX_VALUE,"Byte out of range");
            }
        }
        return encoded(codec,value,access);
    }
    private static void require(boolean condition,String message) { if(!condition)throw new IllegalArgumentException(message); }
}
