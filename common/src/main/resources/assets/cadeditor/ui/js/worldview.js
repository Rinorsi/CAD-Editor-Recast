/* 世界方块的规范化视图和方块状态（docs/world-block-edit.md）。
   视图 world.views.<组> = {value, snbt, schema}：value 是游戏真实 Codec 的 JSON，页面只提交改过的顶层字段（apply.views.<组>）；
   方块状态 world.block_state_schema = [{name,type,values,default,current}]，提交 apply.block_state 里改过的属性。
   数据范围、行数、颜色都读 schema，不在这里写死。 */
var WEV = {};
WE.views = {}; WE.bstate = {}; WE.btype = ''; WE.upd = true; WE.face = 'front';
function weResetEdits() { WE.views = {}; WE.bstate = {}; WE.btype = ''; }
function weViews() { return (WE.w && WE.w.views) || {}; }
function weViewGroups() {
  var v = weViews(), groups = Object.keys(v);
  return groups.filter(function (g) {
    if (g === 'unsupported' || g === 'generic' || !v[g] || !v[g].value) return false;
    // Legacy raw helpers (e.g. bees) coexist with normalized form groups.
    // Do not claim a field is raw-only when a real form already covers it.
    if (!v[g].schema && groups.some(function (other) {
      var entry = v[other], fields = entry && entry.schema && entry.schema.fields;
      return other !== g && typeof WEV[other] === 'function' && fields && Object.prototype.hasOwnProperty.call(fields, g)
        && entry.value && Object.prototype.hasOwnProperty.call(entry.value, g);
    })) return false;
    return true;
  });
}
var WE_VIEW_TYPED = new WeakMap();
function weViewOrig(g) {
  var v = weViews()[g]; if (!v || !v.value) return {};
  var cached = WE_VIEW_TYPED.get(v); if (cached) return cached;
  var fields = v.schema && v.schema.fields || {}, texts = {}, ast = null;
  Object.keys(fields).forEach(function (key) {
    if (!fields[key].wire_snbt || v.value[key] === null || v.value[key] === undefined) return;
    if (!ast) ast = nbtParse(v.snbt);
    if (ast.k === 'obj' && ast.map[key]) texts[key] = nbtPrint(ast.map[key], false);
  });
  cached = nbtHydrate(v.value, texts); WE_VIEW_TYPED.set(v, cached); return cached;
}
/* 草稿存储（方块视图 WE.views、实体 / 玩家 WE.ent 共用）：只记和原值不同的字段，改回原值就删掉；改完刷新顶栏 / 底栏 */
function weDraftGet(store, g, k, orig) { var e = store[g]; if (e && Object.prototype.hasOwnProperty.call(e, k)) return e[k]; return orig[k]; }
function weVal(g, k) { var orig = weViewOrig(g), e = WE.views[g]; return nbtTake(e && Object.prototype.hasOwnProperty.call(e, k) ? e : orig, k); }
function weNorm(v) { return JSON.stringify(v === undefined ? null : v) + (v === undefined || v === null ? '' : '\n' + nbtMerge(v, null)); }
function weDraftSet(store, g, k, v, orig) {
  var e = store[g] || (store[g] = {});
  if (weNorm(v) === weNorm(nbtTake(orig, k))) delete e[k]; else nbtPut(e, k, v);
  if (!Object.keys(e).length) delete store[g];
  weMarkDirty();
}
function weSetV(g, k, v) { weDraftSet(WE.views, g, k, v, weViewOrig(g)); if (k === 'minecraft:profile') weHeroLive(); }
function weViewField(g, k) { var s = weViews()[g]; return s && s.schema && s.schema.fields ? s.schema.fields[k] || {} : {}; }
function weStateSchema() { return (WE.w && WE.w.block_state_schema) || []; }
function weTypeSchema() { var t = WE.w && WE.w.block_type_schema; return Array.isArray(t) ? t.map(function (x) { return typeof x === 'string' ? x : x.id; }) : []; }
function weStateCur(p) { return WE.bstate[p.name] !== undefined ? WE.bstate[p.name] : p.current; }
function weViewsDirty() { return !!WE.w && (Object.keys(WE.views).length > 0 || Object.keys(WE.bstate).length > 0 || !!(WE.btype && WE.btype !== WE.w.block)); }
function weViewsMsg(msg) {
  var vg = Object.keys(WE.views);
  if (vg.length) { msg.views = {}; vg.forEach(function (g) {
    msg.views[g] = clone(WE.views[g]);
    Object.keys(WE.views[g]).forEach(function (k) {
      if (!weViewField(g, k).wire_snbt || WE.views[g][k] === null) return;
      if (!msg.views_snbt) msg.views_snbt = {};
      if (!msg.views_snbt[g]) msg.views_snbt[g] = {};
      msg.views_snbt[g][k] = nbtMerge(nbtTake(WE.views[g], k), null);
    });
  }); }
  var bs = {}, any = false;
  weStateSchema().forEach(function (p) { if (WE.bstate[p.name] !== undefined && WE.bstate[p.name] !== p.current) { bs[p.name] = WE.bstate[p.name]; any = true; } });
  if (any) msg.block_state = bs;
  if (WE.btype && WE.btype !== WE.w.block) msg.block_type = WE.btype;
  if ((any || msg.block_type) && !WE.upd) msg.updateNeighbors = false;
}

