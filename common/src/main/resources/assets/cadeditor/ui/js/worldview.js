/* 世界方块的规范化视图和方块状态（docs/world-block-edit.md）。
   视图 world.views.<组> = {value, snbt, schema}：value 是游戏真实 Codec 的 JSON，页面只提交改过的顶层字段（apply.views.<组>）；
   方块状态 world.block_state_schema = [{name,type,values,default,current}]，提交 apply.block_state 里改过的属性。
   数据范围、行数、颜色都读 schema，不在这里写死。 */
var WEV = {};
WE.views = {}; WE.bstate = {}; WE.btype = ''; WE.upd = true; WE.face = 'front';
function weResetEdits() { WE.views = {}; WE.bstate = {}; WE.btype = ''; }
function weViews() { return (WE.w && WE.w.views) || {}; }
function weViewGroups() { var v = weViews(); return Object.keys(v).filter(function (g) { return g !== 'unsupported' && g !== 'generic' && v[g] && v[g].value; }); }
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

var WEV_INFO = { generic: ['其他设置', 'sliders'], sign: ['告示牌', 'edit'], banner: ['旗帜图案', 'banner'], beehive: ['蜜蜂', 'flower'], lectern: ['讲台', 'book_open'], jukebox: ['唱片机', 'music'],
  decorated_pot: ['纹饰陶罐', 'gem'], chiseled_bookshelf: ['雕纹书架', 'book'], command_block: ['命令', 'terminal'], skull: ['头颅', 'skull'], furnace: ['熔炉进度', 'furnace'],
  brewing_stand: ['酿造进度', 'flask'], campfire: ['营火', 'campfire'], nameable: ['名称', 'tag'], hopper: ['漏斗', 'sliders'], beacon: ['信标', 'sparkle'], crafter: ['合成器', 'grid'],
  conduit: ['潮涌核心', 'sparkle'], end_gateway: ['折跃门', 'wind'], structure_block: ['结构方块', 'cube'], jigsaw: ['拼图方块', 'link'], sculk_sensor: ['幽匿感测体', 'sparkle'],
  sculk_shrieker: ['幽匿尖啸体', 'sparkle'], sculk_catalyst: ['幽匿催生体', 'sparkle'], bell: ['钟', 'bell'], vault: ['宝库', 'chest'] };
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
  body.appendChild(kHint('一行里想要样式（颜色、粗体）时，直接写文本组件，比如 {"text":"你好","color":"red"}。'));
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
  body.appendChild(kHint('蜂蜜等级在「方块状态」里改。'));
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
  body.appendChild(kHint('陶罐里放的东西在「容器」页。'));
};
WEV.chiseled_bookshelf = function (body, g) {
  body.appendChild(xSec('book', '雕纹书架'));
  body.appendChild(wvNum(g, 'last_interacted_slot', '上次碰过的格子', { sub: '-1 表示还没碰过' }));
  body.appendChild(kHint('六本书在「容器」页里放。'));
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
  body.appendChild(kHint('游戏运行时会自己推进这些数；你没改的项，保存时以当时的实际进度为准。'));
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

/* ---------- 自定义名称（所有能改名的方块：箱子、熔炉、漏斗、附魔台……）---------- */
WEV.nameable = function (body, g) {
  body.appendChild(xSec('tag', '名称', '留空 = 用方块原来的名字'));
  var cur = weVal(g, 'CustomName');
  var r = kRich(cur === undefined || cur === null ? '' : cur, { placeholder: '输入新名称；留空 = 恢复默认名称',
    onChange: function (v, empty) { weSetV(g, 'CustomName', empty ? null : v); } });
  body.appendChild(r.el);
};

/* ---------- 漏斗：搬运冷却 ---------- */
WEV.hopper = function (body, g) {
  body.appendChild(xSec('sliders', '搬运', '单位：游戏刻（20 刻 = 1 秒）'));
  body.appendChild(xNum({ title: '搬运冷却', sub: '还要等多久才搬下一个；0 = 马上', value: weVal(g, 'TransferCooldown'), def: 0, step: 1, unit: '刻', onChange: function (x) { weSetV(g, 'TransferCooldown', x); } }));
  body.appendChild(kHint('游戏运行时会自己倒数；你没改这一项，保存时以当时的实际值为准。'));
};

/* ---------- 信标：主 / 副效果（候选来自游戏），等级只读 ---------- */
WEV.beacon = function (body, g) {
  body.appendChild(xSec('sparkle', '效果', '选了就写进信标；清除 = 不给这个效果'));
  [['primary_effect', '主效果', '第一档就能给的效果'], ['secondary_effect', '副效果', '四级金字塔才有；可以和主效果相同']].forEach(function (d) {
    var key = d[0], cands = (weViewField(g, key).candidates || []).slice(), cur = weVal(g, key) || '';
    if (cur && cands.indexOf(cur) < 0) cands.push(cur);
    var entries = cands.map(function (id) { return { v: id, label: Reg.nameOf('mob_effects', id) || (EFIDX[shortId(id)] || {}).name || humanId(shortId(id)), sub: id, icon: function () { return effectIcon(id, 16); } }; });
    var sel = kSelect(entries, cur || null, function (v) { weSetV(g, key, v); weRender(); }, { width: 240, empty: '（无）', placeholder: '搜索效果' });
    var right = [sel.el];
    if (cur) right.push(kBtn('清除', function () { weSetV(g, key, null); weRender(); }, { icon: 'trash' }));
    body.appendChild(xRow({ icon: false, title: d[1], sub: d[2], right: h('div', { class: 'k-row' }, right) }));
  });
  var lv = weViewOrig(g).Levels;
  body.appendChild(xRow({ icon: false, title: '金字塔等级', sub: '由下面的金字塔算出来，不能直接改', right: h('span', { class: 'k-sub', text: String(lv === undefined ? 0 : lv) }) }));
};

/* ---------- 合成器：禁用格子 + 触发状态 ---------- */
WEV.crafter = function (body, g) {
  var f = weViewField(g, 'disabled_slots'), max = f.item_max === undefined ? 8 : f.item_max, min = f.item_min === undefined ? 0 : f.item_min;
  var cur = clone(weVal(g, 'disabled_slots') || []);
  function filled(i) { var s = (WE.w.container && WE.w.container.slots || []).filter(function (x) { return x.slot === i; })[0]; return !!s && !s.stack.empty; }
  body.appendChild(xSec('grid', '禁用的格子', '点一下禁用 / 恢复；只有空格子能禁用'));
  var grid = h('div', { class: 'k-cgrid tray', style: 'grid-template-columns:repeat(3,34px)' });
  for (var i = min; i <= max; i++) (function (i) {
    var off = cur.indexOf(i) >= 0, cell = h('div', { class: 'slot s34' + (off ? ' sel' : ''), title: '格子 ' + (i + 1) + (off ? '：已禁用' : filled(i) ? '：里面有东西，不能禁用' : '') }, off ? [uiIcon('close', 14)] : []);
    activate(cell, function () {
      if (cur.indexOf(i) < 0 && filled(i)) { toast('这一格里有东西，先在「容器」页清空才能禁用。', 'warn'); return; }
      var next = cur.indexOf(i) >= 0 ? cur.filter(function (x) { return x !== i; }) : cur.concat([i]);
      next.sort(function (a, b) { return a - b; }); weSetV(g, 'disabled_slots', next); weRender();
    });
    grid.appendChild(cell);
  })(i);
  body.appendChild(grid);
  body.appendChild(wvToggle(g, 'triggered', '已触发', '合成器记着的触发状态；游戏的红石更新之后可能自己改回去'));
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
  if (typeof v === 'number' && !(Math.abs(v) <= 9007199254740991)) return wvReadonly(label, String(v), '数值太大，在「数据」页改');
  return xNum({ title: label, sub: o.sub, value: typeof v === 'number' ? v : 0, step: 1, unit: o.unit, noSlider: true, onChange: function (x) { weSetV(g, k, x); } });
}
/* 候选来自后端 schema.fields.KEY.candidates 的枚举字段（大小写按候选原样写回） */
var WV_ENUM = { none: '无', clockwise_90: '顺时针 90°', clockwise_180: '180°', counterclockwise_90: '逆时针 90°', left_right: '左右', front_back: '前后',
  save: '保存', load: '载入', corner: '角', data: '数据', rollable: '可滚动', aligned: '对齐' };
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
  body.appendChild(xSec('sparkle', '潮涌核心', '这些都由游戏每刻算出来，不能改'));
  body.appendChild(wvReadonly('已激活', v.Active ? '是' : '否'));
  body.appendChild(wvReadonly('正在攻击', v.Hunting ? '是' : '否'));
  body.appendChild(wvReadonly('锁定目标', v.Target ? '有' : '没有'));
};
/* ---------- 末地折跃门 ---------- */
WEV.end_gateway = function (body, g) {
  var ep = weVal(g, 'exit_portal'), has = Array.isArray(ep) && ep.length === 3;
  body.appendChild(xSec('wind', '折跃门'));
  body.appendChild(xToggle({ title: '指定出口', sub: '关掉 = 用游戏默认的出口', value: has, onChange: function (on) { weSetV(g, 'exit_portal', on ? [0, 64, 0] : null); weRender(); } }));
  if (has) ['X', 'Y', 'Z'].forEach(function (ax, i) {
    body.appendChild(xNum({ title: '出口 ' + ax, value: ep[i], step: 1, noSlider: true, onChange: function (x) { var a = (weVal(g, 'exit_portal') || ep).slice(); a[i] = x; weSetV(g, 'exit_portal', a); } }));
  });
  body.appendChild(wvToggle(g, 'ExactTeleport', '精确传送', '直接传到出口的位置，不再在附近找落点'));
  body.appendChild(wvBigInt(g, 'Age', '已存在', { unit: '刻' }));
};
/* ---------- 结构方块 ---------- */
WEV.structure_block = function (body, g) {
  body.appendChild(xSec('cube', '结构'));
  body.appendChild(wvText(g, 'name', '名字', { sub: '写资源 ID，如 minecraft:workshop；留空 = 没有' }));
  body.appendChild(wvText(g, 'author', '作者'));
  body.appendChild(wvText(g, 'metadata', '数据标记'));
  body.appendChild(wvEnum(g, 'mode', '模式'));
  body.appendChild(xSec('target', '范围', '单位：格'));
  ['posX', 'posY', 'posZ'].forEach(function (k, i) { body.appendChild(wvNum(g, k, '偏移 ' + 'XYZ'.charAt(i))); });
  ['sizeX', 'sizeY', 'sizeZ'].forEach(function (k, i) { body.appendChild(wvNum(g, k, '大小 ' + 'XYZ'.charAt(i))); });
  body.appendChild(xSec('sliders', '放置'));
  body.appendChild(wvEnum(g, 'rotation', '旋转'));
  body.appendChild(wvEnum(g, 'mirror', '镜像'));
  body.appendChild(xNum({ title: '完整度', sub: '1 = 全部放出来', value: typeof weVal(g, 'integrity') === 'number' ? weVal(g, 'integrity') : 1, step: 0.05, dec: 3, noSlider: true, onChange: function (x) { weSetV(g, 'integrity', x); } }));
  body.appendChild(wvBigInt(g, 'seed', '随机种子'));
  body.appendChild(wvToggle(g, 'ignoreEntities', '忽略实体'));
  body.appendChild(wvToggle(g, 'showair', '显示空气'));
  body.appendChild(wvToggle(g, 'showboundingbox', '显示边框'));
  body.appendChild(wvToggle(g, 'powered', '已通电'));
};
/* ---------- 拼图方块 ---------- */
WEV.jigsaw = function (body, g) {
  body.appendChild(xSec('link', '拼图'));
  body.appendChild(wvText(g, 'name', '名字', { sub: '资源 ID' }));
  body.appendChild(wvText(g, 'target', '要接的名字', { sub: '资源 ID' }));
  body.appendChild(wvText(g, 'pool', '模板池', { sub: '资源 ID，池子可以还没有' }));
  body.appendChild(wvText(g, 'final_state', '生成后变成', { sub: '方块 ID，游戏不检查它写得对不对' }));
  body.appendChild(wvEnum(g, 'joint', '连接方式'));
};
/* ---------- 幽匿感测体 / 校频幽匿感测体 / 幽匿尖啸体 ---------- */
WEV.sculk_sensor = function (body, g) {
  body.appendChild(xSec('sparkle', '振动'));
  body.appendChild(wvNum(g, 'last_vibration_frequency', '上次振动频率'));
  body.appendChild(wvNum(g, 'listener.event_delay', '事件延迟', { unit: '刻' }));
};
WEV.sculk_shrieker = function (body, g) {
  body.appendChild(xSec('sparkle', '尖啸'));
  body.appendChild(wvNum(g, 'warning_level', '警告等级'));
  body.appendChild(wvNum(g, 'listener.event_delay', '事件延迟', { unit: '刻' }));
  body.appendChild(kHint('能不能召唤守卫、是否正在尖啸在「方块状态」页。'));
};
WEV.sculk_catalyst = function (body, g) {
  var c = weViewOrig(g).cursors;
  body.appendChild(xSec('sparkle', '幽匿催生体', '正在扩散的电荷由游戏管，不能改'));
  body.appendChild(wvReadonly('正在扩散', (Array.isArray(c) ? c.length : 0) + ' 个'));
};
/* ---------- 钟（只读） ---------- */
WEV.bell = function (body, g) {
  var v = weViewOrig(g);
  body.appendChild(xSec('bell', '钟', '游戏没有保存这些，只能看'));
  body.appendChild(wvReadonly('正在晃', v.shaking ? '是' : '否'));
  body.appendChild(wvReadonly('晃动计时', String(typeof v.ticks === 'number' ? v.ticks : 0), '刻'));
};
/* ---------- 试炼宝库 / 不祥宝库（安全子集） ---------- */
WEV.vault = function (body, g) {
  body.appendChild(xSec('chest', '宝库', '只有这几项可以改，其余在「数据」页'));
  body.appendChild(xRow({ icon: false, title: '钥匙物品', sub: '清空 = 不需要钥匙', right: wvItem(weVal(g, 'config.key_item'), function (v) { weSetV(g, 'config.key_item', v); weRender(); }) }));
  var lt = kRegSelect({ reg: 'loot_table', value: weVal(g, 'config.loot_table') || '', title: '选择战利品表', empty: '（未选择）', onChange: function (x) { if (x) weSetV(g, 'config.loot_table', x); } });
  body.appendChild(xRow({ icon: false, title: '战利品表', right: lt.el }));
  body.appendChild(xNum({ title: '激活距离', sub: '玩家进入这个距离内才有反应，不能大于停用距离', value: weVal(g, 'config.activation_range'), def: 4, step: 0.5, dec: 3, unit: '格', noSlider: true, onChange: function (x) { weSetV(g, 'config.activation_range', x); } }));
  body.appendChild(xNum({ title: '停用距离', value: weVal(g, 'config.deactivation_range'), def: 4.5, step: 0.5, dec: 3, unit: '格', noSlider: true, onChange: function (x) { weSetV(g, 'config.deactivation_range', x); } }));
  var rp = weViewOrig(g)['server_data.rewarded_players'];
  body.appendChild(wvReadonly('已领过奖励的玩家', (Array.isArray(rp) ? rp.length : 0) + ' 人', '只读'));
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
