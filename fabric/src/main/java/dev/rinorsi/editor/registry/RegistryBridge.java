package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.oriel.mod.client.DocumentDriver;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.atomic.AtomicLong;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

/** Read-only, local-page bridge. No additional page capabilities are granted. */
public final class RegistryBridge {
    private record Batch(String key, java.util.Iterator<String> pages) {}
    private static final class State {
        Object document; boolean pending; String generation;
        final dev.rinorsi.editor.registry.search.LazyCatalog features=new dev.rinorsi.editor.registry.search.LazyCatalog();
        JsonObject meta; String lazySignature="";boolean featureReplyPending;
        final Map<String,java.util.concurrent.CompletableFuture<java.util.List<String>>> legacyCatalogs=new java.util.LinkedHashMap<>();
        final java.util.LinkedHashMap<String, Batch> pages = new java.util.LinkedHashMap<>();
        final java.util.LinkedHashMap<String, Batch> interactive = new java.util.LinkedHashMap<>();
        final java.util.List<Runnable> waiting = new java.util.ArrayList<>();
    }
    private static final Map<DocumentDriver, State> DOCUMENTS = new WeakHashMap<>();
    private static final AtomicLong GENERATION = new AtomicLong();
    private static boolean ticking;
    private static final AtomicLong RELOAD = new AtomicLong();
    private static Object world, language;
    private static long observedReload = -1;
    private static RegistryWarmup warmup;
    private static Map<String,Integer> LIVE_COUNTS=Map.of();
    private static final Map<String,Integer> EXTRA_COUNTS=new java.util.concurrent.ConcurrentHashMap<>();
    private static double maxPushMs;
    private static double maxRegistryTickMs;
    private static String maxPushKey;
    private static final long PUSH_BUDGET_NS = 2_000_000;
    private static final int MAX_PUSH_PAGES = 8;
    private static final java.util.List<String> LAZY_SOURCES=java.util.List.of("item_model","camera_overlay","profile_texture","profile_cape","profile_elytra","loot_table","recipe");
    private static long estimatedPageNs = 250_000, maxPageNs, pushBudgetOverruns;
    private static int maxPagesPerTick;
    private static final Map<String, java.util.concurrent.CompletableFuture<java.util.List<String>>> RESOURCE_CACHE = new java.util.LinkedHashMap<>(64, 0.75f, true);
    private RegistryBridge() {}
    public static void attach(DocumentDriver driver) {
        initialize();
        if (driver.serverSession() || DOCUMENTS.containsKey(driver)) return;
        DOCUMENTS.put(driver, new State());
        SearchChannel.attach(driver);
        DraftChannel.attach(driver);
        ComponentValidationChannel.attach(driver);
        driver.onMessage("registry", value -> request(driver, value));
        driver.onClose(() -> DOCUMENTS.remove(driver));
    }
    /** Register hooks only. No Minecraft/world/registry access during client initialization. */
    public static void initialize() {
        if (ticking) return;
        ticking = true;
        RegistrySupplement.initialize();
        // Class loading / JSON codecs are primed on an auxiliary thread, with no game state access.
        java.util.concurrent.CompletableFuture.runAsync(RegistryWarmup::prime);
        net.fabricmc.fabric.api.event.lifecycle.v1.CommonLifecycleEvents.TAGS_LOADED.register((access, client) -> { if (client) RELOAD.incrementAndGet(); });
        net.fabricmc.fabric.api.resource.v1.ResourceLoader.get(net.minecraft.server.packs.PackType.CLIENT_RESOURCES)
                .registerReloadListener(Identifier.parse("cadeditor:registry_invalidation"), (net.minecraft.server.packs.resources.ResourceManagerReloadListener) resources -> RELOAD.incrementAndGet());
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
                long registryTickStart = System.nanoTime();
                if (client.level == null) { if (world != null) SearchChannel.reset("disconnected"); world = null; warmup = null; return; }
                Object currentLanguage = net.minecraft.locale.Language.getInstance();
                if (world != client.level || language != currentLanguage || observedReload != RELOAD.get()) {
                    world = client.level; language = currentLanguage; observedReload = RELOAD.get();
                    var snapshot = snapshot();
                    LIVE_COUNTS=snapshot.catalogCounts();
                    Map<String, java.util.function.Supplier<java.util.Iterator<JsonObject>>> sources = new java.util.LinkedHashMap<>();
                    RegistrySnapshot.KINDS.forEach((kind, path) -> sources.put("minecraft:" + path, () -> snapshot.iterator(Identifier.withDefaultNamespace(path))));
                    warmup = new RegistryWarmup(Long.toString(GENERATION.incrementAndGet()), sources,true);
                    SearchChannel.reset(warmup.generation());
                    DOCUMENTS.values().forEach(state -> { state.generation = null; state.pages.clear(); state.interactive.clear(); state.waiting.clear();state.legacyCatalogs.clear(); });
                    RESOURCE_CACHE.clear();EXTRA_COUNTS.clear();
                    if(DOCUMENTS.values().stream().anyMatch(state->state.features.enabled())){
                        for(String source:LAZY_SOURCES)SearchChannel.prepare(source);
                        DOCUMENTS.values().forEach(state->{if(state.features.enabled())state.featureReplyPending=true;});
                    }
                }
                warmup.tick();
                SearchChannel.tick();
                // A page-load hook precedes scripts; wait until listeners actually exist.
                long pushStart = 0; int count = 0; String pushedKey = null;
                for (var entry : java.util.List.copyOf(DOCUMENTS.entrySet())) {
                    var d = entry.getKey();
                    var state = entry.getValue();
                    if (d.serverSession() || d.document() == null) continue;
                    boolean changed=d.document()!=state.document;
                    if(changed){
                        state.document = d.document(); state.features.document(d.document()); state.pending = true; state.pages.clear(); state.interactive.clear(); state.generation = null;state.legacyCatalogs.clear();if(!state.features.enabled())state.featureReplyPending=false;
                    }
                    if(state.featureReplyPending){
                        var known=SearchChannel.counts();if(LAZY_SOURCES.stream().anyMatch(raw->known.getOrDefault(SearchChannel.canonical(raw),-1)<0))continue;
                        featureReply(d,state);state.featureReplyPending=false;
                    }
                    if (!changed && (state.pending || !warmup.generation().equals(state.generation)) && warmup.complete()) {
                        state.pending = false; publish(d);
                    }
                    if(state.features.enabled()&&state.meta!=null&&warmup.complete()){
                        JsonObject lazy=lazyCounts();String signature=lazy.toString();
                        if(!signature.equals(state.lazySignature)){state.lazySignature=signature;state.meta.add("lazy",lazy);queue(d,"registry.meta",state.meta.toString());}
                    }
                    if (warmup.complete() && !state.waiting.isEmpty()) {
                        // Requests queued during warmup must not all materialize in one frame.
                        state.waiting.removeFirst().run();
                    }
                    // The deadline and page cap are shared by all documents. Never start another
                    // synchronous patch after the deadline; a running patch cannot be preempted.
                    while ((!state.interactive.isEmpty() || !state.pages.isEmpty()) && count < MAX_PUSH_PAGES) {
                        long now = System.nanoTime();
                        if (pushStart == 0) pushStart = now;
                        long remaining = PUSH_BUDGET_NS - (now - pushStart);
                        if (remaining <= 0 || (count > 0 && remaining < estimatedPageNs)) break;
                        var queue = state.interactive.isEmpty() ? state.pages : state.interactive;
                        var batch = queue.entrySet().iterator().next();
                        if (!batch.getValue().pages.hasNext()) { queue.remove(batch.getKey()); continue; }
                        if (System.nanoTime() - pushStart >= PUSH_BUDGET_NS) break;
                        long pageStart = System.nanoTime();
                        d.patchJson(batch.getValue().key, batch.getValue().pages.next());
                        long pageNs = System.nanoTime() - pageStart;
                        maxPageNs = Math.max(maxPageNs, pageNs);
                        estimatedPageNs = Math.max(50_000, Math.max(pageNs, estimatedPageNs * 3 / 4));
                        count++;
                        pushedKey = batch.getValue().key;
                        queue.remove(batch.getKey());
                        // Round-robin ready interactive responses, retaining each iterator's offset.
                        if (batch.getValue().pages.hasNext()) queue.put(batch.getKey(), batch.getValue());
                    }
                }
                long pushNs = pushStart == 0 ? 0 : System.nanoTime() - pushStart;
                if (pushNs > PUSH_BUDGET_NS) pushBudgetOverruns++;
                maxPagesPerTick = Math.max(maxPagesPerTick, count);
                if (pushNs / 1_000_000.0 > maxPushMs) { maxPushMs = pushNs / 1_000_000.0; maxPushKey = pushedKey; }
                maxRegistryTickMs = Math.max(maxRegistryTickMs, (System.nanoTime() - registryTickStart) / 1_000_000.0);
            });
    }
    public static JsonObject performance() {
        JsonObject metrics = warmup == null ? new JsonObject() : warmup.metrics(); metrics.addProperty("max_push_tick_ms", maxPushMs); metrics.addProperty("max_push_key", maxPushKey); metrics.addProperty("max_registry_tick_ms", maxRegistryTickMs);
        metrics.addProperty("push_budget_ms", PUSH_BUDGET_NS / 1_000_000.0); metrics.addProperty("max_push_page_ms", maxPageNs / 1_000_000.0);
        metrics.addProperty("max_push_pages_per_tick", maxPagesPerTick); metrics.addProperty("push_budget_overruns", pushBudgetOverruns); return metrics;
    }
    private static RegistrySnapshot snapshot() {
        var mc = Minecraft.getInstance();
        if (!mc.isSameThread()) throw new IllegalStateException("注册表只能在客户端线程读取");
        if (mc.level == null) throw new IllegalStateException("已经离开世界");
        return new RegistrySnapshot(mc.level.registryAccess(), id -> {
            var events = mc.getSoundManager().getSoundEvent(id);
            return events == null ? null : events.getSubtitle();
        });
    }
    private static void publish(DocumentDriver driver) {
        if (warmup == null || !warmup.complete()) return;
        String generation = warmup.generation();
        State state = DOCUMENTS.get(driver); state.generation = generation;
        JsonObject meta = new JsonObject();
        meta.addProperty("version", 1); meta.addProperty("mc_version", SharedConstants.getCurrentVersion().name());
        meta.addProperty("locale", Minecraft.getInstance().getLanguageManager().getSelected());
        meta.addProperty("generated_at", java.time.Instant.now().toString());
        meta.addProperty("generation", generation);
        JsonArray mods = new JsonArray();
        FabricLoader.getInstance().getAllMods().stream().map(m -> m.getMetadata().getId()).sorted().forEach(mods::add);
        meta.add("mods", mods); JsonObject counts = new JsonObject(); meta.add("counts", counts);
        RegistrySnapshot.KINDS.forEach((kind, path) -> {
            RegistryIndex index = warmup.index("minecraft:" + path); counts.addProperty(kind, index == null ? 0 : index.size);
        });
        meta.add("performance", performance());
        if(state.features.enabled()){JsonObject lazy=lazyCounts();meta.add("lazy",lazy);state.lazySignature=lazy.toString();state.meta=meta;}
        queue(driver, "registry.meta", meta.toString());
        RegistrySnapshot.KINDS.forEach((kind, path) -> {
            RegistryIndex index = warmup.index("minecraft:" + path);
            if (index != null && !(state.features.enabled()&&dev.rinorsi.editor.registry.search.LazyCatalog.lazy(kind,index.size))) initialPages(driver,"registry."+kind,index,false);
        });
        // The pattern registry no longer contains template items in 26.1.2. Enrich the initial
        // pattern publication from actual smithing recipes on the integrated-server thread.
        JsonObject patterns = new JsonObject(); patterns.addProperty("name", "trim_patterns");
        if(!state.features.enabled()||!dev.rinorsi.editor.registry.search.LazyCatalog.lazy("trim_patterns",warmup.index("minecraft:trim_pattern").size))supplementRequest(driver, patterns, "trim_patterns", false);
    }
    private static void initialPages(DocumentDriver driver,String key,RegistryIndex index,boolean priority){
        if(!index.indexOnly()){queuePages(driver,key,index.pages(),new JsonObject(),priority);return;}
        Object document=driver.document();String generation=index.generation;
        State state=DOCUMENTS.get(driver);if(state==null)return;
        var encoded=state.features.enabled()?SearchChannel.legacyPages(index.name,generation):state.legacyCatalogs.computeIfAbsent(index.name,catalogName->SearchChannel.legacyPages(catalogName,generation));
        encoded.whenComplete((pages,error)->Minecraft.getInstance().execute(()->{
            if(!DOCUMENTS.containsKey(driver)||driver.document()!=document||warmup==null||!generation.equals(warmup.generation()))return;
            if(error!=null){JsonObject failure=RegistryPages.split(index.name,generation,new JsonArray()).getFirst();failure.addProperty("error",String.valueOf(error.getMessage()));queuePages(driver,key,java.util.List.of(failure.toString()),new JsonObject(),priority);}
            else queuePages(driver,key,pages,new JsonObject(),priority);
        }));
    }
    private static void featureReply(DocumentDriver driver,State state){
        JsonObject reply=new JsonObject();JsonArray accepted=new JsonArray();if(state.features.enabled())accepted.add(dev.rinorsi.editor.registry.search.LazyCatalog.FEATURE);reply.add("accepted",accepted);reply.add("lazy",state.features.enabled()?lazyCounts():new JsonObject());driver.patch("registry.client_features",reply);
    }
    private static JsonObject lazyCounts(){
        Map<String,Integer> all=new java.util.TreeMap<>();
        if(Minecraft.getInstance().level!=null)LIVE_COUNTS.forEach((kind,count)->{
            if(dev.rinorsi.editor.registry.search.LazyCatalog.lazy(kind,count)){all.put(kind,count);if(kind.startsWith("tags:minecraft:"))all.put("tags:"+kind.substring(15),count);}
        });
        RegistrySnapshot.KINDS.forEach((alias,path)->{Integer count=all.get("minecraft:"+path);if(count!=null)all.put(alias,count);});
        SearchChannel.counts().forEach((kind,count)->{if(count>=0&&dev.rinorsi.editor.registry.search.LazyCatalog.lazy(kind,count)){all.put(kind,count);if(kind.startsWith("tags:minecraft:"))all.put("tags:"+kind.substring(15),count);if(kind.equals("minecraft:loot_table")){all.put("loot_table",count);all.put("loot_tables",count);}if(kind.equals("minecraft:recipe")){all.put("recipe",count);all.put("recipes",count);}}});
        EXTRA_COUNTS.forEach((kind,count)->{if(dev.rinorsi.editor.registry.search.LazyCatalog.lazy(kind,count)){all.put(kind,count);all.put(SearchChannel.canonical(kind),count);}});
        JsonObject lazy=new JsonObject();all.forEach((kind,count)->{JsonObject value=new JsonObject();value.addProperty("count",count);lazy.add(kind,value);});return lazy;
    }
    private static void queue(DocumentDriver driver, String key, String json) { queuePages(driver, key, java.util.List.of(json)); }
    private static void queuePages(DocumentDriver driver, String key, java.util.List<String> json) {
        queuePages(driver, key, json, new JsonObject());
    }
    private static void queuePages(DocumentDriver driver, String key, java.util.List<String> json, JsonObject context) {
        queuePages(driver, key, json, context, true);
    }
    private static void queuePages(DocumentDriver driver, String key, java.util.List<String> json, JsonObject context, boolean priority) {
        State state = DOCUMENTS.get(driver); if (state == null) return;
        // Coalesce identical requests, never two different relation/item/tag ids sharing a response key.
        String requestKey = key + "|" + context;
        var queue = priority ? state.interactive : state.pages;
        Batch promoted = priority ? state.pages.remove(requestKey) : null;
        // A duplicate in flight keeps its cursor: restarting offset zero can starve done.
        if (priority && queue.containsKey(requestKey)) return;
        queue.remove(requestKey);
        if (queue.size() >= 64) queue.remove(queue.keySet().iterator().next());
        queue.put(requestKey, promoted == null ? new Batch(key, json.iterator()) : promoted);
    }
    private static void request(DocumentDriver driver, JsonElement value) {
        if (driver.serverSession() || value == null || !value.isJsonObject() || value.toString().length() > 8192) return;
        JsonObject request = value.getAsJsonObject();
        if (!request.has("name") || !request.get("name").isJsonPrimitive() || !request.getAsJsonPrimitive("name").isString()) return;
        String raw = request.get("name").getAsString();
        if (raw.length() > 247) return;
        State negotiated=DOCUMENTS.get(driver);if(negotiated==null)return;
        negotiated.features.document(driver.document());
        java.util.List<String> features=new java.util.ArrayList<>();
        if(raw.equals("client_features")&&request.has("features")&&request.get("features").isJsonArray())for(var feature:request.getAsJsonArray("features"))if(feature.isJsonPrimitive()&&feature.getAsJsonPrimitive().isString())features.add(feature.getAsString());
        boolean lazy=negotiated.features.message(raw,features);
        if(raw.equals("client_features")){
            if(lazy){for(String source:LAZY_SOURCES)SearchChannel.prepare(source);negotiated.featureReplyPending=true;negotiated.pages.clear();negotiated.legacyCatalogs.clear();negotiated.pending=true;}
            else featureReply(driver,negotiated);
            return;
        }
        if (EntityRegistryChannel.supports(raw) && (Minecraft.getInstance().level == null || !snapshot().containsRegistry(Identifier.tryParse(raw)))) {
            EntityRegistryChannel.request(request, raw, (pages, context) -> queuePages(driver, "registry." + raw, pages, context));
            return;
        }
        if (raw.equals("item_meta") || raw.equals("item_meta_one")) {
            JsonObject context = new JsonObject();
            if (request.has("id")) context.add("id", request.get("id"));
            try {
                var mc = Minecraft.getInstance();
                if (mc.level == null) throw new IllegalArgumentException("已经离开世界");
                Identifier only = raw.equals("item_meta_one") ? Identifier.parse(dev.rinorsi.editor.StackCodec.string(request, "id")) : null;
                var entries = ItemMetadata.entries(mc.level.registryAccess(), only);
                queuePages(driver, "registry." + raw, RegistryPages.split(raw, Long.toString(GENERATION.get()), entries, context).stream().map(Object::toString).toList(), context);
            } catch (RuntimeException e) {
                var error = RegistryPages.split(raw, Long.toString(GENERATION.get()), new JsonArray(), context).getFirst();
                error.addProperty("error", e.getMessage()); queuePages(driver, "registry." + raw, java.util.List.of(error.toString()), context);
            }
            return;
        }
        if (RegistrySupplement.handles(raw)) { supplementRequest(driver, request, raw); return; }
        // Initial registries are served only from the generation index, never recaptured at page-open/request time.
        String initialName = RegistrySnapshot.initialName(raw);
        boolean initial = RegistrySnapshot.KINDS.values().stream().anyMatch(path -> initialName.equals("minecraft:" + path) || initialName.equals(path));
        if (initial && !request.has("field")) {
            State state = DOCUMENTS.get(driver);
            if (warmup == null || !warmup.complete()) {
                if (state != null && state.waiting.size() < 64) {
                    Object document = driver.document();
                    state.waiting.add(() -> { if (driver.document() == document) request(driver, request); });
                }
                return;
            }
            RegistryIndex index = warmup.index(Identifier.parse(initialName).toString());
            if (index != null) initialPages(driver,"registry."+raw,index,true);
            return;
        }
        if (raw.equals("tooltip_style") || raw.equals("item_model_hints") || ResourceIds.handles(raw)) {
            resourceRequest(driver, request, raw); return;
        }
        RegistrySnapshot snapshot;
        try { snapshot = snapshot(); } catch (RuntimeException e) { return; }
        boolean literalRegistry = snapshot.containsRegistry(Identifier.tryParse(raw));
        boolean tags = !literalRegistry && raw.startsWith("tags:"), tag = !literalRegistry && raw.startsWith("tag:"), enumeration = !literalRegistry && raw.startsWith("enum:");
        Identifier name = Identifier.tryParse(tags ? raw.substring(5) : tag ? raw.substring(4) : raw);
        if (!enumeration && name == null) return;
        boolean relation = raw.equals("minecraft:enchantment") && request.has("id") && request.has("field");
        JsonObject context = new JsonObject();
        if (relation) {
            for (String field : new String[]{"id", "field"}) {
                if (!request.get(field).isJsonPrimitive() || !request.getAsJsonPrimitive(field).isString()) return;
                context.add(field, request.get(field));
            }
        }
        if (tag) {
            if (!request.has("id") || !request.get("id").isJsonPrimitive() || !request.getAsJsonPrimitive("id").isString()) return;
            context.add("id", request.get("id")); context.addProperty("field", "members");
        }
        if (!literalRegistry && raw.equals("item_defaults_one")) {
            if (!request.has("id") || !request.get("id").isJsonPrimitive() || !request.getAsJsonPrimitive("id").isString()) return;
            context.add("id", request.get("id"));
        }
        String key = relation ? "registry.relation" : "registry." + raw;
        String generation = warmup == null ? Long.toString(GENERATION.get()) : warmup.generation();
        try {
            JsonArray entries;
            if (!literalRegistry && (raw.equals("item_defaults") || raw.equals("item_defaults_one"))) {
                Identifier only = raw.equals("item_defaults_one") ? Identifier.parse(request.get("id").getAsString()) : null;
                entries = ItemDefaults.entries(Minecraft.getInstance().level.registryAccess(), only);
                queuePages(driver, key, RegistryPages.split(raw, generation, entries, context).stream().map(Object::toString).toList(), context);
            } else if (tag) {
                entries = snapshot.tagMembers(name, Identifier.parse(request.get("id").getAsString()));
                queuePages(driver, key, RegistryPages.split(raw, generation, entries, context).stream().map(Object::toString).toList(), context);
            } else if (tags) {
                send(driver, key, raw, generation, snapshot.tags(name));
            } else if (enumeration) {
                send(driver, key, raw, generation, RegistryChoices.enumEntries(raw.substring(5)));
            } else if (!literalRegistry && raw.equals("equipment_asset")) {
                send(driver, key, raw, generation, RegistryChoices.equipmentAssets(Minecraft.getInstance().getResourceManager()));
            } else if (relation) {
                String id = request.get("id").getAsString(), field = request.get("field").getAsString();
                entries = snapshot.relation(Identifier.parse(id), field);
                queuePages(driver, key, RegistryPages.split(raw, generation, entries, context).stream().map(Object::toString).toList(), context);
            } else { entries = snapshot.entries(name); send(driver, key, raw, generation, entries); }
        } catch (RuntimeException e) {
            JsonObject error = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst();
            error.addProperty("error", e.getMessage()); queuePages(driver, key, java.util.List.of(error.toString()), context);
        }
    }
    private static void send(DocumentDriver driver, String key, String name, String generation, JsonArray entries) {
        try { queuePages(driver, key, RegistryPages.split(name, generation, entries).stream().map(Object::toString).toList()); }
        catch (IllegalArgumentException e) {
            JsonObject error = RegistryPages.split(name, generation, new JsonArray()).getFirst();
            error.addProperty("error", e.getMessage()); queue(driver, key, error.toString());
        }
    }
    private static void supplementRequest(DocumentDriver driver, JsonObject request, String raw) {
        supplementRequest(driver, request, raw, true);
    }
    private static void supplementRequest(DocumentDriver driver, JsonObject request, String raw, boolean priority) {
        var mc = Minecraft.getInstance();
        if (warmup == null || mc.level == null) return;
        String generation = warmup.generation(); JsonObject context = new JsonObject();
        Identifier only = null;
        try {
            if (raw.equals("block_properties") && request.has("id")) {
                if (!request.get("id").isJsonPrimitive() || !request.getAsJsonPrimitive("id").isString())
                    throw new IllegalArgumentException("方块 ID 必须是字符串");
                context.add("id", request.get("id")); only = Identifier.parse(request.get("id").getAsString());
            }
            String cacheKey = "supplement:" + raw + ":" + context;
            if (!RESOURCE_CACHE.containsKey(cacheKey)) {
                if (RESOURCE_CACHE.values().stream().filter(f -> !f.isDone()).count() >= 8)
                    throw new IllegalArgumentException("注册表索引繁忙，请稍后重试");
                if (RESOURCE_CACHE.size() >= 64) RESOURCE_CACHE.entrySet().stream().filter(e -> e.getValue().isDone())
                        .map(Map.Entry::getKey).findFirst().ifPresent(RESOURCE_CACHE::remove);
                var result = RegistrySupplement.read(mc, raw, only);
                RESOURCE_CACHE.put(cacheKey, result.thenCompose(value -> RegistryWarmup.async(() -> {
                    if(!raw.equals("block_properties")&&SearchChannel.currentGeneration(generation))EXTRA_COUNTS.put(raw,value.entries().size());
                    JsonObject envelope = context.deepCopy(); value.context().entrySet().forEach(e -> envelope.add(e.getKey(), e.getValue()));
                    return RegistryPages.split(raw, generation, value.entries(), envelope).stream().map(Object::toString).toList();
                })).exceptionally(error -> {
                    JsonObject page = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst();
                    page.addProperty("error", String.valueOf(error.getMessage())); return java.util.List.of(page.toString());
                }));
            }
            Object document = driver.document();
            RESOURCE_CACHE.get(cacheKey).thenAccept(pages -> mc.execute(() -> {
                if (warmup != null && generation.equals(warmup.generation()) && DOCUMENTS.containsKey(driver) && driver.document() == document)
                    {queuePages(driver, "registry." + raw, pages, context, priority);if(DOCUMENTS.get(driver).features.enabled()&&dev.rinorsi.editor.registry.search.LazyCatalog.lazy(raw,EXTRA_COUNTS.getOrDefault(raw,0)))RESOURCE_CACHE.remove(cacheKey);}
            }));
        } catch (RuntimeException error) {
            JsonObject page = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst();
            page.addProperty("error", String.valueOf(error.getMessage())); queuePages(driver, "registry." + raw, java.util.List.of(page.toString()), context, priority);
        }
    }
    private static void resourceRequest(DocumentDriver driver, JsonObject request, String raw) {
        var mc = Minecraft.getInstance();
        if (warmup == null || mc.level == null) return;
        var resources = mc.getResourceManager(); String generation = warmup.generation();
        JsonObject context = new JsonObject(); Identifier model = null;
        if (raw.equals("item_model_hints")) {
            if (!request.has("id") || !request.get("id").isJsonPrimitive() || !request.getAsJsonPrimitive("id").isString()) return;
            context.add("id", request.get("id")); model = Identifier.tryParse(request.get("id").getAsString());
            if (model == null) { JsonObject error = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst(); error.addProperty("error", "无效模型id"); queuePages(driver, "registry." + raw, java.util.List.of(error.toString()), context); return; }
            var item = net.minecraft.core.registries.BuiltInRegistries.ITEM.getOptional(model);
            if (item.isPresent()) {
                var component = item.get().components().get(net.minecraft.core.component.DataComponents.ITEM_MODEL);
                if (component != null) model = component;
            }
        }
        String cacheKey = raw + ":" + context; Identifier resolvedModel = model;
        if (!RESOURCE_CACHE.containsKey(cacheKey) && RESOURCE_CACHE.values().stream().filter(f -> !f.isDone()).count() >= 8) {
            JsonObject error = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst(); error.addProperty("error", "资源索引繁忙，请稍后重试"); queuePages(driver, "registry." + raw, java.util.List.of(error.toString()), context); return;
        }
        if (!RESOURCE_CACHE.containsKey(cacheKey) && RESOURCE_CACHE.size() >= 64) RESOURCE_CACHE.entrySet().stream().filter(e -> e.getValue().isDone()).map(Map.Entry::getKey).findFirst().ifPresent(RESOURCE_CACHE::remove);
        var future = RESOURCE_CACHE.computeIfAbsent(cacheKey, key -> RegistryWarmup.async(() -> {
            java.util.List<String> pages = new java.util.ArrayList<>();
            try {
                JsonArray rows = ResourceIds.handles(raw) ? ResourceIds.entries(resources, raw)
                        : raw.equals("tooltip_style") ? RegistryChoices.tooltipStyles(resources) : ModelHints.read(resources, resolvedModel);
                if(!raw.equals("item_model_hints")&&SearchChannel.currentGeneration(generation))EXTRA_COUNTS.put(raw,rows.size());
                for (var page : RegistryPages.split(raw, generation, rows, context)) pages.add(page.toString());
            } catch (RuntimeException error) {
                JsonObject page = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst(); page.addProperty("error", error.getMessage()); pages.add(page.toString());
            }
            return java.util.List.copyOf(pages);
        }).exceptionally(error -> {
            JsonObject page = RegistryPages.split(raw, generation, new JsonArray(), context).getFirst(); page.addProperty("error", "资源索引队列繁忙，请稍后重试"); return java.util.List.of(page.toString());
        }));
        Object document = driver.document();
        future.thenAccept(pages -> mc.execute(() -> {
            if (warmup != null && generation.equals(warmup.generation()) && DOCUMENTS.containsKey(driver) && driver.document() == document)
                {queuePages(driver, "registry." + raw, pages, context);if(DOCUMENTS.get(driver).features.enabled()&&dev.rinorsi.editor.registry.search.LazyCatalog.lazy(raw,EXTRA_COUNTS.getOrDefault(raw,0)))RESOURCE_CACHE.remove(cacheKey);}
        }));
    }
}
