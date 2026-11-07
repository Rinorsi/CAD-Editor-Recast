package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.*;
import com.mojang.serialization.codecs.*;
import dev.rinorsi.editor.ComponentValidation;
import java.lang.reflect.*;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.StringRepresentable;

/** Best-effort structural adapter for the running DFU codecs. No baked component field/range table.
 * Reflection is intentionally bounded and version-sensitive: unsupported wrappers remain unknown.
 * Every node retains its actual codec for diagnostics; schema metadata never authorizes a save. */
public final class ComponentSchema {
    public static final int VERSION = 2;
    private static final int MAX_DEPTH = 12, MAX_NODES = 160;
    private ComponentSchema() {}

    public static final class Node {
        final JsonObject json = new JsonObject();
        final Codec<?> codec;
        final LinkedHashMap<String, Node> fields = new LinkedHashMap<>();
        Node element, key;
        final List<Node> alternatives = new ArrayList<>();
        Node(Codec<?> codec, String path) { this.codec = codec; json.addProperty("path", path); json.addProperty("optional", false); }
        void type(String type) { json.addProperty("type", type); json.addProperty("kind", type); }
        void unknown(String reason) { json.addProperty("unknown", true); json.addProperty("reason", reason); }
        public JsonObject toJson() {
            JsonObject out = json.deepCopy();
            if (!fields.isEmpty()) { var array = new JsonArray(); fields.values().forEach(n -> array.add(n.toJson())); out.add("fields", array); }
            if (element != null) out.add("element", element.toJson());
            if (key != null) out.add("key", key.toJson());
            if (!alternatives.isEmpty()) { var array = new JsonArray(); alternatives.forEach(n -> array.add(n.toJson())); out.add(json.has("type") && json.get("type").getAsString().equals("variants") ? "variants" : "alternatives", array); }
            return out;
        }
    }
    public record Derived(String id, Node root, JsonObject entry) {}

