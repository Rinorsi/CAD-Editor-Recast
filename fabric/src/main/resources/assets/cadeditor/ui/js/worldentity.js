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
function evGet(g, k) { var e = WE.ent[g]; if (e && Object.prototype.hasOwnProperty.call(e, k)) return e[k]; return evVal(g)[k]; }
function evSet(g, k, v) {
  var e = WE.ent[g] || (WE.ent[g] = {});
  if (weNorm(v) === weNorm(evVal(g)[k])) delete e[k]; else e[k] = v;
  if (!Object.keys(e).length) delete WE.ent[g];
  drawWorldTop(); drawWorldFoot();
}
function evDirty() { return !!WE.w && (Object.keys(WE.ent).length > 0 || (typeof wpSlotsDirty === 'function' && wpSlotsDirty() > 0) || WE.offers !== null && JSON.stringify(WE.offers) !== JSON.stringify(evOffersOrig())); }
function evOffersOrig() { var t = evGroup('trades'); return t && t.offers ? t.offers : []; }
function evMsg(msg) {
  var out = {}, any = false;
  Object.keys(WE.ent).forEach(function (g) { out[g] = clone(WE.ent[g]); any = true; });
  if (WE.offers !== null && JSON.stringify(WE.offers) !== JSON.stringify(evOffersOrig())) { out.offers = clone(WE.offers); any = true; }
  if (typeof wpMsg === 'function') { wpMsg(out); if (out.player) any = true; }
  if (any) msg.entity = out;
}
function evRedraw() { weRender(); }
function evNum(label, v, o, on) {
  o = o || {};
  var n = kNumber(typeof v === 'number' ? v : 0, { min: o.min, max: o.max, softMin: o.softMin, softMax: o.softMax, step: o.step || 1, dec: o.dec, unit: o.unit, noSlider: o.noSlider !== false && o.softMax === undefined, onChange: on });
  n.el.classList.add('k-xnum');
  return xRow({ icon: false, title: label, sub: o.sub, right: n.el });
}
function evBool(label, v, sub, on) { return xRow({ icon: false, title: label, sub: sub, right: kToggle(!!v, on).el }); }
function evStack(cur, onSet, o) {
  o = o || {};
  var has = cur && cur.id && !cur.empty;
  var btn = h('div', { class: 'k-btn' }, has ? [itemIcon(shortId(cur.id), 22), h('span', { text: nameOfItem(cur.id) })] : [uiIcon('plus', 12), h('span', { text: o.placeholder || '选择物品' })]);
  function norm(st) { var s = clone(st); delete s.slot; delete s.label; return s; }
  activate(btn, function () { pickItem(btn, function (id) { onSet({ id: fullId(id), count: 1, comps: {}, removed: {} }); kPopClose(); }, { onStack: function (st) { onSet(norm(st)); kPopClose(); } }); });
  var kids = [btn];
  if (has && o.clear !== false) kids.push(kBtn('清空', function () { onSet(o.empty); }, { icon: 'trash' }));
  return h('div', { class: 'k-row' }, kids);
}

