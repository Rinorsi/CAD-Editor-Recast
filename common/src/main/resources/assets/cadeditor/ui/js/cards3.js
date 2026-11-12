/* 卡片库 · 第三部分：食物 / 药水 / 效果、容器、书本、烟花 */

/* ---------- 时长 ---------- */
function fmtDur(ticks) {
  if (Number(ticks) === -1) return I18n.t("cadeditor.ui.cards3.3e71ccc89a");
  var s = ticks / 20, m = Math.floor(s / 60), r = Math.round(s - m * 60);
  if (s >= 3600) return I18n.t("cadeditor.ui.cards3.eda64b9028", (Math.floor(s / 3600)), (Math.floor((s % 3600) / 60)));
  return m + ':' + (r < 10 ? '0' : '') + r;
}
var EFFECT_KIND_COLOR = I18n.keyed({ "cadeditor.ui.picker.740f5e8102": '#7ed957', "cadeditor.ui.picker.10db0d86d9": '#ff6b6b', "cadeditor.ui.picker.574ce385b8": '#ffd166' });
function effectEntries() {
  return Reg.effects().map(function (e) { return { v: e.full, label: e.name, sub: (EFFECT_CAT_ZH[e.cat] || e.cat) + (e.desc ? ' · ' + e.desc : ''), icon: function () { return effectIcon(e.full, 20); } }; });
}

/* ---------- 状态效果列表 ----------
   getList() -> 效果数组；setList(arr)。o.mode: 'full'（等级/时长/粒子/图标/环境）或 'stew'（只有 id 与时长）。
   折叠态是游戏里的样子（图标 + 名称 + 等级 + 时长），点开编辑；可拖拽排序、右键菜单。 */
function kEffectList(getList, setList, o) {
  o = o || {};
  var full = o.mode !== 'stew';
  var wrap = h('div', { class: 'k-effects' }), list = h('div', { class: 'k-sortlist' }), openIdx = -1;
  function draw() {
    clear(list);
    var arr = getList();
    arr.forEach(function (fx, i) {
      var id = shortId(fx.id || ''), info = EFIDX[id], isOpen = openIdx === i;
      var lvl = (fx.amplifier || 0) + 1, dur = fx.duration === undefined ? (full ? 0 : 160) : fx.duration;
      var row = xRow({ grip: true, chevron: true, icon: effectIcon(id, 22), title: (info ? info.name : id) + (full && lvl > 1 ? ' ' + levelText(lvl) : ''), sub: (info ? info.kind : I18n.t("cadeditor.ui.cards3.8df52353a9")) + ' · ' + fmtDur(dur), onDelete: function () { arr.splice(i, 1); setList(arr); openIdx = -1; draw(); }, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; draw(); } });
      var head = row.firstChild;
      if (isOpen) {
        var body = h('div', { class: 'k-xbody' });
        if (full) {
          var lv = kNumber(lvl, { min: 1, max: 256, warnMax: 256, softMax: 10, step: 1, noSlider: false, presets: [{ v: 1, label: 'I' }, { v: 2, label: 'II' }, { v: 3, label: 'III' }, { v: 5, label: 'V' }, { v: 10, label: 'X' }, { v: 256, label: '256' }], onChange: function (n) { arr[i].amplifier = n - 1; setList(arr); head.querySelector('.z').textContent = (info ? info.name : id) + (n > 1 ? ' ' + levelText(n) : ''); } });
          body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.3b072f39a6"), lv.el, I18n.t("cadeditor.ui.cards3.cc8869e7f4")));
        }
        var inf = Number(fx.duration) === -1;
        var secs = kNumber(effectSecondsFromTicks(dur), { min: -1, softMin: 0, max: 1e8, softMax: 600, step: 1, dec: 2, unit: I18n.t("cadeditor.ui.cards2.9dcdc2b289"), validate: function (n) { return n < 0 && n !== -1 ? I18n.t("cadeditor.ui.cards3.597bbad431") : ''; }, presets: [{ v: 3, label: I18n.t("cadeditor.ui.cards3.606acd5b98") }, { v: 8, label: I18n.t("cadeditor.ui.cards3.3e3bb03684") }, { v: 30, label: I18n.t("cadeditor.ui.cards3.d33b957094") }, { v: 90, label: '1:30' }, { v: 180, label: '3:00' }, { v: 480, label: '8:00' }, { v: 1800, label: I18n.t("cadeditor.ui.cards3.048dcd53a9") }, { v: -1, label: I18n.t("cadeditor.ui.cards3.3e71ccc89a") }], onChange: function (n) { arr[i].duration = effectTicksFromSeconds(n); setList(arr); head.querySelector('.s').textContent = (info ? info.kind : I18n.t("cadeditor.ui.cards3.8df52353a9")) + ' · ' + fmtDur(arr[i].duration); if (n === -1) draw(); } });
        var infTg = kToggle(inf, function (on) { arr[i].duration = on ? -1 : 600; setList(arr); draw(); }, I18n.t("cadeditor.ui.cards3.fe39c74ab5"));
        if (!inf) body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.cc758c3337"), secs.el, I18n.t("cadeditor.ui.cards3.7590d68e6e")));
        body.appendChild(h('div', { class: 'k-fxlist' }, [infTg.el]));
        if (full) {
          var t1 = kToggle(fx.show_particles !== false, function (on) { arr[i].show_particles = on; setList(arr); }, I18n.t("cadeditor.ui.cards3.0f09d514f4"));
          var t2 = kToggle(fx.show_icon !== false && (fx.show_icon === undefined ? fx.show_particles !== false : fx.show_icon), function (on) { arr[i].show_icon = on; setList(arr); }, I18n.t("cadeditor.ui.cards3.eb5dfa5d0f"));
          var t3 = kToggle(!!fx.ambient, function (on) { arr[i].ambient = on; setList(arr); }, I18n.t("cadeditor.ui.cards3.8a22127db6"));
          body.appendChild(h('div', { class: 'k-fxlist' }, [t1.el, t2.el, t3.el]));
        }
        row.appendChild(body);
      }
      onContext(row, function () { return [{ label: I18n.t("cadeditor.ui.common.copy"), icon: 'copy', run: function () { arr.splice(i + 1, 0, clone(fx)); setList(arr); draw(); } }, { sep: 1 }, { label: I18n.t("cadeditor.ui.common.delete"), icon: 'trash', danger: 1, run: function () { arr.splice(i, 1); setList(arr); draw(); } }]; });
      list.appendChild(row);
    });
    if (!arr.length) list.appendChild(xEmpty(o.empty || I18n.t("cadeditor.ui.cards3.5db293b24c")));
  }
  kSortable(list, { onMove: function (from, to) { var arr = getList(); var x = arr.splice(from, 1)[0]; arr.splice(to, 0, x); setList(arr); openIdx = -1; draw(); } });
  var add = xAdd(I18n.t("cadeditor.ui.cards3.6965940e5f"));
  activate(add, function () {
    var present = {}, values = {}; getList().forEach(function (fx) { var id = Reg.full(fx.id); present[id] = 1; values[id] = { level: (fx.amplifier || 0) + 1, seconds: fx.duration === undefined ? (full ? 0 : 8) : effectSecondsFromTicks(fx.duration) }; });
    openEffectPicker({ present: present, values: values, full: full, onConfirm: function (ids, vals, edit) {
      var arr = pickerSyncList(getList(), ids, function (fx) { return fx.id; }, function (id) { var v = (vals && vals[id]) || {}, ticks = effectTicksFromSeconds(v.seconds || (full ? 30 : 8)); return full ? { id: id, amplifier: Math.max(0, (v.level || 1) - 1), duration: ticks, show_particles: true } : { id: id, duration: ticks }; }, function (fx, id) {
        var dirty = edit && edit.changes[id] || {}, v = vals && vals[id] || {};
        if (dirty.seconds) fx.duration = effectTicksFromSeconds(v.seconds);
        if (full && dirty.level) fx.amplifier = v.level - 1;
      });
      setList(arr); openIdx = arr.length - 1; draw();
    } });
  });
  wrap.appendChild(h('div', { class: 'k-scrollbox tall' }, [list])); wrap.appendChild(add);
  draw();
  return { el: wrap, redraw: draw };
}

