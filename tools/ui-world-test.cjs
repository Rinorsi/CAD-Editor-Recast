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
const dir=path.resolve(__dirname,'../common/src/main/resources/assets/cadeditor/ui/js');
for(const f of ['data','core','labels','pinyin-data','search','forms','kit','kit2','nbt','xlist','slots','reg','hostsearch','picker','cards1','cards2','cards3','cards5','world','rules','spawn','eschema','toastkit','screens','worldedit','worldview','worldentity','worldplayer','vault'])vm.runInContext(fs.readFileSync(path.join(dir,f+'.js'),'utf8'),c);
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
let raw=c.kSnbtEditor({keep:1},x=>committed=x,c.worldCompound),ta=raw.querySelector('textarea');
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
  assert.equal(c.refName('profile_texture', { v: 'minecraft:entity/player/slim/alex', label: 'minecraft:entity/player/slim/alex' }), 'Alex');
  assert.equal(c.refName('camera_overlay', { v: 'minecraft:misc/pumpkinblur', label: 'minecraft:misc/pumpkinblur' }), 'Pumpkinblur');
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
  // total_mobs 等是 float：小数不能被取整
  const tm = sp.body.querySelectorAll('.k-xrow').filter(r => r.querySelector('.z').textContent === '总数量')[0].querySelector('.k-numin');
  tm.value = '6.5'; tm.fire('input'); tm.fire('change');
  assert.equal(comps.block_entity_data.normal_config.total_mobs, 6.5, '浮点字段保留小数');
  // 刷怪蛋：没有覆盖时显示默认生物；换成别的生物写 entity_data.id
  setDoc('minecraft:pig_spawn_egg');
  c.Reg.einfo['minecraft:pig'] = { id: 'minecraft:pig', attributes: { 'minecraft:max_health': 10, 'minecraft:movement_speed': 0.25 } };
  const egg = c.CARDS.spawnEgg();
  assert.equal(c.eggDefaultEntity(), 'minecraft:pig');
  const hs = Array.from(c.heroStats(doc, 'spawn'), s => s.label + '=' + s.value);
  assert.ok(hs.includes('生命值=10') && hs.includes('移动速度=0.25'), '基础属性来自 entity_info，显示在左栏属性里：' + hs);
  assert.ok(!egg.body.textContent.includes('基础属性'), '右边不再重复基础属性');
  c.Reg.meta = null; c.Reg.kinds = {}; c.Reg.imeta = {}; c.Reg.einfo = {};
}
console.log('PASS spawn egg / spawner / trial spawner cards.');

// 搜索框：输入时不搜；回车或点「搜索」才搜；清空立即恢复
{
  const input = c.h('input', { class: 'k-input', type: 'text' }); const calls = [];
  const sb = c.kSearchBox(input, v => calls.push(v));
  input.value = 'dia'; input.fire('input'); input.fire('input');
  assert.equal(calls.length, 0, '输入过程中不触发搜索');
  let prevented = false;
  input.events.keydown.forEach(fn => fn({ key: 'Enter', preventDefault() { prevented = true; }, stopPropagation() {} }));
  assert.deepEqual(Array.from(calls), ['dia']); assert.ok(prevented);
  input.value = 'sword'; sb.el.querySelector('.k-sbtn').fire('click');
  assert.deepEqual(Array.from(calls), ['dia', 'sword'], '点按钮搜索');
  input.value = ''; input.fire('input');
  assert.deepEqual(Array.from(calls), ['dia', 'sword', ''], '清空后立即恢复全部');
  input.value = ''; input.fire('input');
  assert.equal(calls.length, 3, '没变化不重复触发');
}
console.log('PASS search box: search only on Enter / button, clear resets.');

// 宿主搜索：发 search、按 requestId 收、旧回应忽略、没回应则退回本地
{
  const sent = []; let timers = [];
  c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  c.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }; c.clearTimeout = () => {};
  c.Reg.meta = {}; c.Reg.kinds = {};
  assert.equal(c.Reg.hostKind('item'), 'items'); assert.equal(c.Reg.hostKind('loot_table'), 'minecraft:loot_table'); assert.equal(c.Reg.hostKind('item_model'), 'item_model');
  const got = [];
  assert.equal(c.HostSearch.query({ view: 'picker', kind: 'items', query: 'zsj', limit: 80 }, r => got.push(r)), true);
  assert.equal(sent[0][0], 'search'); assert.equal(sent[0][1].query, 'zsj'); assert.equal(sent[0][1].view, 'picker');
  const id1 = sent[0][1].requestId;
  // 新请求取代旧请求：旧回应被忽略
  c.HostSearch.query({ view: 'picker', kind: 'items', query: 'dia', limit: 80 }, r => got.push(r));
  const id2 = sent[1][1].requestId;
  c.Reg.ingest('search.result', { requestId: id1, ready: true, entries: [{ id: 'minecraft:old' }] });
  assert.equal(got.length, 0, '被取代的旧请求回应不更新');
  c.Reg.ingest('search.result', { requestId: id2, ready: false, phase: 'building', progress: 3, total: 10 });
  assert.equal(got.length, 0, 'ready:false 继续等');
  c.Reg.ingest('search.result', { requestId: id2, ready: true, total: 1, entries: [{ id: 'minecraft:diamond_sword' }], done: true });
  assert.equal(got.length, 1); assert.equal(got[0].entries[0].id, 'minecraft:diamond_sword'); assert.equal(c.HostSearch.supported, true);
  // 宿主报错（该类别不支持）→ 回退标记
  c.HostSearch.query({ view: 'picker', kind: 'x', query: 'a' }, r => got.push(r));
  c.Reg.ingest('search.result', { requestId: sent[2][1].requestId, ready: false, error: 'UNKNOWN_KIND' });
  assert.equal(got[1].fallback, true); assert.equal(got[1].error, 'UNKNOWN_KIND');
  // 老宿主：第一次就没回应 → 超时退回本地，之后不再等
  c.HostSearch.supported = null; timers = [];
  c.HostSearch.query({ view: 'picker', kind: 'items', query: 'a' }, r => got.push(r));
  timers[timers.length - 1].fn();
  assert.equal(got[2].fallback, true); assert.equal(c.HostSearch.supported, false);
  assert.equal(c.HostSearch.query({ view: 'picker', kind: 'items', query: 'a' }, () => {}), false, '已判定老宿主就不再发');
  c.HostSearch.supported = null; c.Reg.meta = null; c.Reg.kinds = {};
}
console.log('PASS host search client: request supersede, ready:false wait, error/timeout fallback.');

// 选择窗接宿主搜索：搜索词交给宿主，结果 ID 对回已有的行；宿主不支持就本地搜
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  c.setTimeout = (fn) => 1; c.clearTimeout = () => {};
  c.Reg.meta = {}; c.Reg.kinds = {}; c.HostSearch.supported = null; c.HostSearch.views = {};
  c.Reg.ingest('registry.entity_types', { generation: 1, offset: 0, total: 3, done: true, entries: [{ id: 'minecraft:zombie', name: '僵尸' }, { id: 'minecraft:skeleton', name: '骷髅' }, { id: 'minecraft:pig', name: '猪' }] });
  c.openRegPick({ reg: 'entity_type', title: '选择生物', onPick() {} });
  const modal = doc.body.querySelector('.addwin') || doc.body.querySelectorAll('.k-modal')[0] || overlays;
  const inp = overlays.querySelectorAll('input')[0];
  assert.ok(inp, '选择窗有搜索框');
  inp.value = 'jiangshi';
  inp.events.keydown.forEach(fn => fn({ key: 'Enter', preventDefault() {}, stopPropagation() {} }));
  const s = sent.filter(x => x[0] === 'search').pop();
  assert.ok(s, '回车后向宿主发了 search'); assert.equal(s[1].query, 'jiangshi'); assert.equal(s[1].kind, 'entity_types');
  c.Reg.ingest('search.result', { requestId: s[1].requestId, ready: true, total: 1, done: true, entries: [{ id: 'minecraft:zombie', name: '僵尸' }] });
  const rows = overlays.querySelectorAll('.addrow');
  assert.equal(rows.length, 1, '只显示宿主返回的行'); assert.ok(rows[0].textContent.includes('僵尸'));
  // 宿主说不支持这个类别 → 本地过滤
  inp.value = 'pig'; inp.events.keydown.forEach(fn => fn({ key: 'Enter', preventDefault() {}, stopPropagation() {} }));
  const s2 = sent.filter(x => x[0] === 'search').pop();
  c.Reg.ingest('search.result', { requestId: s2[1].requestId, ready: false, error: 'UNKNOWN_KIND' });
  const rows2 = overlays.querySelectorAll('.addrow');
  assert.ok(rows2.length >= 1 && rows2.some(r => r.textContent.includes('猪')), '回退到本地搜索');
  c.Reg.meta = null; c.Reg.kinds = {}; c.HostSearch.supported = null;
}
console.log('PASS picker uses host search with local fallback.');

