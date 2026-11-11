package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;
import net.minecraft.world.entity.ai.attributes.*;
import net.minecraft.resources.Identifier;

/** Production JS plans checked against this version's real AttributeInstance, not a formula mock. */
public final class LinkedAttributeTest {
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        var inputs=new JsonArray();var instances=new ArrayList<AttributeInstance>();
        for(var holder:List.of(Attributes.MAX_HEALTH,Attributes.MAX_ABSORPTION)){
            for(int scenario=0;scenario<7;scenario++){
                var instance=new AttributeInstance(holder,x->{});instance.setBaseValue(20);
                if(scenario>=1)instance.addPermanentModifier(new AttributeModifier(Identifier.parse("test:add"),5,AttributeModifier.Operation.ADD_VALUE));
                if(scenario>=2)instance.addPermanentModifier(new AttributeModifier(Identifier.parse("test:base"),0.25,AttributeModifier.Operation.ADD_MULTIPLIED_BASE));
                if(scenario>=3)instance.addTransientModifier(new AttributeModifier(Identifier.parse("test:gear"),0.5,AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
                if(scenario==5)instance.addTransientModifier(new AttributeModifier(Identifier.parse("test:zero"),-1,AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
                var attr=(RangedAttribute)holder.value();var def=new JsonObject();def.addProperty("min",attr.getMinValue());def.addProperty("max",attr.getMaxValue());
                def.add("transientModifiers",AttributeModifier.CODEC.listOf().encodeStart(JsonOps.INSTANCE,instance.getModifiers().stream().filter(m->!instance.getPermanentModifiers().contains(m)).toList()).getOrThrow());
                var row=new JsonObject();row.addProperty("base",instance.getBaseValue());row.add("modifiers",AttributeModifier.CODEC.listOf().encodeStart(JsonOps.INSTANCE,List.copyOf(instance.getPermanentModifiers())).getOrThrow());
                var input=new JsonObject();input.add("def",def);input.add("row",row);input.addProperty("requested",scenario==6?attr.getMaxValue()+1:scenario==4?200.1:200);inputs.add(input);instances.add(instance);
            }
        }
        var process=new ProcessBuilder("node",Path.of("tools/linked-attribute-native.cjs").toAbsolutePath().toString()).redirectErrorStream(true).start();
        process.getOutputStream().write(inputs.toString().getBytes(StandardCharsets.UTF_8));process.getOutputStream().close();
        if(!process.waitFor(30,TimeUnit.SECONDS)){process.destroyForcibly();throw new AssertionError("production JS timed out");}
        String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        if(process.exitValue()!=0)throw new AssertionError(output);
        var results=JsonParser.parseString(output).getAsJsonArray();if(results.size()!=inputs.size())throw new AssertionError("missing plans");
        for(int i=0;i<inputs.size();i++){
            var result=results.get(i).getAsJsonObject();var instance=instances.get(i);
            if(i%7>=5){if(!result.has("error"))throw new AssertionError("unreachable/native limit accepted "+i);continue;}
            if(result.has("error"))throw new AssertionError(result.toString());
            var before=Set.copyOf(instance.getModifiers());instance.setBaseValue(result.get("base").getAsDouble());
            double wanted=inputs.get(i).getAsJsonObject().get("requested").getAsDouble();
            if(instance.getValue()<wanted || (float)instance.getValue()<(float)wanted)throw new AssertionError("native effective value too small: "+i+" "+instance.getValue()+" < "+wanted);
            if(!before.equals(Set.copyOf(instance.getModifiers())))throw new AssertionError("modifiers modified");
        }
        entityRoundtrip();
        System.out.println("PASS production JS -> native AttributeInstance: 14 real registry cases plus actual cow linked Health/attribute load/save and strict retention negatives");
    }
    private static void entityRoundtrip() {
        var access=EntitySchemaTest.access();var level=new EntitySchemaTestLevel(access,false);
        var cow=(net.minecraft.world.entity.LivingEntity)EntitySchema.create(net.minecraft.world.entity.EntityTypes.COW,level);
        cow.getAttribute(Attributes.MOVEMENT_SPEED);
        var before=dev.rinorsi.editor.world.WorldTarget.saveEntity(cow,access);
        var requested=before.copy();var rows=requested.getList("attributes").orElseThrow().copy();
        var extra=new net.minecraft.nbt.CompoundTag();extra.putString("id","minecraft:max_health");extra.putDouble("base",200);rows.add(extra);
        requested.put("attributes",rows);requested.putFloat("Health",200);
        var prepared=dev.rinorsi.editor.world.WorldTarget.copyEntity(cow,requested,level,access);
        System.out.println("linked cow requested attributes="+requested.get("attributes")+" loaded="+prepared.get("attributes"));
        dev.rinorsi.editor.world.WorldNbt.requireEditedFieldsRetained(before,requested,prepared);
        dev.rinorsi.editor.world.EntityWorldEdit.load(cow,prepared,access);
        if(cow.getHealth()!=200||cow.getMaxHealth()!=200)throw new AssertionError("native cow did not consume linked Health/max_health");
        for(String negative:List.of("changed","unknown","duplicate","missing")){
            var invalid=requested.copy();var list=invalid.getList("attributes").orElseThrow();
            var row=(net.minecraft.nbt.CompoundTag)list.get(list.size()-1);
            if(negative.equals("changed"))row.putDouble("base",201);
            if(negative.equals("unknown"))row.putLong("test:unknown",9007199254740993L);
            if(negative.equals("duplicate"))list.add(row.copy());
            if(negative.equals("missing"))list.remove(list.size()-1);
            // Ensure the edited-field check is exercised even when the negative equals before.
            try{dev.rinorsi.editor.world.WorldNbt.requireEditedFieldsRetained(new net.minecraft.nbt.CompoundTag(),invalid,prepared);}
            catch(dev.rinorsi.editor.EditorSessions.Failure expected){continue;}
            throw new AssertionError("attribute retention accepted "+negative);
        }
    }
}
