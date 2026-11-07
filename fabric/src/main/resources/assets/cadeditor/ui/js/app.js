/* 启动、刷新调度、快捷键。 */

function onStoreEvent(ev) {
  if (typeof UI !== 'undefined' && UI.loading) return;
  if (ev.type !== 'docs' && typeof Drafts !== 'undefined') Drafts.touch();
  if (ev.type !== 'docs' && typeof Valid !== 'undefined') Valid.touch();
  if (ev.type === 'docs') { rebuild(); return; }
  if (ev.structural || ev.type === 'restore') {
    var body = $('edbody'); if (body && UI.tab) UI.bodyScroll[UI.tab] = body.scrollTop;
    drawHero(); drawTabbar(); drawTabBody(); drawTopbar(); drawFooter();
    if ($('advwin')) drawAdvContent();
    if ($('detailwin')) drawDetail();
  } else {
    drawHero(); drawTabbar(); drawTopbar(); drawFooter();
    if (UI.page) { UI.page.cards.forEach(function (c) { c.update(); }); paintProblems(); }
  }
}

document.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'k') { e.preventDefault(); if ($('modal')) closeModal(); else openPalette(); return; }
  if (e.key === 'Escape') { if (KPop.el) { kPopClose(); return; } if (Pop.el) { popClose(); return; } if ($('modal')) { closeModal(); return; } }
  if ($('modal')) return;
  var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '', typing = tag === 'input' || tag === 'textarea';
  if (ctrl && k === 'i') { e.preventDefault(); openImport(); return; }
  if (ctrl && k === 'z' && !e.shiftKey) { if (typing) return; e.preventDefault(); Store.undo(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { if (typing) return; e.preventDefault(); Store.redo(); return; }
  if (ctrl && k === 's') { e.preventDefault(); openApply(); return; }
  if (ctrl && k >= '1' && k <= '9') {
    var tabs = tabsOfKind(kindOfItem(Store.doc().id)), t = tabs[Number(k) - 1];
    if (t) { e.preventDefault(); UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.tab = t.id; drawTabbar(); drawTabBody(); }
  }
});

