package dev.rinorsi.editor.probe;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.ComponentValidation;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.testing.ComplexStackFixture;
import dev.rinorsi.editor.testing.UserSpearFixture;
import dev.rinorsi.editor.testing.UserSpearRoundTrip;
import java.nio.file.Files;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.nbt.NbtOps;
import net.minecraft.world.item.ItemStack;

/** Opt-in, isolated true page -> host -> server apply and reread probe. */
public final class BackendDataProbe implements ClientModInitializer {
    private record Case(String item, String component, String snbt) {}
    private final Case[] cases = {
        new Case("minecraft:pig_spawn_egg", "entity_data", "{id:'minecraft:pig',Health:7.0f,Age:-24000}"),
        new Case("minecraft:spawner", "block_entity_data", "{id:'minecraft:mob_spawner',Delay:40s,SpawnData:{entity:{id:'minecraft:pig'}}}"),
        new Case("minecraft:trial_spawner", "block_entity_data", "{id:'minecraft:trial_spawner',normal_config:{spawn_range:4}}"),
        new Case("minecraft:tropical_fish_bucket", "bucket_entity_data", "{Health:7.0f,Age:-24000}"),
        new Case("minecraft:crossbow", "charged_projectiles", "[{id:'minecraft:arrow',count:1}]"),
        new Case("minecraft:chest", "lock", "{items:'minecraft:tripwire_hook'}"),
        new Case("minecraft:paper", "custom_data", "{note:'codec-e2e',value:7}"),
        new Case("minecraft:paper", "custom_data", "{b:7b,long:9007199254740993L,array:[I;1,2,3]}"),
        new Case("minecraft:netherite_spear", "custom_name", "'复杂物品保存通过'"),
        new Case("minecraft:netherite_spear", "custom_name", "'用户真实物品无修改保存'")
    };
    private final JsonObject receipt = new JsonObject();
    private com.mojang.brigadier.CommandDispatcher<FabricClientCommandSource> commands;
    private int index, stage;
    private long start, next;
    private CompletableFuture<Boolean> work;
    private ItemStack expected;
    @Override public void onInitializeClient() {
        if (!Boolean.getBoolean("editor.backendDataProbe")) return;
        start = System.nanoTime();
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registries) -> commands = dispatcher);
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }
    private void tick(Minecraft mc) {
        if (stage == 100) return;
        mc.mouseHandler.releaseMouse();
        long now = System.nanoTime(); if (now < next) return; next = now + 300_000_000L;
        try {
            if (stage == 90) { mc.disconnectWithSavingScreen(); stage = 91; return; }
            if (stage == 91) { if (mc.getSingleplayerServer() == null) { stage = 100; mc.stop(); } return; }
            if (now - start > 300_000_000_000L) throw new IllegalStateException("Timeout stage=" + stage + " case=" + index);
            if (mc.player == null || mc.level == null || commands == null) return;
            Case c = cases[index];
            if (stage == 0) {
                if (mc.screen != null) return;
                var server = mc.getSingleplayerServer(); var uuid = mc.player.getUUID();
                work = CompletableFuture.supplyAsync(() -> {
                    var player = server.getPlayerList().getPlayer(uuid);
                    player.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, index == 9 ? UserSpearFixture.create(server.registryAccess()) : index == 8 ? ComplexStackFixture.create(server.registryAccess()) : new ItemStack(net.minecraft.core.registries.BuiltInRegistries.ITEM.getValue(net.minecraft.resources.Identifier.parse(c.item))));
                    player.containerMenu.broadcastChanges(); return true;
                }, server); stage = 1; return;
            }
            if (stage == 1) {
                if (!work.isDone() || !mc.player.getMainHandItem().is(net.minecraft.core.registries.BuiltInRegistries.ITEM.getValue(net.minecraft.resources.Identifier.parse(c.item)))) return;
                work.join(); commands.execute("cade", (FabricClientCommandSource) mc.player.connection.getSuggestionsProvider()); stage = 2; return;
            }
            Object page = ((Optional<?>) Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElse(null);
            if (page == null || !eval(page, "typeof Store!=='undefined'&&!!Store.doc()")) return;
            if (stage == 2) {
                var request = new JsonObject(); request.addProperty("component", c.component); request.addProperty("snbt", c.snbt); request.addProperty("requestId", "probe-" + index);
                var result = ComponentValidation.validate(request, mc.level.registryAccess());
                if (!result.get("ok").getAsBoolean()) throw new IllegalStateException(result.toString());
                var original = mc.player.getMainHandItem(); var draft = StackCodec.snapshot(original, mc.level.registryAccess(), new JsonObject(), "");
                if (index != 9) draft.getAsJsonObject("comps").add(c.component, result.get("json"));
                if (index == 9) receipt.add("user_spear_round_trip", UserSpearRoundTrip.verify(original, mc.level.registryAccess()));
                if (index == 7) {
                    draft.getAsJsonObject("comps").add(c.component, result.get("normalized"));
                    var formats = new JsonObject(); formats.addProperty(c.component, "snbt"); draft.add("component_formats", formats);
                }
                expected = StackCodec.decode(draft, mc.level.registryAccess(), original);
                eval(page, "oriel.send('validate_component'," + request + ");oriel.send('registry',{name:'item_meta_one',id:" + new com.google.gson.JsonPrimitive(c.item) + "});true");
                stage = 3; return;
            }
            if (stage == 3) {
                if (!eval(page, "!!oriel.data['validate_component.result']&&oriel.data['validate_component.result'].ok===true&&!!oriel.data['registry.item_meta_one']")) return;
                JsonObject request = new JsonObject(); request.addProperty("component", c.component); request.addProperty("snbt", c.snbt);
                var json = ComponentValidation.validate(request, mc.level.registryAccess()).get("json");
                if (index == 7) {
                    var normalized = ComponentValidation.validate(request, mc.level.registryAccess()).get("normalized");
                    if (!eval(page, "(function(){var d=Store.doc();return oriel.send('apply',{requestId:'typed-e2e',id:d.id,count:d.count,comps:{custom_data:" + normalized + "},removed:{},slot:d.src,component_formats:{custom_data:'snbt'}});})()")) throw new IllegalStateException("typed host apply failed");
                } else if (index == 9) {
                    if (!eval(page, "(function(){applyToGame();return true;})()")) throw new IllegalStateException("user spear no-edit apply failed");
                } else if (!eval(page, "(function(){Store.set(" + new com.google.gson.JsonPrimitive(c.component) + "," + json + ");applyToGame();return true;})()")) throw new IllegalStateException("applyToGame failed");
                stage = 4; return;
            }
            if (stage == 4) {
                if (!ItemStack.matches(expected, mc.player.getMainHandItem())) return;
                var server = mc.getSingleplayerServer(); var uuid = mc.player.getUUID(); var wanted = expected.copy();
                work = CompletableFuture.supplyAsync(() -> {
                    var actual = server.getPlayerList().getPlayer(uuid).getMainHandItem();
                    var ops = server.registryAccess().createSerializationContext(NbtOps.INSTANCE);
                    return ItemStack.matches(wanted, actual) && ItemStack.matches(actual, ItemStack.CODEC.parse(ops, ItemStack.CODEC.encodeStart(ops, actual).getOrThrow()).getOrThrow());
                }, server); stage = 5; return;
            }
            if (stage == 5) {
                if (!work.isDone()) return; if (!work.join()) throw new IllegalStateException("server reread mismatch");
                receipt.addProperty(c.item + "/" + c.component + (index == 7 ? "/typed-host" : ""), true); write(mc);
                mc.setScreen(null); index++;
                if (index == cases.length) { receipt.addProperty("status", "PASSED"); receipt.addProperty("cases", cases.length); write(mc); stage = 90; }
                else stage = 0;
            }
        } catch (Throwable error) {
            receipt.addProperty("status", "FAILED"); receipt.addProperty("error", error.toString()); write(mc); stage = 90;
        }
    }
    private static boolean eval(Object page, String source) throws Exception {
        var value = (Optional<?>) page.getClass().getMethod("eval", String.class).invoke(page, source);
        return value.isPresent() && ((com.google.gson.JsonElement) value.get()).getAsBoolean();
    }
    private void write(Minecraft mc) {
        try { Files.writeString(mc.gameDirectory.toPath().resolve("backend-data-e2e.json"), receipt.toString()); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
