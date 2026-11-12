/* 卡片库 · 第二部分：属性、近战 / 工具、盔甲 */

/* 下拉选择按钮：entries=[{v,label,sub,icon()}]；可手输 ID（o.custom=true 时目录里多一行"使用自定义 ID"） */
function kSelect(entries, value, onPick, o) {
  o = o || {};
  var btn = h('div', { class: 'k-btn k-sel' }), cur = value;
  function paint() {
    clear(btn);
    var e = null; entries.forEach(function (x) { if (x.v === cur) e = x; });
    if (e && e.icon) btn.appendChild(e.icon());
    btn.appendChild(h('span', { text: e ? e.label : (o.empty || cur || I18n.t("cadeditor.ui.cards2.da590a8fe3")) }));
    btn.appendChild(uiIcon('down', 10));
  }
  activate(btn, function () { pickFrom(btn, entries, function (x) { cur = x.v; paint(); onPick(x.v, x); }, { width: o.width || 250, placeholder: o.placeholder }); });
  paint();
  return { el: btn, set: function (v) { cur = v; paint(); } };
}

/* ==================== 属性 ==================== */
/* 属性图标：优先用原版的精灵（心、护甲）、状态效果图和物品图，没有对应的才退回通用图标 */
var ATTR_VIS = { armor: ['spr', 'hud/armor_full'], max_health: ['spr', 'hud/heart/full'], max_absorption: ['spr', 'hud/heart/absorbing_full'],
  attack_damage: ['eff', 'strength'], attack_speed: ['eff', 'haste'], movement_speed: ['eff', 'speed'], luck: ['eff', 'luck'], armor_toughness: ['eff', 'resistance'],
  jump_strength: ['eff', 'jump_boost'], safe_fall_distance: ['eff', 'slow_falling'], burning_time: ['eff', 'fire_resistance'], oxygen_bonus: ['eff', 'water_breathing'],
  water_movement_efficiency: ['eff', 'dolphins_grace'], mining_efficiency: ['eff', 'haste'], block_break_speed: ['eff', 'haste'], submerged_mining_speed: ['eff', 'conduit_power'],
  knockback_resistance: ['item', 'netherite_chestplate'], attack_knockback: ['item', 'mace'], block_interaction_range: ['item', 'iron_pickaxe'], entity_interaction_range: ['item', 'spyglass'],
  fall_damage_multiplier: ['item', 'feather'], scale: ['item', 'brewing_stand'], step_height: ['item', 'oak_stairs'], gravity: ['item', 'anvil'], sneaking_speed: ['item', 'leather_boots'], sweeping_damage_ratio: ['item', 'iron_sword'] };
function attrIconEl(t) {
  var v = ATTR_VIS[shortId(t)];
  if (!v) return uiIcon('sliders', 16);
  if (v[0] === 'spr') { var sp = h('sprite', { src: 'minecraft:' + v[1] }); sp.setAttribute('style', 'width:18px;height:18px'); return sp; }
  return v[0] === 'eff' ? effectIcon(v[1], 16) : itemIcon(v[1], 16);
}
var ATTR_SLOT_ICON = Labels.slotIcon;
function attrName(t) { var a = ATIDX[shortId(t)]; return a ? a.name : shortId(t); }
function attrFull(t) { return fullId(String(t)); }
var AMT_LIMIT = 2048;

function modsList() { return Ctx.get('attribute_modifiers') || []; }
function saveMods(list) { Ctx.setSmart('attribute_modifiers', list, { label: I18n.t("cadeditor.ui.cards2.7fbf16993d") }); }
function slotHit(m, slots) { var s = m.slot || 'any'; return s === 'any' || slots.indexOf(s) >= 0; }
function attrSum(type, slots) { var s = 0; modsList().forEach(function (m) { if (shortId(m.type) === type && m.operation === 'add_value' && slotHit(m, slots)) s += nbtNumberValue(m.amount); }); return s; }
function attrAmountSchema() {
  if (typeof Reg !== 'undefined' && !Reg.preview()) Reg.askSchema();
  var c = CIDX.attribute_modifiers, nodes = [];
  if (c && c.schema) liveRangeNodes(c.schema, ['[]', 'amount'], 0, nodes);
  return nodes.filter(function (n) { return n.live && n.t === 'num'; })[0] || null;
}
/* 把某属性在这些槽位的"总值"调整为 target（base 为玩家基础值）；只改主修饰器，其余保持原样 */
function setAttrTotal(type, slots, target, base, make) {
  var list = modsList(), prim = -1, others = 0;
  list.forEach(function (m, i) { if (prim < 0 && m.id === make.id && shortId(m.type) === type && m.operation === 'add_value') prim = i; });
  if (prim < 0) list.forEach(function (m, i) { if (prim < 0 && shortId(m.type) === type && m.operation === 'add_value' && slotHit(m, slots)) prim = i; });
  list.forEach(function (m, i) { if (i !== prim && shortId(m.type) === type && m.operation === 'add_value' && slotHit(m, slots)) others += nbtNumberValue(m.amount); });
  var amt = nbtNumberValue(target) - base - others;
  if (isFinite(amt)) amt = +amt.toFixed(6);
  else {
    var sc = attrAmountSchema();
    if (!sc || !(isNaN(amt) ? sc.allowNaN : amt > 0 ? sc.allowPositiveInfinity : sc.allowNegativeInfinity)) throw new Error(I18n.t("cadeditor.ui.cards2.5fb881460a"));
    amt = nbtSpecialScalar(amt, sc.nbtType);
  }
  if (prim >= 0) list[prim].amount = amt; else list.push({ type: attrFull(type), id: make.id, amount: amt, operation: 'add_value', slot: make.slot });
  saveMods(list);
}

