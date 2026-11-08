/* 世界编辑：已放置的方块实体（箱子、刷怪笼、告示牌……）和世界里的实体。协议见 docs/world-edit-contract.md。
   页面数据：oriel.data.world（opened/saved 的 world 对象，没有 stack）。保存：apply {requestId, slot, snbt?, container?}；撤销：undo {requestId, slot}。
   这里不猜任何数据：容器格数、方块状态、类型都来自宿主给的 world；SNBT 带类型（byte/short/long/float/double）原样往返。 */

/* ---------- SNBT 打印（保留类型）：把 nbtParse 的节点打印成紧凑 / 缩进文本 ---------- */

var WE = { w: null, text: '', slots: {}, pending: null, tab: '', seq: 0, obj: null, timer: null, err: '' };
function weActive() { return !!WE.w; }
function weBase() { try { return nbtPrint(nbtParse(WE.w.snbt), false); } catch (e) { return WE.w.snbt; } }
function weDirtyText() { if (!WE.w) return false; try { return nbtPrint(nbtParse(WE.text), false) !== weBase(); } catch (e) { return true; } }
function weDirty() { return weDirtyText() || Object.keys(WE.slots).length > 0 || (typeof weViewsDirty === 'function' && weViewsDirty()) || (typeof evDirty === 'function' && evDirty()); }
function weName() {
  var w = WE.w;
  if (w.player) return (w.player.name || '玩家') + (w.player.self ? '（你）' : '');
  if (w.kind === 'block') { var bid = shortId(w.block || w.type); return nameOfItem(bid) || Reg.nameOf2('block', w.block || w.type) || humanId(bid); }
  return entityName(w.type);
}

