package dev.rinorsi.editor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.component.DataComponentType;

/** split() is public in all targets; 26.3 removed entrySet(). Removed components stay explicit. */
public final class ComponentPatches {
    private ComponentPatches() {}
    public static List<Map.Entry<DataComponentType<?>, Optional<?>>> entries(DataComponentPatch patch) {
        var result = new ArrayList<Map.Entry<DataComponentType<?>, Optional<?>>>();
        var split = patch.split();
        for (var value : split.added()) result.add(Map.entry(value.type(), Optional.of(value.value())));
        for (var type : split.removed()) result.add(Map.entry(type, Optional.empty()));
        return result;
    }
}
