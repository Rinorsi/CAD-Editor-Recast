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
  insertBefore(x,ref){if(x.parentNode)x.remove();const i=ref?this.children.indexOf(ref):-1;if(i<0)this.children.push(x);else this.children.splice(i,0,x);x.parentNode=this;return x;}
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
for(const f of ['data','core','forms','kit','kit2','nbt','xlist','reg','picker','cards1','cards2','cards3','cards5','world','rules','spawn','screens'])vm.runInContext(fs.readFileSync(path.join(dir,f+'.js'),'utf8'),c);
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

// 枚举字段：候选以游戏为准，没到才用内置；校验接受游戏列表里的值
{
  c.Reg.meta = null;
  assert.equal(c.liveEnumOptions('fox/variant', ''), null, '离线没有游戏列表');
  c.Reg.meta = {};
  c.Reg.kinds['enum:fox_variant'] = { done: true, entries: [{ id: 'red', name: 'Red' }, { id: 'snow', name: 'Snow' }, { id: 'ice', name: 'Ice' }] };
  const o = Array.from(c.liveEnumOptions('fox/variant', '')).map(x => x.v);
  assert.deepEqual(o, ['red', 'snow', 'ice'], '游戏新增的值出现在候选里');
  assert.equal(c.liveEnumHas('fox/variant', '', 'ice'), true);
  assert.equal(c.liveEnumHas('fox/variant', '', 'lava'), false);
  assert.equal(c.liveEnumOptions('fox/variant', '.sub'), null, '只对组件本身生效，子路径不套用');
  c.Reg.meta = null;
}
console.log('PASS live enum options.');

// 远程服务器上拿不到完整列表：空列表要说明原因，并保留手动输入
{
  c.Reg.meta = {};
  c.Reg.kinds = {};
  c.Reg.ingest('registry.minecraft:loot_table', { generation: 1, offset: 0, total: 0, entries: [], done: true, availability: 'unavailable', reason: '远程服务器不向客户端同步战利品表' });
  assert.equal(c.Reg.unavailable('loot_table'), '远程服务器不向客户端同步战利品表');
  assert.equal(c.Reg.unavailable('recipe'), null);
  assert.ok(/远程服务器不向客户端同步战利品表.*直接输入/.test(c.emptyReason('', 0, 'loot_table')), '空列表说明原因并指向手动输入');
  assert.ok(/没有匹配/.test(c.emptyReason('abc', 0, 'loot_table')), '有搜索词时仍是没有匹配');
  c.Reg.meta = null; c.Reg.kinds = {};
}
console.log('PASS unavailable registry hint.');

// 文本颜色来自 enum:text_color；标签快捷项只保留游戏里存在的
{
  c.Reg.meta = null;
  assert.equal(Array.from(c.mcColors()).length, 16, '离线用内置 16 色');
  c.Reg.meta = {}; c.Reg.kinds = {};
  c.Reg.kinds['enum:text_color'] = { done: true, entries: [{ id: 'black', name: 'Black', rgb: 0 }, { id: 'gold', name: 'Gold', rgb: 0xFFAA00 }, { id: 'lime', name: 'Lime', rgb: 0x32CD32 }] };
  const cols = Array.from(c.mcColors(), x => Array.from(x));
  assert.deepEqual(cols.map(x => x[0]), ['black', 'gold', 'lime']);
  assert.equal(cols[1][1], 'FFAA00'); assert.equal(cols[1][2], '金色'); assert.equal(cols[2][2], 'Lime', '游戏新增的颜色用它自己的名字');
  assert.equal(c.tcHex('lime'), '#32CD32');
  c.Reg.kinds['tags:damage_type'] = { done: true, entries: [{ id: 'minecraft:is_fire', name: 'is_fire', count: 3 }] };
  const q = [{ v: '' , label: 'x' }, { v: '#minecraft:is_fire', label: 'f' }, { v: '#minecraft:is_gone', label: 'g' }, { v: 'minecraft:cobweb', label: 'w' }];
  assert.deepEqual(Array.from(c.keepKnownTags(q, 'damage_type'), x => x.label), ['x', 'f', 'w'], '不存在的标签被去掉，单个条目与空项保留');
  c.Reg.meta = null; c.Reg.kinds = {};
  assert.equal(c.keepKnownTags(q, 'damage_type').length, 4, '离线原样保留');
}
console.log('PASS live text colors and known-tag quick items.');

// 资源 ID 类注册表：请求名不加 minecraft: 前缀，文件名作显示名
{
  c.Reg.meta = {}; c.Reg.kinds = {};
  assert.equal(c.Reg.isDirect('item_model'), true); assert.equal(c.Reg.isDirect('profile_cape'), true); assert.equal(c.Reg.isDirect('loot_table'), false);
  c.Reg.kinds['item_model'] = { done: true, entries: [{ id: 'mymod:fancy_sword', name: 'mymod:fancy_sword', resource: 'mymod:items/fancy_sword.json' }] };
  const o = c.Reg.options('item_model'); assert.equal(o.length, 1); assert.equal(o[0].v, 'mymod:fancy_sword');
  assert.equal(c.refName('profile_texture', { v: 'minecraft:textures/entity/player/slim/alex.png', label: 'minecraft:textures/entity/player/slim/alex.png' }), 'Alex');
  c.Reg.meta = null; c.Reg.kinds = {};
}
console.log('PASS resource-id registries.');

