/* 卡片库 · 第二部分：属性、近战 / 工具、盔甲 */

/* 下拉选择按钮：entries=[{v,label,sub,icon()}]；可手输 ID（o.custom=true 时目录里多一行"使用自定义 ID"） */
function kSelect(entries, value, onPick, o) {
  o = o || {};
  var btn = h('div', { class: 'k-btn k-sel' }), cur = value;
  function paint() {
    clear(btn);
    var e = null; entries.forEach(function (x) { if (x.v === cur) e = x; });
    if (e && e.icon) btn.appendChild(e.icon());
    btn.appendChild(h('span', { text: e ? e.label : (o.empty || cur || '请选择') }));
    btn.appendChild(uiIcon('down', 10));
  }
  activate(btn, function () { pickFrom(btn, entries, function (x) { cur = x.v; paint(); onPick(x.v, x); }, { width: o.width || 250, placeholder: o.placeholder }); });
  paint();
  return { el: btn, set: function (v) { cur = v; paint(); } };
}

/* ==================== 属性 ==================== */
var ATTR_ICON = { attack_damage: 'sword', attack_speed: 'bolt', armor: 'chestplate', armor_toughness: 'shield', max_health: 'heart', movement_speed: 'boots', knockback_resistance: 'anvil', attack_knockback: 'hammer', luck: 'luck', block_interaction_range: 'pickaxe', entity_interaction_range: 'target', jump_strength: 'up', safe_fall_distance: 'feather', scale: 'maximize', step_height: 'up', gravity: 'down', fall_damage_multiplier: 'down', max_absorption: 'heart_half', burning_time: 'flame', oxygen_bonus: 'wind', water_movement_efficiency: 'wind', sneaking_speed: 'boots', mining_efficiency: 'pickaxe', block_break_speed: 'pickaxe', submerged_mining_speed: 'pickaxe', sweeping_damage_ratio: 'swords' };
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
var ATTR_SLOT_ICON = { mainhand: 'sword', offhand: 'shield', hand: 'sword', head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots', armor: 'chestplate', body: 'paw', saddle: 'cart', any: 'grid' };
function attrName(t) { var a = ATIDX[shortId(t)]; return a ? a.name : shortId(t); }
function attrFull(t) { return fullId(String(t)); }
var AMT_LIMIT = 2048;

function modsList() { return Ctx.get('attribute_modifiers') || []; }
function saveMods(list) { Ctx.setSmart('attribute_modifiers', list, { label: '修改属性' }); }
function slotHit(m, slots) { var s = m.slot || 'any'; return s === 'any' || slots.indexOf(s) >= 0; }
function attrSum(type, slots) { var s = 0; modsList().forEach(function (m) { if (shortId(m.type) === type && m.operation === 'add_value' && slotHit(m, slots)) s += m.amount; }); return s; }
/* 把某属性在这些槽位的"总值"调整为 target（base 为玩家基础值）；只改主修饰器，其余保持原样 */
function setAttrTotal(type, slots, target, base, make) {
  var list = modsList(), prim = -1, others = 0;
  list.forEach(function (m, i) { if (prim < 0 && m.id === make.id && shortId(m.type) === type && m.operation === 'add_value') prim = i; });
  if (prim < 0) list.forEach(function (m, i) { if (prim < 0 && shortId(m.type) === type && m.operation === 'add_value' && slotHit(m, slots)) prim = i; });
  list.forEach(function (m, i) { if (i !== prim && shortId(m.type) === type && m.operation === 'add_value' && slotHit(m, slots)) others += m.amount; });
  var amt = +(target - base - others).toFixed(6);
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
    var full = Math.floor(points / 2), half = (points % 2) >= 1;
    var shown = Math.min(full, cap);
    var sp = SPR[cls === 'k-food' ? 'food' : cls === 'k-armorbar' ? 'armor' : 'heart'];
    for (var i = 0; i < shown; i++) el.appendChild(h('sprite', { src: sp[0] }));
    if (half && shown < cap) el.appendChild(h('sprite', { src: sp[1] }));
    if (full > cap) el.appendChild(h('span', { class: 'k-sub', text: '  × ' + fmtInt(full) }));
    if (points <= 0) el.appendChild(h('span', { class: 'k-sub', text: '无' }));
  } };
}

