package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.Lifecycle;
import java.nio.file.*;
import java.util.*;
import net.minecraft.SharedConstants;
import net.minecraft.core.*;
import net.minecraft.core.registries.*;
import net.minecraft.resources.*;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.entity.*;
import net.minecraft.nbt.*;

/** Actual factories, component setters, ValueInput/Output; no graphical or dedicated-server process. */
public final class EntitySchemaTest {
    private static int assertions,options;
    @SuppressWarnings({"rawtypes","unchecked"})
    static RegistryAccess access(){
        var provider=net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(provider).forEach(p->p.apply());
        Map<ResourceKey<?>,Registry<?>> registries=new HashMap<>();
        RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY).registries().forEach(e->registries.put(e.key(),e.value()));
        provider.listRegistryKeys().forEach(key->{if(registries.containsKey(key))return;MappedRegistry registry=new MappedRegistry(key,Lifecycle.stable());provider.lookupOrThrow((ResourceKey)key).listElements().forEach(raw->{var h=(Holder.Reference)raw;registry.register(h.key(),registry.getKey(h.value()) == null ? h.value() : copyAliasedRecord(h.value()),RegistrationInfo.BUILT_IN);});registry.freeze();registries.put(key,registry);});
        return new RegistryAccess(){public <T> Optional<Registry<T>> lookup(ResourceKey<? extends Registry<? extends T>> key){return Optional.ofNullable((Registry<T>)registries.get(key));}public java.util.stream.Stream<RegistryEntry<?>> registries(){return registries.entrySet().stream().map(e->new RegistryEntry((ResourceKey)e.getKey(),e.getValue()));}};
    }
    // 26.3 bootstrap lookups reuse record instances for aliases; a real registry needs unique identities.
    private static Object copyAliasedRecord(Object value) {
        try {
            var parts = value.getClass().getRecordComponents();
            if (parts == null) throw new IllegalStateException("Aliased non-record registry value: " + value);
            Class<?>[] types = new Class<?>[parts.length]; Object[] args = new Object[parts.length];
            for (int i=0;i<parts.length;i++) { types[i]=parts[i].getType(); args[i]=parts[i].getAccessor().invoke(value); }
            return value.getClass().getDeclaredConstructor(types).newInstance(args);
        } catch (ReflectiveOperationException error) { throw new IllegalStateException("Cannot copy bootstrap alias", error); }
    }
    public static void main(String[] args)throws Exception{
        SharedConstants.tryDetectVersion();Bootstrap.bootStrap();var access=access();var level=new EntitySchemaTestLevel(access,Boolean.parseBoolean(System.getProperty("cadeditor.schema.client","true")));
        JsonObject captured=new JsonObject();
        for(String id:List.of("cat","wolf","horse","llama","parrot","rabbit","fox","axolotl","sheep","villager","zombie_villager","slime","creeper","armor_stand","tropical_fish","pig","chicken","frog","zombie","mooshroom","item")){
            EntityType<?> type=BuiltInRegistries.ENTITY_TYPE.getOptional(Identifier.parse("minecraft:"+id)).orElseThrow();
            if(!level.isClientSide()&&type==net.minecraft.world.entity.EntityTypes.VILLAGER){System.out.println("SKIP server-side villager: trade offer generation needs an actual ServerLevel, client-side factory covered separately");continue;}
            EntitySchema.save(EntitySchema.create(type,level),access);
            JsonObject schema=EntitySchemaValidation.schema("minecraft:"+id,level);captured.add(id,schema);
            check(schema.get("available").getAsBoolean(),"factory/schema "+id+": "+schema);
            if(!List.of("slime","creeper","armor_stand","zombie","item").contains(id))check(!schema.getAsJsonArray("variants").isEmpty(),"variants present "+id+": "+schema.get("warnings"));
            for(var raw:schema.getAsJsonArray("variants")){var variant=raw.getAsJsonObject();List<String> path=new ArrayList<>();variant.getAsJsonObject("nbt").getAsJsonArray("path").forEach(p->path.add(p.getAsString()));
                for(var option:variant.getAsJsonArray("options")){CompoundTag tag=new CompoundTag();tag.putString("id","minecraft:"+id);Tag value=TagParser.parseCompoundFully("{value:"+option.getAsJsonObject().get("snbt").getAsString()+"}").get("value");EntitySchema.put(tag,path,value);CompoundTag saved=EntitySchema.loadSave(type,level,access,tag);check(Objects.equals(value,EntitySchema.get(saved,path)),id+"/"+variant.get("id")+" roundtrip "+option);EntitySchemaValidation.validate(tag,level,0);options++;}
            }
            Map<List<String>,List<JsonObject>> packed=new HashMap<>();for(var raw:schema.getAsJsonArray("variants")){var v=raw.getAsJsonObject();if(v.getAsJsonObject("nbt").has("mask"))packed.computeIfAbsent(EntitySchemaValidation.path(v.getAsJsonObject("nbt").getAsJsonArray("path")),k->new ArrayList<>()).add(v);}
            for(var entry:packed.entrySet())if(entry.getValue().size()>1){int combined=entry.getValue().getFirst().get("default").getAsInt();for(var variant:entry.getValue()){int mask=variant.getAsJsonObject("nbt").get("mask").getAsInt();int value=variant.getAsJsonArray("options").asList().getLast().getAsJsonObject().get("value").getAsInt();combined=(combined&~mask)|(value&mask);}CompoundTag tag=TagParser.parseCompoundFully("{id:'minecraft:"+id+"'}");EntitySchema.put(tag,entry.getKey(),IntTag.valueOf(combined));EntitySchemaValidation.validate(tag,level,0);assertions++;}
            for(var flag:schema.getAsJsonArray("flags")){JsonObject f=flag.getAsJsonObject();if(!f.get("common").getAsBoolean())continue;CompoundTag tag=TagParser.parseCompoundFully("{id:'minecraft:"+id+"',"+f.get("key").getAsString()+":"+f.get("enabledSnbt").getAsString()+"}");EntitySchemaValidation.validate(tag,level,0);assertions++;}
            for(var equipment:schema.getAsJsonArray("equipment")){var slot=equipment.getAsJsonObject();List<String> path=EntitySchemaValidation.path(slot.getAsJsonArray("nbtPath"));CompoundTag tag=TagParser.parseCompoundFully("{id:'minecraft:"+id+"'}");if(slot.has("requiresSnbt"))tag.merge(TagParser.parseCompoundFully(slot.get("requiresSnbt").getAsString()));var item=BuiltInRegistries.ITEM.stream().filter(i->!i.getDefaultInstance().isEmpty()).findFirst().orElseThrow();var value=net.minecraft.world.item.ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),item.getDefaultInstance()).getOrThrow();EntitySchema.put(tag,path,value);EntitySchemaValidation.validate(tag,level,0);assertions++;}
            System.out.println(id+" variants="+schema.getAsJsonArray("variants").size()+" equipment="+schema.getAsJsonArray("equipment").size()+" warnings="+schema.get("warnings"));
        }
        applyChecks(level,access);
        var playerSchema=EntitySchema.describe(net.minecraft.world.entity.EntityTypes.PLAYER,level,access);check(playerSchema.get("available").getAsBoolean()&&!playerSchema.get("canBePreviewed").getAsBoolean()&&playerSchema.getAsJsonArray("attributes").size()>0,"player schema uses Player.createAttributes without a factory");
        Path output=Path.of(args.length==0?"logs/entity-schema/captured.json":args[0]);Files.createDirectories(output.toAbsolutePath().getParent());Files.writeString(output,new GsonBuilder().serializeNulls().setPrettyPrinting().create().toJson(captured));
        System.out.println("PASS "+assertions+" assertions; "+options+" empirical variant option egg load/save checks; "+captured.size()+" entity factories; level.isClientSide="+level.isClientSide()+"; no client/server started");
    }
    static void check(boolean b,String label){assertions++;if(!b)throw new AssertionError(label);}
    private static void applyChecks(EntitySchemaTestLevel level,RegistryAccess access){
        for(String snbt:List.of("{id:'minecraft:cat',variant:'minecraft:tabby',CollarColor:5,NoAI:1,Silent:1}","{id:'minecraft:sheep',Color:14,Age:-24000,Health:4f}","{id:'minecraft:zombie',IsBaby:1,equipment:{mainhand:{id:'minecraft:diamond_sword',count:1}}}","{id:'minecraft:armor_stand',NoGravity:1,CustomName:{text:'Hello'},ShowArms:1,equipment:{offhand:{id:'minecraft:stick',count:1}}}","{id:'minecraft:slime',Size:4,Health:20f}")){apply(snbt,level,access);assertions++;System.out.println("apply "+snbt+" -> accepted; real load/save stable");}
        for(String snbt:List.of("{id:'minecraft:cat',variant:'cadeditor:missing'}","{id:'minecraft:sheep',Color:400}","{id:'minecraft:zombie',NoAI:7}","{id:'minecraft:cat',Health:99999f}","{id:'minecraft:zombie',equipment:{mainhand:{id:'cadeditor:missing',count:1}}}")){try{apply(snbt,level,access);}catch(RuntimeException expected){assertions++;check(expected.getMessage()!=null&&!expected.getMessage().isBlank(),"readable invalid_request");System.out.println("apply "+snbt+" -> invalid_request: "+expected.getMessage());continue;}throw new AssertionError("accepted invalid payload "+snbt);}
        String block="{id:'minecraft:mob_spawner',SpawnData:{entity:{id:'minecraft:cat',variant:'minecraft:tabby',NoAI:1}}}";applyBlock(block,level,access);assertions++;
        try{applyBlock(block.replace("minecraft:tabby","cadeditor:missing"),level,access);throw new AssertionError("accepted invalid nested spawner variant");}catch(IllegalArgumentException expected){assertions++;System.out.println("nested spawner invalid variant -> invalid_request: "+expected.getMessage());}
        try{applyBlock(block.replace("id:'minecraft:cat',",""),level,access);throw new AssertionError("accepted nonempty spawn entity without id");}catch(IllegalArgumentException expected){assertions++;System.out.println("nested nonempty spawn entity without id -> invalid_request: "+expected.getMessage());}
        String trial="{id:'minecraft:trial_spawner',normal_config:{spawn_potentials:[{data:{entity:{id:'minecraft:sheep',Color:14}},weight:1}]}}";applyBlock(trial,level,access);assertions++;
        try{applyBlock(trial.replace("Color:14","Color:400"),level,access);throw new AssertionError("accepted invalid nested trial variant");}catch(IllegalArgumentException expected){assertions++;System.out.println("nested trial invalid variant -> invalid_request: "+expected.getMessage());}
    }
    private static void applyBlock(String snbt,EntitySchemaTestLevel level,RegistryAccess access){JsonObject request=new JsonObject();request.addProperty("id",snbt.contains("minecraft:trial_spawner")?"minecraft:trial_spawner":"minecraft:spawner");request.addProperty("count",1);JsonObject components=new JsonObject();components.addProperty("block_entity_data",snbt);request.add("comps",components);request.add("removed",new JsonObject());JsonObject formats=new JsonObject();formats.addProperty("block_entity_data","snbt");request.add("component_formats",formats);var next=dev.rinorsi.editor.StackCodec.decode(request,access);EntitySchemaValidation.validateStack(next,level);}
    private static void apply(String snbt,EntitySchemaTestLevel level,RegistryAccess access){JsonObject request=new JsonObject();request.addProperty("id","minecraft:cat_spawn_egg");request.addProperty("count",1);JsonObject components=new JsonObject();components.addProperty("entity_data",snbt);request.add("comps",components);request.add("removed",new JsonObject());JsonObject formats=new JsonObject();formats.addProperty("entity_data","snbt");request.add("component_formats",formats);var original=new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.CAT_SPAWN_EGG);var next=dev.rinorsi.editor.StackCodec.decode(request,access,original);EntitySchemaValidation.validateStack(next,level);}
}
