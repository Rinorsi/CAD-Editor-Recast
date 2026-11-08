package dev.rinorsi.editor.client;

import com.google.gson.*;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.platform.ClientPlatform;
import dev.rinorsi.editor.world.WorldWire;
import java.util.*;
import net.minecraft.client.Minecraft;

/** Page adapter for the independent player views; authoritative revision stays in Java. */
public final class PlayerExtendedClient {
    private PlayerExtendedClient() {}
    private static OrielScreen owner;
    private static final Map<String,String> revisions=new HashMap<>();
    private static String pending,pageId,pendingKey;
    private static long deadline;
    public static void attach(OrielScreen screen){
        clear();owner=screen;
        screen.driver().onMessage("player_extended",value->Minecraft.getInstance().execute(()->request(screen,value)));
        screen.driver().onClose(()->{if(owner==screen)clear();});
    }
    public static void clear(){owner=null;revisions.clear();pending=null;pageId=null;pendingKey=null;}
    public static void tick(){if(pending!=null&&System.nanoTime()>deadline){var result=new JsonObject();result.addProperty("status","rejected");result.addProperty("code","request_timeout");result.addProperty("reason","服务器未确认玩家编辑结果；请重新读取核对，保留草稿");result.addProperty("requestId",pageId);pending=null;if(owner!=null)owner.driver().patch("player_extended_result",result);}}
    private static void request(OrielScreen screen,JsonElement raw){
        if(owner!=screen)return;String id="";
        try{
            var r=raw.getAsJsonObject().deepCopy();id=StackCodec.string(r,"requestId");
            if(pending!=null)throw new IllegalArgumentException("上一笔玩家请求尚未收到回执");
            if(!ClientPlatform.get().canSend(EditorPackets.Request.TYPE))throw new EditorSessions.Failure("UNAVAILABLE","服务器未安装物品工坊");
            String action=StackCodec.string(r,"action"),view=StackCodec.string(r,"view");var target=StackCodec.object(r,"target");
            if(!target.has("uuid"))target.addProperty("uuid",Minecraft.getInstance().player.getStringUUID());
            if(!target.has("offline"))target.addProperty("offline",false);
            String key=target.get("uuid").getAsString()+"/"+target.get("offline").getAsBoolean()+"/"+view;
            if(action.equals("apply")){String revision=revisions.get(key);if(revision==null)throw new EditorSessions.Failure("session_lost","请先读取玩家视图");r.addProperty("revision",revision);}
            String wireId="player-extended-"+UUID.randomUUID();r.addProperty("op","player_extended");r.addProperty("requestId",wireId);
            String payload=WorldWire.encode(r);pending=wireId;pageId=id;pendingKey=key;deadline=System.nanoTime()+10_000_000_000L;
            ClientPlatform.get().send(new EditorPackets.Request(payload));
        }catch(RuntimeException e){var result=new JsonObject();result.addProperty("status","rejected");result.addProperty("requestId",id);result.addProperty("code",e instanceof EditorSessions.Failure f?f.code:"invalid_request");result.addProperty("reason",e.getMessage());screen.driver().patch("player_extended_result",result);}
    }
    public static boolean receive(JsonObject result){
        if(pending==null||!pending.equals(result.has("requestId")?result.get("requestId").getAsString():""))return false;
        if(result.has("playerExtended"))revisions.put(pendingKey,result.getAsJsonObject("playerExtended").get("revision").getAsString());
        var page=result.deepCopy();page.addProperty("requestId",pageId);pending=null;
        if(owner!=null)owner.driver().patch("player_extended_result",page);return true;
    }
}
