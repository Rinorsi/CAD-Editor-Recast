package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import dev.rinorsi.editor.EditorSessions;
import net.minecraft.nbt.*;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.*;

/** Uses the same StateDefinition authority as the block_properties registry channel. */
public final class BlockStateEdit {
    private BlockStateEdit() {}
    public static JsonObject values(BlockState state) {
        var result = new JsonObject();
        for (var property : state.getProperties()) result.addProperty(property.getName(), name(state, property));
        return result;
    }
    private static <T extends Comparable<T>> String name(BlockState state, Property<T> property) { return property.getName(state.getValue(property)); }
    public static JsonArray schema(BlockState state) {
        var result = new JsonArray();
        for (var property : state.getProperties()) {
            var row = new JsonObject(); row.addProperty("name", property.getName());
            row.addProperty("type", property instanceof BooleanProperty ? "boolean" : property instanceof IntegerProperty ? "int" : "enum");
            var values = new JsonArray(); property.getPossibleValues().forEach(v -> values.add(valueName(property, v)));
            row.add("values", values); row.addProperty("default", name(state.getBlock().defaultBlockState(), property)); row.addProperty("current", name(state, property));
            result.add(row);
        }
        return result;
    }
    @SuppressWarnings({"rawtypes","unchecked"}) private static String valueName(Property property, Object value) { return property.getName((Comparable)value); }
    public static BlockState prepare(BlockState before, JsonObject edits) {
        BlockState next = before;
        for (var entry : edits.entrySet()) {
            var property = before.getBlock().getStateDefinition().getProperty(entry.getKey());
            if (property == null) throw new EditorSessions.Failure("invalid_block_state", EditorI18n.tr("cadeditor.message.blockstateedit.9cef7fcb5d", (entry.getKey())));
            if (!entry.getValue().isJsonPrimitive()) throw new EditorSessions.Failure("invalid_block_state", EditorI18n.tr("cadeditor.message.blockstateedit.ed7c1fb77d", (entry.getKey())));
            next = set(next, property, entry.getValue().getAsString());
        }
        // StateDefinition enumerates legal states; environmental survival is deliberately not claimed.
        if (!before.getBlock().getStateDefinition().getPossibleStates().contains(next)) throw new EditorSessions.Failure("invalid_block_state", EditorI18n.tr("cadeditor.message.blockstateedit.68d0d84576"));
        return next;
    }
    /** Vanilla command modes are distinct blocks, not a StateDefinition property. */
    public static BlockState commandType(BlockState before,String id) {
        var key=net.minecraft.resources.Identifier.tryParse(id);
        var block=key == null ? null : net.minecraft.core.registries.BuiltInRegistries.BLOCK.getOptional(key).orElse(null);
        if(!(before.getBlock() instanceof net.minecraft.world.level.block.CommandBlock) || !(block instanceof net.minecraft.world.level.block.CommandBlock))
            throw new EditorSessions.Failure("invalid_block_state",EditorI18n.tr("cadeditor.message.blockstateedit.60c695e4f6"));
        var shared=new JsonObject();var old=values(before);
        for(var property:block.getStateDefinition().getProperties())if(old.has(property.getName()))shared.add(property.getName(),old.get(property.getName()));
        return prepare(block.defaultBlockState(),shared);
    }
    public static JsonArray commandTypes() {
        var values=new JsonArray();for(var block:net.minecraft.core.registries.BuiltInRegistries.BLOCK)if(block instanceof net.minecraft.world.level.block.CommandBlock)values.add(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block).toString());return values;
    }
    private static <T extends Comparable<T>> BlockState set(BlockState state, Property<T> property, String value) {
        var parsed = property.getValue(value);
        if (parsed.isEmpty()) throw new EditorSessions.Failure("invalid_block_state", EditorI18n.tr("cadeditor.message.blockstateedit.22377b8199", (property.getName()), (value), (property.getPossibleValues())));
        return state.setValue(property, parsed.get());
    }
    public static CompoundTag tag(BlockState state) {
        var result = new CompoundTag(); values(state).entrySet().forEach(e -> result.putString(e.getKey(), e.getValue().getAsString()));
        return result;
    }
    public static JsonObject json(CompoundTag tag) { var result = new JsonObject(); tag.keySet().forEach(k -> result.addProperty(k, tag.getString(k).orElseThrow())); return result; }
    public static int flags(boolean updateNeighbors) { return updateNeighbors ? 3 : 18; }
    public static void requireApplied(BlockState requested,BlockState actual) {
        if(!requested.equals(actual))throw new EditorSessions.Failure("invalid_block_state",EditorI18n.tr("cadeditor.message.blockstateedit.f110d90f42", (values(actual))));
    }
}
