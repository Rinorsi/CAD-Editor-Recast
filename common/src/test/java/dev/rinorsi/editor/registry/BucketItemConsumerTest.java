package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.nio.file.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.item.*;

/** Detached native factories/loaders/getters/bucket saves; no server, client, chunks or ticks. */
public final class BucketItemConsumerTest {
    private static int checks;
    private static EntitySchemaTestLevel level;
    private static LivingEntity make(EntityType<?> type) {
        return (LivingEntity) type.create(level, EntitySpawnReason.LOAD);
    }
    private static void load(LivingEntity entity, CompoundTag input) throws ReflectiveOperationException {
        entity.getClass().getMethod("loadFromBucketTag", CompoundTag.class).invoke(entity, input);
    }
    private static CompoundTag save(LivingEntity entity, Item item) throws ReflectiveOperationException {
        ItemStack stack = item.getDefaultInstance();
        entity.getClass().getMethod("saveToBucketTag", ItemStack.class).invoke(entity, stack);
        return stack.get(DataComponents.BUCKET_ENTITY_DATA).copyTag();
    }
    private static Object getter(Entity entity, String name) throws ReflectiveOperationException {
        for (Class<?> c=entity.getClass(); c!=null; c=c.getSuperclass()) {
            try { var m=c.getDeclaredMethod(name); m.setAccessible(true); return m.invoke(entity); }
            catch (NoSuchMethodException ignored) { /* The actual species can override a protected getter. */ }
        }
        throw new NoSuchMethodException(entity.getClass().getName() + "." + name);
    }
    private static Object state(LivingEntity e, String key) throws ReflectiveOperationException {
        return switch (key) {
            case "NoAI" -> ((Mob)e).isNoAi();
            case "Silent" -> e.isSilent();
            case "NoGravity" -> e.isNoGravity();
            case "Glowing" -> e.hasGlowingTag();
            case "Invulnerable" -> e.isInvulnerable();
            case "PersistenceRequired" -> ((Mob)e).isPersistenceRequired();
            case "Health" -> e.getHealth();
            case "Age", "age" -> getter(e, "getAge");
            case "AgeLocked", "age_locked" -> getter(e, "isAgeLocked");
            case "HuntingCooldown" -> e.getBrain().getTimeUntilExpiry(MemoryModuleType.HAS_HUNTING_COOLDOWN);
            default -> throw new AssertionError("Unverified field: " + key);
        };
    }
    private static void require(boolean ok, String why) { checks++; if (!ok) throw new AssertionError(why); }
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion(); net.minecraft.server.Bootstrap.bootStrap();
        var access = EntitySchemaTest.access(); level = new EntitySchemaTestLevel(access, false);
        JsonArray rows = new JsonArray();
        for (Item item : BuiltInRegistries.ITEM) {
            if (!(item instanceof MobBucketItem)) continue;
            JsonObject meta = new JsonObject(); BucketItemMetadata.append(item, meta);
            meta.addProperty("id", BuiltInRegistries.ITEM.getKey(item).toString());
            if (!meta.get("bucket_fields_verified").getAsBoolean()) continue;
            var type = BuiltInRegistries.ENTITY_TYPE.getOptional(net.minecraft.resources.Identifier.parse(meta.get("bucket_entity").getAsString())).orElseThrow();
            JsonObject row = new JsonObject(); row.add("metadata", meta); JsonArray fields = new JsonArray(); row.add("fields", fields);
            // Schema is from this exact runtime entity, not an aggregate of several species.
            var schema = EntitySchema.describe(type, level, access);
            JsonObject health = schema.getAsJsonArray("flags").asList().stream().map(JsonElement::getAsJsonObject)
                    .filter(f -> f.has("id") && f.get("id").getAsString().equals("health")).findFirst().orElseThrow();
            row.add("schemaHealth", health);
            require(health.get("max").getAsFloat() == ((LivingEntity)EntitySchema.create(type, level)).getMaxHealth(), "schema uses native max health");
            for (var raw : meta.getAsJsonArray("bucket_fields")) {
                JsonObject field = raw.getAsJsonObject(); String key = field.get("key").getAsString(), kind = field.get("type").getAsString();
                JsonObject result = new JsonObject(); result.addProperty("key", key); JsonArray values = new JsonArray(); result.add("values", values);
                for (int i=0; i<2; i++) {
                    LivingEntity entity = make(type); CompoundTag input = new CompoundTag();
                    if (kind.equals("boolean")) input.putBoolean(key, i==1);
                    else if (kind.equals("float")) input.putFloat(key, i+1);
                    else if (kind.equals("long")) input.putLong(key, 100+i*100);
                    else input.putInt(key, 100+i*100);
                    load(entity, input); Object actual = state(entity, key); CompoundTag saved = save(entity, item);
                    String detail = type + "/" + key;
                    if (kind.equals("boolean")) {
                        require(actual.equals(i==1), detail + " native getter");
                        require(saved.getBooleanOr(key, false)==(i==1), detail + " bucket save");
                    } else {
                        require(((Number)actual).doubleValue()==(kind.equals("float") ? i+1 : 100+i*100), detail + " native getter");
                        require(saved.get(key) instanceof NumericTag n && n.doubleValue()==((Number)actual).doubleValue(), detail + " bucket save");
                    }
                    JsonObject value = new JsonObject(); value.addProperty("input", input.toString()); value.addProperty("getter", String.valueOf(actual)); value.addProperty("saved", saved.toString()); values.add(value);
                }
                fields.add(result);
            }
            JsonArray healthValues = new JsonArray();
            for (float inputValue : new float[]{-5,1,999}) {
                LivingEntity e = make(type); CompoundTag input = new CompoundTag(); input.putFloat("Health", inputValue); load(e,input);
                float expected = Math.max(0, Math.min(inputValue, e.getMaxHealth()));
                require(e.getHealth()==expected, type + " native health clamp");
                require(save(e,item).getFloatOr("Health", -1)==expected, type + " clamped health bucket save");
                JsonObject value = new JsonObject(); value.addProperty("input", inputValue); value.addProperty("health", e.getHealth()); value.addProperty("max", e.getMaxHealth()); healthValues.add(value);
            }
            row.add("health", healthValues);
            CompoundTag opaque = TagParser.parseCompoundFully("{Health:999.0f,unknown:9007199254740993L,bytes:[B;1b],ints:[I;2],longs:[L;3L],small:2s}");
            ItemStack original = item.getDefaultInstance();
            original.set(DataComponents.BUCKET_ENTITY_DATA, net.minecraft.world.item.component.CustomData.of(opaque));
            var wire = dev.rinorsi.editor.StackCodec.snapshot(original, access, new JsonObject(), "bucket-consumer-test");
            ItemStack decoded = dev.rinorsi.editor.StackCodec.decode(wire, access, original);
            require(decoded.get(DataComponents.BUCKET_ENTITY_DATA).copyTag().equals(opaque), type + " production StackCodec preserves over-limit raw and unknown typed data");
            load(make(type), decoded.get(DataComponents.BUCKET_ENTITY_DATA).copyTag());
            require(decoded.get(DataComponents.BUCKET_ENTITY_DATA).copyTag().equals(opaque), type + " detached consumer normalization never rewrites item raw");
            row.addProperty("rawCodecTag", opaque.toString());
            //? if >=26.2 {
            if (type == net.minecraft.world.entity.EntityTypes.SULFUR_CUBE) {
                row.add("speciesSpawnHealth", sulfur(item, type, meta, health.get("max").getAsFloat()));
            }
            //?}
            rows.add(row); System.out.println("BUCKET_CONSUMER_JSON " + row);
        }
        if (args.length>0) Files.writeString(Path.of(args[0]), new GsonBuilder().setPrettyPrinting().create().toJson(rows));
        System.out.println("PASS BucketItemConsumerTest: " + checks + " per-species native loader/getter/bucket-save checks; no game");
    }
    //? if >=26.2 {
    private static JsonArray sulfur(Item item, EntityType<?> type, JsonObject meta, float schemaMax) throws Exception {
        JsonArray results = new JsonArray();
        // This species override only inspects its own age; verified native code does not use
        // either argument. Invoke that actual method, not a guessed health or size assignment.
        var spawnSize = net.minecraft.world.entity.monster.cubemob.SulfurCube.class.getDeclaredMethod("setSpawnSize", net.minecraft.world.level.ServerLevelAccessor.class, net.minecraft.world.DifficultyInstance.class);
        spawnSize.setAccessible(true);
        for (int initialAge : new int[]{-100,0}) for (int age : new int[]{-100,0,100}) for (float value : new float[]{-5,1,999}) {
            var e = (net.minecraft.world.entity.monster.cubemob.SulfurCube)make(type);
            e.setAge(initialAge); spawnSize.invoke(e, null, null);
            float initialMax = e.getMaxHealth();
            double schemaDerived = schemaMax * (e.isBaby() ? 1 : meta.get("bucket_health_size_ratio").getAsDouble());
            require(initialMax==schemaDerived, "schema/official size ratio equals actual species spawn max health");
            CompoundTag input = new CompoundTag(); input.putInt("age", age); input.putBoolean("age_locked", true); input.putFloat("Health", value); load(e,input);
            require(e.getAge()==age && e.isAgeLocked(), "sulfur lowercase age and age_locked getter");
            CompoundTag saved = save(e,item);
            require(saved.getIntOr("age", 999)==age && saved.getBooleanOr("age_locked", false), "sulfur lowercase bucket save");
            float expected = initialAge<0 && age>=0 ? e.getMaxHealth() : Math.max(0,Math.min(value,initialMax));
            require(e.getHealth()==expected && saved.getFloatOr("Health",-1)==expected, "species age transition can reset Health after common loader");
            JsonObject result = new JsonObject(); result.addProperty("initialAge", initialAge); result.addProperty("input", input.toString()); result.addProperty("health", e.getHealth()); result.addProperty("max", e.getMaxHealth()); result.addProperty("size", e.getSize()); result.addProperty("saved", saved.toString()); results.add(result);
        }
        return results;
    }
    //?}
}
