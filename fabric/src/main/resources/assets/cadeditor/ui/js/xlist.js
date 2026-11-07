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
/* 世界 / 实体 / 玩家页和物品页用同一种卡片：把容器里「xSec 标题 + 后面的内容」自动收成一张 kCard（折叠、展开动画、状态记忆都是物品页那一套）。
   不用每个页面单独改；标题后面没有内容的分区保持原样。 */
var X_CTX = { has: function () { return false; }, modified: function () { return false; }, reset: function () {}, disable: function () {}, enable: function () {} };
function foldify(root, keyBase) {
  if (!root || typeof kCard !== 'function') return;
  var kids = Array.prototype.slice.call(root.children), i = 0;
  function isSec(n) { return n && n.classList && n.classList.contains('x-sec'); }
  while (i < kids.length) {
    if (!isSec(kids[i])) { i++; continue; }
    var j = i + 1; while (j < kids.length && !isSec(kids[j])) j++;
    var head = kids[i], group = kids.slice(i + 1, j);
    if (group.length) {
      var st = head.querySelector('.x-st'), sm = head.querySelector('small'), title = st ? st.textContent : '', ic = head.firstChild;
      if (ic && ic.classList && (ic.classList.contains('x-st') || ic.classList.contains('grow'))) ic = null;
      var acts = []; var seenGrow = false;
      Array.prototype.slice.call(head.children).forEach(function (c) { if (seenGrow) acts.push(c); if (c.classList && c.classList.contains('grow')) seenGrow = true; });
      var key = (keyBase || 'w') + ':' + title; if (UIOpen['card:' + key] === undefined) UIOpen['card:' + key] = false;
      var card = kCard({ id: key, icon: ic || null, title: title, desc: sm ? sm.textContent : '' }, X_CTX);
      card.el.classList.add('w-card'); card.el._card = card;
      if (acts.length) {
        var wrap = h('span', { class: 'x-act' }); acts.forEach(function (a) { wrap.appendChild(a); });
        var hd = card.el.querySelector('.k-chead'); hd.insertBefore(wrap, hd.querySelector('.k-chev'));
        card.onHead = function (e) { return !!(e.target.closest && e.target.closest('.x-act')); };
      }
      group.forEach(function (n) { card.body.appendChild(n); });
      var list = h('div', { class: 'k-list' }, [card.el]); root.insertBefore(list, head); root.removeChild(head);
    }
    i = j;
  }
}
/* ---- 表单行：一行 = 标题 / 说明 + 右侧控件。数值、开关、文本、分段、下拉都用这几个，不要再手搭 xRow + kXxx ---- */
/* 数值行。o = { title, sub, subOf(v)→说明（随数值变化）, range:true（没写 sub 时自动写「范围 a ~ b」）, icon（元素 / false），tip,
   value, def（value 不是数字时用）, min, max, softMin, softMax, step, dec, unit, noSlider（默认 true；有 softMax 时默认 false），presets, warnMax, warnWhy,
   round（先 toFixed(4)）, stop:true（点数字框不触发行的展开）, onChange }。返回行元素；row.num 是 kNumber 控件。 */
function xNumCtl(value, o, stop) {
  var n = kNumber(value, o); n.el.classList.add('k-xnum');
  if (stop) n.el.addEventListener('click', function (ev) { ev.stopPropagation(); });
  return n;
}
function xNum(o) {
  var v = typeof o.value === 'number' ? o.value : (o.def !== undefined ? o.def : 0);
  if (o.round) v = +(+v).toFixed(4);
  var sub = o.sub, row;
  if (sub === undefined && o.subOf) sub = o.subOf(v);
  if (!sub && o.range && o.min !== undefined && o.max !== undefined) sub = '范围 ' + o.min + ' ~ ' + o.max;
  var q = { min: o.min, max: o.max, softMin: o.softMin, softMax: o.softMax, step: o.step || 1, dec: o.dec, unit: o.unit, presets: o.presets, warnMax: o.warnMax, warnWhy: o.warnWhy,
    noSlider: o.noSlider !== undefined ? o.noSlider : o.softMax === undefined,
    onChange: function (x) { o.onChange(x); if (o.subOf && row) { var s = row.querySelector('.s'); if (s) s.textContent = o.subOf(x); } } };
  var n = xNumCtl(v, q, o.stop);
  row = xRow({ icon: o.icon === undefined ? false : o.icon, title: o.title, sub: sub, tip: o.tip, right: n.el });
  row.num = n; return row;
}
/* 开关行。o = { title, sub, tip, icon, value, onChange(on) } */
function xToggle(o) {
  var t = kToggle(!!o.value, o.onChange);
  var row = xRow({ icon: o.icon === undefined ? false : o.icon, title: o.title, sub: o.sub, tip: o.tip, right: t.el });
  row.toggle = t; return row;
}
/* 文本行（失焦 / 回车才提交）。o = { title, sub, tip, icon, value, placeholder, cls, style, onCommit(text), onInput(text) } */
function xText(o) {
  var inp = kInput(o.value === undefined || o.value === null ? '' : o.value, o.onInput || function () {}, { placeholder: o.placeholder, onCommit: o.onCommit });
  if (o.cls) inp.classList.add(o.cls);
  if (o.style) inp.setAttribute('style', o.style);
  var row = xRow({ icon: o.icon === undefined ? false : o.icon, title: o.title, sub: o.sub, tip: o.tip, right: inp });
  row.input = inp; return row;
}
/* 分段选择行。o = { title, sub, tip, icon, options:[{v,label}], value, onChange(v) } */
function xSeg(o) {
  var s = kSeg(o.options, o.value, o.onChange);
  return xRow({ icon: o.icon === undefined ? false : o.icon, title: o.title, sub: o.sub, tip: o.tip, right: s.el });
}
/* 下拉行。o = { title, sub, tip, icon, options:[{v,label}], value, onChange(v), width } */
function xSelect(o) {
  var s = kSelect(o.options, o.value, o.onChange, o.width ? { width: o.width } : undefined);
  return xRow({ icon: o.icon === undefined ? false : o.icon, title: o.title, sub: o.sub, tip: o.tip, right: s.el });
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