/* 通用"数值型属性"卡片：显示总值（含玩家基础值），改动写回主修饰器 */
function attrCard(o) {
  function total() { return o.base + attrSum(o.type, o.slots()); }
  var card = kCard({ id: 'attr-' + o.type, icon: uiIcon(o.icon, 16), title: o.title, desc: o.desc, comps: ['attribute_modifiers'], value: function () { return fmtNum(+total().toFixed(2)) + (o.unit ? ' ' + o.unit : ''); }, summary: function () { return o.brief ? o.brief(total()) : ''; } }, Ctx);
  var num = kNumber(total(), { min: -1e15, max: 1e15, warnMax: o.warnMax, warnWhy: o.warnWhy, softMin: o.softMin, softMax: o.softMax, step: o.step, dec: o.dec, big: true, unit: o.unit, presets: o.presets, onChange: function (v) { setAttrTotal(o.type, o.slots(), v, o.base, { id: o.id, slot: o.slot() }); } });
  var eff = kEffect('');
  card.body.appendChild(num.el); if (o.extra) card.body.appendChild(o.extra.el);
  card.body.appendChild(eff.el);
  card.live.push(function () { var t = total(); num.set(t); if (o.extra && o.extra.update) o.extra.update(t); eff.set(o.effect ? o.effect(t) : '', o.tone ? o.tone(t) : ''); });
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
  var presets = [];
  TIER_TOOLS.forEach(function (id) { var m = Ctx.protoItem(id, 'attribute_modifiers'); if (!m) return; m.forEach(function (x) { if (x.type === 'minecraft:attack_damage') presets.push({ v: 1 + x.amount, label: nameOfItem(id).replace('剑', '') + ' ' + fmtNum(1 + x.amount) }); }); });
  presets.push({ v: 100, label: '100' }, { v: 1000, label: '1000' }, { v: Reg.attrMax('attack_damage', 2048), label: fmtNum(Reg.attrMax('attack_damage', 2048)) + ' 上限' });
  return attrCard({
    type: 'attack_damage', icon: 'sword', brief: function (t) { return '≈ ' + bigOrNum(+(t / 2).toFixed(1)) + ' 颗心'; }, title: '攻击伤害', desc: '每次完整蓄力攻击造成的伤害（含你自己的 1 点基础伤害）',
    base: Reg.baseAttr('minecraft:player', 'attack_damage', 1), slots: function () { return meleeSlots(); }, slot: function () { return 'mainhand'; }, id: 'minecraft:base_attack_damage',
    warnMax: Reg.attrMax('attack_damage', 2048) + 1, warnWhy: '攻击伤害属性自身的数值上限是 ' + fmtNum(Reg.attrMax('attack_damage', 2048)), softMin: 0, softMax: 30, step: 0.5, unit: '点', presets: presets,
    effect: function (t) { return '相当于 ' + bigOrNum(t / 2) + ' 颗心' + (t >= 20 ? '；一击可以秒杀普通生物（僵尸 20 点生命）' : (t >= 4 ? '；约 ' + Math.ceil(20 / Math.max(t, 1)) + ' 击打死一只僵尸' : '')); },
    tone: function (t) { return t > Reg.attrMax('attack_damage', 2048) + 1 ? 'warn' : ''; }, extra: { el: hearts.el, update: function (t) { hearts.set(Math.max(0, t), 10); } },
  });
};
function bigOrNum(n) { var b = bigText(n); return b ? fmtInt(n) + '（' + b + '）' : fmtNum(n); }

CARDS.attackSpeed = function () {
  return attrCard({
    type: 'attack_speed', icon: 'bolt', brief: function (t) { return t > 0 ? '约 ' + (+(1 / t).toFixed(2)) + ' 秒一刀' : ''; }, title: '攻击速度', desc: '每秒可以完整挥动几次（含基础值 4）',
    base: Reg.baseAttr('minecraft:player', 'attack_speed', 4), slots: function () { return meleeSlots(); }, slot: function () { return 'mainhand'; }, id: 'minecraft:base_attack_speed',
    warnMax: 1024, warnWhy: '攻击速度属性在原版最大 1024', softMin: 0.1, softMax: 4, step: 0.1, unit: '次/秒', dec: 2,
    presets: [{ v: 0.8, label: '0.8 重武器' }, { v: 1, label: '1.0 斧' }, { v: 1.6, label: '1.6 剑' }, { v: 4, label: '4 无冷却' }, { v: 100, label: '100' }],
    effect: function (t) { return t <= 0 ? '⚠ 攻击速度 ≤ 0 时无法完成蓄力攻击' : '蓄力满约需 ' + fmtNum(1 / t) + ' 秒；每秒最多 ' + fmtNum(t) + ' 次完整攻击'; },
    tone: function (t) { return t <= 0 ? 'warn' : ''; },
  });
};

