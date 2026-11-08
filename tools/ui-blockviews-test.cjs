// 方块视图（自定义名称、漏斗、信标、合成器）的界面测试：渲染、点击写草稿、被后端拒绝的操作在界面上就拦住。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.Reg.meta = {};
let toasts = []; c.toast = (m) => toasts.push(m);
c.weRender = () => {};
const q = (el, sel) => el.querySelector(sel), qa = (el, sel) => el.querySelectorAll(sel);
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
console.log('PASS block views: nameable / hopper / beacon / crafter render, write drafts and refuse locally what the host would refuse.');
