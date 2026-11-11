package dev.rinorsi.editor.clientonly;
import com.google.gson.*;
import java.nio.file.*;
import java.util.concurrent.ConcurrentLinkedQueue;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.network.protocol.game.ClientboundTagQueryPacket;
/** Delay original server query replies for pending-draft and timeout scenarios. */
public final class QueryDelay {
    public static boolean hold;
    public static int passBeforeHolding;
    public static final ConcurrentLinkedQueue<Runnable> queued=new ConcurrentLinkedQueue<>();
    public static final JsonArray replies=new JsonArray();
    public static boolean shouldHold(){if(!hold)return false;if(passBeforeHolding>0){passBeforeHolding--;return false;}return true;}
    public static void release(){hold=false;passBeforeHolding=0;Runnable task;while((task=queued.poll())!=null)task.run();}
    public static void record(ClientboundTagQueryPacket packet){
        if(!"client-only-lan".equals(System.getProperty("editor.autotest")))return;
        var row=new JsonObject();row.addProperty("transactionId",packet.getTransactionId());row.addProperty("time",System.currentTimeMillis());
        if(packet.getTag()!=null){var tag=packet.getTag();for(String key:new String[]{"XpLevel","XpTotal","playerGameType"})row.addProperty(key,tag.getIntOr(key,Integer.MIN_VALUE));
            row.addProperty("XpP",tag.getFloatOr("XpP",Float.NaN));
            // Original query bytes expressed as SNBT, never a reconstructed response.
            row.addProperty("snbt",tag.toString());
            for(String key:new String[]{"Pos","Rotation","attributes"})if(tag.get(key)!=null)row.addProperty(key+"Snbt",tag.get(key).toString());
        }
        replies.add(row);
        try{Files.writeString(FabricLoader.getInstance().getGameDir().resolve("tag-query-replies.jsonl"),row+"\n",StandardOpenOption.CREATE,StandardOpenOption.APPEND);}
        catch(java.io.IOException e){throw new java.io.UncheckedIOException(e);}
    }
}
