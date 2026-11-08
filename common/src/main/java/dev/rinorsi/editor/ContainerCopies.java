package dev.rinorsi.editor;

import java.util.stream.Stream;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;

public final class ContainerCopies {
    private ContainerCopies() {}
    public static Stream<ItemStack> copies(BundleContents contents) {
        // 26.3 unified ContainerComponent's copy stream; contents and order are unchanged.
        //? if <26.3 {
        /*return contents.itemCopyStream();
        *///?} else {
        return contents.itemCopies();
        //?}
    }
    public static Stream<ItemStack> copies(ItemContainerContents contents) {
        // Preserve empty slots as well as occupied ones in both APIs.
        //? if <26.3 {
        /*return contents.allItemsCopyStream();
        *///?} else {
        return contents.itemCopies();
        //?}
    }
}
