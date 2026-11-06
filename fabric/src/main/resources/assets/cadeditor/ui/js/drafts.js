/* 草稿自动保存：没有应用的修改每隔一会儿写进宿主的偏好文件（config/cadeditor-ui.json），关掉编辑器再打开可以恢复。
   协议见 docs/registry-contract.md「草稿持久化」。没有宿主（浏览器预览）时什么都不做。 */
var Drafts = {
  timer: null, queue: [], busy: false, upSeq: 0, keyWritten: {},
  on: function () { return typeof oriel !== 'undefined' && oriel.send && Prefs.host; },
  keyOf: function (d) {
    var s = d && d.src; if (!s || typeof s !== 'object') return null;
    return [s.kind || '', s.index === undefined ? '' : s.index, s.menuId === undefined ? '' : s.menuId].join(':') + '|' + fullId(d.id);
  },
  /* 编辑过就排队保存；改回原样或已应用就清掉草稿 */
  touch: function () {
    if (!this.on()) return;
    clearTimeout(this.timer);
    var me = this; this.timer = setTimeout(function () { me.flush(); }, 1500);
  },
  flush: function () {
    var d = Store.doc(); if (!d) return;
    var key = this.keyOf(d); if (!key) return;
    if (snapOf(d) === d.base) { if (this.keyWritten[key] || (Prefs.vals.drafts && Prefs.vals.drafts[key] !== undefined)) { this.keyWritten[key] = false; this.send({ op: 'clear', key: key }); } return; }
    var value = JSON.stringify({ v: 1, t: Date.now(), id: d.id, count: d.count, comps: d.comps, removed: d.removed, base: d.base });
    this.keyWritten[key] = true;
    var msg = { op: 'put', key: key, value: value };
    if (JSON.stringify(msg).length <= 7000) { this.send(msg); return; }
    /* 大草稿分块：每块序列化后都要小于 8192 字符；一块块等回执 */
    var up = 'u' + (++this.upSeq) + '-' + Date.now(), step = 2800, list = [{ op: 'begin', key: key, upload: up, length: value.length }];
    for (var o = 0; o < value.length; o += step) list.push({ op: 'chunk', upload: up, offset: o, value: value.substring(o, o + step), done: o + step >= value.length });
    this.queue = list; this.pump();
  },
  send: function (m) { try { oriel.send('drafts', m); } catch (e) {} },
  pump: function () { if (this.busy || !this.queue.length) return; this.busy = true; this.send(this.queue.shift()); },
  onResult: function (r) {
    if (!r || typeof r !== 'object') return;
    if (r.op === 'begin' || r.op === 'chunk') {
      if (r.status === 'accepted') { this.busy = false; this.pump(); }
      else { this.busy = false; this.queue = []; toast('草稿没能保存：' + (r.reason || '宿主拒绝了'), 'warn'); }
    } else if (r.status === 'rejected' && r.op === 'put') toast('草稿没能保存：' + (r.reason || '宿主拒绝了'), 'warn');
  },
  attach: function () {
    if (typeof oriel === 'undefined' || !oriel.on) return;
    var me = this;
    oriel.on('patch', function (p) { if (!p) return; if (p.key === 'drafts.result') me.onResult(p.value); else if (p.key === 'prefs' && p.value && typeof p.value === 'object') Prefs.vals.drafts = p.value.drafts || {}; });
    oriel.on('data', function (data, key) { if (key === 'drafts.result') me.onResult(data && data[key] !== undefined ? data[key] : data); });
  },
  /* 打开物品时：如果有没应用的草稿，问要不要恢复 */
  offer: function (d) {
    if (!this.on() || !d) return;
    var key = this.keyOf(d), all = Prefs.vals.drafts;
    if (!key || !all || typeof all[key] !== 'string') return;
    var dr; try { dr = JSON.parse(all[key]); } catch (e) { return; }
    if (!dr || dr.v !== 1) return;
    if (dr.base !== d.base) { this.send({ op: 'clear', key: key }); return; }   // 物品在两次编辑之间已经变了，旧草稿不再适用
    var ago = Math.max(1, Math.round((Date.now() - (dr.t || 0)) / 60000)), n = Object.keys(dr.comps || {}).length + Object.keys(dr.removed || {}).length;
    var me = this;
    var ok = kBtn('恢复', function () {
      closeModal();
      if (fullId(dr.id) !== d.id) Store.setItem(fullId(dr.id));
      if (dr.count !== d.count) Store.setCount(dr.count);
      Store.replace(dr.comps || {}, dr.removed || {}, '恢复草稿');
      toast('已恢复上次没应用的修改', 'ok');
    }, { cls: 'pri', icon: 'check' });
    var no = kBtn('丢弃', function () { closeModal(); me.send({ op: 'clear', key: key }); }, { icon: 'trash' });
    var win = modalShell('有没应用的修改', '', [h('div', { class: 'k-sub', text: '上次编辑这件物品时有 ' + n + ' 项改动没有应用到游戏（约 ' + ago + ' 分钟前）。要接着改吗？' })], [h('div', { class: 'grow' }), no, ok], 'k-narrow');
    openModal(win);
  },
};
