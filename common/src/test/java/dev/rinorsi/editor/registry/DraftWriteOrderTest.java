package dev.rinorsi.editor.registry;

/** Pure production write-watermark regression, no game or fabricated saved receipts. */
public final class DraftWriteOrderTest {
    private static int checks;
    private static void check(boolean value, String name) { if (!value) throw new AssertionError(name); checks++; System.out.println("PASS " + name); }
    private static void rejected(Runnable action, String name) { try { action.run(); } catch (IllegalArgumentException expected) { check(true, name); return; } throw new AssertionError(name); }
    public static void main(String[] args) {
        var order = new DraftWriteOrder();
        check(!order.duplicate("slot0", 1, "put:A"), "first put is new"); order.commit("slot0", 1, "put:A");
        check(order.duplicate("slot0", 1, "put:A"), "same put receipt is idempotent");
        rejected(() -> order.duplicate("slot0", 1, "put:B"), "same version changed content rejected");
        check(!order.duplicate("slot0", 2, "begin:u:16000"), "new upload supersedes put"); order.commit("slot0", 2, "begin:u:16000");
        order.require("slot0", 2); check(true, "current upload chunks permitted");
        order.commit("slot0", 3, "clear");
        rejected(() -> order.require("slot0", 2), "old chunks cannot resurrect clear");
        rejected(() -> order.duplicate("slot0", 2, "begin:u:16000"), "delayed begin cannot resurrect clear");
        rejected(() -> order.duplicate("slot0", 1, "put:A"), "delayed put cannot resurrect clear");
        check(order.duplicate("slot0", 3, "clear"), "repeated clear is idempotent");
        rejected(() -> order.duplicate("slot0", 3, "put:C"), "same-version put cannot cross clear barrier");
        check(!order.duplicate("world|other|target", 1, "begin:world:100"), "other world has independent watermark");
        order.commit("world|other|target", 1, "begin:world:100");
        order.commit("slot0", 4, "put:C");
        rejected(() -> order.duplicate("slot0", 3, "clear"), "late clear cannot delete post-save edit");
        order.require("world|other|target", 1); check(true, "item save does not cancel other world upload");
        check(order.duplicate("slot0", 4, "put:C"), "post-save edit stays latest");
        System.out.println("PASS DraftWriteOrderTest " + checks + " checks");
    }
}
