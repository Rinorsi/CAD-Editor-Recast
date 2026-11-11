package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.EditorWriteLog;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.ItemStack;

/** Shared client-only transport for editor saves and detached vault inserts. */
public final class ClientInventoryCommands {
    private static HotbarCommandSession inFlight;
    private static Object leaseConnection;
    private static long leaseUntil;
    private ClientInventoryCommands() {}

    public static HotbarCommandSession.Context context(Minecraft mc, int index) {
        if (mc.player == null || mc.level == null || mc.getConnection() == null) return null;
        HotbarCommandCodec.requireSlot(index);
        return new HotbarCommandSession.Context(mc.getConnection(), mc.level, mc.player, mc.player.containerMenu,
                mc.player.containerMenu.getStateId(), fingerprint(mc.player.getInventory().getItem(index), mc));
    }

    public static String fingerprint(ItemStack stack, Minecraft mc) {
        return stack.isEmpty() ? "empty-inventory-slot" : EditorSessions.fingerprint(stack, mc.level.registryAccess());
    }

    public static void requireAvailable(Minecraft mc) {
        if (mc.player == null || mc.level == null || mc.getConnection() == null)
            EditorSessions.fail("not_connected", "当前未连接世界；草稿和保险库已保留");
        if (leaseBlocks(inFlight, mc.getConnection() == leaseConnection, System.nanoTime(), leaseUntil))
            EditorSessions.fail("request_pending", "上一笔物品命令尚未得到服务器同步，请勿重复提交");
        var root = mc.player.connection.getCommands().getRoot();
        requireCommands(root.getChild("execute") != null, root.getChild("item") != null);
    }

    // Closing/reloading a page invalidates its callback, not an already sent network command.
    static boolean leaseBlocks(HotbarCommandSession session, boolean sameConnection, long now, long until) {
        return session != null && sameConnection && !session.confirmed() && now < until;
    }

    public static void requireCommands(boolean execute, boolean item) {
        if (!execute || !item) EditorSessions.fail("command_unavailable",
                "原版命令不可用或权限不足，需要服务器授予对应权限；草稿和保险库已保留");
    }

    public static String capabilityHint(Minecraft mc) {
        if (mc.player == null || mc.level == null || mc.getConnection() == null) return "当前未进入世界，不能取出到背包；本地保险库仍可管理";
        var root = mc.player.connection.getCommands().getRoot();
        if (root.getChild("execute") == null || root.getChild("item") == null)
            return "原版命令不可用或权限不足，需要服务器授予对应权限；可继续编辑草稿和本地保险库";
        return "命令模式仅支持自己的普通背包第1～36格；每笔由服务器授权，可能通知本人、其他 OP 和控制台";
    }

    public static void send(Minecraft mc, HotbarCommandSession session, String id, ItemStack original, ItemStack next) {
        var commands = mc.player == null ? null : mc.player.connection.getCommands().getRoot();
        EditorWriteLog.event("client.command.preflight", id, "inventory_index=" + session.index()
                + " execute_visible=" + (commands != null && commands.getChild("execute") != null)
                + " item_visible=" + (commands != null && commands.getChild("item") != null));
        requireAvailable(mc);
        String command;
        try { command = HotbarCommandCodec.compile(session.index(), original, next, mc.level.registryAccess()); }
        catch (RuntimeException failure) {
            EditorWriteLog.failure("client.command.compile_rejected", id, "inventory_index=" + session.index(), failure);
            throw failure;
        }
        long now = System.nanoTime();
        session.begin(context(mc, session.index()), id, fingerprint(next, mc), now);
        inFlight = session;
        leaseConnection = mc.getConnection(); leaseUntil = now + 10_000_000_000L;
        try {
            mc.player.connection.sendCommand(command);
            EditorWriteLog.event("client.command.sent", id, "inventory_index=" + session.index()
                    + " command_chars=" + command.length() + " menu_revision=" + mc.player.containerMenu.getStateId());
        }
        catch (RuntimeException failure) {
            EditorWriteLog.failure("client.command.send_failure", id, "inventory_index=" + session.index(), failure);
            session.invalidate(); throw failure;
        }
    }
}
