/* 界面主体：编辑屏（英雄区 / 分页 / 卡片）、二级窗口（高级、添加设置）、应用确认、提示框预览。 */

var UI = { screen: 'edit', tab: null, uni: {}, adv: 'all', advSel: null, advQ: '', theme: 'dark', style: 'ore', tipAdv: false, tipOpen: true,
  cmdMode: 'main', cmdSel: '@s', cmdFmt: 'cmd', page: null, bodyScroll: {} };
var $ = function (id) { return document.getElementById(id); };
/* 音效函数在 kit.js；单独加载本文件做契约测试时给个空实现 */
if (typeof Snd === 'undefined') { var Snd = { on: false }; var snd = function () {}; }

/* 界面偏好。页面自己不能写磁盘：宿主（Editor 模组）在打开页面时带来 prefs 并声明 hostPrefs，
   页面改动后用 oriel.send('prefs', {key, value}) 交给宿主落盘；没有宿主时只在本次打开期间记住。 */
var Prefs = {
  vals: {}, host: false,
  init: function (data) {
    this.vals = {};
    this.host = !!(data && data.hostPrefs); this.hostClip = !!(data && data.hostClip);
    this.about = data && data.about && typeof data.about === 'object' ? data.about : {};
    var p = data && data.prefs && typeof data.prefs === 'object' ? data.prefs : null;
    if (p) for (var k in p) this.vals[k] = p[k];
    UI.heroView = this.get('heroView', '3d') === '2d' ? '2d' : '3d';
    Snd.on = this.get('uiSound', true) !== false;
    applyUiMotion(this.get('uiAnimations', true) !== false);
    applyUiFont(this.get('uiFont', 'mc'));
    UI.stageOpen = this.get('stageOpen', true) !== false; UI.statsOpen = this.get('statsOpen', true) !== false;
    UI.windowMode = windowModeClamp(this.get('windowMode', 'remember'));
    UI.maxed = UI.windowMode === 'maximized' || (UI.windowMode === 'remember' && this.get('windowMax', false) === true);
    var hw = this.get('heroWidth', 0), ww = this.get('winW', 0), wh = this.get('winH', 0);
    UI.heroW = typeof hw === 'number' && hw >= 100 ? hw : 0; UI.winW = typeof ww === 'number' && ww >= 320 ? ww : 0; UI.winH = typeof wh === 'number' && wh >= 200 ? wh : 0;
    UI.uiScale = uiScaleClamp(this.get('uiScale', 0));
    applyUiScale();
  },
  /* 拖动时高频改值：页面里立即生效，300ms 没有新值再交给宿主落盘 */
  setSoon: function (k, v) { var self = this; self.vals[k] = v; self._t = self._t || {}; clearTimeout(self._t[k]); self._t[k] = setTimeout(function () { self.set(k, v); }, 300); },
  get: function (k, d) { return this.vals[k] === undefined ? d : this.vals[k]; },
  set: function (k, v) {
    this.vals[k] = v;
    if (this.host && typeof oriel !== 'undefined' && oriel.send) oriel.send('prefs', { key: k, value: v });
  }
};

/* Native DocumentDriver scale owns layout, painting and input. DOM coordinates are already logical. */
function uiScaleClamp(v) { return typeof v === 'number' && v >= 0 && v <= 4 && Math.floor(v) === v ? v : 0; }
function uiScaleFactor() { return 1; }
function uiMotionEnabled() { return UI.animations !== false; }
/* 界面字体：mc = 游戏自带字体（默认），smooth = 平滑的常规黑体。字号和版式不变，只换字体族 */
function applyUiFont(v) {
  v = v === 'smooth' ? 'smooth' : 'mc'; UI.font = v;
  document.documentElement.setAttribute('data-ed-font', v);
}
function applyUiMotion(on) {
  UI.animations = !!on;
  document.documentElement.setAttribute('data-motion', on ? 'full' : 'reduced');
  if (!on && document.querySelectorAll) Array.prototype.forEach.call(document.querySelectorAll('.ui-leaving'), function (el) { el.remove(); });
}
// Release the live modal synchronously; only its inert visual remains for the exit.
function uiDismiss(el, immediate) {
  if (!el) return;
  el.removeAttribute('id');
  if (immediate || !uiMotionEnabled()) { el.remove(); return; }
  var focus = document.activeElement; if (focus && el.contains && el.contains(focus) && focus.blur) focus.blur();
  if (el.querySelectorAll) Array.prototype.forEach.call(el.querySelectorAll('[id]'), function (child) { child.removeAttribute('id'); });
  el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); el.classList.add('ui-leaving');
  setTimeout(function () { el.remove(); }, 150);
}
function windowModeClamp(v) { return v === 'maximized' || v === 'windowed' ? v : 'remember'; }
function applyUiScale() {
  UI.uiScaleActive = uiScaleClamp(UI.uiScale);
  if (typeof scheduleFit === 'function') scheduleFit();
  return UI.uiScaleActive;
}
function uiViewport() { var w = typeof window !== 'undefined' ? window : {}, s = uiScaleFactor(); return { width: (w.innerWidth || 0) / s, height: (w.innerHeight || 0) / s }; }

/* 提示：同一个 key（默认用文字本身）的提示只留一条、刷新计时；最多同时 3 条；时间按文字长短 */
var TOAST_LIVE = {};
function toastDismiss(key) { var t = TOAST_LIVE[key]; if (t) { delete TOAST_LIVE[key]; clearTimeout(t._t1); clearTimeout(t._t2); t.remove(); } }
function toast(text, kind, key) {
  key = key || String(text);
  var box = $('toasts'); if (!box) return;
  var old = TOAST_LIVE[key]; if (old) { clearTimeout(old._t1); clearTimeout(old._t2); old.remove(); delete TOAST_LIVE[key]; }
  else { var sd = tkSound(kind); if (sd) snd(sd[0], sd[1], sd[2]); }
  var icn = tkIcon(kind);
  var t = h('div', { class: 'k-toast ' + (kind || 'info') }, [uiIcon(icn, 14), String(text)]);
  box.appendChild(t); TOAST_LIVE[key] = t;
  while (box.children.length > 3) { var first = box.children[0]; Object.keys(TOAST_LIVE).forEach(function (k) { if (TOAST_LIVE[k] === first) delete TOAST_LIVE[k]; }); first.remove(); }
  var ms = Math.max(2400, Math.min(8000, 1500 + String(text).length * 70));
  t._t1 = setTimeout(function () { t.classList.add('out'); }, ms);
  t._t2 = setTimeout(function () { t.remove(); if (TOAST_LIVE[key] === t) delete TOAST_LIVE[key]; }, ms + 500);
}
var ModalParents = [];
var VaultOnly = false, ModalSwap = false;   // 独立保险库页（主菜单打开，没有物品）：最后一个窗口关掉就关页面
function openModal(node, stacked) {
  flushPendingCode();
  var previous = $('modal');
  if (stacked && previous != null) {
    ModalParents.push({ el: previous, focus: document.activeElement });
    previous.removeAttribute('id'); previous.style.display = 'none';
    kPopClose();
  } else {
    ModalSwap = true; try { closeModal(); } finally { ModalSwap = false; }
    while (ModalParents.length) { var old = $('modal'); if (old != null) { if (old.onEditorClose) old.onEditorClose(); old.remove(); } var p = ModalParents.pop(); if (p.el.onEditorClose) p.el.onEditorClose(); p.el.remove(); }
    var remaining = $('modal'); if (remaining != null) { if (remaining.onEditorClose) remaining.onEditorClose(); remaining.remove(); }
  }
  snd('minecraft:block.wooden_trapdoor.open', 0.35, 1.6);
  var mask = h('div', { class: 'k-mask', id: 'modal' }, [node]);
  mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeModal(); });
  $('overlays').appendChild(mask);
  return mask;
}
function closeModal() {
  flushPendingCode();
  var m = $('modal'); if (m != null) { if (m.onEditorClose) m.onEditorClose(); uiDismiss(m, ModalSwap); } kPopClose();
  if (ModalParents.length) { var p = ModalParents.pop(); p.el.id = 'modal'; p.el.style.display = ''; if (p.focus != null && p.focus.focus) p.focus.focus(); }
  else if (VaultOnly && !ModalSwap && !$('modal') && typeof oriel !== 'undefined' && oriel.close) oriel.close();
}
/* 弹窗页头：[图标] 标题 [副标题] ……空白…… [操作按钮…] ×。所有弹窗都用它，不要手搭 k-mh。
   o = { icon（图标名，可省）, title, sub（给了就画，空串也画一个空的副标题）, actions（元素数组，放在 × 前面） } */
function modalHead(o) {
  var x = h('div', { class: 'k-mini', text: '×' }); activate(x, closeModal);
  return h('div', { class: 'k-mh' }, [o.icon ? uiIcon(o.icon, 14) : null, h('b', { text: o.title }), o.sub !== undefined && o.sub !== null ? h('span', { class: 'k-sub', text: o.sub }) : null, h('div', { class: 'grow' })].concat(o.actions || [], [x]));
}
/* 弹窗外壳。简单窗口：modalShell(标题, 副标题, 主体数组, 底栏数组, 额外类名)。
   自己安排主体的窗口（高级 / 添加设置 / 详情 / 选择窗）：modalShell({ icon, title, sub, actions, cls, id, body: 主体元素（直接放在页头下面）, foot: 底栏元素 }) */
function modalShell(title, sub, body, foot, cls) {
  if (title && typeof title === 'object') {
    var o = title, kids = [modalHead(o)];
    if (o.body) kids.push(o.body);
    if (o.foot) kids.push(o.foot);
    var attrs = { class: 'k-modal' + (o.cls ? ' ' + o.cls : '') }; if (o.id) attrs.id = o.id;
    return h('div', attrs, kids);
  }
  return h('div', { class: 'k-modal' + (cls ? ' ' + cls : '') }, [
    modalHead({ title: title, sub: sub || undefined }),
    h('div', { class: 'k-mb' }, body), foot ? h('div', { class: 'k-mf' }, foot) : null]);
}

/* ==================== 载入物品 ==================== */
/* 编辑器总是围绕「游戏里选中的那一个物品栈」工作：玩家在游戏里按快捷键（悬停物品 / 手持物品）打开，
   宿主把栈传进来：{ id, count, comps, slot, label }。要换物品就关掉，到背包里重新选。
   浏览器预览里的演示物品由 demo.js 提供。 */
function loadStack(st) {
  flushPendingCode();
  UI.loading = true;   // 载入过程中 Store 会连发几次 docs 事件，别每次都整页重画；调用方载入完后统一画一次
  Store.open({ key: 'stk' + Date.now(), src: st.slot || null, id: fullId(st.id), count: st.count || 1, label: st.label || '', comps: st.comps || {}, removed: st.removed || {}, snbt: st.component_snbt || {}, nativeBaseline: st.baseline }, true);
  while (Store.docs.length > 1) Store.close(0);
  UI.loading = false;
  UI.tab = null; UI.bodyScroll = {}; UI.advSel = null; UI.uni = {};
}

/* 格子中的物品复用完整编辑页，但不拥有宿主写回目标。父文档与历史仅暂存引用，子页只编辑克隆。 */
var NestedItem = null;
/* A child edits a copy; its result belongs only to the document/world that opened it. */
function nestedDraftGuard() {
  var doc = Store.doc(), before = doc ? snapOf(doc) : null, nested = NestedItem;
  var world = typeof WE !== 'undefined' ? WE.w : null, revision = world && world.revision, text = world && WE.text;
  return function (child) { return (child ? child.parent : NestedItem) === nested && (child ? child.docs[child.index] : Store.doc()) === doc && (!doc || snapOf(doc) === before) &&
    (typeof WE === 'undefined' || (WE.w === world && (!world || (world.revision === revision && WE.text === text)))); };
}
function openNestedItem(st, o) {
  flushPendingCode();
  o = o || {};
  if (!st || st.empty || !st.id) return;
  if ((typeof WE !== 'undefined' && WE.pending) || (typeof EditorBridge !== 'undefined' && EditorBridge.pending)) { toast(I18n.t("cadeditor.ui.screens.fd9ffd70b0"), 'warn'); return; }
  if (!NestedItem && typeof WorldDrafts !== 'undefined' && typeof WE !== 'undefined' && WE.w) WorldDrafts.flush();
  var saved = { parent: NestedItem, docs: Store.docs.slice(), index: Store.index(), ui: {}, stack: clone(st), options: o, dom: {}, modalParents: ModalParents, open:UIOpen, nbtForce:NBT_FORCE };
  Object.keys(UI).forEach(function (k) { saved.ui[k] = UI[k]; });
  kPopClose();
  // Detach the parent's live DOM, not a serialized/rebuilt approximation: expanded rows, scroll and inputs survive.
  ['topbar', 'screen', 'footer', 'overlays'].forEach(function (id) { var node = $(id); saved.dom[id] = []; if (node) while (node.firstChild) saved.dom[id].push(node.removeChild(node.firstChild)); });
  ModalParents = []; NestedItem = saved;
  UIOpen = clone(UIOpen); NBT_FORCE = {};
  UI.loading = true;
  try {
    Store.docs.splice(0, Store.docs.length);
    Store.open({ key: 'nested-' + Date.now(), src: null, id: fullId(st.id), count: st.count || 1, label: st.label || '', comps: st.comps || {}, removed: st.removed || {}, snbt: st.component_snbt || {} }, true);
  } finally { UI.loading = false; }
  UI.tab = null; UI.uni = {}; UI.bodyScroll = {}; UI.advSel = null;
  rebuild();
}
function finishNestedItem(save) {
  flushPendingCode();
  var session = NestedItem; if (!session) return;
  var next, d = Store.doc(), changed = diffDoc(d).length > 0;
  if (save && itemRawBlocked()) { toast(I18n.t("cadeditor.ui.screens.290798e75b"), 'warn'); return; }
  if (save && (changed || session.options.commitUnchanged)) {
    if (session.options.valid && !session.options.valid(session)) { toast(I18n.t("cadeditor.ui.screens.c9711c901a"), 'warn'); return; }
    var errors = validateDoc(d).filter(function (p) { return p.level === 'error'; });
    if (errors.length) { toast(errors.map(function (p) { return p.msg; }).join('；'), 'error'); return; }
    try {
      next = clone(session.stack); next.id = d.id; next.count = d.count; next.comps = clone(d.comps); next.removed = clone(d.removed);
      next.component_snbt = nbtComponentTexts(d); delete next.component_formats; delete next.empty;
    } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('nested.serialize', e); toast(I18n.t("cadeditor.ui.screens.ddeb28697f", (e.message || e)), 'error'); return; }
  }
  closeModal(); NestedItem = session.parent;
  UI.loading = true;
  try {
    Store.docs.splice(0, Store.docs.length);
    session.docs.forEach(function (doc) { Store.docs.push(doc); });
    Store.select(session.index);
    Object.keys(session.ui).forEach(function (k) { UI[k] = session.ui[k]; });
    applyUiMotion(Prefs.get('uiAnimations', true) !== false);
    Object.keys(session.dom).forEach(function (id) { var node = $(id); if (node) { clear(node); session.dom[id].forEach(function (child) { node.appendChild(child); }); } });
    ModalParents = session.modalParents;
    UIOpen = session.open; NBT_FORCE = session.nbtForce;
    if (next) session.options.commit(next);
  } finally { UI.loading = false; }
  if (session.options.render) session.options.render();
  if (next) toast(I18n.t("cadeditor.ui.screens.73fabf8734"), 'ok');
}
function returnFromNestedItem() {
  flushPendingCode();
  if (!NestedItem) return;
  var raw = ItemRawBuffers.get(Store.doc());
  if (!diffDoc(Store.doc()).length && !(raw && raw.invalid)) { finishNestedItem(false); return; }
  openModal(modalShell(I18n.t("cadeditor.ui.screens.9a4be98c7f"), I18n.t("cadeditor.ui.screens.775b98efa6"), [kHint(I18n.t("cadeditor.ui.screens.5f3edfded6"))], [
    kBtn(I18n.t("cadeditor.ui.screens.fd4b9e3b6c"), closeModal), kBtn(I18n.t("cadeditor.ui.screens.02106a70a2"), function () { finishNestedItem(false); }, { icon: 'trash' }),
    kBtn(I18n.t("cadeditor.ui.eschema.778c339528"), function () { finishNestedItem(true); }, { cls: 'pri', icon: 'check' })]));
}
/* ==================== 顶栏 ==================== */
/* ---------- 顶栏 / 底栏 / 左栏的公共零件（物品页和世界页共用，不要各写一份） ---------- */
/* 顶栏左半：图标 + 标题 + 类别标签 + 空白。o = { icon（元素）, title, crumb, crumbTitle（可省） } */
function edTopHead(bar, o) {
  bar.appendChild(h('span', { class: 'eb-ico' }, [o.icon]));
  bar.appendChild(h('span', { class: 'ttl', text: o.title }));
  var ca = { class: 'crumb', text: o.crumb }; if (o.crumbTitle !== undefined) ca.title = o.crumbTitle;
  bar.appendChild(h('span', ca));
  bar.appendChild(h('div', { class: 'grow' }));
}
/* 「应用修改」按钮。o = { dirty（有没有修改：决定变灰和提示）, count（徽标数字，0 不画）, tip, tipOff, onClick } */
function edApplyBtn(o) {
  var ap = h('div', { class: 'k-btn pri k-apply' + (o.dirty ? '' : ' dim'), title: o.dirty ? o.tip : o.tipOff }, [uiIcon(o.icon || 'play', 12), h('span', { text: o.label || I18n.t("cadeditor.ui.common.apply") }), o.count ? h('b', { text: String(o.count) }) : null]);
  activate(ap, o.onClick);
  return ap;
}
/* 全屏 / 还原按钮 */
function edMaxBtn() {
  var mx = h('div', { class: 'k-ibtn', id: 'editor-maximize', title: UI.maxed ? I18n.t("cadeditor.ui.screens.7995087e5a") : I18n.t("cadeditor.ui.screens.22ea3f47fe") }, [uiIcon(UI.maxed ? 'restore' : 'maximize', 14)]);
  activate(mx, function () { UI.maxed = !UI.maxed; applyWinStyle(); Prefs.set('windowMax', UI.maxed); setTip(mx, UI.maxed ? I18n.t("cadeditor.ui.screens.7995087e5a") : I18n.t("cadeditor.ui.screens.22ea3f47fe")); mx.firstChild.src = 'oriel:textures/icons/' + (UI.maxed ? 'restore' : 'maximize') + '.png'; });
  return mx;
}
function edCloseBtn(title, onClick) { var cl = h('div', { class: 'k-ibtn', title: title }, [uiIcon('close', 14)]); activate(cl, onClick); return cl; }
/* 底栏左边的「有没有未应用的修改」 */
function edFootChg(dirty, onText, offText) { return h('span', { class: 'it' + (dirty ? ' chg' : '') }, [h('i', { class: 'dot' }), dirty ? onText : offText]); }
/* 左栏的「预览」折叠头：右边是 2D / 3D 切换，3D 生物时还有「恢复默认视角」。
   o = { open, view（'2d' | '3d'）, can3d, showView:false（不要切换，如拿不到皮肤的玩家）, segTitle, entView, redraw }。折叠状态存在 UI.stageOpen */
