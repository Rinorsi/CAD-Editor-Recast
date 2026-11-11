package dev.rinorsi.editor.client;

/** One native undoable replacement for Tab / Shift+Tab in the advanced text field. */
final class CodeIndent {
    record Edit(int from, int to, String text, int selectionStart, int selectionEnd) {}

    private CodeIndent() {}

    static Edit plan(String value, int start, int end, boolean outdent) {
        start = Math.clamp(start, 0, value.length());
        end = Math.clamp(end, start, value.length());
        if (!outdent && start == end) return new Edit(start, end, "  ", start + 2, start + 2);
        int from = value.lastIndexOf('\n', Math.max(-1, start - 1)) + 1;
        // An exclusive endpoint at the next line's start does not select that line.
        int last = end > start && value.charAt(end - 1) == '\n' ? end - 1 : end;
        int to = value.indexOf('\n', last);
        if (to < 0) to = value.length();
        String[] lines = value.substring(from, to).split("\n", -1);
        var text = new StringBuilder();
        int firstDelta = 0, totalDelta = 0;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            int delta;
            if (outdent) {
                int remove = line.startsWith("\t") ? 1 : line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0;
                delta = -remove;
                line = line.substring(remove);
            } else { delta = 2; line = "  " + line; }
            if (i == 0) firstDelta = delta;
            totalDelta += delta;
            if (i > 0) text.append('\n');
            text.append(line);
        }
        if (totalDelta == 0) return null;
        int nextStart = Math.max(from, start + firstDelta);
        int nextEnd = Math.max(nextStart, end + totalDelta);
        return new Edit(from, to, text.toString(), nextStart, nextEnd);
    }
}
