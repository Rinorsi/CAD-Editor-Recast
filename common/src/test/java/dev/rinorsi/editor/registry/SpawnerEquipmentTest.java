package dev.rinorsi.editor.registry;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.TagParser;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentTable;
import net.minecraft.world.level.SpawnData;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.TrialSpawnerBlockEntity;
import net.minecraft.world.level.storage.loot.BuiltInLootTables;

/** Real spawner export/Codec and two-config block load/save checks; no game or world. */
public final class SpawnerEquipmentTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var ops = lookup.createSerializationContext(JsonOps.INSTANCE);
        var entries = SpawnerData.entries(lookup);
        for (var entry : entries) {
            var schema = entry.getAsJsonObject().getAsJsonObject("spawn_data_schema");
            check(schema.get("entity_schema").getAsString().equals("entity_schema"), "entity equipment schema reference");
            var equipment = schema.getAsJsonObject("equipment");
            var chances = equipment.getAsJsonObject("slot_drop_chances");
            check(chances.getAsJsonObject("default").isEmpty(), "missing override defaults to empty map");
            check(chances.getAsJsonArray("slots").size() == EquipmentSlot.values().length, "all actual Codec slots exported");
            for (var slot : chances.getAsJsonArray("slots"))
                check(EquipmentSlot.CODEC.parse(ops, slot).getOrThrow().getSerializedName().equals(slot.getAsString()), "slot encoded by official Codec");
            var sample = EquipmentTable.CODEC.parse(ops, equipment.get("sample")).getOrThrow();
            check(sample.lootTable().equals(BuiltInLootTables.EQUIPMENT_TRIAL_CHAMBER), "sample table from official constant");
            check(sample.slotDropChances().get(EquipmentSlot.HEAD) == 0.25f, "sample drop chance survives Codec");
            check(EquipmentTable.CODEC.parse(ops, JsonParser.parseString("{}")).error().isPresent(), "equipment table is required");
            check(EquipmentTable.CODEC.parse(ops, JsonParser.parseString("{\"loot_table\":\"minecraft:empty\"}")).getOrThrow().slotDropChances().isEmpty(), "omitted override map stays empty");
        }
        for (String text : new String[]{"0.125", "{\"head\":0.25}", "-1", "2"}) {
            var value = JsonParser.parseString(text);
            var decoded = EquipmentTable.DROP_CHANCES_CODEC.parse(ops, value).getOrThrow();
            check(EquipmentTable.DROP_CHANCES_CODEC.parse(ops, EquipmentTable.DROP_CHANCES_CODEC.encodeStart(ops, decoded).getOrThrow()).getOrThrow().equals(decoded), "float/map roundtrip without fabricated 0..1 range");
        }
        for (String text : new String[]{"{\"unknown\":0.1}", "{\"head\":\"bad\"}"})
            check(EquipmentTable.DROP_CHANCES_CODEC.parse(ops, JsonParser.parseString(text)).error().isPresent(), "invalid slot/value rejected");
        var uniform = EquipmentTable.DROP_CHANCES_CODEC.parse(ops, JsonParser.parseString("0.125")).getOrThrow();
        check(uniform.size() == EquipmentSlot.values().length && uniform.values().stream().allMatch(v -> v == 0.125f), "scalar expands across every slot");

        var spawn = TagParser.parseCompoundFully("{entity:{id:'minecraft:zombie',equipment:{head:{id:'minecraft:iron_helmet',count:1,components:{'minecraft:custom_data':{n:9223372036854775807L}}}},drop_chances:{head:0.5f}},equipment:{loot_table:'minecraft:equipment/trial_chamber',slot_drop_chances:{head:0.25f}}}");
        var nbtOps = lookup.createSerializationContext(NbtOps.INSTANCE);
        var decoded = SpawnData.CODEC.parse(nbtOps, spawn).getOrThrow();
        check(SpawnData.CODEC.encodeStart(nbtOps, decoded).getOrThrow().equals(spawn), "entity item equipment and separate table equipment retain typed NBT");
        var config = TagParser.parseCompoundFully("{spawn_potentials:[]}");
        config.put("spawn_potentials", SpawnData.LIST_CODEC.encodeStart(nbtOps, net.minecraft.util.random.WeightedList.of(decoded)).getOrThrow());
        var trial = new net.minecraft.nbt.CompoundTag();
        trial.put("normal_config", config.copy()); trial.put("ominous_config", config.copy());
        SpawnerData.validateTrial(trial, lookup);
        var block = new TrialSpawnerBlockEntity(BlockPos.ZERO, Blocks.TRIAL_SPAWNER.defaultBlockState());
        block.loadCustomOnly(net.minecraft.world.level.storage.TagValueInput.create(net.minecraft.util.ProblemReporter.DISCARDING, lookup, trial));
        var saved = block.saveCustomOnly(lookup);
        for (String key : new String[]{"normal_config", "ominous_config"}) {
            var savedConfig = saved.getCompound(key).orElseThrow();
            check(savedConfig.get("spawn_potentials").equals(config.get("spawn_potentials")), key + " retains full weighted equipment payload");
        }
        var page = new JsonObject(); page.addProperty("name", "spawner_info");
        RegistryPages.split("spawner_info", "test", entries, page);
        check(true, "export fits real registry page budget");
        System.out.println("PASS " + checks + " spawner equipment export/Codec/two-config assertions; no game started");
    }
    private static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }
}