function weOpen(world) {
  WE.w = world; WE.text = nbtPrint(nbtParse(world.snbt), true); WE.slots = {}; WE.err = ''; WE.obj = null; if (typeof weResetEdits === 'function') weResetEdits(); if (typeof weEntReset === 'function') weEntReset(); if (typeof wpReset === 'function') wpReset();
  var tabs = weTabs(); if (!tabs.some(function (t) { return t.id === WE.tab; })) WE.tab = tabs[0].id;
  weRender();
}
function weTabs() {
  var w = WE.w, t = [], noBE = w.kind === 'block' && w.has_block_entity === false;
  if (w.kind === 'block' && weViewGroups().length) { var vi = weViewTabInfo(); t.push({ id: 'view', label: vi.label, icon: vi.icon }); }
  if (!noBE && w.container && w.container.slots) t.push({ id: 'container', label: '容器', icon: 'chest' });
  if (!noBE && w.kind === 'block' && (w.type === 'minecraft:mob_spawner' || w.type === 'minecraft:trial_spawner')) t.push({ id: 'spawner', label: '刷怪设置', icon: 'paw' });
  if (w.kind === 'block' && (weStateSchema().length || weTypeSchema().length > 1)) t.push({ id: 'state', label: '方块状态', icon: 'sliders' });
  if (noBE) return t;
  if (w.kind === 'entity' && w.player) {
    return [{ id: 'pinv', label: '背包', icon: 'backpack' }, { id: 'pender', label: '末影箱', icon: 'chest' }, { id: 'pstat', label: '状态', icon: 'heart' }, { id: 'pabil', label: '能力', icon: 'wind' }, { id: 'pattr', label: '属性与效果', icon: 'sliders' }];
  }
  if (w.kind === 'entity') {
    if (evGroup('pose')) t.push({ id: 'pose', label: '姿势', icon: 'user' });
    if (evGroup('item_frame')) t.push({ id: 'frame', label: '展示框', icon: 'image' });
    if (evGroup('painting')) t.push({ id: 'painting', label: '画', icon: 'image' });
    if (evGroup('display')) t.push({ id: 'display', label: '展示', icon: 'cube' });
    if (evGroup('trades')) t.push({ id: 'trades', label: '交易', icon: 'coins' });
    if (evSimpleGroups().length) { var si = evSimpleTabInfo(); t.push({ id: 'ents', label: si.label, icon: si.icon }); }
    if (evHasRelations()) t.push({ id: 'relations', label: '关系', icon: 'users' });
    t.push({ id: 'entity', label: '属性', icon: 'paw' });
    if (evGroup('riding')) t.push({ id: 'riding', label: '乘客', icon: 'users' });
  }
  t.push({ id: 'data', label: '数据', icon: 'code' });
  return t;
}
function weRender() {
  var w = WE.w; if (!w) return;
  drawWorldTop(); drawWorldScreen(); drawWorldFoot();
}
function drawWorldTop() {
  var bar = clear($('topbar')), w = WE.w;
  edTopHead(bar, { icon: w.kind === 'block' ? itemIcon(shortId(w.block || w.type), 22) : w.player ? itemIcon('player_head', 22) : entityIcon(w.type, 22), title: weName(), crumb: w.kind === 'block' ? '方块' : w.player ? '玩家' : '实体' });
  var un = h('div', { class: 'k-ibtn' + (w.canUndo ? '' : ' dis'), title: '撤销上一次写入游戏的修改' }, [uiIcon('undo', 14)]);
  activate(un, function () { if (WE.w.canUndo) weUndo(); });
  bar.appendChild(un);
  var vb = h('div', { class: 'k-ibtn', title: '保险库：把物品存起来，或取出放进槽位' }, [uiIcon('chest', 14)]); activate(vb, function () { openVault(); });
  var th = h('div', { class: 'k-ibtn', title: '设置' }, [uiIcon('sliders', 14)]); activate(th, openSettings);
  bar.appendChild(vb); bar.appendChild(th);
  var n = weDirty(), cnt = weChangeCount();
  bar.appendChild(edApplyBtn({ dirty: n, count: cnt, tip: '写入游戏', tipOff: '还没有修改', onClick: weApply }));
  bar.appendChild(edMaxBtn());
  bar.appendChild(edCloseBtn('关闭', closeEditor));
}
/* 改了任何草稿之后：顶栏的「应用修改」计数和撤销、底栏的「有未应用的修改」一起刷新 */
function weMarkDirty() { drawWorldTop(); drawWorldFoot(); }
function drawWorldFoot() {
  var f = clear($('footer')), w = WE.w, s = w.slot || {};
  f.appendChild(edFootChg(weDirty(), '有未应用的修改', '没有未应用的修改'));
  if (WE.err) f.appendChild(h('span', { class: 'it bad' }, [uiIcon('close', 12), WE.err]));
  f.appendChild(h('div', { class: 'grow' }));
  f.appendChild(h('span', { class: 'it', title: '这个目标在世界里的位置', text: weWhere() }));
}
function drawWorldScreen() {
  var host = clear($('screen')), w = WE.w;
  applyWinStyle();
  var hero = h('aside', { class: 'ed-hero', id: 'hero' });
  var right = h('section', { class: 'ed-right' }), tabbar = h('div', { class: 'ed-tabs', id: 'tabbar' }), body = h('div', { class: 'ed-body', id: 'edbody' });
  weTabs().forEach(function (t) {
    var el = h('div', { class: 'ed-tab' + (WE.tab === t.id ? ' on' : '') }, [uiIcon(t.icon, 14), h('span', { text: t.label })]);
    activate(el, function () { WE.tab = t.id; weRender(); });
    tabbar.appendChild(el);
  });
  var tools = h('div', { class: 'ed-tools', id: 'edtools' });
  right.appendChild(tabbar); right.appendChild(tools); right.appendChild(body);
  host.appendChild(hero); host.appendChild(makeSplit()); host.appendChild(right); ensureResize();
  weHero();
  weTabBody(body);
}
function weTabBody(body) {
  ES_WAIT = false;
  if (typeof weDndReset === 'function') weDndReset();
  if (WE.tab === 'pinv') wpInventoryTab(body);
  else if (WE.tab === 'pender') wpEnderTab(body);
  else if (WE.tab === 'pstat') wpStatusTab(body);
  else if (WE.tab === 'pabil') wpAbilitiesTab(body);
  else if (WE.tab === 'pattr') wpAttrTab(body);
  else if (WE.tab === 'pose') evPoseTab(body);
  else if (WE.tab === 'frame') evFrameTab(body);
  else if (WE.tab === 'painting') evPaintingTab(body);
  else if (WE.tab === 'display') evDisplayTab(body);
  else if (WE.tab === 'trades') evTradeTab(body);
  else if (WE.tab === 'ents') evSimpleTab(body);
  else if (WE.tab === 'relations') evRelationTab(body);
  else if (WE.tab === 'riding') evRidingTab(body);
  else if (WE.tab === 'view') weViewTab(body);
  else if (WE.tab === 'state') weStateTab(body);
  else if (WE.tab === 'container') weContainerTab(body);
  else if (WE.tab === 'spawner') weSpawnerTab(body);
  else if (WE.tab === 'entity') weEntityTab(body);
  else weDataTab(body);
  foldify(body, 'w:' + WE.tab); weTools();
}
function weTabLabel() { var tab = weTabs().filter(function (x) { return x.id === WE.tab; })[0]; return tab ? tab.label : ''; }
/* 工具行：当前页名 + 折叠 / 展开本页全部卡片（和物品页的 buildToolsRow 同一个样子） */
function weTools() {
  var t = $('edtools'); if (!t) return; clear(t);
  var cards = Array.prototype.slice.call(($('edbody') || document).querySelectorAll('.w-card')), tab = weTabs().filter(function (x) { return x.id === WE.tab; })[0];
  t.style.display = cards.length > 1 ? '' : 'none';
  t.appendChild(h('span', { class: 'ed-tools-t', text: tab ? tab.label : '' })); t.appendChild(h('div', { class: 'grow' }));
  crumbLast = ''; crumbBind($('edbody'), null); setTimeout(updateCrumb, 0);
  var all = h('div', { class: 'k-mini', title: '折叠 / 展开本页全部卡片' }, [uiIcon('layers', 14)]);
  activate(all, function () { var collapse = cards.some(function (c) { return !c.classList.contains('collapsed'); }); cards.forEach(function (c) { if (c._card) c._card.setCollapsed(collapse); }); });
  t.appendChild(all);
}
/* 只重画右边的标签页内容（拖动 / 放下物品后用），保留滚动位置，不动左栏和顶栏 */
function weRedrawBody() { var body = $('edbody'); if (!body) return; var top = body.scrollTop; clear(body); weTabBody(body); body.scrollTop = top; weMarkDirty(); }