    public static Derived derive(String raw, RegistryAccess access) {
        Identifier id = Identifier.parse(raw);
        var codec = ComponentValidation.type(id.toString()).codec();
        var inspector = new Inspector(access);
        Node root;
        try { root = inspector.inspect(codec, "$", 0, identitySet()); }
        catch (RuntimeException error) { root = new Node(codec, "$"); root.type("object"); root.unknown("codec_inspection_failed:" + error.getClass().getSimpleName()); }
        if (codec == net.minecraft.core.component.DataComponents.ITEM_MODEL.codec() || codec == net.minecraft.core.component.DataComponents.TOOLTIP_STYLE.codec()) {
            root.type("identifier"); root.json.remove("unknown"); root.json.remove("reason"); root.json.addProperty("catalog", id.getPath());
        }
        if (codec == net.minecraft.core.component.DataComponents.MAP_ID.codec() || codec == net.minecraft.core.component.DataComponents.MAP_COLOR.codec()) {
            root.json.remove("unknown"); root.json.remove("reason"); root.type("int");
            root.json.addProperty("min", Integer.MIN_VALUE); root.json.addProperty("max", Integer.MAX_VALUE);
            root.json.addProperty("constraint_source", "int_storage_domain_boundary_probed_json_narrowing_allowed");
            root.json.addProperty("storage_boundary_probes_ok", safeParse(codec, new JsonPrimitive(Integer.MIN_VALUE), inspector.ops) && safeParse(codec, new JsonPrimitive(Integer.MAX_VALUE), inspector.ops));
        }
        if (codec == net.minecraft.core.component.DataComponents.POTION_CONTENTS.codec()) annotateColor(root);
        // Observation matrix, not inferred limits: absence of a counterexample proves no new bound.
        var inputProbes = new JsonArray();
        JsonElement[] candidates = {new JsonPrimitive(-1), new JsonPrimitive(0), new JsonPrimitive(1), new JsonPrimitive(32768),
                new JsonPrimitive(Integer.MAX_VALUE), new JsonPrimitive(1.0e30), new JsonPrimitive(""), new JsonPrimitive("x".repeat(32768)),
                new JsonArray(), array(new JsonPrimitive(1)), new JsonObject()};
        String[] labels = {"number:-1", "number:0", "number:1", "number:32768", "number:2147483647", "number:1e30", "empty_string", "string_length:32768", "empty_list", "list:[1]", "empty_object"};
        for (int i = 0; i < candidates.length; i++) {
            var probe = new JsonObject(); probe.addProperty("input", labels[i]); probe.addProperty("ok", safeParse(codec, candidates[i], inspector.ops)); inputProbes.add(probe);
        }
        JsonObject entry = new JsonObject(); entry.addProperty("id", id.toString());
        entry.addProperty("schema_version", VERSION);
        entry.addProperty("source", id.getNamespace().equals("minecraft") ? "vanilla" : "mod:" + id.getNamespace());
        entry.addProperty("schema_source", "runtime_codec_structural_adapter");
        String label = "item.component." + id.getPath();
        String scopedLabel = "item.component." + id.getNamespace() + "." + id.getPath();
        var language = net.minecraft.locale.Language.getInstance();
        entry.add("label_key", language.has(scopedLabel) ? new JsonPrimitive(scopedLabel)
                : id.getNamespace().equals("minecraft") && language.has(label) ? new JsonPrimitive(label) : JsonNull.INSTANCE);
        entry.addProperty("coverage_scope", "exported_field_structure_not_gameplay_or_exhaustive_semantics");
        entry.add("fields", array(root.toJson()));
        JsonArray unknown = new JsonArray(); countUnknown(root, unknown);
        entry.addProperty("coverage", unknown.isEmpty() ? "full" : root.json.get("unknown") != null && root.fields.isEmpty() && root.element == null && root.alternatives.isEmpty() ? "unknown" : "partial");
        entry.add("unknown_paths", unknown);
        JsonArray reasons = new JsonArray(); unknownReasons(root, reasons); entry.add("unknown_details", reasons);
        boolean opaque = root.json.has("unknown") && root.fields.isEmpty() && root.element == null && root.alternatives.isEmpty();
        boolean freeNbt = root.json.get("kind").getAsString().equals("nbt");
        entry.addProperty("editable", opaque || freeNbt ? "snbt_only" : "structured");
        entry.addProperty("editable_reason", opaque ? "opaque_codec_use_component_validate" : freeNbt ? "free_nbt_has_no_fixed_form_fields" : "derived_shape_with_whole_codec_validation");
        entry.addProperty("validator_route", "component_validate");
        JsonArray ranges = new JsonArray(); numericFields(root, ranges); entry.add("ranges_for_ui", ranges);
        entry.add("input_probes", inputProbes);
        // Prototype samples are evidence, never a declaration of a universal component default.
        JsonArray prototypes = new JsonArray(); Set<String> values = new HashSet<>(); int[] total = {0};
        var type = ComponentValidation.type(id.toString());
        BuiltInRegistries.ITEM.listElements().sorted(Comparator.comparing(h -> h.key().identifier().toString())).forEach(holder -> {
            var value = holder.value().components().get(type);
            if (value == null) return;
            total[0]++;
            try {
                var encoded = encode(codec, value, inspector.ops);
                if (values.add(encoded.toString()) && prototypes.size() < 3 && encoded.toString().length() < 1800) {
                    var row = new JsonObject(); row.addProperty("item", holder.key().identifier().toString()); row.add("value", encoded); prototypes.add(row);
                }
            } catch (RuntimeException ignored) { /* individual prototype may reference server-only data */ }
        });
        entry.add("prototype_examples", prototypes); entry.addProperty("prototype_item_count", total[0]);
        entry.addProperty("prototype_examples_complete", values.size() == prototypes.size());
        JsonObject summary = new JsonObject(); summary.addProperty("item_count", total[0]);
        summary.addProperty("distinct_value_count", values.size()); summary.addProperty("example_count", prototypes.size());
        summary.addProperty("universal_default", false); entry.add("default_from_prototypes", summary);
        if (entry.toString().length() > 22_000) {
            root = new Node(codec, "$"); root.type("object"); root.unknown("schema_wire_budget_exceeded");
            entry.add("fields", array(root.toJson())); entry.addProperty("coverage", "unknown");
            JsonArray paths = new JsonArray(); countUnknown(root, paths); entry.add("unknown_paths", paths);
            JsonArray details = new JsonArray(); unknownReasons(root, details); entry.add("unknown_details", details);
            entry.add("ranges_for_ui", new JsonArray()); entry.addProperty("editable", "snbt_only");
            entry.addProperty("editable_reason", "schema_wire_budget_exceeded_use_component_validate");
        }
        return new Derived(id.toString(), root, entry);
    }
    private static void annotateColor(Node root) {
        Node color = root.fields.get("custom_color");
        if (color != null) {
            color.json.addProperty("format", "rgb");
            color.json.addProperty("shape_notes", "PotionContents custom_color is Codec.INT; RGB display hint is not a 24-bit validation bound");
        }
        root.alternatives.forEach(ComponentSchema::annotateColor);
    }
    public static List<String> persistentIds() {
        return BuiltInRegistries.DATA_COMPONENT_TYPE.entrySet().stream().filter(e -> e.getValue().codec() != null)
                .map(e -> e.getKey().identifier().toString()).sorted().toList();
    }
    private static void numericFields(Node n, JsonArray out) {
        if (n.json.has("type") && List.of("int", "long", "float", "double").contains(n.json.get("type").getAsString())) {
            JsonObject row = new JsonObject(); row.add("path", n.json.get("path"));
            for (String key : List.of("min", "max", "default")) row.add(key, n.json.has(key) ? n.json.get(key) : JsonNull.INSTANCE);
            if (n.json.has("min_exclusive")) row.add("min_exclusive", n.json.get("min_exclusive"));
            out.add(row);
        }
        n.fields.values().forEach(c -> numericFields(c, out));
        if (n.element != null) numericFields(n.element, out);
        n.alternatives.forEach(c -> numericFields(c, out));
    }
    private static void unknownReasons(Node n, JsonArray out) {
        if (n.json.has("unknown")) { JsonObject row = new JsonObject(); row.add("path", n.json.get("path")); row.add("reason", n.json.get("reason")); out.add(row); }
        n.fields.values().forEach(c -> unknownReasons(c, out));
        if (n.element != null) unknownReasons(n.element, out);
        if (n.key != null) unknownReasons(n.key, out);
        n.alternatives.forEach(c -> unknownReasons(c, out));
    }
    private static void countUnknown(Node node, JsonArray out) {
        if (node.json.has("unknown")) out.add(node.json.get("path"));
        node.fields.values().forEach(n -> countUnknown(n, out));
        if (node.element != null) countUnknown(node.element, out);
        if (node.key != null) countUnknown(node.key, out);
        node.alternatives.forEach(n -> countUnknown(n, out));
    }
    private static JsonArray array(JsonElement value) { var a = new JsonArray(); a.add(value); return a; }

