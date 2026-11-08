package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.platform.ClientPlatform;
import com.google.gson.*;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.ComponentValidation;
import dev.rinorsi.editor.StackCodec;
import java.util.*;
import java.util.function.BiConsumer;
import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;

/** Incremental, local-only schema requests. One uncached component per client tick, eight queued jobs. */
final class ComponentSchemaChannel {
    private ComponentSchemaChannel() {}
    private static final Map<String, ComponentSchema.Derived> CACHE = new LinkedHashMap<>();
    private static final ArrayDeque<Job> JOBS = new ArrayDeque<>();
    private static Object world;
    private static String generation;
    private static boolean initialized;
    private record Job(String name, String generation, JsonObject context, Iterator<String> ids, JsonArray entries,
                       Object world, BiConsumer<List<String>, JsonObject> reply) {}
    static boolean supports(String name) { return name.equals("component_schema") || name.startsWith("component_schema:"); }
    static void attach(DocumentDriver driver) {
        if (!initialized) {
            initialized = true;
            ClientPlatform.get().onTick(ComponentSchemaChannel::tick);
        }
        long[] rate = {0, 0};
        driver.onMessage("component_validate", value -> {
            if (driver.serverSession() || value == null || !value.isJsonObject()) return;
            var request = value.getAsJsonObject().deepCopy();
            var mc = Minecraft.getInstance();
            mc.execute(() -> {
                long second = System.nanoTime() / 1_000_000_000L;
                if (rate[0] != second) { rate[0] = second; rate[1] = 0; }
                JsonObject result;
                if (request.toString().length() > 8192 || ++rate[1] > 20 || mc.level == null) {
                    result = new JsonObject(); result.addProperty("ok", false);
                    if (request.has("requestId") && request.get("requestId").isJsonPrimitive()) result.add("requestId", request.get("requestId"));
                    result.addProperty("error", mc.level == null ? "已经离开世界" : "校验请求超过大小或频率限制，请稍后重试");
                    var errors = new JsonArray(); ComponentSchema.addError(errors, "$", "request_limit", result.get("error").getAsString()); result.add("errors", errors);
                } else result = ComponentSchemaValidation.validate(request, mc.level.registryAccess());
                driver.patchJson("component_validate.result", result.toString());
            });
        });
    }
    static void request(JsonObject request, String name, String currentGeneration, BiConsumer<List<String>, JsonObject> reply) {
        var mc = Minecraft.getInstance(); var context = new JsonObject();
        try {
            if (mc.level == null) throw new IllegalStateException("已经离开世界");
            if (world != mc.level || !Objects.equals(generation, currentGeneration)) {
                world = mc.level; generation = currentGeneration; CACHE.clear(); JOBS.clear();
            }
            String id = name.startsWith("component_schema:") ? name.substring("component_schema:".length())
                    : request.has("id") ? StackCodec.string(request, "id") : null;
            List<String> ids;
            if (id != null) {
                id = net.minecraft.resources.Identifier.parse(id).toString(); context.addProperty("id", id); ComponentValidation.type(id); ids = List.of(id);
            } else ids = ComponentSchema.persistentIds();
            if (JOBS.size() >= 8) throw new IllegalArgumentException("组件结构索引繁忙，请稍后重试");
            JOBS.add(new Job(name, currentGeneration, context, ids.iterator(), new JsonArray(), world, reply));
        } catch (RuntimeException error) { error(name, currentGeneration, context, error, reply); }
    }
    private static void tick(Minecraft mc) {
        if (mc.level == null) { world = null; CACHE.clear(); JOBS.clear(); return; }
        var job = JOBS.poll(); if (job == null) return;
        if (job.world != mc.level) return;
        try {
            // JSON/codec reflection never crosses threads or touches world entities.
            if (job.ids.hasNext()) {
                String id = job.ids.next();
                var schema = CACHE.computeIfAbsent(id, key -> ComponentSchema.derive(key, mc.level.registryAccess()));
                job.entries.add(schema.entry().deepCopy());
            }
            if (job.ids.hasNext()) { JOBS.add(job); return; }
            var context = job.context.deepCopy(); context.addProperty("source", "runtime_codec_structural_adapter"); context.addProperty("availability", "complete");
            var pages = RegistryPages.split(job.name, job.generation, job.entries, context).stream().map(Object::toString).toList();
            job.reply.accept(pages, job.context);
        } catch (RuntimeException error) { error(job.name, job.generation, job.context, error, job.reply); }
    }
    private static void error(String name, String generation, JsonObject context, RuntimeException error, BiConsumer<List<String>, JsonObject> reply) {
        var page = RegistryPages.split(name, generation, new JsonArray(), context).getFirst();
        String message = String.valueOf(error.getMessage()); page.addProperty("error", message.substring(0, Math.min(1000, message.length())));
        reply.accept(List.of(page.toString()), context);
    }
}
