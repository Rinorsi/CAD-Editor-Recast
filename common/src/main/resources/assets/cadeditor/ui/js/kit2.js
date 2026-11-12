/* 工具包 · 第二部分：大数字、等级、拖拽排序、右键菜单、所见即所得文字编辑器。 */

/* ---------- 大数字 / 等级 ---------- */
function fmtInt(n) { var s = String(Math.round(n)); var neg = s.charAt(0) === '-'; if (neg) s = s.substring(1); s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (neg ? '-' : '') + s; }
function bigText(n) { var a = Math.abs(n); if (a >= 1e8) return I18n.t("cadeditor.ui.kit2.fe53fdcd86", (+(n / 1e8).toFixed(2))); if (a >= 1e4) return I18n.t("cadeditor.ui.kit2.2f2da9a7f3", (+(n / 1e4).toFixed(2))); return null; }
function numBig(n) { var b = bigText(n); return fmtNum(n) + (b ? '（' + b + '）' : ''); }
function levelText(n) { return n >= 1 && n <= 10 ? roman(n) : fmtInt(n); }

/* ---------- 拖拽排序 ----------
   container 的直接子元素带 .k-srow，行里的 .k-grip 是把手。放手时 o.onMove(from, to)。o.grid=true 用二维就近。 */
/* FLIP：重排前记位置，重排后让每一行从旧位置滑到新位置（180ms，out 曲线） */
function flipMove(container, mutate) {
  var scale = typeof uiScaleFactor === 'function' ? uiScaleFactor() : 1;
  var els = Array.prototype.slice.call(container.children), first = els.map(function (e) { return e.getBoundingClientRect().top; });
  mutate();
  els.forEach(function (e, i) {
    var d = (first[i] - e.getBoundingClientRect().top) / scale; if (!d) return;
    e.style.transition = 'none'; e.style.transform = 'translateY(' + d + 'px)';
    requestAnimationFrame(function () { requestAnimationFrame(function () { e.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'; e.style.transform = ''; }); });
  });
}
function kSortable(container, o) {
  o = o || {};
  container.addEventListener('mousedown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    var grip = e.target.closest ? e.target.closest('.k-grip') : null;
    if (!grip) return;
    var row = grip.closest('.k-srow');
    if (!row || row.parentNode !== container) return;
    e.preventDefault();
    var rows = function () { return Array.prototype.slice.call(container.children).filter(function (c) { return c.classList.contains('k-srow'); }); };
    var from = rows().indexOf(row);
    row.classList.add('drag'); container.classList.add('sorting'); snd('minecraft:entity.item.pickup', 0.3, 1.5);
    var move = function (ev) {
      var others = rows().filter(function (r) { return r !== row; });
      if (!others.length) return;
      var best = null, bd = 1e12, after = false;
      others.forEach(function (r) {
        var b = r.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        var dx = o.grid ? ev.clientX - cx : 0, dy = ev.clientY - cy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = r; after = o.grid ? (ev.clientY > cy + 2 || (Math.abs(ev.clientY - cy) <= b.height / 2 && ev.clientX > cx)) : ev.clientY > cy; }
      });
      if (best) { var ref = after ? best.nextSibling : best; if (ref !== row && row.nextSibling !== ref) flipMove(container, function () { container.insertBefore(row, ref); }); }
    };
    var up = function () {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      row.classList.remove('drag'); container.classList.remove('sorting');
      var to = rows().indexOf(row);
      snd('minecraft:block.wool.place', 0.4, 1.2);
      if (to !== from && o.onMove) o.onMove(from, to);
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
}
function kGrip() { return h('div', { class: 'k-grip', title: I18n.t("cadeditor.ui.kit2.f787d2260a") }, [uiIcon('drag', 12)]); }

/* ---------- 右键菜单 ---------- */
function kMenu(x, y, items) {
  kPopClose();
  var box = h('div', { class: 'k-pop k-menu' });
  items.forEach(function (it) {
    if (it.sep) { box.appendChild(h('div', { class: 'k-msep' })); return; }
    var row = h('div', { class: 'k-mi' + (it.danger ? ' dng' : '') + (it.dis ? ' dis' : '') }, [it.icon ? uiIcon(it.icon, 12) : h('span', { class: 'k-mi0' }), h('span', { class: 'lb', text: it.label }), it.kbd ? h('span', { class: 'kb', text: it.kbd }) : null]);
    row.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); if (it.dis) return; kPopClose(); it.run(); });
    box.appendChild(row);
  });
  document.getElementById('overlays').appendChild(box);
  var scale = typeof uiScaleFactor === 'function' ? uiScaleFactor() : 1; x /= scale; y /= scale;
  var vw = window.innerWidth / scale, vh = window.innerHeight / scale, hh = items.length * 22 + 8;
  /* 宽度跟着内容走：中文约 12 像素、半角约 6 像素，加图标和左右留白 */
  function textPx(t) { var n = 0; String(t || '').split('').forEach(function (c) { n += c.charCodeAt(0) > 255 ? 12 : 6; }); return n; }
  var w = 80; items.forEach(function (it) { if (it.sep) return; w = Math.max(w, textPx(it.label) + (it.kbd ? textPx(it.kbd) + 14 : 0) + 44); });
  w = Math.min(w, 260);
  box.setAttribute('style', 'left:' + Math.max(4, Math.min(x, vw - w - 6)) + 'px;top:' + Math.max(4, Math.min(y, vh - hh - 6)) + 'px;width:' + w + 'px');
  KPop.el = box; KPop.owner = null;
}
var lastCtx = 0;
function onContext(el, getItems) {
  function show(e) { var t = Date.now(); if (t - lastCtx < 80) return; lastCtx = t; var items = getItems(e); if (items && items.length) kMenu(e.clientX, e.clientY, items); }
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); show(e); });
  el.addEventListener('mousedown', function (e) { if (e.button === 2) { e.preventDefault(); show(e); } });
}

