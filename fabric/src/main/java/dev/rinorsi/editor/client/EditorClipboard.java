package dev.rinorsi.editor.client;

import com.google.gson.JsonElement;
import java.util.ArrayDeque;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** Write-only host bridge; scheduling and the clipboard sink are injectable for OS-free tests. */
final class EditorClipboard {
    private final LongSupplier clock;
    private final ArrayDeque<Long> writes = new ArrayDeque<>();
    EditorClipboard(LongSupplier clock) { this.clock = clock; }

    void accept(JsonElement value, Consumer<Runnable> mainThread, BooleanSupplier active, Consumer<String> write) {
        if (value == null || !value.isJsonObject()) return;
        JsonElement text = value.getAsJsonObject().get("text");
        if (text == null || !text.isJsonPrimitive() || !text.getAsJsonPrimitive().isString()) return;
        String snapshot = text.getAsString();
        if (snapshot.length() > 32767) return;
        mainThread.accept(() -> {
            if (active.getAsBoolean() && allow()) write.accept(snapshot);
        });
    }

    private synchronized boolean allow() {
        long now = clock.getAsLong();
        while (!writes.isEmpty() && now - writes.getFirst() >= 1_000_000_000L) writes.removeFirst();
        if (writes.size() >= 4) return false;
        writes.addLast(now);
        return true;
    }
}
