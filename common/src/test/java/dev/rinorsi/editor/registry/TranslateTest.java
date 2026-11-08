package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import net.minecraft.locale.Language;

/** Headless checks using the same active Language API as the client bridge. */
public final class TranslateTest {
    private static int checks;
    public static void main(String[] args){
        var original=Language.getInstance();
        var dictionary=new HashMap<String,String>();dictionary.put("advancements.story.root.title","石器时代");
        dictionary.put("same.key","same.key");dictionary.put("long.key","x".repeat(4097));
        dictionary.put("escaped.key","\u0001".repeat(4096));
        for(int i=0;i<200;i++)dictionary.put("test."+i,"译文".repeat(200));
        Language.inject(new Language(){
            public boolean has(String key){return dictionary.containsKey(key);}
            public String getOrDefault(String key,String fallback){return dictionary.getOrDefault(key,fallback);}
            public boolean isDefaultRightToLeft(){return false;}
            public net.minecraft.util.FormattedCharSequence getVisualOrder(net.minecraft.network.chat.FormattedText text){return original.getVisualOrder(text);}
        });
        try{
            var request=JsonParser.parseString("{name:'translate',requestId:'one',keys:['advancements.story.root.title','missing.key','advancements.story.root.title','same.key','long.key','escaped.key','bad key','',null,3,{},true]}").getAsJsonObject();
            var first=TranslateChannel.pages(request,Language.getInstance()).getFirst();
            check(first.getAsJsonObject("map").size()==1,"missing, invalid, duplicate and oversized keys omitted");
            check(first.getAsJsonObject("map").get("advancements.story.root.title").getAsString().equals("石器时代"),"active language lookup");
            check(first.get("requestId").getAsString().equals("one"),"requestId echoed");
            var second=TranslateChannel.pages(request,Language.getInstance()).getFirst();
            check(!first.get("generation").equals(second.get("generation")),"same-connection identical requests get independent batch identity");
            var keys=new JsonArray();for(int i=0;i<200;i++)keys.add("test."+i);request.add("keys",keys);
            var pages=TranslateChannel.pages(request,Language.getInstance());check(pages.size()>1,"large result paginated");
            var joined=new JsonObject();int offset=0;
            for(var page:pages){
                check(page.toString().length()<=RegistryPages.MAX_CHARS,"wire size bounded");
                check(page.get("offset").getAsInt()==offset&&page.get("total").getAsInt()==200,"offset and total");
                check(page.get("generation").equals(pages.getFirst().get("generation")),"stable batch generation");
                page.getAsJsonObject("map").entrySet().forEach(e->joined.add(e.getKey(),e.getValue()));offset+=page.getAsJsonArray("entries").size();
            }
            check(joined.size()==200&&pages.getLast().get("done").getAsBoolean(),"all maps complete");
            keys.add("overflow");check(TranslateChannel.pages(request,Language.getInstance()).getFirst().has("error"),"201 keys rejected");
            request.add("keys",new JsonObject());check(TranslateChannel.pages(request,Language.getInstance()).getFirst().has("error"),"array required");
            request.remove("keys");check(TranslateChannel.pages(request,Language.getInstance()).getFirst().has("error"),"keys required");
            request.add("keys",new JsonArray());check(TranslateChannel.pages(request,Language.getInstance()).getFirst().getAsJsonObject("map").isEmpty(),"empty map reply");
            request.addProperty("requestId","x".repeat(81));check(TranslateChannel.pages(request,Language.getInstance()).getFirst().has("error"),"requestId bounded");
        }finally{Language.inject(original);}
        check(Language.getInstance()==original,"language restored");
        System.out.println("TranslateTest: "+checks+" checks passed");
    }
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
}
