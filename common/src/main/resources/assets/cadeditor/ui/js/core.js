/* 编辑器核心：工具、SNBT、状态仓库（含撤销历史）、差异、命令、校验。
   纯数据逻辑，不碰 DOM；所有页面脚本共用全局（无模块）。 */

/* ---------- 小工具 ---------- */
function clone(v) { return typeof nbtClone === 'function' ? nbtClone(v) : (v === undefined ? undefined : JSON.parse(JSON.stringify(v))); }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b) && (!(typeof nbtMerge === 'function' && a !== undefined && b !== undefined) || nbtMerge(a, null) === nbtMerge(b, null)); }
function shortId(id) { return String(id).replace(/^minecraft:/, ''); }
function fullId(id) { return id.indexOf(':') < 0 ? 'minecraft:' + id : id; }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !(typeof nbtMeta === 'function' && nbtMeta(v) && nbtMeta(v).scalar); }
function roman(n) {
  if (n <= 0 || n > 3999) return String(n);
  var m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = '';
  for (var i = 0; i < m.length; i++) while (n >= m[i][0]) { s += m[i][1]; n -= m[i][0]; }
  return s;
}
function humanId(id) {
  return shortId(id).split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}
function fmtNum(n) {
  n = typeof nbtNumberValue === 'function' ? nbtNumberValue(n) : Number(n);
  if (!isFinite(n)) return isNaN(n) ? 'NaN' : n < 0 ? '-Infinity' : '+Infinity';
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(+n.toFixed(4));
}
/* Display only. SNBT, commands and stored numeric tokens keep their original spelling. */
function numLabel(n) { n = nbtNumberValue(n); return isNaN(n) ? 'NaN' : n === Infinity ? '∞' : n === -Infinity ? '−∞' : fmtNum(n); }

/* ---------- 索引 ---------- */
/* 物品是否存在：实时注册表优先（含模组），没有宿主时用内置清单 */
function knownItem(id) { return typeof Reg !== 'undefined' && !Reg.preview() ? Reg.entryState('item', id) === true : !!ITEMSET[shortId(id)]; }
var CIDX = {}, ENIDX = {}, ATIDX = {}, EFIDX = {}, ITEMSET = {};
EDATA.comps.forEach(function (c) { CIDX[c.id] = c; });
EDATA.enchants.forEach(function (e) { ENIDX[e.id] = e; });
EDATA.attrs.forEach(function (a) { ATIDX[a.id] = a; });
EDATA.effects.forEach(function (e) { EFIDX[e.id] = e; });
EDATA.items.forEach(function (i) { ITEMSET[i] = 1; });
/* 游戏里注册了、但编辑器没有专用表单的组件（其他模组的、比 26.1.2 更新的）：按组件登记一条，用 SNBT 编辑，保存时交给游戏校验。
   id 写法和 d.comps 的键一致：minecraft 命名空间省略，别的命名空间保留 */
function registerLiveComps(entries) {
  var added = 0;
  (entries || []).forEach(function (e) {
    if (!e || !e.id) return;
    var id = shortId(e.id); if (CIDX[id]) return;
    var ns = e.id.indexOf(':') > 0 ? e.id.split(':')[0] : 'minecraft';
    if (!EDATA.cats.some(function (k) { return k.id === 'live'; })) EDATA.cats.push({ id: 'live', name: I18n.t("cadeditor.ui.core.1a44af9043"), icon: 'grid' });
    var c = { id: id, name: e.name && e.name !== e.id ? e.name : humanId(id.indexOf(':') > 0 ? id.split(':')[1] : id), cat: 'live', live: true,
      desc: I18n.t("cadeditor.ui.core.15ad6834bf", (ns === 'minecraft' ? I18n.t("cadeditor.ui.core.216abdc422") : I18n.t("cadeditor.ui.core.9e6b56ff11", (ns)))),
      schema: { t: 'raw' } };
    EDATA.comps.push(c); CIDX[id] = c; added++;
  });
  return added;
}

