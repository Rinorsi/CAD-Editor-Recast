package dev.rinorsi.editor.clientonly;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.util.Comparator;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.player.Abilities;

/** Independent server-thread readback. No Editor/Oriel classes or writes. */
public final class PlayerFields {
    private PlayerFields() {}
    public static JsonObject read(ServerPlayer player) {
        var out = new JsonObject();
        out.addProperty("uuid", player.getUUID().toString());
        out.addProperty("name", player.getPlainTextName());
        out.addProperty("source", "host-integrated-server-thread");
        out.addProperty("observedAt", System.currentTimeMillis());
        out.addProperty("alive",player.isAlive());out.addProperty("onGround",player.onGround());out.addProperty("collisionFree",player.level().noCollision(player));
        var occupancy=new JsonObject();for(int offset=-1;offset<=1;offset++){var block=player.blockPosition().offset(0,offset,0);occupancy.addProperty(Integer.toString(offset),BuiltInRegistries.BLOCK.getKey(player.level().getBlockState(block).getBlock()).toString());}out.add("standingBlocks",occupancy);
        var corridor=new JsonArray();for(int dx:new int[]{0,2,4,6}){var row=new JsonObject();row.addProperty("dx",dx);row.addProperty("collisionFree",player.level().noCollision(player,player.getBoundingBox().move(dx,0,0)));var block=player.blockPosition().offset(dx,0,0);row.addProperty("feet",BuiltInRegistries.BLOCK.getKey(player.level().getBlockState(block).getBlock()).toString());row.addProperty("head",BuiltInRegistries.BLOCK.getKey(player.level().getBlockState(block.above()).getBlock()).toString());corridor.add(row);}out.add("plannedCorridor",corridor);
        var serialized=net.minecraft.world.level.storage.TagValueOutput.createWithContext(net.minecraft.util.ProblemReporter.DISCARDING,player.registryAccess());
        player.saveWithoutId(serialized);
        var raw=serialized.buildResult();out.addProperty("serializedSnbt",raw.toString());
        var serializedAttrs=new JsonArray();
        for(var entry:raw.getList("attributes").orElse(new net.minecraft.nbt.ListTag()))if(entry instanceof net.minecraft.nbt.CompoundTag row){
            var attr=new JsonObject();attr.addProperty("id",row.getStringOr("id",""));attr.addProperty("hasBase",row.getDouble("base").isPresent());
            row.getDouble("base").ifPresent(value->attr.addProperty("baseDecimal",Double.toString(value)));attr.addProperty("snbt",row.toString());serializedAttrs.add(attr);
        }
        out.add("serializedAttributes",serializedAttrs);
        out.addProperty("gamemaster", player.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER));
        var xp = new JsonObject();
        xp.addProperty("level", player.experienceLevel);
        xp.addProperty("progress", player.experienceProgress);
        xp.addProperty("progressDecimal", Float.toString(player.experienceProgress));
        xp.addProperty("total", player.totalExperience);
        xp.addProperty("neededForNextLevel", player.getXpNeededForNextLevel());
        out.add("experience", xp);
        var pos = new JsonObject();
        pos.addProperty("dimension", player.level().dimension().identifier().toString());
        pos.addProperty("x", player.getX()); pos.addProperty("y", player.getY()); pos.addProperty("z", player.getZ());
        pos.addProperty("yaw", player.getYRot()); pos.addProperty("pitch", player.getXRot());
        out.add("position", pos);
        out.addProperty("gameMode", player.gameMode().getName());
        out.addProperty("gameModeId", player.gameMode().getId());
        out.add("abilities", abilities(player.getAbilities()));
        var defaults = new Abilities(); player.gameMode().updatePlayerAbilities(defaults);
        out.add("modeDefaultAbilities", abilities(defaults));
        out.addProperty("health", player.getHealth());
        out.addProperty("absorption", player.getAbsorptionAmount());
        var food = new JsonObject();
        food.addProperty("level", player.getFoodData().getFoodLevel());
        food.addProperty("saturation", player.getFoodData().getSaturationLevel());
        out.add("food", food);
        var attrs = new JsonArray();
        var registered=new JsonArray();
        var ops = player.registryAccess().createSerializationContext(JsonOps.INSTANCE);
        for (var holder : BuiltInRegistries.ATTRIBUTE.listElements().toList()) {
            var instance = player.getAttribute(holder);
            var definition=new JsonObject();definition.addProperty("id",holder.key().identifier().toString());definition.addProperty("clientSyncable",holder.value().isClientSyncable());definition.addProperty("playerInstance",instance!=null);registered.add(definition);
            if (instance == null) continue;
            var row = new JsonObject();
            row.addProperty("id", holder.key().identifier().toString());
            row.addProperty("clientSyncable", holder.value().isClientSyncable());
            row.addProperty("base", instance.getBaseValue());
            row.addProperty("baseDecimal", Double.toString(instance.getBaseValue()));
            row.addProperty("effectiveDecimal", Double.toString(instance.getValue()));
            row.add("modifiers", AttributeModifier.CODEC.listOf().encodeStart(ops, instance.getModifiers().stream()
                    .sorted(Comparator.comparing(m -> m.id().toString())).toList()).getOrThrow());
            row.add("permanentModifiers", AttributeModifier.CODEC.listOf().encodeStart(ops, instance.getPermanentModifiers().stream()
                    .sorted(Comparator.comparing(m -> m.id().toString())).toList()).getOrThrow());
            attrs.add(row);
        }
        out.add("registeredAttributes",registered);out.add("attributes", attrs); return out;
    }
    private static JsonObject abilities(Abilities a) {
        var out = new JsonObject();
        out.addProperty("flying", a.flying); out.addProperty("mayfly", a.mayfly);
        out.addProperty("invulnerable", a.invulnerable); out.addProperty("mayBuild", a.mayBuild);
        out.addProperty("instabuild", a.instabuild);
        out.addProperty("walkSpeed", a.getWalkingSpeed()); out.addProperty("flySpeed", a.getFlyingSpeed());
        return out;
    }
}
