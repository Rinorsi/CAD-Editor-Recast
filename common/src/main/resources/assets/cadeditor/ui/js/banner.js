/* 旗帜图案：独立的“图案层”编辑——一层一行：图案 · 颜色 · 顺序 · 删除。数据格式 [{pattern, color}]，顺序即叠加顺序（越靠后越在上面）。 */
DETAIL_AUTO.banner_patterns = 1;   /* 卡片只是入口行，图案层在独立窗口里编辑 */
/* 预览：用游戏自己的物品渲染器画出带这些图案层的旗帜（盾牌就画盾牌），不是手绘的示意图。
   当前物品不是旗帜或盾牌时，用白色旗帜当载体。 */
function bannerPreview(layers) {
  var d = Store.doc(), id = d ? fullId(d.id) : '', shield = id === 'minecraft:shield', banner = /_banner$/.test(id);
  var carrier = shield || banner ? id : 'minecraft:white_banner', comps = {};
  comps['minecraft:banner_patterns'] = layers.filter(function (l) { return typeof l.pattern === 'string' && l.pattern; }).map(function (l) { return { pattern: Reg.full(l.pattern), color: shortId(String(l.color || 'white')) }; });
  if (shield && d.comps && typeof d.comps.base_color === 'string') comps['minecraft:base_color'] = shortId(d.comps.base_color);
  var el = h('item', { id: carrier, class: 'bn-prev-item', components: JSON.stringify(comps) });
  el.style.width = '96px'; el.style.height = '96px';
  return el;
}
AUTO_BODY.banner_patterns = function (card, cid, v) {
  var arr = clone(Array.isArray(v) ? v : []), list = h('div', { class: 'bn-list' }), prev = h('div', { class: 'bn-prev' });
  function put() { autoPut(cid, clone(arr)); }
  function move(i, j) { if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; put(); draw(); }
  function draw() {
    clear(prev); prev.appendChild(bannerPreview(arr));
    clear(list);
    arr.forEach(function (layer, i) {
      var pat = typeof layer.pattern === 'string' ? layer.pattern : '';
      var pick = pat || !layer.pattern
        ? kRegSelect({ reg: 'banner_pattern', value: pat, title: I18n.t("cadeditor.ui.banner.26e3a0d4b0"), empty: I18n.t("cadeditor.ui.banner.3c5045c728"), onChange: function (x) { layer.pattern = x; put(); draw(); } }).el
        : h('span', { class: 'bn-raw', text: I18n.t("cadeditor.ui.banner.cc9ec83d61") });
      var color = dyeButton(typeof layer.color === 'string' ? layer.color : 'white', function (x) { layer.color = x; put(); draw(); });
      var ops = h('div', { class: 'bn-ops' }, [
        kBtn('', function () { move(i, i - 1); }, { icon: 'up', title: I18n.t("cadeditor.ui.banner.b495f7f6b7") }),
        kBtn('', function () { move(i, i + 1); }, { icon: 'down', title: I18n.t("cadeditor.ui.banner.e2797ecebb") }),
        kBtn('', function () { arr.splice(i, 1); put(); draw(); }, { icon: 'trash', title: I18n.t("cadeditor.ui.banner.fa3013af50") })]);
      if (i === 0) ops.children[0].classList.add('dis'); if (i === arr.length - 1) ops.children[1].classList.add('dis');
      list.appendChild(h('div', { class: 'bn-row' }, [h('span', { class: 'bn-ix', text: String(i + 1), title: I18n.t("cadeditor.ui.banner.1c0950a414") }), h('div', { class: 'bn-pat' }, [pick]), color, ops]));
    });
    if (!arr.length) list.appendChild(h('div', { class: 'world-empty', text: I18n.t("cadeditor.ui.banner.9317705574") }));
  }
  var add = kBtn(I18n.t("cadeditor.ui.banner.dce9903ee5"), function () {
    openRegPick({ reg: 'banner_pattern', title: I18n.t("cadeditor.ui.banner.26e3a0d4b0"), onPick: function (id) { arr.push({ pattern: id, color: 'white' }); put(); draw(); } });
  }, { icon: 'plus' });
  card.body.appendChild(h('div', { class: 'bn-wrap' }, [h('div', { class: 'bn-side' }, [prev, add]), list])); draw();

};
