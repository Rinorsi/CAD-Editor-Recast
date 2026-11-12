package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import dev.rinorsi.editor.EditorSessions;

/** Shared denial vocabulary. Inputs are server-computed, never supplied by the page. */
public final class WorldAccess {
    private WorldAccess() {}
    /** Same loaded-chunk query as LevelReader.hasChunkAt, without requesting or generating chunks. */
    public static boolean isLoaded(net.minecraft.world.level.Level level, net.minecraft.core.BlockPos pos) {
        return level.getChunkSource().hasChunk(net.minecraft.core.SectionPos.blockToSectionCoord(pos.getX()), net.minecraft.core.SectionPos.blockToSectionCoord(pos.getZ()));
    }
    public static void loaded(boolean loaded) { if (!loaded) EditorSessions.fail("chunk_unloaded", EditorI18n.tr("cadeditor.message.worldaccess.d123142086")); }
    public static void reach(boolean reachable) { if (!reachable) EditorSessions.fail("out_of_reach", EditorI18n.tr("cadeditor.message.worldaccess.a24f0f9747")); }
    public static void area(boolean allowed) { if (!allowed) EditorSessions.fail("protected_area", EditorI18n.tr("cadeditor.message.worldaccess.222546142d")); }
    public static void nonPlayer(boolean playerTarget) { if (playerTarget) EditorSessions.fail("player_target", EditorI18n.tr("cadeditor.message.worldaccess.6091e35e70")); }
}
