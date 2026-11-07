/* 保险库（本机）：把改好的物品栈存起来，之后取出放进槽位 / 物品字段。协议见 docs/vault-contract.md（vault → vault.result）。
   存的是带类型的 SNBT 栈，取出的栈和 apply / 提示框 / 世界编辑收的格式完全一样（含 component_snbt），所以能原样放进任何物品槽。 */
var Vault = {
  seq: 0, wait: {}, st: { entries: null, bytes: 0, persisted: true, warning: '', storageError: '', readOnly: false }, undo: null,
  /* 发一个 vault 操作；cb(r)：r.ok 为真是成功，否则 r.error / r.reason。超时（游戏没回应）给 TIMEOUT */
  call: function (op, fields, cb, view) {
    var me = this, id = 'va' + (++this.seq) + '-' + Date.now(), msg = { op: op, requestId: id }, k;
    for (k in fields) msg[k] = fields[k];
    if (view) msg.view = view;
    function fail(code, why) { if (cb) cb({ ok: false, error: code, reason: why }); }
    if (typeof oriel === 'undefined' || !oriel.send) { fail('UNAVAILABLE', '没有连接游戏'); return; }
    var len; try { len = JSON.stringify(msg).length; } catch (e) { fail('BAD_REQUEST', '数据无法序列化'); return; }
    if (len > 7900) { fail('REQUEST_TOO_LARGE', '请求太大'); return; }
    var w = this.wait[id] = { cb: cb, t: setTimeout(function () { if (me.wait[id]) { delete me.wait[id]; fail('TIMEOUT', '游戏没有响应，可能还没进入世界或模组版本太旧'); } }, 8000) };
    var sent = false; try { sent = oriel.send('vault', msg); } catch (e) {}
    if (sent === false) { clearTimeout(w.t); delete this.wait[id]; fail('UNAVAILABLE', '宿主没有接受请求'); }
  },
  receive: function (r) {
    if (!r || !r.requestId) return;
    var w = this.wait[r.requestId]; if (!w) return;
    clearTimeout(w.t); delete this.wait[r.requestId];
    if (r.ok) {
      if (r.persisted !== undefined) this.st.persisted = !!r.persisted;
      this.st.readOnly = !!r.readOnly; this.st.warning = r.warning || ''; this.st.storageError = r.storageError || '';
      if (r.op === 'stats') { this.st.entries = r.entries; this.st.bytes = r.bytes; if (r.storage) this.st.storage = r.storage; }
    }
    if (w.cb) w.cb(r);
  },
  /* 把一段长文本分段上传（请求 8192 字符上限），回调拿到 token */
  upload: function (text, cb) {
    var me = this, pos = 0, token = null, CH = 2800;
    function next() {
      var piece = text.substring(pos, pos + CH);
      if (piece.length && pos + piece.length < text.length) { var c = piece.charCodeAt(piece.length - 1); if (c >= 0xD800 && c <= 0xDBFF) piece = piece.substring(0, piece.length - 1); }   // 不切开代理对
      var f = { text: piece }; if (token) f.token = token;
      me.call('upload', f, function (r) {
        if (!r.ok) { cb(r); return; }
        token = r.token; pos += piece.length;
        if (pos >= text.length) cb({ ok: true, token: token }); else next();
      });
    }
    next();
  },
  /* 存栈；太大自动走分段上传 */
  save: function (stack, meta, cb) {
    var f = { stack: stack }, k; meta = meta || {};
    for (k in meta) if (meta[k] !== undefined && meta[k] !== '') f[k] = meta[k];
    var small; try { small = JSON.stringify(f).length < 7000; } catch (e) { small = false; }
    if (small) { this.call('save', f, cb); return; }
    var me = this, up = JSON.stringify(stack), g = {}; for (k in meta) if (meta[k] !== undefined && meta[k] !== '') g[k] = meta[k];
    this.upload(up, function (r) { if (!r.ok) { cb(r); return; } g.uploadToken = r.token; me.call('save', g, cb); });
  },
  /* 取出完整的栈（编辑器 wire 格式）；get 超限就按 export 分页拼 */
  take: function (id, cb) {
    var me = this;
    this.call('get', { ids: [id] }, function (r) {
      if (r.ok) { var e = r.entries && r.entries[0]; if (e && e.stack) cb({ ok: true, stack: e.stack, entry: e }); else cb({ ok: false, error: 'NOT_FOUND', reason: '这一条已经不存在' }); return; }
      if (r.error !== 'RESPONSE_LIMIT') { cb(r); return; }
      var text = '', off = 0, rev = null;
      (function more() {
        me.call('export', { ids: [id], offset: off, limit: 3000 }, function (x) {
          if (!x.ok) { cb(x); return; }
          if (rev !== null && x.revision !== rev) { cb({ ok: false, error: 'CHANGED', reason: '读取过程中保险库变了，请重试' }); return; }
          rev = x.revision; text += x.text;
          if (!x.done) { off = x.nextOffset; more(); return; }
          try { var e = JSON.parse(text).entries[0]; cb({ ok: true, stack: e.stack, entry: e }); } catch (err) { cb({ ok: false, error: 'BAD_DATA', reason: '取出的数据无法解析' }); }
        });
      })();
    });
  }
};

