package dev.rinorsi.editor.client;

import com.google.gson.*;
import dev.oriel.engine.dom.Document;
import dev.oriel.engine.host.*;
import dev.oriel.engine.script.*;
import java.nio.file.*;

/** Real Oriel pagehide + production item exporter + existing atomic prefs file, not Minecraft. */
public final class ItemDraftPersistenceTest {
    private static int checks;
    private static Path repo;
    private static final String KEY = "inventory:0:|minecraft:tadpole_bucket";
    private static void check(boolean value, String name) { if (!value) throw new AssertionError(name); checks++; System.out.println("PASS " + name); }
    private static final Host HOST = new Host() {
        public FontMetrics fonts() { return (text, font) -> text.length() * 6; }
        public String loadText(String path) { return ""; }
        public boolean send(String channel, String value) { return true; } // hold actual transport ACK until after close
        public ScriptRuntime createScriptRuntime(Document document) { return new RhinoRuntimeProvider().create(document); }
    };
    private static Document document() throws Exception {
        var doc = Document.parse(HOST, "test:item-drafts", "<html><head><script>var booted=true;</script></head><body></body></html>");
        doc.scripts().evaluate("Date.now=function(){return 1700000000000};function snbtStr(s){return JSON.stringify(s)};function snbtKey(k){return /^[A-Za-z0-9_.+-]+$/.test(k)?k:snbtStr(k)};", "format");
        for (String file : new String[]{"nbt.js", "drafts.js"}) doc.scripts().evaluate(Files.readString(repo.resolve("common/src/main/resources/assets/cadeditor/ui/js/" + file)), "production-" + file);
        doc.scripts().evaluate("var Prefs={host:true,vals:{drafts:{},worldDraftScope:'native-world'}},NestedItem=null,EditorBridge={pending:null};function fullId(id){return id.indexOf(':')<0?'minecraft:'+id:id};function snapOf(d){return nbtSnapshot(d)};var d={src:{kind:'inventory',index:0},id:'minecraft:tadpole_bucket',count:1,comps:{},removed:{},snbt:{}};d.base=snapOf(d);var Store={docs:[d],doc:function(){return d}},WE={w:null};function weActive(){return !!WE.w};", "fixture-model");
        return doc;
    }
    private static String eval(Document doc, String code) { return doc.scripts().evaluateToJson(code, "assert"); }
    private static void close(Document doc, EditorPrefs.Store store) { WorldDraftHost.bindDocument(doc, "native-world", store::putDraft, store::clearDraft, store::flush); doc.close(); }
    public static void main(String[] args) throws Exception {
        Path evidence = Path.of(args[1]); repo = Path.of(args[2]); Files.createDirectories(evidence);
        Path file = evidence.resolve("cadeditor-ui.json"); var store = new EditorPrefs.Store(file, System::nanoTime);
        if (args[0].equals("read")) {
            var value = store.getDraft(KEY).getAsString();
            check(value.equals(Files.readString(evidence.resolve("expected-packet.txt"))), "separate JVM reads exact latest item packet");
            check(value.length() > 8192 && value.contains("9007199254740993"), "large typed item persisted across JVM exit");
            var doc = document(); doc.scripts().evaluate("var packet=" + value + ";var restored=nbtRestore(packet.comps,packet.nbt_types);", "restore");
            String typed = JsonParser.parseString(eval(doc, "nbtMerge(restored,null)")).getAsString();
            check(typed.contains("9007199254740993L") && typed.contains("[L;9223372036854775807L]") && typed.contains("[B;1b,2b]"), "new JVM restores exact long and array types");
            check(!value.contains("autoApply"), "disk restoration contains no automatic Apply instruction"); doc.close();
            System.out.println("PASS ItemDraftPersistenceTest read " + checks + " checks"); return;
        }
        var doc = document();
        doc.scripts().evaluate("d.comps={'minecraft:custom_data':nbtToJson(nbtParse('{long:9007199254740993L,bytes:[B;1b,2b],ints:[I;3,4],longs:[L;9223372036854775807L]}'))};d.comps['minecraft:custom_data'].large=new Array(16001).join('x');EditorBridge.pending={id:'unconfirmed',doc:d};Drafts.flushDoc(d);", "incomplete-upload");
        check(eval(doc, "Drafts.busy.op==='begin'&&Drafts.queue.length>3").equals("true"), "real production begin is awaiting ACK with chunks unfinished");
        String expected = JsonParser.parseString(eval(doc, "Drafts.exportPackets()[0].value")).getAsString();
        check(expected.length() > 8192, "actual item exporter returns complete large snapshot");
        check(store.putDraft(KEY, "{\"older\":true}"), "older completed item draft exists before close"); store.flush(); close(doc, store);
        check(store.getDraft(KEY).getAsString().equals(expected), "pagehide replaces unfinished chunks with full exact current packet");
        check(new EditorPrefs.Store(file, System::nanoTime).getDraft(KEY).getAsString().equals(expected), "close returned only after actual disk snapshot persisted");
        Files.writeString(evidence.resolve("expected-packet.txt"), expected);
        // Clean saved intent clears only that version; no JS timer/ACK needs to run before close.
        var saved = document(); saved.scripts().evaluate("Drafts.clears[Drafts.keyOf(d)]=true;", "confirmed-clear-intent");
        check(store.putDraft("inventory:8:|minecraft:stone", "{\"unsaved\":true}"), "other slot draft installed");
        check(store.putDraft("world|other-world|entity", "{\"parent\":true}"), "other world draft installed"); close(saved, store);
        check(store.getDraft(KEY).isJsonNull(), "saved followed by immediate Document.close clears disk without1500ms");
        check(!store.getDraft("inventory:8:|minecraft:stone").isJsonNull(), "saved close leaves other slot untouched");
        check(!store.getDraft("world|other-world|entity").isJsonNull(), "saved close leaves other world untouched");
        // Later edits override clear in the same close bundle.
        var later = document(); later.scripts().evaluate("Drafts.clears[Drafts.keyOf(d)]=true;d.count=3;", "post-save-later-edit"); close(later, store);
        check(JsonParser.parseString(store.getDraft(KEY).getAsString()).getAsJsonObject().get("count").getAsInt() == 3, "post-save edit wins over same-key clear intent on close");
        var child = document(); child.scripts().evaluate("NestedItem={};d.count=64;WE.w={};WorldDrafts.exportPacket=function(){return {key:'world|native-world|parent',value:'{\"typed\":\"9007199254740993L\"}'}};", "world-parent-during-child"); close(child, store);
        check(JsonParser.parseString(store.getDraft(KEY).getAsString()).getAsJsonObject().get("count").getAsInt() == 3, "nested child never overwrites player original slot draft");
        check(store.getDraft("world|native-world|parent").getAsString().contains("9007199254740993L"), "world parent persists independently of active nested item");
        var failure = document(); failure.scripts().evaluate("Drafts.exportPackets=function(){throw new Error('injected item exporter failure')};", "export-failure"); close(failure, store);
        check(JsonParser.parseString(store.getDraft(KEY).getAsString()).getAsJsonObject().get("count").getAsInt() == 3, "failed exporter logs and preserves prior disk draft");
        var rejected = document(); rejected.scripts().evaluate("d.count=5;", "put-failure");
        WorldDraftHost.bindDocument(rejected, "native-world", (k,v) -> false, store::clearDraft, store::flush); rejected.close();
        check(JsonParser.parseString(store.getDraft(KEY).getAsString()).getAsJsonObject().get("count").getAsInt() == 3, "rejected close snapshot preserves last complete draft");
        var failedClear = document(); failedClear.scripts().evaluate("Drafts.clears[Drafts.keyOf(d)]=true;", "clear-failure");
        WorldDraftHost.bindDocument(failedClear, "native-world", store::putDraft, k -> false, store::flush); failedClear.close();
        check(JsonParser.parseString(store.getDraft(KEY).getAsString()).getAsJsonObject().get("count").getAsInt() == 3, "rejected close clear preserves last complete draft");
        var itemParent = document(); itemParent.scripts().evaluate("d.count=7;NestedItem={docs:[d],parent:null};Store.docs=[{id:'minecraft:stone',count:64,src:null}];", "detached-item-parent"); close(itemParent, store);
        check(JsonParser.parseString(store.getDraft(KEY).getAsString()).getAsJsonObject().get("count").getAsInt() == 7, "pagehide persists detached top-level item parent, never child as original slot");
        // Leave the large actual pagehide packet for independent next-JVM verification.
        check(store.putDraft(KEY, expected), "restore large pagehide result for separate JVM read"); store.flush();
        // A prior frozen disk write can finish after saved: its receipt cannot consume the clear.
        var now = new java.util.concurrent.atomic.AtomicLong();
        var jobs = new java.util.ArrayDeque<Runnable>(); Path asyncFile = evidence.resolve("async-drafts.json");
        var async = new EditorPrefs.Store(asyncFile, now::get, jobs::add);
        async.putDraft(KEY, "{\"old\":true}"); now.set(500_000_000L); async.tick();
        check(jobs.size() == 1, "old draft disk snapshot is genuinely in flight");
        async.clearDraft(KEY); async.putDraft("world|other-world|unrelated", "{}"); jobs.remove().run();
        check(async.getDraft(KEY).isJsonNull(), "late disk write receipt cannot revive cleared item in pending state");
        now.set(1_000_000_000L); async.tick(); check(jobs.size() == 1, "clear still requires its own disk write after old completion"); jobs.remove().run(); async.read();
        var afterClear = new EditorPrefs.Store(asyncFile, now::get);
        check(afterClear.getDraft(KEY).isJsonNull(), "clear remains absent on actual disk after old snapshot receipt");
        check(!afterClear.getDraft("world|other-world|unrelated").isJsonNull(), "clear does not consume unrelated pending world draft");
        async.putDraft(KEY, "{\"B\":true}"); now.set(1_500_000_000L); async.tick();
        async.clearDraft(KEY); async.putDraft(KEY, "{\"C\":true}"); jobs.remove().run();
        check(async.getDraft(KEY).getAsString().contains("C"), "post-clear new edit survives older in-flight put completion");
        now.set(2_000_000_000L); async.tick(); jobs.remove().run(); async.read();
        check(new EditorPrefs.Store(asyncFile, now::get).getDraft(KEY).getAsString().contains("C"), "newer edit remains on disk instead of older put or clear");
        System.out.println("PASS ItemDraftPersistenceTest write " + checks + " checks; actual Oriel + disk, no game");
    }
}
