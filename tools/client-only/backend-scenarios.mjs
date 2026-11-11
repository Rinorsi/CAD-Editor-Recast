import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createSelfPlayerAdapter} from './self-player.mjs';
export async function run({out,mode,request:raw,delay}){
 const single=mode==='backend-single',name=single?'LanHost':'LanEditor',role=single?'host':'joiner',results=[];
 const request=(r,action,params={})=>raw(r==='joiner'?role:r,action,action==='playerFields'?{...params,name}:params);
 const js=async code=>(await request('joiner','eval',{js:code})).value;
 const a=createSelfPlayerAdapter({request,delay,js,expectedBackend:'full'});
 const command=command=>raw('host','serverCommand',{command});
 async function grant(value){await raw('host','operator',{name,grant:value});for(let n=0;n<40;n++){await delay(100);if((await a.server()).gamemaster===value)return;}throw Error('actual permission state did not converge');}
 async function itemPage(){await request('joiner','open');for(let n=0;n<50;n++){await delay(150);try{if(await js('typeof Store!=="undefined"&&!!Store.doc().id')){await js('(function(){var m=document.getElementById("modal");if(!m)return true;var b=Array.prototype.slice.call(m.querySelectorAll(".k-btn")).filter(function(e){return e.textContent.indexOf("丢弃")>=0;})[0];if(!b)throw Error("unresolved modal");b.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');return;}}catch{}}throw Error('actual item page unavailable');}
 async function fresh(){await request('joiner','close');await delay(300);await itemPage();const opened=await a.openSelf();const v=await a.inspect();assert.equal(v.world.player.uuid,opened.host.uuid,'real self UUID must match host-authoritative actor');assert.equal(await js('wpCommandCaps()'),null,'full backend must not use vanilla_self whitelist');assert.deepEqual(v.problems,[]);await a.tab('状态');return v;}
 async function test(name,fn){try{results.push({name,status:'PASS',evidence:await fn()});}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}finally{writeFileSync(join(out,'backend-scenarios.json'),JSON.stringify(results,null,2));}}
 await grant(true);await command('gamemode survival '+name);await command('effect give '+name+' minecraft:resistance 120 4 true');
 await command('item replace entity '+name+' hotbar.0 with minecraft:paper 3');await request('joiner','select',{slot:0});await delay(500);
 // Fallback rejects Health/food and mixed operations. Opening cannot pass this.
 await test('full-backend-health-food-xp-mixed-real-controls-saved-and-reopened',async()=>{
  await fresh();const before=await a.server();await a.editNumber('生命',16);await a.editNumber('饥饿值',12);await a.editNumber('饱和度',0);await a.editNumber('等级',before.experience.level===7?8:7);assert.equal((await a.inspect()).dirty,true);assert.deepEqual((await a.inspect()).problems,[]);
  const receipt=await a.submit();assert.equal(receipt.hostAfter.health,16);assert.equal(receipt.hostAfter.food.level,12);assert.equal(receipt.hostAfter.experience.level,before.experience.level===7?8:7);assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts,'full backend must not send fallback modification commands');assert.equal(receipt.page.dirty,false);
  await fresh();const reopened=await a.inspect();assert.equal(reopened.originalPlayer.Health,16);assert.equal(reopened.originalPlayer.food.foodLevel,12);assert.equal(reopened.originalPlayer.experience.XpLevel,receipt.hostAfter.experience.level);await a.revealNumber('生命');await request('joiner','screenshot',{name:'backend-health-food-xp-reopened.png'});return {before,receipt,reopened};
 });
 if(!single)await test('full-backend-per-request-revocation-rejected-draft-preserved',async()=>{
  await fresh();await a.editNumber('生命',15);await grant(false);const receipt=await a.submit({expected:'rejected',code:'player_forbidden'});assert.equal(receipt.hostAfter.health,receipt.hostBefore.health);assert.equal(receipt.page.edits.player.Health,15);assert.equal(receipt.clientAfter.commandAttempts,receipt.clientBefore.commandAttempts);await request('joiner','screenshot',{name:'backend-revoked-health-draft.png'});await grant(true);return receipt;
 });
 await request('joiner','close');writeFileSync(join(out,'backend-result.json'),JSON.stringify({status:'PASS',scope:mode+' actual mixed Health/food/XP save and reopen'+(single?'; owner permission denial not claimed':'; real remote OP revocation'),results,notExecuted:single?['singleplayer owner denial: vanilla owner privileges; dual mode tests non-owner revocation']:[]},null,2));
}
