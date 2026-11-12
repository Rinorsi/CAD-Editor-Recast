var AUTO_BODY = {};   /* 通用卡片展开后的专门控件（cards4.js 填充） */
/* 所有试听共用宿主的一条通道，按钮状态只取已确认的回执。 */
var SoundPreview = {
  id: '', state: 'stopped', position: 0, duration: 0, ready: false, seekable: false,
  toggle: function (id, volume, pitch) {
    this.send('toggle', id, volume, pitch);
  },
  send: function (action, id, volume, pitch, position) {
    if (!id) return;
    if (typeof oriel === 'undefined' || !oriel.send || !oriel.data || !oriel.data.hostAudio) { toast(I18n.t("cadeditor.ui.picker.49249c4042"), 'error'); if (typeof EditorDiag !== 'undefined') EditorDiag.warn('sound.preview.channel', 'hostAudio unavailable'); return; }
    var request = {action:action,id:id}; if (volume !== undefined) request.volume = volume; if (pitch !== undefined) request.pitch = pitch;
    if (position !== undefined) request.position = position;
    if (oriel.send('sound_preview', request) === false) { toast(I18n.t("cadeditor.ui.picker.b13f0b933d"), 'error'); if (typeof EditorDiag !== 'undefined') EditorDiag.warn('sound.preview.send', id); }
  },
  accept: function (data) {
    if (!data) return;
    var oldProgressError = this.progressError, oldId = this.id;
    this.id = data.id || ''; this.state = data.state; this.position = Math.max(0, Number(data.position) || 0); this.duration = Math.max(0, Number(data.duration) || 0); this.ready = !!data.ready; this.seekable = !!data.seekable; this.progressError = data.progressError || ''; this.paint();
    if (data.error || data.state === 'error') toast(data.error || I18n.t("cadeditor.ui.picker.cb9aec8686"), 'error');
    else if (this.progressError && (oldId !== this.id || oldProgressError !== this.progressError)) toast(this.progressError, 'error');
  },
  paint: function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sound-preview]'), function (button) { SoundPreview.paintButton(button); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sound-player]'), function (node) { SoundPreview.paintPlayer(node); });
  },
  paintButton: function (button) {
    var active = button.getAttribute('data-sound-preview') === this.id, playing = active && this.state === 'playing';
    var status = playing ? 'playing' : 'stopped'; if (button._previewState === status) return; button._previewState = status;
    clear(button); button.appendChild(playing ? h('span', { text: 'Ⅱ' }) : uiIcon('play', 14));
    button.setAttribute('data-tip', playing ? I18n.t("cadeditor.ui.picker.879f568f3b") : I18n.t("cadeditor.ui.picker.7f0a0fda74"));
    button.setAttribute('aria-label', playing ? I18n.t("cadeditor.ui.picker.879f568f3b") : I18n.t("cadeditor.ui.picker.7f0a0fda74"));
    button.classList.toggle('on', playing);
  },
  button: function (id, fn) {
    var button = h('div', { class: 'k-mini', 'data-sound-preview': id || '' });
    activate(button, function (ev) { ev.stopPropagation(); fn(); }); this.paintButton(button); return button;
  },
  player: function () {
    var node = h('div', {class:'snd-player', 'data-sound-player':'true'});
    node.appendChild(uiIcon('music', 14));
    node.appendChild(h('span', {class:'snd-player-name'}));
    var track = h('div', {class:'snd-track', role:'slider', tabindex:'0', 'aria-label':I18n.t("cadeditor.ui.picker.b94a01e4a5")}, [h('div', {class:'snd-rail'}, [h('div', {class:'snd-fill'})])]);
    node.appendChild(track);
    node.appendChild(h('span', {class:'snd-time'}));
    function seek(position, id) {
      if (id !== SoundPreview.id || !SoundPreview.seekable) return;
      SoundPreview.send('seek', id, undefined, undefined, Math.max(0, Math.min(SoundPreview.duration, position)));
    }
    track.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0 || !SoundPreview.seekable) return;
      ev.preventDefault(); ev.stopPropagation(); track.focus();
      var id = SoundPreview.id;
      function move(e) {
        if (SoundPreview.id !== id || !SoundPreview.seekable) { finish(null); return; }
        var rect = track.getBoundingClientRect();
        node._seekPosition = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))) * SoundPreview.duration;
        node._seekId = id; SoundPreview.paintPlayer(node);
      }
      function finish(e) {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', finish);
        var position = node._seekPosition; node._seekPosition = undefined;
        if (e && position !== undefined) seek(position, id);
        SoundPreview.paintPlayer(node);
      }
      move(ev); document.addEventListener('mousemove', move); document.addEventListener('mouseup', finish);
    });
    track.addEventListener('keydown', function (ev) {
      if (!SoundPreview.seekable) return;
      var key = ev.key, step = ev.shiftKey ? 10 : 5, position = SoundPreview.position;
      if (key === 'ArrowRight' || key === 'ArrowUp') position += step;
      else if (key === 'ArrowLeft' || key === 'ArrowDown') position -= step;
      else if (key === 'Home') position = 0;
      else if (key === 'End') position = SoundPreview.duration;
      else return;
      ev.preventDefault(); ev.stopPropagation(); seek(position, SoundPreview.id);
    });
    this.paintPlayer(node); return node;
  },
  paintPlayer: function (node) {
    function time(n) { n = Math.floor(n); return Math.floor(n / 60) + ':' + ('0' + n % 60).slice(-2); }
    var name = node.querySelector('.snd-player-name'); name.textContent = this.id ? (Reg.nameOf('sounds', this.id) || this.id) : I18n.t("cadeditor.ui.picker.b68bde17c3"); name.setAttribute('data-tip', this.id || '');
    var track = node.querySelector('.snd-track'), position = this.duration > 0 ? Math.min(this.position, this.duration) : this.position;
    if (node._seekPosition !== undefined && node._seekId === this.id && this.seekable) position = node._seekPosition;
    track.setAttribute('aria-disabled', String(!this.seekable));
    track.setAttribute('data-tip', this.seekable ? I18n.t("cadeditor.ui.picker.a05e9176dd") : this.progressError || (this.state === 'error' ? I18n.t("cadeditor.ui.picker.cb9aec8686") : this.state === 'stopped' ? I18n.t("cadeditor.ui.picker.91a6a21d02") : I18n.t("cadeditor.ui.picker.78eb9fb0f3")));
    track.querySelector('.snd-fill').style.width = (this.duration > 0 ? 100 * position / this.duration : 0) + '%';
    if (this.duration > 0 && this.ready) {
      track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(this.duration)); track.setAttribute('aria-valuenow', String(position));
      track.removeAttribute('aria-valuetext');
    } else {
      track.removeAttribute('aria-valuemin'); track.removeAttribute('aria-valuemax'); track.removeAttribute('aria-valuenow');
      track.setAttribute('aria-valuetext', this.state === 'playing' && !this.ready ? I18n.t("cadeditor.ui.picker.d04fcbda73") : I18n.t("cadeditor.ui.picker.432a32a385"));
    }
    node.querySelector('.snd-time').textContent = this.state === 'error' ? I18n.t("cadeditor.ui.picker.cb9aec8686") : this.state === 'playing' && !this.ready ? I18n.t("cadeditor.ui.picker.4927a53bcc") : time(position) + ' / ' + (this.duration > 0 ? time(this.duration) : '--:--');
  }
};
if (typeof oriel !== 'undefined' && oriel.on) oriel.on('data', function (data, key) { if (key === 'sound_preview') SoundPreview.accept(data.sound_preview || data); });
/* 通用选择器窗口：左边分类，右边搜索 + 列表，可多选（勾选后一次「添加所选」）或单选（音效：点一下试听，选定后确认）。
   数据一律来自 Reg（游戏实时注册表；没有宿主时是内置数据，窗口里会标明）。 */
