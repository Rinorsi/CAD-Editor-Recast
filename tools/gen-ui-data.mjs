// 从调研基线生成编辑器 UI 的数据文件（26.1.2 精确版本）。
// 用法：node tools/gen-ui-data.mjs
// 输出：common/src/main/resources/assets/cadeditor/ui/js/data.js（全局 EDATA）。生成物不要手改。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(path.resolve(root, '../Oriel-UI-Workspace/research/editor'), 'minecraft-editor-baseline');
const J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const V = '26.1.2';

const fg = J('items/field-guide.json');
const itemsDb = J('items/items.json');
const ench = J('shared/enchantments-guide.json');
const reg = J('shared/registries.json');

// ---------- 结构定义 -> 精简 UI schema ----------
const strip = s => s.replace(/^minecraft:/, '');
function conv(s, depth = 0) {
  if (!s || typeof s !== 'object') return { t: 'raw' };
  if (depth > 6) return { t: 'raw' };
  switch (s.type) {
    case 'reference': {
      const d = s.definition || '';
      const name = d.split('/').pop();
      if (/definitions\/text$/.test(d) || name === 'text_component' || name === 'text') return { t: 'text' };
      if (name === 'item_stack_template') return { t: 'stack' };
      if (name === 'item_predicate' || name === 'block_predicate' || name === 'state_predicate') return { t: 'raw', hint: name };
      const def = fg.definitions[name];
      return def ? conv(def, depth + 1) : { t: 'raw', hint: name };
    }
    case 'object': {
      if (s.additionalProperties) {
        return { t: 'map', k: s.key_schema ? conv(s.key_schema, depth + 1) : { t: 'str' }, v: conv(s.additionalProperties, depth + 1) };
      }
      const fields = s.fields || {};
      const keys = Object.keys(fields);
      if (!keys.length) return { t: 'unit', d: s.meaning_zh || '' };
      return {
        t: 'obj',
        f: keys.map(k => {
          const f = fields[k];
          const o = { k, s: conv(f.schema, depth + 1) };
          if (f.required) o.r = 1;
          if (f.default !== undefined) o.df = f.default;
          if (f.description_zh) o.d = f.description_zh;
          return o;
        }),
      };
    }
    case 'array': {
      const o = { t: 'arr', i: conv(s.items, depth + 1) };
      if (s.minItems) o.min = s.minItems;
      if (s.maxItems) o.max = s.maxItems;
      return o;
    }
    case 'string': {
      const o = { t: 'str' };
      if (s.enum) o.en = s.enum;
      if (s.registry) o.reg = strip(s.registry);
      if (s.format === 'tag_reference') o.tag = 1;
      return o;
    }
    case 'integer': case 'number': {
      const o = { t: s.type === 'integer' ? 'int' : 'num' };
      if (s.minimum !== undefined) o.min = s.minimum;
      if (s.maximum !== undefined) o.max = s.maximum;
      return o;
    }
    case 'boolean': return { t: 'bool' };
    case 'union': return { t: 'union', a: (s.alternatives || []).map(a => conv(a, depth + 1)) };
    case 'discriminated_union': {
      const br = {};
      for (const [k, v] of Object.entries(s.branches || {})) br[k] = conv(v, depth + 1);
      return { t: 'dunion', disc: s.discriminator || 'type', br };
    }
    case 'compound_nbt': case 'nbt_by_block_entity_id': case 'nbt_by_entity_id': return { t: 'nbt' };
    default: return { t: 'raw', hint: String(s.type) };
  }
}

