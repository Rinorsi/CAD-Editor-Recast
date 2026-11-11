/* 物品格子（公共）：世界容器、玩家背包 / 末影箱、物品页的容器 / 收纳袋都用这一套。
   - kSlotGrid(cfg)   一片格子：点开改物品、右键菜单、拖动对换
   - kStackPop(...)   点开格子后的小窗：选物品 / 数量 / 清空
   - kItemBtn(...)    「选择物品」按钮（空：＋ 选择物品；有：图标 + 名字）
   - kSlotPaint(...)  一格的画法（物品图、数量、带数据的小黄点）
   - slotCols(n)      n 格的容器按几列排
   栈有两种存法：线格式 {id,count,comps,removed}（世界页）和物品组件里的嵌套格式 {slot,item:{id,count,components}}（物品页）。
   格子只认「视图」{id,count,marked?,empty?}；嵌套格式由调用方做适配（见 cards3.js 的容器 / 收纳袋）。 */

function slotCols(n) { return n <= 5 ? n : n <= 9 ? 3 : 9; }
/* Slots, popovers and history all render the same complete stack, not just its ID. */
function stackUiDoc(st) {
  var wire = st._item ? nestedItemWire(st._item) : (st.components ? nestedItemWire(st) : st);
  return { id: wire.id, count: wire.count || 1, comps: nbtHydrate(wire.comps || {}, wire.component_snbt || {}), removed: clone(wire.removed || {}), snbt: wire.component_snbt || {} };
}
function stackUiIcon(st, size) {
  var el = itemIcon(st.id, size);
  if (el.tagName && el.tagName.toLowerCase() === 'item') {
    try {
      var d = stackUiDoc(st), item = vaultNested({ id: d.id, count: d.count, comps: d.comps, removed: d.removed, component_snbt: nbtComponentTexts(d) });
      el.setAttribute('components', nbtMerge(item.components || {}, null));
      el.setAttribute('count', String(d.count)); el.setAttribute('tooltip', '');
    } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('stack.preview', e); }
  }
  return el;
}
function stackUiName(st) {
  var label = h('span', {}), d = stackUiDoc(st), eff = effectiveView(d), name = eff.custom_name !== undefined ? eff.custom_name : eff.item_name;
  var rich = name === undefined ? null : tcRuns(name);
  if (rich) renderRuns(label, rich.base, rich.runs); else label.textContent = displayName(d);
  return label;
}

/* 「选择物品」按钮。cur 为 null / 空 = ＋ 选择物品（placeholder 可换字）；onClick 可省（调用方自己 activate） */
function kItemBtn(cur, onClick, placeholder) {
  var empty = !cur || cur.empty || !cur.id;
  var b = h('div', { class: 'k-btn' }, empty ? [uiIcon('plus', 12), h('span', { text: placeholder || '选择物品' })] : [stackUiIcon(cur, 22), stackUiName(cur)]);
  if (onClick) activate(b, onClick);
  return b;
}

/* 一格的画法。o = { markTitle, noSuffix }；st.marked 明确给出时按它显示「带数据」小黄点 */
function kSlotPaint(cell, st, title, o) {
  o = o || {};
  clear(cell);
  cell.classList.remove('fl', 'r-uncommon', 'r-rare', 'r-epic', 'r-ench');
  if (!st || st.empty) { setTip(cell, title || '空格子'); return; }
  var icon = stackUiIcon(st, 26), native = icon.tagName && icon.tagName.toLowerCase() === 'item';
  if (native) { icon.style.width = '100%'; icon.style.height = '100%'; }
  cell.appendChild(icon);
  if (!native && (st.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(st.count) }));
  var marked = st.marked !== undefined ? st.marked : !!((st.comps && Object.keys(st.comps).length) || st.component_snbt);
  if (marked) cell.appendChild(h('i', { class: 'mk', title: o.markTitle || '自定义组件' }));
  if (native) { cell.removeAttribute('title'); cell.removeAttribute('data-tip'); }
  else setTip(cell, ItemHistory.labelOf(stackUiDoc(st)) + ' × ' + (st.count || 1) + (title && !o.noSuffix ? '（' + title + '）' : ''));
}

/* 点开格子后的小窗。cur = 视图或 null。
   o = { pick:false（不给「选物品」，如收纳袋）, onPick(id), onStack(线格式栈，来自保险库), onCount(n), onClear(), closeOnPick:false,
         clearLabel（默认「清空这一格」）, countLabel（默认「数量」）, plain:true（数量框不带上限提醒 / 预设）, width, maxHeight } */