/* 其它属性（自由添加 / 编辑所有修饰器）：折叠态是预览行，点开编辑，可拖拽排序 */
var OPMODES = [{ v: 'add_value', label: '加固定值', title: '直接加上这个数' }, { v: 'add_multiplied_base', label: '加比例', title: '按基础值的比例增加，如 +10%' }, { v: 'add_multiplied_total', label: '总乘比例', title: '最后整体乘以 (1+比例)' }];
function modSummary(m) { var add = m.operation === 'add_value'; var v = add ? m.amount : m.amount * 100; return (v >= 0 ? '+' : '') + bigOrNum(+v.toFixed(3)) + (add ? '' : '%'); }
CARDS.extraAttrs = function (exclude, title) {
  exclude = exclude || [];
  function mine() { return modsList().filter(function (m) { return exclude.indexOf(shortId(m.type)) < 0; }); }
  var card = kCard({ id: 'xattrs', icon: 'sliders', title: title || '其它属性加成', desc: '最大生命、移动速度、击退抗性、攻击距离…… 装备/拿在手里时给你的加成', comps: ['attribute_modifiers'], span: 2, value: function () { var n = mine().length; return n ? n + ' 项' : ''; } }, Ctx);
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
      var val = isAdd ? m.amount : m.amount * 100, headRef = null;
      var num = kNumber(+val.toFixed(4), { min: -1e15, max: 1e15, step: isAdd ? 0.5 : 5, unit: isAdd ? '' : '%', noSlider: true, onChange: function (v) { all[idx].amount = isAdd ? v : v / 100; saveMods(all); } });
      num.el.classList.add('k-xnum'); num.el.addEventListener('click', function (ev) { ev.stopPropagation(); });
      var row = xRow({ grip: true, chevron: true, icon: attrIconEl(t), title: attrName(t), sub: (SLOT_ZH[m.slot || 'any'] || m.slot) + (isAdd ? '' : ' · 比例'), tip: info ? info.desc : '模组属性 ' + m.type, right: num.el, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : idx; draw(); } });
      if (isOpen) {
        var opsel = kSeg(OPMODES, m.operation || 'add_value', function (v) { all[idx].operation = v; saveMods(all); draw(); });
        var slotEntries = SLOTS.map(function (s) { return { v: s, label: SLOT_ZH[s] || s, icon: function () { return uiIcon(ATTR_SLOT_ICON[s] || 'grid', 12); } }; });
        var slotSel = kSelect(slotEntries, m.slot || 'any', function (v) { all[idx].slot = v; saveMods(all); draw(); });
        var rm = kBtn('删除', function () { all.splice(idx, 1); openIdx = -1; saveMods(all); draw(); }, { cls: 'dng', icon: 'trash' });
        row.appendChild(h('div', { class: 'k-xbody x2' }, [h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [uiIcon('sliders', 14), h('span', { text: '计算方式' })]), opsel.el]), h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [uiIcon('pin', 14), h('span', { text: '生效位置' })]), slotSel.el]), h('div', { class: 'x2f' }, [h('span', { class: 'k-sub', text: isAdd ? '' : '比例填 10 表示 +10%' }), rm])]));
      }
      onContext(row, function () { return [{ label: '复制这条', icon: 'copy', run: function () { all.splice(idx + 1, 0, clone(m)); all[idx + 1].id = 'cadeditor:' + t + '_' + (all.length); saveMods(all); draw(); } }, { sep: 1 }, { label: '删除', icon: 'trash', danger: 1, run: function () { all.splice(idx, 1); saveMods(all); draw(); } }]; });
      list.appendChild(row);
    });
    if (!n) list.appendChild(xEmpty('还没有额外的属性加成'));
  }
  kSortable(list, { onMove: function (from, to) { var vis = []; modsList().forEach(function (m, i) { if (exclude.indexOf(shortId(m.type)) < 0) vis.push(i); }); var all = modsList(); var a = vis[from], b = vis[to]; var x = all.splice(a, 1)[0]; all.splice(b, 0, x); openIdx = -1; saveMods(all); draw(); } });
  var add = xAdd('添加属性加成');
  activate(add, function () {
    openAttrPicker({ exclude: exclude, onConfirm: function (ids) {
      var l = modsList(); var slot = Ctx.kind() === 'armor' ? ((Ctx.get('equippable') || {}).slot || 'any') : 'mainhand';
      ids.forEach(function (full) { l.push({ type: full, id: 'cadeditor:' + shortId(full).replace(/[^a-z0-9_./-]/g, '_') + '_' + (l.length + 1), amount: 1, operation: 'add_value', slot: slot }); });
      openIdx = l.length - 1; saveMods(l); draw();
    } });
  });
  card.body.appendChild(h('div', { class: 'k-scrollbox tall' }, [list])); card.body.appendChild(add); draw();
  card.live.push(function () { var key = JSON.stringify(mine()); if (card._key !== key) { card._key = key; if (!list.querySelector('.k-xrow.open')) draw(); } });
  card.body.appendChild(noteEl('属性加成按"装备槽位"生效：拿在主手、穿在身上才有效。模组添加的属性也能在列表里显示和编辑。'));
  return card;
};

/* ==================== 近战 / 武器 ==================== */
CARDS.weapon = function () {
  var card = kCard({ id: 'weapon', icon: 'swords', title: '武器特性', desc: '攻击时对耐久和敌方盾牌的影响', comps: ['weapon'] }, Ctx);
  var v = Ctx.get('weapon');
  if (!v) return enableBox(card, ['这个物品不是武器', '启用后它的攻击会消耗耐久，并可设置破盾效果。'], '设为武器', function () { Ctx.enable('weapon', { item_damage_per_attack: 1, disable_blocking_for_seconds: 0 }, '设为武器'); });
  var per = kNumber(v.item_damage_per_attack === undefined ? 1 : v.item_damage_per_attack, { min: 0, max: 2147483647, softMax: 10, step: 1, presets: [{ v: 0, label: '0 不损耗' }, { v: 1, label: '1 默认' }, { v: 2, label: '2' }], onChange: function (n) { var w = Ctx.get('weapon') || {}; w.item_damage_per_attack = n; Ctx.setSmart('weapon', w, { label: '攻击耐久损耗' }); } });
  var dis = kNumber(v.disable_blocking_for_seconds === undefined ? 0 : v.disable_blocking_for_seconds, { min: 0, max: 3.4e38, softMax: 10, step: 0.5, dec: 1, unit: '秒', presets: [{ v: 0, label: '0 不破盾' }, { v: 5, label: '5 斧头' }, { v: 10, label: '10' }], onChange: function (n) { var w = Ctx.get('weapon') || {}; w.disable_blocking_for_seconds = n; Ctx.setSmart('weapon', w, { label: '破盾时间' }); } });
  card.body.appendChild(fieldRow('每次攻击损耗的耐久', per.el, '0 = 打人不掉耐久'));
  card.body.appendChild(fieldRow('让对方盾牌失效', dis.el, '攻击举盾的玩家时，盾牌无法使用的秒数'));
  card.live.push(function () { var w = Ctx.get('weapon'); if (w) { per.set(w.item_damage_per_attack === undefined ? 1 : w.item_damage_per_attack); dis.set(w.disable_blocking_for_seconds || 0); } });
  return card;
};

