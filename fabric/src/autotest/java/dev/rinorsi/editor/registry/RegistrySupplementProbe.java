package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import dev.oriel.mod.client.OrielScreen;
import dev.oriel.mod.client.OrielScreens;

/** Isolated test mod. Validates actual choice IDs against every variant component Codec. */
public final class RegistrySupplementProbe implements ClientModInitializer {
    private final JsonObject receipt = new JsonObject(), captured = new JsonObject();
    private final List<String> requests = new ArrayList<>();
    private OrielScreen screen; private int index, edgeStage; private boolean sent, finished;
    private long start; private Object proceeded; private boolean listenerReady;
    @Override public void onInitializeClient() {
        start = System.nanoTime(); ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }
    private void tick(Minecraft mc) {
        try {
            if (finished) { if (mc.level != null) mc.disconnectWithSavingScreen(); else if (mc.getSingleplayerServer() == null) mc.stop(); return; }
            if (System.nanoTime() - start > 240_000_000_000L) throw new AssertionError("timeout request " + index);
            if (mc.level == null || mc.player == null) {
                if (mc.screen != null && mc.screen != proceeded && (mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen
                        || mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen)) {
                    for (var child : mc.screen.children()) if (child instanceof net.minecraft.client.gui.components.Button button) {
                        String label = button.getMessage().getString();
                        if (label.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())
                                || label.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())) { proceeded = mc.screen; button.onPress(null); break; }
                    }
                }
                return;
            }
            if (screen == null) {
                if (mc.screen != null) return;
                validateVariants(mc);
                requests.addAll(List.of("block_properties", "minecraft:loot_table", "minecraft:recipe", "minecraft:dimension",
                        "minecraft:map_decoration_type", "trim_material", "trim_patterns",
                        "camera_overlay", "profile_texture", "profile_cape", "profile_elytra", "item_model",
                        "tags:block", "tags:damage_type", "tag:block", "tag:damage_type", "enum:text_color", "enum:use_animation",
                        "items", "data_component_types", "trim_materials", "painting_variants", "spawner_info", "item_meta_one", "entity_info"));
                JsonObject data = new JsonObject(), slot = new JsonObject();
                slot.addProperty("kind", "inventory"); slot.addProperty("index", 0);
                data.add("stack", dev.rinorsi.editor.StackCodec.snapshot(new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.SPAWNER), mc.level.registryAccess(), slot, "独立发行包冒烟测试"));
                data.add("prefs", new JsonObject());
                screen = OrielScreens.open("cadeditor:ui/index.html", data);
                RegistryBridge.attach(screen.driver()); return;
            }
            if (screen.driver().document() == null || !screen.driver().settled()) return;
            if (!listenerReady) {
                check(eval("typeof Store==='object'&&typeof UI==='object'&&document.querySelector('#edbody')!=null").getAsBoolean(), "release_editor_page_loaded");
                eval("var received={};var completed={};oriel.on('patch',function(p){var v=p.value;if(!v||!v.entries)return;var a=received[p.key]||[];if(v.offset===0)a=[];for(var i=0;i<v.entries.length;i++)a[v.offset+i]=v.entries[i];received[p.key]=a;if(v.done)completed[p.key]=v;});true");
                check(org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(mc.getWindow().handle(), org.lwjgl.glfw.GLFW.GLFW_FOCUSED) == 0, "smoke_window_unfocused");
                listenerReady = true;
            }
            if (index < requests.size()) {
                String name = requests.get(index), key = "registry." + name;
                if (!sent) {
                    String tagId = name.equals("tag:block") ? "minecraft:mineable/axe" : name.equals("tag:damage_type") ? "minecraft:is_fire"
                            : name.equals("item_meta_one") ? "minecraft:spawner" : name.equals("entity_info") ? "minecraft:pig" : null;
                    eval("oriel.send('registry',{name:" + new JsonPrimitive(name)
                            + (tagId == null ? "" : ",id:" + new JsonPrimitive(tagId)) + "});true"); sent = true; return;
                }
                JsonElement result = eval("completed[" + new JsonPrimitive(key) + "]||null");
                if (result.isJsonNull()) return;
                var envelope = result.getAsJsonObject();
                check(!envelope.has("error"), "wire_" + name + "_no_error");
                var rows = eval("received[" + new JsonPrimitive(key) + "]").getAsJsonArray();
                check(rows.size() == envelope.get("total").getAsInt(), "wire_" + name + "_complete");
                captured.add(name, rows); receipt.addProperty("count_" + name, rows.size());
                if (name.startsWith("tag:") || name.startsWith("tags:") || name.startsWith("enum:") || name.equals("data_component_types"))
                    captured.add("envelope_" + name, envelope);
                if (name.startsWith("tags:")) for (var value : rows) {
                    var row = value.getAsJsonObject();
                    check(row.has("name") && row.has("translation_key"), "tag_label_" + name + "_" + row.get("id").getAsString());
                }
                if (name.equals("enum:use_animation")) for (var value : rows)
                    check(value.getAsJsonObject().has("symbol"), "enum_symbol_" + value.getAsJsonObject().get("id").getAsString());
                if (!name.equals("profile_cape")) check(!rows.isEmpty(), "wire_" + name + "_nonempty");
                if (name.equals("camera_overlay") || name.equals("profile_texture") || name.equals("profile_cape") || name.equals("profile_elytra")) {
                    for (var element : rows) {
                        var row = element.getAsJsonObject();
                        String writable = Identifier.parse(row.get("id").getAsString()).getPath();
                        check(!writable.startsWith("textures/") && !writable.endsWith(".png"), "texture_writable_id_" + name + "_" + writable);
                        var texture = net.minecraft.core.ClientAsset.ResourceTexture.CODEC.parse(JsonOps.INSTANCE, row.get("id")).getOrThrow();
                        check(texture.texturePath().toString().equals(row.get("resource").getAsString()), "texture_asset_resolves_file_" + name + "_" + row.get("id").getAsString());
                    }
                    if (name.equals("camera_overlay")) check(find(rows, "minecraft:misc/pumpkinblur").get("resource").getAsString().equals("minecraft:textures/misc/pumpkinblur.png"), "camera_overlay_includes_vanilla_pumpkin");
                }
                if (name.equals("block_properties")) {
                    var log = find(rows, "minecraft:oak_log").getAsJsonObject("properties").getAsJsonObject("axis");
                    check(log.getAsJsonArray("values").size() == 3 && log.get("default").getAsString().equals("y"), "block_property_values_default");
                    var honey = find(rows, "minecraft:beehive").getAsJsonObject("properties").getAsJsonObject("honey_level");
                    check(honey.getAsJsonArray("values").size() == 6, "honey_levels");
                }
                if (name.equals("trim_material")) check(find(rows, "minecraft:quartz").getAsJsonArray("ingredients").toString().contains("minecraft:quartz"), "trim_ingredient_from_component");
                if (name.equals("trim_patterns")) check(find(rows, "minecraft:sentry").getAsJsonArray("template_items").toString().contains("minecraft:sentry_armor_trim_smithing_template"), "trim_template_from_recipe");
                if (name.equals("item_model")) {
                    check(find(rows, "minecraft:diamond_sword").get("resource").getAsString().equals("minecraft:items/diamond_sword.json"), "item_model_definition_id");
                    check(find(rows, "editor_supplement_probe:nested/only_definition").get("resource").getAsString().equals("editor_supplement_probe:items/nested/only_definition.json"), "model_without_registered_item_and_nested_path");
                }
                if (name.equals("spawner_info")) {
                    check(rows.size() == 2, "spawner_two_types");
                    check(find(rows, "minecraft:mob_spawner").has("fields"), "classic_spawner_fields");
                    check(find(rows, "minecraft:trial_spawner").getAsJsonObject("defaults").has("normal_config"), "trial_spawner_normal_config");
                }
                if (name.equals("item_meta_one")) check(rows.size() == 1 && find(rows, "minecraft:spawner").get("block_entity_type").getAsString().equals("minecraft:mob_spawner"), "single_spawner_item_metadata");
                if (name.equals("entity_info")) {
                    var pig = find(rows, "minecraft:pig");
                    check(pig.has("attributes") && pig.has("equipment_slots") && pig.has("variant_sources") && pig.has("spawn_eggs"), "pig_entity_shape");
                    check(pig.get("template_available").getAsBoolean() && pig.has("default_nbt"), "pig_entity_default_template");
                }
                index++; sent = false; return;
            }
            if (edgeStage == 0) {
                eval("delete completed['registry.block_properties'];oriel.send('registry',{name:'block_properties',id:'editor_supplement_probe:missing'});true"); edgeStage++; return;
            }
            if (edgeStage == 1) {
                var result = eval("completed['registry.block_properties']||null"); if (result.isJsonNull()) return;
                var envelope = result.getAsJsonObject();
                check(envelope.has("error") && envelope.get("id").getAsString().equals("editor_supplement_probe:missing") && envelope.get("total").getAsInt() == 0, "unknown_block_error_preserves_identity");
                eval("delete completed['registry.block_properties'];oriel.send('registry',{name:'block_properties',id:'minecraft:oak_log'});true"); edgeStage++; return;
            }
            if (edgeStage == 2) {
                var result = eval("completed['registry.block_properties']||null"); if (result.isJsonNull()) return;
                var envelope = result.getAsJsonObject();
                check(!envelope.has("error") && envelope.get("id").getAsString().equals("minecraft:oak_log") && envelope.get("total").getAsInt() == 1, "single_block_query_exact");
                check(eval("completed['registry.trim_patterns'].availability==='complete'&&received['registry.trim_patterns'].some(function(e){return e.id==='minecraft:sentry'&&e.template_items.length>0;})").getAsBoolean(), "initial_trim_patterns_enriched");
                edgeStage++;
            }
            check(screen.driver().pageErrorCount() == 0, "page_errors_zero");
            receipt.addProperty("status", "PASSED"); write(mc); finished = true;
        } catch (Throwable error) {
            error.printStackTrace(); receipt.addProperty("status", "FAILED"); receipt.addProperty("error", error.toString()); write(mc); finished = true;
        }
    }
    private void validateVariants(Minecraft mc) {
        var snapshot = new RegistrySnapshot(mc.level.registryAccess(), id -> null);
        var ops = mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE);
        var unavailable = RegistrySupplement.unavailable(null);
        check(unavailable.entries().isEmpty() && unavailable.context().get("availability").getAsString().equals("unavailable") && unavailable.context().has("reason"), "remote_no_fake_server_ids");
        var patterns = snapshot.entries(Identifier.withDefaultNamespace("trim_pattern"));
        var remotePatterns = RegistrySupplement.unavailable(patterns);
        check(remotePatterns.entries().size() == patterns.size() && remotePatterns.entries().get(0).getAsJsonObject().get("template_status").getAsString().equals("server_required"), "remote_preserves_patterns_without_inventing_templates");
        String[][] bindings = {
            {"cat/variant","cat_variant"},{"cat/sound_variant","cat_sound_variant"},
            {"wolf/variant","wolf_variant"},{"wolf/sound_variant","wolf_sound_variant"},
            {"chicken/variant","chicken_variant"},{"chicken/sound_variant","chicken_sound_variant"},
            {"cow/variant","cow_variant"},{"cow/sound_variant","cow_sound_variant"},
            {"frog/variant","frog_variant"},{"pig/variant","pig_variant"},{"pig/sound_variant","pig_sound_variant"},
            {"villager/variant","villager_type"},{"zombie_nautilus/variant","zombie_nautilus_variant"},{"painting/variant","painting_variant"},
            {"axolotl/variant","enum:axolotl_variant"},{"horse/variant","enum:horse_variant"},{"llama/variant","enum:llama_variant"},
            {"mooshroom/variant","enum:mooshroom_variant"},{"fox/variant","enum:fox_variant"},{"rabbit/variant","enum:rabbit_variant"},
            {"parrot/variant","enum:parrot_variant"},{"tropical_fish/pattern","enum:tropical_fish_pattern"},{"salmon/size","enum:salmon_size"},
            {"cat/collar","enum:dye_color"},{"wolf/collar","enum:dye_color"},{"sheep/color","enum:dye_color"},
            {"shulker/color","enum:dye_color"},{"tropical_fish/base_color","enum:dye_color"},{"tropical_fish/pattern_color","enum:dye_color"}
        };
        for (var binding : bindings) {
            String component = binding[0], source = binding[1];
            var rows = source.startsWith("enum:") ? RegistryChoices.enumEntries(source.substring(5)) : snapshot.entries(Identifier.withDefaultNamespace(source));
            check(!rows.isEmpty(), "variant_" + component + "_nonempty");
            var type = net.minecraft.core.registries.BuiltInRegistries.DATA_COMPONENT_TYPE.getOptional(Identifier.withDefaultNamespace(component)).orElseThrow();
            for (var element : rows) {
                var id = element.getAsJsonObject().get("id");
                check(type.codec().parse(ops, id).isSuccess(), "codec_" + component + "_" + id.getAsString());
            }
            receipt.addProperty("variant_count_" + component, rows.size()); captured.add(source, rows);
            if (!requests.contains(source)) requests.add(source);
        }
        receipt.addProperty("variant_components_checked", bindings.length);
    }
    private JsonElement eval(String script) throws Exception {
        Object page = ((java.util.Optional<?>) Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();
        return (JsonElement) ((java.util.Optional<?>) page.getClass().getMethod("eval", String.class).invoke(page, script)).orElseThrow();
    }
    private static JsonObject find(JsonArray rows, String id) {
        for (var row : rows) if (row.getAsJsonObject().get("id").getAsString().equals(id)) return row.getAsJsonObject();
        throw new AssertionError("Missing " + id);
    }
    private void check(boolean valid, String name) { if (!valid) throw new AssertionError(name); receipt.addProperty(name, true); }
    private void write(Minecraft mc) {
        try {
            Files.writeString(mc.gameDirectory.toPath().resolve("registry-supplement-verification.json"), receipt.toString());
            Files.writeString(mc.gameDirectory.toPath().resolve("registry-supplement-data.json"), captured.toString());
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}
