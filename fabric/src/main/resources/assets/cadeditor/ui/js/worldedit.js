/* 世界编辑：已放置的方块实体（箱子、刷怪笼、告示牌……）和世界里的实体。协议见 docs/world-edit-contract.md。
   页面数据：oriel.data.world（opened/saved 的 world 对象，没有 stack）。保存：apply {requestId, slot, snbt?, container?}；撤销：undo {requestId, slot}。
   这里不猜任何数据：容器格数、方块状态、类型都来自宿主给的 world；SNBT 带类型（byte/short/long/float/double）原样往返。 */

/* ---------- SNBT 打印（保留类型）：把 nbtParse 的节点打印成紧凑 / 缩进文本 ---------- */
function nbtPrint(n, pretty, ind) {
  ind = ind || '';
  var nx = ind + '  ';
  if (n.k === 'num') return n.raw;
  if (n.k === 'bool') return n.v ? 'true' : 'false';
  if (n.k === 'str') return snbtStr(n.v);
  if (n.k === 'arr' || n.k === 'list') {
    var pre = n.k === 'arr' ? n.p + ';' : '';
    if (!n.items.length) return '[' + pre + ']';
    var scalars = n.items.every(function (x) { return x.k !== 'obj' && x.k !== 'list' && x.k !== 'arr'; });
    if (!pretty || (scalars && n.items.length <= 12)) return '[' + pre + n.items.map(function (x) { return nbtPrint(x, false); }).join(',') + ']';
    return '[' + pre + '\n' + n.items.map(function (x) { return nx + nbtPrint(x, true, nx); }).join(',\n') + '\n' + ind + ']';
  }
  if (!n.keys.length) return '{}';
  if (!pretty) return '{' + n.keys.map(function (k) { return snbtKey(k) + ':' + nbtPrint(n.map[k], false); }).join(',') + '}';
  return '{\n' + n.keys.map(function (k) { return nx + snbtKey(k) + ': ' + nbtPrint(n.map[k], true, nx); }).join(',\n') + '\n' + ind + '}';
}

var WE = { w: null, text: '', slots: {}, pending: null, tab: '', seq: 0, obj: null, timer: null, err: '' };
function weActive() { return !!WE.w; }
function weBase() { try { return nbtPrint(nbtParse(WE.w.snbt), false); } catch (e) { return WE.w.snbt; } }
function weDirtyText() { if (!WE.w) return false; try { return nbtPrint(nbtParse(WE.text), false) !== weBase(); } catch (e) { return true; } }
function weDirty() { return weDirtyText() || Object.keys(WE.slots).length > 0; }
function weName() {
  var w = WE.w;
  if (w.kind === 'block') return Reg.nameOf2('block', w.block || w.type) || humanId(shortId(w.block || w.type));
  return Reg.nameOf2('entity_type', w.type) || humanId(shortId(w.type));
}

