// 玩家扩展（位置 / 重生点 / 配方 / 成就 / 统计 / 离线玩家）的界面测试：读 → 渲染 → 写草稿 → 应用 → 回执；
// 被拒绝或超时保留草稿，saved 才清；成就只给自己；离线玩家要完整 UUID 才发请求。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c, sent = t.sent;
c.snd = () => {}; c.Reg.meta = {};
let toasts = []; c.toast = (m, k) => toasts.push(m + (k ? '|' + k : ''));
c.weActive = () => true; let redraws = 0; c.weRedrawBody = () => { redraws++; };
const qa = (el, sel) => el.querySelectorAll(sel), json = x => JSON.stringify(x);
const body = () => c.h('div');
const px = () => sent.filter(s => s[0] === 'player_extended').map(s => s[1]);
const last = () => px()[px().length - 1];
const tbtn = (label) => (c.WE.toolsExtra || []).filter(n => n.classList.contains('k-btn') && n.textContent.indexOf(label) >= 0)[0];
const btn = (el, label) => qa(el, '.k-btn').filter(x => x.textContent.indexOf(label) >= 0)[0];
function open(self) {
  c.WE.w = { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', uuid: self ? 'self-uuid' : '11111111-2222-3333-4444-555555555555' }, player: { self } };
  c.pxReset(); sent.length = 0; toasts = [];
}
function opened(req, view, value, schema, extra) {
  c.pxResult(Object.assign({ status: 'opened', requestId: req.requestId, playerExtended: Object.assign({ target: {}, view, revision: 'r-' + view, value, schema: schema || {}, total: ((value && value.entries) || []).length, nextOffset: null }, extra || {}) }));
}

// ---- 位置：先读，到了才画表单；传送带上最近一次 revision；拒绝保留草稿，saved 才清
{
  open(true);
  let b = body(); c.pxPosition(b);
  assert.equal(px().length, 1); assert.equal(last().action, 'read'); assert.equal(last().view, 'position'); assert.equal(json(last().target), '{}', '自己不带 uuid');
  assert.ok(/正在读取/.test(b.textContent), '读取中显示占位');
  opened(last(), 'position', { dimension: 'minecraft:overworld', x: 1.5, y: 64, z: 2.5, yaw: 90, pitch: 0 }, { dimensions: ['minecraft:overworld', 'minecraft:the_nether'], manualId: true });
  b = body(); c.pxPosition(b);
  assert.ok(px().some(r => r.view === 'respawn' && r.action === 'read'), '位置到了之后才去读重生点');
  assert.equal(btn(b, '传送'), undefined, '位置页没有自己的应用按钮，走顶栏「应用修改」'); assert.equal(c.pxDirtyCount(), 0, '没改就没有草稿');
  c.pxState('position').draft.x = 1.5 + 10; assert.deepEqual(Array.from(c.pxDirtyViews()), ['position'], '改了坐标就算有未应用的修改');
  c.pxApplyAll();
  assert.equal(last().action, 'apply'); assert.equal(last().view, 'position'); assert.equal(last().revision, 'r-position', '带最近一次读到的 revision');
  assert.equal(last().patch.x, 11.5); assert.equal(last().patch.dimension, 'minecraft:overworld');
  c.pxResult({ status: 'rejected', requestId: last().requestId, code: 'chunk_unavailable' });
  assert.ok(toasts.some(x => /无法加载传送目标/.test(x)), '被拒绝给出中文原因');
  assert.ok(c.pxState('position').draft, '被拒绝保留草稿');
  opened(last(), 'position', { dimension: 'minecraft:the_nether', x: 8, y: 70, z: 8, yaw: 0, pitch: 0 }, {}, {});
  c.pxState('position').draft = { x: 99 };
  c.pxResult({ status: 'saved', requestId: (() => { b = body(); c.pxPosition(b); c.pxApplyAll(); return last().requestId; })(), playerExtended: { revision: 'r2', value: { dimension: 'minecraft:the_nether', x: 8, y: 70, z: 8, yaw: 0, pitch: 0 }, schema: {} } });
  assert.equal(c.pxState('position').draft, null, 'saved 之后清草稿');
  assert.equal(c.pxState('position').revision, 'r2', 'saved 更新 revision');
}

// ---- 重生点：没有时显示空状态；设为当前位置后可保存；清除提交 null
{
  open(true);
  c.pxState('position').status = 'ready'; c.pxState('position').loaded = true; c.pxState('position').value = { dimension: 'minecraft:overworld', x: 3.7, y: 10.2, z: -4.1, yaw: 45 };
  let b = body(); c.pxRespawn(b);
  opened(last(), 'respawn', null, { dimensions: ['minecraft:overworld'] });
  b = body(); c.pxRespawn(b);
  assert.ok(/没有自定义重生点/.test(b.textContent));
  btn(b, '设为当前位置').fire('click');
  assert.equal(json(c.pxState('respawn').draft), json({ dimension: 'minecraft:overworld', x: 3, y: 10, z: -5, yaw: 45, forced: false }), '用当前位置取整');
  b = body(); c.pxRespawn(b);
  btn(b, '清除重生点').fire('click');
  assert.equal(last().action, 'apply'); assert.equal(last().patch, null, '清除提交 null');
}

// ---- 配方：只发改过的；高亮必须已解锁；超过 64 项分批
{
  open(true);
  let b = body(); c.pxRecipes(b);
  opened(last(), 'recipes', { entries: [{ id: 'minecraft:stick', unlocked: false, highlighted: false }, { id: 'minecraft:bread', unlocked: true, highlighted: false }] }, { manualId: true });
  b = body(); c.pxRecipes(b);
  const toggles = qa(b, '.k-toggle'); assert.equal(toggles.length, 4, '每个配方两个开关');
  toggles[1].fire('click'); // stick 的「高亮」：自动带上已解锁
  const d = c.pxState('recipes').dirty['minecraft:stick'];
  assert.equal(json(d), json({ id: 'minecraft:stick', unlocked: true, highlighted: true }), '高亮会同时解锁');
  b = body(); c.pxRecipes(b);
  assert.equal(c.pxDirtyCount(), 1, '顶栏的未应用计数包含这一项'); assert.equal(tbtn('应用'), undefined, '工具行里没有自己的应用按钮');
  c.pxApplyAll();
  assert.equal(json(last().patch), json({ entries: [{ id: 'minecraft:stick', unlocked: true, highlighted: true }] }), '只发改过的');
  const st = c.pxState('recipes');
  for (let i = 0; i < 70; i++) st.dirty['r' + i] = { id: 'r' + i, unlocked: true, highlighted: false };
  st.busy = false; const n = px().length; c.pxApplyDirty(st, 'recipes');
  assert.equal(last().patch.entries.length, 64, '一次最多 64 项'); assert.equal(px().length, n + 1);
}

// ---- 成就：只能改自己的；别人的页不读也不发
{
  open(false);
  const b = body(); c.pxAdvancements(b);
  assert.equal(px().length, 0, '别人的成就页不发请求'); assert.ok(/只能修改自己/.test(b.textContent));
  open(true);
  const b2 = body(); c.pxAdvancements(b2);
  opened(last(), 'advancements', { entries: [{ id: 'minecraft:story/root', done: false, criteria: [{ name: 'crafting_table', done: false }] }] }, { selfOnly: true });
  const b3 = body(); c.pxAdvancements(b3);
  assert.ok(/story\/root|root/.test(b3.textContent), '列出成就');
}

// ---- 别的在线玩家：target 带 slot.uuid
{
  open(false);
  const b = body(); c.pxStats(b);
  assert.equal(last().view, 'stats'); assert.equal(last().target.uuid, '11111111-2222-3333-4444-555555555555'); assert.ok(!last().target.offline);
}

// ---- 统计：没改就应用时提示，不发请求
{
  open(true);
  let b = body(); c.pxStats(b);
  opened(last(), 'stats', { entries: [{ type: 'minecraft:custom', id: 'minecraft:jump', value: 3 }] }, { min: 0, max: 2147483647 });
  b = body(); c.pxStats(b); const n = px().length;
  c.pxApplyAll();
  assert.equal(px().length, n, '没有修改不发请求'); assert.equal(c.pxDirtyCount(), 0);
  // 放弃：清掉所有草稿
  c.pxState('stats').dirty['x|y'] = { type: 'x', id: 'y', value: 1 }; assert.equal(c.pxDirtyCount(), 1); c.weMarkDirty = () => {}; c.pxDiscard(); assert.equal(c.pxDirtyCount(), 0, '放弃玩家页的修改');
  // 成就页只对自己出现
  c.WE.w = { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', uuid: 'u2' }, player: { self: false } }; assert.ok(!c.weTabs().some(x => x.id === 'padv'), '别人的玩家页没有成就');
  c.WE.w.player.self = true; assert.ok(c.weTabs().some(x => x.id === 'padv'), '自己的有成就');
}

// ---- 存档玩家：名单 → 点开导出摘要和预设 → 复制到保险库 / 套用到我 / 改原始数据
{
  open(true); c.Reg.live = () => true;
  const uploads = [], vcalls = []; c.Vault.upload = (tx, cb) => { uploads.push(JSON.parse(tx)); cb({ ok: true, token: 'tok' }); };
  c.Vault.call = (op, f, cb) => { vcalls.push([op, f]); cb(op === 'save' ? { ok: true, entry: { id: 'v1', name: f.name, summary: { sections: ['inventory'] } } } : { ok: true }); };
  let sections = null; c.vwSections = (en) => { sections = en; };
  let b = body(); c.pxArchive(b);
  assert.equal(last().view, 'players'); assert.equal(last().action, 'read');
  const list = [{ uuid: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Rinorsi', online: true, self: true, owner: true, last_played_ms: null },
    { uuid: 'bbbbbbbb-0000-0000-0000-000000000002', name: null, online: false, self: false, owner: false, last_played_ms: 1794153600000 }];
  opened(last(), 'players', { entries: list }, { readOnly: true });
  b = body(); c.pxArchive(b);
  assert.ok(/Rinorsi/.test(b.textContent) && /未知玩家/.test(b.textContent), '名字缺失显示「未知玩家」'); assert.ok(/你/.test(b.textContent) && /在线/.test(b.textContent) && /房主/.test(b.textContent), '标出你 / 在线 / 房主');
  assert.ok(c.WE.toolsExtra.length === 1, '搜索框在工具行');
  // 点开第二位：发导出请求（离线）
  qa(b, '.k-xhead')[1].fire('click');
  assert.equal(last().action, 'export_preset'); assert.equal(last().target.uuid, list[1].uuid); assert.equal(last().target.offline, true, '离线玩家按离线导出');
  c.pxResult({ status: 'exported', requestId: last().requestId, summary: { game_mode: 'survival', health: 18, food: 20, xp_level: 5, dimension: 'minecraft:overworld', x: 1.4, y: 64, z: 2, inventory_count: 7, ender_count: 2, equipment: { head: 'minecraft:iron_helmet', chest: null, legs: null, feet: null, offhand: null } }, template: { sections: { inventory: { slots: [] } } } });
  b = body(); c.pxArchive(b);
  assert.ok(/生存/.test(b.textContent) && /背包/.test(b.textContent) && /7 件/.test(b.textContent), '摘要里有模式 / 背包数量');
  btn(b, '复制到保险库').fire('click');
  assert.equal(uploads[0].template.sections.inventory.slots.length, 0, '上传的是导出的模板'); const sv = vcalls.filter(x => x[0] === 'save')[0][1]; assert.equal(sv.kind, 'player_preset'); assert.equal(sv.uploadToken, 'tok'); assert.ok(/的数据/.test(sv.name));
  btn(b, '套用到我').fire('click'); assert.ok(sections && sections.id === 'v1', '先存进保险库再走选分区 → 预览 → 备份检查 → 确认');
  assert.ok(btn(b, '改原始数据'), '离线且不是房主可以改原始数据');
  // 房主在线：不给改原始数据；也没有「套用到我」（那是自己）
  qa(b, '.k-xhead')[0].fire('click'); assert.equal(last().target.offline, false, '在线玩家按在线导出');
  c.pxResult({ status: 'exported', requestId: last().requestId, summary: {}, template: { sections: {} } });
  b = body(); c.pxArchive(b); assert.equal(btn(b, '改原始数据') === undefined || qa(b, '.k-btn').filter(x => /改原始数据/.test(x.textContent)).length === 1, true);
  // 导出被拒：显示原因
  qa(b, '.k-xhead')[1].fire('click'); qa(b, '.k-xhead')[1].fire('click');
}
// ---- 列表页：搜索框和应用按钮在顶部工具行；名字走游戏语言（翻译键）；成就能点开看条件
{
  open(true); c.Reg.live = () => true; c.Tr.map['advancements.story.root.title'] = '我的世界'; c.Tr.map['advancements.story.root.description'] = '游戏的核心与目标';
  c.Tr.map['stat.minecraft.jump'] = '跳跃次数'; c.Tr.map['stat_type.minecraft.custom'] = '通用';
  let b = body(); c.pxAdvancements(b);
  assert.equal(last().displayed, true, '成就默认只要玩家界面里看得见的');
  opened(last(), 'advancements', { entries: [{ id: 'minecraft:story/root', title_key: 'advancements.story.root.title', description_key: 'advancements.story.root.description', has_display: true, done: false, criteria: [{ name: 'crafting_table', done: false }] }] }, {});
  c.WE.toolsExtra = null; b = body(); c.pxAdvancements(b);
  assert.ok(c.WE.toolsExtra && c.WE.toolsExtra.some(n => n.querySelector && n.querySelector('input')), '搜索框在工具行里，不在滚动区里'); assert.equal(qa(b, 'input').length, 0, '滚动区里没有搜索框');
  assert.ok(/我的世界/.test(b.textContent) && /游戏的核心与目标/.test(b.textContent), '用翻译后的中文名和说明');
  assert.ok(/含内部成就/.test(b.textContent), '内部成就开关在段标题上'); assert.equal(c.WE.toolsExtra.length, 1, '工具行里只有搜索框');
  assert.equal(qa(b, '.k-toggle').length, 0, '没展开时不显示条件');
  qa(b, '.k-xhead')[0].fire('click'); // 点开：记下展开状态并重画
  assert.equal(c.pxState('advancements').open['minecraft:story/root'], true, '点一下就展开');
  b = body(); c.pxAdvancements(b); assert.equal(qa(b, '.k-toggle').length, 1, '展开后列出条件开关');
  // 统计的名字
  open(true); b = body(); c.pxStats(b); opened(last(), 'stats', { entries: [{ type: 'minecraft:custom', id: 'minecraft:jump', value: 3 }] }, {});
  b = body(); c.pxStats(b); assert.ok(/跳跃次数/.test(b.textContent) && /通用/.test(b.textContent), '统计用翻译后的中文名');
}
// ---- 回执只认自己发的请求；陌生 requestId 被忽略
{
  open(true);
  const before = redraws; c.pxResult({ status: 'saved', requestId: 'nope', playerExtended: { value: {} } });
  assert.equal(redraws, before, '陌生回执不重画');
}
console.log('PASS player extension: position / respawn / recipes / advancements / stats / offline read, draft, apply, receipt.');
// ---- Tr 接收宿主翻译页：map 和 entries 两种形状，多页累积
{
  c.Tr.accept({ map: { 'a.b': '甲' } }); c.Tr.accept({ entries: [{ id: 'c.d', name: '乙' }] });
  assert.equal(c.Tr.get('a.b'), '甲'); assert.equal(c.Tr.get('c.d'), '乙');
}
