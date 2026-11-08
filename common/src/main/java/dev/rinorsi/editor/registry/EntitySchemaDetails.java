package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import java.util.function.Consumer;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.ai.attributes.*;
import net.minecraft.world.level.Level;

/** Additive live-game schema. Strings bind serialization APIs, never option catalogs. */
final class EntitySchemaDetails {
    private EntitySchemaDetails() {}
    static void describe(Entity entity, Level level, HolderLookup.Provider lookup, JsonObject out) {
        JsonArray attributes=new JsonArray(), extras=new JsonArray();
        out.add("attributes",attributes);out.add("extras",extras);
        JsonArray warnings=out.getAsJsonArray("warnings");
        if(entity instanceof LivingEntity living) {
            for(var holder:BuiltInRegistries.ATTRIBUTE.listElements().toList()) {
                if(!living.getAttributes().hasAttribute(holder))continue;
                try {
                    Entity fresh=EntitySchema.create(entity.getType(),level);
                    var instance=((LivingEntity)fresh).getAttribute(holder);
                    double base=instance.getBaseValue();
                    if(DefaultAttributes.hasSupplier(entity.getType())) {
                        @SuppressWarnings("unchecked") var supplier=DefaultAttributes.getSupplier((EntityType<? extends LivingEntity>)entity.getType());
                        if(supplier.hasAttribute(holder))base=supplier.getBaseValue(holder);
                    }
                    instance.setBaseValue(base);
                    CompoundTag saved=EntitySchema.save(fresh,lookup);
                    var re=(LivingEntity)EntitySchema.load(entity.getType(),level,lookup,saved);
                    boolean roundtrip=re.getAttributeBaseValue(holder)==base;
                    if(roundtrip&&holder.value() instanceof RangedAttribute range){
                        double delta=Math.max(1,Math.abs(base)*0.1),candidate=Math.min(range.getMaxValue(),base+delta);
                        if(candidate==base)candidate=Math.max(range.getMinValue(),base-delta);
                        instance.setBaseValue(candidate);
                        var changed=(LivingEntity)EntitySchema.load(entity.getType(),level,lookup,EntitySchema.save(fresh,lookup));
                        roundtrip=changed.getAttributeBaseValue(holder)==candidate;
                    }
                    JsonObject row=new JsonObject();row.addProperty("id",holder.key().identifier().toString());
                    row.addProperty("label",holder.value().getDescriptionId());row.addProperty("base",base);
                    if(living.getAttributeBaseValue(holder)!=base)row.addProperty("effectiveDefaultBase",living.getAttributeBaseValue(holder));
                    boolean bounded=holder.value() instanceof RangedAttribute;
                    row.addProperty("common",bounded&&roundtrip);if(!bounded||!roundtrip)row.addProperty("advanced",true);
                    if(!roundtrip)row.addProperty("roundtrip",false);
                    if(!roundtrip)row.addProperty("reason","Entity loader recomputes this base from other saved state (e.g. slime Size); edit that state instead.");
                    if(holder.value() instanceof RangedAttribute range) {
                        row.addProperty("min",range.getMinValue());row.addProperty("max",range.getMaxValue());
                    }
                    JsonObject nbt=path("attributes");nbt.addProperty("idKey","id");nbt.addProperty("valueKey","base");nbt.addProperty("modifiersKey","modifiers");row.add("nbt",nbt);
                    attributes.add(row);
                    if(holder.is(Attributes.SCALE)) {
                        for(Tag entry:saved.getList("attributes").orElseThrow())if(entry instanceof CompoundTag compound&&compound.getString("id").orElse("").equals(holder.key().identifier().toString()))row.add("sample",EntitySchema.json(entry));
                        JsonObject scale=new JsonObject();scale.addProperty("attribute",holder.key().identifier().toString());
                        scale.addProperty("operation","multiply");scale.addProperty("baseline",living.getScale());
                        scale.addProperty("note","Multiply width, height and eyeHeight by effective scale / baseline; age, size and pose also affect dimensions.");out.getAsJsonObject("preview").add("scale",scale);
                    }
                }catch(RuntimeException ex){warnings.add("attribute "+holder.key().identifier()+": "+ex.getMessage());}
            }
            try {
                var effect=BuiltInRegistries.MOB_EFFECT.listElements().findFirst().orElseThrow();
                Tag encoded=MobEffectInstance.CODEC.encodeStart(lookup.createSerializationContext(NbtOps.INSTANCE),new MobEffectInstance(effect,200,1,true,false,true)).getOrThrow();
                CompoundTag input=EntitySchema.save(entity,lookup);ListTag list=new ListTag();list.add(encoded);input.put("active_effects",list);
                CompoundTag saved=EntitySchema.loadSave(entity.getType(),level,lookup,input);
                if(!(saved.get("active_effects") instanceof ListTag actual)||actual.isEmpty())throw new IllegalArgumentException("effects did not round-trip");
                JsonObject effects=path("active_effects");effects.add("nbt",path("active_effects"));effects.addProperty("common",true);effects.addProperty("registry","minecraft:mob_effect");
                effects.addProperty("codec","MobEffectInstance.CODEC");effects.add("sample",EntitySchema.json(actual));
                JsonObject amp=new JsonObject();amp.addProperty("min",MobEffectInstance.MIN_AMPLIFIER);amp.addProperty("max",MobEffectInstance.MAX_AMPLIFIER);effects.add("amplifier",amp);
                JsonObject duration=new JsonObject();duration.addProperty("infinite",MobEffectInstance.INFINITE_DURATION);duration.addProperty("controlMin",1);duration.addProperty("codecMin",Integer.MIN_VALUE);duration.addProperty("codecMax",Integer.MAX_VALUE);duration.addProperty("default",0);effects.add("duration",duration);
                effects.addProperty("shape","{id:string,amplifier?:int,duration?:int,ambient?:boolean,show_particles?:boolean,show_icon?:boolean,hidden_effect?:compound}");out.add("effects",effects);
                JsonArray normalization=new JsonArray();
                for(int value:new int[]{-1,0,1,255,256,Integer.MAX_VALUE,Integer.MIN_VALUE}){
                    CompoundTag candidate=(CompoundTag)encoded.copy();candidate.putInt("amplifier",value);candidate.putInt("duration",value);
                    JsonObject p=new JsonObject();p.addProperty("input",value);
                    try{var decoded=MobEffectInstance.CODEC.parse(lookup.createSerializationContext(NbtOps.INSTANCE),candidate).getOrThrow();p.addProperty("amplifier",decoded.getAmplifier());p.addProperty("duration",decoded.getDuration());}catch(RuntimeException ex){p.addProperty("error",ex.getMessage());}normalization.add(p);
                }effects.add("codecProbes",normalization);
            }catch(RuntimeException ex){warnings.add("effects: "+ex.getMessage());}
        }
        probe(entity,level,lookup,extras,warnings,"tags",x->x.addTag("schema_probe"));
        probe(entity,level,lookup,extras,warnings,"fire",x->x.setRemainingFireTicks(100));
        probe(entity,level,lookup,extras,warnings,"air",x->x.setAirSupply(100));
        if(entity instanceof TamableAnimal) {
            probe(entity,level,lookup,extras,warnings,"owner",x->{var tame=(TamableAnimal)x;tame.setOwnerReference(EntityReference.of(new UUID(1,2)));tame.setTame(true,false);});
            probe(entity,level,lookup,extras,warnings,"sitting",x->((TamableAnimal)x).setOrderedToSit(true));
            Entity tame=EntitySchema.create(entity.getType(),level);((TamableAnimal)tame).setOwnerReference(EntityReference.of(new UUID(1,2)));((TamableAnimal)tame).setTame(true,true);
            out.addProperty("tamed_sample_nbt",EntitySchema.save(tame,lookup).toString());
        }
        if(entity instanceof Mob mob) {
            mob.getLootTable().ifPresent(key->{
                CompoundTag input=EntitySchema.save(entity,lookup);input.putString("DeathLootTable",key.identifier().toString());input.putLong("DeathLootTableSeed",1);
                try{CompoundTag saved=EntitySchema.loadSave(entity.getType(),level,lookup,input);for(String field:List.of("DeathLootTable","DeathLootTableSeed"))if(Objects.equals(input.get(field),saved.get(field)))extras.add(field(field,saved.get(field)));}catch(RuntimeException ex){warnings.add("loot table: "+ex.getMessage());}
            });
        }
        if(entity instanceof net.minecraft.world.entity.monster.Creeper)probeInput(entity,level,lookup,extras,"powered",ByteTag.valueOf(true));
        if(entity instanceof net.minecraft.world.entity.npc.villager.AbstractVillager) {
            try{
                var item=BuiltInRegistries.ITEM.stream().filter(i->!i.getDefaultInstance().isEmpty()).findFirst().orElseThrow();
                var offers=new net.minecraft.world.item.trading.MerchantOffers();offers.add(new net.minecraft.world.item.trading.MerchantOffer(new net.minecraft.world.item.trading.ItemCost(item),item.getDefaultInstance(),1,1,0));
                var ops=lookup.createSerializationContext(NbtOps.INSTANCE);
                Tag encoded=net.minecraft.world.item.trading.MerchantOffers.CODEC.encodeStart(ops,offers).getOrThrow();
                CompoundTag input=EntitySchema.save(entity,lookup);input.put("Offers",encoded);Entity loaded=EntitySchema.load(entity.getType(),level,lookup,input);
                // AbstractVillager.getOffers requires actual ServerLevel even when offers are loaded;
                // read its real backing field only to verify the loader on a detached client entity.
                var f=net.minecraft.world.entity.npc.villager.AbstractVillager.class.getDeclaredField("offers");f.setAccessible(true);
                Tag re=net.minecraft.world.item.trading.MerchantOffers.CODEC.encodeStart(ops,(net.minecraft.world.item.trading.MerchantOffers)f.get(loaded)).getOrThrow();
                if(!encoded.equals(re))throw new IllegalArgumentException("Offers codec/load mismatch");
                JsonObject row=field("Offers",re);row.addProperty("present_by_default",false);
                boolean persisted=Objects.equals(re,EntitySchema.save(loaded,lookup).get("Offers"));row.addProperty("roundtrip",persisted);
                if(!persisted)row.addProperty("reason","Codec and entity load verified; client save deliberately omits Offers. ServerLevel save pending.");
                extras.add(row);
            }catch(ReflectiveOperationException | RuntimeException ex){warnings.add("offers: "+ex.getMessage());}
        }
        JsonObject pose=new JsonObject();Entity posed=EntitySchema.create(entity.getType(),level);CompoundTag poseBefore=EntitySchema.save(posed,lookup);posed.setPose(Pose.CROUCHING);CompoundTag poseAfter=EntitySchema.save(posed,lookup);
        pose.addProperty("supported",!EntitySchema.diff(poseBefore,poseAfter).isEmpty()&&EntitySchema.load(entity.getType(),level,lookup,poseAfter).getPose()==Pose.CROUCHING);pose.addProperty("advanced",true);pose.addProperty("reason","Entity pose is transient unless the entity serializer persists it; armor stand Pose is limb rotations.");out.add("pose",pose);
        if(entity instanceof net.minecraft.world.entity.monster.zombie.Zombie)
            probe(entity,level,lookup,extras,warnings,"can_break_doors",x->((net.minecraft.world.entity.monster.zombie.Zombie)x).setCanBreakDoors(true));
        // Numeric primitive fields are bounded empirically by loader storage conversion. A finite set
        // of samples is evidence, not proof of an exhaustive domain: expose these as advanced only.
        CompoundTag baseline=EntitySchema.save(entity,lookup);
        Set<String> variantRoots=new HashSet<>();
        out.getAsJsonArray("variants").forEach(v->variantRoots.add(v.getAsJsonObject().getAsJsonObject("nbt").getAsJsonArray("path").get(0).getAsString()));
        Set<String> commonRoots=new HashSet<>();out.getAsJsonArray("flags").forEach(f->{if(f.getAsJsonObject().get("common").getAsBoolean())commonRoots.add(f.getAsJsonObject().get("key").getAsString());});
        for(String key:baseline.keySet()) {
            if(commonRoots.contains(key)||variantRoots.contains(key))continue;
            // Existing flags already retain all raw default fields. Enrich numeric/compound
            // fields here without duplicating motion, position, inventory and equipment lists.
            if(!(baseline.get(key) instanceof NumericTag)&&!(baseline.get(key) instanceof CompoundTag))continue;
            JsonObject row=null;for(var raw:extras)if(raw.getAsJsonObject().get("key").getAsString().equals(key)){row=raw.getAsJsonObject();break;}
            boolean existing=row!=null;if(!existing){row=field(key,baseline.get(key));row.remove("sample");row.remove("sampleSnbt");row.remove("nbt");}
            row.addProperty("present_by_default",true);row.add("default",EntitySchema.json(baseline.get(key)));
            if(baseline.get(key) instanceof NumericTag) {
                JsonArray probes=new JsonArray();
                for(int n:new int[]{-1,0,1,Integer.MAX_VALUE,Integer.MIN_VALUE}) {
                    CompoundTag input=baseline.copy();input.putInt(key,n);JsonObject p=new JsonObject();p.addProperty("input",n);
                    try{Tag value=EntitySchema.loadSave(entity.getType(),level,lookup,input).get(key);p.add("saved",value==null?JsonNull.INSTANCE:EntitySchema.json(value));}catch(RuntimeException ex){p.addProperty("error",ex.getMessage());}probes.add(p);
                }row.add("probes",probes);
            }if(!existing)extras.add(row);
        }
        // Direct Entity.load does not restore passenger trees; EntityType.loadEntityRecursive does.
        // The allowed rider/vehicle relationship depends on world/state and cannot be a type catalog.
        JsonObject passengers=path("Passengers");passengers.addProperty("advanced",true);passengers.addProperty("common",false);passengers.addProperty("shape","list<entity compound with id; recursive Passengers>");passengers.addProperty("typeCompatibilitySupported",false);passengers.addProperty("reason","Riding acceptance depends on runtime state; direct entity load does not attach passengers.");out.add("passengers",passengers);
    }
    private static JsonObject path(String key){JsonObject out=new JsonObject();JsonArray path=new JsonArray();path.add(key);out.add("path",path);return out;}
    private static void probeInput(Entity entity,Level level,HolderLookup.Provider lookup,JsonArray extras,String key,Tag value){
        CompoundTag input=EntitySchema.save(entity,lookup);input.put(key,value);
        try{Tag saved=EntitySchema.loadSave(entity.getType(),level,lookup,input).get(key);if(Objects.equals(value,saved)){JsonObject row=field(key,saved);row.addProperty("present_by_default",false);extras.add(row);}}catch(RuntimeException ignored){/* no verified field, no control */}
    }
    private static JsonObject field(String key,Tag value){JsonObject row=new JsonObject();row.addProperty("key",key);row.addProperty("type",value.getType().getName());row.add("nbt",path(key));row.addProperty("common",false);row.addProperty("advanced",true);row.add("sample",EntitySchema.json(value));row.addProperty("sampleSnbt",value.toString());
        if(value instanceof ByteTag){row.addProperty("storageMin",Byte.MIN_VALUE);row.addProperty("storageMax",Byte.MAX_VALUE);}
        else if(value instanceof ShortTag){row.addProperty("storageMin",Short.MIN_VALUE);row.addProperty("storageMax",Short.MAX_VALUE);}
        else if(value instanceof IntTag){row.addProperty("storageMin",Integer.MIN_VALUE);row.addProperty("storageMax",Integer.MAX_VALUE);}
        return row;}
    private static void probe(Entity entity,Level level,HolderLookup.Provider lookup,JsonArray extras,JsonArray warnings,String id,Consumer<Entity> setter){
        try{Entity fresh=EntitySchema.create(entity.getType(),level);CompoundTag before=EntitySchema.save(fresh,lookup);setter.accept(fresh);CompoundTag after=EntitySchema.save(fresh,lookup);
            Set<String> roots=new LinkedHashSet<>();for(var path:EntitySchema.diff(before,after))roots.add(path.getFirst());
            for(String key:roots){Tag value=after.get(key);if(value==null)continue;CompoundTag edited=before.copy();edited.put(key,value.copy());Tag saved=EntitySchema.loadSave(entity.getType(),level,lookup,edited).get(key);if(!Objects.equals(value,saved))continue;JsonObject row=field(key,value);row.addProperty("id",id);row.addProperty("present_by_default",before.contains(key));extras.add(row);}
        }catch(RuntimeException ex){warnings.add(id+": "+ex.getMessage());}
    }
}