/* 条形图标（心、护甲等）：超过 cap 个后显示 ×N，数值很大也不会撑爆 */
/* 原版 HUD 精灵：心、饥饿、护甲（全 / 半） */
var SPR = { heart: ['minecraft:hud/heart/full', 'minecraft:hud/heart/half'], food: ['minecraft:hud/food_full', 'minecraft:hud/food_half'], armor: ['minecraft:hud/armor_full', 'minecraft:hud/armor_half'] };
function iconBar(cls) {
  var el = h('div', { class: 'k-hearts ' + (cls || '') });
  return { el: el, set: function (points, cap) {
    clear(el); cap = cap || 10;
    if (!isFinite(points)) return;
    var full = Math.floor(points / 2), half = (points % 2) >= 1;
    var shown = Math.min(full, cap);
    var sp = SPR[cls === 'k-food' ? 'food' : cls === 'k-armorbar' ? 'armor' : 'heart'];
    for (var i = 0; i < shown; i++) el.appendChild(h('sprite', { src: sp[0] }));
    if (half && shown < cap) el.appendChild(h('sprite', { src: sp[1] }));
    if (full > cap) el.appendChild(h('span', { class: 'k-sub', text: '  × ' + fmtInt(full) }));
    if (points <= 0) el.appendChild(h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.common.none") }));
  } };
}

/* 通用"数值型属性"卡片：显示总值（含玩家基础值），改动写回主修饰器 */
function attrCard(o) {
  function total() { return o.base + attrSum(o.type, o.slots()); }
  if (!Reg.preview() && (o.base === null || !Reg.table('equipment_slot_groups'))) {
    var waiting = kCard({ id: 'attr-' + o.type, icon: uiIcon(o.icon, 16), title: o.title, desc: o.desc, comps: ['attribute_modifiers'], value: function () { return I18n.t("cadeditor.ui.cards1.2d1341db77"); } }, Ctx);
    waiting.body.appendChild(kHint(I18n.t("cadeditor.ui.cards2.04b972ae03")));
    return waiting;
  }
  var card = kCard({ id: 'attr-' + o.type, icon: uiIcon(o.icon, 16), title: o.title, desc: o.desc, comps: ['attribute_modifiers'], value: function () { return isFinite(total()) ? fmtNum(+total().toFixed(2)) + (o.unit ? ' ' + o.unit : '') : numLabel(total()); }, summary: function () { return isFinite(total()) && o.brief ? o.brief(total()) : ''; } }, Ctx);
  var presets = (o.presets || []).slice(), sc = attrAmountSchema();
  if (sc && sc.allowNaN) presets.push({v:NaN,label:'NaN',title:I18n.t("cadeditor.ui.cards2.9191f54457")});
  if (sc && sc.allowPositiveInfinity) presets.push({v:Infinity,label:'∞',title:I18n.t("cadeditor.ui.cards2.650e73cfd3")});
  if (sc && sc.allowNegativeInfinity) presets.push({v:-Infinity,label:'−∞',title:I18n.t("cadeditor.ui.cards2.03bf0036de")});
  var num = kNumber(total(), { special: attrAmountSchema, min: -1e15, max: 1e15, warnMax: o.warnMax, warnWhy: o.warnWhy, softMin: o.softMin, softMax: o.softMax, step: o.step, dec: o.dec, big: true, unit: o.unit, presets: presets, onChange: function (v) { setAttrTotal(o.type, o.slots(), v, o.base, { id: o.id, slot: o.slot() }); } });
  var eff = kEffect('');
  card.body.appendChild(num.el); if (o.extra) card.body.appendChild(o.extra.el);
  card.body.appendChild(eff.el);
  card.live.push(function () { var t = total(); num.set(t); if (o.extra && o.extra.update) o.extra.update(t); eff.set(isFinite(t) && o.effect ? o.effect(t) : '', isFinite(t) && o.tone ? o.tone(t) : ''); });
  card.live[card.live.length - 1]();
  return card;
}

/* 主手拿着时生效的装备槽组：来自游戏的 equipment_slot_groups（哪些组包含主手，不含 any），离线 / 没到时才用 mainhand + hand */
function meleeSlots() {
  var g = Reg.live() ? Reg.table('equipment_slot_groups') : null;
  if (!g) return ['mainhand', 'hand'];
  var out = g.filter(function (x) { return x.id !== 'any' && x.slots.indexOf('mainhand') >= 0; }).map(function (x) { return x.id; });
  return out.length ? out : ['mainhand', 'hand'];
}
CARDS.attackDamage = function () {
  var hearts = iconBar();
  var presets = [], base = Reg.baseAttr('minecraft:player', 'attack_damage', Reg.preview() ? 1 : null), max = Reg.attrMax('attack_damage', null);
  TIER_TOOLS.forEach(function (id) { var m = Ctx.protoItem(id, 'attribute_modifiers'); if (!m || base === null) return; m.forEach(function (x) { if (x.type === 'minecraft:attack_damage') presets.push({ v: base + x.amount, label: nameOfItem(id).replace(I18n.t("cadeditor.ui.cards2.391aa9b897"), '') + ' ' + fmtNum(base + x.amount) }); }); });
  presets.push({ v: 100, label: '100' }, { v: 1000, label: '1000' });
  if (max !== null) presets.push({ v: max, label: I18n.t("cadeditor.ui.cards2.2c13e58a3b", (fmtNum(max))) });
  return attrCard({
    type: 'attack_damage', icon: 'sword', brief: function (t) { return I18n.t("cadeditor.ui.cards2.da2c24dc53", (bigOrNum(+(t / 2).toFixed(1)))); }, title: I18n.t("cadeditor.ui.cards2.fb6567f1b7"), desc: I18n.t("cadeditor.ui.cards2.9b3df83bdd"),
    base: base, slots: function () { return meleeSlots(); }, slot: function () { return 'mainhand'; }, id: 'minecraft:base_attack_damage',
    warnMax: max === null ? undefined : max + (base || 0), warnWhy: max === null ? '' : I18n.t("cadeditor.ui.cards2.cff4565b6e", (fmtNum(max))), softMin: 0, softMax: 30, step: 0.5, unit: I18n.t("cadeditor.ui.cards2.08dddeac13"), presets: presets,
    effect: function (t) { return I18n.t("cadeditor.ui.cards2.ab7f332171", (bigOrNum(t / 2)), (t >= 20 ? I18n.t("cadeditor.ui.cards2.41c9778cff") : (t >= 4 ? I18n.t("cadeditor.ui.cards2.e993befb11", (Math.ceil(20 / Math.max(t, 1)))) : ''))); },
    tone: function (t) { return max !== null && t > max + (base || 0) ? 'warn' : ''; }, extra: { el: hearts.el, update: function (t) { hearts.set(Math.max(0, t), 10); } },
  });
};
function bigOrNum(n) { n = nbtNumberValue(n); if (!isFinite(n)) return numLabel(n); var b = bigText(n); return b ? fmtInt(n) + '（' + b + '）' : fmtNum(n); }

CARDS.attackSpeed = function () {
  return attrCard({
    type: 'attack_speed', icon: 'bolt', brief: function (t) { return t > 0 ? I18n.t("cadeditor.ui.cards2.5bc4755887", (+(1 / t).toFixed(2))) : ''; }, title: I18n.t("cadeditor.ui.cards2.bf1835a0e3"), desc: I18n.t("cadeditor.ui.cards2.8a3c84b2ad"),
    base: Reg.baseAttr('minecraft:player', 'attack_speed', Reg.preview() ? 4 : null), slots: function () { return meleeSlots(); }, slot: function () { return 'mainhand'; }, id: 'minecraft:base_attack_speed',
    warnMax: Reg.attrMax('attack_speed', undefined), warnWhy: I18n.t("cadeditor.ui.cards2.8f2bc7fe24"), softMin: 0.1, softMax: 4, step: 0.1, unit: I18n.t("cadeditor.ui.cards2.1baba2fcc3"), dec: 2,
    presets: [{ v: 0.8, label: '0.8' }, { v: 1, label: '1.0' }, { v: 1.6, label: '1.6' }, { v: 4, label: '4' }, { v: 100, label: '100' }],
    effect: function (t) { return t <= 0 ? I18n.t("cadeditor.ui.cards2.a09b2d72b9") : I18n.t("cadeditor.ui.cards2.336723a989", (fmtNum(1 / t)), (fmtNum(t))); },
    tone: function (t) { return t <= 0 ? 'warn' : ''; },
  });
};

/* 其它属性（自由添加 / 编辑所有修饰器）：折叠态是预览行，点开编辑，可拖拽排序 */
var OPMODES = Labels.opLong;
function modSummary(m) { var add = m.operation === 'add_value', amount = nbtNumberValue(m.amount); if (!isFinite(amount)) return numLabel(amount); var v = add ? amount : amount * 100; return (v >= 0 ? '+' : '') + bigOrNum(+v.toFixed(3)) + (add ? '' : '%'); }
CARDS.extraAttrs = function (exclude, title) {
  exclude = exclude || [];
  function mine() { return modsList().filter(function (m) { return exclude.indexOf(shortId(m.type)) < 0; }); }
  var card = kCard({ id: 'xattrs', icon: 'sliders', title: title || I18n.t("cadeditor.ui.cards2.a49074b4d1"), desc: I18n.t("cadeditor.ui.cards2.f94c036df2"), comps: ['attribute_modifiers'], span: 2, value: function () { var n = mine().length; return n ? I18n.t("cadeditor.ui.cards2.a9ab3a5f38", (n)) : ''; } }, Ctx);
  var list = h('div', { class: 'k-sortlist' });
  var openIdx = -1;
  function draw() {
    clear(list);
    var all = modsList(), n = 0;
    all.forEach(function (m, idx) {
      var t = shortId(m.type);
      if (exclude.indexOf(t) >= 0) return;
      n++;
      var info = ATIDX[t], isAdd = m.operation === 'add_value', isOpen = openIdx === idx;
      /* 一行里直接改数值；展开才出现“计算方式 / 生效位置 / 删除” */
      var val = nbtNumberValue(m.amount) * (isAdd ? 1 : 100), headRef = null;
      var num = xNumCtl(isFinite(val) ? +val.toFixed(4) : val, { special: attrAmountSchema, min: -1e15, max: 1e15, step: isAdd ? 0.5 : 5, unit: isAdd ? '' : '%', noSlider: true, onChange: function (v) { var amount = nbtNumberValue(v) / (isAdd ? 1 : 100); nbtPut(all[idx], 'amount', isFinite(amount) ? amount : nbtSpecialScalar(amount, attrAmountSchema().nbtType)); saveMods(all); } }, true);
      var row = xRow({ grip: true, chevron: true, icon: attrIconEl(t), title: attrName(t), sub: (SLOT_ZH[m.slot || 'any'] || m.slot) + (isAdd ? '' : I18n.t("cadeditor.ui.cards2.a4e509f80f")), tip: info ? info.desc : I18n.t("cadeditor.ui.cards2.9836dd5816", (m.type)), right: num.el, onDelete: function () { all.splice(idx, 1); openIdx = -1; saveMods(all); draw(); }, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : idx; draw(); } });
      if (isOpen) {
        var opsel = { el: combo({ options: function () { return Reg.enumOptions('attribute_operation', OPMODES); }, value: m.operation || '', free: true, onPick: function (v) { all[idx].operation = v; saveMods(all); draw(); } }) };
        var slotSel = { el: combo({ options: attributeSlotOptions, value: m.slot || 'any', free: true, placeholder: I18n.t("cadeditor.ui.cards2.9b3b16e5b4"), onPick: function (v) { all[idx].slot = v; saveMods(all); draw(); } }) };
        row.appendChild(h('div', { class: 'k-xbody x2' }, [h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [uiIcon('sliders', 14), h('span', { text: I18n.t("cadeditor.ui.cards2.a96675295d") })]), opsel.el]), h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [uiIcon('pin', 14), h('span', { text: I18n.t("cadeditor.ui.cards2.35f1ad7628") })]), slotSel.el]), h('div', { class: 'x2f' }, [h('span', { class: 'k-sub', text: isAdd ? '' : I18n.t("cadeditor.ui.cards2.2485487922") })])]));
      }
      onContext(row, function () { return [{ label: I18n.t("cadeditor.ui.cards2.eff3012bf5"), icon: 'copy', run: function () { all.splice(idx + 1, 0, clone(m)); all[idx + 1].id = 'cadeditor:' + t + '_' + (all.length); saveMods(all); draw(); } }, { sep: 1 }, { label: I18n.t("cadeditor.ui.common.delete"), icon: 'trash', danger: 1, run: function () { all.splice(idx, 1); saveMods(all); draw(); } }]; });
      list.appendChild(row);
    });
    if (!n) list.appendChild(xEmpty(I18n.t("cadeditor.ui.cards2.c709cff956")));
  }
  kSortable(list, { onMove: function (from, to) { var vis = []; modsList().forEach(function (m, i) { if (exclude.indexOf(shortId(m.type)) < 0) vis.push(i); }); var all = modsList(); var a = vis[from], b = vis[to]; var x = all.splice(a, 1)[0]; all.splice(b, 0, x); openIdx = -1; saveMods(all); draw(); } });
  var add = xAdd(I18n.t("cadeditor.ui.cards2.ca2d78680b"));
  activate(add, function () {
    var selected = {}; modsList().forEach(function (m) { if (exclude.indexOf(shortId(m.type)) < 0) selected[Reg.full(m.type)] = 1; });
    openAttrPicker({ exclude: exclude, selected: selected, onConfirm: function (ids) {
      var wanted = {}, have = {}; ids.forEach(function (id) { wanted[Reg.full(id)] = 1; });
      var l = modsList().filter(function (m) { var keep = exclude.indexOf(shortId(m.type)) >= 0 || wanted[Reg.full(m.type)]; if (keep) have[Reg.full(m.type)] = 1; return keep; });
      var slot = Ctx.kind() === 'armor' ? ((Ctx.get('equippable') || {}).slot || 'any') : 'mainhand';
      ids.forEach(function (full) { if (have[full]) return; have[full] = 1; var base = 'cadeditor:' + shortId(full).replace(/[^a-z0-9_./-]/g, '_') + '_', n = l.length + 1; while (l.some(function (m) { return m.id === base + n; })) n++; l.push({ type: full, id: base + n, amount: 1, operation: 'add_value', slot: slot }); });
      openIdx = l.length - 1; saveMods(l); draw();
    } });
  });
  card.body.appendChild(h('div', { class: 'k-scrollbox tall' }, [list])); card.body.appendChild(add); draw();
  card.live.push(function () { var key = JSON.stringify(mine()); if (card._key !== key) { card._key = key; if (!list.querySelector('.k-xrow.open')) draw(); } });
  return card;
};

