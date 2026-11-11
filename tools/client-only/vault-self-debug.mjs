import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createSelfPlayerAdapter} from './self-player.mjs';
export async function runVaultSelfDebug({out,request,delay}){
 const js=async code=>(await request('host','eval',{js:code})).value;
 const a=createSelfPlayerAdapter({request,delay,js,expectedBackend:'full'});
 const command=command=>request('host','serverCommand',{command});
 async function wait(code){for(let n=0;n<100;n++){await delay(150);try{if(await js(code))return;}catch{}}throw Error('condition not reached: '+code);}
 const click=async label=>{await js('(function(){var a=Array.prototype.slice.call(document.querySelectorAll("#modal .k-btn")).filter(function(e){return e.textContent.trim()==='+JSON.stringify(label)+';});if(a.length!==1)throw Error("button not unique: '+label+'");a[0].dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await delay(250);};
 async function openItem(){await request('host','open');await wait('typeof Store!=="undefined"&&Store.docs.length>0');}
 async function count(){const s=await request('host','state');return s.serverPlayers.find(p=>p.name==='LanHost').inventory[0].count;}
 await command('item replace entity LanHost hotbar.0 with minecraft:paper 3');await request('host','select',{slot:0});
 for(let n=0;n<100;n++){const s=await request('host','state');if(!s.screen)break;await delay(150);}
 await openItem();await js('oriel.send("open_world",{self:true});true');await wait('WE.w&&WE.w.player&&WE.w.player.self');
 await js('(function(){window.vaultSelfFixture=null;Vault.upload(JSON.stringify({world:WE.w,sections:["inventory"]}),function(u){if(!u.ok){window.vaultSelfFixture=u;return;}Vault.call("save",{kind:"player_preset",name:"套用自身实机验证",uploadToken:u.token},function(r){window.vaultSelfFixture=r;});});return true;})()');
 await wait('window.vaultSelfFixture!==null');const fixture=await js('window.vaultSelfFixture');assert(fixture.ok);
 await request('host','close');await command('item replace entity LanHost hotbar.0 with minecraft:paper 9');await delay(350);await openItem();
 await a.installAudit();await js('openVault({kind:"player_preset"});true');await wait('!!document.querySelector("#modal .k-xhead")');
 await request('host','screenshot',{name:'vault-preset-self-action.png'});
 await click('套用到自己身上');await wait('!!WE.w&&!!WE.w.player&&WE.w.player.self&&document.getElementById("modal").textContent.indexOf("套用哪些部分")>=0');
 const target=await js('({uuid:WE.w.player.uuid,preset:WE.w.player.preset||false})');assert.equal(target.preset,false);
 assert.equal(target.uuid,(await request('host','state')).uuid,'target must be the actual local player');
 await a.installAudit(); // Item -> player opens a new Document: observe that actual page.
 assert.equal(await count(),9,'navigation and section selection must not write');
 await click('下一步：看会覆盖什么');await wait('document.getElementById("modal").textContent.indexOf("当前数据没有备份")>=0');
 await click('是，先存入');await wait('document.getElementById("modal").textContent.indexOf("确认套用")>=0');
 assert.equal(await count(),9,'preview/backup must not apply');await request('host','screenshot',{name:'vault-self-overwrite-confirm.png'});
 await click('取消');assert.equal(await count(),9,'cancel must not write');
 await js('openVault({kind:"player_preset"});true');await wait('!!document.querySelector("#modal .k-xhead")');
 await js('(function(){var heads=Array.prototype.slice.call(document.querySelectorAll("#modal .k-xhead")),h=heads.filter(function(e){return e.textContent.indexOf("套用自身实机验证")>=0;});if(h.length!==1)throw Error("fixture row not unique");var b=Array.prototype.slice.call(h[0].querySelectorAll(".k-btn")).filter(function(e){return e.textContent.trim()==="套用到自己身上";})[0];if(!b)throw Error("fixture action missing");b.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');
 await wait('document.getElementById("modal").textContent.indexOf("套用哪些部分")>=0');await click('下一步：看会覆盖什么');
 await wait('document.getElementById("modal").textContent.indexOf("确认套用")>=0');await click('确认套用');
 await wait('window.lanSelfAudit.received.some(function(r){return r.value&&r.value.status==="saved";})');
 const audit=await a.audit(),apply=audit.sent.filter(x=>x.channel==='apply');assert.equal(apply.length,1);assert(audit.received.some(r=>r.value?.status==='saved'&&r.value.requestId===apply[0].payload.requestId));
 assert.equal(await count(),3,'actual host inventory restored from preset');assert.equal(await js('weDirty()'),false);
 await request('host','close');await delay(250);await openItem();await js('oriel.send("open_world",{self:true});true');await wait('WE.w&&WE.w.player&&WE.w.player.self');
 assert.equal(await count(),3);assert.equal(await js('weDirty()'),false);await request('host','screenshot',{name:'vault-self-applied-reopened.png'});
 writeFileSync(join(out,'vault-self-result.json'),JSON.stringify({status:'PASS',scope:'Fabric26.1.2 packaged integrated server, real vault row action -> authoritative self -> sections -> preview -> backup -> cancel/no-write -> explicit apply/saved -> host9to3 -> reopen',fixture,target,audit},null,2));
}
