package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.WorldEditSessions;
import java.util.*;

/** Pure host-side target binding, shared by page navigation and apply/undo. */
public final class WorldPageTarget {
    private WorldPageTarget() {}
    public static JsonObject playerSlot(JsonObject message,String dimension) {
        var slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("dim",dimension);
        if(message.size()==1&&message.has("self")&&message.get("self").isJsonPrimitive()&&message.getAsJsonPrimitive("self").isBoolean()&&message.get("self").getAsBoolean())slot.addProperty("player","self");
        else if(message.size()==1&&message.has("uuid")) {slot.addProperty("player","online");slot.addProperty("uuid",UUID.fromString(StackCodec.string(message,"uuid")).toString());}
        else if(message.size()==2&&message.has("uuid")&&message.has("offline")&&message.get("offline").isJsonPrimitive()&&message.getAsJsonPrimitive("offline").isBoolean()&&message.get("offline").getAsBoolean()){slot.addProperty("player","offline");slot.addProperty("uuid",UUID.fromString(StackCodec.string(message,"uuid")).toString());}
        else throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldpagetarget.b548316a38"));
        return slot;
    }
    public record Binding(JsonObject slot,String revision) {
        public Binding {slot=slot.deepCopy();}
        @Override public JsonObject slot(){return slot.deepCopy();}
        public static Binding opened(JsonObject world){return new Binding(StackCodec.object(world,"slot"),StackCodec.string(world,"revision"));}
        public JsonObject bind(JsonObject edit,boolean undo) {
            var supplied=StackCodec.object(edit,"slot");
            if(!WorldEditSessions.sameTarget(slot,supplied)||!Objects.equals(slot.get("token"),supplied.get("token")))throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worldpagetarget.9bbb09830b"));
            var request=edit.deepCopy();request.addProperty("op",undo?"undo":"apply");request.add("slot",slot.deepCopy());request.addProperty("revision",revision);return request;
        }
    }
}
