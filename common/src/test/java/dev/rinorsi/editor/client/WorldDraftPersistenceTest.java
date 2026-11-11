package dev.rinorsi.editor.client;

import com.google.gson.*;
import dev.oriel.engine.dom.Document;
import dev.oriel.engine.host.*;
import dev.oriel.engine.script.*;
import java.nio.file.*;

/** Real Oriel Document.close/pagehide/Rhino + real bounded prefs disk I/O. Not a game. */
public final class WorldDraftPersistenceTest {
    private static int checks;
    private static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
    public static void main(String[] args)throws Exception {
        Path evidence=Path.of(args[1]),packetPath=Path.of(args[2]);
        var packet=JsonParser.parseString(Files.readString(packetPath)).getAsJsonObject();
        String key=packet.get("key").getAsString(),input=packet.get("value").getAsString();
        var store=new EditorPrefs.Store(evidence.resolve("cadeditor-ui.json"),System::nanoTime);
        if(args[0].equals("read")) {
            String value=store.getDraft(key).getAsString();
            var desired=JsonParser.parseString(input).getAsJsonObject();var actual=JsonParser.parseString(value).getAsJsonObject();
            check(actual.getAsJsonObject("state").get("text").equals(desired.getAsJsonObject("state").get("text")),"fresh JVM reads exact typed draft text");
            check(value.contains("9007199254740993L")&&value.contains("9223372036854775807L")&&value.contains("[B;"),"long/typed arrays remain exact on disk");
            check(value.length()>8192,"large close snapshot survived separate JVM");
            check(actual.get("pending").getAsBoolean(),"unknown pending outcome preserved on disk");
            System.out.println("PASS WorldDraftPersistenceTest read "+checks+" checks");return;
        }
        Host host=new Host(){public FontMetrics fonts(){return (text,font)->text.length()*6;}public String loadText(String path){return "";}
            public ScriptRuntime createScriptRuntime(Document doc){return new RhinoRuntimeProvider().create(doc);}};
        var doc=Document.parse(host,"test:world-draft","<html><head><script>var booted=true;</script></head><body></body></html>");
        check(doc.scripts()!=null,"actual embedded Rhino runtime created");
        var repo=Path.of(args[3]);
        doc.scripts().evaluate("function snbtStr(s){return JSON.stringify(s)};function snbtKey(k){return /^[A-Za-z0-9_.+-]+$/.test(k)?k:snbtStr(k)};", "draft-test-format");
        doc.scripts().evaluate(Files.readString(repo.resolve("common/src/main/resources/assets/cadeditor/ui/js/nbt.js")),"production-nbt");
        doc.scripts().evaluate(Files.readString(repo.resolve("common/src/main/resources/assets/cadeditor/ui/js/drafts.js")),"production-drafts");
        var identity=JsonParser.parseString(key.substring(key.lastIndexOf('|')+1)).getAsJsonArray();
        String scope=key.substring(6,key.lastIndexOf('|'));
        var world=new JsonObject();world.addProperty("type",identity.get(3).getAsString());
        var slot=new JsonObject();slot.addProperty("kind","entity");slot.add("dim",identity.get(1));slot.add("uuid",identity.get(2));slot.addProperty("token","another-session");world.add("slot",slot);
        var source=JsonParser.parseString(input).getAsJsonObject();world.add("snbt",source.getAsJsonObject("base").get("snbt"));world.addProperty("revision","not-persistent-identity");
        doc.scripts().evaluate("var source="+input+",Prefs={host:true,vals:{worldDraftScope:"+new Gson().toJson(scope)+"}},WE=nbtRestore(source.state,source.types);WE.w="+world+";WE.pending='held-incomplete';function weDirty(){return true}","restore-actual-node-state");
        check(store.putDraft(key,"{\"older\":true}"),"older draft installed before interrupted upload");store.flush();
        WorldDraftHost.bindDocument(doc,scope,store::putDraft,store::clearDraft,store::flush);
        // Driver.disposeDocument nulls its document field before calling this same engine close.
        Document[] driverReference={doc};driverReference[0]=null;doc.close();
        check(driverReference[0]==null,"external driver Document reference already cleared");
        String captured=store.getDraft(key).getAsString();check(!captured.equals("{\"older\":true}"),"pagehide synchronously replaced incomplete upload with complete draft");
        check(Files.readString(evidence.resolve("cadeditor-ui.json")).contains("9007199254740993L"),"close flushed actual prefs file before return");
        check(!WorldDraftHost.digest("single:world-one").equals(WorldDraftHost.digest("single:world-two")),"different worlds same entity UUID have separate stable scope");
        check(!WorldDraftHost.digest("remote:server-a:25565").equals(WorldDraftHost.digest("remote:server-b:25565")),"different servers same entity UUID have separate stable scope");
        // Close-time capture failures must leave the last good file intact, not erase it.
        for(boolean wrongScope:new boolean[]{false,true}) {
            var rejected=Document.parse(host,"test:world-draft-failure","<html><body></body></html>");
            rejected.scripts().evaluate("var WorldDrafts={exportPacket:function(){return "+packet+"}};","captured-complete-packet");
            int[] puts={0};
            WorldDraftHost.bindDocument(rejected,wrongScope?"another-world":scope,(k,v)->{puts[0]++;return false;},store::clearDraft,store::flush);
            rejected.close();
            check(puts[0]==(wrongScope?0:1),wrongScope?"foreign scope never reaches prefs put":"close put rejection handled");
            check(store.getDraft(key).getAsString().equals(captured),"close capture failure preserves previous complete draft");
            check(new EditorPrefs.Store(evidence.resolve("cadeditor-ui.json"),System::nanoTime).getDraft(key).getAsString().equals(captured),"capture rejection leaves disk file intact");
        }
        var failedFlush=Document.parse(host,"test:world-draft-flush-failure","<html><body></body></html>");
        failedFlush.scripts().evaluate("var WorldDrafts={exportPacket:function(){return null}};","no-replacement");
        WorldDraftHost.bindDocument(failedFlush,scope,store::putDraft,store::clearDraft,()->{throw new IllegalStateException("test injected close flush failure");});
        failedFlush.close();
        check(store.getDraft(key).getAsString().equals(captured),"flush exception is logged without clearing old draft");
        // Reload boot messages run synchronously before Document.parse returns. Production
        // world_bind must therefore use Minecraft.schedule, never bind to that still-null pointer.
        Document[] replacement={null};boolean[] sawBoot={false},pointerWasNull={false};
        Host loading=new Host(){public FontMetrics fonts(){return (text,font)->text.length()*6;}public String loadText(String path){return "";}
            public ScriptRuntime createScriptRuntime(Document target){return new RhinoRuntimeProvider().create(target);}
            public boolean send(String channel,String data){sawBoot[0]=true;pointerWasNull[0]=replacement[0]==null;return true;}};
        replacement[0]=Document.parse(loading,"test:replacement","<html><head><script>var WorldDrafts={exportPacket:function(){return "+packet+"}};oriel.send('drafts',{op:'world_bind'});</script></head><body></body></html>");
        check(sawBoot[0]&&pointerWasNull[0],"real boot send occurs before replacement Document assignment");
        WorldDraftHost.bindDocument(replacement[0],scope,store::putDraft,store::clearDraft,store::flush);
        replacement[0].close();
        check(store.getDraft(key).getAsString().equals(input),"binding completed replacement captures its close snapshot");
        // All-protected capacity rejects new data without evicting any recoverable world draft.
        var full=new EditorPrefs.Store(evidence.resolve("full.json"),System::nanoTime);
        for(int i=0;i<8;i++)check(full.putDraft("world|scope|"+i,"{}"),"protected draft insert "+i);
        var old=full.read();check(!full.putDraft("world|scope|ninth","{}"),"capacity rejects ninth world draft");check(full.read().equals(old),"capacity rejection preserves all eight older drafts");
        System.out.println("PASS WorldDraftPersistenceTest write "+checks+" checks; real Document close and real disk, no game");
    }
}
