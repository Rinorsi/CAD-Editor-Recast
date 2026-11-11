// Player slot -> full item editor: working-copy isolation and typed parent-draft round trip.
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.toast = () => {}; c.Reg.meta = {};
const stack = {id:'minecraft:paper',count:1,comps:{custom_data:{big:9007199254740992,byte:1,typed:[1,2]},'mod:unknown':{keep:'yes'}},removed:{enchantment_glint_override:1},component_snbt:{custom_data:'{big:9007199254740993L,byte:1b,typed:[I;1,2]}'},extension:{keep:42}};
const world = {kind:'entity',type:'minecraft:player',slot:{kind:'entity',player:'self',token:'parent-token'},revision:'r1',snbt:'{}',player:{self:true,name:'Test'},views:{player:{container:{size:36,slots:[{slot:0,stack}]},ender:{size:27,slots:[{slot:0,stack}]},SelectedItemSlot:0,schema:{inventorySize:36,equipmentSlots:[]}}}};
c.weOpen(world);
// Parent world drafts are persisted before detaching the item DOM; child Store is never exported.
c.Prefs.host=true;c.Prefs.vals.worldDraftScope='owned-test-server';world.slot.uuid='parent-uuid';
let flushes=0,touches=0;const flush=c.WorldDrafts.flush,touch=c.WorldDrafts.touch;
c.WorldDrafts.flush=function(){flushes++;return flush.call(this);};
c.WorldDrafts.touch=function(){touches++;return touch.call(this);};
const parent = c.makeDoc({id:'minecraft:stick',comps:{custom_data:{parent:true}}});
c.Store.docs.push(parent);
const parentSnapshot = c.snapOf(parent), parentSlots = c.WE.pslots;
const original = JSON.stringify(stack);
const buttons = el => el.querySelectorAll('.k-btn');
function click(label, root=t.root) { const b=buttons(root).find(b=>b.textContent===label);assert.ok(b,'visible button '+label);b.fire('click'); }
function enter(which='container') {
  const priorFlushes=flushes;
  const body=c.h('div'); if(which==='ender')c.wpEnderTab(body);else c.wpInventoryTab(body);
  t.doc.getElementById('screen').appendChild(body);
  c.wpEditSlot(body.querySelector('.slot'),which,0);
  click('完整编辑');
  assert.ok(c.NestedItem);assert.equal(c.weActive(),false);assert.equal(c.WE.w,world);
  assert.equal(c.Store.docs.length,1);assert.notEqual(c.Store.doc(),parent);assert.equal(c.Store.doc().src,null);
  assert.ok(buttons(t.doc.getElementById('topbar')).some(b=>b.textContent==='返回背包'));
  assert.match(t.doc.getElementById('topbar').textContent,/保存到背包草稿/);
  assert.equal(flushes,priorFlushes+1,'flush parent before entering child');
  const exported=c.WorldDrafts.exportPacket();assert(exported);assert.match(exported.key,/parent-uuid/);
  if(exported.value){const state=JSON.parse(exported.value).state;assert.deepEqual(state.pslots,JSON.parse(JSON.stringify(c.WE.pslots)));assert.equal(state.text,c.WE.text);}
}

// Cancel is isolated even for nested object mutations; parent document/history/slot draft survive.
enter();
assert.match(c.nbtComponentText(c.Store.doc(),'custom_data'),/9007199254740993L/);
c.Store.set('custom_data',c.parseSnbt('{changed:2s}'));
c.closeEditor();assert.ok(c.NestedItem,'close must open unsaved-choice dialog');
click('继续编辑');assert.ok(c.NestedItem);assert.equal(c.wpSlotsDirty(),0);
c.returnFromNestedItem();click('放弃并返回');
assert.equal(c.NestedItem,null);assert.equal(c.Store.doc(),parent);assert.equal(c.snapOf(parent),parentSnapshot);
assert.equal(c.WE.pslots,parentSlots);assert.equal(c.wpSlotsDirty(),0);assert.equal(JSON.stringify(stack),original);

// Saving includes untouched unknown components, remove intent, raw long/array types and extension fields.
enter();c.Store.setCount(2);c.openApply();
assert.equal(c.NestedItem,null);assert.equal(c.weActive(),true);
const next=c.wpContainerStack('container',0);assert.equal(next.count,2);assert.equal(next.extension.keep,42);
assert(touches>0,'exact parent slot write schedules world draft persistence');
assert.equal(next.comps['mod:unknown'].keep,'yes');assert.equal(next.removed.enchantment_glint_override,1);
assert.match(next.component_snbt.custom_data,/9007199254740993L/);assert.match(next.component_snbt.custom_data,/1b/);assert.ok(next.component_snbt.custom_data.includes('[I;1,2]'));
assert.equal(JSON.stringify(stack),original);assert.equal(c.WE.w.slot.token,'parent-token');
const msg={};c.wpMsg(msg);assert.equal(msg.player.container.slots[0].slot,0);assert.equal(msg.player.container.slots[0].stack.count,2);
assert.equal(t.sent.filter(([key])=>['apply','apply_world','undo','open_world'].includes(key)).length,0,'nested save never sends a host write/target change');

// Reopen from the parent draft, not the old server stack. Unchanged save creates no extra dirty slot.
enter();assert.equal(c.Store.doc().count,2);c.finishNestedItem(true);assert.equal(c.wpSlotsDirty(),1);
enter('ender');c.Store.set('custom_data',c.parseSnbt('{new:3s,raw:[B;1b,2b]}'));c.applyToGame();
assert.match(c.wpContainerStack('ender',0).component_snbt.custom_data,/3s/);assert.ok(c.wpContainerStack('ender',0).component_snbt.custom_data.includes('[B;1b,2b]'));

// Revision changes and pending writes cannot silently retarget or discard the working copy.
enter();c.Store.setCount(3);world.revision='r2';c.finishNestedItem(true);
assert.ok(c.NestedItem);assert.equal(c.wpContainerStack('container',0).count,2);c.finishNestedItem(false);
c.WE.pending='in-flight';enterBlocked();c.WE.pending=null;
function enterBlocked(){c.openNestedItem(stack,{render(){},commit(){throw Error('unexpected write');}});assert.equal(c.NestedItem,null);}
assert.equal(c.Store.doc(),parent);assert.equal(c.snapOf(parent),parentSnapshot);
c.closeEditor();assert.ok(t.doc.getElementById('modal'),'parent backpack close protects unsaved draft');click('继续编辑');
assert.equal(c.wpContainerStack('container',0).count,2);
console.log('PASS nested item: full editor entry, cancel/close guard, parent/history isolation, draft-only save, typed/unknown component fidelity, ender, stale revision and pending-write guards.');
