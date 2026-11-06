var AUTO_BODY = {};   /* 通用卡片展开后的专门控件（cards4.js 填充） */
/* 所有试听共用宿主的一条通道，按钮状态只取已确认的回执。 */
var SoundPreview = {
  id: '', state: 'stopped',
  toggle: function (id, volume, pitch) {
    if (!id) return;
    if (typeof oriel === 'undefined' || !oriel.send || !oriel.data || !oriel.data.hostAudio) { toast('暂停试听需要新版物品工坊宿主，请更新模组并重启客户端', 'warn'); return; }
    oriel.send('sound_preview', { action: 'toggle', id: id, volume: volume === undefined ? 1 : volume, pitch: pitch === undefined ? 1 : pitch });
  },
  accept: function (data) {
    if (!data) return;
    if (data.state === 'error') { toast(data.error || '试听失败', 'warn'); return; }
    this.id = data.id || ''; this.state = data.state; this.paint();
  },
  paint: function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sound-preview]'), function (button) { SoundPreview.paintButton(button); });
  },
  paintButton: function (button) {
    var active = button.getAttribute('data-sound-preview') === this.id, playing = active && this.state === 'playing', paused = active && this.state === 'paused';
    clear(button); button.appendChild(playing ? h('span', { text: 'Ⅱ' }) : uiIcon('play', 14));
    button.setAttribute('data-tip', playing ? '暂停试听' : paused ? '继续试听' : '试听');
    button.setAttribute('aria-label', playing ? '暂停试听' : paused ? '继续试听' : '试听');
    button.classList.toggle('on', playing);
  },
  button: function (id, fn) {
    var button = h('div', { class: 'k-mini', 'data-sound-preview': id || '' });
    activate(button, function (ev) { ev.stopPropagation(); fn(); }); this.paintButton(button); return button;
  }
};
if (typeof oriel !== 'undefined' && oriel.on) oriel.on('data', function (data, key) { if (key === 'sound_preview') SoundPreview.accept(data.sound_preview || data); });
/* 通用选择器窗口：左边分类，右边搜索 + 列表，可多选（勾选后一次「添加所选」）或单选（音效：点一下试听，选定后确认）。
   数据一律来自 Reg（游戏实时注册表；没有宿主时是内置数据，窗口里会标明）。 */
var ENCH_TAG_ZH = { curse: '诅咒', treasure: '宝藏', tradeable: '村民交易', non_treasure: '非宝藏', in_enchanting_table: '附魔台', on_random_loot: '随机战利品', on_traded_equipment: '交易装备', on_mob_spawn_equipment: '生物装备', double_trade_price: '交易加价', smelts_loot: '熔炼战利品' };
var SOUND_GROUP_ZH = { block: '方块', entity: '实体', item: '物品', ui: '界面', music: '音乐', music_disc: '唱片', ambient: '环境', weather: '天气', event: '事件', particle: '粒子', enchant: '附魔', entity_effect: '效果', intentionally_empty: '空' };
var EFFECT_CAT_ZH = { beneficial: '正面', harmful: '负面', neutral: '中性' };
function pathOf(full) { var i = String(full).indexOf(':'); return i < 0 ? full : full.substring(i + 1); }