/* ---------- 容器：格子 + 点开改物品 / 数量 / 清空；只发改过的格子，没改的格子宿主保留原样 ---------- */
function weSlotStack(i) {
  if (WE.slots[i]) return WE.slots[i];
  var s = WE.w.container.slots.filter(function (x) { return x.slot === i; })[0];
  return s ? s.stack : { empty: true };
}
function weContainerTab(body) {
  var c = WE.w.container, n = c.size, cols = n <= 5 ? n : n <= 9 ? 3 : 9;
  if (c.unresolved_loot) { body.appendChild(xEmpty('这个容器里的战利品还没有生成（第一次打开时才会生成）。请先在游戏里打开一次，再回来编辑。')); return; }
  body.appendChild(xSec('chest', '里面的物品', n + ' 格' + (c.double ? '，两个箱子合起来' : '')));
  body.appendChild(weDndHint());
  var ix = []; for (var i = 0; i < n; i++) ix.push(i);
  body.appendChild(kSlotGrid({ tight: true, indices: ix, cols: cols, stackOf: weSlotStack, titleOf: function (i) { return '格子 ' + (i + 1); },
    set: function (i, st) { if (st.empty && weOrigEmpty(i)) delete WE.slots[i]; else WE.slots[i] = st; weMarkDirty(); } }));
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
  weMarkDirty(); weHeroLive();
}

/* ---------- 刷怪笼：直接复用物品里的刷怪笼页（spawn.js），数据换成这个方块实体的 NBT ---------- */
function weSpawnerTab(body) {
  var w = WE.w, obj = weObj();
  if (w.type === 'minecraft:trial_spawner') buildTrialSpawner(body, obj, w.type, wePut); else buildMobSpawner(body, obj, w.type, wePut);
}

