import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createSelfPlayerAdapter,assertExperience,assertServerPosition,assertAttributeBase} from './self-player.mjs';

// A separate next-contract mode. expanded keeps its original 23 acceptance criteria.
export async function run(h){
 const {request,delay,js,host,page,close,test,out,results}=h,a=createSelfPlayerAdapter(h);
 const messages=role=>{const p=join(out,role,'messages.jsonl');return existsSync(p)?readFileSync(p,'utf8'):'';};
 const observerStart=messages('observer').length;
 const shot=name=>request('joiner','screenshot',{name:'next-'+name+'.png'});
 async function wait(fn,label,attempts=45){for(let n=0;n<attempts;n++){if(await fn())return;await delay(75);}throw Error(label);}
 async function loaded(){await wait(async()=>{const c=await a.client();return c.connected&&!/LevelLoadingScreen|ReceivingLevelScreen/.test(c.screen||'');},'real dimension loading must finish',180);}
 async function fresh(){await close();await page();await a.openSelf();await a.tab('状态');return a.inspect();}
 async function grant(value){await host((value?'op ':'deop ')+'LanEditor');await wait(async()=>{const s=await a.server(),c=await a.client();return s.gamemaster===value&&c.commandRoots.includes('data')===value;},'actual OP/query tree did not converge');}
 async function mode(value){await a.tab('状态');await a.revealSection('游戏模式');await a.clickText('.k-segi',await js('WP_MODE['+JSON.stringify(value)+']'));}
 async function position(key,value){await a.tab('位置与重生');await a.editNumber({x:'X',y:'Y',z:'Z',yaw:'水平朝向',pitch:'俯仰'}[key],value);}
 const numberValue=label=>js('(function(){var label='+JSON.stringify(label)+',a=Array.prototype.slice.call(document.querySelectorAll("#edbody .k-xrow")).filter(function(e){var z=e.querySelector(".z");return z&&z.textContent.trim()===label;});if(a.length!==1)throw Error("actual player number row not unique");return Number(a[0].querySelector("input.k-numin").value);})()');
 async function verifyModeControl(value){const v=await js('(function(){var a=Array.prototype.slice.call(document.querySelectorAll("#edbody .k-card")).filter(function(e){return (e.getAttribute("data-card")||"").slice(-5)===":游戏模式";});if(a.length!==1)throw Error("actual mode card must be unique");var selected=a[0].querySelectorAll(".k-segi.on"),expected=WP_MODE['+JSON.stringify(value)+'];if(selected.length!==1||typeof expected!=="string"||!expected)throw Error("actual selected mode or label missing");var e=selected[0],r=e.getBoundingClientRect();return {text:e.textContent.trim(),expected:expected,w:r.width,h:r.height,allSelected:Array.prototype.slice.call(document.querySelectorAll(".k-segi.on")).map(function(e){var c=e.closest(".k-card");return {text:e.textContent.trim(),card:c?c.getAttribute("data-card"):null};})};})()');assert.equal(v.text,v.expected);assert(v.w>0&&v.h>0);return v;}
 async function attribute(id,value){
  await a.tab('属性与效果');
  await js('(function(){var e=Array.prototype.slice.call(document.querySelectorAll(".k-xrow")).filter(function(e){var z=e.querySelector(".z");return z&&z.textContent.trim()==="属性 ID 筛选";})[0];if(!e)throw Error("manual ID control missing");var i=e.querySelector("input");i.value='+JSON.stringify(id)+';["input","change","blur"].forEach(function(n){i.dispatchEvent(new Event(n,{bubbles:true}));});return true;})()');await delay(150);
  const label=await js('(function(){if(WE.commandAttribute!=='+JSON.stringify(id)+')throw Error("manual filter not committed");var a=Array.prototype.slice.call(document.querySelectorAll(".k-xrow")).filter(function(e){return e.querySelector("input.k-numin");});if(a.length!==1)throw Error("filtered attribute must be unique");return a[0].querySelector(".z").textContent.trim();})()');await a.editNumber(label,value);
 }
 function once(r){assert.equal(r.clientAfter.commandAttempts-r.clientBefore.commandAttempts,1);const q=r.clientAfter.tagQueryReplies.slice(r.clientBefore.tagQueryReplies.length);assert(q.length>=2);assert.equal(new Set(q.map(v=>v.transactionId)).size,q.length);assert(q.every(v=>typeof v.snbt==='string'));return q;}
 const draft=(p,path)=>path.reduce((v,k)=>v?.[k],p.edits.player);
 await grant(true);
 // The copied world contains structures: a horizontal teleport alone can put
 // the real player inside a wall. Build and verify a clear, solid test volume.
 writeFileSync(join(out,'platform-before-clear.json'),JSON.stringify(await a.server(),null,2));
 writeFileSync(join(out,'historical-0618-collision-witness.json'),JSON.stringify({scope:'fresh template copy at historical coordinates, not a read of the stopped 0618 world',response:await request('host','collisionAt',{name:'LanEditor',x:-3.5,y:71,z:1.5})},null,2));
 await host('execute at LanEditor run fill ~-8 ~ ~-8 ~8 ~32 ~8 minecraft:air');
 await host('execute at LanEditor run fill ~-8 ~-1 ~-8 ~8 ~-1 ~8 minecraft:stone');await delay(400);
 const platform=await a.server();assert(platform.alive&&platform.collisionFree&&platform.onGround);assert.equal(platform.standingBlocks['-1'],'minecraft:stone');assert.equal(platform.standingBlocks['0'],'minecraft:air');assert.equal(platform.standingBlocks['1'],'minecraft:air');writeFileSync(join(out,'platform-fixture.json'),JSON.stringify(platform,null,2));
 await test('next-01-no-op-persistent-specific-reason',async()=>{
  await grant(false);await fresh();assert.deepEqual((await a.inspect()).world.capabilities.editable,[]);const early=await a.warning('没有可用的自身玩家命令权限或权威查询权限',{persistent:true});
  const rows=[];for(const label of ['等级','当前等级点数']){await a.revealNumber(label);const row=await js('(function(){var label='+JSON.stringify(label)+',e=Array.prototype.slice.call(document.querySelectorAll(".k-xrow")).filter(function(e){var z=e.querySelector(".z");return z&&z.textContent.trim()===label;})[0],r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,height:window.innerHeight,width:window.innerWidth,display:s.display,visibility:s.visibility};})()');assert(row.w>0&&row.h>0&&row.y>=0&&row.y+row.h<=row.height+1);assert.notEqual(row.display,'none');assert.notEqual(row.visibility,'hidden');assert(/命令|查询|权限/.test(row.text),'field must explain missing command/query permission');assert(!/需要服务端|需服务端/.test(row.text),'OP-supported XP must not be mislabeled as requiring backend');rows.push({label,row});await shot('no-op-'+label);}
  await a.editNumber('当前等级点数',1);const blocked=await a.blockedApply('权限');assert.deepEqual(blocked.hostBefore.experience,blocked.hostAfter.experience);await delay(2500);
  await js('(function(){var a=Array.prototype.slice.call(document.querySelectorAll("body *")).filter(function(e){return !e.closest(".k-toast")&&Array.prototype.some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.indexOf("没有可用的自身玩家命令权限或权威查询权限")>=0;});});if(!a.length)throw Error("persistent body missing");a[0].scrollIntoView({block:"center"});return true;})()');await delay(150);
  const persistent=await a.warning('没有可用的自身玩家命令权限或权威查询权限',{persistent:true});await shot('no-op');await grant(true);return {early,persistent,blocked,rows};
 });
 await test('next-02-points-quantized-total-unchanged-and-reopen',async()=>{
  await fresh();const before=await a.server(),points=Math.round(before.experience.progress*before.experience.neededForNextLevel)===2?3:2;await a.editNumber('当前等级点数',points);const receipt=await a.submit(),queries=once(receipt);
  assertExperience(before,receipt.hostAfter,{points,level:before.experience.level});assert.equal(Math.fround(queries.at(-1).XpP),Math.fround(points/before.experience.neededForNextLevel));assert.equal(receipt.page.dirty,false);await fresh();assert.equal(Math.fround((await a.inspect()).originalPlayer.experience.XpP),Math.fround(points/before.experience.neededForNextLevel));await a.revealNumber('当前等级点数');await shot('points-reopened');return {receipt,queries};
 });
 await test('next-03-stale-xp-preflight-no-write',async()=>{
  await fresh();const before=await a.server();await a.editNumber('当前等级点数',1);await host('experience set LanEditor '+(before.experience.level+1)+' levels');const receipt=await a.submit({expected:'rejected'});assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);assert(draft(receipt.page,['experience','XpP'])!==undefined);return receipt;
 });
 await test('next-04-ground-teleport-yaw-wrap-authority',async()=>{
  await fresh();const before=await a.server(),target={...before.position,x:before.position.x+2,yaw:360,pitch:15};await position('x',target.x);await position('yaw',target.yaw);await position('pitch',target.pitch);const receipt=await a.submit();once(receipt);assertServerPosition(receipt.hostAfter,target,0.01);assert(receipt.hostAfter.alive&&receipt.hostAfter.collisionFree&&receipt.hostAfter.onGround,'actual teleport must be grounded and collision-free');await fresh();assertServerPosition(await a.server(),target,0.01);await a.tab('位置与重生');await shot('position-reopened');return receipt;
 });
 await test('next-04b-movement-preflight-no-write',async()=>{
  await fresh();const before=await a.server();await position('x',before.position.x+1);await host('execute as LanEditor at @s run teleport @s ~2 ~ ~');await delay(250);const receipt=await a.submit({expected:'rejected'});assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);assert.equal(draft(receipt.page,['commandPosition','x']),before.position.x+1);return receipt;
 });
 const id='minecraft:max_health';
 await test('next-05a-invalid-or-unsynced-attribute-ID-visible-no-command',async()=>{
  await fresh();await a.tab('属性与效果');const schema=await js('wpSchema().attributes'),before=await a.client(),audit=await a.audit(),cases=[],registry=(await a.server()).registeredAttributes,excluded=registry.find(v=>!v.clientSyncable||!v.playerInstance);assert(excluded,'registered but unsupported player attribute fixture required');
  for(const invalid of ['clientonly:does_not_exist',excluded.id]){
   assert(!schema.some(v=>v.id===invalid),'negative ID must actually be absent from live syncable choices');const old=await js('WE.commandAttribute||""');
   await js('(function(){var e=Array.prototype.slice.call(document.querySelectorAll(".k-xrow")).filter(function(e){var z=e.querySelector(".z");return z&&z.textContent.trim()==="属性 ID 筛选";})[0],i=e&&e.querySelector("input");if(!i)throw Error("manual ID input missing");i.value='+JSON.stringify(invalid)+';["input","change","blur"].forEach(function(n){i.dispatchEvent(new Event(n,{bubbles:true}));});return true;})()');
   const visible=await a.warning('不在本玩家可同步属性中');assert.equal(await js('WE.commandAttribute||""'),old);assert.equal((await a.client()).commandAttempts,before.commandAttempts);cases.push({invalid,visible});await shot('attribute-invalid-'+cases.length);
  }
  const after=await a.audit();assert.equal(after.sent.slice(audit.sent.length).filter(v=>v.channel==='apply'||v.channel==='player_extended').length,0);return {schema,cases,excluded};
 });
 await fresh();const missingHost=await a.server(),choices=await js('wpSchema().attributes'),missing=choices.filter(v=>!missingHost.serializedAttributes.some(row=>row.id===v.id&&row.hasBase));
 writeFileSync(join(out,'natural-missing-base-enumeration.json'),JSON.stringify({source:'host saveWithoutId vs real client schema',host:missingHost.serializedAttributes,choices,missing,status:missing.length?'NATURAL_FIXTURE_FOUND':'NO_NATURAL_FIXTURE',notEquivalentToLanPass:true},null,2));
 if(missing.length)await test('next-06-natural-missing-serialized-base-rejected-no-write',async()=>{
  const def=missing[0],base=(await a.server()).attributes.find(v=>v.id===def.id).base,target=base+0.01<=def.max?base+0.01:base-0.01;assert(Number.isFinite(target)&&target>=def.min);await attribute(def.id,target);const receipt=await a.submit({expected:'rejected'});assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);assert.equal(receipt.page.dirty,true);await shot('natural-missing-base');return {def,receipt};
 });
 await test('next-05-single-attribute-original-base-and-modifiers',async()=>{
  await host('attribute LanEditor '+id+' base set 24');await host('attribute LanEditor '+id+' modifier add clientonly:probe 2 add_value');await delay(350);await fresh();const before=await a.server(),raw=before.serializedAttributes.filter(v=>v.id===id);assert.equal(raw.length,1);assert(raw[0].hasBase,'fixture must really serialize base');assert(before.attributes.find(v=>v.id===id).permanentModifiers.length>0,'nonempty modifier fixture required');await attribute(id,26);await a.warning('实际 base',{persistent:true});const receipt=await a.submit();once(receipt);assertAttributeBase(before,receipt.hostAfter,id,26);assert(!JSON.stringify(receipt.sent.payload).includes('modifiers'));await shot('attribute-saved');return {raw,receipt};
 });
 await test('next-06-level-points-mixed-before-send',async()=>{
  await fresh();const before=await a.server();await a.editNumber('等级',before.experience.level+1);await a.editNumber('当前等级点数',1);const blocked=await a.blockedApply('分开');assert.deepEqual(blocked.hostBefore.experience,blocked.hostAfter.experience);await shot('mixed');return blocked;
 });
 await test('next-06b-two-attributes-mixed-before-send',async()=>{
  await fresh();const before=await a.server(),rows=before.attributes.filter(v=>v.clientSyncable&&v.id!==id);const other=rows.find(v=>v.id==='minecraft:movement_speed');assert(other,'real synchronized movement attribute fixture required');
  await attribute(id,before.attributes.find(v=>v.id===id).base+1);await attribute(other.id,other.base+0.01);const blocked=await a.blockedApply('每次');assert.deepEqual(blocked.hostBefore.attributes,blocked.hostAfter.attributes);await shot('multi-attribute-draft');return blocked;
 });
 await test('next-06c-attribute-baseline-conflict-no-write',async()=>{
  await fresh();const before=await a.server(),old=before.attributes.find(v=>v.id===id).base;await attribute(id,old+1);await host('attribute LanEditor '+id+' base set '+(old+2));const receipt=await a.submit({expected:'rejected'});assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);assert.equal(receipt.hostAfter.attributes.find(v=>v.id===id).base,old+2);return receipt;
 });
 // All in-flight mutations are real UI input/change events. Only original query
 // packets are held; result values and host writes are never manufactured.
 async function pendingEdit(c){
  const setup=c.prepare?await c.prepare():null;await fresh();const original=await a.server(),A=c.read(original),B=c.B(A),next=c.C?c.C(A):A;await c.edit(B);await request('joiner','holdConfirmationQuery');let receipt,pendingControl;
  try{receipt=await a.submit({afterClick:async()=>{
   await wait(async()=>c.read(await a.server())===B,'host must reach B before real reverse edit');await wait(async()=>(await a.client()).delayedQueryReplies>0,'original post query reply must be held');assert((await a.inspect()).pending);await c.edit(next);pendingControl=await c.verifyControl(next);await request('joiner','releaseQueries');
  }});}finally{await request('joiner','releaseQueries');}
  once(receipt);assert.equal(c.read(receipt.hostAfter),B);assert.equal(c.draft(receipt.page),next);assert.equal(receipt.page.dirty,true);await shot('pending-'+c.name);
  const second=await a.submit();once(second);assert.notEqual(second.requestId,receipt.requestId);assert.equal(c.read(second.hostAfter),next);assert.equal(second.page.dirty,false);return {A,B,next,setup,pendingControl,receipt,second};
 }
 const needed=(await a.server()).experience.neededForNextLevel;
 const cases=[
  {name:'mode-revert',read:s=>s.gameMode,edit:mode,verifyControl:verifyModeControl,draft:p=>draft(p,['playerGameType']),B:v=>v==='creative'?'survival':'creative'},
  {name:'level-revert',read:s=>s.experience.level,edit:v=>a.editNumber('等级',v),verifyControl:async v=>assert.equal(await numberValue('等级'),v),draft:p=>draft(p,['experience','XpLevel']),B:v=>v+1},
  {name:'position-revert',read:s=>s.position.x,edit:v=>position('x',v),verifyControl:async v=>assert.equal(await numberValue('X'),v),draft:p=>draft(p,['commandPosition','x']),B:v=>v+1},
  {name:'points-revert',prepare:async()=>{const before=await a.server();await host('experience set LanEditor 2 points');await delay(250);const after=await a.server();assertExperience(before,after,{level:before.experience.level,points:2});return {before,after};},read:s=>Math.fround(s.experience.progress),edit:v=>a.editNumber('当前等级点数',Math.round(v*needed)),verifyControl:async v=>assert.equal(await numberValue('当前等级点数'),Math.round(v*needed)),draft:p=>draft(p,['experience','XpP']),B:v=>v===0?Math.fround(1/needed):0},
  {name:'attribute-revert',read:s=>s.attributes.find(r=>r.id===id).base,edit:v=>attribute(id,v),verifyControl:async v=>assert.equal(await js('(function(){var a=document.querySelectorAll("#edbody input.k-numin");if(a.length!==1)throw Error("filtered attribute control not unique");return Number(a[0].value);})()'),v),draft:p=>p.edits.player.attributes?.find(r=>r.id===id)?.base,B:v=>v+1},
  {name:'position-third-value',read:s=>s.position.x,edit:v=>position('x',v),verifyControl:async v=>assert.equal(await numberValue('X'),v),draft:p=>draft(p,['commandPosition','x']),B:v=>v+1,C:v=>v+2}
 ];
 for(const c of cases)await test('next-08-pending-'+c.name,()=>pendingEdit(c));
 await test('next-08-new-health-natural-total-not-draft',async()=>{
  await fresh();const before=await a.server();await a.editNumber('等级',before.experience.level+1);await request('joiner','holdConfirmationQuery');let receipt;
  try{receipt=await a.submit({afterClick:async()=>{await wait(async()=>(await a.client()).delayedQueryReplies>0,'original confirmation held');await a.editNumber('生命',18);await host('experience add LanEditor 1 points');await request('joiner','releaseQueries');}});}finally{await request('joiner','releaseQueries');}
  once(receipt);assert.equal(receipt.page.edits.player.Health,18);assert.equal(receipt.page.edits.player.experience?.XpTotal,undefined);assert.equal(receipt.hostAfter.experience.total,before.experience.total+1,'fixture must really change server XpTotal');assert.equal(receipt.hostAfter.health,before.health);await shot('health-no-total-draft');return receipt;
 });
 await test('next-09-timeout-late-not-saved-single-write',async()=>{
  await fresh();const before=await a.server();await a.editNumber('当前等级点数',before.experience.progress===0?1:0);await request('joiner','holdConfirmationQuery');
  try{const receipt=await a.submit({expected:'rejected',code:'command_unconfirmed'});assert.equal(receipt.clientAfter.commandAttempts-receipt.clientBefore.commandAttempts,1);const mark=(await a.audit()).received.length;await request('joiner','releaseQueries');await delay(600);assert(!(await a.audit()).received.slice(mark).some(r=>r.value.requestId===receipt.requestId&&r.value.status==='saved'));assert.equal((await a.client()).commandAttempts,receipt.clientAfter.commandAttempts);await shot('unknown-late');return receipt;}finally{await request('joiner','releaseQueries');}
 });
 await test('next-09-revoked-before-submit-no-write',async()=>{await fresh();const before=await a.server();await position('x',before.position.x+1);await grant(false);const receipt=await a.submit({expected:'rejected'});assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);await grant(true);return receipt;});
 await test('next-09-debug-query-ownership-loss-no-write',async()=>{
  await fresh();const before=await a.server();await a.editNumber('等级',before.experience.level+1);await request('joiner','holdQueries');let receipt;
  try{receipt=await a.submit({expected:'rejected',afterClick:async()=>{await wait(async()=>(await a.client()).delayedQueryReplies>0,'prequery held');await request('joiner','occupyQuery');await request('joiner','releaseQueries');}});}finally{await request('joiner','releaseQueries');}
  assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);assert.deepEqual(receipt.hostAfter.experience,before.experience);await shot('query-ownership');return receipt;
 });
 // Do not run submit() across Document replacement: capture actual request ID,
 // replace the real Document, then audit the new page and original late packets.
 for(const phase of ['pre','post'])await test('next-07-document-'+phase+'-retired',async()=>{
  await fresh();const b=await a.server(),c=await a.client();await a.editNumber('等级',b.experience.level+1);await request('joiner',phase==='pre'?'holdQueries':'holdConfirmationQuery');
  try{
   const oldAudit=await a.audit();await js('(function(){document.querySelector("#topbar .k-apply").dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await wait(async()=>(await a.client()).delayedQueryReplies>0,'original query held before reload');
   const sent=(await a.audit()).sent.slice(oldAudit.sent.length).filter(v=>v.channel==='apply');assert.equal(sent.length,1);const id=sent[0].payload.requestId;assert(id);
   const reload=await request('joiner','reloadPage');assert(reload.documentChanged);await delay(500);await a.installAudit();const before=await a.inspect();await request('joiner','releaseQueries');await delay(1200);const after=await a.inspect(),audit=await a.audit();
   assert(!audit.received.some(v=>v.value.requestId===id&&v.value.status==='saved'));assert.deepEqual(after.originalPlayer,before.originalPlayer);assert.equal((await a.client()).commandAttempts-c.commandAttempts,phase==='pre'?0:1);await shot('document-'+phase);await fresh();return {requestId:id,reload,before,after};
  }finally{await request('joiner','releaseQueries');}
 });
 await test('next-04c-falling-with-held-confirmation-unknown-not-predicted-save',async()=>{
  await fresh();const before=await a.server();assert.equal(before.gameMode,'survival');await position('y',before.position.y+20);await request('joiner','holdConfirmationQuery');
  try{const receipt=await a.submit({expected:'rejected',code:'command_unconfirmed'});assert.equal(receipt.clientAfter.commandAttempts-receipt.clientBefore.commandAttempts,1);assert.equal(receipt.page.dirty,true);assert(Math.abs(receipt.hostAfter.position.y-before.position.y)<1,'actual host must fall back onto fixture platform');const mark=(await a.audit()).received.length;await request('joiner','releaseQueries');await delay(600);assert(!(await a.audit()).received.slice(mark).some(v=>v.value.requestId===receipt.requestId&&v.value.status==='saved'));await shot('falling-unknown');return receipt;}finally{await request('joiner','releaseQueries');}
 });
 await test('next-09-real-dimension-change-retires-prequery-no-write',async()=>{
  await fresh();const before=await a.server(),clientBefore=await a.client();assert.equal(before.position.dimension,'minecraft:overworld','fixture starts in isolated overworld');await a.editNumber('等级',before.experience.level+1);await request('joiner','holdQueries');
  try{
   const mark=(await a.audit()).sent.length;await js('(function(){document.querySelector("#topbar .k-apply").dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await wait(async()=>(await a.client()).delayedQueryReplies>0,'original prequery held before dimension change');
   const auditBefore=await a.audit(),sends=auditBefore.sent.slice(mark).filter(v=>v.channel==='apply');assert.equal(sends.length,1);const requestId=sends[0].payload.requestId;assert(requestId);const oldPage=await a.inspect();assert(oldPage.pending);assert(!auditBefore.received.some(v=>v.value.requestId===requestId&&v.value.status==='saved'));
   const observerBeforeFixture=messages('observer').slice(observerStart);writeFileSync(join(out,'observer-before-dimension.json'),JSON.stringify({feedback:observerBeforeFixture,scope:'before host-only cross-dimension fixture'},null,2));
   await host('execute in minecraft:the_nether run teleport LanEditor 0 128 0');await wait(async()=>(await a.server()).position.dimension==='minecraft:the_nether','real host dimension transition',180);await loaded();
   const changed=await a.client(),hostChanged=await a.server();assert.equal(changed.commandAttempts,clientBefore.commandAttempts);assert.equal(hostChanged.experience.level,before.experience.level);
   // LevelLoadingScreen replaced the old Oriel document. Do not eval it or
   // manufacture its terminal result; open a real new document after loading.
   await fresh();const newBaseline=await a.inspect();await request('joiner','releaseQueries');await delay(750);const late=await a.audit(),after=await a.inspect(),clientAfter=await a.client(),hostAfter=await a.server();
   assert(!late.received.some(v=>v.value.requestId===requestId&&v.value.status==='saved'));assert.deepEqual(after.originalPlayer,newBaseline.originalPlayer);assert.equal(clientAfter.commandAttempts,clientBefore.commandAttempts);assert.equal(hostAfter.experience.level,before.experience.level);await a.revealNumber('等级');await shot('dimension-new-page-late-query-no-pollution');return {requestId,before,clientBefore,oldPage,changed,hostChanged,newBaseline,after,clientAfter,hostAfter,late,scope:'no command/no new-page late saved or baseline mutation; no fabricated old-document result'};
  }finally{await request('joiner','releaseQueries');await host('execute in minecraft:overworld run teleport LanEditor '+before.position.x+' '+before.position.y+' '+before.position.z);await loaded();}
 });
 await test('next-observer-no-admin-feedback',async()=>{assert.equal((await request('observer','state')).gamemaster,false);const feedback=messages('observer').slice(observerStart),lines=feedback.split(String.fromCharCode(10)).filter(Boolean).map(v=>JSON.parse(v)),fixtureGameplay=lines.filter(v=>v==='LanEditor取得了进度[勇往直下]'),adminFeedback=lines.filter(v=>v!=='LanEditor取得了进度[勇往直下]');assert.deepEqual(adminFeedback,[],'ordinary observer must receive no command/admin feedback');await request('observer','screenshot',{name:'next-observer-audience.png'});return {feedback,fixtureGameplay,adminFeedback,scope:'host cross-dimension fixture can broadcast native advancement; never suppress gamerule or label that empty'};});
 // Last, because the owned connection is really closed. Do not invent a saved
 // callback when the vanilla disconnect screen has replaced the editor.
 await test('next-09-disconnect-postquery-no-retry-no-visible-saved',async()=>{
  await fresh();const before=await a.server(),client=await a.client(),observerMark=messages('observer').length;await a.editNumber('等级',before.experience.level+1);await request('joiner','holdConfirmationQuery');
  await js('(function(){document.querySelector("#topbar .k-apply").dispatchEvent(new Event("click",{bubbles:true}));return true;})()');
  await wait(async()=>(await a.client()).delayedQueryReplies>0,'real postquery held before disconnect');const pending=await a.inspect(),audit=await a.audit();const sent=audit.sent.filter(v=>v.channel==='apply').at(-1);assert(sent?.payload.requestId);assert(!audit.received.some(v=>v.value.requestId===sent.payload.requestId&&v.value.status==='saved'));assert(pending.pending);const hostApplied=await a.server();assert.equal(hostApplied.experience.level,before.experience.level+1);
  await request('joiner','disconnectSelf');await delay(8500);const after=await a.client();assert.equal(after.connected,false);assert.equal(after.commandAttempts-client.commandAttempts,1);await shot('disconnected-original-query');
  await request('joiner','reconnectSelf',{port:25781});await wait(async()=>{const c=await a.client();return c.connected&&c.commandRoots.includes('data');},'owned LAN reconnect and command tree');const reconnected=await a.client();assert.equal(reconnected.uuid,client.uuid);await fresh();const reopenedBeforeLate=await a.inspect();assert.equal(reopenedBeforeLate.originalPlayer.experience.XpLevel,hostApplied.experience.level);
  await request('joiner','releaseQueries');await delay(600);const late=await a.audit(),reopened=await a.inspect();assert(!late.received.some(v=>v.value.requestId===sent.payload.requestId&&v.value.status==='saved'));assert.deepEqual(reopened.originalPlayer,reopenedBeforeLate.originalPlayer);assert.equal((await a.client()).commandAttempts-client.commandAttempts,1);const observerFeedback=messages('observer').slice(observerMark),observerLines=observerFeedback.split(String.fromCharCode(10)).filter(Boolean).map(v=>JSON.parse(v));assert.deepEqual(observerLines.filter(v=>!['LanEditor退出了游戏','LanEditor加入了游戏'].includes(v)),[]);await shot('reconnected-authority-and-draft-observation');return {requestId:sent.payload.requestId,pending,hostApplied,after,reconnected,reopened,observerFeedback,scope:'draft presence after reconnect is recorded as actual state, not assumed recovered; ordinary lifecycle messages recorded separately'};
 });
 assert(results.some(v=>v.status==='PASS'),'case selection must execute real tests');
 writeFileSync(join(out,'self-player-next-result.json'),JSON.stringify({status:'PASS',scope:h.casePattern?'selected next LAN cases only: '+h.casePattern:'only listed actual next LAN cases; not the full ten-contract matrix',casePattern:h.casePattern||null,results,notExecuted:[...results.filter(v=>v.status==='NOT_RUN').map(v=>v.name),...(!missing.length?['missing serialized attribute base: no natural fixture in authoritative enumeration; use separate production-method harness evidence']:[]),'contract10: run separate backend-single/backend-dual modes','Document during readonly retry']},null,2));
}