/* ---------- 盔甲架姿势 ---------- */
var EV_PARTS = [['Head', '头'], ['Body', '身体'], ['LeftArm', '左臂'], ['RightArm', '右臂'], ['LeftLeg', '左腿'], ['RightLeg', '右腿']];
function evPoseTab(body) {
  var F = evFields('pose');
  body.appendChild(xSec('user', '姿势', '角度，单位度'));
  EV_PARTS.forEach(function (pp) {
    var key = pp[0], cur = evGet('pose', key); if (!Array.isArray(cur)) cur = (F[key] && F[key].default) || [0, 0, 0];
    cur = cur.slice(0, 3);
    var def = (F[key] && F[key].default) || [0, 0, 0], k = 'we:pose:' + key, open = !!UIOpen[k];
    function setAxis(i, v) { var n = evGet('pose', key); n = Array.isArray(n) ? n.slice(0, 3) : def.slice(); n[i] = v; evSet('pose', key, n); }
    body.appendChild(xRow({ icon: false, title: pp[1], sub: 'X ' + fmtNum(cur[0]) + '°  Y ' + fmtNum(cur[1]) + '°  Z ' + fmtNum(cur[2]) + '°', chevron: true, open: open,
      onHead: function () { UIOpen[k] = !UIOpen[k]; evRedraw(); },
      body: function () {
        var rows = ['X 前后摆', 'Y 左右转', 'Z 侧倾'].map(function (nm, i) {
          var n = kNumber(cur[i], { softMin: -180, softMax: 180, step: 1, dec: 1, unit: '°', onChange: function (v) { setAxis(i, v); } });
          return xField(null, nm, n.el);
        });
        rows.push(h('div', { class: 'x2f' }, [h('div', { class: 'grow' }), kBtn('恢复默认', function () { evSet('pose', key, def.slice()); evRedraw(); }, { icon: 'undo' })]));
        return rows;
      } }));
  });
  body.appendChild(xSec('sliders', '状态'));
  [['ShowArms', '显示手臂', '手臂可以拿东西'], ['Small', '小号', '缩小到一半大'], ['NoBasePlate', '没有底座', ''], ['Invisible', '隐形', ''], ['Marker', '没有碰撞箱', '点不到、也不挡路']].forEach(function (f) {
    if (!(f[0] in evVal('pose')) && !(F[f[0]])) return;
    body.appendChild(evBool(f[1], evGet('pose', f[0]), f[2], function (on) { evSet('pose', f[0], on); }));
  });
  body.appendChild(h('div', { class: 'k-sub', text: '手里拿的、身上穿的在「属性」页的装备里改。' }));
}

