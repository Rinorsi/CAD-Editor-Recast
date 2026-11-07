/* 页面编排：物品类别 → 分页 → 卡片。只显示与这类物品相关的内容；其余组件通过「添加设置」加入，显示在「附加设置」页。 */

var KIND_INFO = {
  melee: { name: '近战武器', color: '#e8663d', icon: 'sword' },
  tool: { name: '工具', color: '#e5b417', icon: 'pickaxe' },
  ranged: { name: '远程武器', color: '#7bc74d', icon: 'bow' },
  shield: { name: '盾牌', color: '#8fa3b8', icon: 'shield' },
  armor: { name: '盔甲 / 装备', color: '#4a9bff', icon: 'chestplate' },
  food: { name: '食物', color: '#f2a33a', icon: 'apple' },
  potion: { name: '药水', color: '#b46bff', icon: 'potion_round' },
  ebook: { name: '附魔书', color: '#c46aff', icon: 'book' },
  book: { name: '书', color: '#c9a26b', icon: 'book_open' },
  container: { name: '容器', color: '#d08b4a', icon: 'chest' },
  firework: { name: '烟花', color: '#ff5a9a', icon: 'explosion' },
  banner: { name: '旗帜', color: '#4ac8d9', icon: 'banner' },
  disc: { name: '音乐唱片', color: '#6ed1a8', icon: 'music' },
  spawn: { name: '刷怪蛋', color: '#7bc74d', icon: 'paw' },
  spawner: { name: '刷怪笼', color: '#8f7be0', icon: 'paw' },
  generic: { name: '物品 / 方块', color: '#6cc349', icon: 'cube' },
};
var RARITY_ZH = { common: '普通', uncommon: '优秀', rare: '稀有', epic: '史诗' };

var APPEAR = ['#名称与说明', 'name', 'lore', '#稀有度与显示', 'rarity', 'glint', 'tooltip', 'model'];
var DURA = ['#耐久', 'maxDamage', 'damage', 'unbreakable', '#修理与保护', 'repair', 'resist', '#堆叠', 'stack'];
var ENCH = ['#附魔', ['enchants', 'enchantments'], '#附魔台', 'enchantable'];
var ATTR_MAIN = ['attack_damage', 'attack_speed'];
var ATTR_ARMOR = ['armor', 'armor_toughness', 'knockback_resistance'];