function kStackPop(anchor, cur, o) {
  var box = h('div', { class: 'k-pickbox k-stackpop' }), empty = !cur || cur.empty || !cur.id;
  function choose() {
      pickItem(anchor, function (id) { o.onPick(id, empty); if (o.closeOnPick !== false) kPopClose(); },
        { onStack: function (st) { o.onStack(st); kPopClose(); } });
  }
  var header = h('div', { class: 'k-stack-head' });
  if (empty) { if (o.pick !== false) header.appendChild(kItemBtn(null, choose)); }
  else {
    var name = h('div', { class: 'k-stack-name' }, [stackUiIcon(cur, 16), stackUiName(cur)]);
    header.appendChild(name);
  }
  if (header.children.length) box.appendChild(header);
  if (!empty) {
    var q = { min: 1, max: 99, noSlider: true, step: 1, onChange: function (v) { o.onCount(v); } };
    if (!o.plain) { var ms = protoOf(cur.id).max_stack_size || 64; q.unit = '个'; q.warnMax = ms; q.warnWhy = '该物品原版最大堆叠 ' + ms; q.presets = [{ v: 1, label: '1' }, { v: 16, label: '16' }, { v: 64, label: '64' }]; }
    box.appendChild(h('div', { class: 'k-stack-qty' }, [h('span', { class: 'k-sub', text: o.countLabel || '数量' }), kNumber(cur.count || 1, q).el]));
    var tools = h('div', { class: 'k-stack-tools' });
    if (o.pick !== false) tools.appendChild(kBtn('更换物品', choose, { icon: 'grid' }));
    if (o.onEdit) tools.appendChild(kBtn('编辑物品', function () { kPopClose(); o.onEdit(); }, { icon: 'edit' }));
    tools.appendChild(h('div', { class: 'grow' }));
    tools.appendChild(kBtn('清空', function () { o.onClear(); kPopClose(); }, { cls: 'dng', icon: 'trash', title: o.clearLabel || '清空这一格' }));
    box.appendChild(tools);
  }
  var po = { width: empty ? 160 : (o.width || 320) };
  if (o.maxHeight !== null) po.maxHeight = o.maxHeight === undefined ? 280 : o.maxHeight;   // maxHeight:null = 不限高
  kPopover(anchor, box, po);
}

/* 线格式栈的点开小窗（世界页）：选物品时清掉组件，数量改的是副本 */
function kWireStackPop(cell, cur, set, edit) {
  var empty = !cur || cur.empty;
  kStackPop(cell, cur, {
    onEdit: function () {
      if (edit) { edit(cur); return; }
      var valid = nestedDraftGuard();
      openNestedItem(cur, { title: '编辑物品', valid: valid, commit: set, render: function () { if (weActive()) weRedrawBody(); } });
    },
    onPick: function (id) { set({ id: fullId(id), count: empty ? 1 : (cur.count || 1), comps: {}, removed: {} }); },
    onStack: function (st) { var s2 = clone(st); delete s2.slot; delete s2.label; set(s2); },
    onCount: function (v) { var o = clone(cur); o.count = v; cur = o; set(o); },
    onClear: function () { set({ empty: true }); }
  });
}

/* 一片格子。
   cfg = { indices:[格号 / null（占位）…], cols（不给就不写列模板）, col（列宽，默认 26）, fluid（列随宽度伸缩）, tight, bare（不要下凹托盘）,
           stackOf(i)→视图 / {empty:true} / null, titleOf?(i), ghostOf?(i)（空格里的幽灵图标名）, clsOf?(i),
           set(i, 视图)（默认的点开小窗和拖动对换用）, edit?(cell, i)（自定义点开小窗，不给就用线格式的 kWireStackPop）,
           menu?(i, cell)→右键菜单项, ref?(i)→{get,set,swap?,group?}（自定义拖动存取）, redraw?()（拖动后整体重画，默认重画世界页内容）,
           plain, markTitle, noSuffix（传给 kSlotPaint）, dnd:false（不要拖动）, emptyTitle?(i) }
   返回 grid 元素；grid.repaint() 重画全部格子，grid.cells[i] 是格子元素。 */
