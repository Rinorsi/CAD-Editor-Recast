/* ?????????entity-cloud-post.js ?????  'ents' ? */
(function () {
  var ent = { kind: 'entity', type: 'minecraft:area_effect_cloud', slot: { kind: 'entity', dim: 'minecraft:overworld', uuid: 'u', id: 5, token: 't' }, revision: 'r', canUndo: false,
    snbt: '{id:"minecraft:area_effect_cloud",Radius:3.0f}', nbt: {}, views: { area_effect_cloud: { Radius: 3, Duration: 200, Age: 0, WaitTime: 20, ReapplicationDelay: 20, DurationOnUse: 0, RadiusOnUse: 0, RadiusPerTick: -0.005, potion_contents: { potion: 'minecraft:swiftness', custom_effects: [{ id: 'minecraft:speed' }] }, custom_particle: null, potion_duration_scale: 1 } }, schema: { area_effect_cloud: { fields: { Radius: { min: 0, max: 32 } } } } };
  Reg.ingest('registry.meta', { version: 1 });
  Reg.bprops['minecraft:oak_log'] = { axis: { values: ['x', 'y', 'z'], default: 'y' } };
  Reg.bprops['minecraft:sand'] = {};
  WE.tab = 'ents';
  weOpen(ent);
})();