/* ---------- 实体：变种、常用开关、装备（eschema.js，数据来自游戏的 entity_schema）；其余字段在「数据」页 ---------- */
function weEntityTab(body) {
  weObj();
  body.appendChild(esEntityHeader({ id: WE.w.type, sub: shortId(WE.w.type) + ' · 放置好的生物不能换类型',
    snbtText: function () { var t = WE.text; try { t = nbtPrint(nbtParse(WE.text), false); } catch (e) {} return t; },
    onApplyVault: function (snbt) {
      var o = vaultEntityObj(snbt), cur = weObj();
      if (o.id && Reg.full(o.id) !== Reg.full(WE.w.type)) { toast('类型不同：这是 ' + entityName(o.id) + '，这里是 ' + weName() + '。放置好的生物不能换类型。', 'warn'); return; }
      Object.keys(o).forEach(function (k) { if (k !== 'id') cur[k] = o[k]; });
      WE.obj = cur; wePut(); weRedrawBody();
    } }));
  body.appendChild(esPanel({ type: WE.w.type, get: function () { return WE.obj; }, set: function (o) { WE.obj = o; wePut(); } }));
  body.appendChild(kHint('位置、UUID 等其余字段在「数据」页用 SNBT 编辑。'));
}

/* ---------- 数据：完整 SNBT（带类型），改完点应用 ---------- */
function weDataTab(body) {
  if (weTabs().length === 1) body.appendChild(kHint('这个' + (WE.w.kind === 'block' ? '方块' : '实体') + '没有可视化的设置，可以在下面直接改带类型的数据（SNBT）。'));
  body.appendChild(xSec('code', '完整数据', '带类型的 SNBT'));
  var ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false' }); ta.value = WE.text;
  var msg = h('div', { class: 'k-sub' });
  ta.addEventListener('input', function () {
    WE.text = ta.value;
    try { nbtParse(ta.value); msg.textContent = ''; WE.err = ''; } catch (e) { msg.textContent = 'SNBT 有误：' + (e.message || e); WE.err = ''; }
    WE.obj = null; weMarkDirty();
  });
  body.appendChild(ta); body.appendChild(msg);
  body.appendChild(kBtn('放弃这里的修改', function () { WE.text = nbtPrint(nbtParse(WE.w.snbt), true); WE.obj = null; weRender(); }, { icon: 'undo' }));
}