function edStageHead(o) {
  var shead = h('div', { class: 'ed-stagehead' }, [foldArrow(o.open, 8), h('span', { text: I18n.t("cadeditor.ui.screens.13d61fea9f") }), h('div', { class: 'grow' })]);
  shead.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.ed-view')) return; heroFold('.ed-stage', o.open, function (v) { UI.stageOpen = v; Prefs.set('stageOpen', v); }); });
  if (o.can3d && o.open && o.showView !== false) {
    var seg = h('div', { class: 'k-seg ed-view', title: o.segTitle });
    ['2d', '3d'].forEach(function (v) {
      var b = h('div', { class: 'k-segi' + (o.view === v ? ' on' : ''), text: v.toUpperCase() });
      activate(b, function () { if (UI.heroView === v) return; UI.heroView = v; Prefs.set('heroView', v); o.redraw(); });
      seg.appendChild(b);
    });
    shead.appendChild(seg);
  }
  if (o.entView && o.open) {
    var rv = h('div', { class: 'k-mini ed-view', title: I18n.t("cadeditor.ui.screens.1575e3f66e") }, [uiIcon('undo', 11)]);
    rv.addEventListener('click', function (e) { e.stopPropagation(); UI.entView = null; var o2 = $('hero') && $('hero').querySelector('.k-ent'); if (o2) o2.remove(); o.redraw(); });
    shead.appendChild(rv);
  }
  return shead;
}
/* 左栏的「属性」折叠头。折叠状态存在 UI.statsOpen */
function edStatsHead(label, open) {
  var sh = h('div', { class: 'ed-stagehead' }, [foldArrow(open, 8), h('span', { text: label }), h('div', { class: 'grow' })]);
  sh.addEventListener('click', function () { heroFold('.ed-stats', open, function (v) { UI.statsOpen = v; Prefs.set('statsOpen', v); }); });
  return sh;
}
function drawTopbar() {
  var bar = clear($('topbar')), d = Store.doc();
  if (NestedItem) bar.appendChild(kBtn(I18n.t("cadeditor.ui.screens.2bab713fde"), returnFromNestedItem, { icon: 'back', cls: 'k-nav-back', title: NestedItem.options.title }));
  var kind = kindOfItem(d.id), info = KIND_INFO[kind];
  edTopHead(bar, { icon: itemIcon(heroItemId(d), 22), title: displayName(d), crumb: info.name, crumbTitle: d.label || '' });
  var un = h('div', { class: 'k-ibtn' + (Store.canUndo() ? '' : ' dis'), title: I18n.t("cadeditor.ui.screens.b3d5fe5c6e") }, [uiIcon('undo', 14)]); activate(un, function () { Store.undo(); });
  var re = h('div', { class: 'k-ibtn' + (Store.canRedo() ? '' : ' dis'), title: I18n.t("cadeditor.ui.screens.898084ca4f") }, [uiIcon('redo', 14)]); activate(re, function () { Store.redo(); });
  var hi = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.screens.193a768c43") }, [uiIcon('clock', 14)]); activate(hi, function () { openAdvanced('hist'); });
  var vb = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.screens.08d788da56") }, [uiIcon('chest', 14)]); activate(vb, function () { openVault(); });
  var fold = [];
  bar.appendChild(un); bar.appendChild(re); bar.appendChild(hi); bar.appendChild(vb);
  var sr = h('div', { class: 'k-search', title: I18n.t("cadeditor.ui.screens.116951f118") }, [uiIcon('search', 12), h('span', { text: I18n.t("cadeditor.ui.screens.75f684e058") }), h('span', { class: 'k-kbd', text: 'Ctrl K' })]); activate(sr, openPalette);
  var ad = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.screens.2d36ea135b") }, [uiIcon('code', 14)]); activate(ad, function () { openAdvanced(); });
  var th = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.common.settings") }, [uiIcon('sliders', 14)]); activate(th, openSettings);
  bar.appendChild(sr); bar.appendChild(ad); bar.appendChild(th);
  fold.push({ el: th, label: I18n.t("cadeditor.ui.common.settings"), icon: 'sliders', rank: 2, run: openSettings }, { el: ad, label: I18n.t("cadeditor.ui.screens.d6e61888b0"), icon: 'code', rank: 3, run: function () { openAdvanced(); } }, { el: hi, label: I18n.t("cadeditor.ui.screens.193a768c43"), icon: 'clock', rank: 4, run: function () { openAdvanced('hist'); } }, { el: re, label: I18n.t("cadeditor.ui.screens.03717b6f10"), icon: 'redo', rank: 5, run: function () { Store.redo(); } }, { el: un, label: I18n.t("cadeditor.ui.screens.926a50b98e"), icon: 'undo', rank: 6, run: function () { Store.undo(); } });
  var n = diffDoc(d).length;
  var ap = edApplyBtn({ dirty: n || (NestedItem && NestedItem.options.commitUnchanged), count: n, label: NestedItem ? I18n.t("cadeditor.ui.eschema.778c339528") : I18n.t("cadeditor.ui.common.apply"), tip: NestedItem ? I18n.t("cadeditor.ui.screens.c13b8c8cb7") : I18n.t("cadeditor.ui.screens.aafa3e9a7c"), tipOff: I18n.t("cadeditor.ui.screens.a10fdff631"), onClick: openApply });
  bar.appendChild(ap);
  bar.appendChild(edMaxBtn());
  bar.appendChild(edCloseBtn(I18n.t("cadeditor.ui.screens.7951c0e860"), closeEditor));
  /* 窗口窄时，次要按钮收进「⋯」菜单；标题自己省略，关闭 / 最大化 / 应用修改永远在 */
  var more = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.common.more"), style: 'display:none' }, [uiIcon('menu', 14)]);
  bar.insertBefore(more, ap);
  activate(more, function () { var r = more.getBoundingClientRect(); var items = fold.filter(function (f) { return f.hid; }).sort(function (a, b) { return a.rank - b.rank; }).map(function (f) { return { label: f.label, icon: f.icon, run: f.run }; }); kMenu(r.left, r.bottom + 2, items); });
  bar._fold = { fold: fold, more: more };
  fitTopbar();
}
function fitTopbar() {
  var bar = $('topbar'); if (!bar || !bar._fold) return;
  var F = bar._fold, fold = F.fold.slice().sort(function (a, b) { return a.rank - b.rank; }), scale = uiScaleFactor();
  fold.forEach(function (f) { f.hid = false; f.el.style.display = ''; }); F.more.style.display = 'none';
  var kids = Array.prototype.slice.call(bar.children), fixed = 0, n = 0;
  kids.forEach(function (c) { if (c.className && (/ttl|crumb|grow|eb-ico/.test(c.className))) return; var w = c.getBoundingClientRect().width / scale; if (w) { fixed += w; n++; } });
  var avail = bar.getBoundingClientRect().width / scale - 14 - 22 - 70 - 6 * (n + 3);
  var i = 0;
  while (fixed > avail && i < fold.length) {
    var w = fold[i].el.getBoundingClientRect().width / scale; fold[i].el.style.display = 'none'; fold[i].hid = true; fixed -= w + 6;
    if (i === 0) { F.more.style.display = ''; fixed += 30; }
    i++;
  }
}

/* 关闭：先播一个 150ms 的离场动画再关，和 showcase 的页面离场节奏一致 */
function closeEditor() {
  flushPendingCode();
  if (NestedItem) { returnFromNestedItem(); return; }
  if (typeof wpIs === 'function' && wpIs() && weDirty()) {
    openModal(modalShell(I18n.t("cadeditor.ui.screens.6405a47803"), '', [kHint(I18n.t("cadeditor.ui.screens.5f1f20a695"))], [
      kBtn(I18n.t("cadeditor.ui.screens.fd4b9e3b6c"), closeModal), kBtn(I18n.t("cadeditor.ui.screens.7e5590b331"), function () { closeModal(); closeEditorNow(); }, { icon: 'trash' })]));
    return;
  }
  closeEditorNow();
}
function closeEditorNow() {
  snd('minecraft:block.wooden_trapdoor.close', 0.4, 1.4);
  var w = $('win'); if (w) w.classList.add('leave');
  setTimeout(function () { if (typeof oriel !== 'undefined' && oriel.close) oriel.close(); }, w && uiMotionEnabled() ? 150 : 0);
}

function rebuild() {
  if (!Store.docs.length) {
    clear($('topbar')).appendChild(h('span', { class: 'ttl', text: I18n.t("cadeditor.ui.screens.75bc6c2d23") })); clear($('footer'));
    clear($('screen')).appendChild(h('div', { class: 'k-empty big', text: I18n.t("cadeditor.ui.screens.e1d60f46db") }));
    return;
  }
  drawTopbar(); drawEdit(); drawFooter();
}


/* ==================== 编辑屏 ==================== */
function heroItemId(d) { var m = d.comps.item_model || (protoOf(d.id) || {}).item_model; return m ? fullId(String(m)) : d.id; }
/* Metadata can arrive after the first generic render. Correct only that automatic
   fallback; a user-selected tab (even the same visible tab) must remain selected. */
function resolveInitialItemTab(tabs) {
  var d = Store.doc(), pending = UI.autoDefaultTab, known = liveKind(d.id) !== null;
  var first = tabs.filter(function (t) { return t.id !== 'item-stack'; })[0];
  if (pending && pending.doc !== d) { UI.autoDefaultTab = null; pending = null; }
  if (pending && known) {
    if (UI.tab === pending.tab) UI.tab = first.id;
    UI.autoDefaultTab = null;
  }
  if (!tabs.some(function (t) { return t.id === UI.tab; })) {
    UI.tab = first.id;
    UI.autoDefaultTab = !Reg.preview() && !known ? { doc:d, tab:UI.tab } : null;
  }
}
/* 标签栏上的分页：本类物品的分页 + 已相关 / 已打开的通用分页 + 附加设置 */
function tabsOfKind(kind) {
  var d = Store.doc(), tabs = (PAGES[kind] || PAGES.generic).slice(), ex = extraCompIds(d, kind);
  uniTabsFor(kind).forEach(function (t) { if (UI.uni[t.id] || uniRelevant(t, d) || (kind === 'generic' && t.id === 'u-ability')) tabs.push(t); });
  if (ex.length) tabs.push({ id: 'more', label: I18n.t("cadeditor.ui.screens.15813eebbf"), icon: 'tag', cards: ex.map(function (c) { return ['auto', c]; }) });
  tabs.unshift({ id: 'item-stack', label: I18n.t("cadeditor.ui.screens.4d04546a5c"), icon: 'code', cards: [] });
  return tabs;
}
function hiddenUniTabs(kind) {
  var shown = {}; tabsOfKind(kind).forEach(function (t) { shown[t.id] = 1; });
  return uniTabsFor(kind).filter(function (t) { return !shown[t.id]; });
}
/* 「更多 ▾」：列出还没打开的通用分页 */
function openMoreTabs(anchor) {
  if (KPop.el && KPop.owner === anchor) { kPopClose(); return; }   // 再点一次「更多」收起，而不是重新展开
  var kind = kindOfItem(Store.doc().id), list = hiddenUniTabs(kind), box = h('div', { class: 'k-moretabs' });
  list.forEach(function (t) {
    /* 一行一项：图标 + 名称；说明放在悬停提示里，菜单保持紧凑 */
    var row = h('div', { class: 'k-mt', title: t.desc || '' }, [uiIcon(t.icon, 14), h('span', { class: 'z', text: t.label })]);
    activate(row, function () { kPopClose(); UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.uni[t.id] = 1; UI.tab = t.id; drawTabbar(); drawTabBody(); });
    box.appendChild(row);
  });
  kPopover(anchor, box, { width: 190, maxHeight: 300 });
}