var WEV_INFO = { generic: [I18n.t("cadeditor.ui.worldedit.863edfe5ac"), 'sliders'], sign: [I18n.t("cadeditor.ui.worldview.68ee52856f"), 'edit'], banner: [I18n.t("cadeditor.ui.pages.3bab4b496f"), 'banner'], beehive: [I18n.t("cadeditor.ui.worldview.395dcc6ad3"), 'flower'], lectern: [I18n.t("cadeditor.ui.worldview.ad05d5d1ea"), 'book_open'], jukebox: [I18n.t("cadeditor.ui.worldview.f22ed02a7d"), 'music'],
  decorated_pot: [I18n.t("cadeditor.ui.worldview.29462317e0"), 'gem'], chiseled_bookshelf: [I18n.t("cadeditor.ui.worldview.da43858d5e"), 'book'], command_block: [I18n.t("cadeditor.ui.screens.928f87d450"), 'terminal'], skull: [I18n.t("cadeditor.ui.worldview.c7cbca5e9e"), 'skull'], furnace: [I18n.t("cadeditor.ui.worldview.01333debdd"), 'furnace'],
  brewing_stand: [I18n.t("cadeditor.ui.worldview.6c1609cb21"), 'flask'], campfire: [I18n.t("cadeditor.ui.worldview.c5fa756746"), 'campfire'], nameable: [I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), 'tag'], hopper: [I18n.t("cadeditor.ui.worldview.8959482213"), 'sliders'], beacon: [I18n.t("cadeditor.ui.worldview.a4257fa877"), 'sparkle'], crafter: [I18n.t("cadeditor.ui.worldview.62d8919598"), 'grid'],
  conduit: [I18n.t("cadeditor.ui.worldview.ea68086159"), 'sparkle'], end_gateway: [I18n.t("cadeditor.ui.worldview.e61388b36d"), 'wind'], structure_block: [I18n.t("cadeditor.ui.worldview.00eba39cc6"), 'cube'], jigsaw: [I18n.t("cadeditor.ui.worldview.e3fe478ccc"), 'link'], sculk_sensor: [I18n.t("cadeditor.ui.worldview.502034e834"), 'sparkle'],
  sculk_shrieker: [I18n.t("cadeditor.ui.worldview.f43bc71e1f"), 'sparkle'], sculk_catalyst: [I18n.t("cadeditor.ui.worldview.b40d506c50"), 'sparkle'], bell: [I18n.t("cadeditor.ui.worldview.13d02782bb"), 'bell'], vault: [I18n.t("cadeditor.ui.worldview.cd7b983143"), 'chest'] };
function weViewTabInfo() { var g = weViewGroups(), n = g.length === 1 && WEV_INFO[g[0]] ? WEV_INFO[g[0]] : null; return { label: n ? n[0] : I18n.t("cadeditor.ui.worldview.c8a2dbae89"), icon: n ? n[1] : 'sliders' }; }

/* ---------- 小零件 ---------- */
function wvNum(g, k, label, o) {
  o = o || {}; var f = weViewField(g, k);
  return xNum({ title: label, sub: o.sub || undefined, range: true, value: weVal(g, k), min: f.min, max: f.max, unit: o.unit, onChange: function (x) { weSetV(g, k, x); } });
}
function wvToggle(g, k, label, sub) { return xToggle({ title: label, sub: sub, value: weVal(g, k), onChange: function (on) { weSetV(g, k, on); } }); }
/* ItemStack（id / count / components）字段：选一件，或清空 */
function wvItem(cur, onSet) {
  var has = cur && cur.id;
  var btn = kItemBtn(has ? cur : null);
  activate(btn, function () { pickItem(btn, function (id) { onSet({ id: fullId(id), count: 1 }); kPopClose(); }, { onStack: function (stack) { onSet(vaultNested(stack)); kPopClose(); } }); });
  var kids = [btn];
  if (has) kids.push(kBtn(I18n.t("cadeditor.ui.cards3.7f559289d4"), function () { editNestedStack(cur, I18n.t("cadeditor.ui.cards3.7f559289d4"), onSet, weRedrawBody); }, { icon: 'edit' }));
  if (has) kids.push(kBtn(I18n.t("cadeditor.ui.common.clear"), function () { onSet(null); }, { icon: 'trash' }));
  return h('div', { class: 'k-row' }, kids);
}

/* ---------- 告示牌 / 悬挂告示牌 ---------- */
WEV.sign = function (body, g) {
  var face = WE.face === 'back' ? 'back_text' : 'front_text', fs = weViewField(g, face), n = fs.messages_length || 4;
  body.appendChild(xSec('edit', I18n.t("cadeditor.ui.cards4.14b69bd6ee"), undefined, kSeg([{ v: 'front', label: I18n.t("cadeditor.ui.picker.740f5e8102") }, { v: 'back', label: I18n.t("cadeditor.ui.world.2d270b6ce4") }], WE.face, function (v) { WE.face = v; weRender(); }).el));
  function cur() { var o = weVal(g, face); return clone(o && typeof o === 'object' ? o : { messages: [] }); }
  function setFace(fn) {
    var o = cur(); if (!Array.isArray(o.messages)) o.messages = []; while (o.messages.length < n) o.messages.push('');
    fn(o); weSetV(g, face, o);
  }
  var msgs = cur().messages || [];
  function unwaxNote() {
    if (weVal(g, 'is_waxed')) { weSetV(g, 'is_waxed', false); toast(I18n.t("cadeditor.ui.worldview.1b80751ac1"), 'info'); weRender(); }
  }
  /* 和名称、说明文字同一个文本编辑器：选中文字直接改颜色、粗体、精灵图；每行独立保存 */
  var padded = []; for (var k = 0; k < n; k++) padded.push(msgs[k] === undefined ? '' : msgs[k]);
  var doc = kRichDoc(padded, { lines: n, preview: false, height: n * 16 + 12, placeholder: I18n.t("cadeditor.ui.worldview.5a318b8d26", (n)),
    onChange: function (v) {
      var changed = false;
      setFace(function (o) { for (var j = 0; j < n; j++) if (JSON.stringify(v[j]) !== JSON.stringify(last[j])) { o.messages[j] = v[j]; changed = true; } });
      last = v.slice(); if (changed) unwaxNote();
    } });
  var last = doc ? doc.lineRuns().map(function (r) { return tcBuild({}, r); }) : [];
  while (last.length < n) last.push('');
  if (doc) body.appendChild(h('div', { class: 'we-signdoc' }, [doc.el]));
  else for (var i = 0; i < n; i++) (function (i) {
    var inp = kInput(msgText(msgs[i]), function () {}, { placeholder: I18n.t("cadeditor.ui.cards1.a193acc89a", (i + 1)) }); inp.classList.add('we-line');
    inp.addEventListener('change', function () {
      var before = !!weVal(g, 'is_waxed');
      setFace(function (o) { o.messages[i] = textMsg(inp.value); });
      if (before) { weSetV(g, 'is_waxed', false); toast(I18n.t("cadeditor.ui.worldview.1b80751ac1"), 'info'); weRender(); }
    });
    body.appendChild(h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [h('span', { text: String(i + 1) })]), inp]));
  })(i);
  var o = cur();
  body.appendChild(xToggle({ title: I18n.t("cadeditor.ui.worldview.b36f71618a"), sub: I18n.t("cadeditor.ui.worldview.67069e0920"), value: o.has_glowing_text, onChange: function (on) { setFace(function (x) { x.has_glowing_text = on; }); } }));
  body.appendChild(xSec('lock', I18n.t("cadeditor.ui.worldview.f0f0d19b6a")));
  body.appendChild(wvToggle(g, 'is_waxed', I18n.t("cadeditor.ui.worldview.f0f0d19b6a"), I18n.t("cadeditor.ui.worldview.7e6afe7199")));
  if (!doc) body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.d0f2140461")));
};