/* o: { kind, title, sub, entries:[{full,name,sub,note,disabled,icon():el,tag}], cats:[{id,name,icon,filter(e)}], locked:{full:1}, single, custom:{placeholder}, confirmLabel, onConfirm(ids), preview(full), live } */
function openPicker(o) {
  var openedAt = Date.now();
  var sel = {}, selN = 0, catSel = 'all', limit = 80, q = '', vals = {}, defs = {}, PR = o.params || [];
  PR.forEach(function (p) { defs[p.key] = p.def; });
  function valOf(full) { if (!vals[full]) { vals[full] = {}; PR.forEach(function (p) { vals[full][p.key] = defs[p.key]; }); } return vals[full]; }
  function clampP(p, v, e) { var mx = p.max; if (p.maxOf && e && e[p.maxOf]) mx = e[p.maxOf]; v = Math.round(v); if (isNaN(v)) v = p.def; if (v < p.min) v = p.min; if (!p.soft && mx !== undefined && v > mx) v = mx; return v; }
  /* 每行右侧的参数输入：只在勾选后出现 */
  function paramsEl(full, e) {
    if (!PR.length) return null;
    var cur = valOf(full), box = h('div', { class: 'pkp' });
    box.addEventListener('click', function (ev) { ev.stopPropagation(); }); box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    PR.forEach(function (p) {
      var inp = h('input', { class: 'k-input pkn', type: 'text', spellcheck: 'false' }); inp.value = String(cur[p.key]);
      inp.addEventListener('input', function () { var n = parseInt(inp.value, 10); if (!isNaN(n) && n >= p.min) cur[p.key] = n; });
      inp.addEventListener('blur', function () { cur[p.key] = clampP(p, parseInt(inp.value, 10), e); inp.value = String(cur[p.key]); });
      inp.setAttribute('data-k', p.key);
      box.appendChild(h('span', { class: 'k-sub', text: p.label })); box.appendChild(inp);
      if (p.unit) box.appendChild(h('span', { class: 'k-sub', text: p.unit }));
    });
    return box;
  }
  /* 勾选时，这一行直接带上「统一设置」里当前的值 */
  function adopt(full, e) { if (!PR.length) return; var cur = valOf(full); PR.forEach(function (p) { cur[p.key] = clampP(p, defs[p.key], e); }); syncRows(); }
  function syncRows() {
    Array.prototype.forEach.call(list.querySelectorAll('.addrow.on'), function (r) {
      var f = r.getAttribute('data-full'); if (!f || !vals[f]) return;
      Array.prototype.forEach.call(r.querySelectorAll('.pkn'), function (i) { i.value = String(vals[f][i.getAttribute('data-k')]); });
    });
  }
  var list = h('div', { class: 'addlist' }), cats = h('div', { class: 'addcats' }), foot = h('div', { class: 'k-mf' });
  var info = h('span', { class: 'k-sub' }), confirm;
  if (o.entriesFn) { o.entries = o.entriesFn(); var unsub = Reg.on(function () { if (!$('modal')) { unsub(); return; } o.entries = o.entriesFn(); paintCats(); paint(); }); }
  var search = h('input', { class: 'k-input', type: 'text', placeholder: (o.searchHint || '搜索名称或 ID') + (o.custom && !o.custom.hash ? '；也可直接输入 模组id:名字' : ''), spellcheck: 'false' });
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
      var n = o.entries.filter(function (e) { return !c.filter || c.filter(e); }).length;
      var t = h('div', { class: 'addcat' + (catSel === c.id ? ' on' : '') }, [uiIcon(c.icon || 'grid', 14), h('span', { text: c.name }), h('em', { class: 'n', text: String(n) })]);
      activate(t, function () { catSel = c.id; limit = 80; paintCats(); paint(); });
      cats.appendChild(t);
    });
  }
  function paintFoot() {
    info.textContent = o.single ? (selN ? '已选：' + Object.keys(sel)[0] : (o.preview ? '点一条试听并选中' : '点一条选中')) : '已勾选 ' + selN + ' 项';
    if (confirm) { confirm.classList.toggle('dim', !selN); }
  }
  function pick(e, row) {
    if (e.disabled || (o.locked && o.locked[e.full])) return;
    if (o.single) { sel = {}; selN = 0; Array.prototype.forEach.call(list.querySelectorAll('.addrow.on'), function (r) { r.classList.remove('on'); }); }
    if (sel[e.full]) { delete sel[e.full]; selN--; row.classList.remove('on'); }
    else { sel[e.full] = 1; selN++; row.classList.add('on'); adopt(e.full, e); }
    if (o.single && o.preview) o.preview(e.full);
    paintFoot();
  }
  /* 过滤：条目多时按时间片分批（kFilterSliced），每批都是一次新的脚本入口，不会触发单次入口指令预算而停页。
     分批期间旧列表保持原样，算完再换，不会闪空白。 */
  var filterCancel = null, lastVis = [];
  function paint() {
    if (filterCancel) { filterCancel(); filterCancel = null; }
    var cat = catOf(catSel), s = q.trim().toLowerCase();
    var pool = o.entries.filter(function (e) { return !cat.filter || cat.filter(e); });
    if (!s) { render(pool); return; }
    filterCancel = kFilterSliced(pool, function (e) { return kMatch(e.name + ' ' + e.full + ' ' + (e.sub || ''), s); }, render);
  }
  function render(vis) {
    lastVis = vis;
    var shown = vis.slice(0, limit);
    clear(list);
    var qq = q.trim().toLowerCase();
    if (o.custom && (o.custom.hash ? /^#?[a-z0-9_.\-]+:[a-z0-9_.\/\-]+$/ : /^[a-z0-9_.\-]+:[a-z0-9_.\/\-]+$/).test(qq) && !o.entries.some(function (e) { return e.full === qq; })) {
      var crow = h('div', { class: 'addrow pk custom' + (sel[qq] ? ' on' : '') }, [o.single ? null : h('div', { class: 'pkc', text: '✓' }), h('div', { class: 'ic' }, [uiIcon('plus', 16)]), h('div', { class: 'tx' }, [h('div', { class: 'z', text: '使用自定义 ID：' + qq }), h('div', { class: 's', text: '不在列表里（比如还没加载的模组内容），按这个 ID 原样写入' })]), paramsEl(qq, null)]);
      crow.setAttribute('data-full', qq);
      crow.addEventListener('click', function () { if (o.single) { sel = {}; selN = 0; } if (sel[qq]) { delete sel[qq]; selN--; crow.classList.remove('on'); } else { sel[qq] = 1; selN++; crow.classList.add('on'); adopt(qq, null); } paintFoot(); });
      list.appendChild(crow);
    }
    shown.forEach(function (e) {
      var locked = !!(o.locked && o.locked[e.full]);
      var kids = [o.single ? null : h('div', { class: 'pkc', text: '✓' })];
      kids.push(h('div', { class: 'ic' }, [e.icon ? e.icon() : uiIcon('grid', 16)]));
      kids.push(h('div', { class: 'tx' }, [h('div', { class: 'z', text: e.name }), h('div', { class: 's', text: e.note || e.sub || e.full })]));
      if (o.single && o.preview) kids.push(SoundPreview.button(o.soundOf ? o.soundOf(e.full) : e.full, function () { o.preview(e.full); }));
      if (locked) kids.push(h('span', { class: 'k-tag dim', text: '已有' })); else if (e.tag) kids.push(h('span', { class: 'k-tag dim', text: e.tag }));
      var pe = paramsEl(e.full, e); if (pe) kids.push(pe);
      var row = h('div', { 'data-full': e.full, class: 'addrow pk' + (locked || e.disabled ? ' has' : '') + (sel[e.full] ? ' on' : '') }, kids);
      row.addEventListener('click', function () { pick(e, row); });
      list.appendChild(row);
    });
    if (vis.length > shown.length) { var more = h('div', { class: 'k-add', text: '显示更多（还有 ' + (vis.length - shown.length) + ' 个）' }); activate(more, function () { limit += 120; render(lastVis); }); list.appendChild(more); }
    if (!vis.length) list.appendChild(xEmpty(emptyReason(q, openedAt, o.emptyReg)));
  }
  var searchT = null;
  search.addEventListener('input', function () { q = search.value; limit = 80; clearTimeout(searchT); searchT = setTimeout(paint, 90); });   // 连续敲字只在停顿后搜一次
  var top = [search];
  if (PR.length && !o.single) {
    var bar = h('div', { class: 'k-row pk-ctl pk-bulk' }, [h('span', { class: 'k-sub', text: '统一设置' })]);
    PR.forEach(function (p) {
      var bi = h('input', { class: 'k-input pkn', type: 'text', spellcheck: 'false' }); bi.value = String(p.def);
      function apply() { var v = clampP(p, parseInt(bi.value, 10), null); if (p.maxOf) v = Math.max(p.min, parseInt(bi.value, 10) || p.def); defs[p.key] = v; bi.value = String(v); Object.keys(sel).forEach(function (f) { var e = o.entries.filter(function (x) { return x.full === f; })[0]; valOf(f)[p.key] = clampP(p, v, e); }); syncRows(); }
      bi.addEventListener('blur', apply); bi.addEventListener('input', function () { var n = parseInt(bi.value, 10); if (isNaN(n) || n < p.min) return; defs[p.key] = n; Object.keys(sel).forEach(function (f) { var e = o.entries.filter(function (x) { return x.full === f; })[0]; valOf(f)[p.key] = clampP(p, n, e); }); syncRows(); }); onKey(bi, { Enter: apply });
      bar.appendChild(h('span', { class: 'k-sub', text: p.label })); bar.appendChild(bi); if (p.unit) bar.appendChild(h('span', { class: 'k-sub', text: p.unit }));
      if (p.maxOf) bar.appendChild(kBtn('各自最高', function () { Object.keys(sel).forEach(function (f) { var e = o.entries.filter(function (x) { return x.full === f; })[0]; if (e && e[p.maxOf]) valOf(f)[p.key] = e[p.maxOf]; }); syncRows(); }, { cls: 'sm' }));
    });
    top.push(bar);
  }
  if (o.single && o.preview) {
    var vol = 1, pit = 1;
    o.preview = function (full) {
      var sid = o.soundOf ? o.soundOf(full) : full;
      if (!sid) { toast('这一项没有可试听的声音：游戏没有提供它的声音事件（游戏里的编辑器模组可能是旧版，请更新并重启）', 'warn'); dbg('试听失败：' + full + ' 没有 sound_event'); return; }
      SoundPreview.toggle(sid, vol, pit); dbg('试听控制 ' + sid + ' 音量 ' + vol + ' 音调 ' + pit + '（来自 ' + full + '）');
    };
    top.push(h('div', { class: 'k-row pk-ctl' }, [h('span', { class: 'k-sub', text: '音量' }), kSeg([{ v: 0.5, label: '50%' }, { v: 1, label: '100%' }], 1, function (v) { vol = v; }).el, h('span', { class: 'k-sub', text: '音调' }), kSeg([{ v: 0.5, label: '低' }, { v: 1, label: '正常' }, { v: 1.5, label: '高' }, { v: 2, label: '很高' }], 1, function (v) { pit = v; }).el]));
  }
  var cancel = kBtn('取消', closeModal);
  confirm = kBtn(o.confirmLabel || '添加所选', function () { if (!selN) return; var ids = Object.keys(sel); closeModal(); o.onConfirm(ids, vals); }, { cls: 'pri' });
  foot.appendChild(info); foot.appendChild(h('div', { class: 'grow' })); foot.appendChild(cancel); foot.appendChild(confirm);
  var x = h('div', { class: 'k-mini', text: '×' }); activate(x, closeModal);
  var srcTag = h('span', { class: 'k-tag' + (o.live ? '' : ' dim'), text: o.live ? '游戏实时注册表' : '内置数据（未连接游戏）' });
  var win = h('div', { class: 'k-modal addwin pickwin' }, [
    h('div', { class: 'k-mh' }, [uiIcon(o.icon || 'plus', 14), h('b', { text: o.title }), h('span', { class: 'k-sub', text: o.sub || '' }), h('div', { class: 'grow' }), srcTag, x]),
    h('div', { class: 'addbody' }, [cats, h('div', { class: 'addmain' }, [h('div', { class: 'addtop' }, top), list])]), foot]);
  paintCats(); paint(); paintFoot(); openModal(win, true); windowify(win, 'pick-' + (o.kind || 'x')); search.focus();
}

