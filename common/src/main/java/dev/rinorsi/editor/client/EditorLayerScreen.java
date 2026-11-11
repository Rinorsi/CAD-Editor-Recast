package dev.rinorsi.editor.client;

import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.EditorWriteLog;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;

/** Modal Editor layer over the exact inventory instance; the menu stays open. */
public final class EditorLayerScreen extends OrielScreen {
    private static Screen suspending;
    private final AbstractContainerScreen<?> parent;
    private final Object player, level, connection, menu;
    private boolean returning;

    EditorLayerScreen(String page, AbstractContainerScreen<?> parent) {
        super(page, null, -1);
        this.parent = parent;
        var mc = Minecraft.getInstance();
        player = mc.player; level = mc.level; connection = mc.getConnection();
        menu = mc.player.containerMenu;
    }

    void show() {
        var mc = Minecraft.getInstance();
        if (mc.gui.screen() != parent) throw new IllegalStateException("打开编辑器前背包界面已改变");
        suspending = parent;
        try { mc.gui.setScreen(this); }
        finally { suspending = null; }
        EditorWriteLog.event("client.screen.suspended", "-", "parent="+parent.getClass().getName()+" menu_preserved=true");
    }

    /** Called only at vanilla's Screen.removed dispatch, during our synchronous push. */
    public static void removeForTransition(Screen previous) {
        if (previous != suspending) previous.removed();
    }

    private boolean sameSession() {
        var mc = Minecraft.getInstance();
        return mc.player == player && mc.level == level && mc.getConnection() == connection
                && mc.player != null && mc.player.containerMenu == menu;
    }

    boolean keepsMenu() { return returning && sameSession(); }

    @Override protected void init() {
        if (parent.width != width || parent.height != height) parent.resize(width, height);
        super.init();
    }

    @Override public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
        if (sameSession()) { parent.extractRenderState(g, -10000, -10000, a); g.nextStratum(); }
        super.extractRenderState(g, mouseX, mouseY, a);
    }

    @Override public void tick() {
        if (!sameSession()) {
            EditorWriteLog.warning("client.screen.parent_stale", "-", "restore=false reason=player_world_connection_or_menu_changed");
            Minecraft.getInstance().gui.setScreen(null);
        }
    }

    @Override public void onClose() {
        returning = sameSession();
        EditorWriteLog.event("client.screen.return", "-", "restore="+returning);
        Minecraft.getInstance().gui.setScreen(returning ? parent : null);
    }

    @Override public void removed() {
        try { super.removed(); }
        finally { if (!returning) parent.removed(); }
    }
}