/* 每类物品的分页。cards 里：字符串=CARDS 的键；[键, 参数…]=带参数调用 */
var PAGES = {
  melee: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'combat', label: '战斗', icon: 'sword', cards: ['#基础数值', 'attackDamage', 'attackSpeed', '#攻击特性', 'weapon', 'reach', 'swing', 'cooldown', '#额外属性', ['extraAttrs', ATTR_MAIN]] },
    { id: 'dura', label: '耐久', icon: 'shield', cards: DURA },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ENCH },
  ],
  tool: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'mine', label: '挖掘与攻击', icon: 'pickaxe', cards: ['#挖掘', 'tool', '#攻击', 'attackDamage', 'attackSpeed', 'weapon', 'swing', '#额外属性', ['extraAttrs', ATTR_MAIN]] },
    { id: 'dura', label: '耐久', icon: 'shield', cards: DURA },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ENCH },
  ],
  ranged: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'dura', label: '耐久', icon: 'shield', cards: DURA },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ENCH },
    { id: 'attrs', label: '属性', icon: 'sliders', cards: ['#属性', ['extraAttrs', [], '属性加成'], '#冷却', 'cooldown'] },
  ],
  shield: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'banner', label: '旗帜图案', icon: 'banner', cards: ['#旗帜', ['auto', 'banner_patterns'], ['auto', 'base_color'], '#作为材料', ['auto', 'provides_banner_patterns']] },
    { id: 'dura', label: '耐久', icon: 'shield', cards: DURA },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ENCH },
    { id: 'attrs', label: '属性', icon: 'sliders', cards: ['#属性', ['extraAttrs', [], '属性加成']] },
  ],
  armor: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'def', label: '穿戴与防护', icon: 'chestplate', cards: ['#穿戴', 'equip', '#防护数值', 'armorValue', 'armorToughness', 'knockbackResist', '#外观定制', 'trim', 'dye', '#其他', 'glider', ['extraAttrs', ATTR_ARMOR]] },
    { id: 'dura', label: '耐久', icon: 'shield', cards: DURA },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ENCH },
  ],
  food: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'eat', label: '食用', icon: 'apple', cards: ['#食物', 'food', '#使用行为', 'consumable', 'cooldown', '#使用后', 'remainder', 'stack'] },
    { id: 'fx', label: '食用效果', icon: 'flask', cards: ['#使用结束时', 'consumeEffects', '#炖菜', 'stew'] },
  ],
  potion: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'potion', label: '药水', icon: 'potion_round', cards: ['#药水', 'potion', '#使用行为', 'consumable', 'remainder', 'stack'] },
  ],
  ebook: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ['#附魔书', ['enchants', 'stored_enchantments']] },
  ],
  book: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'text', label: '内容', icon: 'book_open', cards: ['#书本内容', 'writtenBook', 'writableBook'] },
  ],
  container: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'inside', label: '内容', icon: 'chest', cards: ['#里面的物品', 'container', 'bundle', 'stack'] },
  ],
  firework: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'fw', label: '烟花', icon: 'explosion', cards: ['#烟花', 'fireworks', 'fireworkStar', 'stack'] },
  ],
  generic: [
    { id: 'look', label: '外观', icon: 'palette', cards: APPEAR },
    { id: 'stack', label: '堆叠与耐久', icon: 'layers', cards: DURA.concat(['#死亡保护', 'deathProtection']) },
    { id: 'ench', label: '附魔', icon: 'enchant', cards: ENCH },
  ],
};
PAGES.banner = [PAGES.generic[0], { id: 'banner', label: '旗帜图案', icon: 'banner', cards: ['#旗帜', ['auto', 'banner_patterns'], ['auto', 'base_color'], '#作为材料', ['auto', 'provides_banner_patterns']] }].concat(PAGES.generic.slice(1)); PAGES.disc = PAGES.generic; PAGES.spawn = [{ id: 'egg', label: '刷怪蛋', icon: 'paw', cards: ['spawnEgg', 'eggLook', 'eggFlags', 'eggAttrs', 'eggEffects', 'eggGear', 'eggData'] }, PAGES.generic[0], PAGES.generic[1]]; PAGES.spawner = [{ id: 'spawner', label: '刷怪设置', icon: 'paw', cards: ['#刷怪笼', 'spawner'] }, PAGES.generic[0], PAGES.generic[1]];

/* 卡片是否适用于当前物品（有些卡片只在物品本来有对应功能时出现） */
var CARD_NEEDS = {
  stew: 'suspicious_stew_effects', deathProtection: 'death_protection', fireworkStar: 'firework_explosion', fireworks: 'fireworks',
  bundle: 'bundle_contents', container: 'container', writtenBook: 'written_book_content', writableBook: 'writable_book_content',
};
function cardApplies(key, id, kind) {
  var need = CARD_NEEDS[key];
  if (key === 'container') return kind === 'container' && Ctx.protoItem(id, 'container') !== undefined || (kind === 'container' && Ctx.protoItem(id, 'bundle_contents') === undefined);
  if (key === 'bundle') return Ctx.protoItem(id, 'bundle_contents') !== undefined;
  if (key === 'writtenBook') return id === 'written_book';
  if (key === 'writableBook') return id === 'writable_book';
  if (key === 'fireworks') return id === 'firework_rocket';
  if (key === 'fireworkStar') return id === 'firework_star';
  if (need) return Ctx.protoItem(id, need) !== undefined || Ctx.has(need);
  if (key === 'consumeEffects' && kind === 'generic') return Ctx.has('consumable');
  if (kind === 'generic') {
    if (key === 'consumable') return Ctx.has('consumable');
    if (key === 'food') return Ctx.has('food');
    if (key === 'equip') return Ctx.has('equippable');
    if (key === 'glider') return Ctx.has('glider');
    if (key === 'cooldown') return Ctx.has('use_cooldown');
  }
  return true;
}
function makeCard(spec) {
  var key = spec, args = [];
  if (Array.isArray(spec)) { key = spec[0]; args = spec.slice(1); }
  var f = CARDS[key];
  if (!f) return null;
  var skipLazy = DETAIL_IN || DETAIL_BIG[key] || (key === 'auto' && DETAIL_AUTO[args[0]]);
  var card = null;
  KLAZY = skipLazy ? 0 : 1;
  try { card = f.apply(null, args); }
  catch (e) { if (e instanceof LazyCard) { card = e.card; card.lazy = { f: f, args: args }; lazyHook(card); } else { KLAZY = 0; throw e; } }
  KLAZY = 0;
  if (card && DETAIL_BIG[key] && !DETAIL_IN) detailize(card, { key: spec, cid: (card.comps && card.comps[0]) || '', title: card.spec && card.spec.title });
  return card;
}

