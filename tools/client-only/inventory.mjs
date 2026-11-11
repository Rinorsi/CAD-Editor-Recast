import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Revised product scope: own main inventory 0..35, command-authorized survival
// Vault give into an empty owned slot. Historical refusal scopes stay archived.
export async function run(h){
 const {out,request,delay,js,inspect,owned,host,page,readyPage,apply,close,test,results}=h;
 const slot=i=>i<9?'hotbar.'+i:'inventory.'+(i-9);
 const client=()=>request('joiner','state');
 const unchangedExcept=(before,after,index)=>{
  for(let i=0;i<36;i++)if(i!==index)assert.equal(after.inventorySnbt[i],before.inventorySnbt[i],'unexpected mutation at inventory '+i);
 };
 const messages=role=>{const path=join(out,role,'messages.jsonl');return existsSync(path)?readFileSync(path,'utf8'):'';};
 const bookmark=()=>Object.fromEntries(['host','joiner','observer'].map(role=>[role,messages(role).length]));
 const receivedSince=before=>Object.fromEntries(Object.keys(before).map(role=>[role,messages(role).slice(before[role])]));
 async function permission(grant){
  await host((grant?'op ':'deop ')+'LanEditor');
  for(let n=0;n<30;n++){
   await delay(150);const server=await owned(),c=await client();
   const tree=c.commandRoots.includes('execute')&&c.commandRoots.includes('item');
   if(server.gamemaster===grant&&tree===grant)return {server,client:c};
  }throw Error('vanilla OP and command tree did not converge');
 }
 async function visibleToast(fragment){
  const list=await js('(function(){var a=Array.prototype.slice.call(document.querySelectorAll(".k-toast"));return a.map(function(e){var r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,width:window.innerWidth,height:window.innerHeight};});})()');
  const matches=list.filter(v=>v.text.includes(fragment));assert(matches.length,'current-page refusal missing: '+fragment);
  assert(matches.some(v=>v.w>0&&v.h>0&&v.x>=0&&v.y>=0&&v.x+v.w<=v.width+1&&v.y+v.h<=v.height+1),'refusal toast must fit page');return matches;
 }
 async function visiblePermissionExplanation(kind='inventory'){
  if(kind==='inventory'){await js('(function(){if(document.getElementById("modal"))throw Error("draft modal must be resolved first");var e=document.querySelector(".inventory-capability");if(!e)throw Error("persistent inventory capability control missing");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await delay(150);}
  const selector=kind==='inventory'?'.k-poplist .ed-hint':'.vt-warn .vt-msg';
  const nodes=await js('(function(){return Array.prototype.slice.call(document.querySelectorAll('+JSON.stringify(selector)+')).map(function(e){var r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,shown:s.display!=="none"&&s.visibility!=="hidden"&&s.opacity!=="0",width:window.innerWidth,height:window.innerHeight};});})()');
  const visible=nodes.filter(v=>v.shown&&v.w>0&&v.h>0&&v.x>=0&&v.y>=0&&v.x+v.w<=v.width+1&&v.y+v.h<=v.height+1);
  assert(visible.some(v=>/原版命令不可用|权限不足|授予对应权限/.test(v.text)),'specific command-permission refusal body must be visible, not control label/title');return visible;
 }
 async function openVault(){
  await js('window.lanGives=[];oriel.on("patch",function(p){if(p.key==="vault.result"&&p.value.op==="give")window.lanGives.push(p.value);});openVault();true');
  for(let n=0;n<60;n++){await delay(150);if(await js('Array.prototype.slice.call(document.querySelectorAll(".k-btn")).some(function(e){return e.textContent.trim()==="给我";})'))return;}
  throw Error('actual Vault give button did not appear');
 }
 async function clickGive(){
  const sent=await js('(function(){window.lanGives=[];var e=Array.prototype.slice.call(document.querySelectorAll(".k-btn")).filter(function(e){return e.textContent.trim()==="给我";})[0];if(!e)throw Error("actual Vault give button missing");var r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)throw Error("give button not visible");e.dispatchEvent(new Event("click",{bubbles:true}));var prefix="va"+Vault.seq+"-",ids=Object.keys(Vault.wait).filter(function(id){return id.indexOf(prefix)===0;});return {id:ids[0]||(window.lanGives.length?window.lanGives[window.lanGives.length-1].requestId:null),sequence:Vault.seq};})()');
  assert(sent.id,'actual give requestId required');
  for(let n=0;n<100;n++){
   await delay(150);const replies=await js('window.lanGives'),reply=replies.find(r=>r.requestId===sent.id);
   if(reply)return {requestId:sent.id,reply};
  }throw Error('real Vault give reply timeout');
 }
 async function library(){
  await js('window.lanLibrary=null;Vault.call("get",{ids:['+JSON.stringify(template.id)+']},function(r){window.lanLibrary=r;});true');
  for(let n=0;n<60;n++){await delay(100);const r=await js('window.lanLibrary');if(r){assert.equal(r.ok,true);return {stats:await js('({entries:Vault.st.entries,bytes:Vault.st.bytes})'),entries:r.entries};}}
  throw Error('read-only library snapshot timed out');
 }
 assert.equal((await client()).creative,false,'test must be survival, not creative fallback');

 for(const [index,count] of [[9,5],[35,6]]){
  await test('authorized-own-inventory-'+index+'-hover-save-and-reopen',async()=>{
   const permissions={server:await owned(),client:await client()};assert.equal(permissions.server.gamemaster,true);assert(permissions.client.commandRoots.includes('execute')&&permissions.client.commandRoots.includes('item'));assert.equal(permissions.client.selected,0);
   await host('item replace entity LanEditor '+slot(index)+' with minecraft:paper 2');await delay(400);
   const before=await owned();await request('joiner','inventory',{menuSlot:index});const opened=await readyPage();assert.equal(opened.doc.src.index,index);
   await js('Store.setCount('+count+');true');const response=await apply();assert.equal(await js('diffDoc(Store.doc()).length'),0);const after=await owned();assert.equal(after.inventory[index].count,count);unchangedExcept(before,after,index);
   await close();await request('joiner','inventory',{menuSlot:index});const reopened=await readyPage();assert.equal(reopened.doc.src.index,index);assert.equal(reopened.doc.count,count);
   assert.equal(await js('diffDoc(Store.doc()).length'),0);await request('joiner','screenshot',{name:'inventory-'+index+'-saved-reopened.png'});await close();return {permissions,before,opened,response,after,reopened};
  });
 }
 await test('hotbar-mainhand-binding-survives-selection-change',async()=>{
  await host('item replace entity LanEditor hotbar.8 with minecraft:stone 7');await request('joiner','select',{slot:0});await delay(400);
  const before=await owned();await page();await js('Store.set("custom_name",{text:"Inventory scope saved"});Store.setCount(4);true');await request('joiner','select',{slot:8});
  const response=await apply(),after=await owned();assert.equal(await js('diffDoc(Store.doc()).length'),0);assert.equal(after.inventory[0].count,4);unchangedExcept(before,after,0);await close();await request('joiner','select',{slot:0});return {before,response,after};
 });
 await test('item-pending-document-reload-late-sync-never-saves-new-page-or-overwrites-B',async()=>{
  await page();await js('Store.setCount(5);true');await request('joiner','holdInventory');let evidence;
  try{
   await js('openApply();true');await delay(200);const id=await js('(function(){var e=Array.prototype.slice.call(document.querySelectorAll(".k-btn")).filter(function(e){return e.textContent.indexOf("应用到游戏")>=0;}).pop();if(!e)throw Error("actual confirmation missing");e.dispatchEvent(new Event("click",{bubbles:true}));return EditorBridge.pending&&EditorBridge.pending.id;})()');assert(id);
   let committed=false;for(let n=0;n<40;n++){await delay(100);if((await owned()).inventory[0].count===5&&(await client()).delayedInventoryPackets>0){committed=true;break;}}assert(committed,'server A save must precede delayed original sync');
   const reload=await request('joiner','reloadPage');assert.equal(reload.documentChanged,true);const reloaded=await readyPage();const stale=await js('({state:oriel.data.inventory_session,stale:EditorInventorySessionStale})');assert.equal(stale.stale,true);assert.equal(stale.state.stale,true);
   await host('item replace entity LanEditor hotbar.0 with minecraft:dirt 6');await delay(250);const B=await owned(),attempts=(await client()).commandAttempts;
   await request('joiner','releaseInventory');await delay(650);const late=await inspect();assert.equal(late.doc.base,reloaded.doc.base);assert.deepEqual(late.doc,reloaded.doc);assert(!late.results.some(r=>r.status==='saved'));
   await js('Store.setCount(7);openApply();true');await delay(150);await js('(function(){var e=Array.prototype.slice.call(document.querySelectorAll(".k-btn")).filter(function(e){return e.textContent.indexOf("应用到游戏")>=0;}).pop();if(!e)throw Error("actual stale confirmation missing");e.dispatchEvent(new Event("click",{bubbles:true}));return true;})()');await delay(400);
   const final=await inspect();assert.equal(final.doc.count,7);assert(!final.results.some(r=>r.status==='saved'));assert.deepEqual((await owned()).inventorySnbt,B.inventorySnbt);assert.equal((await client()).commandAttempts,attempts);const toasts=await visibleToast('页面已重载');await request('joiner','screenshot',{name:'item-reload-late-sync-draft-no-B-overwrite.png'});
   await close();const reopened=await page();assert.equal(reopened.doc.id,'minecraft:dirt');assert.equal(reopened.doc.count,6);evidence={requestId:id,reload,reloaded,stale,late,final,B,reopened,toasts};await close();
  }finally{await request('joiner','releaseInventory');}
  await host('item replace entity LanEditor hotbar.0 with minecraft:paper[minecraft:custom_name={text:"Inventory scope saved"},minecraft:custom_data={typed:1234567890123456789L,bytes:[B;1b,2b]}] 4');await delay(350);return evidence;
 });
 await test('unprivileged-backpack-apply-refused-with-draft-retained',async()=>{
  const permissions=await permission(false);await request('joiner','inventory',{menuSlot:9});await readyPage();const earlyNotice=await visiblePermissionExplanation();await request('joiner','screenshot',{name:'inventory-no-permission-before-edit.png'});await js('Store.setCount(7);true');const before=await owned(),c=await client();
  await js('document.getElementById("screen").dispatchEvent(new Event("mousedown",{bubbles:true}));true');
  for(let n=0;n<65;n++){if(await js('document.querySelectorAll(".k-toast").length===0'))break;await delay(150);}
  assert.equal(await js('document.querySelectorAll(".k-toast").length'),0,'first transient toast must expire');
  await js('rebuild();true');await delay(250);const persistentNotice=await visiblePermissionExplanation();await request('joiner','screenshot',{name:'inventory-permission-body-after-toast-expiry-rebuild.png'});await js('document.getElementById("screen").dispatchEvent(new Event("mousedown",{bubbles:true}));true');
  const response=await apply('rejected','command_unavailable');assert.equal(response.doc.count,7);assert.deepEqual((await owned()).inventorySnbt,before.inventorySnbt);assert.equal((await client()).commandAttempts,c.commandAttempts);
  const toasts=await visibleToast('权限');await request('joiner','screenshot',{name:'inventory-no-permission-draft.png'});await close();await permission(true);return {permissions,earlyNotice,persistentNotice,response,toasts,before};
 });

 let template;
 await test('vault-local-template-save-for-detached-give',async()=>{
  await page();const source=await owned();template={snbt:source.inventorySnbt[0],stack:source.inventory[0]};
  await js('window.lanSaved=null;Vault.call("save",{stack:oriel.data.stack,name:"Inventory scope template"},function(r){window.lanSaved=r;});true');let reply;
  for(let n=0;n<60;n++){await delay(150);reply=await js('window.lanSaved');if(reply)break;}assert(reply?.ok);template.id=reply.entry.id;return {reply,template};
 });
 await test('authorized-vault-real-give-confirmed-in-only-empty-slot-35',async()=>{
  await host('clear LanEditor');
  for(let i=0;i<35;i++)await host('item replace entity LanEditor '+slot(i)+' with minecraft:stone 64');
  await delay(500);await openVault();const before=await owned(),libraryBefore=await library(),c=await client(),m=bookmark();
  assert.deepEqual(before.inventory[35],{});for(let i=0;i<35;i++)assert.equal(before.inventory[i].count,64);
  const sent=await clickGive();assert.equal(sent.reply.ok,true);assert.equal(sent.reply.status,'saved');assert.equal(sent.reply.confirmed,true);assert.equal(sent.reply.path,'command');assert.equal(sent.reply.inventoryIndex,35);await delay(500);const after=await owned();assert.equal(after.inventorySnbt[35],template.snbt);unchangedExcept(before,after,35);
  assert.deepEqual(await library(),libraryBefore);assert.equal((await client()).commandAttempts,c.commandAttempts+1,'give must send exactly one actual command');const feedback=receivedSince(m);
  assert(!feedback.observer.includes('替换'));await request('joiner','screenshot',{name:'vault-authorized-real-give-confirmed.png'});await close();
  await request('joiner','inventory',{menuSlot:35});const reopened=await readyPage();assert.equal(reopened.doc.count,template.stack.count);await close();return {sent,before,after,reopened,libraryBefore,feedback};
 });
 await test('unprivileged-vault-real-give-refused-with-library-inventory-unchanged',async()=>{
  await host('item replace entity LanEditor inventory.26 with minecraft:air');const permissions=await permission(false);await page();await openVault();const earlyNotice=await visiblePermissionExplanation('vault');await request('joiner','screenshot',{name:'vault-no-permission-before-submit.png'});const before=await owned(),libraryBefore=await library(),c=await client();
  const draftBefore=(await inspect()).doc;const sent=await clickGive();assert.equal(sent.reply.ok,false);assert.equal(sent.reply.code,'command_unavailable');await delay(500);assert.deepEqual((await inspect()).doc,draftBefore);
  assert.deepEqual((await owned()).inventorySnbt,before.inventorySnbt);assert.deepEqual(await library(),libraryBefore);assert.equal((await client()).commandAttempts,c.commandAttempts);
  const toasts=await visibleToast('权限');await request('joiner','screenshot',{name:'vault-no-permission-visible-refusal.png'});await close();await permission(true);return {permissions,earlyNotice,sent,toasts,before,libraryBefore};
 });
 await test('authorized-vault-full-inventory-refused-no-overwrite-no-command-or-retry',async()=>{
  await host('item replace entity LanEditor inventory.26 with minecraft:stone 64');await delay(400);await page();await openVault();const before=await owned(),libraryBefore=await library(),c=await client();
  assert(before.inventory.every(s=>s.id));const sent=await clickGive();assert.equal(sent.reply.ok,false);assert.equal(sent.reply.code,'inventory_full');const toasts=await visibleToast('空槽');await request('joiner','screenshot',{name:'vault-full-inventory-visible-refusal.png'});await delay(2200);
  const after=await owned();assert.deepEqual(after.inventorySnbt,before.inventorySnbt);assert.deepEqual(await library(),libraryBefore);assert.equal((await client()).commandAttempts,c.commandAttempts);assert.equal((await js('window.lanGives')).length,1);
  await close();return {sent,before,after,libraryBefore,toasts};
 });
 await test('container-item-remains-server-required-and-keeps-draft',async()=>{
  await host('execute at LanEditor run setblock ~ ~ ~1 minecraft:chest{Items:[{Slot:0b,id:"minecraft:paper",count:2}]}');await delay(400);await request('joiner','openChest');await delay(600);await request('joiner','hoverMenu',{menuSlot:0});
  const opened=await readyPage();assert.equal(opened.doc.src.kind,'menu');await js('Store.setCount(3);true');const before=await owned(),response=await apply('rejected','not_connected');assert.equal(response.doc.count,3);assert.deepEqual((await owned()).inventorySnbt,before.inventorySnbt);
  const toasts=await visibleToast('服务端');await request('joiner','screenshot',{name:'inventory-scope-container-refusal.png'});await close();return {opened,response,toasts};
 });
 await test('new-scope-admin-feedback-does-not-broadcast-to-ordinary-observer',async()=>{
  const observer=await request('observer','state');assert.equal(observer.gamemaster,false);const all=Object.fromEntries(['host','joiner','observer'].map(role=>[role,messages(role)]));
  assert(all.host.includes('Inventory scope saved'));assert(all.joiner.includes('Inventory scope saved'));assert(!all.observer.includes('Inventory scope saved'));assert(!all.observer.includes('替换'));
  await request('observer','screenshot',{name:'inventory-scope-observer-no-admin-feedback.png'});return {observer,messages:all};
 });
 writeFileSync(join(out,'inventory-result.json'),JSON.stringify({status:'PASS',scope:'own main inventory 0..35 and permission-based detached Vault give; historical refusal scopes superseded',exclusions:['self-player navigation/fields tested separately; historical blanket world-self refusal removed'],results},null,2));
}
