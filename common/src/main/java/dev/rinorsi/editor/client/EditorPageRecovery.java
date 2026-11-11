package dev.rinorsi.editor.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.oriel.engine.Limits;
import dev.oriel.engine.dom.Document;
import dev.oriel.mod.client.DocumentDriver;
import dev.oriel.mod.internal.client.render.McGui;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import org.joml.Vector2f;
import org.slf4j.LoggerFactory;

/** Local-editor error boundary. Drawing, copying and leaving never execute page JavaScript. */
public final class EditorPageRecovery {
    private static final String PAGE = "cadeditor:ui/index.html";
    private static final Map<DocumentDriver, Fault> FAULTS = new WeakHashMap<>();
    private static final Map<DocumentDriver, Limits> BUDGETS = new WeakHashMap<>();
    private static final Map<DocumentDriver, Limits> CONFIGURED = new WeakHashMap<>();
    private static final Map<DocumentDriver, Boolean> MODES = new WeakHashMap<>();
    private static final Map<DocumentDriver, Boolean> EXTENDED = new WeakHashMap<>();
    private static long sequence;
    private static final Style FONT = Style.EMPTY.withFont(new FontDescription.Resource(Identifier.parse("oriel:pixel_12")));
    private static final float TEXT_SCALE = 1.5f;
    private EditorPageRecovery() {}

    private static boolean local(DocumentDriver driver) { return driver != null && !driver.serverSession() && PAGE.equals(driver.name()); }
    public static Limits limits(DocumentDriver driver, Limits configured) {
        if (!local(driver)) return configured;
        boolean extended = EXTENDED.containsKey(driver);
        Limits cached = BUDGETS.get(driver);
        if (cached != null && CONFIGURED.get(driver) == configured && Boolean.valueOf(extended).equals(MODES.get(driver))) return cached;
        Limits selected = configured
                .with("instructionBudget", Math.max(configured.instructionBudget(), extended ? 600_000_000L : 200_000_000L))
                .with("timeBudgetMs", Math.max(configured.timeBudgetMs(), extended ? 6000 : 3000))
                .with("loadTimeBudgetMs", Math.max(configured.loadTimeBudgetMs(), 30_000))
                .with("entryAllocation", Math.max(configured.entryAllocation(), 512L << 20));
        BUDGETS.put(driver, selected);
        CONFIGURED.put(driver, configured); MODES.put(driver, extended);
        return selected;
    }
    static void loading(DocumentDriver driver) { FAULTS.remove(driver); }
    static void closed(DocumentDriver driver) { FAULTS.remove(driver); BUDGETS.remove(driver); CONFIGURED.remove(driver); MODES.remove(driver); EXTENDED.remove(driver); }
    public static boolean active(DocumentDriver driver) { return local(driver) && FAULTS.containsKey(driver); }

    public static void failed(DocumentDriver driver, String title, Throwable error) {
        failed(driver, title, error, driver.document());
    }
    public static void failed(DocumentDriver driver, String title, Throwable error, Document document) {
        if (!local(driver) || FAULTS.containsKey(driver)) return;
        boolean timeout = false, memory = false;
        int depth = 0;
        for (Throwable cause = error; cause != null && depth++ < 16; cause = cause.getCause()) {
            String name = cause.getClass().getName(), message = String.valueOf(cause.getMessage());
            timeout |= name.contains("BudgetExceeded") || message.contains("ran out of budget") || message.contains("slow frames");
            memory |= cause instanceof OutOfMemoryError || message.contains("memory budget") || message.contains("heap");
            if (cause == cause.getCause()) break;
        }
        String id = "ED-" + Long.toString(System.currentTimeMillis(), 36) + "-" + (++sequence);
        String location = location(driver, document);
        Limits budget = BUDGETS.getOrDefault(driver, Limits.current());
        String summary = memory ? "编辑器内存不足，已停止此页。" : timeout ? "编辑器处理超时，已停止此页以免拖慢游戏。" : "编辑器页面发生错误，已停止此页。";
        StringWriter stack = new StringWriter(); if (error != null) error.printStackTrace(new PrintWriter(stack));
        String detail = "物品工坊错误编号：" + id + "\n" + summary + "\n位置：" + location
                + "\n页面：" + driver.name() + "\n脚本预算：" + budget.timeBudgetMs() + "ms / " + budget.instructionBudget() + "指令；加载预算：" + budget.loadTimeBudgetMs() + "ms"
                + "\n日志：发生问题的客户端游戏目录/logs/latest.log\n" + title + "\n" + stack;
        FAULTS.put(driver, new Fault(id, summary, location, detail, !memory, light(document), false));
        LoggerFactory.getLogger("CAD-Editor").error("[物品工坊] 错误编号={} {} 位置={}；查看发生问题的客户端 logs/latest.log。脚本预算={}ms/{}指令；加载预算={}ms；不会自动重试或应用修改。原始错误={}",
                id, summary, location, budget.timeBudgetMs(), budget.instructionBudget(), budget.loadTimeBudgetMs(), title, error);
    }
    private static boolean light(Document doc) { return doc != null && "light".equals(doc.documentElement().getAttribute("data-theme")); }
    private static String location(DocumentDriver driver, Document doc) {
        String stage = doc == null ? null : doc.documentElement().getAttribute("data-editor-restore-stage");
        return stage != null && !stage.isEmpty() && !"完成".equals(stage) ? "恢复编辑状态：" + stage : EditorPageHost.lastStage(driver);
    }
    static void preview(DocumentDriver driver) {
        if (!local(driver) || driver.document() == null || active(driver) || Minecraft.getInstance().gui.screen() != driver.screen()) return;
        String id = "ED-PREVIEW-" + (++sequence);
        FAULTS.put(driver, new Fault(id, "这是恢复面板预览，页面没有发生错误。", "手动体验",
                "物品工坊恢复面板预览：" + id + "\n未触发超时，未提交修改。\n日志：发生问题的客户端游戏目录/logs/latest.log", true, light(driver.document()), true));
        LoggerFactory.getLogger("CAD-Editor").info("[物品工坊] 编号={} 打开恢复面板预览；未制造超时、未重新加载或应用修改", id);
    }

