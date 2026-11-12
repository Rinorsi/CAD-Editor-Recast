package dev.rinorsi.editor;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.block.ShulkerBoxBlock;

/** Transactional plans: no existing slot is overwritten and no item is ever dropped. */
final class TestKitInventory {
    private TestKitInventory() {}
    static List<ItemStack> give(List<ItemStack> inventory, List<TestKit.Specimen> kit, HolderLookup.Provider registries) {
        var plan = new ArrayList<ItemStack>(); inventory.forEach(stack -> plan.add(stack.copy()));
        var free = new ArrayList<Integer>();
        for (int i = 0; i < plan.size(); i++) if (plan.get(i).isEmpty()) free.add(i);
        if (free.isEmpty()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkitinventory.527535ab75"));
        int direct = kit.size() <= free.size() ? kit.size() : free.size() - 1;
        for (int i = 0; i < direct; i++) plan.set(free.get(i), kit.get(i).stack().copy());
        if (direct < kit.size()) {
            List<ItemStack> overflow = kit.subList(direct, kit.size()).stream().map(s -> s.stack().copy()).toList();
            var boxes = new ArrayList<ItemStack>();
            for (int start = 0; start < overflow.size(); start += 27) {
                var chunk = overflow.subList(start, Math.min(start + 27, overflow.size()));
                boolean containsShulker = chunk.stream().anyMatch(s -> s.getItem() instanceof BlockItem block
                        && block.getBlock() instanceof ShulkerBoxBlock);
                // Vanilla prohibits shulker-inside-shulker. A barrel can legally hold one.
                boxes.add(box(chunk, containsShulker, EditorI18n.tr("cadeditor.message.testkitinventory.6104fe6e1a", ((boxes.size() + 1))), registries));
            }
            ItemStack packed = boxes.size() == 1 ? boxes.getFirst() : box(boxes, true, EditorI18n.tr("cadeditor.message.testkitinventory.87c19bc4cd"), registries);
            plan.set(free.get(direct), packed);
        }
        return List.copyOf(plan);
    }
    private static ItemStack box(List<ItemStack> contents, boolean barrel, String label, HolderLookup.Provider registries) {
        var stack = new ItemStack(barrel ? Items.BARREL : Items.SHULKER_BOX);
        stack.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(contents));
        TestKit.markTree(stack, label, 0); TestKit.roundTrip(stack, registries); return stack;
    }

    static List<ItemStack> clear(List<ItemStack> inventory) {
        return inventory.stream().map(stack -> clearStack(stack, 0)).toList();
    }
    private static ItemStack clearStack(ItemStack source, int depth) {
        if (source.isEmpty() || depth > 16) return source.copy();
        var result = source.copy();
        boolean retainedContents = false;
        var container = result.get(DataComponents.CONTAINER);
        if (container != null) {
            var before = dev.rinorsi.editor.ContainerCopies.copies(container).toList();
            var children = before.stream().map(s -> clearStack(s, depth + 1)).toList();
            retainedContents |= children.stream().anyMatch(s -> !s.isEmpty());
            if (!sameStacks(before, children)) result.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(children));
        }
        var bundle = result.get(DataComponents.BUNDLE_CONTENTS);
        if (bundle != null) {
            var before = dev.rinorsi.editor.ContainerCopies.copies(bundle).toList();
            var children = before.stream().map(s -> clearStack(s, depth + 1)).filter(s -> !s.isEmpty()).toList();
            retainedContents |= !children.isEmpty();
            if (!sameStacks(before, children))
                result.set(DataComponents.BUNDLE_CONTENTS, new BundleContents(children.stream().map(ItemStackTemplate::fromNonEmptyStack).toList()));
        }
        return TestKit.owned(source) && !retainedContents ? ItemStack.EMPTY : result;
    }
    private static boolean sameStacks(List<ItemStack> left, List<ItemStack> right) {
        if (left.size() != right.size()) return false;
        for (int i = 0; i < left.size(); i++) if (!ItemStack.matches(left.get(i), right.get(i))) return false;
        return true;
    }
}