// lazy-catalog-v1：大目录不在页面里；名字按需精确查询，选择窗直接问宿主
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  let timers = []; c.setTimeout = (fn, ms) => { timers.push(fn); return timers.length; }; c.clearTimeout = () => {};
  const runTimers = () => { const t = timers; timers = []; t.forEach(f => f()); };
  c.Reg.meta = null; c.Reg.kinds = {}; c.Reg.lazy = {}; c.Reg.rows = {}; c.Reg.lookAsked = {}; c.Reg.lookPending = {}; c.Reg.lookBusy = false; c.HostSearch.supported = null; c.HostSearch.views = {};
  overlays.textContent = '';
  // 1) 页面启动先声明 lazy-catalog-v1，且是第一条 registry 消息
  c.Reg.attach();
  assert.equal(sent[0][0], 'registry'); assert.equal(sent[0][1].name, 'client_features'); assert.deepEqual(Array.from(sent[0][1].features), ['lazy-catalog-v1']);
  sent.length = 0;
  // 2) 宿主在 meta 里列出 lazy kind
  c.Reg.ingest('registry.meta', { lazy: { items: { count: 1506 }, blocks: { count: 1100 }, sounds: { count: 1600 }, 'tags:item': { count: 200 } } });
  assert.equal(c.Reg.lazyKind('item'), 'items'); assert.equal(c.Reg.lazyKind('block'), 'blocks'); assert.equal(c.Reg.lazyKind('sound_event'), 'sounds'); assert.equal(c.Reg.lazyKind('tags:item'), 'tags:item'); assert.equal(c.Reg.lazyKind('enchantment'), null);
  // 3) 大目录不会触发整张表的请求；名字走批量 lookup
  assert.equal(Array.from(c.Reg.options('item')).length, 0);
  assert.equal(sent.filter(x => x[0] === 'registry' && x[1].name !== 'component_schema').length, 0, '不请求整张物品表');
  assert.equal(c.Reg.itemName('minecraft:diamond_sword'), null);
  c.Reg.itemName('minecraft:stick'); runTimers();
  const look = sent.filter(x => x[0] === 'search').pop();
  assert.equal(look[1].view, 'lookup'); assert.equal(look[1].kind, 'items'); assert.deepEqual(Array.from(look[1].ids), ['minecraft:diamond_sword', 'minecraft:stick']);
  c.Reg.ingest('search.result', { requestId: look[1].requestId, ready: true, done: true, total: 1, entries: [{ id: 'minecraft:diamond_sword', name: '钻石剑' }], missing: ['minecraft:stick'] });
  assert.equal(c.Reg.itemName('minecraft:diamond_sword'), '钻石剑');
  const before = sent.length; assert.equal(c.Reg.itemName('minecraft:stick'), null); runTimers(); assert.equal(sent.length, before, '查过没有的不再重复问');
  // 4) 选择窗：打开就问宿主要第一页；结果行显示；模组分类带命名空间过滤
  c.openRegPick({ reg: 'item', title: '选择物品', onPick() {} });
  const s1 = sent.filter(x => x[0] === 'search').pop();
  assert.equal(s1[1].kind, 'items'); assert.equal(s1[1].query, '');
  c.Reg.ingest('search.result', { requestId: s1[1].requestId, ready: true, done: true, total: 2, entries: [{ id: 'minecraft:stick', name: '木棍', namespace: 'minecraft' }, { id: 'mymod:wand', name: '魔杖', namespace: 'mymod' }], namespaces: [{ id: 'minecraft', count: 1506 }, { id: 'mymod', count: 12 }] });
  let rows = overlays.querySelectorAll('.addrow'); assert.equal(rows.length, 2); assert.ok(rows[1].textContent.includes('魔杖'));
  const cats = overlays.querySelectorAll('.addcat'); assert.equal(cats.length, 2);
  assert.ok(cats[1].textContent.includes('12'), '模组分类的数量来自宿主 namespaces');
  cats[1].fire('click');
  const s2 = sent.filter(x => x[0] === 'search').pop();
  assert.deepEqual(Array.from(s2[1].filters.namespaces), ['mymod'], '模组分类 = 命名空间过滤');
  // 5) 宿主没回应：给出原因，不是空白
  c.Reg.ingest('search.result', { requestId: s2[1].requestId, ready: false, error: 'UNAVAILABLE' });
  assert.ok(overlays.textContent.includes('UNAVAILABLE'));
  c.Reg.meta = null; c.Reg.lazy = {}; c.Reg.rows = {}; c.HostSearch.supported = null; c.HostSearch.views = {};
}
console.log('PASS lazy catalog: handshake, on-demand lookup, host-driven picker.');

// 提示框预览：用游戏生成的行；没回应 / 出错 / 太大退回近似版
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  let timers = []; c.setTimeout = (fn) => { timers.push(fn); return timers.length; }; c.clearTimeout = () => {};
  c.Reg.meta = {}; c.HostTip.supported = null; c.HostTip.views = {}; c.HostTip.last = {};
  const d = c.makeDoc({ id: 'minecraft:diamond_sword', comps: { custom_name: '测试' } });
  const wrap = c.buildTooltip(d, false);
  const req = sent.filter(x => x[0] === 'tooltip').pop();
  assert.ok(req, '向宿主发了 tooltip'); assert.equal(req[1].view, 'item-preview'); assert.equal(req[1].stack.id, 'minecraft:diamond_sword'); assert.equal(req[1].advanced, false);
  assert.ok(wrap.textContent.length > 0, '结果到之前先显示近似版');
  c.Reg.ingest('tooltip.result', { version: 1, requestId: req[1].requestId, ok: true, partial: false,
    lines: [[{ text: '钻石剑', color: '#55FFFF', bold: false, italic: false, underlined: false, strikethrough: false, obfuscated: false }], [], [{ text: '在主手：', color: '#AAAAAA', bold: false, italic: false, underlined: false, strikethrough: false, obfuscated: false }], [{ text: '+7 攻击伤害', color: '#00AA00', bold: true, italic: false, underlined: false, strikethrough: false, obfuscated: false }]] });
  assert.ok(wrap.textContent.includes('钻石剑') && wrap.textContent.includes('+7 攻击伤害'), '换成游戏给的行');
  assert.equal(wrap.querySelectorAll('.tl').length, 4, '空行保留');
  // 出错 → 近似版
  const w2 = c.buildTooltip(d, true, 'item-preview-big'); const r2 = sent.filter(x => x[0] === 'tooltip').pop();
  c.Reg.ingest('tooltip.result', { requestId: r2[1].requestId, ok: false, error: 'INVALID_STACK', reason: 'x' });
  assert.ok(w2.textContent.length > 0 && !w2.textContent.includes('+7 攻击伤害'), '出错退回近似版');
  // 没回应（老宿主）→ 近似版，之后不再发
  c.HostTip.supported = null; const n0 = sent.length; const w3 = c.buildTooltip(d, false, 'item-preview'); timers[timers.length - 1]();
  assert.equal(c.HostTip.supported, false); const n1 = sent.length; c.buildTooltip(d, false, 'item-preview'); assert.equal(sent.length, n1, '判定老宿主后不再发请求');
  c.Reg.meta = null; c.HostTip.supported = null; c.HostTip.views = {}; c.HostTip.last = {};
}
console.log('PASS tooltip preview: host lines, fallback.');

// 世界编辑：打开方块实体 world，改格子 / SNBT，按契约发 apply，处理回执
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  c.setTimeout = () => 1; c.clearTimeout = () => {};
  const slots = []; for (let i = 0; i < 27; i++) slots.push({ slot: i, stack: { empty: true } });
  slots[0] = { slot: 0, stack: { id: 'minecraft:stick', count: 3, comps: { custom_name: 'x' }, removed: {} } };
  const world = { kind: 'block', type: 'minecraft:chest', block: 'minecraft:chest', block_state: { facing: 'north' }, slot: { kind: 'block', dim: 'minecraft:overworld', x: 1, y: 2, z: 3, token: 'tk' }, revision: 'r1', canUndo: false,
    snbt: '{id:"minecraft:chest",x:1,y:2,z:3,Items:[{Slot:0b,id:"minecraft:stick",count:3}],lock:5L}', nbt: {}, container: { size: 27, kind: 'minecraft:chest', unresolved_loot: false, slots }, views: {} };
  c.KIND_INFO = c.KIND_INFO || {}; c.Store.doc = () => null;
  for (const id of ['win', 'topbar', 'screen', 'footer']) { if (!root.querySelector('#' + id)) { const e = doc.createElement('div'); e.id = id; root.appendChild(e); } }
  c.weOpen(world);
  assert.equal(c.weActive(), true); assert.equal(c.weDirty(), false);
  // 没改就不发
  c.weApply(); assert.equal(sent.filter(x => x[0] === 'apply').length, 0);
  // 改数量（保留组件）+ 放新物品
  c.WE.slots[0] = Object.assign({}, slots[0].stack, { count: 9 });
  c.WE.slots[5] = { id: 'minecraft:apple', count: 1, comps: {}, removed: {} };
  assert.equal(c.weDirty(), true);
  c.weApply();
  const ap = sent.filter(x => x[0] === 'apply').pop()[1];
  assert.equal(ap.slot.token, 'tk'); assert.equal(ap.snbt, undefined, '没改文本就不带 snbt');
  assert.deepEqual(Array.from(ap.container.slots, s => s.slot).sort((a, b) => a - b), [0, 5]);
  assert.equal(ap.container.slots.find(s => s.slot === 0).stack.comps.custom_name, 'x', '没动的组件原样带回');
  // 回执：拒绝保留草稿；通过后收到新 world
  c.weResult({ requestId: ap.requestId, status: 'rejected', code: 'target_changed', reason: '变了' });
  assert.equal(Object.keys(c.WE.slots).length, 2, '拒绝后草稿还在');
  // SNBT 文本改动：类型保真地发出（紧凑）
  c.WE.slots = {}; c.WE.text = c.WE.text.replace('lock: 5L', 'lock: 6L');
  assert.equal(c.weDirty(), true);
  c.WE.lastSendAt = 0; c.weApply(); const ap2 = sent.filter(x => x[0] === 'apply').pop()[1];
  assert.ok(ap2.snbt.includes('lock:6L') && !ap2.snbt.includes('\n'), 'long 保留后缀、紧凑单行');
  // 打印 / 解析往返
  assert.equal(c.nbtPrint(c.nbtParse('{a:1b,b:[B;1b,2b],c:"x y",d:2.5f}'), false), '{a:1b,b:[B;1b,2b],c:"x y",d:2.5f}');
  c.weSaved(Object.assign({}, world, { revision: 'r2', canUndo: true }));
  assert.equal(c.WE.w.canUndo, true); assert.equal(c.weDirty(), false, '收到新 world 后草稿清空');
  c.WE.w = null;
}
console.log('PASS world edit: container slots, typed SNBT apply, rejected keeps draft.');

