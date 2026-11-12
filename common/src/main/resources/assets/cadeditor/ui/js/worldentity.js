/* 世界实体的规范化区段（docs/world-entity-contract.md）：盔甲架姿势、展示框 / 画、展示实体（物品 / 方块 / 文字）、村民交易、乘客。
   world.views.<组> 是只读的当前值；页面只把改过的字段放进 apply.entity.<区段>。乘客操作是独立的 apply.riding，不能和别的修改混在一起。
   范围、枚举、默认值读 views.<组>.schema（真实 Codec / loader 探针）；游戏没有给出范围的字段不设限。 */
WE.ent = {}; WE.offers = null;
function weEntReset() { WE.ent = {}; WE.offers = null; }
function evGroup(g) { var v = WE.w && WE.w.views && WE.w.views[g]; return v && typeof v === 'object' ? v : null; }
function evVal(g) {
  var v = evGroup(g); if (!v) return {};
  if (v.value && typeof v.value === 'object') return v.value;
  var o = {}; Object.keys(v).forEach(function (k) { if (k !== 'schema' && k !== 'snbt') o[k] = v[k]; }); return o;
}
function evFields(g) {
  var v = evGroup(g), s = v && v.schema;
  if (!s && WE.w && WE.w.schema && WE.w.schema[g]) s = WE.w.schema[g];
  return s ? (s.fields || s) : {};
}
function evGet(g, k) { return weDraftGet(WE.ent, g, k, evVal(g)); }
function evSet(g, k, v, part) {
  if (g === 'player' && typeof wpCommandTrack === 'function') wpCommandTrack(k, v, part);
  weDraftSet(WE.ent, g, k, v, evVal(g));
  if (g === 'dropped_item' && k === 'Item') weHeroLive();
  if (g === 'pose') weHeroLive();   /* 左侧 3D 盔甲架跟着姿势和外观开关动 */
}
/* 预览盔甲架的姿势串：与 EditorStandPreview 的属性格式一致 */
function evStandAttr() {
  var F = evFields('pose'), out = [];
  EV_PARTS.forEach(function (pp) {
    var c = evGet('pose', pp[0]); if (!Array.isArray(c)) c = (F[pp[0]] && F[pp[0]].default) || null;
    if (Array.isArray(c) && c.length >= 3) out.push(pp[0] + '=' + [0, 1, 2].map(function (i) { var n = +c[i]; return isFinite(n) ? n : 0; }).join(','));
  });
  ['ShowArms', 'Small', 'NoBasePlate'].forEach(function (k) { var v = evGet('pose', k); if (typeof v === 'boolean') out.push(k + '=' + (v ? 1 : 0)); });
  return out.join(';');
}
function evDirty() { return !!WE.w && (Object.keys(WE.ent).length > 0 || (typeof wpCommandIntentDirty === 'function' && wpCommandIntentDirty()) || (typeof wpSlotsDirty === 'function' && wpSlotsDirty() > 0) || WE.offers !== null && JSON.stringify(WE.offers) !== JSON.stringify(evOffersOrig())); }
function evOffersOrig() { var t = evGroup('trades'); return t && t.offers ? t.offers : []; }
function evMsg(msg) {
  var out = {}, any = false;
  Object.keys(WE.ent).forEach(function (g) { out[g] = clone(WE.ent[g]); any = true; });
  if (WE.offers !== null && JSON.stringify(WE.offers) !== JSON.stringify(evOffersOrig())) { out.offers = clone(WE.offers); any = true; }
  if (typeof wpMsg === 'function') { wpMsg(out); if (out.player) any = true; }
  if (any) msg.entity = out;
}
function evNum(label, v, o, on) {
  o = o || {};
  return xNum({ title: label, sub: o.sub, value: v, min: o.min, max: o.max, softMin: o.softMin, softMax: o.softMax, step: o.step, dec: o.dec, unit: o.unit, noSlider: o.noSlider !== false && o.softMax === undefined, onChange: on });
}
function evBool(label, v, sub, on) { return xToggle({ title: label, sub: sub, value: v, onChange: on }); }
function evStack(cur, onSet, o) {
  o = o || {};
  var has = cur && cur.id && !cur.empty;
  var btn = kItemBtn(has ? cur : null, null, o.placeholder);
  function norm(st) { var s = clone(st); delete s.slot; delete s.label; return s; }
  activate(btn, function () { pickItem(btn, function (id) { onSet({ id: fullId(id), count: 1, comps: {}, removed: {} }); kPopClose(); }, { onStack: function (st) { onSet(norm(st)); kPopClose(); } }); });
  var kids = [btn];
  if (has) kids.push(kBtn(I18n.t("cadeditor.ui.cards3.7f559289d4"), function () { openNestedItem(cur, { title: I18n.t("cadeditor.ui.cards3.7f559289d4"), valid: nestedDraftGuard(), commit: function (st) { onSet(norm(st)); }, render: weRedrawBody }); }, { icon: 'edit' }));
  if (has && o.clear !== false) kids.push(kBtn(I18n.t("cadeditor.ui.common.clear"), function () { onSet(o.empty); }, { icon: 'trash' }));
  return h('div', { class: 'k-row' }, kids);
}

