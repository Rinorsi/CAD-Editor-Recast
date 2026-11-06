/* 带类型的 SNBT 处理 + 向游戏校验组件（validate_component）。
   页面里组件值是普通 JSON，数字不分 byte / short / long / float / double。提交时对“自由 NBT 组件”改用 SNBT 字符串
   （apply 的 component_formats），并以宿主给的 component_snbt 为类型参照合并，保住 1b、5L、2.5f、[B;1b] 等类型。 */

/* 自由 NBT 组件：值里的任意字段类型都要保真，被编辑过就一律用 SNBT 提交，并向游戏校验 */
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
  if (typeof v === 'boolean') return ref && ref.k === 'num' && ref.t === 'b' ? (v ? '1b' : '0b') : String(v);
  if (typeof v === 'number') return nbtNum(v, ref && (ref.k === 'num' || ref.k === 'bool') ? (ref.k === 'num' ? ref : null) : null);
  if (typeof v === 'string') return snbtStr(v);
  if (Array.isArray(v)) {
    if (ref && ref.k === 'arr') {
      var tt = ref.p === 'B' ? 'b' : ref.p === 'L' ? 'l' : 'i';
      return '[' + ref.p + ';' + v.map(function (x, idx) { return nbtNum(Number(x), ref.items[idx] || ref.items[0] || { k: 'num', t: tt, raw: '', v: NaN }); }).join(',') + ']';
    }
    return '[' + v.map(function (x, idx) { return nbtMerge(x, ref && ref.k === 'list' ? (ref.items[idx] || ref.items[ref.items.length - 1] || null) : null); }).join(',') + ']';
  }
  var parts = Object.keys(v).map(function (k) { return snbtKey(k) + ':' + nbtMerge(v[k], ref && ref.k === 'obj' ? (ref.map[k] || null) : null); });
  return '{' + parts.join(',') + '}';
}
/* 参照文本里有 JSON 表达不了的类型（short / long / 类型化数组）？ */
function nbtHasTyped(text) {
  return /\[[BIL];/.test(text) || /(?:^|[^A-Za-z0-9_."'])[+-]?\d+[sSlL](?![A-Za-z0-9_])/.test(text);
}

/* 提交时：哪些组件改用 SNBT。没被编辑过的交给宿主按原值保留（宿主会恢复真实组件，类型原样）。 */
function nbtApplyFormats(d) {
  var base = {}, out = {}, formats = {}, any = false;
  try { base = JSON.parse(d.base).comps || {}; } catch (e) {}
  Object.keys(d.comps).forEach(function (cid) {
    var v = d.comps[cid], ref = d.snbt && d.snbt[cid];
    out[cid] = clone(v);
    if (JSON.stringify(v) === JSON.stringify(base[cid])) return;
    if (!(NBT_RAW[cid] || (ref && nbtHasTyped(ref)))) return;
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
