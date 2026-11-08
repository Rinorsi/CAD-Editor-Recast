// 拼音搜索：命中正确性、分批过滤（每批一次脚本入口）、取消，不需要浏览器或游戏。
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../common/src/main/resources/assets/cadeditor/ui/js');
const timers = [];
const ctx = vm.createContext({ console, Date, setTimeout(fn) { timers.push(fn); return timers.length; }, document: { addEventListener() {} } });
for (const f of ['data.js', 'pinyin-data.js', 'search.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);

// 1) 命中：全拼、首字母、混写、汉字夹拼音、多音字（石 = shi / dan）
for (const q of ['zuanshijian', 'zsj', 'zuanshij', 'zuansj', '钻shi剑', '钻石剑', 'shi', 'dan', 'zuandanjian'])
  assert.equal(run(`kMatch("钻石剑", ${JSON.stringify(q)})`), true, q + ' 应命中 钻石剑');
for (const q of ['zuanshijiang', 'abc', 'qsj', '铁shi剑'])
  assert.equal(run(`kMatch("钻石剑", ${JSON.stringify(q)})`), false, q + ' 不应命中 钻石剑');
assert.equal(run('kMatch("minecraft:diamond_sword 钻石剑", "diamond")'), true, '英文子串');
assert.equal(run('kMatch("", "")'), true);

// 2) 必要条件过滤不能误杀：构造“查询字母是全读音串子序列”的混写
assert.equal(run('kMatch("中国人民", "zhonggrm")'), true, '全拼 + 首字母混写');
assert.equal(run('kMatch("中国人民", "zgrm")'), true);
assert.equal(run('kMatch("中国人民", "zhonggrx")'), false);

// 3) 分批过滤：结果与一次性 filter 完全一致，并且确实分成了多批（每批一次新入口）
const names = run('EDATA.items.map(function (i) { return (EDATA.iname[i] || i) + " minecraft:" + i; })');
assert.ok(names.length > 1000);
for (const q of ['shi', 'zsj', 'tou', 'zhong']) {
  const direct = run(`(function(){ kSearchBegin(true); var r = ${JSON.stringify(names)}.filter(function (t) { return kMatch(t, ${JSON.stringify(q)}); }); kSearchBegin(false); return r; })()`);
  timers.length = 0;
  let got = null, calls = 0;
  ctx.__names = names; ctx.__q = q; ctx.__done = r => { got = r; };
  run('var __cancel = kFilterSliced(__names, function (t) { return kMatch(t, __q); }, __done, -1);');   // 预算为负：每 8 条就让出一次
  while (timers.length) { calls++; timers.shift()(); }
  assert.deepEqual(Array.from(got), Array.from(direct), q + '：分批结果必须与一次性过滤一致');
  assert.ok(calls > 10, q + '：应当分成很多批，实际 ' + calls);
}

// 4) 取消：取消后不再回调
timers.length = 0;
let doneCalled = false;
ctx.__d2 = () => { doneCalled = true; };
run('var __c2 = kFilterSliced(__names, function (t) { return kMatch(t, "shi"); }, __d2, -1);');
timers.shift()();
run('__c2()');
while (timers.length) timers.shift()();
assert.equal(doneCalled, false, '取消后不应回调');

// 5) 小列表同步完成
let small = null;
ctx.__small = r => { small = r; };
run('kFilterSliced(["钻石剑","铁剑"], function (t) { return kMatch(t, "zsj"); }, __small);');
assert.deepEqual(Array.from(small), ['钻石剑']);

// 6) 精确模式不被总预算截断，快速模式有预算但不会死循环
run('kSearchBegin(false);');
assert.equal(run('DFS_LEFT'), 40000);
run('kSearchBegin(true);');
assert.ok(run('DFS_LEFT') > 1e8);
run('kSearchBegin(false);');
console.log('PASS search: pinyin hits, sliced filter equals direct filter in many entries, cancel, small-list sync.');
