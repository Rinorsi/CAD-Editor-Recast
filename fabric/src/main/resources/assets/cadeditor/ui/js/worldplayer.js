/* 共用的格子网格 + 点开改物品的小窗：世界容器、玩家背包、玩家末影箱用同一套。
   cfg = { indices:[格号…], cols, stackOf(i)→{id,count,comps…}|{empty:true}, set(i, stack), titleOf?(i)→鼠标提示 }
   需要整行重画时返回 { el, repaint } */
function weSlotPaint(cell, st, title) {
  clear(cell);
  cell.classList.remove('fl', 'r-uncommon', 'r-rare', 'r-epic', 'r-ench');
  if (!st || st.empty) { cell.setAttribute('title', title || '空格子'); return; }
  cell.classList.add('fl');
  var cp = st.comps || {}, rar = cp.rarity || cp['minecraft:rarity'];
  if (rar === 'uncommon' || rar === 'rare' || rar === 'epic') cell.classList.add('r-' + rar);
  else if (cp.enchantment_glint_override === true || cp['minecraft:enchantment_glint_override'] === true || cp.enchantments || cp['minecraft:enchantments'] || cp.stored_enchantments) cell.classList.add('r-ench');
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
  var grid = h('div', { class: 'k-cgrid' + (cfg.bare ? '' : ' tray') + (cfg.tight ? ' inv' : '') }), cells = {};
  grid.setAttribute('style', 'grid-template-columns:repeat(' + cfg.cols + ',' + (cfg.col || 26) + 'px)');
  function paint(cell, i) {
    weSlotPaint(cell, cfg.stackOf(i), cfg.titleOf ? cfg.titleOf(i) : '格子 ' + (i + 1));
    var g = cfg.ghostOf && cfg.ghostOf(i), s = cfg.stackOf(i);
    if (g && (!s || s.empty)) cell.appendChild(uiIcon(g, 16, 'es-ghost'));
  }
  cfg.indices.forEach(function (i) {
    if (i === null) { grid.appendChild(h('div', { class: 'slot s34 blank', style: 'visibility:hidden' })); return; }
    var cell = h('div', { class: 'slot s34' + (cfg.clsOf && cfg.clsOf(i) ? ' ' + cfg.clsOf(i) : '') }); cells[i] = cell;
    paint(cell, i);
    weDndBind(cell, { get: function () { return cfg.stackOf(i); }, set: function (st) { cfg.set(i, st); } }, function () {
      weSlotPop(cell, cfg.stackOf(i), function (st) { cfg.set(i, st); paint(cell, i); });
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
  body.appendChild(weDndHint());
  var which = 'container', GEAR = ['head', 'chest', 'legs', 'feet', 'offhand', 'body', 'saddle'];
  var sel = typeof wpG('SelectedItemSlot') === 'number' ? wpG('SelectedItemSlot') : 0;
  var gearOf = {}; GEAR.forEach(function (k) { if (eq[k] !== undefined) gearOf[eq[k]] = k; });
  function mk(indices, cols) {
    return weSlotGrid({ tight: true, bare: true, col: 28, indices: indices, cols: cols, stackOf: function (i) { return wpContainerStack(which, i); }, set: function (i, st) { wpSetSlot(which, i, st); },
      ghostOf: function (i) { return gearOf[i] ? (ES_SLOT[gearOf[i]] || [0, 'shield'])[1] : null; },
      clsOf: function (i) { return i === sel && i < 9 ? 'hand' : ''; },
      titleOf: function (i) { return gearOf[i] ? (WP_EQ[gearOf[i]] || gearOf[i]) : (i < 9 ? '快捷栏 ' + (i + 1) + (i === sel ? '（手上拿的）' : '') : '背包 ' + (i - 8)); } });
  }
  var main = [], hot = [], gear = [], i;
  for (i = 9; i < 36 && i < total; i++) main.push(i);
  for (i = 0; i < 9 && i < total; i++) hot.push(i);
  /* 装备两列四行：左列 头 / 胸 / 腿 / 脚（护甲），右列 副手 / 身体 / 鞍（缺的位置留空），高度和右边的 背包 + 快捷栏 对齐 */
  var gcols = [['head', 'offhand'], ['chest', 'body'], ['legs', 'saddle'], ['feet', null]], gcount = 0, g2 = false;
  function gix(k) { return k && eq[k] !== undefined && eq[k] < total ? eq[k] : null; }
  gcols.forEach(function (r) { if (gix(r[1]) !== null) g2 = true; });
  gcols.forEach(function (r) { var a = gix(r[0]), b = gix(r[1]); if (a !== null || b !== null) { gear.push(a); if (g2) gear.push(b); } if (a !== null) gcount++; if (b !== null) gcount++; });
  /* 和原版背包一个版式：左边一列装备，右边上面三行背包、下面一行快捷栏（带手上拿的那格），整片放进同一个下凹的槽里 */
  var right = h('div', { class: 'wp-col' }, [mk(main, 9), h('div', { class: 'wp-sep' }), mk(hot, 9)]);
  var inv = h('div', { class: 'wp-inv' }, gcount ? [mk(gear, g2 ? 2 : 1), h('div', { class: 'wp-vsep' }), right] : [right]);
  body.appendChild(inv);
  /* 兜底：游戏给了 total 个格子，凡是上面没画出来的（名字不认识的装备位、将来新增的位置）都列在这里，保证一格不少 */
  var shown = {};
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
  body.appendChild(weDndHint());
  body.appendChild(weSlotGrid({ tight: true, indices: ix, cols: 9, stackOf: function (i) { return wpContainerStack('ender', i); }, set: function (i, st) { wpSetSlot('ender', i, st); } }));
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

/* ====================== 和原版背包一致的操作 ======================
   单击：编辑这一格。双击：拿起，再点另一个格子放下（两格对换；放到空格就是移动）。也可以按住拖动到另一格。Esc 取消拿起。
   所有用 weSlotGrid / 装备格子 的页面共用这一套，同一个标签页里的格子之间都能互相搬。 */
var WE_DND = { cells: [], carry: null, ghost: null, last: null, timer: null, bound: false };
function weDndReset() { WE_DND.cells = []; WE_DND.carry = null; weDndGhost(null); clearTimeout(WE_DND.timer); WE_DND.last = null; }
function weDndHint() { return h('div', { class: 'k-sub', text: '单击编辑 · 双击拿起，再点另一格放下 · 也可按住拖动对换' }); }
function weDndStack(ref) { var st = ref.get(); return st && !st.empty && st.id ? st : null; }
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
  a.ref.set(sb && sb.id && !sb.empty ? sb : { empty: true });
  b.ref.set(sa && sa.id && !sa.empty ? sa : { empty: true });
  weRedrawBody();
}
function weDndBind(cell, ref, onClick) {
  var me = { el: cell, ref: ref };
  WE_DND.cells.push(me);
  if (!WE_DND.bound) {
    WE_DND.bound = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && WE_DND.carry) { WE_DND.carry = null; weDndGhost(null); weRedrawBody(); } });
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
      if (from.ref === ref) { weRedrawBody(); return; }
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
