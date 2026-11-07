/* 真正的高度过渡。height:auto 不能直接过渡，所以先量出目标像素高度，从 0（或收到 0）过渡，结束后还原成 auto。
   展开：el 必须已经在文档里且可见；收起：过渡完成后才调用 done（再去真正隐藏 / 重画）。减少动效模式直接跳过。 */
function uiSlide(el, open, done) {
  var de = document.documentElement, reduced = !!(de && de.getAttribute && de.getAttribute('data-motion') === 'reduced');
  if (reduced || typeof setTimeout !== 'function' || !el || !el.getBoundingClientRect) { if (done) done(); return; }
  if (el._slideT) clearTimeout(el._slideT);
  var full;
  el.classList.add('x-sliding');
  if (open) {
    el.style.height = ''; el.style.opacity = ''; full = el.getBoundingClientRect().height;
    if (!full) { el.classList.remove('x-sliding'); if (done) done(); return; }
    el.style.height = '0px'; el.style.opacity = '0'; el.getBoundingClientRect();
    el.style.height = full + 'px'; el.style.opacity = '1';
  } else {
    full = el.getBoundingClientRect().height;
    el.style.height = full + 'px'; el.style.opacity = '1'; el.getBoundingClientRect();
    el.style.height = '0px'; el.style.opacity = '0';
  }
  el._slideT = setTimeout(function () { el._slideT = null; el.style.height = ''; el.style.opacity = ''; el.classList.remove('x-sliding'); if (done) done(); }, 240);
}
/* 与「其它属性加成」「使用结束时的效果」同款的行组件（k-xrow / k-xhead / k-xbody x2），放置与数据的子页都用它，保证和其他子页同一个质感。
   xRow：图标盒 + 标题/副标题 + 右侧控件 + 展开箭头；展开后是缩进的字段区（每行 图标+标签 | 控件）。 */
/* 折叠箭头：永远是一个“向下”的图标，靠旋转表示状态（收起 = 向右，展开 = 向下），状态切换才能走 CSS 过渡动画。
   换状态时对已有的箭头调用 foldArrowSet；新画出来的箭头用 foldArrowFrom 先放在旧状态、下一帧再转到新状态。 */
function foldArrow(open, size) { return h('span', { class: 'fold-arrow' + (open ? '' : ' closed') }, [uiIcon('down', size || 10)]); }
function foldArrowSet(a, open) { if (a && a.classList) a.classList.toggle('closed', !open); }
function foldArrowFrom(a, wasOpen, nowOpen) { if (!a) return; foldArrowSet(a, wasOpen); if (a.getBoundingClientRect) a.getBoundingClientRect(); foldArrowSet(a, nowOpen); }
var XOPEN_LOG = null;   /* 本次点击重画时新画出来的「已展开行」，用来补上滑入动画 */
function xRow(o) {
  var open = !!o.open, kids = [];
  if (o.grip) kids.push(kGrip());
  if (o.icon !== false) kids.push(h('div', { class: 'ic' }, [o.icon || uiIcon('cube', 14)]));
  kids.push(h('div', { class: 'tx', title: o.tip || '' }, [h('div', { class: 'z', text: o.title }), o.sub ? h('div', { class: 's', text: o.sub }) : null, o.meta || null]));
  if (o.right) kids.push(o.right);
  if (o.body || o.chevron) kids.push(foldArrow(open, 10));
  var head = h('div', { class: 'k-xhead' }, kids);
  var row = h('div', { class: 'k-xrow k-srow' + (open ? ' open' : '') }, [head]);
  if (open && XOPEN_LOG) XOPEN_LOG.push(row);
  if (o.onHead) head.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.k-btn, .k-grip, .k-mini, .k-xnum, .k-toggle, .k-sel, .k-num, input, textarea')) return;
    if (row._busy) return;
    var cur = row.querySelector('.k-xbody');
    if (row.classList.contains('open') && cur != null) {
      row._busy = true;
      foldArrowSet(row.querySelector('.fold-arrow'), false);
      uiSlide(cur, false, function () { row._busy = false; o.onHead(); });
      return;
    }
    XOPEN_LOG = [];
    try { o.onHead(); } finally { var made = XOPEN_LOG; XOPEN_LOG = null; made.forEach(function (r) { var b = r.querySelector('.k-xbody'); if (b != null) uiSlide(b, true); foldArrowFrom(r.querySelector('.fold-arrow'), false, true); }); }
  });
  if (open && o.body) row.appendChild(h('div', { class: 'k-xbody x2' }, o.body()));
  return row;
}
/* 展开区里的一行：左边 图标+标签，右边控件 */
function xField(icon, label, control) {
  return h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [icon ? uiIcon(icon, 14) : null, h('span', { text: label })]), control]);
}
/* 段标题：图标 + 标题 + 一句说明，右侧可放操作 */
function xSec(icon, title, hint, action) {
  return h('div', { class: 'x-sec' }, [icon ? uiIcon(icon, 14) : null, h('span', { class: 'x-st', text: title }), hint ? h('small', { text: hint }) : null, h('div', { class: 'grow' }), action || null]);
}
/* 虚线的「＋ 添加…」行 */
function xAdd(text, fn) {
  var el = h('div', { class: 'k-add' }, [uiIcon('plus', 12), text]);
  if (fn) activate(el, fn);
  return el;
}
function xEmpty(text) { return h('div', { class: 'k-empty', text: text }); }
/* 一组可展开的行（同一时间只展开一条）+ 底部「＋ 添加」+ 空状态。
   cfg: { items: ()=>数组, row: (item,i)=>xRow 参数(不含 open/onHead；有 body 才可展开), add: {text, fn(api)}, empty, selected }
   返回 { el, draw(), select(i), selected() } */
function xList(cfg) {
  var box = h('div', { class: 'x-list' }), list = h('div', { class: 'k-sortlist' }), selected = cfg.selected === undefined ? -1 : cfg.selected, api;
  function draw() {
    clear(list);
    var items = cfg.items();
    items.forEach(function (it, i) {
      var o = cfg.row(it, i);
      o.open = selected === i && !!o.body;
      if (o.body) o.onHead = function () { selected = selected === i ? -1 : i; draw(); };
      list.appendChild(xRow(o));
    });
    if (!items.length && cfg.empty !== '') list.appendChild(xEmpty(cfg.empty || '暂无条目'));
  }
  api = { el: box, draw: draw, select: function (i) { selected = i; draw(); }, selected: function () { return selected; } };
  box.appendChild(list);
  if (cfg.add) box.appendChild(xAdd(cfg.add.text, function () { cfg.add.fn(api); }));
  draw();
  return api;
}
/* 展开区底部：左边一句提示，右边红色删除 */
function xFoot(hint, onDelete, label) {
  return h('div', { class: 'x2f' }, [h('span', { class: 'k-sub', text: hint || '' }), kBtn(label || '删除', onDelete, { cls: 'dng', icon: 'trash' })]);
}