/* ---------- 编辑器 wire 栈 → 原版嵌套 ItemStack（容器 / 装备 / 束袋里的物品）----------
   wire 栈的组件叫 comps（键不带 minecraft:），嵌套字段叫 components（完整 ID）；removed 写成 !完整ID。
   JSON 值取 comps；带类型的值同时登记成“手输类型”（nbtNote），提交时按类型输出。 */
function vaultNested(stack) {
  var out = { id: stack.id, count: stack.count || 1 }, comps = {}, any = false, sn = stack.component_snbt || {};
  Object.keys(stack.comps || {}).forEach(function (k) { comps[Reg.full(k)] = clone(stack.comps[k]); any = true; });
  Object.keys(stack.removed || {}).forEach(function (k) { comps['!' + Reg.full(k)] = {}; any = true; });
  if (any) out.components = comps;
  /* 类型：用 component_snbt 拼一份带类型的 SNBT，登记给 nbtMerge（按同值 JSON 匹配） */
  try {
    var parts = [];
    Object.keys(stack.comps || {}).forEach(function (k) { if (typeof sn[k] === 'string') parts.push(snbtKey(Reg.full(k)) + ':' + sn[k]); });
    if (parts.length) nbtNote('{id:' + snbtStr(stack.id) + ',count:' + (stack.count || 1) + ',components:{' + parts.join(',') + '}}');
  } catch (e) {}
  return out;
}

/* ---------- 窗口 ---------- */
/* 列表行下面一行：标签小标记 + 备注（一行，放不下就截断，完整内容在 tip / 展开里） */
function vaultMeta(e) {
  var tags = (e.tags || []), note = (e.note || '').replace(/s+/g, ' ').trim();
  if (!tags.length && !note) return null;
  var kids = tags.map(function (t) { return h('span', { class: 'k-tag dim', text: t }); });
  if (note) kids.push(h('span', { class: 'vt-note', text: note.length > 40 ? note.slice(0, 40) + '…' : note }));
  return h('div', { class: 'vt-meta' }, kids);
}
function vaultSummary(e) {
  var s = e.summary || {}, bits = [];
  if (s.enchantCount) bits.push('附魔 ' + s.enchantCount);
  if (s.hasCustomName) bits.push('自定义名');
  if (s.containerSize) bits.push('内含 ' + s.containerSize + ' 种');
  if (e.item && e.item.count > 1) bits.push('× ' + e.item.count);
  if (e.incompatible) bits.push('当前版本打不开');
  return bits.join(' · ');
}
var VaultGivePending = {};
function vInput(value, onCommit, ph) { var el = kInput(value, function () {}, { placeholder: ph }); el.classList.add('vt-in'); el.addEventListener('change', function () { onCommit(el.value); }); return el; }
function vaultErr(r) { toast((r && r.reason) || (r && r.error) || '保险库操作失败', 'error'); }