/* ==================== 近战 / 武器 ==================== */
CARDS.weapon = function () {
  var card = kCard({ id: 'weapon', icon: 'swords', title: I18n.t("cadeditor.ui.cards2.909e640e6a"), desc: I18n.t("cadeditor.ui.cards2.25847b02aa"), comps: ['weapon'] }, Ctx);
  var v = Ctx.get('weapon');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards2.c6d8c19e44"), I18n.t("cadeditor.ui.cards2.52d04b821a")], I18n.t("cadeditor.ui.cards2.8c21d58fb6"), function () { Ctx.enable('weapon', {}, I18n.t("cadeditor.ui.cards2.8c21d58fb6")); });
  var per = codecNumber(codecField(v, 'weapon', 'item_damage_per_attack', 1), { min: 0, max: 2147483647, softMax: 10, step: 1, presets: [{ v: 0, label: I18n.t("cadeditor.ui.cards2.5e3217baca") }, { v: 1, label: '1' }, { v: 2, label: '2' }], onChange: function (n) { var w = Ctx.get('weapon') || {}; w.item_damage_per_attack = n; Ctx.setSmart('weapon', w, { label: I18n.t("cadeditor.ui.cards2.a1b612e90d") }); } });
  var dis = codecNumber(codecField(v, 'weapon', 'disable_blocking_for_seconds', 0), { min: 0, max: 3.4e38, softMax: 10, step: 0.5, dec: 1, unit: I18n.t("cadeditor.ui.cards2.9dcdc2b289"), presets: [{ v: 0, label: I18n.t("cadeditor.ui.cards2.ff315474f2") }, { v: 5, label: I18n.t("cadeditor.ui.cards2.63207b7fbd") }, { v: 10, label: '10' }], onChange: function (n) { var w = Ctx.get('weapon') || {}; w.disable_blocking_for_seconds = n; Ctx.setSmart('weapon', w, { label: I18n.t("cadeditor.ui.cards2.4d8e8d2a9d") }); } });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.217e67139c"), per.el, I18n.t("cadeditor.ui.cards2.7b35944e92")));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.38ebcbb04f"), dis.el, I18n.t("cadeditor.ui.cards2.76b4f70520")));
  card.live.push(function () { var w = Ctx.get('weapon'); if (w) { per.set(codecField(w, 'weapon', 'item_damage_per_attack', 1)); dis.set(codecField(w, 'weapon', 'disable_blocking_for_seconds', 0)); } });
  return card;
};

