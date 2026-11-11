package dev.rinorsi.editor;

import java.nio.file.Files;
import java.util.ArrayList;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.appender.FileAppender;
import org.apache.logging.log4j.core.config.Configurator;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.layout.PatternLayout;

/** Real SLF4J -> Log4j/file evidence, including request correlation and failure stack traces. */
public final class EditorWriteLogTest {
    public static void main(String[] args) throws Exception {
        check(EditorWriteLog.clean("a\r\n\t\u202e\u2028\ud800", 80).equals("a" + " ".repeat(6)), "single-line control filtering");
        check(EditorWriteLog.clean("😀x", 1).equals("😀"), "code-point boundary");
        check(EditorWriteLog.clean(null, 80).equals("-"), "missing request marker");
        var path = Files.createTempFile("editor-write-log-test-", ".log");
        Logger logger = (Logger) org.apache.logging.log4j.LogManager.getLogger("CAD-Editor-Write");
        Level previous = logger.getLevel();
        Configurator.setLevel(logger.getName(), Level.INFO);
        var events = new ArrayList<org.apache.logging.log4j.core.LogEvent>();
        var appender = new AbstractAppender("EditorWriteLogTest", null, null, true, Property.EMPTY_ARRAY) {
            @Override public void append(org.apache.logging.log4j.core.LogEvent event) { events.add(event.toImmutable()); }
        };
        var file = FileAppender.newBuilder().setName("EditorWriteLogFileTest").withFileName(path.toString())
                .setLayout(PatternLayout.newBuilder().withPattern("%level %msg%n%throwable").build()).build();
        appender.start(); file.start(); logger.addAppender(appender); logger.addAppender(file);
        try {
            EditorWriteLog.event("client.creative.sent", "test-request", "packet=ServerboundSetCreativeModeSlotPacket creative_slot=36");
            EditorWriteLog.warning("client.apply.timeout", "test-request", "outcome=unknown permission_denial_not_proven=true");
            EditorWriteLog.failure("client.apply.decode", "test-request", "fixture=true", new IllegalArgumentException("invalid input"));
            EditorWriteLog.failure("client.apply.creative_send", "test-request", "fixture=true", new IllegalStateException("fixture send failure"));
            EditorWriteLog.event("fixture\nforged", "r".repeat(200), "x".repeat(2000));
            check(events.size() == 5, "all lifecycle events emitted");
            check(events.get(0).getLevel() == Level.INFO && events.get(1).getLevel() == Level.WARN, "send vs unknown severity");
            check(events.get(2).getLevel() == Level.WARN && events.get(2).getThrown() == null, "input rejection not internal error");
            check(events.get(3).getLevel() == Level.ERROR && events.get(3).getThrown() instanceof IllegalStateException, "unexpected failure retains stack");
            for (int i = 0; i < 4; i++) check(events.get(i).getMessage().getFormattedMessage().contains("request=test-request"), "request correlation");
            String bounded = events.get(4).getMessage().getFormattedMessage();
            check(!bounded.contains("\n") && bounded.length() < 1250 && !bounded.contains("r".repeat(81)), "bounded single-line fields");
            String text = Files.readString(path);
            check(text.contains("packet=ServerboundSetCreativeModeSlotPacket") && text.contains("permission_denial_not_proven=true"), "file includes send and unknown result");
            check(text.contains("java.lang.IllegalStateException: fixture send failure") && text.contains("EditorWriteLogTest.main"), "file includes diagnostic stack");
            System.out.println("EditorWriteLogTest passed: lifecycle log/file, severity, correlation, bounds and stacks");
        } finally {
            logger.removeAppender(appender); logger.removeAppender(file); appender.stop(); file.stop();
            Configurator.setLevel(logger.getName(), previous); Files.deleteIfExists(path);
        }
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); }
}
