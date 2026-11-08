package dev.rinorsi.editor.client;

import com.google.gson.*;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import dev.oriel.mod.client.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.WorldEditSessions;
import java.util.UUID;
import net.fabricmc.fabric.api.client.command.v2.*;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.networking.v1.*;
import net.minecraft.client.*;
import net.minecraft.world.phys.*;

/** Host binds immutable target/revision; page only supplies editable data. */
public final class WorldEditorClient {
    private static OrielScreen screen;
    private static JsonObject slot;
    private static String revision, opening, pending, queued;
    private static JsonObject queuedPos;
    private static long deadline;
    private WorldEditorClient() {}
    private static com.mojang.brigadier.builder.LiteralArgumentBuilder<FabricClientCommandSource> literal(String name) { return com.mojang.brigadier.builder.LiteralArgumentBuilder.literal(name); }
    private static <T> com.mojang.brigadier.builder.RequiredArgumentBuilder<FabricClientCommandSource,T> argument(String name, com.mojang.brigadier.arguments.ArgumentType<T> type) { return com.mojang.brigadier.builder.RequiredArgumentBuilder.argument(name,type); }
    public static boolean active() { return screen != null || opening != null; }
    public static void initialize() {
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registry) -> {
            var block = literal("block").executes(c -> queue("block", null));
            block.then(argument("x", IntegerArgumentType.integer(-30000000,30000000)).then(argument("y", IntegerArgumentType.integer()).then(argument("z", IntegerArgumentType.integer(-30000000,30000000)).executes(c -> {
                var pos = new JsonObject(); for (String axis : new String[]{"x","y","z"}) pos.addProperty(axis, IntegerArgumentType.getInteger(c, axis)); return queue("block", pos);
            }))));
            var player=literal("player").executes(c->queue("player",null));
            player.then(argument("name",com.mojang.brigadier.arguments.StringArgumentType.word()).executes(c->{var name=new JsonObject();name.addProperty("name",com.mojang.brigadier.arguments.StringArgumentType.getString(c,"name"));return queue("player",name);}));
            dispatcher.register(literal("cadeditor").then(block).then(literal("entity").executes(c -> queue("entity", null))).then(player));
        });
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if (queued != null) { String kind = queued; var pos = queuedPos; queued = null; queuedPos = null; open(kind, pos); }
            if ((opening != null || pending != null) && System.nanoTime() > deadline) {
                String id = pending != null ? pending : opening; opening = null; pending = null;
                reject(id, "request_timeout", "服务器未确认世界编辑结果；保留草稿，请重新读取目标核对");
            }
        });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> { screen = null; slot = null; revision = null; opening = null; pending = null; queued = null; });
    }
    private static int queue(String kind, JsonObject pos) { queued = kind; queuedPos = pos; return 1; }
    public static void openSelf(){queue("player",null);}
    public static void openTarget(boolean entity){queue(entity?"entity":"block",null);}
    private static HitResult editorHit(Minecraft mc) {
        if (mc.player == null || mc.level == null || mc.hitResult instanceof EntityHitResult) return mc.hitResult;
        // These editable entities deliberately do not participate in vanilla attack picking.
        // Keep vanilla hits untouched; only the editor gets an additional, occluded ray query.
        var eye = mc.player.getEyePosition();
        double reach = mc.player.entityInteractionRange();
        var end = eye.add(mc.player.getViewVector(1).scale(reach));
        double nearest = reach * reach;
        if (mc.hitResult != null && mc.hitResult.getType() != HitResult.Type.MISS)
            nearest = Math.min(nearest, eye.distanceToSqr(mc.hitResult.getLocation()));
        HitResult selected = mc.hitResult;
        for (var entity : mc.level.getEntities(mc.player, new AABB(eye, end).inflate(1), e -> e.isAlive()
                && (e instanceof net.minecraft.world.entity.item.ItemEntity
                || e instanceof net.minecraft.world.entity.ExperienceOrb
                || e instanceof net.minecraft.world.entity.AreaEffectCloud
                || e instanceof net.minecraft.world.entity.projectile.arrow.AbstractArrow))) {
            var box = entity.getBoundingBox();
            var point = box.contains(eye) ? java.util.Optional.of(eye) : box.clip(eye, end);
            if (point.isPresent() && eye.distanceToSqr(point.get()) < nearest
                    && mc.player.isWithinEntityInteractionRange(entity, 0)) {
                nearest = eye.distanceToSqr(point.get());
                selected = new EntityHitResult(entity, point.get());
            }
        }
        return selected;
    }
    public static EditDispatch.Hit hit(){
        var mc=Minecraft.getInstance();if(mc.player==null||mc.level==null)return EditDispatch.Hit.NONE;
        var picked=editorHit(mc);
        if(picked instanceof EntityHitResult e)return mc.player.isWithinEntityInteractionRange(e.getEntity(),0)?EditDispatch.Hit.ENTITY:EditDispatch.Hit.NONE;
        if(mc.hitResult instanceof BlockHitResult b&&b.getType()!=HitResult.Type.MISS&&mc.player.isWithinBlockInteractionRange(b.getBlockPos(),0)){
            var state=mc.level.getBlockState(b.getBlockPos());if(state.hasBlockEntity())return EditDispatch.Hit.BLOCK_ENTITY;if(!state.getProperties().isEmpty())return EditDispatch.Hit.BLOCK_STATE;
        }return EditDispatch.Hit.NONE;
    }
    private static void open(String kind, JsonObject pos) {
        var mc = Minecraft.getInstance(); if (mc.player == null || mc.level == null || active() || mc.screen instanceof OrielScreen) return;
        try {
            if (!ClientPlayNetworking.canSend(EditorPackets.Request.TYPE)) throw new EditorSessions.Failure("UNAVAILABLE", "服务器未安装物品工坊，无法读取或修改世界目标");
            var target = new JsonObject(); target.addProperty("dim", mc.level.dimension().identifier().toString());
            var picked = editorHit(mc);
            if (kind.equals("crosshair")) kind = picked instanceof EntityHitResult ? "entity" : "block";
            target.addProperty("kind", kind.equals("player")?"entity":kind);
            if(kind.equals("player")){target.addProperty("player",pos!=null?"name":"self");if(pos!=null)target.add("name",pos.get("name"));}
            else if (kind.equals("block")) {
                if (pos != null) for (var entry : pos.entrySet()) target.add(entry.getKey(), entry.getValue());
                else {
                    if (!(mc.hitResult instanceof BlockHitResult hit) || hit.getType() == HitResult.Type.MISS) throw new IllegalArgumentException("请将准星对准已放置的方块");
                    var p = hit.getBlockPos(); target.addProperty("x",p.getX()); target.addProperty("y",p.getY()); target.addProperty("z",p.getZ());
                }
            } else {
                if (!(picked instanceof EntityHitResult hit)) throw new IllegalArgumentException("请将准星对准实体或玩家");
                target.addProperty("uuid", hit.getEntity().getStringUUID()); target.addProperty("id", hit.getEntity().getId());
                if(hit.getEntity() instanceof net.minecraft.world.entity.player.Player)target.addProperty("player","online");
            }
            opening = "world-open-" + UUID.randomUUID(); deadline = System.nanoTime() + 10_000_000_000L;
            var request = request("open", opening); request.add("slot", target); send(request);
        } catch (RuntimeException e) { opening = null; message((e instanceof EditorSessions.Failure f ? f.code + "：" : "") + e.getMessage()); }
    }
    public static boolean receive(JsonObject result) {
        String id = result.has("requestId") ? result.get("requestId").getAsString() : "";
        if (opening != null && opening.equals(id)) {
            opening = null;
            if (!result.get("status").getAsString().equals("opened")) { message(result.get("reason").getAsString()); return true; }
            show(result.getAsJsonObject("world")); return true;
        }
        if (pending == null || !pending.equals(id)) return false;
        if(result.get("status").getAsString().equals("saved"))revision=result.getAsJsonObject("world").get("revision").getAsString();
        pending = null;
        if (screen != null) {
            if (result.get("status").getAsString().equals("saved")) {
                var world = result.getAsJsonObject("world"); screen.driver().patch("world", world);
            }
            screen.driver().patch("result", result);
        }
        return true;
    }
    private static void show(JsonObject world) {
        slot = world.getAsJsonObject("slot").deepCopy(); revision = world.get("revision").getAsString();
        var data = new JsonObject(); data.add("world", world); data.add("prefs", EditorPrefs.read()); data.addProperty("hostPrefs",true);
        screen = OrielScreens.open("cadeditor:ui/index.html", data); var owner = screen;
        dev.rinorsi.editor.registry.RegistryBridge.attach(owner.driver());
        owner.driver().onMessage("apply", value -> Minecraft.getInstance().execute(() -> apply(owner, value, false)));
        owner.driver().onMessage("undo", value -> Minecraft.getInstance().execute(() -> apply(owner, value, true)));
        owner.driver().onMessage("prefs", EditorPrefs::accept);
        owner.driver().onClose(() -> {
            if (screen != owner) return;
            if (Minecraft.getInstance().getConnection() != null && slot != null) { var close = request("close", "world-close-" + UUID.randomUUID()); close.add("slot",slot); send(close); }
            screen = null; slot = null; revision=null; pending = null;
        });
    }
    private static void apply(OrielScreen owner, JsonElement value, boolean undo) {
        if (screen != owner) return; String id = "";boolean reserved=false;
        try {
            var edit = value.getAsJsonObject(); id = StackCodec.string(edit,"requestId");
            if (pending != null) throw new IllegalArgumentException("上一笔世界编辑尚未收到回执");
            if (!WorldEditSessions.sameTarget(slot, StackCodec.object(edit,"slot"))) throw new IllegalArgumentException("页面目标与打开时不一致");
            var request = edit.deepCopy(); request.addProperty("op", undo ? "undo" : "apply"); request.add("slot",slot.deepCopy()); request.addProperty("revision",revision);
            pending = id;reserved=true;deadline = System.nanoTime() + 10_000_000_000L;send(request);
        } catch (RuntimeException e) {if(reserved&&id.equals(pending))pending=null;reject(id, "invalid_request",e.getMessage()); }
    }
    private static JsonObject request(String op, String id) { var r = new JsonObject(); r.addProperty("op",op); r.addProperty("requestId",id); return r; }
    private static void send(JsonObject request) { ClientPlayNetworking.send(new EditorPackets.Request(dev.rinorsi.editor.world.WorldWire.encode(request))); }
    private static void reject(String id, String code, String reason) { var r = request("result",id); r.addProperty("status","rejected"); r.addProperty("code",code); r.addProperty("reason",reason); if (screen != null) screen.driver().patch("result",r); else message(reason); }
    private static void message(String reason) { EditorToast.show(EditorToast.Level.ERROR, reason); }
}
