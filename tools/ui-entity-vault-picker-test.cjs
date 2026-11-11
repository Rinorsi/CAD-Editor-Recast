// Production picker/Vault/form handlers; only the host Vault transport is simulated.
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const typed = '{id:"minecraft:axolotl",Health:7.5f,big:9007199254740993L,a:[B;1b,2b],i:[I;1,2],l:[L;3L],equipment:{mainhand:{id:"minecraft:stone",count:1}},"mod:unknown":{x:2s}}';
let checks = 0;
function setup() {
  const t = H.create(), c = t.c; c.snd = () => {};
  c.Reg.meta = {generation:'entity-vault-picker'};
  const toasts = []; c.toast = text => toasts.push(text);
  c.Store.open({id:'minecraft:armor_stand',count:1,comps:{entity_data:c.parseSnbtUser('{id:"minecraft:pig",old:1b}'),custom_data:{parent:1}},removed:{}},true);
  c.Store.set('custom_data',{parent:2},{label:'earlier parent edit'});
  const calls = []; let deferred = null;
  const state = {snbt:typed,kind:'entity',defer:false,error:null};
  c.Vault.call = (op, fields, cb) => {
    calls.push([op,fields]);
    if (op === 'list') cb({ok:true,entries:[{id:'e1',kind:'entity',name:'typed axolotl',tags:[],entity:{id:'minecraft:axolotl'}}],total:1,done:true});
    else if (op === 'tags') cb({ok:true,tags:[]});
    else if (op === 'get') {
      const reply = () => cb(state.error || {ok:true,entries:[{id:'e1',kind:state.kind,snbt:state.snbt}]});
      if (state.defer) deferred = reply; else reply();
    } else cb({ok:true});
  };
  function modal() { return t.doc.getElementById('modal'); }
  function button(label, root = modal()) {
    const found = root.querySelectorAll('.k-btn').filter(x => x.textContent === label);
    assert.equal(found.length,1,'unique button '+label); return found[0];
  }
  function beginFull() {
    // Same AUTO_BODY and kRegSelect chain as the Placement and data component detail.
    const card = {body:c.h('div')};
    c.AUTO_BODY.entity_data(card,'entity_data',c.Ctx.get('entity_data'));
    c.openModal(c.modalShell('parent detail','',[card.body],[]));
    const parentMask = modal(); button('选择…',card.body).fire('click');
    return {card,parentMask,selector:modal()};
  }
  function take(label='从保险库取生物') { button(label).fire('click'); button('使用').fire('click'); }
  return {t,c,toasts,calls,state,modal,button,beginFull,take,reply:()=>deferred()};
}
function test(name, fn) { fn(); checks++; console.log('PASS '+name); }

test('placement/data actual selector imports complete typed entity and refreshes just its parent form',()=>{
  const s=setup(),{c}=s; c.autoPut('entity_data',c.parseSnbtUser('{id:"minecraft:pig",old:2b}'));
  const d=c.Store.doc(), before=c.snapOf(d), hist=d.hist, {card,parentMask}=s.beginFull();
  s.take(); assert.strictEqual(s.modal(),parentMask); assert.strictEqual(c.Store.doc(),d); assert.strictEqual(d.hist,hist);
  assert.equal(c.nbtComponentText(d,'entity_data'),c.nbtPrint(c.nbtParse(typed),false));
  assert.equal(d.comps.custom_data.parent,2); assert.equal(d.comps.entity_data.old,undefined);
  assert(card.body.querySelector('.rs-name').getAttribute('data-tip').includes('minecraft:axolotl'),'type refreshed immediately');
  assert(card.body.textContent.includes('Health'),'new fields refreshed immediately');
  assert(!card.body.textContent.includes('old'),'old field removed immediately');
  const imported=c.snapOf(d); c.Store.undo(); assert.equal(c.snapOf(d),before,'one undo restores pre-import dirty draft');
  c.Store.redo(); assert.equal(c.snapOf(d),imported);
  assert(!s.t.sent.some(([k])=>['apply','open_world'].includes(k)),'local draft only');
});

