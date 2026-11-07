/* 界面主体：编辑屏（英雄区 / 分页 / 卡片）、二级窗口（高级、添加设置）、应用确认、提示框预览。 */

var UI = { screen: 'edit', tab: null, uni: {}, adv: 'all', advSel: null, advQ: '', theme: 'dark', style: 'ore', tipAdv: false, tipOpen: true,
  cmdMode: 'main', cmdSel: '@s', cmdFmt: 'cmd', page: null, bodyScroll: {} };
var $ = function (id) { return document.getElementById(id); };
/* 音效函数在 kit.js；单独加载本文件做契约测试时给个空实现 */
if (typeof Snd === 'undefined') { var Snd = { on: false }; var snd = function () {}; }

/* 界面偏好（现在只有左侧 2D / 3D）。页面自己不能写磁盘：宿主（Editor 模组）在打开页面时带来 prefs 并声明 hostPrefs，
   页面改动后用 oriel.send('prefs', {key, value}) 交给宿主落盘；没有宿主时只在本次打开期间记住。 */
var Prefs = {
  vals: {}, host: false,
  init: function (data) {
    this.host = !!(data && data.hostPrefs); this.hostClip = !!(data && data.hostClip);
    var p = data && data.prefs && typeof data.prefs === 'object' ? data.prefs : null;
    if (p) for (var k in p) this.vals[k] = p[k];
    UI.heroView = this.get('heroView', '3d') === '2d' ? '2d' : '3d';
    Snd.on = this.get('uiSound', true) !== false;
    UI.stageOpen = this.get('stageOpen', true) !== false; UI.statsOpen = this.get('statsOpen', true) !== false;
    UI.maxed = this.get('windowMax', false) === true;
    var hw = this.get('heroWidth', 0), ww = this.get('winW', 0), wh = this.get('winH', 0);
    UI.heroW = typeof hw === 'number' && hw >= 100 ? hw : 0; UI.winW = typeof ww === 'number' && ww >= 320 ? ww : 0; UI.winH = typeof wh === 'number' && wh >= 200 ? wh : 0;
  },
  /* 拖动时高频改值：页面里立即生效，300ms 没有新值再交给宿主落盘 */
  setSoon: function (k, v) { var self = this; self.vals[k] = v; self._t = self._t || {}; clearTimeout(self._t[k]); self._t[k] = setTimeout(function () { self.set(k, v); }, 300); },
  get: function (k, d) { return this.vals[k] === undefined ? d : this.vals[k]; },
  set: function (k, v) {
    this.vals[k] = v;
    if (this.host && typeof oriel !== 'undefined' && oriel.send) oriel.send('prefs', { key: k, value: v });
  }
};

function toast(text, kind) {
  if (kind === 'ok') snd('minecraft:entity.experience_orb.pickup', 0.35, 1.3); else if (kind === 'error') snd('minecraft:block.note_block.bass', 0.6, 0.7);
  var t = h('div', { class: 'k-toast ' + (kind || 'info') }, [uiIcon(kind === 'error' ? 'warning' : kind === 'ok' ? 'check' : 'info', 14), text]);
  $('toasts').appendChild(t);
  setTimeout(function () { t.classList.add('out'); }, 2400);
  setTimeout(function () { t.remove(); }, 2900);
}
var ModalParents = [];
function openModal(node, stacked) {
  var previous = $('modal');
  if (stacked && previous != null) {
    ModalParents.push({ el: previous, focus: document.activeElement });
    previous.removeAttribute('id'); previous.style.display = 'none';
    kPopClose(); popClose();
  } else {
    closeModal();
    while (ModalParents.length) { var old = $('modal'); if (old != null) old.remove(); var p = ModalParents.pop(); p.el.remove(); }
    var remaining = $('modal'); if (remaining != null) remaining.remove();
  }
  snd('minecraft:block.wooden_trapdoor.open', 0.35, 1.6);
  var mask = h('div', { class: 'k-mask', id: 'modal' }, [node]);
  mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeModal(); });
  $('overlays').appendChild(mask);
  return mask;
}
function closeModal() {
  var m = $('modal'); if (m != null) m.remove(); kPopClose(); popClose();
  if (ModalParents.length) { var p = ModalParents.pop(); p.el.id = 'modal'; p.el.style.display = ''; if (p.focus != null && p.focus.focus) p.focus.focus(); }
}
function modalShell(title, sub, body, foot, cls) {
  var x = h('div', { class: 'k-mini', text: '×' }); activate(x, closeModal);
  return h('div', { class: 'k-modal' + (cls ? ' ' + cls : '') }, [
    h('div', { class: 'k-mh' }, [h('b', { text: title }), sub ? h('span', { class: 'k-sub', text: sub }) : null, h('div', { class: 'grow' }), x]),
    h('div', { class: 'k-mb' }, body), foot ? h('div', { class: 'k-mf' }, foot) : null]);
}

/* ==================== 载入物品 ==================== */
/* 编辑器总是围绕「游戏里选中的那一个物品栈」工作：玩家在游戏里按快捷键（悬停物品 / 手持物品）打开，
   宿主把栈传进来：{ id, count, comps, slot, label }。要换物品就关掉，到背包里重新选。
   浏览器预览里的演示物品由 demo.js 提供。 */
function loadStack(st) {
  UI.loading = true;   // 载入过程中 Store 会连发几次 docs 事件，别每次都整页重画；调用方载入完后统一画一次
  Store.open({ key: 'stk' + Date.now(), src: st.slot || null, id: fullId(st.id), count: st.count || 1, label: st.label || '', comps: st.comps || {}, removed: st.removed || {}, snbt: st.component_snbt || {} }, true);
  while (Store.docs.length > 1) Store.close(0);
  UI.loading = false;
  UI.tab = null; UI.bodyScroll = {}; UI.advSel = null; UI.uni = {};
}

/* ==================== 顶栏 ==================== */
function drawTopbar() {
  var bar = clear($('topbar')), d = Store.doc();
  var kind = kindOfItem(d.id), info = KIND_INFO[kind];
  bar.appendChild(h('span', { class: 'eb-ico' }, [itemIcon(heroItemId(d), 22)]));
  bar.appendChild(h('span', { class: 'ttl', text: displayName(d) }));
  bar.appendChild(h('span', { class: 'crumb', text: info.name, title: d.label || '' }));
  bar.appendChild(h('div', { class: 'grow' }));
  var un = h('div', { class: 'k-ibtn' + (Store.canUndo() ? '' : ' dis'), title: '撤销 Ctrl+Z' }, [uiIcon('undo', 14)]); activate(un, function () { Store.undo(); });
  var re = h('div', { class: 'k-ibtn' + (Store.canRedo() ? '' : ' dis'), title: '重做 Ctrl+Y' }, [uiIcon('redo', 14)]); activate(re, function () { Store.redo(); });
  var hi = h('div', { class: 'k-ibtn', title: '修改历史' }, [uiIcon('clock', 14)]); activate(hi, function () { openAdvanced('hist'); });
  var fold = [];
  bar.appendChild(un); bar.appendChild(re); bar.appendChild(hi);
  var sr = h('div', { class: 'k-search', title: '命令面板 Ctrl+K' }, [uiIcon('search', 12), h('span', { text: '搜索 / 命令' }), h('span', { class: 'k-kbd', text: 'Ctrl K' })]); activate(sr, openPalette);
  var ad = h('div', { class: 'k-ibtn', title: '高级：原始组件、SNBT、命令' }, [uiIcon('code', 14)]); activate(ad, function () { openAdvanced(); });
  var th = h('div', { class: 'k-ibtn', title: '设置' }, [uiIcon('sliders', 14)]); activate(th, openSettings);
  bar.appendChild(sr); bar.appendChild(ad); bar.appendChild(th);
  fold.push({ el: th, label: '设置', icon: 'sliders', rank: 2, run: openSettings }, { el: ad, label: '高级', icon: 'code', rank: 3, run: function () { openAdvanced(); } }, { el: hi, label: '修改历史', icon: 'clock', rank: 4, run: function () { openAdvanced('hist'); } }, { el: re, label: '重做', icon: 'redo', rank: 5, run: function () { Store.redo(); } }, { el: un, label: '撤销', icon: 'undo', rank: 6, run: function () { Store.undo(); } });
  var n = diffDoc(d).length;
  var ap = h('div', { class: 'k-btn pri k-apply' + (n ? '' : ' dim'), title: n ? '查看并应用修改（Ctrl+S）' : '还没有修改' }, [uiIcon('play', 12), h('span', { text: '应用修改' }), n ? h('b', { text: String(n) }) : null]); activate(ap, openApply);
  bar.appendChild(ap);
    var mx = h('div', { class: 'k-ibtn', title: UI.maxed ? '还原窗口' : '全屏' }, [uiIcon(UI.maxed ? 'restore' : 'maximize', 14)]);
  activate(mx, function () { UI.maxed = !UI.maxed; applyWinStyle(); Prefs.set('windowMax', UI.maxed); mx.title = UI.maxed ? '还原窗口' : '全屏'; mx.firstChild.src = 'oriel:textures/icons/' + (UI.maxed ? 'restore' : 'maximize') + '.png'; });
  bar.appendChild(mx);
  var cl = h('div', { class: 'k-ibtn', title: '关闭编辑器' }, [uiIcon('close', 14)]); activate(cl, closeEditor);
  bar.appendChild(cl);
  /* 窗口窄时，次要按钮收进「⋯」菜单；标题自己省略，关闭 / 最大化 / 应用修改永远在 */
  var more = h('div', { class: 'k-ibtn', title: '更多', style: 'display:none' }, [uiIcon('menu', 14)]);
  bar.insertBefore(more, ap);
  activate(more, function () { var r = more.getBoundingClientRect(); var items = fold.filter(function (f) { return f.hid; }).sort(function (a, b) { return a.rank - b.rank; }).map(function (f) { return { label: f.label, icon: f.icon, run: f.run }; }); kMenu(r.left, r.bottom + 2, items); });
  bar._fold = { fold: fold, more: more };
  fitTopbar();
}
function fitTopbar() {
  var bar = $('topbar'); if (!bar || !bar._fold) return;
  var F = bar._fold, fold = F.fold.slice().sort(function (a, b) { return a.rank - b.rank; });
  fold.forEach(function (f) { f.hid = false; f.el.style.display = ''; }); F.more.style.display = 'none';
  var kids = Array.prototype.slice.call(bar.children), fixed = 0, n = 0;
  kids.forEach(function (c) { if (c.className && (/ttl|crumb|grow|eb-ico/.test(c.className))) return; var w = c.getBoundingClientRect().width; if (w) { fixed += w; n++; } });
  var avail = bar.getBoundingClientRect().width - 14 - 22 - 70 - 6 * (n + 3);
  var i = 0;
  while (fixed > avail && i < fold.length) {
    var w = fold[i].el.getBoundingClientRect().width; fold[i].el.style.display = 'none'; fold[i].hid = true; fixed -= w + 6;
    if (i === 0) { F.more.style.display = ''; fixed += 30; }
    i++;
  }
}

