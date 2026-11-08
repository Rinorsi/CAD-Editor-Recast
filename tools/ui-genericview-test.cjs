// 通用字段视图（模组方块实体 / 实体）的界面测试：按后端给的字段类型画控件，改动写成 SNBT 字符串草稿，只读和认不准的字段不给写。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.Reg.meta = {};
let toasts = []; c.toast = (m) => toasts.push(m);
c.weRender = () => {};
const qa = (el, sel) => el.querySelectorAll(sel);
const body = () => c.h('div');
const fields = {
  energy: { type: 'integer', nbt_type: 'int', default_snbt: '12', editable: 'structured', read_only: false },
  ratio: { type: 'number', nbt_type: 'float', default_snbt: '0.5f', editable: 'structured', read_only: false },
  active: { type: 'boolean', default_snbt: 'false', editable: 'structured', read_only: false },
  label: { type: 'string', default_snbt: '"hi"', editable: 'structured', read_only: false },
  big: { type: 'integer', nbt_type: 'long', default_snbt: '9007199254740993L', editable: 'structured', read_only: false },
  tags: { type: 'array', default_snbt: '[]', editable: 'snbt_only', read_only: true, editable_reason: '空列表无法推断元素类型' },
  owner: { type: 'object', default_snbt: '{a:1}', editable: 'structured', read_only: false }
};
const value = { energy: '12', ratio: '0.5f', active: 'false', label: '"hi"', big: '9007199254740993L', tags: '[]', owner: '{a:1}' };
function open() { c.WE.w = { kind: 'block', views: { generic: { value, snbt: '{}', schema: { available: true, fields } } } }; c.WE.views = {}; toasts = []; }

// ---- 渲染：每个字段一行；只读字段不给写
{
  open(); const b = body(); c.WEV.generic(b, 'generic');
  const text = b.textContent;
  for (const k of ['energy', 'ratio', 'active', 'label', 'big', 'tags', 'owner']) assert.ok(text.indexOf(k) >= 0, '有字段 ' + k);
  assert.ok(/空列表无法推断元素类型/.test(text), '只读字段说明原因');
  assert.equal(qa(b, '.k-toggle').length, 1, '只有布尔字段是开关');
}
// ---- 开关 / 字符串 / 复合：写成 SNBT 字符串草稿；改回原值草稿消失
{
  open(); const b = body(); c.WEV.generic(b, 'generic');
  qa(b, '.k-toggle')[0].fire('click');
  assert.equal(c.weVal('generic', 'active'), 'true', '布尔写成 true');
  qa(b, '.k-toggle')[0].fire('click');
  assert.equal(c.weVal('generic', 'active'), 'false'); assert.equal(Object.keys(c.WE.views).length, 0, '改回原值就没有草稿');
  const inputs = qa(b, 'input');
  const label = inputs.filter(i => i.value === 'hi')[0]; assert.ok(label, '字符串字段显示去掉引号的内容');
  label.value = 'a "q"'; label.fire('change');
  assert.equal(c.weVal('generic', 'label'), JSON.stringify('a "q"'), '字符串按 SNBT 加引号转义');
  const owner = inputs.filter(i => i.value === '{a:1}')[0]; assert.ok(owner, '复合字段给 SNBT 文本框');
  owner.value = '{a:1'; owner.fire('change');
  assert.ok(toasts.some(x => /不是有效的 SNBT/.test(x)), '语法错误当场拦住'); assert.equal(c.weVal('generic', 'owner'), '{a:1}', '没写进草稿');
  owner.value = '{a:2}'; owner.fire('change');
  assert.equal(c.weVal('generic', 'owner'), '{a:2}');
}
// ---- long 不经过 JS 数字：用文本框，原样保留
{
  open(); const b = body(); c.WEV.generic(b, 'generic');
  const big = qa(b, 'input').filter(i => i.value === '9007199254740993L')[0]; assert.ok(big, 'long 字段是文本框，不丢精度');
}
// ---- 实体：同一个渲染器，草稿走 evSet
{
  c.WE.w = { kind: 'entity', type: 'mod:thing', views: { generic: { value: { mood: '3' }, schema: { fields: { mood: { type: 'integer', nbt_type: 'int', default_snbt: '3', editable: 'structured', read_only: false } } } } } };
  c.WE.ent = {}; const b = body(); c.EV_SIMPLE_TAB.generic(b);
  assert.ok(/mood/.test(b.textContent));
  c.WE.w.slot = {}; c.WE.w.type = 'mod:thing'; assert.ok(c.weTabs().some(x => x.id === 'gents'), '实体有单独的「其他设置」页'); const ids = c.weTabs().map(x => x.id); assert.equal(ids[ids.length - 1], 'data'); assert.equal(ids[ids.length - 2], 'gents', '放在「数据」前面');
}
// ---- 没有字段时给出去数据页的提示
{
  c.WE.w = { kind: 'block', views: { generic: { value: {}, schema: { available: false, editable_reason: '工厂失败', fields: {} } } } }; c.WE.views = {};
  const b = body(); c.WEV.generic(b, 'generic');
  assert.ok(/工厂失败/.test(b.textContent) && /数据/.test(b.textContent));
}
console.log('PASS generic view: typed controls, SNBT string drafts, read-only reasons, long precision, entity path.');
