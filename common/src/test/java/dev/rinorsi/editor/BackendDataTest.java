package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.registry.ItemMetadata;
import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/** Real registry/codecs and server session boundary; no OS input or game window. */
public final class BackendDataTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var builtins = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        RegistryAccess access = new RegistryAccess() {
            @Override public <E> java.util.Optional<net.minecraft.core.Registry<E>> lookup(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<? extends E>> key) { return builtins.lookup(key); }
            @Override public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>> registries() { return builtins.registries(); }
            @Override public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(com.mojang.serialization.DynamicOps<V> ops) { return lookup.createSerializationContext(ops); }
        };
        roundTrip(access, Items.PIG_SPAWN_EGG, "entity_data", "{id:'minecraft:pig',Health:7.0f,Age:-24000,unknown:9007199254740993L}");
        roundTrip(access, Items.SPAWNER, "block_entity_data", "{id:'minecraft:mob_spawner',Delay:40s,MinSpawnDelay:100s,SpawnData:{entity:{id:'minecraft:pig'}}}");
        roundTrip(access, Items.TRIAL_SPAWNER, "block_entity_data", "{id:'minecraft:trial_spawner',normal_config:{spawn_range:4},next_mob_spawns_at:9007199254740993L}");
        roundTrip(access, Items.TROPICAL_FISH_BUCKET, "bucket_entity_data", "{Health:7.0f,Age:-24000,custom:[I;1,2,3]}");
        roundTrip(access, Items.CROSSBOW, "charged_projectiles", "[{id:'minecraft:arrow',components:{'minecraft:custom_data':{b:1b,l:9007199254740993L,a:[L;1L,2L]}}}]");
        roundTrip(access, Items.PAPER, "custom_data", "{b:7b,l:9007199254740993L,a:[I;1,2,3],bytes:[B;1b,2b]}");
        roundTrip(access, Items.CHEST, "lock", "{items:'minecraft:tripwire_hook'}");
        check(!validate(access, "entity_data", "{id:'missing:entity'}").get("ok").getAsBoolean(), "unknown entity rejected");
        check(!validate(access, "block_entity_data", "{Delay:20s}").get("ok").getAsBoolean(), "missing block entity id rejected");
        check(!validate(access, "custom_data", "{x:}").get("ok").getAsBoolean(), "malformed SNBT rejected");
        check(!validate(access, "missing:component", "{}").get("ok").getAsBoolean(), "unknown component rejected");
        check(!validate(access, "charged_projectiles", "[{id:'missing:item'}]").get("ok").getAsBoolean(), "nested invalid item rejected");
        check(!validate(access, "custom_data", "{} trailing").get("ok").getAsBoolean(), "trailing SNBT rejected");
        var eggDefaults = dev.rinorsi.editor.registry.ItemDefaults.entries(access, net.minecraft.resources.Identifier.parse("minecraft:pig_spawn_egg")).get(0).getAsJsonObject();
        check(eggDefaults.getAsJsonObject("comps").getAsJsonObject("entity_data").get("id").getAsString().equals("minecraft:pig"), "existing item defaults already expose egg entity");
        check(ItemMetadata.entry(Items.CHEST).get("container_size").getAsInt() == 27, "chest slots from actual Container");
        check(ItemMetadata.entry(Items.HOPPER).get("container_size").getAsInt() == 5, "hopper slots");
        check(ItemMetadata.entry(Items.SHULKER_BOX).get("container_size").getAsInt() == 27, "shulker slots");
        check(ItemMetadata.entry(Items.DECORATED_POT).get("container_size").getAsInt() == 1, "pot slots");
        check(ItemMetadata.entry(Items.CAMPFIRE).get("container_size").getAsInt() == 4, "campfire actual item list size");
        check(ItemMetadata.entry(Items.PIG_SPAWN_EGG).get("spawn_egg_entity").getAsString().equals("minecraft:pig"), "spawn egg actual entity");
        check(ItemMetadata.entry(Items.BUNDLE).getAsJsonObject("bundle_capacity").get("numerator").getAsInt() == 1, "bundle normalized capacity from insertion");
        check(!ItemMetadata.entry(Items.PLAYER_HEAD).has("armor_slot"), "head equipment not invented armor");
        var all = ItemMetadata.entries(access, null);
        check(all.size() == BuiltInRegistries.ITEM.size(), "all runtime items exported");
        if (args.length > 0) {
            Path dir = Path.of(args[0]); Files.createDirectories(dir);
            Files.writeString(dir.resolve("item-meta.json"), all.toString());
            var result = new JsonObject(); result.addProperty("status", "PASSED"); result.addProperty("checks", checks);
            result.addProperty("runtime_items", all.size()); result.addProperty("mode", "vanilla-codecs-no-client");
            Files.writeString(dir.resolve("backend-data-verification.json"), result.toString());
        }
        System.out.println("PASS BackendDataTest " + checks + " checks; component SNBT/type fidelity, sessions, persistence, runtime metadata");
    }
    private static JsonObject validate(RegistryAccess access, String component, String snbt) {
        var request = new JsonObject(); request.addProperty("component", component); request.addProperty("snbt", snbt);
        request.addProperty("requestId", "test"); return ComponentValidation.validate(request, access);
    }
    private static void roundTrip(RegistryAccess access, net.minecraft.world.item.Item item, String component, String snbt) {
        var validation = validate(access, component, snbt);
        check(validation.get("ok").getAsBoolean(), component + " validation: " + validation);
        var original = new ItemStack(item);
        var slot = new JsonObject(); slot.addProperty("kind", "inventory"); slot.addProperty("index", 0);
        var draft = StackCodec.snapshot(original, access, slot, "");
        draft.getAsJsonObject("comps").add(component, validation.get("normalized"));
        var formats = new JsonObject(); formats.addProperty(component, "snbt"); draft.add("component_formats", formats);
        var sessions = new EditorSessions(); var player = java.util.UUID.randomUUID();
        sessions.open(player, slot, original);
        var state = sessions.apply(player, slot, EditorSessions.fingerprint(original, access), original, access);
        var saved = StackCodec.decode(draft, access, state.original);
        state.prepared = saved; state.preparedRequest = "test";
        check(ItemStack.matches(sessions.confirm(player, slot, "test", null, saved, access).original, saved), component + " session confirm");
        var nbt = access.createSerializationContext(NbtOps.INSTANCE);
        var encoded = ItemStack.CODEC.encodeStart(nbt, saved).getOrThrow();
        var reread = ItemStack.CODEC.parse(nbt, encoded).getOrThrow();
        check(ItemStack.matches(saved, reread), component + " vanilla persistence");
        var type = ComponentValidation.type(component);
        check(encoded.asCompound().orElseThrow().getCompound("components").orElseThrow().get("minecraft:" + component).equals(ComponentValidation.parseSnbt(validation.get("snbt").getAsString())), component + " exact numeric and array types");
        var jsonSnapshot = StackCodec.snapshot(reread, access, slot, "");
        check(ItemStack.matches(reread, StackCodec.decode(jsonSnapshot, access)), component + " authoritative response sidecar retains types without original");
        check(ItemStack.matches(reread, StackCodec.decode(jsonSnapshot, access, reread)), component + " unchanged JSON snapshot preserves typed original");
        check(original.getComponentsPatch().isEmpty(), component + " work copy never changes original");
        if (component.equals("custom_data")) {
            var changed = jsonSnapshot.deepCopy();
            changed.getAsJsonObject("comps").add("custom_data", com.google.gson.JsonParser.parseString("{\"different\":42}"));
            var edited = StackCodec.decode(changed, access, reread);
            check(edited.get(DataComponents.CUSTOM_DATA).copyTag().getIntOr("different", 0) == 42, "stale SNBT sidecar cannot override edited JSON");
        }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
}
