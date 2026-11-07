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
                var canonical = target.canonicalSlot(); var current = target.sessionData();
                var snapshot = target.snapshot(canonical, false); // size checked before replacing session
                var reply = result("opened", id); reply.add("world", snapshot); checkSize(reply);
                SESSIONS.open(player.getUUID(), canonical, current); send(player, reply); return true;
            }
            if (!op.equals("apply") && !op.equals("undo")) EditorSessions.fail("invalid_request", "未知世界编辑操作");
            SESSIONS.rateLimit(player.getUUID());
            var before = target.save(); var beforeSession = target.sessionData(); var beforeState = target.blockState();
            var state = SESSIONS.require(player.getUUID(), slot, StackCodec.string(request, "revision"), beforeSession);
            if (request.has("riding")) {
                if (target.entity == null || !op.equals("apply") || request.has("snbt") || request.has("entity") || request.has("container") || request.has("views") || request.has("block_state") || request.has("block_type"))
                    EditorSessions.fail("invalid_request","riding 必须单独提交为实体 apply");
                final String replyId=id;
                EntityRiding.apply(player,target.entity,StackCodec.object(request,"riding"),passenger->{
                    var preview=result("saved",replyId);preview.add("world",EntityRiding.previewAddition(target.snapshot(state.slot,false),passenger,target.level.registryAccess()));checkSize(preview);
                });
                state.saved(beforeSession,target.sessionData(),true);
                LOG.info("[CAD-Editor-World] audit player={} op=riding target={} before={} after={}",player.getUUID(),slot,WorldNbt.revision(beforeSession),WorldNbt.revision(state.baseline));
                var reply = result("saved",id); reply.add("world",target.snapshot(state.slot,false));send(player,reply);return true;
            }
            if (target.entity == null && request.has("entity")) EditorSessions.fail("invalid_request","方块不接受实体编辑区段");
            var stateEdits = request.has("block_state") ? StackCodec.object(request,"block_state") : new JsonObject();
            String blockType = request.has("block_type") ? StackCodec.string(request,"block_type") : null;
            net.minecraft.nbt.CompoundTag requested;
            if (op.equals("undo")) {
                var undo = state.preimage(); requested = target.entity != null ? EntitySessionData.data(undo) : BlockSessionData.data(undo);
                if(beforeState != null) stateEdits = BlockStateEdit.json(undo.getCompound("cad_session_state").orElseThrow());
                if(beforeState != null && beforeState.getBlock() instanceof net.minecraft.world.level.block.CommandBlock) blockType=undo.getString("cad_session_block").orElseThrow();
            } else requested = request.has("snbt") ? WorldNbt.parse(StackCodec.string(request, "snbt")) : (target.entity == null ? before.copy() : EntitySessionData.data(state.baseline));
            if (target.entity != null) requested = EntityVolatile.rebase(EntitySessionData.data(state.baseline),requested,before,op.equals("undo"));
            if(target.entity != null && (request.has("block_state") || request.has("views") || request.has("container") || blockType != null)) EditorSessions.fail("invalid_request","实体不接受方块字段");
            var nextState = beforeState == null ? null : BlockStateEdit.prepare(blockType == null ? beforeState : BlockStateEdit.commandType(beforeState,blockType),stateEdits);
            if(!op.equals("undo") && request.has("views") && target.block != null) requested = BlockViews.apply(target.block,requested,StackCodec.object(request,"views"),target.level.registryAccess());
            requested = BlockVolatile.merge(requested,op.equals("undo") ? requested : BlockSessionData.data(state.baseline),before);
            if(request.has("updateNeighbors") && (!request.get("updateNeighbors").isJsonPrimitive() || !request.getAsJsonPrimitive("updateNeighbors").isBoolean())) EditorSessions.fail("invalid_request","updateNeighbors 必须为布尔值");
            boolean updateNeighbors = !request.has("updateNeighbors") || request.get("updateNeighbors").getAsBoolean();
            var prepared = target.prepare(requested, op.equals("undo") ? new JsonObject() : request);
            if(target.block != null && !op.equals("undo")) nextState=BlockViews.contentState(target.block,before,prepared,nextState,target.level.registryAccess());
            WorldNbt.protect(before, prepared, target.entity != null);
            target.checkCommandPrivileges(player,prepared);
            // Loaders that silently ignore unknown/invalid values must not report a successful edit.
            if (target.entity == null || !request.has("entity") || op.equals("undo")) WorldNbt.requireEditedFieldsRetained(before,requested,prepared);
            if (prepared.toString().length() > WorldNbt.MAX_SNBT) EditorSessions.fail("payload_too_large", "修改后的 NBT 超出上限");
            var preview = result("saved",id); preview.add("world",target.preview(prepared,state.slot,!op.equals("undo"),nextState)); checkSize(preview);
            try { target.write(prepared,nextState,updateNeighbors); }
            catch (RuntimeException failure) { try { target.write(before,beforeState,false); } catch (RuntimeException rollback) { failure.addSuppressed(rollback); LOG.error("World edit rollback failed player={} slot={}", player.getUUID(), slot, rollback); } throw failure; }
            state.saved(beforeSession,target.sessionData(),op.equals("undo"));
            LOG.info("[CAD-Editor-World] audit player={} op={} target={} before={} after={}", player.getUUID(), op, slot, WorldNbt.revision(beforeSession), WorldNbt.revision(state.baseline));
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
