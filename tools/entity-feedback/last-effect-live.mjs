import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {client} from './live-rpc.mjs';
const [out,attempt='01']=process.argv.slice(2),c=client(out),{request,js,until,delay}=c;
const hash='8e3e30f726b78df4f5e2afee15f723acd9f7db73968f0c369efbb67cfa6c88fd',uuid='00000001-0000-0002-0000-000300000004';
assert.equal(JSON.parse(readFileSync(join(out,'configuration.json'),'utf8')).sha256.toLowerCase(),hash);
const results=[],write=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2));
const save=()=>write('last-effect-results-'+attempt+'.json',{hash,attempt,freeze:false,scope:'four actual whole-key deletion scenarios only',results});
const label=(root,text)=>'Array.prototype.slice.call(document.querySelectorAll('+JSON.stringify(root)+')).filter(function(e){return e.textContent.trim()==='+JSON.stringify(text)+';})[0]';
const command=command=>request('serverCommand',{command});
async function click(expr){
 for(let retry=0;retry<3;retry++){
  const geometry=await js('(function(){var old=document.getElementById("last-effect-action");if(old)old.removeAttribute("id");var e=('+expr+');if(!e)throw Error("Actual control absent");e.id="last-effect-action";e.scrollIntoView({block:"center"});window.lastEffectDown=false;e.addEventListener("mousedown",function(){window.lastEffectDown=true;});return {text:e.textContent,tag:e.tagName};})()');
  for(let pass=0;pass<2;pass++){await js('(function(){var e=document.getElementById("last-effect-action");if(!e)return null;for(var p=e.parentElement;p;p=p.parentElement){var s=getComputedStyle(p);if((s.overflowY==="auto"||s.overflowY==="scroll")&&p.scrollHeight>p.clientHeight){var r=e.getBoundingClientRect(),b=p.getBoundingClientRect();if(r.bottom>b.bottom-3)p.scrollTop+=r.bottom-b.bottom+5;else if(r.top<b.top+3)p.scrollTop+=r.top-b.top-5;}}return true;})()');await delay(80);}
  let native;try{native=await request('pagePointer',{selector:'#last-effect-action'});}catch(e){if(retry<2&&e.message.includes('No visible page element')){await delay(250);continue;}throw e;}
  assert.equal(await js('window.lastEffectDown'),true,'real mousedown reaches control');return {geometry,native};
 }
}
async function snap(name){await delay(150);await request('screenshot',{name:'last-'+attempt+'-'+name+'.png'});}
async function audit(){await js('(function(){window.lastEffectAudit={sent:[],received:[]};var send=oriel.send;oriel.send=function(ch,p){if(ch==="apply")lastEffectAudit.sent.push({at:Date.now(),payload:JSON.parse(JSON.stringify(p))});return send.apply(this,arguments);};function receive(v){if(v&&v.requestId)lastEffectAudit.received.push({at:Date.now(),value:v});}oriel.on("patch",function(p){if(p.key==="result")receive(p.value);});oriel.on("data",function(d,k){if(k==="result")receive(d.result||d);else if(d&&d.result)receive(d.result);});return true;})()');}
async function readHost(name){const at=Date.now(),raw=(await request('entityFields',{uuid})).entityFields;write(name+'-native.json',{at,raw});const effects=await js('nbtToJson(nbtParse('+JSON.stringify(raw.snbt)+')).active_effects||[]');const value={at,raw,effects};write(name+'-host.json',value);return value;}
async function open(){await request('close');await delay(160);const raw=(await request('entityFields',{uuid})).entityFields;await request('openEntity',{entityId:raw.entityId});await until('typeof WE!=="undefined"&&!!WE.w&&WE.w.kind==="entity"');await audit();return await js('({slot:WE.w.slot,revision:WE.w.revision,snbt:WE.w.snbt})');}
async function effects(){if(!await js('Array.prototype.slice.call(document.querySelectorAll("#tabbar .ed-tab.on")).some(function(e){return e.textContent.trim()==="属性";})'))await click(label('#tabbar .ed-tab','属性'));await until('!!document.querySelector(".k-effects .k-add")');}
async function expand(){if(!await js('!!document.querySelector(".k-effects .k-xbody")'))await click('document.querySelector(".k-effects .k-xhead")');}
async function discardIfOffered(){await open();if(await js('!!document.getElementById("modal")'))await click(label('#modal .k-btn','丢弃此草稿'));assert.equal(await js('weDirty()'),false);}
async function applyAndCapture(name){
 const hit=await click('document.querySelector("#topbar .k-apply")');
 const receipt=await until('(function(){var a=lastEffectAudit.sent;if(!a.length)return null;var s=a[a.length-1],r=lastEffectAudit.received.filter(function(x){return x.value.requestId===s.payload.requestId;})[0];return r?{sent:s,result:r.value,receivedAt:r.at,count:a.length,dirty:weDirty(),text:WE.text}:null;})()','matching real host result');
 write(name+'-receipt.json',receipt);
 const after=await readHost(name+'-immediate-after');
 assert.equal(receipt.count,1);assert.equal(receipt.sent.payload.requestId,receipt.result.requestId);assert.equal(await js('Object.prototype.hasOwnProperty.call(nbtParse('+JSON.stringify(receipt.sent.payload.snbt)+').map,"active_effects")'),false,'actual production payload omits whole active_effects key');
 return {hit,receipt,after};
}
async function scenario(kind){
 const name='delete-'+kind,record={name};write(name+'-progress.json',record);
 try{
  await discardIfOffered();await request('close');await command('effect clear '+uuid);await command('effect give '+uuid+' minecraft:speed 120 0 false');
  const opened=await open();assert.equal(await js('!!document.getElementById("modal")'),false);await effects();await expand();
  const baseline=await readHost(name+'-baseline');assert.equal(baseline.effects.length,1);assert(baseline.effects[0].duration>2000);
  const deleteHit=await click(label('.k-effects .k-btn','删除这个效果'));const draft=await js('({text:WE.text,dirty:weDirty(),hasEffects:Object.prototype.hasOwnProperty.call(nbtParse(WE.text).map,"active_effects")})');assert(draft.dirty);assert.equal(draft.hasEffects,false);
  await delay(750);
  if(kind==='refresh-growth')await command('effect give '+uuid+' minecraft:speed 600 0 false');
  if(kind==='additional-effect')await command('effect give '+uuid+' minecraft:fire_resistance 600 0 false');
  if(kind==='level-change')await command('effect give '+uuid+' minecraft:speed 120 3 false');
  const before=await readHost(name+'-immediate-before');Object.assign(record,{opened,baseline,deleteHit,draft,before});write(name+'-progress.json',record);
  if(kind==='countdown')assert(before.effects[0].duration<baseline.effects[0].duration&&before.effects[0].duration>0,'real natural countdown during edit');
  const applied=await applyAndCapture(name);Object.assign(record,applied);write(name+'-progress.json',record);
  if(kind==='countdown'){
   assert.equal(applied.receipt.result.status,'saved');assert.equal(applied.receipt.dirty,false);assert.equal(applied.after.effects.length,0);assert(!applied.after.raw.snbt.includes('active_effects'));
   const fresh=await open();assert.notEqual(fresh.slot.token,opened.slot.token);assert.equal(await js('!!document.getElementById("modal")'),false);assert.equal(await js('weDirty()'),false);await effects();const reopened=await readHost(name+'-reopened');assert.equal(reopened.effects.length,0);assert.equal(await js('Object.prototype.hasOwnProperty.call(nbtParse(WE.text).map,"active_effects")'),false);record.reopened={fresh,host:reopened,dirty:false};await snap(name+'-saved-reopened');
  }else{
   assert.equal(applied.receipt.result.status,'rejected');assert.equal(applied.receipt.result.code,'target_changed');assert.equal(applied.receipt.dirty,true);assert.equal(applied.receipt.text,draft.text);
   const checkHost=value=>{const speed=value.effects.find(x=>x.id==='minecraft:speed');assert(speed);if(kind==='refresh-growth')assert(speed.duration>10000);if(kind==='additional-effect')assert(value.effects.some(x=>x.id==='minecraft:fire_resistance'));if(kind==='level-change')assert.equal(speed.amplifier,3);};checkHost(before);checkHost(applied.after);await snap(name+'-rejected-dirty');
   await request('close');const fresh=await open();assert.notEqual(fresh.slot.token,opened.slot.token);await until('!!document.getElementById("modal")');await snap(name+'-restore-offer');await click(label('#modal .k-btn','恢复草稿'));await until('weDirty()');assert.equal(await js('Object.prototype.hasOwnProperty.call(nbtParse(WE.text).map,"active_effects")'),false);assert.equal(await js('lastEffectAudit.sent.length'),0,'reopen restore never applies');const reopened=await readHost(name+'-reopened');checkHost(reopened);record.reopened={fresh,host:reopened,dirty:true,noAutomaticApply:true,text:await js('WE.text')};await snap(name+'-restored-dirty');
   write(name+'-progress.json',record);await discardIfOffered();
  }
  results.push({name,status:'PASS',evidence:record});console.log('PASS '+name);
 }catch(e){write(name+'-failure.json',{record,error:e.stack});results.push({name,status:'FAIL',error:e.stack,evidence:record});console.error('FAIL '+name+' '+e.stack);await snap(name+'-FAILED').catch(()=>{});}
 save();
}
try{
 const connected=await c.connected();assert(connected.integrated);const mods=JSON.parse(readFileSync(join(out,'host/mods.json'),'utf8'));assert.equal(mods.filter(x=>x.id==='oriel'&&x.version==='0.15.0').length,1);write('environment.json',{connected,mods,installed:JSON.parse(readFileSync(join(out,'host/installed-jars.json'),'utf8')),process:JSON.parse(readFileSync(join(out,'active-process.json'),'utf8'))});
 await request('operator',{name:'LanHost',grant:true});await command('gamemode creative LanHost');await command('fill -3 99 -3 3 99 3 minecraft:stone');await command('fill -3 100 -3 3 104 3 minecraft:air');await command('tp LanHost 1.5 100 2.5');await command('summon minecraft:slime 0.5 100 0.5 {UUID:[I;1,2,3,4],Size:1,NoAI:1b,NoGravity:1b,PersistenceRequired:1b,Invulnerable:1b}');await delay(200);
 for(const kind of ['countdown','refresh-growth','additional-effect','level-change'])await scenario(kind);
 if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
}catch(e){write('driver-error-'+attempt+'.json',{error:e.stack});console.error(e.stack);process.exitCode=1;}
finally{save();try{await request('stop',{},6000);}catch(e){write('stop-error.json',{error:e.stack});}writeFileSync(join(out,'first.complete'),'completed');}
