/* 界面工具包：图标、控件、卡片骨架。样式前缀 k-。
   依赖 forms.js 里的 h / clear / icon / activate / onKey。 */

/* ---------- 图标 ---------- */
/* 游戏里 / 引擎预览：用原生 <item>；网页预览（browser/mock.js 定义 ED_MC）：用抽取的图 */
function atlasEl(cls, file, idx, cols, cell, size) {
  var el = h('div', { class: cls + ' atlas' });
  var col = idx % cols, row = Math.floor(idx / cols);
  el.setAttribute('style', 'width:' + size + 'px;height:' + size + 'px;background-image:url(' + ED_MC_BASE + file + ');background-size:' + (cols * size) + 'px auto;background-position:-' + (col * size) + 'px -' + (row * size) + 'px;background-repeat:no-repeat');
  return el;
}
/* 游戏里 / 引擎预览：用原生 <item>；网页预览（browser/mock.js 定义 ED_MC）：用抽取的图集 */
/* 像素图标只用整数倍：物品 16 / 32 / 48…，界面图标 8 / 16 / 32 */
function itemIcon(id, size, extra) {
  id = shortId(id || 'air'); size = size || 32; size = size <= 30 ? 16 : size <= 40 ? 32 : Math.round(size / 16) * 16;
  var cls = 'k-ico' + (extra ? ' ' + extra : ''), el;
  if (typeof ED_MC !== 'undefined') {
    var idx = ED_MC.items[id];
    if (idx !== undefined) return atlasEl(cls, 'items.png', idx, ED_MC.cols, ED_MC.cell, size);
    el = h('img', { class: cls, src: 'oriel:textures/icons/cube_wire.png', alt: '' });
  } else el = h('item', { id: fullId(id), class: cls });
  el.style.width = size + 'px'; el.style.height = size + 'px';
  return el;
}
/* 状态效果图标（原版 mob_effect 贴图） */
function effectIcon(id, size) {
  id = shortId(id); size = 16;
  if (typeof ED_MC !== 'undefined') { var i = ED_MC.effects[id]; if (i !== undefined) return atlasEl('k-ico', 'effects.png', i, ED_MC.effCols, ED_MC.effCell, size); }
  var ns = id.indexOf(':') > 0 ? id.split(':')[0] : 'minecraft', pth = id.indexOf(':') > 0 ? id.split(':')[1] : id;
  var el = h('img', { class: 'k-ico', src: ns + ':textures/mob_effect/' + pth + '.png', alt: '' });
  el.style.width = size + 'px'; el.style.height = size + 'px';
  return el;
}
function uiIcon(name, size, cls) {
  var el = h('img', { class: 'o-ico' + (cls ? ' ' + cls : ''), src: 'oriel:textures/icons/' + name + '.png', alt: '' });
  if (size) { size = size <= 11 ? 8 : size <= 20 ? 16 : 32; el.style.width = size + 'px'; el.style.height = size + 'px'; }
  return el;
}
/* 搜索框 + 「搜索」按钮。输入时不搜（装了几百个模组后，每个字符都跑一遍拼音匹配很吃性能）；
   按回车或点「搜索」才执行 onSearch(文字)；把输入框清空则立即恢复全部（不需要匹配，零成本）。返回 { el, input, go } */
function kSearchBox(input, onSearch) {
  var last = input.value;
  function go() { last = input.value; onSearch(input.value); }
  input.addEventListener('input', function () { if (input.value === '' && last !== '') go(); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); go(); } });
  var btn = h('div', { class: 'k-btn k-sbtn', title: '搜索（也可以按回车）' }, [uiIcon('search', 12), h('span', { text: '搜索' })]);
  activate(btn, go);
  return { el: h('div', { class: 'k-sbox' }, [input, btn]), input: input, go: go };
}
function nameOfItem(id) { return Reg.itemName(id) || EDATA.iname[shortId(id)] || humanId(shortId(id)); }
/* 物品类别：优先用游戏里的真实事实（默认组件 + item_meta），数据没到、或离线时才退回内置表 EDATA.ikind。
   facts：dc = 默认组件（短 ID 键），meta = item_meta_one 的一行。不靠物品名后缀猜（书除外：原版只有这两本）。 */
