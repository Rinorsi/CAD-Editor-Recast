// Exercise each production picker handoff, not only the shared vaultNested helper.
// The picker result is a fixture; these are UI VM tests, not game/Codec tests.
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const texts = [
  '{same:1b,precise:9007199254740993L,array:[L;9007199254740995L],nested:{s:2s}}',
  '{same:1s,precise:9007199254740993L,array:[L;9007199254740995L],nested:{s:2s}}'
];
function fixture(c, i) {
  return {id:'minecraft:arrow',count:1,comps:{custom_data:c.parseSnbt(texts[i]),'mod:unknown':{keep:'yes'}},
    component_snbt:{custom_data:texts[i]},removed:{}};
}
function setup(cid, id, initial) {
  const h=H.create(),c=h.c; c.snd=()=>{}; c.toast=()=>{};
  c.Reg.meta={generation:'nested-route'};
  c.Reg.ingest('registry.item_meta_one',{generation:'nested-route',id,entries:[{id,container_size:3,bundle_capacity:{numerator:1,denominator:1}}],done:true});
  c.Store.open({id,key:'nested-route',comps:{[cid]:initial},removed:{}},true);
  return h;
}
function check(c,cid,expected) {
  const d=c.Store.doc(),text=c.nbtComponentText(d,cid),ast=c.nbtParse(text);
  const items=cid==='container'?ast.items.map(x=>x.map.item):cid==='use_remainder'?[ast]:ast.items;
  assert.equal(items.length,expected.length,cid+' item count');
  items.forEach((item,i)=>{
    const comps=item.map.components;
    assert.equal(c.nbtPrint(comps.map['minecraft:custom_data'],false),c.nbtPrint(c.nbtParse(texts[expected[i]]),false),cid+' source-owned types');
    assert.equal(comps.map['mod:unknown'].map.keep.v,'yes',cid+' unknown component preserved');
  });
  const wire=c.nbtApplyFormats(d);
  assert.equal(wire.formats[cid],'snbt',cid+' typed submission');
  assert.equal(wire.comps[cid],text,cid+' submit uses exact document text');
  return text;
}
function history(c,cid,want) {
  c.Store.undo(); c.Store.redo();
  assert.equal(c.nbtComponentText(c.Store.doc(),cid),want,cid+' undo/redo preserves types');
}
{
  const {c}=setup('container','minecraft:shulker_box',[]); let picker;
  c.kStackPop=(anchor,stack,options)=>{picker=options;};
  const card=c.CARDS.container();
  let menu; c.kMenu=(x,y,items)=>{menu=items;};
  function select(slot,i) {
    c.__t+=100; // The harness clock is fixed; respect the production menu debounce.
    card.body.querySelectorAll('.slot')[slot].fire('contextmenu');
    menu.find(x=>x.label==='编辑…').run(); picker.onStack(fixture(c,i));
  }
  select(0,0); select(1,1);
  const first=check(c,'container',[0,1]); history(c,'container',first);
  c.__t+=100;
  card.body.querySelectorAll('.slot')[0].fire('contextmenu');
  menu.find(x=>x.label==='复制到下一个空格').run();
  history(c,'container',check(c,'container',[0,1,0]));
}
{
  const {c}=setup('bundle_contents','minecraft:bundle',[]); let picker;
  c.pickItem=(anchor,onPick,options)=>{picker=options;};
  const card=c.CARDS.bundle();
  for(let i=0;i<2;i++){card.body.querySelector('.addslot').fire('click');picker.onStack(fixture(c,i));}
  history(c,'bundle_contents',check(c,'bundle_contents',[0,1]));
}
{
  const {c}=setup('use_remainder','minecraft:apple',{id:'minecraft:arrow',count:1}); let picker;
  c.pickItem=(anchor,onPick,options)=>{picker=options;};
  const card=c.CARDS.remainder();
  card.body.querySelector('.k-btn').fire('click');picker.onStack(fixture(c,0));
  check(c,'use_remainder',[0]);
  // A different user edit separates undo groups; successive same-field edits intentionally coalesce.
  c.Store.set('custom_name','history boundary');
  card.body.querySelector('.k-btn').fire('click');picker.onStack(fixture(c,1));
  history(c,'use_remainder',check(c,'use_remainder',[1]));
  c.Store.undo();check(c,'use_remainder',[0]);
}
{
  const {c}=setup('charged_projectiles','minecraft:crossbow',[]); let picker;
  c.openVault=options=>{picker=options;}; c.drawDetail=()=>{};
  const card={body:c.h('div')};
  c.AUTO_BODY.charged_projectiles(card,'charged_projectiles',[]);
  for(let i=0;i<2;i++){
    card.body.querySelectorAll('.k-btn').find(x=>x.textContent==='从保险库取一件').fire('click');
    picker.pick(fixture(c,i));
  }
  history(c,'charged_projectiles',check(c,'charged_projectiles',[0,1]));
}
{
  const id='minecraft:apple',cid='use_remainder';
  const prototype={id:'minecraft:arrow',count:1,components:{'minecraft:custom_data':{n:1}}};
  const {c}=setup(cid,id,prototype); let picker;
  c.Reg.ingest('registry.item_defaults_one',{generation:'nested-route',id,entries:[{id,comps:{[cid]:prototype}}],done:true});
  c.pickItem=(anchor,onPick,options)=>{picker=options;};
  const card=c.CARDS.remainder();
  card.body.querySelector('.k-btn').fire('click');
  picker.onStack({id:'minecraft:arrow',count:1,comps:{custom_data:{n:1}},component_snbt:{custom_data:'{n:1s}'},removed:{}});
  assert.equal(c.intentOf(c.Store.doc(),cid),'set','same JSON values with explicit NBT types must not inherit the prototype');
  const payload=c.nbtApplyFormats(c.Store.doc());
  assert.equal(payload.formats[cid],'snbt');
  assert.match(payload.comps[cid],/n:1s/,'explicit type survives smart-default comparison');
}
console.log('PASS four production nested routes: container copy, bundle, use remainder, charged projectiles; same-value byte/short, exact long/arrays, unknown components, undo/redo, typed submit and prototype collision.');