// 实体 schema：变种 / 开关 / 装备来自游戏采集的真实 entity_schema（docs/entity-schema-examples-26.1.2.json）
{
  const ex = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/entity-schema-examples-26.1.2.json'), 'utf8'));
  const one = k => { const e = ex[k]; return e.entries ? e.entries[0] : e; };
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  c.Reg.meta = {}; c.Reg.kinds = {}; c.Reg.eschema = {}; c.Reg.esAsk = {};
  // 请求：没到之前是 null，只发一次；回来后可用；未知实体 = false；工厂不可用带原因
  assert.equal(c.Reg.entitySchema('cat'), null);
  c.Reg.entitySchema('minecraft:cat');
  assert.deepEqual(sent.filter(x => x[0] === 'registry').map(x => x[1].name + '|' + x[1].id), ['entity_schema|minecraft:cat']);
  c.Reg.ingest('registry.entity_schema', { version: 1, name: 'entity_schema', generation: 'entity-schema-1', id: 'minecraft:cat', offset: 0, total: 1, entries: [one('cat')], done: true });
  assert.equal(c.Reg.entitySchema('cat').id, 'minecraft:cat');
  c.Reg.ingest('registry.entity_schema', { name: 'entity_schema', id: 'mod:nope', entries: [], done: true });
  assert.equal(c.Reg.entitySchema('mod:nope'), false);
  c.Reg.ingest('registry.entity_schema', { name: 'entity_schema', id: 'mod:broken', entries: [], error: '工厂不可用', done: true });
  assert.equal(c.Reg.entitySchema('mod:broken').available, false);
  ['sheep', 'zombie', 'armor_stand'].forEach(k => c.Reg.ingest('registry.entity_schema', { name: 'entity_schema', id: 'minecraft:' + k, entries: [one(k)], done: true }));

  c.realPickFrom = c.pickFrom;
  let data = {}; const panel = type => c.esPanel({ type, get: () => data, set: o => { data = JSON.parse(JSON.stringify(o)); } });
  const row = (el, t) => el.querySelectorAll('.k-xrow').find(r => r.querySelector('.z').textContent === t);
  // 猫：品种 / 项圈 / 幼年 / 没有 AI / 生命值
  let p = panel('minecraft:cat');
  for (const t of ['品种', '项圈颜色', '叫声', '没有 AI', '幼年', '生命值']) assert.ok(row(p, t), '有「' + t + '」');
  const gear = (el, slot) => el.querySelectorAll('.es-slot').find(x => (x.getAttribute('title') || '').indexOf(slot + '：') === 0);
  assert.ok(gear(p, '主手') && gear(p, '头部'), '装备是格子');
  row(p, '没有 AI').querySelector('.k-toggle').fire('click');
  assert.equal(data.NoAI, 1);
  row(p, '没有 AI').querySelector('.k-toggle').fire('click');
  assert.equal(data.NoAI, undefined, '关回默认就不写');
  row(p, '幼年').querySelector('.k-toggle').fire('click');
  assert.equal(data.Age, -24000, '幼年写游戏给的 babyAge，不写探测样本 -1');
  let pickedOpt; c.pickFrom = (a, entries, fn, o) => { pickedOpt = o; fn(entries.find(e => e.v === 'minecraft:red')); };
  row(p, '品种').querySelector('.k-sel').fire('click');
  assert.equal(data.variant, 'minecraft:red');
  assert.ok(pickedOpt.manual && pickedOpt.manual.parse('spotted') === 'minecraft:spotted', '搜索框兼做手动输入，短 ID 补 minecraft:');
  assert.throws(() => pickedOpt.manual.parse('Bad ID'));
  // 项圈颜色：16 种染料 → 色块；点橙色写回游戏给的数值 1
  assert.ok(!row(p, '项圈颜色').querySelector('.k-sel'), '颜色不用下拉');
  row(p, '项圈颜色').querySelector('.k-btn').fire('click');
  overlays.querySelectorAll('.ed-dye').find(x => /^orange /.test(x.getAttribute('title'))).fire('click');
  assert.equal(data.CollarColor, 1);
  // 名字：文本组件，清空就删掉
  const nameIn = row(p, '名字').querySelector('input'); nameIn.value = '小黑'; nameIn.fire('input');
  assert.equal(data.CustomName, '小黑', 'plain text must use the vanilla canonical string form');
  data.CustomName = { text: '旧名', color: 'red', bold: true };
  nameIn.value = '新名'; nameIn.fire('input');
  assert.deepEqual(data.CustomName, { text: '新名', color: 'red', bold: true }, 'styled names retain their formatting');
  nameIn.value = ''; nameIn.fire('input'); assert.equal(data.CustomName, undefined);
  // 装备：主手放钻石剑
  c.pickItem = (a, fn) => fn('diamond_sword');
  gear(p, '主手').fire('click');
  assert.deepEqual(data.equipment.mainhand, { id: 'minecraft:diamond_sword', count: 1 });
  assert.ok(/钻石剑|Diamond Sword/.test(gear(p, '主手').getAttribute('title')), '格子显示放进去的物品');
  // 盔甲架：手持槽需要先显示手臂，选物品时一并写上
  data = {}; p = panel('minecraft:armor_stand');
  assert.ok(/显示手臂/.test(gear(p, '主手').getAttribute('title')));
  gear(p, '主手').fire('click');
  assert.equal(data.ShowArms, 1); assert.equal(data.equipment.mainhand.id, 'minecraft:diamond_sword');
  // 共用整数的变种按 mask 合并（马的毛色与斑纹都在 Variant 里）
  const horse = { id: 'minecraft:horse', available: true, variants: [
    { id: 'minecraft:horse/variant', kind: 'enum', nbt: { path: ['Variant'], valueFormat: 'snbt', mask: 7 }, default: 0, options: [{ value: 0, snbt: '0', label: 'white' }, { value: 2, snbt: '2', label: 'chestnut' }] },
    { id: 'horse/markings', kind: 'enum', nbt: { path: ['Variant'], valueFormat: 'snbt', mask: 1792 }, default: 0, options: [{ value: 0, snbt: '0', label: 'none' }, { value: 512, snbt: '512', label: 'white_field' }] }], equipment: [], flags: [] };
  c.Reg.eschema['minecraft:horse'] = horse;
  data = { Variant: 512 }; p = panel('minecraft:horse');
  c.pickFrom = (a, entries, fn) => fn(entries.find(e => e.v === 2));
  p.querySelectorAll('.k-sel')[0].fire('click');
  assert.equal(data.Variant, 514, '改毛色不覆盖斑纹');
  // 史莱姆：范围大的整数用数字框，显示的是实际尺寸，保存值 = 尺寸 - 1
  c.Reg.eschema['minecraft:slime'] = { id: 'minecraft:slime', available: true, equipment: [], flags: [], variants: [{ id: 'slime/size', kind: 'int', nbt: { path: ['Size'], mask: 127 }, default: 0, min: 0, max: 126, semanticMin: 1, semanticMax: 127, options: Array.from({ length: 127 }, (_, i) => ({ value: i, snbt: String(i), label: String(i + 1) })) }] };
  data = {}; p = panel('minecraft:slime');
  const sz = row(p, '大小').querySelector('.k-numin'); assert.equal(sz.value, '1');
  sz.value = '5'; sz.fire('input'); sz.fire('change'); assert.equal(data.Size, 4);
  // 离线 / 读不到：说明原因，不画假选项
  { const sendBak = c.oriel.send;
    c.Reg.meta = null; c.oriel.send = undefined; p = panel('minecraft:cat'); assert.ok(/没有连接游戏/.test(p.textContent), '没有宿主才说没连接');
    c.oriel.send = sendBak; c.Reg.esAt = {}; p = panel('minecraft:cat'); assert.ok(/正在向游戏读取/.test(p.textContent) && !/没有连接游戏/.test(p.textContent), '有宿主但注册表还没到：算正在读取，不说没连接');
    c.Reg.meta = {}; }
  p = panel('mod:broken'); assert.ok(/工厂不可用/.test(p.textContent));

  // 刷怪蛋页：上面控件管的字段不在「其他数据」里重复，原始字段改不了它们
  let doc2 = c.makeDoc({ id: 'minecraft:cat_spawn_egg' }); const comps = doc2.comps;
  c.Store.doc = () => doc2; c.Ctx.doc = () => doc2; c.Ctx.get = cid => comps[cid] === undefined ? undefined : JSON.parse(JSON.stringify(comps[cid]));
  c.Ctx.setSmart = (cid, v) => { comps[cid] = JSON.parse(JSON.stringify(v)); };
  c.Reg.imeta['minecraft:cat_spawn_egg'] = { id: 'minecraft:cat_spawn_egg', spawn_egg_entity: 'minecraft:cat' };
  c.Reg.einfo['minecraft:cat'] = { id: 'minecraft:cat', attributes: {} };
  comps.entity_data = { id: 'minecraft:cat', NoAI: 1, Tag: 'keep' };
  const eggD = c.CARDS.eggData(), eggF = c.CARDS.eggFlags();
  const mapTitles = eggD.body.querySelectorAll('.world-map')[0].querySelectorAll('.z').map(x => x.textContent);
  assert.deepEqual(mapTitles, ['Tag'], 'NoAI 由开关管，不在原始字段里重复');
  assert.ok(/猫|Cat/.test(c.CARDS.spawnEgg().body.textContent), '生成的生物：名字和更换按钮');
  assert.ok(c.CARDS.eggGear().body.querySelector('.es-geargrid'), '装备页是格子');
  row(eggF.body, '静音').querySelector('.k-toggle').fire('click');
  assert.deepEqual(comps.entity_data, { id: 'minecraft:cat', NoAI: 1, Tag: 'keep', Silent: 1 }, '开关写入并保留其他字段');

  // 世界实体页：「属性」页改开关，写回的 SNBT 保留原有类型（Health 仍是 float，UUID 仍是 int 数组）
  for (const id of ['win', 'topbar', 'screen', 'footer']) { if (!root.querySelector('#' + id)) { const e = doc.createElement('div'); e.id = id; root.appendChild(e); } }
  c.Store.doc = () => null;
  const w = { kind: 'entity', type: 'minecraft:cat', slot: { kind: 'entity', uuid: 'u', token: 'tk' }, revision: 'r1', canUndo: false,
    snbt: '{id:"minecraft:cat",Health:10.0f,UUID:[I;1,2,3,4],Pos:[1.0d,64.0d,2.0d],variant:"minecraft:black"}', nbt: {} };
  c.weOpen(w);
  assert.ok(c.weTabs().some(t => t.id === 'entity'));
  c.WE.tab = 'entity'; c.weRender();
  const scr = root.querySelector('#screen');
  row(scr, '没有 AI').querySelector('.k-toggle').fire('click');
  assert.ok(c.weDirty());
  const txt = c.nbtPrint(c.nbtParse(c.WE.text), false);
  assert.ok(txt.includes('NoAI:1') && txt.includes('Health:10.0f') && txt.includes('UUID:[I;1,2,3,4]') && txt.includes('Pos:[1.0d,64.0d,2.0d]'), txt);
  // 先在「数据」页改文本，再切到「属性」页：文本里的改动不丢
  c.weOpen(w); c.WE.text = c.WE.text.replace('Health: 10.0f', 'Health: 3.0f'); c.WE.obj = null; c.WE.tab = 'entity'; c.weRender();
  row(root.querySelector('#screen'), '静音').querySelector('.k-toggle').fire('click');
  assert.ok(c.nbtPrint(c.nbtParse(c.WE.text), false).includes('Health:3.0f'), '数据页的改动保留');
  c.WE.w = null; c.Reg.meta = null; c.Reg.kinds = {}; c.Reg.eschema = {}; c.Reg.imeta = {}; c.Reg.einfo = {};
}
  // 弹出选择：搜索框固定在顶上（列表自己滚动）；回车时没有完全匹配就按手动值写入，完全匹配就选那一项
  {
    let got; c.realPickFrom(overlays, [{ v: 'minecraft:red', label: 'Red' }, { v: 'minecraft:tabby', label: 'Tabby' }], e => { got = e; }, { manual: { parse: t => 'mod:' + t } });
    const pop = overlays.querySelectorAll('.k-pop').pop(), inp = pop.querySelector('input'), lst = pop.querySelector('.k-plist');
    assert.equal(lst.style.overflowY, 'auto'); assert.equal(pop.style.overflowY, 'hidden');
    inp.value = 'spotted'; inp.fire('input');
    assert.ok(/回车写入「spotted」/.test(lst.textContent));
    inp.events.keydown.forEach(fn => fn({ key: 'Enter', preventDefault() {}, stopPropagation() {} }));
    assert.equal(got.v, 'mod:spotted'); assert.equal(got.manual, true);
    c.realPickFrom(overlays, [{ v: 'minecraft:red', label: 'Red' }], e => { got = e; }, { manual: { parse: t => 'mod:' + t } });
    const inp2 = overlays.querySelectorAll('.k-pop').pop().querySelector('input'); inp2.value = 'red';
    inp2.events.keydown.forEach(fn => fn({ key: 'Enter', preventDefault() {}, stopPropagation() {} }));
    assert.equal(got.v, 'minecraft:red', '完全匹配就选那一项');
  }
  c.pickFrom = c.realPickFrom;
