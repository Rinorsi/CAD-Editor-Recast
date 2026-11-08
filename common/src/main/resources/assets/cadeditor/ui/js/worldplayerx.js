/* 玩家扩展（P4-1）：位置 / 重生点 / 配方 / 成就 / 统计 / 离线玩家。
   协议见 docs/player-extended-contract.md。它是独立于 entity.player 的会话：每个视图单独读、单独应用，
   不进顶栏「应用修改」的草稿；服务端 saved 之后才清本地草稿，拒绝或超时保留。
   列表页（配方 / 成就 / 统计）的搜索框、重新读取、应用按钮放在顶部的工具行里（WE.toolsExtra），滚动时一直在。 */
var PX = { seq: 0, views: {}, pending: {}, off: { uuid: '' }, arch: { exp: {}, open: {}, rawFor: '' } };

function pxTarget(offline) {
  var w = typeof WE !== 'undefined' ? WE.w : null, p = w && w.player;
  if (offline) return { uuid: PX.off.uuid, offline: true };
  if (p && p.self) return {};
  var u = w && w.slot && w.slot.uuid;
  return u ? { uuid: u } : {};
}
function pxSelf() { return !!(WE.w && WE.w.player && WE.w.player.self); }
function pxState(view) { return PX.views[view] || (PX.views[view] = { status: 'idle', draft: null, entries: [], offset: 0, query: '', total: 0, nextOffset: null, open: {}, dirty: {} }); }
/* 玩家名单有两个宿主：世界页的标签，和保险库里打开的弹窗；重画时两边都刷新 */
function pxRedrawAll() { if (PX.modal) PX.modal.redraw(); if (typeof weActive === 'function' && weActive()) weRedrawBody(); }
function pxReset() { PX.views = {}; PX.pending = {}; PX.queue = []; PX.unlock = null; PX.arch = { exp: {}, open: {}, rawFor: '' }; }
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
  if (!sent) { st.status = 'error'; st.err = '宿主没有接受请求（未连接或限流）'; toast(st.err, 'error', 'px-err'); return false; }
  PX.pending[msg.requestId] = { view: view, kind: kind, at: Date.now() };
  setTimeout(function () {
    if (PX.pending[msg.requestId]) { delete PX.pending[msg.requestId]; st.busy = false; st.status = st.loaded ? 'ready' : 'error'; st.err = '12 秒没有回执，结果未知；请重新读取核对'; toast(st.err, 'error', 'px-err'); if (weActive()) weRedrawBody(); }
  }, 12000);
  return true;
}
function pxRead(view, o) {
  o = o || {}; var st = pxState(view), offline = view === 'offline', t = pxTarget(offline);
  if (!t) { st.status = 'error'; st.err = '没有拿到这位玩家的标识，无法读取。'; return; }
  if (offline && !/^[0-9a-fA-F-]{32,36}$/.test(PX.off.uuid)) { st.status = 'error'; st.err = '请输入完整的玩家 UUID。'; return; }
  var msg = { op: 'player_extended', requestId: 'px-' + Date.now() + '-' + (++PX.seq), action: 'read', target: t, view: view, offset: o.offset || 0, limit: 32, query: st.query || '' };
  if (view === 'advancements' && st.displayed !== false) msg.displayed = true;
  st.status = 'loading'; st.err = '';
  if (!o.append) st.entries = [];
  st.appending = !!o.append;
  pxSend(msg, view, 'read');
}
function pxApply(view, patch) {
  var st = pxState(view), offline = view === 'offline', t = pxTarget(offline);
  if (st.busy) { toast('上一笔还没有回执', 'info', 'px-wait'); return; }
  if (!t || !st.revision) { toast('请先读取数据', 'warn'); return; }
  var msg = { op: 'player_extended', requestId: 'px-' + Date.now() + '-' + (++PX.seq), action: 'apply', target: t, view: view, revision: st.revision, patch: patch };
  if (pxSend(msg, view, 'apply')) { st.busy = true; toast('已提交给游戏，等待回执…', 'info', 'px-pending'); }
}
var PX_CODE = {
  player_forbidden: '编辑玩家需要游戏管理员权限。', advancement_self_only: '成就只能修改自己的数据。', player_offline: '目标玩家不在线或不存在。',
  player_online: '这位玩家已经上线了，请改为打开在线玩家来编辑。', offline_owner_unsupported: '单人世界所有者的数据由存档本身管理，请进入世界后在线编辑。',
  offline_missing: '没有找到这个 UUID 的玩家存档。', offline_io: '无法读取、备份或替换玩家文件；你的修改还在，没有写入。', invalid_nbt: '游戏校验没有通过，没有写入。',
  unknown_dimension: '这个维度不存在。', unknown_recipe: '这个配方不存在。', unknown_advancement: '这个成就不存在。', unknown_stat: '这个统计项不存在。',
  chunk_unavailable: '无法加载传送目标所在的区块。', teleport_failed: '游戏拒绝了这次传送。', protected_area: '目标超出了世界边界或建造高度。',
  session_lost: '会话失效了，请重新读取。', target_changed: '数据在你编辑期间被改动了，请重新读取后再改。', rate_limited: '操作太快了，稍等一下再试。',
  payload_too_large: '一次改的东西太多了。', invalid_request: '请求格式有误。', protected_field: '这个字段不允许修改。', request_timeout: '结果未知，请先重新读取核对。'
};
/* 宿主回执（app.js 的 oriel.on('data') 转发）。r.status：opened / saved / rejected */
function pxResult(r) {
  if (!r || !r.requestId || !PX.pending[r.requestId]) return;
  var p = PX.pending[r.requestId]; delete PX.pending[r.requestId];
  if (p.kind === 'export') {   // 存档玩家档案：导出摘要 + 预设模板，不碰编辑会话
    PX.arch.exp[p.uuid] = r.status === 'exported' ? { status: 'ready', summary: r.summary || {}, template: r.template } : { status: 'error', err: PX_CODE[r.code] || r.reason || r.code || '读取失败' };
    pxRedrawAll();
    return;
  }
  var st = pxState(p.view); st.busy = false; toastDismiss('px-pending');
  if (r.status === 'rejected') {
    PX.queue = [];
    st.status = st.loaded ? 'ready' : 'error'; st.err = PX_CODE[r.code] || r.reason || r.code || '失败';
    toast(st.err + (r.reason && PX_CODE[r.code] ? '（' + r.reason + '）' : ''), 'error', 'px-err');
    if (r.code === 'session_lost' || r.code === 'target_changed') { st.value = null; st.loaded = false; }
  } else {
    var pe = r.playerExtended || {};
    st.status = 'ready'; st.err = ''; st.loaded = true; st.value = pe.value; st.schema = pe.schema || {}; st.revision = pe.revision; st.total = pe.total || 0; st.nextOffset = pe.nextOffset;
    var list = pe.value && pe.value.entries;
    if (Array.isArray(list)) st.entries = st.appending ? st.entries.concat(list) : list;
    st.appending = false;
    if (r.status === 'saved') { st.draft = null; st.dirty = {}; toast('游戏已确认修改', 'ok', 'px-ok'); }
  }
  if (PX.unlock) {
    var ust = pxState('advancements');
    if (r.status === 'rejected') PX.unlock = null;
    else if (p.view === 'advancements' && p.kind === 'read') { if (ust.nextOffset !== null && ust.nextOffset !== undefined) pxRead('advancements', { offset: ust.nextOffset, append: true }); else if (PX.unlock.rest === null) pxUnlockStart(ust); }
    else if (p.view === 'advancements' && r.status === 'saved') pxUnlockNext(ust);
  }
  if (r.status === 'saved' && PX.queue && PX.queue.length) pxNext();   // 顶栏一次应用了好几页：接着发下一页
  if (PX.modal) PX.modal.redraw();
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
  if (st.status === 'loading' || st.status === 'idle') { body.appendChild(xEmpty('正在读取' + what + '…')); return null; }
  if (!st.loaded) {
    body.appendChild(xEmpty(st.err || '读取失败'));
    body.appendChild(h('div', { class: 'world-actions' }, [kBtn('重新读取', function () { st.status = 'idle'; weRedrawBody(); }, { icon: 'refresh' })]));
    return null;
  }
  return st;
}
function pxChanged(st) { return Object.keys(st.dirty || {}).map(function (k) { return st.dirty[k]; }); }
function pxApplyDirty(st, view) {
  var list = pxChanged(st);
  if (!list.length) { toast('还没有修改', 'info'); return; }
  if (list.length > 64) { toast('一次最多应用 64 项，先应用前 64 项，成功后再点一次。', 'warn'); list = list.slice(0, 64); }
  pxApply(view, { entries: list });
}
/* 列表页的工具行：搜索框 + （成就的）内部成就开关 + 重新读取 + 应用 N 项。滚动时一直在 */
function pxListTools(st, view, hint) {
  var inp = kInput(st.query || '', function () {}, { placeholder: hint, onCommit: function (v) { st.query = v.trim(); st.status = 'idle'; weRedrawBody(); } });
  WE.toolsExtra = [h('div', { class: 'ed-tsearch' }, [uiIcon('search', 12), inp])];   // 应用 / 放弃用顶栏和底栏已有的，不在这一行重复
}
function pxMore(body, st, view, extra) {
  var kids = [];
  if (st.nextOffset !== null && st.nextOffset !== undefined) kids.push(kBtn('再加载 ' + Math.min(32, st.total - st.entries.length) + ' 项（共 ' + st.total + '）', function () { st.status = 'loading'; pxRead(view, { offset: st.nextOffset, append: true }); weRedrawBody(); }, { icon: 'down' }));
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
  if (!list.length) { PX.unlock = null; toast('没有需要解锁的成就', 'info'); return; }
  PX.unlock = { rest: list, total: list.length };
  pxUnlockNext(st);
}
function pxUnlockNext(st) {
  var u = PX.unlock; if (!u) return;
  var batch = u.rest.splice(0, 64);
  if (!batch.length) { var n = u.total; PX.unlock = null; st.status = 'idle'; toast('已解锁 ' + n + ' 个成就', 'ok', 'px-ok'); weRedrawBody(); return; }
  st.dirty = {}; batch.forEach(function (e) { st.dirty[e.id] = e; });
  pxApplyDirty(st, 'advancements');
}
function pxUnlockConfirm(st) {
  var go = kBtn('解锁', function () { closeModal(); pxUnlockAll(st); }, { cls: 'pri', icon: 'check' });
  openModal(modalShell('解锁所有成就', '', [h('div', { class: 'k-sub', text: '会触发原版的奖励和公告，无法撤销。' + (st.displayed === false ? '' : '只包含玩家界面里看得见的成就。') })], [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}
function pxDims(st) { return ((st.schema && st.schema.dimensions) || []).map(function (d) { return { v: d, label: Labels.dim[d] || humanId(d) }; }); }
function pxActions(st, view, label, onApply, extra) {
  var kids = (extra || []).slice();
  kids.push(kBtn('重新读取', function () { st.status = 'idle'; st.draft = null; weRedrawBody(); }, { icon: 'refresh', title: '放弃本页未应用的修改，重新从游戏读取' }));
  kids.push(kBtn(label, function () { if (!st.busy) onApply(); }, { cls: 'pri', icon: 'check' }));
  return h('div', { class: 'world-actions' }, kids);
}

/* ---------- 位置 + 重生点 ---------- */
function pxPosition(body) {
  var st = pxGate(body, 'position', '位置'); if (!st) return;
  var d = st.draft || (st.draft = clone(st.value));
  body.appendChild(xSec('compass', '位置', '点顶栏「应用修改」即传送'));
  function num(key, title, o) { body.appendChild(xNum({ title: title, value: d[key], min: o.min, max: o.max, step: o.step || 1, dec: o.dec === undefined ? 2 : o.dec, noSlider: true, onChange: function (v) { d[key] = v; } })); }
  var dims = pxDims(st);
  if (dims.length) body.appendChild(xSelect({ title: '维度', options: dims, value: d.dimension, onChange: function (v) { d.dimension = v; }, width: 200 }));
  body.appendChild(xText({ title: '维度 ID', value: d.dimension, cls: 'we-in', onCommit: function (v) { d.dimension = v.trim(); weRedrawBody(); } }));
  num('x', 'X', {}); num('y', 'Y', {}); num('z', 'Z', {}); num('yaw', '水平朝向', { min: -360, max: 360, dec: 1 }); num('pitch', '俯仰', { min: -90, max: 90, dec: 1 });
  pxRespawn(body);
}
function pxRespawn(body) {
  var st = pxGate(body, 'respawn', '重生点'); if (!st) return;
  var d = st.draft === null || st.draft === undefined ? (st.draft = st.value ? clone(st.value) : null) : st.draft;
  body.appendChild(xSec('home', '重生点', '没有设置时按世界出生点重生'));
  if (!d) {
    body.appendChild(xEmpty('这位玩家现在没有自定义重生点。'));
    var pos = pxState('position').value;
    body.appendChild(h('div', { class: 'world-actions' }, [kBtn('设为当前位置', function () {
      var p = pos || { dimension: 'minecraft:overworld', x: 0, y: 64, z: 0, yaw: 0 };
      st.draft = { dimension: p.dimension, x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), yaw: p.yaw || 0, forced: false }; weRedrawBody();
    }, { icon: 'plus' })]));
    return;
  }
  var dims = pxDims(st);
  if (dims.length) body.appendChild(xSelect({ title: '维度', options: dims, value: d.dimension, onChange: function (v) { d.dimension = v; }, width: 200 }));
  ['x', 'y', 'z'].forEach(function (k) { body.appendChild(xNum({ title: k.toUpperCase(), value: d[k], step: 1, dec: 0, round: true, noSlider: true, onChange: function (v) { d[k] = Math.round(v); } })); });
  body.appendChild(xNum({ title: '朝向', value: d.yaw, min: -360, max: 360, step: 1, dec: 1, noSlider: true, onChange: function (v) { d.yaw = v; } }));
  body.appendChild(xToggle({ title: '强制重生在这里', sub: '关闭时，游戏会先检查床或重生锚还在不在', value: !!d.forced, onChange: function (on) { d.forced = on; } }));
  body.appendChild(h('div', { class: 'world-actions' }, [kBtn('清除重生点', function () { pxApply('respawn', null); }, { icon: 'trash' })]));
}

/* ---------- 配方 ---------- */
function pxRecipes(body) {
  var st = pxGate(body, 'recipes', '配方'); if (!st) return;
  pxListTools(st, 'recipes', '搜索配方（名称或 ID）');
  body.appendChild(xSec('book', '配方书', st.total + ' 个配方 · 只改你动过的'));
  st.entries.forEach(function (e) {
    var cur = st.dirty[e.id] || e;
    body.appendChild(xRow({ icon: itemIcon(shortId(e.id), 16), title: pxRecipeName(e.id), sub: e.id, tip: e.id, right: h('div', { class: 'k-row' }, [
      h('span', { class: 'k-sub', text: '已解锁' }), kToggle(!!cur.unlocked, function (on) { st.dirty[e.id] = { id: e.id, unlocked: on, highlighted: on ? !!cur.highlighted : false }; weRedrawBody(); }).el,
      h('span', { class: 'k-sub', text: '高亮' }), kToggle(!!cur.highlighted, function (on) { st.dirty[e.id] = { id: e.id, unlocked: on ? true : !!cur.unlocked, highlighted: on }; weRedrawBody(); }).el]) }));
  });
  if (!st.entries.length) body.appendChild(xEmpty('没有匹配的配方。'));
  pxMore(body, st, 'recipes');
}

/* ---------- 成就 ---------- */
function pxAdvancements(body) {
  if (!pxSelf()) { body.appendChild(xSec('trophy', '成就')); body.appendChild(xEmpty('成就只能修改自己的数据。')); return; }
  var st = pxGate(body, 'advancements', '成就'); if (!st) return;
  var inner = st.displayed === false;
  pxListTools(st, 'advancements', '搜索成就（名称或 ID）');
  body.appendChild(xSec('trophy', '成就', st.total + ' 项', kBtn(inner ? '含内部成就 ✓' : '含内部成就', function () { st.displayed = inner ? true : false; st.status = 'idle'; weRedrawBody(); }, { title: '内部成就：配方解锁之类，玩家界面里看不到' })));
  st.entries.forEach(function (e) {
    var cur = st.dirty[e.id] || { id: e.id, criteria: e.criteria }, crit = cur.criteria || [], doneN = crit.filter(function (c) { return c.done; }).length, desc = pxAdvDesc(e);
    var all = crit.length && doneN === crit.length;
    body.appendChild(xRow({ icon: false, title: pxAdvName(e), sub: (desc ? desc + ' · ' : '') + doneN + '/' + crit.length, tip: e.id,
      right: h('span', { class: 'k-sub', text: all ? '已完成' : '' }),
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
  if (!st.entries.length) body.appendChild(xEmpty('没有匹配的成就。'));
  pxMore(body, st, 'advancements', [kBtn('解锁所有成就', function () { pxUnlockConfirm(st); }, { icon: 'trophy', title: '把名单里每个成就的全部条件都标为完成' })]);
}

/* ---------- 统计 ---------- */
function pxStats(body) {
  var st = pxGate(body, 'stats', '统计'); if (!st) return;
  var sc = st.schema || {};
  pxListTools(st, 'stats', '搜索统计（名称或 ID）');
  body.appendChild(xSec('scroll', '统计', st.total + ' 项（包含还没发生过的）'));
  st.entries.forEach(function (e) {
    var k = e.type + '|' + e.id, cur = st.dirty[k] ? st.dirty[k].value : e.value;
    body.appendChild(xNum({ title: pxStatName(e), sub: pxStatType(e) + ' · ' + e.id, tip: e.type + ' / ' + e.id, value: cur, def: 0, min: sc.min === undefined ? 0 : sc.min, max: sc.max, step: 1, dec: 0, round: true, noSlider: true,
      onChange: function (v) { if (v === e.value) delete st.dirty[k]; else st.dirty[k] = { type: e.type, id: e.id, value: Math.round(v) }; } }));
  });
  if (!st.entries.length) body.appendChild(xEmpty('没有匹配的统计项。'));
  pxMore(body, st, 'stats');
}

/* ---------- 存档玩家：这个存档里所有玩家的名单；点开看摘要，复制到保险库、套用到当前玩家，离线的还能改原始数据 ---------- */
function pxExport(e) {
  var t = { uuid: e.uuid, offline: !e.online };
  var msg = { op: 'player_extended', requestId: 'px-' + Date.now() + '-' + (++PX.seq), action: 'export_preset', target: t };
  PX.arch.exp[e.uuid] = { status: 'loading' };
  var sent = (typeof oriel !== 'undefined' && oriel.send) ? oriel.send('player_extended', msg) : false;
  if (!sent) { PX.arch.exp[e.uuid] = { status: 'error', err: '宿主没有接受请求' }; return; }
  PX.pending[msg.requestId] = { view: 'players', kind: 'export', uuid: e.uuid, at: Date.now() };
}
function pxPlayerLabel(e) { return e.name || '未知玩家'; }
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
    Vault.call('save', { kind: 'player_preset', uploadToken: u.token, name: pxPlayerLabel(e) + ' 的数据', tags: ['存档玩家'] }, function (r) {
      if (!r.ok) { vaultErr(r); return; }
      cb(r.entry || { id: r.id, name: pxPlayerLabel(e) + ' 的数据' });
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
  tile('heart', '生命', sm.health !== undefined ? fmtNum(sm.health) : '');
  tile('hunger', '饥饿', sm.food);
  tile('xp', '等级', sm.xp_level);
  tile('user', '模式', Labels.mode[sm.game_mode] || sm.game_mode);
  tile('backpack', '背包', sm.inventory_count !== undefined ? sm.inventory_count + ' 件' : '');
  tile('chest', '末影箱', sm.ender_count !== undefined ? sm.ender_count + ' 件' : '');
  box.appendChild(row);
  var foot = h('div', { class: 'px-foot' });
  if (sm.dimension) foot.appendChild(h('div', { class: 'px-where' }, [uiIcon('compass', 14), h('span', { text: (Labels.dim[sm.dimension] || humanId(sm.dimension)) + '  ' + [sm.x, sm.y, sm.z].map(function (v) { return Math.round(v); }).join('  ') })]));
  var eq = sm.equipment || {}, slots = [];
  [['head', '头盔'], ['chest', '胸甲'], ['legs', '护腿'], ['feet', '靴子'], ['offhand', '副手']].forEach(function (k) {
    slots.push(h('div', { class: 'slot s34', title: k[1] + (eq[k[0]] ? '：' + pxObjName(eq[k[0]]) : '：空') }, eq[k[0]] ? [itemIcon(shortId(eq[k[0]]), 24)] : []));
  });
  foot.appendChild(h('div', { class: 'px-eq' }, slots));
  box.appendChild(foot);
  return box;
}
function pxCopyText(text, what) {
  if (Prefs.hostClip && typeof oriel !== 'undefined' && oriel.send) { oriel.send('clipboard', { text: text }); toast('已复制' + what, 'ok'); }
  else toast('当前环境不能直接写剪贴板', 'warn');
}
function pxOpenRaw(e) {
  var st = pxState('offline'); PX.off.uuid = e.uuid; PX.arch.rawFor = e.uuid; st.loaded = false; st.value = null; st.draft = null; pxRead('offline');
}
function pxRawModal(e) {
  var st = pxState('offline');
  var code = kCode({ value: nbtPrint(nbtParse(st.value.snbt), true), height: 300, validate: function (t) { nbtParse(t); } });
  var keys = (st.schema && st.schema.editableKeys) || [];
  var go = kBtn('写入存档', function () {
    try { pxApply('offline', { snbt: nbtPrint(nbtParse(code.get()), false) }); closeModal(); } catch (err) { toast('SNBT 有误，没有提交：' + (err.message || err), 'error'); }
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell('原始数据', pxPlayerLabel(e) + (keys.length ? ' · 可改：' + keys.join('、') : ''), [code.el], [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}
/* 存档玩家名单。host：放内容的容器；o.modal：在弹窗里（搜索框放在内容顶部，不依赖世界页的工具行）；o.redraw：重画整块 */
function pxArchive(body, o) {
  o = o || {}; var redraw = o.redraw || pxRedrawAll;
  var st = pxGate(body, 'players', '玩家名单'); if (!st) return;
  if (o.modal) {
    var inp = kInput(st.query || '', function () {}, { placeholder: '搜索玩家（名字或 UUID）', onCommit: function (v) { st.query = v.trim(); st.status = 'idle'; redraw(); } });
    body.appendChild(h('div', { class: 'ed-tsearch px-msearch' }, [uiIcon('search', 12), inp]));
  } else pxListTools(st, 'players', '搜索玩家（名字或 UUID）');
  var raw = pxState('offline');
  if (PX.arch.rawFor && raw.loaded && raw.value) {
    var who = PX.arch.rawFor; PX.arch.rawFor = '';
    var ee = st.entries.filter(function (x) { return x.uuid === who; })[0] || { uuid: who, name: null };
    setTimeout(function () { pxRawModal(ee); }, 0);
  }
  var myPage = typeof WE !== 'undefined' && WE.w && WE.w.player && WE.w.player.self;
  body.appendChild(xSec('users', '存档里的玩家', st.total + ' 位'));
  st.entries.forEach(function (e) {
    var ex = PX.arch.exp[e.uuid], open = !!PX.arch.open[e.uuid], tags = [];
    if (e.self) tags.push(h('span', { class: 'k-tag', text: '你' }));
    if (e.online) tags.push(h('span', { class: 'k-tag', text: '在线' }));
    if (e.owner) tags.push(h('span', { class: 'k-tag dim', text: '房主' }));
    body.appendChild(xRow({ icon: uiIcon('user', 16), title: pxPlayerLabel(e), sub: e.uuid + (e.last_played_ms ? ' · ' + pxWhen(e.last_played_ms) : ''), tip: e.uuid, right: h('div', { class: 'k-row' }, tags), open: open,
      onHead: function () { PX.arch.open[e.uuid] = !open; if (!open && (!ex || ex.status === 'error')) pxExport(e); redraw(); },
      body: function () {
        var kids = [];
        if (!ex || ex.status === 'loading') kids.push(xEmpty('正在读取…'));
        else if (ex.status === 'error') kids.push(kHint(ex.err, 'err'));
        else {
          kids.push(pxSummaryBox(ex.summary));
          var acts = [];
          if (e.online && !e.self) acts.push(kBtn('查看详细数据', function () { if (typeof oriel !== 'undefined' && oriel.send) { oriel.send('open_world', { uuid: e.uuid }); if (PX.modal) { closeModal(); PX.modal = null; } } }, { cls: 'pri', icon: 'eye', title: '打开这位玩家的完整编辑页（和你自己的页面一样），左上角可以回到自己' }));
          else if (!e.online && !e.owner) acts.push(kBtn('查看详细数据', function () { pxOpenRaw(e); }, { cls: 'pri', icon: 'eye', title: '这位玩家不在线：查看并可编辑他的存档数据，写入前自动备份' }));
          acts.push(kBtn('复制到保险库', function () { pxSavePreset(e, function (en) { toast('已存入保险库：' + en.name, 'ok'); }); }, { icon: 'chest', title: '把这位玩家的背包、装备、末影箱、属性、效果、游戏模式存成预设' }));
          acts.push(kBtn('复制玩家 UUID', function () { pxCopyText(e.uuid, ' UUID'); }, { icon: 'copy', title: e.uuid }));
          if (!e.self && myPage) acts.push(kBtn('套用到我', function () { pxSavePreset(e, function (en) { vwSections(en); }); }, { icon: 'download', title: '先存入保险库，再选要套用的部分；套用前会检查你现在的数据有没有备份' }));
          kids.push(h('div', { class: 'world-actions' }, acts));
        }
        return kids;
      } }));
  });
  if (!st.entries.length) body.appendChild(xEmpty('没有匹配的玩家。'));
  pxMore(body, st, 'players');
  body.appendChild(xSec('search', '按 UUID 查找'));
  body.appendChild(xText({ title: '玩家 UUID', value: PX.off.uuid, placeholder: '00000000-0000-0000-0000-000000000000', cls: 'we-in', onCommit: function (v) {
    v = v.trim(); PX.off.uuid = v;
    if (/^[0-9a-fA-F-]{32,36}$/.test(v)) { var e = { uuid: v, name: null, online: false }; PX.arch.open[v] = true; pxExport(e); st.query = v; st.status = 'idle'; redraw(); }
  } }));
}
/* 保险库窗口里的入口：同一份名单，能直接打开玩家的编辑页 / 复制 UUID / 存成预设 */
function openPlayersModal() {
  var host = h('div', { class: 'px-modal' });
  function draw() { clear(host); pxArchive(host, { modal: true, redraw: draw }); }
  PX.modal = { redraw: draw }; PX.views.players = PX.views.players || null;
  var st = pxState('players'); st.status = 'idle';
  draw();
  openModal(modalShell('存档玩家', '这个存档里的所有玩家', [host], [h('div', { class: 'grow' }), kBtn('完成', function () { PX.modal = null; closeModal(); }, { cls: 'pri' })], 'wide'), true);
}
