/* 实体的变种、常用开关和装备：全部来自游戏的 entity_schema（docs/entity-schema-contract.md）。
   刷怪蛋页（分成几张卡片）和世界实体页（esPanel 一页排下来）共用这里的各段。选项、NBT 路径、默认值、幼年年龄都由游戏给出，这里不写死任何实体数据；
   中文只用来给字段起名字，认不出的字段直接显示游戏给的 ID。 */

/* 字段名（界面文字）：认不出的显示游戏给的 ID */
var ES_VARIANT = { variant: '品种', sound_variant: '叫声', collar: '项圈颜色', color: '羊毛颜色', markings: '斑纹', strength: '力量', size: '大小',
  profession: '职业', level: '等级', pattern: '图案', base_color: '主体颜色', pattern_color: '图案颜色' };
var ES_FLAG = { CustomName: ['名字', '头顶显示的名字'], CustomNameVisible: ['总是显示名字', '不用准星对着也显示'], Health: ['生命值', ''],
  Age: ['幼年', '生成为幼年个体'], IsBaby: ['幼年', '生成为幼年个体'], NoAI: ['没有 AI', '不会自己移动和攻击'], Silent: ['静音', '不发出声音'],
  Invulnerable: ['无敌', '不受伤害（创造模式玩家除外）'], NoGravity: ['无重力', '不会下落'], Glowing: ['发光轮廓', '隔着方块也能看到轮廓'],
  PersistenceRequired: ['不会消失', '玩家走远也不会自然消失'], ShowArms: ['显示手臂', '手臂可以拿东西'], LeftHanded: ['左撇子', '主手和副手对调'], CanPickUpLoot: ['会捡东西', '会拾取地上的物品和装备'] };
var ES_FLAG_ORDER = ['CustomName', 'CustomNameVisible', 'Health', 'Age', 'IsBaby', 'ShowArms', 'NoAI', 'PersistenceRequired', 'LeftHanded', 'CanPickUpLoot', 'Silent', 'Invulnerable', 'NoGravity', 'Glowing'];
var ES_SLOT = { mainhand: ['主手', 'sword'], offhand: ['副手', 'shield'], head: ['头部', 'helmet'], chest: ['胸部', 'chestplate'], legs: ['腿部', 'leggings'], feet: ['脚部', 'boots'], body: ['身体', 'shield'], saddle: ['鞍', 'cart'] };

function esGet(o, p) { for (var i = 0; i < p.length; i++) { if (!isObj(o)) return undefined; o = o[p[i]]; } return o; }
function esSet(o, p, v) { for (var i = 0; i < p.length - 1; i++) { if (!isObj(o[p[i]])) o[p[i]] = {}; o = o[p[i]]; } o[p[p.length - 1]] = v; }
function esDel(o, p) {
  var stack = [o];
  for (var i = 0; i < p.length - 1; i++) { o = o[p[i]]; if (!isObj(o)) return; stack.push(o); }
  delete o[p[p.length - 1]];
  for (var j = stack.length - 1; j > 0; j--) if (!Object.keys(stack[j]).length) delete stack[j - 1][p[j - 1]]; else break;   /* 空的上层复合也去掉 */
}
function esVariantKey(v) { var s = String(v.id || ''); return s.substring(s.lastIndexOf('/') + 1); }
function esOptLabel(x) { return typeof x.value === 'number' && /^-?\d+$/.test(String(x.label)) ? String(x.label) : humanId(shortId(String(x.label))); }

/* 给 <entity> 预览用的属性：幼年、装备、实体组件（只取 id 形如 minecraft:cat/variant 的真实组件）。没有 schema 时只给幼年和装备 */
function esPreviewAttrs(type, data) {
  var out = {}, s = type ? Reg.entitySchema(type) : null; data = isObj(data) ? data : {};
  if ((typeof data.Age === 'number' && data.Age < 0) || data.IsBaby === 1 || data.IsBaby === true) out.baby = '';
  var eq = isObj(data.equipment) ? data.equipment : {};
  Object.keys(ES_SLOT).forEach(function (k) { if (isObj(eq[k]) && typeof eq[k].id === 'string') out[k] = eq[k].id; });
  if (s && s.available) {
    var parts = [];
    (s.variants || []).forEach(function (v) {
      if (!/^[a-z0-9_.-]+:[a-z0-9_.-]+\/[a-z0-9_./-]+$/.test(String(v.id))) return;
      var raw = esGet(data, v.nbt.path); if (raw === undefined) return;
      var mask = typeof v.nbt.mask === 'number' ? v.nbt.mask : null, cur = mask !== null && typeof raw === 'number' ? raw & mask : raw;
      var opt = (v.options || []).filter(function (x) { return x.value === cur; })[0]; if (!opt) return;
      var val = v.kind === 'holder' ? opt.value : opt.label;
      parts.push(snbtStr(v.id) + ':' + snbtStr(String(val)));
    });
    if (parts.length) out.components = '{' + parts.join(',') + '}';
  }
  return out;
}