    private static final class Inspector {
        final DynamicOps<JsonElement> ops;
        int nodes;
        final Map<Object, String> firstPaths = new IdentityHashMap<>();
        Inspector(RegistryAccess access) { ops = access.createSerializationContext(JsonOps.INSTANCE); }

        Node inspect(Codec<?> outer, String path, int depth, Set<Object> ancestors) {
            Node n = new Node(outer, path);
            if (ancestors.contains(outer)) { n.type("recursive_ref"); n.json.addProperty("ref_path", firstPaths.get(outer)); return n; }
            if (depth > MAX_DEPTH || ++nodes > MAX_NODES) { n.type("object"); n.unknown("schema_depth_or_node_budget"); return n; }
            firstPaths.putIfAbsent(outer, path);
            var next = identitySet(); next.addAll(ancestors); next.add(outer);
            Object base = unwrap(outer);
            if (base.getClass().getName().equals("net.minecraft.world.item.component.TypedEntityData$1") && member(base, "val$typeCodec") instanceof Codec<?> typeCodec) {
                n.type("typed_data"); n.json.addProperty("id_registry", registry(typeCodec));
                n.json.addProperty("id_field", "id"); n.json.addProperty("additional_fields", "free_nbt");
                Node id = inspect(typeCodec, path + ".id", depth + 1, next); id.json.addProperty("name", "id"); n.fields.put("id", id);
                n.json.addProperty("shape_notes", "TypedEntityData.codec: required id plus remaining CompoundTag fields; original id stripped from free data"); return n;
            }
            if (outer == net.minecraft.core.component.DataComponentPatch.CODEC) {
                n.type("component_patch"); n.json.addProperty("registry", "minecraft:data_component_type");
                n.json.addProperty("value_schema_route", "component_schema:<component-id>");
                n.json.addProperty("shape_notes", "Object keyed by persistent component id; !id removes a component using an empty object; values use each registered component Codec"); return n;
            }
            if (outer == net.minecraft.core.BlockPos.CODEC) {
                n.type("list"); n.json.addProperty("min_size", 3); n.json.addProperty("max_size", 3);
                n.element = inspect(Codec.INT, path + "[]", depth + 1, next); n.json.addProperty("format", "block_position_xyz"); return n;
            }
            if (outer == net.minecraft.core.UUIDUtil.CODEC || outer == net.minecraft.core.UUIDUtil.AUTHLIB_CODEC || outer == net.minecraft.core.UUIDUtil.LENIENT_CODEC || outer == net.minecraft.core.UUIDUtil.STRING_CODEC) {
                n.type("uuid"); JsonArray shapes = new JsonArray();
                if (safeParse(outer, new JsonPrimitive("00000000-0000-0000-0000-000000000001"), ops)) shapes.add("uuid_string");
                if (safeParse(outer, JsonParser.parseString("[0,0,0,1]"), ops)) shapes.add("four_int_array");
                n.json.add("shapes", shapes); return n;
            }
            if (outer == net.minecraft.world.item.component.CustomData.CODEC || outer == net.minecraft.nbt.CompoundTag.CODEC) {
                n.type("nbt"); n.json.addProperty("additional_fields", "free_nbt"); return n;
            }
            // Match this node, not descendants: a list containing text remains a list.
            if (outer == net.minecraft.network.chat.ComponentSerialization.CODEC || base == unwrap(net.minecraft.network.chat.ComponentSerialization.CODEC) || base.getClass().getName().equals("net.minecraft.network.chat.ComponentSerialization$1")) {
                n.type("text_component");
                n.json.add("shapes", strings(List.of("string", "nonempty_list_of_text_components", "object")));
                if (member(base, "val$maxFlatSize") instanceof Number size) n.json.addProperty("max_flat_size", size);
                n.json.addProperty("shape_notes", "ComponentSerialization.CODEC: recursive contents dispatch (text/translate/score/selector/keybind/nbt), extra siblings and Style including click_event/hover_event; validate via component_validate");
                return n;
            }
            if (outer == net.minecraft.util.ExtraCodecs.RESOURCE_PATH_CODEC) {
                n.type("resource_path"); n.json.addProperty("constraint_notes", "ExtraCodecs.RESOURCE_PATH_CODEC validates the Identifier path grammar"); return n;
            }
            if (outer == Identifier.CODEC || base == Identifier.CODEC) {
                String registry = registry(outer);
                boolean tag = containsClass(outer, "net.minecraft.tags.TagKey", 7);
                n.type(registry == null ? "identifier" : tag ? "tag" : "registry");
                if (tag) n.json.addProperty("prefix", safeParse(outer, new JsonPrimitive("#minecraft:schema_probe"), ops) ? "#" : "");
                if (registry != null) n.json.addProperty("registry", registry);
                return n;
            }
            if (base instanceof net.minecraft.resources.HolderSetCodec<?>) {
                n.type("holder_set"); n.json.addProperty("registry", registry(base));
                n.json.add("shapes", strings(List.of("#tag", "identifier", "list_of_identifiers")));
                n.json.addProperty("constraint_notes", "RegistryOps lookup; homogeneous holders; runtime tag membership"); return n;
            }
            if (base instanceof net.minecraft.resources.RegistryFileCodec<?> && member(base, "elementCodec") instanceof Codec<?> inline) {
                n.type("holder"); n.json.addProperty("registry", registry(base));
                n.json.addProperty("allow_inline", Boolean.TRUE.equals(member(base, "allowInline")));
                if (Boolean.TRUE.equals(member(base, "allowInline"))) n.alternatives.add(inspect(inline, path, depth + 1, next));
                return n;
            }
            if (outer == net.minecraft.util.ExtraCodecs.RGB_COLOR_CODEC || outer == net.minecraft.util.ExtraCodecs.ARGB_COLOR_CODEC || base == net.minecraft.util.ExtraCodecs.RGB_COLOR_CODEC || base == net.minecraft.util.ExtraCodecs.ARGB_COLOR_CODEC) {
                n.type("int"); numeric(n, Codec.INT, "int");
                n.json.addProperty("format", outer == net.minecraft.util.ExtraCodecs.RGB_COLOR_CODEC || base == net.minecraft.util.ExtraCodecs.RGB_COLOR_CODEC ? "rgb" : "argb");
                n.json.addProperty("shape_notes", "ExtraCodecs also accepts a float channel list"); return n;
            }
            if (safeParse(outer, new JsonObject(), ops) && outer.toString().startsWith("Unit")) {
                n.type("unit"); n.json.addProperty("presence_flag", true); return n;
            }
            if (base instanceof ListCodec<?> list) {
                n.type("list"); n.json.addProperty("min_size", list.minSize()); n.json.addProperty("max_size", list.maxSize());
                n.element = inspect(list.elementCodec(), path + "[]", depth + 1, next);
                transformed(n, outer, base); return n;
            }
            if (base instanceof UnboundedMapCodec<?, ?> map) {
                n.type("map"); n.key = inspect(map.keyCodec(), path + "{key}", depth + 1, next);
                n.element = inspect(map.elementCodec(), path + "{value}", depth + 1, next);
                transformed(n, outer, base); return n;
            }
            if (base instanceof EitherCodec<?, ?> either) {
                n.type("union"); n.alternatives.add(inspect(either.first(), path, depth + 1, next)); n.alternatives.add(inspect(either.second(), path, depth + 1, next));
                transformed(n, outer, base); return n;
            }
            if (base instanceof MapCodec.MapCodecCodec<?> map) {
                if (map.codec() instanceof KeyDispatchCodec<?, ?> dispatch && dispatch(n, dispatch, path, depth, next)) return n;
                n.type("object");
                var definitions = new LinkedHashMap<String, FieldInfo>();
                collectFields(map.codec(), null, definitions, identitySet(), 0);
                definitions.forEach((name, info) -> {
                    var child = inspect(info.codec, path + "." + name, depth + 1, next);
                    child.json.addProperty("name", name); child.json.addProperty("optional", info.optional);
                    if (info.defaultValue != null) { child.json.add("default", info.defaultValue); child.json.addProperty("default_source", "optional_field_decode_empty_map"); }
                    if (info.optionalUnknown) child.unknown("optional_default_not_resolved");
                    else if (info.optional && info.defaultValue == null) child.json.addProperty("default_absent", true);
                    n.fields.put(name, child);
                });
                try {
                    var keys = map.codec().keys(JsonOps.INSTANCE).map(e -> e.isJsonPrimitive() ? e.getAsString() : "").filter(s -> !s.isEmpty()).distinct().sorted().toList();
                    if (!n.fields.keySet().containsAll(keys)) n.unknown("unresolved_map_keys_or_dispatch");
                    if (n.fields.isEmpty() && !keys.isEmpty()) n.json.add("unresolved_keys", strings(keys));
                    if (n.fields.isEmpty() && keys.isEmpty() && !outer.parse(ops, new JsonObject()).isSuccess()) n.unknown("opaque_map_codec");
                } catch (RuntimeException error) { n.unknown("map_keys_unavailable"); }
                transformed(n, outer, base); return n;
            }
            String primitive = primitive(base);
            if (primitive != null) {
                n.type(primitive);
                if (List.of("int", "long", "float", "double").contains(primitive)) numeric(n, outer, primitive);
                else if (primitive.equals("string")) {
                    var enums = enumValues(outer);
                    String registry = registry(outer);
                    if (!enums.isEmpty()) { n.type("enum"); n.json.add("values", enums); }
                    else if (registry != null) {
                        boolean tag = containsClass(outer, "net.minecraft.tags.TagKey", 7);
                        n.type(tag ? "tag" : "registry"); n.json.addProperty("registry", registry);
                        if (tag) n.json.addProperty("prefix", safeParse(outer, new JsonPrimitive("#minecraft:schema_probe"), ops) ? "#" : "");
                        n.json.addProperty("validation", "registry_reference_checked_by_component_validate");
                    } else if (base != outer && !stringLength(n, outer)) n.unknown("string_mapping_constraints_not_exported");
                } else if (outer != base) transformed(n, outer, base);
                return n;
            }
            String registry = registry(outer);
            if (registry != null) {
                n.type("registry"); n.json.addProperty("registry", registry);
                // RegistryFileCodec can additionally accept inline records, but the ID list is not that schema.
                if (outer.getClass().getName().contains("RegistryFileCodec") || Boolean.TRUE.equals(member(base, "allowInline"))) n.unknown("inline_holder_form_not_exported");
                return n;
            }
            var enums = enumValues(outer);
            if (!enums.isEmpty()) { n.type("enum"); n.json.add("values", enums); return n; }
            n.type("object"); n.unknown("unsupported_codec_wrapper");
            return n;
        }
        @SuppressWarnings({"rawtypes", "unchecked"})
        private boolean dispatch(Node n, KeyDispatchCodec<?, ?> dispatch, String path, int depth, Set<Object> ancestors) {
            Object keyCodec = member(dispatch, "keyCodec");
            String registryId = registry(keyCodec);
            if (!(keyCodec instanceof MapCodec<?> key) || !(member(dispatch, "decoder") instanceof java.util.function.Function decoder)) return false;
            var keys = key.keys(JsonOps.INSTANCE).distinct().toList();
            if (keys.size() != 1 || !keys.getFirst().isJsonPrimitive()) return false;
            String discriminator = keys.getFirst().getAsString();
            var options = new TreeMap<String, Object>();
            var registry = registryId == null ? null : BuiltInRegistries.REGISTRY.getValue(Identifier.parse(registryId));
            if (registry != null) registry.entrySet().forEach(e -> options.put(e.getKey().identifier().toString(), e.getValue()));
            else for (Object value : graph(keyCodec, 9)) if (value.getClass().isArray() && value.getClass().getComponentType().isEnum()) {
                for (Object option : (Object[]) value) if (option instanceof StringRepresentable named) options.put(named.getSerializedName(), option);
            }
            if (options.isEmpty()) return false;
            n.type("variants"); n.json.addProperty("discriminator", discriminator);
            if (registryId != null) n.json.addProperty("registry", registryId);
            for (var option : options.entrySet()) {
                try {
                    DataResult<?> result = (DataResult<?>) decoder.apply(option.getValue());
                    if (result.result().orElse(null) instanceof MapCodec<?> branch) {
                        Node variant = inspect(branch.codec(), path, depth + 1, ancestors);
                        variant.json.addProperty("discriminator_value", option.getKey()); n.alternatives.add(variant);
                    } else n.unknown("dispatch_variant_decoder_not_mapcodec");
                } catch (RuntimeException error) { n.unknown("dispatch_variant_decoder_failed"); }
            }
            return !n.alternatives.isEmpty();
        }
        private void transformed(Node n, Codec<?> outer, Object base) {
            // xmap can hide cross-field or post-list validation. Keep that limitation explicit.
            if (outer != base && hasFlatMapping(outer)) n.unknown("outer_mapping_or_cross_field_constraint");
        }
        private void numeric(Node n, Codec<?> codec, String kind) {
            var probes = new JsonArray();
            for (Number value : new Number[]{-1, 0, 1, 32768, Integer.MAX_VALUE, 1.0e30}) {
                var row = new JsonObject(); row.addProperty("value", value); row.addProperty("ok", safeParse(codec, new JsonPrimitive(value), ops)); probes.add(row);
            }
            n.json.add("probes", probes);
            Number[] range = rangeCapture(codec);
            if (codec == net.minecraft.util.ExtraCodecs.UNSIGNED_BYTE) {
                n.json.addProperty("min", 0); n.json.addProperty("max", 255);
                n.json.addProperty("constraint_source", "official_unsigned_byte_value_domain_json_narrowing_allowed");
                n.json.addProperty("json_narrowing_allowed", true);
            } else if (codec == net.minecraft.util.ExtraCodecs.POSITIVE_FLOAT) {
                n.json.addProperty("min", 0); n.json.addProperty("min_exclusive", true); n.json.addProperty("max", Float.MAX_VALUE);
                n.json.addProperty("constraint_source", "official_positive_float_boundary_decode");
            } else if (range != null && verifyRange(codec, range, ops)) {
                n.json.addProperty("min", range[0]); n.json.addProperty("max", range[1]);
                n.json.addProperty("constraint_source", "captured_numeric_validator_and_boundary_decode");
            } else if (unwrap(codec) == codec) {
                // A primitive does not imply a gameplay clamp. Especially FLOAT/DOUBLE accept nonfinite JVM values.
                n.json.addProperty("constraint_source", "primitive_codec_no_explicit_range");
            } else n.unknown("numeric_mapping_range_not_proven");
            if (kind.equals("int") || kind.equals("long")) {
                // JsonOps numeric narrowing is not an integer-ness check: expose the real behavior.
                n.json.addProperty("fractional_json_accepted", safeParse(codec, new JsonPrimitive(1.5), ops));
            }
        }
        private boolean stringLength(Node n, Codec<?> codec) {
            var probes = new JsonArray();
            for (String input : new String[]{"", "a", "a".repeat(32768)}) {
                var row = new JsonObject(); row.addProperty("length", input.length()); row.addProperty("ok", safeParse(codec, new JsonPrimitive(input), ops)); probes.add(row);
            }
            n.json.add("length_probes", probes);
            Number[] bounds = rangeCapture(codec);
            if (bounds == null) return false;
            int min = bounds[0].intValue(), max = bounds[1].intValue();
            if (min < 0 || max < min || max > 32768) return false;
            if (!safeParse(codec, new JsonPrimitive("a".repeat(min)), ops) || !safeParse(codec, new JsonPrimitive("a".repeat(max)), ops)) return false;
            if ((min > 0 && safeParse(codec, new JsonPrimitive("a".repeat(min - 1)), ops)) || safeParse(codec, new JsonPrimitive("a".repeat(max + 1)), ops)) return false;
            n.json.addProperty("min_length", min); n.json.addProperty("max_length", max); n.json.addProperty("constraint_source", "captured_string_length_validator_and_boundary_decode");
            return true;
        }
        private record FieldInfo(Codec<?> codec, boolean optional, boolean optionalUnknown, JsonElement defaultValue) {}
        private void collectFields(Object current, MapDecoder<?> context, Map<String, FieldInfo> out, Set<Object> seen, int depth) {
            if (current == null || depth > 64 || !seen.add(current)) return;
            if (member(current, "wrapped") instanceof java.util.function.Supplier<?> supplier) {
                collectFields(supplier.get(), context, out, seen, depth + 1); return;
            }
            String name = current.getClass().getName();
            if (current instanceof MapDecoder<?> map && !(current instanceof OptionalFieldCodec<?>)) context = map;
            if (current instanceof OptionalFieldCodec<?> || name.equals("com.mojang.serialization.codecs.FieldDecoder")) {
                Object key = member(current, "name"), element = member(current, "elementCodec");
                if (key instanceof String field && element instanceof Codec<?> codec) {
                    boolean optional = current instanceof OptionalFieldCodec<?>;
                    JsonElement def = null; boolean unresolved = optional;
                    if (optional) {
                        MapDecoder<?> defaultContext = context == null ? (MapDecoder<?>) current : context;
                        try {
                            var value = defaultContext.decode(ops, JsonOps.INSTANCE.getMap(new JsonObject()).getOrThrow()).result();
                            if (value.isPresent()) {
                                unresolved = false;
                                Object unwrapped = value.get();
                                if (unwrapped instanceof Optional<?> opt) unwrapped = opt.orElse(null);
                                if (unwrapped != null) def = encode(codec, unwrapped, ops);
                            }
                        } catch (RuntimeException ignored) { /* no reliable default */ }
                        if (unresolved) {
                            try {
                                Object absent = ((MapDecoder<?>) current).decode(ops, JsonOps.INSTANCE.getMap(new JsonObject()).getOrThrow()).getOrThrow();
                                if (absent instanceof Optional<?> opt && opt.isEmpty()) unresolved = false;
                            } catch (RuntimeException ignored) { /* retain unknown default */ }
                        }
                    }
                    out.putIfAbsent(field, new FieldInfo(codec, optional, unresolved, def));
                }
                return;
            }
            if (current instanceof RecordCodecBuilder<?, ?>) { collectFields(member(current, "decoder"), context, out, seen, depth + 1); return; }
            if (!(current instanceof MapDecoder<?>) && !(current instanceof Codec<?>)) return;
            for (var value : members(current).values()) {
                if (value instanceof RecordCodecBuilder<?, ?> || value instanceof MapDecoder<?>) collectFields(value, context, out, seen, depth + 1);
            }
        }
    }

