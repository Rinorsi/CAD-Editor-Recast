import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Only the probe's empty Optional during a screen/document attach is retryable.
// Script exceptions and assertion failures must remain immediate failures.
const isNativePageAttachGap=error=>error?.message==='java.util.NoSuchElementException: No value present'||error?.code==='NATIVE_PAGE_NOT_ATTACHED';
export async function waitForNestedPage(check,label,{delay,attempts=100,pageAttach=false}={}) {
 let lastError;
 for(let n=0;n<attempts;n++) {
  try { if(await check())return; }
  catch(error) {
   if(!pageAttach||!isNativePageAttachGap(error))throw error;
   lastError=error;
  }
  if(n+1<attempts)await delay(150);
 }
 throw new Error('等待超时：'+label+(lastError?'；最后页面挂载异常：'+lastError.message:''),lastError?{cause:lastError}:undefined);
}

// Full-backend acceptance; called only in the owned, hidden backend-single fixture.
export async function runNestedItemDebug({out,config,request,delay}) {
 const results=[];
 const js=async code=>{
  const r=(await request('host','eval',{js:'(function(){try{return {ok:true,value:eval('+JSON.stringify(code)+')};}catch(e){return {ok:false,error:String(e),stack:String(e.stack||"")};}})()'})).value;
  if(r===null||r===undefined){const e=new Error('原生页面尚未返回 eval value');e.code='NATIVE_PAGE_NOT_ATTACHED';throw e;}
  assert(r.ok,r.error+' '+r.stack);return r.value;
 };
 const until=(fn,label,pageAttach=false)=>waitForNestedPage(fn,label,{delay,pageAttach});
 async function test(name,fn){try{results.push({name,status:'PASS',evidence:await fn()});}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}finally{writeFileSync(join(out,'nested-item-scenarios.json'),JSON.stringify(results,null,2));}}
 const pointer=(selector,params={})=>request('host','pagePointer',{selector,...params});
 const key=(key,mods={})=>request('host','pageKey',{key,...mods});
 const server=async()=>{const s=await request('host','state');const p=s.serverPlayers.find(p=>p.name==='LanHost');assert(p);return {stack:p.inventorySnbt[0],commands:s.commandAttempts};};
 async function button(label,scope='#overlays'){
  await js('(function(){var old=document.getElementById("nested-test-button");if(old)old.removeAttribute("id");var xs=document.querySelector('+JSON.stringify(scope)+').querySelectorAll(".k-btn");for(var i=0;i<xs.length;i++)if(xs[i].textContent.trim().indexOf('+JSON.stringify(label)+')===0){xs[i].id="nested-test-button";if(xs[i].scrollIntoView)xs[i].scrollIntoView({block:"nearest"});return true;}throw Error("按钮不存在："+'+JSON.stringify(label)+');})()');
  await delay(100);const r=await pointer('#nested-test-button');assert(r.pressed,'按钮原生点击未被接收');await delay(300);return r;
 }
 async function openSelf(){
  const actor=(await request('host','state')).uuid;assert(actor,'隔离玩家 UUID 必须可读');
  await request('host','close');await delay(300);await request('host','open');
  await until(async()=>{
   const state=await request('host','state');if(!/OrielScreen|EditorScreen/.test(state.screen||''))return false;
   return js('typeof Store!=="undefined"&&Store.docs.length>0&&!!Store.doc()&&!!document.getElementById("win")&&document.documentElement.getAttribute("data-editor-controller")==="ready"&&typeof weActive==="function"&&!weActive()');
  },'物品页面完成原生挂载',true);
  // Navigation may detach this Document before eval produces its receipt.
  // Never resend: the following target/UUID check proves whether navigation happened.
  try { await js('oriel.send("open_world",{self:true});true'); }
  catch(error) { if(!isNativePageAttachGap(error))throw error; }
  await until(async()=>{
   const state=await request('host','state');if(!/OrielScreen|EditorScreen/.test(state.screen||''))return false;
   return js('typeof WE!=="undefined"&&WE.w&&WE.w.player&&WE.w.player.self&&WE.w.player.uuid==='+JSON.stringify(actor)+'&&WE.w.slot&&!!WE.w.slot.token&&typeof weActive==="function"&&weActive()&&!!document.getElementById("win")&&!!document.getElementById("edbody")&&document.documentElement.getAttribute("data-editor-controller")==="ready"');
  },'自己的背包目标与新页面完成挂载',true);
  assert.equal(await js('wpCommandCaps()'),null,'必须使用完整后端');
  await js('WE.tab="pinv";weRender();true');await delay(300);
 }
 async function enter(){
  await js('(function(){var el=document.querySelector("#edbody .slot.hand");if(!el)throw Error("快捷栏0格不存在");var card=el.closest(".k-card");if(card&&!el.getBoundingClientRect().height)card.querySelector(".k-chead").dispatchEvent(new Event("click",{bubbles:true}));el.id="nested-test-slot";el.scrollIntoView({block:"center"});return true;})()');
  await delay(150);assert((await pointer('#nested-test-slot')).pressed);await delay(500);
  await button('完整编辑');
  await until(()=>js('!!NestedItem&&!weActive()&&!!Store.doc()'),'完整物品工作副本');
  return js('({source:Store.doc().src,world:WE.w.slot,base:snapOf(Store.doc()),typed:nbtComponentText(Store.doc(),"custom_data")})');
 }
 async function editRaw(text){
  await js('openAdvanced("snbt");true');await delay(250);
  assert((await pointer('.kc-ta',{pageUnits:true,fromX:30,fromY:10})).pressed);
  await key('a',{ctrl:true});await request('host','pageType',{text});
  assert.equal(await js('document.querySelector(".kc-ta").value'),text);
  await key('Enter',{ctrl:true});await delay(300);
  assert.equal(await js('document.querySelector(".ed-err").textContent'),'');
  await key('Escape');await delay(200);
 }
 await request('host','operator',{name:'LanHost',grant:true});
 await request('host','serverCommand',{command:'gamemode creative LanHost'});
 await request('host','serverCommand',{command:'item replace entity LanHost hotbar.0 with minecraft:paper[minecraft:custom_data={big:9007199254740993L,keep:1b,arr:[I;1,2]}] 1'});
 await request('host','select',{slot:0});await delay(500);await openSelf();
 const original=await server();
 await test('native-slot-full-editor-cancel-isolated',async()=>{
  const opened=await enter();assert.equal(opened.source,null);assert(opened.typed.includes('9007199254740993L'));
  await editRaw('{id:"minecraft:paper",count:2,components:{"minecraft:custom_data":{lost:1b}}}');
  await button('返回背包','#topbar');assert(await js('!!NestedItem&&!!document.getElementById("modal")'));
  await button('继续编辑');assert(await js('!!NestedItem'));await button('返回背包','#topbar');await button('放弃并返回');
  assert(await js('weActive()&&!NestedItem&&!weDirty()'));
  assert.deepEqual(await server(),original);await request('host','screenshot',{name:'nested-item-cancel-backpack.png'});
  return {opened,authoritativeUnchanged:true};
 });
 await test('native-slot-save-draft-then-authoritative-apply-reopen',async()=>{
  const opened=await enter();
  await editRaw('{id:"minecraft:paper",count:2,components:{"minecraft:custom_data":{big:9007199254740993L,keep:1b,arr:[I;1,2],edited:5s},"!minecraft:enchantment_glint_override":{}}}');
  await request('host','screenshot',{name:'nested-item-full-editor.png'});
  await button('保存到背包草稿','#topbar');
  const draft=await js('({nested:!!NestedItem,dirty:weDirty(),stack:wpContainerStack("container",0),token:WE.w.slot.token})');
  assert.equal(draft.nested,false);assert(draft.dirty);assert.equal(draft.token,opened.world.token);
  assert.equal(draft.stack.count,2);assert(draft.stack.component_snbt.custom_data.includes('9007199254740993L'));
  assert(draft.stack.component_snbt.custom_data.includes('5s'));assert.equal(draft.stack.removed.enchantment_glint_override,1);
  assert.deepEqual(await server(),original,'保存子页只写父草稿，服务器尚未变化');
  await request('host','screenshot',{name:'nested-item-parent-draft.png'});
  await js('window.__nestedReceipts=[];window.__nestedRequest=null;var nestedOriginalSend=oriel.send;oriel.send=function(k,p){if(k==="apply")window.__nestedRequest=p.requestId;return nestedOriginalSend.apply(this,arguments);};oriel.on("patch",function(p){if(p&&p.key==="result")window.__nestedReceipts.push(p.value);});oriel.on("data",function(d,k){if(d&&d.result)window.__nestedReceipts.push(d.result);else if(k==="result")window.__nestedReceipts.push(d);});true');
  await button('应用修改','#topbar');
  await until(()=>js('window.__nestedReceipts.some(function(r){return r&&r.requestId===window.__nestedRequest&&r.status==="saved";})'),'真实背包 saved 回执');
  await until(()=>js('!WE.pending&&!weDirty()'),'保存后父草稿清空');
  const saved=await server();assert.equal(saved.commands,original.commands);
  for(const token of ['9007199254740993L','1b','[I;1,2]','5s'])assert(saved.stack.includes(token),'权威SNBT缺少 '+token);
  await openSelf();const reopened=await js('wpContainerStack("container",0)');assert.equal(reopened.count,2);
  for(const token of ['9007199254740993L','1b','[I;1,2]','5s'])assert(reopened.component_snbt.custom_data.includes(token),'重开SNBT缺少 '+token);
  await request('host','screenshot',{name:'nested-item-saved-reopened.png'});
  return {opened,draft,saved,reopened};
 });
 writeFileSync(join(out,'nested-item-result.json'),JSON.stringify({status:'PASS',sha256:config.sha256,results,scope:'backend-single real Screen slot/button/key/type input; isolated child draft, cancel guard, parent target preserved, native long/array/short fidelity, saved server receipt and reopened authoritative stack; no vanilla command fallback.'},null,2));
}
