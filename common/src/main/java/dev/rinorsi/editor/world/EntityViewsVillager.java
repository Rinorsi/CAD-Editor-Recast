package dev.rinorsi.editor.world;

import com.google.gson.*;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.monster.zombie.ZombieVillager;

/** VillagerData/type, profession, level and Xp already have live generic schema controls. */
final class EntityViewsVillager {
    private EntityViewsVillager() {}
    static boolean supports(String key) { return key.equals("zombie_conversion"); }
    static void views(JsonObject out,Entity entity,CompoundTag saved) {
        if(entity instanceof ZombieVillager) {
            var view=new JsonObject();view.addProperty("readOnly",true);
            for(String key:new String[]{"ConversionTime","ConversionPlayer"})view.add(key,saved.contains(key)?EntityWorldEdit.json(saved.get(key)):JsonNull.INSTANCE);
            out.add("zombie_conversion",view);
        }
    }
    static void apply(JsonObject edit) {
        if(edit.has("zombie_conversion"))throw new IllegalArgumentException("Zombie conversion state is read-only");
    }
}
