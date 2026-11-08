/* 玩家扩展（P4-1）：位置 / 重生点 / 配方 / 成就 / 统计 / 离线玩家。
   协议见 docs/player-extended-contract.md。它是独立于 entity.player 的会话：每个视图单独读、单独应用，
   不进顶栏「应用修改」的草稿；服务端 saved 之后才清本地草稿，拒绝或超时保留。
   列表页（配方 / 成就 / 统计）的搜索框、重新读取、应用按钮放在顶部的工具行里（WE.toolsExtra），滚动时一直在。 */
var PX = { seq: 0, views: {}, pending: {}, off: { uuid: '' } };

function pxTarget(offline) {
  var w = WE.w, p = w && w.player;
  if (offline) return { uuid: PX.off.uuid, offline: true };
  if (p && p.self) return {};
  var u = w && w.slot && w.slot.uuid;
  return u ? { uuid: u } : null;
}
function pxSelf() { return !!(WE.w && WE.w.player && WE.w.player.self); }
function pxState(view) { return PX.views[view] || (PX.views[view] = { status: 'idle', draft: null, entries: [], offset: 0, query: '', total: 0, nextOffset: null, open: {}, dirty: {} }); }
function pxReset() { PX.views = {}; PX.pending = {}; }

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
  var st = pxState(p.view); st.busy = false; toastDismiss('px-pending');
  if (r.status === 'rejected') {
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
  if (weActive()) weRedrawBody();
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
function pxListTools(st, view, hint, extra) {
  var inp = kInput(st.query || '', function () {}, { placeholder: hint, onCommit: function (v) { st.query = v.trim(); st.status = 'idle'; weRedrawBody(); } });
  var n = pxChanged(st).length, nodes = [h('div', { class: 'ed-tsearch' }, [uiIcon('search', 12), inp])];
  (extra || []).forEach(function (x) { nodes.push(x); });
  nodes.push(kBtn('', function () { st.status = 'idle'; st.dirty = {}; weRedrawBody(); }, { icon: 'refresh', title: '放弃本页未应用的修改，重新从游戏读取' }));
  var ap = kBtn(n ? '应用 ' + n + ' 项' : '应用', function () { pxApplyDirty(st, view); }, { cls: 'pri', icon: 'check' });
  if (!n) ap.classList.add('dis');
  nodes.push(ap);
  WE.toolsExtra = nodes;
}
function pxMore(body, st, view) {
  if (st.nextOffset === null || st.nextOffset === undefined) return;
  body.appendChild(h('div', { class: 'world-actions' }, [kBtn('再加载 ' + Math.min(32, st.total - st.entries.length) + ' 项（共 ' + st.total + '）', function () { st.status = 'loading'; pxRead(view, { offset: st.nextOffset, append: true }); weRedrawBody(); }, { icon: 'down' })]));
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
  body.appendChild(xSec('compass', '位置', '「传送」会把玩家立刻送过去'));
  function num(key, title, o) { body.appendChild(xNum({ title: title, value: d[key], min: o.min, max: o.max, step: o.step || 1, dec: o.dec === undefined ? 2 : o.dec, noSlider: true, onChange: function (v) { d[key] = v; } })); }
  var dims = pxDims(st);
  if (dims.length) body.appendChild(xSelect({ title: '维度', options: dims, value: d.dimension, onChange: function (v) { d.dimension = v; }, width: 200 }));
  body.appendChild(xText({ title: '维度 ID', sub: '模组维度可以手动输入', value: d.dimension, cls: 'we-in', onCommit: function (v) { d.dimension = v.trim(); weRedrawBody(); } }));
  num('x', 'X', {}); num('y', 'Y', {}); num('z', 'Z', {}); num('yaw', '水平朝向', { min: -360, max: 360, dec: 1 }); num('pitch', '俯仰', { min: -90, max: 90, dec: 1 });
  body.appendChild(pxActions(st, 'position', '传送', function () { pxApply('position', clone(d)); }));
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
  body.appendChild(pxActions(st, 'respawn', '保存重生点', function () { pxApply('respawn', clone(d)); }, [kBtn('清除重生点', function () { pxApply('respawn', null); }, { icon: 'trash' })]));
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
  pxListTools(st, 'advancements', '搜索成就（名称或 ID）', [kBtn(inner ? '含内部成就 ✓' : '含内部成就', function () { st.displayed = inner ? true : false; st.status = 'idle'; weRedrawBody(); }, { title: '内部成就是配方解锁之类玩家界面里看不到的条目' })]);
  body.appendChild(xSec('trophy', '成就', st.total + ' 项 · 授予 / 收回会触发原版奖励和公告，无法撤销'));
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
  pxMore(body, st, 'advancements');
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

/* ---------- 离线玩家 ---------- */
function pxOffline(body) {
  var st = pxState('offline');
  body.appendChild(xSec('user', '离线玩家', '只能改此刻不在线的玩家；写入前会自动备份'));
  body.appendChild(xText({ title: '玩家 UUID', sub: '完整的 36 位 UUID', value: PX.off.uuid, placeholder: '00000000-0000-0000-0000-000000000000', cls: 'we-in', onCommit: function (v) { PX.off.uuid = v.trim(); st.status = 'idle'; st.value = null; st.loaded = false; st.draft = null; } }));
  body.appendChild(h('div', { class: 'world-actions' }, [kBtn('读取存档', function () { st.value = null; st.loaded = false; st.draft = null; pxRead('offline'); weRedrawBody(); }, { icon: 'search' })]));
  if (st.status === 'loading') { body.appendChild(xEmpty('正在读取…')); return; }
  if (st.err && !st.loaded) { body.appendChild(kHint(st.err, 'err')); return; }
  if (!st.loaded) { body.appendChild(xEmpty('输入 UUID 后点「读取存档」。')); return; }
  var keys = (st.schema && st.schema.editableKeys) || [];
  body.appendChild(kHint('可以改的字段：' + (keys.join('、') || '无') + '。身份、位置、成就这类字段不通过这里修改。', 'sub'));
  var code = kCode({ value: st.draft === null || st.draft === undefined ? nbtPrint(nbtParse(st.value.snbt), true) : st.draft, height: 260, validate: function (t) { nbtParse(t); }, onInput: function (t) { st.draft = t; } });
  body.appendChild(code.el);
  body.appendChild(h('div', { class: 'world-actions' }, [kBtn('写入离线存档', function () {
    var text = code.get();
    try { pxApply('offline', { snbt: nbtPrint(nbtParse(text), false) }); } catch (e) { toast('SNBT 有误，没有提交：' + (e.message || e), 'error'); }
  }, { cls: 'pri', icon: 'check' })]));
}
