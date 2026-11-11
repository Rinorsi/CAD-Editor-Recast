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
var LABEL_ICON = { '穿着外观': 'image', '穿戴音效': 'music', '声音': 'music', '基础药水': 'flask', '药水液体颜色': 'palette', '自定义效果': 'flask', '触发概率': 'luck', '获得的效果': 'flask', '要移除的效果': 'flask', '音效': 'music', '传送区域直径': 'compass', '按住右键多久': 'clock', '动作': 'play', '穿在哪里': 'helmet', '玩家名': 'user', '标记名': 'pin', '图案': 'image', '方块': 'cube', '维度': 'globe', '实体数据': 'code', '额外条件': 'code', '已停留': 'clock', '至少停留': 'clock', '类型': 'cube', '战利品表': 'chest', '随机种子': 'refresh', '钥匙物品': 'key', '身体皮肤': 'user', '披风': 'image', '鞘翅': 'feather', '手臂模型': 'user', '背面': 'cube', '左侧': 'cube', '右侧': 'cube', '正面': 'cube', '弹药': 'arrow', '数量': 'layers', '已在巢中': 'clock', '离巢所需': 'hourglass', '标记名称': 'pin', '标记图案': 'map', '旋转角度': 'refresh', '固定目标': 'target', '追踪磁石': 'magnet', '世界 X': 'compass', '世界 Z': 'compass', '坐标 X': 'compass', '坐标 Y': 'compass', '坐标 Z': 'compass' };
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
    out.push({ v: v, label: nameOfItem(id).replace(/剑|镐|斧|锹|锄|头盔|胸甲|护腿|靴子/g, '') + ' ' + (fmt ? fmt(v) : fmtNum(v)), title: nameOfItem(id) + ' 的原版值' });
  });
  return out;
}
var TIER_TOOLS = ['wooden_sword', 'stone_sword', 'copper_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword'];
function codecField(value, cid, key, preview) { return value && value[key] !== undefined ? value[key] : Reg.codecDefault(cid, key, preview); }
function codecToggle(value, change, label) { var t = kToggle(value === true, change, label); if (value === undefined) setTip(t.el, '默认值读取中，可直接设置'); return t; }
/* Unknown defaults stay blank and manually editable; no +/- operation can silently start at an invented game default. */
function codecNumber(value, options) {
  return kNumber(value, options);
}
/* 功能还没开：这一行只剩标题和右侧的开关，打开开关才会展开设置 */
function enableBox(card, text, label, make) {
  card.el.classList.add('off');
  var waiting = !Reg.preview() && Reg.defaultsOf(Ctx.doc().id) === null;
  function defaultNote() { return Reg.defs[Reg.full(Ctx.doc().id)] === false ? '游戏未提供此物品的默认组件；可从全部组件手动添加，现有覆盖保留' : '正在读取默认组件；现有覆盖与手动组件入口保留'; }
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
  var card = kCard({ id: 'name', icon: 'tag', title: '名称', desc: '物品在背包、提示框和聊天里显示的名字', comps: ['custom_name'], span: 2, summary: function () { var v = Ctx.get('custom_name'); var r = v === undefined ? null : tcRuns(v); return r ? r.runs.map(function (x) { return x.text; }).join('') : ''; } }, Ctx);
  var cur = Ctx.get('custom_name');
  var t = kRich(cur === undefined ? '' : cur, {
    placeholder: '输入新名称；留空 = 使用「' + nameOfItem(Ctx.doc().id) + '」', def: { color: itemTone(), italic: true, placeholder: nameOfItem(Ctx.doc().id) + '（默认名称）' },
    onChange: function (v, empty) {
      if (empty) { if (Ctx.modified('custom_name')) Store.inherit('custom_name', { structural: false, key: 'k-custom_name' }); }
      else Ctx.set('custom_name', v, { label: '修改名称' });
    },
  });
  card.body.appendChild(t.el);
  return card;
};