/* ---------- 文本组件 ⇄ 分段 ---------- */
var TC_STYLE_KEYS = ['color', 'bold', 'italic', 'underlined', 'strikethrough', 'obfuscated', 'font'];
function runStyleOf(o) { var s = {}; TC_STYLE_KEYS.forEach(function (k) { if (o[k] !== undefined && o[k] !== '') s[k] = o[k]; }); return s; }
function tcSprite(o) { return isObj(o) && typeof o.sprite === 'string' && (o.type === undefined || o.type === 'object') && (o.object === undefined || o.object === 'atlas'); }
function tcAllowed(o) {
  for (var k in o) {
    if (k === 'text' || k === 'extra' || TC_STYLE_KEYS.indexOf(k) >= 0) continue;
    if (tcSprite(o) && ['type', 'object', 'atlas', 'sprite', 'fallback'].indexOf(k) >= 0) continue;
    return false;
  }
  return tcSprite(o) || typeof o.text === 'string' || o.extra !== undefined;
}
/* Native object text remains an object, never a text placeholder in saved data. */
function tcRuns(v) {
  if (typeof v === 'string') return { base: {}, runs: [{ text: v }] };
  if (Array.isArray(v)) { if (!v.length) return { base: {}, runs: [{ text: '' }] }; var first = v[0], rest = v.slice(1); if (typeof first === 'string') first = { text: first }; if (!isObj(first)) return null; var c = clone(first); c.extra = (c.extra || []).concat(rest); return tcRuns(c); }
  if (!isObj(v) || !tcAllowed(v)) return null;
  var runs = [], ok = true;
  function add(x, inherited, depth) {
    if (depth > 32 || runs.length > 1000) { ok = false; return; }
    if (typeof x === 'string') { var plain = clone(inherited); plain.text = x; runs.push(plain); return; }
    if (!isObj(x) || !tcAllowed(x) || (x.extra !== undefined && !Array.isArray(x.extra))) { ok = false; return; }
    var st = clone(inherited), own = runStyleOf(x); Object.keys(own).forEach(function (k) { st[k] = own[k]; });
    var r = clone(st);
    if (tcSprite(x)) {
      r.text = '￼'; r._object = {};
      ['type', 'object', 'atlas', 'sprite', 'fallback'].forEach(function (k) { if (x[k] !== undefined) r._object[k] = clone(x[k]); });
      runs.push(r);
    } else if (typeof x.text === 'string' && x.text !== '') { r.text = x.text; runs.push(r); }
    (x.extra || []).forEach(function (child) { add(child, st, depth + 1); });
  }
  add(v, {}, 0);
  if (!ok) return null;
  if (!runs.length) runs.push({ text: '' });
  return { base: {}, runs: runs };
}
function sameStyle(a, b) { return deepEq(runStyleOf(a), runStyleOf(b)); }
function tcBuild(base, runs) {
  var merged = [];
  runs.forEach(function (r) {
    if (!r._object && r.text === '' && runs.length > 1) return;
    var last = merged[merged.length - 1];
    if (last && !last._object && !r._object && sameStyle(last, r)) last.text += r.text; else merged.push(clone(r));
  });
  if (!merged.length) merged.push({ text: '' });
  function node(r) {
    var out = r._object ? clone(r._object) : { text: r.text }, st = runStyleOf(r);
    Object.keys(base).forEach(function (k) { if (st[k] === undefined) st[k] = base[k]; });
    Object.keys(st).forEach(function (k) { out[k] = st[k]; });
    return !r._object && !Object.keys(st).length ? r.text : out;
  }
  return merged.length === 1 ? node(merged[0]) : { text: '', extra: merged.map(node) };
}
function tcFontCss(family) {
  return typeof family === 'string' && /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(family) ? 'font-family:"' + family + '";' : '';
}
function tcSpriteFont(o) {
  function hex(id) { var s = ''; for (var i = 0; i < id.length; i++) { var c = id.charCodeAt(i).toString(16); s += c.length < 2 ? '0' + c : c; } return s; }
  var atlas = o.atlas || 'minecraft:blocks', sprite = o.sprite;
  if (typeof atlas !== 'string' || typeof sprite !== 'string' || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(atlas) || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(sprite)) return '';
  return 'cadeditor_inline:atlas/' + hex(Reg.full(atlas)) + '/' + hex(Reg.full(sprite));
}
/* 渲染：在 el 里画出带颜色的文字（所见即所得）。def 为默认色/斜体（如说明文字的紫色斜体） */
function renderRuns(el, base, runs, def) {
  clear(el); def = def || {};
  // Item text uses the game's component font/native shadow, not the UI TTF.
  // Keep bold/italic as real styles, including explicit false overrides.
  el.classList.add('k-mctext');
  var any = false;
  runs.forEach(function (r) {
    if (!r.text) return; any = true;
    var st = {}, k; for (k in base) st[k] = base[k]; var rs = runStyleOf(r); for (k in rs) st[k] = rs[k];
    var hex = tcHex(st.color) || def.color || '#FFFFFF';
    var italic = st.italic === undefined ? !!def.italic : st.italic;
    var css = tcFontCss(r._object ? tcSpriteFont(r._object) : st.font) + 'color:' + hex + ';font-weight:' + (st.bold ? 'bold' : 'normal') + ';font-style:' + (italic ? 'italic' : 'normal') + ';';
    var deco = []; if (st.underlined) deco.push('underline'); if (st.strikethrough) deco.push('line-through');
    if (deco.length) css += 'text-decoration-line:' + deco.join(' ') + ';';
    var s = h('span', { text: st.obfuscated && !r._object ? r.text.replace(/./g, '▒') : r.text }); s.setAttribute('style', css); el.appendChild(s);
  });
  if (!any) el.appendChild(h('span', { class: 'k-ph', text: def.placeholder || I18n.t("cadeditor.ui.kit2.fa8bc5e925") }));
}
/* § 代码 ⇄ 分段 */
var SECT = String.fromCharCode(167);
var CODE_COLOR = { '0': 'black', '1': 'dark_blue', '2': 'dark_green', '3': 'dark_aqua', '4': 'dark_red', '5': 'dark_purple', '6': 'gold', '7': 'gray', '8': 'dark_gray', '9': 'blue', a: 'green', b: 'aqua', c: 'red', d: 'light_purple', e: 'yellow', f: 'white' };
/* sectOnly：只认游戏本身认的 § 代码（书与笔原文），不把普通的 & 当代码 */
function parseCodes(text, sectOnly) {
  var runs = [], cur = {}, buf = '';
  function flush() { if (buf !== '') { var r = clone(cur); r.text = buf; runs.push(r); buf = ''; } }
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if ((ch === SECT || (!sectOnly && ch === '&')) && i + 1 < text.length) {
      var c = text.charAt(i + 1).toLowerCase();
      if (!sectOnly && c === '#' && /^[0-9a-fA-F]{6}$/.test(text.substring(i + 2, i + 8))) { flush(); cur = { color: '#' + text.substring(i + 2, i + 8).toUpperCase() }; i += 7; continue; }
      if (CODE_COLOR[c]) { flush(); cur = { color: CODE_COLOR[c] }; i++; continue; }
      if (c === 'l') { flush(); cur.bold = true; i++; continue; }
      if (c === 'o') { flush(); cur.italic = true; i++; continue; }
      if (c === 'n') { flush(); cur.underlined = true; i++; continue; }
      if (c === 'm') { flush(); cur.strikethrough = true; i++; continue; }
      if (c === 'k') { flush(); cur.obfuscated = true; i++; continue; }
      if (c === 'r') { flush(); cur = {}; i++; continue; }
    }
    buf += ch;
  }
  flush();
  return runs.length ? runs : [{ text: '' }];
}
function toCodes(base, runs) {
  var rev = {}; Object.keys(CODE_COLOR).forEach(function (k) { rev[CODE_COLOR[k]] = k; });
  return runs.map(function (r) {
    var st = {}, k; for (k in base) st[k] = base[k]; var rs = runStyleOf(r); for (k in rs) st[k] = rs[k];
    var p = SECT + 'r';
    if (st.color) p += rev[st.color] ? SECT + rev[st.color] : '&' + st.color;
    if (st.bold) p += SECT + 'l'; if (st.italic) p += SECT + 'o'; if (st.underlined) p += SECT + 'n'; if (st.strikethrough) p += SECT + 'm'; if (st.obfuscated) p += SECT + 'k';
    return p + r.text;
  }).join('');
}
function lerpHex(a, b, t) { var pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16); function ch(sh) { return Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t); } return '#' + [16, 8, 0].map(function (s) { var x = ch(s).toString(16).toUpperCase(); return x.length < 2 ? '0' + x : x; }).join(''); }

/* ---------- 所见即所得文字编辑器（公共组件） ----------
   像论坛发帖的编辑器：上面一排工具栏，下面直接写字。选中文字再点颜色、粗体等；没选中时，设置的样式用于接下来输入的字。
   颜色直接画在输入框里（Oriel 原生文本高亮）；粗体、斜体等输入框画不出，在预览里看。
   名称、说明文字、告示牌、书页都用这一个组件。
   value：文本组件（mode 'component'）或带 § 代码的字符串（mode 'codes'，书与笔的原文）；lines=n 时 value 是 n 行文本组件的数组（告示牌）。
   o = { mode, multiline, lines, compact, openKey, placeholder, def:{color,italic,placeholder}, preview（默认显示）, paper（'book'|'sign'）,
         height, max（字符上限：数字或函数，undefined=读取中、null=游戏没给上限）, onChange(v, empty), onRender(api), onKey(e) }
   返回 { el, set(v), focus(), runs(), lineRuns() }；内容含编辑器不认识的结构（点击事件、翻译键等）时 lines 模式返回 null，其他模式退回原始 SNBT 编辑。 */
