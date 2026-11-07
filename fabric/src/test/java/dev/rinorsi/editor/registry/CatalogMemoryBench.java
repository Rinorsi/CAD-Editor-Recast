package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.registry.search.*;
import java.nio.file.*;
import java.util.*;

/** Same 600k rows, same index, compare host retention with/without legacy page delivery. No Rhino heap claimed. */
public final class CatalogMemoryBench {
    private static volatile Object retained;
    private static long heap()throws Exception{for(int i=0;i<3;i++){System.gc();Thread.sleep(150);}return Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory();}
    private static SearchIndex makeIndex(String kind,Pinyin pinyin){
            List<SearchIndex.Row> rows=new ArrayList<>(200000);
            for(int i=0;i<200000;i++){
                String id="pack"+(i%400)+":"+kind+"_"+i,name=(i%5==0?"Copper Tool ":"钻石工具 ")+i;
                JsonObject source=new JsonObject();source.addProperty("id",id);source.addProperty("name",name);JsonArray tags=new JsonArray();tags.add("c:tools");source.add("tags",tags);if(kind.equals("sound_event"))source.addProperty("subtitle","金属声响 "+i);source.addProperty("search_key",(name+" "+id).toLowerCase(Locale.ROOT));
                rows.add(new SearchIndex.Row(id,name,"Copper Tool "+i,kind.equals("sound_event")?"金属声响 "+i:"",List.of("c:tools"),SearchRows.compact(source)));
            }
        return SearchIndex.build(rows,pinyin,()->false,n->{});
    }
    private static List<String> encode(SearchIndex index,String name){JsonArray source=new JsonArray();index.allRows().forEach(row->source.add(SearchRows.legacy(row)));return RegistryPages.split(name,"bench",source,new JsonObject(),20000).stream().map(Object::toString).toList();}
    public static void main(String[] args)throws Exception{
        Pinyin pinyin=new Pinyin(Files.newInputStream(Path.of(args[0])));long baseline=heap();
        List<SearchIndex> indices=new ArrayList<>();List<RegistryIndex> placeholders=new ArrayList<>();
        for(String kind:List.of("item","block","sound_event")){
            long started=System.nanoTime();SearchIndex index=makeIndex(kind,pinyin);indices.add(index);placeholders.add(RegistryIndex.indexOnly("minecraft:"+kind,"bench",200000));
            System.out.printf(Locale.ROOT,"BUILD %s rows=200000 ms=%.3f estimated_bytes=%d%n",kind,(System.nanoTime()-started)/1e6,index.estimatedBytes());
        }
        retained=List.of(indices,placeholders);long lazy=heap();
        List<List<String>> pages=new ArrayList<>();long chars=0;int count=0;
        for(int k=0;k<indices.size();k++){
            List<String> encoded=encode(indices.get(k),placeholders.get(k).name);pages.add(encoded);for(String page:encoded){chars+=page.length();count++;}
        }
        retained=List.of(indices,placeholders,pages);long legacy=heap();
        System.out.printf(Locale.ROOT,"CATALOG_MEMORY rows_per_kind=200000 kinds=3 baseline_bytes=%d lazy_retained_bytes=%d legacy_retained_bytes=%d saved_bytes=%d page_count=%d encoded_chars=%d%n",baseline,lazy-baseline,legacy-baseline,legacy-lazy,count,chars);
        if(legacy<=lazy||placeholders.stream().anyMatch(p->!p.pages().isEmpty()||p.find("pack0:item_0")!=null))throw new AssertionError("lazy retention invariant");
        System.out.println("PASS CatalogMemoryBench (host only; no JS heap or full modpack assertion)");
    }
}