CARDS.lore = function () {
  var card = kCard({ id: 'lore', icon: 'list', title: '说明文字', desc: '显示在名称下方的多行文字，可写背景故事、使用提示', comps: ['lore'], span: 2, value: function () { var l = Ctx.get('lore'); return l && l.length ? l.length + ' 行文字' : ''; } }, Ctx);
  var list = h('div', { class: 'k-sortlist' });
  var lines = Ctx.get('lore') || [];
  function commit() { Ctx.setSmart('lore', clone(lines), { label: '修改说明文字' }); }
  function move(i, j) { if (j < 0 || j >= lines.length) return; var x = lines.splice(i, 1)[0]; lines.splice(j, 0, x); commit(); draw(); }
  function draw() {
    clear(list);
    lines.forEach(function (line, i) {
      var r = kRich(line, { compact: true, openKey: 'lore-' + i, placeholder: '第 ' + (i + 1) + ' 行', def: { color: '#AA00AA', italic: true, placeholder: '（空行）' }, onChange: function (v) { lines[i] = v; commit(); } });
      var rm = h('div', { class: 'k-mini del', text: '×', title: '删除这一行' }); activate(rm, function () { lines.splice(i, 1); commit(); draw(); });
      var row = h('div', { class: 'k-lrow k-srow' }, [kGrip(), h('span', { class: 'ix', text: String(i + 1) }), h('div', { class: 'grow' }, [r.el]), rm]);
      onContext(row, function () { return [{ label: '上移', icon: 'up', dis: i === 0, run: function () { move(i, i - 1); } }, { label: '下移', icon: 'down', dis: i === lines.length - 1, run: function () { move(i, i + 1); } }, { label: '复制这一行', icon: 'copy', run: function () { lines.splice(i + 1, 0, clone(line)); commit(); draw(); } }, { label: '在上方插入空行', run: function () { lines.splice(i, 0, ''); commit(); draw(); } }, { sep: 1 }, { label: '删除', icon: 'trash', danger: 1, run: function () { lines.splice(i, 1); commit(); draw(); } }]; });
      list.appendChild(row);
    });
    if (!lines.length) list.appendChild(xEmpty('还没有说明文字，点下面添加一行'));
  }
  kSortable(list, { onMove: function (from, to) { var x = lines.splice(from, 1)[0]; lines.splice(to, 0, x); commit(); draw(); } });
  var add = xAdd('添加一行');
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
  function paint() { clear(slot); slot.appendChild(combo({ options: options, value: get(), free: !!free, placeholder: '选择或手动填写', onPick: set })); }
  card.live.push(paint); paint(); return card;
}
CARDS.rarity = function () {
  var card = kCard({ id: 'rarity', icon: 'star', title: '稀有度', desc: '决定名称的颜色，让物品看起来更珍贵', comps: ['rarity'], eager: true, bare: true, cls: 'head-select-card' }, Ctx);
  var tones = { common: '#ffffff', uncommon: '#ffff55', rare: '#55ffff', epic: '#ff55ff' };
  var T = Labels.rarity.map(function (r) { return Object.assign({}, r, {sub:r.title, color:tones[r.v]}); });
  return cardHeadSelect(card, function () { return Reg.enumOptions('rarity', T); }, function () { return Ctx.get('rarity') || ''; }, function (v) { Ctx.setSmart('rarity', v, { label: '稀有度' }); }, true);
};

CARDS.glint = function () {
  var card = kCard({ id: 'glint', icon: 'sparkle', title: '附魔光效', desc: '物品表面的紫色流光', comps: ['enchantment_glint_override'], eager: true, bare: true, cls: 'head-select-card' }, Ctx);
  function cur() { var v = Ctx.get('enchantment_glint_override'); return v === undefined ? 'auto' : (v ? 'on' : 'off'); }
  var T = [{ v: 'auto', label: '自动', sub: '有附魔才发光', icon: function () { return uiIcon('refresh', 16); } }, { v: 'on', label: '总是发光', sub: '没附魔也闪', icon: function () { return uiIcon('sparkle', 16); } }, { v: 'off', label: '不发光', sub: '有附魔也不闪', icon: function () { return uiIcon('eye_off', 16); } }];
  return cardHeadSelect(card, T, cur, function (v) {
    if (v === 'auto') { if (Ctx.modified('enchantment_glint_override')) Store.inherit('enchantment_glint_override', { structural: false, key: 'k-glint' }); }
    else Ctx.setSmart('enchantment_glint_override', v === 'on', { label: '附魔光效' });
  });
};

