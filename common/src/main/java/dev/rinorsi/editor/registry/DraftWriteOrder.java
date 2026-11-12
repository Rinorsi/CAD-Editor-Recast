package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

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
        throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.draftwriteorder.84f6d95100"));
    }
    void commit(String key, long sequence, String operation) { latest.put(key, new Stamp(sequence, operation)); }
    void require(String key, long sequence) {
        var previous = latest.get(key);
        if (previous == null || previous.sequence != sequence) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.draftwriteorder.14c3b87caa"));
    }
}