function kindFromFacts(id, dc, meta) {
  function has(k) { return dc[k] !== undefined; }
  if (has('stored_enchantments')) return 'ebook';
  if (has('potion_contents')) return 'potion';
  if (id === 'written_book' || id === 'writable_book' || has('written_book_content') || has('writable_book_content')) return 'book';
  if (meta.ranged_weapon) return 'ranged';
  if (has('blocks_attacks')) return 'shield';
  /* 镐 / 铲 / 锄 也带 weapon 组件，所以“武器”要排除普通工具；斧头能让盾失效，算近战 */
  if (meta.weapon && (!meta.tool || (isObj(dc.weapon) && dc.weapon.disable_blocking_for_seconds > 0))) return 'melee';
  if (meta.tool) return 'tool';
  if (meta.armor_slot) return 'armor';
  if (has('glider')) return 'armor';
  if (meta.spawn_egg_entity) return 'spawn';
  if (has('jukebox_playable')) return 'disc';
  if (has('fireworks') || has('firework_explosion')) return 'firework';
  if (has('banner_patterns') && meta.block_item) return 'banner';
  if (meta.block_entity_type === 'minecraft:mob_spawner' || meta.block_entity_type === 'minecraft:trial_spawner') return 'spawner';
  if (meta.food || meta.consumable) return 'food';
  if (meta.bundle || typeof meta.container_size === 'number' || has('container') || has('bundle_contents')) return 'container';
  return 'generic';
}
function liveKind(id) {
  if (typeof Reg === 'undefined' || !Reg.live()) return null;
  var full = fullId(id), dc = Reg.defaultsOf(full), meta = Reg.itemMeta(full);
  if (!dc || meta === null) return null;
  return kindFromFacts(shortId(id), dc, meta || {});
}
function kindOfItem(id) { var s = shortId(id); return liveKind(id) || (s === 'spawner' || s === 'trial_spawner' ? 'spawner' : EDATA.ikind[s]) || 'generic'; }

/* ---------- 浮层 / 弹出 ---------- */
var KPop = { el: null, owner: null, onClose: null };
function kPopClose() { if (KPop.el) { KPop.el.remove(); KPop.el = null; if (KPop.onClose) KPop.onClose(); KPop.onClose = null; } KPop.owner = null; }
function kPopover(anchor, node, o) {
  o = o || {};
  kPopClose(); popClose();
  var box = h('div', { class: 'k-pop' + (o.cls ? ' ' + o.cls : '') }, [node]);
  document.getElementById('overlays').appendChild(box);
  var r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  var w = Math.min(Math.round((o.width || Math.max(r.width, 160)) * 0.74), vw - 16);
  var left = Math.max(4, Math.min(r.left, vw - w - 4));
  var below = vh - r.bottom - 6, above = r.top - 6, up = below < 180 && above > below;
  box.setAttribute('style', 'left:' + left + 'px;width:' + w + 'px;' + (up ? 'bottom:' + (vh - r.top + 3) + 'px;max-height:' + Math.min(above, o.maxHeight || 320) + 'px' : 'top:' + (r.bottom + 3) + 'px;max-height:' + Math.min(below, o.maxHeight || 320) + 'px'));
  KPop.el = box; KPop.owner = anchor; KPop.onClose = o.onClose || null;
  return box;
}
document.addEventListener('mousedown', function (e) { if (KPop.el && !KPop.el.contains(e.target) && !(KPop.owner && KPop.owner.contains && KPop.owner.contains(e.target))) kPopClose(); });