CARDS.reach = function () {
  var card = kCard({ id: 'reach', icon: 'target', title: I18n.t("cadeditor.ui.cards2.13ffd7215e"), desc: I18n.t("cadeditor.ui.cards2.bfe7af0e5a"), comps: ['attack_range'] }, Ctx);
  var v = Ctx.get('attack_range');
  var base = v || {};
  function put(k) { return function (n) { var o = Ctx.get('attack_range') || {}; o[k] = n; Ctx.setSmart('attack_range', o, { label: I18n.t("cadeditor.ui.cards2.13ffd7215e") }); }; }
  var mx = codecNumber(codecField(base, 'attack_range', 'max_reach', 3), { min: 0, max: 1e6, warnMax: 64, warnWhy: I18n.t("cadeditor.ui.cards2.aeabd1be36"), softMax: 10, step: 0.5, dec: 1, unit: I18n.t("cadeditor.ui.cards2.06f2f8e0a8"), presets: [{ v: 3, label: I18n.t("cadeditor.ui.cards2.0c216dc5fc") }, { v: 4.5, label: '4.5' }, { v: 6, label: '6' }, { v: 12, label: '12' }, { v: 64, label: '64' }], onChange: put('max_reach') });
  var mn = codecNumber(codecField(base, 'attack_range', 'min_reach', 0), { min: 0, max: 1e6, warnMax: 64, warnWhy: I18n.t("cadeditor.ui.cards2.aeabd1be36"), softMax: 5, step: 0.5, dec: 1, unit: I18n.t("cadeditor.ui.cards2.06f2f8e0a8"), presets: [{ v: 0, label: '0' }, { v: 2, label: I18n.t("cadeditor.ui.cards2.1801acd654") }], onChange: put('min_reach') });
  var hb = codecNumber(codecField(base, 'attack_range', 'hitbox_margin', 0.3), { min: 0, max: 1e3, warnMax: 1, warnWhy: I18n.t("cadeditor.ui.cards2.3655160db4"), softMax: 1, step: 0.05, dec: 2, unit: I18n.t("cadeditor.ui.cards2.06f2f8e0a8"), onChange: put('hitbox_margin') });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.b12fb54d4e"), mx.el, I18n.t("cadeditor.ui.cards2.b190309e15")));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.5d0c2580c3"), mn.el, I18n.t("cadeditor.ui.cards2.716f20f796")));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.54c1e5bd0e"), hb.el, I18n.t("cadeditor.ui.cards2.0fcc8cdb68")));
  card.live.push(function () { var o = Ctx.get('attack_range'); if (o) { mx.set(codecField(o, 'attack_range', 'max_reach', 3)); mn.set(codecField(o, 'attack_range', 'min_reach', 0)); hb.set(codecField(o, 'attack_range', 'hitbox_margin', 0.3)); } });
  if (!v) card.body.appendChild(kHint(I18n.t("cadeditor.ui.cards2.ce1a6d96d7")));
  return card;
};

CARDS.swing = function () {
  var card = kCard({ id: 'swing', icon: 'wand', title: I18n.t("cadeditor.ui.cards2.9bc059407e"), desc: I18n.t("cadeditor.ui.cards2.6305cf7a3d"), comps: ['swing_animation'] }, Ctx);
  var v = Ctx.get('swing_animation') || {};
  function put(k, val) { var o = Ctx.get('swing_animation') || {}; o[k] = val; Ctx.setSmart('swing_animation', o, { label: I18n.t("cadeditor.ui.cards2.9bc059407e") }); }
  function swingOptions() { return Reg.codecOptions('swing_animation', 'type', [{ v: 'whack', label: I18n.t("cadeditor.ui.cards2.2968026e4a") }, { v: 'stab', label: I18n.t("cadeditor.ui.cards2.e37974ce48") }, { v: 'none', label: I18n.t("cadeditor.ui.cards2.dfacdacb7e") }]); }
  var options = swingOptions(), seg = options.length ? kSeg(options, codecField(v, 'swing_animation', 'type', 'whack'), function (x) { put('type', x); }) : null;
  var manual = combo({ options: swingOptions, value: codecField(v, 'swing_animation', 'type', 'whack'), free: true, placeholder: I18n.t("cadeditor.ui.cards2.57de41b828"), onPick: function (x) { put('type', x); } });
  var dur = codecNumber(codecField(v, 'swing_animation', 'duration', 6), { min: 1, max: 2147483647, softMax: 40, step: 1, unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), presets: [{ v: 6, label: '6' }, { v: 10, label: '10' }, { v: 20, label: I18n.t("cadeditor.ui.cards2.8c01b02296") }], onChange: function (n) { put('duration', n); } });
  if (seg) card.body.appendChild(seg.el); card.body.appendChild(manual); card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.d520eaa1e5"), dur.el, I18n.t("cadeditor.ui.cards2.8be6bf539e")));
  card.live.push(function () { var o = Ctx.get('swing_animation'); if (o) { if (seg) seg.set(codecField(o, 'swing_animation', 'type', 'whack')); dur.set(codecField(o, 'swing_animation', 'duration', 6)); } });
  return card;
};

