package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorSessions;

/** Client state machine, no prediction, chat parsing, retries or permission assumptions. */
public final class HotbarCommandSession {
    public record Context(Object connection, Object world, Object player, Object menu, int syncRevision, String fingerprint) {}
    public enum Outcome { WAITING, SAVED, CHANGED, UNKNOWN }
    private final Context opened;
    private final int index;
    private String baseline;
    private String expected;
    private String requestId;
    private int sentRevision;
    private long deadline;
    private boolean blocked;
    private boolean confirmed;

    public HotbarCommandSession(int index, Context opened) {
        HotbarCommandCodec.requireSlot(index);
        this.index = index;
        this.opened = opened;
        baseline = opened.fingerprint();
    }

    public int index() { return index; }
    public boolean pending() { return expected != null; }
    public String requestId() { return requestId; }
    public boolean confirmed() { return confirmed; }

    public void begin(Context current, String id, String nextFingerprint, long now) {
        if (blocked) EditorSessions.fail("session_stale", "本次会话已失效或结果未知，请关闭后重新读取物品；草稿已保留");
        if (pending()) EditorSessions.fail("request_pending", "上一笔修改尚未得到服务器同步，请勿重复提交");
        if (!sameContext(current) || !baseline.equals(current.fingerprint())) {
            blocked = true;
            EditorSessions.fail("item_changed", "连接、世界、会话或原物品已改变，请重新打开；草稿已保留");
        }
        if (baseline.equals(nextFingerprint)) EditorSessions.fail("no_changes", "物品没有变化，无需发送命令");
        if (id == null || id.isBlank()) EditorSessions.fail("invalid_request", "修改请求缺少有效标识");
        requestId = id;
        confirmed = false;
        expected = nextFingerprint;
        sentRevision = current.syncRevision();
        deadline = now + 10_000_000_000L;
    }

    public Outcome observe(Context current, String activeRequestId, long now) {
        if (!pending()) {
            if (!sameContext(current) || !baseline.equals(current.fingerprint())) blocked = true;
            return Outcome.WAITING;
        }
        if (!requestId.equals(activeRequestId)) return stop(Outcome.UNKNOWN);
        if (!sameContext(current)) return stop(Outcome.UNKNOWN);
        if (now >= deadline) return stop(Outcome.UNKNOWN);
        // ItemCommands broadcasts its menu changes. A match without a new server
        // menu state is insufficient: a local value alone never confirms a save.
        if (current.syncRevision() != sentRevision && expected.equals(current.fingerprint())) {
            baseline = expected;
            expected = null;
            confirmed = true;
            return Outcome.SAVED;
        }
        if (!baseline.equals(current.fingerprint()) && !expected.equals(current.fingerprint()))
            return stop(Outcome.CHANGED);
        return Outcome.WAITING;
    }

    public void invalidate() { blocked = true; expected = null; }
    private Outcome stop(Outcome result) { invalidate(); return result; }
    private boolean sameContext(Context current) {
        return current != null && current.connection() == opened.connection() && current.world() == opened.world()
                && current.player() == opened.player() && current.menu() == opened.menu();
    }
}
