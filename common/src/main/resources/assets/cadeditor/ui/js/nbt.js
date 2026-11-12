/* 带类型的 SNBT 处理 + 向游戏校验组件（validate_component）。
   页面里组件值是普通 JSON，数字不分 byte / short / long / float / double。提交时对“自由 NBT 组件”改用 SNBT 字符串
   （apply 的 component_formats），并以宿主给的 component_snbt 为类型参照合并，保住 1b、5L、2.5f、[B;1b] 等类型。 */

/* 自由 NBT 组件：值里的任意字段类型都要保真，被编辑过就一律用 SNBT 提交，并向游戏校验 */
/* 从保险库放进来的嵌套物品（容器 / 束袋 / use_remainder …）：整个组件改用 SNBT 提交，才能保住里面的类型。保存成功后清空 */
var NBT_FORCE = {};
var NBT_RAW = { block_entity_data: 1, entity_data: 1, bucket_entity_data: 1, custom_data: 1, charged_projectiles: 1, lock: 1 };
var NBT_SPECIAL_NUMBER = /^([+-]?)(NaN|Infinity)([fFdD])$/;
function nbtSpecialNode(n) { return !!(n && n.k === 'num' && NBT_SPECIAL_NUMBER.test(String(n.raw || ''))); }
function nbtSpecialValue(n) {
  var m = NBT_SPECIAL_NUMBER.exec(String(n && n.raw || ''));
  if (!m) return n && n.v;
  return m[2] === 'NaN' ? NaN : m[1] === '-' ? -Infinity : Infinity;
}
function nbtSpecialRaw(v, type) {
  var suffix = type === 'f' ? 'f' : 'd';
  if (isNaN(v)) return 'NaN' + suffix;
  return (v < 0 ? '-' : '') + 'Infinity' + suffix;
}
function nbtNumberValue(v) { return typeof v === 'number' ? v : nbtMeta(v) && nbtMeta(v).scalar ? nbtSpecialValue(nbtMeta(v).scalar) : Number(v); }
function nbtSpecialScalar(v, type) {
  if (type !== 'f' && type !== 'd') throw new Error(I18n.t("cadeditor.ui.nbt.4f1cd92492"));
  return nbtScalar({ k: 'num', t: type, raw: nbtSpecialRaw(v, type), v: v });
}

