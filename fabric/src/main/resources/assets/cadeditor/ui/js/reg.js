/* 实时注册表（宿主推送，见 docs/registry-contract.md）：附魔、状态效果、音效等一律从游戏当前世界的注册表来，
   没有宿主（浏览器 / 文件夹预览）时才退回 data.js 里的内置数据，并在界面上标明。 */
var Reg = {
  meta: null, kinds: {}, subs: [], cache: {},
  ingest: function (key, val) {
    if (key === 'search.result') { if (typeof HostSearch !== 'undefined') HostSearch.receive(val); return; }
    if (key === 'validate_component.result') { if (typeof Valid !== 'undefined') Valid.receive(val); return; }
    if (typeof key !== 'string' || key.indexOf('registry.') !== 0) return;
    if (key === 'registry.client_features') { if (val && val.accepted) this.features = val.accepted; if (val && val.lazy) this.setLazy(val.lazy); this.fire(); return; }
    if (key === 'registry.meta') { this.meta = val; this.cache = {}; if (val && val.lazy) this.setLazy(val.lazy); this.fire(); return; }
    if (!val || typeof val !== 'object') return;
    if (key === 'registry.relation') { this.ingestRel(val); return; }
    var kind = key.substring(9), k = this.kinds[kind];
    if (kind === 'item_defaults_one') { this.ingestDef(val); return; }
    if (kind === 'item_model_hints') { this.ingestHints(val); return; }
    if (kind === 'block_properties') { this.ingestBP(val); return; }
    if (kind === 'item_meta_one' || kind === 'item_meta') { this.ingestIM(kind, val); return; }
    if (kind === 'entity_base_attributes') { this.ingestEB(val); return; }
    if (kind === 'entity_info' || kind.indexOf('entity_info:') === 0) { this.ingestEI(val); return; }
    if (kind.indexOf('tag:') === 0) { this.ingestTag(kind, val); return; }
    if (!k || k.gen !== val.generation) { k = this.kinds[kind] = { gen: val.generation, entries: [], total: val.total || 0, done: false, name: val.name }; delete this.cache[kind]; }
    var off = val.offset || 0, ents = val.entries || [];
    for (var i = 0; i < ents.length; i++) k.entries[off + i] = ents[i];
    k.total = val.total || k.total; if (val.done) { k.done = true; delete this.cache[kind]; }
    if (val.availability === 'unavailable') k.unavail = String(val.reason || '服务器没有向客户端同步完整列表');   /* 远程服务器上的战利品表 / 配方等：空是“拿不到”，不是“没有” */
    this.fire(kind);
  },
  /* 物品原型默认组件：按需一件件向宿主要，来了再重画；没来之前用内置数据 */
  defs: {}, defAsk: {},
  ingestDef: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.defs[e.id] = e; });
    if (v.id && !ents.length) Reg.defs[v.id] = false;
    this.fire('item_defaults_one');
  },
  defaultsOf: function (full) {
    if (!this.live()) return null;
    var e = this.defs[full];
    if (e) return e.comps || null;
    if (e === undefined && !this.defAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.defAsk[full] = 1; oriel.send('registry', { name: 'item_defaults_one', id: full }); }
    return null;
  },
  /* 物品模型定义里实际用到的自定义模型数据（哪个下标、什么类型、有哪些取值） */
  hints: {}, hintAsk: {},
  ingestHints: function (v) {
    var id = v.id; if (!id) return;
    var cur = this.hints[id]; if (!cur || cur.gen !== v.generation) cur = this.hints[id] = { gen: v.generation, list: [], done: false, error: null };
    var off = v.offset || 0, ents = v.entries || [];
    for (var i = 0; i < ents.length; i++) cur.list[off + i] = ents[i];
    if (v.error) cur.error = v.error;
    if (v.done) { cur.done = true; this.fire('item_model_hints'); }
  },
  hintsOf: function (id) {
    if (!this.live()) return null;
    var h0 = this.hints[id];
    if (h0 && h0.done) return h0.list.filter(Boolean);
    if (!h0 && !this.hintAsk[id] && typeof oriel !== 'undefined' && oriel.send) { this.hintAsk[id] = 1; oriel.send('registry', { name: 'item_model_hints', id: id }); }
    return null;
  },
  /* 方块属性表（block_properties）：单个方块按需请求；成员很多的标签一次取全表。未知方块 = false，还在等 = null */
  bprops: {}, bpAsk: {}, bpAll: null,
  ingestBP: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.bprops[e.id] = e.properties || {}; });
    if (v.id && !ents.length) Reg.bprops[this.full(v.id)] = false;
    if (!v.id && v.done) this.bpAll = { done: true };
    this.fire('block_properties');
  },
  blockProps: function (full, bulk) {
    if (!this.live()) return false;
    full = this.full(full);
    var p = this.bprops[full];
    if (p !== undefined) return p;
    if (bulk) return this.bpAll && this.bpAll.done ? false : null;
    if (!this.bpAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.bpAsk[full] = 1; oriel.send('registry', { name: 'block_properties', id: full }); }
    return null;
  },
  blockPropsAll: function () {
    if (!this.live()) return true;
    if (this.bpAll && this.bpAll.done) return true;
    if (!this.bpAll && typeof oriel !== 'undefined' && oriel.send) { this.bpAll = { done: false }; oriel.send('registry', { name: 'block_properties' }); }
    return false;
  },
  /* 标签成员（tag:<注册表>）：id 不带 #；回来前返回 null */
  tags: {}, tagAsk: {},
  ingestTag: function (kind, v) {
    if (!v.id) return;
    var k = kind + '|' + this.full(v.id), cur = this.tags[k];
    if (!cur || cur.gen !== v.generation) cur = this.tags[k] = { gen: v.generation, list: [], done: false };
    var off = v.offset || 0, ents = v.entries || [];
    for (var i = 0; i < ents.length; i++) cur.list[off + i] = ents[i];
    if (v.done) { cur.done = true; this.fire(kind); }
  },
  tagMembers: function (regKind, id) {
    var kind = 'tag:' + regKind, full = this.full(id), k = kind + '|' + full, cur = this.tags[k];
    if (cur && cur.done) return cur.list.filter(Boolean);
    if (!this.live()) return [];
    if (!this.tagAsk[k] && typeof oriel !== 'undefined' && oriel.send) { this.tagAsk[k] = 1; oriel.send('registry', { name: kind, id: full }); }
    return null;
  },
  /* 实体信息（entity_info）：默认属性、刷怪蛋、装备槽、变种来源、默认 NBT 模板。按需请求；未知 = false，还在等 = null */
  einfo: {}, eiAsk: {},
  ingestEI: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.einfo[e.id] = e; });
    if (v.id && !ents.length) Reg.einfo[this.full(v.id)] = false;
    this.fire('entity_info');
  },
  entityInfo: function (full) {
    if (!this.live()) return false;
    full = this.full(full);
    var p = this.einfo[full];
    if (p !== undefined) return p;
    if (!this.eiAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.eiAsk[full] = 1; oriel.send('registry', { name: 'entity_info', id: full }); }
    return null;
  },
  /* 物品元信息（item_meta_one / item_meta）：武器 / 工具 / 食物 / 盔甲槽 / 容器格数 / 收纳袋容量 / 刷怪蛋实体 等事实。
     单件按需请求；全表到齐后没有的就是未知。未到 = null，未知 = false */
  imeta: {}, imAsk: {}, imAll: false,
  ingestIM: function (kind, v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.imeta[e.id] = e; });
    if (kind === 'item_meta_one' && v.id && !ents.length) this.imeta[this.full(v.id)] = false;
    if (kind === 'item_meta' && v.done) this.imAll = true;
    this.fire(kind);
  },
  itemMeta: function (full) {
    if (!this.live()) return false;
    full = this.full(full);
    var m = this.imeta[full];
    if (m !== undefined) return m;
    if (this.imAll) return false;
    if (!this.imAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.imAsk[full] = 1; oriel.send('registry', { name: 'item_meta_one', id: full }); }
    return null;
  },
  /* 整张表按需取（枚举、装备槽组……）：到齐返回条目数组，没到返回 null 并只请求一次 */
  tblAsk: {},
  table: function (name) {
    var k = this.kinds[name];
    if (k && k.done) return k.entries.filter(Boolean);
    if (!this.live()) return null;
    if (!this.tblAsk[name]) { this.tblAsk[name] = 1; this.request(name); }
    return null;
  },
  /* 实体基础属性（entity_base_attributes）：玩家的攻击伤害 / 攻击速度基础值等，替换手写的 1 和 4。取不到（离线 / 还没到）用 dflt */
  ebase: {}, ebAsk: {},
  ingestEB: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.ebase[e.id] = e.attributes || {}; });
    if (v.id && !ents.length) this.ebase[this.full(v.id)] = false;
    this.fire('entity_base_attributes');
  },
  baseAttr: function (entity, attr, dflt) {
    if (!this.live()) return dflt;
    entity = this.full(entity);
    var m = this.ebase[entity];
    if (m === undefined && !this.ebAsk[entity] && typeof oriel !== 'undefined' && oriel.send) { this.ebAsk[entity] = 1; oriel.send('registry', { name: 'entity_base_attributes', id: entity }); }
    var v = m ? m[this.full(attr)] : undefined;
    return typeof v === 'number' ? v : dflt;
  },
  /* 宿主搜索（search 消息）里这类候选对应的 kind：和 options() 用同一套映射 */
  hostKind: function (reg) { return this.KIND[reg] || (this.isDirect(reg) ? reg : 'minecraft:' + reg); },
  /* 请求名就是它自己、不带 minecraft: 前缀的：枚举 / 标签（带冒号）和资源 ID 类（装备外观、提示框样式、物品模型、遮罩与皮肤贴图） */
  DIRECT: { equipment_asset: 1, tooltip_style: 1, item_model: 1, camera_overlay: 1, profile_texture: 1, profile_cape: 1, profile_elytra: 1 },
  isDirect: function (reg) { return reg.indexOf(':') > 0 || this.DIRECT[reg] === 1; },
  /* 这类注册表在当前连接里是否“拿不到完整列表”（远程服务器）：返回原因文字，否则 null。拿不到时必须保留手动输入 */
  unavailable: function (reg) {
    var kind = this.KIND[reg] || (this.isDirect(reg) ? reg : 'minecraft:' + reg), k = this.kinds[kind];
    return k && k.unavail ? k.unavail : null;
  },
  tagsOf: function (full) { var e = this.defs[full]; return e && e.tags ? e.tags : null; },
  /* 大数组（适用物品/互斥附魔太多）被宿主改为延迟加载：条目带 xxx_ref，按需请求，分页回来后合并 */
  rel: {}, relAsk: {},
  ingestRel: function (v) {
    if (!v.id || !v.field) return;
    var k = v.id + '|' + v.field, r = this.rel[k];
    if (!r || r.gen !== v.generation) r = this.rel[k] = { gen: v.generation, list: [], done: false };
    var off = v.offset || 0, ents = v.entries || [];
    for (var i = 0; i < ents.length; i++) r.list[off + i] = ents[i];
    if (v.done) { r.done = true; delete this.cache.enchantments; this.fire('enchantments'); }
  },
  relOf: function (e, field) {
    var ref = e[field + '_ref']; if (!ref) return e[field] || [];
    var k = ref.id + '|' + ref.field, r = this.rel[k];
    if (r && r.done) return r.list;
    if (!this.relAsk[k] && typeof oriel !== 'undefined' && oriel.send) { this.relAsk[k] = 1; oriel.send('registry', { name: ref.name, id: ref.id, field: ref.field }); }
    return null;   // 还没回来：当作未知，不是「没有」
  },
  /* 通知订阅者：同一批到达的多页合并成一次（宿主一页一页推送，不合并的话每页都会重建列表、重画界面，既闪又会触发引擎的停页保护）。
     订阅者收到 (kind, kinds)：kind 是这一批里第一个种类，kinds 是这一批出现过的全部种类。 */
  pendingKinds: [], fireTimer: null,
  fire: function (kind) {
    if (kind !== undefined && this.pendingKinds.indexOf(kind) < 0) this.pendingKinds.push(kind);
    if (this.fireTimer !== null) return;
    if (typeof setTimeout !== 'function') { this.flush(); return; }
    this.fireTimer = setTimeout(function () { Reg.fireTimer = null; Reg.flush(); }, 160);
  },
  flush: function () {
    var kinds = this.pendingKinds; this.pendingKinds = [];
    try { syncEnums(); } catch (e) {}
    this.subs.slice().forEach(function (f) { try { f(kinds[0], kinds); } catch (e) {} });
  },
  on: function (f) { this.subs.push(f); return function () { Reg.subs = Reg.subs.filter(function (x) { return x !== f; }); }; },
  attach: function () {
    if (typeof oriel === 'undefined') return;
    /* 告诉宿主：这个页面会用搜索 / 精确查询取大目录，不必再把物品、方块、音效、标签等整张表推过来（lazy-catalog-v1）。必须是第一条 registry 消息 */
    try { if (oriel.send) oriel.send('registry', { name: 'client_features', features: ['lazy-catalog-v1'] }); } catch (e) {}
    var d = oriel.data || {}; for (var k in d) if (k.indexOf('registry.') === 0) this.ingest(k, d[k]);
    if (oriel.on) oriel.on('patch', function (p) { if (p && p.key) Reg.ingest(p.key, p.value); });
  },
  /* 取任意注册表（含模组自己的）：页面发请求，宿主回 registry.<name> */
  request: function (name) { if (typeof oriel !== 'undefined' && oriel.send && this.meta) oriel.send('registry', { name: name }); },
  live: function () { return !!this.meta; },
  has: function (kind) { if (this.lazy[kind] !== undefined) return true; var k = this.kinds[kind]; return !!(k && k.entries.length); },
  list: function (kind) { var k = this.kinds[kind]; return k ? k.entries.filter(Boolean) : null; },
  full: function (id) { id = String(id || ''); return id.indexOf(':') < 0 ? 'minecraft:' + id : id; },
  isMod: function (full) { return full.indexOf('minecraft:') !== 0; },

  /* ---- 归一化视图（实时优先，缺了退回内置数据）---- */
  enchants: function () {
    if (this.cache.enchantments) return this.cache.enchantments;
    var live = this.list('enchantments'), out;
    if (live) out = live.map(function (e) {
      return { full: e.id, name: e.name || e.id, desc: e.desc || '', max: e.max_level || 1, excl: Reg.relOf(e, 'exclusive') || [], supported: (e.supported || e.supported_ref) && Reg.relOf(e, 'supported') ? setOf(Reg.relOf(e, 'supported')) : null, primary: Reg.relOf(e, 'primary') || [], tags: e.tags || [], weight: e.weight, anvil: e.anvil_cost, live: true };
    });
    else out = (EDATA.enchants || []).map(function (e) {
      return { full: 'minecraft:' + e.id, name: e.name, desc: e.desc || '', max: e.max, excl: (e.excl || []).map(Reg.full), supported: setOf((e.items || []).map(Reg.full)), primary: [], tags: [], live: false };
    });
    return (this.cache.enchantments = out);
  },
  effects: function () {
    if (this.cache.mob_effects) return this.cache.mob_effects;
    var live = this.list('mob_effects'), out;
    if (live) out = live.map(function (e) { return { full: e.id, name: e.name || e.id, cat: e.category || 'neutral', color: e.color, instant: !!e.instant, desc: '', live: true }; });
    else out = (EDATA.effects || []).map(function (e) { return { full: 'minecraft:' + e.id, name: e.name, cat: e.kind === '正面' ? 'beneficial' : e.kind === '负面' ? 'harmful' : 'neutral', desc: e.desc || '', live: false }; });
    return (this.cache.mob_effects = out);
  },
  sounds: function () {
    if (this.cache.sounds) return this.cache.sounds;
    var live = this.list('sounds'), out;
    if (live) out = live.map(function (e) { return { full: e.id, name: e.subtitle || e.name || e.id, sub: e.subtitle || '', live: true }; });
    else out = [].concat(typeof SOUNDS !== 'undefined' ? SOUNDS : [], typeof EQ_SOUNDS !== 'undefined' ? EQ_SOUNDS : []).map(function (s) { return { full: s.v, name: s.label, sub: '', live: false }; });
    var seen = {}; out = out.filter(function (s) { if (seen[s.full]) return false; seen[s.full] = 1; return true; });
    return (this.cache.sounds = out);
  },
  KIND: { item: 'items', enchantment: 'enchantments', attribute: 'attributes', mob_effect: 'mob_effects', sound_event: 'sounds', block: 'blocks', entity_type: 'entity_types', damage_type: 'damage_types', instrument: 'instruments', jukebox_song: 'jukebox_songs', trim_material: 'trim_materials', trim_pattern: 'trim_patterns', banner_pattern: 'banner_patterns', potion: 'potions', painting_variant: 'painting_variants', data_component_type: 'data_component_types' },
  /* 通用候选：{v,label,sub}；没推送过的注册表（战利品表等）第一次用到时按需请求 */
  rowToOpt: function (reg, e) { return { v: e.id, label: e.subtitle && reg === 'sound_event' ? e.subtitle : ((reg === 'jukebox_song' && e.description) ? e.description : (e.name || e.id)), sub: e.id, n: e.count, rgb: e.rgb, sound: e.sound_event, len: e.length_in_seconds, frame: e.has_frame }; },
  options: function (reg) {
    var direct = this.isDirect(reg), kind = this.KIND[reg] || (direct ? reg : 'minecraft:' + reg), ck = 'opt:' + kind;
    if (this.lazyKind(reg)) return this.cachedOpts(reg);   /* 大目录不在页面里：只有已经查过 / 搜到过的行 */
    if (this.cache[ck]) return this.cache[ck];
    var l = this.list(kind);
    if (!l || !l.length) { if (!this.asked) this.asked = {}; if (!this.asked[kind]) { this.asked[kind] = 1; this.request(direct ? reg : 'minecraft:' + reg); } return null; }
    var out = l.map(function (e) { return Reg.rowToOpt(reg, e); });
    if (this.kinds[kind] && this.kinds[kind].done) this.cache[ck] = out;
    return out;
  },
  /* 属性自己的数值范围（游戏里 attribute 的 min/max）；没有就用 dflt */
  attrMax: function (id, dflt) { var l = this.list('attributes'), f = this.full(id); if (l) for (var i = 0; i < l.length; i++) if (l[i].id === f && typeof l[i].max === 'number') return l[i].max; return dflt; },
  nameOf2: function (reg, full) { var o = this.optionFor(reg, full); return o ? o.label : null; },
  /* 某个 ID 对应的候选行 {v,label,…}；大目录里没缓存的会在后台精确查询，到了会重画。没有 = null */
  optionFor: function (reg, full) {
    var f = this.full(full), lk = this.lazyKind(reg);
    if (lk) { var r = this.want(lk, f); return r ? this.rowToOpt(reg, r) : null; }
    var l = this.options(reg); if (!l) return null;
    for (var i = 0; i < l.length; i++) if (l[i].v === f) return l[i];
    return null;
  },
  nameOf: function (kind, full) {
    if (kind === 'sounds' && this.lazyKind('sound_event')) { var so = this.optionFor('sound_event', full); return so ? so.label : null; }
    var fn = kind === 'enchantments' ? this.enchants : kind === 'mob_effects' ? this.effects : kind === 'sounds' ? this.sounds : null;
    if (!fn) return null;
    var list = fn.call(this), f = this.full(full);
    for (var i = 0; i < list.length; i++) if (list[i].full === f) return list[i].name;
    return null;
  },
  itemName: function (full) {
    if (this.lazyKind('item')) { var r = this.want(this.lazyKind('item'), this.full(full)); return r ? (r.name || r.id) : null; }
    if (!this.has('items')) return null;
    var m = this.cache.itemMap; if (!m) { m = this.cache.itemMap = {}; this.list('items').forEach(function (e) { m[e.id] = e.name || e.id; }); }
    return m[this.full(full)] || null;
  },
  hasItem: function (full) { return this.itemName(full) !== null; },
  enchant: function (full) { var f = this.full(full), l = this.enchants(); for (var i = 0; i < l.length; i++) if (l[i].full === f) return l[i]; return null; }
};
/* 官方枚举值同步：界面里有中文说明/图标的手工表，只保留游戏里真实存在的值，游戏有而表里没有的值追加进来（原地修改，已有引用自动生效）。
   没有宿主时保持原表不动。 */