/* ---------- 食物 ---------- */
CARDS.food = function () {
  var card = kCard({ id: 'food', icon: itemIcon('cooked_beef', 18), title: I18n.t("cadeditor.ui.cards3.ab2775f0d3"), desc: I18n.t("cadeditor.ui.cards3.f78806348f"), comps: ['food'], value: function () { var f = Ctx.get('food'); return f ? I18n.t("cadeditor.ui.cards3.0e6d1ae03c", (bigOrNum(f.nutrition))) : ''; } }, Ctx);
  var v = Ctx.get('food');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards3.e99fb549ce"), I18n.t("cadeditor.ui.cards3.e5fbf9c934")], I18n.t("cadeditor.ui.cards3.212ac68af6"), function () { Ctx.enable('food', { nutrition: 4, saturation: 2.4 }, I18n.t("cadeditor.ui.cards3.212ac68af6")); });
  function put(k, val) { var o = Ctx.get('food') || { nutrition: 4, saturation: 2.4 }; o[k] = val; Ctx.setSmart('food', o, { label: I18n.t("cadeditor.ui.cards3.ab2775f0d3") }); }
  var bar = iconBar('k-food');
  var nut = kNumber(v.nutrition, { min: 0, max: 2147483647, softMax: 20, step: 1, big: true, unit: I18n.t("cadeditor.ui.cards2.08dddeac13"), presets: [{ v: 1, label: '1' }, { v: 2, label: '2' }, { v: 5, label: '5' }, { v: 8, label: '8' }, { v: 20, label: '20' }].concat(presetsFromItems(['apple', 'bread', 'cooked_beef'], 'food', 'nutrition')), onChange: function (n) { put('nutrition', n); } });
  var sat = kNumber(v.saturation, { min: -3.4e38, max: 3.4e38, softMax: 20, step: 0.5, dec: 2, unit: I18n.t("cadeditor.ui.cards2.08dddeac13"), presets: [{ v: 0, label: '0' }, { v: 2.4, label: '2.4' }, { v: 6, label: '6' }, { v: 12.8, label: '12.8' }, { v: 20, label: '20' }].concat(presetsFromItems(['apple', 'bread', 'cooked_beef'], 'food', 'saturation')), onChange: function (n) { put('saturation', n); } });
  var always = codecToggle(codecField(v, 'food', 'can_always_eat', false), function (on) { put('can_always_eat', on); }, I18n.t("cadeditor.ui.cards3.13630a5c23"));
  var eff = kEffect('');
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.81858022a9"), nut.el, I18n.t("cadeditor.ui.cards3.381565c0b9")));
  card.body.appendChild(bar.el);
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.04496d8925"), sat.el, I18n.t("cadeditor.ui.cards3.98a307b40c")));
  card.body.appendChild(always.el); card.body.appendChild(eff.el);
  card.live.push(function () {
    var f = Ctx.get('food'); if (!f) return; nut.set(f.nutrition); sat.set(f.saturation); always.set(!!f.can_always_eat);
    bar.set(Math.max(0, f.nutrition), 10);
    eff.set(I18n.t("cadeditor.ui.cards3.7fff08cd53", (bigOrNum(f.nutrition)), (bigOrNum(f.nutrition / 2)), (bigOrNum(f.saturation)), (f.nutrition >= 20 ? I18n.t("cadeditor.ui.cards3.912bf5b19a") : '')));
  });
  return card;
};

var ANIMS = [['none', I18n.t("cadeditor.ui.common.none"), 'close'], ['eat', I18n.t("cadeditor.ui.cards3.c814805bc6"), 'apple'], ['drink', I18n.t("cadeditor.ui.cards3.193632bffe"), 'potion_round'], ['block', I18n.t("cadeditor.ui.cards3.7ee0dbbb0d"), 'shield'], ['bow', I18n.t("cadeditor.ui.cards3.200a05bd48"), 'bow'], ['trident', I18n.t("cadeditor.ui.cards3.9d1ca4b9b3"), 'trident'], ['spear', I18n.t("cadeditor.ui.cards3.dc92183342"), 'spear'], ['crossbow', I18n.t("cadeditor.ui.cards3.fabcd6ddc5"), 'crossbow'], ['spyglass', I18n.t("cadeditor.ui.cards3.60a644a501"), 'eye'], ['toot_horn', I18n.t("cadeditor.ui.cards3.590e2c8881"), 'horn'], ['brush', I18n.t("cadeditor.ui.cards3.59c12e43ed"), 'brush'], ['bundle', I18n.t("cadeditor.ui.cards3.61d582be1c"), 'bag']];
var SOUNDS = [{ v: 'minecraft:entity.generic.eat', label: I18n.t("cadeditor.ui.cards3.1e7376285a") }, { v: 'minecraft:entity.generic.drink', label: I18n.t("cadeditor.ui.cards3.50c8e957f6") }, { v: 'minecraft:item.honey_bottle.drink', label: I18n.t("cadeditor.ui.cards3.05ad15f6cf") }, { v: 'minecraft:entity.player.burp', label: I18n.t("cadeditor.ui.cards3.8f8333b1c7") }, { v: 'minecraft:entity.strider.eat', label: I18n.t("cadeditor.ui.cards3.d89413e635") }, { v: 'minecraft:entity.fox.eat', label: I18n.t("cadeditor.ui.cards3.88edb67c18") }];
CARDS.consumable = function () {
  var card = kCard({ id: 'consume', icon: itemIcon('golden_apple', 18), title: I18n.t("cadeditor.ui.cards3.91625044f6"), desc: I18n.t("cadeditor.ui.cards3.8ab0304bd8"), comps: ['consumable'], span: 2 }, Ctx);
  var v = Ctx.get('consumable');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards3.329087bff0"), I18n.t("cadeditor.ui.cards3.058afc222a")], I18n.t("cadeditor.ui.common.enabled"), function () { Ctx.enable('consumable', {}, I18n.t("cadeditor.ui.cards3.beeb3acd72")); });
  function put(fn, label) { var o = Ctx.get('consumable') || {}; fn(o); Ctx.setSmart('consumable', o, { label: label || I18n.t("cadeditor.ui.cards3.24f80467ea") }); }
  var secs = codecNumber(codecField(v, 'consumable', 'consume_seconds', 1.6), { min: 0, max: 3.4e38, softMax: 10, step: 0.1, dec: 2, big: true, unit: I18n.t("cadeditor.ui.cards2.9dcdc2b289"), presets: [{ v: 0.8, label: I18n.t("cadeditor.ui.cards3.7bfb80a452") }, { v: 1.6, label: '1.6' }, { v: 3.2, label: '3.2' }, { v: 5, label: '5' }, { v: 30, label: '30' }], onChange: function (n) { put(function (o) { o.consume_seconds = n; }, I18n.t("cadeditor.ui.cards3.510da72863")); } });
  function animations() { return Reg.options('enum:use_animation') || (Reg.preview() ? ANIMS.map(function (a) { return { v: a[0], label: a[1], icon: function () { return uiIcon(a[2], 20); } }; }) : []); }
  var anim = kTiles(animations(), codecField(v, 'consumable', 'animation', 'eat'), function (x) { put(function (o) { o.animation = x; }, I18n.t("cadeditor.ui.cards3.0dc90031ab")); }, { cols: 6 });
  var snd = kSoundField(codecField(v, 'consumable', 'sound', 'minecraft:entity.generic.eat') || '', function (x) { put(function (o) { o.sound = x; }, I18n.t("cadeditor.ui.cards3.97b5066755")); });
  var part = codecToggle(codecField(v, 'consumable', 'has_consume_particles', true), function (on) { put(function (o) { o.has_consume_particles = on; }); }, I18n.t("cadeditor.ui.cards3.9ab600927c"));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.be4d66234f"), secs.el));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.be37d84119"), anim.el));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.97b9730ac8"), combo({ options: animations, value: v.animation || '', free: true, onPick: function (x) { put(function (o) { o.animation = x; }); } })));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.473400815c"), snd.el));
  card.body.appendChild(part.el);
  card.live.push(function () { var o = Ctx.get('consumable'); if (o) { secs.set(codecField(o, 'consumable', 'consume_seconds', 1.6)); anim.set(codecField(o, 'consumable', 'animation', 'eat')); part.set(codecField(o, 'consumable', 'has_consume_particles', true) === true); } });
  return card;
};

