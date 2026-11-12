package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.item.component.ItemLore;

/** Explicitly requested test fixtures, never an item/option registry or normal gameplay entrypoint. */
public final class TestKit {
    static final String MARKER = "物品工坊测试道具 / 26.1.2 / v1";
    public record Specimen(int number, String title, Set<String> components, ItemStack stack) {}
    private TestKit() {}

    public static Set<String> expectedComponents() {
        Set<String> out = new HashSet<>();
        //? if >=26.2 {
        BuiltInRegistries.DATA_COMPONENT_TYPE.forEach(type -> {
            var id = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type);
            if (!type.isTransient() && id.getNamespace().equals("minecraft")) out.add(id.getPath());
        });
        return Set.copyOf(out);
        //?} else {
        /*for (var id : JsonParser.parseString(TestKitFixtures.EXPECTED).getAsJsonArray()) out.add(id.getAsString());
        return Set.copyOf(out);
        *///?}
    }

    public static List<Specimen> create(HolderLookup.Provider registries, boolean includeModded) {
        var out = new ArrayList<Specimen>();
        var covered = new HashSet<String>();
        var failures = new ArrayList<String>();
        for (var value : JsonParser.parseString(TestKitFixtures.JSON).getAsJsonArray()) {
            var fixture = value.getAsJsonObject();
            int number = fixture.get("n").getAsInt();
            String title = fixture.get("title").getAsString();
            var keys = new HashSet<String>();
            fixture.getAsJsonArray("keys").forEach(key -> keys.add(key.getAsString()));
            try {
                var encoded = new JsonObject();
                encoded.addProperty("id", fixture.get("base").getAsString());
                encoded.addProperty("count", 1);
                encoded.add("components", fixture.getAsJsonObject("values"));
                // Fixtures were audited against 26.1.2 (data version 4790). Let vanilla migrate their wire data.
                //? if >=26.3 {
                var qualified = new JsonObject();
                encoded.getAsJsonObject("components").entrySet().forEach(e -> qualified.add(Identifier.withDefaultNamespace(e.getKey()).toString(), e.getValue()));
                encoded.add("components", qualified);
                encoded = net.minecraft.util.datafix.DataFixers.getDataFixer().update(net.minecraft.util.datafix.fixes.References.ITEM_STACK,
                    new com.mojang.serialization.Dynamic<>(JsonOps.INSTANCE, encoded), 4790,
                    net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version()).getValue().getAsJsonObject();
                keys.removeIf(key -> !BuiltInRegistries.DATA_COMPONENT_TYPE.containsKey(Identifier.withDefaultNamespace(key)));
                //?}
                var stack = ItemStack.CODEC.parse(registries.createSerializationContext(JsonOps.INSTANCE), encoded).getOrThrow();
                var base = new ItemStack(stack.getItem());
                // Every claimed component must be present AND differ from the base item's actual default.
                for (String key : keys) {
                    var type = BuiltInRegistries.DATA_COMPONENT_TYPE.getValue(Identifier.withDefaultNamespace(key));
                    if (type == null || type.isTransient() || !nonDefault(stack, base, type, registries))
                        throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkit.affbff0490", (key)));
                }
                markTree(stack, EditorI18n.tr("cadeditor.message.testkit.186a5be89d", (number), (title)), 0);
                roundTrip(stack, registries);
                out.add(new Specimen(number, title, Set.copyOf(keys), stack)); covered.addAll(keys);
            } catch (RuntimeException error) { failures.add(EditorI18n.tr("cadeditor.message.testkit.e97cc13da4", (number), (keys), (error.getMessage()))); }
        }
        if (!failures.isEmpty()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkit.3ca8a351f5", (String.join("\n", failures))));
        //? if >=26.2 {
        for (String key : new java.util.TreeSet<>(expectedComponents())) {
            if (covered.contains(key)) continue;
            var type = BuiltInRegistries.DATA_COMPONENT_TYPE.getValue(Identifier.withDefaultNamespace(key));
            var stack = dev.rinorsi.editor.registry.ComponentSamples.nonDefault(type, registries);
            int number = out.size() + 1;
            markTree(stack, EditorI18n.tr("cadeditor.message.testkit.186a5be89d", (number), (key)), 0); roundTrip(stack, registries);
            out.add(new Specimen(number, key, Set.of(key), stack)); covered.add(key);
        }
        //?}
        if (!covered.equals(expectedComponents())) throw new IllegalStateException(EditorI18n.tr("cadeditor.message.testkit.251bde4be1"));
        if (includeModded) {
            try { addModded(out, registries); }
            catch (RuntimeException error) {
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkit.aef5f23c79", (error.getMessage())), error);
            }
        }
        return List.copyOf(out);
    }
    private static <T> boolean nonDefault(ItemStack stack, ItemStack base, net.minecraft.core.component.DataComponentType<T> type,
                                          HolderLookup.Provider registries) {
        T sample = stack.get(type), original = base.get(type);
        if (sample == null) return false;
        if (original == null) return true;
        var ops = registries.createSerializationContext(NbtOps.INSTANCE);
        return !type.codec().encodeStart(ops, sample).getOrThrow().equals(type.codec().encodeStart(ops, original).getOrThrow());
    }

    private static void addModded(ArrayList<Specimen> out, HolderLookup.Provider registries) {
        var item = BuiltInRegistries.ITEM.keySet().stream().filter(id -> !id.getNamespace().equals("minecraft"))
                .sorted(java.util.Comparator.comparing(Object::toString)).findFirst();
        var enchant = registries.lookupOrThrow(Registries.ENCHANTMENT).listElements()
                .filter(holder -> !holder.key().identifier().getNamespace().equals("minecraft"))
                .sorted(java.util.Comparator.comparing(holder -> holder.key().identifier().toString())).findFirst();
        var effect = BuiltInRegistries.MOB_EFFECT.keySet().stream().filter(id -> !id.getNamespace().equals("minecraft"))
                .sorted(java.util.Comparator.comparing(Object::toString)).findFirst();
        if (item.isEmpty() && enchant.isEmpty() && effect.isEmpty()) return;
        var data = new JsonObject(); data.addProperty("id", item.map(Object::toString).orElse("minecraft:paper"));
        data.addProperty("count", 1); var components = new JsonObject();
        enchant.ifPresent(holder -> {
            var levels = new JsonObject(); levels.addProperty(holder.key().identifier().toString(), 1);
            components.add("minecraft:enchantments", levels);
        });
        effect.ifPresent(id -> {
            var contents = new JsonObject(); var effects = new com.google.gson.JsonArray();
            var instance = new JsonObject(); instance.addProperty("id", id.toString()); instance.addProperty("duration", 200);
            effects.add(instance); contents.add("custom_effects", effects); components.add("minecraft:potion_contents", contents);
        });
        data.add("components", components);
        var stack = ItemStack.CODEC.parse(registries.createSerializationContext(JsonOps.INSTANCE), data).getOrThrow();
        int number = out.size() + 1;
        markTree(stack, EditorI18n.tr("cadeditor.message.testkit.b3ece8b067", (number)), 0); roundTrip(stack, registries);
        out.add(new Specimen(number, EditorI18n.tr("cadeditor.message.testkit.822864b0f6"), Set.of(), stack));
    }

    static void markTree(ItemStack stack, String name, int depth) {
        if (depth > 16) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkit.5e377c7f6c"));
        stack.set(DataComponents.CUSTOM_NAME, Component.literal(name));
        var lore = new ArrayList<>(stack.getOrDefault(DataComponents.LORE, ItemLore.EMPTY).lines());
        lore.removeIf(line -> line.getString().equals(MARKER)); lore.add(Component.literal(MARKER));
        stack.set(DataComponents.LORE, new ItemLore(lore));
        var container = stack.get(DataComponents.CONTAINER);
        if (container != null) {
            var children = dev.rinorsi.editor.ContainerCopies.copies(container).toList();
            for (var child : children) if (!child.isEmpty() && !owned(child)) markTree(child, EditorI18n.tr("cadeditor.message.testkit.60c1dee576", (name)), depth + 1);
            stack.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(children));
        }
        var bundle = stack.get(DataComponents.BUNDLE_CONTENTS);
        if (bundle != null) {
            var children = dev.rinorsi.editor.ContainerCopies.copies(bundle).toList();
            children.forEach(child -> { if (!owned(child)) markTree(child, EditorI18n.tr("cadeditor.message.testkit.60c1dee576", (name)), depth + 1); });
            stack.set(DataComponents.BUNDLE_CONTENTS, new BundleContents(children.stream().map(ItemStackTemplate::fromNonEmptyStack).toList()));
        }
    }
    static boolean owned(ItemStack stack) {
        return !stack.isEmpty() && stack.getOrDefault(DataComponents.LORE, ItemLore.EMPTY).lines().stream()
                .anyMatch(line -> line.getString().equals(MARKER));
    }
    static void roundTrip(ItemStack stack, HolderLookup.Provider registries) {
        ItemStack.validateStrict(stack).getOrThrow();
        var ops = registries.createSerializationContext(NbtOps.INSTANCE);
        var encoded = ItemStack.CODEC.encodeStart(ops, stack).getOrThrow();
        var decoded = ItemStack.CODEC.parse(ops, encoded).getOrThrow();
        ItemStack.validateStrict(decoded).getOrThrow();
        // Some vanilla component payloads contain direct holders without value-based equals.
        // Compare the full typed persisted representation, not Java holder object identity.
        if (!encoded.equals(ItemStack.CODEC.encodeStart(ops, decoded).getOrThrow()))
            throw new IllegalStateException(EditorI18n.tr("cadeditor.message.testkit.26d3369a82"));
    }
}