    /** Decode each failing subtree through the exact codec associated with that exported node.
     * Never turn a parser's English error string into a supposedly authoritative path. */
    public static JsonArray errors(Derived schema, JsonElement input, RegistryAccess access) {
        var errors = new JsonArray(); diagnose(schema.root, input, "$", access.createSerializationContext(JsonOps.INSTANCE), errors, 0);
        return errors;
    }
    private static void diagnose(Node node, JsonElement input, String path, DynamicOps<JsonElement> ops, JsonArray errors, int depth) {
        if (errors.size() >= 32 || depth > MAX_DEPTH) return;
        DataResult<?> result;
        try { result = node.codec.parse(ops, input); }
        catch (RuntimeException e) { addError(errors, path, "codec_exception", e.toString()); return; }
        if (result.isSuccess()) return;
        int before = errors.size();
        if (node.json.has("discriminator") && input.isJsonObject()) {
            JsonElement selected = input.getAsJsonObject().get(node.json.get("discriminator").getAsString());
            for (Node variant : node.alternatives) if (selected != null && selected.equals(variant.json.get("discriminator_value"))) {
                diagnose(variant, input, path, ops, errors, depth + 1); break;
            }
        }
        if (input.isJsonObject() && !node.fields.isEmpty()) for (var entry : node.fields.entrySet()) {
            var child = entry.getValue(); var value = input.getAsJsonObject().get(entry.getKey());
            if (value != null) diagnose(child, value, propertyPath(path, entry.getKey()), ops, errors, depth + 1);
            else if (!child.json.get("optional").getAsBoolean()) addError(errors, propertyPath(path, entry.getKey()), "required", "缺少必填字段");
        }
        if (node.element != null && input.isJsonArray()) for (int i = 0; i < input.getAsJsonArray().size() && errors.size() < 32; i++)
            diagnose(node.element, input.getAsJsonArray().get(i), path + "[" + i + "]", ops, errors, depth + 1);
        if (node.element != null && node.key != null && input.isJsonObject()) for (var entry : input.getAsJsonObject().entrySet()) {
            String childPath = propertyPath(path, entry.getKey());
            diagnose(node.key, new JsonPrimitive(entry.getKey()), childPath, ops, errors, depth + 1);
            diagnose(node.element, entry.getValue(), childPath, ops, errors, depth + 1);
        }
        if (before == errors.size()) addError(errors, path, "codec", result.error().map(DataResult.Error::message).orElse("Codec校验失败"));
    }
    static String propertyPath(String parent, String key) { return key.matches("[A-Za-z_][A-Za-z_0-9]*") ? parent + "." + key : parent + "[" + new JsonPrimitive(key) + "]"; }
    public static void addError(JsonArray errors, String path, String code, String message) {
        if (errors.size() >= 32) return;
        var error = new JsonObject(); error.addProperty("path", path); error.addProperty("code", code);
        error.addProperty("message", message.substring(0, Math.min(message.length(), 700))); errors.add(error);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static JsonElement encode(Codec codec, Object value, DynamicOps<JsonElement> ops) { return (JsonElement) codec.encodeStart(ops, value).getOrThrow(); }
    private static Set<Object> identitySet() { return Collections.newSetFromMap(new IdentityHashMap<>()); }
    private static JsonArray strings(Collection<String> values) { var out = new JsonArray(); values.forEach(out::add); return out; }
    private static Object member(Object object, String name) { return members(object).get(name); }
    private static Map<String, Object> members(Object object) {
        var out = new LinkedHashMap<String, Object>();
        if (object == null) return out;
        for (Class<?> c = object.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers()) || f.getName().equals("compressors")) continue;
                try { if (f.trySetAccessible()) out.putIfAbsent(f.getName(), f.get(object)); }
                catch (ReflectiveOperationException | RuntimeException ignored) { /* unsupported module -> unknown */ }
            }
        }
        return out;
    }
    private static Object unwrap(Object codec) {
        var seen = identitySet(); Object value = codec;
        while (seen.add(value)) {
            if (value == Identifier.CODEC || value == net.minecraft.util.ExtraCodecs.RGB_COLOR_CODEC || value == net.minecraft.util.ExtraCodecs.ARGB_COLOR_CODEC) return value;
            if (member(value, "wrapped") instanceof java.util.function.Supplier<?> supplier && supplier.get() instanceof Codec<?> wrapped) { value = wrapped; continue; }
            if (value instanceof ListCodec<?> || value instanceof UnboundedMapCodec<?, ?> || value instanceof EitherCodec<?, ?> || value instanceof MapCodec.MapCodecCodec<?>) return value;
            var fields = members(value);
            Object next = fields.get("val$codec");
            if (next == null) next = fields.get("val$normal");
            if (next == null) next = fields.get("val$decoder");
            if (next == null) next = fields.get("this$0");
            if (next instanceof Codec<?> || next instanceof Decoder<?>) value = next;
            else return value;
        }
        return value;
    }
    private static String primitive(Object codec) {
        if (codec == Codec.INT || codec == Codec.SHORT || codec == Codec.BYTE) return "int";
        if (codec == Codec.LONG) return "long"; if (codec == Codec.FLOAT) return "float"; if (codec == Codec.DOUBLE) return "double";
        if (codec == Codec.BOOL) return "bool"; if (codec == Codec.STRING) return "string"; return null;
    }
    private static List<Object> graph(Object root, int depth) {
        var out = new ArrayList<Object>(); walk(root, depth, identitySet(), out); return out;
    }
    private static void walk(Object object, int depth, Set<Object> seen, List<Object> out) {
        if (object == null || depth < 0 || out.size() >= 256 || !seen.add(object)) return;
        out.add(object); String name = object.getClass().getName();
        if (object instanceof net.minecraft.core.Registry<?> || object instanceof ResourceKey<?> || object instanceof Enum<?> || object.getClass().isArray()) return;
        if (!(name.startsWith("com.mojang.serialization.") || name.contains("$$Lambda") || name.startsWith("net.minecraft.util.") || name.startsWith("net.minecraft.resources."))) return;
        for (var entry : members(object).entrySet()) {
            if (List.of("val$name", "val$encoder", "cache", "this$0").contains(entry.getKey()) && !(entry.getValue() instanceof Codec<?>) && !(entry.getValue() instanceof Decoder<?>)) continue;
            walk(entry.getValue(), depth - 1, seen, out);
        }
    }
    private static boolean containsClass(Object codec, String prefix, int depth) { return graph(codec, depth).stream().anyMatch(o -> o.getClass().getName().startsWith(prefix)); }
    private static boolean hasFlatMapping(Object codec) {
        var seen = identitySet(); Object value = codec;
        while (value != null && seen.add(value)) {
            if (value instanceof ListCodec<?> || value instanceof UnboundedMapCodec<?, ?> || value instanceof EitherCodec<?, ?> || value instanceof MapCodec.MapCodecCodec<?>) return false;
            if (value.getClass().getName().equals("com.mojang.serialization.Decoder$1")) return true;
            var fields = members(value);
            Object next = fields.get("val$codec");
            if (next == null) next = fields.get("val$normal");
            if (next == null) next = fields.get("val$decoder");
            if (next == null) next = fields.get("this$0");
            value = next instanceof Codec<?> || next instanceof Decoder<?> ? next : null;
        }
        return false;
    }
    private static String registry(Object codec) {
        for (Object value : graph(codec, 12)) {
            if (value instanceof net.minecraft.core.Registry<?> registry) return registry.key().identifier().toString();
            if (value instanceof ResourceKey<?> key && key.registry().equals(Identifier.withDefaultNamespace("root"))) return key.identifier().toString();
        }
        return null;
    }
    private static JsonArray enumValues(Codec<?> codec) {
        var values = new TreeMap<String, JsonElement>();
        for (Object value : graph(codec, 7)) if (value.getClass().isArray() && value.getClass().getComponentType().isEnum()) {
            for (Object option : (Object[]) value) if (option instanceof StringRepresentable representable) {
                String id = representable.getSerializedName();
                if (safeParse(codec, new JsonPrimitive(id), JsonOps.INSTANCE)) values.put(id, new JsonPrimitive(id));
            }
        }
        var out = new JsonArray(); values.values().forEach(out::add); return out;
    }
    private static Number[] rangeCapture(Codec<?> codec) {
        for (Object value : graph(codec, 7)) {
            String name = value.getClass().getName();
            // Only captured official numeric validator closures; never arbitrary two numbers in a record.
            if (!name.startsWith("com.mojang.serialization.Codec$$Lambda") && !name.startsWith("net.minecraft.util.ExtraCodecs$$Lambda")) continue;
            var numbers = members(value).values().stream().filter(Number.class::isInstance).map(Number.class::cast).toList();
            if (numbers.size() == 2 && numbers.get(0).doubleValue() <= numbers.get(1).doubleValue()) return new Number[]{numbers.get(0), numbers.get(1)};
        }
        return null;
    }
    private static boolean verifyRange(Codec<?> codec, Number[] range, DynamicOps<JsonElement> ops) {
        if (!safeParse(codec, new JsonPrimitive(range[0]), ops) || !safeParse(codec, new JsonPrimitive(range[1]), ops)) return false;
        // Adjacent out-of-range probes for small integral bounds. Large narrowing overflows cannot prove a new bound.
        double low = range[0].doubleValue(), high = range[1].doubleValue();
        if (Math.abs(low) < 1.0e9 && safeParse(codec, new JsonPrimitive(low - 1), ops)) return false;
        if (Math.abs(high) < 1.0e9 && safeParse(codec, new JsonPrimitive(high + 1), ops)) return false;
        return true;
    }
    private static boolean safeParse(Codec<?> codec, JsonElement input, DynamicOps<JsonElement> ops) {
        try { return codec.parse(ops, input).isSuccess(); } catch (RuntimeException error) { return false; }
    }
}
