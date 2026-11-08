package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import net.minecraft.locale.Language;

/** Bounded, on-demand lookup of the active client's language. */
public final class TranslateChannel {
    private static final AtomicLong SEQUENCE=new AtomicLong();
    private TranslateChannel() {}
    public static List<JsonObject> pages(JsonObject request,Language language) {
        String generation="translate-"+SEQUENCE.incrementAndGet();
        var context=new JsonObject();
        var entries=new JsonArray();
        String error=null;
        try {
            if(request.toString().length()>8192)throw new IllegalArgumentException("翻译请求过长");
            if(request.has("requestId")){
                var id=request.get("requestId");
                if(!id.isJsonPrimitive()||!id.getAsJsonPrimitive().isString()||id.getAsString().length()>80)throw new IllegalArgumentException("无效 requestId");
                context.add("requestId",id.deepCopy());
            }
            var raw=request.get("keys");
            if(raw==null||!raw.isJsonArray()||raw.getAsJsonArray().size()>200)throw new IllegalArgumentException("keys 必须为最多 200 项的数组");
            var seen=new HashSet<String>();
            for(var value:raw.getAsJsonArray()){
                if(!value.isJsonPrimitive()||!value.getAsJsonPrimitive().isString())continue;
                String key=value.getAsString();
                if(key.length()>256||!key.matches("[A-Za-z0-9_.:/-]+")||!seen.add(key)||!language.has(key))continue;
                String translated=language.getOrDefault(key);
                if(translated==null||translated.equals(key)||translated.length()>4096)continue;
                var row=new JsonObject();row.addProperty("id",key);row.addProperty("name",translated);
                if(row.toString().length()<=9000)entries.add(row);
            }
        }catch(IllegalArgumentException failure){entries=new JsonArray();error=failure.getMessage();}
        // entries and map both carry text; half-size pages bound the duplicated data.
        var pages=RegistryPages.split("translate",generation,entries,context,11000);
        for(var page:pages){
            var map=new JsonObject();
            for(var raw:page.getAsJsonArray("entries")){var row=raw.getAsJsonObject();map.add(row.get("id").getAsString(),row.get("name"));}
            page.add("map",map);
            if(error!=null)page.addProperty("error",error);
            if(page.toString().length()>RegistryPages.MAX_CHARS)throw new IllegalStateException("翻译分页超过上限");
        }
        return pages;
    }
}