/* 关闭：先播一个 150ms 的离场动画再关，和 showcase 的页面离场节奏一致 */
function closeEditor() {
  snd('minecraft:block.wooden_trapdoor.close', 0.4, 1.4);
  var w = $('win'); if (w) w.classList.add('leave');
  setTimeout(function () { if (typeof oriel !== 'undefined' && oriel.close) oriel.close(); }, w ? 150 : 0);
}

function rebuild() {
  if (!Store.docs.length) {
    clear($('topbar')).appendChild(h('span', { class: 'ttl', text: '物品工坊' })); clear($('footer'));
    clear($('screen')).appendChild(h('div', { class: 'k-empty big', text: '在游戏里把鼠标悬停在物品上（或手持物品），按下编辑快捷键即可打开。' }));
    return;
  }
  drawTopbar(); drawEdit(); drawFooter();
}


/* ==================== 编辑屏 ==================== */
function heroItemId(d) { var m = d.comps.item_model || (protoOf(d.id) || {}).item_model; return m ? fullId(String(m)) : d.id; }
/* 标签栏上的分页：本类物品的分页 + 已相关 / 已打开的通用分页 + 附加设置 */
function tabsOfKind(kind) {
  var d = Store.doc(), tabs = (PAGES[kind] || PAGES.generic).slice(), ex = extraCompIds(d, kind);
  uniTabsFor(kind).forEach(function (t) { if (UI.uni[t.id] || uniRelevant(t, d) || (kind === 'generic' && t.id === 'u-ability')) tabs.push(t); });
  if (ex.length) tabs.push({ id: 'more', label: '附加设置', icon: 'tag', cards: ex.map(function (c) { return ['auto', c]; }) });
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
  if (UI.winW) s += '--ww:' + UI.winW + 'px;'; if (UI.winH) s += '--wh:' + UI.winH + 'px;'; if (UI.heroW) s += '--hw:' + UI.heroW + 'px;';
  var w = $('win'); if (!w) return; w.setAttribute('style', s); w.classList.toggle('max', !!UI.maxed);
  scheduleFit();
  if (!UI.dragging) { setTimeout(scheduleFit, 160); setTimeout(scheduleFit, 520); }
}
/* 拖动时每帧都重排很贵：量尺寸的适配（顶栏收纳、提示框高度）合并成限频执行 */
var fitT = null;
function scheduleFit() { if (fitT) return; fitT = setTimeout(function () { fitT = null; var wn = $('win'); if (wn) { var ww = wn.getBoundingClientRect().width; if (ww > 100) { wn.classList.toggle('narrow', ww < 420); wn.classList.toggle('snug', ww >= 420 && ww < 680); } } fitTopbar(); fitTip(); }, UI.dragging ? 110 : 0); }
/* 窗口几何有 280ms 的过渡：resize 触发时量到的是动画中间值，所以立即量一次之后，过渡结束再量一次，否则模式会停在旧的一档 */
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', function () { scheduleFit(); setTimeout(scheduleFit, 320); setTimeout(scheduleFit, 600); });
function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
/* 调试开关（高级 → 设置）：打开后关键操作会弹提示，并写进游戏日志 latest.log（前缀 [CAD-Editor-Recast]） */
function dbg(msg) {
  if (!Prefs.get('debug', false)) return;
  toast('【调试】' + msg, 'warn');
  try { if (typeof oriel !== 'undefined' && oriel.send) oriel.send('log', { level: 'debug', msg: String(msg).substring(0, 1500) }); } catch (e) {}
}
function dragTrack(e, onMove, onEnd) {
  e.preventDefault();
  var wn = $('win'); UI.dragging = true; if (wn) wn.classList.add('dragging');
  var nMoves = 0; dbg('拖动开始 窗口宽=' + (wn ? Math.round(wn.getBoundingClientRect().width) : '?') + ' 视口=' + window.innerWidth + '×' + window.innerHeight + ' narrow=' + (wn && wn.classList.contains('narrow')) + ' max=' + UI.maxed);
  function mv(ev) { nMoves++; onMove(ev); }
  var ended = false;
  function up() { if (ended) return; ended = true; dbg('拖动结束 移动事件=' + nMoves + ' winW=' + UI.winW + ' heroW=' + UI.heroW); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); UI.dragging = false; var w2 = $('win'); if (w2) w2.classList.remove('dragging'); scheduleFit(); if (onEnd) onEnd(); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
function startSplit(e) {
  if (e.button !== undefined && e.button !== 0) return;
  var x0 = e.clientX, w0 = $('hero').getBoundingClientRect().width;
  dragTrack(e, function (ev) { UI.heroW = clampN(Math.round(w0 + ev.clientX - x0), 110, Math.max(320, Math.floor(window.innerWidth * 0.45))); applyWinStyle(); }, function () { Prefs.setSoon('heroWidth', UI.heroW); });
}
function startResize(e) {
  if (UI.maxed || (e.button !== undefined && e.button !== 0)) return;
  var r = $('win').getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, w0 = r.width, h0 = r.height;
  dragTrack(e, function (ev) { UI.winW = clampN(Math.round(w0 + 2 * (ev.clientX - x0)), Math.min(340, window.innerWidth - 20), window.innerWidth - 20); UI.winH = clampN(Math.round(h0 + 2 * (ev.clientY - y0)), Math.min(220, window.innerHeight - 20), window.innerHeight - 20); applyWinStyle(); }, function () { Prefs.setSoon('winW', UI.winW); Prefs.setSoon('winH', UI.winH); });
}
function drawEdit() {
  var host = clear($('screen')), d = Store.doc(), kind = kindOfItem(d.id), info = KIND_INFO[kind];
  var tabs = tabsOfKind(kind);
  if (!tabs.some(function (t) { return t.id === UI.tab; })) UI.tab = tabs[0].id;
  applyWinStyle();
  var hero = h('aside', { class: 'ed-hero' + (UI.heroPop ? ' pop' : ''), id: 'hero', title: '' });
  /* 紧凑模式（窗口窄 / GUI 缩放大）下左栏收成一条，被隐藏的属性、标签、提示框预览不丢：点一下这条栏就展开，再点收回 */
  hero.addEventListener('click', function (e) {
    var wn = $('win'), compact = (wn && wn.classList.contains('narrow')) || window.innerWidth <= 540 || window.innerHeight <= 290;
    if (!compact || (e.target.closest && e.target.closest('.k-btn, .k-mini, .k-seg, .ed-stagehead, .ed-tiphead, input, textarea'))) return;
    UI.heroPop = !UI.heroPop; hero.classList.toggle('pop', UI.heroPop);
  });
  var split = h('div', { class: 'ed-split', title: '拖动调整左栏宽度（双击恢复）' });
  split.addEventListener('mousedown', startSplit); split.addEventListener('dblclick', function () { UI.heroW = 0; applyWinStyle(); Prefs.set('heroWidth', 0); });
  var right = h('section', { class: 'ed-right' });
  var tabbar = h('div', { class: 'ed-tabs', id: 'tabbar' });
  tabbar.addEventListener('wheel', tabsWheel);
  var tools = h('div', { class: 'ed-tools', id: 'edtools' });
  var body = h('div', { class: 'ed-body', id: 'edbody' });
  right.appendChild(tabbar); right.appendChild(tools); right.appendChild(body);
  host.appendChild(hero); host.appendChild(split); host.appendChild(right);
  if (!$('edresize')) { var rz = h('div', { class: 'ed-resize', id: 'edresize', title: '拖动调整窗口大小（双击恢复）' }); rz.addEventListener('mousedown', startResize); rz.addEventListener('dblclick', function () { UI.winW = 0; UI.winH = 0; applyWinStyle(); Prefs.set('winW', 0); Prefs.set('winH', 0); }); $('win').appendChild(rz); }
  drawHero(); drawTabbar(); drawTabBody();
}
function drawTabbar() {
  var bar = clear($('tabbar')), kind = kindOfItem(Store.doc().id), tabs = tabsOfKind(kind);
  bar.classList.toggle('dense', tabs.length >= 4);
  tabs.forEach(function (t, i) {
    var n = t.id === 'more' ? t.cards.length : tabModCount(kind, t);
    var el = h('div', { id: 'edtab-' + t.id, class: 'ed-tab' + (UI.tab === t.id ? ' on' : ''), title: t.label + (i < 9 ? '（Ctrl+' + (i + 1) + '）' : '') }, [uiIcon(t.icon, 14), h('span', { text: t.label }), n ? h('b', { text: String(n) }) : null]);
    activate(el, function () { UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.tab = t.id; drawTabbar(); drawTabBody(); });
    bar.appendChild(el);
  });
  if (hiddenUniTabs(kind).length) { var mo = h('div', { class: 'ed-tab more', title: '更多分页：功能、攻击与防御、放置与数据……' }, [uiIcon('plus', 12), h('span', { text: '更多' }), uiIcon('down', 10)]); activate(mo, function () { openMoreTabs(mo); }); bar.appendChild(mo); }
  /* 分页指示条：同一个节点跨重绘保留，宿主控制器（EditorPageController）收到 ed:tabs 后用 Motion.indicator 把它滑到选中的分页下；没有控制器时它是隐藏的 */
  if (!UI.ind) UI.ind = h('i', { class: 'm-indicator ed-ind' });
  UI.ind.setAttribute('data-ed-indicator', '#edtab-' + UI.tab);
  requestAnimationFrame(function () { tabsReveal(); document.dispatchEvent(new CustomEvent('ed:tabs')); });
  decorate();
}
/* 分页栏左右滚动：滚轮（竖向滚轮也转成横向）；切换分页时把选中的分页滚进可见范围 */
function tabsReveal() {
  var bar = $('tabbar'), on = bar && bar.querySelector('.ed-tab.on'); if (!bar || !on) return;
  var bl = bar.getBoundingClientRect().left, ol = on.getBoundingClientRect().left - bl + bar.scrollLeft, ow = on.getBoundingClientRect().width;
  if (ol < bar.scrollLeft + 6) bar.scrollLeft = Math.max(0, ol - 6); else if (ol + ow > bar.scrollLeft + bar.clientWidth - 6) bar.scrollLeft = ol + ow - bar.clientWidth + 6;
}
function tabsWheel(e) {
  var bar = $('tabbar'); if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
  var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return;
  bar.scrollLeft += d > 0 ? 60 : -60; e.preventDefault();
}
/* 分页内容顶部的工具行：本页名称 + 添加设置 + 折叠全部（不再挤在分页栏里） */
function buildToolsRow(tab) {
  var add = h('div', { class: 'ed-addset', title: '给这个物品加上它本来没有的功能' }, [uiIcon('plus', 14), h('span', { text: '添加设置' })]); activate(add, openAddSetting);
  var all = h('div', { class: 'k-mini', title: '折叠 / 展开本页全部卡片' }, [uiIcon('layers', 14)]);
  activate(all, function () { var cs = UI.page ? UI.page.cards : []; var collapse = cs.some(function (c) { return !c.el.classList.contains('collapsed'); }); cs.forEach(function (c) { if (c.setCollapsed) c.setCollapsed(collapse); }); });
  return h('div', { class: 'ed-tools' }, [h('span', { class: 'ed-tools-t', text: tab.label }), h('div', { class: 'grow' }), add, all]);
}
/* 给动态生成的控件补上 showcase 的反馈类：按钮涟漪、卡片头指针聚光（宿主控制器 Shell.setup 负责驱动；没有控制器时无效果、无副作用） */
/* 多行文本框：底部一条拖动条，可以自己拖高度（记住每一类文本框上次的高度） */
UI.taH = UI.taH || {};
function growable(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll('textarea'), function (ta) {
    if (ta._grow || !ta.parentNode) return; ta._grow = true;
    var key = ta.className || 'ta', wrap = h('div', { class: 'ta-wrap' }), grip = h('div', { class: 'ta-grip', title: '拖动调整高度（双击恢复）' }, [h('i', {})]);
    ta.parentNode.insertBefore(wrap, ta); wrap.appendChild(ta); wrap.appendChild(grip);
    function setH(px) { ta.style.height = px + 'px'; ta.style.minHeight = px + 'px'; }
    if (UI.taH[key]) setH(UI.taH[key]);
    grip.addEventListener('mousedown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var y0 = e.clientY, h0 = ta.getBoundingClientRect().height;
      dragTrack(e, function (ev) { var nh = clampN(Math.round(h0 + ev.clientY - y0), 40, 640); setH(nh); UI.taH[key] = nh; });
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
  var body = $('edbody'), host = document.querySelector('.ed-tools-t'); if (!body || !host || !crumbTab) return;
  var top = body.getBoundingClientRect().top + 12, parts = [{ t: crumbTab.label, el: null }];
  if (body.scrollTop > 6) {
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
    var sp = h('span', { class: 'crumb-i' + (n === parts.length - 1 ? ' last' : ''), text: p.t, title: '跳到：' + p.t });
    sp.addEventListener('click', function () { var cp = crumbParts[n]; var b = $('edbody'); if (!b) return; if (!cp.el) b.scrollTop = 0; else b.scrollTop = Math.max(0, b.scrollTop + cp.el.getBoundingClientRect().top - b.getBoundingClientRect().top - 6); });
    host.appendChild(sp);
  });
}
function drawTabBody() {
  var body = clear($('edbody')), d = Store.doc(), kind = kindOfItem(d.id);
  var tabs = tabsOfKind(kind), tab = tabs.filter(function (t) { return t.id === UI.tab; })[0];
  if (!tab) { tab = tabs[0]; UI.tab = tab.id; drawTabbar(); }
  var items = buildTabCards(kind, tab), cards = items.filter(function (c) { return !c.marker; });
  UI.page = { tab: tab, cards: cards };
  cards.forEach(function (c) { try { c.update(); } catch (e) {} });   // 卡片里的说明 / 效果提示要在第一次画出来时就有内容
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
}

/* ---------- 英雄区 ---------- */
function stackCompsSnbt(d) { var o = {}; Object.keys(d.comps).forEach(function (k) { o['minecraft:' + k] = d.comps[k]; }); return toSnbt(o, null, false); }
function effComps() { return effectiveComps(Store.doc()); }
function displayName(d) {
  var eff = effectiveComps(d);
  if (shortId(d.id) === 'potion' && eff.custom_name === undefined && eff.potion_contents) { var pc = eff.potion_contents, p = typeof pc === 'string' ? pc : pc.potion; if (p) return potionName(p); }
  return nameOfItem(d.id);
}
function nameRuns(d) {
  var eff = effectiveComps(d), v = eff.custom_name !== undefined ? eff.custom_name : null;
  var r = v === null ? null : tcRuns(v);
  return r || { base: {}, runs: [{ text: displayName(d) }] };
}
function rarityHex(d) { var r = effectiveComps(d).rarity || 'common'; return { common: '#FFFFFF', uncommon: '#FFFF55', rare: '#55FFFF', epic: '#FF55FF' }[r]; }
function heroStats(d, kind) {
  var eff = effectiveComps(d), out = [];
  if (kind === 'spawn') {
    /* 刷怪蛋：生成的生物和它的基础属性（entity_info）；生命值按蛋里写的 Health，没写用游戏默认 */
    var et = eggEntityOf(d), info = et ? Reg.entityInfo(et) : false, at = info && info.attributes || {}, ed = isObj(eff.entity_data) ? eff.entity_data : {};
    if (et) out.push({ icon: 'paw', label: '生物', value: spEntityName(et) });
    var hp = typeof ed.Health === 'number' ? ed.Health : at['minecraft:max_health'];
    if (typeof hp === 'number') out.push({ icon: 'shield', label: '生命值', value: fmtNum(+hp.toFixed(2)) });
    if (typeof at['minecraft:movement_speed'] === 'number') out.push({ icon: 'boots', label: '移动速度', value: fmtNum(+at['minecraft:movement_speed'].toFixed(3)) });
    if (typeof at['minecraft:attack_damage'] === 'number' && at['minecraft:attack_damage'] > 0) out.push({ icon: 'sword', label: '攻击力', value: fmtNum(+at['minecraft:attack_damage'].toFixed(2)) });
  }
  function mods(type, slots, base) { var s = base; (eff.attribute_modifiers || []).forEach(function (m) { if (shortId(m.type) === type && m.operation === 'add_value' && (m.slot === undefined || m.slot === 'any' || slots.indexOf(m.slot) >= 0)) s += m.amount; }); return s; }
  if (kind === 'melee' || kind === 'tool') {
    var dmg = mods('attack_damage', meleeSlots(), Reg.baseAttr('minecraft:player', 'attack_damage', 1)), spd = mods('attack_speed', meleeSlots(), Reg.baseAttr('minecraft:player', 'attack_speed', 4));
    out.push({ icon: 'sword', label: '攻击伤害', value: bigOrNum(dmg) });
    out.push({ icon: 'bolt', label: '攻击速度', value: fmtNum(+spd.toFixed(2)) + ' 次/秒' });
    out.push({ icon: 'flame', label: '每秒伤害', value: bigOrNum(+(dmg * spd).toFixed(2)) });
    if (kind === 'tool' && eff.tool) out.push({ icon: 'pickaxe', label: '挖掘速度', value: bigOrNum((eff.tool.rules || []).reduce(function (m, r) { return typeof r.speed === 'number' && r.speed < 1e6 ? Math.max(m, r.speed) : m; }, eff.tool.default_mining_speed || 1)) });
  } else if (kind === 'armor') {
    var e = eff.equippable, sl = e ? [e.slot, 'armor'] : ['chest', 'armor'];
    out.push({ icon: 'chestplate', label: '护甲值', value: bigOrNum(mods('armor', sl, 0)) });
    out.push({ icon: 'shield', label: '盔甲韧性', value: bigOrNum(mods('armor_toughness', sl, 0)) });
  } else if (kind === 'food' && eff.food) {
    out.push({ icon: 'hunger', label: '饥饿值', value: '+' + bigOrNum(eff.food.nutrition) }); out.push({ icon: 'star', label: '饱和度', value: '+' + bigOrNum(eff.food.saturation) });
  } else if (kind === 'potion') {
    var pc = eff.potion_contents; var o = typeof pc === 'string' ? { potion: pc } : (pc || {});
    out.push({ icon: 'potion_round', label: '基础药水', value: o.potion ? potionName(o.potion) : '无' }); out.push({ icon: 'flask', label: '自定义效果', value: String((o.custom_effects || []).length) + ' 个' });
  } else if (kind === 'ebook') out.push({ icon: 'enchant', label: '储存附魔', value: Object.keys(eff.stored_enchantments || {}).length + ' 个' });
  var en = eff.enchantments ? Object.keys(eff.enchantments).length : 0;
  if (kind !== 'ebook' && en) out.push({ icon: 'enchant', label: '附魔', value: en + ' 个' });
  out.push({ icon: 'layers', label: '最大堆叠', value: String(eff.max_stack_size || 64) });
  return out;
}
function drawHero() {
  var hero = $('hero'); if (!hero) return; var scrollTop = hero.scrollTop; clear(hero);
  var d = Store.doc(), kind = kindOfItem(d.id), info = KIND_INFO[kind], eff = effectiveComps(d);
  var ench = (eff.enchantments && Object.keys(eff.enchantments).length) || (eff.stored_enchantments && Object.keys(eff.stored_enchantments).length) || eff.enchantment_glint_override === true;
  var can3d = typeof ED_MC === 'undefined', view = can3d && UI.heroView === '3d' ? '3d' : '2d';
  var vis;
  if (view === '3d' && kind === 'spawn' && eggEntityOf(d)) {
    /* 刷怪蛋：3D 显示生成的生物（品种、幼年、装备跟着右边的设置变），不是蛋本身 */
    var et = eggEntityOf(d), pa = esPreviewAttrs(et, eff.entity_data);
    vis = h('entity', { class: 'k-ent', type: Reg.full(et), rotatable: true });
    Object.keys(pa).forEach(function (k) { vis.setAttribute(k, pa[k]); });
  }
  else if (view === '3d') { vis = h('model', { class: 'k-ico k-model', item: fullId(heroItemId(d)), rotatable: true }); vis.setAttribute('components', stackCompsSnbt(d)); vis.setAttribute('count', String(d.count)); }
  else { vis = itemIcon(heroItemId(d), 48); if (vis.tagName && vis.tagName.toLowerCase() === 'item') { vis.setAttribute('components', stackCompsSnbt(d)); vis.setAttribute('count', String(d.count)); } }
  /* 预览头：可折叠（折叠后不再渲染 3D 模型），右边是 2D / 3D 切换 */
  var open = UI.stageOpen !== false;
  var shead = h('div', { class: 'ed-stagehead' }, [foldArrow(open, 8), h('span', { text: '预览' }), h('div', { class: 'grow' })]);
  shead.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.ed-view')) return; heroFold('.ed-stage', open, function (v) { UI.stageOpen = v; Prefs.set('stageOpen', v); }); });
  if (can3d && open) {
    var seg = h('div', { class: 'k-seg ed-view', title: kind === 'spawn' ? '2D 显示蛋 / 3D 显示生成的生物（会记住你的选择）' : '物品预览：2D 图标 / 3D 模型（会记住你的选择）' });
    ['2d', '3d'].forEach(function (v) {
      var b = h('div', { class: 'k-segi' + (view === v ? ' on' : ''), text: v.toUpperCase() });
      activate(b, function () { if (UI.heroView === v) return; UI.heroView = v; Prefs.set('heroView', v); drawHero(); });
      seg.appendChild(b);
    });
    shead.appendChild(seg);
  }
  hero.appendChild(shead);
  if (open) hero.appendChild(h('div', { class: 'ed-stage' + (ench ? ' glint' : '') + (vis.tagName && vis.tagName.toLowerCase() === 'entity' ? ' ent' : '') }, [h('div', { class: 'plate' }), vis]));
  var nm = h('div', { class: 'ed-name' + (displayName(d).length > 6 ? ' sm' : '') }); var r = nameRuns(d);
  renderRuns(nm, r.base, r.runs, { color: rarityHex(d), italic: eff.custom_name !== undefined });
  hero.appendChild(nm);
  var tags = h('div', { class: 'ed-tags' }, [h('span', { class: 'k-tag', text: info.name }), h('span', { class: 'k-tag dim', text: RARITY_ZH[eff.rarity || 'common'] }), d.count > 1 ? h('span', { class: 'k-tag dim', text: '× ' + d.count }) : null]);
  hero.appendChild(tags);
  var stats = h('div', { class: 'ed-stats' });
  heroStats(d, kind).forEach(function (s) { stats.appendChild(h('div', { class: 'k-stat' }, [h('span', { class: 'sl', text: s.label }), h('b', { text: s.value })])); });
  if (typeof eff.max_damage === 'number') {
    var rem = Math.max(0, eff.max_damage - (eff.damage || 0)), ratio = Math.max(0, Math.min(1, rem / eff.max_damage));
    stats.appendChild(h('div', { class: 'k-stat' }, [h('span', { class: 'sl', text: '耐久' }), h('b', { text: fmtInt(rem) + ' / ' + fmtInt(eff.max_damage) })]));
    stats.appendChild(h('div', { class: 'k-meter' + (ratio < 0.15 ? ' bad' : ratio < 0.4 ? ' warn' : '') }, [h('i', { style: 'width:' + (ratio * 100) + '%' })]));
  }
  var sOpen = UI.statsOpen !== false;
  var sh = h('div', { class: 'ed-stagehead' }, [foldArrow(sOpen, 8), h('span', { text: '属性' }), h('div', { class: 'grow' })]);
  sh.addEventListener('click', function () { heroFold('.ed-stats', sOpen, function (v) { UI.statsOpen = v; Prefs.set('statsOpen', v); }); });
  hero.appendChild(sh);
  if (sOpen) hero.appendChild(stats);
  /* 提示框预览：可折叠、限高、内部滚动，放得下几十条附魔 */
  var tipHead = h('div', { class: 'ed-tiphead' }, [foldArrow(!!UI.tipOpen, 10), h('span', { text: '提示框预览' }), h('div', { class: 'grow' })]);
  var dbg = h('div', { class: 'k-mini' + (UI.tipAdv ? ' on' : ''), title: '调试信息（F3+H）：显示物品 ID 和耐久' }, [uiIcon('bug', 11)]); dbg.addEventListener('click', function (e) { e.stopPropagation(); UI.tipAdv = !UI.tipAdv; drawHero(); });
  var big = h('div', { class: 'k-mini', title: '放大查看（近似预览，游戏内以原版绘制为准）' }, [uiIcon('maximize', 11)]); big.addEventListener('click', function (e) { e.stopPropagation(); openTipModal(); });
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
  var hr = hero.getBoundingClientRect(), br = box.getBoundingClientRect();
  var avail = Math.floor(hr.bottom - br.top - 10);
  if (avail < 80) avail = 80;
  if (br.height > avail) box.style.maxHeight = avail + 'px';
}
function openTipModal() {
  var d = Store.doc();
  openModal(modalShell('提示框预览', nameOfItem(d.id), [h('div', { class: 'k-bigtip' }, [buildTooltip(d, UI.tipAdv, 'item-preview-big')])], [kBtn('关闭', closeModal, { cls: 'pri' })], 'slim'));
}

/* ---------- 提示框 ---------- */
var SLOT_HEAD = { mainhand: '在主手：', offhand: '在副手：', hand: '拿在手上时：', head: '穿在头部：', chest: '穿在身上：', legs: '穿在腿上：', feet: '穿在脚上：', armor: '穿着时：', body: '穿在身体：', saddle: '作为鞍时：', any: '生效时：' };
/* 提示框预览：优先显示游戏自己生成的那份（和游戏里一模一样，含模组组件、附魔、属性行）；
   宿主不可用 / 请求太大 / 出错时退回下面页面里手写的近似版。结果到之前先显示上一份（或近似版），到了再换。 */
function hostTipStack(d) {
  var typed = nbtApplyFormats(d), st = { id: d.id, count: d.count, comps: typed.comps, removed: clone(d.removed) };
  if (typed.formats) st.component_formats = typed.formats;
  if (d.snbt && Object.keys(d.snbt).length) st.component_snbt = clone(d.snbt);
  return st;
}
function paintHostTip(box, r) {
  clear(box);
  if (!r.lines || !r.lines.length) { box.appendChild(h('div', { class: 'tl', style: 'color:#888', text: '（这个物品的提示框被完全隐藏）' })); return; }
  r.lines.forEach(function (runs) {
    var el = h('div', { class: 'tl' });
    (runs || []).forEach(function (u) {
      if (!u.text) return;
      var css = 'color:' + (u.color || '#FFFFFF') + ';' + (u.bold ? 'font-weight:bold;' : '') + (u.italic ? 'font-style:italic;' : '');
      var deco = []; if (u.underlined) deco.push('underline'); if (u.strikethrough) deco.push('line-through');
      if (deco.length) css += 'text-decoration-line:' + deco.join(' ') + ';';
      var sp = h('span', { text: u.obfuscated ? String(u.text).replace(/./g, '▒') : u.text }); sp.setAttribute('style', css); el.appendChild(sp);
    });
    box.appendChild(el);
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
  var eff = effectiveComps(d), box = h('div', { class: 'ed-tip' });
  var hid = eff.tooltip_display || {}, hidden = hid.hidden_components || [];
  if (hid.hide_tooltip) { box.appendChild(h('div', { class: 'tl', style: 'color:#888', text: '（这个物品的提示框被完全隐藏）' })); return box; }
  function line(t, color, extra) { box.appendChild(h('div', { class: 'tl' + (extra ? ' ' + extra : ''), style: 'color:' + color, text: t })); }
  var nr = nameRuns(d), nl = h('div', { class: 'tl' }); renderRuns(nl, nr.base, nr.runs, { color: rarityHex(d), italic: eff.custom_name !== undefined }); box.appendChild(nl);
  var pc = eff.potion_contents; if (pc && hidden.indexOf('minecraft:potion_contents') < 0) {
    var po = typeof pc === 'string' ? { potion: pc } : pc;
    if (po.potion) line(potionName(po.potion), '#AAAAAA');
    (po.custom_effects || []).forEach(function (fx) { var i = EFIDX[shortId(fx.id || '')]; line((i ? i.name : fx.id) + (fx.amplifier ? ' ' + levelText(fx.amplifier + 1) : '') + (fx.duration ? ' (' + fmtDur(fx.duration) + ')' : ''), i && i.kind === '负面' ? '#FF5555' : '#5555FF'); });
  }
  [['enchantments', eff.enchantments], ['stored_enchantments', eff.stored_enchantments]].forEach(function (p) {
    if (!isObj(p[1]) || hidden.indexOf('minecraft:' + p[0]) >= 0) return;
    Object.keys(p[1]).forEach(function (k) { var id = shortId(k), e = ENIDX[id]; line((e ? e.name : id) + (e && e.max === 1 && p[1][k] === 1 ? '' : ' ' + levelText(p[1][k])), (function () { var re = Reg.enchant(k); return re && re.live ? re.tags.indexOf('minecraft:curse') >= 0 : /curse/.test(id); })() ? '#FF5555' : '#AAAAAA'); });
  });
  if (Array.isArray(eff.lore)) eff.lore.forEach(function (l) { var r = tcRuns(l); var el = h('div', { class: 'tl' }); if (r) renderRuns(el, r.base, r.runs, { color: '#AA00AA', italic: true }); else el.textContent = '（复杂文本）'; box.appendChild(el); });
  if (eff.unbreakable !== undefined && hidden.indexOf('minecraft:unbreakable') < 0) line('不可破坏', '#5555FF');
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
    if (typeof eff.max_damage === 'number' && eff.unbreakable === undefined) line('耐久度：' + fmtInt(Math.max(0, eff.max_damage - (eff.damage || 0))) + ' / ' + fmtInt(eff.max_damage), '#FFFFFF', 'gap');
    line(d.id, '#555555', 'id');
    line(Object.keys(d.comps).length + ' 个自定义组件', '#555555');
  }
  return box;
}

/* ==================== 二级窗口：高级 / 添加设置 ==================== */
var ADV_TABS = [['all', '全部组件', 'list'], ['snbt', '物品数据', 'code'], ['cmd', '命令', 'terminal'], ['diff', '改动对比', 'filter'], ['hist', '修改历史', 'clock']];
function openAdvanced(which) {
  if (which) UI.adv = which;
  var nav = h('div', { class: 'advnav' }), main = h('div', { class: 'advmain', id: 'advmain' });
  var x = h('div', { class: 'k-mini', text: '×' }); activate(x, closeModal);
  var win = h('div', { class: 'k-modal advwin', id: 'advwin' }, [
    h('div', { class: 'k-mh' }, [uiIcon('code', 14), h('b', { text: '高级' }), h('span', { class: 'k-sub', text: nameOfItem(Store.doc().id) }), h('div', { class: 'grow' }), x]),
    h('div', { class: 'advbody' }, [nav, main])]);
  function paintNav() {
    clear(nav);
    ADV_TABS.forEach(function (a) { var it = h('div', { class: 'advnav-i' + (UI.adv === a[0] ? ' on' : '') }, [uiIcon(a[2], 14), h('span', { text: a[1] })]); activate(it, function () { UI.adv = a[0]; paintNav(); drawAdvContent(); }); nav.appendChild(it); });
  }
  paintNav(); openModal(win); windowify(win, 'adv'); drawAdvContent();
}
function drawAdvContent() {
  var host = $('advmain'); if (!host) return; clear(host);
  setTimeout(function () { growable($('advmain')); }, 0);
  if (UI.adv === 'all') advAll(host); else if (UI.adv === 'snbt') advSnbt(host); else if (UI.adv === 'cmd') advCmd(host); else if (UI.adv === 'diff') advDiff(host); else advHist(host);
}
/* 数据里的组件说明是 wiki 原文，列表里只取第一句、去掉「此组件负责…」的套话 */
function shortDesc(t) {
  t = (t || '').replace(/^此组件(负责|控制了?|用于|存储了?|记录了?)?/, '').replace(/^[，、：s]+/, '');
  var i = t.search(/[。；]/); if (i > 0) t = t.substring(0, i);
  return t;
}
function emptyMore() {
  var b = kBtn('添加设置', openAddSetting, { cls: 'pri', icon: 'plus' });
  return h('div', { class: 'k-empty more' }, [h('div', { text: '这个物品还没有附加设置。' }), b]);
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
    var vw = window.innerWidth, vh = window.innerHeight;
    var mw = Math.min(kind === 'detail' ? 340 : kind === 'adv' ? 480 : 420, vw - 8), mh = Math.min(kind === 'detail' ? 260 : kind === 'adv' ? 240 : 220, vh - 8); g.w = clampN(g.w, mw, vw - 8); g.h = clampN(g.h, mh, vh - 8); g.x = clampN(g.x, 0, vw - g.w); g.y = clampN(g.y, 0, vh - g.h);
    win.setAttribute('style', 'position:fixed;margin:0;max-width:none;max-height:none;left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px;');
  }
  function snap() { var r = win.getBoundingClientRect(); if (g.x === undefined) { g.x = r.left; g.y = r.top; g.w = r.width; g.h = r.height; } }
  head.addEventListener('mousedown', function (e) {
    if (g.max || (e.button !== undefined && e.button !== 0) || (e.target.closest && e.target.closest('.k-mini'))) return;
    snap(); var sx = e.clientX, sy = e.clientY, x0 = g.x, y0 = g.y;
    dragTrack(e, function (ev) { g.x = x0 + ev.clientX - sx; g.y = y0 + ev.clientY - sy; apply(); });
  });
  /* 右边缘、下边缘、右下角三个手柄：只改宽 / 只改高 / 同时改 */
  function handle(cls, title, dx, dy) {
    var hd = h('div', { class: cls, title: title });
    hd.addEventListener('mousedown', function (e) {
      if (g.max || (e.button !== undefined && e.button !== 0)) return;
      snap(); var sx = e.clientX, sy = e.clientY, w0 = g.w, h0 = g.h;
      dragTrack(e, function (ev) { if (dx) g.w = w0 + ev.clientX - sx; if (dy) g.h = h0 + ev.clientY - sy; apply(); });
    });
    win.appendChild(hd);
  }
  handle('k-medge-r', '拖动调整宽度', 1, 0); handle('k-medge-b', '拖动调整高度', 0, 1); handle('k-mresize', '拖动调整大小', 1, 1);
  apply();
}
var CAT_SHORT = { look: '外观文本', dura: '耐久堆叠', combat: '战斗工具', use: '食用使用', equip: '装备纹饰', cont: '容器数据', book: '书与地图', fx: '药水烟花' };
function openAddSetting() {
  var d = Store.doc(), kind = kindOfItem(d.id);
  var q = h('input', { class: 'k-input', type: 'text', placeholder: '搜索，例如「发光」「食物」「耐久」', spellcheck: 'false' });
  var catSel = 'all';
  var cats = h('div', { class: 'addcats' }), list = h('div', { class: 'addlist' });
  function covered(cid) { return coveredComps(kind)[cid]; }
  function paintCats() {
    clear(cats);
    [{ id: 'all', name: '全部', icon: 'grid' }].concat(EDATA.cats.filter(function (c) { return c.id !== 'variant'; })).forEach(function (c) { var t = h('div', { class: 'addcat' + (catSel === c.id ? ' on' : '') }, [uiIcon(c.icon || 'grid', 14), h('span', { text: CAT_SHORT[c.id] || c.name })]); activate(t, function () { catSel = c.id; paintCats(); paint(); }); cats.appendChild(t); });
  }
  function paint() {
    clear(list); var s = q.value.trim().toLowerCase(), n = 0;
    EDATA.comps.forEach(function (c) {
      if (c.cat === 'variant' && catSel !== 'variant') return;
      if (catSel !== 'all' && c.cat !== catSel) return;
      if (s && !kMatch(c.id + c.name + c.desc, s)) return;
      n++;
      var has = effectiveComps(Store.doc())[c.id] !== undefined;
      var row = h('div', { class: 'addrow' + (has ? ' has' : '') }, [compIcon(c), h('div', { class: 'tx' }, [h('div', { class: 'z', text: c.name }), h('div', { class: 's', text: shortDesc(c.desc) })]), has ? h('span', { class: 'k-tag dim', text: '已有' }) : h('span', { class: 'k-tag', text: '添加' })]);
      activate(row, function () { closeModal(); addSetting(c.id); });
      list.appendChild(row);
    });
    if (!n) list.appendChild(h('div', { class: 'k-empty', text: '没有匹配的设置。' }));
  }
  var sbox = kSearchBox(q, paint);
  var x = h('div', { class: 'k-mini', text: '×' }); activate(x, closeModal);
  var win = h('div', { class: 'k-modal addwin' }, [
    h('div', { class: 'k-mh' }, [uiIcon('plus', 14), h('b', { text: '添加设置' }), h('span', { class: 'k-sub', text: '给物品加上它本来没有的功能' }), h('div', { class: 'grow' }), x]),
    h('div', { class: 'addbody' }, [cats, h('div', { class: 'addmain' }, [h('div', { class: 'addtop' }, [sbox.el]), list])])]);
  paintCats(); paint(); openModal(win); windowify(win, 'add'); q.focus();
}
/* 把一个组件加到物品上，然后跳到能编辑它的那一页 */
function addSetting(cid) {
  var d = Store.doc(), kind = kindOfItem(d.id), c = CIDX[cid];
  if (effectiveComps(d)[cid] === undefined) Store.set(cid, defaultFor(c.schema), { structural: true, label: '添加 ' + c.name });
  var tabs = tabsOfKind(kind), at = tabs.filter(function (t) { return t.cards.some(function (k) { return cardComps(k).indexOf(cid) >= 0; }); })[0];
  UI.tab = (at || tabs[tabs.length - 1]).id; drawTabbar(); drawTabBody();
  toast('已添加「' + c.name + '」', 'ok');
}
function advAll(host) {
  var d = Store.doc(), wrap = h('div', { class: 'adv' }), left = h('div', { class: 'adv-l' }), right = h('div', { class: 'adv-r' });
  var q = h('input', { class: 'k-input', type: 'text', value: UI.advQ, placeholder: '筛选 107 个组件', spellcheck: 'false' });
  var list = h('div', { class: 'adv-list' });
  function paint() {
    clear(list); var s = UI.advQ.trim().toLowerCase();
    var proto = protoOf(d.id), chg = [], inh = [], rest = [];
    EDATA.comps.forEach(function (c) { if (s && !kMatch(c.id + c.name + c.desc, s)) return; var it = intentOf(d, c.id); if (it !== 'inherit') chg.push(c); else if (proto[c.id] !== undefined) inh.push(c); else rest.push(c); });
    function grp(t, arr, cls) { if (!arr.length) return; list.appendChild(h('div', { class: 'adv-grp ' + (cls || ''), text: t + ' ' + arr.length })); arr.forEach(function (c) { var it = intentOf(d, c.id); var row = h('div', { class: 'adv-row' + (UI.advSel === c.id ? ' on' : ''), title: 'minecraft:' + c.id + '\n' + c.desc }, [h('span', { class: 'z', text: c.name }), h('i', { class: 'st ' + it })]); activate(row, function () { UI.advSel = c.id; paint(); drawAdvForm(right); }); list.appendChild(row); }); }
    grp('已修改', chg, 'chg'); grp('原型自带', inh); grp('其它组件', rest);
  }
  var sbox = kSearchBox(q, function (v) { UI.advQ = v; paint(); });
  left.appendChild(sbox.el); left.appendChild(list); wrap.appendChild(left); wrap.appendChild(right); host.appendChild(wrap);
  paint(); drawAdvForm(right);
}
function drawAdvForm(host) {
  clear(host); var d = Store.doc(), cid = UI.advSel, c = cid && CIDX[cid];
  if (!c) { host.appendChild(h('div', { class: 'k-empty', text: '在左边选一个组件，查看并编辑它的原始数据。' })); return; }
  var it = intentOf(d, cid), proto = protoOf(d.id)[cid];
  var head = h('div', { class: 'ed-fhead' }, [h('div', { class: 'ttl' }, [h('div', {}, [h('div', { class: 'z', text: c.name }), h('div', { class: 'id', text: 'minecraft:' + cid })])]),
    kSeg([{ v: 'inherit', label: proto !== undefined ? '继承原型' : '未设置' }, { v: 'set', label: '覆盖' }, { v: 'remove', label: '移除' }], it, function (v) {
      if (v === 'set') { var val = d.comps[cid] !== undefined ? d.comps[cid] : (proto !== undefined ? clone(proto) : defaultFor(c.schema)); Store.set(cid, val, { structural: true, label: '覆盖 ' + c.name }); }
      else if (v === 'inherit') Store.inherit(cid); else Store.remove(cid);
    }).el]);
  host.appendChild(head); host.appendChild(h('div', { class: 'ed-desc', text: c.desc + (c.app ? ' — ' + c.app : '') }));
  if (c.note) host.appendChild(h('div', { class: 'ed-note', text: c.note }));
  var body = h('div', { class: 'ed-fbody' });
  if (it === 'set') body.appendChild(renderComponentForm(cid, d.comps[cid], function (v, o) { Store.set(cid, v, { key: 'f-' + cid + (o && o.key ? o.key : ''), structural: false }); }, d));
  else if (it === 'remove') body.appendChild(h('div', { class: 'ed-state remove' }, [uiIcon('trash', 14), h('div', {}, [h('b', { text: '该组件已被显式移除' }), h('p', { text: '命令中会写入 !' + cid + '。' })])]));
  else { body.appendChild(h('div', { class: 'ed-state' }, [uiIcon('info', 14), h('div', {}, [h('b', { text: proto !== undefined ? '使用物品原型的值' : '此物品没有这个组件' }), h('p', { text: proto !== undefined ? '点「覆盖」后可以修改。' : '点「覆盖」添加它。' })])])); if (proto !== undefined) body.appendChild(h('pre', { class: 'ed-code', text: toSnbt(proto, c.schema, true) })); }
  host.appendChild(body);
}
var NL = String.fromCharCode(10);
function stackSnbt(d) {
  var parts = [];
  Object.keys(d.comps).sort().forEach(function (k) { var c = CIDX[k]; parts.push('    ' + snbtKey('minecraft:' + k) + ': ' + toSnbt(d.comps[k], c ? c.schema : null, true, 2)); });
  Object.keys(d.removed).sort().forEach(function (k) { parts.push('    ' + snbtKey('!minecraft:' + k) + ': {}'); });
  var body = parts.length ? '{' + NL + parts.join(',' + NL) + NL + '  }' : '{}';
  return '{' + NL + '  id: ' + snbtStr(d.id) + ',' + NL + '  count: ' + d.count + ',' + NL + '  components: ' + body + NL + '}';
}
function stackNbt(d) { var comps = {}; Object.keys(d.comps).sort().forEach(function (k) { comps['minecraft:' + k] = d.comps[k]; }); Object.keys(d.removed).sort().forEach(function (k) { comps['!minecraft:' + k] = {}; }); return { id: d.id, count: d.count, components: comps }; }
function advSnbt(host) {
  var d = Store.doc(), ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false' }), err = h('div', { class: 'ed-err' });
  ta.value = stackSnbt(d);
  function apply() {
    try {
      var p = parseSnbtUser(ta.value); if (!isObj(p)) throw new Error('顶层需要是 {…}');
      var comps = {}, removed = {}, src = p.components || {};
      Object.keys(src).forEach(function (k) { if (k.charAt(0) === '!') removed[shortId(k.substring(1))] = 1; else comps[shortId(k)] = src[k]; });
      var id = typeof p.id === 'string' ? fullId(p.id) : d.id; if (!ITEMSET[shortId(id)]) throw new Error('未知物品 ' + id);
      d.id = id; d.count = typeof p.count === 'number' ? p.count : d.count; Store.replace(comps, removed, '通过 SNBT 修改'); err.textContent = ''; toast('SNBT 已应用', 'ok');
    } catch (e) { var b = ta.value.substring(0, e.pos || 0), ln = b.split(NL).length, col = b.length - b.lastIndexOf(NL); err.textContent = '第 ' + ln + ' 行第 ' + col + ' 列：' + e.message; }
  }
  ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply(); } });
  host.appendChild(h('div', { class: 'pad' }, [h('div', { class: 'ed-sbar' }, [h('span', { class: 'ed-hint grow', text: 'id、数量和全部组件；以 ! 开头的键表示移除组件' }), kBtn('应用 Ctrl+Enter', apply, { cls: 'pri' })]), ta, err]));
}
function advCmd(host) {
  var d = Store.doc(), out = h('textarea', { class: 'ed-out', readonly: true, rows: '6', spellcheck: 'false' });
  function text() { if (UI.cmdFmt === 'snbt') return stackSnbt(d); if (UI.cmdFmt === 'json') return JSON.stringify(stackNbt(d), null, 2); return buildCommand(d, UI.cmdMode, UI.cmdSel); }
  out.value = text();
  var cnt = h('span', { class: 'k-sub' }); function len() { cnt.textContent = out.value.length + ' 字符'; } len();
  var pad = h('div', { class: 'pad' });
  pad.appendChild(h('div', { class: 'ed-sbar' }, [h('span', { class: 'k-sub', text: '输出格式' }), kSeg([{ v: 'cmd', label: '命令' }, { v: 'snbt', label: '物品栈 SNBT' }, { v: 'json', label: 'JSON' }], UI.cmdFmt, function (v) { UI.cmdFmt = v; drawAdvContent(); }).el]));
  if (UI.cmdFmt === 'cmd') {
    pad.appendChild(fieldRow('怎么交给玩家', kSeg(CMD_MODES.map(function (m) { return { v: m.id, label: m.name }; }), UI.cmdMode, function (v) { UI.cmdMode = v; out.value = text(); len(); }).el));
    /* 命令方块、函数、服务器控制台里没有「执行者」，@s 会报「没有找到实体」：按执行位置给对应的写法 */
    var selIn = kInput(UI.cmdSel, function (v) { UI.cmdSel = v || '@s'; out.value = text(); len(); syncWhere(); }, { placeholder: '@s / @p / 玩家名' });
    var whereSeg;
    function whereOf() { return UI.cmdSel === '@s' ? 'chat' : UI.cmdSel === '@p' ? 'block' : 'name'; }
    function syncWhere() { if (whereSeg) whereSeg.set(whereOf()); }
    whereSeg = kSeg([{ v: 'chat', label: '聊天框' }, { v: 'block', label: '命令方块' }, { v: 'name', label: '控制台 / 函数' }], whereOf(), function (v) {
      UI.cmdSel = v === 'chat' ? '@s' : v === 'block' ? '@p' : (/^[A-Za-z0-9_]{1,16}$/.test(UI.cmdSel) ? UI.cmdSel : '玩家名');
      selIn.value = UI.cmdSel; out.value = text(); len();
      if (v === 'name') { selIn.focus(); }
    });
    pad.appendChild(fieldRow('在哪里运行', whereSeg.el));
    pad.appendChild(fieldRow('目标选择器', selIn));
    pad.appendChild(h('div', { class: 'ed-hint', text: '命令方块、函数、控制台没有执行者，不能写 @s；命令方块用 @p，控制台和函数填你的玩家名。' }));
  }
  pad.appendChild(out);
  /* 页面脚本不能写剪贴板（Oriel 沙箱设计）：宿主声明 hostClip 后，把文本交给宿主写入；没有宿主时退回「全选，请按 Ctrl+C」 */
  var copy = kBtn('复制', function () {
    if (Prefs.hostClip && typeof oriel !== 'undefined' && oriel.send) { oriel.send('clipboard', { text: out.value }); toast('已复制到剪贴板', 'ok'); return; }
    out.focus(); if (out.select) out.select(); toast('已全选，请按 Ctrl+C 复制', 'info');
  }, { icon: 'copy' });
  pad.appendChild(h('div', { class: 'ed-sbar' }, [cnt, h('div', { class: 'grow' }), copy, kBtn('应用到游戏', function () { applyToGame(); }, { cls: 'pri', icon: 'play' })]));
  host.appendChild(pad);
}
function advDiff(host) {
  var d = Store.doc(), df = diffDoc(d), pad = h('div', { class: 'pad' });
  var top = h('div', { class: 'ed-sbar' }, [h('div', { class: 'grow k-lbl', text: df.length ? '与上次应用相比，改动了 ' + df.length + ' 项' : '与上次应用相比没有改动' })]);
  if (df.length) top.appendChild(kBtn('还原全部', function () { Store.revertAll(); toast('已还原全部修改', 'ok'); }, { cls: 'dng', icon: 'restore' }));
  pad.appendChild(top);
  df.forEach(function (x) {
    var ds = describeDiff(x);
    var row = h('div', { class: 'ed-diff ' + ds.kind }, [h('div', { class: 'hd' }, [h('b', { class: 'sg', text: { add: '＋', rm: '－', ch: '～', rv: '↺' }[ds.kind] }), h('span', { class: 'nm', text: ds.name }), h('span', { class: 'id', text: x.cid.charAt(0) === '#' ? '' : x.cid }), h('div', { class: 'grow' })]), h('div', { class: 'cols' }, [h('div', { class: 'col b' }, [h('span', { class: 'lb', text: '之前' }), ds.before]), h('div', { class: 'col a' }, [h('span', { class: 'lb', text: '现在' }), ds.after])])]);
    if (x.cid.charAt(0) !== '#') row.querySelector('.hd').appendChild(kBtn('还原此项', function () { revertComp(Store.doc(), x.cid); Store.replace(Store.doc().comps, Store.doc().removed, '还原 ' + ds.name); }));
    pad.appendChild(row);
  });
  if (!df.length) pad.appendChild(h('div', { class: 'k-empty', text: '没有修改。改动任何内容后，这里会逐项列出。' }));
  host.appendChild(pad);
}
function advHist(host) {
  var d = Store.doc(), pad = h('div', { class: 'pad' });
  pad.appendChild(h('div', { class: 'k-lbl', text: '点一条回到那一步，之后的步骤可重做' }));
  var wrap = h('div', { class: 'k-scrollbox tall' });
  for (var i = d.hist.length - 1; i >= 0; i--) (function (i) { var e = d.hist[i]; var row = h('div', { class: 'k-hist' + (i === d.hi ? ' on' : '') + (i > d.hi ? ' future' : '') }, [h('span', { class: 'ix', text: String(i) }), h('span', { text: e.label })]); activate(row, function () { Store.jump(i); }); wrap.appendChild(row); })(i);
  pad.appendChild(wrap); host.appendChild(pad);
}

