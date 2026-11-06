package dev.rinorsi.editor;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;

/** Persisted item equality, independent of Java object identity. */
public final class StackComparison {
    private StackComparison() {}
    public static boolean matches(ItemStack actual, ItemStack expected, RegistryAccess access) {
        if (actual.isEmpty() || expected.isEmpty()) return actual.isEmpty() && expected.isEmpty();
        return EditorSessions.fingerprint(actual, access).equals(EditorSessions.fingerprint(expected, access));
    }
    /** IDs/equality results only; no book/custom-data/profile contents in logs. */
    public static List<String> differences(ItemStack actual, ItemStack expected, RegistryAccess access) {
        List<String> out = new ArrayList<>();
        if (actual.getItem() != expected.getItem()) out.add("item_id");
        if (actual.getCount() != expected.getCount()) out.add("count");
        for (var type : BuiltInRegistries.DATA_COMPONENT_TYPE) {
            Object a = actual.get(type), b = expected.get(type);
            String id = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type).toString();
            if (type.codec() == null) {
                if (!java.util.Objects.equals(a, b)) out.add(id + "[transient/java]");
            } else if (a == null || b == null) {
                if (a != b) out.add(id + "[presence]");
            } else {
                boolean javaEqual = java.util.Objects.equals(a, b);
                boolean nbtEqual = encoded(type, a, access).equals(encoded(type, b, access));
                if (!javaEqual || !nbtEqual) out.add(id + "[java=" + javaEqual + ",nbt=" + nbtEqual + "]");
            }
        }
        return out;
    }
    private static <T> Tag encoded(DataComponentType<T> type, Object value, RegistryAccess access) {
        @SuppressWarnings("unchecked") T typed = (T) value;
        return type.codec().encodeStart(access.createSerializationContext(NbtOps.INSTANCE), typed).getOrThrow();
    }
}
