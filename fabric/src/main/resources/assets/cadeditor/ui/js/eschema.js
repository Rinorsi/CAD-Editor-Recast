/* 实体的变种、常用开关和装备：全部来自游戏的 entity_schema（docs/entity-schema-contract.md）。
   刷怪蛋页和世界实体页共用 esPanel。选项、NBT 路径、默认值、幼年年龄都由游戏给出，这里不写死任何实体数据；
   中文只用来给字段起名字，认不出的字段直接显示游戏给的 ID。 */

/* 字段名（界面文字）：认不出的显示游戏给的 ID */
var ES_VARIANT = { variant: '品种', sound_variant: '叫声', collar: '项圈颜色', color: '羊毛颜色', markings: '斑纹', strength: '力量', size: '大小',
  profession: '职业', level: '等级', pattern: '图案', base_color: '主体颜色', pattern_color: '图案颜色' };
var ES_FLAG = { CustomName: ['名字', '头顶显示的名字'], CustomNameVisible: ['总是显示名字', '不用准星对着也显示'], Health: ['生命值', ''],
  Age: ['幼年', '生成为幼年个体'], IsBaby: ['幼年', '生成为幼年个体'], NoAI: ['没有 AI', '不会自己移动和攻击'], Silent: ['静音', '不发出声音'],
  Invulnerable: ['无敌', '不受伤害（创造模式玩家除外）'], NoGravity: ['无重力', '不会下落'], Glowing: ['发光轮廓', '隔着方块也能看到轮廓'],
  PersistenceRequired: ['不会消失', '玩家走远也不会自然消失'], ShowArms: ['显示手臂', '手臂可以拿东西'] };
var ES_FLAG_ORDER = ['CustomName', 'CustomNameVisible', 'Health', 'Age', 'IsBaby', 'ShowArms', 'NoAI', 'PersistenceRequired', 'Silent', 'Invulnerable', 'NoGravity', 'Glowing'];
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
  return k;
}

/* 手动输入一个不在列表里的值 */
function esManual(anchor, numeric, onValue) {
  var inp = kInput('', function () {}, { placeholder: numeric ? '整数' : '完整 ID，如 mymod:spotted' }), err = h('div', { class: 'k-numerr' });
  var ok = kBtn('确定', function () {
    var t = inp.value.trim();
    if (numeric) { if (!/^-?\d+$/.test(t)) { err.textContent = '请输入整数'; return; } onValue(Number(t)); }
    else { if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(t)) { err.textContent = '需要 命名空间:路径 形式的 ID'; return; } onValue(t); }
    kPopClose();
  }, { cls: 'pri' });
  kPopover(anchor, h('div', { class: 'k-pickbox' }, [inp, err, ok]), { width: 240, maxHeight: 160 });
  inp.focus();
}

/* o = { type, get()→当前实体复合数据, set(obj), changed()（重画别处）, template? }
   返回元素；控件改动立即 set，开关 / 选择类改动后自己重画 */
function esPanel(o) {
  var box = h('div', { class: 'es-panel' });
  function draw() {
    clear(box);
    var s = o.type ? Reg.entitySchema(o.type) : false;
    if (!o.type) { box.appendChild(xEmpty('先选择生物')); return; }
    if (s === null) { box.appendChild(xEmpty('正在向游戏读取这只生物能改什么…')); return; }
    if (!s) { box.appendChild(xEmpty('没有连接游戏，读不到这只生物的变种和开关。可以在下面直接添加字段。')); return; }
    if (!s.available) { box.appendChild(xEmpty((s.error || '游戏没能生成这只生物的模板') + '。可以在下面直接添加字段。')); return; }
    var tpl = null; try { tpl = s.default_nbt ? parseSnbt(s.default_nbt) : null; } catch (e) {}
    function edit(fn, redraw) { var obj = clone(isObj(o.get()) ? o.get() : {}); fn(obj); o.set(obj); if (o.changed) o.changed(); if (redraw) draw(); }
    if ((s.variants || []).length) {
      box.appendChild(xSec('paw', '外观'));
      var vl = h('div', { class: 'x-list' });
      s.variants.forEach(function (v) { vl.appendChild(esVariantRow(v, o, tpl, edit)); });
      box.appendChild(vl);
    }
    var flags = (s.flags || []).filter(function (f) { return f.common; }).sort(function (a, b) {
      var i = ES_FLAG_ORDER.indexOf(a.key), j = ES_FLAG_ORDER.indexOf(b.key); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
    });
    if (flags.length) {
      box.appendChild(xSec('sliders', '常用设置'));
      var fl = h('div', { class: 'x-list' });
      flags.forEach(function (f) { var r = esFlagRow(f, o, edit); if (r) fl.appendChild(r); });
      box.appendChild(fl);
    }
    var eq = esEquipment(s, o, edit);
    if (eq) box.appendChild(eq);
    (s.warnings || []).forEach(function (w) { box.appendChild(h('div', { class: 'k-sub', text: '游戏提示：' + w })); });
  }
  draw();
  box.redraw = draw;
  return box;
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
  var entries = (v.options || []).map(function (x) { return { v: x.value, label: esOptLabel(x), sub: String(x.value) }; });
  var curE = entries.filter(function (e) { return e.v === pick(cur); })[0];
  var numeric = typeof v.default === 'number' || entries.some(function (e) { return typeof e.v === 'number'; });
  entries.push({ v: '\u0000manual', label: '手动输入…', sub: '列表里没有的值' });
  var btn = h('div', { class: 'k-btn k-sel' }, [h('span', { text: curE ? curE.label : (cur === undefined ? '（未知）' : String(cur)) }), uiIcon('down', 10)]);
  activate(btn, function () {
    pickFrom(btn, entries, function (e) { if (e.v === '\u0000manual') esManual(btn, numeric, write); else write(e.v); }, { width: 250 });
  });
  return xRow({ icon: false, title: title, sub: sub, tip: p.join('.') + (cur !== undefined ? ' = ' + cur : ''), right: btn });
}

