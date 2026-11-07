package dev.rinorsi.editor.world;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.server.level.ServerPlayer;
import org.slf4j.LoggerFactory;

/** Additive router on the existing request/reply packet; all mutation runs on server thread. */
public final class WorldEditor {
    private static final WorldEditSessions SESSIONS = new WorldEditSessions();
    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger("WorldEditor");
    private WorldEditor() {}
    public static void initialize() {
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> SESSIONS.remove(handler.player.getUUID()));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> SESSIONS.clear());
        ServerLifecycleEvents.SERVER_STARTING.register(server -> SESSIONS.clear());
    }
    public static boolean route(ServerPlayer player, JsonObject request, Supplier<EditorPolicy> policy) {
        if (!request.has("slot") || !request.get("slot").isJsonObject()) return false;
        var slot = request.getAsJsonObject("slot");
        if (!slot.has("kind") || !slot.get("kind").isJsonPrimitive()) return false;
        String kind = slot.get("kind").getAsString();
        if (!kind.equals("block") && !kind.equals("entity")) return false;
        String id = ""; String op = "";
        try {
            id = StackCodec.string(request, "requestId"); if (id.length() > 80) throw new IllegalArgumentException("requestId 过长");
            op = StackCodec.string(request, "op");
            if (op.equals("close")) { SESSIONS.close(player.getUUID(), slot); return true; }
            try { policy.get().require(player); } catch (RuntimeException e) { EditorSessions.fail("not_allowed", e.getMessage()); }
            var target = WorldTarget.resolve(player, slot);
            if (op.equals("open")) {
                SESSIONS.rateLimit(player.getUUID());
                var canonical = target.canonicalSlot(); var current = target.save();
                var snapshot = target.snapshot(canonical, false); // size checked before replacing session
                var reply = result("opened", id); reply.add("world", snapshot); checkSize(reply);
                SESSIONS.open(player.getUUID(), canonical, current); send(player, reply); return true;
            }
            if (!op.equals("apply") && !op.equals("undo")) EditorSessions.fail("invalid_request", "未知世界编辑操作");
            SESSIONS.rateLimit(player.getUUID());
            var before = target.save();
            var state = SESSIONS.require(player.getUUID(), slot, StackCodec.string(request, "revision"), before);
            net.minecraft.nbt.CompoundTag requested;
            if (op.equals("undo")) {
                requested = state.preimage();
            } else requested = request.has("snbt") ? WorldNbt.parse(StackCodec.string(request, "snbt")) : before.copy();
            var prepared = target.prepare(requested, op.equals("undo") ? new JsonObject() : request);
            WorldNbt.protect(before, prepared, target.entity != null);
            target.checkCommandPrivileges(player,prepared);
            // Loaders that silently ignore unknown/invalid values must not report a successful edit.
            WorldNbt.requireEditedFieldsRetained(before,requested,prepared);
            if (prepared.toString().length() > WorldNbt.MAX_SNBT) EditorSessions.fail("payload_too_large", "修改后的 NBT 超出上限");
            var preview = result("saved",id); preview.add("world",target.preview(prepared,state.slot,!op.equals("undo"))); checkSize(preview);
            try { target.write(prepared); }
            catch (RuntimeException failure) { try { target.write(before); } catch (RuntimeException rollback) { failure.addSuppressed(rollback); LOG.error("World edit rollback failed player={} slot={}", player.getUUID(), slot, rollback); } throw failure; }
            state.saved(before,target.save(),op.equals("undo"));
            LOG.info("[CAD-Editor-World] audit player={} op={} target={} before={} after={}", player.getUUID(), op, slot, WorldNbt.revision(before), WorldNbt.revision(state.baseline));
            var reply = result("saved", id); reply.add("world", target.snapshot(state.slot, state.undo != null)); send(player, reply);
        } catch (RuntimeException e) {
            String code = e instanceof EditorSessions.Failure f ? f.code : "invalid_request";
            LOG.warn("[CAD-Editor-World] denied player={} op={} request={} code={} target={} reason={}", player.getUUID(), op, id, code, slot, e.getMessage());
            var reply = result("rejected", id); reply.addProperty("code", code); String reason = e.getMessage() == null ? "世界编辑失败" : e.getMessage();
            reply.addProperty("reason", reason.substring(0, Math.min(1200, reason.length()))); send(player, reply);
        }
        return true;
    }
    private static JsonObject result(String status, String id) { var r = new JsonObject(); r.addProperty("status", status); r.addProperty("requestId", id); return r; }
    private static void checkSize(JsonObject json) { WorldWire.encode(json); }
    private static void send(ServerPlayer player, JsonObject reply) { ServerPlayNetworking.send(player, new EditorPackets.Reply(WorldWire.encode(reply))); }
}