CARDS.reach = function () {
  var card = kCard({ id: 'reach', icon: 'target', title: '攻击距离', desc: '站多远能打到敌人（长矛、长柄武器用）', comps: ['attack_range'] }, Ctx);
  var v = Ctx.get('attack_range');
  var base = v || { min_reach: 0, max_reach: 3, min_creative_reach: 0, max_creative_reach: 5, hitbox_margin: 0.3, mob_factor: 1 };
  function put(k) { return function (n) { var o = Ctx.get('attack_range') || clone(base); o[k] = n; Ctx.setSmart('attack_range', o, { label: '攻击距离' }); }; }
  var mx = kNumber(base.max_reach === undefined ? 3 : base.max_reach, { min: 0, max: 1e6, warnMax: 64, warnWhy: '原版上限 64 格', softMax: 10, step: 0.5, dec: 1, unit: '格', presets: [{ v: 3, label: '3 普通' }, { v: 4.5, label: '4.5' }, { v: 6, label: '6' }, { v: 12, label: '12' }, { v: 64, label: '64' }], onChange: put('max_reach') });
  var mn = kNumber(base.min_reach || 0, { min: 0, max: 1e6, warnMax: 64, warnWhy: '原版上限 64 格', softMax: 5, step: 0.5, dec: 1, unit: '格', presets: [{ v: 0, label: '0' }, { v: 2, label: '2 长矛近身盲区' }], onChange: put('min_reach') });
  var hb = kNumber(base.hitbox_margin === undefined ? 0.3 : base.hitbox_margin, { min: 0, max: 1e3, warnMax: 1, warnWhy: '原版范围 0~1', softMax: 1, step: 0.05, dec: 2, unit: '格', onChange: put('hitbox_margin') });
  card.body.appendChild(fieldRow('最远能打到', mx.el, '从你的眼睛算起'));
  card.body.appendChild(fieldRow('最近要隔开', mn.el, '离得太近反而打不到'));
  card.body.appendChild(fieldRow('判定箱放大', hb.el, '数值越大越容易打中'));
  card.live.push(function () { var o = Ctx.get('attack_range'); if (o) { mx.set(o.max_reach === undefined ? 3 : o.max_reach); mn.set(o.min_reach || 0); hb.set(o.hitbox_margin === undefined ? 0.3 : o.hitbox_margin); } });
  if (!v) card.body.appendChild(noteEl('这个物品没有自带的攻击距离，改动任何一项即启用。'));
  return card;
};

CARDS.swing = function () {
  var card = kCard({ id: 'swing', icon: 'wand', title: '挥动动作', desc: '攻击和使用时手臂的动画', comps: ['swing_animation'] }, Ctx);
  var v = Ctx.get('swing_animation') || { type: 'whack', duration: 6 };
  function put(k, val) { var o = Ctx.get('swing_animation') || { type: 'whack', duration: 6 }; o[k] = val; Ctx.setSmart('swing_animation', o, { label: '挥动动作' }); }
  var seg = kSeg([{ v: 'whack', label: '挥砍' }, { v: 'stab', label: '刺击' }, { v: 'none', label: '无动作' }], v.type || 'whack', function (x) { put('type', x); });
  var dur = kNumber(v.duration || 6, { min: 1, max: 2147483647, softMax: 40, step: 1, unit: '刻', presets: [{ v: 6, label: '6 默认' }, { v: 10, label: '10' }, { v: 20, label: '20 慢' }], onChange: function (n) { put('duration', n); } });
  card.body.appendChild(seg.el); card.body.appendChild(fieldRow('动作持续', dur.el, '20 刻 = 1 秒'));
  card.live.push(function () { var o = Ctx.get('swing_animation'); if (o) { seg.set(o.type || 'whack'); dur.set(o.duration || 6); } });
  return card;
};

