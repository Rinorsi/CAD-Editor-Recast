/* 复杂结构的专用表单（在「详细编辑」窗口里使用）：头颅档案、蜜蜂、地图标记、磁石追踪、可破坏 / 可放置 */

function list5(host, items, rowFn, onAdd, addLabel, emptyText) {
  /* 通用“可增删的对象列表”：每一项一块，右上角删除；底部一个添加按钮 */
  var box = h('div', { class: 'l5' });
  function draw() {
    clear(box);
    items().forEach(function (it, i) {
      var rm = h('div', { class: 'k-mini del', text: '×', title: '删除这一项' });
      activate(rm, function () { onAdd.remove(i); draw(); });
      var head = h('div', { class: 'l5-h' }, [h('span', { class: 'ix', text: '#' + (i + 1) }), h('span', { class: 'sm', text: onAdd.summary ? onAdd.summary(it, i) : '' }), rm]);
      var body = h('div', { class: 'l5-b' });
      rowFn(body, it, i, function () { onAdd.changed(); var s = head.querySelector('.sm'); if (s && onAdd.summary) s.textContent = onAdd.summary(items()[i], i); });
      box.appendChild(h('div', { class: 'l5-item' }, [head, body]));
    });
    if (!items().length) box.appendChild(xEmpty(emptyText || '空'));
    var add = xAdd(addLabel || '添加');
    activate(add, function () { onAdd.add(); draw(); });
    box.appendChild(add);
  }
  draw();
  host.appendChild(box);
}
function numField5(val, def, opts, set) { return kNumber(typeof val === 'number' ? val : def, Object.assign({ min: -1e9, max: 1e9, step: 1, noSlider: true, onChange: set }, opts || {})).el; }

/* ---- 头颅档案 ---- */
AUTO_BODY.profile = function (card, cid, v) {
  var o = typeof v === 'string' ? { name: v } : clone(isObj(v) ? v : {});
  function put() {
    var out = {}, k, n = 0;
    ['name', 'id', 'properties', 'texture', 'cape', 'elytra', 'model'].forEach(function (key) { if (o[key] !== undefined && o[key] !== '' && !(Array.isArray(o[key]) && !o[key].length)) { out[key] = o[key]; n++; } });
    autoPut(cid, n === 1 && out.name !== undefined ? out.name : out);
  }
  function txt(key, ph) { return kInput(o[key] || '', function (x) { if (x) o[key] = x; else delete o[key]; put(); }, { placeholder: ph }); }
  card.body.appendChild(h('div', { class: 'k-sech', text: '谁的头' }));
  card.body.appendChild(fieldRow('玩家名', txt('name', '例如 Steve；游戏联网取这个玩家的皮肤'), '填了玩家名，游戏会按名字联网查皮肤。离线或查不到时显示默认皮肤'));
  var uuid = kInput(Array.isArray(o.id) ? o.id.join(', ') : '', function (x) {
    var p = x.split(/[,\s]+/).filter(Boolean).map(function (s) { return parseInt(s, 10); });
    if (!x.trim()) { delete o.id; put(); return; }
    if (p.length === 4 && p.every(function (n) { return !isNaN(n); })) { o.id = p; put(); }
  }, { placeholder: '4 个整数，用逗号隔开（可不填）' });
  card.body.appendChild(fieldRow('UUID', uuid, '玩家 UUID 的 4 个整数写法，一般不用填'));
  card.body.appendChild(h('div', { class: 'k-sech', text: '直接指定皮肤（不联网）' }));
  card.body.appendChild(fieldRow('身体皮肤', txt('texture', '命名空间:路径，对应 textures/ 下的 png'), '资源包里的皮肤图，写法如 mypack:skins/hero，不是网址'));
  card.body.appendChild(fieldRow('披风', txt('cape', '命名空间:路径')));
  card.body.appendChild(fieldRow('鞘翅', txt('elytra', '命名空间:路径')));
  var model = kSeg([{ v: '', label: '默认' }, { v: 'wide', label: '粗手臂' }, { v: 'slim', label: '细手臂' }], o.model || '', function (m) { if (m) o.model = m; else delete o.model; put(); });
  card.body.appendChild(fieldRow('手臂模型', model.el));
  card.body.appendChild(h('div', { class: 'k-sech', text: '皮肤属性（高级）' }));
  if (isObj(o.properties)) { card.body.appendChild(h('div', { class: 'k-sub', text: '这里用的是“属性名 → 值列表”的写法，原样保留，不在这里编辑。' })); return; }
  if (!Array.isArray(o.properties)) o.properties = [];
  list5(card.body, function () { return o.properties; }, function (body, it, i, ch) {
    body.appendChild(fieldRow('属性名', kInput(it.name || '', function (x) { it.name = x; ch(); }, { placeholder: '一般是 textures' })));
    body.appendChild(fieldRow('值', kInput(it.value || '', function (x) { it.value = x; ch(); }, { placeholder: 'Base64 文本' })));
    body.appendChild(fieldRow('签名', kInput(it.signature || '', function (x) { if (x) it.signature = x; else delete it.signature; ch(); }, { placeholder: '可不填' })));
  }, { add: function () { if (o.properties.length < 16) o.properties.push({ name: 'textures', value: '' }); put(); }, remove: function (i) { o.properties.splice(i, 1); put(); }, changed: put, summary: function (it) { return (it.name || '?') + (it.value ? ' · ' + it.value.slice(0, 18) + (it.value.length > 18 ? '…' : '') : ''); } }, '添加一条属性', '没有');
};

