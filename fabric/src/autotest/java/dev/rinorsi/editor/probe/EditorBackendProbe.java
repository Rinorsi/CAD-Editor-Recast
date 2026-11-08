package dev.rinorsi.editor.probe;

import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.util.Optional;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.world.item.Items;

/** Explicit opt-in production-jar test; no OS input, window activation, or release hooks. */
public final class EditorBackendProbe implements ClientModInitializer {
    private static final String NAME = "Editor vanilla persistence 20261106";
    private final JsonObject results = new JsonObject();
    private CommandDispatcher<FabricClientCommandSource> commands;
    private String mode;
    private int stage;
    private long start, next;
    private boolean finished;
    private long phaseStart;
    private java.util.concurrent.CompletableFuture<Boolean> serverName;
    private java.util.concurrent.CompletableFuture<Boolean> testKitWork;

    @Override public void onInitializeClient() {
        mode = System.getProperty("editor.autotest");
        if (mode == null) return;
        if (!mode.equals("edit") && !mode.equals("vanilla") && !mode.equals("live")) throw new IllegalArgumentException("Invalid editor.autotest");
        start = System.nanoTime();
        results.addProperty("mode", mode);
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registry) -> commands = dispatcher);
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }

    private void tick(Minecraft mc) {
        if (finished) return;
        mc.mouseHandler.releaseMouse();
        long now = System.nanoTime();
        if (now < next) return;
        next = now + 500_000_000L;
        try {
            if (stage >= 90) {
                if (stage == 90) { mc.disconnectWithSavingScreen(); stage = 91; return; }
                if (mc.getSingleplayerServer() == null) { finished = true; mc.stop(); }
                return;
            }
            if (now - start > 180_000_000_000L) throw new IllegalStateException("Timeout at stage " + stage);
            if (mc.player == null || mc.level == null) return;
            if (Boolean.getBoolean("editor.testkitProbe")) { testKit(mc); return; }
            if (mode.equals("vanilla")) {
                if (mc.screen != null) return;
                if (stage == 1) { shot(mc, "vanilla-after-uninstall.png"); complete(); return; }
                check(!FabricLoader.getInstance().isModLoaded("editor"), "editor_uninstalled");
                check(!FabricLoader.getInstance().isModLoaded("oriel"), "oriel_uninstalled");
                check(mc.player.getMainHandItem().is(Items.DIAMOND_SWORD), "vanilla_sword_restored");
                check(NAME.equals(mc.player.getMainHandItem().getHoverName().getString()), "name_survives_uninstall");
                mc.gui.setOverlayMessage(net.minecraft.network.chat.Component.literal("Vanilla saved item: " + NAME), false);
                stage = 1; return;
            }
            switch (stage) {
                case 0 -> {
                    check(FabricLoader.getInstance().isModLoaded("editor"), "editor_loaded");
                    check(FabricLoader.getInstance().isModLoaded("oriel"), "oriel_loaded");
                    mc.player.connection.sendCommand("item replace entity @s weapon.mainhand with minecraft:diamond_sword");
                    stage = 1;
                }
                case 1 -> {
                    if (!mc.player.getMainHandItem().is(Items.DIAMOND_SWORD) || commands == null) return;
                    if (mc.screen != null) return; // Wait for quick-play loading to finish.
                    check(true, "vanilla_item_command");
                    command(mc, "cade"); stage = 5;
                }
                case 5 -> {
                    Object page = page();
                    if (page == null || !(boolean) invoke(page, "settled")) return;
                    Object driver = mc.screen.getClass().getMethod("driver").invoke(mc.screen);
                    String expectedUrl = "cadeditor:ui/index.html";
                    results.addProperty("cade_url", String.valueOf(invoke(driver, "url")));
                    check(expectedUrl.equals(invoke(driver, "url")), "cade_real_entrypoint");
                    check(evalBoolean(page, "!!oriel.data.stack&&Store.doc().src.kind==='inventory'&&!!oriel.data.hostPrefs"), "real_host_stack_not_fixture");
                    check(evalBoolean(page, "(function(){var p={heroView:'3d',windowMax:false,heroWidth:144,winW:640,winH:360};for(var k in p)oriel.send('prefs',{key:k,value:p[k]});return true;})()"), "host_prefs_sent");
                    invoke(page, "leave");
                    check(evalBoolean(page, "document.documentElement.getAttribute('data-editor-controller')==='ready'"), "packaged_controller_attached");
                    check(evalBoolean(page, "(function(){var box=document.createElement('div');box.id='ed-motion-test';"
                            + "var tab=document.createElement('div');tab.id='ed-motion-tab';tab.textContent='tab';"
                            + "var bar=document.createElement('div');bar.id='ed-motion-bar';bar.setAttribute('data-ed-indicator','#ed-motion-tab');"
                            + "var body=document.createElement('div');body.id='ed-motion-body';body.textContent='body';body.setAttribute('data-ed-open','true');"
                            + "var num=document.createElement('span');num.id='ed-motion-number';num.setAttribute('data-ed-from','0');num.setAttribute('data-ed-to','42');num.setAttribute('data-ed-ms','100');"
                            + "box.appendChild(tab);box.appendChild(bar);box.appendChild(body);box.appendChild(num);document.body.appendChild(box);"
                            + "document.dispatchEvent(new CustomEvent('ed:tabs'));body.dispatchEvent(new CustomEvent('ed:toggle',{bubbles:true}));num.dispatchEvent(new CustomEvent('ed:count',{bubbles:true}));return true;})()"), "custom_events_dispatched");
                    stage = 7;
                }
                case 7 -> {
                    Object page = page();
                    if (page == null || !(boolean) invoke(page, "settled")) return;
                    check(evalBoolean(page, "document.getElementById('ed-motion-number').textContent==='42'"), "motion_count");
                    check(evalBoolean(page, "document.getElementById('ed-motion-body').parentElement.classList.contains('m-open')"), "motion_toggle");
                    check(evalBoolean(page, "document.getElementById('ed-motion-bar').getAttribute('style').indexOf('width')>=0"), "motion_indicator");
                    invoke(page, "eval", String.class, "document.getElementById('ed-motion-test').remove();Store.set('custom_name','draft-before-reload');UI.advQ='reload-query';UIOpen['card:controller-probe']=true;rebuild();document.documentElement.setAttribute('data-css-sentinel','alive');document.documentElement.setAttribute('data-tab-before',String(UI.tab));true");
                    Object driver = mc.screen.getClass().getMethod("driver").invoke(mc.screen);
                    Object doc = invoke(driver, "document");
                    invoke(doc, "reloadStyles");
                    check(evalBoolean(page, "document.documentElement.getAttribute('data-css-sentinel')==='alive'&&Store.doc().comps.custom_name==='draft-before-reload'"), "css_reload_retains_document");
                    invoke(driver, "reload");
                    stage = 8;
                }
                case 8 -> {
                    Object page = page();
                    if (page == null || !(boolean) invoke(page, "settled")) return;
                    check(evalBoolean(page, "document.documentElement.getAttribute('data-css-sentinel')===null"), "full_reload_rebuilt_document");
                    check(evalBoolean(page, "document.documentElement.getAttribute('data-editor-restored')==='true'&&Store.doc().comps.custom_name==='draft-before-reload'&&UI.advQ==='reload-query'&&UIOpen['card:controller-probe']===true"), "full_reload_restores_draft_ui");
                    if (mode.equals("live")) {
                        check(evalBoolean(page, "(function(){Store.set('custom_name','live-draft');UI.advQ='live-search';UI.tab='ench';UIOpen['card:live']=true;rebuild();var e=document.createElement('div');e.id='ed-live-css';e.textContent='probe';document.body.appendChild(e);document.documentElement.setAttribute('data-live-doc','same');return true;})()"), "devpage_live_draft_prepared");
                        signal(mc, "css"); stage = 10; return;
                    }
                    Optional<?> value = (Optional<?>) invoke(page, "eval", String.class,
                            "Store.set('custom_name', '" + NAME + "'); rebuild(); applyToGame(); true");
                    check(value.isPresent(), "page_apply_sent");
                    stage = 6;
                }
                case 6 -> {
                    if (!NAME.equals(mc.player.getMainHandItem().getHoverName().getString())) {
                        if (!results.has("apply_diagnostic")) {
                            Object page = page();
                            results.addProperty("apply_diagnostic", String.valueOf(invoke(page, "eval", String.class,
                                    "JSON.stringify({result:oriel.data.result,stack:Store.doc(),pending:EditorBridge.pending})")));
                            write(); shot(mc, "real-editor-apply-diagnostic.png");
                        }
                        return;
                    }
                    var server = mc.getSingleplayerServer();
                    if (server == null) throw new IllegalStateException("Expected integrated server");
                    if (serverName == null) {
                        var uuid = mc.player.getUUID();
                        serverName = new java.util.concurrent.CompletableFuture<>();
                        server.execute(() -> {
                            var player = server.getPlayerList().getPlayer(uuid);
                            serverName.complete(player != null && NAME.equals(player.getMainHandItem().getHoverName().getString()));
                        });
                        return;
                    }
                    if (!serverName.isDone()) return;
                    check(serverName.join(), "server_name_verified");
                    var prefs = com.google.gson.JsonParser.parseString(Files.readString(mc.gameDirectory.toPath().resolve("config/cadeditor-ui.json"))).getAsJsonObject();
                    check(prefs.get("heroWidth").getAsInt() == 144 && prefs.get("winW").getAsInt() == 640 && prefs.get("winH").getAsInt() == 360 && !prefs.get("windowMax").getAsBoolean() && prefs.get("heroView").getAsString().equals("3d"), "host_prefs_persisted");
                    check(true, "server_and_client_name_changed");
                    shot(mc, "real-editor-applied.png");
                    complete();
                }
                case 10 -> {
                    Object page = page();
                    if (page == null || !evalBoolean(page, "document.getElementById('ed-live-css').getBoundingClientRect().width===31")) return;
                    check(evalBoolean(page, "document.documentElement.getAttribute('data-live-doc')==='same'&&Store.doc().comps.custom_name==='live-draft'"), "live_css_same_document_controller");
                    results.addProperty("cssReloadMs", (System.nanoTime()-phaseStart)/1_000_000);
                    signal(mc, "js"); stage = 11;
                }
                case 11 -> {
                    Object page = page();
                    if (page == null || !evalBoolean(page, "typeof EDITOR_LIVE_JS_PROBE!=='undefined'&&EDITOR_LIVE_JS_PROBE==='ready'")) return;
                    check(evalBoolean(page, "document.documentElement.getAttribute('data-live-doc')===null"), "live_js_rebuilt_document");
                    check(evalBoolean(page, "Store.doc().comps.custom_name==='live-draft'&&UI.advQ==='live-search'&&UI.tab==='ench'&&UIOpen['card:live']===true&&document.documentElement.getAttribute('data-editor-restored')==='true'"), "live_js_restored_draft_ui_fold");
                    results.addProperty("jsReloadMs", (System.nanoTime()-phaseStart)/1_000_000);
                    shot(mc, "live-js-restored.png");
                    if (mode.equals("live")) {
                        invoke(page, "eval", String.class, "Store.set('custom_name','" + NAME + "');rebuild();applyToGame();true");
                        check(true, "devpage_apply_after_hot_reload");
                        stage = 6;
                    } else complete();
                }
                default -> throw new IllegalStateException("Unknown stage");
            }
        } catch (Throwable error) {
            results.addProperty("status", "FAILED");
            results.addProperty("stage", stage);
            results.addProperty("error", error.toString());
            error.printStackTrace();
            write(); stage = 90;
        }
    }

    /** Explicit opt-in, standalone probe only: exercises the real server command dispatcher. */
    private void testKit(Minecraft mc) throws Exception {
        if (testKitWork == null) {
            if (mc.screen != null || mc.getSingleplayerServer() == null) return;
            var server = mc.getSingleplayerServer(); var id = mc.player.getUUID();
            testKitWork = server.submit(() -> {
                try {
                var player = server.getPlayerList().getPlayer(id);
                player.setGameMode(net.minecraft.world.level.GameType.CREATIVE);
                var inventory = player.getInventory(); inventory.clearContent();
                var source = player.createCommandSourceStack();
                var dispatcher = server.getCommands().getDispatcher();
                for (int i = 0; i < 36; i++) inventory.setItem(i, new net.minecraft.world.item.ItemStack(Items.DIAMOND, 64));
                inventory.setItem(40, new net.minecraft.world.item.ItemStack(Items.DIAMOND, 64));
                check(dispatcher.execute("cadeditor testkit", source) == 0, "testkit_full_refused");
                for (int i = 0; i < 36; i++) if (!inventory.getItem(i).is(Items.DIAMOND) || inventory.getItem(i).getCount() != 64)
                    throw new AssertionError("ordinary item lost at " + i);
                check(inventory.getItem(40).getCount() == 64, "testkit_full_preserves_offhand");
                inventory.setItem(40, net.minecraft.world.item.ItemStack.EMPTY);
                check(dispatcher.execute("cadeditor testkit all", source) == 1, "testkit_all_real_command");
                var found = new java.util.HashSet<Integer>();
                for (int i = 0; i < inventory.getContainerSize(); i++) kitNumbers(inventory.getItem(i), found);
                check(found.size() == 45, "testkit_single_free_slot_all_45");
                check(dispatcher.execute("cadeditor testkit clear", source) == 1, "testkit_clear_real_command");
                for (int i = 0; i < 36; i++) if (!inventory.getItem(i).is(Items.DIAMOND) || inventory.getItem(i).getCount() != 64)
                    throw new AssertionError("ordinary item lost by clear at " + i);
                check(inventory.getItem(40).isEmpty(), "testkit_clear_only_owned");
                inventory.clearContent();
                check(dispatcher.execute("cadeditor testkit inventory", source) == 1, "testkit_inventory_real_command");
                found.clear(); for (int i = 0; i < 36; i++) kitNumbers(inventory.getItem(i), found);
                check(found.size() == 45 && inventory.getItem(40).isEmpty(), "testkit_inventory_no_offhand");
                dispatcher.execute("cadeditor testkit clear", source);
                check(dispatcher.execute("cadeditor testkit hotbar", source) == 1, "testkit_hotbar_real_command");
                found.clear(); for (int i = 0; i < 9; i++) kitNumbers(inventory.getItem(i), found);
                check(found.size() == 9, "testkit_hotbar_first_nine");
                dispatcher.execute("cadeditor testkit clear", source);
                player.setGameMode(net.minecraft.world.level.GameType.SURVIVAL);
                var noPermission = source.withPermission(net.minecraft.server.permissions.PermissionSet.NO_PERMISSIONS);
                boolean denied = false;
                try { dispatcher.execute("cadeditor testkit", noPermission); }
                catch (com.mojang.brigadier.exceptions.CommandSyntaxException expected) { denied = true; }
                check(denied, "testkit_non_op_survival_denied");
                return true;
                } catch (Exception error) { throw new java.util.concurrent.CompletionException(error); }
            });
            return;
        }
        if (!testKitWork.isDone()) return;
        check(testKitWork.get(), "testkit_server_dispatch_complete");
        complete();
    }
    private static void kitNumbers(net.minecraft.world.item.ItemStack stack, java.util.Set<Integer> found) {
        if (stack.isEmpty()) return;
        String name = stack.getHoverName().getString(); int end = name.indexOf('·');
        if (name.startsWith("测") && end > 1) { int n = Integer.parseInt(name.substring(1, end)); if (n > 0) found.add(n); }
        var box = stack.get(net.minecraft.core.component.DataComponents.CONTAINER);
        if (box != null) box.nonEmptyItemCopyStream().forEach(child -> kitNumbers(child, found));
        var bundle = stack.get(net.minecraft.core.component.DataComponents.BUNDLE_CONTENTS);
        if (bundle != null) dev.rinorsi.editor.ContainerCopies.copies(bundle).forEach(child -> kitNumbers(child, found));
    }

    private void command(Minecraft mc, String command) throws Exception {
        commands.execute(command, (FabricClientCommandSource) mc.player.connection.getSuggestionsProvider());
    }
    private void signal(Minecraft mc, String phase) throws Exception {
        phaseStart = System.nanoTime();
        Files.writeString(mc.gameDirectory.toPath().resolve("editor-live-phase.txt"), phase);
    }
    private static Object page() throws Exception {
        return ((Optional<?>) Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElse(null);
    }
    private static boolean evalBoolean(Object page, String js) throws Exception {
        Optional<?> value = (Optional<?>) invoke(page, "eval", String.class, js);
        return value.isPresent() && ((com.google.gson.JsonElement) value.get()).getAsBoolean();
    }
    private static Object invoke(Object target, String method) throws Exception {
        return target.getClass().getMethod(method).invoke(target);
    }
    private static Object invoke(Object target, String method, Class<?> type, Object argument) throws Exception {
        Method call = target.getClass().getMethod(method, type);
        return call.invoke(target, argument);
    }
    private void check(boolean ok, String label) {
        if (!ok) throw new IllegalStateException(label);
        results.addProperty(label, true); write();
        System.out.println("EDITOR_AUTOTEST PASS " + label);
    }
    private static void shot(Minecraft mc, String name) {
        Screenshot.grab(mc.gameDirectory, name, mc.getMainRenderTarget(), 1, message -> System.out.println("EDITOR_AUTOTEST screenshot: " + message.getString()));
    }
    private void complete() { results.addProperty("status", "PASSED"); write(); stage = 90; }
    private void write() {
        try { Files.writeString(Minecraft.getInstance().gameDirectory.toPath().resolve("editor-autotest-" + mode + ".json"), results.toString()); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
