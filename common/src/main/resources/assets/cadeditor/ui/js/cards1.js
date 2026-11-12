/* 卡片库 · 第一部分：绑定上下文、外观 / 耐久 / 附魔卡片
   每张卡片：显示物品当前值（含默认值），改动即写入覆盖，右上"恢复默认"回到物品原型。
   原则：数值可直接输入、原版上限只提醒不阻止、列表可拖拽排序、折叠态=预览，展开态=编辑。 */

/* ---------- 绑定上下文 ---------- */
var Ctx = {
  doc: function () { return Store.doc(); },
  get: function (cid) { return effectiveGet(Store.doc(), cid); },
  proto: function (cid) { componentRead(cid); var v = protoOf(Store.doc().id)[cid]; return v === undefined ? undefined : clone(v); },
  has: function (cid) { var source = effectiveSource(Store.doc(), cid); return !!source && source[cid] !== undefined; },
  modified: function (cid) { return intentOf(Store.doc(), cid) !== 'inherit'; },
  set: function (cid, val, o) { o = o || {}; Store.set(cid, val, { key: 'k-' + cid + (o.key || ''), structural: false, label: o.label }); },
  /* 和原型一样就不写覆盖 */
  setSmart: function (cid, val, o) {
    o = o || {};
    var p = protoOf(Store.doc().id)[cid];
    if (p !== undefined && deepEq(p, val)) { if (intentOf(Store.doc(), cid) !== 'inherit') Store.inherit(cid, { structural: false, key: 'k-' + cid + (o.key || ''), label: o.label }); }
    else Ctx.set(cid, val, o);
  },
  /* 启用一个原本没有的功能：写入初始值并重建页面（显示出完整控件） */
  enable: function (cid, val, label) { Store.set(cid, val, { key: 'k-en-' + cid, structural: true, label: label }); },
  reset: function (cid) { Store.inherit(cid); },
  /* 去掉一个功能：原型有就屏蔽（!组件），没有就恢复 */
  disable: function (cid, o) { o = o || {}; if ((!Reg.preview() && Reg.defaultsOf(Store.doc().id) === null) || protoOf(Store.doc().id)[cid] !== undefined) Store.remove(cid, { structural: o.structural !== false, key: 'k-' + cid }); else Store.inherit(cid, { structural: o.structural !== false, key: 'k-' + cid }); },
  setPresence: function (cid, on, o) {
    var p = protoOf(Store.doc().id)[cid];
    if (on) { if (p !== undefined) Store.inherit(cid, { structural: false, key: 'k-' + cid }); else Ctx.set(cid, {}, o); }
    else Ctx.disable(cid, { structural: false });
  },
  id: function () { return shortId(Store.doc().id); },
  kind: function () { return kindOfItem(Store.doc().id); },
  protoItem: function (item, cid) { var v = protoOf(item)[cid]; return v === undefined ? undefined : clone(v); },
};

