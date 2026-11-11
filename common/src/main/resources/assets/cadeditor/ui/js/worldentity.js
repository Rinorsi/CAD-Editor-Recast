/* 世界实体的规范化区段（docs/world-entity-contract.md）：盔甲架姿势、展示框 / 画、展示实体（物品 / 方块 / 文字）、村民交易、乘客。
   world.views.<组> 是只读的当前值；页面只把改过的字段放进 apply.entity.<区段>。乘客操作是独立的 apply.riding，不能和别的修改混在一起。
   范围、枚举、默认值读 views.<组>.schema（真实 Codec / loader 探针）；游戏没有给出范围的字段不设限。 */
WE.ent = {}; WE.offers = null;
function weEntReset() { WE.ent = {}; WE.offers = null; }
function evGroup(g) { var v = WE.w && WE.w.views && WE.w.views[g]; return v && typeof v === 'object' ? v : null; }
function evVal(g) {
  var v = evGroup(g); if (!v) return {};
  if (v.value && typeof v.value === 'object') return v.value;
  var o = {}; Object.keys(v).forEach(function (k) { if (k !== 'schema' && k !== 'snbt') o[k] = v[k]; }); return o;
}
function evFields(g) {
  var v = evGroup(g), s = v && v.schema;
  if (!s && WE.w && WE.w.schema && WE.w.schema[g]) s = WE.w.schema[g];
  return s ? (s.fields || s) : {};
}
function evGet(g, k) { return weDraftGet(WE.ent, g, k, evVal(g)); }
function evSet(g, k, v, part) {
  if (g === 'player' && typeof wpCommandTrack === 'function') wpCommandTrack(k, v, part);
  weDraftSet(WE.ent, g, k, v, evVal(g));
  if (g === 'dropped_item' && k === 'Item') weHeroLive();
}
function evDirty() { return !!WE.w && (Object.keys(WE.ent).length > 0 || (typeof wpCommandIntentDirty === 'function' && wpCommandIntentDirty()) || (typeof wpSlotsDirty === 'function' && wpSlotsDirty() > 0) || WE.offers !== null && JSON.stringify(WE.offers) !== JSON.stringify(evOffersOrig())); }
function evOffersOrig() { var t = evGroup('trades'); return t && t.offers ? t.offers : []; }
function evMsg(msg) {
  var out = {}, any = false;
  Object.keys(WE.ent).forEach(function (g) { out[g] = clone(WE.ent[g]); any = true; });
  if (WE.offers !== null && JSON.stringify(WE.offers) !== JSON.stringify(evOffersOrig())) { out.offers = clone(WE.offers); any = true; }
  if (typeof wpMsg === 'function') { wpMsg(out); if (out.player) any = true; }
  if (any) msg.entity = out;
}
function evNum(label, v, o, on) {
  o = o || {};
  return xNum({ title: label, sub: o.sub, value: v, min: o.min, max: o.max, softMin: o.softMin, softMax: o.softMax, step: o.step, dec: o.dec, unit: o.unit, noSlider: o.noSlider !== false && o.softMax === undefined, onChange: on });
}
function evBool(label, v, sub, on) { return xToggle({ title: label, sub: sub, value: v, onChange: on }); }
function evStack(cur, onSet, o) {
  o = o || {};
  var has = cur && cur.id && !cur.empty;
  var btn = kItemBtn(has ? cur : null, null, o.placeholder);
  function norm(st) { var s = clone(st); delete s.slot; delete s.label; return s; }
  activate(btn, function () { pickItem(btn, function (id) { onSet({ id: fullId(id), count: 1, comps: {}, removed: {} }); kPopClose(); }, { onStack: function (st) { onSet(norm(st)); kPopClose(); } }); });
  var kids = [btn];
  if (has) kids.push(kBtn('编辑物品', function () { openNestedItem(cur, { title: '编辑物品', valid: nestedDraftGuard(), commit: function (st) { onSet(norm(st)); }, render: weRedrawBody }); }, { icon: 'edit' }));
  if (has && o.clear !== false) kids.push(kBtn('清空', function () { onSet(o.empty); }, { icon: 'trash' }));
  return h('div', { class: 'k-row' }, kids);
}

/* ---------- 盔甲架姿势 ---------- */
var EV_PARTS = [['Head', '头'], ['Body', '身体'], ['LeftArm', '左臂'], ['RightArm', '右臂'], ['LeftLeg', '左腿'], ['RightLeg', '右腿']];
function evPoseTab(body) {
  var F = evFields('pose');
  body.appendChild(xSec('user', '姿势', '角度，单位度'));
  EV_PARTS.forEach(function (pp) {
    var key = pp[0], cur = evGet('pose', key); if (!Array.isArray(cur)) cur = (F[key] && F[key].default) || [0, 0, 0];
    cur = cur.slice(0, 3);
    var def = (F[key] && F[key].default) || [0, 0, 0], k = 'we:pose:' + key, open = !!UIOpen[k];
    function setAxis(i, v) { var n = evGet('pose', key); n = Array.isArray(n) ? n.slice(0, 3) : def.slice(); n[i] = v; evSet('pose', key, n); }
    body.appendChild(xRow({ icon: false, title: pp[1], sub: 'X ' + fmtNum(cur[0]) + '°  Y ' + fmtNum(cur[1]) + '°  Z ' + fmtNum(cur[2]) + '°', chevron: true, open: open,
      onHead: function () { UIOpen[k] = !UIOpen[k]; weRender(); },
      body: function () {
        var rows = ['X 前后摆', 'Y 左右转', 'Z 侧倾'].map(function (nm, i) {
          var n = kNumber(cur[i], { softMin: -180, softMax: 180, step: 1, dec: 1, unit: '°', onChange: function (v) { setAxis(i, v); } });
          return xField(null, nm, n.el);
        });
        rows.push(h('div', { class: 'x2f' }, [h('div', { class: 'grow' }), kBtn('恢复默认', function () { evSet('pose', key, def.slice()); weRender(); }, { icon: 'undo' })]));
        return rows;
      } }));
  });
  body.appendChild(xSec('sliders', '状态'));
  [['ShowArms', '显示手臂', '手臂可以拿东西'], ['Small', '小号', '缩小到一半大'], ['NoBasePlate', '没有底座', ''], ['Invisible', '隐形', ''], ['Marker', '没有碰撞箱', '点不到、也不挡路']].forEach(function (f) {
    if (!(f[0] in evVal('pose')) && !(F[f[0]])) return;
    body.appendChild(evBool(f[1], evGet('pose', f[0]), f[2], function (on) { evSet('pose', f[0], on); }));
  });
  body.appendChild(kHint('手里拿的、身上穿的在「属性」页的装备里改。'));
}