// ---------- 组件目录：名称 / 分类 ----------
const CATS = [
  { id: 'look', name: '外观与文本', icon: 'palette' },
  { id: 'dura', name: '耐久与堆叠', icon: 'shield' },
  { id: 'combat', name: '战斗与工具', icon: 'sword' },
  { id: 'ench', name: '附魔', icon: 'enchant' },
  { id: 'use', name: '食用与使用', icon: 'apple' },
  { id: 'equip', name: '装备与纹饰', icon: 'helmet' },
  { id: 'cont', name: '容器与数据', icon: 'chest' },
  { id: 'book', name: '书、地图与标牌', icon: 'book' },
  { id: 'fx', name: '烟花、药水与音效', icon: 'potion_round' },
  { id: 'variant', name: '实体变种与颜色', icon: 'paw' },
];
const NAME = {
  custom_name: ['自定义名称', 'look'], item_name: ['基础名称', 'look'], lore: ['说明文字', 'look'], rarity: ['稀有度', 'look'],
  tooltip_display: ['提示框显示', 'look'], tooltip_style: ['提示框样式', 'look'], item_model: ['物品模型', 'look'],
  custom_model_data: ['自定义模型数据', 'look'], dyed_color: ['染色', 'look'], enchantment_glint_override: ['附魔光效', 'look'],
  damage: ['已损耗耐久', 'dura'], max_damage: ['最大耐久', 'dura'], max_stack_size: ['最大堆叠', 'dura'], unbreakable: ['不可破坏', 'dura'],
  repair_cost: ['铁砧惩罚', 'dura'], repairable: ['可修复材料', 'dura'], damage_resistant: ['免疫伤害', 'dura'], break_sound: ['损坏音效', 'dura'],
  attribute_modifiers: ['属性修饰器', 'combat'], weapon: ['武器', 'combat'], tool: ['工具', 'combat'], attack_range: ['攻击范围', 'combat'],
  piercing_weapon: ['穿刺武器', 'combat'], kinetic_weapon: ['动能武器', 'combat'], blocks_attacks: ['格挡', 'combat'],
  minimum_attack_charge: ['最小攻击充能', 'combat'], damage_type: ['攻击伤害类型', 'combat'], swing_animation: ['挥动动画', 'combat'],
  enchantments: ['附魔', 'ench'], stored_enchantments: ['存储的附魔', 'ench'], enchantable: ['可附魔性', 'ench'],
  food: ['食物', 'use'], consumable: ['消耗行为', 'use'], use_remainder: ['使用后剩余', 'use'], use_cooldown: ['使用冷却', 'use'],
  use_effects: ['使用时效果', 'use'], death_protection: ['死亡保护', 'use'], ominous_bottle_amplifier: ['不祥之瓶强度', 'use'],
  suspicious_stew_effects: ['谜之炖菜效果', 'use'], intangible_projectile: ['不可拾取投射物', 'use'],
  equippable: ['可装备', 'equip'], glider: ['滑翔', 'equip'], trim: ['盔甲纹饰', 'equip'], provides_trim_material: ['提供纹饰材料', 'equip'],
  provides_banner_patterns: ['提供旗帜图案', 'equip'], banner_patterns: ['旗帜图案', 'equip'], base_color: ['盾牌底色', 'equip'],
  container: ['容器内容', 'cont'], container_loot: ['容器战利品', 'cont'], bundle_contents: ['收纳袋内容', 'cont'], bees: ['蜜蜂', 'cont'],
  block_entity_data: ['方块实体数据', 'cont'], block_state: ['方块状态', 'cont'], entity_data: ['实体数据', 'cont'],
  bucket_entity_data: ['桶内实体数据', 'cont'], custom_data: ['自定义数据', 'cont'], lock: ['容器锁', 'cont'],
  charged_projectiles: ['已装填弹药', 'cont'], can_break: ['可破坏方块', 'cont'], can_place_on: ['可放置于', 'cont'],
  debug_stick_state: ['调试棒状态', 'cont'], pot_decorations: ['陶罐装饰', 'cont'], profile: ['头颅档案', 'cont'],
  written_book_content: ['成书内容', 'book'], writable_book_content: ['书与笔内容', 'book'], map_color: ['地图颜色', 'book'],
  map_decorations: ['地图标记', 'book'], map_id: ['地图编号', 'book'], lodestone_tracker: ['磁石追踪', 'book'], recipes: ['解锁配方', 'book'],
  fireworks: ['烟花', 'fx'], firework_explosion: ['烟花爆炸', 'fx'], potion_contents: ['药水内容', 'fx'],
  potion_duration_scale: ['药水时长倍率', 'fx'], instrument: ['乐器', 'fx'], jukebox_playable: ['唱片', 'fx'], note_block_sound: ['音符盒音效', 'fx'],
  dye: ['染料', 'fx'],
};
function nameOf(id, zh) {
  if (NAME[id]) return NAME[id];
  if (id.includes('/')) return ['变种 · ' + id.replace('/variant', '').replace('/', ' '), 'variant'];
  return [zh, 'cont'];
}

