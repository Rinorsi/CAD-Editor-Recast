(function () {
  var player = { container: { size: 43, slots: [] }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, Health: 20, AbsorptionAmount: 0, food: { foodLevel: 20, saturation: 5 }, experience: { XpLevel: 3, XpP: 0.5, XpTotal: 20 }, playerGameType: 'survival', abilities: {}, attributes: [], active_effects: [], Tags: [], CustomName: null, schema: { gameModes: ['survival'], selectedSlotMax: 8, inventorySize: 43, enderSize: 27, equipmentSlots: [], attributes: [], bounds: {} } };
  Reg.ingest('registry.meta', { version: 1 });
  weOpen({ kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', player: 'self', token: 't', uuid: 'u' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'Rinorsi', uuid: 'u' }, views: { player: player } });
  vwSaveDialog('player_preset');
})();
