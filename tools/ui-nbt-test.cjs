// 带类型 SNBT 与游戏校验（nbt.js）的纯逻辑测试：不需要浏览器或游戏。
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../common/src/main/resources/assets/cadeditor/ui/js');
const sent = [];
const ctx = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {}, document: { addEventListener() {}, getElementById() { return null; } },
  oriel: { data: {}, on() {}, send(k, v) { sent.push({ k, v }); return true; } } });
for (const f of ['data.js', 'core.js', 'labels.js', 'reg.js', 'nbt.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
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

// 3) 宿主旧 JSON 缺少类型时用原文；显式输入的类型不能被旧参照覆盖
const BIG = '{x:9007199254740993L}'; ctx.BIG = BIG;
assert.equal(run('nbtMerge({x:9007199254740992}, nbtParse(BIG))'), BIG);
assert.equal(run('nbtMerge(parseSnbt("{x:9007199254740992L}"), nbtParse(BIG))'), '{x:9007199254740992L}', '相邻 long 的显式修改不能被相等的 double 投影盖掉');

// 4) 解析的边角：引号键、转义、尾逗号、单引号字符串、布尔
assert.equal(run('nbtMerge({ "a b": "q\\"t", ok: true }, null)'), `{"a b":'q"t',ok:true}`);
ctx.T = "{'k b':'v', n:[1,2,], t:true,}";
assert.equal(run('nbtParse(T).keys.join("|")'), 'k b|n|t');
assert.throws(() => run('nbtParse("{a:1")'), /SNBT/);
assert.throws(() => run('nbtParse("{a 1}")'), /冒号/);

// 5) 什么算“有 JSON 表达不了的类型”
assert.equal(run('nbtHasTyped("{a:1b,b:2}")'), true, '任意 NBT byte 不能一律当作 JSON 布尔');
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

// 5) 审查发现：删数组元素不能把已删的 long 原文写回来
ctx.REFX = '{xs:[9007199254740993L,9007199254740992L]}';
assert.equal(run('nbtMerge({ xs: [9007199254740992] }, nbtParse(REFX))'), '{xs:[9007199254740992L]}', '删除首元素后不抄旧原文，但保留 long 类型');
assert.equal(run('nbtMerge({ xs: [1, 2, 3] }, nbtParse("{xs:[1L,2L]}"))'), '{xs:[1L,2L,3L]}', '末尾追加沿用 long 类型');

// 6) 用户手输的带类型 SNBT 不能被旧参照盖掉
ctx.REFB = '{x:1b}';
run('nbtSeenClear(); var u = parseSnbtUser("{x:2s,newByte:1b}")');
assert.equal(run('nbtMerge(u, nbtParse(REFB))'), '{x:2s,newByte:1b}', 'short 不被旧 byte 盖掉，新 byte 不变 int');
run('nbtSeenClear()');
assert.equal(run('nbtMerge({ x: 2, newByte: 1 }, nbtParse(REFB))'), '{x:2b,newByte:1}', '没手输过时仍按旧类型 / 普通写法');
run('nbtSeenClear(); var ownedBig = parseSnbtUser("{big:9007199254740993L}")');
assert.equal(run('nbtMerge(ownedBig, null)'), '{big:9007199254740993L}', '手输的超大 long 保留原文');
assert.equal(run('nbtMerge({ big: 9007199254740992 }, null)'), '{big:9007199254740992}', '另一个同值对象不能借用其原文');
run('nbtSeenClear()');

// 7) 非 NBT_RAW 组件里的 float / double 局部编辑后仍走 SNBT
ctx.D7 = { base: JSON.stringify({ comps: { bees: [{ entity_data: { id: 'minecraft:bee', Health: 2 }, ticks_in_hive: 40 }] } }),
  comps: { bees: [{ entity_data: { id: 'minecraft:bee', Health: 2 }, ticks_in_hive: 41 }] },
  snbt: { bees: '[{entity_data:{id:"minecraft:bee",Health:2.0f},ticks_in_hive:40,min_ticks_in_hive:600}]' } };
const r7 = run('nbtApplyFormats(D7)');
assert.equal(r7.formats.bees, 'snbt');
assert.ok(String(r7.comps.bees).includes('Health:2.0f') && String(r7.comps.bees).includes('ticks_in_hive:41'), 'Health 保持 float');
console.log('PASS nbt: typed SNBT merge, apply formats, game validation routing.');

// 逐字段校验（component_validate）：错误带字段路径；结果与当前值对不上就不算
{
  const sent2 = [];
  ctx.oriel.send = (k, v) => { sent2.push({ k, v }); return true; };
  ctx.Reg.meta = {};
  run("var DH = { comps: { food: { nutrition: -1, saturation: 1 } }, base: JSON.stringify({ comps: {} }), snbt: {} }; Valid.runHost('food', DH);");
  const m = sent2.filter(x => x.k === 'component_validate').pop();
  assert.ok(m && m.v.component === 'food' && m.v.value.nutrition === -1, '被改过的普通组件交给游戏逐字段校验');
  ctx.RESH = { requestId: m.v.requestId, ok: false, errors: [{ path: '$.nutrition', code: 'codec', message: 'Value must be non-negative: -1' }] };
  run('Reg.ingest("component_validate.result", RESH)');
  const pr = JSON.parse(run('var O3 = []; Valid.problems(DH, O3); JSON.stringify(O3)'));
  assert.equal(pr.length, 1); assert.equal(pr[0].level, 'error'); assert.equal(pr[0].path, 'nutrition'); assert.ok(pr[0].msg.includes('Value must be non-negative'));
  run('DH.comps.food.nutrition = 3');
  assert.equal(JSON.parse(run('var O4 = []; Valid.problems(DH, O4); JSON.stringify(O4)')).length, 0, '又改了就不再显示旧错误');
  ctx.Reg.meta = null;
}
console.log('PASS nbt: per-field host validation.');

// Non-finite Float/Double values are a typed SNBT extension, never ordinary JSON.
ctx.SPECIAL = '{nan:NaNf,pos:+Infinityf,neg:-Infinityd,quoted:"NaNf",bare:Infinity}';
ctx.SPECIAL_CANON = '{nan:NaNf,pos:+Infinityf,neg:-Infinityd,quoted:"NaNf",bare:"Infinity"}';
assert.equal(run('nbtMerge(parseSnbtUser(SPECIAL), null)'), ctx.SPECIAL_CANON, 'explicit f/d special tokens preserve spelling and type');
assert.equal(run('nbtParse("NaNf").t'), 'f');
assert.equal(run('nbtParse("Infinityd").t'), 'd');
ctx.QUOTED_SPECIAL = '"NaNf"';
assert.equal(run('nbtParse(QUOTED_SPECIAL).k'), 'str', 'quoted token stays a string');
assert.equal(run('nbtParse("Infinity").k'), 'str', 'unsuffixed token stays a string');
assert.throws(() => run('nbtMerge(NaN, null)'), /f 或 d/, 'untyped special number is rejected');
run(`var specialDoc = makeDoc({ key: 'special', id: 'minecraft:stone', comps: { custom_data: parseSnbtUser(SPECIAL) }, removed: {}, snbt: {} });`);
assert.equal(run('nbtApplyFormats(specialDoc, true).formats.custom_data'), 'snbt');
assert.equal(run('nbtApplyFormats(specialDoc, true).comps.custom_data'), ctx.SPECIAL_CANON);
ctx.SPECIAL_SNAP = run('nbtSnapshot(specialDoc)');
assert.match(ctx.SPECIAL_SNAP, /null/, 'JSON snapshot uses null projection instead of invalid JSON numbers');
assert.equal(run('nbtComponentText(nbtReadSnapshot(SPECIAL_SNAP), "custom_data")'), ctx.SPECIAL_CANON, 'snapshot restores special values from typed metadata');
assert.equal(run('nbtComponentText({ comps: nbtHydrate({ custom_data: { value: null } }, { custom_data: "{value:-Infinityd}" }), snbt: {} }, "custom_data")'), '{value:-Infinityd}', 'wire null projection hydrates from component SNBT');
assert.equal(run('nbtComponentText({ comps: nbtHydrate({ special_component: null }, { special_component: "NaNf" }), snbt: {} }, "special_component")'), 'NaNf', 'root typed component null projection hydrates too');
assert.equal(run('nbtComponentText({ comps: nbtHydrate({ custom_data: { values: [null, 3, null] } }, { custom_data: "{values:[NaNf,3f,Infinityf]}" }), snbt: {} }, "custom_data")'), '{values:[NaNf,3f,Infinityf]}', 'list null projections retain positions and finite neighbor');
run('var specialOut = []; validateValue({t:"num",nbtType:"f",allowNaN:true}, nbtSpecialScalar(NaN,"f"), "", specialOut, "x")');
assert.equal(run('specialOut.length'), 0, 'schema-approved NaN passes local validation');
run('specialOut = []; validateValue({t:"num",nbtType:"f",min:0,max:3.4028235e38,allowPositiveInfinity:true}, nbtSpecialScalar(Infinity,"f"), "", specialOut, "x")');
assert.equal(run('specialOut.length'), 0, 'actual Codec Infinity permission takes precedence over finite UI bounds');
run('specialOut = []; validateValue({t:"num",allowNaN:true}, "invalid", "", specialOut, "x")');
assert.equal(run('specialOut.length'), 1, 'NaN permission does not admit arbitrary strings');
run('var blockedOut = []; validateValue({t:"int"}, nbtSpecialScalar(Infinity,"d"), "", blockedOut, "x")');
assert.ok(run('blockedOut.length') > 0, 'integer fields remain finite/integer-only');
run('var oldCidx = CIDX; CIDX = { special_component: { schema: { t: "num" } } }; applyLiveRanges([{id:"minecraft:special_component",ranges_for_ui:[{path:"$",number_type:"double",min:null,max:null,allow_nan:true,allow_positive_infinity:true,allow_negative_infinity:false}]}]); var specialSchema = CIDX.special_component.schema; CIDX = oldCidx;');
assert.equal(run('specialSchema.nbtType'), 'd');
assert.equal(run('specialSchema.allowNaN'), true);
assert.equal(run('specialSchema.allowPositiveInfinity'), true);
assert.equal(run('specialSchema.allowNegativeInfinity'), false);
console.log('PASS nbt: explicit NaN/Infinity typed input, snapshot/hydrate, format routing and schema gates.');