var HIDE_PARTS = [['enchantments', '附魔'], ['attribute_modifiers', '属性加成'], ['unbreakable', '不可破坏'], ['dyed_color', '染色'], ['trim', '盔甲纹饰'], ['stored_enchantments', '书中的附魔'], ['potion_contents', '药水效果'], ['jukebox_playable', '唱片信息']];
CARDS.tooltip = function () {
  var card = kCard({ id: 'tooltip', icon: 'eye_off', title: '悬停提示', desc: '鼠标放在物品上时弹出的信息框', comps: ['tooltip_display'] }, Ctx);
  var v = Ctx.get('tooltip_display') || {};
  function save() { var o = {}; if (v.hide_tooltip) o.hide_tooltip = true; if (v.hidden_components && v.hidden_components.length) o.hidden_components = v.hidden_components; Ctx.setSmart('tooltip_display', o, { label: '悬停提示' }); }
  var tg = kToggle(!!v.hide_tooltip, function (on) { v.hide_tooltip = on; save(); }, '完全隐藏提示框（神秘物品）');
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
    var more = h('div', { class: 'k-chip', text: '＋ 其他组件' });
    activate(more, function () {
      openRegPick({ reg: 'data_component_type', title: '选择要隐藏的组件', onPick: function (id) {
        id = Reg.full(id); var l = v.hidden_components || [];
        if (l.indexOf(id) < 0) l.push(id);
        v.hidden_components = l; save(); paint();
      } });
    });
    chips.appendChild(more);
  }
  paint();
  card.body.appendChild(tg.el); card.body.appendChild(fieldRow('只隐藏其中几项', chips, '被选中的信息不会在提示框里显示'));
  return card;
};

CARDS.model = function () {
  var card = kCard({ id: 'model', icon: 'image', title: '外观借用', desc: '让它看起来像另一个物品（只改外观，功能不变）', comps: ['item_model'], eager: true, bare: true, cls: 'head-select-card' }, Ctx);
  var holder = h('div', { class: 'k-row card-head-select' });
  function draw() {
    clear(holder);
    var m = Ctx.get('item_model'), id = m ? shortId(m) : Ctx.id();
    var btn = h('div', { class: 'k-btn' }, [itemIcon(id, 20), h('span', { class: 'hd-model', text: nameOfItem(id), title: nameOfItem(id) + '\n' + fullId(id) }), uiIcon('down', 10)]);
    activate(btn, function () {
      pickItem(btn, function (pid) { Ctx.setSmart('item_model', fullId(pid), { label: '借用外观' }); draw(); },
        { reset: Ctx.modified('item_model') ? { label: '恢复默认', fn: function () { Ctx.reset('item_model'); draw(); } } : null });   // 「恢复默认」放在选择窗右下角，卡片头部不再占位
    });
    holder.appendChild(btn);
  }
  draw(); card.live.push(draw);
  var hd = card.el.firstChild; hd.appendChild(holder); card.el.classList.add('flat'); card.onHead = function () { return true; };
  return card;
};

/* ==================== 耐久与堆叠 ==================== */
function hitsText(maxd) { return '按每次使用损耗 1 点计算，大约能使用 ' + fmtInt(maxd) + ' 次'; }

