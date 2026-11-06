// Interaction tests against the actual form builders; no browser or game process.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.style={};this.events={};this.value='';this._text=''; }
  get className(){return this.attrs.class||'';} set className(x){this.attrs.class=x;}
  get id(){return this.attrs.id;} set id(x){this.attrs.id=x;}
  get firstChild(){return this.children[0]||null;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(x){this._text=String(x);this.children=[];}
  get classList(){const el=this;return {contains(x){return el.className.split(' ').includes(x);},add(x){if(!this.contains(x))el.className+=' '+x;},remove(x){el.className=el.className.split(' ').filter(y=>y!==x).join(' ');},toggle(x,on){if(on===undefined)on=!this.contains(x);if(on)this.add(x);else this.remove(x);}};}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  removeAttribute(k){delete this.attrs[k];}
  appendChild(x){if(x.parentNode)x.remove();this.children.push(x);x.parentNode=this;return x;}
  removeChild(x){this.children.splice(this.children.indexOf(x),1);x.parentNode=null;return x;}
  remove(){if(this.parentNode)this.parentNode.removeChild(this);}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  fire(k){for(const fn of this.events[k]||[])fn({target:this,key:'',preventDefault(){},stopPropagation(){}});}
  focus(){doc.activeElement=this;}
  getBoundingClientRect(){return {left:0,top:0,width:400,height:300,right:400,bottom:300};}
  matches(s){return s[0]==='.'?this.classList.contains(s.slice(1)):s[0]==='#'?this.id===s.slice(1):this.tagName.toLowerCase()===s;}
  querySelectorAll(s){const out=[];for(const x of this.children){if(x.matches(s))out.push(x);out.push(...x.querySelectorAll(s));}return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
const root=new Element('body'),overlays=new Element('div');overlays.id='overlays';root.appendChild(overlays);
const doc={body:root,activeElement:null,addEventListener(){},createElement(tag){return new Element(tag);},createTextNode(t){const el=new Element('text');el.textContent=t;return el;},getElementById(id){return root.querySelector('#'+id);}};
const c=vm.createContext({document:doc,window:{innerWidth:760,innerHeight:560},console,setTimeout(){},clearTimeout(){},oriel:{data:{},send(){return true;}}});
const dir=path.resolve(__dirname,'../fabric/src/main/resources/assets/cadeditor/ui/js');
for(const f of ['data','core','forms','kit','kit2','nbt','xlist','reg','picker','cards1','cards2','cards3','cards5','world','rules','screens'])vm.runInContext(fs.readFileSync(path.join(dir,f+'.js'),'utf8'),c);
c.uiIcon=()=>new Element('i');c.itemIcon=()=>new Element('i');c.uiClick=()=>{};c.snd=()=>{};c.toast=()=>{};
let saved,disabled=0,writes=0;
c.autoPut=(cid,value)=>{saved=JSON.parse(JSON.stringify(value));writes++;};
c.Ctx.disable=()=>disabled++;
const buttons=el=>[...el.querySelectorAll('.k-btn'),...el.querySelectorAll('.k-add')];
const openRow=(el,i)=>el.querySelectorAll('.k-xhead')[i].fire('click');
function click(el,label){const b=buttons(el).find(x=>x.textContent===label);assert.ok(b,'button '+label);b.fire('click');}
function card(){return {body:new Element('div')};}

// Selecting a new target is transactional; canceling never inserts a wildcard.
let picker;
c.openTagPicker=o=>picker=o;
let a=card();c.blockPredList(a,'can_place_on',{blocks:'mod:old',state:{axis:'y'},nbt:{keep:1},custom:{preserve:true}});
click(a.body,'添加规则');assert.equal(writes,0);assert.ok(picker);
picker.onConfirm(['mod:new','mod:other']);assert.equal(saved.length,2);assert.equal(saved[0].custom.preserve,true);
assert.deepEqual(saved[1].blocks,['mod:new','mod:other']);
openRow(a.body,0);click(a.body,'更换');picker.onConfirm(['#mod:group']);assert.equal(saved[0].blocks,'#mod:group');assert.deepEqual(saved[0].state,{axis:'y'});assert.deepEqual(saved[0].nbt,{keep:1});
let before=writes;picker.onConfirm(['#mod:one','mod:two']);assert.equal(writes,before,'mixed tags must not overwrite target');

// Deleting the last rule disables its component instead of sending an invalid empty list.
a=card();c.blockPredList(a,'can_break',{blocks:'minecraft:stone'});click(a.body,'删除');assert.equal(disabled,1);

// Invalid raw input is retained locally and never commits; reset returns to the last saved text.
let committed;
let raw=c.worldRaw({keep:1},x=>committed=x,c.worldCompound),ta=raw.querySelector('textarea');
ta.value='{broken';ta.fire('input');click(raw,'写入草稿');assert.equal(committed,undefined);assert.match(raw.querySelector('.world-error').textContent,/未写入/);
ta.value='{keep:2}';click(raw,'写入草稿');assert.equal(committed.keep,2);ta.value='{keep:3}';click(raw,'撤回输入');assert.equal(ta.value,'{keep:2}');
ta.value='[]';click(raw,'写入草稿');assert.equal(committed.keep,2);

// Duplicate data fields and duplicate map names are rejected without replacing existing values.
let map=c.worldMap({axis:'y'},x=>committed=x,true),ins=map.querySelector('.world-new').querySelectorAll('input');
ins[0].value='axis';ins[1].value='x';click(map,'添加');assert.match(map.querySelector('.world-error').textContent,/已存在/);
committed=null;a=card();c.AUTO_BODY.map_decorations(a,'map_decorations',{one:{type:'mod:marker',x:0},two:{type:'mod:marker',x:4}});openRow(a.body,0);
let name=a.body.querySelector('input');name.value='two';name.fire('input');assert.match(a.body.querySelector('.world-error').textContent,/不能重复/);

// Editing a projectile preserves its component data and unknown extension fields.
a=card();c.AUTO_BODY.charged_projectiles(a,'charged_projectiles',[{id:'minecraft:arrow',count:1,components:{'mod:data':{keep:true}},extension:42}]);openRow(a.body,0);
let num=a.body.querySelector('.k-numin');assert.ok(num);num.value='3';num.fire('input');num.fire('change');assert.equal(saved[0].count,3);assert.equal(saved[0].extension,42);assert.equal(saved[0].components['mod:data'].keep,true);

// Nested pickers restore the SAME parent DOM and its focus, both on cancel and confirm.
let parent=c.h('div',{id:'detailwin'}),focus=c.h('input');parent.appendChild(focus);c.openModal(parent);focus.focus();
let child=c.h('div',{id:'testpicker'});c.openModal(child,true);assert.equal(parent.parentNode.style.display,'none');assert.equal(c.ModalParents.length,1);
c.closeModal();assert.equal(doc.getElementById('modal').firstChild,parent);assert.equal(doc.activeElement,focus);assert.equal(c.ModalParents.length,0);
c.openModal(c.h('div',{id:'child2'}),true);c.openModal(c.h('div',{id:'replacement'}));assert.equal(c.ModalParents.length,0);assert.equal(doc.getElementById('detailwin'),null);c.closeModal();assert.equal(doc.getElementById('modal'),null);
console.log('PASS world UI: rule add/change/cancel, unknown data preservation, last-rule removal, staged SNBT, duplicate keys/names, projectile data, nested modal restoration.');

// 物品类别来自游戏事实（默认组件 + item_meta），不再靠物品名后缀
{
  const kind = (id, dc, meta) => c.kindFromFacts(id, dc, meta);
  assert.equal(kind('diamond_sword', { weapon: { item_damage_per_attack: 1 } }, { weapon: true }), 'melee');
  assert.equal(kind('diamond_pickaxe', { tool: {}, weapon: { item_damage_per_attack: 2 } }, { tool: true, weapon: true }), 'tool', '镐带 weapon 组件也是工具');
  assert.equal(kind('diamond_axe', { tool: {}, weapon: { item_damage_per_attack: 1, disable_blocking_for_seconds: 5 } }, { tool: true, weapon: true }), 'melee', '斧能让盾失效，算近战');
  assert.equal(kind('bow', {}, { ranged_weapon: true }), 'ranged');
  assert.equal(kind('shield', { blocks_attacks: {} }, {}), 'shield');
  assert.equal(kind('diamond_chestplate', {}, { armor_slot: 'chest', equipment_slot: 'chest' }), 'armor');
  assert.equal(kind('player_head', {}, { equipment_slot: 'head' }), 'generic', '玩家头颅不是盔甲');
  assert.equal(kind('elytra', { glider: {} }, { equipment_slot: 'chest' }), 'armor');
  assert.equal(kind('pig_spawn_egg', {}, { spawn_egg_entity: 'minecraft:pig' }), 'spawn');
  assert.equal(kind('chest', {}, { block_item: true, container_size: 27 }), 'container');
  assert.equal(kind('bundle', {}, { bundle: true }), 'container');
  assert.equal(kind('bread', {}, { food: true, consumable: true }), 'food');
  assert.equal(kind('potion', { potion_contents: {} }, {}), 'potion');
  assert.equal(kind('enchanted_book', { stored_enchantments: {} }, {}), 'ebook');
  assert.equal(kind('white_banner', { banner_patterns: [] }, { block_item: true }), 'banner');
  assert.equal(kind('music_disc_cat', { jukebox_playable: {} }, {}), 'disc');
  assert.equal(kind('stone', {}, { block_item: true }), 'generic');
  // 容器格数 / 收纳袋容量：有真实数据就用，没有才退回内置表
  c.Reg.meta = {}; c.Reg.imeta['minecraft:chest'] = { id: 'minecraft:chest', container_size: 54 };
  assert.equal(c.slotCountFor('minecraft:chest'), 54);
  c.Reg.imeta['minecraft:barrel'] = false; assert.equal(c.slotCountFor('barrel'), 27, '未知元信息退回内置表');
  c.Reg.meta = null;
  assert.equal(c.slotCountFor('hopper'), 5, '离线退回内置表');
}
console.log('PASS item kind from facts, container size, bundle capacity fallbacks.');

// 主手装备槽组、玩家基础属性：用游戏数据，没有时才退回默认
{
  c.Reg.meta = null;
  assert.deepEqual(Array.from(c.meleeSlots()), ['mainhand', 'hand'], '离线退回内置');
  assert.equal(c.Reg.baseAttr('minecraft:player', 'attack_damage', 1), 1);
  c.Reg.meta = {};
  c.Reg.kinds.equipment_slot_groups = { done: true, entries: [{ id: 'any', slots: ['mainhand', 'offhand'] }, { id: 'mainhand', slots: ['mainhand'] }, { id: 'hand', slots: ['mainhand', 'offhand'] }, { id: 'legs', slots: ['legs'] }, { id: 'armor', slots: ['feet', 'legs', 'chest', 'head', 'body'] }] };
  assert.deepEqual(Array.from(c.meleeSlots()), ['mainhand', 'hand'], '含主手的组，不含 any');
  c.Reg.ebase['minecraft:player'] = { 'minecraft:attack_damage': 2, 'minecraft:attack_speed': 3.5 };
  assert.equal(c.Reg.baseAttr('player', 'attack_damage', 1), 2);
  assert.equal(c.Reg.baseAttr('minecraft:player', 'minecraft:attack_speed', 4), 3.5);
  assert.equal(c.Reg.baseAttr('minecraft:player', 'minecraft:luck', 9), 9, '缺属性用调用方给的默认，不当 0');
  c.Reg.meta = null;
}
console.log('PASS melee slot groups and player base attributes.');
