package dev.rinorsi.editor.testing;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.lang.reflect.*;
import java.util.*;
import java.util.function.Supplier;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.*;
import net.minecraft.nbt.*;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;
import net.minecraft.world.level.block.state.*;
import net.minecraft.world.level.storage.*;

/** Isolated JVM only: a genuinely registered custom block, BE, entity and persistent component. */
public final class GenericModFixtures {
    public static final String ID="generic_probe:machine", ENTITY_ID="generic_probe:agent", COMPONENT_ID="generic_probe:charge";
    public record Charge(int amount) {}
    public static DataComponentType<Charge> COMPONENT;
    public static Block BLOCK;
    public static BlockEntityType<Machine> BLOCK_ENTITY;
    public static EntityType<Agent> ENTITY;
    private GenericModFixtures() {}
    public static void register() throws Exception {
        COMPONENT=register(BuiltInRegistries.DATA_COMPONENT_TYPE,COMPONENT_ID,()->DataComponentType.<Charge>builder()
                .persistent(RecordCodecBuilder.create(i->i.group(Codec.intRange(0,100).fieldOf("amount").forGetter(Charge::amount)).apply(i,Charge::new))).build());
        BLOCK=register(BuiltInRegistries.BLOCK,ID,()->new MachineBlock(BlockBehaviour.Properties.of().setId(ResourceKey.create(Registries.BLOCK,Identifier.parse(ID)))));
        BLOCK_ENTITY=register(BuiltInRegistries.BLOCK_ENTITY_TYPE,ID,GenericModFixtures::blockType);
        ENTITY=register(BuiltInRegistries.ENTITY_TYPE,ENTITY_ID,()->EntityType.Builder.<Agent>of(Agent::new,MobCategory.MISC).sized(0.5f,0.5f)
                .build(ResourceKey.create(Registries.ENTITY_TYPE,Identifier.parse(ENTITY_ID))));
    }
    @SuppressWarnings("unchecked")
    private static BlockEntityType<Machine> blockType() {
        // The same actual two-argument constructor is private in 26.1, public in 26.2+.
        // Reflection is confined to fixtures; no production access widening.
        try {
            var ctor=Arrays.stream(BlockEntityType.class.getDeclaredConstructors()).filter(c->c.getParameterCount()==2).findFirst().orElseThrow();
            var factory=ctor.getParameterTypes()[0];
            Object supplier=Proxy.newProxyInstance(factory.getClassLoader(),new Class<?>[]{factory},(p,m,a)->new Machine((BlockPos)a[0],(BlockState)a[1]));
            ctor.setAccessible(true);return (BlockEntityType<Machine>)ctor.newInstance(supplier,Set.of(BLOCK));
        }catch(ReflectiveOperationException e){throw new IllegalStateException(e);}
    }
    private static <T,V extends T> V register(Registry<T> registry,String id,Supplier<V> create) throws Exception {
        var frozen=MappedRegistry.class.getDeclaredField("frozen");frozen.setAccessible(true);boolean wasFrozen=frozen.getBoolean(registry);
        var intrusive=MappedRegistry.class.getDeclaredField("unregisteredIntrusiveHolders");intrusive.setAccessible(true);Object old=intrusive.get(registry);
        frozen.setBoolean(registry,false);intrusive.set(registry,new IdentityHashMap<>());
        try {
            V value=create.get();registry.createIntrusiveHolder(value);Registry.register(registry,Identifier.parse(id),value);
            var holder=registry.get(Identifier.parse(id)).orElseThrow();
            var bind=Holder.Reference.class.getDeclaredMethod("bindValue",Object.class);bind.setAccessible(true);bind.invoke(holder,value);
            var bindTags=Holder.Reference.class.getDeclaredMethod("bindTags",Collection.class);bindTags.setAccessible(true);bindTags.invoke(holder,List.of());
            return value;
        }finally{frozen.setBoolean(registry,wasFrozen);intrusive.set(registry,old);}
    }
    public static final class MachineBlock extends Block implements EntityBlock {
        MachineBlock(BlockBehaviour.Properties props){super(props);}
        @Override public BlockEntity newBlockEntity(BlockPos pos,BlockState state){return new Machine(pos,state);}
    }
    public static final class Data {
        public int energy=12; public long serial=9007199254740993L; public float ratio=1.25f;
        public short small=4; public byte mode=3; public boolean enabled=true; public double scale=1.5;
        public String label="initial", reference=ID; public CompoundTag opaque=new CompoundTag();
        Data(){opaque.putByte("byte",(byte)7);opaque.putLong("long",Long.MAX_VALUE);opaque.putIntArray("array",new int[]{1,2,3});}
        void read(ValueInput in){energy=in.getIntOr("energy",12);serial=in.getLongOr("serial",serial);ratio=in.getFloatOr("ratio",ratio);
            small=(short)in.getShortOr("small",small);mode=in.getByteOr("mode",mode);enabled=in.getBooleanOr("enabled",enabled);scale=in.getDoubleOr("scale",scale);
            label=in.getStringOr("label",label);reference=in.getStringOr("reference",reference);opaque=in.read("opaque",CompoundTag.CODEC).orElseGet(CompoundTag::new);}
        void write(ValueOutput out){out.putInt("energy",energy);out.putLong("serial",serial);out.putFloat("ratio",ratio);out.putShort("small",small);out.putByte("mode",mode);
            out.putBoolean("enabled",enabled);out.putDouble("scale",scale);out.putString("label",label);out.putString("reference",reference);out.store("opaque",CompoundTag.CODEC,opaque);}
    }
    public static final class Machine extends BlockEntity {
        public final Data data=new Data();
        public Machine(BlockPos pos,BlockState state){super(BLOCK_ENTITY,pos,state);}
        @Override protected void loadAdditional(ValueInput in){super.loadAdditional(in);data.read(in);}
        @Override protected void saveAdditional(ValueOutput out){super.saveAdditional(out);data.write(out);}
    }
    public static final class Agent extends Entity {
        public final Data data=new Data();
        public boolean distortLiveLoad;
        public Agent(EntityType<? extends Agent> type,Level level){super(type,level);}
        @Override protected void defineSynchedData(SynchedEntityData.Builder builder){}
        @Override public boolean hurtServer(net.minecraft.server.level.ServerLevel level,net.minecraft.world.damagesource.DamageSource source,float amount){return false;}
        @Override protected void readAdditionalSaveData(ValueInput in){data.read(in);if(distortLiveLoad&&data.energy==37){data.opaque=data.opaque.copy();data.opaque.remove("array");}}
        @Override protected void addAdditionalSaveData(ValueOutput out){data.write(out);}
    }
}
