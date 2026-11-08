// 方块视图（自定义名称、漏斗、信标、合成器）的界面测试：渲染、点击写草稿、被后端拒绝的操作在界面上就拦住。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.Reg.meta = {};
let toasts = []; c.toast = (m) => toasts.push(m);
c.weRender = () => {};
const q = (el, sel) => el.querySelector(sel), qa = (el, sel) => el.querySelectorAll(sel), json = x => JSON.stringify(x);
const view = (value, fields) => ({ value, snbt: '{}', schema: { fields: fields || {} } });
function open(views, container) {
  c.WE.w = { kind: 'block', views, container: container || null }; c.WE.views = {}; c.WE.bstate = {}; c.WE.btype = ''; toasts = [];
}
const body = () => c.h('div');

// ---- 信标：候选来自后端；清除 = null；等级只读显示
{
  open({ beacon: view({ primary_effect: 'minecraft:speed', secondary_effect: null, Levels: 3 }, { primary_effect: { candidates: ['minecraft:speed', 'minecraft:haste'] }, secondary_effect: { candidates: ['minecraft:regeneration'] } }) });
  const b = body(); c.WEV.beacon(b, 'beacon');
  assert.ok(/3/.test(b.textContent), '显示金字塔等级');
  const clear = qa(b, '.k-btn').filter(x => x.textContent === '清除'); assert.equal(clear.length, 1, '只有已设置的主效果有清除按钮');
  clear[0].fire('click'); assert.equal(c.WE.views.beacon.primary_effect, null, '清除写成 null');
  assert.equal(c.weViewsDirty(), true);
}
// ---- 合成器：点空格子禁用 / 恢复；有东西的格子点不动并提示
{
  open({ crafter: view({ disabled_slots: [2], triggered: false }, { disabled_slots: { item_min: 0, item_max: 8 } }) }, { slots: [{ slot: 4, stack: { id: 'minecraft:stone', count: 1 } }] });
  const b = body(); c.WEV.crafter(b, 'crafter');
  let cells = qa(b, '.slot'); assert.equal(cells.length, 9, '九个格子');
  assert.ok(cells[2].classList.contains('sel'), '已禁用的格子有标记');
  cells[0].fire('click'); assert.equal(JSON.stringify(c.WE.views.crafter.disabled_slots), JSON.stringify([0, 2]), '禁用后按升序');
  const again = () => { const nb = body(); c.WEV.crafter(nb, 'crafter'); return qa(nb, '.slot'); }; // 真实界面每次改动都会整页重画
  cells = again(); cells[2].fire('click'); assert.equal(JSON.stringify(c.WE.views.crafter.disabled_slots), JSON.stringify([0]), '再点一次恢复');
  cells = again(); cells[4].fire('click'); assert.equal(JSON.stringify(c.WE.views.crafter.disabled_slots), JSON.stringify([0]), '有东西的格子不能禁用');
  assert.equal(toasts.length, 1, '并说明原因');
}
// ---- 漏斗、自定义名称：能渲染，视图标签有名字
{
  open({ hopper: view({ TransferCooldown: 8 }) });
  const b = body(); c.WEV.hopper(b, 'hopper'); assert.ok(/搬运冷却/.test(b.textContent));
  open({ nameable: view({ CustomName: null }, { CustomName: { nullable: true } }) });
  const n = body(); c.WEV.nameable(n, 'nameable'); assert.ok(/名称/.test(n.textContent));
  open({ nameable: view({ CustomName: null }), crafter: view({ disabled_slots: [], triggered: false }) });
  assert.equal(c.weViewTabInfo().label, '方块设置', '多个视图组合并成「方块设置」');
  open({ beacon: view({}) }); assert.equal(c.weViewTabInfo().label, '信标');
}
// ---- 末地折跃门：指定出口开 = 默认坐标，关 = null；太大的 Age 不在这里改
{
  open({ end_gateway: view({ exit_portal: null, ExactTeleport: false, Age: 12 }) });
  const b = body(); c.WEV.end_gateway(b, 'end_gateway');
  const tg = qa(b, '.k-toggle'); tg[0].fire('click'); assert.equal(json(c.WE.views.end_gateway.exit_portal), json([0, 64, 0]), '打开后给一个默认坐标');
  open({ end_gateway: view({ exit_portal: [10, 64, -10], ExactTeleport: true, Age: 12 }) });
  const b2 = body(); c.WEV.end_gateway(b2, 'end_gateway'); qa(b2, '.k-toggle')[0].fire('click'); assert.equal(c.WE.views.end_gateway.exit_portal, null, '关掉 = 删除出口');
  open({ end_gateway: view({ exit_portal: null, ExactTeleport: false, Age: 9223372036854775807 }) });
  const b3 = body(); c.WEV.end_gateway(b3, 'end_gateway'); assert.ok(/数值太大/.test(b3.textContent), '超出安全整数范围的 Age 只读，不被四舍五入改坏');
}
// ---- 结构方块 / 拼图方块：文本、枚举（候选来自后端）、开关
{
  open({ structure_block: view({ name: '', author: '', metadata: '', posX: 0, posY: 1, posZ: 0, sizeX: 5, sizeY: 5, sizeZ: 5, rotation: 'NONE', mirror: 'NONE', mode: 'DATA', integrity: 1, seed: 0, ignoreEntities: true, powered: false, showair: false, showboundingbox: true },
    { mode: { candidates: ['SAVE', 'LOAD', 'CORNER', 'DATA'] }, rotation: { candidates: ['NONE', 'CLOCKWISE_90', 'CLOCKWISE_180', 'COUNTERCLOCKWISE_90'] }, mirror: { candidates: ['NONE', 'LEFT_RIGHT', 'FRONT_BACK'] }, posX: { min: -48, max: 48 }, sizeX: { min: 0, max: 48 } }) });
  const b = body(); c.WEV.structure_block(b, 'structure_block');
  const name = qa(b, 'input')[0]; name.value = 'minecraft:workshop'; name.fire('change'); assert.equal(c.WE.views.structure_block.name, 'minecraft:workshop');
  const modes = qa(b, '.k-segi').filter(x => ['保存', '载入', '角', '数据'].includes(x.textContent)); assert.equal(modes.length, 4, '模式四个候选都列出来');
  modes.find(x => x.textContent === '载入').fire('click'); assert.equal(c.WE.views.structure_block.mode, 'LOAD', '原样写回候选值（大小写不转）');
  open({ jigsaw: view({ name: 'minecraft:empty', target: 'minecraft:empty', pool: 'minecraft:empty', final_state: 'minecraft:air', joint: 'rollable' }, { joint: { candidates: ['rollable', 'aligned'] } }) });
  const j = body(); c.WEV.jigsaw(j, 'jigsaw'); qa(j, '.k-segi').find(x => x.textContent === '对齐').fire('click'); assert.equal(c.WE.views.jigsaw.joint, 'aligned');
}
// ---- 宝库：钥匙清空 = null，范围草稿，已领奖玩家只读；幽匿方块
{
  open({ vault: view({ 'config.key_item': { id: 'minecraft:trial_key', count: 1 }, 'config.loot_table': 'minecraft:chests/trial_chambers/reward', 'config.activation_range': 4, 'config.deactivation_range': 4.5, 'server_data.rewarded_players': [[1, 2, 3, 4]] }) });
  const b = body(); c.WEV.vault(b, 'vault'); assert.ok(/1 人/.test(b.textContent), '已领奖玩家只显示人数');
  qa(b, '.k-btn').filter(x => x.textContent === '清空')[0].fire('click'); assert.equal(c.WE.views.vault['config.key_item'], null, '清空钥匙 = null');
  open({ sculk_sensor: view({ last_vibration_frequency: 3, 'listener.event_delay': 0 }) }); const s = body(); c.WEV.sculk_sensor(s, 'sculk_sensor'); assert.ok(/事件延迟/.test(s.textContent));
  open({ sculk_shrieker: view({ warning_level: 1, 'listener.event_delay': 0 }) }); const sh = body(); c.WEV.sculk_shrieker(sh, 'sculk_shrieker'); assert.ok(/警告等级/.test(sh.textContent));
}
// ---- 只读视图（潮涌核心、幽匿催生体、钟）：没有任何可点控件，也不会进提交
{
  open({ conduit: view({ Target: null, Active: true, Hunting: false }), sculk_catalyst: view({ cursors: [] }), bell: view({ ticks: 3, shaking: true }) });
  const b = body(); c.WEV.conduit(b, 'conduit'); c.WEV.sculk_catalyst(b, 'sculk_catalyst'); c.WEV.bell(b, 'bell');
  assert.equal(qa(b, '.k-toggle').length + qa(b, 'input').length + qa(b, '.k-btn').length, 0, '只读视图没有控件');
  assert.equal(c.weViewsDirty(), false);
}
// ---- 大箱子：54 格按后端给的编号画（跳过枚举名字，不重新排序），写一格只记一格
{
  const slots = []; for (let i = 0; i < 54; i++) slots.push({ slot: i, stack: i === 53 ? { id: 'minecraft:paper', count: 1, comps: {}, removed: {} } : { empty: true } });
  open({}, { size: 54, kind: 'minecraft:chest', double: { partner: { x: 1, y: 64, z: 0 }, size: 54, order: 'vanilla' }, unresolved_loot: false, slots });
  c.WE.slots = {};
  const b = body(); c.weContainerTab(b);
  assert.equal(qa(b, '.slot').length, 54, '两半合起来 54 格'); assert.ok(/两个箱子合起来/.test(b.textContent));
  assert.equal(c.weSlotStack(53).id, 'minecraft:paper', '第 54 格的内容读出来了');
  open({}, { size: 27, kind: 'minecraft:chest', unresolved_loot: false, slots: slots.slice(0, 27) });
  const s = body(); c.weContainerTab(s); assert.equal(qa(s, '.slot').length, 27); assert.ok(!/两个箱子合起来/.test(s.textContent), '单箱子不变');
}
console.log('PASS block views: nameable / hopper / beacon / crafter / gateway / structure / jigsaw / vault / sculk / double chest render, write drafts and refuse locally what the host would refuse.');