/* 构建一个分页的卡片 */
function buildTabCards(kind, tab) {
  var id = Ctx.id(), out = [];
  tab.cards.forEach(function (c) {
    var key = Array.isArray(c) ? c[0] : c;
    if (typeof c === 'string' && c.charAt(0) === '#') { out.push({ marker: c.substring(1) }); return; }
    if (!tab.force && !cardApplies(key, id, kind)) return;
    var card = makeCard(c);
    if (card) out.push(card);
  });
  return out;
}
/* 一张卡片对应的组件 id 列表 */
function cardComps(c) {
  var key = Array.isArray(c) ? c[0] : c;
  if (key === 'auto' || key === 'enchants') return [c[1]];
  if (key === 'extraAttrs') return ['attribute_modifiers'];
  return CARD_COMPS[key] || [];
}
function cardKey(c) { var key = Array.isArray(c) ? c[0] : c; return key === 'auto' || key === 'enchants' ? key + ':' + c[1] : key; }
/* 一个分页里被改动过的组件个数（用于标签上的角标） */
function tabModCount(kind, tab) {
  var seen = {}, n = 0, d = Ctx.doc();
  tab.cards.forEach(function (c) {
    cardComps(c).forEach(function (cid) { if (!seen[cid] && intentOf(d, cid) !== 'inherit') { seen[cid] = 1; n++; } });
  });
  return n;
}
var CARD_COMPS = { name: ['custom_name'], lore: ['lore'], rarity: ['rarity'], glint: ['enchantment_glint_override'], tooltip: ['tooltip_display'], model: ['item_model'], maxDamage: ['max_damage'], damage: ['damage'], unbreakable: ['unbreakable'], repair: ['repair_cost', 'repairable'], resist: ['damage_resistant'], stack: ['max_stack_size'], enchantable: ['enchantable'], attackDamage: ['attribute_modifiers'], attackSpeed: ['attribute_modifiers'], weapon: ['weapon'], reach: ['attack_range'], swing: ['swing_animation'], cooldown: ['use_cooldown'], tool: ['tool'], equip: ['equippable'], armorValue: ['attribute_modifiers'], armorToughness: ['attribute_modifiers'], knockbackResist: ['attribute_modifiers'], trim: ['trim'], dye: ['dyed_color'], glider: ['glider'], food: ['food'], consumable: ['consumable'], consumeEffects: ['consumable'], remainder: ['use_remainder'], potion: ['potion_contents'], stew: ['suspicious_stew_effects'], deathProtection: ['death_protection'], container: ['container'], bundle: ['bundle_contents'], writtenBook: ['written_book_content'], writableBook: ['writable_book_content'], fireworks: ['fireworks'], fireworkStar: ['firework_explosion'] };