var ENUM_TABLES = [];
function regEnumTable(name, table, idOf, mk) { ENUM_TABLES.push({ name: name, table: table, orig: table.slice(), idOf: idOf, mk: mk }); }
function syncEnums() {
  ENUM_TABLES.forEach(function (t) {
    var live = Reg.options('enum:' + t.name); if (!live) return;
    var ids = {}; live.forEach(function (e) { ids[e.v] = e; });
    var out = t.orig.filter(function (x) { return ids[t.idOf(x)] || ids[Reg.full(t.idOf(x))]; });
    var have = {}; out.forEach(function (x) { have[t.idOf(x)] = 1; });
    live.forEach(function (e) { var k = e.v, sk = k.indexOf('minecraft:') === 0 && t.name !== 'consume_effect_type' ? k.substring(10) : k; if (!have[k] && !have[sk]) out.push(t.mk(sk, e.label === e.v ? humanId(shortId(e.v)) : e.label)); });
    t.table.length = 0; out.forEach(function (x) { t.table.push(x); });
  });
}
function setOf(arr) { var o = {}; (arr || []).forEach(function (x) { o[x] = 1; }); return o; }

/* 枚举字段 → 游戏里的枚举（enum:<名>）。候选以游戏为准；内置的 en 只是离线 / 数据没到之前的备用。
   这些都是 Java 枚举，写入值只能用条目的 id（不是 symbol）。 */