console.log('PASS entity schema: request/cache, variants with mask merge, flags, baby age, name component, equipment requires, spawn egg raw dedupe, world entity typed write-back.');

// 刷怪蛋 3D 预览的 <entity> 属性：真实实体组件 + 幼年 + 装备，来自 entity_data 与 schema
{
  const ex = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/entity-schema-examples-26.1.2.json'), 'utf8'));
  c.Reg.meta = {}; c.Reg.eschema = { 'minecraft:cat': ex.cat.entries ? ex.cat.entries[0] : ex.cat };
  const a = c.esPreviewAttrs('minecraft:cat', { variant: 'minecraft:red', CollarColor: 1, Age: -24000, equipment: { head: { id: 'minecraft:diamond_helmet', count: 1 } } });
  assert.equal(a.baby, ''); assert.equal(a.head, 'minecraft:diamond_helmet');
  assert.ok(a.components.includes('"minecraft:cat/variant":"minecraft:red"') && a.components.includes('"minecraft:cat/collar":"orange"'), a.components);
  assert.deepEqual(Object.keys(c.esPreviewAttrs('minecraft:cat', {})), [], '没设置就不带属性');
  c.Reg.meta = null; c.Reg.eschema = {};
}
console.log('PASS spawn egg 3D preview attributes.');

// 刷怪蛋 3D 生物：同一只生物重画沿用元素；滚轮缩放、右键拖动移动；换生物回到默认
{
  c.Reg.meta = {}; c.UI.entView = null;
  let el = c.heroEntity('minecraft:cat', { Age: -24000 }, null);
  assert.equal(el.getAttribute('baby'), '');
  el.events.wheel.forEach(fn => fn({ deltaY: -24, preventDefault() {}, stopPropagation() {} }));
  assert.ok(c.UI.entView.s > 1 && /-mc-model-scale:0\.383/.test(el.getAttribute('style')), el.getAttribute('style'));
  el.events.mousedown.forEach(fn => fn({ button: 2, clientX: 10, clientY: 10, preventDefault() {} }));
  doc.events = doc.events || {};
  const again = c.heroEntity('minecraft:cat', {}, el);
  assert.equal(again, el, '同一只生物沿用元素（转过的角度不丢）');
  assert.equal(again.getAttribute('baby'), null, '取消幼年后去掉属性');
  assert.ok(c.UI.entView.s > 1, '缩放在重画后保留');
  const dog = c.heroEntity('minecraft:wolf', {}, el);
  assert.notEqual(dog, el); assert.equal(c.UI.entView.s, 1, '换生物回到默认视角');
  c.Reg.meta = null; c.UI.entView = null;
}
console.log('PASS spawn egg 3D viewer: reuse, wheel zoom, pan start, reset on type change.');