/* ---------- 小工具 ---------- */
/* 字段名前面的小图标（按名字匹配；没有就不显示） */
var LABEL_ICON = I18n.keyed({ "cadeditor.ui.cards2.009e14dea9": 'image', "cadeditor.ui.cards2.c30a9e617f": 'music', "cadeditor.ui.cards3.473400815c": 'music', "cadeditor.ui.cards3.cc05a1373c": 'flask', "cadeditor.ui.cards3.a6bbde2603": 'palette', "cadeditor.ui.cards3.9a71571acf": 'flask', "cadeditor.ui.cards3.06c7b1b4c6": 'luck', "cadeditor.ui.cards3.770a0d9868": 'flask', "cadeditor.ui.cards3.223dcf8fc8": 'flask', "cadeditor.ui.cards3.5e9d80d0e3": 'music', "cadeditor.ui.cards3.7edac2a254": 'compass', "cadeditor.ui.cards3.be4d66234f": 'clock', "cadeditor.ui.cards3.be37d84119": 'play', "cadeditor.ui.cards2.6a40bd280d": 'helmet', "cadeditor.ui.screens.4498621999": 'user', "cadeditor.ui.structure.e3a916553b": 'pin', "cadeditor.ui.cards2.9fbb8e9f1a": 'image', "cadeditor.ui.picker.2753766d18": 'cube', "cadeditor.ui.world.4fa164bacd": 'globe', "cadeditor.ui.spawn.20afdf83d8": 'code', "cadeditor.ui.structure.8b51846f11": 'code', "cadeditor.ui.structure.846e3f53c6": 'clock', "cadeditor.ui.structure.8d96165176": 'clock', "cadeditor.ui.labels.ba40014ff4": 'cube', "cadeditor.ui.spawn.9a63c2e6fc": 'chest', "cadeditor.ui.world.30eca98dc1": 'refresh', "cadeditor.ui.world.43d4f9d7c6": 'key', "cadeditor.ui.world.89ff95dfe7": 'user', "cadeditor.ui.world.ff6519c3a9": 'image', "cadeditor.ui.cards2.09e4cdfa68": 'feather', "cadeditor.ui.world.6177b7d979": 'user', "cadeditor.ui.world.2d270b6ce4": 'cube', "cadeditor.ui.world.6a24b14f33": 'cube', "cadeditor.ui.world.1cf1d4d0b2": 'cube', "cadeditor.ui.picker.740f5e8102": 'cube', "cadeditor.ui.world.5a8114a4b3": 'arrow', "cadeditor.ui.pages.5e29d121dd": 'layers', "cadeditor.ui.world.7e2d0e09b4": 'clock', "cadeditor.ui.world.c0e4eb276e": 'hourglass', "cadeditor.ui.world.4fa94f8eab": 'pin', "cadeditor.ui.world.df164552a7": 'map', "cadeditor.ui.world.0798f8c3df": 'refresh', "cadeditor.ui.world.043d63e345": 'target', "cadeditor.ui.world.63fa03f737": 'magnet', "cadeditor.ui.structure.81fd89a2c6": 'compass', "cadeditor.ui.structure.9a2e6b9ed4": 'compass', "cadeditor.ui.structure.cd1a6f7dc4": 'compass', "cadeditor.ui.structure.a422843c76": 'compass', "cadeditor.ui.structure.fa764a2108": 'compass' });
/* 选择类字段（音效 / 注册表条目）：左边是选中的名称，下面一行小字是字段名；右边是 试听 + 选择 按钮 */
function pickRow(label, node, sub, ico) {
  var kids = Array.prototype.slice.call(node.children), isSnd = /snd-field/.test(node.className || ''), main, extra = null, right = [];
  if (isSnd) { main = kids[1]; extra = kids[2]; right = [kids[0], kids[4]]; }
  else { var tx = kids[0]; main = tx.children[0]; extra = tx.children[1]; right = kids.slice(1); }
  var cap = h('div', { class: 'pr-k' }, [h('span', { text: label }), extra || null]);
  return h('div', { class: 'k-fld pickrow', title: sub || '' }, [ico ? h('div', { class: 'pr-i' }, [ico]) : null, h('div', { class: 'pr-l' }, [main, cap]), h('div', { class: 'pr-r' }, right)]);
}
function fieldRow(label, node, sub) {
  var ico = typeof label === 'string' && LABEL_ICON[label] ? uiIcon(LABEL_ICON[label], 14) : null;
  if (typeof label === 'string' && node && /snd-field|rs-field/.test(node.className || '')) return pickRow(label, node, sub, ico);
  var cn = (node && node.className) || '', wide = false;
  if (/k-tiles|k-effects|k-chips|k-cgrid|k-sortlist|k-seg|k-scrollbox|ed-snbt|textarea/.test(cn)) wide = true;
  else if (/k-num/.test(cn) && (node.querySelector('.k-slider') != null || node.querySelector('.k-presets') != null)) wide = true;
  return h('div', { class: 'k-fld' + (wide ? ' wide' : '') + (ico ? ' ic' : ''), title: sub || '' }, [h('div', { class: 'lb' }, [ico, (typeof label === 'string' ? h('span', { class: 'lt', text: label }) : label), sub ? h('span', { class: 'k-sub', text: '  ' + sub }) : null]), node]);
}
function secTitle(text, sub) { return h('div', { class: 'ed-sec' }, [h('b', { text: text }), sub ? h('small', { text: sub }) : null]); }
function presetsFromItems(ids, cid, prop, fmt) {
  var out = [];
  ids.forEach(function (id) {
    var v = Ctx.protoItem(id, cid); if (v === undefined) return;
    if (prop) v = v[prop];
    if (typeof v !== 'number') return;
    out.push({ v: v, label: nameOfItem(id).replace(/剑|镐|斧|锹|锄|头盔|胸甲|护腿|靴子/g, '') + ' ' + (fmt ? fmt(v) : fmtNum(v)), title: I18n.t("cadeditor.ui.cards1.af378dda62", (nameOfItem(id))) });
  });
  return out;
}
var TIER_TOOLS = ['wooden_sword', 'stone_sword', 'copper_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword'];
function codecField(value, cid, key, preview) { return value && value[key] !== undefined ? value[key] : Reg.codecDefault(cid, key, preview); }
function codecToggle(value, change, label) { var t = kToggle(value === true, change, label); if (value === undefined) setTip(t.el, I18n.t("cadeditor.ui.cards1.c82708a46e")); return t; }
/* Unknown defaults stay blank and manually editable; no +/- operation can silently start at an invented game default. */
function codecNumber(value, options) {
  return kNumber(value, options);
}
/* 功能还没开：这一行只剩标题和右侧的开关，打开开关才会展开设置 */
function enableBox(card, text, label, make) {
  card.el.classList.add('off');
  var waiting = !Reg.preview() && Reg.defaultsOf(Ctx.doc().id) === null;
  function defaultNote() { return Reg.defs[Reg.full(Ctx.doc().id)] === false ? I18n.t("cadeditor.ui.cards1.c1bc821f27") : I18n.t("cadeditor.ui.cards1.9766a7da0d"); }
  card.make = waiting ? function () { if (Reg.defaultsOf(Ctx.doc().id) === null) { toast(defaultNote(), 'warn'); return; } make(); } : make;
  card.offHint = waiting ? defaultNote() : text[1];
  if (waiting) card.body.appendChild(kHint(card.offHint));
  return card;
}
function itemTone() { var r = Ctx.get('rarity') || 'common'; return { common: '#FFFFFF', uncommon: '#FFFF55', rare: '#55FFFF', epic: '#FF55FF' }[r] || '#FFFFFF'; }

/* ---------- 附魔图标映射（用原版物品图当附魔图标） ---------- */
var ENCH_ICON = { sharpness: 'diamond_sword', smite: 'bone', bane_of_arthropods: 'spider_eye', knockback: 'slime_ball', fire_aspect: 'blaze_powder', looting: 'emerald', sweeping_edge: 'iron_sword', efficiency: 'diamond_pickaxe', silk_touch: 'cobweb', unbreaking: 'obsidian', fortune: 'diamond', mending: 'experience_bottle', protection: 'iron_chestplate', fire_protection: 'magma_cream', feather_falling: 'feather', blast_protection: 'tnt', projectile_protection: 'arrow', respiration: 'turtle_helmet', aqua_affinity: 'prismarine_shard', thorns: 'cactus', depth_strider: 'iron_boots', frost_walker: 'blue_ice', soul_speed: 'soul_sand', swift_sneak: 'leather_leggings', power: 'bow', punch: 'piston', flame: 'fire_charge', infinity: 'spectral_arrow', multishot: 'crossbow', quick_charge: 'clock', piercing: 'tipped_arrow', loyalty: 'lead', riptide: 'trident', channeling: 'lightning_rod', impaling: 'nautilus_shell', luck_of_the_sea: 'fishing_rod', lure: 'string', binding_curse: 'chain', vanishing_curse: 'phantom_membrane', density: 'mace', breach: 'mace', wind_burst: 'wind_charge', lunge: 'iron_spear' };

var CARDS = {};

/* ==================== 外观 ==================== */
CARDS.name = function () {
  var card = kCard({ id: 'name', icon: 'tag', title: I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), desc: I18n.t("cadeditor.ui.cards1.c7465a8983"), comps: ['custom_name'], span: 2, summary: function () { var v = Ctx.get('custom_name'); var r = v === undefined ? null : tcRuns(v); return r ? r.runs.map(function (x) { return x.text; }).join('') : ''; } }, Ctx);
  var cur = Ctx.get('custom_name');
  var t = kRich(cur === undefined ? '' : cur, {
    placeholder: I18n.t("cadeditor.ui.cards1.05a896a304", (nameOfItem(Ctx.doc().id))), def: { color: itemTone(), italic: true, placeholder: I18n.t("cadeditor.ui.cards1.6ce352f312", (nameOfItem(Ctx.doc().id))) },
    onChange: function (v, empty) {
      if (empty) { if (Ctx.modified('custom_name')) Store.inherit('custom_name', { structural: false, key: 'k-custom_name' }); }
      else Ctx.set('custom_name', v, { label: I18n.t("cadeditor.ui.cards1.88f4625ead") });
    },
  });
  card.body.appendChild(t.el);
  return card;
};

