package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.core.BlockPos;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.Container;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.BundleItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.level.block.EntityBlock;

/** Physical item facts absent from the prototype component map. Never places blocks/entities. */
public final class ItemMetadata {
    private ItemMetadata() {}
    public static JsonArray entries(RegistryAccess access, Identifier only) {
        var registry = access.lookup(Registries.ITEM).orElse(BuiltInRegistries.ITEM);
        if (only != null && !registry.containsKey(only)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.itemmetadata.88b3a85a5a", (only)));
        JsonArray entries = new JsonArray();
        registry.listElements().filter(h -> only == null || h.key().identifier().equals(only))
                .sorted(java.util.Comparator.comparing(h -> h.key().identifier().toString()))
                .forEach(h -> entries.add(entry(h.value())));
        return entries;
    }
    public static JsonObject entry(Item item) {
        JsonObject out = new JsonObject();
        out.addProperty("id", BuiltInRegistries.ITEM.getKey(item).toString());
        var comps = item.components();
        out.addProperty("tool", comps.has(DataComponents.TOOL));
        out.addProperty("weapon", comps.has(DataComponents.WEAPON) || comps.has(DataComponents.KINETIC_WEAPON) || comps.has(DataComponents.PIERCING_WEAPON));
        out.addProperty("food", comps.has(DataComponents.FOOD));
        out.addProperty("consumable", comps.has(DataComponents.CONSUMABLE));
        out.addProperty("jukebox_playable", comps.has(DataComponents.JUKEBOX_PLAYABLE));
        out.addProperty("ranged_weapon", item instanceof net.minecraft.world.item.ProjectileWeaponItem);
        var equip = comps.get(DataComponents.EQUIPPABLE);
        if (equip != null) out.addProperty("equipment_slot", equip.slot().getSerializedName());
        var attributes = comps.get(DataComponents.ATTRIBUTE_MODIFIERS);
        if (equip != null && attributes != null && attributes.modifiers().stream().anyMatch(e -> e.attribute().equals(net.minecraft.world.entity.ai.attributes.Attributes.ARMOR)))
            out.addProperty("armor_slot", equip.slot().getSerializedName());
        out.addProperty("block_item", item instanceof BlockItem);
        if (item instanceof SpawnEggItem) {
            var type = SpawnEggItem.getType(new ItemStack(item));
            if (type != null) out.addProperty("spawn_egg_entity", BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
        }
        BucketItemMetadata.append(item, out);
        if (item instanceof BlockItem blockItem) {
            var block = blockItem.getBlock();
            out.addProperty("block", BuiltInRegistries.BLOCK.getKey(block).toString());
            if (block instanceof EntityBlock entityBlock) {
                try {
                    var entity = entityBlock.newBlockEntity(BlockPos.ZERO, block.defaultBlockState());
                    if (entity != null) {
                        out.addProperty("block_entity_type", BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(entity.getType()).toString());
                        if (entity instanceof Container container) out.addProperty("container_size", container.getContainerSize());
                        else if (entity instanceof net.minecraft.world.level.block.entity.CampfireBlockEntity campfire) out.addProperty("container_size", campfire.getItems().size());
                    }
                } catch (RuntimeException e) { out.addProperty("metadata_error", EditorI18n.tr("cadeditor.message.itemmetadata.1b3bec4ba3", (e.getClass().getSimpleName()))); }
            }
        }
        boolean bundle = item instanceof BundleItem || comps.has(DataComponents.BUNDLE_CONTENTS);
        out.addProperty("bundle", bundle);
        if (bundle) {
            // Saturate the vanilla Mutable through its public insertion rules. The result is a
            // normalized Fraction capacity, not a guessed count of arbitrary stack-size items.
            var candidate = BuiltInRegistries.ITEM.stream().map(ItemStack::new)
                    .filter(s -> !s.isEmpty() && BundleContents.canItemBeInBundle(s) && !s.has(DataComponents.BUNDLE_CONTENTS))
                    .max(java.util.Comparator.comparingInt(ItemStack::getMaxStackSize));
            if (candidate.isPresent()) {
                var mutable = new BundleContents.Mutable();
                var stack = candidate.get(); stack.setCount(Integer.MAX_VALUE);
                int inserted = mutable.tryInsert(stack);
                var capacity = mutable.weight();
                JsonObject value = new JsonObject();
                value.addProperty("numerator", capacity.getNumerator()); value.addProperty("denominator", capacity.getDenominator());
                out.add("bundle_capacity", value);
                out.addProperty("bundle_capacity_source", "minecraft:bundle_contents");
                out.addProperty("bundle_reference_item", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
                out.addProperty("bundle_reference_count", inserted);
            }
        }
        return out;
    }
}