/* 窗口的内联样式：品类色 + 用户拖出来的窗口 / 左栏尺寸；最大化是一个类 */
function applyWinStyle() {
  var d = Store.doc(), info = d ? KIND_INFO[kindOfItem(d.id)] : null, s = '--cat:' + (info ? info.color : '#6cc349') + ';';
  var vp = uiViewport(), vw = vp.width, vh = vp.height, ww = UI.winW && vw ? Math.min(UI.winW, vw - 20) : UI.winW, wh = UI.winH && vh ? Math.min(UI.winH, vh - 20) : UI.winH;
  if (ww) s += '--ww:' + ww + 'px;'; if (wh) s += '--wh:' + wh + 'px;'; if (UI.heroW) s += '--hw:' + Math.min(UI.heroW, Math.max(110, Math.floor(((ww || vw) - 20) * 0.45))) + 'px;';
  var w = $('win'); if (!w) return; w.setAttribute('style', s); w.classList.toggle('max', !!UI.maxed);
  scheduleFit();
  if (!UI.dragging) { setTimeout(scheduleFit, 160); setTimeout(scheduleFit, 520); }
}
/* 拖动时每帧都重排很贵：量尺寸的适配（顶栏收纳、提示框高度）合并成限频执行 */
var fitT = null, rsT = null, lastVp = typeof window !== 'undefined' ? window.innerWidth + 'x' + window.innerHeight + '@' + (window.devicePixelRatio || 1) : '';
/* 视口真的变了就重算窗口样式并整页重画：布局档位、左栏、网格都按新尺寸来。弹窗开着或正在拖动时只重新量，不动页面 */
function refreshForViewport() {
  applyUiScale();
  var vp = window.innerWidth + 'x' + window.innerHeight + '@' + (window.devicePixelRatio || 1) + '/' + UI.uiScaleActive;
  if (vp === lastVp) { scheduleFit(); return; }
  lastVp = vp;
  applyWinStyle();
  if (UI.dragging || (document.querySelector && document.querySelector('.k-modal, .k-pop'))) { scheduleFit(); return; }
  try { if (typeof WE !== 'undefined' && WE.w) weRender(); else if (Store.doc()) drawEdit(); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('viewport.redraw', e); dbg(I18n.t("cadeditor.ui.screens.eee4980cc8", (e && e.message || e))); }
  scheduleFit();
}
function scheduleFit() { if (fitT) return; fitT = setTimeout(function () { fitT = null; var scale = uiScaleFactor(), wn = $('win'); if (wn) { var ww = wn.getBoundingClientRect().width / scale, narrow = ww > 100 && ww < 420; if (ww > 100) { wn.classList.toggle('narrow', narrow); wn.classList.toggle('snug', ww >= 420 && ww < 680); } var hr = $('hero'); if (hr) { var hw2 = hr.getBoundingClientRect().width / scale; if (hw2 > 20) wn.classList.toggle('hthin', UI.heroW ? hw2 < 140 : narrow); } } fitTopbar(); fitTip(); }, UI.dragging ? 110 : 0); }
/* 窗口几何有 280ms 的过渡：resize 触发时量到的是动画中间值，所以立即量一次之后，过渡结束再量一次，否则模式会停在旧的一档 */
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', function () { applyUiScale(); var wn = $('win'); if (wn) { wn.classList.add('rs'); clearTimeout(rsT); rsT = setTimeout(function () { var w2 = $('win'); if (w2) w2.classList.remove('rs'); refreshForViewport(); }, 700); } fitT = null; scheduleFit(); setTimeout(scheduleFit, 120); setTimeout(scheduleFit, 400); setTimeout(scheduleFit, 800); });
function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
/* 调试开关（高级 → 设置）：打开后关键操作会弹提示，并写进游戏日志 latest.log（前缀 [CAD-Editor-Recast]） */
function dbg(msg) {
  if (!Prefs.get('debug', false)) return;
  toast(I18n.t("cadeditor.ui.screens.d3ff1cfc7a", (msg)), 'warn');
  try { if (typeof oriel !== 'undefined' && oriel.send) oriel.send('log', { level: 'debug', msg: String(msg).substring(0, 1500) }); } catch (e) {}
}
function dragTrack(e, onMove, onEnd) {
  e.preventDefault();
  var wn = $('win'); UI.dragging = true; if (wn) wn.classList.add('dragging');
  var nMoves = 0; dbg(I18n.t("cadeditor.ui.screens.cc680f97cf", (wn ? Math.round(wn.getBoundingClientRect().width) : '?'), (window.innerWidth), (window.innerHeight), (wn && wn.classList.contains('narrow')), (UI.maxed)));
  function mv(ev) { nMoves++; onMove(ev); }
  var ended = false;
  function up() { if (ended) return; ended = true; dbg(I18n.t("cadeditor.ui.screens.7a411bade2", (nMoves), (UI.winW), (UI.heroW))); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); UI.dragging = false; var w2 = $('win'); if (w2) w2.classList.remove('dragging'); scheduleFit(); if (onEnd) onEnd(); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
function startSplit(e) {
  if (e.button !== undefined && e.button !== 0) return;
  var scale = uiScaleFactor(), x0 = e.clientX, w0 = $('hero').getBoundingClientRect().width / scale;
  dragTrack(e, function (ev) { UI.heroW = clampN(Math.round(w0 + (ev.clientX - x0) / scale), 110, Math.min(320, Math.max(110, Math.floor(uiViewport().width * 0.45)))); applyWinStyle(); }, function () { Prefs.set('heroWidth', UI.heroW); });
}
function startResize(e) {
  if (UI.maxed || (e.button !== undefined && e.button !== 0)) return;
  var scale = uiScaleFactor(), vp = uiViewport(), r = $('win').getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, w0 = r.width / scale, h0 = r.height / scale;
  dragTrack(e, function (ev) { UI.winW = clampN(Math.round(w0 + 2 * (ev.clientX - x0) / scale), 320, Math.max(320, Math.min(1600, vp.width - 20))); UI.winH = clampN(Math.round(h0 + 2 * (ev.clientY - y0) / scale), 200, Math.max(200, Math.min(1000, vp.height - 20))); applyWinStyle(); }, function () { Prefs.set('winW', UI.winW); Prefs.set('winH', UI.winH); });
}
/* 窗口把手：世界页（方块 / 实体 / 玩家）和物品页共用。#win 是同一个元素，缩放角只建一次 */
function makeSplit() {
  var split = h('div', { class: 'ed-split', title: I18n.t("cadeditor.ui.screens.839e7cef6a") });
  split.addEventListener('mousedown', startSplit); split.addEventListener('dblclick', function () { UI.heroW = 0; applyWinStyle(); Prefs.set('heroWidth', 0); });
  return split;
}
function ensureResize() {
  var wn = $('win'); if (!wn || $('edresize')) return;
  var rz = h('div', { class: 'ed-resize', id: 'edresize', title: I18n.t("cadeditor.ui.screens.138af5be97") });
  rz.addEventListener('mousedown', startResize); rz.addEventListener('dblclick', function () { UI.winW = 0; UI.winH = 0; applyWinStyle(); Prefs.set('winW', 0); Prefs.set('winH', 0); });
  wn.appendChild(rz);
}
function drawEdit() {
  migrateStackRoute();
  var host = clear($('screen')), d = Store.doc(), kind = kindOfItem(d.id), info = KIND_INFO[kind];
  var tabs = tabsOfKind(kind);
  resolveInitialItemTab(tabs);
  applyWinStyle();
  var hero = h('aside', { class: 'ed-hero', id: 'hero', title: '' });
  var split = makeSplit();
  var right = h('section', { class: 'ed-right' });
  var tabbar = h('div', { class: 'ed-tabs', id: 'tabbar' });
  tabbar.addEventListener('wheel', tabsWheel);
  var tools = h('div', { class: 'ed-tools', id: 'edtools' });
  var body = h('div', { class: 'ed-body', id: 'edbody' });
  right.appendChild(edTabsScroll(tabbar)); right.appendChild(tools); right.appendChild(body);
  host.appendChild(hero); host.appendChild(split); host.appendChild(right);
  ensureResize();
  drawHero(); drawTabbar(); drawTabBody();
}
/* 分页栏放不下时：鼠标滚轮横向滚动，按住拖动也行；当前页自动滚进可视范围。没有额外按钮。世界页 / 玩家页 / 物品页共用 */
function edTabsScroll(bar) {
  function room() { return Math.max(0, bar.scrollWidth - bar.clientWidth); }
  function to(x) { bar.scrollLeft = Math.max(0, Math.min(room(), x)); }
  bar.addEventListener('wheel', function (e) { if (!room()) return; if (e.preventDefault) e.preventDefault(); to(bar.scrollLeft + ((e.deltaY || e.deltaX) > 0 ? 80 : -80)); });
  var drag = null, moved = false;
  bar.addEventListener('mousedown', function (e) { if (room()) { drag = { x: e.clientX, left: bar.scrollLeft }; moved = false; } });
  bar.addEventListener('mousemove', function (e) { if (!drag) return; var dx = (e.clientX - drag.x) / uiScaleFactor(); if (Math.abs(dx) > 4) moved = true; if (moved) to(drag.left - dx); });
  function end() { drag = null; }
  bar.addEventListener('mouseup', end); bar.addEventListener('mouseleave', end);
  bar.addEventListener('click', function (e) { if (moved) { moved = false; if (e.stopPropagation) e.stopPropagation(); if (e.preventDefault) e.preventDefault(); } }, true);   // 拖动结束不算点击切页
  return bar;
}
function edTabsFit(bar) {
  if (!bar) return;
  var on = bar.querySelector('.ed-tab.on'), room = Math.max(0, bar.scrollWidth - bar.clientWidth);
  if (on && room) {
    var l = on.offsetLeft, r = l + on.offsetWidth;
    if (l < bar.scrollLeft) bar.scrollLeft = Math.max(0, l - 14); else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = Math.min(room, r - bar.clientWidth + 14);
  }
}
function drawTabbar() {
  var bar = clear($('tabbar')), kind = kindOfItem(Store.doc().id), tabs = tabsOfKind(kind);
  UI.shellKind = kind;
  resolveInitialItemTab(tabs);
  bar.classList.toggle('dense', tabs.length >= 4);
  tabs.forEach(function (t, i) {
    var n = t.id === 'more' ? t.cards.length : tabModCount(kind, t);
    var el = h('div', { id: 'edtab-' + t.id, class: 'ed-tab' + (UI.tab === t.id ? ' on' : ''), title: t.label + (i < 9 ? '（Ctrl+' + (i + 1) + '）' : '') }, [uiIcon(t.icon, 14), h('span', { text: t.label }), n ? h('b', { text: String(n) }) : null]);
    activate(el, function () { UI.autoDefaultTab = null; UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.tab = t.id; drawTabbar(); drawTabBody(); });
    bar.appendChild(el);
  });
  setTimeout(function () { edTabsFit(bar); }, 0);
  if (hiddenUniTabs(kind).length) { var mo = h('div', { class: 'ed-tab more', title: I18n.t("cadeditor.ui.screens.3cb3360f02") }, [uiIcon('plus', 12), h('span', { text: I18n.t("cadeditor.ui.common.more") }), uiIcon('down', 10)]); activate(mo, function () { openMoreTabs(mo); }); bar.appendChild(mo); }
  /* 分页指示条：同一个节点跨重绘保留，宿主控制器（EditorPageController）收到 ed:tabs 后用 Motion.indicator 把它滑到选中的分页下；没有控制器时它是隐藏的 */
  if (!UI.ind) UI.ind = h('i', { class: 'm-indicator ed-ind' });
  UI.ind.setAttribute('data-ed-indicator', '#edtab-' + UI.tab);
  requestAnimationFrame(function () { tabsReveal(); document.dispatchEvent(new CustomEvent('ed:tabs')); });
  decorate();
}
function refreshItemTabs() {
  var bar = $('tabbar'), kind = kindOfItem(Store.doc().id), tabs = tabsOfKind(kind);
  if (!bar || tabs.some(function (t) { return !$('edtab-' + t.id); }) || bar.querySelectorAll('.ed-tab:not(.more)').length !== tabs.length) { drawTabbar(); return; }
  tabs.forEach(function (t) {
    var el = $('edtab-' + t.id), n = t.id === 'more' ? t.cards.length : tabModCount(kind, t), badge = el.querySelector('b');
    if (!n) { if (badge) badge.remove(); }
    else if (badge) { if (badge.textContent !== String(n)) badge.textContent = String(n); }
    else el.appendChild(h('b', {text:String(n)}));
  });
  var current = tabs.filter(function (t) { return t.id === UI.tab; })[0];
  if (UI.page && current && JSON.stringify(UI.page.tab.cards) !== JSON.stringify(current.cards)) drawTabBody();
}
/* 分页栏左右滚动：滚轮（竖向滚轮也转成横向）；切换分页时把选中的分页滚进可见范围 */
function tabsReveal() {
  var bar = $('tabbar'), on = bar && bar.querySelector('.ed-tab.on'); if (!bar || !on) return;
  var scale = uiScaleFactor(), bl = bar.getBoundingClientRect().left, or = on.getBoundingClientRect(), ol = (or.left - bl) / scale + bar.scrollLeft, ow = or.width / scale;
  if (ol < bar.scrollLeft + 6) bar.scrollLeft = Math.max(0, ol - 6); else if (ol + ow > bar.scrollLeft + bar.clientWidth - 6) bar.scrollLeft = ol + ow - bar.clientWidth + 6;
}
function tabsWheel(e) {
  var bar = $('tabbar'); if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
  var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return;
  bar.scrollLeft += d > 0 ? 60 : -60; e.preventDefault();
}
/* 分页内容顶部的工具行：本页名称 + 添加设置 + 折叠全部（不再挤在分页栏里） */
function buildToolsRow(tab) {
  var add = h('div', { class: 'ed-addset', title: I18n.t("cadeditor.ui.screens.fd7d35e7fb") }, [uiIcon('plus', 14), h('span', { text: I18n.t("cadeditor.ui.screens.e0f4860f6c") })]); activate(add, openAddSetting);
  var all = h('div', { class: 'k-mini', title: I18n.t("cadeditor.ui.screens.f2843ff52e") }, [uiIcon('layers', 14)]);
  activate(all, function () { var cs = UI.page ? UI.page.cards : []; var collapse = cs.some(function (c) { return !c.el.classList.contains('collapsed'); }); cs.forEach(function (c) { if (c.setCollapsed) c.setCollapsed(collapse); }); });
  return h('div', { class: 'ed-tools' }, [h('span', { class: 'ed-tools-t', text: tab.label }), h('div', { class: 'grow' }), add, all]);
}
/* 给动态生成的控件补上 showcase 的反馈类：按钮涟漪、卡片头指针聚光（宿主控制器 Shell.setup 负责驱动；没有控制器时无效果、无副作用） */
/* 多行文本框：底部一条拖动条，可以自己拖高度（记住每一类文本框上次的高度） */
UI.taH = UI.taH || {};
function growable(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll('textarea'), function (ta) {
    if (ta._grow || !ta.parentNode) return; ta._grow = true;
    var key = ta.className || 'ta', wrap = h('div', { class: 'ta-wrap' }), grip = h('div', { class: 'ta-grip', title: I18n.t("cadeditor.ui.screens.84a82333e4") }, [h('i', {})]);
    ta.parentNode.insertBefore(wrap, ta); wrap.appendChild(ta); wrap.appendChild(grip);
    function setH(px) { ta.style.height = px + 'px'; ta.style.minHeight = px + 'px'; }
    if (UI.taH[key]) setH(UI.taH[key]);
    grip.addEventListener('mousedown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var scale = uiScaleFactor(), y0 = e.clientY, h0 = ta.getBoundingClientRect().height / scale;
      dragTrack(e, function (ev) { var nh = clampN(Math.round(h0 + (ev.clientY - y0) / scale), 40, 640); setH(nh); UI.taH[key] = nh; });
    });
    grip.addEventListener('dblclick', function () { ta.style.height = ''; ta.style.minHeight = ''; delete UI.taH[key]; });
  });
}
function decorate() {
  Array.prototype.forEach.call(document.querySelectorAll('.k-btn, .k-mini, .ed-addset, .ed-tab, .k-chip, .k-tile'), function (e) { e.classList.add('m-ripple'); });
  Array.prototype.forEach.call(document.querySelectorAll('.k-chead'), function (e) { e.classList.add('m-spot'); });
}
/* 工具栏左边的空白处：显示页面现在滚到哪一段、哪一张卡片（页签名 › 分段 › 卡片） */
var crumbTab = null, crumbT = null, crumbLast = '', crumbParts = [];
function crumbBind(body, tab) {
  crumbTab = tab;
  if (body._crumb) return; body._crumb = true;
  body.addEventListener('scroll', function () { if (crumbT) return; crumbT = setTimeout(function () { crumbT = null; updateCrumb(); }, 60); });
}
function updateCrumb() {
  var wmode = typeof weActive === 'function' && weActive();
  var body = $('edbody'), host = document.querySelector('.ed-tools-t'); if (!body || !host || (!wmode && !crumbTab)) return;
  var top = body.getBoundingClientRect().top + 12 * uiScaleFactor(), parts = [{ t: wmode ? weTabLabel() : crumbTab.label, el: null }];
  if (wmode) {
    if (body.scrollTop > 6) {
      var wc = body.querySelectorAll('.w-card'), cur2 = null;
      for (var k = 0; k < wc.length; k++) { if (wc[k].getBoundingClientRect().top <= top) cur2 = wc[k]; else break; }
      if (cur2 && cur2._card && cur2._card.spec.title) parts.push({ t: cur2._card.spec.title, el: cur2 });
    }
  } else if (body.scrollTop > 6) {
    var sec = null, secs = body.querySelectorAll('.k-sech');
    for (var i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top <= top) sec = secs[i]; else break; }
    var cards = UI.page ? UI.page.cards : [], cur = null;
    for (var j = 0; j < cards.length; j++) { var el = cards[j].el; if (!el || !el.getBoundingClientRect) continue; if (el.getBoundingClientRect().top <= top) cur = cards[j]; else break; }
    if (sec) parts.push({ t: sec.textContent, el: sec });
    if (cur && cur.spec && cur.spec.title) parts.push({ t: cur.spec.title, el: cur.el });
  }
  var key = parts.map(function (p) { return p.t; }).join('|');
  if (key === crumbLast) { crumbParts = parts; return; } crumbLast = key; crumbParts = parts;
  clear(host);
  parts.forEach(function (p, n) {
    if (n) host.appendChild(h('span', { class: 'crumb-sep', text: '›' }));
    var sp = h('span', { class: 'crumb-i' + (n === parts.length - 1 ? ' last' : ''), text: p.t, title: I18n.t("cadeditor.ui.screens.3a47ec11a9", (p.t)) });
    sp.addEventListener('click', function () { var cp = crumbParts[n], scale = uiScaleFactor(); var b = $('edbody'); if (!b) return; if (!cp.el) b.scrollTop = 0; else b.scrollTop = Math.max(0, b.scrollTop + (cp.el.getBoundingClientRect().top - b.getBoundingClientRect().top) / scale - 6); });
    host.appendChild(sp);
  });
}
function drawTabBody() {
  flushPendingCode();
  var hadCommandView = !!$('ed-command-preview');
  migrateStackRoute();
  if (typeof weDndReset === 'function') weDndReset();   // 上一页的格子和拿起状态不带过来
  var body = clear($('edbody')), d = Store.doc(), kind = kindOfItem(d.id);
  var tabs = tabsOfKind(kind); resolveInitialItemTab(tabs);
  var tab = tabs.filter(function (t) { return t.id === UI.tab; })[0];
  if (!tab) { tab = tabs.filter(function (t) { return t.id !== 'item-stack'; })[0]; UI.tab = tab.id; drawTabbar(); }
  if (tab.id === 'item-stack') {
    UI.page = { tab:tab, cards:[] }; clear($('edtools')); $('edtools').classList.add('code-tools');
    advCmd(body);
    drawFooter();
    body.scrollTop = UI.bodyScroll[tab.id] || 0; return;
  }
  $('edtools').classList.remove('code-tools');
  var items = buildTabCards(kind, tab), cards = items.filter(function (c) { return !c.marker; });
  UI.page = { tab: tab, cards: cards };
  cards.forEach(function (c) { try { c.update(); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('card.update', e); } });   // 卡片里的说明 / 效果提示要在第一次画出来时就有内容
  body.classList.remove('enter'); UI.lastTab = tab.id;
  var tr = buildToolsRow(tab), th = $('edtools'); clear(th); while (tr.firstChild) th.appendChild(tr.firstChild);
  var list = null;
  items.forEach(function (c, i) {
    if (c.marker) { var n = items[i + 1]; if (!n || n.marker) return; body.appendChild(h('div', { class: 'k-sech', text: c.marker })); list = null; return; }
    if (!list) { list = h('div', { class: 'k-list' }); body.appendChild(list); }
    list.appendChild(c.el);
  });
  if (!cards.length) body.appendChild(emptyMore());
  body.scrollTop = UI.bodyScroll[tab.id] || 0;
  crumbBind(body, tab); setTimeout(updateCrumb, 0);
  paintProblems();
  decorate();
  if (hadCommandView) drawFooter();
}

/* ---------- 英雄区 ---------- */
function stackCompsSnbt(d) { return '{' + Object.keys(d.comps).map(function (k) { return snbtKey(fullId(k)) + ':' + nbtComponentText(d, k); }).join(',') + '}'; }
/* The editor-local native parser accepts typed special floats. Never strip a
   complete component just to render an item: preview and Apply use the same data. */
