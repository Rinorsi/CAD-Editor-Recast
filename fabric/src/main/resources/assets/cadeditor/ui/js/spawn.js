/* 刷怪蛋 / 刷怪笼 / 试炼刷怪笼。
   数据全部来自游戏：entity_info（属性）、item_meta（默认实体、方块实体类型）、spawner_info（字段与默认值）。
   刷怪笼写在 block_entity_data 里（id = 方块实体类型，不是物品 ID）；数值范围对应游戏的 SpawnerData 校验，
   最终以 apply 时宿主的整栈校验为准。 */

function spEntityName(id) { return Reg.nameOf2('entity_type', id) || humanId(shortId(id)); }
function spNum(v) { return fmtNum(+(+v).toFixed(3)); }

/* ---------- 刷怪蛋 ---------- */
function eggDefaultEntity() {
  var id = Ctx.doc().id, m = Reg.live() ? Reg.itemMeta(id) : false;
  if (m && m.spawn_egg_entity) return m.spawn_egg_entity;
  var dc = Reg.live() ? Reg.defaultsOf(fullId(id)) : null, ed = dc && dc.entity_data;
  return isObj(ed) && typeof ed.id === 'string' ? ed.id : '';
}
/* 实体基础属性里值得一看的几项（值来自 entity_info.attributes，没有的不显示） */
var EGG_STATS = [['max_health', '生命值', 'shield', ''], ['movement_speed', '移动速度', 'boots', ''], ['attack_damage', '攻击力', 'sword', ''], ['follow_range', '感知范围', 'target', '格']];
CARDS.spawnEgg = function () {
  if (UIOpen['card:spawnEgg'] === undefined) UIOpen['card:spawnEgg'] = false;   // 这一页只有它，默认展开
  var card = kCard({ id: 'spawnEgg', icon: 'paw', title: '生成的生物', desc: '用这个蛋点击地面时生成的生物，以及生成时带上的数据', comps: ['entity_data'], span: 2, eager: true }, Ctx);
  function cur() { var ed = Ctx.get('entity_data'); return isObj(ed) && typeof ed.id === 'string' && ed.id ? ed.id : eggDefaultEntity(); }
  function writeData(o) { Ctx.setSmart('entity_data', o, { label: '刷怪蛋数据' }); }
  function draw() {
    clear(card.body);
    var ed = Ctx.get('entity_data'), id = cur(), def = eggDefaultEntity(), over = !!id && !!def && Reg.full(id) !== Reg.full(def);
    var sel = kRegSelect({ reg: 'entity_type', value: id, title: '选择生物', empty: '（未选择）', onChange: function (x) {
      var o = isObj(Ctx.get('entity_data')) ? Ctx.get('entity_data') : {};
      o.id = Reg.full(x); writeData(o); draw();
    } });
    card.body.appendChild(xField('paw', '生物', sel.el));
    if (over) card.body.appendChild(xField('refresh', '默认是' + spEntityName(def), kBtn('恢复默认', function () { Ctx.reset('entity_data'); draw(); }, { icon: 'undo' })));
    /* 这只生物的基础属性 */
    var info = id ? Reg.entityInfo(id) : false;
    if (info === null) card.body.appendChild(xEmpty('正在向游戏读取这只生物的信息…'));
    else if (info && info.attributes) {
      card.body.appendChild(xSec('info', '基础属性', '游戏里的默认值'));
      var any = false;
      EGG_STATS.forEach(function (s) {
        var v = info.attributes['minecraft:' + s[0]];
        if (typeof v !== 'number' || (s[0] === 'attack_damage' && v <= 0)) return;
        any = true;
        card.body.appendChild(xRow({ icon: uiIcon(s[2], 14), title: s[1], right: h('span', { class: 'k-sub', text: spNum(v) + s[3] }) }));
      });
      if (!any) card.body.appendChild(xEmpty('这只生物没有可显示的基础属性'));
    }
    /* 生成时带上的数据（NoAI、CustomName 等）；id 由上面的选择器管 */
    var rest = isObj(ed) ? clone(ed) : {}; delete rest.id;
    var sug = kBtn('常用字段', function () {
      suggestEntityFields(id, function (k) { return Object.prototype.hasOwnProperty.call(rest, k); }, function (k, val) { try { mapEl.addField(k, val); } catch (e) { toast(e.message || String(e), 'warn'); } }, sug);
    }, { title: '从这只生物的默认数据里挑字段' });
    var mapEl = worldMap(rest, function (x) {
      if (Object.prototype.hasOwnProperty.call(x, 'id')) throw new Error('生物请通过上方选择器修改');
      var o = clone(x); if (id) o.id = Reg.full(id); writeData(o);
    }, false);
    card.body.appendChild(worldSection('生成时带上的数据', sug));
    card.body.appendChild(mapEl);
    card.body.appendChild(Valid.badge('entity_data'));
  }
  draw();
  return card;
};