/* 物品选择弹出：搜索 + 图标网格 */
function pickItem(anchor, onPick, o) {
  o = o || {};
  var q = h('input', { class: 'k-input', type: 'text', placeholder: o.placeholder || '搜索物品，如「钻石」「sword」', spellcheck: 'false' });
  var grid = h('div', { class: 'k-pgrid' }), hint = h('div', { class: 'k-phint' }), cancel = null;
  /* 候选来自游戏实时注册表（含模组物品）；没有宿主时才用内置清单。原版物品用短 ID，模组物品用完整 ID。
     搜索按时间片分批（kFilterSliced）：一千多个物品的拼音匹配不能在一次脚本入口里做完，否则会被引擎停页 */
  function show(list, s, src, hostTotal) {
    clear(grid);
    var n = 0, total = hostTotal || list.length;
    for (var i = 0; i < list.length && n < 56; i++) {
      n++;
      (function (id) {
        var c = h('div', { class: 'k-pcell', title: nameOfItem(id) + '\n' + fullId(id) }, [itemIcon(id, 16)]);
        c.addEventListener('mousedown', function (e) { e.preventDefault(); kPopClose(); onPick(id); });
        grid.appendChild(c);
      })(list[i]);
    }
    var custom = s && /^[a-z0-9_.\-]+:[a-z0-9_.\/\-]+$/.test(s) && src.indexOf(shortId(s)) < 0;
    if (custom) { var cu = h('div', { class: 'k-add', text: '使用自定义 ID：' + s }); cu.addEventListener('mousedown', function (e) { e.preventDefault(); kPopClose(); onPick(shortId(s)); }); grid.appendChild(cu); }
    hint.textContent = total ? '共 ' + total + ' 个' : '没有匹配的物品';
  }
  function paint() {
    if (cancel) { cancel(); cancel = null; }
    var s = q.value.trim().toLowerCase();
    var ilk = Reg.lazyKind('item');
    var src = ilk ? [] : (Reg.has('items') ? Reg.list('items').map(function (e) { return shortId(e.id); }) : EDATA.items);
    var pool = o.filter ? src.filter(function (id) { return o.filter(id); }) : src;
    if (ilk) {   // 物品目录在宿主：空搜索词也问宿主要第一页
      if (!HostSearch.query({ view: 'item-picker', kind: ilk, query: s, limit: 56 }, function (r) {
        if (r.fallback) { show([], s, src); hint.textContent = '游戏没有返回搜索结果，可以直接输入完整 ID'; return; }
        Reg.noteRows(ilk, r.entries);
        var ids = (r.entries || []).map(function (e) { return Reg.isMod(Reg.full(e.id)) ? e.id : shortId(e.id); });
        if (o.filter) ids = ids.filter(function (id) { return o.filter(id); });
        show(ids, s, src, r.total);
      })) { show([], s, src); hint.textContent = '当前宿主不支持搜索，可以直接输入完整 ID'; }
      return;
    }
    if (!s) { show(pool, s, src); return; }
    /* 没有额外过滤条件时让宿主的后台索引搜（含拼音 / 模组物品），否则本地分批 */
    if (!o.filter && HostSearch.query({ view: 'item-picker', kind: 'items', query: s, limit: 56 }, function (r) {
      if (r.fallback) { cancel = kFilterSliced(pool, function (id) { return kMatch(id, s) || kMatch(nameOfItem(id), s); }, function (list) { show(list, s, src); }); return; }
      var ids = (r.entries || []).map(function (e) { return Reg.isMod(Reg.full(e.id)) ? e.id : shortId(e.id); });
      show(ids, s, src, r.total);
    })) return;
    cancel = kFilterSliced(pool, function (id) { return kMatch(id, s) || kMatch(nameOfItem(id), s); }, function (list) { show(list, s, src); });
  }
  var sbox = kSearchBox(q, paint);
  onKey(q, { Escape: function () { kPopClose(); } });
  var foot = h('div', { class: 'k-pfoot' }, [hint]);
  if (o.reset) foot.appendChild(kBtn(o.reset.label, function () { kPopClose(); o.reset.fn(); }, { icon: 'undo' }));
  var box = h('div', { class: 'k-pickbox' }, [sbox.el, grid, foot]);
  var pop = kPopover(anchor, box, { width: 292, maxHeight: 340 });
  paint(); kPopPin(pop, grid); q.focus();
}

/* 图标列表弹出：entries=[{v,label,sub,icon(el)}]。搜索框固定在顶上，只滚列表。
   o.manual = { label, parse(text)→值（不合法抛错） }：搜索框兼做手动输入，按回车时没有完全匹配的条目就把输入的值写入 */