/* 这份 schema 占用的顶层键：这些交给上面的控件，原始字段列表里不再重复显示。equipment / drop_chances 仍可在原始字段里改物品组件 */
function esOwnedKeys(s) {
  var k = {};
  if (!s || !s.available) return k;
  (s.variants || []).forEach(function (v) { if (v.nbt && v.nbt.path && v.nbt.path.length) k[v.nbt.path[0]] = 1; });
  (s.flags || []).forEach(function (f) { if (f.common) k[f.key] = 1; });
  if ((s.attributes || []).some(function (a) { return a.common; })) k.attributes = 1;
  if (s.effects && s.effects.common) k.active_effects = 1;
  if ((s.extras || []).some(function (x) { return x.key === 'Tags'; })) k.Tags = 1;
  return k;
}

/* 读不到 schema 时给一句原因；能用就返回 schema */
function esReady(type, host) {
  var s = type ? Reg.entitySchema(type) : false;
  if (!type) { host.appendChild(xEmpty('先选择生物')); return null; }
  if (s === null) { host.appendChild(xEmpty('正在向游戏读取这只生物能改什么…')); return null; }
  if (!s) { host.appendChild(xEmpty('没有连接游戏，读不到这只生物的变种和开关。可以在「其他数据」里直接添加字段。')); return null; }
  if (!s.available) { host.appendChild(xEmpty((s.error || '游戏没能生成这只生物的模板') + '。可以在「其他数据」里直接添加字段。')); return null; }
  return s;
}
/* o = { get()→当前实体复合数据, set(obj), redraw() }：开关 / 选择类改动后调 redraw 重画；输入框、数字框只 set，不打断输入 */
function esEditor(o) {
  return function (fn, redraw) { var obj = clone(isObj(o.get()) ? o.get() : {}); fn(obj); o.set(obj); if (redraw && o.redraw) o.redraw(); };
}
function esTemplate(s) { try { return s.default_nbt ? parseSnbt(s.default_nbt) : null; } catch (e) { return null; } }