/* ---------- 旗帜图案 ---------- */
WEV.banner = function (body, g) {
  var list = clone(weVal(g, 'patterns') || []);
  var base = weViews()[g].schema && weViews()[g].schema.base_color;
  body.appendChild(xSec('banner', I18n.t("cadeditor.ui.cards2.9fbb8e9f1a"), I18n.t("cadeditor.ui.worldview.9a032153dd", (list.length), (base ? I18n.t("cadeditor.ui.worldview.270fed7027", ((EDATA.L && EDATA.L.color && EDATA.L.color[base]) || base)) : ''))));
  function save() { weSetV(g, 'patterns', clone(list)); }
  list.forEach(function (p, i) {
    var sel = kRegSelect({ reg: 'banner_pattern', value: p.pattern, title: I18n.t("cadeditor.ui.banner.26e3a0d4b0"), onChange: function (id) { list[i].pattern = id; save(); } });
    var col = dyeButton(p.color || 'white', function (c) { list[i].color = c; save(); weRender(); });
    var rm = kBtn('', function () { list.splice(i, 1); save(); weRender(); }, { icon: 'trash', title: I18n.t("cadeditor.ui.worldview.41756d3c84") });
    body.appendChild(h('div', { class: 'k-row we-row' }, [h('span', { class: 'k-sub', text: String(i + 1) }), sel.el, col, rm]));
  });
  body.appendChild(xAdd(I18n.t("cadeditor.ui.worldview.be3bb87daa"), function () { list.push({ pattern: 'minecraft:stripe_bottom', color: 'white' }); save(); weRender(); }));
};

/* ---------- 蜂箱 / 蜂巢 ---------- */
WEV.beehive = function (body, g) {
  var list = clone(weVal(g, 'bees') || []), f = weViewField(g, 'bees'), max = f.vanilla_max_occupants;
  body.appendChild(xSec('flower', I18n.t("cadeditor.ui.worldview.28a1bb068f"), I18n.t("cadeditor.ui.worldview.d0ebc5469b", (list.length + (max ? ' / ' + max : '')))));
  function save() { weSetV(g, 'bees', clone(list)); }
  list.forEach(function (b, i) {
    var ed = b.entity_data || {};
    var t1 = kNumber(b.ticks_in_hive || 0, { min: 0, noSlider: true, step: 20, unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), onChange: function (v) { list[i].ticks_in_hive = v; save(); } });
    var t2 = kNumber(b.min_ticks_in_hive === undefined ? 600 : b.min_ticks_in_hive, { min: 0, noSlider: true, step: 20, unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), onChange: function (v) { list[i].min_ticks_in_hive = v; save(); } });
    var rm = kBtn(I18n.t("cadeditor.ui.worldview.1e665fe1b7"), function () { list.splice(i, 1); save(); weRender(); }, { icon: 'trash', title: I18n.t("cadeditor.ui.worldview.8820b78419") });
    body.appendChild(xRow({ icon: entityIcon(ed.id || 'minecraft:bee', 22), title: I18n.t("cadeditor.ui.world.eab90d1f5c", (i + 1)), sub: I18n.t("cadeditor.ui.worldview.1784a0ddd2", (b.ticks_in_hive || 0), (b.min_ticks_in_hive === undefined ? 600 : b.min_ticks_in_hive)), chevron: true, open: !!UIOpen['we:bee:' + i],
      onHead: function () { UIOpen['we:bee:' + i] = !UIOpen['we:bee:' + i]; weRender(); },
      body: function () { return [esEntityHeader({ id: ed.id || 'minecraft:bee', snbtText: function () { var e = clone(list[i].entity_data || {}); if (!e.id) e.id = 'minecraft:bee'; return nbtMerge(e, null); }, onPick: function (id) { list[i].entity_data = Object.assign(clone(list[i].entity_data), { id: id }); save(); weRender(); }, onEntityNbt: function (snbt) { list[i].entity_data = vaultEntityObj(snbt); save(); weRender(); } }), xField('clock', I18n.t("cadeditor.ui.worldview.70bd7e7d78"), t1.el), xField('hourglass', I18n.t("cadeditor.ui.worldview.ece55569fc"), t2.el), h('div', { class: 'x2f' }, [h('div', { class: 'grow' }), rm])]; } }));
  });
  if (!max || list.length < max) body.appendChild(xAdd(I18n.t("cadeditor.ui.worldview.b23385f3be"), function () { list.push({ entity_data: { id: 'minecraft:bee' }, ticks_in_hive: 0, min_ticks_in_hive: 600 }); save(); weRender(); }));
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.40b54d1afa")));
};

