package dev.rinorsi.editor.registry;

import java.util.HashMap;
import java.util.Map;

/** One Document's draft write watermarks. A cleared/overwritten upload cannot resurrect. */
final class DraftWriteOrder {
    private record Stamp(long sequence, String operation) {}
    private final Map<String, Stamp> latest = new HashMap<>();
    boolean duplicate(String key, long sequence, String operation) {
        var previous = latest.get(key);
        if (previous == null || sequence > previous.sequence) return false;
        if (sequence == previous.sequence && previous.operation.equals(operation)) return true;
        throw new IllegalArgumentException("旧草稿写入版本已失效");
    }
    void commit(String key, long sequence, String operation) { latest.put(key, new Stamp(sequence, operation)); }
    void require(String key, long sequence) {
        var previous = latest.get(key);
        if (previous == null || previous.sequence != sequence) throw new IllegalArgumentException("草稿分块所属版本已失效");
    }
}
