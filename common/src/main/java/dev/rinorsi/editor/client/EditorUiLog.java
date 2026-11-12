package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonElement;
import java.util.ArrayDeque;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.LongSupplier;

/** Bounded, write-only UI diagnostics. All logging and logger setup run off the client thread. */
final class EditorUiLog implements AutoCloseable {
    enum Level { DEBUG, INFO, WARN, ERROR }
    private record Entry(Level level, String message) {}
    private static final long SECOND = 1_000_000_000L;
    private static final int CAPACITY = 128;
    private final ArrayDeque<Entry> pending = new ArrayDeque<>();
    private final ArrayDeque<Long> received = new ArrayDeque<>();
    private final ArrayDeque<Long> emitted = new ArrayDeque<>();
    private final LongSupplier clock;
    private final BiConsumer<Level, String> sink;
    private final boolean asynchronous;
    private ScheduledExecutorService worker;
    private long dropped, lastSummary;
    private boolean closed;

    EditorUiLog(LongSupplier clock, BiConsumer<Level, String> sink) { this(clock, sink, false); }
    private EditorUiLog(LongSupplier clock, BiConsumer<Level, String> sink, boolean asynchronous) {
        this.clock = clock; this.sink = sink; this.asynchronous = asynchronous; lastSummary = clock.getAsLong();
    }
    static EditorUiLog live() { return new EditorUiLog(System::nanoTime, EditorUiLog::write, true); }

    void accept(JsonElement value) {
        if (value == null || !value.isJsonObject()) return;
        var object = value.getAsJsonObject(); var level = object.get("level"); var msg = object.get("msg");
        if (level == null || !level.isJsonPrimitive() || !level.getAsJsonPrimitive().isString()
                || msg == null || !msg.isJsonPrimitive() || !msg.getAsJsonPrimitive().isString()) return;
        String name = level.getAsString(); if (name.length() > 5) return;
        Level severity = switch (name) {
            case "debug" -> Level.DEBUG; case "info" -> Level.INFO;
            case "warn" -> Level.WARN; case "error" -> Level.ERROR; default -> null;
        };
        if (severity == null) return;
        log(severity, msg.getAsString());
    }

    void log(Level severity, String message) {
        synchronized (this) {
            if (closed) return;
            long now = clock.getAsLong(); expire(received, now);
            if (received.size() >= 20 || pending.size() >= CAPACITY) {
                if (dropped < Long.MAX_VALUE) dropped++;
            } else {
                received.addLast(now);
                pending.addLast(new Entry(severity, sanitize(message))); // Only accepted entries cost up to 1500 UTF-16 units.
            }
            if (asynchronous && worker == null) {
                worker = Executors.newSingleThreadScheduledExecutor(task -> {
                    var thread = new Thread(task, "CAD-Editor-Recast-log"); thread.setDaemon(true); return thread;
                });
                worker.scheduleWithFixedDelay(this::drain, 0, 250, TimeUnit.MILLISECONDS);
            }
        }
    }

    /** Fake-clock tests drain explicitly; production only calls this on its daemon worker. */
    void drain() {
        for (int i = 0; i < 20; i++) {
            Entry next = poll(); if (next == null) return;
            try { sink.accept(next.level, next.message); } catch (RuntimeException ignored) { /* Never break the page or its client thread. */ }
        }
    }
    private synchronized Entry poll() {
        long now = clock.getAsLong(); expire(emitted, now);
        if (emitted.size() >= 20) return null;
        Entry next;
        if (dropped > 0 && now - lastSummary >= 5 * SECOND) {
            next = new Entry(Level.WARN, EditorI18n.tr("cadeditor.message.editoruilog.b424a85f3a", (dropped))); dropped = 0; lastSummary = now;
        } else next = pending.pollFirst();
        if (next != null) emitted.addLast(now);
        return next;
    }
    private static void expire(ArrayDeque<Long> window, long now) {
        while (!window.isEmpty() && now - window.getFirst() >= SECOND) window.removeFirst();
    }
    private static String sanitize(String text) {
        int end = Math.min(text.length(), 1500);
        if (end < text.length() && Character.isHighSurrogate(text.charAt(end - 1))
                && Character.isLowSurrogate(text.charAt(end))) end--;
        var out = new StringBuilder(end);
        for (int i = 0; i < end; i++) {
            char c = text.charAt(i); int type = Character.getType(c);
            if (Character.isHighSurrogate(c) && i + 1 < end && Character.isLowSurrogate(text.charAt(i + 1))) {
                if (Character.getType(Character.toCodePoint(c, text.charAt(i + 1))) == Character.FORMAT) { out.append(' '); i++; }
                else out.append(c).append(text.charAt(++i));
            } else if (Character.isSurrogate(c) || Character.isISOControl(c) || type == Character.FORMAT
                    || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR) out.append(' ');
            else out.append(c);
        }
        return out.toString();
    }
    private static final class LogHolder {
        static final org.slf4j.Logger LOGGER = logger();
        private static org.slf4j.Logger logger() {
            // Minecraft's root is usually INFO. Enable DEBUG only for our explicitly sent UI diagnostics.
            org.apache.logging.log4j.core.config.Configurator.setLevel("CAD-Editor-Recast", org.apache.logging.log4j.Level.DEBUG);
            return org.slf4j.LoggerFactory.getLogger("CAD-Editor-Recast");
        }
    }
    private static void write(Level level, String message) {
        var log = LogHolder.LOGGER;
        switch (level) {
            case DEBUG -> log.debug("[CAD-Editor-Recast] {}", message);
            case INFO -> log.info("[CAD-Editor-Recast] {}", message);
            case WARN -> log.warn("[CAD-Editor-Recast] {}", message);
            case ERROR -> log.error("[CAD-Editor-Recast] {}", message);
        }
    }
    @Override public synchronized void close() {
        if (closed) return; closed = true;
        if (worker != null) { worker.execute(this::drain); worker.shutdown(); } // No join/disk wait on the client thread.
    }
}