CARDS.cooldown = function () {
  var card = kCard({ id: 'cooldown', icon: 'clock', title: '使用冷却', desc: '用过一次之后要等多久才能再用（像末影珍珠）', comps: ['use_cooldown'] }, Ctx);
  var v = Ctx.get('use_cooldown');
  if (!v) return enableBox(card, ['没有使用冷却', '启用后，使用一次会进入冷却。'], '加上冷却', function () { Ctx.enable('use_cooldown', { seconds: 1 }, '加上使用冷却'); });
  var sec = kNumber(v.seconds, { min: 0.05, max: 3.4e38, softMax: 60, step: 0.5, dec: 2, unit: '秒', presets: [{ v: 1, label: '1' }, { v: 5, label: '5' }, { v: 15, label: '15' }, { v: 60, label: '60' }], onChange: function (n) { var o = Ctx.get('use_cooldown') || { seconds: 1 }; o.seconds = n; Ctx.setSmart('use_cooldown', o, { label: '使用冷却' }); } });
  card.body.appendChild(sec.el);
  card.body.appendChild(fieldRow('共享冷却组', kInput(v.cooldown_group || '', function (t) { var o = Ctx.get('use_cooldown') || { seconds: 1 }; if (t) o.cooldown_group = t; else delete o.cooldown_group; Ctx.setSmart('use_cooldown', o, { label: '冷却分组' }); }, { placeholder: '留空 = 按物品种类各算各的' }), '填一样的名字，多个物品就共用一个冷却'));
  card.live.push(function () { var o = Ctx.get('use_cooldown'); if (o) sec.set(o.seconds); });
  return card;
};

/* ==================== 工具 ==================== */
var TOOL_GROUPS = [
  { v: '#minecraft:mineable/pickaxe', label: '镐类方块', sub: '石头、矿石、铁砧…' },
  { v: '#minecraft:mineable/axe', label: '斧类方块', sub: '原木、木板、箱子…' },
  { v: '#minecraft:mineable/shovel', label: '锹类方块', sub: '泥土、沙子、雪…' },
  { v: '#minecraft:mineable/hoe', label: '锄类方块', sub: '树叶、干草块、海绵…' },
  { v: 'minecraft:cobweb', label: '蜘蛛网', sub: '' },
  { v: '#minecraft:wool', label: '羊毛', sub: '' },
  { v: '#minecraft:leaves', label: '树叶', sub: '' },
  { v: '#minecraft:sword_efficient', label: '剑能快速砍的方块', sub: '竹子、植物…' },
  { v: '#minecraft:sword_instantly_mines', label: '剑能瞬间挖的方块', sub: '' },
  { v: '#minecraft:incorrect_for_diamond_tool', label: '钻石级也挖不动', sub: '用来限制掉落' },
];
function groupLabel(b) {
  if (typeof b === 'string') { var m = /^#minecraft:incorrect_for_(w+)_tool$/.exec(b); if (m) return ({ wooden: '木', stone: '石', iron: '铁', gold: '金', diamond: '钻石', netherite: '下界合金', copper: '铜' }[m[1]] || m[1]) + '级挖不动的方块'; }
  var key = typeof b === 'string' ? b : (Array.isArray(b) ? b.join(',') : '');
  for (var i = 0; i < TOOL_GROUPS.length; i++) if (TOOL_GROUPS[i].v === key) return TOOL_GROUPS[i].label;
  if (Array.isArray(b)) return b.map(function (x) { return x.replace('minecraft:', ''); }).join('、');
  return typeof b === 'string' ? b.replace('minecraft:', '') : '?';
}
CARDS.tool = function () {
  var card = kCard({ id: 'tool', icon: itemIcon('diamond_pickaxe', 18), title: '挖掘能力', desc: '挖方块有多快、能不能正确掉落、耗多少耐久', comps: ['tool'], span: 2 }, Ctx);
  var v = Ctx.get('tool');
  if (!v) return enableBox(card, ['这个物品不能当工具用', '启用后可以设置它挖哪些方块更快。'], '设为工具', function () { Ctx.enable('tool', { rules: [], default_mining_speed: 1, damage_per_block: 1, can_destroy_blocks_in_creative: true }, '设为工具'); });
  function put(fn, label) { var o = Ctx.get('tool') || { rules: [] }; fn(o); Ctx.setSmart('tool', o, { label: label || '挖掘能力' }); }
  var def = kNumber(v.default_mining_speed === undefined ? 1 : v.default_mining_speed, { min: 0, max: 3.4e38, softMax: 30, step: 0.5, dec: 2, big: true, presets: [{ v: 1, label: '1 徒手' }, { v: 4, label: '4' }, { v: 8, label: '8' }, { v: 12, label: '12' }, { v: 1000, label: '1000 瞬间' }], onChange: function (n) { put(function (o) { o.default_mining_speed = n; }, '默认挖掘速度'); } });
  var dpb = kNumber(v.damage_per_block === undefined ? 1 : v.damage_per_block, { min: 0, max: 2147483647, softMax: 5, step: 1, presets: [{ v: 0, label: '0 不损耗' }, { v: 1, label: '1 默认' }, { v: 2, label: '2' }], onChange: function (n) { put(function (o) { o.damage_per_block = n; }, '挖掘耐久损耗'); } });
  var cc = kToggle(v.can_destroy_blocks_in_creative !== false, function (on) { put(function (o) { o.can_destroy_blocks_in_creative = on; }, '创造模式挖掘'); }, '创造模式下也能用它挖方块（关闭=像剑一样不能）');
  card.body.appendChild(fieldRow('挖其它方块的速度', def.el, '没被下面的规则选中的方块'));
  var rules = h('div', { class: 'k-sortlist' }), openIdx = -1;
  function drawRules() {
    clear(rules);
    var o = Ctx.get('tool') || { rules: [] };
    (o.rules || []).forEach(function (r, i) {
      var isOpen = openIdx === i, spTxt = r.speed === undefined ? '不改速度' : '速度 × ' + bigOrNum(r.speed), dp = r.correct_for_drops === undefined ? '' : (r.correct_for_drops ? ' · 正确掉落' : ' · 无掉落');
      var row = xRow({ grip: true, chevron: true, icon: false, title: groupLabel(r.blocks), sub: spTxt + dp, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; drawRules(); } });
      if (isOpen) {
        var sp = kNumber(r.speed === undefined ? 1 : r.speed, { min: 0.001, max: 3.4e38, softMax: 30, step: 0.5, dec: 2, noSlider: true, unit: '倍', onChange: function (n) { put(function (t) { t.rules[i].speed = n; }); } });
        var drops = kSeg([{ v: 'inherit', label: '默认' }, { v: 'yes', label: '正确掉落' }, { v: 'no', label: '无掉落' }], r.correct_for_drops === undefined ? 'inherit' : (r.correct_for_drops ? 'yes' : 'no'), function (x) { put(function (t) { if (x === 'inherit') delete t.rules[i].correct_for_drops; else t.rules[i].correct_for_drops = x === 'yes'; }); });
        var rm = kBtn('删除这条规则', function () { put(function (t) { t.rules.splice(i, 1); }); openIdx = -1; drawRules(); }, { cls: 'dng', icon: 'trash' });
        row.appendChild(h('div', { class: 'k-xbody' }, [fieldRow('挖这类方块的速度', sp.el, typeof r.blocks === 'string' ? r.blocks : ''), fieldRow('是否正确掉落', drops.el, '「无掉落」= 挖了但不掉东西'), rm]));
      }
      rules.appendChild(row);
    });
    if (!(o.rules || []).length) rules.appendChild(xEmpty('没有挖掘规则：所有方块都按「其它方块」处理'));
  }
  kSortable(rules, { onMove: function (from, to) { put(function (t) { var x = t.rules.splice(from, 1)[0]; t.rules.splice(to, 0, x); }); openIdx = -1; drawRules(); } });
  var add = xAdd('添加挖掘规则');
  activate(add, function () { openTagPicker({ title: '选择挖掘规则针对的方块', tagsReg: 'block', entryReg: 'block', quick: TOOL_GROUPS.map(function (g) { return { v: g.v, label: g.label, sub: g.sub }; }), entryIcon: function (e) { return itemIcon(shortId(e.v), 16); }, onConfirm: function (v) { put(function (t) { t.rules = t.rules || []; t.rules.push({ blocks: v, speed: 4, correct_for_drops: true }); }); openIdx = (Ctx.get('tool').rules || []).length - 1; drawRules(); } }); });
  card.body.appendChild(fieldRow('挖掘规则', h('div', { class: 'k-scrollbox' }, [rules]), '靠前的规则优先，拖 ⋮⋮ 调整顺序；点一条展开编辑'));
  card.body.appendChild(add);
  card.body.appendChild(fieldRow('每挖一个方块损耗', dpb.el, '耐久点数'));
  card.body.appendChild(cc.el);
  drawRules();
  card.live.push(function () { var o = Ctx.get('tool'); if (o) { def.set(o.default_mining_speed === undefined ? 1 : o.default_mining_speed); dpb.set(o.damage_per_block === undefined ? 1 : o.damage_per_block); } });
  return card;
};

