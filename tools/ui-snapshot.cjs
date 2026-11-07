// 界面快照：把各个页面渲染出的 DOM 序列化成稳定文本，和 tools/snapshots/*.txt 逐字比对。
// 用途：公共组件重构时的安全网——重构前后快照必须逐字相同；有意改动界面时用 --update 重新生成并在提交信息里写明。
//   node tools/ui-snapshot.cjs            比对（有差异则退出码 1，并打印第一处差异）
//   node tools/ui-snapshot.cjs --update   重写快照
//   node tools/ui-snapshot.cjs 玩家       只跑名字包含「玩家」的场景
const fs = require('node:fs');
const path = require('node:path');
const H = require('./lib/ui-harness.cjs');

const SNAP = path.resolve(__dirname, 'snapshots');
const args = process.argv.slice(2), UPDATE = args.includes('--update'), only = args.filter(a => a[0] !== '-');
const examples = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/entity-schema-examples-26.1.2.json'), 'utf8'));
const exOne = k => { const e = examples[k]; return e.entries ? e.entries[0] : e; };

function fresh(opts) {
  const t = H.create(opts), c = t.c;
  c.Reg.meta = {}; c.Reg.kinds = {};
  ['cat', 'sheep', 'zombie', 'slime', 'armor_stand', 'wolf', 'villager'].forEach(k => { if (examples[k]) c.Reg.ingest('registry.entity_schema', { name: 'entity_schema', id: 'minecraft:' + k, entries: [exOne(k)], done: true }); });
  c.toast = c.toast; c.snd = () => {};
  return t;
}
const shot = (...els) => els.map(e => H.snapshotOf(e)).join('');
const part = (t, id) => t.doc.getElementById(id);
const frame = t => '## topbar\n' + shot(part(t, 'topbar')) + '## screen\n' + shot(part(t, 'screen')) + '## footer\n' + shot(part(t, 'footer')) + '## overlays\n' + shot(t.doc.getElementById('overlays'));

// ---------- 物品页：每一页签各一份，展开全部卡片 ----------
function itemPages(id, comps) {
  const t = fresh(), c = t.c;
  const d = c.makeDoc({ id, comps: comps || {} }); c.Store.docs.push(d); c.Store.cur = 0;
  const kind = c.kindOfItem(d.id), tabs = c.tabsOfKind(kind), out = [];
  tabs.forEach(tab => {
    c.UI.tab = tab.id; c.drawEdit();
    (c.UI.page ? c.UI.page.cards : []).forEach(card => { try { if (card.setCollapsed) card.setCollapsed(false); } catch (e) { out.push('!! 展开失败 ' + (card.spec && card.spec.title) + ': ' + e.message + '\n'); } });
    out.push('# 页签 ' + tab.id + '\n' + frame(t));
  });
  return out.join('\n');
}