/* ---- 蜜蜂 ---- */
AUTO_BODY.bees = function (card, cid, v) {
  var arr = clone(Array.isArray(v) ? v : []);
  function put() { autoPut(cid, arr.slice()); }
  card.body.appendChild(h('div', { class: 'k-sub', text: '蜂巢 / 蜂箱方块里的蜜蜂。每只蜜蜂是一段实体数据，外加已在巢里待了多久、至少要待多久才会出来。' }));
  list5(card.body, function () { return arr; }, function (body, it, i, ch) {
    body.appendChild(fieldRow('已停留', numField5(it.ticks_in_hive, 0, { step: 20, unit: '刻' }, function (n) { it.ticks_in_hive = n; ch(); }), '已经在巢里待了多少刻（20 刻 = 1 秒）'));
    body.appendChild(fieldRow('至少停留', numField5(it.min_ticks_in_hive, 600, { step: 20, unit: '刻' }, function (n) { it.min_ticks_in_hive = n; ch(); }), '至少要待多少刻才允许飞出来'));
    var ta = h('textarea', { class: 'ed-snbt bees-nbt', spellcheck: 'false' }), msg = h('div', { class: 'k-sub' });
    ta.value = toSnbt(it.entity_data === undefined ? { id: 'minecraft:bee' } : it.entity_data, null, true);
    ta.addEventListener('input', function () { try { it.entity_data = parseSnbt(ta.value); msg.textContent = ''; ch(); } catch (e) { msg.textContent = 'SNBT 有误：' + (e.message || e); } });
    body.appendChild(fieldRow('实体数据', h('div', {}, [ta, msg]), '蜜蜂实体的 NBT，必须含 id'));
    setTimeout(function () { if (typeof growable === 'function') growable(body); }, 0);
  }, { add: function () { arr.push({ entity_data: { id: 'minecraft:bee' }, ticks_in_hive: 0, min_ticks_in_hive: 600 }); put(); }, remove: function (i) { arr.splice(i, 1); put(); }, changed: put, summary: function (it) { return '待了 ' + fmtNum((it.ticks_in_hive || 0) / 20) + ' 秒 · 至少 ' + fmtNum((it.min_ticks_in_hive || 0) / 20) + ' 秒'; } }, '添加一只蜜蜂', '巢里没有蜜蜂');
};

