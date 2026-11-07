var WORLD_WHICH = 'pig';
/* 预览用：直接以世界编辑模式打开一个箱子 / 刷怪笼 */
(function () {
  var which = (typeof WORLD_WHICH !== 'undefined' ? WORLD_WHICH : 'chest');
  var slot = { kind: 'block', dim: 'minecraft:overworld', x: 12, y: 64, z: -3, token: 'tok' };
  var slots = [];
  for (var i = 0; i < 27; i++) slots.push({ slot: i, stack: { empty: true } });
  slots[0] = { slot: 0, stack: { id: 'minecraft:diamond_sword', count: 1, comps: { enchantments: { 'minecraft:sharpness': 5 } }, removed: {} } };
  slots[1] = { slot: 1, stack: { id: 'minecraft:golden_apple', count: 12, comps: {}, removed: {} } };
  slots[10] = { slot: 10, stack: { id: 'minecraft:arrow', count: 64, comps: {}, removed: {} } };
  var chest = { kind: 'block', type: 'minecraft:chest', block: 'minecraft:chest', block_state: { facing: 'north', type: 'single', waterlogged: 'false' }, slot: slot, revision: 'abc', canUndo: false,
    snbt: '{id:"minecraft:chest",x:12,y:64,z:-3,Items:[{Slot:0b,id:"minecraft:diamond_sword",count:1,components:{"minecraft:enchantments":{"minecraft:sharpness":5}}},{Slot:1b,id:"minecraft:golden_apple",count:12}]}',
    nbt: {}, container: { size: 27, kind: 'minecraft:chest', unresolved_loot: false, slots: slots }, views: {} };
  var spawner = { kind: 'block', type: 'minecraft:mob_spawner', block: 'minecraft:spawner', block_state: {}, slot: slot, revision: 'abc', canUndo: true,
    snbt: '{id:"minecraft:mob_spawner",x:12,y:64,z:-3,Delay:20s,MinSpawnDelay:200s,MaxSpawnDelay:800s,SpawnCount:4s,SpawnData:{entity:{id:"minecraft:zombie"}}}',
    nbt: { id: 'minecraft:mob_spawner', x: 12, y: 64, z: -3, Delay: 20, MinSpawnDelay: 200, MaxSpawnDelay: 800, SpawnCount: 4, SpawnData: { entity: { id: 'minecraft:zombie' } } }, views: {} };
  var pig = { kind: 'entity', type: 'minecraft:pig', slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', id: 5, token: 't' }, revision: 'r', canUndo: false, snbt: '{id:"minecraft:pig",Health:10.0f,NoAI:0b,Age:0}', nbt: {}, views: {} };
  Reg.ingest('registry.meta', { version: 1 });
  weOpen(which === 'spawner' ? spawner : which === 'pig' ? pig : chest);
})();
