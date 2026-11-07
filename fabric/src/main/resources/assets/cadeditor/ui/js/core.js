/* 编辑器核心：工具、SNBT、状态仓库（含撤销历史）、差异、命令、校验。
   纯数据逻辑，不碰 DOM；所有页面脚本共用全局（无模块）。 */

/* ---------- 小工具 ---------- */
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function shortId(id) { return String(id).replace(/^minecraft:/, ''); }
function fullId(id) { return id.indexOf(':') < 0 ? 'minecraft:' + id : id; }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function roman(n) {
  if (n <= 0 || n > 3999) return String(n);
  var m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = '';
  for (var i = 0; i < m.length; i++) while (n >= m[i][0]) { s += m[i][1]; n -= m[i][0]; }
  return s;
}
function humanId(id) {
  return shortId(id).split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}
function fmtNum(n) { return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(+n.toFixed(4)); }

/* ---------- 索引 ---------- */
/* 物品是否存在：实时注册表优先（含模组），没有宿主时用内置清单 */
function knownItem(id) { return !!ITEMSET[shortId(id)] || (typeof Reg !== 'undefined' && Reg.hasItem(id)); }
var CIDX = {}, ENIDX = {}, ATIDX = {}, EFIDX = {}, ITEMSET = {};
EDATA.comps.forEach(function (c) { CIDX[c.id] = c; });
EDATA.enchants.forEach(function (e) { ENIDX[e.id] = e; });
EDATA.attrs.forEach(function (a) { ATIDX[a.id] = a; });
EDATA.effects.forEach(function (e) { EFIDX[e.id] = e; });
EDATA.items.forEach(function (i) { ITEMSET[i] = 1; });

