package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.List;

/** Real production envelopes; no Minecraft instance, window or Gradle required. */
public final class EntityScopePagesTest {
    public static void main(String[] args) {
        var entries = new JsonArray();
        for (int n=0;n<450;n++) { var row=new JsonObject();row.addProperty("id","custom:entity_"+n);row.addProperty("detail","汉字😀".repeat(40));entries.add(row); }
        int checked=0;
        for(String name:List.of("entity_info","entity_info:custom:one","entity_schema","entity_schema:custom:one",
                "entity_base_attributes","equipment_slot_groups","spawner_info")) {
            var context=new JsonObject();context.addProperty("id","custom:one");context.addProperty("worldGeneration","forged");
            String counter=name.startsWith("entity_schema")?"entity-schema-17":"entity-21";
            var pages=EntityRegistryChannel.responsePages(name,counter,"9007199254740993",entries,context,null);
            if(pages.size()<2)throw new AssertionError("pagination fixture failed");
            int offset=0;
            for(String encoded:pages){
                var page=JsonParser.parseString(encoded).getAsJsonObject();
                if(!page.get("generation").getAsString().equals(counter)||!page.get("worldGeneration").getAsString().equals("9007199254740993"))throw new AssertionError("independent/world epochs lost");
                if(page.get("offset").getAsInt()!=offset)throw new AssertionError("pagination gap");
                for(var row:page.getAsJsonArray("entries"))if(!row.equals(entries.get(offset++)))throw new AssertionError("field loss");
                if(page.get("done").getAsBoolean()!=(offset==entries.size())||encoded.length()>RegistryPages.MAX_CHARS)throw new AssertionError("bad terminal/budget");
            }
            var error=JsonParser.parseString(EntityRegistryChannel.responsePages(name,counter,"next-world",new JsonArray(),context,"invalid entity").getFirst()).getAsJsonObject();
            if(!error.has("error")||!error.get("worldGeneration").getAsString().equals("next-world")||!error.get("done").getAsBoolean())throw new AssertionError("error envelope unscoped");
            if(!context.get("worldGeneration").getAsString().equals("forged"))throw new AssertionError("caller context mutated");
            checked++;
        }
        System.out.println("PASS entity scope envelopes: "+checked+" names, success/error/all pages, independent counters, exact rows and length bounds");
    }
}