/* ---- 地图标记 ---- */
AUTO_BODY.map_decorations = function (card, cid, v) {
  var m = clone(isObj(v) ? v : {}), keys = Object.keys(m);
  var arr = keys.map(function (k) { return { key: k, val: m[k] }; });
  function put() { var o = {}; arr.forEach(function (e) { if (e.key) o[e.key] = e.val; }); autoPut(cid, o); }
  card.body.appendChild(h('div', { class: 'k-sub', text: '地图上额外显示的标记（比如一个旗帜、一个红点）。每个标记要有一个唯一的名字。' }));
  list5(card.body, function () { return arr; }, function (body, e, i, ch) {
    body.appendChild(fieldRow('标记名', kInput(e.key, function (x) { e.key = x; ch(); }, { placeholder: '随便起，不能重复' })));
    body.appendChild(fieldRow('图案', kRegSelect({ reg: 'map_decoration_type', value: e.val.type || '', title: '选择标记图案', empty: '（未选择）', onChange: function (x) { e.val.type = x; ch(); } }).el));
    body.appendChild(fieldRow('世界 X', numField5(e.val.x, 0, { step: 1 }, function (n) { e.val.x = n; ch(); })));
    body.appendChild(fieldRow('世界 Z', numField5(e.val.z, 0, { step: 1 }, function (n) { e.val.z = n; ch(); })));
    body.appendChild(fieldRow('旋转', numField5(e.val.rotation, 0, { step: 15, unit: '度' }, function (n) { e.val.rotation = n; ch(); })));
  }, { add: function () { var n = 1; while (arr.some(function (e) { return e.key === 'mark' + n; })) n++; arr.push({ key: 'mark' + n, val: { type: 'minecraft:player', x: 0, z: 0, rotation: 0 } }); put(); }, remove: function (i) { arr.splice(i, 1); put(); }, changed: put, summary: function (e) { return (e.key || '?') + ' · ' + (e.val.type ? shortId(e.val.type) : '未选图案') + ' (' + fmtNum(e.val.x || 0) + ', ' + fmtNum(e.val.z || 0) + ')'; } }, '添加一个标记', '没有额外标记');
};

/* ---- 磁石追踪 ---- */
AUTO_BODY.lodestone_tracker = function (card, cid, v) {
  var o = clone(isObj(v) ? v : {});
  function put() { var out = {}; if (o.target) out.target = o.target; if (o.tracked !== undefined) out.tracked = o.tracked; autoPut(cid, out); }
  var has = !!o.target;
  card.body.appendChild(h('div', { class: 'k-sub', text: '指南针指向的位置。不设置目标时，指南针指向出生点（或乱转）。' }));
  var tg = kToggle(has, function (on) { if (on) o.target = { dimension: 'minecraft:overworld', pos: [0, 64, 0] }; else delete o.target; put(); redraw(); }, '指向一个固定位置');
  card.body.appendChild(tg.el);
  var box = h('div', { class: 'l5-b' }); card.body.appendChild(box);
  function redraw() {
    clear(box); if (!o.target) return;
    var t = o.target; if (!Array.isArray(t.pos)) t.pos = [0, 64, 0];
    box.appendChild(fieldRow('维度', kRegSelect({ reg: 'dimension', value: t.dimension || 'minecraft:overworld', title: '选择维度', fallback: [{ v: 'minecraft:overworld', label: '主世界', sub: 'minecraft:overworld' }, { v: 'minecraft:the_nether', label: '下界', sub: 'minecraft:the_nether' }, { v: 'minecraft:the_end', label: '末地', sub: 'minecraft:the_end' }], onChange: function (x) { t.dimension = x; put(); } }).el));
    ['X', 'Y', 'Z'].forEach(function (ax, i) { box.appendChild(fieldRow(ax, numField5(t.pos[i], 0, { step: 1 }, function (n) { t.pos[i] = Math.round(n); put(); }))); });
  }
  redraw();
  card.body.appendChild(fieldRow('目标没了就失效', kToggle(o.tracked !== false, function (on) { o.tracked = on; put(); }, '').el, '开：目标位置的磁石被拆掉后指南针乱转；关：一直指向这个坐标'));
};