/* ---------- 使用结束后的效果 ---------- */
var CE_TYPES = [{ v: 'minecraft:apply_effects', label: I18n.t("cadeditor.ui.cards3.e42e9be8a1"), sub: I18n.t("cadeditor.ui.cards3.d5319a627a") }, { v: 'minecraft:remove_effects', label: I18n.t("cadeditor.ui.cards3.e2531defcf"), sub: I18n.t("cadeditor.ui.cards3.4b92494574") }, { v: 'minecraft:clear_all_effects', label: I18n.t("cadeditor.ui.cards3.8908486b4c"), sub: I18n.t("cadeditor.ui.cards3.b892a42b96") }, { v: 'minecraft:teleport_randomly', label: I18n.t("cadeditor.ui.cards3.07cfc4a232"), sub: I18n.t("cadeditor.ui.cards3.c7d9d475d6") }, { v: 'minecraft:play_sound', label: I18n.t("cadeditor.ui.cards3.246f139dcf"), sub: '' }];
function ceLabel(t) { for (var i = 0; i < CE_TYPES.length; i++) if (CE_TYPES[i].v === t) return CE_TYPES[i].label; return t; }
function ceSummary(e) {
  if (e.type === 'minecraft:apply_effects') { var n = (e.effects || []).map(function (x) { var i = EFIDX[shortId(x.id || '')]; return (i ? i.name : shortId(x.id || '?')) + (x.amplifier ? ' ' + levelText(x.amplifier + 1) : ''); }); return n.join('、') + (e.probability !== undefined && e.probability < 1 ? I18n.t("cadeditor.ui.cards3.62785628c9", (Math.round(e.probability * 100))) : ''); }
  if (e.type === 'minecraft:teleport_randomly') return e.diameter === undefined ? I18n.t("cadeditor.ui.cards3.54670ac4c2") : I18n.t("cadeditor.ui.cards3.0463be14cb", (fmtNum(e.diameter / 2)));
  if (e.type === 'minecraft:remove_effects') { var r = e.effects; var l = Array.isArray(r) ? r : [r]; return l.map(function (x) { var i = EFIDX[shortId(typeof x === 'string' ? x : '')]; return i ? i.name : String(x); }).join('、'); }
  if (e.type === 'minecraft:play_sound') return typeof e.sound === 'string' ? e.sound : I18n.t("cadeditor.ui.cards3.ed94b3857d");
  return '';
}
function kConsumeEffects(getList, setList, cid) {
  cid = cid || 'consumable'; var prefix = cid === 'death_protection' ? 'death_effects[]' : 'on_consume_effects[]';
  var wrap = h('div', { class: 'k-effects' }), list = h('div', { class: 'k-sortlist' }), openIdx = -1;
  function draw() {
    clear(list);
    var arr = getList();
    arr.forEach(function (e, i) {
      var isOpen = openIdx === i;
      var row = xRow({ grip: true, chevron: true, icon: false, title: ceLabel(e.type), sub: ceSummary(e), onDelete: function () { arr.splice(i, 1); setList(arr); openIdx = -1; draw(); }, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; draw(); } });
      // Nested effect edits refresh this existing parent, not a stale/global head.
      // An empty result initially has no subtitle node, so create it on first edit.
      var head = row.firstChild;
      function summary() {
        var sub = head.querySelector('.s');
        if (!sub) { sub = h('div', { class: 's' }); head.querySelector('.tx').appendChild(sub); }
        sub.textContent = ceSummary(arr[i]);
      }
      if (isOpen) {
        var body = h('div', { class: 'k-xbody' });
        if (e.type === 'minecraft:apply_effects') {
          var probability = codecField(e, cid, 'probability', 1); if (e.probability === undefined) probability = Reg.codecDefault(cid, prefix + '.probability', 1);
          var prob = codecNumber(probability === undefined ? undefined : Math.round(probability * 100), { min: 0, max: 100, softMax: 100, step: 5, unit: '%', presets: [{ v: 100, label: I18n.t("cadeditor.ui.cards3.848adf26c6") }, { v: 50, label: '50%' }, { v: 10, label: '10%' }], onChange: function (n) { arr[i].probability = n / 100; setList(arr); summary(); } });
          var fx = kEffectList(function () { return arr[i].effects || (arr[i].effects = []); }, function (l) { arr[i].effects = l; setList(arr); summary(); }, { empty: I18n.t("cadeditor.ui.cards3.19f7ee3658") });
          body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.06c7b1b4c6"), prob.el)); body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.770a0d9868"), fx.el));
        } else if (e.type === 'minecraft:teleport_randomly') {
          var dia = codecNumber(e.diameter !== undefined ? e.diameter : Reg.codecDefault(cid, prefix + '.diameter', 16), { min: 0, max: 3.4e38, warnMax: 1000, warnWhy: I18n.t("cadeditor.ui.cards3.a1c42005ea"), softMax: 64, step: 1, unit: I18n.t("cadeditor.ui.cards2.06f2f8e0a8"), presets: [{ v: 16, label: '16' }, { v: 32, label: '32' }, { v: 128, label: '128' }], onChange: function (n) { arr[i].diameter = n; setList(arr); summary(); } });
          body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.7edac2a254"), dia.el, I18n.t("cadeditor.ui.cards3.a69839ca62")));
        } else if (e.type === 'minecraft:remove_effects') {
          var ids = Array.isArray(e.effects) ? e.effects.slice() : (e.effects ? [e.effects] : []);
          var chips = h('div', { class: 'k-chips' });
          (function paint() {
            clear(chips);
            ids.forEach(function (id, k) { var rn = Reg.nameOf('mob_effects', id) || (EFIDX[shortId(id)] || {}).name; var c = h('div', { class: 'k-chip on' }, [effectIcon(id, 16), rn || id]); var x = h('span', { class: 'x', text: ' ×' }); x.addEventListener('click', function (ev) { ev.stopPropagation(); ids.splice(k, 1); arr[i].effects = ids.slice(); setList(arr); paint(); summary(); }); c.appendChild(x); chips.appendChild(c); });
            var add = h('div', { class: 'k-chip' }, [uiIcon('plus', 12), I18n.t("cadeditor.ui.cards3.7a8a11ead5")]); activate(add, function () { var pres = {}; ids.forEach(function (x) { pres[Reg.full(x)] = 1; }); openEffectPicker({ present: pres, noParams: true, onConfirm: function (nids) { ids = nids.slice(); arr[i].effects = ids.slice(); setList(arr); paint(); summary(); } }); }); chips.appendChild(add);
          })();
          body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.223dcf8fc8"), chips));
        } else if (e.type === 'minecraft:play_sound') {
          body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.5e9d80d0e3"), kSoundField(typeof e.sound === 'string' ? e.sound : '', function (t) { arr[i].sound = t; setList(arr); }).el));
        } else body.appendChild(kHint(I18n.t("cadeditor.ui.cards3.09206baebb")));
        row.appendChild(body);
      }
      list.appendChild(row);
    });
    if (!arr.length) list.appendChild(xEmpty(I18n.t("cadeditor.ui.cards3.b3a24bcadc")));
  }
  kSortable(list, { onMove: function (from, to) { var arr = getList(); var x = arr.splice(from, 1)[0]; arr.splice(to, 0, x); setList(arr); openIdx = -1; draw(); } });
  var add = xAdd(I18n.t("cadeditor.ui.cards3.bf29cf43d2"));
  activate(add, function () {
    pickFrom(add, Reg.options('enum:consume_effect_type') || (Reg.preview() ? CE_TYPES : []), function (en) {
      var arr = getList(), e = { type: en.v };
      if (en.v === 'minecraft:apply_effects') { e.effects = []; } else if (en.v === 'minecraft:remove_effects') e.effects = []; else if (en.v === 'minecraft:play_sound') e.sound = '';
      arr.push(e); setList(arr); openIdx = arr.length - 1; draw();
    }, { width: 280, manual: { label: I18n.t("cadeditor.ui.cards3.0736ddb3ed"), parse: function (s) { return Reg.full(s); } } });
  });
  wrap.appendChild(h('div', { class: 'k-scrollbox tall' }, [list])); wrap.appendChild(add); draw();
  return { el: wrap, redraw: draw };
}
CARDS.consumeEffects = function () {
  var card = kCard({ id: 'consumefx', icon: 'flask', title: I18n.t("cadeditor.ui.cards3.7e19b6638d"), desc: I18n.t("cadeditor.ui.cards3.7be48554d4"), comps: ['consumable'], span: 2, toggle: false }, Ctx);
  var v = Ctx.get('consumable');
  if (!v) { card.el.classList.add('off'); card.el.querySelector('.k-cdesc').textContent = I18n.t("cadeditor.ui.cards3.116303b93d"); return card; }
  var ce = kConsumeEffects(function () { var o = Ctx.get('consumable') || {}; return (o.on_consume_effects || []).slice(); }, function (l) { var o = Ctx.get('consumable') || {}; o.on_consume_effects = l; Ctx.setSmart('consumable', o, { label: I18n.t("cadeditor.ui.cards3.fbf24b29e1") }); });
  card.body.appendChild(ce.el);
  return card;
};