function stackPreviewComps(d) {
  return { snbt: stackCompsSnbt(d) };
}
function stackPreviewSignature(text) { var hash = 0; for (var i = 0; i < text.length; i++) hash = ((hash * 31) + text.charCodeAt(i)) | 0; return text.length + ':' + hash; }
function stackPreviewProblems(d, out) {
  var problem = UI.previewProblem;
  if (problem && problem.error && problem.signature === stackPreviewSignature(stackCompsSnbt(d)))
    out.push({ level: 'warn', cid: null, path: '', msg: I18n.t("cadeditor.ui.screens.bfea7cd3ea", (problem.error)) });
}
function effComps() { return effectiveView(Store.doc()); }
function displayName(d) {
  var eff = effectiveView(d);
  if (shortId(d.id) === 'potion' && eff.custom_name === undefined && eff.potion_contents) { var pc = eff.potion_contents, p = typeof pc === 'string' ? pc : pc.potion; if (p) return potionName(p); }
  return nameOfItem(d.id);
}
function nameRuns(d) {
  var eff = effectiveView(d), v = eff.custom_name !== undefined ? eff.custom_name : null;
  var r = v === null ? null : tcRuns(v);
  return r || { base: {}, runs: [{ text: displayName(d) }] };
}
function rarityHex(d) { var r = effectiveView(d).rarity || 'common'; return { common: '#FFFFFF', uncommon: '#FFFF55', rare: '#55FFFF', epic: '#FF55FF' }[r]; }
function heroStats(d, kind) {
  var eff = effectiveView(d), out = [];
  if (kind === 'spawn') {
    /* 刷怪蛋：生成的生物和它的基础属性（entity_info）；生命值按蛋里写的 Health，没写用游戏默认 */
    var et = eggEntityOf(d), info = et ? Reg.entityInfo(et) : false, at = info && info.attributes || {}, ed = isObj(eff.entity_data) ? eff.entity_data : {};
    if (et) out.push({ icon: 'paw', label: I18n.t("cadeditor.ui.screens.61aacd674a"), value: entityName(et) });
    var hp = typeof ed.Health === 'number' ? ed.Health : at['minecraft:max_health'];
    if (typeof hp === 'number') out.push({ icon: 'shield', label: I18n.t("cadeditor.ui.labels.1a256e6376"), value: fmtNum(+hp.toFixed(2)) });
    if (typeof at['minecraft:movement_speed'] === 'number') out.push({ icon: 'boots', label: I18n.t("cadeditor.ui.screens.0129f25ebe"), value: fmtNum(+at['minecraft:movement_speed'].toFixed(3)) });
    if (typeof at['minecraft:attack_damage'] === 'number' && at['minecraft:attack_damage'] > 0) out.push({ icon: 'sword', label: I18n.t("cadeditor.ui.screens.b84ee11f4f"), value: fmtNum(+at['minecraft:attack_damage'].toFixed(2)) });
  }
  function mods(type, slots, base) { var s = base; (eff.attribute_modifiers || []).forEach(function (m) { if (shortId(m.type) === type && m.operation === 'add_value' && (m.slot === undefined || m.slot === 'any' || slots.indexOf(m.slot) >= 0)) s += nbtNumberValue(m.amount); }); return s; }
  if (kind === 'melee' || kind === 'tool') {
    var dmg = mods('attack_damage', meleeSlots(), Reg.baseAttr('minecraft:player', 'attack_damage', 1)), spd = mods('attack_speed', meleeSlots(), Reg.baseAttr('minecraft:player', 'attack_speed', 4));
    out.push({ icon: 'sword', label: I18n.t("cadeditor.ui.cards2.fb6567f1b7"), value: bigOrNum(dmg) });
    out.push({ icon: 'bolt', label: I18n.t("cadeditor.ui.cards2.bf1835a0e3"), value: I18n.t("cadeditor.ui.screens.ce3f232702", (fmtNum(+spd.toFixed(2)))) });
    out.push({ icon: 'flame', label: I18n.t("cadeditor.ui.screens.e20068e622"), value: bigOrNum(+(dmg * spd).toFixed(2)) });
    if (kind === 'tool' && eff.tool) out.push({ icon: 'pickaxe', label: I18n.t("cadeditor.ui.screens.f7ad42d0dc"), value: bigOrNum((eff.tool.rules || []).reduce(function (m, r) { return typeof r.speed === 'number' && r.speed < 1e6 ? Math.max(m, r.speed) : m; }, eff.tool.default_mining_speed || 1)) });
  } else if (kind === 'armor') {
    var e = eff.equippable, sl = e ? [e.slot, 'armor'] : ['chest', 'armor'];
    out.push({ icon: 'chestplate', label: I18n.t("cadeditor.ui.cards2.e289369cd8"), value: bigOrNum(mods('armor', sl, 0)) });
    out.push({ icon: 'shield', label: I18n.t("cadeditor.ui.cards2.5cb7a29fae"), value: bigOrNum(mods('armor_toughness', sl, 0)) });
  } else if (kind === 'food' && eff.food) {
    out.push({ icon: 'hunger', label: I18n.t("cadeditor.ui.screens.7e53fdfa1e"), value: '+' + bigOrNum(eff.food.nutrition) }); out.push({ icon: 'star', label: I18n.t("cadeditor.ui.screens.762f17e267"), value: '+' + bigOrNum(eff.food.saturation) });
  } else if (kind === 'potion') {
    var pc = eff.potion_contents; var o = typeof pc === 'string' ? { potion: pc } : (pc || {});
    out.push({ icon: 'potion_round', label: I18n.t("cadeditor.ui.cards3.cc05a1373c"), value: o.potion ? potionName(o.potion) : I18n.t("cadeditor.ui.common.none") }); out.push({ icon: 'flask', label: I18n.t("cadeditor.ui.cards3.9a71571acf"), value: I18n.t("cadeditor.ui.cards1.a88dddda1c", (String((o.custom_effects || []).length))) });
  } else if (kind === 'ebook') out.push({ icon: 'enchant', label: I18n.t("cadeditor.ui.screens.a9283c0931"), value: I18n.t("cadeditor.ui.cards1.a88dddda1c", (Object.keys(eff.stored_enchantments || {}).length)) });
  var en = eff.enchantments ? Object.keys(eff.enchantments).length : 0;
  if (kind !== 'ebook' && en) out.push({ icon: 'enchant', label: I18n.t("cadeditor.ui.cards1.5cfebda177"), value: I18n.t("cadeditor.ui.cards1.a88dddda1c", (en)) });
  out.push({ icon: 'layers', label: I18n.t("cadeditor.ui.cards1.bd96a95955"), value: String(eff.max_stack_size || 64) });
  return out;
}
function heroStatsContent(d, kind) {
  var eff = effectiveView(d), stats = h('div', { class:'ed-stats' });
  heroStats(d, kind).forEach(function (s) { stats.appendChild(h('div', { class:'k-stat' }, [h('span', {class:'sl', text:s.label}), h('b', {text:s.value})])); });
  if (typeof eff.max_damage === 'number') {
    var rem = Math.max(0, eff.max_damage - (eff.damage || 0)), ratio = Math.max(0, Math.min(1, rem / eff.max_damage));
    stats.appendChild(h('div', {class:'k-stat'}, [h('span', {class:'sl', text:I18n.t("cadeditor.ui.pages.5ad0c596f2")}), h('b', {text:fmtInt(rem) + ' / ' + fmtInt(eff.max_damage)})]));
    stats.appendChild(h('div', {class:'k-meter' + (ratio < 0.15 ? ' bad' : ratio < 0.4 ? ' warn' : '')}, [h('i', {style:'width:' + (ratio * 100) + '%'})]));
  }
  return stats;
}
// Ordinary component edits preserve the native model (including its rotation) and unrelated headings.
function refreshItemHero(cids) {
  var hero = $('hero'), d = Store.doc(), kind = kindOfItem(d.id);
  if (!hero || !cids || kind === 'bucket' || kind === 'spawn') { drawHero(); return; }
  function changed(ids) { return cids.some(function (cid) { return ids.indexOf(cid) >= 0; }); }
  if (changed(['custom_name', 'item_name', 'rarity', 'potion_contents'])) {
    var name = hero.querySelector('.ed-name'), runs = nameRuns(d);
    if (name) { clear(name); name.className = 'ed-name' + (displayName(d).length > 6 ? ' sm' : ''); renderRuns(name, runs.base, runs.runs, {color:rarityHex(d), italic:effectiveGet(d, 'custom_name') !== undefined}); }
  }
  if (changed(['rarity', '#count'])) {
    var tags = hero.querySelector('.ed-tags');
    if (tags) { clear(tags); tags.appendChild(h('span', {class:'k-tag', text:KIND_INFO[kind].name})); tags.appendChild(h('span', {class:'k-tag dim', text:RARITY_ZH[effectiveGet(d, 'rarity') || 'common']})); if (d.count > 1) tags.appendChild(h('span', {class:'k-tag dim', text:'× ' + d.count})); }
  }
  if (changed(['attribute_modifiers', 'equippable', 'food', 'tool', 'potion_contents', 'enchantments', 'stored_enchantments', 'max_damage', 'damage', 'max_stack_size'])) {
    var oldStats = hero.querySelector('.ed-stats'); if (oldStats) oldStats.parentNode.replaceChild(heroStatsContent(d, kind), oldStats);
  }
  var vis = hero.querySelector('.ed-stage model') || hero.querySelector('.ed-stage item');
  if (vis) {
    var model = fullId(heroItemId(d)), snbt = stackPreviewComps(d).snbt;
    var idAttr = vis.tagName.toLowerCase() === 'item' ? 'id' : 'item';
    if (vis.getAttribute(idAttr) !== model) vis.setAttribute(idAttr, model);
    if (vis.getAttribute('components') !== snbt) vis.setAttribute('components', snbt);
    if (vis.getAttribute('count') !== String(d.count)) vis.setAttribute('count', String(d.count));
  }
  if (changed(['enchantments', 'stored_enchantments', 'enchantment_glint_override'])) {
    var stage = hero.querySelector('.ed-stage'), eff = effectiveView(d);
    if (stage) stage.classList.toggle('glint', !!((eff.enchantments && Object.keys(eff.enchantments).length) || (eff.stored_enchantments && Object.keys(eff.stored_enchantments).length) || eff.enchantment_glint_override === true));
  }
  var tip = hero.querySelector('.k-scrollbox.tip'); if (tip) { clear(tip); tip.appendChild(buildTooltip(d, UI.tipAdv)); fitTip(); }
}
function drawHero() {
  if (typeof weActive === 'function' && weActive()) { weHero(); return; }   // 世界编辑页的左栏另画（和物品页同一套预览 / 属性折叠）
  var hero = $('hero'); if (!hero) return; var scrollTop = hero.scrollTop, oldEnt = hero.querySelector('.k-ent'); clear(hero);
  var d = Store.doc(), kind = kindOfItem(d.id), info = KIND_INFO[kind], eff = effectiveView(d);
  var ench = (eff.enchantments && Object.keys(eff.enchantments).length) || (eff.stored_enchantments && Object.keys(eff.stored_enchantments).length) || eff.enchantment_glint_override === true;
  var can3d = typeof ED_MC === 'undefined', view = can3d && UI.heroView === '3d' ? '3d' : '2d';
  var vis, entView = view === '3d' && (kind === 'spawn' && !!eggEntityOf(d) || kind === 'bucket' && !!bucketMeta(d).bucket_entity), preview = entView ? null : stackPreviewComps(d);
  if (entView) vis = kind === 'bucket' ? bucketPreview(d, oldEnt) : heroEntity(eggEntityOf(d), eff.entity_data, oldEnt);
  else if (view === '3d') { vis = h('model', { class: 'k-ico k-model', item: fullId(heroItemId(d)), rotatable: true }); vis.setAttribute('components', preview.snbt); vis.setAttribute('count', String(d.count)); }
  else { vis = itemIcon(heroItemId(d), 48); if (vis.tagName && vis.tagName.toLowerCase() === 'item') { vis.setAttribute('components', preview.snbt); vis.setAttribute('count', String(d.count)); } }
  /* 预览头：可折叠（折叠后不再渲染 3D 模型），右边是 2D / 3D 切换 */
  var open = UI.stageOpen !== false;
  hero.appendChild(edStageHead({ open: open, view: view, can3d: can3d, entView: entView, redraw: drawHero,
    segTitle: kind === 'spawn' ? I18n.t("cadeditor.ui.screens.506e11f5aa") : I18n.t("cadeditor.ui.screens.bd3e81f738") }));
  if (open) hero.appendChild(h('div', { class: 'ed-stage' + (ench ? ' glint' : '') + (entView ? ' ent' : '') }, [h('div', { class: 'plate' }), vis]));
  var nm = h('div', { class: 'ed-name' + (displayName(d).length > 6 ? ' sm' : '') }); var r = nameRuns(d);
  renderRuns(nm, r.base, r.runs, { color: rarityHex(d), italic: eff.custom_name !== undefined });
  hero.appendChild(nm);
  var tags = h('div', { class: 'ed-tags' }, [h('span', { class: 'k-tag', text: info.name }), h('span', { class: 'k-tag dim', text: RARITY_ZH[eff.rarity || 'common'] }), d.count > 1 ? h('span', { class: 'k-tag dim', text: '× ' + d.count }) : null]);
  hero.appendChild(tags);
  var stats = heroStatsContent(d, kind);
  var sOpen = UI.statsOpen !== false;
  hero.appendChild(edStatsHead(I18n.t("cadeditor.ui.eschema.86de52d178"), sOpen));
  if (sOpen) hero.appendChild(stats);
  /* 提示框预览：可折叠、限高、内部滚动，放得下几十条附魔 */
  var tipHead = h('div', { class: 'ed-tiphead' }, [foldArrow(!!UI.tipOpen, 10), h('span', { text: I18n.t("cadeditor.ui.screens.da99de323e") }), h('div', { class: 'grow' })]);
  var dbg = h('div', { class: 'k-mini' + (UI.tipAdv ? ' on' : ''), title: I18n.t("cadeditor.ui.screens.cfdfbd5801") }, [uiIcon('bug', 11)]); dbg.addEventListener('click', function (e) { e.stopPropagation(); UI.tipAdv = !UI.tipAdv; drawHero(); });
  var big = h('div', { class: 'k-mini', title: I18n.t("cadeditor.ui.screens.aafdc40cf3") }, [uiIcon('maximize', 11)]); big.addEventListener('click', function (e) { e.stopPropagation(); openTipModal(); });
  tipHead.appendChild(dbg); tipHead.appendChild(big);
  tipHead.addEventListener('click', function () { heroFold('.k-scrollbox.tip', !!UI.tipOpen, function (v) { UI.tipOpen = v; }); });
  hero.appendChild(tipHead);
  if (UI.tipOpen) {
    var tip = buildTooltip(d, UI.tipAdv);
    hero.appendChild(h('div', { class: 'k-scrollbox tip' }, [tip]));
  }
  hero.scrollTop = scrollTop;
  fitTip();
}
/* 左栏的折叠区（预览 / 属性 / 提示框预览）：收起时先滑出再重画，展开时重画后滑入，和卡片的折叠动画一致 */
function heroFold(sel, isOpen, apply) {
  var hero = $('hero'), el = hero && hero.querySelector(sel);
  /* 预览区里的 3D 模型 / 图标会跟着容器高度被压扁，滑动期间先把内容淡掉（folding），只让空的底板收放 */
  if (isOpen && el) { el.classList.add('folding'); foldArrowSet(el.previousSibling && el.previousSibling.querySelector && el.previousSibling.querySelector('.fold-arrow'), false); uiSlide(el, false, function () { apply(false); drawHero(); }); return; }
  apply(true); drawHero();
  var h2 = $('hero'), e2 = h2 && h2.querySelector(sel);
  if (e2) { e2.classList.add('folding'); uiSlide(e2, true, function () { e2.classList.remove('folding'); }); var hd = e2.previousSibling; foldArrowFrom(hd && hd.querySelector && hd.querySelector('.fold-arrow'), false, true); }
}
/* 提示框预览占满左栏下方剩余的空间：放得下就完整显示，放不下才在框内滚动 */
function fitTip() {
  var hero = $('hero'), box = hero && hero.querySelector('.k-scrollbox.tip'); if (!box) return;
  box.style.maxHeight = 'none';
  var scale = uiScaleFactor(), hr = hero.getBoundingClientRect(), br = box.getBoundingClientRect();
  var avail = Math.floor((hr.bottom - br.top) / scale - 10);
  if (avail < 80) avail = 80;
  if (br.height > avail) box.style.maxHeight = avail + 'px';
}
function openTipModal() {
  var d = Store.doc();
  openModal(modalShell(I18n.t("cadeditor.ui.screens.da99de323e"), nameOfItem(d.id), [h('div', { class: 'k-bigtip' }, [buildTooltip(d, UI.tipAdv, 'item-preview-big')])], [kBtn(I18n.t("cadeditor.ui.common.close"), closeModal, { cls: 'pri' })], 'slim'), true);
}

/* ---------- 提示框 ---------- */
var SLOT_HEAD = Labels.slotHead;
/* 提示框预览：优先显示游戏自己生成的那份（和游戏里一模一样，含模组组件、附魔、属性行）；
   宿主不可用 / 请求太大 / 出错时退回下面页面里手写的近似版。结果到之前先显示上一份（或近似版），到了再换。 */