/* ---------- 盔甲架姿势 ---------- */
var EV_PARTS = [['Head', I18n.t("cadeditor.ui.labels.5f64ab0089")], ['Body', I18n.t("cadeditor.ui.labels.4729deedde")], ['LeftArm', I18n.t("cadeditor.ui.worldentity.191a64ea93")], ['RightArm', I18n.t("cadeditor.ui.worldentity.219f589113")], ['LeftLeg', I18n.t("cadeditor.ui.worldentity.0a37897b0c")], ['RightLeg', I18n.t("cadeditor.ui.worldentity.e2b6076662")]];
/* 编辑器自带的造型，依 EV_PARTS 排列；不是游戏注册表或原版默认值。 */
var EV_POSE_PRESETS = [
  { label: I18n.t("cadeditor.ui.worldentity.464fbc400e"), angles: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]] },
  { label: I18n.t("cadeditor.ui.worldentity.9be36caed7"), angles: [[0, -15, 0], [0, 0, 0], [0, 0, -5], [-150, 0, 25], [0, 0, 0], [0, 0, 0]] },
  { label: I18n.t("cadeditor.ui.worldentity.8a3639e900"), angles: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [-110, -15, 30], [0, 0, 0], [0, 0, 0]] },
  { label: I18n.t("cadeditor.ui.worldentity.97b01328de"), angles: [[-15, 0, 0], [0, 0, 0], [-165, 0, -15], [-165, 0, 15], [0, 0, -5], [0, 0, 5]] },
  { label: I18n.t("cadeditor.ui.worldentity.9f5a6eca33"), angles: [[0, 0, 0], [0, 0, 0], [-10, 0, -5], [-10, 0, 5], [-90, 0, 0], [-90, 0, 0]] },
  { label: I18n.t("cadeditor.ui.worldentity.65b5d7cf74"), angles: [[0, 0, 0], [0, 0, 0], [-35, 0, 0], [35, 0, 0], [35, 0, 0], [-35, 0, 0]] },
  { label: I18n.t("cadeditor.ui.worldentity.d26d64795f"), angles: [[10, 0, 0], [15, 0, 0], [-65, 0, -10], [65, 0, 10], [55, 0, 0], [-55, 0, 0]] },
  { label: I18n.t("cadeditor.ui.worldentity.9dd94a11d9"), angles: [[30, 0, 0], [45, 0, 0], [0, 0, -5], [0, 0, 5], [0, 0, 0], [0, 0, 0]] }
];
function evPosePreset(preset) {
  var F = evFields('pose'), orig = evVal('pose');
  EV_PARTS.forEach(function (pp, i) {
    var key = pp[0], angles = preset ? preset.angles[i] : F[key] && F[key].default;
    if (Array.isArray(angles)) weDraftSet(WE.ent, 'pose', key, angles.slice(), orig);
  });
  if (preset && ('ShowArms' in orig || F.ShowArms)) weDraftSet(WE.ent, 'pose', 'ShowArms', true, orig);
  weHeroLive();
  weRedrawBody();
}
function evPoseTab(body) {
  var F = evFields('pose');
  body.appendChild(xSec('user', I18n.t("cadeditor.ui.worldentity.a7fd67532d"), I18n.t("cadeditor.ui.worldentity.eaa37ecc6e")));
  var presets = EV_POSE_PRESETS.map(function (preset) {
    return kBtn(preset.label, function () { evPosePreset(preset); }, { title: I18n.t("cadeditor.ui.worldentity.19a9424a51", (preset.label)) });
  });
  presets.push(kBtn(I18n.t("cadeditor.ui.common.reset"), function () { evPosePreset(null); }, { icon: 'undo', title: I18n.t("cadeditor.ui.worldentity.aebb0340c2") }));
  body.appendChild(h('div', { class: 'k-row wrap' }, presets));
  body.appendChild(xSec('user', I18n.t("cadeditor.ui.worldedit.94049dba4d"), I18n.t("cadeditor.ui.worldentity.1de092dfa7")));
  EV_PARTS.forEach(function (pp) {
    var key = pp[0], cur = evGet('pose', key); if (!Array.isArray(cur)) cur = (F[key] && F[key].default) || [0, 0, 0];
    cur = cur.slice(0, 3);
    var def = (F[key] && F[key].default) || [0, 0, 0], k = 'we:pose:' + key, open = !!UIOpen[k];
    function setAxis(i, v) { var n = evGet('pose', key); n = Array.isArray(n) ? n.slice(0, 3) : def.slice(); n[i] = v; evSet('pose', key, n); }
    body.appendChild(xRow({ icon: false, title: pp[1], sub: 'X ' + fmtNum(cur[0]) + '°  Y ' + fmtNum(cur[1]) + '°  Z ' + fmtNum(cur[2]) + '°', chevron: true, open: open,
      onHead: function () { UIOpen[k] = !UIOpen[k]; weRender(); },
      body: function () {
        var rows = [I18n.t("cadeditor.ui.worldentity.6b6f1f6084"), I18n.t("cadeditor.ui.worldentity.12f6ccbd82"), I18n.t("cadeditor.ui.worldentity.96b4c06a43")].map(function (nm, i) {
          var n = kNumber(cur[i], { softMin: -180, softMax: 180, step: 1, dec: 1, unit: '°', onChange: function (v) { setAxis(i, v); } });
          return xField(null, nm, n.el);
        });
        rows.push(h('div', { class: 'x2f' }, [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.reset"), function () { evSet('pose', key, def.slice()); weRender(); }, { icon: 'undo' })]));
        return rows;
      } }));
  });
  body.appendChild(xSec('sliders', I18n.t("cadeditor.ui.worldedit.6320b4a872")));
  [['ShowArms', I18n.t("cadeditor.ui.labels.45974c68a9"), I18n.t("cadeditor.ui.labels.abf5dec49c")], ['Small', I18n.t("cadeditor.ui.worldentity.511f41e70f"), I18n.t("cadeditor.ui.worldentity.d56a5a4e7d")], ['NoBasePlate', I18n.t("cadeditor.ui.worldentity.095258cca0"), ''], ['Invisible', I18n.t("cadeditor.ui.worldentity.61411f0650"), ''], ['Marker', I18n.t("cadeditor.ui.worldentity.90abf8fefc"), I18n.t("cadeditor.ui.worldentity.9ad9a91cad")]].forEach(function (f) {
    if (!(f[0] in evVal('pose')) && !(F[f[0]])) return;
    body.appendChild(evBool(f[1], evGet('pose', f[0]), f[2], function (on) { evSet('pose', f[0], on); }));
  });
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.acc013f371")));
}

/* ---------- 展示框 / 荧光展示框 ---------- */
function evFrameTab(body) {
  var F = evFields('item_frame'), v = evVal('item_frame');
  body.appendChild(xSec('image', I18n.t("cadeditor.ui.worldedit.69dee9b158")));
  var cur = evGet('item_frame', 'item');
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.c423ab40ce"), right: evStack(cur, function (st) { evSet('item_frame', 'item', st); weRender(); }, { empty: { empty: true } }) }));
  var rotMax = F.ItemRotation && F.ItemRotation.max !== undefined ? F.ItemRotation.max : 7;
  body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.fc0885e901"), evGet('item_frame', 'ItemRotation'), { min: 0, max: rotMax, sub: I18n.t("cadeditor.ui.worldentity.e105c7d221", (rotMax + 1)) }, function (x) { evSet('item_frame', 'ItemRotation', x); }));
  body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.698f672825"), evGet('item_frame', 'Invisible'), I18n.t("cadeditor.ui.worldentity.8fa4baf8b6"), function (on) { evSet('item_frame', 'Invisible', on); }));
  body.appendChild(evBool(I18n.t("cadeditor.ui.forms.d4b3f49cd2"), evGet('item_frame', 'Fixed'), I18n.t("cadeditor.ui.worldentity.d468bbd952"), function (on) { evSet('item_frame', 'Fixed', on); }));
  body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.fe3b890515"), evGet('item_frame', 'ItemDropChance'), { step: 0.1, dec: 3, sub: I18n.t("cadeditor.ui.worldentity.b5e0ac8d73") }, function (x) { evSet('item_frame', 'ItemDropChance', x); }));
}
function evPaintingTab(body) {
  body.appendChild(xSec('image', I18n.t("cadeditor.ui.worldedit.de9f18b00a")));
  var sel = kRegSelect({ reg: 'painting_variant', value: evGet('painting', 'variant') || '', title: I18n.t("cadeditor.ui.worldentity.9df2d33919"), onChange: function (id) { evSet('painting', 'variant', id); } });
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.d051df30a6"), sub: I18n.t("cadeditor.ui.worldentity.c53909da69"), right: sel.el }));
}

/* ---------- 展示实体 ---------- */
function evVec(label, g, path, idx3, defv) {
  var cur = evGet(g, 'transformation'); cur = cur && typeof cur === 'object' ? cur : {};
  var arr = Array.isArray(cur[path]) ? cur[path].slice() : defv.slice();
  var cells = [];
  arr.forEach(function (x, i) {
    var inp = kInput(fmtNum(x), function () {}, {}); inp.classList.add('we-vnum');
    inp.addEventListener('change', function () {
      var v = Number(inp.value.replace(/,/g, '.')); if (isNaN(v)) { inp.value = fmtNum(x); return; }
      var t = clone(evGet(g, 'transformation') || {}); var a = Array.isArray(t[path]) ? t[path].slice() : defv.slice(); a[i] = v; t[path] = a;
      ['translation', 'scale', 'left_rotation', 'right_rotation'].forEach(function (k) { if (!Array.isArray(t[k])) t[k] = (k === 'scale' ? [1, 1, 1] : k === 'translation' ? [0, 0, 0] : [0, 0, 0, 1]); });
      evSet(g, 'transformation', t);
    });
    cells.push(h('div', { class: 'we-cell' }, [h('span', { class: 'k-sub', text: idx3 ? ['X', 'Y', 'Z'][i] : ['X', 'Y', 'Z', 'W'][i] }), inp]));
  });
  return xField(null, label, h('div', { class: 'we-vec' }, cells));
}
function evDisplayTab(body) {
  var g = 'display', F = evFields(g), v = evVal(g), isText = 'text' in v || 'alignment' in v, isItem = 'item_display' in v || (v.item && !('block_state' in v)), isBlock = 'block_state' in v;
  body.appendChild(xSec('cube', I18n.t("cadeditor.ui.worldentity.0aefd7730f")));
  var kt = 'we:disp:xf';
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.ca4842bc9e"), sub: I18n.t("cadeditor.ui.worldentity.e6ee9371cd"), chevron: true, open: UIOpen[kt] !== false, onHead: function () { UIOpen[kt] = UIOpen[kt] === false; weRender(); },
    body: function () { return [evVec(I18n.t("cadeditor.ui.worldentity.f905e85ff3"), g, 'translation', true, [0, 0, 0]), evVec(I18n.t("cadeditor.ui.worldentity.b762aec769"), g, 'scale', true, [1, 1, 1]), evVec(I18n.t("cadeditor.ui.worldentity.6aa2ab94ce"), g, 'left_rotation', false, [0, 0, 0, 1]), evVec(I18n.t("cadeditor.ui.worldentity.5562235485"), g, 'right_rotation', false, [0, 0, 0, 1])]; } }));
  var bills = (F.billboard && F.billboard.options) || ['fixed', 'vertical', 'horizontal', 'center'];
  var BN = { fixed: I18n.t("cadeditor.ui.forms.d4b3f49cd2"), vertical: I18n.t("cadeditor.ui.worldentity.33933a7c57"), horizontal: I18n.t("cadeditor.ui.worldentity.ab68213179"), center: I18n.t("cadeditor.ui.worldentity.619da1fb2b") };
  body.appendChild(xSeg({ title: I18n.t("cadeditor.ui.labels.5f0c712324"), sub: I18n.t("cadeditor.ui.worldentity.9b8f80a834"), options: bills.map(function (b) { return { v: b, label: BN[b] || b }; }), value: evGet(g, 'billboard') || 'fixed', onChange: function (x) { evSet(g, 'billboard', x); } }));
  var br = evGet(g, 'brightness'), brOn = br && typeof br === 'object';
  body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.510941cf31"), brOn, I18n.t("cadeditor.ui.worldentity.563d65ead5"), function (on) { evSet(g, 'brightness', on ? { block: 15, sky: 15 } : null); weRender(); }));
  if (brOn) {
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.83630ee4c3"), br.block, { min: 0, max: 15, softMin: 0, softMax: 15, noSlider: false }, function (x) { evSet(g, 'brightness', { block: x, sky: (evGet(g, 'brightness') || br).sky }); }));
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.87c1f65df5"), br.sky, { min: 0, max: 15, softMin: 0, softMax: 15, noSlider: false }, function (x) { evSet(g, 'brightness', { block: (evGet(g, 'brightness') || br).block, sky: x }); }));
  }
  body.appendChild(xSec('eye', I18n.t("cadeditor.ui.screens.4e1449e7d5")));
  [['view_range', I18n.t("cadeditor.ui.worldentity.2cdcc90c07"), I18n.t("cadeditor.ui.worldentity.7e587c29c6")], ['width', I18n.t("cadeditor.ui.worldentity.3b730da0ad"), I18n.t("cadeditor.ui.worldentity.2e659a9c9e")], ['height', I18n.t("cadeditor.ui.worldentity.968dd036cb"), I18n.t("cadeditor.ui.worldentity.2e659a9c9e")], ['shadow_radius', I18n.t("cadeditor.ui.worldentity.77f59c497b"), ''], ['shadow_strength', I18n.t("cadeditor.ui.worldentity.1043bf62c7"), '']].forEach(function (f) {
    if (!(f[0] in v)) return;
    body.appendChild(evNum(f[1], evGet(g, f[0]), { step: 0.1, dec: 3, sub: f[2] }, function (x) { evSet(g, f[0], x); }));
  });
  if ('glow_color_override' in v) body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.16cea41bac"), evGet(g, 'glow_color_override'), { sub: I18n.t("cadeditor.ui.worldentity.e0863e674a") }, function (x) { evSet(g, 'glow_color_override', x); }));
  body.appendChild(xSec('clock', I18n.t("cadeditor.ui.worldentity.b15435ced2")));
  body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.8ae7e69c14"), evGet(g, 'interpolation_duration'), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), sub: I18n.t("cadeditor.ui.worldentity.0a6626fa87") }, function (x) { evSet(g, 'interpolation_duration', x); }));
  body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.e511deb7c3"), evGet(g, 'teleport_duration'), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), sub: I18n.t("cadeditor.ui.worldentity.97e48993ce") }, function (x) { evSet(g, 'teleport_duration', x); }));
  if (isItem) {
    body.appendChild(xSec('sword', I18n.t("cadeditor.ui.worldentity.9141b0a653")));
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.pages.7c89d6ebe1"), right: evStack(evGet(g, 'item'), function (st) { evSet(g, 'item', st); weRender(); }, { empty: null }) }));
    var ctx = (F.item_display && F.item_display.options) || ['none', 'thirdperson_lefthand', 'thirdperson_righthand', 'firstperson_lefthand', 'firstperson_righthand', 'head', 'gui', 'ground', 'fixed', 'on_shelf'];
    body.appendChild(xSelect({ title: I18n.t("cadeditor.ui.worldentity.a9fd468be9"), sub: I18n.t("cadeditor.ui.worldentity.417b1d471c"), options: ctx.map(function (c) { return { v: c, label: c }; }), value: evGet(g, 'item_display') || 'none', width: 200, onChange: function (x) { evSet(g, 'item_display', x); } }));
  }
  if (isBlock) {
    body.appendChild(xSec('cube_grass', I18n.t("cadeditor.ui.worldentity.c5ef457848")));
    var bs = evGet(g, 'block_state') || { Name: 'minecraft:air' };
    var sel = kRegSelect({ reg: 'block', value: bs.Name, title: I18n.t("cadeditor.ui.picker.289673e823"), onChange: function (id) { evSet(g, 'block_state', { Name: id }); } });
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.picker.2753766d18"), sub: bs.Properties ? I18n.t("cadeditor.ui.worldentity.9aea4206f2") : '', right: sel.el }));
  }
  if (isText) {
    body.appendChild(xSec('chat', I18n.t("cadeditor.ui.cards4.14b69bd6ee")));
    var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: I18n.t("cadeditor.ui.worldentity.6be061a45c") }); ta.value = msgText(evGet(g, 'text'));
    ta.addEventListener('change', function () { evSet(g, 'text', textMsg(ta.value)); });
    body.appendChild(ta);
    var al = (F.alignment && F.alignment.options) || ['center', 'left', 'right'], AN = { center: I18n.t("cadeditor.ui.worldentity.4cc3885c18"), left: I18n.t("cadeditor.ui.worldentity.6548f6b58c"), right: I18n.t("cadeditor.ui.worldentity.be92a99ec4") };
    body.appendChild(xSeg({ title: I18n.t("cadeditor.ui.worldentity.fd5fb78ba2"), options: al.map(function (a) { return { v: a, label: AN[a] || a }; }), value: evGet(g, 'alignment') || 'center', onChange: function (x) { evSet(g, 'alignment', x); } }));
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.098482a8f5"), evGet(g, 'line_width'), { unit: I18n.t("cadeditor.ui.worldentity.b512acc781"), sub: I18n.t("cadeditor.ui.worldentity.59bddd83dd") }, function (x) { evSet(g, 'line_width', x); }));
    var op = evGet(g, 'text_opacity'), op255 = typeof op === 'number' ? (op < 0 ? op + 256 : op) : 255;
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.116d7c255c"), op255, { min: 0, max: 255, softMin: 0, softMax: 255, noSlider: false, sub: I18n.t("cadeditor.ui.worldentity.3df5a74a84") }, function (x) { evSet(g, 'text_opacity', x > 127 ? x - 256 : x); }));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.490573c228"), evGet(g, 'shadow'), '', function (on) { evSet(g, 'shadow', on); }));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.ad2a19566c"), evGet(g, 'see_through'), '', function (on) { evSet(g, 'see_through', on); }));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.23f25f6fdb"), evGet(g, 'default_background'), I18n.t("cadeditor.ui.worldentity.88b41781df"), function (on) { evSet(g, 'default_background', on); }));
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.882fe2e842"), evGet(g, 'background'), { sub: I18n.t("cadeditor.ui.worldentity.881f880c05") }, function (x) { evSet(g, 'background', x); }));
  }
}

