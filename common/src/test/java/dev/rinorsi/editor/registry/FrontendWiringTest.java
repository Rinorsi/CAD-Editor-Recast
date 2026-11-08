package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.ComponentValidation;
import dev.rinorsi.editor.StackCodec;
import java.nio.file.*;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.*;
import net.minecraft.locale.Language;
import net.minecraft.resources.Identifier;
import net.minecraft.server.Bootstrap;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.*;

/** Real registries/codecs, no window, Gradle invocation, or world writes. */
public final class FrontendWiringTest {
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
        var capture = new JsonObject();
        RegistrySnapshot.KINDS.forEach((alias, path) -> check(RegistrySnapshot.initialName(alias).equals("minecraft:" + path), "initial publication alias " + alias));
        check(RegistrySnapshot.initialName("enum:text_color").equals("enum:text_color"), "extension names are not rewritten");
        check(RegistrySnapshot.initialName("example:custom").equals("example:custom"), "mod registry names are not rewritten");
        var enums = new JsonObject();
        // API names under test, not candidate lists; candidates must all come from game values().
        for (String name : new String[]{"use_animation", "equipment_slot", "equipment_slot_group", "attribute_operation", "rarity", "firework_shape", "consume_effect_type", "dye_color", "text_color", "axolotl_variant", "horse_variant", "llama_variant", "mooshroom_variant", "fox_variant", "rabbit_variant", "parrot_variant", "tropical_fish_pattern", "salmon_size"}) {
            var rows = RegistryChoices.enumEntries(name);
            check(!rows.isEmpty(), "enum available " + name);
            for (var element : rows) {
                var row = element.getAsJsonObject();
                check(row.has("id") && row.has("name"), "wire identity " + name);
                if (!name.equals("consume_effect_type")) check(row.has("symbol"), "actual Java symbol " + name);
            }
            enums.add(name, rows);
        }
        var animations = RegistryChoices.enumEntries("use_animation");
        for (int i = 0; i < ItemUseAnimation.values().length; i++) {
            check(animations.get(i).getAsJsonObject().get("symbol").getAsString().equals(ItemUseAnimation.values()[i].name()), "symbol equals actual constant");
            check(animations.get(i).getAsJsonObject().get("id").getAsString().equals(ItemUseAnimation.values()[i].getSerializedName()), "wire value equals serialized name");
        }
        capture.add("enums", enums);
        var labels = new JsonArray();
        var logs = TagKey.create(Registries.ITEM, Identifier.parse("minecraft:logs"));
        var missing = TagKey.create(Registries.BLOCK, Identifier.parse("wiring_test:unknown/nested"));
        var customRegistry = net.minecraft.resources.ResourceKey.<net.minecraft.core.Registry<Item>>createRegistryKey(Identifier.parse("wiring_test:custom/registry"));
        var custom = TagKey.create(customRegistry, Identifier.parse("wiring_test:nested/tag"));
        var original = Language.getInstance();
        Language.inject(new Language() {
            @Override public String getOrDefault(String key, String fallback) { return key.equals("tag.item.minecraft.logs") ? "Translated logs" : original.getOrDefault(key, fallback); }
            @Override public boolean has(String key) { return key.equals("tag.item.minecraft.logs") || original.has(key); }
            @Override public boolean isDefaultRightToLeft() { return original.isDefaultRightToLeft(); }
            @Override public net.minecraft.util.FormattedCharSequence getVisualOrder(net.minecraft.network.chat.FormattedText text) { return original.getVisualOrder(text); }
        });
        try {
            check(RegistrySnapshot.tagLabel(logs).get("name").getAsString().equals("Translated logs"), "active language used");
            check(RegistrySnapshot.tagLabel(missing).get("name").getAsString().equals(missing.location().toString()), "missing translation keeps ID");
            check(RegistrySnapshot.tagLabel(custom).get("translation_key").getAsString().equals("tag.wiring_test.custom.registry.wiring_test.nested.tag"), "mod registry uses Fabric convention");
        } finally { Language.inject(original); }
        // Receipt uses original game language, never the translated test fixture above.
        labels.add(RegistrySnapshot.tagLabel(logs)); capture.add("tag_labels", labels);
        var request = new JsonObject(); request.addProperty("requestId", "wiring-snbt"); request.addProperty("component", "custom_data");
        request.addProperty("snbt", "{byte:1b,long:9007199254740993L}");
        var result = ComponentValidation.validate(request, access);
        check(result.get("ok").getAsBoolean(), "typed SNBT valid"); capture.add("validate_success", result);
        request.addProperty("component", "wiring_test:missing");
        var failure = ComponentValidation.validate(request, access);
        check(!failure.get("ok").getAsBoolean() && !failure.has("normalized"), "failed normalization never leaks value"); capture.add("validate_failure", failure);
        var egg = ItemDefaults.entries(access, Identifier.parse("minecraft:pig_spawn_egg"));
        var eggRow = egg.get(0).getAsJsonObject();
        check(eggRow.getAsJsonObject("comps").getAsJsonObject("entity_data").get("id").getAsString().equals("minecraft:pig"), "typed entity data has JSON id");
        var validation = new JsonObject(); validation.addProperty("component", "entity_data"); validation.add("value", eggRow.getAsJsonObject("comps").get("entity_data"));
        var normalizedEgg = ComponentValidation.validate(validation, access);
        check(normalizedEgg.getAsJsonObject("json").get("id").getAsString().equals("minecraft:pig"), "egg ID available through validator JSON");
        capture.add("egg_defaults", egg); capture.add("egg_validation", normalizedEgg);
        var item = new ItemStack(Items.PAPER);
        var draft = StackCodec.snapshot(item, access, new JsonObject(), "");
        draft.getAsJsonObject("comps").add("custom_data", result.get("snbt"));
        var formats = new JsonObject(); formats.addProperty("custom_data", "snbt"); draft.add("component_formats", formats);
        var saved = StackCodec.decode(draft, access);
        var snapshot = StackCodec.snapshot(saved, access, new JsonObject(), "");
        check(ItemStack.matches(saved, StackCodec.decode(snapshot, access)), "sidecar preserves long and byte");
        capture.add("typed_apply_item", draft); capture.add("typed_snapshot", snapshot);
        var metadata = new JsonArray();
        for (var type : new Item[]{Items.CHEST, Items.BUNDLE, Items.PIG_SPAWN_EGG, Items.DIAMOND_CHESTPLATE, Items.PLAYER_HEAD, Items.CROSSBOW}) metadata.add(ItemMetadata.entry(type));
        capture.add("item_meta", metadata);
        var base = new JsonObject(); base.addProperty("id", "minecraft:player"); base.add("attributes", EntityDefaults.attributes(net.minecraft.world.entity.EntityTypes.PLAYER)); capture.add("player_base_attributes", base);
        capture.add("equipment_slot_groups", EntityDefaults.slotGroups()); capture.add("spawner_info", SpawnerData.entries(lookup));
        var unavailable = RegistrySupplement.unavailable(null);
        capture.add("remote_loot_page", RegistryPages.split("minecraft:loot_table", "wiring-test", unavailable.entries(), unavailable.context()).getFirst());
        check(capture.getAsJsonObject("remote_loot_page").get("availability").getAsString().equals("unavailable"), "unavailable differs from complete empty list");
        var named = new JsonObject(); named.addProperty("id", "minecraft:logs"); named.addProperty("field", "members");
        var tagPage = RegistryPages.split("tag:item", "wiring-test", new JsonArray(), named).getFirst();
        check(tagPage.get("id").getAsString().equals("minecraft:logs"), "tag paging preserves ID");
        capture.addProperty("checks", checks); capture.addProperty("status", "PASSED");
        if (args.length > 0) Files.writeString(Path.of(args[0]), new GsonBuilder().setPrettyPrinting().create().toJson(capture));
        System.out.println("PASS FrontendWiringTest " + checks + " checks");
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); checks++; }
}