CARDS.remainder = function () {
  var card = kCard({ id: 'remainder', icon: 'bucket', title: I18n.t("cadeditor.ui.cards3.8efbc9d497"), desc: I18n.t("cadeditor.ui.cards3.60df5719c6"), comps: ['use_remainder'] }, Ctx);
  var v = Ctx.get('use_remainder'), holder = h('div', { class: 'k-row wrap' });
  function put(o) { Ctx.setSmart('use_remainder', o, { label: I18n.t("cadeditor.ui.cards3.fee47d111b") }); }
  function draw() {
    clear(holder);
    var cur = Ctx.get('use_remainder');
    var btn = h('div', { class: 'k-btn' }, cur ? [itemIcon(cur.id, 20), h('span', { text: nameOfItem(cur.id) }), uiIcon('down', 10)] : [uiIcon('plus', 12), h('span', { text: I18n.t("cadeditor.ui.cards3.a1cf782ccd") })]);
    activate(btn, function () { pickItem(btn, function (id) { var o = Ctx.get('use_remainder') || { count: 1 }; o.id = fullId(id); if (!o.count) o.count = 1; put(o); draw(); }, { onStack: function (st) { NBT_FORCE.use_remainder = true; put(vaultNested(st)); draw(); } }); });
    holder.appendChild(btn);
    if (cur) {
      var cnt = kNumber(cur.count || 1, { min: 1, max: 99, noSlider: true, step: 1, unit: I18n.t("cadeditor.ui.cards3.3a116815bc"), onChange: function (n) { var o = Ctx.get('use_remainder'); o.count = n; put(o); } });
      holder.appendChild(cnt.el);
      holder.appendChild(kBtn(I18n.t("cadeditor.ui.cards3.174bbf8771"), function () { Ctx.disable('use_remainder', { structural: false }); draw(); }, { cls: 'dng' }));
    }
  }
  draw(); card.body.appendChild(holder);
  return card;
};

/* ---------- 药水 ---------- */
var POTION_IDS = ['water', 'mundane', 'thick', 'awkward', 'night_vision', 'invisibility', 'leaping', 'fire_resistance', 'swiftness', 'slowness', 'turtle_master', 'water_breathing', 'healing', 'harming', 'poison', 'regeneration', 'strength', 'weakness', 'luck', 'slow_falling', 'wind_charged', 'weaving', 'oozing', 'infested'];
var POTION_VARIANTS = { night_vision: 1, invisibility: 1, leaping: 2, fire_resistance: 1, swiftness: 2, slowness: 2, turtle_master: 2, water_breathing: 1, healing: 3, harming: 3, poison: 2, regeneration: 2, strength: 2, weakness: 1, slow_falling: 1 };
function potionEntries() {
  var out = [];
  POTION_IDS.forEach(function (p) {
    var name = (EDATA.L.potion[p] || p);
    out.push({ v: p, label: name, sub: 'minecraft:' + p });
    var vr = POTION_VARIANTS[p] || 0;
    if (vr === 1 || vr === 2) out.push({ v: 'long_' + p, label: I18n.t("cadeditor.ui.cards3.f3d47db8f1", (name)), sub: 'minecraft:long_' + p });
    if (vr === 2 || vr === 3) out.push({ v: 'strong_' + p, label: name + '（II）', sub: 'minecraft:strong_' + p });
  });
  return out;
}
function potionName(id) { var rn = Reg.nameOf2 && Reg.nameOf2('potion', id); if (rn) return rn; id = shortId(id || ''); var m = /^(long|strong)_(.+)$/.exec(id); var base = m ? m[2] : id; var n = EDATA.L.potion[base] || id; return n + (m ? (m[1] === 'long' ? I18n.t("cadeditor.ui.cards3.e4e0f8be37") : '（II）') : ''); }
function potionObj() { var v = Ctx.get('potion_contents'); if (v === undefined) return { custom_effects: [] }; if (typeof v === 'string') return { potion: v, custom_effects: [] }; return v; }
CARDS.potion = function () {
  var card = kCard({ id: 'potion', icon: itemIcon('potion', 18), title: I18n.t("cadeditor.ui.cards3.fb729c163d"), desc: I18n.t("cadeditor.ui.cards3.aea06599e0"), comps: ['potion_contents'], span: 2 }, Ctx);
  var v = potionObj();
  function put(fn) { var o = potionObj(); fn(o); if (!o.potion && (!o.custom_effects || !o.custom_effects.length) && o.custom_color === undefined && !o.custom_name) { Ctx.disable('potion_contents', { structural: false }); return; } var out = {}; if (o.potion) out.potion = o.potion; if (o.custom_color !== undefined) out.custom_color = o.custom_color; if (o.custom_effects && o.custom_effects.length) out.custom_effects = o.custom_effects; if (o.custom_name) out.custom_name = o.custom_name; Ctx.setSmart('potion_contents', out, { label: I18n.t("cadeditor.ui.cards3.fb729c163d") }); }
  var entries = potionEntries();
  var psel = kRegSelect({ reg: 'potion', value: v.potion ? Reg.full(v.potion) : '', title: I18n.t("cadeditor.ui.cards3.9967407087"), empty: I18n.t("cadeditor.ui.cards3.3abc3b4541"), allowClear: true, fallback: entries.map(function (e) { return { v: 'minecraft:' + e.v, label: e.label, sub: e.sub }; }), icon: function (e) { return itemIcon('potion', 16); }, onChange: function (x) { put(function (o) { if (x) o.potion = x; else delete o.potion; }); } });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.cc05a1373c"), psel.el));
  var col = kColor(typeof v.custom_color === 'number' ? v.custom_color : null, function (c) { put(function (o) { if (c === null) delete o.custom_color; else o.custom_color = c; }); }, { allowNone: true });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.a6bbde2603"), col.el, I18n.t("cadeditor.ui.cards3.ee0a02cf9f")));
  var fx = kEffectList(function () { return potionObj().custom_effects || []; }, function (l) { put(function (o) { o.custom_effects = l; }); }, { empty: I18n.t("cadeditor.ui.cards3.772f4f18b0") });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.9a71571acf"), fx.el, I18n.t("cadeditor.ui.cards3.0c3a3be882")));
  card.live.push(function () { var o = potionObj(); psel.set(o.potion ? Reg.full(o.potion) : ''); });
  return card;
};

CARDS.stew = function () {
  var card = kCard({ id: 'stew', icon: itemIcon('suspicious_stew', 18), title: I18n.t("cadeditor.ui.cards3.19fb51ff95"), desc: I18n.t("cadeditor.ui.cards3.c96906b6de"), comps: ['suspicious_stew_effects'], span: 2 }, Ctx);
  var fx = kEffectList(function () { return Ctx.get('suspicious_stew_effects') || []; }, function (l) { Ctx.setSmart('suspicious_stew_effects', l, { label: I18n.t("cadeditor.ui.cards3.c97b06a6a2") }); }, { mode: 'stew', empty: I18n.t("cadeditor.ui.cards3.aa1f7f93b8") });
  card.body.appendChild(fx.el);
  return card;
};

