/* 实体的变种、常用开关和装备：全部来自游戏的 entity_schema（docs/entity-schema-contract.md）。
   刷怪蛋页（分成几张卡片）和世界实体页（esPanel 一页排下来）共用这里的各段。选项、NBT 路径、默认值、幼年年龄都由游戏给出，这里不写死任何实体数据；
   中文只用来给字段起名字，认不出的字段直接显示游戏给的 ID。 */

/* 字段名（界面文字）：认不出的显示游戏给的 ID */
var ES_VARIANT = Labels.entVariant;
var ES_FLAG = Labels.entFlag;
var ES_FLAG_ORDER = ['CustomName', 'CustomNameVisible', 'Health', 'Age', 'IsBaby', 'ShowArms', 'NoAI', 'PersistenceRequired', 'LeftHanded', 'CanPickUpLoot', 'Silent', 'Invulnerable', 'NoGravity', 'Glowing'];
var ES_SLOT = Labels.slotGear;

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
  if (typeof data.__cad_stand === 'string') out['cad-stand'] = data.__cad_stand;   /* 盔甲架草稿姿势，由客户端 mixin 套到预览实体上 */
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
var ES_WAIT = false, ES_TO = null;   /* 当前页面有没有因为「还在读」而画成占位——注册表 / 生物信息到了要重画 */
function esReady(type, host) {
  var s = type ? Reg.entitySchema(type) : false;
  if (!type) { host.appendChild(xEmpty(I18n.t("cadeditor.ui.eschema.2266a8f4e6"))); return null; }
  if (s === null) {
    var at = Reg.esAt && Reg.esAt[Reg.full(type)];
    if (at && Date.now() - at > 6000) { host.appendChild(xEmpty(I18n.t("cadeditor.ui.eschema.97f26ae2f3"))); return null; }
    ES_WAIT = true;
    if (!ES_TO && typeof setTimeout === 'function') ES_TO = setTimeout(function () { ES_TO = null; if (ES_WAIT && typeof weActive === 'function' && weActive() && !$('modal')) { try { weRedrawBody(); } catch (e) {} } }, 6200);
    host.appendChild(xEmpty(I18n.t("cadeditor.ui.eschema.aa9cd4e0c6"))); return null;
  }
  if (!s) { host.appendChild(xEmpty(I18n.t("cadeditor.ui.eschema.94a76e340f"))); return null; }
  if (!s.available) { host.appendChild(xEmpty(I18n.t("cadeditor.ui.eschema.c67ad3ecb7", (s.error || I18n.t("cadeditor.ui.eschema.ed4cb58ff6"))))); return null; }
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
  var sub = has ? '' : I18n.t("cadeditor.ui.common.default");
  /* 范围很大的整数（史莱姆大小）：数字框，显示的是游戏里的尺寸，保存值由 min / semanticMin 换算 */
  if (v.kind === 'int' && typeof v.min === 'number' && typeof v.max === 'number' && (v.options || []).length > 16) {
    var off = typeof v.semanticMin === 'number' ? v.semanticMin - v.min : 0;
    return xNum({ title: title, sub: (v.min + off) + ' – ' + (v.max + off), tip: p.join('.'), value: pick(cur) + off, min: v.min + off, max: v.max + off, step: 1, onChange: function (x) { edit(function (obj) { var st = x - off; esSet(obj, p, mask !== null ? (base() & ~mask) | (st & mask) : st); }); } });
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
  var manual = { label: numeric ? I18n.t("cadeditor.ui.eschema.7764250ade") : I18n.t("cadeditor.ui.eschema.6758599d3b"), parse: function (t) {
    if (numeric) { if (!/^-?\d+$/.test(t)) throw new Error(I18n.t("cadeditor.ui.eschema.9c75115484")); return Number(t); }
    if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(t)) throw new Error(I18n.t("cadeditor.ui.eschema.6bf65a3e14")); return fullId(t);
  } };
  var btn = h('div', { class: 'k-btn k-sel' }, [h('span', { text: curOpt ? esOptLabel(curOpt) : (cur === undefined ? I18n.t("cadeditor.ui.eschema.90a49e5099") : String(cur)) }), uiIcon('down', 10)]);
  activate(btn, function () { pickFrom(btn, entries, function (e) { write(e.v); }, { width: 250, manual: manual }); });
  return xRow({ icon: false, title: title, sub: sub, tip: p.join('.') + (cur !== undefined ? ' = ' + cur : ''), right: btn });
}