/* ---- 附魔 ---- */
function openEnchantPicker(o) {   /* o: { itemId, any, present:{full:1}, stored, onConfirm(ids) } */
  var all = Reg.enchants(), item = Reg.full(o.itemId);
  function fits(e) { return o.any || !e.supported || !!e.supported[item]; }
  var tagCount = {}; all.forEach(function (e) { (e.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
  var tags = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).filter(function (t) { return tagCount[t] < all.length; }).slice(0, 9);
  var cats = [{ id: 'all', name: '全部', icon: 'grid' }];
  if (!o.any) cats.push({ id: 'fit', name: '适用于它', icon: 'check', filter: function (en) { return fits(en.src); } });
  tags.forEach(function (t) { cats.push({ id: t, name: ENCH_TAG_ZH[pathOf(t)] || pathOf(t), icon: pathOf(t) === 'curse' ? 'skull' : 'enchant', filter: function (en) { return (en.src.tags || []).indexOf(t) >= 0; } }); });
  if (all.some(function (e) { return Reg.isMod(e.full); })) cats.push({ id: 'mod', name: '模组', icon: 'cube', filter: function (en) { return Reg.isMod(en.full); } });
  var entries = all.map(function (e) {
    var ok = fits(e);
    return { src: e, full: e.full, max: e.max, name: e.name, sub: '最高 ' + e.max + ' 级' + (ok ? '' : ' · 通常不适用于此物品') + (e.desc && e.desc !== e.name ? ' · ' + e.desc : ''), tag: (e.tags || []).indexOf('minecraft:curse') >= 0 ? '诅咒' : '', icon: function () { return itemIcon(ENCH_ICON[pathOf(e.full)] || 'enchanted_book', 16); } };
  });
  openPicker({ kind: 'ench', title: '添加附魔', sub: o.stored ? '选择要存进书里的附魔' : '勾选后一次添加', icon: 'enchant', entries: entries, cats: cats, locked: o.present, live: !!(all.length && all[0].live), params: [{ key: 'level', label: '等级', def: 1, min: 1, max: 255, maxOf: 'max', soft: true, unit: '' }], searchHint: '搜索附魔名称或 ID', custom: { placeholder: '输入附魔 ID 手动添加，如 mymod:fireball，回车选中' }, onConfirm: o.onConfirm });
}

/* ---- 状态效果 ---- */
function openEffectPicker(o) {   /* o: { present:{full:1}, full:true=带等级, onConfirm(ids, vals) } */
  var all = Reg.effects();
  var cats = [{ id: 'all', name: '全部', icon: 'grid' }];
  ['beneficial', 'neutral', 'harmful'].forEach(function (c) { cats.push({ id: c, name: EFFECT_CAT_ZH[c], icon: c === 'harmful' ? 'poison' : c === 'beneficial' ? 'regen' : 'flask', filter: function (e) { return e.cat === c; } }); });
  if (all.some(function (e) { return Reg.isMod(e.full); })) cats.push({ id: 'mod', name: '模组', icon: 'cube', filter: function (e) { return Reg.isMod(e.full); } });
  var entries = all.map(function (e) { return { full: e.full, name: e.name, sub: e.desc || e.full, cat: e.cat, tag: EFFECT_CAT_ZH[e.cat] || '', icon: function () { return effectIcon(pathOf(e.full), 16); } }; });
  openPicker({ kind: 'fx', title: '添加状态效果', sub: '勾选后一次添加', icon: 'flask', entries: entries, cats: cats, locked: o.present, live: !!(all.length && all[0].live), params: o.noParams ? [] : (o.full ? [{ key: 'level', label: '等级', def: 1, min: 1, max: 255, soft: true }] : []).concat([{ key: 'seconds', label: '时长', def: o.full ? 30 : 8, min: 1, max: 1000000, soft: true, unit: '秒' }]), searchHint: '搜索效果名称或 ID', custom: { placeholder: '输入效果 ID 手动添加，如 mymod:frost，回车选中' }, onConfirm: o.onConfirm });
}

/* ---- 音效：分类 + 点一下试听 + 确认 ---- */
function openSoundPicker(o) {   /* o: { current, onConfirm(full) } */
  var all = Reg.sounds(), groups = {};
  all.forEach(function (s) { s.group = Reg.isMod(s.full) ? 'mod' : pathOf(s.full).split('.')[0]; groups[s.group] = (groups[s.group] || 0) + 1; });
  var cats = [{ id: 'all', name: '全部', icon: 'grid' }];
  Object.keys(groups).filter(function (g) { return g !== 'mod'; }).sort(function (a, b) { return groups[b] - groups[a]; }).slice(0, 12).forEach(function (g) { cats.push({ id: g, name: SOUND_GROUP_ZH[g] || g, icon: 'music', filter: function (e) { return e.group === g; } }); });
  if (groups.mod) cats.push({ id: 'mod', name: '模组', icon: 'cube', filter: function (e) { return e.group === 'mod'; } });
  var entries = all.map(function (s) { return { full: s.full, name: s.sub || s.name, sub: s.full, group: s.group, icon: function () { return uiIcon('music', 16); } }; });
  openPicker({ kind: 'snd', title: '选择音效', sub: o.current ? '当前：' + o.current : '', icon: 'music', single: true, entries: entries, cats: cats, live: !!(all.length && all[0].live), searchHint: '搜索音效名称、字幕或 ID', custom: { placeholder: '或输入音效 ID，回车选中' }, preview: function () {}, confirmLabel: '使用这个音效', onConfirm: function (ids) { o.onConfirm(ids[0]); } });
}
/* 音效输入框：当前值 + 试听 + 选择 */
function kSoundField(value, onChange) {
  var cur = value || '';
  var name = h('span', { class: 'snd-name' });
  var play = SoundPreview.button(cur, function () { SoundPreview.toggle(cur); });
  var pick = kBtn('选择…', function () { openSoundPicker({ current: cur, onConfirm: function (id) { cur = id; paint(); onChange(id); } }); }, { icon: 'music' });
  var idEl = h('span', { class: 'rs-id' });
  function paint() {
    var n = cur ? Reg.nameOf('sounds', cur) : null;
    name.textContent = cur ? (n || cur) : '（未选择）'; idEl.textContent = cur && n ? cur : '';
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
    var l = Reg.options(o.reg) || o.fallback || [], f = Reg.full(id);
    for (var i = 0; i < l.length; i++) if (l[i].v === f || l[i].v === id) return l[i];
    return null;
  }
  function paint() {
    if (!cur) { nm.textContent = o.empty || "（未选择）"; nm.className = "rs-name none"; idEl.textContent = ""; nm.setAttribute('data-tip', ''); idEl.setAttribute('data-tip', ''); return; }
    var isTag = cur.charAt(0) === "#", e = isTag ? null : entry(cur);
    var name = isTag ? "标签" : (e ? refName(o.reg, e) : humanId(shortId(cur)));
    nm.className = "rs-name"; nm.textContent = name;
    var tip = name !== cur ? name + String.fromCharCode(10) + cur : cur;
    nm.setAttribute('data-tip', tip); idEl.setAttribute('data-tip', tip);
    idEl.textContent = (name === cur || name === humanId(shortId(cur)) && !e) ? (isTag ? cur : "") : cur;
  }
  var pick = kBtn("选择…", function () {
    openRegPick({ reg: o.reg, tag: o.tag, current: cur, title: o.title, fallback: o.fallback, onPick: function (id) { cur = id; paint(); o.onChange(cur); } });
  }, { icon: "grid" });
  var kids = [h("div", { class: "rs-txt" }, [nm, idEl]), pick];
  if (o.allowClear) kids.push(kBtn("清除", function () { cur = ""; paint(); o.onChange(""); }, { icon: "close" }));
  paint();
  return { el: h("div", { class: "k-row rs-field" }, kids), set: function (v) { cur = v || ""; paint(); } };
}
/* ---- 属性：读游戏当前的 attribute 注册表（含模组属性） ---- */
function openAttrPicker(o) {   /* o: { exclude:[short ids], onConfirm(fullIds) } */
  var live = Reg.options('attribute');
  var src = live || EDATA.attrs.map(function (a) { return { v: 'minecraft:' + a.id, label: a.name, sub: a.desc || a.id }; });
  var present = {}; (o.exclude || []).forEach(function (x) { present[Reg.full(x)] = 1; });
  var entries = src.map(function (e) { return { full: Reg.full(e.v), name: e.label === e.v ? humanId(shortId(e.v)) : e.label, sub: e.v, icon: function () { return attrIconEl(shortId(e.v)); } }; });
  var cats = [{ id: 'all', name: '全部', icon: 'grid' }];
  if (entries.some(function (e) { return Reg.isMod(e.full); })) cats.push({ id: 'mod', name: '模组', icon: 'cube', filter: function (e) { return Reg.isMod(e.full); } });
  openPicker({ kind: 'attr', title: '添加属性加成', sub: '勾选后一次添加', icon: 'plus', entries: entries, cats: cats, locked: present, live: !!live, searchHint: '搜索属性名称或 ID', custom: { placeholder: '' }, onConfirm: o.onConfirm });
}

/* ---- 标签 / 条目 单选：工具规则、免疫伤害、修理材料。标签与条目都读游戏实时注册表，常用快捷项排最前，也可手输 #模组id:标签 ----
   o: { title, tagsReg:'block', entryReg:'block'|null, quick:[{v,label,sub}], tagsOnly, onConfirm(id) } */
function openTagPicker(o) {
  function build() {
    var quick = {}; (o.quick || []).forEach(function (q) { quick[q.v] = q; });
    var out = (o.quick || []).map(function (q) { return { full: q.v, name: q.label, sub: q.sub || q.v, group: 'quick' }; });
    var tags = Reg.options('tags:' + o.tagsReg) || [];
    tags.forEach(function (t) { var v = '#' + t.v; if (quick[v]) return; out.push({ full: v, name: t.v, sub: (t.n !== undefined ? t.n + ' 个成员' : '标签'), group: 'tag' }); });
    if (o.entryReg && !o.tagsOnly) (Reg.options(o.entryReg) || []).forEach(function (e) { out.push({ full: e.v, name: e.label === e.v ? humanId(shortId(e.v)) : e.label, sub: e.v, group: 'entry', icon: o.entryIcon ? function () { return o.entryIcon(e); } : null }); });
    return out;
  }
  var cats = [{ id: 'all', name: '全部', icon: 'grid' }, { id: 'quick', name: '常用', icon: 'star', filter: function (e) { return e.group === 'quick'; } }, { id: 'tag', name: '标签', icon: 'tag', filter: function (e) { return e.group === 'tag'; } }];
  if (o.entryReg && !o.tagsOnly) cats.push({ id: 'entry', name: '单个条目', icon: 'cube', filter: function (e) { return e.group === 'entry'; } });
  if (!(o.quick && o.quick.length)) cats.splice(1, 1);
  openPicker({ kind: 'tagpick', title: o.title, sub: '', icon: 'tag', single: !o.multi, entriesFn: build, cats: cats, live: Reg.live(), searchHint: '搜索名称或 ID；也可输入 #模组id:标签', custom: { hash: true }, confirmLabel: o.multi ? '添加所选' : '使用这个', onConfirm: function (ids) { if (o.multi) o.onConfirm(ids); else o.onConfirm(ids[0]); } });
}

regEnumTable('attribute_operation', OPS, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, title: id }; });
regEnumTable('rarity', RARITY, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, title: id }; });
regEnumTable('equipment_slot_group', SLOTS, function (x) { return x; }, function (id, n) { SLOT_ZH[id] = SLOT_ZH[id] || n; return id; });

