package dev.rinorsi.editor.registry;
import com.google.gson.*;
public final class TimelineTrace {
 public static long tick; public static final long start=System.nanoTime();
 public static final JsonArray events=new JsonArray(), sources=new JsonArray();
 private record Page(JsonObject event,String json) {}
 private static final java.util.List<Page> pages=new java.util.ArrayList<>();
 public static void event(String type,String value){JsonObject e=new JsonObject(); e.addProperty("t_ms",(System.nanoTime()-start)/1e6);e.addProperty("tick",tick);e.addProperty("type",type);e.addProperty("value",value);events.add(e);}
 public static void push(String key,String json){JsonObject e=new JsonObject();e.addProperty("t_ms",(System.nanoTime()-start)/1e6);e.addProperty("tick",tick);e.addProperty("type","push");e.addProperty("key",key);e.addProperty("bytes",json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);e.addProperty("chars",json.length());events.add(e);pages.add(new Page(e,json));}
 // Decode audit metadata only after all timing/interaction measurements have finished.
 public static void finish(){for(Page page:pages){JsonObject p=JsonParser.parseString(page.json).getAsJsonObject(),e=page.event;for(String k:new String[]{"generation","offset","total","done","id","field"})if(p.has(k))e.add(k,p.get(k));if(p.has("entries"))e.addProperty("rows",p.getAsJsonArray("entries").size());}pages.clear();}
 public static void source(String name,String gen,int rows,long cpu,long wall){if(gen.equals("prime"))return;JsonObject e=new JsonObject();e.addProperty("name",name);e.addProperty("generation",gen);e.addProperty("rows",rows);e.addProperty("cpu_ms",cpu/1e6);e.addProperty("wall_ms",wall/1e6);sources.add(e);}
}
