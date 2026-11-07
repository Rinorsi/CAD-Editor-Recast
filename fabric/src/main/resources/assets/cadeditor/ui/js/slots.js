/* 物品格子（公共）：世界容器、玩家背包 / 末影箱、物品页的容器 / 收纳袋都用这一套。
   - kSlotGrid(cfg)   一片格子：点开改物品、右键菜单、拖动对换、双击拿起（物品跟着鼠标，点另一格放下，Esc 取消）
   - kStackPop(...)   点开格子后的小窗：选物品 / 数量 / 清空
   - kItemBtn(...)    「选择物品」按钮（空：＋ 选择物品；有：图标 + 名字）
   - kSlotPaint(...)  一格的画法（物品图、数量、带数据的小黄点、稀有度光）
   - slotCols(n)      n 格的容器按几列排
   栈有两种存法：线格式 {id,count,comps,removed}（世界页）和物品组件里的嵌套格式 {slot,item:{id,count,components}}（物品页）。
   格子只认「视图」{id,count,marked?,empty?}；嵌套格式由调用方做适配（见 cards3.js 的容器 / 收纳袋）。 */

function slotCols(n) { return n <= 5 ? n : n <= 9 ? 3 : 9; }

/* 「选择物品」按钮。cur 为 null / 空 = ＋ 选择物品；onClick 可省（调用方自己 activate） */
function kItemBtn(cur, onClick) {
  var empty = !cur || cur.empty || !cur.id;
  var b = h('div', { class: 'k-btn' }, empty ? [uiIcon('plus', 12), h('span', { text: '选择物品' })] : [itemIcon(cur.id, 22), h('span', { text: nameOfItem(cur.id) })]);
  if (onClick) activate(b, onClick);
  return b;
}

/* 一格的画法。o = { plain:true（不加光池 / 稀有度类，保持旧外观）, markTitle, noSuffix }；st.marked 明确给出时按它显示「带数据」小黄点 */
function kSlotPaint(cell, st, title, o) {
  o = o || {};
  clear(cell);
  cell.classList.remove('fl', 'r-uncommon', 'r-rare', 'r-epic', 'r-ench');
  if (!st || st.empty) { cell.setAttribute('title', title || '空格子'); return; }
  if (!o.plain) {
    cell.classList.add('fl');
    var cp = st.comps || {}, rar = cp.rarity || cp['minecraft:rarity'];
    if (rar === 'uncommon' || rar === 'rare' || rar === 'epic') cell.classList.add('r-' + rar);
    else if (cp.enchantment_glint_override === true || cp['minecraft:enchantment_glint_override'] === true || cp.enchantments || cp['minecraft:enchantments'] || cp.stored_enchantments) cell.classList.add('r-ench');
  }
  cell.appendChild(itemIcon(st.id, 26));
  if ((st.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(st.count) }));
  var marked = st.marked !== undefined ? st.marked : !!((st.comps && Object.keys(st.comps).length) || st.component_snbt);
  if (marked) cell.appendChild(h('i', { class: 'mk', title: o.markTitle || '这个物品带有自己的组件数据，会原样保留' }));
  cell.setAttribute('title', nameOfItem(st.id) + ' × ' + (st.count || 1) + (title && !o.noSuffix ? '（' + title + '）' : ''));
}

/* 点开格子后的小窗。cur = 视图或 null。
   o = { pick:false（不给「选物品」，如收纳袋）, onPick(id), onStack(线格式栈，来自保险库), onCount(n), onClear(), closeOnPick:false,
         clearLabel（默认「清空这一格」）, countLabel（默认「数量」）, plain:true（数量框不带上限提醒 / 预设）, width, maxHeight } */
function kStackPop(anchor, cur, o) {
  var box = h('div', { class: 'k-pickbox' }), empty = !cur || cur.empty || !cur.id;
  if (o.pick !== false) {
    box.appendChild(kItemBtn(cur, function () {
      pickItem(anchor, function (id) { o.onPick(id, empty); if (o.closeOnPick !== false) kPopClose(); },
        { onStack: function (st) { o.onStack(st); kPopClose(); } });
    }));
  }
  if (!empty) {
    var q = { min: 1, max: 99, noSlider: true, step: 1, onChange: function (v) { o.onCount(v); } };
    if (!o.plain) { var ms = protoOf(cur.id).max_stack_size || 64; q.unit = '个'; q.warnMax = ms; q.warnWhy = '该物品原版最大堆叠 ' + ms; q.presets = [{ v: 1, label: '1' }, { v: 16, label: '16' }, { v: 64, label: '64' }]; }
    box.appendChild(fieldRow(o.countLabel || '数量', kNumber(cur.count || 1, q).el));
    box.appendChild(kBtn(o.clearLabel || '清空这一格', function () { o.onClear(); kPopClose(); }, { cls: 'dng', icon: 'trash' }));
  }
  kPopover(anchor, box, { width: o.width || 250, maxHeight: o.maxHeight === undefined ? 280 : o.maxHeight });
}

