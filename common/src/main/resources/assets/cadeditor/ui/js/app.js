/* 启动、刷新调度、快捷键。 */

function onStoreEvent(ev) {
  if (typeof UI !== 'undefined' && UI.loading) return;
  if ((ev.type === 'edit' || ev.type === 'restore') && typeof ItemHistory !== 'undefined') { var hd = Store.doc(); if (hd && hd.hist[hd.hi]) ItemHistory.note(hd, historySnapshot(hd, hd.hi)); }
  if (ev.type !== 'docs' && !NestedItem && typeof Drafts !== 'undefined') Drafts.touch();
  if (ev.type !== 'docs' && typeof Valid !== 'undefined') Valid.touch(ev.type === 'edit' && !ev.structural ? ev.cids : null);
  if (UI.rawEditing) {
    drawTopbar(); drawFooter();
    var owner = Store.doc(); clearTimeout(UI.rawPaintTimer);
    UI.rawPaintTimer = setTimeout(function () { if (Store.doc() === owner) drawHero(); }, 250);
    return;
  }
  if (ev.type === 'docs') { rebuild(); return; }
  if (ev.structural || ev.type === 'restore') {
    var body = $('edbody'); if (body && UI.tab) UI.bodyScroll[UI.tab] = body.scrollTop;
    drawHero(); drawTabbar(); drawTabBody(); drawTopbar(); drawFooter();
    if ($('advwin')) drawAdvContent();
    if ($('detailwin')) drawDetail();
  } else {
    refreshItemHero(ev.cids); refreshItemTabs(); drawTopbar(); drawFooter();
    if (UI.page) { UI.page.cards.forEach(function (c) {
      if (!ev.cids || c.depends && c.depends['*'] || ev.cids.some(function (cid) { return c.comps.indexOf(cid) >= 0 || c.depends && c.depends[cid] || cid === '#count' && c.comps.indexOf('max_stack_size') >= 0; })) c.update();
    }); paintProblems(); }
  }
}

document.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    // An input may already have closed its own popup. Never pop a second layer.
    if (e.defaultPrevented) return;
    if (e.repeat) { e.preventDefault(); return; }
    if (KPop.el) { e.preventDefault(); kPopClose(); return; }
    if ($('modal')) { e.preventDefault(); closeModal(); return; }
    if (NestedItem) { e.preventDefault(); setTimeout(returnFromNestedItem, 0); return; }
    if (typeof wpIs === 'function' && wpIs() && weDirty()) { e.preventDefault(); setTimeout(closeEditor, 0); }
    return; // Only the root page lets Minecraft close the Editor screen.
  }
  if (ctrl && k === 'k') { e.preventDefault(); if ($('modal')) closeModal(); else openPalette(); return; }
  if ($('modal')) return;
  var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '', typing = tag === 'input' || tag === 'textarea';
  if (ctrl && k === 'i') { e.preventDefault(); openImport(); return; }
  if (ctrl && k === 'z' && !e.shiftKey) { if (typing) return; e.preventDefault(); Store.undo(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { if (typing) return; e.preventDefault(); Store.redo(); return; }
  if (ctrl && k === 's') { e.preventDefault(); openApply(); return; }
  if (ctrl && k >= '1' && k <= '9') {
    var tabs = tabsOfKind(kindOfItem(Store.doc().id)), t = tabs[Number(k) - 1];
    if (t) { e.preventDefault(); UI.autoDefaultTab = null; UI.bodyScroll[UI.tab] = $('edbody').scrollTop; UI.tab = t.id; drawTabbar(); drawTabBody(); }
  }
});

