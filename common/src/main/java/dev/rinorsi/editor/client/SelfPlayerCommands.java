package dev.rinorsi.editor.client;

import com.google.gson.*;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.EditorWriteLog;
import dev.rinorsi.editor.world.PlayerWorldEdit;
import java.util.*;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.GameType;

/** Vanilla self-only fallback. No Player NBT writes, optimistic client mutations or retries. */
final class SelfPlayerCommands {
    private final Object connection, player, level;
    private final JsonObject slot;
    private JsonObject baseline;
    private String operation;
    private long deadline;
    private Consumer<JsonObject> completion;
    private boolean sent;
    private int queries, replies;
    private String permissionContext = "";
    private Runnable nextStep;
    private Runnable readback;
    private long readbackAt;
    private java.util.function.Supplier<Object> currentDocument;
    private DocumentBinding documentBinding;

    /** A reload permanently retires this session, even if an old Document reappears. */
    static final class DocumentBinding {
        private Object document;
        private boolean stale;
        DocumentBinding(Object document){this.document=document;}
        boolean accept(Object current){
            if(stale)return false;
            if(document==null){document=current;return current!=null;}
            if(document!=current)stale=true;
            return !stale;
        }
    }
    void bindDocument(java.util.function.Supplier<Object> current){
        if(documentBinding!=null)throw new IllegalStateException("自身命令会话不能迁移到其他页面");
        currentDocument=current;documentBinding=new DocumentBinding(current.get());
    }
    boolean documentCurrent(){
        if(documentBinding!=null&&documentBinding.accept(currentDocument.get()))return true;
        cancel();return false;
    }
    boolean documentStale(){return documentBinding!=null&&documentBinding.stale;}
    String documentReason(){return sent?"页面已重载，命令已发送，结果未知；旧回读已废弃。请关闭后重新读取自身玩家核对，不能继续提交此页":"页面已重载，旧查询已停止，未发送修改。请关闭后重新读取自身玩家，不能继续提交此页";}

