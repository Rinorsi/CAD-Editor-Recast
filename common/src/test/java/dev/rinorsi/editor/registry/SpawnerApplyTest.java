package dev.rinorsi.editor.registry;

import com.google.gson.JsonObject;
import com.mojang.serialization.Lifecycle;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.StackCodec;
import net.minecraft.SharedConstants;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.*;
import net.minecraft.nbt.*;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.Bootstrap;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.item.*;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.*;
import net.minecraft.world.level.block.entity.trialspawner.*;
import net.minecraft.world.level.storage.TagValueInput;

/** Page-shaped SNBT through the production apply decoder and official block loaders. No game/window. */
public final class SpawnerApplyTest {
    private static final String CLASSIC = "{id:'minecraft:mob_spawner',SpawnData:{entity:{id:'minecraft:zombie'}},SpawnPotentials:[{data:{entity:{id:'minecraft:zombie'}},weight:3}],SpawnCount:9,MinSpawnDelay:100,MaxSpawnDelay:800,RequiredPlayerRange:16,SpawnRange:4,MaxNearbyEntities:6,Delay:20}";
    private static final String TRIAL = "{id:'minecraft:trial_spawner',required_player_range:20,target_cooldown_length:36000,normal_config:{spawn_range:4,total_mobs:9,simultaneous_mobs:2,total_mobs_added_per_player:2,simultaneous_mobs_added_per_player:1,ticks_between_spawn:40,spawn_potentials:[{data:{entity:{id:'minecraft:zombie'}},weight:1}]},ominous_config:{total_mobs:12}}";
    private static int checks;
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var builtins = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        // Include the actual vanilla server-only configs, so the production server validation guard executes.
        var trials = new MappedRegistry<TrialSpawnerConfig>(Registries.TRIAL_SPAWNER_CONFIG, Lifecycle.stable());
        lookup.lookupOrThrow(Registries.TRIAL_SPAWNER_CONFIG).listElements().forEach(h -> trials.register(h.key(), h.value(), RegistrationInfo.BUILT_IN));
        trials.freeze();
        RegistryAccess access = new RegistryAccess() {
            @SuppressWarnings("unchecked")
            @Override public <E> java.util.Optional<Registry<E>> lookup(ResourceKey<? extends Registry<? extends E>> key) {
                return key.equals(Registries.TRIAL_SPAWNER_CONFIG) ? java.util.Optional.of((Registry<E>) trials) : builtins.lookup(key);
            }
            @Override public java.util.stream.Stream<RegistryEntry<?>> registries() { return java.util.stream.Stream.concat(builtins.registries(), java.util.stream.Stream.of(new RegistryEntry<>(Registries.TRIAL_SPAWNER_CONFIG, trials))); }
            @Override public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(com.mojang.serialization.DynamicOps<V> ops) { return lookup.createSerializationContext(ops); }
        };
        var classic = decode(Items.SPAWNER, "block_entity_data", CLASSIC, access);
        var raw = classic.get(DataComponents.BLOCK_ENTITY_DATA).copyTagWithoutId();
        check(raw.get("SpawnCount") instanceof IntTag && raw.get("Delay") instanceof IntTag, "page ints retained in stack");
        var block = new SpawnerBlockEntity(BlockPos.ZERO, Blocks.SPAWNER.defaultBlockState());
        check(classic.get(DataComponents.BLOCK_ENTITY_DATA).loadInto(block, lookup), "classic loads into official block");
        var saved = block.saveCustomOnly(lookup);
        check(saved.getIntOr("SpawnCount", -1) == 9 && saved.getIntOr("Delay", -1) == 20 && saved.getIntOr("MinSpawnDelay", -1) == 100, "classic values survive official load/save");
        check(saved.get("SpawnCount") instanceof ShortTag && saved.get("Delay") instanceof ShortTag, "classic official save uses short");
        for (String key : raw.keySet()) if (raw.get(key) instanceof NumericTag input) {
            check(saved.get(key) instanceof ShortTag && ((NumericTag) saved.get(key)).intValue() == input.intValue(), "classic integer field loaded and saved: " + key);
        }
        check(saved.getList("SpawnPotentials").orElseThrow().getCompound(0).orElseThrow().getIntOr("weight", -1) == 3, "weighted spawn list loads without losing weight");
        var secondBlock = new SpawnerBlockEntity(BlockPos.ZERO, Blocks.SPAWNER.defaultBlockState());
        secondBlock.loadCustomOnly(TagValueInput.create(ProblemReporter.DISCARDING, lookup, saved));
        check(secondBlock.saveCustomOnly(lookup).equals(saved), "classic second official load/save stable");
        check(saved.getCompound("SpawnData").orElseThrow().getCompound("entity").orElseThrow().getString("id").orElseThrow().equals("minecraft:zombie"), "classic spawn id retained");
        System.out.println("mob_spawner full payload -> accepted -> ItemStack SpawnCount/Delay/MinSpawnDelay INT; BlockEntity save SHORT; SpawnPotentials.weight INT");

