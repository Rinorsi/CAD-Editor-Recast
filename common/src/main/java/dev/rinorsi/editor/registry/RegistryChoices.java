package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.ChatFormatting;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.locale.Language;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.FireworkExplosion;

/** Values come from the running game and resource packs, never from UI option tables. */
public final class RegistryChoices {
    private RegistryChoices() {}
    public static JsonArray tooltipStyles(ResourceManager resources) {
        JsonArray entries = new JsonArray();
        var sprites = resources.listResources("textures/gui/sprites/tooltip", id -> id.getPath().endsWith(".png"));
        sprites.keySet().stream().filter(id -> id.getPath().endsWith("_background.png"))
                .sorted(java.util.Comparator.comparing(Object::toString)).forEach(resource -> {
                    String path = resource.getPath(), prefix = "textures/gui/sprites/tooltip/";
                    String base = path.substring(prefix.length(), path.length() - "_background.png".length());
                    String id = resource.getNamespace() + ":" + base;
                    JsonObject row = row(id, id);
                    row.addProperty("has_frame", sprites.containsKey(net.minecraft.resources.Identifier.fromNamespaceAndPath(resource.getNamespace(), prefix + base + "_frame.png")));
                    entries.add(row);
                });
        return entries;
    }
    public static JsonArray equipmentAssets(ResourceManager resources) {
        JsonArray entries = new JsonArray();
        resources.listResources("equipment", id -> id.getPath().endsWith(".json")).keySet().stream()
                .sorted(java.util.Comparator.comparing(Object::toString)).forEach(resource -> {
                    String path = resource.getPath();
                    String id = resource.getNamespace() + ":" + path.substring("equipment/".length(), path.length() - ".json".length());
                    entries.add(row(id, id));
                });
        return entries;
    }
    public static JsonArray enumEntries(String name) {
        // 26.2 removed named colors from StringRepresentable ChatFormatting.
        //? if >=26.2 {
        if (name.equals("text_color")) return textColors();
        //?}
        JsonArray entries = new JsonArray();
        if (name.equals("consume_effect_type")) {
            BuiltInRegistries.CONSUME_EFFECT_TYPE.keySet().stream().sorted(java.util.Comparator.comparing(Object::toString))
                    .forEach(id -> entries.add(row(id.toString(), translated("consume_effect_type." + id.getNamespace() + "." + id.getPath(), id.toString()))));
            return entries;
        }
        StringRepresentable[] values = switch (name) {
            case "use_animation" -> ItemUseAnimation.values();
            case "equipment_slot" -> EquipmentSlot.values();
            case "equipment_slot_group" -> EquipmentSlotGroup.values();
            case "attribute_operation" -> AttributeModifier.Operation.values();
            case "rarity" -> Rarity.values();
            case "firework_shape" -> FireworkExplosion.Shape.values();
            case "dye_color" -> DyeColor.values();
            //? if <26.2 {
            /*case "text_color" -> java.util.Arrays.stream(ChatFormatting.values()).filter(ChatFormatting::isColor).toArray(ChatFormatting[]::new);
            *///?}
            default -> VariantChoices.values(name);
        };
        for (StringRepresentable value : values) {
            String id = value.getSerializedName();
            String display = translated(name + "." + id, id);
            JsonObject entry = row(id, display);
            if (value instanceof Enum<?> constant) entry.addProperty("symbol", constant.name());
            if (value instanceof FireworkExplosion.Shape shape) entry.addProperty("name", shape.getName().getString());
            if (value instanceof DyeColor color) {
                entry.addProperty("name", translated("color.minecraft." + id, id));
                entry.addProperty("rgb", color.getTextureDiffuseColor() & 0xffffff);
            }
            //? if <26.2 {
            /*if (value instanceof ChatFormatting color) {
                entry.addProperty("name", translated("color.minecraft." + id, id));
                entry.addProperty("rgb", color.getColor());
            }
            *///?}
            entries.add(entry);
        }
        return entries;
    }
    //? if >=26.2 {
    private static JsonArray textColors() {
        var out = new JsonArray();
        // Discover named constants from the runtime class. No copied color names or RGB table.
        for (var field : net.minecraft.network.chat.TextColor.class.getFields()) {
            if (field.getType() != net.minecraft.network.chat.TextColor.class || !java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
            try {
                var color = (net.minecraft.network.chat.TextColor) field.get(null);
                var id = color.serialize();
                var entry = row(id, translated("color.minecraft." + id, id));
                entry.addProperty("symbol", field.getName());
                entry.addProperty("rgb", color.getValue());
                out.add(entry);
            } catch (IllegalAccessException e) { throw new IllegalStateException(e); }
        }
        return out;
    }
    //?}
    private static JsonObject row(String id, String name) {
        JsonObject entry = new JsonObject(); entry.addProperty("id", id); entry.addProperty("name", name); return entry;
    }
    private static String translated(String key, String fallback) {
        return Language.getInstance().has(key) ? Language.getInstance().getOrDefault(key) : fallback;
    }
}
