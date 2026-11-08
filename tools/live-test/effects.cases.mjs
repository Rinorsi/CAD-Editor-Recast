// Minecraft 26.1.2 IDs/field shapes checked against docs/component-schema-26.1.2.json.
// All edits are visible UI controls. No page controller functions or bridge sends.
export const controls = {
  advanced: { selector: '[title="高级：原始组件、SNBT、命令"]' },
  topMore: { selector: '#topbar [title="更多"]' },
  advancedMenu: { selector: '.k-menu .k-mi', text: '高级' },
  itemData: { selector: '.advnav-i', text: '物品数据' },
  fullData: { selector: '.k-chead', contains: '带类型的 SNBT' },
  snbt: { selector: 'textarea.ed-snbt' },
  stage: { selector: '.k-btn', text: '应用 Ctrl+Enter' },
  apply: { selector: '.k-apply' },
  confirm: { selector: '.k-btn', text: '应用到游戏' },
  state: { selector: '.ed-tab', text: '状态' },
  data: { selector: '.ed-tab', text: '数据' },
  health: { selector: 'input.k-numin', label: '生命' },
  saturation: { selector: 'input.k-numin', label: '饱和度' },
  food: { selector: 'input.k-numin', label: '饥饿值' },
  current: { selector: '.k-chead', contains: '生命与饥饿' },
  blockName: { selector: 'input[placeholder="输入新名称；留空 = 恢复默认名称"]' },
  nameCard: { selector: '.k-chead', contains: '留空 = 用方块原来的名字' },
  sign: { selector: 'input.we-line', index: 0 },
  signCard: { selector: '.k-chead', contains: '文字' },
  entityTab: { selector: '.ed-tab', text: '属性' },
  entityCommon: { selector: '.k-chead', contains: '常用设置' },
  entityHealth: { selector: 'input.k-numin', label: '生命值' },
  entityName: { selector: 'input[placeholder="不填就没有名字"]' },
  vault: { selector: '[title="保险库：存入改好的物品，之后取出放进槽位"]' },
  saveItem: { selector: '.k-btn', text: '存入当前物品' },
  save: { selector: '.k-btn', text: '存入' },
  give: { selector: '.k-btn', text: '给我' },
};
const item = (name, component, base, value, effect, extra = {}) => ({
  name, tier: 'quick', page: 'item', components: [component], base,
  edit: { kind: 'stack', stack: `{id:"minecraft:${base}",count:1,components:{"minecraft:${component}":${value}}}` },
  effect, ...extra,
});
const tooltip = text => ({ kind: 'tooltip', contains: text });
const data = (component, value) => ({ kind: 'component', predicate: `minecraft:${component}=${value}`, note: '无游戏效果可观察：本套仅验数据保存，不代表视觉验收' });
export const cases = [
  item('attack-damage', 'attribute_modifiers', 'stick', '[{type:"minecraft:attack_damage",id:"effects:test",amount:8,operation:"add_value",slot:"mainhand"}]', { kind: 'attack', damage: 9 }),
  item('sharpness', 'enchantments', 'diamond_sword', '{"minecraft:sharpness":3}', { kind: 'attack', damage: 9 }),
  item('food-nutrition', 'food', 'apple', '{nutrition:6,saturation:0}', { kind: 'eat', food: 10, initialFood: 4 }),
  item('consume-fast', 'consumable', 'apple', '{consume_seconds:0.1}', { kind: 'eat', food: 8, initialFood: 4, ticks: 5 }),
  item('unbreakable-mining', 'unbreakable', 'diamond_pickaxe', '{}', { kind: 'mine', damage: 0 }),
  item('max-durability', 'max_damage', 'diamond_pickaxe', '2000', { kind: 'mine', damage: 1, maxDamage: 2000 }),
  item('damage-mining', 'damage', 'diamond_pickaxe', '20', { kind: 'mine', damage: 21 }),
  item('tool-wear', 'tool', 'diamond_pickaxe', '{rules:[],default_mining_speed:100,damage_per_block:3}', { kind: 'mine', damage: 3 }),
  item('weapon-wear', 'weapon', 'diamond_sword', '{item_damage_per_attack:4}', { kind: 'attack', damage: 7, wear: 4 }),
  item('stack-pickup', 'max_stack_size', 'ender_pearl', '32', { kind: 'pickup', count: 32 }, { edit: { kind: 'stack', stack: '{id:"minecraft:ender_pearl",count:16,components:{"minecraft:max_stack_size":32}}' } }),
  item('custom-name', 'custom_name', 'stick', '"EffectsName"', tooltip('EffectsName')),
  item('lore', 'lore', 'stick', '["EffectsLore"]', tooltip('EffectsLore')),
  item('rarity', 'rarity', 'stick', '"epic"', { kind: 'rarity', predicate: 'minecraft:rarity="epic"', contains: '木棍', note: 'MCTest 26.1.2.1 tooltip 仅返回纯文本：校验稀有度数据和提示行，颜色视觉待人工核对' }),
  item('item-name', 'item_name', 'stick', '"EffectsBaseName"', tooltip('EffectsBaseName')),
  item('stored-sharpness', 'stored_enchantments', 'enchanted_book', '{"minecraft:sharpness":3}', tooltip('锋利')),
  item('potion-speed', 'potion_contents', 'potion', '{potion:"minecraft:swiftness"}', { kind: 'drink', effect: 'minecraft:speed' }),
  item('use-remainder', 'use_remainder', 'apple', '{id:"minecraft:bowl",count:1}', { kind: 'eat', food: 8, initialFood: 4, remainder: 'minecraft:bowl' }),
  item('equip-head', 'equippable', 'stick', '{slot:"head"}', { kind: 'equip', slot: 39, item: 'minecraft:stick' }),
  item('container-placement', 'container', 'chest', '[{slot:0,item:{id:"minecraft:diamond",count:3}}]', { kind: 'place-container', contains: 'minecraft:diamond', count: 3 }),
  item('potion-duration', 'potion_duration_scale', 'potion', '2.0', { kind: 'drink', effect: 'minecraft:speed', minDuration: 7000 }, { setupItem: 'potion[potion_contents={potion:"minecraft:swiftness"}]', edit: { kind: 'stack', stack: '{id:"minecraft:potion",count:1,components:{"minecraft:potion_contents":{potion:"minecraft:swiftness"},"minecraft:potion_duration_scale":2.0}}' } }),
  item('custom-model', 'custom_model_data', 'stick', '{floats:[7.0]}', data('custom_model_data', '{floats:[7.0]}')),
  item('item-model', 'item_model', 'stick', '"minecraft:diamond"', data('item_model', '"minecraft:diamond"')),
  item('dyed-color', 'dyed_color', 'leather_chestplate', '16711680', data('dyed_color', '16711680')),
  item('map-color', 'map_color', 'filled_map', '65280', data('map_color', '65280')),
  item('glint', 'enchantment_glint_override', 'stick', 'true', data('enchantment_glint_override', 'true')),
  { name: 'block-name', tier: 'quick', page: 'block', components: [], setup: ['setblock 0 -60 3 minecraft:chest'], edit: { kind: 'fields', fields: [{ control: 'nameCard', expand: true }, { control: 'blockName', value: 'EffectsChest' }] }, effect: { kind: 'block', contains: 'EffectsChest' } },
  { name: 'block-sign', tier: 'quick', page: 'block', components: [], setup: ['setblock 0 -60 3 minecraft:oak_sign'], edit: { kind: 'fields', fields: [{ control: 'signCard', expand: true }, { control: 'sign', value: 'EffectsSign' }] }, effect: { kind: 'block', contains: 'EffectsSign' } },
  { name: 'entity-name', tier: 'quick', page: 'entity', components: [], setup: ['summon minecraft:pig 0.5 -60 3 {NoAI:1b,Tags:["effects"]}'], edit: { kind: 'fields', fields: [{ control: 'entityTab' }, { control: 'entityCommon', expand: true }, { control: 'entityName', value: 'EffectsPig' }] }, effect: { kind: 'entity', field: 'customName', expected: 'EffectsPig' } },
  { name: 'entity-health', tier: 'quick', page: 'entity', components: [], setup: ['summon minecraft:pig 0.5 -60 3 {NoAI:1b,Tags:["effects"]}'], edit: { kind: 'fields', fields: [{ control: 'entityTab' }, { control: 'entityCommon', expand: true }, { control: 'entityHealth', value: '6' }] }, effect: { kind: 'entity', field: 'health', expected: 6 } },
  { name: 'player-health', tier: 'quick', page: 'player', components: [], edit: { kind: 'fields', fields: [{ control: 'state' }, { control: 'current', expand: true }, { control: 'health', value: '12' }] }, effect: { kind: 'player', field: 'health', expected: 12 } },
  { name: 'player-food', tier: 'quick', page: 'player', components: [], edit: { kind: 'fields', fields: [{ control: 'state' }, { control: 'current', expand: true }, { control: 'food', value: '7' }] }, effect: { kind: 'player', field: 'food', expected: 7 } },
  { name: 'vault-roundtrip', tier: 'quick', page: 'vault', components: [], base: 'diamond', edit: { kind: 'vault' }, effect: { kind: 'inventory-count', item: 'minecraft:diamond', expected: 2 } },
];
export function referencedControls(c) {
  if (c.skip) return [];
  const keys = c.edit.kind === 'stack' ? ['advanced', 'topMore', 'advancedMenu', 'itemData', 'snbt', 'stage', 'apply', 'confirm']
    : c.edit.kind === 'world-data' ? ['data', 'snbt', 'apply']
    : c.edit.kind === 'vault' ? ['vault', 'saveItem', 'save', 'give']
    : [...c.edit.fields.map(f => f.control), 'apply'];
  return [...new Set(keys)];
}
