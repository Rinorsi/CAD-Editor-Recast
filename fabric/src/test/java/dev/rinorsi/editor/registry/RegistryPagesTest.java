package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

public final class RegistryPagesTest {
    public static void main(String[] args) {
        ModelHintsTest.run();
        warmupFailureChecks();
        JsonArray rows = new JsonArray();
        for (int i = 0; i < 4000; i++) {
            JsonObject row = new JsonObject(); row.addProperty("id", "example:item_" + i);
            row.addProperty("name", "汉字\"\n😀".repeat(8)); rows.add(row);
        }
        var pages = RegistryPages.split("example:items", "generation-1", rows);
        if (pages.size() < 2) throw new AssertionError("not split");
        JsonArray rebuilt = new JsonArray();
        for (var page : pages) {
            if (page.toString().length() > RegistryPages.MAX_CHARS) throw new AssertionError("oversized");
            if (page.get("offset").getAsInt() != rebuilt.size()) throw new AssertionError("bad offset");
            rebuilt.addAll(page.getAsJsonArray("entries"));
        }
        if (!rebuilt.equals(rows) || !pages.getLast().get("done").getAsBoolean()) throw new AssertionError("lost rows");
        var empty = RegistryPages.split("example:empty", "2", new JsonArray());
        if (empty.size() != 1 || !empty.getFirst().get("done").getAsBoolean()) throw new AssertionError("empty");
        JsonArray big = new JsonArray(); big.add("x".repeat(RegistryPages.MAX_CHARS));
        try { RegistryPages.split("example:huge", "3", big); throw new AssertionError("oversized accepted"); }
        catch (IllegalArgumentException expected) {}
        JsonObject context = new JsonObject(); context.addProperty("id", "example:" + "x".repeat(7000)); context.addProperty("field", "supported");
        var contextual = RegistryPages.split("minecraft:enchantment", "4", rows, context);
        for (var page : contextual) if (page.toString().length() > RegistryPages.MAX_CHARS || !page.get("id").equals(context.get("id")))
            throw new AssertionError("relation context outside page budget");
        net.minecraft.SharedConstants.tryDetectVersion();
        net.minecraft.server.Bootstrap.bootStrap();
        net.minecraft.core.registries.BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(net.minecraft.data.registries.VanillaRegistries.createLookup()).forEach(p -> p.apply());
        var access = net.minecraft.core.RegistryAccess.fromRegistryOfRegistries(net.minecraft.core.registries.BuiltInRegistries.REGISTRY);
        var swordId = net.minecraft.resources.Identifier.withDefaultNamespace("diamond_sword");
        var sword = ItemDefaults.entries(access, swordId).get(0).getAsJsonObject();
        if (sword.getAsJsonObject("comps").get("max_damage").getAsInt() != net.minecraft.world.item.Items.DIAMOND_SWORD.components().get(net.minecraft.core.component.DataComponents.MAX_DAMAGE))
            throw new AssertionError("prototype default missing");
        if (!new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.DIAMOND_SWORD).getComponentsPatch().isEmpty()) throw new AssertionError("fresh stack must have empty patch");
        // Full prototypes need loaded dynamic tags (e.g. netherite damage resistance); covered by the live probe.
        var defaults = ItemDefaults.entries(access, swordId);
        if (defaults.size() != 1) throw new AssertionError("one-item query returned another item");
        for (var page : RegistryPages.split("item_defaults", "defaults", defaults)) if (page.toString().length() > RegistryPages.MAX_CHARS) throw new AssertionError("prototype page oversized");
        var nbt = new net.minecraft.nbt.CompoundTag(); nbt.putByte("byte", (byte) 7); nbt.putIntArray("array", new int[]{1,2,3}); nbt.putLong("long", 9007199254740993L);
        var typed = new net.minecraft.core.component.TypedDataComponent<>(net.minecraft.core.component.DataComponents.CUSTOM_DATA, net.minecraft.world.item.component.CustomData.of(nbt));
        if (!ItemDefaults.encode(typed, access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE)).getAsString().equals(nbt.toString()))
            throw new AssertionError("SNBT lost numeric/array types");
        System.out.println("PASS prototype default components, one-item query, <=24000-character pages, and typed NBT SNBT preservation");
        verifyEnum("use_animation", net.minecraft.world.item.ItemUseAnimation.CODEC);
        verifyEnum("equipment_slot", net.minecraft.world.entity.EquipmentSlot.CODEC);
        verifyEnum("equipment_slot_group", net.minecraft.world.entity.EquipmentSlotGroup.CODEC);
        verifyEnum("attribute_operation", net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.CODEC);
        verifyEnum("rarity", net.minecraft.world.item.Rarity.CODEC);
        verifyEnum("firework_shape", net.minecraft.world.item.component.FireworkExplosion.Shape.CODEC);
        verifyEnum("dye_color", net.minecraft.world.item.DyeColor.CODEC);
        verifyEnum("text_color", net.minecraft.ChatFormatting.COLOR_CODEC);
        var effects = RegistryChoices.enumEntries("consume_effect_type");
        if (effects.size() != net.minecraft.core.registries.BuiltInRegistries.CONSUME_EFFECT_TYPE.size()) throw new AssertionError("consume types omitted");
        for (var color : RegistryChoices.enumEntries("text_color")) {
            var entry = color.getAsJsonObject();
            if (entry.get("rgb").getAsInt() != net.minecraft.ChatFormatting.getByName(entry.get("id").getAsString()).getColor())
                throw new AssertionError("text color RGB differs from game");
        }
        System.out.println("PASS registry serialization, UTF-16 escaping, pagination, offsets, empty and oversized entry checks; " + pages.size() + " pages");
        System.out.println("PASS all nine official enum/registry choices; serialized names parse with official codecs and color RGB matches game");
    }
    private static <T> void verifyEnum(String kind, com.mojang.serialization.Codec<T> codec) {
        var entries = RegistryChoices.enumEntries(kind);
        if (entries.isEmpty()) throw new AssertionError("empty " + kind);
        for (var row : entries) codec.parse(com.mojang.serialization.JsonOps.INSTANCE, row.getAsJsonObject().get("id")).getOrThrow();
    }
    private static void warmupFailureChecks() {
        JsonObject huge = new JsonObject(); huge.addProperty("id", "test:huge"); huge.addProperty("name", "x".repeat(30_000));
        JsonObject good = new JsonObject(); good.addProperty("id", "test:good"); good.addProperty("name", "good");
        java.util.Map<String, java.util.function.Supplier<java.util.Iterator<JsonObject>>> sources = new java.util.LinkedHashMap<>();
        sources.put("test:huge", () -> new java.util.ArrayList<>(java.util.List.of(huge)).iterator());
        sources.put("test:broken", () -> { throw new IllegalArgumentException("broken mod"); });
        sources.put("test:mapped", () -> java.util.stream.Stream.of(good).<JsonObject>map(row -> { throw new IllegalArgumentException("mapped hasNext failure"); }).iterator());
        sources.put("test:good", () -> new java.util.ArrayList<>(java.util.List.of(good)).iterator());
        var warmup = new RegistryWarmup("test", sources);
        long deadline = System.nanoTime() + 5_000_000_000L;
        while (!warmup.complete()) { warmup.tick(); Thread.yield(); if (System.nanoTime() > deadline) throw new AssertionError("warmup failure timeout"); }
        for (String name : new String[]{"test:huge", "test:broken", "test:mapped"})
            if (!com.google.gson.JsonParser.parseString(warmup.index(name).pages().getFirst()).getAsJsonObject().has("error")) throw new AssertionError("failure escaped tick or missing error page");
        if (warmup.index("test:good").size != 1) throw new AssertionError("bad mod blocked remaining registries");
        System.out.println("PASS warmup errors isolated per registry (oversized row/source failure), successful registries still indexed");
    }
}
