/* 预览用：玩家页的扩展标签（位置与重生 / 配方 / 成就 / 统计 / 离线玩家），用假数据应答 player_extended。TAB 由脚本替换 */
(function () {
  var TAB = '__TAB__';
  var player = { container: { size: 43, slots: [] }, ender: { size: 27, slots: [] }, SelectedItemSlot: 0, Health: 20, AbsorptionAmount: 0, food: { foodLevel: 20, saturation: 5 }, experience: { XpLevel: 3, XpP: 0.5, XpTotal: 20 },
    playerGameType: 'survival', abilities: {}, attributes: [], active_effects: [], Tags: [], CustomName: null,
    schema: { gameModes: ['survival', 'creative'], selectedSlotMax: 8, inventorySize: 43, enderSize: 27, equipmentSlots: [], attributes: [], bounds: {} } };
  Reg.ingest('registry.meta', { version: 1 });
  var recipes = ['minecraft:oak_planks', 'minecraft:stick', 'minecraft:crafting_table', 'minecraft:iron_pickaxe', 'minecraft:bread', 'minecraft:golden_apple'].map(function (id, i) { return { id: id, unlocked: i % 2 === 0, highlighted: i === 2 }; });
  var advs = [{ id: 'minecraft:story/root', title_key: 'advancements.story.root.title', description_key: 'advancements.story.root.description', has_display: true, done: true, criteria: [{ name: 'crafting_table', done: true }] },
    { id: 'minecraft:story/mine_stone', title_key: 'advancements.story.mine_stone.title', has_display: true, done: true, criteria: [{ name: 'get_stone', done: true }] },
    { id: 'minecraft:nether/root', title_key: 'advancements.nether.root.title', has_display: true, done: false, criteria: [{ name: 'entered_nether', done: false }] },
    { id: 'minecraft:adventure/kill_all_mobs', title_key: 'advancements.adventure.kill_all_mobs.title', has_display: true, done: false, criteria: [{ name: 'minecraft:zombie', done: true }, { name: 'minecraft:creeper', done: false }, { name: 'minecraft:skeleton', done: false }] }];
  var stats = [{ type: 'minecraft:custom', id: 'minecraft:jump', value: 129 }, { type: 'minecraft:custom', id: 'minecraft:play_time', value: 54000 }, { type: 'minecraft:mined', id: 'minecraft:stone', value: 312 }, { type: 'minecraft:killed', id: 'minecraft:zombie', value: 17 }];
  var views = {
    position: { dimension: 'minecraft:overworld', x: 12.5, y: 64, z: -30.25, yaw: 90, pitch: 0 },
    respawn: { dimension: 'minecraft:overworld', x: 10, y: 64, z: -28, yaw: 0, forced: false },
    recipes: { entries: recipes }, advancements: { entries: advs }, stats: { entries: stats }, offline: { snbt: '{Health:20.0f,foodLevel:20}' },
    players: { entries: [{ uuid: '11111111-2222-3333-4444-555555555555', name: 'Rinorsi', online: true, self: true, owner: true, last_played_ms: null }, { uuid: '22222222-2222-3333-4444-555555555555', name: '小明', online: false, self: false, owner: false, last_played_ms: 1794153600000 }, { uuid: '33333333-2222-3333-4444-555555555555', name: null, online: false, self: false, owner: false, last_played_ms: 1793000000000 }] } };
  var schema = { dimensions: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'], manualId: true, editableKeys: ['Health', 'Inventory'] };
  var LANG = { 'advancements.story.root.title': '我的世界', 'advancements.story.root.description': '游戏的核心与目标', 'advancements.story.mine_stone.title': '石器时代', 'advancements.nether.root.title': '下界', 'advancements.adventure.kill_all_mobs.title': '怪物猎人',
    'stat.minecraft.jump': '跳跃次数', 'stat.minecraft.play_time': '游戏时长', 'stat_type.minecraft.custom': '通用', 'stat_type.minecraft.mined': '挖掘', 'stat_type.minecraft.killed': '击杀' };
  var real = oriel.send;
  oriel.send = function (op, msg) {
    if (op === 'registry' && msg.name === 'translate') { setTimeout(function () { var m = {}; msg.keys.forEach(function (k) { if (LANG[k]) m[k] = LANG[k]; }); Reg.ingest('registry.translate', { map: m }); }, 20); return true; }
    if (op === 'player_extended' && msg.action === 'export_preset') { setTimeout(function () { pxResult({ status: 'exported', requestId: msg.requestId, summary: { game_mode: 'survival', health: 18, food: 20, xp_level: 5, dimension: 'minecraft:overworld', x: 120.4, y: 64, z: -33, inventory_count: 17, ender_count: 3, equipment: { head: 'minecraft:iron_helmet', chest: 'minecraft:iron_chestplate', legs: null, feet: 'minecraft:iron_boots', offhand: 'minecraft:shield' } }, template: { sections: {} } }); }, 10); return true; }
    if (op !== 'player_extended') return real ? real.call(oriel, op, msg) : true;
    setTimeout(function () {
      var v = views[msg.view];
      pxResult({ status: 'opened', requestId: msg.requestId, playerExtended: { view: msg.view, revision: 'r', value: v === undefined ? null : v, schema: schema, total: v && v.entries ? v.entries.length : 0, nextOffset: null } });
    }, 10);
    return true;
  };
  oriel.data = oriel.data || {};
  weOpen({ kind: 'entity', type: 'minecraft:player', slot: { kind: 'entity', dim: 'minecraft:overworld', player: 'self', token: 't', uuid: 'u' }, revision: 'r', canUndo: false, snbt: '{}', nbt: {}, player: { self: true, name: 'Rinorsi', uuid: 'u' }, views: { player: player } });
  WE.tab = TAB; weRender();
  if (TAB === 'poff') setTimeout(function () { PX.arch.open['22222222-2222-3333-4444-555555555555'] = true; pxExport({ uuid: '22222222-2222-3333-4444-555555555555', online: false }); }, 200);
})();
