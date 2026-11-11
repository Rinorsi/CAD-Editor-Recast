import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';

// An extra observation after all standard cases. Only a local draft changes:
// no Apply, parser replacement or production behavior override.
export async function runSpecialPreviewDebug({out,config,request,delay}){
 const log=join(out,'host','logs','latest.log'),start=readFileSync(log,'utf8').length;
 const js=async code=>{
  new Script(code); // Validate the final page expression, including nested quoting.
  const r=(await request('host','eval',{js:'(function(){try{return {ok:true,value:eval('+JSON.stringify(code)+')};}catch(e){return {ok:false,error:String(e),stack:String(e.stack||"")};}})()'})).value;
  assert(r.ok,r.error+' '+r.stack);return r.value;
 };
 const server=s=>s.serverPlayers.find(p=>p.name==='LanHost').inventorySnbt;
 const before=await request('host','state');
 await request('host','open');let ready=false;
 for(let n=0;n<100;n++){try{ready=await js('typeof Store!=="undefined"&&!!Store.doc()&&!!document.getElementById("hero")');if(ready)break;}catch{}await delay(150);}
 assert(ready,'特殊浮点观察页面未挂载');await delay(900);
 const setupDraft=function(){
  window.__specialPreviewOriginal={view:UI.heroView,stage:UI.stageOpen};
  var d=Store.doc(),comps=clone(d.comps);
  comps.custom_data=parseSnbtUser('{nested:[NaNf,+Infinityf,-Infinityd],quoted:"NaNf"}');
  comps.container=parseSnbtUser('[{slot:0,item:{id:"minecraft:stone",components:{"minecraft:custom_data":{v:Infinityd}}}}]');
  comps.custom_name='NaNf';
  Store.replace(comps,clone(d.removed),'特殊浮点预览观察');
  return {snapshot:nbtSnapshot(Store.doc()),apply:JSON.stringify(nbtApplyFormats(Store.doc(),true)),exported:stackSnbt(Store.doc()),comps:stackCompsSnbt(Store.doc())};
 };
 const original=await js('('+setupDraft.toString()+')()');
 const cases=[];let result;
 try{
  for(const view of ['2d','3d']){
   await js('UI.stageOpen=true;UI.heroView='+JSON.stringify(view)+';drawHero();true');await delay(800);
   const actual=await js('(function(){var d=Store.doc(),p=stackPreviewComps(d),hero=document.getElementById("hero"),e=hero.querySelector("'+(view==='2d'?'item':'model')+'");return {excluded:p.excluded,projected:p.snbt,components:e&&e.getAttribute("components"),notice:hero.textContent,snapshot:nbtSnapshot(d),apply:JSON.stringify(nbtApplyFormats(d,true)),exported:stackSnbt(d),comps:stackCompsSnbt(d)};})()');
   assert.deepEqual(actual.excluded,['minecraft:custom_data','minecraft:container']);
   assert.equal(actual.components,actual.projected,'真实hero节点没有使用预览投影');
   assert(actual.projected.includes('"minecraft:custom_name":"NaNf"'),'普通带引号的值不能被排除');
   assert(!actual.projected.includes('"minecraft:custom_data"')&&!actual.projected.includes('"minecraft:container"'),'只预览的组件排除失败');
   assert.match(actual.notice,/预览暂不包含 minecraft:custom_data、minecraft:container/);
   assert.match(actual.notice,/实际数据、应用和导出均完整保留/);
   for(const key of ['snapshot','apply','exported','comps'])assert.equal(actual[key],original[key],'渲染改变了原始数据：'+key);
   await request('host','screenshot',{name:'special-preview-'+view+'.png'});await delay(400);cases.push({view,...actual});
  }
  await delay(800);
  const addedLog=readFileSync(log,'utf8').slice(start).split(/\r?\n/);
  const parserWarnings=addedLog.filter(line=>/WARN/.test(line)&&!line.includes('site=preview.special_float')&&/(?:components?|snbt|tagparser|nan|infinity)/i.test(line)&&/(?:pars|invalid|failed|error|expected|trailing)/i.test(line));
  assert.deepEqual(parserWarnings,[],'原Oriel组件解析器仍产生WARN');
  const notices=addedLog.filter(line=>line.includes('site=preview.special_float'));
  assert(notices.length>0,'没有可定位的预览排除日志');
  const after=await request('host','state');assert.deepEqual(server(after),server(before),'预览观察更改了服务端物品');assert.equal(after.commandAttempts,before.commandAttempts);
  result={status:'PASS',sha256:config.sha256,cases,notices,parserWarnings,serverUnchanged:true};
 }finally{
  await js('Store.revertAll();UI.heroView=window.__specialPreviewOriginal.view;UI.stageOpen=window.__specialPreviewOriginal.stage;drawHero();true');
  assert.equal(await js('diffDoc(Store.doc()).length'),0,'特殊浮点观察没有清理本地草稿');
  // Let the real 1500ms draft debounce clear the persisted observation before
  // detaching this page; otherwise the fresh JVM offers this test-only draft.
  await delay(1900);
  const drafts=JSON.parse(readFileSync(join(out,'host','config','cadeditor-ui.json'),'utf8')).drafts||{};
  assert.equal(Object.keys(drafts).length,0,'特殊浮点观察持久化草稿尚未清理');
  await request('host','close');await delay(400);
 }
 writeFileSync(join(out,'special-preview-result.json'),JSON.stringify({...result,persistedDraftsCleared:true},null,2));
}