/* ---- 可破坏 / 可放置于 ---- */
function blockPredList(card, cid, v, what) {
  var raw = v === undefined ? [] : (Array.isArray(v) ? v : [v]);
  var arr = clone(raw).map(function (p) { return typeof p === 'string' ? { blocks: p } : (isObj(p) ? p : {}); });
  function put() { var out = arr.map(function (p) { return clone(p); }); autoPut(cid, out.length === 1 ? out[0] : out); }
  card.body.appendChild(h('div', { class: 'k-sub', text: '冒险模式下，' + what + '。可以写多条规则，满足任意一条就行。' }));
  list5(card.body, function () { return arr; }, function (body, p, i, ch) {
    body.appendChild(fieldRow('方块', wHolderSet('block', p.blocks === undefined ? [] : p.blocks, function (x) { if (x === undefined || (Array.isArray(x) && !x.length)) delete p.blocks; else p.blocks = x; ch(); }), '一个方块标签（如 #minecraft:logs），或若干个具体方块；不填 = 任意方块'));
    var rest = {}; Object.keys(p).forEach(function (k) { if (k !== 'blocks') rest[k] = p[k]; });
    var ta = h('textarea', { class: 'ed-snbt bees-nbt', spellcheck: 'false', placeholder: '额外条件（方块状态 / NBT / 组件），例如 {state:{facing:"north"}}；没有就留空' }), msg = h('div', { class: 'k-sub' });
    ta.value = Object.keys(rest).length ? toSnbt(rest, null, true) : '';
    ta.addEventListener('input', function () {
      try { var pv = ta.value.trim() ? parseSnbt(ta.value) : {}; Object.keys(p).forEach(function (k) { if (k !== 'blocks') delete p[k]; }); Object.keys(pv).forEach(function (k) { p[k] = pv[k]; }); msg.textContent = ''; ch(); } catch (e) { msg.textContent = 'SNBT 有误：' + (e.message || e); }
    });
    body.appendChild(fieldRow('额外条件', h('div', {}, [ta, msg]), '方块状态（state）、方块实体 NBT（nbt）等，直接写 SNBT'));
    setTimeout(function () { if (typeof growable === 'function') growable(body); }, 0);
  }, { add: function () { arr.push({}); put(); }, remove: function (i) { arr.splice(i, 1); put(); }, changed: put, summary: function (p) { var b = p.blocks; return b === undefined ? '任意方块' : (Array.isArray(b) ? b.map(shortId).join('、') : (b.charAt(0) === '#' ? b : shortId(b))); } }, '添加一条规则', '还没有规则');
}
AUTO_BODY.can_break = function (card, cid, v) { blockPredList(card, cid, v, '玩家只能破坏符合下面规则的方块'); };
AUTO_BODY.can_place_on = function (card, cid, v) { blockPredList(card, cid, v, '玩家只能把这个方块 / 物品放在符合下面规则的方块上'); };

/* ===== 只有一个控件的卡片：控件直接放在卡片头右侧，不用展开 ===== */
var HEAD_AUTO = { tooltip_style: 1, instrument: 1, jukebox_playable: 1, note_block_sound: 1, break_sound: 1 };
function scalarHead(sc) {
  if (!sc) return null;
  if (sc.t === 'int' || sc.t === 'num') return 'num';
  if (sc.t === 'str' && sc.reg && !sc.tag) return 'reg';
  if (sc.t === 'str' && sc.en) return sc.en.indexOf('light_blue') >= 0 ? 'dye' : 'enum';
  return null;
}
function headCtl(card, el) {
  var hd = card.el.firstChild, box = h('div', { class: 'hd-pick' }, [el]);
  hd.insertBefore(box, hd.querySelector('.k-cval')); card.el.classList.add('flat');
}
function headAuto(card, cid, c, kind, v) {
  var sc = c.schema;
  if (kind === 'body') { AUTO_BODY[cid](card, cid, v); return; }
  if (kind === 'num') {
    var step = sc.t === 'int' ? 1 : (sc.max !== undefined && sc.max <= 1 ? 0.1 : 0.5);
    var num = kNumber(typeof v === 'number' ? v : 0, { min: sc.min, max: sc.max, step: step, dec: sc.t === 'int' ? 0 : undefined, noSlider: true, onChange: function (n) { autoPut(cid, n); } });
    headCtl(card, num.el);
  } else if (kind === 'dye') {
    /* 染料颜色：头部一个“色块 + 颜色名”，点开才出 16 个色块 */
    headCtl(card, dyeButton(typeof v === 'string' ? v : sc.en[0], function (x) { autoPut(cid, x); }));
  } else if (kind === 'reg') {
    headCtl(card, kRegSelect({ reg: sc.reg, value: typeof v === 'string' ? v : '', title: '选择' + c.name, empty: '（未选择）', onChange: function (x) { if (x) autoPut(cid, x); } }).el);
  } else {
    var entries = sc.en.map(function (e) { return { v: e, label: e }; });
    headCtl(card, kSelect(entries, typeof v === 'string' ? v : sc.en[0], function (x) { autoPut(cid, x); }).el);
  }
}
