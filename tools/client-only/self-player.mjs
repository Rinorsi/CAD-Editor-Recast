import assert from 'node:assert/strict';

// Only adapters: importing this file does not claim any candidate field is open.
export function createSelfPlayerAdapter({request,delay,js,expectedBackend='vanilla_self'}){
 const server=async()=>{const r=await request('host','playerFields',{name:'LanEditor'});assert.equal(r.playerFields.source,'host-integrated-server-thread');return r.playerFields;};
 const client=()=>request('joiner','state');
 async function installAudit(){
  return js('(function(){if(window.lanSelfAudit)return true;var a=window.lanSelfAudit={sent:[],received:[]},original=oriel.send;oriel.send=function(channel,payload){a.sent.push({channel:channel,payload:JSON.parse(JSON.stringify(payload===undefined?null:payload)),at:Date.now()});return original.apply(this,arguments);};oriel.on("patch",function(p){if(p.key==="result"||p.key==="player_extended_result")a.received.push({key:p.key,value:JSON.parse(JSON.stringify(p.value)),at:Date.now()});});oriel.on("data",function(d){["result","player_extended_result"].forEach(function(key){if(d&&d[key])a.received.push({key:key,value:JSON.parse(JSON.stringify(d[key])),at:Date.now()});});});return true;})()');
 }
 const audit=()=>js('JSON.parse(JSON.stringify(window.lanSelfAudit))');
 const inspect=()=>js('(function(){return {world:WE.w,tab:WE.tab,edits:WE.ent||{},slots:WE.pslots,pending:WE.pending,dirty:weDirty(),originalPlayer:typeof evVal==="function"?evVal("player"):null,problems:typeof wpCommandProblems==="function"?wpCommandProblems():[],extended:typeof PX!=="undefined"?PX.views:{}};})()');
 async function openSelf(){
  await js('oriel.send("open_world",{self:true});true');
  for(let n=0;n<60;n++){await delay(150);const v=await inspect();if(v.world?.player?.self){assert.equal(v.world.player.offline===true,false);if(expectedBackend==='full')assert.notEqual(v.world.capabilities?.backend,'vanilla_self');else assert.equal(v.world.capabilities.backend,expectedBackend);await installAudit();return {page:v,host:await server(),client:await client()};}}
  throw Error('formal navigation did not open expected self backend: '+expectedBackend);
 }
 async function tab(label){
  await js('(function(){var label='+JSON.stringify(label)+',a=Array.prototype.slice.call(document.querySelectorAll("#tabbar .ed-tab")),e=a.filter(function(e){return e.textContent.trim()===label;})[0];if(!e)throw Error("actual player tab missing: "+label);e.scrollIntoView({block:"nearest",inline:"nearest"});e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await delay(300);return inspect();
 }
 async function revealNumber(label){
  await js('(function(){var label='+JSON.stringify(label)+',r=Array.prototype.slice.call(document.querySelectorAll(".k-xrow")).filter(function(e){var z=e.querySelector(".z");return z&&z.textContent.trim()===label;});if(r.length!==1)throw Error("number row must be unique: "+label);var e=r[0],input=e.querySelector("input.k-numin");if(!input)throw Error("actual numeric control missing");if(!input.getBoundingClientRect().height){var c=e.closest(".k-card"),head=c&&c.querySelector(".k-chead");if(!head)throw Error("numeric row hidden without card header");head.dispatchEvent(new Event("click",{bubbles:true}));}e.scrollIntoView({block:"center"});return true;})()');await delay(300);
 }
 async function editNumber(label,value){
  assert.equal(typeof value,'number');assert(Number.isFinite(value));await revealNumber(label);
  await js('(function(){var label='+JSON.stringify(label)+',e=Array.prototype.slice.call(document.querySelectorAll(".k-xrow")).filter(function(e){var z=e.querySelector(".z");return z&&z.textContent.trim()===label;})[0],i=e.querySelector("input.k-numin"),r=i.getBoundingClientRect();if(!r.width||!r.height||i.disabled)throw Error("numeric input not editable");i.value='+JSON.stringify(String(value))+';i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
  await delay(150);return inspect();
 }
 async function revealSection(title){
  await js('(function(){var title='+JSON.stringify(title)+',a=Array.prototype.slice.call(document.querySelectorAll(".k-card")),c=a.filter(function(e){var id=e.getAttribute("data-card")||"";return id.slice(-(title.length+1))===":"+title;});if(c.length!==1)throw Error("section must be unique: "+title);c=c[0];var b=c.querySelector(".k-cbody");if(!b.getBoundingClientRect().height)c.querySelector(".k-chead").dispatchEvent(new Event("click",{bubbles:true}));c.scrollIntoView({block:"center"});return true;})()');await delay(300);
 }
 async function clickText(selector,text){
  return js('(function(){var text='+JSON.stringify(text)+',a=Array.prototype.slice.call(document.querySelectorAll('+JSON.stringify(selector)+')),e=a.filter(function(e){return e.textContent.trim()===text;});if(e.length!==1)throw Error("actual control must be unique: "+text);e=e[0];e.scrollIntoView({block:"center"});var r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error("actual control hidden");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');
 }
 async function warning(fragment,{persistent=false}={}){
  const found=await js('(function(){var fragment='+JSON.stringify(fragment)+',persistent='+JSON.stringify(persistent)+';if(document.getElementById("modal"))throw Error("self warning must not be hidden by modal");return Array.prototype.slice.call(document.querySelectorAll("body *")).filter(function(e){return (!persistent||!e.closest(".k-toast"))&&Array.prototype.some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.indexOf(fragment)>=0;});}).map(function(e){var r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,width:window.innerWidth,height:window.innerHeight,shown:s.display!=="none"&&s.visibility!=="hidden"&&s.opacity!=="0"};});})()');
  const visible=found.filter(v=>v.shown&&v.w>0&&v.h>0&&v.x>=0&&v.y>=0&&v.x+v.w<=v.width+1&&v.y+v.h<=v.height+1);
  assert(visible.length,'actual visible '+(persistent?'persistent ':'')+'warning missing: '+fragment);return visible;
 }
 const isApply=s=>s.channel==='apply'||(s.channel==='player_extended'&&s.payload.action==='apply');
 async function submit({expected='saved',code,afterClick}={}){
  const before=await audit(),hostBefore=await server(),clientBefore=await client();
  await js('(function(){var e=document.querySelector("#topbar .k-apply");if(!e)throw Error("actual player Apply button missing");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');
  if(afterClick)await afterClick();
  let sends;
  for(let n=0;n<100;n++){
   await delay(150);const a=await audit();sends=a.sent.slice(before.sent.length).filter(isApply);
   if(sends.length){assert.equal(sends.length,1,'single-field fixture must issue exactly one apply');const id=sends[0].payload.requestId;assert(id,'actual emitted apply requestId required');const received=a.received.slice(before.received.length).find(r=>r.value.requestId===id);if(received){assert.equal(received.value.status,expected);if(code)assert.equal(received.value.code,code);return {requestId:id,sent:sends[0],result:received.value,hostBefore,hostAfter:await server(),clientBefore,clientAfter:await client(),page:await inspect()};}}
  }
  throw Error(sends?.length?'no real matching player result (unknown is not saved)':'Apply produced no request; inspect restriction warning/draft');
 }
 async function blockedApply(fragment){
  const before=await audit(),stateBefore=await client(),hostBefore=await server(),draftBefore=await inspect();
  await js('(function(){var e=document.querySelector("#topbar .k-apply");if(!e)throw Error("actual player Apply button missing");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await delay(500);
  const a=await audit();assert.equal(a.sent.slice(before.sent.length).filter(isApply).length,0,'unsupported fields must never be sent');assert.equal((await client()).commandAttempts,stateBefore.commandAttempts);
  const page=await inspect();assert.deepEqual(page.edits,draftBefore.edits);assert.deepEqual(page.slots,draftBefore.slots);
  return {hostBefore,hostAfter:await server(),draftBefore,page,warning:await warning(fragment)};
 }
 return {server,client,installAudit,audit,inspect,openSelf,tab,revealNumber,revealSection,editNumber,clickText,warning,submit,blockedApply};
}

export function assertExperience(before,after,{level,points}={}){
 assert.equal(after.source,'host-integrated-server-thread');
 assert.equal(after.experience.total,before.experience.total,'levels/points commands must not change XpTotal');
 if(level!==undefined)assert.equal(after.experience.level,level);
 if(points!==undefined)assert(Math.abs(after.experience.progress*after.experience.neededForNextLevel-points)<0.0001,'server progress must represent requested whole points');
}
export function assertGameMode(after,mode){
 assert.equal(after.gameMode,mode);
 for(const key of ['mayfly','invulnerable','mayBuild','instabuild'])assert.equal(after.abilities[key],after.modeDefaultAbilities[key],'vanilla mode-linked ability '+key);
 if(!after.abilities.mayfly)assert.equal(after.abilities.flying,false);
 if(mode==='spectator')assert.equal(after.abilities.flying,true);
}
export function assertAttributeBase(before,after,id,expected){
 const old=before.attributes.find(a=>a.id===id),next=after.attributes.find(a=>a.id===id);assert(old&&next);assert.equal(old.clientSyncable,true);assert.equal(next.base,expected);
 for(const row of before.attributes){const current=after.attributes.find(a=>a.id===row.id);assert(current,'existing attribute disappeared');assert.deepEqual(current.modifiers,row.modifiers);assert.deepEqual(current.permanentModifiers,row.permanentModifiers);if(row.id!==id)assert.equal(current.baseDecimal,row.baseDecimal);}
}
export function assertServerPosition(after,target,tolerance=0.001){
 assert.equal(after.source,'host-integrated-server-thread');assert.equal(after.position.dimension,target.dimension);
 for(const key of ['x','y','z','pitch'])if(target[key]!==undefined)assert(Math.abs(after.position[key]-target[key])<=tolerance,'host position mismatch '+key);
 if(target.yaw!==undefined)assert(Math.abs(((after.position.yaw-target.yaw+540)%360)-180)<=tolerance,'host yaw mismatch');
}
export function assertFreshSync(receipt,family){
 const before=receipt.clientBefore.playerSyncEpochs[family]||0,after=receipt.clientAfter.playerSyncEpochs[family]||0;assert(after>before,'fresh completed vanilla '+family+' packet required, local prediction is insufficient');
}
export function assertAuthorityQueries(receipt,key,expected){
 const before=receipt.clientBefore.tagQueryReplies||[],after=receipt.clientAfter.tagQueryReplies||[],replies=after.slice(before.length);
 assert(replies.length>=2,'preflight and confirmation vanilla query replies required; read-only retries allowed');
 assert.equal(replies[0][key],key==='XpLevel'?receipt.hostBefore.experience.level:receipt.hostBefore.gameModeId,'preflight query must match the actual host baseline');
 assert.equal(new Set(replies.map(r=>r.transactionId)).size,replies.length);assert.equal(replies.at(-1)[key],expected);
 assert.equal(receipt.clientAfter.commandAttempts-receipt.clientBefore.commandAttempts,1,'read-only query retries must never resend the modifying command');return replies;
}
