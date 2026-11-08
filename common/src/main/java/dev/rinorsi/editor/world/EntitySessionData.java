package dev.rinorsi.editor.world;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.Entity;

/** Runtime vehicle identity is absent from ordinary Entity saves. Hash it without inventing NBT. */
public final class EntitySessionData {
    private EntitySessionData() {}
    public static CompoundTag pack(CompoundTag nbt,Entity entity){
        var result=new CompoundTag();result.put("cad_entity_nbt",nbt.copy());
        result.putString("cad_entity_vehicle",entity.getVehicle()==null?"":entity.getVehicle().getStringUUID());return result;
    }
    public static CompoundTag data(CompoundTag session){return session.getCompound("cad_entity_nbt").orElse(session).copy();}
}