var LIVE_ENUM = { 'axolotl/variant': 'axolotl_variant', 'horse/variant': 'horse_variant', 'llama/variant': 'llama_variant', 'mooshroom/variant': 'mooshroom_variant', 'fox/variant': 'fox_variant', 'rabbit/variant': 'rabbit_variant', 'parrot/variant': 'parrot_variant', 'tropical_fish/pattern': 'tropical_fish_pattern', 'salmon/size': 'salmon_size', rarity: 'rarity' };
/* 返回 [{v,label}]，数据没到 / 离线 / 这个字段没有对应枚举时返回 null */
function liveEnumOptions(cid, path) {
  var name = cid && !path ? LIVE_ENUM[cid] : null;
  if (!name || typeof Reg === "undefined" || !Reg.live()) return null;
  var l = Reg.options('enum:' + name);
  if (!l || !l.length) return null;
  return l.map(function (e) { return { v: e.v, label: e.label && e.label !== e.v ? e.label : e.v, title: e.v }; });
}
function liveEnumHas(cid, path, v) {
  var l = liveEnumOptions(cid, path);
  if (!l) return false;
  for (var i = 0; i < l.length; i++) if (l[i].v === v) return true;
  return false;
}

/* ---- 大目录（lazy-catalog-v1）：物品 / 方块 / 音效 / 标签 / 资源 ID 等不再整张推进页面 ----
   宿主在 registry.meta.lazy / registry.client_features 里列出哪些 kind 是“按需”的。页面里只缓存搜到过 / 精确查过的行；
   选择窗走 search，已选值的名字走 lookup（批量，后台，到了重画）。老宿主没有 lazy 字段，一切照旧。 */