/* 外观：品种、颜色……颜色类（选项正好是 16 种染料）用色块 */
function esVariantList(s, o) {
  var list = h('div', { class: 'x-list' }), tpl = esTemplate(s), edit = esEditor(o);
  (s.variants || []).forEach(function (v) { list.appendChild(esVariantRow(v, o, tpl, edit)); });
  return list;
}
function esIsDye(v) {
  var d = {}; dyeList().forEach(function (x) { d[x.v] = 1; });
  var opts = v.options || [];
  return opts.length === 16 && opts.every(function (x) { return d[String(x.label)]; });
}
function esVariantRow(v, o, tpl, edit) {
  var p = v.nbt.path, mask = typeof v.nbt.mask === 'number' ? v.nbt.mask : null;
  var key = esVariantKey(v), title = ES_VARIANT[key] || humanId(key);
  var raw = esGet(o.get(), p), has = raw !== undefined, cur = has ? raw : v.default;
  function base() { var b = esGet(o.get(), p); if (typeof b !== 'number') b = tpl ? esGet(tpl, p) : undefined; return typeof b === 'number' ? b : 0; }
  function write(val) { edit(function (obj) { esSet(obj, p, mask !== null && typeof val === 'number' ? (base() & ~mask) | (val & mask) : val); }, true); }
  function pick(val) { return mask !== null && typeof val === 'number' ? (val & mask) : val; }
  var sub = has ? '' : '默认';
  /* 范围很大的整数（史莱姆大小）：数字框，显示的是游戏里的尺寸，保存值由 min / semanticMin 换算 */
  if (v.kind === 'int' && typeof v.min === 'number' && typeof v.max === 'number' && (v.options || []).length > 16) {
    var off = typeof v.semanticMin === 'number' ? v.semanticMin - v.min : 0;
    var num = kNumber(pick(cur) + off, { min: v.min + off, max: v.max + off, step: 1, noSlider: true, onChange: function (x) { edit(function (obj) { var st = x - off; esSet(obj, p, mask !== null ? (base() & ~mask) | (st & mask) : st); }); } });
    num.el.classList.add('k-xnum');
    return xRow({ icon: false, title: title, sub: (v.min + off) + ' – ' + (v.max + off), tip: p.join('.'), right: num.el });
  }
  var curOpt = (v.options || []).filter(function (x) { return x.value === pick(cur); })[0];
  if (esIsDye(v)) {
    /* 染料颜色：色块 + 颜色名，点开 16 个色块 */
    var dye = dyeButton(curOpt ? String(curOpt.label) : 'white', function (name) {
      var opt = v.options.filter(function (x) { return String(x.label) === name; })[0]; if (opt) write(opt.value);
    });
    return xRow({ icon: false, title: title, sub: sub, tip: p.join('.'), right: dye });
  }
  var entries = (v.options || []).map(function (x) { return { v: x.value, label: esOptLabel(x), sub: String(x.value) }; });
  var numeric = typeof v.default === 'number' || entries.some(function (e) { return typeof e.v === 'number'; });
  var manual = { label: numeric ? '写入这个整数' : '写入这个 ID（不带命名空间时按 minecraft:）', parse: function (t) {
    if (numeric) { if (!/^-?\d+$/.test(t)) throw new Error('请输入整数'); return Number(t); }
    if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(t)) throw new Error('ID 只能用小写字母、数字和 _ . - /'); return fullId(t);
  } };
  var btn = h('div', { class: 'k-btn k-sel' }, [h('span', { text: curOpt ? esOptLabel(curOpt) : (cur === undefined ? '（未知）' : String(cur)) }), uiIcon('down', 10)]);
  activate(btn, function () { pickFrom(btn, entries, function (e) { write(e.v); }, { width: 250, manual: manual }); });
  return xRow({ icon: false, title: title, sub: sub, tip: p.join('.') + (cur !== undefined ? ' = ' + cur : ''), right: btn });
}

/* 常用设置：名字、生命值、幼年、开关 */
function esFlagList(s, o) {
  var list = h('div', { class: 'x-list' }), edit = esEditor(o);
  (s.flags || []).filter(function (f) { return f.common; }).sort(function (a, b) {
    var i = ES_FLAG_ORDER.indexOf(a.key), j = ES_FLAG_ORDER.indexOf(b.key); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  }).forEach(function (f) { var r = esFlagRow(f, o, edit); if (r) list.appendChild(r); });
  return list;
}
function esFlagRow(f, o, edit) {
  var nm = ES_FLAG[f.key] || [f.key, ''], k = f.key, val = isObj(o.get()) ? o.get()[k] : undefined;
  if (f.id === 'baby' && f.type === 'int' && typeof f.babyAge === 'number') {
    /* 幼年：写游戏给的 babyAge / adultAge，不写探测样本 */
    var isBaby = typeof val === 'number' ? val < 0 : (typeof f.default === 'number' && f.default < 0);
    return xRow({ icon: false, title: nm[0], sub: nm[1], tip: k, right: kToggle(isBaby, function (on) { edit(function (obj) { obj[k] = on ? f.babyAge : f.adultAge; }, true); }).el });
  }
  if (f.type === 'byte-bool') {
    var on = typeof val === 'number' ? val !== 0 : typeof val === 'boolean' ? val : !!f.default;
    return xRow({ icon: false, title: nm[0], sub: nm[1], tip: k, right: kToggle(on, function (x) {
      edit(function (obj) { if (x === !!f.default && !f.present_by_default) delete obj[k]; else obj[k] = x ? 1 : 0; }, true);
    }).el });
  }
  if (f.type === 'float' || f.type === 'int') {
    var def = typeof f.default === 'number' ? f.default : 0, cur = typeof val === 'number' ? val : def;
    var opts = { min: typeof f.min === 'number' ? f.min : undefined, step: f.type === 'int' ? 1 : 0.5, dec: f.type === 'int' ? 0 : 2, noSlider: true,
      onChange: function (x) { edit(function (obj) { obj[k] = x; }); } };
    if (k === 'Health' && typeof f.max === 'number') { opts.warnMax = f.max; opts.warnWhy = '默认上限是 ' + fmtNum(f.max) + '；改过体型或属性的生物，游戏会按实际上限校验'; }
    var num = kNumber(cur, opts); num.el.classList.add('k-xnum');
    return xRow({ icon: false, title: nm[0], sub: nm[1] || (typeof val === 'number' ? '' : '默认 ' + fmtNum(def)), tip: k, right: num.el });
  }
  if (f.type === 'component' || f.type === 'string') {
    /* 名字：文本组件；已有的颜色、粗体等格式保留，只改 text */
    var text = typeof val === 'string' ? val : isObj(val) && typeof val.text === 'string' ? val.text : '';
    var locked = isObj(val) && typeof val.text !== 'string';
    if (locked) return xRow({ icon: false, title: nm[0], sub: '使用了翻译键等复杂格式，请在「其他数据」里修改', tip: k });
    var inp = kInput(text, function (x) {
      edit(function (obj) {
        if (!x) { delete obj[k]; return; }
        if (f.type === 'string') { obj[k] = x; return; }
        var c = isObj(obj[k]) ? obj[k] : {}; c.text = x; obj[k] = c;
      });
    }, { placeholder: '不填就没有名字' });
    inp.classList.add('world-inline-value');
    return xRow({ icon: false, title: nm[0], sub: nm[1], tip: k, right: inp });
  }
  return null;
}

