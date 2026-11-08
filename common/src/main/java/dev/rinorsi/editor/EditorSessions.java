package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.RegistryAccess;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;

/** Server-thread session cache. Lifetime is connection-bound, never editing-time-bound. */
public final class EditorSessions {
    private final Map<UUID, State> sessions = new HashMap<>();
    private final java.util.function.LongSupplier clock;
    public EditorSessions() { this(System::nanoTime); }
    EditorSessions(java.util.function.LongSupplier clock) { this.clock = clock; }

    public static final class Failure extends IllegalArgumentException {
        public final String code;
        public Failure(String code, String reason) { super(reason); this.code = code; }
    }
    public static void fail(String code, String reason) { throw new Failure(code, reason); }

    static final class State {
        final JsonObject slot;
        ItemStack original;
        ItemStack prepared;
        String preparedRequest;
        long activeAt;
        State(JsonObject slot, ItemStack original) { this.slot = slot.deepCopy(); this.original = original.copy(); }
    }

    State open(UUID player, JsonObject slot, ItemStack original) {
        var state = new State(slot, original); state.activeAt = clock.getAsLong();
        sessions.put(player, state); return state;
    }
    State get(UUID player) { return sessions.get(player); }
    void remove(UUID player) { sessions.remove(player); }
    void clear() { sessions.clear(); }
    void close(UUID player, JsonObject slot) {
        State state = sessions.get(player);
        // A delayed close from a previous screen must never remove a newer open.
        if (state != null && sameSlot(state.slot, slot)
                && java.util.Objects.equals(state.slot.get("token"), slot.get("token"))) sessions.remove(player);
    }

    State apply(UUID player, JsonObject slot, String baseline, ItemStack current, RegistryAccess registries) {
        State state = sessions.get(player);
        if (baseline == null) {
            if (state == null || !sameSlot(state.slot, slot))
                fail("session_lost", "缺少原物品基线，无法安全恢复编辑会话；草稿已保留，请更新客户端后重试");
        } else {
            // Always validate the caller's baseline, even when another screen replaced the cache.
            requireBaseline(baseline, current, registries, slot);
            if (state == null || !sameSlot(state.slot, slot) || !ItemStack.matches(state.original, current))
                state = open(player, slot, current);
        }
        if (!ItemStack.matches(current, state.original)) changed(slot);
        state.activeAt = clock.getAsLong();
        return state;
    }

    State confirm(UUID player, JsonObject slot, String requestId, String commitBaseline,
                  ItemStack current, RegistryAccess registries) {
        State state = sessions.get(player);
        if (state == null || !sameSlot(state.slot, slot) || state.prepared == null
                || !requestId.equals(state.preparedRequest)) {
            // Read-only confirmation: recovery acknowledges an exact already-committed stack.
            requireBaseline(commitBaseline, current, registries, slot);
            state = open(player, slot, current);
        } else {
            if (!ItemStack.matches(current, state.prepared)) changed(slot);
            state.original = current.copy(); state.prepared = null;
        }
        state.activeAt = clock.getAsLong();
        return state;
    }

    public static boolean sameSlot(JsonObject left, JsonObject right) {
        SlotKey a = SlotKey.read(left), b = SlotKey.read(right);
        return a.equals(b);
    }
    private record SlotKey(String kind, int index, int menuId) {
        static SlotKey read(JsonObject slot) {
            try {
                String kind = StackCodec.string(slot, "kind");
                int index = StackCodec.integer(slot, "index", 0, Integer.MAX_VALUE);
                return switch (kind) {
                    case "inventory" -> new SlotKey(kind, index, -1);
                    case "menu" -> new SlotKey(kind, index, StackCodec.integer(slot, "menuId", 0, Integer.MAX_VALUE));
                    default -> throw new IllegalArgumentException();
                };
            } catch (RuntimeException e) {
                fail("slot_invalid", "槽位信息无效；草稿已保留"); return null;
            }
        }
    }
    public static void requireBaseline(String baseline, ItemStack current, RegistryAccess registries, JsonObject slot) {
        if (baseline == null || !baseline.matches("[0-9a-f]{64}"))
            fail("session_lost", "缺少有效的原物品基线，无法安全恢复会话；草稿已保留");
        if (current.isEmpty()) changed(slot);
        if (!baseline.equals(fingerprint(current, registries))) changed(slot);
    }
    static void changed(JsonObject slot) {
        var key = SlotKey.read(slot);
        fail("item_changed", "物品在你编辑期间变了（" + (key.kind.equals("inventory") ? "玩家背包" : "容器")
                + "槽位 " + key.index + "；无法判定修改者）；没有覆盖当前物品，草稿已保留");
    }
    /** Typed, canonical NBT fingerprint: retains long/array types lost by JSON snapshots. */
    public static String fingerprint(ItemStack stack, RegistryAccess registries) {
        Tag tag = ItemStack.CODEC.encodeStart(registries.createSerializationContext(NbtOps.INSTANCE), stack).getOrThrow();
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            canonical(tag, digest);
            return HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static void part(MessageDigest digest, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        digest.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array()); digest.update(bytes);
    }
    private static void canonical(Tag tag, MessageDigest digest) {
        digest.update(tag.getId());
        if (tag instanceof CompoundTag object) {
            var keys = new java.util.TreeSet<>(object.keySet());
            part(digest, Integer.toString(keys.size()));
            for (String key : keys) { part(digest, key); canonical(object.get(key), digest); }
        } else if (tag instanceof ListTag list) {
            part(digest, Integer.toString(list.size()));
            for (Tag element : list) canonical(element, digest);
        } else part(digest, tag.toString());
    }
}