/* ---------- SNBT 序列化 ---------- */
function snbtStr(s) {
  var q = (s.indexOf('"') >= 0 && s.indexOf("'") < 0) ? "'" : '"';
  var out = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
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
    if ((typeof v === 'number' || typeof nbtMeta === 'function' && nbtMeta(v) && nbtMeta(v).scalar) && (t === 'int' || t === 'num')) return a[i];
    if (typeof v === 'boolean' && t === 'bool') return a[i];
    if (Array.isArray(v) && t === 'arr') return a[i];
    if (isObj(v) && (t === 'obj' || t === 'map' || t === 'dunion' || t === 'unit' || t === 'text')) return a[i];
  }
  return a[0];
}
function toSnbt(v, sc, pretty, ind) {
  if (typeof nbtMeta === 'function' && nbtMeta(v)) return nbtPrint(nbtParse(nbtMerge(v, null)), !!pretty);
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
      if (text.charAt(i) !== q) self.fail(I18n.t("cadeditor.ui.core.c2d2bd6540"));
      i++; return out;
    },
    bare: function () {
      var s = i;
      while (i < n && /[A-Za-z0-9_\-.+]/.test(text.charAt(i))) i++;
      if (s === i) self.fail(I18n.t("cadeditor.ui.core.988351d357"));
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
        if (text.charAt(i) !== ':') self.fail(I18n.t("cadeditor.ui.core.f0f1d361b7"));
        i++; o[k] = self.value(); self.ws();
        var c = text.charAt(i++);
        if (c === '}') return o;
        if (c !== ',') { i--; self.fail(I18n.t("cadeditor.ui.core.b1203f8b20")); }
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
        if (c !== ',') { i--; self.fail(I18n.t("cadeditor.ui.core.900a179806")); }
      }
    },
  };
  return self;
}
function parseSnbt(text) {
  return nbtToJson(nbtParse(text));
}
/* 用户在输入框里手输的 SNBT：除了解析成 JSON，还记下带类型的节点，提交时按他写的类型输出（见 nbt.js nbtNote） */
function parseSnbtUser(text) {
  return parseSnbt(text);
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
  if (!idm) r.fail(I18n.t("cadeditor.ui.core.201bc555bd"));
  for (var k = 0; k < idm[0].length; k++) r.next();
  var out = { id: fullId(idm[0]), count: 1, comps: {}, removed: {}, snbt: {} };
  function componentKey() {
    var key = r.key();
    if (r.peek() === ':') { r.next(); key += ':' + r.bare(); }
    return shortId(key);
  }
  r.ws();
  if (r.peek() === '[') {
    r.next(); r.ws();
    if (r.peek() === ']') r.next();
    else for (;;) {
      r.ws();
      if (r.peek() === '!') { r.next(); nbtOwn(out.removed, componentKey(), 1); }
      else {
        var key = componentKey(); r.ws();
        if (r.next() !== '=') { r.fail(I18n.t("cadeditor.ui.core.9bdbf9dace")); }
        var start = r.pos(); r.value();
        var raw = t.substring(start, r.pos());
        nbtOwn(out.snbt, key, raw); nbtOwn(out.comps, key, parseSnbt(raw));
      }
      r.ws();
      var c = r.next();
      if (c === ']') break;
      if (c !== ',') r.fail(I18n.t("cadeditor.ui.core.900a179806"));
    }
  }
  r.ws();
  var cm = /^\d+/.exec(t.substring(r.pos()));
  if (cm) { out.count = parseInt(cm[0], 10); for (var j = 0; j < cm[0].length; j++) r.next(); }
  if (!r.end()) r.fail(I18n.t("cadeditor.ui.core.8406ba1e44"));
  return out;
}

