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
    if (typeof oriel === 'undefined' || !oriel.send) { fail('UNAVAILABLE', I18n.t("cadeditor.ui.vault.5ab6af62fc")); return; }
    var len; try { len = JSON.stringify(msg).length; } catch (e) { fail('BAD_REQUEST', I18n.t("cadeditor.ui.vault.cd9476aae6")); return; }
    if (len > 7900) { fail('REQUEST_TOO_LARGE', I18n.t("cadeditor.ui.vault.cb846fc8ac")); return; }
    var w = this.wait[id] = { cb: cb, t: setTimeout(function () { if (me.wait[id]) { delete me.wait[id]; fail('TIMEOUT', op === 'give' ? I18n.t("cadeditor.ui.vault.7eb1b91a20") : I18n.t("cadeditor.ui.vault.8e740a2bb0")); } }, op === 'give' ? 12000 : 8000) };
    var sent = false; try { sent = oriel.send('vault', msg); } catch (e) {}
    if (sent === false) { clearTimeout(w.t); delete this.wait[id]; fail('UNAVAILABLE', I18n.t("cadeditor.ui.vault.c8da8c3b3d")); }
  },
  receive: function (r) {
    if (!r || !r.requestId) return;
    var w = this.wait[r.requestId]; if (!w) return;
    clearTimeout(w.t); delete this.wait[r.requestId];
    if (r.ok) {
      if (typeof r.giveCapability === 'string') this.st.giveCapability = r.giveCapability;
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
  /* 存一只生物：snbt 是带类型的实体 SNBT 文本（后端会剔除 UUID / 位置 / 乘客等运行时字段，剔除了什么在回执 stripped 里） */
  saveEntity: function (snbt, meta, cb) {
    var f = { kind: 'entity', snbt: snbt }, k; meta = meta || {};
    for (k in meta) if (meta[k] !== undefined && meta[k] !== '') f[k] = meta[k];
    if (JSON.stringify(f).length < 7000) { this.call('save', f, cb); return; }
    var me = this, g = { kind: 'entity' }; for (k in meta) if (meta[k] !== undefined && meta[k] !== '') g[k] = meta[k];
    this.upload(snbt, function (r) { if (!r.ok) { cb(r); return; } g.uploadToken = r.token; me.call('save', g, cb); });
  },
  /* 取出一只生物的 SNBT 文本 */
  takeEntity: function (id, cb) {
    this.call('get', { ids: [id] }, function (r) {
      if (!r.ok) { cb(r); return; }
      var e = r.entries && r.entries[0];
      if (e && typeof e.snbt === 'string') cb({ ok: true, snbt: e.snbt, entry: e }); else cb({ ok: false, error: 'NOT_FOUND', reason: I18n.t("cadeditor.ui.vault.bfbc9d688b") });
    });
  },
  /* 取出完整的栈（编辑器 wire 格式）；get 超限就按 export 分页拼 */
  take: function (id, cb) {
    var me = this;
    this.call('get', { ids: [id] }, function (r) {
      if (r.ok) { var e = r.entries && r.entries[0]; if (e && e.stack) cb({ ok: true, stack: e.stack, entry: e }); else cb({ ok: false, error: 'NOT_FOUND', reason: I18n.t("cadeditor.ui.vault.82294d4800") }); return; }
      if (r.error !== 'RESPONSE_LIMIT') { cb(r); return; }
      var text = '', off = 0, rev = null;
      (function more() {
        me.call('export', { ids: [id], offset: off, limit: 3000 }, function (x) {
          if (!x.ok) { cb(x); return; }
          if (rev !== null && x.revision !== rev) { cb({ ok: false, error: 'CHANGED', reason: I18n.t("cadeditor.ui.vault.d0759fc3f6") }); return; }
          rev = x.revision; text += x.text;
          if (!x.done) { off = x.nextOffset; more(); return; }
          try { var e = JSON.parse(text).entries[0]; cb({ ok: true, stack: e.stack, entry: e }); } catch (err) { cb({ ok: false, error: 'BAD_DATA', reason: I18n.t("cadeditor.ui.vault.41781b29e4") }); }
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
  var values = nbtHydrate(stack.comps || {}, sn);
  Object.keys(values).forEach(function (k) { nbtPut(comps, Reg.full(k), nbtTake(values, k)); any = true; });
  Object.keys(stack.removed || {}).forEach(function (k) { comps['!' + Reg.full(k)] = {}; any = true; });
  if (any) out.components = comps;
  return out;
}

/* ---------- 窗口 ---------- */
/* 列表行下面一行：标签小标记 + 备注（一行，放不下就截断，完整内容在 tip / 展开里） */
function vaultMeta(e, isEnt) {
  var tags = (e.tags || []), note = (e.note || '').replace(/s+/g, ' ').trim();
  if (!tags.length && !note && !isEnt) return null;
  var kids = []; if (isEnt) kids.push(h('span', { class: 'k-tag', text: 'SNBT', title: I18n.t("cadeditor.ui.vault.34346f4dcc") }));
  tags.forEach(function (t) { kids.push(h('span', { class: 'k-tag dim', text: t })); });
  if (note) kids.push(h('span', { class: 'vt-note', text: note.length > 40 ? note.slice(0, 40) + '…' : note }));
  return h('div', { class: 'vt-meta' }, kids);
}
/* 生物条目：从保险库取出的 SNBT 文本 → 编辑器里用的 JSON（类型后缀登记成手输类型，提交时整段按 SNBT 输出） */
function vaultEntityObj(snbt) { return parseSnbtUser(snbt); }
/* 乘客需要独立 type，但初始数据仍须逐节点保留 byte/float/long/数组。不能经过普通 JSON 打印。 */
function vaultEntityPayload(snbt) {
  var tree = nbtParse(snbt);
  if (tree.k !== 'obj') throw new Error(I18n.t("cadeditor.ui.vault.bf2d64a9f0"));
  var id = tree.map.id;
  if (!id || id.k !== 'str' || !id.v) throw new Error(I18n.t("cadeditor.ui.vault.76fcee4032"));
  delete tree.map.id; tree.keys = tree.keys.filter(function (key) { return key !== 'id'; });
  return { type: id.v, snbt: nbtPrint(tree, false) };
}
function vaultEntInfo(e) { var s = e.summary || e.entity || {}; return { id: e.entityId || s.id || (e.entity && e.entity.id) || '', s: s }; }
function vaultEntitySummary(e) {
  var i = vaultEntInfo(e), s = i.s, bits = [];
  if (i.id) bits.push(entityName(i.id));
  if (s.baby) bits.push(I18n.t("cadeditor.ui.vault.24bea1d12b"));
  if (s.hasCustomName) bits.push(I18n.t("cadeditor.ui.vault.40b4f5ccc3"));
  if (s.equipmentCount) bits.push(I18n.t("cadeditor.ui.vault.234dc54bb1", (s.equipmentCount)));
  if (s.attributeCount) bits.push(I18n.t("cadeditor.ui.vault.7966586cad", (s.attributeCount)));
  if (s.effectCount) bits.push(I18n.t("cadeditor.ui.vault.f90556fed7", (s.effectCount)));
  return bits.join(' · ');
}
/* 方块 / 玩家预设条目：摘要键见 docs/vault-contract.md（block、blockStateFields、nbtFields；sections、counts） */
function vaultOtherIcon(e) { var s = e.summary || {}; return e.kind === 'block' ? itemIcon(shortId(s.block || 'minecraft:stone'), 16) : uiIcon('user', 16); }
function vaultOtherSummary(e) {
  var s = e.summary || {}, bits = [];
  if (e.kind === 'block') { if (s.block) bits.push(nameOf('block', shortId(s.block)) || humanId(s.block)); if (s.blockStateFields) bits.push(I18n.t("cadeditor.ui.vault.94c65fcf5a", (s.blockStateFields))); if (s.nbtFields) bits.push(I18n.t("cadeditor.ui.vault.00aec7c35f", (s.nbtFields))); }
  else (s.sections || []).forEach(function (k) { var n = s.counts && s.counts[k]; bits.push((Labels.vaultSection[k] || k) + (n ? ' ' + n : '')); });
  return bits.join(' · ');
}
function vaultSummary(e) {
  var s = e.summary || {}, bits = [];
  if (s.enchantCount) bits.push(I18n.t("cadeditor.ui.vault.e1a2e07baa", (s.enchantCount)));
  if (s.hasCustomName) bits.push(I18n.t("cadeditor.ui.vault.62f9d0c12e"));
  if (s.containerSize) bits.push(I18n.t("cadeditor.ui.vault.27df4d37dc", (s.containerSize)));
  if (e.item && e.item.count > 1) bits.push('× ' + e.item.count);
  if (e.incompatible) bits.push(I18n.t("cadeditor.ui.vault.4b98ca70b9"));
  return bits.join(' · ');
}
var VaultGivePending = {};
function vInput(value, onCommit, ph) { var el = kInput(value, function () {}, { placeholder: ph, onCommit: onCommit }); el.classList.add('vt-in'); return el; }
function vaultErr(r) { toast((r && r.reason) || (r && r.error) || I18n.t("cadeditor.ui.vault.7e9f8e6d11"), 'error'); }

/* opts.pick(stack, entry)：作为选择器打开时，点「使用」把栈交出去；不传就是普通的保险库窗口 */
function openVault(opts) {
  opts = opts || {};
  var V = { query: '', tags: [], sort: 'recent', rows: [], total: 0, next: null, token: 0, open: -1, kind: opts.pickEntity || opts.kind === 'entity' ? 'entity' : (opts.kind === 'block' || opts.kind === 'player_preset' ? opts.kind : 'item') };
  var fixedKind = !!(opts.pick || opts.pickEntity || opts.pickEntry);   // 作为选择器打开时只看对应的一类
  var q = h('input', { class: 'k-input', type: 'text', placeholder: I18n.t("cadeditor.ui.vault.c4791fad1a"), spellcheck: 'false' });
  var sbox = kSearchBox(q, function (v) { V.query = v; refresh(); });
  var tagBar = h('div', { class: 'k-chips vt-tags' }), list, stat = h('span', { class: 'k-sub vt-stat' }), warn = h('div', { class: 'vt-warn' });
  var sort = kSeg([{ v: 'recent', label: I18n.t("cadeditor.ui.vault.997a5e6e51") }, { v: 'name', label: I18n.t("cadeditor.ui.cards1.d44e9b3d3b") }, { v: 'item', label: I18n.t("cadeditor.ui.labels.ba40014ff4") }], 'recent', function (v) { V.sort = v; refresh(); });
  var persistPoll = 0, pickingEntity = false, pickMask;
  function pollPersisted() {   // 后台落盘完成时游戏不会主动通知：还显示“正在保存…”就隔一会儿问一次
    if (Vault.st.persisted || persistPoll >= 12 || !$('modal')) return;
    persistPoll++; setTimeout(function () { Vault.call('stats', {}, function () { paintState(); }); }, 600);
  }
  function paintState() {
    stat.textContent = (Vault.st.entries === null ? '' : I18n.t("cadeditor.ui.vault.336a1a82d0", (Vault.st.entries))) + (Vault.st.persisted ? '' : I18n.t("cadeditor.ui.vault.fd51c3a891"));
    setTip(stat, Vault.st.storage ? I18n.t("cadeditor.ui.vault.73f8eaaea1", (Vault.st.storage)) : '');
    clear(warn);
    var w = Vault.st.storageError ? I18n.t("cadeditor.ui.vault.55985c19f0", (Vault.st.storageError)) : Vault.st.readOnly ? I18n.t("cadeditor.ui.vault.a554471fc5") : Vault.st.warning ? I18n.t("cadeditor.ui.vault.b88ba015fd", (Vault.st.warning)) : '';
    if (w) warn.appendChild(h('div', { class: 'vt-msg bad', text: w }));
    if (!fixedKind && V.kind === 'item' && Vault.st.giveCapability) warn.appendChild(h('div', { class: 'vt-msg', text: Vault.st.giveCapability }));
    pollPersisted();
  }
  var tagsOpen = false, tagBtn = kBtn(I18n.t("cadeditor.ui.eschema.1d0fd5f933"), function () { tagsOpen = !tagsOpen; tagBar.style.display = tagsOpen ? '' : 'none'; }, { icon: 'tag', title: I18n.t("cadeditor.ui.vault.234b0b84e2") });
  tagBar.style.display = 'none'; tagBtn.style.display = 'none';
  function paintTagBtn() { clear(tagBtn); tagBtn.appendChild(uiIcon('tag', 12)); tagBtn.appendChild(h('span', { text: V.tags.length ? I18n.t("cadeditor.ui.vault.b4e29c715a", (V.tags.length)) : I18n.t("cadeditor.ui.eschema.1d0fd5f933") })); tagBtn.classList.toggle('on', V.tags.length > 0); }
  function paintTags(tags) {
    clear(tagBar); tagBtn.style.display = (tags || []).length ? '' : 'none'; if (!(tags || []).length) { tagsOpen = false; tagBar.style.display = 'none'; } paintTagBtn();
    (tags || []).forEach(function (t) {
      var on = V.tags.indexOf(t.name) >= 0, c = h('div', { class: 'k-chip' + (on ? ' on' : ''), text: t.name + ' ' + t.count });
      activate(c, function () { var i = V.tags.indexOf(t.name); if (i >= 0) V.tags.splice(i, 1); else V.tags.push(t.name); refresh(); });
      tagBar.appendChild(c);
    });
  }
  function load(append, tries) {
    if (append && V.next === null) return;
    var tok = ++V.token;
    if (!append) { clear(errBox); errBox.appendChild(kLoadingRow(I18n.t("cadeditor.ui.vault.bf6ab0af32"))); }   // 读完（或失败）时 errBox 会被清掉 / 换成错误提示
    Vault.call('list', { kind: V.kind, query: V.query, tags: V.tags, sort: V.sort, offset: append ? V.next : 0, limit: 40 }, function (r) {
      if (tok !== V.token) return;
      if (!r.ok) {
        if (r.error === 'NOT_READY' && (tries || 0) < 8) { setTimeout(function () { if (tok === V.token) load(append, (tries || 0) + 1); }, r.retryAfterMs || 500); return; }   // 文件还在加载：等一下再要，不把“还没读完”当成“是空的”
        if (!append) { V.rows = []; V.total = 0; V.next = null; } more.style.display = 'none'; xl.draw(); vaultErrRow(r); return;
      }
      clear(errBox);
      /* 两类条目分开：生物页只留 kind==='entity' 的，物品页不要 entity。旧版本的游戏不认 kind，会把物品原样返回——那时生物页给出说明，不把物品当生物 */
      var got = r.entries || [], mine = got.filter(function (x) { return V.kind === 'item' ? (x.kind === undefined || x.kind === 'item') : x.kind === V.kind; });
      if (V.kind !== 'item' && got.length && !got.some(function (x) { return x.kind !== undefined; })) { mine = []; V.legacy = true; } else V.legacy = false;
      r = Object.assign({}, r, { entries: mine, total: V.legacy ? 0 : r.total });
      V.rows = append ? V.rows.concat(r.entries) : r.entries; V.total = r.total; V.next = r.done ? null : r.nextOffset;
      more.style.display = V.next === null ? 'none' : '';
      paintState(); xl.draw();
    }, 'vault');
  }
  function refresh() { V.open = -1; load(false); Vault.call('tags', {}, function (r) { if (r.ok) paintTags(r.tags); }); Vault.call('stats', {}, function () { paintState(); }); }
  var errBox = h('div', {});
  function vaultErrRow(r) { clear(errBox); errBox.appendChild(xEmpty((r.reason || r.error || I18n.t("cadeditor.ui.vault.9b343ce02d")) + (r.error === 'NOT_READY' ? I18n.t("cadeditor.ui.vault.e998734752") : ''))); }
  function takeAnd(e, fn) { Vault.take(e.id, function (r) { if ($('modal') !== pickMask) return; if (!r.ok) { vaultErr(r); return; } fn(r.stack, r.entry); }); }
  function editAndUse(e, entity) {
    if (pickingEntity) return;
    var valid = nestedDraftGuard(); pickingEntity = true;
    function received(r) {
      pickingEntity = false;
      if ($('modal') !== pickMask) return;
      if (!r.ok) { vaultErr(r); return; }
      if (!valid()) { toast(I18n.t("cadeditor.ui.vault.f7ce0f6b1c"), 'warn'); return; }
      function use(value) { if ($('modal') !== pickMask) return; closeModal(); if (entity) opts.pickEntity(value, r.entry); else opts.pick(value, r.entry); }
      if (entity) openEntityDraft(r.snbt, { title: e.name || I18n.t("cadeditor.ui.eschema.7de591c132"), valid: valid, commit: use });
      else openNestedItem(r.stack, { title: e.name || I18n.t("cadeditor.ui.cards3.7f559289d4"), commitUnchanged: true, valid: valid, commit: use });
    }
    if (entity) Vault.takeEntity(e.id, received); else Vault.take(e.id, received);
  }
  var xl = xList({
    items: function () { return V.rows; }, empty: V.legacy ? I18n.t("cadeditor.ui.vault.bfc73b763d") : V.query || V.tags.length ? I18n.t("cadeditor.ui.vault.4031b1da23") : V.kind === 'block' ? I18n.t("cadeditor.ui.vault.11d652b1bf") : V.kind === 'player_preset' ? I18n.t("cadeditor.ui.vault.d0d235a74f") : V.kind === 'entity' ? I18n.t("cadeditor.ui.vault.e44a6782fe") : I18n.t("cadeditor.ui.vault.b1874b26f1"),
    row: function (e, i) {
      var tagEls = (e.tags || []).map(function (t) { return h('span', { class: 'k-tag dim', text: t }); });
      var acts = h('div', { class: 'x-rt' }, []);
      var isEnt = V.kind === 'entity';
      var isOther = V.kind === 'block' || V.kind === 'player_preset';
      if (isOther) {
        if (opts.pickEntry) acts.appendChild(kBtn(I18n.t("cadeditor.ui.vault.77af807d6a"), function () { opts.pickEntry(e); }, { cls: 'pri', icon: 'check' }));
        else if (V.kind === 'player_preset') acts.appendChild(kBtn(I18n.t("cadeditor.ui.vault.8d3d75ebc0"), function () { vwApplyToSelf(e); }, { icon: 'download', title: I18n.t("cadeditor.ui.vault.87477e553b") }));
      }
      else if (isEnt && opts.pickEntity) acts.appendChild(kBtn(I18n.t("cadeditor.ui.vault.cdfd0b34e4"), function () {
        if (pickingEntity) return; pickingEntity = true;
        Vault.takeEntity(e.id, function (r) {
          pickingEntity = false;
          if ($('modal') !== pickMask) return; // Cancelled/replaced: discard late reads silently.
          if (!r.ok) { vaultErr(r); return; }
          closeModal(); opts.pickEntity(r.snbt, r.entry);
        });
      }, { cls: 'pri', icon: 'check' }));
      else if (isEnt) { /* 生物条目在窗口里只管理；取出在各处“选择生物”里 */ }
      else if (opts.pick) acts.appendChild(kBtn(I18n.t("cadeditor.ui.vault.cdfd0b34e4"), function () { takeAnd(e, function (stack, entry) { closeModal(); opts.pick(stack, entry); }); }, { cls: 'pri', icon: 'check' }));
      else {
        var giveBtn = kBtn(I18n.t("cadeditor.ui.vault.22e840cf33"), function () {
          if (VaultGivePending[e.id]) return;   // 回执回来之前不重复发，不然会给出好几份
          VaultGivePending[e.id] = true; giveBtn.classList.add('dis');
          Vault.call('give', { id: e.id, slot: 'inventory' }, function (r) {
            delete VaultGivePending[e.id]; giveBtn.classList.remove('dis');
            if (r.ok) toast(r.reason || I18n.t("cadeditor.ui.vault.d963df6fa6"), 'ok'); else vaultErr(r);
          });
        }, { icon: 'download', title: I18n.t("cadeditor.ui.vault.a3580a2241") });
        acts.appendChild(giveBtn);
      }
      if ((isEnt && opts.pickEntity) || (!isEnt && !isOther && opts.pick)) acts.appendChild(kBtn(I18n.t("cadeditor.ui.vault.5c0bf39ed3"), function () { editAndUse(e, isEnt); }, { icon: 'edit' }));
      var entI = isEnt ? vaultEntInfo(e) : null;
      return { chevron: true, icon: isOther ? vaultOtherIcon(e) : isEnt ? entityIcon(entI.id || 'minecraft:pig', 16) : itemIcon(e.item && e.item.id || 'minecraft:stick', 16), title: e.name, sub: isOther ? vaultOtherSummary(e) : isEnt ? (vaultEntitySummary(e) || entI.id) : (vaultSummary(e) || (e.item && e.item.id) || ''), tip: (e.note || '') + (e.translatedName ? '\n' + e.translatedName : ''), right: acts, meta: vaultMeta(e, isEnt),
        body: function () {
          var nm = vInput(e.name || '', function (v) { if (!v.trim()) return; Vault.call('update', { id: e.id, name: v }, function (r) { if (r.ok) { e.name = v; paintState(); } else vaultErr(r); }); }, I18n.t("cadeditor.ui.cards1.d44e9b3d3b"));
          var tg = vInput((e.tags || []).join('，'), function (v) { var t = splitTags(v).slice(0, 8); Vault.call('update', { id: e.id, tags: t }, function (r) { if (r.ok) { e.tags = t; refresh();  xl.draw(); } else vaultErr(r); }); }, I18n.t("cadeditor.ui.vault.c323e24416"));
          var nt = vInput(e.note || '', function (v) { Vault.call('update', { id: e.id, note: v }, function (r) { if (r.ok) { e.note = v; xl.draw(); } else vaultErr(r); }); }, I18n.t("cadeditor.ui.vault.00552c83e3"));
          var copyBtn = kBtn(I18n.t("cadeditor.ui.vault.9587076ee6"), function () { Vault.call('duplicate', { id: e.id }, function (r) { if (r.ok) refresh(); else vaultErr(r); }); }, { icon: 'copy' });
          var delBtn = kBtn(I18n.t("cadeditor.ui.common.delete"), function () { Vault.call('delete', { ids: [e.id] }, function (r) { if (r.ok) { Vault.undo = { token: r.token, until: Date.now() + 29000 }; toast(I18n.t("cadeditor.ui.vault.04490543c2"), 'info'); refresh(); undoBar(); } else vaultErr(r); }); }, { cls: 'dng', icon: 'trash' });
          function vf(label, el) { return h('div', { class: 'vt-f' }, [h('span', { class: 'k-sub', text: label }), el]); }
          var acts = [copyBtn, delBtn];
          if (e.kind === 'player_preset') acts.unshift(kBtn(I18n.t("cadeditor.ui.vault.ae81e1b269"), function () { if (typeof oriel !== 'undefined' && oriel.send) { oriel.send('open_world', { vault_id: e.id }); closeModal(); } }, { cls: 'pri', icon: 'eye', title: I18n.t("cadeditor.ui.vault.8659ba8d20") }));
          return [h('div', { class: 'vt-det' }, [vf(I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), nm), vf(I18n.t("cadeditor.ui.eschema.1d0fd5f933"), tg), vf(I18n.t("cadeditor.ui.vault.daede98817"), nt), h('div', { class: 'vt-act' }, acts)])];
        } };
    }
  });
  var undoEl = h('div', {});
  function undoBar() {
    clear(undoEl);
    if (!Vault.undo || Date.now() > Vault.undo.until) return;
    undoEl.appendChild(h('div', { class: 'vt-msg' }, [h('span', { text: I18n.t("cadeditor.ui.vault.a5b0ad55b1") }), kBtn(I18n.t("cadeditor.ui.vault.d1ff25a76b"), function () { var t = Vault.undo.token; Vault.undo = null; Vault.call('restore', { token: t }, function (r) { if (r.ok) { toast(I18n.t("cadeditor.ui.vault.3617f737f4"), 'ok'); refresh(); clear(undoEl); } else vaultErr(r); }); }, { icon: 'undo' })]));
  }
  list = h('div', { class: 'vt-list' }, [xl.el, errBox]);
  var more = kBtn(I18n.t("cadeditor.ui.vault.331af79f34"), function () { load(true); }, { icon: 'down' }); more.style.display = 'none';
  var saveBtn = kBtn(I18n.t("cadeditor.ui.vault.8cdec4d718"), function () { openVaultSave(function () { refresh(); }); }, { cls: 'pri', icon: 'plus' });
  if (!(Store.docs && Store.docs.length) || V.kind !== 'item' || opts.pickEntity) saveBtn.style.display = 'none';
  var impBtn = kBtn(I18n.t("cadeditor.ui.vault.1b9818e1ad"), function () { openVaultImport(refresh); }, { icon: 'upload' });
  var expBtn = kBtn(I18n.t("cadeditor.ui.vault.d97210c260"), function () { vaultExport(); }, { icon: 'download' });
  var kindSeg = fixedKind ? null : kSeg([{ v: 'item', label: I18n.t("cadeditor.ui.pages.7c89d6ebe1"), icon: 'backpack' }, { v: 'entity', label: I18n.t("cadeditor.ui.screens.61aacd674a"), icon: 'paw' }, { v: 'block', label: I18n.t("cadeditor.ui.picker.2753766d18"), icon: 'cube' }, { v: 'player_preset', label: I18n.t("cadeditor.ui.vault.d4f6dca6d8"), icon: 'user' }], V.kind, function (v) { V.kind = v; V.tags = []; saveBtn.style.display = v === 'item' && Store.docs && Store.docs.length ? '' : 'none'; q.setAttribute('placeholder', v === 'entity' ? I18n.t("cadeditor.ui.vault.ac46bde162") : v === 'block' ? I18n.t("cadeditor.ui.vault.72743a0e26") : v === 'player_preset' ? I18n.t("cadeditor.ui.vault.25368377db") : I18n.t("cadeditor.ui.vault.c4791fad1a")); refresh(); }).el;
  var body = [h('div', { class: 'vt-bar' }, [kindSeg, sbox.el, sort.el, tagBtn, stat]), tagBar, warn, list, more];
  var win = modalShell(I18n.t("cadeditor.ui.common.vault"), opts.pickEntity ? I18n.t("cadeditor.ui.vault.7b1a20be0f") : opts.pick ? I18n.t("cadeditor.ui.vault.fc7a21ee03") : I18n.t("cadeditor.ui.vault.0a34c6f361"), body, [saveBtn, impBtn, expBtn, undoEl, h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.done"), closeModal, { cls: 'pri' })], 'wide vtwin');
  pickMask = openModal(win, !!opts.pick || opts.stacked !== false); windowify(win, 'vault');   // 默认保留打开保险库的父窗口；显式 false 才替换。
  refresh(); paintState();
}

/* 存入一只生物：snbt 是带类型的实体数据文本；名称默认用生物名 */
function openVaultSaveEntity(snbt, defName, done) {
  if (!snbt || snbt === '{}') { toast(I18n.t("cadeditor.ui.vault.0250a6cfea"), 'warn'); return; }
  var nm = kInput(defName || '', function () {}, { placeholder: I18n.t("cadeditor.ui.cards1.d44e9b3d3b") }), tg = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.vault.f8735b187b") }), nt = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.vault.88a5087375") });
  var go = kBtn(I18n.t("cadeditor.ui.vault.c77eea6fd1"), function () {
    var tags = splitTags(tg.value).slice(0, 8);
    Vault.saveEntity(snbt, { name: (nm.value || '').trim(), tags: tags, note: nt.value || '' }, function (r) {
      if (!r.ok) { vaultErr(r); return; }
      closeModal(); toast((r.duplicate ? I18n.t("cadeditor.ui.vault.75a5fa2fdf") : I18n.t("cadeditor.ui.vault.970b72c06c")) + (r.entry ? r.entry.name : '') + (r.stripped && r.stripped.length ? I18n.t("cadeditor.ui.vault.3e8731cd39") : ''), 'ok');
      if (done) done();
    });
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell(I18n.t("cadeditor.ui.eschema.248306082a"), I18n.t("cadeditor.ui.screens.61aacd674a"), [fieldRow(I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), nm), fieldRow(I18n.t("cadeditor.ui.eschema.1d0fd5f933"), tg), fieldRow(I18n.t("cadeditor.ui.vault.daede98817"), nt)], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}

/* 存入当前物品：名称 / 标签 / 备注可以填，不填就用默认 */
function openVaultSave(done) {
  var d = Store.doc(); if (!d) { toast(I18n.t("cadeditor.ui.vault.a51f6bdadd"), 'warn'); return; }
  var nm = kInput(displayName(d), function () {}, { placeholder: I18n.t("cadeditor.ui.cards1.d44e9b3d3b") }), tg = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.vault.f8735b187b") }), nt = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.vault.88a5087375") });
  function val(c) { return c.value || ''; }
  var go = kBtn(I18n.t("cadeditor.ui.vault.c77eea6fd1"), function () {
    var tags = splitTags(val(tg)).slice(0, 8);
    Vault.save(hostTipStack(d), { name: val(nm).trim(), tags: tags, note: val(nt) }, function (r) {
      if (!r.ok) { vaultErr(r); return; }
      closeModal(); toast(r.duplicate ? I18n.t("cadeditor.ui.vault.afd272732d", (r.entry.name)) : I18n.t("cadeditor.ui.vault.d5cdd79d2a", (r.entry.name)), 'ok');
      if (done) done();
    });
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell(I18n.t("cadeditor.ui.eschema.248306082a"), itemNameOf(d), [fieldRow(I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), nm), fieldRow(I18n.t("cadeditor.ui.eschema.1d0fd5f933"), tg), fieldRow(I18n.t("cadeditor.ui.vault.daede98817"), nt)], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}
function itemNameOf(d) { return nameOfItem(d.id); }

/* 导入：粘贴导出的文本 */
function openVaultImport(done) {
  var ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false', placeholder: I18n.t("cadeditor.ui.vault.1798a1081c") }), msg = h('div', { class: 'k-sub' });
  var go = kBtn(I18n.t("cadeditor.ui.kit2.576d81bb06"), function () {
    var text = ta.value.trim(); if (!text) return;
    var okN = 0, bad = 0, off = 0;
    function page(tokenObj) {
      var f = { offset: off, limit: 32 }; if (tokenObj) f.uploadToken = tokenObj; else f.text = text;
      Vault.call('import', f, function (r) {
        if (!r.ok) { msg.textContent = r.reason || r.error; return; }
        (r.results || []).forEach(function (x) { if (x.ok) okN++; else bad++; });
        if (!r.done) { off = r.nextOffset; page(tokenObj); return; }
        closeModal(); toast(I18n.t("cadeditor.ui.vault.71124f0d28", (okN), (bad ? I18n.t("cadeditor.ui.vault.372909d167", (bad)) : '')), bad ? 'warn' : 'ok'); if (done) done();
      });
    }
    if (text.length < 6500) page(null); else Vault.upload(text, function (u) { if (!u.ok) { msg.textContent = u.reason || u.error; return; } page(u.token); });
  }, { cls: 'pri', icon: 'upload' });
  openModal(modalShell(I18n.t("cadeditor.ui.kit2.576d81bb06"), '', [ta, msg], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}
function vaultExport() {
  var text = '', off = 0, rev = null;
  (function more() {
    Vault.call('export', { all: true, offset: off, limit: 6000 }, function (x) {
      if (!x.ok) { vaultErr(x); return; }
      if (rev !== null && x.revision !== rev) { toast(I18n.t("cadeditor.ui.vault.e9e0735fb0"), 'warn'); return; }
      rev = x.revision; text += x.text;
      if (!x.done) { off = x.nextOffset; more(); return; }
      if (Prefs.hostClip && typeof oriel !== 'undefined' && oriel.send) { oriel.send('clipboard', { text: text }); toast(I18n.t("cadeditor.ui.vault.f160ff0d2b", (text.length)), 'ok'); return; }
      var ta = h('textarea', { class: 'ed-snbt', spellcheck: 'false' }); ta.value = text;
      openModal(modalShell(I18n.t("cadeditor.ui.vault.76420433f2"), I18n.t("cadeditor.ui.vault.26c4215990"), [ta], [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.done"), closeModal, { cls: 'pri' })]), true);
    });
  })();
}