/* 装备：像背包界面那样的格子。左列盔甲（头、胸、腿、脚），中间是生物，右列主手、副手、身体、鞍。
   空格子点一下选物品；有物品的点开小窗：更换、掉落概率、清空。需要前置字段的槽（盔甲架手持要显示手臂）选物品时一并写上 */
var ES_GEAR_COLS = [['head', 'chest', 'legs', 'feet'], ['mainhand', 'offhand', 'body', 'saddle']];
function esGearGrid(s, o, type) {
  var edit = esEditor(o), bySlot = {};
  (s.equipment || []).forEach(function (q) { if (q.canHold || q.requires) bySlot[q.slot] = q; });
  if (!Object.keys(bySlot).length) return xEmpty('这只生物没有可以放装备的位置');
  function stackOf(q) { var st = esGet(o.get(), q.nbtPath); return isObj(st) && typeof st.id === 'string' ? st : null; }
  function needs(q) { return q.requires && Object.keys(q.requires).some(function (k) { var v = isObj(o.get()) ? o.get()[k] : undefined; return v !== q.requires[k] && !(v === true && q.requires[k] === 1); }); }
  function choose(q, anchor) {
    pickItem(anchor, function (id) {
      kPopClose();
      edit(function (obj) {
        var cur = esGet(obj, q.nbtPath);
        esSet(obj, q.nbtPath, isObj(cur) && cur.id === fullId(id) ? cur : { id: fullId(id), count: 1 });
        if (q.requires) Object.keys(q.requires).forEach(function (k) { obj[k] = q.requires[k]; });
      }, true);
    }, { onStack: function (st) {
      kPopClose();
      edit(function (obj) {
        esSet(obj, q.nbtPath, vaultNested(st));
        if (q.requires) Object.keys(q.requires).forEach(function (k) { obj[k] = q.requires[k]; });
      }, true);
    } });
  }
  function menu(q, cell, st) {
    var box = h('div', { class: 'k-pickbox es-gearpop' });
    box.appendChild(h('div', { class: 'es-gearhd' }, [itemIcon(st.id, 22), h('div', { class: 'tx' }, [h('b', { text: nameOfItem(st.id) }), h('span', { class: 'k-sub', text: st.id })])]));
    if (q.dropChancePath) {
      var dc = esGet(o.get(), q.dropChancePath), d0 = typeof q.dropChance === 'number' ? q.dropChance : 0;
      box.appendChild(fieldRow('掉落概率', numField5(typeof dc === 'number' ? dc : d0, d0, { min: 0, max: 1, step: 0.05, dec: 3 }, function (x) { edit(function (obj) { esSet(obj, q.dropChancePath, x); }); })));
    }
    box.appendChild(h('div', { class: 'es-gearact' }, [
      kBtn('更换', function () { choose(q, cell); }, { icon: 'refresh' }),
      kBtn('清空', function () { kPopClose(); edit(function (obj) { esDel(obj, q.nbtPath); if (q.dropChancePath) esDel(obj, q.dropChancePath); }, true); }, { cls: 'dng', icon: 'trash' })
    ]));
    box.appendChild(h('div', { class: 'k-sub', text: '附魔等物品组件在「其他数据」的 ' + q.nbtPath[0] + ' 里改' }));
    kPopover(cell, box, { width: 300, maxHeight: 260 });
  }
  return esGearLayout({
    has: function (slot) { return !!bySlot[slot]; },
    stackOf: function (slot) { return stackOf(bySlot[slot]); },
    emptyHint: function (slot) { return needs(bySlot[slot]) ? '空（选物品时会一并打开「显示手臂」）' : '空'; },
    onEmpty: function (slot, cell) { choose(bySlot[slot], cell); },
    onFilled: function (slot, cell, st) { menu(bySlot[slot], cell, st); }
  });
}
/* 装备格子的外观（生物、刷怪蛋、刷怪笼、世界实体、玩家共用）：两排，每排四格——第一排四件盔甲，第二排主手 / 副手 / 身体 / 鞍；
   没有的位置不画，整排没有就不画那一排。cfg = { has(slot), stackOf(slot)→{id,count}|null, onEmpty(slot,cell), onFilled(slot,cell,stack), emptyHint?(slot) } */
