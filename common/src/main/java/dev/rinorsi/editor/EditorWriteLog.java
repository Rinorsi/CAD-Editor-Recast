package dev.rinorsi.editor;

import org.slf4j.LoggerFactory;

/** Low-frequency write lifecycle events. Never pass NBT, commands or full request bodies. */
public final class EditorWriteLog {
    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger("CAD-Editor-Write");
    private EditorWriteLog() {}

    public static void event(String stage, String request, String context) {
        LOG.info("[CAD-Editor-Write] stage={} request={} {}", clean(stage, 80), clean(request, 80), clean(context, 1000));
    }
    public static void warning(String stage, String request, String context) {
        LOG.warn("[CAD-Editor-Write] stage={} request={} {}", clean(stage, 80), clean(request, 80), clean(context, 1000));
    }
    public static void failure(String stage, String request, String context, RuntimeException error) {
        if (error instanceof IllegalArgumentException) warning(stage, request, context + " reason=" + error.getMessage());
        else LOG.error("[CAD-Editor-Write] stage={} request={} {}", clean(stage, 80), clean(request, 80), clean(context, 1000), error);
    }
    static String clean(String text, int limit) {
        if (text == null) return "-";
        var out = new StringBuilder();
        text.codePoints().limit(limit).forEach(c -> {
            int type = Character.getType(c);
            if (Character.isISOControl(c) || type == Character.FORMAT || type == Character.SURROGATE || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR) out.append(' ');
            else out.appendCodePoint(c);
        });
        return out.toString();
    }
}
