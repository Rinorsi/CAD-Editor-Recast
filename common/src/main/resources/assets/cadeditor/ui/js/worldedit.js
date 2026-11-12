/* 世界编辑：已放置的方块实体（箱子、刷怪笼、告示牌……）和世界里的实体。协议见 docs/world-edit-contract.md。
   页面数据：oriel.data.world（opened/saved 的 world 对象，没有 stack）。保存：apply {requestId, slot, snbt?, container?}；撤销：undo {requestId, slot}。
   这里不猜任何数据：容器格数、方块状态、类型都来自宿主给的 world；SNBT 带类型（byte/short/long/float/double）原样往返。 */

/* ---------- SNBT 打印（保留类型）：把 nbtParse 的节点打印成紧凑 / 缩进文本 ---------- */

var WE = { w: null, text: '', slots: {}, pending: null, tab: '', seq: 0, obj: null, timer: null, err: '' };
function weActive() { return !!WE.w && !(typeof NestedItem !== 'undefined' && NestedItem); }
var WorldTextCache = {baseSource:null, base:null, source:null, normalized:null, error:false};
function weBase() {
  if (WorldTextCache.baseSource !== WE.w.snbt) {
    WorldTextCache.baseSource = WE.w.snbt;
    try { WorldTextCache.base = nbtPrint(nbtParse(WE.w.snbt), false); } catch (e) { WorldTextCache.base = WE.w.snbt; }
  }
  return WorldTextCache.base;
}
function weDirtyText() {
  if (!WE.w) return false;
  if (WorldTextCache.source !== WE.text) {
    WorldTextCache.source = WE.text; WorldTextCache.error = false;
    try { WorldTextCache.normalized = nbtPrint(nbtParse(WE.text), false); } catch (e) { WorldTextCache.error = true; }
  }
  return WorldTextCache.error || WorldTextCache.normalized !== weBase();
}
function weDirty() { return (typeof pxDirtyCount === 'function' && pxDirtyCount() > 0) || weDirtyText() || Object.keys(WE.slots).length > 0 || (typeof weViewsDirty === 'function' && weViewsDirty()) || (typeof evDirty === 'function' && evDirty()); }
function weName() {
  var w = WE.w;
  if (w.player) return (w.player.name || I18n.t("cadeditor.ui.vaultworld.991e63fe29")) + (w.player.self ? I18n.t("cadeditor.ui.worldedit.4bb17ff691") : '');
  if (w.kind === 'block') { var bid = shortId(w.block || w.type); return Reg.nameOf2('block', w.block || w.type) || nameOfItem(bid) || humanId(bid); }
  return entityName(w.type);
}