function esGearLayout(cfg) {
  function cellOf(slot) {
    if (!cfg.has(slot)) return null;
    var meta = ES_SLOT[slot] || [humanId(slot), 'shield'], st = cfg.stackOf(slot);
    var cell = h('div', { class: 'slot s34 es-slot' + (st ? ' on' : '') }, [st ? itemIcon(st.id, 26) : uiIcon(meta[1], 16, 'es-ghost')]);
    if (st && (st.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(st.count) }));
    cell.setAttribute('title', meta[0] + '：' + (st ? nameOfItem(st.id) : (cfg.emptyHint ? cfg.emptyHint(slot) : '空')));
    var open = function () { if (st) cfg.onFilled(slot, cell, st); else cfg.onEmpty(slot, cell); };
    if (cfg.bind) cfg.bind(slot, cell, open); else cell.addEventListener('click', open);
    return h('div', { class: 'es-gear' }, [cell, h('span', { class: 'es-gearl', text: meta[0] })]);
  }
  function row(slots) { var r = h('div', { class: 'es-gearrow' }); slots.forEach(function (k) { var x = cellOf(k); if (x) r.appendChild(x); }); return r.children.length ? r : null; }
  return h('div', { class: 'es-geargrid' }, [row(ES_GEAR_COLS[0]), row(ES_GEAR_COLS[1])].filter(function (x) { return x; }));
}

/* 世界实体页「属性」：外观、常用设置、装备一页排下来 */
function esPanel(o) {
  var box = h('div', { class: 'es-panel' });
  function draw() {
    clear(box);
    var s = esReady(o.type, box); if (!s) return;
    var oo = { get: o.get, set: o.set, redraw: draw };
    if ((s.variants || []).length) { box.appendChild(xSec('paw', '外观')); box.appendChild(esVariantList(s, oo)); }
    box.appendChild(xSec('sliders', '常用设置')); box.appendChild(esFlagList(s, oo)); var tr = esTagsRow(s, oo); if (tr) box.appendChild(tr);
    if ((s.attributes || []).some(function (a) { return a.common; })) { box.appendChild(xSec('sword', '属性')); box.appendChild(esAttrList(s, oo)); }
    if (s.effects && s.effects.common) { box.appendChild(xSec('flask', '状态效果')); box.appendChild(esEffects(s, oo)); }
    box.appendChild(xSec('helmet', '装备')); box.appendChild(esGearGrid(s, oo, o.type));
    (s.warnings || []).forEach(function (w) { box.appendChild(h('div', { class: 'k-sub', text: '游戏提示：' + w })); });
  }
  draw();
  box.redraw = draw;
  return box;
}

/* 刷怪蛋左栏里的 3D 生物：左键拖动旋转（引擎自带），滚轮缩放，右键或中键拖动移动位置。
   同一只生物重画时沿用原来的元素，转过的角度不丢；换了生物或点「恢复默认视角」才回到默认 */
