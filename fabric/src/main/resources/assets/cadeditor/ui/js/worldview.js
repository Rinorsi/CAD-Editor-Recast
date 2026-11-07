/* 世界方块的规范化视图和方块状态（docs/world-block-edit.md）。
   视图 world.views.<组> = {value, snbt, schema}：value 是游戏真实 Codec 的 JSON，页面只提交改过的顶层字段（apply.views.<组>）；
   方块状态 world.block_state_schema = [{name,type,values,default,current}]，提交 apply.block_state 里改过的属性。
   数据范围、行数、颜色都读 schema，不在这里写死。 */
var WEV = {};
WE.views = {}; WE.bstate = {}; WE.btype = ''; WE.upd = true; WE.face = 'front';
function weResetEdits() { WE.views = {}; WE.bstate = {}; WE.btype = ''; }
function weViews() { return (WE.w && WE.w.views) || {}; }
function weViewGroups() { var v = weViews(); return Object.keys(v).filter(function (g) { return g !== 'unsupported' && v[g] && v[g].value; }); }
function weViewOrig(g) { var v = weViews()[g]; return v && v.value ? v.value : {}; }
/* 草稿存储（方块视图 WE.views、实体 / 玩家 WE.ent 共用）：只记和原值不同的字段，改回原值就删掉；改完刷新顶栏 / 底栏 */
function weDraftGet(store, g, k, orig) { var e = store[g]; if (e && Object.prototype.hasOwnProperty.call(e, k)) return e[k]; return orig[k]; }
function weVal(g, k) { return weDraftGet(WE.views, g, k, weViewOrig(g)); }
function weNorm(v) { return JSON.stringify(v === undefined ? null : v); }
function weDraftSet(store, g, k, v, orig) {
  var e = store[g] || (store[g] = {});
  if (weNorm(v) === weNorm(orig[k])) delete e[k]; else e[k] = v;
  if (!Object.keys(e).length) delete store[g];
  weMarkDirty();
}
function weSetV(g, k, v) { weDraftSet(WE.views, g, k, v, weViewOrig(g)); }
function weViewField(g, k) { var s = weViews()[g]; return s && s.schema && s.schema.fields ? s.schema.fields[k] || {} : {}; }
function weStateSchema() { return (WE.w && WE.w.block_state_schema) || []; }
function weTypeSchema() { var t = WE.w && WE.w.block_type_schema; return Array.isArray(t) ? t.map(function (x) { return typeof x === 'string' ? x : x.id; }) : []; }
function weStateCur(p) { return WE.bstate[p.name] !== undefined ? WE.bstate[p.name] : p.current; }
function weViewsDirty() { return !!WE.w && (Object.keys(WE.views).length > 0 || Object.keys(WE.bstate).length > 0 || !!(WE.btype && WE.btype !== WE.w.block)); }
function weViewsMsg(msg) {
  var vg = Object.keys(WE.views);
  if (vg.length) { msg.views = {}; vg.forEach(function (g) { msg.views[g] = clone(WE.views[g]); }); }
  var bs = {}, any = false;
  weStateSchema().forEach(function (p) { if (WE.bstate[p.name] !== undefined && WE.bstate[p.name] !== p.current) { bs[p.name] = WE.bstate[p.name]; any = true; } });
  if (any) msg.block_state = bs;
  if (WE.btype && WE.btype !== WE.w.block) msg.block_type = WE.btype;
  if ((any || msg.block_type) && !WE.upd) msg.updateNeighbors = false;
}

var WEV_INFO = { sign: ['告示牌', 'edit'], banner: ['旗帜图案', 'banner'], beehive: ['蜜蜂', 'flower'], lectern: ['讲台', 'book_open'], jukebox: ['唱片机', 'music'],
  decorated_pot: ['纹饰陶罐', 'gem'], chiseled_bookshelf: ['雕纹书架', 'book'], command_block: ['命令', 'terminal'], skull: ['头颅', 'skull'], furnace: ['熔炉进度', 'furnace'],
  brewing_stand: ['酿造进度', 'flask'], campfire: ['营火', 'campfire'] };
