package dev.rinorsi.editor.registry;

import com.google.gson.JsonObject;
import net.minecraft.SharedConstants;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.TagParser;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;

/** Real 26.1.2 defaults/codecs, no graphics, world modification or fixed gameplay-value expectations. */
public final class EntityDataTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        var lookup = VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var attributes = EntityDefaults.attributes(net.minecraft.world.entity.EntityTypes.PLAYER);
        check(attributes.get(BuiltInRegistries.ATTRIBUTE.getKey(Attributes.ATTACK_DAMAGE.value()).toString()).getAsDouble()
                == Player.createAttributes().build().getBaseValue(Attributes.ATTACK_DAMAGE), "player damage equals official supplier");
        check(attributes.get(BuiltInRegistries.ATTRIBUTE.getKey(Attributes.ATTACK_SPEED.value()).toString()).getAsDouble()
                == Player.createAttributes().build().getBaseValue(Attributes.ATTACK_SPEED), "player speed equals official supplier");
        var groups = EntityDefaults.slotGroups();
        for (var value : groups) {
            var group = EquipmentSlotGroup.valueOf(value.getAsJsonObject().get("id").getAsString().toUpperCase(java.util.Locale.ROOT));
            for (EquipmentSlot slot : EquipmentSlot.values()) check(value.getAsJsonObject().getAsJsonArray("slots").contains(new com.google.gson.JsonPrimitive(slot.getSerializedName())) == group.test(slot), "slot predicate " + group + "/" + slot);
        }
        check(EntityDefaults.attributes(net.minecraft.world.entity.EntityTypes.ZOMBIE).size() > 0, "zombie supplier present");
        check(EntityDefaults.attributes(net.minecraft.world.entity.EntityTypes.ITEM).isEmpty(), "nonliving entity has no invented attributes");
        var entries = SpawnerData.entries(lookup);
        check(entries.size() == 2, "both spawner exports");
        var classic = SpawnerData.classicDefaults(lookup);
        SpawnerData.validateClassic(classic, lookup); checks++;
        SpawnerData.validateTrial(new CompoundTag(), lookup); checks++;
        var fullTrial = entries.get(1).getAsJsonObject().getAsJsonObject("defaults");
        var trialNbt = com.mojang.serialization.JsonOps.INSTANCE.convertTo(net.minecraft.nbt.NbtOps.INSTANCE, fullTrial);
        SpawnerData.validateTrial((CompoundTag) trialNbt, lookup); checks++;
        reject(() -> SpawnerData.validateClassic(parse("{SpawnData:{entity:{id:3}}}"), lookup), "bad entity id type");
        reject(() -> SpawnerData.validateClassic(parse("{SpawnData:{entity:{id:'minecraft:pig'},custom_spawn_rules:{block_light_limit:[-1,99]}}}"), lookup), "bad spawn rule light range");
        reject(() -> SpawnerData.validateClassic(parse("{SpawnPotentials:'invalid'}"), lookup), "bad weighted list");
        reject(() -> SpawnerData.validateClassic(parse("{SpawnCount:1.5d}"), lookup), "fractional classic count");
        reject(() -> SpawnerData.validateClassic(parse("{Delay:40000}"), lookup), "short overflow");
        reject(() -> SpawnerData.validateClassic(parse("{MinSpawnDelay:900,MaxSpawnDelay:100}"), lookup), "reversed delays");
        reject(() -> SpawnerData.validateTrial(parse("{normal_config:{spawn_range:0}}"), lookup), "trial codec minimum");
        reject(() -> SpawnerData.validateTrial(parse("{normal_config:{ticks_between_spawn:-1}}"), lookup), "negative trial delay");
        reject(() -> SpawnerData.validateTrial(parse("{normal_config:'cadeditor:missing_config'}"), lookup), "unknown trial registry reference");
        reject(() -> SpawnerData.validateTrial(parse("{normal_config:{total_mobs:'invalid'}}"), lookup), "trial codec field type");
        if (args.length > 0) java.nio.file.Files.writeString(java.nio.file.Path.of(args[0]), new com.google.gson.GsonBuilder().setPrettyPrinting().create().toJson(entries));
        System.out.println("PASS " + checks + " entity/spawner data checks (real 26.1.2 registries/codecs, no game started)");
    }
    private static CompoundTag parse(String snbt) { try { return TagParser.parseCompoundFully(snbt); } catch (Exception e) { throw new IllegalArgumentException(e); } }
    private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
    private static void reject(Runnable action, String label) { try { action.run(); } catch (RuntimeException expected) { checks++; return; } throw new AssertionError("accepted " + label); }
}