    public static boolean draw(DocumentDriver driver, GuiGraphicsExtractor original, int mouseX, int mouseY) {
        Fault fault = FAULTS.get(driver); if (!local(driver) || fault == null) return false;
        float ratio = (float) driver.toGui(1);
        var g = McGui.tooltipContext(original, ratio);
        int width = g.guiWidth(), height = g.guiHeight(), w = Math.max(1, Math.min(500, width - 16)), x = (width - w) / 2;
        var font = Minecraft.getInstance().font;
        List<net.minecraft.util.FormattedCharSequence> lines = new ArrayList<>();
        String shortLocation = fault.location; int raw = shortLocation.indexOf('（'); if (raw >= 0) shortLocation = shortLocation.substring(0, raw);
        for (String text : List.of(fault.summary, "位置：" + shortLocation,
                fault.preview ? "返回编辑会关闭此预览。" : fault.retry ? "重试会重新加载；未落盘修改可能丢失。" : "请退出后重新打开；未落盘修改可能丢失。",
                "编号：" + fault.id, "日志：客户端游戏目录/logs/latest.log")) lines.addAll(font.split(styled(text), Math.max(1, (int) ((w - 24) / TEXT_SCALE))));
        int count = fault.retry ? 3 : 2, rows = w < 370 ? count : 1, bh = 26, gap = 6;
        int maxLines = Math.max(1, (height - 56 - rows * (bh + gap)) / 15);
        if (lines.size() > maxLines) lines = new ArrayList<>(lines.subList(0, maxLines));
        int panelHeight = 36 + lines.size() * 15 + rows * (bh + gap) + 12, y = Math.max(4, (height - panelHeight) / 2);
        int tx = fault.light ? 0xFF1E1E1F : 0xFFFFFFFF, sub = fault.light ? 0xFF5C5F64 : 0xFFC4C5C8;
        McGui.fill(g, 0, 0, width, height, 0x99000000);
        texture(g, "panel" + (fault.light ? "_l" : ""), x, y, w, panelHeight, false);
        McGui.fill(g, x + 10, y + 10, x + 12, y + 22, fault.light ? 0xFF2F7D1D : 0xFF6CC349);
        text(g, styled(fault.preview ? "恢复面板预览" : "物品工坊已暂停").getVisualOrderText(), x + 18, y + 10, tx);
        McGui.fill(g, x + 2, y + 29, x + w - 2, y + 30, 0x55000000);
        int ty = y + 38;
        for (var line : lines) { text(g, line, x + 12, ty, sub); ty += 15; }
        fault.buttons.clear(); int bw = rows == 1 ? (w - 20 - gap * (count - 1)) / count : w - 20;
        int mx = (int) driver.toPage(mouseX), my = (int) driver.toPage(mouseY);
        for (int i = 0; i < count; i++) {
            int action = fault.retry ? i : i + 1;
            int bx = x + 10 + (rows == 1 ? i * (bw + gap) : 0), by = ty + 6 + (rows > 1 ? i * (bh + gap) : 0);
            var button = new Box(bx, by, bw, bh, action); fault.buttons.add(button);
            boolean selected = button.contains(mx, my) || i == fault.focus;
            String buttonStyle = action == 0 ? "primary" : action == 2 && selected ? "destructive" : fault.light ? "secondary" : "neutral";
            texture(g, "button_" + buttonStyle + (selected ? "_hover" : ""), bx, by, bw, bh, true);
            String label = switch (action) { case 0 -> fault.preview ? "返回编辑" : "延长等待并重试"; case 1 -> fault.copied ? "已复制诊断" : "复制诊断"; default -> "强制退出编辑器"; };
            var caption = styled(label);
            text(g, caption.getVisualOrderText(), bx + (int) ((bw - font.width(caption) * TEXT_SCALE) / 2), by + 7, action == 0 || action == 2 && selected ? 0xFFFFFFFF : tx);
        }
        return true;
    }

