package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import java.util.*;
import net.minecraft.nbt.*;

/** Lossless, server-side three-way tree merge. Null here means absent, not JSON null. */
public final class WorldMerge {
    private static final Gson JSON=new GsonBuilder().serializeNulls().create();
    private static final int MAX_CONFLICTS=20;
    private WorldMerge() {}
    public static final class Conflict extends IllegalArgumentException {
        public final List<List<String>> paths;
        public final String stale;
        Conflict(List<List<String>> paths){this(paths,null);}
        Conflict(List<List<String>> paths,String stale){super(stale==null?EditorI18n.tr("cadeditor.message.worldmerge.19e6a4f046", (paths)):EditorI18n.tr("cadeditor.message.worldmerge.5aead203e6", (paths)));this.paths=List.copyOf(paths);this.stale=stale;}
        public JsonArray json(){var rows=new JsonArray();for(var path:paths){var row=new JsonObject();var parts=new JsonArray();path.forEach(parts::add);row.add("path",parts);rows.add(row);}return rows;}
    }
    public static CompoundTag merge(CompoundTag base,CompoundTag mine,CompoundTag current){
        return merge(base,mine,current,false);
    }
    /** Live editor: explicit user changes win; untouched paths still inherit the live tree. */
    public static CompoundTag applyEdits(CompoundTag base,CompoundTag mine,CompoundTag current){
        return merge(base,mine,current,true);
    }
    private static CompoundTag merge(CompoundTag base,CompoundTag mine,CompoundTag current,boolean overwrite){
        requireIdentity(base,current);var conflicts=new ArrayList<List<String>>();
        var inputs=BlockVolatile.rebaseBeeTimers(base,mine,current);
        inputs=BlockVolatile.rebaseSpawnerCountdown(inputs.base(),inputs.mine(),current);
        inputs=rebaseEffectCountdowns(inputs.base(),inputs.mine(),current);
        var result=(CompoundTag)mergeNode(inputs.base(),inputs.mine(),current,List.of(),overwrite?null:conflicts);
        if(!conflicts.isEmpty())throw new Conflict(conflicts);return result;
    }
    /** Apply only normalized-operation differences, excluding incidental loader defaults. */
    public static CompoundTag projectChanges(CompoundTag canonicalBefore,CompoundTag canonicalAfter,CompoundTag requested){
        return (CompoundTag)mergeNode(canonicalBefore,canonicalAfter,requested,List.of(),null);
    }
    public static void requireIdentity(CompoundTag base,CompoundTag current){
        var b=entityOrBlock(base);var c=entityOrBlock(current);var conflicts=new ArrayList<List<String>>();
        if(!Objects.equals(b.get("id"),c.get("id")))conflicts.add(List.of("id"));
        boolean entity=base.contains("cad_entity_nbt")||(!base.contains("cad_session_nbt")&&EntityVolatile.entity(b));
        if(entity&&!Objects.equals(b.get("UUID"),c.get("UUID")))conflicts.add(List.of("UUID"));
        if(!Objects.equals(base.get("cad_session_block"),current.get("cad_session_block")))conflicts.add(List.of("block"));
        if(!Objects.equals(base.get(DoubleChestEdit.TOPOLOGY),current.get(DoubleChestEdit.TOPOLOGY)))conflicts.add(List.of("container","double"));
        if(!conflicts.isEmpty())throw new Conflict(conflicts,"identity");
    }
    private static CompoundTag entityOrBlock(CompoundTag tag){return tag.getCompound("cad_entity_nbt").orElseGet(()->tag.getCompound("cad_session_nbt").orElse(tag));}
    /** Only a live entity's own effects qualify, never similarly named item/block/mod data.
     * An unchanged effect body with positive, decreasing integer timers is countdown-compatible.
     * Refreshes, expiry, replacements and unknown field changes retain strict conflict handling. */
    private static BlockVolatile.MergeInputs rebaseEffectCountdowns(CompoundTag base,CompoundTag mine,CompoundTag current){
        var unchanged=new BlockVolatile.MergeInputs(base,mine);
        if(base.contains("cad_session_nbt"))return unchanged;
        var b=entityOrBlock(base);var c=entityOrBlock(current);
        boolean player=b.getString("id").orElse("").equals("minecraft:player")&&b.contains("cad_player");
        if(!player&&!EntityVolatile.entity(b))return unchanged;
        var rb=base.copy();var rm=mine.copy();var bb=entityOrBlock(rb);var mm=entityOrBlock(rm);
        if(player){
            if(!(bb.get("cad_player") instanceof StringTag bs)||!(mm.get("cad_player") instanceof StringTag ms)||!(c.get("cad_player") instanceof StringTag cs))return unchanged;
            var bj=JsonParser.parseString(bs.value());var mj=JsonParser.parseString(ms.value());var cj=JsonParser.parseString(cs.value());
            rebaseEffectList(bj,mj,cj);
            bb.putString("cad_player",JSON.toJson(bj));mm.putString("cad_player",JSON.toJson(mj));
        }else rebaseEffectList(bb,mm,c);
        return new BlockVolatile.MergeInputs(rb,rm);
    }
    private static void rebaseEffectList(Object base,Object mine,Object current){
        var b=object(base);var m=object(mine);var c=object(current);if(b==null||m==null||c==null)return;
        var bl=array(b.get("active_effects"));var cl=array(c.get("active_effects"));
        if(bl==null||cl==null||!uniqueEffectIds(bl)||!uniqueEffectIds(cl))return;
        var live=index(cl,"id");
        // The real UI removes the key when deleting the last effect. Rebase only
        // if the entire live set still matches, allowing countdown and ID order.
        // Keep the requested key absent; null/scalar values are not deletions.
        if(!m.containsKey("active_effects")){
            if(bl.size()!=cl.size())return;
            for(var old:bl)if(!countdownOnly(old,live.get(key(old,"id"))))return;
            put(base,"active_effects",copy(c.get("active_effects")));return;
        }
        var ml=array(m.get("active_effects"));if(ml==null||!uniqueEffectIds(ml))return;
        var edits=index(ml,"id");
        for(var old:bl){String id=key(old,"id");var now=live.get(id);if(countdownOnly(old,now))rebaseEffect(old,edits.get(id),now);}
    }
    private static boolean uniqueEffectIds(List<Object> effects){
        var seen=new HashSet<String>();for(var row:effects){var fields=object(row);if(fields==null)return false;var id=fields.get("id");
            if(!(id instanceof StringTag)&&!(id instanceof JsonPrimitive j&&j.isString()))return false;
            if(!seen.add(key(row,"id")))return false;
        }return true;
    }
    private static boolean countdownOnly(Object base,Object current){
        var b=object(base);var c=object(current);if(b==null||c==null||!b.keySet().equals(c.keySet()))return false;
        for(String key:b.keySet()){
            var old=b.get(key);var now=c.get(key);
            if(Objects.equals(old,now))continue;
            if(key.equals("duration")){var bt=effectTicks(old);var ct=effectTicks(now);if(bt==null||ct==null||bt<=0||ct<=0||ct>bt)return false;}
            else if(!key.equals("hidden_effect")||!countdownOnly(old,now))return false;
        }return true;
    }
    private static Integer effectTicks(Object value){
        if(value instanceof IntTag n)return n.intValue();
        if(value instanceof JsonPrimitive j&&j.isNumber())try{return j.getAsBigDecimal().intValueExact();}catch(ArithmeticException|NumberFormatException ignored){}
        return null;
    }
    private static void rebaseEffect(Object base,Object mine,Object current){
        var b=object(base);var m=object(mine);var c=object(current);
        if(b==null||c==null)return;
        if(b.containsKey("duration")){
            var old=b.get("duration");var now=c.get("duration");
            if(m!=null&&Objects.equals(m.get("duration"),old))put(mine,"duration",copy(now));
            put(base,"duration",copy(now));
        }
        if(b.containsKey("hidden_effect"))rebaseEffect(b.get("hidden_effect"),m==null?null:m.get("hidden_effect"),c.get("hidden_effect"));
    }
    private static Object mergeNode(Object base,Object mine,Object current,List<String> path,List<List<String>> conflicts){
        if(Objects.equals(mine,base))return copy(current);
        if(Objects.equals(mine,current))return copy(current);
        if(Objects.equals(current,base))return copy(mine);
        if(!path.isEmpty()&&path.getLast().equals("cad_player")&&base instanceof StringTag b&&mine instanceof StringTag m&&current instanceof StringTag c){
            var value=mergeNode(JsonParser.parseString(b.value()),JsonParser.parseString(m.value()),JsonParser.parseString(c.value()),List.of("player"),conflicts);
            return StringTag.valueOf(JSON.toJson(value));
        }
        var bm=object(base);var mm=object(mine);var cm=object(current);
        if(mm!=null&&cm!=null&&(bm!=null||base==null)){
            if(bm==null)bm=Map.of();var keys=new TreeSet<String>();keys.addAll(bm.keySet());keys.addAll(mm.keySet());keys.addAll(cm.keySet());
            var result=mine instanceof CompoundTag?new CompoundTag():new JsonObject();
            for(String key:keys){var child=mergeNode(bm.get(key),mm.get(key),cm.get(key),child(path,key),conflicts);if(child!=null)put(result,key,child);}return result;
        }
        var bl=array(base);var ml=array(mine);var cl=array(current);
        if(ml!=null&&cl!=null&&(bl!=null||base==null)){
            if(bl==null)bl=List.of();String key=stableKey(path,bl,ml,cl);
            if(key!=null){var b=index(bl,key);var m=index(ml,key);var c=index(cl,key);var order=new LinkedHashSet<String>();order.addAll(c.keySet());order.addAll(m.keySet());order.addAll(b.keySet());
                Object result=mine instanceof ListTag?new ListTag():new JsonArray();
                for(String id:order){var value=mergeNode(b.get(id),m.get(id),c.get(id),child(path,"["+key+"="+id+"]"),conflicts);if(value!=null)add(result,value);}return result;
            }
        }
        if(conflicts==null)return copy(mine);
        if(conflicts.size()<MAX_CONFLICTS)conflicts.add(publicPath(path));return copy(current);
    }
    private static List<String> child(List<String> parent,String key){var out=new ArrayList<>(parent);out.add(key);return out;}
    private static List<String> publicPath(List<String> path){var out=new ArrayList<String>();for(String p:path){if(p.equals("cad_session_nbt")||p.equals("cad_entity_nbt"))continue;out.add(p.equals("cad_session_state")?"block_state":p.equals("cad_session_block")?"block":p);}return List.copyOf(out);}
    private static Object copy(Object v){return v instanceof Tag t?t.copy():v instanceof JsonElement j?j.deepCopy():null;}
    private static Map<String,Object> object(Object v){
        var out=new LinkedHashMap<String,Object>();if(v instanceof CompoundTag t){for(String k:t.keySet())out.put(k,t.get(k));return out;}
        if(v instanceof JsonObject j){for(var e:j.entrySet())out.put(e.getKey(),e.getValue());return out;}return null;
    }
    private static List<Object> array(Object v){var out=new ArrayList<Object>();if(v instanceof ListTag l){l.forEach(out::add);return out;}if(v instanceof JsonArray a){a.forEach(out::add);return out;}return null;}
    private static void put(Object parent,String key,Object value){if(parent instanceof CompoundTag t)t.put(key,(Tag)value);else ((JsonObject)parent).add(key,(JsonElement)value);}
    private static void add(Object parent,Object value){if(parent instanceof ListTag t)t.add((Tag)value);else ((JsonArray)parent).add((JsonElement)value);}
    @SafeVarargs private static String stableKey(List<String> path,List<Object>... lists){
        boolean any=false;for(var list:lists)if(!list.isEmpty())any=true;if(!any)return null;
        for(String key:List.of("Slot","slot","UUID","uuid","id","Id","entity_data.UUID","@value")){
            // Unique strings are not necessarily a set (sign lines, lore and ordered scripts).
            if(key.equals("@value")&&(path.isEmpty()||!path.getLast().equals("Tags")))continue;
            boolean valid=true;for(var list:lists){var seen=new HashSet<String>();for(var item:list){String id=key(item,key);if(id==null||!seen.add(id)){valid=false;break;}}if(!valid)break;}if(valid)return key;
        }return null;
    }
    private static Map<String,Object> index(List<Object> list,String key){var out=new LinkedHashMap<String,Object>();for(var item:list)out.put(key(item,key),item);return out;}
    private static String key(Object value,String key){
        if(key.equals("@value"))return value instanceof StringTag s?s.value():value instanceof JsonPrimitive j&&j.isString()?j.getAsString():null;
        Object found=value;for(String part:key.split("[.]")){var obj=object(found);if(obj==null)return null;found=obj.get(part);}
        if(found instanceof NumericTag n)return n instanceof FloatTag||n instanceof DoubleTag?Double.toString(n.doubleValue()):Long.toString(n.longValue());
        if(found instanceof StringTag s)return s.value();
        if(found instanceof IntArrayTag a)return Arrays.toString(a.getAsIntArray());
        if(found instanceof JsonPrimitive j)return j.isString()?j.getAsString():j.isNumber()?j.getAsNumber().toString():null;
        return null;
    }
}
