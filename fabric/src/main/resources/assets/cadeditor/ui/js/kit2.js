/* 工具包 · 第二部分：大数字、等级、拖拽排序、右键菜单、所见即所得文字编辑器。 */

/* ---------- 大数字 / 等级 ---------- */
function fmtInt(n) { var s = String(Math.round(n)); var neg = s.charAt(0) === '-'; if (neg) s = s.substring(1); s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (neg ? '-' : '') + s; }
function bigText(n) { var a = Math.abs(n); if (a >= 1e8) return +(n / 1e8).toFixed(2) + '亿'; if (a >= 1e4) return +(n / 1e4).toFixed(2) + '万'; return null; }
function numBig(n) { var b = bigText(n); return fmtNum(n) + (b ? '（' + b + '）' : ''); }
function levelText(n) { return n >= 1 && n <= 10 ? roman(n) : fmtInt(n); }

/* ---------- 拖拽排序 ----------
   container 的直接子元素带 .k-srow，行里的 .k-grip 是把手。放手时 o.onMove(from, to)。o.grid=true 用二维就近。 */
/* FLIP：重排前记位置，重排后让每一行从旧位置滑到新位置（180ms，out 曲线） */
function flipMove(container, mutate) {
  var els = Array.prototype.slice.call(container.children), first = els.map(function (e) { return e.getBoundingClientRect().top; });
  mutate();
  els.forEach(function (e, i) {
    var d = first[i] - e.getBoundingClientRect().top; if (!d) return;
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
function kGrip() { return h('div', { class: 'k-grip', title: '按住拖动排序' }, [uiIcon('drag', 12)]); }

/* ---------- 右键菜单 ---------- */
function kMenu(x, y, items) {
  kPopClose(); popClose();
  var box = h('div', { class: 'k-pop k-menu' });
  items.forEach(function (it) {
    if (it.sep) { box.appendChild(h('div', { class: 'k-msep' })); return; }
    var row = h('div', { class: 'k-mi' + (it.danger ? ' dng' : '') + (it.dis ? ' dis' : '') }, [it.icon ? uiIcon(it.icon, 12) : h('span', { class: 'k-mi0' }), h('span', { class: 'lb', text: it.label }), it.kbd ? h('span', { class: 'kb', text: it.kbd }) : null]);
    row.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); if (it.dis) return; kPopClose(); it.run(); });
    box.appendChild(row);
  });
  document.getElementById('overlays').appendChild(box);
  var vw = window.innerWidth, vh = window.innerHeight, hh = items.length * 22 + 8;
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
var TC_STYLE_KEYS = ['color', 'bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'];
function runStyleOf(o) { var s = {}; TC_STYLE_KEYS.forEach(function (k) { if (o[k] !== undefined && o[k] !== '') s[k] = o[k]; }); return s; }
function tcAllowed(o) { for (var k in o) { if (k === 'text' || k === 'extra' || TC_STYLE_KEYS.indexOf(k) >= 0) continue; return false; } return typeof o.text === 'string' || o.extra !== undefined; }
/* 解析：支持 字符串 / {text,style,extra:[字符串|对象]} / 数组（首项为父级）。复杂内容返回 null */
function tcRuns(v) {
  if (typeof v === 'string') return { base: {}, runs: [{ text: v }] };
  if (Array.isArray(v)) { if (!v.length) return { base: {}, runs: [{ text: '' }] }; var first = v[0], rest = v.slice(1); if (typeof first === 'string') first = { text: first }; if (!isObj(first)) return null; var c = clone(first); c.extra = (c.extra || []).concat(rest); return tcRuns(c); }
  if (!isObj(v) || !tcAllowed(v)) return null;
  var base = runStyleOf(v), runs = [];
  if (typeof v.text === 'string' && v.text !== '') runs.push({ text: v.text });
  var ok = true;
  (v.extra || []).forEach(function (x) {
    if (typeof x === 'string') runs.push({ text: x });
    else if (isObj(x) && tcAllowed(x) && x.extra === undefined && typeof x.text === 'string') { var r = runStyleOf(x); r.text = x.text; runs.push(r); }
    else ok = false;
  });
  if (!ok) return null;
  if (!runs.length) runs.push({ text: '' });
  /* 没有分段时，样式直接放在这一段上（颜色块才能显示出来） */
  if (!(v.extra && v.extra.length)) { var st = runStyleOf(v); Object.keys(st).forEach(function (kk) { runs[0][kk] = st[kk]; }); base = {}; }
  return { base: base, runs: runs };
}
function sameStyle(a, b) { return deepEq(runStyleOf(a), runStyleOf(b)); }
function tcBuild(base, runs) {
  var merged = [];
  runs.forEach(function (r) { if (r.text === '' && runs.length > 1) return; var last = merged[merged.length - 1]; if (last && sameStyle(last, r)) last.text += r.text; else merged.push(clone(r)); });
  if (!merged.length) merged.push({ text: '' });
  var baseEmpty = !Object.keys(base).length;
  if (merged.length === 1) {
    var r = merged[0], st = runStyleOf(r), all = {}, k;
    for (k in base) all[k] = base[k]; for (k in st) all[k] = st[k];
    if (!Object.keys(all).length) return r.text;
    var out = { text: r.text }; TC_STYLE_KEYS.forEach(function (kk) { if (all[kk] !== undefined) out[kk] = all[kk]; }); return out;
  }
  var o = { text: '' }; TC_STYLE_KEYS.forEach(function (kk) { if (base[kk] !== undefined) o[kk] = base[kk]; });
  o.extra = merged.map(function (r) { var st = runStyleOf(r); return Object.keys(st).length ? (function () { var x = { text: r.text }; TC_STYLE_KEYS.forEach(function (kk) { if (st[kk] !== undefined) x[kk] = st[kk]; }); return x; })() : r.text; });
  return o;
}
/* 渲染：在 el 里画出带颜色的文字（所见即所得）。def 为默认色/斜体（如说明文字的紫色斜体） */
function renderRuns(el, base, runs, def) {
  clear(el); def = def || {};
  var any = false;
  runs.forEach(function (r) {
    if (!r.text) return; any = true;
    var st = {}, k; for (k in base) st[k] = base[k]; var rs = runStyleOf(r); for (k in rs) st[k] = rs[k];
    var hex = tcHex(st.color) || def.color || '#FFFFFF';
    var italic = st.italic === undefined ? !!def.italic : st.italic;
    var css = 'color:' + hex + ';' + (st.bold ? 'font-weight:bold;' : '') + (italic ? 'font-style:italic;' : '');
    var deco = []; if (st.underlined) deco.push('underline'); if (st.strikethrough) deco.push('line-through');
    if (deco.length) css += 'text-decoration-line:' + deco.join(' ') + ';';
    var s = h('span', { text: st.obfuscated ? r.text.replace(/./g, '▒') : r.text }); s.setAttribute('style', css); el.appendChild(s);
  });
  if (!any) el.appendChild(h('span', { class: 'k-ph', text: def.placeholder || '（空）' }));
}
/* § 代码 ⇄ 分段 */
var SECT = String.fromCharCode(167);
var CODE_COLOR = { '0': 'black', '1': 'dark_blue', '2': 'dark_green', '3': 'dark_aqua', '4': 'dark_red', '5': 'dark_purple', '6': 'gold', '7': 'gray', '8': 'dark_gray', '9': 'blue', a: 'green', b: 'aqua', c: 'red', d: 'light_purple', e: 'yellow', f: 'white' };
function parseCodes(text) {
  var runs = [], cur = {}, buf = '';
  function flush() { if (buf !== '') { var r = clone(cur); r.text = buf; runs.push(r); buf = ''; } }
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if ((ch === SECT || ch === '&') && i + 1 < text.length) {
      var c = text.charAt(i + 1).toLowerCase();
      if (c === '#' && /^[0-9a-fA-F]{6}$/.test(text.substring(i + 2, i + 8))) { flush(); cur = { color: '#' + text.substring(i + 2, i + 8).toUpperCase() }; i += 7; continue; }
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

/* ---------- 所见即所得文字编辑器 ----------
   value: 字符串 / 文本组件。o={placeholder, compact, def:{color,italic,placeholder}, openKey, onChange(v, empty)}
   紧凑模式：折叠时只显示渲染后的预览行，点击展开才进入分段编辑。 */
function kRich(value, o) {
  o = o || {};
  var parsed = tcRuns(value);
  if (!parsed) {
    var raw = wText({ t: 'text' }, value, function (v) { o.onChange(v, false); }, o);
    return { el: h('div', { class: 'k-rich' }, [h('div', { class: 'k-note', text: '这段文字带有翻译、点击事件等高级内容，直接编辑 SNBT：' }), raw]), set: function () {} };
  }
  var base = parsed.base, runs = parsed.runs;
  var wrap = h('div', { class: 'k-rich' + (o.compact ? ' compact' : '') });
  var prev = h('div', { class: 'k-rprev' }), edit = h('div', { class: 'k-redit' }), list = h('div', { class: 'k-rruns' });
  var openKey = o.openKey || 'rich', open = !o.compact || !!UIOpen[openKey];
  function emit(redraw) {
    var v = tcBuild(base, runs);
    renderRuns(prev, base, runs, o.def);
    o.onChange(v, typeof v === 'string' && v === '');
    if (redraw) drawRuns();
  }
  function colorBtn(r, i) {
    var st = r.color ? tcHex(r.color) : null;
    var b = h('div', { class: 'k-rcolb', title: '文字颜色：点开选色，或输入 #RRGGBB' }, [h('i', { class: 'sw' + (r.color ? '' : ' none'), style: st ? 'background:' + st : '' }), h('span', { text: '颜色' })]);
    activate(b, function () {
      var pal = h('div', { class: 'k-pickbox' });
      var sw = h('div', { class: 'k-swatches' });
      var none = h('div', { class: 'k-sw nonec' + (!r.color ? ' on' : ''), title: '默认颜色' }, [h('i', { text: '×' })]);
      none.addEventListener('mousedown', function (e) { e.preventDefault(); kPopClose(); delete runs[i].color; emit(true); }); sw.appendChild(none);
      mcColors().forEach(function (c) { var s = h('div', { class: 'k-sw' + (r.color === c[0] ? ' on' : ''), title: c[2], style: 'background:#' + c[1] }); s.addEventListener('mousedown', function (e) { e.preventDefault(); kPopClose(); runs[i].color = c[0]; emit(true); }); sw.appendChild(s); });
      var hex = h('input', { class: 'k-input', type: 'text', placeholder: '#RRGGBB', value: r.color && r.color.charAt(0) === '#' ? r.color : '', maxlength: '7' });
      hex.addEventListener('change', function () { var t = hex.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(t)) { kPopClose(); runs[i].color = t.toUpperCase(); emit(true); } });
      pal.appendChild(sw); pal.appendChild(hex);
      kPopover(b, pal, { width: 244 });
    });
    return b;
  }
  function drawRuns() {
    clear(list);
    runs.forEach(function (r, i) {
      var inp = h('input', { class: 'k-input', type: 'text', value: r.text, placeholder: o.placeholder || '输入文字', spellcheck: 'false' });
      inp.addEventListener('input', function () { runs[i].text = inp.value; emit(false); });
      var sty = h('div', { class: 'k-rsty' });
      [['bold', 'B', '粗体'], ['italic', 'I', '斜体'], ['underlined', 'U', '下划线'], ['strikethrough', 'S', '删除线']].forEach(function (d) {
        var on = r[d[0]] === true || (d[0] === 'italic' && r.italic === true) , off = d[0] === 'italic' && r.italic === false;
        var b = h('div', { class: 'k-rs ' + d[0] + (on ? ' on' : '') + (off ? ' off' : ''), title: d[2] + (d[0] === 'italic' ? '（再点一次=强制非斜体）' : ''), text: d[1] });
        activate(b, function () {
          if (d[0] === 'italic') { if (runs[i].italic === undefined) runs[i].italic = true; else if (runs[i].italic === true) runs[i].italic = false; else delete runs[i].italic; }
          else { if (runs[i][d[0]]) delete runs[i][d[0]]; else runs[i][d[0]] = true; }
          emit(true);
        });
        sty.appendChild(b);
      });
      var rm = h('div', { class: 'k-mini del', text: '×', title: '删除这一段' }); activate(rm, function () { runs.splice(i, 1); if (!runs.length) runs.push({ text: '' }); emit(true); });
      var row = h('div', { class: 'k-rrun k-srow' }, [runs.length > 1 ? kGrip() : null, colorBtn(r, i), inp, sty, runs.length > 1 ? rm : null]);
      list.appendChild(row); lastRow = row;
    });
    placeTools();
  }
  var lastRow = null, sp = null, more = null, tools = null;
  /* 只有一段时，「分色」和菜单按钮并进同一行；多段时放在列表下面 */
  function placeTools() { if (!tools || !more) return; var single = runs.length === 1 && lastRow; var host = single ? lastRow : tools; if (sp) host.appendChild(sp); host.appendChild(more); tools.style.display = single ? 'none' : 'flex'; }
  kSortable(list, { onMove: function (from, to) { var x = runs.splice(from, 1)[0]; runs.splice(to, 0, x); emit(true); } });
  tools = h('div', { class: 'k-row k-rtools' });
  function gradientPop(anchor) {
    var sBox = h('div', { class: 'k-pickbox' }); var c1 = '#FF5555', c2 = '#5555FF';
    var a = kColor(0xFF5555, function (n) { c1 = hex6(n); }), b = kColor(0x5555FF, function (n) { c2 = hex6(n); });
    sBox.appendChild(h('div', { class: 'k-sub', text: '起始' })); sBox.appendChild(a.el); sBox.appendChild(h('div', { class: 'k-sub', text: '结束' })); sBox.appendChild(b.el);
    sBox.appendChild(kBtn('应用渐变', function () {
      var text = runs.map(function (r) { return r.text; }).join(''), chars = text.split(''); if (chars.length > 64) { toast('渐变最多 64 个字', 'error'); return; }
      var st = runStyleOf(runs[0]); delete st.color; var out = [];
      chars.forEach(function (ch, i) { var r = { text: ch }; for (var k in st) r[k] = st[k]; r.color = lerpHex(c1, c2, chars.length > 1 ? i / (chars.length - 1) : 0); out.push(r); });
      runs.length = 0; out.forEach(function (r) { runs.push(r); }); kPopClose(); emit(true);
    }, { cls: 'pri' }));
    kPopover(anchor, sBox, { width: 280, maxHeight: 360 });
  }
  function codePop(anchor) {
    var ta = h('textarea', { class: 'k-input ed-code-in', spellcheck: 'false', placeholder: '&6金色&l加粗' });
    ta.value = toCodes(base, runs).replace(new RegExp(SECT + 'r', 'g'), '');
    kPopover(anchor, h('div', { class: 'k-pickbox' }, [ta, kBtn('导入', function () { runs.length = 0; parseCodes(ta.value).forEach(function (r) { runs.push(r); }); base = {}; kPopClose(); emit(true); }, { cls: 'pri' })]), { width: 300, maxHeight: 220 });
  }
  if (!o.compact) { sp = h('div', { class: 'k-mini', title: '分色：把文字分成几段，每段单独设置颜色' }, [uiIcon('plus', 14)]); activate(sp, function () { runs.push({ text: '' }); emit(true); }); }
  more = h('div', { class: 'k-mini', title: '渐变色、§ 代码、清除格式' }, [uiIcon('menu', 14)]);
  activate(more, function () {
    var r = more.getBoundingClientRect();
    kMenu(r.left, r.bottom + 2, [
      { label: '渐变色', icon: 'palette', run: function () { gradientPop(more); } },
      { label: '§ 代码', icon: 'code', run: function () { codePop(more); } },
      { sep: 1 },
      { label: '清除格式', icon: 'restore', run: function () { var t = runs.map(function (r) { return r.text; }).join(''); runs.length = 0; runs.push({ text: t }); base = {}; emit(true); } }
    ]);
  });
  tools.appendChild(more); placeTools();
  edit.appendChild(list); edit.appendChild(tools);
  drawRuns(); renderRuns(prev, base, runs, o.def);
  function sync() { edit.style.display = open ? 'flex' : 'none'; wrap.classList.toggle('open', open); }
  if (o.compact) {
    prev.classList.add('click'); prev.setAttribute('title', '点击展开编辑');
    prev.addEventListener('click', function () { open = !open; UIOpen[openKey] = open; sync(); });
  }
  wrap.appendChild(prev); wrap.appendChild(edit); sync();
  return { el: wrap, set: function (v) { var p = tcRuns(v); if (!p) return; base = p.base; runs.length = 0; p.runs.forEach(function (r) { runs.push(r); }); drawRuns(); renderRuns(prev, base, runs, o.def); } };
}
