// SNBT 代码视图：词法高亮、按括号折叠、格式化 / 压缩、出错位置、编辑 ↔ 高亮切换。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.Reg.meta = {};
let toasts = []; c.toast = (m) => toasts.push(m);
const qa = (el, sel) => el.querySelectorAll(sel), cls = (el, k) => qa(el, '.kc-' + k).map(x => x.textContent);
const SAMPLE = '{id:"minecraft:diamond_sword",count:1,components:{"minecraft:damage":5,"minecraft:custom_name":\'Hi\',list:[1b,2s,3L,4.5f],arr:[I;1,2],ok:true}}';

// ---- 词法：键 / 字符串 / 命名空间 ID / 数字（含类型后缀）/ 布尔 / 类型数组前缀
{
  const toks = c.kcTokens(SAMPLE), by = {}; toks.forEach(k => (by[k.t] = by[k.t] || []).push(k.s));
  assert.ok(by.key.includes('id') && by.key.includes('"minecraft:damage"') && by.key.includes('components'), '键');
  assert.ok(by.sid.includes('"minecraft:diamond_sword"'), '命名空间 ID 单独着色');
  assert.ok(by.str.includes("'Hi'"), '普通字符串');
  for (const n of ['1b', '2s', '3L', '4.5f', '5', '1']) assert.ok(by.num.includes(n), '数字 ' + n);
  assert.deepEqual(Array.from(by.bool), ['true']); assert.deepEqual(Array.from(by.kw), ['I'], '类型数组前缀');
  const depths = toks.filter(k => /^o\d$/.test(k.t)).map(k => k.t); assert.ok(depths.includes('o0') && depths.includes('o1') && depths.includes('o2'), '括号按层级着色');
  // 写到一半也能上色，不抛错
  assert.ok(c.kcTokens('{a:"未闭合').some(k => k.t === 'bad'));
}
// ---- 折叠：每行能折到哪一行
{
  const pretty = c.kcFormat(SAMPLE, false), L = c.kcLines(c.kcTokens(pretty));
  assert.equal(L.fold[0], L.lines.length - 1, '第一行折到最后一行'); assert.ok(Object.keys(L.fold).length >= 2, '内层括号也能折');
}
// ---- 检查：有效返回 null，出错给行列
{
  assert.equal(c.kcCheck(SAMPLE), null);
  const bad = c.kcCheck('{\n  a: 1,\n  b: ]\n}'); assert.ok(bad && bad.message, '给出原因'); assert.equal(bad.line, 3, '定位到第 3 行');
}
// ---- 格式化 / 压缩往返，类型后缀不丢
{
  const pretty = c.kcFormat(SAMPLE, false), compact = c.kcFormat(pretty, true);
  assert.ok(pretty.indexOf('\n') > 0); assert.equal(compact.indexOf('\n'), -1);
  for (const s of ['1b', '2s', '3L', '4.5f', '[I;1,2]']) assert.ok(compact.includes(s), '保留 ' + s);
  assert.equal(c.kcFormat(compact, true), compact, '压缩幂等');
}
// ---- 组件：高亮视图有行号和彩色，点击进入编辑，输入时回调带检查结果
{
  const got = []; const code = c.kCode({ value: c.kcFormat(SAMPLE, false), onInput: (tx, err) => got.push([tx, err]) });
  assert.ok(qa(code.el, '.kc-r').length > 5, '每行一个元素'); assert.ok(cls(code.el, 'key').includes('count')); assert.ok(cls(code.el, 'sid').length >= 1);
  assert.equal(qa(code.el, '.kc-fd.on').length >= 2, true, '有可折叠的行');
  qa(code.el, '.kc-fd.on')[0].fire('click'); assert.ok(/行/.test(code.el.textContent) && qa(code.el, '.kc-r').length < 4, '折叠后只剩开头一行');
  qa(code.el, '.kc-fd.on')[0].fire('click'); assert.ok(qa(code.el, '.kc-r').length > 5, '再点展开');
  // 点一行：这一行就地变成输入框，其余行仍是彩色
  qa(code.el, '.kc-r')[1].fire('click'); const li = qa(code.el, '.kc-li')[0]; assert.ok(li, '点一行就地编辑'); assert.ok(qa(code.el, '.kc-key').length > 3, '其余行仍然彩色');
  li.value = '  id: "minecraft:stone",'; li.fire('blur');
  assert.ok(code.get().indexOf('"minecraft:stone"') > 0, '失焦提交这一行'); assert.equal(got[got.length - 1][1], null, '回调带检查结果（有效）');
  // Enter 新起一行并沿用缩进；回车后新行进入编辑
  qa(code.el, '.kc-r')[0].fire('click'); const l0 = qa(code.el, '.kc-li')[0]; l0.fire('keydown', { key: 'Enter' });
  assert.equal(code.get().split(String.fromCharCode(10))[1], '  ', '{ 之后新行多缩进两格'); assert.ok(qa(code.el, '.kc-li')[0], '新行自动进入编辑');
  // 切到整段模式：普通文本框，输入时回调带检查结果
  code.focus(); const ta = qa(code.el, 'textarea')[0]; assert.ok(ta.style.display !== 'none', '整段模式');
  ta.value = '{a:'; ta.fire('input'); assert.equal(got[got.length - 1][0], '{a:'); assert.ok(got[got.length - 1][1], '回调里有检查结果');
  assert.equal(code.get(), '{a:');
}
// ---- 一键格式化把非法内容拦住并提示
{
  const code = c.kCode({ value: '{a:' }); toasts = [];
  qa(code.el, '.k-btn').filter(b => b.textContent.indexOf('格式化') >= 0)[0].fire('click'); assert.ok(toasts.some(x => /无法处理/.test(x))); assert.equal(code.get(), '{a:', '内容原样保留');
}
// ---- 只读：没有编辑 / 格式化按钮，点行不进入编辑
{
  const code = c.kCode({ value: SAMPLE, readonly: true });
  assert.equal(qa(code.el, '.k-btn').filter(b => /格式化|压缩/.test(b.textContent)).length, 0);
}
// ---- 很长的内容分块显示
{
  const big = '[' + Array.from({ length: 1000 }, (_, i) => i).join(',\n') + ']'; const code = c.kCode({ value: big });
  assert.ok(qa(code.el, '.kc-r').length <= 400, '首屏最多 400 行'); assert.ok(/还有 \d+ 行/.test(code.el.textContent));
}
console.log('PASS code view: tokens, folding, check positions, format/compact round trip, edit toggle, chunked view.');
