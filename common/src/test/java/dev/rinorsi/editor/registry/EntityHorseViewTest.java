package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.animal.equine.*;
import net.minecraft.world.item.*;

/** Real factories and vanilla load/save only; no game/server started or entities ticked. */
public final class EntityHorseViewTest {
    private static RegistryAccess access;
    private static EntitySchemaTestLevel level;
    private static int checks;
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        access=EntitySchemaTest.access();bindEntityTags();level=new EntitySchemaTestLevel(access);
        for(var type:List.of(net.minecraft.world.entity.EntityTypes.HORSE,net.minecraft.world.entity.EntityTypes.DONKEY,net.minecraft.world.entity.EntityTypes.MULE,net.minecraft.world.entity.EntityTypes.SKELETON_HORSE,net.minecraft.world.entity.EntityTypes.ZOMBIE_HORSE,net.minecraft.world.entity.EntityTypes.LLAMA,net.minecraft.world.entity.EntityTypes.TRADER_LLAMA,net.minecraft.world.entity.EntityTypes.CAMEL)) {
            var horse=(AbstractHorse)EntitySchema.create(type,level);var before=save(horse);var view=EntityWorldEdit.views(horse,before,access).getAsJsonObject("horse");
            check(view.get("Temper").getAsInt()==horse.getTemper()&&view.get("Owner").isJsonNull(),"horse view "+type);
            var changed=edit(horse,"{horse:{Tame:true,Temper:2147483647}}");check(changed.getBoolean("Tame").orElseThrow()&&changed.getInt("Temper").orElseThrow()==Integer.MAX_VALUE,"taming int retained "+type);
            check(edit(horse,"{horse:{Temper:-2147483648}}").getInt("Temper").orElseThrow()==Integer.MIN_VALUE,"signed temper "+type);
            for(String bad:List.of("{Tame:null}","{Tame:1}","{Temper:null}","{Temper:1.5}","{Temper:2147483648}","{UUID:null}","{Owner:7}","{Owner:'1-1-1-1-1'}","{Owner:'00000000-0000-0000-0000-000000000001'}"))reject(()->edit(horse,"{horse:"+bad+"}"),"horse guard "+bad);
            var owner=UUID.randomUUID();var owned=before.copy();owned.put("Owner",EntityReference.<LivingEntity>codec().encodeStart(access.createSerializationContext(NbtOps.INSTANCE),EntityReference.of(owner)).getOrThrow());owned.putBoolean("Tame",true);EntityWorldEdit.load(horse,owned,access);
            check(edit(horse,"{horse:{Owner:'"+owner+"'}}").contains("Owner"),"offline old owner retained");
            var cleared=edit(horse,"{horse:{Owner:null}}");check(!cleared.contains("Owner")&&cleared.getBoolean("Tame").orElseThrow(),"owner clear preserves independent tame state");
            check(save(horse).equals(owned),"validation leaves live horse untouched");
            var schema=EntityWorldSchema.describe(horse,access);check(schema.has("horse"),"horse schema");
            for(var slot:List.of(EquipmentSlot.SADDLE,EquipmentSlot.BODY)) {
                var candidates=net.minecraft.core.registries.BuiltInRegistries.ITEM.stream().filter(item->horse.isEquippableInSlot(item.getDefaultInstance(),slot)).toList();
                if(horse.canUseSlot(slot)&&!candidates.isEmpty()) {
                    var data=new JsonObject();var rows=new JsonArray();var row=new JsonObject();row.addProperty("slot",slot.getSerializedName());row.add("stack",EntityWorldEdit.stack(candidates.getFirst().getDefaultInstance(),access));rows.add(row);data.add("equipment",rows);
                    var equipped=prepare(horse,save(horse),data);check(equipped.getCompound("equipment").orElseThrow().contains(slot.getSerializedName()),"actual equipment path "+slot);
                }
            }
            reject(()->edit(horse,"{equipment:[{slot:'body',stack:{id:'minecraft:stick',count:1,comps:{},removed:{}}}]}"),"incompatible horse armor");
        }
        var horse=EntitySchema.create(net.minecraft.world.entity.EntityTypes.HORSE,level);
        check(EntityWorldEdit.views(horse,save(horse),access).getAsJsonObject("horse").getAsJsonArray("equipment").get(0).getAsJsonObject().get("canHold").getAsBoolean()==((AbstractHorse)horse).canUseSlot(EquipmentSlot.SADDLE),"saddle availability follows actual subclass override");
        var saddled=edit(horse,"{horse:{Tame:true},equipment:[{slot:'saddle',stack:{id:'minecraft:saddle',count:1,comps:{},removed:{}}}]}");
        check(saddled.getCompound("equipment").orElseThrow().contains("saddle")&&!saddled.contains("SaddleItem"),"same request taming then actual saddle slot");
        EntityWorldEdit.load(horse,saddled,access);var unequipped=edit(horse,"{equipment:[{slot:'saddle',stack:{empty:true}}]}");
        check(!unequipped.getCompound("equipment").orElseGet(CompoundTag::new).contains("saddle"),"saddle clear retained");
        reject(()->edit(horse,"{chested:{ChestedHorse:true}}"),"nonchested horse");
        var zombie=EntitySchema.create(net.minecraft.world.entity.EntityTypes.ZOMBIE,level);reject(()->edit(zombie,"{horse:{Tame:true}}"),"wrong horse entity");reject(()->edit(zombie,"{chested:{Items:[]}}"),"wrong chest entity");
        for(var type:List.of(net.minecraft.world.entity.EntityTypes.DONKEY,net.minecraft.world.entity.EntityTypes.MULE,net.minecraft.world.entity.EntityTypes.LLAMA,net.minecraft.world.entity.EntityTypes.TRADER_LLAMA)) {
            var chest=(AbstractChestedHorse)EntitySchema.create(type,level);var enabled=edit(chest,"{chested:{ChestedHorse:true}}");EntityWorldEdit.load(chest,enabled,access);
            int capacity=chest.getInventorySize();check(capacity>0,"real storage capacity");
            var full=edit(chest,"{chested:{Items:["+row(capacity-1)+"]}}");EntityWorldEdit.load(chest,full,access);
            var view=EntityWorldEdit.views(chest,full,access).getAsJsonObject("chested");check(view.get("capacity").getAsInt()==capacity&&view.getAsJsonArray("Items").size()==1,"storage boundary read");
            check(view.getAsJsonArray("Items").get(0).getAsJsonObject().getAsJsonObject("stack").getAsJsonObject("comps").has("custom_name"),"full StackCodec patch retained");
            for(String bad:List.of("{Items:["+row(capacity)+"]}","{Items:["+row(-1)+"]}","{Items:["+row(0)+","+row(0)+"]}","{Items:null}","{ChestedHorse:null}","{capacity:3}","{ChestedHorse:false}","{Items:[{slot:0,stack:{empty:true}}]}"))reject(()->edit(chest,"{chested:"+bad+"}"),"storage guard "+bad);
            var removed=edit(chest,"{chested:{ChestedHorse:false,Items:[]}}");check(!removed.contains("Items")&&!removed.getBoolean("ChestedHorse").orElseThrow(),"explicit chest clear");
            if(chest instanceof Llama) {
                var larger=save(chest);larger.putInt("Strength",5);var increased=prepare(chest,larger,json("{chested:{Items:["+row(14)+"]}}"));EntityWorldEdit.load(chest,increased,access);check(chest.getInventorySize()==15,"strength expands inventory before item validation");
                var smaller=save(chest);smaller.putInt("Strength",1);reject(()->prepare(chest,smaller,json("{}")),"strength shrink cannot silently drop contents");
                var reduced=prepare(chest,smaller,json("{chested:{Items:["+row(2)+"]}}"));EntityWorldEdit.load(chest,reduced,access);check(chest.getInventorySize()==3,"strength shrink with replacement succeeds");
                reject(()->edit(chest,"{chested:{Items:["+row(3)+"]}}"),"strength capacity bound");
                var schema=EntitySchema.describe(type,level,access);check(hasVariant(schema,"llama/strength")&&hasVariant(schema,"minecraft:llama/variant"),"existing llama schema reused");
            }
        }
        var schema=EntitySchema.describe(net.minecraft.world.entity.EntityTypes.HORSE,level,access);check(hasVariant(schema,"horse/markings")&&hasVariant(schema,"minecraft:horse/variant"),"existing packed horse schema reused");
        System.out.println("PASS EntityHorseViewTest "+checks+" checks; detached vanilla factories/codecs only");
    }
    private static void bindEntityTags() throws Exception {
        // Datagen fixtures leave tag memberships empty. Equipment restrictions must use
        // the dependency's real entity_type tags, not a hand-written horse allowlist.
        var registry=net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE;
        var key=net.minecraft.core.registries.Registries.ENTITY_TYPE;
        var files=new LinkedHashMap<net.minecraft.resources.Identifier,List<net.minecraft.tags.TagLoader.EntryWithSource>>();
        String prefix="data/minecraft/tags/entity_type/";
        var location=EntityType.class.getProtectionDomain().getCodeSource().getLocation().toURI();
        try(var zip=new java.util.zip.ZipFile(new java.io.File(location))) {
            var entries=zip.entries();while(entries.hasMoreElements()) {
                var entry=entries.nextElement();String name=entry.getName();if(!name.startsWith(prefix)||!name.endsWith(".json"))continue;
                try(var reader=new java.io.InputStreamReader(zip.getInputStream(entry),java.nio.charset.StandardCharsets.UTF_8)) {
                    var tag=net.minecraft.tags.TagFile.CODEC.parse(com.mojang.serialization.JsonOps.INSTANCE,JsonParser.parseReader(reader)).getOrThrow();
                    files.put(net.minecraft.resources.Identifier.withDefaultNamespace(name.substring(prefix.length(),name.length()-5)),tag.entries().stream().map(e->new net.minecraft.tags.TagLoader.EntryWithSource(e,"vanilla-jar")).toList());
                }
            }
        }
        check(!files.isEmpty(),"actual shipped entity tags loaded");
        var loader=new net.minecraft.tags.TagLoader<net.minecraft.core.Holder<EntityType<?>>>((id,required)->registry.get(net.minecraft.resources.ResourceKey.create(key,id)),"tags/entity_type");
        var tags=new LinkedHashMap<net.minecraft.tags.TagKey<EntityType<?>>,List<net.minecraft.core.Holder<EntityType<?>>>>();
        loader.build(files).forEach((id,holders)->tags.put(net.minecraft.tags.TagKey.create(key,id),holders));
        registry.prepareTagReload(new net.minecraft.tags.TagLoader.LoadResult<>(key,tags)).apply();
    }
    private static boolean hasVariant(JsonObject schema,String id){return schema.getAsJsonArray("variants").asList().stream().anyMatch(raw->raw.getAsJsonObject().get("id").getAsString().equals(id));}
    private static String row(int slot){return "{slot:"+slot+",stack:{id:'minecraft:diamond',count:2,comps:{custom_name:{text:'Cargo'}},removed:{}}}";}
    private static JsonObject json(String text){return JsonParser.parseString(text).getAsJsonObject();}
    private static CompoundTag save(Entity entity){return WorldTarget.saveEntity(entity,access);}
    private static CompoundTag edit(Entity entity,String data){return prepare(entity,save(entity),json(data));}
    private static CompoundTag prepare(Entity entity,CompoundTag input,JsonObject data){return EntityWorldEdit.prepare(entity,input,data,level,access);}
    private static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);checks++;}
    private static void reject(Runnable action,String label){try{action.run();}catch(RuntimeException expected){checks++;return;}throw new AssertionError("Expected rejection: "+label);}
}
