package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.audio.Channel;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.client.sounds.SoundEngine;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundSource;

/** One page-owned preview channel. Playing after a pause always starts a new sound. */
public final class EditorSoundPreview {
    private final Consumer<JsonObject> reply;
    private final Audio audio;
    private final LongSupplier clock;
    private boolean current;
    private String id = "";
    private boolean paused;
    private int age;
    private long lastStart;
    private float volume = 1, pitch = 1;

    public EditorSoundPreview(Consumer<JsonObject> reply) { this(reply, new MinecraftAudio(), System::nanoTime); }
    EditorSoundPreview(Consumer<JsonObject> reply, Audio audio, LongSupplier clock) { this.reply = reply; this.audio = audio; this.clock = clock; }
    interface Audio {
        boolean contains(Identifier id);
        boolean start(Identifier id, float volume, float pitch);
        boolean active();
        void pause(boolean paused);
        void stop();
        default Progress progress() { return new Progress(0, 0, false); }
        default boolean seekable() { return false; }
        default void seek(double seconds, boolean paused) { throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.aa5d96bf53")); }
        default String failure() { return null; }
        default String progressError() { return null; }
    }
    record Progress(double seconds, double duration, boolean ready) {}

    public void accept(JsonElement value) {
        if (value == null || !value.isJsonObject()) return;
        JsonObject request = value.getAsJsonObject();
        try {
            String action = request.has("action") ? request.get("action").getAsString() : "toggle";
            if (action.equals("stop")) { stop(); return; }
            String next = request.has("id") ? request.get("id").getAsString() : id;
            Identifier key = Identifier.tryParse(next);
            if (key == null || next.length() > 256) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.575b195a2f"));
            if (action.equals("seek")) {
                if (!current || !next.equals(id) || !audio.seekable()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.fa7439a168"));
                double position = request.has("position") ? request.get("position").getAsDouble() : Double.NaN;
                if (!Double.isFinite(position) || position < 0) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.554f5dc87a"));
                audio.seek(Math.clamp(position, 0, Math.max(0, audio.progress().duration() - 0.001)), paused);
                return;
            }
            if (!action.equals("toggle") && !action.equals("play")) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.9d1eebde6f"));
            if (action.equals("toggle") && current && next.equals(id) && audio.active() && !paused) {
                paused = true; audio.pause(true);
                publish("paused", null);
                return;
            }
            long now = clock.getAsLong();
            if (!paused && lastStart != 0 && now - lastStart < 125_000_000L) { publish(current ? "playing" : "stopped", null); return; }
            float volume = number(request, "volume", next.equals(id) ? this.volume : 1, 0, 1);
            float pitch = number(request, "pitch", next.equals(id) ? this.pitch : 1, 0.5F, 2);
            if (!audio.contains(key)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.ca3cbaa0bd", (next)));
            stop();
            id = next; paused = false; age = 0; lastStart = now;
            this.volume = volume; this.pitch = pitch;
            current = audio.start(key, volume, pitch);
            if (!current) {
                fail(audio.failure() == null ? EditorI18n.tr("cadeditor.message.editorsoundpreview.53d3696897") : audio.failure());
            } else publish("playing", null);
        } catch (RuntimeException error) {
            dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview", "sound=" + (request.has("id") ? request.get("id") : id), error);
            if (!current) audio.stop();
            publish(current ? (paused ? "paused" : "playing") : "error", error.getMessage());
        }
    }

    private static float number(JsonObject request, String key, float fallback, float min, float max) {
        float value = request.has(key) ? request.get(key).getAsFloat() : fallback;
        if (!Float.isFinite(value)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.4bcb2bf2d0"));
        return Math.clamp(value, min, max);
    }

    public void tick() {
        if (!current) return;
        if (audio.failure() != null) { fail(audio.failure()); return; }
        if (++age > 20 && !audio.active()) { current = false; paused = false; publish("stopped", null); }
        else if (paused) {
            // Loading a streamed sound is asynchronous; also hold its channel paused after load.
            audio.pause(true);
        }
        if (current && age % 5 == 0) publish(paused ? "paused" : "playing", null);
    }

    public void stop() {
        audio.stop();
        current = false; paused = false;
        publish("stopped", null);
    }

    private void fail(String message) {
        dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview", "sound=" + id, new IllegalStateException(message));
        audio.stop(); current = false; paused = false;
        publish("error", message);
    }

    private void publish(String state, String error) {
        JsonObject data = new JsonObject(); data.addProperty("id", id); data.addProperty("state", state);
        var progress = audio.progress();
        data.addProperty("position", progress.seconds());
        data.addProperty("duration", progress.duration());
        data.addProperty("ready", progress.ready());
        data.addProperty("seekable", current && audio.seekable());
        if (audio.progressError() != null) data.addProperty("progressError", audio.progressError());
        if (error != null) data.addProperty("error", error);
        reply.accept(data);
    }

    private static final class MinecraftAudio implements Audio {
        private volatile Session session;
        private static final class Session {
            final SoundInstance instance;
            final long loadingAt = System.nanoTime();
            volatile Progress progress = new Progress(0, 0, false);
            volatile EditorSoundDuration.Clip clip;
            volatile boolean sampling, paused;
            volatile int seekVersion;
            volatile String failure;
            volatile String progressError;
            String context;
            // Only the sound executor reads/writes these counters.
            long sampledAt;
            double elapsed;
            boolean wasPlaying;
            Session(SoundInstance instance) { this.instance = instance; context = "sound=" + instance.getIdentifier(); }
        }
        public boolean contains(Identifier id) { return Minecraft.getInstance().getSoundManager().getSoundEvent(id) != null; }
        public boolean start(Identifier id, float volume, float pitch) {
            var client = Minecraft.getInstance();
            var manager = client.getSoundManager();
            var next = new Session(new SimpleSoundInstance(id, SoundSource.UI, volume, pitch, SoundInstance.createUnseededRandom(),
                    false, 0, SoundInstance.Attenuation.NONE, 0, 0, 0, true));
            session = next;
            var result = manager.play(next.instance);
            var sound = next.instance.getSound();
            if (sound == net.minecraft.client.sounds.SoundManager.INTENTIONALLY_EMPTY_SOUND)
                next.failure = EditorI18n.tr("cadeditor.message.editorsoundpreview.7c23a43a30");
            else if (sound == net.minecraft.client.sounds.SoundManager.EMPTY_SOUND)
                next.failure = EditorI18n.tr("cadeditor.message.editorsoundpreview.a906c5a95a");
            else if (result == SoundEngine.PlayResult.NOT_STARTED) {
                next.failure = volume == 0 || client.options.getFinalSoundSourceVolume(SoundSource.UI) == 0
                        ? EditorI18n.tr("cadeditor.message.editorsoundpreview.8cad328c3d")
                        : EditorI18n.tr("cadeditor.message.editorsoundpreview.cccb1309aa");
            }
            if (sound != null) next.context += " resource=" + sound.getPath();
            if (next.failure != null) {
                dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview.start", next.context, new IllegalStateException(next.failure));
                return false;
            }
            if (sound != null) {
                var resource = client.getResourceManager().getResource(sound.getPath());
                if (resource.isEmpty()) {
                    next.failure = EditorI18n.tr("cadeditor.message.editorsoundpreview.5aca4ff84c", (sound.getPath()));
                    dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview.resource", next.context, new IllegalStateException(next.failure));
                    return false;
                }
                next.context += " pack=" + resource.get().sourcePackId();
                if (sound.shouldStream()) EditorSoundDuration.read(resource.get(), sound.getPath(), () -> session == next,
                        clip -> { if (session == next) next.clip = clip; },
                        message -> { if (session == next) next.progressError = message; });
            }
            return true;
        }
        public String failure() {
            var s = session;
            if (s == null) return null;
            if (s.failure == null && !s.progress.ready() && System.nanoTime() - s.loadingAt > 10_000_000_000L) {
                s.failure = EditorI18n.tr("cadeditor.message.editorsoundpreview.0eb3e9b7b0");
                dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview.load", s.context, new IllegalStateException(s.failure));
            }
            return s.failure;
        }
        public String progressError() { var s = session; return s == null ? null : s.progressError; }
        public boolean active() {
            var s = session;
            return s != null && Minecraft.getInstance().getSoundManager().isActive(s.instance);
        }
        public void pause(boolean paused) {
            var s = session; if (s == null) return;
            s.paused = paused;
            var handle = Minecraft.getInstance().getSoundManager().soundEngine.instanceToChannel.get(s.instance);
            if (handle != null) handle.execute(channel -> { if (session == s) { if (s.paused) channel.pause(); else channel.unpause(); } });
        }
        public void stop() {
            var s = session; session = null;
            if (s != null) Minecraft.getInstance().getSoundManager().stop(s.instance);
        }
        public boolean seekable() {
            var s = session;
            return s != null && s.progress.ready() && s.progress.duration() > 0
                    && (s.instance.getSound() == null || !s.instance.getSound().shouldStream() || s.clip != null);
        }
        public void seek(double seconds, boolean paused) {
            var s = session;
            if (s == null || !seekable()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.be79e2de1f"));
            var handle = Minecraft.getInstance().getSoundManager().soundEngine.instanceToChannel.get(s.instance);
            if (handle == null || handle.isStopped()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorsoundpreview.360e390430"));
            int version = ++s.seekVersion;
            s.paused = paused;
            handle.execute(channel -> {
                if (session != s || s.seekVersion != version) return;
                var access = (dev.rinorsi.editor.mixin.client.EditorAudioChannelAccessor) (Object) channel;
                int source = access.cadeditor$source();
                int state = org.lwjgl.openal.AL10.alGetSourcei(source, org.lwjgl.openal.AL10.AL_SOURCE_STATE);
                if (state != org.lwjgl.openal.AL10.AL_PLAYING && state != org.lwjgl.openal.AL10.AL_PAUSED) return;
                EditorSeekableSoundStream replacement = null;
                try {
                    boolean streaming = s.instance.getSound().shouldStream();
                    if (streaming) {
                        // Allocate inside this callback: a released handle never invokes it,
                        // so neither stopped channels nor superseded requests leak a decoder.
                        replacement = new EditorSeekableSoundStream(s.clip.encoded(), seconds);
                        if (session != s || s.seekVersion != version) return;
                        channel.stop();
                        var old = access.cadeditor$stream();
                        access.cadeditor$stream(null);
                        access.cadeditor$removeProcessedBuffers();
                        if (old != null) old.close();
                        channel.attachBufferStream(replacement);
                        replacement = null; // Channel.destroy owns it from here.
                        channel.play();
                        if (s.paused) channel.pause();
                    } else {
                        org.lwjgl.openal.AL10.alSourcef(source, org.lwjgl.openal.AL11.AL_SEC_OFFSET, (float) seconds);
                    }
                    int error = org.lwjgl.openal.AL10.alGetError();
                    if (error != org.lwjgl.openal.AL10.AL_NO_ERROR) throw new IllegalStateException(EditorI18n.tr("cadeditor.message.editorsoundpreview.1084d4fcf3", (error)));
                    s.elapsed = seconds; s.sampledAt = System.nanoTime(); s.wasPlaying = !s.paused;
                    s.progress = new Progress(seconds, s.progress.duration(), true);
                } catch (java.io.IOException | RuntimeException error) {
                    dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview.seek", s.context + " position=" + seconds, error);
                    if (session == s) s.failure = EditorI18n.tr("cadeditor.message.editorsoundpreview.36c05629c4");
                } finally { if (replacement != null) replacement.close(); }
            });
        }
        public Progress progress() {
            var s = session;
            if (s == null) return new Progress(0, 0, false);
            var handle = Minecraft.getInstance().getSoundManager().soundEngine.instanceToChannel.get(s.instance);
            if (handle != null && !handle.isStopped() && !s.sampling) {
                s.sampling = true;
                handle.execute(channel -> {
                    try {
                        if (session != s) return;
                        int source = ((dev.rinorsi.editor.mixin.client.EditorAudioChannelAccessor) (Object) channel).cadeditor$source();
                        int state = org.lwjgl.openal.AL10.alGetSourcei(source, org.lwjgl.openal.AL10.AL_SOURCE_STATE);
                        if (state != org.lwjgl.openal.AL10.AL_PLAYING && state != org.lwjgl.openal.AL10.AL_PAUSED) return;
                        double offset = org.lwjgl.openal.AL10.alGetSourcef(source, org.lwjgl.openal.AL11.AL_SEC_OFFSET);
                        boolean streaming = s.instance.getSound() != null && s.instance.getSound().shouldStream();
                        double duration = streaming ? (s.clip == null ? 0 : s.clip.seconds()) : 0;
                        if (!streaming) {
                            int buffer = org.lwjgl.openal.AL10.alGetSourcei(source, org.lwjgl.openal.AL10.AL_BUFFER);
                            if (buffer != 0) {
                                int bytes = org.lwjgl.openal.AL10.alGetBufferi(buffer, org.lwjgl.openal.AL10.AL_SIZE);
                                int bits = org.lwjgl.openal.AL10.alGetBufferi(buffer, org.lwjgl.openal.AL10.AL_BITS);
                                int channels = org.lwjgl.openal.AL10.alGetBufferi(buffer, org.lwjgl.openal.AL10.AL_CHANNELS);
                                int frequency = org.lwjgl.openal.AL10.alGetBufferi(buffer, org.lwjgl.openal.AL10.AL_FREQUENCY);
                                if (bits > 0 && channels > 0 && frequency > 0) duration = bytes * 8.0 / bits / channels / frequency;
                            }
                        }
                        long now = System.nanoTime();
                        if (!s.progress.ready()) { s.elapsed = 0; s.sampledAt = now; s.wasPlaying = false; }
                        if (s.wasPlaying && state == org.lwjgl.openal.AL10.AL_PLAYING)
                            s.elapsed += (now - s.sampledAt) / 1_000_000_000.0 * org.lwjgl.openal.AL10.alGetSourcef(source, org.lwjgl.openal.AL10.AL_PITCH);
                        s.sampledAt = now; s.wasPlaying = state == org.lwjgl.openal.AL10.AL_PLAYING;
                        double position = streaming ? s.elapsed : offset;
                        s.progress = new Progress(duration > 0 ? Math.clamp(position, 0, duration) : position, duration, true);
                    } catch (RuntimeException error) {
                        dev.rinorsi.editor.EditorDiagnostics.warning("sound.preview.progress", s.context, error);
                    } finally { s.sampling = false; }
                });
            }
            return s.progress;
        }
    }
}
