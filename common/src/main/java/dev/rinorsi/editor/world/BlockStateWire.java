package dev.rinorsi.editor.world;
import com.google.gson.*;
/** Stable UI shape; vanilla 26.3 serializes block states as id/properties or a bare ID. */
final class BlockStateWire {
    private BlockStateWire() {}
    static JsonElement game(JsonElement value) {
        //? if >=26.3 {
        var out=value.deepCopy().getAsJsonObject();
        if(out.has("Name"))out.add("id",out.remove("Name"));
        if(out.has("Properties"))out.add("properties",out.remove("Properties"));
        return out;
        //?} else {
        /*return value;
        *///?}
    }
    static JsonElement ui(JsonElement value) {
        //? if >=26.3 {
        if(value.isJsonPrimitive()){var out=new JsonObject();out.add("Name",value);return out;}
        var out=value.deepCopy().getAsJsonObject();
        if(out.has("id"))out.add("Name",out.remove("id"));
        if(out.has("properties"))out.add("Properties",out.remove("properties"));
        return out;
        //?} else {
        /*return value;
        *///?}
    }
}
