/* 表单渲染：按结构定义（EDATA.comps[].schema）自动生成控件，常用组件有专用控件。
   每个控件函数：w(sc, val, commit, ctx) -> 元素；commit(新值, {key}) 把改动交给父级。 */

/* ---------- DOM 小工具 ---------- */
function h(tag, props, kids) {
  var el = document.createElement(tag), k;
  props = props || {};
  for (k in props) {
    var v = props[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.substring(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  if (kids) for (var i = 0; i < kids.length; i++) { var c = kids[i]; if (c === null || c === undefined || c === false) continue; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return el;
}
function icon(name, extra) { return h('img', { class: 'o-ico' + (extra ? ' ' + extra : ''), src: 'oriel:textures/icons/' + name + '.png', alt: '' }); }
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
function onKey(el, map) {
  el.addEventListener('keydown', function (e) { var f = map[e.key]; if (f) { if (f(e) !== false) e.preventDefault(); } });
}
function activate(el, fn) {
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', function (e) { fn(e); if (typeof uiClick === 'function') uiClick(el); });
  el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); if (typeof uiClick === 'function') uiClick(el); } });
}

/* 展开/折叠状态跨重绘保留 */
var UIOpen = {};

/* ---------- 弹出候选（组合框） ---------- */
var Pop = { el: null, owner: null };
function popClose() { if (Pop.el) { Pop.el.remove(); Pop.el = null; Pop.owner = null; } }
function popOpen(anchor, items, onPick, o) {
  o = o || {};
  popClose();
  var box = h('div', { class: 'ed-pop' });
  var sel = 0, shown = items.slice(0, 80);
  function paint() {
    clear(box);
    if (!shown.length) box.appendChild(h('div', { class: 'ed-pop-empty', text: o.empty || '没有匹配项' }));
    shown.forEach(function (it, i) {
      var row = h('div', { class: 'ed-pop-item' + (i === sel ? ' on' : '') }, [
        h('span', { class: 'lbl', text: it.label }),
        it.sub ? h('span', { class: 'sub', text: it.sub }) : null,
      ]);
      row.addEventListener('mousedown', function (e) { e.preventDefault(); onPick(it); popClose(); });
      row.addEventListener('mouseenter', function () { sel = i; var els = box.children; for (var j = 0; j < els.length; j++) els[j].classList.toggle('on', j === i); });
      box.appendChild(row);
    });
  }
  paint();
  var r = anchor.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  var w = Math.max(r.width, 140), left = Math.min(r.left, vw - w - 4);
  var below = vh - r.bottom, up = r.top > below && below < 110;
  box.setAttribute('style', 'left:' + Math.max(2, left) + 'px;width:' + w + 'px;' + (up ? 'bottom:' + (vh - r.top + 1) + 'px;max-height:' + Math.min(140, r.top - 6) + 'px' : 'top:' + (r.bottom + 1) + 'px;max-height:' + Math.min(140, below - 6) + 'px'));
  document.getElementById('overlays').appendChild(box);
  Pop.el = box; Pop.owner = anchor;
  return {
    update: function (list) { shown = list.slice(0, 80); sel = 0; paint(); },
    move: function (d) { if (!shown.length) return; sel = (sel + d + shown.length) % shown.length; paint(); var c = box.children[sel]; if (c && c.scrollIntoView) c.scrollIntoView(); },
    pick: function () { if (shown[sel]) { onPick(shown[sel]); popClose(); return true; } return false; },
  };
}
document.addEventListener('mousedown', function (e) { if (Pop.el && !Pop.el.contains(e.target) && e.target !== Pop.owner) popClose(); });

/* 带候选的输入：options = [{v,label,sub}]；free=true 允许自由输入 */
function combo(o) {
  var input = h('input', { class: 'ore-field ed-in', type: 'text', value: o.value || '', placeholder: o.placeholder || '', spellcheck: 'false' });
  var ctl = null;
  function filter() {
    var q = input.value.trim().toLowerCase();
    var opts = typeof o.options === 'function' ? o.options() : o.options;
    var list = opts.filter(function (x) { return !q || kMatch(x.v + ' ' + x.label + ' ' + (x.sub || ''), q); });
    return list;
  }
  function open() { if (!ctl || !Pop.el) ctl = popOpen(input, filter(), function (it) { input.value = it.v; o.onPick(it.v, it); }); else ctl.update(filter()); }
  input.addEventListener('focus', function () { ctl = null; open(); });
  input.addEventListener('input', function () { if (!Pop.el || Pop.owner !== input) ctl = null; open(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!Pop.el) open(); else ctl && ctl.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ctl && ctl.move(-1); }
    else if (e.key === 'Enter') { if (Pop.el && ctl && ctl.pick()) { e.preventDefault(); e.stopPropagation(); } else if (o.free) { o.onPick(input.value.trim(), null); popClose(); } }
    else if (e.key === 'Escape') { if (Pop.el) { e.stopPropagation(); popClose(); } }
  });
  input.addEventListener('change', function () { if (o.free && !Pop.el) o.onPick(input.value.trim(), null); });
  input.addEventListener('blur', function () { setTimeout(function () { if (Pop.owner === input) popClose(); }, 120); });
  return input;
}

/* 注册表候选 */
function registryOptions(reg) {
  /* 候选来自游戏实时注册表（含模组）；没有宿主时，有内置清单的退回内置数据，其余只能手动输入。返回函数：数据到达后下一次展开自动是最新的 */
  var off = reg === 'item' ? EDATA.items.map(function (i) { return { v: 'minecraft:' + i, label: humanId(i), sub: i }; })
    : reg === 'enchantment' ? EDATA.enchants.map(function (e) { return { v: 'minecraft:' + e.id, label: e.name, sub: e.id }; })
    : reg === 'attribute' ? EDATA.attrs.map(function (a) { return { v: 'minecraft:' + a.id, label: a.name, sub: a.id }; })
    : reg === 'mob_effect' ? EDATA.effects.map(function (a) { return { v: 'minecraft:' + a.id, label: a.name, sub: a.id }; })
    : reg === 'data_component_type' ? EDATA.comps.map(function (c) { return { v: 'minecraft:' + c.id, label: c.name, sub: c.id }; }) : null;
  if (!Reg.live()) return off ? function () { return off; } : null;
  return function () { return Reg.options(reg) || off || []; };
}
var REG_HINT = { sound_event: '音效 ID，如 minecraft:entity.generic.eat', block: '方块 ID，如 minecraft:stone', entity_type: '实体 ID', damage_type: '伤害类型 ID', instrument: '乐器 ID', jukebox_song: '唱片歌曲 ID', trim_material: '纹饰材料 ID', trim_pattern: '纹饰图案 ID', banner_pattern: '旗帜图案 ID', recipe: '配方 ID', potion: '药水 ID', loot_table: '战利品表 ID', map_decoration_type: '地图标记类型' };

/* ---------- 默认值 ---------- */
function defaultFor(sc) {
  if (!sc) return null;
  switch (sc.t) {
    case 'bool': return false;
    case 'int': case 'num': { var v = 0; if (sc.min !== undefined && v < sc.min) v = sc.min; if (sc.max !== undefined && v > sc.max) v = sc.max; return v; }
    case 'str': return sc.en ? sc.en[0] : '';
    case 'text': return '';
    case 'obj': { var o = {}; sc.f.forEach(function (f) { if (f.r) o[f.k] = f.df !== undefined ? clone(f.df) : defaultFor(f.s); }); return o; }
    case 'arr': return [];
    case 'map': return {};
    case 'union': return defaultFor(sc.a[0]);
    case 'dunion': { var k = Object.keys(sc.br)[0], b = defaultFor(sc.br[k]); if (isObj(b)) b[sc.disc] = k; return b; }
    default: return {};
  }
}
function altLabel(a) {
  switch (a.t) {
    case 'str': return a.tag ? '标签 #' : (a.reg ? 'ID' : '文本');
    case 'int': case 'num': return '数值'; case 'bool': return '开关'; case 'arr': return '列表'; case 'text': return '文本';
    default: return '对象';
  }
}
function summarize(sc, v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length + ' 项';
  var ks = Object.keys(v).slice(0, 3).map(function (k) { var x = v[k]; return k + '=' + (isObj(x) || Array.isArray(x) ? '…' : String(x)); });
  return ks.join(' ');
}

