package dev.rinorsi.editor.world;

import dev.rinorsi.editor.platform.Platform;
import com.google.gson.*;
import dev.rinorsi.editor.*;
import java.util.function.Supplier;
import net.minecraft.server.level.ServerPlayer;
import org.slf4j.LoggerFactory;

/** Additive router on the existing request/reply packet; all mutation runs on server thread. */
public final class WorldEditor {
    private static final WorldEditSessions SESSIONS = new WorldEditSessions();
    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger("WorldEditor");
    private WorldEditor() {}
    public static void initialize() {
        Platform.get().onDisconnect(player -> PlayerExtendedEditor.remove(player.getUUID()));
        Platform.get().onServerStopped(server -> PlayerExtendedEditor.clear());
        Platform.get().onServerStarting(server -> PlayerExtendedEditor.clear());
        Platform.get().onDisconnect(player -> SESSIONS.remove(player.getUUID()));
        Platform.get().onServerStopped(server -> SESSIONS.clear());
        Platform.get().onServerStarting(server -> SESSIONS.clear());
    }
    public static boolean route(ServerPlayer player, JsonObject request, Supplier<EditorPolicy> policy) {
        return route(player,request,policy,reply->send(player,reply));
    }
    /** Same authoritative route with a transport sink for dedicated-server protocol probes. */
    public static boolean route(ServerPlayer player, JsonObject request, Supplier<EditorPolicy> policy,java.util.function.Consumer<JsonObject> replySink) {
        if (PlayerExtendedEditor.route(player,request,policy,replySink)) return true;
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
            if(op.equals("apply")||op.equals("undo"))SESSIONS.requireDoubleChestPresent(player.getUUID(),slot,player.level());
            var target = WorldTarget.resolve(player, slot);
            try { policy.get().require(player); } catch (RuntimeException e) { EditorSessions.fail("not_allowed", e.getMessage()); }
            if (op.equals("open")) {
                SESSIONS.rateLimit(player.getUUID());
                var canonical = target.canonicalSlot(); if(target.entity instanceof ServerPlayer){canonical.addProperty("self",target.entity==player);canonical.addProperty("player",target.entity==player?"self":"online");} var current = target.sessionData();
                var snapshot = target.snapshot(canonical, false,current); // size checked before replacing session
                var reply = result("opened", id); reply.add("world", snapshot); checkSize(reply);
                var opened=SESSIONS.open(player.getUUID(), canonical, current);snapshot.addProperty("revision",opened.revision);replySink.accept(reply); return true;
            }
            if (!op.equals("apply") && !op.equals("undo")) EditorSessions.fail("invalid_request", "未知世界编辑操作");
            if(target.entity instanceof ServerPlayer && (request.has("snbt")||request.has("container")||request.has("views")||request.has("block_state")||request.has("block_type")||request.has("riding")))
                EditorSessions.fail("protected_field","玩家仅支持 entity.player 规范化编辑，不能写入原始NBT、方块字段或骑乘关系");
            SESSIONS.rateLimit(player.getUUID());
            var beforeSession = target.sessionData(); var before = target.entity!=null?EntitySessionData.data(beforeSession):BlockSessionData.data(beforeSession);
            var state = SESSIONS.require(player.getUUID(), slot, StackCodec.string(request, "revision"), beforeSession);
            if (request.has("vault_template")) request = dev.rinorsi.editor.vault.VaultTemplateApply.expand(target, state, request);
            if(target.entity instanceof ServerPlayer && request.has("riding"))EditorSessions.fail("protected_field","玩家不支持 riding 编辑");
            if (request.has("riding")) {
                if (target.entity == null || !op.equals("apply") || request.has("snbt") || request.has("entity") || request.has("container") || request.has("views") || request.has("block_state") || request.has("block_type"))
                    EditorSessions.fail("invalid_request","riding 必须单独提交为实体 apply");
                final String replyId=id;
                EntityRiding.apply(player,target.entity,StackCodec.object(request,"riding"),passenger->{
                    var preview=result("saved",replyId);preview.add("world",EntityRiding.previewAddition(target.snapshot(state.slot,false),passenger,target.level.registryAccess()));checkSize(preview);
                });
                var after=target.sessionData();var world=target.snapshot(state.slot,false,after);var reply=result("saved",id);reply.add("world",world);checkSize(reply);
                state.saved(beforeSession,after,true);world.addProperty("revision",state.revision);
                LOG.info("[CAD-Editor-World] audit player={} op=riding target={} before={} after={}",player.getUUID(),slot,WorldNbt.revision(beforeSession),WorldNbt.revision(state.baseline));
                replySink.accept(reply);return true;
            }
            if (target.entity == null && request.has("entity")) EditorSessions.fail("invalid_request","方块不接受实体编辑区段");
            if(target.entity!=null&&(request.has("block_state")||request.has("views")||request.has("container")||request.has("block_type")))EditorSessions.fail("invalid_request","实体不接受方块字段");
            if(request.has("updateNeighbors")&&(!request.get("updateNeighbors").isJsonPrimitive()||!request.getAsJsonPrimitive("updateNeighbors").isBoolean()))EditorSessions.fail("invalid_request","updateNeighbors 必须为布尔值");
            boolean updateNeighbors=!request.has("updateNeighbors")||request.get("updateNeighbors").getAsBoolean();
            var plan=WorldMergePlan.prepare(target,state.baseline,op.equals("undo")?state.preimage():null,request);
            var prepared=plan.nbt();
            WorldNbt.protect(before, prepared, target.entity != null);
            target.checkCommandPrivileges(player,prepared);
            // Loaders that silently ignore unknown/invalid values must not report a successful edit.
            if (prepared.toString().length() > WorldNbt.MAX_SNBT) EditorSessions.fail("payload_too_large", "修改后的 NBT 超出上限");
            var preview = result("saved",id); preview.add("world",DoubleChestEdit.preview(target,plan,state.slot,!op.equals("undo"))); checkSize(preview);
            final String replyId=id;final boolean undoing=op.equals("undo");
            var capturedAfter=new net.minecraft.nbt.CompoundTag[1];var capturedReply=new JsonObject[1];var capturedWorld=new JsonObject[1];
            DoubleChestEdit.write(target,plan,updateNeighbors,()->{
                capturedAfter[0]=target.sessionData();capturedWorld[0]=target.snapshot(state.slot,!undoing,capturedAfter[0]);capturedReply[0]=result("saved",replyId);capturedReply[0].add("world",capturedWorld[0]);checkSize(capturedReply[0]);
            });
            var after=capturedAfter[0];var world=capturedWorld[0];var reply=capturedReply[0];
            state.saved(beforeSession,after,op.equals("undo"));world.addProperty("revision",state.revision);
            LOG.info("[CAD-Editor-World] audit player={} op={} target={} before={} after={}", player.getUUID(), op, slot, WorldNbt.revision(beforeSession), WorldNbt.revision(state.baseline));
            replySink.accept(reply);
        } catch (RuntimeException e) {
            String code = e instanceof WorldEditError error?error.code:e instanceof WorldMerge.Conflict ? "target_changed" : e instanceof EditorSessions.Failure f ? f.code : e instanceof dev.rinorsi.editor.vault.VaultStore.Failure f ? f.code : "invalid_request";
            LOG.warn("[CAD-Editor-World] denied player={} op={} request={} code={} target={} reason={}", player.getUUID(), op, id, code, slot, e.getMessage());
            var reply = result("rejected", id); reply.addProperty("code", code); String reason = e.getMessage() == null ? "世界编辑失败" : e.getMessage();
            reply.addProperty("reason", reason.substring(0, Math.min(1200, reason.length())));WorldEditError.annotate(reply,e);replySink.accept(reply);
        }
        return true;
    }
    private static JsonObject result(String status, String id) { var r = new JsonObject(); r.addProperty("status", status); r.addProperty("requestId", id); return r; }
    private static void checkSize(JsonObject json) { WorldWire.encode(json); }
    private static void send(ServerPlayer player, JsonObject reply) { Platform.get().send(player, new EditorPackets.Reply(WorldWire.encode(reply))); }
}
