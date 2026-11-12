/* 草稿自动保存：没有应用的修改每隔一会儿写进宿主的偏好文件（config/cadeditor-ui.json），关掉编辑器再打开可以恢复。
   协议见 docs/registry-contract.md「草稿持久化」。没有宿主（浏览器预览）时什么都不做。 */
var Drafts = {
  timer: null, queue: [], busy: false, upSeq: 0, keyWritten: {}, sequence: 0, pumpTimer: null, nextSendAt: 0, lastSendError: null,
  writer: 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2), latest: {}, clears: {}, offered: {}, acknowledged: {},
  on: function () { return typeof oriel !== 'undefined' && oriel.send && Prefs.host; },
  keyOf: function (d) {
    var s = d && d.src; if (!s || typeof s !== 'object') return null;
    return [s.kind || '', s.index === undefined ? '' : s.index, s.menuId === undefined ? '' : s.menuId].join(':') + '|' + fullId(d.id);
  },
  owns: function (key, d) { var intent = this.latest[key]; return !intent || !intent.doc || intent.doc === d; },
  /* 编辑过就排队保存；改回原样或已应用就清掉草稿 */
  touch: function () {
    if (!this.on()) return;
    clearTimeout(this.timer);
    var me = this; this.timer = setTimeout(function () { me.flush(); }, 1500);
  },
  flush: function () {
    if (typeof weActive === 'function' && weActive()) { WorldDrafts.flush(); return; }
    this.flushDoc(Store.doc());
  },
  packet: function (d, parent) {
    if (!d || (!parent && typeof NestedItem !== 'undefined' && NestedItem)) return null;
    var key = this.keyOf(d); if (!key) return null;
    var pending = typeof EditorBridge !== 'undefined' && EditorBridge.pending && EditorBridge.pending.doc === d;
    if (pending) d.draftUnknown = true;
    var raw = typeof ItemRawBuffers !== 'undefined' && ItemRawBuffers.get(d), hasRaw = raw && (raw.invalid || raw.pending);
    if (snapOf(d) === d.base && !pending && !d.draftUnknown && !hasRaw) return { key: key, clean: true, clear: this.owns(key,d) && (!!this.keyWritten[key] || !!this.clears[key]) };
    var snapshot = snapOf(d), packet = JSON.parse(snapshot); packet.v = 2; packet.t = Date.now(); packet.base = d.base; if (pending || d.draftUnknown) packet.pending = true;
    // Only a matching explicit creative 'sent' receipt marks this exact version submitted.
    if (!pending && d.draftSubmitted === snapshot) packet.submitted = d.draftSubmittedFingerprint || true;
    if (hasRaw) packet.raw = {text:raw.text, base:raw.base};
    return { key: key, value: JSON.stringify(packet) };
  },
  flushDoc: function (d) {
    if (!this.on()) return;
    flushPendingCode();
    try { var p = this.packet(d); if (!p) return; if (p.clean) { if (p.clear) this.clear(p.key); } else {
      d.draftKeys = d.draftKeys || []; if (d.draftKeys.indexOf(p.key) < 0) d.draftKeys.push(p.key);
      this.keyWritten[p.key] = true; this.write(p.key, p.value, d);
    } }
    catch (error) { this.failed({ reason: I18n.t("cadeditor.ui.drafts.d57d334b3b", (String(error.message || error))) }); }
  },
  /* Synchronous pagehide exporter; independent from the ack/chunk queue. Never exports a child as its parent's inventory slot. */
  exportPackets: function () {
    flushPendingCode();
    if (!this.on()) return [];
    var packets = {}, me = this;
    Object.keys(this.clears).forEach(function (key) { if (key.indexOf('world|') !== 0) packets[key] = { key:key, clean:true, clear:true }; });
    var nested = typeof NestedItem !== 'undefined' && NestedItem, docs = Store.docs;
    if (nested) {
      // An item parent is detached into the outermost session, not in the child's Store.
      var outer = nested; while (outer.parent) outer = outer.parent;
      docs = typeof WE !== 'undefined' && WE.w ? [] : outer.docs || [];
    } else if (typeof weActive === 'function' && weActive()) docs = [];
    docs.forEach(function (d) { var p=me.packet(d, !!nested); if (p && (!p.clean || p.clear)) packets[p.key]=p; });
    return Object.keys(packets).map(function (key) { return packets[key]; });
  },
  saved: function (d, submitted) {
    clearTimeout(this.timer);
    delete d.draftUnknown;
    delete d.draftSubmitted;
    delete d.draftSubmittedFingerprint;
    // Retire versions actually written by this document, including an intermediate item-ID edit.
    // Other documents/slots/world drafts are never selected from the global prefs map.
    var old = JSON.parse(submitted.snap), key = this.keyOf({src:d.src,id:old.id});
    var currentKey = this.keyOf(d), later;
    try { later = snapOf(d) !== d.base; } catch (error) { this.failed({reason:I18n.t("cadeditor.ui.drafts.864958ae4e", (String(error.message || error)))}); return; }
    var me = this, keys = (d.draftKeys || []).slice(); if (key && keys.indexOf(key) < 0) keys.push(key);
    keys.forEach(function (written) {
      // A newer dirty value replaces this key with a higher sequence; never delete its last good
      // disk version first, because uploading the replacement can fail or exceed capacity.
      if (key && written.split('|')[0] === key.split('|')[0] && me.owns(written,d) && !(later && written === currentKey)) me.clear(written);
    });
    d.draftKeys = [];
    if (this.owns(this.keyOf(d),d)) this.flushDoc(d); // later edits persist; a newer document owns its own version
  },
  unresolved: function (d, unknown) {
    delete d.draftSubmitted;
    delete d.draftSubmittedFingerprint;
    if (unknown) d.draftUnknown = true; else delete d.draftUnknown;
    this.flushDoc(d);
  },
  submitted: function (d, submission, fingerprint) {
    d.draftUnknown = true;
    d.draftSubmitted = submission.snap;
    d.draftSubmittedFingerprint = typeof fingerprint === 'string' && /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : null;
    this.flushDoc(d);
  },
  supersede: function (key) {
    this.queue = this.queue.filter(function (m) { return m.key !== key; });
    if (this.busy && this.busy.key === key) { clearTimeout(this.ackTimer); this.busy = false; }
    return ++this.sequence;
  },
  clear: function (key) {
    delete this.acknowledged[key];
    var seq=this.supersede(key);this.keyWritten[key]=false;this.clears[key]=true;
    this.latest[key]={op:'clear',seq:seq}; if(Prefs.vals.drafts)delete Prefs.vals.drafts[key];
    this.queue.push({op:'clear',key:key,writer:this.writer,seq:seq});this.pump();
  },
  write: function (key, value, doc, full) {
    var seq=this.supersede(key);delete this.clears[key];this.latest[key]={op:'put',seq:seq,value:value,doc:doc||null};
    var base = this.acknowledged[key];
    if (!full && base) {
      var patch = {op:'patch', key:key, writer:this.writer, seq:seq, baseSeq:base.seq, changes:textDeltas(base.value, value)}, patchLength = JSON.stringify(patch).length;
      if (patch.changes.length && patchLength <= 7000 && patchLength < value.length) { this.queue.push(patch); this.pump(); return; }
    }
    var msg = { op: 'put', key: key, value: value, writer:this.writer, seq:seq };
    if (JSON.stringify(msg).length <= 7000) { this.queue.push(msg); this.pump(); return; }
    /* 大草稿分块：每块序列化后都要小于 8192 字符；一块块等回执 */
    var up = 'u' + (++this.upSeq) + '-' + Date.now(), list = [{ op: 'begin', key: key, upload: up, length: value.length, writer:this.writer,seq:seq }];
    for (var o = 0; o < value.length;) {
      var end = Math.min(value.length, o + 2800), chunk;
      do { chunk = { op: 'chunk', key:key, upload: up, offset: o, value: value.substring(o, end), done: end === value.length, writer:this.writer, seq:seq }; if (JSON.stringify(chunk).length <= 7000) break; if (end - o === 1) throw new Error(I18n.t("cadeditor.ui.drafts.6f11207206")); end = o + Math.max(1, Math.floor((end - o) / 2)); } while (end > o);
      list.push(chunk); o = end;
    }
    this.queue = this.queue.concat(list); this.pump();
  },
  send: function (m) { try { if (oriel.send('drafts', m) === false) throw new Error(I18n.t("cadeditor.ui.drafts.84ea1fb81f", (m.op))); this.lastSendError = null; return true; } catch (e) { this.lastSendError = e; return false; } },
  pump: function () {
    if (this.busy || !this.queue.length) return;
    var wait = this.nextSendAt - Date.now(), self = this;
    if (wait > 0) { if (!this.pumpTimer) this.pumpTimer = setTimeout(function () { self.pumpTimer = null; self.pump(); }, wait); return; }
    var me = this, active = this.busy = this.queue.shift();
    // ACKs may arrive synchronously. Yield between parts instead of consuming the
    // driver's 20-message burst in one callback, leaving room for manual Apply.
    this.nextSendAt = Date.now() + 100;
    if (!this.send(active)) {
      this.busy = false; active.retry = (active.retry || 0) + 1;
      if (active.retry <= 3) { this.queue.unshift(active); this.nextSendAt = Date.now() + active.retry * 500; this.pump(); return; }
      if (active.upload) this.queue = this.queue.filter(function (m) { return m.upload !== active.upload; });
      delete this.acknowledged[active.key];
      this.failed({ reason: I18n.t("cadeditor.ui.drafts.eea4474769"), detail: 'op=' + active.op + ' key=' + active.key + ' seq=' + active.seq + ' offset=' + active.offset + ' chars=' + JSON.stringify(active).length + ' error=' + this.lastSendError });
      this.pump(); return;
    }
    if (active.op === 'world_bind' || active.op === 'get') { if (this.busy === active) this.busy = false; this.pump(); return; }
    if (this.busy !== active) return;
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(function () { if (me.busy !== active) return; me.busy = false; delete me.acknowledged[active.key]; if (active.upload) me.queue = me.queue.filter(function (m) { return m.upload !== active.upload; }); me.failed({ reason: I18n.t("cadeditor.ui.drafts.d02a72ba0c"), detail: 'op=' + active.op + ' key=' + active.key + ' seq=' + active.seq + ' offset=' + active.offset }); me.pump(); }, 12000);
  },
  onResult: function (r) {
    if (!r || typeof r !== 'object') return;
    var active = this.busy;
    if (active && active.op === r.op && active.writer === r.writer && active.seq === r.seq && active.key === r.key && (!active.upload || active.upload === r.upload) && (active.op !== 'chunk' || active.offset === (r.part === undefined ? r.offset : r.part))) {
      clearTimeout(this.ackTimer);
      this.busy = false;
      var intent = this.latest[active.key];
      if (r.status !== 'accepted') {
        delete this.acknowledged[active.key];
        var upload = active.upload; if (upload) this.queue = this.queue.filter(function (m) { return m.upload !== upload; });
        if (active.op === 'patch' && intent && intent.seq === active.seq && intent.op === 'put') { this.write(active.key, intent.value, intent.doc, true); return; }
        this.failed(r);
      }
      else if ((active.op === 'put' || active.op === 'patch' || active.op === 'chunk' && active.done) && intent && intent.seq === active.seq && intent.op === 'put') {
        this.acknowledged[active.key] = {seq:active.seq, value:intent.value};
        Prefs.vals.drafts = Prefs.vals.drafts || {}; Prefs.vals.drafts[active.key] = intent.value;
      }
      else if (active.op === 'clear' && this.latest[active.key] && this.latest[active.key].seq === active.seq) { delete this.clears[active.key]; if (typeof WorldDrafts !== 'undefined') delete WorldDrafts.clears[active.key]; }
      this.pump();
    } // Old/duplicate receipts must not advance or fail a newer write.
  },
  failed: function (r) { var reason = r.reason || I18n.t("cadeditor.ui.drafts.a4243d53b1"); if (typeof EditorDiag !== 'undefined') EditorDiag.error('drafts.persist', new Error(reason + (r.detail ? ' ' + r.detail : '') + (r.op ? ' op=' + r.op + ' key=' + r.key + ' seq=' + r.seq : ''))); toast(I18n.t("cadeditor.ui.drafts.188277a3b0", (reason)), 'warn', 'drafts-error'); },
  attach: function () {
    if (typeof oriel === 'undefined' || !oriel.on) return;
    var me = this;
    oriel.on('patch', function (p) { if (!p) return; if (p.key === 'drafts.result') me.onResult(p.value); else if (p.key === 'prefs' && p.value && typeof p.value === 'object') { var all=p.value.drafts || {};Object.keys(me.latest).forEach(function(key){var op=me.latest[key];if(op.op==='clear')delete all[key];else all[key]=op.value;});Prefs.vals.drafts=all; if (p.value.worldDraftScope) Prefs.vals.worldDraftScope = p.value.worldDraftScope; if (typeof weActive === 'function' && weActive() && !WE.pending && !weDirty() && !$('modal')) WorldDrafts.offer(); else if (Store.docs.length && !NestedItem && snapOf(Store.doc())===Store.doc().base && !$('modal')) me.offer(Store.doc()); } });
    oriel.on('data', function (data, key) { if (key === 'drafts.result') me.onResult(data && data[key] !== undefined ? data[key] : data); });
    if (this.on()) { this.queue.push({ op: 'world_bind' }, { op: 'get' }); this.pump(); }
  },
  restore: function (d, dr) {
    var comps = dr.nbt_types ? nbtRestore(dr.comps || {}, dr.nbt_types) : nbtHydrate(dr.comps || {}, dr.v === 2 ? dr.nbt || {} : d.snbt || {});
    if (fullId(dr.id) !== d.id) Store.setItem(fullId(dr.id));
    if (dr.count !== d.count) Store.setCount(dr.count);
    Store.replace(comps, dr.removed || {}, I18n.t("cadeditor.ui.drafts.d20d05c1b0"));
    if (dr.raw && typeof dr.raw.text === 'string') {
      ItemRawBuffers.set(d, {text:dr.raw.text, base:dr.raw.base || snapOf(d), invalid:true});
      UI.cmdFmt = 'snbt'; UI.tab = 'item-stack'; drawTabbar(); drawTabBody();
    }
    if (dr.pending) d.draftUnknown = true;
    this.flushDoc(d);
  },
  matchesBase: function (d, dr) {
    if (dr.base === d.base) return true;
    if (dr.v !== 1) return false;
    try {
      var now = JSON.parse(d.base);
      return dr.base === JSON.stringify({ id: now.id, count: now.count, comps: now.comps, removed: now.removed });
    } catch (e) { return false; }
  },
  /* 打开物品时：如果有没应用的草稿，问要不要恢复 */
  offer: function (d) {
    if (!this.on() || !d || d.draftUnknown) return;
    var key = this.keyOf(d), all = Prefs.vals.drafts;
    if (!key || !all || typeof all[key] !== 'string') return;
    var dr; try { dr = JSON.parse(all[key]); } catch (e) { return; }
    if (!dr || (dr.v !== 1 && dr.v !== 2)) return;
    // Vanilla creative writes have no success receipt. On a new read, suppress the
    // old reminder only if the whole typed submitted intent already equals the item.
    // A rollback, extra edit, rejection or timeout still gets a recovery offer.
    if (!dr.raw && (dr.submitted === true || typeof dr.submitted === 'string') && snapOf(d) === d.base && !(typeof EditorBridge !== 'undefined' && EditorBridge.pending)) {
      try {
        if (typeof dr.submitted === 'string') {
          if (/^[0-9a-f]{64}$/.test(dr.submitted) && dr.submitted === d.nativeBaseline) { this.clear(key); return; }
        } else {
        var submittedBase = snapOf(nbtReadSnapshot(JSON.stringify(dr)));
        if (diffDoc({ id:d.id, count:d.count, comps:d.comps, removed:d.removed, snbt:d.snbt, base:submittedBase }).length === 0) { this.clear(key); return; }
        }
      } catch (error) { this.failed({ reason:I18n.t("cadeditor.ui.drafts.33a65fa7bd", (String(error.message || error))) }); }
    }
    // A new baseline can be our own successful write with a lost receipt, or an
    // external edit. Neither confirms this local draft: retain it for explicit review.
    var changed = !this.matchesBase(d, dr);
    if (this.offered[key] === all[key]) return; this.offered[key]=all[key];this.keyWritten[key]=false;
    var ago = Math.max(1, Math.round((Date.now() - (dr.t || 0)) / 60000));
    var me = this, value = all[key], base = d.base;
    function stillCurrent() {
      if (Store.doc() !== d) return false;
      if ((Prefs.vals.drafts || {})[key] === value && d.base === base) return true;
      closeModal(); delete me.offered[key]; me.offer(d); return false;
    }
    var ok = kBtn(I18n.t("cadeditor.ui.drafts.e0534b8a4e"), function () {
      if (!stillCurrent()) return;
      closeModal();
      me.restore(d, dr);
      toast(I18n.t("cadeditor.ui.drafts.f0d698c891", (changed || dr.pending ? I18n.t("cadeditor.ui.drafts.1414eabc7c") : '')), 'info');
    }, { cls: 'pri', icon: 'check' });
    var no = kBtn(I18n.t("cadeditor.ui.drafts.b16f71b556"), function () { if (!stillCurrent()) return; closeModal(); me.clear(key); }, { icon: 'trash' });
    var reason = changed ? I18n.t("cadeditor.ui.drafts.05bac2e87c") : I18n.t("cadeditor.ui.drafts.a06b64b4ad", (ago));
    if (dr.pending) reason += I18n.t("cadeditor.ui.drafts.899457ad6c");
    var win = modalShell(changed ? I18n.t("cadeditor.ui.drafts.bf44f304e5") : I18n.t("cadeditor.ui.drafts.b84606bd8a"), '', [kHint(reason)], [h('div', { class: 'grow' }), no, kBtn(I18n.t("cadeditor.ui.drafts.9d2ca26128"), closeModal), ok], 'k-narrow');
    openModal(win);
  },
};

