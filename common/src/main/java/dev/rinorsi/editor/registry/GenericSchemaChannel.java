package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.platform.ClientPlatform;
import dev.rinorsi.editor.world.GenericSchema;
import java.util.*;
import java.util.function.BiConsumer;
import net.minecraft.client.Minecraft;

/** One detached factory per tick across all documents, never a world scan or spawn. */
final class GenericSchemaChannel {
    private GenericSchemaChannel() {}
    private record Job(DocumentDriver driver, Object document, Object world, String generation,
                       JsonObject context, Iterator<String> ids, JsonArray rows,
                       BiConsumer<List<String>,JsonObject> reply) {}
    private static final ArrayDeque<Job> JOBS = new ArrayDeque<>();
    private static boolean initialized;
    static void attach(DocumentDriver driver) {
        if (!initialized) { initialized=true;ClientPlatform.get().onTick(GenericSchemaChannel::tick); }
        driver.onClose(() -> JOBS.removeIf(j -> j.driver == driver));
    }
    static void invalidate() { JOBS.clear(); }
    static void request(DocumentDriver driver, JsonObject request, String generation, BiConsumer<List<String>,JsonObject> reply) {
        var context=new JsonObject();
        try {
            String kind=dev.rinorsi.editor.StackCodec.string(request,"kind");context.addProperty("kind",kind);
            var ids=GenericSchema.ids(kind);
            if(request.has("id")) {
                String id=net.minecraft.resources.Identifier.parse(dev.rinorsi.editor.StackCodec.string(request,"id")).toString();context.addProperty("id",id);
                if(!ids.contains(id))throw new IllegalArgumentException("未知注册类型："+id);ids=List.of(id);
            }
            var mc=Minecraft.getInstance();if(mc.level==null)throw new IllegalArgumentException("尚未进入世界");
            if(JOBS.size()>=8)throw new IllegalArgumentException("通用结构索引繁忙，请稍后重试");
            JOBS.add(new Job(driver,driver.document(),mc.level,generation,context,ids.iterator(),new JsonArray(),reply));
        } catch(RuntimeException error) { error(generation,context,error,reply); }
    }
    private static void tick(Minecraft mc) {
        if(mc.level==null){invalidate();return;}
        var job=JOBS.poll();if(job==null)return;
        if(job.world!=mc.level || job.document!=job.driver.document())return;
        try {
            if(job.ids.hasNext())job.rows.add(GenericSchema.template(job.context.get("kind").getAsString(),job.ids.next(),mc.level));
            if(job.ids.hasNext()){JOBS.add(job);return;}
            job.reply.accept(RegistryPages.split("generic_schema",job.generation,job.rows,job.context).stream().map(Object::toString).toList(),job.context);
        }catch(RuntimeException error){error(job.generation,job.context,error,job.reply);}
    }
    private static void error(String generation,JsonObject context,RuntimeException error,BiConsumer<List<String>,JsonObject> reply){
        var page=RegistryPages.split("generic_schema",generation,new JsonArray(),context).getFirst();
        String message="读取通用结构失败："+String.valueOf(error.getMessage());page.addProperty("error",message.substring(0,Math.min(1000,message.length())));
        reply.accept(List.of(page.toString()),context);
    }
}