/* ---------- 杂项实体视图：掉落物 / 下落方块 / TNT / 苦力怕 / 末影人 / 药水云 / 经验球 / 箭 / 交互实体
   后端视图和字段范围见 docs/world-entity-contract.md（P2-2 ~ P2-5）。范围读 schema.fields，游戏没给的不设限。 ---------- */
var EV_SIMPLE = [['dropped_item', I18n.t("cadeditor.ui.worldentity.c45ad896f7"), 'sword'], ['falling_block', I18n.t("cadeditor.ui.worldentity.f66600ef7e"), 'cube'], ['tnt', 'TNT', 'flame'], ['creeper', I18n.t("cadeditor.ui.worldentity.98ade0e3ff"), 'flame'],
  ['enderman', I18n.t("cadeditor.ui.worldentity.bc62439003"), 'cube'], ['area_effect_cloud', I18n.t("cadeditor.ui.worldentity.a250351ac7"), 'flask'], ['experience_orb', I18n.t("cadeditor.ui.worldentity.a545a56f46"), 'sparkle'], ['arrow', I18n.t("cadeditor.ui.worldentity.674650b36c"), 'sword'], ['interaction', I18n.t("cadeditor.ui.worldentity.942d3ea994"), 'sliders'],
  ['horse', I18n.t("cadeditor.ui.worldentity.82cb6b0074"), 'paw'], ['chested', I18n.t("cadeditor.ui.worldentity.20fddf1a33"), 'chest'], ['vehicle_container', I18n.t("cadeditor.ui.worldentity.e17cc1185f"), 'chest'], ['minecart_display', I18n.t("cadeditor.ui.worldentity.fbcf224c9d"), 'cube'],
  ['minecart_command', I18n.t("cadeditor.ui.worldentity.94bd1ea025"), 'terminal'], ['boat_type', I18n.t("cadeditor.ui.worldentity.15b7f7a95c"), 'cart'], ['zombie_conversion', I18n.t("cadeditor.ui.worldentity.b649082cd2"), 'clock']];