/* opts.pick(stack, entry)：作为选择器打开时，点「使用」把栈交出去；不传就是普通的保险库窗口 */
function openVault(opts) {
  opts = opts || {};
  var V = { query: '', tags: [], sort: 'recent', rows: [], total: 0, next: null, token: 0, open: -1 };
  var q = h('input', { class: 'k-input', type: 'text', placeholder: '搜索名称、标签、物品（支持拼音）', spellcheck: 'false' });
  var sbox = kSearchBox(q, function (v) { V.query = v; refresh(); });
  var tagBar = h('div', { class: 'k-chips vt-tags' }), list, stat = h('span', { class: 'k-sub vt-stat' }), warn = h('div', { class: 'vt-warn' });
  var sort = kSeg([{ v: 'recent', label: '最近' }, { v: 'name', label: '名称' }, { v: 'item', label: '物品' }], 'recent', function (v) { V.sort = v; refresh(); });
  var persistPoll = 0;
  function pollPersisted() {   // 后台落盘完成时游戏不会主动通知：还显示“正在保存…”就隔一会儿问一次
    if (Vault.st.persisted || persistPoll >= 12 || !$('modal')) return;
    persistPoll++; setTimeout(function () { Vault.call('stats', {}, function () { paintState(); }); }, 600);
  }
  function paintState() {
    stat.textContent = (Vault.st.entries === null ? '' : '共 ' + Vault.st.entries + ' 条') + (Vault.st.persisted ? '' : ' · 正在保存…');
    stat.setAttribute('title', Vault.st.storage ? '保存在：' + Vault.st.storage + '（这台电脑上所有存档和服务器共用）' : '');
    clear(warn);
    var w = Vault.st.storageError ? '保存到磁盘失败（' + Vault.st.storageError + '），修改保留在内存里，会自动重试' : Vault.st.readOnly ? '保险库文件版本比这个模组新，只读，不会被改动' : Vault.st.warning ? '保险库文件有问题：' + Vault.st.warning + '（原文件已另存，没有丢数据）' : '';
    if (w) warn.appendChild(h('div', { class: 'k-note bad', text: w }));
    pollPersisted();
  }
  function paintTags(tags) {
    clear(tagBar);
    (tags || []).forEach(function (t) {
      var on = V.tags.indexOf(t.name) >= 0, c = h('div', { class: 'k-chip' + (on ? ' on' : ''), text: t.name + ' ' + t.count });
      activate(c, function () { var i = V.tags.indexOf(t.name); if (i >= 0) V.tags.splice(i, 1); else V.tags.push(t.name); refresh(); });
      tagBar.appendChild(c);
    });
  }
  function load(append, tries) {
    if (append && V.next === null) return;
    var tok = ++V.token;
    Vault.call('list', { query: V.query, tags: V.tags, sort: V.sort, offset: append ? V.next : 0, limit: 40 }, function (r) {
      if (tok !== V.token) return;
      if (!r.ok) {
        if (r.error === 'NOT_READY' && (tries || 0) < 8) { setTimeout(function () { if (tok === V.token) load(append, (tries || 0) + 1); }, r.retryAfterMs || 500); return; }   // 文件还在加载：等一下再要，不把“还没读完”当成“是空的”
        if (!append) { V.rows = []; V.total = 0; V.next = null; } more.style.display = 'none'; xl.draw(); vaultErrRow(r); return;
      }
      clear(errBox);
      V.rows = append ? V.rows.concat(r.entries) : r.entries; V.total = r.total; V.next = r.done ? null : r.nextOffset;
      more.style.display = V.next === null ? 'none' : '';
      paintState(); xl.draw();
    }, 'vault');
  }
  function refresh() { V.open = -1; load(false); Vault.call('tags', {}, function (r) { if (r.ok) paintTags(r.tags); }); Vault.call('stats', {}, function () { paintState(); }); }
  var errBox = h('div', {});
  function vaultErrRow(r) { clear(errBox); errBox.appendChild(xEmpty((r.reason || r.error || '读取保险库失败') + (r.error === 'NOT_READY' ? '（文件还在加载，稍后再点一下搜索）' : ''))); }
  function takeAnd(e, fn) { Vault.take(e.id, function (r) { if (!r.ok) { vaultErr(r); return; } fn(r.stack, r.entry); }); }
  var xl = xList({
    items: function () { return V.rows; }, empty: V.query || V.tags.length ? '没有匹配的条目' : '保险库还是空的。编辑好物品后点上面的“存入当前物品”。',
    row: function (e, i) {
      var tagEls = (e.tags || []).map(function (t) { return h('span', { class: 'k-tag dim', text: t }); });
      var acts = h('div', { class: 'x-rt' }, []);
      if (opts.pick) acts.appendChild(kBtn('使用', function () { takeAnd(e, function (stack, entry) { closeModal(); opts.pick(stack, entry); }); }, { cls: 'pri', icon: 'check' }));
      else {
        var giveBtn = kBtn('给我', function () {
          if (VaultGivePending[e.id]) return;   // 回执回来之前不重复发，不然会给出好几份
          VaultGivePending[e.id] = true; giveBtn.classList.add('dis');
          Vault.call('give', { id: e.id, slot: 'inventory' }, function (r) {
            delete VaultGivePending[e.id]; giveBtn.classList.remove('dis');
            if (r.ok) toast(r.reason || '已放进背包', 'ok'); else vaultErr(r);
          });
        }, { icon: 'download', title: '放进背包的空位（创造模式直接写进你的背包；生存需要 OP 权限）' });
        acts.appendChild(giveBtn);
      }
      return { chevron: true, icon: itemIcon(e.item && e.item.id || 'minecraft:stick', 16), title: e.name, sub: vaultSummary(e) || (e.item && e.item.id) || '', tip: (e.note || '') + (e.translatedName ? '\n' + e.translatedName : ''), right: acts, meta: vaultMeta(e),
        body: function () {
          var nm = vInput(e.name || '', function (v) { if (!v.trim()) return; Vault.call('update', { id: e.id, name: v }, function (r) { if (r.ok) { e.name = v; paintState(); } else vaultErr(r); }); }, '名称');
          var tg = vInput((e.tags || []).join('，'), function (v) { var t = v.split(/[,，\s]+/).filter(function (x) { return x; }).slice(0, 8); Vault.call('update', { id: e.id, tags: t }, function (r) { if (r.ok) { e.tags = t; refresh();  xl.draw(); } else vaultErr(r); }); }, '标签，用逗号隔开（最多 8 个）');
          var nt = vInput(e.note || '', function (v) { Vault.call('update', { id: e.id, note: v }, function (r) { if (r.ok) { e.note = v; xl.draw(); } else vaultErr(r); }); }, '备注（最多 200 字）');
          var foot = h('div', { class: 'x2f' }, [h('span', { class: 'k-sub', text: tagEls.length ? '' : '没有标签' }),
            kBtn('复制一份', function () { Vault.call('duplicate', { id: e.id }, function (r) { if (r.ok) refresh(); else vaultErr(r); }); }, { icon: 'copy' }),
            kBtn('删除', function () { Vault.call('delete', { ids: [e.id] }, function (r) { if (r.ok) { Vault.undo = { token: r.token, until: Date.now() + 29000 }; toast('已删除，30 秒内可在窗口底部撤销', 'info'); refresh(); undoBar(); } else vaultErr(r); }); }, { cls: 'dng', icon: 'trash' })]);
          return [xField('edit', '名称', nm), xField('tag', '标签', tg), xField('list', '备注', nt), foot];
        } };
    }
  });
  var undoEl = h('div', {});
  function undoBar() {
    clear(undoEl);
    if (!Vault.undo || Date.now() > Vault.undo.until) return;
    undoEl.appendChild(h('div', { class: 'k-note' }, [h('span', { text: '刚删除了条目  ' }), kBtn('撤销删除', function () { var t = Vault.undo.token; Vault.undo = null; Vault.call('restore', { token: t }, function (r) { if (r.ok) { toast('已恢复', 'ok'); refresh(); clear(undoEl); } else vaultErr(r); }); }, { icon: 'undo' })]));
  }
  list = h('div', { class: 'vt-list' }, [xl.el, errBox]);
  var more = kBtn('显示更多', function () { load(true); }, { icon: 'down' }); more.style.display = 'none';
  var saveBtn = Store.docs && Store.docs.length ? kBtn('存入当前物品', function () { openVaultSave(function () { refresh(); }); }, { cls: 'pri', icon: 'plus' }) : null;
  var impBtn = kBtn('导入…', function () { openVaultImport(refresh); }, { icon: 'upload' });
  var expBtn = kBtn('导出全部', function () { vaultExport(); }, { icon: 'download' });
  var top = h('div', { class: 'vt-top' }, [sbox.el]);
  var body = [top, h('div', { class: 'vt-bar' }, [sort.el, saveBtn, h('div', { class: 'grow' }), stat]), tagBar, warn, undoEl, list, more];
  var win = modalShell('保险库', opts.pick ? '选一件放进去' : '存在这台电脑上，所有存档和服务器通用', body, [impBtn, expBtn, h('div', { class: 'grow' }), kBtn('完成', closeModal, { cls: 'pri' })], 'wide vtwin');
  openModal(win, !!opts.pick); windowify(win, 'vault');   // 和别的大窗口一样：能拖、能拉大小
  refresh(); paintState();
}