/* ---------- 文档与状态仓库 ---------- */
function snapOf(d) { return nbtSnapshot(d); }
// Only Store mutations advance the serial; host replacements also change the references.
var DOC_CACHE = new WeakMap(), BASE_CACHE = new WeakMap();
function docCache(d) {
  var c = DOC_CACHE.get(d);
  if (!c || c.serial !== d.changeSerial || c.id !== d.id || c.count !== d.count || c.comps !== d.comps || c.removed !== d.removed || c.snbt !== d.snbt) {
    c = { serial:d.changeSerial, id:d.id, count:d.count, comps:d.comps, removed:d.removed, snbt:d.snbt, texts:Object.create(null), types:Object.create(null), checks:Object.create(null) }; DOC_CACHE.set(d, c);
  }
  return c;
}
function baseOf(d) {
  var c = BASE_CACHE.get(d);
  if (!c || c.text !== d.base) { c = { text:d.base, value:nbtReadSnapshot(d.base) }; BASE_CACHE.set(d, c); }
  return c.value; // Read-only; callers writing a baseline must clone it first.
}
var ComponentReads = null;
function componentRead(cid) { if (ComponentReads) ComponentReads[cid] = true; }
function effectiveSource(d, cid) { componentRead(cid); return d.removed[cid] ? null : d.comps[cid] !== undefined ? d.comps : protoOf(d.id); }
function effectiveGet(d, cid) {
  var source = effectiveSource(d, cid); if (!source) return undefined;
  var value = nbtTake(source, cid), meta = nbtMeta(value);
  // Keep the existing form API: ordinary scalar fields are primitive numbers.
  return meta && meta.scalar && !nbtSpecialNode(meta.scalar) && Math.abs(meta.scalar.v) <= 9007199254740991 ? meta.scalar.v : value;
}
// Read-only projection for labels, validation and previews; never clone unrelated components.
function effectiveView(d) {
  componentRead('*');
  var out = {}, p = protoOf(d.id);
  Object.keys(p).forEach(function (k) { nbtOwn(out, k, p[k]); });
  Object.keys(d.comps).forEach(function (k) { nbtOwn(out, k, d.comps[k]); });
  Object.keys(d.removed).forEach(function (k) { delete out[k]; });
  return out;
}
function protoOf(id) { var live = typeof Reg !== 'undefined' ? Reg.defaultsOf(fullId(id)) : null; if (live) return live; if (typeof Reg !== 'undefined' && !Reg.preview()) return {}; var i = EDATA.ipt[shortId(id)]; return i === undefined ? {} : EDATA.pt[i]; }
function intentOf(d, cid) {
  componentRead(cid);
  if (d.removed[cid]) return 'remove';
  if (d.comps[cid] !== undefined) return 'set';
  return 'inherit';
}
function effectiveComps(d) {
  var out = clone(protoOf(d.id)) || {}, k;
  for (k in d.comps) nbtPut(out, k, nbtTake(d.comps, k));
  for (k in d.removed) delete out[k];
  return out;
}
function makeDoc(spec) {
  var d = { key: spec.key, id: spec.id, count: spec.count || 1, comps: clone(spec.comps || {}), removed: clone(spec.removed || {}), label: spec.label || '', src: spec.src || null, snbt: clone(spec.snbt || {}) };
  d.comps = nbtHydrate(d.comps, d.snbt);
  d.base = snapOf(d);
  if (typeof spec.nativeBaseline === 'string') d.nativeBaseline = spec.nativeBaseline;
  d.hist = [{ label: I18n.t("cadeditor.ui.core.c771248e51"), snap: d.base, t: 0 }];
  d.hi = 0;
  return d;
}
// Lossless UTF-16 splices: compare blocks in native string code, not one JS step per byte.
function textDelta(before, after) {
  var at = 0, end = 0, limit = Math.min(before.length, after.length), block = 4096, lo, hi, mid;
  while (at + block <= limit && before.substring(at, at + block) === after.substring(at, at + block)) at += block;
  lo = 0; hi = Math.min(block, limit - at);
  while (lo < hi) { mid = Math.ceil((lo + hi) / 2); if (before.substring(at, at + mid) === after.substring(at, at + mid)) lo = mid; else hi = mid - 1; }
  at += lo;
  if (at > 0 && at < before.length && /[\uD800-\uDBFF]/.test(before.charAt(at - 1))) at--;
  limit = Math.min(before.length - at, after.length - at);
  while (end + block <= limit && before.substring(before.length - end - block, before.length - end) === after.substring(after.length - end - block, after.length - end)) end += block;
  lo = 0; hi = Math.min(block, limit - end);
  while (lo < hi) { mid = Math.ceil((lo + hi) / 2); if (before.substring(before.length - end - mid, before.length - end) === after.substring(after.length - end - mid, after.length - end)) lo = mid; else hi = mid - 1; }
  end += lo;
  if (end > 0 && /[\uDC00-\uDFFF]/.test(before.charAt(before.length - end))) end--;
  return { at:at, remove:before.length - at - end, insert:after.substring(at, after.length - end) };
}
function textPatch(before, delta) { return before.substring(0, delta.at) + delta.insert + before.substring(delta.at + delta.remove); }
// A timestamp and a component may change far apart. Keep unchanged islands between them.
function textDeltas(before, after) {
  var out = [];
  function split(a, b, offset, depth) {
    if (a === b) return; var delta = textDelta(a, b);
    if (depth < 5 && delta.remove > 2048 && delta.insert.length > 2048) {
      var start = delta.at + Math.floor(delta.remove / 2), size = 512;
      if (/[\uDC00-\uDFFF]/.test(a.charAt(start))) start++;
      if (/[\uD800-\uDBFF]/.test(a.charAt(start + size - 1))) size--;
      var anchor = a.substring(start, start + size), match = b.indexOf(anchor, delta.at);
      if (anchor.length === size && match >= 0 && match + size <= delta.at + delta.insert.length) {
        split(a.substring(0, start), b.substring(0, match), offset, depth + 1);
        split(a.substring(start + size), b.substring(match + size), offset + start + size, depth + 1); return;
      }
    }
    delta.at += offset; out.push(delta);
  }
  split(before, after, 0, 0); return out; // Ascending offsets into before.
}
function textPatchAll(before, deltas) { for (var i = deltas.length - 1; i >= 0; i--) before = textPatch(before, deltas[i]); return before; }
var HIST_CACHE = new WeakMap();
function historySnapshot(d, index) {
  var cache = HIST_CACHE.get(d), pos = -1, text;
  if (cache && d.hist[cache.index] === cache.entry) { pos = cache.index; text = cache.text; }
  if (pos > index) {
    while (pos > index && d.hist[pos].changes) {
      d.hist[pos].changes.forEach(function (delta) { text = text.substring(0, delta.at) + delta.deleted + text.substring(delta.at + delta.insert.length); }); pos--;
    }
  }
  if (pos < 0 || pos > index) {
    pos = index; while (pos > 0 && typeof d.hist[pos].snap !== 'string') pos--;
    text = d.hist[pos].snap;
    if (typeof text !== 'string') throw new Error(I18n.t("cadeditor.ui.core.7580e80a80"));
  }
  while (pos < index) { var entry = d.hist[++pos]; text = typeof entry.snap === 'string' ? entry.snap : textPatchAll(text, entry.changes); }
  HIST_CACHE.set(d, { index:index, entry:d.hist[index], text:text }); return text;
}
function historyEntry(before, after, label, key, t) {
  var changes = textDeltas(before, after), size = 0;
  changes.forEach(function (delta) { delta.deleted = before.substring(delta.at, delta.at + delta.remove); size += delta.insert.length + delta.deleted.length + 96; });
  return size < after.length ? { label:label, key:key, t:t, changes:changes } : { label:label, key:key, t:t, snap:after };
}
function historySize(entry) { return entry.snap !== undefined ? entry.snap.length : entry.changes.reduce(function (sum, delta) { return sum + delta.insert.length + delta.deleted.length + 96; }, 0); }
var HIST_CHARS = 3000000;   // Anchor plus differences; always retain at least one undo step.
var Store = (function () {
  var docs = [], cur = 0, subs = [], clock = 0;
  function now() { return ++clock * 400; } // 虚拟时钟：脚本环境里 performance.now 在一次入口内不前进
  function emit(ev) { for (var i = 0; i < subs.length; i++) subs[i](ev); }
  function doc() { return docs[cur]; }
  function histPush(d, label, key, cids) {
    var previousCache = DOC_CACHE.get(d);
    d.changeSerial = (d.changeSerial || 0) + 1;
    var cache = docCache(d);
    // Same containers plus explicit changed IDs: untouched components keep text/type/check caches.
    // Replaced host snapshots and unknown batch edits always take the full invalidation path.
    if (cids && previousCache && previousCache.comps === d.comps && previousCache.removed === d.removed && previousCache.snbt === d.snbt && previousCache.id === d.id) {
      ['texts', 'types', 'checks'].forEach(function (field) { Object.keys(previousCache[field]).forEach(function (cid) { if (cids.indexOf(cid) < 0) cache[field][cid] = previousCache[field][cid]; }); });
    }
    var s = snapOf(d), top = d.hist[d.hi], t = now();
    var previous = top ? historySnapshot(d, d.hi) : s;
    if (top && previous === s) return false;
    if (key && top && top.key === key && d.hi === d.hist.length - 1 && t - top.t < 2400 && d.hi > 0) {
      d.hist[d.hi] = historyEntry(historySnapshot(d, d.hi - 1), s, label, key, t);
    } else {
      d.hist.length = d.hi + 1;
      d.hist.push(historyEntry(previous, s, label, key || null, t));
      d.hi = d.hist.length - 1;
    }
    HIST_CACHE.set(d, {index:d.hi, entry:d.hist[d.hi], text:s});
    var total = 0, i; for (i = 0; i < d.hist.length; i++) total += historySize(d.hist[i]);
    while ((d.hist.length > 200 || total > HIST_CHARS) && d.hist.length > 2 && d.hi > 0) {
      var second = d.hist[1], anchor = typeof second.snap === 'string' ? second.snap : textPatchAll(d.hist[0].snap, second.changes);
      total -= historySize(d.hist[0]) + historySize(second);
      d.hist[1] = {label:second.label, key:second.key, t:second.t, snap:anchor}; total += anchor.length;
      d.hist.shift(); d.hi--; HIST_CACHE.delete(d);
    }
    HIST_CACHE.set(d, {index:d.hi, entry:d.hist[d.hi], text:s});
    return true;
  }
  function push(label, key, structural, cid, cids) {
    cids = cids || (cid ? [cid] : null);
    if (histPush(doc(), label, key, cids)) emit({ type: 'edit', structural: !!structural, cid: cid || null, cids:cids });
  }
  function restore(i) {
    if (typeof flushPendingCode === 'function') flushPendingCode();
    var d = doc();
    if (i < 0 || i >= d.hist.length) return;
    var o = nbtReadSnapshot(historySnapshot(d, i));
    d.id = o.id; d.count = o.count; d.comps = o.comps; d.removed = o.removed; d.hi = i;
    d.changeSerial = (d.changeSerial || 0) + 1;
    emit({ type: 'restore', structural: true });
  }
  return {
    docs: docs,
    doc: doc,
    index: function () { return cur; },
    subscribe: function (f) { subs.push(f); },
    open: function (spec, makeCurrent) { if (typeof flushPendingCode === 'function') flushPendingCode(); docs.push(makeDoc(spec)); if (makeCurrent) cur = docs.length - 1; emit({ type: 'docs', structural: true }); },
    select: function (i) { if (typeof flushPendingCode === 'function') flushPendingCode(); if (i >= 0 && i < docs.length) { cur = i; emit({ type: 'docs', structural: true }); } },
    close: function (i) {
      if (typeof flushPendingCode === 'function') flushPendingCode();
      if (docs.length < 2) return;
      docs.splice(i, 1);
      if (cur >= docs.length) cur = docs.length - 1; else if (i < cur) cur--;
      emit({ type: 'docs', structural: true });
    },
    set: function (cid, value, o) {
      o = o || {};
      var d = doc(); nbtPut(d.comps, cid, value); delete d.removed[cid];
      push(o.label || (I18n.t("cadeditor.ui.core.2ee88f54be", (CIDX[cid] ? CIDX[cid].name : cid))), o.key, o.structural, cid);
    },
    inherit: function (cid, o) {
      o = o || {};
      var d = doc(); delete d.comps[cid]; delete d.removed[cid];
      push(o.label || (I18n.t("cadeditor.ui.core.71aa157044", (CIDX[cid] ? CIDX[cid].name : cid))), o.key || null, o.structural === undefined ? true : o.structural, cid);
    },
    remove: function (cid, o) {
      o = o || {};
      var d = doc(); delete d.comps[cid]; d.removed[cid] = 1;
      push(o.label || (I18n.t("cadeditor.ui.core.fc8c501995", (CIDX[cid] ? CIDX[cid].name : cid))), o.key || null, o.structural === undefined ? true : o.structural, cid);
    },
    setCount: function (n) { var d = doc(); d.count = n; push(I18n.t("cadeditor.ui.core.2da5ce7045", (n)), 'count', false, '#count'); },
    setLinked: function (values, label) {
      var d = doc(), comps = clone(d.comps), removed = clone(d.removed);
      Object.keys(values).forEach(function (cid) { nbtPut(comps, cid, values[cid]); delete removed[cid]; });
      d.comps = comps; d.removed = removed; push(label || I18n.t("cadeditor.ui.core.8790274228"), null, false, null, Object.keys(values));
    },
    setItem: function (id) { var d = doc(); d.id = id; push(I18n.t("cadeditor.ui.core.e67f56e0a4", (shortId(id))), null, true, null); },
    replace: function (comps, removed, label) {
      var d = doc(); d.comps = clone(comps); d.removed = clone(removed || {});
      push(label || I18n.t("cadeditor.ui.core.8f98ede913"), null, true, null);
    },
    /* 把当前物品的某个组件（含继承 / 移除意图）复制到另一个打开的物品；to 为下标或 "all" */
    copyComp: function (cid, to, label) {
      var src = doc(), n = 0;
      docs.forEach(function (d, i) {
        if (d === src || (to !== 'all' && to !== i)) return;
        if (src.removed[cid]) { delete d.comps[cid]; d.removed[cid] = 1; }
        else if (src.comps[cid] !== undefined) { nbtPut(d.comps, cid, parseSnbt(nbtComponentText(src, cid))); delete d.removed[cid]; }
        else { delete d.comps[cid]; delete d.removed[cid]; }
        if (histPush(d, label || (I18n.t("cadeditor.ui.core.cd68bc1d39", (cid))), null, [cid])) n++;
      });
      emit({ type: 'docs', structural: true });
      return n;
    },
    undo: function () { if (typeof flushPendingCode === 'function') flushPendingCode(); var d = doc(); if (d.hi > 0) restore(d.hi - 1); },
    redo: function () { if (typeof flushPendingCode === 'function') flushPendingCode(); var d = doc(); if (d.hi < d.hist.length - 1) restore(d.hi + 1); },
    jump: restore,
    canUndo: function () { return doc().hi > 0; },
    canRedo: function () { var d = doc(); return d.hi < d.hist.length - 1; },
    markSaved: function () { var d = doc(); d.base = snapOf(d); emit({ type: 'saved', structural: false }); },
    revertAll: function () { var d = doc(), o = nbtReadSnapshot(d.base); d.id = o.id; d.count = o.count; d.comps = o.comps; d.removed = o.removed; push(I18n.t("cadeditor.ui.core.78e03d0b58"), null, true, null); },
  };
})();

