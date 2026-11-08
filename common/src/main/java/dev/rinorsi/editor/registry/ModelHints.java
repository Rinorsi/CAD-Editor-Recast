package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.io.Reader;
import java.util.*;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.ResourceManager;

/** Reads model definitions as data. No reflection, expressions, or resource script execution. */
public final class ModelHints {
    private ModelHints() {}
    @FunctionalInterface public interface Source { JsonElement read(Identifier resource) throws Exception; }
    public static JsonArray read(ResourceManager resources, Identifier model) {
        int[] total = {0};
        return read(id -> {
            var resource = resources.getResource(id);
            if (resource.isEmpty()) return null;
            try (Reader reader = resource.get().openAsReader()) {
                StringBuilder text = new StringBuilder(); char[] buffer = new char[4096]; int n;
                while ((n = reader.read(buffer)) != -1) {
                    if (text.length() + n > 1_048_576) throw new IllegalArgumentException("模型资源超过1Mi字符: " + id);
                    if ((total[0] += n) > 4_194_304) throw new IllegalArgumentException("模型引用资源合计超过4Mi字符");
                    text.append(buffer, 0, n);
                }
                return JsonParser.parseString(text.toString());
            }
        }, model);
    }
    public static JsonArray read(Source source, Identifier model) {
        Walker walker = new Walker(source);
        walker.resource(Identifier.fromNamespaceAndPath(model.getNamespace(), "items/" + model.getPath() + ".json"), 0);
        JsonArray result = new JsonArray(); walker.hints.values().forEach(result::add); return result;
    }
    private static final class Walker {
        final Source source; final Set<Identifier> visited = new HashSet<>();
        final Map<String, JsonObject> hints = new LinkedHashMap<>(); int nodes;
        Walker(Source source) { this.source = source; }
        void resource(Identifier id, int depth) {
            if (!visited.add(id)) return;
            if (visited.size() > 256) throw new IllegalArgumentException("模型引用超过256个资源");
            try { JsonElement json = source.read(id); if (json != null) walk(json, depth + 1); }
            catch (Exception error) { throw new IllegalArgumentException("模型解析失败 " + id + ": " + error.getMessage(), error); }
        }
        void walk(JsonElement json, int depth) {
            if (++nodes > 100_000 || depth > 96) throw new IllegalArgumentException("模型结构过深或过大");
            if (json.isJsonArray()) { for (var child : json.getAsJsonArray()) walk(child, depth + 1); return; }
            if (!json.isJsonObject()) return;
            JsonObject node = json.getAsJsonObject();
            String type = string(node, "type"), property = string(node, "property");
            if (vanilla(property, "custom_model_data")) {
                if (vanilla(type, "condition")) hint(node, "flag");
                else if (vanilla(type, "range_dispatch")) {
                    JsonObject entry = hint(node, "range"); JsonArray thresholds = entry.getAsJsonArray("thresholds");
                    if (node.has("entries")) for (var branch : node.getAsJsonArray("entries")) {
                        JsonElement threshold = branch.getAsJsonObject().get("threshold");
                        if (threshold == null || !threshold.isJsonPrimitive() || !threshold.getAsJsonPrimitive().isNumber() || !Double.isFinite(threshold.getAsDouble()))
                            throw new IllegalArgumentException("range_dispatch.threshold必须为有限数字");
                        if (!thresholds.contains(threshold)) thresholds.add(threshold);
                    }
                } else if (vanilla(type, "select")) {
                    JsonArray cases = hint(node, "select").getAsJsonArray("cases");
                    if (node.has("cases")) for (var branch : node.getAsJsonArray("cases")) {
                        JsonElement when = branch.getAsJsonObject().get("when");
                        if (when == null) throw new IllegalArgumentException("select.case缺少when");
                        if (when.isJsonArray()) for (var item : when.getAsJsonArray()) addCase(cases, item);
                        else addCase(cases, when);
                    }
                }
            }
            if (vanilla(type, "custom_model_data")) hint(node, "color");
            // Baked submodels and their parents can carry tint metadata too.
            for (String field : new String[]{"model", "parent"}) {
                String reference = string(node, field);
                if (reference != null) {
                    Identifier id = Identifier.tryParse(reference);
                    if (id == null) throw new IllegalArgumentException("无效子模型id: " + reference);
                    resource(Identifier.fromNamespaceAndPath(id.getNamespace(), "models/" + id.getPath() + ".json"), depth + 1);
                }
            }
            for (var child : node.entrySet()) walk(child.getValue(), depth + 1);
        }
        private JsonObject hint(JsonObject node, String kind) {
            int index = 0;
            if (node.has("index")) {
                var n = node.get("index");
                if (!n.isJsonPrimitive() || !n.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("custom_model_data.index必须为整数");
                index = n.getAsBigDecimal().intValueExact(); if (index < 0) throw new IllegalArgumentException("index不能为负数");
            }
            String key = kind + ":" + index; JsonObject existing = hints.get(key); if (existing != null) return existing;
            JsonObject entry = new JsonObject(); entry.addProperty("kind", kind); entry.addProperty("index", index);
            if (kind.equals("range")) entry.add("thresholds", new JsonArray());
            if (kind.equals("select")) entry.add("cases", new JsonArray());
            hints.put(key, entry); return entry;
        }
        private static void addCase(JsonArray cases, JsonElement value) {
            if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("custom_model_data select.when必须为字符串");
            if (!cases.contains(value)) cases.add(value);
        }
        private static String string(JsonObject node, String field) {
            var value = node.get(field); return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString() ? value.getAsString() : null;
        }
        private static boolean vanilla(String value, String expected) { return expected.equals(value) || ("minecraft:" + expected).equals(value); }
    }
}
