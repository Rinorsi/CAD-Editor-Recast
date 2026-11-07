package dev.rinorsi.editor.finalgate;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.*;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.*;

/** One-shot release smoke; opens the actual editor and leaves the client/world running. */
public final class FinalGateProbe implements ClientModInitializer {
    private com.mojang.brigadier.CommandDispatcher<FabricClientCommandSource> commands;
    private CompletableFuture<Boolean> work;
    private final long started = System.nanoTime();
    private int stage;
    private Object proceeded;
    @Override public void onInitializeClient() {
        if (!Boolean.getBoolean("cadeditor.finalGateCopiedWorld")) return;
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registries) -> commands = dispatcher);
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }
    private void tick(Minecraft mc) {
        if (stage == 99) return;
        try {
            if (System.nanoTime() - started > 240_000_000_000L) throw new AssertionError("final gate timeout stage=" + stage);
            if (mc.player == null || mc.level == null || commands == null) {
                if (mc.screen != null && mc.screen != proceeded && (mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen || mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen)) {
                    for (var child : mc.screen.children()) if (child instanceof net.minecraft.client.gui.components.Button b) {
                        String label = b.getMessage().getString();
                        if (label.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString()) || label.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())) { proceeded = mc.screen; b.onPress(null); break; }
                    }
                }
                return;
            }
            if (stage == 0) {
                if (mc.screen != null) return;
                if (!Boolean.getBoolean("cadeditor.finalGateCopiedWorld")) throw new AssertionError("probe may only alter a newly copied verification world");
                var server = mc.getSingleplayerServer(); var uuid = mc.player.getUUID();
                work = CompletableFuture.supplyAsync(() -> {
                    var player = server.getPlayerList().getPlayer(uuid);
                    player.setGameMode(net.minecraft.world.level.GameType.CREATIVE);
                    player.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND,new ItemStack(Items.CAT_SPAWN_EGG));
                    player.containerMenu.broadcastChanges(); return true;
                },server); stage = 1; return;
            }
            if (stage == 1) {
                if (!work.isDone() || !mc.player.getMainHandItem().is(Items.CAT_SPAWN_EGG)) return;
                work.join(); commands.execute("cade",(FabricClientCommandSource)mc.player.connection.getSuggestionsProvider()); stage = 2; return;
            }
            Object page = ((Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElse(null);
            if (page == null) return;
            if (stage == 2) {
                if (!eval(page,"typeof Store!=='undefined'&&Store.doc()!=null&&Store.doc().id==='minecraft:cat_spawn_egg'").getAsBoolean()) return;
                var stack = dev.rinorsi.editor.StackCodec.snapshot(mc.player.getMainHandItem(),mc.level.registryAccess(),new JsonObject(),"");
                eval(page,"(function(){this.FINAL_GATE_TOOLTIP=null;oriel.on('patch',function(p){if(p.key==='tooltip.result'&&p.value.requestId==='final-gate-tooltip')FINAL_GATE_TOOLTIP=p.value;});oriel.send('registry',{name:'entity_schema',id:'minecraft:cat'});oriel.send('registry',{name:'component_schema',id:'minecraft:food'});oriel.send('tooltip',{requestId:'final-gate-tooltip',view:'final-gate',stack:"+stack+"});return true;})()");
                stage = 3; return;
            }
            var response = eval(page,"({entity_schema:oriel.data['registry.entity_schema']||null,component_schema:oriel.data['registry.component_schema']||null,tooltip:FINAL_GATE_TOOLTIP||null})").getAsJsonObject();
            if (response.get("entity_schema").isJsonNull() || response.get("component_schema").isJsonNull() || response.get("tooltip").isJsonNull()) return;
            var entity = response.getAsJsonObject("entity_schema"); var component = response.getAsJsonObject("component_schema"); var tooltip = response.getAsJsonObject("tooltip");
            if (!entity.get("done").getAsBoolean() || !component.get("done").getAsBoolean() || !tooltip.has("requestId") || !tooltip.get("requestId").getAsString().equals("final-gate-tooltip")) return;
            if (entity.has("error") || entity.getAsJsonArray("entries").isEmpty() || component.has("error") || component.getAsJsonArray("entries").isEmpty() || !tooltip.get("ok").getAsBoolean()) throw new AssertionError(response.toString());
            response.addProperty("status","PASSED"); response.addProperty("pid",ProcessHandle.current().pid()); response.addProperty("world",System.getProperty("cadeditor.finalGateWorld")); response.addProperty("page","cadeditor:ui/index.html"); response.addProperty("item","minecraft:cat_spawn_egg");
            response.addProperty("sourceCommit",System.getProperty("cadeditor.finalGateCommit","working-tree"));
            write(response);
            org.slf4j.LoggerFactory.getLogger("FinalGate").info("[Final-Gate] PASS entity_schema minecraft:cat; component_schema minecraft:food; tooltip final-gate-tooltip; actual cat spawn egg editor open; client remains running");
            System.clearProperty("editor.autotest"); // user may take control by explicitly focusing the window later
            stage = 99;
        } catch (Throwable error) {
            var result = new JsonObject(); result.addProperty("status","FAILED"); result.addProperty("error",error.toString()); result.addProperty("stage",stage); result.addProperty("pid",ProcessHandle.current().pid()); write(result);
            org.slf4j.LoggerFactory.getLogger("FinalGate").error("[Final-Gate] smoke failed; client left running",error); System.clearProperty("editor.autotest"); stage = 99;
        }
    }
    private static JsonElement eval(Object page,String source) throws Exception { return (JsonElement)((Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,source)).orElseThrow(); }
    private static void write(JsonObject value) {
        try { Files.writeString(Path.of(System.getProperty("cadeditor.finalGateReceipt")),new GsonBuilder().setPrettyPrinting().create().toJson(value)); }
        catch (Exception error) { throw new RuntimeException(error); }
    }
}