var RD_FLAGS = [['bold', 'B', I18n.t("cadeditor.ui.kit2.22694175d5"), 'l'], ['italic', 'I', I18n.t("cadeditor.ui.kit2.c4fa127a1c"), 'o'], ['underlined', 'U', I18n.t("cadeditor.ui.kit2.fddf8e9c67"), 'n'], ['strikethrough', 'S', I18n.t("cadeditor.ui.forms.5b050892a8"), 'm'], ['obfuscated', '?', I18n.t("cadeditor.ui.kit2.327981b6ac"), 'k']];
var RD_OBJ = '\uFFFC';  /* 分段里精灵图的占位字：渲染时由精灵字体画成图 */
var SPR_DY = 4;  /* 平滑字体下输入框里的图标比普通字偏上，整体往下挪几个像素；游戏默认字体下对得齐，不挪 */
var RD_MARK = I18n.t("cadeditor.ui.kit2.037bb71227");  /* 输入框里精灵图的占位字（透明）：用和一个汉字等宽的「口」，这样图标盖上去不会遮住后面的字；原生输入框画不了图，真图标由镜像层盖在上面 */
var RD_CODES_WHY = I18n.t("cadeditor.ui.kit2.24f79b8796");
function rdNorm(st) { var o = {}; Object.keys(st || {}).forEach(function (k) { if (st[k] !== undefined && st[k] !== '') o[k] = st[k]; }); return o; }
function rdStyleOf(r) { var s = runStyleOf(r); if (r._object) s._object = clone(r._object); return s; }
/* 分段 → 文字 + 每个字符的样式（UTF-16 下标对齐输入框） */
function rdFromRuns(runs, into) {
  runs.forEach(function (r) {
    var s = rdStyleOf(r), t = r._object ? RD_MARK : (r.text || '');
    into.text += t; for (var i = 0; i < t.length; i++) into.sty.push(s);
  });
  return into;
}
function rdLoad(v, codes, n) {
  var out = { text: '', sty: [] };
  if (n) {
    var list = Array.isArray(v) ? v : [];
    for (var i = 0; i < n; i++) {
      var p = tcRuns(list[i] === undefined || list[i] === null ? '' : list[i]); if (!p) return null;
      if (i) { out.text += '\n'; out.sty.push({}); }
      rdFromRuns(p.runs, out);
    }
    return out;
  }
  if (codes) return rdFromRuns(parseCodes(typeof v === 'string' ? v : '', true), out);
  var parsed = tcRuns(v === undefined || v === null ? '' : v);
  return parsed ? rdFromRuns(parsed.runs, out) : null;
}
/* 文字 + 样式 → 分段（相同样式的相邻字合并；精灵图各占一段） */
function rdRuns(text, sty, from, to) {
  var runs = [], cur = null; from = from || 0; to = to === undefined ? text.length : to;
  for (var i = from; i < to; i++) {
    var s = sty[i] || {};
    if (s._object) { cur = null; var o = runStyleOf(s); o.text = RD_OBJ; o._object = clone(s._object); runs.push(o); continue; }
    if (cur && sameStyle(cur, s)) cur.text += text.charAt(i);
    else { cur = runStyleOf(s); cur.text = text.charAt(i); runs.push(cur); }
  }
  if (!runs.length) runs.push({ text: '' });
  return runs;
}
/* 分段 → 游戏认的 § 代码。颜色代码会清掉粗体等，所以换色或去掉某个格式时先换色 / §r，再补格式 */
function rdCodes(runs) {
  var rev = {}; Object.keys(CODE_COLOR).forEach(function (k) { rev[CODE_COLOR[k]] = k; });
  var out = '', prev = {};
  runs.forEach(function (r) {
    if (!r.text) return;
    var s = runStyleOf(r), reset = (prev.color || '') !== (s.color || '');
    RD_FLAGS.forEach(function (f) { if (prev[f[0]] === true && s[f[0]] !== true) reset = true; });
    if (reset) { out += SECT + (s.color && rev[s.color] ? rev[s.color] : 'r'); RD_FLAGS.forEach(function (f) { if (s[f[0]] === true) out += SECT + f[3]; }); }
    else RD_FLAGS.forEach(function (f) { if (s[f[0]] === true && prev[f[0]] !== true) out += SECT + f[3]; });
    prev = s; out += r.text;
  });
  return out;
}
function rdArgb(c) { var hx = tcHex(c); return hx ? 0xFF000000 + parseInt(hx.substring(1), 16) : null; }

