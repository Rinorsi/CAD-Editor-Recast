package dev.rinorsi.editor.client;

import java.util.List;

/** GUI-pixel packing; never moves another mod's controls. */
public final class VaultButtonLayout {
    public record Box(int x, int y, int width, int height) {
        boolean overlaps(Box other) {
            return x < other.x + other.width + 4 && x + width + 4 > other.x
                    && y < other.y + other.height + 4 && y + height + 4 > other.y;
        }
    }
    private VaultButtonLayout() {}
    public static Box place(int width, int height, int buttonWidth, List<Box> occupied) {
        // Prefer the quiet upper-right corner; leave the footer text area alone.
        for (int y = 4; y + 20 <= height - 32; y += 24) {
            for (int x = width - buttonWidth - 4; x >= 4; x -= 4) {
                Box candidate = new Box(x, y, buttonWidth, 20);
                if (occupied.stream().noneMatch(candidate::overlaps)) return candidate;
            }
        }
        return null; // Crowded modded screen: key/command remain available.
    }
}
