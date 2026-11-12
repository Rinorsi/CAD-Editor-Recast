/* 玩家扩展（P4-1）：位置 / 重生点 / 配方 / 成就 / 统计 / 离线玩家。
   协议见 docs/player-extended-contract.md。它是独立于 entity.player 的会话：每个视图单独读、单独应用，
   草稿计入顶栏「应用修改」；服务端 saved 之后才清本地草稿，拒绝或超时保留。
   列表页（配方 / 成就 / 统计）的搜索框、重新读取、应用按钮放在顶部的工具行里（WE.toolsExtra），滚动时一直在。 */
var PX = { seq: 0, views: {}, pending: {}, off: { uuid: '' }, arch: { exp: {}, open: {} } };

function pxTarget(offline) {
  var w = typeof WE !== 'undefined' ? WE.w : null, p = w && w.player;
  if (offline) return { uuid: PX.off.uuid, offline: true };
  if (p && p.self) return {};
  var u = w && w.slot && w.slot.uuid;
  return u ? { uuid: u } : {};
}
function pxSelf() { return !!(WE.w && WE.w.player && WE.w.player.self); }
function pxState(view) { return PX.views[view] || (PX.views[view] = { status: 'idle', draft: null, entries: [], offset: 0, query: '', total: 0, nextOffset: null, open: {}, dirty: {} }); }
function pxRedrawAll() { if (typeof weActive === 'function' && weActive()) weRedrawBody(); }
function pxReset() { PX.views = {}; PX.pending = {}; PX.queue = []; PX.unlock = null; PX.arch = { exp: {}, open: {} }; }
/* 哪些视图有没应用的草稿（顶栏「应用修改」会把它们依次发出去）。离线玩家有自己的写入按钮，不算 */
function pxDirty(view) {
  var st = PX.views[view]; if (!st || !st.loaded) return 0;
  if (view === 'position' || view === 'respawn') return st.draft !== null && st.draft !== undefined && JSON.stringify(st.draft) !== JSON.stringify(st.value) ? 1 : 0;
  return Object.keys(st.dirty || {}).length;
}
var PX_APPLIED = ['position', 'respawn', 'recipes', 'advancements', 'stats'];
function pxDirtyViews() { return PX_APPLIED.filter(function (v) { return pxDirty(v) > 0; }); }
function pxDirtyCount() { var n = 0; PX_APPLIED.forEach(function (v) { n += pxDirty(v); }); return n; }
function pxApplyAll() { PX.queue = pxDirtyViews(); pxNext(); }
function pxNext() {
  var v = PX.queue.shift(); if (!v) return;
  var st = pxState(v);
  if (v === 'position' || v === 'respawn') pxApply(v, clone(st.draft)); else pxApplyDirty(st, v);
}
function pxDiscard() {
  PX_APPLIED.forEach(function (v) { var st = PX.views[v]; if (st) { st.draft = null; st.dirty = {}; } });
  PX.queue = []; weMarkDirty(); weRedrawBody();
}