function kRichDoc(value, o) {
  o = o || {};
  var codes = o.mode === 'codes', n = o.lines || 0, multi = !!o.multiline || n > 1, def = o.def || {};
  var loaded = rdLoad(value, codes, n);
  if (!loaded) {
    if (n) return null;
    var raw = wText({ t: 'text' }, value, function (v) { o.onChange(v, false); }, o);
    return { el: h('div', { class: 'k-rd raw' }, [raw]), set: function () {}, focus: function () {}, runs: function () { return []; }, lineRuns: function () { return []; }, raw: true };
  }
  var sprOn = false, followAside = null, text = loaded.text, sty = loaded.sty, pending = null, sel = { s: text.length, e: text.length }, version = 0, hlError = false, api;
  var wrap = h('div', { class: 'k-rd' + (multi ? ' multi' : ' single') + (o.paper ? ' paper-' + o.paper : '') + (o.compact ? ' compact' : '') });
  var ta = h('textarea', { class: 'k-input k-rdta', spellcheck: 'false', placeholder: o.placeholder || '' });
  if (!multi) ta.setAttribute('wrap', 'off');
  if (o.height) ta.style.height = o.height + 'px'; else if (n > 1) ta.style.height = (n * 14 + 8) + 'px';
  if (def.color && (!o.paper || o.paper === 'sign')) ta.style.color = tcHex(def.color) || def.color;
  ta.value = text;
  var prev = o.preview === false ? null : h('div', { class: 'k-rprev k-rdprev' });
  var bar = h('div', { class: 'k-rdbar' }), count = h('span', { class: 'k-rdcount' });

  function styleAt(p) {
    var s = p > 0 && text.charAt(p - 1) !== '\n' ? sty[p - 1] : (p < text.length && text.charAt(p) !== '\n' ? sty[p] : (p > 0 ? sty[p - 1] : null));
    s = clone(s || {}); delete s._object; return s;
  }
  function selStyles() {
    if (sel.s === sel.e) return [pending && pending.at === sel.s ? pending.style : styleAt(sel.s)];
    var out = []; for (var i = sel.s; i < sel.e; i++) if (text.charAt(i) !== '\n') out.push(sty[i] || {});
    return out.length ? out : [{}];
  }
  function eff(s, f) { return f === 'italic' && s.italic === undefined ? !!def.italic : s[f] === true; }
  function readSel() {
    if (typeof ta.selectionStart === 'number' && typeof ta.selectionEnd === 'number') {
      var s = Math.max(0, Math.min(text.length, ta.selectionStart)), e = Math.max(s, Math.min(text.length, ta.selectionEnd));
      sel = { s: s, e: e };
    }
    if (pending && (sel.s !== sel.e || sel.s !== pending.at)) pending = null;
    paintBar();
  }
  function refocus(top) {
    if (!document.body.contains || !document.body.contains(wrap)) return;
    var keepTop = top === undefined ? ta.scrollTop : top, want = { s: sel.s, e: sel.e };
    /* focus() 会触发 focus 事件，readSel 把引擎自己放的光标（文末）读成 sel；所以先记下想要的选区，聚焦后再放回去 */
    ta.focus(); sel = want; if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(want.s, want.e);
    if (multi) { ta.scrollTop = keepTop; if (followAside) followAside(); }
  }
  function curValue() {
    if (n) {
      var lines = [], start = 0;
      for (var i = 0; i <= text.length; i++) if (i === text.length || text.charAt(i) === '\n') { lines.push(tcBuild({}, rdRuns(text, sty, start, i))); start = i + 1; }
      while (lines.length < n) lines.push('');
      return lines.slice(0, n);
    }
    var runs = rdRuns(text, sty);
    return codes ? rdCodes(runs) : tcBuild({}, runs);
  }
  function isEmpty(v) { return n ? v.every(function (x) { return x === ''; }) : v === ''; }
  function highlight() {
    if (typeof ta.setTextHighlights !== 'function') return;
    var ranges = [], cur = null;
    for (var i = 0; i < text.length; i++) {
      var c = sty[i] && sty[i].color ? rdArgb(sty[i].color) : null;
      if (sprOn && sty[i] && sty[i]._object) c = 0;
      if (c === null || text.charAt(i) === '\n') { cur = null; continue; }
      if (cur && cur.color === c && cur.end === i) cur.end = i + 1; else { cur = { start: i, end: i + 1, color: c }; ranges.push(cur); }
    }
    try { ta.setTextHighlights(text, ranges, false); hlError = false; }
    catch (e) { if (!hlError && typeof EditorDiag !== 'undefined') EditorDiag.error('richdoc.highlight', e); hlError = true; }
  }
  function paintCount(v) {
    if (o.max === undefined) return;
    var m = typeof o.max === 'function' ? o.max() : o.max, len = typeof v === 'string' ? v.length : text.length;
    count.textContent = len + (typeof m === 'number' ? ' / ' + m : m === undefined ? ' / …' : '');
    count.classList.toggle('bad', typeof m === 'number' && len > m);
    setTip(count, typeof m === 'number' ? (codes ? I18n.t("cadeditor.ui.kit2.dcc4de2076", (m)) : I18n.t("cadeditor.ui.kit2.ba573d570e", (m))) : m === undefined ? I18n.t("cadeditor.ui.kit2.f931bd4344") : '');
  }
  function paintPrev() { if (prev) renderRuns(prev, {}, rdRuns(text, sty), def); }
  function rendered(v) { scheduleSprites(); paintPrev(); paintCount(v === undefined ? curValue() : v); if (o.onRender) o.onRender(api); if (followAside) followAside(); }
  function emit() { version++; var v = curValue(); rendered(v); o.onChange(v, isEmpty(v)); }
  /* 原生输入框改了文字：比较前后共同的首尾，中间被替换的部分换成新输入的字，新字沿用光标前一个字（或刚设好的待输入样式） */
  function absorb(nt) {
    var a = text, max = Math.min(a.length, nt.length), p = 0, q = 0;
    while (p < max && a.charCodeAt(p) === nt.charCodeAt(p)) p++;
    while (q < max - p && a.charCodeAt(a.length - 1 - q) === nt.charCodeAt(nt.length - 1 - q)) q++;
    var st = pending && pending.at === p ? pending.style : styleAt(p), add = [];
    for (var i = p; i < nt.length - q; i++) add.push(nt.charAt(i) === '\n' ? {} : st);
    Array.prototype.splice.apply(sty, [p, a.length - q - p].concat(add));
    text = nt;
  }
  ta.addEventListener('input', function () {
    var nt = ta.value;
    if (!multi && nt.indexOf('\n') >= 0) { nt = nt.replace(/\r?\n/g, ''); ta.value = nt; }
    if (n && nt.split('\n').length > n) {
      /* 末尾还有空行就让出来：在中间按回车，整体下移一行，最后一个空行被挤掉 */
      var ls = nt.split('\n'), extra = ls.length - n, caret = typeof ta.selectionStart === 'number' ? ta.selectionStart : nt.length;
      while (extra > 0 && ls.length && ls[ls.length - 1] === '') { ls.pop(); extra--; }
      if (extra > 0) { var back = sel.s; ta.value = text; if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(back, back); toast(I18n.t("cadeditor.ui.kit2.cd33816ad9", (n)), 'info', 'rd-lines'); return; }
      nt = ls.join('\n'); ta.value = nt; if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(Math.min(caret, nt.length), Math.min(caret, nt.length));
      while (nt.split('\n').length < n) nt += '\n'; ta.value = nt;
      if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(Math.min(caret, nt.length), Math.min(caret, nt.length));
      /* 在中间按回车：新换行插在光标处，末尾那个空行的换行被挤掉；后面各行的样式跟着整体下移，不要被重置 */
      var cut = caret - 1;
      if (cut >= 0 && nt.length === text.length && text.charAt(text.length - 1) === '\n' && nt === text.slice(0, cut) + '\n' + text.slice(cut, text.length - 1)) {
        sty.splice(cut, 0, {}); sty.length = nt.length; text = nt; pending = null;
        emit(); highlight(); readSel(); return;
      }
    }
    absorb(nt); emit(); highlight(); readSel();
  });
  ['select', 'mouseup', 'keyup', 'focus'].forEach(function (ev) { ta.addEventListener(ev, readSel); });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.ctrlKey && !multi) { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      var f = { b: 'bold', i: 'italic', u: 'underlined' }[String(e.key).toLowerCase()];
      if (f) { e.preventDefault(); readSel(); toggleFlag(f); return; }
    }
    if (o.onKey) o.onKey(e);
  });

  /* 选中范围改样式；没选中就设成接下来输入的样式 */
  function patch(fn) {
    if (sel.s === sel.e) { pending = { at: sel.s, style: rdNorm(fn(clone(selStyles()[0]))) }; paintBar(); refocus(); return; }
    for (var i = sel.s; i < sel.e; i++) { if (text.charAt(i) === '\n') continue; var obj = sty[i] && sty[i]._object; var s = rdNorm(fn(clone(sty[i] || {}))); if (obj) s._object = obj; sty[i] = s; }
    emit(); highlight(); paintBar(); refocus();
  }
  function toggleFlag(f) {
    var on = selStyles().every(function (s) { return eff(s, f); });
    patch(function (s) { if (on) { if (f === 'italic' && def.italic) s.italic = false; else delete s[f]; } else { if (f === 'italic' && def.italic) delete s.italic; else s[f] = true; } return s; });
  }
  function setColor(c) { patch(function (s) { if (c) s.color = c; else delete s.color; return s; }); }
  function replaceSel(str, styles) {
    var s = sel.s, e = sel.e, top = ta.scrollTop;
    text = text.slice(0, s) + str + text.slice(e);
    Array.prototype.splice.apply(sty, [s, e - s].concat(styles));
    ta.value = text; sel = { s: s + str.length, e: s + str.length }; pending = null;
    refocus(top); emit(); highlight(); paintBar();
  }
  function wholeIfEmpty() { if (sel.s === sel.e) sel = { s: 0, e: text.length }; }

  function tb(cls, label, tip, fn) {
    var b = h('div', { class: 'k-rdb ' + cls, title: tip }, [typeof label === 'string' ? h('span', { text: label }) : label]);
    b.addEventListener('mousedown', function (e) { if (e.button !== undefined && e.button !== 0) return; readSel(); e.preventDefault(); });
    activate(b, function () { fn(b); });
    return b;
  }
  var chip = h('i', { class: 'k-rdsw' });
  var colorB = tb('color', chip, I18n.t("cadeditor.ui.kit2.f21ef4aba5"), function (b) {
    var keep = { s: sel.s, e: sel.e }, box = h('div', { class: 'k-pickbox' }), sw = h('div', { class: 'k-swatches' });
    function pick(c) { kPopClose(); sel = keep; setColor(c); }
    function paint() {
      clear(sw);
      var none = h('div', { class: 'k-sw nonec', title: I18n.t("cadeditor.ui.forms.af76608af8") }, [h('i', { text: '×' })]);
      none.addEventListener('mousedown', function (e) { e.preventDefault(); pick(null); }); sw.appendChild(none);
      mcColors().forEach(function (c) { var s = h('div', { class: 'k-sw', title: c[2], style: 'background:#' + c[1] }); s.addEventListener('mousedown', function (e) { e.preventDefault(); pick(c[0]); }); sw.appendChild(s); });
      if (!mcColors().length) sw.appendChild(h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.kit2.5b31288086") }));
    }
    paint(); box.appendChild(sw);
    var hex = h('input', { class: 'k-input', type: 'text', placeholder: codes ? I18n.t("cadeditor.ui.kit2.da991056cf") : '#RRGGBB', maxlength: '7' });
    if (codes) { hex.setAttribute('disabled', ''); setTip(hex, RD_CODES_WHY); }
    else hex.addEventListener('change', function () { var t = hex.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(t)) pick(t.toUpperCase()); });
    box.appendChild(hex);
    kPopover(b, box, { width: 244, onClose: watchColorOptions(mcColors, paint) });
  });
  bar.appendChild(colorB);
  var flagB = {};
  RD_FLAGS.forEach(function (f) { flagB[f[0]] = tb('flag ' + f[0], f[1], f[2], function () { toggleFlag(f[0]); }); bar.appendChild(flagB[f[0]]); });
  bar.appendChild(h('i', { class: 'k-rdsep' }));
  {
    bar.appendChild(tb('sprite' + (codes ? ' dis' : ''), uiIcon('image', 12), codes ? I18n.t("cadeditor.ui.kit2.da2237ac2a", (RD_CODES_WHY)) : I18n.t("cadeditor.ui.kit2.838b76d29d"), function (b) {
      if (codes) { toast(RD_CODES_WHY, 'info', 'rd-codes'); return; }
      var keep = { s: sel.s, e: sel.e }, ver = version;
      pickSprite(b, function (object) {
        if (ver !== version) { toast(I18n.t("cadeditor.ui.kit2.19a59c1fe9"), 'info'); return; }
        sel = keep; replaceSel(RD_MARK, [{ _object: clone(object), color: 'white' }]);
      });
    }));
  }
  function nearestColor(hx) {
    var v = parseInt(hx.replace('#', ''), 16), best = null, bd = 1e9;
    mcColors().forEach(function (c) {
      var p = parseInt(c[1], 16), d = 0; [16, 8, 0].forEach(function (sh) { var x = ((v >> sh) & 255) - ((p >> sh) & 255); d += x * x; });
      if (d < bd) { bd = d; best = c[0]; }
    });
    return best;
  }
  var gradB = null;
  function gradientPop(anchor) {
    wholeIfEmpty(); var keep = { s: sel.s, e: sel.e }, c1 = '#FF5555', c2 = '#5555FF';
    var box = h('div', { class: 'k-pickbox' });
    if (codes) box.appendChild(kHint(I18n.t("cadeditor.ui.kit2.fde0eb242b")));
    box.appendChild(kHint(I18n.t("cadeditor.ui.kit2.e81827cb51"))); box.appendChild(kColor(0xFF5555, function (v) { c1 = hex6(v); }).el);
    box.appendChild(kHint(I18n.t("cadeditor.ui.kit2.c7b24e7997"))); box.appendChild(kColor(0x5555FF, function (v) { c2 = hex6(v); }).el);
    box.appendChild(kBtn(I18n.t("cadeditor.ui.kit2.cd36448686", (keep.s === 0 && keep.e === text.length ? I18n.t("cadeditor.ui.kit2.e6aa32cdd5") : I18n.t("cadeditor.ui.kit2.1017949653"))), function () {
      var idx = []; for (var i = keep.s; i < keep.e; i++) if (text.charAt(i) !== '\n' && !(sty[i] && sty[i]._object)) idx.push(i);
      if (idx.length > 256) { toast(I18n.t("cadeditor.ui.kit2.9f7870106e"), 'error'); return; }
      idx.forEach(function (i, k) { var s = clone(sty[i] || {}); var hx = lerpHex(c1, c2, idx.length > 1 ? k / (idx.length - 1) : 0); s.color = codes ? (nearestColor(hx) || hx) : hx; sty[i] = s; });
      kPopClose(); sel = keep; emit(); highlight(); paintBar(); refocus();
    }, { cls: 'pri' }));
    kPopover(anchor, box, { width: 280, maxHeight: 360 });
  }
  function codePop(anchor) {
    var src = h('textarea', { class: 'k-input ed-code-in', spellcheck: 'false', placeholder: codes ? I18n.t("cadeditor.ui.kit2.2f5a449b16") : I18n.t("cadeditor.ui.kit2.2829ddfe71") });
    src.value = rdCodes(rdRuns(text, sty));
    src.setAttribute('style', 'height:140px');
    var grip = h('div', { class: 'k-pop-grip', title: I18n.t("cadeditor.ui.kit2.6cf2895f00") });
    var apply = kBtn(codes ? I18n.t("cadeditor.ui.kit2.dd86f34ae6") : I18n.t("cadeditor.ui.kit2.576d81bb06"), function () {
      var nt = { text: '', sty: [] }; rdFromRuns(parseCodes(src.value, codes), nt);
      if (!multi) { nt.text = nt.text.replace(/\n/g, ''); nt.sty = nt.sty.slice(0, nt.text.length); }
      kPopClose(); sel = { s: 0, e: text.length }; replaceSel(nt.text, nt.sty);
    }, { cls: 'pri' });
    var pop = kPopover(anchor, h('div', { class: 'k-pickbox' }, [codes ? kHint(I18n.t("cadeditor.ui.kit2.9530218f45")) : null, src, h('div', { class: 'k-pop-foot' }, [apply, grip])]), { width: 400, maxHeight: 520 });
    grip.addEventListener('mousedown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var scale = uiScaleFactor(), vp = uiViewport(), pr = pop.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      var w0 = pr.width / scale, h0 = src.getBoundingClientRect().height / scale, left = pr.left / scale;
      var st = String(pop.getAttribute('style') || '').replace(/(^|;)\s*(width|max-height)\s*:[^;]*/g, '');
      dragTrack(e, function (ev) {
        var w = clampN(w0 + (ev.clientX - sx) / scale, 220, Math.max(220, vp.width - left - 8));
        var hh = clampN(h0 + (ev.clientY - sy) / scale, 60, Math.max(60, vp.height - 120));
        src.setAttribute('style', 'height:' + Math.round(hh) + 'px');
        pop.setAttribute('style', st + ';width:' + Math.round(w) + 'px;max-height:' + Math.round(vp.height - 16) + 'px');
      });
    });
  }
  gradB = tb('grad', uiIcon('palette', 12), I18n.t("cadeditor.ui.kit2.180d65c050"), function (b) { gradientPop(b); });
  bar.appendChild(gradB);
  var more = tb('more', uiIcon('menu', 12), I18n.t("cadeditor.ui.kit2.d3aa3a9101"), function (b) {
    var r = b.getBoundingClientRect();
    kMenu(r.left, r.bottom + 2, [
      { label: codes ? I18n.t("cadeditor.ui.kit2.257439af69") : I18n.t("cadeditor.ui.kit2.5443ceb9ac"), icon: 'code', run: function () { codePop(more); } },
      { sep: 1 },
      { label: I18n.t("cadeditor.ui.kit2.0e40ec4be2"), icon: 'restore', run: function () { wholeIfEmpty(); patch(function (s) { return s._object ? { _object: s._object } : {}; }); } }
    ].filter(Boolean));
  });
  bar.appendChild(more); bar.appendChild(count);
  function paintBar() {
    var list = selStyles();
    RD_FLAGS.forEach(function (f) { flagB[f[0]].classList.toggle('on', list.every(function (s) { return eff(s, f[0]); })); });
    var colors = list.map(function (s) { return s.color || ''; }), same = colors.every(function (c) { return c === colors[0]; });
    var hx = same ? (tcHex(colors[0]) || tcHex(def.color) || '') : '';
    chip.className = 'k-rdsw' + (same ? '' : ' mixed') + (same && !colors[0] ? ' def' : '');
    chip.setAttribute('style', hx ? 'background:' + hx : '');
    setTip(colorB, I18n.t("cadeditor.ui.kit2.a523d6c2dd", (!same ? I18n.t("cadeditor.ui.kit2.9967cbbd81") : colors[0] ? (mcColors().filter(function (c) { return c[0] === colors[0]; }).map(function (c) { return c[2]; })[0] || colors[0]) : I18n.t("cadeditor.ui.common.default"))));
  }

  /* aside：放在输入框右边、和它等高的预览（书页）；两边按滚动比例同步 */
  /* 原生输入框画不了图：精灵图在输入框里占一个（透明的）◆，真图标盖在它上面。
     位置由一个看不见的镜像量出来：同样的宽度、字体、折行，◆ 落在哪就把图标放在哪 */
  var sprLayer = h('div', { class: 'k-rdspr' }), sprIn = h('div', { class: 'k-rdsprin' }), mirror = h('div', { class: 'k-rdmirror' });
  sprIn.appendChild(mirror); sprLayer.appendChild(sprIn);
  var tawrap = h('div', { class: 'k-rdtaw' }, [ta, sprLayer]);
  var sprKey = '', sprTimer = null, sprWaited = 0;
  function hasObjects() { for (var i = 0; i < sty.length; i++) if (sty[i] && sty[i]._object) return true; return false; }
  var shownTop = -1, shownLeft = -1;
  function sprShift() { shownTop = ta.scrollTop || 0; shownLeft = ta.scrollLeft || 0; sprIn.setAttribute('style', 'left:' + (-shownLeft) + 'px;top:' + (-shownTop) + 'px'); }
  function placeSprites() {
    if (codes) return;
    if (!hasObjects()) { if (sprOn) { sprOn = false; highlight(); } clear(sprIn); clear(mirror); sprKey = ''; return; }
    if (!document.body.contains || !document.body.contains(wrap)) return;
    var cw = ta.clientWidth, scale = typeof uiScaleFactor === 'function' ? uiScaleFactor() : 1;
    if (!cw) return;
    /* 镜像：和输入框同宽、同字体、同折行，文字透明，只有图标可见。
       图标和普通字排在同一行（基线、行高和右边预览一模一样），外面套一个和占位符 ◆ 一样宽的盒子，这样折行和位置不会错 */
    clear(mirror);
    mirror.setAttribute('style', 'width:' + cw + 'px');
    var probe = h('span', { text: RD_MARK }); mirror.appendChild(probe);
    var mw = Math.round(probe.getBoundingClientRect().width / scale * 100) / 100;
    clear(mirror);
    if (!(mw > 0)) return;
    var from = 0;
    for (var i = 0; i < text.length; i++) if (sty[i] && sty[i]._object) {
      if (i > from) mirror.appendChild(h('span', { text: text.slice(from, i) }));
      var run = runStyleOf(sty[i]); run.text = RD_OBJ; run._object = clone(sty[i]._object);
      var box = h('span'); renderRuns(box, {}, [run], def);
      box.setAttribute('style', 'display:inline-block;width:' + mw + 'px;white-space:pre;position:relative;top:' + ((typeof UI !== 'undefined' && UI.font === 'smooth') ? SPR_DY : 0) + 'px');
      mirror.appendChild(box); from = i + 1;
    }
    if (from < text.length) mirror.appendChild(h('span', { text: text.slice(from) }));
    sprShift(); sprKey = cw + ',' + ta.clientHeight + ',' + version;
    if (!sprOn) { sprOn = true; highlight(); }
  }
  function scheduleSprites() {
    if (codes) return;
    [0, 120, 500].forEach(function (ms) { setTimeout(placeSprites, ms); });
    if (sprTimer) return;
    sprTimer = setInterval(function () {
      var attached = document.body.contains && document.body.contains(wrap);
      if (!attached) { if (++sprWaited > 200) { clearInterval(sprTimer); sprTimer = null; } return; }
      sprWaited = 0;
      if (!hasObjects()) return;
      if (sprKey !== ta.clientWidth + ',' + ta.clientHeight + ',' + version) placeSprites();
      else if ((ta.scrollTop || 0) !== shownTop || (ta.scrollLeft || 0) !== shownLeft) sprShift();
    }, 80);
  }
  ta.addEventListener('scroll', sprShift);
  var edit = h('div', { class: 'k-rdedit' }, [bar, o.aside ? h('div', { class: 'k-rdbody' }, [tawrap, o.aside]) : tawrap]);
  if (o.aside) {
    var syncing = false, scroller = o.asideScroll || o.aside;
    var follow = function (from, to) {
      if (syncing) return;
      var span = from.scrollHeight - from.clientHeight, r = span > 0 ? from.scrollTop / span : 0;
      syncing = true; to.scrollTop = Math.round(r * Math.max(0, to.scrollHeight - to.clientHeight)); syncing = false;
    };
    ta.addEventListener('scroll', function () { follow(ta, scroller); });
    scroller.addEventListener('scroll', function () { follow(scroller, ta); });
    followAside = function () { follow(ta, scroller); };
  }
  if (prev) wrap.appendChild(prev);
  wrap.appendChild(edit);
  var openKey = o.openKey || 'rich', open = !o.compact || !!UIOpen[openKey];
  function sync() { edit.style.display = open ? 'flex' : 'none'; wrap.classList.toggle('open', open); }
  if (o.compact && prev) {
    prev.classList.add('click'); setTip(prev, I18n.t("cadeditor.ui.kit2.20300edac6"));
    prev.addEventListener('click', function () { open = !open; UIOpen[openKey] = open; sync(); if (open) refocus(); });
  }
  sync();
  api = {
    el: wrap, textarea: ta, recount: function () { paintCount(curValue()); },
    runs: function () { return rdRuns(text, sty); },
    lineRuns: function () { var out = [], start = 0; for (var i = 0; i <= text.length; i++) if (i === text.length || text.charAt(i) === '\n') { out.push(rdRuns(text, sty, start, i)); start = i + 1; } return out; },
    focus: function () { open = true; sync(); sel = { s: text.length, e: text.length }; refocus(); },
    length: function () { return text.length; },
    caretPos: function () { readSel(); return sel.e; },
    setCaret: function (p) { p = Math.max(0, Math.min(text.length, p)); sel = { s: p, e: p }; refocus(0); },
    slice: function (a, b) { return { text: text.slice(a, b), sty: sty.slice(a, b) }; },
    set: function (v) {
      var l = rdLoad(v, codes, n); if (!l) return;
      version++; text = l.text; sty = l.sty; pending = null; sel = { s: Math.min(sel.s, text.length), e: Math.min(sel.e, text.length) };
      if (ta.value !== text) ta.value = text;
      highlight(); paintBar(); rendered();
    }
  };
  highlight(); paintBar(); rendered();
  return api;
}
/* 旧接口：名称、说明文字等单行文字 */
function kRich(value, o) { o = o || {}; return kRichDoc(value, { compact: o.compact, openKey: o.openKey, placeholder: o.placeholder, def: o.def, onChange: o.onChange }); }