function weOpen(world) {
  WE.w = world; WE.text = nbtPrint(nbtParse(world.snbt), true); WE.slots = {}; WE.err = ''; WE.obj = null;
  var tabs = weTabs(); if (!tabs.some(function (t) { return t.id === WE.tab; })) WE.tab = tabs[0].id;
  weRender();
}
function weTabs() {
  var w = WE.w, t = [];
  if (w.container && w.container.slots) t.push({ id: 'container', label: '容器', icon: 'chest' });
  if (w.kind === 'block' && (w.type === 'minecraft:mob_spawner' || w.type === 'minecraft:trial_spawner')) t.push({ id: 'spawner', label: '刷怪设置', icon: 'paw' });
  if (w.kind === 'entity') t.push({ id: 'entity', label: '属性', icon: 'paw' });
  t.push({ id: 'data', label: '数据', icon: 'code' });
  return t;
}
function weRender() {
  var w = WE.w; if (!w) return;
  drawWorldTop(); drawWorldScreen(); drawWorldFoot();
}
function drawWorldTop() {
  var bar = clear($('topbar')), w = WE.w;
  bar.appendChild(h('span', { class: 'eb-ico' }, [w.kind === 'block' ? itemIcon(shortId(w.block || w.type), 22) : uiIcon('paw', 22)]));
  bar.appendChild(h('span', { class: 'ttl', text: weName() }));
  bar.appendChild(h('span', { class: 'crumb', text: w.kind === 'block' ? '方块' : '实体' }));
  bar.appendChild(h('div', { class: 'grow' }));
  var un = h('div', { class: 'k-ibtn' + (w.canUndo ? '' : ' dis'), title: '撤销上一次写入游戏的修改' }, [uiIcon('undo', 14)]);
  activate(un, function () { if (WE.w.canUndo) weUndo(); });
  bar.appendChild(un);
  var n = weDirty();
  var ap = h('div', { class: 'k-btn pri k-apply' + (n ? '' : ' dim'), title: n ? '写入游戏' : '还没有修改' }, [uiIcon('play', 12), h('span', { text: '应用修改' })]);
  activate(ap, weApply);
  bar.appendChild(ap);
  var x = h('div', { class: 'k-ibtn', title: '关闭' }, [uiIcon('close', 14)]);
  activate(x, function () { try { if (oriel.close) oriel.close(); } catch (e) {} });
  bar.appendChild(x);
}
function drawWorldFoot() {
  var f = clear($('footer')), w = WE.w, s = w.slot || {};
  f.appendChild(h('span', { class: 'it' + (weDirty() ? ' chg' : '') }, [h('i', { class: 'dot' }), weDirty() ? '有未应用的修改' : '没有未应用的修改']));
  if (WE.err) f.appendChild(h('span', { class: 'it bad' }, [uiIcon('close', 12), WE.err]));
  f.appendChild(h('div', { class: 'grow' }));
  f.appendChild(h('span', { class: 'it', text: w.kind === 'block' ? s.x + ' ' + s.y + ' ' + s.z : shortId(w.type) }));
}
function drawWorldScreen() {
  var host = clear($('screen')), w = WE.w;
  applyWinStyle();
  var hero = h('aside', { class: 'ed-hero', id: 'hero' });
  var vis = w.kind === 'block' ? itemIcon(shortId(w.block || w.type), 48) : h('entity', { id: w.type, rotatable: true, style: 'width:96px;height:96px;' });
  hero.appendChild(h('div', { class: 'ed-stage' }, [h('div', { class: 'plate' }), vis]));
  hero.appendChild(h('div', { class: 'ed-name', text: weName() }));
  hero.appendChild(h('div', { class: 'ed-tags' }, [h('span', { class: 'k-tag', text: w.kind === 'block' ? '方块' : '实体' }), h('span', { class: 'k-tag dim', text: shortId(w.type) })]));
  var st = h('div', { class: 'ed-stats' });
  if (w.block_state) Object.keys(w.block_state).forEach(function (k) { st.appendChild(h('div', { class: 'k-stat' }, [h('span', { class: 'sl', text: k }), h('b', { text: String(w.block_state[k]) })])); });
  hero.appendChild(st);
  var right = h('section', { class: 'ed-right' }), tabbar = h('div', { class: 'ed-tabs', id: 'tabbar' }), body = h('div', { class: 'ed-body', id: 'edbody' });
  weTabs().forEach(function (t) {
    var el = h('div', { class: 'ed-tab' + (WE.tab === t.id ? ' on' : '') }, [uiIcon(t.icon, 14), h('span', { text: t.label })]);
    activate(el, function () { WE.tab = t.id; weRender(); });
    tabbar.appendChild(el);
  });
  right.appendChild(tabbar); right.appendChild(body);
  host.appendChild(hero); host.appendChild(right);
  if (WE.tab === 'container') weContainerTab(body);
  else if (WE.tab === 'spawner') weSpawnerTab(body);
  else if (WE.tab === 'entity') weEntityTab(body);
  else weDataTab(body);
}

