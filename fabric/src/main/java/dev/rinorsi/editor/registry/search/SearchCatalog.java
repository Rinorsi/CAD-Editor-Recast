package dev.rinorsi.editor.registry.search;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;

/** Reload epochs and memory admission are independent of Minecraft and testable on a plain JVM. */
public final class SearchCatalog implements AutoCloseable {
    public static final long MAX_BYTES = 384L*1024*1024;
    public static final int MAX_KINDS = 32;
    public static final class Slot {
        public volatile SearchIndex index;
        public volatile String error;
        public final AtomicInteger progress=new AtomicInteger();
        public volatile int total;
        private boolean started;
    }
    private final ExecutorService builder=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32),r->{Thread t=new Thread(r,"cadeditor-search-build");t.setDaemon(true);return t;});
    private final Map<String,Slot> slots=new LinkedHashMap<>();
    private final AtomicLong epoch=new AtomicLong();
    private volatile String generation="0";
    private long bytes;
    public synchronized void reset(String generation){this.generation=generation;epoch.incrementAndGet();slots.clear();bytes=0;((ThreadPoolExecutor)builder).getQueue().clear();}
    public String generation(){return generation;}
    public synchronized Slot slot(String kind){return slots.get(kind);}
    public synchronized Slot reserve(String kind){if(slots.containsKey(kind))return slots.get(kind);if(slots.size()>=MAX_KINDS)throw new IllegalArgumentException("INDEX_LIMIT");Slot s=new Slot();slots.put(kind,s);return s;}
    public CompletableFuture<Void> build(String kind,String generation,List<SearchIndex.Row> rows,Pinyin pinyin){
        final Slot slot;final long capturedEpoch;
        synchronized(this){if(!this.generation.equals(generation))return CompletableFuture.failedFuture(new CancellationException());slot=reserve(kind);if(slot.started||slot.index!=null||slot.error!=null)return CompletableFuture.completedFuture(null);slot.started=true;slot.total=rows.size();capturedEpoch=epoch.get();}
        try{return CompletableFuture.runAsync(()->{
            try{SearchIndex index=SearchIndex.build(rows,pinyin,()->epoch.get()!=capturedEpoch,slot.progress::set);
                synchronized(this){if(epoch.get()!=capturedEpoch)throw new CancellationException();if(bytes+index.estimatedBytes()>MAX_BYTES)throw new IllegalArgumentException("INDEX_LIMIT");bytes+=index.estimatedBytes();slot.index=index;}
            }catch(CancellationException ignored){}catch(RuntimeException error){slot.error=error.getMessage()==null?"INDEX_FAILED":error.getMessage();}
        },builder);}catch(RejectedExecutionException error){slot.error="BUSY";return CompletableFuture.failedFuture(error);}
    }
    public synchronized void fail(String kind,String error){reserve(kind).error=error;}
    public synchronized long estimatedBytes(){return bytes;}
    /** One latest token per caller-owned view. A new request cancels running work and suppresses its delivery. */
    public static final class Session {
        private final AtomicLong serial=new AtomicLong();
        public long next(){return serial.incrementAndGet();}
        public void cancel(){serial.incrementAndGet();}
        public BooleanSupplier cancelled(long token){return ()->serial.get()!=token;}
    }
    public void close(){reset("closed");builder.shutdownNow();}
}
