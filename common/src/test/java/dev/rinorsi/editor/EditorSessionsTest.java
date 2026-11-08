package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;

/** Runs inside codecTest with real vanilla registries, no client/server or operating-system input. */
public final class EditorSessionsTest {
    private static int checks;
    static void run(RegistryAccess registries) {
        var now = new AtomicLong();
        var sessions = new EditorSessions(now::get);
        var player = UUID.randomUUID();
        var slot = json("{\"kind\":\"inventory\",\"index\":0,\"token\":\"first\"}");
        var sword = new ItemStack(Items.DIAMOND_SWORD);
        sword.set(DataComponents.CUSTOM_NAME, Component.literal("before"));
        String baseline = EditorSessions.fingerprint(sword, registries);
        sessions.open(player, slot, sword);
        sessions.clear();
        var recovered = sessions.apply(player, slot, baseline, sword, registries);
        check(ItemStack.matches(recovered.original, sword), "cleared session recovered unchanged original");
        var draft = StackCodec.snapshot(sword, registries, slot, "");
        draft.getAsJsonObject("comps").addProperty("custom_name", "after");
        var next = StackCodec.decode(draft, registries, recovered.original);
        check(next.getHoverName().getString().equals("after"), "recovered apply uses real vanilla codec");
        recovered.prepared = next.copy(); recovered.preparedRequest = "edit-1";
        var committed = sessions.confirm(player, slot, "edit-1", null, next, registries);
        check(ItemStack.matches(committed.original, next), "recovered apply and normal confirm saved");
        sessions.clear();
        rejects("item_changed", () -> sessions.apply(player, slot, baseline, next, registries));
        check(sessions.get(player) == null, "changed item never installs recovered session");
        rejects("item_changed", () -> sessions.apply(player, slot, baseline, ItemStack.EMPTY, registries));
        sessions.open(player, slot, sword);
        now.set(31L * 60 * 1_000_000_000L);
        check(sessions.apply(player, slot, baseline, sword, registries).activeAt == now.get(), "31-minute apply refreshes activity and succeeds");
        now.set(9L * 60 * 60 * 1_000_000_000L);
        check(sessions.apply(player, slot, baseline, sword, registries).activeAt == now.get(), "nine-hour draft has no expiry");
        var equivalent = json("{\"index\":0.0,\"token\":\"different\",\"extra\":true,\"kind\":\"inventory\"}");
        check(EditorSessions.sameSlot(slot, equivalent), "semantic slot ignores field order token and extra fields");
        check(sessions.apply(player, equivalent, baseline, sword, registries) != null, "equivalent slot applies");
        sessions.open(player, equivalent, sword);
        sessions.close(player, slot);
        check(sessions.get(player) != null, "stale close cannot remove newer screen");
        sessions.close(player, equivalent);
        check(sessions.get(player) == null, "matching close releases cache");
        rejects("session_lost", () -> sessions.apply(player, slot, null, sword, registries));
        rejects("session_lost", () -> sessions.apply(player, slot, "invalid", sword, registries));
        check(sessions.apply(player, slot, baseline, sword, registries) != null, "close/apply ordering recovers without discarding draft");
        sessions.remove(player);
        check(sessions.apply(player, slot, baseline, sword, registries) != null, "disconnect cache eviction recovers unchanged slot");
        rejects("slot_invalid", () -> EditorSessions.sameSlot(slot, json("{\"kind\":\"menu\",\"index\":0}")));
        var otherSlot = slot.deepCopy(); otherSlot.addProperty("index", 1);
        check(!EditorSessions.sameSlot(slot, otherSlot), "different inventory slot is distinct");
        sessions.open(player, otherSlot, next);
        check(sessions.apply(player, slot, baseline, sword, registries) != null, "replacement open does not strand original unchanged draft");
        sessions.clear();
        committed = sessions.confirm(player, slot, "edit-1", EditorSessions.fingerprint(next, registries), next, registries);
        check(ItemStack.matches(committed.original, next), "lost prepared state confirms exact committed item without writing");
        check(committed.activeAt == now.get(), "confirm refreshes activity");
        sessions.open(player, slot, sword).prepared = next;
        sessions.get(player).preparedRequest = "edit-1";
        rejects("item_changed", () -> sessions.confirm(player, slot, "edit-1", baseline, sword, registries));
        sessions.clear();
        rejects("item_changed", () -> sessions.confirm(player, slot, "edit-1", baseline, next, registries));
        rejects("session_lost", () -> sessions.confirm(player, slot, "edit-1", null, next, registries));
        sessions.open(player, slot, sword);
        rejects("item_changed", () -> sessions.apply(player, slot, null, next, registries));
        // NBT numeric types and arrays must not collapse through JSON's lossy representation.
        var typed = sword.copy(); var tag = new CompoundTag(); tag.putByte("x", (byte)1);
        typed.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
        var changed = sword.copy(); var tag2 = new CompoundTag(); tag2.putInt("x", 1);
        changed.set(DataComponents.CUSTOM_DATA, CustomData.of(tag2));
        check(!EditorSessions.fingerprint(typed, registries).equals(EditorSessions.fingerprint(changed, registries)), "baseline preserves NBT numeric types");
        tag.putInt("a", 2); tag.putIntArray("array", new int[]{1, 2});
        var ordered = new CompoundTag(); ordered.putIntArray("array", new int[]{1, 2}); ordered.putInt("a", 2); ordered.putByte("x", (byte)1);
        typed.set(DataComponents.CUSTOM_DATA, CustomData.of(tag)); changed.set(DataComponents.CUSTOM_DATA, CustomData.of(ordered));
        check(EditorSessions.fingerprint(typed, registries).equals(EditorSessions.fingerprint(changed, registries)), "baseline canonicalizes compound order");
        System.out.println("PASS EditorSessions: " + checks + " checks (cache recovery, typed baseline, semantic slots, 31min/9h fake clock, confirm)");
    }
    private static JsonObject json(String text) { return JsonParser.parseString(text).getAsJsonObject(); }
    private static void check(boolean ok, String label) { if (!ok) throw new AssertionError(label); checks++; }
    private static void rejects(String code, Runnable work) {
        try { work.run(); } catch (EditorSessions.Failure failure) {
            check(failure.code.equals(code) && failure.getMessage().contains("草稿已保留"), "rejection code and retained draft: " + code); return;
        }
        throw new AssertionError("Expected rejection: " + code);
    }
}