/* ---------- 解析：节点 { k:'num'|'str'|'bool'|'list'|'arr'|'obj' } ---------- */
function nbtParse(text) {
  var i = 0, n = text.length, BSL = String.fromCharCode(92);
  var space = /\s*/g, word = /[A-Za-z0-9_.+\-]+/g;
  function fail(m) { var error = new Error(I18n.t("cadeditor.ui.nbt.10e79e00d8", (i + 1), (m))); error.pos = i; throw error; }
  function ws() { space.lastIndex = i; space.exec(text); i = space.lastIndex; }
  function quoted() {
    var q = text.charAt(i++), parts = [], start = i, scan = q === '"' ? /["\\]/g : /['\\]/g, hit;
    scan.lastIndex = i;
    while ((hit = scan.exec(text))) {
      parts.push(text.substring(start, hit.index)); i = hit.index + 1;
      if (hit[0] === q) return parts.join('');
      if (i >= n) break;
      var e = text.charAt(i++); parts.push(e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e);
      start = i; scan.lastIndex = i;
    }
    i = n;
    fail(I18n.t("cadeditor.ui.nbt.ea938416a6"));
  }
  function bare() {
    word.lastIndex = i; var hit = word.exec(text);
    if (!hit || hit.index !== i) fail(I18n.t("cadeditor.ui.nbt.177d0b922c"));
    i = word.lastIndex; return hit[0];
  }
  function classify(tok) {
    if (tok === 'true' || tok === 'false') return { k: 'bool', v: tok === 'true' };
    var special = NBT_SPECIAL_NUMBER.exec(tok);
    if (special) return { k: 'num', t: special[3].toLowerCase(), raw: tok, v: special[2] === 'NaN' ? NaN : special[1] === '-' ? -Infinity : Infinity };
    var m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([bBsSlLfFdD]?)$/.exec(tok);
    if (m) {
      var t = m[2].toLowerCase();
      if (!t) t = /[.eE]/.test(m[1]) ? 'd0' : 'i';   /* d0 = 没写后缀的小数（double） */
      return { k: 'num', t: t, raw: tok, v: parseFloat(m[1]) };
    }
    return { k: 'str', v: tok };
  }
  function value() {
    ws();
    var c = text.charAt(i);
    if (c === '{') return compound();
    if (c === '[') return listOrArray();
    if (c === '"' || c === "'") return { k: 'str', v: quoted() };
    return classify(bare());
  }
  function compound() {
    i++;
    var map = Object.create(null), keys = [];
    ws();
    if (text.charAt(i) === '}') { i++; return { k: 'obj', keys: keys, map: map }; }
    for (;;) {
      ws();
      var c = text.charAt(i), key = (c === '"' || c === "'") ? quoted() : bare();
      ws();
      if (text.charAt(i++) !== ':') fail(I18n.t("cadeditor.ui.core.f0f1d361b7"));
      if (!Object.prototype.hasOwnProperty.call(map, key)) keys.push(key);
      map[key] = value();
      ws();
      var d = text.charAt(i++);
      if (d === '}') break;
      if (d !== ',') fail(I18n.t("cadeditor.ui.core.b1203f8b20"));
      ws();
      if (text.charAt(i) === '}') { i++; break; }
    }
    return { k: 'obj', keys: keys, map: map };
  }
  function listOrArray() {
    i++;
    ws();
    var p = null, items = [], head = /^([BIL]);/.exec(text.substring(i, i + 2));
    if (head) { p = head[1]; i += 2; }
    ws();
    if (text.charAt(i) === ']') { i++; return p ? { k: 'arr', p: p, items: items } : { k: 'list', items: items }; }
    for (;;) {
      items.push(value());
      ws();
      var d = text.charAt(i++);
      if (d === ']') break;
      if (d !== ',') fail(I18n.t("cadeditor.ui.core.900a179806"));
      ws();
      if (text.charAt(i) === ']') { i++; break; }
    }
    return p ? { k: 'arr', p: p, items: items } : { k: 'list', items: items };
  }
  var node = value();
  ws();
  if (i < n) fail(I18n.t("cadeditor.ui.core.8406ba1e44"));
  return node;
}

/* ---------- 用户手输的 SNBT：类型跟随节点，跨文档不按值猜测 ---------- */
/* Metadata belongs to the actual node, never a global numeric/JSON value.
   Safe numeric children remain ordinary form values. Root numeric inputs and
   unsafe longs are value objects, so moving them cannot bind another value's raw text. */
var NBT_META = new WeakMap();
function nbtMeta(v) { return v && typeof v === 'object' ? NBT_META.get(v) : null; }
function nbtScalar(n) {
  if (nbtSpecialNode(n)) n.v = nbtSpecialValue(n);
  var value = new Number(n.v);
  NBT_META.set(value, { scalar: n });
  return value;
}
function nbtOwn(o, key, value) {
  Object.defineProperty(o, key, { value: value, enumerable: true, configurable: true, writable: true });
  return value;
}
function nbtToJson(n, child) {
  if (n.k === 'num') return !child || nbtSpecialNode(n) || (n.t === 'l' && Math.abs(n.v) > 9007199254740991) ? nbtScalar(n) : n.v;
  if (n.k === 'str' || n.k === 'bool') return n.v;
  var o;
  if (n.k === 'list' || n.k === 'arr') o = n.items.map(function (it) { return nbtToJson(it, true); });
  else { o = {}; n.keys.forEach(function (k) { nbtOwn(o, k, nbtToJson(n.map[k], true)); }); }
  NBT_META.set(o, n);
  return o;
}
function nbtClone(v) {
  if (v === null || typeof v !== 'object') return v;
  var meta = nbtMeta(v);
  if (meta && meta.scalar) return nbtScalar(meta.scalar);
  var out = Array.isArray(v) ? [] : {};
  Object.keys(v).forEach(function (k) { nbtOwn(out, k, nbtClone(v[k])); });
  if (meta) NBT_META.set(out, meta);
  return out;
}
/* Transfer a field to a different owner (default picker, clipboard, raw editor). */
function nbtTake(owner, key) {
  var v = owner[key], m = nbtMeta(owner), ref = m && (m.k === 'obj' ? m.map[key] : m.items && m.items[key] || (m.numberType ? { k:'num', t:m.numberType } : null));
  if (typeof v === 'number' && ref && ref.k === 'num') return nbtScalar(nbtParse(nbtNum(v, ref)));
  if (v && typeof v === 'object' && !nbtMeta(v) && ref) return nbtToJson(nbtParse(nbtMerge(v, ref)), true);
  return nbtClone(v);
}
function nbtSetTyped(owner, key, value, type) {
  return nbtPut(owner, key, nbtScalar(nbtParse(nbtNum(Number(value), { k: 'num', t: type, raw: '', v: NaN }))));
}
function nbtPut(owner, key, value) {
  var m = nbtMeta(value), prev = nbtMeta(owner);
  if (m && !Array.isArray(owner)) {
    var refs = Object.create(null);
    if (prev && prev.k === 'obj') Object.keys(prev.map).forEach(function (k) { refs[k] = prev.map[k]; });
    refs[key] = m.scalar || nbtShape(nbtParse(nbtMerge(value, null)));
    NBT_META.set(owner, { k: 'obj', keys: Object.keys(refs), map: refs });
    if (m.scalar && !nbtSpecialNode(m.scalar) && Math.abs(m.scalar.v) <= 9007199254740991) value = m.scalar.v;
  }
  return nbtOwn(owner, key, value);
}
function nbtTypedNode(n) {
  if (n.k === 'num') return n.t !== 'i' && n.t !== 'd0';
  if (n.k === 'arr') return true;
  if (n.k === 'list') return n.items.some(nbtTypedNode);
  if (n.k === 'obj') return n.keys.some(function (k) { return nbtTypedNode(n.map[k]); });
  return false;
}
function nbtNote(text) {
  return nbtToJson(nbtParse(text));
}
function nbtSeenClear() { NBT_FORCE = {}; }
/* 显式输入的节点类型优先于宿主旧基线。 */
function nbtPickRef(v, ref) {
  var own = nbtMeta(v);
  return own && !own.scalar ? own : ref;
}
/* 数组里同值的元素个数与参照里不一样（删了 / 加了）：按位置抄旧原文会把已删元素的数字写回来，这种值只沿用类型 */
function nbtAmbig(v, refItems) {
  var a = {}, b = {};
  v.forEach(function (x) { if (typeof x === 'number') a[x] = (a[x] || 0) + 1; });
  refItems.forEach(function (r) { if (r && r.k === 'num') b[r.v] = (b[r.v] || 0) + 1; });
  return function (x) { return a[x] !== b[x]; };
}
function nbtTypeOnly(r) { return { k: 'num', t: r.t, raw: '', v: NaN }; }

/* ---------- 合并：按 JSON 当前值输出 SNBT，类型和原文参照 ref ---------- */
function nbtNum(v, ref) {
  if (!isFinite(v)) {
    var specialType = ref && (ref.t === 'f' || ref.t === 'd' || ref.t === 'd0') ? (ref.t === 'f' ? 'f' : 'd') : null;
    if (!specialType) throw new Error(I18n.t("cadeditor.ui.nbt.2c32636742"));
    return nbtSpecialRaw(v, specialType);
  }
  if (ref && ref.k === 'num') {
    if ((nbtSpecialNode(ref) && Object.is(nbtSpecialValue(ref), v)) || ref.v === v) return ref.raw; /* 没改：原文照抄 */
    var t = ref.t;
    if (t === 'b' || t === 's') return String(Math.round(v)) + t;
    if (t === 'l') return String(Math.round(v)) + 'L';
    if (t === 'f') return String(v) + 'f';
    if (t === 'd') return String(v) + 'd';
    if (t === 'd0' && Math.round(v) === v) return String(v) + 'd';
  }
  return String(v);
}
function nbtMerge(v, ref) {
  if (v === null || v === undefined) return nbtSpecialNode(ref) ? ref.raw : '""';
  var own = nbtMeta(v);
  if (own && own.scalar) return own.scalar.raw;
  ref = nbtPickRef(v, ref);
  if (typeof v === 'boolean') return ref && ref.k === 'num' && ref.t === 'b' ? (v ? '1b' : '0b') : String(v);
  if (typeof v === 'number') return nbtNum(v, ref && (ref.k === 'num' || ref.k === 'bool') ? (ref.k === 'num' ? ref : null) : null);
  if (typeof v === 'string') return snbtStr(v);
  if (Array.isArray(v)) {
    if (ref && ref.k === 'arr') {
      var tt = ref.p === 'B' ? 'b' : ref.p === 'L' ? 'l' : 'i', amb = nbtAmbig(v, ref.items);
      return '[' + ref.p + ';' + v.map(function (x, idx) {
        var r = ref.items[idx];
        if (!r || amb(Number(x))) r = nbtTypeOnly(r || ref.items[0] || { t: tt });
        return nbtMeta(x) && nbtMeta(x).scalar ? nbtMerge(x, null) : nbtNum(Number(x), r);
      }).join(',') + ']';
    }
    var lamb = ref && ref.k === 'list' ? nbtAmbig(v, ref.items) : null;
    return '[' + v.map(function (x, idx) {
      var r = ref && ref.k === 'list' ? (ref.items[idx] || ref.items[ref.items.length - 1] || (ref.numberType ? { k:'num', t:ref.numberType } : null)) : null;
      if (r && r.k === 'num' && typeof x === 'number' && lamb(x)) r = nbtTypeOnly(r);
      return nbtMerge(x, r);
    }).join(',') + ']';
  }
  var parts = Object.keys(v).map(function (k) { return snbtKey(k) + ':' + nbtMerge(v[k], ref && ref.k === 'obj' ? (ref.map[k] || null) : null); });
  return '{' + parts.join(',') + '}';
}
/* 参照文本里有 JSON 表达不了的类型（short / long / 类型化数组）？ */
function nbtHasTyped(text) { return nbtTypedNode(nbtParse(text)); }

function nbtHydrate(comps, sidecar) {
  var out = nbtClone(comps || {}), refs = Object.create(null);
  var own = nbtMeta(out);
  if (own && own.k === 'obj') Object.keys(own.map).forEach(function (cid) { refs[cid] = own.map[cid]; });
  Object.keys(sidecar || {}).forEach(function (cid) {
    if (!Object.prototype.hasOwnProperty.call(out, cid)) return;
    refs[cid] = nbtParse(nbtMerge(nbtTake(out, cid), nbtParse(sidecar[cid])));
    nbtOwn(out, cid, nbtToJson(refs[cid], true));
  });
  NBT_META.set(out, { k: 'obj', keys: Object.keys(refs), map: refs });
  return out;
}
function nbtComponentText(d, cid) {
  var cache = docCache(d);
  if (Object.prototype.hasOwnProperty.call(cache.texts, cid)) return cache.texts[cid];
  var ref = d.snbt && d.snbt[cid];
  var owner = nbtMeta(d.comps), field = owner && owner.map && owner.map[cid];
  return cache.texts[cid] = nbtMerge(d.comps[cid], field || (ref ? nbtParse(ref) : null));
}
function nbtComponentTexts(d) {
  var out = {};
  Object.keys(d.comps || {}).forEach(function (cid) { nbtOwn(out, cid, nbtComponentText(d, cid)); });
  return out;
}
/* Persist only type/precision metadata, not a second copy of large string values. */
function nbtShape(node) {
  if (node.k === 'num') {
    if (nbtSpecialNode(node) || Object.is(node.v, -0) || node.t === 'l' && Math.abs(node.v) > 9007199254740991) return node;
    if (node.raw !== nbtNum(node.v, { k:'num', t:node.t })) return node;
    return node.t === 'i' ? null : { k:'num', t:node.t };
  }
  if (node.k === 'str' || node.k === 'bool') return null;
  if (node.k === 'obj') {
    var map = Object.create(null);
    node.keys.forEach(function (key) { var shape = nbtShape(node.map[key]); if (shape) map[key] = shape; });
    var keys = Object.keys(map); return keys.length ? { k: 'obj', keys: keys, map: map } : null;
  }
  // Uniform numeric lists/typed arrays need one type, not a metadata object per number.
  var first = node.items[0], uniform = !!first && first.k === 'num' && node.items.every(function (n) { return n.k === 'num' && n.t === first.t && !nbtSpecialNode(n) && !Object.is(n.v, -0) && !(n.t === 'l' && Math.abs(n.v) > 9007199254740991) && n.raw === nbtNum(n.v, { k:'num', t:node.k === 'arr' ? node.p === 'B' ? 'b' : node.p === 'L' ? 'l' : 'i' : n.t }); });
  if (uniform) return node.k === 'arr' ? { k:'arr', p:node.p, items:[] } : first.t === 'i' ? null : { k:'list', numberType:first.t, items:[] };
  var items = node.items.map(nbtShape);
  while (items.length && !items[items.length - 1]) items.pop();
  return node.k === 'list' && !items.length ? null : { k:node.k, p:node.p, items:items };
}
function nbtRestore(value, shape) {
  if (!shape) return nbtClone(value);
  if (shape.k === 'num' && nbtSpecialNode(shape)) return nbtScalar(shape);
  if (shape.k === 'num' && shape.raw && Object.is(parseFloat(shape.raw), -0)) return nbtScalar(nbtParse(shape.raw));
  if (typeof value === 'number' && shape.k === 'num') {
    return shape.t === 'l' && Math.abs(shape.v) > 9007199254740991 ? nbtScalar(nbtParse(nbtNum(value, shape))) : value;
  }
  if (value === null || typeof value !== 'object') return value;
  var out = Array.isArray(value) ? [] : {};
  Object.keys(value).forEach(function (key) { nbtOwn(out, key, nbtRestore(value[key], shape.k === 'obj' ? shape.map[key] : shape.items && shape.items[key] || (shape.numberType ? { k:'num', t:shape.numberType } : null))); });
  NBT_META.set(out, shape);
  return out;
}
function nbtSnapshot(d) {
  var cache = docCache(d); if (cache.snapshot !== undefined) return cache.snapshot;
  var refs = Object.create(null);
  Object.keys(d.comps).forEach(function (cid) {
    if (!Object.prototype.hasOwnProperty.call(cache.types, cid)) cache.types[cid] = nbtShape(nbtParse(nbtComponentText(d, cid)));
    refs[cid] = cache.types[cid];
  });
  return cache.snapshot = JSON.stringify({ id: d.id, count: d.count, comps: d.comps, removed: d.removed, nbt_types: { k: 'obj', keys: Object.keys(refs), map: refs } });
}
function nbtReadSnapshot(text) {
  var data = JSON.parse(text);
  data.comps = data.nbt_types ? nbtRestore(data.comps || {}, data.nbt_types) : nbtHydrate(data.comps, data.nbt || {});
  return data;
}
/* Hot reload crosses a JSON boundary too. Keep each open document's metadata,
   including unsaved edits, without changing its baseline or undo position. */
function nbtExportDocState(d) {
  var out = {};
  Object.keys(d).forEach(function (key) { nbtOwn(out, key, d[key]); });
  out.nbt_types = JSON.parse(nbtSnapshot(d)).nbt_types;
  var raw = typeof ItemRawBuffers !== 'undefined' && ItemRawBuffers.get(d);
  if (raw && (raw.invalid || raw.pending)) out.rawBuffer = {text:raw.text, base:raw.base};
  return out;
}
function nbtImportDocState(state) {
  var out = nbtClone(state);
  out.comps = state.nbt_types ? nbtRestore(state.comps || {}, state.nbt_types) : nbtHydrate(state.comps || {}, state.snbt || {});
  delete out.nbt_types;
  if (state.rawBuffer && typeof state.rawBuffer.text === 'string' && typeof ItemRawBuffers !== 'undefined') ItemRawBuffers.set(out, {text:state.rawBuffer.text, base:state.rawBuffer.base, invalid:true});
  delete out.rawBuffer;
  return out;
}
/* New form-created objects may have no root metadata while a child amount is
   already a typed Number. Inspect the current children, not just the old AST. */
function nbtValueNeedsSnbt(value) {
  if (typeof value === 'number') return !isFinite(value);
  if (!value || typeof value !== 'object') return false;
  if (nbtMeta(value)) return true;
  return Object.keys(value).some(function (key) { return nbtValueNeedsSnbt(value[key]); });
}
function nbtUsesSnbt(d, cid) {
  var value = d.comps[cid], ref = d.snbt && d.snbt[cid], owner = nbtMeta(d.comps), ownedField = owner && owner.map && owner.map[cid];
  return !!(NBT_RAW[cid] || NBT_FORCE[cid] || nbtValueNeedsSnbt(value) || ownedField || (ref && nbtHasTyped(ref)));
}
function nbtNodeHasSpecial(node) {
  if (!node) return false;
  if (nbtSpecialNode(node)) return true;
  if (node.scalar) return nbtNodeHasSpecial(node.scalar);
  if (node.k === 'obj') return (node.keys || Object.keys(node.map || {})).some(function (key) { return nbtNodeHasSpecial(node.map[key]); });
  if (node.k === 'list' || node.k === 'arr') return (node.items || []).some(nbtNodeHasSpecial);
  return false;
}
function nbtNeedsTypedValidation(d, cid) {
  var value = d.comps[cid], owner = nbtMeta(d.comps), field = owner && owner.map && owner.map[cid];
  if (NBT_RAW[cid] || nbtNodeHasSpecial(nbtMeta(value)) || nbtNodeHasSpecial(field)) return true;
  // Nested items and mod components can contain typed NBT too. A lossy JSON
  // validation must never reject data that apply sends through the SNBT codec.
  return nbtUsesSnbt(d, cid) && nbtHasTyped(nbtComponentText(d, cid));
}

/* 提交时：哪些组件改用 SNBT。没被编辑过的交给宿主按原值保留（宿主会恢复真实组件，类型原样）。 */
function nbtApplyFormats(d, all) {
  var base = {}, out = {}, formats = {}, any = false;
  base = baseOf(d);
  Object.keys(d.comps).forEach(function (cid) {
    var v = d.comps[cid], ref = d.snbt && d.snbt[cid];
    out[cid] = clone(v);
    var text = nbtComponentText(d, cid);
    if (!all && base.comps[cid] !== undefined && text === nbtComponentText(base, cid)) return;
    if (!nbtUsesSnbt(d, cid)) return;
    try { out[cid] = text; formats[cid] = 'snbt'; any = true; } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('nbt.applyFormats', e); throw e; }
  });
  return { comps: out, formats: any ? formats : null };
}