CARDS.cooldown = function () {
  var card = kCard({ id: 'cooldown', icon: 'clock', title: I18n.t("cadeditor.ui.cards2.71751b365e"), desc: I18n.t("cadeditor.ui.cards2.802862a39a"), comps: ['use_cooldown'] }, Ctx);
  var v = Ctx.get('use_cooldown');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards2.5d98bde654"), I18n.t("cadeditor.ui.cards2.77bb098be4")], I18n.t("cadeditor.ui.cards2.a660ff2e28"), function () { Ctx.enable('use_cooldown', { seconds: 1 }, I18n.t("cadeditor.ui.cards2.05c820b869")); });
  var sec = kNumber(v.seconds, { min: 0.05, max: 3.4e38, softMax: 60, step: 0.5, dec: 2, unit: I18n.t("cadeditor.ui.cards2.9dcdc2b289"), presets: [{ v: 1, label: '1' }, { v: 5, label: '5' }, { v: 15, label: '15' }, { v: 60, label: '60' }], onChange: function (n) { var o = Ctx.get('use_cooldown') || { seconds: 1 }; o.seconds = n; Ctx.setSmart('use_cooldown', o, { label: I18n.t("cadeditor.ui.cards2.71751b365e") }); } });
  card.body.appendChild(sec.el);
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.edc68098ae"), kInput(v.cooldown_group || '', function (t) { var o = Ctx.get('use_cooldown') || { seconds: 1 }; if (t) o.cooldown_group = t; else delete o.cooldown_group; Ctx.setSmart('use_cooldown', o, { label: I18n.t("cadeditor.ui.cards2.db83c803a0") }); }, { placeholder: I18n.t("cadeditor.ui.cards2.6ff8f511ac") }), I18n.t("cadeditor.ui.cards2.8bdd1f96fd")));
  card.live.push(function () { var o = Ctx.get('use_cooldown'); if (o) sec.set(o.seconds); });
  return card;
};