/* ---------- 展示框 / 荧光展示框 ---------- */
function evFrameTab(body) {
  var F = evFields('item_frame'), v = evVal('item_frame');
  body.appendChild(xSec('image', '展示框'));
  var cur = evGet('item_frame', 'item');
  body.appendChild(xRow({ icon: false, title: '框里的物品', right: evStack(cur, function (st) { evSet('item_frame', 'item', st); evRedraw(); }, { empty: { empty: true } }) }));
  var rotMax = F.ItemRotation && F.ItemRotation.max !== undefined ? F.ItemRotation.max : 7;
  body.appendChild(evNum('物品转了几格', evGet('item_frame', 'ItemRotation'), { min: 0, max: rotMax, sub: '每格 45°，共 ' + (rotMax + 1) + ' 个朝向' }, function (x) { evSet('item_frame', 'ItemRotation', x); }));
  body.appendChild(evBool('隐形框', evGet('item_frame', 'Invisible'), '只看到里面的物品', function (on) { evSet('item_frame', 'Invisible', on); }));
  body.appendChild(evBool('固定', evGet('item_frame', 'Fixed'), '不能转动、取下物品', function (on) { evSet('item_frame', 'Fixed', on); }));
  body.appendChild(evNum('被打掉时掉落物品的概率', evGet('item_frame', 'ItemDropChance'), { step: 0.1, dec: 3, sub: '1 是必掉' }, function (x) { evSet('item_frame', 'ItemDropChance', x); }));
}
function evPaintingTab(body) {
  body.appendChild(xSec('image', '画'));
  var sel = kRegSelect({ reg: 'painting_variant', value: evGet('painting', 'variant') || '', title: '选择画', onChange: function (id) { evSet('painting', 'variant', id); } });
  body.appendChild(xRow({ icon: false, title: '画面', sub: '朝向和挂的位置不能在这里改', right: sel.el }));
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
  body.appendChild(xSec('cube', '位置与大小'));
  var kt = 'we:disp:xf';
  body.appendChild(xRow({ icon: false, title: '变换', sub: '偏移、缩放、旋转（四元数）', chevron: true, open: UIOpen[kt] !== false, onHead: function () { UIOpen[kt] = UIOpen[kt] === false; evRedraw(); },
    body: function () { return [evVec('偏移', g, 'translation', true, [0, 0, 0]), evVec('缩放', g, 'scale', true, [1, 1, 1]), evVec('先转', g, 'left_rotation', false, [0, 0, 0, 1]), evVec('后转', g, 'right_rotation', false, [0, 0, 0, 1])]; } }));
  var bills = (F.billboard && F.billboard.options) || ['fixed', 'vertical', 'horizontal', 'center'];
  var BN = { fixed: '固定', vertical: '绕竖轴', horizontal: '绕横轴', center: '始终面向' };
  body.appendChild(xRow({ icon: false, title: '朝向', sub: '要不要跟着玩家的视角转', right: kSeg(bills.map(function (b) { return { v: b, label: BN[b] || b }; }), evGet(g, 'billboard') || 'fixed', function (x) { evSet(g, 'billboard', x); }).el }));
  var br = evGet(g, 'brightness'), brOn = br && typeof br === 'object';
  body.appendChild(evBool('固定亮度', brOn, '不跟随周围的光照', function (on) { evSet(g, 'brightness', on ? { block: 15, sky: 15 } : null); evRedraw(); }));
  if (brOn) {
    body.appendChild(evNum('方块光', br.block, { min: 0, max: 15, softMin: 0, softMax: 15, noSlider: false }, function (x) { evSet(g, 'brightness', { block: x, sky: (evGet(g, 'brightness') || br).sky }); }));
    body.appendChild(evNum('天空光', br.sky, { min: 0, max: 15, softMin: 0, softMax: 15, noSlider: false }, function (x) { evSet(g, 'brightness', { block: (evGet(g, 'brightness') || br).block, sky: x }); }));
  }
  body.appendChild(xSec('eye', '显示'));
  [['view_range', '可见距离', '相对默认的倍数'], ['width', '宽度', '裁剪用，0 是不裁'], ['height', '高度', '裁剪用，0 是不裁'], ['shadow_radius', '阴影半径', ''], ['shadow_strength', '阴影浓度', '']].forEach(function (f) {
    if (!(f[0] in v)) return;
    body.appendChild(evNum(f[1], evGet(g, f[0]), { step: 0.1, dec: 3, sub: f[2] }, function (x) { evSet(g, f[0], x); }));
  });
  if ('glow_color_override' in v) body.appendChild(evNum('发光颜色', evGet(g, 'glow_color_override'), { sub: '整数颜色，-1 表示不覆盖' }, function (x) { evSet(g, 'glow_color_override', x); }));
  body.appendChild(xSec('clock', '动画'));
  body.appendChild(evNum('过渡时长', evGet(g, 'interpolation_duration'), { unit: '刻', sub: '变换改变后用多久平滑过去' }, function (x) { evSet(g, 'interpolation_duration', x); }));
  body.appendChild(evNum('移动平滑', evGet(g, 'teleport_duration'), { unit: '刻', sub: '游戏最多保留 59' }, function (x) { evSet(g, 'teleport_duration', x); }));
  if (isItem) {
    body.appendChild(xSec('sword', '展示的物品'));
    body.appendChild(xRow({ icon: false, title: '物品', right: evStack(evGet(g, 'item'), function (st) { evSet(g, 'item', st); evRedraw(); }, { empty: null }) }));
    var ctx = (F.item_display && F.item_display.options) || ['none', 'thirdperson_lefthand', 'thirdperson_righthand', 'firstperson_lefthand', 'firstperson_righthand', 'head', 'gui', 'ground', 'fixed', 'on_shelf'];
    body.appendChild(xRow({ icon: false, title: '展示方式', sub: '摆的位置不同，物品的模型姿态也不同', right: kSelect(ctx.map(function (c) { return { v: c, label: c }; }), evGet(g, 'item_display') || 'none', function (x) { evSet(g, 'item_display', x); }, { width: 200 }).el }));
  }
  if (isBlock) {
    body.appendChild(xSec('cube_grass', '展示的方块'));
    var bs = evGet(g, 'block_state') || { Name: 'minecraft:air' };
    var sel = kRegSelect({ reg: 'block', value: bs.Name, title: '选择方块', onChange: function (id) { evSet(g, 'block_state', { Name: id }); } });
    body.appendChild(xRow({ icon: false, title: '方块', sub: bs.Properties ? '带有方块状态：换方块会清掉' : '', right: sel.el }));
  }
  if (isText) {
    body.appendChild(xSec('chat', '文字'));
    var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: '文字，或文本组件 JSON：{"text":"你好","bold":true}' }); ta.value = msgText(evGet(g, 'text'));
    ta.addEventListener('change', function () { evSet(g, 'text', textMsg(ta.value)); });
    body.appendChild(ta);
    var al = (F.alignment && F.alignment.options) || ['center', 'left', 'right'], AN = { center: '居中', left: '靠左', right: '靠右' };
    body.appendChild(xRow({ icon: false, title: '对齐', right: kSeg(al.map(function (a) { return { v: a, label: AN[a] || a }; }), evGet(g, 'alignment') || 'center', function (x) { evSet(g, 'alignment', x); }).el }));
    body.appendChild(evNum('一行最宽', evGet(g, 'line_width'), { unit: '像素', sub: '超过会自动换行' }, function (x) { evSet(g, 'line_width', x); }));
    var op = evGet(g, 'text_opacity'), op255 = typeof op === 'number' ? (op < 0 ? op + 256 : op) : 255;
    body.appendChild(evNum('文字不透明度', op255, { min: 0, max: 255, softMin: 0, softMax: 255, noSlider: false, sub: '0 全透明，255 不透明' }, function (x) { evSet(g, 'text_opacity', x > 127 ? x - 256 : x); }));
    body.appendChild(evBool('文字阴影', evGet(g, 'shadow'), '', function (on) { evSet(g, 'shadow', on); }));
    body.appendChild(evBool('穿过方块也看得见', evGet(g, 'see_through'), '', function (on) { evSet(g, 'see_through', on); }));
    body.appendChild(evBool('用默认背景', evGet(g, 'default_background'), '和聊天栏同样的半透明底', function (on) { evSet(g, 'default_background', on); }));
    body.appendChild(evNum('背景颜色', evGet(g, 'background'), { sub: '整数 ARGB，-16777216 是不透明黑' }, function (x) { evSet(g, 'background', x); }));
  }
}

