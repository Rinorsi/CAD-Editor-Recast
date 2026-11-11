import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Fault injection is confined to the owned test Document. No production debug flags
// or edited resource overrides: the packaged UI must report its real catch paths.
export async function runDiagnosticsDebug({out, config, request, delay}) {
 const results = [], latest = join(out, 'host/logs/latest.log');
 const log = () => readFileSync(latest, 'utf8');
 const js = async code => {
  const r = (await request('host', 'eval', {js: '(function(){try{var v=eval(' + JSON.stringify(code) + ');return {ok:true,value:v===undefined?null:v};}catch(e){return {ok:false,error:String(e),stack:String(e.stack||"")};}})()'})).value;
  if (!r.ok) throw Error(r.error + ' ' + r.stack);
  return r.value;
 };
 async function until(check, label) {
  for (let n=0; n<100; n++) { if (await check()) return; await delay(150); }
  throw Error('Timed out: ' + label);
 }
 async function pageReady(code) {
  await until(async () => {
   const s = await request('host', 'state');
   if (!/OrielScreen|EditorScreen|WorldScreen|VaultScreen/.test(s.screen)) return false;
   return js(code);
  }, code);
 }
 const markers = text => text.split(/\r?\n/).filter(l => l.includes('[CAD-Editor-Perf]'));
 const command = command => request('host', 'serverCommand', {command});
 async function close() { await request('host', 'close'); await delay(300); }
 async function checkPage(name, open, condition) {
  const before = log().length, stateBefore = await request('host', 'state');
  const navigation = await open();
  await pageReady(condition);
  assert.equal(await js('Prefs.get("debug",false)'), false, 'ordinary default settings');
  await until(() => markers(log().slice(before)).some(l=>l.includes('stage=first_frame_callback')), name+' load markers');
  const token = 'owned-diagnostic-fixture-' + name;
  const observation = await js('(function(){var token='+JSON.stringify(token)+';var sends=[],orig=oriel.send;oriel.send=function(c,p){sends.push({channel:c,payload:p});return orig.apply(this,arguments);};var off=Reg.on(function(){throw new Error(token+":registry");});var sub={f:function(){throw new Error(token+":validation");}};Valid.subs.push(sub);try{for(var i=0;i<8;i++){Reg.flush();Valid.fire();}EditorDiag.ready();EditorDiag.ready();}finally{off();Valid.subs=Valid.subs.filter(function(s){return s!==sub;});oriel.send=orig;}return {sends:sends,debug:Prefs.get("debug",false),mode:VaultOnly?"vault":(WE.w?(WE.w.player?"player":WE.w.kind):"item"),dirty:WE.w?weDirty():false};})()');
  assert.equal(observation.mode, name.startsWith('item')?'item':name);
  assert.equal(observation.dirty, false);
  assert(!observation.sends.some(s=>s.channel==='apply'||s.channel==='inventory_apply'||(s.channel==='player_extended'&&s.payload?.action==='apply')), 'logging must not submit edits');
  const sentErrors = observation.sends.filter(s=>s.channel==='log'&&s.payload.msg.includes(token));
  assert.equal(sentErrors.length, 2, 'eight repetitions yield one error per real catch site');
  await until(() => log().slice(before).split(/\r?\n/).filter(l=>l.includes(token)).length>=2, name+' async file log');
  await delay(500);
  const excerpt=log().slice(before), lines=excerpt.split(/\r?\n/).filter(l=>l.includes(token));
  assert.equal(lines.length, 2, 'one native log handler per driver, including reload');
  assert(lines.some(l=>l.includes('site=registry.subscriber')&&l.includes(token+':registry')&&l.includes('stack=')));
  assert(lines.some(l=>l.includes('site=validation.subscriber')&&l.includes(token+':validation')&&l.includes('stack=')));
  assert(lines.every(l=>l.includes('/ERROR]')));
  const timing=markers(excerpt);
  assert.equal(timing.length, 2, 'exactly one boot and one callback per Document');
  for (const phase of ['boot','first_frame_callback']) assert.equal(timing.filter(l=>l.includes('stage='+phase+' ')).length,1);
  assert(timing.every(l=>/load_ms=\d+[.]\d+/.test(l)));
  const stateAfter=await request('host','state');
  assert.equal(stateAfter.commandAttempts,stateBefore.commandAttempts,'no client commands from diagnostics');
  writeFileSync(join(out,'diagnostics-'+name+'.log'),excerpt);
  results.push({name,status:'PASS',navigation,observation,errors:lines,timing});
  writeFileSync(join(out,'diagnostics-scenarios.json'),JSON.stringify(results,null,2));
 }
 await request('host','operator',{name:'LanHost',grant:true});
 await command('gamemode creative LanHost');
 await command('item replace entity LanHost hotbar.0 with minecraft:paper 3');
 await request('host','select',{slot:0});
 await close();
 await checkPage('item',()=>request('host','open'),'typeof Store!=="undefined"&&Store.docs.length>0&&!WE.w&&!VaultOnly');
 for (const name of ['item-reload-1','item-reload-2']) await checkPage(name,async()=>{const r=await request('host','reloadPage');assert(r.documentChanged);return r;},'typeof Store!=="undefined"&&Store.docs.length>0&&!WE.w&&!VaultOnly');
 await checkPage('player',()=>js('oriel.send("open_world",{self:true});true'),'!!(WE.w&&WE.w.player&&WE.w.player.self)');
 await close();
 const uuid='11111111-2222-3333-4444-555555555501';
 await command('summon minecraft:slime ~ ~ ~ {UUID:[I;286331153,572666675,1145328981,1431655681],Size:1,NoAI:1b,PersistenceRequired:1b}');
 await delay(500);
 const entity=(await request('host','entityFields',{uuid})).entityFields;
 await checkPage('entity',()=>request('host','openEntity',{entityId:entity.entityId}),'!!(WE.w&&WE.w.kind==="entity"&&!WE.w.player)');
 await close();
 await checkPage('vault',()=>request('host','openVault'),'typeof VaultOnly!=="undefined"&&VaultOnly===true');
 await close();
 writeFileSync(join(out,'diagnostics-result.json'),JSON.stringify({status:'PASS',sha256:config.sha256,results,scope:'Fabric 26.1.2 packaged integrated server; hidden/unfocused; default debug=false; real registry/validation subscriber catch -> asynchronous latest.log; two same-driver reloads; no write requests. Timing is host page load to JS boot/rAF callback, not GPU presentation.'},null,2));
}