/* ---- 通用表单里的“选择…”：单选一个注册表条目，标签字段还能选 #标签；数据到达后列表自动刷新，也能手输 ---- */
function openRegPick(o) {   /* o: { reg, tag, current, title, fallback, onPick(id) } */
  if (o.reg === "sound_event") { openSoundPicker({ current: o.current, onConfirm: o.onPick }); return; }   // 和食用/穿戴音效是同一个带试听的音效选择窗
  if (o.reg === "jukebox_song" || o.reg === "instrument") {   // 唱片曲目 / 山羊角：带试听（用它们各自的声音事件）
    var snds = {};
    var buildS = function () { return (Reg.options(o.reg) || []).map(function (e) { snds[Reg.full(e.v)] = e.sound; return { full: Reg.full(e.v), name: e.label === e.v ? humanId(shortId(e.v)) : e.label, sub: e.v + (e.len ? " · " + Math.round(e.len) + " 秒" : ""), icon: function () { return uiIcon("music", 16); } }; }); };
    openPicker({ kind: "regpick-" + o.reg, emptyReg: o.reg, title: o.title || "选择", sub: "", icon: "music", single: true, entriesFn: buildS, cats: [{ id: "all", name: "全部", icon: "grid" }, { id: "mod", name: "模组", icon: "cube", filter: function (en) { return Reg.isMod(en.full); } }], live: Reg.live(), searchHint: "搜索名称或 ID", custom: {}, preview: function () {}, soundOf: function (full) { return snds[full]; }, confirmLabel: "使用这个", onConfirm: function (ids) { o.onPick(ids[0]); } });
    return;
  }
  if (o.tag) { openTagPicker({ title: o.title || "选择标签或条目", tagsReg: o.reg, entryReg: o.reg, entryIcon: function (e) { return refIcon(o.reg, e.v); }, onConfirm: o.onPick }); return; }
  function build() {
    var l = Reg.options(o.reg) || o.fallback || [];
    return l.map(function (e) { return { full: Reg.full(e.v), name: refName(o.reg, e), sub: e.v, icon: function () { return refIcon(o.reg, e.v); } }; });
  }
  var cats = [{ id: "all", name: "全部", icon: "grid" }, { id: "mod", name: "模组", icon: "cube", filter: function (en) { return Reg.isMod(en.full); } }];
  openPicker({ kind: "regpick-" + o.reg, emptyReg: o.reg, title: o.title || "选择", sub: o.multi ? "勾选后一次添加" : "", icon: "grid", single: !o.multi, locked: o.locked, entriesFn: build, cats: cats, live: Reg.live(), searchHint: "搜索名称或 ID", custom: { placeholder: "或输入 ID，回车选中" }, confirmLabel: o.multi ? "添加所选" : "使用这个", onConfirm: function (ids) { if (o.multi) o.onPickMany(ids); else o.onPick(ids[0]); } });
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
function refIcon(reg, v, size) {
  size = size || 16;
  if (reg === 'trim_material' || reg === 'trim_pattern') { var lt = liveTrimIcon(reg, v, size); if (lt) return lt; }
  if (reg === 'trim_material' && typeof TRIM_ICON !== 'undefined' && TRIM_ICON[shortId(v)] && !Reg.isMod(Reg.full(v))) return itemIcon(TRIM_ICON[shortId(v)], size);
  if (reg === 'trim_pattern' && typeof EDATA !== 'undefined' && EDATA.ipt && EDATA.ipt[shortId(v) + '_armor_trim_smithing_template'] !== undefined && !Reg.isMod(Reg.full(v))) return itemIcon(shortId(v) + '_armor_trim_smithing_template', size);
  if (reg === "item" || reg === "block") return itemIcon(shortId(v), 16);
  if (reg === "mob_effect") return effectIcon(shortId(v), 16);
  return uiIcon(reg === "sound_event" ? "music" : "grid", 16);
}

/* 列表是空的时候，说明为什么空：还在向游戏要数据、游戏没有这类条目、还是游戏端没有响应（多半是模组 jar 没更新 / 没重启） */
var EMPTY_T0 = Date.now();
function emptyReason(q, since, reg) {
  if (q && String(q).trim()) return "没有匹配“" + String(q).trim() + "”的项";
  if (reg && Reg.live() && Reg.unavailable(reg)) return Reg.unavailable(reg) + "。可以在上面的搜索框里直接输入完整 ID。";
  if (!Reg.live()) return "游戏还没有把注册表发给编辑器（未连接游戏，或游戏里的编辑器模组需要更新并重启）";
  var waited = Date.now() - (since || EMPTY_T0);
  return waited < 4000 ? "正在向游戏读取…" : "游戏没有返回这类数据。常见原因：游戏里的编辑器模组还是旧版本，请更新并重启游戏";
}

/* 标签的显示名：游戏里的翻译名（tags:<reg> 的 name，缺翻译时等于完整 id → 返回 null） */
function tagLabel(reg, hashId) {
  if (!Reg.live() || !hashId) return null;
  var l = Reg.options('tags:' + reg), f = '#' + Reg.full(String(hashId).replace(/^#/, ''));
  if (!l) return null;
  for (var i = 0; i < l.length; i++) if ('#' + Reg.full(l[i].v) === f) return l[i].label && l[i].label !== l[i].v ? l[i].label : null;
  return null;
}