var ENCH_TAG_ZH = Labels.enchTag;
var SOUND_GROUP_ZH = { block: I18n.t("cadeditor.ui.picker.2753766d18"), entity: I18n.t("cadeditor.ui.picker.eb4308300e"), item: I18n.t("cadeditor.ui.pages.7c89d6ebe1"), ui: I18n.t("cadeditor.ui.picker.785d65c70f"), music: I18n.t("cadeditor.ui.picker.db95142124"), music_disc: I18n.t("cadeditor.ui.picker.da7efa96d4"), ambient: I18n.t("cadeditor.ui.picker.904dd029c7"), weather: I18n.t("cadeditor.ui.picker.4d94732547"), event: I18n.t("cadeditor.ui.picker.c560201b33"), particle: I18n.t("cadeditor.ui.picker.0eaedb8523"), enchant: I18n.t("cadeditor.ui.cards1.5cfebda177"), entity_effect: I18n.t("cadeditor.ui.picker.86a00cf742"), intentionally_empty: I18n.t("cadeditor.ui.cards4.2f8267a89a") };
var EFFECT_CAT_ZH = { beneficial: I18n.t("cadeditor.ui.picker.740f5e8102"), harmful: I18n.t("cadeditor.ui.picker.10db0d86d9"), neutral: I18n.t("cadeditor.ui.picker.574ce385b8") };
function pathOf(full) { var i = String(full).indexOf(':'); return i < 0 ? full : full.substring(i + 1); }
function pickerId(id) { id = String(id); return id.charAt(0) === '#' ? '#' + Reg.full(id.substring(1)) : Reg.full(id); }
/* -1 is the native permanent sentinel, not a negative number of seconds to scale. */
function effectTicksFromSeconds(seconds) { return Number(seconds) === -1 ? -1 : Math.round(seconds * 20); }
function effectSecondsFromTicks(ticks) { return Number(ticks) === -1 ? -1 : ticks / 20; }
/* Reconcile the complete selection, retaining existing order and untouched payloads. */
function pickerSyncList(list, ids, keyOf, make, update) {
  var wanted = {}, have = {}; ids.forEach(function (id) { wanted[pickerId(id)] = true; });
  var next = list.filter(function (entry) { return wanted[pickerId(keyOf(entry))]; }).map(function (entry) { var id = pickerId(keyOf(entry)); have[id] = true; var copy = clone(entry); if (update) update(copy, id); return copy; });
  ids.forEach(function (id) { id = pickerId(id); if (!have[id]) { have[id] = true; next.push(make(id)); } });
  return next;
}