test('only-type schema field uses explicit type-only entry and does not import NBT',()=>{
  const s=setup(),{c}=s; let value='minecraft:pig', commits=0; const before=c.snapOf(c.Store.doc());
  const field=c.wStr({t:'str',reg:'entity_type'},value,v=>{value=v;commits++;});
  c.openModal(c.modalShell('schema parent','',[field],[])); const parent=s.modal();
  s.button('选择…',field).fire('click');
  assert(s.button('从保险库选择类型').getAttribute('data-tip').includes('不导入'));
  s.take('从保险库选择类型');
  assert.strictEqual(s.modal(),parent); assert.equal(value,'minecraft:axolotl'); assert.equal(commits,1);
  assert.equal(c.snapOf(c.Store.doc()),before); assert(s.toasts.some(x=>/仅选择类型/.test(x)));
});

test('cancel Vault restores selector and parent detail without draft/history mutation',()=>{
  const s=setup(),{c}=s, before=c.snapOf(c.Store.doc()), hi=c.Store.doc().hi, history=c.Store.doc().hist.slice();
  const {selector,parentMask}=s.beginFull(); s.button('从保险库取生物').fire('click');
  s.button('完成').fire('click'); assert.strictEqual(s.modal(),selector);
  s.button('取消').fire('click'); assert.strictEqual(s.modal(),parentMask);
  assert.equal(c.snapOf(c.Store.doc()),before); assert.equal(c.Store.doc().hi,hi); assert.deepEqual(c.Store.doc().hist,history);
});

for (const [name,snbt,kind] of [
  ['malformed','{id:', 'entity'],['list root','[]','entity'],['missing ID','{Health:1f}','entity'],
  ['numeric ID','{id:12}','entity'],['invalid ID','{id:"bad ID"}','entity'],['wrong entry kind',typed,'item']
]) test('reject '+name+' without changing parent',()=>{
  const s=setup(),{c}=s; Object.assign(s.state,{snbt,kind}); const before=c.snapOf(c.Store.doc());
  const {selector}=s.beginFull(); s.take();
  assert.equal(c.snapOf(c.Store.doc()),before); assert.strictEqual(s.modal(),selector);
  assert(s.toasts.length,'readable error');
});

test('unknown vault entry stays open and never calls parent handler',()=>{
  const s=setup(), before=s.c.snapOf(s.c.Store.doc()); s.state.error={ok:false,error:'NOT_FOUND',reason:'条目已不存在'};
  s.beginFull(); s.button('从保险库取生物').fire('click'); const mask=s.modal(); s.button('使用').fire('click');
  assert.strictEqual(s.modal(),mask); assert.equal(s.c.snapOf(s.c.Store.doc()),before); assert(s.toasts.some(x=>/不存在/.test(x)));
});

test('valid unknown mod entity is preserved for authoritative Codec verification',()=>{
  const s=setup(); s.state.snbt='{id:"unknown_mod:custom_mob",big:9007199254740993L}'; s.beginFull(); s.take();
  assert.equal(s.c.Ctx.get('entity_data').id,'unknown_mod:custom_mob');
  assert(s.c.nbtComponentText(s.c.Store.doc(),'entity_data').includes('9007199254740993L'));
});

for (const action of ['cancel','cancel and replace modal','other document','parent edit','world replaced','world revision']) test('late get after '+action+' cannot write or close unrelated modal',()=>{
  const s=setup(),{c}=s; c.WE.w={revision:'r1'}; s.state.defer=true;
  const {selector}=s.beginFull(); s.button('从保险库取生物').fire('click'); const vault=s.modal();
  s.button('使用').fire('click'); s.button('使用').fire('click');
  assert.equal(s.calls.filter(x=>x[0]==='get').length,1,'one in-flight selection');
  let expected=selector;
  if(action.startsWith('cancel')) s.button('完成').fire('click');
  if(action==='cancel and replace modal') { c.openModal(c.modalShell('unrelated','',[],[])); expected=s.modal(); }
  if(action==='other document') c.Store.open({id:'minecraft:stone',comps:{},removed:{}},true);
  if(action==='parent edit') c.Store.set('custom_data',{parent:3});
  if(action==='world replaced') c.WE.w={revision:'r1'};
  if(action==='world revision') c.WE.w.revision='r2';
  const before=c.snapOf(c.Store.doc()); s.reply();
  assert.equal(c.snapOf(c.Store.doc()),before);
  assert.strictEqual(s.modal(),expected);
  assert.notStrictEqual(s.modal(),vault);
});

