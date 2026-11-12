const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../common/src/main/resources/assets/cadeditor/ui/js');
const events = {}, domEvents = {}, sent = [], toasts = [];
const context = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {},
  document: { addEventListener(k, fn) { domEvents[k] = fn; }, getElementById() { return null; } },
  oriel: { data: {}, on(k, fn) { events[k] = fn; }, send(k, value) { sent.push({k, value}); return true; } } });
for (const file of ['data.js', 'i18n-catalogs.js', 'i18n.js', 'core.js', 'labels.js', 'nbt.js', 'reg.js', 'screens.js', 'worldedit.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
const realDrawInventoryFooter = context.drawFooter;
for (const name of ['rebuild','drawHero','drawTabbar','drawTopbar','drawFooter','drawTabBody']) context[name] = () => {};
context.toast = (message, kind) => toasts.push({message, kind});
vm.runInContext(fs.readFileSync(path.join(dir,'app.js'),'utf8'),context);
const capabilityText = '原版命令不可用或权限不足，需要服务器授予对应权限';
context.OrielEditor.open({id:'minecraft:diamond_sword',count:1,comps:{},removed:{},slot:{kind:'inventory',index:0,token:'session'},capability:capabilityText});
assert.equal(context.EditorInventoryCapability, capabilityText, 'host capability lives in independent page state');
assert.equal(context.Store.doc().capability, undefined, 'capability cannot enter item draft');
context.Store.set('custom_name', '测试');
assert.equal(context.EditorInventoryCapability, capabilityText, 'editing and redraws preserve transport capability');
{
  const saved = Object.fromEntries(['clear','h','activate','uiIcon','edFootChg','kHint','kPopover'].map(k => [k,context[k]]));
  const children = []; let popup;
  context.clear = () => ({appendChild(child){children.push(child);}});
  context.h = (tag,props,kids) => ({tag,props,kids,addEventListener(){}});
  context.activate = (el,fn) => {el.activate=fn;};
  context.uiIcon = () => ({}); context.edFootChg = () => ({});
  context.kHint = text => ({text}); context.kPopover = (el,body) => {popup=body;};
  realDrawInventoryFooter();
  const chip = children.find(x => x.props && /inventory-capability/.test(x.props.class));
  assert.ok(chip, 'real footer renders persistent capability chip beside existing warnings');
  assert.equal(chip.props.title, capabilityText);
  chip.activate(); assert.equal(popup.kids[0].text, capabilityText, 'click exposes complete capability text');
  Object.assign(context,saved);
}
context.applyToGame();
const request = sent.filter(x => x.k === 'apply')[0].value;
assert.equal(request.id,'minecraft:diamond_sword');
assert.equal(request.comps.custom_name,'测试');
assert.equal(request.slot.token,'session');
assert.deepEqual(Object.keys(request.removed),[]);
context.applyToGame(); assert.equal(sent.filter(x => x.k === 'apply').length,1,'no duplicate pending request');
events.data({result:{requestId:request.requestId,status:'rejected',reason:'权限不足'}},'result');
assert.equal(context.Store.doc().comps.custom_name,'测试','rejection keeps draft');
assert.ok(context.diffDoc(context.Store.doc()).length);
assert.equal(toasts.at(-1).message,'权限不足');
context.applyToGame();
const second=sent.filter(x => x.k === 'apply')[1].value;
context.Store.set('custom_name','提交后继续编辑');
events.data({result:{requestId:second.requestId,status:'saved',item:{id:second.id,count:second.count,comps:second.comps,removed:second.removed}}},'result');
assert.equal(context.Store.doc().comps.custom_name,'提交后继续编辑');
assert.equal(JSON.parse(context.Store.doc().base).comps.custom_name,'测试');
assert.ok(context.diffDoc(context.Store.doc()).length,'edits after send remain dirty');
// Creative submission is a transport receipt, not server confirmation.
context.applyToGame();
const creativeRequest = sent.filter(x => x.k === 'apply').at(-1).value;
const creativeDraft = JSON.stringify(context.Store.doc());
events.data({result:{requestId:creativeRequest.requestId,status:'sent',confirmed:false,reason:'已提交，尚无服务器确认'}},'result');
assert.equal(context.EditorBridge.pending,null,'creative send releases pending without waiting for optional vanilla echo');
assert.equal(JSON.stringify(context.Store.doc()),creativeDraft,'unconfirmed creative send retains draft and old baseline');
assert.ok(context.diffDoc(context.Store.doc()).length,'unconfirmed creative send never clears dirty state');
assert.equal(toasts.at(-1).kind,'warn','unconfirmed receipt does not claim success or failure');
assert.equal(toasts.at(-1).message,'已提交，尚无服务器确认');
// Navigation notices are independent of save results and must leave live drafts alone.
context.applyToGame();
const noticePending = context.EditorBridge.pending;
const noticeDraft = JSON.stringify(context.Store.doc());
const noticeReason = '服务器未安装物品工坊，无法读取或修改世界目标';
events.data({notice:{text:noticeReason,kind:'error',sequence:1}}, 'notice');
assert.equal(toasts.at(-1).message, noticeReason, 'host navigation failure reaches the existing page toast');
assert.equal(toasts.at(-1).kind, 'error');
assert.equal(context.EditorBridge.pending, noticePending, 'notice must not consume an in-flight save');
assert.equal(JSON.stringify(context.Store.doc()), noticeDraft, 'notice must not alter draft or baseline');
events.data({text:'直接通知',kind:'warn',sequence:2}, 'notice');
assert.equal(toasts.at(-1).message, '直接通知', 'notice accepts direct patch payload');
assert.equal(toasts.at(-1).kind, 'warn');
const noticeCount = toasts.length;
events.data({notice:{text:noticeReason}}, 'prefs');
assert.equal(toasts.length, noticeCount, 'unrelated patches do not replay a merged stale notice');
events.data(null, 'notice');
assert.equal(toasts.length, noticeCount, 'invalid notice is safely ignored');
// Full data pushes must consume saved results even when the root retains an old notice.
const noticeRequest = sent.filter(x => x.k === 'apply').at(-1).value;
context.Store.set('custom_name', '聚合回执后的后续草稿');
events.data({notice:{text:noticeReason,kind:'error',sequence:1},result:{
  requestId:noticePending.id,status:'saved',item:{id:noticeRequest.id,count:noticeRequest.count,
    comps:noticeRequest.comps,removed:noticeRequest.removed}
}});
assert.equal(context.EditorBridge.pending, null, 'aggregate saved completes pending instead of being swallowed by notice');
assert.equal(context.Store.doc().comps.custom_name, '聚合回执后的后续草稿', 'aggregate saved preserves subsequent edits');
assert.equal(JSON.parse(context.Store.doc().base).comps.custom_name, noticeRequest.comps.custom_name, 'aggregate saved updates confirmed baseline');
assert.ok(context.diffDoc(context.Store.doc()).length, 'subsequent aggregate edits remain dirty');
assert.equal(toasts.filter(x => x.message === noticeReason).length, 1, 'old sequence does not replay on aggregate result');
// A new notice with identical text is legitimate, and world data must still be dispatched.
const worlds = [];
context.weSaved = world => worlds.push(world);
const aggregateWorld = {slot:{kind:'entity',uuid:'world-fixture'},revision:7};
events.data({notice:{text:noticeReason,kind:'error',sequence:3},world:aggregateWorld});
assert.equal(worlds.at(-1), aggregateWorld, 'notice plus aggregate world still reaches world handler');
assert.equal(toasts.filter(x => x.message === noticeReason).length, 2, 'same text with a new sequence is displayed');
const afterWorldNotices = toasts.length;
events.data({notice:{text:noticeReason,kind:'error',sequence:3},world:aggregateWorld});
assert.equal(worlds.length, 2, 'repeated aggregate world still forwarded');
assert.equal(toasts.length, afterWorldNotices, 'consumed notice not replayed with unrelated aggregate update');
events.data({notice:{text:noticeReason,kind:'error',sequence:4}});
assert.equal(toasts.length, afterWorldNotices + 1, 'notice-only new sequence displayed');
events.data({notice:{text:noticeReason,kind:'error',sequence:4}});
assert.equal(toasts.length, afterWorldNotices + 1, 'notice-only consumed sequence ignored');
const legacyCount = toasts.length;
events.data({notice:{text:'旧协议通知',kind:'error'},prefs:{uiSound:true}});
assert.equal(toasts.length, legacyCount, 'unsequenced notice in unrelated aggregate cannot replay');
events.data({text:'旧协议通知',kind:'error'}, 'notice');
assert.equal(toasts.length, legacyCount + 1, 'legacy explicit keyed notice remains supported');
context.applyToGame();
const combinedRequest = sent.filter(x => x.k === 'apply').at(-1).value;
const worldsBeforeCombined = worlds.length;
events.data({notice:{text:noticeReason,kind:'error',sequence:4},world:aggregateWorld,result:{
  requestId:combinedRequest.requestId,status:'saved',item:{id:combinedRequest.id,count:combinedRequest.count,comps:combinedRequest.comps,removed:combinedRequest.removed}
}});
assert.equal(worlds.length,worldsBeforeCombined+1,'aggregate dispatches world domain');
assert.equal(context.EditorBridge.pending,null,'the same aggregate also completes item result domain');
assert.equal(JSON.parse(context.Store.doc().base).comps.custom_name,combinedRequest.comps.custom_name,'combined result updates item baseline');
context.Store.set('custom_name',combinedRequest.comps.custom_name);
assert.equal(context.diffDoc(context.Store.doc()).length,0);
const fixture = fs.readFileSync(path.resolve(__dirname,'preview/legacy/preview-stack.js'),'utf8');
const originalApply = context.applyToGame;
context.oriel.data.stack = { id:'minecraft:stone', slot:{kind:'inventory',index:0} };
vm.runInContext(fixture,context);
assert.equal(context.applyToGame,originalApply,'fixture must preserve real host apply handler');
assert.equal(context.ORIEL_STACK,undefined,'fixture must not seed a real host stack');
let previewToast;
const preview = vm.createContext({toast(message){previewToast=message;},applyToGame(){throw new Error('host unavailable');}});
vm.runInContext(fixture,preview);
assert.equal(preview.ORIEL_STACK.slot.kind,'preview');
preview.applyToGame();
assert.match(previewToast,/不会写入真实物品/);
// Closing a popup/modal must consume Escape; otherwise Minecraft closes the editor too.
let modal = true, prevented = false, popupClosed = 0, modalClosed = 0;
context.document.getElementById = id => id === 'modal' && modal ? {} : null;
context.KPop = { el: {} };
context.kPopClose = () => { popupClosed++; context.KPop.el = null; };
context.closeModal = () => { modalClosed++; modal = false; };
const escape = () => { prevented = false; domEvents.keydown({ key: 'Escape', preventDefault() { prevented = true; } }); };
escape(); assert.equal(prevented, true); assert.equal(popupClosed, 1); assert.equal(modalClosed, 0);
escape(); assert.equal(prevented, true); assert.equal(modalClosed, 1);
escape(); assert.equal(prevented, false, 'Escape without a popup must still reach Minecraft');
// Reload state is separate from the draft. Late old results never authorize stale A.
context.EditorBridge.pending = null;
events.data({inventory_session:{stale:true,reason:'页面已重载，请关闭后重新读取物品'}}, 'inventory_session');
const sendsBeforeReloadApply = sent.filter(x=>x.k==='apply').length;
const reloadedDraft = JSON.stringify(context.Store.doc());
events.data({stack:{id:'minecraft:stone',count:1,comps:{custom_name:'B'},removed:{}}}, 'stack');
events.data({result:{status:'saved',requestId:'old-document-request',item:{id:'minecraft:stone',count:1,comps:{custom_name:'B'},removed:{}}}}, 'result');
assert.equal(JSON.stringify(context.Store.doc()),reloadedDraft,'late old stack/result cannot overwrite new-page draft');
context.applyToGame();
assert.equal(sent.filter(x=>x.k==='apply').length,sendsBeforeReloadApply,'reload-stale page blocks A submission before host send');
assert.equal(context.EditorInventorySessionStale,true);
assert.ok(context.EditorInventoryCapability.includes('关闭后重新读取'),'reload boundary stays visible in footer state');
console.log('PASS UI contract: payload, duplicate guard, rejection, confirmed baseline, pending edits, fixture host isolation, Escape ownership.');
// Real vault scripts: capability is readable before give, duplicate clicks are held,
// and the host's ten-second unknown terminal has time to reach the callback.
{
  const t = require('./lib/ui-harness.cjs').create(), c = t.c;
  c.Store.doc = () => null;
  c.openVault({});
  const req = t.sent.filter(x => x[0] === 'vault' && x[1].op === 'list').at(-1)[1];
  const entry = {id:'fixture-entry',name:'保留元数据',tags:['tag'],note:'unchanged',item:{id:'minecraft:stone',count:1}};
  const before = JSON.stringify(entry);
  c.Reg.ingest('vault.result',{version:1,requestId:req.requestId,op:'list',ok:true,entries:[entry],total:1,done:true,persisted:true,giveCapability:capabilityText});
  assert.ok(t.root.querySelector('.vt-warn').textContent.includes(capabilityText), 'vault shows permission boundary before clicking give');
  const give = t.root.querySelectorAll('.k-btn').find(x => x.textContent === '给我');
  assert.ok(give); give.click(); give.click();
  const gives = t.sent.filter(x => x[0] === 'vault' && x[1].op === 'give');
  assert.equal(gives.length,1,'real give button sends one explicit operation while pending');
  assert.ok(t.timers.some(x => x.ms === 12000),'give callback outlives the host ten-second terminal');
  c.Reg.ingest('vault.result',{version:1,requestId:gives[0][1].requestId,op:'give',ok:false,code:'request_timeout',reason:'结果未知，保险库已保留',path:'command',confirmed:false,status:'unknown'});
  assert.equal(c.VaultGivePending[entry.id], undefined);
  assert.equal(JSON.stringify(entry),before,'unknown command give never edits library content or metadata');
}
console.log('PASS vault UI: early capability, single in-flight give, ten-second host terminal, immutable entry.');