// 刷怪蛋 / 刷怪笼：数据来自 entity_info / item_meta / spawner_info，写回 block_entity_data（id = 方块实体类型）
{
  let doc, comps; const setDoc = id => { doc = c.makeDoc({ id }); comps = doc.comps; }; setDoc('minecraft:spawner'); c.Store.doc = () => doc;
  const writes = [];
  c.Ctx.doc = () => doc; c.Ctx.get = cid => comps[cid] === undefined ? undefined : JSON.parse(JSON.stringify(comps[cid]));
  c.Ctx.has = cid => comps[cid] !== undefined; c.Ctx.id = () => doc.id.replace('minecraft:', '');
  c.Ctx.setSmart = (cid, v) => { comps[cid] = JSON.parse(JSON.stringify(v)); writes.push([cid, comps[cid]]); };
  c.Ctx.disable = cid => { delete comps[cid]; writes.push([cid, null]); };
  c.Ctx.reset = cid => { delete comps[cid]; writes.push([cid, 'reset']); };
  c.Reg.meta = {}; c.Reg.kinds = {};
  c.Reg.imeta['minecraft:spawner'] = { id: 'minecraft:spawner', block_item: true, block_entity_type: 'minecraft:mob_spawner' };
  c.Reg.imeta['minecraft:trial_spawner'] = { id: 'minecraft:trial_spawner', block_item: true, block_entity_type: 'minecraft:trial_spawner' };
  c.Reg.imeta['minecraft:pig_spawn_egg'] = { id: 'minecraft:pig_spawn_egg', spawn_egg_entity: 'minecraft:pig' };
  c.Reg.defs['minecraft:spawner'] = { id: 'minecraft:spawner', comps: {} };
  assert.equal(c.kindFromFacts('spawner', {}, c.Reg.imeta['minecraft:spawner']), 'spawner');
  assert.equal(c.kindFromFacts('trial_spawner', {}, c.Reg.imeta['minecraft:trial_spawner']), 'spawner');
  assert.equal(c.kindFromFacts('pig_spawn_egg', {}, c.Reg.imeta['minecraft:pig_spawn_egg']), 'spawn');
  const pg = fs.readFileSync(path.join(dir, 'pages.js'), 'utf8');
  assert.ok(pg.includes("PAGES.spawner = [{ id: 'spawner'") && pg.includes("PAGES.spawn = [{ id: 'egg'"), '分页里挂了刷怪蛋 / 刷怪笼卡片');
  c.Reg.kinds['spawner_info'] = { done: true, entries: [
    { id: 'minecraft:mob_spawner', fields: { Delay: { default: 20 }, MinSpawnDelay: { default: 200 }, MaxSpawnDelay: { default: 800 }, SpawnCount: { default: 4 } } },
    { id: 'minecraft:trial_spawner', defaults: { normal_config: { spawn_range: 4, total_mobs: 6 }, ominous_config: { spawn_range: 4, total_mobs: 12 } }, fields: {} }] };

  // 普通刷怪笼：显示游戏默认值；改一个数写出 block_entity_data 且 id 是方块实体类型
  let sp = c.CARDS.spawner();
  const rows = sp.body.querySelectorAll('.k-xrow');
  const titles = rows.map(r => r.querySelector('.z').textContent);
  assert.ok(titles.includes('最短间隔') && titles.includes('每次刷出数量') && titles.includes('当前倒计时'));
  const spawnCount = rows[titles.indexOf('每次刷出数量')].querySelector('.k-numin');
  assert.equal(spawnCount.value, '4', '没写的字段显示游戏默认值');
  spawnCount.value = '9'; spawnCount.fire('input'); spawnCount.fire('change');
  assert.equal(comps.block_entity_data.id, 'minecraft:mob_spawner'); assert.equal(comps.block_entity_data.SpawnCount, 9);
  assert.equal(comps.block_entity_data.SpawnPotentials, undefined, '没动随机池就不写 SpawnPotentials');
  // 试炼刷怪笼
  setDoc('minecraft:trial_spawner');
  sp = c.CARDS.spawner();
  const t2 = sp.body.querySelectorAll('.k-xrow').map(r => r.querySelector('.z').textContent);
  assert.ok(t2.includes('冷却时间') && t2.filter(x => x === '总数量').length === 2, '普通 / 不祥各一套');
  const totals = sp.body.querySelectorAll('.k-xrow').filter(r => r.querySelector('.z').textContent === '总数量').map(r => r.querySelector('.k-numin').value);
  assert.deepEqual(totals, ['6', '12'], '默认值来自游戏的 defaults.normal_config / ominous_config');
  // 刷怪蛋：没有覆盖时显示默认生物；换成别的生物写 entity_data.id
  setDoc('minecraft:pig_spawn_egg');
  c.Reg.einfo['minecraft:pig'] = { id: 'minecraft:pig', attributes: { 'minecraft:max_health': 10, 'minecraft:movement_speed': 0.25 } };
  const egg = c.CARDS.spawnEgg();
  assert.equal(c.eggDefaultEntity(), 'minecraft:pig');
  assert.ok(egg.body.textContent.includes('生命值') && egg.body.textContent.includes('10'), '基础属性来自 entity_info');
  c.Reg.meta = null; c.Reg.kinds = {}; c.Reg.imeta = {}; c.Reg.einfo = {};
}
console.log('PASS spawn egg / spawner / trial spawner cards.');