/* ==================== 底栏 / 应用 ==================== */
/* 问题列表：点一条就跳到对应的分页和卡片，展开它并闪一下 */
function openProblems(anchor, list) {
  var box = h('div', { class: 'k-moretabs' });
  list.forEach(function (p) {
    var row = h('div', { class: 'k-mt' }, [uiIcon(p.level === 'error' ? 'close' : 'warning', 14), h('div', { class: 'tx' }, [h('div', { class: 'z', text: p.msg }), p.cid && p.cid.charAt(0) !== '#' ? h('div', { class: 's', text: (CIDX[p.cid] ? CIDX[p.cid].name : p.cid) }) : null])]);
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
    var old = c.el.querySelector('.k-probline'); if (old) old.remove();
    var mine = pr.filter(function (p) { var cid = p.cid === '#count' ? 'max_stack_size' : p.cid; return cid && c.comps.indexOf(cid) >= 0; });
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
      var tg = h('div', { class: 'pl more' }, [foldArrow(open, 8), h('span', { text: open ? '收起' : '还有 ' + hid.length + ' 条' + (he ? '（含 ' + he + ' 个错误）' : '提醒') })]);
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
  if (!cid || cid.charAt(0) === '#') { toast(msg || '这一项在页面顶部的物品信息里', 'info'); return; }
  var d = Store.doc(), kind = kindOfItem(d.id), tabs = tabsOfKind(kind);
  var at = tabs.filter(function (t) { return t.cards.some(function (k) { return cardComps(k).indexOf(cid) >= 0; }); })[0];
  if (!at) { openAdvanced('all'); return; }
  if (UI.tab !== at.id) { UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.tab = at.id; drawTabbar(); drawTabBody(); }
  var card = UI.page ? UI.page.cards.filter(function (c) { return c.comps.indexOf(cid) >= 0; })[0] : null;
  if (!card) return;
  if (card.setCollapsed) card.setCollapsed(false);
  var body = $('edbody');
  setTimeout(function () {
    body.scrollTop = Math.max(0, body.scrollTop + card.el.getBoundingClientRect().top - body.getBoundingClientRect().top - 6);
    card.el.classList.add('m-attention'); setTimeout(function () { card.el.classList.remove('m-attention'); }, 1800);
    if (msg) toast(msg, 'info');
  }, 30);
}
function drawFooter() {
  var f = clear($('footer'));
  var d = Store.doc(), n = diffDoc(d).length, pr = validateDoc(d), errs = pr.filter(function (p) { return p.level === 'error'; }), warns = pr.filter(function (p) { return p.level === 'warn'; });
  var chg = h('span', { class: 'it' + (n ? ' chg' : '') }, [h('i', { class: 'dot' }), n ? n + ' 处改动尚未应用' : '没有未应用的改动']);
  f.appendChild(chg);
  if (n) { var lk = h('span', { class: 'lnk', text: '查看改动' }); lk.addEventListener('click', openApply); f.appendChild(lk); }
  function problemChip(cls, icon, list, label) {
    var el = h('span', { class: 'it ' + cls + ' pcl', title: '点击查看并跳转到对应设置' }, [uiIcon(icon, 12), list.length + ' 个' + label]);
    activate(el, function () { if (list.length === 1) { jumpToComp(list[0].cid, list[0].msg); return; } openProblems(el, list); });
    return el;
  }
  if (errs.length) f.appendChild(problemChip('bad', 'close', errs, '错误'));
  if (warns.length) f.appendChild(problemChip('wr', 'warning', warns, '提醒'));
  f.appendChild(h('div', { class: 'grow' }));
  f.appendChild(h('span', { class: 'it', text: '历史 ' + d.hi + '/' + (d.hist.length - 1) }));
}
function applyToGame() {
  if (EditorBridge.pending) { toast('上一笔修改尚未得到回执', 'info'); return; }
  var d = Store.doc(), errors = validateDoc(d).filter(function (p) { return p.level === 'error'; });
  if (errors.length) { toast(errors.map(function (p) { return p.msg; }).join('；'), 'error'); return; }
  var requestId = 'edit-' + Date.now() + '-' + (++EditorBridge.sequence);
  var payload = { requestId: requestId, command: buildCommand(d, UI.cmdMode, UI.cmdSel),
    id: d.id, item: d.id, count: d.count, comps: clone(d.comps), removed: clone(d.removed), slot: clone(d.src) };
  /* 被编辑过的自由 NBT 组件用 SNBT 提交，保住 byte / long / float 等类型 */
  var typed = nbtApplyFormats(d); payload.comps = typed.comps; if (typed.formats) payload.component_formats = typed.formats;
  EditorBridge.pending = { id: requestId, doc: d, snap: snapOf(d) };
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send('apply', payload) : false;
  if (sent) {
    toast('已提交给游戏，等待回执…', 'info');
    EditorBridge.timer = setTimeout(function () {
      if (!EditorBridge.pending || EditorBridge.pending.id !== requestId) return;
      EditorBridge.pending = null;
      toast('未收到写回确认，结果未知；草稿已保留，请关闭后重读物品', 'error');
    }, 15000);
  } else { EditorBridge.pending = null; toast('宿主没有接受提交（未连接、限流或数据过大）；草稿已保留', 'error'); }
}
function openApply() {
  var d = Store.doc(), df = diffDoc(d), pr = validateDoc(d), errs = pr.filter(function (p) { return p.level === 'error'; });
  var list = h('div', { class: 'k-scrollbox tall' }), wrap = h('div', { class: 'k-fxlist' });
  df.forEach(function (x) { var ds = describeDiff(x); wrap.appendChild(h('div', { class: 'k-chg ' + ds.kind }, [h('span', { class: 'nm', text: ds.name }), h('span', { class: 'ch', text: ds.before + '  →  ' + ds.after })])); });
  if (!df.length) wrap.appendChild(h('div', { class: 'k-empty', text: '没有任何修改。' }));
  list.appendChild(wrap);
  var modeSel = kSeg(CMD_MODES.map(function (m) { return { v: m.id, label: m.name }; }), UI.cmdMode, function (v) { UI.cmdMode = v; });
  var body = [list];
  if (errs.length) body.unshift(h('div', { class: 'k-effect bad', text: '还有 ' + errs.length + ' 个错误需要先处理：' + errs.map(function (e) { return e.msg; }).join('；') }));
  body.push(fieldRow('交给游戏的方式', modeSel.el, '默认替换你手里的物品'));
  var ok = kBtn('应用到游戏', function () { closeModal(); applyToGame(); }, { cls: 'pri' + (errs.length || !df.length ? ' dim' : ''), icon: 'play' });
  openModal(modalShell('应用修改', nameOfItem(d.id) + ' · ' + df.length + ' 处改动', body, [kBtn('取消', closeModal), kBtn('看命令', function () { closeModal(); openAdvanced('cmd'); }, { icon: 'terminal' }), ok]));
}

/* ==================== 命令面板 ==================== */
function toggleTheme() { UI.theme = UI.theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', UI.theme); }
function toggleStyle() { UI.style = UI.style === 'ore' ? 'smooth' : 'ore'; document.documentElement.setAttribute('data-style', UI.style); }
function paletteItems() {
  var out = [];
  function act(label, sub, kbd, run, icn) { out.push({ label: label, sub: sub, kbd: kbd, run: run, icon: icn }); }
  {
    act('撤销', '回到上一步', 'Ctrl+Z', function () { Store.undo(); }, 'undo'); act('重做', '恢复被撤销的步骤', 'Ctrl+Y', function () { Store.redo(); }, 'redo');
    act('应用修改…', '查看改动并应用', 'Ctrl+S', openApply, 'play'); act('添加设置…', '给物品加上它本来没有的功能', '', openAddSetting, 'plus'); act('高级…', '原始组件、物品数据、命令', '', function () { openAdvanced(); }, 'code');
    tabsOfKind(kindOfItem(Store.doc().id)).forEach(function (t, i) { act('跳到：' + t.label, '分页', i < 9 ? 'Ctrl+' + (i + 1) : '', function () { UI.tab = t.id; drawTabbar(); drawTabBody(); }, t.icon); });
    act('还原全部修改', '丢弃未应用的改动', '', function () { Store.revertAll(); }, 'restore');
    act('从命令导入…', '粘贴 /give 或 /item 命令', 'Ctrl+I', openImport, 'download');
    if (UI.page) UI.page.cards.forEach(function (c) { act('卡片：' + c.spec.title, '当前页', '', function () { c.el.classList.remove('collapsed'); if (c.el.scrollIntoView) c.el.scrollIntoView(); }, 'tag'); });
  }
  act('切换亮 / 暗主题', '', '', toggleTheme, 'sun'); act('切换界面风格', '像素 / 平滑', '', toggleStyle, 'palette');
  return out;
}
function openPalette() {
  var all = paletteItems(), sel = 0, shown = all.slice(0, 40);
  var input = h('input', { class: 'k-input', type: 'text', placeholder: '输入命令、分页、设置名…', spellcheck: 'false' });
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
    if (!shown.length) list.appendChild(h('div', { class: 'k-empty', text: '没有匹配项' }));
  }
  function filter() {
    var q = input.value.trim().toLowerCase();
    shown = all.filter(function (x) { return !q || kMatch(x.label + ' ' + (x.sub || ''), q); }).slice(0, 40);
    if (q.length >= 1) EDATA.comps.filter(function (c) { return kMatch(c.id + c.name, q); }).slice(0, 8).forEach(function (c) { shown.push({ label: '添加设置：' + c.name, sub: 'minecraft:' + c.id, icon: 'plus', run: function () { addSetting(c.id); } }); });
    sel = 0; paint();
  }
  input.addEventListener('input', filter);
  onKey(input, { ArrowDown: function () { sel = Math.min(shown.length - 1, sel + 1); paint(); }, ArrowUp: function () { sel = Math.max(0, sel - 1); paint(); }, Enter: function () { if (shown[sel]) run(shown[sel]); }, Escape: function () { closeModal(); } });
  openModal(h('div', { class: 'k-modal k-pal' }, [h('div', { class: 'k-ph' }, [uiIcon('search', 14), input]), list])); paint(); input.focus();
}

/* ==================== 从命令导入 ==================== */
function openImport() {
  var ta = h('textarea', { class: 'k-input', rows: '5', spellcheck: 'false', placeholder: '粘贴 /give … 、/item replace … with … 或 minecraft:物品[组件=值,!移除的组件] 数量' });
  var err = h('div', { class: 'ed-err' });
  function parse() { try { var p = parseStackString(ta.value); if (!ITEMSET[shortId(p.id)]) throw new Error('未知物品 ' + p.id); err.textContent = ''; return p; } catch (e) { err.textContent = '解析失败（第 ' + ((e.pos || 0) + 1) + ' 个字符附近）：' + e.message; return null; } }
  var nb = kBtn('替换当前物品', function () { var p = parse(); if (!p) return; var lb = Store.doc().label, sl = Store.doc().src; loadStack({ id: p.id, count: p.count, comps: p.comps, removed: p.removed, label: lb, slot: sl }); closeModal(); rebuild(); toast('已载入 ' + nameOfItem(p.id), 'ok'); }, { cls: 'pri', icon: 'download' });
  var mb = kBtn('合并到当前物品', function () { var p = parse(); if (!p || !Store.docs.length) return; var d = Store.doc(), comps = clone(d.comps), removed = clone(d.removed); Object.keys(p.comps).forEach(function (k) { comps[k] = p.comps[k]; delete removed[k]; }); Object.keys(p.removed).forEach(function (k) { delete comps[k]; removed[k] = 1; }); Store.replace(comps, removed, '从命令合并组件'); closeModal(); toast('已合并，可用 Ctrl+Z 撤销', 'ok'); }, { icon: 'plus' });
  openModal(modalShell('从命令导入', '粘贴别处复制的物品命令', [ta, err, h('div', { class: 'k-note', text: '支持带数量和 !组件 移除语法；/give @s、/item replace entity @s … with 这类前缀会自动识别。' })], [kBtn('取消', closeModal), mb, nb]));
  ta.focus();
}

/* 高级 → 设置 */
/* 设置：界面本身的偏好，和「高级」（原始数据、命令）分开 */
function openSettings() {
  var host = h('div', {}); advSettings(host);
  openModal(modalShell('设置', '界面偏好', [host], [h('div', { class: 'grow' }), kBtn('完成', closeModal, { cls: 'pri' })]));
}
function advSettings(host) {
  var box = h('div', { class: 'x-list set-list' });
  /* 一项设置 = 一行：图标 + 名称 / 一句说明 + 右侧控件（和子页的行同一个样式） */
  function row(icon, title, sub, control) { box.appendChild(xRow({ icon: uiIcon(icon, 14), title: title, sub: sub, right: control })); }
  box.appendChild(xSec('palette', '界面'));
  var snd1 = kToggle(Snd.on, function (on) { Snd.on = on; Prefs.set('uiSound', on); if (on) snd('minecraft:ui.button.click', 0.5, 1.1); }, '');
  row('music', '界面音效', '按钮、拖动排序、打开窗口时的声音', snd1.el);
  var th1 = kSeg([{ v: 'dark', label: '暗色' }, { v: 'light', label: '亮色' }], UI.theme, function (v) { if (v !== UI.theme) toggleTheme(); });
  row('sparkle', '主题', '暗色或亮色', th1.el);
  var hv = kSeg([{ v: '3d', label: '3D' }, { v: '2d', label: '2D' }], UI.heroView, function (v) { UI.heroView = v; Prefs.set('heroView', v); drawHero(); });
  row('cube', '左栏预览', '物品用 3D 模型还是 2D 图标', hv.el);
  box.appendChild(xSec('maximize', '窗口'));
  row('maximize', '窗口大小', '恢复默认窗口和左栏宽度', kBtn('恢复默认', function () { UI.winW = 0; UI.winH = 0; UI.heroW = 0; UI.maxed = false; applyWinStyle(); Prefs.set('winW', 0); Prefs.set('winH', 0); Prefs.set('heroWidth', 0); Prefs.set('windowMax', false); drawTopbar(); toast('已恢复默认窗口大小', 'ok'); }, { icon: 'undo' }));
  box.appendChild(xSec('bug', '调试'));
  var t = kToggle(Prefs.get('debug', false) === true, function (on) { Prefs.set('debug', on); if (on) dbg('调试已开启：拖动、写回、草稿等事件会弹提示并写入游戏日志'); }, '');
  row('bug', '调试模式', '关键操作弹提示，并写入游戏日志', t.el);
  host.appendChild(box);
}
