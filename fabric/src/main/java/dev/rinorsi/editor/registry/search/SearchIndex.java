package dev.rinorsi.editor.registry.search;

import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.IntConsumer;

/** Immutable, MC/Gson-free index. No game objects and no result-sized DOM/JSON allocation. */
public final class SearchIndex {
    public static final int MAX_ROWS = 250_000, MAX_TEXT_CHARS = 512, MAX_QUERY = 128, MAX_OFFSET = 10_000, MAX_LIMIT = 200;
    public static final long MAX_INDEX_BYTES = 256L * 1024 * 1024;
    public record Row(String id, String name, String english, String subtitle, List<String> tags) {
        public Row { Objects.requireNonNull(id); name = name == null ? id : name; english = english == null ? "" : english; subtitle = subtitle == null ? "" : subtitle; tags = List.copyOf(tags); }
        public String namespace() { int colon = id.indexOf(':'); return colon < 0 ? "minecraft" : id.substring(0, colon); }
    }
    private record Entry(Row row, String[] fields, String han, String full, String initials, long letters) {}
    public record Result(List<Row> rows, int total, int nextOffset, boolean done) {}
    private final Entry[] entries;
    private final Map<Integer, BitSet> grams;
    private final BitSet hanRows;
    private final Pinyin pinyin;
    private final Map<String, Integer> namespaces;
    private final long estimatedBytes;
    private SearchIndex(Entry[] entries, Map<Integer, BitSet> grams, BitSet hanRows, Pinyin pinyin, Map<String,Integer> namespaces, long bytes) {
        this.entries=entries; this.grams=grams; this.hanRows=hanRows; this.pinyin=pinyin; this.namespaces=Map.copyOf(namespaces); this.estimatedBytes=bytes;
    }
    public static String normalize(String s) { return s.toLowerCase(Locale.ROOT).replace("ü", "v").replace(" ", "").replace("'", "").replace("’", ""); }
    private static long letterMask(String s) { long mask=0; for(char c:s.toCharArray()) if(c>='a'&&c<='z'||c>='0'&&c<='9')mask|=1L<<(c>='a'?c-'a':26+c-'0'); return mask; }
    public static SearchIndex build(List<Row> rows, Pinyin pinyin, BooleanSupplier cancel, IntConsumer progress) {
        if(rows.size()>MAX_ROWS)throw new IllegalArgumentException("INDEX_LIMIT");
        check(cancel);List<Row> sorted=new ArrayList<>(rows);sorted.sort(Comparator.comparing(Row::id));check(cancel);
        Entry[] out=new Entry[sorted.size()]; Map<Integer,BitSet> grams=new HashMap<>(); BitSet han=new BitSet(); Map<String,Integer> mods=new TreeMap<>(); long bytes=128;
        for(int i=0;i<sorted.size();i++) {
            if((i&127)==0) { check(cancel);progress.accept(i); }
            Row r=sorted.get(i);String id=r.id().toLowerCase(Locale.ROOT),name=r.name().toLowerCase(Locale.ROOT),en=r.english().toLowerCase(Locale.ROOT),sub=r.subtitle().toLowerCase(Locale.ROOT);
            if(id.length()>MAX_TEXT_CHARS||name.length()>MAX_TEXT_CHARS||en.length()>MAX_TEXT_CHARS||sub.length()>MAX_TEXT_CHARS||r.tags().size()>4096)throw new IllegalArgumentException("INDEX_LIMIT");
            for(String tag:r.tags())if(tag.length()>MAX_TEXT_CHARS)throw new IllegalArgumentException("INDEX_LIMIT");
            String path=id.substring(id.indexOf(':')+1), hanText=name+" "+sub;
            String full=pinyin.key(hanText,false),initial=pinyin.key(hanText,true);
            String[] fields={id,path,name,en,sub,full,initial,normalize(en)};
            out[i]=new Entry(r,fields,hanText,full,initial,letterMask(allReadings(hanText,pinyin)));
            if(pinyin.hasHan(hanText))han.set(i);
            mods.merge(r.namespace(),1,Integer::sum);
            bytes+=240;for(String f:fields)bytes+=40L+2L*f.length();for(String tag:r.tags())bytes+=48L+2L*tag.length();
            // Fixed hashed bigram domain bounds vocabulary growth. Collisions are verified below.
            Set<Integer> unique=new HashSet<>();
            for(String f:fields) for(int j=0;j+1<f.length();j++)unique.add(gram(f.charAt(j),f.charAt(j+1)));
            for(int g:unique){BitSet bits=grams.computeIfAbsent(g,k->new BitSet());long before=bits.size()/8L;bits.set(i);bytes+=bits.size()/8L-before;}
            if(bytes>MAX_INDEX_BYTES)throw new IllegalArgumentException("INDEX_LIMIT");
        }
        check(cancel);progress.accept(out.length);return new SearchIndex(out,Map.copyOf(grams),han,pinyin,mods,bytes+grams.size()*96L);
    }
    private static int gram(char a,char b){return ((a*31+b)*0x9e3779b9>>>22)&1023;}
    private static String allReadings(String s,Pinyin p){StringBuilder b=new StringBuilder(s);for(char c:s.toCharArray()){String[] rs=p.readings(c);if(rs!=null)for(String r:rs)b.append(r);}return b.toString();}
    private static void check(BooleanSupplier cancel){if(cancel.getAsBoolean()||Thread.currentThread().isInterrupted())throw new java.util.concurrent.CancellationException();}
    public int size(){return entries.length;}
    public long estimatedBytes(){return estimatedBytes;}
    public Map<String,Integer> namespaces(){return namespaces;}
    public Result query(String raw,int offset,int limit,Set<String> namespaces,Set<String> tags,BooleanSupplier cancel) {
        if(raw.length()>MAX_QUERY||offset<0||offset>MAX_OFFSET||limit<1||limit>MAX_LIMIT)throw new IllegalArgumentException("BAD_REQUEST");
        String q=normalize(raw);BitSet candidates=new BitSet(entries.length);
        check(cancel);
        if(q.isEmpty()&&namespaces.isEmpty()&&tags.isEmpty()) {
            int end=Math.min(entries.length,offset+limit);List<Row> page=new ArrayList<>(limit);
            for(int i=offset;i<end;i++)page.add(entries[i].row());
            return new Result(List.copyOf(page),entries.length,offset+page.size(),offset+page.size()>=entries.length);
        }
        if(q.length()<2)candidates.set(0,entries.length);
        else {
            BitSet smallest=null;
            for(int j=0;j+1<q.length();j++){BitSet b=grams.get(gram(q.charAt(j),q.charAt(j+1)));if(b==null){smallest=new BitSet();break;}if(smallest==null||b.cardinality()<smallest.cardinality())smallest=b;}
            if(smallest!=null)candidates.or(smallest);
            // Mixed and alternative readings must not be lost by primary-pinyin candidate pruning.
            if(letterMask(q)!=0)candidates.or(hanRows);
        }
        @SuppressWarnings("unchecked") List<Row>[] ranked=new List[4];for(int k=0;k<4;k++)ranked[k]=new ArrayList<>();
        int[] counts=new int[4];long required=letterMask(q);int examined=0;
        for(int i=candidates.nextSetBit(0);i>=0;i=candidates.nextSetBit(i+1)) {
            if((examined++&63)==0)check(cancel);Entry e=entries[i];Row row=e.row();
            if(!namespaces.isEmpty()&&!namespaces.contains(row.namespace())||!row.tags().containsAll(tags))continue;
            int score=4;
            for(String field:e.fields())score=Math.min(score,rank(field,q));
            if(score>0&&!q.isEmpty()&&(e.letters()&required)==required&&hanRows.get(i)) {
                // Rank alternative pronunciations as well as the primary cached key.
                if(score==4){score=Math.min(score,pinyin.rank(e.fields()[2],q));if(score==4&&!e.fields()[4].isEmpty())score=Math.min(score,pinyin.rank(e.fields()[4],q));}
            }
            if(score==4)continue;counts[score]++;if(ranked[score].size()<offset+limit)ranked[score].add(row);
        }
        check(cancel);List<Row> result=new ArrayList<>();int skip=offset,total=Arrays.stream(counts).sum();
        for(int rank=0;rank<4&&result.size()<limit;rank++) {
            if(skip>=counts[rank]){skip-=counts[rank];continue;}
            List<Row> bucket=ranked[rank];for(int j=skip;j<bucket.size()&&result.size()<limit;j++)result.add(bucket.get(j));skip=0;
        }
        int next=offset+result.size();return new Result(List.copyOf(result),total,next,next>=total);
    }
    private static int rank(String text,String q) {
        if(q.isEmpty()||text.equals(q))return 0; if(text.startsWith(q))return 1;
        int from=0,pos;boolean found=false;
        while((pos=text.indexOf(q,from))>=0){found=true;if(pos>0&&!Character.isLetterOrDigit(text.charAt(pos-1)))return 2;from=pos+1;}
        return found?3:4;
    }
}