// 生物的图：来自 item_meta.spawn_egg_entity 的刷怪蛋（含模组），没有蛋用爪印
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  c.Reg.meta = {}; c.Reg.imeta = {}; c.Reg.eggMap = null; c.Reg.eggAsk = false;
  assert.equal(c.Reg.eggFor('minecraft:pig'), null, '数据没到前没有');
  assert.ok(sent.some(x => x[0] === 'registry' && x[1].name === 'item_meta'), '只请求一次全表');
  c.Reg.eggFor('minecraft:cow'); assert.equal(sent.filter(x => x[0] === 'registry' && x[1].name === 'item_meta').length, 1);
  c.Reg.ingest('registry.item_meta', { generation: 1, offset: 0, total: 2, done: true, entries: [{ id: 'minecraft:pig_spawn_egg', spawn_egg_entity: 'minecraft:pig' }, { id: 'mymod:wolf_egg', spawn_egg_entity: 'mymod:wolf' }, { id: 'minecraft:stick' }] });
  assert.equal(c.Reg.eggFor('minecraft:pig'), 'minecraft:pig_spawn_egg'); assert.equal(c.Reg.eggFor('mymod:wolf'), 'mymod:wolf_egg'); assert.equal(c.Reg.eggFor('minecraft:arrow'), null);
  c.Reg.meta = null; c.Reg.imeta = {}; c.Reg.eggMap = null;
}
console.log('PASS entity icons from spawn eggs.');

// 保险库：协议往返、分段上传、get 超限走 export、嵌套栈转换、窗口列表
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  let timers = []; c.setTimeout = (fn) => { timers.push(fn); return timers.length; }; c.clearTimeout = () => {};
  const last = op => sent.filter(x => x[0] === 'vault' && x[1].op === op).pop()[1];
  const reply = (req, extra) => c.Reg.ingest('vault.result', Object.assign({ version: 1, requestId: req.requestId, op: req.op, ok: true }, extra));
  c.Reg.meta = {};
  // 保存小栈：一条消息；重复回执
  let got; c.Vault.save({ id: 'minecraft:stick', count: 1, comps: {}, removed: {} }, { name: '棍', tags: ['a'], note: '' }, r => got = r);
  const s1 = last('save'); assert.equal(s1.name, '棍'); assert.equal(s1.note, undefined, '空字段不发'); reply(s1, { entry: { id: 'x', name: '棍' }, duplicate: true, persisted: false });
  assert.equal(got.duplicate, true); assert.equal(c.Vault.st.persisted, false);
  // 保存大栈：先分段上传，再带 uploadToken 保存；分段不切开代理对
  const big = { id: 'minecraft:stick', count: 1, comps: { custom_data: { s: '𠮷'.repeat(4000) } }, removed: {} };
  got = null; c.Vault.save(big, { name: '大' }, r => got = r);
  let up = last('upload'); assert.ok(up.text.length <= 2800);
  const parts = [];
  for (let i = 0; i < 20 && !got; i++) { up = sent.filter(x => x[0] === 'vault' && x[1].op === 'upload').pop()[1]; if (parts.length && parts[parts.length - 1] === up.requestId) break; parts.push(up.requestId); reply(up, { token: 'T', chars: up.text.length, expires: 1 }); const nx = sent[sent.length - 1][1]; if (nx.op === 'save') { assert.equal(nx.uploadToken, 'T'); reply(nx, { entry: { id: 'y', name: '大' } }); } }
  assert.ok(got && got.ok, '大栈走分段上传后保存成功');
  const uploaded = sent.filter(x => x[0] === 'vault' && x[1].op === 'upload').map(x => x[1].text).join('');
  assert.equal(JSON.parse(uploaded).comps.custom_data.s, '𠮷'.repeat(4000), '分段拼回去与原文一致');
  // get 超限 → 按 export 分页拼
  got = null; c.Vault.take('id1', r => got = r);
  reply(last('get'), { ok: false, error: 'RESPONSE_LIMIT', reason: 'x' });
  const ex1 = last('export'); assert.deepEqual(Array.from(ex1.ids), ['id1']); reply(ex1, { text: '{"version":1,"entries":[{"id":"id1","stack":{"id":"minecraft:ap', offset: 0, nextOffset: 50, done: false, revision: 3 });
  const ex2 = last('export'); assert.equal(ex2.offset, 50); reply(ex2, { text: 'ple","count":1,"comps":{},"removed":{}}}]}', offset: 50, nextOffset: 90, done: true, revision: 3 });
  assert.ok(got.ok && got.stack.id === 'minecraft:apple', 'export 分页拼回完整栈');
  // 嵌套转换：comps → components（完整 ID），removed → !ID，带类型的值登记
  const nested = c.vaultNested({ id: 'minecraft:stick', count: 2, comps: { custom_data: { n: 5 }, enchantments: { sharpness: 3 } }, removed: { lore: {} }, component_snbt: { custom_data: '{n:5L}' } });
  assert.equal(nested.count, 2); assert.equal(nested.components['minecraft:custom_data'].n, 5); assert.ok(nested.components['!minecraft:lore']);
  assert.equal(c.nbtMerge({ n: 5 }, null), '{n:5L}', '带类型的值被登记，提交时按 long 输出'); c.nbtSeenClear();
  // 窗口：列表显示条目，行里有“给我”
  overlays.textContent = ''; for (const id of ['win', 'topbar', 'screen', 'footer']) if (!root.querySelector('#' + id)) { const e = doc.createElement('div'); e.id = id; root.appendChild(e); }
  c.Store.docs = c.Store.docs || [];
  c.openVault();
  const lr = last('list'); reply(lr, { entries: [{ id: 'e1', name: '火焰剑', tags: ['武器'], note: '', item: { id: 'minecraft:diamond_sword', count: 1 }, summary: { enchantCount: 2, hasCustomName: true } }], total: 1, offset: 0, nextOffset: 1, done: true, persisted: true });
  assert.ok(overlays.textContent.includes('火焰剑') && overlays.textContent.includes('附魔 2'), '列表显示名称与摘要');
  const btns = overlays.querySelectorAll('.k-btn').map(b => b.textContent); assert.ok(btns.includes('给我') && btns.includes('导入…') && btns.includes('导出全部'));
  c.Reg.meta = null; c.Vault.wait = {};
}
console.log('PASS vault: protocol, upload, export fallback, nested conversion, window.');

// 保险库取出放进容器：整个组件改用 SNBT，里面的 long 类型保住
{
  c.nbtSeenClear();
  const item = c.vaultNested({ id: 'minecraft:stick', count: 1, comps: { custom_data: { n: 5 } }, removed: {}, component_snbt: { custom_data: '{n:5L}' } });
  c.NBT_FORCE.container = true;
  const d = { base: JSON.stringify({ comps: {} }), comps: { container: [{ slot: 0, item }] }, snbt: {} };
  const out = c.nbtApplyFormats(d);
  assert.equal(out.formats.container, 'snbt'); assert.ok(String(out.comps.container).includes('n:5L'), '嵌套物品组件里的 long 保住');
  assert.ok(String(out.comps.container).includes('"minecraft:custom_data"'), '组件键是完整 ID');
  c.nbtSeenClear(); assert.equal(Object.keys(c.NBT_FORCE).length, 0, '保存成功后清空');
}
console.log('PASS vault take-out into container keeps typed values.');

// 生物属性 / 体型 / 效果 / 标签：来自真实 entity_schema，改默认值就不写
{
  const ex = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/entity-schema-examples-26.1.2.json'), 'utf8'));
  const z = ex.zombie.entries ? ex.zombie.entries[0] : ex.zombie;
  assert.ok((z.attributes || []).some(a => a.id === 'minecraft:scale'), '例子里有体型属性');
  let data = { id: 'minecraft:zombie', Health: 20 }; const writes = [];
  const o = { get: () => data, set: v => { data = v; writes.push(v); }, redraw() {} };
  const el = c.esAttrList(z, o);
  const rows = el.querySelectorAll('.k-xrow'); const titles = rows.map(r => r.querySelector('.z').textContent);
  assert.equal(titles[0], '体型', '体型排第一');
  const inputOf = t => rows[titles.indexOf(t)].querySelector('.k-numin');
  const sc = inputOf('体型'); sc.value = '2'; sc.fire('input'); sc.fire('change');
  assert.deepEqual(JSON.parse(JSON.stringify(data.attributes)), [{ id: 'minecraft:scale', base: 2 }], '体型写成 attributes 里的一项');
  sc.value = '1'; sc.fire('input'); sc.fire('change');
  assert.equal(data.attributes, undefined, '改回默认就不写，整个 attributes 也去掉');
  // 最大生命降到比当前生命低 → 生命一起压下来
  const mh = titles.indexOf('最大生命值') >= 0 ? '最大生命值' : titles.find(t => /生命/.test(t));
  if (mh) { const m = inputOf(mh); m.value = '8'; m.fire('input'); m.fire('change'); assert.equal(data.Health, 8, '生命不超过新的最大生命'); }
  // 体型对预览的倍数
  data = { attributes: [{ id: 'minecraft:scale', base: 4 }] }; assert.equal(c.esAttrScale(data, z), 4);
  // 别的字段（modifiers）原样保留
  data = { attributes: [{ id: 'minecraft:scale', base: 3, modifiers: [{ id: 'x', amount: 1, operation: 'add_value' }] }] };
  const el2 = c.esAttrList(z, o); const r2 = el2.querySelectorAll('.k-xrow'); const i2 = r2.find(r => r.querySelector('.z').textContent === '体型').querySelector('.k-numin');
  i2.value = '1'; i2.fire('input'); i2.fire('change');
  assert.ok(data.attributes && data.attributes[0].modifiers && data.attributes[0].base === undefined, '改回默认只去掉 base，modifiers 保留');
  assert.ok(c.esAttrBase({}, z.attributes[0]) === z.attributes[0].base);
  // 标签
  data = {}; const tr = c.esTagsRow(z, o);
  if (tr) { const inp = tr.querySelector('input'); inp.value = 'a，b c'; inp.fire('change'); assert.deepEqual(JSON.parse(JSON.stringify(data.Tags)), ['a', 'b', 'c']); }
}
console.log('PASS entity attributes, scale, tags.');