function pxSend(msg, view, kind) {
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send('player_extended', msg) : false;
  var st = pxState(view);
  if (!sent) { st.status = 'error'; st.err = I18n.t("cadeditor.ui.worldplayerx.a63bfd6203"); toast(st.err, 'error', 'px-err'); return false; }
  PX.pending[msg.requestId] = { view: view, kind: kind, at: Date.now() };
  setTimeout(function () {
    if (PX.pending[msg.requestId]) { delete PX.pending[msg.requestId]; st.busy = false; st.status = st.loaded ? 'ready' : 'error'; st.err = I18n.t("cadeditor.ui.worldplayerx.064b977397"); toast(st.err, 'error', 'px-err'); if (weActive()) weRedrawBody(); }
  }, 12000);
  return true;
}
function pxRead(view, o) {
  o = o || {}; var st = pxState(view), offline = view === 'offline', t = pxTarget(offline);
  if (!t) { st.status = 'error'; st.err = I18n.t("cadeditor.ui.worldplayerx.2d3c6c28c0"); return; }
  if (offline && !/^[0-9a-fA-F-]{32,36}$/.test(PX.off.uuid)) { st.status = 'error'; st.err = I18n.t("cadeditor.ui.worldplayerx.d6964eddd0"); return; }
  var msg = { op: 'player_extended', requestId: 'px-' + Date.now() + '-' + (++PX.seq), action: 'read', target: t, view: view, offset: o.offset || 0, limit: 32, query: st.query || '' };
  if (view === 'advancements' && st.displayed !== false) msg.displayed = true;
  st.status = 'loading'; st.err = '';
  if (!o.append) st.entries = [];
  st.appending = !!o.append;
  pxSend(msg, view, 'read');
}
function pxApply(view, patch) {
  var st = pxState(view), offline = view === 'offline', t = pxTarget(offline);
  if (st.busy) { toast(I18n.t("cadeditor.ui.worldplayerx.28ed916204"), 'info', 'px-wait'); return; }
  if (!t || !st.revision) { toast(I18n.t("cadeditor.ui.worldplayerx.b5d85b3d52"), 'warn'); return; }
  var msg = { op: 'player_extended', requestId: 'px-' + Date.now() + '-' + (++PX.seq), action: 'apply', target: t, view: view, revision: st.revision, patch: patch };
  if (pxSend(msg, view, 'apply')) { st.busy = true; toast(I18n.t("cadeditor.ui.worldedit.c34df32374"), 'info', 'px-pending'); }
}
var PX_CODE = {
  player_forbidden: I18n.t("cadeditor.ui.worldplayerx.071c3a1ab1"), advancement_self_only: I18n.t("cadeditor.ui.worldplayerx.05b0d74ce0"), player_offline: I18n.t("cadeditor.ui.worldplayerx.7e8941e00d"),
  player_online: I18n.t("cadeditor.ui.worldplayerx.e113dd7607"), offline_owner_unsupported: I18n.t("cadeditor.ui.worldplayerx.e77dc0e0b4"),
  offline_missing: I18n.t("cadeditor.ui.worldplayerx.57f2a3722d"), offline_io: I18n.t("cadeditor.ui.worldplayerx.b4e79ded62"), invalid_nbt: I18n.t("cadeditor.ui.worldplayerx.dcb967aba8"),
  unknown_dimension: I18n.t("cadeditor.ui.worldplayerx.855c403bd1"), unknown_recipe: I18n.t("cadeditor.ui.worldplayerx.878a07d707"), unknown_advancement: I18n.t("cadeditor.ui.worldplayerx.4decf6546c"), unknown_stat: I18n.t("cadeditor.ui.worldplayerx.7f9ecee8e6"),
  chunk_unavailable: I18n.t("cadeditor.ui.worldplayerx.d4ccba467c"), teleport_failed: I18n.t("cadeditor.ui.worldplayerx.c418b9ee94"), protected_area: I18n.t("cadeditor.ui.worldplayerx.441538f6a9"),
  session_lost: I18n.t("cadeditor.ui.worldplayerx.31adff7239"), target_changed: I18n.t("cadeditor.ui.worldplayerx.992ac67736"), rate_limited: I18n.t("cadeditor.ui.worldplayerx.6ad70f31da"),
  payload_too_large: I18n.t("cadeditor.ui.worldplayerx.220f41cbfd"), invalid_request: I18n.t("cadeditor.ui.worldplayerx.cc45f044e5"), protected_field: I18n.t("cadeditor.ui.worldplayerx.bfc0462947"), request_timeout: I18n.t("cadeditor.ui.worldplayerx.5044a84cab")
};
/* 宿主回执（app.js 的 oriel.on('data') 转发）。r.status：opened / saved / rejected */
function pxResult(r) {
  if (!r || !r.requestId || !PX.pending[r.requestId]) return;
  var p = PX.pending[r.requestId]; delete PX.pending[r.requestId];
  if (p.kind === 'export') {   // 存档玩家档案：导出摘要 + 预设模板，不碰编辑会话
    PX.arch.exp[p.uuid] = r.status === 'exported' ? { status: 'ready', summary: r.summary || {}, template: r.template } : { status: 'error', err: PX_CODE[r.code] || r.reason || r.code || I18n.t("cadeditor.ui.forms.6aa27f14bf") };
    pxRedrawAll();
    return;
  }
  var st = pxState(p.view); st.busy = false; toastDismiss('px-pending');
  if (r.status === 'rejected') {
    PX.queue = [];
    st.status = st.loaded ? 'ready' : 'error'; st.err = PX_CODE[r.code] || r.reason || r.code || I18n.t("cadeditor.ui.worldedit.28384d7afd");
    toast(st.err + (r.reason && PX_CODE[r.code] ? '（' + r.reason + '）' : ''), 'error', 'px-err');
    if (r.code === 'session_lost' || r.code === 'target_changed') { st.value = null; st.loaded = false; }
  } else {
    var pe = r.playerExtended || {};
    st.status = 'ready'; st.err = ''; st.loaded = true; st.value = pe.value; st.schema = pe.schema || {}; st.revision = pe.revision; st.total = pe.total || 0; st.nextOffset = pe.nextOffset;
    var list = pe.value && pe.value.entries;
    if (Array.isArray(list)) st.entries = st.appending ? st.entries.concat(list) : list;
    st.appending = false;
    if (r.status === 'saved') { st.draft = null; st.dirty = {}; toast(I18n.t("cadeditor.ui.worldedit.d483ff6531"), 'ok', 'px-ok'); }
  }
  if (PX.unlock) {
    var ust = pxState('advancements');
    if (r.status === 'rejected') PX.unlock = null;
    else if (p.view === 'advancements' && p.kind === 'read') { if (ust.nextOffset !== null && ust.nextOffset !== undefined) pxRead('advancements', { offset: ust.nextOffset, append: true }); else if (PX.unlock.rest === null) pxUnlockStart(ust); }
    else if (p.view === 'advancements' && r.status === 'saved') pxUnlockNext(ust);
  }
  if (r.status === 'saved' && PX.queue && PX.queue.length) pxNext();   // 顶栏一次应用了好几页：接着发下一页
  if (weActive()) { weRedrawBody(); weMarkDirty(); }
}