function weOpen(world, saved) {
  flushPendingCode();
  if (!saved && WE.w && typeof WorldDrafts !== 'undefined') WorldDrafts.flush();
  var vaultApply = world.vault_apply; if (vaultApply) delete world.vault_apply;
  WE.w = world; WE.text = nbtPrint(nbtParse(world.snbt), true); WE.slots = {}; WE.err = ''; WE.obj = null; WE.draftConflict = null; WE.draftUnknown = false; if (typeof weResetEdits === 'function') weResetEdits(); if (typeof weEntReset === 'function') weEntReset(); if (typeof wpReset === 'function') wpReset(); if (typeof pxReset === 'function') pxReset();
  var tabs = weTabs(); if (!tabs.some(function (t) { return t.id === WE.tab; })) WE.tab = tabs[0].id;
  weRender();
  if (vaultApply && world.player && world.player.self && !world.player.preset) vwSections(vaultApply);
  if (typeof WorldDrafts !== 'undefined') WorldDrafts.opened(!!saved);
}
function weTabs() {
  var w = WE.w, t = [], noBE = w.kind === 'block' && w.has_block_entity === false;
  if (w.kind === 'block' && weViewGroups().length) { var vi = weViewTabInfo(); t.push({ id: 'view', label: vi.label, icon: vi.icon }); }
  if (!noBE && w.container && w.container.slots) t.push({ id: 'container', label: I18n.t("cadeditor.ui.pages.6d23f04b26"), icon: 'chest' });
  if (!noBE && w.kind === 'block' && (w.type === 'minecraft:mob_spawner' || w.type === 'minecraft:trial_spawner')) t.push({ id: 'spawner', label: I18n.t("cadeditor.ui.pages.c9a4b1a5a5"), icon: 'paw' });
  if (w.kind === 'block' && (weStateSchema().length || weTypeSchema().length > 1)) t.push({ id: 'state', label: I18n.t("cadeditor.ui.rules.a528d413f7"), icon: 'sliders' });
  if (noBE) return t;
  if (w.kind === 'entity' && w.player) {
    var pl = w.player, pt = [{ id: 'pinv', label: I18n.t("cadeditor.ui.labels.015845346a"), icon: 'backpack' }, { id: 'pender', label: I18n.t("cadeditor.ui.labels.d7fe02211b"), icon: 'chest' }, { id: 'pstat', label: I18n.t("cadeditor.ui.worldedit.6320b4a872"), icon: 'heart' }, { id: 'pabil', label: I18n.t("cadeditor.ui.worldedit.5c5374dd95"), icon: 'wind' }, { id: 'pattr', label: I18n.t("cadeditor.ui.worldedit.ba2a555e94"), icon: 'sliders' }];
    if (pl.preset) return pt.filter(function (x) { return x.id === 'pinv' || x.id === 'pender' || x.id === 'pattr'; });   // 保险库预设：只有预设里有的东西
    if (pl.offline) return pt;   // 离线玩家：位置 / 配方 / 成就 / 统计要在线才有意义
    pt.push({ id: 'ppos', label: I18n.t("cadeditor.ui.worldedit.65f03b7a23"), icon: 'compass' }, { id: 'prec', label: I18n.t("cadeditor.ui.worldedit.f25ff1efa2"), icon: 'book' });
    if (pl.self) pt.push({ id: 'padv', label: I18n.t("cadeditor.ui.worldedit.52b0e1703d"), icon: 'trophy' });   // 成就只能改自己的，别人的页面没有这一页
    pt.push({ id: 'pstats', label: I18n.t("cadeditor.ui.worldedit.89abe8c6ac"), icon: 'scroll' });
    if (pl.self) pt.push({ id: 'poff', label: I18n.t("cadeditor.ui.worldedit.7d9c25abe0"), icon: 'users' });   // 名单放在自己的页面里
    return pt;
  }
  if (w.kind === 'entity') {
    if (evGroup('pose')) t.push({ id: 'pose', label: I18n.t("cadeditor.ui.worldedit.94049dba4d"), icon: 'user' });
    if (evGroup('item_frame')) t.push({ id: 'frame', label: I18n.t("cadeditor.ui.worldedit.69dee9b158"), icon: 'image' });
    if (evGroup('painting')) t.push({ id: 'painting', label: I18n.t("cadeditor.ui.worldedit.de9f18b00a"), icon: 'image' });
    if (evGroup('display')) t.push({ id: 'display', label: I18n.t("cadeditor.ui.worldedit.c742537502"), icon: 'cube' });
    if (evGroup('trades')) t.push({ id: 'trades', label: I18n.t("cadeditor.ui.worldedit.919ddbbd91"), icon: 'coins' });
    if (evSimpleGroups().length) { var si = evSimpleTabInfo(); t.push({ id: 'ents', label: si.label, icon: si.icon }); }
    if (evHasRelations()) t.push({ id: 'relations', label: I18n.t("cadeditor.ui.worldedit.253aaff19a"), icon: 'users' });
    t.push({ id: 'entity', label: I18n.t("cadeditor.ui.eschema.86de52d178"), icon: 'paw' });
    if (evGroup('riding')) t.push({ id: 'riding', label: I18n.t("cadeditor.ui.worldedit.54df03d398"), icon: 'users' });
    if (evGroup('generic')) t.push({ id: 'gents', label: I18n.t("cadeditor.ui.worldedit.863edfe5ac"), icon: 'sliders' });
  }
  if (w.kind === 'block' && weViews().generic && weViews().generic.value) t.push({ id: 'gview', label: I18n.t("cadeditor.ui.worldedit.863edfe5ac"), icon: 'sliders' });
  t.push({ id: 'data', label: I18n.t("cadeditor.ui.labels.5440f7424f"), icon: 'code' });
  return t;
}
function weRender() {
  flushPendingCode();
  var w = WE.w; if (!w) return;
  drawWorldTop(); drawWorldScreen(); drawWorldFoot();
}
function drawWorldTop() {
  var bar = clear($('topbar')), w = WE.w;
  if (w.player && !w.player.self) {   // 正在看别的玩家：左上角一键回到自己的数据
    var back = kBtn(I18n.t("cadeditor.ui.worldedit.70faf0ec73"), function () { if (typeof oriel !== 'undefined' && oriel.send) oriel.send('open_world', { self: true }); }, { icon: 'back', title: I18n.t("cadeditor.ui.worldedit.26e3c1a3ce") });
    back.style.marginRight = '6px'; bar.appendChild(back);
  }
  edTopHead(bar, { icon: w.kind === 'block' ? itemIcon(shortId(w.block || w.type), 22) : w.player ? itemIcon('player_head', 22) : entityIcon(w.type, 22), title: weName(), crumb: w.kind === 'block' ? I18n.t("cadeditor.ui.picker.2753766d18") : w.player ? (w.player.preset ? I18n.t("cadeditor.ui.vault.d4f6dca6d8") : w.player.offline ? I18n.t("cadeditor.ui.worldedit.e0b611fd8c") : I18n.t("cadeditor.ui.vaultworld.991e63fe29")) : I18n.t("cadeditor.ui.picker.eb4308300e") });
  var un = h('div', { class: 'k-ibtn' + (w.canUndo ? '' : ' dis'), title: I18n.t("cadeditor.ui.worldedit.cba28b7504") }, [uiIcon('undo', 14)]);
  activate(un, function () { if (WE.w.canUndo) weUndo(); });
  bar.appendChild(un);
  var vb = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.worldedit.0d82f86d77") }, [uiIcon('chest', 14)]); activate(vb, function () { openVault(); });
  var th = h('div', { class: 'k-ibtn', title: I18n.t("cadeditor.ui.common.settings") }, [uiIcon('sliders', 14)]); activate(th, openSettings);
  bar.appendChild(vb); bar.appendChild(th);
  var n = weDirty(), cnt = weChangeCount();
  var restricted = (typeof wpCommandProblems === 'function' && wpCommandProblems().length > 0) || (typeof weViewProblems === 'function' && weViewProblems().length > 0);
  var copyInventory = w.player && !w.player.self && !w.player.preset && WE.tab === 'pinv';
  if (copyInventory) bar.appendChild(edApplyBtn({ label: I18n.t("cadeditor.ui.worldedit.cc137a3e9e"), icon: 'download', dirty: !VW_COPY_PENDING && !WE.pending, tip: I18n.t("cadeditor.ui.worldedit.c6ea55bb29"), tipOff: I18n.t("cadeditor.ui.worldedit.0c378458a8"), onClick: vwPlayerBackpackToSelf }));
  if (!copyInventory || n) bar.appendChild(edApplyBtn({ dirty: n && !restricted, count: cnt, tip: I18n.t("cadeditor.ui.worldedit.a02c9f49a9"), tipOff: restricted ? I18n.t("cadeditor.ui.worldedit.b9ca24639d") : I18n.t("cadeditor.ui.screens.a10fdff631"), onClick: weApply }));
  bar.appendChild(edMaxBtn());
  bar.appendChild(edCloseBtn(I18n.t("cadeditor.ui.common.close"), closeEditor));
}
/* 改了任何草稿之后：顶栏的「应用修改」计数和撤销、底栏的「有未应用的修改」一起刷新 */
function weMarkDirty() { drawWorldTop(); drawWorldFoot(); if (typeof WorldDrafts !== 'undefined') WorldDrafts.touch(); }
function drawWorldFoot() {
  var f = clear($('footer')), w = WE.w, s = w.slot || {};
  var errors = []; if (WE.err) errors.push(WE.err);
  if (typeof weViewProblems === 'function') errors = errors.concat(weViewProblems());
  if (typeof wpCommandNote === 'function' && wpCommandNote()) errors.push(wpCommandNote());
  f.classList.toggle('has-problem', errors.length > 0);
  f.appendChild(edFootChg(weDirty(), I18n.t("cadeditor.ui.worldedit.339d020f01"), I18n.t("cadeditor.ui.worldedit.ef90ed3b1a")));
  if (typeof pxDirtyCount === 'function' && pxDirtyCount() > 0) { var dis = h('span', { class: 'it link', text: I18n.t("cadeditor.ui.worldedit.968651c310"), title: I18n.t("cadeditor.ui.worldedit.63ac19dae3") }); activate(dis, function () { pxDiscard(); }); f.appendChild(dis); }
  if (WE.draftConflict) f.appendChild(kBtn(I18n.t("cadeditor.ui.worldedit.4d587a2092"), function () { WorldDrafts.compare(); }, { icon: 'clock' }));
  f.appendChild(h('div', { class: 'grow' }));
  f.appendChild(h('span', { class: 'it', title: I18n.t("cadeditor.ui.worldedit.da05e409f6"), text: weWhere() }));
  errors.forEach(function (message) {
    var line = h('span', { class: 'it bad pcl foot-problem', title: I18n.t("cadeditor.ui.worldedit.c098411cf8") }, [uiIcon('close', 12), h('span', { class: 'message', text: message })]);
    activate(line, function () { openProblems(line, [{level:'error',cid:null,path:'',msg:message}]); }); f.appendChild(line);
  });
}
function drawWorldScreen() {
  var host = clear($('screen')), w = WE.w;
  applyWinStyle();
  var hero = h('aside', { class: 'ed-hero', id: 'hero' });
  var right = h('section', { class: 'ed-right' }), tabbar = h('div', { class: 'ed-tabs', id: 'tabbar' }), body = h('div', { class: 'ed-body', id: 'edbody' });
  weTabs().forEach(function (t) {
    var el = h('div', { class: 'ed-tab' + (WE.tab === t.id ? ' on' : ''), title: t.label }, [uiIcon(t.icon, 14), h('span', { text: t.label })]);
    activate(el, function () { WE.tab = t.id; weRender(); });
    tabbar.appendChild(el);
  });
  tabbar.classList.toggle('dense', weTabs().length >= 4);   // 和物品页一样：4 页以上只留当前页的名字，其余只显示图标
  var tools = h('div', { class: 'ed-tools', id: 'edtools' });
  right.appendChild(edTabsScroll(tabbar)); right.appendChild(tools); right.appendChild(body);
  host.appendChild(hero); host.appendChild(makeSplit()); host.appendChild(right); ensureResize();
  setTimeout(function () { edTabsFit(tabbar); }, 0);
  weHero();
  weTabBody(body);
}
function weTabBody(body) {
  ES_WAIT = false; WE.toolsExtra = null;   // 本页要放进工具行的控件，由标签页的画法填
  if (typeof wpCommandCaps === 'function' && wpCommandCaps()) {
    body.appendChild(kHint(wpCommandNote()));
    if (['pender', 'prec', 'padv', 'pstats', 'poff'].indexOf(WE.tab) >= 0) {
      body.appendChild(xEmpty(WE.tab === 'pattr' ? I18n.t("cadeditor.ui.worldedit.b63944f63f") : I18n.t("cadeditor.ui.worldedit.e3f039d9cd"))); weTools(); return;
    }
  }
  if (typeof weDndReset === 'function') weDndReset();
  if (WE.tab === 'pinv') wpInventoryTab(body);
  else if (WE.tab === 'pender') wpEnderTab(body);
  else if (WE.tab === 'pstat') wpStatusTab(body);
  else if (WE.tab === 'pabil') wpAbilitiesTab(body);
  else if (WE.tab === 'pattr') wpAttrTab(body);
  else if (WE.tab === 'gents') EV_SIMPLE_TAB.generic(body);
  else if (WE.tab === 'gview') WEV.generic(body, 'generic');
  else if (WE.tab === 'ppos') { if (typeof wpCommandCaps === 'function' && wpCommandCaps()) wpCommandPosition(body); else pxPosition(body); }
  else if (WE.tab === 'prec') pxRecipes(body);
  else if (WE.tab === 'padv') pxAdvancements(body);
  else if (WE.tab === 'pstats') pxStats(body);
  else if (WE.tab === 'poff') pxArchive(body);
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
  t.style.display = cards.length > 1 || WE.toolsExtra ? '' : 'none';
  t.appendChild(h('span', { class: 'ed-tools-t', text: tab ? tab.label : '' })); t.appendChild(h('div', { class: 'grow' }));
  if (WE.toolsExtra) WE.toolsExtra.forEach(function (n) { t.appendChild(n); });
  crumbLast = ''; crumbBind($('edbody'), null); setTimeout(updateCrumb, 0);
  var all = h('div', { class: 'k-mini', title: I18n.t("cadeditor.ui.screens.f2843ff52e") }, [uiIcon('layers', 14)]);
  activate(all, function () { var collapse = cards.some(function (c) { return !c.classList.contains('collapsed'); }); cards.forEach(function (c) { if (c._card) c._card.setCollapsed(collapse); }); });
  t.appendChild(all);
}
/* 只重画右边的标签页内容（拖动 / 放下物品后用），保留滚动位置，不动左栏和顶栏 */
function weRedrawBody() { flushPendingCode(); var body = $('edbody'); if (!body) return; var top = body.scrollTop; clear(body); weTabBody(body); body.scrollTop = top; weMarkDirty(); }

