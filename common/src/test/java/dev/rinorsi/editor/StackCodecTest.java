package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;

/** No game/server is started: exercises the real 26.1.2 codecs and vanilla item registry. */
public final class StackCodecTest {
    private static int checks;
    public static void main(String[] args) {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var registries = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        ItemStack original = new ItemStack(Items.DIAMOND_SWORD);
        original.set(DataComponents.CUSTOM_NAME, Component.literal("原名称"));
        CompoundTag tag = new CompoundTag();
        tag.putByte("b", (byte) 7); tag.putLong("large", 9007199254740993L); tag.putIntArray("array", new int[]{1,2,3});
        original.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
        original.remove(DataComponents.ATTRIBUTE_MODIFIERS);
        var json = StackCodec.snapshot(original, registries, new JsonObject(), "主手");
        check(json.getAsJsonObject("removed").has("attribute_modifiers"), "explicit removal exported");
        check(ItemStack.matches(original, StackCodec.decode(json, registries, original)), "unchanged typed NBT round trip");
        var edit = json.deepCopy();
        edit.getAsJsonObject("comps").addProperty("custom_name", "验收钻石剑");
        var renamed = StackCodec.decode(edit, registries, original);
        check(renamed.getHoverName().getString().equals("验收钻石剑"), "rename via vanilla codec");
        check(renamed.get(DataComponents.CUSTOM_DATA).copyTag().equals(tag), "untouched typed NBT retained");
        check(!renamed.has(DataComponents.ATTRIBUTE_MODIFIERS), "removed default stays removed");
        check(original.getHoverName().getString().equals("原名称"), "cancel/work copy does not mutate original");
        var vanilla = ItemStack.CODEC.encodeStart(registries.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE), renamed).getOrThrow();
        var reread = ItemStack.CODEC.parse(registries.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE), vanilla).getOrThrow();
        check(reread.getHoverName().getString().equals("验收钻石剑"), "vanilla persistence round trip (not an uninstall game test)");
        var special = (CompoundTag) ComponentValidation.parseSnbt("{nan:NaNf,pos:+Infinityf,neg:-Infinityd,values:[NaNf,Infinityf],quoted:\"NaNf\",Infinityf:1}");
        check(Float.isNaN(special.getFloat("nan").orElseThrow()), "explicit NaNf parsed as FloatTag");
        check(special.getFloat("pos").orElseThrow() == Float.POSITIVE_INFINITY, "explicit +Infinityf parsed as FloatTag");
        check(special.getDouble("neg").orElseThrow() == Double.NEGATIVE_INFINITY, "explicit -Infinityd parsed as DoubleTag");
        check(Float.isNaN(special.getList("values").orElseThrow().getFloat(0).orElseThrow())
                && special.getList("values").orElseThrow().getFloat(1).orElseThrow() == Float.POSITIVE_INFINITY, "homogeneous special-float list parsed");
        check(special.getString("quoted").orElseThrow().equals("NaNf") && special.getInt("Infinityf").orElseThrow() == 1, "quoted values and matching compound keys remain ordinary SNBT");
        check(ComponentValidation.parseSnbt("Infinity") instanceof net.minecraft.nbt.StringTag, "unsuffixed Infinity remains a string tag");
        float firstFloatPlaceholder = Float.intBitsToFloat(Float.floatToRawIntBits(Float.MAX_VALUE / 2.0f));
        double firstDoublePlaceholder = Double.longBitsToDouble(Double.doubleToRawLongBits(Double.MAX_VALUE / 2.0d));
        var collision = (CompoundTag) ComponentValidation.parseSnbt("{specialF:NaNf,finiteF:" + Float.toString(firstFloatPlaceholder)
                + "f,specialD:-Infinityd,finiteD:" + Double.toString(firstDoublePlaceholder) + "d,hex:0x7fffffff}");
        check(Float.isNaN(collision.getFloat("specialF").orElseThrow())
                && Float.floatToRawIntBits(collision.getFloat("finiteF").orElseThrow()) == Float.floatToRawIntBits(firstFloatPlaceholder), "finite float equal to first placeholder is never replaced");
        check(collision.getDouble("specialD").orElseThrow() == Double.NEGATIVE_INFINITY
                && Double.doubleToRawLongBits(collision.getDouble("finiteD").orElseThrow()) == Double.doubleToRawLongBits(firstDoublePlaceholder), "finite double equal to first placeholder is never replaced");
        check(collision.getInt("hex").orElseThrow() == Integer.MAX_VALUE, "hex input remains under vanilla numeric parsing beside special floats");
        var duplicateSpecial = (CompoundTag) ComponentValidation.parseSnbt("{a:NaNf,a:1f,finite:" + firstFloatPlaceholder + "f}");
        check(duplicateSpecial.getFloat("a").orElseThrow() == 1f
                && duplicateSpecial.getFloat("finite").orElseThrow() == firstFloatPlaceholder, "discarded duplicate-key special cannot corrupt another finite value");
        var nestedCollision = (net.minecraft.nbt.ListTag) ComponentValidation.parseSnbt("[NaNf," + firstFloatPlaceholder + "f,Infinityf]");
        check(Float.isNaN(nestedCollision.getFloat(0).orElseThrow()) && nestedCollision.getFloat(1).orElseThrow() == firstFloatPlaceholder
                && nestedCollision.getFloat(2).orElseThrow() == Float.POSITIVE_INFINITY, "path-based restore protects finite list entries equal to markers");
        rejects(() -> ComponentValidation.parseSnbt("[I;NaNf]"), "special float cannot enter an integer typed array");
        var specialEdit = json.deepCopy();
        specialEdit.getAsJsonObject("comps").addProperty("custom_data", "{nan:NaNf,pos:+Infinityf,neg:-Infinityd}");
        var specialFormats = new JsonObject(); specialFormats.addProperty("custom_data", "snbt"); specialEdit.add("component_formats", specialFormats);
        var specialStack = StackCodec.decode(specialEdit, registries, original);
        var validationRequest = new JsonObject(); validationRequest.addProperty("component", "minecraft:custom_data");
        validationRequest.addProperty("format", "snbt"); validationRequest.addProperty("snbt", "{nan:NaNf,pos:Infinityf,neg:-Infinityd}");
        var validationReply = ComponentValidation.validate(validationRequest, registries);
        check(validationReply.get("ok").getAsBoolean() && validationReply.getAsJsonObject("json").get("nan").isJsonNull(), "special-float validation result uses strict JSON plus exact SNBT");
        check(com.google.gson.JsonParser.parseString(new com.google.gson.GsonBuilder().serializeNulls().create().toJson(validationReply)).isJsonObject(), "validation reply crosses a strict JSON serializer");
        var specialData = specialStack.get(DataComponents.CUSTOM_DATA).copyTag();
        check(Float.isNaN(specialData.getFloat("nan").orElseThrow())
                && specialData.getFloat("pos").orElseThrow() == Float.POSITIVE_INFINITY
                && specialData.getDouble("neg").orElseThrow() == Double.NEGATIVE_INFINITY, "typed component edit keeps all special values");
        var specialWire = StackCodec.snapshot(specialStack, registries, new JsonObject(), "special");
        check(StackCodec.samePageJson(com.google.gson.JsonNull.INSTANCE, com.google.gson.JsonNull.INSTANCE), "two literal null page values compare equal");
        check(!StackCodec.samePageJson(com.google.gson.JsonNull.INSTANCE, new com.google.gson.JsonPrimitive(1)), "null does not equal a finite numeric edit");
        var projected = specialWire.getAsJsonObject("comps").getAsJsonObject("custom_data");
        check(projected.get("nan").isJsonNull() && projected.get("pos").isJsonNull() && projected.get("neg").isJsonNull(), "page JSON uses null projections for non-finite numbers");
        check(specialWire.getAsJsonObject("component_snbt").get("custom_data").getAsString().contains("NaNf"), "snapshot carries exact special-value SNBT sidecar");
        check(ItemStack.matches(specialStack, StackCodec.decode(specialWire, registries, specialStack)), "snapshot null projection plus sidecar rereads losslessly");
        var changedSpecial = specialWire.deepCopy();
        changedSpecial.getAsJsonObject("component_snbt").addProperty("custom_data", "{nan:Infinityf,pos:NaNf,neg:-Infinityd}");
        var changedSpecialData = StackCodec.decode(changedSpecial, registries, specialStack).get(DataComponents.CUSTOM_DATA).copyTag();
        check(changedSpecialData.getFloat("nan").orElseThrow() == Float.POSITIVE_INFINITY
                && Float.isNaN(changedSpecialData.getFloat("pos").orElseThrow()), "different authoritative special sidecar wins even when both JSON projections are null");
        var finiteSpecial = specialWire.deepCopy();
        finiteSpecial.getAsJsonObject("comps").getAsJsonObject("custom_data").addProperty("nan", 7);
        finiteSpecial.getAsJsonObject("comps").getAsJsonObject("custom_data").addProperty("pos", 8);
        finiteSpecial.getAsJsonObject("comps").getAsJsonObject("custom_data").addProperty("neg", 9);
        var finiteSpecialData = StackCodec.decode(finiteSpecial, registries, specialStack).get(DataComponents.CUSTOM_DATA).copyTag();
        check(finiteSpecialData.getInt("nan").orElseThrow() == 7, "finite JSON edit is not mistaken for an unchanged non-finite null projection");
        var persistedSpecial = ItemStack.CODEC.encodeStart(registries.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE), specialStack).getOrThrow();
        var rereadSpecial = ItemStack.CODEC.parse(registries.createSerializationContext(net.minecraft.nbt.NbtOps.INSTANCE), persistedSpecial).getOrThrow();
        check(ItemStack.matches(specialStack, rereadSpecial), "native NBT save/reload preserves special float/double tags");
        var largeData = new CompoundTag();
        largeData.putString("payload", "x".repeat(28000));
        largeData.putLong("exact", 9007199254740993L);
        largeData.putShort("small", (short) 2);
        var largeStack = new ItemStack(Items.PAPER);
        largeStack.set(DataComponents.CUSTOM_DATA, CustomData.of(largeData));
        var largeWire = StackCodec.snapshot(largeStack, registries, new JsonObject(), "large");
        check(ItemStack.matches(largeStack, StackCodec.decode(largeWire, registries)), "large snapshot retains the pre-existing vault capacity and exact types");
        rejects(() -> ComponentValidation.parseSnbt(largeData.toString()), "quick validation keeps its own smaller transport budget");
        var largeEdit = largeWire.deepCopy();
        largeEdit.getAsJsonObject("comps").addProperty("custom_data", largeData.toString());
        largeEdit.add("component_formats", specialFormats.deepCopy());
        largeEdit.getAsJsonObject("component_snbt").addProperty("custom_data", "{stale broken sidecar");
        check(ItemStack.matches(largeStack, StackCodec.decode(largeEdit, registries)), "explicit typed edit wins over stale sidecar and is not limited by quick-validation size");
        var oversized = largeEdit.deepCopy();
        oversized.getAsJsonObject("comps").addProperty("custom_data", "{payload:\"" + "x".repeat(65536) + "\"}");
        rejects(() -> StackCodec.decode(oversized, registries), "typed component decoder remains bounded above largest supported entry");
        var badId = json.deepCopy(); badId.addProperty("id", "minecraft:does_not_exist");
        rejects(() -> StackCodec.decode(badId, registries), "unknown item");
        var badCount = json.deepCopy(); badCount.addProperty("count", 2);
        rejects(() -> StackCodec.decode(badCount, registries), "sword count exceeds stack limit");
        var fraction = json.deepCopy(); fraction.addProperty("count", 1.5);
        rejects(() -> StackCodec.decode(fraction, registries), "fractional count");
        var badComponent = json.deepCopy(); badComponent.getAsJsonObject("comps").addProperty("damage", "invalid");
        rejects(() -> StackCodec.decode(badComponent, registries), "invalid component codec");
        var unknown = json.deepCopy(); unknown.getAsJsonObject("comps").addProperty("unknown_component", 1);
        rejects(() -> StackCodec.decode(unknown, registries), "unknown component");
        var conflict = json.deepCopy(); conflict.getAsJsonObject("removed").addProperty("custom_name", 1);
        rejects(() -> StackCodec.decode(conflict, registries), "set/remove conflict");
        var policy = new EditorPolicy(2, false);
        check(policy.allows(true, false), "creative allowed");
        check(policy.allows(false, true), "permission allowed");
        check(!policy.allows(false, false), "unprivileged survival rejected");
        check(new EditorPolicy(2, true).allows(false, true), "gamemaster is independent of legacy creativeOnly");
        System.out.println("PASS " + checks + " codec/policy checks; no game client or server started.");
        EditorSessionsTest.run(registries);
        TestKitTest.run(lookup);
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
    private static void rejects(Runnable action, String label) {
        try { action.run(); } catch (RuntimeException expected) { checks++; return; }
        throw new AssertionError("Expected rejection: " + label);
    }
}