// 撤销历史：按体积限制（大物品不会让历史无限占内存），小物品仍保留 200 步
{
  const mk = n => c.makeDoc({ id: 'minecraft:stick', comps: { custom_data: { blob: 'x'.repeat(n) } } });
  c.Store.docs.length = 0; c.Store.docs.push(mk(100000)); c.Store.cur = 0;
  const d = c.Store.docs[0];
  for (let i = 0; i < 200; i++) { d.comps.custom_data.blob = 'y'.repeat(100000 - i); c.Store.set('custom_data', d.comps.custom_data, { structural: false, key: 'k' + i }); }
  const total = d.hist.reduce((s, x) => s + x.snap.length, 0);
  assert.ok(d.hist.length <= 200 && d.hist.length >= 20, '至少留 20 步: ' + d.hist.length);
  assert.ok(total <= 3200000, '总体积有上限: ' + total);
  c.Store.docs.length = 0;
  const small = c.makeDoc({ id: 'minecraft:stick', comps: {} }); c.Store.docs.push(small);
  for (let i = 0; i < 250; i++) c.Store.set('custom_data', { n: i }, { structural: false, key: 'z' + i });
  assert.equal(small.hist.length, 200, '小物品仍是 200 步');
  c.Store.docs.length = 0;
}
console.log('PASS undo history is bounded by size and by steps.');

// 提示框预览：收纳袋内容按图格画
{
  const box = c.h('div', { class: 'ed-tip' });
  c.paintHostTip(box, { ok: true, lines: [[{ text: '收纳袋', color: '#FFFFFF' }]], extra: [{ type: 'bundle', count: 2, selectedIndex: -1, items: [{ id: 'minecraft:diamond', count: 3, name: 'Diamond' }, { id: 'minecraft:apple', count: 2, name: 'Apple' }], truncated: false }] });
  const cells = box.querySelectorAll('.slot'); assert.equal(cells.length, 2, '两格内容'); assert.ok(cells[0].querySelector('.cnt').textContent === '3');
}
console.log('PASS tooltip bundle grid.');

// 游戏里有、编辑器没有表单的组件（其他模组）：登记后能加、能编辑、不报“不存在”
{
  const n0 = c.EDATA.comps.length;
  c.Reg.ingest('registry.data_component_types', { generation: 1, offset: 0, total: 3, done: true, entries: [{ id: 'minecraft:damage', name: '耐久' }, { id: 'mymod:charge', name: '充能' }, { id: 'mymod:plain_thing', name: 'mymod:plain_thing' }] });
  assert.equal(c.EDATA.comps.length, n0 + 2, '只登记不认识的');
  const m = c.CIDX['mymod:charge']; assert.ok(m && m.live && m.name === '充能' && m.schema.t === 'raw');
  assert.equal(c.CIDX['mymod:plain_thing'].name, 'Plain Thing');
  const d = c.makeDoc({ id: 'minecraft:stick', comps: { 'mymod:charge': { energy: 5 } } });
  const out = []; c.validateDoc(d).forEach(p => out.push(p));
  assert.ok(!out.some(p => /不存在/.test(p.msg) && p.cid === 'mymod:charge'), '不再报不存在');
  assert.ok(c.stackString(d).indexOf('mymod:charge={energy:5}') >= 0 || c.stackString(d).indexOf('mymod:charge=') >= 0);
  c.Reg.ingest('registry.data_component_types', { generation: 1, offset: 0, total: 3, done: true, entries: [{ id: 'mymod:charge', name: '充能' }] });
  assert.equal(c.EDATA.comps.length, n0 + 2, '重复到达不重复登记');
}
console.log('PASS live-only (mod) components are registered and editable.');

// 数值范围以游戏真实 Codec 为准：component_schema 的 ranges_for_ui 覆盖内置表
{
  const sec = () => c.CIDX.use_cooldown.schema.f.filter(f => f.k === 'seconds')[0].s;
  c.Reg.ingest('registry.component_schema', { name: 'component_schema', generation: 1, offset: 0, total: 1, done: true, entries: [
    { id: 'minecraft:use_cooldown', ranges_for_ui: [{ path: '$.seconds', min: 0, max: 3.4028235e38, default: null, min_exclusive: true }] },
    { id: 'minecraft:nope', ranges_for_ui: [{ path: '$', min: 1, max: 2 }] }] });
  assert.equal(sec().min, 0); assert.equal(sec().minEx, true); assert.equal(sec().max, undefined, '超过 float 的上限视为不限');
  const out = []; c.validateValue(sec(), 0, '$.seconds', out, 'use_cooldown'); assert.ok(out.some(p => /必须大于/.test(p.msg)), '0 不被接受');
  const ok = []; c.validateValue(sec(), 0.5, '$.seconds', ok, 'use_cooldown'); assert.equal(ok.length, 0);
  assert.ok(c.Reg.kinds.component_schema === undefined, '不把整张结构表存进内存');
  assert.equal(JSON.stringify(c.liveRangeTokens('$.damage_reductions[].horizontal_blocking_angle')), JSON.stringify(['damage_reductions', '[]', 'horizontal_blocking_angle']));
}
console.log('PASS live component ranges override hand-written ones.');

// 世界方块：规范化视图（告示牌 / 熔炉 / 命令块）+ 方块状态 + 命令块模式，按契约发 apply
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  const mk = (type, extra) => Object.assign({ kind: 'block', type, block: type, slot: { kind: 'block', dim: 'minecraft:overworld', x: 1, y: 2, z: 3, token: 't' }, revision: 'r', canUndo: false, has_block_entity: true,
    snbt: '{id:"' + type + '",x:1,y:2,z:3}', nbt: {}, views: {} }, extra);
  const sign = mk('minecraft:sign', { block: 'minecraft:oak_sign', block_state_schema: [{ name: 'rotation', type: 'int', values: ['0', '1', '2'], default: '8', current: '1' }, { name: 'waterlogged', type: 'boolean', values: ['true', 'false'], default: 'false', current: 'false' }],
    views: { sign: { value: { front_text: { messages: ['a', '', '', ''], color: 'black', has_glowing_text: false }, back_text: { messages: ['', '', '', ''], color: 'black', has_glowing_text: false }, is_waxed: true }, schema: { fields: { front_text: { messages_length: 4 } } } } } });
  c.weOpen(sign);
  assert.equal(c.weTabs()[0].id, 'view'); assert.equal(c.weTabs()[1].id, 'state'); assert.equal(c.weDirty(), false);
  c.WE.tab = 'view'; c.weRender();
  // 涂蜡的牌子改字：同一笔取消涂蜡
  const ins = c.$('screen').querySelectorAll('input'); assert.ok(ins.length >= 4);
  ins[1].value = '你好'; ins[1].fire('change');
  assert.equal(c.weDirty(), true);
  c.WE.bstate.waterlogged = 'true';
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); const ap = sent.filter(x => x[0] === 'apply').pop()[1];
  assert.equal(ap.views.sign.front_text.messages[1], '你好'); assert.equal(ap.views.sign.front_text.messages[0], 'a', '其他行原样带上');
  assert.equal(ap.views.sign.is_waxed, false, '改字同时取消涂蜡'); assert.equal(ap.block_state.waterlogged, 'true');
  assert.equal(ap.block_state.rotation, undefined, '没改的属性不发'); assert.equal(ap.snbt, undefined);
  // 改回原值 = 不再算修改
  c.weSaved(sign); assert.equal(c.weDirty(), false);
  c.weSetV('sign', 'is_waxed', false); assert.equal(c.weDirty(), true); c.weSetV('sign', 'is_waxed', true); assert.equal(c.weDirty(), false);
  // 命令块：模式 + 通知相邻方块
  const cb = mk('minecraft:command_block', { block_type_schema: ['minecraft:command_block', 'minecraft:repeating_command_block', 'minecraft:chain_command_block'],
    block_state_schema: [{ name: 'conditional', type: 'boolean', values: ['true', 'false'], default: 'false', current: 'false' }],
    views: { command_block: { value: { Command: '', TrackOutput: true, auto: false, powered: false }, schema: { fields: {} } } } });
  c.weOpen(cb); c.WE.btype = 'minecraft:repeating_command_block'; c.WE.upd = false; c.weSetV('command_block', 'Command', 'say hi');
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); const ap2 = sent.filter(x => x[0] === 'apply').pop()[1];
  assert.equal(ap2.block_type, 'minecraft:repeating_command_block'); assert.equal(ap2.updateNeighbors, false); assert.equal(ap2.views.command_block.Command, 'say hi');
  c.WE.upd = true;
  // 没有方块实体的普通方块：只有状态页，不给数据页
  const door = mk('minecraft:oak_door', { has_block_entity: false, block_state_schema: [{ name: 'open', type: 'boolean', values: ['true', 'false'], default: 'false', current: 'false' }] });
  c.weOpen(door); assert.equal(JSON.stringify(c.weTabs().map(t => t.id)), '["state"]');
  c.WE.tab = 'state'; c.weRender();
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); assert.equal(sent.filter(x => x[0] === 'apply').pop()[1], ap2, '没改就不发');
  // 熔炉：只发改过的进度字段
  const fu = mk('minecraft:furnace', { views: { furnace: { value: { cooking_time_spent: 0, cooking_total_time: 0, lit_time_remaining: 0, lit_total_time: 0 }, schema: { fields: { cooking_time_spent: { min: -32768, max: 32767 } } } } } });
  c.weOpen(fu); c.weSetV('furnace', 'lit_time_remaining', 100); c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply();
  const ap3 = sent.filter(x => x[0] === 'apply').pop()[1]; assert.equal(JSON.stringify(ap3.views), '{"furnace":{"lit_time_remaining":100}}');
  c.WE.w = null;
}
console.log('PASS block views, block state, command block mode, volatile-friendly diffs.');