function weViewTabInfo() { var g = weViewGroups(), n = g.length === 1 && WEV_INFO[g[0]] ? WEV_INFO[g[0]] : null; return { label: n ? n[0] : '方块设置', icon: n ? n[1] : 'sliders' }; }

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
  activate(btn, function () { pickItem(btn, function (id) { onSet({ id: fullId(id), count: 1 }); kPopClose(); }); });
  var kids = [btn];
  if (has) kids.push(kBtn('清空', function () { onSet(null); }, { icon: 'trash' }));
  return h('div', { class: 'k-row' }, kids);
}

/* ---------- 告示牌 / 悬挂告示牌 ---------- */
WEV.sign = function (body, g) {
  var face = WE.face === 'back' ? 'back_text' : 'front_text', fs = weViewField(g, face), n = fs.messages_length || 4;
  body.appendChild(xSec('edit', '文字', undefined, kSeg([{ v: 'front', label: '正面' }, { v: 'back', label: '背面' }], WE.face, function (v) { WE.face = v; weRender(); }).el));
  function cur() { var o = weVal(g, face); return clone(o && typeof o === 'object' ? o : { messages: [] }); }
  function setFace(fn) {
    var o = cur(); if (!Array.isArray(o.messages)) o.messages = []; while (o.messages.length < n) o.messages.push('');
    fn(o); weSetV(g, face, o);
  }
  var msgs = cur().messages || [];
  for (var i = 0; i < n; i++) (function (i) {
    var inp = kInput(msgText(msgs[i]), function () {}, { placeholder: '第 ' + (i + 1) + ' 行' }); inp.classList.add('we-line');
    inp.addEventListener('change', function () {
      var before = !!weVal(g, 'is_waxed');
      setFace(function (o) { o.messages[i] = textMsg(inp.value); });
      if (before) { weSetV(g, 'is_waxed', false); toast('涂过蜡的告示牌不能改字：已同时取消涂蜡', 'info'); weRender(); }
    });
    body.appendChild(h('div', { class: 'x2r' }, [h('span', { class: 'x2l' }, [h('span', { text: String(i + 1) })]), inp]));
  })(i);
  var o = cur();
  body.appendChild(xRow({ icon: false, title: '文字颜色', right: dyeButton(o.color || 'black', function (c) { setFace(function (x) { x.color = c; }); weRender(); }) }));
  body.appendChild(xToggle({ title: '发光文字', sub: '用荧光墨囊涂过的效果', value: o.has_glowing_text, onChange: function (on) { setFace(function (x) { x.has_glowing_text = on; }); } }));
  body.appendChild(xSec('lock', '涂蜡'));
  body.appendChild(wvToggle(g, 'is_waxed', '涂蜡', '涂过蜡的告示牌不能再改字'));
  body.appendChild(h('div', { class: 'k-sub', text: '一行里想要样式（颜色、粗体）时，直接写文本组件，比如 {"text":"你好","color":"red"}。' }));
};

/* ---------- 旗帜图案 ---------- */
WEV.banner = function (body, g) {
  var list = clone(weVal(g, 'patterns') || []);
  var base = weViews()[g].schema && weViews()[g].schema.base_color;
  body.appendChild(xSec('banner', '图案', list.length + ' 层' + (base ? ' · 底色 ' + ((EDATA.L && EDATA.L.color && EDATA.L.color[base]) || base) : '')));
  function save() { weSetV(g, 'patterns', clone(list)); }
  list.forEach(function (p, i) {
    var sel = kRegSelect({ reg: 'banner_pattern', value: p.pattern, title: '选择图案', onChange: function (id) { list[i].pattern = id; save(); } });
    var col = dyeButton(p.color || 'white', function (c) { list[i].color = c; save(); weRender(); });
    var rm = kBtn('', function () { list.splice(i, 1); save(); weRender(); }, { icon: 'trash', title: '去掉这一层' });
    body.appendChild(h('div', { class: 'k-row we-row' }, [h('span', { class: 'k-sub', text: String(i + 1) }), sel.el, col, rm]));
  });
  body.appendChild(xAdd('添加一层图案', function () { list.push({ pattern: 'minecraft:stripe_bottom', color: 'white' }); save(); weRender(); }));
};

