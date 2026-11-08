/* ?????????entity-wolf-post.js ?????  'relations' ? */
(function () {
  var ent = { kind: 'entity', type: 'minecraft:wolf', slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', id: 5, token: 't' }, revision: 'r', canUndo: false,
    snbt: '{id:"minecraft:wolf",Sitting:0b}', nbt: {}, views: { owner: { Owner: '00000000-0000-0000-0000-000000000001', players: [{ uuid: '00000000-0000-0000-0000-000000000001', name: 'Rinorsi' }, { uuid: '00000000-0000-0000-0000-000000000002', name: 'Steve' }], available: true }, team: { name: 'red', options: ['red', 'blue'], available: true, readOnly: true }, leash: { data: [1, 64, 2], readOnly: true } }, schema: {} };
  Reg.ingest('registry.meta', { version: 1 });
  Reg.bprops['minecraft:oak_log'] = { axis: { values: ['x', 'y', 'z'], default: 'y' } };
  Reg.bprops['minecraft:sand'] = {};
  WE.tab = 'relations';
  weOpen(ent);
})();