// 世界实体：盔甲架姿势 / 展示框 / 展示实体 / 交易 / 乘客，按契约发 apply.entity 与 apply.riding
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  const last = () => sent.filter(x => x[0] === 'apply').pop()[1];
  const mk = (type, views) => ({ kind: 'entity', type, slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', token: 't' }, revision: 'r', canUndo: false, snbt: '{id:"' + type + '"}', nbt: {}, views });
  const riding = { passengers: [{ type: 'minecraft:cat', uuid: 'cat-1', summary: 'Cat', passengers: [] }], vehicle: null, rideCheck: {} };
  const stand = mk('minecraft:armor_stand', { pose: { Head: [10, 20, 30], Body: [0, 0, 0], LeftArm: [-10, 0, -10], RightArm: [-15, 0, 10], LeftLeg: [-1, 0, -1], RightLeg: [1, 0, 1], Marker: false, Small: false, ShowArms: false, Invisible: false, NoBasePlate: false, schema: { fields: { Head: { default: [0, 0, 0] } } } }, riding });
  c.weOpen(stand); assert.deepEqual(Array.from(c.weTabs(), t => t.id), ['pose', 'entity', 'riding', 'data']);
  c.WE.tab = 'pose'; c.weRender();
  assert.equal(c.evVal('pose').Head[1], 20); assert.equal(c.evVal('pose').schema, undefined, 'schema 不当数据');
  c.evSet('pose', 'Head', [10, 45, 30]); c.evSet('pose', 'ShowArms', true);
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); const ap = last();
  assert.equal(JSON.stringify(ap.entity.pose), '{"Head":[10,45,30],"ShowArms":true}', '只发改过的'); assert.equal(ap.snbt, undefined);
  c.evSet('pose', 'Head', [10, 20, 30]); c.evSet('pose', 'ShowArms', false); assert.equal(c.weDirty(), false, '改回原值不算改');
  // 乘客：独立 apply.riding，别的修改没提交时拒绝
  c.WE.tab = 'riding'; c.weRender();
  c.WE.pending = null; c.WE.lastSendAt = 0; c.evRideSend({ action: 'remove', uuid: 'cat-1' }); assert.deepEqual(JSON.parse(JSON.stringify(last().riding)), { action: 'remove', uuid: 'cat-1' }); assert.equal(last().entity, undefined);
  const n0 = sent.length; c.evSet('pose', 'Small', true); c.WE.pending = null; c.WE.lastSendAt = 0; c.evRideSend({ action: 'eject' }); assert.equal(sent.length, n0, '有草稿时不发乘客操作');
  // 展示框
  const fr = mk('minecraft:item_frame', { item_frame: { Fixed: false, Invisible: false, ItemDropChance: 1, ItemRotation: 0, item: { empty: true }, schema: { fields: { ItemRotation: { max: 7 } } } }, riding });
  c.weOpen(fr); assert.equal(c.weTabs()[0].id, 'frame'); c.evSet('item_frame', 'ItemRotation', 3); c.evSet('item_frame', 'item', { id: 'minecraft:diamond', count: 1, comps: {}, removed: {} });
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); assert.equal(last().entity.item_frame.ItemRotation, 3); assert.equal(last().entity.item_frame.item.id, 'minecraft:diamond');
  // 文字展示：不透明度按 0..255 显示、有符号 byte 提交
  const td = mk('minecraft:text_display', { display: { billboard: 'fixed', text: 'hi', text_opacity: -1, alignment: 'center', line_width: 200, transformation: { translation: [0, 0, 0], scale: [1, 1, 1], left_rotation: [0, 0, 0, 1], right_rotation: [0, 0, 0, 1] }, schema: { fields: {} } }, riding });
  c.weOpen(td); c.WE.tab = 'display'; c.weRender();
  c.evSet('display', 'text_opacity', 100 > 127 ? 100 - 256 : 100); c.evSet('display', 'text', c.textMsg('{"text":"x","bold":true}'));
  const t = JSON.parse(JSON.stringify(c.evGet('display', 'transformation'))); t.scale = [2, 2, 2]; c.evSet('display', 'transformation', t);
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); const ad = last().entity.display;
  assert.equal(ad.text_opacity, 100); assert.equal(ad.text.bold, true); assert.equal(JSON.stringify(ad.transformation.scale), '[2,2,2]'); assert.equal(Object.keys(ad).length, 3);
  // 交易
  const vi = mk('minecraft:villager', { trades: { available: true, offers: [{ buy: { id: 'minecraft:emerald', count: 2, comps: {}, removed: {}, cost_predicate_snbt: '{}' }, sell: { id: 'minecraft:bread', count: 3, comps: {}, removed: {} }, uses: 3, maxUses: 12, rewardExp: true, xp: 5, priceMultiplier: 0.05, demand: 0, specialPrice: 0 }] }, riding });
  c.weOpen(vi); c.WE.tab = 'trades'; c.weRender(); assert.equal(c.weDirty(), false, '只是看不算改');
  c.evOffers()[0].uses = 0; assert.equal(c.weDirty(), true);
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); const ao = last().entity.offers; assert.equal(ao.length, 1); assert.equal(ao[0].uses, 0); assert.equal(ao[0].buy.cost_predicate_snbt, '{}', '谓词旁路原样带回');
  const noSrv = mk('minecraft:villager', { trades: { available: false, reason: '没有服务器' }, riding }); c.weOpen(noSrv); c.WE.tab = 'trades'; c.weRender();
  c.WE.w = null;
}
console.log('PASS world entity: pose, frame, display, trades, riding.');

// 长时间使用：反复开关物品 / 世界页 / 搜索 / 注册表推送后，各处缓存不会无限涨
{
  const size = o => Object.keys(o || {}).length;
  const probe = () => ({ seen: c.NBT_SEEN_N, state: size(c.Valid.state), hv: size(c.Valid.hv), hvWait: size(c.Valid.hvWait), waiting: size(c.Valid.waiting), vaultWait: size(c.Vault.wait), uiopen: size(c.UIOpen),
    docs: c.Store.docs.length, hist: c.Store.docs.reduce((n, d) => n + d.hist.length, 0), ents: size(c.Reg.eschema), defs: size(c.Reg.defs), kinds: size(c.Reg.kinds), comps: c.EDATA.comps.length });
  const sent = []; c.oriel.send = (k, v) => { sent.push(k); return true; };
  const once = round => {
    // 开一个物品、改几次、再关
    c.Store.docs.length = 0; const d = c.makeDoc({ id: 'minecraft:stick', comps: { custom_data: { n: round } } }); c.Store.docs.push(d); c.Store.cur = 0;
    for (let i = 0; i < 40; i++) c.Store.set('custom_data', { n: round, i, blob: 'x'.repeat(200) }, { structural: false, key: 'k' + i });
    c.Valid.touch && c.Valid.touch();
    // 世界页：开 / 改 / 保存
    const w = { kind: 'block', type: 'minecraft:furnace', block: 'minecraft:furnace', slot: { kind: 'block', dim: 'minecraft:overworld', x: round % 5, y: 64, z: 0, token: 't' }, revision: 'r' + round, canUndo: false, has_block_entity: true, snbt: '{id:"minecraft:furnace",x:0,y:64,z:0}', nbt: {},
      views: { furnace: { value: { cooking_time_spent: 0, cooking_total_time: 0, lit_time_remaining: 0, lit_total_time: 0 }, schema: { fields: {} } } }, block_state_schema: [{ name: 'lit', type: 'boolean', values: ['true', 'false'], default: 'false', current: 'false' }] };
    c.weOpen(w); c.weSetV('furnace', 'lit_time_remaining', round); c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); c.weSaved(w);
    // 注册表推送：分页条目 + 模组组件
    c.Reg.ingest('registry.items', { generation: round, offset: 0, total: 3, done: true, entries: [{ id: 'minecraft:a' + round, name: 'a' }, { id: 'minecraft:b', name: 'b' }, { id: 'minecraft:c', name: 'c' }] });
    c.Reg.ingest('registry.data_component_types', { generation: 1, offset: 0, total: 1, done: true, entries: [{ id: 'mymod:soak', name: 'soak' }] });
    c.Reg.ingest('registry.component_schema', { entries: [{ id: 'minecraft:use_cooldown', ranges_for_ui: [{ path: '$.seconds', min: 0, max: 1e39, min_exclusive: true }] }] });
  };
  for (let r = 0; r < 20; r++) once(r);
  const warm = probe();
  for (let r = 20; r < 420; r++) once(r);
  const after = probe();
  c.WE.w = null; c.Store.docs.length = 0;
  for (const k of Object.keys(warm)) assert.ok(after[k] <= warm[k] + 3, '不应随使用时间增长：' + k + ' ' + warm[k] + ' → ' + after[k]);
}
console.log('PASS soak: caches stay bounded over 400 open/edit/save/registry cycles.');

