package dev.rinorsi.editor.world;

import java.util.*;
import net.minecraft.nbt.*;

/** Narrow, version-audited ticking fields. Evidence: docs/world-block-edit.md. */
public final class BlockVolatile {
    private BlockVolatile() {}
    record MergeInputs(CompoundTag base, CompoundTag mine) {}
    /** A spawner's positive Delay counts down while its complete saved body is
     * otherwise unchanged. Rebase that baseline, retaining an explicit new Delay.
     * Resets/increases, changed spawn data, type changes and missing timers remain strict. */
    static MergeInputs rebaseSpawnerCountdown(CompoundTag base, CompoundTag mine, CompoundTag current) {
        var unchanged = new MergeInputs(base, mine);
        var b = blockData(base); var m = blockData(mine); var c = blockData(current);
        if (!b.getString("id").orElse("").equals("minecraft:mob_spawner")
            || !Objects.equals(b.get("id"), m.get("id")) || !Objects.equals(b.get("id"), c.get("id"))) return unchanged;
        var old = b.get("Delay"); var live = c.get("Delay");
        if (!(old instanceof NumericTag bt) || !(live instanceof NumericTag ct)
            || old.getId() != live.getId() || !(old instanceof ShortTag || old instanceof IntTag)
            || bt.intValue() <= 0 || ct.intValue() < 0 || ct.intValue() > bt.intValue()) return unchanged;
        var bs = b.copy(); var cs = c.copy(); bs.remove("Delay"); cs.remove("Delay");
        if (!bs.equals(cs)) return unchanged;
        var rb = base.copy(); var rm = mine.copy();
        blockData(rb).put("Delay", live.copy());
        var requested = m.get("Delay");
        // merge() may already have carried an untouched timer forward.
        if (Objects.equals(requested, old) || Objects.equals(requested, live)) blockData(rm).put("Delay", live.copy());
        return new MergeInputs(rb, rm);
    }
    /** Vanilla removes UUID from stored bee data. Only when the complete
     * ordered live occupant list is identical apart from advancing integer
     * timers can those untouched timers be rebased before strict list merge.
     * This does not infer identity for any arbitrary or modded list. */
    static MergeInputs rebaseBeeTimers(CompoundTag base, CompoundTag mine, CompoundTag current) {
        var unchanged = new MergeInputs(base,mine);
        var b = blockData(base); var m = blockData(mine); var c = blockData(current);
        if (!b.getString("id").orElse("").equals("minecraft:beehive")
            || !Objects.equals(b.get("id"),m.get("id")) || !Objects.equals(b.get("id"),c.get("id"))) return unchanged;
        var bees = b.getList("bees").orElse(null); var edits = m.getList("bees").orElse(null); var live = c.getList("bees").orElse(null);
        if (bees == null || edits == null || live == null || bees.size()!=edits.size() || bees.size()!=live.size()) return unchanged;
        for (int i=0;i<bees.size();i++) {
            if (!(bees.get(i) instanceof CompoundTag bb) || !(edits.get(i) instanceof CompoundTag) || !(live.get(i) instanceof CompoundTag cc)) return unchanged;
            if (!(bb.get("ticks_in_hive") instanceof IntTag bt) || !(cc.get("ticks_in_hive") instanceof IntTag ct) || ct.intValue()<bt.intValue()) return unchanged;
            var bs=bb.copy();var cs=cc.copy();bs.remove("ticks_in_hive");cs.remove("ticks_in_hive");
            if (!bs.equals(cs)) return unchanged;
        }
        var rebasedBase=base.copy();var rebasedMine=mine.copy();
        var baseBees=blockData(rebasedBase).getList("bees").orElseThrow();var mineBees=blockData(rebasedMine).getList("bees").orElseThrow();
        for(int i=0;i<bees.size();i++) {
            var bb=(CompoundTag)baseBees.get(i);var mm=(CompoundTag)mineBees.get(i);var cc=(CompoundTag)live.get(i);
            var oldTick=bb.get("ticks_in_hive");var myTick=mm.get("ticks_in_hive");var liveTick=cc.get("ticks_in_hive");
            // BlockVolatile.merge may already have copied the current timer.
            if (Objects.equals(myTick,oldTick) || Objects.equals(myTick,liveTick)) {
                bb.put("ticks_in_hive",liveTick.copy());mm.put("ticks_in_hive",liveTick.copy());
            }
        }
        return new MergeInputs(rebasedBase,rebasedMine);
    }
    private static CompoundTag blockData(CompoundTag session) { return session.getCompound("cad_session_nbt").orElse(session); }
    public static List<String> fields(CompoundTag nbt) {
        return switch (nbt.getString("id").orElse("")) {
            case "minecraft:furnace", "minecraft:smoker", "minecraft:blast_furnace" -> List.of("cooking_time_spent", "cooking_total_time", "lit_time_remaining", "lit_total_time");
            case "minecraft:brewing_stand" -> List.of("BrewTime", "Fuel");
            case "minecraft:hopper" -> List.of("TransferCooldown");
            case "minecraft:campfire" -> List.of("CookingTimes");
            case "minecraft:mob_spawner" -> List.of("Delay");
            case "minecraft:beacon" -> List.of("Levels");
            case "minecraft:jukebox" -> List.of("ticks_since_song_started");
            default -> List.of();
        };
    }
    public static CompoundTag stable(CompoundTag nbt) {
        var result = nbt.copy();
        // Internal session wrapper, never accepted from SNBT.
        if (result.contains("cad_session_nbt")) result.put("cad_session_nbt", stable(result.getCompound("cad_session_nbt").orElseThrow()));
        fields(result).forEach(result::remove);
        if (result.getString("id").orElse("").equals("minecraft:beehive"))
            result.getList("bees").ifPresent(bees -> bees.forEach(bee -> { if (bee instanceof CompoundTag c) c.remove("ticks_in_hive"); }));
        return result;
    }
    /** Only unchanged draft timers inherit current values; explicit timer edits remain explicit. */
    public static CompoundTag merge(CompoundTag requested, CompoundTag opened, CompoundTag current) {
        var result = requested.copy();
        for (String key : fields(current)) if (Objects.equals(requested.get(key), opened.get(key))) {
            if(key.equals("ticks_since_song_started") && !Objects.equals(requested.get("RecordItem"),current.get("RecordItem")))result.remove(key);
            else if (current.contains(key)) result.put(key, current.get(key).copy()); else result.remove(key);
        }
        if (current.getString("id").orElse("").equals("minecraft:beehive")) {
            var r = result.getList("bees").orElse(new ListTag()); var o = opened.getList("bees").orElse(new ListTag()); var c = current.getList("bees").orElse(new ListTag());
            // Structural/occupant changes remain strict; indices are safe only for the same occupant.
            if (r.size() == o.size() && o.size() == c.size()) for (int i=0;i<r.size();i++) {
                if (r.get(i) instanceof CompoundTag rr && o.get(i) instanceof CompoundTag oo && c.get(i) instanceof CompoundTag cc
                    && Objects.equals(rr.get("entity_data"), oo.get("entity_data")) && Objects.equals(oo.get("entity_data"), cc.get("entity_data"))
                    && Objects.equals(rr.get("ticks_in_hive"), oo.get("ticks_in_hive")) && cc.contains("ticks_in_hive")) rr.put("ticks_in_hive",cc.get("ticks_in_hive").copy());
            }
        }
        return result;
    }
}
