import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createSelfPlayerAdapter,assertExperience,assertGameMode,assertAuthorityQueries} from './self-player.mjs';

// Locked to docs/self-player-command-contract.md: only level and mode, one at a time.
export async function run(h){
 const {request,delay,js,host,page,close,test,out,results}=h,a=createSelfPlayerAdapter(h),start=results.length;
 const messages=role=>{const path=join(out,role,'messages.jsonl');return existsSync(path)?readFileSync(path,'utf8'):'';};
 const messageStart=Object.fromEntries(['host','joiner','observer'].map(role=>[role,messages(role).length]));
 async function permission(grant){
  await host((grant?'op ':'deop ')+'LanEditor');
  for(let n=0;n<40;n++){await delay(150);const s=await a.server(),c=await a.client();if(s.gamemaster===grant&&c.commandRoots.includes('data')===grant)return {server:s,client:c};}
  throw Error('real OP/query tree did not converge');
 }
 async function fresh(){await close();await page();const v=await a.openSelf();assert.equal(v.page.world.slot.uuid,v.host.uuid);await a.tab('状态');return v;}
 async function mode(value){await a.revealSection('游戏模式');await a.clickText('.k-segi',await js('WP_MODE['+JSON.stringify(value)+']'));await delay(150);}
 const xpUnchanged=(b,n)=>assert.deepEqual(n.experience,b.experience);
 await test('self-authorized-level-real-control-saved-query-host-and-reopen',async()=>{
  const permissions=await permission(true),opened=await fresh();assert.deepEqual([...opened.page.world.capabilities.editable].sort(),['experience.XpLevel','playerGameType']);
  const before=await a.server(),target=before.experience.level===7?8:7;await a.editNumber('等级',target);const receipt=await a.submit();
  assertExperience(before,receipt.hostAfter,{level:target});assert.equal(receipt.hostAfter.experience.progressDecimal,before.experience.progressDecimal);assert.equal(receipt.hostAfter.gameMode,before.gameMode);
  const queries=assertAuthorityQueries(receipt,'XpLevel',target);assert.equal(receipt.page.dirty,false);await fresh();assert.equal((await a.inspect()).originalPlayer.experience.XpLevel,target);
  await a.revealNumber('等级');await request('joiner','screenshot',{name:'self-level-saved-reopened.png'});return {permissions,opened,receipt,queries};
 });
 for(const value of ['creative','survival'])await test('self-authorized-mode-'+value+'-real-control-saved-and-vanilla-abilities',async()=>{
  await fresh();const before=await a.server();await mode(value);const receipt=await a.submit();assertGameMode(receipt.hostAfter,value);xpUnchanged(before,receipt.hostAfter);
  const modes=await js('(wpSchema().gameModes||[])');assert(modes.includes(value));const expected=await js('WP_MODE['+JSON.stringify(value)+']');
  const replies=assertAuthorityQueries(receipt,'playerGameType',receipt.hostAfter.gameModeId);assert.equal(receipt.page.originalPlayer.playerGameType,value);assert.equal(receipt.page.dirty,false);
  await fresh();assert.equal((await a.inspect()).originalPlayer.playerGameType,value);await a.revealSection('游戏模式');await request('joiner','screenshot',{name:'self-mode-'+value+'-confirmed.png'});return {receipt,replies,expected};
 });
 await test('self-no-op-level-and-mode-blocked-with-persistent-reason',async()=>{
  const permissions=await permission(false),items=[];
  for(const field of ['level','mode']){const opened=await fresh();assert.deepEqual(opened.page.world.capabilities.editable,[]);const early=await a.warning('没有可用的自身玩家命令权限或权威查询权限',{persistent:true});
   if(field==='level')await a.editNumber('等级',opened.host.experience.level+1);else await mode('creative');
   const blocked=await a.blockedApply('权限');xpUnchanged(blocked.hostBefore,blocked.hostAfter);assert.equal(blocked.hostAfter.gameMode,blocked.hostBefore.gameMode);await request('joiner','screenshot',{name:'self-no-op-'+field+'-draft-refusal.png'});items.push({field,opened,early,blocked});}
  await permission(true);return {permissions,items};
 });
 await test('self-op-revoked-after-open-rejects-real-request-no-command',async()=>{
  await fresh();const before=await a.server();await a.editNumber('等级',before.experience.level+1);const permissions=await permission(false);const receipt=await a.submit({expected:'rejected',code:'invalid_request'});
  assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);xpUnchanged(receipt.hostBefore,receipt.hostAfter);assert.equal(receipt.page.edits.player.experience.XpLevel,before.experience.level+1);await request('joiner','screenshot',{name:'self-revoked-retained-draft.png'});await permission(true);return {permissions,receipt};
 });
 await test('self-mixed-supported-fields-not-sent-and-draft-retained',async()=>{
  await fresh();const before=await a.server();await a.editNumber('等级',before.experience.level+1);await mode('creative');const blocked=await a.blockedApply('须分开提交');xpUnchanged(blocked.hostBefore,blocked.hostAfter);assert.equal(blocked.hostAfter.gameMode,blocked.hostBefore.gameMode);
  await request('joiner','screenshot',{name:'self-mixed-fields-before-submit-warning.png'});return blocked;
 });
 await test('self-health-warning-before-edit-and-mixed-unsupported-never-sent',async()=>{
  await fresh();await a.revealNumber('生命');const early=await a.warning('需要服务端 Editor',{persistent:true});await request('joiner','screenshot',{name:'self-health-before-edit-needs-server.png'});
  const before=await a.server();await a.editNumber('生命',before.health===18?17:18);await a.editNumber('等级',before.experience.level+1);const blocked=await a.blockedApply('Health');xpUnchanged(blocked.hostBefore,blocked.hostAfter);assert.equal(blocked.hostAfter.health,blocked.hostBefore.health);
  await request('joiner','screenshot',{name:'self-health-mixed-draft-not-sent.png'});return {early,blocked};
 });
 await test('self-unimplemented-position-attribute-pages-warning-and-no-hidden-request',async()=>{
  await fresh();const before=await a.audit(),notices=[];
  for(const [label,fragment] of [['位置与重生','尚未提供命令编辑和权威读取'],['属性与效果','无法完整读取永久属性修饰符和隐藏效果链']]){await a.tab(label);const notice=await a.warning(fragment,{persistent:true});await request('joiner','screenshot',{name:label==='位置与重生'?'self-position-not-opened-warning.png':'self-attribute-effects-not-opened-warning.png'});notices.push({label,notice});}
  assert.equal((await a.audit()).sent.slice(before.sent.length).filter(r=>r.channel==='player_extended'||r.channel==='apply').length,0);return {notices};
 });
 await test('self-saved-level-keeps-health-draft-added-during-query',async()=>{
  await fresh();const before=await a.server(),target=before.experience.level+1;await a.editNumber('等级',target);await request('joiner','holdQueries');let pendingDraft;
  let receipt;try{receipt=await a.submit({afterClick:async()=>{
   let queued=false;for(let n=0;n<30;n++){await delay(100);if((await a.client()).delayedQueryReplies>0){queued=true;break;}}assert(queued,'original preflight query reply must be held');assert((await a.inspect()).pending);pendingDraft=await a.editNumber('生命',before.health===18?17:18);await request('joiner','releaseQueries');
  }});}finally{await request('joiner','releaseQueries');}
  const queries=assertAuthorityQueries(receipt,'XpLevel',target);assertExperience(before,receipt.hostAfter,{level:target});assert.equal(receipt.hostAfter.health,before.health);assert.equal(receipt.page.edits.player.Health,pendingDraft.edits.player.Health);assert.equal(receipt.page.edits.player.experience,undefined);assert.equal(receipt.page.dirty,true);await a.warning('Health',{persistent:true});await request('joiner','screenshot',{name:'self-saved-level-new-health-draft-retained.png'});return {receipt,queries,pendingDraft};
 });
 await test('self-post-query-delay-unknown-never-resends-command-or-late-saved',async()=>{
  await fresh();const before=await a.server(),target=before.experience.level+1;await a.editNumber('等级',target);await request('joiner','holdConfirmationQuery');let receipt;
  try{receipt=await a.submit({expected:'rejected',code:'command_unconfirmed'});assert.equal(receipt.clientAfter.commandAttempts-receipt.clientBefore.commandAttempts,1);assert(receipt.clientAfter.delayedQueryReplies>0);assertExperience(before,receipt.hostAfter,{level:target});assert.equal(receipt.page.edits.player.experience.XpLevel,target);
   await request('joiner','screenshot',{name:'self-confirmation-timeout-draft-command-once.png'});const mark=(await a.audit()).received.length;await request('joiner','releaseQueries');await delay(600);const late=await a.audit();assert(!late.received.slice(mark).some(r=>r.value.requestId===receipt.requestId&&r.value.status==='saved'));assert.equal((await a.client()).commandAttempts,receipt.clientAfter.commandAttempts);return {receipt,late:await a.inspect()};
  }finally{await request('joiner','releaseQueries');}
 });
 await test('self-command-feedback-not-broadcast-to-ordinary-observer',async()=>{
  const feedback=Object.fromEntries(['host','joiner','observer'].map(role=>[role,messages(role).slice(messageStart[role])]));assert.equal((await request('observer','state')).gamemaster,false);assert.equal(feedback.observer,'','ordinary observer must receive no self-command feedback');await request('observer','screenshot',{name:'self-commands-observer-no-admin-feedback.png'});return {feedback};
 });
 await test('container-persistent-restriction-body-visible-before-edit',async()=>{
  await close();await host('execute at LanEditor run setblock ~ ~ ~1 minecraft:chest{Items:[{Slot:0b,id:"minecraft:paper",count:2}]}');await delay(300);await request('joiner','openChest');await delay(500);await request('joiner','hoverMenu',{menuSlot:0});const opened=await h.readyPage();assert.equal(opened.doc.src.kind,'menu');
  await js('(function(){if(document.getElementById("modal"))throw Error("recovery modal unresolved");var e=document.querySelector(".inventory-capability");if(!e)throw Error("persistent capability control missing");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await delay(150);
  const body=await js('(function(){var e=document.querySelector(".k-poplist .ed-hint");if(!e)throw Error("expanded reason body missing");var r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,width:window.innerWidth,height:window.innerHeight,display:s.display,visibility:s.visibility};})()');
  assert(body.text.includes('服务端'));assert(body.w>0&&body.h>0&&body.x>=0&&body.y>=0&&body.x+body.w<=body.width+1&&body.y+body.h<=body.height+1);assert.notEqual(body.display,'none');assert.notEqual(body.visibility,'hidden');assert.equal(await js('diffDoc(Store.doc()).length'),0);await request('joiner','screenshot',{name:'container-persistent-body-before-edit.png'});await close();return {opened,body};
 });
 await close();writeFileSync(join(out,'self-player-result.json'),JSON.stringify({status:'PASS',scope:'vanilla_self first contract: level and mode only, actual authority query replies; extra persistent container notice; XpP/position/attributes/effects not implemented',results:results.slice(start)},null,2));
}