/* ==================== 盔甲 ==================== */
var EQ_SLOTS = [{ v: 'head', label: '头部', sub: '头盔', icon: function () { return uiIcon('helmet', 20); } }, { v: 'chest', label: '胸部', sub: '胸甲', icon: function () { return uiIcon('chestplate', 20); } }, { v: 'legs', label: '腿部', sub: '护腿', icon: function () { return uiIcon('leggings', 20); } }, { v: 'feet', label: '脚部', sub: '靴子', icon: function () { return uiIcon('boots', 20); } }, { v: 'offhand', label: '副手', sub: '', icon: function () { return uiIcon('shield', 20); } }, { v: 'body', label: '身体', sub: '马铠等', icon: function () { return uiIcon('paw', 20); } }, { v: 'saddle', label: '鞍', sub: '', icon: function () { return uiIcon('cart', 20); } }, { v: 'mainhand', label: '主手', sub: '', icon: function () { return uiIcon('sword', 20); } }];
var EQ_SOUNDS = [{ v: 'minecraft:item.armor.equip_generic', label: '通用' }, { v: 'minecraft:item.armor.equip_leather', label: '皮革' }, { v: 'minecraft:item.armor.equip_chain', label: '锁链' }, { v: 'minecraft:item.armor.equip_iron', label: '铁' }, { v: 'minecraft:item.armor.equip_gold', label: '金' }, { v: 'minecraft:item.armor.equip_diamond', label: '钻石' }, { v: 'minecraft:item.armor.equip_netherite', label: '下界合金' }, { v: 'minecraft:item.armor.equip_turtle', label: '海龟壳' }, { v: 'minecraft:item.armor.equip_elytra', label: '鞘翅' }];
var EQ_ASSETS = [{ v: 'minecraft:leather', label: '皮革' }, { v: 'minecraft:chainmail', label: '锁链' }, { v: 'minecraft:iron', label: '铁' }, { v: 'minecraft:gold', label: '金' }, { v: 'minecraft:diamond', label: '钻石' }, { v: 'minecraft:netherite', label: '下界合金' }, { v: 'minecraft:copper', label: '铜' }, { v: 'minecraft:turtle_scute', label: '海龟壳' }, { v: 'minecraft:elytra', label: '鞘翅' }];
CARDS.equip = function () {
  var card = kCard({ id: 'equip', icon: 'helmet', title: '穿戴位置与行为', desc: '穿在哪个部位、怎么穿上、穿上后的外观', comps: ['equippable'], span: 2 }, Ctx);
  var v = Ctx.get('equippable');
  if (!v) return enableBox(card, ['这个物品不能穿戴', '启用后可以选择穿戴部位。'], '让它可以穿戴', function () { Ctx.enable('equippable', { slot: 'head' }, '让它可以穿戴'); });
  function put(fn, label) { var o = Ctx.get('equippable') || { slot: 'head' }; fn(o); Ctx.setSmart('equippable', o, { label: label || '穿戴设置' }); }
  var slot = kTiles(EQ_SLOTS.map(function (s) { return { v: s.v, label: s.label, sub: s.sub, icon: s.icon }; }), v.slot, function (x) { put(function (o) { o.slot = x; }, '穿戴部位'); }, { cols: 8 });
  card.body.appendChild(fieldRow('穿在哪里', slot.el));
  var look = kRegSelect({ reg: 'equipment_asset', value: v.asset_id || '', title: '选择穿着外观', empty: '默认（无外观材质）', allowClear: true, fallback: EQ_ASSETS, onChange: function (x) { put(function (o) { if (x) o.asset_id = x; else delete o.asset_id; }, '穿着外观'); } });
  var snd = kSoundField(typeof v.equip_sound === 'string' ? v.equip_sound : 'minecraft:item.armor.equip_generic', function (x) { put(function (o) { o.equip_sound = x; }, '穿戴音效'); });
  card.body.appendChild(h('div', { class: 'k-row wrap' }, [fieldRow('穿着外观', look.el, '穿在身上看起来的材质'), fieldRow('穿戴音效', snd.el)]));
  var T = [['dispensable', '发射器可以给它穿上', true], ['swappable', '手持右键就能换装', true], ['damage_on_hurt', '受伤时消耗耐久', true], ['equip_on_interact', '可以对马、狗等右键穿给它们', false], ['can_be_sheared', '可以用剪刀剪下', false]];
  var togs = h('div', { class: 'k-fxlist' });
  T.forEach(function (t) { var tg = kToggle(v[t[0]] === undefined ? t[2] : v[t[0]], function (on) { put(function (o) { o[t[0]] = on; }); }, t[1]); togs.appendChild(tg.el); });
  card.body.appendChild(togs);
  card.live.push(function () { var o = Ctx.get('equippable'); if (o) slot.set(o.slot); });
  return card;
};