/* ==================== 工具 ==================== */
var TOOL_GROUPS = [
  { v: '#minecraft:mineable/pickaxe', label: I18n.t("cadeditor.ui.cards2.082b83546d"), sub: I18n.t("cadeditor.ui.cards2.7bf2dfbf9d") },
  { v: '#minecraft:mineable/axe', label: I18n.t("cadeditor.ui.cards2.65bbd5a158"), sub: I18n.t("cadeditor.ui.cards2.e5ed34222d") },
  { v: '#minecraft:mineable/shovel', label: I18n.t("cadeditor.ui.cards2.f56e6dea3c"), sub: I18n.t("cadeditor.ui.cards2.ab9438bb41") },
  { v: '#minecraft:mineable/hoe', label: I18n.t("cadeditor.ui.cards2.2e14a90783"), sub: I18n.t("cadeditor.ui.cards2.5a3a21d676") },
  { v: 'minecraft:cobweb', label: I18n.t("cadeditor.ui.cards2.221cda6289"), sub: '' },
  { v: '#minecraft:wool', label: I18n.t("cadeditor.ui.cards2.e9ba4dd8f9"), sub: '' },
  { v: '#minecraft:leaves', label: I18n.t("cadeditor.ui.cards2.bbfaaaf9df"), sub: '' },
  { v: '#minecraft:sword_efficient', label: I18n.t("cadeditor.ui.cards2.d93f505cc3"), sub: I18n.t("cadeditor.ui.cards2.a5fbe45381") },
  { v: '#minecraft:sword_instantly_mines', label: I18n.t("cadeditor.ui.cards2.e530713398"), sub: '' },
  { v: '#minecraft:incorrect_for_diamond_tool', label: I18n.t("cadeditor.ui.cards2.6461d06035"), sub: I18n.t("cadeditor.ui.cards2.23d0967a30") },
];
function groupLabel(b) {
  if (typeof b === 'string') { var m = /^#minecraft:incorrect_for_(w+)_tool$/.exec(b); if (m) return I18n.t("cadeditor.ui.cards2.cb055c9087", ({ wooden: I18n.t("cadeditor.ui.cards2.9213ab0589"), stone: I18n.t("cadeditor.ui.cards2.e6df66d461"), iron: I18n.t("cadeditor.ui.cards2.8f615d2ef8"), gold: I18n.t("cadeditor.ui.cards2.3c1e31a193"), diamond: I18n.t("cadeditor.ui.cards1.8f6c204b25"), netherite: I18n.t("cadeditor.ui.cards2.579b91946c"), copper: I18n.t("cadeditor.ui.cards2.be59bb7699") }[m[1]] || m[1])); }
  var key = typeof b === 'string' ? b : (Array.isArray(b) ? b.join(',') : '');
  for (var i = 0; i < TOOL_GROUPS.length; i++) if (TOOL_GROUPS[i].v === key) return TOOL_GROUPS[i].label;
  if (Array.isArray(b)) return b.map(function (x) { return x.replace('minecraft:', ''); }).join('、');
  return typeof b === 'string' ? b.replace('minecraft:', '') : '?';
}
var TOOL_BATCH_SEQ = 0;
CARDS.tool = function () {
  var card = kCard({ id: 'tool', icon: itemIcon('diamond_pickaxe', 18), title: I18n.t("cadeditor.ui.cards2.bda51f8ce1"), desc: I18n.t("cadeditor.ui.cards2.de9f99c84f"), comps: ['tool'], span: 2 }, Ctx);
  var v = Ctx.get('tool');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards2.97a31a2148"), I18n.t("cadeditor.ui.cards2.82d87cae02")], I18n.t("cadeditor.ui.cards2.3ea3f4b171"), function () { Ctx.enable('tool', { rules: [] }, I18n.t("cadeditor.ui.cards2.3ea3f4b171")); });
  function put(fn, label, atomic) { var o = clone(Ctx.get('tool') || { rules: [] }); fn(o); seenRules = clone(o.rules || []); Ctx.setSmart('tool', o, { label: label || I18n.t("cadeditor.ui.cards2.bda51f8ce1"), key: atomic ? '-batch-' + (++TOOL_BATCH_SEQ) : '' }); refreshSummaries(); }
  var def = codecNumber(codecField(v, 'tool', 'default_mining_speed', 1), { min: 0, max: 3.4e38, softMax: 30, step: 0.5, dec: 2, big: true, presets: [{ v: 1, label: I18n.t("cadeditor.ui.cards2.877426cdf9") }, { v: 4, label: '4' }, { v: 8, label: '8' }, { v: 12, label: '12' }, { v: 1000, label: I18n.t("cadeditor.ui.cards2.7ef05d3dfa") }], onChange: function (n) { put(function (o) { o.default_mining_speed = n; }, I18n.t("cadeditor.ui.cards2.bbada5d0fd")); } });
  var dpb = codecNumber(codecField(v, 'tool', 'damage_per_block', 1), { min: 0, max: 2147483647, softMax: 5, step: 1, presets: [{ v: 0, label: I18n.t("cadeditor.ui.cards2.5e3217baca") }, { v: 1, label: '1' }, { v: 2, label: '2' }], onChange: function (n) { put(function (o) { o.damage_per_block = n; }, I18n.t("cadeditor.ui.cards2.f2baf5d7cd")); } });
  var cc = codecToggle(codecField(v, 'tool', 'can_destroy_blocks_in_creative', true), function (on) { put(function (o) { o.can_destroy_blocks_in_creative = on; }, I18n.t("cadeditor.ui.cards2.35f8d4443c")); }, I18n.t("cadeditor.ui.cards2.3703b6a08b"));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.803dc4c7fc"), def.el, I18n.t("cadeditor.ui.cards2.3c3ad09701")));
  var rules = h('div', { class: 'k-sortlist' }), openIdx = -1, seenRules = clone(v.rules || []);
  function summary(r) { return (r.speed === undefined ? I18n.t("cadeditor.ui.cards2.5a8a45c977") : I18n.t("cadeditor.ui.cards2.812d752d6c", (bigOrNum(r.speed)))) + (r.correct_for_drops === undefined ? '' : r.correct_for_drops ? I18n.t("cadeditor.ui.cards2.de4dddc55a") : I18n.t("cadeditor.ui.cards2.155e6a63da")); }
  function refreshSummaries() {
    if (!rules) return;
    var list = (Ctx.get('tool') || {}).rules || [];
    Array.prototype.forEach.call(rules.children, function (row, i) { var sub = row.querySelector('.s'); if (sub && list[i]) sub.textContent = summary(list[i]); });
  }
  function drawRules() {
    clear(rules);
    var o = Ctx.get('tool') || { rules: [] };
    (o.rules || []).forEach(function (r, i) {
      var isOpen = openIdx === i;
      var row = xRow({ grip: true, chevron: true, icon: false, title: groupLabel(r.blocks), sub: summary(r), onDelete: function () { put(function (t) { t.rules.splice(i, 1); }); openIdx = -1; drawRules(); }, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; drawRules(); } });
      if (isOpen) {
        var sp = kNumber(r.speed === undefined ? 1 : r.speed, { min: 0, max: 3.4e38, softMax: 30, step: 0.5, dec: 2, preservePrecision: true, noSlider: true, unit: I18n.t("cadeditor.ui.cards2.16729fb40a"), onChange: function (n) { put(function (t) { t.rules[i].speed = n; }); } });
        var drops = kSeg([{ v: 'inherit', label: I18n.t("cadeditor.ui.cards2.a833e70ea3") }, { v: 'yes', label: I18n.t("cadeditor.ui.cards2.3ab860cb6a") }, { v: 'no', label: I18n.t("cadeditor.ui.cards2.71c7263f86") }], r.correct_for_drops === undefined ? 'inherit' : (r.correct_for_drops ? 'yes' : 'no'), function (x) { put(function (t) { if (x === 'inherit') delete t.rules[i].correct_for_drops; else t.rules[i].correct_for_drops = x === 'yes'; }); });
        row.appendChild(h('div', { class: 'k-xbody' }, [fieldRow(I18n.t("cadeditor.ui.cards2.4cb45caf96"), sp.el, typeof r.blocks === 'string' ? r.blocks : ''), fieldRow(I18n.t("cadeditor.ui.cards2.3cc7c3d88d"), drops.el, I18n.t("cadeditor.ui.cards2.b21e855cd7"))]));
      }
      rules.appendChild(row);
    });
    if (!(o.rules || []).length) rules.appendChild(xEmpty(I18n.t("cadeditor.ui.cards2.1288495452")));
    refreshSummaries();
  }
  kSortable(rules, { onMove: function (from, to) { put(function (t) { var x = t.rules.splice(from, 1)[0]; t.rules.splice(to, 0, x); }); openIdx = -1; drawRules(); } });
  var add = xAdd(I18n.t("cadeditor.ui.cards2.8e90fce1a1"));
  activate(add, function () {
    var owner = Store.doc(), source = clone(Ctx.get('tool')), selected = {}, speedTouched = false, checking = false, drop = (source.rules || []).length ? 'keep' : 'yes';
    (source.rules || []).forEach(function (r) { (Array.isArray(r.blocks) ? r.blocks : [r.blocks]).forEach(function (id) { selected[pickerId(id)] = 1; }); });
    var speed = kNumber(4, { min: 0, max: 3.4e38, step: 0.5, dec: 2, preservePrecision: true, noSlider: true, onChange: function () { if (!checking) speedTouched = true; } });
    var speedInput = speed.el.querySelector('input'); speedInput.addEventListener('input', function () { speedTouched = true; });
    if (Object.keys(selected).length) { speedInput.value = ''; speedInput.setAttribute('placeholder', I18n.t("cadeditor.ui.cards2.9fdbd57413")); setTip(speedInput, I18n.t("cadeditor.ui.cards2.fa6dac8bb8")); }
    var drops = combo({ value: drop, options: [{ v: 'keep', label: I18n.t("cadeditor.ui.cards2.f7fba7cdfb") }, { v: 'yes', label: I18n.t("cadeditor.ui.cards2.3ab860cb6a") }, { v: 'no', label: I18n.t("cadeditor.ui.cards2.71c7263f86") }, { v: 'inherit', label: I18n.t("cadeditor.ui.cards2.7ee62c71f9") }], onPick: function (x) { drop = x; } });
    var controls = h('div', { class: 'pk-ctl tool-pick-settings' }, [h('div', { class: 'tool-pick-field' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.cards2.0e14d148b4") }), speed.el]), h('div', { class: 'tool-pick-field' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.cards2.8fc1764b21") }), drops])]);
    openTagPicker({ title: I18n.t("cadeditor.ui.cards2.8e90fce1a1"), multi: true, selected: selected, controls: controls, validateConfirm: function () {
      if (Store.doc() !== owner || !deepEq(Ctx.get('tool'), source)) { toast(I18n.t("cadeditor.ui.cards2.d0acf87613"), 'warn'); return false; }
      checking = true; try { return speed.commitInput(); } finally { checking = false; }
    }, tagsReg: 'block', entryReg: 'block', quick: keepKnownTags(TOOL_GROUPS, 'block').map(function (g) { return { v: g.v, label: g.label, sub: g.sub }; }), entryIcon: function (e) { return itemIcon(shortId(e.v), 16); }, onConfirm: function (ids) {
    if (Store.doc() !== owner || !Ctx.get('tool')) return;
    var wanted = {}, have = {}; ids.forEach(function (id) { wanted[pickerId(id)] = true; });
    function settings(rule, fresh) { if (fresh || speedTouched) rule.speed = speed.get(); if (drop === 'inherit') delete rule.correct_for_drops; else if (drop !== 'keep' || fresh) rule.correct_for_drops = drop !== 'no'; return rule; }
    put(function (t) {
      var next = [];
      (t.rules || []).forEach(function (r) {
        var blocks = (Array.isArray(r.blocks) ? r.blocks : [r.blocks]).filter(function (id) { return wanted[pickerId(id)]; });
        if (!blocks.length) return;
        blocks.forEach(function (id) { have[pickerId(id)] = true; });
        if (Array.isArray(r.blocks) && blocks.length !== r.blocks.length) r.blocks = blocks;
        next.push(settings(r, false));
      });
      ids.forEach(function (id) { id = pickerId(id); if (!have[id]) { have[id] = true; next.push(settings({ blocks: id }, true)); } });
      t.rules = next;
    }, I18n.t("cadeditor.ui.cards2.8e90fce1a1"), true);
    openIdx = -1; drawRules();
  } }); });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.dfa33781f3"), h('div', { class: 'k-scrollbox' }, [rules]), I18n.t("cadeditor.ui.cards2.8427299b5c")));
  card.body.appendChild(add);
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.b40230a5c3"), dpb.el, I18n.t("cadeditor.ui.cards2.6b78ebbc35")));
  card.body.appendChild(cc.el);
  drawRules();
  card.live.push(function () { var o = Ctx.get('tool'); if (o) { def.set(codecField(o, 'tool', 'default_mining_speed', 1)); dpb.set(codecField(o, 'tool', 'damage_per_block', 1)); if (!deepEq(seenRules, o.rules || [])) { openIdx = -1; seenRules = clone(o.rules || []); drawRules(); } } });
  return card;
};

