package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorSessions;

/** Shared denial vocabulary. Inputs are server-computed, never supplied by the page. */
public final class WorldAccess {
    private WorldAccess() {}
    /** Same loaded-chunk query as LevelReader.hasChunkAt, without requesting or generating chunks. */
    public static boolean isLoaded(net.minecraft.world.level.Level level, net.minecraft.core.BlockPos pos) {
        return level.getChunkSource().hasChunk(net.minecraft.core.SectionPos.blockToSectionCoord(pos.getX()), net.minecraft.core.SectionPos.blockToSectionCoord(pos.getZ()));
    }
    public static void loaded(boolean loaded) { if (!loaded) EditorSessions.fail("chunk_unloaded", "目标区块尚未加载；不会自动加载区块"); }
    public static void reach(boolean reachable) { if (!reachable) EditorSessions.fail("out_of_reach", "目标超出玩家当前交互距离"); }
    public static void area(boolean allowed) { if (!allowed) EditorSessions.fail("protected_area", "原版保护区、世界边界或玩家建造权限禁止修改这里"); }
    public static void nonPlayer(boolean playerTarget) { if (playerTarget) EditorSessions.fail("player_target", "禁止通过世界编辑器修改玩家"); }
}