CARDS.lore = function () {
  var card = kCard({ id: 'lore', icon: 'list', title: I18n.t("cadeditor.ui.cards1.a75800abd2"), desc: I18n.t("cadeditor.ui.cards1.0b54d45be3"), comps: ['lore'], span: 2, value: function () { var l = Ctx.get('lore'); return l && l.length ? I18n.t("cadeditor.ui.cards1.3708d3e1f1", (l.length)) : ''; } }, Ctx);
  var list = h('div', { class: 'k-sortlist' });
  var lines = Ctx.get('lore') || [];
  function commit() { Ctx.setSmart('lore', clone(lines), { label: I18n.t("cadeditor.ui.cards1.50f0846e8b") }); }
  function move(i, j) { if (j < 0 || j >= lines.length) return; var x = lines.splice(i, 1)[0]; lines.splice(j, 0, x); commit(); draw(); }
  function draw() {
    clear(list);
    lines.forEach(function (line, i) {
      var r = kRich(line, { compact: true, openKey: 'lore-' + i, placeholder: I18n.t("cadeditor.ui.cards1.a193acc89a", (i + 1)), def: { color: '#AA00AA', italic: true, placeholder: I18n.t("cadeditor.ui.cards1.1ec2d3ade7") }, onChange: function (v) { lines[i] = v; commit(); } });
      var rm = h('div', { class: 'k-mini del', text: '×', title: I18n.t("cadeditor.ui.cards1.5969c695db") }); activate(rm, function () { lines.splice(i, 1); commit(); draw(); });
      var row = h('div', { class: 'k-lrow k-srow' }, [kGrip(), h('span', { class: 'ix', text: String(i + 1) }), h('div', { class: 'grow' }, [r.el]), rm]);
      onContext(row, function () { return [{ label: I18n.t("cadeditor.ui.cards1.f853a70b12"), icon: 'up', dis: i === 0, run: function () { move(i, i - 1); } }, { label: I18n.t("cadeditor.ui.cards1.e75e8b4e5c"), icon: 'down', dis: i === lines.length - 1, run: function () { move(i, i + 1); } }, { label: I18n.t("cadeditor.ui.cards1.6c5b7ad884"), icon: 'copy', run: function () { lines.splice(i + 1, 0, clone(line)); commit(); draw(); } }, { label: I18n.t("cadeditor.ui.cards1.ff88720554"), run: function () { lines.splice(i, 0, ''); commit(); draw(); } }, { sep: 1 }, { label: I18n.t("cadeditor.ui.common.delete"), icon: 'trash', danger: 1, run: function () { lines.splice(i, 1); commit(); draw(); } }]; });
      list.appendChild(row);
    });
    if (!lines.length) list.appendChild(xEmpty(I18n.t("cadeditor.ui.cards1.b6b9d30be0")));
  }
  kSortable(list, { onMove: function (from, to) { var x = lines.splice(from, 1)[0]; lines.splice(to, 0, x); commit(); draw(); } });
  var add = xAdd(I18n.t("cadeditor.ui.cards1.754ae9e271"));
  activate(add, function () { lines.push(''); commit(); draw(); UIOpen['lore-' + (lines.length - 1)] = true; draw(); });
  var scroll = h('div', { class: 'k-scrollbox tall' }, [list]);
  card.body.appendChild(scroll); card.body.appendChild(add); draw();
  card.live.push(function () { var l = Ctx.get('lore') || []; if (!deepEq(l, lines)) { lines = l; draw(); } });
  return card;
};

function cardHeadSelect(card, options, get, set, free) {
  var head = card.el.querySelector('.k-chead'), slot = h('div', { class: 'card-head-select' });
  card.onHead = function () { return true; };
  head.appendChild(slot);
  function paint() { clear(slot); slot.appendChild(combo({ options: options, value: get(), free: !!free, placeholder: I18n.t("cadeditor.ui.cards1.03a85c0a81"), onPick: set })); }
  card.live.push(paint); paint(); return card;
}
CARDS.rarity = function () {
  var card = kCard({ id: 'rarity', icon: 'star', title: I18n.t("cadeditor.ui.cards1.5309323295"), desc: I18n.t("cadeditor.ui.cards1.77a2c7d607"), comps: ['rarity'], eager: true, bare: true, cls: 'head-select-card' }, Ctx);
  var tones = { common: '#ffffff', uncommon: '#ffff55', rare: '#55ffff', epic: '#ff55ff' };
  var T = Labels.rarity.map(function (r) { return Object.assign({}, r, {sub:r.title, color:tones[r.v]}); });
  return cardHeadSelect(card, function () { return Reg.enumOptions('rarity', T); }, function () { return Ctx.get('rarity') || ''; }, function (v) { Ctx.setSmart('rarity', v, { label: I18n.t("cadeditor.ui.cards1.5309323295") }); }, true);
};

CARDS.glint = function () {
  var card = kCard({ id: 'glint', icon: 'sparkle', title: I18n.t("cadeditor.ui.cards1.5dbcf4984d"), desc: I18n.t("cadeditor.ui.cards1.0d37db8f4a"), comps: ['enchantment_glint_override'], eager: true, bare: true, cls: 'head-select-card' }, Ctx);
  function cur() { var v = Ctx.get('enchantment_glint_override'); return v === undefined ? 'auto' : (v ? 'on' : 'off'); }
  var T = [{ v: 'auto', label: I18n.t("cadeditor.ui.cards1.7eb336e42c"), sub: I18n.t("cadeditor.ui.cards1.cdd1ea7455"), icon: function () { return uiIcon('refresh', 16); } }, { v: 'on', label: I18n.t("cadeditor.ui.cards1.dc9cd17295"), sub: I18n.t("cadeditor.ui.cards1.ec8112bf20"), icon: function () { return uiIcon('sparkle', 16); } }, { v: 'off', label: I18n.t("cadeditor.ui.cards1.6c05451e38"), sub: I18n.t("cadeditor.ui.cards1.24c10e6af9"), icon: function () { return uiIcon('eye_off', 16); } }];
  return cardHeadSelect(card, T, cur, function (v) {
    if (v === 'auto') { if (Ctx.modified('enchantment_glint_override')) Store.inherit('enchantment_glint_override', { structural: false, key: 'k-glint' }); }
    else Ctx.setSmart('enchantment_glint_override', v === 'on', { label: I18n.t("cadeditor.ui.cards1.5dbcf4984d") });
  });
};