/* ---------- 基础控件 ---------- */
function wBool(sc, val, commit) {
  var on = !!val;
  var el = h('div', { class: 'ed-toggle' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) }, [h('i', {})]);
  activate(el, function () { on = !on; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); commit(on, { key: 'tg' }); });
  return el;
}

function wNum(sc, val, commit, ctx) {
  var isInt = sc.t === 'int';
  var step = ctx && ctx.step ? ctx.step : (isInt ? 1 : 0.1);
  var input = h('input', { class: 'ore-field ed-in ed-numin', type: 'text', value: val === undefined || val === null ? '' : fmtNum(val), placeholder: ctx && ctx.placeholder ? ctx.placeholder : '' });
  var wrap = h('div', { class: 'ed-num' });
  function clampv(v) { if (sc.min !== undefined && v < sc.min) v = sc.min; if (sc.max !== undefined && v > sc.max) v = sc.max; return v; }
  function parse() {
    var t = input.value.trim().replace(/[dfl]$/i, '');
    if (t === '' || t === '-' ) return undefined;
    var n = Number(t);
    return isNaN(n) ? NaN : n;
  }
  function mark(n) {
    var bad = n === undefined ? false : (isNaN(n) || (isInt && !Number.isInteger(n)) || (sc.min !== undefined && n < sc.min) || (sc.minEx && sc.min !== undefined && n <= sc.min) || (sc.max !== undefined && n > sc.max));
    wrap.classList.toggle('bad', bad);
  }
  function nudge(dir, big) {
    var n = parse(); if (n === undefined || isNaN(n)) n = val === undefined ? 0 : val;
    var d = step * (big ? 10 : 1) * dir;
    n = clampv(+(n + d).toFixed(6));
    input.value = fmtNum(n); centerInput(input); mark(n); val = n; commit(n, { key: ctx && ctx.key ? ctx.key : 'num' });
  }
  var minus = h('div', { class: 'ed-step', text: '−', title: '减少（Shift 加速）' }), plus = h('div', { class: 'ed-step', text: '+', title: '增加（Shift 加速）' });
  minus.addEventListener('click', function (e) { nudge(-1, e.shiftKey); });
  plus.addEventListener('click', function (e) { nudge(1, e.shiftKey); });
  input.addEventListener('input', function () {
    centerInput(input); var n = parse(); mark(n);
    if (n !== undefined && !isNaN(n)) { val = n; commit(n, { key: ctx && ctx.key ? ctx.key : 'num' }); }
  });
  input.addEventListener('change', function () { var n = parse(); if (n === undefined) { if (ctx && ctx.onEmpty) ctx.onEmpty(); } else if (!isNaN(n)) { var c = clampv(isInt ? Math.round(n) : n); if (c !== n) { input.value = fmtNum(c); mark(c); val = c; commit(c, { key: 'num' }); } } });
  onKey(input, { ArrowUp: function (e) { nudge(1, e.shiftKey); }, ArrowDown: function (e) { nudge(-1, e.shiftKey); } });
  wrap.appendChild(minus); wrap.appendChild(input); wrap.appendChild(plus);
  setTimeout(function () { centerInput(input); }, 0);
  mark(parse());
  return wrap;
}

function wSeg(options, cur, onPick, cls) {
  var seg = h('div', { class: 'o-seg ed-seg' + (cls ? ' ' + cls : '') });
  options.forEach(function (o) {
    var b = h('div', { class: o.v === cur ? 'on' : '', title: o.title || '' }, [o.icon ? icon(o.icon) : null, o.label]);
    activate(b, function () { var ch = seg.children; for (var i = 0; i < ch.length; i++) ch[i].classList.remove('on'); b.classList.add('on'); onPick(o.v); });
    seg.appendChild(b);
  });
  return seg;
}

/* 结构里没标注册表、但实际是注册表 ID 的字段：按「组件 + 路径」补上，走统一的选择控件（仍可手动输入） */
var STR_REG = { item_model: 'item_model', 'equippable.asset_id': 'equipment_asset', 'equippable.camera_overlay': 'camera_overlay' };
function wStr(sc, val, commit, ctx) {
  if (!sc.reg && !sc.en && !sc.tag) { var rg0 = STR_REG[(CURCID || '') + (ctx && ctx.path ? ctx.path : '')]; if (rg0) { var sc2 = {}; for (var kk0 in sc) sc2[kk0] = sc[kk0]; sc2.reg = rg0; sc = sc2; } }
  if ((sc.en && sc.en.indexOf('light_blue') >= 0 && sc.en.indexOf('magenta') >= 0 && sc.en.indexOf('white') >= 0) || (typeof dyeFieldFor === 'function' && dyeFieldFor(CURCID, ctx && ctx.path))) return wDye(val, commit);
  if (sc.en) {
    /* 候选以游戏里的枚举为准（liveEnumOptions），没到 / 离线才用内置；多于 4 个的可以直接输入（不在列表里的会在问题列表里提示） */
    var opts = liveEnumOptions(CURCID, ctx && ctx.path) || sc.en.map(function (v) { return { v: v, label: v }; });
    if (opts.length <= 4) return wSeg(opts, val, function (v) { commit(v, {}); });
    return combo({ value: val === undefined ? '' : val, options: opts, free: true, placeholder: '选择，或直接输入…', onPick: function (v) { if (v !== '') commit(v, {}); } });
  }
  if (typeof dyeFieldFor === 'function' && dyeFieldFor(CURCID, ctx && ctx.path)) return wDye(val, commit);
  var ropts = sc.reg ? registryOptions(sc.reg) : null;
  var ph = sc.tag ? '#标签，如 #minecraft:logs' : (sc.reg && REG_HINT[sc.reg]) || (sc.reg ? sc.reg + ' ID' : '');
  if (sc.reg && Reg.live()) {
    /* 注册表字段：统一的“名称 · ID  [选择…]”，音效字段用带试听的音效选择窗；手输 ID 在选择窗的搜索框里 */
    if (sc.reg === "sound_event") return kSoundField(val === undefined ? "" : val, function (x) { commit(x, {}); }).el;
    return kRegSelect({ reg: sc.reg, tag: !!sc.tag, value: val === undefined ? "" : String(val), empty: "（未选择）", onChange: function (x) { commit(x, {}); } }).el;
  }
  if (ropts) return combo({ value: val === undefined ? "" : val, options: ropts, free: true, placeholder: ph, onPick: function (v) { commit(v, {}); } });
  var input = h('input', { class: 'ore-field ed-in', type: 'text', value: val === undefined ? '' : val, placeholder: ph || (ctx && ctx.placeholder) || '', spellcheck: 'false' });
  input.addEventListener('input', function () { commit(input.value, { key: 'str' }); });
  return input;
}

/* ---------- 文本组件 ---------- */
var MC_COLORS = [['black', '000000', '黑色'], ['dark_blue', '0000AA', '深蓝'], ['dark_green', '00AA00', '深绿'], ['dark_aqua', '00AAAA', '深青'], ['dark_red', 'AA0000', '深红'], ['dark_purple', 'AA00AA', '深紫'], ['gold', 'FFAA00', '金色'], ['gray', 'AAAAAA', '灰色'], ['dark_gray', '555555', '深灰'], ['blue', '5555FF', '蓝色'], ['green', '55FF55', '绿色'], ['aqua', '55FFFF', '青色'], ['red', 'FF5555', '红色'], ['light_purple', 'FF55FF', '粉紫'], ['yellow', 'FFFF55', '黄色'], ['white', 'FFFFFF', '白色']];
var MC_HEX = {}; MC_COLORS.forEach(function (c) { MC_HEX[c[0]] = '#' + c[1]; });
/* 文本颜色：以游戏里的 enum:text_color（ChatFormatting 的颜色）为准，带 rgb；没到 / 离线用上面内置的 16 色。
   中文名沿用内置表（按 id 对），游戏里多出来的颜色用它自己的名字 */