/* ==================== 盔甲 ==================== */
var EQ_SLOTS = Labels.slotChoices;
var EQ_SOUNDS = [{ v: 'minecraft:item.armor.equip_generic', label: I18n.t("cadeditor.ui.cards2.835b700e02") }, { v: 'minecraft:item.armor.equip_leather', label: I18n.t("cadeditor.ui.cards1.578a853e50") }, { v: 'minecraft:item.armor.equip_chain', label: I18n.t("cadeditor.ui.cards2.c9b58fbc68") }, { v: 'minecraft:item.armor.equip_iron', label: I18n.t("cadeditor.ui.cards2.8f615d2ef8") }, { v: 'minecraft:item.armor.equip_gold', label: I18n.t("cadeditor.ui.cards2.3c1e31a193") }, { v: 'minecraft:item.armor.equip_diamond', label: I18n.t("cadeditor.ui.cards1.8f6c204b25") }, { v: 'minecraft:item.armor.equip_netherite', label: I18n.t("cadeditor.ui.cards2.579b91946c") }, { v: 'minecraft:item.armor.equip_turtle', label: I18n.t("cadeditor.ui.cards2.9bac2781f3") }, { v: 'minecraft:item.armor.equip_elytra', label: I18n.t("cadeditor.ui.cards2.09e4cdfa68") }];
var EQ_ASSETS = [{ v: 'minecraft:leather', label: I18n.t("cadeditor.ui.cards1.578a853e50") }, { v: 'minecraft:chainmail', label: I18n.t("cadeditor.ui.cards2.c9b58fbc68") }, { v: 'minecraft:iron', label: I18n.t("cadeditor.ui.cards2.8f615d2ef8") }, { v: 'minecraft:gold', label: I18n.t("cadeditor.ui.cards2.3c1e31a193") }, { v: 'minecraft:diamond', label: I18n.t("cadeditor.ui.cards1.8f6c204b25") }, { v: 'minecraft:netherite', label: I18n.t("cadeditor.ui.cards2.579b91946c") }, { v: 'minecraft:copper', label: I18n.t("cadeditor.ui.cards2.be59bb7699") }, { v: 'minecraft:turtle_scute', label: I18n.t("cadeditor.ui.cards2.9bac2781f3") }, { v: 'minecraft:elytra', label: I18n.t("cadeditor.ui.cards2.09e4cdfa68") }];
CARDS.equip = function () {
  var card = kCard({ id: 'equip', icon: 'helmet', title: I18n.t("cadeditor.ui.cards2.c757df724f"), desc: I18n.t("cadeditor.ui.cards2.c10e3e5a6d"), comps: ['equippable'], span: 2 }, Ctx);
  var v = Ctx.get('equippable');
  function slots() { var live = Reg.options('enum:equipment_slot'); return live || (Reg.preview() ? EQ_SLOTS : []); }
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards2.f69f31afa5"), I18n.t("cadeditor.ui.cards2.46b6d304be")], I18n.t("cadeditor.ui.cards2.21d4f9f575"), function () { pickFrom(card.el, slots(), function (s) { Ctx.enable('equippable', { slot: s.v }, I18n.t("cadeditor.ui.cards2.21d4f9f575")); }, { manual: { label: I18n.t("cadeditor.ui.cards2.71ea293af3"), parse: function (s) { return s; } } }); });
  function put(fn, label) { var o = Ctx.get('equippable') || {}; fn(o); Ctx.setSmart('equippable', o, { label: label || I18n.t("cadeditor.ui.cards2.e39e3dab8b") }); }
  var slot = kTiles(slots().map(function (s) { return { v: s.v, label: s.label, sub: s.sub, icon: s.icon || function () { return uiIcon('grid', 16); } }; }), v.slot, function (x) { put(function (o) { o.slot = x; }, I18n.t("cadeditor.ui.cards2.67ee21379c")); }, { cols: 8 });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.6a40bd280d"), slot.el));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards2.a1c7206950"), combo({ options: slots, free: true, value: v.slot || '', onPick: function (x) { put(function (o) { o.slot = x; }); } })));
  var look = kRegSelect({ reg: 'equipment_asset', value: v.asset_id || '', title: I18n.t("cadeditor.ui.cards2.98c420c2ed"), empty: I18n.t("cadeditor.ui.cards2.a55e3bcffb"), allowClear: true, fallback: EQ_ASSETS, onChange: function (x) { put(function (o) { if (x) o.asset_id = x; else delete o.asset_id; }, I18n.t("cadeditor.ui.cards2.009e14dea9")); } });
  var snd = kSoundField(codecField(v, 'equippable', 'equip_sound', 'minecraft:item.armor.equip_generic') || '', function (x) { put(function (o) { o.equip_sound = x; }, I18n.t("cadeditor.ui.cards2.c30a9e617f")); });
  card.body.appendChild(h('div', { class: 'k-row wrap' }, [fieldRow(I18n.t("cadeditor.ui.cards2.009e14dea9"), look.el, I18n.t("cadeditor.ui.cards2.27edf087f8")), fieldRow(I18n.t("cadeditor.ui.cards2.c30a9e617f"), snd.el)]));
  var T = [['dispensable', I18n.t("cadeditor.ui.cards2.1ed668dd3e"), true], ['swappable', I18n.t("cadeditor.ui.cards2.22d8f03658"), true], ['damage_on_hurt', I18n.t("cadeditor.ui.cards2.0ff75bb36a"), true], ['equip_on_interact', I18n.t("cadeditor.ui.cards2.172cb11132"), false], ['can_be_sheared', I18n.t("cadeditor.ui.cards2.2573f8f903"), false]];
  var togs = h('div', { class: 'k-fxlist' });
  T.forEach(function (t) { var tg = codecToggle(codecField(v, 'equippable', t[0], t[2]), function (on) { put(function (o) { o[t[0]] = on; }); }, t[1]); togs.appendChild(tg.el); });
  card.body.appendChild(togs);
  card.live.push(function () { var o = Ctx.get('equippable'); if (o) slot.set(o.slot); });
  return card;
};