/* ---------- 讲台 / 唱片机 ---------- */
WEV.lectern = function (body, g) {
  body.appendChild(xSec('book_open', I18n.t("cadeditor.ui.pages.1be968f125")));
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldview.a6f867222f"), sub: I18n.t("cadeditor.ui.worldview.70556b3f4c"), right: wvItem(weVal(g, 'Book'), function (v) { weSetV(g, 'Book', v); weRender(); }) }));
  body.appendChild(wvNum(g, 'Page', I18n.t("cadeditor.ui.worldview.4dd2d7936b"), { sub: I18n.t("cadeditor.ui.worldview.1f4538922c") }));
};
WEV.jukebox = function (body, g) {
  body.appendChild(xSec('music', I18n.t("cadeditor.ui.picker.da7efa96d4")));
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldview.695aaefd91"), sub: I18n.t("cadeditor.ui.worldview.872f70b9f4"), tip: I18n.t("cadeditor.ui.worldview.db199f2362"), right: wvItem(weVal(g, 'RecordItem'), function (v) { weSetV(g, 'RecordItem', v); weRender(); }) }));
};
/* Explicit patches/removals precede actual game defaults. Unknown is not unsupported. */
function wvJukeboxProblem(stack) {
  if (!stack || stack.empty || !stack.id || Reg.full(stack.id) === 'minecraft:air') return '';
  var cid = 'minecraft:jukebox_playable', short = 'jukebox_playable', c = stack.components || stack.comps || {}, removed = stack.removed || {};
  var missing = I18n.t("cadeditor.ui.worldview.9c81f8c837");
  if (c['!' + cid] !== undefined || c['!' + short] !== undefined || removed[cid] || removed[short]) return missing;
  if (Object.prototype.hasOwnProperty.call(c, cid) || Object.prototype.hasOwnProperty.call(c, short)) return '';
  var meta = Reg.itemMeta(stack.id);
  if (meta && typeof meta.jukebox_playable === 'boolean') return meta.jukebox_playable ? '' : missing;
  var defaults = Reg.defaultsOf(stack.id);
  if (defaults) return defaults[cid] !== undefined || defaults[short] !== undefined ? '' : missing;
  return I18n.t("cadeditor.ui.worldview.24044b9328");
}
function weViewProblems() {
  var problems = [], j = WE.views && WE.views.jukebox;
  if (j && Object.prototype.hasOwnProperty.call(j, 'RecordItem')) { var p = wvJukeboxProblem(j.RecordItem); if (p) problems.push(p); }
  if (WE.w && WE.w.type === 'minecraft:jukebox') Object.keys(WE.slots || {}).forEach(function (k) { var p = wvJukeboxProblem(WE.slots[k]); if (p && problems.indexOf(p) < 0) problems.push(p); });
  return problems;
}

/* ---------- 纹饰陶罐：后 / 左 / 右 / 前 ---------- */
WEV.decorated_pot = function (body, g) {
  var cur = clone(weVal(g, 'sherds') || []); while (cur.length < 4) cur.push('minecraft:brick');
  var names = [I18n.t("cadeditor.ui.worldview.60be66d615"), I18n.t("cadeditor.ui.labels.e2e0c454e5"), I18n.t("cadeditor.ui.labels.14ab1f2bce"), I18n.t("cadeditor.ui.worldview.6044e9f095")];
  body.appendChild(xSec('gem', I18n.t("cadeditor.ui.worldview.b369c9dba7"), I18n.t("cadeditor.ui.worldview.5fba0baed1")));
  names.forEach(function (nm, i) {
    var id = cur[i], btn = h('div', { class: 'k-btn' }, [itemIcon(shortId(id), 22), h('span', { text: nameOfItem(id) })]);
    activate(btn, function () { pickItem(btn, function (x) { cur[i] = fullId(x); weSetV(g, 'sherds', cur.slice()); kPopClose(); weRender(); }); });
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldview.e276dec5c4", (nm)), right: btn }));
  });
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.2e7b9997e2")));
};
WEV.chiseled_bookshelf = function (body, g) {
  body.appendChild(xSec('book', I18n.t("cadeditor.ui.worldview.da43858d5e")));
  body.appendChild(wvNum(g, 'last_interacted_slot', I18n.t("cadeditor.ui.worldview.bf6c61e8c5"), { sub: I18n.t("cadeditor.ui.worldview.c8b82228b8") }));
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.df57c9ebea")));
};

/* ---------- 命令方块：模式 + 命令 ---------- */
WEV.command_block = function (body, g) {
  var types = weTypeSchema();
  if (types.length > 1) {
    var NAMES = { 'minecraft:command_block': I18n.t("cadeditor.ui.worldview.cc786eed00"), 'minecraft:repeating_command_block': I18n.t("cadeditor.ui.worldview.ad3221dd66"), 'minecraft:chain_command_block': I18n.t("cadeditor.ui.worldview.dc9ce849ce") };
    body.appendChild(xSec('terminal', I18n.t("cadeditor.ui.labels.47a270081a")));
    body.appendChild(h('div', { class: 'k-row' }, [kSeg(types.map(function (t) { return { v: t, label: NAMES[t] || humanId(shortId(t)) }; }), WE.btype || WE.w.block, function (v) { WE.btype = v === WE.w.block ? '' : v; weMarkDirty(); }).el]));
  }
  body.appendChild(xSec('code', I18n.t("cadeditor.ui.screens.928f87d450")));
  var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: I18n.t("cadeditor.ui.worldview.1e3ddf36fc") }); ta.value = weVal(g, 'Command') || '';
  ta.addEventListener('change', function () { weSetV(g, 'Command', ta.value); });
  body.appendChild(ta);
  body.appendChild(wvToggle(g, 'auto', I18n.t("cadeditor.ui.worldview.212d05d17f"), I18n.t("cadeditor.ui.worldview.ad372941a1")));
  body.appendChild(wvToggle(g, 'TrackOutput', I18n.t("cadeditor.ui.worldview.1f8f023019"), I18n.t("cadeditor.ui.worldview.b2b98d3032")));
  body.appendChild(wvToggle(g, 'powered', I18n.t("cadeditor.ui.worldview.9980b18ec5"), I18n.t("cadeditor.ui.worldview.3820ad2ac9")));
  var cond = weStateSchema().filter(function (p) { return p.name === 'conditional'; })[0];
  if (cond) body.appendChild(xToggle({ title: I18n.t("cadeditor.ui.labels.26ee9be2e2"), sub: I18n.t("cadeditor.ui.worldview.3008626472"), value: weStateCur(cond) === 'true', onChange: function (on) { var v = on ? 'true' : 'false'; if (v === cond.current) delete WE.bstate.conditional; else WE.bstate.conditional = v; weMarkDirty(); } }));
};

