// 单个原生彩色多行模型：无第二视图、精确诊断、局部字号与输入连续性。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
H.Element.prototype.setTextHighlights=function(source,ranges,numbers) { assert.equal(source,this.value); this.highlight={source,ranges,numbers}; return true; };
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
// ---- 组件：可编辑项默认就是同一个原生 textarea；输入不重建节点、不自动格式化
{
  const got = []; const code = c.kCode({ value: c.kcFormat(SAMPLE, false), onInput: (tx, err) => got.push([tx, err]) });
  const ta = qa(code.el, 'textarea')[0];
  assert.ok(ta && ta.style.display !== 'none', '默认显示原生多行文本框');
  assert.equal(qa(code.el, '.kc-view').length, 0, '不创建第二块只读高亮预览');
  assert.equal(qa(code.el, '.kc-li').length, 0, '不再创建逐行 input');
  const pasted = SAMPLE + ' '.repeat(40);
  ta.value = pasted; ta.fire('input');
  assert.equal(code.get(), pasted, '输入立即保存在完整文本中');
  assert.equal(ta.highlight.source,pasted); assert(ta.highlight.ranges.some(r=>pasted.slice(r.start,r.end)==='count')); assert.equal(ta.highlight.numbers,true);
  assert.strictEqual(qa(code.el, 'textarea')[0], ta, '输入后保留同一个 textarea 节点');
  assert.equal(got[got.length - 1][0], pasted);
  const pending = t.timers[t.timers.length - 1]; if (pending) pending.fn();
  assert.equal(ta.value, pasted, '长单行粘贴也不会自动格式化或改写 value');
  let prevented = false;
  for (const key of ['a', 'c', 'x', 'v', 'z', 'y', 'ArrowLeft', 'ArrowDown', 'Home', 'End']) {
    prevented = false; ta.fire('keydown', { key, ctrlKey: /^[acxvzy]$/.test(key), shiftKey: key === 'ArrowDown', preventDefault() { prevented = true; } });
    assert.equal(prevented, false, key + ' 保留给 Oriel 原生文本模型处理');
  }
  // 只有显式的 Ctrl+Enter 是页面自己的“应用”快捷键。
  let applied = 0; const withApply = c.kCode({ value: SAMPLE, onApply: () => applied++ }); const applyTa = qa(withApply.el, 'textarea')[0];
  prevented = false; applyTa.fire('keydown', { key: 'Enter', ctrlKey: true, preventDefault() { prevented = true; } });
  assert.equal(applied, 1); assert.equal(prevented, true);

  const pretty = c.kcFormat(SAMPLE, false); code.set(pretty, true);
  ta.selectionStart=3;ta.selectionEnd=12;ta.scrollTop=23;
  qa(code.el,'.k-btn').find(b=>b.textContent==='A+').fire('click');
  assert.strictEqual(qa(code.el,'textarea')[0],ta);
  assert.equal(ta.selectionStart,3);assert.equal(ta.selectionEnd,12);assert.equal(ta.scrollTop,23);
  assert.equal(ta.value,pretty);assert.equal(ta.style.fontSize,'13px');
  assert.equal(qa(code.el,'.kc-view').length,0);assert.equal(qa(code.el,'.kc-r').length,0);
  assert(!qa(code.el,'.k-btn').some(b=>/预览|折叠|编辑模式|高亮模式/.test(b.textContent)));
}
// ---- 一键格式化把非法内容拦住并提示
{
  const code = c.kCode({ value: '{a:' }); toasts = [];
  qa(code.el, '.k-btn').find(b => b.getAttribute('data-code-action') === 'format').fire('click'); assert.ok(toasts.some(x => /无法处理/.test(x))); assert.equal(code.get(), '{a:', '内容原样保留');
}
// ---- 只读：没有编辑 / 格式化按钮，点行不进入编辑
{
  const code = c.kCode({ value: SAMPLE, readonly: true });
  assert.equal(qa(code.el, '.k-btn').filter(b => /^(format|compact)$/.test(b.getAttribute('data-code-action'))).length, 0);
}
// ---- 长文本也始终是同一个完整原生输入模型，不分行、不截断。
{
  const big = '[' + Array.from({ length: 1000 }, (_, i) => i).join(',\n') + ']'; const code = c.kCode({ value: big });
  assert.equal(qa(code.el,'textarea').length,1);assert.equal(qa(code.el,'textarea')[0].value,big);
  assert.equal(qa(code.el,'.kc-r').length,0);assert.equal(qa(code.el,'input').length,0);
}
// Missing, rejected and throwing native APIs must fail visibly.
{
 const original=H.Element.prototype.setTextHighlights;
 for(const replacement of [undefined,function(){return false;},function(){throw Error('bad ARGB');}]) {
  H.Element.prototype.setTextHighlights=replacement;const code=c.kCode({value:SAMPLE});
  assert.equal(code.el.getAttribute('data-highlight'),'failed');assert.match(code.el.textContent,/高亮不可用/);
 }
 H.Element.prototype.setTextHighlights=original;
}
// Invalid syntax retains lexical colors and navigates to the actual parser offset.
{
 const code=c.kCode({value:'{\n  a: 1,\n  b: ]\n}'}),ta=qa(code.el,'textarea')[0];
 ta.setSelectionRange=(a,b)=>{ta.selectionStart=a;ta.selectionEnd=b;};
 assert.equal(code.check().line,3);assert(ta.highlight.ranges.some(r=>r.color===c.KC_COLORS.key));
 qa(code.el,'.kc-st')[0].fire('click');assert.equal(ta.selectionStart,code.check().pos);
 assert.equal(t.doc.activeElement,ta);assert(!ta.classList.contains('bad'));
}
console.log('PASS native single multiline highlight API/failure, input/shortcut/selection/font continuity, long text, format/types, exact error navigation and readonly JSON');
