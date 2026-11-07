package dev.rinorsi.editor.registry;
import net.minecraft.core.*;
import net.minecraft.core.registries.*;
import net.minecraft.world.level.*;
import net.minecraft.world.level.storage.*;
import net.minecraft.world.level.dimension.*;
/** Pure-JVM factory fixture: client-side, no chunks, no entities registered or ticked. */
final class EntitySchemaTestLevel extends Level {
 public boolean noCollision(net.minecraft.world.entity.Entity e,net.minecraft.world.phys.AABB box){return true;}
 public java.util.List<net.minecraft.world.entity.Entity> getEntities(net.minecraft.world.entity.Entity e,net.minecraft.world.phys.AABB box,java.util.function.Predicate<? super net.minecraft.world.entity.Entity> predicate){return java.util.List.of();}
 public <T extends net.minecraft.world.entity.Entity> java.util.List<T> getEntities(net.minecraft.world.level.entity.EntityTypeTest<net.minecraft.world.entity.Entity,T> test,net.minecraft.world.phys.AABB box,java.util.function.Predicate<? super T> predicate){return java.util.List.of();}
 public net.minecraft.world.level.block.state.BlockState getBlockState(net.minecraft.core.BlockPos p){return net.minecraft.world.level.block.Blocks.AIR.defaultBlockState();}
 public net.minecraft.world.level.material.FluidState getFluidState(net.minecraft.core.BlockPos p){return net.minecraft.world.level.material.Fluids.EMPTY.defaultFluidState();}
 public net.minecraft.core.Holder<net.minecraft.world.level.biome.Biome> getBiome(net.minecraft.core.BlockPos p){return registryAccess().lookupOrThrow(Registries.BIOME).listElements().findFirst().orElseThrow();}
 public net.minecraft.world.level.border.WorldBorder getWorldBorder(){return new net.minecraft.world.level.border.WorldBorder();}
 public void gameEvent(Holder<net.minecraft.world.level.gameevent.GameEvent> e,net.minecraft.world.phys.Vec3 p,net.minecraft.world.level.gameevent.GameEvent.Context c){}
 public void levelEvent(net.minecraft.world.entity.Entity e,int id,net.minecraft.core.BlockPos p,int data){}
 public long nextSubTickCount(){return 0;}
 public net.minecraft.world.level.chunk.ChunkSource getChunkSource(){return null;}
 public net.minecraft.world.ticks.LevelTickAccess<net.minecraft.world.level.block.Block> getBlockTicks(){return null;}
 public net.minecraft.world.ticks.LevelTickAccess<net.minecraft.world.level.material.Fluid> getFluidTicks(){return null;}
 public java.util.List<? extends net.minecraft.world.entity.player.Player> players(){return java.util.List.of();}
 public net.minecraft.world.flag.FeatureFlagSet enabledFeatures(){return net.minecraft.world.flag.FeatureFlags.DEFAULT_FLAGS;}
 public int getSeaLevel(){return 63;}
 public net.minecraft.core.Holder<net.minecraft.world.level.biome.Biome> getUncachedNoiseBiome(int x,int y,int z){return registryAccess().lookupOrThrow(Registries.BIOME).listElements().findFirst().orElseThrow();}
 EntitySchemaTestLevel(RegistryAccess access){this(access,true);}
 EntitySchemaTestLevel(RegistryAccess access,boolean client){super(data(),Level.OVERWORLD,access,access.lookupOrThrow(Registries.DIMENSION_TYPE).getOrThrow(BuiltinDimensionTypes.OVERWORLD),client,false,0,0);}
 private static WritableLevelData data(){return (WritableLevelData)java.lang.reflect.Proxy.newProxyInstance(WritableLevelData.class.getClassLoader(),new Class[]{WritableLevelData.class},(p,m,a)->{if(m.getReturnType()==boolean.class)return false;if(m.getReturnType()==int.class)return 0;if(m.getReturnType()==long.class)return 0L;if(m.getReturnType()==net.minecraft.world.Difficulty.class)return net.minecraft.world.Difficulty.NORMAL;return null;});}
public void sendBlockUpdated(net.minecraft.core.BlockPos a0,net.minecraft.world.level.block.state.BlockState a1,net.minecraft.world.level.block.state.BlockState a2,int a3) {}
public void playSeededSound(net.minecraft.world.entity.Entity a0,double a1,double a2,double a3,net.minecraft.core.Holder<net.minecraft.sounds.SoundEvent> a4,net.minecraft.sounds.SoundSource a5,float a6,float a7,long a8) {}
public void playSeededSound(net.minecraft.world.entity.Entity a0,net.minecraft.world.entity.Entity a1,net.minecraft.core.Holder<net.minecraft.sounds.SoundEvent> a2,net.minecraft.sounds.SoundSource a3,float a4,float a5,long a6) {}
public void explode(net.minecraft.world.entity.Entity a0,net.minecraft.world.damagesource.DamageSource a1,net.minecraft.world.level.ExplosionDamageCalculator a2,double a3,double a4,double a5,float a6,boolean a7,net.minecraft.world.level.Level.ExplosionInteraction a8,net.minecraft.core.particles.ParticleOptions a9,net.minecraft.core.particles.ParticleOptions a10,net.minecraft.util.random.WeightedList<net.minecraft.core.particles.ExplosionParticleInfo> a11,net.minecraft.core.Holder<net.minecraft.sounds.SoundEvent> a12) {}
public java.lang.String gatherChunkSourceStats() {return "test";}
public void setRespawnData(net.minecraft.world.level.storage.LevelData.RespawnData a0) {}
public net.minecraft.world.level.storage.LevelData.RespawnData getRespawnData() {return null;}
public net.minecraft.world.entity.Entity getEntity(int a0) {return null;}
public java.util.Collection<net.minecraft.world.entity.boss.enderdragon.EnderDragonPart> dragonParts() {return null;}
public net.minecraft.world.TickRateManager tickRateManager() {return null;}
public net.minecraft.world.level.saveddata.maps.MapItemSavedData getMapData(net.minecraft.world.level.saveddata.maps.MapId a0) {return null;}
public void destroyBlockProgress(int a0,net.minecraft.core.BlockPos a1,int a2) {}
public net.minecraft.world.scores.Scoreboard getScoreboard() {return null;}
public net.minecraft.world.item.crafting.RecipeAccess recipeAccess() {return null;}
protected net.minecraft.world.level.entity.LevelEntityGetter<net.minecraft.world.entity.Entity> getEntities() {return null;}
public net.minecraft.world.clock.ClockManager clockManager() {return h->0L;}
public net.minecraft.world.attribute.EnvironmentAttributeSystem environmentAttributes() {return net.minecraft.world.attribute.EnvironmentAttributeSystem.builder().build();}
public net.minecraft.world.item.alchemy.PotionBrewing potionBrewing() {return null;}
public net.minecraft.world.level.block.entity.FuelValues fuelValues() {return null;}
}
