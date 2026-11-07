package dev.rinorsi.editor.registry.search;

import java.nio.file.*;
import java.util.*;

/** Synthetic load, not invented registry options; the rows never enter a release. */
public final class SearchBench {
    private static volatile SearchIndex retained;
    private static long heap(){Runtime r=Runtime.getRuntime();return r.totalMemory()-r.freeMemory();}
    private static void gc()throws Exception{System.gc();Thread.sleep(120);System.gc();Thread.sleep(120);}
    public static void main(String[] args)throws Exception{
        Pinyin py=new Pinyin(Files.newInputStream(Path.of(args[0])));
        for(int size:new int[]{1500,50000,200000}){
            retained=null;gc();long before=heap();List<SearchIndex.Row> rows=new ArrayList<>(size);
            for(int i=0;i<size;i++)rows.add(new SearchIndex.Row("pack"+(i%400)+":material/"+i+"_"+(i%5==0?"diamond_sword":"steel_ingot"),switch(i%5){case 0->"钻石剑"+i;case 1->"钢铁锭"+i;case 2->"重型工具"+i;case 3->"魔法水晶"+i;default->"Machine Plate "+i;},"Synthetic Item "+i,"",List.of("c:synthetic_"+(i%16))));
            long start=System.nanoTime();retained=SearchIndex.build(rows,py,()->false,n->{});double build=(System.nanoTime()-start)/1e6;rows=null;gc();long used=heap()-before;
            System.out.printf(Locale.ROOT,"BUILD rows=%d ms=%.3f heap_delta_bytes=%d estimated_bytes=%d%n",size,build,used,retained.estimatedBytes());
            for(String q:List.of("s","dia","zsj","钻石","chongx")){
                for(int i=0;i<8;i++)retained.query(q,0,80,Set.of(),Set.of(),()->false);
                double[] samples=new double[40];int count=0;
                for(int i=0;i<samples.length;i++){start=System.nanoTime();var result=retained.query(q,0,80,Set.of(),Set.of(),()->false);samples[i]=(System.nanoTime()-start)/1e6;count=result.total();}
                Arrays.sort(samples);System.out.printf(Locale.ROOT,"QUERY rows=%d q=%s p50_ms=%.3f p95_ms=%.3f matches=%d%n",size,q,samples[20],samples[38],count);
            }
        }
    }
}