/* ---------- SNBT 序列化 ---------- */
function snbtStr(s) {
  var q = (s.indexOf('"') >= 0 && s.indexOf("'") < 0) ? "'" : '"';
  var out = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  if (q === '"') out = out.replace(/"/g, '\\"'); else out = out.replace(/'/g, "\\'");
  return q + out + q;
}
function snbtKey(k) { return /^[A-Za-z0-9_\-.+]+$/.test(k) ? k : snbtStr(k); }
function numLit(v, type) {
  if (type === 'int') return String(Math.round(v));
  if (type === 'num') return (Number.isInteger(v) ? v.toFixed(1) : String(v)) + 'd';
  return Number.isInteger(v) ? String(v) : String(v) + 'd';
}
/* 在 union 里按值的形状挑一个分支 */
function pickAlt(sc, v) {
  var a = sc.a || [], i;
  for (i = 0; i < a.length; i++) {
    var t = a[i].t;
    if (typeof v === 'string' && t === 'str') {
      var wantTag = v.charAt(0) === '#';
      if (!!a[i].tag === wantTag) return a[i];
      continue;
    }
    if (typeof v === 'number' && (t === 'int' || t === 'num')) return a[i];
    if (typeof v === 'boolean' && t === 'bool') return a[i];
    if (Array.isArray(v) && t === 'arr') return a[i];
    if (isObj(v) && (t === 'obj' || t === 'map' || t === 'dunion' || t === 'unit' || t === 'text')) return a[i];
  }
  return a[0];
}
function toSnbt(v, sc, pretty, ind) {
  ind = ind || 0;
  var pad = pretty ? new Array(ind + 1).join('  ') : '';
  var pad1 = pretty ? new Array(ind + 2).join('  ') : '';
  var nl = pretty ? '\n' : '';
  if (v === null || v === undefined) return '""';
  if (sc && sc.t === 'union') sc = pickAlt(sc, v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return numLit(v, sc && (sc.t === 'int' || sc.t === 'num') ? sc.t : null);
  if (typeof v === 'string') return snbtStr(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    var isc = sc && sc.t === 'arr' ? sc.i : null;
    var parts = v.map(function (x) { return pad1 + toSnbt(x, isc, pretty, ind + 1); });
    return '[' + nl + parts.join(',' + nl) + nl + pad + ']';
  }
  var keys = Object.keys(v);
  if (!keys.length) return '{}';
  if (sc && sc.t === 'dunion') { var b = sc.br[v[sc.disc]]; if (b) sc = b; }
  var parts2 = keys.map(function (k) {
    var cs = null;
    if (sc && sc.t === 'obj') { for (var i = 0; i < sc.f.length; i++) if (sc.f[i].k === k) cs = sc.f[i].s; }
    else if (sc && sc.t === 'map') cs = sc.v;
    return pad1 + snbtKey(k) + ':' + (pretty ? ' ' : '') + toSnbt(v[k], cs, pretty, ind + 1);
  });
  return '{' + nl + parts2.join(',' + nl) + nl + pad + '}';
}

/* ---------- SNBT 解析（SNBT 视图与导入共用） ---------- */
var BS = String.fromCharCode(92), NLC = String.fromCharCode(10), TABC = String.fromCharCode(9);
function SnbtReader(text) {
  var i = 0, n = text.length;
  var self = {
    pos: function () { return i; },
    end: function () { self.ws(); return i >= n; },
    peek: function () { return text.charAt(i); },
    next: function () { return text.charAt(i++); },
    fail: function (msg) { var e = new Error(msg); e.pos = i; throw e; },
    ws: function () { while (i < n && /\s/.test(text.charAt(i))) i++; },
    str: function () {
      var q = text.charAt(i++), out = '';
      while (i < n && text.charAt(i) !== q) {
        var c = text.charAt(i++);
        if (c === BS) { var d = text.charAt(i++); out += d === 'n' ? NLC : d === 't' ? TABC : d; } else out += c;
      }
      if (text.charAt(i) !== q) self.fail('字符串未闭合');
      i++; return out;
    },
    bare: function () {
      var s = i;
      while (i < n && /[A-Za-z0-9_\-.+]/.test(text.charAt(i))) i++;
      if (s === i) self.fail('此处需要一个值');
      return text.substring(s, i);
    },
    key: function () { self.ws(); var c = text.charAt(i); return (c === '"' || c === "'") ? self.str() : self.bare(); },
    value: function () {
      self.ws();
      var c = text.charAt(i);
      if (c === '{') return self.compound();
      if (c === '[') return self.list();
      if (c === '"' || c === "'") return self.str();
      var w = self.bare();
      if (w === 'true') return true;
      if (w === 'false') return false;
      var m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([bBsSlLfFdD]?)$/.exec(w);
      if (m) return parseFloat(m[1]);
      return w;
    },
    compound: function () {
      var o = {}; i++; self.ws();
      if (text.charAt(i) === '}') { i++; return o; }
      for (;;) {
        var k = self.key(); self.ws();
        if (text.charAt(i) !== ':') self.fail('键后面需要冒号');
        i++; o[k] = self.value(); self.ws();
        var c = text.charAt(i++);
        if (c === '}') return o;
        if (c !== ',') { i--; self.fail('需要逗号或右花括号'); }
      }
    },
    list: function () {
      var a = []; i++; self.ws();
      if (/^[BIL];/.test(text.substring(i, i + 2))) i += 2;
      self.ws();
      if (text.charAt(i) === ']') { i++; return a; }
      for (;;) {
        a.push(self.value()); self.ws();
        var c = text.charAt(i++);
        if (c === ']') return a;
        if (c !== ',') { i--; self.fail('需要逗号或右方括号'); }
      }
    },
  };
  return self;
}
function parseSnbt(text) {
  var r = SnbtReader(text), v = r.value();
  if (!r.end()) r.fail('末尾有多余内容');
  return v;
}
/* 用户在输入框里手输的 SNBT：除了解析成 JSON，还记下带类型的节点，提交时按他写的类型输出（见 nbt.js nbtNote） */
function parseSnbtUser(text) {
  var v = parseSnbt(text);
  try { if (typeof nbtNote === 'function') nbtNote(text); } catch (e) {}
  return v;
}
/* 解析 "[/give @s |/item replace … with ]minecraft:xxx[组件…] [数量]"，返回 {id,count,comps,removed} */
function parseStackString(text) {
  var t = text.trim().replace(/^\/+/, '');
  var m = /^give\s+\S+\s+/.exec(t) || /^item\s+(?:replace|modify)\s+\S+\s+\S+\s+\S+\s+(?:with\s+)?/.exec(t);
  if (m) t = t.substring(m[0].length);
  var r = SnbtReader(t);
  r.ws();
  var s = 0, idStart = r.pos();
  var idm = /^[a-z0-9_.\-]+(?::[a-z0-9_.\-\/]+)?/.exec(t.substring(idStart));
  if (!idm) r.fail('找不到物品 ID');
  for (var k = 0; k < idm[0].length; k++) r.next();
  var out = { id: fullId(idm[0]), count: 1, comps: {}, removed: {} };
  r.ws();
  if (r.peek() === '[') {
    r.next(); r.ws();
    if (r.peek() === ']') r.next();
    else for (;;) {
      r.ws();
      if (r.peek() === '!') { r.next(); out.removed[shortId(r.key())] = 1; }
      else {
        var key = r.key(); r.ws();
        if (r.next() !== '=') { r.fail('组件名后面需要 ='); }
        out.comps[shortId(key)] = r.value();
      }
      r.ws();
      var c = r.next();
      if (c === ']') break;
      if (c !== ',') r.fail('需要逗号或右方括号');
    }
  }
  r.ws();
  var cm = /^\d+/.exec(t.substring(r.pos()));
  if (cm) { out.count = parseInt(cm[0], 10); for (var j = 0; j < cm[0].length; j++) r.next(); }
  if (!r.end()) r.fail('末尾有多余内容');
  return out;
}

/* ---------- 文档与状态仓库 ---------- */
function snapOf(d) { return JSON.stringify({ id: d.id, count: d.count, comps: d.comps, removed: d.removed }); }
function protoOf(id) { var live = typeof Reg !== 'undefined' ? Reg.defaultsOf(fullId(id)) : null; if (live) return live; var i = EDATA.ipt[shortId(id)]; return i === undefined ? {} : EDATA.pt[i]; }
function intentOf(d, cid) {
  if (d.removed[cid]) return 'remove';
  if (d.comps[cid] !== undefined) return 'set';
  return 'inherit';
}
function effectiveComps(d) {
  var out = clone(protoOf(d.id)) || {}, k;
  for (k in d.comps) out[k] = d.comps[k];
  for (k in d.removed) delete out[k];
  return out;
}
function makeDoc(spec) {
  var d = { key: spec.key, id: spec.id, count: spec.count || 1, comps: clone(spec.comps || {}), removed: clone(spec.removed || {}), label: spec.label || '', src: spec.src || null, snbt: clone(spec.snbt || {}) };
  d.base = snapOf(d);
  d.hist = [{ label: '打开', snap: d.base, t: 0 }];
  d.hi = 0;
  return d;
}
var HIST_CHARS = 3000000;   // 撤销历史快照总字符数上限（约 3 MB 文本）
var Store = (function () {
  var docs = [], cur = 0, subs = [], clock = 0;
  function now() { return ++clock * 400; } // 虚拟时钟：脚本环境里 performance.now 在一次入口内不前进
  function emit(ev) { for (var i = 0; i < subs.length; i++) subs[i](ev); }
  function doc() { return docs[cur]; }
  function histPush(d, label, key) {
    var s = snapOf(d), top = d.hist[d.hi], t = now();
    if (top && top.snap === s) return false;
    if (key && top && top.key === key && d.hi === d.hist.length - 1 && t - top.t < 2400 && d.hi > 0) {
      top.snap = s; top.t = t; top.label = label;
    } else {
      d.hist.length = d.hi + 1;
      d.hist.push({ label: label, snap: s, t: t, key: key || null });
      d.hi = d.hist.length - 1;
      if (d.hist.length > 200) { d.hist.shift(); d.hi--; }
      /* 每一步是整个物品的快照：物品很大（装满东西的潜影盒、带大量 NBT）时，200 步会占很多内存，所以再按体积限制，至少留 20 步 */
      var total = 0, i;
      for (i = 0; i < d.hist.length; i++) total += d.hist[i].snap.length;
      while (total > HIST_CHARS && d.hist.length > 20 && d.hi > 0) { total -= d.hist[0].snap.length; d.hist.shift(); d.hi--; }
    }
    return true;
  }
  function push(label, key, structural, cid) {
    if (histPush(doc(), label, key)) emit({ type: 'edit', structural: !!structural, cid: cid || null });
  }
  function restore(i) {
    var d = doc();
    if (i < 0 || i >= d.hist.length) return;
    var o = JSON.parse(d.hist[i].snap);
    d.id = o.id; d.count = o.count; d.comps = o.comps; d.removed = o.removed; d.hi = i;
    emit({ type: 'restore', structural: true });
  }
  return {
    docs: docs,
    doc: doc,
    index: function () { return cur; },
    subscribe: function (f) { subs.push(f); },
    open: function (spec, makeCurrent) { docs.push(makeDoc(spec)); if (makeCurrent) cur = docs.length - 1; emit({ type: 'docs', structural: true }); },
    select: function (i) { if (i >= 0 && i < docs.length) { cur = i; emit({ type: 'docs', structural: true }); } },
    close: function (i) {
      if (docs.length < 2) return;
      docs.splice(i, 1);
      if (cur >= docs.length) cur = docs.length - 1; else if (i < cur) cur--;
      emit({ type: 'docs', structural: true });
    },
    set: function (cid, value, o) {
      o = o || {};
      var d = doc(); d.comps[cid] = value; delete d.removed[cid];
      push(o.label || ('修改 ' + (CIDX[cid] ? CIDX[cid].name : cid)), o.key, o.structural, cid);
    },
    inherit: function (cid, o) {
      o = o || {};
      var d = doc(); delete d.comps[cid]; delete d.removed[cid];
      push(o.label || ('继承 ' + (CIDX[cid] ? CIDX[cid].name : cid)), o.key || null, o.structural === undefined ? true : o.structural, cid);
    },
    remove: function (cid, o) {
      o = o || {};
      var d = doc(); delete d.comps[cid]; d.removed[cid] = 1;
      push(o.label || ('移除 ' + (CIDX[cid] ? CIDX[cid].name : cid)), o.key || null, o.structural === undefined ? true : o.structural, cid);
    },
    setCount: function (n) { var d = doc(); d.count = n; push('数量 ' + n, 'count', false, null); },
    setItem: function (id) { var d = doc(); d.id = id; push('更换物品 ' + shortId(id), null, true, null); },
    replace: function (comps, removed, label) {
      var d = doc(); d.comps = clone(comps); d.removed = clone(removed || {});
      push(label || '批量修改', null, true, null);
    },
    /* 把当前物品的某个组件（含继承 / 移除意图）复制到另一个打开的物品；to 为下标或 "all" */
    copyComp: function (cid, to, label) {
      var src = doc(), n = 0;
      docs.forEach(function (d, i) {
        if (d === src || (to !== 'all' && to !== i)) return;
        if (src.removed[cid]) { delete d.comps[cid]; d.removed[cid] = 1; }
        else if (src.comps[cid] !== undefined) { d.comps[cid] = clone(src.comps[cid]); delete d.removed[cid]; }
        else { delete d.comps[cid]; delete d.removed[cid]; }
        if (histPush(d, label || ('复制组件 ' + cid), null)) n++;
      });
      emit({ type: 'docs', structural: true });
      return n;
    },
    undo: function () { var d = doc(); if (d.hi > 0) restore(d.hi - 1); },
    redo: function () { var d = doc(); if (d.hi < d.hist.length - 1) restore(d.hi + 1); },
    jump: restore,
    canUndo: function () { return doc().hi > 0; },
    canRedo: function () { var d = doc(); return d.hi < d.hist.length - 1; },
    markSaved: function () { var d = doc(); d.base = snapOf(d); emit({ type: 'saved', structural: false }); },
    revertAll: function () { var d = doc(), o = JSON.parse(d.base); d.id = o.id; d.count = o.count; d.comps = o.comps; d.removed = o.removed; push('还原全部修改', null, true, null); },
  };
})();

/* ---------- 差异 ---------- */
function stateOf(o, cid) {
  if (o.removed[cid]) return { k: 'remove' };
  if (o.comps[cid] !== undefined) return { k: 'set', v: o.comps[cid] };
  return { k: 'inherit' };
}
function diffDoc(d) {
  var b = JSON.parse(d.base), out = [], seen = {}, ids = [];
  [b.comps, b.removed, d.comps, d.removed].forEach(function (m) { for (var k in m) if (!seen[k]) { seen[k] = 1; ids.push(k); } });
  ids.sort();
  ids.forEach(function (cid) {
    var x = stateOf(b, cid), y = stateOf(d, cid);
    if (x.k === y.k && deepEq(x.v, y.v)) return;
    out.push({ cid: cid, before: x, after: y });
  });
  if (b.id !== d.id) out.unshift({ cid: '#item', before: { k: 'set', v: b.id }, after: { k: 'set', v: d.id } });
  if (b.count !== d.count) out.unshift({ cid: '#count', before: { k: 'set', v: b.count }, after: { k: 'set', v: d.count } });
  return out;
}
function revertComp(d, cid) {
  var b = JSON.parse(d.base);
  delete d.comps[cid]; delete d.removed[cid];
  if (b.removed[cid]) d.removed[cid] = 1;
  else if (b.comps[cid] !== undefined) d.comps[cid] = clone(b.comps[cid]);
}

/* ---------- 命令 ---------- */
function stackString(d) {
  var parts = [], k;
  var ids = Object.keys(d.comps).sort();
  ids.forEach(function (cid) {
    var c = CIDX[cid];
    parts.push(cid + '=' + toSnbt(d.comps[cid], c ? c.schema : null, false));
  });
  Object.keys(d.removed).sort().forEach(function (cid) { parts.push('!' + cid); });
  return fullId(d.id) + (parts.length ? '[' + parts.join(',') + ']' : '');
}
var CMD_MODES = [
  { id: 'give', name: '给予物品', tpl: function (sel, st, n) { return '/give ' + sel + ' ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'main', name: '替换主手', tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' weapon.mainhand with ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'off', name: '替换副手', tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' weapon.offhand with ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'hotbar', name: '替换快捷栏全部', tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' hotbar.* with ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'head', name: '替换头部', tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' armor.head with ' + st + (n > 1 ? ' ' + n : ''); } },
];
function buildCommand(d, modeId, sel) {
  var m = CMD_MODES[0];
  CMD_MODES.forEach(function (x) { if (x.id === modeId) m = x; });
  return m.tpl(sel || '@s', stackString(d), d.count);
}

/* ---------- 校验 ---------- */
function validateValue(sc, v, path, out, cid) {
  if (!sc) return;
  var add = function (lv, msg) { out.push({ level: lv, cid: cid, path: path, msg: msg }); };
  if (sc.t === 'union') sc = pickAlt(sc, v);
  if (!sc) return;
  switch (sc.t) {
    case 'int': case 'num':
      if (typeof v !== 'number' || isNaN(v)) { add('error', '需要数字'); break; }
      if (sc.t === 'int' && !Number.isInteger(v)) add('error', '需要整数');
      if (sc.min !== undefined && v < sc.min) add('error', '不能小于 ' + sc.min);
      if (sc.max !== undefined && v > sc.max) add('error', '不能大于 ' + sc.max);
      break;
    case 'str':
      if (typeof v !== 'string') { add('error', '需要文本'); break; }
      if (sc.en && sc.en.indexOf(v) < 0 && !(typeof liveEnumHas === 'function' && liveEnumHas(cid, path, v))) add('error', '不是有效选项：' + v);
      /* 注册表引用不能是空的：空串到游戏里会变成“minecraft:”，整件物品被拒绝 */
      if (sc.reg && (v === '' || v === 'minecraft:' || v === '#')) { add('error', '还没有选择（这一项不能留空）'); break; }
      if (sc.reg === 'item' && !sc.tag && !knownItem(v)) add('warn', '未知物品：' + v);
      if (sc.reg === 'enchantment' && !ENIDX[shortId(v)]) add('warn', '未知附魔：' + v);
      if (sc.reg === 'attribute' && !ATIDX[shortId(v)]) add('warn', '未知属性：' + v);
      if (sc.reg === 'mob_effect' && !EFIDX[shortId(v)]) add('warn', '未知状态效果：' + v);
      break;
    case 'obj':
      if (!isObj(v)) { add('error', '需要对象'); break; }
      sc.f.forEach(function (f) {
        if (v[f.k] === undefined) { if (f.r && f.df === undefined) add('error', '缺少必填字段 ' + f.k); }
        else validateValue(f.s, v[f.k], path + '.' + f.k, out, cid);
      });
      break;
    case 'arr':
      if (!Array.isArray(v)) { add('error', '需要列表'); break; }
      if (sc.max !== undefined && v.length > sc.max) add('error', '最多 ' + sc.max + ' 项');
      if (sc.min !== undefined && v.length < sc.min) add('error', '至少 ' + sc.min + ' 项');
      v.forEach(function (x, i) { validateValue(sc.i, x, path + '[' + i + ']', out, cid); });
      break;
    case 'map':
      if (!isObj(v)) { add('error', '需要映射'); break; }
      Object.keys(v).forEach(function (k) { validateValue(sc.k, k, path + '{' + k + '}', out, cid); validateValue(sc.v, v[k], path + '.' + k, out, cid); });
      break;
    case 'dunion':
      if (!isObj(v)) { add('error', '需要对象'); break; }
      if (!sc.br[v[sc.disc]]) add('error', '未知类型 ' + v[sc.disc]); else validateValue(sc.br[v[sc.disc]], v, path, out, cid);
      break;
    default: break;
  }
}
function validateDoc(d) {
  var out = [], eff = effectiveComps(d);
  if (!knownItem(d.id)) out.push({ level: /^minecraft:|^[^:]+$/.test(d.id) ? 'error' : 'warn', cid: null, path: '', msg: '游戏当前注册表里没有物品 ' + d.id + (/^minecraft:|^[^:]+$/.test(d.id) ? '' : '（可能是模组还没加载，仍按原 ID 写入）') });
  Object.keys(d.comps).forEach(function (cid) {
    var c = CIDX[cid];
    if (!c) { out.push({ level: 'warn', cid: cid, path: '', msg: '26.1.2 不存在的组件：' + cid }); return; }
    validateValue(c.schema, d.comps[cid], '', out, cid);
  });
  if (typeof Valid !== 'undefined') Valid.problems(d, out);   // 游戏对自由 NBT 组件的校验结果
  /* 跨组件规则 */
  var maxd = eff.max_damage, dmg = eff.damage;
  if (typeof dmg === 'number' && typeof maxd === 'number' && dmg >= maxd) out.push({ level: 'warn', cid: 'damage', path: '', msg: '已损耗耐久不小于最大耐久，物品会立刻损坏' });
  var maxs = typeof eff.max_stack_size === 'number' ? eff.max_stack_size : 64;
  if (d.count > maxs) out.push({ level: 'error', cid: '#count', path: '', msg: '数量 ' + d.count + ' 超过最大堆叠 ' + maxs });
  if (typeof maxd === 'number' && maxd > 0 && maxs > 1) out.push({ level: 'warn', cid: 'max_damage', path: '', msg: '可损坏物品的最大堆叠应为 1' });
  ['enchantments', 'stored_enchantments'].forEach(function (cid) {
    var m = eff[cid]; if (!isObj(m)) return;
    var ids = Object.keys(m).map(shortId);
    ids.forEach(function (id) {
      var e = ENIDX[id]; if (!e) return;
      var lv = m[Object.keys(m).filter(function (k) { return shortId(k) === id; })[0]];
      if (lv > e.max) out.push({ level: 'info', cid: cid, path: id, msg: e.name + ' ' + lv + ' 级超过自然上限 ' + e.max + '（命令可写，但不是自然获得）' });
      e.excl.forEach(function (x) { if (ids.indexOf(x) > ids.indexOf(id)) out.push({ level: 'warn', cid: cid, path: id, msg: e.name + ' 与 ' + (ENIDX[x] ? ENIDX[x].name : x) + ' 互斥（原版附魔台/铁砧不会同时出现）' }); });
      if (cid === 'enchantments' && e.items.length && e.items.indexOf(shortId(d.id)) < 0) out.push({ level: 'info', cid: cid, path: id, msg: e.name + ' 通常不适用于 ' + shortId(d.id) + '（仍可写入，效果取决于附魔本身）' });
    });
  });
  return out;
}
