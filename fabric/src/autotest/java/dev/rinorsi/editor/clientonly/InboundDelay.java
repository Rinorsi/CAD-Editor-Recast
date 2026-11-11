package dev.rinorsi.editor.clientonly;
import java.util.concurrent.ConcurrentLinkedQueue;
/** Test-only transport delay. Does not create/modify server packets or inventories. */
public final class InboundDelay {
    public static boolean hold;
    public static final ConcurrentLinkedQueue<Runnable> queued = new ConcurrentLinkedQueue<>();
    public static void release() { hold=false; Runnable task; while ((task=queued.poll()) != null) task.run(); }
}