/* ---------- 头颅 ---------- */
WEV.skull = function (body, g) {
  var prof = weVal(g, 'minecraft:profile'), simple = prof === null || prof === undefined || typeof prof === 'string' || (typeof prof === 'object' && Object.keys(prof).every(function (k) { return k === 'name'; }));
  body.appendChild(xSec('skull', I18n.t("cadeditor.ui.worldview.c7cbca5e9e")));
  if (simple) {
    var nm = typeof prof === 'string' ? prof : (prof && prof.name) || '';
    var owner = WE.w, previewTimer = null;
    var ownerRow = xText({ title: I18n.t("cadeditor.ui.worldview.3bbbbd6986"), sub: I18n.t("cadeditor.ui.worldview.89856b2d9e"), value: nm, placeholder: I18n.t("cadeditor.ui.screens.4498621999"), cls: 'we-in',
      onInput: function (t) { clearTimeout(previewTimer); previewTimer = setTimeout(function () { if (WE.w === owner && ownerRow.parentNode) { var v = t.trim(); weHeroLive(v ? { name: v } : null); } }, 500); },
      onCommit: function (t) { clearTimeout(previewTimer); var v = t.trim(); weSetV(g, 'minecraft:profile', v ? { name: v } : null); } });
    body.appendChild(ownerRow);
  } else body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldview.3bbbbd6986"), sub: I18n.t("cadeditor.ui.worldview.f3808b147d"), right: kBtn(I18n.t("cadeditor.ui.picker.bce2377283"), function () { weSetV(g, 'minecraft:profile', null); weRender(); }, { icon: 'trash' }) }));
  body.appendChild(xText({ title: I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), value: msgText(weVal(g, 'minecraft:custom_name')), placeholder: I18n.t("cadeditor.ui.worldplayer.4dce6f85e4"), cls: 'we-in', onCommit: function (t) { weSetV(g, 'minecraft:custom_name', t ? textMsg(t) : null); } }));
};