/* 联动只使用当前游戏提供的属性范围和实际修饰符，不删除装备/效果修饰符。 */
function linkedAttributeValue(def, row, base) {
  if (!def || !isFinite(def.min) || !isFinite(def.max)) throw new Error(I18n.t("cadeditor.ui.core.8f298d3374"));
  var mods = (row.modifiers || []).concat(def.transientModifiers || []), seen = {}, add = [], scale = [], total = [];
  mods.forEach(function (m) {
    var amount = nbtNumberValue(m.amount);
    if (!isFinite(amount) || seen[m.id]) throw new Error(I18n.t("cadeditor.ui.core.c4a4bab10c"));
    seen[m.id] = true;
    if (m.operation === 'add_value') add.push(amount);
    else if (m.operation === 'add_multiplied_base') scale.push(amount);
    else if (m.operation === 'add_multiplied_total') total.push(amount);
    else throw new Error(I18n.t("cadeditor.ui.core.45bad89006"));
  });
  var b = base; add.forEach(function (v) { b += v; });
  var value = b; scale.forEach(function (v) { value += b * v; }); total.forEach(function (v) { value *= 1 + v; });
  if (!isFinite(value)) throw new Error(I18n.t("cadeditor.ui.core.84c9aa2201"));
  return Math.max(def.min, Math.min(def.max, value));
}
function linkedAttributePlan(def, row, requested) {
  if (!row || !isFinite(row.base) || !isFinite(requested) || requested < 0) throw new Error(I18n.t("cadeditor.ui.core.eb061004b4"));
  var before = linkedAttributeValue(def, row, row.base), target = Math.max(requested, Math.fround(requested));
  if (target <= before) return { base: row.base, before: before, effective: before, changed: false };
  if (row.base > def.max || linkedAttributeValue(def, row, def.max) < target) throw new Error(I18n.t("cadeditor.ui.core.8f3f44b7d8", (fmtNum(def.max))));
  var lo = Math.max(def.min, row.base), hi = def.max;
  for (var i = 0; i < 80; i++) { var mid = lo + (hi - lo) / 2; if (mid === lo || mid === hi) break; if (linkedAttributeValue(def, row, mid) >= target) hi = mid; else lo = mid; }
  return { base: hi, before: before, effective: linkedAttributeValue(def, row, hi), changed: true };
}