var HIDE_PARTS = [['enchantments', I18n.t("cadeditor.ui.cards1.5cfebda177")], ['attribute_modifiers', I18n.t("cadeditor.ui.cards1.da654dc4b2")], ['unbreakable', I18n.t("cadeditor.ui.cards1.f1e99743e4")], ['dyed_color', I18n.t("cadeditor.ui.cards1.0e694eeb27")], ['trim', I18n.t("cadeditor.ui.cards1.6bd90f70c2")], ['stored_enchantments', I18n.t("cadeditor.ui.cards1.7a28091cfc")], ['potion_contents', I18n.t("cadeditor.ui.cards1.c6e6590c45")], ['jukebox_playable', I18n.t("cadeditor.ui.cards1.1bddc77c24")]];
CARDS.tooltip = function () {
  var card = kCard({ id: 'tooltip', icon: 'eye_off', title: I18n.t("cadeditor.ui.cards1.8ff91d4ca8"), desc: I18n.t("cadeditor.ui.cards1.1efe8b1398"), comps: ['tooltip_display'] }, Ctx);
  var v = Ctx.get('tooltip_display') || {};
  function save() { var o = {}; if (v.hide_tooltip) o.hide_tooltip = true; if (v.hidden_components && v.hidden_components.length) o.hidden_components = v.hidden_components; Ctx.setSmart('tooltip_display', o, { label: I18n.t("cadeditor.ui.cards1.8ff91d4ca8") }); }
  var tg = kToggle(!!v.hide_tooltip, function (on) { v.hide_tooltip = on; save(); }, I18n.t("cadeditor.ui.cards1.1e24a72ea8"));
  var chips = h('div', { class: 'k-chips' });
  function paint() {
    clear(chips);
    /* 常用的几项直接给按钮；其余的（含模组组件）选中后也以按钮出现，用“＋其他组件”从游戏的组件注册表里挑或手输 */
    var shown = HIDE_PARTS.filter(function (p) { return Reg.preview() || Reg.entryState('data_component_type', p[0]) === true; }).map(function (p) { return ['minecraft:' + p[0], p[1]]; });
    (v.hidden_components || []).forEach(function (id) {
      if (shown.some(function (x) { return x[0] === id; })) return;
      var zh = null; EDATA.comps.forEach(function (c) { if ('minecraft:' + c.id === id) zh = c.name; });
      shown.push([id, zh || humanId(shortId(id))]);
    });
    shown.forEach(function (p) {
      var id = p[0], on = (v.hidden_components || []).indexOf(id) >= 0;
      var c = h('div', { class: 'k-chip' + (on ? ' on' : ''), text: p[1], title: id });
      activate(c, function () { var l = v.hidden_components || []; var i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else l.push(id); v.hidden_components = l; save(); paint(); });
      chips.appendChild(c);
    });
    var more = h('div', { class: 'k-chip', text: I18n.t("cadeditor.ui.cards1.ddd5ea71e3") });
    activate(more, function () {
      openRegPick({ reg: 'data_component_type', title: I18n.t("cadeditor.ui.cards1.963c1996ff"), onPick: function (id) {
        id = Reg.full(id); var l = v.hidden_components || [];
        if (l.indexOf(id) < 0) l.push(id);
        v.hidden_components = l; save(); paint();
      } });
    });
    chips.appendChild(more);
  }
  paint();
  card.body.appendChild(tg.el); card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards1.cf1206fa7f"), chips, I18n.t("cadeditor.ui.cards1.ea5c3c28b1")));
  return card;
};

CARDS.model = function () {
  var card = kCard({ id: 'model', icon: 'image', title: I18n.t("cadeditor.ui.cards1.40fe379360"), desc: I18n.t("cadeditor.ui.cards1.69e5f7520f"), comps: ['item_model'], eager: true, bare: true, cls: 'head-select-card' }, Ctx);
  var holder = h('div', { class: 'k-row card-head-select' });
  function draw() {
    clear(holder);
    var m = Ctx.get('item_model'), id = m ? shortId(m) : Ctx.id();
    var btn = h('div', { class: 'k-btn' }, [itemIcon(id, 20), h('span', { class: 'hd-model', text: nameOfItem(id), title: nameOfItem(id) + '\n' + fullId(id) }), uiIcon('down', 10)]);
    activate(btn, function () {
      pickItem(btn, function (pid) { Ctx.setSmart('item_model', fullId(pid), { label: I18n.t("cadeditor.ui.cards1.55d34f7d99") }); draw(); },
        { reset: Ctx.modified('item_model') ? { label: I18n.t("cadeditor.ui.common.reset"), fn: function () { Ctx.reset('item_model'); draw(); } } : null });   // 「恢复默认」放在选择窗右下角，卡片头部不再占位
    });
    holder.appendChild(btn);
  }
  draw(); card.live.push(draw);
  var hd = card.el.firstChild; hd.appendChild(holder); card.el.classList.add('flat'); card.onHead = function () { return true; };
  return card;
};

/* ==================== 耐久与堆叠 ==================== */
function hitsText(maxd) { return I18n.t("cadeditor.ui.cards1.362317635c", (fmtInt(maxd))); }

CARDS.maxDamage = function () {
  var card = kCard({ id: 'maxdmg', icon: 'shield', title: I18n.t("cadeditor.ui.cards1.5ac8daecfb"), desc: I18n.t("cadeditor.ui.cards1.3e893c183f"), comps: ['max_damage'], value: function () { var v = Ctx.get('max_damage'); return v === undefined ? '' : I18n.t("cadeditor.ui.cards1.39a8d2770a", (fmtInt(v))); } }, Ctx);
  if (!Ctx.has('max_damage')) {
    return enableBox(card, [I18n.t("cadeditor.ui.cards1.b5926cedc1"), I18n.t("cadeditor.ui.cards1.c62a13e544")], I18n.t("cadeditor.ui.cards1.61e9f21a4d"), function () { Store.set('max_damage', 500, { key: 'k-md', structural: false }); Store.set('max_stack_size', 1, { key: 'k-ms', structural: true }); });
  }
  var num = kNumber(Ctx.get('max_damage'), { min: 1, max: 2147483647, softMax: 4000, step: 1, big: true, presets: presetsFromItems(TIER_TOOLS, 'max_damage'), onChange: function (v) { Ctx.setSmart('max_damage', v, { label: I18n.t("cadeditor.ui.cards1.5ac8daecfb") }); } });
  var eff = kEffect('');
  card.body.appendChild(num.el); card.body.appendChild(eff.el);
  card.live.push(function () {
    var v = Ctx.get('max_damage'); if (v === undefined) return; num.set(v);
    var ub = (Ctx.get('enchantments') || {})['minecraft:unbreaking'];
    eff.set(hitsText(v) + (ub ? I18n.t("cadeditor.ui.cards1.0749495f91", (levelText(ub)), (fmtInt(v * (ub + 1)))) : ''));
  });
  return card;
};