/* ---------- 变更的人话描述（应用前确认、差异对比用） ---------- */
function compBrief(cid, val) {
  var c = CIDX[cid];
  if (val === undefined) return '（无）';
  try {
    switch (cid) {
      case 'custom_name': case 'item_name': { var r = tcRuns(val); return r ? '「' + r.runs.map(function (x) { return x.text; }).join('') + '」' : '（复杂文本）'; }
      case 'lore': return val.length + ' 行说明';
      case 'rarity': return RARITY_ZH[val] || val;
      case 'enchantments': case 'stored_enchantments': { var k = Object.keys(val); return k.length ? k.map(function (x) { var e = ENIDX[shortId(x)]; return (e ? e.name : shortId(x)) + ' ' + levelText(val[x]); }).join('、') : '无附魔'; }
      case 'attribute_modifiers': return val.length ? val.map(function (m) { return attrName(m.type) + ' ' + modSummary(m); }).join('、') : '无属性加成';
      case 'max_damage': case 'damage': case 'max_stack_size': case 'repair_cost': return bigOrNum(val);
      case 'unbreakable': return '不可破坏';
      case 'enchantment_glint_override': return val ? '总是发光' : '不发光';
      case 'food': return '饥饿 +' + val.nutrition + '，饱和 +' + val.saturation;
      case 'dyed_color': return typeof val === 'number' ? hex6(val) : '自定义色';
      case 'item_model': return '外观 = ' + nameOfItem(val);
      case 'equippable': return '穿在' + ((EQ_SLOTS.filter(function (s) { return s.v === val.slot; })[0] || { label: val.slot }).label);
      case 'trim': return '纹饰 ' + shortId(val.pattern) + ' / ' + shortId(val.material);
      case 'container': return val.length + ' 格有物品';
      case 'potion_contents': { var o = typeof val === 'string' ? { potion: val } : val; return (o.potion ? potionName(o.potion) : '') + (o.custom_effects && o.custom_effects.length ? ' + ' + o.custom_effects.length + ' 个自定义效果' : ''); }
      case 'tool': return (val.rules || []).length + ' 条挖掘规则';
    }
  } catch (e) { /* 落到下面的通用描述 */ }
  return c ? c.name + '（已修改）' : cid;
}
function describeDiff(x) {
  var name = x.cid === '#item' ? '物品' : x.cid === '#count' ? '数量' : (CIDX[x.cid] ? CIDX[x.cid].name : x.cid);
  var b = x.before, a = x.after, kind;
  function side(st) { if (st.k === 'inherit') return '原版默认'; if (st.k === 'remove') return '已移除'; return x.cid.charAt(0) === '#' ? String(st.v) : compBrief(x.cid, st.v); }
  if (a.k === 'remove') kind = 'rm'; else if (b.k === 'inherit' && a.k === 'set') kind = 'add'; else if (a.k === 'inherit') kind = 'rv'; else kind = 'ch';
  return { name: name, kind: kind, before: side(b), after: side(a) };
}

/* ---------- 通用分页：任何物品都能打开 ----------
   原版允许给任意物品加上任何组件（不能穿戴的变成可穿戴、不能吃的变成能吃……）。
   这些分页放在「更多 ▾」里；物品本来就带着相关设置、或你改过其中的内容时，会自动出现在标签栏。 */