/* ---------- 展示框 / 荧光展示框 ---------- */
function evFrameTab(body) {
  var F = evFields('item_frame'), v = evVal('item_frame');
  body.appendChild(xSec('image', '展示框'));
  var cur = evGet('item_frame', 'item');
  body.appendChild(xRow({ icon: false, title: '框里的物品', right: evStack(cur, function (st) { evSet('item_frame', 'item', st); weRender(); }, { empty: { empty: true } }) }));
  var rotMax = F.ItemRotation && F.ItemRotation.max !== undefined ? F.ItemRotation.max : 7;
  body.appendChild(evNum('物品转了几格', evGet('item_frame', 'ItemRotation'), { min: 0, max: rotMax, sub: '每格 45°，共 ' + (rotMax + 1) + ' 个朝向' }, function (x) { evSet('item_frame', 'ItemRotation', x); }));
  body.appendChild(evBool('隐形框', evGet('item_frame', 'Invisible'), '只看到里面的物品', function (on) { evSet('item_frame', 'Invisible', on); }));
  body.appendChild(evBool('固定', evGet('item_frame', 'Fixed'), '不能转动、取下物品', function (on) { evSet('item_frame', 'Fixed', on); }));
  body.appendChild(evNum('被打掉时掉落物品的概率', evGet('item_frame', 'ItemDropChance'), { step: 0.1, dec: 3, sub: '1 是必掉' }, function (x) { evSet('item_frame', 'ItemDropChance', x); }));
}
function evPaintingTab(body) {
  body.appendChild(xSec('image', '画'));
  var sel = kRegSelect({ reg: 'painting_variant', value: evGet('painting', 'variant') || '', title: '选择画', onChange: function (id) { evSet('painting', 'variant', id); } });
  body.appendChild(xRow({ icon: false, title: '画面', sub: '朝向和挂的位置不能在这里改', right: sel.el }));
}

