package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.CustomData;

/** Native JVM boundary check before the expensive hidden-client run. */
public final class AcceptanceCodecTest {
    public static CompoundTag boundaries(){
        CompoundTag n=new CompoundTag();
        n.putByte("byte",Byte.MIN_VALUE);n.putShort("short",Short.MAX_VALUE);n.putInt("int",Integer.MIN_VALUE);
        n.putLong("long",Long.MAX_VALUE);n.putFloat("float",Math.nextUp(0.8f));n.putDouble("double",Math.nextUp(0.8d));
        n.putByteArray("bytes",new byte[]{Byte.MIN_VALUE,Byte.MAX_VALUE});n.putIntArray("ints",new int[]{Integer.MIN_VALUE,Integer.MAX_VALUE});n.putLongArray("longs",new long[]{Long.MIN_VALUE,Long.MAX_VALUE});return n;
    }
    public static void main(String[] args){
        SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
        var lookup=net.minecraft.data.registries.VanillaRegistries.createLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p->p.apply());
        var access=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        ItemStack expected=new ItemStack(Items.PAPER);CompoundTag n=boundaries();expected.set(DataComponents.CUSTOM_DATA,CustomData.of(n));
        JsonObject wire=StackCodec.snapshot(expected,access,new JsonObject(),"");
        wire.getAsJsonObject("comps").addProperty("custom_data",n.toString());JsonObject formats=new JsonObject();formats.addProperty("custom_data","snbt");wire.add("component_formats",formats);
        ItemStack actual=StackCodec.decode(JsonParser.parseString(wire.toString()).getAsJsonObject(),access);
        if(!n.equals(actual.get(DataComponents.CUSTOM_DATA).copyTag()))throw new AssertionError("typed numeric/array boundary loss");
        JsonObject validation=new JsonObject();validation.addProperty("component","minecraft:custom_data");validation.addProperty("snbt",n.toString());
        if(!ComponentValidation.validate(validation,access).get("ok").getAsBoolean())throw new AssertionError("validate_component boundary failed");
        if(!ComponentSchemaValidation.validate(validation,access).get("ok").getAsBoolean())throw new AssertionError("component_validate boundary failed");
        System.out.println("PASS typed byte/short/int/long/float/double and three arrays; SNBT wire + both validators");
    }
}