/* 对外接口：游戏（宿主）在玩家按下快捷键时调用 OrielEditor.open(物品栈) */
var OrielEditor = null;
var EditorBridge = { pending: null, timer: null, sequence: 0 };
function receiveEditorResult(result) {
  if (result && result.status === 'saved' && typeof nbtSeenClear === 'function') nbtSeenClear();
  var p = EditorBridge.pending;
  if (!p || !result || result.requestId !== p.id) return;
  clearTimeout(EditorBridge.timer); EditorBridge.pending = null;
  if (result.status !== 'saved') {
    /* 按回执类型给出下一步；无论哪种，草稿都还在界面里 */
    var next = { session_lost: '没有覆盖任何东西，草稿还在。请更新客户端和服务端到同一版本后重试。', item_changed: '物品在你编辑期间被改动或移走了，没有覆盖。草稿还在：可以复制配置，重新读取物品后再套用。', slot_invalid: '槽位已不可用（容器关了或槽位变了）。草稿还在。', not_allowed: '当前没有写入权限。草稿还在。', payload_too_large: '回执过大，可能已经保存。请重新读取物品核对，不要盲目重发。', request_timeout: '等待游戏回执超时，结果未知。请先核对物品再决定是否重发。' }[result.code];
    toast(result.reason ? result.reason + (next ? String.fromCharCode(10) + next : '') : '修改没有成功，草稿已保留', 'error'); return;
  }
  var st = result.item;
  if (!st || !st.id || !st.comps || !st.removed) { toast('写回回执缺少物品快照，请关闭后重新读取', 'error'); return; }
  var d = p.doc, unchanged = snapOf(d) === p.snap;
  if (unchanged) { d.id = st.id; d.count = st.count; d.comps = clone(st.comps); d.removed = clone(st.removed); }
  d.base = JSON.stringify({ id: st.id, count: st.count, comps: st.comps, removed: st.removed });
  d.snbt = clone(st.component_snbt || {});   // 新基线的类型参照
  if (typeof Drafts !== 'undefined') Drafts.touch();   // 应用成功后基线变了：没有新改动就清掉草稿，有就按新基线重存
  if (Store.doc() === d) rebuild();
  toast(unchanged ? '服务器已确认物品修改' : '服务器已确认上次提交；后续修改仍保留在草稿中', 'ok');
}
/* 独立保险库：不是编辑某件物品，只开保险库窗口；收起编辑器外壳，关掉窗口就回到原界面 */
function enterVaultMode() {
  if (VaultOnly) return;
  VaultOnly = true; document.body.classList.add('vault-only');
  try { Store.docs.length = 0; } catch (e) {}
  openVault({});
}
function boot() {
  Store.subscribe(onStoreEvent);
  Prefs.init(typeof oriel !== 'undefined' ? oriel.data : null);
  Reg.attach();
  Valid.on(function () { if (Store.docs.length) { drawFooter(); if (typeof paintProblems === 'function') paintProblems(); } });
  /* 注册表数据到齐后，如果界面上没有打开的窗口，就重画当前页，让名称/列表换成实时数据 */
  var regT = null;
  Reg.on(function (kind, kinds) { clearTimeout(regT); regT = setTimeout(function () { if (!Store.docs.length || $('modal')) return; try { if ((kinds || []).indexOf('item_defaults_one') >= 0 || (kinds || []).indexOf('item_meta_one') >= 0 || (kinds || []).indexOf('item_meta') >= 0 || (kinds || []).indexOf('entity_base_attributes') >= 0 || (kinds || []).indexOf('equipment_slot_groups') >= 0 || (kinds || []).indexOf('entity_info') >= 0 || (kinds || []).indexOf('entity_schema') >= 0) { drawHero(); drawTabbar(); drawTabBody(); drawFooter(); } else drawTabBody(); } catch (e) {} }, 400); });
  OrielEditor = { open: function (st) { loadStack(st); rebuild(); if (typeof Drafts !== 'undefined') Drafts.offer(Store.doc()); } };
  if (typeof Drafts !== 'undefined') Drafts.attach();
  if (typeof oriel !== 'undefined' && oriel.on) oriel.on('data', function (data, key) {
    if (!VaultOnly && ((key === 'mode' && data === 'vault') || (key === undefined && data && data.mode === 'vault'))) { enterVaultMode(); return; }
    if (key === 'world' || (key === undefined && data.world)) weSaved(data.world || data);
    else if (key === 'result' || (key === undefined && data.result)) { if (weActive()) weResult(data.result); else receiveEditorResult(data.result); }
    else if (!Store.docs.length && data.stack) { Prefs.init(data); OrielEditor.open(data.stack); }
  });
  /* 独立保险库（主菜单 / 暂停菜单的按钮或 V 键）：不是编辑某件物品，只开保险库窗口，关掉窗口就回到原界面 */
  if (typeof oriel !== 'undefined' && oriel.data && oriel.data.mode === 'vault') { enterVaultMode(); return; }
  /* 页面数据可能比脚本晚到（快捷键打开时）：到了才进保险库模式，不然会停在空的编辑器上 */
  setTimeout(function () { if (!VaultOnly && typeof oriel !== 'undefined' && oriel.data && oriel.data.mode === 'vault') enterVaultMode(); }, 250);
  /* 世界编辑模式：宿主给的是 world（已放置的方块实体 / 实体），不是物品栈 */
  if (typeof oriel !== 'undefined' && oriel.data && oriel.data.world) { weOpen(oriel.data.world); return; }
  var init = typeof oriel !== 'undefined' && oriel.data && oriel.data.stack ? oriel.data.stack :
    (typeof ORIEL_STACK !== 'undefined' ? ORIEL_STACK : (typeof DEMO !== 'undefined' && DEMO.items.length ? DEMO.items[0].stack : null));
  if (init) OrielEditor.open(init); else rebuild();
}
boot();