/* ---------- 熔炉 / 酿造台 / 营火：计时 ---------- */
WEV.furnace = function (body, g) {
  body.appendChild(xSec('furnace', I18n.t("cadeditor.ui.worldview.f81ff55de1"), I18n.t("cadeditor.ui.worldview.d80a9675a5")));
  body.appendChild(wvNum(g, 'cooking_time_spent', I18n.t("cadeditor.ui.worldview.e03723f8a3"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
  body.appendChild(wvNum(g, 'cooking_total_time', I18n.t("cadeditor.ui.worldview.6e909f347e"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
  body.appendChild(wvNum(g, 'lit_time_remaining', I18n.t("cadeditor.ui.worldview.d4ae958da0"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
  body.appendChild(wvNum(g, 'lit_total_time', I18n.t("cadeditor.ui.worldview.ab4022f26c"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.099f24f6bb")));
};
WEV.brewing_stand = function (body, g) {
  body.appendChild(xSec('flask', I18n.t("cadeditor.ui.worldview.f81ff55de1")));
  body.appendChild(wvNum(g, 'BrewTime', I18n.t("cadeditor.ui.worldview.05ec59dc48"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
  body.appendChild(wvNum(g, 'Fuel', I18n.t("cadeditor.ui.worldview.4d0436f472")));
};
WEV.campfire = function (body, g) {
  var n = weViewField(g, 'CookingTimes').length || 4;
  var a = clone(weVal(g, 'CookingTimes') || []), b = clone(weVal(g, 'CookingTotalTimes') || []);
  body.appendChild(xSec('campfire', I18n.t("cadeditor.ui.worldview.e926c4e7bb"), I18n.t("cadeditor.ui.worldview.1af8765d33")));
  for (var i = 0; i < n; i++) (function (i) {
    var x = kNumber(a[i] || 0, { min: 0, noSlider: true, step: 20, unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), onChange: function (v) { a[i] = v; weSetV(g, 'CookingTimes', a.slice()); } });
    var y = kNumber(b[i] || 0, { min: 0, noSlider: true, step: 20, unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), onChange: function (v) { b[i] = v; weSetV(g, 'CookingTotalTimes', b.slice()); } });
    body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldview.8ee26cc94d", (i + 1)), sub: I18n.t("cadeditor.ui.worldview.fbed78a590"), right: h('div', { class: 'k-row' }, [x.el, y.el]) }));
  })(i);
};

/* ---------- 自定义名称（所有能改名的方块：箱子、熔炉、漏斗、附魔台……）---------- */
WEV.nameable = function (body, g) {
  body.appendChild(xSec('tag', I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), I18n.t("cadeditor.ui.worldview.eab3e84779")));
  var cur = weVal(g, 'CustomName');
  var r = kRich(cur === undefined || cur === null ? '' : cur, { placeholder: I18n.t("cadeditor.ui.worldview.988a5c13ea"),
    onChange: function (v, empty) { weSetV(g, 'CustomName', empty ? null : v); } });
  body.appendChild(r.el);
};

/* ---------- 漏斗：搬运冷却 ---------- */
WEV.hopper = function (body, g) {
  body.appendChild(xSec('sliders', I18n.t("cadeditor.ui.worldview.9ffc3aa907"), I18n.t("cadeditor.ui.worldview.d80a9675a5")));
  body.appendChild(xNum({ title: I18n.t("cadeditor.ui.worldview.55d2abe17a"), sub: I18n.t("cadeditor.ui.worldview.641e729754"), value: weVal(g, 'TransferCooldown'), def: 0, step: 1, unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), onChange: function (x) { weSetV(g, 'TransferCooldown', x); } }));
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.c90994a0d7")));
};

/* ---------- 信标：主 / 副效果（候选来自游戏），等级只读 ---------- */
WEV.beacon = function (body, g) {
  body.appendChild(xSec('sparkle', I18n.t("cadeditor.ui.picker.86a00cf742"), I18n.t("cadeditor.ui.worldview.467df0f923")));
  [['primary_effect', I18n.t("cadeditor.ui.worldview.f2ce338710"), I18n.t("cadeditor.ui.worldview.22963db0f8")], ['secondary_effect', I18n.t("cadeditor.ui.worldview.9007c9b1da"), I18n.t("cadeditor.ui.worldview.17cd8aa33f")]].forEach(function (d) {
    var key = d[0], cands = (weViewField(g, key).candidates || []).slice(), cur = weVal(g, key) || '';
    if (cur && cands.indexOf(cur) < 0) cands.push(cur);
    var entries = cands.map(function (id) { return { v: id, label: Reg.nameOf('mob_effects', id) || (EFIDX[shortId(id)] || {}).name || humanId(shortId(id)), sub: id, icon: function () { return effectIcon(id, 16); } }; });
    var sel = kSelect(entries, cur || null, function (v) { weSetV(g, key, v); weRender(); }, { width: 240, empty: I18n.t("cadeditor.ui.pages.c7bcc6d27f"), placeholder: I18n.t("cadeditor.ui.worldview.0bfb8e8fe9") });
    var right = [sel.el];
    if (cur) right.push(kBtn(I18n.t("cadeditor.ui.picker.bce2377283"), function () { weSetV(g, key, null); weRender(); }, { icon: 'trash' }));
    body.appendChild(xRow({ icon: false, title: d[1], sub: d[2], right: h('div', { class: 'k-row' }, right) }));
  });
  var lv = weViewOrig(g).Levels;
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.worldview.0156c1c76a"), sub: I18n.t("cadeditor.ui.worldview.aee3b75127"), right: h('span', { class: 'k-sub', text: String(lv === undefined ? 0 : lv) }) }));
};

/* ---------- 合成器：禁用格子 + 触发状态 ---------- */
WEV.crafter = function (body, g) {
  var f = weViewField(g, 'disabled_slots'), max = f.item_max === undefined ? 8 : f.item_max, min = f.item_min === undefined ? 0 : f.item_min;
  var cur = clone(weVal(g, 'disabled_slots') || []);
  function filled(i) { var s = (WE.w.container && WE.w.container.slots || []).filter(function (x) { return x.slot === i; })[0]; return !!s && !s.stack.empty; }
  body.appendChild(xSec('grid', I18n.t("cadeditor.ui.worldview.77108baefd"), I18n.t("cadeditor.ui.worldview.7867942419")));
  var grid = h('div', { class: 'k-cgrid tray', style: 'grid-template-columns:repeat(3,34px)' });
  for (var i = min; i <= max; i++) (function (i) {
    var off = cur.indexOf(i) >= 0, cell = h('div', { class: 'slot s34' + (off ? ' sel' : ''), title: I18n.t("cadeditor.ui.worldview.48a6fd286e", (i + 1), (off ? I18n.t("cadeditor.ui.worldview.f8a80d69e0") : filled(i) ? I18n.t("cadeditor.ui.worldview.222992d929") : '')) }, off ? [uiIcon('close', 14)] : []);
    activate(cell, function () {
      if (cur.indexOf(i) < 0 && filled(i)) { toast(I18n.t("cadeditor.ui.worldview.8679ace70d"), 'warn'); return; }
      var next = cur.indexOf(i) >= 0 ? cur.filter(function (x) { return x !== i; }) : cur.concat([i]);
      next.sort(function (a, b) { return a - b; }); weSetV(g, 'disabled_slots', next); weRender();
    });
    grid.appendChild(cell);
  })(i);
  body.appendChild(grid);
  body.appendChild(wvToggle(g, 'triggered', I18n.t("cadeditor.ui.labels.e16530dd5c"), I18n.t("cadeditor.ui.worldview.27e6f0a512")));
};

/* ---------- 只读行：给出当前值，没有任何控件 ---------- */
function wvReadonly(label, text, sub) { return xRow({ icon: false, title: label, sub: sub, right: h('span', { class: 'k-sub', text: text }) }); }
/* 文本字段（失焦 / 回车才写草稿） */
function wvText(g, k, label, o) {
  o = o || {}; var v = weVal(g, k);
  return xText({ title: label, sub: o.sub, value: v === undefined || v === null ? '' : String(v), placeholder: o.placeholder, onCommit: function (t) { weSetV(g, k, t); } });
}
/* 整数字段当前值超出 JS 能精确表示的范围时，不在这里改（会被四舍五入），提示去「数据」页 */
function wvBigInt(g, k, label, o) {
  o = o || {}; var v = weVal(g, k);
  if (weViewField(g, k).wire_snbt) {
    var meta = nbtMeta(v), raw = meta && meta.scalar ? meta.scalar.raw.replace(/[lL]$/, '') : String(v === undefined ? 0 : v);
    if (Math.abs(Number(v)) > 9007199254740991) return xText({ title: label, sub: o.sub, value: raw, cls: 'we-in', onCommit: function (text) {
      if (!/^[+-]?\d+$/.test(text.trim())) { toast(I18n.t("cadeditor.ui.worldview.2a7fb62426"), 'error'); return; }
      weSetV(g, k, parseSnbt(text.trim() + 'L'));
    } });
    return xNum({ title: label, sub: o.sub, value: Number(v) || 0, step: 1, unit: o.unit, noSlider: true, onChange: function (x) { weSetV(g, k, parseSnbt(String(x) + 'L')); } });
  }
  if (typeof v === 'number' && !(Math.abs(v) <= 9007199254740991)) return wvReadonly(label, String(v), I18n.t("cadeditor.ui.worldview.738d9855a6"));
  return xNum({ title: label, sub: o.sub, value: typeof v === 'number' ? v : 0, step: 1, unit: o.unit, noSlider: true, onChange: function (x) { weSetV(g, k, x); } });
}
/* 候选来自后端 schema.fields.KEY.candidates 的枚举字段（大小写按候选原样写回） */
var WV_ENUM = { none: I18n.t("cadeditor.ui.common.none"), clockwise_90: I18n.t("cadeditor.ui.worldview.4aff55b66f"), clockwise_180: '180°', counterclockwise_90: I18n.t("cadeditor.ui.worldview.bff6a8ceef"), left_right: I18n.t("cadeditor.ui.worldview.191e26b5d7"), front_back: I18n.t("cadeditor.ui.worldview.7f23611ba7"),
  save: I18n.t("cadeditor.ui.common.save"), load: I18n.t("cadeditor.ui.worldview.f716b5f91e"), corner: I18n.t("cadeditor.ui.worldview.beddda2bcf"), data: I18n.t("cadeditor.ui.labels.5440f7424f"), rollable: I18n.t("cadeditor.ui.worldview.20adaaf18d"), aligned: I18n.t("cadeditor.ui.worldentity.fd5fb78ba2") };
function wvEnum(g, k, label, o) {
  o = o || {}; var cands = weViewField(g, k).candidates || [], cur = weVal(g, k);
  if (!cands.length) return wvText(g, k, label, o);
  var opts = cands.map(function (c) { return { v: c, label: WV_ENUM[String(c).toLowerCase()] || String(c) }; });
  if (cands.length <= 4) return xSeg({ title: label, sub: o.sub, options: opts, value: cur, onChange: function (x) { weSetV(g, k, x); } });
  return xSelect({ title: label, sub: o.sub, options: opts, value: cur, width: 180, onChange: function (x) { weSetV(g, k, x); } });
}

/* ---------- 潮涌核心（只读） ---------- */
WEV.conduit = function (body, g) {
  var v = weViewOrig(g);
  body.appendChild(xSec('sparkle', I18n.t("cadeditor.ui.worldview.ea68086159"), I18n.t("cadeditor.ui.worldview.326bc7f290")));
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.8f3c822f08"), v.Active ? I18n.t("cadeditor.ui.labels.b5141d3d19") : I18n.t("cadeditor.ui.labels.0c70665b6e")));
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.67995d4181"), v.Hunting ? I18n.t("cadeditor.ui.labels.b5141d3d19") : I18n.t("cadeditor.ui.labels.0c70665b6e")));
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.eeeb35e6e2"), v.Target ? I18n.t("cadeditor.ui.worldview.90ce0f66f0") : I18n.t("cadeditor.ui.worldentity.f127804b92")));
};
/* ---------- 末地折跃门 ---------- */
WEV.end_gateway = function (body, g) {
  var ep = weVal(g, 'exit_portal'), has = Array.isArray(ep) && ep.length === 3;
  body.appendChild(xSec('wind', I18n.t("cadeditor.ui.worldview.e61388b36d")));
  body.appendChild(xToggle({ title: I18n.t("cadeditor.ui.worldview.499758c6de"), sub: I18n.t("cadeditor.ui.worldview.b585f76dd3"), value: has, onChange: function (on) { weSetV(g, 'exit_portal', on ? [0, 64, 0] : null); weRender(); } }));
  if (has) ['X', 'Y', 'Z'].forEach(function (ax, i) {
    body.appendChild(xNum({ title: I18n.t("cadeditor.ui.worldview.dd2792006b", (ax)), value: ep[i], step: 1, noSlider: true, onChange: function (x) { var a = (weVal(g, 'exit_portal') || ep).slice(); a[i] = x; weSetV(g, 'exit_portal', a); } }));
  });
  body.appendChild(wvToggle(g, 'ExactTeleport', I18n.t("cadeditor.ui.worldview.e44fb48d94"), I18n.t("cadeditor.ui.worldview.274893ff18")));
  body.appendChild(wvBigInt(g, 'Age', I18n.t("cadeditor.ui.worldentity.e8b1268c1e"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
};
/* ---------- 结构方块 ---------- */
WEV.structure_block = function (body, g) {
  body.appendChild(xSec('cube', I18n.t("cadeditor.ui.worldview.3b15fa5b2a")));
  body.appendChild(wvText(g, 'name', I18n.t("cadeditor.ui.labels.6773310492"), { sub: I18n.t("cadeditor.ui.worldview.4795a01156") }));
  body.appendChild(wvText(g, 'author', I18n.t("cadeditor.ui.cards3.7d4146ca08")));
  body.appendChild(wvText(g, 'metadata', I18n.t("cadeditor.ui.worldview.c25efb4062")));
  body.appendChild(wvEnum(g, 'mode', I18n.t("cadeditor.ui.labels.47a270081a")));
  body.appendChild(xSec('target', I18n.t("cadeditor.ui.forms.ae72b532f4"), I18n.t("cadeditor.ui.worldview.808372be7b")));
  ['posX', 'posY', 'posZ'].forEach(function (k, i) { body.appendChild(wvNum(g, k, I18n.t("cadeditor.ui.worldview.5858379eb5", ('XYZ'.charAt(i))))); });
  ['sizeX', 'sizeY', 'sizeZ'].forEach(function (k, i) { body.appendChild(wvNum(g, k, I18n.t("cadeditor.ui.worldview.9830ec78e6", ('XYZ'.charAt(i))))); });
  body.appendChild(xSec('sliders', I18n.t("cadeditor.ui.worldview.901d1623fc")));
  body.appendChild(wvEnum(g, 'rotation', I18n.t("cadeditor.ui.labels.68eb90fa80")));
  body.appendChild(wvEnum(g, 'mirror', I18n.t("cadeditor.ui.worldview.176c09844e")));
  body.appendChild(xNum({ title: I18n.t("cadeditor.ui.worldview.b1d8b50c5f"), sub: I18n.t("cadeditor.ui.worldview.cf059c6f22"), value: typeof weVal(g, 'integrity') === 'number' ? weVal(g, 'integrity') : 1, step: 0.05, dec: 3, noSlider: true, onChange: function (x) { weSetV(g, 'integrity', x); } }));
  body.appendChild(wvBigInt(g, 'seed', I18n.t("cadeditor.ui.world.30eca98dc1")));
  body.appendChild(wvToggle(g, 'ignoreEntities', I18n.t("cadeditor.ui.worldview.997a3f6ed8")));
  body.appendChild(wvToggle(g, 'showair', I18n.t("cadeditor.ui.worldview.ef9e25bdd8")));
  body.appendChild(wvToggle(g, 'showboundingbox', I18n.t("cadeditor.ui.worldview.c887bbe800")));
  body.appendChild(wvToggle(g, 'powered', I18n.t("cadeditor.ui.worldview.9980b18ec5"), I18n.t("cadeditor.ui.worldview.3820ad2ac9")));
};
/* ---------- 拼图方块 ---------- */
WEV.jigsaw = function (body, g) {
  body.appendChild(xSec('link', I18n.t("cadeditor.ui.worldview.37a7ebce78")));
  body.appendChild(wvText(g, 'name', I18n.t("cadeditor.ui.labels.6773310492"), { sub: I18n.t("cadeditor.ui.worldview.a92cf2cf44") }));
  body.appendChild(wvText(g, 'target', I18n.t("cadeditor.ui.worldview.d183d85a62"), { sub: I18n.t("cadeditor.ui.worldview.a92cf2cf44") }));
  body.appendChild(wvText(g, 'pool', I18n.t("cadeditor.ui.worldview.eb19529fea"), { sub: I18n.t("cadeditor.ui.worldview.0b46d2c789") }));
  body.appendChild(wvText(g, 'final_state', I18n.t("cadeditor.ui.worldview.6a31a971d4"), { sub: I18n.t("cadeditor.ui.worldview.386e059ca4") }));
  body.appendChild(wvEnum(g, 'joint', I18n.t("cadeditor.ui.worldview.485a26050c")));
};
/* ---------- 幽匿感测体 / 校频幽匿感测体 / 幽匿尖啸体 ---------- */
WEV.sculk_sensor = function (body, g) {
  body.appendChild(xSec('sparkle', I18n.t("cadeditor.ui.worldview.4908952d86")));
  body.appendChild(wvNum(g, 'last_vibration_frequency', I18n.t("cadeditor.ui.worldview.69356361b1")));
  body.appendChild(wvNum(g, 'listener.event_delay', I18n.t("cadeditor.ui.worldview.bdf12175ab"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
};
WEV.sculk_shrieker = function (body, g) {
  body.appendChild(xSec('sparkle', I18n.t("cadeditor.ui.labels.a63c2f9096")));
  body.appendChild(wvNum(g, 'warning_level', I18n.t("cadeditor.ui.worldview.d0bc6ab748")));
  body.appendChild(wvNum(g, 'listener.event_delay', I18n.t("cadeditor.ui.worldview.bdf12175ab"), { unit: I18n.t("cadeditor.ui.cards2.3ccf035260") }));
  body.appendChild(kHint(I18n.t("cadeditor.ui.worldview.63a5657f5e")));
};
WEV.sculk_catalyst = function (body, g) {
  var c = weViewOrig(g).cursors;
  body.appendChild(xSec('sparkle', I18n.t("cadeditor.ui.worldview.b40d506c50"), I18n.t("cadeditor.ui.worldview.c3aba394ec")));
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.06c877c884"), I18n.t("cadeditor.ui.cards1.a88dddda1c", (Array.isArray(c) ? c.length : 0))));
};
/* ---------- 钟（只读） ---------- */
WEV.bell = function (body, g) {
  var v = weViewOrig(g);
  body.appendChild(xSec('bell', I18n.t("cadeditor.ui.worldview.13d02782bb"), I18n.t("cadeditor.ui.worldview.06889fd590")));
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.05fba72f70"), v.shaking ? I18n.t("cadeditor.ui.labels.b5141d3d19") : I18n.t("cadeditor.ui.labels.0c70665b6e")));
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.c30359471c"), String(typeof v.ticks === 'number' ? v.ticks : 0), I18n.t("cadeditor.ui.cards2.3ccf035260")));
};
/* ---------- 试炼宝库 / 不祥宝库（安全子集） ---------- */
WEV.vault = function (body, g) {
  body.appendChild(xSec('chest', I18n.t("cadeditor.ui.worldview.cd7b983143"), I18n.t("cadeditor.ui.worldview.f3df1af2c2")));
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.world.43d4f9d7c6"), sub: I18n.t("cadeditor.ui.worldview.af438d48b8"), right: wvItem(weVal(g, 'config.key_item'), function (v) { weSetV(g, 'config.key_item', v); weRender(); }) }));
  var lt = kRegSelect({ reg: 'loot_table', value: weVal(g, 'config.loot_table') || '', title: I18n.t("cadeditor.ui.spawn.0c4481f3cf"), empty: I18n.t("cadeditor.ui.banner.3c5045c728"), onChange: function (x) { if (x) weSetV(g, 'config.loot_table', x); } });
  body.appendChild(xRow({ icon: false, title: I18n.t("cadeditor.ui.spawn.9a63c2e6fc"), right: lt.el }));
  body.appendChild(xNum({ title: I18n.t("cadeditor.ui.spawn.670f9c438f"), sub: I18n.t("cadeditor.ui.worldview.dd227e782d"), value: weVal(g, 'config.activation_range'), def: 4, step: 0.5, dec: 3, unit: I18n.t("cadeditor.ui.cards2.06f2f8e0a8"), noSlider: true, onChange: function (x) { weSetV(g, 'config.activation_range', x); } }));
  body.appendChild(xNum({ title: I18n.t("cadeditor.ui.worldview.6e5f3a1c5f"), value: weVal(g, 'config.deactivation_range'), def: 4.5, step: 0.5, dec: 3, unit: I18n.t("cadeditor.ui.cards2.06f2f8e0a8"), noSlider: true, onChange: function (x) { weSetV(g, 'config.deactivation_range', x); } }));
  var rp = weViewOrig(g)['server_data.rewarded_players'];
  body.appendChild(wvReadonly(I18n.t("cadeditor.ui.worldview.1d8b1f39ff"), I18n.t("cadeditor.ui.worldview.b72dfa03d4", (Array.isArray(rp) ? rp.length : 0)), I18n.t("cadeditor.ui.worldentity.3b5ec3533b")));
};

function weViewTab(body) {
  var gs = weViewGroups();
  if (!gs.length) { body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldview.50346465f4"))); return; }
  gs.forEach(function (g) {
    var fn = WEV[g];
    if (fn) fn(body, g); else body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldview.d776a7312b", (g))));
  });
}

/* ---------- 方块状态：属性名 / 取值的中文名（界面文字；游戏本身没有这些翻译，认不得的原样显示） ---------- */
var WE_PROP = Labels.blockProp;
var WE_VAL = Labels.blockVal;
function wePropName(n) { return WE_PROP[n] || humanId(n); }
function wePropVal(v) { return WE_VAL[v] !== undefined ? WE_VAL[v] : v; }

/* ---------- 方块状态 ---------- */
function weStateRow(p) {
  var cur = weStateCur(p), nm = p.name;
  function set(v) { if (v === p.current) delete WE.bstate[nm]; else WE.bstate[nm] = v; weMarkDirty(); weHeroLive(); }
  var ctl;
  if (p.type === 'boolean') ctl = kToggle(cur === 'true', function (on) { set(on ? 'true' : 'false'); }).el;
  else if (p.values.length <= 5) ctl = kSeg(p.values.map(function (v) { return { v: v, label: wePropVal(v) }; }), cur, set).el;
  else ctl = kSelect(p.values.map(function (v) { return { v: v, label: wePropVal(v) }; }), cur, set, { width: 200 }).el;
  return xRow({ icon: false, title: wePropName(nm), sub: p.default !== undefined ? I18n.t("cadeditor.ui.eschema.5564c10bef", (wePropVal(p.default))) : '', tip: nm, right: ctl });
}
function weStateTab(body) {
  var sc = weStateSchema();
  body.appendChild(xSec('sliders', I18n.t("cadeditor.ui.rules.a528d413f7"), sc.length ? I18n.t("cadeditor.ui.cards2.a9ab3a5f38", (sc.length)) : ''));
  if (!sc.length) body.appendChild(xEmpty(I18n.t("cadeditor.ui.worldview.808c650597")));
  sc.forEach(function (p) { body.appendChild(weStateRow(p)); });
  body.appendChild(xToggle({ title: I18n.t("cadeditor.ui.worldview.92a84533cd"), sub: I18n.t("cadeditor.ui.worldview.d9b7d2e425"), value: WE.upd, onChange: function (on) { WE.upd = on; } }));
}
