package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.world.EntityVolatile;
import java.nio.charset.StandardCharsets;
import java.util.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;

/** Typed templates, never instantiated on save and independent of a world. */
public final class VaultEntities {
  private VaultEntities() {}

  public record Validated(
      String snbt,
      String id,
      String name,
      JsonObject summary,
      JsonArray stripped,
      JsonArray warnings) {}

  public static Set<String> strippedFields() {
    var keys = new TreeSet<>(EntityVolatile.CURRENT);
    keys.addAll(Set.of("UUID", "UUIDMost", "UUIDLeast", "Dimension", "Passengers", "Leash"));
    return Collections.unmodifiableSet(keys);
  }

  public static Validated validate(String text) {
    if (text.getBytes(StandardCharsets.UTF_8).length > VaultStore.MAX_ENTRY_BYTES)
      throw new VaultStore.Failure("ENTRY_TOO_LARGE", "生物SNBT最多8MiB");
    int depth = 0;
    char quote = 0;
    boolean escape = false;
    for (char c : text.toCharArray()) {
      if (quote != 0) {
        if (escape) escape = false;
        else if (c == '\\') escape = true;
        else if (c == quote) quote = 0;
      } else if (c == '\'' || c == '"') quote = c;
      else if (c == '{' || c == '[') {
        if (++depth > 96) throw new VaultStore.Failure("INVALID_ENTITY", "SNBT嵌套过深");
      } else if (c == '}' || c == ']') depth--;
    }
    CompoundTag tag;
    try {
      var parsed = TagParser.create(NbtOps.INSTANCE).parseFully(text);
      if (!(parsed instanceof CompoundTag compound)) throw new IllegalArgumentException("必须为复合标签");
      tag = compound;
    } catch (Exception bad) {
      throw new VaultStore.Failure("INVALID_ENTITY", "生物SNBT无效：" + VaultStore.reason(bad));
    }
    String id = tag.getString("id").orElse("");
    if (id.isEmpty() || Identifier.tryParse(id) == null)
      throw new VaultStore.Failure("INVALID_ENTITY_ID", "生物必须包含合法的字符串id");
    id = Identifier.parse(id).toString();
    tag.putString("id", id);
    JsonArray stripped = new JsonArray(), warnings = new JsonArray();
    for (String key : strippedFields())
      if (tag.contains(key)) {
        tag.remove(key);
        stripped.add(key);
        if (key.equals("Passengers")) warnings.add("PASSENGERS_DROPPED");
      }
    JsonObject summary = new JsonObject();
    summary.addProperty("id", id);
    summary.addProperty("hasCustomName", tag.contains("CustomName") || tag.contains("custom_name"));
    summary.addProperty(
        "baby",
        negative(tag.get("Age")) || positive(tag.get("IsBaby")) || positive(tag.get("Baby")));
    int equipment = 0;
    if (tag.get("equipment") instanceof CompoundTag slots)
      for (String key : slots.keySet()) if (nonempty(slots.get(key))) equipment++;
    equipment += items(tag.get("ArmorItems")) + items(tag.get("HandItems"));
    summary.addProperty("equipmentCount", equipment);
    summary.addProperty("attributeCount", count(tag, "attributes", "Attributes"));
    summary.addProperty("effectCount", count(tag, "active_effects", "ActiveEffects"));
    var type = BuiltInRegistries.ENTITY_TYPE.getOptional(Identifier.parse(id)).orElse(null);
    String name = type == null ? id : type.getDescription().getString();
    return new Validated(tag.toString(), id, name, summary, stripped, warnings);
  }

  public static boolean registered(String id) {
    return BuiltInRegistries.ENTITY_TYPE.containsKey(Identifier.parse(id));
  }

  private static boolean positive(Tag t) {
    return t instanceof NumericTag n && n.doubleValue() != 0;
  }

  private static boolean negative(Tag t) {
    return t instanceof NumericTag n && n.doubleValue() < 0;
  }

  private static int count(CompoundTag t, String a, String b) {
    return t.get(a) instanceof ListTag l ? l.size() : t.get(b) instanceof ListTag l ? l.size() : 0;
  }

  private static boolean nonempty(Tag t) {
    return t instanceof CompoundTag c
        && c.getString("id").filter(s -> !s.equals("minecraft:air")).isPresent();
  }

  private static int items(Tag t) {
    int n = 0;
    if (t instanceof ListTag l) for (Tag v : l) if (nonempty(v)) n++;
    return n;
  }
}