CARDS.deathProtection = function () {
  var card = kCard({ id: 'totem', icon: itemIcon('totem_of_undying', 18), title: I18n.t("cadeditor.ui.cards3.22f9a36306"), desc: I18n.t("cadeditor.ui.cards3.2655b73d55"), comps: ['death_protection'], span: 2 }, Ctx);
  var v = Ctx.get('death_protection');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards3.72fb01193e"), I18n.t("cadeditor.ui.cards3.32c6d9b514")], I18n.t("cadeditor.ui.cards3.8a632f3349"), function () { var effects = Ctx.protoItem('minecraft:totem_of_undying', 'death_protection'); if (effects === undefined) { toast(I18n.t("cadeditor.ui.cards3.4b40ad03b6"), 'warn'); return; } Ctx.enable('death_protection', effects, I18n.t("cadeditor.ui.cards3.8a632f3349")); });
  var ce = kConsumeEffects(function () { var o = Ctx.get('death_protection') || {}; return (o.death_effects || []).slice(); }, function (l) { var o = Ctx.get('death_protection') || {}; o.death_effects = l; Ctx.setSmart('death_protection', o, { label: I18n.t("cadeditor.ui.cards3.22f9a36306") }); }, 'death_protection');
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.6d4b546949"), ce.el));
  card.body.appendChild(kBtn(I18n.t("cadeditor.ui.cards3.504258685d"), function () { Ctx.disable('death_protection'); }, { cls: 'dng', icon: 'trash' }));
  return card;
};

/* ==================== 容器 ==================== */
var SLOT_COUNT = { chest: 27, trapped_chest: 27, barrel: 27, dispenser: 9, dropper: 9, crafter: 9, hopper: 5, furnace: 3, blast_furnace: 3, smoker: 3, brewing_stand: 5, chiseled_bookshelf: 6, decorated_pot: 1, campfire: 4, soul_campfire: 4 };
/* 容器格数：优先用游戏里真实的 Container 大小（item_meta.container_size）；仅浏览器样例预览使用内置表 */
function slotCountFor(id) { var m = Reg.live() ? Reg.itemMeta(id) : false; if (m && typeof m.container_size === 'number') return m.container_size; if (!Reg.preview()) return null; id = shortId(id); if (SLOT_COUNT[id] !== undefined) return SLOT_COUNT[id]; if (/shelf$/.test(id)) return 3; return 27; }
/* 收纳袋总容量：游戏里的归一化分数（item_meta.bundle_capacity），默认 1 */
function bundleCapacity() { var m = Reg.live() ? Reg.itemMeta(Ctx.doc().id) : false; return m && m.bundle_capacity && m.bundle_capacity.denominator ? m.bundle_capacity.numerator / m.bundle_capacity.denominator : (Reg.preview() ? 1 : null); }
function stackWeight(st) { var ms = protoOf(st.id).max_stack_size; if (typeof ms !== 'number') return Reg.preview() ? (st.count || 1) / 64 : null; return (st.count || 1) / ms; }
/* Native nested ItemStack -> editor wire, preserving per-value NBT references, removals and extension fields. */
function nestedItemWire(item) {
  var wire = { id:item.id, count:item.count || 1, comps:{}, removed:{}, component_snbt:{} };
  Object.keys(item.components || {}).forEach(function (key) {
    if (key.charAt(0) === '!') { nbtOwn(wire.removed, shortId(key.slice(1)), 1); return; }
    var cid = shortId(key), value = nbtTake(item.components, key);
    nbtOwn(wire.comps, cid, clone(value)); nbtOwn(wire.component_snbt, cid, nbtMerge(value, null));
  });
  return wire;
}
function editNestedStack(item, title, commit, refresh) {
  if (!item || !item.id) return;
  var valid = nestedDraftGuard(), original = clone(item);
  openNestedItem(nestedItemWire(item), { title:title,
    valid:valid,
    commit:function (wire) {
      var packed = vaultNested(wire), next = clone(original);
      next.id = packed.id; next.count = packed.count;
      if (packed.components) next.components = packed.components; else delete next.components;
      commit(next);
    },
    render:function () {
      if (refresh) refresh();
      if (!weActive() && Store.doc()) { drawHero(); drawTopbar(); drawFooter(); if (!NestedItem && typeof Drafts !== 'undefined') Drafts.touch(); }
    }
  });
}
CARDS.container = function () {
  var n = slotCountFor(Ctx.doc().id);
  var card = kCard({ id: 'container', icon: 'chest', title: I18n.t("cadeditor.ui.cards3.c6447c0254"), desc: I18n.t("cadeditor.ui.cards3.eb8b716c2c"), comps: ['container'], span: 2, value: function () { var l = Ctx.get('container'); return l && l.length ? I18n.t("cadeditor.ui.cards3.bcf61ea676", (l.length)) : ''; } }, Ctx);
  function list() { return Ctx.get('container') || []; }
  var knownSize = n !== null;
  n = Math.max(n || 0, list().reduce(function (max, e) { return Number.isInteger(e.slot) && e.slot >= 0 && e.slot < 256 ? Math.max(max, e.slot + 1) : max; }, 0));
  function save(l) { l.sort(function (a, b) { return a.slot - b.slot; }); if (!l.length) Ctx.disable('container', { structural: false }); else Ctx.setSmart('container', l, { label: I18n.t("cadeditor.ui.cards3.d20ef99801") }); }
  function stackAt(i) { var l = list(), r = null; l.forEach(function (e) { if (e.slot === i) r = e; }); return r; }
  /* 物品页存的是嵌套格式 {slot, item:{id,count,components}}；格子只认视图，这里做适配 */
  function viewOf(i) { var e = stackAt(i); return e ? { id: e.item.id, count: e.item.count, marked: !!e.item.components, _item: e.item } : null; }
  var grid;
  function edit(cell, i) {
    kStackPop(cell, viewOf(i), {
      closeOnPick: false, editLabel: I18n.t("cadeditor.ui.cards3.7f559289d4"),
      onEdit: stackAt(i) ? function () { editNestedStack(stackAt(i).item, I18n.t("cadeditor.ui.cards3.49bfa435c1", (i + 1)), function (next) { var l = list(); l.forEach(function (x) { if (x.slot === i) x.item = next; }); save(l); }, function () { grid.repaint(); }); } : null,
      onPick: function (id) { var l = list(), e = stackAt(i); if (e) { e.item.id = fullId(id); l = l.map(function (x) { return x.slot === i ? e : x; }); } else l.push({ slot: i, item: { id: fullId(id), count: 1 } }); save(l); grid.repaint(); },
      onStack: function (st) { var l = list(), item = vaultNested(st); NBT_FORCE.container = true; if (stackAt(i)) l = l.map(function (x) { return x.slot === i ? { slot: i, item: item } : x; }); else l.push({ slot: i, item: item }); save(l); grid.repaint(); },
      onCount: function (v) { var l = list(); l.forEach(function (x) { if (x.slot === i) x.item.count = v; }); save(l); grid.repaint(); },
      onClear: function () { save(list().filter(function (x) { return x.slot !== i; })); grid.repaint(); }
    });
  }
  var ix = []; for (var k0 = 0; k0 < n; k0++) ix.push(k0);
  grid = kSlotGrid({ indices: ix, cols: slotCols(n), col: 34, bare: true, plain: true, noSuffix: true, markTitle: I18n.t("cadeditor.ui.cards3.c3b51462a1"),
    stackOf: viewOf, titleOf: function (i) { return I18n.t("cadeditor.ui.cards3.2031d3f5fc", (i + 1)); }, edit: edit, redraw: function () { grid.repaint(); },
    menu: function (i, cell) {
      var e = stackAt(i);
      return [{ label: I18n.t("cadeditor.ui.cards3.71fc0d7bb2"), icon: 'edit', run: function () { edit(cell, i); } },
        { label: I18n.t("cadeditor.ui.cards3.635190d992"), icon: 'copy', dis: !e, run: function () { var l = list(); for (var k = 0; k < n; k++) { if (!stackAt(k)) { l.push({ slot: k, item: clone(e.item) }); break; } } save(l); grid.repaint(); } },
        { sep: 1 },
        { label: I18n.t("cadeditor.ui.common.clear"), icon: 'trash', danger: 1, dis: !e, run: function () { save(list().filter(function (x) { return x.slot !== i; })); grid.repaint(); } }];
    },
    ref: function (i) {
      return { group: card, i: i, get: function () { return viewOf(i); },
        set: function (st) { var l = list().filter(function (x) { return x.slot !== i; }); if (st && st.id && !st.empty) l.push({ slot: i, item: st._item ? clone(st._item) : { id: st.id, count: st.count || 1 } }); save(l); },
        swap: function (o) { var j = o.i, l = list(); l.forEach(function (x) { if (x.slot === i) x.slot = j; else if (x.slot === j) x.slot = i; }); save(l); } };
    } });
  card.live.push(function () { grid.repaint(); });

  card.body.appendChild(grid);
  if (!knownSize) {
    card.body.appendChild(kHint(I18n.t("cadeditor.ui.cards3.192241de14")));
    var manualSlot = 0, slotInput = kNumber(0, { min: 0, max: 255, step: 1, noSlider: true, onChange: function (v) { manualSlot = v; } });
    var manualEdit = kBtn(I18n.t("cadeditor.ui.cards3.362d804219"), function () { edit(manualEdit, manualSlot); });
    card.body.appendChild(h('div', { class: 'k-row' }, [slotInput.el, manualEdit]));
  }
  card.body.appendChild(kBtn(I18n.t("cadeditor.ui.cards3.b730d8da20"), function () { Ctx.disable('container', { structural: false }); grid.repaint(); }, { cls: 'dng', icon: 'trash' }));
  return card;
};

