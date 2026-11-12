package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.JsonOps;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.NumericTag;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.SpawnData;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntityTypes;
import net.minecraft.world.level.block.entity.SpawnerBlockEntity;
import net.minecraft.world.level.block.entity.TrialSpawnerBlockEntity;
import net.minecraft.world.level.block.entity.trialspawner.TrialSpawner;
import net.minecraft.world.level.block.entity.trialspawner.TrialSpawnerConfig;
import net.minecraft.world.level.block.entity.trialspawner.TrialSpawnerStateData;

/** Shared client/server validation. No client classes, world placement, ticking or spawning. */
public final class SpawnerData {
    private SpawnerData() {}
    public static CompoundTag classicDefaults(HolderLookup.Provider lookup) {
        return new SpawnerBlockEntity(BlockPos.ZERO, Blocks.SPAWNER.defaultBlockState()).saveCustomOnly(lookup);
    }
    public static JsonArray entries(HolderLookup.Provider lookup) {
        JsonArray out = new JsonArray();
        JsonObject classic = new JsonObject(); classic.addProperty("id", net.minecraft.core.registries.BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(BlockEntityTypes.MOB_SPAWNER).toString());
        CompoundTag defaults = classicDefaults(lookup);
        classic.addProperty("default_nbt", defaults.toString());
        classic.add("defaults", NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE, defaults));
        JsonObject fields = new JsonObject();
        for (String key : defaults.keySet()) {
            Tag value = defaults.get(key); JsonObject field = new JsonObject();
            field.addProperty("nbt_type", value.getType().getName());
            field.add("default", NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE, value)); fields.add(key, field);
        }
        addCodec(fields, "SpawnData", SpawnData.CODEC, new SpawnData(), lookup);
        addCodec(fields, "SpawnPotentials", SpawnData.LIST_CODEC, net.minecraft.util.random.WeightedList.<SpawnData>of(), lookup);
        for (var entry : fields.entrySet()) entry.getValue().getAsJsonObject().addProperty("present_by_default", defaults.contains(entry.getKey()));
        classic.add("fields", fields);
        classic.add("spawn_data_schema", spawnDataSchema(lookup)); out.add(classic);
        JsonObject trial = new JsonObject(); trial.addProperty("id", net.minecraft.core.registries.BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(BlockEntityTypes.TRIAL_SPAWNER).toString());
        var block = new TrialSpawnerBlockEntity(BlockPos.ZERO, Blocks.TRIAL_SPAWNER.defaultBlockState());
        trial.addProperty("default_nbt", block.saveCustomOnly(lookup).toString());
        trial.addProperty("codec", "TrialSpawner.FullConfig.MAP_CODEC");
        JsonObject full = new JsonObject();
        var config = TrialSpawner.FullConfig.DEFAULT;
        full.add("normal_config", configDefaults(config.normal().value(), lookup));
        full.add("ominous_config", configDefaults(config.ominous().value(), lookup));
        full.addProperty("required_player_range", config.requiredPlayerRange());
        full.addProperty("target_cooldown_length", config.targetCooldownLength());
        trial.add("defaults", full);
        trial.addProperty("config_codec", "TrialSpawnerConfig.DIRECT_CODEC");
        trial.addProperty("state_codec", "TrialSpawnerStateData.Packed.MAP_CODEC");
        trial.add("spawn_data_schema", spawnDataSchema(lookup));
        out.add(trial); return out;
    }
    private static JsonObject spawnDataSchema(HolderLookup.Provider lookup) {
        var ops = lookup.createSerializationContext(JsonOps.INSTANCE);
        JsonObject schema = new JsonObject();
        schema.addProperty("codec", "SpawnData.CODEC");
        schema.addProperty("entity_schema", "entity_schema");
        JsonObject equipment = new JsonObject();
        equipment.addProperty("codec", "EquipmentTable.CODEC");
        equipment.addProperty("optional", true);
        JsonObject lootTable = new JsonObject();
        lootTable.addProperty("registry", "loot_table");
        lootTable.addProperty("required", true);
        equipment.add("loot_table", lootTable);
        JsonObject chances = new JsonObject();
        chances.addProperty("codec", "EquipmentTable.DROP_CHANCES_CODEC");
        chances.addProperty("optional", true);
        chances.add("default", net.minecraft.world.entity.EquipmentTable.DROP_CHANCES_CODEC.encodeStart(ops, java.util.Map.of()).getOrThrow());
        JsonArray formats = new JsonArray(); formats.add("float"); formats.add("slot-map");
        chances.add("formats", formats);
        JsonArray slots = new JsonArray();
        for (var slot : net.minecraft.world.entity.EquipmentSlot.values())
            slots.add(net.minecraft.world.entity.EquipmentSlot.CODEC.encodeStart(ops, slot).getOrThrow());
        chances.add("slots", slots);
        equipment.add("slot_drop_chances", chances);
        // Samples are encoded by the real Codec, not defaults to insert into an existing draft.
        var sample = new net.minecraft.world.entity.EquipmentTable(
                net.minecraft.world.level.storage.loot.BuiltInLootTables.EQUIPMENT_TRIAL_CHAMBER,
                java.util.Map.of(net.minecraft.world.entity.EquipmentSlot.HEAD, 0.25f));
        equipment.add("sample", net.minecraft.world.entity.EquipmentTable.CODEC.encodeStart(ops, sample).getOrThrow());
        schema.add("equipment", equipment);
        return schema;
    }
    // Explicit bindings to official 26.1.2 Codec fields, never a baked table of option/default values.
    private static JsonObject configDefaults(TrialSpawnerConfig c, HolderLookup.Provider lookup) {
        JsonObject out = new JsonObject();
        out.addProperty("spawn_range", c.spawnRange());
        out.addProperty("total_mobs", c.totalMobs());
        out.addProperty("simultaneous_mobs", c.simultaneousMobs());
        out.addProperty("total_mobs_added_per_player", c.totalMobsAddedPerPlayer());
        out.addProperty("simultaneous_mobs_added_per_player", c.simultaneousMobsAddedPerPlayer());
        out.addProperty("ticks_between_spawn", c.ticksBetweenSpawn());
        var ops = lookup.createSerializationContext(JsonOps.INSTANCE);
        out.add("spawn_potentials", SpawnData.LIST_CODEC.encodeStart(ops, c.spawnPotentialsDefinition()).getOrThrow());
        out.add("loot_tables_to_eject", net.minecraft.util.random.WeightedList.codec(net.minecraft.world.level.storage.loot.LootTable.KEY_CODEC).encodeStart(ops, c.lootTablesToEject()).getOrThrow());
        out.addProperty("items_to_drop_when_ominous", c.itemsToDropWhenOminous().identifier().toString());
        // Check field bindings against the actual codec (including ranges and reference availability).
        TrialSpawnerConfig.DIRECT_CODEC.parse(ops, out).getOrThrow();
        return out;
    }
    private static <T> void addCodec(JsonObject fields, String name, Codec<T> codec, T value, HolderLookup.Provider lookup) {
        JsonObject row = fields.has(name) ? fields.getAsJsonObject(name) : new JsonObject();
        row.addProperty("codec", codec == SpawnData.CODEC ? "SpawnData.CODEC" : "SpawnData.LIST_CODEC");
        row.add("default", codec.encodeStart(lookup.createSerializationContext(JsonOps.INSTANCE), value).getOrThrow());
        fields.add(name, row);
    }
    public static void validate(ItemStack stack, HolderLookup.Provider lookup) {
        var data = stack.get(DataComponents.BLOCK_ENTITY_DATA);
        if (data == null) return;
        if (data.type() == BlockEntityTypes.MOB_SPAWNER) validateClassic(data.copyTagWithoutId(), lookup);
        else if (data.type() == BlockEntityTypes.TRIAL_SPAWNER) validateTrial(data.copyTagWithoutId(), lookup);
    }
    public static void validateClassic(CompoundTag tag, HolderLookup.Provider lookup) {
        var ops = lookup.createSerializationContext(NbtOps.INSTANCE);
        validateSpawnDataTag(tag.get("SpawnData"));
        validatePotentials(tag.get("SpawnPotentials"));
        if (tag.contains("SpawnData")) SpawnData.CODEC.parse(ops, tag.get("SpawnData")).getOrThrow();
        if (tag.contains("SpawnPotentials")) SpawnData.LIST_CODEC.parse(ops, tag.get("SpawnPotentials")).getOrThrow();
        // BaseSpawner has no whole-object Codec: validate the fields its actual save method writes.
        CompoundTag defaults = classicDefaults(lookup);
        for (String key : defaults.keySet()) if (defaults.get(key) instanceof NumericTag && tag.contains(key)) {
            if (!(tag.get(key) instanceof NumericTag number)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.spawnerdata.d16633fc89", (key)));
            double value = number.doubleValue();
            int min = key.equals("Delay") ? -1 : 0;
            if (!Double.isFinite(value) || value != Math.rint(value) || value < min || value > Short.MAX_VALUE)
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.spawnerdata.e70a0aa0ac", (key)));
        }
        int min = tag.getIntOr("MinSpawnDelay", defaults.getIntOr("MinSpawnDelay", 0));
        int max = tag.getIntOr("MaxSpawnDelay", defaults.getIntOr("MaxSpawnDelay", 0));
        if (max < min) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.spawnerdata.3eae4d653b"));
    }
    public static void validateTrial(CompoundTag tag, HolderLookup.Provider lookup) {
        var ops = lookup.createSerializationContext(NbtOps.INSTANCE);
        for (String key : new String[]{"normal_config", "ominous_config"})
            if (tag.get(key) instanceof CompoundTag config) validatePotentials(config.get("spawn_potentials"));
        validateSpawnDataTag(tag.get("spawn_data"));
        TrialSpawner.FullConfig.MAP_CODEC.codec().parse(ops, tag).getOrThrow();
        TrialSpawnerStateData.Packed.MAP_CODEC.codec().parse(ops, tag).getOrThrow();
    }
    private static void validatePotentials(Tag tag) {
        if (tag instanceof net.minecraft.nbt.ListTag list) for (Tag entry : list)
            if (entry instanceof CompoundTag weighted) validateSpawnDataTag(weighted.get("data"));
    }
    private static void validateSpawnDataTag(Tag tag) {
        if (tag instanceof CompoundTag data && data.get("entity") instanceof CompoundTag entity) validateEntityId(entity, 0);
    }
    private static void validateEntityId(CompoundTag entity, int depth) {
        if (depth > 16) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.spawnerdata.3286c388d0"));
        if (entity.contains("id")) {
            String value = entity.getString("id").orElseThrow(() -> new IllegalArgumentException(EditorI18n.tr("cadeditor.message.spawnerdata.acaa8b80a5")));
            var id = net.minecraft.resources.Identifier.tryParse(value);
            if (id == null || !net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.containsKey(id))
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.spawnerdata.9469397c4a", (value)));
        }
        if (entity.get("Passengers") instanceof net.minecraft.nbt.ListTag passengers)
            for (Tag passenger : passengers) if (passenger instanceof CompoundTag child) validateEntityId(child, depth + 1);
    }
}