function slotsOfEquip() { var e = Ctx.get('equippable'); return e ? [e.slot, 'armor'] : ['head', 'chest', 'legs', 'feet', 'armor']; }
function slotKey() { var e = Ctx.get('equippable'); return e ? e.slot : 'chest'; }
var PIECE_ID = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
CARDS.armorValue = function () {
  var bar = iconBar('k-armorbar');
  return attrCard({
    type: 'armor', icon: 'chestplate', title: '护甲值', desc: '减少受到的大部分伤害；一点 = 半个护甲图标',
    base: 0, slots: slotsOfEquip, slot: slotKey, id: 'minecraft:armor.' + (PIECE_ID[slotKey()] || 'chestplate'),
    warnMax: 30, warnWhy: '护甲属性在原版最多按 30 点计算', softMin: 0, softMax: 30, step: 1, unit: '点',
    presets: [{ v: 0, label: '0' }, { v: 2, label: '皮 2' }, { v: 5, label: '铁 5' }, { v: 6, label: '钻 6' }, { v: 8, label: '胸甲 8' }, { v: 30, label: '30 上限' }],
    effect: function (t) { return t > 30 ? '⚠ 护甲属性最多按 30 点计算，超出部分原版不再提供防护' : '每点护甲约减少 4% 的物理伤害'; }, tone: function (t) { return t > 30 ? 'warn' : ''; },
    extra: { el: bar.el, update: function (t) { bar.set(Math.max(0, t), 10); } },
  });
};
CARDS.armorToughness = function () {
  return attrCard({
    type: 'armor_toughness', icon: 'shield', title: '盔甲韧性', desc: '面对高伤害攻击时额外减伤',
    base: 0, slots: slotsOfEquip, slot: slotKey, id: 'minecraft:armor.' + (PIECE_ID[slotKey()] || 'chestplate'),
    warnMax: 20, warnWhy: '盔甲韧性在原版最多按 20 点计算', softMin: 0, softMax: 8, step: 0.5, unit: '点', presets: [{ v: 0, label: '0' }, { v: 1, label: '1' }, { v: 2, label: '钻石 2' }, { v: 3, label: '合金 3' }],
    effect: function (t) { return t > 20 ? '⚠ 盔甲韧性最多按 20 点计算' : '韧性越高，被重击时减伤越多'; }, tone: function (t) { return t > 20 ? 'warn' : ''; },
  });
};
CARDS.knockbackResist = function () {
  return attrCard({
    type: 'knockback_resistance', icon: 'anvil', title: '击退抗性', desc: '被击退时抵消多少力道；1 = 完全不被击退',
    base: 0, slots: slotsOfEquip, slot: slotKey, id: 'minecraft:armor.knockback_resistance',
    warnMax: 1, warnWhy: '击退抗性在原版范围是 0~1', softMin: 0, softMax: 1, step: 0.05, dec: 2, unit: '', presets: [{ v: 0, label: '0' }, { v: 0.1, label: '合金 0.1' }, { v: 0.25, label: '0.25' }, { v: 1, label: '1 免疫' }],
    effect: function (t) { return t >= 1 ? '穿满时将完全免疫击退' : '每件提供 ' + Math.round(t * 100) + '% 的击退抵抗，四件叠加'; },
  });
};

