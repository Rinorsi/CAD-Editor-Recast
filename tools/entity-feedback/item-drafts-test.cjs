const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),H=require('../lib/ui-harness.cjs');
const out=process.argv[2];if(out)fs.mkdirSync(out,{recursive:true});let checks=0;
const check=(v,n)=>{assert(v,n);checks++;console.log('PASS '+n);};
function fixture(){
 const h=H.create(),c=h.c,run=s=>vm.runInContext(s,c),store={},events={};let hold=false,upload=null,rejectPut=false;
 c.oriel.on=(name,fn)=>(events[name]||=([])).push(fn);
 c.oriel.send=(channel,msg)=>{h.sent.push([channel,JSON.parse(JSON.stringify(msg))]);if(channel==='drafts'&&!hold){if(msg.op==='put'&&rejectPut){c.Drafts.onResult({...msg,status:'rejected',reason:'injected write failure'});return true;}if(msg.op==='put')store[msg.key]=msg.value;if(msg.op==='clear')delete store[msg.key];if(msg.op==='begin')upload={key:msg.key,text:''};if(msg.op==='chunk'){assert.equal(msg.offset,upload.text.length);upload.text+=msg.value;if(msg.done)store[upload.key]=upload.text;}if(['put','clear','get'].includes(msg.op)||(msg.op==='chunk'&&msg.done))patch(store);if(['put','clear','begin','chunk'].includes(msg.op))c.Drafts.onResult({...msg,status:'accepted'});}return true;};
 const app=fs.readFileSync(path.join(h.dir,'js/app.js'),'utf8');vm.runInContext(app.slice(0,app.lastIndexOf('boot();')),c);
 run("Prefs.host=true;Prefs.vals={drafts:{},worldDraftScope:'test-world'};rebuild=function(){};toast=function(){};validateDoc=function(){return []};itemRawBlocked=function(){return false};Store.open({key:'item',src:{kind:'inventory',index:0},id:'minecraft:tadpole_bucket',count:1,comps:{},removed:{},snbt:{}},true);var target=Store.doc();");
 function edit(count){run('Store.setCount('+count+');');}
 function submit(){run('applyToGame();');return JSON.parse(JSON.stringify(c.EditorBridge.pending));}
 function saved(count){run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"saved",item:{id:"minecraft:tadpole_bucket",count:'+count+',comps:{},removed:{},component_snbt:{}}});');}
 function patch(value){(events.patch||[]).forEach(fn=>fn({key:'prefs',value:{drafts:JSON.parse(JSON.stringify(value))}}));}
 run('Drafts.attach();');
 return {h,c,run,store,events,edit,submit,saved,patch,hold:v=>hold=v,rejectPut:v=>rejectPut=v};
}
try{
 const f=fixture();f.edit(2);f.run('Drafts.flush();');const key=f.run('Drafts.keyOf(Store.doc())');check(!!f.store[key],'dirty draft exists before submit');f.submit();f.saved(2);
 check(!f.store[key],'matching saved clears disk intent synchronously without running1500ms timer');
 check(f.run('snapOf(Store.doc())===Store.doc().base'),'saved document clean');
 check(f.run('Drafts.exportPackets().some(function(p){return p.clean&&p.clear})'),'immediate close exports confirmed clear barrier');
 f.run('Drafts.attach();');f.patch({[key]:'{"v":2}'});check(!f.c.Prefs.vals.drafts[key],'late old prefs cannot resurrect cleared version');
 // Exact user trigger: edited bucket component saved, fast close, new same-ID bucket.
 const bucket=fixture();bucket.run('Store.set("minecraft:bucket_entity_data",{Health:2,Age:-1000,AgeLocked:true});Drafts.flush();');bucket.submit();
 bucket.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"saved",item:{id:Store.doc().id,count:1,comps:clone(Store.doc().comps),removed:{},component_snbt:{}}});');
 check(Object.keys(bucket.store).length===0,'bucket Health/Age/AgeLocked confirmed draft cleared without delay');
 bucket.run('Store.docs.length=0;Store.open({src:{kind:"inventory",index:0},id:"minecraft:tadpole_bucket",count:1,comps:{},removed:{},snbt:{}},true);Drafts.offer(Store.doc());');
 check(!bucket.h.doc.getElementById('modal'),'same-slot same-ID replacement does not revive confirmed bucket draft');
 // A->B->A and A->B->C are distinct unsent edits even if A was the old base.
 for(const later of [1,3]){const x=fixture();x.edit(2);x.run('Drafts.flush();');x.submit();x.edit(later);x.saved(2);const k=x.run('Drafts.keyOf(Store.doc())'),p=JSON.parse(x.store[k]);
 check(p.count===later,'post-send count '+later+' retained immediately');check(JSON.parse(p.base).count===2,'post-send count '+later+' uses confirmed base B');
 check(x.run('snapOf(Store.doc())!==Store.doc().base'),'post-send count '+later+' remains dirty');check(x.h.sent.filter(x=>x[0]==='apply').length===1,'post-send edits never auto-Apply');}
 const failedLater=fixture();failedLater.edit(2);failedLater.run('Drafts.flush();');failedLater.submit();failedLater.edit(3);failedLater.run('Drafts.flush();');const lastGood=failedLater.store[failedLater.run('Drafts.keyOf(Store.doc())')];failedLater.rejectPut(true);failedLater.saved(2);
 check(failedLater.store[failedLater.run('Drafts.keyOf(Store.doc())')]===lastGood,'failed post-save replacement upload does not first erase last good newer draft');
 // Updating one submitted document must not touch another document/slot/world.
 const iso=fixture();iso.edit(2);iso.run('Drafts.flush();');iso.submit();iso.store['world|other-world|entity']='{"world":true}';
 iso.run('Store.open({src:{kind:"inventory",index:8},id:"minecraft:stone",count:1,comps:{},removed:{},snbt:{}},true);Store.setCount(4);Drafts.flush();');
 const other=iso.run('Drafts.keyOf(Store.doc())'),otherValue=iso.store[other];iso.saved(2);check(iso.store[other]===otherValue,'saved clears submitted doc rather than currently selected slot');check(!!iso.store['world|other-world|entity'],'saved does not clear other world draft');
 check(iso.run('Store.doc().count===4'),'saved does not overwrite selected different document');
 const sameSlot=fixture();sameSlot.edit(2);sameSlot.run('Drafts.flush();');sameSlot.submit();sameSlot.run('Store.open({src:{kind:"inventory",index:0},id:"minecraft:stone",count:1,comps:{},removed:{},snbt:{}},true);Store.setCount(5);Drafts.flush();');
 const replacementKey=sameSlot.run('Drafts.keyOf(Store.doc())'),replacementValue=sameSlot.store[replacementKey];sameSlot.saved(2);check(sameSlot.store[replacementKey]===replacementValue,'same slot different item ID draft not cleared by earlier save');
 const changedId=fixture();changedId.edit(2);changedId.run('Drafts.flush();Store.setItem("minecraft:salmon_bucket");Drafts.flush();');changedId.submit();changedId.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"saved",item:{id:"minecraft:salmon_bucket",count:2,comps:{},removed:{},component_snbt:{}}});');
 check(Object.keys(changedId.store).length===0,'saved changed-ID document retires its own earlier intermediate draft key');
 const sameKey=fixture();sameKey.edit(2);sameKey.run('Drafts.flush();');sameKey.submit();sameKey.run('Store.open({src:{kind:"inventory",index:0},id:"minecraft:tadpole_bucket",count:1,comps:{},removed:{},snbt:{}},true);Store.setCount(5);Drafts.flush();');
 const newest=sameKey.store[sameKey.run('Drafts.keyOf(Store.doc())')];sameKey.saved(2);check(sameKey.store[sameKey.run('Drafts.keyOf(Store.doc())')]===newest,'late saved for replaced document cannot delete newer same-key document version');
 // Nonmatching, rejected and unknown receipts are not success.
 for(const status of ['rejected','unknown','sent']){const x=fixture();x.edit(2);x.run('Drafts.flush();');x.submit();
 x.run('receiveEditorResult({requestId:"wrong",status:"saved",item:{id:Store.doc().id,count:2,comps:{},removed:{}}});');check(!!x.c.EditorBridge.pending,'unmatched saved does not consume pending');
 x.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:'+JSON.stringify(status)+',confirmed:false,reason:"test fixture"});');
 check(!!x.store[x.run('Drafts.keyOf(Store.doc())')],status+' retains unsaved disk intent');check(x.run('Store.doc().count===2&&snapOf(Store.doc())!==Store.doc().base'),status+' retains dirty doc');}
 // A creative 'sent' is not a save acknowledgement. Only a fresh matching item
 // retires this exact submitted version; rollback/later edits keep the offer.
 for(const later of [2,3])for(const actual of [1,2]){
  const x=fixture();x.edit(2);x.submit();x.edit(later);x.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"sent",confirmed:false});');
  const k=x.run('Drafts.keyOf(Store.doc())'),raw=x.store[k],packet=JSON.parse(raw);
  check(!!packet.submitted===(later===2),'creative submitted marker binds exact sent version '+later+'/'+actual);
  const next=fixture();next.run('Store.docs.length=0;Store.open({src:{kind:"inventory",index:0},id:"minecraft:tadpole_bucket",count:'+actual+',comps:{},removed:{},snbt:{}},true);');next.patch({[k]:raw});
  const matched=later===2&&actual===2;
  check(!!next.h.doc.getElementById('modal')===!matched,'fresh creative read only suppresses matching submitted intent '+later+'/'+actual);
  check(!!next.c.Prefs.vals.drafts[k]===!matched,'creative backup retained unless whole reread matches '+later+'/'+actual);
  check(!next.h.sent.some(([ch])=>ch==='apply'),'creative reread never writes automatically '+later+'/'+actual);
 }
 for(const matching of [true,false]){
  const x=fixture();x.run('Store.set("custom_name",{text:"Codec normalizes this to a string"});');x.submit();x.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"sent",confirmed:false,fingerprint:"'+('a'.repeat(64))+'"});');
  const k=x.run('Drafts.keyOf(Store.doc())'),raw=x.store[k];check(JSON.parse(raw).submitted==='a'.repeat(64),'typed native fingerprint retained without duplicating complete components');
  const next=fixture();next.run('Store.docs.length=0;Store.open({src:{kind:"inventory",index:0},id:"minecraft:tadpole_bucket",count:1,comps:{custom_name:"Codec normalizes this to a string"},removed:{},snbt:{},nativeBaseline:"'+((matching?'a':'b').repeat(64))+'"},true);');next.patch({[k]:raw});
  check(!!next.h.doc.getElementById('modal')===!matching,'native typed fingerprint handles Codec normalization and rejects different stack '+matching);
 }
 const unknown=fixture();unknown.edit(2);unknown.submit();unknown.edit(1);unknown.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"unknown"});');check(JSON.parse(unknown.store[unknown.run('Drafts.keyOf(Store.doc())')]).pending,'unknown reverse edit A preserved even when equal to old baseline');
 const timeout=fixture();timeout.edit(2);timeout.submit();timeout.edit(1);timeout.run('Drafts.flush();');timeout.h.timers.find(t=>t.ms===15000).fn();check(timeout.run('JSON.parse(Drafts.exportPackets()[0].value).pending'),'actual timeout handler cannot erase captured reverse pending edit');
 const badSaved=fixture();badSaved.edit(2);badSaved.submit();badSaved.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"saved"});');check(JSON.parse(badSaved.store[badSaved.run('Drafts.keyOf(Store.doc())')]).pending,'malformed saved without authoritative snapshot keeps unknown draft');
 const failedPage=fixture();failedPage.edit(2);failedPage.submit();failedPage.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:"rejected"});');const fresh=fixture();Object.assign(fresh.store,failedPage.store);fresh.patch(fresh.store);
 const recover=fresh.h.doc.getElementById('modal').querySelectorAll('.k-btn').find(x=>x.textContent==='恢复');recover.click();
 check(fresh.run('Store.doc().count===2&&snapOf(Store.doc())!==Store.doc().base'),'fresh page actual recovery button restores rejected item draft and dirty state');
 check(fresh.h.sent.filter(x=>x[0]==='apply').length===0,'recovery into fresh page does not automatically Apply');
 const uncertain=fixture();Object.assign(uncertain.store,unknown.store);uncertain.patch(uncertain.store);uncertain.h.doc.getElementById('modal').querySelectorAll('.k-btn').find(x=>x.textContent==='恢复').click();
 check(uncertain.run('Store.doc().draftUnknown===true'),'fresh-page recovery preserves unknown reverse-edit marker');
 // Real 5C84 failure: host saved B but its receipt timed out, leaving A-based draft A/C.
 // A changed authority baseline is not evidence that this unresolved draft was saved.
 for(const pending of [true,false])for(const count of pending?[1,2,3]:[3]){
  const source=fixture();source.edit(2);source.submit();source.edit(count);
  source.run('receiveEditorResult({requestId:EditorBridge.pending.id,status:'+JSON.stringify(pending?'unknown':'rejected')+'});');
  const k=source.run('Drafts.keyOf(Store.doc())'),packet=source.store[k],next=fixture();
  check(typeof packet==='string'&&JSON.parse(packet).count===count,'source contains the complete unresolved draft before reopening');
  next.run('Store.docs.length=0;Store.open({src:{kind:"inventory",index:0},id:"minecraft:tadpole_bucket",count:2,comps:{},removed:{},snbt:{}},true);');
  const authority=next.run('Store.doc().base');next.store[k]=packet;next.patch(next.store);
  check(next.store[k]===packet,'changed host baseline keeps '+(pending?'unknown':'rejected')+' draft count '+count);
  const offer=next.h.doc.getElementById('modal');check(!!offer&&offer.textContent.includes('变化'),'changed item baseline offers explicit recovery warning');
  if(pending)check(offer.textContent.includes('结果未知'),'unknown receipt warning is explicit on reopen');
  check(!next.h.sent.some(([ch,m])=>ch==='drafts'&&m.op==='clear'&&m.key===k),'offer must not clear mismatching unresolved draft');
  check(next.run('Drafts.exportPackets().length===0'),'closing an unanswered changed-baseline offer retains disk packet');
  offer.querySelectorAll('.k-btn').find(x=>x.textContent==='恢复').click();
  check(next.run('Store.doc().count')===count&&next.run('Store.doc().base')===authority,'restore keeps desired count and current authoritative baseline');
  if(pending)check(next.run('Store.doc().draftUnknown===true'),'changed-baseline restore retains unknown marker');
  check(!next.h.doc.getElementById('modal'),'restoring an unknown draft equal to authority does not recursively reopen the offer');
  const restored=JSON.parse(next.store[k]);check(restored.base===authority&&restored.count===count&&!!restored.pending===pending,'restored draft immediately persists against authority without losing pending state');
  check(!next.h.sent.some(([ch])=>ch==='apply'),'changed-baseline recovery never automatically writes game');
 }
 // Cancel in-flight old begin/chunks; strict ACK identity must not advance new write.
 const q=fixture();q.hold(true);q.run('Store.set("minecraft:custom_data",{large:new Array(16001).join("x")});Drafts.flush();');const old=JSON.parse(JSON.stringify(q.c.Drafts.busy)),qkey=old.key;
 check(old.op==='begin'&&q.c.Drafts.queue.length>3,'large upload has an unfinished begin and queued chunks');q.run('Drafts.clear('+JSON.stringify(qkey)+');');
 check(q.c.Drafts.busy.op==='clear'&&q.c.Drafts.queue.every(x=>x.key!==qkey),'clear cancels same-key active upload and queued chunks');const clear=JSON.parse(JSON.stringify(q.c.Drafts.busy));
 q.c.Drafts.onResult({...old,status:'accepted'});check(q.c.Drafts.busy.seq===clear.seq,'late old begin ACK cannot complete clear');
 q.run('Store.setCount(3);Drafts.flush();');const newBegin=JSON.parse(JSON.stringify(q.c.Drafts.busy));q.c.Drafts.onResult({...clear,status:'accepted'});check(q.c.Drafts.busy.seq===newBegin.seq,'late clear ACK cannot finish newer edit');
 q.c.Drafts.onResult({...newBegin,status:'accepted'});const part=JSON.parse(JSON.stringify(q.c.Drafts.busy));q.c.Drafts.onResult({...part,status:'accepted'});const next=JSON.parse(JSON.stringify(q.c.Drafts.busy));q.c.Drafts.onResult({...part,status:'accepted'});check(q.c.Drafts.busy.offset===next.offset,'duplicate previous chunk ACK cannot skip next chunk');
 const exported=q.run('Drafts.exportPackets()')[0];check(exported.value.length>8192&&JSON.parse(exported.value).count===3,'pagehide exports full latest draft independent of incomplete upload');
 q.run('Drafts.attach();');q.patch({[qkey]:'{"older":true}'});check(JSON.parse(q.c.Prefs.vals.drafts[qkey]).count===3,'old prefs snapshot cannot replace newer put');
 // A dismissed restoration modal retains recoverable data; obsolete callbacks cannot clear new packets.
 const modal=fixture();modal.edit(2);modal.run('Drafts.flush();');const mk=modal.run('Drafts.keyOf(Store.doc())'),mv=modal.store[mk];modal.c.Prefs.vals.drafts[mk]=mv;modal.edit(1);modal.run('Drafts.keyWritten={};Drafts.offer(Store.doc());');
 check(!!modal.h.doc.getElementById('modal'),'dirty persisted draft offers recovery');const drop=modal.h.doc.getElementById('modal').querySelectorAll('.k-btn').find(x=>x.textContent.includes('丢弃'));
 modal.run('closeModal();');check(modal.run('Drafts.exportPackets().length===0'),'dismissed offer does not silently clear old packet on close');
 const newer=JSON.parse(mv);newer.count=3;modal.c.Prefs.vals.drafts[mk]=JSON.stringify(newer);drop.click();check(!!modal.store[mk],'obsolete modal callback does not discard newer recovery version');check(modal.c.Drafts.offered[mk]===JSON.stringify(newer),'obsolete discard callback really ran and offered the newer recovery version');
 // Typed payload is never round-tripped through plain JSON numbers.
 const typed=fixture();typed.c.raw='{long:9007199254740993L,bytes:[B;1b,2b],ints:[I;3,4],longs:[L;9223372036854775807L]}';typed.run('Store.set("minecraft:custom_data",nbtToJson(nbtParse(raw)));Drafts.flush();');
 const tp=JSON.parse(typed.store[typed.run('Drafts.keyOf(Store.doc())')]);typed.c.tp=tp;check(typed.run('nbtMerge(nbtRestore(tp.comps,tp.nbt_types),null)').includes('9007199254740993L'),'typed long snapshot/restoration remains exact');
 check(typed.run('nbtMerge(nbtRestore(tp.comps,tp.nbt_types),null)').includes('[L;9223372036854775807L]'),'typed long array survives draft packet');
 typed.submit();typed.run('Store.set("minecraft:custom_data",nbtToJson(nbtParse("{next:9223372036854775806L,bytes:[B;3b,4b]}")));receiveEditorResult({requestId:EditorBridge.pending.id,status:"saved",item:{id:Store.doc().id,count:1,comps:JSON.parse(EditorBridge.pending.snap).comps,removed:{},component_snbt:{"minecraft:custom_data":raw}}});');
 const postTyped=JSON.parse(typed.store[typed.run('Drafts.keyOf(Store.doc())')]);typed.c.postTyped=postTyped;check(typed.run('nbtMerge(nbtRestore(postTyped.comps,postTyped.nbt_types),null)').includes('9223372036854775806L'),'typed post-send edit survives authoritative baseline replacement');
 typed.run('openNestedItem({id:"minecraft:stone",count:1,comps:{},removed:{}},{render:function(){},commit:function(){}});Store.setCount(64);');
 check(typed.run('JSON.parse(Drafts.exportPackets()[0].value).id')==='minecraft:tadpole_bucket','real nested-item entry exports detached item parent rather than active child');
 check(typed.run('Drafts.exportPackets()[0].value').includes('9223372036854775806'),'detached item parent retains complete typed unsaved content on close');
 // Parent WorldDrafts lives independently while NestedItem swaps the top-level item Store.
 typed.run('NestedItem={parent:true};WE.w={};WorldDrafts.exportPacket=function(){return {key:"world|scope|parent",value:"{}"}};');
 check(typed.run('Drafts.exportPackets().length===0'),'child item never exported as parent inventory slot');check(typed.run('WorldDrafts.exportPacket().key')==='world|scope|parent','world parent exporter remains available during child editing');
 if(out)fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PASS',checks},null,2));
 console.log('PASS ItemDraftLifecycle '+checks+' production source checks, not game');
}catch(e){if(out)fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'FAIL',checks,error:e.stack},null,2));throw e;}