/* 线格式栈的点开小窗（世界页）：选物品时清掉组件，数量改的是副本 */
function kWireStackPop(cell, cur, set) {
  var empty = !cur || cur.empty;
  kStackPop(cell, cur, {
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
  grid.repaint = function () { Object.keys(cells).forEach(function (k) { paint(cells[k], +k); }); };
  return grid;
}

/* ====================== 和原版背包一致的操作 ======================
   单击：编辑这一格。双击：拿起，再点另一个格子放下（两格对换；放到空格就是移动）。也可以按住拖动到另一格。Esc 取消拿起。
   同一个标签页里的格子之间都能互相搬。ref = { get()→视图 / null, set(视图 | {empty:true}), redraw?(), swap?(另一个 ref), group? }。
   两个 ref 有相同的 group 和 swap 时，对换交给 swap 一次完成（物品页的容器卡片用它，只写一次草稿）。 */
var WE_DND = { cells: [], carry: null, ghost: null, last: null, timer: null, bound: false };
function weDndReset() { WE_DND.cells = []; WE_DND.carry = null; weDndGhost(null); clearTimeout(WE_DND.timer); WE_DND.last = null; }
function weDndHint() { return h('div', { class: 'k-sub', text: '单击编辑 · 双击拿起，点别格放下' }); }
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
    g = WE_DND.ghost = h('div', { class: 'slot-ghost', style: 'position:fixed;z-index:400;pointer-events:none;width:26px;height:26px;' }, [itemIcon(st.id, 26)]);
    if ((st.count || 1) > 1) g.appendChild(h('span', { class: 'cnt', text: String(st.count), style: 'position:absolute;right:0;bottom:-2px;color:#fff' }));
    document.getElementById('overlays').appendChild(g);
  }
  g.style.left = (x - 13) + 'px'; g.style.top = (y - 13) + 'px';
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
  if (!WE_DND.bound) {
    WE_DND.bound = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && WE_DND.carry) { var r = WE_DND.carry.ref; WE_DND.carry = null; weDndGhost(null); weDndRedraw(r); } });
    document.addEventListener('mousemove', function (e) {
      WE_DND.mx = e.clientX; WE_DND.my = e.clientY;
      if (WE_DND.carry && WE_DND.ghost) { WE_DND.ghost.style.left = (e.clientX - 13) + 'px'; WE_DND.ghost.style.top = (e.clientY - 13) + 'px'; }
    });
  }
  if (WE_DND.carry && WE_DND.carry.ref === ref) cell.classList.add('sel', 'carried');
  var down = null, dragging = false;
  cell.addEventListener('mousedown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!weDndStack(ref)) { down = null; return; }
    down = { x: e.clientX, y: e.clientY }; dragging = false;
    var st = weDndStack(ref);
    function mv(ev) {
      if (!down) return;
      if (!dragging && Math.abs(ev.clientX - down.x) + Math.abs(ev.clientY - down.y) > 5) { dragging = true; clearTimeout(WE_DND.timer); cell.classList.add('sel'); }
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
  cell.addEventListener('click', function (e) {
    if (cell._noClick) return;
    if (WE_DND.carry) {   // 已经拿起了东西：点这里就是放下（点回原格取消）
      var from = WE_DND.carry; WE_DND.carry = null; weDndGhost(null);
      if (from.ref === ref) { weDndRedraw(ref); return; }
      var t = null; WE_DND.cells.forEach(function (c) { if (c.ref === ref) t = c; });
      weDndMove(from, t || me); return;
    }
    var now = Date.now();
    if (WE_DND.last && WE_DND.last.ref === ref && now - WE_DND.last.t < 380) {   // 双击：拿起
      clearTimeout(WE_DND.timer); WE_DND.last = null;
      if (weDndStack(ref)) {   // 和原版一样：物品离开格子，跟着鼠标走，直到点另一格放下
        WE_DND.carry = me; cell.classList.add('sel', 'carried');
        weDndGhost(null); weDndGhost(weDndStack(ref), e && e.clientX !== undefined ? e.clientX : (WE_DND.mx || 0), e && e.clientY !== undefined ? e.clientY : (WE_DND.my || 0));
        toast('已拿起，点另一格放下（Esc 取消）', 'info');
      }
      return;
    }
    WE_DND.last = { ref: ref, t: now };
    clearTimeout(WE_DND.timer);
    WE_DND.timer = setTimeout(function () { WE_DND.last = null; onClick(); }, 260);
  });
}
