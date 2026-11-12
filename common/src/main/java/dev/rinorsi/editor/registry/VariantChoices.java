package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

import net.minecraft.util.StringRepresentable;

/** Non-registry variant components use their real StringRepresentable enums. */
public final class VariantChoices {
    private VariantChoices() {}
    public static StringRepresentable[] values(String name) {
        return switch (name) {
            case "axolotl_variant" -> net.minecraft.world.entity.animal.axolotl.Axolotl.Variant.values();
            case "horse_variant" -> net.minecraft.world.entity.animal.equine.Variant.values();
            case "llama_variant" -> net.minecraft.world.entity.animal.equine.Llama.Variant.values();
            case "mooshroom_variant" -> net.minecraft.world.entity.animal.cow.MushroomCow.Variant.values();
            case "fox_variant" -> net.minecraft.world.entity.animal.fox.Fox.Variant.values();
            case "rabbit_variant" -> net.minecraft.world.entity.animal.rabbit.Rabbit.Variant.values();
            case "parrot_variant" -> net.minecraft.world.entity.animal.parrot.Parrot.Variant.values();
            case "tropical_fish_pattern" -> net.minecraft.world.entity.animal.fish.TropicalFish.Pattern.values();
            case "salmon_size" -> net.minecraft.world.entity.animal.fish.Salmon.Variant.values();
            default -> throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.variantchoices.405e4e80c8", (name)));
        };
    }
}
