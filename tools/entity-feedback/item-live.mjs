import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {client} from './live-rpc.mjs';
const [out,phase='first']=process.argv.slice(2),c=client(out),{request,js,until,delay}=c;
const hash='5c8463ec583c1863277ae2a7c208341b2202fb3e1f0f8ac18e87ca49beeb951f',results=[];
const write=(name,v)=>writeFileSync(join(out,phase+'-'+name+'.json'),JSON.stringify(v,null,2));
const save=()=>write('results',{phase,hash,freeze:false,results});
const command=command=>request('serverCommand',{command});
const prefs=()=>JSON.parse(readFileSync(join(out,'host/config/cadeditor-ui.json'),'utf8'));
const snap=async name=>{await delay(200);return request('screenshot',{name:phase+'-'+name+'.png'});};
const label=(root,text)=>'Array.prototype.slice.call(document.querySelectorAll('+JSON.stringify(root)+')).filter(function(e){return e.textContent.trim()==='+JSON.stringify(text)+';})[0]';
async function click(expr){
 await js('(function(){var old=document.getElementById("item-test-control");if(old)old.removeAttribute("id");var e=('+expr+');if(!e)throw Error("control absent");e.id="item-test-control";e.scrollIntoView({block:"center"});window.itemTestDown=false;e.addEventListener("mousedown",function(){window.itemTestDown=true;});for(var p=e.parentElement;p;p=p.parentElement){var s=getComputedStyle(p);if((s.overflowY==="auto"||s.overflowY==="scroll")&&p.scrollHeight>p.clientHeight){var r=e.getBoundingClientRect(),b=p.getBoundingClientRect();if(r.bottom>b.bottom-3)p.scrollTop+=r.bottom-b.bottom+5;else if(r.top<b.top+3)p.scrollTop+=r.top-b.top-5;}}return true;})()');
 await delay(100);const hit=await request('pagePointer',{selector:'#item-test-control'});assert.equal(await js('window.itemTestDown'),true,'real mousedown');return hit;
}
async function audit(){return js('(function(){window.itemAudit={sent:[],results:[],held:[],draftResults:[],heldBegins:[],holdResults:false,holdBegin:false};var originalSend=oriel.send,originalResult=receiveEditorResult,originalDraft=Drafts.onResult;oriel.send=function(ch,p){itemAudit.sent.push({at:Date.now(),channel:ch,payload:JSON.parse(JSON.stringify(p||null))});return originalSend.apply(this,arguments);};receiveEditorResult=function(r){itemAudit.results.push({at:Date.now(),value:JSON.parse(JSON.stringify(r))});if(itemAudit.holdResults){itemAudit.held.push(r);return;}return originalResult(r);};window.itemRelease=function(){itemAudit.holdResults=false;var list=itemAudit.held.splice(0);list.forEach(function(r){originalResult(r);});return list;};Drafts.onResult=function(r){itemAudit.draftResults.push({at:Date.now(),value:JSON.parse(JSON.stringify(r))});if(itemAudit.holdBegin&&r&&r.op==="begin"){itemAudit.heldBegins.push(r);return;}return originalDraft.call(Drafts,r);};return true;})()');}
async function page(){return js('({id:Store.doc().id,count:Store.doc().count,base:Store.doc().base,snap:snapOf(Store.doc()),dirty:snapOf(Store.doc())!==Store.doc().base,unknown:!!Store.doc().draftUnknown,src:Store.doc().src,key:Drafts.keyOf(Store.doc()),pending:EditorBridge.pending&&EditorBridge.pending.id,audit:itemAudit,packets:Drafts.exportPackets()})');}
async function host(name){const state=await request('state');const p=state.serverPlayers.find(x=>x.name==='LanHost');assert(p);const value={at:Date.now(),inventory:p.inventory[0],snbt:p.inventorySnbt[0]};if(name)write(name+'-host',value);return value;}
async function open(){
 // A connected level can still be LevelLoadingScreen on the first ticks of a
 // new JVM. Never consume the only I key while the vanilla loader owns input.
 let loaded=false;for(let n=0;n<100;n++){const s=await request('state');if(s.connected&&!s.screen){loaded=true;break;}await delay(150);}assert(loaded,'vanilla level fully loaded before editor key');
 await request('open');await until('typeof Store!=="undefined"&&Store.docs.length>0&&Store.doc().src.index===0');await audit();return page();
}
async function fixture(id){await request('close');await command('item replace entity LanHost hotbar.0 with minecraft:'+id+' 1');await request('select',{slot:0});await delay(300);const h=await host();const p=await open();assert.equal(p.id,'minecraft:'+id);assert.equal(p.count,1);assert.equal(await js('!!document.getElementById("modal")'),false,'fresh fixture has no restore modal');return {host:h,page:p};}
async function raw(text){
 if(!await js('UI.tab==="item-stack"'))await click(label('#tabbar .ed-tab','物品栈'));
 if(!await js('UI.cmdFmt==="snbt"'))await click(label('#edtools .k-segi','SNBT'));
 await until('!!document.querySelector(".item-raw textarea.kc-ta")');
 await click('document.querySelector(".item-raw textarea.kc-ta")');
 assert.equal(await js('document.activeElement===document.querySelector(".item-raw textarea.kc-ta")'),true,'native focused textarea');
 await request('pageKey',{key:'a',ctrl:true});
 if(text.length>8192){await request('clipboardPush',{text});try{await request('pageKey',{key:'v',ctrl:true});}finally{await request('clipboardPop');}}else await request('pageType',{text});
 await until('document.querySelector(".item-raw textarea.kc-ta").value==='+JSON.stringify(text),'actual typed raw value');
 assert.equal(await js('itemRawBlocked()'),false,'valid production raw handler');return page();
}
const stack=(id,count,custom)=>'{id:"minecraft:'+id+'",count:'+count+',components:{'+(custom?'"minecraft:custom_data":'+custom:'')+'}}';
async function submitHeld(){await js('itemAudit.holdResults=true');await click('document.querySelector("#topbar .k-apply")');await until('!!document.querySelector("#modal .k-mf .k-btn.pri")');await click('document.querySelector("#modal .k-mf .k-btn.pri")');
 await until('itemAudit.held.length>0','real host reply captured');const p=await page(),sent=p.audit.sent.filter(x=>x.channel==='apply');assert.equal(sent.length,1);const id=sent[0].payload.requestId;assert(id);const r=p.audit.held.find(x=>x.requestId===id);assert(r,'matching actual response');assert.equal(r.status,'saved');assert.equal(p.pending,id);return {requestId:id,receipt:r,page:p};}