/* ---------- 刷怪笼 ---------- */
function spInfo(beId) {
  var t = Reg.live() ? Reg.table('spawner_info') : null;
  if (!t) return null;
  for (var i = 0; i < t.length; i++) if (t[i].id === beId) return t[i];
  return false;
}
/* 游戏给的默认值；数据没到 / 离线时用 fb（原版默认） */
function spDefault(beId, key, fb) {
  var e = spInfo(beId), f = e && e.fields && e.fields[key];
  return f && typeof f.default === 'number' ? f.default : fb;
}
function spCfgDefault(name, key, fb) {
  var e = spInfo('minecraft:trial_spawner'), c = e && e.defaults && e.defaults[name];
  return c && typeof c[key] === 'number' ? c[key] : fb;
}
function spBlockEntity() {
  var m = Reg.live() ? Reg.itemMeta(Ctx.doc().id) : false;
  if (m && m.block_entity_type) return m.block_entity_type;
  return shortId(Ctx.doc().id) === 'trial_spawner' ? 'minecraft:trial_spawner' : 'minecraft:mob_spawner';
}

/* 一行数值：图标 + 名称 + 说明，右边是数字。get/set 读写；ticks 为真时说明里顺带换算成秒 */
function spNumRow(o) {
  var num = kNumber(+(+o.get()).toFixed(4), { min: o.min, max: o.max, step: o.step || 1, unit: o.ticks ? '' : (o.unit || ''), noSlider: true, onChange: function (v) { o.set(v); upd(v); } });
  num.el.classList.add('k-xnum'); num.el.addEventListener('click', function (ev) { ev.stopPropagation(); });
  var row = xRow({ icon: uiIcon(o.icon || 'sliders', 14), title: o.title, sub: sub(o.get()), tip: o.tip || '', right: num.el });
  function sub(v) { return (o.desc || '') + (o.ticks && v > 0 ? (o.desc ? ' · ' : '') + spNum(v) + ' 刻 = ' + spNum(v / 20) + ' 秒' : ''); }
  function upd(v) { var s = row.querySelector('.s'); if (s) s.textContent = sub(v); }
  return row;
}

/* 带权重的实体池（SpawnPotentials / spawn_potentials）：[{data:{entity:{id}}, weight}] */
function spPool(arr, onChange, emptyText) {
  var xl = xList({
    items: function () { return arr; }, empty: emptyText,
    add: { text: '添加生物', fn: function () { openRegPick({ reg: 'entity_type', title: '选择生物', onPick: function (id) { arr.push({ data: { entity: { id: Reg.full(id) } }, weight: 1 }); onChange(); xl.select(arr.length - 1); } }); } },
    row: function (it, i) {
      var eid = it.data && it.data.entity && typeof it.data.entity.id === 'string' ? it.data.entity.id : '';
      var wt = kNumber(typeof it.weight === 'number' ? it.weight : 1, { min: 1, max: 1000000, step: 1, noSlider: true, onChange: function (v) { it.weight = v; onChange(); } });
      wt.el.classList.add('k-xnum'); wt.el.addEventListener('click', function (ev) { ev.stopPropagation(); });
      return { chevron: true, icon: uiIcon('paw', 14), title: eid ? spEntityName(eid) : '（未选择生物）', sub: eid || '', tip: eid, right: wt.el, body: function () {
        return [
          xField('paw', '生物', kRegSelect({ reg: 'entity_type', value: eid, title: '选择生物', empty: '（未选择）', onChange: function (x) { it.data = it.data || {}; it.data.entity = it.data.entity || {}; it.data.entity.id = Reg.full(x); onChange(); xl.draw(); } }).el),
          xFoot('右上角的数字是权重：越大越容易被选中', function () { arr.splice(i, 1); onChange(); xl.select(-1); })
        ];
      } };
    }
  });
  return xl;
}

