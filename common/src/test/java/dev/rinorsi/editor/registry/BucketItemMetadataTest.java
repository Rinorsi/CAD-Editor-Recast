package dev.rinorsi.editor.registry;

import com.google.gson.JsonObject;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Item;

/** No client/world creation: real item metadata and real registry/component keys. */
public final class BucketItemMetadataTest {
    private static int checks;
    public static void main(String[] args) throws ReflectiveOperationException {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        check(Items.COD_BUCKET, net.minecraft.world.entity.EntityTypes.COD, false, 0);
        check(Items.SALMON_BUCKET, net.minecraft.world.entity.EntityTypes.SALMON, false, 1);
        check(Items.PUFFERFISH_BUCKET, net.minecraft.world.entity.EntityTypes.PUFFERFISH, false, 0);
        check(Items.TROPICAL_FISH_BUCKET, net.minecraft.world.entity.EntityTypes.TROPICAL_FISH, false, 3);
        check(Items.AXOLOTL_BUCKET, net.minecraft.world.entity.EntityTypes.AXOLOTL, true, 1);
        check(Items.TADPOLE_BUCKET, net.minecraft.world.entity.EntityTypes.TADPOLE, true, 0);
        //? if >=26.2 {
        check(Items.SULFUR_CUBE_BUCKET, net.minecraft.world.entity.EntityTypes.SULFUR_CUBE, true, 0);
        //?}
        JsonObject empty = new JsonObject(); BucketItemMetadata.append(Items.WATER_BUCKET, empty);
        require(empty.isEmpty(), "fluid buckets must not invent an entity");
        customItems();
        System.out.println("PASS BucketItemMetadata real registry: " + checks + " checks; no level/client created");
    }
    private static void customItems() throws ReflectiveOperationException {
        // Isolated test JVM only: recreate the pre-freeze intrusive-holder construction
        // window for unregistered mod items, then restore the exact registry state.
        var registry = BuiltInRegistries.ITEM;
        var frozen = net.minecraft.core.MappedRegistry.class.getDeclaredField("frozen");
        var intrusive = net.minecraft.core.MappedRegistry.class.getDeclaredField("unregisteredIntrusiveHolders");
        frozen.setAccessible(true); intrusive.setAccessible(true);
        boolean oldFrozen = frozen.getBoolean(registry); Object oldIntrusive = intrusive.get(registry);
        frozen.setBoolean(registry, false); intrusive.set(registry, new java.util.IdentityHashMap<>());
        try {
        var custom = new net.minecraft.world.item.MobBucketItem(net.minecraft.world.entity.EntityTypes.COD, net.minecraft.world.level.material.Fluids.WATER,
                net.minecraft.sounds.SoundEvents.BUCKET_EMPTY_FISH, properties("arbitrary_item_name"));
        JsonObject customValue = new JsonObject(); BucketItemMetadata.append(custom, customValue);
        require(customValue.get("bucket_entity").getAsString().equals(BuiltInRegistries.ENTITY_TYPE.getKey(net.minecraft.world.entity.EntityTypes.COD).toString()), "type does not depend on item ID");
        var overridden = new net.minecraft.world.item.MobBucketItem(net.minecraft.world.entity.EntityTypes.COD, net.minecraft.world.level.material.Fluids.WATER,
                net.minecraft.sounds.SoundEvents.BUCKET_EMPTY_FISH, properties("overridden")) {};
        JsonObject unknown = new JsonObject(); BucketItemMetadata.append(overridden, unknown);
        require(!unknown.get("bucket_fields_verified").getAsBoolean() && unknown.getAsJsonArray("bucket_fields").isEmpty(), "unknown subclass cannot claim vanilla load semantics");
        } finally { intrusive.set(registry, oldIntrusive); frozen.setBoolean(registry, oldFrozen); }
    }
    private static Item.Properties properties(String name) {
        return new Item.Properties().setId(net.minecraft.resources.ResourceKey.create(net.minecraft.core.registries.Registries.ITEM,
                net.minecraft.resources.Identifier.fromNamespaceAndPath("cadeditor_test", name)));
    }
    private static void check(Item item, EntityType<?> type, boolean age, int variants) {
        JsonObject value = new JsonObject(); BucketItemMetadata.append(item, value);
        require(value.get("bucket_entity").getAsString().equals(BuiltInRegistries.ENTITY_TYPE.getKey(type).toString()), "actual bucket entity " + item);
        require(value.get("bucket_fields_verified").getAsBoolean(), "verified bucket contract");
        require(value.getAsJsonArray("bucket_components").size() == variants, "variant components " + item);
        boolean hasAge = false, health = false, ageLocked = false, hunting = false;
        for (var element : value.getAsJsonArray("bucket_fields")) {
            var field = element.getAsJsonObject();
            require(!field.has("default"), "no manufactured default");
            String key = field.get("key").getAsString();
            hasAge |= key.equals("Age") || key.equals("age");
            ageLocked |= key.equals("AgeLocked") || key.equals("age_locked");
            hunting |= key.equals("HuntingCooldown");
            health |= field.get("key").getAsString().equals("Health") && field.get("type").getAsString().equals("float");
        }
        require(hasAge == age, "species-specific age field"); require(health, "bucket health is float");
        require(ageLocked == age, "both supported age species must expose their actual age lock");
        require(hunting == (type == net.minecraft.world.entity.EntityTypes.AXOLOTL), "hunting cooldown is axolotl only");
        require(value.get("bucket_health_range_source").getAsString().equals("entity_schema.health"), "health comes from runtime schema, no health table");
        //? if >=26.2 {
        if (type == net.minecraft.world.entity.EntityTypes.SULFUR_CUBE) {
            require(value.get("bucket_age_key").getAsString().equals("age"), "sulfur age is lowercase");
            require(value.get("bucket_health_dynamic").getAsBoolean(), "sulfur spawn/age health scope is explicit");
        }
        //?}
        for (var component : value.getAsJsonArray("bucket_components"))
            require(BuiltInRegistries.DATA_COMPONENT_TYPE.containsKey(net.minecraft.resources.Identifier.parse(component.getAsString())), "actual component registration");
        System.out.println("BUCKET_CONTRACT_JSON " + value);
    }
    private static void require(boolean condition, String detail) { checks++; if (!condition) throw new AssertionError(detail); }
}