function esFlagRow(f, o, edit) {
  var nm = ES_FLAG[f.key] || [f.key, ''], k = f.key, val = isObj(o.get()) ? o.get()[k] : undefined;
  if (f.id === 'baby' && f.type === 'int' && typeof f.babyAge === 'number') {
    /* 幼年：写游戏给的 babyAge / adultAge，不写探测样本 */
    var isBaby = typeof val === 'number' ? val < 0 : (typeof f.default === 'number' && f.default < 0);
    return xRow({ icon: false, title: nm[0], sub: nm[1], tip: k, right: kToggle(isBaby, function (on) { edit(function (obj) { obj[k] = on ? f.babyAge : f.adultAge; }); }).el });
  }
  if (f.type === 'byte-bool') {
    var on = typeof val === 'number' ? val !== 0 : typeof val === 'boolean' ? val : !!f.default;
    return xRow({ icon: false, title: nm[0], sub: nm[1], tip: k, right: kToggle(on, function (x) {
      edit(function (obj) { if (x === !!f.default && !f.present_by_default) delete obj[k]; else obj[k] = x ? 1 : 0; }, k === 'ShowArms');
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
    if (locked) return xRow({ icon: false, title: nm[0], sub: '使用了翻译键等复杂格式，请在下面的原始字段里修改', tip: k });
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

/* 装备：每个槽一行，点物品更换；展开后可改掉落概率、清空。需要前置字段的槽（盔甲架手持需要显示手臂）选物品时一并写上 */
function esEquipment(s, o, edit) {
  var slots = (s.equipment || []).filter(function (q) { return q.canHold || q.requires; });
  if (!slots.length) return null;
  var wrap = h('div');
  var any = slots.some(function (q) { var st = esGet(o.get(), q.nbtPath); return isObj(st) && st.id; });
  var xl = xList({
    items: function () { return slots; }, empty: '',
    row: function (q) {
      var meta = ES_SLOT[q.slot] || [humanId(q.slot), 'shield'], st = esGet(o.get(), q.nbtPath), has = isObj(st) && typeof st.id === 'string';
      var need = q.requires && Object.keys(q.requires).some(function (k) { var v = isObj(o.get()) ? o.get()[k] : undefined; return v !== q.requires[k] && !(v === true && q.requires[k] === 1); });
      var btn = h('div', { class: 'k-btn' }, has ? [itemIcon(st.id, 16), h('span', { text: nameOfItem(st.id) })] : [uiIcon('plus', 12), h('span', { text: '选择物品' })]);
      activate(btn, function () {
        pickItem(btn, function (id) {
          kPopClose();
          edit(function (obj) {
            var cur = esGet(obj, q.nbtPath), next = isObj(cur) && cur.id === fullId(id) ? cur : { id: fullId(id), count: 1 };
            esSet(obj, q.nbtPath, next);
            if (q.requires) Object.keys(q.requires).forEach(function (k) { obj[k] = q.requires[k]; });
          }, true);
        });
      });
      var sub = has ? ((st.count || 1) > 1 ? '× ' + st.count : '') : (need ? '选物品时会一并打开「' + (ES_FLAG.ShowArms[0]) + '」' : '空');
      return { icon: uiIcon(meta[1], 14), title: meta[0], sub: sub, tip: q.nbtPath.join('.'), right: btn, body: has ? function () {
        var kids = [];
        if (q.dropChancePath) {
          var dc = esGet(o.get(), q.dropChancePath), d0 = typeof q.dropChance === 'number' ? q.dropChance : 0;
          kids.push(xField('refresh', '掉落概率', numField5(typeof dc === 'number' ? dc : d0, d0, { min: 0, max: 1, step: 0.05, dec: 3 }, function (x) { edit(function (obj) { esSet(obj, q.dropChancePath, x); }); })));
        }
        kids.push(xFoot('物品上的附魔等组件在下面原始字段的 ' + q.nbtPath[0] + ' 里改', function () {
          edit(function (obj) { esDel(obj, q.nbtPath); if (q.dropChancePath) esDel(obj, q.dropChancePath); }, true);
        }, '清空'));
        return kids;
      } : null };
    }
  });
  wrap.appendChild(xl.el);
  return worldFold('装备', wrap, any, slots.length + ' 个位置');
}

/* 刷怪蛋左栏里的 3D 生物：左键拖动旋转（引擎自带），滚轮缩放，右键或中键拖动移动位置。
   同一只生物重画时沿用原来的元素，转过的角度不丢；换了生物或点「恢复默认视角」才回到默认 */
var ES_PAN = null;
function heroEntity(type, data, old) {
  var full = Reg.full(type), v = UI.entView;
  if (!v || v.type !== full) v = UI.entView = { type: full, s: 1, x: 0, y: 0 };
  var el = old && old.getAttribute('type') === full ? old : h('entity', { class: 'k-ent', type: full, rotatable: true });
  var pa = esPreviewAttrs(full, data);
  ['baby', 'components'].concat(Object.keys(ES_SLOT)).forEach(function (k) {
    if (pa[k] === undefined) { if (el.getAttribute(k) !== null) el.removeAttribute(k); }
    else if (el.getAttribute(k) !== pa[k]) el.setAttribute(k, pa[k]);
  });
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
function esEntPaint(el) {
  var w = UI.entView || { s: 1, x: 0, y: 0 };
  el.setAttribute('style', '-mc-model-scale:' + (+w.s.toFixed(3)) + ';left:' + Math.round(w.x) + 'px;top:' + Math.round(w.y) + 'px');
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
