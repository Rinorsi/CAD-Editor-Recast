/* 带类型的 SNBT 处理 + 向游戏校验组件（validate_component）。
   页面里组件值是普通 JSON，数字不分 byte / short / long / float / double。提交时对“自由 NBT 组件”改用 SNBT 字符串
   （apply 的 component_formats），并以宿主给的 component_snbt 为类型参照合并，保住 1b、5L、2.5f、[B;1b] 等类型。 */

/* 自由 NBT 组件：值里的任意字段类型都要保真，被编辑过就一律用 SNBT 提交，并向游戏校验 */
/* 从保险库放进来的嵌套物品（容器 / 束袋 / use_remainder …）：整个组件改用 SNBT 提交，才能保住里面的类型。保存成功后清空 */
var NBT_FORCE = {};
var NBT_RAW = { block_entity_data: 1, entity_data: 1, bucket_entity_data: 1, custom_data: 1, charged_projectiles: 1, lock: 1 };

/* ---------- 解析：节点 { k:'num'|'str'|'bool'|'list'|'arr'|'obj' } ---------- */
function nbtParse(text) {
  var i = 0, n = text.length, BSL = String.fromCharCode(92);
  function fail(m) { throw new Error('SNBT 第 ' + (i + 1) + ' 个字符：' + m); }
  function ws() { while (i < n && /\s/.test(text.charAt(i))) i++; }
  function quoted() {
    var q = text.charAt(i++), out = '';
    while (i < n) {
      var c = text.charAt(i++);
      if (c === q) return out;
      if (c === BSL) { var e = text.charAt(i++); out += e === 'n' ? String.fromCharCode(10) : e === 't' ? String.fromCharCode(9) : e === 'r' ? String.fromCharCode(13) : e; }
      else out += c;
    }
    fail('字符串没有结束');
  }
  function bare() {
    var s = i;
    while (i < n && /[A-Za-z0-9_.+\-]/.test(text.charAt(i))) i++;
    if (i === s) fail('这里需要一个值');
    return text.substring(s, i);
  }
  function classify(tok) {
    if (tok === 'true' || tok === 'false') return { k: 'bool', v: tok === 'true' };
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
    var map = {}, keys = [];
    ws();
    if (text.charAt(i) === '}') { i++; return { k: 'obj', keys: keys, map: map }; }
    for (;;) {
      ws();
      var c = text.charAt(i), key = (c === '"' || c === "'") ? quoted() : bare();
      ws();
      if (text.charAt(i++) !== ':') fail('键后面需要冒号');
      map[key] = value(); keys.push(key);
      ws();
      var d = text.charAt(i++);
      if (d === '}') break;
      if (d !== ',') fail('需要逗号或右花括号');
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
      if (d !== ',') fail('需要逗号或右方括号');
      ws();
      if (text.charAt(i) === ']') { i++; break; }
    }
    return p ? { k: 'arr', p: p, items: items } : { k: 'list', items: items };
  }
  var node = value();
  ws();
  if (i < n) fail('末尾有多余内容');
  return node;
}

/* ---------- 用户手输的 SNBT：保住他写的类型 ----------
   页面里输入框把 SNBT 解析成普通 JSON 再存，类型就没了（2s 变 2，1b 变 1）。parseSnbtUser 解析时把带类型的节点记在这里，
   合并时如果某个值的 JSON 与记下的某个节点一致（而旧参照已对不上），就用用户写的那个类型。应用成功后清空。 */