/* 常用设置：名字、生命值、幼年、开关 */
function esFlagList(s, o) {
  var list = h('div', { class: 'x-list' }), edit = esEditor(o);
  (s.flags || []).filter(function (f) { return f.common; }).sort(function (a, b) {
    var i = ES_FLAG_ORDER.indexOf(a.key), j = ES_FLAG_ORDER.indexOf(b.key); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  }).forEach(function (f) { var r = esFlagRow(f, o, edit, s); if (r) list.appendChild(r); });
  return list;
}
function esFlagRow(f, o, edit, schema) {
  var nm = ES_FLAG[f.key] || [f.key, ''], k = f.key, val = isObj(o.get()) ? o.get()[k] : undefined;
  if (f.id === 'baby' && f.type === 'int' && typeof f.babyAge === 'number') {
    /* 幼年：写游戏给的 babyAge / adultAge，不写探测样本 */
    var isBaby = typeof val === 'number' ? val < 0 : (typeof f.default === 'number' && f.default < 0);
    return xToggle({ title: nm[0], sub: nm[1], tip: k, value: isBaby, onChange: function (on) { edit(function (obj) { obj[k] = on ? f.babyAge : f.adultAge; }, true); } });
  }
  if (f.type === 'byte-bool') {
    var on = typeof val === 'number' ? val !== 0 : typeof val === 'boolean' ? val : !!f.default;
    return xToggle({ title: nm[0], sub: nm[1], tip: k, value: on, onChange: function (x) {
      edit(function (obj) { if (x === !!f.default && !f.present_by_default) delete obj[k]; else obj[k] = !!x; }, true);
    } });
  }
  if (f.type === 'float' || f.type === 'int') {
    var def = typeof f.default === 'number' ? f.default : 0, cur = typeof val === 'number' ? val : def;
    var opts = { title: nm[0], sub: nm[1] || (typeof val === 'number' ? '' : I18n.t("cadeditor.ui.eschema.5564c10bef", (fmtNum(def)))), tip: k, value: cur, min: typeof f.min === 'number' ? f.min : undefined, step: f.type === 'int' ? 1 : 0.5, dec: f.type === 'int' ? 0 : 2,
      onChange: function (x) { edit(function (obj) { nbtSetTyped(obj, k, x, f.type === 'float' ? 'f' : 'i'); }); } };
    var linkId = k === 'Health' ? 'minecraft:max_health' : k === 'AbsorptionAmount' ? 'minecraft:max_absorption' : null;
    var attr = linkId && schema && (schema.attributes || []).filter(function (a) { return a.id === linkId; })[0];
    if (attr) {
      var linkStart; try { var initial = o.get(), initialRow = (initial.attributes || []).filter(function (a) { return Reg.full(a.id) === linkId; })[0] || {}; linkStart = linkedAttributeValue(attr, initialRow, esAttrBase(initial, attr)); } catch (ignored) {}
      function plan(v) { var data = o.get(), row = (data.attributes || []).filter(function (a) { return a.id === linkId; })[0] || { base: attr.base }; return linkedAttributePlan(attr, Object.assign({}, row, { base: esAttrBase(data, attr) }), v); }
      opts.max = attr.max; opts.preservePrecision = true;
      opts.subOf = function () { try { var data = o.get(), row = (data.attributes || []).filter(function (a) { return Reg.full(a.id) === linkId; })[0] || {}, cap = linkedAttributeValue(attr, row, esAttrBase(data, attr)); return I18n.t("cadeditor.ui.eschema.17c8a27ae8", (linkStart !== undefined && cap !== linkStart ? I18n.t("cadeditor.ui.eschema.a36a322ae9", (fmtNum(linkStart)), (fmtNum(cap))) : I18n.t("cadeditor.ui.eschema.d6cada7add", (fmtNum(cap)))), (fmtNum(attr.max))); } catch (e) { return I18n.t("cadeditor.ui.eschema.91ed42fa96", (e.message)); } }; delete opts.sub;
      opts.validate = function (v) { try { plan(v); return ''; } catch (e) { return e.message; } };
      opts.onChange = function (v) { var p = plan(v); edit(function (obj) { if (p.changed) esAttrSet(obj, attr, p.base); nbtSetTyped(obj, k, v, f.type === 'float' ? 'f' : 'i'); }); };
    } else if (k === 'Health' && typeof f.max === 'number') { opts.warnMax = f.max; opts.warnText = I18n.t("cadeditor.ui.eschema.b52150c1a6"); opts.warnDetail = I18n.t("cadeditor.ui.eschema.8513fcdb2f", (fmtNum(f.max))); }
    return xNum(opts);
  }
  if (f.type === 'component' || f.type === 'string') {
    /* 名字：文本组件；已有的颜色、粗体等格式保留，只改 text */
    var text = typeof val === 'string' ? val : isObj(val) && typeof val.text === 'string' ? val.text : '';
    var locked = isObj(val) && typeof val.text !== 'string';
    if (locked) return xRow({ icon: false, title: nm[0], sub: I18n.t("cadeditor.ui.eschema.6334fb7c05"), tip: k });
    var inp = kInput(text, function (x) {
      edit(function (obj) {
        if (!x) { delete obj[k]; return; }
        if (f.type === 'string' || !isObj(obj[k]) || Object.keys(obj[k]).every(function (key) { return key === 'text'; })) { obj[k] = x; return; }
        var c = obj[k]; c.text = x; obj[k] = c;
      });
    }, { placeholder: I18n.t("cadeditor.ui.eschema.90bcaf2d60") });
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
  if (!Object.keys(bySlot).length) return xEmpty(I18n.t("cadeditor.ui.eschema.449b6c5044"));
  function stackOf(q) { var st = esGet(o.get(), q.nbtPath); return isObj(st) && typeof st.id === 'string' ? st : null; }
  function needs(q) { return q.requires && Object.keys(q.requires).some(function (k) { var v = isObj(o.get()) ? o.get()[k] : undefined; return v !== q.requires[k] && !(v === true && q.requires[k] === 1); }); }
  function choose(q, anchor) {
    pickItem(anchor, function (id) {
      kPopClose();
      edit(function (obj) {
        var cur = esGet(obj, q.nbtPath);
        esSet(obj, q.nbtPath, isObj(cur) && cur.id === fullId(id) ? cur : { id: fullId(id), count: 1 });
        if (q.requires) Object.keys(q.requires).forEach(function (k) { var f = (s.flags || []).filter(function (f) { return f.key === k; })[0]; if (f && f.type === 'byte-bool') nbtSetTyped(obj, k, q.requires[k], 'b'); else obj[k] = q.requires[k]; });
      }, true);
    }, { onStack: function (st) {
      kPopClose();
      edit(function (obj) {
        esSet(obj, q.nbtPath, vaultNested(st));
        if (q.requires) Object.keys(q.requires).forEach(function (k) { var f = (s.flags || []).filter(function (f) { return f.key === k; })[0]; if (f && f.type === 'byte-bool') nbtSetTyped(obj, k, q.requires[k], 'b'); else obj[k] = q.requires[k]; });
      }, true);
    } });
  }
  function menu(q, cell, st) {
    var box = h('div', { class: 'k-pickbox es-gearpop' });
    box.appendChild(h('div', { class: 'es-gearhd' }, [stackUiIcon(st, 22), h('div', { class: 'tx' }, [stackUiName(st), h('span', { class: 'k-sub', text: st.id })]),
      kBtn(I18n.t("cadeditor.ui.cards3.7f559289d4"), function () { kPopClose(); editNestedStack(st, I18n.t("cadeditor.ui.eschema.ee43b6f443", ((ES_SLOT[q.slot] || [q.slot])[0])), function (next) { edit(function (obj) { esSet(obj, q.nbtPath, next); }, true); }, o.redraw); }, { icon: 'edit', title: I18n.t("cadeditor.ui.eschema.0575945b77") })]));
    if (q.dropChancePath) {
      var dc = esGet(o.get(), q.dropChancePath), d0 = typeof q.dropChance === 'number' ? q.dropChance : 0;
      box.appendChild(fieldRow(I18n.t("cadeditor.ui.eschema.821ceece2c"), numField5(typeof dc === 'number' ? dc : d0, d0, { min: 0, max: 1, step: 0.05, dec: 3 }, function (x) { edit(function (obj) { esSet(obj, q.dropChancePath, x); }); })));
    }
    box.appendChild(h('div', { class: 'es-gearact' }, [
      kBtn(I18n.t("cadeditor.ui.eschema.916afcd853"), function () { choose(q, cell); }, { icon: 'refresh' }),
      kBtn(I18n.t("cadeditor.ui.common.clear"), function () { kPopClose(); edit(function (obj) { esDel(obj, q.nbtPath); if (q.dropChancePath) esDel(obj, q.dropChancePath); }, true); }, { cls: 'dng', icon: 'trash' })
    ]));
    kPopover(cell, box, { width: 300, maxHeight: 260 });
  }
  return esGearLayout({
    has: function (slot) { return !!bySlot[slot]; },
    stackOf: function (slot) { return stackOf(bySlot[slot]); },
    emptyHint: function (slot) { return needs(bySlot[slot]) ? I18n.t("cadeditor.ui.eschema.3bd718508c") : I18n.t("cadeditor.ui.cards4.2f8267a89a"); },
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
    var icon = st ? stackUiIcon(st, 26) : uiIcon(meta[1], 16, 'es-ghost');
    var cell = h('div', { class: 'slot s34 es-slot' + (st ? ' on' : '') }, [icon]);
    var native = st && icon.tagName && icon.tagName.toLowerCase() === 'item';
    if (native) { icon.style.width = '100%'; icon.style.height = '100%'; }
    if (st && !native && (st.count || 1) > 1) cell.appendChild(h('span', { class: 'cnt', text: String(st.count) }));
    if (!native) setTip(cell, meta[0] + '：' + (st ? nameOfItem(st.id) : (cfg.emptyHint ? cfg.emptyHint(slot) : I18n.t("cadeditor.ui.cards4.2f8267a89a"))));
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
    if ((s.variants || []).length) { box.appendChild(xSec('paw', I18n.t("cadeditor.ui.eschema.86a63f23a0"))); box.appendChild(esVariantList(s, oo)); }
    box.appendChild(xSec('sliders', I18n.t("cadeditor.ui.eschema.66749cca38"))); box.appendChild(esFlagList(s, oo)); var tr = esTagsRow(s, oo); if (tr) box.appendChild(tr);
    if ((s.attributes || []).some(function (a) { return a.common; })) { box.appendChild(xSec('sword', I18n.t("cadeditor.ui.eschema.86de52d178"))); box.appendChild(esAttrList(s, oo)); }
    if (s.effects && s.effects.common) { box.appendChild(xSec('flask', I18n.t("cadeditor.ui.eschema.a9e19fd036"))); box.appendChild(esEffects(s, oo)); }
    box.appendChild(xSec('helmet', I18n.t("cadeditor.ui.eschema.144a327039"))); box.appendChild(esGearGrid(s, oo, o.type));
    (s.warnings || []).forEach(function (w) { box.appendChild(kHint(I18n.t("cadeditor.ui.eschema.f545b88895", (w)))); });
    foldify(box, 'es');
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
  ['baby', 'components', 'cad-stand'].concat(Object.keys(ES_SLOT)).forEach(function (k) {
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
  } else if (at >= 0) { var e2 = clone(arr[at]); nbtSetTyped(e2, 'base', v, 'd'); arr[at] = e2; } else { var added = { id: a.id }; nbtSetTyped(added, 'base', v, 'd'); arr.push(added); }
  if (arr.length) obj.attributes = arr; else delete obj.attributes;
  var field = a.id === 'minecraft:max_health' ? 'Health' : a.id === 'minecraft:max_absorption' ? 'AbsorptionAmount' : null;
  if (field && typeof obj[field] === 'number') {
    var row = arr.filter(function (r) { return r.id === a.id; })[0] || { base: a.base };
    var effective = linkedAttributeValue(a, row, v);
    if (obj[field] > effective) nbtSetTyped(obj, field, effective, 'f');
  }
}
function esAttrScale(data, s) {
  var a = s && (s.attributes || []).filter(function (x) { return x.id === 'minecraft:scale'; })[0];
  return a ? esAttrBase(data, a) / (a.base || 1) : 1;
}
function esAttrList(s, o) {
  var edit = esEditor(o), list = h('div', { class: 'x-list' });
  var attrs = (s.attributes || []).filter(function (a) { return a.common; });
  if (!attrs.length) return xEmpty(I18n.t("cadeditor.ui.eschema.6ceffb2f6e"));
  attrs.sort(function (a, b) { var i = ES_ATTR_ORDER.indexOf(shortId(a.id)), j = ES_ATTR_ORDER.indexOf(shortId(b.id)); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (a.id < b.id ? -1 : 1); });
  var main = attrs.filter(function (a) { return ES_ATTR_ORDER.indexOf(shortId(a.id)) >= 0 && ES_ATTR_ORDER.indexOf(shortId(a.id)) < 6; }), rest = attrs.filter(function (a) { return main.indexOf(a) < 0; });
  function row(a) {
    var isScale = a.id === 'minecraft:scale', nm = nameOf('attribute', a.id);
    var step = isScale ? 0.25 : (a.max - a.min > 50 ? 1 : 0.1);
    return xNum({ title: isScale ? I18n.t("cadeditor.ui.eschema.c8900ba2f5") : nm, sub: I18n.t("cadeditor.ui.eschema.8c5568e59c", (fmtNum(a.base)), (fmtNum(a.min)), (fmtNum(a.max))), tip: a.id + (a.id === 'minecraft:max_health' || a.id === 'minecraft:max_absorption' ? I18n.t("cadeditor.ui.eschema.0f4e066fee") : ''), value: esAttrBase(o.get(), a),
      min: a.min, max: a.max, softMax: isScale ? 4 : undefined, step: step, dec: 3, noSlider: !isScale,
      presets: isScale ? [{ v: 0.5, label: '0.5' }, { v: 1, label: '1' }, { v: 2, label: '2' }, { v: 4, label: '4' }] : undefined,
      validate: function (v) { if (a.id !== 'minecraft:max_health' && a.id !== 'minecraft:max_absorption') return ''; try { var data = o.get(), found = (data.attributes || []).filter(function (r) { return Reg.full(r.id) === a.id; })[0] || {}; linkedAttributeValue(a, found, v); return ''; } catch (e) { return e.message; } },
      onChange: function (v) { edit(function (obj) { esAttrSet(obj, a, v); }, isScale); } });
  }
  main.forEach(function (a) { list.appendChild(row(a)); });
  if (rest.length) {
    var open = !!UIOpen['es:attrs:more'];
    if (open) rest.forEach(function (a) { list.appendChild(row(a)); });
    var tg = h('div', { class: 'k-add' }, [foldArrow(open, 8), h('span', { text: open ? I18n.t("cadeditor.ui.eschema.26f7ee471c") : I18n.t("cadeditor.ui.eschema.3a24430c4e", (rest.length)) })]);
    activate(tg, function () { UIOpen['es:attrs:more'] = !open; if (o.redraw) o.redraw(); });
    list.appendChild(tg);
  }
  return list;
}
/* ---------- 状态效果：生成时身上带着的药水效果 ---------- */
function esEffects(s, o) {
  var edit = esEditor(o);
  var fx = kEffectList(function () { var v = esGet(o.get(), ['active_effects']); return Array.isArray(v) ? clone(v) : []; },
    function (l) { edit(function (obj) { if (l.length) obj.active_effects = l; else delete obj.active_effects; }); }, { empty: I18n.t("cadeditor.ui.cards3.aa1f7f93b8") });
  return fx.el;
}
/* ---------- 标签（/tag 命令用的）：逗号隔开 ---------- */
function esTagsRow(s, o) {
  if (!(s.extras || []).some(function (x) { return x.key === 'Tags'; })) return null;
  var edit = esEditor(o), cur = esGet(o.get(), ['Tags']);
  return xText({ title: I18n.t("cadeditor.ui.eschema.1d0fd5f933"), sub: I18n.t("cadeditor.ui.eschema.ba7f4783d4"), tip: 'Tags', value: Array.isArray(cur) ? cur.join('，') : '', placeholder: I18n.t("cadeditor.ui.eschema.73c968f1e7"), style: 'width:170px', onCommit: function (v) { var t = splitTags(v); edit(function (obj) { if (t.length) obj.Tags = t; else delete obj.Tags; }); } });
}

/* ====================== 公共：生物头部（图标 + 名字 + ID + 按钮） ======================
   刷怪蛋、刷怪笼（当前生物 / 随机池）、蜂巢里的蜜蜂、乘客、世界里的生物页都用它，样子和按钮位置一致。
   o = {
     id,                    当前生物 ID（可空）
     sub?,                  名字下面那行字，默认是完整 ID
     iconFn?(size),         图标，默认生物对应的刷怪蛋 / 通用图标
     onPick?(fullId),       有它才显示「更换生物」
     onEntityNbt?(snbt),    选择窗里「从保险库取生物」取出整只生物时
     snbtText?()            有它才显示「存入保险库」（返回带类型的实体 SNBT 文本）
     onApplyVault?(snbt)    有它才显示「从保险库套用」（放置好的生物不能换类型，只套数据）
     empty?                 没有生物时的文字
   } */
function esEntityIcon(id, size) {
  var info = id ? Reg.entityInfo(id) : null, eggs = info && info.spawn_eggs;
  return eggs && eggs.length ? itemIcon(eggs[0], size) : uiIcon('paw', size > 20 ? 32 : 16);
}
/* Complete entity copy shared by selectors and Vault imports. Never applies to the game. */
function openEntityDraft(snbt, o) {
  o = o || {};
  var work, mode = 'form', code = null, panel = null, schemaPending = false, mask, valid = nestedDraftGuard();
  function read(text) {
    var payload = vaultEntityPayload(text);
    if (!/^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/.test(payload.type)) throw new Error(I18n.t("cadeditor.ui.eschema.388a596c77"));
    return vaultEntityObj(text);
  }
  function failed(e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('entity.draft', e); toast(I18n.t("cadeditor.ui.eschema.bf5a7e7049", (e.message || e)), 'error'); }
  try { work = read(snbt); } catch (e) { failed(e); return; }
  var body = h('div', { class: 'k-mb' }), content = h('div', {});
  function show() {
    clear(content);
    if (mode === 'raw') {
      code = kCode({ value: nbtMerge(work, null), height: 320, validate: read });
      content.appendChild(code.el);
    } else {
      code = null;
      schemaPending = !Reg.entitySchema(Reg.full(work.id));
      panel = esPanel({ type: Reg.full(work.id), get: function () { return work; }, set: function (next) { work = clone(next); } });
      content.appendChild(panel);
    }
  }
  var tabs = kSeg([{ v: 'form', label: I18n.t("cadeditor.ui.eschema.86de52d178"), icon: 'sliders' }, { v: 'raw', label: 'SNBT', icon: 'code' }], mode, function (next) {
    if (next === mode) return;
    if (mode === 'raw') { try { work = read(code.get()); } catch (e) { tabs.set(mode); failed(e); return; } }
    mode = next; show();
  });
  body.appendChild(tabs.el); body.appendChild(content); show();
  var win = modalShell({ icon: 'paw', title: o.title || I18n.t("cadeditor.ui.eschema.7de591c132"), sub: entityName(work.id), cls: 'wide', body: body,
    foot: h('div', { class: 'k-mf' }, [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), kBtn(I18n.t("cadeditor.ui.eschema.778c339528"), function () {
      var text;
      try { text = mode === 'raw' ? code.get() : nbtMerge(work, null); read(text); }
      catch (e) { failed(e); return; }
      if (!valid() || (o.valid && !o.valid())) { toast(I18n.t("cadeditor.ui.eschema.1a537ec20a"), 'warn'); return; }
      closeModal(); o.commit(text);
    }, { cls: 'pri', icon: 'check' })]) });
  mask = openModal(win, true); windowify(win, 'entity-draft');
  var off = Reg.on(function () { if ($('modal') === mask && mode === 'form' && panel && schemaPending && Reg.entitySchema(Reg.full(work.id))) { schemaPending = false; panel.redraw(); } });
  mask.onEditorClose = function () { off(); };
}
function esEntityHeader(o) {
  var id = o.id ? Reg.full(o.id) : '';
  var name = id ? entityName(id) : (o.empty || I18n.t("cadeditor.ui.banner.3c5045c728"));
  var kids = [h('div', { class: 'egg-ico' }, [o.iconFn ? o.iconFn(32) : esEntityIcon(id, 32)]), h('div', { class: 'tx' }, [h('b', { text: name }), h('span', { class: 'k-sub', text: o.sub !== undefined ? o.sub : id })])];
  var snd = id && typeof mobSoundRow === 'function' ? mobSoundRow(id) : null;
  if (o.onPick) kids.push(kBtn(I18n.t("cadeditor.ui.eschema.23ccd9357c"), function () { openRegPick({ reg: 'entity_type', current: id, title: I18n.t("cadeditor.ui.eschema.0c8fb2e36b"), entityText: o.snbtText, onEntityNbt: o.onEntityNbt, onPick: o.onPick }); }, { icon: 'grid' }));
  var editButton = id && o.snbtText && o.onEntityNbt ? kBtn(I18n.t("cadeditor.ui.eschema.7de591c132"), function () { try { openEntityDraft(o.snbtText(), { commit: o.onEntityNbt }); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('entity.header.edit', e); toast(I18n.t("cadeditor.ui.eschema.3020fa499b", (e.message || e)), 'error'); } }, { icon: 'edit' }) : null;
  if (o.onApplyVault) kids.push(kBtn(I18n.t("cadeditor.ui.eschema.4abbd64967"), function () { openVault({ kind: 'entity', pickEntity: function (snbt) { o.onApplyVault(snbt); } }); }, { icon: 'download', title: I18n.t("cadeditor.ui.eschema.818f73e936") }));
  if (o.snbtText && id) kids.push(kBtn(I18n.t("cadeditor.ui.eschema.248306082a"), function () { openVaultSaveEntity(o.snbtText(), name); }, { icon: 'chest', title: I18n.t("cadeditor.ui.eschema.b981ac0d25") }));
  if (snd || editButton || o.originHint) kids.push(h('div', { class: 'egg-actions' }, [snd, o.originHint ? h('span', { class: 'k-sub', text: o.originHint, title: o.originHint }) : null, editButton].filter(function (x) { return x; })));
  return h('div', { class: 'egg-who' }, kids);
}
