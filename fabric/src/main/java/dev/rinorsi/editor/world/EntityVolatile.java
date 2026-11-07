package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorSessions;
import java.util.*;
import net.minecraft.nbt.*;

/** 26.1.2 Entity/LivingEntity/AgeableMob save and tick state. See world-entity-contract.md. */
public final class EntityVolatile {
    private EntityVolatile() {}
    public static final Set<String> CURRENT = Set.of(
        "Pos","Motion","Rotation","Air","Fire","OnGround","fall_distance","FallDistance",
        "PortalCooldown","HurtTime","DeathTime","HurtByTimestamp","Brain","FallFlying",
        "current_impulse_context_reset_grace_time","current_explosion_impact_pos",
        "last_hurt_by_player","last_hurt_by_player_memory_time","last_hurt_by_mob","ForcedAge",
        "InWaterTime","DrownedConversionTime");
    public static boolean entity(CompoundTag nbt) { return nbt.contains("UUID") && nbt.contains("Pos"); }
    public static CompoundTag stable(CompoundTag nbt) {
        if(nbt.get("cad_entity_nbt") instanceof CompoundTag data){var result=nbt.copy();result.put("cad_entity_nbt",stable(data));return result;}
        if (!entity(nbt)) return nbt;
        var result = nbt.copy(); CURRENT.forEach(result::remove);
        // Age counts towards zero each tick; crossing the baby/adult boundary is meaningful.
        if (result.get("Age") instanceof NumericTag age) result.putInt("Age", age.intValue() < 0 ? -1 : 0);
        if (result.get("active_effects") instanceof ListTag effects) effects.forEach(EntityVolatile::stableEffect);
        normalizeDefaultAttributes(result);
        if (result.get("Passengers") instanceof ListTag passengers)
            for (int i=0;i<passengers.size();i++) if (passengers.get(i) instanceof CompoundTag child) passengers.set(i,stable(child));
        return result;
    }
    /** Reject an intentional write to runtime-only state, but allow the stale values from open. */
    public static CompoundTag rebase(CompoundTag baseline, CompoundTag requested, CompoundTag current, boolean undo) {
        if (!undo) {
            WorldNbt.protect(baseline,requested,true);
            for (String key : CURRENT) if (!Objects.equals(baseline.get(key),requested.get(key)))
                EditorSessions.fail("protected_field","运行时动态字段只读："+key);
        }
        var result = requested.copy();
        for (String key : CURRENT) copy(current,result,key);
        // Relationships are edited only through the riding operation, never through NBT.
        copy(current,result,"Passengers");
        boolean sameAgeStage=requested.get("Age") instanceof NumericTag a&&current.get("Age") instanceof NumericTag b&&(a.intValue()<0)==(b.intValue()<0);
        if ((undo&&sameAgeStage) || (!undo&&Objects.equals(baseline.get("Age"),requested.get("Age")))) copy(current,result,"Age");
        if(!undo&&Objects.equals(baseline.get("attributes"),requested.get("attributes")))copy(current,result,"attributes");
        if(result.get("active_effects") instanceof ListTag edits && baseline.get("active_effects") instanceof ListTag base && current.get("active_effects") instanceof ListTag live)
            for(int i=0;i<edits.size();i++)if(edits.get(i) instanceof CompoundTag edit)
                for(int j=0;j<base.size()&&j<live.size();j++)if(base.get(j) instanceof CompoundTag old&&live.get(j) instanceof CompoundTag now&&Objects.equals(edit.get("id"),old.get("id")))mergeEffect(edit,old,now,undo);
        return result;
    }
    private static void stableEffect(Tag tag){if(tag instanceof CompoundTag effect){if(effect.get("duration") instanceof NumericTag duration)effect.putInt("duration",Integer.signum(duration.intValue()));if(effect.contains("hidden_effect"))stableEffect(effect.get("hidden_effect"));}}
    /** AttributeMap lazily allocates instances when AI first reads them. Empty versus an explicitly
     * saved supplier-default base is the same editable value, not a concurrent attribute edit. */
    @SuppressWarnings("unchecked") private static void normalizeDefaultAttributes(CompoundTag tag){
        if(!(tag.get("attributes") instanceof ListTag attributes))return;
        var id=net.minecraft.resources.Identifier.tryParse(tag.getString("id").orElse(""));if(id==null)return;
        var type=net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getOptional(id).orElse(null);
        if(type==null||!net.minecraft.world.entity.ai.attributes.DefaultAttributes.hasSupplier(type))return;
        var supplier=net.minecraft.world.entity.ai.attributes.DefaultAttributes.getSupplier((net.minecraft.world.entity.EntityType<? extends net.minecraft.world.entity.LivingEntity>)type);
        attributes.removeIf(raw->{if(!(raw instanceof CompoundTag row)||!Set.of("id","base","modifiers").containsAll(row.keySet()))return false;
            var key=net.minecraft.resources.Identifier.tryParse(row.getString("id").orElse(""));if(key==null||!(row.get("base") instanceof NumericTag base))return false;
            var attribute=net.minecraft.core.registries.BuiltInRegistries.ATTRIBUTE.get(key).orElse(null);
            return attribute!=null&&supplier.hasAttribute(attribute)&&Double.compare(base.doubleValue(),supplier.getBaseValue(attribute))==0&&(!row.contains("modifiers")||row.get("modifiers") instanceof ListTag modifiers&&modifiers.isEmpty());});
    }
    private static void mergeEffect(CompoundTag edit,CompoundTag base,CompoundTag live,boolean undo){if(undo||Objects.equals(edit.get("duration"),base.get("duration")))copy(live,edit,"duration");if(edit.get("hidden_effect") instanceof CompoundTag e&&base.get("hidden_effect") instanceof CompoundTag b&&live.get("hidden_effect") instanceof CompoundTag l)mergeEffect(e,b,l,undo);}
    private static void copy(CompoundTag from, CompoundTag to, String key) { if(from.contains(key))to.put(key,from.get(key).copy());else to.remove(key); }
}