/* ---------- 村民 / 流浪商人交易（只有服务端能改） ---------- */
function evOffers() { if (WE.offers === null) WE.offers = clone(evOffersOrig()); return WE.offers; }
function evTradeTab(body) {
  var t = evGroup('trades');
  if (!t || t.available === false) { body.appendChild(xEmpty((t && t.reason) || '交易只能在有服务器时修改（单人游戏的内置服务器也行）。')); return; }
  var list = evOffers();
  body.appendChild(xSec('coins', '交易', list.length + ' 条'));
  function mark() { drawWorldTop(); drawWorldFoot(); }
  function stackLine(o, key, label, optional) {
    var cur = o[key];
    var has = cur && cur.id;
    var btn = h('div', { class: 'k-btn' }, has ? [itemIcon(shortId(cur.id), 22), h('span', { text: nameOfItem(cur.id) })] : [uiIcon('plus', 12), h('span', { text: optional ? '不需要第二件' : '选择物品' })]);
    function put(st) { if (st === null) delete o[key]; else { if (cur && cur.cost_predicate_snbt !== undefined && st.id !== cur.id) delete st.cost_predicate_snbt; o[key] = st; } mark(); evRedraw(); }
    activate(btn, function () { pickItem(btn, function (id) { var prev = o[key] || {}; put({ id: fullId(id), count: prev.count || 1, comps: {}, removed: {} }); kPopClose(); }, { onStack: function (st) { var s2 = clone(st); delete s2.slot; delete s2.label; put(s2); kPopClose(); } }); });
    var kids = [btn];
    if (has) {
      var cnt = kNumber(cur.count || 1, { min: 1, max: 99, noSlider: true, step: 1, onChange: function (v) { cur.count = v; mark(); } });
      kids.push(cnt.el);
      if (optional) kids.push(kBtn('去掉', function () { delete o[key]; mark(); evRedraw(); }, { icon: 'trash' }));
    }
    return xField(null, label, h('div', { class: 'k-row' }, kids));
  }
  list.forEach(function (o, i) {
    var k = 'we:offer:' + i, nm = function (s) { return s && s.id ? nameOfItem(s.id) + (s.count > 1 ? '×' + s.count : '') : '—'; };
    var title = nm(o.buy) + (o.buyB ? ' + ' + nm(o.buyB) : '') + ' → ' + nm(o.sell);
    body.appendChild(xRow({ icon: o.sell && o.sell.id ? itemIcon(shortId(o.sell.id), 22) : false, title: title, sub: '已交易 ' + (o.uses || 0) + ' / ' + (o.maxUses || 0) + ' 次', chevron: true, open: !!UIOpen[k],
      onHead: function () { UIOpen[k] = !UIOpen[k]; evRedraw(); },
      body: function () {
        function num(label, key, op) { var n = kNumber(typeof o[key] === 'number' ? o[key] : 0, { min: op && op.min, step: op && op.step || 1, dec: op && op.dec, noSlider: true, onChange: function (v) { o[key] = v; mark(); } }); return xField(null, label, n.el); }
        return [stackLine(o, 'buy', '收', false), stackLine(o, 'buyB', '再收', true), stackLine(o, 'sell', '卖', false),
          num('已交易', 'uses', { min: 0 }), num('最多交易', 'maxUses', { min: 0 }), num('给村民的经验', 'xp', { min: 0 }),
          xField(null, '交易后给玩家经验', kToggle(o.rewardExp !== false, function (on) { o.rewardExp = on; mark(); }).el),
          num('价格浮动', 'priceMultiplier', { step: 0.01, dec: 3 }), num('需求加价', 'demand'), num('特殊价格', 'specialPrice'),
          h('div', { class: 'x2f' }, [h('div', { class: 'grow' }), kBtn('删除这条交易', function () { list.splice(i, 1); mark(); evRedraw(); }, { cls: 'dng', icon: 'trash' })])];
      } }));
  });
  if (list.length < 256) body.appendChild(xAdd('添加一条交易', function () { list.push({ buy: { id: 'minecraft:emerald', count: 1, comps: {}, removed: {} }, sell: { id: 'minecraft:bread', count: 1, comps: {}, removed: {} }, uses: 0, maxUses: 12, rewardExp: true, xp: 1, priceMultiplier: 0.05, demand: 0, specialPrice: 0 }); UIOpen['we:offer:' + (list.length - 1)] = true; mark(); evRedraw(); }));
  body.appendChild(h('div', { class: 'k-sub', text: '玩家正开着交易界面时游戏会拒绝修改。列表是整个替换：删掉的交易就真的没有了；清空后这个村民不会再自己刷新交易。' }));
}

