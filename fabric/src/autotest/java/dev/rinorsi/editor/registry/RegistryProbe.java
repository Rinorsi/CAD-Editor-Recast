package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.oriel.mod.client.OrielScreen;
import dev.oriel.mod.client.OrielScreens;
import java.nio.file.Files;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/** Separate Fabric test mod; never included in the release jar. */
public final class RegistryProbe implements ModInitializer, ClientModInitializer {
    private static final Identifier EFFECT = Identifier.parse("editor_registry_probe:focus");
    private static final Identifier SOUND = Identifier.parse("editor_registry_probe:ping");
    private final JsonObject results = new JsonObject();
    private int stage; private long start; private OrielScreen screen;
    private Object proceededScreen;
    private int draftOffset;
    private long openedAt;
    private static final String DRAFT_KEY = "inventory:probe|minecraft:diamond_sword";
    private static final String DRAFT_TEXT = "{\"custom_name\":\"" + "x".repeat(12_000) + "\"}";
    private static final String[] ENUMS = {"use_animation", "equipment_slot", "equipment_slot_group", "attribute_operation", "rarity", "firework_shape", "consume_effect_type", "dye_color", "text_color"};
    private static final class Effect extends MobEffect { Effect() { super(MobEffectCategory.BENEFICIAL, 0x123456); } }
    @Override public void onInitialize() {
        Registry.register(BuiltInRegistries.MOB_EFFECT, EFFECT, new Effect());
        Registry.register(BuiltInRegistries.SOUND_EVENT, SOUND, SoundEvent.createVariableRangeEvent(SOUND));
        var custom = net.fabricmc.fabric.api.event.registry.FabricRegistryBuilder.create(
                net.minecraft.resources.ResourceKey.<String>createRegistryKey(Identifier.parse("editor_registry_probe:flavors"))).buildAndRegister();
        Registry.register(custom, Identifier.parse("editor_registry_probe:sweet"), "sweet");
        var collision = net.fabricmc.fabric.api.event.registry.FabricRegistryBuilder.create(
                net.minecraft.resources.ResourceKey.<String>createRegistryKey(Identifier.parse("tags:registry_probe"))).buildAndRegister();
        Registry.register(collision, Identifier.parse("editor_registry_probe:literal"), "literal");
    }
    @Override public void onInitializeClient() {
        RegistryBridge.initialize();
        start = System.nanoTime(); ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }
    private void tick(net.minecraft.client.Minecraft mc) {
        if (stage == 99) return;
        try {
            if (stage == 90) { mc.disconnectWithSavingScreen(); stage = 91; return; }
            if (stage == 91) { if (mc.getSingleplayerServer() == null) { stage = 99; mc.stop(); } return; }
            if (System.nanoTime() - start > 180_000_000_000L) throw new AssertionError("timeout stage " + stage);
            if (mc.level == null || mc.player == null) {
                if (mc.screen != null) {
                    String type = mc.screen.getClass().getName();
                    if (!results.has("waiting_screen") || !results.get("waiting_screen").getAsString().equals(type)) {
                        results.addProperty("waiting_screen", type); write(mc);
                    }
                    if (mc.screen != proceededScreen && (mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen
                            || mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen)) {
                        for (var child : mc.screen.children()) if (child instanceof net.minecraft.client.gui.components.Button b) {
                            String label = b.getMessage().getString();
                            if (label.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())
                                    || label.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())) { proceededScreen = mc.screen; b.onPress(null); break; }
                        }
                    }
                }
                return;
            }
            if (stage == 0) {
                if (mc.screen != null) return;
                if (!RegistryBridge.performance().has("complete") || !RegistryBridge.performance().get("complete").getAsBoolean()) return;
                var snapshot = new RegistrySnapshot(mc.level.registryAccess(), id -> {
                    var e = mc.getSoundManager().getSoundEvent(id); return e == null ? null : e.getSubtitle();
                });
                JsonObject raw = new JsonObject(); long before = System.nanoTime();
                RegistrySnapshot.KINDS.forEach((kind, path) -> raw.add(kind, snapshot.entries(Identifier.withDefaultNamespace(path))));
                results.addProperty("direct_capture_ms", (System.nanoTime() - before) / 1_000_000.0);
                Files.writeString(mc.gameDirectory.toPath().resolve("registry-snapshot.json"), raw.toString());
                JsonObject enchantment = find(raw.getAsJsonArray("enchantments"), "editor_registry_probe:shock");
                check(enchantment.getAsJsonArray("tags").toString().contains("minecraft:curse"), "datapack_tag_curse");
                check(enchantment.getAsJsonArray("tags").toString().contains("editor_registry_probe:custom"), "custom_enchantment_tag");
                check(enchantment.getAsJsonArray("exclusive").toString().contains("minecraft:sharpness"), "tag_exclusive_resolved");
                check(enchantment.getAsJsonArray("supported").toString().contains("minecraft:diamond_sword"), "tag_supported_resolved");
                check(enchantment.getAsJsonArray("primary").toString().contains("minecraft:diamond_sword"), "primary_resolved");
                check(find(raw.getAsJsonArray("mob_effects"), EFFECT.toString()).get("category").getAsString().equals("beneficial"), "mod_effect_present");
                check(find(raw.getAsJsonArray("sounds"), SOUND.toString()).has("subtitle"), "mod_sound_subtitle_present");
                check(mc.getSoundManager().getSoundEvent(SOUND).getWeight() > 0, "mod_sound_resource_resolves");
                check(find(snapshot.tags(Identifier.withDefaultNamespace("item")), "editor_registry_probe:weapons").get("count").getAsInt() == 2, "mod_item_tag_count");
                check(snapshot.tagMembers(Identifier.withDefaultNamespace("item"), Identifier.withDefaultNamespace("logs")).toString().contains("minecraft:oak_log"), "vanilla_log_tag_members");
                check(snapshot.tagMembers(Identifier.withDefaultNamespace("enchantment"), Identifier.parse("editor_registry_probe:custom")).toString().contains("editor_registry_probe:shock"), "datapack_enchantment_tag_members");
                screen = OrielScreens.openInline("<html><body>Registry probe<script>var received={};var responses={};var pages=0;oriel.on('patch',function(p){if(p.key.indexOf('registry.')!==0)return;var v=p.value;if(!v||!v.entries)return;responses[p.key+'|'+(v.id||'')+'|'+(v.field||'')]=v;pages++;var a=received[p.key]||[];if(v.offset===0)a=[];for(var i=0;i<v.entries.length;i++)a[v.offset+i]=v.entries[i];received[p.key]=a;});function frame(){requestAnimationFrame(frame);}requestAnimationFrame(frame);</script></body></html>", new JsonObject());
                openedAt = System.nanoTime(); RegistryBridge.attach(screen.driver()); stage = 1; return;
            }
            results.addProperty("probe_stage", stage);
            results.addProperty("settled", screen.driver().settled());
            results.addProperty("page_errors", screen.driver().pageErrorCount());
            results.addProperty("screen_type", mc.screen == null ? "none" : mc.screen.getClass().getName());
            write(mc);
            if (screen.driver().document() == null) return;
            if (!results.has("cached_open_first_items_ms") && eval(page(), "typeof received!=='undefined'&&!!received['registry.items']"))
                results.addProperty("cached_open_first_items_ms", (System.nanoTime() - openedAt) / 1_000_000.0);
            if (stage == 1) {
                var data = screen.driver().data().getAsJsonObject();
                if (!data.has("registry.meta")) return;
                Object page = page();
                if (!eval(page, "!!received['registry.items']&&received['registry.items'].length===oriel.data['registry.meta'].counts.items&&!!received['registry.enchantments']&&received['registry.enchantments'].length===oriel.data['registry.meta'].counts.enchantments")) return;
                check(eval(page, "received['registry.items'].length===oriel.data['registry.meta'].counts.items"), "js_all_item_pages_merged");
                check(eval(page, "received['registry.enchantments'].some(function(e){return e.id==='editor_registry_probe:shock';})"), "js_datapack_enchantment");
                check(eval(page, "received['registry.jukebox_songs'] ? received['registry.jukebox_songs'].every(function(e){return !!e.sound_event&&typeof e.length_in_seconds==='number'&&typeof e.comparator_output==='number'&&typeof e.description==='string';}) : true"), "jukebox_sound_metadata");
                results.add("meta", data.get("registry.meta"));
                check(eval(page, "oriel.send('registry',{name:'minecraft:mob_effect'});oriel.playSound('editor_registry_probe:ping',0.01,1);true"), "js_sound_api_and_demand_request");
                check(eval(page, "oriel.send('registry',{name:'minecraft:enchantment',id:'editor_registry_probe:shock',field:'supported'});true"), "relation_request");
                check(eval(page, "oriel.send('registry',{name:'editor_registry_probe:flavors'});true"), "custom_registry_request");
                check(eval(page, "oriel.send('registry',{name:'tags:registry_probe'});true"), "reserved_prefix_registry_request");
                stage = 2; return;
            }
            if (stage == 2) {
                if (!screen.driver().data().getAsJsonObject().has("registry.minecraft:mob_effect")) return;
                if (!screen.driver().data().getAsJsonObject().has("registry.relation")) return;
                if (!screen.driver().data().getAsJsonObject().has("registry.editor_registry_probe:flavors")) return;
                if (!screen.driver().data().getAsJsonObject().has("registry.tags:registry_probe")) return;
                check(eval(page(), "received['registry.tags:registry_probe'][0].id==='editor_registry_probe:literal'"), "reserved_prefix_registry_response");
                check(eval(page(), "received['registry.editor_registry_probe:flavors'][0].id==='editor_registry_probe:sweet'"), "custom_registry_response");
                check(eval(page(), "received['registry.minecraft:mob_effect'].some(function(e){return e.id==='editor_registry_probe:focus';})"), "demand_mod_effect");
                check(eval(page(), "received['registry.relation'].indexOf('minecraft:diamond_sword')>=0&&oriel.data['registry.relation'].field==='supported'"), "relation_response");
                check(eval(page(), "oriel.send('registry',{name:'minecraft:enchantment',id:'editor_registry_probe:missing',field:'supported'});true"), "relation_error_request");
                stage = 4; return;
            }
            if (stage == 4) {
                var relation = screen.driver().data().getAsJsonObject().getAsJsonObject("registry.relation");
                if (!relation.has("error")) return;
                check(relation.get("id").getAsString().equals("editor_registry_probe:missing") && relation.get("field").getAsString().equals("supported"), "relation_error_identity");
                for (String registry : new String[]{"item", "block", "damage_type", "enchantment"})
                    check(eval(page(), "oriel.send('registry',{name:'tags:" + registry + "'});true"), "tags_request_" + registry);
                check(eval(page(), "oriel.send('registry',{name:'tag:item',id:'editor_registry_probe:weapons'});oriel.send('registry',{name:'equipment_asset'});true"), "tag_and_equipment_requests");
                for (String name : ENUMS) check(eval(page(), "oriel.send('registry',{name:'enum:" + name + "'});true"), "enum_request_" + name);
                stage = 5; return;
            }
            if (stage == 5) {
                var data = screen.driver().data().getAsJsonObject();
                for (String registry : new String[]{"item", "block", "damage_type", "enchantment"}) {
                    if (!data.has("registry.tags:" + registry)) return;
                    check(data.getAsJsonObject("registry.tags:" + registry).get("total").getAsInt() > 0, "tags_response_" + registry);
                }
                if (!data.has("registry.tag:item") || !data.has("registry.equipment_asset")) return;
                check(eval(page(), "received['registry.tag:item'].length===2&&received['registry.tag:item'].indexOf('minecraft:diamond_sword')>=0&&oriel.data['registry.tag:item'].id==='editor_registry_probe:weapons'&&oriel.data['registry.tag:item'].field==='members'"), "tag_member_response_identity");
                check(eval(page(), "received['registry.equipment_asset'].some(function(e){return e.id==='editor_registry_probe:probe';})"), "mod_equipment_asset_response");
                for (String name : ENUMS) {
                    if (!data.has("registry.enum:" + name)) return;
                    check(eval(page(), "received['registry.enum:" + name + "'].length===" + RegistryChoices.enumEntries(name).size()), "official_enum_response_" + name);
                }
                check(eval(page(), "received['registry.enum:dye_color'].every(function(e){return typeof e.rgb==='number'&&e.rgb>=0&&e.rgb<=16777215;})&&received['registry.enum:text_color'].every(function(e){return typeof e.rgb==='number';})"), "enum_rgb_integers");
                JsonObject choices = new JsonObject();
                for (var e : data.entrySet()) if (e.getKey().startsWith("registry.tags:") || e.getKey().startsWith("registry.tag:") || e.getKey().startsWith("registry.enum:") || e.getKey().equals("registry.equipment_asset")) choices.add(e.getKey(), e.getValue());
                Files.writeString(mc.gameDirectory.toPath().resolve("registry-choices.json"), choices.toString());
                check(eval(page(), "oriel.send('registry',{name:'item_defaults'});oriel.send('registry',{name:'item_defaults_one',id:'minecraft:diamond_sword'});oriel.send('registry',{name:'tooltip_style'});oriel.send('registry',{name:'item_model_hints',id:'editor_registry_probe:hints'});true"), "item_defaults_and_model_requests");
                check(eval(page(), "oriel.send('registry',{name:'item_defaults_one',id:'minecraft:apple'});true"), "concurrent_single_item_request");
                stage = 6; return;
            }
            if (stage == 6) {
                var data = screen.driver().data().getAsJsonObject();
                if (!data.has("registry.item_defaults") || !data.has("registry.item_defaults_one")) return;
                if (data.getAsJsonObject("registry.item_defaults").has("error")) throw new AssertionError(data.getAsJsonObject("registry.item_defaults"));
                if (!data.getAsJsonObject("registry.item_defaults").get("done").getAsBoolean()) return;
                if (!data.has("registry.tooltip_style") || !data.has("registry.item_model_hints")) return;
                if (!eval(page(), "!!responses['registry.item_defaults_one|minecraft:apple|']&&!!responses['registry.item_defaults_one|minecraft:diamond_sword|']")) return;
                check(eval(page(), "received['registry.tooltip_style'].some(function(e){return e.id==='editor_registry_probe:probe'&&e.has_frame===true;})"), "tooltip_style_resources");
                check(eval(page(), "received['registry.item_model_hints'].some(function(e){return e.kind==='flag'&&e.index===2;})&&received['registry.item_model_hints'].some(function(e){return e.kind==='range'&&e.index===1&&e.thresholds[0]===3.5;})&&received['registry.item_model_hints'].some(function(e){return e.kind==='select'&&e.index===3&&e.cases.indexOf('blue')>=0;})&&received['registry.item_model_hints'].some(function(e){return e.kind==='color'&&e.index===4;})"), "model_hints_nested_cmd_branches");
                check(eval(page(), "received['registry.instruments'].every(function(e){return !!e.sound_event&&typeof e.use_duration==='number'&&typeof e.range==='number';})&&received['registry.jukebox_songs'].every(function(e){return !!e.sound_event&&typeof e.length_in_seconds==='number'&&typeof e.comparator_output==='number'&&typeof e.description==='string';})"), "instruments_and_jukebox_sound_metadata");
                check(eval(page(), "received['registry.item_defaults'].length===oriel.data['registry.meta'].counts.items"), "full_default_components_all_pages");
                check(eval(page(), "responses['registry.item_defaults_one|minecraft:diamond_sword|'].entries[0].comps.max_damage>0&&responses['registry.item_defaults_one|minecraft:diamond_sword|'].entries[0].tags.indexOf('editor_registry_probe:weapons')>=0&&responses['registry.item_defaults_one|minecraft:apple|'].entries[0].id==='minecraft:apple'"), "concurrent_single_defaults_and_live_tags");
                var all = ItemDefaults.entries(mc.level.registryAccess(), null);
                check(all.size() == net.minecraft.core.registries.BuiltInRegistries.ITEM.size(), "defaults_count_matches_live_items");
                for (var row : all) {
                    var entry = row.getAsJsonObject(); var item = net.minecraft.core.registries.BuiltInRegistries.ITEM.getValue(Identifier.parse(entry.get("id").getAsString()));
                    int serializable = (int) item.components().stream().filter(c -> c.type().codec() != null).count();
                    check(serializable == entry.getAsJsonObject("comps").size(), "all_persistent_prototype_components_present");
                }
                Files.writeString(mc.gameDirectory.toPath().resolve("registry-item-defaults.json"), all.toString());
                sendDraft("put", "key", DRAFT_KEY, "value", "{}"); stage = 7; return;
            }
            if (stage == 7) {
                if (!draftResult("put")) return;
                check(eval(page(), "oriel.data.prefs.drafts['" + DRAFT_KEY + "']==='{}'"), "draft_put_updates_prefs");
                sendDraft("get", "key", DRAFT_KEY); stage = 8; return;
            }
            if (stage == 8) {
                if (!draftResult("get")) return;
                check(eval(page(), "oriel.data['drafts.result'].value==='{}'"), "draft_single_get");
                sendDraft("clear", "key", DRAFT_KEY); stage = 9; return;
            }
            if (stage == 9) {
                if (!draftResult("clear")) return;
                check(eval(page(), "!oriel.data.prefs.drafts['" + DRAFT_KEY + "']"), "draft_clear_updates_prefs");
                sendDraft("begin", "key", DRAFT_KEY, "upload", "probe-chunk", "length", DRAFT_TEXT.length()); stage = 10; return;
            }
            if (stage == 10) {
                if (!draftResult("begin")) return;
                draftOffset = 0; sendChunk(); stage = 11; return;
            }
            if (stage == 11) {
                if (!draftResult("chunk")) return;
                var receipt = screen.driver().data().getAsJsonObject().getAsJsonObject("drafts.result");
                if (receipt.get("offset").getAsInt() != draftOffset) return;
                if (draftOffset < DRAFT_TEXT.length()) { sendChunk(); return; }
                check(eval(page(), "oriel.data.prefs.drafts['" + DRAFT_KEY + "'].length===" + DRAFT_TEXT.length()), "draft_chunk_upload_over_8192");
                dev.rinorsi.editor.client.EditorPrefs.flush();
                var disk = com.google.gson.JsonParser.parseString(Files.readString(mc.gameDirectory.toPath().resolve("config/cadeditor-ui.json"))).getAsJsonObject();
                check(disk.getAsJsonObject("drafts").get(DRAFT_KEY).getAsString().equals(DRAFT_TEXT), "draft_atomic_disk_roundtrip");
                sendDraft("clear", "key", DRAFT_KEY); stage = 12; return;
            }
            if (stage == 12) {
                if (!draftResult("clear")) return;
                screen.driver().reload(); stage = 3; return;
            }
            if (stage == 3) {
                results.addProperty("reload_js", String.valueOf(page().getClass().getMethod("eval", String.class).invoke(page(), "JSON.stringify({pages:pages,keys:Object.keys(received)})"))); write(mc);
                if (!eval(page(), "typeof received!=='undefined'&&!!received['registry.items']&&received['registry.items'].length===oriel.data['registry.meta'].counts.items")) return;
                check(eval(page(), "received['registry.items'].length===oriel.data['registry.meta'].counts.items"), "reload_republishes_all_pages");
                check(eval(page(), "pages>0"), "continuous_animation_does_not_block_registry");
                results.add("performance", RegistryBridge.performance());
                results.addProperty("status", "PASSED"); write(mc); stage = 90;
            }
        } catch (Throwable e) {
            e.printStackTrace(); results.addProperty("status", "FAILED"); results.addProperty("error", e.toString());
            results.addProperty("stage", stage); write(mc); stage = 90;
        }
    }
    private static JsonObject find(JsonArray rows, String id) {
        for (var row : rows) if (row.getAsJsonObject().get("id").getAsString().equals(id)) return row.getAsJsonObject();
        throw new AssertionError("missing " + id);
    }
    private boolean draftResult(String op) {
        var data = screen.driver().data().getAsJsonObject();
        if (!data.has("drafts.result")) return false;
        var result = data.getAsJsonObject("drafts.result");
        if (!result.get("op").getAsString().equals(op)) return false;
        if (!result.get("status").getAsString().equals("accepted")) throw new AssertionError(result);
        return true;
    }
    private void sendDraft(String op, Object... fields) throws Exception {
        JsonObject message = new JsonObject(); message.addProperty("op", op);
        for (int i = 0; i < fields.length; i += 2) {
            String key = (String) fields[i]; Object value = fields[i + 1];
            if (value instanceof Number n) message.addProperty(key, n);
            else if (value instanceof Boolean b) message.addProperty(key, b);
            else message.addProperty(key, value.toString());
        }
        if (message.toString().length() > 8192) throw new AssertionError("test chunk too big");
        check(eval(page(), "oriel.send('drafts'," + message + ");true"), "draft_send_" + op);
    }
    private void sendChunk() throws Exception {
        int end = Math.min(DRAFT_TEXT.length(), draftOffset + 3000);
        sendDraft("chunk", "upload", "probe-chunk", "offset", draftOffset, "value", DRAFT_TEXT.substring(draftOffset, end), "done", end == DRAFT_TEXT.length());
        draftOffset = end;
    }
    private static Object page() throws Exception {
        return ((java.util.Optional<?>) Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();
    }
    private static boolean eval(Object page, String js) throws Exception {
        var result = (java.util.Optional<?>) page.getClass().getMethod("eval", String.class).invoke(page, js);
        return result.isPresent() && ((com.google.gson.JsonElement) result.get()).getAsBoolean();
    }
    private void check(boolean ok, String name) { if (!ok) throw new AssertionError(name); results.addProperty(name, true); }
    private void write(net.minecraft.client.Minecraft mc) {
        try { Files.writeString(mc.gameDirectory.toPath().resolve("registry-verification.json"), results.toString()); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
