package dev.rinorsi.editor.world;

import java.util.*;
import net.minecraft.nbt.*;

/** Narrow, version-audited ticking fields. Evidence: docs/world-block-edit.md. */
public final class BlockVolatile {
    private BlockVolatile() {}
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