function pickFrom(anchor, entries, onPick, o) {
  o = o || {};
  var q = h('input', { class: 'k-input', type: 'text', placeholder: o.placeholder || (o.manual ? '搜索，或输入后按回车直接写入' : '搜索…'), spellcheck: 'false' });
  var list = h('div', { class: 'k-plist' }), err = h('div', { class: 'k-numerr' });
  function pick(e) { kPopClose(); onPick(e); }
  function paint() {
    clear(list); err.textContent = '';
    var s = q.value.trim().toLowerCase(), n = 0;
    if (o.manual && s) {
      var mr = h('div', { class: 'k-prow k-pman' }, [h('div', { class: 'tx' }, [h('div', { class: 'z', text: '回车写入「' + q.value.trim() + '」' }), h('div', { class: 's', text: o.manual.label || '列表里没有的值也可以' })])]);
      mr.addEventListener('mousedown', function (ev) { ev.preventDefault(); manual(); });
      list.appendChild(mr);
    }
    entries.forEach(function (e) {
      if (s && !kMatch(e.label + ' ' + (e.sub || '') + ' ' + e.v, s)) return;
      n++;
      var row = h('div', { class: 'k-prow' }, [e.icon ? e.icon() : null, h('div', { class: 'tx' }, [h('div', { class: 'z', text: e.label }), e.sub ? h('div', { class: 's', text: e.sub }) : null])]);
      row.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(e); });
      list.appendChild(row);
    });
    if (!n && !(o.manual && s)) list.appendChild(h('div', { class: 'k-phint', text: '没有匹配项' }));
  }
  function manual() {
    var t = q.value.trim(); if (!t) return;
    var lo = t.toLowerCase(), hit = entries.filter(function (e) { return String(e.v).toLowerCase() === lo || String(e.label).toLowerCase() === lo; })[0];
    if (hit) { pick(hit); return; }
    var v; try { v = o.manual.parse(t); } catch (x) { err.textContent = x.message || String(x); return; }
    kPopClose(); onPick({ v: v, label: t, manual: true });
  }
  var top;
  if (o.manual) {
    /* 边输边筛；回车 = 写入（完全匹配某一项就选它） */
    q.addEventListener('input', paint);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); manual(); } });
    top = h('div', { class: 'k-ptop' }, [q, err]);
  } else top = h('div', { class: 'k-ptop' }, [kSearchBox(q, paint).el]);
  onKey(q, { Escape: function () { kPopClose(); } });
  var showTop = o.manual || entries.length > 8;
  var box = kPopover(anchor, h('div', { class: 'k-pickbox' }, [showTop ? top : null, list]), { width: o.width || 260, maxHeight: o.maxHeight || 320 });
  paint(); kPopPin(box, list); if (showTop) q.focus();
}
/* 弹出层里只让列表滚动，搜索框等头部固定在上方（引擎不支持 sticky，按弹出层的最大高度算出列表能占多高） */
function kPopPin(box, scroller) {
  var m = /max-height:(\d+)px/.exec(box.getAttribute('style') || ''); if (!m) return;
  var inner = box.firstChild, other = 0;
  if (inner && inner.children) for (var i = 0; i < inner.children.length; i++) { var c = inner.children[i]; if (c !== scroller) other += c.getBoundingClientRect().height + 4; }
  box.style.overflowY = 'hidden';
  scroller.style.overflowY = 'auto';
  scroller.style.maxHeight = Math.max(60, +m[1] - other - 16) + 'px';
}

/* ---------- 基础控件 ---------- */
function kToggle(on, onChange, label) {
  var el = h('div', { class: 'k-toggle' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on) }, [h('i', {})]);
  var api = { el: el, set: function (v) { on = !!v; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }, get: function () { return on; } };
  activate(el, function () { api.set(!on); onChange(on); });
  if (label) { var wrap = h('div', { class: 'k-togrow' }, [el, h('span', { class: 'k-togl', text: label })]); wrap.addEventListener('click', function (e) { if (e.target !== el && !el.contains(e.target)) { api.set(!on); onChange(on); } }); api.el = wrap; api.sw = el; }
  return api;
}

/* 分段选择：options=[{v,label,icon?}] */
function kSeg(options, value, onPick, cls) {
  var el = h('div', { class: 'k-seg' + (cls ? ' ' + cls : '') }), cur = value;
  function paint() {
    var ch = el.children;
    for (var i = 0; i < ch.length; i++) ch[i].classList.toggle('on', options[i].v === cur);
  }
  options.forEach(function (o) {
    var b = h('div', { class: 'k-segi', title: o.title || '' }, [o.icon ? uiIcon(o.icon, 12) : null, o.label]);
    activate(b, function () { cur = o.v; paint(); onPick(o.v); });
    el.appendChild(b);
  });
  paint();
  return { el: el, set: function (v) { cur = v; paint(); } };
}

/* 磁贴选择：tiles=[{v,label,sub?,icon?(el 工厂),color?}] */
function kTiles(tiles, value, onPick, o) {
  o = o || {};
  var el = h('div', { class: 'k-tiles' + (o.cls ? ' ' + o.cls : '') }), cur = value;
  /* 选项统一两种样式：带说明的单选 = 平铺列表行（o.list）；其余 = 紧凑的图标 + 名称小块（说明放悬停提示）。不再用大方块 */
  if (o.list) el.classList.add('list'); else el.classList.add('pill');
  function paint() { var ch = el.children; for (var i = 0; i < ch.length; i++) ch[i].classList.toggle('on', tiles[i].v === cur); }
  tiles.forEach(function (t) {
    var tl = h('div', { class: 'k-tile', title: t.title || t.sub || '', style: t.color ? '--tone:' + t.color : '' }, [t.icon ? h('div', { class: 'ti' }, [t.icon()]) : null, h('div', { class: 'tl', text: t.label, style: t.color ? 'color:' + t.color : '' }), t.sub ? h('div', { class: 'ts', text: t.sub }) : null]);
    activate(tl, function () { cur = t.v; paint(); onPick(t.v); });
    el.appendChild(tl);
  });
  paint();
  return { el: el, set: function (v) { cur = v; paint(); } };
}