function mcColors() {
  var l = typeof Reg !== 'undefined' && Reg.live() ? Reg.options('enum:text_color') : null;
  if (!l || !l.length) return MC_COLORS;
  var zh = {}; MC_COLORS.forEach(function (c) { zh[c[0]] = c[2]; });
  var out = [];
  l.forEach(function (e) {
    if (typeof e.rgb !== 'number') return;
    var hex = ('000000' + e.rgb.toString(16)).slice(-6).toUpperCase();
    MC_HEX[e.v] = '#' + hex;
    out.push([e.v, hex, zh[e.v] || e.label || e.v]);
  });
  return out.length ? out : MC_COLORS;
}
var TC_KEYS = { text: 1, color: 1, bold: 1, italic: 1, underlined: 1, strikethrough: 1, obfuscated: 1 };
function tcSimple(v) {
  if (typeof v === 'string') return { text: v };
  if (isObj(v) && typeof v.text === 'string') { for (var k in v) if (!TC_KEYS[k]) return null; return clone(v); }
  return null;
}
function tcPack(o) {
  var keys = Object.keys(o).filter(function (k) { return k !== 'text' && o[k] !== undefined && o[k] !== ''; });
  if (!keys.length) return o.text || '';
  var out = { text: o.text || '' };
  ['color', 'bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '') out[k] = o[k]; });
  return out;
}
function tcHex(c) { if (!c) return null; if (!MC_HEX[c] && /^[a-z_]+$/.test(c)) mcColors(); if (MC_HEX[c]) return MC_HEX[c]; return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null; }
function tcPreview(el, v, fallbackColor) {
  clear(el);
  var o = tcSimple(v);
  if (!o) { el.appendChild(h('span', { class: 'tcp', text: '（复杂文本）' })); return; }
  var s = h('span', { class: 'tcp' + (o.bold ? ' b' : '') + (o.italic ? ' i' : '') + (o.underlined ? ' u' : '') + (o.strikethrough ? ' s' : ''), text: o.obfuscated ? o.text.replace(/./g, '▒') : (o.text || ' ') });
  var hex = tcHex(o.color) || fallbackColor;
  if (hex) s.setAttribute('style', 'color:' + hex);
  el.appendChild(s);
}
function wText(sc, val, commit, ctx) {
  var wrap = h('div', { class: 'ed-tc' });
  var simple = tcSimple(val);
  if (!simple) {
    var ta = h('textarea', { class: 'ore-field ed-raw', rows: '3', spellcheck: 'false' });
    ta.value = toSnbt(val, null, true);
    var err = h('div', { class: 'ed-err' });
    ta.addEventListener('change', function () {
      try { var p = parseSnbtUser(ta.value); err.textContent = ''; commit(p, {}); } catch (e) { err.textContent = '解析失败：' + e.message; }
    });
    wrap.appendChild(h('div', { class: 'ed-hint', text: '这是带 translate / extra / 点击事件等的复杂文本，请直接编辑 SNBT。' }));
    wrap.appendChild(ta); wrap.appendChild(err);
    return wrap;
  }
  var cur = simple;
  var input = h('input', { class: 'ore-field ed-in', type: 'text', value: cur.text, placeholder: ctx && ctx.placeholder || '输入文字', spellcheck: 'false' });
  var prev = h('div', { class: 'ed-tcprev' });
  var rowC = h('div', { class: 'ed-sw' });
  var rowS = h('div', { class: 'ed-tcstyle' });
  function emit(k) { tcPreview(prev, tcPack(cur), ctx && ctx.baseColor); commit(tcPack(cur), { key: k || 'tc' }); }
  input.addEventListener('input', function () { cur.text = input.value; emit('tc-text'); });
  function paintSw() {
    clear(rowC);
    var none = h('div', { class: 'swatch none' + (!cur.color ? ' on' : ''), title: '默认颜色' }, [h('i', { text: '⁄' })]);
    activate(none, function () { delete cur.color; paintSw(); emit('tc-color'); });
    rowC.appendChild(none);
    mcColors().forEach(function (c) {
      var s = h('div', { class: 'swatch' + (cur.color === c[0] ? ' on' : ''), title: c[2], style: 'background:#' + c[1] });
      activate(s, function () { cur.color = c[0]; paintSw(); emit('tc-color'); });
      rowC.appendChild(s);
    });
    var hex = h('input', { class: 'ore-field ed-in ed-hex', type: 'text', value: cur.color && cur.color.charAt(0) === '#' ? cur.color : '', placeholder: '#RRGGBB', maxlength: '7' });
    hex.addEventListener('change', function () { var t = hex.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(t)) { cur.color = t; paintSw(); emit('tc-color'); } else if (t === '') { delete cur.color; paintSw(); emit('tc-color'); } });
    rowC.appendChild(hex);
  }
  function paintStyle() {
    clear(rowS);
    [['bold', 'B', '粗体', 'b'], ['underlined', 'U', '下划线', 'u'], ['strikethrough', 'S', '删除线', 's'], ['obfuscated', '?', '乱码', 'k']].forEach(function (d) {
      var b = h('div', { class: 'ed-sty ' + d[3] + (cur[d[0]] ? ' on' : ''), title: d[2], text: d[1] });
      activate(b, function () { if (cur[d[0]]) delete cur[d[0]]; else cur[d[0]] = true; paintStyle(); emit('tc-style'); });
      rowS.appendChild(b);
    });
    var it = cur.italic === undefined ? '默认' : (cur.italic ? '斜体' : '非斜体');
    var ib = h('div', { class: 'ed-sty i' + (cur.italic !== undefined ? ' on' : ''), title: '斜体：默认 → 开 → 关（自定义名称默认斜体）', text: 'I ' + it });
    activate(ib, function () { if (cur.italic === undefined) cur.italic = true; else if (cur.italic === true) cur.italic = false; else delete cur.italic; paintStyle(); emit('tc-style'); });
    rowS.appendChild(ib);
  }
  paintSw(); paintStyle(); tcPreview(prev, tcPack(cur), ctx && ctx.baseColor);
  if (ctx && ctx.compact) {
    var key = (ctx.openKey || 'tc'), panel = h('div', { class: 'ed-tcpanel' }, [rowC, rowS]);
    var tg = h('div', { class: 'ed-mini wide', text: '样式', title: '颜色与粗体、斜体等' });
    function sync() { panel.style.display = UIOpen[key] ? 'flex' : 'none'; tg.classList.toggle('act', !!UIOpen[key]); }
    activate(tg, function () { UIOpen[key] = !UIOpen[key]; sync(); });
    sync();
    wrap.appendChild(h('div', { class: 'ed-row' }, [input, tg]));
    wrap.appendChild(panel);
    return wrap;
  }
  wrap.appendChild(input); wrap.appendChild(rowC); wrap.appendChild(rowS); wrap.appendChild(prev);
  return wrap;
}

