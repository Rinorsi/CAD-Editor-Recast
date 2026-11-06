package dev.rinorsi.editor;

import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.commands.Commands;
import net.minecraft.server.level.ServerPlayer;

public record EditorPolicy(int permissionLevel, boolean creativeOnly) {
    public static EditorPolicy load() {
        var path = FabricLoader.getInstance().getConfigDir().resolve("cadeditor.json");
        try {
            if (!Files.exists(path)) {
                Files.createDirectories(path.getParent());
                Files.writeString(path, "{\n  \"permissionLevel\": 2,\n  \"creativeOnly\": false\n}\n");
            }
            var json = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
            int level = StackCodec.integer(json, "permissionLevel", 0, 4);
            var creative = json.get("creativeOnly");
            if (creative == null || !creative.isJsonPrimitive() || !creative.getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException("creativeOnly 必须为布尔值");
            return new EditorPolicy(level, creative.getAsBoolean());
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("无法读取 " + path + "：" + e.getMessage(), e);
        }
    }
    public void require(ServerPlayer player) {
        var check = switch (permissionLevel) {
            case 0 -> Commands.LEVEL_ALL;
            case 1 -> Commands.LEVEL_MODERATORS;
            case 2 -> Commands.LEVEL_GAMEMASTERS;
            case 3 -> Commands.LEVEL_ADMINS;
            default -> Commands.LEVEL_OWNERS;
        };
        boolean permitted = Commands.hasPermission(check).test(player.createCommandSourceStack());
        if (!allows(player.isCreative(), permitted))
            StackCodec.fail(creativeOnly ? "服务器仅允许创造模式修改物品" : "需要创造模式或权限等级 ≥ " + permissionLevel);
    }
    public boolean allows(boolean creative, boolean permitted) { return creative || (!creativeOnly && permitted); }
}