/* ---------- 蜂箱 / 蜂巢 ---------- */
WEV.beehive = function (body, g) {
  var list = clone(weVal(g, 'bees') || []), f = weViewField(g, 'bees'), max = f.vanilla_max_occupants;
  body.appendChild(xSec('flower', '里面的蜜蜂', list.length + (max ? ' / ' + max : '') + ' 只'));
  function save() { weSetV(g, 'bees', clone(list)); }
  list.forEach(function (b, i) {
    var ed = b.entity_data || {};
    var t1 = kNumber(b.ticks_in_hive || 0, { min: 0, noSlider: true, step: 20, unit: '刻', onChange: function (v) { list[i].ticks_in_hive = v; save(); } });
    var t2 = kNumber(b.min_ticks_in_hive === undefined ? 600 : b.min_ticks_in_hive, { min: 0, noSlider: true, step: 20, unit: '刻', onChange: function (v) { list[i].min_ticks_in_hive = v; save(); } });
    var rm = kBtn('放走', function () { list.splice(i, 1); save(); weRender(); }, { icon: 'trash', title: '放走这只蜜蜂' });
    body.appendChild(xRow({ icon: entityIcon(ed.id || 'minecraft:bee', 22), title: '蜜蜂 ' + (i + 1), sub: '已在里面 ' + (b.ticks_in_hive || 0) + ' 刻 · 最短待 ' + (b.min_ticks_in_hive === undefined ? 600 : b.min_ticks_in_hive) + ' 刻', chevron: true, open: !!UIOpen['we:bee:' + i],
      onHead: function () { UIOpen['we:bee:' + i] = !UIOpen['we:bee:' + i]; weRender(); },
      body: function () { return [esEntityHeader({ id: ed.id || 'minecraft:bee', onPick: function (id) { list[i].entity_data = Object.assign({}, list[i].entity_data, { id: id }); save(); weRender(); }, onEntityNbt: function (snbt) { list[i].entity_data = vaultEntityObj(snbt); save(); weRender(); } }), xField('clock', '已在里面', t1.el), xField('hourglass', '最短待多久', t2.el), h('div', { class: 'x2f' }, [h('div', { class: 'grow' }), rm])]; } }));
  });
  if (!max || list.length < max) body.appendChild(xAdd('放进一只蜜蜂', function () { list.push({ entity_data: { id: 'minecraft:bee' }, ticks_in_hive: 0, min_ticks_in_hive: 600 }); save(); weRender(); }));
  body.appendChild(h('div', { class: 'k-sub', text: '蜂蜜等级在「方块状态」里改。' }));
};

/* ---------- 讲台 / 唱片机 ---------- */
WEV.lectern = function (body, g) {
  body.appendChild(xSec('book_open', '书'));
  body.appendChild(xRow({ icon: false, title: '放着的书', sub: '只能放书与笔 / 成书', right: wvItem(weVal(g, 'Book'), function (v) { weSetV(g, 'Book', v); weRender(); }) }));
  body.appendChild(wvNum(g, 'Page', '翻到第几页', { sub: '游戏自己存的页码，空书是 -1' }));
};
WEV.jukebox = function (body, g) {
  body.appendChild(xSec('music', '唱片'));
  body.appendChild(xRow({ icon: false, title: '放着的唱片', sub: '换唱片会从头开始播', right: wvItem(weVal(g, 'RecordItem'), function (v) { weSetV(g, 'RecordItem', v); weRender(); }) }));
};

