package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.registry.search.SearchIndex;
import java.util.*;

/** Retain plain immutable values, never a second Gson row tree or encoded catalog. */
public final class SearchRows {
    private SearchRows(){}
    public static Map<String,Object> compact(JsonObject row){
        Map<String,Object> values=new LinkedHashMap<>();row.entrySet().forEach(e->values.put(e.getKey(),value(e.getValue())));return new dev.rinorsi.editor.registry.search.RowFields(values);
    }
    private static Object value(JsonElement e){
        if(e.isJsonNull())return Null.VALUE;
        if(e.isJsonObject())return compact(e.getAsJsonObject());
        if(e.isJsonArray()){List<Object> out=new ArrayList<>();e.getAsJsonArray().forEach(v->out.add(value(v)));return List.copyOf(out);}
        var p=e.getAsJsonPrimitive();return p.isBoolean()?p.getAsBoolean():p.isNumber()?p.getAsNumber():p.getAsString();
    }
    private enum Null{VALUE}
    private static JsonElement json(Object value){
        if(value==Null.VALUE)return JsonNull.INSTANCE;
        if(value instanceof Map<?,?> map){JsonObject out=new JsonObject();map.forEach((k,v)->out.add((String)k,json(v)));return out;}
        if(value instanceof List<?> list){JsonArray out=new JsonArray();list.forEach(v->out.add(json(v)));return out;}
        if(value instanceof Boolean b)return new JsonPrimitive(b);if(value instanceof Number n)return new JsonPrimitive(n);return new JsonPrimitive((String)value);
    }
    public static JsonObject legacy(SearchIndex.Row row){
        if(!row.fields().isEmpty())return json(row.fields()).getAsJsonObject();
        JsonObject out=new JsonObject();out.addProperty("id",row.id());out.addProperty("name",row.name());if(!row.subtitle().isEmpty())out.addProperty("subtitle",row.subtitle());return out;
    }
    public static JsonObject wire(SearchIndex.Row row){JsonObject out=legacy(row);out.addProperty("namespace",row.namespace());return out;}
}