CARDS.damage = function () {
  var card = kCard({ id: 'damage', icon: 'hammer', title: I18n.t("cadeditor.ui.cards1.79281cbf1f"), desc: I18n.t("cadeditor.ui.cards1.85971d66bf"), comps: ['damage'] }, Ctx);
  var maxd = Ctx.get('max_damage');
  if (typeof maxd !== 'number') { card.body.appendChild(kHint(I18n.t("cadeditor.ui.cards1.2db9878a89"))); return card; }
  var linkedMax = null;
  var num = kNumber(maxd - (Ctx.get('damage') || 0), { min: 0, max: 2147483647, softMax: maxd, step: 1, big: true, presets: [{ v: maxd, label: I18n.t("cadeditor.ui.cards1.4ada940d7b") }, { v: Math.max(1, Math.round(maxd / 2)), label: I18n.t("cadeditor.ui.cards1.0d16ffcc87") }, { v: 1, label: I18n.t("cadeditor.ui.cards1.e366482076") }], onChange: function (v) {
    var currentMax = Ctx.get('max_damage');
    if (v > currentMax) { linkedMax = v; Store.setLinked({ max_damage: v, damage: 0 }, I18n.t("cadeditor.ui.cards1.520bfed19e")); }
    else { Ctx.setSmart('damage', currentMax - v, { label: I18n.t("cadeditor.ui.cards1.79281cbf1f") }); }
  } });
  var bar = h('div', { class: 'k-meter' }, [h('i', {})]);
  var eff = kEffect('');
  card.body.appendChild(num.el); card.body.appendChild(bar); card.body.appendChild(eff.el);
  card.live.push(function () {
    var m = Ctx.get('max_damage'), d = Ctx.get('damage') || 0;
    if (typeof m !== 'number') return;
    var r = m - d, ratio = Math.max(0, Math.min(1, r / m));
    num.set(r); bar.firstChild.style.width = (ratio * 100) + '%'; bar.className = 'k-meter' + (ratio < 0.15 ? ' bad' : ratio < 0.4 ? ' warn' : '');
    var linkedMsg = linkedMax === m && diffDoc(Store.doc()).some(function (x) { return x.cid === 'max_damage'; }) ? I18n.t("cadeditor.ui.cards1.6b687bcd1f", (fmtInt(m))) : '';
    eff.set(linkedMsg + (r <= 0 ? I18n.t("cadeditor.ui.cards1.82db08bd77") : I18n.t("cadeditor.ui.cards1.9c49bb2ccc", (fmtInt(r)), (fmtInt(m)), (Math.round(ratio * 100)))), r <= 0 ? 'bad' : '');
  });
  return card;
};

CARDS.unbreakable = function () {
  return kCard({ id: 'unbr', icon: 'lock', title: I18n.t("cadeditor.ui.cards1.f1e99743e4"), desc: I18n.t("cadeditor.ui.cards1.fd9399228b"), comps: ['unbreakable'], bare: true, toggle: { get: function () { return Ctx.has('unbreakable'); }, set: function (on) { Ctx.setPresence('unbreakable', on, { label: on ? I18n.t("cadeditor.ui.cards1.bf383dc642") : I18n.t("cadeditor.ui.cards1.ec19500d30") }); } } }, Ctx);
};