CARDS.bundle = function () {
  var initialCapacity = bundleCapacity();
  var card = kCard({ id: 'bundle', icon: 'bag', title: I18n.t("cadeditor.ui.cards3.d77e7441c1"), desc: initialCapacity === null ? I18n.t("cadeditor.ui.cards3.1acd3691ba") : I18n.t("cadeditor.ui.cards3.e1371e7a51", (fmtNum(initialCapacity))), comps: ['bundle_contents'], span: 2 }, Ctx);
  var row = h('div', { class: 'k-cgrid' }), bar = h('div', { class: 'k-meter' }, [h('i', {})]), eff = kEffect('');
  function list() { return Ctx.get('bundle_contents') || []; }
  function save(l) { if (!l.length) Ctx.disable('bundle_contents', { structural: false }); else Ctx.setSmart('bundle_contents', l, { label: I18n.t("cadeditor.ui.cards3.d77e7441c1") }); }
  function viewOf(i) { var st = list()[i]; return st ? { id: st.id, count: st.count, marked: false, _st: st } : null; }
  function draw() {
    var len = list().length, ix = []; for (var k = 0; k < len; k++) ix.push(k);
    var g = kSlotGrid({ indices: ix, bare: true, plain: true, noSuffix: true, stackOf: viewOf, redraw: draw,
      edit: function (cell, i) {
        var st = list()[i];
        kStackPop(cell, viewOf(i), { pick: false, plain: true, editLabel: I18n.t("cadeditor.ui.cards3.7f559289d4"), width: 230, maxHeight: null, countLabel: I18n.t("cadeditor.ui.cards3.d11903d17a", (nameOfItem(st.id))), clearLabel: I18n.t("cadeditor.ui.cards3.abb3912646"),
          onEdit: function () { editNestedStack(list()[i], I18n.t("cadeditor.ui.cards3.f0d3c42e34", (i + 1)), function (next) { var l = list(); l[i] = next; save(l); }, draw); },
          onCount: function (v) { var l = list(); l[i].count = v; save(l); draw(); },
          onClear: function () { var l = list(); l.splice(i, 1); save(l); draw(); } });
      },
      ref: function (i) {
        return { group: card, i: i, get: function () { return viewOf(i); },
          set: function (st) { var l = list(); if (!st || st.empty || !st.id) l.splice(i, 1); else l[i] = st._st ? clone(st._st) : { id: st.id, count: st.count || 1 }; save(l); },
          swap: function (o) { var l = list(), t = l[i]; l[i] = l[o.i]; l[o.i] = t; save(l); } };
      } });
    clear(row); while (g.firstChild) row.appendChild(g.firstChild);
    var add = h('div', { class: 'slot s34 addslot', title: I18n.t("cadeditor.ui.cards3.551be83e0b") }, [uiIcon('plus', 14)]);
    activate(add, function () { pickItem(add, function (id) { var l = list(); l.push({ id: fullId(id), count: 1 }); save(l); draw(); }, { onStack: function (st) { var l = list(); l.push(vaultNested(st)); NBT_FORCE.bundle_contents = true; save(l); draw(); } }); });
    row.appendChild(add);
    var cap = bundleCapacity(), weights = list().map(stackWeight);
    if (cap === null || weights.some(function (w) { return w === null; })) { bar.firstChild.style.width = '0%'; eff.set(I18n.t("cadeditor.ui.cards3.b2c173bd36"), ''); return; }
    var w = weights.reduce(function (s, weight) { return s + weight; }, 0) / cap;
    bar.firstChild.style.width = Math.min(100, w * 100) + '%'; bar.className = 'k-meter' + (w > 1 ? ' bad' : w > 0.85 ? ' warn' : '');
    eff.set(I18n.t("cadeditor.ui.cards3.dce0e0f5e3", (Math.round(w * 100)), (w > 1 ? I18n.t("cadeditor.ui.cards3.06ec1301c5") : '')), w > 1 ? 'warn' : '');
  }
  draw(); card.live.push(draw);
  card.body.appendChild(row); card.body.appendChild(bar); card.body.appendChild(eff.el);
  return card;
};

