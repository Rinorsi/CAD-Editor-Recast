/* 预览用：以世界玩家模式打开背包页 */
(function () {
  var slots = [];
  for (var i = 0; i < 43; i++) slots.push({ slot: i, stack: { empty: true } });
  function put(i, id, n, comps) { slots[i] = { slot: i, stack: { id: id, count: n, comps: comps || {}, removed: {} } }; }
  put(0, 'minecraft:diamond_sword', 1, { enchantments: { 'minecraft:sharpness': 5 } }); put(1, 'minecraft:golden_apple', 12); put(2, 'minecraft:dirt', 36); put(3, 'minecraft:arrow', 64);
  put(9, 'minecraft:oak_planks', 64); put(10, 'minecraft:emerald', 5, { rarity: 'epic' }); put(12, 'minecraft:iron_ingot', 20); put(20, 'minecraft:cobblestone', 64);
  put(39, 'minecraft:diamond_helmet', 1, { enchantments: { 'minecraft:protection': 4 } }); put(38, 'minecraft:iron_chestplate', 1);
  var player = { container: { size: 43, slots: slots }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, Health: 20, AbsorptionAmount: 0, food: { foodLevel: 20, saturation: 5 }, experience: { XpLevel: 3, XpP: 0.5, XpTotal: 20 },
    playerGameType: 'survival', abilities: {}, attributes: [], active_effects: [], Tags: [], CustomName: null,
    schema: { gameModes: ['survival', 'creative'], selectedSlotMax: 8, inventorySize: 43, enderSize: 27, equipmentSlots: [{ slot: 36, equipment: 'feet' }, { slot: 37, equipment: 'legs' }, { slot: 38, equipment: 'chest' }, { slot: 39, equipment: 'head' }, { slot: 40, equipment: 'offhand' }, { slot: 41, equipment: 'body' }, { slot: 42, equipment: 'saddle' }], attributes: [], bounds: {} } };
  Reg.ingest('registry.meta', { version: 1 });
  weOpen({ kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', dim: 'minecraft:overworld', player: 'self', token: 't' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'Rinorsi', uuid: 'u' }, views: { player: player } });
})();
