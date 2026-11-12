package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonElement;
import java.util.Locale;
import java.util.function.LongSupplier;

/** One local Document load, including reloads. Neither marker claims a GPU presentation. */
final class EditorPageTrace {
    private final EditorUiLog log;
    private final LongSupplier clock;
    private final long started;
    private boolean boot, frame;
    private String workStage;
    private boolean working;

    EditorPageTrace(EditorUiLog log, LongSupplier clock) {
        this.log = log; this.clock = clock; started = clock.getAsLong();
    }

    void accept(JsonElement value) {
        if (value == null || !value.isJsonObject()) return;
        var object = value.getAsJsonObject();
        var phase = object.get("phase");
        if (phase == null || !phase.isJsonPrimitive() || !phase.getAsJsonPrimitive().isString()) return;
        String stage = phase.getAsString();
        if (stage.equals("work")) { work(object); return; }
        if (stage.equals("boot")) { if (boot) return; boot = true; }
        else if (stage.equals("first_frame_callback")) { if (!boot || frame) return; frame = true; }
        else return;
        double elapsed = Math.max(0, clock.getAsLong() - started) / 1_000_000.0;
        log.log(elapsed >= 250 ? EditorUiLog.Level.WARN : EditorUiLog.Level.INFO, String.format(Locale.ROOT,
                "[CAD-Editor-Perf] page=cadeditor:ui/index.html stage=%s load_ms=%.2f slow=%s", stage, elapsed, elapsed >= 250));
    }

    private void work(com.google.gson.JsonObject object) {
        var name = object.get("stage"); var state = object.get("state");
        if (name == null || !name.isJsonPrimitive() || !name.getAsJsonPrimitive().isString() || state == null || !state.isJsonPrimitive() || !state.getAsJsonPrimitive().isString()) return;
        String site = name.getAsString(); if (site.length() > 180 || !site.matches("[A-Za-z0-9_.:/-]+")) return;
        boolean start = state.getAsString().equals("begin");
        if (!start && !state.getAsString().equals("end")) return;
        if (start) { workStage = site; working = true; } else if (site.equals(workStage)) working = false;
        var elapsed = object.get("elapsedMs");
        long ms = elapsed != null && elapsed.isJsonPrimitive() && elapsed.getAsJsonPrimitive().isNumber() ? Math.max(0, elapsed.getAsLong()) : 0;
        log.log(!start && ms >= 250 ? EditorUiLog.Level.WARN : EditorUiLog.Level.INFO,
                EditorI18n.tr("cadeditor.message.editorpagetrace.a46a4cfb01", ((start ? EditorI18n.tr("cadeditor.message.editorpagetrace.cd439134e8") : EditorI18n.tr("cadeditor.message.editorpagetrace.6b2294b37c"))), (describe(site)), (site), ((!start ? EditorI18n.tr("cadeditor.message.editorpagetrace.6d9c0eb016", (ms)) : ""))));
    }
    String lastStage() {
        return workStage == null ? EditorI18n.tr("cadeditor.message.editorpagehost.1b3a6854e5") : (working ? EditorI18n.tr("cadeditor.message.editorpagetrace.e6b02a08e6") : EditorI18n.tr("cadeditor.message.editorpagetrace.b4d62b5724")) + describe(workStage) + "（" + workStage + "）";
    }
    private static String describe(String site) {
        if (site.startsWith("registry.replay.")) return EditorI18n.tr("cadeditor.message.editorpagetrace.f7fe390e55");
        return switch (site) {
            case "boot.prefs" -> EditorI18n.tr("cadeditor.message.editorpagetrace.5563b48529"); case "boot.registry" -> EditorI18n.tr("cadeditor.message.editorpagetrace.05b962a5f1");
            case "boot.world" -> EditorI18n.tr("cadeditor.message.editorpagetrace.eeb8d48f80"); case "boot.vault" -> EditorI18n.tr("cadeditor.message.editorpagetrace.90b3a9912a");
            case "item.load" -> EditorI18n.tr("cadeditor.message.editorpagetrace.8b78064807"); case "item.render" -> EditorI18n.tr("cadeditor.message.editorpagetrace.f69f1c22fd");
            case "item.drafts" -> EditorI18n.tr("cadeditor.message.editorpagetrace.16585cb522"); default -> EditorI18n.tr("cadeditor.message.editorpagetrace.e33fba89d3");
        };
    }
}