CARDS.maxDamage = function () {
  var card = kCard({ id: 'maxdmg', icon: 'shield', title: '最大耐久', desc: '这件物品总共能承受多少点损耗', comps: ['max_damage'], value: function () { var v = Ctx.get('max_damage'); return v === undefined ? '' : fmtInt(v) + ' 点耐久'; } }, Ctx);
  if (!Ctx.has('max_damage')) {
    return enableBox(card, ['这个物品默认不会损坏', '启用后它变成可损坏物品，同时堆叠上限会限制为 1。'], '让它可以损坏', function () { Store.set('max_damage', 500, { key: 'k-md', structural: false }); Store.set('max_stack_size', 1, { key: 'k-ms', structural: true }); });
  }
  var num = kNumber(Ctx.get('max_damage'), { min: 1, max: 2147483647, softMax: 4000, step: 1, big: true, presets: presetsFromItems(TIER_TOOLS, 'max_damage'), onChange: function (v) { Ctx.setSmart('max_damage', v, { label: '最大耐久' }); } });
  var eff = kEffect('');
  card.body.appendChild(num.el); card.body.appendChild(eff.el);
  card.live.push(function () {
    var v = Ctx.get('max_damage'); if (v === undefined) return; num.set(v);
    var ub = (Ctx.get('enchantments') || {})['minecraft:unbreaking'];
    eff.set(hitsText(v) + (ub ? '；有耐久 ' + levelText(ub) + '，平均可延长到约 ' + fmtInt(v * (ub + 1)) + ' 次' : ''));
  });
  return card;
};

CARDS.damage = function () {
  var card = kCard({ id: 'damage', icon: 'hammer', title: '当前磨损', desc: '现在还剩多少耐久；设为满耐久就是一件全新的物品', comps: ['damage'] }, Ctx);
  var maxd = Ctx.get('max_damage');
  if (typeof maxd !== 'number') { card.body.appendChild(kHint('这个物品没有耐久，所以没有磨损值。')); return card; }
  var linkedMax = null;
  var num = kNumber(maxd - (Ctx.get('damage') || 0), { min: 0, max: 2147483647, softMax: maxd, step: 1, big: true, presets: [{ v: maxd, label: '全新' }, { v: Math.max(1, Math.round(maxd / 2)), label: '一半' }, { v: 1, label: '只剩 1 点' }], onChange: function (v) {
    var currentMax = Ctx.get('max_damage');
    if (v > currentMax) { linkedMax = v; Store.setLinked({ max_damage: v, damage: 0 }, '剩余耐久与最大耐久联动'); }
    else { Ctx.setSmart('damage', currentMax - v, { label: '当前磨损' }); }
  } });
  var bar = h('div', { class: 'k-meter' }, [h('i', {})]);
  var eff = kEffect('');
  card.body.appendChild(num.el); card.body.appendChild(bar); card.body.appendChild(eff.el);
  card.live.push(function () {
    var m = Ctx.get('max_damage'), d = Ctx.get('damage') || 0;
    if (typeof m !== 'number') return;
    var r = m - d, ratio = Math.max(0, Math.min(1, r / m));
    num.set(r); bar.firstChild.style.width = (ratio * 100) + '%'; bar.className = 'k-meter' + (ratio < 0.15 ? ' bad' : ratio < 0.4 ? ' warn' : '');
    var linkedMsg = linkedMax === m && diffDoc(Store.doc()).some(function (x) { return x.cid === 'max_damage'; }) ? '应用时将同步提高最大耐久至 ' + fmtInt(m) + '；' : '';
    eff.set(linkedMsg + (r <= 0 ? '耐久已耗尽，下一次使用就会损坏' : '剩余 ' + fmtInt(r) + ' / ' + fmtInt(m) + '（' + Math.round(ratio * 100) + '%）；超过最大耐久时会同步提高上限'), r <= 0 ? 'bad' : '');
  });
  return card;
};

CARDS.unbreakable = function () {
  return kCard({ id: 'unbr', icon: 'lock', title: '不可破坏', desc: '永不损坏；和「最大耐久」独立，耐久条仍会显示', comps: ['unbreakable'], bare: true, toggle: { get: function () { return Ctx.has('unbreakable'); }, set: function (on) { Ctx.setPresence('unbreakable', on, { label: on ? '设为不可破坏' : '取消不可破坏' }); } } }, Ctx);
};

