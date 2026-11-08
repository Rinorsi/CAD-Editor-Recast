/* ?????????entity-falling-post.js ?????  'ents' ? */
(function () {
  var ent = { kind: 'entity', type: 'minecraft:falling_block', slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', id: 5, token: 't' }, revision: 'r', canUndo: false,
    snbt: '{id:"minecraft:falling_block",Time:12}', nbt: {}, views: { falling_block: { BlockState: { Name: 'minecraft:oak_log', Properties: { axis: 'x' } }, Time: 12, FallHurtAmount: 2, FallHurtMax: 40, DropItem: true, HurtEntities: false, CancelDrop: false }, team: { name: null, options: [], available: false, readOnly: true } }, schema: {} };
  Reg.ingest('registry.meta', { version: 1 });
  Reg.bprops['minecraft:oak_log'] = { axis: { values: ['x', 'y', 'z'], default: 'y' } };
  Reg.bprops['minecraft:sand'] = {};
  WE.tab = 'ents';
  weOpen(ent);
})();