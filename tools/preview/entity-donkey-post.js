/* 预览用：驴（驯服 + 主人 + 背着的箱子）。打开「实体设置」页 */
(function () {
  var ent = { kind: 'entity', type: 'minecraft:donkey', slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', id: 5, token: 't' }, revision: 'r', canUndo: false,
    snbt: '{id:"minecraft:donkey",Tame:1b}', nbt: {}, schema: {}, views: {
      horse: { Tame: true, Temper: 40, Owner: '00000000-0000-0000-0000-000000000001', players: [{ uuid: '00000000-0000-0000-0000-000000000001', name: 'Rinorsi' }], available: true },
      chested: { ChestedHorse: true, capacity: 15, Items: [{ slot: 0, stack: { id: 'minecraft:diamond', count: 3, comps: {}, removed: {} } }, { slot: 4, stack: { id: 'minecraft:bread', count: 12, comps: {}, removed: {} } }] } } };
  Reg.ingest('registry.meta', { version: 1 });
  WE.tab = 'ents';
  weOpen(ent);
})();