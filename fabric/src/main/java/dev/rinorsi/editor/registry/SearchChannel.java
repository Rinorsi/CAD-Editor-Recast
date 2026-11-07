package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.registry.search.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

/** Additive local-page search. MC capture stays on its owning thread; indexing/querying never does. */
public final class SearchChannel {
    private static final SearchCatalog CATALOG=new SearchCatalog();
    private static final ExecutorService QUERIES=new ThreadPoolExecutor(2,2,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32),r->{Thread t=new Thread(r,"cadeditor-search-query");t.setDaemon(true);return t;});
    private static final ExecutorService RESOURCES=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32),r->{Thread t=new Thread(r,"cadeditor-search-resources");t.setDaemon(true);return t;});
    private static final CompletableFuture<Pinyin> PINYIN=CompletableFuture.supplyAsync(()->{try{return new Pinyin(SearchChannel.class.getResourceAsStream("/assets/cadeditor/ui/js/pinyin-data.js"));}catch(Exception e){throw new CompletionException(e);}},RESOURCES);
    private static CompletableFuture<Map<String,String>> english=CompletableFuture.completedFuture(Map.of());
    private static final Map<DocumentDriver,Map<String,View>> VIEWS=new WeakHashMap<>();
    private static final ArrayDeque<Capture> CAPTURES=new ArrayDeque<>();
    private record Capture(String kind,String generation,Iterator<JsonObject> iterator,List<JsonObject> rows){}
    private static final class View {final SearchCatalog.Session session=new SearchCatalog.Session();Pending pending;int lastProgress=-1,lastTotal=-1;long lastUpdate;}
    private record Pending(String id,String kind,String query,int offset,int limit,Set<String> namespaces,Set<String> tags,Object document,String generation,long token){}
    private SearchChannel(){}
    public static void attach(DocumentDriver driver){
        VIEWS.put(driver,new LinkedHashMap<>());
        driver.onMessage("search",value->request(driver,value));
        driver.onClose(()->{Map<String,View> views=VIEWS.remove(driver);if(views!=null)views.values().forEach(v->v.session.cancel());});
    }
    public static void reset(String generation){
        CATALOG.reset(generation);CAPTURES.clear();
        VIEWS.values().forEach(views->views.values().forEach(v->{v.session.cancel();v.pending=null;}));
        if(Minecraft.getInstance().level==null)return;
        var resources=Minecraft.getInstance().getResourceManager();
        try { english=CompletableFuture.supplyAsync(()->{
            Map<String,String> names=new HashMap<>();
            resources.listResources("lang",id->id.getPath().equals("lang/en_us.json")).forEach((id,resource)->{
                try(var reader=resource.openAsReader()){JsonParser.parseReader(reader).getAsJsonObject().entrySet().forEach(e->{if(e.getValue().isJsonPrimitive())names.put(e.getKey(),e.getValue().getAsString());});}catch(Exception ignored){}
            });return Map.copyOf(names);
        },RESOURCES); } catch(RejectedExecutionException busy) { english=CompletableFuture.completedFuture(Map.of()); }
    }
    public static String canonical(String raw){
        if(raw.startsWith("tags:")){String suffix=raw.substring(5);return "tags:"+(suffix.indexOf(':')<0?"minecraft:":"")+suffix;}
        if(RegistrySnapshot.KINDS.containsKey(raw))return "minecraft:"+RegistrySnapshot.KINDS.get(raw);
        if(ResourceIds.handles(raw)||raw.equals("tooltip_style")||raw.equals("equipment_asset")||raw.startsWith("enum:"))return raw;
        if(raw.equals("recipes"))return "minecraft:recipe";if(raw.equals("loot_tables"))return "minecraft:loot_table";
        return raw.indexOf(':')<0?"minecraft:"+raw:raw;
    }
    public static void failed(String kind,String generation) { if(generation.equals(CATALOG.generation()))CATALOG.fail(canonical(kind),"INDEX_FAILED"); }
    /** Called only with detached JSON from the warmup worker or a completed capture. */
    public static void offer(String raw,String generation,List<JsonObject> rows){
        String kind=canonical(raw);
        if(!generation.equals(CATALOG.generation()))return;
        PINYIN.thenCombineAsync(english,(py,names)->{
            if(!generation.equals(CATALOG.generation()))return null;
            try{
                List<SearchIndex.Row> minimal=new ArrayList<>(rows.size());
                for(JsonObject row:rows){
                    String id=string(row,"id",""), name=string(row,"name",id), subtitle=string(row,"subtitle",string(row,"description",""));
                    List<String> tags=new ArrayList<>();if(row.has("tags")&&row.get("tags").isJsonArray())for(var tag:row.getAsJsonArray("tags"))tags.add(tag.getAsString());
                    String key=string(row,"translation_key","");
                    if(key.isEmpty()&&(kind.equals("minecraft:item")||kind.equals("minecraft:block")||kind.equals("minecraft:entity_type")||kind.equals("minecraft:mob_effect")||kind.equals("minecraft:enchantment"))){String type=kind.substring(10);if(type.equals("entity_type"))type="entity";if(type.equals("mob_effect"))type="effect";key=type+"."+id.replace(':','.').replace('/','.');}
                    minimal.add(new SearchIndex.Row(id,name,string(row,"english_name",names.getOrDefault(key,"")),subtitle,tags));
                }
                CATALOG.build(kind,generation,minimal,py);
            }catch(RuntimeException error){if(generation.equals(CATALOG.generation()))CATALOG.fail(kind,"INDEX_FAILED");}
            return null;
        },RESOURCES).exceptionally(error->{if(generation.equals(CATALOG.generation()))CATALOG.fail(kind,"INDEX_FAILED");return null;});
    }
    private static String string(JsonObject o,String key,String fallback){return o.has(key)&&o.get(key).isJsonPrimitive()?o.get(key).getAsString():fallback;}
    private static Set<String> filter(JsonObject o,String key){
        if(!o.has(key))return Set.of();if(!o.get(key).isJsonArray()||o.getAsJsonArray(key).size()>32)throw new IllegalArgumentException("BAD_REQUEST");
        Set<String> out=new HashSet<>();for(var e:o.getAsJsonArray(key)){if(!e.isJsonPrimitive()||!e.getAsJsonPrimitive().isString()||e.getAsString().length()>512)throw new IllegalArgumentException("BAD_REQUEST");out.add(e.getAsString());}return Set.copyOf(out);
    }
    private static void request(DocumentDriver driver,JsonElement value){
        if(driver.serverSession()||!VIEWS.containsKey(driver))return;
        String id="",kind="",view="";
        try{
            if(value==null||!value.isJsonObject()||value.toString().length()>8192)throw new IllegalArgumentException("BAD_REQUEST");JsonObject o=value.getAsJsonObject();
            for(String key:List.of("requestId","kind"))if(!o.has(key)||!o.get(key).isJsonPrimitive()||!o.getAsJsonPrimitive(key).isString()||o.get(key).getAsString().isEmpty())throw new IllegalArgumentException("BAD_REQUEST");
            for(String key:List.of("query","view"))if(o.has(key)&&(!o.get(key).isJsonPrimitive()||!o.getAsJsonPrimitive(key).isString()))throw new IllegalArgumentException("BAD_REQUEST");
            for(String key:List.of("offset","limit"))if(o.has(key)&&(!o.get(key).isJsonPrimitive()||!o.getAsJsonPrimitive(key).isNumber()||o.get(key).getAsDouble()!=o.get(key).getAsInt()))throw new IllegalArgumentException("BAD_REQUEST");
            id=string(o,"requestId","");kind=canonical(string(o,"kind",""));view=string(o,"view",kind);
            if(id.isEmpty()||id.length()>128||kind.length()>247||view.length()>128||view.isEmpty())throw new IllegalArgumentException("BAD_REQUEST");
            var views=VIEWS.get(driver);View state=views.get(view);if(state==null){if(views.size()>=8)throw new IllegalArgumentException("BUSY");state=new View();views.put(view,state);}long token=state.session.next();state.pending=null;
            if(o.has("cancel")&&o.get("cancel").getAsBoolean()){JsonObject result=base(id,kind);result.addProperty("cancelled",true);driver.patch("search.result",result);return;}
            String query=string(o,"query","");int offset=o.has("offset")?o.get("offset").getAsInt():0,limit=o.has("limit")?o.get("limit").getAsInt():80;
            if(query.length()>SearchIndex.MAX_QUERY||offset<0||offset>SearchIndex.MAX_OFFSET||limit<1||limit>SearchIndex.MAX_LIMIT)throw new IllegalArgumentException("BAD_REQUEST");
            JsonObject filters=o.has("filters")?o.getAsJsonObject("filters"):new JsonObject();
            Pending p=new Pending(id,kind,query,offset,limit,filter(filters,"namespaces"),filter(filters,"tags"),driver.document(),CATALOG.generation(),token);state.pending=p;
            SearchCatalog.Slot slot=CATALOG.slot(kind);if(slot==null){ensure(kind);slot=CATALOG.slot(kind);}
            JsonObject ack=base(id,kind);ack.addProperty("ready",false);ack.addProperty("progress",slot==null?0:slot.progress.get());ack.addProperty("total",slot==null?0:slot.total);ack.addProperty("phase",slot==null?"capturing":slot.index==null?"building":"querying");driver.patch("search.result",ack);
        }catch(RuntimeException error){sendError(driver,id,kind,error instanceof IllegalArgumentException&&Set.of("INDEX_LIMIT","BUSY","UNAVAILABLE").contains(String.valueOf(error.getMessage()))?error.getMessage():"BAD_REQUEST");}
    }
    private static JsonObject base(String id,String kind){JsonObject o=new JsonObject();o.addProperty("version",1);o.addProperty("requestId",id);o.addProperty("kind",kind);o.addProperty("generation",CATALOG.generation());return o;}
    private static void sendError(DocumentDriver d,String id,String kind,String code){JsonObject o=base(id,kind);o.addProperty("ready",false);o.addProperty("error",code);d.patch("search.result",o);}
    private static void ensure(String kind){
        var mc=Minecraft.getInstance();if(mc.level==null)throw new IllegalArgumentException("UNAVAILABLE");
        // Initial kinds are offered by their existing bounded warmup; do not recapture them.
        if(RegistrySnapshot.KINDS.values().stream().anyMatch(p->kind.equals("minecraft:"+p))){CATALOG.reserve(kind);return;}
        if(CAPTURES.size()>=8)throw new IllegalArgumentException("BUSY");
        String generation=CATALOG.generation();CATALOG.reserve(kind);
        try{
            if(ResourceIds.handles(kind)||kind.equals("tooltip_style")||kind.equals("equipment_asset")){
                var resources=mc.getResourceManager();CompletableFuture.runAsync(()->{
                    try{JsonArray rows=ResourceIds.handles(kind)?ResourceIds.entries(resources,kind):kind.equals("tooltip_style")?RegistryChoices.tooltipStyles(resources):RegistryChoices.equipmentAssets(resources);offer(kind,generation,objects(rows));}catch(RuntimeException error){if(generation.equals(CATALOG.generation()))CATALOG.fail(kind,"INDEX_FAILED");}
                },RESOURCES);return;
            }
            if(RegistrySupplement.handles(kind)){
                RegistrySupplement.read(mc,kind,null).whenComplete((result,error)->{
                    if(!generation.equals(CATALOG.generation()))return;
                    if(error!=null)CATALOG.fail(kind,"INDEX_FAILED");else if(result.context().has("availability")&&result.context().get("availability").getAsString().equals("unavailable"))CATALOG.fail(kind,"UNAVAILABLE");else offer(kind,generation,objects(result.entries()));
                });return;
            }
            Iterator<JsonObject> iterator;
            if(kind.startsWith("enum:"))iterator=objects(RegistryChoices.enumEntries(kind.substring(5))).iterator();
            else {RegistrySnapshot snapshot=new RegistrySnapshot(mc.level.registryAccess(),id->{var event=mc.getSoundManager().getSoundEvent(id);return event==null?null:event.getSubtitle();});
                iterator=kind.startsWith("tags:")?snapshot.tagIterator(Identifier.parse(kind.substring(5))):snapshot.iterator(Identifier.parse(kind));}
            CAPTURES.add(new Capture(kind,generation,iterator,new ArrayList<>()));
        }catch(RejectedExecutionException busy){CATALOG.fail(kind,"BUSY");}
        catch(RuntimeException error){CATALOG.fail(kind,"UNKNOWN_KIND");}
    }
    private static List<JsonObject> objects(JsonArray rows){List<JsonObject> out=new ArrayList<>(rows.size());for(var row:rows)out.add(row.getAsJsonObject());return out;}
    /** Client tick only: bounded live capture and bounded result delivery; no indexing/filtering here. */
    public static void tick(){
        long start=System.nanoTime();
        while(!CAPTURES.isEmpty()&&System.nanoTime()-start<350_000){var c=CAPTURES.peek();try{
            if(c.iterator().hasNext()){if(c.rows().size()>=SearchIndex.MAX_ROWS)throw new IllegalArgumentException("INDEX_LIMIT");c.rows().add(c.iterator().next());var slot=CATALOG.slot(c.kind());if(slot!=null)slot.progress.set(c.rows().size());}
            else {CAPTURES.remove();offer(c.kind(),c.generation(),c.rows());}
        }catch(RuntimeException error){CAPTURES.remove();CATALOG.fail(c.kind(),"INDEX_LIMIT".equals(error.getMessage())?"INDEX_LIMIT":"INDEX_FAILED");}}
        for(var entry:List.copyOf(VIEWS.entrySet()))for(var v:entry.getValue().values()){
            Pending p=v.pending;if(p==null)continue;if(entry.getKey().document()!=p.document()||!p.generation().equals(CATALOG.generation())){v.session.cancel();v.pending=null;continue;}
            var slot=CATALOG.slot(p.kind());if(slot==null)continue;if(slot.error!=null){sendError(entry.getKey(),p.id(),p.kind(),slot.error);v.pending=null;continue;}if(slot.index==null){
                int progress=slot.progress.get();long now=System.nanoTime();
                if((progress!=v.lastProgress||slot.total!=v.lastTotal)&&now-v.lastUpdate>250_000_000L){JsonObject status=base(p.id(),p.kind());status.addProperty("ready",false);status.addProperty("progress",progress);status.addProperty("total",slot.total);status.addProperty("phase",slot.total==0?"capturing":"building");entry.getKey().patch("search.result",status);v.lastProgress=progress;v.lastTotal=slot.total;v.lastUpdate=now;}
                continue;
            }
            v.pending=null;submit(entry.getKey(),v,p,slot.index);
        }
    }
    private static void submit(DocumentDriver driver,View view,Pending p,SearchIndex index){
        BooleanSupplier cancelled=()->view.session.cancelled(p.token()).getAsBoolean()||!p.generation().equals(CATALOG.generation());
        try{QUERIES.execute(()->{
            try{
                var result=index.query(p.query(),p.offset(),p.limit(),p.namespaces(),p.tags(),cancelled);
                if(cancelled.getAsBoolean())return;JsonObject json=base(p.id(),p.kind());json.addProperty("generation",p.generation());json.addProperty("ready",true);json.addProperty("offset",p.offset());json.addProperty("total",result.total());JsonArray rows=new JsonArray();int chars=0;
                for(var row:result.rows()){JsonObject r=new JsonObject();r.addProperty("id",row.id());r.addProperty("name",row.name());r.addProperty("namespace",row.namespace());if(!row.subtitle().isEmpty())r.addProperty("subtitle",row.subtitle());int length=r.toString().length();if(chars+length>14000)break;rows.add(r);chars+=length;}
                json.add("entries",rows);int next=p.offset()+rows.size();json.addProperty("nextOffset",next);json.addProperty("done",next>=result.total());JsonArray mods=new JsonArray();index.namespaces().entrySet().stream().sorted(Map.Entry.comparingByKey()).limit(512).forEach(e->{JsonObject m=new JsonObject();m.addProperty("id",e.getKey());m.addProperty("count",e.getValue());mods.add(m);});json.add("namespaces",mods);json.addProperty("namespacesTruncated",index.namespaces().size()>512);
                String wire=json.toString();if(wire.length()>24000){json.remove("namespaces");json.addProperty("namespacesTruncated",true);wire=json.toString();}final String encoded=wire;
                Minecraft.getInstance().execute(()->{if(!cancelled.getAsBoolean()&&VIEWS.containsKey(driver)&&driver.document()==p.document())driver.patchJson("search.result",encoded);});
            }catch(CancellationException ignored){}catch(RuntimeException error){Minecraft.getInstance().execute(()->{if(!cancelled.getAsBoolean()&&VIEWS.containsKey(driver)&&driver.document()==p.document())sendError(driver,p.id(),p.kind(),"QUERY_FAILED");});}
        });}catch(RejectedExecutionException error){sendError(driver,p.id(),p.kind(),"BUSY");}
    }
}
