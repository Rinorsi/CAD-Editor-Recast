import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export async function runLayoutDebug({out,config,request,delay}) {
 const js=async code=>(await request('host','eval',{js:code})).value;
 const snapshots=[];
 async function snapshot(name){
  const value=await js('(function(){function box(e){if(!e)return null;var r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,cls:e.className,text:e.textContent.substring(0,100),display:s.display,width:r.width,height:r.height,x:r.x,y:r.y,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop};}var hero=document.getElementById("hero");return {viewport:{w:window.innerWidth,h:window.innerHeight},win:box(document.getElementById("win")),hero:box(hero),right:box(document.querySelector(".ed-right")),stage:box(document.querySelector(".ed-stage")),stats:box(document.querySelector(".ed-stats")),tiphead:box(document.querySelector(".ed-tiphead")),children:hero?Array.prototype.map.call(hero.children,box):[],prefs:{heroW:UI.heroW,winW:UI.winW,winH:UI.winH,stageOpen:UI.stageOpen,statsOpen:UI.statsOpen,tipOpen:UI.tipOpen}};})()');
  snapshots.push({name,...value});
  writeFileSync(join(out,'layout-debug.json'),JSON.stringify(snapshots,null,2));
  await request('host','screenshot',{name:name+'.png'});
  return value;
 }
 await request('host','serverCommand',{command:'item replace entity LanHost weapon.mainhand with minecraft:diamond_sword'});
 for(let n=0;n<100;n++){
  const state=await request('host','state');
  if(!state.screen||state.screen==='null')break;
  await delay(200);
 }
 await delay(500);await request('host','open');
 let ready=false;
 for(let n=0;n<70;n++){await delay(150);try{ready=await js('!!document.getElementById("hero")');if(ready)break;}catch{}}
 assert(ready,'formal Editor page did not open');
 await delay(1300);
 const suffix=config.layoutExpectedFixed?'after':'before';
 function assertFixed(s){
  assert.notEqual(s.stats.display,'none','stats must not be hidden');
  assert(s.stats.height>0,'stats need actual layout');
  assert.notEqual(s.tiphead.display,'none','tooltip header must remain accessible');
  assert(s.hero.width>=100&&s.right.width>=200,'both columns retain usable widths');
  assert(s.hero.x+s.hero.width<=s.right.x+2,'columns must not overlap');
 }
 const before=await snapshot('sidebar-initial-small-'+suffix);
 assert(before.viewport.w<540&&before.win.width<420,'must reproduce real small GUI');
 if(config.layoutExpectedFixed)assertFixed(before);
 else assert.equal(before.stats.display,'none','expected original hidden sidebar regression');
 await request('host','resizeWindow',{width:1280,height:800});await delay(1800);
 const large=await snapshot('sidebar-large-'+suffix);if(config.layoutExpectedFixed)assertFixed(large);
 await request('host','resizeWindow',{width:854,height:480});await delay(1800);
 const small=await snapshot('sidebar-small-return-'+suffix);if(config.layoutExpectedFixed)assertFixed(small);
 if(config.layoutExpectedFixed){
  await js('document.getElementById("hero").scrollTop=1000;true');await delay(500);
  const scrolled=await snapshot('sidebar-small-scrolled-after');
  assert(scrolled.hero.scrollTop>0,'small sidebar must really scroll');
  assert(scrolled.tiphead.y<scrolled.hero.y+scrolled.hero.height,'tooltip reachable by scrolling');
  await request('host','close');await delay(400);await request('host','open');await delay(1600);
  assertFixed(await snapshot('sidebar-small-reopened-after'));
 }
 writeFileSync(join(out,'layout-debug-result.json'),JSON.stringify({status:config.layoutExpectedFixed?'PASS':'REPRODUCED',cause:'narrow width 68 -> hthin -> display:none sidebar sections',snapshots},null,2));
}
