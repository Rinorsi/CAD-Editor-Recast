package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.decoration.*;
import net.minecraft.world.entity.decoration.painting.Painting;
import net.minecraft.world.entity.npc.villager.AbstractVillager;
import net.minecraft.world.item.ItemDisplayContext;

/** Real save/loader probes, reused by placed entity views and spawn-egg entity_schema. */
public final class EntityWorldSchema {
    private EntityWorldSchema() {}
    public static JsonObject describe(Entity original,RegistryAccess access){
        Entity source=original;
        if(original instanceof ArmorStand || original instanceof ItemFrame || original instanceof Painting || original instanceof Display)
            source=dev.rinorsi.editor.registry.EntitySchema.create(original.getType(),original.level());
        var out=new JsonObject();var baseline=WorldTarget.saveEntity(source,access);
        if(source instanceof ArmorStand stand){
            var pose=new JsonObject();var fields=new JsonObject();
            var defaults=List.of(stand.getHeadPose(),stand.getBodyPose(),stand.getLeftArmPose(),stand.getRightArmPose(),stand.getLeftLegPose(),stand.getRightLegPose());
            for(String name:EntityWorldEdit.POSES){var field=new JsonObject();field.addProperty("type","float[3]");field.addProperty("nbtPath","Pose."+name);field.addProperty("units","degrees");field.add("default",Rotations.CODEC.encodeStart(JsonOps.INSTANCE,defaults.get(EntityWorldEdit.POSES.indexOf(name))).getOrThrow());field.addProperty("normalization","Rotations: finite angle % 360; nonfinite -> 0");
                var probes=new JsonArray();for(float n:new float[]{-361,-360,-180,0,180,360,361,Float.MAX_VALUE}){var row=new JsonObject();row.addProperty("input",n);row.add("saved",net.minecraft.core.Rotations.CODEC.encodeStart(JsonOps.INSTANCE,new net.minecraft.core.Rotations(n,n,n)).getOrThrow());probes.add(row);}field.add("loaderProbes",probes);fields.add(name,field);}
            for(String flag:EntityWorldEdit.STAND_FLAGS){var field=probe(source,baseline,flag,access,ByteTag.valueOf(false),ByteTag.valueOf(true),ByteTag.valueOf((byte)2));field.addProperty("type","boolean");field.addProperty("default",baseline.getBoolean(flag).orElse(false));fields.add(flag,field);}
            pose.add("fields",fields);pose.addProperty("write","entity.pose");out.add("pose",pose);
        }
        if(source instanceof ItemFrame){var section=section(source,baseline,EntityWorldEdit.FRAME_FIELDS,access);section.getAsJsonObject("fields").add("item",stackField("Item"));section.addProperty("write","entity.item_frame");out.add("item_frame",section);}
        if(source instanceof Painting){var section=new JsonObject();var field=new JsonObject();field.addProperty("type","registry");field.addProperty("registry",Registries.PAINTING_VARIANT.identifier().toString());field.addProperty("allowManual",true);var options=new JsonArray();access.lookupOrThrow(Registries.PAINTING_VARIANT).listElements().forEach(h->options.add(h.key().identifier().toString()));field.add("options",options);var fields=new JsonObject();fields.add("variant",field);section.add("fields",fields);section.addProperty("facingLocked",true);section.addProperty("write","entity.painting");out.add("painting",section);}
        if(source instanceof Display){
            var section=section(source,baseline,EntityWorldEdit.DISPLAY_FIELDS,access);var fields=section.getAsJsonObject("fields");
            fields.add("billboard",choices(Arrays.stream(Display.BillboardConstraints.values()).map(Display.BillboardConstraints::getSerializedName).toList()));
            var transform=new JsonObject();transform.addProperty("type","Transformation.EXTENDED_CODEC");transform.addProperty("representation","{translation:[x,y,z],scale:[x,y,z],left_rotation:[x,y,z,w]|{axis:[x,y,z],angle:radians},right_rotation:same} or row-major 16-number matrix (including shear)");transform.addProperty("normalization","vanilla SVD decomposition; saved as translation/scale/left_rotation/right_rotation");fields.add("transformation",transform);
            var brightness=new JsonObject();brightness.addProperty("type","Brightness.CODEC or null");var probes=new JsonArray();for(int n:new int[]{-1,0,15,16,Integer.MAX_VALUE}){var row=new JsonObject();var value=new JsonObject();value.addProperty("block",n);value.addProperty("sky",n);row.add("input",value);var result=net.minecraft.util.Brightness.CODEC.parse(JsonOps.INSTANCE,value);row.addProperty("accepted",result.error().isEmpty());result.error().ifPresent(e->row.addProperty("error",e.message()));probes.add(row);}brightness.add("loaderProbes",probes);fields.add("brightness",brightness);
            var trigger=new JsonObject();trigger.addProperty("type","int");trigger.addProperty("persistent",false);trigger.addProperty("read","live SynchedEntityData via vanilla getter");trigger.addProperty("undo","not replayed by undo");fields.add("start_interpolation",trigger);
            if(source instanceof Display.TextDisplay){fields.asMap().putAll(section(source,baseline,EntityWorldEdit.TEXT_FIELDS,access).getAsJsonObject("fields").asMap());fields.add("alignment",choices(Arrays.stream(Display.TextDisplay.Align.values()).map(Display.TextDisplay.Align::getSerializedName).toList()));var text=fields.getAsJsonObject("text");text.addProperty("type","component");text.add("default",EntityWorldEdit.component(baseline.get("text"),access));}
            if(source instanceof Display.ItemDisplay){fields.add("item",stackField("item"));fields.add("item_display",choices(Arrays.stream(ItemDisplayContext.values()).map(ItemDisplayContext::getSerializedName).toList()));}
            if(source instanceof Display.BlockDisplay){var f=new JsonObject();f.addProperty("type","BlockState.CODEC");f.addProperty("registry","minecraft:block");f.addProperty("allowManual",true);fields.add("block_state",f);}
            section.addProperty("write","entity.display");out.add("display",section);
        }
        if(source instanceof AbstractVillager){var section=new JsonObject();section.addProperty("write","entity.offers");section.addProperty("serverOnly",true);section.addProperty("codec","MerchantOffers.CODEC");section.addProperty("maxEntries",256);section.addProperty("stackFormat","StackCodec");section.addProperty("fields","buy,buyB?,sell,uses,maxUses,rewardExp,xp,priceMultiplier,demand,specialPrice");out.add("trades",section);}
        EntityViewsVehicle.schema(out,source,access);
        EntityViewsSimple.schema(out,source,access);
        EntityViewsHorse.schema(out,source,access);
        var ride=EntityWorldEdit.rideCheck();ride.remove("reason");out.add("riding",ride);return out;
    }
    private static JsonObject stackField(String path){var out=new JsonObject();out.addProperty("type","stack");out.addProperty("nbtPath",path);out.addProperty("codec","ItemStack.OPTIONAL_CODEC");return out;}
    private static JsonObject choices(List<String> values){var out=new JsonObject();out.addProperty("type","enum");out.addProperty("allowManual",true);var options=new JsonArray();values.forEach(options::add);out.add("options",options);return out;}
    private static JsonObject section(Entity source,CompoundTag base,Set<String> names,RegistryAccess access){var section=new JsonObject();var fields=new JsonObject();for(String key:names){Tag value=base.get(key);
        if(value instanceof ByteTag){var field=probe(source,base,key,access,ByteTag.valueOf((byte)-128),ByteTag.valueOf((byte)0),ByteTag.valueOf((byte)1),ByteTag.valueOf((byte)127));if(Set.of("Invisible","Fixed","shadow","see_through","default_background").contains(key)){field.addProperty("type","boolean");field.addProperty("default",base.getBoolean(key).orElse(false));}fields.add(key,field);}
        else if(value instanceof FloatTag)fields.add(key,probe(source,base,key,access,FloatTag.valueOf(-Float.MAX_VALUE),FloatTag.valueOf(-1),FloatTag.valueOf(0),FloatTag.valueOf(1),FloatTag.valueOf(Float.MAX_VALUE)));
        else if(value instanceof IntTag)fields.add(key,probe(source,base,key,access,IntTag.valueOf(Integer.MIN_VALUE),IntTag.valueOf(-1),IntTag.valueOf(0),IntTag.valueOf(59),IntTag.valueOf(60),IntTag.valueOf(Integer.MAX_VALUE)));
        else if(value!=null){var field=new JsonObject();field.addProperty("type",value.getType().getName());field.add("default",EntityWorldEdit.json(value));field.addProperty("nbtPath",key);fields.add(key,field);}
    }section.add("fields",fields);section.addProperty("source","26.1.2 real entity factory/load/save probes; changed fields must survive loader");return section;}
    private static JsonObject probe(Entity source,CompoundTag base,String key,RegistryAccess access,Tag... candidates){
        var field=new JsonObject();field.addProperty("nbtPath",key);field.addProperty("type",candidates[0].getType().getName());if(base.contains(key))field.add("default",EntityWorldEdit.json(base.get(key)));
        var probes=new JsonArray();for(Tag candidate:candidates){var row=new JsonObject();row.add("input",EntityWorldEdit.json(candidate));try{var entity=source.getType().create(source.level(),EntitySpawnReason.COMMAND);var requested=base.copy();requested.put(key,candidate.copy());EntityWorldEdit.load(entity,requested,access);var saved=WorldTarget.saveEntity(entity,access);row.add("saved",saved.contains(key)?EntityWorldEdit.json(saved.get(key)):JsonNull.INSTANCE);row.addProperty("retained",Objects.equals(candidate,saved.get(key)));}catch(RuntimeException ex){row.addProperty("error",ex.getMessage());}probes.add(row);}field.add("loaderProbes",probes);field.addProperty("bounds","See actual loaderProbes; no inferred range from sampled endpoints");return field;
    }
}
