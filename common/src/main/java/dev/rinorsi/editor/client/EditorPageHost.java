package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.OrielScreen;
import dev.oriel.mod.client.OrielScreens;
import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.registry.RegistryBridge;
import net.minecraft.client.Minecraft;

/** Common channels for every editor page, including custom OrielScreen subclasses. */
final class EditorPageHost {
    private static final EditorClipboard clipboard = new EditorClipboard(System::nanoTime);
    private static final EditorUiLog uiLog = EditorUiLog.live();
    private static final java.util.Map<dev.oriel.mod.client.DocumentDriver, EditorPageTrace> traces = new java.util.WeakHashMap<>();
    private static final java.util.Map<OrielScreen, PageAudio> audioPages = new java.util.IdentityHashMap<>();
    private static boolean initialized;
    private static long noticeSequence;

    private EditorPageHost() {}

    static void initialize() {
        if (initialized) return;
        initialized = true;
        dev.rinorsi.editor.platform.ClientPlatform.get().onTick(mc -> {
            for (var entry : java.util.List.copyOf(audioPages.entrySet())) entry.getValue().tick(mc.gui.screen() == entry.getKey());
        });
        dev.rinorsi.editor.platform.ClientPlatform.get().onDisconnect(mc -> {
            for (var audio : java.util.List.copyOf(audioPages.values())) audio.stop();
            audioPages.clear();
        });
        // Before scripts: boot errors and timings must work for items, entities, players and the vault.
        OrielScreens.onPageLoad("cadeditor:ui/index.html", driver -> {
            if (driver.serverSession()) return;
            EditorPageRecovery.loading(driver);
            driver.uiScale(uiScalePreference());
            if (!traces.containsKey(driver)) {
                EditorChangelog.attach(driver);
                driver.onMessage("log", uiLog::accept);
                driver.onMessage("editor_ready", value -> { var trace = traces.get(driver); if (trace != null) trace.accept(value); });
                driver.onMessage("editor_recovery_preview", value -> Minecraft.getInstance().schedule(() -> EditorPageRecovery.preview(driver)));
                driver.onClose(() -> { traces.remove(driver); EditorPageRecovery.closed(driver); });
            }
            traces.put(driver, new EditorPageTrace(uiLog, System::nanoTime));
        });
    }

    static void closeLog() { uiLog.close(); }

    static String lastStage(dev.oriel.mod.client.DocumentDriver driver) {
        var trace = traces.get(driver);
        return trace == null ? "页面加载（尚未取得具体阶段）" : trace.lastStage();
    }

    static OrielScreen open(String page, JsonObject data) {
        declare(data);
        OrielScreen screen;
        if (Minecraft.getInstance().gui.screen() instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> parent) {
            var layer = new EditorLayerScreen(page, parent);
            layer.driver().pushData(data.toString());
            layer.show();
            screen = layer;
        } else screen = OrielScreens.open(page, data);
        attachCommon(screen, null);
        return screen;
    }

    static void attachCommon(OrielScreen screen, JsonObject dataOrNull) {
        if (dataOrNull != null) {
            declare(dataOrNull);
            screen.driver().pushData(dataOrNull.toString());
        }
        EditorClipboardHost.attach(screen, clipboard);
        if (!audioPages.containsKey(screen)) {
            var audio = new PageAudio(screen);
            audioPages.put(screen, audio);
            screen.driver().onMessage("sound_preview", value -> {
                var document = screen.driver().document();
                Minecraft.getInstance().execute(() -> {
                    if (Minecraft.getInstance().gui.screen() == screen && document != null && screen.driver().document() == document) audio.accept(value);
                });
            });
            screen.driver().onClose(() -> { audioPages.remove(screen); audio.stop(); });
        }
        screen.driver().uiScale(uiScalePreference());
        screen.driver().onMessage("prefs", value -> {
            EditorPrefs.accept(value);
            // Keep this Document and its focus/drafts; only its viewport changes.
            screen.driver().uiScale(uiScalePreference());
            EditorToast.refreshScale();
        });
        RegistryBridge.attach(screen.driver());
    }

    static int uiScalePreference() {
        var value = EditorPrefs.read().get("uiScale");
        return value == null ? 0 : value.getAsInt();
    }

    /** Navigation failures belong above this page, not in the HUD behind it. */
    static void notice(OrielScreen owner, String text) {
        if (owner == null || Minecraft.getInstance().gui.screen() != owner) return;
        var notice = new JsonObject();
        notice.addProperty("text", text == null ? "无法打开该目标" : text);
        notice.addProperty("kind", "error");
        notice.addProperty("sequence", ++noticeSequence);
        owner.driver().patch("notice", notice);
    }

    private static void declare(JsonObject data) {
        EditorClipboardHost.declare(data);
        data.addProperty("hostPrefs", true);
        data.addProperty("hostAudio", true);
        var about = new JsonObject();
        about.addProperty("version", modVersion());
        about.addProperty("recoveryPreview", true);
        about.addProperty("changelog", true);
        data.add("about", about);
    }

    /** A reload replaces the Document without closing its Screen. Never carry playback into it. */
    private static final class PageAudio {
        private final OrielScreen screen;
        private Object document;
        private EditorSoundPreview preview;
        PageAudio(OrielScreen screen) { this.screen = screen; }
        void accept(com.google.gson.JsonElement value) {
            Object current = screen.driver().document();
            if (current == null) return;
            if (document != current) { stop(); document = current; }
            if (preview == null) preview = new EditorSoundPreview(state -> {
                if (document != null && screen.driver().document() == document) screen.driver().patch("sound_preview", state);
            });
            preview.accept(value);
        }
        void tick(boolean visible) {
            if (preview == null) return;
            if (!visible || screen.driver().document() != document) { stop(); return; }
            preview.tick();
        }
        void stop() { if (preview != null) { preview.stop(); preview = null; } document = null; }
    }

    private static String modVersion() {
        try {
            String version = Platform.get().modVersion("cadeditor");
            return version == null || version.isBlank() ? "unknown" : version;
        } catch (RuntimeException | LinkageError unavailable) {
            return "unknown";
        }
    }
}