var TRIM_MATS = ['amethyst', 'copper', 'diamond', 'emerald', 'gold', 'iron', 'lapis', 'netherite', 'quartz', 'redstone', 'resin'];
var TRIM_ICON = { amethyst: 'amethyst_shard', copper: 'copper_ingot', diamond: 'diamond', emerald: 'emerald', gold: 'gold_ingot', iron: 'iron_ingot', lapis: 'lapis_lazuli', netherite: 'netherite_ingot', quartz: 'quartz', redstone: 'redstone', resin: 'resin_brick' };
CARDS.trim = function () {
  var card = kCard({ id: 'trim', icon: itemIcon('netherite_upgrade_smithing_template', 18), title: '盔甲纹饰', desc: '盔甲表面的图案与颜色', comps: ['trim'], toggle: true, eager: true }, Ctx);
  card.make = function () { Ctx.enable('trim', { material: 'minecraft:gold', pattern: 'minecraft:coast' }, '添加纹饰'); };
  var v = Ctx.get('trim');
  if (!v) { card.el.classList.add('off'); return card; }
  function put(key, x) { var o = Ctx.get('trim') || { material: 'minecraft:gold', pattern: 'minecraft:coast' }; o[key] = x; Ctx.setSmart('trim', o, { label: '盔甲纹饰' }); }
  var picks = h('div', { class: 'trim-picks' });
  function trimPick(label, reg, key) {
    var art = h('div', { class: 'trim-pick-image' }, [refIcon(reg, v[key] || '', 32)]);
    var select = kRegSelect({ reg: reg, value: v[key] || '', title: '选择纹饰' + label, empty: '（未选择）', onChange: function (x) { if (x) { put(key, x); clear(art); art.appendChild(refIcon(reg, x, 32)); } } });
    return h('div', { class: 'trim-pick' }, [art, h('div', { class: 'k-sub', text: label }), select.el]);
  }
  picks.appendChild(trimPick('材料', 'trim_material', 'material'));
  picks.appendChild(trimPick('图案', 'trim_pattern', 'pattern'));
  card.body.appendChild(picks);
  return card;
};

CARDS.dye = function () {
  var card = kCard({ id: 'dye', icon: 'palette', title: '染色', desc: '皮革类物品的颜色（点色块，或输入 #RRGGBB）', comps: ['dyed_color'] }, Ctx);
  var v = Ctx.get('dyed_color');
  var col = kColor(typeof v === 'number' ? v : (Array.isArray(v) ? ((Math.round(v[0] * 255) << 16) | (Math.round(v[1] * 255) << 8) | Math.round(v[2] * 255)) : 0xA06540), function (c) { Ctx.set('dyed_color', c, { label: '染色' }); });
  card.body.appendChild(col.el);
  card.live.push(function () { var x = Ctx.get('dyed_color'); if (typeof x === 'number') col.set(x); });
  card.body.appendChild(noteEl('皮革默认色是棕色 #A06540。只有可染色的物品（皮革装备、皮革马铠）会显示这个颜色。'));
  return card;
};

CARDS.glider = function () {
  return kCard({ id: 'glider', icon: 'feather', title: '滑翔', desc: '像鞘翅一样，穿着时按空格可以滑翔', comps: ['glider'], bare: true, toggle: { get: function () { return Ctx.has('glider'); }, set: function (on) { Ctx.setPresence('glider', on, { label: on ? '允许滑翔' : '取消滑翔' }); } } }, Ctx);
};

regEnumTable('equipment_slot', EQ_SLOTS, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, sub: '', icon: function () { return uiIcon('grid', 20); } }; });
regEnumTable('attribute_operation', OPMODES, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, title: id }; });