CARDS.spawner = function () {
  if (UIOpen['card:spawner'] === undefined) UIOpen['card:spawner'] = false;   // 这一页只有它，默认展开
  var beId = spBlockEntity(), trial = beId === 'minecraft:trial_spawner';
  var card = kCard({ id: 'spawner', icon: 'paw', title: trial ? '试炼刷怪笼' : '刷怪笼', desc: trial ? '按玩家人数调整数量的试炼刷怪笼：普通 / 不祥两套配置' : '刷什么生物、多久刷一次、一次刷几只', comps: ['block_entity_data'], span: 2, eager: true }, Ctx);
  var obj = clone(isObj(Ctx.get('block_entity_data')) ? Ctx.get('block_entity_data') : {});
  function put() {
    var rest = clone(obj); delete rest.id;
    if (!Object.keys(rest).length) { Ctx.disable('block_entity_data', { structural: false }); return; }
    obj.id = beId; Ctx.setSmart('block_entity_data', clone(obj), { label: trial ? '试炼刷怪笼' : '刷怪笼' });
  }
  var body = card.body;
  if (obj.id && Reg.full(obj.id) !== beId) {
    body.appendChild(xEmpty('这个物品带的方块实体数据类型是 ' + obj.id + '，与刷怪笼不同。请在「放置与数据」里检查，或改用下面的设置覆盖。'));
  }
  if (!trial) buildMobSpawner(body, obj, beId, put); else buildTrialSpawner(body, obj, beId, put);
  body.appendChild(Valid.badge('block_entity_data'));
  return card;
};

function buildMobSpawner(body, obj, beId, put) {
  /* 当前刷怪实体：SpawnData.entity.id（没写 = 新放下的刷怪笼还没有指定） */
  var eid = obj.SpawnData && obj.SpawnData.entity && typeof obj.SpawnData.entity.id === 'string' ? obj.SpawnData.entity.id : '';
  body.appendChild(xSec('paw', '刷什么生物'));
  body.appendChild(xField('paw', '当前生物', kRegSelect({ reg: 'entity_type', value: eid, title: '选择生物', empty: '（未指定）', onChange: function (x) {
    obj.SpawnData = isObj(obj.SpawnData) ? obj.SpawnData : {}; obj.SpawnData.entity = isObj(obj.SpawnData.entity) ? obj.SpawnData.entity : {};
    obj.SpawnData.entity.id = Reg.full(x); put();
  } }).el));
  body.appendChild(xSec('list', '随机池', '有池子时，每次按权重从里面挑一种'));
  var pot = Array.isArray(obj.SpawnPotentials) ? obj.SpawnPotentials : [];
  var pool = spPool(pot, function () { if (pot.length) obj.SpawnPotentials = pot; else delete obj.SpawnPotentials; put(); }, '没有随机池，只刷上面的生物');
  body.appendChild(pool.el);
  /* 数值：范围对应游戏的 SpawnerData 校验（整数 0..32767；Delay 可为 -1） */
  body.appendChild(xSec('sliders', '数值', '空着的用游戏默认值'));
  var err = worldError();
  function checkDelay() { var a = spVal('MinSpawnDelay', 200), b = spVal('MaxSpawnDelay', 800); err.textContent = b < a ? '最长间隔不能小于最短间隔，游戏会拒绝保存' : ''; }
  function spVal(key, fb) { return typeof obj[key] === 'number' ? obj[key] : spDefault(beId, key, fb); }
  var P = [
    ['RequiredPlayerRange', '激活距离', '玩家进入这个距离内才会刷怪', 'target', '格', 0, 32767, 16],
    ['SpawnRange', '刷怪范围', '在笼子周围这个范围内找位置', 'cube', '格', 0, 32767, 4],
    ['SpawnCount', '每次刷出数量', '一次最多尝试生成几只', 'paw', '只', 0, 32767, 4],
    ['MaxNearbyEntities', '周围生物上限', '附近同类超过这个数就不再刷', 'layers', '只', 0, 32767, 6],
    ['MinSpawnDelay', '最短间隔', '两次刷怪之间最少等待', 'clock', '刻', 0, 32767, 200, true],
    ['MaxSpawnDelay', '最长间隔', '两次刷怪之间最多等待', 'clock', '刻', 0, 32767, 800, true],
    ['Delay', '当前倒计时', '放下后第一次刷怪前的等待；-1 表示由游戏重新随机', 'clock', '刻', -1, 32767, 20, true]
  ];
  var list = h('div', { class: 'x-list' });
  P.forEach(function (p) {
    list.appendChild(spNumRow({ title: p[1], desc: p[2], icon: p[3], unit: p[4], min: p[5], max: p[6], ticks: p[8], tip: p[0],
      get: function () { return spVal(p[0], p[7]); }, set: function (v) { obj[p[0]] = v; put(); checkDelay(); } }));
  });
  body.appendChild(list); body.appendChild(err); checkDelay();
  body.appendChild(kBtn('全部恢复默认数值', function () {
    P.forEach(function (p) { delete obj[p[0]]; }); put(); drawDetailSafe();
  }, { icon: 'undo' }));
}

