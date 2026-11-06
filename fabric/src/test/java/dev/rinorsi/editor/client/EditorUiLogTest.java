package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/** Fake clock/queue tests plus actual asynchronous SLF4J -> Log4j pipeline, no game startup. */
public final class EditorUiLogTest {
    private record Written(EditorUiLog.Level level, String message) {}
    private static int checks;
    private static final class Harness {
        final AtomicLong now = new AtomicLong();
        final ArrayList<Written> out = new ArrayList<>();
        final EditorUiLog log = new EditorUiLog(now::get, (level, text) -> out.add(new Written(level, text)));
        void send(String level, String text) { log.accept(message(level, text)); }
    }
    static void run() throws Exception {
        var h = new Harness(); h.log.accept(null);
        for (String invalid : new String[]{"null", "[]", "1", "true", "{}",
                "{\"level\":\"info\"}", "{\"msg\":\"x\"}",
                "{\"level\":1,\"msg\":\"x\"}", "{\"level\":null,\"msg\":\"x\"}",
                "{\"level\":\"DEBUG\",\"msg\":\"x\"}", "{\"level\":\"fatal\",\"msg\":\"x\"}"})
            h.log.accept(JsonParser.parseString(invalid));
        for (String invalid : new String[]{"null", "1", "true", "[]", "{}"}) {
            var object = message("info", "x"); object.add("msg", JsonParser.parseString(invalid)); h.log.accept(object);
        }
        h.log.drain(); check(h.out.isEmpty(), "invalid levels/messages ignored");
        for (String level : new String[]{"debug", "info", "warn", "error"}) h.send(level, level);
        check(h.out.isEmpty(), "accept never invokes log sink on caller thread"); h.log.drain();
        for (int i = 0; i < 4; i++) check(h.out.get(i).level() == EditorUiLog.Level.values()[i], "four levels mapped " + i);
        var mutable = message("info", "snapshot"); h.log.accept(mutable); mutable.addProperty("msg", "changed"); h.log.drain();
        check(h.out.getLast().message().equals("snapshot"), "queued message immutable");
        h.send("info", "x".repeat(4000)); h.log.drain();
        check(h.out.getLast().message().equals("x".repeat(1500)), "truncate at 1500");
        h.send("info", "a\r\n\t\0\u001b\u007f\u0085\u2028\u2029\u202e"); h.log.drain();
        check(h.out.getLast().message().equals("a" + " ".repeat(10)), "each control character becomes a space");
        check(h.out.getLast().message().chars().noneMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.FORMAT
                || Character.getType(c) == Character.LINE_SEPARATOR || Character.getType(c) == Character.PARAGRAPH_SEPARATOR), "control and line/format chars replaced");
        h.send("info", "x".repeat(1499) + "😀"); h.log.drain();
        check(h.out.getLast().message().length() == 1499, "truncation does not split surrogate pair");
        h.send("info", "\udb40\udc01\ud800"); h.log.drain();
        check(h.out.getLast().message().equals("  "), "supplementary format and unpaired surrogate sanitized");
        h.send("info", ""); h.log.drain(); check(h.out.getLast().message().isEmpty(), "empty string allowed");
        h.log.close(); int before = h.out.size(); h.send("info", "closed"); h.log.drain();
        check(h.out.size() == before, "closed receiver ignores new messages");

        h = new Harness();
        for (int i = 0; i < 25; i++) h.send("info", "burst"); h.log.drain();
        check(h.out.size() == 20, "twenty per rolling second");
        h.now.set(4_999_999_999L); h.log.drain(); check(h.out.size() == 20, "no early summary");
        h.now.set(5_000_000_000L); h.log.drain();
        check(h.out.getLast().level() == EditorUiLog.Level.WARN && h.out.getLast().message().equals("已丢弃 5 条"), "five-second drop summary");
        h.now.set(6_000_000_000L);
        for (int i = 0; i < 21; i++) h.send("info", "next"); h.log.drain();
        h.now.set(9_999_999_999L); int size = h.out.size(); h.log.drain(); check(h.out.size() == size, "summary interval maintained");
        h.now.set(10_000_000_000L); h.log.drain(); check(h.out.getLast().message().equals("已丢弃 1 条"), "drop counter resets after summary");

        h = new Harness();
        for (int i = 0; i < 20; i++) h.send("debug", "first"); h.log.drain();
        h.now.set(999_999_999L); h.send("info", "early"); h.log.drain(); check(h.out.size() == 20, "rolling boundary not expired early");
        h.now.set(1_000_000_000L); h.send("info", "boundary"); h.log.drain(); check(h.out.size() == 21, "rolling boundary releases quota");