Reg.lazy = {}; Reg.features = null; Reg.rows = {}; Reg.lookPending = {}; Reg.lookAsked = {}; Reg.lookTimer = null; Reg.lookBusy = false;
Reg.setLazy = function (m) { for (var k in m) this.lazy[k] = (m[k] && typeof m[k].count === 'number') ? m[k].count : 0; this.cache = {}; };
/* reg 别名 → 它在 lazy 表里的 kind；不是大目录返回 null */
Reg.lazyKind = function (reg) {
  var k = this.hostKind(reg), alts = [k, reg, 'minecraft:' + reg];
  for (var i = 0; i < alts.length; i++) if (this.lazy[alts[i]] !== undefined) return alts[i];
  return null;
};
Reg.isLazy = function (reg) { return this.lazyKind(reg) !== null; };
Reg.noteRows = function (kind, entries) {
  var m = this.rows[kind] || (this.rows[kind] = {});
  (entries || []).forEach(function (e) { if (e && e.id) m[Reg.full(e.id)] = e; });
};
Reg.cachedOpts = function (reg) {
  var lk = this.lazyKind(reg), m = this.rows[lk] || {}, out = [];
  for (var id in m) if (m[id]) out.push(this.rowToOpt(reg, m[id]));
  return out;
};
/* 取一行（已缓存的立即返回；没有就排队批量精确查询，到了 Reg.fire 重画；查过没有的返回 null） */
Reg.want = function (kind, full) {
  var m = this.rows[kind] || (this.rows[kind] = {});
  if (m[full]) return m[full];
  if (m[full] === false || (this.lookAsked[kind] && this.lookAsked[kind][full])) return null;
  (this.lookPending[kind] || (this.lookPending[kind] = [])).push(full);
  (this.lookAsked[kind] || (this.lookAsked[kind] = {}))[full] = 1;
  if (!this.lookTimer) { this.lookTimer = setTimeout(function () { Reg.lookTimer = null; Reg.lookFlush(); }, 30); }
  return null;
};
Reg.lookFlush = function () {
  if (this.lookBusy) return;
  var kind = null, k;
  for (k in this.lookPending) if (this.lookPending[k].length) { kind = k; break; }
  if (!kind) return;
  var ids = this.lookPending[kind].splice(0, 64);
  this.lookBusy = true;
  var done = function (r) {
    Reg.lookBusy = false;
    var m = Reg.rows[kind] || (Reg.rows[kind] = {});
    if (r && !r.fallback) Reg.noteRows(kind, r.entries);
    ids.forEach(function (id) { if (!m[id]) m[id] = false; });   /* 查过没有的记 false，不再重复问 */
    Reg.fire('lookup:' + kind);
    Reg.lookFlush();
  };
  if (!HostSearch.query({ view: 'lookup', kind: kind, ids: ids, limit: 64 }, done)) done({ fallback: true });
};