/* ---------- 差异 ---------- */
function stateOf(o, cid) {
  if (o.removed[cid]) return { k: 'remove' };
  if (o.comps[cid] !== undefined) return { k: 'set', v: nbtTake(o.comps, cid) };
  return { k: 'inherit' };
}
function diffDoc(d) {
  var cache = docCache(d);
  if (cache.diff && cache.diffBase === d.base) return cache.diff;
  var b = baseOf(d), out = [], seen = {}, ids = [];
  [b.comps, b.removed, d.comps, d.removed].forEach(function (m) { for (var k in m) if (!seen[k]) { seen[k] = 1; ids.push(k); } });
  ids.sort();
  ids.forEach(function (cid) {
    var bk = intentOf(b, cid), dk = intentOf(d, cid);
    if (bk === dk && (bk !== 'set' || nbtComponentText(b, cid) === nbtComponentText(d, cid))) return;
    var x = stateOf(b, cid), y = stateOf(d, cid);
    if (x.k === y.k && deepEq(x.v, y.v)) return;
    out.push({ cid: cid, before: x, after: y });
  });
  if (b.id !== d.id) out.unshift({ cid: '#item', before: { k: 'set', v: b.id }, after: { k: 'set', v: d.id } });
  if (b.count !== d.count) out.unshift({ cid: '#count', before: { k: 'set', v: b.count }, after: { k: 'set', v: d.count } });
  cache.diffBase = d.base; cache.diff = out; return out;
}
function revertComp(d, cid) {
  var b = nbtReadSnapshot(d.base);
  delete d.comps[cid]; delete d.removed[cid];
  if (b.removed[cid]) d.removed[cid] = 1;
  else if (b.comps[cid] !== undefined) nbtPut(d.comps, cid, nbtTake(b.comps, cid));
}