/* ---------- 书本编辑器（成书 / 书与笔共用） ----------
   一次编辑一页：工具栏在上；左边写字，右边是同高的书页预览，两边滚动同步。
   页脚一行：左边是本页操作（插入、复制、删除），中间是居中的页码（页多时折叠成 1 … 5 6 [7] 8 9 … 100，点 … 跳页），右边是页数。
   右键页码可移动、复制、插入或删除那一页；PageUp / PageDown 翻页。
   o = { kind: 'written'|'writable', get(): 页数组, save(pages, label), maxPages(), maxChars()（undefined=读取中、null=没有上限）, key }
   页可以是 {raw, filtered}（游戏的过滤文本）：只改 raw，filtered 原样保留。 */
function bookFiltered(p) { return isObj(p) && p.raw !== undefined && Object.keys(p).every(function (k) { return k === 'raw' || k === 'filtered'; }); }
/* 页码窗口：总数 ≤ 9 全部列出；否则首页、末页、当前页前后各 2 页，中间用 … 代替。返回 [0, '…', 4, 5, 6, …] */
function bookPagerItems(total, at) {
  if (total <= 9) { var all = []; for (var i = 0; i < total; i++) all.push(i); return all; }
  var lo = Math.max(1, Math.min(at - 2, total - 6)), hi = Math.min(total - 2, Math.max(at + 2, 5)), out = [0];
  if (lo > 1) out.push('…');
  for (var j = lo; j <= hi; j++) out.push(j);
  if (hi < total - 2) out.push('…');
  out.push(total - 1);
  return out;
}
function kBookEditor(o) {
  var codes = o.kind === 'writable', key = o.key || 'book:' + o.kind;
  var root = h('div', { class: 'k-book' }), at = UIOpen[key] || 0, seen = '', ed = null;
  function pages() { var l = o.get(); return Array.isArray(l) ? clone(l) : []; }
  function raw(p) { return bookFiltered(p) ? p.raw : p; }
  function put(list, label) { seen = JSON.stringify(list); o.save(list, label); }
  function maxPages() { return o.maxPages ? o.maxPages() : null; }
  function setAt(i, n) { at = Math.max(0, Math.min(i, n - 1)); UIOpen[key] = at; }

  var edHost = h('div', { class: 'k-book-ed' });
  var pgBody = h('div', { class: 'k-bookpg-b' }), paper = h('div', { class: 'k-bookpg' }, [pgBody]);
  var note = h('div', { class: 'k-book-note' });
  var acts = h('div', { class: 'k-book-acts' }), pager = h('div', { class: 'k-book-pager' }), info = h('div', { class: 'k-book-info' });
  var foot = h('div', { class: 'k-book-foot' }, [acts, pager, info]);
  root.appendChild(edHost); root.appendChild(note); root.appendChild(foot);
  root.addEventListener('keydown', function (e) {
    if (e.key === 'PageUp') { e.preventDefault(); go(at - 1); }
    else if (e.key === 'PageDown') { e.preventDefault(); go(at + 1); }
  });

  function go(i) { var l = pages(); if (!l.length) return; i = Math.max(0, Math.min(l.length - 1, i)); if (i === at) return; setAt(i, l.length); drawAll(true); }
  function insert(i, page) {
    var l = pages(), m = maxPages();
    if (typeof m === 'number' && l.length >= m) { toast(I18n.t("cadeditor.ui.kit2.6d4da57b8d", (m)), 'error', 'book-max'); return; }
    i = Math.max(0, Math.min(i, l.length)); l.splice(i, 0, page); put(l, I18n.t("cadeditor.ui.kit2.5cc302cb3d", (i + 1))); setAt(i, l.length); drawAll(true);
  }
  function remove(i) { var l = pages(); if (i < 0 || i >= l.length) return; l.splice(i, 1); put(l, I18n.t("cadeditor.ui.kit2.3159a03f08", (i + 1))); setAt(Math.min(at, l.length - 1), l.length); drawAll(); }
  function move(from, to) { var l = pages(); if (to < 0 || to >= l.length || from === to) return; var x = l.splice(from, 1)[0]; l.splice(to, 0, x); put(l, I18n.t("cadeditor.ui.kit2.3ce05c0632", (from + 1))); setAt(to, l.length); drawAll(); }
  function setPage(v) {
    var l = pages(); if (at >= l.length) return;
    var p = l[at]; if (bookFiltered(p)) { p = clone(p); p.raw = v; l[at] = p; } else l[at] = v;
    put(l, I18n.t("cadeditor.ui.kit2.4f66f7c56d", (at + 1)));
  }
  function pageMenu(i) {
    var n = pages().length;
    return [
      { label: I18n.t("cadeditor.ui.kit2.4fda16fdd3"), icon: 'plus', run: function () { insert(i, ''); } },
      { label: I18n.t("cadeditor.ui.kit2.5e6a9c4e56"), icon: 'plus', run: function () { insert(i + 1, ''); } },
      { label: I18n.t("cadeditor.ui.kit2.99276f18d2"), icon: 'copy', run: function () { insert(i + 1, clone(pages()[i])); } },
      { sep: 1 },
      { label: I18n.t("cadeditor.ui.kit2.ac5cabbd1b"), icon: 'back', dis: i === 0, run: function () { move(i, i - 1); } },
      { label: I18n.t("cadeditor.ui.kit2.265648665b"), icon: 'forward', dis: i >= n - 1, run: function () { move(i, i + 1); } },
      { label: I18n.t("cadeditor.ui.kit2.b213e1acd8"), icon: 'up', dis: i === 0, run: function () { move(i, 0); } },
      { label: I18n.t("cadeditor.ui.kit2.4d88bb535e"), icon: 'down', dis: i >= n - 1, run: function () { move(i, n - 1); } },
      { sep: 1 },
      { label: I18n.t("cadeditor.ui.kit2.9623f116ab"), icon: 'trash', danger: 1, run: function () { remove(i); } }
    ];
  }
  function iconBtn(icon, tip, fn, cls) { return kBtn('', fn, { icon: icon, title: tip, cls: 'k-book-ib' + (cls ? ' ' + cls : '') }); }
  function jumpPop(anchor, n) {
    var inp = h('input', { class: 'k-input', type: 'text', placeholder: '1 – ' + n });
    function ok() { var v = parseInt(inp.value, 10); if (!isNaN(v)) { kPopClose(); go(v - 1); } }
    inp.addEventListener('change', ok);
    kPopover(anchor, h('div', { class: 'k-pickbox' }, [kHint(I18n.t("cadeditor.ui.kit2.712ee795cf")), inp, kBtn(I18n.t("cadeditor.ui.kit2.afd0b9482d"), ok, { cls: 'pri' })]), { width: 150 });
    setTimeout(function () { if (inp.focus) inp.focus(); }, 0);
  }
  function paintFoot() {
    var l = pages(), n = l.length, m = maxPages();
    clear(acts); clear(pager); clear(info);
    acts.appendChild(iconBtn('plus', I18n.t("cadeditor.ui.kit2.62486c1fa1"), function () { insert(n ? at + 1 : 0, ''); }, typeof m === 'number' && n >= m ? 'dis' : ''));
    acts.appendChild(iconBtn('copy', I18n.t("cadeditor.ui.kit2.99276f18d2"), function () { if (n) insert(at + 1, clone(pages()[at])); }, n ? '' : 'dis'));
    acts.appendChild(iconBtn('trash', I18n.t("cadeditor.ui.kit2.9623f116ab"), function () { remove(at); }, 'dng' + (n ? '' : ' dis')));
    var prev = iconBtn('back', I18n.t("cadeditor.ui.kit2.e954052b5e"), function () { go(at - 1); }, at <= 0 ? 'dis' : '');
    var next = iconBtn('forward', I18n.t("cadeditor.ui.kit2.9b73dadd0e"), function () { go(at + 1); }, at >= n - 1 ? 'dis' : '');
    pager.appendChild(prev);
    bookPagerItems(n, at).forEach(function (i) {
      if (i === '…') { var gap = h('div', { class: 'k-book-pn gap', text: '…', title: I18n.t("cadeditor.ui.kit2.69a9b10a2a") }); activate(gap, function () { jumpPop(gap, n); }); pager.appendChild(gap); return; }
      var b = h('div', { class: 'k-book-pn' + (i === at ? ' on' : ''), text: String(i + 1), title: I18n.t("cadeditor.ui.kit2.7dac322785", (i + 1)) });
      activate(b, function () { go(i); }); onContext(b, function () { return pageMenu(i); });
      pager.appendChild(b);
    });
    pager.appendChild(next);
    info.textContent = I18n.t("cadeditor.ui.kit2.49841c5030", (n), (typeof m === 'number' ? ' / ' + m : ''));
    setTip(info, typeof m === 'number' ? I18n.t("cadeditor.ui.kit2.dc0288a54c", (m)) : m === undefined ? I18n.t("cadeditor.ui.kit2.88f01e9a82") : '');
  }
  /* 游戏里的书页：宽 114、最多 14 行、每行 9（游戏像素）。界面字号固定 12px，游戏字体里 6 像素宽的数字在这里宽 9.0508，所以放大倍数是固定的 */
  var BOOK_W = 114, BOOK_N = 14, BOOK_LH = 9, bookS = 1.5085;
  function pageStyle(el, extra) {
    bookS = (typeof UI !== 'undefined' && UI.font === 'smooth') ? 1.5085 : 1.5;   /* 游戏字体 12px 下正好 1.5 倍；平滑字体的数字略宽 */
    el.setAttribute('style', 'width:' + Math.round(BOOK_W * bookS) + 'px;line-height:' + (BOOK_LH * bookS).toFixed(2) + 'px;overflow-wrap:anywhere;' + (extra || ''));
  }
  /* 放得下返回 -1；放不下返回该在哪个下标切开（尽量在空白处，切口后面的内容挪到下一页）。
     先把每个段落放进各自的块里，一次排版就知道累计行数；再把溢出的那一段逐字拆开，一次排版找到第一个落到第 15 行的字 */
  function fitIndex(text, sty) {
    pageStyle(pgBody); clear(pgBody);
    var lh = BOOK_LH * bookS, def = { color: '#000000' };
    var paras = [], start = 0;
    for (var i = 0; i <= text.length; i++) if (i === text.length || text.charAt(i) === '\n') {
      var d = h('div'); renderRuns(d, {}, i > start ? rdRuns(text, sty, start, i) : [{ text: '\u00A0' }], def); pgBody.appendChild(d);
      paras.push({ el: d, s: start, e: i }); start = i + 1;
    }
    var cum = 0, hit = -1, rem = 0;
    for (var p = 0; p < paras.length; p++) {
      var n = Math.max(1, Math.round(paras[p].el.clientHeight / lh));
      if (cum + n > BOOK_N) { hit = p; rem = BOOK_N - cum; break; }
      cum += n;
    }
    if (hit < 0) return -1;
    var P = paras[hit];
    if (rem <= 0) return Math.max(1, P.s);
    clear(pgBody);
    var runs = []; for (var c = P.s; c < P.e; c++) runs = runs.concat(rdRuns(text, sty, c, c + 1));
    var host = h('div'); renderRuns(host, {}, runs, def); pgBody.appendChild(host);
    var hr = host.getBoundingClientRect(), sc = host.clientHeight ? hr.height / host.clientHeight : 1, kids = host.children, at2 = P.e;
    for (var j = 0; j < kids.length; j++) {
      var line = Math.floor((kids[j].getBoundingClientRect().top - hr.top) / sc / lh + 0.2);
      if (line >= rem) { at2 = P.s + j; break; }
    }
    for (var q = at2; q > Math.max(P.s + 1, at2 - 60); q--) if (/\s/.test(text.charAt(q - 1))) return q;
    return Math.max(1, at2);
  }
  function rdVal(t) { var runs = rdRuns(t.text, t.sty); return codes ? rdCodes(runs) : tcBuild({}, runs); }
  function withRaw(p, v) { if (bookFiltered(p)) { p = clone(p); p.raw = v; return p; } return v; }
  /* 当前页写满了：多出来的挪到下一页开头（下一页再满就继续往后），最后一页满了就加新页 */
  function flow() {
    if (!ed || ed.raw || !document.body.contains || !document.body.contains(pgBody)) return;
    try { flowRun(); } finally { paintPaper(); }
  }
  function flowRun() {
    var l = pages(), j = at, carry = null, caretPage = null, caret = ed.caretPos(), changed = false, guard = 0;
    var maxP = maxPages();
    while (j < l.length && guard++ < 200) {
      var ld = j === at ? ed.slice(0, ed.length()) : rdLoad(raw(l[j]), codes, 0);
      if (!ld) break;
      if (carry) { ld = { text: carry.text + ld.text, sty: carry.sty.concat(ld.sty) }; }
      var k = fitIndex(ld.text, ld.sty);
      if (k < 0) { if (carry) { l[j] = withRaw(l[j], rdVal(ld)); changed = true; } break; }
      var head = { text: ld.text.slice(0, k), sty: ld.sty.slice(0, k) }, tail = { text: ld.text.slice(k), sty: ld.sty.slice(k) };
      if (j === at && caret >= k) caretPage = { page: at + 1, pos: caret - k };
      if (j + 1 >= l.length) {
        if (typeof maxP === 'number' && l.length >= maxP) { toast(I18n.t("cadeditor.ui.kit2.624d43e3a7", (maxP)), 'error', 'book-flow'); return; }
        l.push('');
      }
      l[j] = withRaw(l[j], rdVal(head)); changed = true; carry = tail; j++;
    }
    if (!changed) return;
    put(l, I18n.t("cadeditor.ui.kit2.6ca704982b"));
    if (caretPage) { setAt(caretPage.page, l.length); drawAll(true); if (ed && ed.setCaret) ed.setCaret(caretPage.pos); }
    else { drawAll(true); if (ed && ed.setCaret) ed.setCaret(Math.min(caret, ed.length())); }
    toast(I18n.t("cadeditor.ui.kit2.ce057ebb56", (BOOK_N)), 'info', 'book-flow');
  }
  function paintPaper() {
    pageStyle(pgBody, 'min-height:' + Math.round(BOOK_N * BOOK_LH * bookS) + 'px;border-bottom:1px dashed #b0a07a;');
    if (ed && !ed.raw) renderRuns(pgBody, {}, ed.runs(), { color: '#000000', placeholder: I18n.t("cadeditor.ui.kit2.2f38ab5a28") });
    else clear(pgBody);
  }
  function drawEditor(focus) {
    clear(edHost); clear(note); ed = null; var l = pages();
    if (!l.length) {
      edHost.appendChild(h('div', { class: 'k-book-empty' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.kit2.29fbb3a0d7") }), kBtn(I18n.t("cadeditor.ui.kit2.61556539e9"), function () { insert(0, ''); }, { icon: 'plus', cls: 'pri' })]));
      return;
    }
    var p = l[at];
    ed = kRichDoc(raw(p), { mode: codes ? 'codes' : 'component', multiline: true, preview: false, paper: 'book', aside: paper,
      placeholder: I18n.t("cadeditor.ui.kit2.7b207cfd82", (at + 1)), def: { color: '#000000', placeholder: I18n.t("cadeditor.ui.kit2.2f38ab5a28") }, max: codes ? o.maxChars : undefined,
      onChange: function (v) { setPage(v); flow(); }, onRender: paintPaper });
    edHost.appendChild(ed.el);
    if (ed.raw) note.appendChild(kHint(I18n.t("cadeditor.ui.kit2.da34ae760d"), 'hint'));
    if (bookFiltered(p) && p.filtered !== undefined) note.appendChild(kHint(I18n.t("cadeditor.ui.kit2.c5c3a4cc8b")));
    if (focus && ed.focus) ed.focus();
  }
  function drawAll(focus) { var l = pages(); seen = JSON.stringify(l); setAt(at, l.length); drawEditor(focus); paintPaper(); paintFoot(); }
  /* 撤销 / 重做 / 外部修改：内容不是这里刚写的，就重新载入 */
  function refresh() { if (JSON.stringify(pages()) !== seen) drawAll(); else { paintFoot(); if (ed && ed.recount) ed.recount(); } }
  drawAll();
  return { el: root, refresh: refresh };
}
