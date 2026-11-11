const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),H=require('../lib/ui-harness.cjs');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});let checks=0,store={},hold=false;
const h=H.create(),c=h.c,run=s=>vm.runInContext(s,c),check=(x,n)=>{assert(x,n);checks++;};
const initial='{Health:4f,active_effects:[],typed:{long:9007199254740993L,bytes:[B;1b,2b],ints:[I;3,4],longs:[L;9223372036854775807L],unknown:{short:2s}}}';
c.initial=initial;
run("Prefs.host=true;Prefs.vals={worldDraftScope:'world-one',drafts:{}};weRender=function(){};drawWorldTop=function(){};drawWorldFoot=function(){};weHeroLive=function(){};var testWorld={kind:'entity',type:'minecraft:slime',slot:{kind:'entity',dim:'minecraft:overworld',uuid:'same-uuid',token:'old-token'},snbt:initial,revision:'r1'};weOpen(clone(testWorld));");
let upload=null;
c.oriel.send=(channel,msg)=>{
 h.sent.push([channel,JSON.parse(JSON.stringify(msg))]);if(channel!=='drafts'||hold)return true;
 if(msg.op==='put')store[msg.key]=msg.value;
 if(msg.op==='clear')delete store[msg.key];
 if(msg.op==='begin')upload={key:msg.key,text:''};
 if(msg.op==='chunk'){assert.equal(msg.offset,upload.text.length);upload.text+=msg.value;if(msg.done)store[upload.key]=upload.text;}
 c.Prefs.vals.drafts=JSON.parse(JSON.stringify(store));c.Drafts.onResult({...msg,status:'accepted'});return true;
};
// Production control handler to raw typed text, actual Apply path, rejected receipt.
run("WE.obj=weObj();WE.obj.active_effects=[{id:'minecraft:speed',amplifier:0,duration:600,show_particles:true}];wePut();weApply();weResult({requestId:WE.pending,status:'rejected',code:'invalid_nbt',reason:'原版加载器未保留修改的字段：active_effects'});");
check(run('weDirty()'),'rejection retains dirty');check(Object.keys(store).length===1,'rejected draft sent to same host draft map');
const key=run('WorldDrafts.key(WE.w)'),saved=store[key];check(JSON.parse(saved).state.text.includes('9007199254740993L'),'long kept exact in persistent packet');
// Same target new token: restoration key stable. Dismissing must not clear on close.
run("var reopen=clone(testWorld);reopen.slot.token='new-token';WE.w=null;weOpen(reopen);");
check(run('WorldDrafts.key(WE.w)')===key,'token not persistent identity');check(h.doc.getElementById('modal')!==null,'same target offers restoration');
run('closeModal();WorldDrafts.flush();');check(store[key]===saved,'dismissed offer preserves disk draft');
run('WorldDrafts.restore(JSON.parse(Prefs.vals.drafts[WorldDrafts.key(WE.w)]),false);');
check(run('weDirty()'),'restored dirty');check(run('WE.text').includes('[L;9223372036854775807L]'),'typed array restored');
// Other world/server, dimension, uuid and block positions never share keys.
run("Prefs.vals.worldDraftScope='world-two';");check(run('WorldDrafts.key(WE.w)')!==key,'other world/server same uuid isolated');
run("Prefs.vals.worldDraftScope='world-one';var other=clone(WE.w);other.slot.dim='minecraft:the_nether';");check(run('WorldDrafts.key(other)')!==key,'dimension isolated');
run("other.slot.dim='minecraft:overworld';other.slot.uuid='another';");check(run('WorldDrafts.key(other)')!==key,'entity isolated');
// Changed baseline never deletes old draft or silently writes; comparison must be explicit.
run("var oldPacket=JSON.parse(Prefs.vals.drafts[WorldDrafts.key(WE.w)]);WE.w.snbt=WE.w.snbt.replace('Health:4f','Health:3f');WorldDrafts.restore(oldPacket,true);");
const beforeApply=h.sent.filter(x=>x[0]==='apply').length;run('weApply();');check(h.sent.filter(x=>x[0]==='apply').length===beforeApply,'changed baseline blocks submit until comparison');check(run('!!WE.draftConflict'),'persistent conflict marker');
run('closeModal();WE.draftConflict=null;WorldDrafts.flush();');
// A->B submit, back to A while pending: saved B clears only B, preserving A plus new field.
run("WE.pending=null;WE.lastSendAt=0;WE.text=WE.w.snbt;WE.obj=weObj();WE.obj=null;WE.text=WE.text.replace('Health:3f','Health:8f');weApply();var sentId=WE.pending;WE.text=WE.text.replace('Health:8f','Health:3f');WE.text=WE.text.replace('typed:', 'NoAI:1b,typed:');weMarkDirty();var confirmed=clone(WE.w);confirmed.snbt=confirmed.snbt.replace('Health:3f','Health:8f');confirmed.revision='r2';weSaved(confirmed);weResult({status:'saved',requestId:sentId});");
check(run('WE.text').includes('Health: 3f')||run('WE.text').includes('Health:3f'),'reverse pending edit A survives saved B');check(run('WE.text').includes('NoAI'),'new pending edit survives');check(run('weDirty()'),'later edit dirty');check(!!store[key],'later edit remains on disk');
// Unchanged successful version is clear, no false clear of unrelated target drafts.
run("WE.lastSendAt=0;weApply();var confirmed2=clone(WE.w);confirmed2.snbt=WE.text;confirmed2.revision='r3';var sentId2=WE.pending;weSaved(confirmed2);weResult({status:'saved',requestId:sentId2});");
check(!run('weDirty()'),'saved no later edits clean');check(!store[key],'confirmed version removed');
// Timeout remains recoverable and is marked unknown, never retried by draft machinery.
run("WE.lastSendAt=0;WE.text=WE.text.replace(/Health: ?3f/,'Health:2f');weApply();");
const timer=h.timers.filter(x=>x.ms===12000).slice(-1)[0];timer.fn();check(run('WE.pending===null&&WE.draftUnknown'),'timeout marked unknown');check(JSON.parse(store[key]).pending,'unknown persisted');
// >8192 upload only began: direct close export is complete and independent of child Store.
hold=true;run("WE.text=WE.text.slice(0,-1)+',large:'+snbtStr('x'.repeat(12000))+'}';WorldDrafts.flush();var NestedItem={parent:'world'};Store.docs.length=0;");
check(run('!!Drafts.busy&&Drafts.queue.length>0'),'large draft upload unfinished');const packet=JSON.parse(JSON.stringify(run('WorldDrafts.exportPacket()')));
check(packet.value.length>8192,'large complete close snapshot available');check(packet.key===key,'nested child active Store never replaces parent identity');
fs.writeFileSync(path.join(out,'close-packet.json'),JSON.stringify(packet));fs.writeFileSync(path.join(out,'disk-fixture.json'),JSON.stringify(store));
// Same typed metadata survives a JSON process boundary in normalized deltas too.
run("WE.views={probe:{value:parseSnbtUser('{l:1234567890123456789L,a:[L;9223372036854775807L],b:[B;1b],s:2s}')}};var normalizedPacket=JSON.parse(WorldDrafts.exportPacket().value);var restored=nbtRestore(normalizedPacket.state,normalizedPacket.types);");
check(run('nbtMerge(restored.views.probe.value,null)')==='{l:1234567890123456789L,a:[L;9223372036854775807L],b:[B;1b],s:2s}','normalized typed deltas exact through JSON');
// Field/slot patches only retain edits made after the confirmed snapshot, including reversals.
const h2=H.create(),c2=h2.c,r2=s=>vm.runInContext(s,c2);
c2.oriel.send=(channel,msg)=>{h2.sent.push([channel,JSON.parse(JSON.stringify(msg))]);if(channel==='drafts')c2.Drafts.onResult({...msg,status:'accepted'});return true;};
r2("Prefs.host=true;Prefs.vals={worldDraftScope:'world-one',drafts:{}};weRender=function(){};drawWorldTop=function(){};drawWorldFoot=function(){};var fixture={kind:'block',type:'minecraft:chest',block:'minecraft:chest',slot:{kind:'block',dim:'minecraft:overworld',x:1,y:64,z:2,token:'chest-token'},snbt:'{}',views:{probe:{value:{value:1}}},container:{size:2,slots:[{slot:0,stack:{id:'minecraft:stone',count:1}},{slot:1,stack:{empty:true}}]},block_state_schema:[{name:'facing',current:'north'}]};weOpen(clone(fixture));WE.slots[0]={id:'minecraft:stone',count:2};weSetV('probe','value',8);WE.bstate.facing='south';WE.pending='patch-1';WorldDrafts.beforeSend(WE.pending);WE.slots[0]={id:'minecraft:stone',count:1};WE.slots[1]={id:'minecraft:dirt',count:3};weSetV('probe','value',1);delete WE.bstate.facing;var confirmedPatch=clone(fixture);confirmedPatch.container.slots[0].stack.count=2;confirmedPatch.views.probe.value.value=8;confirmedPatch.block_state_schema[0].current='south';weSaved(confirmedPatch);weResult({requestId:'patch-1',status:'saved'});");
check(r2('WE.slots[0].count===1&&WE.slots[1].count===3'),'slot reversal and new slot survive confirmed older snapshot');
check(r2('WE.views.probe.value===1&&WE.bstate.facing==="north"'),'normalized control and block state reversal retained');
r2("WE.pending='patch-2';WorldDrafts.beforeSend(WE.pending);var allConfirmed=clone(WE.w);allConfirmed.container.slots[0].stack.count=1;allConfirmed.container.slots[1].stack={id:'minecraft:dirt',count:3};allConfirmed.views.probe.value.value=1;allConfirmed.block_state_schema[0].current='north';weSaved(allConfirmed);weResult({requestId:'patch-2',status:'saved'});");
check(r2('!weDirty()&&Object.keys(WE.slots).length===0&&Object.keys(WE.views).length===0&&Object.keys(WE.bstate).length===0'),'confirmed normalized and slot patches do not remain dirty');
r2("var oldBlockKey=WorldDrafts.key(WE.w);WE.btype='minecraft:barrel';WE.pending='patch-3';WorldDrafts.beforeSend(WE.pending);var newType=clone(WE.w);newType.type='minecraft:barrel';newType.block='minecraft:barrel';weSaved(newType);weResult({requestId:'patch-3',status:'saved'});");
check(r2('WorldDrafts.key(WE.w)!==oldBlockKey&&!weDirty()'),'confirmed block type obtains new stable target key');
check(h2.sent.some(([channel,msg])=>channel==='drafts'&&msg.op==='clear'&&msg.key===r2('oldBlockKey')),'confirmed type replacement clears only old draft key');
// The synchronous outgoing close snapshot may arrive after a reload's restoration prompt.
const h3=H.create(),c3=h3.c,r3=s=>vm.runInContext(s,c3);c3.savedDraft=saved;c3.initial=initial;
r3("Prefs.host=true;Prefs.vals={worldDraftScope:'world-one',drafts:{}};weRender=function(){};drawWorldTop=function(){};drawWorldFoot=function(){};weHeroLive=function(){};var rw={kind:'entity',type:'minecraft:slime',slot:{kind:'entity',dim:'minecraft:overworld',uuid:'same-uuid',token:'reload'},snbt:initial};weOpen(rw);var rk=WorldDrafts.key(rw);Prefs.vals.drafts[rk]=savedDraft;WorldDrafts.offer();var newer=JSON.parse(savedDraft);newer.state.text=newer.state.text.replace('typed:','NoAI:1b,typed:');Prefs.vals.drafts[rk]=JSON.stringify(newer);");
function modalButton(label){const el=h3.doc.getElementById('modal').querySelectorAll('.k-btn').find(x=>x.textContent.includes(label));assert(el,'modal button '+label);return el;}
modalButton('恢复草稿').click();check(!r3('weDirty()'),'stale restore prompt does not apply older draft');
modalButton('恢复草稿').click();check(r3('WE.text.includes("NoAI")'),'renewed prompt restores actual newest close snapshot');
r3("WE.text=WE.w.snbt;WE.obj=null;WorldDrafts.offered={};WorldDrafts.offer();var again=JSON.parse(Prefs.vals.drafts[rk]);again.t++;Prefs.vals.drafts[rk]=JSON.stringify(again);");
const clearCount=h3.sent.filter(([ch,m])=>ch==='drafts'&&m.op==='clear').length;modalButton('丢弃此草稿').click();
check(h3.sent.filter(([ch,m])=>ch==='drafts'&&m.op==='clear').length===clearCount,'stale discard prompt never clears a newer disk version');
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PASS',checks,scope:'Node production UI state/handler unit tests; no game/server or native Document claim',largeBytes:Buffer.byteLength(packet.value),key},null,2));console.log('PASS world drafts '+checks+' checks; rejection/restore/pending edits/isolation/large close snapshot/typed metadata');