/* ==================== 书 ==================== */
CARDS.writtenBook = function () {
  var cid = 'written_book_content';
  var card = kCard({ id: 'wbook', icon: 'book_open', title: I18n.t("cadeditor.ui.cards3.496d55c49a"), desc: I18n.t("cadeditor.ui.cards3.0ae4b497f3"), comps: [cid], span: 2, value: function () { var v = Ctx.get(cid); return v && Array.isArray(v.pages) ? I18n.t("cadeditor.ui.cards3.b195fd33f5", (v.pages.length)) : ''; } }, Ctx);
  var v = Ctx.get(cid);
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards3.8d54f3ad87"), I18n.t("cadeditor.ui.cards3.56220aaa7b")], I18n.t("cadeditor.ui.cards3.fea223a3b4"), function () { Ctx.enable(cid, { title: I18n.t("cadeditor.ui.cards3.5144a9fbd0"), author: I18n.t("cadeditor.ui.cards3.b70bb4acc0"), generation: 0, pages: [I18n.t("cadeditor.ui.cards3.e59ae97924")] }, I18n.t("cadeditor.ui.cards3.9bb9dfa532")); });
  function put(fn, label) { var o = clone(Ctx.get(cid) || { pages: [] }); fn(o); Ctx.setSmart(cid, o, { label: label || I18n.t("cadeditor.ui.cards3.496d55c49a") }); }
  function rawTitle(t) { return typeof t === 'string' ? t : bookFiltered(t) && typeof t.raw === 'string' ? t.raw : ''; }
  var titleMax = function () { return Reg.codecFact(cid, ['$.title', '$.title.raw'], 'max_length', 32); };
  var title = kInput(rawTitle(v.title), function (t) { put(function (o) { if (bookFiltered(o.title)) o.title.raw = t; else o.title = t; }, I18n.t("cadeditor.ui.cards3.f409505430")); paintTitle(); }, { placeholder: I18n.t("cadeditor.ui.cards3.f409505430") });
  var titleCount = h('span', { class: 'k-rdcount' });
  function paintTitle() { var m = titleMax(), n = title.value.length; titleCount.textContent = n + (typeof m === 'number' ? ' / ' + m : m === undefined ? ' / …' : ''); titleCount.classList.toggle('bad', typeof m === 'number' && n > m); }
  var author = kInput(typeof v.author === 'string' ? v.author : '', function (t) { put(function (o) { o.author = t; }, I18n.t("cadeditor.ui.cards3.7d4146ca08")); }, { placeholder: I18n.t("cadeditor.ui.cards3.7d4146ca08") });
  var gen = kSeg([{ v: 0, label: I18n.t("cadeditor.ui.cards3.ec92abbb03") }, { v: 1, label: I18n.t("cadeditor.ui.cards3.bfe958dea6") }, { v: 2, label: I18n.t("cadeditor.ui.cards3.9874b0419c") }, { v: 3, label: I18n.t("cadeditor.ui.cards3.5462ce2d06") }], codecField(v, cid, 'generation', 0) || 0, function (x) { put(function (o) { o.generation = x; }, I18n.t("cadeditor.ui.cards3.2228b6cc41")); });
  setTip(gen.el, I18n.t("cadeditor.ui.cards3.4a53a7447b"));
  var resolved = codecToggle(codecField(v, cid, 'resolved', false), function (on) { put(function (o) { o.resolved = on; }, I18n.t("cadeditor.ui.cards3.769054c140")); }, I18n.t("cadeditor.ui.cards3.769054c140"));
  setTip(resolved.el, I18n.t("cadeditor.ui.cards3.fd246694b1"));
  card.body.appendChild(h('div', { class: 'k-book-meta' }, [
    h('label', { class: 'k-book-f' }, [h('span', { class: 'lt', text: I18n.t("cadeditor.ui.cards3.f409505430") }), title, titleCount]),
    h('label', { class: 'k-book-f' }, [h('span', { class: 'lt', text: I18n.t("cadeditor.ui.cards3.7d4146ca08") }), author]),
    h('div', { class: 'k-book-f' }, [h('span', { class: 'lt', text: I18n.t("cadeditor.ui.cards3.5f76b2bf82") }), gen.el, resolved.el])
  ]));
  if (bookFiltered(v.title) && v.title.filtered !== undefined) card.body.appendChild(kHint(I18n.t("cadeditor.ui.cards3.4145b86b61")));
  var book = kBookEditor({ kind: 'written', key: 'book:written',
    get: function () { var o = Ctx.get(cid); return o && o.pages; },
    save: function (pages, label) { put(function (o) { o.pages = pages; }, label); },
    maxPages: function () { var m = Reg.codecFact(cid, ['$.pages'], 'max_size', null); return typeof m === 'number' && m < 2147483647 ? m : null; } });
  card.body.appendChild(book.el);
  paintTitle();
  card.live.push(function () {
    var o = Ctx.get(cid); if (!o) return;
    if (document.activeElement !== title && title.value !== rawTitle(o.title)) title.value = rawTitle(o.title);
    if (document.activeElement !== author && author.value !== (o.author || '')) author.value = o.author || '';
    gen.set(codecField(o, cid, 'generation', 0) || 0); resolved.set(codecField(o, cid, 'resolved', false) === true);
    paintTitle(); book.refresh();
  });
  var off = Reg.on(function () { if (!document.body.contains(card.el)) { off(); return; } paintTitle(); book.refresh(); });
  return card;
};
CARDS.writableBook = function () {
  var cid = 'writable_book_content';
  var card = kCard({ id: 'wrbook', icon: 'book_open', title: I18n.t("cadeditor.ui.cards3.82ebdbb220"), desc: I18n.t("cadeditor.ui.cards3.29b7950fa1"), comps: [cid], span: 2, value: function () { var v = Ctx.get(cid); return v && Array.isArray(v.pages) ? I18n.t("cadeditor.ui.cards3.b195fd33f5", (v.pages.length)) : ''; } }, Ctx);
  var book = kBookEditor({ kind: 'writable', key: 'book:writable',
    get: function () { var o = Ctx.get(cid); return o && o.pages; },
    save: function (pages, label) { var o = clone(Ctx.get(cid) || {}); o.pages = pages; Ctx.setSmart(cid, o, { label: label || I18n.t("cadeditor.ui.cards3.302fdccde3") }); },
    maxPages: function () { return Reg.codecFact(cid, ['$.pages'], 'max_size', 100); },
    maxChars: function () { return Reg.codecFact(cid, ['$.pages[]', '$.pages[].raw'], 'max_length', 1024); } });
  card.body.appendChild(book.el);
  card.live.push(function () { book.refresh(); });
  var off = Reg.on(function () { if (!document.body.contains(card.el)) { off(); return; } book.refresh(); });
  return card;
};

