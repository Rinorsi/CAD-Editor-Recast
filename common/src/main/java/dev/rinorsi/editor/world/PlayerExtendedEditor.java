package dev.rinorsi.editor.world;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.*;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.*;
import net.minecraft.resources.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.stats.*;
import net.minecraft.world.item.crafting.*;
import net.minecraft.world.level.storage.LevelData;
import org.slf4j.LoggerFactory;

/** Separate, bounded player views. Never feeds connected players through Entity.load. */
public final class PlayerExtendedEditor {
    private PlayerExtendedEditor() {}
    private static final org.slf4j.Logger LOG=LoggerFactory.getLogger("PlayerExtendedEditor");
    private record Key(UUID target, boolean offline, String view) {}
    private record State(String revision, String fingerprint, JsonElement snapshot) {}
    private static final Map<UUID,LinkedHashMap<Key,State>> SESSIONS=new HashMap<>();
    private static final Map<UUID,Long> LAST=new HashMap<>();
    public static void remove(UUID id){SESSIONS.remove(id);LAST.remove(id);}
    public static void clear(){SESSIONS.clear();LAST.clear();}
    public static boolean route(ServerPlayer actor,JsonObject request,Supplier<EditorPolicy> policy,Consumer<JsonObject> sink){
        if(!request.has("op")||!request.get("op").isJsonPrimitive()||!"player_extended".equals(request.get("op").getAsString()))return false;
        String id="",view="",action="";UUID uuid=null;boolean writing=false,committed=false;
        try {
            var server=actor.level().getServer();
            if(!server.isSameThread())fail("invalid_request","玩家编辑必须在服务端线程执行");
            id=StackCodec.string(request,"requestId");if(id.length()>80)fail("invalid_request","requestId 过长");
            policy.get().requirePlayerEdit(actor);
            keys(request,Set.of("op","requestId","action","target","view","offset","limit","query","revision","patch"));
            var target=StackCodec.object(request,"target");keys(target,Set.of("uuid","offline"));
            boolean offline=target.has("offline")&&bool(target,"offline");
            uuid=target.has("uuid")?UUID.fromString(StackCodec.string(target,"uuid")):actor.getUUID();
            view=StackCodec.string(request,"view");action=StackCodec.string(request,"action");
            if(!Set.of("position","respawn","recipes","advancements","stats","offline").contains(view)||offline!=view.equals("offline"))fail("invalid_request","玩家视图与在线状态不匹配");
            if(offline&&!target.has("uuid"))fail("invalid_request","离线玩家必须指定 UUID");
            if(view.equals("advancements")&&!uuid.equals(actor.getUUID()))fail("advancement_self_only","成就只能读取或修改自己的数据");
            if(!action.equals("read")&&!action.equals("apply"))fail("invalid_request","未知玩家扩展操作");
            long now=System.nanoTime();Long last=LAST.get(actor.getUUID());if(last!=null&&now-last<500_000_000L)fail("rate_limited","操作过快，请稍后重试");LAST.put(actor.getUUID(),now);
            var p=offline?null:server.getPlayerList().getPlayer(uuid);
            if(!offline&&p==null)fail("player_offline","目标玩家不在线或不存在");
            var file=offline?OfflinePlayerEdit.read(server,uuid):null;
            JsonElement value=offline?file.value():value(p,view);
            String before=offline?file.fingerprint():hash(value.toString());
            var key=new Key(uuid,offline,view);var states=SESSIONS.computeIfAbsent(actor.getUUID(),x->new LinkedHashMap<>());
            if(action.equals("apply")){
                var state=states.get(key);
                if(state==null)fail("session_lost","玩家编辑会话已失效，请重新读取后核对草稿");
                if(!state.revision.equals(StackCodec.string(request,"revision")))fail("target_changed","页面版本已变化，请重新读取后核对草稿");
                if(!request.has("patch"))fail("invalid_request","缺少 patch");
                JsonElement patch=request.get("patch");
                if(Set.of("recipes","advancements","stats").contains(view))patch=mergeEntries(view,state.snapshot,value,patch);
                else if(!state.fingerprint.equals(before))fail("target_changed","数据已变化，请重新读取后核对草稿");
                envelope(uuid,offline,view,value,schema(server,view,file),request,"preview");
                Runnable write=offline?OfflinePlayerEdit.prepare(server,uuid,file,patch):prepare(p,view,patch);
                policy.get().requirePlayerEdit(actor);
                if(!offline && (server.getPlayerList().getPlayer(uuid)!=p || !before.equals(hash(value(p,view).toString()))))
                    fail("target_changed","加载目标期间玩家数据已变化，请重新读取后核对草稿");
                writing=true;write.run();committed=true;
                file=offline?OfflinePlayerEdit.read(server,uuid):null;
                value=offline?file.value():value(p,view);
            }
            String fingerprint=offline?file.fingerprint():hash(value.toString());
            String revision=UUID.randomUUID().toString();
            var data=envelope(uuid,offline,view,value,schema(server,view,file),request,revision);
            var result=result(action.equals("apply")?"saved":"opened",id);result.add("playerExtended",data);WorldWire.encode(result);
            states.remove(key);states.put(key,new State(revision,fingerprint,value));while(states.size()>24)states.remove(states.keySet().iterator().next());
            if(action.equals("apply"))LOG.info("[CAD-Editor-Player] actor={} target={} offline={} view={} before={} after={}",actor.getUUID(),uuid,offline,view,before,fingerprint);
            sink.accept(result);
        }catch(RuntimeException e){
            String code=committed || (writing && !(e instanceof EditorSessions.Failure))?"write_uncertain":e instanceof EditorSessions.Failure f?f.code:"invalid_request";
            String reason=e.getMessage()==null?"玩家编辑失败，请重新读取核对":(e instanceof EditorSessions.Failure?e.getMessage():"请求格式或玩家数据无效："+e.getMessage());
            if(code.equals("write_uncertain"))reason="原版写入或回执处理异常，操作可能已生效；请重新读取核对，不要自动重试。"+reason;
            LOG.warn("[CAD-Editor-Player] denied actor={} target={} action={} view={} request={} code={} reason={}",actor.getUUID(),uuid,action,view,id,code,reason);
            var result=result("rejected",id);result.addProperty("code",code);result.addProperty("reason",reason.substring(0,Math.min(reason.length(),1200)));sink.accept(result);
        }
        return true;
    }
    private static JsonObject result(String status,String id){var r=new JsonObject();r.addProperty("status",status);r.addProperty("requestId",id);return r;}
    static void fail(String code,String reason){throw new EditorSessions.Failure(code,reason);}
    static void keys(JsonObject o,Set<String> allowed){for(String k:o.keySet())if(!allowed.contains(k))fail("protected_field","不支持的玩家字段："+k);}
    static boolean bool(JsonObject o,String k){var v=o.get(k);if(v==null||!v.isJsonPrimitive()||!v.getAsJsonPrimitive().isBoolean())fail("invalid_request",k+" 必须为布尔值");return v.getAsBoolean();}
    static String hash(String s){return hash(s.getBytes(StandardCharsets.UTF_8));}
    static String hash(byte[] b){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}catch(Exception e){throw new IllegalStateException(e);}}
    private static JsonObject schema(MinecraftServer server,String view,OfflinePlayerEdit.Snapshot file){
        var s=new JsonObject();s.addProperty("manualId",true);
        switch(view){
            case "position","respawn" -> {s.addProperty("source","MinecraftServer.getAllLevels");var dims=new JsonArray();server.getAllLevels().forEach(l->dims.add(l.dimension().identifier().toString()));s.add("dimensions",dims);}
            case "recipes" -> s.addProperty("source","RecipeManager / ServerRecipeBook");
            case "advancements" -> {s.addProperty("source","ServerAdvancementManager / PlayerAdvancements");s.addProperty("selfOnly",true);}
            case "stats" -> {s.addProperty("source","BuiltInRegistries.STAT_TYPE / StatType.getRegistry");s.addProperty("min",0);s.addProperty("max",Integer.MAX_VALUE);}
            case "offline" -> {s.addProperty("source","vanilla player load/save");s.addProperty("backupRetention",OfflinePlayerEdit.RETENTION);var ks=new JsonArray();new TreeSet<>(file.editable().keySet()).forEach(ks::add);s.add("editableKeys",ks);}
        }return s;
    }
    private static JsonObject envelope(UUID id,boolean offline,String view,JsonElement value,JsonObject schema,JsonObject req,String revision){
        int offset=req.has("offset")?StackCodec.integer(req,"offset",0,Integer.MAX_VALUE):0;int limit=req.has("limit")?StackCodec.integer(req,"limit",1,64):32;
        String query=req.has("query")?StackCodec.string(req,"query").toLowerCase(Locale.ROOT):"";if(query.length()>200)fail("invalid_request","搜索词过长");
        var data=new JsonObject();var target=new JsonObject();target.addProperty("uuid",id.toString());target.addProperty("offline",offline);data.add("target",target);data.addProperty("view",view);data.addProperty("revision",revision);data.add("schema",schema);
        data.addProperty("offset",offset);data.addProperty("total",1);data.add("nextOffset",JsonNull.INSTANCE);
        if(value.isJsonObject()&&value.getAsJsonObject().has("entries")){
            var matches=new ArrayList<JsonElement>();for(var raw:value.getAsJsonObject().getAsJsonArray("entries")){var row=raw.getAsJsonObject();if(query.isEmpty()||row.get("id").getAsString().toLowerCase(Locale.ROOT).contains(query)||(row.has("type")&&row.get("type").getAsString().contains(query)))matches.add(raw);}
            var entries=new JsonArray();int end=Math.min(offset,matches.size());int chars=0;
            while(end<matches.size()&&entries.size()<limit){var row=matches.get(end);int size=row.toString().length();if(chars+size>18000&&entries.size()>0)break;if(size>18000)fail("payload_too_large","单个玩家条目超过页面上限");entries.add(row);chars+=size;end++;}
            var page=new JsonObject();page.add("entries",entries);data.add("value",page);data.addProperty("total",matches.size());if(end<matches.size())data.addProperty("nextOffset",end);
        }else data.add("value",value);
        WorldWire.encode(data);return data;
    }
    public static JsonElement value(ServerPlayer p,String view){
        var server=p.level().getServer();var out=new JsonObject();
        if(view.equals("position")){out.addProperty("dimension",p.level().dimension().identifier().toString());out.addProperty("x",p.getX());out.addProperty("y",p.getY());out.addProperty("z",p.getZ());out.addProperty("yaw",p.getYRot());out.addProperty("pitch",p.getXRot());return out;}
        if(view.equals("respawn")){var config=p.getRespawnConfig();if(config==null)return JsonNull.INSTANCE;var r=config.respawnData();out.addProperty("dimension",r.dimension().identifier().toString());out.addProperty("x",r.pos().getX());out.addProperty("y",r.pos().getY());out.addProperty("z",r.pos().getZ());out.addProperty("yaw",r.yaw());out.addProperty("forced",config.forced());return out;}
        var entries=new JsonArray();out.add("entries",entries);
        switch(view){
            case "recipes" -> {var packed=p.getRecipeBook().pack();var known=new HashSet<>(packed.known());var highlighted=new HashSet<>(packed.highlight());for(var recipe:server.getRecipeManager().getRecipes().stream().sorted(Comparator.comparing(r->r.id().identifier().toString())).toList()){var row=new JsonObject();row.addProperty("id",recipe.id().identifier().toString());row.addProperty("unlocked",known.contains(recipe.id()));row.addProperty("highlighted",highlighted.contains(recipe.id()));entries.add(row);}}
            case "advancements" -> {for(var a:server.getAdvancements().getAllAdvancements().stream().sorted(Comparator.comparing(a->a.id().toString())).toList()){var progress=p.getAdvancements().getOrStartProgress(a);var row=new JsonObject();row.addProperty("id",a.id().toString());row.addProperty("done",progress.isDone());var criteria=new JsonArray();for(String name:new TreeSet<>(a.value().criteria().keySet())){var c=new JsonObject();c.addProperty("name",name);c.addProperty("done",progress.getCriterion(name)!=null&&progress.getCriterion(name).isDone());criteria.add(c);}row.add("criteria",criteria);entries.add(row);}}
            case "stats" -> {for(var type:BuiltInRegistries.STAT_TYPE.stream().sorted(Comparator.comparing(t->BuiltInRegistries.STAT_TYPE.getKey(t).toString())).toList())statRows(p,type,entries);}
            default -> fail("invalid_request","未知玩家视图");
        }return out;
    }
    private static <T> void statRows(ServerPlayer p,StatType<T> type,JsonArray rows){for(var id:new TreeSet<>(type.getRegistry().keySet())){var row=new JsonObject();row.addProperty("type",BuiltInRegistries.STAT_TYPE.getKey(type).toString());row.addProperty("id",id.toString());row.addProperty("value",p.getStats().getValue(type.get(type.getRegistry().getValue(id))));rows.add(row);}}
    private static ServerLevel level(ServerPlayer p,JsonObject patch){var key=ResourceKey.create(Registries.DIMENSION,Identifier.parse(StackCodec.string(patch,"dimension")));var level=p.level().getServer().getLevel(key);if(level==null)fail("unknown_dimension","维度不在当前服务器中："+key.identifier());return level;}
    private static BlockPos position(ServerLevel level,JsonObject n,boolean integer){double x=number(n,"x",-30000000,30000000),y=number(n,"y",level.getMinY(),level.getMaxY()),z=number(n,"z",-30000000,30000000);if(integer&&(x!=Math.rint(x)||y!=Math.rint(y)||z!=Math.rint(z)))fail("invalid_request","重生点坐标必须为整数");var pos=BlockPos.containing(x,y,z);if(level.isOutsideBuildHeight(pos)||!level.getWorldBorder().isWithinBounds(pos))fail("protected_area","目标超出世界边界或建造高度");return pos;}
    private static double number(JsonObject n,String k,double min,double max){return PlayerWorldEdit.number(n,k,min,max);}
    private static JsonArray edits(JsonElement patch){var o=patch.getAsJsonObject();keys(o,Set.of("entries"));var entries=o.getAsJsonArray("entries");if(entries==null||entries.isEmpty()||entries.size()>64)fail("invalid_request","每次提交 1 至 64 项");return entries;}
    /** Validation produces a plan; no write occurs while parsing a batch. */
    public static Runnable prepare(ServerPlayer p,String view,JsonElement patch){
        var server=p.level().getServer();
        if(view.equals("position")){var n=patch.getAsJsonObject();keys(n,Set.of("dimension","x","y","z","yaw","pitch"));var level=level(p,n);var pos=position(level,n,false);double x=n.get("x").getAsDouble(),y=n.get("y").getAsDouble(),z=n.get("z").getAsDouble();float yaw=(float)number(n,"yaw",-360000,360000),pitch=(float)number(n,"pitch",-90,90);try{if(level.getChunk(pos.getX()>>4,pos.getZ()>>4)==null)fail("chunk_unavailable","无法加载传送目标区块");}catch(RuntimeException e){fail("chunk_unavailable","无法加载传送目标区块："+e.getMessage());}return ()->{if(!p.teleportTo(level,x,y,z,Set.of(),yaw,pitch,true))fail("teleport_failed","原版拒绝此次传送");};}
        if(view.equals("respawn")){if(patch.isJsonNull())return ()->p.setRespawnPosition(null,false);var n=patch.getAsJsonObject();keys(n,Set.of("dimension","x","y","z","yaw","forced"));var level=level(p,n);var pos=position(level,n,true);float yaw=(float)number(n,"yaw",-360000,360000);boolean forced=bool(n,"forced");var config=new ServerPlayer.RespawnConfig(LevelData.RespawnData.of(level.dimension(),pos,yaw,0),forced);return ()->p.setRespawnPosition(config,false);}
        var entries=edits(patch);var seen=new HashSet<String>();var actions=new ArrayList<Runnable>();
        if(view.equals("recipes")){var packed=p.getRecipeBook().pack();var known=new LinkedHashSet<>(packed.known());var highlighted=new LinkedHashSet<>(packed.highlight());for(var raw:entries){var n=raw.getAsJsonObject();keys(n,Set.of("id","unlocked","highlighted"));String id=Identifier.parse(StackCodec.string(n,"id")).toString();unique(seen,id);var key=ResourceKey.create(Registries.RECIPE,Identifier.parse(id));if(server.getRecipeManager().byKey(key).isEmpty())fail("unknown_recipe","未知配方："+id);boolean unlocked=bool(n,"unlocked"),highlight=bool(n,"highlighted");if(highlight&&!unlocked)fail("invalid_request","高亮配方必须已解锁");if(unlocked)known.add(key);else known.remove(key);if(highlight)highlighted.add(key);else highlighted.remove(key);}var next=new ServerRecipeBook.Packed(packed.settings(),new ArrayList<>(known),new ArrayList<>(highlighted));return ()->{var book=new ServerRecipeBook(server.getRecipeManager()::listDisplaysForRecipe);book.loadUntrusted(next,k->server.getRecipeManager().byKey(k).isPresent());p.getRecipeBook().copyOverData(book);p.getRecipeBook().sendInitialRecipeBook(p);};}
        for(var raw:entries){var n=raw.getAsJsonObject();String id=Identifier.parse(StackCodec.string(n,"id")).toString();
            if(view.equals("advancements")){keys(n,Set.of("id","criteria"));unique(seen,id);var holder=server.getAdvancements().get(Identifier.parse(id));if(holder==null)fail("unknown_advancement","未知成就："+id);var criteria=n.getAsJsonArray("criteria");if(criteria==null||criteria.isEmpty())fail("invalid_request","成就条件不能为空");var names=new HashSet<String>();for(var c:criteria){var row=c.getAsJsonObject();keys(row,Set.of("name","done"));String name=StackCodec.string(row,"name");unique(names,name);if(!holder.value().criteria().containsKey(name))fail("unknown_advancement","未知成就条件："+name);boolean done=bool(row,"done");actions.add(()->{if(done)p.getAdvancements().award(holder,name);else p.getAdvancements().revoke(holder,name);});}}
            else if(view.equals("stats")){keys(n,Set.of("type","id","value"));String typeId=Identifier.parse(StackCodec.string(n,"type")).toString();unique(seen,typeId+"/"+id);var type=BuiltInRegistries.STAT_TYPE.getValue(Identifier.parse(typeId));if(type==null)fail("unknown_stat","未知统计类型："+typeId);var stat=stat(type,Identifier.parse(id));int value=StackCodec.integer(n,"value",0,Integer.MAX_VALUE);actions.add(()->p.getStats().setValue(p,stat,value));}
            else fail("invalid_request","未知玩家视图");
        }return ()->{actions.forEach(Runnable::run);if(view.equals("stats"))p.getStats().sendStats(p);else p.getAdvancements().flushDirty(p,false);};
    }
    private static void unique(Set<String> seen,String id){if(!seen.add(id))fail("invalid_request","重复条目："+id);}
    /** Counters such as play time tick continuously; only edited paths may conflict. */
    private static JsonElement mergeEntries(String view,JsonElement baseline,JsonElement current,JsonElement patch){
        var merged=patch.deepCopy();var rows=edits(merged);
        var old=index(baseline.getAsJsonObject().getAsJsonArray("entries"),view);
        var live=index(current.getAsJsonObject().getAsJsonArray("entries"),view);
        for(var raw:rows){
            var row=raw.getAsJsonObject();String key=entryKey(row,view);var b=old.get(key);var c=live.get(key);
            if(b==null&&c!=null)fail("target_changed","服务器候选数据已变化，请重新读取后核对草稿");
            if(b==null||c==null)continue; // Native validation reports an unknown ID.
            if(view.equals("stats"))mergeField(row,b,c,"value");
            else if(view.equals("recipes")){mergeField(row,b,c,"unlocked");mergeField(row,b,c,"highlighted");}
            else if(row.has("criteria")){
                var oldCriteria=new HashMap<String,JsonObject>();var liveCriteria=new HashMap<String,JsonObject>();
                for(var criterion:b.getAsJsonArray("criteria"))oldCriteria.put(criterion.getAsJsonObject().get("name").getAsString(),criterion.getAsJsonObject());
                for(var criterion:c.getAsJsonArray("criteria"))liveCriteria.put(criterion.getAsJsonObject().get("name").getAsString(),criterion.getAsJsonObject());
                for(var criterion:row.getAsJsonArray("criteria")){var r=criterion.getAsJsonObject();String name=StackCodec.string(r,"name");if(oldCriteria.containsKey(name)&&liveCriteria.containsKey(name))mergeField(r,oldCriteria.get(name),liveCriteria.get(name),"done");}
            }
        }return merged;
    }
    private static Map<String,JsonObject> index(JsonArray rows,String view){var map=new HashMap<String,JsonObject>();for(var r:rows){var row=r.getAsJsonObject();map.put(entryKey(row,view),row);}return map;}
    private static String entryKey(JsonObject row,String view){String id=Identifier.parse(StackCodec.string(row,"id")).toString();return view.equals("stats")?Identifier.parse(StackCodec.string(row,"type"))+"/"+id:id;}
    private static void mergeField(JsonObject desired,JsonObject baseline,JsonObject current,String field){
        var d=desired.get(field);if(d==null)return;
        var b=baseline.get(field);var c=current.get(field);
        if(Objects.equals(d,b))desired.add(field,c.deepCopy());
        else if(!Objects.equals(c,b)&&!Objects.equals(c,d))fail("target_changed","所编辑字段已变化："+field+"；请重新读取后核对草稿");
    }
    private static <T> Stat<T> stat(StatType<T> type,Identifier id){var v=type.getRegistry().getValue(id);if(v==null||!type.getRegistry().containsKey(id))fail("unknown_stat","未知统计："+id);return type.get(v);}
}
