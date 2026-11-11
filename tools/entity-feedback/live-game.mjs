import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {client} from './live-rpc.mjs';
const [out,phase='first',pattern='.*',attempt='01']=process.argv.slice(2),c=client(out),{request,js,until,delay}=c;
const results=[],file=join(out,phase+'-results-'+attempt+'.json'),selected=new RegExp(pattern),uuid='00000001-0000-0002-0000-000300000004';
const save=()=>writeFileSync(file,JSON.stringify({phase,attempt,hash:'0d29cbafc66bb95a9629a36d5507fe55d77bba2c17cee6b863d053b1e6c76a3c',results},null,2));
const cmd=command=>request('serverCommand',{command});
const entity=async()=> (await request('entityFields',{uuid})).entityFields;
const snap=async name=>{if(name.startsWith('effects-'))await js('(function(){var e=document.querySelector(".k-effects");if(e)e.scrollIntoView({block:"center"});return true;})()');await delay(250);await request('screenshot',{name:phase+'-'+name+'.png'});};
async function test(name,fn){if(!selected.test(name)){results.push({name,status:'NOT_RUN'});save();return;}try{const evidence=await fn();results.push({name,status:'PASS',evidence});save();console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});save();await snap(name+'-FAILED').catch(()=>{});throw e;}}
async function click(expr){
 for(let retry=0;retry<3;retry++){
 const geometry=await js('(function(){var old=document.getElementById("effects-action");if(old)old.removeAttribute("id");var e=('+expr+');if(!e)throw Error("Control absent: "+'+JSON.stringify(expr)+');e.id="effects-action";e.scrollIntoView({block:"center"});window.effectsDown=false;e.addEventListener("mousedown",function(){window.effectsDown=true;});return {tag:e.tagName,text:e.textContent};})()');
 await delay(80);let actual;try{actual=await request('pagePointer',{selector:'#effects-action'});}catch(e){if(retry<2&&e.message.includes('No visible page element')){await delay(250);continue;}throw e;}assert.equal(await js('window.effectsDown'),true,'real mousedown reaches actual control');return {geometry,actual};
 }
}
const labelExpr=(root,label)=>'Array.prototype.slice.call(document.querySelectorAll('+JSON.stringify(root)+')).filter(function(e){return e.textContent.trim()==='+JSON.stringify(label)+';})[0]';
const button=label=>click(labelExpr('#modal .k-btn',label));
async function tab(id){if(await js('Array.prototype.slice.call(document.querySelectorAll("#tabbar .ed-tab.on")).some(function(e){return e.textContent.trim()==='+JSON.stringify(id)+';})'))return;return click('Array.prototype.slice.call(document.querySelectorAll("#tabbar .ed-tab")).filter(function(e){return e.textContent.trim()==='+JSON.stringify(id)+';})[0]');}
async function audit(){await js('(function(){window.effectsAudit={sent:[],received:[],held:[]};var send=oriel.send;oriel.send=function(ch,p){var value=JSON.parse(JSON.stringify(p||null));effectsAudit.sent.push({channel:ch,payload:value});if(ch==="drafts"&&window.holdDrafts){effectsAudit.held.push(value);return true;}return send.apply(this,arguments);};oriel.on("patch",function(p){if(p.key==="result")effectsAudit.received.push(p.value);});oriel.on("data",function(d,key){if(key==="result")effectsAudit.received.push(d.result||d);else if(d&&d.result)effectsAudit.received.push(d.result);});return true;})()');}
async function openEntity(){
 await request('close');await delay(200);const e=await entity();await request('openEntity',{entityId:e.entityId});await until('typeof WE!=="undefined"&&!!WE.w&&WE.w.kind==="entity"');await audit();return await js('({slot:WE.w.slot,revision:WE.w.revision,snbt:WE.w.snbt,scope:Prefs.vals.worldDraftScope})');
}
async function effects(){await tab('属性');await until('!!document.querySelector(".k-effects .k-add")');}
async function expandEffect(){if(!await js('!!document.querySelector(".k-effects .k-xbody")'))await click('document.querySelector(".k-effects .k-xhead")');}
async function numberInput(label,text){
 const hit=await click('Array.prototype.slice.call(document.querySelectorAll(".k-effects .k-fld")).filter(function(e){return e.textContent.indexOf('+JSON.stringify(label)+')>=0;})[0]&&Array.prototype.slice.call(document.querySelectorAll(".k-effects .k-fld")).filter(function(e){return e.textContent.indexOf('+JSON.stringify(label)+')>=0;})[0].querySelector("input.k-numin")');
 await request('pageKey',{key:'a',ctrl:true});await request('pageType',{text});await request('pageKey',{key:'Tab'});await delay(100);return hit;
}
async function apply(expected='saved'){
 await click('document.querySelector("#topbar .k-apply")');
 const matched=await until('(function(){var a=effectsAudit.sent.filter(function(x){return x.channel==="apply";});if(!a.length)return null;var id=a[a.length-1].payload.requestId;var r=effectsAudit.received.filter(function(x){return x.requestId===id;})[0];return r?{sent:a[a.length-1],result:r,count:a.length,dirty:weDirty(),pending:WE.pending,text:WE.text}:null;})()','matching real apply result');
 assert.equal(matched.count,1,'one production apply');assert.equal(matched.result.status,expected);if(expected==='saved')assert.equal(matched.dirty,false);else assert.equal(matched.dirty,true);return matched;
}
async function hostEffects(){const raw=await entity();const effects=await js('nbtToJson(nbtParse('+JSON.stringify(raw.snbt)+')).active_effects||[]');return {raw,effects};}
async function dataTab(){await tab('数据');await until('!!document.querySelector("textarea.kc-ta")');}
async function rawEdit(body){await dataTab();return await js('(function(){var e=document.querySelector("textarea.kc-ta"),ast=nbtParse(e.value);'+body+';e.value=nbtPrint(ast,true);e.dispatchEvent(new Event("input",{bubbles:true}));return {text:WE.text,dirty:weDirty()};})()');}
function prefs(){return JSON.parse(readFileSync(join(out,'host/config/cadeditor-ui.json'),'utf8'));}
async function reopenCheck(check){await openEntity();assert.equal(await js('!!document.getElementById("modal")'),false,'confirmed saved draft is clear');const e=await hostEffects();await check(e.effects);assert.equal(await js('weDirty()'),false);return {host:e,page:await js('({text:WE.text,revision:WE.w.revision,dirty:weDirty()})')};}

