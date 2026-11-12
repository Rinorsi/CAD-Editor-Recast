package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import javax.sound.sampled.AudioFormat;
import net.minecraft.client.sounds.AudioStream;
import org.lwjgl.stb.STBVorbis;
import org.lwjgl.stb.STBVorbisInfo;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;

/** A bounded compressed Ogg, decoded incrementally only on the owning sound executor. */
final class EditorSeekableSoundStream implements AudioStream {
    private ByteBuffer encoded;
    private long decoder;
    private final AudioFormat format;

    EditorSeekableSoundStream(byte[] bytes, double seconds) throws IOException {
        encoded = MemoryUtil.memAlloc(bytes.length);
        try (var stack = MemoryStack.stackPush()) {
            encoded.put(bytes).flip();
            var error = stack.mallocInt(1);
            decoder = STBVorbis.stb_vorbis_open_memory(encoded, error, null);
            if (decoder == 0) throw new IOException(EditorI18n.tr("cadeditor.message.editorseekablesoundstream.291939767a", (error.get(0))));
            var info = STBVorbis.stb_vorbis_get_info(decoder, STBVorbisInfo.malloc(stack));
            if (info.channels() < 1 || info.channels() > 2 || info.sample_rate() <= 0)
                throw new IOException(EditorI18n.tr("cadeditor.message.editorseekablesoundstream.c3be4689db"));
            format = new AudioFormat(info.sample_rate(), 16, info.channels(), true, false);
            double sample = seconds * info.sample_rate();
            if (sample > Integer.MAX_VALUE || !STBVorbis.stb_vorbis_seek(decoder, (int) sample))
                throw new IOException(EditorI18n.tr("cadeditor.message.editorseekablesoundstream.177ff033d7"));
        } catch (IOException | RuntimeException | Error error) {
            close(); throw error;
        }
    }

    @Override public AudioFormat getFormat() { return format; }

    @Override public ByteBuffer read(int expectedSize) throws IOException {
        if (decoder == 0) throw new IOException(EditorI18n.tr("cadeditor.message.editorseekablesoundstream.59b4c898a4"));
        // SoundBuffer transfers the PCM to OpenAL without freeing native allocations;
        // a GC-owned direct buffer follows the vanilla AudioStream ownership contract.
        ByteBuffer pcm = ByteBuffer.allocateDirect(expectedSize).order(ByteOrder.LITTLE_ENDIAN);
        int frames = STBVorbis.stb_vorbis_get_samples_short_interleaved(decoder, format.getChannels(), pcm.asShortBuffer());
        if (frames == 0) return null;
        pcm.limit(frames * format.getChannels() * 2);
        return pcm;
    }

    @Override public void close() {
        if (decoder != 0) { STBVorbis.stb_vorbis_close(decoder); decoder = 0; }
        if (encoded != null) { MemoryUtil.memFree(encoded); encoded = null; }
    }
}
