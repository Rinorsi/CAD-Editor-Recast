package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.platform.ClientPlatform;
import com.google.gson.*;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import dev.oriel.mod.client.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.WorldEditSessions;
import java.util.UUID;
import net.minecraft.client.*;
import net.minecraft.world.phys.*;

/** Host binds immutable target/revision; page only supplies editable data. */
public final class WorldEditorClient {
    private static OrielScreen screen;
    private static WorldPageTarget.Binding binding;
    private static dev.rinorsi.editor.vault.PlayerPresetPage presetPage;
    private static OrielScreen openingOwner;
    private static JsonObject openingPreset;
    private static final java.util.Set<String> abandonedOpens=new java.util.LinkedHashSet<>();
    private static String opening, pending, queued;
    private static JsonObject queuedPos;
    private static long deadline;
    private static SelfPlayerCommands selfCommands;
    private static boolean selfDocumentNotified;
    private WorldEditorClient() {}
    private static com.mojang.brigadier.builder.LiteralArgumentBuilder<Object> literal(String name) { return com.mojang.brigadier.builder.LiteralArgumentBuilder.literal(name); }
    private static <T> com.mojang.brigadier.builder.RequiredArgumentBuilder<Object,T> argument(String name, com.mojang.brigadier.arguments.ArgumentType<T> type) { return com.mojang.brigadier.builder.RequiredArgumentBuilder.argument(name,type); }
    public static boolean active() { return screen != null || opening != null; }
    static boolean switching(){return opening!=null&&openingOwner!=null;}
    public static void initialize() {
        ClientPlatform.get().onCommands(dispatcher -> {
            var block = literal("block").executes(c -> queue("block", null));
            block.then(argument("x", IntegerArgumentType.integer(-30000000,30000000)).then(argument("y", IntegerArgumentType.integer()).then(argument("z", IntegerArgumentType.integer(-30000000,30000000)).executes(c -> {
                var pos = new JsonObject(); for (String axis : new String[]{"x","y","z"}) pos.addProperty(axis, IntegerArgumentType.getInteger(c, axis)); return queue("block", pos);
            }))));
            var player=literal("player").executes(c->queue("player",null));
            player.then(argument("name",com.mojang.brigadier.arguments.StringArgumentType.word()).executes(c->{var name=new JsonObject();name.addProperty("name",com.mojang.brigadier.arguments.StringArgumentType.getString(c,"name"));return queue("player",name);}));
            dispatcher.register(literal("cadeditor").then(block).then(literal("entity").executes(c -> queue("entity", null))).then(player));
        });
        ClientPlatform.get().onTick(mc -> {
            if(selfCommands!=null&&selfDocumentCurrent())selfCommands.tick(mc);
            PlayerExtendedClient.tick();
            if (queued != null) { String kind = queued; var pos = queuedPos; queued = null; queuedPos = null; open(kind, pos); }
            if ((opening != null || pending != null) && System.nanoTime() > deadline) {
                if(opening!=null)abandon(opening);
                var owner=openingOwner;
                String id = pending != null ? pending : opening; opening = null; pending = null;
                EditorWriteLog.warning("client.world.timeout",id,"outcome=unknown permission_denial_not_proven=true reason=no_matching_receipt");
                openingOwner=null;openingPreset=null;
                if(owner!=null)EditorPageHost.notice(owner,EditorI18n.tr("cadeditor.message.worldeditorclient.588122d05d"));
                else reject(id, "request_timeout", EditorI18n.tr("cadeditor.message.worldeditorclient.af595b7eb2"));
            }
        });
        ClientPlatform.get().onDisconnect(mc -> { if(selfCommands!=null)selfCommands.cancel();selfCommands=null; PlayerExtendedClient.clear(); screen = null; binding = null; presetPage=null; opening = null; openingOwner=null; openingPreset=null; abandonedOpens.clear(); pending = null; queued = null; queuedPos=null; });
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
        var mc = Minecraft.getInstance(); if (mc.player == null || mc.level == null || active() || mc.gui.screen() instanceof OrielScreen) return;
        try {
            if (!ClientPlatform.get().canSend(EditorPackets.Request.TYPE)) {
                if(kind.equals("player")&&pos==null){openCommandSelf(mc,null);return;}
                throw new EditorSessions.Failure("UNAVAILABLE", EditorI18n.tr("cadeditor.message.worldeditorclient.6ddbd7ca26"));
            }
            var target = new JsonObject(); target.addProperty("dim", mc.level.dimension().identifier().toString());
            var picked = editorHit(mc);
            if (kind.equals("crosshair")) kind = picked instanceof EntityHitResult ? "entity" : "block";
            target.addProperty("kind", kind.equals("player")?"entity":kind);
            if(kind.equals("player")){target.addProperty("player",pos!=null?"name":"self");if(pos!=null)target.add("name",pos.get("name"));}
            else if (kind.equals("block")) {
                if (pos != null) for (var entry : pos.entrySet()) target.add(entry.getKey(), entry.getValue());
                else {
                    if (!(mc.hitResult instanceof BlockHitResult hit) || hit.getType() == HitResult.Type.MISS) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.ce682d6607"));
                    var p = hit.getBlockPos(); target.addProperty("x",p.getX()); target.addProperty("y",p.getY()); target.addProperty("z",p.getZ());
                }
            } else {
                if (!(picked instanceof EntityHitResult hit)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.8ccb5b3ed7"));
                target.addProperty("uuid", hit.getEntity().getStringUUID()); target.addProperty("id", hit.getEntity().getId());
                if(hit.getEntity() instanceof net.minecraft.world.entity.player.Player)target.addProperty("player","online");
            }
            beginOpen(target,null);
        } catch (RuntimeException e) { EditorWriteLog.failure("client.world.open_failure",opening,"kind="+kind,e);opening = null; openingOwner=null; message((e instanceof EditorSessions.Failure f ? f.code + "：" : "") + e.getMessage()); }
    }
    private static void beginOpen(JsonObject target,OrielScreen owner){
        beginOpen(target,owner,null);
    }
    private static void beginOpen(JsonObject target,OrielScreen owner,JsonObject preset){
        openingPreset=preset;
        opening="world-open-"+UUID.randomUUID();openingOwner=owner;deadline=System.nanoTime()+10_000_000_000L;
        var request=request("open",opening);request.add("slot",target);
        try{send(request);}catch(RuntimeException e){abandon(opening);opening=null;openingOwner=null;openingPreset=null;throw e;}
    }
    private static void openCommandSelf(Minecraft mc,OrielScreen owner){
        var commands=new SelfPlayerCommands(mc);var world=commands.world(mc);
        if(screen!=owner||owner==null)show(world);
        else{presetPage=null;binding=WorldPageTarget.Binding.opened(world);owner.driver().patch("world",world);PlayerExtendedClient.resetViews();}
        if(selfCommands!=null)selfCommands.cancel();selfCommands=commands;
        var pageOwner=screen;commands.bindDocument(()->screen==pageOwner?pageOwner.driver().document():null);
        selfDocumentNotified=false;
    }
    private static boolean selfDocumentCurrent(){
        if(selfCommands==null||selfCommands.documentCurrent())return true;
        if(!selfCommands.documentStale())return false; // initial asynchronous Document load
        pending=null;binding=null;
        if(!selfDocumentNotified&&screen!=null&&screen.driver().document()!=null){
            selfDocumentNotified=true;EditorPageHost.notice(screen,selfCommands.documentReason());
        }
        return false;
    }
    private static void abandon(String id){abandonedOpens.add(id);while(abandonedOpens.size()>32)abandonedOpens.remove(abandonedOpens.iterator().next());}
    public static void attachNavigation(DocumentDriver driver){
        driver.onMessage("open_world",value->Minecraft.getInstance().schedule(()->{
            if(Minecraft.getInstance().gui.screen() instanceof OrielScreen owner&&owner.driver()==driver)openFromPage(owner,value);
        }));
    }
    private static void openFromPage(OrielScreen owner,JsonElement value){
        if(Minecraft.getInstance().gui.screen()!=owner)return;
        try{
            var mc=Minecraft.getInstance();if(mc.player==null||mc.level==null)throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.b889ddd197"));
            if(opening!=null||pending!=null||PlayerExtendedClient.busy())throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.065dc65a1e"));
            var selector=value.getAsJsonObject();
            if(selector.size()==1&&selector.has("apply_preset")){
                if(!ClientPlatform.get().canSend(EditorPackets.Request.TYPE))throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.f95bcddda9"));
                var source=dev.rinorsi.editor.registry.VaultChannel.openPlayerPreset(StackCodec.string(selector,"apply_preset")).world();
                var entry=new JsonObject();entry.add("id",source.getAsJsonObject("player").get("vault_id"));entry.add("name",source.getAsJsonObject("player").get("name"));entry.add("sections",source.getAsJsonObject("player").get("sections"));
                var self=new JsonObject();self.addProperty("self",true);
                beginOpen(WorldPageTarget.playerSlot(self,mc.level.dimension().identifier().toString()),owner,entry);return;
            }
            if(selector.size()==1&&selector.has("vault_id")){
                var page=dev.rinorsi.editor.registry.VaultChannel.openPlayerPreset(StackCodec.string(selector,"vault_id"));var world=page.world();
                if(presetPage==null&&binding!=null)closeTarget(binding.slot());
                if(selfCommands!=null)selfCommands.cancel();selfCommands=null;
                if(screen!=owner){show(world);presetPage=page;}else{presetPage=page;binding=WorldPageTarget.Binding.opened(world);owner.driver().patch("world",world);}
                queued=null;queuedPos=null;PlayerExtendedClient.resetViews();return;
            }
            if(!ClientPlatform.get().canSend(EditorPackets.Request.TYPE)){
                var target=WorldPageTarget.playerSlot(selector,mc.level.dimension().identifier().toString());
                if("self".equals(StackCodec.string(target,"player"))){openCommandSelf(mc,owner);return;}
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.6ddbd7ca26"));
            }
            beginOpen(WorldPageTarget.playerSlot(value.getAsJsonObject(),mc.level.dimension().identifier().toString()),owner);
        }catch(RuntimeException e){EditorWriteLog.failure("client.world.navigation_failure",opening,"phase=open_from_page",e);EditorPageHost.notice(owner,EditorI18n.tr("cadeditor.message.worldeditorclient.4b0fba67d8", (e.getMessage())));}
    }
    private static void closeTarget(JsonObject target){if(Minecraft.getInstance().getConnection()!=null&&ClientPlatform.get().canSend(EditorPackets.Request.TYPE)){var close=request("close","world-close-"+UUID.randomUUID());close.add("slot",target);send(close);}}
    public static boolean receive(JsonObject result) {
        if(selfCommands!=null&&presetPage==null&&!selfDocumentCurrent())return true;
        if (PlayerExtendedClient.receive(result)) return true;
        String id = result.has("requestId") ? result.get("requestId").getAsString() : "";
        if(abandonedOpens.remove(id)){if("opened".equals(result.get("status").getAsString()))closeTarget(result.getAsJsonObject("world").getAsJsonObject("slot"));return true;}
        if (opening != null && opening.equals(id)) {
            var owner=openingOwner;var preset=openingPreset;opening = null;openingOwner=null;openingPreset=null;
            if (!result.get("status").getAsString().equals("opened")) {
                EditorWriteLog.warning("client.world.open_rejected",id,"code="+result.get("code")+" reason="+result.get("reason"));
                if(owner!=null)EditorPageHost.notice(owner,result.get("reason").getAsString());
                else message(result.get("reason").getAsString());
                return true;
            }
            var world=result.getAsJsonObject("world");
            if(preset!=null)world.add("vault_apply",preset);
            if(owner!=null){
                if(screen!=owner){if(Minecraft.getInstance().gui.screen()==owner)show(world);else closeTarget(world.getAsJsonObject("slot"));return true;}
                if(selfCommands!=null)selfCommands.cancel();selfCommands=null;
                presetPage=null;binding=WorldPageTarget.Binding.opened(world);pending=null;queued=null;queuedPos=null;PlayerExtendedClient.resetViews();
                owner.driver().patch("world",world);
            }else show(world);
            return true;
        }
        if (pending == null || !pending.equals(id)) return false;
        String resultContext="status="+result.get("status")+" code="+result.get("code")+" reason="+result.get("reason");
        if("saved".equals(result.get("status").getAsString()))EditorWriteLog.event("client.world.result",id,resultContext);
        else EditorWriteLog.warning("client.world.result",id,resultContext);
        if(result.get("status").getAsString().equals("saved"))binding=WorldPageTarget.Binding.opened(result.getAsJsonObject("world"));
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
        if(selfCommands!=null)selfCommands.cancel();selfCommands=null;
        presetPage=null;
        binding=WorldPageTarget.Binding.opened(world);
        var data = new JsonObject(); data.add("world", world); data.add("prefs", EditorPrefs.read());
        screen = EditorPageHost.open("cadeditor:ui/index.html", data); var owner = screen;
        PlayerExtendedClient.attach(owner);
        owner.driver().onMessage("apply", value -> Minecraft.getInstance().execute(() -> apply(owner, value, false)));
        owner.driver().onMessage("undo", value -> Minecraft.getInstance().execute(() -> apply(owner, value, true)));
        owner.driver().onClose(() -> {
            if (screen != owner) return;
            try{if(binding!=null&&presetPage==null)closeTarget(binding.slot());}finally{if(selfCommands!=null)selfCommands.cancel();selfCommands=null;screen=null;binding=null;presetPage=null;pending=null;openingPreset=null;}
        });
    }
    private static void apply(OrielScreen owner, JsonElement value, boolean undo) {
        if (screen != owner) {EditorWriteLog.warning("client.world.apply_stale_page",null,"write_sent=false reason=page_owner_changed");return;} String id = "";boolean reserved=false;
        try {
            var edit = value.getAsJsonObject(); id = StackCodec.string(edit,"requestId");
            EditorWriteLog.event("client.world.apply",id,"backend="+(presetPage!=null?"local_preset":selfCommands!=null?"vanilla_self":"editor_server")+" undo="+undo+" pending="+(pending!=null)+" binding="+(binding!=null));
            if(selfCommands!=null&&presetPage==null&&!selfDocumentCurrent())throw new IllegalArgumentException(selfCommands.documentReason());
            if (pending != null||opening!=null) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.f6db18f2e1"));
            if(binding==null)throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldeditorclient.3d821ba61b"));
            var request=binding.bind(edit,undo);
            pending = id;reserved=true;deadline = System.nanoTime() + 10_000_000_000L;
            if(presetPage!=null)receive(presetPage.apply(request));else if(selfCommands!=null)selfCommands.apply(Minecraft.getInstance(),request,WorldEditorClient::receive);else send(request);
        } catch (RuntimeException e) {EditorWriteLog.failure("client.world.apply_failure",id,"reserved="+reserved+" backend="+(selfCommands!=null?"vanilla_self":"other"),e);if(reserved&&id.equals(pending)){pending=null;if(selfCommands!=null)selfCommands.cancel();}reject(id,e instanceof EditorSessions.Failure f?f.code:e instanceof dev.rinorsi.editor.vault.VaultStore.Failure f?f.code:"invalid_request",EditorI18n.tr("cadeditor.message.worldeditorclient.53656e74f1", (e.getMessage()))); }
    }
    private static JsonObject request(String op, String id) { var r = new JsonObject(); r.addProperty("op",op); r.addProperty("requestId",id); return r; }
    private static void send(JsonObject request) { ClientPlatform.get().send(new EditorPackets.Request(dev.rinorsi.editor.world.WorldWire.encode(request))); }
    private static void reject(String id, String code, String reason) { EditorWriteLog.warning("client.world.rejected",id,"code="+code+" reason="+reason);var r = request("result",id); r.addProperty("status","rejected"); r.addProperty("code",code); r.addProperty("reason",reason); if (screen != null) screen.driver().patch("result",r); else message(reason); }
    private static void message(String reason) { EditorToast.show(EditorToast.Level.ERROR, reason); }
}