function kSlotGrid(cfg) {
  var grid = h('div', { class: 'k-cgrid' + (cfg.bare ? '' : ' tray') + (cfg.tight ? ' inv' : '') + (cfg.fluid ? ' fluid' : '') }), cells = {};
  if (cfg.cols) grid.setAttribute('style', 'grid-template-columns:repeat(' + cfg.cols + ',' + (cfg.fluid ? '1fr' : (cfg.col || 26) + 'px') + ')');
  var po = { plain: cfg.plain, markTitle: cfg.markTitle, noSuffix: cfg.noSuffix };
  function paint(cell, i) {
    var s = cfg.stackOf(i);
    kSlotPaint(cell, s, cfg.titleOf ? cfg.titleOf(i) : '格子 ' + (i + 1), po);
    var g = cfg.ghostOf && cfg.ghostOf(i);
    if (g && (!s || s.empty)) cell.appendChild(uiIcon(g, 16, 'es-ghost'));
  }
  cfg.indices.forEach(function (i) {
    if (i === null) { grid.appendChild(h('div', { class: 'slot s34 blank', style: 'visibility:hidden' })); return; }
    var cell = h('div', { class: 'slot s34' + (cfg.clsOf && cfg.clsOf(i) ? ' ' + cfg.clsOf(i) : '') }); cells[i] = cell;
    paint(cell, i);
    var edit = function () {
      if (cfg.edit) cfg.edit(cell, i);
      else kWireStackPop(cell, cfg.stackOf(i), function (st) { cfg.set(i, st); paint(cell, i); });
    };
    if (cfg.dnd === false) cell.addEventListener('click', edit);
    else {
      var ref = cfg.ref ? cfg.ref(i) : { get: function () { return cfg.stackOf(i); }, set: function (st) { cfg.set(i, st); } };
      ref.redraw = ref.redraw || cfg.redraw;
      slotDndBind(cell, ref, edit);
    }
    if (cfg.menu) onContext(cell, function () { return cfg.menu(i, cell); });
    grid.appendChild(cell);
  });
  grid.cells = cells;
  grid.repaint = function () {
    Object.keys(cells).forEach(function (k) {
      var c = cells[k]; paint(c, +k);
      c.classList.remove('sel');
    });
  };
  return grid;
}

/* 单击编辑，按住拖动换格。相同 group 的 swap 一次写入。 */
var WE_DND = { cells: [], ghost: null };
function weDndReset() { WE_DND.cells = []; weDndGhost(null); }
function weDndStack(ref) { var st = ref.get(); return st && !st.empty && st.id ? st : null; }
/* 拖动 / 拿起后整体重画：格子自己给了 redraw 就用它；否则在世界页重画当前标签页内容；都没有就不做 */
function weDndRedraw(ref) {
  var f = (ref && ref.redraw) || (typeof weActive === 'function' && weActive() && typeof weRedrawBody === 'function' ? weRedrawBody : null);
  if (f) f();
}
function weDndGhost(st, x, y) {
  var g = WE_DND.ghost;
  if (!st) { if (g && g.parentNode) g.parentNode.removeChild(g); WE_DND.ghost = null; return; }
  if (!g) {
    g = WE_DND.ghost = h('div', { class: 'slot-ghost', style: 'position:absolute;z-index:400;pointer-events:none;width:26px;height:26px;' }, [itemIcon(st.id, 26)]);
    if ((st.count || 1) > 1) g.appendChild(h('span', { class: 'cnt', text: String(st.count), style: 'position:absolute;right:0;bottom:-2px;color:#fff' }));
    document.getElementById('overlays').appendChild(g);
  }
  var scale = typeof uiScaleFactor === 'function' ? uiScaleFactor() : 1;
  g.style.left = (x / scale - 13) + 'px'; g.style.top = (y / scale - 13) + 'px';
}
function weDndCellAt(x, y) {
  for (var i = 0; i < WE_DND.cells.length; i++) {
    var c = WE_DND.cells[i], r = c.el.getBoundingClientRect();
    if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c;
  }
  return null;
}
function weDndMove(a, b) {
  if (a === b) return;
  var sa = a.ref.get(), sb = b.ref.get();
  if (!weDndStack(a.ref) && !weDndStack(b.ref)) return;
  if (a.ref.swap && a.ref.group !== undefined && a.ref.group === b.ref.group) a.ref.swap(b.ref);
  else {
    a.ref.set(sb && sb.id && !sb.empty ? sb : { empty: true });
    b.ref.set(sa && sa.id && !sa.empty ? sa : { empty: true });
  }
  weDndRedraw(a.ref);
}
function slotDndBind(cell, ref, onClick) { return weDndBind(cell, ref, onClick); }
function weDndBind(cell, ref, onClick) {
  var me = { el: cell, ref: ref };
  WE_DND.cells = WE_DND.cells.filter(function (c) { return !!c.el.parentNode; });   // 已经被重画掉的格子不再参与命中判断
  WE_DND.cells.push(me);
  var down = null, dragging = false;
  cell.addEventListener('mousedown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!weDndStack(ref)) { down = null; return; }
    down = { x: e.clientX, y: e.clientY }; dragging = false;
    var st = weDndStack(ref);
    function mv(ev) {
      if (!down) return;
      if (!dragging && Math.abs(ev.clientX - down.x) + Math.abs(ev.clientY - down.y) > 5) { dragging = true; cell.classList.add('sel'); }
      if (dragging) weDndGhost(st, ev.clientX, ev.clientY);
    }
    function up(ev) {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      weDndGhost(null);
      if (dragging) {
        var t = weDndCellAt(ev.clientX, ev.clientY);
        cell._noClick = true; setTimeout(function () { cell._noClick = false; }, 0);
        if (t && t !== me) weDndMove(me, t); else cell.classList.remove('sel');
      }
      down = null; dragging = false;
    }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  cell.addEventListener('click', function () {
    if (!cell._noClick) onClick();
  });
}