for(const lazy of [false,true]) test('ID-only selector '+(lazy?'lazy':'normal')+' keeps existing footer actions',()=>{
  const s=setup(),{c}=s; c.Reg.lazyKind=()=>lazy?'entity_types':null; let picked=null, extra=0;
  c.openRegPick({reg:'entity_type',footExtra:[c.kBtn('existing action',()=>extra++)],onPick:id=>picked=id});
  s.button('existing action').fire('click'); assert.equal(extra,1); s.take('从保险库选择类型'); assert.equal(picked,'minecraft:axolotl');
});
for(const lazy of [false,true]) test('single ID/tag selector '+(lazy?'lazy':'normal')+' exposes type-only Vault entry',()=>{
  const s=setup(),{c}=s; c.Reg.lazyKind=()=>lazy?'entity_types':null; let picked=null;
  c.openRegPick({reg:'entity_type',tag:true,onPick:id=>picked=id});
  s.take('从保险库选择类型'); assert.equal(picked,'minecraft:axolotl');
});

test('existing full-NBT callback still receives untouched typed text with extra footer action',()=>{
  const s=setup(),{c}=s; let picked=null;
  c.openRegPick({reg:'entity_type',footExtra:[c.kBtn('existing action',()=>{})],onEntityNbt:text=>picked=text,onPick:()=>assert.fail('not ID callback')});
  s.button('existing action'); s.take(); assert.equal(picked,typed);
});
test('non-entity registry picker does not offer an incompatible entity Vault action',()=>{
  const s=setup(),{c}=s; c.openRegPick({reg:'block_entity_type',onPick:()=>assert.fail('no selection')});
  assert(!s.modal().querySelectorAll('.k-btn').some(x=>/从保险库/.test(x.textContent)));
});

test('spawn egg production header keeps complete typed entity import',()=>{
  const s=setup(),{c}=s, card=c.CARDS.spawnEgg();
  c.openModal(c.modalShell('egg','',[card.body],[])); s.button('更换生物').fire('click'); s.take();
  assert.equal(c.nbtComponentText(c.Store.doc(),'entity_data'),c.nbtPrint(c.nbtParse(typed),false));
});
test('spawner current entity production handler imports full NBT without replacing other spawner data',()=>{
  const s=setup(),{c}=s, body=c.h('div'), obj={Delay:19,SpawnData:{entity:{id:'minecraft:pig'}},extension:3}; let changed=0;
  c.buildMobSpawner(body,obj,'minecraft:mob_spawner',()=>changed++); c.openModal(c.modalShell('spawner','',[body],[]));
  s.button('更换生物').fire('click'); s.take(); assert.equal(changed,1); assert.equal(obj.Delay,19); assert.equal(obj.extension,3);
  assert.equal(c.toSnbt(obj.SpawnData.entity,null,false),c.nbtPrint(c.nbtParse(typed),false));
});
test('spawner random pool production add and replace handlers retain typed data, weight and existing entries',()=>{
  const s=setup(),{c}=s, arr=[{data:{entity:{id:'minecraft:pig'}},weight:7}], pool=c.spPool(arr,()=>{},'empty');
  c.openModal(c.modalShell('pool','',[pool.el],[])); pool.el.querySelector('.k-add').fire('click'); s.take();
  assert.equal(arr.length,2); assert.equal(arr[0].weight,7); assert.equal(arr[1].weight,1);
  assert.equal(c.toSnbt(arr[1].data.entity,null,false),c.nbtPrint(c.nbtParse(typed),false));
  s.button('更换生物').fire('click'); s.state.snbt='{id:"minecraft:bee",big:9007199254740993L}'; s.take();
  assert.equal(arr[1].data.entity.id,'minecraft:bee'); assert.equal(arr[0].data.entity.id,'minecraft:pig');
  assert(c.toSnbt(arr[1].data.entity,null,false).includes('9007199254740993L'));
});
console.log('PASS '+checks+' production entity Vault picker scenarios; VM/host-transport simulation, not game acceptance.');
