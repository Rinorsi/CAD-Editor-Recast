import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {client} from './live-rpc.mjs';
const [out]=process.argv.slice(2), {request,connected,js,until,delay}=client(out), results=[];
const write=(name,value)=>writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2));
async function test(name,fn){try{const evidence=await fn();results.push({name,status:'PASS',evidence});write('results',results);console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:String(e),stack:e.stack});write('results',results);throw e;}}
try{
 await request('state',{},60000); // Cold client initialization may exceed the normal RPC deadline.
 await connected();
 for(let n=0;n<120;n++){const s=await request('state');if(s.connected&&!s.screen)break;if(n===119)throw Error('owned vanilla loading did not finish');await delay(250);}
 await request('serverCommand',{command:'gamemode survival LanHost'});
 await request('inventory',{menuSlot:36});
 await until('Store.docs.length>0&&!!document.getElementById("hero")');
 assert.equal((await request('state')).screen,'dev.rinorsi.editor.client.EditorLayerScreen');
 await test('three-rapid-native-escapes-return-one-window-at-a-time',async()=>{
  await js('openAdvanced("all");openSettings();openVault();true');
  assert.equal(await js('ModalParents.length'),2);
  const steps=[],start=Date.now();
  for(const depth of [1,0,-1]){
   await request('pageKey',{key:'Escape'});
   const state=await js('({depth:ModalParents.length,modal:!!document.getElementById("modal"),title:document.querySelector("#modal .k-mh")&&document.querySelector("#modal .k-mh").textContent})');
   assert.equal(state.depth,Math.max(0,depth));assert.equal(state.modal,depth>=0);steps.push(state);
  }
  const elapsed=Date.now()-start;assert(elapsed<1500,'three steps actually exercise the native emergency-close window');
  const screen=await request('state');assert.equal(screen.screen,'dev.rinorsi.editor.client.EditorLayerScreen');
  return {steps,elapsed,screen:screen.screen};
 });
 await test('two-nested-documents-and-unsaved-prompt-native-back',async()=>{
  await js('window.escRoot=Store.doc();window.escOpts={render:function(){},commit:function(){throw Error("Escape must not save");}};openNestedItem({id:"minecraft:chest",count:1,comps:{},removed:{}},escOpts);window.escChild=Store.doc();openNestedItem({id:"minecraft:stone",count:1,comps:{},removed:{}},escOpts);true');
  await request('pageKey',{key:'Escape'});assert.equal(await js('Store.doc()===escChild&&!!NestedItem'),true);
  await request('pageKey',{key:'Escape'});assert.equal(await js('Store.doc()===escRoot&&!NestedItem'),true);
  await js('openNestedItem({id:"minecraft:stone",count:1,comps:{},removed:{}},escOpts);Store.setCount(3);true');
  await request('pageKey',{key:'Escape'});await until('!!document.getElementById("modal")');
  assert.match(await js('document.getElementById("modal").textContent'),/返回父页面/);
  await request('screenshot',{name:'unsaved-child-prompt.png'});
  await request('pageKey',{key:'Escape'});assert.equal(await js('!!NestedItem&&Store.doc().count===3&&!document.getElementById("modal")'),true);
  await request('pageKey',{key:'Escape'});await until('!!document.getElementById("modal")');
  await js('(function(){var bs=document.querySelectorAll("#modal .k-btn");for(var i=0;i<bs.length;i++)if(bs[i].textContent==="放弃并返回"){bs[i].id="esc-discard";return true;}throw Error("missing discard");})()');
  await request('pagePointer',{selector:'#esc-discard'});await until('!NestedItem&&Store.doc()===escRoot');
  await request('pageKey',{key:'Escape'});await delay(200);
  const screen=await request('state');assert.equal(screen.screen,'net.minecraft.client.gui.screens.inventory.InventoryScreen');
  await request('screenshot',{name:'root-returned-inventory.png'});
  return {returned:screen.screen};
 });
 await test('shift-escape-emergency-close-still-works',async()=>{
  await request('close');await request('inventory',{menuSlot:36});await until('Store.docs.length>0&&!!document.getElementById("hero")');
  await js('openSettings();true');await request('pageKey',{key:'Escape',shift:true});await delay(200);
  const state=await request('state');assert.equal(state.screen,'net.minecraft.client.gui.screens.inventory.InventoryScreen');return {returned:state.screen};
 });
 await test('long-command-payload-visually-wraps-without-changing-text',async()=>{
  await request('close');await request('open');await until('Store.docs.length>0&&!!document.getElementById("hero")');
  await js('Store.set("custom_data",{long_token:Array(101).join("abcdefgh")});Store.setCount(64);UI.cmdFmt="cmd";UI.tab="item-stack";drawTabbar();drawTabBody();true');
  await until('!!document.querySelector(".ed-command")');
  await js('document.querySelector(".ed-command").scrollIntoView({block:"center"});true');await delay(200);
  const preview=await js('(function(){var e=document.querySelector(".ed-command"),r=e.getBoundingClientRect();return {text:e.textContent,expected:buildCommand(Store.doc(),UI.cmdMode,UI.cmdSel),width:e.clientWidth,scrollWidth:e.scrollWidth,height:r.height};})()');
  assert.equal(preview.text,preview.expected);assert(preview.height>80,'long content occupies multiple readable lines');
  assert(preview.scrollWidth<=preview.width+1,'component payload has no horizontal overflow');
  await request('screenshot',{name:'long-command-wrapped.png'});return preview;
 });
}catch(e){process.exitCode=1;console.error(e.stack);}finally{
 write('terminal',{status:results.length===4&&results.every(r=>r.status==='PASS')?'PASS':'FAIL',results,notRun:['other versions/loaders in game','full regression matrix']});
 try{await request('stop',{},6000);}catch{}
 writeFileSync(join(out,'first.complete'),'complete');
}
