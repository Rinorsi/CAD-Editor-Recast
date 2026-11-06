package dev.rinorsi.editor.registry;

import java.nio.charset.StandardCharsets;

public final class DraftUtf8CounterTest {
    public static void main(String[] args) {
        String value = "ASCII汉字é😀".repeat(10_000);
        for (int size : new int[]{1, 7, 2800}) {
            var counter = new DraftUtf8Counter(); int actual = 0;
            for (int i = 0; i < value.length(); i += size) actual = counter.append(value.substring(i, Math.min(i + size, value.length())));
            if (actual != value.getBytes(StandardCharsets.UTF_8).length) throw new AssertionError("UTF-8 mismatch " + size);
        }
        for (String bad : new String[]{String.valueOf((char) 0xdc00), String.valueOf((char) 0xd800) + "x"}) {
            try { new DraftUtf8Counter().append(bad); throw new AssertionError("malformed surrogate accepted"); }
            catch (IllegalArgumentException expected) {}
        }
        System.out.println("PASS incremental draft UTF-8: ASCII, BMP, split surrogate pairs, malformed pairs.");
    }
}
