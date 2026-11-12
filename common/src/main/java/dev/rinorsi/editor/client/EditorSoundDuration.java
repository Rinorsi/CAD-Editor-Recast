package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import dev.rinorsi.editor.EditorDiagnostics;
import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import org.lwjgl.stb.STBVorbis;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;

/** Inspect the resolved resource-pack Ogg, never the one-second OpenAL stream buffer. */
final class EditorSoundDuration {
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    private static final java.util.concurrent.ExecutorService IO = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(2), work -> {
        var thread = new Thread(work, "CAD-Editor-Sound-Metadata"); thread.setDaemon(true); return thread;
    }, new ThreadPoolExecutor.DiscardOldestPolicy());
    record Clip(byte[] encoded, double seconds) {}
    private EditorSoundDuration() {}

    static void read(Resource resource, Identifier path, BooleanSupplier current, Consumer<Clip> accept, Consumer<String> failed) {
        IO.execute(() -> {
            if (!current.getAsBoolean()) return;
            try (var input = resource.open()) {
                byte[] bytes = input.readNBytes(MAX_BYTES + 1);
                if (!current.getAsBoolean()) return;
                if (bytes.length > MAX_BYTES) throw new IOException(EditorI18n.tr("cadeditor.message.editorsoundduration.95d89a1d2c"));
                var encoded = MemoryUtil.memAlloc(bytes.length);
                try (var stack = MemoryStack.stackPush()) {
                    encoded.put(bytes).flip();
                    var error = stack.mallocInt(1);
                    long decoder = STBVorbis.stb_vorbis_open_memory(encoded, error, null);
                    if (decoder == 0) throw new IOException(EditorI18n.tr("cadeditor.message.editorsoundduration.eb103f1236", (error.get(0))));
                    try {
                        double seconds = STBVorbis.stb_vorbis_stream_length_in_seconds(decoder);
                        if (!Double.isFinite(seconds) || seconds <= 0) throw new IOException(EditorI18n.tr("cadeditor.message.editorsoundduration.5a7c717988"));
                        if (current.getAsBoolean()) accept.accept(new Clip(bytes, seconds));
                    } finally { STBVorbis.stb_vorbis_close(decoder); }
                } finally { MemoryUtil.memFree(encoded); }
            } catch (IOException | RuntimeException error) {
                if (current.getAsBoolean()) {
                    EditorDiagnostics.warning("sound.preview.duration", "resource=" + path + " pack=" + resource.sourcePackId(), error);
                    failed.accept(EditorI18n.tr("cadeditor.message.editorsoundduration.ac154eb788"));
                }
            }
        });
    }
}
