package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import dev.rinorsi.editor.*;
import java.util.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.player.Player;

/** Relationship operations are exclusive apply requests, never raw Passengers NBT writes. */
public final class EntityRiding {
    private EntityRiding() {}
    public static void apply(ServerPlayer player,Entity vehicle,JsonObject edit,java.util.function.Consumer<Entity> preflight){
        guard(player,vehicle);
        String action=StackCodec.string(edit,"action");
        Set<String> keys=switch(action){case "add"->Set.of("action","type","entity_data");case "remove"->Set.of("action","uuid");default->Set.of("action");};
        if(!keys.containsAll(edit.keySet()))throw new IllegalArgumentException("骑乘操作包含未知字段");
        switch(action){
            case "add" -> add(player,vehicle,edit,preflight);
            case "remove" -> {var id=UUID.fromString(StackCodec.string(edit,"uuid"));var passenger=descendants(vehicle).filter(p->p.getUUID().equals(id)).findFirst().orElseThrow(()->new IllegalArgumentException("乘客已离开该乘客树"));guardTree(player,passenger);passenger.stopRiding();}
            case "eject" -> {for(var p:vehicle.getPassengers())guardTree(player,p);vehicle.ejectPassengers();}
            case "dismount" -> {if(vehicle.getVehicle()==null)throw new IllegalArgumentException("目标当前没有坐骑");guardTree(player,vehicle);guard(player,vehicle.getVehicle());vehicle.stopRiding();}
            default -> throw new IllegalArgumentException("未知骑乘操作："+action);
        }
    }
    public static void guard(ServerPlayer player,Entity entity){
        WorldAccess.nonPlayer(entity instanceof Player);
        var slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("dim",entity.level().dimension().identifier().toString());slot.addProperty("uuid",entity.getStringUUID());
        WorldTarget.resolve(player,slot);
    }
    private static void guardTree(ServerPlayer player,Entity e){guard(player,e);e.getPassengers().forEach(p->guardTree(player,p));}
    private static void add(ServerPlayer player,Entity vehicle,JsonObject edit,java.util.function.Consumer<Entity> preflight){
        guardTree(player,vehicle);
        if(descendants(vehicle).count()>=256)throw new IllegalArgumentException("乘客树达到256个实体的编辑上限");
        var id=Identifier.parse(StackCodec.string(edit,"type"));
        if(!BuiltInRegistries.ENTITY_TYPE.containsKey(id))throw new IllegalArgumentException("实体类型不存在："+id);
        var type=BuiltInRegistries.ENTITY_TYPE.getValue(id);
        if(type==net.minecraft.world.entity.EntityTypes.PLAYER||!type.canSerialize())EditorSessions.fail("unsupported_target","不能添加玩家或不可保存实体");
        if(type.onlyOpCanSetNbt()&&!EditorPolicy.gameMaster(player))EditorSessions.fail("not_allowed","该乘客类型需要游戏管理员命令权限");
        var level=(ServerLevel)vehicle.level();var passenger=type.create(level,EntitySpawnReason.COMMAND);
        if(passenger==null)EditorSessions.fail("unsupported_target","实体工厂不能创建乘客");
        var before=WorldTarget.saveEntity(passenger,level.registryAccess());var requested=before.copy();
        if(edit.has("entity_data")){
            var data=edit.get("entity_data");var fields=data.isJsonPrimitive()?WorldNbt.parse(data.getAsString()):(CompoundTag)JsonOps.INSTANCE.convertTo(NbtOps.INSTANCE,data);
            requested.merge(fields);WorldNbt.protect(before,requested,true);
            for(String key:EntityVolatile.CURRENT)if(!Objects.equals(before.get(key),requested.get(key)))EditorSessions.fail("protected_field","新乘客的身份、运动和运行时字段不可指定："+key);
            dev.rinorsi.editor.registry.EntitySchemaValidation.validate(requested,level,0);
            var prepared=WorldTarget.copyEntity(passenger,requested,level,level.registryAccess());WorldNbt.requireEditedFieldsRetained(before,requested,prepared);EntityWorldEdit.load(passenger,prepared,level.registryAccess());
        }
        passenger.setPos(vehicle.position());
        preflight.accept(passenger); // size/serialization checks must precede any real relationship
        try {
            tryRide(passenger,vehicle);
            if(!level.addFreshEntity(passenger))throw new IllegalArgumentException("服务端拒绝加入新乘客（实体事件、UUID或世界规则）");
        }catch(RuntimeException error){passenger.stopRiding();passenger.discard();throw error;}
    }
    /** Public for real-factory tests; false means a vanilla rule, never use force=true. */
    public static void tryRide(Entity passenger,Entity vehicle){
        WorldAccess.nonPlayer(passenger instanceof Player);WorldAccess.nonPlayer(vehicle instanceof Player);
        if(passenger==vehicle||vehicle.isRemoved()||passenger.isRemoved()||passenger.level()!=vehicle.level())throw new IllegalArgumentException("骑乘目标无效、已移除或不在同一维度");
        if(!passenger.startRiding(vehicle,false,true))EditorSessions.fail("ride_rejected","原版拒绝骑乘：坐骑不能接纳更多乘客，或乘客状态、冷却、循环关系不符合 canRide/canAddPassenger 规则");
    }
    private static java.util.stream.Stream<Entity> descendants(Entity root){return root.getPassengers().stream().flatMap(p->java.util.stream.Stream.concat(java.util.stream.Stream.of(p),descendants(p)));}
    public static JsonObject previewAddition(JsonObject snapshot,Entity passenger,net.minecraft.core.RegistryAccess access){
        var out=snapshot.deepCopy();var nbt=WorldNbt.parse(snapshot.get("snbt").getAsString());
        var list=nbt.getList("Passengers").map(ListTag::copy).orElseGet(ListTag::new);list.add(WorldTarget.saveEntity(passenger,access));nbt.put("Passengers",list);
        if(nbt.toString().length()>WorldNbt.MAX_SNBT)EditorSessions.fail("payload_too_large","新增乘客后NBT超过上限");
        out.addProperty("snbt",nbt.toString());out.add("nbt",NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE,nbt));out.addProperty("canUndo",false);
        var row=new JsonObject();row.addProperty("type",BuiltInRegistries.ENTITY_TYPE.getKey(passenger.getType()).toString());row.addProperty("uuid",passenger.getStringUUID());row.addProperty("summary",passenger.getName().getString());row.add("passengers",new JsonArray());
        out.getAsJsonObject("views").getAsJsonObject("riding").getAsJsonArray("passengers").add(row);return out;
    }
}