var TAG_NAMES = { '#minecraft:diamond_tool_materials': '钻石', '#minecraft:iron_tool_materials': '铁锭', '#minecraft:stone_tool_materials': '石头类方块', '#minecraft:wooden_tool_materials': '木板', '#minecraft:gold_tool_materials': '金锭', '#minecraft:netherite_tool_materials': '下界合金锭', '#minecraft:copper_tool_materials': '铜锭', '#minecraft:repairs_leather_armor': '皮革', '#minecraft:repairs_chain_armor': '铁锭', '#minecraft:repairs_iron_armor': '铁锭', '#minecraft:repairs_gold_armor': '金锭', '#minecraft:repairs_diamond_armor': '钻石', '#minecraft:repairs_netherite_armor': '下界合金锭', '#minecraft:repairs_turtle_helmet': '海龟鳞甲', '#minecraft:planks': '木板' };
CARDS.repair = function () {
  var card = kCard({ id: 'repair', icon: 'anvil', title: '铁砧与修理', desc: '用什么材料修理，以及铁砧会收多少额外经验', comps: ['repair_cost', 'repairable'], span: 2 }, Ctx);
  var cost = kNumber(Ctx.get('repair_cost') || 0, { min: 0, max: 2147483647, softMax: 40, step: 1, presets: [{ v: 0, label: '0 全新' }, { v: 1, label: '1' }, { v: 3, label: '3' }, { v: 7, label: '7' }, { v: 15, label: '15' }, { v: 31, label: '31' }], onChange: function (v) { Ctx.setSmart('repair_cost', v, { label: '铁砧惩罚' }); } });
  var eff = kEffect('');
  card.body.appendChild(fieldRow('铁砧惩罚', cost.el, '每用铁砧操作一次会翻倍增长'));
  card.body.appendChild(eff.el);
  card.live.push(function () { var v = Ctx.get('repair_cost') || 0; cost.set(v); eff.set(v >= 39 ? '铁砧会显示「过于昂贵」，非创造模式无法再用铁砧处理（≥ 40 级）' : '再次使用铁砧时，会额外多花约 ' + v + ' 级经验', v >= 39 ? 'warn' : ''); });
  var rep = h('div', { class: 'k-chips' });
  function drawRep() {
    clear(rep);
    var r = Ctx.get('repairable'), items = r ? r.items : null, list = [];
    if (typeof items === 'string') list = [items]; else if (Array.isArray(items)) list = items.slice();
    list.forEach(function (it, i) {
      var isTag = it.charAt(0) === '#', label = isTag ? (tagLabel('item', it) || TAG_NAMES[it] || it) + '类' : nameOfItem(it);
      var chip = h('div', { class: 'k-chip on' }, [isTag ? uiIcon('tag', 12) : itemIcon(it, 16), label]);
      var x = h('span', { class: 'x', text: ' ×' }); x.addEventListener('click', function (e) { e.stopPropagation(); list.splice(i, 1); saveRep(list); });
      chip.appendChild(x); rep.appendChild(chip);
    });
    var add = h('div', { class: 'k-chip' }, [uiIcon('plus', 12), '添加材料']);
    activate(add, function () { pickItem(add, function (id) { if (list.some(function (x) { return x.charAt(0) === '#'; })) { toast('已有「标签」时不能再加单个物品：游戏的数据格式里，修理材料要么是一个标签，要么是物品列表。已改为只用这个物品', 'warn'); list = []; } list.push(fullId(id)); saveRep(list); }); });
    var addT = h('div', { class: 'k-chip' }, [uiIcon('tag', 12), '添加标签']);
    activate(addT, function () { openTagPicker({ title: '选择修理材料标签（会替换其它材料）', tagsReg: 'item', tagsOnly: true, onConfirm: function (t) { list = [t]; saveRep(list); } }); });
    rep.appendChild(add); rep.appendChild(addT);
    if (!list.length) rep.insertBefore(h('span', { class: 'k-sub', text: '无法修理  ' }), rep.firstChild);
  }
  function saveRep(list) {
    if (!list.length) Ctx.disable('repairable', { structural: false });
    else Ctx.setSmart('repairable', { items: list.length === 1 ? list[0] : list }, { label: '修理材料' });
    drawRep();
  }
  drawRep(); card.live.push(drawRep);
  card.body.appendChild(fieldRow('可用来修理的材料', rep, '在铁砧上把两样东西合并来修理'));
  return card;
};

