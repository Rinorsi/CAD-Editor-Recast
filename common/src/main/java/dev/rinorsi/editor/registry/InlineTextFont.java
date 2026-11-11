package dev.rinorsi.editor.registry;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.resources.Identifier;

/** Editor-only CSS alias for vanilla object glyphs; no resource pack or Oriel fork. */
public final class InlineTextFont {
    private static final String PREFIX = "cadeditor_inline:atlas/";
    private InlineTextFont() {}

    public static String family(FontDescription font) {
        if (font instanceof FontDescription.Resource resource) return resource.id().toString();
        if (font instanceof FontDescription.AtlasSprite sprite)
            return PREFIX + hex(sprite.atlasId()) + "/" + hex(sprite.spriteId());
        return null;
    }
    private static String hex(Identifier id) {
        return HexFormat.of().formatHex(id.toString().getBytes(StandardCharsets.UTF_8));
    }
    public static FontDescription resolve(List<String> families) {
        for (String family : families) {
            if (!family.startsWith(PREFIX) || family.length() > 4096) continue;
            String[] parts = family.substring(PREFIX.length()).split("/", -1);
            if (parts.length != 2) continue;
            try {
                Identifier atlas = Identifier.tryParse(new String(HexFormat.of().parseHex(parts[0]), StandardCharsets.UTF_8));
                Identifier sprite = Identifier.tryParse(new String(HexFormat.of().parseHex(parts[1]), StandardCharsets.UTF_8));
                if (atlas != null && sprite != null) return new FontDescription.AtlasSprite(atlas, sprite);
            } catch (IllegalArgumentException ignored) { /* malformed aliases use the usual font fallback */ }
        }
        return null;
    }
}
