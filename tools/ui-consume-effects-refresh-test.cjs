// Production Ender Chest -> 使用结束时的效果 detail entry; no game/Codec claim.
const assert=require('node:assert/strict'),H=require('./lib/ui-harness.cjs');
const t=H.create(),c=t.c;c.snd=()=>{};c.toast=()=>{};c.window.EDITOR_PREVIEW=true;c.Reg.meta={};
c.document.documentElement.setAttribute('data-motion','reduced');
c.Store.open({id:'minecraft:ender_chest',count:1,comps:{consumable:{on_consume_effects:[{type:'minecraft:apply_effects',probability:1,effects:[{id:'minecraft:absorption',duration:-1},{id:'minecraft:blindness',duration:600}]}]}},removed:{}},true);
const entry=c.makeCard('consumeEffects');c.document.getElementById('screen').appendChild(entry.el);entry.el.firstChild.fire('click');
const doc=c.Store.doc(),modal=c.document.getElementById('modal'),main=c.document.getElementById('detailmain');
main.querySelector('.k-xhead').fire('click');
const root=main.querySelectorAll('.k-effects')[1];assert(root,'actual nested effect list exists');
const rows=()=>root.querySelector('.k-sortlist').children.filter(x=>x.classList.contains('k-xrow'));
const payload=()=>c.Ctx.get('consumable').on_consume_effects[0].effects;
const check=n=>{assert.equal(rows().length,n,'DOM updates in already expanded list');assert.equal(payload().length,n,'current actual payload');assert.strictEqual(c.Store.doc(),doc);assert.strictEqual(c.document.getElementById('modal'),modal,'no full detail replacement');};
rows()[1].firstChild.fire('click');
root.querySelectorAll('.k-btn').find(b=>b.textContent==='删除这个效果').fire('click');check(1);
let picker;c.openEffectPicker=o=>{picker=o;};root.querySelector('.k-add').fire('click');
assert(picker.present['minecraft:absorption'],'existing effect is preselected');
picker.onConfirm(['minecraft:absorption','minecraft:regeneration'],{'minecraft:regeneration':{level:2,seconds:77}});check(2);
assert.equal(payload()[1].duration,1540);assert.equal(payload()[1].amplifier,1);
const permanent=root.querySelectorAll('.k-togrow').find(x=>x.textContent.includes('永久持续'));
permanent.querySelector('.k-toggle').fire('click');check(2);assert.equal(payload()[1].duration,-1);assert(rows()[1].firstChild.textContent.includes('无限'));
let menu;c.kMenu=(x,y,items)=>{menu=items;};c.lastCtx=0;rows()[1].fire('contextmenu');menu.find(x=>x.label==='复制').run();check(3);
assert.notStrictEqual(payload()[1],payload()[2]);
c.lastCtx=0;rows()[2].fire('contextmenu');menu.find(x=>x.label==='删除').run();check(2);
assert(!main.querySelector('.k-xrow').firstChild.textContent.includes('失明'),'parent summary updates without refolding');
// Generic entity/player caller shape: fresh cloned getter and replacing setter.
let entity=[{id:'minecraft:speed',duration:600}];const generic=c.kEffectList(()=>c.clone(entity),v=>{entity=c.clone(v);});
generic.el.querySelector('.k-xhead').fire('click');generic.el.querySelectorAll('.k-btn').find(x=>x.textContent==='删除这个效果').fire('click');
assert.equal(entity.length,0);assert.equal(generic.el.querySelectorAll('.k-xrow').length,0);
// Empty parent has no subtitle in xRow initially; the first addition creates it.
let empty=[{type:'minecraft:apply_effects',effects:[]}];
const parent=c.kConsumeEffects(()=>c.clone(empty),v=>{empty=c.clone(v);},'death_protection');
parent.el.querySelector('.k-xhead').fire('click');
const child=parent.el.querySelectorAll('.k-effects')[0];
child.querySelector('.k-add').fire('click');picker.onConfirm(['minecraft:speed'],{'minecraft:speed':{seconds:3}});
assert.equal(empty[0].effects[0].duration,60);assert(parent.el.querySelector('.k-xhead').textContent.includes(c.ceSummary(empty[0])));
console.log('PASS actual consumeEffects detail delete/add/permanent/copy/context-delete + immediate DOM/payload/summary + generic clone caller, same modal/document');