var RESIST = [{ v: '', label: '不免疫', sub: '会被烧毁' }, { v: '#minecraft:is_fire', label: '火焰类', sub: '火、岩浆' }, { v: '#minecraft:is_explosion', label: '爆炸类', sub: '苦力怕、TNT' }, { v: '#minecraft:is_lightning', label: '闪电', sub: '' }, { v: '#minecraft:is_projectile', label: '弹射物', sub: '箭、火球' }];
CARDS.resist = function () {
  var card = kCard({ id: 'resist', icon: 'flame', title: '掉落物免疫', desc: '变成掉落物后能抵抗哪类伤害（如下界合金装备不怕岩浆）', comps: ['damage_resistant'] }, Ctx);
  function cur() { var v = Ctx.get('damage_resistant'); return v && typeof v.types === 'string' ? v.types : ''; }
  var tiles = kTiles(keepKnownTags(RESIST, 'damage_type'), cur(), function (v) {
    if (!v) Ctx.disable('damage_resistant', { structural: false });
    else Ctx.setSmart('damage_resistant', { types: v }, { label: '掉落物免疫' });
  }, { list: true });
  card.body.appendChild(tiles.el); card.live.push(function () { tiles.set(cur()); });
  card.body.appendChild(kBtn('更多伤害类型…', function () { openTagPicker({ title: '选择免疫哪类伤害', tagsReg: 'damage_type', tagsOnly: true, quick: RESIST.filter(function (r) { return r.v; }), onConfirm: function (v) { Ctx.setSmart('damage_resistant', { types: v }, { label: '掉落物免疫' }); tiles.set(v); } }); }, { icon: 'grid' }));
  return card;
};

CARDS.stack = function () {
  var card = kCard({ id: 'stack', icon: 'layers', title: '最大堆叠', desc: '一格里最多能放多少个', comps: ['max_stack_size'], value: function () { var n = Ctx.get('max_stack_size'); return n === undefined ? '正在读取' : n + ' 个/格'; } }, Ctx);
  var locked = typeof Ctx.get('max_damage') === 'number';
  var num = codecNumber(Ctx.get('max_stack_size'), { min: 1, max: 99, softMax: 99, step: 1, big: true, presets: locked ? [] : [{ v: 1, label: '1 不可堆叠' }, { v: 16, label: '16' }, { v: 64, label: '64' }, { v: 99, label: '99' }], onChange: function (v) { Ctx.setSmart('max_stack_size', v, { label: '最大堆叠' }); } });
  card.body.appendChild(num.el);
  card.live.push(function () { num.set(Ctx.get('max_stack_size')); });
  if (locked) card.body.appendChild(kEffect('可损坏的物品必须是 1，否则游戏会拒绝这个物品。', 'warn').el);
  return card;
};

/* ==================== 附魔 ====================
   上半：已选清单（可拖拽排序、限高滚动、右键菜单、等级可输入任意数）；下半：可展开的目录（搜索 + 适用筛选 + 自定义 ID）。 */
