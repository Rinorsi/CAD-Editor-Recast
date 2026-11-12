package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

/** Incremental UTF-8 accounting, including a surrogate pair split across two chunks. */
final class DraftUtf8Counter {
    private int bytes;
    private boolean high;
    int append(String text) {
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (high) {
                if (!Character.isLowSurrogate(c)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.draftutf8counter.e401595b1f"));
                bytes += 4; high = false;
            } else if (Character.isHighSurrogate(c)) high = true;
            else if (Character.isLowSurrogate(c)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.draftutf8counter.e401595b1f"));
            else bytes += c < 128 ? 1 : c < 2048 ? 2 : 3;
        }
        return bytes;
    }
}
