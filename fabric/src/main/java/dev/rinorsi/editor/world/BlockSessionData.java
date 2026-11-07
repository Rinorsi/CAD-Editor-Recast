package dev.rinorsi.editor.world;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.block.state.BlockState;

/** Server-only wrapper: state participates in conflicts and undo without polluting saved NBT. */
public final class BlockSessionData {
    private BlockSessionData() {}
    public static CompoundTag pack(CompoundTag data, BlockState state) {
        if(state == null) return data.copy();
        var result = new CompoundTag(); result.put("cad_session_nbt",data.copy());result.put("cad_session_state",BlockStateEdit.tag(state));
        result.putString("cad_session_block",net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());return result;
    }
    public static CompoundTag data(CompoundTag session) { return session.getCompound("cad_session_nbt").orElse(session).copy(); }
}
