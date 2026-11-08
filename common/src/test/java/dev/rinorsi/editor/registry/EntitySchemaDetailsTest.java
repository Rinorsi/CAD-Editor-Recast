package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.SharedConstants;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.ai.attributes.*;

/** Regression evidence against the actual 26.1.2 codecs, loaders, dimensions and suppliers. */
public final class EntitySchemaDetailsTest {
    private static int assertions;
    private static void check(boolean ok,String reason){assertions++;if(!ok)throw new AssertionError(reason);}
    private static CompoundTag tag(String data){try{return TagParser.parseCompoundFully(data);}catch(Exception ex){throw new IllegalArgumentException(ex);}}
    public static void main(String[] args)throws Exception {
        SharedConstants.tryDetectVersion();Bootstrap.bootStrap();var access=EntitySchemaTest.access();
        var level=new EntitySchemaTestLevel(access,Boolean.parseBoolean(System.getProperty("cadeditor.schema.client","true")));
        JsonObject captured=new JsonObject();
        for(String name:List.of("cat","sheep","zombie","slime","magma_cube","armor_stand","wolf","villager","phantom","pufferfish","creeper","horse","llama","parrot","rabbit","fox","axolotl","zombie_villager","tropical_fish","pig","chicken","frog","mooshroom")){
            if(!level.isClientSide()&&name.equals("villager"))continue;
            var type=BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.parse("minecraft:"+name));
            var schema=EntitySchema.describe(type,level,access);captured.add(name,schema);
            check(schema.get("available").getAsBoolean(),name+" available");
            JsonArray entries=new JsonArray();entries.add(schema);var pages=RegistryPages.split("entity_schema","entity-schema-test",entries);
            check(pages.size()==1&&pages.getFirst().toString().length()<=RegistryPages.MAX_CHARS,name+" schema fits actual registry transport including envelope");
            var living=(LivingEntity)EntitySchema.create(type,level);
            long supported=BuiltInRegistries.ATTRIBUTE.listElements().filter(h->living.getAttributes().hasAttribute(h)).count();
            check(schema.getAsJsonArray("attributes").size()==supported,name+" every supplier attribute exported: "+schema.get("warnings"));
            for(var raw:schema.getAsJsonArray("attributes")){var row=raw.getAsJsonObject();
                if(row.has("roundtrip")&&!row.get("roundtrip").getAsBoolean())continue;
                String id=row.get("id").getAsString();
                CompoundTag input=tag("{id:'minecraft:"+name+"',attributes:[{id:'"+id+"',base:"+row.get("base")+"d}]}");
                EntitySchemaValidation.validate(input,level,0);
                var loaded=(LivingEntity)EntitySchema.load(type,level,access,input);
                var holder=BuiltInRegistries.ATTRIBUTE.get(Identifier.parse(id)).orElseThrow();
                check(loaded.getAttributeBaseValue(holder)==row.get("base").getAsDouble(),name+" attribute "+id);
            }
            for(var raw:schema.getAsJsonArray("extras")){var row=raw.getAsJsonObject();if(!row.has("id")&&!row.get("key").getAsString().equals("Offers"))continue;
                if(row.has("roundtrip")&&!row.get("roundtrip").getAsBoolean()){check(row.get("advanced").getAsBoolean(),"unpersisted client field stays advanced");continue;}
                CompoundTag input=tag("{id:'minecraft:"+name+"',"+row.get("key").getAsString()+":"+row.get("sampleSnbt").getAsString()+"}");
                EntitySchemaValidation.validate(input,level,0);
                check(Objects.equals(input.get(row.get("key").getAsString()),EntitySchema.loadSave(type,level,access,input).get(row.get("key").getAsString())),name+" extra "+row.get("key"));
            }
            if(name.equals("villager"))check(schema.getAsJsonArray("extras").asList().stream().anyMatch(raw->raw.getAsJsonObject().get("key").getAsString().equals("Offers")),"villager Offers codec/load shape exported even though client save omits it");
            System.out.println(name+" attributes="+supported+" extras="+schema.getAsJsonArray("extras").size()+" warnings="+schema.get("warnings"));
        }
        CompoundTag large=tag("{id:'minecraft:zombie',attributes:[{id:'minecraft:scale',base:2d}]}");
        JsonObject request=new JsonObject();request.addProperty("id","minecraft:zombie_spawn_egg");request.addProperty("count",1);
        JsonObject components=new JsonObject();components.addProperty("entity_data",large.toString());request.add("comps",components);
        JsonObject formats=new JsonObject();formats.addProperty("entity_data","snbt");request.add("component_formats",formats);request.add("removed",new JsonObject());
        var egg=dev.rinorsi.editor.StackCodec.decode(request,access);EntitySchemaValidation.validateStack(egg,level);
        var entityData=egg.get(net.minecraft.core.component.DataComponents.ENTITY_DATA);check(entityData!=null,"real entity_data component decoded");
        large=entityData.copyTagWithoutId();large.putString("id",BuiltInRegistries.ENTITY_TYPE.getKey(entityData.type()).toString());
        var normal=(LivingEntity)EntitySchema.create(net.minecraft.world.entity.EntityTypes.ZOMBIE,level);
        var doubled=(LivingEntity)EntitySchema.load(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,large);
        check(doubled.getAttributeBaseValue(Attributes.SCALE)==2,"scale base loads");
        check(Math.abs(doubled.getBbWidth()/normal.getBbWidth()-2)<0.001,"scale changes actual width: "+normal.getBbWidth()+" -> "+doubled.getBbWidth());
        check(Math.abs(doubled.getBbHeight()/normal.getBbHeight()-2)<0.001,"scale changes actual height");
        var resaved=(LivingEntity)EntitySchema.load(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,EntitySchema.save(doubled,access));
        check(resaved.getBbHeight()==doubled.getBbHeight(),"larger dimensions survive re-save/load");
        System.out.println("SCALE dimensions "+normal.getBbWidth()+"x"+normal.getBbHeight()+" -> "+doubled.getBbWidth()+"x"+doubled.getBbHeight()+"; NBT="+EntitySchema.save(doubled,access).get("attributes"));
        CompoundTag lowHealth=tag("{id:'minecraft:zombie',attributes:[{id:'minecraft:max_health',base:5d}],Health:20f}");
        var clamped=(LivingEntity)EntitySchema.load(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,lowHealth);
        check(clamped.getHealth()==5,"vanilla health re-clamps after max_health load");
        reject(lowHealth,level,"Health");lowHealth.putFloat("Health",5);EntitySchemaValidation.validate(lowHealth,level,0);
        check(((LivingEntity)EntitySchema.load(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,lowHealth)).getHealth()==5,"apply uses new max_health");
        var highHealth=tag("{id:'minecraft:zombie',attributes:[{id:'minecraft:max_health',base:60d}],Health:50f}");EntitySchemaValidation.validate(highHealth,level,0);
        check(((LivingEntity)EntitySchema.load(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,highHealth)).getHealth()==50,"apply accepts health above old default when max_health increased");
        CompoundTag modifiers=tag("{id:'minecraft:zombie',attributes:[{id:'minecraft:scale',base:1d,modifiers:[{id:'cadeditor:probe',amount:1d,operation:'add_value'}]}]}");
        EntitySchemaValidation.validate(modifiers,level,0);
        check(((LivingEntity)EntitySchema.load(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,modifiers)).getScale()==2,"permanent modifier codec and effective scale");
        var ops=access.createSerializationContext(NbtOps.INSTANCE);
        var normalized=MobEffectInstance.CODEC.parse(ops,tag("{id:'minecraft:speed',amplifier:256,duration:-2}")).getOrThrow();
        check(normalized.getAmplifier()==0&&normalized.getDuration()==-2,"vanilla unsigned-byte amplifier normalization and unrestricted int duration");
        var normalizedInput=tag("{id:'minecraft:zombie',active_effects:[{id:'minecraft:speed',amplifier:256,duration:-2}]}");EntitySchemaValidation.validate(normalizedInput,level,0);
        var hidden=tag("{id:'minecraft:zombie',active_effects:[{id:'minecraft:speed',amplifier:1,duration:20,hidden_effect:{amplifier:0,duration:200}}]}");EntitySchemaValidation.validate(hidden,level,0);
        check(EntitySchema.loadSave(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,hidden).getList("active_effects").orElseThrow().getCompound(0).orElseThrow().contains("hidden_effect"),"hidden effect round-trip");
        for(var effect:BuiltInRegistries.MOB_EFFECT.listElements().toList()){
            // Loading active_effects does not tick or execute the effect.
            for(int duration:new int[]{-1,1,200,0,-2,Integer.MAX_VALUE})for(int amp:new int[]{MobEffectInstance.MIN_AMPLIFIER,MobEffectInstance.MAX_AMPLIFIER}){
                var instance=new MobEffectInstance(effect,duration,amp,true,false,true);Tag encoded=MobEffectInstance.CODEC.encodeStart(ops,instance).getOrThrow();
                CompoundTag input=tag("{id:'minecraft:zombie'}");ListTag effects=new ListTag();effects.add(encoded);input.put("active_effects",effects);
                EntitySchemaValidation.validate(input,level,0);
                var saved=EntitySchema.loadSave(net.minecraft.world.entity.EntityTypes.ZOMBIE,level,access,input).getList("active_effects").orElseThrow();
                check(saved.size()==1,"effect saved "+effect.key());var decoded=MobEffectInstance.CODEC.parse(ops,saved.getFirst()).getOrThrow();
                check(decoded.getDuration()==duration&&decoded.getAmplifier()==amp&&decoded.isAmbient()&&!decoded.isVisible()&&decoded.showIcon(),"effect codec fields "+effect.key());
            }
        }
        for(String snbt:List.of("{id:'minecraft:zombie',attributes:{}}","{id:'minecraft:zombie',attributes:[{}]}","{id:'minecraft:zombie',attributes:[{id:'minecraft:scale',base:999d}]}","{id:'minecraft:zombie',attributes:[{id:'minecraft:scale',base:-1d}]}","{id:'minecraft:zombie',attributes:[{id:'minecraft:scale',base:2d,modifiers:[{}]}]}","{id:'minecraft:zombie',active_effects:{}}","{id:'minecraft:zombie',active_effects:[{}]}","{id:'minecraft:zombie',active_effects:[{id:'cadeditor:missing'}]}","{id:'minecraft:zombie',active_effects:[{id:'minecraft:speed',amplifier:'bad'}]}","{id:'minecraft:zombie',active_effects:[{id:'minecraft:speed',duration:'bad'}]}","{id:'minecraft:zombie',active_effects:[{id:'minecraft:speed',show_icon:'bad'}]}","{id:'minecraft:zombie',Passengers:{}}"))reject(tag(snbt),level,snbt.contains("attributes")?"attributes":snbt.contains("active_effects")?"active_effects":"Passengers");
        var wolf=captured.getAsJsonObject("wolf");var tamed=tag(wolf.get("tamed_sample_nbt").getAsString());EntitySchemaValidation.validate(tamed,level,0);
        check(((TamableAnimal)EntitySchema.load(net.minecraft.world.entity.EntityTypes.WOLF,level,access,tamed)).isTame(),"Owner int array loads tamed wolf");
        // Recursive vanilla entity factory, still no world insertion/ticking.
        var tree=tag("{id:'minecraft:zombie',Passengers:[{id:'minecraft:cat',Tags:['passenger_probe']}]}");
        EntitySchemaValidation.validate(tree,level,0);
        Entity vehicle=EntityType.loadEntityRecursive(net.minecraft.world.level.storage.TagValueInput.create(net.minecraft.util.ProblemReporter.DISCARDING,level.registryAccess(),tree),level,EntitySpawnReason.LOAD,e->e);
        check(vehicle!=null&&vehicle.getPassengers().size()==1,"recursive passenger loader attaches entity");
        check(EntitySchema.save(vehicle,access).getList("Passengers").orElseThrow().size()==1,"passenger compound re-saves");
        Path output=Path.of(args.length==0?"logs/entity-schema/details-client.json":args[0]);Files.createDirectories(output.toAbsolutePath().getParent());Files.writeString(output,new GsonBuilder().setPrettyPrinting().serializeNulls().create().toJson(captured));
        System.out.println("PASS "+assertions+" detailed assertions; client="+level.isClientSide());
    }
    private static void reject(CompoundTag tag,EntitySchemaTestLevel level,String path){
        try{EntitySchemaValidation.validate(tag,level,0);}catch(IllegalArgumentException expected){check(expected.getMessage().contains(path),"per-path reason "+expected.getMessage());System.out.println("REJECT "+expected.getMessage());return;}throw new AssertionError("accepted invalid "+tag);
    }
}