const comps = [];
for (const c of fg.components) {
  const v = c.version_matrix[V];
  if (!v || v.availability !== 'persistent') continue;
  const id = strip(c.id);
  const [name, cat] = nameOf(id, c.name_zh);
  const o = { id, name, cat, desc: c.purpose_zh || '', schema: conv(v.structure) };
  if (c.applicability_zh) o.app = c.applicability_zh;
  if (c.default_and_omission_zh && /写\{\}|不是true/.test(v.structure.meaning_zh || '')) o.note = v.structure.meaning_zh;
  comps.push(o);
}
const order = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
comps.sort((a, b) => order[a.cat] - order[b.cat] || a.id.localeCompare(b.id));

// ---------- 附魔 ----------
const enchants = ench.entries.filter(e => e.versions[V] && e.versions[V].present).map(e => {
  const vi = e.versions[V].variant_index || 0;
  const v = e.variants[vi] || e.variants[0];
  return {
    id: strip(e.id), name: e.name_zh, max: v.max_level, slots: v.active_slots || [],
    excl: (v.exclusive_enchantments || []).map(strip),
    items: (v.supported_items || []).map(strip),
    desc: e.effect_zh || e.purpose_zh || '',
  };
});

// ---------- 属性 / 效果 ----------
const rng = Object.fromEntries((reg.attribute_ranges[V] || []).map(r => [r.id, r]));
const attrs = (reg.inventory['minecraft:attribute'] || []).filter(a => a.versions[V] === 'present').map(a => {
  const r = rng[a.id] || {};
  return { id: strip(a.id), name: a.display_name_zh || strip(a.id), desc: a.effect_zh || '', def: r.default_expression, min: r.minimum_expression, max: r.maximum_expression };
});
const effects = (reg.inventory['minecraft:mob_effect'] || []).filter(a => a.versions[V] === 'present').map(a => ({
  id: strip(a.id), name: a.display_name_zh || strip(a.id), kind: a.classification || '', desc: a.effect_zh || '',
}));

// ---------- 中文名（来自本机 26.1.2 的 zh_cn.json 副本） ----------
const lang = JSON.parse(fs.readFileSync(path.join(path.resolve(root, '../Oriel-UI-Workspace/research/editor'), 'lang/zh_cn-26.1.2.json'), 'utf8'));
const nameOfItem = id => lang['item.minecraft.' + id] || lang['block.minecraft.' + id] || null;
for (const e of effects) { const n = lang['effect.minecraft.' + e.id]; if (n) e.name = n; }
for (const a of attrs) { const n = lang['attribute.name.' + a.id]; if (n) a.name = n; }
for (const e of enchants) { const n = lang['enchantment.minecraft.' + e.id]; if (n) e.name = n; }
const sub = (prefix, strip2) => { const o = {}; for (const [k, v] of Object.entries(lang)) if (k.startsWith(prefix)) o[k.slice(strip2 ?? prefix.length)] = v; return o; };
const L = {
  trimMaterial: sub('trim_material.minecraft.'), trimPattern: sub('trim_pattern.minecraft.'), instrument: sub('instrument.minecraft.'),
  potion: sub('item.minecraft.potion.effect.'), color: sub('color.minecraft.'), banner: sub('block.minecraft.banner.'),
};

