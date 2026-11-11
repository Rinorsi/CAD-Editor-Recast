const assert=require('node:assert/strict'), H=require('./lib/ui-harness.cjs');
const t=H.create(),c=t.c; c.snd=()=>{};c.toast=()=>{};c.Reg.meta={};c.window.EDITOR_PREVIEW=true;
c.Store.open({id:'minecraft:shulker_box',comps:{container:c.parseSnbtUser('[{slot:2,item:{id:"minecraft:bundle",count:1,components:{"minecraft:bundle_contents":[{id:"minecraft:paper",count:3,components:{"minecraft:custom_data":{big:9007199254740993L,a:[B;1b,2b],i:[I;1,2],l:[L;3L]},"mod:unknown":{v:1s},"!minecraft:enchantment_glint_override":{}}}]},extension:{keep:7b}}}]')},removed:{}},true);
c.rebuild();const parent=c.Store.doc(),before=c.snapOf(parent), history=parent.hist, screen=t.doc.getElementById('screen');
let card=c.CARDS.container();screen.appendChild(card.el);const parentBody=t.doc.getElementById('edbody');parentBody.scrollTop=123;c.UIOpen.example=true;
const click=(root,text)=>{const b=root.querySelectorAll('.k-btn').find(b=>b.textContent===text);assert(b,'button '+text);b.fire('click');};
function slotOpen(cell){c.WE_DND.last=null;cell.fire('click');t.timers[c.WE_DND.timer-1].fn();}
function enterContainer(){slotOpen(card.el.querySelectorAll('.slot')[2]); click(t.doc.getElementById('overlays'),'编辑物品');assert(c.NestedItem);assert.equal(c.Store.doc().id,'minecraft:bundle');}
enterContainer();c.Store.setCount(7);c.finishNestedItem(false);assert.strictEqual(c.Store.doc(),parent);assert.equal(c.snapOf(parent),before);assert.strictEqual(parent.hist,history);assert.strictEqual(t.doc.getElementById('edbody'),parentBody);assert.equal(parentBody.scrollTop,123);
enterContainer();const childDoc=c.Store.doc();let bundle=c.CARDS.bundle();t.doc.getElementById('edbody').appendChild(bundle.el);slotOpen(bundle.el.querySelector('.slot'));click(t.doc.getElementById('overlays'),'编辑物品');
assert.equal(c.Store.doc().id,'minecraft:paper');assert(c.NestedItem.parent);assert.match(c.nbtComponentText(c.Store.doc(),'custom_data'),/9007199254740993L/);
c.Store.setCount(5);c.finishNestedItem(true);assert.strictEqual(c.Store.doc(),childDoc);assert.equal(c.Ctx.get('bundle_contents')[0].count,5);assert.equal(c.Store.doc().count,1);
c.finishNestedItem(true);assert.strictEqual(c.Store.doc(),parent);assert.strictEqual(parent.hist,history);assert.equal(c.UIOpen.example,true);assert.equal(parentBody.scrollTop,123);
const raw=c.nbtComponentText(parent,'container');for(const tag of ['9007199254740993L','[B;1b,2b]','[I;1,2]','[L;3L]','1s','7b','!minecraft:enchantment_glint_override'])assert(raw.includes(tag),tag);
assert.equal(c.Ctx.get('container')[0].slot,2);assert.equal(c.Ctx.get('container')[0].item.components['minecraft:bundle_contents'][0].count,5);assert(c.diffDoc(parent).length);
const saved=c.snapOf(parent);c.Store.undo();assert.equal(c.snapOf(parent),before);c.Store.redo();assert.equal(c.snapOf(parent),saved);
enterContainer();c.Store.setCount(8);parent.count=4;c.finishNestedItem(true);assert(c.NestedItem,'stale parent rejects precise-slot write');c.finishNestedItem(false);assert.equal(parent.count,4);
assert(!t.sent.some(([k])=>['apply','apply_world','open_world'].includes(k)));
console.log('PASS production container/bundle popover entry, cancel, two levels, live parent DOM/scroll/history, exact slot refresh, stale guard, typed/unknown/removal/extensions, undo/redo and no host write');
