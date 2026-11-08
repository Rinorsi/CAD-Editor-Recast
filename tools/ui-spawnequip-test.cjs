// 刷怪笼随机池 / 试炼刷怪笼条目的「装备战利品表」（SpawnData.equipment）：和 entity.equipment 里直接放的物品分开。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.toast = () => {}; c.Reg.meta = {};
const qa = (el, sel) => el.querySelectorAll(sel), json = x => JSON.stringify(x);
const label = (el, text) => qa(el, '.k-btn').filter(x => x.textContent === text);

function pool(items) {
  let changes = 0;
  const xl = c.spPool(items, () => { changes++; }, '空');
  xl.select(0);
  return { xl, changes: () => changes, box: () => xl.el };
}
const zombie = (eq) => ({ data: { entity: { id: 'minecraft:zombie', equipment: { head: { id: 'minecraft:iron_helmet', count: 1 } } }, equipment: eq }, weight: 1 });

// ---- 没有战利品表：只有一个空选择，不出现掉落概率
{
  const items = [zombie(undefined)], p = pool(items);
  assert.ok(/装备战利品表/.test(p.box().textContent) && /战利品表/.test(p.box().textContent));
  assert.equal(qa(p.box(), '.k-segi').filter(s => /统一|按部位|不覆盖/.test(s.textContent)).length, 0, '没有表就没有概率设置');
}
// ---- 有表 + 按部位：大于 1 的保证掉落原样保留，删一个部位不动别的
{
  const items = [zombie({ loot_table: 'minecraft:equipment/trial_chamber', slot_drop_chances: { head: 2.5, chest: 0.5 } })], p = pool(items);
  const txt = p.box().textContent; assert.ok(/不覆盖/.test(txt) && /统一/.test(txt) && /按部位/.test(txt));
  assert.ok(/头盔/.test(txt) && /胸甲/.test(txt), '已有的部位都列出来');
  const trash = qa(p.box(), '.k-btn').filter(b => b.getAttribute('data-tip') === '去掉这个部位的覆盖');
  assert.equal(trash.length, 2); trash[1].fire('click');
  assert.equal(json(items[0].data.equipment.slot_drop_chances), json({ head: 2.5 }), '大于 1 的值还在，只去掉了胸甲');
  assert.ok(p.changes() >= 1);
}
// ---- 模式切换：不覆盖 = 去掉字段；统一 = 数字；按部位 = 映射
{
  const items = [zombie({ loot_table: 'minecraft:equipment/trial_chamber', slot_drop_chances: { head: 0.25 } })];
  let p = pool(items);
  const seg = (name) => qa(p.box(), '.k-segi').find(s => s.textContent === name);
  seg('不覆盖').fire('click'); assert.equal('slot_drop_chances' in items[0].data.equipment, false, '不覆盖就不写这个字段');
  assert.equal(items[0].data.equipment.loot_table, 'minecraft:equipment/trial_chamber', '战利品表还在');
  p = pool(items); seg('统一').fire('click'); assert.equal(typeof items[0].data.equipment.slot_drop_chances, 'number');
  p = pool(items); seg('按部位').fire('click'); assert.equal(typeof items[0].data.equipment.slot_drop_chances, 'object');
}
// ---- 清除战利品表：整个 equipment 去掉，但实体里直接放的头盔不动
{
  const items = [zombie({ loot_table: 'minecraft:equipment/trial_chamber', slot_drop_chances: 0.1 })], p = pool(items);
  const clear = label(p.box(), '清除'); assert.ok(clear.length >= 1);
  clear[clear.length - 1].fire('click');
  assert.equal(items[0].data.equipment, undefined, '没有表就不留 slot_drop_chances');
  assert.equal(items[0].data.entity.equipment.head.id, 'minecraft:iron_helmet', '实体自己的装备不受影响');
}
console.log('PASS spawner equipment: loot table row, drop-chance modes, values above 1 kept, entity equipment untouched.');