/* ---------- 展示实体 ---------- */
function evVec(label, g, path, idx3, defv) {
  var cur = evGet(g, 'transformation'); cur = cur && typeof cur === 'object' ? cur : {};
  var arr = Array.isArray(cur[path]) ? cur[path].slice() : defv.slice();
  var cells = [];
  arr.forEach(function (x, i) {
    var inp = kInput(fmtNum(x), function () {}, {}); inp.classList.add('we-vnum');
    inp.addEventListener('change', function () {
      var v = Number(inp.value.replace(/,/g, '.')); if (isNaN(v)) { inp.value = fmtNum(x); return; }
      var t = clone(evGet(g, 'transformation') || {}); var a = Array.isArray(t[path]) ? t[path].slice() : defv.slice(); a[i] = v; t[path] = a;
      ['translation', 'scale', 'left_rotation', 'right_rotation'].forEach(function (k) { if (!Array.isArray(t[k])) t[k] = (k === 'scale' ? [1, 1, 1] : k === 'translation' ? [0, 0, 0] : [0, 0, 0, 1]); });
      evSet(g, 'transformation', t);
    });
    cells.push(h('div', { class: 'we-cell' }, [h('span', { class: 'k-sub', text: idx3 ? ['X', 'Y', 'Z'][i] : ['X', 'Y', 'Z', 'W'][i] }), inp]));
  });
  return xField(null, label, h('div', { class: 'we-vec' }, cells));
}
function evDisplayTab(body) {
  var g = 'display', F = evFields(g), v = evVal(g), isText = 'text' in v || 'alignment' in v, isItem = 'item_display' in v || (v.item && !('block_state' in v)), isBlock = 'block_state' in v;
  body.appendChild(xSec('cube', '位置与大小'));
  var kt = 'we:disp:xf';
  body.appendChild(xRow({ icon: false, title: '变换', sub: '偏移、缩放、旋转（四元数）', chevron: true, open: UIOpen[kt] !== false, onHead: function () { UIOpen[kt] = UIOpen[kt] === false; weRender(); },
    body: function () { return [evVec('偏移', g, 'translation', true, [0, 0, 0]), evVec('缩放', g, 'scale', true, [1, 1, 1]), evVec('先转', g, 'left_rotation', false, [0, 0, 0, 1]), evVec('后转', g, 'right_rotation', false, [0, 0, 0, 1])]; } }));
  var bills = (F.billboard && F.billboard.options) || ['fixed', 'vertical', 'horizontal', 'center'];
  var BN = { fixed: '固定', vertical: '绕竖轴', horizontal: '绕横轴', center: '始终面向' };
  body.appendChild(xSeg({ title: '朝向', sub: '要不要跟着玩家的视角转', options: bills.map(function (b) { return { v: b, label: BN[b] || b }; }), value: evGet(g, 'billboard') || 'fixed', onChange: function (x) { evSet(g, 'billboard', x); } }));
  var br = evGet(g, 'brightness'), brOn = br && typeof br === 'object';
  body.appendChild(evBool('固定亮度', brOn, '不跟随周围的光照', function (on) { evSet(g, 'brightness', on ? { block: 15, sky: 15 } : null); weRender(); }));
  if (brOn) {
    body.appendChild(evNum('方块光', br.block, { min: 0, max: 15, softMin: 0, softMax: 15, noSlider: false }, function (x) { evSet(g, 'brightness', { block: x, sky: (evGet(g, 'brightness') || br).sky }); }));
    body.appendChild(evNum('天空光', br.sky, { min: 0, max: 15, softMin: 0, softMax: 15, noSlider: false }, function (x) { evSet(g, 'brightness', { block: (evGet(g, 'brightness') || br).block, sky: x }); }));
  }
  body.appendChild(xSec('eye', '显示'));
  [['view_range', '可见距离', '相对默认的倍数'], ['width', '宽度', '裁剪用，0 是不裁'], ['height', '高度', '裁剪用，0 是不裁'], ['shadow_radius', '阴影半径', ''], ['shadow_strength', '阴影浓度', '']].forEach(function (f) {
    if (!(f[0] in v)) return;
    body.appendChild(evNum(f[1], evGet(g, f[0]), { step: 0.1, dec: 3, sub: f[2] }, function (x) { evSet(g, f[0], x); }));
  });
  if ('glow_color_override' in v) body.appendChild(evNum('发光颜色', evGet(g, 'glow_color_override'), { sub: '整数颜色，-1 表示不覆盖' }, function (x) { evSet(g, 'glow_color_override', x); }));
  body.appendChild(xSec('clock', '动画'));
  body.appendChild(evNum('过渡时长', evGet(g, 'interpolation_duration'), { unit: '刻', sub: '变换改变后用多久平滑过去' }, function (x) { evSet(g, 'interpolation_duration', x); }));
  body.appendChild(evNum('移动平滑', evGet(g, 'teleport_duration'), { unit: '刻', sub: '游戏最多保留 59' }, function (x) { evSet(g, 'teleport_duration', x); }));
  if (isItem) {
    body.appendChild(xSec('sword', '展示的物品'));
    body.appendChild(xRow({ icon: false, title: '物品', right: evStack(evGet(g, 'item'), function (st) { evSet(g, 'item', st); weRender(); }, { empty: null }) }));
    var ctx = (F.item_display && F.item_display.options) || ['none', 'thirdperson_lefthand', 'thirdperson_righthand', 'firstperson_lefthand', 'firstperson_righthand', 'head', 'gui', 'ground', 'fixed', 'on_shelf'];
    body.appendChild(xSelect({ title: '展示方式', sub: '摆的位置不同，物品的模型姿态也不同', options: ctx.map(function (c) { return { v: c, label: c }; }), value: evGet(g, 'item_display') || 'none', width: 200, onChange: function (x) { evSet(g, 'item_display', x); } }));
  }
  if (isBlock) {
    body.appendChild(xSec('cube_grass', '展示的方块'));
    var bs = evGet(g, 'block_state') || { Name: 'minecraft:air' };
    var sel = kRegSelect({ reg: 'block', value: bs.Name, title: '选择方块', onChange: function (id) { evSet(g, 'block_state', { Name: id }); } });
    body.appendChild(xRow({ icon: false, title: '方块', sub: bs.Properties ? '带有方块状态：换方块会清掉' : '', right: sel.el }));
  }
  if (isText) {
    body.appendChild(xSec('chat', '文字'));
    var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: '文字，或文本组件 JSON：{"text":"你好","bold":true}' }); ta.value = msgText(evGet(g, 'text'));
    ta.addEventListener('change', function () { evSet(g, 'text', textMsg(ta.value)); });
    body.appendChild(ta);
    var al = (F.alignment && F.alignment.options) || ['center', 'left', 'right'], AN = { center: '居中', left: '靠左', right: '靠右' };
    body.appendChild(xSeg({ title: '对齐', options: al.map(function (a) { return { v: a, label: AN[a] || a }; }), value: evGet(g, 'alignment') || 'center', onChange: function (x) { evSet(g, 'alignment', x); } }));
    body.appendChild(evNum('一行最宽', evGet(g, 'line_width'), { unit: '像素', sub: '超过会自动换行' }, function (x) { evSet(g, 'line_width', x); }));
    var op = evGet(g, 'text_opacity'), op255 = typeof op === 'number' ? (op < 0 ? op + 256 : op) : 255;
    body.appendChild(evNum('文字不透明度', op255, { min: 0, max: 255, softMin: 0, softMax: 255, noSlider: false, sub: '0 全透明，255 不透明' }, function (x) { evSet(g, 'text_opacity', x > 127 ? x - 256 : x); }));
    body.appendChild(evBool('文字阴影', evGet(g, 'shadow'), '', function (on) { evSet(g, 'shadow', on); }));
    body.appendChild(evBool('穿过方块也看得见', evGet(g, 'see_through'), '', function (on) { evSet(g, 'see_through', on); }));
    body.appendChild(evBool('用默认背景', evGet(g, 'default_background'), '和聊天栏同样的半透明底', function (on) { evSet(g, 'default_background', on); }));
    body.appendChild(evNum('背景颜色', evGet(g, 'background'), { sub: '整数 ARGB，-16777216 是不透明黑' }, function (x) { evSet(g, 'background', x); }));
  }
}