var TAG_NAMES = { '#minecraft:diamond_tool_materials': I18n.t("cadeditor.ui.cards1.8f6c204b25"), '#minecraft:iron_tool_materials': I18n.t("cadeditor.ui.cards1.67e3990ba8"), '#minecraft:stone_tool_materials': I18n.t("cadeditor.ui.cards1.f3ace70558"), '#minecraft:wooden_tool_materials': I18n.t("cadeditor.ui.cards1.5bd56b437a"), '#minecraft:gold_tool_materials': I18n.t("cadeditor.ui.cards1.b3d3135fda"), '#minecraft:netherite_tool_materials': I18n.t("cadeditor.ui.cards1.69ae06ab17"), '#minecraft:copper_tool_materials': I18n.t("cadeditor.ui.cards1.1b150572b8"), '#minecraft:repairs_leather_armor': I18n.t("cadeditor.ui.cards1.578a853e50"), '#minecraft:repairs_chain_armor': I18n.t("cadeditor.ui.cards1.67e3990ba8"), '#minecraft:repairs_iron_armor': I18n.t("cadeditor.ui.cards1.67e3990ba8"), '#minecraft:repairs_gold_armor': I18n.t("cadeditor.ui.cards1.b3d3135fda"), '#minecraft:repairs_diamond_armor': I18n.t("cadeditor.ui.cards1.8f6c204b25"), '#minecraft:repairs_netherite_armor': I18n.t("cadeditor.ui.cards1.69ae06ab17"), '#minecraft:repairs_turtle_helmet': I18n.t("cadeditor.ui.cards1.c742b9c3ec"), '#minecraft:planks': I18n.t("cadeditor.ui.cards1.5bd56b437a") };
CARDS.repair = function () {
  var card = kCard({ id: 'repair', icon: 'anvil', title: I18n.t("cadeditor.ui.cards1.4ff76c115c"), desc: I18n.t("cadeditor.ui.cards1.baa1c28c1a"), comps: ['repair_cost', 'repairable'], span: 2 }, Ctx);
  var cost = kNumber(Ctx.get('repair_cost') || 0, { min: 0, max: 2147483647, softMax: 40, step: 1, presets: [{ v: 0, label: I18n.t("cadeditor.ui.cards1.d91bf90405") }, { v: 1, label: '1' }, { v: 3, label: '3' }, { v: 7, label: '7' }, { v: 15, label: '15' }, { v: 31, label: '31' }], onChange: function (v) { Ctx.setSmart('repair_cost', v, { label: I18n.t("cadeditor.ui.cards1.6398233929") }); } });
  var eff = kEffect('');
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards1.6398233929"), cost.el, I18n.t("cadeditor.ui.cards1.0fda4ff108")));
  card.body.appendChild(eff.el);
  card.live.push(function () { var v = Ctx.get('repair_cost') || 0; cost.set(v); eff.set(v >= 39 ? I18n.t("cadeditor.ui.cards1.b363ce0586") : I18n.t("cadeditor.ui.cards1.9f96b13cb0", (v)), v >= 39 ? 'warn' : ''); });
  var rep = h('div', { class: 'k-chips' });
  function drawRep() {
    clear(rep);
    var r = Ctx.get('repairable'), items = r ? r.items : null, list = [];
    if (typeof items === 'string') list = [items]; else if (Array.isArray(items)) list = items.slice();
    list.forEach(function (it, i) {
      var isTag = it.charAt(0) === '#', label = isTag ? I18n.t("cadeditor.ui.cards1.1d93880713", (tagLabel('item', it) || TAG_NAMES[it] || it)) : nameOfItem(it);
      var chip = h('div', { class: 'k-chip on' }, [isTag ? uiIcon('tag', 12) : itemIcon(it, 16), label]);
      var x = h('span', { class: 'x', text: ' ×' }); x.addEventListener('click', function (e) { e.stopPropagation(); list.splice(i, 1); saveRep(list); });
      chip.appendChild(x); rep.appendChild(chip);
    });
    var add = h('div', { class: 'k-chip' }, [uiIcon('plus', 12), I18n.t("cadeditor.ui.cards1.5b081cc794")]);
    activate(add, function () { pickItem(add, function (id) { if (list.some(function (x) { return x.charAt(0) === '#'; })) { toast(I18n.t("cadeditor.ui.cards1.a6a6dca4c4"), 'warn'); list = []; } list.push(fullId(id)); saveRep(list); }); });
    var addT = h('div', { class: 'k-chip' }, [uiIcon('tag', 12), I18n.t("cadeditor.ui.cards1.795cbff909")]);
    activate(addT, function () { openTagPicker({ title: I18n.t("cadeditor.ui.cards1.c4bad302b7"), tagsReg: 'item', tagsOnly: true, onConfirm: function (t) { list = [t]; saveRep(list); } }); });
    rep.appendChild(add); rep.appendChild(addT);
    if (!list.length) rep.insertBefore(h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.cards1.6d4c1653e4") }), rep.firstChild);
  }
  function saveRep(list) {
    if (!list.length) Ctx.disable('repairable', { structural: false });
    else Ctx.setSmart('repairable', { items: list.length === 1 ? list[0] : list }, { label: I18n.t("cadeditor.ui.cards1.706eea3ac3") });
    drawRep();
  }
  drawRep(); card.live.push(drawRep);
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards1.62fcb5a36b"), rep, I18n.t("cadeditor.ui.cards1.05c4858a22")));
  return card;
};

var RESIST = [{ v: '', label: I18n.t("cadeditor.ui.cards1.98d03cfc00"), sub: I18n.t("cadeditor.ui.cards1.dfafb16f5d") }, { v: '#minecraft:is_fire', label: I18n.t("cadeditor.ui.cards1.1337e8b1b8"), sub: I18n.t("cadeditor.ui.cards1.f8baa5d9ea") }, { v: '#minecraft:is_explosion', label: I18n.t("cadeditor.ui.cards1.c6a7daf706"), sub: I18n.t("cadeditor.ui.cards1.7a64bc3bb9") }, { v: '#minecraft:is_lightning', label: I18n.t("cadeditor.ui.cards1.a8c1b5b5b1"), sub: '' }, { v: '#minecraft:is_projectile', label: I18n.t("cadeditor.ui.cards1.18ff4a690c"), sub: I18n.t("cadeditor.ui.cards1.e0a123dfb1") }];
CARDS.resist = function () {
  var card = kCard({ id: 'resist', icon: 'flame', title: I18n.t("cadeditor.ui.cards1.6265ee935b"), desc: I18n.t("cadeditor.ui.cards1.bf64af306b"), comps: ['damage_resistant'] }, Ctx);
  function cur() { var v = Ctx.get('damage_resistant'); return v && typeof v.types === 'string' ? v.types : ''; }
  var tiles = kTiles(keepKnownTags(RESIST, 'damage_type'), cur(), function (v) {
    if (!v) Ctx.disable('damage_resistant', { structural: false });
    else Ctx.setSmart('damage_resistant', { types: v }, { label: I18n.t("cadeditor.ui.cards1.6265ee935b") });
  }, { list: true });
  card.body.appendChild(tiles.el); card.live.push(function () { tiles.set(cur()); });
  card.body.appendChild(kBtn(I18n.t("cadeditor.ui.cards1.a110a74c56"), function () { openTagPicker({ title: I18n.t("cadeditor.ui.cards1.3f819e3a9d"), tagsReg: 'damage_type', tagsOnly: true, quick: RESIST.filter(function (r) { return r.v; }), onConfirm: function (v) { Ctx.setSmart('damage_resistant', { types: v }, { label: I18n.t("cadeditor.ui.cards1.6265ee935b") }); tiles.set(v); } }); }, { icon: 'grid' }));
  return card;
};

CARDS.stack = function () {
  var card = kCard({ id: 'stack', icon: 'layers', title: I18n.t("cadeditor.ui.cards1.bd96a95955"), desc: I18n.t("cadeditor.ui.cards1.33b5185d00"), comps: ['max_stack_size'], value: function () { var n = Ctx.get('max_stack_size'); return n === undefined ? I18n.t("cadeditor.ui.cards1.2d1341db77") : I18n.t("cadeditor.ui.cards1.311dbb7b30", (n)); } }, Ctx);
  var locked = typeof Ctx.get('max_damage') === 'number';
  var num = codecNumber(Ctx.get('max_stack_size'), { min: 1, max: 99, softMax: 99, step: 1, big: true, presets: locked ? [] : [{ v: 1, label: I18n.t("cadeditor.ui.cards1.788357f060") }, { v: 16, label: '16' }, { v: 64, label: '64' }, { v: 99, label: '99' }], onChange: function (v) { Ctx.setSmart('max_stack_size', v, { label: I18n.t("cadeditor.ui.cards1.bd96a95955") }); } });
  card.body.appendChild(num.el);
  card.live.push(function () { num.set(Ctx.get('max_stack_size')); });
  if (locked) card.body.appendChild(kEffect(I18n.t("cadeditor.ui.cards1.25d181a1e5"), 'warn').el);
  return card;
};

/* ==================== 附魔 ====================
   上半：已选清单（可拖拽排序、限高滚动、右键菜单、等级可输入任意数）；下半：可展开的目录（搜索 + 适用筛选 + 自定义 ID）。 */
CARDS.enchants = function (cid) {
  var stored = cid === 'stored_enchantments';
  var card = kCard({ id: cid, icon: itemIcon('enchanted_book', 18), title: stored ? I18n.t("cadeditor.ui.cards1.6295c517fd") : I18n.t("cadeditor.ui.cards1.5cfebda177"), desc: stored ? I18n.t("cadeditor.ui.cards1.b457ba9e68") : I18n.t("cadeditor.ui.cards1.328529590f"), comps: [cid], span: 2,
    value: function () { var m = Ctx.get(cid); var n = m ? Object.keys(m).length : 0; return n ? I18n.t("cadeditor.ui.cards1.a88dddda1c", (n)) : ''; },
    summary: function () { var m = Ctx.get(cid); if (!m) return ''; return Object.keys(m).slice(0, 4).map(function (k) { var e = Reg.enchant(k); return (e ? e.name : shortId(k)) + ' ' + levelText(m[k]); }).join('、') + (Object.keys(m).length > 4 ? '…' : ''); } }, Ctx);
  var map = Ctx.get(cid) || {};
  var sid = Ctx.id(), isBook = Ctx.kind() === 'ebook';
  var selWrap = h('div', { class: 'k-sortlist' });
  var f = { mode: isBook || stored ? 'all' : 'fit', q: '' };
  function fits(e) { return isBook || stored || Reg.enchantFits(e, sid) === true; }
  function commit() { Ctx.setSmart(cid, clone(map), { label: stored ? I18n.t("cadeditor.ui.cards1.54d8cfc5ba") : I18n.t("cadeditor.ui.cards1.5cfebda177") }); }
  function conflicts(id) {
    var rg = Reg.enchant(id), out = []; if (!rg) return out;
    Object.keys(map).forEach(function (k) { var o = Reg.full(k); if (o !== rg.full && Reg.enchantConflict(rg, k) === true) out.push(Reg.nameOf('enchantments', o) || shortId(o)); });
    return out;
  }
  function reorder(from, to) { var keys = Object.keys(map); var k = keys.splice(from, 1)[0]; keys.splice(to, 0, k); var n = {}; keys.forEach(function (x) { n[x] = map[x]; }); map = n; commit(); drawSel(); }

  function selRow(k) {
    var id = shortId(k), e = Reg.enchant(k), rg = e, lv = map[k], cf = conflicts(id);
    var num = kNumber(lv, { min: 1, max: 2147483647, noSlider: true, step: 1, warnMax: 255, warnWhy: I18n.t("cadeditor.ui.cards1.f7936b4a3a"), onChange: function (v) { map[k] = v; commit(); paintMeta(); } });
    var meta = h('div', { class: 's' });
    function paintMeta() { var cur = map[k], txt = []; if (e && e.max !== null && cur > e.max) txt.push(I18n.t("cadeditor.ui.cards1.174d35cca8", (e.max))); var c2 = conflicts(id); if (c2.length) txt.push(I18n.t("cadeditor.ui.cards1.4d5eb938d8", (c2.join('、')))); if (!e || e.max === null) txt.push(I18n.t("cadeditor.ui.cards1.2846f9f898")); meta.textContent = txt.length ? txt.join('；') : (e ? e.desc : ''); meta.className = 's' + (txt.length ? ' w' : ''); rom.textContent = levelText(cur); rom.className = 'rom' + (e && e.max !== null && cur > e.max ? ' over' : ''); }
    var rom = h('span', { class: 'rom' });
    var rm = h('div', { class: 'k-mini del', text: '×', title: I18n.t("cadeditor.ui.cards1.aa490c34d9") }); activate(rm, function () { delete map[k]; commit(); drawSel(); drawCat(); });
    var row = h('div', { class: 'k-enrow k-srow' }, [kGrip(), h('div', { class: 'ic' }, [itemIcon(ENCH_ICON[id] || 'enchanted_book', 22)]), h('div', { class: 'tx' }, [h('div', { class: 'z', text: rg ? rg.name : (e ? e.name : id) }), meta]), rom, num.el, rm]);
    paintMeta();
    onContext(row, function () {
      var keys = Object.keys(map), idx = keys.indexOf(k);
      return [{ label: I18n.t("cadeditor.ui.cards1.3386674c96", (e && e.max !== null ? e.max : '?')), icon: 'up', dis: !e || e.max === null, run: function () { if (!e || e.max === null) return; map[k] = e.max; commit(); drawSel(); } }, { label: I18n.t("cadeditor.ui.cards1.0c4400582d"), run: function () { map[k]++; commit(); drawSel(); } }, { label: I18n.t("cadeditor.ui.cards1.41fa774216"), dis: map[k] <= 1, run: function () { map[k]--; commit(); drawSel(); } }, { sep: 1 }, { label: I18n.t("cadeditor.ui.cards1.e933dda587"), dis: idx === 0, run: function () { reorder(idx, 0); } }, { label: I18n.t("cadeditor.ui.cards1.ea9a3c79a0"), dis: idx === keys.length - 1, run: function () { reorder(idx, keys.length - 1); } }, { sep: 1 }, { label: I18n.t("cadeditor.ui.cards1.6135d4159e"), icon: 'trash', danger: 1, run: function () { delete map[k]; commit(); drawSel(); drawCat(); } }];
    });
    return row;
  }
  function drawSel() {
    clear(selWrap);
    var keys = Object.keys(map);
    keys.forEach(function (k) { selWrap.appendChild(selRow(k)); });
    if (!keys.length) selWrap.appendChild(xEmpty(I18n.t("cadeditor.ui.cards1.9a2e6ee679")));
  }
  kSortable(selWrap, { onMove: reorder });

  var bar = h('div', { class: 'k-row wrap' });
  bar.appendChild(kBtn(I18n.t("cadeditor.ui.cards1.03565b8187"), function () { var changed = false; Object.keys(map).forEach(function (k) { var e = Reg.enchant(k); if (e && e.max !== null && map[k] !== e.max) { map[k] = e.max; changed = true; } }); if (!changed) { if (!Reg.preview()) toast(I18n.t("cadeditor.ui.cards1.1d3cda08b3"), 'warn'); return; } commit(); drawSel(); }, { icon: 'up', title: I18n.t("cadeditor.ui.cards1.4fbe6d74a7") }));
  bar.appendChild(kBtn(I18n.t("cadeditor.ui.cards1.0b21faac57"), function () { var keys = Object.keys(map).sort(function (a, b) { return (Reg.nameOf('enchantments', a) || a).localeCompare(Reg.nameOf('enchantments', b) || b, 'zh'); }); var n = {}; keys.forEach(function (x) { n[x] = map[x]; }); map = n; commit(); drawSel(); }, { icon: 'sort' }));
  bar.appendChild(kBtn(I18n.t("cadeditor.ui.common.clear"), function () { map = {}; commit(); drawSel(); drawCat(); }, { cls: 'dng', icon: 'trash' }));

  /* 目录 */
  var grid = h('div', { class: 'k-engrid' }), seg = null, openBtn;
  function tile(e) {
    var key = e.full, on = map[key] !== undefined;
    var t = h('div', { class: 'k-en' + (on ? ' on' : '') + (!fits(e) ? ' na' : ''), title: I18n.t("cadeditor.ui.cards1.7017ac95f8", (e.name), (e.full), (e.desc), (e.max), (fits(e) ? '' : I18n.t("cadeditor.ui.cards1.0b55f70bb5"))) }, [
      h('div', { class: 'ic' }, [itemIcon(ENCH_ICON[shortId(e.full)] || 'enchanted_book', 22)]),
      h('div', { class: 'tx' }, [h('div', { class: 'z', text: e.name }), h('div', { class: 's', text: fits(e) ? e.desc : I18n.t("cadeditor.ui.cards1.8b6aa40628") })]),
      on ? h('div', { class: 'ck', text: '✓' }) : h('div', { class: 'ck add', text: '+' }),
    ]);
    t.addEventListener('click', function () { if (on) delete map[key]; else map[key] = 1; commit(); drawSel(); drawCat(); });
    return t;
  }
  function drawCat() {
    clear(grid);
    var q = f.q.trim().toLowerCase(), n = 0;
    Reg.enchants().forEach(function (e) {
      if (f.mode === 'fit' && !fits(e)) return;
      if (q && !kMatch(e.name + e.full, q)) return;
      n++; grid.appendChild(tile(e));
    });
    if (!n) grid.appendChild(xEmpty(I18n.t("cadeditor.ui.cards1.5043e220bd")));
  }
  var fitN = Reg.enchants().filter(fits).length;
  seg = kSeg([{ v: 'fit', label: I18n.t("cadeditor.ui.cards1.103611d72f", (fitN)) }, { v: 'all', label: I18n.t("cadeditor.ui.cards1.f540aa2261", (Reg.enchants().length)) }], f.mode, function (v) { f.mode = v; drawCat(); });
  var search = kInput('', function (v) { f.q = v; drawCat(); }, { placeholder: I18n.t("cadeditor.ui.cards1.eea24b0b40") });
  var custom = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.cards1.407022b991") });
  onKey(custom, { Enter: function () { var v = custom.value.trim(); if (!v) return; if (v.indexOf(':') < 0) v = 'minecraft:' + v; if (map[v] === undefined) map[v] = 1; custom.value = ''; commit(); drawSel(); drawCat(); } });
  /* 目录放进二级窗口：可多选，搜索、筛选、自定义 ID 都在里面 */
  var openBtn = kBtn(I18n.t("cadeditor.ui.cards1.f918baf5b3"), function () {
    var present = {}, values = {}; Object.keys(map).forEach(function (k) { present[Reg.full(k)] = 1; values[Reg.full(k)] = { level: map[k] }; });
    openEnchantPicker({ itemId: sid, any: isBook || stored, stored: stored, present: present, values: values, onConfirm: function (ids, vals, edit) {
      var wanted = {}, have = {}; ids.forEach(function (id) { wanted[Reg.full(id)] = 1; });
      Object.keys(map).forEach(function (key) { var id = Reg.full(key); if (!wanted[id]) delete map[key]; else { have[id] = 1; if (edit && edit.changes[id] && edit.changes[id].level) map[key] = vals[id].level; } });
      ids.forEach(function (id) { if (!have[id]) { map[id] = (vals && vals[id] && vals[id].level) || 1; have[id] = 1; } });
      commit(); drawSel();
    } });
  }, { icon: 'plus', cls: 'k-addbig' });
  card.body.appendChild(h('div', { class: 'k-scrollbox tall' }, [selWrap]));
  card.body.appendChild(openBtn); card.body.appendChild(bar);
  if (!Reg.preview() && !Reg.list('enchantments')) card.body.appendChild(kHint(I18n.t("cadeditor.ui.cards1.ac79d41915")));
  drawSel();
  card.live.push(function () { var m = Ctx.get(cid) || {}; if (!deepEq(m, map)) { map = m; drawSel(); drawCat(); } });
  return card;
};

CARDS.enchantable = function () {
  var card = kCard({ id: 'enchantable', icon: 'wand', title: I18n.t("cadeditor.ui.cards1.fc8cbabd77"), desc: I18n.t("cadeditor.ui.cards1.3c3bfba711"), comps: ['enchantable'], value: function () { var v = Ctx.get('enchantable'); return v ? I18n.t("cadeditor.ui.cards1.a71f516c0a", (v.value)) : ''; } }, Ctx);
  var v0 = Ctx.get('enchantable');
  if (!v0) return enableBox(card, [I18n.t("cadeditor.ui.cards1.691060c184"), I18n.t("cadeditor.ui.cards1.c113ac3292")], I18n.t("cadeditor.ui.cards1.ae417c89e6"), function () { Ctx.enable('enchantable', { value: 10 }, I18n.t("cadeditor.ui.cards1.381b181961")); });
  var num = kNumber(v0.value, { min: 1, max: 2147483647, softMax: 50, step: 1, big: true, presets: [{ v: 5, label: '5' }, { v: 9, label: '9' }, { v: 10, label: '10' }, { v: 14, label: '14' }, { v: 15, label: '15' }, { v: 22, label: '22' }].concat(presetsFromItems(['stone_sword', 'turtle_helmet', 'diamond_sword', 'iron_sword', 'wooden_sword', 'netherite_sword', 'golden_sword'], 'enchantable', 'value')), onChange: function (v) { Ctx.setSmart('enchantable', { value: v }, { label: I18n.t("cadeditor.ui.cards1.fc8cbabd77") }); } });
  card.body.appendChild(num.el);
  card.live.push(function () { var v = Ctx.get('enchantable'); if (v) num.set(v.value); });
  return card;
};
