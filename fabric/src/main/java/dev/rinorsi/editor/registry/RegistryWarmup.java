package dev.rinorsi.editor.registry;

import com.google.gson.JsonObject;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

/** Client-thread capture in bounded slices; JSON indexing/paging never runs on the game thread. */
public final class RegistryWarmup {
    public static final long CAPTURE_BUDGET_NS = 350_000;
    public static final int MAX_ROWS_PER_TICK = 1024;
    public static final ExecutorService WORKER = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(64), r -> {
        Thread thread = new Thread(r, "editor-registry-index"); thread.setDaemon(true); return thread;
    });
    private final String generation;
    private final Iterator<Map.Entry<String, Supplier<Iterator<JsonObject>>>> sources;
    private Map.Entry<String, Supplier<Iterator<JsonObject>>> source;
    private Iterator<JsonObject> rows;
    private List<JsonObject> captured = new ArrayList<>();
    private final Map<String, CompletableFuture<RegistryIndex>> futures = new LinkedHashMap<>();
    private final Map<String, RegistryIndex> ready = new LinkedHashMap<>();
    private boolean finished;
    private final long started = System.nanoTime();
    private long maxTickNs, captureNs, completeNs, maxRowNs, maxSourceNs;
    private int ticks;
    /** Pure JSON/JDK code only; safe to prime asynchronously before any world exists. */
    public static void prime() {
        JsonObject row = new JsonObject(); row.addProperty("id", "cadeditor:prime"); row.addProperty("name", "prime");
        RegistryWarmup prime = new RegistryWarmup("prime", Map.of("prime", () -> new ArrayList<>(List.of(row)).iterator()));
        while (!prime.complete()) { prime.tick(); Thread.yield(); }
        com.google.gson.JsonParser.parseString(prime.index("prime").pages().getFirst());
    }
    public static <T> CompletableFuture<T> async(Supplier<T> work) {
        try { return CompletableFuture.supplyAsync(work, WORKER); }
        catch (RejectedExecutionException error) { return CompletableFuture.failedFuture(error); }
    }
    public RegistryWarmup(String generation, Map<String, Supplier<Iterator<JsonObject>>> sources) {
        this.generation = generation; this.sources = sources.entrySet().iterator();
    }
    public void tick() {
        if (completeNs != 0) return;
        long start = System.nanoTime(); ticks++; int count = 0;
        while (!finished && count < MAX_ROWS_PER_TICK && System.nanoTime() - start < CAPTURE_BUDGET_NS) {
            if (rows == null) {
                if (!sources.hasNext()) { finished = true; break; }
                source = sources.next();
                long sourceStart = System.nanoTime();
                try { rows = source.getValue().get(); }
                catch (RuntimeException error) { futures.put(source.getKey(), CompletableFuture.completedFuture(error(source.getKey(), error))); rows = null; continue; }
                finally { maxSourceNs = Math.max(maxSourceNs, System.nanoTime() - sourceStart); }
                // Creating a lazy MC iterator and serializing its first row are separate slices.
                break;
            }
            boolean hasNext;
            try { hasNext = rows.hasNext(); }
            catch (RuntimeException error) {
                futures.put(source.getKey(), CompletableFuture.completedFuture(error(source.getKey(), error)));
                captured = new ArrayList<>(); rows = null; continue;
            }
            if (hasNext) {
                long rowStart = System.nanoTime(); count++;
                try { captured.add(rows.next()); }
                catch (RuntimeException error) { futures.put(source.getKey(), CompletableFuture.completedFuture(error(source.getKey(), error))); captured = new ArrayList<>(); rows = null; }
                finally { maxRowNs = Math.max(maxRowNs, System.nanoTime() - rowStart); }
            } else {
                List<JsonObject> detached = captured; captured = new ArrayList<>();
                String name = source.getKey();
                try { futures.put(name, CompletableFuture.supplyAsync(() -> {
                    try { var index = RegistryIndex.build(name, generation, detached); if (!generation.equals("prime")) SearchChannel.offer(name, generation, detached); return index; }
                    catch (RuntimeException error) { return error(name, error); }
                }, WORKER)); }
                catch (RejectedExecutionException error) { futures.put(name, CompletableFuture.completedFuture(error(name, error))); }
                rows = null;
                break;
            }
        }
        for (var entry : futures.entrySet()) if (!ready.containsKey(entry.getKey()) && entry.getValue().isDone())
            ready.put(entry.getKey(), entry.getValue().join());
        long elapsed = System.nanoTime() - start; captureNs += elapsed; maxTickNs = Math.max(maxTickNs, elapsed);
        if (finished && ready.size() == futures.size()) completeNs = System.nanoTime();
    }
    public RegistryIndex index(String name) { return ready.get(name); }
    private RegistryIndex error(String name,Throwable error) { if(!generation.equals("prime"))SearchChannel.failed(name,generation); return RegistryIndex.error(name,generation,error); }
    public boolean complete() { return completeNs != 0; }
    public String generation() { return generation; }
    public Map<String, RegistryIndex> indexes() { return Collections.unmodifiableMap(ready); }
    public JsonObject metrics() {
        JsonObject out = new JsonObject(); out.addProperty("generation", generation);
        out.addProperty("complete", complete()); out.addProperty("ticks", ticks);
        out.addProperty("warmup_ms", ((completeNs == 0 ? System.nanoTime() : completeNs) - started) / 1_000_000.0);
        out.addProperty("max_capture_tick_ms", maxTickNs / 1_000_000.0); out.addProperty("capture_cpu_ms", captureNs / 1_000_000.0);
        out.addProperty("max_row_ms", maxRowNs / 1_000_000.0); out.addProperty("max_source_ms", maxSourceNs / 1_000_000.0);
        return out;
    }
}