/* 文本输入（单行） */
function kInput(value, onChange, o) {
  o = o || {};
  var el = h('input', { class: 'k-input', type: 'text', value: value || '', placeholder: o.placeholder || '', maxlength: o.max ? String(o.max) : null, spellcheck: 'false' });
  el.addEventListener('input', function () { onChange(el.value); });
  return el;
}

/* 数值：输入框优先（可直接敲任意数），滑块只是快速微调，范围会随数值自动伸缩。
   o = { min,max（数据类型的硬限制，超出无法写入）, warnMin,warnMax,warnWhy（原版上限：超出只提醒，不阻止）,
         softMin,softMax（滑块的常规范围，超出时自动放大）, step, unit, dec, presets:[{v,label,title}], noSlider, big, onChange(v,key) } */
function niceCeil(x) { if (x <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
/* 输入框里的文字居中：这个文本框不认 text-align，只能按字符宽度算左内边距 */
var CHAR_W = 0;
function charW() {
  if (CHAR_W) return CHAR_W;
  try { var sp = h('span', { text: '0000000000', style: 'position:absolute;visibility:hidden;white-space:nowrap' }); document.body.appendChild(sp); CHAR_W = sp.getBoundingClientRect().width / 10; document.body.removeChild(sp); } catch (e) {}
  return CHAR_W || 6;
}
function centerInput(input) {
  var w = input.getBoundingClientRect().width; if (!w) return;
  var pad = Math.max(3, Math.floor((w - 6 - String(input.value).length * charW()) / 2));
  input.style.paddingLeft = pad + 'px';
}
function kNumber(value, o) {
  var step = o.step || 1, dec = o.dec !== undefined ? o.dec : (step < 1 ? (String(step).split('.')[1] || '').length : 0);
  var min = o.min, max = o.max;
  var smin = o.softMin !== undefined ? o.softMin : (min !== undefined && min > -1e6 ? min : 0);
  var smax0 = o.softMax !== undefined ? o.softMax : (max !== undefined && max < 1e6 ? max : smin + 100);
  var wrap = h('div', { class: 'k-num' }), cur = value, smax = smax0, ustep = step;
  var input = h('input', { class: 'k-input k-numin' + (o.big ? ' big' : ''), type: 'text', spellcheck: 'false' });
  var err = h('div', { class: 'k-numerr' }), warn = h('div', { class: 'k-numwarn' });
  var track = h('div', { class: 'k-slider', tabindex: '0' }, [h('div', { class: 'tr' }), h('div', { class: 'fl' }), h('div', { class: 'th' })]);
  var fl = track.children[1], th = track.children[2];
  var big = h('span', { class: 'k-big' });
  function round(v) { return +v.toFixed(dec); }
  function ok(v) { return !(isNaN(v) || (min !== undefined && v < min) || (max !== undefined && v > max)); }
  function range() { smax = smax0; ustep = step; if (cur > smax0) { smax = niceCeil(cur * 1.25); ustep = Math.max(step, Math.pow(10, Math.floor(Math.log(smax) / Math.LN10) - 2)); } }
  function paintSlider() {
    range();
    var t = smax > smin ? Math.max(0, Math.min(1, (cur - smin) / (smax - smin))) : 0;
    fl.style.width = (t * 100) + '%'; th.style.left = (t * 100) + '%';
    track.classList.toggle('over', cur > smax0);
    track.setAttribute('title', cur > smax0 ? '数值已超出常规滑块范围，滑块已自动放大到 ' + fmtInt(smax) + '，也可直接在输入框修改' : '');
  }
  function paintWarn() {
    var w = '';
    if (o.warnMax !== undefined && cur > o.warnMax) w = '超过原版上限 ' + fmtNum(o.warnMax) + (o.warnWhy ? '（' + o.warnWhy + '）' : '') + '：原版游戏可能忽略或拒绝；安装了解除上限的模组才有效';
    else if (o.warnMin !== undefined && cur < o.warnMin) w = '低于原版下限 ' + fmtNum(o.warnMin) + (o.warnWhy ? '（' + o.warnWhy + '）' : '') + '：原版游戏可能忽略或拒绝';
    warn.textContent = w; warn.style.display = w ? 'block' : 'none';
    var b = bigText(cur); big.textContent = b && !o.unitBig ? '≈ ' + b : ''; big.style.display = b ? '' : 'none';
  }
  function paint() { input.value = fmtNum(cur); setTimeout(function () { centerInput(input); }, 0); err.style.display = 'none'; input.classList.remove('bad'); if (!o.noSlider) paintSlider(); paintWarn(); }
  function commit(v, key) { v = round(v); if (!ok(v)) { showErr(v); return; } cur = v; paint(); if (o.onChange) o.onChange(cur, key); }
  function showErr(v) {
    input.classList.add('bad'); err.style.display = ''; clear(err);
    var msg = isNaN(v) ? '请输入数字' : (max !== undefined && v > max ? '最大只能是 ' + fmtInt(max) : '最小只能是 ' + fmtInt(min));
    err.appendChild(document.createTextNode(msg + (o.limitWhy ? '（' + o.limitWhy + '）' : '') + ' '));
    if (!isNaN(v)) { var fix = h('span', { class: 'fix', text: '改为' + (v > max ? '上限' : '下限') }); fix.addEventListener('click', function () { commit(v > max ? max : min, 'fix'); }); err.appendChild(fix); }
  }
  function fromEvent(e) {
    var r = track.getBoundingClientRect(), t = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    var raw = smin + t * (smax - smin); raw = Math.round(raw / ustep) * ustep;
    commit(raw, 'drag');
  }
  track.addEventListener('mousedown', function (e) {
    e.preventDefault(); track.focus(); fromEvent(e);
    var mv = function (ev) { fromEvent(ev); };
    var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  function nudge(dir, e) { var mult = e && e.shiftKey ? 10 : 1; commit(cur + dir * ustep * mult, 'step'); }
  onKey(track, { ArrowRight: function (e) { nudge(1, e); }, ArrowUp: function (e) { nudge(1, e); }, ArrowLeft: function (e) { nudge(-1, e); }, ArrowDown: function (e) { nudge(-1, e); } });
  var minus = h('div', { class: 'k-step', text: '−', title: '减少（按住 Shift 一次 ×10）' }), plus = h('div', { class: 'k-step', text: '+', title: '增加（按住 Shift 一次 ×10）' });
  minus.addEventListener('click', function (e) { nudge(-1, e); });
  plus.addEventListener('click', function (e) { nudge(1, e); });
  function typed() { var t = input.value.trim().replace(/[,，\s]/g, ''); if (t === '') { paint(); return; } var mult = 1; if (/万$/.test(t)) { mult = 1e4; t = t.slice(0, -1); } else if (/亿$/.test(t)) { mult = 1e8; t = t.slice(0, -1); } else if (/[kK]$/.test(t)) { mult = 1e3; t = t.slice(0, -1); } else if (/[mM]$/.test(t)) { mult = 1e6; t = t.slice(0, -1); } var n = Number(t) * mult; if (isNaN(n)) { showErr(NaN); return; } commit(n, 'type'); }
  input.addEventListener('change', typed);
  input.addEventListener('input', function () { centerInput(input); err.style.display = 'none'; input.classList.remove('bad'); });
  onKey(input, { Enter: function () { typed(); input.blur && input.blur(); }, ArrowUp: function (e) { nudge(1, e); }, ArrowDown: function (e) { nudge(-1, e); } });
  var field = h('div', { class: 'k-stepper' }, [minus, input, plus, o.unit ? h('span', { class: 'u', text: o.unit }) : null, big]);
  wrap.appendChild(h('div', { class: 'k-numrow' }, [field, o.noSlider ? null : track]));
  wrap.appendChild(err); wrap.appendChild(warn);
  if (o.presets && o.presets.length) {
    var pr = h('div', { class: 'k-presets' });
    o.presets.forEach(function (p) { var b = h('div', { class: 'k-preset', text: p.label, title: p.title || '' }); activate(b, function () { commit(p.v, 'preset'); }); pr.appendChild(b); });
    wrap.appendChild(pr);
  }
  paint();
  return { el: wrap, set: function (v) { cur = v; paint(); }, get: function () { return cur; } };
}

/* 颜色：value 为 0xRRGGBB 整数或 null；palette 为 16 色 + 自定义 */
var DYE_RGB = { white: 0xF9FFFE, orange: 0xF9801D, magenta: 0xC74EBD, light_blue: 0x3AB3DA, yellow: 0xFED83D, lime: 0x80C71F, pink: 0xF38BAA, gray: 0x474F52, light_gray: 0x9D9D97, cyan: 0x169C9C, purple: 0x8932B8, blue: 0x3C44AA, brown: 0x835432, green: 0x5E7C16, red: 0xB02E26, black: 0x1D1D21 };
function hex6(n) { var s = (n & 0xFFFFFF).toString(16).toUpperCase(); while (s.length < 6) s = '0' + s; return '#' + s; }
function kColor(value, onChange, o) {
  o = o || {};
  var cur = typeof value === 'number' ? (value & 0xFFFFFF) : null;
  var wrap = h('div', { class: 'k-color' }), chip = h('div', { class: 'k-colorchip' });
  var input = h('input', { class: 'k-input k-hex', type: 'text', maxlength: '7', placeholder: '#RRGGBB' });
  var pal = h('div', { class: 'k-swatches' });
  function paint() {
    chip.setAttribute('style', cur === null ? '' : 'background:' + hex6(cur)); chip.classList.toggle('none', cur === null);
    input.value = cur === null ? '' : hex6(cur);
    var ch = pal.children; for (var i = 0; i < ch.length; i++) ch[i].classList.toggle('on', cur !== null && ch[i].getAttribute('data-c') === String(cur));
  }
  function set(v, silent) { cur = v; paint(); if (!silent) onChange(cur); }
  Object.keys(DYE_RGB).forEach(function (k) {
    var s = h('div', { class: 'k-sw', title: (EDATA.L.color[k] || k), 'data-c': String(DYE_RGB[k]), style: 'background:' + hex6(DYE_RGB[k]) });
    activate(s, function () { set(DYE_RGB[k]); }); pal.appendChild(s);
  });
  input.addEventListener('change', function () { var t = input.value.trim(); if (/^#?[0-9a-fA-F]{6}$/.test(t)) set(parseInt(t.replace('#', ''), 16)); else if (t === '' && o.allowNone) set(null); else paint(); });
  wrap.appendChild(h('div', { class: 'k-colorrow' }, [chip, input, o.allowNone ? (function () { var b = h('div', { class: 'k-mini', text: '无' }); activate(b, function () { set(null); }); return b; })() : null]));
  wrap.appendChild(pal);
  paint();
  return { el: wrap, set: function (v) { cur = typeof v === 'number' ? (v & 0xFFFFFF) : null; paint(); } };
}

/* 说明句：随值变化的"效果"提示 */
function kEffect(text, tone) {
  var el = h('div', { class: 'k-effect' + (tone ? ' ' + tone : '') });
  el.textContent = text || '';
  return { el: el, set: function (t, tn) { el.textContent = t || ''; el.style.display = t ? '' : 'none'; el.className = 'k-effect' + (tn ? ' ' + tn : ''); } };
}

/* 小按钮 */
function kBtn(label, onClick, o) {
  o = o || {};
  var b = h('div', { class: 'k-btn' + (o.cls ? ' ' + o.cls : ''), title: o.title || '' }, [o.icon ? uiIcon(o.icon, 12) : null, label ? h('span', { text: label }) : null]);
  activate(b, onClick);
  return b;
}

/* ---------- 卡片骨架 ----------
   spec = { id, icon: 元素或图标名, title, desc, span: 1|2, comps: [组件 id], value?: fn -> 头部右侧大数字 }
   返回 { el, body, comps, update() }，update 刷新"已修改"徽标；具体控件的刷新由各卡片自己登记 */
/* 这些组件在卡片头部带一个开关：开 = 物品有这项功能，关 = 没有 */
var TOGGLABLE = { max_damage: 1, enchantable: 1, weapon: 1, use_cooldown: 1, tool: 1, equippable: 1, food: 1, consumable: 1, death_protection: 1, written_book_content: 1, writable_book_content: 1, use_remainder: 1 };
function kCard(spec, ctx) {
  var badge = h('span', { class: 'k-badge', text: '自定义', title: '这一项和物品原版默认值不同' });
  var reset = h('div', { class: 'k-reset', text: '恢复默认', title: '放弃这里的修改，使用物品原本的值' });
  var iconEl = typeof spec.icon === 'string' ? uiIcon(spec.icon, 16) : (spec.icon || null);
  var valEl = h('div', { class: 'k-cval' });
  var chev = h('div', { class: 'k-chev', title: '折叠 / 展开' }, [uiIcon('down', 10)]);
  var sumEl = h('div', { class: 'k-csum' });
  var tg = spec.toggle !== undefined ? spec.toggle : (spec.comps && spec.comps.length === 1 && TOGGLABLE[spec.comps[0]] ? true : false);
  var sw = tg ? h('div', { class: 'k-sw2', role: 'switch', title: '开 / 关这项功能' }, [h('i', {})]) : h('span', { class: 'k-swph' });
  var head = h('div', { class: 'k-chead' }, [
    h('div', { class: 'k-cico' }, [iconEl]),
    h('div', { class: 'k-ctx' }, [h('div', { class: 'k-ctitle' }, [spec.title, badge]), spec.desc ? h('div', { class: 'k-cdesc', text: spec.desc }) : null]),
    valEl, reset, sw, chev,
  ]);
  var body = h('div', { class: 'k-cbody' });
  var el = h('div', { class: 'k-card' + (spec.span === 2 ? ' wide' : '') + (spec.bare ? ' bare' : '') + (spec.cls ? ' ' + spec.cls : ''), 'data-card': spec.id || '' }, [head, body, h('div', { class: 'k-div' })]);
  var card = { el: el, body: body, comps: spec.comps || [], live: [], spec: spec };
  var ckey = 'card:' + (spec.id || spec.title);
  /* 默认折叠：只有用户展开过的才展开。折叠的卡片在“懒加载”模式下只建卡片头，展开时才建内容 */
  var collapsed = UIOpen[ckey] === undefined ? true : !!UIOpen[ckey];
  if (tg && !(typeof tg === 'object' ? tg.get() : ctx.has(card0comp(spec)))) { if (UIOpen[ckey] === undefined) collapsed = false; }
  function applyCollapse() { el.classList.toggle('collapsed', collapsed); chev.classList.toggle('up', collapsed); }
  head.addEventListener('click', function (e) { if (e.target.closest && (e.target.closest('.k-reset') || e.target.closest('.k-sw2'))) return; if (card.onHead && card.onHead(e)) return; collapsed = !collapsed; UIOpen[ckey] = collapsed;
    if (collapsed) { chev.classList.toggle('up', true); uiSlide(body, false, function () { applyCollapse(); }); }
    else { applyCollapse(); uiSlide(body, true); } });
  head.insertBefore(sumEl, valEl);
  applyCollapse();
  /* 外部（折叠全部）改折叠状态时走这里，保证闭包里的状态、箭头、记忆三者一致 */
  card.setCollapsed = function (v) { collapsed = !!v; UIOpen[ckey] = collapsed; applyCollapse(); };
  activate(reset, function () { card.comps.forEach(function (c) { ctx.reset(c); }); });
  function isOn() { return typeof tg === 'object' ? tg.get() : ctx.has(card.comps[0]); }
  if (tg) {
    card.toggleEl = sw;
    activate(sw, function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var on = !isOn(), c0 = card.comps[0];
      if (typeof tg === 'object') { tg.set(on); return; }
      if (!on) { ctx.disable(c0); return; }
      if (ctx.modified(c0) && intentOf(Store.doc(), c0) === 'remove') ctx.reset(c0);
      else if (card.make) card.make();
      else ctx.enable(c0, defaultFor(CIDX[c0].schema), '启用 ' + CIDX[c0].name);
    });
    el.classList.toggle('off', !isOn());
  }
  card.update = function () {
    var mod = card.comps.some(function (c) { return ctx.modified(c); });
    el.classList.toggle('mod', mod);
    if (tg) sw.classList.toggle('on', isOn());
    if (spec.value) { var v = spec.value(ctx); valEl.textContent = v === undefined || v === null ? '' : v; }
    sumEl.textContent = spec.summary ? (spec.summary(ctx) || '') : '';
    for (var i = 0; i < card.live.length; i++) card.live[i]();
  };
  card.update();
  if (KLAZY && collapsed && !spec.eager) throw new LazyCard(card);
  return card;
}
function card0comp(spec) { return spec.comps && spec.comps[0]; }
var KLAZY = 0;
function LazyCard(c) { this.card = c; }


/* ---------- 界面音效：oriel.playSound 播放原版声音事件（每秒最多 8 个，受玩家音量控制）。轻、短、克制：点击、开关、成功/失败、拖动、弹窗 ---------- */
var Snd = { on: true, last: 0 };
function snd(id, vol, pitch) {
  if (!Snd.on || typeof oriel === 'undefined' || !oriel.playSound) return;
  var t = Date.now(); if (t - Snd.last < 70) return; Snd.last = t;
  try { oriel.playSound(id, vol === undefined ? 0.5 : vol, pitch === undefined ? 1 : pitch); } catch (e) {}
}
function uiClick(el) {
  var c = el.classList;
  if (c.contains('dis') || c.contains('dim')) return;
  if (c.contains('k-toggle') || c.contains('k-sw2') || c.contains('ed-toggle')) { snd(c.contains('on') ? 'minecraft:block.stone_button.click_on' : 'minecraft:block.stone_button.click_off', 0.5, 1.3); return; }
  if (c.contains('ed-tab')) { snd('minecraft:ui.button.click', 0.5, 1.3); return; }
  if (c.contains('k-segi') || c.contains('k-chip') || c.contains('k-tile') || c.contains('k-preset') || c.contains('addcat')) { snd('minecraft:ui.button.click', 0.4, 1.5); return; }
  if (c.contains('pri') || c.contains('k-apply')) { snd('minecraft:ui.button.click', 0.6, 0.9); return; }
  snd('minecraft:ui.button.click', 0.5, 1.1);
}