try{
 const connected=await c.connected();await delay(500);assert(connected.integrated);const mods=JSON.parse(readFileSync(join(out,'host/mods.json'),'utf8'));assert.equal(mods.filter(x=>x.id==='oriel').length,1);assert(mods.some(x=>x.id==='oriel'&&x.version==='0.15.0'));
 writeFileSync(join(out,phase+'-environment-'+attempt+'.json'),JSON.stringify({connected,mods,installed:JSON.parse(readFileSync(join(out,'host/installed-jars.json'),'utf8')),process:JSON.parse(readFileSync(join(out,'active-process.json'),'utf8'))},null,2));
 if(phase==='first'){
  if(!existsSync(join(out,'fixture.json'))){
   await request('operator',{name:'LanHost',grant:true});await cmd('gamemode creative LanHost');await cmd('fill -3 99 -3 3 99 3 minecraft:stone');await cmd('fill -3 100 -3 3 104 3 minecraft:air');await cmd('tp LanHost 1.5 100 2.5');
   await cmd('summon minecraft:slime 0.5 100 0.5 {UUID:[I;1,2,3,4],Size:1,NoAI:1b,NoGravity:1b,PersistenceRequired:1b,Invulnerable:1b}');await delay(500);writeFileSync(join(out,'fixture.json'),JSON.stringify(await entity(),null,2));
  }
  await test('effects-add-default-bools',async()=>{
   await openEntity();await effects();await click('document.querySelector(".k-effects .k-add")');
   const speed='Array.prototype.slice.call(document.querySelectorAll(".addrow")).filter(function(e){return e.getAttribute("data-full")==="minecraft:speed";})[0]';await until('!!('+speed+')');await click(speed);
   await click('document.querySelector(".pickwin .k-mf .k-btn.pri")');await until('weDirty()');const draft=await js('WE.text');const receipt=await apply();const reopened=await reopenCheck(fx=>{assert.equal(fx.length,1);assert.equal(fx[0].id,'minecraft:speed');assert((fx[0].duration||0)>0);});await effects();await snap('effects-added');return {draft,receipt,reopened};
  });
  await test('effects-amplifier',async()=>{
   await openEntity();await effects();await expandEffect();const input=await numberInput('效果等级','3');const draft=await js('WE.text');const receipt=await apply();const reopened=await reopenCheck(fx=>assert.equal(fx[0].amplifier,2));await effects();await snap('effects-amplifier');return {input,draft,receipt,reopened};
  });
  await test('effects-duration',async()=>{
   await openEntity();await effects();await expandEffect();const input=await numberInput('持续时间','120');const receipt=await apply();const reopened=await reopenCheck(fx=>assert(fx[0].duration>1900&&fx[0].duration<=2400));return {input,receipt,reopened};
  });
  await test('effects-permanent',async()=>{
   await openEntity();await effects();await expandEffect();const hit=await click(labelExpr('.k-effects .k-togrow','永久持续（不会消失）'));const receipt=await apply();const reopened=await reopenCheck(fx=>assert.equal(fx[0].duration,-1));await effects();await expandEffect();await snap('effects-permanent');return {hit,receipt,reopened};
  });
  for(const [name,label,key,defaultValue] of [['particles-default','显示粒子','show_particles',true],['ambient-default','信标式（粒子更淡）','ambient',false],['icon-default','在屏幕角落显示效果图标','show_icon',true]])await test('effects-'+name,async()=>{
   await openEntity();await effects();await expandEffect();await click(labelExpr('.k-effects .k-togrow',label));await click(labelExpr('.k-effects .k-togrow',label));const draft=await js('WE.text');
   if(!await js('weDirty()')){assert.equal(name,'icon-default');assert.equal(await js('effectsAudit.sent.filter(function(x){return x.channel==="apply";}).length'),0);return {noOp:true,reason:'original show_icon byte1 returns exactly to authoritative value; no write required',draft,host:await hostEffects()};}
   const receipt=await apply();const reopened=await reopenCheck(fx=>assert.equal(fx[0][key]===undefined?defaultValue:!!fx[0][key],defaultValue));return {draft,receipt,reopened};
  });
  await test('effects-delete',async()=>{
   await openEntity();await effects();await expandEffect();await click(labelExpr('.k-effects .k-btn','删除这个效果'));const receipt=await apply();const reopened=await reopenCheck(fx=>assert.equal(fx.length,0));await effects();await snap('effects-deleted');return {receipt,reopened};
  });
  await test('effect-invalid-host-reject-close-restore',async()=>{
   const opened=await openEntity(),before=await entity();const edit=await rawEdit('ast.map.active_effects=nbtParse(\'[{id:"nbt_audit:missing",duration:-1}]\');if(ast.keys.indexOf("active_effects")<0)ast.keys.push("active_effects");ast.map.audit_typed=nbtParse(\'{long:9007199254740993L,ba:[B;1b,2b],ia:[I;3,4],la:[L;9223372036854775807L],unknown:{short:2s}}\');ast.keys.push("audit_typed")');
   const receipt=await apply('rejected');assert.equal(receipt.result.code,'invalid_nbt');await snap('invalid-effect-rejected-dirty');const after=await entity();assert(!after.snbt.includes('nbt_audit:missing'));assert(!after.snbt.includes('audit_typed'));
   const exported=await js('WorldDrafts.exportPacket()');await request('close');await delay(250);assert.deepEqual({...JSON.parse(prefs().drafts[exported.key]),t:0},{...JSON.parse(exported.value),t:0});const fresh=await openEntity();assert.notEqual(fresh.slot.token,opened.slot.token);await until('!!document.getElementById("modal")');await snap('same-target-restore-offer');await button('恢复草稿');await until('weDirty()');assert.equal(await js('WE.text'),edit.text);assert.equal(await js('effectsAudit.sent.filter(function(x){return x.channel==="apply";}).length'),0,'restore never auto applies');await dataTab();await snap('same-target-restored');return {opened,before,edit,receipt,after,exported,fresh,restored:await js('({text:WE.text,dirty:weDirty(),conflict:WE.draftConflict})')};
  });
  await test('large-incomplete-upload-pagehide',async()=>{
   if(!await js('!!WE.w'))await openEntity();await dataTab();await audit();await js('window.holdDrafts=true;true');
   const edit=await rawEdit('ast.map.large=nbtParse(snbtStr("owned-large-"+"x".repeat(12000)));if(ast.keys.indexOf("large")<0)ast.keys.push("large")');
   const held=await js('(function(){WorldDrafts.flush();return {packet:WorldDrafts.exportPacket(),busy:Drafts.busy,queue:Drafts.queue.length,held:effectsAudit.held,slot:WE.w.slot,revision:WE.w.revision};})()');assert(held.packet.value.length>8192);assert(held.busy);assert(held.queue>0);assert(held.held.some(x=>x.op==='begin'));assert(!held.held.some(x=>x.op==='chunk'&&x.done));
   await request('close');await delay(150);const disk=prefs().drafts[held.packet.key];assert.deepEqual({...JSON.parse(disk),t:0},{...JSON.parse(held.packet.value),t:0},'pagehide saves complete packet despite unfinished real upload; capture timestamp may differ');writeFileSync(join(out,'restart-expected.json'),JSON.stringify({uuid,key:held.packet.key,value:disk,text:edit.text,slot:held.slot,revision:held.revision},null,2));return {edit,held,diskBytes:Buffer.byteLength(disk),source:'original drafts begin held; no fake scope/result; pagehide native host snapshot'};
  });
 }else{
  await test('same-world-new-jvm-disk-restore',async()=>{
   const expected=JSON.parse(readFileSync(join(out,'restart-expected.json'),'utf8')),host=await entity();assert(!host.snbt.includes('audit_typed'));assert.equal(prefs().drafts[expected.key],expected.value);
   const opened=await openEntity();assert.equal(await js('WorldDrafts.key(WE.w)'),expected.key);assert.notEqual(opened.slot.token,expected.slot.token);await until('!!document.getElementById("modal")');await snap('new-jvm-restore-offer');await button('恢复草稿');await until('weDirty()');const restored=await js('({text:WE.text,dirty:weDirty(),key:WorldDrafts.key(WE.w),conflict:WE.draftConflict,applies:effectsAudit.sent.filter(function(x){return x.channel==="apply";})})');
   assert.equal(restored.text,expected.text);assert.equal(restored.applies.length,0);for(const token of ['9007199254740993L','[B;','[I;','[L;','9223372036854775807L','2s'])assert(restored.text.includes(token),'restored exact typed '+token);await dataTab();await snap('new-jvm-restored-typed');return {expected,host,opened,restored,gameDir:join(out,'host'),boundary:'same canonical actual world path and config; new JVM/token; no automatic Apply'};
  });
 }
 save();if(pattern==='.*'){
  await request('stop');writeFileSync(join(out,phase+'.complete'),'completed');
 }
}catch(e){save();writeFileSync(join(out,phase+'-error-'+attempt+'.txt'),e.stack);console.error(e.stack);process.exitCode=1;}