/* ---------- 杂项实体视图：掉落物 / 下落方块 / TNT / 苦力怕 / 末影人 / 药水云 / 经验球 / 箭 / 交互实体
   后端视图和字段范围见 docs/world-entity-contract.md（P2-2 ~ P2-5）。范围读 schema.fields，游戏没给的不设限。 ---------- */
var EV_SIMPLE = [['dropped_item', '掉落物', 'sword'], ['falling_block', '下落方块', 'cube'], ['tnt', 'TNT', 'flame'], ['creeper', '苦力怕', 'flame'],
  ['enderman', '末影人', 'cube'], ['area_effect_cloud', '药水云', 'flask'], ['experience_orb', '经验球', 'sparkle'], ['arrow', '箭', 'sword'], ['interaction', '交互实体', 'sliders'],
  ['horse', '驯服与骑乘', 'paw'], ['chested', '驮兽箱子', 'chest'], ['vehicle_container', '载具容器', 'chest'], ['minecart_display', '矿车显示的方块', 'cube'],
  ['minecart_command', '命令矿车', 'terminal'], ['boat_type', '船', 'cart'], ['zombie_conversion', '僵尸村民转化', 'clock']];
function evSimpleGroups() { return EV_SIMPLE.filter(function (g) { return evGroup(g[0]); }); }
function evSimpleTabInfo() { var g = evSimpleGroups(); return g.length === 1 ? { label: g[0][1], icon: g[0][2] } : { label: '实体设置', icon: 'sliders' }; }
/* 范围来自后端的字段元数据的数值行：o = { sub, unit, step, dec, def, nullAt（等于这个值时发 null）} */
function evNumF(g, k, label, o) {
  o = o || {}; var f = evFields(g)[k] || {}, cur = evGet(g, k);
  return evNum(label, typeof cur === 'number' ? cur : o.def, { min: f.min, max: f.max, step: o.step, dec: o.dec, unit: o.unit, sub: o.sub },
    function (x) { evSet(g, k, o.nullAt !== undefined && x === o.nullAt ? null : x); });
}
/* 一片格子，绑定到视图里的 [{slot, stack}] 列表（驮兽箱子的 Items、载具容器的 slots）：省略的格子 = 清空；草稿只在和原值不同时提交 */
function evSlotList(g, key, count) {
  function list() { var v = evGet(g, key); return Array.isArray(v) ? v : []; }
  function stackAt(i) { var e = list().filter(function (x) { return x.slot === i; })[0]; return e && e.stack && !e.stack.empty ? e.stack : { empty: true }; }
  var ix = []; for (var i = 0; i < count; i++) ix.push(i);
  function setSlot(i, st) {
    var l = list().filter(function (x) { return x.slot !== i; });
    if (st && !st.empty && st.id) { var s = clone(st); delete s.slot; delete s.label; l.push({ slot: i, stack: s }); }
    l.sort(function (a, b) { return a.slot - b.slot; }); evSet(g, key, l); weMarkDirty();
  }
  var grid = kSlotGrid({ tight: true, indices: ix, cols: count <= 9 ? count : 9, stackOf: stackAt, titleOf: function (i) { return '格子 ' + (i + 1); }, set: setSlot });
  grid.setSlot = setSlot;
  return grid;
}
var EV_PICKUP = { DISALLOWED: '不能拾起', ALLOWED: '都能拾起', CREATIVE_ONLY: '只有创造模式能拾起' };
function evSimpleTab(body) {
  var gs = evSimpleGroups();
  if (!gs.length) { body.appendChild(xEmpty('这个实体没有专用设置。')); return; }
  gs.forEach(function (info) { var fn = EV_SIMPLE_TAB[info[0]]; if (fn) { body.appendChild(xSec(info[2], info[1])); fn(body); } });
}
var EV_SIMPLE_TAB = {
  /* 马 / 驴 / 骡 / 羊驼等：驯服状态、驯服进度、主人。鞍和身体装备在「属性」页的装备格里（同一次应用里先驯服再上鞍也可以） */
  horse: function (body) {
    var g = 'horse', own = evGroup(g) || {}, cur = evGet(g, 'Owner') || '', players = own.players || [];
    body.appendChild(evBool('已驯服', evGet(g, 'Tame'), '', function (on) { evSet(g, 'Tame', on); }));
    body.appendChild(evNumF(g, 'Temper', '驯服进度', { sub: '越高越容易被驯服' }));
    var entries = players.map(function (p) { return { v: p.uuid, label: p.name, sub: p.uuid }; });
    if (cur && !entries.some(function (e) { return e.v === cur; })) entries.push({ v: cur, label: '不在线的玩家', sub: cur });
    var sel = kSelect(entries, cur || null, function (v) { evSet(g, 'Owner', v); weRender(); }, { width: 240, empty: '（无）', placeholder: '搜索在线玩家' });
    var right = [sel.el]; if (cur) right.push(kBtn('清除', function () { evSet(g, 'Owner', null); weRender(); }, { icon: 'trash' }));
    body.appendChild(xRow({ icon: false, title: '主人', sub: '清除不会取消驯服', right: h('div', { class: 'k-row' }, right) }));
    body.appendChild(kHint('鞍、马铠在「属性」页的装备格里换。'));
  },
  chested: function (body) {
    var g = 'chested', own = evGroup(g) || {}, cap = typeof own.capacity === 'number' ? own.capacity : 0, on = evGet(g, 'ChestedHorse');
    body.appendChild(evBool('背着箱子', on, '去掉箱子会丢掉里面的东西', function (v) { evSet(g, 'ChestedHorse', v); if (!v) evSet(g, 'Items', []); weRender(); }));
    if (on && cap > 0) { body.appendChild(evSlotList(g, 'Items', cap)); }
    else if (on) body.appendChild(kHint('这个箱子暂时没有格子（羊驼的格数跟力量有关）。'));
  },
  vehicle_container: function (body) {
    var g = 'vehicle_container', own = evGroup(g) || {};
    if (own.unresolved_loot) { body.appendChild(kHint('里面还有没展开的战利品，先在游戏里打开一次再来改。')); return; }
    body.appendChild(evSlotList(g, 'slots', own.size || 0));
  },
  minecart_display: function (body) {
    var g = 'minecart_display', off = evGet(g, 'DisplayOffset');
    body.appendChild(kBlockState(evGet(g, 'DisplayState'), function (v) { evSet(g, 'DisplayState', v); weRender(); }, { label: '显示的方块', sub: '清除 = 用矿车原来的样子', allowNone: true, empty: '（原样）' }));
    body.appendChild(evNum('显示高度偏移', typeof off === 'number' ? off : 6, { sub: '原样是 6' }, function (x) { evSet(g, 'DisplayOffset', x); }));
    if (typeof off === 'number') body.appendChild(xRow({ icon: false, title: '恢复默认偏移', right: kBtn('恢复', function () { evSet(g, 'DisplayOffset', null); weRender(); }, { icon: 'undo' }) }));
  },
  minecart_command: function (body) {
    var g = 'minecart_command', own = evGroup(g) || {};
    var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: '命令，不用写开头的 /' }); ta.value = String(evGet(g, 'Command') || '');
    ta.addEventListener('change', function () { evSet(g, 'Command', ta.value); });
    body.appendChild(xRow({ icon: false, title: '命令' })); body.appendChild(ta);
    var lo = own.LastOutput; body.appendChild(xRow({ icon: false, title: '上次输出', sub: '只读', right: h('span', { class: 'k-sub', text: lo ? msgText(lo) : '（没有）' }) }));
  },
  boat_type: function (body) {
    var own = evGroup('boat_type') || {};
    body.appendChild(xRow({ icon: false, title: '种类', sub: '由实体类型决定，不能换', right: h('span', { class: 'k-sub', text: own.entityType ? entityName(own.entityType) : '' }) }));
  },
  zombie_conversion: function (body) {
    var own = evGroup('zombie_conversion') || {}, t = own.ConversionTime;
    body.appendChild(xRow({ icon: false, title: '转化倒计时', sub: '只读', right: h('span', { class: 'k-sub', text: typeof t === 'number' && t >= 0 ? t + ' 刻' : '没在转化' }) }));
  },
  dropped_item: function (body) {
    var g = 'dropped_item', st = evGet(g, 'Item') || { id: 'minecraft:stone', count: 1, comps: {}, removed: {} };
    body.appendChild(xRow({ icon: false, title: '物品', right: evStack(st, function (s) { evSet(g, 'Item', s); weRender(); }, { clear: false }) }));
    body.appendChild(evNum('数量', st.count, { min: 1, max: 99 }, function (x) { var n = clone(evGet(g, 'Item') || st); n.count = x; evSet(g, 'Item', n); }));
    body.appendChild(evNumF(g, 'PickupDelay', '拾取延迟', { unit: '刻', sub: '32767 = 永远捡不起来' }));
    body.appendChild(evNumF(g, 'Age', '已存在', { unit: '刻', sub: '6000 刻后消失；-32768 永不消失' }));
  },
  falling_block: function (body) {
    var g = 'falling_block';
    body.appendChild(kBlockState(evGet(g, 'BlockState'), function (v) { evSet(g, 'BlockState', v || { Name: 'minecraft:sand' }); }, { label: '方块', title: '选择方块' }));
    body.appendChild(evNumF(g, 'Time', '已经掉了', { unit: '刻' }));
    body.appendChild(evNumF(g, 'FallHurtAmount', '每格砸伤害', { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'FallHurtMax', '砸伤害上限'));
    body.appendChild(evBool('落地时掉出物品', evGet(g, 'DropItem'), '', function (on) { evSet(g, 'DropItem', on); }));
    body.appendChild(evBool('砸到的生物受伤', evGet(g, 'HurtEntities'), '', function (on) { evSet(g, 'HurtEntities', on); }));
    body.appendChild(evBool('取消掉落', evGet(g, 'CancelDrop'), '', function (on) { evSet(g, 'CancelDrop', on); }));
  },
  tnt: function (body) { body.appendChild(evNumF('tnt', 'fuse', '引信', { unit: '刻', sub: '20 刻 = 1 秒，倒数到 0 爆炸' })); },
  creeper: function (body) {
    body.appendChild(evNumF('creeper', 'Fuse', '引爆倒数', { unit: '刻', sub: '点燃后多久爆炸' }));
    body.appendChild(evNumF('creeper', 'ExplosionRadius', '爆炸威力'));
  },
  enderman: function (body) {
    var g = 'enderman';
    body.appendChild(kBlockState(evGet(g, 'carriedBlockState'), function (v) { evSet(g, 'carriedBlockState', v); }, { label: '手里拿的方块', sub: '清除 = 什么都没拿', allowNone: true, empty: '（没拿）' }));
  },
  area_effect_cloud: function (body) {
    var g = 'area_effect_cloud', pc = evGet(g, 'potion_contents');
    var pot = typeof pc === 'string' ? pc : (pc && pc.potion) || '';
    var sel = kRegSelect({ reg: 'potion', value: pot, title: '选择药水', empty: '（无）', allowClear: true,
      onChange: function (id) { var o = pc && typeof pc === 'object' ? clone(pc) : {}; if (id) o.potion = id; else delete o.potion; evSet(g, 'potion_contents', Object.keys(o).length ? o : null); } });
    var extra = pc && typeof pc === 'object' && Array.isArray(pc.custom_effects) && pc.custom_effects.length ? '另有 ' + pc.custom_effects.length + ' 个自定义效果，在「数据」页改' : '';
    body.appendChild(xRow({ icon: false, title: '药水', right: sel.el }));
    if (extra) body.appendChild(kHint(extra));
    body.appendChild(evNumF(g, 'Radius', '半径', { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'RadiusOnUse', '每次生效后半径变化', { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'RadiusPerTick', '每刻半径变化', { step: 0.01, dec: 4 }));
    body.appendChild(evNumF(g, 'Duration', '总时长', { unit: '刻' }));
    body.appendChild(evNumF(g, 'Age', '已存在', { unit: '刻' }));
    body.appendChild(evNumF(g, 'WaitTime', '生效前等待', { unit: '刻' }));
    body.appendChild(evNumF(g, 'ReapplicationDelay', '同一生物的间隔', { unit: '刻' }));
    body.appendChild(evNumF(g, 'DurationOnUse', '每次生效后时长变化', { unit: '刻' }));
    var ds = evGet(g, 'potion_duration_scale');
    body.appendChild(evNum('效果时长倍数', typeof ds === 'number' ? ds : 1, { step: 0.1, dec: 3, sub: '1 = 原样' }, function (x) { evSet(g, 'potion_duration_scale', x === 1 ? null : x); }));
  },
  experience_orb: function (body) { body.appendChild(evNumF('experience_orb', 'Value', '经验值')); },
  arrow: function (body) {
    var g = 'arrow', opts = (evFields(g).pickup || {}).options || [];
    body.appendChild(evNumF(g, 'damage', '伤害', { step: 0.5, dec: 3 }));
    if (opts.length) body.appendChild(xSeg({ title: '拾取方式', options: opts.map(function (o) { return { v: o.value, label: EV_PICKUP[o.label] || o.label }; }), value: evGet(g, 'pickup'), onChange: function (x) { evSet(g, 'pickup', x); } }));
  },
  interaction: function (body) {
    var g = 'interaction';
    body.appendChild(evNumF(g, 'width', '宽度', { step: 0.1, dec: 3 }));
    body.appendChild(evNumF(g, 'height', '高度', { step: 0.1, dec: 3 }));
    body.appendChild(evBool('点击有反应', evGet(g, 'response'), '点它的时候游戏会给出反馈', function (on) { evSet(g, 'response', on); }));
  }
};

/* ---------- 关系：主人（可改）、队伍和拴绳（只读） ---------- */
function evHasRelations() {
  var team = evGroup('team'), leash = evGroup('leash');
  return !!evGroup('owner') || !!(leash && leash.data) || !!(team && team.name);
}
function evRelationTab(body) {
  var own = evGroup('owner');
  if (own) {
    var cur = evGet('owner', 'Owner') || '', players = own.players || [];
    body.appendChild(xSec('user', '主人'));
    if (own.available === false) body.appendChild(xRow({ icon: false, title: '主人', sub: '没有服务器时不能换，只能清除', right: h('span', { class: 'k-sub', text: cur || '（无）' }) }));
    var entries = players.map(function (p) { return { v: p.uuid, label: p.name, sub: p.uuid }; });
    if (cur && !entries.some(function (e) { return e.v === cur; })) entries.push({ v: cur, label: '不在线的玩家', sub: cur });
    var sel = kSelect(entries, cur || null, function (v) { evSet('owner', 'Owner', v); weRender(); }, { width: 240, empty: '（无）', placeholder: '搜索在线玩家' });
    var right = [sel.el]; if (cur) right.push(kBtn('清除', function () { evSet('owner', 'Owner', null); weRender(); }, { icon: 'trash' }));
    body.appendChild(xRow({ icon: false, title: '玩家', sub: '只能选在线的；清除后不再被驯服', right: h('div', { class: 'k-row' }, right) }));
  }
  var team = evGroup('team'), leash = evGroup('leash');
  body.appendChild(xSec('users', '只读'));
  if (team) body.appendChild(xRow({ icon: false, title: '队伍', sub: team.available === false ? '这个世界没有记分板' : '', right: h('span', { class: 'k-sub', text: team.name || '（没有队伍）' }) }));
  if (leash) body.appendChild(xRow({ icon: false, title: '拴绳', sub: leash.data ? '连接和解除还不能改' : '', right: h('span', { class: 'k-sub', text: leash.data ? '被拴着' : '没有拴着' }) }));
}

/* ---------- 村民 / 流浪商人交易（只有服务端能改） ---------- */
function evOffers() { if (WE.offers === null) WE.offers = clone(evOffersOrig()); return WE.offers; }
function evTradePreview(offer) {
  function stack(st) {
    if (!st || !st.id) return h('span', { class: 'k-sub', text: '未选择' });
    var icon = stackUiIcon(st, 20);
    if (icon.tagName && icon.tagName.toLowerCase() === 'item') icon.setAttribute('count', '1');
    return h('div', { class: 'trade-summary-stack' }, [icon, stackUiName(st), h('span', { class: 'trade-count', text: '× ' + (st.count || 1) })]);
  }
  return h('div', { class: 'trade-summary' }, [
    h('div', { class: 'trade-summary-side' }, [h('span', { class: 'k-sub', text: '你支付' }), stack(offer.buy), offer.buyB ? h('span', { class: 'k-sub', text: '+' }) : null, offer.buyB ? stack(offer.buyB) : null]),
    h('span', { class: 'trade-arrow', text: '→' }),
    h('div', { class: 'trade-summary-side' }, [h('span', { class: 'k-sub', text: '你获得' }), stack(offer.sell)])]);
}
function openTradeDraft(offer, index) {
  var owner = WE.w, offers = WE.offers, priceOpen = false;
  var host = h('div', { class: 'trade-edit-body' });
  function valid() { return WE.w === owner && WE.offers === offers && offers.indexOf(offer) >= 0; }
  function mark() { if (!valid()) { toast('交易目标已更新，请返回后重新打开', 'warn'); return false; } weMarkDirty(); return true; }
  function stackEditor(key, optional) {
    var cur = offer[key], has = cur && cur.id;
    function put(st) {
      if (!valid()) { toast('交易目标已更新，请返回后重新打开', 'warn'); return; }
      if (!st) delete offer[key];
      else { var next = clone(st); delete next.slot; delete next.label; if (cur && next.id !== cur.id) delete next.cost_predicate_snbt; offer[key] = next; }
      mark();
    }
    var label = key === 'sell' ? '你获得' : optional ? '额外支付' : '你支付';
    if (!has && optional) { var addCost = kBtn('添加第二种费用', function () { choose(addCost); }, { icon: 'plus', cls: 'trade-add-cost' }); return addCost; }
    var pick = kItemBtn(has ? cur : null, null);
    function choose(anchor) { pickItem(anchor, function (id) { put({ id: fullId(id), count: (cur && cur.count) || 1, comps: {}, removed: {} }); paint(); }, { onStack: function (st) { put(st); paint(); } }); }
    activate(pick, function () { choose(pick); });
    var controls = [];
    if (has) {
      var qty = kNumber(cur.count || 1, { min: 1, noSlider: true, step: 1, onChange: function (v) { if (valid()) { cur.count = v; var icon = pick.querySelector('item'); if (icon) icon.setAttribute('count', String(v)); mark(); } } });
      var field = qty.el.querySelector('input'); if (field) field.setAttribute('aria-label', label + '数量');
      controls.push(h('span', { class: 'k-sub', text: key === 'sell' ? '数量' : '基础数量', title: key === 'sell' ? '获得的数量' : '实际成交价还受价格调整和玩家声望影响' }), qty.el, kBtn('编辑', function () {
        if (!valid()) { mark(); return; }
        var parentValid = nestedDraftGuard();
        openNestedItem(cur, { title: '交易 · ' + label, valid: function (session) { return valid() && parentValid(session); }, commit: put, render: paint });
      }, { icon: 'edit', title: '编辑此物品的名称、组件和 NBT' }));
      if (optional) controls.push(kDelete(function () { put(null); paint(); }, '移除第二种费用'));
    }
    return h('div', { class: 'trade-item-editor' }, [optional ? h('span', { class: 'k-sub', text: '+ 额外支付' }) : null, pick, h('div', { class: 'trade-item-controls' }, controls)]);
  }
  function num(label, key, options) {
    options = options || {};
    var n = kNumber(typeof offer[key] === 'number' ? offer[key] : 0, { min: options.min, step: options.step || 1, dec: options.dec, noSlider: true, onChange: function (v) { if (valid()) { offer[key] = v; mark(); } } });
    return xField(null, label, n.el);
  }
  function paint() {
    clear(host);
    var pay = h('div', { class: 'trade-edit-side' }, [h('div', { class: 'trade-side-title', text: '你支付' }), stackEditor('buy', false), stackEditor('buyB', true)]);
    var gain = h('div', { class: 'trade-edit-side' }, [h('div', { class: 'trade-side-title', text: '你获得' }), stackEditor('sell', false)]);
    host.appendChild(h('div', { class: 'trade-edit-flow' }, [pay, h('div', { class: 'trade-arrow', text: '→' }), gain]));
    host.appendChild(h('div', { class: 'trade-settings' }, [num('已用次数', 'uses', { min: 0 }), num('次数上限', 'maxUses', { min: 0 }), num('村民经验', 'xp', { min: 0 }),
      xField(null, '玩家获得经验', kToggle(offer.rewardExp !== false, function (on) { if (valid()) { offer.rewardExp = on; mark(); } }).el)]));
    host.appendChild(xRow({ icon: uiIcon('coins', 14), title: '价格调整', sub: '需求、折扣与价格倍率', chevron: true, open: priceOpen, onHead: function () { priceOpen = !priceOpen; paint(); }, body: function () {
      return [num('价格倍率', 'priceMultiplier', { step: 0.01, dec: 3 }), num('需求值', 'demand'), num('特殊价格调整', 'specialPrice')];
    } }));
  }
  paint();
  var modal = openModal(modalShell('交易 ' + (index + 1), '修改保存在父页面草稿', [host], [h('div', { class: 'grow' }), kBtn('完成', closeModal, { cls: 'pri' })], 'trade-editor'), true);
  modal.onEditorClose = function () { if (valid() && !NestedItem) weRedrawBody(); };
}
function evTradeTab(body) {
  var t = evGroup('trades');
  if (!t || t.available === false) { body.appendChild(xEmpty((t && t.reason) || '交易只能在有服务器时修改（单人游戏的内置服务器也行）。')); return; }
  var list = evOffers();
  body.appendChild(xSec('coins', '交易', list.length + ' 条'));
  function mark() { weMarkDirty(); }
  list.forEach(function (o, i) {
    var row = xRow({ icon: false, title: '', sub: '已用 ' + (o.uses || 0) + ' / ' + (o.maxUses || 0) + ' 次', right: kBtn('编辑', function () { openTradeDraft(o, i); }, { icon: 'edit' }),
      onDelete: function () { list.splice(i, 1); mark(); weRender(); }, onHead: function () { openTradeDraft(o, i); } });
    row.classList.add('trade-list-row'); row.querySelector('.z').appendChild(evTradePreview(o)); body.appendChild(row);
  });
  if (list.length < 256) body.appendChild(xAdd('添加一条交易', function () { var offer = { buy: { id: 'minecraft:emerald', count: 1, comps: {}, removed: {} }, sell: { id: 'minecraft:bread', count: 1, comps: {}, removed: {} }, uses: 0, maxUses: 12, rewardExp: true, xp: 1, priceMultiplier: 0.05, demand: 0, specialPrice: 0 }; list.push(offer); mark(); weRender(); openTradeDraft(offer, list.length - 1); }));
  body.appendChild(kHint('关闭游戏交易界面后，再应用修改。'));
}

/* ---------- 乘客 / 骑乘：每一步都是单独的 apply.riding，立刻提交 ---------- */
function evRideSend(riding, note) {
  if (weDirty()) { toast('还有没应用的修改。乘客的改动要单独提交，请先应用或放弃别的修改。', 'info'); return; }
  weSend('apply', { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(WE.w.slot), riding: riding }, note || '已提交给游戏，等待回执…');
}
function evRidingTab(body) {
  var r = evGroup('riding') || {}, ps = r.passengers || [], vh = r.vehicle;
  body.appendChild(xSec('users', '骑乘关系'));
  if (vh) body.appendChild(xRow({ icon: entityIcon(vh.type, 22), title: '正骑着：' + (vh.summary || entityName(vh.type)), sub: shortId(vh.type), right: kBtn('下来', function () { evRideSend({ action: 'dismount' }, '正在让它下来…'); }, { icon: 'down' }) }));
  else body.appendChild(kHint('没有骑着别的东西。'));
  /* 乘客卡片：头部右侧放「添加」和「全部赶下去」，列表在下面，添加表单点「添加」才展开 */
  var addOpen = WE.rideAddOpen === undefined ? !ps.length : !!WE.rideAddOpen, addBox = h('div', { class: 'wp-addbox' });
  var acts = h('span', { class: 'wp-acts' }, [
    ps.length ? kBtn('全部赶下去', function () { evRideSend({ action: 'eject' }, '正在让乘客全部下来…'); }, { icon: 'close', title: '只解除骑乘，生物不会被删除' }) : null,
    kBtn('添加', function () { addOpen = !addOpen; WE.rideAddOpen = addOpen; if (addOpen) { addBox.style.display = ''; uiSlide(addBox, true); } else uiSlide(addBox, false, function () { addBox.style.display = 'none'; }); }, { icon: 'plus', cls: 'pri', title: '给它加一个乘客' })
  ]);
  body.appendChild(xSec('paw', '乘客', ps.length ? ps.length + ' 个' : '没有', acts));
  function node(p, depth) {
    body.appendChild(xRow({ icon: entityIcon(p.type, 22), title: (depth ? '↳ ' : '') + (p.summary || entityName(p.type)), sub: shortId(p.type) + (p.passengers && p.passengers.length ? ' · 背着 ' + p.passengers.length + ' 个' : ''), tip: p.uuid,
      right: kBtn('赶下去', function () { evRideSend({ action: 'remove', uuid: p.uuid }, '正在让它下来…'); }, { icon: 'close', title: '只解除骑乘，生物不会被删除' }) }));
    (p.passengers || []).forEach(function (c) { node(c, depth + 1); });
  }
  if (!ps.length) body.appendChild(xEmpty('没有乘客。'));
  ps.forEach(function (p) { node(p, 0); });
  var type = WE.rideType || 'minecraft:chicken', data = WE.rideData || '';
  addBox.appendChild(esEntityHeader({ id: type, snbtText: function () { var e = vaultEntityObj(WE.rideData || '{}'); e.id = WE.rideType || type; return nbtMerge(e, null); }, onPick: function (id) { if (WE.rideType !== id) WE.rideData = ''; WE.rideType = id; weRedrawBody(); }, onEntityNbt: function (snbt) { try { var payload = vaultEntityPayload(snbt); WE.rideType = payload.type; WE.rideData = payload.snbt; weRedrawBody(); } catch (e) { toast(e.message || '生物数据无法读取', 'error'); } } }));
  var inp = kInput(data, function () {}, { placeholder: '可选的数据，比如 {CustomName:"小鸡"}', onCommit: function (t) { WE.rideData = t; } }); inp.classList.add('we-in');
  addBox.appendChild(xRow({ icon: false, title: '初始数据', sub: 'SNBT，可以不填', right: inp }));
  addBox.appendChild(h('div', { class: 'k-row' }, [kBtn('加上去', function () {
    var act = { action: 'add', type: WE.rideType || 'minecraft:chicken' }; if ((WE.rideData || '').trim()) act.entity_data = WE.rideData.trim();
    evRideSend(act, '正在加上乘客…');
  }, { cls: 'pri', icon: 'plus' })]));
  addBox.appendChild(kHint('骑乘关系的修改不能撤销。'));
  addBox.insertBefore(kHint('新生物会按游戏的规则判断能不能骑上去'), addBox.firstChild);
  addBox.style.display = addOpen ? '' : 'none';
  body.appendChild(addBox);
}
