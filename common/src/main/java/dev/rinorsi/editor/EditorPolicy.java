package dev.rinorsi.editor;

import dev.rinorsi.editor.platform.Platform;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import net.minecraft.server.permissions.Permissions;
import net.minecraft.server.level.ServerPlayer;

public record EditorPolicy(int permissionLevel, boolean creativeOnly) {
    public static EditorPolicy load() {
        var path = Platform.get().configDir().resolve("cadeditor.json");
        try {
            if (!Files.exists(path)) {
                Files.createDirectories(path.getParent());
                Files.writeString(path, "{\n  \"permissionLevel\": 2,\n  \"creativeOnly\": false\n}\n");
            }
            var json = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
            int level = StackCodec.integer(json, "permissionLevel", 0, 4);
            var creative = json.get("creativeOnly");
            if (creative == null || !creative.isJsonPrimitive() || !creative.getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorpolicy.9c44841abe"));
            return new EditorPolicy(level, creative.getAsBoolean());
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException(EditorI18n.tr("cadeditor.message.editorpolicy.01457f1736", (path), (e.getMessage())), e);
        }
    }
    public void require(ServerPlayer player) {
        boolean permitted = gameMaster(player);
        if (!allows(player.isCreative(), permitted))
            EditorSessions.fail("permission_denied", EditorI18n.tr("cadeditor.message.editorpolicy.67483b7e29"));
    }
    public static boolean gameMaster(ServerPlayer player) {
        return player.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER);
    }
    public void requirePlayerEdit(ServerPlayer player) {
        if (!gameMaster(player))
            EditorSessions.fail("player_forbidden", EditorI18n.tr("cadeditor.message.editorpolicy.5c90d38c41"));
        require(player);
    }
    // Legacy config keys remain readable; they cannot deny a game-master based on game mode.
    public boolean allows(boolean creative, boolean permitted) { return creative || permitted; }
}
