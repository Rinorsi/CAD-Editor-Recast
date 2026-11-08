/* ?????????entity-dropped-post.js ?????  'ents' ? */
(function () {
  var ent = { kind: 'entity', type: 'minecraft:item', slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', id: 5, token: 't' }, revision: 'r', canUndo: false,
    snbt: '{id:"minecraft:item",Age:120s}', nbt: {}, views: { dropped_item: { Item: { id: 'minecraft:diamond', count: 3, comps: {}, removed: {} }, PickupDelay: 10, Age: 120 } }, schema: { dropped_item: { fields: { PickupDelay: { min: -32768, max: 32767 }, Age: { min: -32768, max: 32767 } } } } };
  Reg.ingest('registry.meta', { version: 1 });
  Reg.bprops['minecraft:oak_log'] = { axis: { values: ['x', 'y', 'z'], default: 'y' } };
  Reg.bprops['minecraft:sand'] = {};
  WE.tab = 'ents';
  weOpen(ent);
})();