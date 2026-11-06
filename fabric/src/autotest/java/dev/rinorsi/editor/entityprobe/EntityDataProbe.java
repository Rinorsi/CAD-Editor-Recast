package dev.rinorsi.editor.entityprobe;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.rinorsi.editor.registry.EntityRegistryChannel;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;

/** Independently packaged probe; one entity template per tick, never spawns/ticks the temporary entity. */
public final class EntityDataProbe implements ClientModInitializer {
    private final JsonObject result = new JsonObject();
    private final JsonArray entities = new JsonArray();
    private java.util.Iterator<net.minecraft.resources.Identifier> types;
    private int stage; private long start; private int checks;
    @Override public void onInitializeClient() {
        start = System.nanoTime(); ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }
    private void tick(Minecraft mc) {
        if (stage == 99) return;
        try {
            if (stage == 90) { mc.disconnectWithSavingScreen(); stage = 91; return; }
            if (stage == 91) { if (mc.getSingleplayerServer() == null) { stage = 99; mc.stop(); } return; }
            if (System.nanoTime() - start > 180_000_000_000L) throw new AssertionError("entity probe timeout");
            if (mc.level == null || mc.player == null) return;
            if (types == null) {
                types = BuiltInRegistries.ENTITY_TYPE.keySet().stream().sorted(java.util.Comparator.comparing(Object::toString)).iterator();
                check(org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(mc.getWindow().handle(), org.lwjgl.glfw.GLFW.GLFW_FOCUSED) == 0, "window unfocused");
                JsonObject request = new JsonObject(); request.addProperty("name", "spawner_info");
                EntityRegistryChannel.request(request, "spawner_info", (pages, context) -> pages.forEach(page -> {
                    var data = com.google.gson.JsonParser.parseString(page).getAsJsonObject(); check(!data.has("error"), "spawner export " + data); result.add("spawners", data.get("entries"));
                }));
            }
            if (types.hasNext()) {
                String id = types.next().toString(); JsonObject request = new JsonObject(); request.addProperty("id", id);
                int before = mc.level.getEntityCount();
                EntityRegistryChannel.request(request, "entity_info", (pages, context) -> {
                    for (String page : pages) {
                        check(page.length() <= 24000, "page budget");
                        var data = com.google.gson.JsonParser.parseString(page).getAsJsonObject();
                        check(!data.has("error"), "entity export " + id + " " + data);
                        check(data.get("id").getAsString().equals(id), "correlated id");
                        for (var entity : data.getAsJsonArray("entries")) {
                            JsonObject row = entity.getAsJsonObject();
                            if (row.get("template_available").getAsBoolean()) {
                                try {
                                    var tag = net.minecraft.nbt.TagParser.parseCompoundFully(row.get("default_nbt").getAsString());
                                    check(!tag.contains("UUID"), "template strips UUID");
                                    check(tag.getString("id").orElseThrow().equals(id), "template entity id");
                                } catch (com.mojang.brigadier.exceptions.CommandSyntaxException e) { throw new AssertionError(e); }
                            }
                            entities.add(entity);
                        }
                    }
                });
                check(before == mc.level.getEntityCount(), "temporary entity never enters world");
                return;
            }
            result.add("entities", entities); result.addProperty("checks", checks);
            result.addProperty("status", "PASSED"); write(mc); stage = 90;
        } catch (Throwable error) {
            result.addProperty("status", "FAILED"); result.addProperty("error", error.toString());
            result.add("entities", entities); write(mc); stage = 90;
        }
    }
    private void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
    private void write(Minecraft mc) {
        try { java.nio.file.Files.writeString(mc.gameDirectory.toPath().resolve("entity-data-verification.json"), new com.google.gson.GsonBuilder().setPrettyPrinting().create().toJson(result)); }
        catch (java.io.IOException e) { throw new RuntimeException(e); }
    }
}