var NBT_SEEN = {}, NBT_SEEN_N = 0;
function nbtToJson(n) {
  if (n.k === 'num' || n.k === 'str' || n.k === 'bool') return n.v;
  if (n.k === 'list' || n.k === 'arr') return n.items.map(nbtToJson);
  var o = {}; n.keys.forEach(function (k) { o[k] = nbtToJson(n.map[k]); }); return o;
}
function nbtTypedNode(n) {
  if (n.k === 'num') return n.t !== 'i' && n.t !== 'd0';
  if (n.k === 'arr') return true;
  if (n.k === 'list') return n.items.some(nbtTypedNode);
  if (n.k === 'obj') return n.keys.some(function (k) { return nbtTypedNode(n.map[k]); });
  return false;
}
function nbtNote(text) {
  var root = nbtParse(text);
  (function walk(n) {
    if (nbtTypedNode(n)) {
      if (NBT_SEEN_N > 300) { NBT_SEEN = {}; NBT_SEEN_N = 0; }
      var j = JSON.stringify(nbtToJson(n));
      if (!NBT_SEEN[j]) NBT_SEEN_N++;
      NBT_SEEN[j] = n;
    }
    if (n.k === 'list' || n.k === 'arr') n.items.forEach(walk);
    else if (n.k === 'obj') n.keys.forEach(function (k) { walk(n.map[k]); });
  })(root);
}
function nbtSeenClear() { NBT_SEEN = {}; NBT_SEEN_N = 0; NBT_FORCE = {}; }
/* 值已经被改过（与旧参照对不上）时，看用户是不是手输过一个带类型的同值节点 */
function nbtPickRef(v, ref) {
  if (!NBT_SEEN_N || v === null || v === undefined || typeof v === 'string' || typeof v === 'boolean') return ref;
  var js = JSON.stringify(v);
  if (ref && JSON.stringify(nbtToJson(ref)) === js) return ref;
  return NBT_SEEN[js] || ref;
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
  if (ref && ref.k === 'num') {
    if (ref.v === v) return ref.raw;                       /* 没改：原文照抄，连超出 2^53 的整数也不丢 */
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
  if (v === null || v === undefined) return '""';
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
        return nbtNum(Number(x), r);
      }).join(',') + ']';
    }
    var lamb = ref && ref.k === 'list' ? nbtAmbig(v, ref.items) : null;
    return '[' + v.map(function (x, idx) {
      var r = ref && ref.k === 'list' ? (ref.items[idx] || ref.items[ref.items.length - 1] || null) : null;
      if (r && r.k === 'num' && typeof x === 'number' && lamb(x)) r = nbtTypeOnly(r);
      return nbtMerge(x, r);
    }).join(',') + ']';
  }
  var parts = Object.keys(v).map(function (k) { return snbtKey(k) + ':' + nbtMerge(v[k], ref && ref.k === 'obj' ? (ref.map[k] || null) : null); });
  return '{' + parts.join(',') + '}';
}
/* 参照文本里有 JSON 表达不了的类型（short / long / 类型化数组）？ */
function nbtHasTyped(text) {
  return /\[[BIL];/.test(text)
    || /(?:^|[^A-Za-z0-9_."'])[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[sSlLfFdD](?![A-Za-z0-9_])/.test(text)   /* 2s 3L 2.0f 4d；单独的 1b / 0b 多半是布尔，不算 */
    || /(?:^|[^A-Za-z0-9_."'])[+-]?\d+\.\d*(?![A-Za-z0-9_])/.test(text);   /* 没写后缀的小数 = double，整数化后会变 int */
}

/* 提交时：哪些组件改用 SNBT。没被编辑过的交给宿主按原值保留（宿主会恢复真实组件，类型原样）。 */
function nbtApplyFormats(d) {
  var base = {}, out = {}, formats = {}, any = false;
  try { base = JSON.parse(d.base).comps || {}; } catch (e) {}
  Object.keys(d.comps).forEach(function (cid) {
    var v = d.comps[cid], ref = d.snbt && d.snbt[cid];
    out[cid] = clone(v);
    if (JSON.stringify(v) === JSON.stringify(base[cid])) return;
    if (!(NBT_RAW[cid] || NBT_FORCE[cid] || (ref && nbtHasTyped(ref)))) return;
    try { out[cid] = nbtMerge(v, ref ? nbtParse(ref) : null); formats[cid] = 'snbt'; any = true; } catch (e) { out[cid] = clone(v); }
  });
  return { comps: out, formats: any ? formats : null };
}

/* ---------- 向游戏校验（validate_component）---------- */
var Valid = {
  state: {}, waiting: {}, timers: {}, subs: [], seq: 0,
  host: function () { return typeof oriel !== 'undefined' && !!oriel.send && typeof Reg !== 'undefined' && Reg.live(); },
  on: function (f, alive) { this.subs.push({ f: f, alive: alive }); if (this.subs.length > 40) this.subs = this.subs.filter(function (s) { return !s.alive || s.alive(); }); },
  fire: function () { this.subs.slice().forEach(function (s) { try { s.f(); } catch (e) {} }); },
  textOf: function (d, cid) {
    if (d.comps[cid] === undefined) return null;
    var ref = d.snbt && d.snbt[cid];
    return nbtMerge(d.comps[cid], ref ? nbtParse(ref) : null);
  },
  edited: function (d, cid) {
    var base = {}; try { base = JSON.parse(d.base).comps || {}; } catch (e) {}
    return d.comps[cid] !== undefined && JSON.stringify(d.comps[cid]) !== JSON.stringify(base[cid]);
  },
  /* 每次修改后调用：编辑过的自由 NBT 组件，停手 450ms 后向游戏校验一次 */
  touch: function () {
    if (!this.host()) return;
    var d = Store.doc(); if (!d) return;
    var me = this;
    this.touchHost(d);
    Object.keys(NBT_RAW).forEach(function (cid) {
      if (!me.edited(d, cid)) { if (me.state[cid]) { delete me.state[cid]; me.fire(); } return; }
      clearTimeout(me.timers[cid]);
      me.timers[cid] = setTimeout(function () { me.run(cid); }, 450);
    });
  },
  run: function (cid) {
    var d = Store.doc(); if (!d) return;
    var text; try { text = this.textOf(d, cid); } catch (e) { return; }
    if (text === null) return;
    var st = this.state[cid];
    if (st && st.text === text) return;
    if (text.length > 7000) { this.state[cid] = { text: text, note: '内容较大，应用时由游戏校验' }; this.fire(); return; }
    var id = 'v' + (++this.seq) + '-' + Date.now();
    this.waiting[id] = { cid: cid, text: text };
    this.state[cid] = { text: text, pending: true };
    this.fire();
    var sent = false; try { sent = oriel.send('validate_component', { requestId: id, component: cid, snbt: text }); } catch (e) {}
    if (!sent) { delete this.waiting[id]; this.state[cid] = { text: text, note: '游戏暂时没有接受校验请求，应用时再校验' }; this.fire(); }
  },
  /* ---- 逐字段校验（component_validate）：被改过的普通组件，把当前值交给游戏的真实 Codec，错误带字段路径（$.nutrition）。
     自由 NBT 组件仍走上面的 validate_component（SNBT）。结果和当前值对不上（又改了）就不算数。 ---- */
  hv: {}, hvWait: {}, hvTimers: {}, hvSeq: 0,
  touchHost: function (d) {
    var me = this;
    Object.keys(d.comps).forEach(function (cid) {
      if (NBT_RAW[cid]) return;
      if (!me.edited(d, cid)) { if (me.hv[cid]) { delete me.hv[cid]; me.fire(); } return; }
      clearTimeout(me.hvTimers[cid]);
      me.hvTimers[cid] = setTimeout(function () { me.runHost(cid, d); }, 450);
    });
    Object.keys(this.hv).forEach(function (cid) { if (d.comps[cid] === undefined) { delete me.hv[cid]; me.fire(); } });
  },
  runHost: function (cid, d) {
    d = d || Store.doc(); if (!d || d.comps[cid] === undefined) return;
    var key; try { key = JSON.stringify(d.comps[cid]); } catch (e) { return; }
    var st = this.hv[cid]; if (st && st.key === key) return;
    if (key.length > 6000) { this.hv[cid] = { key: key, note: '内容较大，应用时由游戏校验' }; this.fire(); return; }
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
    else this.hv[w.cid] = { key: w.key, ok: false, errors: (res.errors && res.errors.length) ? res.errors : [{ path: '$', message: String(res.error || '游戏拒绝了这个值') }] };
    this.fire();
  },
  receive: function (res) {
    if (!res || !res.requestId) return;
    var w = this.waiting[res.requestId]; if (!w) return;
    delete this.waiting[res.requestId];
    this.state[w.cid] = res.ok ? { text: w.text, ok: true } : { text: w.text, ok: false, error: String(res.error || '游戏拒绝了这个值') };
    this.fire();
  },
  /* 给 validateDoc 用：校验失败且对应当前内容的，按错误处理 */
  problems: function (d, out) {
    var me = this;
    Object.keys(this.hv).forEach(function (cid) {
      var st = me.hv[cid]; if (!st || st.ok !== false || d.comps[cid] === undefined) return;
      var cur = null; try { cur = JSON.stringify(d.comps[cid]); } catch (e) {}
      if (cur !== st.key) return;
      var c = typeof CIDX !== 'undefined' ? CIDX[cid] : null;
      st.errors.forEach(function (e) {
        var path = String(e.path || '$'); if (path.charAt(0) === '$') path = path.substring(1); if (path.charAt(0) === '.') path = path.substring(1);
        out.push({ level: 'error', cid: cid, path: path, msg: (c ? c.name : cid) + (path ? ' · ' + path : '') + '：' + String(e.message || '游戏拒绝了这个值') });
      });
    });
    Object.keys(this.state).forEach(function (cid) {
      var st = me.state[cid]; if (!st || st.ok !== false || d.comps[cid] === undefined) return;
      var cur = null; try { cur = me.textOf(d, cid); } catch (e) {}
      if (cur !== st.text) return;
      var c = typeof CIDX !== 'undefined' ? CIDX[cid] : null;
      out.push({ level: 'error', cid: cid, path: '', msg: (c ? c.name : cid) + '：游戏校验未通过 — ' + st.error });
    });
  },
  /* 数据窗口里的小状态行 */
  badge: function (cid) {
    var el = h('div', { class: 'vd-badge' });
    function paint() {
      clear(el);
      var st = Valid.state[cid];
      if (!Valid.host() || !st) { el.className = 'vd-badge none'; return; }
      if (st.pending) { el.className = 'vd-badge wait'; el.appendChild(uiIcon('clock', 12)); el.appendChild(h('span', { text: '正在让游戏校验…' })); return; }
      if (st.ok) { el.className = 'vd-badge ok'; el.appendChild(uiIcon('check', 12)); el.appendChild(h('span', { text: '游戏校验通过' })); return; }
      if (st.ok === false) { el.className = 'vd-badge bad'; el.appendChild(uiIcon('warning', 12)); el.appendChild(h('span', { text: st.error })); return; }
      el.className = 'vd-badge none';
      if (st.note) { el.className = 'vd-badge wait'; el.appendChild(h('span', { text: st.note })); }
    }
    Valid.on(function () { if (el.parentNode != null) paint(); }, function () { return el.parentNode != null; });
    paint();
    return el;
  }
};
