// 带类型 SNBT 与游戏校验（nbt.js）的纯逻辑测试：不需要浏览器或游戏。
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../fabric/src/main/resources/assets/cadeditor/ui/js');
const sent = [];
const ctx = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {}, document: { addEventListener() {}, getElementById() { return null; } },
  oriel: { data: {}, on() {}, send(k, v) { sent.push({ k, v }); return true; } } });
for (const f of ['data.js', 'core.js', 'reg.js', 'nbt.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
const run = code => vm.runInContext(code, ctx);

// 1) 没改动：参照原文逐字保留所有类型
const SRC = '{a:1b,b:5s,c:7L,d:2.5f,e:3.0d,f:4,g:0.5,h:"x",i:[1,2],j:[B;1b,2b],k:[I;1,2],l:{m:1b}}';
ctx.SRC = SRC;
assert.equal(run('nbtMerge(parseSnbt(SRC), nbtParse(SRC))'), SRC, '未修改时 SNBT 与原文一致');

// 2) 改值保留原类型；新增字段用普通写法；布尔跟随字节
ctx.SRC = SRC;
assert.equal(run('var v = parseSnbt(SRC); v.b = 6; v.c = 8; v.d = 3; v.e = 4; v.g = 2; v.n = 1; v.p = 0.25; v.l.m = 0; nbtMerge(v, nbtParse(SRC))'),
  '{a:1b,b:6s,c:8L,d:3f,e:4d,f:4,g:2d,h:"x",i:[1,2],j:[B;1b,2b],k:[I;1,2],l:{m:0b},n:1,p:0.25}');
assert.equal(run('var v2 = parseSnbt(SRC); v2.a = true; v2.j = [1, 0, 1]; nbtMerge(v2, nbtParse(SRC))').slice(0, 30), '{a:1b,b:5s,c:7L,d:2.5f,e:3.0d,');
assert.ok(run('var v3 = parseSnbt(SRC); v3.j = [1, 0, 1]; nbtMerge(v3, nbtParse(SRC))').includes('j:[B;1b,0b,1b]'), '类型化数组改长度仍是 [B;');

// 3) 超出 2^53 的 long：页面里已经丢精度，但没改就用原文
const BIG = '{x:9007199254740993L}'; ctx.BIG = BIG;
assert.equal(run('nbtMerge(parseSnbt("{x:9007199254740992}"), nbtParse(BIG))'), BIG);

// 4) 解析的边角：引号键、转义、尾逗号、单引号字符串、布尔
assert.equal(run('nbtMerge({ "a b": "q\\"t", ok: true }, null)'), `{"a b":'q"t',ok:true}`);
ctx.T = "{'k b':'v', n:[1,2,], t:true,}";
assert.equal(run('nbtParse(T).keys.join("|")'), 'k b|n|t');
assert.throws(() => run('nbtParse("{a:1")'), /SNBT/);
assert.throws(() => run('nbtParse("{a 1}")'), /冒号/);

// 5) 什么算“有 JSON 表达不了的类型”
assert.equal(run('nbtHasTyped("{a:1b,b:2}")'), false, '只有 byte 布尔不算');
assert.equal(run('nbtHasTyped("{a:5s}")'), true);
assert.equal(run('nbtHasTyped("{a:7L}")'), true);
assert.equal(run('nbtHasTyped("{a:[I;1,2]}")'), true);
assert.equal(run('nbtHasTyped("{a:\\"5s\\"}")'), false, '字符串里的 5s 不算');

// 6) 提交：只有被编辑过的自由 NBT 组件才改用 SNBT
run(`var d = makeDoc({ key: 'k', id: 'minecraft:stone', comps: { custom_data: { a: 1, b: 2 }, entity_data: { id: 'minecraft:pig' }, damage: 3 }, removed: {},
  snbt: { custom_data: '{a:1b,b:2L}', entity_data: '{id:"minecraft:pig"}' } });`);
assert.equal(run('nbtApplyFormats(d).formats'), null, '没改过：全部走原 JSON 协议，交给宿主保留原值');
run('d.comps.custom_data.b = 5; d.comps.damage = 4;');
const r1 = run('nbtApplyFormats(d)');
assert.deepEqual(JSON.parse(JSON.stringify(r1.formats)), { custom_data: 'snbt' });
assert.equal(r1.comps.custom_data, '{a:1b,b:5L}');
assert.equal(r1.comps.damage, 4, '普通组件仍是 JSON 值');
assert.deepEqual(JSON.parse(JSON.stringify(r1.comps.entity_data)), { id: 'minecraft:pig' }, '没改的自由 NBT 组件不动');
run('d.comps.entity_data.NoAI = 1;');
assert.equal(run('nbtApplyFormats(d).comps.entity_data'), '{id:"minecraft:pig",NoAI:1}', '没有类型参照的新字段用普通写法');
// 带 short/long 参照的普通组件被编辑时也改用 SNBT
run(`var d2 = makeDoc({ key: 'k2', id: 'minecraft:stone', comps: { food: { nutrition: 4 } }, removed: {}, snbt: { food: '{nutrition:4,x:2s}' } }); d2.comps.food.nutrition = 5;`);
assert.equal(run('nbtApplyFormats(d2).comps.food'), '{nutrition:5,x:2s}'.replace(',x:2s', ''));  // JSON 里没有 x，合并不会凭空生成

// 7) 向游戏校验：请求 → 回执 → 当前内容对应的失败进入问题列表
run('Reg.meta = {};');
run('Store.open({ key: "z", id: "minecraft:stone", comps: { custom_data: { a: 1 } }, removed: {}, snbt: { custom_data: "{a:1b}" } }, true);');
run('Store.set("custom_data", { a: 2 });');
run('Valid.run("custom_data")');
const req = sent.filter(s => s.k === 'validate_component').pop();
assert.equal(req.v.component, 'custom_data');
assert.equal(req.v.snbt, '{a:2b}');
run('Valid.run("custom_data")');
assert.equal(sent.filter(s => s.k === 'validate_component').length, 1, '同一内容不重复请求');
ctx.RES = { requestId: req.v.requestId, ok: false, error: 'bad thing' };
run('Valid.receive(RES)');
const errs = run('var out = []; Valid.problems(Store.doc(), out); out');
assert.equal(errs.length, 1);
assert.match(errs[0].msg, /游戏校验未通过 — bad thing/);
run('Store.set("custom_data", { a: 3 });');
assert.equal(run('var o2 = []; Valid.problems(Store.doc(), o2); o2.length'), 0, '内容变了，旧的失败结果不再算');
// Reg.ingest 路由
ctx.RES2 = { requestId: 'nope', ok: true };
run('Reg.ingest("validate_component.result", RES2)');
console.log('PASS nbt: typed SNBT merge, apply formats, game validation routing.');
