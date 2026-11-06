package dev.rinorsi.editor.testing;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.StackComparison;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;

/** Shared exact-user-sample checks, run with the real world's loaded Fabric tags. */
public final class UserSpearRoundTrip {
    private UserSpearRoundTrip() {}
    public static JsonObject verify(ItemStack actual, RegistryAccess access) {
        var slot = new JsonObject(); slot.addProperty("index", 0);
        var snapshot = JsonParser.parseString(StackCodec.snapshot(actual, access, slot, "user-spear").toString()).getAsJsonObject();
        // Reproduce the previous sidecar test (JsonElement.equals) and skipped
        // restoration for sidecar-bearing components, without reverting live code.
        var legacySnapshot = snapshot.deepCopy();
        for (var entry : actual.getComponentsPatch().entrySet()) {
            var key = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(entry.getKey()).toString();
            if (key.startsWith("minecraft:")) key = key.substring(10);
            if (entry.getValue().isPresent() && !encodedJson(entry.getKey(), entry.getValue().get(), access).equals(snapshot.getAsJsonObject("comps").get(key)))
                legacySnapshot.getAsJsonObject("component_snbt").remove(key);
        }
        var legacy = StackCodec.decode(legacySnapshot, access);
        var raw = StackCodec.decode(snapshot, access);
        var original = StackCodec.decode(snapshot, access, actual);
        var apply = snapshot.deepCopy(); apply.remove("component_snbt");
        var noEdit = StackCodec.decode(apply, access, original);
        var report = new JsonObject();
        report.addProperty("legacy_matches", ItemStack.matches(actual, legacy));
        report.addProperty("raw_matches", ItemStack.matches(actual, raw));
        report.addProperty("open_matches", ItemStack.matches(actual, original));
        report.addProperty("apply_matches", ItemStack.matches(actual, noEdit));
        report.addProperty("fingerprint_same", StackComparison.matches(actual, noEdit, access));
        var components = new JsonObject();
        for (var entry : actual.getComponentsPatch().entrySet()) {
            var type = entry.getKey(); var value = entry.getValue().orElse(null);
            var component = new JsonObject();
            component.addProperty("legacy_equal", java.util.Objects.equals(value, legacy.get(type)));
            component.addProperty("raw_equal", java.util.Objects.equals(value, raw.get(type)));
            component.addProperty("open_equal", java.util.Objects.equals(value, original.get(type)));
            component.addProperty("apply_equal", java.util.Objects.equals(value, noEdit.get(type)));
            component.addProperty("original_reference_preserved", value == original.get(type));
            components.add(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type).toString(), component);
        }
        report.add("components", components);
        System.out.println("USER_SPEAR_ROUND_TRIP " + report);
        if (!ItemStack.matches(actual, original) || !ItemStack.matches(actual, noEdit) || !StackComparison.matches(actual, noEdit, access))
            throw new AssertionError("Exact user spear no-edit round trip failed: " + report);
        return report;
    }
    private static <T> com.google.gson.JsonElement encodedJson(net.minecraft.core.component.DataComponentType<T> type, Object value, RegistryAccess access) {
        @SuppressWarnings("unchecked") T typed = (T) value;
        return type.codec().encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE), typed).getOrThrow();
    }
}
