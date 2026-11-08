package dev.rinorsi.editor.client;

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

/** One page-owned preview channel. Pause/resume preserves the audio position. */
public final class EditorSoundPreview {
    private final Consumer<JsonObject> reply;
    private final Audio audio;
    private final LongSupplier clock;
    private boolean current;
    private String id = "";
    private boolean paused;
    private int age;
    private long lastStart;

    public EditorSoundPreview(Consumer<JsonObject> reply) { this(reply, new MinecraftAudio(), System::nanoTime); }
    EditorSoundPreview(Consumer<JsonObject> reply, Audio audio, LongSupplier clock) { this.reply = reply; this.audio = audio; this.clock = clock; }
    interface Audio {
        boolean contains(Identifier id);
        boolean start(Identifier id, float volume, float pitch);
        boolean active();
        void pause(boolean paused);
        void stop();
    }

    public void accept(JsonElement value) {
        if (value == null || !value.isJsonObject()) return;
        JsonObject request = value.getAsJsonObject();
        try {
            String action = request.has("action") ? request.get("action").getAsString() : "toggle";
            if (action.equals("stop")) { stop(); return; }
            String next = request.has("id") ? request.get("id").getAsString() : id;
            Identifier key = Identifier.tryParse(next);
            if (key == null || next.length() > 256) throw new IllegalArgumentException("无效的声音 ID");
            if (!action.equals("toggle")) throw new IllegalArgumentException("未知试听操作");
            if (current && next.equals(id) && audio.active()) {
                paused = !paused; audio.pause(paused);
                publish(paused ? "paused" : "playing", null);
                return;
            }
            long now = clock.getAsLong();
            if (now - lastStart < 125_000_000L) { publish(paused ? "paused" : current ? "playing" : "stopped", null); return; }
            float volume = number(request, "volume", 1, 0, 1);
            float pitch = number(request, "pitch", 1, 0.5F, 2);
            if (!audio.contains(key)) throw new IllegalArgumentException("游戏没有这个声音事件：" + next);
            stop();
            id = next; paused = false; age = 0; lastStart = now;
            current = audio.start(key, volume, pitch);
            if (!current) {
                publish("error", "声音未能播放，请检查客户端音量与声音资源");
            } else publish("playing", null);
        } catch (RuntimeException error) { publish("error", error.getMessage()); }
    }

    private static float number(JsonObject request, String key, float fallback, float min, float max) {
        float value = request.has(key) ? request.get(key).getAsFloat() : fallback;
        if (!Float.isFinite(value)) throw new IllegalArgumentException("无效的试听参数");
        return Math.clamp(value, min, max);
    }

    public void tick() {
        if (!current) return;
        if (++age > 20 && !audio.active()) { current = false; paused = false; publish("stopped", null); }
        else if (paused) {
            // Loading a streamed sound is asynchronous; also hold its channel paused after load.
            audio.pause(true);
        }
    }

    public void stop() {
        if (current) audio.stop();
        current = false; paused = false;
        publish("stopped", null);
    }

    private void publish(String state, String error) {
        JsonObject data = new JsonObject(); data.addProperty("id", id); data.addProperty("state", state);
        if (error != null) data.addProperty("error", error);
        reply.accept(data);
    }

    private static final class MinecraftAudio implements Audio {
        private SoundInstance instance;
        public boolean contains(Identifier id) { return Minecraft.getInstance().getSoundManager().getSoundEvent(id) != null; }
        public boolean start(Identifier id, float volume, float pitch) {
            instance = new SimpleSoundInstance(id, SoundSource.UI, volume, pitch, SoundInstance.createUnseededRandom(),
                    false, 0, SoundInstance.Attenuation.NONE, 0, 0, 0, true);
            return Minecraft.getInstance().getSoundManager().play(instance) != SoundEngine.PlayResult.NOT_STARTED;
        }
        public boolean active() { return instance != null && Minecraft.getInstance().getSoundManager().isActive(instance); }
        public void pause(boolean paused) {
            var manager = Minecraft.getInstance().getSoundManager();
            var handle = manager.soundEngine.instanceToChannel.get(instance);
            if (handle != null) handle.execute(paused ? Channel::pause : Channel::unpause);
        }
        public void stop() {
            if (instance != null) Minecraft.getInstance().getSoundManager().stop(instance);
            instance = null;
        }
    }
}
