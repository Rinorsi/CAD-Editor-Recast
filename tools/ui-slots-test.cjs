// 物品页容器 / 收纳袋卡片的格子交互：双击拿起 + 点别格放下、拖动对换、右键菜单、数量弹窗。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.toast = () => {};
c.Reg.meta = {};

function openCard(id, comps, cardName) {
  c.Store.docs.length = 0;
  const d = c.makeDoc({ id, comps }); c.Store.docs.push(d); c.Store.cur = 0;
  let card = null;
  for (const tab of c.tabsOfKind(c.kindOfItem(id))) { c.UI.tab = tab.id; c.drawEdit(); card = c.UI.page.cards.find(x => x.spec && x.spec.id === cardName); if (card) break; }
  assert.ok(card, '页面里有 ' + cardName + ' 卡片');
  card.setCollapsed(false);   // 懒加载的卡片展开时才建内容，并换掉原来的占位元素：重新按 data-card 找
  const el = t.doc.getElementById('screen').querySelectorAll('.k-card').find(x => x.getAttribute('data-card') === cardName);
  assert.ok(el, '卡片元素在页面里');
  return { d, card: { body: el } };
}
const cellsOf = card => card.body.querySelectorAll('.slot').filter(x => !x.classList.contains('addslot'));
const dblclick = el => { el.fire('click'); el.fire('click'); };
const flushTimers = () => { while (t.timers.length) t.timers.shift().fn(); };

// ---------- 容器：双击拿起，点另一格放下 = 移动 ----------
{
  const { d, card } = openCard('minecraft:shulker_box', { container: [{ slot: 0, item: { id: 'minecraft:diamond', count: 5 } }, { slot: 3, item: { id: 'minecraft:stick', count: 1, components: { custom_name: 'x' } } }] }, 'container');
  let cells = cellsOf(card); assert.equal(cells.length, 27);
  assert.equal(cells[0].getAttribute('title'), '钻石 × 5'.replace('钻石', c.nameOfItem('minecraft:diamond')));
  assert.equal(cells[3].querySelectorAll('.mk').length, 1, '带组件的格子有小黄点');
  dblclick(cells[0]); assert.ok(c.WE_DND.carry, '双击后拿起'); assert.ok(cells[0].classList.contains('carried'));
  cells[7].fire('click');
  assert.equal(c.WE_DND.carry, null, '放下后不再拿着');
  const list = JSON.parse(JSON.stringify(c.Ctx.get('container'))).sort((a, b) => a.slot - b.slot);
  assert.deepEqual(list.map(e => e.slot), [3, 7], '钻石从 0 号格移到 7 号格');
  assert.equal(list[1].item.id, 'minecraft:diamond'); assert.equal(list[1].item.count, 5);
  assert.equal(list[0].item.components.custom_name, 'x', '没动的格子里的组件原样保留');
  // 对换：3 ↔ 7
  cells = cellsOf(card); dblclick(cells[3]); cells[7].fire('click');
  const l2 = JSON.parse(JSON.stringify(c.Ctx.get('container'))).sort((a, b) => a.slot - b.slot);
  assert.equal(l2[0].slot, 3); assert.equal(l2[0].item.id, 'minecraft:diamond'); assert.equal(l2[1].slot, 7); assert.equal(l2[1].item.id, 'minecraft:stick');
  assert.equal(l2[1].item.components.custom_name, 'x', '对换时组件跟着物品走');
  // 点回原格 = 取消
  cells = cellsOf(card); dblclick(cells[3]); assert.ok(c.WE_DND.carry); cells[3].fire('click'); assert.equal(c.WE_DND.carry, null);
  assert.equal(JSON.parse(JSON.stringify(c.Ctx.get('container'))).length, 2, '取消不改内容');
  // 拿起的格子是空格：什么也不会发生
  dblclick(cellsOf(card)[20]); assert.equal(c.WE_DND.carry, null, '空格拿不起来');
  // 单击：300ms 内等不到第二下就打开小窗（计时器触发）
  c.WE_DND.last = null; flushTimers();
  cellsOf(card)[0].fire('click'); flushTimers();
  assert.ok(t.doc.getElementById('overlays').querySelector('.k-pickbox'), '单击后弹出物品小窗');
  c.kPopClose();
  // 右键菜单项齐全
  const menu = [];
  const realMenu = c.kMenu; c.kMenu = (x, y, items) => { menu.push(...items); };
  cellsOf(card)[3].events.contextmenu[0]({ preventDefault() {}, clientX: 1, clientY: 1 });
  c.kMenu = realMenu;
  assert.deepEqual(menu.filter(m => m.label).map(m => m.label), ['编辑…', '复制到下一个空格', '清空']);
  menu.find(m => m.label === '清空').run();
  assert.equal(JSON.parse(JSON.stringify(c.Ctx.get('container'))).length, 1, '右键清空');
  c.Store.docs.length = 0;
}

// ---------- 收纳袋：对换顺序、改数量 ----------
{
  const { card } = openCard('minecraft:bundle', { bundle_contents: [{ id: 'minecraft:apple', count: 3 }, { id: 'minecraft:stick', count: 12 }] }, 'bundle');
  let cells = cellsOf(card); assert.equal(cells.length, 2);
  dblclick(cells[0]); cells[1].fire('click');
  const l = JSON.parse(JSON.stringify(c.Ctx.get('bundle_contents')));
  assert.deepEqual(l.map(x => x.id), ['minecraft:stick', 'minecraft:apple'], '拿起放下 = 调换顺序');
  assert.equal(l[1].count, 3);
  assert.equal(card.body.querySelectorAll('.addslot').length, 1, '重画后仍只有一个「放入物品」格');
  assert.equal(cellsOf(card).length, 2);
  c.Store.docs.length = 0;
}
console.log('PASS slots: container / bundle carry, swap, cancel, context menu, count popup.');