/* o: { kind, title, sub, entries:[{full,name,sub,note,disabled,icon():el,tag}], cats:[{id,name,icon,filter(e)}], locked:{full:1}, single, custom:{placeholder}, confirmLabel, onConfirm(ids), preview(full), live } */
function openPicker(o) {
  var openedAt = Date.now();
  var managing = o.selected !== undefined, initial = Array.isArray(o.selected) ? o.selected.slice() : Object.keys(o.selected || {});
  if (!managing && o.single && o.initialId) initial = [Reg.full(o.initialId)];
  var sel = {}, selN = 0, catSel = 'all', limit = 80, q = '', vals = clone(o.values || {}), defs = {}, PR = o.params || [], touched = {}, adopted = {};
  initial.forEach(function (id) { if (!sel[id]) { sel[id] = 1; selN++; adopted[id] = 1; } });
  if (managing) o.cats = [{ id: 'selected', name: I18n.t("cadeditor.ui.picker.7ecf1cde64"), icon: 'check' }].concat(o.cats);
  PR.forEach(function (p) { defs[p.key] = p.def; });
  function valOf(full) { if (!vals[full]) vals[full] = {}; PR.forEach(function (p) { if (vals[full][p.key] === undefined) vals[full][p.key] = defs[p.key]; }); return vals[full]; }
  function changed(full, key) { if (!touched[full]) touched[full] = {}; touched[full][key] = true; }
  function clampP(p, v, e) { if (p.permanent && v === -1) return -1; var mx = p.max; if (p.maxOf && e && e[p.maxOf]) mx = e[p.maxOf]; v = Math.round(v); if (isNaN(v)) v = p.def; if (v < p.min) v = p.min; if (!p.soft && mx !== undefined && v > mx) v = mx; return v; }
  function validP(p, n) { return isFinite(n) && (n >= p.min || (p.permanent && n === -1)); }
  function paintParamUnit(input, p, value) { var unit = input.parentNode && input.parentNode.querySelector('[data-unit="' + p.key + '"]'); if (unit) unit.textContent = p.permanent && value === -1 ? I18n.t("cadeditor.ui.cards3.3e71ccc89a") : p.unit; }
  /* 每行右侧的参数输入：只在勾选后出现 */
  function paramsEl(full, e) {
    if (!PR.length) return null;
    var cur = valOf(full), box = h('div', { class: 'pkp' });
    box.addEventListener('click', function (ev) { ev.stopPropagation(); }); box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    PR.forEach(function (p) {
      var inp = h('input', { class: 'k-input pkn', type: 'text', spellcheck: 'false' }); inp.value = String(cur[p.key]);
      inp.addEventListener('input', function () { var n = parseInt(inp.value, 10); if (validP(p, n)) { cur[p.key] = n; changed(full, p.key); paintParamUnit(inp, p, n); } });
      inp.addEventListener('blur', function () { if (inp.value === String(cur[p.key]) && !(touched[full] && touched[full][p.key])) return; cur[p.key] = clampP(p, parseInt(inp.value, 10), e); inp.value = String(cur[p.key]); paintParamUnit(inp, p, cur[p.key]); changed(full, p.key); });
      inp.setAttribute('data-k', p.key);
      box.appendChild(h('span', { class: 'k-sub', text: p.label })); box.appendChild(inp);
      if (p.unit) box.appendChild(h('span', { class: 'k-sub', 'data-unit': p.key, text: p.permanent && cur[p.key] === -1 ? I18n.t("cadeditor.ui.cards3.3e71ccc89a") : p.unit }));
      if (p.permanent) setTip(inp, I18n.t("cadeditor.ui.picker.863ad97de2"));
    });
    return box;
  }
  /* 勾选时，这一行直接带上「统一设置」里当前的值 */
  function adopt(full, e) { if (!PR.length || adopted[full]) return; adopted[full] = 1; var cur = valOf(full); PR.forEach(function (p) { cur[p.key] = clampP(p, defs[p.key], e); }); syncRows(); }
  function syncRows() {
    Array.prototype.forEach.call(list.querySelectorAll('.addrow.on'), function (r) {
      var f = r.getAttribute('data-full'); if (!f || !vals[f]) return;
      Array.prototype.forEach.call(r.querySelectorAll('.pkn'), function (i) { var key = i.getAttribute('data-k'); i.value = String(vals[f][key]); PR.forEach(function (p) { if (p.key === key) paintParamUnit(i, p, vals[f][key]); }); });
    });
  }
  var list = h('div', { class: 'addlist' }), cats = h('div', { class: 'addcats' }), foot = h('div', { class: 'k-mf' });
  var info = h('span', { class: 'k-sub' }), confirm;
  var LZ = !!(o.lazy || o.lazySources);   /* 大目录：页面里没有整张表，列表完全来自宿主搜索 */
  if (LZ) { var unsubLz = Reg.on(function (kind, kinds) { if (!$('modal')) { unsubLz(); return; } if ((kinds || []).some(function (k) { return k === 'item_meta' || k.indexOf('lookup:') === 0; })) paint(); }); }
  if (LZ) o.entries = o.entries || [];
  if (o.entriesFn && !LZ) { o.entries = o.entriesFn(); var unsub = Reg.on(function () { if (!$('modal')) { unsub(); return; } o.entries = o.entriesFn(); byFull = null; paintCats(); paint(); }); }
  var search = h('input', { class: 'k-input', type: 'text', placeholder: (o.searchHint || I18n.t("cadeditor.ui.picker.5b46bc7bad")) + (o.custom && !o.custom.hash ? I18n.t("cadeditor.ui.picker.37fd174a5e") : ''), spellcheck: 'false' });
  function catOf(id) { for (var i = 0; i < o.cats.length; i++) if (o.cats[i].id === id) return o.cats[i]; return o.cats[0]; }
  function visible() {
    var cat = catOf(catSel), s = q.trim().toLowerCase();
    return o.entries.filter(function (e) {
      if (cat.filter && !cat.filter(e)) return false;
      return !s || kMatch(e.name + ' ' + e.full + ' ' + (e.sub || ''), s);
    });
  }
  function paintCats() {
    clear(cats);
    o.cats.forEach(function (c) {
      var n = c.id === 'selected' ? selN : LZ ? (o.lazy ? (c.id === 'mod' ? (modCount === null ? '' : modCount) : (Reg.lazy[o.lazyKind] || '')) : '') : o.entries.filter(function (e) { return !c.filter || c.filter(e); }).length;
      var t = h('div', { class: 'addcat' + (catSel === c.id ? ' on' : '') }, [uiIcon(c.icon || 'grid', 14), h('span', { text: c.name }), h('em', { class: 'n', text: String(n) })]);
      activate(t, function () { catSel = c.id; limit = 80; paintCats(); paint(); });
      cats.appendChild(t);
    });
  }
  function paintFoot() {
    info.textContent = o.single ? (selN ? I18n.t("cadeditor.ui.picker.d81f9a8b36", (Object.keys(sel)[0])) : (o.preview ? I18n.t("cadeditor.ui.picker.a65cacab98") : I18n.t("cadeditor.ui.picker.76258b625d"))) : I18n.t("cadeditor.ui.picker.5eeada896c", (selN));
    if (confirm) { confirm.classList.toggle('dim', !selN && !managing); }
  }
  function pick(e, row) {
    if (e.disabled || (o.locked && o.locked[e.full])) return;
    if (o.single) { sel = {}; selN = 0; Array.prototype.forEach.call(list.querySelectorAll('.addrow.on'), function (r) { r.classList.remove('on'); }); }
    if (sel[e.full]) { delete sel[e.full]; selN--; row.classList.remove('on'); }
    else { sel[e.full] = 1; selN++; row.classList.add('on'); adopt(e.full, e); }
    if (o.single && o.preview) o.preview(e.full);
    paintFoot();
    if (managing) paintCats();
  }
  function rowEdit(id) {
    if (!o.onEditSelection) return null;
    var btn = kBtn(I18n.t("cadeditor.ui.picker.ac72175c28"), function () { if (sel[id]) o.onEditSelection(id); }, { cls: 'pk-edit-selection', icon: 'edit' });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); });
    return btn;
  }
  /* 过滤：条目多时按时间片分批（kFilterSliced），每批都是一次新的脚本入口，不会触发单次入口指令预算而停页。
     分批期间旧列表保持原样，算完再换，不会闪空白。 */
  var filterCancel = null, lastVis = [], hostMore = null, byFull = null, nsList = [], modCount = null, lazyErr = '';
  /* 宿主搜索：让游戏的后台索引排好序，只回来一小窗口。
     · 普通选择窗（有 hostKind，分类“全部”）：页面里已有整张表，宿主只负责排序，结果 ID 对回已有的行；宿主不可用时退回本地分批过滤。
     · 大目录（lazy / lazySources）：页面里没有整张表，列表完全来自宿主；宿主不可用时给出原因，仍可直接输入完整 ID。 */
  function rowsOf(r) {
    if (o.lazy) { Reg.noteRows(o.lazyKind, r.entries); return (r.entries || []).map(o.rowFn); }
    if (!byFull) { byFull = {}; o.entries.forEach(function (e) { byFull[e.full] = e; }); }
    var out = [];
    (r.entries || []).forEach(function (x) { var e = byFull[Reg.full(x.id)]; if (e) out.push(e); });
    return out;
  }
  function hostFilters(cat) { return o.lazy && cat.id === 'mod' ? { namespaces: nsList.filter(function (n) { return n !== 'minecraft'; }) } : undefined; }
  function lazySourcesPaint(s, cat) {
    var srcs = o.lazySources.filter(function (x) { return cat.id === 'all' || x.group === cat.id; });
    var quick = (cat.id === 'all' || cat.id === 'quick') ? (o.lazyQuickFn ? o.lazyQuickFn() : o.lazyQuick || []).filter(function (e) { return !s || kMatch(e.name + ' ' + e.full + ' ' + (e.sub || ''), s); }) : [];
    var parts = [], pending = srcs.length, failed = '';
    if (!pending) { render(quick); return; }
    srcs.forEach(function (src, i) {
      var ok = HostSearch.query({ view: i ? 'picker' + i : 'picker', kind: src.kind, query: s, limit: 100 }, function (r) {
        if (r.fallback) { failed = r.error || I18n.t("cadeditor.ui.picker.6f346cbb78"); parts[i] = []; }
        else { Reg.noteRows(src.kind, r.entries); parts[i] = (r.entries || []).map(src.rowFn); }
        if (--pending === 0) { lazyErr = quick.length || parts.some(function (p) { return p.length; }) ? '' : failed; render(quick.concat.apply(quick, parts)); }
      });
      if (!ok) { failed = I18n.t("cadeditor.ui.picker.8b3b99808a"); parts[i] = []; if (--pending === 0) { lazyErr = quick.length ? '' : failed; render(quick.concat.apply(quick, parts)); } }
    });
    return true;
  }
  function hostPaint(s, cat) {
    if (o.lazySources) { lazySourcesPaint(s, cat); return true; }
    var kind = o.lazy ? o.lazyKind : o.hostKind;
    if (!kind || (!o.lazy && cat.filter && cat.id !== 'all')) return false;
    var f = hostFilters(cat);
    if (f && !f.namespaces.length) { lazyErr = ''; render([]); return true; }
    var started = HostSearch.query({ view: 'picker', kind: kind, query: s, limit: 200, filters: f }, function (r) {
      if (r.fallback) { if (o.lazy) { lazyErr = r.error || I18n.t("cadeditor.ui.picker.6f346cbb78"); render([]); } else localPaint(s, cat); return; }
      lazyErr = '';
      if (o.lazy && r.namespaces) {
        nsList = r.namespaces.map(function (n) { return n.id; });
        modCount = 0; r.namespaces.forEach(function (n) { if (n.id !== 'minecraft') modCount += n.count || 0; });
        paintCats();
      }
      var rows = rowsOf(r);
      hostMore = r.nextOffset !== undefined && !r.done ? { s: s, offset: r.nextOffset, total: r.total, filters: f } : null;
      render(rows, hostMore ? r.total : rows.length);
    });
    if (!started && o.lazy) { lazyErr = I18n.t("cadeditor.ui.picker.37e7731a12"); render([]); return true; }
    return started;
  }
  function hostNext() {
    if (!hostMore) return;
    var m = hostMore, prev = lastVis;
    HostSearch.query({ view: 'picker', kind: o.lazy ? o.lazyKind : o.hostKind, query: m.s, offset: m.offset, limit: 200, filters: m.filters }, function (r) {
      if (r.fallback) return;
      var rows = prev.concat(rowsOf(r));
      hostMore = r.nextOffset !== undefined && !r.done ? { s: m.s, offset: r.nextOffset, total: m.total, filters: m.filters } : null;
      limit = rows.length;
      render(rows, hostMore ? m.total : rows.length);
    });
  }
  function paint() {
    if (filterCancel) { filterCancel(); filterCancel = null; }
    var cat = catOf(catSel), s = q.trim().toLowerCase();
    hostMore = null;
    if (catSel === 'selected') {
      var known = {}; (o.selectionEntries || []).concat(o.entries || []).forEach(function (e) { known[e.full] = e; });
      render(Object.keys(sel).map(function (id) { return known[id] || { full: id, name: id, sub: I18n.t("cadeditor.ui.picker.1b63b39c1f") }; }).filter(function (e) { return !s || kMatch(e.name + ' ' + e.full, s); })); return;
    }
    if ((s || LZ) && hostPaint(s, cat)) return;
    localPaint(s, cat);
  }
  function localPaint(s, cat) {
    var pool = o.entries.filter(function (e) { return !cat.filter || cat.filter(e); });
    if (!s) { render(pool); return; }
    filterCancel = kFilterSliced(pool, function (e) { return kMatch(e.name + ' ' + e.full + ' ' + (e.sub || ''), s); }, render);
  }
  function render(vis, total) {
    lastVis = vis;
    var shown = vis.slice(0, limit);
    clear(list);
    var qq = q.trim().toLowerCase();
    if (o.custom && (o.custom.hash ? /^#?[a-z0-9_.\-]+:[a-z0-9_.\/\-]+$/ : /^[a-z0-9_.\-]+:[a-z0-9_.\/\-]+$/).test(qq) && !o.entries.some(function (e) { return e.full === qq; })) {
      var crow = h('div', { class: 'addrow pk custom' + (sel[qq] ? ' on' : '') }, [o.single ? null : h('div', { class: 'pkc', text: '✓' }), h('div', { class: 'ic' }, [uiIcon('plus', 16)]), h('div', { class: 'tx' }, [h('div', { class: 'z', text: I18n.t("cadeditor.ui.kit.f3c59d1da3", (qq)) }), h('div', { class: 's', text: I18n.t("cadeditor.ui.picker.98e080a9ac") })]), paramsEl(qq, null)]);
      crow.setAttribute('data-full', qq);
      setTip(crow.querySelector('.tx'), qq);
      var customEdit = rowEdit(qq); if (customEdit) crow.appendChild(customEdit);
      crow.addEventListener('click', function () { pick({ full: qq }, crow); });
      list.appendChild(crow);
    }
    shown.forEach(function (e) {
      var locked = !!(o.locked && o.locked[e.full]);
      var kids = [o.single ? null : h('div', { class: 'pkc', text: '✓' })];
      kids.push(h('div', { class: 'ic' }, [e.icon ? e.icon() : uiIcon('grid', 16)]));
      var text = h('div', { class: 'tx' }, [h('div', { class: 'z', text: e.name }), h('div', { class: 's', text: e.note || e.sub || e.full })]);
      kids.push(text);
      if (o.single && o.preview) kids.push(SoundPreview.button(o.soundOf ? o.soundOf(e.full) : e.full, function () { o.preview(e.full, 'toggle'); }));
      if (locked) kids.push(h('span', { class: 'k-tag dim', text: I18n.t("cadeditor.ui.picker.20d2382f10") })); else if (e.tag) kids.push(h('span', { class: 'k-tag dim', text: e.tag }));
      var pe = paramsEl(e.full, e); if (pe) kids.push(pe);
      var editButton = rowEdit(e.full); if (editButton) kids.push(editButton);
      var row = h('div', { 'data-full': e.full, class: 'addrow pk' + (locked || e.disabled ? ' has' : '') + (sel[e.full] ? ' on' : '') }, kids);
      row.addEventListener('click', function () { pick(e, row); });
      list.appendChild(row);
    });
    if (vis.length > shown.length) { var more = h('div', { class: 'k-add', text: I18n.t("cadeditor.ui.picker.81524d5247", (vis.length - shown.length)) }); activate(more, function () { limit += 120; render(lastVis, total); }); list.appendChild(more); }
    else if (hostMore) { var more2 = h('div', { class: 'k-add', text: I18n.t("cadeditor.ui.picker.cc4fd8f35c", (total)) }); activate(more2, hostNext); list.appendChild(more2); }
    if (!vis.length) list.appendChild(xEmpty(lazyErr ? I18n.t("cadeditor.ui.picker.aec61ae541", (lazyErr)) : emptyReason(q, openedAt, o.emptyReg)));
  }
  var sbox = kSearchBox(search, function (v) { q = v; limit = 80; paint(); });   // 回车或点「搜索」才搜
  var top = [sbox.el];
  if (o.controls) top.push(o.controls);
  if (PR.length && !o.single) {
    var bar = h('div', { class: 'k-row pk-ctl pk-bulk' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.picker.10e3129f97") })]);
    PR.forEach(function (p) {
      var bi = h('input', { class: 'k-input pkn', type: 'text', spellcheck: 'false' }); bi.value = String(p.def);
      var edited = false;
      function apply() { if (!edited) return; var v = clampP(p, parseInt(bi.value, 10), null); if (p.maxOf) v = Math.max(p.min, parseInt(bi.value, 10) || p.def); defs[p.key] = v; bi.value = String(v); paintParamUnit(bi, p, v); Object.keys(sel).forEach(function (f) { var e = o.entries.filter(function (x) { return x.full === f; })[0]; valOf(f)[p.key] = clampP(p, v, e); changed(f, p.key); }); syncRows(); edited = false; }
      bi.addEventListener('blur', apply); bi.addEventListener('input', function () { edited = true; var n = parseInt(bi.value, 10); if (!validP(p, n)) return; defs[p.key] = n; paintParamUnit(bi, p, n); Object.keys(sel).forEach(function (f) { var e = o.entries.filter(function (x) { return x.full === f; })[0]; valOf(f)[p.key] = clampP(p, n, e); changed(f, p.key); }); syncRows(); }); onKey(bi, { Enter: apply });
      bar.appendChild(h('span', { class: 'k-sub', text: p.label })); bar.appendChild(bi); if (p.unit) bar.appendChild(h('span', { class: 'k-sub', 'data-unit': p.key, text: p.unit }));
      if (p.permanent) setTip(bi, I18n.t("cadeditor.ui.picker.863ad97de2"));
      if (p.maxOf) bar.appendChild(kBtn(I18n.t("cadeditor.ui.picker.51a266855e"), function () { Object.keys(sel).forEach(function (f) { var e = o.entries.filter(function (x) { return x.full === f; })[0]; if (e && e[p.maxOf]) { valOf(f)[p.key] = e[p.maxOf]; changed(f, p.key); } }); syncRows(); }, { cls: 'sm' }));
    });
    top.push(bar);
  }
  if (o.single && o.preview) {
    var vol = 1, pit = 1;
    o.preview = function (full, action) {
      var sid = o.soundOf ? o.soundOf(full) : full;
      if (!sid) { toast(I18n.t("cadeditor.ui.picker.1f41aa8990"), 'warn'); dbg(I18n.t("cadeditor.ui.picker.5d6d28612b", (full))); return; }
      SoundPreview.send(action || 'play', sid, vol, pit); dbg(I18n.t("cadeditor.ui.picker.04bd705d50", (sid), (vol), (pit), (full)));
    };
    top.push(h('div', { class: 'k-row pk-ctl' }, [h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.picker.8bf8b9780d") }), kSeg([{ v: 0.5, label: '50%' }, { v: 1, label: '100%' }], 1, function (v) { vol = v; }).el, h('span', { class: 'k-sub', text: I18n.t("cadeditor.ui.picker.8f8c5a469b") }), kSeg([{ v: 0.5, label: I18n.t("cadeditor.ui.labels.aa9e366f68") }, { v: 1, label: I18n.t("cadeditor.ui.labels.296de0e31f") }, { v: 1.5, label: I18n.t("cadeditor.ui.labels.b1c27820fe") }, { v: 2, label: I18n.t("cadeditor.ui.picker.2508765118") }], 1, function (v) { pit = v; }).el]));
  }
  var cancel = kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal);
  confirm = kBtn(managing ? I18n.t("cadeditor.ui.picker.4c62c9c5a5") : o.confirmLabel || I18n.t("cadeditor.ui.picker.812c3a6936"), function () { if (!selN && !managing || o.validateConfirm && o.validateConfirm() === false) return; var ids = Object.keys(sel); closeModal(); o.onConfirm(ids, vals, { changes: touched, removed: initial.filter(function (id) { return !sel[id]; }) }); }, { cls: 'pri' });
  foot.appendChild(info); (o.footExtra || []).forEach(function (b) { foot.appendChild(b); });
  foot.appendChild(h('div', { class: 'grow' })); foot.appendChild(cancel); foot.appendChild(confirm);
  var srcTag = h('span', { class: 'k-tag' + (o.live ? '' : ' dim'), text: Reg.preview() ? I18n.t("cadeditor.ui.picker.a7528c6f50") : (Reg.live() ? I18n.t("cadeditor.ui.picker.b53f0469cf") : I18n.t("cadeditor.ui.picker.0761ed21f1")) });
  var pickerBody = h('div', { class: 'addbody' }, [cats, h('div', { class: 'addmain' }, [h('div', { class: 'addtop' }, top), list])]);
  if (o.single && o.preview) pickerBody = h('div', {class:'snd-picker-body'}, [pickerBody, SoundPreview.player()]);
  var win = modalShell({ icon: o.icon || 'plus', title: o.title, sub: o.sub || '', actions: [srcTag], cls: 'addwin pickwin',
    body: pickerBody, foot: foot });
  paintCats(); paint(); paintFoot(); openModal(win, true); windowify(win, 'pick-' + (o.kind || 'x')); search.focus();
}

/* ---- 附魔 ---- */
function openEnchantPicker(o) {   /* o: { itemId, any, present:{full:1}, stored, onConfirm(ids) } */
  var all = Reg.enchants(), item = Reg.full(o.itemId);
  function fits(e) { return o.any || Reg.enchantFits(e, item) === true; }
  var tagCount = {}; all.forEach(function (e) { (e.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
  var tags = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).filter(function (t) { return tagCount[t] < all.length; }).slice(0, 9);
  var cats = [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }];
  if (!o.any) cats.push({ id: 'fit', name: I18n.t("cadeditor.ui.picker.cb905f313c"), icon: 'check', filter: function (en) { return fits(en.src); } });
  tags.forEach(function (t) { cats.push({ id: t, name: ENCH_TAG_ZH[pathOf(t)] || pathOf(t), icon: pathOf(t) === 'curse' ? 'skull' : 'enchant', filter: function (en) { return (en.src.tags || []).indexOf(t) >= 0; } }); });
  if (all.some(function (e) { return Reg.isMod(e.full); })) cats.push({ id: 'mod', name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: 'cube', filter: function (en) { return Reg.isMod(en.full); } });
  function entries() { return Reg.enchants().map(function (e) {
    var ok = fits(e);
    var fit = Reg.enchantFits(e, item);
    return { src: e, full: e.full, max: e.max, name: e.name, sub: (e.max !== null ? I18n.t("cadeditor.ui.picker.e7b3999490", (e.max)) : I18n.t("cadeditor.ui.picker.796b938dd8")) + (ok ? '' : (fit === null ? I18n.t("cadeditor.ui.picker.4139fadd1a") : I18n.t("cadeditor.ui.picker.ffb2b05331"))) + (e.desc && e.desc !== e.name ? ' · ' + e.desc : ''), tag: (e.tags || []).indexOf('minecraft:curse') >= 0 ? I18n.t("cadeditor.ui.labels.aec92a8e68") : '', icon: function () { return itemIcon(ENCH_ICON[pathOf(e.full)] || 'enchanted_book', 16); } };
  }); }
  openPicker({ kind: 'ench', emptyReg: 'enchantment', title: I18n.t("cadeditor.ui.cards1.f918baf5b3"), sub: o.stored ? I18n.t("cadeditor.ui.picker.4ebd28447b") : I18n.t("cadeditor.ui.picker.d96f8b3fb3"), icon: 'enchant', entriesFn: entries, cats: cats, selected: o.present, values: o.values, live: !Reg.preview(), params: [{ key: 'level', label: I18n.t("cadeditor.ui.labels.3377171738"), def: 1, min: 1, max: 255, maxOf: 'max', soft: true, unit: '' }], searchHint: I18n.t("cadeditor.ui.picker.432df78076"), custom: { placeholder: I18n.t("cadeditor.ui.picker.895c59cd3a") }, onConfirm: o.onConfirm });
}

/* ---- 状态效果 ---- */
function openEffectPicker(o) {   /* o: { present:{full:1}, full:true=带等级, onConfirm(ids, vals) } */
  var all = Reg.effects();
  var cats = [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }];
  ['beneficial', 'neutral', 'harmful'].forEach(function (c) { cats.push({ id: c, name: EFFECT_CAT_ZH[c], icon: c === 'harmful' ? 'poison' : c === 'beneficial' ? 'regen' : 'flask', filter: function (e) { return e.cat === c; } }); });
  if (all.some(function (e) { return Reg.isMod(e.full); })) cats.push({ id: 'mod', name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: 'cube', filter: function (e) { return Reg.isMod(e.full); } });
  var entries = all.map(function (e) { return { full: e.full, name: e.name, sub: e.desc || e.full, cat: e.cat, tag: EFFECT_CAT_ZH[e.cat] || '', icon: function () { return effectIcon(pathOf(e.full), 16); } }; });
  openPicker({ kind: 'fx', title: I18n.t("cadeditor.ui.cards3.6965940e5f"), sub: I18n.t("cadeditor.ui.picker.d96f8b3fb3"), icon: 'flask', entries: entries, cats: cats, selected: o.present, values: o.values, live: !!(all.length && all[0].live), params: o.noParams ? [] : (o.full ? [{ key: 'level', label: I18n.t("cadeditor.ui.labels.3377171738"), def: 1, min: 1, max: 255, soft: true }] : []).concat([{ key: 'seconds', label: I18n.t("cadeditor.ui.picker.04a95e0654"), def: o.full ? 30 : 8, min: 1, max: 1000000, soft: true, unit: I18n.t("cadeditor.ui.cards2.9dcdc2b289"), permanent: true }]), searchHint: I18n.t("cadeditor.ui.picker.8152ed402a"), custom: { placeholder: I18n.t("cadeditor.ui.picker.10f39379b3") }, onConfirm: o.onConfirm });
}

/* ---- 音效：分类 + 点一下试听 + 确认 ---- */
function openSoundPicker(o) {   /* o: { current, onConfirm(full) } */
  var slk = Reg.lazyKind('sound_event');
  if (slk) {   // 音效目录很大：搜索走宿主；分类只有“全部 / 模组”（宿主按命名空间过滤）
    openPicker({ kind: 'snd', title: I18n.t("cadeditor.ui.picker.4a1d016eab"), sub: o.current ? I18n.t("cadeditor.ui.picker.47bee55728", (o.current)) : '', icon: 'music', single: true, entries: [], lazy: true, lazyKind: slk,
      rowFn: function (r) { return { full: Reg.full(r.id), name: Reg.soundLabel(r), sub: r.id, icon: function () { return uiIcon('music', 16); } }; },
      cats: [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }, { id: 'mod', name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: 'cube' }], live: true, searchHint: I18n.t("cadeditor.ui.picker.5c49b17c1d"), custom: { placeholder: I18n.t("cadeditor.ui.picker.89e606740e") }, preview: function () {}, soundOf: function (full) { return full; },
      confirmLabel: I18n.t("cadeditor.ui.picker.ea2fc4a944"), onConfirm: function (ids) { o.onConfirm(ids[0]); } });
    return;
  }
  var all = Reg.sounds(), groups = {};
  all.forEach(function (s) { s.group = Reg.isMod(s.full) ? 'mod' : pathOf(s.full).split('.')[0]; groups[s.group] = (groups[s.group] || 0) + 1; });
  var cats = [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }];
  Object.keys(groups).filter(function (g) { return g !== 'mod'; }).sort(function (a, b) { return groups[b] - groups[a]; }).slice(0, 12).forEach(function (g) { cats.push({ id: g, name: SOUND_GROUP_ZH[g] || g, icon: 'music', filter: function (e) { return e.group === g; } }); });
  if (groups.mod) cats.push({ id: 'mod', name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: 'cube', filter: function (e) { return e.group === 'mod'; } });
  var entries = all.map(function (s) { return { full: s.full, name: s.name, sub: s.full, group: s.group, icon: function () { return uiIcon('music', 16); } }; });
  openPicker({ kind: 'snd', title: I18n.t("cadeditor.ui.picker.4a1d016eab"), sub: o.current ? I18n.t("cadeditor.ui.picker.47bee55728", (o.current)) : '', icon: 'music', single: true, entries: entries, cats: cats, live: !!(all.length && all[0].live), searchHint: I18n.t("cadeditor.ui.picker.5c49b17c1d"), custom: { placeholder: I18n.t("cadeditor.ui.picker.89e606740e") }, preview: function () {}, confirmLabel: I18n.t("cadeditor.ui.picker.19501b4df5"), onConfirm: function (ids) { o.onConfirm(ids[0]); } });
}
/* 音效输入框：当前值 + 试听 + 选择 */
function kSoundField(value, onChange) {
  var cur = value || '';
  var name = h('span', { class: 'snd-name' });
  var play = SoundPreview.button(cur, function () { SoundPreview.toggle(cur); });
  var pick = kBtn(I18n.t("cadeditor.ui.forms.4aea6b5ff7"), function () { openSoundPicker({ current: cur, onConfirm: function (id) { cur = id; paint(); onChange(id); } }); }, { icon: 'music' });
  var idEl = h('span', { class: 'rs-id' });
  function paint() {
    var n = cur ? (Reg.isLazy('sound_event') ? ((Reg.optionFor('sound_event', cur) || {}).label || null) : Reg.nameOf('sounds', cur)) : null;
    name.textContent = cur ? (n || cur) : I18n.t("cadeditor.ui.banner.3c5045c728"); idEl.textContent = cur && n ? cur : '';
    var tip = cur ? (n && n !== cur ? n + String.fromCharCode(10) + cur : cur) : '';
    name.setAttribute('data-tip', tip); idEl.setAttribute('data-tip', tip);
    play.setAttribute('data-sound-preview', cur); SoundPreview.paintButton(play);
  }
  paint();
  return { el: h('div', { class: 'k-row snd-field' }, [play, name, idEl, h('div', { class: 'grow' }), pick]), set: function (v) { cur = v || ''; paint(); } };
}

/* ---- 通用单选：任意注册表的 ID 字段。候选来自游戏实时注册表（含模组），搜索框里输入 模组id:名字 也能直接用 ----
   o: { reg:'potion', value, onChange(full), title, fallback:[{v,label,sub}], empty:'未选择', allowClear } */
function kRegSelect(o) {
  var cur = o.value || "";
  var nm = h("span", { class: "rs-name" }), idEl = h("span", { class: "rs-id" });
  function entry(id) {
    if (Reg.isLazy(o.reg)) return Reg.optionFor(o.reg, id);
    var l = Reg.options(o.reg) || (Reg.preview() ? o.fallback : null) || [], f = Reg.full(id);
    for (var i = 0; i < l.length; i++) if (l[i].v === f || l[i].v === id) return l[i];
    return null;
  }
  function paint() {
    if (!cur) { nm.textContent = o.empty || I18n.t("cadeditor.ui.banner.3c5045c728"); nm.className = "rs-name none"; idEl.textContent = ""; nm.setAttribute('data-tip', ''); idEl.setAttribute('data-tip', ''); return; }
    var isTag = cur.charAt(0) === "#", e = isTag ? null : entry(cur);
    var name = isTag ? I18n.t("cadeditor.ui.eschema.1d0fd5f933") : (e ? refName(o.reg, e) : humanId(shortId(cur)));
    nm.className = "rs-name"; nm.textContent = name;
    var tip = name !== cur ? name + String.fromCharCode(10) + cur : cur;
    nm.setAttribute('data-tip', tip); idEl.setAttribute('data-tip', tip);
    idEl.textContent = (name === cur || name === humanId(shortId(cur)) && !e) ? (isTag ? cur : "") : cur;
  }
  var pick = kBtn(I18n.t("cadeditor.ui.forms.4aea6b5ff7"), function () {
    openRegPick({ reg: o.reg, tag: o.tag, current: cur, title: o.title, fallback: o.fallback, entityText: o.entityText, onEntityNbt: o.onEntityNbt, onPick: function (id) { cur = id; paint(); o.onChange(cur); } });
  }, { icon: "grid" });
  var kids = [h("div", { class: "rs-txt" }, [nm, idEl]), pick];
  if (o.allowClear) kids.push(kBtn(I18n.t("cadeditor.ui.picker.bce2377283"), function () { cur = ""; paint(); o.onChange(""); }, { icon: "close" }));
  paint();
  return { el: h("div", { class: "k-row rs-field" }, kids), set: function (v) { cur = v || ""; paint(); } };
}
/* ---- 方块状态（BlockState.CODEC 的 {Name, Properties?}）：选方块 + 每个属性一行选值 ----
   属性名和可选值读游戏的方块属性表（Reg.blockProps）；选回默认值就不再写进 Properties，和原版保存一致。换了方块就清掉旧属性。
   o: { label:'行标题（默认「方块」）', sub, allowNone:true （显示「清除」，清除后 onChange(null)）, empty:'（未选择）', title }。返回元素（标题行 + 每个属性一行），直接 appendChild 到页面上。 */
function kBlockState(value, onChange, o) {
  o = o || {};
  var cur = value && value.Name ? { Name: Reg.full(value.Name), Properties: clone(value.Properties || {}) } : null;
  var box = h('div', { class: 'k-bstate' });
  var off = Reg.on(function (kind, kinds) { if (!inDocument(box)) { off(); return; } if ((kinds || []).indexOf('block_properties') >= 0) draw(); });
  function emit() {
    if (!cur) { onChange(null); return; }
    var out = { Name: cur.Name }; if (Object.keys(cur.Properties).length) out.Properties = clone(cur.Properties);
    onChange(out);
  }
  function draw() {
    clear(box);
    var sel = kRegSelect({ reg: 'block', value: cur ? cur.Name : '', title: o.title || I18n.t("cadeditor.ui.picker.289673e823"), empty: o.empty, allowClear: false,
      onChange: function (id) { cur = id ? { Name: Reg.full(id), Properties: {} } : null; emit(); draw(); } });
    var top = [sel.el]; if (o.allowNone && cur) top.push(kBtn(I18n.t("cadeditor.ui.picker.bce2377283"), function () { cur = null; emit(); draw(); }, { icon: 'trash' }));
    box.appendChild(xRow({ icon: false, title: o.label || I18n.t("cadeditor.ui.picker.2753766d18"), sub: o.sub, right: h('div', { class: 'k-row' }, top) }));
    if (!cur) return;
    var p = Reg.blockProps(cur.Name);
    if (p === null) { box.appendChild(kHint(I18n.t("cadeditor.ui.picker.66e84ee7d8"))); return; }
    if (!p || !Object.keys(p).length) return;
    Object.keys(p).forEach(function (name) {
      var info = p[name], vals = (info.values || []).slice(), now = cur.Properties[name] !== undefined ? cur.Properties[name] : info.default;
      function set(v) { if (v === info.default) delete cur.Properties[name]; else cur.Properties[name] = v; emit(); }
      var ctl;
      if (info.values.length === 2 && info.values.indexOf('true') >= 0) ctl = kToggle(now === 'true', function (on) { set(on ? 'true' : 'false'); }).el;
      else if (vals.length <= 4) ctl = kSeg(vals.map(function (x) { return { v: x, label: wePropVal(x) }; }), now, set).el;
      else ctl = kSelect(vals.map(function (x) { return { v: x, label: wePropVal(x) }; }), now, set, { width: 200 }).el;
      box.appendChild(xRow({ icon: false, title: wePropName(name), sub: I18n.t("cadeditor.ui.eschema.5564c10bef", (wePropVal(info.default))), tip: name, right: ctl }));
    });
  }
  draw();
  return box;
}
/* ---- 属性：读游戏当前的 attribute 注册表（含模组属性） ---- */
function openAttrPicker(o) {   /* o: { exclude:[short ids], onConfirm(fullIds) } */
  var present = {}; (o.exclude || []).forEach(function (x) { present[Reg.full(x)] = 1; });
  function entries() {
    var src = Reg.options('attribute') || (Reg.preview() ? EDATA.attrs.map(function (a) { return { v: Reg.full(a.id), label: a.name, sub: a.desc || a.id }; }) : []);
    return src.map(function (e) { return { full: Reg.full(e.v), name: optLabel(e), sub: e.v, icon: function () { return attrIconEl(shortId(e.v)); } }; });
  }
  var cats = [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }, { id: 'mod', name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: 'cube', filter: function (e) { return Reg.isMod(e.full); } }];
  openPicker({ kind: 'attr', emptyReg: 'attribute', title: I18n.t("cadeditor.ui.cards2.ca2d78680b"), sub: I18n.t("cadeditor.ui.picker.d96f8b3fb3"), icon: 'plus', entriesFn: entries, cats: cats, selected: o.selected, locked: present, live: !Reg.preview(), searchHint: I18n.t("cadeditor.ui.picker.8b686dfe76"), custom: { placeholder: '' }, onConfirm: o.onConfirm });
}

/* ---- 标签 / 条目 单选：工具规则、免疫伤害、修理材料。标签与条目都读游戏实时注册表，常用快捷项排最前，也可手输 #模组id:标签 ----
   o: { title, tagsReg:'block', entryReg:'block'|null, quick:[{v,label,sub}], tagsOnly, onConfirm(id) } */
function openTagPicker(o) {
  function quicks() { return (o.quick || []).filter(function (q) { return Reg.preview() || (q.v.charAt(0) === '#' ? Reg.entryState('tags:' + o.tagsReg, q.v.substring(1)) : (o.entryReg ? Reg.entryState(o.entryReg, q.v) : null)) === true; }); }
  var tk = Reg.lazyKind('tags:' + o.tagsReg), ek = o.entryReg && !o.tagsOnly ? Reg.lazyKind(o.entryReg) : null;
  if (tk || ek) {   // 标签 / 条目目录很大：各自问宿主，合并显示；常用快捷项（本地）排最前
    var srcs = [];
    if (tk) srcs.push({ kind: tk, group: 'tag', rowFn: function (r) { var v = '#' + Reg.full(r.id); return { full: v, name: r.name && r.name !== r.id ? r.name : r.id, sub: (r.count !== undefined ? I18n.t("cadeditor.ui.picker.21caf36a57", (r.count)) : I18n.t("cadeditor.ui.eschema.1d0fd5f933")), group: 'tag' }; } });
    if (ek) srcs.push({ kind: ek, group: 'entry', rowFn: function (r) { var e = Reg.rowToOpt(o.entryReg, r); return { full: e.v, name: optLabel(e), sub: e.v, group: 'entry', icon: o.entryIcon ? function () { return o.entryIcon(e); } : null }; } });
    function qk() { return quicks().map(function (q) { return { full: q.v, name: q.label, sub: q.sub || q.v, group: 'quick' }; }); }
    var tcats = [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }];
    if ((o.quick || []).length) tcats.push({ id: 'quick', name: I18n.t("cadeditor.ui.picker.4563c57b51"), icon: 'star' });
    if (tk) tcats.push({ id: 'tag', name: I18n.t("cadeditor.ui.eschema.1d0fd5f933"), icon: 'tag' });
    if (ek) tcats.push({ id: 'entry', name: I18n.t("cadeditor.ui.picker.ffbfa6b0bc"), icon: 'cube' });
    openPicker({ kind: 'tagpick', title: o.title, sub: '', icon: 'tag', single: !o.multi, selected: o.selected, controls: o.controls, validateConfirm: o.validateConfirm, footExtra: o.footExtra, entries: [], lazySources: srcs, lazyQuickFn: qk, cats: tcats, live: true, searchHint: I18n.t("cadeditor.ui.picker.4c65186f00"), custom: { hash: true }, confirmLabel: o.multi ? I18n.t("cadeditor.ui.picker.812c3a6936") : I18n.t("cadeditor.ui.picker.ea2fc4a944"), onConfirm: function (ids) { if (o.multi) o.onConfirm(ids); else o.onConfirm(ids[0]); } });
    return;
  }
  function build() {
    var quick = {}; quicks().forEach(function (q) { quick[q.v] = q; });
    var out = quicks().map(function (q) { return { full: q.v, name: q.label, sub: q.sub || q.v, group: 'quick' }; });
    var tags = Reg.options('tags:' + o.tagsReg) || [];
    tags.forEach(function (t) { var v = '#' + t.v; if (quick[v]) return; out.push({ full: v, name: t.v, sub: (t.n !== undefined ? I18n.t("cadeditor.ui.picker.21caf36a57", (t.n)) : I18n.t("cadeditor.ui.eschema.1d0fd5f933")), group: 'tag' }); });
    if (o.entryReg && !o.tagsOnly) (Reg.options(o.entryReg) || []).forEach(function (e) { out.push({ full: e.v, name: optLabel(e), sub: e.v, group: 'entry', icon: o.entryIcon ? function () { return o.entryIcon(e); } : null }); });
    return out;
  }
  var cats = [{ id: 'all', name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: 'grid' }, { id: 'quick', name: I18n.t("cadeditor.ui.picker.4563c57b51"), icon: 'star', filter: function (e) { return e.group === 'quick'; } }, { id: 'tag', name: I18n.t("cadeditor.ui.eschema.1d0fd5f933"), icon: 'tag', filter: function (e) { return e.group === 'tag'; } }];
  if (o.entryReg && !o.tagsOnly) cats.push({ id: 'entry', name: I18n.t("cadeditor.ui.picker.ffbfa6b0bc"), icon: 'cube', filter: function (e) { return e.group === 'entry'; } });
  if (!(o.quick && o.quick.length)) cats.splice(1, 1);
  openPicker({ kind: 'tagpick', title: o.title, sub: '', icon: 'tag', single: !o.multi, selected: o.selected, controls: o.controls, validateConfirm: o.validateConfirm, footExtra: o.footExtra, entriesFn: build, cats: cats, live: Reg.live(), searchHint: I18n.t("cadeditor.ui.picker.4c65186f00"), custom: { hash: true }, confirmLabel: o.multi ? I18n.t("cadeditor.ui.picker.812c3a6936") : I18n.t("cadeditor.ui.picker.ea2fc4a944"), onConfirm: function (ids) { if (o.multi) o.onConfirm(ids); else o.onConfirm(ids[0]); } });
}

