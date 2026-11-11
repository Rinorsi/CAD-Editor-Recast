package dev.rinorsi.editor.client;

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
                "[物品工坊阶段] " + (start ? "开始：" : "结束：") + describe(site) + "；stage=" + site + (!start ? "；耗时=" + ms + "ms" : ""));
    }
    String lastStage() {
        return workStage == null ? "页面加载（尚未取得具体阶段）" : (working ? "正在" : "最后完成") + describe(workStage) + "（" + workStage + "）";
    }
    private static String describe(String site) {
        if (site.startsWith("registry.replay.")) return "恢复游戏字段信息";
        return switch (site) {
            case "boot.prefs" -> "读取界面设置"; case "boot.registry" -> "连接游戏注册表";
            case "boot.world" -> "打开方块、实体或玩家页面"; case "boot.vault" -> "打开保险库";
            case "item.load" -> "载入物品数据"; case "item.render" -> "绘制物品编辑界面";
            case "item.drafts" -> "检查可恢复草稿"; default -> "处理编辑器页面";
        };
    }
}
