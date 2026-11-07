package dev.rinorsi.editor.world;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.EditorSessions;
import java.util.*;
import net.minecraft.nbt.CompoundTag;

/** Connection-scoped world sessions; authoritative revision required on every mutation. */
public final class WorldEditSessions {
    public static final class State {
        public final JsonObject slot;
        public CompoundTag baseline, undo;
        State(JsonObject slot, CompoundTag baseline) { this.slot = slot.deepCopy(); this.baseline = baseline.copy(); }
        public CompoundTag preimage() {
            if (undo == null) EditorSessions.fail("undo_unavailable", "此会话没有可撤销的修改");
            return undo.copy();
        }
        public void saved(CompoundTag before, CompoundTag after, boolean undoing) { undo = undoing ? null : before.copy(); baseline = after.copy(); }
    }
    private final Map<UUID, State> states = new HashMap<>();
    private final Map<UUID, Long> lastWrite = new HashMap<>();
    public State open(UUID player, JsonObject slot, CompoundTag current) {
        var state = new State(slot, current); states.put(player, state); return state;
    }
    public State require(UUID player, JsonObject slot, String revision, CompoundTag current) {
        var state = states.get(player);
        if (state == null || !sameTarget(state.slot, slot) || !Objects.equals(state.slot.get("token"), slot.get("token")))
            throw new EditorSessions.Failure("session_lost", "世界编辑会话已关闭或被替换；请重新打开，草稿已保留");
        WorldNbt.requireRevision(revision, current);
        WorldNbt.requireRevision(revision, state.baseline);
        return state;
    }
    public void rateLimit(UUID player) {
        long now = System.nanoTime(); Long last = lastWrite.put(player, now);
        if (last != null && now - last < 500_000_000L)
            EditorSessions.fail("rate_limited", "世界修改过于频繁，请稍后再提交");
    }
    public void close(UUID player, JsonObject slot) {
        var state = states.get(player);
        if (state != null && sameTarget(state.slot, slot) && Objects.equals(state.slot.get("token"), slot.get("token"))) states.remove(player);
    }
    public void remove(UUID player) { states.remove(player); lastWrite.remove(player); }
    public void clear() { states.clear(); lastWrite.clear(); }
    public static boolean sameTarget(JsonObject a, JsonObject b) {
        if (!Objects.equals(a.get("kind"), b.get("kind")) || !Objects.equals(a.get("dim"), b.get("dim"))) return false;
        String kind = a.get("kind").getAsString();
        if (kind.equals("entity")) return Objects.equals(a.get("uuid"), b.get("uuid"));
        return kind.equals("block") && Objects.equals(a.get("x"), b.get("x")) && Objects.equals(a.get("y"), b.get("y")) && Objects.equals(a.get("z"), b.get("z"));
    }
}
