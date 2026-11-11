package dev.rinorsi.editor.clientonly;

import com.google.gson.JsonObject;
import java.nio.file.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;

/** Read-only evidence of original vanilla player packet handlers completing. */
public final class PlayerSyncAudit {
    private static final JsonObject epochs = new JsonObject();
    private PlayerSyncAudit() {}
    public static JsonObject snapshot() { return epochs.deepCopy(); }
    public static void record(String family) {
        if (!"client-only-lan".equals(System.getProperty("editor.autotest"))) return;
        var mc = Minecraft.getInstance();
        if (!mc.isSameThread() || mc.player == null) return;
        int epoch = epochs.has(family) ? epochs.get(family).getAsInt()+1 : 1;
        epochs.addProperty(family, epoch);
        var row = new JsonObject(); row.addProperty("family", family); row.addProperty("epoch", epoch);
        row.addProperty("time", System.currentTimeMillis()); row.addProperty("source", "vanilla-packet-handler-tail");
        row.addProperty("uuid", mc.player.getUUID().toString());
        row.addProperty("x", mc.player.getX()); row.addProperty("y", mc.player.getY()); row.addProperty("z", mc.player.getZ());
        row.addProperty("yaw", mc.player.getYRot()); row.addProperty("pitch", mc.player.getXRot());
        try { Files.writeString(FabricLoader.getInstance().getGameDir().resolve("player-sync.jsonl"), row+"\n",
                StandardOpenOption.CREATE, StandardOpenOption.APPEND); }
        catch (java.io.IOException e) { throw new java.io.UncheckedIOException(e); }
    }
}
