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
        var lookup = net.minecraft.data.registries.VanillaRegistries.createLookup();
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
