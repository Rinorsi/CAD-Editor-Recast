/* 共用的格子网格 + 点开改物品的小窗：世界容器、玩家背包、玩家末影箱用同一套。
   cfg = { indices:[格号…], cols, stackOf(i)→{id,count,comps…}|{empty:true}, set(i, stack), titleOf?(i)→鼠标提示 }
   需要整行重画时返回 { el, repaint } */
function weSlotPaint(cell, st, title) {
  clear(cell);
  if (!st || st.empty) { cell.setAttribute('title', title || '空格子'); return; }
  cell.appendChild(itemIcon(st.id, 26));
  if ((st.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(st.count) }));
  if ((st.comps && Object.keys(st.comps).length) || st.component_snbt) cell.appendChild(h('i', { class: 'mk', title: '这个物品带有自己的组件数据，会原样保留' }));
  cell.setAttribute('title', nameOfItem(st.id) + ' × ' + (st.count || 1) + (title ? '（' + title + '）' : ''));
}
function weSlotPop(cell, cur, set) {
  var box = h('div', { class: 'k-pickbox' }), empty = !cur || cur.empty;
  var pick = h('div', { class: 'k-btn' }, empty ? [uiIcon('plus', 12), h('span', { text: '选择物品' })] : [itemIcon(cur.id, 22), h('span', { text: nameOfItem(cur.id) })]);
  activate(pick, function () {
    pickItem(cell, function (id) { set({ id: fullId(id), count: empty ? 1 : (cur.count || 1), comps: {}, removed: {} }); kPopClose(); },
      { onStack: function (st) { var s2 = clone(st); delete s2.slot; delete s2.label; set(s2); kPopClose(); } });
  });
  box.appendChild(pick);
  if (!empty) {
    var ms = (protoOf(cur.id).max_stack_size || 64);
    var cnt = kNumber(cur.count || 1, { min: 1, max: 99, noSlider: true, step: 1, unit: '个', warnMax: ms, warnWhy: '该物品原版最大堆叠 ' + ms, presets: [{ v: 1, label: '1' }, { v: 16, label: '16' }, { v: 64, label: '64' }],
      onChange: function (v) { var o = clone(cur); o.count = v; cur = o; set(o); } });
    box.appendChild(fieldRow('数量', cnt.el));
    box.appendChild(kBtn('清空这一格', function () { set({ empty: true }); kPopClose(); }, { cls: 'dng', icon: 'trash' }));
  }
  kPopover(cell, box, { width: 250, maxHeight: 280 });
}
function weSlotGrid(cfg) {
  var grid = h('div', { class: 'k-cgrid' }), cells = {};
  grid.setAttribute('style', 'grid-template-columns:repeat(' + cfg.cols + ',34px)');
  cfg.indices.forEach(function (i) {
    if (i === null) { grid.appendChild(h('div', { class: 'slot s34 blank', style: 'visibility:hidden' })); return; }
    var cell = h('div', { class: 'slot s34' }); cells[i] = cell;
    weSlotPaint(cell, cfg.stackOf(i), cfg.titleOf ? cfg.titleOf(i) : '格子 ' + (i + 1));
    cell.addEventListener('click', function () {
      weSlotPop(cell, cfg.stackOf(i), function (st) { cfg.set(i, st); weSlotPaint(cell, cfg.stackOf(i), cfg.titleOf ? cfg.titleOf(i) : '格子 ' + (i + 1)); });
    });
    grid.appendChild(cell);
  });
  return grid;
}

