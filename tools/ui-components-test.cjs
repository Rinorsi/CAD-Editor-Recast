// 公共组件的单元测试：行组件、kInput onCommit、xList 扩展、弹窗外壳、kColorPop、标签和名字入口。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create(), c = t.c;
c.snd = () => {}; c.toast = () => {}; c.Reg.meta = {};
const text = el => el.textContent;
const q = (el, sel) => el.querySelector(sel);

// ---- xNum：范围提示、说明随数值变化、非数字用默认值
{
  let got; const row = c.xNum({ title: '生命', min: 0, max: 20, range: true, value: 5, onChange: v => got = v });
  assert.equal(text(q(row, '.z')), '生命'); assert.equal(text(q(row, '.s')), '范围 0 ~ 20');
  assert.ok(q(row, '.k-xnum'), '数字框带 k-xnum');
  assert.equal(c.xNum({ title: 'a', value: 'x', def: 7, onChange() {} }).num.get(), 7, '不是数字就用 def');
  assert.equal(q(c.xNum({ title: 'a', sub: '手写说明', min: 0, max: 5, range: true, value: 1, onChange() {} }), '.s').textContent, '手写说明', '手写说明优先于范围');
  assert.equal(q(c.xNum({ title: 'a', min: 0, range: true, value: 1, onChange() {} }), '.s'), null, 'min / max 不全就不写范围');
  const r2 = c.xNum({ title: '刻', value: 40, subOf: v => v + ' 刻', onChange() {} });
  assert.equal(text(q(r2, '.s')), '40 刻');
  r2.num.set ? r2.num.set(10) : 0;
  assert.equal(r2.querySelectorAll('.ic').length, 0, '默认没有图标盒');
  assert.equal(c.xNum({ title: 'a', icon: c.uiIcon('sword', 14), value: 1, onChange() {} }).querySelectorAll('.ic').length, 1, '给了图标才画');
}
// ---- xToggle
// Float/double inputs keep native precision; step sizes only guide interaction.
{
  const changed = [];
  const value = 0.12345678901234566;
  const row = c.xNum({ title: '精度', value, min: 0, max: 1, step: 0.05, dec: 3, preservePrecision: true, onChange: v => changed.push(v) });
  const input = q(row, '.k-numin');
  assert.equal(input.value, String(value), 'display does not truncate the stored value');
  input.fire('change'); assert.equal(changed.pop(), value, 'unchanged typed value stays exact');
  input.value = '0.9876543210987654'; input.fire('change');
  assert.equal(changed.pop(), 0.9876543210987654, 'manual input is independent of step/dec');
  input.value = 'Infinity'; input.fire('change'); assert.equal(changed.length, 0, 'player controls remain finite');
  assert.match(q(row, '.k-numerr').textContent, /有限/);
  const integer = c.xNum({ title: '整数', value: 4, min: 0, max: 2147483647, dec: 0, onChange() {} });
  const integerInput = q(integer, '.k-numin'); integerInput.value = '2147483647'; integerInput.fire('change');
  assert.equal(integer.num.get(), 2147483647, 'native max int stays exact');
  const generic = c.wNum({t:'num'}, value, () => {}, {});
  assert.equal(q(generic, '.ed-numin').value, String(value), 'generic numeric form also displays full precision');
  let special;
  const approved = c.wNum({t:'num',nbtType:'f',min:0,max:3.4028235e38,allowPositiveInfinity:true}, 1, v => special=v, {});
  const approvedInput = q(approved, '.ed-numin'); approvedInput.value = 'Infinity'; approvedInput.fire('input');
  assert.equal(c.nbtNumberValue(special), Infinity, 'Codec-approved special remains typed');
  assert.equal(approved.classList.contains('bad'), false, 'finite range hint does not override Codec special permission');
  const forbidden = c.wNum({t:'int'}, 1, () => assert.fail('integer special committed'), {});
  const forbiddenInput = q(forbidden, '.ed-numin'); forbiddenInput.value='Infinity'; forbiddenInput.fire('input');
  assert.equal(forbidden.classList.contains('bad'), true, 'integer fields still reject special values');
}
{
  let on = null; const r = c.xToggle({ title: '开关', sub: '说明', value: true, onChange: v => on = v });
  assert.ok(q(r, '.k-toggle').classList.contains('on')); assert.equal(text(q(r, '.s')), '说明');
  r.toggle.el.fire('click'); assert.equal(on, false);
}
// ---- xText + kInput onCommit：输入过程不提交，change 才提交
{
  const live = [], done = []; const r = c.xText({ title: '名字', value: '旧', placeholder: '空', cls: 'we-in', style: 'width:170px', onInput: v => live.push(v), onCommit: v => done.push(v) });
  const inp = r.input; assert.equal(inp.value, '旧'); assert.ok(inp.classList.contains('we-in')); assert.equal(inp.getAttribute('style'), 'width:170px');
  inp.value = '新'; inp.fire('input'); assert.deepEqual(live, ['新']); assert.deepEqual(done, []);
  inp.fire('change'); assert.deepEqual(done, ['新']);
  assert.equal(c.xText({ title: 'a', value: null }).input.value, '', 'null 当空串');
}
// ---- xSeg / xSelect
{
  let v; const r = c.xSeg({ title: '朝向', options: [{ v: 'a', label: 'A' }, { v: 'b', label: 'B' }], value: 'a', onChange: x => v = x });
  const items = r.querySelectorAll('.k-segi'); assert.equal(items.length, 2); items[1].fire('click'); assert.equal(v, 'b');
  const s = c.xSelect({ title: '方式', options: [{ v: 'a', label: 'A' }], value: 'a', width: 200, onChange() {} });
  assert.ok(q(s, '.k-sel'));
}
// ---- splitTags
assert.deepEqual(Array.from(c.splitTags('a，b, c  d,,')), ['a', 'b', 'c', 'd']); assert.deepEqual(Array.from(c.splitTags('')), []); assert.deepEqual(Array.from(c.splitTags(undefined)), []);

