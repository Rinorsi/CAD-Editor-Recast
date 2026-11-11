// Executes production host lifecycle/queue methods with dependency stubs; no game/Gradle.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||'../Oriel-UI-Workspace/daily/2026-11-09/logs/data-integrity-scale/entity-world-scope/host-extract');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'common/src/main/java/dev/rinorsi/editor/registry/RegistryBridge.java'),'utf8');
function block(signature){const at=source.indexOf(signature);assert(at>=0,signature);let start=source.indexOf('{',at),depth=1,end=start+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}assert.equal(depth,0);return source.slice(at,end);}
const pieces=[block('private record Batch('),block('private record EntityScope('),block('private static final class State '),block('private static void queuePages(DocumentDriver driver, String key, java.util.List<String> json, JsonObject context, boolean priority, EntityScope scope)'),block('private static void entityRequest(DocumentDriver driver, JsonObject request, String raw)'),block('private static void entityRequest(DocumentDriver driver, JsonObject request, String raw, EntityScope scope)')];
assert(source.includes('if (batch.getValue().scope != null && !batch.getValue().scope.current(d)) { queue.remove(batch.getKey()); continue; }'));
assert(source.indexOf('batch.getValue().scope.current(d)')<source.indexOf('d.patchJson(batch.getValue().key'));
const java=`import com.google.gson.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.*;
public class ExtractedEntityScopeHarness {
 static class DocumentDriver {Object doc=new Object();Object document(){return doc;}}
 static class Minecraft {static final Minecraft I=new Minecraft();Object level;boolean same=true;static Minecraft getInstance(){return I;}boolean isSameThread(){return same;}}
 static class Warmup {String gen="7";String generation(){return gen;}}
 static final Map<DocumentDriver,State> DOCUMENTS=new WeakHashMap<>();
 static final AtomicLong RELOAD=new AtomicLong();
 static Object world,language;static long observedReload;static Warmup warmup;
 static class EntityRegistryChannel {
  static final List<Task> tasks=new ArrayList<>();
  record Task(String generation,BooleanSupplier current,BiConsumer<List<String>,JsonObject> reply){
   void emit(){JsonObject context=new JsonObject();context.addProperty("worldGeneration",generation);reply.accept(List.of("page0","page1"),context);}
  }
  static void request(JsonObject r,String n,String g,BooleanSupplier current,BiConsumer<List<String>,JsonObject> reply){tasks.add(new Task(g,current,reply));}
 }
 __PRODUCTION__
 static DocumentDriver d;static State state;static int checks;
 static void check(boolean value,String why){if(!value)throw new AssertionError(why);checks++;}
 static void setup(){DOCUMENTS.clear();EntityRegistryChannel.tasks.clear();d=new DocumentDriver();state=new State();state.document=d.doc;state.generation="7";DOCUMENTS.put(d,state);Minecraft.I.level=new Object();Minecraft.I.same=true;world=Minecraft.I.level;language=net.minecraft.locale.Language.getInstance();RELOAD.set(0);observedReload=0;warmup=new Warmup();}
 static EntityRegistryChannel.Task request(String key){entityRequest(d,new JsonObject(),key);return EntityRegistryChannel.tasks.getLast();}
 public static void main(String[] args){
  for(String key:List.of("entity_info","entity_info:custom:one","entity_schema","entity_schema:custom:one","entity_base_attributes","equipment_slot_groups","spawner_info")){
   setup();var t=request(key);check(t.current.getAsBoolean(),"fresh execution guard");t.emit();check(state.interactive.size()==1,"fresh callback queued");var batch=state.interactive.values().iterator().next();check(batch.scope.current(d),"fresh delivery guard");check(batch.pages.next().equals("page0")&&batch.pages.next().equals("page1"),"page cursor retained");
   setup();t=request(key);d.doc=new Object();check(!t.current.getAsBoolean(),"old Document rejects execution");t.emit();check(state.interactive.isEmpty(),"old Document callback discarded");
   setup();t=request(key);t.emit();batch=state.interactive.values().iterator().next();d.doc=new Object();check(!batch.scope.current(d),"already queued page cannot enter new Document");
  }
  setup();var t=request("entity_info");Minecraft.I.level=new Object();check(!t.current.getAsBoolean(),"world changed before registry tick");t.emit();check(state.interactive.isEmpty(),"late world callback discarded");
  setup();t=request("entity_schema");warmup.gen="8";check(!t.current.getAsBoolean(),"registry epoch changed");t.emit();check(state.interactive.isEmpty(),"old epoch callback discarded");
  setup();t=request("spawner_info");RELOAD.incrementAndGet();check(!t.current.getAsBoolean(),"resource/tag reload invalidates scope");
  setup();t=request("equipment_slot_groups");net.minecraft.locale.Language.value=new Object();check(!t.current.getAsBoolean(),"locale invalidates scope");
  setup();t=request("entity_base_attributes");DOCUMENTS.remove(d);check(!t.current.getAsBoolean(),"closed owner rejected");t.emit();check(state.interactive.isEmpty(),"closed callback not queued");
  setup();t=request("entity_info");Minecraft.I.same=false;check(!t.current.getAsBoolean(),"scope cannot run off client thread");Minecraft.I.same=true;
  setup();state.pending=true;state.generation=null;entityRequest(d,new JsonObject(),"entity_info");check(EntityRegistryChannel.tasks.isEmpty()&&state.waiting.size()==1,"wait for document meta");state.waiting.removeFirst().run();check(state.waiting.size()==1&&EntityRegistryChannel.tasks.isEmpty(),"warmup wait bounded");state.pending=false;state.generation="7";state.waiting.removeFirst().run();check(EntityRegistryChannel.tasks.size()==1,"current page recovers after meta");EntityRegistryChannel.tasks.getLast().emit();check(state.interactive.size()==1,"fresh response remains usable");
  setup();state.pending=true;entityRequest(d,new JsonObject(),"entity_schema");d.doc=new Object();state.pending=false;state.waiting.removeFirst().run();check(EntityRegistryChannel.tasks.isEmpty(),"waiting callback cannot migrate Document");state.document=d.doc;entityRequest(d,new JsonObject(),"entity_schema");check(EntityRegistryChannel.tasks.size()==1,"new same-world Document can request data");
  System.out.println("PASS extracted production EntityScope/entityRequest/queuePages: "+checks+" lifecycle assertions, 7 response names; no Minecraft-window claim");
 }
}`.replace('__PRODUCTION__',pieces.join('\n'));
fs.writeFileSync(path.join(out,'ExtractedEntityScopeHarness.java'),java);
const language=path.join(out,'net/minecraft/locale');fs.mkdirSync(language,{recursive:true});fs.writeFileSync(path.join(language,'Language.java'),'package net.minecraft.locale; public class Language {public static Object value=new Object();public static Object getInstance(){return value;}}');
const lazy=path.join(out,'dev/rinorsi/editor/registry/search');fs.mkdirSync(lazy,{recursive:true});fs.writeFileSync(path.join(lazy,'LazyCatalog.java'),'package dev.rinorsi.editor.registry.search; public class LazyCatalog {}');
const runtime=JSON.parse(fs.readFileSync(path.resolve(root,'../Oriel-UI-Workspace/daily/2026-11-09/artifacts/nbt-bee-9B003AFA1E70/native-runtime-classpath.json')));
const gson=runtime.find(x=>/gson-[0-9].*\.jar$/.test(x));assert(gson,'gson compile dependency');
const jdk=path.join(process.env.USERPROFILE,'.jdks/jdk-25.0.5+8/bin');
function gate(name,command,args){const r=cp.spawnSync(command,args,{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,name+'.log'),(r.stdout||'')+(r.stderr||''));assert.equal(r.status,0,name+' failed: '+path.join(out,name+'.log'));return r.stdout;}
gate('javac',path.join(jdk,'javac.exe'),['-proc:none','-encoding','UTF-8','-cp',gson,'-d',out,path.join(out,'ExtractedEntityScopeHarness.java'),path.join(language,'Language.java'),path.join(lazy,'LazyCatalog.java')]);
process.stdout.write(gate('java',path.join(jdk,'java.exe'),['-cp',out+';'+gson,'ExtractedEntityScopeHarness']));
fs.writeFileSync(path.join(out,'source-hashes.json'),JSON.stringify({RegistryBridge:crypto.createHash('sha256').update(source).digest('hex'),extractedHarness:crypto.createHash('sha256').update(java).digest('hex')},null,2));