/* ---------- 名字：优先游戏语言文件（翻译键），再退回注册表名字，最后才是 ID 的可读化 ---------- */
function pxKey(prefix, id) { return prefix + '.' + String(id).replace(':', '.').replace(/\//g, '.'); }
function pxObjName(id) {
  var s = shortId(id);
  return nameOf('item', s) || nameOf('block', s) || (typeof entityName === 'function' && Reg.live() && entityName(id) !== humanId(id) ? entityName(id) : '') || humanId(id);
}
function pxAdvName(e) { return e.title || Tr.get(e.title_key) || Tr.get(pxKey('advancements', e.id) + '.title') || humanId(e.id); }
function pxAdvDesc(e) { return e.description || Tr.get(e.description_key) || Tr.get(pxKey('advancements', e.id) + '.description') || ''; }
function pxStatName(e) {
  var t = shortId(e.type);
  if (t === 'custom') return Tr.get(pxKey('stat', e.id)) || humanId(e.id);
  if (t === 'killed' || t === 'killed_by') return typeof entityName === 'function' ? entityName(e.id) : humanId(e.id);
  return pxObjName(e.id);
}
function pxStatType(e) { return Tr.get(pxKey('stat_type', e.type)) || humanId(e.type); }
function pxRecipeName(id) { return nameOf('item', shortId(id)) || humanId(id); }

/* ---------- 通用：读取中 / 失败 / 工具行 ---------- */
function pxGate(body, view, what) {
  var st = pxState(view);
  if (st.status === 'idle') pxRead(view);
  if (st.status === 'loading' || st.status === 'idle') { body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.ec475f72bb", (what)))); return null; }
  if (!st.loaded) {
    body.appendChild(xEmpty(st.err || I18n.t("cadeditor.ui.forms.6aa27f14bf")));
    body.appendChild(h('div', { class: 'world-actions' }, [kBtn(I18n.t("cadeditor.ui.worldplayerx.df7392cc96"), function () { st.status = 'idle'; weRedrawBody(); }, { icon: 'refresh' })]));
    return null;
  }
  return st;
}
function pxChanged(st) { return Object.keys(st.dirty || {}).map(function (k) { return st.dirty[k]; }); }
function pxApplyDirty(st, view) {
  var list = pxChanged(st);
  if (!list.length) { toast(I18n.t("cadeditor.ui.screens.a10fdff631"), 'info'); return; }
  if (list.length > 64) { toast(I18n.t("cadeditor.ui.worldplayerx.d425f7f902"), 'warn'); list = list.slice(0, 64); }
  pxApply(view, { entries: list });
}
/* 列表页的工具行：搜索框 + （成就的）内部成就开关 + 重新读取 + 应用 N 项。滚动时一直在 */
function pxListTools(st, view, hint) {
  var inp = kInput(st.query || '', function () {}, { placeholder: hint, onCommit: function (v) { st.query = v.trim(); st.status = 'idle'; weRedrawBody(); } });
  WE.toolsExtra = [h('div', { class: 'ed-tsearch' }, [uiIcon('search', 12), inp])];   // 应用 / 放弃用顶栏和底栏已有的，不在这一行重复
}
function pxMore(body, st, view, extra) {
  var kids = [];
  if (st.nextOffset !== null && st.nextOffset !== undefined) kids.push(kBtn(I18n.t("cadeditor.ui.worldplayerx.85fe1593e8", (Math.min(32, st.total - st.entries.length)), (st.total)), function () { st.status = 'loading'; pxRead(view, { offset: st.nextOffset, append: true }); weRedrawBody(); }, { icon: 'down' }));
  (extra || []).forEach(function (x) { kids.push(x); });
  if (kids.length) body.appendChild(h('div', { class: 'world-actions' }, kids));
}
/* 一键解锁所有成就：先把名单读全，再每 64 条一批发出去（协议一次最多 64 项），全程不经过顶栏的草稿 */
function pxUnlockAll(st) {
  PX.unlock = { rest: null };
  if (st.nextOffset !== null && st.nextOffset !== undefined) { st.status = 'loading'; pxRead('advancements', { offset: st.nextOffset, append: true }); weRedrawBody(); }
  else pxUnlockStart(st);
}
function pxUnlockStart(st) {
  var list = [];
  st.entries.forEach(function (e) { var crit = e.criteria || []; if (crit.length && crit.some(function (c) { return !c.done; })) list.push({ id: e.id, criteria: crit.map(function (c) { return { name: c.name, done: true }; }) }); });
  if (!list.length) { PX.unlock = null; toast(I18n.t("cadeditor.ui.worldplayerx.64d54a48f9"), 'info'); return; }
  PX.unlock = { rest: list, total: list.length };
  pxUnlockNext(st);
}
function pxUnlockNext(st) {
  var u = PX.unlock; if (!u) return;
  var batch = u.rest.splice(0, 64);
  if (!batch.length) { var n = u.total; PX.unlock = null; st.status = 'idle'; toast(I18n.t("cadeditor.ui.worldplayerx.a37102424d", (n)), 'ok', 'px-ok'); weRedrawBody(); return; }
  st.dirty = {}; batch.forEach(function (e) { st.dirty[e.id] = e; });
  pxApplyDirty(st, 'advancements');
}
function pxUnlockConfirm(st) {
  var go = kBtn(I18n.t("cadeditor.ui.worldplayerx.70fba17fff"), function () { closeModal(); pxUnlockAll(st); }, { cls: 'pri', icon: 'check' });
  openModal(modalShell(I18n.t("cadeditor.ui.worldplayerx.64be741bd6"), '', [h('div', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldplayerx.495752a25b", (st.displayed === false ? '' : I18n.t("cadeditor.ui.worldplayerx.7769e01ba1"))) })], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}
function pxDims(st) { return ((st.schema && st.schema.dimensions) || []).map(function (d) { return { v: d, label: Labels.dim[d] || humanId(d) }; }); }
function pxActions(st, view, label, onApply, extra) {
  var kids = (extra || []).slice();
  kids.push(kBtn(I18n.t("cadeditor.ui.worldplayerx.df7392cc96"), function () { st.status = 'idle'; st.draft = null; weRedrawBody(); }, { icon: 'refresh', title: I18n.t("cadeditor.ui.worldplayerx.e914ea56e0") }));
  kids.push(kBtn(label, function () { if (!st.busy) onApply(); }, { cls: 'pri', icon: 'check' }));
  return h('div', { class: 'world-actions' }, kids);
}

/* ---------- 位置 + 重生点 ---------- */
function pxPosition(body) {
  var st = pxGate(body, 'position', I18n.t("cadeditor.ui.worldplayerx.1fb4d574da")); if (!st) return;
  var d = st.draft || (st.draft = clone(st.value));
  body.appendChild(xSec('compass', I18n.t("cadeditor.ui.worldplayerx.1fb4d574da"), I18n.t("cadeditor.ui.worldplayerx.9e195ecfe6")));
  function num(key, title, o) { body.appendChild(xNum({ title: title, value: d[key], min: o.min, max: o.max, step: o.step || 1, dec: o.dec === undefined ? 2 : o.dec, noSlider: true, onChange: function (v) { d[key] = v; weMarkDirty(); } })); }
  var dims = pxDims(st);
  if (dims.length) body.appendChild(xSelect({ title: I18n.t("cadeditor.ui.world.4fa164bacd"), options: dims, value: d.dimension, onChange: function (v) { d.dimension = v; weMarkDirty(); }, width: 200 }));
  body.appendChild(xText({ title: I18n.t("cadeditor.ui.worldplayerx.ea72a1b6e3"), value: d.dimension, cls: 'we-in', onCommit: function (v) { d.dimension = v.trim(); weMarkDirty(); weRedrawBody(); } }));
  num('x', 'X', {}); num('y', 'Y', {}); num('z', 'Z', {}); num('yaw', I18n.t("cadeditor.ui.worldplayer.16aa7d43a1"), { min: -360, max: 360, dec: 1 }); num('pitch', I18n.t("cadeditor.ui.worldplayer.6034c49906"), { min: -90, max: 90, dec: 1 });
  pxRespawn(body);
}
function pxRespawn(body) {
  var st = pxGate(body, 'respawn', I18n.t("cadeditor.ui.worldplayerx.d6449fe164")); if (!st) return;
  var d = st.draft === null || st.draft === undefined ? (st.draft = st.value ? clone(st.value) : null) : st.draft;
  body.appendChild(xSec('home', I18n.t("cadeditor.ui.worldplayerx.d6449fe164"), I18n.t("cadeditor.ui.worldplayerx.db63adbd55")));
  if (!d) {
    body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.c5a5189510")));
    var pos = pxState('position').value;
    body.appendChild(h('div', { class: 'world-actions' }, [kBtn(I18n.t("cadeditor.ui.worldplayerx.fdae5c306b"), function () {
      var p = pos || { dimension: 'minecraft:overworld', x: 0, y: 64, z: 0, yaw: 0 };
      st.draft = { dimension: p.dimension, x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), yaw: p.yaw || 0, forced: false }; weMarkDirty(); weRedrawBody();
    }, { icon: 'plus' })]));
    return;
  }
  var dims = pxDims(st);
  if (dims.length) body.appendChild(xSelect({ title: I18n.t("cadeditor.ui.world.4fa164bacd"), options: dims, value: d.dimension, onChange: function (v) { d.dimension = v; weMarkDirty(); }, width: 200 }));
  ['x', 'y', 'z'].forEach(function (k) { body.appendChild(xNum({ title: k.toUpperCase(), value: d[k], step: 1, dec: 0, round: true, noSlider: true, onChange: function (v) { d[k] = Math.round(v); weMarkDirty(); } })); });
  body.appendChild(xNum({ title: I18n.t("cadeditor.ui.labels.5f0c712324"), value: d.yaw, min: -360, max: 360, step: 1, dec: 1, noSlider: true, onChange: function (v) { d.yaw = v; weMarkDirty(); } }));
  body.appendChild(xToggle({ title: I18n.t("cadeditor.ui.worldplayerx.6dc2cc03d1"), sub: I18n.t("cadeditor.ui.worldplayerx.9ed97e4b1c"), value: !!d.forced, onChange: function (on) { d.forced = on; weMarkDirty(); } }));
  body.appendChild(h('div', { class: 'world-actions' }, [kBtn(I18n.t("cadeditor.ui.worldplayerx.3f59c48614"), function () { pxApply('respawn', null); }, { icon: 'trash' })]));
}

/* ---------- 配方 ---------- */
function pxRecipes(body) {
  var st = pxGate(body, 'recipes', I18n.t("cadeditor.ui.worldedit.f25ff1efa2")); if (!st) return;
  pxListTools(st, 'recipes', I18n.t("cadeditor.ui.worldplayerx.d232ffaf7e"));
  body.appendChild(xSec('book', I18n.t("cadeditor.ui.worldplayerx.0c2d1c5537"), I18n.t("cadeditor.ui.worldplayerx.5649b03c22", (st.total))));
  st.entries.forEach(function (e) {
    var cur = st.dirty[e.id] || e;
    body.appendChild(xRow({ icon: itemIcon(shortId(e.id), 16), title: pxRecipeName(e.id), sub: e.id, tip: e.id, right: h('div', { class: 'k-row' }, [
      h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldplayerx.e4cf2de9b4") }), kToggle(!!cur.unlocked, function (on) { st.dirty[e.id] = { id: e.id, unlocked: on, highlighted: on ? !!cur.highlighted : false }; weRedrawBody(); }).el,
      h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.worldplayerx.05f954565f") }), kToggle(!!cur.highlighted, function (on) { st.dirty[e.id] = { id: e.id, unlocked: on ? true : !!cur.unlocked, highlighted: on }; weRedrawBody(); }).el]) }));
  });
  if (!st.entries.length) body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.2aa531c30c")));
  pxMore(body, st, 'recipes');
}

/* ---------- 成就 ---------- */
function pxAdvancements(body) {
  if (!pxSelf()) { body.appendChild(xSec('trophy', I18n.t("cadeditor.ui.worldedit.52b0e1703d"))); body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.05b0d74ce0"))); return; }
  var st = pxGate(body, 'advancements', I18n.t("cadeditor.ui.worldedit.52b0e1703d")); if (!st) return;
  var inner = st.displayed === false;
  pxListTools(st, 'advancements', I18n.t("cadeditor.ui.worldplayerx.7429a56e2c"));
  body.appendChild(xSec('trophy', I18n.t("cadeditor.ui.worldedit.52b0e1703d"), I18n.t("cadeditor.ui.cards2.a9ab3a5f38", (st.total)), kBtn(inner ? I18n.t("cadeditor.ui.worldplayerx.fabf62f305") : I18n.t("cadeditor.ui.worldplayerx.dc3d1337b9"), function () { st.displayed = inner ? true : false; st.status = 'idle'; weRedrawBody(); }, { title: I18n.t("cadeditor.ui.worldplayerx.b66c493c20") })));
  st.entries.forEach(function (e) {
    var cur = st.dirty[e.id] || { id: e.id, criteria: e.criteria }, crit = cur.criteria || [], doneN = crit.filter(function (c) { return c.done; }).length, desc = pxAdvDesc(e);
    var all = crit.length && doneN === crit.length;
    body.appendChild(xRow({ icon: false, title: pxAdvName(e), sub: (desc ? desc + ' · ' : '') + doneN + '/' + crit.length, tip: e.id,
      right: h('span', { class: 'k-sub', text: all ? I18n.t("cadeditor.ui.worldplayerx.f28461bb49") : '' }),
      open: !!st.open[e.id], body: crit.length ? function () {
        var rows = [kHint(e.id, 'sub')];
        crit.forEach(function (c) {
          rows.push(xToggle({ title: c.name.indexOf(':') > 0 ? pxObjName(c.name) : humanId(c.name), sub: c.name, tip: c.name, value: !!c.done, onChange: function (on) {
            var next = clone(crit); next.forEach(function (x) { if (x.name === c.name) x.done = on; }); st.dirty[e.id] = { id: e.id, criteria: next }; weRedrawBody();
          } }));
        });
        return rows;
      } : null,
      onHead: crit.length ? function () { st.open[e.id] = !st.open[e.id]; weRedrawBody(); } : null }));
  });
  if (!st.entries.length) body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.6ea1038bbc")));
  pxMore(body, st, 'advancements', [kBtn(I18n.t("cadeditor.ui.worldplayerx.64be741bd6"), function () { pxUnlockConfirm(st); }, { icon: 'trophy', title: I18n.t("cadeditor.ui.worldplayerx.1120a161ed") })]);
}

/* ---------- 统计 ---------- */
function pxStats(body) {
  var st = pxGate(body, 'stats', I18n.t("cadeditor.ui.worldedit.89abe8c6ac")); if (!st) return;
  var sc = st.schema || {};
  pxListTools(st, 'stats', I18n.t("cadeditor.ui.worldplayerx.e41051c480"));
  body.appendChild(xSec('scroll', I18n.t("cadeditor.ui.worldedit.89abe8c6ac"), I18n.t("cadeditor.ui.worldplayerx.abf97cac53", (st.total))));
  st.entries.forEach(function (e) {
    var k = e.type + '|' + e.id, cur = st.dirty[k] ? st.dirty[k].value : e.value;
    body.appendChild(xNum({ title: pxStatName(e), sub: pxStatType(e) + ' · ' + e.id, tip: e.type + ' / ' + e.id, value: cur, def: 0, min: sc.min === undefined ? 0 : sc.min, max: sc.max, step: 1, dec: 0, round: true, noSlider: true,
      onChange: function (v) { if (v === e.value) delete st.dirty[k]; else st.dirty[k] = { type: e.type, id: e.id, value: Math.round(v) }; } }));
  });
  if (!st.entries.length) body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.8a2d23047b")));
  pxMore(body, st, 'stats');
}

/* ---------- 存档玩家：这个存档里所有玩家的名单；点开看摘要，复制到保险库、套用到当前玩家，离线的还能改原始数据 ---------- */
function pxExport(e) {
  var t = { uuid: e.uuid, offline: !e.online };
  var msg = { op: 'player_extended', requestId: 'px-' + Date.now() + '-' + (++PX.seq), action: 'export_preset', target: t };
  PX.arch.exp[e.uuid] = { status: 'loading' };
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send('player_extended', msg) : false;
  if (!sent) { PX.arch.exp[e.uuid] = { status: 'error', err: I18n.t("cadeditor.ui.vault.c8da8c3b3d") }; return; }
  PX.pending[msg.requestId] = { view: 'players', kind: 'export', uuid: e.uuid, at: Date.now() };
}
function pxPlayerLabel(e) { return e.name || I18n.t("cadeditor.ui.worldplayerx.235daf9ecc"); }
function pxWhen(ms) {
  if (!ms) return '';
  var d = new Date(ms), z = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}
/* 把导出的模板存进保险库（走分段上传），cb(entry) */
function pxSavePreset(e, cb) {
  var ex = PX.arch.exp[e.uuid]; if (!ex || ex.status !== 'ready') return;
  Vault.upload(JSON.stringify({ template: ex.template }), function (u) {
    if (!u.ok) { vaultErr(u); return; }
    Vault.call('save', { kind: 'player_preset', uploadToken: u.token, name: I18n.t("cadeditor.ui.worldplayerx.1d6a999604", (pxPlayerLabel(e))), tags: [I18n.t("cadeditor.ui.worldedit.7d9c25abe0")] }, function (r) {
      if (!r.ok) { vaultErr(r); return; }
      cb(r.entry || { id: r.id, name: I18n.t("cadeditor.ui.worldplayerx.1d6a999604", (pxPlayerLabel(e))) });
    });
  });
}
/* 摘要卡：一排小方块（生命 / 饥饿 / 等级 / 位置 / 背包 / 末影箱）+ 装备格，简单好看，不堆文字 */
function pxSummaryBox(sm) {
  var box = h('div', { class: 'px-sum' }), row = h('div', { class: 'px-tiles' });
  function tile(icon, label, value, tip) {
    if (value === undefined || value === null || value === '') return;
    row.appendChild(h('div', { class: 'px-tile', title: tip || label }, [uiIcon(icon, 14), h('div', { class: 'tx' }, [h('b', { text: String(value) }), h('span', { class: 'k-sub', text: label })])]));
  }
  tile('heart', I18n.t("cadeditor.ui.worldedit.45bc77bc1c"), sm.health !== undefined ? fmtNum(sm.health) : '');
  tile('hunger', I18n.t("cadeditor.ui.worldedit.78905cde67"), sm.food);
  tile('xp', I18n.t("cadeditor.ui.labels.3377171738"), sm.xp_level);
  tile('user', I18n.t("cadeditor.ui.labels.47a270081a"), Labels.mode[sm.game_mode] || sm.game_mode);
  tile('backpack', I18n.t("cadeditor.ui.labels.015845346a"), sm.inventory_count !== undefined ? I18n.t("cadeditor.ui.worldplayerx.df2e218114", (sm.inventory_count)) : '');
  tile('chest', I18n.t("cadeditor.ui.labels.d7fe02211b"), sm.ender_count !== undefined ? I18n.t("cadeditor.ui.worldplayerx.df2e218114", (sm.ender_count)) : '');
  box.appendChild(row);
  var foot = h('div', { class: 'px-foot' });
  if (sm.dimension) foot.appendChild(h('div', { class: 'px-where' }, [uiIcon('compass', 14), h('span', { text: (Labels.dim[sm.dimension] || humanId(sm.dimension)) + '  ' + [sm.x, sm.y, sm.z].map(function (v) { return Math.round(v); }).join('  ') })]));
  var eq = sm.equipment || {}, slots = [];
  [['head', I18n.t("cadeditor.ui.labels.730da70298")], ['chest', I18n.t("cadeditor.ui.labels.edddeddef7")], ['legs', I18n.t("cadeditor.ui.labels.0db4f5a0fe")], ['feet', I18n.t("cadeditor.ui.labels.ee5d390496")], ['offhand', I18n.t("cadeditor.ui.labels.c3b453b6f1")]].forEach(function (k) {
    slots.push(h('div', { class: 'slot s34', title: k[1] + (eq[k[0]] ? '：' + pxObjName(eq[k[0]]) : I18n.t("cadeditor.ui.worldplayerx.e8652d59ce")) }, eq[k[0]] ? [itemIcon(shortId(eq[k[0]]), 24)] : []));
  });
  foot.appendChild(h('div', { class: 'px-eq' }, slots));
  box.appendChild(foot);
  return box;
}
function pxCopyText(text, what) { copyText(text, what); }
/* 存档玩家名单：点开一位看摘要，查看玩家数据 = 打开他的完整编辑页 */
function pxArchive(body) {
  var redraw = pxRedrawAll;
  var st = pxGate(body, 'players', I18n.t("cadeditor.ui.worldplayerx.e237fddabc")); if (!st) return;
  pxListTools(st, 'players', I18n.t("cadeditor.ui.worldplayerx.9f312cbc06"));
  var myPage = typeof WE !== 'undefined' && WE.w && WE.w.player && WE.w.player.self;
  body.appendChild(xSec('users', I18n.t("cadeditor.ui.worldplayerx.d3b9294f2c"), I18n.t("cadeditor.ui.worldplayerx.7b30736918", (st.total))));
  st.entries.forEach(function (e) {
    var ex = PX.arch.exp[e.uuid], open = !!PX.arch.open[e.uuid], tags = [];
    if (e.self) tags.push(h('span', { class: 'k-tag', text: I18n.t("cadeditor.ui.worldplayerx.a0c7716669") }));
    if (e.online) tags.push(h('span', { class: 'k-tag', text: I18n.t("cadeditor.ui.worldplayerx.b9086662b1") }));
    if (e.owner) tags.push(h('span', { class: 'k-tag dim', text: I18n.t("cadeditor.ui.worldplayerx.bc35a81898") }));
    body.appendChild(xRow({ icon: uiIcon('user', 16), title: pxPlayerLabel(e), sub: e.uuid + (e.last_played_ms ? ' · ' + pxWhen(e.last_played_ms) : ''), tip: e.uuid, right: h('div', { class: 'k-row' }, tags), open: open,
      onHead: function () { PX.arch.open[e.uuid] = !open; if (!open && (!ex || ex.status === 'error')) pxExport(e); redraw(); },
      body: function () {
        var kids = [];
        if (!ex || ex.status === 'loading') kids.push(xEmpty(I18n.t("cadeditor.ui.app.86b6d0d630")));
        else if (ex.status === 'error') kids.push(kHint(ex.err, 'err'));
        else {
          kids.push(pxSummaryBox(ex.summary));
          var acts = [];
          if (!e.self) acts.push(kBtn(I18n.t("cadeditor.ui.vault.ae81e1b269"), function () { if (typeof oriel !== 'undefined' && oriel.send) oriel.send('open_world', e.online ? { uuid: e.uuid } : { uuid: e.uuid, offline: true }); }, { cls: 'pri', icon: 'eye', title: I18n.t("cadeditor.ui.worldplayerx.1e28f2de85") }));
          acts.push(kBtn(I18n.t("cadeditor.ui.worldplayerx.c2fdec41f0"), function () { pxSavePreset(e, function (en) { toast(I18n.t("cadeditor.ui.vault.d5cdd79d2a", (en.name)), 'ok'); }); }, { icon: 'chest', title: I18n.t("cadeditor.ui.worldplayerx.2d06adb6e1") }));
          acts.push(kBtn(I18n.t("cadeditor.ui.worldplayerx.06eddeee90"), function () { pxCopyText(e.uuid, ' UUID'); }, { icon: 'copy', title: e.uuid }));
          if (!e.self && myPage) acts.push(kBtn(I18n.t("cadeditor.ui.worldplayerx.c2d8257506"), function () { pxSavePreset(e, function (en) { vwSections(en); }); }, { icon: 'download', title: I18n.t("cadeditor.ui.worldplayerx.d4ceb91837") }));
          kids.push(h('div', { class: 'world-actions' }, acts));
        }
        return kids;
      } }));
  });
  if (!st.entries.length) body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldplayerx.53a1c8fc1d")));
  pxMore(body, st, 'players');
  body.appendChild(xSec('search', I18n.t("cadeditor.ui.worldplayerx.6d1d3b7ce1")));
  body.appendChild(xText({ title: I18n.t("cadeditor.ui.worldplayerx.cad463d419"), value: PX.off.uuid, placeholder: '00000000-0000-0000-0000-000000000000', cls: 'we-in', onCommit: function (v) {
    v = v.trim(); PX.off.uuid = v;
    if (/^[0-9a-fA-F-]{32,36}$/.test(v)) { var e = { uuid: v, name: null, online: false }; PX.arch.open[v] = true; pxExport(e); st.query = v; st.status = 'idle'; redraw(); }
  } }));
}