/* ==================== 烟花 ==================== */
var FW_SHAPES = [{ v: 'small_ball', label: I18n.t("cadeditor.ui.cards3.5a28849b09") }, { v: 'large_ball', label: I18n.t("cadeditor.ui.cards3.8a3a0d5a9a") }, { v: 'star', label: I18n.t("cadeditor.ui.cards3.59983f97d2") }, { v: 'creeper', label: I18n.t("cadeditor.ui.cards3.3be2b94e58") }, { v: 'burst', label: I18n.t("cadeditor.ui.cards3.2feb96bee0") }];
function kColorList(list, onChange, addLabel) {
  var wrap = h('div', { class: 'k-chips' });
  var page = { page:0 }, pager = h('div', { class:'k-row wrap', style:'width:100%' });
  function draw() {
    clear(wrap);
    var range = kListPage(list.length, page, pager, draw);
    list.slice(range.start, range.end).forEach(function (c, index) {
      var i = range.start + index;
      var chip = h('div', { class: 'k-chip' }, [h('span', { class: 'k-colorchip small', style: 'background:' + hex6(c) }), hex6(c)]);
      activate(chip, function () { kColorPop(chip, c, function (n) { list[i] = n; onChange(list); draw(); }, { width: 270, extra: [kBtn(I18n.t("cadeditor.ui.cards3.b16b1c91b2"), function () { list.splice(i, 1); onChange(list); kPopClose(); draw(); }, { cls: 'dng', icon: 'trash' })] }); });
      wrap.appendChild(chip);
    });
    var add = h('div', { class: 'k-chip' }, [uiIcon('plus', 12), addLabel || I18n.t("cadeditor.ui.cards3.b357464a41")]);
    activate(add, function () { list.push(0xFF5555); page.page = Math.floor((list.length - 1) / 24); onChange(list); draw(); });
    wrap.appendChild(add);
    if (list.length > 24) wrap.appendChild(pager);
  }
  draw();
  return { el: wrap };
}
function explosionEditor(ex, onChange) {
  var box = h('div', { class: 'k-xbody' });
  var shape = combo({ options: function () { return Reg.codecOptions('firework_explosion', 'shape', FW_SHAPES); }, value: ex.shape || '', free: true, placeholder: I18n.t("cadeditor.ui.cards3.126e741d71"), onPick: function (x) { ex.shape = x; onChange(); } });
  var colors = kColorList(codecField(ex, 'firework_explosion', 'colors', []) || [], function (l) { ex.colors = l; onChange(); });
  var fade = kColorList(codecField(ex, 'firework_explosion', 'fade_colors', []) || [], function (l) { ex.fade_colors = l; onChange(); }, I18n.t("cadeditor.ui.cards3.0be2370d7e"));
  var tr = codecToggle(codecField(ex, 'firework_explosion', 'has_trail', false), function (on) { ex.has_trail = on; onChange(); }, I18n.t("cadeditor.ui.cards3.bc25b56f74")), tw = codecToggle(codecField(ex, 'firework_explosion', 'has_twinkle', false), function (on) { ex.has_twinkle = on; onChange(); }, I18n.t("cadeditor.ui.cards3.d92003913f"));
  box.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.c2f71c1b10"), shape)); box.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.c8c7144710"), colors.el, I18n.t("cadeditor.ui.cards3.db47234d03"))); box.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.6424e5b3b9"), fade.el, I18n.t("cadeditor.ui.cards3.bc10006e40"))); box.appendChild(h('div', { class: 'k-row wrap' }, [tr.el, tw.el]));
  return box;
}
CARDS.fireworks = function () {
  var card = kCard({ id: 'fireworks', icon: itemIcon('firework_rocket', 18), title: I18n.t("cadeditor.ui.cards3.23f9a84909"), desc: I18n.t("cadeditor.ui.cards3.8b75d98226"), comps: ['fireworks'], span: 2 }, Ctx);
  var v = Ctx.get('fireworks') || {};
  function put(fn) { var o = Ctx.get('fireworks') || {}; fn(o); Ctx.setSmart('fireworks', o, { label: I18n.t("cadeditor.ui.cards3.bbe5bc4a74") }); }
  var fd = codecNumber(codecField(v, 'fireworks', 'flight_duration', 1), { min: 0, max: 255, softMax: 5, step: 1, presets: [{ v: 1, label: I18n.t("cadeditor.ui.cards3.13b1954589") }, { v: 2, label: '2' }, { v: 3, label: I18n.t("cadeditor.ui.cards3.b3cf144fd9") }], onChange: function (n) { put(function (o) { o.flight_duration = n; }); } });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.05ca08ca6f"), fd.el, I18n.t("cadeditor.ui.cards3.5066dc3d02")));
  var list = h('div', { class: 'k-sortlist' }), openIdx = -1, page = { page:0 }, pager = h('div', { class:'k-row wrap' });
  function draw() {
    clear(list);
    var o = Ctx.get('fireworks') || { explosions: [] };
    var entries = o.explosions || [], range = kListPage(entries.length, page, pager, draw);
    entries.slice(range.start, range.end).forEach(function (ex, index) {
      var i = range.start + index;
      var isOpen = openIdx === i;
      var row = xRow({ grip: true, chevron: true, icon: false, title: I18n.t("cadeditor.ui.cards3.a8f0487a9c", (i + 1), ((FW_SHAPES.filter(function (s) { return s.v === ex.shape; })[0] || { label: '?' }).label)), sub: I18n.t("cadeditor.ui.cards3.67f8d0443f", ((ex.colors || []).length), (ex.has_trail ? I18n.t("cadeditor.ui.cards3.9171dd64ca") : ''), (ex.has_twinkle ? I18n.t("cadeditor.ui.cards3.e1105395c8") : '')), onDelete: function () { put(function (oo) { oo.explosions.splice(i, 1); }); openIdx = -1; draw(); }, open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; draw(); } });
      if (isOpen) { var ed = explosionEditor(ex, function () { put(function (oo) { oo.explosions[i] = ex; }); }); row.appendChild(ed); }
      list.appendChild(row);
    });
    if (!(o.explosions || []).length) list.appendChild(xEmpty(I18n.t("cadeditor.ui.cards3.0331e7cdc4")));
  }
  kSortable(list, { onMove: function (from, to) { from += page.page * 24; to += page.page * 24; put(function (o) { var x = o.explosions.splice(from, 1)[0]; o.explosions.splice(to, 0, x); }); openIdx = -1; draw(); } });
  var add = xAdd(I18n.t("cadeditor.ui.cards3.aa27e7964c"));
  activate(add, function () { pickFrom(add, Reg.codecOptions('firework_explosion', 'shape', FW_SHAPES), function (entry) { put(function (o) { (o.explosions = o.explosions || []).push({ shape: entry.v, colors: [0xFF5555] }); }); openIdx = (Ctx.get('fireworks').explosions || []).length - 1; page.page = Math.floor(openIdx / 24); draw(); }, { manual: { label: I18n.t("cadeditor.ui.cards3.eed9f151eb"), parse: function (t) { return t; } } }); });
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.3bf25a5dda"), h('div', { class: 'k-scrollbox tall' }, [list]))); card.body.appendChild(pager); card.body.appendChild(add); draw();
  return card;
};
CARDS.fireworkStar = function () {
  var card = kCard({ id: 'fwstar', icon: itemIcon('firework_star', 18), title: I18n.t("cadeditor.ui.cards3.78667de414"), desc: I18n.t("cadeditor.ui.cards3.bb0361bb0b"), comps: ['firework_explosion'], span: 2 }, Ctx);
  var v = Ctx.get('firework_explosion');
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards3.1fb4a702c8"), I18n.t("cadeditor.ui.cards3.36ce8c713c")], I18n.t("cadeditor.ui.cards3.05a1e354d0"), function () { pickFrom(card.body, Reg.codecOptions('firework_explosion', 'shape', FW_SHAPES), function (entry) { Ctx.enable('firework_explosion', { shape: entry.v, colors: [0xFF5555] }, I18n.t("cadeditor.ui.cards3.6907787f51")); }, { manual: { label: I18n.t("cadeditor.ui.cards3.eed9f151eb"), parse: function (t) { return t; } } }); });
  var ex = clone(v);
  var box = explosionEditor(ex, function () { Ctx.setSmart('firework_explosion', clone(ex), { label: I18n.t("cadeditor.ui.cards3.78667de414") }); });
  card.body.appendChild(box);
  return card;
};


/* ==================== 使用时的行为（use_effects）：三项设置，不再用通用表单 ==================== */
CARDS.useEffects = function () {
  var cid = 'use_effects';
  var card = kCard({ id: 'use-effects', icon: 'play', title: I18n.t("cadeditor.ui.cards3.c9fac3ce4f"), desc: I18n.t("cadeditor.ui.cards3.d345781529"), comps: [cid], toggle: true }, Ctx);
  var v = Ctx.get(cid);
  if (!v) return enableBox(card, [I18n.t("cadeditor.ui.cards3.34bfae4723"), I18n.t("cadeditor.ui.cards3.3eccc3c95b")], I18n.t("cadeditor.ui.common.enabled"), function () { Ctx.enable(cid, {}, I18n.t("cadeditor.ui.cards3.ede775088c")); });
  function put(fn, label) { var o = clone(Ctx.get(cid) || {}); fn(o); Ctx.setSmart(cid, o, { label: label || I18n.t("cadeditor.ui.cards3.b0cfc0cffa") }); }
  var sprint = codecToggle(codecField(v, 'use_effects', 'can_sprint', false), function (on) { put(function (o) { o.can_sprint = on; }, I18n.t("cadeditor.ui.cards3.f5f3bb076f")); }, I18n.t("cadeditor.ui.cards3.75ffc33b70"));
  var vib = codecToggle(codecField(v, 'use_effects', 'interact_vibrations', true), function (on) { put(function (o) { o.interact_vibrations = on; }, I18n.t("cadeditor.ui.cards3.c7ff88653b")); }, I18n.t("cadeditor.ui.cards3.695202b894"));
  var spd = codecNumber(codecField(v, 'use_effects', 'speed_multiplier', 0.2), { min: 0, max: 1, step: 0.05, dec: 2, unit: I18n.t("cadeditor.ui.cards2.16729fb40a"), presets: [{ v: 0, label: I18n.t("cadeditor.ui.cards3.f2739eeb4d") }, { v: 0.2, label: '0.2' }, { v: 0.5, label: '0.5' }, { v: 1, label: I18n.t("cadeditor.ui.cards3.1fc7ad1de3") }], onChange: function (n) { put(function (o) { o.speed_multiplier = n; }, I18n.t("cadeditor.ui.cards3.74997757d7")); } });
  card.body.appendChild(sprint.el); card.body.appendChild(vib.el);
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.cards3.dc7a2b005f"), spd.el));
  card.live.push(function () { var o = Ctx.get(cid) || {}; sprint.set(codecField(o, 'use_effects', 'can_sprint', false) === true); vib.set(codecField(o, 'use_effects', 'interact_vibrations', true) === true); spd.set(codecField(o, 'use_effects', 'speed_multiplier', 0.2)); });
  return card;
};

regEnumTable('use_animation', ANIMS, function (x) { return x[0]; }, function (id, n) { return [id, n, 'grid']; });
regEnumTable('firework_shape', FW_SHAPES, function (x) { return x.v; }, function (id, n) { return { v: id, label: n }; });
regEnumTable('consume_effect_type', CE_TYPES, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, sub: '' }; });
