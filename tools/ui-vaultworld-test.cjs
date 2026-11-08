// 保险库 × 世界编辑：存入方块 / 玩家预设、套用前预览、确认才发 apply、方块种类不符当场拦住。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c, sent = t.sent;
c.snd = () => {}; c.Reg.meta = {};
let toasts = []; c.toast = (m) => toasts.push(m);
const uploads = [], calls = []; let reply = {};
c.Vault.upload = (text, cb) => { uploads.push(JSON.parse(text)); cb({ ok: true, token: 'tok' }); };
c.Vault.call = (op, f, cb) => { calls.push([op, f]); cb(reply[op] || { ok: true }); };
const btn = (label) => t.root.querySelectorAll('.k-btn').filter(x => x.textContent.indexOf(label) >= 0)[0];
const block = () => { c.WE.w = { kind: 'block', block: 'minecraft:chest', type: 'minecraft:chest', slot: { kind: 'block', x: 1, y: 2, z: 3 }, revision: 'r1', snbt: '{}' }; c.WE.pending = null; c.WE.seq = 0; c.WE.views = {}; c.WE.slots = {}; c.WE.bstate = {}; c.WE.btype = ''; };
const player = () => { c.WE.w = { kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity' }, revision: 'r2', snbt: '{}', player: { self: true, name: 'Rinorsi' } }; c.WE.pending = null; c.WE.ent = {}; c.WE.slots = {}; };

// ---- 只有方块页和玩家页有这两个按钮
{
  block(); assert.equal(c.vwKind(), 'block'); assert.ok(c.vwActions());
  player(); assert.equal(c.vwKind(), 'player_preset'); assert.ok(c.vwActions());
  c.WE.w = { kind: 'entity', type: 'minecraft:pig' }; assert.equal(c.vwKind(), null); assert.equal(c.vwActions(), null, '普通生物没有');
}
// ---- 存方块：走分段上传，save 带 kind 和 uploadToken，不带 world 本体
{
  block(); c.vwSaveDialog('block'); btn('存入').fire('click');
  assert.equal(uploads.length, 1); assert.equal(uploads[0].world.block, 'minecraft:chest');
  const save = calls.filter(x => x[0] === 'save')[0][1]; assert.equal(save.kind, 'block'); assert.equal(save.uploadToken, 'tok'); assert.equal(save.world, undefined); assert.ok(save.name);
}
// ---- 存玩家预设：默认六个分区
{
  player(); uploads.length = 0; calls.length = 0; c.vwSaveDialog('player_preset'); btn('存入').fire('click');
  assert.equal(JSON.stringify(uploads[0].sections), JSON.stringify(['inventory', 'equipment', 'ender', 'attributes', 'effects', 'game_mode']));
  assert.equal(calls.filter(x => x[0] === 'save')[0][1].kind, 'player_preset');
}
// ---- 套用：先 preview，确认之后才发 apply；apply 带宿主给的 slot / revision / vault_template
{
  player(); uploads.length = 0; calls.length = 0; sent.length = 0;
  const apply = { slot: { kind: 'entity', token: 'tk' }, revision: 'rv9', vault_template: { kind: 'player_preset', template: {}, sections: ['inventory'] } };
  reply.preview = { ok: true, summary: { kind: 'player_preset', target: 'Rinorsi', overwrites: [{ section: 'inventory', before: 3, after: 5 }] }, apply };
  c.vwPreview({ id: 'e1', name: '生存套装' }, ['inventory']);
  const pv = calls.filter(x => x[0] === 'preview')[0][1]; assert.equal(pv.id, 'e1'); assert.equal(pv.uploadToken, 'tok'); assert.equal(JSON.stringify(pv.sections), '["inventory"]');
  assert.equal(sent.filter(s => s[0] === 'apply').length, 0, '确认之前不写任何东西');
  assert.ok(btn('确认套用'), '显示确认'); assert.ok(/背包/.test(t.root.textContent) && /3/.test(t.root.textContent), '列出将被覆盖的内容');
  btn('确认套用').fire('click');
  const ap = sent.filter(s => s[0] === 'apply')[0][1]; assert.equal(ap.revision, 'rv9'); assert.equal(ap.slot.token, 'tk'); assert.equal(ap.vault_template.kind, 'player_preset'); assert.ok(/^w-/.test(ap.requestId));
}
// ---- 方块种类不符：当场拦住，不出现确认
{
  block(); sent.length = 0; toasts = [];
  reply.preview = { ok: false, error: 'block_type_mismatch', reason: 'x' };
  c.vwPreview({ id: 'e2', name: '木桶' }, null);
  assert.ok(toasts.some(x => /方块种类不一样/.test(x)), '给出中文原因'); assert.equal(sent.filter(s => s[0] === 'apply').length, 0);
}
// ---- 页面上有没应用的修改：不让套用
{
  block(); toasts = []; c.WE.slots = { 0: { id: 'minecraft:stone', count: 1 } }; c.WE.w.container = { slots: [], size: 27 };
  c.vwPick('block'); assert.ok(toasts.some(x => /先应用或放弃/.test(x)));
}
console.log('PASS vault x world: save block / preset via upload, preview before apply, type mismatch refused, dirty page refused.');
