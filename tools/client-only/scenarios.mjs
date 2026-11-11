import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
export async function run({out,request,delay,scope='full',casePattern=null}){
 const results=[];
 const save=()=>writeFileSync(join(out,'scenarios.json'),JSON.stringify(results,null,2));
 const host=command=>/^(op|deop) /.test(command)?request('host','operator',{name:command.split(' ')[1],grant:command.startsWith('op ')}):request('host','serverCommand',{command});
 const js=async code=>(await request('joiner','eval',{js:code})).value;
 const inspect=()=>js('({doc:JSON.parse(JSON.stringify(Store.doc())),pending:!!EditorBridge.pending,text:document.body.textContent,results:window.lanResults||[],vault:oriel.data["vault.result"]})');
 const state=()=>request('host','state');
 const owned=async()=>{const s=await state();return s.serverPlayers.find(p=>p.name==='LanEditor');};
 async function readyPage(){for(let n=0;n<40;n++){await delay(250);try{const v=await inspect();if(v.doc?.id){
   const discarded=await js('(function(){var m=document.getElementById("modal");if(!m||m.textContent.indexOf("上次编辑这些物品时有")<0)return false;var a=Array.prototype.slice.call(m.querySelectorAll(".k-btn")),b=a.filter(function(e){return e.textContent.indexOf("丢弃")>=0;})[0];if(!b)throw Error("draft decision button missing");b.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');
   if(discarded)await delay(300);
   await js('window.lanResults=[];oriel.on("patch",function(p){if(p.key==="result")window.lanResults.push(p.value);});true');return {...await inspect(),recoveryDraftDiscarded:discarded};}}catch{}}throw Error('editor page not ready');}
 async function page(){await request('joiner','open');return readyPage();}
 async function close(){await request('joiner','close');await delay(350);}
 async function apply(expected='saved',code,afterSend){
  await js('openApply();true');await delay(250);
  const id=await js('(function(){window.lanResults=[];var a=Array.prototype.slice.call(document.querySelectorAll(".k-btn"));var e=a.filter(function(e){return e.textContent.indexOf("应用到游戏")>=0;}).pop();if(!e)throw Error("apply button missing");e.dispatchEvent(new Event("click",{bubbles:true}));return EditorBridge.pending?EditorBridge.pending.id:(window.lanResults.length?window.lanResults[window.lanResults.length-1].requestId:null);})()');
  assert(id,'actual apply requestId required');
  if(afterSend)await afterSend(id);
  for(let n=0;n<70;n++){await delay(200);const s=await inspect();if(!s.pending){const result=s.results.find(r=>r.requestId===id);assert(result,'real host result for submitted requestId required');assert.equal(result.status,expected);if(code)assert.equal(result.code,code);return {...s,result,requestId:id};}}throw Error('apply pending timeout');
 }
 async function test(name,fn){if(scope==='next'&&casePattern&&!new RegExp(casePattern).test(name)){results.push({name,status:'NOT_RUN',reason:'explicit case selection',casePattern});save();return;}try{const evidence=await fn();results.push({name,status:'PASS',evidence});save();console.log(name+' PASS '+join(out,'scenarios.json'));}catch(e){results.push({name,status:'FAIL',error:e.stack});save();console.error(name+' FAIL '+join(out,'scenarios.json')+' '+e.message);throw e;}}
 await host('gamemode survival LanEditor');await host('op LanEditor');
 await delay(800);assert.equal((await owned()).gamemaster,true,'real server OP required');
 const granted=await request('joiner','state');assert(granted.commandRoots.includes('execute')&&granted.commandRoots.includes('item'),'real command tree required');
 await host('item replace entity LanEditor hotbar.0 with minecraft:paper[minecraft:custom_data={typed:1234567890123456789L,bytes:[B;1b,2b]},minecraft:rarity="epic"] 3');
 await request('joiner','select',{slot:0});await delay(800);
 if(scope==='creative'){await import('./creative.mjs').then(m=>m.run({out,request,delay,js,inspect,owned,host,page,readyPage,apply,close,test,results}));return;}
 if(scope==='next'){await import('./self-player-next.mjs').then(m=>m.run({out,request,delay,js,inspect,owned,host,page,readyPage,apply,close,test,results,casePattern}));return;}
 if(['inventory','self','expanded'].includes(scope)){
  const helpers={out,request,delay,js,inspect,owned,host,page,readyPage,apply,close,test,results};
  if(scope!=='self')await import('./inventory.mjs').then(m=>m.run(helpers));
  if(scope!=='inventory')await import('./self-player-scenarios.mjs').then(m=>m.run(helpers));
  if(scope==='expanded')writeFileSync(join(out,'expanded-result.json'),JSON.stringify({status:'PASS',scope:'inventory/Vault permissions and first self-player mode/level contract; actual LAN only',results},null,2));return;
 }
 if(scope==='notice'){
  async function visibleToast(text){const r=await js('(function(){var text='+JSON.stringify(text)+',a=Array.prototype.slice.call(document.querySelectorAll(".k-toast"));return a.filter(function(e){return e.textContent.indexOf(text)>=0;}).map(function(e){var r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,width:window.innerWidth,height:window.innerHeight};});})()');assert(r.length>0,'current editor page toast required');assert(r.some(v=>v.w>0&&v.h>0&&v.x>=0&&v.y>=0&&v.x+v.w<=v.width+1&&v.y+v.h<=v.height+1),'toast must fit visible page');return r;}
  await test('notice-build-real-save-host-readback-and-reopen-smoke',async()=>{
   await page();await js('Store.set("custom_name",{text:"LAN notice build"});Store.setCount(4);true');const response=await apply();const server=await owned();assert.equal(server.inventory[0].count,4);
   await close();const reopened=await page();assert.equal(reopened.doc.count,4);assert(JSON.stringify(reopened.doc.comps.custom_name).includes('LAN notice build'));await request('joiner','screenshot',{name:'11-notice-build-save-reopened.png'});return {response,server,reopened};
  });
  await test('world-self-refusal-visible-in-current-editor-page',async()=>{
   assert(!(await js('!!document.getElementById("modal")')),'recovery draft modal must be resolved');await js('Store.setCount(6);true');const before=await inspect(),serverBefore=await owned();
   await js('oriel.send("open_world",{self:true});true');await delay(400);
   const toasts=await visibleToast('服务器未安装物品工坊'),after=await inspect();assert.deepEqual(after.doc,before.doc);const serverAfter=await owned();assert.deepEqual(serverAfter.inventory,serverBefore.inventory);
   await request('joiner','screenshot',{name:'12-world-page-visible-refusal.png'});await close();return {toasts,draftBefore:before.doc,draftAfter:after.doc,serverBefore,serverAfter};
  });
  await test('vault-real-give-button-visible-refusal-no-library-or-inventory-change',async()=>{
   await page();await js('window.lanVault=null;Vault.call("save",{stack:oriel.data.stack,name:"Visible LAN fixture"},function(r){window.lanVault=r;});true');let saved;
   for(let n=0;n<50;n++){await delay(150);saved=await js('window.lanVault');if(saved)break;}assert(saved?.ok);
   const before=await owned();await js('window.lanGive=null;oriel.on("patch",function(p){if(p.key==="vault.result"&&p.value.op==="give")window.lanGive=p.value;});openVault();true');
   for(let n=0;n<50;n++){await delay(150);if(await js('Array.prototype.slice.call(document.querySelectorAll(".k-btn")).some(function(e){return e.textContent.trim()==="给我";})'))break;}
   const libraryBefore=await js('({entries:Vault.st.entries,bytes:Vault.st.bytes})');
   await js('(function(){var e=Array.prototype.slice.call(document.querySelectorAll(".k-btn")).filter(function(e){return e.textContent.trim()==="给我";})[0];if(!e)throw Error("actual Vault give button missing");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');
   let reply;for(let n=0;n<50;n++){await delay(150);reply=await js('window.lanGive');if(reply)break;}assert.equal(reply?.ok,false);assert.equal(reply.error,'not_connected');
   const toasts=await visibleToast('服务器没有安装物品工坊');assert.deepEqual((await owned()).inventory,before.inventory);const libraryAfter=await js('({entries:Vault.st.entries,bytes:Vault.st.bytes})');assert.deepEqual(libraryAfter,libraryBefore);
   await request('joiner','screenshot',{name:'13-vault-real-give-visible-refusal.png'});await close();return {reply,toasts,libraryBefore,libraryAfter};
  });
  writeFileSync(join(out,'notice-result.json'),JSON.stringify({status:'PASS',scope:'new artifact save smoke and visible refusals only',results},null,2));return;
 }
 if(scope==='extra'){
  await test('hovered-nonselected-hotbar-8-real-save-and-same-entry-reopen',async()=>{
   await host('item replace entity LanEditor hotbar.8 with minecraft:stone 7');await delay(400);const before=await owned();
   await request('joiner','inventory',{menuSlot:44});const opened=await readyPage();assert.equal(opened.doc.src.index,8);assert.equal((await request('joiner','state')).selected,0);
   await js('Store.setCount(8);true');const response=await apply();const after=await owned();assert.equal(after.inventory[8].count,8);assert.deepEqual(after.inventory[0],before.inventory[0]);
   await close();await request('joiner','inventory',{menuSlot:44});const reopened=await readyPage();assert.equal(reopened.doc.src.index,8);assert.equal(reopened.doc.count,8);
   await request('joiner','screenshot',{name:'09-nonselected-hotbar-8-saved-reopened.png'});await close();return {before,opened,response,after,reopened};
  });
  await test('oversized-snbt-rejected-with-real-request-id-and-draft-retained',async()=>{
   await page();await js('Store.revertAll();Store.set("custom_data",{sample:new Array(35001).join("x")});true');const before=await owned();
   const response=await apply('rejected','invalid_request');assert.equal(response.result.reason,'SNBT 超过 8192 字符');assert.equal(response.doc.comps.custom_data.sample.length,35000);assert.deepEqual((await owned()).inventory,before.inventory);
   await request('joiner','screenshot',{name:'10-oversized-snbt-draft-retained.png'});await close();return {requestId:response.requestId,result:response.result,draftLength:35000,serverBefore:before,serverAfter:await owned()};
  });
  writeFileSync(join(out,'extra-result.json'),JSON.stringify({status:'PASS',scope:'additional scenarios only; prior 13 are separate evidence',results},null,2));return;
 }
 await test('survival-op-real-page-save-server-readback-reopen',async()=>{
  const before=await page();assert(before.text.includes('快捷栏')||before.text.includes('命令'));
  await js('Store.set("custom_name",{text:"LAN saved"});Store.setCount(4);true');
  const response=await apply();await delay(500);
  const server=await owned();assert.equal(server.inventory[0].count,4);assert(JSON.stringify(server.inventory[0].components['minecraft:custom_name']).includes('LAN saved'));
  assert.equal(server.inventory[0].components['minecraft:rarity'],'epic');
  await request('joiner','screenshot',{name:'01-saved.png'});
  await request('host','screenshot',{name:'01-host-saved-feedback.png'});
  assert(server.inventorySnbt[0].includes('typed:1234567890123456789L'));assert(server.inventorySnbt[0].includes('bytes:[B;1B,2B]'));
  await close();const reopened=await page();assert.equal(reopened.doc.count,4);assert(JSON.stringify(reopened.doc.comps.custom_name).includes('LAN saved'));
  return {before,response,server,reopened};
 });
 await test('fixed-hotbar-binding-after-changing-mainhand',async()=>{
  await host('item replace entity LanEditor hotbar.8 with minecraft:stone 7');await delay(350);
  await js('Store.setCount(5);true');await request('joiner','select',{slot:8});await apply();await delay(400);
  const server=await owned();assert.equal(server.inventory[0].count,5);assert.equal(server.inventory[8].count,7);assert.equal(server.inventory[8].id,'minecraft:stone');
  await close();return server;
 });
 await request('joiner','select',{slot:0});await delay(400);
 await test('remove-component-enchantment-typed-data-preserved',async()=>{
  await page();await js('Store.remove("rarity");Store.set("enchantments",{"minecraft:unbreaking":2});true');await apply();await delay(400);
  const server=await owned();assert.equal(server.inventory[0].components['!minecraft:rarity']!=null,true);assert.equal(server.inventory[0].components['minecraft:enchantments']['minecraft:unbreaking'],2);
  assert(server.inventorySnbt[0].includes('typed:1234567890123456789L'));assert(server.inventorySnbt[0].includes('bytes:[B;1B,2B]'));
  await close();return server;
 });
 await test('permission-revoked-after-open-keeps-draft',async()=>{
  await page();await js('Store.setCount(9);true');await host('deop LanEditor');await delay(1000);
  const before=await owned();const client=await request('joiner','state');assert.equal(before.gamemaster,false);assert(!client.commandRoots.includes('item'));
  const response=await apply('rejected','command_unavailable');const after=await owned();assert.deepEqual(after.inventory,before.inventory);assert.equal(response.doc.count,9);assert(response.text.includes('权限')||response.text.includes('不能'));
  await request('joiner','screenshot',{name:'02-permission-denied-draft.png'});await close();return {before,client,response,after};
 });
 await test('no-permission-open-edit-denied',async()=>{
  const p=await page();await js('Store.setCount(11);true');const response=await apply('rejected','command_unavailable');assert.equal(response.doc.count,11);assert.equal((await owned()).inventory[0].count,5);await close();return response;
 });
 await host('op LanEditor');await delay(800);
 await test('changed-target-rejected-no-overwrite',async()=>{
  await page();await js('Store.setCount(12);true');await host('item replace entity LanEditor hotbar.0 with minecraft:dirt 6');await delay(500);const response=await apply('rejected','session_stale');const server=await owned();assert.equal(server.inventory[0].id,'minecraft:dirt');assert.equal(server.inventory[0].count,6);assert.equal(response.doc.count,12);await close();return {response,server};
 });
 await test('illegal-section-and-del-refused-before-send-draft-connected',async()=>{
  const evidence=[];
  for(const ch of [String.fromCharCode(167),String.fromCharCode(127)]){
   await page();await js('Store.set("custom_data",{sample:'+JSON.stringify(ch)+'});true');const response=await apply('rejected','invalid_request');
   const client=await request('joiner','state');assert(client.connected);assert.equal(response.doc.comps.custom_data.sample,ch);assert(response.text.includes('字符'));
   evidence.push({response,client});await close();
  }return evidence;
 });
 await test('ordinary-inventory-slot-9-explicit-unsupported',async()=>{
  await host('item replace entity LanEditor inventory.0 with minecraft:paper 2');await delay(400);
  await request('joiner','inventory',{menuSlot:9});const opened=await readyPage();assert.equal(opened.doc.src.index,9);
  await js('Store.setCount(3);true');const response=await apply('rejected','not_connected');assert.equal(response.doc.count,3);assert(response.text.includes('背包、容器'));
  const server=await owned();assert.equal(server.inventory[9].count,2);await request('joiner','screenshot',{name:'04-backpack-unsupported.png'});await close();return {opened,response,server};
 });
 await test('original-illegal-character-only-changing-count-safely-rejected',async()=>{
  const evidence=[];
  for(const ch of [String.fromCharCode(167),String.fromCharCode(127)]){
   await host('item replace entity LanEditor hotbar.0 with minecraft:paper[minecraft:custom_data={sample:'+JSON.stringify(ch)+'}] 2');await delay(500);
   await page();await js('Store.revertAll();Store.setCount(3);true');const response=await apply('rejected','invalid_request');assert(response.text.includes('字符'));const client=await request('joiner','state');assert(client.connected);assert.equal((await owned()).inventory[0].count,2);evidence.push({response,client});await close();
  }
  await host('item replace entity LanEditor hotbar.0 with minecraft:dirt 6');await delay(400);return evidence;
 });
 await test('world-self-navigation-explicit-server-required',async()=>{
  await page();await js('oriel.send("open_world",{self:true});true');await delay(600);
  const evidence=await inspect();await request('joiner','screenshot',{name:'05-world-unsupported.png'});
  const hud=(await request('joiner','eval',{hud:'cadeditor:toast',js:'({text:document.body.textContent,data:oriel.data})'})).value;assert(hud.text.includes('服务器未安装物品工坊'));await close();return {evidence,hud};
 });
 await test('world-block-entity-and-other-player-real-command-entry-unsupported',async()=>{
  const evidence=[];
  let prior=(await request('joiner','eval',{hud:'cadeditor:toast',js:'oriel.data.seq'})).value;
  for(const command of ['cadeditor block','cadeditor entity','cadeditor player LanObserver']){
   await request('joiner','command',{command});await delay(500);
   const hud=(await request('joiner','eval',{hud:'cadeditor:toast',js:'({text:document.body.textContent,data:oriel.data})'})).value;
   assert(hud.text.includes('服务器未安装物品工坊'));assert(hud.data.seq>prior,'new production toast required for each command');prior=hud.data.seq;evidence.push({command,hud});
  }return evidence;
 });
 await test('real-chest-container-item-explicit-unsupported',async()=>{
  await host('execute at LanEditor run setblock ~ ~ ~1 minecraft:chest{Items:[{Slot:0b,id:"minecraft:paper",count:2}]}');await delay(500);
  await request('joiner','openChest');await delay(600);await request('joiner','hoverMenu',{menuSlot:0});const opened=await readyPage();assert.equal(opened.doc.src.kind,'menu');
  await js('Store.setCount(3);true');const response=await apply('rejected','not_connected');assert(response.text.includes('背包、容器'));assert.equal(response.doc.count,3);
  await request('joiner','screenshot',{name:'08-container-unsupported.png'});await close();return {opened,response};
 });
 async function vault(op,fields){await js('window.lanVault=null;Vault.call('+JSON.stringify(op)+','+JSON.stringify(fields)+',function(r){window.lanVault=r;});true');for(let n=0;n<50;n++){await delay(150);const v=await js('window.lanVault');if(v)return v;}throw Error('vault response timeout');}
 await test('survival-vault-give-explicit-refusal-library-unchanged',async()=>{
  await page();const stack=await js('oriel.data.stack');const saved=await vault('save',{stack,name:'LAN fixture'});assert(saved.ok);
  const before=await vault('stats',{}),inventory=await owned();const reply=await vault('give',{id:saved.entry.id});assert.equal(reply.ok,false);assert.equal(reply.error,'not_connected');
  const after=await vault('stats',{});assert.equal(after.entries,before.entries);assert.deepEqual((await owned()).inventory,inventory.inventory);
  await request('joiner','screenshot',{name:'06-vault-give-unsupported.png'});await close();return {saved,before,reply,after};
 });
 await test('timeout-late-original-server-sync-keeps-terminated-baseline',async()=>{
  await page();await js('Store.revertAll();Store.setCount(13);true');await request('joiner','holdInventory');
  const response=await apply('rejected','result_unknown',async id=>{
   const before=await js('({id:EditorBridge.pending.id,sequence:EditorBridge.sequence})');assert.equal(before.id,id);
   await js('applyToGame();true');const after=await js('({id:EditorBridge.pending.id,sequence:EditorBridge.sequence})');assert.deepEqual(after,before);
  });assert.equal(response.doc.count,13);
  const server=await owned();assert.equal(server.inventory[0].count,13);const baseline=response.doc.base;
  await request('joiner','releaseInventory');await delay(800);const late=await inspect();assert.equal(late.doc.base,baseline);assert.equal(late.results.filter(r=>r.status==='saved').length,0);
  await close();return {response,server,late};
 });
 await test('oversized-submit-retains-draft-with-explicit-snbt-limit-rejection',async()=>{
  await page();await js('Store.revertAll();Store.set("custom_data",{sample:new Array(35001).join("x")});true');const before=await owned();
  const response=await apply('rejected','invalid_request');assert(!response.pending);assert.equal(response.doc.comps.custom_data.sample.length,35000);
  assert.equal(response.result.reason,'SNBT 超过 8192 字符');assert(!response.results.some(r=>r.status==='saved'));assert.deepEqual((await owned()).inventory,before.inventory);await close();return {result:response.result,bytes:35000,server:before};
 });
 await test('feedback-reaches-operator-but-not-ordinary-observer',async()=>{
  const observer=await request('observer','state'),hostState=await state();assert.equal(observer.gamemaster,false);assert(hostState.serverPlayers.some(p=>p.uuid===observer.uuid));
  const hostMessages=readFileSync(join(out,'host/messages.jsonl'),'utf8');
  const operatorMessages=readFileSync(join(out,'joiner/messages.jsonl'),'utf8');
  const path=join(out,'observer/messages.jsonl'),ordinaryMessages=existsSync(path)?readFileSync(path,'utf8'):'';
  assert(hostMessages.includes('LAN saved')&&hostMessages.includes('替换'));
  assert(operatorMessages.includes('替换'));
  assert(!ordinaryMessages.includes('LAN saved'));assert(!ordinaryMessages.includes('替换'));
  await request('observer','screenshot',{name:'07-observer-no-admin-feedback.png'});return {observer,hostMessages,operatorMessages,ordinaryMessages};
 });
 await request('host','screenshot',{name:'03-host-op-messages.png'});
 writeFileSync(join(out,'full-result.json'),JSON.stringify({status:'PASS',results},null,2));
}
