package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import dev.rinorsi.editor.ComponentPatches;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.EditorWriteLog;
import java.nio.charset.StandardCharsets;
import java.util.StringJoiner;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.DoubleTag;
import net.minecraft.nbt.FloatTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;

/** Fixed self main-inventory targets only. Never accepts command text from the page. */
public final class HotbarCommandCodec {
    private HotbarCommandCodec() {}

    public static String compile(int index, ItemStack original, ItemStack next, RegistryAccess registries) {
        requireSlot(index);
        if (!original.isEmpty()) validate(original);
        validate(next);
        var ops = registries.createSerializationContext(NbtOps.INSTANCE);
        var item = (CompoundTag) net.minecraft.world.ItemStackWithSlot.CODEC.encodeStart(ops,
                new net.minecraft.world.ItemStackWithSlot(index, original.isEmpty() ? next : original)).getOrThrow();
        // The guard is parsed as vanilla SNBT too. Never drop it to work around
        // an original stack whose numeric values cannot be expressed in a command.
        if (!original.isEmpty()) requireCommandNumbers(item, EditorI18n.tr("cadeditor.message.hotbarcommandcodec.59b503b625"));
        item.putInt("count", original.isEmpty() ? next.getCount() : original.getCount());
        var inventory = new ListTag();
        inventory.add(item);
        var predicate = new CompoundTag();
        predicate.put("Inventory", inventory);
        var components = new StringJoiner(",", "[", "]");
        for (var entry : ComponentPatches.entries(next.getComponentsPatch())) {
            var id = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(entry.getKey());
            if (id == null || entry.getKey().codec() == null)
                EditorSessions.fail("unsupported_component", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.19276a4028"));
            if (entry.getValue().isEmpty()) components.add("!" + id);
            else components.add(id + "=" + encode(entry.getKey(), entry.getValue().get(), registries, EditorI18n.tr("cadeditor.message.hotbarcommandcodec.d2d1082df2", (id))));
        }
        // Vanilla NBT predicates are partial matches, not a full-stack compare-and-swap.
        // This server-side guard supplements the strict client baseline check.
        // Slot is encoded by the native ItemStackWithSlot codec (byte in player Inventory).
        // Empty slots have no Inventory entry. Never use /give or overwrite an occupied slot.
        String guard = original.isEmpty() ? "unless data entity @s Inventory[{Slot:" + item.get("Slot") + "}]"
                : "if entity @s[nbt=" + predicate + "]";
        String command = "execute " + guard + " run item replace entity @s "
                + slotName(index) + " with " + BuiltInRegistries.ITEM.getKey(next.getItem())
                + components + " " + next.getCount();
        requireLength(command);
        return command;
    }

    public static void requireSlot(int index) {
        if (index < 0 || index > 35) EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.679ce1f882"));
    }

    public static String slotName(int index) {
        requireSlot(index);
        return index < 9 ? "hotbar." + index : "inventory." + (index - 9);
    }

    public static int emptySlot(String region, int requested, java.util.function.IntPredicate empty) {
        if (!region.equals("inventory") && !region.equals("hotbar"))
            EditorSessions.fail("unsupported_slot", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.ed57369f81"));
        if (requested >= 0) {
            requireSlot(requested);
            if (!empty.test(requested)) EditorSessions.fail("slot_changed", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.503bbf077b"));
            return requested;
        }
        int from = region.equals("hotbar") ? 0 : 9, to = region.equals("hotbar") ? 9 : 36;
        for (int i = from; i < to; i++) if (empty.test(i)) return i;
        EditorSessions.fail("inventory_full", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.c891bc9f22"));
        return -1;
    }

    static void requireLength(String command) {
        if (command.length() > 32767 || command.getBytes(StandardCharsets.UTF_8).length > 32767 * 3)
            EditorSessions.fail("command_too_long", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.7dc92dfefd"));
        for (int i = 0; i < command.length(); i++) {
            if (!net.minecraft.util.StringUtil.isAllowedChatCharacter(command.charAt(i)))
                EditorSessions.fail("invalid_request", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.07338fcb11"));
        }
    }

    private static void validate(ItemStack stack) {
        if (stack.isEmpty() || stack.getCount() < 1 || stack.getCount() > 99 || stack.getCount() > stack.getMaxStackSize())
            EditorSessions.fail("invalid_request", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.d9cbc0fba2"));
        ItemStack.validateStrict(stack).getOrThrow();
        if (ComponentPatches.entries(stack.getComponentsPatch()).size() > 256)
            EditorSessions.fail("invalid_request", EditorI18n.tr("cadeditor.message.stackcodec.5d54767f85"));
    }

    private static void requireCommandNumbers(Tag tag, String path) {
        String special = null;
        if (tag instanceof FloatTag value && !Float.isFinite(value.value()))
            special = Float.isNaN(value.value()) ? "NaN" : value.value() < 0 ? "−∞" : "∞";
        else if (tag instanceof DoubleTag value && !Double.isFinite(value.value()))
            special = Double.isNaN(value.value()) ? "NaN" : value.value() < 0 ? "−∞" : "∞";
        if (special != null) {
            EditorWriteLog.warning("client.command.unsupported_number", null, "field=" + path + " value=" + special);
            EditorSessions.fail("command_special_number", EditorI18n.tr("cadeditor.ui.core.744a6a9f87"));
        }
        if (tag instanceof CompoundTag compound) {
            for (String key : compound.keySet()) requireCommandNumbers(compound.get(key), path + "." + key);
        } else if (tag instanceof ListTag list) {
            for (int i = 0; i < list.size(); i++) requireCommandNumbers(list.get(i), path + "[" + i + "]");
        }
    }

    private static <T> String encode(net.minecraft.core.component.DataComponentType<T> type, Object value, RegistryAccess registries, String path) {
        @SuppressWarnings("unchecked") T typed = (T) value;
        Tag encoded = type.codec().encodeStart(registries.createSerializationContext(NbtOps.INSTANCE), typed).getOrThrow();
        requireCommandNumbers(encoded, path);
        return encoded.toString();
    }
}