function hostTipStack(d) {
  var typed = nbtApplyFormats(d, true), st = { id: d.id, count: d.count, comps: typed.comps, removed: clone(d.removed) };
  if (typed.formats) st.component_formats = typed.formats;
  return st;
}
function paintHostTip(box, r) {
  clear(box);
  if (!r.lines || !r.lines.length) { box.appendChild(h('div', { class: 'tl', style: 'color:#888', text: I18n.t("cadeditor.ui.screens.3ea6cd5036") })); return; }
  r.lines.forEach(function (runs) {
    var el = h('div', { class: 'tl' });
    (runs || []).forEach(function (u) {
      if (!u.text) return;
      var css = tcFontCss(u.font) + 'color:' + (u.color || '#FFFFFF') + ';' + (u.bold ? 'font-weight:bold;' : '') + (u.italic ? 'font-style:italic;' : '');
      var deco = []; if (u.underlined) deco.push('underline'); if (u.strikethrough) deco.push('line-through');
      if (deco.length) css += 'text-decoration-line:' + deco.join(' ') + ';';
      var sp = h('span', { text: u.obfuscated ? String(u.text).replace(/./g, '▒') : u.text }); sp.setAttribute('style', css); el.appendChild(sp);
    });
    box.appendChild(el);
  });
  /* 收纳袋的内容：游戏的提示框是图格，这里按图格画（物品图标 + 数量） */
  (r.extra || []).forEach(function (x) {
    if (x.type !== 'bundle' || !x.items || !x.items.length) return;
    var grid = h('div', { class: 'k-cgrid tip-bundle' }); grid.setAttribute('style', 'grid-template-columns:repeat(' + Math.min(8, x.items.length) + ',24px)');
    x.items.forEach(function (it, i) {
      var cell = h('div', { class: 'slot s34' + (i === x.selectedIndex ? ' on' : ''), title: (it.name || it.id) + ' × ' + (it.count || 1) }, [itemIcon(it.id, 18)]);
      if ((it.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(it.count) }));
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    if (x.truncated) box.appendChild(h('div', { class: 'tl', style: 'color:#888', text: I18n.t("cadeditor.ui.screens.63e5c8069c") }));
  });
}
function buildTooltip(d, adv, view) {
  view = view || 'item-preview';
  var wrap = h('div', { class: 'k-tipwrap' }), box = null;
  function show(node) { clear(wrap); wrap.appendChild(node); }
  function local() { show(buildTooltipLocal(d, adv)); }
  var last = HostTip.last[view];
  if (last && HostTip.supported === true) { box = h('div', { class: 'ed-tip' }); paintHostTip(box, last); show(box); } else local();
  HostTip.request(view, hostTipStack(d), adv, function (r) {
    if (r.fallback) { local(); return; }
    var b = h('div', { class: 'ed-tip' }); paintHostTip(b, r); show(b);
    try { fitTip(); } catch (e) {}
  });
  return wrap;
}
function buildTooltipLocal(d, adv) {
  var eff = effectiveView(d), box = h('div', { class: 'ed-tip' });
  var hid = eff.tooltip_display || {}, hidden = hid.hidden_components || [];
  if (hid.hide_tooltip) { box.appendChild(h('div', { class: 'tl', style: 'color:#888', text: I18n.t("cadeditor.ui.screens.3ea6cd5036") })); return box; }
  function line(t, color, extra) { box.appendChild(h('div', { class: 'tl' + (extra ? ' ' + extra : ''), style: 'color:' + color, text: t })); }
  var nr = nameRuns(d), nl = h('div', { class: 'tl' }); renderRuns(nl, nr.base, nr.runs, { color: rarityHex(d), italic: eff.custom_name !== undefined }); box.appendChild(nl);
  var pc = eff.potion_contents; if (pc && hidden.indexOf('minecraft:potion_contents') < 0) {
    var po = typeof pc === 'string' ? { potion: pc } : pc;
    if (po.potion) line(potionName(po.potion), '#AAAAAA');
    (po.custom_effects || []).forEach(function (fx) { var i = EFIDX[shortId(fx.id || '')]; line((i ? i.name : fx.id) + (fx.amplifier ? ' ' + levelText(fx.amplifier + 1) : '') + (fx.duration ? ' (' + fmtDur(fx.duration) + ')' : ''), i && i.kind === I18n.t("cadeditor.ui.picker.10db0d86d9") ? '#FF5555' : '#5555FF'); });
  }
  [['enchantments', eff.enchantments], ['stored_enchantments', eff.stored_enchantments]].forEach(function (p) {
    if (!isObj(p[1]) || hidden.indexOf('minecraft:' + p[0]) >= 0) return;
    Object.keys(p[1]).forEach(function (k) { var id = shortId(k), e = Reg.enchant(k); line((e ? e.name : id) + (e && e.max === 1 && p[1][k] === 1 ? '' : ' ' + levelText(p[1][k])), (function () { var re = Reg.enchant(k); return re ? re.tags.indexOf('minecraft:curse') >= 0 : false; })() ? '#FF5555' : '#AAAAAA'); });
  });
  if (Array.isArray(eff.lore)) eff.lore.forEach(function (l) { var r = tcRuns(l); var el = h('div', { class: 'tl' }); if (r) renderRuns(el, r.base, r.runs, { color: '#AA00AA', italic: true }); else el.textContent = I18n.t("cadeditor.ui.forms.a8b19fec0e"); box.appendChild(el); });
  if (eff.unbreakable !== undefined && hidden.indexOf('minecraft:unbreakable') < 0) line(I18n.t("cadeditor.ui.cards1.f1e99743e4"), '#5555FF');
  if (Array.isArray(eff.attribute_modifiers) && eff.attribute_modifiers.length && hidden.indexOf('minecraft:attribute_modifiers') < 0) {
    var by = {}; eff.attribute_modifiers.forEach(function (m) { var s = m.slot || 'any'; (by[s] = by[s] || []).push(m); });
    Object.keys(by).forEach(function (s) {
      line('', '#AAAAAA', 'gap'); line(SLOT_HEAD[s] || (s + '：'), '#AAAAAA');
      by[s].forEach(function (m) {
        if (!m.amount && m.id !== 'minecraft:base_attack_damage' && m.id !== 'minecraft:base_attack_speed') return;
        var a = ATIDX[shortId(m.type || '')], amt = m.amount || 0, pct = m.operation !== 'add_value', nmA = a ? a.name : shortId(m.type || '?');
        if (m.id === 'minecraft:base_attack_damage' && !pct) line(' ' + fmtNum(+(amt + 1).toFixed(4)) + ' ' + nmA, '#00AA00');
        else if (m.id === 'minecraft:base_attack_speed' && !pct) line(' ' + fmtNum(+(amt + 4).toFixed(4)) + ' ' + nmA, '#00AA00');
        else line((amt >= 0 ? '+' : '') + fmtNum(+(pct ? amt * 100 : amt).toFixed(4)) + (pct ? '%' : '') + ' ' + nmA, amt >= 0 ? '#5555FF' : '#FF5555');
      });
    });
  }
  if (adv) {
    if (typeof eff.max_damage === 'number' && eff.unbreakable === undefined) line(I18n.t("cadeditor.ui.screens.913c65e35c", (fmtInt(Math.max(0, eff.max_damage - (eff.damage || 0)))), (fmtInt(eff.max_damage))), '#FFFFFF', 'gap');
    line(d.id, '#555555', 'id');
    line(I18n.t("cadeditor.ui.screens.9b6e549547", (Object.keys(d.comps).length)), '#555555');
  }
  return box;
}

/* ==================== 二级窗口：高级 / 添加设置 ==================== */
var ADV_TABS = [['all', I18n.t("cadeditor.ui.screens.744bb8debb"), 'list'], ['diff', I18n.t("cadeditor.ui.screens.f8bf42f16c"), 'filter'], ['hist', I18n.t("cadeditor.ui.screens.193a768c43"), 'clock']];
function openAdvanced(which) {
  if (which) UI.adv = which;
  if (UI.adv === 'snbt' || UI.adv === 'cmd') { closeModal(); UI.cmdFmt = UI.adv === 'snbt' ? 'snbt' : 'cmd'; UI.tab = 'item-stack'; UI.adv = 'all'; drawTabbar(); drawTabBody(); return; }
  var nav = h('div', { class: 'advnav' }), main = h('div', { class: 'advmain', id: 'advmain' });
  var shell = h('div', { class: 'advbody' }, [nav, main]);
  bindColumnSplit(shell, nav, main, 'advNavWidth', 108, 40, 170);
  var win = modalShell({ icon: 'code', title: I18n.t("cadeditor.ui.screens.d6e61888b0"), sub: nameOfItem(Store.doc().id), cls: 'advwin', id: 'advwin', body: shell });
  function paintNav() {
    clear(nav);
    ADV_TABS.forEach(function (a) { var it = h('div', { class: 'advnav-i' + (UI.adv === a[0] ? ' on' : '') }, [uiIcon(a[2], 14), h('span', { text: a[1] })]); activate(it, function () { UI.adv = a[0]; paintNav(); drawAdvContent(); }); nav.appendChild(it); });
  }
  paintNav(); openModal(win, true); windowify(win, 'adv'); drawAdvContent();
}
/* Both advanced-window column boundaries use the same drag/keyboard/prefs path. */
function bindColumnSplit(parent, pane, rest, pref, fallback, minimum, reserve) {
  var saved = Prefs.get(pref, fallback), width = typeof saved === 'number' && isFinite(saved) && saved > 0 ? saved : fallback;
  var grip = h('div', {class:'ed-column-split',role:'separator',tabindex:'0','aria-orientation':'vertical',title:I18n.t("cadeditor.ui.screens.88179d39f1")});
  pane.classList.add('resizable-pane'); parent.insertBefore(grip, rest);
  function apply(next) {
    var total = parent.getBoundingClientRect().width / uiScaleFactor();
    width = clampN(Math.round(next), minimum, total > 0 ? Math.max(minimum, total - reserve - 6) : 800);
    pane.setAttribute('style', 'width:' + width + 'px;min-width:' + minimum + 'px;max-width:calc(100% - ' + (reserve + 6) + 'px);');
    grip.setAttribute('aria-valuenow', String(width));
  }
  grip.addEventListener('mousedown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation(); var x = e.clientX, initial = pane.getBoundingClientRect().width / uiScaleFactor();
    dragTrack(e, function (ev) { apply(initial + (ev.clientX - x) / uiScaleFactor()); }, function () { Prefs.set(pref, width); });
  });
  grip.addEventListener('dblclick', function () { apply(fallback); Prefs.set(pref, 0); });
  onKey(grip, {ArrowLeft:function(e){apply(width - (e.shiftKey ? 10 : 1));Prefs.setSoon(pref,width);},ArrowRight:function(e){apply(width + (e.shiftKey ? 10 : 1));Prefs.setSoon(pref,width);},Home:function(){apply(fallback);Prefs.set(pref,0);}});
  apply(width); setTimeout(function () { if (grip.parentNode) apply(width); }, 0);
}
function drawAdvContent() {
  var host = $('advmain'); if (!host) return; clear(host);
  setTimeout(function () { growable($('advmain')); }, 0);
  if (UI.adv === 'snbt' || UI.adv === 'cmd') { openAdvanced(UI.adv); return; }
  if (UI.adv === 'all') advAll(host); else if (UI.adv === 'diff') advDiff(host); else advHist(host);
}
/* 数据里的组件说明是 wiki 原文，列表里只取第一句、去掉「此组件负责…」的套话 */
function shortDesc(t) {
  t = (t || '').replace(/^此组件(负责|控制了?|用于|存储了?|记录了?)?/, '').replace(/^[，、：s]+/, '');
  var i = t.search(/[。；]/); if (i > 0) t = t.substring(0, i);
  return t;
}
function emptyMore() {
  var b = kBtn(I18n.t("cadeditor.ui.screens.e0f4860f6c"), openAddSetting, { cls: 'pri', icon: 'plus' });
  return h('div', { class: 'k-empty more' }, [h('div', { text: I18n.t("cadeditor.ui.screens.bfadd57152") }), b]);
}

/* 添加设置：给物品加上它本来没有的功能。列表按用途分组，可搜索；选中后写入合理的初始值。 */
/* 添加设置里每个组件的图标：用原版物品图（没有合适的就退回品类图标） */
var COMP_ITEM = {
  custom_model_data: 'item_frame', custom_name: 'name_tag', dyed_color: 'leather_chestplate', enchantment_glint_override: 'enchanted_book', item_model: 'glow_item_frame', item_name: 'name_tag', lore: 'writable_book', rarity: 'nether_star', tooltip_display: 'spyglass', tooltip_style: 'painting',
  break_sound: 'note_block', damage: 'iron_pickaxe', damage_resistant: 'netherite_ingot', max_damage: 'anvil', max_stack_size: 'bundle', repair_cost: 'experience_bottle', repairable: 'smithing_table', unbreakable: 'obsidian',
  attack_range: 'arrow', attribute_modifiers: 'diamond_sword', blocks_attacks: 'shield', damage_type: 'fire_charge', kinetic_weapon: 'mace', minimum_attack_charge: 'clock', piercing_weapon: 'trident', swing_animation: 'iron_sword', tool: 'diamond_pickaxe', weapon: 'netherite_sword',
  enchantable: 'enchanting_table', enchantments: 'enchanted_book', stored_enchantments: 'book',
  consumable: 'cooked_beef', death_protection: 'totem_of_undying', food: 'apple', intangible_projectile: 'spectral_arrow', ominous_bottle_amplifier: 'ominous_bottle', suspicious_stew_effects: 'suspicious_stew', use_cooldown: 'clock', use_effects: 'potion', use_remainder: 'bowl',
  banner_patterns: 'white_banner', base_color: 'blue_dye', equippable: 'iron_chestplate', glider: 'elytra', provides_banner_patterns: 'flower_banner_pattern', provides_trim_material: 'diamond', trim: 'netherite_upgrade_smithing_template',
  bees: 'bee_nest', block_entity_data: 'furnace', block_state: 'debug_stick', bucket_entity_data: 'water_bucket', bundle_contents: 'bundle', can_break: 'iron_pickaxe', can_place_on: 'grass_block', charged_projectiles: 'crossbow', container: 'chest', container_loot: 'barrel', custom_data: 'command_block', debug_stick_state: 'debug_stick', entity_data: 'pig_spawn_egg', lock: 'tripwire_hook', pot_decorations: 'decorated_pot', profile: 'player_head',
  lodestone_tracker: 'compass', map_color: 'filled_map', map_decorations: 'map', map_id: 'filled_map', recipes: 'knowledge_book', writable_book_content: 'writable_book', written_book_content: 'written_book',
  dye: 'cyan_dye', firework_explosion: 'firework_star', fireworks: 'firework_rocket', instrument: 'goat_horn', jukebox_playable: 'jukebox', note_block_sound: 'note_block', potion_contents: 'potion', potion_duration_scale: 'clock'
};
function compIcon(c) {
  var id = COMP_ITEM[c.id];
  if (!id && c.id.indexOf('/') > 0) { var mob = c.id.split('/')[0]; id = mob === 'painting' ? 'painting' : mob === 'zombie_nautilus' ? 'nautilus_shell' : mob + '_spawn_egg'; }
  var box = h('div', { class: 'ic' });
  if (id && EDATA.items.indexOf(id) >= 0) box.appendChild(itemIcon(id, 16));
  else { var cat = EDATA.cats.filter(function (k) { return k.id === c.cat; })[0]; box.appendChild(uiIcon(cat ? cat.icon : 'grid', 16)); }
  return box;
}
/* 二级窗口（高级 / 添加设置 / 详细编辑）：标题栏拖动、边缘和右下角缩放；本次打开期间记住位置和大小。
   不提供双击标题全屏：它没有还原入口，全屏态又禁用拖动，用户双击后窗口会贴在左上角动不了。 */
