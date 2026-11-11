package dev.rinorsi.editor.registry.search;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public final class SearchTest {
    private static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);System.out.println("PASS "+label);}
    private static SearchIndex.Row row(String id,String name){return new SearchIndex.Row(id,name,"","",List.of());}
    public static void main(String[] args)throws Exception{
        Pinyin p=new Pinyin(Files.newInputStream(Path.of(args[0])));
        List<SearchIndex.Row> rows=List.of(row("test:4_sub","赤铁剑"),row("test:3_boundary","red iron sword"),row("test:2_prefix","iron sword"),row("test:1_exact","iron"),row("test:diamond_sword","钻石剑"),row("test:heavy","重型绿宝石"),new SearchIndex.Row("mod:rare","罕见工具","Rare Tool","",List.of("c:tools")));
        SearchIndex index=SearchIndex.build(rows,p,()->false,n->{});
        var found=index.query("iron",0,80,Set.of(),Set.of(),()->false);
        check(found.rows().stream().map(SearchIndex.Row::id).toList().equals(List.of("test:1_exact","test:2_prefix","test:3_boundary")),"exact > prefix > word boundary");
        check(index.query("铁",0,80,Set.of(),Set.of(),()->false).total()==1,"Chinese substring");
        for(String q:List.of("zuanshijian","zsj","zuansj","钻shi剑","zs","zuanshij"))check(index.query(q,0,80,Set.of(),Set.of(),()->false).rows().stream().anyMatch(r->r.id().equals("test:diamond_sword")),"pinyin/mixed "+q);
        check(index.query("chongxing",0,80,Set.of(),Set.of(),()->false).total()==1,"alternate polyphone reading");
        check(index.query("lvbao",0,80,Set.of(),Set.of(),()->false).total()==1,"v for umlaut");
        SearchIndex subtitles=SearchIndex.build(List.of(new SearchIndex.Row("test:sound","sound","","重型声音",List.of())),p,()->false,n->{});
        check(subtitles.query("chongxsy",0,80,Set.of(),Set.of(),()->false).total()==1,"alternative pinyin in subtitle");
        check(index.query("rare tool",0,80,Set.of("mod"),Set.of("c:tools"),()->false).total()==1,"English + namespace + tag membership");
        check(index.query("",0,80,Set.of("mod"),Set.of("missing:tag"),()->false).total()==0,"tag filter excludes");
        check(index.query("test:diamond_sword",0,80,Set.of(),Set.of(),()->false).rows().getFirst().id().equals("test:diamond_sword"),"namespaced ID");
        var one=index.query("",0,2,Set.of(),Set.of(),()->false);var two=index.query("",2,2,Set.of(),Set.of(),()->false);
        check(one.total()==7&&one.nextOffset()==2&&!one.done()&&!one.rows().get(1).id().equals(two.rows().getFirst().id()),"bounded stable paging");
        check(index.query("",7,80,Set.of(),Set.of(),()->false).done(),"empty final page");
        SearchCatalog.Session session=new SearchCatalog.Session();long first=session.next();session.next();check(session.cancelled(first).getAsBoolean(),"supersede token");
        try{index.query("",0,80,Set.of(),Set.of(),session.cancelled(first));throw new AssertionError("not cancelled");}catch(CancellationException expected){check(true,"cancel running query");}
        AtomicInteger steps=new AtomicInteger();try{SearchIndex.build(Collections.nCopies(1000,rows.getFirst()),p,()->steps.incrementAndGet()>2,n->{});throw new AssertionError("not cancelled");}catch(CancellationException expected){check(true,"cancel build");}
        try(var catalog=new SearchCatalog()){
            catalog.reset("1");catalog.build("items","1",rows,p).get(10,TimeUnit.SECONDS);check(catalog.slot("items").index.size()==7,"async catalog build");
            catalog.reset("2");check(catalog.slot("items")==null&&catalog.estimatedBytes()==0,"reload removes old index");
            try{catalog.build("items","1",rows,p).join();throw new AssertionError("stale build accepted");}catch(CancellationException|CompletionException expected){check(true,"reject old generation");}
            catalog.build("items","2",List.of(row("new:item","新物品")),p).get(10,TimeUnit.SECONDS);check(catalog.slot("items").index.size()==1,"reload atomically publishes new generation");
        }
        try{SearchIndex.build(Collections.nCopies(SearchIndex.MAX_ROWS+1,rows.getFirst()),p,()->false,n->{});throw new AssertionError("unbounded rows");}catch(IllegalArgumentException expected){check(true,"row admission limit");}
        AtomicInteger reports=new AtomicInteger();
        try(var catalog=new SearchCatalog((kind,error)->{check(kind.equals("fixture")&&error instanceof NullPointerException,"diagnostic identifies failing index");reports.incrementAndGet();})){
            catalog.reset("logging");catalog.build("fixture","logging",Arrays.asList((SearchIndex.Row)null),p).get(10,TimeUnit.SECONDS);
            check(catalog.slot("fixture").error!=null&&reports.get()==1,"async failure keeps result and reports original exception");
            try{catalog.build("fixture","stale",rows,p).join();}catch(CancellationException|CompletionException expected){}
            check(reports.get()==1,"cancelled generation is not reported as failure");
        }
        try(var catalog=new SearchCatalog((kind,error)->{throw new IllegalStateException("logger fixture");})){
            catalog.reset("logging");catalog.build("fixture","logging",Arrays.asList((SearchIndex.Row)null),p).get(10,TimeUnit.SECONDS);
            check(catalog.slot("fixture").error!=null,"broken diagnostic sink does not break result delivery");
        }
        System.out.println("PASS SearchTest");
    }
}