/* ---------- 向游戏校验（validate_component）---------- */
var Valid = {
  state: {}, waiting: {}, timers: {}, subs: [], seq: 0,
  host: function () { return typeof oriel !== 'undefined' && !!oriel.send && typeof Reg !== 'undefined' && Reg.live(); },
  on: function (f, alive) { this.subs.push({ f: f, alive: alive }); if (this.subs.length > 40) this.subs = this.subs.filter(function (s) { return !s.alive || s.alive(); }); },
  fire: function () { this.subs.slice().forEach(function (s) { try { s.f(); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('validation.subscriber', e); } }); },
  textOf: function (d, cid) {
    if (d.comps[cid] === undefined) return null;
    return nbtComponentText(d, cid);
  },
  edited: function (d, cid) {
    var base = baseOf(d);
    return d.comps[cid] !== undefined && (base.comps[cid] === undefined || nbtComponentText(d, cid) !== nbtComponentText(base, cid));
  },
  /* 每次修改后调用：编辑过的自由 NBT 组件，停手 450ms 后向游戏校验一次 */
  touch: function (cids) {
    if (!this.host()) return;
    var d = Store.doc(); if (!d) return;
    var me = this;
    this.touchHost(d, cids);
    (cids || Object.keys(d.comps).concat(Object.keys(this.state))).forEach(function (cid) {
      if (d.comps[cid] === undefined) { clearTimeout(me.timers[cid]); delete me.state[cid]; return; }
      if (!nbtNeedsTypedValidation(d, cid)) return;
      if (!me.edited(d, cid)) { if (me.state[cid]) { delete me.state[cid]; me.fire(); } return; }
      clearTimeout(me.timers[cid]);
      me.timers[cid] = setTimeout(function () { if (Store.doc() === d) me.run(cid, d); }, 450);
    });
  },
  run: function (cid, d) {
    d = d || Store.doc(); if (!d) return;
    var text; try { text = this.textOf(d, cid); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('validation.serialize', e); return; }
    if (text === null) return;
    var st = this.state[cid];
    if (st && st.text === text) return;
    if (text.length > 7000) { this.state[cid] = { text: text, note: I18n.t("cadeditor.ui.core.c2b57cab70") }; this.fire(); return; }
    var id = 'v' + (++this.seq) + '-' + Date.now();
    this.waiting[id] = { cid: cid, text: text };
    this.state[cid] = { text: text, pending: true };
    this.fire();
    var sent = false; try { sent = oriel.send('validate_component', { requestId: id, component: cid, snbt: text }); } catch (e) {}
    if (!sent) { delete this.waiting[id]; this.state[cid] = { text: text, note: I18n.t("cadeditor.ui.nbt.282c0da446") }; this.fire(); }
  },
  /* ---- 逐字段校验（component_validate）：被改过的普通组件，把当前值交给游戏的真实 Codec，错误带字段路径（$.nutrition）。
     自由 NBT 组件仍走上面的 validate_component（SNBT）。结果和当前值对不上（又改了）就不算数。 ---- */
  hv: {}, hvWait: {}, hvTimers: {}, hvSeq: 0,
  touchHost: function (d, cids) {
    var me = this;
    (cids || Object.keys(d.comps)).forEach(function (cid) {
      if (d.comps[cid] === undefined) { clearTimeout(me.hvTimers[cid]); delete me.hv[cid]; return; }
      if (nbtNeedsTypedValidation(d, cid)) {
        clearTimeout(me.hvTimers[cid]); delete me.hvTimers[cid]; delete me.hv[cid];
        Object.keys(me.hvWait).forEach(function (id) { if (me.hvWait[id].cid === cid) delete me.hvWait[id]; });
        return;
      }
      if (!me.edited(d, cid)) { if (me.hv[cid]) { delete me.hv[cid]; me.fire(); } return; }
      clearTimeout(me.hvTimers[cid]);
      me.hvTimers[cid] = setTimeout(function () { if (Store.doc() === d) me.runHost(cid, d); }, 450);
    });
    Object.keys(this.hv).forEach(function (cid) { if (d.comps[cid] === undefined) { delete me.hv[cid]; me.fire(); } });
  },
  runHost: function (cid, d) {
    d = d || Store.doc(); if (!d || d.comps[cid] === undefined) return;
    if (nbtNeedsTypedValidation(d, cid)) { delete this.hv[cid]; this.run(cid, d); return; }
    var key; try { key = JSON.stringify(d.comps[cid]); } catch (e) { return; }
    var st = this.hv[cid]; if (st && st.key === key) return;
    if (key.length > 6000) { this.hv[cid] = { key: key, note: I18n.t("cadeditor.ui.core.c2b57cab70") }; this.fire(); return; }
    var id = 'cv' + (++this.hvSeq) + '-' + Date.now();
    this.hvWait[id] = { cid: cid, key: key };
    this.hv[cid] = { key: key, pending: true };
    var sent = false; try { sent = oriel.send('component_validate', { requestId: id, component: cid, value: d.comps[cid] }); } catch (e) {}
    if (!sent) { delete this.hvWait[id]; delete this.hv[cid]; }
  },
  receiveHost: function (res) {
    if (!res || !res.requestId) return;
    var w = this.hvWait[res.requestId]; if (!w) return;
    delete this.hvWait[res.requestId];
    if (res.ok) this.hv[w.cid] = { key: w.key, ok: true };
    else this.hv[w.cid] = { key: w.key, ok: false, errors: (res.errors && res.errors.length) ? res.errors : [{ path: '$', message: String(res.error || I18n.t("cadeditor.ui.nbt.d3fce53154")) }] };
    this.fire();
  },
  receive: function (res) {
    if (!res || !res.requestId) return;
    var w = this.waiting[res.requestId]; if (!w) return;
    delete this.waiting[res.requestId];
    this.state[w.cid] = res.ok ? { text: w.text, ok: true } : { text: w.text, ok: false, error: String(res.error || I18n.t("cadeditor.ui.nbt.d3fce53154")) };
    this.fire();
  },
  /* 给 validateDoc 用：校验失败且对应当前内容的，按错误处理 */
  problems: function (d, out) {
    var me = this;
    Object.keys(this.hv).forEach(function (cid) {
      var st = me.hv[cid]; if (!st || st.ok !== false || d.comps[cid] === undefined || nbtNeedsTypedValidation(d,cid)) return;
      var cur = null; try { cur = JSON.stringify(d.comps[cid]); } catch (e) {}
      if (cur !== st.key) return;
      var c = typeof CIDX !== 'undefined' ? CIDX[cid] : null;
      st.errors.forEach(function (e) {
        var path = String(e.path || '$'); if (path.charAt(0) === '$') path = path.substring(1); if (path.charAt(0) === '.') path = path.substring(1);
        out.push({ level: 'error', cid: cid, path: path, msg: (c ? c.name : cid) + (path ? ' · ' + path : '') + '：' + String(e.message || I18n.t("cadeditor.ui.nbt.d3fce53154")) });
      });
    });
    Object.keys(this.state).forEach(function (cid) {
      var st = me.state[cid]; if (!st || st.ok !== false || d.comps[cid] === undefined) return;
      var cur = null; try { cur = me.textOf(d, cid); } catch (e) {}
      if (cur !== st.text) return;
      var c = typeof CIDX !== 'undefined' ? CIDX[cid] : null;
      out.push({ level: 'error', cid: cid, path: '', msg: I18n.t("cadeditor.ui.nbt.35c4e8e3ce", (c ? c.name : cid), (st.error)) });
    });
  },
  /* 数据窗口里的小状态行 */
  badge: function (cid) {
    var el = h('div', { class: 'vd-badge' });
    function paint() {
      clear(el);
      var st = Valid.state[cid];
      if (!Valid.host() || !st) { el.className = 'vd-badge none'; return; }
      if (st.pending) { el.className = 'vd-badge wait'; el.appendChild(uiIcon('clock', 12)); el.appendChild(h('span', { text: I18n.t("cadeditor.ui.nbt.2a4c6ddc49") })); return; }
      if (st.ok) { el.className = 'vd-badge ok'; el.appendChild(uiIcon('check', 12)); el.appendChild(h('span', { text: I18n.t("cadeditor.ui.nbt.e8a930dd86") })); return; }
      if (st.ok === false) { el.className = 'vd-badge bad'; el.appendChild(uiIcon('warning', 12)); el.appendChild(h('span', { text: st.error })); return; }
      el.className = 'vd-badge none';
      if (st.note) { el.className = 'vd-badge wait'; el.appendChild(h('span', { text: st.note })); }
    }
    Valid.on(function () { if (el.parentNode != null) paint(); }, function () { return el.parentNode != null; });
    paint();
    return el;
  }
};