function windowify(win, kind) {
  var head = win.querySelector('.k-mh'); if (!head) return;
  UI.geom = UI.geom || {}; var g = UI.geom[kind] || (UI.geom[kind] = {}); g.max = false;
  function apply() {
    win.classList.toggle('max', !!g.max);
    if (g.max || g.x === undefined) { win.removeAttribute('style'); return; }
    var vp = uiViewport(), vw = vp.width, vh = vp.height;
    var mw = Math.min(kind === 'detail' ? 340 : kind === 'adv' ? 480 : 420, vw - 8), mh = Math.min(kind === 'detail' ? 260 : kind === 'adv' ? 240 : 220, vh - 8); g.w = clampN(g.w, mw, vw - 8); g.h = clampN(g.h, mh, vh - 8); g.x = clampN(g.x, 0, vw - g.w); g.y = clampN(g.y, 0, vh - g.h);
    win.setAttribute('style', 'position:absolute;margin:0;max-width:none;max-height:none;left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px;');
  }
  function snap() { var scale = uiScaleFactor(), r = win.getBoundingClientRect(); if (g.x === undefined) { g.x = r.left / scale; g.y = r.top / scale; g.w = r.width / scale; g.h = r.height / scale; } }
  head.addEventListener('mousedown', function (e) {
    if (g.max || (e.button !== undefined && e.button !== 0) || (e.target.closest && e.target.closest('.k-mini'))) return;
    snap(); var scale = uiScaleFactor(), sx = e.clientX, sy = e.clientY, x0 = g.x, y0 = g.y;
    dragTrack(e, function (ev) { g.x = x0 + (ev.clientX - sx) / scale; g.y = y0 + (ev.clientY - sy) / scale; apply(); });
  });
  /* 右边缘、下边缘、右下角三个手柄：只改宽 / 只改高 / 同时改 */
  function handle(cls, title, dx, dy) {
    var hd = h('div', { class: cls, title: title });
    hd.addEventListener('mousedown', function (e) {
      if (g.max || (e.button !== undefined && e.button !== 0)) return;
      snap(); var scale = uiScaleFactor(), sx = e.clientX, sy = e.clientY, w0 = g.w, h0 = g.h;
      dragTrack(e, function (ev) { if (dx) g.w = w0 + (ev.clientX - sx) / scale; if (dy) g.h = h0 + (ev.clientY - sy) / scale; apply(); });
    });
    win.appendChild(hd);
  }
  handle('k-medge-r', I18n.t("cadeditor.ui.screens.b5154511f0"), 1, 0); handle('k-medge-b', I18n.t("cadeditor.ui.screens.7fc4ca8148"), 0, 1); handle('k-mresize', I18n.t("cadeditor.ui.kit2.6cf2895f00"), 1, 1);
  apply();
}
var CAT_SHORT = { look: I18n.t("cadeditor.ui.screens.f9222a110a"), dura: I18n.t("cadeditor.ui.screens.9dbcd46199"), combat: I18n.t("cadeditor.ui.screens.489f3646be"), use: I18n.t("cadeditor.ui.screens.1a06abd65f"), equip: I18n.t("cadeditor.ui.screens.1b6a962362"), cont: I18n.t("cadeditor.ui.screens.4d75125c76"), book: I18n.t("cadeditor.ui.screens.45f96531ba"), fx: I18n.t("cadeditor.ui.screens.3b4b50d778") };
function openAddSetting() {
  var d = Store.doc(), kind = kindOfItem(d.id);
  var q = h('input', { class: 'k-input', type: 'text', placeholder: I18n.t("cadeditor.ui.screens.0ba1d06b05"), spellcheck: 'false' });
  var catSel = 'all';
  var cats = h('div', { class: 'addcats' }), list = h('div', { class: 'addlist' });
  function covered(cid) { return coveredComps(kind)[cid]; }
  function paintCats() {
    clear(cats);
    [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }].concat(EDATA.cats.filter(function (c) { return c.id !== 'variant'; })).forEach(function (c) { var t = h('div', { class: 'addcat' + (catSel === c.id ? ' on' : '') }, [uiIcon(c.icon || 'grid', 14), h('span', { text: CAT_SHORT[c.id] || c.name })]); activate(t, function () { catSel = c.id; paintCats(); paint(); }); cats.appendChild(t); });
  }
  function paint() {
    clear(list); var s = q.value.trim().toLowerCase(), n = 0;
    EDATA.comps.forEach(function (c) {
      if (c.cat === 'variant' && catSel !== 'variant') return;
      if (catSel !== 'all' && c.cat !== catSel) return;
      if (s && !kMatch(c.id + c.name + c.desc, s)) return;
      n++;
      var has = effectiveView(Store.doc())[c.id] !== undefined;
      var row = h('div', { class: 'addrow' + (has ? ' has' : '') }, [compIcon(c), h('div', { class: 'tx' }, [h('div', { class: 'z', text: c.name }), h('div', { class: 's', text: shortDesc(c.desc) })]), has ? h('span', { class: 'k-tag dim', text: I18n.t("cadeditor.ui.picker.20d2382f10") }) : h('span', { class: 'k-tag', text: I18n.t("cadeditor.ui.cards3.7a8a11ead5") })]);
      activate(row, function () { closeModal(); addSetting(c.id); });
      list.appendChild(row);
    });
    if (!n) list.appendChild(h('div', { class: 'k-empty', text: I18n.t("cadeditor.ui.screens.211cd76a9c") }));
  }
  var sbox = kSearchBox(q, paint);
  var win = modalShell({ icon: 'plus', title: I18n.t("cadeditor.ui.screens.e0f4860f6c"), sub: I18n.t("cadeditor.ui.screens.a351ecd609"), cls: 'addwin', body: h('div', { class: 'addbody' }, [cats, h('div', { class: 'addmain' }, [h('div', { class: 'addtop' }, [sbox.el]), list])]) });
  paintCats(); paint(); openModal(win, true); windowify(win, 'add'); q.focus();
}
/* 把一个组件加到物品上，然后跳到能编辑它的那一页 */
function addSetting(cid) {
  var d = Store.doc(), kind = kindOfItem(d.id), c = CIDX[cid];
  if (effectiveView(d)[cid] === undefined) Store.set(cid, defaultFor(c.schema), { structural: true, label: I18n.t("cadeditor.ui.screens.a096166f25", (c.name)) });
  var tabs = tabsOfKind(kind), at = tabs.filter(function (t) { return t.cards.some(function (k) { return cardComps(k).indexOf(cid) >= 0; }); })[0];
  UI.tab = (at || tabs[tabs.length - 1]).id; drawTabbar(); drawTabBody();
  toast(I18n.t("cadeditor.ui.screens.89b86c31c1", (c.name)), 'ok');
}
function advAll(host) {
  var d = Store.doc(), wrap = h('div', { class: 'adv' }), left = h('div', { class: 'adv-l' }), right = h('div', { class: 'adv-r' });
  var q = h('input', { class: 'k-input', type: 'text', value: UI.advQ, placeholder: I18n.t("cadeditor.ui.screens.965666a6af", (EDATA.comps.length)), spellcheck: 'false' });
  var list = h('div', { class: 'adv-list' });
  function paint() {
    clear(list); var s = UI.advQ.trim().toLowerCase();
    var proto = protoOf(d.id), chg = [], inh = [], rest = [];
    EDATA.comps.forEach(function (c) { if (s && !kMatch(c.id + c.name + c.desc, s)) return; var it = intentOf(d, c.id); if (it !== 'inherit') chg.push(c); else if (proto[c.id] !== undefined) inh.push(c); else rest.push(c); });
    function grp(t, arr, cls) { if (!arr.length) return; list.appendChild(h('div', { class: 'adv-grp ' + (cls || ''), text: t + ' ' + arr.length })); arr.forEach(function (c) { var it = intentOf(d, c.id); var row = h('div', { class: 'adv-row' + (UI.advSel === c.id ? ' on' : ''), title: 'minecraft:' + c.id + '\n' + c.desc }, [h('span', { class: 'z', text: c.name }), h('i', { class: 'st ' + it })]); activate(row, function () { UI.advSel = c.id; paint(); drawAdvForm(right); }); list.appendChild(row); }); }
    grp(I18n.t("cadeditor.ui.screens.682d211b71"), chg, 'chg'); grp(I18n.t("cadeditor.ui.screens.d8bf541d6f"), inh); grp(I18n.t("cadeditor.ui.screens.dea72dd9f0"), rest);
  }
  var sbox = kSearchBox(q, function (v) { UI.advQ = v; paint(); });
  left.appendChild(sbox.el); left.appendChild(list); wrap.appendChild(left); wrap.appendChild(right); host.appendChild(wrap);
  bindColumnSplit(wrap, left, right, 'advListWidth', 150, 84, 80);
  paint(); drawAdvForm(right);
}
function drawAdvForm(host) {
  clear(host); var d = Store.doc(), cid = UI.advSel, c = cid && CIDX[cid];
  if (!c) { host.appendChild(h('div', { class: 'k-empty', text: I18n.t("cadeditor.ui.screens.c36772006a") })); return; }
  var it = intentOf(d, cid), proto = protoOf(d.id)[cid];
  var head = h('div', { class: 'ed-fhead' }, [h('div', { class: 'ttl' }, [h('div', {}, [h('div', { class: 'z', text: c.name }), h('div', { class: 'id', text: 'minecraft:' + cid })])]),
    kSeg([{ v: 'inherit', label: proto !== undefined ? I18n.t("cadeditor.ui.screens.0ac766509b") : I18n.t("cadeditor.ui.common.unset") }, { v: 'set', label: I18n.t("cadeditor.ui.screens.4ce4c98eb2") }, { v: 'remove', label: I18n.t("cadeditor.ui.cards1.6135d4159e") }], it, function (v) {
      if (v === 'set') { var val = d.comps[cid] !== undefined ? d.comps[cid] : (proto !== undefined ? clone(proto) : defaultFor(c.schema)); Store.set(cid, val, { structural: true, label: I18n.t("cadeditor.ui.screens.9c84ed99cb", (c.name)) }); }
      else if (v === 'inherit') Store.inherit(cid); else Store.remove(cid);
    }).el]);
  host.appendChild(head); host.appendChild(h('div', { class: 'ed-desc', text: c.desc + (c.app ? ' — ' + c.app : '') }));
  if (c.note) host.appendChild(h('div', { class: 'ed-note', text: c.note }));
  var body = h('div', { class: 'ed-fbody' });
  if (it === 'set') body.appendChild(renderComponentForm(cid, d.comps[cid], function (v, o) { Store.set(cid, v, { key: 'f-' + cid + (o && o.key ? o.key : ''), structural: false }); }, d));
  else if (it === 'remove') body.appendChild(h('div', { class: 'ed-state remove' }, [uiIcon('trash', 14), h('div', {}, [h('b', { text: I18n.t("cadeditor.ui.screens.de1c48dacb") }), h('p', { text: I18n.t("cadeditor.ui.screens.709ef7365c", (cid)) })])]));
  else { body.appendChild(h('div', { class: 'ed-state' }, [uiIcon('info', 14), h('div', {}, [h('b', { text: proto !== undefined ? I18n.t("cadeditor.ui.screens.650bfc8d31") : I18n.t("cadeditor.ui.screens.5d8c6bd818") }), h('p', { text: proto !== undefined ? I18n.t("cadeditor.ui.screens.3f19a33130") : I18n.t("cadeditor.ui.screens.1c084d54a8") })])])); if (proto !== undefined) body.appendChild(h('pre', { class: 'ed-code', text: toSnbt(proto, c.schema, true) })); }
  host.appendChild(body);
}
var NL = String.fromCharCode(10);
function stackSnbt(d) {
  var parts = [];
  Object.keys(d.comps).sort().forEach(function (k) { parts.push('    ' + snbtKey(fullId(k)) + ': ' + nbtPrint(nbtParse(nbtComponentText(d, k)), true, '    ')); });
  Object.keys(d.removed).sort().forEach(function (k) { parts.push('    ' + snbtKey('!' + fullId(k)) + ': {}'); });
  var body = parts.length ? '{' + NL + parts.join(',' + NL) + NL + '  }' : '{}';
  return '{' + NL + '  id: ' + snbtStr(d.id) + ',' + NL + '  count: ' + d.count + ',' + NL + '  components: ' + body + NL + '}';
}
function stackNbt(d) { var comps = {}; Object.keys(d.comps).sort().forEach(function (k) { nbtOwn(comps, fullId(k), parseSnbt(nbtComponentText(d, k))); }); Object.keys(d.removed).sort().forEach(function (k) { nbtOwn(comps, '!' + fullId(k), {}); }); return { id: d.id, count: d.count, components: comps }; }
function advSnbt(host) {
  var d = Store.doc(), err = h('div', { class: 'ed-err' }), code = kCode({ value: stackSnbt(d), height: 420, mode: 'edit', onApply: function () { apply(); } });
  function apply() {
    try {
      var p = parseSnbtUser(code.get()); if (!isObj(p)) throw new Error(I18n.t("cadeditor.ui.screens.bf2a5e9241"));
      var comps = {}, removed = {}, src = p.components || {};
      Object.keys(src).forEach(function (k) { if (k.charAt(0) === '!') nbtOwn(removed, shortId(k.substring(1)), 1); else nbtPut(comps, shortId(k), nbtTake(src, k)); });
      var id = typeof p.id === 'string' ? fullId(p.id) : d.id; if (!knownItem(id) && (Reg.preview() || Reg.entryState('item', id) === false)) throw new Error(I18n.t("cadeditor.ui.screens.348c3028cb", (id)));
      d.id = id; d.count = typeof p.count === 'number' ? p.count : d.count; Store.replace(comps, removed, I18n.t("cadeditor.ui.screens.467e9bf011")); err.textContent = ''; toast(I18n.t("cadeditor.ui.screens.79a63caeba"), 'ok');
    } catch (e) { var b = code.get().substring(0, e.pos || 0), ln = b.split(NL).length, col = b.length - b.lastIndexOf(NL); err.textContent = I18n.t("cadeditor.ui.screens.a86b4d31e9", (ln), (col), (e.message)); }
  }
  host.appendChild(h('div', { class: 'pad' }, [h('div', { class: 'ed-sbar' }, [h('span', { class: 'ed-hint grow', text: I18n.t("cadeditor.ui.screens.a62e8043d1") }), kBtn(I18n.t("cadeditor.ui.screens.6dbf9ddbc9"), apply, { cls: 'pri' })]), code.el, err]));
}
/* A view-local text buffer: invalid edits survive tab redraws without overwriting the valid typed draft. */
var ItemRawBuffers = new WeakMap();
function itemRawBlocked() { flushPendingCode(); var b = ItemRawBuffers.get(Store.doc()); return b && b.invalid; }
function drawItemRaw(host) {
  var d = Store.doc(), current = snapOf(d), buffer = ItemRawBuffers.get(d);
  if (!buffer) { buffer = { text:stackSnbt(d), base:current, invalid:false }; ItemRawBuffers.set(d, buffer); }
  if (!buffer.pending && !buffer.invalid && buffer.base !== current) { buffer.text = stackSnbt(d); buffer.base = current; if (buffer.code) buffer.code.set(buffer.text, true); }
  if (buffer.view) { host.appendChild(buffer.view); edCodeTools(buffer.code.toolbar); edCodeTools(buffer.reload, 'reload'); return; }
  var err = h('div', { class:'ed-err', text:buffer.invalid ? I18n.t("cadeditor.ui.screens.2d5214ef9b") : '' });
  var code = kCode({ value:buffer.text, height:520, onText:function (text) { buffer.text = text; buffer.pending = true; }, onInput:function (text, error, parsed) {
    buffer.text = text; buffer.pending = false;
    try {
      if (buffer.base !== snapOf(d)) throw new Error(I18n.t("cadeditor.ui.screens.622766f006"));
      if (error) throw new Error(error.message);
      var p = parsed;
      if (!isObj(p) || typeof p.id !== 'string' || !p.id) throw new Error(I18n.t("cadeditor.ui.screens.8439bd6d3b"));
      var id = fullId(p.id), count = nbtNumberValue(p.count);
      if (!Number.isInteger(count) || count < 1 || count > 2147483647) throw new Error(I18n.t("cadeditor.ui.screens.65f07d0cf5"));
      if (p.components !== undefined && !isObj(p.components)) throw new Error(I18n.t("cadeditor.ui.screens.718e6ee561"));
      var comps = {}, removed = {};
      Object.keys(p.components || {}).forEach(function (key) {
        if (key.charAt(0) === '!') nbtOwn(removed, shortId(key.slice(1)), 1);
        else nbtPut(comps, shortId(key), nbtTake(p.components, key));
      });
      // One existing history event, without rebuilding the active native textarea.
      UI.rawEditing = true;
      try { d.id = id; d.count = count; Store.replace(comps, removed, I18n.t("cadeditor.ui.screens.39247a5255")); } finally { UI.rawEditing = false; }
      buffer.base = snapOf(d); buffer.invalid = false; err.textContent = '';
    } catch (e) { buffer.invalid = true; err.textContent = I18n.t("cadeditor.ui.screens.c756a13a72", (e.message || e)); if (typeof Drafts !== 'undefined') Drafts.touch(); }
  } });
  var reload = kBtn('', function () { buffer.text = stackSnbt(d); buffer.base = snapOf(d); buffer.pending = false; buffer.invalid = false; code.set(buffer.text, true); err.textContent = ''; }, { icon:'refresh', title:I18n.t("cadeditor.ui.screens.a2f99c008b") });
  reload.classList.add('kc-reload'); reload.setAttribute('aria-label', I18n.t("cadeditor.ui.screens.9577e06ada"));
  buffer.reload = reload;
  buffer.code = code; buffer.view = h('div', { class:'pad item-raw' }, [code.el, err]);
  host.appendChild(buffer.view); edCodeTools(code.toolbar); edCodeTools(reload, 'reload');
}
function migrateStackRoute() {
  if (UI.tab === 'raw' || UI.tab === 'commands') { if (UI.tab === 'raw') UI.cmdFmt = 'snbt'; UI.tab = 'item-stack'; }
  if (UI.adv === 'snbt' || UI.adv === 'cmd') { UI.cmdFmt = UI.adv === 'snbt' ? 'snbt' : 'cmd'; UI.adv = 'all'; UI.tab = 'item-stack'; }
}
function edCodeTools(node, slot) {
  var tools = $('edtools'); tools.classList.add('code-tools');
  if (slot === 'modes') { node.classList.add('ed-code-modes'); tools.appendChild(node); return; }
  if (slot === 'reload') { tools.appendChild(node); return; }
  var actions = tools.querySelector('.ed-code-actions');
  if (!actions) {
    actions = h('div', { class:'ed-code-actions' }); tools.appendChild(actions);
    actions.addEventListener('wheel', function (e) { if (actions.scrollWidth <= actions.clientWidth) return; e.preventDefault(); e.stopPropagation(); actions.scrollLeft += e.deltaX || e.deltaY; });
  }
  actions.appendChild(node);
}
function advCmd(host) {
  var format = kSeg([{ v: 'cmd', label: I18n.t("cadeditor.ui.screens.928f87d450") }, { v: 'snbt', label: 'SNBT' }, { v: 'json', label: 'JSON' }], UI.cmdFmt, function (v) { UI.cmdFmt = v; drawTabBody(); });
  edCodeTools(format.el, 'modes');
  if (UI.cmdFmt === 'snbt') { drawItemRaw(host); return; }
  var d = Store.doc(), out = h('textarea', { class: 'ed-out', readonly: true, rows: '6', spellcheck: 'false' });
  function text() { if (UI.cmdFmt === 'snbt') return stackSnbt(d); if (UI.cmdFmt === 'json') return JSON.stringify(stackNbt(d), null, 2); return buildCommand(d, UI.cmdMode, UI.cmdSel); }
  out.value = text();
  var code = UI.cmdFmt === 'cmd' ? null : kCode({ value: out.value, readonly: true, language: UI.cmdFmt, height: 420 });
  // Native textareas only wrap at spaces; an entire component payload is one word.
  // A selectable text preview can wrap within it without altering the copied command.
  var commandView = UI.cmdFmt === 'cmd' ? h('pre', { class: 'ed-command', id: 'ed-command-preview', tabindex: '0' }) : null;
  if (commandView) commandView.commandProblem = commandNumberIssue(d);
  var copyWarnedFor = null, cnt = h('span', { class: 'k-sub' });
  function len() {
    cnt.textContent = I18n.t("cadeditor.ui.screens.a12d68433c", (out.value.length));
    if (commandView) commandView.textContent = out.value;
    copyWarnedFor = null;
    if (copy) { copy.querySelector('span').textContent = I18n.t("cadeditor.ui.common.copy"); setTip(copy, ''); }
  }
  len();
  var pad = h('div', { class: 'pad' });
  if (code) edCodeTools(code.toolbar);
  if (UI.cmdFmt === 'cmd') {
    pad.appendChild(fieldRow(I18n.t("cadeditor.ui.screens.7513a56245"), kSeg(CMD_MODES.map(function (m) { return { v: m.id, label: m.name }; }), UI.cmdMode, function (v) { UI.cmdMode = v; out.value = text(); len(); }).el));
    /* 命令方块、函数、服务器控制台里没有「执行者」，@s 会报「没有找到实体」：按执行位置给对应的写法 */
    var selIn = kInput(UI.cmdSel, function (v) { UI.cmdSel = v || '@s'; out.value = text(); len(); syncWhere(); }, { placeholder: I18n.t("cadeditor.ui.screens.5f87d753cd") });
    var whereSeg;
    function whereOf() { return UI.cmdSel === '@s' ? 'chat' : UI.cmdSel === '@p' ? 'block' : 'name'; }
    function syncWhere() { if (whereSeg) whereSeg.set(whereOf()); }
    whereSeg = kSeg([{ v: 'chat', label: I18n.t("cadeditor.ui.screens.323ad0cd4f") }, { v: 'block', label: I18n.t("cadeditor.ui.screens.16a0dbdcfa") }, { v: 'name', label: I18n.t("cadeditor.ui.screens.dc393e16f0") }], whereOf(), function (v) {
      UI.cmdSel = v === 'chat' ? '@s' : v === 'block' ? '@p' : (/^[A-Za-z0-9_]{1,16}$/.test(UI.cmdSel) ? UI.cmdSel : I18n.t("cadeditor.ui.screens.4498621999"));
      selIn.value = UI.cmdSel; out.value = text(); len();
      if (v === 'name') { selIn.focus(); }
    });
    pad.appendChild(fieldRow(I18n.t("cadeditor.ui.screens.ca2904ca1f"), whereSeg.el));
    pad.appendChild(fieldRow(I18n.t("cadeditor.ui.screens.7452ececd4"), selIn));
    pad.appendChild(kHint(I18n.t("cadeditor.ui.screens.c7e0180f7a"), 'hint'));
  }
  pad.appendChild(code ? code.el : commandView);
  /* 页面脚本不能写剪贴板（Oriel 沙箱设计）：宿主声明 hostClip 后，把文本交给宿主写入；没有宿主时退回「全选，请按 Ctrl+C」 */
  var copy = kBtn(I18n.t("cadeditor.ui.common.copy"), function () {
    if (commandView && commandView.commandProblem && copyWarnedFor !== out.value) {
      var issue = commandView.commandProblem;
      if (typeof EditorDiag !== 'undefined') EditorDiag.warn('command.export.unsupported_number', new Error(issue.msg + ' field=' + issue.cid + '.' + issue.path));
      copyWarnedFor = out.value; copy.querySelector('span').textContent = I18n.t("cadeditor.ui.screens.556889beb3");
      setTip(copy, I18n.t("cadeditor.ui.screens.b90e845c09"));
      toast(issue.msg, 'warn', 'command-number-warning'); return;
    }
    toastDismiss('command-number-warning');
    copyText(out.value, UI.cmdFmt === 'json' ? 'JSON' : I18n.t("cadeditor.ui.screens.928f87d450"));
  }, { icon: 'copy', cls: commandView && commandView.commandProblem ? 'dng strong' : '' });
  pad.appendChild(h('div', { class: 'ed-sbar' }, [cnt, h('div', { class: 'grow' }), copy, kBtn(I18n.t("cadeditor.ui.screens.bd943ab9fc"), function () { applyToGame(); }, { cls: 'pri', icon: 'play' })]));
  host.appendChild(pad);
}
function advDiff(host) {
  var d = Store.doc(), df = diffDoc(d), pad = h('div', { class: 'pad' });
  var top = h('div', { class: 'ed-sbar' }, [h('div', { class: 'grow k-lbl', text: df.length ? I18n.t("cadeditor.ui.screens.7d85ffab38", (df.length)) : I18n.t("cadeditor.ui.screens.b57aba52d5") })]);
  if (df.length) top.appendChild(kBtn(I18n.t("cadeditor.ui.screens.bff7a7967a"), function () { Store.revertAll(); toast(I18n.t("cadeditor.ui.screens.097a43c4fe"), 'ok'); }, { cls: 'dng', icon: 'restore' }));
  pad.appendChild(top);
  df.forEach(function (x) {
    var ds = describeDiff(x);
    var row = h('div', { class: 'ed-diff ' + ds.kind }, [h('div', { class: 'hd' }, [h('b', { class: 'sg', text: { add: '＋', rm: '－', ch: '～', rv: '↺' }[ds.kind] }), h('span', { class: 'nm', text: ds.name, title: x.cid.charAt(0) === '#' ? '' : x.cid }), h('div', { class: 'grow' })])]);
    describeDiffRows(x,d).forEach(function (change) { row.appendChild(changeRow(change)); });
    if (x.cid.charAt(0) !== '#') row.querySelector('.hd').appendChild(kBtn(I18n.t("cadeditor.ui.screens.dde545dd30"), function () { revertComp(Store.doc(), x.cid); Store.replace(Store.doc().comps, Store.doc().removed, I18n.t("cadeditor.ui.screens.f9f674c337", (ds.name))); }));
    pad.appendChild(row);
  });
  if (!df.length) pad.appendChild(h('div', { class: 'k-empty', text: I18n.t("cadeditor.ui.screens.de31a7855a") }));
  host.appendChild(pad);
}
function advHist(host) {
  var d = Store.doc(), pad = h('div', { class: 'pad' });
  pad.appendChild(h('div', { class: 'k-lbl', text: I18n.t("cadeditor.ui.screens.d49a181e83") }));
  var wrap = h('div', { class: 'k-scrollbox tall' });
  for (var i = d.hist.length - 1; i >= 0; i--) (function (i) { var e = d.hist[i]; var row = h('div', { class: 'k-hist' + (i === d.hi ? ' on' : '') + (i > d.hi ? ' future' : '') }, [h('span', { class: 'ix', text: String(i) }), h('span', { text: e.label })]); activate(row, function () { Store.jump(i); }); wrap.appendChild(row); })(i);
  pad.appendChild(wrap); host.appendChild(pad);
}