        var trial = decode(Items.TRIAL_SPAWNER, "block_entity_data", TRIAL, access);
        var trialBlock = new TrialSpawnerBlockEntity(BlockPos.ZERO, Blocks.TRIAL_SPAWNER.defaultBlockState());
        check(trial.get(DataComponents.BLOCK_ENTITY_DATA).loadInto(trialBlock, lookup), "trial loads into official block");
        var runtime = trialBlock.getTrialSpawner();
        check(runtime.getRequiredPlayerRange() == 20 && runtime.normalConfig().totalMobs() == 9 && runtime.ominousConfig().totalMobs() == 12, "trial partial config applied");
        check(runtime.ominousConfig().spawnRange() == TrialSpawnerConfig.DEFAULT.spawnRange() && runtime.ominousConfig().ticksBetweenSpawn() == TrialSpawnerConfig.DEFAULT.ticksBetweenSpawn(), "omitted fields use official defaults");
        var trialSaved = trialBlock.saveCustomOnly(lookup);
        check(trialSaved.get("required_player_range") instanceof IntTag, "trial player range saved int");
        check(trialSaved.getCompound("normal_config").orElseThrow().get("total_mobs") instanceof FloatTag, "trial official total saved float");
        var secondTrial = new TrialSpawnerBlockEntity(BlockPos.ZERO, Blocks.TRIAL_SPAWNER.defaultBlockState());
        secondTrial.loadCustomOnly(TagValueInput.create(ProblemReporter.DISCARDING, lookup, trialSaved));
        check(secondTrial.saveCustomOnly(lookup).equals(trialSaved), "trial second official load/save stable");
        System.out.println("trial_spawner full/partial configs -> accepted -> ItemStack supplied numbers INT; BlockEntity required_player_range INT, normal/ominous total_mobs FLOAT; omitted fields official defaults");

        var egg = decode(Items.COW_SPAWN_EGG, "entity_data", "{id:'minecraft:cow',NoAI:1}", access);
        var eggTag = egg.get(DataComponents.ENTITY_DATA).copyTagWithoutId();
        check(egg.get(DataComponents.ENTITY_DATA).type() == net.minecraft.world.entity.EntityTypes.COW, "egg type cow");
        check(eggTag.get("NoAI") instanceof IntTag, "NoAI remains int in stored component");
        check(TagValueInput.create(ProblemReporter.DISCARDING, lookup, eggTag).getBooleanOr("NoAI", false), "official Mob boolean reader accepts NoAI int 1");
        System.out.println("cow spawn egg {id:cow,NoAI:1} -> accepted -> ItemStack NoAI INT; official Mob ValueInput boolean reads true (entity save writes BYTE)");