CARDS.enchants = function (cid) {
  var stored = cid === 'stored_enchantments';
  var card = kCard({ id: cid, icon: itemIcon('enchanted_book', 18), title: stored ? '书里储存的附魔' : '附魔', desc: stored ? '这本书里存着的附魔，可在铁砧上转给装备' : '等级可以直接输入任意数字', comps: [cid], span: 2,
    value: function () { var m = Ctx.get(cid); var n = m ? Object.keys(m).length : 0; return n ? n + ' 个' : ''; },
    summary: function () { var m = Ctx.get(cid); if (!m) return ''; return Object.keys(m).slice(0, 4).map(function (k) { var e = Reg.enchant(k); return (e ? e.name : shortId(k)) + ' ' + levelText(m[k]); }).join('、') + (Object.keys(m).length > 4 ? '…' : ''); } }, Ctx);
  var map = Ctx.get(cid) || {};
  var sid = Ctx.id(), isBook = Ctx.kind() === 'ebook';
  var selWrap = h('div', { class: 'k-sortlist' });
  var f = { mode: isBook || stored ? 'all' : 'fit', q: '' };
  function fits(e) { return isBook || stored || Reg.enchantFits(e, sid) === true; }
  function commit() { Ctx.setSmart(cid, clone(map), { label: stored ? '书中附魔' : '附魔' }); }
  function conflicts(id) {
    var rg = Reg.enchant(id), out = []; if (!rg) return out;
    Object.keys(map).forEach(function (k) { var o = Reg.full(k); if (o !== rg.full && Reg.enchantConflict(rg, k) === true) out.push(Reg.nameOf('enchantments', o) || shortId(o)); });
    return out;
  }
  function reorder(from, to) { var keys = Object.keys(map); var k = keys.splice(from, 1)[0]; keys.splice(to, 0, k); var n = {}; keys.forEach(function (x) { n[x] = map[x]; }); map = n; commit(); drawSel(); }

  function selRow(k) {
    var id = shortId(k), e = Reg.enchant(k), rg = e, lv = map[k], cf = conflicts(id);
    var num = kNumber(lv, { min: 1, max: 2147483647, noSlider: true, step: 1, warnMax: 255, warnWhy: '原版附魔等级最高 255', onChange: function (v) { map[k] = v; commit(); paintMeta(); } });
    var meta = h('div', { class: 's' });
    function paintMeta() { var cur = map[k], txt = []; if (e && e.max !== null && cur > e.max) txt.push('超过自然上限 ' + e.max); var c2 = conflicts(id); if (c2.length) txt.push('⚠ 与「' + c2.join('、') + '」互斥'); if (!e || e.max === null) txt.push('尚无实时最高等级，保留原 ID 与等级'); meta.textContent = txt.length ? txt.join('；') : (e ? e.desc : ''); meta.className = 's' + (txt.length ? ' w' : ''); rom.textContent = levelText(cur); rom.className = 'rom' + (e && e.max !== null && cur > e.max ? ' over' : ''); }
    var rom = h('span', { class: 'rom' });
    var rm = h('div', { class: 'k-mini del', text: '×', title: '移除这个附魔' }); activate(rm, function () { delete map[k]; commit(); drawSel(); drawCat(); });
    var row = h('div', { class: 'k-enrow k-srow' }, [kGrip(), h('div', { class: 'ic' }, [itemIcon(ENCH_ICON[id] || 'enchanted_book', 22)]), h('div', { class: 'tx' }, [h('div', { class: 'z', text: rg ? rg.name : (e ? e.name : id) }), meta]), rom, num.el, rm]);
    paintMeta();
    onContext(row, function () {
      var keys = Object.keys(map), idx = keys.indexOf(k);
      return [{ label: '升到自然最高（' + (e && e.max !== null ? e.max : '?') + '）', icon: 'up', dis: !e || e.max === null, run: function () { if (!e || e.max === null) return; map[k] = e.max; commit(); drawSel(); } }, { label: '等级 +1', run: function () { map[k]++; commit(); drawSel(); } }, { label: '等级 −1', dis: map[k] <= 1, run: function () { map[k]--; commit(); drawSel(); } }, { sep: 1 }, { label: '移到最前', dis: idx === 0, run: function () { reorder(idx, 0); } }, { label: '移到最后', dis: idx === keys.length - 1, run: function () { reorder(idx, keys.length - 1); } }, { sep: 1 }, { label: '移除', icon: 'trash', danger: 1, run: function () { delete map[k]; commit(); drawSel(); drawCat(); } }];
    });
    return row;
  }
  function drawSel() {
    clear(selWrap);
    var keys = Object.keys(map);
    keys.forEach(function (k) { selWrap.appendChild(selRow(k)); });
    if (!keys.length) selWrap.appendChild(xEmpty('还没有附魔'));
  }
  kSortable(selWrap, { onMove: reorder });

  var bar = h('div', { class: 'k-row wrap' });
  bar.appendChild(kBtn('升到自然最高', function () { var changed = false; Object.keys(map).forEach(function (k) { var e = Reg.enchant(k); if (e && e.max !== null && map[k] !== e.max) { map[k] = e.max; changed = true; } }); if (!changed) { if (!Reg.preview()) toast('没有可调整的实时最高等级；未读取的附魔保持原值。', 'warn'); return; } commit(); drawSel(); }, { icon: 'up', title: '只调整已读取最高等级的附魔；未知 ID 保留原值' }));
  bar.appendChild(kBtn('按名称排序', function () { var keys = Object.keys(map).sort(function (a, b) { return (Reg.nameOf('enchantments', a) || a).localeCompare(Reg.nameOf('enchantments', b) || b, 'zh'); }); var n = {}; keys.forEach(function (x) { n[x] = map[x]; }); map = n; commit(); drawSel(); }, { icon: 'sort' }));
  bar.appendChild(kBtn('清空', function () { map = {}; commit(); drawSel(); drawCat(); }, { cls: 'dng', icon: 'trash' }));

  /* 目录 */
  var grid = h('div', { class: 'k-engrid' }), seg = null, openBtn;
  function tile(e) {
    var key = e.full, on = map[key] !== undefined;
    var t = h('div', { class: 'k-en' + (on ? ' on' : '') + (!fits(e) ? ' na' : ''), title: e.name + '（' + e.full + '）\n' + e.desc + '\n自然最高 ' + e.max + ' 级' + (fits(e) ? '' : '\n通常不能附在这件物品上') }, [
      h('div', { class: 'ic' }, [itemIcon(ENCH_ICON[shortId(e.full)] || 'enchanted_book', 22)]),
      h('div', { class: 'tx' }, [h('div', { class: 'z', text: e.name }), h('div', { class: 's', text: fits(e) ? e.desc : '通常不适用于此物品' })]),
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
    if (!n) grid.appendChild(xEmpty('没有匹配的附魔'));
  }
  var fitN = Reg.enchants().filter(fits).length;
  seg = kSeg([{ v: 'fit', label: '适用于它 ' + fitN }, { v: 'all', label: '全部 ' + Reg.enchants().length }], f.mode, function (v) { f.mode = v; drawCat(); });
  var search = kInput('', function (v) { f.q = v; drawCat(); }, { placeholder: '搜索附魔名称' });
  var custom = kInput('', function () {}, { placeholder: '模组附魔？输入 ID，如 mymod:fireball，回车添加' });
  onKey(custom, { Enter: function () { var v = custom.value.trim(); if (!v) return; if (v.indexOf(':') < 0) v = 'minecraft:' + v; if (map[v] === undefined) map[v] = 1; custom.value = ''; commit(); drawSel(); drawCat(); } });
  /* 目录放进二级窗口：可多选，搜索、筛选、自定义 ID 都在里面 */
  var openBtn = kBtn('添加附魔', function () {
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
  if (!Reg.preview() && !Reg.list('enchantments')) card.body.appendChild(kHint('正在读取实时附魔；可以手动输入 ID 和等级。自然最高操作等待数据。'));
  drawSel();
  card.live.push(function () { var m = Ctx.get(cid) || {}; if (!deepEq(m, map)) { map = m; drawSel(); drawCat(); } });
  return card;
};

CARDS.enchantable = function () {
  var card = kCard({ id: 'enchantable', icon: 'wand', title: '附魔台适性', desc: '在附魔台里附魔时的「好不好附」', comps: ['enchantable'], value: function () { var v = Ctx.get('enchantable'); return v ? '适性 ' + v.value : ''; } }, Ctx);
  var v0 = Ctx.get('enchantable');
  if (!v0) return enableBox(card, ['这个物品不能在附魔台附魔', '启用后可以放进附魔台。'], '允许在附魔台附魔', function () { Ctx.enable('enchantable', { value: 10 }, '允许附魔台附魔'); });
  var num = kNumber(v0.value, { min: 1, max: 2147483647, softMax: 50, step: 1, big: true, presets: [{ v: 5, label: '5' }, { v: 9, label: '9' }, { v: 10, label: '10' }, { v: 14, label: '14' }, { v: 15, label: '15' }, { v: 22, label: '22' }].concat(presetsFromItems(['stone_sword', 'turtle_helmet', 'diamond_sword', 'iron_sword', 'wooden_sword', 'netherite_sword', 'golden_sword'], 'enchantable', 'value')), onChange: function (v) { Ctx.setSmart('enchantable', { value: v }, { label: '附魔台适性' }); } });
  card.body.appendChild(num.el);
  card.live.push(function () { var v = Ctx.get('enchantable'); if (v) num.set(v.value); });
  return card;
};
