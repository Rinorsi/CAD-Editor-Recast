package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.MobBucketItem;

/** Bucket loading is a subset of entity NBT; variants are separate item components in 26.x. */
final class BucketItemMetadata {
    private BucketItemMetadata() {}

    static void append(Item item, JsonObject out) {
        if (!(item instanceof MobBucketItem)) return;
        out.addProperty("mob_bucket", true);
        try {
            // MobBucketItem has no public type getter in any supported 26.x version.
            // Read its one EntityType field; never infer a type from an item ID.
            var fields = java.util.Arrays.stream(MobBucketItem.class.getDeclaredFields())
                    .filter(f -> f.getType() == EntityType.class && !java.lang.reflect.Modifier.isStatic(f.getModifiers())).toList();
            if (fields.size() != 1) throw new IllegalStateException("MobBucketItem EntityType field is not unique");
            var field = fields.getFirst();
            if (!field.trySetAccessible()) throw new IllegalStateException("MobBucketItem EntityType field inaccessible");
            var type = (EntityType<?>) field.get(item);
            out.addProperty("bucket_entity", BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
            // These branches describe verified loadFromBucketTag implementations, not bucket-ID mappings.
            boolean known = item.getClass() == MobBucketItem.class && (type == net.minecraft.world.entity.EntityTypes.COD || type == net.minecraft.world.entity.EntityTypes.SALMON || type == net.minecraft.world.entity.EntityTypes.PUFFERFISH
                    || type == net.minecraft.world.entity.EntityTypes.TROPICAL_FISH || type == net.minecraft.world.entity.EntityTypes.AXOLOTL || type == net.minecraft.world.entity.EntityTypes.TADPOLE
                    //? if >=26.2 {
                    || type == net.minecraft.world.entity.EntityTypes.SULFUR_CUBE
                    //?}
                    );
            out.addProperty("bucket_fields_verified", known);
            JsonArray fieldsOut = new JsonArray(), components = new JsonArray();
            if (known) {
                for (String key : java.util.List.of("NoAI", "Silent", "NoGravity", "Glowing", "Invulnerable"))
                    add(fieldsOut, key, "boolean");
                //? if >=26.2 {
                add(fieldsOut, "PersistenceRequired", "boolean");
                //?}
                add(fieldsOut, "Health", "float");
                // Health limits are measured by the current world's entity schema, not a species table.
                out.addProperty("bucket_health_range_source", "entity_schema.health");
                if (type == net.minecraft.world.entity.EntityTypes.AXOLOTL || type == net.minecraft.world.entity.EntityTypes.TADPOLE) {
                    add(fieldsOut, "Age", "int"); add(fieldsOut, "AgeLocked", "boolean");
                    out.addProperty("bucket_age_key", "Age");
                }
                if (type == net.minecraft.world.entity.EntityTypes.AXOLOTL) { add(fieldsOut, "HuntingCooldown", "long"); component(components, DataComponents.AXOLOTL_VARIANT); }
                //? if >=26.2 {
                if (type == net.minecraft.world.entity.EntityTypes.SULFUR_CUBE) {
                    add(fieldsOut, "age", "int"); add(fieldsOut, "age_locked", "boolean");
                    out.addProperty("bucket_age_key", "age");
                    // SulfurCube.setSpawnSize / ageBoundaryReached recompute attributes and can
                    // reset Health after the common bucket loader. A default schema is not a cap.
                    out.addProperty("bucket_health_dynamic", true);
                    // The verified native implementation scales MAX_HEALTH linearly with size.
                    // EntitySchema normalizes to MIN_SIZE; bucket spawn uses up to MAX_SIZE.
                    // Keep the ratio tied to the actual game constants, never a health table.
                    out.addProperty("bucket_health_size_ratio", (double)
                            net.minecraft.world.entity.monster.cubemob.SulfurCube.MAX_SIZE /
                            net.minecraft.world.entity.monster.cubemob.SulfurCube.MIN_SIZE);
                }
                //?}
                if (type == net.minecraft.world.entity.EntityTypes.SALMON) component(components, DataComponents.SALMON_SIZE);
                if (type == net.minecraft.world.entity.EntityTypes.TROPICAL_FISH) {
                    component(components, DataComponents.TROPICAL_FISH_PATTERN);
                    component(components, DataComponents.TROPICAL_FISH_BASE_COLOR);
                    component(components, DataComponents.TROPICAL_FISH_PATTERN_COLOR);
                }
            }
            out.add("bucket_fields", fieldsOut); out.add("bucket_components", components);
            out.addProperty("bucket_semantics", "Bucketable.loadDefaultDataFromBucketTag / species.loadFromBucketTag; variants via item components");
        } catch (ReflectiveOperationException | RuntimeException error) {
            out.addProperty("bucket_metadata_error", EditorI18n.tr("cadeditor.message.bucketitemmetadata.284387c450", (error.getClass().getSimpleName())));
            dev.rinorsi.editor.EditorDiagnostics.failure("registry.bucket_metadata", BuiltInRegistries.ITEM.getKey(item).toString(), error);
        }
    }

    private static void add(JsonArray list, String key, String type) {
        JsonObject field = new JsonObject(); field.addProperty("key", key); field.addProperty("type", type); list.add(field);
    }
    private static void component(JsonArray list, DataComponentType<?> type) { list.add(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type).toString()); }
}