async function restore(expected){const fresh=await open();await until('!!document.getElementById("modal")','disk restore modal');await snap(expected+'-restore-offer');await click(label('#modal .k-btn','恢复'));await until('!document.getElementById("modal")');return {fresh,page:await page(),host:await host(expected+'-reopened')};}
async function test(name,fn){try{const evidence=await fn();results.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL '+name+' '+e.stack);write(name+'-failure',{error:e.stack,page:await page().catch(()=>null),prefs:existsSync(join(out,'host/config/cadeditor-ui.json'))?prefs():null});await snap(name+'-FAILED').catch(()=>{});}save();}
async function afterSend(name,later){
 const initial=await fixture('stone');await raw(stack('stone',2));const sent=await submitHeld(),authority=await host(name+'-savedB-before-release');assert.equal(authority.inventory.count,2);
 const edited=await raw(stack('stone',later));assert.equal(edited.count,later);write(name+'-critical-before-release',{initial,sent,authority,edited,at:Date.now()});
 const released=await js('itemRelease()');assert.deepEqual(released,[sent.receipt]);const p=await page();assert.equal(p.pending,null);assert.equal(p.count,later);assert.equal(JSON.parse(p.base).count,2);assert(p.dirty);assert.equal(p.audit.sent.filter(x=>x.channel==='apply').length,1);await snap(name+'-later-dirty');
 await request('close');const disk=prefs();write(name+'-disk-close',disk);const record=JSON.parse(disk.drafts[p.key]);assert.equal(record.count,later);assert.equal(JSON.parse(record.base).count,2);
 const restored=await restore(name);assert.equal(restored.page.count,later);assert(restored.page.dirty);assert.equal(restored.page.audit.sent.filter(x=>x.channel==='apply').length,0);assert.equal(restored.host.inventory.count,2);await snap(name+'-restored');return {initial,sent,authority,released,confirmed:p,disk:record,restored};
}
async function unknown(){
 const initial=await fixture('dirt');await raw(stack('dirt',2));const sent=await submitHeld();const authority=await host('unknown-savedB');assert.equal(authority.inventory.count,2);await raw(stack('dirt',3));
 await until('!EditorBridge.pending','real 15000ms unknown timeout');const p=await page();assert(p.unknown);assert(p.dirty);assert.equal(p.count,3);assert.equal(p.audit.sent.filter(x=>x.channel==='apply').length,1);assert(Date.now()-p.audit.sent.find(x=>x.channel==='apply').at>=14500);
 await snap('unknown-timeout-dirty');write('unknown-before-close',{initial,sent,authority,page:p});await request('close');const disk=prefs();write('unknown-disk-before-reopen',disk);assert.equal(JSON.parse(disk.drafts[p.key]).count,3);
 const fresh=await open();await delay(1500);write('unknown-after-reopen',{fresh,page:await page(),prefs:prefs(),host:await host('unknown-reopened')});
 assert.equal(await js('!!document.getElementById("modal")'),true,'unknown C must remain recoverable after authoritative B differs from old A');
 await click(label('#modal .k-btn','恢复'));const restored=await page();assert.equal(restored.count,3);assert(restored.dirty);assert.equal(restored.audit.sent.filter(x=>x.channel==='apply').length,0);await snap('unknown-restored');return {initial,sent,authority,page:p,disk,restored};
}
async function large(){
 const initial=await fixture('paper');const custom='{unsafe:9007199254740993L,bytes:[B;1b,-2b],ints:[I;3,-4],longs:[L;9223372036854775807L],small:2s,"audit:unknown":{preserve:"yes"},padding:"'+('x'.repeat(12000))+'"}';
 await js('itemAudit.holdBegin=true');await raw(stack('paper',1,custom));await js('Drafts.flush();true');await until('itemAudit.heldBegins.length>0','real begin accepted');
 const before=await page(),transfer=await js('({busy:Drafts.busy,queue:Drafts.queue,held:itemAudit.heldBegins})');assert.equal(transfer.busy.op,'begin');assert.equal(transfer.held[0].status,'accepted');assert(transfer.queue.length>0);assert(!before.audit.sent.some(x=>x.channel==='drafts'&&x.payload.op==='chunk'));
 const packet=before.packets.find(x=>x.key===before.key);assert(packet.value.length>8192);const canonical=await js('nbtPrint(nbtParse(nbtComponentText(Store.doc(),"custom_data")),false)');write('large-critical-before-close',{initial,page:before,transfer,canonical});
 await request('close');const disk=prefs();write('large-disk-close',disk);const actual=JSON.parse(disk.drafts[packet.key]),expected=JSON.parse(packet.value);delete actual.t;delete expected.t;assert.deepEqual(actual,expected,'pagehide complete packet independently of chunk ACK');
 const native=await host('large-unsent');assert(!native.snbt.includes('audit:unknown'));const record={key:packet.key,value:disk.drafts[packet.key],custom,canonical,canonicalGameDir:realpathSync(join(out,'host')),canonicalWorld:realpathSync(join(out,'host/saves/LanFixture')),src:before.src,host:native};writeFileSync(join(out,'restart-expected.json'),JSON.stringify(record,null,2));return {packetLength:packet.value.length,transfer,disk:actual,host:native};
}
async function restart(){const expected=JSON.parse(readFileSync(join(out,'restart-expected.json'),'utf8'));assert.equal(realpathSync(join(out,'host')),expected.canonicalGameDir);assert.equal(realpathSync(join(out,'host/saves/LanFixture')),expected.canonicalWorld);write('disk-before-open',prefs());assert.equal(prefs().drafts[expected.key],expected.value);const restored=await restore('large');assert.notEqual(restored.page.src.token,expected.src.token);assert(restored.page.dirty);assert.equal(restored.page.audit.sent.filter(x=>x.channel==='apply').length,0);assert.equal(restored.host.snbt,expected.host.snbt);const typed=await js('nbtPrint(nbtParse(nbtComponentText(Store.doc(),"custom_data")),false)');assert.equal(typed,expected.canonical);for(const token of ['9007199254740993L','[B;','[I;','[L;','9223372036854775807L','2s','audit:unknown'])assert(typed.includes(token),token);write('large-restored-native-types',{typed,restored});await snap('large-restored-types');return {restored,typed,canonicalGameDir:expected.canonicalGameDir,noAutomaticApply:true};}
try{assert.equal(JSON.parse(readFileSync(join(out,'configuration.json'),'utf8')).sha256.toLowerCase(),hash);const connected=await c.connected();assert(connected.integrated);const mods=JSON.parse(readFileSync(join(out,'host/mods.json'),'utf8'));assert.equal(mods.filter(x=>x.id==='oriel'&&x.version==='0.15.0').length,1);write('environment',{connected,mods,installed:JSON.parse(readFileSync(join(out,'host/installed-jars.json'),'utf8')),process:JSON.parse(readFileSync(join(out,'active-process.json'),'utf8'))});
 if(phase==='first'){await request('operator',{name:'LanHost',grant:true});await command('gamemode creative LanHost');await test('post-send-A',()=>afterSend('post-send-A',1));await test('post-send-C',()=>afterSend('post-send-C',3));await test('unknown-preserved',unknown);await test('large-incomplete-pagehide',large);}else if(existsSync(join(out,'restart-expected.json')))await test('large-new-JVM-restore',restart);else {results.push({name:'large-new-JVM-restore',status:'NOT_RUN',reason:'first phase did not persist a complete restart fixture'});save();}
}catch(e){write('fatal',{error:e.stack});console.error(e.stack);process.exitCode=1;}finally{save();try{await request('stop',{},6000);}catch(e){write('stop-error',{error:e.stack});}writeFileSync(join(out,phase+'.complete'),'completed');}