    public static boolean click(DocumentDriver driver, MouseButtonEvent event) {
        Fault fault = FAULTS.get(driver); if (fault == null) return false;
        if (event.button() == InputConstants.MOUSE_BUTTON_LEFT) for (Box box : fault.buttons) if (box.contains(driver.toPage(event.x()), driver.toPage(event.y()))) { action(driver, fault, box.action); break; }
        return true;
    }
    public static boolean key(DocumentDriver driver, KeyEvent event) {
        Fault fault = FAULTS.get(driver); if (fault == null) return false;
        if (event.isEscape()) action(driver, fault, fault.preview ? 0 : 2);
        else if (event.key() == InputConstants.KEY_TAB) fault.focus = Math.floorMod(fault.focus + (event.hasShiftDown() ? -1 : 1), fault.retry ? 3 : 2);
        else if (event.key() == InputConstants.KEY_RETURN || event.key() == InputConstants.KEY_SPACE) action(driver, fault, fault.retry ? fault.focus : fault.focus + 1);
        return true;
    }
    private static void action(DocumentDriver driver, Fault fault, int action) {
        if (FAULTS.get(driver) != fault || Minecraft.getInstance().gui.screen() != driver.screen()) {
            LoggerFactory.getLogger("CAD-Editor").warn("[物品工坊] 编号={} 忽略过期恢复操作 action={}", fault.id, action); return;
        }
        LoggerFactory.getLogger("CAD-Editor").info("[物品工坊] 编号={} 用户选择={} preview={}；不会自动应用修改", fault.id, action == 0 ? fault.preview ? "返回编辑" : "延长等待并重新加载" : action == 1 ? "复制诊断" : "强制退出编辑器", fault.preview);
        if (action == 1) {
            try { Minecraft.getInstance().keyboardHandler.setClipboard(fault.detail); fault.copied = true; }
            catch (RuntimeException error) { dev.rinorsi.editor.EditorDiagnostics.failure("page.recovery.clipboard", fault.id, error); }
            return;
        }
        if (action == 0 && fault.retry) {
            if (fault.preview) { FAULTS.remove(driver); return; }
            EXTENDED.put(driver, true); FAULTS.remove(driver);
            try { driver.reload(); } catch (RuntimeException error) { failed(driver, "重新加载失败", error); }
        } else driver.owner().closeDocument();
    }
    private static Component styled(String text) { return Component.literal(text).setStyle(FONT); }
    private static void text(GuiGraphicsExtractor g, net.minecraft.util.FormattedCharSequence line, int x, int y, int color) {
        g.pose().pushMatrix();
        g.pose().translate(x, y).scale(TEXT_SCALE);
        McGui.text(g, Minecraft.getInstance().font, line, 0, 0, color, false);
        g.pose().popMatrix();
    }
    /** Reuse the editor's actual Ore nine-slice assets, independently of its stopped scripts. */
    private static void texture(GuiGraphicsExtractor g, String name, int x, int y, int w, int h, boolean button) {
        int tw = button ? 12 : 8, th = button ? 16 : 8, bottom = button ? 4 : 2;
        int[] xs = { x, x + 2, x + w - 2, x + w }, ys = { y, y + 2, y + h - bottom, y + h };
        float[] us = { 0, 2f / tw, 1 - 2f / tw, 1 }, vs = { 0, 2f / th, 1 - (float) bottom / th, 1 };
        var gui = new McGui(g); var id = Identifier.parse("oriel:textures/ore/" + name + ".png");
        for (int row = 0; row < 3; row++) for (int col = 0; col < 3; col++) {
            var a = g.pose().transformPosition(xs[col], ys[row], new Vector2f());
            var b = g.pose().transformPosition(xs[col + 1], ys[row + 1], new Vector2f());
            int left = (int) Math.floor(a.x), top = (int) Math.floor(a.y);
            var bounds = new ScreenRectangle(left, top, Math.max(1, (int) Math.ceil(b.x) - left), Math.max(1, (int) Math.ceil(b.y) - top));
            gui.blit(g.pose(), id, false, xs[col], ys[row], xs[col + 1], ys[row + 1], us[col], vs[row], us[col + 1], vs[row + 1], 0xFFFFFFFF, bounds, gui.scissor());
        }
    }
    private record Box(int x, int y, int width, int height, int action) {
        boolean contains(double px, double py) { return px >= x && px < x + width && py >= y && py < y + height; }
    }
    private static final class Fault {
        final String id, summary, location, detail; final boolean retry, light, preview;
        final List<Box> buttons = new ArrayList<>(); int focus; boolean copied;
        Fault(String id, String summary, String location, String detail, boolean retry, boolean light, boolean preview) { this.id = id; this.summary = summary; this.location = location; this.detail = detail; this.retry = retry; this.light = light; this.preview = preview; }
    }
}
