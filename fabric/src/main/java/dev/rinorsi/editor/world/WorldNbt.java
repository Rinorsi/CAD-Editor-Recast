package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorSessions;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Objects;
import java.util.Set;
import net.minecraft.nbt.*;

/** Wire NBT is always SNBT, never a lossy JSON-to-NBT conversion. */
public final class WorldNbt {
    public static final int MAX_SNBT = 24000;
    private WorldNbt() {}
    public static CompoundTag parse(String text) {
        if (text.length() > MAX_SNBT) EditorSessions.fail("payload_too_large", "世界目标 NBT 超过 24000 字符");
        try {
            var tag = TagParser.create(NbtOps.INSTANCE).parseFully(text);
            checkDepth(tag, 0);
            if (tag instanceof CompoundTag compound) return compound;
        } catch (com.mojang.brigadier.exceptions.CommandSyntaxException e) {
            EditorSessions.fail("invalid_nbt", "SNBT 无效：" + e.getMessage());
        }
        throw new EditorSessions.Failure("invalid_nbt", "世界目标数据必须为 compound");
    }
    private static void checkDepth(Tag tag, int depth) {
        if (depth > 32) EditorSessions.fail("invalid_nbt", "NBT 嵌套超过 32 层");
        if (tag instanceof CompoundTag c) for (String key : c.keySet()) checkDepth(c.get(key), depth + 1);
        else if (tag instanceof ListTag l) for (Tag child : l) checkDepth(child, depth + 1);
    }
    public static String revision(CompoundTag tag) {
        try {
            var digest = MessageDigest.getInstance("SHA-256"); canonical(tag, digest);
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException e) { throw new AssertionError(e); }
    }
    private static void canonical(Tag tag, MessageDigest digest) {
        part(digest, Byte.toString(tag.getId()));
        if (tag instanceof CompoundTag c) {
            for (String key : new java.util.TreeSet<>(c.keySet())) { part(digest, key); canonical(c.get(key), digest); }
        } else if (tag instanceof ListTag l) for (Tag child : l) canonical(child, digest);
        else part(digest, tag.toString());
        part(digest, ";");
    }
    private static void part(MessageDigest digest, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        digest.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array()); digest.update(bytes);
    }
    // Security policy, not a registry/options list. Moves/relationships are outside this editor.
    public static void protect(CompoundTag before, CompoundTag after, boolean entity) {
        Set<String> keys = entity ? Set.of("id", "UUID", "Pos", "Motion", "Rotation", "Dimension", "Passengers", "RootVehicle", "Leash", "leash", "PortalCooldown", "TileX", "TileY", "TileZ", "block_pos", "Facing", "facing", "SleepingX", "SleepingY", "SleepingZ")
                : Set.of("id", "x", "y", "z", "keepPacked");
        for (String key : keys) if (!Objects.equals(before.get(key), after.get(key)))
            EditorSessions.fail("protected_field", "不可修改世界目标的身份、位置或关联字段：" + key);
    }
    public static void requireRevision(String baseline, CompoundTag current) {
        if (baseline == null || !baseline.equals(revision(current)))
            EditorSessions.fail("target_changed", "目标在编辑期间已变化；请重新读取后比较，草稿已保留");
    }
    public static void requireEditedFieldsRetained(CompoundTag before, CompoundTag requested, CompoundTag prepared) {
        var keys = new java.util.HashSet<>(requested.keySet()); keys.addAll(before.keySet());
        for (String key : keys) if (!Objects.equals(before.get(key), requested.get(key)) && !Objects.equals(requested.get(key), prepared.get(key)))
            EditorSessions.fail("invalid_nbt", "原版加载器未保留修改的字段：" + key);
    }
}