/* ---------- 纹饰陶罐：后 / 左 / 右 / 前 ---------- */
WEV.decorated_pot = function (body, g) {
  var cur = clone(weVal(g, 'sherds') || []); while (cur.length < 4) cur.push('minecraft:brick');
  var names = ['后', '左', '右', '前'];
  body.appendChild(xSec('gem', '四面纹饰', '陶片或砖'));
  names.forEach(function (nm, i) {
    var id = cur[i], btn = h('div', { class: 'k-btn' }, [itemIcon(shortId(id), 22), h('span', { text: nameOfItem(id) })]);
    activate(btn, function () { pickItem(btn, function (x) { cur[i] = fullId(x); weSetV(g, 'sherds', cur.slice()); kPopClose(); weRender(); }); });
    body.appendChild(xRow({ icon: false, title: nm + '面', right: btn }));
  });
  body.appendChild(h('div', { class: 'k-sub', text: '陶罐里放的东西在「容器」页。' }));
};
WEV.chiseled_bookshelf = function (body, g) {
  body.appendChild(xSec('book', '雕纹书架'));
  body.appendChild(wvNum(g, 'last_interacted_slot', '上次碰过的格子', { sub: '-1 表示还没碰过' }));
  body.appendChild(h('div', { class: 'k-sub', text: '六本书在「容器」页里放。' }));
};

/* ---------- 命令方块：模式 + 命令 ---------- */
WEV.command_block = function (body, g) {
  var types = weTypeSchema();
  if (types.length > 1) {
    var NAMES = { 'minecraft:command_block': '脉冲', 'minecraft:repeating_command_block': '循环', 'minecraft:chain_command_block': '连锁' };
    body.appendChild(xSec('terminal', '模式'));
    body.appendChild(h('div', { class: 'k-row' }, [kSeg(types.map(function (t) { return { v: t, label: NAMES[t] || humanId(shortId(t)) }; }), WE.btype || WE.w.block, function (v) { WE.btype = v === WE.w.block ? '' : v; weMarkDirty(); }).el]));
  }
  body.appendChild(xSec('code', '命令'));
  var ta = h('textarea', { class: 'ed-snbt we-cmd', spellcheck: 'false', placeholder: '/say hi（可以省略开头的 /）' }); ta.value = weVal(g, 'Command') || '';
  ta.addEventListener('change', function () { weSetV(g, 'Command', ta.value); });
  body.appendChild(ta);
  body.appendChild(wvToggle(g, 'auto', '始终活动', '不需要红石也会一直执行'));
  body.appendChild(wvToggle(g, 'TrackOutput', '记录上次输出', '关掉后命令方块里看不到输出'));
  body.appendChild(wvToggle(g, 'powered', '当前通电'));
  var cond = weStateSchema().filter(function (p) { return p.name === 'conditional'; })[0];
  if (cond) body.appendChild(xToggle({ title: '有条件', sub: '只有后面那个方块成功才执行', value: weStateCur(cond) === 'true', onChange: function (on) { var v = on ? 'true' : 'false'; if (v === cond.current) delete WE.bstate.conditional; else WE.bstate.conditional = v; weMarkDirty(); } }));
};

/* ---------- 头颅 ---------- */
WEV.skull = function (body, g) {
  var prof = weVal(g, 'minecraft:profile'), simple = prof === null || prof === undefined || typeof prof === 'string' || (typeof prof === 'object' && Object.keys(prof).every(function (k) { return k === 'name'; }));
  body.appendChild(xSec('skull', '头颅'));
  if (simple) {
    var nm = typeof prof === 'string' ? prof : (prof && prof.name) || '';
    body.appendChild(xText({ title: '头颅的主人', sub: '玩家名；联网时游戏会补全皮肤', value: nm, placeholder: '玩家名', cls: 'we-in', onCommit: function (t) { var v = t.trim(); weSetV(g, 'minecraft:profile', v ? { name: v } : null); } }));
  } else body.appendChild(xRow({ icon: false, title: '头颅的主人', sub: '带有皮肤数据，这里不改；要换请先清除', right: kBtn('清除', function () { weSetV(g, 'minecraft:profile', null); weRender(); }, { icon: 'trash' }) }));
  body.appendChild(xText({ title: '名称', value: msgText(weVal(g, 'minecraft:custom_name')), placeholder: '自定义名称（可空）', cls: 'we-in', onCommit: function (t) { weSetV(g, 'minecraft:custom_name', t ? textMsg(t) : null); } }));
};