/* ---------- 应用 / 撤销 / 回执 ---------- */
function weApply() {
  if (WE.pending) { toast('上一笔修改还没有回执', 'info', 'we-wait'); return; }
  if (Date.now() - (WE.lastSendAt || 0) < 650) return;   // 服务器 500ms 限流：连点不重复提交
  var w = WE.w, msg = { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(w.slot) };
  if (weDirtyText()) {
    try { msg.snbt = nbtPrint(nbtParse(WE.text), false); } catch (e) { toast('SNBT 有误，没有提交：' + (e.message || e), 'error'); return; }
  }
  var cs = Object.keys(WE.slots).map(function (k) { return { slot: Number(k), stack: WE.slots[k] }; });
  if (cs.length) msg.container = { slots: cs };
  if (typeof weViewsMsg === 'function') weViewsMsg(msg);
  if (typeof evMsg === 'function') evMsg(msg);
  if (!msg.snbt && !msg.container && !msg.entity && !msg.views && !msg.block_state && !msg.block_type) { toast('还没有修改', 'info'); return; }
  weSend('apply', msg, '已提交给游戏，等待回执…');
}
function weUndo() {
  if (WE.pending) return;
  weSend('undo', { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(WE.w.slot) }, '正在撤销…');
}
function weSend(op, msg, note) {
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send(op, msg) : false;
  if (!sent) { toast('宿主没有接受提交（未连接或限流）；修改已保留', 'error'); return; }
  WE.lastSendAt = Date.now(); WE.pending = msg.requestId; WE.lastMsg = { op: op, msg: msg, note: note }; toast(note, 'info', 'we-pending');
  clearTimeout(WE.timer);
  WE.timer = setTimeout(function () { if (WE.pending === msg.requestId) { WE.pending = null; toast('10 秒没有收到回执，结果未知；请关闭后重新打开核对', 'error'); } }, 12000);
}
var WE_CODE = { target_changed: '你改的内容和游戏在你编辑期间的改动撞在了同一个字段上，没有覆盖。没动过的字段（计时、进度、位置……）不会造成冲突；请重新打开，在最新数据上再改一次。', session_lost: '编辑会话已失效，请关闭后重新打开。', not_allowed: '没有权限。', out_of_reach: '离得太远了，走近一点。', chunk_unloaded: '所在区块没有加载。', protected_area: '这里受保护，不能修改。', invalid_nbt: '数据没有通过游戏的校验。', slot_invalid: '这个格子放不下这个物品。', unsupported_target: '这个目标暂时不能这样编辑。', rate_limited: '操作太快了，稍等一下。', payload_too_large: '数据太大。' };
function weResult(r) {
  if (!r || r.requestId !== WE.pending) return;
  clearTimeout(WE.timer); WE.pending = null; toastDismiss('we-pending');
  if (r.status !== 'saved') {
    /* 提交太快被限流：不让用户一直点，按服务器给的等待时间自动重发一次（最多 2 次） */
    if (r.code === 'rate_limited' && WE.lastMsg && (WE.lastMsg.tries || 0) < 2) {
      var lm = WE.lastMsg, wait = Math.max(300, Math.min(2000, +r.retryAfterMs || 700)); lm.tries = (lm.tries || 0) + 1;
      setTimeout(function () { if (WE.pending || !weActive()) return; var m2 = clone(lm.msg); m2.requestId = 'w-' + Date.now() + '-' + (++WE.seq); lm.msg = m2; weSend(lm.op, m2, lm.note); WE.lastMsg.tries = lm.tries; }, wait);
      return;
    }
    var hint = WE_CODE[r.code]; WE.err = r.reason || r.code || '失败';
    /* 服务器会说明是哪种“变了”：页面数据太旧 / 目标换了 / 会话失效 / 字段真的撞了（conflicts） */
    if (r.code === 'target_changed' && !(Array.isArray(r.conflicts) && r.conflicts.length)) hint = r.stale === 'identity' ? '目标已经不是你打开时的那个了（被替换、换了类型或换了实体）。请重新打开。' : r.stale === 'client_revision' ? '你的页面数据已经过期（上一次保存的回执还没到，或目标已被别处改过）。请关闭后重新打开再改。' : r.stale === 'session' ? '编辑会话已经失效。请关闭后重新打开。' : hint;
    var cf = Array.isArray(r.conflicts) && r.conflicts.length ? String.fromCharCode(10) + '冲突的字段：' + r.conflicts.slice(0, 6).map(function (c) { return (c.path || []).join('.'); }).join('；') + (r.conflicts.length > 6 ? ' 等 ' + r.conflicts.length + ' 处' : '') : '';
    toast((hint || r.reason || r.code || '修改没有成功') + cf, 'error', 'we-error'); drawWorldFoot(); return;
  }
  WE.lastMsg = null; toast('游戏已确认修改', 'ok', 'we-ok');
}
function weSaved(world) {
  if (!world) return;
  var keepTab = WE.tab;
  weOpen(world); WE.tab = weTabs().some(function (t) { return t.id === keepTab; }) ? keepTab : weTabs()[0].id; weRender();
}
/* 注册表整体就绪（registry.meta）时，如果当前页是占位的「正在读取」，重画一次让它去发请求 */
Reg.on(function () { if (weActive() && ES_WAIT && Reg.live() && !$('modal')) { try { weRedrawBody(); } catch (e) {} } });
/* 世界实体页：entity_schema 到了再画一次（物品页的重画在 app.js，世界页没有物品文档，要自己接） */
Reg.on(function (kind, kinds) { if (weActive() && (WE.tab === 'entity' || WE.tab === 'spawner') && (kinds || [kind]).indexOf('entity_schema') >= 0 && !$('modal')) { try { drawWorldScreen(); } catch (e) {} } });