// 世界玩家：背包 / 末影箱 / 状态 / 能力 / 属性，按契约发 apply.entity.player
{
  const sent = []; c.oriel.send = (k, v) => { sent.push([k, v]); return true; };
  const slots = []; for (let i = 0; i < 43; i++) slots.push({ slot: i, stack: i === 0 ? { id: 'minecraft:stick', count: 3, comps: {} } : { empty: true } });
  const player = { container: { size: 43, slots }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, Health: 20, AbsorptionAmount: 0, food: { foodLevel: 20, saturation: 5 }, experience: { XpLevel: 3, XpP: 0.5, XpTotal: 20 },
    playerGameType: 'survival', abilities: { flying: false, mayfly: false, invulnerable: false, mayBuild: true, instabuild: false, walkSpeed: 0.1, flySpeed: 0.05 }, attributes: [{ id: 'minecraft:max_health', base: 20 }], active_effects: [], Tags: [], CustomName: null,
    schema: { gameModes: ['survival', 'creative', 'adventure', 'spectator'], selectedSlotMax: 8, inventorySize: 43, enderSize: 27, equipmentSlots: [{ slot: 36, equipment: 'feet' }, { slot: 37, equipment: 'legs' }, { slot: 38, equipment: 'chest' }, { slot: 39, equipment: 'head' }, { slot: 40, equipment: 'offhand' }],
      attributes: [{ id: 'minecraft:max_health', base: 20, min: 1, max: 1024 }], bounds: { Health: { min: 0, max: 20 }, 'food.foodLevel': { min: 0, max: 20 } } } };
  const w = { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', dim: 'minecraft:overworld', player: 'self', token: 't' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'Rinorsi', uuid: 'u' }, views: { player } };
  c.weOpen(w);
  assert.equal(JSON.stringify(c.weTabs().map(t => t.id)), '["pinv","pender","pstat","pabil","pattr"]'); assert.equal(c.weName(), 'Rinorsi（你）');
  for (const t of c.weTabs()) { c.WE.tab = t.id; c.weRender(); }
  assert.equal(c.weDirty(), false);
  c.wpSetSlot('container', 5, { id: 'minecraft:apple', count: 1, comps: {}, removed: {} }); c.wpSetSlot('ender', 2, { id: 'minecraft:diamond', count: 2, comps: {}, removed: {} });
  c.evSet('player', 'playerGameType', 'creative'); c.evSet('player', 'food', { foodLevel: 10, saturation: 5 }); c.evSet('player', 'SelectedItemSlot', 4);
  assert.equal(c.weDirty(), true);
  c.WE.pending = null; c.WE.lastSendAt = 0; c.weApply(); const ap = sent.filter(x => x[0] === 'apply').pop()[1];
  assert.equal(ap.snbt, undefined, '玩家不提交原始 SNBT'); const pp = ap.entity.player;
  assert.equal(pp.playerGameType, 'creative'); assert.equal(pp.food.foodLevel, 10); assert.equal(pp.SelectedItemSlot, 4);
  assert.equal(JSON.stringify(pp.container.slots.map(s => s.slot)), '[5]'); assert.equal(pp.ender.slots[0].stack.id, 'minecraft:diamond'); assert.equal(pp.abilities, undefined);
  c.weSaved(w); assert.equal(c.weDirty(), false, '保存后草稿清空');
  c.wpSetSlot('container', 0, { empty: true }); assert.equal(c.weDirty(), true); c.wpSetSlot('container', 0, { id: 'minecraft:stick', count: 3, comps: {} });
  c.WE.w = null;
}
console.log('PASS world player: inventory, ender chest, status, abilities, attributes.');

// 玩家背包：游戏给多少格就画多少格（含装备 7 位、名字不认识的位置兜底）
{
  const mkw = eqSlots => {
    const slots = []; for (let i = 0; i < 43; i++) slots.push({ slot: i, stack: { empty: true } });
    return { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', dim: 'minecraft:overworld', player: 'self', token: 't' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'P', uuid: 'u' },
      views: { player: { container: { size: 43, slots }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, Health: 20, schema: { equipmentSlots: eqSlots, selectedSlotMax: 8, inventorySize: 43 } } } };
  };
  const names = ['feet', 'legs', 'chest', 'head', 'offhand', 'body', 'saddle'];
  const full = names.map((n, i) => ({ slot: 36 + i, equipment: n }));
  for (const eq of [full, full.slice(0, 5), []]) {
    c.weOpen(mkw(eq)); c.WE.tab = 'pinv'; c.weRender();
    const cells = c.$('screen').querySelectorAll('.slot').filter(x => !(x.className || '').includes('blank'));
    assert.equal(cells.length, 43, '背包页要画满 43 格，实际 ' + cells.length + '（装备位 ' + eq.length + '）');
  }
  c.WE.w = null;
}
console.log('PASS player inventory shows every slot.');

// 玩家背包的原版式操作：拖动对换、双击拿起再点放下
{
  const slots = []; for (let i = 0; i < 43; i++) slots.push({ slot: i, stack: i === 0 ? { id: 'minecraft:stick', count: 3, comps: {} } : i === 1 ? { id: 'minecraft:apple', count: 2, comps: {} } : { empty: true } });
  const w = { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', dim: 'minecraft:overworld', player: 'self', token: 't' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'P', uuid: 'u' },
    views: { player: { container: { size: 43, slots }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, schema: { equipmentSlots: [{ slot: 39, equipment: 'head' }, { slot: 40, equipment: 'offhand' }], selectedSlotMax: 8, inventorySize: 43 } } } };
  c.weOpen(w); c.WE.tab = 'pinv'; c.weRender();
  const cellOf = i => c.WE_DND.cells.find(x => x.ref.get() && x.ref.get().id && ((i === 0 && x.ref.get().id === 'minecraft:stick') || (i === 1 && x.ref.get().id === 'minecraft:apple')));
  const emptyCells = () => c.WE_DND.cells.filter(x => !x.ref.get() || x.ref.get().empty);
  // 拖动：木棍 → 一个空格 = 移动
  const a = cellOf(0), target = emptyCells()[5];
  c.weDndMove(a, target);
  assert.equal(JSON.stringify(Object.keys(c.WE.pslots.container).sort()), '["0","' + Object.keys(c.WE.pslots.container).filter(k => k !== '0')[0] + '"]'.replace(/"$/, '"'));
  assert.equal(c.WE.pslots.container[0].empty, true, '原格变空');
  const moved = Object.keys(c.WE.pslots.container).filter(k => k !== '0')[0]; assert.equal(c.WE.pslots.container[moved].id, 'minecraft:stick');
  // 对换：苹果 ↔ 另一处的木棍
  c.weRender(); const apple = cellOf(1), stick = c.WE_DND.cells.find(x => x.ref.get() && x.ref.get().id === 'minecraft:stick');
  c.weDndMove(apple, stick);
  assert.equal(c.WE.pslots.container[1].id, 'minecraft:stick'); assert.equal(c.WE.pslots.container[moved].id, 'minecraft:apple');
  // 双击拿起 → 点另一格放下
  c.WE.pslots = { container: {}, ender: {} }; c.weRender();
  const s1 = cellOf(0).el, dst = emptyCells()[7].el;
  s1.fire('click'); s1.fire('click'); assert.ok(c.WE_DND.carry, '双击后拿起');
  dst.fire('click'); assert.equal(c.WE_DND.carry, null); assert.equal(c.WE.pslots.container[0].empty, true);
  c.WE.w = null;
}
console.log('PASS inventory drag / double-click move.');
