package dev.rinorsi.editor;

import com.google.gson.JsonParser;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/** Editor copy only: never translate identifiers, NBT or user supplied values. */
public final class EditorI18n {
    private static final Pattern FORMAT = Pattern.compile("%%|%(?:([1-9][0-9]*)\\$)?s");
    private static final Map<String, String> ENGLISH = load("en_us");
    private static final Map<String, String> CHINESE = load("zh_cn");
    private static final Map<String, Map<String, String>> EXTRA = java.util.Collections.synchronizedMap(new LinkedHashMap<>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Map<String, String>> entry) { return size() > 32; }
    });
    private static final ThreadLocal<String> REQUEST_LANGUAGE = new ThreadLocal<>();
    private static volatile Supplier<String> clientLanguage = () -> "zh_cn";
    private static volatile Function<String, String> clientTranslation = key -> null;

    private EditorI18n() {}

    /** Client hooks contain all client-only API access; this class is safe on dedicated servers. */
    public static void client(Supplier<String> language, Function<String, String> translation) {
        clientLanguage = language;
        clientTranslation = translation;
    }

    public static String normalize(String language) {
        if (language == null) return "en_us";
        String normalized = language.replace('-', '_').toLowerCase(java.util.Locale.ROOT);
        return normalized.matches("[a-z0-9_]{2,32}") ? normalized : "en_us";
    }

    public static String locale() {
        String requested = REQUEST_LANGUAGE.get();
        return requested == null ? normalize(clientLanguage.get()) : requested;
    }

    /** Scope every server operation to the requesting player, including integrated servers. */
    public static Scope forLanguage(String language) {
        String previous = REQUEST_LANGUAGE.get();
        REQUEST_LANGUAGE.set(normalize(language));
        return new Scope(previous);
    }

    public static final class Scope implements AutoCloseable {
        private final String previous;
        private Scope(String previous) { this.previous = previous; }
        @Override public void close() {
            if (previous == null) REQUEST_LANGUAGE.remove(); else REQUEST_LANGUAGE.set(previous);
        }
    }

    public static String tr(String key, Object... args) {
        String template = null;
        if (REQUEST_LANGUAGE.get() == null) template = clientTranslation.apply(key);
        if (template == null || template.equals(key)) template = catalog(locale()).getOrDefault(key, ENGLISH.getOrDefault(key, key));
        return format(template, args);
    }

    public static Map<String, String> catalog(String locale) {
        String normalized = normalize(locale);
        if (normalized.equals("zh_cn")) return CHINESE;
        if (normalized.equals("en_us")) return ENGLISH;
        return EXTRA.computeIfAbsent(normalized, language -> {
            var translated = load(language);
            if (translated.isEmpty()) return ENGLISH;
            var merged = new LinkedHashMap<>(ENGLISH);
            merged.putAll(translated);
            return Map.copyOf(merged);
        });
    }

    /** Replacement is single-pass: percent signs inside arguments are always literal. */
    static String format(String template, Object... args) {
        var matcher = FORMAT.matcher(template);
        var out = new StringBuilder();
        int sequential = 0;
        while (matcher.find()) {
            String replacement = "%";
            if (!matcher.group().equals("%%")) {
                int i = matcher.group(1) == null ? sequential++ : Integer.parseInt(matcher.group(1)) - 1;
                replacement = i < args.length ? String.valueOf(args[i]) : matcher.group();
            }
            matcher.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    private static Map<String, String> load(String locale) {
        String path = "/assets/cadeditor/lang/" + locale + ".json";
        try (var stream = EditorI18n.class.getResourceAsStream(path)) {
            if (stream == null) {
                if (locale.equals("en_us") || locale.equals("zh_cn")) throw new IllegalStateException("Missing language resource: " + path);
                return Map.of();
            }
            var values = JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonObject();
            var result = new LinkedHashMap<String, String>();
            values.entrySet().forEach(entry -> result.put(entry.getKey(), entry.getValue().getAsString()));
            return Map.copyOf(result);
        } catch (java.io.IOException failure) {
            throw new java.io.UncheckedIOException("Unable to read language resource: " + path, failure);
        }
    }
}
