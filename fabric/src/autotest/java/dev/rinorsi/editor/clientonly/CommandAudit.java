package dev.rinorsi.editor.clientonly;
import com.google.gson.JsonObject;
import java.nio.file.*;
import net.fabricmc.loader.api.FabricLoader;
/** Read-only test audit of actual vanilla command API invocations. */
public final class CommandAudit {
    public static int attempts;
    public static void record(String command) {
        if (!"client-only-lan".equals(System.getProperty("editor.autotest"))) return;
        JsonObject row=new JsonObject();row.addProperty("sequence",++attempts);
        row.addProperty("time",System.currentTimeMillis());row.addProperty("command",command);
        try { Files.writeString(FabricLoader.getInstance().getGameDir().resolve("command-attempts.jsonl"),row.toString()+"\n",StandardOpenOption.CREATE,StandardOpenOption.APPEND); }
        catch(java.io.IOException e){throw new java.io.UncheckedIOException(e);}
    }
}