/* SNBT 文本输出（原在 worldedit.js，spawn.js 等也用） */
function nbtPrint(n, pretty, ind) {
  ind = ind || '';
  var nx = ind + '  ';
  if (n.k === 'num') return n.raw;
  if (n.k === 'bool') return n.v ? 'true' : 'false';
  if (n.k === 'str') return snbtStr(n.v);
  if (n.k === 'arr' || n.k === 'list') {
    var pre = n.k === 'arr' ? n.p + ';' : '';
    if (!n.items.length) return '[' + pre + ']';
    var scalars = n.items.every(function (x) { return x.k !== 'obj' && x.k !== 'list' && x.k !== 'arr'; });
    if (!pretty || (scalars && n.items.length <= 12)) return '[' + pre + n.items.map(function (x) { return nbtPrint(x, false); }).join(',') + ']';
    return '[' + pre + '\n' + n.items.map(function (x) { return nx + nbtPrint(x, true, nx); }).join(',\n') + '\n' + ind + ']';
  }
  if (!n.keys.length) return '{}';
  if (!pretty) return '{' + n.keys.map(function (k) { return snbtKey(k) + ':' + nbtPrint(n.map[k], false); }).join(',') + '}';
  return '{\n' + n.keys.map(function (k) { return nx + snbtKey(k) + ': ' + nbtPrint(n.map[k], true, nx); }).join(',\n') + '\n' + ind + '}';
}

/* 文本组件 <-> 输入框文字：字符串原样，复合 / 列表转成 JSON 文本；反过来输入 JSON 就还原成组件 */
function msgText(m) { return typeof m === 'string' ? m : (m === undefined || m === null ? '' : JSON.stringify(m)); }
function textMsg(t) {
  var s = t.replace(/^\s+/, '');
  if (s.charAt(0) === '{' || s.charAt(0) === '[' || (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"')) { try { return JSON.parse(s); } catch (e) {} }
  return t;
}