function A(cid) { return ['auto', cid]; }
var UNIVERSAL = [
  { id: 'u-ability', label: '功能', alt: '更多功能', home: ['eat', 'potion', 'fx'], icon: 'wand', desc: '穿戴、食用、使用、挖掘、滑翔、死亡保护', cards: ['#穿戴与移动', 'equip', 'glider', '#食用与使用', 'food', 'consumable', 'consumeEffects', A('use_effects'), 'remainder', A('potion_duration_scale'), A('ominous_bottle_amplifier'), '#工具与其它', 'tool', 'cooldown', 'deathProtection', A('intangible_projectile')] },
  { id: 'u-combat', label: '攻击与防御', alt: '更多战斗', home: ['combat', 'mine', 'def'], icon: 'sword', desc: '攻击力、攻速、格挡、冲锋 / 穿刺、盔甲值', cards: ['#攻击', 'attackDamage', 'attackSpeed', 'weapon', 'reach', 'swing', A('minimum_attack_charge'), A('damage_type'), A('kinetic_weapon'), A('piercing_weapon'), '#防御', 'armorValue', 'armorToughness', 'knockbackResist', A('blocks_attacks'), ['extraAttrs', [], '属性加成']] },
  { id: 'u-dura', label: '耐久与附魔', alt: '更多耐久', home: ['dura', 'stack'], icon: 'shield', desc: '耐久、堆叠、修复、附魔', cards: ['#耐久与堆叠'].concat(DURA, ['#附魔', 'enchantable', ['enchants', 'enchantments']]) },
  { id: 'u-look', label: '外观与声音', alt: '更多外观', icon: 'palette', desc: '名称、提示框样式、模型、音效、染色、纹饰', cards: ['#名称与显示'].concat(APPEAR, [A('item_name'), A('tooltip_style'), A('custom_model_data'), '#染色与纹饰', 'dye', 'trim', A('provides_trim_material'), '#声音', A('break_sound'), A('note_block_sound'), A('instrument'), A('jukebox_playable')]) },
  { id: 'u-banner', label: '旗帜图案', alt: '旗帜图案', icon: 'banner', desc: '旗帜图案、底色与图案材料', cards: ['#旗帜图案', A('banner_patterns'), A('base_color'), '#作为材料', A('provides_banner_patterns')] },
  { id: 'u-world', label: '放置与数据', icon: 'cube', desc: '放置与破坏规则、方块与实体数据、容器、地图', cards: ['#放置与破坏', A('can_place_on'), A('can_break'), A('block_state'), '#方块与实体数据', A('block_entity_data'), A('entity_data'), A('bucket_entity_data'), A('custom_data'), '#容器', A('lock'), A('container_loot'), A('bees'), A('pot_decorations'), '#玩家与物品', A('profile'), A('charged_projectiles'), A('recipes'), '#地图与追踪', A('map_id'), A('map_color'), A('map_decorations'), A('lodestone_tracker'), '#调试', A('debug_stick_state')] },
];
function ownKeys(kind) { var m = {}; (PAGES[kind] || PAGES.generic).forEach(function (t) { t.cards.forEach(function (c) { m[cardKey(c)] = 1; }); }); return m; }
/* 这类物品能打开的通用分页（去掉本类已有的卡片） */
function uniTabsFor(kind) {
  var own = ownKeys(kind), out = [];
  var haveTab = {}; (PAGES[kind] || PAGES.generic).forEach(function (t) { haveTab[t.id] = 1; });
  UNIVERSAL.forEach(function (u) {
    var cards = u.cards.filter(function (c) { return typeof c === 'string' && c.charAt(0) === '#' || !own[cardKey(c)]; });
    cards = cards.filter(function (c, i) { if (!(typeof c === 'string' && c.charAt(0) === '#')) return true; var n = cards[i + 1]; return n !== undefined && !(typeof n === 'string' && n.charAt(0) === '#'); });
    if (!cards.some(function (c) { return !(typeof c === 'string' && c.charAt(0) === '#'); })) cards = [];
    var more = (u.home || []).some(function (x) { return haveTab[x]; }) || u.id === 'u-look';
    if (cards.length) out.push({ id: u.id, label: more ? u.alt : u.label, icon: u.icon, desc: u.desc, cards: cards, force: true, uni: true });
  });
  return out;
}
/* 通用分页里：物品本来就带着、或用户改过的组件 → 自动显示在标签栏 */
function uniRelevant(t, d) {
  var p = protoOf(d.id);
  return t.cards.some(function (c) { return cardComps(c).some(function (cid) { return intentOf(d, cid) !== 'inherit'; }); });
}

