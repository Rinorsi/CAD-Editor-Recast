package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.world.WorldNbt;
import java.util.*;
import net.minecraft.world.entity.player.Inventory;

/** Portable templates; expansion feeds the existing authoritative world route. */
public final class VaultTemplates {
    private VaultTemplates() {}
    // Protocol sections, not a handwritten registry/options table.
    public static final Set<String> SECTIONS = Set.of("inventory", "equipment", "ender", "attributes", "effects", "game_mode");
    public static boolean supported(String kind) { return kind.equals("block") || kind.equals("player_preset"); }
    private static VaultStore.Failure fail(String code, String text) { return new VaultStore.Failure(code,text); }
    private static JsonObject object(JsonObject o,String key) {
        if(!o.has(key)||!o.get(key).isJsonObject()) throw fail("BAD_REQUEST",key+" 必须为对象");
        return o.getAsJsonObject(key);
    }
    private static void keys(JsonObject o,Set<String> allowed) {
        for(String k:o.keySet()) if(!allowed.contains(k)) throw fail("BAD_REQUEST","未知模板字段："+k);
    }
    private static List<String> selected(JsonElement raw,Set<String> allowed) {
        if(raw==null||!raw.isJsonArray()||raw.getAsJsonArray().isEmpty()) throw fail("BAD_REQUEST","请选择至少一个预设分区");
        var result=new ArrayList<String>();
        for(var v:raw.getAsJsonArray()) {
            if(!v.isJsonPrimitive()||!v.getAsJsonPrimitive().isString()||!allowed.contains(v.getAsString())||result.contains(v.getAsString()))
                throw fail("BAD_REQUEST","预设分区未知、未保存或重复");
            result.add(v.getAsString());
        }
        return result;
    }
    private static JsonArray array(Collection<String> values) {var a=new JsonArray();values.forEach(a::add);return a;}
    public static JsonArray allSections(){return array(new TreeSet<>(SECTIONS));}
    /** Capture and select a read-only comparison without changing save's established defaults. */
    public static JsonObject backupTemplate(JsonObject request) {
        var r=request.deepCopy();if(!r.has("template")&&!r.has("sections"))r.add("sections",allSections());
        var t=capture("player_preset",r);var sections=t.getAsJsonObject("sections");
        var chosen=r.has("sections")?selected(r.get("sections"),sections.keySet()):new ArrayList<>(sections.keySet());
        var filtered=new JsonObject();for(String key:chosen)filtered.add(key,sections.get(key));t.add("sections",filtered);return t;
    }
    public static JsonObject capture(String kind,JsonObject request) {
        if(request.has("template")) return validate(kind,object(request,"template"));
        var world=object(request,"world");var t=new JsonObject();
        if(kind.equals("block")) {
            if(!VaultStore.text(world,"kind","",32).equals("block")) throw fail("wrong_kind","请打开方块编辑器");
            t.add("block",world.get("block"));t.add("block_state",world.get("block_state"));t.add("snbt",world.get("snbt"));
        } else {
            if(!world.has("player")) throw fail("wrong_kind","请打开在线玩家编辑器");
            var player=object(object(world,"views"),"player");var sections=new JsonObject();
            for(String section:selected(request.get("sections"),SECTIONS)) {
                if(section.equals("inventory")||section.equals("equipment")) {
                    var slots=new JsonArray();
                    for(var row:object(player,"container").getAsJsonArray("slots")) {
                        int slot=row.getAsJsonObject().get("slot").getAsInt();
                        if(Inventory.EQUIPMENT_SLOT_MAPPING.containsKey(slot)==section.equals("equipment")) slots.add(row.deepCopy());
                    }
                    var container=new JsonObject();container.add("slots",slots);sections.add(section,container);
                } else if(section.equals("ender")) {var c=new JsonObject();c.add("slots",object(player,"ender").get("slots").deepCopy());sections.add(section,c);}
                else sections.add(section,player.get(field(section)).deepCopy());
            }
            t.add("sections",sections);
        }
        return validate(kind,t);
    }
    public static JsonObject validate(String kind,JsonObject raw) {
        VaultStore.checkDepth(raw);var t=raw.deepCopy();
        if(kind.equals("block")) {
            keys(t,Set.of("block","block_state","snbt"));
            String id=VaultStore.text(t,"block","",256);
            if(!id.matches("[a-z0-9_.-]+:[a-z0-9_./-]+")) throw fail("BAD_REQUEST","无效方块 ID");
            for(var e:object(t,"block_state").entrySet()) if(!e.getValue().isJsonPrimitive()||!e.getValue().getAsJsonPrimitive().isString()) throw fail("BAD_REQUEST","方块状态必须为文本");
            var nbt=WorldNbt.parse(VaultStore.text(t,"snbt","",VaultStore.MAX_ENTRY_BYTES));
            if(nbt.getString("id").isEmpty()) throw fail("BAD_REQUEST","方块实体数据缺少 id");
            for(String k:List.of("x","y","z")) nbt.remove(k);
            t.addProperty("snbt",nbt.toString());
        } else if(kind.equals("player_preset")) {
            keys(t,Set.of("sections"));var sections=object(t,"sections");keys(sections,SECTIONS);
            if(sections.isEmpty()) throw fail("BAD_REQUEST","预设没有分区");
            for(var e:sections.entrySet()) {
                String key=e.getKey();var v=e.getValue();
                if(Set.of("inventory","equipment","ender").contains(key)) {
                    if(!v.isJsonObject())throw fail("BAD_REQUEST","容器分区必须为对象");var c=v.getAsJsonObject();keys(c,Set.of("slots"));
                    if(!c.has("slots")||!c.get("slots").isJsonArray())throw fail("BAD_REQUEST","容器缺少 slots");
                    var seen=new HashSet<Integer>();
                    for(var row:c.getAsJsonArray("slots")) {
                        if(!row.isJsonObject())throw fail("BAD_REQUEST","无效槽位");var r=row.getAsJsonObject();keys(r,Set.of("slot","stack"));
                        int i;try {if(!r.has("slot")||!r.get("slot").isJsonPrimitive()||!r.getAsJsonPrimitive("slot").isNumber())throw new IllegalArgumentException();i=r.get("slot").getAsBigDecimal().intValueExact();}catch(RuntimeException ex){throw fail("BAD_REQUEST","槽位必须为整数");}
                        if(i<0||!seen.add(i))throw fail("BAD_REQUEST","槽位无效或重复");
                        if(key.equals("equipment")&&!Inventory.EQUIPMENT_SLOT_MAPPING.containsKey(i)||key.equals("inventory")&&(i>=Inventory.INVENTORY_SIZE||Inventory.EQUIPMENT_SLOT_MAPPING.containsKey(i)))throw fail("BAD_REQUEST","槽位不属于所选分区");
                        var stack=object(r,"stack");
                        if(stack.has("empty")) {if(!stack.get("empty").isJsonPrimitive()||!stack.getAsJsonPrimitive("empty").isBoolean()||!stack.get("empty").getAsBoolean()||stack.size()!=1)throw fail("BAD_REQUEST","无效空槽");}
                        else {VaultStore.text(stack,"id","",256);object(stack,"comps");object(stack,"removed");if(!stack.has("count"))throw fail("BAD_REQUEST","物品缺少 count");}
                    }
                } else if(key.equals("game_mode")) {if(!v.isJsonPrimitive()||!v.getAsJsonPrimitive().isString())throw fail("BAD_REQUEST","游戏模式必须为文本");}
                else if(!v.isJsonArray())throw fail("BAD_REQUEST","属性或效果必须为数组");
            }
        } else throw fail("wrong_kind","该类别不是方块或玩家预设");
        return t;
    }
    private static String field(String section) {return switch(section) {case "effects"->"active_effects";case "game_mode"->"playerGameType";default->section;};}
    public static JsonObject describe(String kind,JsonObject t) {
        var out=new JsonObject();
        if(kind.equals("block")) {out.add("block",t.get("block"));out.addProperty("blockStateFields",object(t,"block_state").size());out.addProperty("nbtFields",WorldNbt.parse(t.get("snbt").getAsString()).size());}
        else {out.add("sections",array(object(t,"sections").keySet()));var counts=new JsonObject();for(var e:object(t,"sections").entrySet())counts.addProperty(e.getKey(),count(e.getValue()));out.add("counts",counts);}
        return out;
    }
    private static int count(JsonElement value) {if(value==null)return 0;if(value.isJsonArray())return value.getAsJsonArray().size();if(value.isJsonObject()) {var o=value.getAsJsonObject();return o.has("slots")?o.getAsJsonArray("slots").size():o.size();}return 1;}
    public static void requireBlockType(String expected,String actual) {if(!expected.equals(actual))throw fail("block_type_mismatch","方块类型不符：预设为 "+expected+"，目标为 "+actual+"；未修改目标");}
    /** Expands both client preview and server snapshot; never writes Minecraft state. */
    public static JsonObject expand(JsonObject spec,JsonObject world) {
        keys(spec,Set.of("kind","template","sections"));String kind=VaultStore.text(spec,"kind","",16);var t=validate(kind,object(spec,"template"));var patch=new JsonObject();
        if(kind.equals("block")) {
            if(spec.has("sections"))throw fail("BAD_REQUEST","方块预设没有玩家分区");
            if(!VaultStore.text(world,"kind","",16).equals("block"))throw fail("wrong_kind","目标不是方块");
            requireBlockType(t.get("block").getAsString(),VaultStore.text(world,"block","",256));
            var before=WorldNbt.parse(VaultStore.text(world,"snbt","",VaultStore.MAX_ENTRY_BYTES));var next=WorldNbt.parse(t.get("snbt").getAsString());
            if(!Objects.equals(before.get("id"),next.get("id")))throw fail("block_type_mismatch","方块实体类型不一致");
            for(String key:List.of("id","x","y","z","keepPacked")) {next.remove(key);if(before.contains(key))next.put(key,before.get(key).copy());}
            patch.addProperty("snbt",next.toString());patch.add("block_state",t.get("block_state").deepCopy());
        } else {
            if(!world.has("player"))throw fail("wrong_kind","目标不是在线玩家");
            var sections=object(t,"sections");var chosen=spec.has("sections")?selected(spec.get("sections"),sections.keySet()):new ArrayList<>(sections.keySet());
            var player=new JsonObject();var slots=new JsonArray();
            for(String key:chosen) {
                if(key.equals("inventory")||key.equals("equipment"))object(sections,key).getAsJsonArray("slots").forEach(v->slots.add(v.deepCopy()));
                else player.add(field(key),sections.get(key).deepCopy());
            }
            if(chosen.contains("inventory")||chosen.contains("equipment")){var c=new JsonObject();c.add("slots",slots);player.add("container",c);}
            var entity=new JsonObject();entity.add("player",player);patch.add("entity",entity);
        }
        return patch;
    }
    public static JsonObject preview(JsonObject entry,JsonObject request) {
        var world=object(request,"world");String kind=VaultStore.text(entry,"kind","",16);if(!supported(kind))throw fail("wrong_kind","该条目不是方块或玩家预设");var spec=new JsonObject();spec.addProperty("kind",kind);spec.add("template",object(entry,"template").deepCopy());if(request.has("sections"))spec.add("sections",request.get("sections").deepCopy());
        var expanded=expand(spec,world);var summary=new JsonObject();summary.addProperty("kind",kind);summary.addProperty("target",kind.equals("block")?world.get("block").getAsString():VaultStore.text(object(world,"player"),"name","在线玩家",256));var rows=new JsonArray();
        if(kind.equals("block")) {addSummary(rows,"block_state",object(world,"block_state").size(),object(expanded,"block_state").size());addSummary(rows,"block_entity",WorldNbt.parse(world.get("snbt").getAsString()).size(),WorldNbt.parse(expanded.get("snbt").getAsString()).size());}
        else {var p=object(object(world,"views"),"player");var sections=object(object(entry,"template"),"sections");var chosen=spec.has("sections")?selected(spec.get("sections"),sections.keySet()):new ArrayList<>(sections.keySet());for(String k:chosen){JsonElement old=p.get(field(k));if(k.equals("inventory")||k.equals("equipment")){int n=0;for(var row:object(p,"container").getAsJsonArray("slots"))if(Inventory.EQUIPMENT_SLOT_MAPPING.containsKey(row.getAsJsonObject().get("slot").getAsInt())==k.equals("equipment"))n++;addSummary(rows,k,n,count(sections.get(k)));}else if(k.equals("game_mode")){var row=new JsonObject();row.addProperty("section",k);row.add("before",old.deepCopy());row.add("after",sections.get(k).deepCopy());rows.add(row);}else addSummary(rows,k,count(old),count(sections.get(k)));}}
        summary.add("overwrites",rows);var apply=new JsonObject();apply.add("slot",object(world,"slot").deepCopy());apply.addProperty("revision",VaultStore.text(world,"revision","",128));apply.add("vault_template",spec);var out=new JsonObject();out.add("summary",summary);out.add("apply",apply);return out;
    }
    private static void addSummary(JsonArray rows,String section,int before,int after){var r=new JsonObject();r.addProperty("section",section);r.addProperty("before",before);r.addProperty("after",after);rows.add(r);}
}