/* ---------- 颜色（RGB 整数） ---------- */
function wColor(sc, val, commit) {
  var wrap = h('div', { class: 'ed-color' });
  var n = typeof val === 'number' ? (val & 0xFFFFFF) : 0xFFFFFF;
  function hex() { var s = n.toString(16).toUpperCase(); while (s.length < 6) s = '0' + s; return '#' + s; }
  var chip = h('div', { class: 'ed-chipcolor', style: 'background:' + hex() });
  var input = h('input', { class: 'ore-field ed-in ed-hex', type: 'text', value: hex(), maxlength: '7' });
  function set(v) { n = v; chip.setAttribute('style', 'background:' + hex()); input.value = hex(); commit(n, { key: 'color' }); }
  input.addEventListener('change', function () { var t = input.value.trim(); if (/^#?[0-9a-fA-F]{6}$/.test(t)) set(parseInt(t.replace('#', ''), 16)); else input.value = hex(); });
  var pal = h('div', { class: 'ed-sw' });
  mcColors().forEach(function (c) { var s = h('div', { class: 'swatch', title: c[2], style: 'background:#' + c[1] }); activate(s, function () { set(parseInt(c[1], 16)); }); pal.appendChild(s); });
  wrap.appendChild(h('div', { class: 'ed-row' }, [chip, input]));
  wrap.appendChild(pal);
  return wrap;
}

/* ---------- 通用结构控件 ---------- */
function wRaw(sc, val, commit) {
  var ta = h('textarea', { class: 'ore-field ed-raw', rows: '4', spellcheck: 'false' });
  ta.value = val === undefined ? '{}' : toSnbt(val, null, true);
  var err = h('div', { class: 'ed-err' });
  ta.addEventListener('change', function () { try { var p = parseSnbtUser(ta.value); err.textContent = ''; ta.classList.remove('bad'); commit(p, {}); } catch (e) { err.textContent = '解析失败：' + e.message; ta.classList.add('bad'); } });
  var box = h('div', { class: 'ed-rawbox' }, [ta, err]);
  if (sc.hint) box.insertBefore(h('div', { class: 'ed-hint', text: '结构较复杂（' + sc.hint + '），暂以 SNBT 编辑。' }), ta);
  return box;
}

function wUnit(sc) { return h('div', { class: 'ed-unit' }, [icon('check'), h('span', { text: sc.d || '存在即生效，无需设置参数' })]); }

function wUnion(sc, val, commit, ctx) {
  if (sc.a.length === 2 && sc.a[0].t === 'int' && sc.a[1].t === 'arr' && sc.a[1].min === 3) return wColor(sc, val, commit);
  if (sc.a.length === 2 && sc.a[0].t === 'str' && sc.a[0].reg === 'sound_event' && sc.a[1].t === 'obj') return wSoundEvent(val, commit);
  if (isHolderSet(sc)) return wHolderSet(sc.a[0].reg, val, commit);
  var alt = pickAlt(sc, val), idx = sc.a.indexOf(alt);
  var box = h('div', { class: 'ed-union' }), body = h('div', { class: 'ed-unionbody' });
  function draw() {
    clear(body);
    body.appendChild(renderNode(sc.a[idx], val, function (v, o) { val = v; commit(v, o); }, ctx));
  }
  if (sc.a.length > 1) {
    var seg = wSeg(sc.a.map(function (a, i) { return { v: i, label: altLabel(a) }; }), idx, function (i) { idx = i; val = defaultFor(sc.a[i]); commit(val, {}); draw(); });
    box.appendChild(seg);
  }
  box.appendChild(body); draw();
  return box;
}

function wDunion(sc, val, commit, ctx) {
  val = isObj(val) ? val : defaultFor(sc);
  var names = Object.keys(sc.br), box = h('div', { class: 'ed-union' }), body = h('div', { class: 'ed-unionbody' });
  function draw() { clear(body); body.appendChild(renderNode(sc.br[val[sc.disc]] || sc.br[names[0]], val, function (v, o) { v[sc.disc] = val[sc.disc]; val = v; commit(val, o); }, ctx)); }
  var seg = wSeg(names.map(function (n) { return { v: n, label: n }; }), val[sc.disc], function (n) { var d = defaultFor(sc.br[n]); if (!isObj(d)) d = {}; d[sc.disc] = n; val = d; commit(val, {}); draw(); });
  box.appendChild(seg); box.appendChild(body); draw();
  return box;
}

/* 字段名一行放下；内部名和说明放进悬停提示，不占版面 */
function fieldLabel(f, ov, quiet) {
  ov = ov || {};
  var full = f.d || f.k, short = ov.label || (f.d ? f.d.split(/[，；;：:（(]/)[0] : f.k) || full, name = short, tip = (ov.hint ? ov.hint + String.fromCharCode(10) : '') + f.k + (f.d && f.d !== f.k && !ov.hint ? String.fromCharCode(10) + f.d : '');
  return h('div', { class: 'fl', title: tip }, [
    h('div', { class: 'fk' }, [name, f.r && !quiet ? h('b', { class: 'req', text: ' *', title: '必填' }) : null]),
  ]);
}
/* 组件专用表单的“排版说明书”：字段顺序、分段标题、中文名、提示、单位、步进。没有说明书的字段照通用方式显示 */
var SPEC_FORMS = {};
/* 紧凑规格表单：默认值可直接编辑；恢复默认是操作，不伪装成开关。 */
function compactField(f, ov, sc, cur, commit, ctx) {
  var has = cur[f.k] !== undefined, value = has ? cur[f.k] : (f.df !== undefined ? clone(f.df) : defaultFor(sc));
  var path = (ctx && ctx.path || '') + '.' + f.k;
  function save(v, op) { cur[f.k] = v; commit(cur, op && op.key ? { key: path } : {}); }
  var box = h('div', { class: 'compact-field' });
  function redraw() { if (box.parentNode != null) box.parentNode.replaceChild(compactField(f, ov, sc, cur, commit, ctx), box); }
  function reset() { delete cur[f.k]; commit(cur, {}); redraw(); }
  function resetBtn() { return f.r ? h('div', { class: 'compact-reset-space' }) : kBtn('', reset, { icon: 'refresh', cls: 'compact-reset' + (has ? '' : ' dim'), title: '恢复此项默认值' }); }
  if (sc.t === 'num' || sc.t === 'int') {
    var row = h('div', { class: 'compact-row' }, [fieldLabel(f, ov, true)]);
    var controls = h('div', { class: 'compact-controls' });
    controls.appendChild(kNumber(value, { min: sc.min, max: sc.max, step: ov.step || (sc.t === 'int' ? 1 : 0.1), noSlider: true, onChange: function (v) { save(v, { key: path }); has = true; rst.classList.remove('dim'); } }).el);
    controls.appendChild(h('span', { class: 'compact-unit', text: ov.unit || '' }));
    var rst = resetBtn(); controls.appendChild(rst); row.appendChild(controls); box.appendChild(row); return box;
  }
  if (sc.t === 'obj' && ov.flatten) {
    box.setAttribute('data-tip', '');
    box.appendChild(renderNode(sc, value, save, { path: path, spec: ov.spec })); return box;
  }
  if (sc.t === 'arr' && ov.flatList) {
    box.appendChild(wArr(sc, value, save, { path: path, compId: ctx && ctx.compId, itemSpec: ov.itemSpec, itemSummary: ov.itemSummary, flatList: true, listLabel: ov.label || f.k })); return box;
  }
  if (isHolderSet(sc)) {
    var reg = sc.a[0].reg, selected = has ? cur[f.k] : undefined;
    var label = selected === undefined ? (ov.dtxt || '未设置') : (Array.isArray(selected) ? selected.length + ' 种伤害' : String(selected));
    var ctl = h('div', { class: 'compact-set-controls' });
    var chosen = h('span', { class: 'compact-set-value', text: label, 'data-tip': label });
    ctl.appendChild(chosen);
    ctl.appendChild(kBtn('选择…', function () {
      openTagPicker({ title: '选择伤害类型或标签', tagsReg: reg, entryReg: reg, multi: true, onConfirm: function (ids) {
        if (!ids.length) return;
        var tags = ids.filter(function (id) { return id.charAt(0) === '#'; });
        if (tags.length && ids.length > 1) { toast('一个标签和多个伤害类型不能混用，请重新选择', 'warn'); return; }
        save(tags.length ? tags[0] : ids); redraw();
      } });
    }));
    if (has) ctl.appendChild(resetBtn());
    box.appendChild(h('div', { class: 'compact-row' }, [fieldLabel(f, ov, true), ctl])); return box;
  }
  return null;
}
function wObj(sc, val, commit, ctx) {
  var cur = isObj(val) ? val : defaultFor(sc);
  var box = h("div", { class: "ed-obj" }), spec = ctx && ctx.spec;
  function entries() {
    if (!spec || !spec.order) return sc.f.map(function (x) { return { f: x }; });
    var out = [], used = {};
    spec.order.forEach(function (e) {
      if (typeof e === "string") { for (var n = 0; n < sc.f.length; n++) if (sc.f[n].k === e) { out.push({ f: sc.f[n] }); used[e] = 1; } }
      else out.push({ sec: e.sec });
    });
    var rest = sc.f.filter(function (x) { return !used[x.k]; });
    if (rest.length && !spec.only) { out.push({ sec: "其他" }); rest.forEach(function (x) { out.push({ f: x }); }); }
    return out;
  }
  function draw() {
    clear(box);
    entries().forEach(function (en) {
      if (en.sec) { box.appendChild(h("div", { class: "k-sech", text: en.sec })); return; }
      var f = en.f, ov = (spec && spec.over && spec.over[f.k]) || {}, fs2 = f.s;
      if (fs2 && (ov.min !== undefined || ov.max !== undefined)) { fs2 = {}; for (var kk in f.s) fs2[kk] = f.s[kk]; if (ov.min !== undefined) fs2.min = ov.min; if (ov.max !== undefined) fs2.max = ov.max; }
      if (spec && spec.compact) { var compact = compactField(f, ov, fs2, cur, commit, ctx); if (compact != null) { box.appendChild(compact); return; } }
      if (isSoundUnion(fs2)) {
        var lbl0 = ov.label || (f.d ? f.d.split(/[，；;：:（(]/)[0] : f.k);
        box.appendChild(soundUnionRow(lbl0, ov.hint, cur[f.k], function (v) { if (v === undefined) delete cur[f.k]; else cur[f.k] = v; commit(cur, {}); }));
        return;
      }
      var isSub = !!(fs2 && ((fs2.t === "obj" && fs2.f && fs2.f.length) || (fs2.t === "union" && fs2.a && fs2.a[0] && fs2.a[0].reg === "sound_event") || (fs2.t === "arr" && fs2.i && fs2.i.t === "obj") || isHolderSet(fs2))), subNode = null;
      var row = h("div", { class: "fld" + (isSub ? " sub" : "") }), has = cur[f.k] !== undefined;
      var lab0 = fieldLabel(f, ov); row.appendChild(lab0);
      if (isSub && fs2.t === "obj" && ov.hint) lab0.appendChild(h("div", { class: "fh", text: ov.hint }));
      var ctl = h("div", { class: "fc" });
      var unitEl = ov.unit ? h("span", { class: "fu", text: ov.unit }) : (spec && fs2 && fs2.t === "num" ? h("span", { class: "fu", text: " " }) : null);
      /* 每行同一个版式：左边字段名，右边取值（+单位），最右一列是“启用”开关（必填字段没有开关，留空位）。没启用时取值处只显示默认值 */
      if (fs2 && fs2.t === "bool") {
        var bon = has ? !!cur[f.k] : !!f.df;
        var btg = kToggle(bon, function (v) { cur[f.k] = v; commit(cur, {}); draw(); }, "");
        ctl.appendChild(h("div", { class: "ed-unset" }, has ? [] : [h("span", { class: "dv", text: "默认 " + (f.df ? "开" : "关") })]));
        ctl.appendChild(h("div", { class: "ed-sw" }, [btg.el]));
        row.appendChild(ctl); box.appendChild(row); return;
      }
      var sw = null;
      if (!f.r) {
        sw = kToggle(has, function (on) {
          if (on) cur[f.k] = f.df !== undefined ? clone(f.df) : defaultFor(f.s); else delete cur[f.k];
          commit(cur, {}); draw();
        }, "");
        row.classList.add("opt");
      }
      if (!has && !f.r) {
        var dtxt = ov.dtxt || (f.df !== undefined ? "默认 " + (Array.isArray(f.df) ? f.df.length + " 项" : isObj(f.df) ? "一组预设" : String(f.df) + (ov.unit ? " " + ov.unit : "")) : "未设置");
        ctl.appendChild(h("div", { class: "ed-unset", title: f.df !== undefined && (isObj(f.df) || Array.isArray(f.df)) ? toSnbt(f.df, null, false) : "" }, [h("span", { class: "dv", text: dtxt })]));
      } else {
        if (!has) cur[f.k] = f.df !== undefined ? clone(f.df) : defaultFor(f.s);
        var sub = { path: (ctx && ctx.path || "") + "." + f.k, step: ov.step, spec: ov.spec, itemSpec: ov.itemSpec, itemSummary: ov.itemSummary };
        var node = renderNode(fs2, cur[f.k], function (v, o) { cur[f.k] = v; commit(cur, o && o.key ? { key: (ctx && ctx.path || "") + "." + f.k } : o); }, sub);
        if (isSub) subNode = node; else { ctl.appendChild(node); if (unitEl) ctl.appendChild(unitEl); }
      }
      ctl.appendChild(sw ? h("div", { class: "ed-sw" }, [sw.el]) : h("div", { class: "ed-sw" }));
      row.appendChild(ctl);
      if (isSub && fs2.t === "obj") { var blk = h("div", { class: "sub-block" + (subNode ? " on" : "") }, [row]); if (subNode) blk.appendChild(h("div", { class: "sb-b" }, [subNode])); box.appendChild(blk); return; }
      box.appendChild(row);
      /* 嵌套的对象：字段名自成一行（标题 + 开关），子字段整行展开在下面，缩进 + 引导线 */
      if (subNode) box.appendChild(h("div", { class: "ed-subbody" }, [subNode]));
    });
  }
  draw();
  return box;
}

/* 列表项是对象，且里面有一个必填的“注册表 ID”字段（效果 ID、旗帜图案……）：添加时用多选窗一次选多个 */
function keyRegField(it) {
  if (it && it.t === 'str' && it.reg && !it.tag && !it.en && it.reg !== 'sound_event') return { k: null, reg: it.reg };
  if (!it || it.t !== 'obj' || !it.f) return null;
  for (var i = 0; i < it.f.length; i++) { var x = it.f[i]; if (x.r && x.s && x.s.t === 'str' && x.s.reg && !x.s.tag && !x.s.en && x.s.reg !== 'sound_event') return { k: x.k, reg: x.s.reg }; }
  return null;
}
function wArr(sc, val, commit, ctx) {
  var cur = Array.isArray(val) ? val : [];
  var flat = !!(ctx && ctx.flatList);
  var box = h('div', { class: 'ed-arr' + (flat ? ' flat-rules' : '') }), list = h('div', { class: 'ed-list' });
  var path = (ctx && ctx.path || '') + '[]';
  var complex = sc.i.t === 'obj' || sc.i.t === 'map' || sc.i.t === 'dunion' || sc.i.t === 'union' || sc.i.t === 'raw' || sc.i.t === 'nbt' || sc.i.t === 'stack';
  function draw() {
    clear(list);
    if (flat) count.textContent = ctx.listLabel + ' · ' + cur.length;
    cur.forEach(function (item, i) {
      var okey = path + i;
      var node = renderNode(sc.i, item, function (v, o) { cur[i] = v; commit(cur, o && o.key ? { key: path + i } : o); }, { path: path + i, spec: ctx && ctx.itemSpec });
      var tools = h('div', { class: 'ed-it-tools' });
      if (i > 0) { var up = h('div', { class: 'ed-mini', text: '↑', title: '上移' }); activate(up, function () { var t = cur[i - 1]; cur[i - 1] = cur[i]; cur[i] = t; commit(cur, {}); draw(); }); tools.appendChild(up); }
      if (i < cur.length - 1) { var dn = h('div', { class: 'ed-mini', text: '↓', title: '下移' }); activate(dn, function () { var t = cur[i + 1]; cur[i + 1] = cur[i]; cur[i] = t; commit(cur, {}); draw(); }); tools.appendChild(dn); }
      var rm = h('div', { class: 'ed-mini del', text: '×', title: '删除此项' }); activate(rm, function () { cur.splice(i, 1); commit(cur, {}); draw(); });
      tools.appendChild(rm);
      var row;
      if (complex) {
        var openKey = (ctx && ctx.compId || '') + path + i;
        var isOpen = UIOpen[openKey] !== false;
        row = h('div', { class: 'ed-card' + (isOpen ? ' open' : '') });
        var summary = ctx && ctx.itemSummary ? ctx.itemSummary(item, i) : summarize(sc.i, item);
        var head = h('div', { class: 'ed-card-h', 'data-tip': summary }, [h('span', { class: 'ix', text: (flat ? '规则 ' : '#') + (i + 1) }), h('span', { class: 'sm', text: flat ? '' : summary }), tools]);
        head.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.ed-it-tools') != null) return; UIOpen[openKey] = !(UIOpen[openKey] !== false); row.classList.toggle('open'); });
        row.appendChild(head); row.appendChild(h('div', { class: 'ed-card-b' }, [node]));
      } else {
        row = h('div', { class: 'ed-itrow' }, [h('span', { class: 'ix', text: String(i + 1) }), h('div', { class: 'grow' }, [node]), tools]);
      }
      list.appendChild(row);
    });
    if (!cur.length) list.appendChild(h('div', { class: 'ed-empty', text: '空列表' }));
  }
  var keyF = keyRegField(sc.i);
  var add = h('div', { class: 'ed-addbtn' }, [icon('plus'), keyF ? '添加（可多选）' : '添加']);
  var atMax = function () { return sc.max !== undefined && cur.length >= sc.max; };
  function pushMany(ids, vals) {
    ids.forEach(function (id) {
      if (atMax()) return;
      if (!keyF.k) { cur.push(id); return; }
      var it = defaultFor(sc.i); it[keyF.k] = id;
      var hasAmp = sc.i.f.some(function (x) { return x.k === 'amplifier'; }), hasDur = sc.i.f.some(function (x) { return x.k === 'duration'; }), v = (vals && vals[id]) || {};
      if (hasAmp && v.level) it.amplifier = Math.max(0, v.level - 1);
      if (hasDur && v.seconds) it.duration = Math.max(1, Math.round(v.seconds * 20));
      cur.push(it);
    });
    commit(cur, {}); draw();
  }
  activate(add, function () {
    if (atMax()) return;
    if (!keyF) { cur.push(defaultFor(sc.i)); commit(cur, {}); draw(); return; }
    var present = {}; cur.forEach(function (x) { var xv = keyF.k ? (x && x[keyF.k]) : x; if (xv) present[Reg.full(String(xv))] = 1; });
    if (keyF.reg === 'mob_effect') {
      var hasAmp2 = !!keyF.k && sc.i.f.some(function (x) { return x.k === 'amplifier'; }), hasDur2 = !!keyF.k && sc.i.f.some(function (x) { return x.k === 'duration'; });
      openEffectPicker({ present: present, full: hasAmp2, noParams: !hasDur2 && !hasAmp2, onConfirm: pushMany });
    } else openRegPick({ reg: keyF.reg, multi: true, locked: present, title: '添加（可多选）', onPickMany: function (ids) { pushMany(ids); } });
  });
  var count;
  if (flat) { count = h('span', { class: 'flat-rules-title' }); box.appendChild(h('div', { class: 'flat-rules-head' }, [count, add])); }
  box.appendChild(list); if (!flat) box.appendChild(add); draw();
  return box;
}

function wMap(sc, val, commit, ctx) {
  var cur = isObj(val) ? val : {};
  var box = h('div', { class: 'ed-map' }), list = h('div', { class: 'ed-list' });
  var ropts = sc.k && sc.k.reg ? registryOptions(sc.k.reg) : null;
  function draw() {
    clear(list);
    Object.keys(cur).forEach(function (k) {
      var kin = h('input', { class: 'ore-field ed-in ed-key', type: 'text', value: k, spellcheck: 'false' });
      kin.addEventListener('change', function () { var nk = kin.value.trim(); if (!nk || nk === k) { kin.value = k; return; } var nv = {}; Object.keys(cur).forEach(function (x) { nv[x === k ? nk : x] = cur[x]; }); cur = nv; commit(cur, {}); draw(); });
      var node = renderNode(sc.v, cur[k], function (v, o) { cur[k] = v; commit(cur, o && o.key ? { key: (ctx && ctx.path || '') + '{' + k + '}' } : o); }, { path: (ctx && ctx.path || '') + '{' + k + '}' });
      var rm = h('div', { class: 'ed-mini del', text: '×', title: '删除' }); activate(rm, function () { delete cur[k]; commit(cur, {}); draw(); });
      list.appendChild(h('div', { class: 'ed-itrow' }, [kin, h('div', { class: 'grow' }, [node]), rm]));
    });
    if (!Object.keys(cur).length) list.appendChild(h('div', { class: 'ed-empty', text: '空' }));
  }
  var addIn = ropts
    ? combo({ value: '', options: ropts, free: true, placeholder: '添加键…', onPick: function (v) { if (v && cur[v] === undefined) { cur[v] = defaultFor(sc.v); commit(cur, {}); draw(); } } })
    : (function () { var i = h('input', { class: 'ore-field ed-in', type: 'text', placeholder: '新键名，回车添加' }); onKey(i, { Enter: function () { var v = i.value.trim(); if (v && cur[v] === undefined) { cur[v] = defaultFor(sc.v); i.value = ''; commit(cur, {}); draw(); } } }); return i; })();
  box.appendChild(list); box.appendChild(h('div', { class: 'ed-addrow' }, [icon('plus'), addIn])); draw();
  return box;
}

function renderNode(sc, val, commit, ctx) {
  if (!sc) return wRaw({ t: 'raw' }, val, commit);
  switch (sc.t) {
    case 'bool': return wBool(sc, val, commit);
    case 'int': case 'num': return wNum(sc, val, commit, ctx);
    case 'str': return wStr(sc, val, commit, ctx);
    case 'text': return wText(sc, val, commit, ctx);
    case 'obj': return wObj(sc, val, commit, ctx);
    case 'arr': return wArr(sc, val, commit, ctx);
    case 'map': return wMap(sc, val, commit, ctx);
    case 'union': return wUnion(sc, val, commit, ctx);
    case 'dunion': return wDunion(sc, val, commit, ctx);
    case 'unit': return wUnit(sc);
    default: return wRaw(sc, val, commit);
  }
}

/* ---------- 专用控件 ---------- */
function wEnchants(c, val, commit, ctx) {
  var cur = isObj(val) ? val : {};
  var d = ctx.doc;
  var box = h('div', { class: 'ed-ench' }), list = h('div', { class: 'ed-list' });
  function conflicts(id) {
    var out = [], e = ENIDX[id]; if (!e) return out;
    Object.keys(cur).forEach(function (k) { var o = shortId(k); if (o !== id && (e.excl.indexOf(o) >= 0)) out.push(ENIDX[o] ? ENIDX[o].name : o); });
    return out;
  }
  function draw() {
    clear(list);
    Object.keys(cur).forEach(function (k) {
      var id = shortId(k), e = ENIDX[id], lv = cur[k];
      var warn = [];
      if (!e) warn.push('未知附魔');
      else {
        if (lv > e.max) warn.push('超过自然上限 ' + e.max);
        var cf = conflicts(id); if (cf.length) warn.push('与 ' + cf.join('、') + ' 互斥');
      }
      var num = wNum({ t: 'int', min: 1, max: 255 }, lv, function (v) { cur[k] = v; commit(cur, { key: 'ench-' + id }); rom.textContent = roman(v); }, { key: 'ench-' + id });
      var rom = h('span', { class: 'rom', text: roman(lv) });
      var rm = h('div', { class: 'ed-mini del', text: '×', title: '移除此附魔' }); activate(rm, function () { delete cur[k]; commit(cur, {}); draw(); });
      var row = h('div', { class: 'ed-enrow' + (warn.length ? ' warn' : '') }, [
        icon('enchant'),
        h('div', { class: 'nm' }, [h('div', { class: 'z', text: e ? e.name : id }), h('div', { class: 'id', text: 'minecraft:' + id + (e ? ' · 自然上限 ' + e.max : '') })]),
        num, rom, rm,
      ]);
      if (warn.length) row.appendChild(h('div', { class: 'ed-warnline', text: '⚠ ' + warn.join('；') }));
      list.appendChild(row);
    });
    if (!Object.keys(cur).length) list.appendChild(h('div', { class: 'ed-empty', text: '没有附魔' }));
  }
  var opts = EDATA.enchants.map(function (e) { return { v: e.id, label: e.name, sub: e.id + ' · 最高 ' + e.max + (e.items.indexOf(shortId(d.id)) >= 0 ? ' · 适用' : '') }; });
  var addIn = combo({ value: '', options: opts, free: false, placeholder: '搜索并添加附魔…', onPick: function (id) { var key = 'minecraft:' + id; if (ENIDX[id] && cur[key] === undefined) { cur[key] = 1; commit(cur, {}); draw(); } } });
  var tools = h('div', { class: 'ed-row wrap' });
  var maxb = h('div', { class: 'ed-mini wide', text: '全部设为自然上限' });
  activate(maxb, function () { Object.keys(cur).forEach(function (k) { var e = ENIDX[shortId(k)]; if (e) cur[k] = e.max; }); commit(cur, {}); draw(); });
  var clr = h('div', { class: 'ed-mini wide del', text: '清空' });
  activate(clr, function () { cur = {}; commit(cur, {}); draw(); });
  var apl = h('div', { class: 'ed-mini wide', text: '添加全部适用附魔' });
  activate(apl, function () { var sid = shortId(d.id); EDATA.enchants.forEach(function (e) { var key = 'minecraft:' + e.id; if (e.items.indexOf(sid) >= 0 && cur[key] === undefined && conflicts(e.id).length === 0 && !e.excl.some(function (x) { return cur['minecraft:' + x] !== undefined; })) cur[key] = e.max; }); commit(cur, {}); draw(); });
  tools.appendChild(maxb); tools.appendChild(apl); tools.appendChild(clr);
  box.appendChild(list); box.appendChild(h('div', { class: 'ed-addrow' }, [icon('plus'), addIn])); box.appendChild(tools); draw();
  return box;
}

var OPS = Labels.opShort;
var SLOTS = ['any', 'mainhand', 'offhand', 'hand', 'head', 'chest', 'legs', 'feet', 'armor', 'body', 'saddle'];
var SLOT_ZH = Labels.slot;
function wAttrMods(c, val, commit, ctx) {
  var cur = Array.isArray(val) ? val : [];
  var box = h('div', { class: 'ed-attrs' }), list = h('div', { class: 'ed-list' });
  function draw() {
    clear(list);
    cur.forEach(function (m, i) {
      var id = shortId(m.type || ''), a = ATIDX[id];
      var openKey = 'attr' + i, isOpen = UIOpen[openKey] !== false;
      var rm = h('div', { class: 'ed-mini del', text: '×', title: '删除此修饰器' }); activate(rm, function () { cur.splice(i, 1); commit(cur, {}); draw(); });
      var amt = typeof m.amount === 'number' ? m.amount : 0;
      var sumTxt = (m.operation === 'add_value' ? (amt >= 0 ? '+' : '') + fmtNum(amt) : (amt >= 0 ? '+' : '') + fmtNum(amt * 100) + '%') + ' · ' + (SLOT_ZH[m.slot || 'any'] || m.slot);
      var card = h('div', { class: 'ed-card' + (isOpen ? ' open' : '') });
      var head = h('div', { class: 'ed-card-h' }, [icon('sliders'), h('span', { class: 'ttl', text: a ? a.name : (id || '（未选择属性）') }), h('span', { class: 'sm', text: sumTxt }), h('div', { class: 'ed-it-tools' }, [rm])]);
      head.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.ed-it-tools')) return; UIOpen[openKey] = !(UIOpen[openKey] !== false); card.classList.toggle('open'); });
      var body = h('div', { class: 'ed-card-b' });
      function fld(label, note, ctl) { return h('div', { class: 'fld' }, [h('div', { class: 'fl' }, [h('div', { class: 'fk', text: label }), note ? h('div', { class: 'fn', text: note }) : null]), h('div', { class: 'fc' }, [ctl])]); }
      body.appendChild(fld('属性', 'type', combo({ value: m.type || '', options: registryOptions('attribute'), free: true, placeholder: '选择属性…', onPick: function (v) { m.type = v; commit(cur, {}); draw(); } })));
      body.appendChild(fld('数值', a ? '范围 ' + a.min + ' ~ ' + a.max + '，基础 ' + a.def : 'amount', wNum({ t: 'num' }, m.amount, function (v) { m.amount = v; commit(cur, { key: 'attr-amt-' + i }); }, { key: 'attr-amt-' + i, step: m.operation === 'add_value' ? 0.5 : 0.05 })));
      body.appendChild(fld('运算', 'operation', wSeg(OPS, m.operation || 'add_value', function (v) { m.operation = v; commit(cur, {}); draw(); })));
      body.appendChild(fld('生效槽位', 'slot', wStr({ t: 'str', en: SLOTS }, m.slot || 'any', function (v) { m.slot = v; commit(cur, {}); draw(); })));
      body.appendChild(fld('修饰器 ID', 'id · 同槽同 ID 不叠加', wStr({ t: 'str' }, m.id || '', function (v) { m.id = v; commit(cur, { key: 'attr-id-' + i }); })));
      card.appendChild(head); card.appendChild(body); list.appendChild(card);
    });
    if (!cur.length) list.appendChild(h('div', { class: 'ed-empty', text: '没有属性修饰器（空列表会清除原型自带的修饰器）' }));
  }
  var addIn = combo({ value: '', options: registryOptions('attribute'), free: false, placeholder: '搜索属性并添加…', onPick: function (v) { cur.push({ type: v, id: 'cadeditor:' + shortId(v) + '_' + (cur.length + 1), amount: 1, operation: 'add_value', slot: 'mainhand' }); commit(cur, {}); draw(); } });
  box.appendChild(list); box.appendChild(h('div', { class: 'ed-addrow' }, [icon('plus'), addIn])); draw();
  return box;
}

var RARITY = Labels.rarity;
function wRarity(c, val, commit) { return wSeg(RARITY, val, function (v) { commit(v, {}); }, 'rarity'); }

function wDamage(c, val, commit, ctx) {
  var eff = effectiveComps(ctx.doc), maxd = eff.max_damage;
  var box = h('div', { class: 'ed-dmg' });
  var bar = h('div', { class: 'o-meter' }, [h('i', {})]), txt = h('div', { class: 'ed-hint' });
  function paint(v) {
    var ratio = typeof maxd === 'number' && maxd > 0 ? Math.max(0, Math.min(1, 1 - v / maxd)) : 1;
    bar.setAttribute('style', '--value:' + ratio);
    txt.textContent = typeof maxd === 'number' ? '剩余耐久 ' + Math.max(0, maxd - v) + ' / ' + maxd : '此物品没有最大耐久，损耗值不会产生效果';
  }
  box.appendChild(wNum({ t: 'int', min: 0, max: 2147483647 }, val, function (v) { paint(v); commit(v, { key: 'damage' }); }, { key: 'damage', step: 1 }));
  box.appendChild(bar); box.appendChild(txt); paint(val || 0);
  return box;
}

function wLore(c, val, commit) {
  var cur = Array.isArray(val) ? val : [];
  var box = h('div', { class: 'ed-lore' }), list = h('div', { class: 'ed-list' });
  function draw() {
    clear(list);
    cur.forEach(function (line, i) {
      var node = wText({ t: 'text' }, line, function (v, o) { cur[i] = v; commit(cur, { key: 'lore' + i }); }, { placeholder: '第 ' + (i + 1) + ' 行说明', compact: true, openKey: 'lore-style-' + i });
      var tools = h('div', { class: 'ed-it-tools' });
      if (i > 0) { var up = h('div', { class: 'ed-mini', text: '↑' }); activate(up, function () { var t = cur[i - 1]; cur[i - 1] = cur[i]; cur[i] = t; commit(cur, {}); draw(); }); tools.appendChild(up); }
      if (i < cur.length - 1) { var dn = h('div', { class: 'ed-mini', text: '↓' }); activate(dn, function () { var t = cur[i + 1]; cur[i + 1] = cur[i]; cur[i] = t; commit(cur, {}); draw(); }); tools.appendChild(dn); }
      var rm = h('div', { class: 'ed-mini del', text: '×' }); activate(rm, function () { cur.splice(i, 1); commit(cur, {}); draw(); }); tools.appendChild(rm);
      list.appendChild(h('div', { class: 'ed-itrow top' }, [h('span', { class: 'ix', text: String(i + 1) }), h('div', { class: 'grow' }, [node]), tools]));
    });
    if (!cur.length) list.appendChild(h('div', { class: 'ed-empty', text: '没有说明行' }));
  }
  var add = h('div', { class: 'ed-addbtn' }, [icon('plus'), '添加一行（最多 256 行）']);
  activate(add, function () { if (cur.length >= 256) return; cur.push({ text: '', color: 'dark_purple', italic: false }); commit(cur, {}); draw(); });
  box.appendChild(list); box.appendChild(add); draw();
  return box;
}

var COMP_WIDGETS = {
  enchantments: wEnchants, stored_enchantments: wEnchants,
  attribute_modifiers: wAttrMods, rarity: wRarity, damage: wDamage, lore: wLore,
  custom_name: function (c, v, cm) { return wText({ t: 'text' }, v, cm, { placeholder: '自定义名称' }); },
  item_name: function (c, v, cm) { return wText({ t: 'text' }, v, cm, { placeholder: '基础名称' }); },
};

/* 一个组件的完整表单 */
var CURCID = null;
function renderComponentForm(cid, val, commit, doc) {
  CURCID = cid;
  var c = CIDX[cid];
  if (!c) return wRaw({ t: 'raw' }, val, commit);
  var sw = COMP_WIDGETS[cid];
  if (sw) return sw(c, val, commit, { doc: doc, compId: cid });
  return renderNode(c.schema, val, commit, { compId: cid, path: '', spec: SPEC_FORMS[cid] });
}

/* 染料颜色：16 个色块直接点（颜色值来自游戏的 dye_color 枚举，离线时用内置色值） */
var DYE_COMPS = { base_color: 1, dye: 1, 'shulker/color': 1, 'sheep/color': 1, 'wolf/collar': 1, 'cat/collar': 1, 'tropical_fish/base_color': 1, 'tropical_fish/pattern_color': 1 };
function dyeFieldFor(cid, path) {
  if (cid && DYE_COMPS[cid] && !path) return true;
  if (cid === 'banner_patterns' && path && /[.]color$/.test(path)) return true;
  return false;
}
function dyeList() {
  var live = Reg.options('enum:dye_color');
  if (live) return live.map(function (e) { return { v: shortId(e.v), label: optLabel(e), rgb: typeof e.rgb === 'number' ? e.rgb : DYE_RGB[shortId(e.v)] }; });
  return Object.keys(DYE_RGB).map(function (k) { return { v: k, label: k, rgb: DYE_RGB[k] }; });
}
/* 染料颜色按钮：色块 + 颜色名，点开才出 16 个色块 */
function dyeButton(val, onPick) {
  var cur = shortId(String(val === undefined ? '' : val)), info = dyeList().filter(function (d) { return d.v === cur; })[0] || { v: cur, label: cur, rgb: 0 };
  var chip = h('i', { class: 'dye-chip', style: 'background:#' + ('000000' + (info.rgb || 0).toString(16)).slice(-6) });
  var btn = kBtn((typeof EDATA !== 'undefined' && EDATA.L && EDATA.L.color && EDATA.L.color[cur]) || info.label, function () {
    kPopover(btn, h('div', { class: 'world-color-pop' }, [wDye(cur, function (x) { kPopClose(); onPick(x); })]), { width: 250, maxHeight: 120 });
  });
  btn.insertBefore(chip, btn.firstChild); return btn;
}
function wDye(val, commit) {
  var cur = shortId(String(val === undefined ? '' : val)), box = h('div', { class: 'ed-dyes' });
  dyeList().forEach(function (d) {
    var sw = h('div', { class: 'ed-dye' + (d.v === cur ? ' on' : ''), title: d.label + ' (' + d.v + ')', style: 'background:#' + ('000000' + (d.rgb || 0).toString(16)).slice(-6) });
    activate(sw, function () { Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('on'); }); sw.classList.add('on'); commit(d.v, {}); });
    box.appendChild(sw);
  });
  return box;
}

/* 音效：简单写法是一个声音 ID；带“固定传播范围”时是 {sound_id, range} 对象。统一成：声音选择（带试听）+ 可选的范围 */
function wSoundEvent(val, commit) { return soundUnionRow('声音', '', val, function (v) { commit(v === undefined ? '' : v, {}); }); }

/* “单个条目 / #标签 / 条目列表” 三合一（游戏里叫 HolderSet）：用一个标签芯片区代替 ID | 标签# | 列表 的切换。
   规则（游戏数据格式决定）：要么一个 #标签，要么若干条目，不能混用 —— 选了标签就清掉条目，反过来也一样 */
function isHolderSet(sc) { return !!(sc && sc.t === "union" && sc.a && sc.a.length === 3 && sc.a[0].t === "str" && sc.a[0].reg && sc.a[1].tag && sc.a[2].t === "arr"); }
function wHolderSet(reg, val, commit) {
  var list = typeof val === "string" ? [val] : (Array.isArray(val) ? val.slice() : []);
  var box = h("div", { class: "ed-hs" }), chips = h("div", { class: "k-chips" });
  function save() {
    var v = list.length === 1 ? list[0] : list.slice();
    val = v; commit(v, {});
  }
  function draw() {
    clear(chips);
    list.forEach(function (id, i) {
      var isTag = id.charAt(0) === "#", e = isTag ? null : { v: id };
      var label = isTag ? id : refName(reg, { v: Reg.full(id), label: (Reg.options(reg) || []).filter(function (x) { return x.v === Reg.full(id); }).map(function (x) { return x.label; })[0] });
      var c = h("div", { class: "k-chip on", title: id }, [isTag ? uiIcon("tag", 12) : refIcon(reg, id), label]);
      var x = h("span", { class: "x", text: " ×" }); x.addEventListener("click", function (ev) { ev.stopPropagation(); list.splice(i, 1); save(); draw(); });
      c.appendChild(x); chips.appendChild(c);
    });
    var add = h("div", { class: "k-chip" }, [uiIcon("plus", 12), list.length ? "再加" : "添加"]);
    activate(add, function () {
      openTagPicker({ title: "选择条目或标签", tagsReg: reg, entryReg: reg, multi: true, entryIcon: function (e) { return refIcon(reg, e.v); }, onConfirm: function (ids) {
        var tags = ids.filter(function (x) { return x.charAt(0) === "#"; }), ents = ids.filter(function (x) { return x.charAt(0) !== "#"; });
        if (tags.length) { if (ents.length || tags.length > 1 || list.length) toast("游戏数据格式里，这里要么一个标签、要么若干条目，不能混用。已改为只用标签 " + tags[0], "warn"); list = [tags[0]]; }
        else { if (list.length && list[0].charAt(0) === "#") list = []; ents.forEach(function (x) { if (list.indexOf(x) < 0) list.push(x); }); }
        save(); draw();
      } });
    });
    chips.appendChild(add);
    if (!list.length) chips.insertBefore(h("span", { class: "k-sub", text: "（空）  " }), chips.firstChild);
  }
  draw(); box.appendChild(chips);
  return box;
}

/* 声音（单个声音 ID，或 {sound_id, range}）：范围入口与声音同排，展开后用紧凑行编辑。 */
function isSoundUnion(s) { return !!(s && s.t === "union" && s.a && s.a[0] && s.a[0].reg === "sound_event"); }
function soundUnionRow(label, hint, val, set) {
  var box = h("div", { class: "snd-u" }), id = "", range, extra = {}, rangeOpen = false;
  if (isObj(val)) { id = val.sound_id || ""; range = typeof val.range === "number" ? val.range : undefined; Object.keys(val).forEach(function (k) { if (k !== "sound_id" && k !== "range") extra[k] = val[k]; }); }
  else if (typeof val === "string") id = val;
  function out() { if (!id) return undefined; var hasX = Object.keys(extra).length > 0; if (range === undefined && !hasX) return id; var o = { sound_id: id }; if (range !== undefined) o.range = range; Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function put() { set(out()); }
  function draw() {
    clear(box);
    var snd = kSoundField(id, function (x) { id = x; put(); draw(); });
    var row = fieldRow(label, snd.el, hint);
    var rangeBtn;
    function rangeCaption() { return range === undefined ? "范围" : fmtNum(range) + " 格"; }
    if (id) {
      var pr = row.querySelector(".pr-r");
      var choose = pr != null ? pr.querySelector(".k-btn") : null;
      if (choose != null) choose.setAttribute("title", "选择声音");
      rangeBtn = kBtn(rangeCaption(), function () { rangeOpen = !rangeOpen; draw(); });
      rangeBtn.classList.add("snd-range-btn");
      rangeBtn.setAttribute("data-tip", "传播范围：" + (range === undefined ? "自动" : fmtNum(range) + " 格"));
      rangeBtn.setAttribute("aria-expanded", String(rangeOpen));
      var clr = h("div", { class: "k-mini del", text: "×", title: "清除这个声音" });
      activate(clr, function () { id = ""; range = undefined; extra = {}; rangeOpen = false; put(); draw(); });
      if (pr != null) { pr.appendChild(rangeBtn); pr.appendChild(clr); }
    }
    box.appendChild(row);
    if (id && rangeOpen) {
      var r = h("div", { class: "snd-range", title: "传播范围" });
      var controls = h("div", { class: "snd-range-controls" });
      controls.appendChild(kSeg([{ v: "auto", label: "自动" }, { v: "fixed", label: "固定" }], range === undefined ? "auto" : "fixed", function (v) { if ((v === "auto") === (range === undefined)) return; range = v === "auto" ? undefined : 16; put(); draw(); }).el);
      if (range !== undefined) controls.appendChild(kNumber(range, { step: 1, dec: 3, noSlider: true, unit: "格", onChange: function (v) { range = v; rangeBtn.textContent = rangeCaption(); rangeBtn.setAttribute("data-tip", "传播范围：" + fmtNum(range) + " 格"); put(); } }).el);
      r.appendChild(controls);
      box.appendChild(r);
    }
  }
  draw(); return box;
}