/* 这类物品的页面已经覆盖的组件；其余被改动过的组件归入「附加设置」 */
function coveredComps(kind) {
  var m = {};
  (PAGES[kind] || PAGES.generic).concat(uniTabsFor(kind)).forEach(function (t) { t.cards.forEach(function (c) { cardComps(c).forEach(function (x) { m[x] = 1; }); }); });
  return m;
}
function extraCompIds(d, kind) {
  var cov = coveredComps(kind), seen = {}, out = [];
  Object.keys(d.comps).concat(Object.keys(d.removed)).forEach(function (c) { if (!cov[c] && !seen[c] && CIDX[c]) { seen[c] = 1; out.push(c); } });
  return out;
}
var CAT_ICON = { look: 'palette', dura: 'shield', combat: 'sword', ench: 'enchant', use: 'apple', equip: 'helmet', cont: 'chest', book: 'book', fx: 'potion_round', variant: 'paw' };
/* 通用卡片：按组件的数据结构自动生成表单。一行 = 标题 + 右侧开关；打开开关才展开设置 */
CARDS.auto = function (cid) {
  if (cid === 'use_effects') return CARDS.useEffects();
  var c = CIDX[cid]; if (!c) return null;
  var unit = c.schema && c.schema.t === 'unit';
  var headK = HEAD_AUTO[cid] ? 'body' : scalarHead(c.schema);
  var card = kCard({ id: 'auto-' + cid, icon: CAT_ICON[c.cat] || 'tag', title: c.name, desc: shortDesc(c.desc), comps: [cid], toggle: true, bare: unit, eager: !!headK }, Ctx);
  if (cid === 'can_place_on' || cid === 'can_break') card.make = function () {
    worldBlockPicker(null, function (blocks) { Ctx.enable(cid, { blocks: blocks }, '启用 ' + c.name); openDetail({ cid: cid }); }, '选择' + c.name + '的目标方块');
  };
  var it = Ctx.modified(cid) ? intentOf(Store.doc(), cid) : 'inherit';
  if (it === 'remove') {
    card.el.classList.add('off');
    return card;
  }
  if (!Ctx.has(cid)) { card.el.classList.add('off'); return card; }
  if (unit) return card;
  var d = Store.doc();
  if (headK && !DETAIL_IN) { headAuto(card, cid, c, headK, d.comps[cid] !== undefined ? d.comps[cid] : clone(Ctx.proto(cid))); return card; }
  if (DETAIL_AUTO[cid] && !DETAIL_IN) { detailize(card, { cid: cid, title: CIDX[cid].name }); return card; }
  if (AUTO_BODY[cid]) { AUTO_BODY[cid](card, cid, d.comps[cid] !== undefined ? d.comps[cid] : clone(Ctx.proto(cid))); if (c.app) card.body.appendChild(h('div', { class: 'k-note', text: c.app })); return card; }
  card.body.appendChild(renderComponentForm(cid, d.comps[cid] !== undefined ? d.comps[cid] : clone(Ctx.proto(cid)), function (v, o) { Store.set(cid, v, { key: 'f-' + cid + (o && o.key ? o.key : ''), structural: false }); }, d));
  if (c.app) card.body.appendChild(h('div', { class: 'k-note', text: c.app }));
  return card;
};
CARDS.raw = CARDS.auto;

/* 懒加载：折叠的卡片先只有卡片头；点开（或“展开全部”）时才真正构建内容并替换进页面 */
function lazyHook(stub) {
  function expand() {
    if (!stub.lazy) return;
    var lz = stub.lazy; stub.lazy = null;
    UIOpen['card:' + (stub.spec.id || stub.spec.title)] = false;
    KLAZY = 0;
    var real = lz.f.apply(null, lz.args);
    if (!real) return;
    if (stub.el.parentNode) stub.el.parentNode.replaceChild(real.el, stub.el);
    if (UI.page) for (var i = 0; i < UI.page.cards.length; i++) if (UI.page.cards[i] === stub) UI.page.cards[i] = real;
    try { real.update(); } catch (e) {}
    decorate(); if (typeof paintProblems === 'function') paintProblems();
    /* 第一次展开：真正的卡片是现建的，直接是展开状态，所以要补上和以后展开时同一个滑入动画（uiSlide） */
    if (real.body) uiSlide(real.body, true);
  }
  stub.onHead = function () { if (!stub.lazy) return false; expand(); return true; };
  var oc = stub.setCollapsed;
  stub.setCollapsed = function (v) { if (stub.lazy) { if (!v) expand(); } else oc(v); };
}
