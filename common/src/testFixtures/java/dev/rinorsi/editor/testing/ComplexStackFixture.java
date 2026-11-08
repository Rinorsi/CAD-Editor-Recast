package dev.rinorsi.editor.testing;

import com.google.gson.JsonParser;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;

/** Reproduction fixture only, never an item data catalogue or shipped mod entrypoint. */
public final class ComplexStackFixture {
    public static ItemStack create(HolderLookup.Provider registries) {
        var stack = ItemStack.CODEC.parse(registries.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE), JsonParser.parseString("""
            {"id":"minecraft:netherite_spear","count":1,"components":{
              "minecraft:custom_name":{"text":"复杂矛","color":"gold","extra":[{"text":" 复现","italic":true}]},
              "minecraft:enchantments":{"minecraft:sharpness":5,"minecraft:unbreaking":3},
              "minecraft:attribute_modifiers":[{"type":"minecraft:attack_damage","id":"test:damage","amount":12.125,"operation":"add_value","slot":"mainhand"},{"type":"minecraft:attack_speed","id":"test:speed","amount":-2.35,"operation":"add_value","slot":"hand"}],
              "minecraft:food":{"nutrition":6,"saturation":0.8},
              "minecraft:consumable":{"consume_seconds":0.8,"animation":"eat","sound":"minecraft:entity.generic.eat","on_consume_effects":[{"type":"minecraft:apply_effects","probability":0.75,"effects":[{"id":"minecraft:regeneration","duration":600,"amplifier":2},{"id":"minecraft:speed","duration":200,"amplifier":1}]},{"type":"minecraft:apply_effects","effects":[{"id":"minecraft:glowing","duration":100}]}]},
              "minecraft:death_protection":{"death_effects":[{"type":"minecraft:apply_effects","effects":[{"id":"minecraft:regeneration","duration":1200,"amplifier":1}]}]},
              "minecraft:tool":{"rules":[{"blocks":"minecraft:stone","speed":5.25,"correct_for_drops":true}],"default_mining_speed":1.125,"damage_per_block":2},
              "minecraft:weapon":{"item_damage_per_attack":3,"disable_blocking_for_seconds":2.35}
            }}
            """)).getOrThrow();
        CompoundTag data = new CompoundTag();
        data.putByte("byte", (byte) 7); data.putLong("long", 9007199254740993L);
        data.putFloat("float", 0.8f); data.putDouble("double", 1.2345678901234567);
        data.putIntArray("ints", new int[]{1,2,3});
        var nested = new CompoundTag(); nested.putByteArray("bytes", new byte[]{-1,0,127}); nested.putLongArray("longs", new long[]{9007199254740993L,-2});
        data.put("nested", nested); stack.set(DataComponents.CUSTOM_DATA, CustomData.of(data));
        return stack;
    }
}