/* ---------- 乘客 / 骑乘：每一步都是单独的 apply.riding，立刻提交 ---------- */
function evRideSend(riding, note) {
  if (weDirty()) { toast('还有没应用的修改。乘客的改动要单独提交，请先应用或放弃别的修改。', 'info'); return; }
  weSend('apply', { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(WE.w.slot), riding: riding }, note || '已提交给游戏，等待回执…');
}
function evRidingTab(body) {
  var r = evGroup('riding') || {}, ps = r.passengers || [], vh = r.vehicle;
  body.appendChild(xSec('users', '骑乘关系'));
  if (vh) body.appendChild(xRow({ icon: entityIcon(vh.type, 22), title: '正骑着：' + (vh.summary || entityName(vh.type)), sub: shortId(vh.type), right: kBtn('下来', function () { evRideSend({ action: 'dismount' }, '正在让它下来…'); }, { icon: 'down' }) }));
  else body.appendChild(h('div', { class: 'k-sub', text: '没有骑着别的东西。' }));
  /* 乘客卡片：头部右侧放「添加」和「全部赶下去」，列表在下面，添加表单点「添加」才展开 */
  var addOpen = WE.rideAddOpen === undefined ? !ps.length : !!WE.rideAddOpen, addBox = h('div', { class: 'wp-addbox' });
  var acts = h('span', { class: 'wp-acts' }, [
    ps.length ? kBtn('全部赶下去', function () { evRideSend({ action: 'eject' }, '正在让乘客全部下来…'); }, { icon: 'close', title: '只解除骑乘，生物不会被删除' }) : null,
    kBtn('添加', function () { addOpen = !addOpen; WE.rideAddOpen = addOpen; if (addOpen) { addBox.style.display = ''; uiSlide(addBox, true); } else uiSlide(addBox, false, function () { addBox.style.display = 'none'; }); }, { icon: 'plus', cls: 'pri', title: '给它加一个乘客' })
  ]);
  body.appendChild(xSec('paw', '乘客', ps.length ? ps.length + ' 个' : '没有', acts));
  function node(p, depth) {
    body.appendChild(xRow({ icon: entityIcon(p.type, 22), title: (depth ? '↳ ' : '') + (p.summary || entityName(p.type)), sub: shortId(p.type) + (p.passengers && p.passengers.length ? ' · 背着 ' + p.passengers.length + ' 个' : ''), tip: p.uuid,
      right: kBtn('赶下去', function () { evRideSend({ action: 'remove', uuid: p.uuid }, '正在让它下来…'); }, { icon: 'close', title: '只解除骑乘，生物不会被删除' }) }));
    (p.passengers || []).forEach(function (c) { node(c, depth + 1); });
  }
  if (!ps.length) body.appendChild(xEmpty('没有乘客。'));
  ps.forEach(function (p) { node(p, 0); });
  var type = WE.rideType || 'minecraft:chicken', data = WE.rideData || '';
  addBox.appendChild(esEntityHeader({ id: type, onPick: function (id) { WE.rideType = id; weRedrawBody(); }, onEntityNbt: function (snbt) { var o = vaultEntityObj(snbt); WE.rideType = o.id || WE.rideType; delete o.id; WE.rideData = toSnbt(o, null, false); weRedrawBody(); } }));
  var inp = kInput(data, function () {}, { placeholder: '可选的数据，比如 {CustomName:"小鸡"}' }); inp.classList.add('we-in');
  inp.addEventListener('change', function () { WE.rideData = inp.value; });
  addBox.appendChild(xRow({ icon: false, title: '初始数据', sub: 'SNBT，可以不填', right: inp }));
  addBox.appendChild(h('div', { class: 'k-row' }, [kBtn('加上去', function () {
    var act = { action: 'add', type: WE.rideType || 'minecraft:chicken' }; if ((WE.rideData || '').trim()) act.entity_data = WE.rideData.trim();
    evRideSend(act, '正在加上乘客…');
  }, { cls: 'pri', icon: 'plus' })]));
  addBox.appendChild(h('div', { class: 'k-sub', text: '骑乘关系的修改不能撤销。' }));
  addBox.insertBefore(h('div', { class: 'k-sub', text: '新生物会按游戏的规则判断能不能骑上去' }), addBox.firstChild);
  addBox.style.display = addOpen ? '' : 'none';
  body.appendChild(addBox);
}