    SelfPlayerCommands(Minecraft mc) {
        connection=mc.getConnection(); player=mc.player; level=mc.level;
        slot=new JsonObject(); slot.addProperty("kind","entity");
        slot.addProperty("player","self"); slot.addProperty("uuid",mc.player.getStringUUID());
        slot.addProperty("id",mc.player.getId()); slot.addProperty("dim",mc.level.dimension().identifier().toString());
        slot.addProperty("token",UUID.randomUUID().toString());
    }
    private boolean connected(Minecraft mc) { return mc.getConnection()==connection && mc.player==player && mc.level==level; }
    static boolean command(Minecraft mc,String... path) {
        if(mc.getConnection()==null)return false;
        com.mojang.brigadier.tree.CommandNode<?> node=mc.getConnection().getCommands().getRoot();
        for(String name:path){node=node.getChild(name);if(node==null)return false;}
        return true;
    }
    private static boolean queryAvailable(Minecraft mc) { return command(mc,"data","get","entity"); }
    private static String permissions(Minecraft mc) {
        return "backend=vanilla_self target=self connected="+(mc.getConnection()!=null)
                +" data_get_entity_visible="+queryAvailable(mc)
                +" gamemode_visible="+command(mc,"gamemode")
                +" experience_set_visible="+command(mc,"experience","set")
                +" teleport_visible="+command(mc,"teleport")
                +" attribute_visible="+command(mc,"attribute")
                +" advertised_gamemaster="+(mc.player!=null&&mc.player.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER))
                +" command_tree_is_hint=true";
    }
    private void log(String stage,String detail) {
        EditorWriteLog.event("client.self."+stage,operation,"sent="+sent+" queries="+queries+" replies="+replies+" "+detail);
    }
    private void logFailure(String stage,RuntimeException error) {
        EditorWriteLog.failure("client.self."+stage,operation,"sent="+sent+" queries="+queries+" replies="+replies+" "+permissionContext,error);
    }
    JsonObject world(Minecraft mc) {
        var snapshot=PlayerWorldEdit.values(mc.player);
        // Ender inventory and entity tags are not authoritative client snapshots.
        snapshot.remove("ender"); snapshot.remove("Tags"); snapshot.remove("CustomName");
        snapshot.remove("active_effects");
        var schema=PlayerWorldEdit.schema(mc.player);SelfPlayerCommandPlan.addSnapshot(mc,snapshot,schema);
        var world=new JsonObject(); world.addProperty("kind","entity"); world.addProperty("type","minecraft:player");
        world.add("slot",slot.deepCopy());world.addProperty("revision",UUID.randomUUID().toString());
        world.addProperty("snbt","{}"); world.add("nbt",new JsonObject());world.addProperty("canUndo",false);
        var p=new JsonObject();p.addProperty("self",true);p.addProperty("name",mc.player.getName().getString());world.add("player",p);
        var group=new JsonObject();group.add("value",snapshot.deepCopy());group.add("schema",schema);
        var views=new JsonObject();views.add("player",group);world.add("views",views);
        var caps=new JsonObject();caps.addProperty("backend","vanilla_self");var fields=new JsonArray();
        var supported=new JsonArray();for(String field:List.of("playerGameType","experience.XpLevel","experience.XpP","commandPosition","attributes.base"))supported.add(field);caps.add("supported",supported);
        if(queryAvailable(mc)){
            if(command(mc,"gamemode"))fields.add("playerGameType");
            if(command(mc,"experience","set")){fields.add("experience.XpLevel");fields.add("experience.XpP");}
            if(command(mc,"teleport"))fields.add("commandPosition");
            if(command(mc,"attribute"))fields.add("attributes.base");
        }
        caps.add("editable",fields);
        permissionContext=permissions(mc);
        EditorWriteLog.event("client.self.capabilities",null,permissionContext+" editable="+fields+" read_only="+fields.isEmpty()
                +" blocker="+(!queryAvailable(mc)?"data_get_entity_not_advertised":fields.isEmpty()?"supported_write_commands_not_advertised":"none"));
        caps.addProperty("reason",fields.isEmpty()?"没有可用的自身玩家命令权限或权威查询权限；当前只能查看同步数据、编辑本地草稿。":"服务器未安装 Editor：支持命令树授权的游戏模式、等级、本级经验点数、同维度位置及单个可同步属性基础值；每次一条命令；提交前后均查询服务器确认。其他字段只保留本地草稿，不能混入提交。");
        world.add("capabilities",caps);if(baseline==null)baseline=snapshot.deepCopy();return world;
    }
    void apply(Minecraft mc,JsonObject request,Consumer<JsonObject> done) {
        permissionContext=permissions(mc);
        EditorWriteLog.event("client.self.preflight",StackCodec.string(request,"requestId"),permissionContext);
        if(!documentCurrent())throw new IllegalArgumentException(documentReason());
        if(operation!=null)throw new IllegalArgumentException("上一笔自身玩家命令尚未确认");
        if(!connected(mc))throw new IllegalArgumentException("世界或连接已改变，请重新打开自身玩家");
        if(!queryAvailable(mc))throw new IllegalArgumentException("缺少原版命令或权威查询权限；草稿已保留");
        for(String key:request.keySet())if(!Set.of("op","requestId","revision","slot","entity").contains(key))throw new IllegalArgumentException("纯客户端不支持此玩家字段");
        if(!"apply".equals(StackCodec.string(request,"op")))throw new IllegalArgumentException("命令后端不支持撤销，请重新读取后编辑");
        var entity=StackCodec.object(request,"entity");if(entity.size()!=1)throw new IllegalArgumentException("仅允许自身玩家字段");
        var patch=StackCodec.object(entity,"player");
        var plan=SelfPlayerCommandPlan.create(mc,baseline,patch);
        operation=StackCodec.string(request,"requestId");completion=done;sent=false;queries=0;replies=0;deadline=System.nanoTime()+8_000_000_000L;
        log("query.begin","phase=before command_kind="+patch.keySet().iterator().next());
        String id=operation;
        query(mc,id,tag->{
            if(tag==null||!plan.before().test(tag)){finish("rejected","target_changed","服务器数据与页面不同，未发送修改；请重新读取，草稿已保留",null);return;}
            // One command only. The query response is correlated by vanilla transaction id.
            sent=true;mc.getConnection().sendCommand(plan.command());
            log("command.sent","phase=after");
            confirm(mc,id,plan);
        });
    }
    private void confirm(Minecraft mc,String id,SelfPlayerCommandPlan plan){
            query(mc,id,actual->{
                if(actual==null||!plan.after().test(actual)){
                    // Chat commands and tag queries use different server queues. A query
                    // may legitimately observe the old value. Retry reads, NEVER the command.
                    readback=()->confirm(mc,id,plan);
                    readbackAt=System.nanoTime()+200_000_000L;return;
                }
                var world=world(mc);var values=world.getAsJsonObject("views").getAsJsonObject("player").getAsJsonObject("value");
                plan.project().accept(values,actual);
                baseline=values.deepCopy();finish("saved","command_confirmed","服务器已回读确认",world);
            });
    }
    private void query(Minecraft mc,String id,Consumer<CompoundTag> callback){
        queries++;
        mc.getConnection().getDebugQueryHandler().queryEntityTag(mc.player.getId(),tag->{
            if(!documentCurrent())return;
            if(!Objects.equals(operation,id))return;
            replies++;
            // DebugQueryHandler clears its callback AFTER calling it. Never start the next
            // query reentrantly: that would clear the newly installed response handler.
            nextStep=()->{
            if(!documentCurrent())return;
            if(!Objects.equals(operation,id))return;
            if(!connected(mc)){finish("rejected","connection_changed","连接或世界已改变；结果未知，草稿已保留",null);return;}
            try{callback.accept(tag);}catch(RuntimeException e){logFailure("query.callback_failure",e);finish("rejected","command_unconfirmed","查询或命令中断；草稿已保留，请重新读取核对",null);}
            };
        });
    }
    void tick(Minecraft mc){
        if(!documentCurrent())return;
        if(operation!=null&&(!connected(mc)||System.nanoTime()>deadline))finish("rejected","command_unconfirmed",sent?"命令已发送但未收到权威回读；结果未知，草稿已保留，请重新打开核对":"未收到权威查询或权限已失效，没有发送修改；草稿已保留",null);
        var step=nextStep;nextStep=null;if(step!=null)step.run();
        if(operation!=null&&readback!=null&&System.nanoTime()>=readbackAt){
            var retry=readback;readback=null;
            try{retry.run();}catch(RuntimeException e){logFailure("query.retry_failure",e);finish("rejected","command_unconfirmed","命令已发送但回读中断，结果未知；请关闭后重新读取核对",null);}
        }
    }
    void cancel(){if(operation!=null)log("cancel","outcome="+(sent?"unknown":"not_sent")+" reason=session_cancelled_or_document_changed");operation=null;completion=null;nextStep=null;readback=null;}
    private void finish(String status,String code,String reason,JsonObject world){
        String context="status="+status+" code="+code+" sent="+sent+" queries="+queries+" replies="+replies+" permission_denial_not_proven=true "+permissionContext+" reason="+reason;
        if("saved".equals(status))EditorWriteLog.event("client.self.result",operation,context);
        else EditorWriteLog.warning("client.self.result",operation,context);
        var out=new JsonObject();out.addProperty("requestId",operation);out.addProperty("status",status);out.addProperty("code",code);out.addProperty("reason",reason);if(world!=null)out.add("world",world);
        var done=completion;operation=null;cancel();if(done!=null)done.accept(out);if(status.equals("saved"))sent=false;
    }
}