var ES_PAN = null;
function heroEntity(type, data, old, src) {
  var full = Reg.full(type), v = UI.entView, key = src ? (src.player ? 'player' : 'id:' + src.id) : full;
  if (!v || v.type !== key) v = UI.entView = { type: key, s: 1, x: 0, y: 0 };
  var el = old && old.getAttribute('data-src') === key ? old : (function () {
    var a = { class: 'k-ent', rotatable: true, 'data-src': key };
    if (src && src.player) a.player = ''; else if (src) a.id = String(src.id); else a.type = full;
    return h('entity', a);
  })();
  var pa = esPreviewAttrs(full, data);
  ['baby', 'components'].concat(Object.keys(ES_SLOT)).forEach(function (k) {
    if (pa[k] === undefined) { if (el.getAttribute(k) !== null) el.removeAttribute(k); }
    else if (el.getAttribute(k) !== pa[k]) el.setAttribute(k, pa[k]);
  });
  v.scale = esAttrScale(data, Reg.entitySchema(full));
  esEntPaint(el);
  if (!el._esBound) {
    el._esBound = true;
    el.addEventListener('wheel', function (e) {
      e.preventDefault(); if (e.stopPropagation) e.stopPropagation();
      var w = UI.entView; if (!w) return;
      w.s = Math.max(0.5, Math.min(3, w.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      esEntPaint(el);
    });
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 1 && e.button !== 2) return;
      e.preventDefault(); var w = UI.entView; if (!w) return;
      ES_PAN = { el: el, x0: e.clientX, y0: e.clientY, x: w.x, y: w.y };
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  return el;
}
/* 实体按自己的盒子裁剪。盒子做成预览框的 3 倍大（CSS 里 300%），缩放除以 3 抵消；移动只挪这个大盒子，
   盒子边缘始终在框外，裁剪只发生在预览框的边上，不会把腿之类的切掉一截 */
var ES_BOX = 3;
function esEntPaint(el) {
  var w = UI.entView || { s: 1, x: 0, y: 0 };
  el.setAttribute('style', '-mc-model-scale:' + (+(w.s * (w.scale || 1) / ES_BOX).toFixed(4)) + ';margin-left:' + Math.round(w.x) + 'px;margin-top:' + Math.round(w.y) + 'px');
}
document.addEventListener('mousemove', function (e) {
  if (!ES_PAN) return;
  if (e.buttons !== undefined && !(e.buttons & 6)) { ES_PAN = null; return; }
  var w = UI.entView; if (!w) { ES_PAN = null; return; }
  /* 最多移到框的边上，生物不会整个移出去 */
  var r = ES_PAN.el.parentNode && ES_PAN.el.parentNode.getBoundingClientRect ? ES_PAN.el.parentNode.getBoundingClientRect() : { width: 200, height: 150 };
  var mx = r.width / 2, my = r.height / 2;
  w.x = Math.max(-mx, Math.min(mx, ES_PAN.x + e.clientX - ES_PAN.x0));
  w.y = Math.max(-my, Math.min(my, ES_PAN.y + e.clientY - ES_PAN.y0));
  esEntPaint(ES_PAN.el);
});
document.addEventListener('mouseup', function (e) { if (ES_PAN && (e.button === 1 || e.button === 2)) ES_PAN = null; });

/* ---------- 属性（体型、最大生命、移动速度……）：来自游戏里这只生物真实的属性表，范围是游戏的属性上下限 ----------
   NBT 里是 attributes:[{id, base}]；等于默认值的不写，改回默认就把那一项删掉（别的字段如 modifiers 原样保留） */
var ES_ATTR_ORDER = ['scale', 'max_health', 'movement_speed', 'attack_damage', 'follow_range', 'armor', 'armor_toughness', 'knockback_resistance', 'step_height', 'gravity', 'jump_strength'];
function esAttrBase(data, a) {
  var arr = isObj(data) && Array.isArray(data.attributes) ? data.attributes : [];
  for (var i = 0; i < arr.length; i++) if (isObj(arr[i]) && Reg.full(arr[i].id) === a.id && typeof arr[i].base === 'number') return arr[i].base;
  return a.base;
}
function esAttrSet(obj, a, v) {
  var arr = Array.isArray(obj.attributes) ? obj.attributes.slice() : [], at = -1, i;
  for (i = 0; i < arr.length; i++) if (isObj(arr[i]) && Reg.full(arr[i].id) === a.id) at = i;
  if (v === a.base) {
    if (at >= 0) { var e = clone(arr[at]); delete e.base; if (Object.keys(e).length <= 1) arr.splice(at, 1); else arr[at] = e; }   // 只剩 id 就整项删掉
  } else if (at >= 0) { var e2 = clone(arr[at]); e2.base = v; arr[at] = e2; } else arr.push({ id: a.id, base: v });
  if (arr.length) obj.attributes = arr; else delete obj.attributes;
  /* 最大生命降到比当前生命还低，游戏会拒绝：顺手把生命压到上限 */
  if (a.id === 'minecraft:max_health' && typeof obj.Health === 'number' && obj.Health > v) obj.Health = v;
}
function esAttrScale(data, s) {
  var a = s && (s.attributes || []).filter(function (x) { return x.id === 'minecraft:scale'; })[0];
  return a ? esAttrBase(data, a) / (a.base || 1) : 1;
}
function esAttrList(s, o) {
  var edit = esEditor(o), list = h('div', { class: 'x-list' });
  var attrs = (s.attributes || []).filter(function (a) { return a.common; });
  if (!attrs.length) return xEmpty('这只生物没有可以改的属性');
  attrs.sort(function (a, b) { var i = ES_ATTR_ORDER.indexOf(shortId(a.id)), j = ES_ATTR_ORDER.indexOf(shortId(b.id)); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (a.id < b.id ? -1 : 1); });
  var main = attrs.filter(function (a) { return ES_ATTR_ORDER.indexOf(shortId(a.id)) >= 0 && ES_ATTR_ORDER.indexOf(shortId(a.id)) < 6; }), rest = attrs.filter(function (a) { return main.indexOf(a) < 0; });
  function row(a) {
    var isScale = a.id === 'minecraft:scale', nm = Reg.nameOf2('attribute', a.id) || humanId(shortId(a.id));
    var step = isScale ? 0.25 : (a.max - a.min > 50 ? 1 : 0.1);
    var num = kNumber(esAttrBase(o.get(), a), { min: a.min, max: a.max, softMax: isScale ? 4 : undefined, step: step, dec: 3, noSlider: !isScale,
      presets: isScale ? [{ v: 0.5, label: '0.5' }, { v: 1, label: '1' }, { v: 2, label: '2' }, { v: 4, label: '4' }] : undefined,
      onChange: function (v) { edit(function (obj) { esAttrSet(obj, a, v); }, isScale); } });
    num.el.classList.add('k-xnum');
    return xRow({ icon: false, title: isScale ? '体型' : nm, sub: (isScale ? '大小倍数，1 是原样；' : '') + '默认 ' + fmtNum(a.base) + ' · 范围 ' + fmtNum(a.min) + ' ~ ' + fmtNum(a.max), tip: a.id, right: num.el });
  }
  main.forEach(function (a) { list.appendChild(row(a)); });
  if (rest.length) {
    var open = !!UIOpen['es:attrs:more'];
    if (open) rest.forEach(function (a) { list.appendChild(row(a)); });
    var tg = h('div', { class: 'k-add' }, [foldArrow(open, 8), h('span', { text: open ? '收起其他属性' : '其他属性（' + rest.length + '）' })]);
    activate(tg, function () { UIOpen['es:attrs:more'] = !open; if (o.redraw) o.redraw(); });
    list.appendChild(tg);
  }
  return list;
}
/* ---------- 状态效果：生成时身上带着的药水效果 ---------- */
function esEffects(s, o) {
  var edit = esEditor(o);
  var fx = kEffectList(function () { var v = esGet(o.get(), ['active_effects']); return Array.isArray(v) ? clone(v) : []; },
    function (l) { edit(function (obj) { if (l.length) obj.active_effects = l; else delete obj.active_effects; }); }, { empty: '没有效果' });
  return fx.el;
}
/* ---------- 标签（/tag 命令用的）：逗号隔开 ---------- */
function esTagsRow(s, o) {
  if (!(s.extras || []).some(function (x) { return x.key === 'Tags'; })) return null;
  var edit = esEditor(o), cur = esGet(o.get(), ['Tags']);
  var inp = kInput(Array.isArray(cur) ? cur.join('，') : '', function () {}, { placeholder: '标签，用逗号隔开' }); inp.setAttribute('style', 'width:170px');
  inp.addEventListener('change', function () { var t = inp.value.split(/[,，\s]+/).filter(function (x) { return x; }); edit(function (obj) { if (t.length) obj.Tags = t; else delete obj.Tags; }); });
  return xRow({ icon: false, title: '标签', sub: '给 /tag 和选择器用的标签', tip: 'Tags', right: inp });
}