function buildTrialSpawner(body, obj, beId, put) {
  function top(key, fb) { return typeof obj[key] === 'number' ? obj[key] : spDefault(beId, key, fb); }
  body.appendChild(xSec('sliders', '基本'));
  var l0 = h('div', { class: 'x-list' });
  l0.appendChild(spNumRow({ title: '激活距离', desc: '玩家进入这个距离内才会开始', icon: 'target', unit: '格', min: 1, max: 128, tip: 'required_player_range', get: function () { return top('required_player_range', 14); }, set: function (v) { obj.required_player_range = v; put(); } }));
  l0.appendChild(spNumRow({ title: '冷却时间', desc: '完成试炼后再次可用前的等待', icon: 'clock', unit: '刻', min: 0, max: 2147483647, ticks: true, tip: 'target_cooldown_length', get: function () { return top('target_cooldown_length', 36000); }, set: function (v) { obj.target_cooldown_length = v; put(); } }));
  body.appendChild(l0);
  [['normal_config', '普通配置', '没有不祥状态时用这套'], ['ominous_config', '不祥配置', '玩家带着不祥之兆时用这套']].forEach(function (c) {
    var name = c[0], cfg = obj[name];
    body.appendChild(xSec('flame', c[1], c[2]));
    if (typeof cfg === 'string') {
      var defs = spInfo(beId), dcfg = defs && defs.defaults && defs.defaults[name];
      body.appendChild(xRow({ icon: uiIcon('pin', 14), title: '引用了配置', sub: cfg, tip: cfg, right: dcfg ? kBtn('展开为内联配置', function () { obj[name] = clone(dcfg); put(); drawDetailSafe(); }, { icon: 'edit', title: '用游戏默认值生成一份可编辑的配置（会替换这个引用）' }) : null }));
      return;
    }
    cfg = isObj(cfg) ? cfg : {};
    function cv(key, fb) { return typeof cfg[key] === 'number' ? cfg[key] : spCfgDefault(name, key, fb); }
    function setv(key, v) { cfg[key] = v; obj[name] = cfg; put(); }
    var F = [
      ['spawn_range', '刷怪范围', '在笼子周围这个范围内找位置', 'cube', '格', 1, 128, 1, 4],
      ['total_mobs', '总数量', '一场试炼一共会刷出多少只', 'paw', '只', 0, 3.4e38, 1, 6],
      ['simultaneous_mobs', '同时存在上限', '场上同时最多有几只', 'layers', '只', 0, 3.4e38, 1, 2],
      ['total_mobs_added_per_player', '每多一名玩家增加总数', '', 'users', '只', 0, 3.4e38, 1, 2],
      ['simultaneous_mobs_added_per_player', '每多一名玩家增加同时上限', '', 'users', '只', 0, 3.4e38, 1, 1],
      ['ticks_between_spawn', '刷怪间隔', '两次刷怪之间的等待', 'clock', '刻', 0, 2147483647, 1, 40, true]
    ];
    var lst = h('div', { class: 'x-list' });
    F.forEach(function (f) {
      lst.appendChild(spNumRow({ title: f[1], desc: f[2], icon: f[3] === 'users' ? 'paw' : f[3], unit: f[4], min: f[5], max: f[6], step: f[7], ticks: f[9], tip: f[0], get: function () { return cv(f[0], f[8]); }, set: function (v) { setv(f[0], v); } }));
    });
    body.appendChild(lst);
    var tpot = Array.isArray(cfg.spawn_potentials) ? cfg.spawn_potentials : [];
    body.appendChild(spPool(tpot, function () { if (tpot.length) cfg.spawn_potentials = tpot; else delete cfg.spawn_potentials; obj[name] = cfg; put(); }, '没有指定生物池，沿用游戏默认').el);
  });
  body.appendChild(h('div', { class: 'k-sub', text: '战利品表等其余字段在「放置与数据 → 方块实体数据」里用 SNBT 编辑，这里不会改动它们。' }));
}
/* 重绘当前卡片所在的页（数值被整体恢复 / 配置被展开后用） */
function drawDetailSafe() { try { if (typeof drawTabBody === 'function') drawTabBody(); } catch (e) {} }
