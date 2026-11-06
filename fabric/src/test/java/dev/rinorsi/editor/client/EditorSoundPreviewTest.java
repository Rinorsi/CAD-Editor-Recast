package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/** State-machine test; uses no game window or audio device. */
public final class EditorSoundPreviewTest {
    private static final class FakeAudio implements EditorSoundPreview.Audio {
        boolean active, paused; int starts, stops; String id;
        final List<String> calls = new ArrayList<>();
        public boolean contains(Identifier id) { return !id.getPath().equals("missing"); }
        public boolean start(Identifier id, float volume, float pitch) {
            check(!active, "previous preview must stop before a new start");
            this.id = id.toString(); starts++; active = true; paused = false; calls.add("start"); return true;
        }
        public boolean active() { return active; }
        public void pause(boolean value) { paused = value; calls.add(value ? "pause" : "resume"); }
        public void stop() { stops++; active = false; calls.add("stop"); }
    }
    private static void check(boolean ok, String reason) { if (!ok) throw new AssertionError(reason); }
    private static JsonObject toggle(String id) { var o = new JsonObject(); o.addProperty("id", id); o.addProperty("action", "toggle"); return o; }
    public static void main(String[] args) {
        var audio = new FakeAudio(); var receipts = new ArrayList<JsonObject>(); long[] clock = {1_000_000_000L};
        var preview = new EditorSoundPreview(receipts::add, audio, () -> clock[0]);
        preview.accept(toggle("minecraft:first")); check(audio.starts == 1, "starts first");
        for (int i = 0; i < 20 * 240; i++) preview.tick();
        check(audio.active && audio.starts == 1 && receipts.getLast().get("state").getAsString().equals("playing"), "four-minute preview has no host time cap");
        preview.accept(toggle("minecraft:first")); check(audio.paused && audio.starts == 1, "pause must preserve position");
        for (int i = 0; i < 20 * 60; i++) preview.tick();
        check(audio.active && audio.paused && audio.starts == 1, "long pause keeps the original channel");
        preview.accept(toggle("minecraft:first")); check(!audio.paused && audio.starts == 1, "resume must not restart");
        clock[0] += 200_000_000L; preview.accept(toggle("minecraft:second"));
        check(audio.starts == 2 && audio.stops == 1, "switch uses one channel");
        clock[0] += 200_000_000L; preview.accept(toggle("minecraft:missing"));
        check(audio.active && audio.id.equals("minecraft:second"), "invalid id preserves current preview");
        check(receipts.getLast().get("state").getAsString().equals("error"), "error receipt");
        preview.accept(toggle("minecraft:second")); preview.tick(); check(audio.paused, "paused tick stays paused");
        preview.stop(); check(!audio.active, "page close stops its preview");
        clock[0] += 200_000_000L; preview.accept(toggle("minecraft:third")); audio.active = false;
        for (int i = 0; i < 21; i++) preview.tick();
        check(receipts.getLast().get("state").getAsString().equals("stopped"), "natural completion resets controls");
        preview.accept(null);
        System.out.println("PASS sound preview: single channel, pause/resume without restart, invalid ID isolation, page close, completion.");
    }
}