/* ---------- 左栏：和物品页同一套（预览可折叠 + 2D / 3D，名字，标签，属性可折叠） ---------- */
var WE_DIM = Labels.dim;
function weWhere() {
  var w = WE.w, s = w.slot || {}, dim = s.dim ? (WE_DIM[s.dim] || s.dim) : '';
  if (w.kind === 'block') return '位置 ' + s.x + ' ' + s.y + ' ' + s.z + (dim ? ' · ' + dim : '');
  var p = w.nbt && Array.isArray(w.nbt.Pos) ? w.nbt.Pos.map(function (v) { return Math.round(Number(v)); }) : null;
  return (p ? '位置 ' + p.join(' ') : shortId(w.type)) + (dim ? ' · ' + dim : '');
}
function weChangeCount() {
  var n = (weDirtyText() ? 1 : 0) + Object.keys(WE.slots).length + (typeof wpSlotsDirty === 'function' ? wpSlotsDirty() : 0);
  if (typeof weViewsDirty === 'function') n += Object.keys(WE.views).length + Object.keys(WE.bstate).length + (WE.btype && WE.btype !== WE.w.block ? 1 : 0);
  if (typeof evDirty === 'function' && evDirty()) n += Object.keys(WE.ent).length + (WE.offers !== null ? 1 : 0);
  return n;
}
function weHero() {
  var hero = $('hero'); if (!hero || !WE.w) return;
  var w = WE.w, isBlock = w.kind === 'block', scrollTop = hero.scrollTop, oldEnt = hero.querySelector('.k-ent'); clear(hero);
  var can3d = typeof ED_MC === 'undefined', view = can3d && UI.heroView === '3d' ? '3d' : '2d';
  var bid = isBlock ? shortId(w.block || w.type) : '';
  var isPlayer = !!w.player, psrc = isPlayer ? (w.player.self ? { player: true } : (w.slot && /^[0-9]+$/.test(String(w.slot.id)) ? { id: w.slot.id } : null)) : null;
  var vis, entView = !isBlock && view === '3d' && (!isPlayer || !!psrc);
  if (isBlock) vis = view === '3d' ? h('model', { class: 'k-ico k-model', item: fullId(bid), rotatable: true }) : itemIcon(bid, 48);
  else if (isPlayer) vis = entView ? heroEntity(w.type, {}, oldEnt, psrc) : itemIcon('player_head', 48);
  else vis = entView ? heroEntity(w.type, weObj(), oldEnt) : entityIcon(w.type, 48);
  var open = UI.stageOpen !== false;
  hero.appendChild(edStageHead({ open: open, view: view, can3d: can3d, showView: !isPlayer || !!psrc, entView: entView, redraw: weHero,
    segTitle: isBlock ? '方块预览：2D 图标 / 3D 模型（会记住你的选择）' : '2D 显示图标 / 3D 显示生物（会记住你的选择）' }));
  if (open) hero.appendChild(h('div', { class: 'ed-stage' + (entView ? ' ent' : '') }, [h('div', { class: 'plate' }), vis]));
  hero.appendChild(h('div', { class: 'ed-name' + (weName().length > 6 ? ' sm' : ''), text: weName() }));
  hero.appendChild(h('div', { class: 'ed-tags' }, [h('span', { class: 'k-tag', text: isBlock ? '方块' : isPlayer ? '玩家' : '实体' }), h('span', { class: 'k-tag dim', text: shortId(w.type) })]));
  var stats = h('div', { class: 'ed-stats' });
  function stat(l, v) { stats.appendChild(h('div', { class: 'k-stat' }, [h('span', { class: 'sl', text: l }), h('b', { text: String(v) })])); }
  if (isBlock) weStateSchema().forEach(function (p) { stat(wePropName(p.name), wePropVal(weStateCur(p))); });
  else if (isPlayer) { var pv = evVal('player'); if (typeof pv.Health === 'number') stat('生命', fmtNum(pv.Health)); if (pv.food && typeof pv.food.foodLevel === 'number') stat('饥饿', pv.food.foodLevel); if (pv.experience) stat('等级', pv.experience.XpLevel); if (pv.playerGameType) stat('模式', WP_MODE[pv.playerGameType] || pv.playerGameType); }
  else if (w.nbt && typeof w.nbt.Health === 'number') stat('生命', fmtNum(w.nbt.Health));
  var sOpen = UI.statsOpen !== false;
  if (stats.children.length) {
    hero.appendChild(edStatsHead(isBlock ? '方块状态' : '属性', sOpen));
    if (sOpen) hero.appendChild(stats);
  }
  hero.scrollTop = scrollTop;
}
/* 编辑实体后 3D 预览跟着变（体型、幼年、装备） */
function weHeroLive() { var hero = $('hero'), el = hero && hero.querySelector('.k-ent'); if (el && WE.w && !WE.w.player) { try { heroEntity(WE.w.type, weObj(), el); } catch (e) {} } }
