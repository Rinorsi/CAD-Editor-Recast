package dev.rinorsi.editor.registry.search;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/** Reads the SAME MIT-licensed generated table as the page, without executing JavaScript. */
public final class Pinyin {
    private final Map<Character, String[]> readings;
    public Pinyin(InputStream stream) throws IOException {
        if (stream == null) throw new IOException("Missing generated pinyin table");
        String text;
        try (stream) { text = new String(stream.readAllBytes(), StandardCharsets.UTF_8); }
        Map<Character, List<String>> reverse = new HashMap<>();
        var matcher = Pattern.compile("[\"']([a-z]+)[\"']\\s*:\\s*[\"']([^\"']*)[\"']").matcher(text);
        while (matcher.find()) {
            String reading = matcher.group(1);
            for (char ch : matcher.group(2).toCharArray()) reverse.computeIfAbsent(ch, c -> new ArrayList<>()).add(reading);
        }
        if (reverse.size() < 8000) throw new IOException("Invalid generated pinyin table: " + reverse.size());
        Map<Character, String[]> out = new HashMap<>();
        reverse.forEach((c, values) -> out.put(c, values.toArray(String[]::new)));
        readings = Map.copyOf(out);
    }
    public String[] readings(char ch) { return readings.get(ch); }
    public String key(String text, boolean initials) {
        StringBuilder out = new StringBuilder();
        for (char ch : text.toCharArray()) {
            String[] rs = readings(ch);
            if (rs != null) out.append(initials ? rs[0].substring(0, 1) : rs[0]);
            else if (ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9') out.append(ch);
        }
        return out.toString();
    }
    public boolean hasHan(String text) { for (char c : text.toCharArray()) if (readings.containsKey(c)) return true; return false; }
    /** Dynamic programming: polyphones, full/initial/zh-ch-sh initials and Chinese mixed input.
     * O(text.length * query.length * readings), with bounded lengths enforced by SearchIndex. */
    public boolean matches(String text, String query) {
        return matches(text,query,false,false);
    }
    public int rank(String text,String query) {
        if(matches(text,query,true,true))return 0;
        if(matches(text,query,true,false))return 1;
        return matches(text,query,false,false)?3:4;
    }
    private boolean matches(String text, String query, boolean anchored, boolean whole) {
        int n = text.length(), m = query.length();
        boolean[] next = new boolean[m + 1]; next[m] = true;
        for (int i = n - 1; i >= 0; i--) {
            char c = text.charAt(i); String[] rs = readings(c);
            boolean[] now = new boolean[m + 1]; now[m] = !whole || !Character.isLetterOrDigit(c) && next[m];
            for (int j = m - 1; j >= 0; j--) {
                if (c == query.charAt(j) && next[j + 1]) now[j] = true;
                if (rs == null && !Character.isLetterOrDigit(c) && next[j]) now[j] = true;
                if (rs != null) for (String r : rs) {
                    int left = m - j;
                    if (!whole && left <= r.length() && r.regionMatches(0, query, j, left)) { now[j] = true; break; }
                    int len = r.length();
                    if (j + len <= m && query.regionMatches(j, r, 0, len) && next[j + len]) now[j] = true;
                    if (query.charAt(j) == r.charAt(0) && next[j + 1]) now[j] = true;
                    if ((r.startsWith("zh") || r.startsWith("ch") || r.startsWith("sh")) && j + 2 <= m && query.regionMatches(j, r, 0, 2) && next[j + 2]) now[j] = true;
                }
            }
            if (now[0] && (!anchored || i==0)) return true;
            next = now;
        }
        return false;
    }
}
