package dev.rinorsi.editor.client;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** Injectable scheduler, clock and sink: never accesses the operating-system clipboard. */
public final class EditorClipboardTest {
    private static int checks;
    public static void main(String[] args) {
        var now = new AtomicLong();
        var active = new AtomicBoolean(true);
        var queue = new ArrayList<Runnable>();
        var writes = new ArrayList<String>();
        var bridge = new EditorClipboard(now::get);
        java.util.function.Consumer<JsonElement> send = value ->
                bridge.accept(value, queue::add, active::get, writes::add);
        send.accept(null);
        for (String bad : new String[]{"null", "[]", "true", "1", "{}",
                "{\"text\":null}", "{\"text\":true}", "{\"text\":1}",
                "{\"text\":[]}", "{\"text\":{}}"}) send.accept(JsonParser.parseString(bad));
        send.accept(message("x".repeat(32768)));
        check(queue.isEmpty(), "invalid values rejected before scheduling");
        var payload = message("snapshot");
        send.accept(payload); payload.addProperty("text", "changed");
        check(writes.isEmpty() && queue.size() == 1, "write scheduled onto main thread");
        drain(queue);
        check(writes.equals(java.util.List.of("snapshot")), "immutable message snapshot");
        send.accept(message("")); send.accept(message("x".repeat(32767)));
        send.accept(message("fourth")); send.accept(message("fifth")); drain(queue);
        check(writes.size() == 4 && writes.get(1).isEmpty() && writes.get(2).length() == 32767,
                "empty and maximum length accepted; fifth write blocked");
        now.set(999_999_999L); send.accept(message("early")); drain(queue);
        check(writes.size() == 4, "window does not expire early");
        now.set(1_000_000_000L); send.accept(message("boundary")); drain(queue);
        check(writes.size() == 5, "one-second boundary expires old writes");
        active.set(false);
        for (int i = 0; i < 5; i++) send.accept(message("closed"));
        drain(queue); check(writes.size() == 5, "inactive page cannot write");
        active.set(true);
        send.accept(message("queued before close")); active.set(false); drain(queue);
        check(writes.size() == 5, "close invalidates pending main-thread task");
        active.set(true);
        for (int i = 0; i < 4; i++) send.accept(message("reopened"));
        drain(queue); check(writes.size() == 8, "inactive requests consume no quota; reopen retains existing quota");
        now.set(1_500_000_000L); send.accept(message("half second")); drain(queue);
        check(writes.size() == 8, "rolling window quota remains enforced");
        now.set(2_000_000_000L); send.accept(message("next")); drain(queue);
        check(writes.size() == 9, "rolling window releases quota");
        System.out.println("PASS EditorClipboard: " + checks + " checks (mock sink only; OS clipboard untouched)");
    }
    private static JsonObject message(String text) {
        var object = new JsonObject(); object.addProperty("text", text); return object;
    }
    private static void drain(ArrayList<Runnable> queue) {
        var tasks = new ArrayList<>(queue); queue.clear(); tasks.forEach(Runnable::run);
    }
    private static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label); checks++;
    }
}