regEnumTable('attribute_operation', OPS, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, title: id }; });
regEnumTable('rarity', RARITY, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, title: id }; });
regEnumTable('equipment_slot_group', SLOTS, function (x) { return x; }, function (id, n) { SLOT_ZH[id] = SLOT_ZH[id] || n; return id; });

/* ---- 通用表单里的“选择…”：单选一个注册表条目，标签字段还能选 #标签；数据到达后列表自动刷新，也能手输 ---- */
function openRegPick(o) {   /* o: { reg, tag, current, title, fallback, onPick(id), onEntityNbt(snbtText, entry) } */
  var fullData = !o.tag && !o.multi && ((o.reg === 'entity_type' && typeof o.onEntityNbt === 'function') || (o.reg === 'item' && typeof o.onStack === 'function'));
  function editSelected(id) {
    var selector = $('modal'), valid = nestedDraftGuard();
    function commit(value) { if ($('modal') !== selector) return; closeModal(); if (o.reg === 'entity_type') o.onEntityNbt(value); else o.onStack(value); }
    if (o.reg === 'entity_type') {
      try {
        var obj = o.entityText && o.current && Reg.full(o.current) === Reg.full(id) ? vaultEntityObj(o.entityText()) : { id: Reg.full(id) };
        if (!obj.id) obj.id = Reg.full(id);
        openEntityDraft(nbtMerge(obj, null), { commit: commit, valid: valid });
      } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('entity.selection.edit', e); toast(I18n.t("cadeditor.ui.eschema.3020fa499b", (e.message || e)), 'error'); }
    } else openNestedItem({ id: Reg.full(id), count: 1, comps: {}, removed: {} }, { title: I18n.t("cadeditor.ui.picker.ed341a3156"), commitUnchanged: true, valid: valid, commit: commit });
  }
  if (o.reg === 'entity_type' && !o.multi) {
    var fullEntity = !o.tag && typeof o.onEntityNbt === 'function';
    var vaultPick = kBtn(fullEntity ? I18n.t("cadeditor.ui.picker.e51bf4033d") : I18n.t("cadeditor.ui.picker.a4474f8b88"), function () {
      var selector = $('modal'), doc = Store.doc(), before = doc ? snapOf(doc) : null;
      var world = typeof WE !== 'undefined' ? WE.w : null, revision = world && world.revision;
      openVault({ kind: 'entity', stacked: true, pickEntity: function (snbt, entry) {
        // The Vault restores this selector before delivering. Never write a stale form.
        if ($('modal') !== selector || Store.doc() !== doc || (doc && snapOf(doc) !== before) ||
            (typeof WE !== 'undefined' && (WE.w !== world || (world && world.revision !== revision)))) {
          toast(I18n.t("cadeditor.ui.picker.285c620594"), 'warn'); return;
        }
        var payload;
        try {
          if (entry && entry.kind !== undefined && entry.kind !== 'entity') throw new Error(I18n.t("cadeditor.ui.picker.960d0efc20"));
          payload = vaultEntityPayload(snbt);
          if (!/^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/.test(payload.type)) throw new Error(I18n.t("cadeditor.ui.eschema.388a596c77"));
        } catch (e) { toast(e.message || I18n.t("cadeditor.ui.picker.699edf5f92"), 'warn'); return; }
        closeModal();
        if (fullEntity) o.onEntityNbt(snbt, entry);
        else { o.onPick(Reg.full(payload.type)); toast(I18n.t("cadeditor.ui.picker.d486ec6cfc"), 'info'); }
      } });
    }, { icon: 'chest', title: fullEntity ? I18n.t("cadeditor.ui.picker.cdbb139011") : I18n.t("cadeditor.ui.picker.77ccad0aa9") });
    o = Object.assign({}, o, { footExtra: (o.footExtra || []).concat([vaultPick]) });
  }
  if (o.reg === "sound_event") { openSoundPicker({ current: o.current, onConfirm: o.onPick }); return; }   // 和食用/穿戴音效是同一个带试听的音效选择窗
  if (o.reg === "jukebox_song" || o.reg === "instrument") {   // 唱片曲目 / 山羊角：带试听（用它们各自的声音事件）
    var snds = {};
    var buildS = function () { return (Reg.options(o.reg) || []).map(function (e) { snds[Reg.full(e.v)] = e.sound; return { full: Reg.full(e.v), name: optLabel(e), sub: e.v + (e.len ? I18n.t("cadeditor.ui.picker.87ca674f8f", (Math.round(e.len))) : ""), icon: function () { return uiIcon("music", 16); } }; }); };
    openPicker({ kind: "regpick-" + o.reg, emptyReg: o.reg, title: o.title || I18n.t("cadeditor.ui.picker.c11330b852"), sub: "", icon: "music", single: true, entriesFn: buildS, cats: [{ id: "all", name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: "grid" }, { id: "mod", name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: "cube", filter: function (en) { return Reg.isMod(en.full); } }], live: Reg.live(), searchHint: I18n.t("cadeditor.ui.picker.5b46bc7bad"), custom: {}, preview: function () {}, soundOf: function (full) { return snds[full]; }, confirmLabel: I18n.t("cadeditor.ui.picker.ea2fc4a944"), onConfirm: function (ids) { o.onPick(ids[0]); } });
    return;
  }
  if (o.tag) { openTagPicker({ title: o.title || I18n.t("cadeditor.ui.picker.8d6db8e3f4"), tagsReg: o.reg, entryReg: o.reg, entryIcon: function (e) { return refIcon(o.reg, e.v); }, footExtra: o.footExtra, onConfirm: o.onPick }); return; }
  function build() {
    var l = Reg.options(o.reg) || (Reg.preview() ? o.fallback : null) || [];
    return l.map(function (e) { return { full: Reg.full(e.v), name: refName(o.reg, e), sub: e.v, icon: function () { return refIcon(o.reg, e.v); } }; });
  }
  var cats = [{ id: "all", name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: "grid" }, { id: "mod", name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: "cube", filter: function (en) { return Reg.isMod(en.full); } }];
  var lk = Reg.lazyKind(o.reg);
  if (lk) {   // 大目录：不在页面里，选择窗直接问宿主
    openPicker({ kind: "regpick-" + o.reg, emptyReg: o.reg, lazy: true, lazyKind: lk, rowFn: function (r) { var e = Reg.rowToOpt(o.reg, r); return { full: Reg.full(e.v), name: refName(o.reg, e), sub: e.v, icon: function () { return refIcon(o.reg, e.v); } }; },
      footExtra: o.footExtra, onEditSelection: fullData ? editSelected : null, initialId: fullData ? o.current : null, title: o.title || I18n.t("cadeditor.ui.picker.c11330b852"), sub: o.multi ? I18n.t("cadeditor.ui.picker.d96f8b3fb3") : "", icon: "grid", single: !o.multi, selected: o.selected, locked: o.locked, entries: [], cats: [{ id: "all", name: I18n.t("cadeditor.ui.picker.5c55a67935"), icon: "grid" }, { id: "mod", name: I18n.t("cadeditor.ui.picker.9ea6b4816b"), icon: "cube" }],
      live: true, searchHint: I18n.t("cadeditor.ui.picker.5b46bc7bad"), custom: { placeholder: I18n.t("cadeditor.ui.picker.a31a383623") }, confirmLabel: o.multi ? I18n.t("cadeditor.ui.picker.812c3a6936") : I18n.t("cadeditor.ui.picker.ea2fc4a944"), onConfirm: function (ids) { if (o.multi) o.onPickMany(ids); else o.onPick(ids[0]); } });
    return;
  }
  openPicker({ kind: "regpick-" + o.reg, emptyReg: o.reg, hostKind: Reg.hostKind(o.reg), footExtra: o.footExtra, onEditSelection: fullData ? editSelected : null, initialId: fullData ? o.current : null, title: o.title || I18n.t("cadeditor.ui.picker.c11330b852"), sub: o.multi ? I18n.t("cadeditor.ui.picker.d96f8b3fb3") : "", icon: "grid", single: !o.multi, selected: o.selected, locked: o.locked, entriesFn: build, cats: cats, live: Reg.live(), searchHint: I18n.t("cadeditor.ui.picker.5b46bc7bad"), custom: { placeholder: I18n.t("cadeditor.ui.picker.a31a383623") }, confirmLabel: o.multi ? I18n.t("cadeditor.ui.picker.812c3a6936") : I18n.t("cadeditor.ui.picker.ea2fc4a944"), onConfirm: function (ids) { if (o.multi) o.onPickMany(ids); else o.onPick(ids[0]); } });
}
/* 条目名：有翻译名就用翻译名；没有就用物品名（装备外观、方块和物品同名）；再不行才把路径变成易读的英文。完整 ID 不再当名字 */
function refName(reg, e) {
  if (e.label && e.label !== e.v) return e.label;
  if (reg === 'profile_texture' || reg === 'profile_cape' || reg === 'profile_elytra' || reg === 'camera_overlay') return humanId(shortId(e.v).split('/').pop().replace(/.png$/, ''));   // 资源文件：名字取文件名，完整 ID 在副标题
  var inm = (reg === "item" || reg === "block" || reg === "equipment_asset" || reg === "entity_type") ? Reg.itemName(e.v) : null;
  return inm || humanId(shortId(e.v));
}
/* 内置的常用标签快捷项只保留游戏里真的存在的（模组 / 版本变动后不会点出一个不存在的标签）；游戏数据没到时原样保留。
   list 的每项 {v,...}，v 以 # 开头的才检查 */