/* ---------- 容器：格子 + 点开改物品 / 数量 / 清空；只发改过的格子，没改的格子宿主保留原样 ---------- */
function weSlotStack(i) {
  if (WE.slots[i]) return WE.slots[i];
  var s = WE.w.container.slots.filter(function (x) { return x.slot === i; })[0];
  return s ? s.stack : { empty: true };
}
function weContainerTab(body) {
  var c = WE.w.container, n = c.size, cols = n <= 5 ? n : n <= 9 ? 3 : 9;
  if (c.unresolved_loot) { body.appendChild(xEmpty('这个容器里的战利品还没有生成（第一次打开时才会生成）。请先在游戏里打开一次，再回来编辑。')); return; }
  body.appendChild(xSec('chest', '里面的物品', n + ' 格'));
  var grid = h('div', { class: 'k-cgrid' }); grid.setAttribute('style', 'grid-template-columns:repeat(' + cols + ',34px)');
  function paint(cell, i) {
    clear(cell);
    var st = weSlotStack(i);
    if (st.empty) { cell.setAttribute('title', '空格子 ' + (i + 1)); return; }
    cell.appendChild(itemIcon(st.id, 26));
    if ((st.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(st.count) }));
    if (st.comps && Object.keys(st.comps).length) cell.appendChild(h('i', { class: 'mk', title: '这个物品带有自己的组件数据，会原样保留' }));
    cell.setAttribute('title', nameOfItem(st.id) + ' × ' + (st.count || 1));
  }
  function edit(cell, i) {
    var cur = weSlotStack(i), box = h('div', { class: 'k-pickbox' });
    function set(st) { if (st.empty && weOrigEmpty(i)) delete WE.slots[i]; else WE.slots[i] = st; paint(cell, i); drawWorldTop(); drawWorldFoot(); }
    var pick = h('div', { class: 'k-btn' }, cur.empty ? [uiIcon('plus', 12), h('span', { text: '选择物品' })] : [itemIcon(cur.id, 22), h('span', { text: nameOfItem(cur.id) })]);
    activate(pick, function () { pickItem(cell, function (id) { var o = weSlotStack(i); set({ id: fullId(id), count: o.empty ? 1 : (o.count || 1), comps: {}, removed: {} }); kPopClose(); }); });
    box.appendChild(pick);
    if (!cur.empty) {
      var cnt = kNumber(cur.count || 1, { min: 1, max: 99, noSlider: true, step: 1, unit: '个', onChange: function (v) { var o = clone(weSlotStack(i)); o.count = v; set(o); } });
      box.appendChild(fieldRow('数量', cnt.el));
      box.appendChild(kBtn('清空这一格', function () { set({ empty: true }); kPopClose(); }, { cls: 'dng', icon: 'trash' }));
    }
    kPopover(cell, box, { width: 250, maxHeight: 280 });
  }
  for (var i = 0; i < n; i++) (function (i) {
    var cell = h('div', { class: 'slot s34' }); paint(cell, i); cell.addEventListener('click', function () { edit(cell, i); }); grid.appendChild(cell);
  })(i);
  body.appendChild(grid);
}
function weOrigEmpty(i) { var s = WE.w.container.slots.filter(function (x) { return x.slot === i; })[0]; return !s || s.stack.empty; }

/* 表单页用的对象：从当前文本取（「数据」页改过的内容不丢）；写回时按当前文本的类型合并，没动的字段原样保留 */
function weObj() {
  if (!WE.obj) { try { WE.obj = nbtToJson(nbtParse(WE.text)); } catch (e) { WE.obj = clone(WE.w.nbt) || {}; } }
  return WE.obj;
}
function wePut() {
  var ref; try { ref = nbtParse(WE.text); } catch (e) { ref = nbtParse(WE.w.snbt); }
  try { WE.text = nbtPrint(nbtParse(nbtMerge(WE.obj, ref)), true); WE.err = ''; } catch (e) { WE.err = String(e.message || e); }
  drawWorldTop(); drawWorldFoot();
}

/* ---------- 刷怪笼：直接复用物品里的刷怪笼页（spawn.js），数据换成这个方块实体的 NBT ---------- */
function weSpawnerTab(body) {
  var w = WE.w, obj = weObj();
  if (w.type === 'minecraft:trial_spawner') buildTrialSpawner(body, obj, w.type, wePut); else buildMobSpawner(body, obj, w.type, wePut);
}

/* ---------- 实体：变种、常用开关、装备（eschema.js，数据来自游戏的 entity_schema）；其余字段在「数据」页 ---------- */
function weEntityTab(body) {
  weObj();
  body.appendChild(esPanel({ type: WE.w.type, get: function () { return WE.obj; }, set: function (o) { WE.obj = o; wePut(); } }));
  body.appendChild(h('div', { class: 'k-sub', text: '位置、UUID 等其余字段在「数据」页用 SNBT 编辑。' }));
}