/* ====================== 玩家（在线玩家，docs/world-player-contract.md） ====================== */
WE.pslots = { container: {}, ender: {} };
function wpIs() { return !!(WE.w && WE.w.kind === 'entity' && WE.w.player); }
function wpReset() { WE.pslots = { container: {}, ender: {} }; }
function wpV(k) { return evVal('player')[k]; }
function wpG(k) { return evGet('player', k); }
function wpSchema() { var g = evGroup('player'); return (g && g.schema) || {}; }
function wpBound(path) { var b = (wpSchema().bounds || {})[path]; return b || {}; }
function wpContainerStack(which, i) {
  var ed = WE.pslots[which][i]; if (ed) return ed;
  var c = wpV(which), s = c && c.slots ? c.slots.filter(function (x) { return x.slot === i; })[0] : null;
  return s ? s.stack : { empty: true };
}
function wpOrigEmpty(which, i) { var c = wpV(which), s = c && c.slots ? c.slots.filter(function (x) { return x.slot === i; })[0] : null; return !s || s.stack.empty; }
function wpSetSlot(which, i, st) {
  if ((!st || st.empty) && wpOrigEmpty(which, i)) delete WE.pslots[which][i]; else WE.pslots[which][i] = st;
  drawWorldTop(); drawWorldFoot();
}
function wpSlotsDirty() { return Object.keys(WE.pslots.container).length + Object.keys(WE.pslots.ender).length; }
function wpMsg(out) {
  ['container', 'ender'].forEach(function (k) {
    var ids = Object.keys(WE.pslots[k]); if (!ids.length) return;
    out.player = out.player || {};
    out.player[k] = { slots: ids.map(function (i) { return { slot: Number(i), stack: clone(WE.pslots[k][i]) }; }) };
  });
}
var WP_EQ = { head: '头盔', chest: '胸甲', legs: '护腿', feet: '靴子', offhand: '副手', body: '身体', saddle: '鞍', mainhand: '主手' };
var WP_MODE = { survival: '生存', creative: '创造', adventure: '冒险', spectator: '旁观' };

