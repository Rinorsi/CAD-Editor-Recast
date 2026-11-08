package dev.rinorsi.editor.world;

import com.google.gson.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.level.Level;

/** Additional typed views; writes still pass the detached vanilla load/save gate. */
final class EntityViewsSimple {
    private EntityViewsSimple() {}
    static boolean supports(String section) { return section.equals("owner"); }
    static void views(JsonObject out, Entity entity, CompoundTag saved, RegistryAccess access) {
        if(entity instanceof TamableAnimal tame) {
            var view=new JsonObject();var owner=tame.getOwnerReference();
            view.add("Owner",owner==null?JsonNull.INSTANCE:new JsonPrimitive(owner.getUUID().toString()));
            var players=new JsonArray();var server=entity.level().getServer();
            if(server!=null)for(var player:server.getPlayerList().getPlayers()) {
                var row=new JsonObject();row.addProperty("uuid",player.getStringUUID());row.addProperty("name",player.getName().getString());players.add(row);
            }
            view.add("players",players);view.addProperty("available",server!=null);out.add("owner",view);
        }
    }
    static void schema(JsonObject out, Entity entity, RegistryAccess access) {
        if(entity instanceof TamableAnimal) {
            var section=new JsonObject();section.addProperty("write","entity.owner");
            section.addProperty("field","Owner");section.addProperty("type","UUID string or null");
            section.addProperty("candidates","world.views.owner.players; live server PlayerList");
            section.addProperty("codec","EntityReference.codec()");section.addProperty("null","clear owner and tame state");out.add("owner",section);
        }
    }
    static void apply(Entity source, CompoundTag nbt, JsonObject edit, Level level, RegistryAccess access) {
        if(edit.has("owner")) {
            require(source instanceof TamableAnimal,"Owner requires TamableAnimal");
            var data=edit.getAsJsonObject("owner");require(data.size()==1&&data.has("Owner"),"owner accepts only Owner");
            var value=data.get("Owner");
            if(value.isJsonNull())nbt.remove("Owner");
            else {
                require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isString(),"Owner must be a UUID string or null");
                var id=UUID.fromString(value.getAsString());require(id.toString().equalsIgnoreCase(value.getAsString()),"Owner requires canonical UUID format");
                var current=((TamableAnimal)source).getOwnerReference();var server=level.getServer();
                require(current!=null&&current.getUUID().equals(id)||server!=null&&server.getPlayerList().getPlayer(id)!=null,"New owner must be an online player");
                nbt.put("Owner",EntityReference.<LivingEntity>codec().encodeStart(access.createSerializationContext(NbtOps.INSTANCE),EntityReference.of(id)).getOrThrow());
            }
        }
    }
    private static void require(boolean condition,String message) { if(!condition)throw new IllegalArgumentException(message); }
}