/* ==================== 底栏 / 应用 ==================== */
/* 问题列表：点一条就跳到对应的分页和卡片，展开它并闪一下 */
function openProblems(anchor, list) {
  var box = h('div', { class: 'k-moretabs k-problems' });
  list.forEach(function (p) {
    var row = h('div', { class: 'k-mt', title:p.msg }, [uiIcon(p.level === 'error' ? 'close' : 'warning', 14), h('div', { class: 'tx' }, [h('div', { class: 'z', text: p.msg }), p.cid && p.cid.charAt(0) !== '#' ? h('div', { class: 's', text: (CIDX[p.cid] ? CIDX[p.cid].name : p.cid) }) : null])]);
    row.addEventListener('mousedown', function (e) { e.preventDefault(); kPopClose(); jumpToComp(p.cid, p.msg); });
    box.appendChild(row);
  });
  kPopover(anchor, box, { width: 360, maxHeight: 260 });
}
/* 问题直接写在出问题的那张卡片上（标题下面，折叠时也看得见），而不是只在底栏显示数量 */
function paintProblems() {
  if (!UI.page) return;
  var pr = validateDoc(Store.doc());
  UI.page.cards.forEach(function (c) {
    var mine = pr.filter(function (p) { var cid = p.cid === '#count' ? 'max_stack_size' : p.cid; return cid && c.comps.indexOf(cid) >= 0; });
    var problemKey = JSON.stringify(mine) + ':' + !!UIOpen['prob:' + (c.spec.id || c.spec.title)];
    if (c.problemKey === problemKey) return; c.problemKey = problemKey;
    var old = c.el.querySelector('.k-probline'); if (old) old.remove();
    c.el.classList.toggle('has-err', mine.some(function (p) { return p.level === 'error'; }));
    c.el.classList.toggle('has-warn', !c.el.classList.contains('has-err') && mine.length > 0);
    if (!mine.length) return;
    /* 按危险度排：错误在前，提醒在后；最多直接显示 2 条，其余折叠成一行「还有 N 条」 */
    var rank = { error: 0, warn: 1 };
    mine.sort(function (x, y) { return (rank[x.level] === undefined ? 2 : rank[x.level]) - (rank[y.level] === undefined ? 2 : rank[y.level]); });
    var pkey = 'prob:' + (c.spec.id || c.spec.title), open = !!UIOpen[pkey], shown = mine.slice(0, 2);
    function line(p) { return h('div', { class: 'pl ' + p.level }, [uiIcon(p.level === 'error' ? 'close' : 'warning', 12), h('span', { text: p.msg })]); }
    var box = h('div', { class: 'k-probline' }, shown.map(line));
    var extra = open && mine.length > 2 ? h('div', { class: 'pl-extra' }, mine.slice(2).map(line)) : null;
    if (extra) box.appendChild(extra);
    if (mine.length > 2) {
      var hid = mine.slice(2), he = hid.filter(function (p) { return p.level === 'error'; }).length;
      var tg = h('div', { class: 'pl more' }, [foldArrow(open, 8), h('span', { text: open ? I18n.t("cadeditor.ui.screens.afd4b78353") : I18n.t("cadeditor.ui.screens.25f9ce61c7", (hid.length), (he ? I18n.t("cadeditor.ui.screens.0d2a1695eb", (he)) : I18n.t("cadeditor.ui.screens.8f29b3132c"))) })]);
      /* 展开 / 收起带滑动和箭头旋转：收起先滑出再重画，展开重画后滑入 */
      activate(tg, function () {
        if (open && extra) { foldArrowSet(tg.querySelector('.fold-arrow'), false); uiSlide(extra, false, function () { UIOpen[pkey] = false; paintProblems(); }); return; }
        UIOpen[pkey] = true; paintProblems();
        var ex2 = c.el.querySelector('.pl-extra'), ar2 = c.el.querySelector('.pl.more .fold-arrow');
        if (ex2) uiSlide(ex2, true); foldArrowFrom(ar2, false, true);
      });
      box.appendChild(tg);
    }
    c.el.insertBefore(box, c.el.querySelector('.k-cbody'));
  });
}
function jumpToComp(cid, msg) {
  if (cid === '#count') cid = 'max_stack_size';   /* 数量超过最大堆叠：去改「最大堆叠」那张卡 */
  if (!cid || cid.charAt(0) === '#') { toast(msg || I18n.t("cadeditor.ui.screens.aa4da3a4e4"), 'info'); return; }
  var d = Store.doc(), kind = kindOfItem(d.id), tabs = tabsOfKind(kind);
  var at = tabs.filter(function (t) { return t.cards.some(function (k) { return cardComps(k).indexOf(cid) >= 0; }); })[0];
  if (!at) { openAdvanced('all'); return; }
  if (UI.tab !== at.id) { UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.tab = at.id; drawTabbar(); drawTabBody(); }
  var card = UI.page ? UI.page.cards.filter(function (c) { return c.comps.indexOf(cid) >= 0; })[0] : null;
  if (!card) return;
  if (card.setCollapsed) card.setCollapsed(false);
  var body = $('edbody');
  setTimeout(function () {
    body.scrollTop = Math.max(0, body.scrollTop + (card.el.getBoundingClientRect().top - body.getBoundingClientRect().top) / uiScaleFactor() - 6);
    card.el.classList.add('m-attention'); setTimeout(function () { card.el.classList.remove('m-attention'); }, 1800);
    if (msg) toast(msg, 'info');
  }, 30);
}
function drawFooter() {
  var f = clear($('footer'));
  f.classList.remove('has-problem');
  var d = Store.doc(), n = diffDoc(d).length, pr = validateDoc(d), commandView = $('ed-command-preview');
  if (commandView && commandView.commandProblem) pr.push(commandView.commandProblem);
  var errs = pr.filter(function (p) { return p.level === 'error'; }), warns = pr.filter(function (p) { return p.level === 'warn'; }), pendingInfo = pr.filter(function (p) { return p.level === 'info' && p.msg.indexOf(I18n.t("cadeditor.ui.screens.49ecd0e342")) >= 0; });
  f.appendChild(edFootChg(n, I18n.t("cadeditor.ui.screens.d0aa2b57dc", (n)), I18n.t("cadeditor.ui.screens.4652d9b19a")));
  if (n) { var lk = h('span', { class: 'lnk', text: I18n.t("cadeditor.ui.screens.06c7262cc3") }); lk.addEventListener('click', openApply); f.appendChild(lk); }
  function problemChip(cls, icon, list, label) {
    var el = h('span', { class: 'it ' + cls + ' pcl', title: I18n.t("cadeditor.ui.screens.a2090bccaa") }, [uiIcon(icon, 12), I18n.t("cadeditor.ui.screens.817914fdce", (list.length), (label))]);
    activate(el, function () { if (list.length === 1 && list[0].cid) { jumpToComp(list[0].cid, list[0].msg); return; } openProblems(el, list); });
    return el;
  }
  if (errs.length) f.appendChild(problemChip('bad', 'close', errs, I18n.t("cadeditor.ui.screens.0bc1fb72ae")));
  if (warns.length) f.appendChild(problemChip('wr', 'warning', warns, I18n.t("cadeditor.ui.screens.8f29b3132c")));
  if (pendingInfo.length) f.appendChild(problemChip('', 'clock', pendingInfo, I18n.t("cadeditor.ui.screens.e792c47d10")));
  if (typeof EditorInventoryCapability === 'string' && EditorInventoryCapability) {
    var capability = h('span', { class: 'it wr pcl inventory-capability', title: EditorInventoryCapability }, [uiIcon('info', 12), I18n.t("cadeditor.ui.screens.5cc4c67c79")]);
    activate(capability, function () { kPopover(capability, h('div', { class: 'k-poplist' }, [kHint(EditorInventoryCapability, 'hint')]), { width: 360, maxHeight: 260 }); });
    f.appendChild(capability);
  }
  f.appendChild(h('div', { class: 'grow' }));
  f.appendChild(h('span', { class: 'it', text: I18n.t("cadeditor.ui.screens.d16bf8bdc5", (d.hi), (d.hist.length - 1)) }));
}
function applyToGame() {
  if (itemRawBlocked()) { toast(I18n.t("cadeditor.ui.screens.1ac8498557"), 'warn'); return; }
  if (NestedItem) { finishNestedItem(true); return; }
  if (typeof EditorInventorySessionStale !== 'undefined' && EditorInventorySessionStale) { toast(EditorInventoryCapability || I18n.t("cadeditor.ui.screens.d5cb40b9c7"), 'warn'); return; }
  if (EditorBridge.pending) { toast(I18n.t("cadeditor.ui.screens.9aa54f73a8"), 'info'); return; }
  var d = Store.doc(), errors = validateDoc(d).filter(function (p) { return p.level === 'error'; });
  if (errors.length) { toast(errors.map(function (p) { return p.msg; }).join('；'), 'error'); return; }
  var requestId = 'edit-' + Date.now() + '-' + (++EditorBridge.sequence);
  try {
  var payload = { requestId: requestId, command: buildCommand(d, UI.cmdMode, UI.cmdSel),
    id: d.id, item: d.id, count: d.count, comps: clone(d.comps), removed: clone(d.removed), slot: clone(d.src) };
  /* 被编辑过的自由 NBT 组件用 SNBT 提交，保住 byte / long / float 等类型 */
  var typed = nbtApplyFormats(d, true); payload.comps = typed.comps; if (typed.formats) payload.component_formats = typed.formats;
  } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('item.serialize', e); toast(I18n.t("cadeditor.ui.screens.96b8eb8c76", (e.message || e)), 'error'); return; }
  EditorBridge.pending = { id: requestId, doc: d, snap: snapOf(d) };
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send('apply', payload) : false;
  if (sent) {
    toast(I18n.t("cadeditor.ui.screens.63906b45ec"), 'info');
    EditorBridge.timer = setTimeout(function () {
      if (!EditorBridge.pending || EditorBridge.pending.id !== requestId) return;
      EditorBridge.pending = null;
      toast(I18n.t("cadeditor.ui.screens.7190d5fc02"), 'error');
    }, 15000);
  } else { EditorBridge.pending = null; toast(I18n.t("cadeditor.ui.screens.9bb41b4cc3"), 'error'); }
}
function openApply() {
  if (itemRawBlocked()) { toast(I18n.t("cadeditor.ui.screens.1ac8498557"), 'warn'); return; }
  if (NestedItem) { finishNestedItem(true); return; }
  var d = Store.doc(), df = diffDoc(d), pr = validateDoc(d), errs = pr.filter(function (p) { return p.level === 'error'; });
  var list = h('div', { class: 'k-scrollbox tall' }), wrap = h('div', { class: 'k-fxlist' });
  df.forEach(function (x) { describeDiffRows(x,d).forEach(function (change) { wrap.appendChild(changeRow(change)); }); });
  if (!df.length) wrap.appendChild(h('div', { class: 'k-empty', text: I18n.t("cadeditor.ui.screens.88960e08ed") }));
  list.appendChild(wrap);
  var modeSel = kSeg(CMD_MODES.map(function (m) { return { v: m.id, label: m.name }; }), UI.cmdMode, function (v) { UI.cmdMode = v; });
  var body = [list];
  if (errs.length) body.unshift(h('div', { class: 'k-effect bad', text: I18n.t("cadeditor.ui.screens.bd9beb840d", (errs.length), (errs.map(function (e) { return e.msg; }).join('；'))) }));
  body.push(fieldRow(I18n.t("cadeditor.ui.screens.bb9332d666"), modeSel.el, I18n.t("cadeditor.ui.screens.3f38a8d63b")));
  var ok = kBtn(I18n.t("cadeditor.ui.screens.bd943ab9fc"), function () { closeModal(); applyToGame(); }, { cls: 'pri' + (errs.length || !df.length ? ' dim' : ''), icon: 'play' });
  openModal(modalShell(I18n.t("cadeditor.ui.common.apply"), I18n.t("cadeditor.ui.screens.5edf054b13", (nameOfItem(d.id)), (df.length)), body, [kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), kBtn(I18n.t("cadeditor.ui.screens.5e7ab4b599"), function () { closeModal(); openAdvanced('cmd'); }, { icon: 'terminal' }), ok], 'applywin'), true);
}
function changeRow(change) {
  return h('div', {class:'k-chg field-change ' + change.kind,title:change.id || ''}, [
    h('span', {class:'change-label'}, [h('span', {class:'nm',text:change.name}), change.sub ? h('span', {class:'change-meta',text:'（' + change.sub + '）'}) : null]),
    h('div', {class:'change-values'}, [h('span', {class:'before',text:change.before}),h('span', {class:'arrow',text:'→'}),h('span', {class:'after',text:change.after})])
  ]);
}

