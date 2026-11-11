package dev.rinorsi.editor.world;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.EditorSessions;
import java.util.*;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.phys.Vec3;

/** Connection-scoped world sessions; authoritative revision required on every mutation. */
public final class WorldEditSessions {
    public static final class State {
        public final JsonObject slot;
        public final Vec3 openingPosition;
        public CompoundTag baseline, undo;
        public String revision;
        State(JsonObject slot, CompoundTag baseline) { this(slot,baseline,null); }
        State(JsonObject slot, CompoundTag baseline, Vec3 openingPosition) { this.slot = slot.deepCopy(); this.openingPosition=openingPosition; setBaseline(baseline); }
        private void setBaseline(CompoundTag after){baseline=after.copy();revision=UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}
        public CompoundTag preimage() {
            if (undo == null) EditorSessions.fail("undo_unavailable", "此会话没有可撤销的修改");
            return undo.copy();
        }
        public void saved(CompoundTag before, CompoundTag after, boolean undoing) { undo = undoing ? null : before.copy(); setBaseline(after); }
    }
    private final Map<UUID, State> states = new HashMap<>();
    private final Map<UUID, Long> lastWrite = new HashMap<>();
    private final java.util.function.LongSupplier clock;
    public WorldEditSessions(){this(System::nanoTime);}
    public WorldEditSessions(java.util.function.LongSupplier clock){this.clock=clock;}
    public State open(UUID player, JsonObject slot, CompoundTag current) {
        return open(player,slot,current,null);
    }
    public State open(UUID player, JsonObject slot, CompoundTag current, Vec3 openingPosition) {
        var state = new State(slot, current, openingPosition); states.put(player, state); return state;
    }
    public State require(UUID player, JsonObject slot, String revision, CompoundTag current) {
        var state=require(player,slot,revision);
        WorldMerge.requireIdentity(state.baseline,current);
        return state;
    }
    /** Authenticate before granting a moved entity the original interaction anchor. */
    public State require(UUID player, JsonObject slot, String revision) {
        var state = states.get(player);
        if (state == null || !sameTarget(state.slot, slot) || !Objects.equals(state.slot.get("token"), slot.get("token")))
            throw new EditorSessions.Failure("session_lost", "世界编辑会话已关闭或被替换；请重新打开，草稿已保留");
        if(!Objects.equals(revision,state.revision))throw new WorldEditError("target_changed","页面数据版本太旧；请重新打开并比较草稿", "client_revision",null);
        return state;
    }
    public void requireDoubleChestPresent(UUID player,JsonObject slot,net.minecraft.world.level.Level level) {
        var state=states.get(player);
        if(state!=null&&sameTarget(state.slot,slot)&&Objects.equals(state.slot.get("token"),slot.get("token")))DoubleChestEdit.requirePresent(level,state.baseline);
    }
    public void rateLimit(UUID player) {
        long now = clock.getAsLong(); Long last = lastWrite.get(player);
        if (last != null && now - last < 500_000_000L){
            int retry=(int)((500_000_000L-(now-last)+999_999L)/1_000_000L);
            throw new WorldEditError("rate_limited","世界修改过于频繁，请稍后再提交",null,retry);
        }
        lastWrite.put(player,now); // Rejected clicks never extend the existing window.
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
        if (kind.equals("entity")) {
            for(String mode:List.of("offline","preset"))if(mode.equals(a.has("player")?a.get("player").getAsString():"")!=mode.equals(b.has("player")?b.get("player").getAsString():""))return false;
            return Objects.equals(a.get("uuid"), b.get("uuid"));
        }
        return kind.equals("block") && Objects.equals(a.get("x"), b.get("x")) && Objects.equals(a.get("y"), b.get("y")) && Objects.equals(a.get("z"), b.get("z"));
    }
}