// ---- xList：抓手、右键、滚动
{
  const items = [1, 2, 3], moved = [];
  const xl = c.xList({ items: () => items, empty: '没有', sortable: true, onMove: (a, b) => moved.push([a, b]), scroll: 120, context: (it, i) => [{ label: '删除 ' + it, run() {} }],
    row: (it, i) => ({ title: '行' + it, icon: false }) });
  assert.equal(xl.el.querySelectorAll('.k-grip').length, 3, 'sortable 给每行抓手');
  assert.equal(q(xl.el, '.k-sortlist').getAttribute('style'), 'max-height:120px;overflow-y:auto');
  assert.ok(q(xl.el, '.k-xrow').events.contextmenu, '行有右键菜单');
  assert.ok(q(xl.el, '.k-sortlist').events.mousedown, '列表挂了排序');
  const plain = c.xList({ items: () => [], row: () => ({ title: 'x' }) }); assert.equal(plain.el.querySelectorAll('.k-grip').length, 0); assert.ok(/暂无条目/.test(plain.el.textContent));
}
// ---- 弹窗外壳：简单写法 / 自己安排主体的写法，页头由 modalHead 统一
{
  const m1 = c.modalShell('标题', '副标题', [c.h('p', { text: '体' })], [c.h('i')], 'x');
  assert.equal(m1.children[0].className, 'k-mh'); assert.equal(m1.children[1].className, 'k-mb'); assert.equal(m1.children[2].className, 'k-mf'); assert.ok(m1.classList.contains('x'));
  assert.equal(q(m1, '.k-sub').textContent, '副标题'); assert.equal(q(c.modalShell('标题', '', []), '.k-sub'), null, '没有副标题就不画');
  const body = c.h('div', { class: 'advbody' }), foot = c.h('div', { class: 'k-mf' });
  const m2 = c.modalShell({ icon: 'code', title: 'T', sub: '', actions: [c.h('i', { class: 'act' })], cls: 'advwin', id: 'advwin', body, foot });
  assert.equal(m2.id, 'advwin'); assert.equal(m2.children[1], body); assert.equal(m2.children[2], foot);
  const head = m2.children[0].children; assert.equal(head.length, 6, '图标 标题 副标题（空串也画） 空白 操作 ×');
  assert.ok(head[4].classList.contains('act')); assert.equal(head[5].textContent, '×');
}
// ---- kColorPop
{
  let col; const anchor = c.h('div'); t.doc.getElementById('overlays').appendChild(anchor);
  const cc = c.kColorPop(anchor, 0xFF0000, v => col = v, { extra: [c.h('i', { class: 'extra' })] });
  assert.ok(cc && cc.el); const pop = t.doc.getElementById('overlays').querySelector('.k-pop'); assert.ok(pop && pop.querySelector('.extra') && pop.querySelector('.k-pickbox'));
  c.kPopClose();
}
// ---- 名字 / 标签入口
{
  assert.equal(c.entityName('minecraft:cat') === c.nameOf('entity_type', 'minecraft:cat'), true);
  assert.equal(c.optLabel({ v: 'minecraft:ender_pearl', label: 'minecraft:ender_pearl' }), c.humanId('ender_pearl'), '没有翻译就转成可读文字');
  assert.equal(c.optLabel({ v: 'x', label: '中文' }), '中文');
  assert.equal(c.Labels.rarityZh.epic, '史诗'); assert.equal(c.RARITY_ZH, c.Labels.rarityZh); assert.equal(c.SLOT_ZH, c.Labels.slot);
  assert.notEqual(c.Labels.opShort[0].label, c.Labels.opLong[0].label, '两张属性操作表措辞不同，是故意分开的');
}
// ---- 通用表单的 combo：点开是公共 pickFrom 列表（以前的自搭弹层 .ed-pop 被样式隐藏，候选一直看不到）
{
  const picked = []; const ov = t.doc.getElementById('overlays');
  const opts = [{ v: 'a', label: '甲' }, { v: 'b', label: '乙' }];
  const cb = c.combo({ value: 'a', options: opts, free: true, placeholder: '选…', onPick: (v, it) => picked.push([v, it ? it.label : null]) });
  ov.appendChild(cb); assert.ok(cb.classList.contains('k-sel')); assert.ok(/甲/.test(cb.textContent), '显示当前值的中文名');
  cb.fire('click'); const pop = ov.querySelector('.k-pop'); assert.ok(pop, '点开有弹层');
  const rows = pop.querySelectorAll('.k-prow'); assert.equal(rows.length, 2, '候选都列出来');
  rows[1].fire('mousedown'); assert.deepEqual(picked, [['b', '乙']]); assert.ok(/乙/.test(cb.textContent));
  assert.equal(ov.querySelector('.ed-pop'), null, '不再生成被隐藏的旧弹层');
  const add = c.combo({ value: '', options: opts, reset: true, placeholder: '添加…', onPick: v => picked.push([v]) }); ov.appendChild(add);
  add.fire('click'); ov.querySelector('.k-pop').querySelectorAll('.k-prow')[0].fire('mousedown');
  assert.deepEqual(picked[1], ['a']); assert.ok(/添加/.test(add.textContent), '添加用的选完回到占位文字');
  c.kPopClose();
}
// ---- 变种组件卡片的实体预览图标
{
  const e = c.varEntityIcon('cat/variant', 'minecraft:black');
  assert.equal(e.tagName, 'ENTITY'); assert.equal(e.getAttribute('type'), 'minecraft:cat');
  assert.ok(/minecraft:cat\/variant/.test(e.getAttribute('components')) && /minecraft:black/.test(e.getAttribute('components')), '组件值传给预览');
  assert.ok(/minecraft:wolf\/collar/.test(c.varEntityIcon('wolf/collar', 'red').getAttribute('components')), '项圈颜色也能预览');
  assert.ok(/minecraft:cow\/variant/.test(c.varEntityIcon('cow/variant', 'warm').getAttribute('components')) && /minecraft:warm/.test(c.varEntityIcon('cow/variant', 'warm').getAttribute('components')), '没写命名空间的变种值自动补 minecraft:');
  assert.equal(c.varEntityIcon('cat/sound_variant', 'minecraft:classic'), null, '声音变种看不出来，用原图标');
  assert.equal(c.varEntityIcon('painting/variant', 'minecraft:kebab'), null, '画不是生物');
  assert.equal(c.varEntityIcon('horse/variant', 7), null, '值不是字符串就不猜');
  assert.equal(c.varEntityIcon('cat/variant', ''), null);
}
// ---- 悬停提示：原生 title 不进 DOM（否则 Oriel 的原版提示框会和 tip.js 的自绘提示同时出现）
{
  const b = c.h('div', { class: 'k-btn', title: '提示文字' });
  assert.equal(b.getAttribute('title'), null, '没有原生 title'); assert.equal(b.getAttribute('data-tip'), '提示文字');
  assert.equal(c.h('div', { title: '' }).getAttribute('data-tip'), null, '空提示不写');
  const el = c.h('div'); c.setTip(el, 'a'); assert.equal(el.getAttribute('data-tip'), 'a'); c.setTip(el, ''); assert.equal(el.getAttribute('data-tip'), null, '空文字 = 去掉');
  assert.equal(c.kBtn('按钮', () => {}, { title: '说明' }).getAttribute('title'), null, '公共按钮也不带原生 title');
  const tab = c.h('div', { class: 'ed-tab', title: '成就' }, [c.h('span', { text: '成就' })]);
  assert.equal(tab.getAttribute('title'), null, '页签重画后鼠标不动，也不会有原生提示');
}
// ---- 设置里的「关于」：Logo、版本、作者、链接行（打开 = <a href>，复制 = 统一的 copyText）
{
  c.Prefs.init({ about: { version: '9.8.7' } });
  const box = c.h('div'); c.aboutSection(box);
  const head = q(box, '.ab-head');
  assert.ok(head, '设置里有关于区'); assert.equal(q(head, '.ab-logo').getAttribute('src'), 'logo.png'); assert.equal(text(q(head, '.ab-name')), 'CAD Editor');
  assert.ok(text(head).includes('版本 9.8.7'), '版本号来自宿主带来的 about.version');
  const hrefs = box.querySelectorAll('a.ab-btn').map(a => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['https://github.com/Rinorsi/CAD-Editor-Recast', 'https://b23.tv/hjUvs0c', 'https://afdian.com/a/Rinorsi'], '三个链接都有「打开」');
  box.querySelectorAll('a.ab-btn').forEach(a => assert.equal(a.getAttribute('title'), null, '链接按钮也不带原生 title'));
  assert.ok(text(box).includes('云诺羲Rinorsi'), '有作者');
  const acts = box.querySelectorAll('.ab-acts'); assert.equal(acts.length, 3, '三个链接行'); acts.forEach(a => assert.equal(a.children.length, 2, '每行两个按钮：打开 + 复制'));
  c.Prefs.init({}); const box2 = c.h('div'); c.aboutSection(box2);
  assert.ok(!text(q(box2, '.ab-head')).includes('版本'), '宿主没给版本号就不显示，改显示简介'); c.Prefs.init({ about: { version: 'unknown' } });
  const box3 = c.h('div'); c.aboutSection(box3); assert.ok(!text(q(box3, '.ab-head')).includes('unknown'), '版本取不到（unknown）不显示');
  const gen = c.h('div'); c.advSettings(gen, 'ui'); const gen2 = c.h('div'); c.advSettings(gen2, 'adv'); assert.equal(q(gen, '.ab-head'), null, '界面页不带关于区'); assert.equal(q(gen2, '.ab-head'), null, '高级页不带关于区（关于在自己的页签里）');
  assert.equal(text(gen).includes('调试模式'), false, '调试不在界面页'); assert.ok(text(gen2).includes('调试模式') && text(gen2).includes('窗口大小'), '窗口和调试在高级页'); assert.ok(text(gen).includes('界面音效') && text(gen).includes('主题'), '音效、主题在界面页');
}
console.log('PASS components: xNum/xToggle/xText/xSeg/xSelect, kInput onCommit, xList extras, modalShell, kColorPop, combo, variant preview, tooltips, labels / names.');
{
 let pop;const original=c.kPopover;c.kPopover=(anchor,node)=>{pop=node;};
 const obj={Health:4};const row=c.esFlagRow({key:'Health',id:'health',type:'float',min:0,max:1,default:1},{get:()=>obj},fn=>fn(obj));
 const warning=row.querySelector('.k-numwarn');assert.equal(warning.textContent,'超过默认上限 · 说明');
 assert(warning.textContent.length<18,'health row must stay concise');
 warning.fire('click');assert(pop.textContent.includes('默认最大生命值为 1'));assert(pop.textContent.includes('体型、变体'));
 row.num.set(1);assert.equal(warning.style.display,'none','warning disappears at the default bound');c.kPopover=original;
}
{
 const obj={};const row=c.esFlagRow({key:'NoAI',type:'byte-bool',default:false,present_by_default:false},{get:()=>obj},fn=>fn(obj));
 row.toggle.el.fire('click');assert.equal(obj.NoAI,true);
 assert.equal(c.nbtMerge(obj,c.nbtParse('{}')),'{NoAI:true}','a newly added boolean must not become an int tag');
 row.toggle.el.fire('click');assert(!Object.hasOwn(obj,'NoAI'),'default false is omitted again');
}
