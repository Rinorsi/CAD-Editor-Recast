package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.SharedConstants;
import net.minecraft.core.HolderSet;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
import net.minecraft.world.entity.decoration.painting.PaintingVariant;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Instrument;
import net.minecraft.world.item.JukeboxSong;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.level.block.entity.BannerPattern;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.equipment.trim.TrimMaterial;
import net.minecraft.world.item.equipment.trim.TrimPattern;
import net.minecraft.world.level.block.Block;

/** Capture only on the client thread: registry holders and translations are live game state. */
public final class RegistrySnapshot {
    public static final Map<String, String> KINDS = new LinkedHashMap<>();
    static {
        KINDS.put("items", "item"); KINDS.put("enchantments", "enchantment");
        KINDS.put("mob_effects", "mob_effect"); KINDS.put("attributes", "attribute");
        KINDS.put("sounds", "sound_event"); KINDS.put("potions", "potion");
        KINDS.put("instruments", "instrument"); KINDS.put("jukebox_songs", "jukebox_song");
        KINDS.put("banner_patterns", "banner_pattern"); KINDS.put("trim_materials", "trim_material");
        KINDS.put("trim_patterns", "trim_pattern"); KINDS.put("painting_variants", "painting_variant");
        KINDS.put("damage_types", "damage_type"); KINDS.put("entity_types", "entity_type");
        KINDS.put("data_component_types", "data_component_type"); KINDS.put("blocks", "block");
    }
    private final Map<Identifier, Registry<?>> registries = new LinkedHashMap<>();
    private final Function<Identifier, Component> subtitles;
    public RegistrySnapshot(RegistryAccess access, Function<Identifier, Component> subtitles) {
        BuiltInRegistries.REGISTRY.forEach(r -> registries.put(r.key().identifier(), r));
        access.registries().forEach(r -> registries.put(r.key().identifier(), r.value()));
        this.subtitles = subtitles;
    }
    public JsonArray entries(Identifier registryId) {
        Registry<?> registry = registries.get(registryId);
        if (registry == null) throw new IllegalArgumentException("当前客户端没有注册表: " + registryId);
        return serialize(registry);
    }
    public boolean containsRegistry(Identifier registryId) { return registryId != null && registries.containsKey(registryId); }
    public JsonArray tags(Identifier registryId) {
        Registry<?> registry = registry(registryId);
        JsonArray entries = new JsonArray();
        registry.getTags().sorted(java.util.Comparator.comparing(t -> t.key().location().toString())).forEach(tag -> {
            JsonObject row = tagLabel(tag.key());
            row.addProperty("count", tag.size()); entries.add(row);
        });
        return entries;
    }
    public JsonArray tagMembers(Identifier registryId, Identifier tagId) {
        var tag = registry(registryId).getTags().filter(t -> t.key().location().equals(tagId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("当前注册表没有标签: " + tagId));
        return ids(tag);
    }
    /** Fabric convention keys also cover mod registries; missing language entries retain the ID. */
    static JsonObject tagLabel(net.minecraft.tags.TagKey<?> tag) {
        JsonObject row = new JsonObject();
        row.addProperty("id", tag.location().toString());
        String translationKey = tag.getTranslationKey();
        row.addProperty("translation_key", translationKey);
        row.addProperty("name", translated(translationKey, tag.location()));
        return row;
    }
    private Registry<?> registry(Identifier registryId) {
        Registry<?> registry = registries.get(registryId);
        if (registry == null) throw new IllegalArgumentException("当前客户端没有注册表: " + registryId);
        return registry;
    }
    private <T> JsonArray serialize(Registry<T> registry) {
        JsonArray entries = new JsonArray();
        registry.listElements().sorted(java.util.Comparator.comparing(h -> h.key().identifier().toString())).forEach(holder -> entries.add(serializeRow(registry, holder)));
        return entries;
    }
    public java.util.Iterator<JsonObject> iterator(Identifier id) { return iterator(registry(id)); }
    private <T> java.util.Iterator<JsonObject> iterator(Registry<T> registry) {
        return registry.listElements().map(holder -> serializeRow(registry, holder)).iterator();
    }
    private <T> JsonObject serializeRow(Registry<T> registry, net.minecraft.core.Holder.Reference<T> holder) {
            Identifier id = holder.key().identifier(); T value = holder.value();
            JsonObject row = new JsonObject(); row.addProperty("id", id.toString());
            row.addProperty("name", name(registry.key().identifier(), id, value));
            if (value instanceof TrimMaterial) {
                JsonArray ingredients = new JsonArray();
                java.util.Set<String> ingredientIds = new java.util.TreeSet<>();
                BuiltInRegistries.ITEM.listElements().forEach(item -> {
                    var material = item.value().components().get(net.minecraft.core.component.DataComponents.PROVIDES_TRIM_MATERIAL);
                    if (material != null && material.unwrapKey().map(key -> key.identifier().equals(id)).orElse(false))
                        ingredientIds.add(item.key().identifier().toString());
                });
                ingredientIds.forEach(ingredients::add);
                row.add("ingredients", ingredients);
                if (!ingredients.isEmpty()) row.addProperty("ingredient", ingredients.get(0).getAsString());
            } else if (value instanceof TrimPattern) {
                row.add("template_items", new JsonArray()); row.addProperty("template_status", "server_required");
            }
            if (value instanceof JukeboxSong song) {
                row.addProperty("sound_event", song.soundEvent().value().location().toString());
                row.addProperty("length_in_seconds", song.lengthInSeconds());
                row.addProperty("comparator_output", song.comparatorOutput());
                row.addProperty("description", song.description().getString());
            } else if (value instanceof Instrument instrument) {
                row.addProperty("sound_event", instrument.soundEvent().value().location().toString());
                row.addProperty("use_duration", instrument.useDuration()); row.addProperty("range", instrument.range());
            }
            if (value instanceof Enchantment e) {
                row.addProperty("desc", e.description().getString());
                row.addProperty("max_level", e.getMaxLevel()); row.addProperty("weight", e.getWeight());
                row.addProperty("anvil_cost", e.getAnvilCost());
                row.addProperty("min_cost", e.getMinCost(1)); row.addProperty("max_cost", e.getMaxCost(1));
                relation(row, "exclusive", e.exclusiveSet(), id);
                relation(row, "supported", e.getSupportedItems(), id);
                relation(row, "primary", e.definition().primaryItems().orElse(HolderSet.direct()), id);
                JsonArray slots = new JsonArray(); e.definition().slots().forEach(s -> slots.add(s.getSerializedName())); row.add("slots", slots);
                JsonArray tags = new JsonArray(); holder.tags().map(t -> t.location().toString()).sorted().forEach(tags::add); row.add("tags", tags);
            } else if (value instanceof MobEffect e) {
                row.addProperty("category", e.getCategory().name().toLowerCase(Locale.ROOT));
                row.addProperty("color", e.getColor()); row.addProperty("instant", e.isInstantenous());
            } else if (value instanceof Attribute a) {
                row.addProperty("default", a.getDefaultValue());
                if (a instanceof RangedAttribute r) { row.addProperty("min", r.getMinValue()); row.addProperty("max", r.getMaxValue()); }
                // 26.1.2 has no sentiment getter. Compare its public style with the enum styles.
                for (var s : Attribute.Sentiment.values()) if (s.getStyle(true) == a.getStyle(true)) {
                    row.addProperty("sentiment", s.name().toLowerCase(Locale.ROOT)); break;
                }
            }
            if (registry.key().identifier().equals(Identifier.withDefaultNamespace("sound_event"))) {
                Component subtitle = subtitles.apply(id); if (subtitle != null) row.addProperty("subtitle", subtitle.getString());
            }
            return row;
    }
    private static void relation(JsonObject row, String field, HolderSet<?> set, Identifier id) {
        JsonArray values = set.size() <= 64 ? ids(set) : null;
        if (values != null && values.toString().length() <= 4000) row.add(field, values);
        else {
            row.add(field, new JsonArray());
            JsonObject ref = new JsonObject(); ref.addProperty("name", "minecraft:enchantment");
            ref.addProperty("id", id.toString()); ref.addProperty("field", field); ref.addProperty("total", set.size());
            set.unwrapKey().ifPresent(tag -> ref.addProperty("tag", tag.location().toString()));
            row.add(field + "_ref", ref);
        }
    }
    private static JsonArray ids(HolderSet<?> set) {
        JsonArray result = new JsonArray();
        set.stream().flatMap(h -> h.unwrapKey().stream()).map(k -> k.identifier().toString()).sorted().forEach(result::add);
        return result;
    }
    public JsonArray relation(Identifier id, String field) {
        Registry<?> registry = registries.get(Identifier.withDefaultNamespace("enchantment"));
        Object value = registry == null ? null : registry.getValue(id);
        if (!(value instanceof Enchantment e)) throw new IllegalArgumentException("未知附魔: " + id);
        return ids(switch (field) {
            case "supported" -> e.getSupportedItems();
            case "primary" -> e.definition().primaryItems().orElse(HolderSet.direct());
            case "exclusive" -> e.exclusiveSet();
            default -> throw new IllegalArgumentException("未知附魔关系: " + field);
        });
    }
    private static String name(Identifier registry, Identifier id, Object value) {
        if (value instanceof Item i) return translated(i.getDescriptionId(), id);
        if (value instanceof Block b) return translated(b.getDescriptionId(), id);
        if (value instanceof EntityType<?> e) return e.getDescription().getString();
        if (value instanceof MobEffect e) return e.getDisplayName().getString();
        if (value instanceof Attribute a) return translated(a.getDescriptionId(), id);
        if (value instanceof Enchantment e) return e.description().getString();
        if (value instanceof Instrument i) return i.description().getString();
        if (value instanceof JukeboxSong s) return s.description().getString();
        if (value instanceof TrimMaterial m) return m.description().getString();
        if (value instanceof TrimPattern p) return p.description().getString();
        if (value instanceof PaintingVariant p) return p.title().map(Component::getString).orElse(id.toString());
        if (value instanceof Potion p) return translated("item.minecraft.potion.effect." + p.name(), id);
        if (value instanceof BannerPattern b) return translated(b.translationKey(), id);
        return translated(registry.getPath() + "." + id.getNamespace() + "." + id.getPath().replace('/', '.'), id);
    }
    private static String translated(String key, Identifier fallback) {
        return Language.getInstance().has(key) ? Language.getInstance().getOrDefault(key) : fallback.toString();
    }
}