function wpInventoryTab(body) {
  var sc = wpSchema(), eq = {};
  (sc.equipmentSlots || []).forEach(function (e) { eq[e.equipment] = e.slot; });
  var total = (wpV('container') || {}).size || sc.inventorySize || 0;
  body.appendChild(xSec('backpack', '背包', total + ' 格'));
  var which = 'container';
  function mk(indices, cols) {
    return weSlotGrid({ indices: indices, cols: cols, stackOf: function (i) { return wpContainerStack(which, i); }, set: function (i, st) { wpSetSlot(which, i, st); },
      titleOf: function (i) { var name = null; Object.keys(eq).forEach(function (k) { if (eq[k] === i) name = WP_EQ[k] || k; }); return name || (i < 9 ? '快捷栏 ' + (i + 1) : '格子 ' + (i + 1)); } });
  }
  /* 装备：和生物 / 刷怪蛋同一个公共格子（esGearLayout）；玩家的主手就是下面快捷栏里选中的那一格 */
  body.appendChild(esGearLayout({
    has: function (slot) { return eq[slot] !== undefined && slot !== 'mainhand'; },
    stackOf: function (slot) { var st = wpContainerStack(which, eq[slot]); return st && !st.empty ? st : null; },
    onEmpty: function (slot, cell) { weSlotPop(cell, { empty: true }, function (st) { wpSetSlot(which, eq[slot], st); weRender(); }); },
    onFilled: function (slot, cell, st) { weSlotPop(cell, st, function (n) { wpSetSlot(which, eq[slot], n); weRender(); }); }
  }));
  var main = [], hot = [], i;
  for (i = 9; i < 36 && i < total; i++) main.push(i);
  for (i = 0; i < 9 && i < total; i++) hot.push(i);
  body.appendChild(h('div', { class: 'k-sub', text: '背包' })); body.appendChild(mk(main, 9));
  body.appendChild(h('div', { class: 'k-sub', text: '快捷栏' })); body.appendChild(mk(hot, 9));
  /* 兜底：游戏给了 total 个格子，凡是上面没画出来的（名字不认识的装备位、将来新增的位置）都列在这里，保证一格不少 */
  var shown = {}, GEAR = ['head', 'chest', 'legs', 'feet', 'offhand', 'body', 'saddle'];
  main.concat(hot).forEach(function (n) { shown[n] = 1; });
  GEAR.forEach(function (k) { if (eq[k] !== undefined) shown[eq[k]] = 1; });
  var rest = []; for (i = 0; i < total; i++) if (!shown[i]) rest.push(i);
  if (rest.length) { body.appendChild(h('div', { class: 'k-sub', text: '其他格子（' + rest.length + '）' })); body.appendChild(mk(rest, Math.min(9, rest.length))); }
  var smax = sc.selectedSlotMax !== undefined ? sc.selectedSlotMax : 8;
  var seg = []; for (i = 0; i <= smax; i++) seg.push({ v: i, label: String(i + 1) });
  body.appendChild(xRow({ icon: false, title: '手上拿的格子', sub: '快捷栏第几格', right: kSeg(seg, typeof wpG('SelectedItemSlot') === 'number' ? wpG('SelectedItemSlot') : 0, function (v) { evSet('player', 'SelectedItemSlot', v); }).el }));
}
function wpEnderTab(body) {
  var n = (wpV('ender') || {}).size || 27, ix = []; for (var i = 0; i < n; i++) ix.push(i);
  body.appendChild(xSec('chest', '末影箱', n + ' 格'));
  body.appendChild(weSlotGrid({ indices: ix, cols: 9, stackOf: function (i) { return wpContainerStack('ender', i); }, set: function (i, st) { wpSetSlot('ender', i, st); } }));
}
function wpNum(label, path, key, obj, o) {
  o = o || {}; var b = wpBound(path), cur = obj ? obj[key] : wpG(key);
  var n = kNumber(typeof cur === 'number' ? cur : 0, { min: b.min, max: b.max, step: o.step || 1, dec: o.dec, noSlider: true, unit: o.unit, onChange: o.on });
  n.el.classList.add('k-xnum');
  return xRow({ icon: false, title: label, sub: o.sub || (b.min !== undefined && b.max !== undefined ? '范围 ' + b.min + ' ~ ' + b.max : ''), right: n.el });
}
function wpSection(k) { var v = wpG(k); return v && typeof v === 'object' ? clone(v) : {}; }
function wpStatusTab(body) {
  var sc = wpSchema();
  body.appendChild(xSec('heart', '生命与饥饿'));
  body.appendChild(wpNum('生命', 'Health', 'Health', null, { step: 1, dec: 1, on: function (v) { evSet('player', 'Health', v); } }));
  body.appendChild(wpNum('伤害吸收', 'AbsorptionAmount', 'AbsorptionAmount', null, { step: 1, dec: 1, on: function (v) { evSet('player', 'AbsorptionAmount', v); } }));
  var fd = wpSection('food');
  body.appendChild(wpNum('饥饿值', 'food.foodLevel', 'foodLevel', fd, { on: function (v) { var f = wpSection('food'); f.foodLevel = v; evSet('player', 'food', f); } }));
  body.appendChild(wpNum('饱和度', 'food.saturation', 'saturation', fd, { step: 0.5, dec: 1, sub: '不能超过饥饿值', on: function (v) { var f = wpSection('food'); f.saturation = v; evSet('player', 'food', f); } }));
  body.appendChild(xSec('xp', '经验'));
  var xp = wpSection('experience');
  body.appendChild(wpNum('等级', 'experience.XpLevel', 'XpLevel', xp, { on: function (v) { var e = wpSection('experience'); e.XpLevel = v; evSet('player', 'experience', e); } }));
  body.appendChild(wpNum('当前等级进度', 'experience.XpP', 'XpP', xp, { step: 0.05, dec: 3, sub: '0 ~ 1，满了就升级', on: function (v) { var e = wpSection('experience'); e.XpP = v; evSet('player', 'experience', e); } }));
  body.appendChild(wpNum('经验总量', 'experience.XpTotal', 'XpTotal', xp, { on: function (v) { var e = wpSection('experience'); e.XpTotal = v; evSet('player', 'experience', e); } }));
  var modes = sc.gameModes || ['survival', 'creative', 'adventure', 'spectator'];
  body.appendChild(xSec('gamepad', '游戏模式'));
  body.appendChild(h('div', { class: 'k-row' }, [kSeg(modes.map(function (m) { return { v: m, label: WP_MODE[m] || m }; }), wpG('playerGameType') || 'survival', function (v) { evSet('player', 'playerGameType', v); }).el]));
  body.appendChild(h('div', { class: 'k-sub', text: '换模式会同时换成该模式的飞行 / 无敌 / 建造能力，除非你在「能力」页里同时指定。' }));
  body.appendChild(xSec('tag', '名字与标签'));
  var cn = wpG('CustomName'), cin = kInput(msgText(cn), function () {}, { placeholder: '自定义名称（可空）' }); cin.classList.add('we-in');
  cin.addEventListener('change', function () { evSet('player', 'CustomName', cin.value ? textMsg(cin.value) : null); });
  body.appendChild(xRow({ icon: false, title: '自定义名称', right: cin }));
  var tags = wpG('Tags') || [], tin = kInput(tags.join('，'), function () {}, { placeholder: '标签，用逗号隔开' }); tin.classList.add('we-in');
  tin.addEventListener('change', function () { evSet('player', 'Tags', tin.value.split(/[,，\s]+/).filter(function (x) { return x; })); });
  body.appendChild(xRow({ icon: false, title: '标签', sub: '给 /tag 和选择器用的标签', right: tin }));
}
function wpAbilitiesTab(body) {
  var ab = wpSection('abilities'), sc = wpSchema(), smax = sc.speedMax || 1;
  body.appendChild(xSec('wind', '能力'));
  function setAb(k, v) { var a = wpSection('abilities'); a[k] = v; evSet('player', 'abilities', a); }
  [['mayfly', '允许飞行', '双击空格起飞'], ['flying', '正在飞行', ''], ['invulnerable', '无敌', '不受伤害'], ['mayBuild', '可以放置 / 破坏方块', ''], ['instabuild', '创造模式的瞬间破坏', '']].forEach(function (f) {
    if (!(f[0] in ab)) return;
    body.appendChild(xRow({ icon: false, title: f[1], sub: f[2], right: kToggle(!!ab[f[0]], function (on) { setAb(f[0], on); }).el }));
  });
  [['walkSpeed', '行走速度', 'abilities.walkSpeed'], ['flySpeed', '飞行速度', 'abilities.flySpeed']].forEach(function (f) {
    if (!(f[0] in ab)) return;
    var b = wpBound(f[2]), n = kNumber(ab[f[0]], { min: b.min !== undefined ? b.min : 0, max: b.max !== undefined ? b.max : smax, step: 0.01, dec: 3, noSlider: true, onChange: function (v) { setAb(f[0], v); } });
    n.el.classList.add('k-xnum');
    body.appendChild(xRow({ icon: false, title: f[1], sub: '默认 ' + (f[0] === 'walkSpeed' ? '0.1' : '0.05') + ' · 最大 ' + smax, right: n.el }));
  });
}
function wpAttrTab(body) {
  var sc = wpSchema(), attrs = clone(wpG('attributes') || []), defs = sc.attributes || [];
  body.appendChild(xSec('sword', '属性', '改的是基础值，装备带来的修饰符保持不变'));
  function baseOf(id) { for (var i = 0; i < attrs.length; i++) if (attrs[i].id === id) return attrs[i].base; return undefined; }
  defs.forEach(function (d) {
    var cur = baseOf(d.id), n = kNumber(typeof cur === 'number' ? cur : d.base, { min: d.min, max: d.max, step: (d.max - d.min) > 50 ? 1 : 0.05, dec: 3, noSlider: true, onChange: function (v) {
      var list = clone(wpG('attributes') || []), at = -1; list.forEach(function (a, i) { if (a.id === d.id) at = i; });
      if (at >= 0) list[at].base = v; else list.push({ id: d.id, base: v });
      evSet('player', 'attributes', list);
    } });
    n.el.classList.add('k-xnum');
    body.appendChild(xRow({ icon: attrIconEl(d.id), title: Reg.nameOf2('attribute', d.id) || attrName(d.id), sub: '默认 ' + fmtNum(d.base) + (d.min !== undefined ? ' · 范围 ' + fmtNum(d.min) + ' ~ ' + fmtNum(d.max) : ''), tip: d.id, right: n.el }));
  });
  if (!defs.length) body.appendChild(xEmpty('游戏没有给出这个玩家的属性表。'));
  body.appendChild(xSec('flask', '状态效果'));
  var fx = kEffectList(function () { return clone(wpG('active_effects') || []); }, function (l) { evSet('player', 'active_effects', l); }, { empty: '没有效果' });
  body.appendChild(fx.el);
}
