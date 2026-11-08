package dev.rinorsi.editor;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;

/** Production command planning with real vanilla Codec/registries, without a game window. */
public final class TestKitTest {
    private static int checks;
    static void run(HolderLookup.Provider registries) {
        var dispatcher = new com.mojang.brigadier.CommandDispatcher<net.minecraft.commands.CommandSourceStack>();
        dispatcher.register(TestKitCommand.tree(() -> new EditorPolicy(2, false)));
        var root = dispatcher.getRoot().getChild("cadeditor");
        check(root != null, "CAD Editor command root registered");
        var node = root.getChild("testkit");
        check(node.getCommand() != null && node.getChildren().size() == 4, "actual command tree registers default and four modes");
        for (String mode : List.of("all", "inventory", "hotbar", "clear")) check(node.getChild(mode).getCommand() != null, "command mode " + mode);
        check(!TestKitCommand.allowedMode(false, false), "ordinary survival excluded even if editing policy is permissive");
        check(TestKitCommand.allowedMode(true, false), "creative mode gate");
        check(TestKitCommand.allowedMode(false, true), "operator gate");
        var live = BuiltInRegistries.DATA_COMPONENT_TYPE.stream().filter(t -> !t.isTransient()).map(t -> BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(t).getPath()).collect(java.util.stream.Collectors.toSet());
        var additions = new java.util.TreeSet<>(live); additions.removeAll(TestKit.expectedComponents());
        var removals = new java.util.TreeSet<>(TestKit.expectedComponents()); removals.removeAll(live);
        System.out.println("Component changes: added=" + additions + "; removed=" + removals);
        var kit = TestKit.create(registries, false);
        //? if <26.2 {
        /*check(kit.size() == 45, "45 themed specimens");
        *///?}
        int specimens = kit.size();
        Set<String> runtime = new HashSet<>();
        for (var type : BuiltInRegistries.DATA_COMPONENT_TYPE) {
            var id = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type);
            if (!type.isTransient() && id.getNamespace().equals("minecraft")) runtime.add(id.getPath());
        }
        //? if <26.2 {
        /*check(runtime.size() == 107, "107 persistent components in audited baseline");
        *///?}
        check(runtime.equals(TestKit.expectedComponents()), "persistent runtime component IDs match coverage checklist");
        Set<String> covered = new HashSet<>();
        for (var specimen : kit) {
            covered.addAll(specimen.components()); TestKit.roundTrip(specimen.stack(), registries);
            check(TestKit.owned(specimen.stack()), "specimen marked " + specimen.number());
            System.out.println("TESTKIT " + specimen.number() + " " + specimen.title() + " " + new java.util.TreeSet<>(specimen.components()));
        }
        check(covered.equals(runtime), "every persistent component has a nondefault representative");
        check(TestKit.create(registries, true).size() == specimens, "no fake modded registry IDs invented in vanilla environment");
        var empty = new ArrayList<ItemStack>(); for (int i = 0; i < 37; i++) empty.add(ItemStack.EMPTY);
        var given = TestKitInventory.give(empty, kit, registries);
        check(empty.stream().allMatch(ItemStack::isEmpty), "planning never mutates caller inventory");
        check(numbers(given).size() == specimens, "all specimens retained across 36 slots plus offhand and overflow");
        for (var stack : given) if (!stack.isEmpty()) TestKit.roundTrip(stack, registries);
        check(TestKitInventory.clear(given).stream().allMatch(ItemStack::isEmpty), "clear removes untouched kit including nested generated samples");
        var full = new ArrayList<ItemStack>(); for (int i = 0; i < 37; i++) full.add(new ItemStack(Items.DIAMOND, 64));
        try { TestKitInventory.give(full, kit, registries); throw new AssertionError("full inventory accepted"); }
        catch (IllegalArgumentException expected) { check(expected.getMessage().contains("没有覆盖或丢弃"), "full inventory gives actionable refusal"); }
        check(full.stream().allMatch(s -> s.is(Items.DIAMOND) && s.getCount() == 64), "full inventory retains every ordinary item");
        full.set(36, ItemStack.EMPTY);
        var compact = TestKitInventory.give(full, kit, registries);
        check(numbers(compact).size() == specimens, "single free slot packs all 45 specimens");
        for (int i = 0; i < 36; i++) check(ItemStack.matches(full.get(i), compact.get(i)), "occupied slot unchanged " + i);
        TestKit.roundTrip(compact.get(36), registries);
        check(TestKitInventory.give(empty.subList(0, 36), kit, registries).size() == 36, "inventory mode never targets offhand/armor");
        var cleared = TestKitInventory.clear(compact);
        check(cleared.get(36).isEmpty() && cleared.subList(0, 36).stream().allMatch(s -> s.is(Items.DIAMOND) && s.getCount() == 64), "compact clear preserves ordinary full inventory");
        var renamed = kit.getFirst().stack().copy(); renamed.set(DataComponents.CUSTOM_NAME, Component.literal("我改的名字"));
        check(TestKitInventory.clear(List.of(renamed)).getFirst().isEmpty(), "rename still clears by visible lore marker");
        var sameName = new ItemStack(Items.PAPER); sameName.set(DataComponents.CUSTOM_NAME, kit.getFirst().stack().get(DataComponents.CUSTOM_NAME));
        check(ItemStack.matches(TestKitInventory.clear(List.of(sameName)).getFirst(), sameName), "matching name alone never deletes a normal item");
        var normal = new ItemStack(Items.DIAMOND, 11);
        var mixedBox = kit.get(15).stack().copy();
        mixedBox.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(kit.getFirst().stack(), normal)));
        var mixedAfter = TestKitInventory.clear(List.of(mixedBox)).getFirst();
        check(!mixedAfter.isEmpty(), "test box holding ordinary belongings is retained");
        var children = dev.rinorsi.editor.ContainerCopies.copies(mixedAfter.get(DataComponents.CONTAINER)).toList();
        check(children.getFirst().isEmpty() && ItemStack.matches(children.get(1), normal), "clear preserves container slots and user belongings");
        var ordinaryBox = new ItemStack(Items.BARREL);
        ordinaryBox.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(normal, kit.getFirst().stack())));
        var nested = dev.rinorsi.editor.ContainerCopies.copies(TestKitInventory.clear(List.of(ordinaryBox)).getFirst().get(DataComponents.CONTAINER)).toList();
        check(nested.size() == 1 && ItemStack.matches(nested.getFirst(), normal), "ordinary box preserved while nested test stack removed");
        var mixedBundle = kit.get(16).stack().copy();
        mixedBundle.set(DataComponents.BUNDLE_CONTENTS, new BundleContents(List.of(ItemStackTemplate.fromNonEmptyStack(normal), ItemStackTemplate.fromNonEmptyStack(kit.get(6).stack()))));
        var remaining = dev.rinorsi.editor.ContainerCopies.copies(TestKitInventory.clear(List.of(mixedBundle)).getFirst().get(DataComponents.BUNDLE_CONTENTS)).toList();
        check(remaining.size() == 1 && ItemStack.matches(remaining.getFirst(), normal), "ordinary bundle contents survive clear");
        var ordinaryBundle = new ItemStack(Items.BUNDLE);
        //? if <26.3 {
        /*var mutable = new BundleContents.Mutable(new BundleContents(List.of(ItemStackTemplate.fromNonEmptyStack(normal))));
        *///?} else {
        var mutable = new BundleContents(List.of(ItemStackTemplate.fromNonEmptyStack(normal))).asMutable();
        //?}
        mutable.toggleSelectedItem(0); ordinaryBundle.set(DataComponents.BUNDLE_CONTENTS, mutable.toImmutable());
        check(TestKitInventory.clear(List.of(ordinaryBundle)).getFirst().get(DataComponents.BUNDLE_CONTENTS).getSelectedItemIndex() == 0,
                "untouched ordinary bundle retains selection state");
        check(TestKitInventory.give(empty.subList(0, 9), kit.subList(0, 9), registries).stream().allMatch(s -> !s.isEmpty()), "hotbar plan gives first nine specimens");
        System.out.println("PASS TestKit: " + checks + " checks; " + specimens + " specimens / " + runtime.size() + " persistent components, real Codec, full inventory no loss, scoped clear");
    }
    private static Set<Integer> numbers(List<ItemStack> stacks) {
        Set<Integer> out = new HashSet<>(); stacks.forEach(stack -> collect(stack, out)); return out;
    }
    private static void collect(ItemStack stack, Set<Integer> out) {
        if (stack.isEmpty()) return;
        if (TestKit.owned(stack)) {
            String name = stack.getHoverName().getString();
            int end = name.indexOf('·'); if (end > 1) {
                int n = Integer.parseInt(name.substring(1, end)); if (n > 0) out.add(n);
            }
        }
        var box = stack.get(DataComponents.CONTAINER); if (box != null) box.nonEmptyItemCopyStream().forEach(s -> collect(s, out));
        var bundle = stack.get(DataComponents.BUNDLE_CONTENTS); if (bundle != null) dev.rinorsi.editor.ContainerCopies.copies(bundle).forEach(s -> collect(s, out));
    }
    private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
}
