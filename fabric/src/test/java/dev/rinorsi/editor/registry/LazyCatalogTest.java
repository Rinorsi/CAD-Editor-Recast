package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.registry.search.*;
import java.nio.file.*;
import java.util.*;

/** Protocol policy, compact row fidelity and lookup; no client window or Minecraft bootstrap. */
public final class LazyCatalogTest {
    private static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);System.out.println("PASS "+label);}
    public static void main(String[] args)throws Exception{
        Object first=new Object(),second=new Object();LazyCatalog policy=new LazyCatalog();policy.document(first);
        check(!policy.enabled(),"legacy default");check(policy.message("client_features",List.of(LazyCatalog.FEATURE)),"first-message negotiation");
        policy.document(first);check(policy.enabled(),"same document retains feature");policy.document(second);check(!policy.enabled(),"new document forgets feature");
        policy.message("items",List.of());check(!policy.message("client_features",List.of(LazyCatalog.FEATURE)),"late negotiation rejected");
        policy.document(new Object());check(!policy.message("client_features",List.of("other")),"unsupported feature leaves legacy");
        for(String kind:List.of("items","minecraft:item","blocks","minecraft:block","sounds","minecraft:sound_event","tags:item","tags:mod:registry","loot_table","minecraft:loot_table","recipe","minecraft:recipe","item_model","camera_overlay","profile_texture","profile_cape","profile_elytra"))check(LazyCatalog.lazy(kind,0),"forced lazy "+kind);
        check(!LazyCatalog.lazy("entity_types",600)&&LazyCatalog.lazy("entity_types",601),"single threshold 600 boundary");
        for(String kind:List.of("enchantments","mob_effects","enum:text_color","data_component_types"))check(!LazyCatalog.lazy(kind,20),"small remains eager "+kind);
        Pinyin pinyin=new Pinyin(Files.newInputStream(Path.of(args[0])));
        List<SearchIndex.Row> rows=new ArrayList<>();
        for(String kind:List.of("items","blocks","sounds","tags:item","loot_table","recipe","item_model","camera_overlay","profile_texture","profile_cape","profile_elytra","mod:large")){
            JsonObject legacy=new JsonObject();legacy.addProperty("id","test:"+kind.replace(':','_'));legacy.addProperty("name","测试");
            if(kind.startsWith("tags:")){legacy.addProperty("count",17);legacy.addProperty("translation_key","tag.item.test.tools");}
            if(kind.equals("sounds"))legacy.addProperty("subtitle","声响");
            if(Set.of("item_model","camera_overlay","profile_texture","profile_cape","profile_elytra").contains(kind))legacy.addProperty("resource","test:items/tool.json");
            if(kind.equals("mod:large")){legacy.add("nested",JsonParser.parseString("{\"flag\":true,\"n\":2,\"a\":[null,\"v\"]}"));}
            var row=new SearchIndex.Row(legacy.get("id").getAsString(),"测试","","",List.of(),SearchRows.compact(legacy));rows.add(row);
            JsonObject wire=SearchRows.wire(row);check(wire.has("namespace"),"namespace "+kind);wire.remove("namespace");
            check(wire.keySet().equals(legacy.keySet())&&wire.equals(legacy)&&wire.toString().equals(legacy.toString()),"exact field/value/order parity "+kind);
        }
        SearchIndex index=SearchIndex.build(rows,pinyin,()->false,n->{});
        var lookup=index.lookup(List.of("test:sounds","test:missing","test:items","test:sounds"),()->false);
        check(lookup.rows().stream().map(SearchIndex.Row::id).toList().equals(List.of("test:sounds","test:items","test:sounds")),"lookup preserves request order and duplicates");
        check(lookup.missing().equals(List.of("test:missing")),"lookup missing is not error");
        check(index.lookup(List.of(),()->false).rows().isEmpty(),"empty lookup");
        try{index.lookup(Collections.nCopies(65,"test:items"),()->false);throw new AssertionError("65 lookup accepted");}catch(IllegalArgumentException e){check("BAD_REQUEST".equals(e.getMessage()),"65 ids BAD_REQUEST");}
        check(index.query("",0,80,Set.of("test"),Set.of(),()->false).total()==rows.size()&&index.namespaces().get("test")==rows.size(),"namespace counts remain full with filters");
        JsonObject source=new JsonObject();source.addProperty("id","test:item");source.addProperty("name","Item");
        RegistryWarmup warmup=new RegistryWarmup("unit-lazy",Map.of("minecraft:item",()->List.of(source).iterator()),true);
        long deadline=System.nanoTime()+10_000_000_000L;while(!warmup.complete()&&System.nanoTime()<deadline){warmup.tick();Thread.sleep(1);}
        RegistryIndex placeholder=warmup.index("minecraft:item");
        check(warmup.complete()&&placeholder.indexOnly()&&placeholder.size==1&&placeholder.pages().isEmpty()&&placeholder.find("test:item")==null,"lazy warmup retains count only, no rows/pages encoded");
        System.out.println("PASS LazyCatalogTest");
    }
}
