package dev.rinorsi.editor.vault;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.util.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.ai.attributes.*;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.GameType;

/** Runtime registry/Codec checks for same-entry template updates, before any vault mutation. */
final class PlayerPresetValidation {
    private PlayerPresetValidation() {}
    static JsonObject validate(JsonObject template,VaultStore.Validator validator){
        try{return validateNative(template,validator);}catch(VaultStore.Failure e){throw e;}catch(RuntimeException e){throw new VaultStore.Failure("BAD_REQUEST","原版预设校验失败："+e.getMessage());}
    }
    private static JsonObject validateNative(JsonObject template,VaultStore.Validator validator){
        var result=VaultTemplates.validate("player_preset",template);var sections=result.getAsJsonObject("sections");
        var ops=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY).createSerializationContext(JsonOps.INSTANCE);
        for(var entry:sections.entrySet()){
            String section=entry.getKey();
            if(Set.of("inventory","equipment","ender").contains(section)){
                for(var raw:entry.getValue().getAsJsonObject().getAsJsonArray("slots")){
                    var row=raw.getAsJsonObject();if(section.equals("ender")&&row.get("slot").getAsInt()>=new net.minecraft.world.inventory.PlayerEnderChestContainer().getContainerSize())fail("末影箱槽位越界");
                    if(!row.getAsJsonObject("stack").has("empty")){
                        var supplied=row.getAsJsonObject("stack");var normalized=validator.validate(supplied).stack().deepCopy();
                        // VaultTemplates captures the same StackCodec snapshot as the player page.
                        // Item-vault validators omit these UI fields; preserve them in preset roundtrips.
                        for(String key:List.of("slot","label"))if(supplied.has(key))normalized.add(key,supplied.get(key).deepCopy());row.add("stack",normalized);
                    }
                }
            }else if(section.equals("game_mode")){
                if(Arrays.stream(GameType.values()).noneMatch(g->g.getName().equals(entry.getValue().getAsString())))fail("未知游戏模式");
            }else if(section.equals("effects")){
                var ids=new HashSet<Object>();for(var raw:entry.getValue().getAsJsonArray()){var effect=MobEffectInstance.CODEC.parse(ops,raw).getOrThrow();if(!ids.add(effect.getEffect()))fail("效果重复");}
            }else if(section.equals("attributes")){
                var defaults=Player.createAttributes().build();var ids=new HashSet<Identifier>();
                for(var raw:entry.getValue().getAsJsonArray()){
                    var row=raw.getAsJsonObject();if(!Set.of("id","base","modifiers").containsAll(row.keySet()))fail("未知属性字段");
                    var id=Identifier.parse(row.get("id").getAsString());var h=BuiltInRegistries.ATTRIBUTE.get(id).orElseThrow();
                    if(!defaults.hasAttribute(h)||!ids.add(id))fail("玩家不支持该属性或属性重复");
                    if(!row.has("base")||!row.get("base").isJsonPrimitive()||!row.getAsJsonPrimitive("base").isNumber())fail("属性值必须为数字");
                    double n=row.get("base").getAsDouble();if(!Double.isFinite(n)||h.value() instanceof RangedAttribute r&&(n<r.getMinValue()||n>r.getMaxValue()))fail("属性值超出范围");
                    var mods=new HashSet<Identifier>();if(row.has("modifiers"))for(var m:AttributeModifier.CODEC.listOf().parse(ops,row.get("modifiers")).getOrThrow())if(!Double.isFinite(m.amount())||!mods.add(m.id()))fail("属性修饰符重复或数值无效");
                }
            }
        }
        return result;
    }
    private static void fail(String reason){throw new VaultStore.Failure("BAD_REQUEST",reason);}
}
