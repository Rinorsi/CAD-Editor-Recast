/* 自绘提示框：替代原生 title，并给被截断的文字自动补全文。
   触发：元素带 data-tip / title；或是会被截断的文字（见 CLAMP）且实际被截断。多行文字用 \n 分隔，第一行作标题。 */
var Tip = (function () {
  var CLAMP = '.s, .z, .k-cdesc, .k-sub, .k-chip, .k-xval, .k-tag, .tx, .ttl, .k-prow, .pl span, .k-xhead, .snd-name, .rs-name, .rs-id, .pr-k';
  var el = null, owner = null, last = null, timer = null, hideT = null, hiddenAt = 0, mx = 0, my = 0;
  function trunc(n) {
    try {
      var r = n.getBoundingClientRect(); if (!r.width || !r.height) return null;
      var txt = (n.textContent || '').replace(/\s+/g, ' ').trim(); if (!txt) return null;
      var nowrap = false; try { var cs = window.getComputedStyle && window.getComputedStyle(n); nowrap = !!cs && cs.whiteSpace === 'nowrap'; } catch (e) {}
      var c = n.cloneNode(true); c.removeAttribute('id');
      var scale = typeof uiScaleFactor === 'function' ? uiScaleFactor() : 1;
      c.setAttribute('style', 'position:absolute;visibility:hidden;pointer-events:none;overflow:visible;text-overflow:clip;line-clamp:none;max-height:none;height:auto;max-width:none;' + (nowrap ? 'width:auto;white-space:nowrap;' : 'width:' + (r.width / scale) + 'px;white-space:normal;'));
      var p = n.parentNode; if (p == null) return null; p.appendChild(c);
      var rc = c.getBoundingClientRect(); p.removeChild(c);
      var cut = nowrap ? rc.width > r.width + 1 : rc.height > r.height + 1;
      return cut ? txt : null;
    } catch (e) { return null; }
  }
  function find(t) {
    for (var n = t, i = 0; n != null && n !== document && n.getAttribute && i < 8; n = n.parentNode, i++) {
      var tp = n.getAttribute('data-tip');
      if (!tp) { var ti = n.getAttribute('title'); if (ti) { n.setAttribute('data-tip', ti); n.removeAttribute('title'); tp = ti; } }
      if (tp) return { el: n, text: tp };
      if (i < 4 && n.matches && n.matches(CLAMP)) { var full = trunc(n); if (full) return { el: n, text: full }; }
    }
    return null;
  }
  function hide(now) {
    clearTimeout(timer); timer = null; owner = null;
    if (el == null) return;
    var e = el; el = null; hiddenAt = Date.now();
    if (now) { if (e.parentNode != null) e.parentNode.removeChild(e); return; }
    e.classList.remove('in'); e.classList.add('out');
    hideT = setTimeout(function () { if (e.parentNode != null) e.parentNode.removeChild(e); }, 110);
  }
  function show(f) {
    var warm = el != null; var box = warm ? el : h('div', { class: 'k-tip' });
    clear(box);
    var lines = String(f.text).split('\n'), head = lines.length > 1 ? lines.shift() : null;
    if (head) box.appendChild(h('div', { class: 'th', text: head }));
    box.appendChild(h('div', { class: 'tb', text: lines.join('\n') }));
    if (el == null) { box.setAttribute('style', 'left:0;top:0;visibility:hidden'); document.getElementById('overlays').appendChild(box); }
    var scale = typeof uiScaleFactor === 'function' ? uiScaleFactor() : 1, rr = f.el.getBoundingClientRect(), br = box.getBoundingClientRect();
    var r = { top: rr.top / scale, bottom: rr.bottom / scale }, b = { width: br.width / scale, height: br.height / scale }, vw = window.innerWidth / scale, vh = window.innerHeight / scale;
    var left = Math.max(4, Math.min(mx / scale - 14, vw - b.width - 4));
    var top = r.bottom + 7; if (top + b.height > vh - 4) top = Math.max(4, r.top - b.height - 7);
    box.setAttribute('style', 'left:' + Math.round(left) + 'px;top:' + Math.round(top) + 'px');
    if (!warm) { box.classList.remove('out'); box.classList.add('in'); }
    el = box; owner = f.el;
  }
  function onMove(e) {
    mx = e.clientX; my = e.clientY;
    if (typeof UI !== 'undefined' && UI.dragging) { if (el != null) hide(true); return; }
    var t = e.target;
    if (t === last) return;
    last = t;
    if (owner != null && t != null && owner.contains && owner.contains(t)) return;
    var f = find(t);
    clearTimeout(timer); timer = null;
    if (!f) { if (el != null) hide(); return; }
    var warm = el != null || (Date.now() - hiddenAt < 260);
    if (el != null && owner === f.el) return;
    if (warm) { show(f); } else timer = setTimeout(function () { show(f); }, 380);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mousedown', function () { last = null; hide(true); });
  document.addEventListener('wheel', function () { last = null; hide(true); });
  document.addEventListener('keydown', function () { last = null; hide(true); });
  return { hide: hide };
})();