function keepKnownTags(list, reg) {
  if (!Reg.live()) return list;
  var tlk = Reg.lazyKind('tags:' + reg);
  if (tlk) {   // 标签目录在宿主：只精确查这几个快捷项是否存在，没查到前原样保留
    return list.filter(function (x) { if (!x.v || x.v.charAt(0) !== '#') return true; var row = Reg.want(tlk, Reg.full(x.v.substring(1))); return row !== null || Reg.rows[tlk][Reg.full(x.v.substring(1))] !== false; });
  }
  var tags = Reg.options('tags:' + reg);
  if (!tags || !tags.length) return list;
  var have = {}; tags.forEach(function (t) { have['#' + Reg.full(t.v)] = 1; });
  return list.filter(function (x) { return !x.v || x.v.charAt(0) !== '#' || have[x.v]; });
}
/* 纹饰材料 / 图案的图标：用游戏里 PROVIDES_TRIM_MATERIAL 的原料物品 / 真实的锻造模板，模组的也能显示 */
function liveTrimIcon(reg, v, size) {
  if (!Reg.live()) return null;
  Reg.options(reg);   // 没取过就顺便请求，到了会重画
  var l = Reg.list(reg === 'trim_material' ? 'trim_materials' : 'trim_patterns'), f = Reg.full(v);
  if (!l) return null;
  for (var i = 0; i < l.length; i++) {
    if (l[i].id !== f) continue;
    var it = (l[i].ingredients || l[i].template_items || [])[0] || l[i].ingredient || l[i].template_item;
    return it ? itemIcon(Reg.isMod(it) ? it : shortId(it), size) : null;
  }
  return null;
}
/* 生物的图：用它的刷怪蛋图标（模组生物也行）；没有蛋的（箭、火球、船……）用爪印 */
function entityIcon(typeId, size) {
  var egg = Reg.eggFor(typeId);
  return egg ? itemIcon(Reg.isMod(egg) ? egg : shortId(egg), size || 16) : uiIcon('paw', size || 16);
}
function refIcon(reg, v, size) {
  size = size || 16;
  if (reg === 'entity_type') return entityIcon(v, size);
  if (reg === 'trim_material' || reg === 'trim_pattern') { var lt = liveTrimIcon(reg, v, size); if (lt) return lt; }
  if (reg === 'trim_material' && typeof TRIM_ICON !== 'undefined' && TRIM_ICON[shortId(v)] && !Reg.isMod(Reg.full(v))) return itemIcon(TRIM_ICON[shortId(v)], size);
  if (reg === 'trim_pattern' && typeof EDATA !== 'undefined' && EDATA.ipt && EDATA.ipt[shortId(v) + '_armor_trim_smithing_template'] !== undefined && !Reg.isMod(Reg.full(v))) return itemIcon(shortId(v) + '_armor_trim_smithing_template', size);
  if (reg === "item" || reg === "block") return itemIcon(shortId(v), 16);
  if (reg === "mob_effect") return effectIcon(shortId(v), 16);
  return uiIcon(reg === "sound_event" ? "music" : "grid", 16);
}