// ---------- 物品 ----------
const present = itemsDb.items.filter(i => i.versions['26.1'] && i.versions['26.1'].present);
const items = present.map(i => strip(i.id));

// 有"物品贴图"的是平面物品；没有的是方块物品（游戏里按方块模型绘制）
const listing = execFileSync('unzip', ['-Z1', path.resolve(root, '../Oriel-UI/common/versions/26.1/build/moddev/artifacts/vanilla-26.1.2-1-merged.jar')], { maxBuffer: 1 << 26 }).toString().split('\n');
const flatTex = new Set(listing.filter(f => /^assets\/minecraft\/textures\/item\/[^/]+\.png$/.test(f)).map(f => f.replace(/^.*\//, '').replace('.png', '')));

function kindOf(id, dc) {
  const has = k => dc['minecraft:' + k] !== undefined;
  const eq = dc['minecraft:equippable'];
  if (id === 'enchanted_book') return 'ebook';
  if (has('potion_contents') && /potion$|tipped_arrow/.test(id)) return 'potion';
  if (id === 'written_book' || id === 'writable_book') return 'book';
  if (/(^|_)sword$|(^|_)axe$|^mace$|^trident$|_spear$|^spear$/.test(id) && !/pickaxe/.test(id)) return 'melee';
  if (id === 'bow' || id === 'crossbow') return 'ranged';
  if (has('blocks_attacks') || id === 'shield') return 'shield';
  if (has('tool')) return 'tool';
  if (eq && ['head', 'chest', 'legs', 'feet'].includes(eq.slot)) return 'armor';
  if (id === 'elytra') return 'armor';
  if (eq) return 'armor';
  if (has('food') || has('consumable')) return 'food';
  if (has('container') || has('bundle_contents')) return 'container';
  if (id === 'firework_rocket' || id === 'firework_star') return 'firework';
  if (has('banner_patterns') && /banner$/.test(id)) return 'banner';
  if (has('jukebox_playable')) return 'disc';
  if (/_spawn_egg$/.test(id)) return 'spawn';
  return 'generic';
}
const strip2 = dc => { const o = {}; for (const [k, v] of Object.entries(dc)) { if (['minecraft:item_model', 'minecraft:item_name', 'minecraft:break_sound'].includes(k)) continue; o[strip(k)] = v; } return o; };
const pt = [], ptIndex = new Map(), ipt = {}, ikind = {}, iname = {}, iblk = {};
for (const i of present) {
  const id = strip(i.id), dc = i.versions['26.1'].default_components || {};
  const p = strip2(dc), s = JSON.stringify(p);
  if (!ptIndex.has(s)) { ptIndex.set(s, pt.length); pt.push(p); }
  ipt[id] = ptIndex.get(s);
  ikind[id] = kindOf(id, dc);
  const n = nameOfItem(id); if (n) iname[id] = n;
  if (!flatTex.has(id)) iblk[id] = 1;
}
const kc = {}; for (const k of Object.values(ikind)) kc[k] = (kc[k] || 0) + 1;
console.log('kinds', JSON.stringify(kc));

const data = { version: V, cats: CATS, comps, enchants, attrs, effects, items, pt, ipt, ikind, iname, iblk, L };
const outDir = path.join(root, 'common/src/main/resources/assets/cadeditor/ui/js');
fs.mkdirSync(outDir, { recursive: true });
const text = '// 自动生成：node tools/gen-ui-data.mjs。勿手改。\nvar EDATA = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync(path.join(outDir, 'data.js'), text);
console.log('components', comps.length, 'enchants', enchants.length, 'attrs', attrs.length, 'effects', effects.length, 'items', items.length, 'protos', pt.length, 'named', Object.keys(iname).length, 'bytes', Buffer.byteLength(text));
const rawCount = JSON.stringify(comps).match(/"t":"raw"/g);
console.log('raw nodes', rawCount ? rawCount.length : 0);