function slotsOfEquip() { var e = Ctx.get('equippable'); return e ? [e.slot, 'armor'] : ['head', 'chest', 'legs', 'feet', 'armor']; }
function slotKey() { var e = Ctx.get('equippable'); return e ? e.slot : 'chest'; }
var PIECE_ID = Labels.armorPiece;
CARDS.armorValue = function () {
  var bar = iconBar('k-armorbar');
  return attrCard({
    type: 'armor', icon: 'chestplate', title: I18n.t("cadeditor.ui.cards2.e289369cd8"), desc: I18n.t("cadeditor.ui.cards2.76f945d455"),
    base: 0, slots: slotsOfEquip, slot: slotKey, id: 'minecraft:armor.' + (PIECE_ID[slotKey()] || 'chestplate'),
    warnMax: 30, warnWhy: I18n.t("cadeditor.ui.cards2.53cf3baaf6"), softMin: 0, softMax: 30, step: 1, unit: I18n.t("cadeditor.ui.cards2.08dddeac13"),
    presets: [{ v: 0, label: '0' }, { v: 2, label: I18n.t("cadeditor.ui.cards2.d56b61e381") }, { v: 5, label: I18n.t("cadeditor.ui.cards2.3da7d94049") }, { v: 6, label: I18n.t("cadeditor.ui.cards2.ed16c935a8") }, { v: 8, label: I18n.t("cadeditor.ui.cards2.c6f344fc4d") }, { v: 30, label: I18n.t("cadeditor.ui.cards2.393501dcf3") }],
    effect: function (t) { return t > 30 ? I18n.t("cadeditor.ui.cards2.c2a19d971b") : I18n.t("cadeditor.ui.cards2.5e5d172387"); }, tone: function (t) { return t > 30 ? 'warn' : ''; },
    extra: { el: bar.el, update: function (t) { bar.set(Math.max(0, t), 10); } },
  });
};
CARDS.armorToughness = function () {
  return attrCard({
    type: 'armor_toughness', icon: 'shield', title: I18n.t("cadeditor.ui.cards2.5cb7a29fae"), desc: I18n.t("cadeditor.ui.cards2.327de47844"),
    base: 0, slots: slotsOfEquip, slot: slotKey, id: 'minecraft:armor.' + (PIECE_ID[slotKey()] || 'chestplate'),
    warnMax: 20, warnWhy: I18n.t("cadeditor.ui.cards2.3a1843c6d8"), softMin: 0, softMax: 8, step: 0.5, unit: I18n.t("cadeditor.ui.cards2.08dddeac13"), presets: [{ v: 0, label: '0' }, { v: 1, label: '1' }, { v: 2, label: I18n.t("cadeditor.ui.cards2.0b1ddcf9b6") }, { v: 3, label: I18n.t("cadeditor.ui.cards2.1fac4c7e4a") }],
    effect: function (t) { return t > 20 ? I18n.t("cadeditor.ui.cards2.e319dee0b6") : I18n.t("cadeditor.ui.cards2.b221e0a437"); }, tone: function (t) { return t > 20 ? 'warn' : ''; },
  });
};
CARDS.knockbackResist = function () {
  return attrCard({
    type: 'knockback_resistance', icon: 'anvil', title: I18n.t("cadeditor.ui.cards2.389ba2aaf1"), desc: I18n.t("cadeditor.ui.cards2.425ae342d3"),
    base: 0, slots: slotsOfEquip, slot: slotKey, id: 'minecraft:armor.knockback_resistance',
    warnMax: 1, warnWhy: I18n.t("cadeditor.ui.cards2.fdc2f3b176"), softMin: 0, softMax: 1, step: 0.05, dec: 2, unit: '', presets: [{ v: 0, label: '0' }, { v: 0.1, label: I18n.t("cadeditor.ui.cards2.8f7fae60ba") }, { v: 0.25, label: '0.25' }, { v: 1, label: I18n.t("cadeditor.ui.cards2.c28893b6c6") }],
    effect: function (t) { return t >= 1 ? I18n.t("cadeditor.ui.cards2.f8dbc0f2cf") : I18n.t("cadeditor.ui.cards2.9ad29b2920", (Math.round(t * 100))); },
  });
};

var TRIM_MATS = ['amethyst', 'copper', 'diamond', 'emerald', 'gold', 'iron', 'lapis', 'netherite', 'quartz', 'redstone', 'resin'];
var TRIM_ICON = { amethyst: 'amethyst_shard', copper: 'copper_ingot', diamond: 'diamond', emerald: 'emerald', gold: 'gold_ingot', iron: 'iron_ingot', lapis: 'lapis_lazuli', netherite: 'netherite_ingot', quartz: 'quartz', redstone: 'redstone', resin: 'resin_brick' };
CARDS.trim = function () {
  var card = kCard({ id: 'trim', icon: itemIcon('netherite_upgrade_smithing_template', 18), title: I18n.t("cadeditor.ui.cards1.6bd90f70c2"), desc: I18n.t("cadeditor.ui.cards2.eb55478661"), comps: ['trim'], toggle: true, eager: true }, Ctx);
  card.make = function () { openRegPick({ reg: 'trim_material', title: I18n.t("cadeditor.ui.cards2.d3c5c3424f"), onPick: function (material) { openRegPick({ reg: 'trim_pattern', title: I18n.t("cadeditor.ui.cards2.0470f994c7"), onPick: function (pattern) { Ctx.enable('trim', { material: material, pattern: pattern }, I18n.t("cadeditor.ui.cards2.15e823f034")); } }); } }); };
  var v = Ctx.get('trim');
  if (!v) { card.el.classList.add('off'); return card; }
  function put(key, x) { var o = Ctx.get('trim') || {}; o[key] = x; Ctx.setSmart('trim', o, { label: I18n.t("cadeditor.ui.cards1.6bd90f70c2") }); }
  var picks = h('div', { class: 'trim-picks' });
  function trimPick(label, reg, key) {
    var art = h('div', { class: 'trim-pick-image' }, [refIcon(reg, v[key] || '', 32)]);
    var select = kRegSelect({ reg: reg, value: v[key] || '', title: I18n.t("cadeditor.ui.cards2.ea44a185a8", (label)), empty: I18n.t("cadeditor.ui.banner.3c5045c728"), onChange: function (x) { if (x) { put(key, x); clear(art); art.appendChild(refIcon(reg, x, 32)); } } });
    return h('div', { class: 'trim-pick' }, [art, kHint(label), select.el]);
  }
  picks.appendChild(trimPick(I18n.t("cadeditor.ui.cards2.e140c977bf"), 'trim_material', 'material'));
  picks.appendChild(trimPick(I18n.t("cadeditor.ui.cards2.9fbb8e9f1a"), 'trim_pattern', 'pattern'));
  card.body.appendChild(picks);
  return card;
};

CARDS.dye = function () {
  var card = kCard({ id: 'dye', icon: 'palette', title: I18n.t("cadeditor.ui.cards1.0e694eeb27"), desc: I18n.t("cadeditor.ui.cards2.de2fb86137"), comps: ['dyed_color'] }, Ctx);
  var v = Ctx.get('dyed_color');
  var col = kColor(typeof v === 'number' ? v : (Array.isArray(v) ? ((Math.round(v[0] * 255) << 16) | (Math.round(v[1] * 255) << 8) | Math.round(v[2] * 255)) : (Reg.preview() ? 0xA06540 : null)), function (c) { Ctx.set('dyed_color', c, { label: I18n.t("cadeditor.ui.cards1.0e694eeb27") }); });
  card.body.appendChild(col.el);
  card.live.push(function () { var x = Ctx.get('dyed_color'); if (typeof x === 'number') col.set(x); });
  return card;
};

CARDS.glider = function () {
  return kCard({ id: 'glider', icon: 'feather', title: I18n.t("cadeditor.ui.cards2.254e042e68"), desc: I18n.t("cadeditor.ui.cards2.cb8c9a6fe3"), comps: ['glider'], bare: true, toggle: { get: function () { return Ctx.has('glider'); }, set: function (on) { Ctx.setPresence('glider', on, { label: on ? I18n.t("cadeditor.ui.cards2.5ddc7093f7") : I18n.t("cadeditor.ui.cards2.873ea95af4") }); } } }, Ctx);
};

regEnumTable('equipment_slot', EQ_SLOTS, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, sub: '', icon: function () { return uiIcon('grid', 20); } }; });
regEnumTable('attribute_operation', OPMODES, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, title: id }; });
