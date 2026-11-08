package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.DefaultAttributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.SpawnEggItem;

/** Registry-backed defaults; never samples an equipped/live entity's modified values. */
public final class EntityDefaults {
    private EntityDefaults() {}
    @SuppressWarnings("unchecked")
    public static JsonObject attributes(EntityType<?> type) {
        AttributeSupplier supplier = type == net.minecraft.world.entity.EntityTypes.PLAYER ? Player.createAttributes().build()
                : DefaultAttributes.hasSupplier(type) ? DefaultAttributes.getSupplier((EntityType<? extends LivingEntity>) type) : null;
        JsonObject out = new JsonObject();
        if (supplier != null) BuiltInRegistries.ATTRIBUTE.listElements().forEach(holder -> {
            if (supplier.hasAttribute(holder)) out.addProperty(holder.key().identifier().toString(), supplier.getBaseValue(holder));
        });
        return out;
    }
    public static JsonArray slotGroups() {
        JsonArray out = new JsonArray();
        for (EquipmentSlotGroup group : EquipmentSlotGroup.values()) {
            JsonObject row = new JsonObject(); row.addProperty("id", group.getSerializedName());
            JsonArray slots = new JsonArray();
            for (EquipmentSlot slot : EquipmentSlot.values()) if (group.test(slot)) slots.add(slot.getSerializedName());
            row.add("slots", slots); out.add(row);
        }
        return out;
    }
    public static JsonObject describe(EntityType<?> type, Entity entity, HolderLookup.Provider lookup) {
        JsonObject row = new JsonObject();
        row.addProperty("id", BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
        row.addProperty("name", type.getDescription().getString());
        row.add("attributes", attributes(type));
        JsonArray eggs = new JsonArray();
        // Includes modded eggs and does not assume one egg per type.
        BuiltInRegistries.ITEM.forEach(item -> {
            if (item instanceof SpawnEggItem && SpawnEggItem.getType(item.getDefaultInstance()) == type)
                eggs.add(BuiltInRegistries.ITEM.getKey(item).toString());
        });
        row.add("spawn_eggs", eggs);
        JsonArray slots = new JsonArray();
        if (entity instanceof LivingEntity living) for (EquipmentSlot slot : EquipmentSlot.values())
            if (living.canUseSlot(slot)) slots.add(slot.getSerializedName());
        row.add("equipment_slots", slots);
        JsonArray sources = new JsonArray();
        if (entity != null) BuiltInRegistries.DATA_COMPONENT_TYPE.forEach(typeComponent -> addSource(entity, typeComponent, lookup, sources));
        row.add("variant_sources", sources);
        addSounds(row, entity);
        return row;
    }
    /** Calls the real virtual methods on the detached default instance, including variant overrides. */
    static void addSounds(JsonObject row, Entity entity) {
        if (entity == null) return;
        try {
            JsonObject sounds = new JsonObject();
            sounds.addProperty("ambient", entity instanceof Mob
                    ? soundId(Mob.class.getDeclaredMethod("getAmbientSound"), entity) : null);
            sounds.addProperty("hurt", entity instanceof LivingEntity
                    ? soundId(LivingEntity.class.getDeclaredMethod("getHurtSound", DamageSource.class), entity, entity.level().damageSources().generic()) : null);
            sounds.addProperty("death", entity instanceof LivingEntity
                    ? soundId(LivingEntity.class.getDeclaredMethod("getDeathSound"), entity) : null);
            // Publish atomically: unavailable methods or a modded override throwing omit the entire field.
            row.add("sounds", sounds);
        } catch (ReflectiveOperationException | RuntimeException ignored) {
            // Sound metadata is optional and must not prevent the rest of entity_info from loading.
        }
    }
    private static String soundId(java.lang.reflect.Method method, Entity entity, Object... args) throws ReflectiveOperationException {
        // These protected methods have no public read-only equivalent. Reflection also works in the
        // standalone vanilla JVM checks, without requiring loader access transformations.
        method.setAccessible(true);
        SoundEvent sound = (SoundEvent) method.invoke(entity, args);
        var id = sound == null ? null : BuiltInRegistries.SOUND_EVENT.getKey(sound);
        return id == null ? null : id.toString();
    }
    private static <T> void addSource(Entity entity, DataComponentType<T> type, HolderLookup.Provider lookup, JsonArray sources) {
        T value = entity.get(type);
        if (value == null || type.codec() == null) return;
        if (!(value instanceof Holder<?>) && !(value instanceof Enum<?>)) return;
        JsonObject row = new JsonObject();
        row.addProperty("component", BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type).toString());
        try {
            row.add("default", type.codec().encodeStart(lookup.createSerializationContext(JsonOps.INSTANCE), value).getOrThrow());
            if (value instanceof Holder<?> holder) {
                if (holder.unwrapKey().isEmpty()) return;
                row.addProperty("registry", holder.unwrapKey().orElseThrow().registry().toString());
            } else if (value instanceof Enum<?> choice) {
                JsonArray choices = new JsonArray();
                for (Object constant : choice.getDeclaringClass().getEnumConstants()) {
                    @SuppressWarnings("unchecked") T option = (T) constant;
                    choices.add(type.codec().encodeStart(lookup.createSerializationContext(JsonOps.INSTANCE), option).getOrThrow());
                }
                row.add("values", choices);
            }
            sources.add(row);
        } catch (RuntimeException error) {
            row.addProperty("error", error.toString()); sources.add(row);
        }
    }
}
