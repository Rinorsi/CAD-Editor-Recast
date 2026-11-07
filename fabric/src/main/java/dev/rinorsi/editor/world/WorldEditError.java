package dev.rinorsi.editor.world;
import com.google.gson.JsonObject;
/** Additive world-only rejection metadata; the item channel keeps its existing failures. */
public final class WorldEditError extends IllegalArgumentException {
    public final String code,stale;public final Integer retryAfterMs;
    public WorldEditError(String code,String reason,String stale,Integer retryAfterMs){super(reason);this.code=code;this.stale=stale;this.retryAfterMs=retryAfterMs;}
    public static void annotate(JsonObject reply,RuntimeException error){
        if(error instanceof WorldEditError e){if(e.stale!=null)reply.addProperty("stale",e.stale);if(e.retryAfterMs!=null)reply.addProperty("retryAfterMs",e.retryAfterMs);}
        if(error instanceof WorldMerge.Conflict conflict){reply.add("conflicts",conflict.json());if(conflict.stale!=null)reply.addProperty("stale",conflict.stale);}
        String code=reply.get("code").getAsString();
        if((code.equals("target_changed")&&!reply.has("conflicts")&&!reply.has("stale"))||code.equals("session_lost"))reply.addProperty("stale","session");
    }
}