/* 图标的统一入口：按注册表种类选图（属性走 attrIconEl，其余走 refIcon） */
function iconOf(reg, id, size) { return reg === 'attribute' ? attrIconEl(id) : refIcon(reg, id, size); }

/* 列表是空的时候，说明为什么空：还在向游戏要数据、游戏没有这类条目、还是游戏端没有响应（多半是模组 jar 没更新 / 没重启） */
var EMPTY_T0 = Date.now();
function emptyReason(q, since, reg) {
  if (q && String(q).trim()) return I18n.t("cadeditor.ui.picker.44a38f23c5", (String(q).trim()));
  if (reg && Reg.live() && Reg.unavailable(reg)) return I18n.t("cadeditor.ui.picker.7d64b58a87", (Reg.unavailable(reg)));
  if (!Reg.live()) return Reg.preview() ? I18n.t("cadeditor.ui.picker.04e87dc848") : I18n.t("cadeditor.ui.picker.8710cd0344");
  if (reg) { var kind = Reg.hostKind(reg), k = Reg.kinds[kind]; if (k && k.done && !k.unavail && !k.error) return I18n.t("cadeditor.ui.picker.eddf3a19ce"); }
  var waited = Date.now() - (since || EMPTY_T0);
  return waited < 4000 ? I18n.t("cadeditor.ui.picker.cf4b6b2faf") : I18n.t("cadeditor.ui.picker.3c3508be3c");
}

/* 标签的显示名：游戏里的翻译名（tags:<reg> 的 name，缺翻译时等于完整 id → 返回 null） */
function tagLabel(reg, hashId) {
  if (!Reg.live() || !hashId) return null;
  if (Reg.lazyKind('tags:' + reg)) { var tr = Reg.want(Reg.lazyKind('tags:' + reg), Reg.full(String(hashId).replace(/^#/, ''))); return tr && tr.name && tr.name !== tr.id ? tr.name : null; }
  var l = Reg.options('tags:' + reg), f = '#' + Reg.full(String(hashId).replace(/^#/, ''));
  if (!l) return null;
  for (var i = 0; i < l.length; i++) if ('#' + Reg.full(l[i].v) === f) return l[i].label && l[i].label !== l[i].v ? l[i].label : null;
  return null;
}
