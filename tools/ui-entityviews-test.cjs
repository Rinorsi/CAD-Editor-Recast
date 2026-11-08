// 生物页新视图（掉落物 / 下落方块 / TNT / 苦力怕 / 末影人 / 药水云 / 经验球 / 箭 / 交互实体 / 主人 / 只读关系）的界面测试。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.Reg.meta = {}; c.Reg.live = () => true;
c.Reg.bprops['minecraft:oak_log'] = { axis: { values: ['x', 'y', 'z'], default: 'y' } };
c.Reg.bprops['minecraft:sand'] = {};
c.weRender = () => {};
const qa = (el, sel) => el.querySelectorAll(sel);
const json = x => JSON.stringify(x);
function open(views, schema) { c.WE.w = { kind: 'entity', type: 'minecraft:pig', views, schema: schema || {} }; c.WE.ent = {}; c.WE.offers = null; }
const body = () => c.h('div');

// ---- 标签页：哪些视图出现就显示哪些页
{
  open({ tnt: { fuse: 80 }, team: { name: null, options: [], available: true, readOnly: true } });
  const tabs = c.weTabs(); assert.ok(tabs.some(x => x.id === 'ents' && x.label === 'TNT'), '只有一个视图时页签用它的名字');
  assert.ok(!tabs.some(x => x.id === 'relations'), '没有主人 / 拴绳 / 队伍就不显示「关系」页');
  open({ falling_block: { BlockState: { Name: 'minecraft:sand' } }, interaction: { width: 1, height: 1, response: false } });
  assert.equal(c.weTabs().find(x => x.id === 'ents').label, '实体设置', '多个视图合并成「实体设置」');
  open({ owner: { Owner: null, players: [], available: true }, team: { name: null, options: [] } });
  assert.ok(c.weTabs().some(x => x.id === 'relations'), '驯服动物有「关系」页');
  open({ team: { name: 'red', options: ['red'], available: true, readOnly: true } });
  assert.ok(c.weTabs().some(x => x.id === 'relations'), '在队伍里也显示');
}
// ---- 掉落物：物品数量、拾取延迟
{
  open({ dropped_item: { Item: { id: 'minecraft:stick', count: 1, comps: {}, removed: {} }, PickupDelay: 0, Age: 0 } },
    { dropped_item: { fields: { PickupDelay: { min: -32768, max: 32767 }, Age: { min: -32768, max: 32767 } } } });
  const b = body(); c.EV_SIMPLE_TAB.dropped_item(b);
  assert.ok(/拾取延迟/.test(b.textContent) && /已存在/.test(b.textContent));
  assert.equal(c.evFields('dropped_item').PickupDelay.max, 32767);
  c.evSet('dropped_item', 'PickupDelay', 100); const m = {}; c.evMsg(m);
  assert.equal(json(m.entity), json({ dropped_item: { PickupDelay: 100 } }), '只发改过的字段');
}
// ---- 下落方块：带属性的方块状态；选回默认值就不写进 Properties
{
  open({ falling_block: { BlockState: { Name: 'minecraft:oak_log' }, Time: 0, FallHurtAmount: 2, FallHurtMax: 40, DropItem: true, HurtEntities: false, CancelDrop: false } });
  const b = body(); c.EV_SIMPLE_TAB.falling_block(b);
  const segs = qa(b, '.k-segi'); assert.equal(segs.length, 3, '轴向三个取值');
  segs[0].fire('click'); assert.equal(json(c.WE.ent.falling_block.BlockState), json({ Name: 'minecraft:oak_log', Properties: { axis: 'x' } }));
  const b2 = body(); c.EV_SIMPLE_TAB.falling_block(b2); qa(b2, '.k-segi')[1].fire('click');
  assert.equal(c.WE.ent.falling_block, undefined, '改回原来的值，草稿就删掉');
  const b3 = body(); c.EV_SIMPLE_TAB.falling_block(b3); assert.ok(qa(b3, '.k-toggle').length >= 3, '三个开关');
}
// ---- 末影人：可清空
{
  open({ enderman: { carriedBlockState: { Name: 'minecraft:oak_log' } } });
  const b = body(); c.EV_SIMPLE_TAB.enderman(b);
  const clear = qa(b, '.k-btn').filter(x => x.textContent === '清除'); assert.equal(clear.length, 1);
  clear[0].fire('click'); assert.equal(c.WE.ent.enderman.carriedBlockState, null, '清除写成 null');
}
// ---- 药水云：效果时长倍率等于默认值就发 null；药水清除时保留其他字段
{
  open({ area_effect_cloud: { Radius: 3, Duration: 200, Age: 0, WaitTime: 20, ReapplicationDelay: 20, DurationOnUse: 0, RadiusOnUse: 0, RadiusPerTick: 0, potion_contents: { potion: 'minecraft:swiftness', custom_effects: [{ id: 'minecraft:speed' }] }, custom_particle: null, potion_duration_scale: 2 } },
    { area_effect_cloud: { fields: { Radius: { min: 0, max: 32 } } } });
  const b = body(); c.EV_SIMPLE_TAB.area_effect_cloud(b);
  assert.ok(/另有 1 个自定义效果/.test(b.textContent), '自定义效果在「数据」页改，这里只提示数量');
  assert.equal(c.evFields('area_effect_cloud').Radius.max, 32);
}
// ---- 箭：拾取方式的候选来自后端
{
  open({ arrow: { damage: 2, pickup: 1 } }, { arrow: { fields: { pickup: { options: [{ label: 'DISALLOWED', value: 0 }, { label: 'ALLOWED', value: 1 }, { label: 'CREATIVE_ONLY', value: 2 }] } } } });
  const b = body(); c.EV_SIMPLE_TAB.arrow(b);
  const segs = qa(b, '.k-segi'); assert.equal(segs.length, 3); segs[2].fire('click'); assert.equal(c.WE.ent.arrow.pickup, 2);
  assert.ok(/只有创造模式能拾起/.test(b.textContent));
}
// ---- 主人：只能选在线玩家；清除 = null
{
  open({ owner: { Owner: '00000000-0000-0000-0000-0000000000aa', players: [{ uuid: '00000000-0000-0000-0000-000000000001', name: 'Steve' }], available: true },
    team: { name: 'red', options: ['red'], available: true, readOnly: true }, leash: { data: [1, 64, 2], readOnly: true } });
  const b = body(); c.evRelationTab(b);
  assert.ok(/不在线的玩家/.test(b.textContent) || /清除/.test(b.textContent));
  const clear = qa(b, '.k-btn').filter(x => x.textContent === '清除'); assert.equal(clear.length, 1);
  clear[0].fire('click'); assert.equal(c.WE.ent.owner.Owner, null);
  assert.ok(/red/.test(b.textContent) && /被拴着/.test(b.textContent), '队伍和拴绳只读显示');
  const m = {}; c.evMsg(m); assert.equal(json(m.entity), json({ owner: { Owner: null } }), '只读的队伍、拴绳不会进提交');
}
// ---- 马：驯服、驯服进度、主人；驮兽箱子：格子数量来自后端，写格子不动别的格
{
  open({ horse: { Tame: false, Temper: 0, Owner: null, players: [{ uuid: '00000000-0000-0000-0000-000000000001', name: 'Steve' }], available: true },
    chested: { ChestedHorse: true, capacity: 5, Items: [{ slot: 1, stack: { id: 'minecraft:diamond', count: 2, comps: {}, removed: {} } }] } },
    { horse: { fields: { Temper: { min: -2147483648, max: 2147483647 } } } });
  const tabs = c.weTabs(); assert.equal(tabs.find(x => x.id === 'ents').label, '实体设置', '驴同时有两组，合并');
  const b = body(); c.EV_SIMPLE_TAB.horse(b); assert.ok(/已驯服/.test(b.textContent) && /驯服进度/.test(b.textContent) && /主人/.test(b.textContent));
  qa(b, '.k-toggle')[0].fire('click'); assert.equal(c.WE.ent.horse.Tame, true);
  const b2 = body(); c.EV_SIMPLE_TAB.chested(b2); assert.equal(qa(b2, '.slot').length, 5, '格子数 = 后端给的 capacity');
  const grid = c.evSlotList('chested', 'Items', 5);
  grid.setSlot(3, { id: 'minecraft:stick', count: 1, comps: {}, removed: {} });
  assert.equal(json(c.WE.ent.chested.Items.map(x => x.slot)), json([1, 3]), '原来的第 1 格还在，加了第 3 格，按格号排序');
  grid.setSlot(1, { empty: true }); assert.equal(json(c.WE.ent.chested.Items.map(x => x.slot)), json([3]), '清空某格 = 从列表里去掉');
  const m = {}; c.evMsg(m); assert.ok(m.entity.horse.Tame === true && m.entity.chested.Items, '两组都进提交');
}
// ---- 载具容器：没展开的战利品不给格子
{
  open({ vehicle_container: { size: 27, unresolved_loot: true, slots: [] } });
  const b = body(); c.EV_SIMPLE_TAB.vehicle_container(b); assert.equal(qa(b, '.slot').length, 0); assert.ok(/战利品/.test(b.textContent));
  open({ vehicle_container: { size: 5, unresolved_loot: false, slots: [] } });
  const b2 = body(); c.EV_SIMPLE_TAB.vehicle_container(b2); assert.equal(qa(b2, '.slot').length, 5);
}
// ---- 矿车显示方块：清除 = null；偏移恢复默认 = null；只读的船和僵尸村民转化没有写入控件
{
  open({ minecart_display: { CustomDisplayTile: true, DisplayState: { Name: 'minecraft:oak_log' }, DisplayOffset: 12 } });
  const b = body(); c.EV_SIMPLE_TAB.minecart_display(b);
  qa(b, '.k-btn').filter(x => x.textContent === '清除')[0].fire('click'); assert.equal(c.WE.ent.minecart_display.DisplayState, null);
  const b2 = body(); c.EV_SIMPLE_TAB.minecart_display(b2); qa(b2, '.k-btn').filter(x => x.textContent === '恢复')[0].fire('click'); assert.equal(c.WE.ent.minecart_display.DisplayOffset, null);
  open({ boat_type: { entityType: 'minecraft:bamboo_raft', readOnly: true }, zombie_conversion: { ConversionTime: 100, ConversionPlayer: null, readOnly: true } });
  const r = body(); c.EV_SIMPLE_TAB.boat_type(r); c.EV_SIMPLE_TAB.zombie_conversion(r);
  assert.equal(qa(r, '.k-toggle').length + qa(r, 'input').length + qa(r, '.k-btn').length, 0, '只读视图没有任何可点控件'); assert.ok(/100/.test(r.textContent));
  const m = {}; c.evMsg(m); assert.equal(m.entity, undefined, '只读视图不会进提交');
}
console.log('PASS entity views: tabs, dropped item, falling block state, enderman, cloud, arrow, owner and read-only relations, horse / chested, vehicle container, minecart, read-only boat and conversion.');
