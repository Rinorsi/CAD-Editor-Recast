package dev.rinorsi.editor.vault;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** One canonical serialization/hash per section; matching compares only fixed-size digests. */
final class PlayerPresetHash {
    private PlayerPresetHash() {}
    static String section(String name,JsonElement value,VaultStore.Validator validator) {
        var canonical=value.deepCopy();
        if(Set.of("inventory","equipment","ender").contains(name)) {
            var slots=canonical.getAsJsonObject().getAsJsonArray("slots");
            for(var raw:slots) {
                var row=raw.getAsJsonObject();var stack=row.getAsJsonObject("stack");
                if(!stack.has("empty")) {
                    JsonObject nativeStack;
                    try{nativeStack=validator.validate(stack).stack();}catch(VaultStore.Failure e){throw e;}catch(RuntimeException e){throw new VaultStore.Failure("INVALID_STACK","原版物品校验失败："+e.getMessage());}
                    var clean=new JsonObject();
                    // Exclude slot/label/UI metadata; typed sidecars remain part of identity.
                    for(String key:List.of("id","count","comps","removed","component_snbt"))if(nativeStack.has(key))clean.add(key,nativeStack.get(key));
                    row.add("stack",clean);
                }
            }
            canonical.getAsJsonObject().add("slots",ordered(slots,"slot",true));
        }else if(name.equals("attributes")||name.equals("effects")) {
            if(name.equals("attributes"))for(var raw:canonical.getAsJsonArray()) {
                var attribute=raw.getAsJsonObject();if(attribute.has("modifiers"))attribute.add("modifiers",ordered(attribute.getAsJsonArray("modifiers"),"id",false));
            }
            canonical=ordered(canonical.getAsJsonArray(),"id",false);
        }
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(sorted(canonical).toString().getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private static JsonArray ordered(JsonArray array,String field,boolean numeric) {
        var rows=new ArrayList<JsonObject>();var seen=new HashSet<String>();
        for(var raw:array) {
            if(!raw.isJsonObject()||!raw.getAsJsonObject().has(field))throw new VaultStore.Failure("BAD_REQUEST","预设条目缺少 "+field);
            var row=raw.getAsJsonObject();String identity=row.get(field).getAsString();if(!seen.add(identity))throw new VaultStore.Failure("BAD_REQUEST","预设条目重复："+identity);rows.add(row);
        }
        rows.sort(numeric?Comparator.comparingInt(r->r.get(field).getAsInt()):Comparator.comparing(r->r.get(field).getAsString()));
        var result=new JsonArray();rows.forEach(result::add);return result;
    }
    private static JsonElement sorted(JsonElement value) {
        if(value.isJsonObject()){var o=new JsonObject();for(String key:new TreeSet<>(value.getAsJsonObject().keySet()))o.add(key,sorted(value.getAsJsonObject().get(key)));return o;}
        if(value.isJsonArray()){var a=new JsonArray();value.getAsJsonArray().forEach(v->a.add(sorted(v)));return a;}
        if(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber())return new JsonPrimitive(value.getAsBigDecimal().stripTrailingZeros());
        return value;
    }
}
