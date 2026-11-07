package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.util.*;
import java.util.function.Consumer;
import net.minecraft.core.*;
import net.minecraft.core.component.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.network.chat.Component;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.animal.equine.*;
import net.minecraft.world.entity.npc.villager.*;
import net.minecraft.world.item.*;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.*;

/** Empirical schema: mutate a factory entity, save, diff, then verify with a fresh factory/load/save.
 * No entity is added, spawned, finalized or ticked. Values are never a baked variant/colour table. */
public final class EntitySchema {
    private EntitySchema() {}
    public static Entity create(EntityType<?> type, Level level) {
        Entity e=type.create(level,EntitySpawnReason.LOAD);
        if(e==null)throw new IllegalArgumentException("实体工厂不可用: "+BuiltInRegistries.ENTITY_TYPE.getKey(type));
        // Constructors can contain pre-load sentinel values (e.g. llama strength 0, slime attributes).
        // Normalize through the official loader before measuring defaults and effective health limits.
        Problems problems=new Problems();e.load(TagValueInput.create(problems,level.registryAccess(),save(e,level.registryAccess())));problems.check();
        return e;
    }
    public static CompoundTag save(Entity e, HolderLookup.Provider lookup) {
        Problems problems=new Problems();var out=TagValueOutput.createWithContext(problems,lookup);
        e.saveWithoutId(out);problems.check();var tag=out.buildResult();tag.remove(Entity.TAG_UUID);
        tag.putString(Entity.TAG_ID,BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString());return tag;
    }
    public static CompoundTag loadSave(EntityType<?> type,Level level,HolderLookup.Provider lookup,CompoundTag tag) {
        return save(load(type,level,lookup,tag),lookup);
    }
    public static Entity load(EntityType<?> type,Level level,HolderLookup.Provider lookup,CompoundTag tag) {
        Entity e=create(type,level);Problems problems=new Problems();
        // Vanilla skips attributes on ClientLevel (normally synchronized by the server). These
        // detached preview/validation entities need the same Packed codec + AttributeMap.apply
        // before load so Health and dimensions see the authoritative bases, without world mutation.
        if(level.isClientSide()&&e instanceof LivingEntity living&&tag.contains("attributes"))
            living.getAttributes().apply(net.minecraft.world.entity.ai.attributes.AttributeInstance.Packed.LIST_CODEC.parse(lookup.createSerializationContext(NbtOps.INSTANCE),tag.get("attributes")).getOrThrow());
        e.load(TagValueInput.create(problems,lookup,tag));problems.check();
        e.refreshDimensions();return e;
    }
    public static JsonObject describe(EntityType<?> type,Level level,HolderLookup.Provider lookup) {
        if(type==EntityType.PLAYER)return dev.rinorsi.editor.world.PlayerWorldEdit.entitySchema();
        JsonObject out=new JsonObject();out.addProperty("id",BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
        JsonArray variants=new JsonArray(),equipment=new JsonArray(),flags=new JsonArray(),warnings=new JsonArray();
        out.add("variants",variants);out.add("equipment",equipment);out.add("flags",flags);out.add("warnings",warnings);
        var dim=type.getDimensions();JsonObject preview=new JsonObject();preview.addProperty("width",dim.width());preview.addProperty("height",dim.height());preview.addProperty("eyeHeight",dim.eyeHeight());out.add("preview",preview);
        Entity e;CompoundTag baseline;
        try {e=create(type,level);baseline=save(e,lookup);}catch(RuntimeException | LinkageError error){out.addProperty("canBePreviewed",false);out.addProperty("available",false);warnings.add(error.toString());return out;}
        out.addProperty("available",true);out.addProperty("canBePreviewed",true);out.addProperty("defaults_source","factory-load-save");out.addProperty("default_nbt",baseline.toString());
        // Only registered, serializable components actually exposed by this entity are candidates.
        for(DataComponentType<?> component:BuiltInRegistries.DATA_COMPONENT_TYPE)try{component(e,component,lookup,level,variants);}catch(RuntimeException | LinkageError ex){warnings.add(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component)+": "+ex.getMessage());}
        try {extras(e,lookup,level,variants);}catch(RuntimeException | LinkageError ex){warnings.add("additional variants: "+ex.getMessage());}
        // Discover optional boolean keys through their real setters; no guessed NBT names or values.
        common(e,lookup,level,flags,warnings,"silent",x->x.setSilent(!x.isSilent()));
        common(e,lookup,level,flags,warnings,"invulnerable",x->x.setInvulnerable(!x.isInvulnerable()));
        common(e,lookup,level,flags,warnings,"no_gravity",x->x.setNoGravity(!x.isNoGravity()));
        common(e,lookup,level,flags,warnings,"glowing",x->x.setGlowingTag(!x.hasGlowingTag()));
        common(e,lookup,level,flags,warnings,"custom_name_visible",x->x.setCustomNameVisible(!x.isCustomNameVisible()));
        common(e,lookup,level,flags,warnings,"custom_name",x->x.setCustomName(Component.literal("schema probe")));
        if(e instanceof Mob) {
            common(e,lookup,level,flags,warnings,"left_handed",x->((Mob)x).setLeftHanded(!((Mob)x).isLeftHanded()));
            common(e,lookup,level,flags,warnings,"can_pick_up_loot",x->((Mob)x).setCanPickUpLoot(!((Mob)x).canPickUpLoot()));
            common(e,lookup,level,flags,warnings,"no_ai",x->{Mob m=(Mob)x;m.setNoAi(!m.isNoAi());});
            common(e,lookup,level,flags,warnings,"persistence",x->((Mob)x).setPersistenceRequired());
        }
        if(e instanceof LivingEntity living){
            common(e,lookup,level,flags,warnings,"health",x->((LivingEntity)x).setHealth(((LivingEntity)x).getMaxHealth()/2));
            for(var f:flags)if(f.getAsJsonObject().get("id").getAsString().equals("health")){f.getAsJsonObject().addProperty("min",0);f.getAsJsonObject().addProperty("max",living.getMaxHealth());f.getAsJsonObject().addProperty("max_scope","default_entity; apply recomputes after variant/attributes load");}
            Item sentinel=BuiltInRegistries.ITEM.stream().filter(i->!i.getDefaultInstance().isEmpty()).findFirst().orElseThrow();
            for(EquipmentSlot slot:EquipmentSlot.values())try{
                boolean canHold=living.canUseSlot(slot);Entity fresh=create(type,level);CompoundTag requires=null;
                if(!canHold){if(fresh instanceof net.minecraft.world.entity.decoration.ArmorStand stand){CompoundTag beforeArms=save(fresh,lookup);stand.setShowArms(true);if(!stand.canUseSlot(slot))continue;requires=new CompoundTag();CompoundTag afterArms=save(fresh,lookup);for(var p:diff(beforeArms,afterArms))put(requires,p,get(afterArms,p).copy());}else continue;}
                CompoundTag before=save(fresh,lookup);((LivingEntity)fresh).setItemSlot(slot,new ItemStack(sentinel));
                CompoundTag after=save(fresh,lookup);List<List<String>> changes=diff(before,after);
                // Find the actual item compound, rather than assuming equipment/mainhand naming.
                for(List<String> path:changes){List<String> itemPath=new ArrayList<>(path);if(!itemPath.isEmpty()&&itemPath.getLast().equals("id"))itemPath.removeLast();
                    Tag item=get(after,itemPath);if(!(item instanceof CompoundTag compound)||!compound.getString("id").orElse("").equals(BuiltInRegistries.ITEM.getKey(sentinel).toString()))continue;
                    JsonObject row=new JsonObject();row.addProperty("slot",slot.getSerializedName());row.add("nbtPath",jsonPath(itemPath));row.addProperty("canHold",canHold);if(requires!=null){row.add("requires",json(requires));row.addProperty("requiresSnbt",requires.toString());}
                    if(fresh instanceof Mob mob){row.addProperty("dropChance",mob.getDropChances().byEquipment(slot));CompoundTag beforeDrop=save(fresh,lookup);mob.setGuaranteedDrop(slot);CompoundTag afterDrop=save(fresh,lookup);for(var dp:diff(beforeDrop,afterDrop))if(get(afterDrop,dp)instanceof NumericTag){row.add("dropChancePath",jsonPath(dp));break;}}
                    equipment.add(row);break;
                }
            }catch(RuntimeException | LinkageError ex){warnings.add("equipment "+slot+": "+ex.getMessage());}
        }
        if(e instanceof AgeableMob){common(e,lookup,level,flags,warnings,"baby",x->((AgeableMob)x).setBaby(true));for(var raw:flags){var f=raw.getAsJsonObject();if(f.has("id")&&f.get("id").getAsString().equals("baby")){try{f.addProperty("babyAge",ageValue(e,level,true));f.addProperty("adultAge",ageValue(e,level,false));}catch(RuntimeException ex){warnings.add("age: "+ex.getMessage());}f.addProperty("roundtrip",level.isClientSide()?"baby-sign-only":"exact");}}}
        else if(e instanceof net.minecraft.world.entity.monster.zombie.Zombie)common(e,lookup,level,flags,warnings,"baby",x->((net.minecraft.world.entity.monster.zombie.Zombie)x).setBaby(true));
        if(e instanceof net.minecraft.world.entity.decoration.ArmorStand)common(e,lookup,level,flags,warnings,"show_arms",x->((net.minecraft.world.entity.decoration.ArmorStand)x).setShowArms(true));
        // Preserve generic fields from mod/default saves without claiming unknown semantics.
        Set<String> commonKeys=new HashSet<>();for(var f:flags)commonKeys.add(f.getAsJsonObject().get("key").getAsString());
        for(String key:baseline.keySet())if(!commonKeys.contains(key)){JsonObject f=field(key,baseline.get(key),true);f.addProperty("common",false);f.addProperty("advanced",true);flags.add(f);}
        EntitySchemaDetails.describe(e,level,lookup,out);
        out.add("views",dev.rinorsi.editor.world.EntityWorldSchema.describe(e,level.registryAccess()));
        return out;
    }
    private static <T> void component(Entity e,DataComponentType<T> component,HolderLookup.Provider lookup,Level level,JsonArray out){
        T original=e.get(component);if(original==null||component.codec()==null)return;
        List<T> values=new ArrayList<>();String kind,registry=null;
        if(original instanceof Holder<?> holder&&holder.unwrapKey().isPresent()){kind="holder";var key=holder.unwrapKey().orElseThrow().registryKey();registry=key.identifier().toString();
            @SuppressWarnings({"rawtypes","unchecked"}) var holders=lookup.lookupOrThrow((net.minecraft.resources.ResourceKey)key);
            holders.listElements().limit(257).forEach(h->{@SuppressWarnings("unchecked") T value=(T)h;values.add(value);});
        }else if(original instanceof Enum<?> choice){kind="enum";for(Object c:choice.getDeclaringClass().getEnumConstants()){@SuppressWarnings("unchecked")T value=(T)c;values.add(value);}}else if(original instanceof Boolean){kind="bool";for(boolean b:new boolean[]{false,true}){@SuppressWarnings("unchecked")T value=(T)Boolean.valueOf(b);values.add(value);}}else return;
        if(values.size()>256)throw new IllegalArgumentException("变种选项超过单实体探测预算256；请使用原始NBT，不返回截断选择器");
        List<Choice> choices=new ArrayList<>();for(T value:values){JsonElement label=component.codec().encodeStart(lookup.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow();choices.add(new Choice(label.isJsonPrimitive()?label.getAsString():label.toString(),x->x.setComponent(component,value),x->Objects.equals(x.get(component),value)));}
        JsonObject row=variant(e,lookup,level,BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component).toString(),kind,choices);if(row!=null){if(registry!=null)row.addProperty("registry",registry);out.add(row);}
    }
    private record Choice(String label,Consumer<Entity> setter,java.util.function.Predicate<Entity> check){Choice(String label,Consumer<Entity> setter){this(label,setter,e->true);}}
    private static JsonObject variant(Entity e,HolderLookup.Provider lookup,Level level,String id,String kind,List<Choice> choices){
        CompoundTag baseline=save(e,lookup);List<CompoundTag> samples=new ArrayList<>();List<String> path=null;Map<List<String>,Integer> frequency=new LinkedHashMap<>();
        for(Choice choice:choices){Entity fresh=create(e.getType(),level);CompoundTag before=save(fresh,lookup);choice.setter.accept(fresh);if(!choice.check.test(fresh))return null;CompoundTag saved=save(fresh,lookup);samples.add(saved);
            for(List<String> p:diff(before,saved))if(!p.getFirst().equals("attributes"))frequency.merge(p,1,Integer::sum);
        }
        path=frequency.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);
        if(path==null)return null;
        JsonArray options=new JsonArray();long mask=0;Tag defaultTag=get(baseline,path);
        for(int i=0;i<choices.size();i++){Tag stored=get(samples.get(i),path);if(stored==null)return null;
            CompoundTag input=baseline.copy();put(input,path,stored.copy());Entity loaded=load(e.getType(),level,lookup,input);CompoundTag re=save(loaded,lookup);if(!Objects.equals(stored,get(re,path))||!choices.get(i).check.test(loaded))return null;
            JsonObject option=new JsonObject();option.add("value",json(stored));option.addProperty("snbt",stored.toString());option.addProperty("label",choices.get(i).label);options.add(option);
            if(stored instanceof NumericTag n&&defaultTag instanceof NumericTag d)mask|=n.longValue()^d.longValue();
        }
        JsonObject row=new JsonObject();row.addProperty("id",id);row.addProperty("label",id);row.addProperty("kind",kind);JsonObject nbt=new JsonObject();nbt.add("path",jsonPath(path));nbt.addProperty("valueFormat","snbt");if(mask!=0)nbt.addProperty("mask",mask);row.add("nbt",nbt);row.add("default",defaultTag==null?JsonNull.INSTANCE:json(defaultTag));row.add("options",options);return row;
    }
    private static void extras(Entity e,HolderLookup.Provider lookup,Level level,JsonArray out){
        if(e instanceof Horse horse){List<Choice> options=new ArrayList<>();for(Markings marking:Markings.values())options.add(new Choice(marking.name().toLowerCase(java.util.Locale.ROOT),x->{try{var m=Horse.class.getDeclaredMethod("setVariantAndMarkings",Variant.class,Markings.class);m.setAccessible(true);m.invoke(x,((Horse)x).getVariant(),marking);}catch(ReflectiveOperationException ex){throw new IllegalStateException(ex);}}));add(out,variant(e,lookup,level,"horse/markings","enum",options));}
        if(e instanceof VillagerDataHolder holder){List<Choice> options=new ArrayList<>();lookup.lookupOrThrow(net.minecraft.core.registries.Registries.VILLAGER_PROFESSION).listElements().forEach(h->options.add(new Choice(h.key().identifier().toString(),x->{VillagerDataHolder v=(VillagerDataHolder)x;v.setVillagerData(v.getVillagerData().withProfession(h));})));add(out,variant(e,lookup,level,"villager/profession","holder",options));}
        if(e instanceof VillagerDataHolder){List<Choice> choices=new ArrayList<>();for(int i=VillagerData.MIN_VILLAGER_LEVEL;i<=VillagerData.MAX_VILLAGER_LEVEL;i++){int n=i;choices.add(new Choice(Integer.toString(n),x->{var v=(VillagerDataHolder)x;v.setVillagerData(v.getVillagerData().withLevel(n));}));}add(out,variant(e,lookup,level,"villager/level","int",choices));}
        if(e instanceof Llama)bounded(e,lookup,level,out,"llama/strength",x->((Llama)x).getStrength(),(x,n)->{try{var m=Llama.class.getDeclaredMethod("setStrength",int.class);m.setAccessible(true);m.invoke(x,n);}catch(ReflectiveOperationException ex){throw new IllegalStateException(ex);}});
        if(e instanceof net.minecraft.world.entity.monster.Slime)bounded(e,lookup,level,out,"slime/size",x->((net.minecraft.world.entity.monster.Slime)x).getSize(),(x,n)->((net.minecraft.world.entity.monster.Slime)x).setSize(n,false));
        if(e instanceof net.minecraft.world.entity.monster.Phantom)bounded(e,lookup,level,out,"phantom/size",x->((net.minecraft.world.entity.monster.Phantom)x).getPhantomSize(),(x,n)->((net.minecraft.world.entity.monster.Phantom)x).setPhantomSize(n));
    }
    private static void bounded(Entity e,HolderLookup.Provider lookup,Level level,JsonArray out,String id,java.util.function.ToIntFunction<Entity> getter,java.util.function.ObjIntConsumer<Entity> setter){
        Entity low=create(e.getType(),level),high=create(e.getType(),level);setter.accept(low,Integer.MIN_VALUE);setter.accept(high,Integer.MAX_VALUE);int min=getter.applyAsInt(low),max=getter.applyAsInt(high);
        if(min>max||(long)max-min>256)return;List<Choice> choices=new ArrayList<>();for(int i=min;i<=max;i++){int value=i;choices.add(new Choice(Integer.toString(i),x->setter.accept(x,value)));}
        // Size may also change health. The persisted size path is the one varying across all choices;
        // omit unrelated transient health when selecting the empirical field.
        JsonObject row=variant(e,lookup,level,id,"int",choices);if(row!=null){row.addProperty("semanticMin",min);row.addProperty("semanticMax",max);var values=row.getAsJsonArray("options").asList().stream().mapToInt(v->v.getAsJsonObject().get("value").getAsInt()).summaryStatistics();row.addProperty("min",values.getMin());row.addProperty("max",values.getMax());
            List<String> path=EntitySchemaValidation.path(row.getAsJsonObject("nbt").getAsJsonArray("path"));JsonArray probes=new JsonArray();
            for(int n:new int[]{Integer.MIN_VALUE,-1,0,1,Integer.MAX_VALUE}){CompoundTag input=save(e,lookup);put(input,path,IntTag.valueOf(n));JsonObject probe=new JsonObject();probe.addProperty("input",n);try{Tag saved=get(loadSave(e.getType(),level,lookup,input),path);probe.add("saved",saved==null?JsonNull.INSTANCE:json(saved));}catch(RuntimeException ex){probe.addProperty("error",ex.getMessage());}probes.add(probe);}row.add("loaderProbes",probes);out.add(row);}
    }
    private static void add(JsonArray array,JsonObject row){if(row!=null)array.add(row);}
    private static void common(Entity e,HolderLookup.Provider lookup,Level level,JsonArray flags,JsonArray warnings,String id,Consumer<Entity> setter){
        try{Entity fresh=create(e.getType(),level);CompoundTag before=save(fresh,lookup);setter.accept(fresh);CompoundTag after=save(fresh,lookup);
            for(List<String> p:diff(before,after)){if(p.size()!=1||p.getFirst().equals("attributes"))continue;Tag value=get(after,p);if(value==null)continue;
                CompoundTag edited=before.copy();put(edited,p,value.copy());if(!Objects.equals(value,get(loadSave(e.getType(),level,lookup,edited),p)))continue;
                JsonObject f=field(p.getFirst(),get(before,p),before.contains(p.getFirst()));f.addProperty("id",id);f.addProperty("common",true);
                f.addProperty("type",id.equals("custom_name")?"component":value instanceof ByteTag?"byte-bool":value instanceof FloatTag?"float":value instanceof NumericTag?"int":"string");
                if(value instanceof ByteTag)f.addProperty("default",get(before,p)instanceof NumericTag n&&n.doubleValue()!=0);
                f.add("enabledValue",json(value));f.addProperty("enabledSnbt",value.toString());flags.add(f);
            }
        }catch(RuntimeException | LinkageError ex){warnings.add(id+": "+ex.getMessage());}
    }
    private static JsonObject field(String key,Tag value,boolean present){JsonObject out=new JsonObject();out.addProperty("key",key);out.addProperty("type",value==null?"unknown":value.getType().getName());out.add("default",value==null?JsonNull.INSTANCE:json(value));out.addProperty("present_by_default",present);return out;}
    private static int ageValue(Entity entity,Level level,boolean baby){try{Entity probe=create(entity.getType(),level);((AgeableMob)probe).setBaby(baby);var field=AgeableMob.class.getDeclaredField("age");field.setAccessible(true);return field.getInt(probe);}catch(ReflectiveOperationException ex){throw new IllegalStateException(ex);}}
    public static JsonElement json(Tag tag){return NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE,tag);}
    private static JsonArray jsonPath(List<String> path){JsonArray out=new JsonArray();path.forEach(out::add);return out;}
    public static Tag get(CompoundTag tag,List<String> path){Tag value=tag;for(String key:path){if(!(value instanceof CompoundTag compound))return null;value=compound.get(key);}return value;}
    public static void put(CompoundTag tag,List<String> path,Tag value){CompoundTag parent=tag;for(int i=0;i<path.size()-1;i++){String key=path.get(i);if(!(parent.get(key)instanceof CompoundTag))parent.put(key,new CompoundTag());parent=(CompoundTag)parent.get(key);}parent.put(path.getLast(),value);}
    public static List<List<String>> diff(CompoundTag before,CompoundTag after){List<List<String>> result=new ArrayList<>();diffAt(before,after,new ArrayList<>(),result);return result;}
    private static void diffAt(CompoundTag a,CompoundTag b,List<String> prefix,List<List<String>> out){Set<String> keys=new TreeSet<>(a.keySet());keys.addAll(b.keySet());for(String key:keys){Tag x=a.get(key),y=b.get(key);if(Objects.equals(x,y))continue;List<String> p=new ArrayList<>(prefix);p.add(key);if(y instanceof CompoundTag yc&&(x==null||x instanceof CompoundTag))diffAt(x instanceof CompoundTag xc?xc:new CompoundTag(),yc,p,out);else if(x instanceof CompoundTag xc&&y instanceof CompoundTag yc)diffAt(xc,yc,p,out);else out.add(p);}}
    public static final class Problems implements ProblemReporter {final List<String> errors=new ArrayList<>();public ProblemReporter forChild(ProblemReporter.PathElement path){return this;}public void report(ProblemReporter.Problem p){errors.add(p.toString());}public void check(){if(!errors.isEmpty())throw new IllegalArgumentException("实体数据无法加载: "+errors);}}
}