/* ---------- 熔炉 / 酿造台 / 营火：计时 ---------- */
WEV.furnace = function (body, g) {
  body.appendChild(xSec('furnace', '进度', '单位：游戏刻（20 刻 = 1 秒）'));
  body.appendChild(wvNum(g, 'cooking_time_spent', '已烧了多久', { unit: '刻' }));
  body.appendChild(wvNum(g, 'cooking_total_time', '这一件要烧多久', { unit: '刻' }));
  body.appendChild(wvNum(g, 'lit_time_remaining', '燃料还能烧', { unit: '刻' }));
  body.appendChild(wvNum(g, 'lit_total_time', '这块燃料一共能烧', { unit: '刻' }));
  body.appendChild(h('div', { class: 'k-sub', text: '游戏运行时会自己推进这些数；你没改的项，保存时以当时的实际进度为准。' }));
};
WEV.brewing_stand = function (body, g) {
  body.appendChild(xSec('flask', '进度'));
  body.appendChild(wvNum(g, 'BrewTime', '还要酿多久', { unit: '刻' }));
  body.appendChild(wvNum(g, 'Fuel', '烈焰粉燃料'));
};
WEV.campfire = function (body, g) {
  var n = weViewField(g, 'CookingTimes').length || 4;
  var a = clone(weVal(g, 'CookingTimes') || []), b = clone(weVal(g, 'CookingTotalTimes') || []);
  body.appendChild(xSec('campfire', '四个烤位', '单位：游戏刻'));
  for (var i = 0; i < n; i++) (function (i) {
    var x = kNumber(a[i] || 0, { min: 0, noSlider: true, step: 20, unit: '刻', onChange: function (v) { a[i] = v; weSetV(g, 'CookingTimes', a.slice()); } });
    var y = kNumber(b[i] || 0, { min: 0, noSlider: true, step: 20, unit: '刻', onChange: function (v) { b[i] = v; weSetV(g, 'CookingTotalTimes', b.slice()); } });
    body.appendChild(xRow({ icon: false, title: '烤位 ' + (i + 1), sub: '已烤 / 一共要烤', right: h('div', { class: 'k-row' }, [x.el, y.el]) }));
  })(i);
};

function weViewTab(body) {
  var gs = weViewGroups();
  if (!gs.length) { body.appendChild(xEmpty('这个方块没有专用设置。')); return; }
  gs.forEach(function (g) {
    var fn = WEV[g];
    if (fn) fn(body, g); else body.appendChild(xEmpty('「' + g + '」暂时只能在「数据」页编辑。'));
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
  function set(v) { if (v === p.current) delete WE.bstate[nm]; else WE.bstate[nm] = v; weMarkDirty(); }
  var ctl;
  if (p.type === 'boolean') ctl = kToggle(cur === 'true', function (on) { set(on ? 'true' : 'false'); }).el;
  else if (p.values.length <= 5) ctl = kSeg(p.values.map(function (v) { return { v: v, label: wePropVal(v) }; }), cur, set).el;
  else ctl = kSelect(p.values.map(function (v) { return { v: v, label: wePropVal(v) }; }), cur, set, { width: 200 }).el;
  return xRow({ icon: false, title: wePropName(nm), sub: p.default !== undefined ? '默认 ' + wePropVal(p.default) : '', tip: nm, right: ctl });
}
function weStateTab(body) {
  var sc = weStateSchema();
  body.appendChild(xSec('sliders', '方块状态', sc.length ? sc.length + ' 项' : ''));
  if (!sc.length) body.appendChild(xEmpty('这个方块没有可以改的状态。'));
  sc.forEach(function (p) { body.appendChild(weStateRow(p)); });
  body.appendChild(xToggle({ title: '通知相邻方块', sub: '关掉后这次修改不会触发周围方块更新', value: WE.upd, onChange: function (on) { WE.upd = on; } }));
}
