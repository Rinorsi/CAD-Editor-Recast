package dev.rinorsi.editor;

import com.mojang.brigadier.exceptions.CommandSyntaxException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.DoubleTag;
import net.minecraft.nbt.FloatTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.nbt.TagParser;

/**
 * A deliberately narrow extension to vanilla SNBT. Minecraft can store non-finite
 * float/double tags and prints them as {@code NaNf}/{@code Infinityd}, but its 26.x
 * parser rejects those spellings. Only those explicitly suffixed value tokens are
 * extended here; ordinary numbers, integer fields and bare strings still use the
 * vanilla parser unchanged.
 */
final class SpecialFloatingPointSnbt {
    private static final Pattern SPECIAL = Pattern.compile("([+-]?)(NaN|Infinity)([fFdD])");

    private SpecialFloatingPointSnbt() {}

    static Tag parse(String text) throws CommandSyntaxException {
        var tokens = scan(text);
        if (tokens.stream().noneMatch(Token::special))
            return TagParser.create(NbtOps.INSTANCE).parseFully(text);

        Map<Integer, FloatReplacement> floats = new HashMap<>();
        Map<Long, DoubleReplacement> doubles = new HashMap<>();
        var parses = new ArrayList<Tag>();
        for (int pass = 0; pass < 2; pass++) {
            int nextFloat = Float.floatToRawIntBits(Float.MAX_VALUE / (pass == 0 ? 2.0f : 4.0f));
            long nextDouble = Double.doubleToRawLongBits(Double.MAX_VALUE / (pass == 0 ? 2.0d : 4.0d));
            var rewritten = new StringBuilder(text.length() + 32);
            int cursor = 0;
            for (Token token : tokens) {
                if (!token.special) continue;
                rewritten.append(text, cursor, token.start);
                Matcher special = SPECIAL.matcher(token.text);
                special.matches();
                boolean isFloat = Character.toLowerCase(special.group(3).charAt(0)) == 'f';
                boolean negative = special.group(1).equals("-");
                boolean nan = special.group(2).equals("NaN");
                if (isFloat) {
                    float placeholder = Float.intBitsToFloat(nextFloat);
                    float value = nan ? Float.NaN : negative ? Float.NEGATIVE_INFINITY : Float.POSITIVE_INFINITY;
                    if (pass == 0) floats.put(nextFloat, new FloatReplacement(
                            Float.floatToRawIntBits(Float.MAX_VALUE / 4.0f) - floats.size(), value));
                    nextFloat--;
                    rewritten.append(Float.toString(placeholder)).append('f');
                } else {
                    double placeholder = Double.longBitsToDouble(nextDouble);
                    double value = nan ? Double.NaN : negative ? Double.NEGATIVE_INFINITY : Double.POSITIVE_INFINITY;
                    if (pass == 0) doubles.put(nextDouble, new DoubleReplacement(
                            Double.doubleToRawLongBits(Double.MAX_VALUE / 4.0d) - doubles.size(), value));
                    nextDouble--;
                    rewritten.append(Double.toString(placeholder)).append('d');
                }
                cursor = token.end;
            }
            rewritten.append(text, cursor, text.length());
            parses.add(TagParser.create(NbtOps.INSTANCE).parseFully(rewritten.toString()));
        }
        return restore(parses.get(0), parses.get(1), floats, doubles);
    }

    /** Restore by structural path across two vanilla parses with disjoint marker
     * sets. An ordinary number equal to either marker stays unchanged, even when
     * duplicate keys discard a special token or an operation computes a marker.
     * A transformation whose result cannot be attributed to one token fails closed. */
    private static Tag restore(Tag tag, Tag check, Map<Integer, FloatReplacement> floats, Map<Long, DoubleReplacement> doubles) {
        if (tag instanceof FloatTag value && check instanceof FloatTag other) {
            int bits = Float.floatToRawIntBits(value.value()), otherBits = Float.floatToRawIntBits(other.value());
            if (bits == otherBits) return tag;
            var replacement = floats.get(bits);
            if (replacement != null && otherBits == replacement.checkBits) return FloatTag.valueOf(replacement.value);
            throw ambiguous();
        }
        if (tag instanceof DoubleTag value && check instanceof DoubleTag other) {
            long bits = Double.doubleToRawLongBits(value.value()), otherBits = Double.doubleToRawLongBits(other.value());
            if (bits == otherBits) return tag;
            var replacement = doubles.get(bits);
            if (replacement != null && otherBits == replacement.checkBits) return DoubleTag.valueOf(replacement.value);
            throw ambiguous();
        }
        if (tag instanceof CompoundTag compound && check instanceof CompoundTag other) {
            if (!compound.keySet().equals(other.keySet())) throw ambiguous();
            for (String key : List.copyOf(compound.keySet())) compound.put(key, restore(compound.get(key), other.get(key), floats, doubles));
        } else if (tag instanceof ListTag list && check instanceof ListTag other) {
            if (list.size() != other.size()) throw ambiguous();
            for (int i = 0; i < list.size(); i++) list.set(i, restore(list.get(i), other.get(i), floats, doubles));
        } else if (!tag.equals(check)) throw ambiguous();
        return tag;
    }
    private static IllegalArgumentException ambiguous() {
        return new IllegalArgumentException("特殊浮点值经过了无法保真恢复的 SNBT 运算；请使用直接的 float/double 值");
    }
    private record FloatReplacement(int checkBits, float value) {}
    private record DoubleReplacement(long checkBits, double value) {}

    private static List<Token> scan(String text) {
        var out = new ArrayList<Token>();
        for (int i = 0; i < text.length();) {
            char c = text.charAt(i);
            if (c == '\'' || c == '"') {
                char quote = c; i++;
                while (i < text.length()) {
                    char q = text.charAt(i++);
                    if (q == '\\' && i < text.length()) i++;
                    else if (q == quote) break;
                }
                continue;
            }
            if (!bare(c)) { i++; continue; }
            int start = i++;
            while (i < text.length() && bare(text.charAt(i))) i++;
            String token = text.substring(start, i);
            int next = i; while (next < text.length() && Character.isWhitespace(text.charAt(next))) next++;
            boolean valueToken = next >= text.length() || text.charAt(next) != ':';
            out.add(new Token(start, i, token, valueToken && SPECIAL.matcher(token).matches()));
        }
        return out;
    }

    private static boolean bare(char c) {
        return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
                || c == '_' || c == '.' || c == '+' || c == '-';
    }

    private record Token(int start, int end, String text, boolean special) {}
}