function evSimpleGroups() { return EV_SIMPLE.filter(function (g) { return evGroup(g[0]); }); }
function evSimpleTabInfo() { var g = evSimpleGroups(); return g.length === 1 ? { label: g[0][1], icon: g[0][2] } : { label: I18n.t("cadeditor.ui.worldentity.45ca6da80f"), icon: 'sliders' }; }
/* 范围来自后端的字段元数据的数值行：o = { sub, unit, step, dec, def, nullAt（等于这个值时发 null）} */
function evNumF(g, k, label, o) {
  o = o || {}; var f = evFields(g)[k] || {}, cur = evGet(g, k);
  return evNum(label, typeof cur === 'number' ? cur : o.def, { min: f.min, max: f.max, step: o.step, dec: o.dec, unit: o.unit, sub: o.sub },
    function (x) { evSet(g, k, o.nullAt !== undefined && x === o.nullAt ? null : x); });
}
/* 一片格子，绑定到视图里的 [{slot, stack}] 列表（驮兽箱子的 Items、载具容器的 slots）：省略的格子 = 清空；草稿只在和原值不同时提交 */
function evSlotList(g, key, count) {
  function list() { var v = evGet(g, key); return Array.isArray(v) ? v : []; }
  function stackAt(i) { var e = list().filter(function (x) { return x.slot === i; })[0]; return e && e.stack && !e.stack.empty ? e.stack : { empty: true }; }
  var ix = []; for (var i = 0; i < count; i++) ix.push(i);
  function setSlot(i, st) {
    var l = list().filter(function (x) { return x.slot !== i; });
    if (st && !st.empty && st.id) { var s = clone(st); delete s.slot; delete s.label; l.push({ slot: i, stack: s }); }
    l.sort(function (a, b) { return a.slot - b.slot; }); evSet(g, key, l); weMarkDirty();
  }
  var grid = kSlotGrid({ tight: true, indices: ix, cols: count <= 9 ? count : 9, stackOf: stackAt, titleOf: function (i) { return I18n.t("cadeditor.ui.slots.1748b1d05d", (i + 1)); }, set: setSlot });
  grid.setSlot = setSlot;
  return grid;
}
var EV_PICKUP = { DISALLOWED: I18n.t("cadeditor.ui.worldentity.5bb38cc13b"), ALLOWED: I18n.t("cadeditor.ui.worldentity.c650080c09"), CREATIVE_ONLY: I18n.t("cadeditor.ui.worldentity.bc5e81caeb") };
function evSimpleTab(body) {
  var gs = evSimpleGroups();
  if (!gs.length) { body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldentity.4dad02b510"))); return; }
  gs.forEach(function (info) { var fn = EV_SIMPLE_TAB[info[0]]; if (fn) { body.appendChild(xSec(info[2], info[1])); fn(body); } });
}
var EV_SIMPLE_TAB = {
  /* 马 / 驴 / 骡 / 羊驼等：驯服状态、驯服进度、主人。鞍和身体装备在「属性」页的装备格里（同一次应用里先驯服再上鞍也可以） */
  horse: function (body) {
    var g = 'horse', own = evGroup(g) || {}, cur = evGet(g, 'Owner') || '', players = own.players || [];
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.bbcaf5e4d0"), evGet(g, 'Tame'), '', function (on) { evSet(g, 'Tame', on); }));
    body.appendChild(evNumF(g, 'Temper', I18n.t("cadeditor.ui.worldentity.76004ea0d3"), { sub: I18n.t("cadeditor.ui.worldentity.40c382ced1") }));
    var entries = players.map(function (p) { return { v: p.uuid, label: p.name, sub: p.uuid }; });
    if (cur && !entries.some(function (e) { return e.v === cur; })) entries.push({ v: cur, label: I18n.t("cadeditor.ui.worldentity.38405b5fdc"), sub: cur });
    var sel = kSelect(entries, cur || null, function (v) { evSet(g, 'Owner', v); weRender(); }, { width: 240, empty: I18n.t("cadeditor.ui.pages.c7bcc6d27f"), placeholder: I18n.t("cadeditor.ui.worldentity.e9a396c7c4") });
    var right = [sel.el]; if (cur) right.push(kBtn(I18n.t("cadeditor.ui.picker.bce2377283"), function () { evSet(g, 'Owner', null); weRender(); }, { icon: 'trash' }));
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.c11c5f262d"), sub: I18n.t("cadeditor.ui.worldentity.a258804253"), right: h('div', { class: 'k-row' }, right) }));
    body.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.b9a3d659d1")));
  },
  chested: function (body) {
    var g = 'chested', own = evGroup(g) || {}, cap = typeof own.capacity === 'number' ? own.capacity : 0, on = evGet(g, 'ChestedHorse');
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.ee8df25961"), on, I18n.t("cadeditor.ui.worldentity.90e7212e1b"), function (v) { evSet(g, 'ChestedHorse', v); if (!v) evSet(g, 'Items', []); weRender(); }));
    if (on && cap > 0) { body.appendChild(evSlotList(g, 'Items', cap)); }
    else if (on) body.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.dbbaa2e528")));
  },
  vehicle_container: function (body) {
    var g = 'vehicle_container', own = evGroup(g) || {};
    if (own.unresolved_loot) { body.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.f35a1836fb"))); return; }
    body.appendChild(evSlotList(g, 'slots', own.size || 0));
  },
  minecart_display: function (body) {
    var g = 'minecart_display', off = evGet(g, 'DisplayOffset');
    body.appendChild(kBlockState(evGet(g, 'DisplayState'), function (v) { evSet(g, 'DisplayState', v); weRender(); }, { label: I18n.t("cadeditor.ui.worldentity.fd19bb0349"), sub: I18n.t("cadeditor.ui.worldentity.d2d0bd1dcf"), allowNone: true, empty: I18n.t("cadeditor.ui.worldentity.f382bbd44c") }));
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.5b4e21cb63"), typeof off === 'number' ? off : 6, { sub: I18n.t("cadeditor.ui.worldentity.ec52a82f67") }, function (x) { evSet(g, 'DisplayOffset', x); }));
    if (typeof off === 'number') body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.855cdff1a5"), right: kBtn(I18n.t("cadeditor.ui.drafts.e0534b8a4e"), function () { evSet(g, 'DisplayOffset', null); weRender(); }, { icon: 'undo' }) }));
  },
  minecart_command: function (body) {
    var g = 'minecart_command', own = evGroup(g) || {};
    var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: I18n.t("cadeditor.ui.worldentity.c9e2a31717") }); ta.value = String(evGet(g, 'Command') || '');
    ta.addEventListener('change', function () { evSet(g, 'Command', ta.value); });
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.screens.928f87d450") })); body.appendChild(ta);
    var lo = own.LastOutput; body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.6312d40100"), sub: I18n.t("cadeditor.ui.worldentity.3b5ec3533b"), right: h('span', { class: 'k-sub', text: lo ? msgText(lo) : I18n.t("cadeditor.ui.worldentity.23ce821ecd") }) }));
  },
  boat_type: function (body) {
    var own = evGroup('boat_type') || {};
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.a28cf187c6"), sub: I18n.t("cadeditor.ui.worldentity.42e17c3026"), right: h('span', { class: 'k-sub', text: own.entityType ? entityName(own.entityType) : '' }) }));
  },
  zombie_conversion: function (body) {
    var own = evGroup('zombie_conversion') || {}, t = own.ConversionTime;
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.a157892a0c"), sub: I18n.t("cadeditor.ui.worldentity.3b5ec3533b"), right: h('span', { class: 'k-sub', text: typeof t === 'number' && t >= 0 ? I18n.t("cadeditor.ui.worldentity.6082b43313", (t)) : I18n.t("cadeditor.ui.worldentity.f58a450afb") }) }));
  },
  dropped_item: function (body) {
    var g = 'dropped_item', st = evGet(g, 'Item') || { id: 'minecraft:stone', count: 1, comps: {}, removed: {} };
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.pages.7c89d6ebe1"), right: evStack(st, function (s) { evSet(g, 'Item', s); weRender(); }, { clear: false }) }));
    body.appendChild(evNum(I18n.t("cadeditor.ui.pages.5e29d121dd"), st.count, { min: 1, max: 99 }, function (x) { var n = clone(evGet(g, 'Item') || st); n.count = x; evSet(g, 'Item', n); }));
    body.appendChild(evNumF(g, 'PickupDelay', I18n.t("cadeditor.ui.worldentity.b1d4b6b19b"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), sub: I18n.t("cadeditor.ui.worldentity.bd61bcf0fe") }));
    body.appendChild(evNumF(g, 'Age', I18n.t("cadeditor.ui.worldentity.e8b1268c1e"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), sub: I18n.t("cadeditor.ui.worldentity.bff67a450b") }));
  },
  falling_block: function (body) {
    var g = 'falling_block';
    body.appendChild(kBlockState(evGet(g, 'BlockState'), function (v) { evSet(g, 'BlockState', v || { Name: 'minecraft:sand' }); }, { label: I18n.t("cadeditor.ui.picker.2753766d18"), title: I18n.t("cadeditor.ui.picker.289673e823") }));
    body.appendChild(evNumF(g, 'Time', I18n.t("cadeditor.ui.worldentity.19622fd92f"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
    body.appendChild(evNumF(g, 'FallHurtAmount', I18n.t("cadeditor.ui.worldentity.285632652e"), { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'FallHurtMax', I18n.t("cadeditor.ui.worldentity.3a6d31d01d")));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.fa2be25830"), evGet(g, 'DropItem'), '', function (on) { evSet(g, 'DropItem', on); }));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.b71aaf8c2d"), evGet(g, 'HurtEntities'), '', function (on) { evSet(g, 'HurtEntities', on); }));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.0bf3c87cac"), evGet(g, 'CancelDrop'), '', function (on) { evSet(g, 'CancelDrop', on); }));
  },
  tnt: function (body) { body.appendChild(evNumF('tnt', 'fuse', I18n.t("cadeditor.ui.worldentity.ad3579be98"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), sub: I18n.t("cadeditor.ui.worldentity.4e15e07ba1") })); },
  creeper: function (body) {
    body.appendChild(evNumF('creeper', 'Fuse', I18n.t("cadeditor.ui.worldentity.36ae2e27f0"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), sub: I18n.t("cadeditor.ui.worldentity.455cd64c6f") }));
    body.appendChild(evNumF('creeper', 'ExplosionRadius', I18n.t("cadeditor.ui.worldentity.5116a4d35c")));
  },
  enderman: function (body) {
    var g = 'enderman';
    body.appendChild(kBlockState(evGet(g, 'carriedBlockState'), function (v) { evSet(g, 'carriedBlockState', v); }, { label: I18n.t("cadeditor.ui.worldentity.56560d36fd"), sub: I18n.t("cadeditor.ui.worldentity.58a83fcaf8"), allowNone: true, empty: I18n.t("cadeditor.ui.worldentity.b7836b9a80") }));
  },
  area_effect_cloud: function (body) {
    var g = 'area_effect_cloud', pc = evGet(g, 'potion_contents');
    var pot = typeof pc === 'string' ? pc : (pc && pc.potion) || '';
    var sel = kRegSelect({ reg: 'potion', value: pot, title: I18n.t("cadeditor.ui.worldentity.26b9af843f"), empty: I18n.t("cadeditor.ui.pages.c7bcc6d27f"), allowClear: true,
      onChange: function (id) { var o = pc && typeof pc === 'object' ? clone(pc) : {}; if (id) o.potion = id; else delete o.potion; evSet(g, 'potion_contents', Object.keys(o).length ? o : null); } });
    var extra = pc && typeof pc === 'object' && Array.isArray(pc.custom_effects) && pc.custom_effects.length ? I18n.t("cadeditor.ui.worldentity.b00c73b708", (pc.custom_effects.length)) : '';
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.cards3.fb729c163d"), right: sel.el }));
    if (extra) body.appendChild(kHint(extra));
    body.appendChild(evNumF(g, 'Radius', I18n.t("cadeditor.ui.worldentity.3e65075eb3"), { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'RadiusOnUse', I18n.t("cadeditor.ui.worldentity.468d4e9685"), { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'RadiusPerTick', I18n.t("cadeditor.ui.worldentity.e37e75671f"), { step: 0.01, dec: 4 }));
    body.appendChild(evNumF(g, 'Duration', I18n.t("cadeditor.ui.worldentity.9b1830480c"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
    body.appendChild(evNumF(g, 'Age', I18n.t("cadeditor.ui.worldentity.e8b1268c1e"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
    body.appendChild(evNumF(g, 'WaitTime', I18n.t("cadeditor.ui.worldentity.86e5b41d64"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
    body.appendChild(evNumF(g, 'ReapplicationDelay', I18n.t("cadeditor.ui.worldentity.6cd49a0b83"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
    body.appendChild(evNumF(g, 'DurationOnUse', I18n.t("cadeditor.ui.worldentity.878070a524"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
    var ds = evGet(g, 'potion_duration_scale');
    body.appendChild(evNum(I18n.t("cadeditor.ui.worldentity.0824e7a2b0"), typeof ds === 'number' ? ds : 1, { step: 0.1, dec: 3, sub: I18n.t("cadeditor.ui.worldentity.053e1f2d75") }, function (x) { evSet(g, 'potion_duration_scale', x === 1 ? null : x); }));
  },
  experience_orb: function (body) { body.appendChild(evNumF('experience_orb', 'Value', I18n.t("cadeditor.ui.worldentity.3d2343c45d"))); },
  arrow: function (body) {
    var g = 'arrow', opts = (evFields(g).pickup || {}).options || [];
    body.appendChild(evNumF(g, 'damage', I18n.t("cadeditor.ui.worldentity.30e1196888"), { step: 0.5, dec: 3 }));
    if (opts.length) body.appendChild(xSeg({ title: I18n.t("cadeditor.ui.worldentity.6a32771239"), options: opts.map(function (o) { return { v: o.value, label: EV_PICKUP[o.label] || o.label }; }), value: evGet(g, 'pickup'), onChange: function (x) { evSet(g, 'pickup', x); } }));
  },
  interaction: function (body) {
    var g = 'interaction';
    body.appendChild(evNumF(g, 'width', I18n.t("cadeditor.ui.worldentity.3b730da0ad"), { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'height', I18n.t("cadeditor.ui.worldentity.968dd036cb"), { step: 0.1, dec: 3 }));
    body.appendChild(evBool(I18n.t("cadeditor.ui.worldentity.0e0c2cc2fd"), evGet(g, 'response'), I18n.t("cadeditor.ui.worldentity.3b713ba214"), function (on) { evSet(g, 'response', on); }));
  }
};

/* ---------- 关系：主人（可改）、队伍和拴绳（只读） ---------- */
function evHasRelations() {
  var team = evGroup('team'), leash = evGroup('leash');
  return !!evGroup('owner') || !!(leash && leash.data) || !!(team && team.name);
}
function evRelationTab(body) {
  var own = evGroup('owner');
  if (own) {
    var cur = evGet('owner', 'Owner') || '', players = own.players || [];
    body.appendChild(xSec('user', I18n.t("cadeditor.ui.worldentity.c11c5f262d")));
    if (own.available === false) body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.c11c5f262d"), sub: I18n.t("cadeditor.ui.worldentity.852261cb41"), right: h('span', { class: 'k-sub', text: cur || I18n.t("cadeditor.ui.pages.c7bcc6d27f") }) }));
    var entries = players.map(function (p) { return { v: p.uuid, label: p.name, sub: p.uuid }; });
    if (cur && !entries.some(function (e) { return e.v === cur; })) entries.push({ v: cur, label: I18n.t("cadeditor.ui.worldentity.38405b5fdc"), sub: cur });
    var sel = kSelect(entries, cur || null, function (v) { evSet('owner', 'Owner', v); weRender(); }, { width: 240, empty: I18n.t("cadeditor.ui.pages.c7bcc6d27f"), placeholder: I18n.t("cadeditor.ui.worldentity.e9a396c7c4") });
    var right = [sel.el]; if (cur) right.push(kBtn(I18n.t("cadeditor.ui.picker.bce2377283"), function () { evSet('owner', 'Owner', null); weRender(); }, { icon: 'trash' }));
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.vaultworld.991e63fe29"), sub: I18n.t("cadeditor.ui.worldentity.a2c1a4a59d"), right: h('div', { class: 'k-row' }, right) }));
  }
  var team = evGroup('team'), leash = evGroup('leash');
  body.appendChild(xSec('users', I18n.t("cadeditor.ui.worldentity.3b5ec3533b")));
  if (team) body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.1053fbb75f"), sub: team.available === false ? I18n.t("cadeditor.ui.worldentity.9b0289e7b8") : '', right: h('span', { class: 'k-sub', text: team.name || I18n.t("cadeditor.ui.worldentity.ecac3c5628") }) }));
  if (leash) body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.3814469d5b"), sub: leash.data ? I18n.t("cadeditor.ui.worldentity.a513d81e18") : '', right: h('span', { class: 'k-sub', text: leash.data ? I18n.t("cadeditor.ui.worldentity.c1654ed36f") : I18n.t("cadeditor.ui.worldentity.903731802e") }) }));
}

/* ---------- 村民 / 流浪商人交易（只有服务端能改） ---------- */
function evOffers() { if (WE.offers === null) WE.offers = clone(evOffersOrig()); return WE.offers; }
function evTradePreview(offer) {
  function stack(st) {
    if (!st || !st.id) return h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldentity.1182c5454f") });
    var icon = stackUiIcon(st, 20);
    if (icon.tagName && icon.tagName.toLowerCase() === 'item') icon.setAttribute('count', '1');
    return h('div', { class: 'trade-summary-stack' }, [icon, stackUiName(st), h('span', { class: 'trade-count', text: '× ' + (st.count || 1) })]);
  }
  return h('div', { class: 'trade-summary' }, [
    h('div', { class: 'trade-summary-side' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldentity.af57c547f9") }), stack(offer.buy), offer.buyB ? h('span', { class: 'k-sub', text: '+' }) : null, offer.buyB ? stack(offer.buyB) : null]),
    h('span', { class: 'trade-arrow', text: '→' }),
    h('div', { class: 'trade-summary-side' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldentity.a871df32a6") }), stack(offer.sell)])]);
}
function openTradeDraft(offer, index) {
  var owner = WE.w, offers = WE.offers, priceOpen = false;
  var host = h('div', { class: 'trade-edit-body' });
  function valid() { return WE.w === owner && WE.offers === offers && offers.indexOf(offer) >= 0; }
  function mark() { if (!valid()) { toast(I18n.t("cadeditor.ui.worldentity.ff71a6f6c3"), 'warn'); return false; } weMarkDirty(); return true; }
  function stackEditor(key, optional) {
    var cur = offer[key], has = cur && cur.id;
    function put(st) {
      if (!valid()) { toast(I18n.t("cadeditor.ui.worldentity.ff71a6f6c3"), 'warn'); return; }
      if (!st) delete offer[key];
      else { var next = clone(st); delete next.slot; delete next.label; if (cur && next.id !== cur.id) delete next.cost_predicate_snbt; offer[key] = next; }
      mark();
    }
    var label = key === 'sell' ? I18n.t("cadeditor.ui.worldentity.a871df32a6") : optional ? I18n.t("cadeditor.ui.worldentity.661dfbacfe") : I18n.t("cadeditor.ui.worldentity.af57c547f9");
    if (!has && optional) { var addCost = kBtn(I18n.t("cadeditor.ui.worldentity.12ae2f2651"), function () { choose(addCost); }, { icon: 'plus', cls: 'trade-add-cost' }); return addCost; }
    var pick = kItemBtn(has ? cur : null, null);
    function choose(anchor) { pickItem(anchor, function (id) { put({ id: fullId(id), count: (cur && cur.count) || 1, comps: {}, removed: {} }); paint(); }, { onStack: function (st) { put(st); paint(); } }); }
    activate(pick, function () { choose(pick); });
    var controls = [];
    if (has) {
      var qty = kNumber(cur.count || 1, { min: 1, noSlider: true, step: 1, onChange: function (v) { if (valid()) { cur.count = v; var icon = pick.querySelector('item'); if (icon) icon.setAttribute('count', String(v)); mark(); } } });
      var field = qty.el.querySelector('input'); if (field) field.setAttribute('aria-label', I18n.t("cadeditor.ui.worldentity.e490535d77", (label)));
      controls.push(h('span', { class: 'k-sub', text: key === 'sell' ? I18n.t("cadeditor.ui.pages.5e29d121dd") : I18n.t("cadeditor.ui.worldentity.8d938061d3"), title: key === 'sell' ? I18n.t("cadeditor.ui.worldentity.96975c8730") : I18n.t("cadeditor.ui.worldentity.6ee4e7d0d9") }), qty.el, kBtn(I18n.t("cadeditor.ui.common.edit"), function () {
        if (!valid()) { mark(); return; }
        var parentValid = nestedDraftGuard();
        openNestedItem(cur, { title: I18n.t("cadeditor.ui.worldentity.a5d92586c1", (label)), valid: function (session) { return valid() && parentValid(session); }, commit: put, render: paint });
      }, { icon: 'edit', title: I18n.t("cadeditor.ui.worldentity.b0117b69a3") }));
      if (optional) controls.push(kDelete(function () { put(null); paint(); }, I18n.t("cadeditor.ui.worldentity.01e58347f9")));
    }
    return h('div', { class: 'trade-item-editor' }, [optional ? h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldentity.7d66b267a5") }) : null, pick, h('div', { class: 'trade-item-controls' }, controls)]);
  }
  function num(label, key, options) {
    options = options || {};
    var n = kNumber(typeof offer[key] === 'number' ? offer[key] : 0, { min: options.min, step: options.step || 1, dec: options.dec, noSlider: true, onChange: function (v) { if (valid()) { offer[key] = v; mark(); } } });
    return xField(null, label, n.el);
  }
  function paint() {
    clear(host);
    var pay = h('div', { class: 'trade-edit-side' }, [h('div', { class: 'trade-side-title', text: I18n.t("cadeditor.ui.worldentity.af57c547f9") }), stackEditor('buy', false), stackEditor('buyB', true)]);
    var gain = h('div', { class: 'trade-edit-side' }, [h('div', { class: 'trade-side-title', text: I18n.t("cadeditor.ui.worldentity.a871df32a6") }), stackEditor('sell', false)]);
    host.appendChild(h('div', { class: 'trade-edit-flow' }, [pay, h('div', { class: 'trade-arrow', text: '→' }), gain]));
    host.appendChild(h('div', { class: 'trade-settings' }, [num(I18n.t("cadeditor.ui.worldentity.cb8181faed"), 'uses', { min: 0 }), num(I18n.t("cadeditor.ui.worldentity.84ad0ed83a"), 'maxUses', { min: 0 }), num(I18n.t("cadeditor.ui.worldentity.7ef2f1cc55"), 'xp', { min: 0 }),
      xField(null, I18n.t("cadeditor.ui.worldentity.3032d87e0a"), kToggle(offer.rewardExp !== false, function (on) { if (valid()) { offer.rewardExp = on; mark(); } }).el)]));
    host.appendChild(xRow({ icon: uiIcon('coins', 14), title: I18n.t("cadeditor.ui.worldentity.d0b7ca7e10"), sub: I18n.t("cadeditor.ui.worldentity.056be220aa"), chevron: true, open: priceOpen, onHead: function () { priceOpen = !priceOpen; paint(); }, body: function () {
      return [num(I18n.t("cadeditor.ui.worldentity.2300b92775"), 'priceMultiplier', { step: 0.01, dec: 3 }), num(I18n.t("cadeditor.ui.worldentity.27b200c783"), 'demand'), num(I18n.t("cadeditor.ui.worldentity.f067cdb899"), 'specialPrice')];
    } }));
  }
  paint();
  var modal = openModal(modalShell(I18n.t("cadeditor.ui.worldentity.16ccd8504b", (index + 1)), I18n.t("cadeditor.ui.worldentity.b5f56907da"), [host], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.done"), closeModal, { cls: 'pri' })], 'trade-editor'), true);
  modal.onEditorClose = function () { if (valid() && !NestedItem) weRedrawBody(); };
}
function evTradeTab(body) {
  var t = evGroup('trades');
  if (!t || t.available === false) { body.appendChild(xEmpty((t && t.reason) || I18n.t("cadeditor.ui.worldentity.b548253bf0"))); return; }
  var list = evOffers();
  body.appendChild(xSec('coins', I18n.t("cadeditor.ui.worldedit.919ddbbd91"), I18n.t("cadeditor.ui.worldentity.478a69f47b", (list.length))));
  function mark() { weMarkDirty(); }
  list.forEach(function (o, i) {
    var row = xRow({ icon: false, title: '', sub: I18n.t("cadeditor.ui.worldentity.3dfd4e4820", (o.uses || 0), (o.maxUses || 0)), right: kBtn(I18n.t("cadeditor.ui.common.edit"), function () { openTradeDraft(o, i); }, { icon: 'edit' }),
      onDelete: function () { list.splice(i, 1); mark(); weRender(); }, onHead: function () { openTradeDraft(o, i); } });
    row.classList.add('trade-list-row'); row.querySelector('.z').appendChild(evTradePreview(o)); body.appendChild(row);
  });
  if (list.length < 256) body.appendChild(xAdd(I18n.t("cadeditor.ui.worldentity.339169ef77"), function () { var offer = { buy: { id: 'minecraft:emerald', count: 1, comps: {}, removed: {} }, sell: { id: 'minecraft:bread', count: 1, comps: {}, removed: {} }, uses: 0, maxUses: 12, rewardExp: true, xp: 1, priceMultiplier: 0.05, demand: 0, specialPrice: 0 }; list.push(offer); mark(); weRender(); openTradeDraft(offer, list.length - 1); }));
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.c2a147bbc7")));
}

/* ---------- 乘客 / 骑乘：每一步都是单独的 apply.riding，立刻提交 ---------- */
function evRideSend(riding, note) {
  if (weDirty()) { toast(I18n.t("cadeditor.ui.worldentity.7b69ff66b8"), 'info'); return; }
  weSend('apply', { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(WE.w.slot), riding: riding }, note || I18n.t("cadeditor.ui.worldedit.c34df32374"));
}
function evRidingTab(body) {
  var r = evGroup('riding') || {}, ps = r.passengers || [], vh = r.vehicle;
  body.appendChild(xSec('users', I18n.t("cadeditor.ui.worldentity.e97ae3c027")));
  if (vh) body.appendChild(xRow({ icon: entityIcon(vh.type, 22), title: I18n.t("cadeditor.ui.worldentity.d8008b3f1c", (vh.summary || entityName(vh.type))), sub: shortId(vh.type), right: kBtn(I18n.t("cadeditor.ui.worldentity.dd30687a43"), function () { evRideSend({ action: 'dismount' }, I18n.t("cadeditor.ui.worldentity.3cd8286686")); }, { icon: 'down' }) }));
  else body.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.dbe0660d09")));
  /* 乘客卡片：头部右侧放「添加」和「全部赶下去」，列表在下面，添加表单点「添加」才展开 */
  var addOpen = WE.rideAddOpen === undefined ? !ps.length : !!WE.rideAddOpen, addBox = h('div', { class: 'wp-addbox' });
  var acts = h('span', { class: 'wp-acts' }, [
    ps.length ? kBtn(I18n.t("cadeditor.ui.worldentity.409a82de0b"), function () { evRideSend({ action: 'eject' }, I18n.t("cadeditor.ui.worldentity.3030e3c2a9")); }, { icon: 'close', title: I18n.t("cadeditor.ui.worldentity.1830da1d2a") }) : null,
    kBtn(I18n.t("cadeditor.ui.cards3.7a8a11ead5"), function () { addOpen = !addOpen; WE.rideAddOpen = addOpen; if (addOpen) { addBox.style.display = ''; uiSlide(addBox, true); } else uiSlide(addBox, false, function () { addBox.style.display = 'none'; }); }, { icon: 'plus', cls: 'pri', title: I18n.t("cadeditor.ui.worldentity.279d7eef75") })
  ]);
  body.appendChild(xSec('paw', I18n.t("cadeditor.ui.worldedit.54df03d398"), ps.length ? I18n.t("cadeditor.ui.cards1.a88dddda1c", (ps.length)) : I18n.t("cadeditor.ui.worldentity.f127804b92"), acts));
  function node(p, depth) {
    body.appendChild(xRow({ icon: entityIcon(p.type, 22), title: (depth ? '↳ ' : '') + (p.summary || entityName(p.type)), sub: shortId(p.type) + (p.passengers && p.passengers.length ? I18n.t("cadeditor.ui.worldentity.efc4ffe78f", (p.passengers.length)) : ''), tip: p.uuid,
      right: kBtn(I18n.t("cadeditor.ui.worldentity.4b4411b6f7"), function () { evRideSend({ action: 'remove', uuid: p.uuid }, I18n.t("cadeditor.ui.worldentity.3cd8286686")); }, { icon: 'close', title: I18n.t("cadeditor.ui.worldentity.1830da1d2a") }) }));
    (p.passengers || []).forEach(function (c) { node(c, depth + 1); });
  }
  if (!ps.length) body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldentity.aa5849b6c1")));
  ps.forEach(function (p) { node(p, 0); });
  var type = WE.rideType || 'minecraft:chicken', data = WE.rideData || '';
  addBox.appendChild(esEntityHeader({ id: type, snbtText: function () { var e = vaultEntityObj(WE.rideData || '{}'); e.id = WE.rideType || type; return nbtMerge(e, null); }, onPick: function (id) { if (WE.rideType !== id) WE.rideData = ''; WE.rideType = id; weRedrawBody(); }, onEntityNbt: function (snbt) { try { var payload = vaultEntityPayload(snbt); WE.rideType = payload.type; WE.rideData = payload.snbt; weRedrawBody(); } catch (e) { toast(e.message || I18n.t("cadeditor.ui.worldentity.1c154dffd3"), 'error'); } } }));
  var inp = kInput(data, function () {}, { placeholder: I18n.t("cadeditor.ui.worldentity.5a0ab96b11"), onCommit: function (t) { WE.rideData = t; } }); inp.classList.add('we-in');
  addBox.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldentity.0f6449e41e"), sub: I18n.t("cadeditor.ui.worldentity.65b7bb7301"), right: inp }));
  addBox.appendChild(h('div', { class: 'k-row' }, [kBtn(I18n.t("cadeditor.ui.worldentity.e10af7b489"), function () {
    var act = { action: 'add', type: WE.rideType || 'minecraft:chicken' }; if ((WE.rideData || '').trim()) act.entity_data = WE.rideData.trim();
    evRideSend(act, I18n.t("cadeditor.ui.worldentity.9bdb565850"));
  }, { cls: 'pri', icon: 'plus' })]));
  addBox.appendChild(kHint(I18n.t("cadeditor.ui.worldentity.247e5ab95b")));
  addBox.insertBefore(kHint(I18n.t("cadeditor.ui.worldentity.0f6d2f52a5")), addBox.firstChild);
  addBox.style.display = addOpen ? '' : 'none';
  body.appendChild(addBox);
}