/* ---------- 命令 ---------- */
// Inspect the final typed data, not text occurrences inside names, strings or keys.
// Vanilla SNBT cannot express these numbers; the editor's typed parser can.
function commandNumberIssue(d) {
  function find(n, path) {
    if (n.k === 'num' && !isFinite(nbtSpecialValue(n))) return { path:path, value:nbtSpecialValue(n) };
    var hit, i;
    if (n.k === 'obj') {
      for (i = 0; i < n.keys.length; i++) { hit = find(n.map[n.keys[i]], path ? path + '.' + n.keys[i] : n.keys[i]); if (hit) return hit; }
    } else if (n.k === 'list' || n.k === 'arr') {
      for (i = 0; i < n.items.length; i++) { hit = find(n.items[i], path + '[' + i + ']'); if (hit) return hit; }
    }
    return null;
  }
  var ids = Object.keys(d.comps).sort();
  for (var i = 0; i < ids.length; i++) {
    var cid = ids[i], text = nbtComponentText(d, cid);
    // Avoid another full parse of ordinary/large components on the command page.
    if (text.indexOf('NaN') < 0 && text.indexOf('Infinity') < 0) continue;
    var hit = find(nbtParse(text), '');
    if (hit) return { level:'warn', cid:cid, path:hit.path, msg:I18n.t("cadeditor.ui.core.744a6a9f87") };
  }
  return null;
}
function stackString(d) {
  var parts = [], k;
  var ids = Object.keys(d.comps).sort();
  ids.forEach(function (cid) {
    var c = CIDX[cid];
    parts.push(cid + '=' + nbtComponentText(d, cid));
  });
  Object.keys(d.removed).sort().forEach(function (cid) { parts.push('!' + cid); });
  return fullId(d.id) + (parts.length ? '[' + parts.join(',') + ']' : '');
}
var CMD_MODES = [
  { id: 'give', name: I18n.t("cadeditor.ui.core.96dba047ce"), tpl: function (sel, st, n) { return '/give ' + sel + ' ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'main', name: I18n.t("cadeditor.ui.core.30354b71a6"), tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' weapon.mainhand with ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'off', name: I18n.t("cadeditor.ui.core.092ad13cff"), tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' weapon.offhand with ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'hotbar', name: I18n.t("cadeditor.ui.core.40e41d86e8"), tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' hotbar.* with ' + st + (n > 1 ? ' ' + n : ''); } },
  { id: 'head', name: I18n.t("cadeditor.ui.core.a52f7e6f9a"), tpl: function (sel, st, n) { return '/item replace entity ' + sel + ' armor.head with ' + st + (n > 1 ? ' ' + n : ''); } },
];
function buildCommand(d, modeId, sel) {
  var m = CMD_MODES[0];
  CMD_MODES.forEach(function (x) { if (x.id === modeId) m = x; });
  return m.tpl(sel || '@s', stackString(d), d.count);
}

/* ---------- 游戏真实的数值范围 ----------
   component_schema 每个组件带 ranges_for_ui:[{path,min,max,default,min_exclusive}]；path 用 $ / .字段 / [] / {值}。
   null 是“没有已证明的界限”，不是 0。比 float 上限还大的 max 视为不限（滑块不要拉到 3e38）。命中内置 schema 的数值节点就覆盖 min / max。 */
function liveRangeNodes(sc, toks, i, out) {
  if (!sc) return;
  if (i >= toks.length) { if (sc.t === 'int' || sc.t === 'num') out.push(sc); else if (sc.t === 'union') sc.a.forEach(function (a) { liveRangeNodes(a, toks, i, out); }); return; }
  var t = toks[i];
  if (sc.t === 'union') { sc.a.forEach(function (a) { liveRangeNodes(a, toks, i, out); }); return; }
  if (sc.t === 'dunion') { Object.keys(sc.br).forEach(function (k) { liveRangeNodes(sc.br[k], toks, i, out); }); return; }
  if (t === '[]') { if (sc.t === 'arr' && sc.i) liveRangeNodes(sc.i, toks, i + 1, out); return; }
  if (t === '{value}') { if (sc.t === 'map' && sc.v) liveRangeNodes(sc.v, toks, i + 1, out); return; }
  if (sc.t === 'obj') sc.f.forEach(function (f) { if (f.k === t) liveRangeNodes(f.s, toks, i + 1, out); });
}
function liveRangeTokens(path) {
  var toks = [], p = String(path || '$'), j = 0;
  if (p.charAt(0) === '$') p = p.substring(1);
  while (j < p.length) {
    var ch = p.charAt(j);
    if (ch === '.') { var e = j + 1; while (e < p.length && p.charAt(e) !== '.' && p.charAt(e) !== '[' && p.charAt(e) !== '{') e++; toks.push(p.substring(j + 1, e)); j = e; }
    else if (p.substring(j, j + 2) === '[]') { toks.push('[]'); j += 2; }
    else if (p.substring(j, j + 7) === '{value}') { toks.push('{value}'); j += 7; }
    else j++;
  }
  return toks;
}
function applyLiveRanges(entries) {
  (entries || []).forEach(function (e) {
    if (!e || !e.id || !Array.isArray(e.ranges_for_ui)) return;
    var c = CIDX[shortId(e.id)]; if (!c || !c.schema) return;
    e.ranges_for_ui.forEach(function (r) {
      var nodes = []; liveRangeNodes(c.schema, liveRangeTokens(r.path), 0, nodes);
      nodes.forEach(function (n) {
        if (typeof r.min === 'number') { n.min = r.min; if (r.min_exclusive) n.minEx = true; else delete n.minEx; }
        else { delete n.min; delete n.minEx; }
        if (typeof r.max === 'number') { if (r.max < 3e38) n.max = r.max; else delete n.max; }
        else delete n.max;
        n.nbtType = r.number_type === 'float' ? 'f' : r.number_type === 'double' ? 'd' : null;
        n.allowNaN = r.allow_nan === true;
        n.allowPositiveInfinity = r.allow_positive_infinity === true;
        n.allowNegativeInfinity = r.allow_negative_infinity === true;
        n.live = true;
      });
    });
  });
}

/* ---------- 校验 ---------- */
function validateValue(sc, v, path, out, cid) {
  if (!sc) return;
  var add = function (lv, msg) { out.push({ level: lv, cid: cid, path: path, msg: msg }); };
  if (sc.t === 'union') sc = pickAlt(sc, v);
  if (!sc) return;
  switch (sc.t) {
    case 'int': case 'num':
      if (typeof v !== 'number' && !(typeof nbtMeta === 'function' && nbtMeta(v) && nbtMeta(v).scalar)) { add('error', I18n.t("cadeditor.ui.core.721f26d653")); break; }
      var numeric = typeof v === 'number' ? v : typeof nbtMeta === 'function' && nbtMeta(v) && nbtMeta(v).scalar ? nbtNumberValue(v) : NaN;
      if (!isFinite(numeric) && sc.t === 'num' && !sc.live && typeof Reg !== 'undefined' && !Reg.preview()) {
        var status = Reg.numericStatus(cid);
        add(status.error ? 'warn' : 'info', status.error ? I18n.t("cadeditor.ui.core.9b49128ee9", (status.error)) : status.pending ? I18n.t("cadeditor.ui.core.9216a734f1") : I18n.t("cadeditor.ui.core.8bfe831b4f"));
        break;
      }
      if (isNaN(numeric) && !(sc.t === 'num' && sc.allowNaN)) { add('error', I18n.t("cadeditor.ui.core.721f26d653")); break; }
      if (numeric === Infinity && !sc.allowPositiveInfinity) { add('error', I18n.t("cadeditor.ui.core.99111b0a46")); break; }
      if (numeric === -Infinity && !sc.allowNegativeInfinity) { add('error', I18n.t("cadeditor.ui.core.8fc0bc4b4f")); break; }
      if (sc.t === 'int' && !Number.isInteger(numeric)) add('error', I18n.t("cadeditor.ui.core.d02e678f1c"));
      if (!isFinite(numeric)) break; /* Actual Codec probes decide special values; finite UI bounds do not override them. */
      if (sc.min !== undefined && numeric < sc.min) add('error', I18n.t("cadeditor.ui.core.cd04629b4e", (sc.min)));
      else if (sc.minEx && numeric <= sc.min) add('error', I18n.t("cadeditor.ui.core.3c7e02e035", (sc.min)));
      if (sc.max !== undefined && numeric > sc.max) add('error', I18n.t("cadeditor.ui.core.6a0c534acf", (sc.max)));
      break;
    case 'str':
      if (typeof v !== 'string') { add('error', I18n.t("cadeditor.ui.core.e5ed01807b")); break; }
      if (sc.en && sc.en.indexOf(v) < 0 && !(typeof liveEnumHas === 'function' && liveEnumHas(cid, path, v))) add('error', I18n.t("cadeditor.ui.core.7d233e4aba", (v)));
      /* 注册表引用不能是空的：空串到游戏里会变成“minecraft:”，整件物品被拒绝 */
      if (sc.reg && (v === '' || v === 'minecraft:' || v === '#')) { add('error', I18n.t("cadeditor.ui.core.5559f2b633")); break; }
      if (sc.reg && !sc.tag && typeof Reg !== 'undefined' && !Reg.preview() && Reg.entryState(sc.reg, v) === false) add('warn', I18n.t("cadeditor.ui.core.20ffee95c3", (v)));
      break;
    case 'obj':
      if (!isObj(v)) { add('error', I18n.t("cadeditor.ui.core.51c3240600")); break; }
      sc.f.forEach(function (f) {
        if (v[f.k] === undefined) { if (f.r && f.df === undefined) add('error', I18n.t("cadeditor.ui.core.e56b6173c1", (f.k))); }
        else validateValue(f.s, v[f.k], path + '.' + f.k, out, cid);
      });
      break;
    case 'arr':
      if (!Array.isArray(v)) { add('error', I18n.t("cadeditor.ui.core.bcd73324fa")); break; }
      if (sc.max !== undefined && v.length > sc.max) add('error', I18n.t("cadeditor.ui.core.657e9aa82e", (sc.max)));
      if (sc.min !== undefined && v.length < sc.min) add('error', I18n.t("cadeditor.ui.core.7831cd54ae", (sc.min)));
      v.forEach(function (x, i) { validateValue(sc.i, x, path + '[' + i + ']', out, cid); });
      break;
    case 'map':
      if (!isObj(v)) { add('error', I18n.t("cadeditor.ui.core.3508aa673d")); break; }
      Object.keys(v).forEach(function (k) { validateValue(sc.k, k, path + '{' + k + '}', out, cid); validateValue(sc.v, v[k], path + '.' + k, out, cid); });
      break;
    case 'dunion':
      if (!isObj(v)) { add('error', I18n.t("cadeditor.ui.core.51c3240600")); break; }
      if (!sc.br[v[sc.disc]]) {
        if (typeof Reg === 'undefined' || Reg.preview()) add('error', I18n.t("cadeditor.ui.core.c0be91c3de", (v[sc.disc])));
        else if (!Reg.variantOptions(sc).some(function (e) { return e.v === v[sc.disc]; })) add('warn', I18n.t("cadeditor.ui.core.e600af6918", (v[sc.disc])));
      } else validateValue(sc.br[v[sc.disc]], v, path, out, cid);
      break;
    default: break;
  }
}
function validateDoc(d) {
  var out = [], eff = effectiveView(d);
  if (!knownItem(d.id) && (typeof Reg === 'undefined' || Reg.preview() || Reg.entryState('item', d.id) === false)) out.push({ level: 'warn', cid: null, path: '', msg: I18n.t("cadeditor.ui.core.4864b5c019", (d.id)) });
  Object.keys(d.comps).forEach(function (cid) {
    var c = CIDX[cid];
    if (!c) { out.push({ level: 'warn', cid: cid, path: '', msg: I18n.t("cadeditor.ui.core.0ef33d4c27", (cid)) }); return; }
    if (nbtComponentText(d, cid).length > 32768) { out.push({ level:'info', cid:cid, path:'', msg:I18n.t("cadeditor.ui.core.c2b57cab70") }); return; }
    var checks = docCache(d).checks, saved = checks[cid];
    if (!saved || saved.schema !== c.schema) { var problems = []; validateValue(c.schema, d.comps[cid], '', problems, cid); saved = checks[cid] = {schema:c.schema, problems:problems}; }
    saved.problems.forEach(function (problem) { out.push(problem); });
  });
  if (typeof Valid !== 'undefined') Valid.problems(d, out);   // 游戏对自由 NBT 组件的校验结果
  if (typeof stackPreviewProblems === 'function') stackPreviewProblems(d, out);
  /* 跨组件规则 */
  var maxd = eff.max_damage, dmg = eff.damage;
  if (typeof dmg === 'number' && typeof maxd === 'number' && dmg >= maxd) out.push({ level: 'warn', cid: 'damage', path: '', msg: I18n.t("cadeditor.ui.core.15b6b22aa7") });
  var maxs = typeof eff.max_stack_size === 'number' ? eff.max_stack_size : null;
  if (maxs !== null && d.count > maxs) out.push({ level: 'error', cid: '#count', path: '', msg: I18n.t("cadeditor.ui.core.b603a3ffd6", (d.count), (maxs)) });
  if (typeof maxd === 'number' && maxd > 0 && maxs > 1) out.push({ level: 'warn', cid: 'max_damage', path: '', msg: I18n.t("cadeditor.ui.core.b1f9c3c92d") });
  ['enchantments', 'stored_enchantments'].forEach(function (cid) {
    var m = eff[cid]; if (!isObj(m)) return;
    var ids = Object.keys(m).map(Reg.full);
    ids.forEach(function (id) {
      var e = Reg.enchant(id); if (!e) return;
      var lv = m[Object.keys(m).filter(function (k) { return Reg.full(k) === id; })[0]];
      if (e.max !== null && lv > e.max) out.push({ level: 'info', cid: cid, path: id, msg: I18n.t("cadeditor.ui.core.361c0b47b1", (e.name), (lv), (e.max)) });
      ids.forEach(function (x) { if (ids.indexOf(x) > ids.indexOf(id) && Reg.enchantConflict(e, x) === true) out.push({ level: 'warn', cid: cid, path: id, msg: I18n.t("cadeditor.ui.core.64277285c9", (e.name), (Reg.nameOf('enchantments', x) || x)) }); });
      if (cid === 'enchantments' && Reg.enchantFits(e, d.id) === false) out.push({ level: 'info', cid: cid, path: id, msg: I18n.t("cadeditor.ui.core.5751db2abb", (e.name), (shortId(d.id))) });
    });
  });
  return out;
}
/* 标签输入：逗号（中英文）或空白分隔，去掉空项 */
function splitTags(s) { return String(s || '').split(/[,，\s]+/).filter(function (x) { return x; }); }