/* 对外接口：游戏（宿主）在玩家按下快捷键时调用 OrielEditor.open(物品栈) */
var OrielEditor = null;
var EditorBridge = { pending: null, timer: null, sequence: 0 };
var EditorNoticeSequence = 0;
// Page transport capability is not item data and must survive draft restore/rebuild.
var EditorInventoryCapability = '';
var EditorInventorySessionStale = false;
function receiveInventorySession(state) {
  if (!state || !state.stale) return;
  EditorInventorySessionStale = true;
  EditorInventoryCapability = state.reason || '页面已重载，请关闭后重新读取物品；草稿已保留';
  if (Store.docs.length) drawFooter();
  toast(EditorInventoryCapability, 'warn', 'inventory-session');
}
function receiveEditorResult(result) {
  var p = EditorBridge.pending;
  if (!p || !result || result.requestId !== p.id) return;
  clearTimeout(EditorBridge.timer); EditorBridge.pending = null;
  if (result.status === 'sent' && result.confirmed === false) {
    // Vanilla creative slots have no positive acknowledgement. Keep the draft/base intact.
    if (typeof Drafts !== 'undefined') Drafts.submitted(p.doc, p, result.fingerprint);
    toast(result.reason || '已提交创造模式修改，尚无服务器保存确认；草稿已保留，请核对背包', 'warn');
    return;
  }
  if (result.status !== 'saved') {
    if (typeof Drafts !== 'undefined') Drafts.unresolved(p.doc, result.status === 'unknown' || result.code === 'request_timeout' || result.code === 'payload_too_large');
    /* 按回执类型给出下一步；无论哪种，草稿都还在界面里 */
    var next = { session_lost: '没有覆盖任何东西，草稿还在。请更新客户端和服务端到同一版本后重试。', item_changed: '物品在你编辑期间被改动或移走了，没有覆盖。草稿还在：可以复制配置，重新读取物品后再套用。', slot_invalid: '槽位已不可用（容器关了或槽位变了）。草稿还在。', not_allowed: '当前没有写入权限。草稿还在。', payload_too_large: '回执过大，可能已经保存。请重新读取物品核对，不要盲目重发。', request_timeout: '等待游戏回执超时，结果未知。请先核对物品再决定是否重发。' }[result.code];
    toast(result.reason ? result.reason + (next ? String.fromCharCode(10) + next : '') : '修改没有成功，草稿已保留', 'error'); return;
  }
  var st = result.item;
  if (!st || !st.id || !st.comps || !st.removed) { if (typeof Drafts !== 'undefined') Drafts.unresolved(p.doc, true); toast('写回回执缺少物品快照，请关闭后重新读取', 'error'); return; }
  var d = p.doc, unchanged = snapOf(d) === p.snap;
  var savedComps = nbtHydrate(st.comps, st.component_snbt || {});
  if (unchanged) { d.id = st.id; d.count = st.count; d.comps = savedComps; d.removed = clone(st.removed); }
  d.base = snapOf({ id: st.id, count: st.count, comps: savedComps, removed: st.removed, snbt: st.component_snbt || {} });
  d.snbt = clone(st.component_snbt || {});   // 新基线的类型参照
  if (typeof ItemHistory !== 'undefined') { ItemHistory.note(d, unchanged ? d.base : snapOf(d)); ItemHistory.flush(); }
  if (typeof Drafts !== 'undefined') Drafts.saved(d, p); // matching confirmed version clears now; later edits persist immediately
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
function redrawRegistryPage(kinds) {
  if ($('detailwin') && (kinds || []).indexOf('component_schema') >= 0) (UI.detailRefresh || []).forEach(function (refresh) { refresh(); });
  if (typeof weActive === 'function' && weActive()) { if ((kinds || []).some(function (k) { return k === 'item_defaults_one' || k === 'item_meta_one' || k === 'item_meta'; })) { drawWorldTop(); drawWorldFoot(); } return; }
  if (!Store.docs.length || $('modal') || (typeof weActive === 'function' && weActive())) return;
  var meta = ['item_defaults_one', 'item_meta_one', 'item_meta', 'entity_base_attributes', 'equipment_slot_groups', 'entity_info', 'entity_schema', 'component_schema', 'translate'];
  var refreshShell = (kinds || []).some(function (kind) { return meta.indexOf(kind) >= 0; });
  if (refreshShell) { drawHero(); drawTabbar(); }
  // Numeric capabilities update in place. Do not destroy an input containing a
  // pending NaN/Infinity just because its Codec facts have now arrived.
  var focused = document.activeElement, body = $('edbody');
  if ((kinds || []).some(function (kind) { return kind === 'component_schema' || kind === 'translate'; }) && focused && focused.tagName && /^(input|textarea)$/i.test(focused.tagName) && focused.closest && focused.closest('#edbody') === body) {
    if (!focused._codecRedraw) {
      focused._codecRedraw = function () { focused.removeEventListener('blur', focused._codecRedraw); delete focused._codecRedraw; redrawRegistryPage(['component_schema']); };
      focused.addEventListener('blur', focused._codecRedraw);
    }
    if (refreshShell) drawFooter(); return;
  }
  // Registry replies do not change the raw draft. Detaching its existing view
  // still blurs the native textarea and interrupts input/IME/undo. Keep it mounted.
  var raw = ItemRawBuffers.get(Store.doc());
  if (!(UI.tab === 'item-stack' && UI.cmdFmt === 'snbt' && raw && raw.view && raw.view.parentNode === $('edbody'))) drawTabBody();
  if (refreshShell) drawFooter();
}
function boot() {
  Store.subscribe(onStoreEvent);
  EditorDiag.phase('boot.prefs', function () { Prefs.init(typeof oriel !== 'undefined' ? oriel.data : null); });
  EditorDiag.phase('boot.registry', function () { Reg.attach(); });
  Valid.on(function () { if (Store.docs.length) { drawFooter(); if (typeof paintProblems === 'function') paintProblems(); } });
  /* 注册表数据到齐后，如果界面上没有打开的窗口，就重画当前页，让名称/列表换成实时数据 */
  var regT = null;
  Reg.on(function (kind, kinds) { clearTimeout(regT); regT = setTimeout(function () { try { redrawRegistryPage(kinds || [kind]); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.redraw', e); } }, 400); });
  OrielEditor = { open: function (st) {
    if (!EditorInventorySessionStale) EditorInventoryCapability = st && typeof st.capability === 'string' ? st.capability : '';
    EditorDiag.phase('item.load', function () { loadStack(st); });
    EditorDiag.phase('item.render', rebuild);
    EditorDiag.phase('item.drafts', function () { if (typeof Drafts !== 'undefined') Drafts.offer(Store.doc()); });
    if (EditorInventoryCapability) toast(EditorInventoryCapability, 'info', 'inventory-capability');
  } };
  if (typeof Drafts !== 'undefined') Drafts.attach();
  if (typeof oriel !== 'undefined' && oriel.on) oriel.on('data', function (data, key) {
    if (key === 'preview.problem') { UI.previewProblem = data && data['preview.problem']; if (Store.docs.length && !weActive()) drawFooter(); return; }
    if (key === 'notice' || (key === undefined && data && data.notice)) {
      var notice = data && (data.notice || data);
      var noticeOnly = key === undefined && data && data.notice && Object.keys(data).length === 1;
      if (notice && typeof notice.text === 'string' && notice.text) {
        var sequenced = typeof notice.sequence === 'number' && isFinite(notice.sequence) && notice.sequence > 0;
        if (sequenced ? notice.sequence > EditorNoticeSequence : (key === 'notice' || noticeOnly)) {
          if (sequenced) EditorNoticeSequence = notice.sequence;
          var kind = notice.kind === 'ok' || notice.kind === 'info' || notice.kind === 'warn' ? notice.kind : 'error';
          toast(notice.text, kind, 'host-notice');
        }
      }
      if (key === 'notice' || noticeOnly) return;
    }
    if (!VaultOnly && ((key === 'mode' && data === 'vault') || (key === undefined && data && data.mode === 'vault'))) { enterVaultMode(); return; }
    var handled = false;
    if (key === 'inventory_session' || (key === undefined && data && data.inventory_session)) receiveInventorySession(data.inventory_session || data);
    if (key === 'player_extended_result' || (key === undefined && data.player_extended_result)) { pxResult(data.player_extended_result || data); handled = true; }
    if (key === 'world' || (key === undefined && data.world)) { weSaved(data.world || data); handled = true; }
    if (key === 'result' || (key === undefined && data.result)) { if (weActive()) weResult(data.result); else receiveEditorResult(data.result); handled = true; }
    if (!handled && !Store.docs.length && data.stack) { Prefs.init(data); OrielEditor.open(data.stack); }
  });
  /* 独立保险库（主菜单 / 暂停菜单的按钮或 V 键）：不是编辑某件物品，只开保险库窗口，关掉窗口就回到原界面 */
  if (typeof oriel !== 'undefined' && oriel.data && oriel.data.mode === 'vault') { EditorDiag.phase('boot.vault', enterVaultMode); return; }
  /* 页面数据可能比脚本晚到（快捷键打开时）：到了才进保险库模式，不然会停在空的编辑器上 */
  setTimeout(function () { if (!VaultOnly && typeof oriel !== 'undefined' && oriel.data && oriel.data.mode === 'vault') enterVaultMode(); }, 250);
  /* 世界编辑模式：宿主给的是 world（已放置的方块实体 / 实体），不是物品栈 */
  if (typeof oriel !== 'undefined' && oriel.data && oriel.data.world) { EditorDiag.phase('boot.world', function () { weOpen(oriel.data.world); }); return; }
  var init = typeof oriel !== 'undefined' && oriel.data && oriel.data.stack ? oriel.data.stack :
    (typeof ORIEL_STACK !== 'undefined' ? ORIEL_STACK : (typeof DEMO !== 'undefined' && DEMO.items.length ? DEMO.items[0].stack : null));
  if (init) OrielEditor.open(init); else rebuild();
  if (typeof oriel !== 'undefined' && oriel.data) receiveInventorySession(oriel.data.inventory_session);
}
boot();
if (typeof EditorDiag !== 'undefined') EditorDiag.ready();
