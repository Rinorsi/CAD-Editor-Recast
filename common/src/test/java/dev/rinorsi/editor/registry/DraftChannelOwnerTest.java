package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.engine.dom.Document;
import dev.oriel.engine.host.*;
import dev.oriel.engine.script.*;
import java.nio.file.*;

/** Actual Oriel send callback reentry + production DraftChannel document ownership checks. No game. */
public final class DraftChannelOwnerTest {
    private static int checks;
    private static void check(boolean ok, String name) { if (!ok) throw new AssertionError(name); checks++; System.out.println("PASS " + name); }
    private static void reject(Runnable run, String name) { try { run.run(); } catch (RuntimeException expected) { check(true, name); return; } throw new AssertionError(name); }
    public static void main(String[] args) throws Exception {
        var channel = new DraftChannel(); Document[] current = {null}; JsonObject[] result = {null};
        var host = new Host() {
            public FontMetrics fonts() { return (text, font) -> text.length() * 6; }
            public String loadText(String path) { return ""; }
            public ScriptRuntime createScriptRuntime(Document doc) { return new RhinoRuntimeProvider().create(doc); }
            public boolean send(String topic, String text) {
                var output = new JsonObject(); channel.requireOwner(current[0], JsonParser.parseString(text).getAsJsonObject(), output); result[0] = output; return true;
            }
        };
        String production = Files.readString(Path.of(args[0]).resolve("common/src/main/resources/assets/cadeditor/ui/js/drafts.js"));
        current[0] = Document.parse(host, "test:owner-one", "<html><head><script>var booted=true;</script></head><body></body></html>");
        current[0].scripts().evaluate(production, "production-drafts");
        current[0].scripts().evaluate("oriel.send('drafts',{writer:Drafts.writer,seq:1});", "first-send");
        var old = result[0].deepCopy();
        check(old.get("seq").getAsInt() == 1 && old.get("writer").getAsString().startsWith("draft-"), "real Host.send can read current Drafts.writer reentrantly");
        check(JsonParser.parseString(current[0].scripts().evaluateToJson("Drafts.writer", "after-reentry")).getAsString().equals(old.get("writer").getAsString()), "nested owner evaluation leaves outer Rhino context intact");
        current[0].scripts().evaluate("oriel.send('drafts',{writer:Drafts.writer,seq:2});", "second-send");
        check(result[0].get("seq").getAsInt() == 2, "later mutation preserves owner");
        current[0].close(); current[0] = null;
        reject(() -> channel.requireOwner(current[0], old, new JsonObject()), "message after close rejected");
        current[0] = Document.parse(host, "test:owner-two", "<html><head><script>var booted=true;</script></head><body></body></html>");
        current[0].scripts().evaluate(production + ";Drafts.writer+='-replacement';", "replacement-drafts");
        reject(() -> channel.requireOwner(current[0], old, new JsonObject()), "old Document writer rejected after reload");
        current[0].scripts().evaluate("oriel.send('drafts',{writer:Drafts.writer,seq:1});", "replacement-first-send");
        check(result[0].get("seq").getAsInt() == 1, "replacement document legitimately restarts its sequence");
        var invalid = result[0].deepCopy(); invalid.addProperty("seq", 0); reject(() -> channel.requireOwner(current[0], invalid, new JsonObject()), "zero sequence rejected");
        invalid.addProperty("seq", 1.5); reject(() -> channel.requireOwner(current[0], invalid, new JsonObject()), "fractional sequence rejected");
        invalid.addProperty("seq", 9_007_199_254_740_992L); reject(() -> channel.requireOwner(current[0], invalid, new JsonObject()), "unsafe JSON sequence rejected");
        invalid.addProperty("seq", "1"); reject(() -> channel.requireOwner(current[0], invalid, new JsonObject()), "coerced string sequence rejected");
        invalid.remove("seq"); reject(() -> channel.requireOwner(current[0], invalid, new JsonObject()), "missing sequence rejected");
        current[0].close();
        System.out.println("PASS DraftChannelOwnerTest " + checks + " checks, real Oriel no game");
    }
}