// ---------- 世界页夹具（沿用 tools/ui-world-test.cjs 的数据形状）----------
const blockOf = (type, extra) => Object.assign({ kind: 'block', type, block: type, slot: { kind: 'block', dim: 'minecraft:overworld', x: 1, y: 2, z: 3, token: 't' }, revision: 'r', canUndo: false, has_block_entity: true, snbt: '{id:"' + type + '",x:1,y:2,z:3}', nbt: {}, views: {} }, extra);
const entOf = (type, views, nbt) => ({ kind: 'entity', type, slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', token: 't' }, revision: 'r', canUndo: false, snbt: '{id:"' + type + '"}', nbt: nbt || {}, views: views || {} });
const riding = { passengers: [{ type: 'minecraft:cat', uuid: 'cat-1', summary: 'Cat', passengers: [{ type: 'minecraft:chicken', uuid: 'ch-1', summary: 'Chicken', passengers: [] }] }], vehicle: { type: 'minecraft:horse', summary: 'Horse' }, rideCheck: {} };

function worldTabs(make) {
  const t = fresh(), c = t.c; c.Store.doc = () => null;
  const w = make(c); c.weOpen(w);
  const out = [];
  c.weTabs().forEach(tab => { c.WE.tab = tab.id; c.weRender(); (t.root.querySelectorAll('.w-card') || []).forEach(x => { if (x._card && x._card.setCollapsed) x._card.setCollapsed(false); }); out.push('# 页签 ' + tab.id + '\n' + frame(t)); });
  return out.join('\n');
}
function chest(c) {
  const slots = []; for (let i = 0; i < 27; i++) slots.push({ slot: i, stack: { empty: true } });
  slots[0] = { slot: 0, stack: { id: 'minecraft:stick', count: 3, comps: { custom_name: 'x' }, removed: {} } };
  slots[5] = { slot: 5, stack: { id: 'minecraft:diamond_sword', count: 1, comps: { enchantments: { sharpness: 5 } }, removed: {} } };
  return blockOf('minecraft:chest', { block_state: { facing: 'north' }, snbt: '{id:"minecraft:chest",x:1,y:2,z:3,Items:[]}', container: { size: 27, kind: 'minecraft:chest', unresolved_loot: false, slots } });
}
function player(c) {
  const slots = []; for (let i = 0; i < 43; i++) slots.push({ slot: i, stack: i === 0 ? { id: 'minecraft:diamond_sword', count: 1, comps: { enchantments: { sharpness: 5 } }, removed: {} } : i === 12 ? { id: 'minecraft:apple', count: 64, comps: {}, removed: {} } : i === 39 ? { id: 'minecraft:iron_helmet', count: 1, comps: {}, removed: {} } : { empty: true } });
  const pl = { container: { size: 43, slots }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, Health: 20, AbsorptionAmount: 0, food: { foodLevel: 20, saturation: 5 }, experience: { XpLevel: 3, XpP: 0.5, XpTotal: 20 },
    playerGameType: 'survival', abilities: { flying: false, mayfly: false, invulnerable: false, mayBuild: true, instabuild: false, walkSpeed: 0.1, flySpeed: 0.05 }, attributes: [{ id: 'minecraft:max_health', base: 20 }], active_effects: [], Tags: [], CustomName: null,
    schema: { gameModes: ['survival', 'creative', 'adventure', 'spectator'], selectedSlotMax: 8, inventorySize: 43, enderSize: 27, equipmentSlots: [{ slot: 36, equipment: 'feet' }, { slot: 37, equipment: 'legs' }, { slot: 38, equipment: 'chest' }, { slot: 39, equipment: 'head' }, { slot: 40, equipment: 'offhand' }, { slot: 41, equipment: 'body' }, { slot: 42, equipment: 'saddle' }],
      attributes: [{ id: 'minecraft:max_health', base: 20, min: 1, max: 1024 }], bounds: { Health: { min: 0, max: 20 }, 'food.foodLevel': { min: 0, max: 20 } } } };
  return { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', dim: 'minecraft:overworld', player: 'self', token: 't' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'Rinorsi', uuid: 'u' }, views: { player: pl } };
}

// ---------- 保险库 / 提示 ----------
function vaultWindow(kind) {
  const t = fresh(), c = t.c; c.Store.doc = () => null;
  c.openVault(kind === 'entity' ? { kind: 'entity' } : {});
  const req = t.sent.filter(x => x[0] === 'vault' && x[1].op === 'list').pop()[1];
  const entries = kind === 'entity'
    ? [{ id: 'e1', kind: 'entity', name: '小黑猫', tags: ['宠物'], note: '', entityId: 'minecraft:cat', summary: { id: 'minecraft:cat' } }]
    : [{ id: 'e1', name: '火焰剑', tags: ['武器'], note: '备注', item: { id: 'minecraft:diamond_sword', count: 1 }, summary: { enchantCount: 2, hasCustomName: true } }];
  c.Reg.ingest('vault.result', { version: 1, requestId: req.requestId, op: 'list', ok: true, entries, total: entries.length, offset: 0, nextOffset: entries.length, done: true, persisted: true });
  return '## overlays\n' + shot(t.doc.getElementById('overlays'));
}
function toasts() {
  const t = fresh(), c = t.c;
  ['info', 'ok', 'warn', 'error'].forEach(k => c.toast('提示 ' + k, k));
  return shot(part(t, 'toasts'));
}

const SCENES = [
  ['物品-钻石剑', () => itemPages('minecraft:diamond_sword', { custom_name: '测试' })],
  ['物品-潜影盒', () => itemPages('minecraft:shulker_box')],
  ['物品-刷怪蛋', () => itemPages('minecraft:cat_spawn_egg')],
  ['物品-刷怪笼', () => itemPages('minecraft:spawner')],
  ['世界-箱子', () => worldTabs(chest)],
  ['世界-告示牌', () => worldTabs(() => blockOf('minecraft:sign', { block: 'minecraft:oak_sign', block_state_schema: [{ name: 'rotation', type: 'int', values: ['0', '1', '2'], default: '8', current: '1' }, { name: 'waterlogged', type: 'boolean', values: ['true', 'false'], default: 'false', current: 'false' }],
    views: { sign: { value: { front_text: { messages: ['a', '', '', ''], color: 'black', has_glowing_text: false }, back_text: { messages: ['', '', '', ''], color: 'black', has_glowing_text: false }, is_waxed: true }, schema: { fields: { front_text: { messages_length: 4 } } } } } }))],
  ['世界-命令块', () => worldTabs(() => blockOf('minecraft:command_block', { block_type_schema: ['minecraft:command_block', 'minecraft:repeating_command_block', 'minecraft:chain_command_block'], block_state_schema: [{ name: 'conditional', type: 'boolean', values: ['true', 'false'], default: 'false', current: 'false' }],
    views: { command_block: { value: { Command: 'say hi', TrackOutput: true, auto: false, powered: false }, schema: { fields: {} } } } }))],
  ['世界-熔炉', () => worldTabs(() => blockOf('minecraft:furnace', { views: { furnace: { value: { cooking_time_spent: 0, cooking_total_time: 0, lit_time_remaining: 0, lit_total_time: 0 }, schema: { fields: { cooking_time_spent: { min: -32768, max: 32767 } } } } } }))],
  ['世界-刷怪笼方块', () => worldTabs(() => blockOf('minecraft:mob_spawner', { snbt: '{id:"minecraft:mob_spawner",x:1,y:2,z:3,Delay:20s,SpawnData:{entity:{id:"minecraft:cat"}}}', nbt: { id: 'minecraft:mob_spawner', Delay: 20, MinSpawnDelay: 200, MaxSpawnDelay: 800, SpawnCount: 4, SpawnData: { entity: { id: 'minecraft:cat' } } } }))],
  ['世界-盔甲架', () => worldTabs(() => entOf('minecraft:armor_stand', { pose: { Head: [10, 20, 30], Body: [0, 0, 0], LeftArm: [-10, 0, -10], RightArm: [-15, 0, 10], LeftLeg: [-1, 0, -1], RightLeg: [1, 0, 1], Marker: false, Small: false, ShowArms: false, Invisible: false, NoBasePlate: false, schema: { fields: { Head: { default: [0, 0, 0] } } } }, riding }))],
  ['世界-村民', () => worldTabs(() => entOf('minecraft:villager', { trades: { available: true, offers: [{ buy: { id: 'minecraft:emerald', count: 2, comps: {}, removed: {} }, sell: { id: 'minecraft:bread', count: 3, comps: {}, removed: {} }, uses: 3, maxUses: 12, rewardExp: true, xp: 5, priceMultiplier: 0.05, demand: 0, specialPrice: 0 }] }, riding }))],
  ['世界-展示实体', () => worldTabs(() => entOf('minecraft:text_display', { display: { billboard: 'fixed', text: 'hi', text_opacity: -1, alignment: 'center', line_width: 200, transformation: { translation: [0, 0, 0], scale: [1, 1, 1], left_rotation: [0, 0, 0, 1], right_rotation: [0, 0, 0, 1] }, schema: { fields: {} } }, riding }))],
  ['世界-带乘客的猫', () => worldTabs(() => entOf('minecraft:cat', { riding }, { Health: 10, variant: 'minecraft:black' }))],
  ['玩家', () => worldTabs(player)],
  ['保险库-物品', () => vaultWindow('item')],
  ['保险库-生物', () => vaultWindow('entity')],
  ['提示', toasts]
];

fs.mkdirSync(SNAP, { recursive: true });
let bad = 0, ran = 0;
for (const [name, fn] of SCENES) {
  if (only.length && !only.some(o => name.includes(o))) continue;
  ran++;
  let text; try { text = fn(); } catch (e) { text = '!! 场景渲染失败: ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n') + '\n'; }
  const file = path.join(SNAP, name + '.txt');
  if (UPDATE) { fs.writeFileSync(file, text); console.log('写入', name, text.split('\n').length + ' 行' + (text.indexOf('!!') >= 0 ? '  ⚠ 含失败标记' : '')); continue; }
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/
/g, '
') : null;   // git 可能把 LF 换成 CRLF，比较前统一
  if (old === text) { console.log('PASS', name); continue; }
  bad++;
  if (old === null) { console.log('FAIL', name, '：没有基线，先运行 --update'); continue; }
  const a = old.split('\n'), b = text.split('\n'); let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.log('FAIL', name, '：第', i + 1, '行起不同\n  基线: ' + (a[i] || '(无)') + '\n  现在: ' + (b[i] || '(无)'));
}
if (!UPDATE) console.log(bad ? bad + ' / ' + ran + ' 个场景与基线不同' : 'PASS UI snapshots: ' + ran + ' 个场景与基线逐字相同。');
process.exit(bad ? 1 : 0);
