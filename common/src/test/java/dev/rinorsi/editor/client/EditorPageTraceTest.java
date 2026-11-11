package dev.rinorsi.editor.client;

import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicLong;

public final class EditorPageTraceTest {
    public static void main(String[] args) throws Exception { run(); EditorUiLogTest.run(); }
    static void run() {
        var now = new AtomicLong();
        var messages = new ArrayList<String>();
        var levels = new ArrayList<EditorUiLog.Level>();
        var log = new EditorUiLog(now::get, (level, message) -> { levels.add(level); messages.add(message); });
        var trace = new EditorPageTrace(log, now::get);
        for (String value : new String[]{"null", "[]", "{}", "{\"phase\":7}", "{\"phase\":\"other\"}", "{\"phase\":\"first_frame_callback\"}"}) trace.accept(JsonParser.parseString(value));
        log.drain(); check(messages.isEmpty(), "invalid or premature marker ignored");
        now.set(100_000_000); trace.accept(JsonParser.parseString("{\"phase\":\"boot\"}"));
        check(messages.isEmpty(), "no synchronous log sink on render thread");
        log.drain(); check(levels.getLast() == EditorUiLog.Level.INFO && messages.getLast().contains("load_ms=100.00"), "host monotonic measurement");
        now.set(300_000_000); trace.accept(JsonParser.parseString("{\"phase\":\"first_frame_callback\"}"));
        log.drain(); check(levels.getLast() == EditorUiLog.Level.WARN && messages.getLast().contains("slow=true"), "slow load warn");
        trace.accept(JsonParser.parseString("{\"phase\":\"boot\"}"));
        trace.accept(JsonParser.parseString("{\"phase\":\"first_frame_callback\"}"));
        log.drain(); check(messages.size() == 2, "one pair per document");
        var reloaded = new EditorPageTrace(log, now::get);
        now.set(350_000_000); reloaded.accept(JsonParser.parseString("{\"phase\":\"boot\",\"load_ms\":0}"));
        log.drain(); check(messages.getLast().contains("load_ms=50.00"), "reload starts fresh; ignores supplied clock");
        log.close();
        System.out.println("PASS EditorPageTrace: malformed/order/duplicate/reload/host-clock/slow-warning/asynchronous-sink");
    }
    private static void check(boolean ok, String label) { if (!ok) throw new AssertionError(label); }
}