        reject("MaxSpawnDelay<MinSpawnDelay", Items.SPAWNER, CLASSIC.replace("MaxSpawnDelay:800", "MaxSpawnDelay:99"), access);
        reject("unknown entity id", Items.SPAWNER, CLASSIC.replace("minecraft:zombie", "editor:missing_entity"), access);
        reject("SpawnCount:40000", Items.SPAWNER, CLASSIC.replace("SpawnCount:9", "SpawnCount:40000"), access);
        reject("trial required_player_range:0", Items.TRIAL_SPAWNER, TRIAL.replace("required_player_range:20", "required_player_range:0"), access);
        System.out.println("PASS " + checks + " page spawner/egg apply and official load/save assertions; no game started");
    }
    private static ItemStack decode(Item item, String component, String snbt, RegistryAccess access) {
        JsonObject edit = new JsonObject(); edit.addProperty("id", BuiltInRegistries.ITEM.getKey(item).toString()); edit.addProperty("count", 1);
        JsonObject comps = new JsonObject(); comps.addProperty(component, snbt); edit.add("comps", comps); edit.add("removed", new JsonObject());
        JsonObject formats = new JsonObject(); formats.addProperty(component, "snbt"); edit.add("component_formats", formats);
        ItemStack original = new ItemStack(item); ItemStack baseline = original.copy();
        ItemStack stack;
        try { stack = StackCodec.decode(edit, access, original); }
        finally { check(ItemStack.matches(original, baseline), "apply decoder never mutates original on success or rejection"); }
        if (component.equals("entity_data")) {
            var jsonEdit = edit.deepCopy(); jsonEdit.remove("component_formats");
            try {
                jsonEdit.getAsJsonObject("comps").add(component, NbtOps.INSTANCE.convertTo(com.mojang.serialization.JsonOps.INSTANCE, TagParser.parseCompoundFully(snbt)));
            } catch (com.mojang.brigadier.exceptions.CommandSyntaxException error) { throw new AssertionError(error); }
            ItemStack jsonStack = StackCodec.decode(jsonEdit, access, original);
            var jsonData = jsonStack.get(DataComponents.ENTITY_DATA);
            var jsonTag = jsonData.copyTagWithoutId();
            check(jsonData.type() == stack.get(DataComponents.ENTITY_DATA).type()
                    && TagValueInput.create(ProblemReporter.DISCARDING, access, jsonTag).getBooleanOr("NoAI", false), "JSON egg uses same entity type and NoAI semantics despite numeric width normalization");
            var jsonOps = access.createSerializationContext(NbtOps.INSTANCE);
            check(ItemStack.matches(jsonStack, ItemStack.CODEC.parse(jsonOps, ItemStack.CODEC.encodeStart(jsonOps, jsonStack).getOrThrow()).getOrThrow()), "JSON egg typed ItemStack roundtrip");
            System.out.println("cow spawn egg JSON object {id:cow,NoAI:1} -> accepted -> stored NoAI " + jsonTag.get("NoAI").getType().getName() + "; official Mob boolean reads true");
        }
        var ops = access.createSerializationContext(NbtOps.INSTANCE);
        var tag = ItemStack.CODEC.encodeStart(ops, stack).getOrThrow();
        var roundTrip = ItemStack.CODEC.parse(ops, tag).getOrThrow();
        check(ItemStack.matches(stack, roundTrip), "whole ItemStack typed NBT persistence roundtrip");
        return roundTrip;
    }
    private static void reject(String label, Item item, String snbt, RegistryAccess access) {
        try { decode(item, "block_entity_data", snbt, access); }
        catch (RuntimeException error) {
            // Exact classification used by EditorMod.apply's catch; no network/player is synthesized.
            String code = error instanceof EditorSessions.Failure failure ? failure.code : "invalid_request";
            check(code.equals("invalid_request") && error.getMessage() != null && !error.getMessage().isBlank(), "readable invalid_request: " + label);
            System.out.println(label + " -> rejected(" + code + ": " + error.getMessage() + ") -> no stored tag / original untouched"); return;
        }
        throw new AssertionError("accepted invalid " + label);
    }
    private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
}
