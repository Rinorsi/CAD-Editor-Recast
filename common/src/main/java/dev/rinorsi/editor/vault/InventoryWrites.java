package dev.rinorsi.editor.vault;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.StackCodec;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.world.Container;
import net.minecraft.world.item.ItemStack;

/** Shared server-thread limits and empty-slot insertion; no client or filesystem access. */
public final class InventoryWrites {
    public enum GivePath { CREATIVE, SERVER, UNAVAILABLE }
    public static GivePath givePath(boolean creative, boolean serverInstalled) {
        return creative ? GivePath.CREATIVE : serverInstalled ? GivePath.SERVER : GivePath.UNAVAILABLE;
    }
    private record Window(long second, int count) {}
    private static final Map<UUID, Window> WINDOWS = new HashMap<>();
    private InventoryWrites() {}
    public static void rateLimit(UUID player) { rateLimit(player, System.nanoTime()); }
    static void rateLimit(UUID player, long nanos) {
        long second = nanos / 1_000_000_000L;
        Window old = WINDOWS.get(player);
        int count = old != null && old.second == second ? old.count + 1 : 1;
        WINDOWS.put(player, new Window(second, count));
        if (count > 20) EditorSessions.fail("rate_limited", EditorI18n.tr("cadeditor.message.inventorywrites.d7b872fdb7"));
    }
    public static void remove(UUID player) { WINDOWS.remove(player); }
    public static void clear() { WINDOWS.clear(); }

    public static int insert(Container inventory, ItemStack stack, JsonObject request) {
        if (stack.isEmpty()) EditorSessions.fail("invalid_stack", EditorI18n.tr("cadeditor.message.inventorywrites.1157951e09"));
        String region = request.has("slot") ? StackCodec.string(request, "slot") : "inventory";
        if (!region.equals("inventory") && !region.equals("hotbar"))
            EditorSessions.fail("unsupported_slot", EditorI18n.tr("cadeditor.message.inventorywrites.bf170e5031"));
        int chosen = -1;
        if (request.has("inventoryIndex")) {
            chosen = StackCodec.integer(request, "inventoryIndex", 0, Math.min(35, inventory.getContainerSize()-1));
            if (!inventory.getItem(chosen).isEmpty()) EditorSessions.fail("slot_changed", EditorI18n.tr("cadeditor.message.hotbarcommandcodec.503bbf077b"));
        } else {
            int from = region.equals("hotbar") ? 0 : 9;
            int to = region.equals("hotbar") ? 9 : Math.min(36, inventory.getContainerSize());
            for (int index = from; index < to; index++) if (inventory.getItem(index).isEmpty()) { chosen = index; break; }
            if (chosen < 0) EditorSessions.fail("inventory_full", EditorI18n.tr("cadeditor.message.inventorywrites.5a718ad73d"));
        }
        inventory.setItem(chosen, stack.copy());
        inventory.setChanged();
        return chosen;
    }
}
