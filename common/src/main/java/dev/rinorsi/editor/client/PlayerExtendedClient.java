package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.platform.ClientPlatform;
import dev.rinorsi.editor.world.WorldWire;
import java.util.*;
import net.minecraft.client.Minecraft;

/** Page adapter: server revisions stay in Java; each page request is sent at most once. */
public final class PlayerExtendedClient {
    private PlayerExtendedClient() {}
    private static final long INTERVAL=550_000_000L, TIMEOUT=10_000_000_000L;
    private record Queued(JsonObject message,String id,long created) {}
    private static final ArrayDeque<Queued> queue=new ArrayDeque<>();
    private static final Map<String,String> revisions=new HashMap<>();
    private static OrielScreen owner;
    private static String pending,pageId,pendingKey;
    private static long deadline,nextSend;

    public static void attach(OrielScreen screen){
        clear();owner=screen;
        // Always enqueue the callback: JS must register PX.pending after oriel.send returns.
        screen.driver().onMessage("player_extended",value->Minecraft.getInstance().schedule(()->request(screen,value)));
        screen.driver().onClose(()->{if(owner==screen)clear();});
    }
    public static void clear(){owner=null;revisions.clear();queue.clear();pending=null;pageId=null;pendingKey=null;nextSend=0;}
    static boolean busy(){return pending!=null||!queue.isEmpty();}
    static void resetViews(){revisions.clear();}
    public static void tick(){
        long now=System.nanoTime();
        if(pending!=null&&now>deadline){String id=pageId;pending=null;nextSend=now+INTERVAL;reject(id,"request_timeout",EditorI18n.tr("cadeditor.message.playerextendedclient.ff4cc2999f"));}
        // Queue deadlines include time spent waiting behind a slow request, before the page's 12s timeout.
        while(!queue.isEmpty()&&now-queue.peek().created>=TIMEOUT)reject(queue.remove().id,"request_timeout",EditorI18n.tr("cadeditor.message.playerextendedclient.2a1bca2d17"));
        if(owner!=null&&pending==null&&now>=nextSend&&!queue.isEmpty())transmit(queue.remove());
    }
    private static void request(OrielScreen screen,JsonElement raw){
        if(owner!=screen)return;String id="";
        try{
            var r=raw.getAsJsonObject().deepCopy();id=StackCodec.string(r,"requestId");
            if(WorldEditorClient.switching())throw new EditorSessions.Failure("request_pending",EditorI18n.tr("cadeditor.message.playerextendedclient.c4bc8e7fa8"));
            if(id.isEmpty()||id.length()>80)throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editormod.10c33b396f"));
            if(queue.size()>=4)throw new EditorSessions.Failure("rate_limited",EditorI18n.tr("cadeditor.message.playerextendedclient.a676acc8b8"));
            if(id.equals(pageId)&&pending!=null)throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.playerextendedclient.68d76f578c"));
            for(var q:queue)if(q.id.equals(id))throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.playerextendedclient.68d76f578c"));
            queue.add(new Queued(r,id,System.nanoTime()));
        }catch(RuntimeException e){reject(id,e instanceof EditorSessions.Failure f?f.code:"invalid_request",e.getMessage());}
    }
    private static void transmit(Queued queued){
        boolean reserved=false;
        try{
            var r=queued.message;
            if(!ClientPlatform.get().canSend(EditorPackets.Request.TYPE))throw new EditorSessions.Failure("UNAVAILABLE",EditorI18n.tr("cadeditor.message.playerextendedclient.bdd4f57a44"));
            String action=StackCodec.string(r,"action"),view=r.has("view")?StackCodec.string(r,"view"):"";
            if(!r.has("target"))r.add("target",new JsonObject());var target=StackCodec.object(r,"target");
            if(!target.has("uuid"))target.addProperty("uuid",Minecraft.getInstance().player.getStringUUID());
            target.addProperty("uuid",UUID.fromString(StackCodec.string(target,"uuid")).toString());
            if(!target.has("offline"))target.addProperty("offline",false);
            String key=target.get("uuid").getAsString()+"/"+target.get("offline").getAsBoolean()+"/"+view;
            if(action.equals("apply")){
                String revision=revisions.get(key);if(revision==null)throw new EditorSessions.Failure("session_lost",EditorI18n.tr("cadeditor.message.playerextendedclient.76943a2614"));
                if(r.has("revision")&&!revision.equals(StackCodec.string(r,"revision")))throw new EditorSessions.Failure("target_changed",EditorI18n.tr("cadeditor.message.playerextendedclient.b7be9359a1"));
                r.addProperty("revision",revision);
            }
            String wireId="player-extended-"+UUID.randomUUID();r.addProperty("op","player_extended");r.addProperty("requestId",wireId);
            String payload=WorldWire.encode(r);pending=wireId;pageId=queued.id;pendingKey=key;reserved=true;deadline=queued.created+TIMEOUT;
            ClientPlatform.get().send(new EditorPackets.Request(payload));
        }catch(RuntimeException e){
            if(reserved)pending=null;nextSend=System.nanoTime()+INTERVAL;
            reject(queued.id,reserved?"request_timeout":e instanceof EditorSessions.Failure f?f.code:"invalid_request",reserved?EditorI18n.tr("cadeditor.message.playerextendedclient.393afae83a"):e.getMessage());
        }
    }
    private static void reject(String id,String code,String reason){
        var result=new JsonObject();result.addProperty("status","rejected");result.addProperty("requestId",id);result.addProperty("code",code);result.addProperty("reason",reason);
        if(owner!=null)owner.driver().patch("player_extended_result",result);
    }
    public static boolean receive(JsonObject result){
        if(pending==null||!pending.equals(result.has("requestId")?result.get("requestId").getAsString():""))return false;
        if(result.has("playerExtended")){var revision=result.getAsJsonObject("playerExtended").get("revision");if(revision!=null&&!revision.isJsonNull())revisions.put(pendingKey,revision.getAsString());}
        var page=result.deepCopy();page.addProperty("requestId",pageId);pending=null;nextSend=System.nanoTime()+INTERVAL;
        if(owner!=null)owner.driver().patch("player_extended_result",page);return true;
    }
}
