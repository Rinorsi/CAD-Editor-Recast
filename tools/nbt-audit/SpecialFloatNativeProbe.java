package dev.rinorsi.editor;

import com.mojang.serialization.Codec;
import net.minecraft.nbt.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.server.level.ServerPlayer;

/** Run against resolved game jars, never a local copy of Minecraft algorithms. */
public final class SpecialFloatNativeProbe {
    static int checks;
    static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
    static Tag parse(String value) throws Exception { return SpecialFloatingPointSnbt.parse(value); }
    static void rejects(String value) throws Exception {
        try { parse(value); } catch (Exception expected) { checks++; return; }
        throw new AssertionError("unexpected parse: " + value);
    }
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion(); net.minecraft.server.Bootstrap.bootStrap();
        for (String raw : new String[]{"NaNf", "Infinityf", "-Infinityd"}) {
            boolean rejected=false;
            try { TagParser.create(NbtOps.INSTANCE).parseFully(raw); } catch (Exception expected) { rejected=true; }
            // Some native versions tokenize these as strings; none produce a special numeric tag.
            check(rejected || TagParser.create(NbtOps.INSTANCE).parseFully(raw) instanceof StringTag, "vanilla special spelling is not numeric");
        }
        float f=Float.MAX_VALUE/2f; double d=Double.MAX_VALUE/2d;
        String values="{nested:[{finite:"+f+"f,special:NaNf}],finiteD:"+d+"d,specialD:-Infinityd,quoted:\"NaNf\",Infinityf:1,arr:[I;1,2],hex:0x7fffffff,op:bool(1)}";
        var out=(CompoundTag)parse(values);
        var nested=(CompoundTag)out.getList("nested").orElseThrow().get(0);
        check(nested.getFloat("finite").orElseThrow()==f,"finite float marker collision stays finite");
        check(Float.isNaN(nested.getFloat("special").orElseThrow()),"nested special float restored by path");
        check(out.getDouble("finiteD").orElseThrow()==d,"finite double marker collision stays finite");
        check(out.getDouble("specialD").orElseThrow()==Double.NEGATIVE_INFINITY,"double restored");
        check(out.getString("quoted").orElseThrow().equals("NaNf") && out.getInt("Infinityf").orElseThrow()==1,"quoted values and bare keys unchanged");
        check(out.getIntArray("arr").orElseThrow().length==2 && out.getInt("hex").orElseThrow()==Integer.MAX_VALUE,"native typed array and hex retained");
        // Critical case: vanilla last-key-wins can discard a special token while
        // an unrelated ordinary number has exactly its placeholder bits.
        var duplicate=(CompoundTag)parse("{a:NaNf,a:1f,finite:"+f+"f}");
        check(duplicate.getFloat("a").orElseThrow()==1f && duplicate.getFloat("finite").orElseThrow()==f,"discarded special never corrupts another finite field");
        var secondMarkers=(CompoundTag)parse("{specialF:NaNf,finiteF:"+(Float.MAX_VALUE/4f)+"f,specialD:Infinityd,finiteD:"+(Double.MAX_VALUE/4d)+"d}");
        check(secondMarkers.getFloat("finiteF").orElseThrow()==Float.MAX_VALUE/4f
                && secondMarkers.getDouble("finiteD").orElseThrow()==Double.MAX_VALUE/4d,"finite values equal to second marker set stay finite");
        for(String original : new String[]{"0x1.fffffep126f","0x1.fffffffffffffp1022d","bool(1)","uuid('00000000-0000-0000-0000-000000000001')"}) {
            Tag vanilla;
            try { vanilla=TagParser.create(NbtOps.INSTANCE).parseFully(original); }
            catch(Exception unsupported) { rejects("{special:NaNf,value:"+original+"}");continue; }
            check(((CompoundTag)parse("{special:NaNf,value:"+original+"}")).get("value").equals(vanilla),"native hex/operation unchanged: "+original);
        }
        var list=(ListTag)parse("[NaNf,"+f+"f,Infinityf]");
        check(Float.isNaN(list.getFloat(0).orElseThrow()) && list.getFloat(1).orElseThrow()==f && list.getFloat(2).orElseThrow()==Float.POSITIVE_INFINITY,"mixed finite/special list retains each position");
        rejects("[I;NaNf]"); rejects("[B;Infinityd]"); rejects("[L;-Infinityd]"); rejects("{x:NaNf,broken:}");
        for (float special : new float[]{Float.NaN,Float.POSITIVE_INFINITY,Float.NEGATIVE_INFINITY})
            check(Codec.FLOAT.parse(NbtOps.INSTANCE,FloatTag.valueOf(special)).result().isPresent(),"actual primitive FLOAT Codec accepts special");
        for (double special : new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY})
            check(Codec.DOUBLE.parse(NbtOps.INSTANCE,DoubleTag.valueOf(special)).result().isPresent(),"actual primitive DOUBLE Codec accepts special");
        var data=DataComponents.CUSTOM_DATA.codec().parse(NbtOps.INSTANCE,out).getOrThrow();
        var persisted=DataComponents.CUSTOM_DATA.codec().encodeStart(NbtOps.INSTANCE,data).getOrThrow();
        check(((CustomData)data).copyTag().equals(persisted),"real custom_data Codec NBT persistence");
        // Unsafe only allocates a disconnected test receiver; no constructor,
        // world, connection, server, save directory or live game is touched.
        var field=sun.misc.Unsafe.class.getDeclaredField("theUnsafe");field.setAccessible(true);
        var player=(ServerPlayer)((sun.misc.Unsafe)field.get(null)).allocateInstance(ServerPlayer.class);
        player.setExperienceLevels(Integer.MAX_VALUE);
        check(player.experienceLevel==Integer.MAX_VALUE,"native setter accepts full positive int level");
        player.experienceLevel=238609311;check(player.getXpNeededForNextLevel()==2147483641,"last pre-overflow next-level cost");
        player.experienceLevel=238609312;check(player.getXpNeededForNextLevel()<0,"native next-level int arithmetic actually overflows");
        player.experienceLevel=4;player.setExperiencePoints(7);check(player.experienceProgress==7f/15f,"native points command fraction contract");
        System.out.println("PASS actual game parser/Codec/XP: "+checks+" checks");
    }
}
