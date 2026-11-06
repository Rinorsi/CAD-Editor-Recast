/* 预览用：模拟游戏推送的注册表，再把页面切到刷怪设置 */
(function () {
  var which = (typeof SPAWN_WHICH !== 'undefined' ? SPAWN_WHICH : 'spawner');
  Reg.ingest('registry.meta', { version: 1 });
  Reg.ingest('registry.entity_types', { generation: 1, offset: 0, total: 3, done: true, entries: [{ id: 'minecraft:zombie', name: '僵尸' }, { id: 'minecraft:skeleton', name: '骷髅' }, { id: 'minecraft:pig', name: '猪' }] });
  Reg.ingest('registry.item_meta_one', { id: 'minecraft:spawner', entries: [{ id: 'minecraft:spawner', block_item: true, block_entity_type: 'minecraft:mob_spawner' }] });
  Reg.ingest('registry.item_meta_one', { id: 'minecraft:trial_spawner', entries: [{ id: 'minecraft:trial_spawner', block_item: true, block_entity_type: 'minecraft:trial_spawner' }] });
  Reg.ingest('registry.item_meta_one', { id: 'minecraft:pig_spawn_egg', entries: [{ id: 'minecraft:pig_spawn_egg', spawn_egg_entity: 'minecraft:pig' }] });
  Reg.ingest('registry.entity_info', { entries: [{ id: 'minecraft:pig', name: '猪', attributes: { 'minecraft:max_health': 10, 'minecraft:movement_speed': 0.25, 'minecraft:follow_range': 16, 'minecraft:attack_damage': 0 }, spawn_eggs: ['minecraft:pig_spawn_egg'], template_available: true, default_nbt: '{id:"minecraft:pig",Age:0,NoAI:0b}' }] });
  Reg.ingest('registry.spawner_info', { generation: 1, offset: 0, total: 2, done: true, entries: [
    { id: 'minecraft:mob_spawner', fields: { Delay: { default: 20 }, MinSpawnDelay: { default: 200 }, MaxSpawnDelay: { default: 800 }, SpawnCount: { default: 4 }, MaxNearbyEntities: { default: 6 }, RequiredPlayerRange: { default: 16 }, SpawnRange: { default: 4 } } },
    { id: 'minecraft:trial_spawner', defaults: { normal_config: { spawn_range: 4, total_mobs: 6, simultaneous_mobs: 2, total_mobs_added_per_player: 2, simultaneous_mobs_added_per_player: 1, ticks_between_spawn: 40 }, ominous_config: { spawn_range: 4, total_mobs: 12, simultaneous_mobs: 4, total_mobs_added_per_player: 3, simultaneous_mobs_added_per_player: 2, ticks_between_spawn: 40 } }, fields: {} }] });
  var d = Store.doc();
  if (which === 'trial') { d.id = 'minecraft:trial_spawner'; d.comps = { block_entity_data: { id: 'minecraft:trial_spawner', required_player_range: 20, normal_config: { total_mobs: 9 } } }; }
  if (which === 'egg') { d.id = 'minecraft:pig_spawn_egg'; d.comps = {}; }
  drawHero(); drawTabbar(); drawTabBody();
})();
