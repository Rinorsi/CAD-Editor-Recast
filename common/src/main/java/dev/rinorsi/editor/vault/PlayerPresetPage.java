package dev.rinorsi.editor.vault;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.level.Level;

/** Local full player editor. Each transaction materializes a fresh unregistered native Player. */
public final class PlayerPresetPage {
    private final VaultStore store;
    private final VaultStore.Validator validator;
    private final Level level;
    private final String id;
    private final JsonObject slot;
    private JsonObject entry,world;
    public PlayerPresetPage(VaultStore store,VaultStore.Validator validator,Level level,String id){
        this.store=store;this.validator=validator;this.level=level;this.id=UUID.fromString(id).toString();entry=store.playerPreset(this.id);
        slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("player","preset");slot.addProperty("uuid",this.id);slot.addProperty("vault_id",this.id);slot.addProperty("dim",level.dimension().identifier().toString());slot.addProperty("token",UUID.randomUUID().toString());
        world=snapshot(materialize(entry.getAsJsonObject("template")),entry,UUID.randomUUID().toString());var stats=new JsonObject();stats.addProperty("op","stats");durability(world,store.execute(stats,validator));WorldWire.encode(world);
    }
    public JsonObject world(){return world.deepCopy();}
    private PlayerWorldEdit.ProjectionPlayer materialize(JsonObject raw){
        var template=PlayerPresetValidation.validate(raw,validator);var p=new PlayerWorldEdit.ProjectionPlayer(level,UUID.fromString(id));
        var spec=new JsonObject();spec.addProperty("kind","player_preset");spec.add("template",template);var target=new JsonObject();target.add("player",new JsonObject());
        var patch=VaultTemplates.expand(spec,target);
        // Default health is a display-only field, not part of a saved preset. Attributes may lower its cap.
        var data=PlayerWorldEdit.values(p);data.addProperty("Health",0);data.addProperty("AbsorptionAmount",0);
        var prepared=PlayerWorldEdit.prepare(p,PlayerWorldEdit.with(PlayerWorldEdit.save(p),data),patch);PlayerWorldEdit.writeDetached(p,prepared);p.setHealth(Math.min(20,p.getMaxHealth()));return p;
    }
    private JsonObject snapshot(PlayerWorldEdit.ProjectionPlayer p,JsonObject source,String revision){
        var metadata=new JsonObject();metadata.addProperty("self",false);metadata.addProperty("name",source.get("name").getAsString());metadata.addProperty("uuid",id);metadata.addProperty("preset",true);metadata.addProperty("vault_id",id);
        var sections=new JsonArray();source.getAsJsonObject("template").getAsJsonObject("sections").keySet().forEach(sections::add);metadata.add("sections",sections);
        return PlayerWorldEdit.snapshot(p,PlayerWorldEdit.save(p),slot,metadata,revision);
    }
    public JsonObject apply(JsonObject request){
        if(!StackCodec.string(request,"op").equals("apply"))EditorSessions.fail("undo_unavailable",EditorI18n.tr("cadeditor.message.playerpresetpage.472b3b386d"));
        if(!world.get("revision").equals(request.get("revision"))||!slot.equals(request.get("slot")))EditorSessions.fail("session_lost",EditorI18n.tr("cadeditor.message.playerpresetpage.0167dc33f1"));
        var fields=StackCodec.object(StackCodec.object(request,"entity"),"player");var sections=entry.getAsJsonObject("template").getAsJsonObject("sections");
        for(var field:fields.entrySet()){
            String key=field.getKey();String section=switch(key){case "ender"->"ender";case "attributes"->"attributes";case "active_effects"->"effects";case "playerGameType"->"game_mode";case "container"->"container";default->"";};
            if(section.equals("container")){
                for(var raw:field.getValue().getAsJsonObject().getAsJsonArray("slots")){int index=StackCodec.integer(raw.getAsJsonObject(),"slot",0,Integer.MAX_VALUE);if(!sections.has(Inventory.EQUIPMENT_SLOT_MAPPING.containsKey(index)?"equipment":"inventory"))EditorSessions.fail("protected_field",EditorI18n.tr("cadeditor.message.playerpresetpage.9cec18362c"));}
            }else if(section.isEmpty()||!sections.has(section))EditorSessions.fail("protected_field",EditorI18n.tr("cadeditor.message.playerpresetpage.6998652857", (key)));
        }
        var p=materialize(entry.getAsJsonObject("template"));var beforeCapture=capture(p);var data=PlayerWorldEdit.values(p);data.addProperty("Health",0);data.addProperty("AbsorptionAmount",0);
        var prepared=PlayerWorldEdit.prepare(p,PlayerWorldEdit.with(PlayerWorldEdit.save(p),data),request);PlayerWorldEdit.writeDetached(p,prepared);
        // A sparse imported section means "only these slots/attributes", not "clear the rest".
        // Project only the native edit delta into the original template, preserving its sparse scope.
        var template=PlayerWorldEdit.data(WorldMerge.projectChanges(wrapped(beforeCapture),wrapped(capture(p)),wrapped(entry.getAsJsonObject("template"))));
        var proposed=entry.deepCopy();proposed.add("template",template);var next=snapshot(materialize(template),proposed,UUID.randomUUID().toString());
        var reply=new JsonObject();reply.addProperty("status","saved");reply.add("requestId",request.get("requestId"));reply.add("world",next);WorldWire.encode(reply);
        var update=new JsonObject();update.addProperty("op","update");update.addProperty("id",id);update.add("template",template);update.add("expectedTemplateRevision",entry.get("templateRevision"));
        var receipt=store.execute(update,validator);entry=store.playerPreset(id);
        next.getAsJsonObject("player").add("name",entry.get("name"));durability(next,receipt);world=next;return reply;
    }
    private JsonObject capture(PlayerWorldEdit.ProjectionPlayer p){var request=new JsonObject();request.add("world",snapshot(p,entry,world.get("revision").getAsString()));request.add("sections",world.getAsJsonObject("player").get("sections"));return VaultTemplates.capture("player_preset",request);}
    private static net.minecraft.nbt.CompoundTag wrapped(JsonObject template){return PlayerWorldEdit.with(new net.minecraft.nbt.CompoundTag(),template);}
    private static void durability(JsonObject world,JsonObject receipt){var status=new JsonObject();for(String k:List.of("persisted","readOnly","storageError"))if(receipt.has(k))status.add(k,receipt.get(k));world.add("vault",status);}
}
