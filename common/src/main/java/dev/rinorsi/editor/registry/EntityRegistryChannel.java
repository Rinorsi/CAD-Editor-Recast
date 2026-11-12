package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.EditorI18n;

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
    public static void invalidateSchemas() { SCHEMA_GENERATION.incrementAndGet(); EntitySchemaValidation.invalidate(); GenericSchemaChannel.invalidate(); }
    private EntityRegistryChannel() {}
    public static boolean supports(String name) {
        return name.equals("entity_info") || name.startsWith("entity_info:") || name.equals("entity_schema") || name.startsWith("entity_schema:")
                || name.equals("entity_base_attributes") || name.equals("equipment_slot_groups") || name.equals("spawner_info");
    }
    public static void request(JsonObject request, String name, String worldGeneration, java.util.function.BooleanSupplier current,
                               BiConsumer<List<String>, JsonObject> reply) {
        var mc = Minecraft.getInstance();
        JsonObject context = new JsonObject();
        context.addProperty("worldGeneration", java.util.Objects.requireNonNull(worldGeneration));
        if (request.has("id") && request.get("id").isJsonPrimitive() && request.getAsJsonPrimitive("id").isString()) context.add("id", request.get("id"));
        if (name.startsWith("entity_info:")) context.addProperty("id", name.substring("entity_info:".length()));
        if (name.startsWith("entity_schema:")) context.addProperty("id", name.substring("entity_schema:".length()));
        String requestError = null;
        if (request.has("requestId")) {
            var token=request.get("requestId");
            if (!token.isJsonPrimitive() || !token.getAsJsonPrimitive().isString() || token.getAsString().isEmpty() || token.getAsString().length()>80)
                requestError=EditorI18n.tr("cadeditor.message.entityregistrychannel.31762599b1");
            else context.add("requestId",token);
        }
        final String invalidRequest=requestError;
        mc.execute(() -> {
            if (!current.getAsBoolean()) return;
            String generation = name.startsWith("entity_schema") ? "entity-schema-" + SCHEMA_GENERATION.get() : "entity-" + GENERATION.incrementAndGet();
            try {
                if (invalidRequest!=null) throw new IllegalArgumentException(invalidRequest);
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
                    if (mc.level == null) throw new IllegalStateException(EditorI18n.tr("cadeditor.message.entityregistrychannel.9ed1a2c815"));
                    if (name.equals("spawner_info")) entries = SpawnerData.entries(mc.level.registryAccess());
                    else if (name.equals("entity_schema") || name.startsWith("entity_schema:")) {
                        if (!context.has("id")) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.entityregistrychannel.65d007313e"));
                        var type=resolve(context.get("id").getAsString());entries=new JsonArray();
                        entries.add(EntitySchemaValidation.schema(BuiltInRegistries.ENTITY_TYPE.getKey(type).toString(),mc.level));
                    }
                    else {
                        if (!context.has("id")) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.entityregistrychannel.65d007313e"));
                        var type = resolve(context.get("id").getAsString());
                        Entity entity = null; String templateError = null;
                        try {
                            entity = type == net.minecraft.world.entity.EntityTypes.PLAYER && mc.player != null ? new RemotePlayer(mc.level, mc.player.getGameProfile())
                                    : type.create(mc.level, EntitySpawnReason.LOAD);
                            if (entity == null) templateError = EditorI18n.tr("cadeditor.message.entityregistrychannel.2c66b166a6");
                        } catch (RuntimeException error) { templateError = message(error); if (current.getAsBoolean()) dev.rinorsi.editor.EditorDiagnostics.warning("registry.entity.factory", context.toString(), error); }
                        JsonObject row = EntityDefaults.describe(type, entity, mc.level.registryAccess());
                        if (entity != null) {
                            try {
                                var problems = new TemplateProblems();
                                var output = TagValueOutput.createWithContext(problems, mc.level.registryAccess());
                                entity.saveWithoutId(output);
                                if (!problems.errors.isEmpty()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.entityregistrychannel.012256d62d", (problems.errors)));
                                var tag = output.buildResult();
                                // A reusable data template must not carry a freshly generated identity.
                                tag.remove(Entity.TAG_UUID);
                                tag.putString(Entity.TAG_ID, BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
                                row.addProperty("default_nbt", tag.toString());
                            } catch (RuntimeException error) { templateError = message(error); if (current.getAsBoolean()) dev.rinorsi.editor.EditorDiagnostics.warning("registry.entity.template", context.toString(), error); }
                        }
                        row.addProperty("template_available", row.has("default_nbt"));
                        if (templateError != null) row.addProperty("template_error", templateError);
                        entries = new JsonArray(); entries.add(row);
                    }
                }
                if (!current.getAsBoolean()) return;
                var pages = responsePages(name, generation, worldGeneration, entries, context, null);
                if (current.getAsBoolean()) reply.accept(pages, context);
            } catch (RuntimeException error) {
                if (!current.getAsBoolean()) return;
                dev.rinorsi.editor.EditorDiagnostics.failure("registry.entity", name + " " + context, error);
                var pages = responsePages(name, generation, worldGeneration, new JsonArray(), context, message(error));
                if (current.getAsBoolean()) reply.accept(pages, context);
            }
        });
    }
    static List<String> responsePages(String name, String generation, String worldGeneration, JsonArray entries, JsonObject context, String error) {
        JsonObject envelope = context.deepCopy(); envelope.addProperty("worldGeneration", worldGeneration);
        if (error != null) envelope.addProperty("error", error);
        var pages = RegistryPages.splitLossless(name, generation, entries, envelope);
        return pages.stream().map(Object::toString).toList();
    }
    private static EntityType<?> resolve(String raw) {
        Identifier id = Identifier.tryParse(raw);
        if (id == null) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.entityregistrychannel.0c4a0738e4", (raw)));
        return BuiltInRegistries.ENTITY_TYPE.getOptional(id).orElseThrow(() -> new IllegalArgumentException(EditorI18n.tr("cadeditor.message.entityregistrychannel.2651a3c80a", (raw))));
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
