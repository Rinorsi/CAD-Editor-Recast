package dev.rinorsi.editor;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.LoggerFactory;

/** Failure-only diagnostics. Callers supply IDs/stages, never complete requests or saved data. */
public final class EditorDiagnostics {
    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger("CAD-Editor");
    private static final Map<String, Long> LAST = new LinkedHashMap<>();
    private EditorDiagnostics() {}

    public static void failure(String stage, String context, Throwable error) { report(false, stage, context, error); }
    public static void warning(String stage, String context, Throwable error) { report(true, stage, context, error); }

    private static void report(boolean warning, String stage, String context, Throwable error) {
        if (error == null) return;
        while ((error instanceof java.util.concurrent.CompletionException || error instanceof java.util.concurrent.ExecutionException) && error.getCause() != null) error = error.getCause();
        if (error instanceof java.util.concurrent.CancellationException || error instanceof InterruptedException) return;
        String safeStage = clean(stage), safeContext = clean(context);
        String key = safeStage + ':' + safeContext + ':' + error.getClass().getName();
        synchronized (LAST) {
            long now = System.nanoTime();
            Long last = LAST.get(key);
            if (last != null && now - last < 30_000_000_000L) return;
            if (LAST.size() >= 128 && last == null) LAST.remove(LAST.keySet().iterator().next());
            LAST.put(key, now);
        }
        if (warning) LOG.warn("[CAD-Editor] stage={} context={} (same failure limited to once per 30s)", safeStage, safeContext, error);
        else LOG.error("[CAD-Editor] stage={} context={} (same failure limited to once per 30s)", safeStage, safeContext, error);
    }

    private static String clean(String text) {
        if (text == null) return "";
        var out = new StringBuilder();
        text.codePoints().limit(240).forEach(c -> {
            int type = Character.getType(c);
            if (Character.isISOControl(c) || type == Character.FORMAT || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR) out.append(' ');
            else out.appendCodePoint(c);
        });
        return out.toString();
    }
}
