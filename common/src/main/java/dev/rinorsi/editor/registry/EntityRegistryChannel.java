package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiConsumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.storage.TagValueOutput;

/** On-demand data, isolated from initial warmup and never added to the client level. */
public final class EntityRegistryChannel {
    private static final AtomicLong GENERATION = new AtomicLong();
    private static final AtomicLong SCHEMA_GENERATION = new AtomicLong();
    public static void invalidateSchemas() { SCHEMA_GENERATION.incrementAndGet(); EntitySchemaValidation.invalidate(); }
    private EntityRegistryChannel() {}
    public static boolean supports(String name) {
        return name.equals("entity_info") || name.startsWith("entity_info:") || name.equals("entity_schema") || name.startsWith("entity_schema:")
                || name.equals("entity_base_attributes") || name.equals("equipment_slot_groups") || name.equals("spawner_info");
    }
    public static void request(JsonObject request, String name, BiConsumer<List<String>, JsonObject> reply) {
        var mc = Minecraft.getInstance();
        JsonObject context = new JsonObject();
        if (request.has("id") && request.get("id").isJsonPrimitive() && request.getAsJsonPrimitive("id").isString()) context.add("id", request.get("id"));
        if (name.startsWith("entity_info:")) context.addProperty("id", name.substring("entity_info:".length()));
        if (name.startsWith("entity_schema:")) context.addProperty("id", name.substring("entity_schema:".length()));
        mc.execute(() -> {
            String generation = name.startsWith("entity_schema") ? "entity-schema-" + SCHEMA_GENERATION.get() : "entity-" + GENERATION.incrementAndGet();
            try {
                JsonArray entries;
                if (name.equals("equipment_slot_groups")) entries = EntityDefaults.slotGroups();
                else if (name.equals("entity_base_attributes")) {
                    entries = new JsonArray();
                    if (context.has("id")) {
                        var type = resolve(context.get("id").getAsString());
                        JsonObject row = new JsonObject(); row.addProperty("id", BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
                        row.add("attributes", EntityDefaults.attributes(type)); entries.add(row);
                    } else for (var type : BuiltInRegistries.ENTITY_TYPE) {
                        JsonObject row = new JsonObject(); row.addProperty("id", BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
                        row.add("attributes", EntityDefaults.attributes(type)); entries.add(row);
                    }
                } else {
                    if (mc.level == null) throw new IllegalStateException("没有客户端世界，无法读取实体/刷怪器模板");
                    if (name.equals("spawner_info")) entries = SpawnerData.entries(mc.level.registryAccess());
                    else if (name.equals("entity_schema") || name.startsWith("entity_schema:")) {
                        if (!context.has("id")) throw new IllegalArgumentException("缺少实体 id");
                        var type=resolve(context.get("id").getAsString());entries=new JsonArray();
                        entries.add(EntitySchemaValidation.schema(BuiltInRegistries.ENTITY_TYPE.getKey(type).toString(),mc.level));
                    }
                    else {
                        if (!context.has("id")) throw new IllegalArgumentException("缺少实体 id");
                        var type = resolve(context.get("id").getAsString());
                        Entity entity = null; String templateError = null;
                        try {
                            entity = type == net.minecraft.world.entity.EntityTypes.PLAYER && mc.player != null ? new RemotePlayer(mc.level, mc.player.getGameProfile())
                                    : type.create(mc.level, EntitySpawnReason.LOAD);
                            if (entity == null) templateError = "该实体类型不提供客户端工厂";
                        } catch (RuntimeException error) { templateError = message(error); }
                        JsonObject row = EntityDefaults.describe(type, entity, mc.level.registryAccess());
                        if (entity != null) {
                            try {
                                var problems = new TemplateProblems();
                                var output = TagValueOutput.createWithContext(problems, mc.level.registryAccess());
                                entity.saveWithoutId(output);
                                if (!problems.errors.isEmpty()) throw new IllegalArgumentException("实体模板序列化不完整: " + problems.errors);
                                var tag = output.buildResult();
                                // A reusable data template must not carry a freshly generated identity.
                                tag.remove(Entity.TAG_UUID);
                                tag.putString(Entity.TAG_ID, BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
                                row.addProperty("default_nbt", tag.toString());
                            } catch (RuntimeException error) { templateError = message(error); }
                        }
                        row.addProperty("template_available", row.has("default_nbt"));
                        if (templateError != null) row.addProperty("template_error", templateError);
                        entries = new JsonArray(); entries.add(row);
                    }
                }
                reply.accept(RegistryPages.split(name, generation, entries, context).stream().map(Object::toString).toList(), context);
            } catch (RuntimeException error) {
                var page = RegistryPages.split(name, generation, new JsonArray(), context).getFirst();
                page.addProperty("error", message(error)); reply.accept(List.of(page.toString()), context);
            }
        });
    }
    private static EntityType<?> resolve(String raw) {
        Identifier id = Identifier.tryParse(raw);
        if (id == null) throw new IllegalArgumentException("无效实体 id: " + raw);
        return BuiltInRegistries.ENTITY_TYPE.getOptional(id).orElseThrow(() -> new IllegalArgumentException("未知实体 id: " + raw));
    }
    private static String message(RuntimeException error) {
        String value = error.toString(); return value.substring(0, Math.min(2000, value.length()));
    }
    private static final class TemplateProblems implements ProblemReporter {
        final java.util.List<String> errors = new java.util.ArrayList<>();
        @Override public ProblemReporter forChild(ProblemReporter.PathElement path) { return this; }
        @Override public void report(ProblemReporter.Problem problem) { errors.add(problem.toString()); }
    }
}