        h = new Harness();
        for (int second = 0; second < 8; second++) {
            h.now.set(second * 1_000_000_000L); for (int i = 0; i < 20; i++) h.send("info", "queued");
        }
        h.log.drain(); check(h.out.size() == 20 && h.out.getFirst().message().equals("已丢弃 32 条"), "queue bounded at 128 and summary shares output quota");
        for (int second = 8; second < 16; second++) {
            h.now.set(second * 1_000_000_000L); before = h.out.size(); h.log.drain();
            check(h.out.size() - before <= 20, "backlog drain never floods logger " + second);
        }
        check(h.out.stream().filter(e -> e.level() == EditorUiLog.Level.INFO).count() == 128, "all accepted bounded-queue entries drained");
        var broken = new EditorUiLog(System::nanoTime, (level, text) -> { throw new IllegalStateException("mock sink unavailable"); });
        broken.accept(message("error", "unavailable")); broken.drain(); check(true, "sink failure does not escape to page");
        actualLogger();
        System.out.println("PASS EditorUiLog: " + checks + " checks (validation, sanitization, truncation, bounded async log, 20/sec, 5s summaries, actual SLF4J levels)");
    }
    private static void actualLogger() throws Exception {
        var context = (org.apache.logging.log4j.core.LoggerContext) org.apache.logging.log4j.LogManager.getContext(false);
        var logger = context.getLogger("CAD-Editor-Recast"); var previous = logger.getLevel();
        var directory = java.nio.file.Files.createTempDirectory(java.nio.file.Path.of("."), "editor-ui-log-test-");
        var path = directory.resolve("latest.log");
        var file = org.apache.logging.log4j.core.appender.FileAppender.newBuilder().withFileName(path.toString()).withAppend(false)
                .setName("EditorUiLogTestFile").setConfiguration(context.getConfiguration())
                .setLayout(org.apache.logging.log4j.core.layout.PatternLayout.newBuilder().withPattern("[%level] [%logger] %msg%n").build()).build();
        file.start(); logger.addAppender(file);
        var latch = new CountDownLatch(4); var events = new java.util.concurrent.CopyOnWriteArrayList<org.apache.logging.log4j.core.LogEvent>();
        var appender = new org.apache.logging.log4j.core.appender.AbstractAppender("EditorUiLogTest", null, null, true,
                org.apache.logging.log4j.core.config.Property.EMPTY_ARRAY) {
            @Override public void append(org.apache.logging.log4j.core.LogEvent event) {
                if (event.getMessage().getFormattedMessage().startsWith("[CAD-Editor-Recast] ui-log-test-")) { events.add(event.toImmutable()); latch.countDown(); }
            }
        };
        appender.start(); logger.addAppender(appender); var live = EditorUiLog.live();
        try {
            for (String level : new String[]{"debug", "info", "warn", "error"}) live.accept(message(level, "ui-log-test-" + level));
            check(latch.await(3, TimeUnit.SECONDS), "actual asynchronous logger receives all four levels including DEBUG");
            for (var event : events) {
                check(event.getLoggerName().equals("CAD-Editor-Recast") && event.getThreadName().equals("CAD-Editor-Recast-log"), "logger name and worker thread");
                check(event.getMessage().getFormattedMessage().equals("[CAD-Editor-Recast] ui-log-test-" + event.getLevel().toString().toLowerCase(java.util.Locale.ROOT)), "real level and prefix");
            }
            String text = ""; long deadline = System.nanoTime() + 3_000_000_000L;
            while (System.nanoTime() < deadline) {
                if (java.nio.file.Files.isRegularFile(path)) text = java.nio.file.Files.readString(path);
                if (text.lines().count() == 4) break; Thread.sleep(5);
            }
            for (String level : new String[]{"DEBUG", "INFO", "WARN", "ERROR"})
                check(text.contains("[" + level + "] [CAD-Editor-Recast] [CAD-Editor-Recast] ui-log-test-" + level.toLowerCase(java.util.Locale.ROOT)), "isolated latest.log contains " + level);
        } finally { live.close(); logger.removeAppender(appender); appender.stop();
            logger.removeAppender(file); file.stop(); java.nio.file.Files.deleteIfExists(path); java.nio.file.Files.deleteIfExists(directory);
            org.apache.logging.log4j.core.config.Configurator.setLevel("CAD-Editor-Recast", previous); }
    }
    private static JsonObject message(String level, String msg) { var object = new JsonObject(); object.addProperty("level", level); object.addProperty("msg", msg); return object; }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
}