/* ---------- 容器：格子 + 点开改物品 / 数量 / 清空；只发改过的格子，没改的格子宿主保留原样 ---------- */
function weSlotStack(i) {
  if (WE.slots[i]) return WE.slots[i];
  var s = WE.w.container.slots.filter(function (x) { return x.slot === i; })[0];
  return s ? s.stack : { empty: true };
}
function weContainerTab(body) {
  var c = WE.w.container, n = c.size, cols = n <= 5 ? n : n <= 9 ? 3 : 9;
  if (c.unresolved_loot) { body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldedit.e58dad2837"))); return; }
  body.appendChild(xSec('chest', I18n.t("cadeditor.ui.cards3.c6447c0254"), I18n.t("cadeditor.ui.worldedit.65e3c852c7", (n), (c.double ? I18n.t("cadeditor.ui.worldedit.a9cd05fb9d") : ''))));

  var ix = []; for (var i = 0; i < n; i++) ix.push(i);
  body.appendChild(kSlotGrid({ tight: true, indices: ix, cols: cols, stackOf: weSlotStack, titleOf: function (i) { return I18n.t("cadeditor.ui.slots.1748b1d05d", (i + 1)); },
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
  body.appendChild(esEntityHeader({ id: WE.w.type, sub: I18n.t("cadeditor.ui.worldedit.d7784e8e0e", (shortId(WE.w.type))),
    snbtText: function () { var t = WE.text; try { t = nbtPrint(nbtParse(WE.text), false); } catch (e) {} return t; },
    onApplyVault: function (snbt) {
      var o = vaultEntityObj(snbt), cur = weObj();
      if (o.id && Reg.full(o.id) !== Reg.full(WE.w.type)) { toast(I18n.t("cadeditor.ui.worldedit.773cc98e7b", (entityName(o.id)), (weName())), 'warn'); return; }
      Object.keys(o).forEach(function (k) { if (k !== 'id') nbtPut(cur, k, nbtTake(o, k)); });
      WE.obj = cur; wePut(); weRedrawBody();
    } }));
  body.appendChild(esPanel({ type: WE.w.type, get: function () { return WE.obj; }, set: function (o) { WE.obj = o; wePut(); } }));
  var motion = weObj().Motion;
  if (Array.isArray(motion) && motion.length === 3) {
    body.appendChild(xSec('wind', I18n.t("cadeditor.ui.cards2.0e14d148b4"), I18n.t("cadeditor.ui.worldedit.4aae75c2cf")));
    body.appendChild(kVector(motion, { min: -10, max: 10, step: 0.1, dec: 3, preservePrecision: true, onChange: function (i, v) {
      var obj = weObj(), next = nbtClone(obj.Motion); nbtSetTyped(next, i, v, 'd'); nbtPut(obj, 'Motion', next); wePut();
    } }).el);
  }
}

/* ---------- 数据：完整 SNBT（带类型），改完点应用 ---------- */
function weDataTab(body) {
  if (weTabs().length === 1) body.appendChild(kHint(I18n.t("cadeditor.ui.worldedit.11e9bf5354", (WE.w.kind === 'block' ? I18n.t("cadeditor.ui.picker.2753766d18") : I18n.t("cadeditor.ui.picker.eb4308300e")))));
  body.appendChild(xSec('code', I18n.t("cadeditor.ui.worldedit.46b81b9f77"), I18n.t("cadeditor.ui.worldedit.d2cb89ec10")));
  var code = kCode({ value: WE.text, height: 360, validate: function (t) { nbtParse(t); }, onText: function (t) { WE.text = t; WE.obj = null; }, onInput: function (t) {
    WE.text = t; WE.err = ''; WE.obj = null; weMarkDirty();
  } });
  body.appendChild(code.el);
  body.appendChild(kBtn(I18n.t("cadeditor.ui.worldedit.15060564b7"), function () { WE.text = nbtPrint(nbtParse(WE.w.snbt), true); WE.obj = null; weRender(); }, { icon: 'undo' }));
}

/* ---------- 应用 / 撤销 / 回执 ---------- */
function weApply() {
  flushPendingCode();
  if (typeof weViewProblems === 'function' && weViewProblems().length) { drawWorldFoot(); return; }
  if (WE.pending) { toast(I18n.t("cadeditor.ui.vaultworld.53871cb811"), 'info', 'we-wait'); return; }
  if (typeof wpCommandProblems === 'function' && wpCommandProblems().length) { toast(wpCommandNote(), 'warn', 'self-capabilities'); return; }
  if (Date.now() - (WE.lastSendAt || 0) < 650) return;   // 服务器 500ms 限流：连点不重复提交
  var pxv = typeof pxDirtyViews === 'function' ? pxDirtyViews() : [];
  if (pxv.length) {   // 玩家页的位置 / 重生点 / 配方 / 成就 / 统计各走自己的协议，先应用这些
    pxApplyAll();
    if (weChangeCount() - pxDirtyCount() > 0) toast(I18n.t("cadeditor.ui.worldedit.752b0e748c"), 'info', 'we-px');
    return;
  }
  var w = WE.w, msg = { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(w.slot) };
  if (weDirtyText()) {
    try { msg.snbt = nbtPrint(nbtParse(WE.text), false); } catch (e) { toast(I18n.t("cadeditor.ui.worldedit.639916891d", (e.message || e)), 'error'); return; }
  }
  var cs = Object.keys(WE.slots).map(function (k) { return { slot: Number(k), stack: WE.slots[k] }; });
  if (cs.length) msg.container = { slots: cs };
  if (typeof weViewsMsg === 'function') weViewsMsg(msg);
  if (typeof evMsg === 'function') evMsg(msg);
  if (typeof wpCommandMessage === 'function') wpCommandMessage(msg);
  if (!msg.snbt && !msg.container && !msg.entity && !msg.views && !msg.block_state && !msg.block_type) { toast(I18n.t("cadeditor.ui.screens.a10fdff631"), 'info'); return; }
  weSend('apply', msg, I18n.t("cadeditor.ui.worldedit.c34df32374"));
}
function weUndo() {
  if (WE.pending) return;
  weSend('undo', { requestId: 'w-' + Date.now() + '-' + (++WE.seq), slot: clone(WE.w.slot) }, I18n.t("cadeditor.ui.worldedit.d32f69ae73"));
}
function weSend(op, msg, note, draftSnapshot) {
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send(op, msg) : false;
  if (!sent) { toast(I18n.t("cadeditor.ui.worldedit.2cad51fbc8"), 'error'); return; }
  WE.lastSendAt = Date.now(); WE.pending = msg.requestId; WE.lastMsg = { op: op, msg: msg, note: note }; toast(note, 'info', 'we-pending');
  if (typeof WorldDrafts !== 'undefined') { WorldDrafts.beforeSend(msg.requestId, draftSnapshot); WE.lastMsg.draftSnapshot = WorldDrafts.flight; }
  if (typeof wpCommandBegin === 'function') wpCommandBegin(msg.requestId);
  clearTimeout(WE.timer);
  WE.timer = setTimeout(function () { if (WE.pending === msg.requestId) { if (typeof wpCommandFinishEdits === 'function') wpCommandFinishEdits(msg.requestId); WE.pending = null; WE.draftUnknown = true; if (typeof WorldDrafts !== 'undefined') WorldDrafts.flush(); toast(I18n.t("cadeditor.ui.worldedit.4dd77f5be8"), 'error'); } }, 12000);
}
var WE_CODE = { target_changed: I18n.t("cadeditor.ui.worldedit.e87d8ec90c"), session_lost: I18n.t("cadeditor.ui.worldedit.6d4e2e505b"), not_allowed: I18n.t("cadeditor.ui.worldedit.8c5972aced"), out_of_reach: I18n.t("cadeditor.ui.worldedit.9594d28c09"), chunk_unloaded: I18n.t("cadeditor.ui.worldedit.bd74fb4cbc"), protected_area: I18n.t("cadeditor.ui.worldedit.0cba158bc4"), invalid_nbt: I18n.t("cadeditor.ui.worldedit.dbdb8112df"), slot_invalid: I18n.t("cadeditor.ui.worldedit.0ebd697970"), unsupported_target: I18n.t("cadeditor.ui.worldedit.8355d95afc"), rate_limited: I18n.t("cadeditor.ui.worldedit.869e3ad230"), payload_too_large: I18n.t("cadeditor.ui.worldedit.30f2add4fd") };
function weResult(r) {
  if (!r || r.requestId !== WE.pending) return;
  if (typeof wpCommandFinishEdits === 'function') wpCommandFinishEdits(r.requestId, r.status === 'saved');
  clearTimeout(WE.timer); WE.pending = null; toastDismiss('we-pending');
  if (r.status !== 'saved') {
    if (r.code === 'request_timeout' || r.status === 'unknown') WE.draftUnknown = true;
    /* 提交太快被限流：不让用户一直点，按服务器给的等待时间自动重发一次（最多 2 次） */
    if (!(typeof wpCommandCaps === 'function' && wpCommandCaps()) && r.code === 'rate_limited' && WE.lastMsg && (WE.lastMsg.tries || 0) < 2) {
      var lm = WE.lastMsg, wait = Math.max(300, Math.min(2000, +r.retryAfterMs || 700)); lm.tries = (lm.tries || 0) + 1;
      setTimeout(function () { if (WE.pending || !weActive()) return; var m2 = clone(lm.msg); m2.requestId = 'w-' + Date.now() + '-' + (++WE.seq); lm.msg = m2; weSend(lm.op, m2, lm.note, lm.draftSnapshot); WE.lastMsg.tries = lm.tries; }, wait);
      return;
    }
    var hint = r.code === 'invalid_nbt' && r.reason ? r.reason : WE_CODE[r.code]; WE.err = r.reason || r.code || I18n.t("cadeditor.ui.worldedit.28384d7afd");
    if (typeof WorldDrafts !== 'undefined') WorldDrafts.flush();
    /* 服务器会说明是哪种“变了”：页面数据太旧 / 目标换了 / 会话失效 / 字段真的撞了（conflicts） */
    if (r.code === 'target_changed' && !(Array.isArray(r.conflicts) && r.conflicts.length)) hint = r.stale === 'identity' ? I18n.t("cadeditor.ui.worldedit.cc18715dd0") : r.stale === 'client_revision' ? I18n.t("cadeditor.ui.worldedit.521e2bccca") : r.stale === 'session' ? I18n.t("cadeditor.ui.worldedit.f2c4e0fd9a") : hint;
    var cf = Array.isArray(r.conflicts) && r.conflicts.length ? I18n.t("cadeditor.ui.worldedit.230a2d836b", (String.fromCharCode(10)), (r.conflicts.slice(0, 6).map(function (c) { return (c.path || []).join('.'); }).join('；')), (r.conflicts.length > 6 ? I18n.t("cadeditor.ui.worldedit.68e744b287", (r.conflicts.length)) : '')) : '';
    WE.err = (hint || r.reason || r.code || I18n.t("cadeditor.ui.worldedit.f1b2ed6f2b")) + cf;
    toast(WE.err, 'error', 'we-error'); drawWorldFoot(); return;
  }
  WE.lastMsg = null; toast(I18n.t("cadeditor.ui.worldedit.d483ff6531"), 'ok', 'we-ok');
  if (typeof WorldDrafts !== 'undefined') WorldDrafts.flush();
}
function weSaved(world) {
  if (!world) return;
  var wasSaving = !!(WE.pending && WE.w && WE.w.slot && world.slot && WE.w.slot.token === world.slot.token);
  var worldLater = typeof WorldDrafts !== 'undefined' ? WorldDrafts.beforeSaved(world) : null;
  var keepDraft = null, keepSlots = null, laterEdits = null;
  if (typeof wpCommandCaps === 'function' && wpCommandCaps() && world.capabilities && world.capabilities.backend === 'vanilla_self' && WE.w.slot && world.slot && WE.w.slot.token === world.slot.token && WE.pending) {
    keepDraft = clone(WE.ent); keepSlots = clone(WE.pslots);
    if (typeof wpCommandPendingEdits === 'function') laterEdits = wpCommandPendingEdits();
    if (typeof wpCommandPatch === 'function') keepDraft.player = wpCommandPatch();
    var submitted = WE.lastMsg && WE.lastMsg.msg && WE.lastMsg.msg.entity && WE.lastMsg.msg.entity.player || {};
    Object.keys((keepDraft || {}).player || {}).forEach(function (k) {
      if ((k === 'experience' || k === 'commandPosition') && submitted[k]) {
        Object.keys(keepDraft.player[k]).forEach(function (part) { if (weNorm(keepDraft.player[k][part]) === weNorm(submitted[k][part])) delete keepDraft.player[k][part]; });
        if (!Object.keys(keepDraft.player[k]).length) delete keepDraft.player[k];
      } else if (k === 'attributes' && submitted[k]) {
        keepDraft.player[k] = keepDraft.player[k].filter(function (row) { return !submitted[k].some(function (sent) { return weNorm(row) === weNorm(sent); }); });
        if (!keepDraft.player[k].length) delete keepDraft.player[k];
      } else if (Object.prototype.hasOwnProperty.call(submitted, k) && weNorm(keepDraft.player[k]) === weNorm(submitted[k])) delete keepDraft.player[k];
    });
    if (keepDraft.player && !Object.keys(keepDraft.player).length) delete keepDraft.player;
  }
  var keepTab = WE.tab;
  weOpen(world, wasSaving);
  if (keepDraft) {
    var fresh = evVal('player');
    Object.keys(keepDraft.player || {}).forEach(function (k) {
      if (k === 'experience' || k === 'commandPosition') { var merged = clone(fresh[k] || {}); Object.keys(keepDraft.player[k]).forEach(function (part) { merged[part] = keepDraft.player[k][part]; }); keepDraft.player[k] = merged; }
      else if (k === 'attributes') { var rows = clone(fresh.attributes || []); keepDraft.player[k].forEach(function (row) { var at = rows.findIndex(function (old) { return old.id === row.id; }); if (at < 0) rows.push(row); else rows[at] = row; }); keepDraft.player[k] = rows; }
      if (weNorm(keepDraft.player[k]) === weNorm(fresh[k])) delete keepDraft.player[k];
    });
    if (keepDraft.player && !Object.keys(keepDraft.player).length) delete keepDraft.player;
    WE.ent = keepDraft; WE.pslots = keepSlots;
    if (typeof wpCommandRestoreEdits === 'function') wpCommandRestoreEdits(laterEdits, true);
  }
  if (wasSaving && typeof WorldDrafts !== 'undefined') WorldDrafts.afterSaved(worldLater);
  WE.tab = weTabs().some(function (t) { return t.id === keepTab; }) ? keepTab : weTabs()[0].id; weRender();
}
/* 注册表整体就绪（registry.meta）时，如果当前页是占位的「正在读取」，重画一次让它去发请求 */
Reg.on(function () { if (weActive() && ES_WAIT && Reg.live() && !$('modal')) { try { weRedrawBody(); } catch (e) {} } });
/* 世界实体页：entity_schema 到了再画一次（物品页的重画在 app.js，世界页没有物品文档，要自己接） */
Reg.on(function (kind, kinds) { if (weActive() && (WE.tab === 'entity' || WE.tab === 'spawner') && (kinds || [kind]).indexOf('entity_schema') >= 0 && !$('modal')) { try { drawWorldScreen(); } catch (e) {} } });

/* ---------- 左栏：和物品页同一套（预览可折叠 + 2D / 3D，名字，标签，属性可折叠） ---------- */
var WE_DIM = Labels.dim;
function weWhere() {
  var w = WE.w, s = w.slot || {}, dim = s.dim ? (WE_DIM[s.dim] || s.dim) : '';
  if (w.kind === 'block') return I18n.t("cadeditor.ui.worldedit.d5abde4147", (s.x), (s.y), (s.z), (dim ? ' · ' + dim : ''));
  var p = w.nbt && Array.isArray(w.nbt.Pos) ? w.nbt.Pos.map(function (v) { return Math.round(Number(v)); }) : null;
  return (p ? I18n.t("cadeditor.ui.worldedit.8d360ec95d", (p.join(' '))) : shortId(w.type)) + (dim ? ' · ' + dim : '');
}
function weChangeCount() {
  var n = (weDirtyText() ? 1 : 0) + Object.keys(WE.slots).length + (typeof wpSlotsDirty === 'function' ? wpSlotsDirty() : 0) + (typeof pxDirtyCount === 'function' ? pxDirtyCount() : 0);
  if (typeof weViewsDirty === 'function') n += Object.keys(WE.views).length + Object.keys(WE.bstate).length + (WE.btype && WE.btype !== WE.w.block ? 1 : 0);
  if (typeof evDirty === 'function' && evDirty()) n += Object.keys(WE.ent).length + (WE.offers !== null ? 1 : 0);
  if (!Object.keys(WE.ent || {}).length && typeof wpCommandIntentDirty === 'function' && wpCommandIntentDirty()) n++;
  return n;
}
function weBlockPreviewState() {
  var props = [];
  weStateSchema().forEach(function (p) { var value = weStateCur(p); if (value !== undefined) props.push(p.name + '=' + String(value)); });
  return fullId(WE.btype || WE.w.block || WE.w.type) + (props.length ? '[' + props.join(',') + ']' : '');
}
function weDroppedStack() {
  if (!WE.w || WE.w.kind !== 'entity' || fullId(WE.w.type) !== 'minecraft:item') return null;
  if (WE.ent && WE.ent.dropped_item && Object.prototype.hasOwnProperty.call(WE.ent.dropped_item, 'Item')) return WE.ent.dropped_item.Item;
  return weObj().Item || evVal('dropped_item').Item || null;
}
function weDroppedComponents(st) {
  var d = stackUiDoc(st), item = vaultNested({ id: d.id, count: d.count, comps: d.comps, removed: d.removed, component_snbt: nbtComponentTexts(d) });
  return nbtMerge(item.components || {}, null);
}
function weDroppedPreview(st, view) {
  var el = view === '3d' ? h('model', { class: 'k-ico k-model', item: fullId(st.id), components: weDroppedComponents(st), rotatable: true }) : stackUiIcon(st, 48);
  el.classList.add('we-dropped-preview'); return el;
}
function weHero() {
  var hero = $('hero'); if (!hero || !WE.w) return;
  var w = WE.w, isBlock = w.kind === 'block', scrollTop = hero.scrollTop, oldEnt = hero.querySelector('.k-ent'); clear(hero);
  var can3d = typeof ED_MC === 'undefined', view = can3d && UI.heroView === '3d' ? '3d' : '2d';
  var bid = isBlock ? shortId(w.block || w.type) : '';
  var isPlayer = !!w.player, psrc = isPlayer ? (w.player.self ? { player: true } : (w.slot && /^[0-9]+$/.test(String(w.slot.id)) ? { id: w.slot.id } : null)) : null;
  var dropped = weDroppedStack();
  var vis, entView = !isBlock && !dropped && view === '3d' && (!isPlayer || !!psrc);
  if (isBlock) {
    var itemId = bid === 'player_wall_head' ? 'player_head' : bid;
    // Blocks such as crops have no corresponding item. Use the real state model,
    // retaining item rendering for existing special block-entity item renderers.
    if (w.has_block_entity === false) vis = h('model', { class: 'k-ico k-model we-block-preview', block: weBlockPreviewState(), rotatable: view === '3d' ? true : null });
    else vis = view === '3d' ? h('model', { class: 'k-ico k-model', item: fullId(itemId), rotatable: true }) : itemIcon(itemId, 48);
    if (bid === 'player_head' || bid === 'player_wall_head') { vis.classList.add('we-head-preview'); vis.setAttribute('components', weHeadComponents()); }
  }
  else if (isPlayer) vis = entView ? heroEntity(w.type, {}, oldEnt, psrc) : itemIcon('player_head', 48);
  else if (dropped) vis = weDroppedPreview(dropped, view);
  else vis = entView ? heroEntity(w.type, weHeroData(), oldEnt) : entityIcon(w.type, 48);
  var open = UI.stageOpen !== false;
  hero.appendChild(edStageHead({ open: open, view: view, can3d: can3d, showView: !isPlayer || !!psrc, entView: entView, redraw: weHero,
    segTitle: isBlock || dropped ? I18n.t("cadeditor.ui.worldedit.cdf4af93af") : I18n.t("cadeditor.ui.worldedit.bf2c5b3208") }));
  if (open) hero.appendChild(h('div', { class: 'ed-stage' + (entView ? ' ent' : '') }, [h('div', { class: 'plate' }), vis]));
  hero.appendChild(h('div', { class: 'ed-name' + (weName().length > 6 ? ' sm' : ''), text: weName() }));
  hero.appendChild(h('div', { class: 'ed-tags' }, [h('span', { class: 'k-tag', text: isBlock ? I18n.t("cadeditor.ui.picker.2753766d18") : isPlayer ? I18n.t("cadeditor.ui.vaultworld.991e63fe29") : I18n.t("cadeditor.ui.picker.eb4308300e") }), h('span', { class: 'k-tag dim', text: shortId(w.type) })]));
  var snd = !isBlock && !isPlayer && typeof mobSoundRow === 'function' ? mobSoundRow(w.type) : null; if (snd) hero.appendChild(snd);
  var vwa = typeof vwActions === 'function' ? vwActions() : null; if (vwa) hero.appendChild(vwa);
  var stats = h('div', { class: 'ed-stats' });
  function stat(l, v, property) { stats.appendChild(h('div', { class: 'k-stat', 'data-block-prop':property }, [h('span', { class: 'sl', text: l }), h('b', { text: String(v) })])); }
  if (isBlock) weStateSchema().forEach(function (p) { stat(wePropName(p.name), wePropVal(weStateCur(p)), p.name); });
  else if (isPlayer) { var pv = evVal('player'); if (typeof pv.Health === 'number') stat(I18n.t("cadeditor.ui.worldedit.45bc77bc1c"), fmtNum(pv.Health)); if (pv.food && typeof pv.food.foodLevel === 'number') stat(I18n.t("cadeditor.ui.worldedit.78905cde67"), pv.food.foodLevel); if (pv.experience) stat(I18n.t("cadeditor.ui.labels.3377171738"), pv.experience.XpLevel); if (pv.playerGameType) stat(I18n.t("cadeditor.ui.labels.47a270081a"), WP_MODE[pv.playerGameType] || pv.playerGameType); }
  else if (w.nbt && typeof w.nbt.Health === 'number') stat(I18n.t("cadeditor.ui.worldedit.45bc77bc1c"), fmtNum(w.nbt.Health));
  var sOpen = UI.statsOpen !== false;
  if (stats.children.length) {
    hero.appendChild(edStatsHead(isBlock ? I18n.t("cadeditor.ui.rules.a528d413f7") : I18n.t("cadeditor.ui.eschema.86de52d178"), sOpen));
    if (sOpen) hero.appendChild(stats);
  }
  hero.scrollTop = scrollTop;
}
/* 编辑实体后 3D 预览跟着变（体型、幼年、装备） */
function weHeadComponents(profile) {
  if (!arguments.length) profile = weVal('skull', 'minecraft:profile');
  var comps = {}; if (profile !== undefined && profile !== null) nbtPut(comps, 'minecraft:profile', profile);
  return nbtMerge(comps, null);
}
/* 左侧 3D 预览用的数据：盔甲架把正在编辑的姿势与外观开关一并带上 */
function weHeroData() {
  var o = weObj();
  if (!WE.w || WE.w.type !== 'minecraft:armor_stand' || typeof evStandAttr !== 'function') return o;
  var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; });
  c.__cad_stand = evStandAttr();
  return c;
}
function weHeroLive(profile) {
  var hero = $('hero'); if (!hero || !WE.w) return;
  var dropped = hero.querySelector('.we-dropped-preview');
  if (dropped) {
    var st = weDroppedStack(); if (!st) return;
    if (dropped.tagName.toLowerCase() === 'model') { dropped.setAttribute('item', fullId(st.id)); dropped.setAttribute('components', weDroppedComponents(st)); }
    else dropped.parentNode.replaceChild(weDroppedPreview(st, '2d'), dropped);
    return;
  }
  var block = hero.querySelector('.we-block-preview');
  if (block) {
    block.setAttribute('block', weBlockPreviewState());
    Array.prototype.forEach.call(hero.querySelectorAll('[data-block-prop]'), function (row) { var key = row.getAttribute('data-block-prop'); weStateSchema().some(function (p) { if (p.name !== key) return false; row.querySelector('b').textContent = String(wePropVal(weStateCur(p))); return true; }); });
    return;
  }
  var head = hero.querySelector('.we-head-preview');
  if (head) { head.setAttribute('components', arguments.length ? weHeadComponents(profile) : weHeadComponents()); return; }
  var el = hero.querySelector('.k-ent');
  if (el && !WE.w.player) { try { heroEntity(WE.w.type, weHeroData(), el); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('preview.entity.update', e); } }
}
