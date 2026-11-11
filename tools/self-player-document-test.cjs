const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const assert=require('node:assert/strict'), {spawnSync}=require('node:child_process');
const dir=path.resolve(__dirname,'../common/src/main/java/dev/rinorsi/editor/client');
const self=fs.readFileSync(path.join(dir,'SelfPlayerCommands.java'),'utf8');
const host=fs.readFileSync(fs.existsSync(path.join(dir,'WorldEditorClient.java'))?path.join(dir,'WorldEditorClient.java'):path.join(process.env.EDITOR_BASE_SOURCE_ROOT,'common/src/main/java/dev/rinorsi/editor/client/WorldEditorClient.java'),'utf8');
function block(text,start){let end=text.indexOf('{',start)+1,depth=1;while(depth&&end<text.length){if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}return text.slice(start,end);}
const gate=block(self,self.indexOf('static final class DocumentBinding {'));
const main=[
'class SelfPlayerDocumentProbe {',gate,
'static void check(boolean b,String message){if(!b)throw new AssertionError(message);}',
'public static void main(String[] args){',
'Object old=new Object(), reloaded=new Object();',
'DocumentBinding loading=new DocumentBinding(null);',
'check(!loading.accept(null),"initial load waits");check(!loading.stale,"initial load not stale");check(loading.accept(old),"first document attaches");',
'DocumentBinding pre=new DocumentBinding(old);int sent=0,saved=0;',
'check(pre.accept(old),"prequery starts");if(pre.accept(reloaded))sent++;check(sent==0,"pre-send reload prevents command");',
'check(!pre.accept(old),"old document cannot revive");check(!pre.accept(reloaded),"Apply cannot reuse retired session");',
'DocumentBinding post=new DocumentBinding(old);if(post.accept(old))sent++;check(sent==1,"one send before reload");',
'if(post.accept(reloaded))saved++;check(saved==0,"late post-send reply cannot save");if(post.accept(old))saved++;check(saved==0,"late old reply stays discarded");',
'DocumentBinding deferred=new DocumentBinding(old);check(deferred.accept(old),"response queues step");if(deferred.accept(reloaded))sent++;check(sent==1,"reload before next tick blocks step");',
'System.out.println("PASS production DocumentBinding: initial load, pre-send reload, post-send late response, deferred reload, sticky invalidation");','}}'
].join(String.fromCharCode(10));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'self-player-document-')), file=path.join(tmp,'SelfPlayerDocumentProbe.java');
fs.writeFileSync(file,main);const result=spawnSync('java',[file],{encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');assert.equal(result.status,0,String(result.error||''));
for(const signature of ['void apply(','void tick(']) assert.ok(block(self,self.indexOf(signature)).includes('if(!documentCurrent())'));
assert.ok(block(self,self.indexOf('nextStep=()->{')).includes('if(!documentCurrent())return;'));
assert.ok(host.includes('commands.bindDocument(()->screen==pageOwner?pageOwner.driver().document():null)'));
assert.ok(block(host,host.indexOf('public static boolean receive(')).includes('!selfDocumentCurrent())return true;'));
assert.ok(host.includes('pending=null;binding=null;'));
assert.ok(self.includes('命令已发送，结果未知'));
const confirm=block(self,self.indexOf('private void confirm('));
assert.ok(confirm.includes('readback=()->confirm('));assert.ok(confirm.includes('200_000_000L'));
assert.ok(!confirm.includes('sendCommand('));assert.equal(self.split('sendCommand(').length-1,1);
const tick=block(self,self.indexOf('void tick('));
assert.ok(tick.indexOf('System.nanoTime()>deadline')<tick.indexOf('var step=nextStep'));
assert.ok(tick.includes('operation!=null&&readback!=null'));
assert.ok(block(self,self.indexOf('void cancel(')).includes('readback=null'));
console.log('PASS production wiring: Document guards at Apply/deferred/tick/receipt, mismatch retries only reads, original deadline, cancellation clears reads');
// Run the actual production query/confirm/tick/cancel methods with fake time and packet delivery.
const methods=['private void confirm(','private void query(','void tick(','void cancel(','private void log(','private void logFailure('].map(s=>block(self,self.indexOf(s))).join(String.fromCharCode(10)).replaceAll('System.nanoTime()','now');
const scheduler=[
'import java.util.*;import java.util.function.*;',
'class SelfPlayerReadbackProbe {',methods,'record SelfPlayerCommandPlan(Predicate<CompoundTag> after,BiConsumer<JsonObject,CompoundTag> project){}',
'long now=0,deadline=8_000_000_000L,readbackAt;String operation="request-1";Runnable nextStep,readback;boolean sent=true,valid=true;Object completion;JsonObject baseline;int saves,unknown,sends=1;',
'int queries,replies;String permissionContext="gamemode_visible=true data_get_entity_visible=false";',
'static class EditorWriteLog {static String stage,request,context,failureStage,failureContext;static RuntimeException error;static void event(String s,String r,String c){stage=s;request=r;context=c;}static void failure(String s,String r,String c,RuntimeException e){stage=s;request=r;context=c;failureStage=s;failureContext=c;error=e;}}',
'boolean documentCurrent(){if(!valid)cancel();return valid;}boolean connected(Minecraft mc){return true;}',
'JsonObject world(Minecraft mc){return new JsonObject();}',
'void finish(String status,String code,String reason,JsonObject world){if(status.equals("saved"))saves++;else unknown++;cancel();}',
'static class JsonObject {JsonObject getAsJsonObject(String s){return this;}JsonObject get(String s){return this;}JsonObject deepCopy(){return this;}void add(String s,JsonObject v){}void addProperty(String s,int v){}}',
'static class CompoundTag {int value;CompoundTag(int v){value=v;}Optional<Integer> getInt(String s){return Optional.of(value);}}',
'static class Minecraft {Minecraft player=this;Consumer<CompoundTag> callback;int queries;int getId(){return 1;}Minecraft getConnection(){return this;}Minecraft getDebugQueryHandler(){return this;}void queryEntityTag(int id,Consumer<CompoundTag> cb){queries++;callback=cb;}void reply(int v){var cb=callback;callback=null;if(cb!=null)cb.accept(new CompoundTag(v));}}',
'void start(Minecraft mc){confirm(mc,operation,new SelfPlayerCommandPlan(t->t.value==9,(v,t)->{}));}',
'static void check(boolean b,String m){if(!b)throw new AssertionError(m);}',
'public static void main(String[] args){',
'var p=new SelfPlayerReadbackProbe();var mc=new Minecraft();p.start(mc);mc.reply(4);p.tick(mc);check(p.saves==0&&p.readback!=null,"old post-query schedules read");p.now=199_000_000L;p.tick(mc);check(mc.queries==1,"read interval respected");p.now=200_000_000L;p.tick(mc);check(mc.queries==2,"second query sent");mc.reply(9);p.tick(mc);check(p.saves==1&&p.sends==1,"second expected value saves with one command");',
'p=new SelfPlayerReadbackProbe();mc=new Minecraft();p.start(mc);for(int i=0;i<40;i++){mc.reply(4);p.tick(mc);p.now+=200_000_000L;p.tick(mc);}p.now++;p.tick(mc);check(p.unknown==1&&p.saves==0&&p.sends==1,"persistent mismatch reaches original deadline");',
'p=new SelfPlayerReadbackProbe();mc=new Minecraft();p.start(mc);mc.callback=null;p.now=8_000_000_001L;p.tick(mc);check(p.unknown==1&&mc.queries==1,"overwritten query callback times out");',
'p=new SelfPlayerReadbackProbe();mc=new Minecraft();p.start(mc);mc.reply(4);p.tick(mc);p.valid=false;p.now=300_000_000L;p.tick(mc);check(mc.queries==1&&p.operation==null,"reload cancels scheduled query");',
'p=new SelfPlayerReadbackProbe();mc=new Minecraft();p.start(mc);p.valid=false;mc.reply(9);p.tick(mc);check(p.saves==0&&p.operation==null,"late reply after reload never updates baseline");',
'p=new SelfPlayerReadbackProbe();mc=new Minecraft();var expected=new IllegalStateException("fixture query failure");p.query(mc,p.operation,t->{throw expected;});mc.reply(9);p.tick(mc);check(p.unknown==1&&p.saves==0&&p.sends==1,"callback failure never saves or resends");check(EditorWriteLog.error==expected&&EditorWriteLog.request.equals("request-1"),"original failure and request preserved");check(EditorWriteLog.context.contains("queries=1")&&EditorWriteLog.context.contains("replies=1"),"query counts logged");',
'check(EditorWriteLog.failureStage.equals("client.self.query.callback_failure")&&EditorWriteLog.failureContext.contains("gamemode_visible=true data_get_entity_visible=false"),"exact failure stage and permission evidence preserved");',
'System.out.println("PASS production scheduler: old-then-expected, 200ms bounded read-only retries, one command, persistent mismatch, overwritten query timeout, reload cancellation, callback exception diagnostics");','}}'
].join(String.fromCharCode(10));
const schedulerFile=path.join(tmp,'SelfPlayerReadbackProbe.java');fs.writeFileSync(schedulerFile,scheduler);
const scheduled=spawnSync('java',[schedulerFile],{encoding:'utf8'});process.stdout.write(scheduled.stdout||'');process.stderr.write(scheduled.stderr||'');assert.equal(scheduled.status,0,String(scheduled.error||''));