/* 存入当前物品：名称 / 标签 / 备注可以填，不填就用默认 */
function openVaultSave(done) {
  var d = Store.doc(); if (!d) { toast('没有正在编辑的物品', 'warn'); return; }
  var nm = kInput(displayName(d), function () {}, { placeholder: '名称' }), tg = kInput('', function () {}, { placeholder: '标签，用逗号隔开（可不填）' }), nt = kInput('', function () {}, { placeholder: '备注（可不填）' });
  function val(c) { return c.value || ''; }
  var go = kBtn('存入', function () {
    var tags = val(tg).split(/[,，\s]+/).filter(function (x) { return x; }).slice(0, 8);
    Vault.save(hostTipStack(d), { name: val(nm).trim(), tags: tags, note: val(nt) }, function (r) {
      if (!r.ok) { vaultErr(r); return; }
      closeModal(); toast(r.duplicate ? '保险库里已经有一模一样的了：' + r.entry.name : '已存入保险库：' + r.entry.name, 'ok');
      if (done) done();
    });
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell('存入保险库', itemNameOf(d), [fieldRow('名称', nm), fieldRow('标签', tg), fieldRow('备注', nt)], [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}
function itemNameOf(d) { return nameOfItem(d.id); }

/* 导入：粘贴导出的文本 */
function openVaultImport(done) {
  var ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false', placeholder: '粘贴从保险库导出的文本' }), msg = h('div', { class: 'k-sub' });
  var go = kBtn('导入', function () {
    var text = ta.value.trim(); if (!text) return;
    var okN = 0, bad = 0, off = 0;
    function page(tokenObj) {
      var f = { offset: off, limit: 32 }; if (tokenObj) f.uploadToken = tokenObj; else f.text = text;
      Vault.call('import', f, function (r) {
        if (!r.ok) { msg.textContent = r.reason || r.error; return; }
        (r.results || []).forEach(function (x) { if (x.ok) okN++; else bad++; });
        if (!r.done) { off = r.nextOffset; page(tokenObj); return; }
        closeModal(); toast('导入完成：' + okN + ' 条成功' + (bad ? '，' + bad + ' 条被拒绝（重复或格式不对）' : ''), bad ? 'warn' : 'ok'); if (done) done();
      });
    }
    if (text.length < 6500) page(null); else Vault.upload(text, function (u) { if (!u.ok) { msg.textContent = u.reason || u.error; return; } page(u.token); });
  }, { cls: 'pri', icon: 'upload' });
  openModal(modalShell('导入', '', [ta, msg], [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}
function vaultExport() {
  var text = '', off = 0, rev = null;
  (function more() {
    Vault.call('export', { all: true, offset: off, limit: 6000 }, function (x) {
      if (!x.ok) { vaultErr(x); return; }
      if (rev !== null && x.revision !== rev) { toast('导出过程中保险库变了，请重新导出', 'warn'); return; }
      rev = x.revision; text += x.text;
      if (!x.done) { off = x.nextOffset; more(); return; }
      if (Prefs.hostClip && typeof oriel !== 'undefined' && oriel.send) { oriel.send('clipboard', { text: text }); toast('已复制到剪贴板（' + text.length + ' 字符）。粘贴到文本文件里保存即可', 'ok'); return; }
      var ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false' }); ta.value = text;
      openModal(modalShell('导出', '全选复制，保存成文本文件', [ta], [h('div', { class: 'grow' }), kBtn('完成', closeModal, { cls: 'pri' })]), true);
    });
  })();
}