/* ---------- 数据：完整 SNBT（带类型），改完点应用 ---------- */
function weDataTab(body) {
  body.appendChild(xSec('code', '完整数据', '带类型的 SNBT'));
  var ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false' }); ta.value = WE.text;
  var msg = h('div', { class: 'k-sub' });
  ta.addEventListener('input', function () {
    WE.text = ta.value;
    try { nbtParse(ta.value); msg.textContent = ''; WE.err = ''; } catch (e) { msg.textContent = 'SNBT 有误：' + (e.message || e); WE.err = ''; }
    WE.obj = null; drawWorldTop(); drawWorldFoot();
  });
  body.appendChild(ta); body.appendChild(msg);
  body.appendChild(kBtn('放弃这里的修改', function () { WE.text = nbtPrint(nbtParse(WE.w.snbt), true); WE.obj = null; weRender(); }, { icon: 'undo' }));
}

/* ---------- 应用 / 撤销 / 回执 ---------- */
function weApply() {
  if (WE.pending) { toast('上一笔修改还没有回执', 'info'); return; }
  var w = WE.w, msg = { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(w.slot) };
  if (weDirtyText()) {
    try { msg.snbt = nbtPrint(nbtParse(WE.text), false); } catch (e) { toast('SNBT 有误，没有提交：' + (e.message || e), 'error'); return; }
  }
  var cs = Object.keys(WE.slots).map(function (k) { return { slot: Number(k), stack: WE.slots[k] }; });
  if (cs.length) msg.container = { slots: cs };
  if (!msg.snbt && !msg.container) { toast('还没有修改', 'info'); return; }
  weSend('apply', msg, '已提交给游戏，等待回执…');
}
function weUndo() {
  if (WE.pending) return;
  weSend('undo', { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(WE.w.slot) }, '正在撤销…');
}
function weSend(op, msg, note) {
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send(op, msg) : false;
  if (!sent) { toast('宿主没有接受提交（未连接或限流）；修改已保留', 'error'); return; }
  WE.pending = msg.requestId; toast(note, 'info');
  clearTimeout(WE.timer);
  WE.timer = setTimeout(function () { if (WE.pending === msg.requestId) { WE.pending = null; toast('10 秒没有收到回执，结果未知；请关闭后重新打开核对', 'error'); } }, 12000);
}
var WE_CODE = { target_changed: '目标在你编辑期间被改动了（炉子燃烧、刷怪笼计时、生物移动都会触发），没有覆盖。请关闭后重新按 O 打开再改。', session_lost: '编辑会话已失效，请关闭后重新打开。', not_allowed: '没有权限。', out_of_reach: '离得太远了，走近一点。', chunk_unloaded: '所在区块没有加载。', protected_area: '这里受保护，不能修改。', invalid_nbt: '数据没有通过游戏的校验。', slot_invalid: '这个格子放不下这个物品。', unsupported_target: '这个目标暂时不能这样编辑。', rate_limited: '操作太快了，稍等一下。', payload_too_large: '数据太大。' };
function weResult(r) {
  if (!r || r.requestId !== WE.pending) return;
  clearTimeout(WE.timer); WE.pending = null;
  if (r.status !== 'saved') { var hint = WE_CODE[r.code]; WE.err = r.reason || r.code || '失败'; toast((r.reason || r.code || '修改没有成功') + (hint ? String.fromCharCode(10) + hint : ''), 'error'); drawWorldFoot(); return; }
  toast('游戏已确认修改', 'ok');
}
function weSaved(world) {
  if (!world) return;
  var keepTab = WE.tab;
  weOpen(world); WE.tab = weTabs().some(function (t) { return t.id === keepTab; }) ? keepTab : weTabs()[0].id; weRender();
}
/* 世界实体页：entity_schema 到了再画一次（物品页的重画在 app.js，世界页没有物品文档，要自己接） */
Reg.on(function (kind, kinds) { if (weActive() && WE.tab === 'entity' && (kinds || [kind]).indexOf('entity_schema') >= 0 && !$('modal')) { try { drawWorldScreen(); } catch (e) {} } });
