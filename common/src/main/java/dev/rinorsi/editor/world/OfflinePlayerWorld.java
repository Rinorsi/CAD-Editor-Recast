package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import java.util.*;
import java.util.function.Consumer;
import net.minecraft.SharedConstants;
import net.minecraft.server.level.ServerPlayer;

/** Full normalized editor over an isolated native player; the file is the only write target. */
final class OfflinePlayerWorld {
    private OfflinePlayerWorld() {}
    static void route(ServerPlayer actor,JsonObject request,EditorPolicy policy,WorldEditSessions sessions,Consumer<JsonObject> sink){
        policy.requirePlayerEdit(actor);
        var server=actor.level().getServer();var supplied=StackCodec.object(request,"slot");
        UUID uuid=UUID.fromString(StackCodec.string(supplied,"uuid"));String op=StackCodec.string(request,"op"),id=StackCodec.string(request,"requestId");
        if(!Set.of("open","apply","undo").contains(op))EditorSessions.fail("invalid_request",EditorI18n.tr("cadeditor.message.offlineplayerworld.4a6d9aebd2"));
        sessions.rateLimit(actor.getUUID());var file=OfflinePlayerEdit.readFull(server,uuid);
        PlayerProfiles.loaded(server,file.data(),p->{
            var current=projection(p,uuid);var metadata=new JsonObject();metadata.addProperty("self",false);metadata.addProperty("uuid",uuid.toString());metadata.addProperty("name",PlayerProfiles.name(server,uuid));metadata.addProperty("offline",true);
            if(op.equals("open")){
                var slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("player","offline");slot.addProperty("uuid",uuid.toString());slot.addProperty("dim",p.level().dimension().identifier().toString());slot.addProperty("token",UUID.randomUUID().toString());
                var world=PlayerWorldEdit.snapshot(p,current,slot,metadata,WorldNbt.revision(current));var reply=reply("opened",id,world);WorldWire.encode(reply);
                var state=sessions.open(actor.getUUID(),slot,current);world.addProperty("revision",state.revision);sink.accept(reply);return null;
            }
            var state=sessions.require(actor.getUUID(),supplied,StackCodec.string(request,"revision"),current);
            if(op.equals("undo"))EditorSessions.fail("undo_unavailable",EditorI18n.tr("cadeditor.message.offlineplayerworld.bef6a182fa"));
            var mine=PlayerWorldEdit.prepare(p,state.baseline,request);var merged=WorldMerge.merge(state.baseline,mine,current);
            var prepared=PlayerWorldEdit.prepare(p,merged,new JsonObject());
            var nativeBefore=WorldTarget.saveEntity(p,p.registryAccess());PlayerWorldEdit.writeDetached(p,prepared);
            var nativeAfter=WorldTarget.saveEntity(p,p.registryAccess());
            // Only native changes caused by this edit are projected back. Unknown file data survives.
            var desired=WorldMerge.projectChanges(nativeBefore,nativeAfter,file.data());desired.putInt("DataVersion",SharedConstants.getCurrentVersion().dataVersion().version());
            var after=projection(p,uuid);
            var expectedValues=PlayerWorldEdit.data(prepared);var actualValues=PlayerWorldEdit.data(after);
            // MobEffect.addAttributeModifiers deliberately adds native permanent modifiers. The
            // resulting full attribute list is checked again by save/load below, not against the
            // pre-effect projection. Other fields must retain the requested native representation.
            var dropped=new TreeSet<String>();for(String key:expectedValues.keySet())if(!key.equals("attributes")&&!Objects.equals(expectedValues.get(key),actualValues.get(key)))dropped.add(key);
            var effectModifiers=new HashMap<String,Set<String>>();
            for(var values:List.of(PlayerWorldEdit.data(current),expectedValues))for(var raw:values.getAsJsonArray("active_effects")){
                var effect=net.minecraft.world.effect.MobEffectInstance.CODEC.parse(p.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),raw).getOrThrow();
                effect.getEffect().value().createModifiers(effect.getAmplifier(),(attribute,modifier)->effectModifiers.computeIfAbsent(net.minecraft.core.registries.BuiltInRegistries.ATTRIBUTE.getKey(attribute.value()).toString(),k->new HashSet<>()).add(modifier.id().toString()));
            }
            if(!withoutEffectModifiers(expectedValues,effectModifiers).equals(withoutEffectModifiers(actualValues,effectModifiers)))dropped.add("attributes");
            if(!dropped.isEmpty())EditorSessions.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayerworld.911266ffdd", (dropped)));
            var world=PlayerProfiles.loaded(server,desired,check->{
                if(!PlayerWorldEdit.data(after).equals(PlayerWorldEdit.data(PlayerWorldEdit.save(check))))EditorSessions.fail("invalid_nbt",EditorI18n.tr("cadeditor.message.offlineplayerworld.671441e629"));
                return PlayerWorldEdit.snapshot(check,projection(check,uuid),state.slot,metadata,state.revision);
            });
            var reply=reply("saved",id,world);WorldWire.encode(reply);
            OfflinePlayerEdit.replace(server,uuid,file,desired);
            state.saved(current,after,true);world.addProperty("revision",state.revision);
            org.slf4j.LoggerFactory.getLogger("WorldEditor").info("[CAD-Editor-World] audit player={} op=offline_apply target={} before={} after={}",actor.getUUID(),uuid,WorldNbt.revision(current),WorldNbt.revision(after));
            sink.accept(reply);return null;
        });
    }
    private static JsonArray withoutEffectModifiers(JsonObject values,Map<String,Set<String>> managed){
        var attributes=values.getAsJsonArray("attributes").deepCopy();for(var raw:attributes){var row=raw.getAsJsonObject();var ids=managed.getOrDefault(row.get("id").getAsString(),Set.of());var mods=new JsonArray();for(var mod:row.getAsJsonArray("modifiers"))if(!ids.contains(mod.getAsJsonObject().get("id").getAsString()))mods.add(mod);row.add("modifiers",mods);}return attributes;
    }
    // Player.load restores the construction profile UUID. Keep that random UUID for cache isolation;
    // the archive path supplies the session identity, while native before/after deltas preserve file UUID.
    private static net.minecraft.nbt.CompoundTag projection(ServerPlayer p,UUID uuid){var tag=PlayerWorldEdit.save(p);tag.putString("UUID",uuid.toString());return tag;}
    private static JsonObject reply(String status,String id,JsonObject world){var out=new JsonObject();out.addProperty("status",status);out.addProperty("requestId",id);out.add("world",world);return out;}
}