/* ==================== 命令面板 ==================== */
function toggleTheme() { UI.theme = UI.theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', UI.theme); }
function toggleStyle() { UI.style = UI.style === 'ore' ? 'smooth' : 'ore'; document.documentElement.setAttribute('data-style', UI.style); }
function paletteItems() {
  var out = [];
  function act(label, sub, kbd, run, icn) { out.push({ label: label, sub: sub, kbd: kbd, run: run, icon: icn }); }
  {
    act(I18n.t("cadeditor.ui.screens.926a50b98e"), I18n.t("cadeditor.ui.screens.821d4f287b"), 'Ctrl+Z', function () { Store.undo(); }, 'undo'); act(I18n.t("cadeditor.ui.screens.03717b6f10"), I18n.t("cadeditor.ui.screens.862c05fd2c"), 'Ctrl+Y', function () { Store.redo(); }, 'redo');
    act(I18n.t("cadeditor.ui.screens.009536e699"), I18n.t("cadeditor.ui.screens.a4737b8db0"), 'Ctrl+S', openApply, 'play'); act(I18n.t("cadeditor.ui.screens.7ff690419a"), I18n.t("cadeditor.ui.screens.a351ecd609"), '', openAddSetting, 'plus'); act(I18n.t("cadeditor.ui.screens.90a4e8dbf5"), I18n.t("cadeditor.ui.screens.32782729db"), '', function () { openAdvanced(); }, 'code');
    tabsOfKind(kindOfItem(Store.doc().id)).forEach(function (t, i) { act(I18n.t("cadeditor.ui.screens.3a47ec11a9", (t.label)), I18n.t("cadeditor.ui.screens.41299d9be8"), i < 9 ? 'Ctrl+' + (i + 1) : '', function () { UI.tab = t.id; drawTabbar(); drawTabBody(); }, t.icon); });
    act(I18n.t("cadeditor.ui.core.78e03d0b58"), I18n.t("cadeditor.ui.screens.f2a197d607"), '', function () { Store.revertAll(); }, 'restore');
    act(I18n.t("cadeditor.ui.screens.f2fe44d99c"), I18n.t("cadeditor.ui.screens.e4104c8cc9"), 'Ctrl+I', openImport, 'download');
    if (UI.page) UI.page.cards.forEach(function (c) { act(I18n.t("cadeditor.ui.screens.2213f3af42", (c.spec.title)), I18n.t("cadeditor.ui.screens.c71a069dc5"), '', function () { c.el.classList.remove('collapsed'); if (c.el.scrollIntoView) c.el.scrollIntoView(); }, 'tag'); });
  }
  act(I18n.t("cadeditor.ui.screens.6e050c1155"), '', '', toggleTheme, 'sun'); act(I18n.t("cadeditor.ui.screens.66584da91b"), I18n.t("cadeditor.ui.screens.a5e0ba1a6f"), '', toggleStyle, 'palette');
  return out;
}
function openPalette() {
  var all = paletteItems(), sel = 0, shown = all.slice(0, 40);
  var input = h('input', { class: 'k-input', type: 'text', placeholder: I18n.t("cadeditor.ui.screens.b113c35642"), spellcheck: 'false' });
  var list = h('div', { class: 'k-pall' });
  function run(it) { closeModal(); it.run(); }
  function paint() {
    clear(list);
    shown.forEach(function (it, i) {
      var row = h('div', { class: 'k-pr' + (i === sel ? ' on' : '') }, [uiIcon(it.icon || 'forward', 14), h('span', { text: it.label }), h('span', { class: 'sb', text: it.sub || '' }), it.kbd ? h('span', { class: 'k-kbd', text: it.kbd }) : null]);
      row.addEventListener('mousedown', function (e) { e.preventDefault(); run(it); });
      row.addEventListener('mouseenter', function () { sel = i; var ch = list.children; for (var j = 0; j < ch.length; j++) ch[j].classList.toggle('on', j === i); });
      list.appendChild(row);
    });
    if (!shown.length) list.appendChild(h('div', { class: 'k-empty', text: I18n.t("cadeditor.ui.kit.8151e8704a") }));
  }
  function filter() {
    var q = input.value.trim().toLowerCase();
    shown = all.filter(function (x) { return !q || kMatch(x.label + ' ' + (x.sub || ''), q); }).slice(0, 40);
    if (q.length >= 1) EDATA.comps.filter(function (c) { return kMatch(c.id + c.name, q); }).slice(0, 8).forEach(function (c) { shown.push({ label: I18n.t("cadeditor.ui.screens.ca5e28dbe0", (c.name)), sub: 'minecraft:' + c.id, icon: 'plus', run: function () { addSetting(c.id); } }); });
    sel = 0; paint();
  }
  input.addEventListener('input', filter);
  onKey(input, { ArrowDown: function () { sel = Math.min(shown.length - 1, sel + 1); paint(); }, ArrowUp: function () { sel = Math.max(0, sel - 1); paint(); }, Enter: function () { if (shown[sel]) run(shown[sel]); }, Escape: function () { closeModal(); } });
  openModal(h('div', { class: 'k-modal k-pal' }, [h('div', { class: 'k-ph' }, [uiIcon('search', 14), input]), list]), true); paint(); input.focus();
}

/* ==================== 从命令导入 ==================== */
function openImport() {
  var ta = h('textarea', { class: 'k-input', rows: '5', spellcheck: 'false', placeholder: I18n.t("cadeditor.ui.screens.c0dda5596b") });
  var err = h('div', { class: 'ed-err' });
  function parse() { try { var p = parseStackString(ta.value); if (!ITEMSET[shortId(p.id)]) throw new Error(I18n.t("cadeditor.ui.screens.348c3028cb", (p.id))); err.textContent = ''; return p; } catch (e) { err.textContent = I18n.t("cadeditor.ui.screens.1f39695413", ((e.pos || 0) + 1), (e.message)); return null; } }
  var nb = kBtn(I18n.t("cadeditor.ui.screens.7062176222"), function () { var p = parse(); if (!p) return; var lb = Store.doc().label, sl = Store.doc().src; loadStack({ id: p.id, count: p.count, comps: p.comps, removed: p.removed, label: lb, slot: sl }); closeModal(); rebuild(); toast(I18n.t("cadeditor.ui.screens.aa03ba8099", (nameOfItem(p.id))), 'ok'); }, { cls: 'pri', icon: 'download' });
  var mb = kBtn(I18n.t("cadeditor.ui.screens.01e22edead"), function () { var p = parse(); if (!p || !Store.docs.length) return; var d = Store.doc(), comps = clone(d.comps), removed = clone(d.removed); Object.keys(p.comps).forEach(function (k) { comps[k] = p.comps[k]; delete removed[k]; }); Object.keys(p.removed).forEach(function (k) { delete comps[k]; removed[k] = 1; }); Store.replace(comps, removed, I18n.t("cadeditor.ui.screens.a8e15dd8bc")); closeModal(); toast(I18n.t("cadeditor.ui.screens.c660d8bd5c"), 'ok'); }, { icon: 'plus' });
  openModal(modalShell(I18n.t("cadeditor.ui.screens.bfdce97044"), I18n.t("cadeditor.ui.screens.91efda2fd5"), [ta, err], [kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), mb, nb]), true);
  ta.focus();
}

/* 高级 → 设置 */
/* 设置：界面本身的偏好，和「高级」（原始数据、命令）分开 */
function openSettings() {
  var host = h('div', { class: 'set-pages' }), cur = 'ui', notes = null, noteState = {open:{}, groups:{}};
  var tabs = [{ id: 'ui', icon: 'palette', label: I18n.t("cadeditor.ui.picker.785d65c70f") }, { id: 'adv', icon: 'gear', label: I18n.t("cadeditor.ui.screens.d6e61888b0") }, { id: 'changelog', icon: 'list', label: I18n.t("cadeditor.ui.common.changelog") }, { id: 'about', icon: 'star', label: I18n.en("cadeditor.ui.common.about") }];
  var bar = h('div', { class: 'ed-tabs settings-tabs' });
  function paint() {
    if (notes) { notes.dispose(); notes = null; }
    clear(host); if (cur === 'changelog') notes = changelogSection(host, noteState); else if (cur === 'about') aboutSection(host); else advSettings(host, cur);
    for (var i = 0; i < bar.children.length; i++) bar.children[i].classList.toggle('on', tabs[i].id === cur);
    if (host.parentNode) host.parentNode.scrollTop = 0;
  }
  tabs.forEach(function (t) {
    var el = h('div', { class: 'ed-tab' }, [uiIcon(t.icon, 14), h('span', { text: t.label })]);
    activate(el, function () { if (cur !== t.id) { cur = t.id; paint(); } });
    bar.appendChild(el);
  });
  var shell = modalShell(I18n.t("cadeditor.ui.common.settings"), '', [host], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.done"), closeModal, { cls: 'pri' })], 'settingswin');
  shell.insertBefore(bar, shell.children[1]);   /* 页签条放在标题和内容之间，和主窗口的分页同一套样式 */
  paint();
  var mask = openModal(shell, true);
  mask.onEditorClose = function () { if (notes) { notes.dispose(); notes = null; } };
}
function advSettings(host, page) {
  var box = h('div', { class: 'x-list set-list' });
  /* 一项设置 = 一行：图标 + 名称 / 一句说明 + 右侧控件（和子页的行同一个样式） */
  function row(icon, title, sub, control) { box.appendChild(xRow({ icon: uiIcon(icon, 14), title: title, sub: sub, right: control })); }
  if (page === 'ui') {
  box.appendChild(xSec('maximize', I18n.t("cadeditor.ui.screens.4e1449e7d5")));
  var scaleChoice = kSeg([{ v: 0, label: I18n.t("cadeditor.ui.cards1.7eb336e42c") }, { v: 1, label: '1' }, { v: 2, label: '2' },
    { v: 3, label: '3' }, { v: 4, label: '4' }], UI.uiScale, function (v) {
    UI.uiScale = uiScaleClamp(v); Prefs.set('uiScale', UI.uiScale); applyUiScale();
  });
  row('maximize', I18n.t("cadeditor.ui.screens.4a1e168aae"), I18n.t("cadeditor.ui.screens.c35505ee54"), scaleChoice.el);
  scaleChoice.el.id = 'editor-scale';
  var opening = kSeg([{ v: 'remember', label: I18n.t("cadeditor.ui.screens.e543d1820e") }, { v: 'maximized', label: I18n.t("cadeditor.ui.screens.82c4aa13b7") }, { v: 'windowed', label: I18n.t("cadeditor.ui.screens.f9aa4a98f7") }], UI.windowMode, function (v) {
    UI.windowMode = windowModeClamp(v); Prefs.set('windowMode', UI.windowMode);
  });
  opening.el.id = 'editor-window-mode';
  row('maximize', I18n.t("cadeditor.ui.screens.ff1804eeb7"), I18n.t("cadeditor.ui.screens.840c09a801"), opening.el);
  var snd1 = kToggle(Snd.on, function (on) { Snd.on = on; Prefs.set('uiSound', on); if (on) snd('minecraft:ui.button.click', 0.5, 1.1); }, '');
  row('music', I18n.t("cadeditor.ui.screens.88951e188d"), I18n.t("cadeditor.ui.screens.d1bb605a1c"), snd1.el);
  var motion = kToggle(uiMotionEnabled(), function (on) { applyUiMotion(on); Prefs.set('uiAnimations', on); }, '');
  row('play', I18n.t("cadeditor.ui.screens.fb69acb593"), I18n.t("cadeditor.ui.screens.03b548f37f"), motion.el);
  var fontSeg = kSeg([{ v: 'mc', label: I18n.t("cadeditor.ui.screens.dc9578fa4e") }, { v: 'smooth', label: I18n.t("cadeditor.ui.screens.b3275d61c8") }], UI.font === 'smooth' ? 'smooth' : 'mc', function (v) { applyUiFont(v); Prefs.set('uiFont', v); });
  row('edit', I18n.t("cadeditor.ui.screens.52a039f438"), I18n.t("cadeditor.ui.screens.96fe4741ca"), fontSeg.el);
  var th1 = kSeg([{ v: 'dark', label: I18n.t("cadeditor.ui.screens.29edc1452e") }, { v: 'light', label: I18n.t("cadeditor.ui.screens.300cb57725") }], UI.theme, function (v) { if (v !== UI.theme) toggleTheme(); });
  row('sparkle', I18n.t("cadeditor.ui.screens.788db1cfec"), I18n.t("cadeditor.ui.screens.4911e5de44"), th1.el);
  var hv = kSeg([{ v: '3d', label: '3D' }, { v: '2d', label: '2D' }], UI.heroView, function (v) { UI.heroView = v; Prefs.set('heroView', v); drawHero(); });
  row('cube', I18n.t("cadeditor.ui.screens.0e2ac6a780"), I18n.t("cadeditor.ui.screens.a16df9f13d"), hv.el);
  } else {
  box.appendChild(xSec('maximize', I18n.t("cadeditor.ui.screens.9efe01f647")));
  row('maximize', I18n.t("cadeditor.ui.screens.c3cc36f628"), I18n.t("cadeditor.ui.screens.081f7638e0"), kBtn(I18n.t("cadeditor.ui.common.reset"), function () { UI.winW = 0; UI.winH = 0; UI.heroW = 0; UI.maxed = false; applyWinStyle(); Prefs.set('winW', 0); Prefs.set('winH', 0); Prefs.set('heroWidth', 0); Prefs.set('windowMax', false); drawTopbar(); toast(I18n.t("cadeditor.ui.screens.a904d30b18"), 'ok'); }, { icon: 'undo' }));
  box.appendChild(xSec('bug', I18n.t("cadeditor.ui.screens.a3ba53fadb")));
  var t = kToggle(Prefs.get('debug', false) === true, function (on) { Prefs.set('debug', on); if (on) dbg(I18n.t("cadeditor.ui.screens.0358adb354")); }, '');
  row('bug', I18n.t("cadeditor.ui.screens.d09ed8ce71"), I18n.t("cadeditor.ui.screens.1e61d4f009"), t.el);
  if (Prefs.host && typeof oriel !== 'undefined' && oriel.send) row('bug', I18n.t("cadeditor.ui.screens.80d384c95c"), I18n.t("cadeditor.ui.screens.bd91da48cb"), Prefs.about && Prefs.about.recoveryPreview ? kBtn(I18n.t("cadeditor.ui.screens.dfdd0b8bf9"), function () { oriel.send('editor_recovery_preview', {}); }) : kHint(I18n.t("cadeditor.ui.screens.deec517606")));
  }
  host.appendChild(box);
}
/* 关于：Logo、版本、作者和链接。链接用页面的 <a href>，点了 Oriel 会先让玩家确认；玩家把网页链接设成屏蔽时打不开，所以每行都有「复制」 */
function aboutSection(host) {
  var box = h('div', { class: 'x-list set-list' });
  var A = Labels.about, ver = Prefs.about && Prefs.about.version;
  box.appendChild(h('div', { class: 'ab-head' }, [
    h('img', { class: 'ab-logo', src: 'logo.png', alt: '' }),
    h('div', { class: 'ab-tx' }, [h('div', { class: 'ab-name', text: A.name }), h('div', { class: 'k-sub', text: ver && ver !== 'unknown' ? I18n.en("cadeditor.ui.screens.9179160d84", (ver)) : A.tagline })])
  ]));
  box.appendChild(xRow({ icon: uiIcon('crown', 14), title: A.author, sub: A.authorRole }));
  box.appendChild(xRow({ icon: uiIcon('users', 14), title: I18n.en("cadeditor.ui.screens.c5449dc57f"), sub: A.feedbackGroup,
    right: kBtn(I18n.en("cadeditor.ui.screens.46e651c95c"), function () { copyText(A.feedbackGroup, I18n.en("cadeditor.ui.screens.c26e9a4097"), 'en_us'); }, { icon: 'copy' }) }));
  A.links.forEach(function (l) {
    var open = h('a', { class: 'k-btn ab-btn', href: l.url, title: I18n.en("cadeditor.ui.screens.a7df97f3b6") }, [uiIcon('external', 12)]);
    var copy = kBtn('', function () { copyText(l.url, I18n.en("cadeditor.ui.screens.4de2acbb94", (l.title)), 'en_us'); }, { icon: 'copy', title: I18n.en("cadeditor.ui.screens.4c6de01bbe") });
    box.appendChild(xRow({ icon: uiIcon(l.icon, 14), title: l.title, sub: l.show, right: h('div', { class: 'ab-acts' }, [open, copy]) }));
  });
  host.appendChild(box);
}