/* World/entity drafts share the bounded host drafts protocol/file. Raw text stays SNBT;
   normalized edits carry nbtShape metadata across JSON. Session tokens/revisions authorize
   writes only; they are deliberately not the persistent identity of a target. */
var WorldDrafts = {
  timer: null, restoring: false, written: {}, offered: {}, clears: {},
  scope: function () { return Prefs.vals && Prefs.vals.worldDraftScope; },
  key: function (world) {
    var s = world && world.slot, scope = this.scope(); if (!s || !scope) return null;
    if (s.kind === 'entity' && !s.uuid) return null;
    return 'world|' + scope + '|' + JSON.stringify(s.kind === 'block' ? [s.kind, s.dim, s.x, s.y, s.z, world.type || world.block] : [s.kind, s.dim, s.uuid, world.type]);
  },
  state: function () { return { text: WE.text, slots: WE.slots, views: WE.views, bstate: WE.bstate, btype: WE.btype, ent: WE.ent, offers: WE.offers, pslots: WE.pslots, tab: WE.tab, upd: WE.upd, face: WE.face, conflict: WE.draftConflict || null }; },
  exportPacket: function () {
    flushPendingCode();
    if (!WE.w || !Drafts.on()) return null;
    var key = this.key(WE.w); if (!key) return null;
    if (!weDirty() && !WE.pending && !WE.draftUnknown && !WE.draftConflict) return { key: key, clean: true, clear: !!this.written[key] || !!this.clears[key] };
    var state = this.state(), types = nbtShape(nbtParse(nbtMerge(state, null)));
    return { key: key, value: JSON.stringify({ v: 3, kind: 'world', t: Date.now(), base: { snbt: WE.w.snbt, revision: WE.w.revision }, state: state, types: types, pending: !!WE.pending || !!WE.draftUnknown }) };
  },
  touch: function () {
    if (this.restoring || !Drafts.on()) return;
    clearTimeout(this.timer); var me = this;
    this.timer = setTimeout(function () { me.flush(); }, 600);
  },
  flush: function () {
    clearTimeout(this.timer);
    try {
      var packet = this.exportPacket(); if (!packet) return;
      if (packet.clean) {
        if (packet.clear) { this.clears[packet.key] = true; Drafts.clear(packet.key); delete this.written[packet.key]; }
      } else { delete this.clears[packet.key]; this.written[packet.key] = true; Drafts.write(packet.key, packet.value); }
    } catch (error) { Drafts.failed({ reason: I18n.t("cadeditor.ui.drafts.f6f135dc20", (String(error.message || error))) }); }
  },
  opened: function (saved) { if (!saved) { this.flight = null; delete this.offered[this.key(WE.w)]; this.offer(); } },
  offer: function () {
    var key = this.key(WE.w), value = key && Prefs.vals.drafts && Prefs.vals.drafts[key], me = this;
    if (!value || !Drafts.on()) return;
    if (this.offered[key] === value) return; this.offered[key] = value; delete this.written[key]; delete this.clears[key];
    var packet; try { packet = JSON.parse(value); if (packet.v !== 3 || packet.kind !== 'world') return; if (!packet.base || typeof packet.base.snbt !== 'string' || !packet.state || typeof packet.state.text !== 'string') throw new Error(I18n.t("cadeditor.ui.drafts.b17010b48c")); } catch (e) { Drafts.failed({ reason: I18n.t("cadeditor.ui.drafts.308b496da7", (String(e.message || e))) }); return; }
    var changed = this.textNorm(packet.base.snbt) !== this.textNorm(WE.w.snbt), world = WE.w;
    var reason = changed ? I18n.t("cadeditor.ui.drafts.8d76ab9d34") : I18n.t("cadeditor.ui.drafts.3b7eb69f04");
    if (packet.pending) reason += I18n.t("cadeditor.ui.drafts.899457ad6c");
    function stillCurrent() {
      if (WE.w !== world) return false;
      if ((Prefs.vals.drafts || {})[key] === value) return true;
      // Reload can deliver the pagehide disk snapshot after this initial prompt opened.
      // Never restore or discard the older version captured by that prompt's closure.
      closeModal(); delete me.offered[key]; me.offer(); return false;
    }
    var yes = kBtn(I18n.t("cadeditor.ui.drafts.d20d05c1b0"), function () { if (!stillCurrent()) return; closeModal(); me.restore(packet, changed); }, { cls: 'pri', icon: 'check' });
    var later = kBtn(I18n.t("cadeditor.ui.drafts.9d2ca26128"), closeModal, {});
    var drop = kBtn(I18n.t("cadeditor.ui.drafts.ab7d38fe7a"), function () { if (!stillCurrent()) return; closeModal(); Drafts.clear(key); }, { icon: 'trash' });
    openModal(modalShell(I18n.t("cadeditor.ui.drafts.4b7c6db616"), '', [kHint(reason)], [drop, later, yes], 'k-narrow'));
  },
  textNorm: function (text) { try { return nbtPrint(nbtParse(text), false); } catch (e) { return text; } },
  // Apply only changes made after a snapshot, onto freshly-authoritative SNBT.
  rebaseText: function (base, mine, current) {
    function merge(a, b, c) {
      if (a && b && nbtPrint(a, false) === nbtPrint(b, false)) return c;
      if (a && b && c && a.k === 'obj' && b.k === 'obj' && c.k === 'obj') {
        var keys = a.keys.concat(b.keys.filter(function (k) { return a.keys.indexOf(k) < 0; })), map = Object.create(null), all = c.keys.slice();
        c.keys.forEach(function (k) { map[k] = c.map[k]; });
        keys.forEach(function (k) { if (!b.map[k]) { delete map[k]; all = all.filter(function (x) { return x !== k; }); } else { var next = merge(a.map[k], b.map[k], c.map[k]); if (next) { map[k] = next; if (all.indexOf(k) < 0) all.push(k); } } });
        return { k: 'obj', keys: all, map: map };
      }
      return b;
    }
    return nbtPrint(merge(nbtParse(base), nbtParse(mine), nbtParse(current)), true);
  },
  restore: function (packet, changed) {
    var state; try { state = nbtRestore(packet.state, packet.types); } catch (error) { Drafts.failed({ reason: I18n.t("cadeditor.ui.drafts.cf2e8ceb57", (String(error.message || error))) }); return; } this.restoring = true;
    try {
      WE.text = changed ? this.rebaseText(packet.base.snbt, state.text, WE.w.snbt) : state.text;
      ['slots','views','bstate','btype','ent','offers','pslots','upd','face'].forEach(function (k) { if (Object.prototype.hasOwnProperty.call(state, k)) WE[k] = state[k]; });
      WE.obj = null; WE.draftConflict = state.conflict || (changed || packet.pending ? { base: packet.base.snbt, mine: state.text } : null);
      if (weTabs().some(function (t) { return t.id === state.tab; })) WE.tab = state.tab;
      weRender(); toast(I18n.t("cadeditor.ui.drafts.af63a8e449"), 'info', 'world-draft');
    } catch (error) { Drafts.failed({ reason: I18n.t("cadeditor.ui.drafts.9ac0a5d8cb", (String(error.message || error))) }); return; } finally { this.restoring = false; }
    this.flush();
  },
  compare: function () {
    var body = [kHint(I18n.t("cadeditor.ui.drafts.acffa74970"))];
    body.push(secTitle(I18n.t("cadeditor.ui.drafts.df6ba1613b"))); body.push(kCode({ value: WE.w.snbt, height: 140 }).el);
    body.push(secTitle(I18n.t("cadeditor.ui.drafts.62787127bd"))); body.push(kCode({ value: WE.text, height: 140 }).el);
    body.push(kHint(I18n.t("cadeditor.ui.drafts.ffabf78d99")));
    body.push(kCode({ value: nbtMerge({ views: WE.views, entity: WE.ent, slots: WE.slots, playerSlots: WE.pslots, offers: WE.offers, block_state: WE.bstate, block_type: WE.btype }, null), height: 140 }).el);
    openModal(modalShell(I18n.t("cadeditor.ui.drafts.bd5caae727"), '', body, [kBtn(I18n.t("cadeditor.ui.drafts.16b38790d5"), closeModal, { cls: 'pri', icon: 'back' })], ''));
  },
  beforeSend: function (id, previous) { WE.draftUnknown = false; this.flight = previous ? clone(previous) : { key: this.key(WE.w), text: WE.text, state: clone(this.state()) }; this.flight.id = id; this.flush(); },
  beforeSaved: function (world) {
    if (!this.flight || this.flight.id !== WE.pending || this.key(WE.w) !== this.flight.key || !world.slot || !WE.w.slot || world.slot.token !== WE.w.slot.token || (typeof wpCommandCaps === 'function' && wpCommandCaps())) return null;
    var old = this.flight, state = clone(this.state()), result = { text: this.rebaseText(old.text, state.text, world.snbt), edits: {}, key: old.key };
    ['views','ent'].forEach(function (name) {
      var keep = {}, sent = old.state[name] || {}, now = state[name] || {};
      Object.keys(sent).concat(Object.keys(now)).forEach(function (group) {
        var orig = name === 'views' ? weViewOrig(group) : evVal(group), fields = {}, a = sent[group] || {}, b = now[group] || {};
        Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (weNorm(nbtTake(a,k)) !== weNorm(nbtTake(b,k))) nbtPut(fields, k, Object.prototype.hasOwnProperty.call(b,k) ? nbtTake(b,k) : nbtTake(orig,k)); });
        if (Object.keys(fields).length) keep[group] = fields;
      }); result.edits[name] = keep;
    });
    function delta(a,b,orig) {
      var keep = {}; a = a || {}; b = b || {};
      Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (weNorm(a[k]) !== weNorm(b[k])) keep[k] = Object.prototype.hasOwnProperty.call(b,k) ? clone(b[k]) : clone(orig(k)); });
      return keep;
    }
    result.edits.slots = delta(old.state.slots,state.slots,function (k) { var row = ((WE.w.container || {}).slots || []).filter(function (x) { return x.slot === +k; })[0]; return row ? row.stack : {empty:true}; });
    result.edits.bstate = delta(old.state.bstate,state.bstate,function (k) { var row = weStateSchema().filter(function (x) { return x.name === k; })[0]; return row && row.current; });
    if (weNorm(old.state.btype) !== weNorm(state.btype)) result.edits.btype = state.btype || WE.w.block;
    if (weNorm(old.state.offers) !== weNorm(state.offers)) result.edits.offers = state.offers === null ? clone(evOffersOrig()) : clone(state.offers);
    result.edits.pslots = {};
    ['container','ender'].forEach(function (which) { result.edits.pslots[which] = delta((old.state.pslots || {})[which],(state.pslots || {})[which],function (k) { var v=evVal('player')[which];var row=v&&v.slots&&v.slots.filter(function (x) { return x.slot === +k; })[0];return row ? row.stack : {empty:true}; }); });
    return result;
  },
  afterSaved: function (later) {
    this.flight = null;
    if (later) { this.restoring = true; WE.text = later.text; WE.obj = null; Object.keys(later.edits).forEach(function (k) { WE[k] = later.edits[k]; }); this.restoring = false; }
    if (later && later.key !== this.key(WE.w)) { this.clears[later.key] = true; Drafts.clear(later.key); delete this.written[later.key]; }
    this.flush();
  }
};
