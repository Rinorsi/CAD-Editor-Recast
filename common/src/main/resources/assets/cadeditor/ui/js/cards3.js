/* 卡片库 · 第三部分：食物 / 药水 / 效果、容器、书本、烟花 */

/* ---------- 时长 ---------- */
function fmtDur(ticks) {
  if (ticks < 0) return '无限';
  var s = ticks / 20, m = Math.floor(s / 60), r = Math.round(s - m * 60);
  if (s >= 3600) return Math.floor(s / 3600) + ' 小时 ' + Math.floor((s % 3600) / 60) + ' 分';
  return m + ':' + (r < 10 ? '0' : '') + r;
}
var EFFECT_KIND_COLOR = { '正面': '#7ed957', '负面': '#ff6b6b', '中性': '#ffd166' };
function effectEntries() {
  return EDATA.effects.map(function (e) { return { v: e.id, label: e.name, sub: e.kind + (e.desc ? ' · ' + e.desc : ''), icon: function () { return effectIcon(e.id, 20); } }; });
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
      var row = xRow({ grip: true, chevron: true, icon: effectIcon(id, 22), title: (info ? info.name : id) + (full && lvl > 1 ? ' ' + levelText(lvl) : ''), sub: (info ? info.kind : '模组效果') + ' · ' + fmtDur(dur), open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; draw(); } });
      var head = row.firstChild;
      if (isOpen) {
        var body = h('div', { class: 'k-xbody' });
        if (full) {
          var lv = kNumber(lvl, { min: 1, max: 256, warnMax: 256, softMax: 10, step: 1, noSlider: false, presets: [{ v: 1, label: 'I' }, { v: 2, label: 'II' }, { v: 3, label: 'III' }, { v: 5, label: 'V' }, { v: 10, label: 'X' }, { v: 256, label: '256' }], onChange: function (n) { arr[i].amplifier = n - 1; setList(arr); head.querySelector('.z').textContent = (info ? info.name : id) + (n > 1 ? ' ' + levelText(n) : ''); } });
          body.appendChild(fieldRow('效果等级', lv.el, '输入 1 表示 I 级'));
        }
        var inf = fx.duration === -1;
        var secs = kNumber(inf ? 30 : dur / 20, { min: 0, max: 1e8, softMax: 600, step: 1, dec: 2, unit: '秒', presets: [{ v: 3, label: '3秒' }, { v: 8, label: '8秒' }, { v: 30, label: '30秒' }, { v: 90, label: '1:30' }, { v: 180, label: '3:00' }, { v: 480, label: '8:00' }, { v: 1800, label: '30分' }], onChange: function (n) { arr[i].duration = Math.round(n * 20); setList(arr); head.querySelector('.s').textContent = (info ? info.kind : '模组效果') + ' · ' + fmtDur(arr[i].duration); } });
        var infTg = kToggle(inf, function (on) { arr[i].duration = on ? -1 : 600; setList(arr); draw(); }, '永久持续（不会消失）');
        if (!inf) body.appendChild(fieldRow('持续时间', secs.el, '游戏内以刻计，20 刻 = 1 秒'));
        body.appendChild(h('div', { class: 'k-fxlist' }, [infTg.el]));
        if (full) {
          var t1 = kToggle(fx.show_particles !== false, function (on) { arr[i].show_particles = on; setList(arr); }, '显示粒子');
          var t2 = kToggle(fx.show_icon !== false && (fx.show_icon === undefined ? fx.show_particles !== false : fx.show_icon), function (on) { arr[i].show_icon = on; setList(arr); }, '在屏幕角落显示效果图标');
          var t3 = kToggle(!!fx.ambient, function (on) { arr[i].ambient = on; setList(arr); }, '信标式（粒子更淡）');
          body.appendChild(h('div', { class: 'k-fxlist' }, [t1.el, t2.el, t3.el]));
        }
        body.appendChild(kBtn('删除这个效果', function () { arr.splice(i, 1); setList(arr); openIdx = -1; draw(); }, { cls: 'dng', icon: 'trash' }));
        row.appendChild(body);
      }
      onContext(row, function () { return [{ label: '复制', icon: 'copy', run: function () { arr.splice(i + 1, 0, clone(fx)); setList(arr); draw(); } }, { sep: 1 }, { label: '删除', icon: 'trash', danger: 1, run: function () { arr.splice(i, 1); setList(arr); draw(); } }]; });
      list.appendChild(row);
    });
    if (!arr.length) list.appendChild(xEmpty(o.empty || '还没有效果'));
  }
  kSortable(list, { onMove: function (from, to) { var arr = getList(); var x = arr.splice(from, 1)[0]; arr.splice(to, 0, x); setList(arr); openIdx = -1; draw(); } });
  var add = xAdd('添加状态效果');
  activate(add, function () {
    var present = {}; getList().forEach(function (fx) { present[Reg.full(fx.id)] = 1; });
    openEffectPicker({ present: present, full: full, onConfirm: function (ids, vals) {
      var arr = getList(); ids.forEach(function (id) { var v = (vals && vals[id]) || {}, ticks = Math.max(1, Math.round((v.seconds || (full ? 30 : 8)) * 20)); arr.push(full ? { id: id, amplifier: Math.max(0, (v.level || 1) - 1), duration: ticks, show_particles: true } : { id: id, duration: ticks }); });
      setList(arr); openIdx = arr.length - 1; draw();
    } });
  });
  wrap.appendChild(h('div', { class: 'k-scrollbox tall' }, [list])); wrap.appendChild(add);
  draw();
  return { el: wrap, redraw: draw };
}

/* ---------- 食物 ---------- */
CARDS.food = function () {
  var card = kCard({ id: 'food', icon: itemIcon('cooked_beef', 18), title: '食物', desc: '吃下去恢复多少饥饿值和饱和度', comps: ['food'], value: function () { var f = Ctx.get('food'); return f ? bigOrNum(f.nutrition) + ' 饥饿点' : ''; } }, Ctx);
  var v = Ctx.get('food');
  if (!v) return enableBox(card, ['这个物品不能吃', '启用后可以右键食用，恢复饥饿值。（还需要在「食用行为」里设置怎么吃）'], '让它可以吃', function () { Ctx.enable('food', { nutrition: 4, saturation: 2.4, can_always_eat: false }, '让它可以吃'); });
  function put(k, val) { var o = Ctx.get('food') || { nutrition: 4, saturation: 2.4 }; o[k] = val; Ctx.setSmart('food', o, { label: '食物' }); }
  var bar = iconBar('k-food');
  var nut = kNumber(v.nutrition, { min: 0, max: 2147483647, softMax: 20, step: 1, big: true, unit: '点', presets: [{ v: 1, label: '1' }, { v: 2, label: '2 苹果' }, { v: 5, label: '5 面包' }, { v: 8, label: '8 熟牛排' }, { v: 20, label: '20 吃饱' }], onChange: function (n) { put('nutrition', n); } });
  var sat = kNumber(v.saturation, { min: -3.4e38, max: 3.4e38, softMax: 20, step: 0.5, dec: 2, unit: '点', presets: [{ v: 0, label: '0' }, { v: 2.4, label: '2.4 苹果' }, { v: 6, label: '6' }, { v: 12.8, label: '12.8 熟牛排' }, { v: 20, label: '20' }], onChange: function (n) { put('saturation', n); } });
  var always = kToggle(!!v.can_always_eat, function (on) { put('can_always_eat', on); }, '饱腹时也能吃（像金苹果）');
  var eff = kEffect('');
  card.body.appendChild(fieldRow('恢复饥饿值', nut.el, '每 2 点 = 一个鸡腿'));
  card.body.appendChild(bar.el);
  card.body.appendChild(fieldRow('恢复饱和度', sat.el, '饱和度越高，饱腹感越持久'));
  card.body.appendChild(always.el); card.body.appendChild(eff.el);
  card.live.push(function () {
    var f = Ctx.get('food'); if (!f) return; nut.set(f.nutrition); sat.set(f.saturation); always.set(!!f.can_always_eat);
    bar.set(Math.max(0, f.nutrition), 10);
    eff.set('吃一口：饥饿条 +' + bigOrNum(f.nutrition) + '（' + bigOrNum(f.nutrition / 2) + ' 个鸡腿），饱和度 +' + bigOrNum(f.saturation) + (f.nutrition >= 20 ? '；一口就能吃饱' : ''));
  });
  return card;
};

var ANIMS = [['none', '无', 'close'], ['eat', '吃', 'apple'], ['drink', '喝', 'potion_round'], ['block', '举盾', 'shield'], ['bow', '拉弓', 'bow'], ['trident', '投掷', 'trident'], ['spear', '突刺', 'spear'], ['crossbow', '装填', 'crossbow'], ['spyglass', '望远', 'eye'], ['toot_horn', '吹号', 'horn'], ['brush', '刷', 'brush'], ['bundle', '收纳袋', 'bag']];
var SOUNDS = [{ v: 'minecraft:entity.generic.eat', label: '吃东西' }, { v: 'minecraft:entity.generic.drink', label: '喝东西' }, { v: 'minecraft:item.honey_bottle.drink', label: '喝蜂蜜' }, { v: 'minecraft:entity.player.burp', label: '打嗝' }, { v: 'minecraft:entity.strider.eat', label: '炽足兽吃' }, { v: 'minecraft:entity.fox.eat', label: '狐狸吃' }];
CARDS.consumable = function () {
  var card = kCard({ id: 'consume', icon: itemIcon('golden_apple', 18), title: '食用 / 使用行为', desc: '按住右键多久、什么动作、什么声音', comps: ['consumable'], span: 2 }, Ctx);
  var v = Ctx.get('consumable');
  if (!v) return enableBox(card, ['这个物品不能"使用"', '启用后，按住右键会有使用动作，结束时触发效果。'], '让它可以使用', function () { Ctx.enable('consumable', { consume_seconds: 1.6, animation: 'eat', has_consume_particles: true, on_consume_effects: [] }, '让它可以使用'); });
  function put(fn, label) { var o = Ctx.get('consumable') || {}; fn(o); Ctx.setSmart('consumable', o, { label: label || '使用行为' }); }
  var secs = kNumber(v.consume_seconds === undefined ? 1.6 : v.consume_seconds, { min: 0, max: 3.4e38, softMax: 10, step: 0.1, dec: 2, big: true, unit: '秒', presets: [{ v: 0.8, label: '0.8 快吃' }, { v: 1.6, label: '1.6 默认' }, { v: 3.2, label: '3.2' }, { v: 5, label: '5' }, { v: 30, label: '30' }], onChange: function (n) { put(function (o) { o.consume_seconds = n; }, '食用时长'); } });
  var anim = kTiles(ANIMS.map(function (a) { return { v: a[0], label: a[1], icon: function () { return uiIcon(a[2], 20); } }; }), v.animation || 'eat', function (x) { put(function (o) { o.animation = x; }, '使用动作'); }, { cols: 6 });
  var snd = kSoundField(typeof v.sound === 'string' ? v.sound : 'minecraft:entity.generic.eat', function (x) { put(function (o) { o.sound = x; }, '使用声音'); });
  var part = kToggle(v.has_consume_particles !== false, function (on) { put(function (o) { o.has_consume_particles = on; }); }, '使用时冒出粒子');
  card.body.appendChild(fieldRow('按住右键多久', secs.el));
  card.body.appendChild(fieldRow('动作', anim.el));
  card.body.appendChild(fieldRow('声音', snd.el));
  card.body.appendChild(part.el);
  card.live.push(function () { var o = Ctx.get('consumable'); if (o) { secs.set(o.consume_seconds === undefined ? 1.6 : o.consume_seconds); anim.set(o.animation || 'eat'); part.set(o.has_consume_particles !== false); } });
  return card;
};

/* ---------- 使用结束后的效果 ---------- */
var CE_TYPES = [{ v: 'minecraft:apply_effects', label: '获得状态效果', sub: '例如金苹果的再生、吸收' }, { v: 'minecraft:remove_effects', label: '移除指定效果', sub: '例如牛奶清除某些效果' }, { v: 'minecraft:clear_all_effects', label: '清除所有效果', sub: '牛奶' }, { v: 'minecraft:teleport_randomly', label: '随机传送', sub: '紫颂果' }, { v: 'minecraft:play_sound', label: '播放音效', sub: '' }];
function ceLabel(t) { for (var i = 0; i < CE_TYPES.length; i++) if (CE_TYPES[i].v === t) return CE_TYPES[i].label; return t; }
function ceSummary(e) {
  if (e.type === 'minecraft:apply_effects') { var n = (e.effects || []).map(function (x) { var i = EFIDX[shortId(x.id || '')]; return (i ? i.name : shortId(x.id || '?')) + (x.amplifier ? ' ' + levelText(x.amplifier + 1) : ''); }); return n.join('、') + (e.probability !== undefined && e.probability < 1 ? '（' + Math.round(e.probability * 100) + '% 概率）' : ''); }
  if (e.type === 'minecraft:teleport_randomly') return '半径约 ' + fmtNum((e.diameter === undefined ? 16 : e.diameter) / 2) + ' 格';
  if (e.type === 'minecraft:remove_effects') { var r = e.effects; var l = Array.isArray(r) ? r : [r]; return l.map(function (x) { var i = EFIDX[shortId(typeof x === 'string' ? x : '')]; return i ? i.name : String(x); }).join('、'); }
  if (e.type === 'minecraft:play_sound') return typeof e.sound === 'string' ? e.sound : '自定义音效';
  return '';
}
function kConsumeEffects(getList, setList) {
  var wrap = h('div', { class: 'k-effects' }), list = h('div', { class: 'k-sortlist' }), openIdx = -1;
  function draw() {
    clear(list);
    var arr = getList();
    arr.forEach(function (e, i) {
      var isOpen = openIdx === i;
      var row = xRow({ grip: true, chevron: true, icon: false, title: ceLabel(e.type), sub: ceSummary(e), open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; draw(); } });
      if (isOpen) {
        var body = h('div', { class: 'k-xbody' });
        if (e.type === 'minecraft:apply_effects') {
          var prob = kNumber(Math.round((e.probability === undefined ? 1 : e.probability) * 100), { min: 0, max: 100, softMax: 100, step: 5, unit: '%', presets: [{ v: 100, label: '必定' }, { v: 50, label: '50%' }, { v: 10, label: '10%' }], onChange: function (n) { arr[i].probability = n / 100; setList(arr); head.querySelector('.s').textContent = ceSummary(arr[i]); } });
          var fx = kEffectList(function () { return arr[i].effects || (arr[i].effects = []); }, function (l) { arr[i].effects = l; setList(arr); head.querySelector('.s').textContent = ceSummary(arr[i]); }, { empty: '还没有效果，点下面添加' });
          body.appendChild(fieldRow('触发概率', prob.el)); body.appendChild(fieldRow('获得的效果', fx.el));
        } else if (e.type === 'minecraft:teleport_randomly') {
          var dia = kNumber(e.diameter === undefined ? 16 : e.diameter, { min: 0, max: 3.4e38, warnMax: 1000, warnWhy: '过大的范围可能找不到落脚点', softMax: 64, step: 1, unit: '格', presets: [{ v: 16, label: '16 默认' }, { v: 32, label: '32' }, { v: 128, label: '128' }], onChange: function (n) { arr[i].diameter = n; setList(arr); head.querySelector('.s').textContent = ceSummary(arr[i]); } });
          body.appendChild(fieldRow('传送区域直径', dia.el, '以当前位置为中心'));
        } else if (e.type === 'minecraft:remove_effects') {
          var ids = Array.isArray(e.effects) ? e.effects.slice() : (e.effects ? [e.effects] : []);
          var chips = h('div', { class: 'k-chips' });
          (function paint() {
            clear(chips);
            ids.forEach(function (id, k) { var rn = Reg.nameOf('mob_effects', id) || (EFIDX[shortId(id)] || {}).name; var c = h('div', { class: 'k-chip on' }, [effectIcon(id, 16), rn || id]); var x = h('span', { class: 'x', text: ' ×' }); x.addEventListener('click', function (ev) { ev.stopPropagation(); ids.splice(k, 1); arr[i].effects = ids.slice(); setList(arr); paint(); head.querySelector('.s').textContent = ceSummary(arr[i]); }); c.appendChild(x); chips.appendChild(c); });
            var add = h('div', { class: 'k-chip' }, [uiIcon('plus', 12), '添加']); activate(add, function () { var pres = {}; ids.forEach(function (x) { pres[Reg.full(x)] = 1; }); openEffectPicker({ present: pres, noParams: true, onConfirm: function (nids) { nids.forEach(function (x) { ids.push(x); }); arr[i].effects = ids.slice(); setList(arr); paint(); head.querySelector('.s').textContent = ceSummary(arr[i]); } }); }); chips.appendChild(add);
          })();
          body.appendChild(fieldRow('要移除的效果', chips));
        } else if (e.type === 'minecraft:play_sound') {
          body.appendChild(fieldRow('音效', kSoundField(typeof e.sound === 'string' ? e.sound : '', function (t) { arr[i].sound = t; setList(arr); }).el));
        } else body.appendChild(kHint('这一项没有额外设置。'));
        body.appendChild(kBtn('删除这一项', function () { arr.splice(i, 1); setList(arr); openIdx = -1; draw(); }, { cls: 'dng', icon: 'trash' }));
        row.appendChild(body);
      }
      list.appendChild(row);
    });
    if (!arr.length) list.appendChild(xEmpty('使用结束时什么都不发生'));
  }
  kSortable(list, { onMove: function (from, to) { var arr = getList(); var x = arr.splice(from, 1)[0]; arr.splice(to, 0, x); setList(arr); openIdx = -1; draw(); } });
  var add = xAdd('添加一种结果');
  activate(add, function () {
    pickFrom(add, CE_TYPES, function (en) {
      var arr = getList(), e = { type: en.v };
      if (en.v === 'minecraft:apply_effects') { e.effects = []; e.probability = 1; } else if (en.v === 'minecraft:remove_effects') e.effects = []; else if (en.v === 'minecraft:teleport_randomly') e.diameter = 16; else if (en.v === 'minecraft:play_sound') e.sound = 'minecraft:entity.player.burp';
      arr.push(e); setList(arr); openIdx = arr.length - 1; draw();
    }, { width: 280 });
  });
  wrap.appendChild(h('div', { class: 'k-scrollbox tall' }, [list])); wrap.appendChild(add); draw();
  return { el: wrap, redraw: draw };
}
CARDS.consumeEffects = function () {
  var card = kCard({ id: 'consumefx', icon: 'flask', title: '使用结束时的效果', desc: '吃完 / 喝完的那一刻会发生什么', comps: ['consumable'], span: 2, toggle: false }, Ctx);
  var v = Ctx.get('consumable');
  if (!v) { card.el.classList.add('off'); card.el.querySelector('.k-cdesc').textContent = '先打开「食用 / 使用行为」，才能设置这里'; return card; }
  var ce = kConsumeEffects(function () { var o = Ctx.get('consumable') || {}; return (o.on_consume_effects || []).slice(); }, function (l) { var o = Ctx.get('consumable') || {}; o.on_consume_effects = l; Ctx.setSmart('consumable', o, { label: '使用效果' }); });
  card.body.appendChild(ce.el);
  return card;
};

CARDS.remainder = function () {
  var card = kCard({ id: 'remainder', icon: 'bucket', title: '使用后剩下', desc: '用完之后留下的东西（如喝完药水剩玻璃瓶）', comps: ['use_remainder'] }, Ctx);
  var v = Ctx.get('use_remainder'), holder = h('div', { class: 'k-row wrap' });
  function put(o) { Ctx.setSmart('use_remainder', o, { label: '使用后剩余' }); }
  function draw() {
    clear(holder);
    var cur = Ctx.get('use_remainder');
    var btn = h('div', { class: 'k-btn' }, cur ? [itemIcon(cur.id, 20), h('span', { text: nameOfItem(cur.id) }), uiIcon('down', 10)] : [uiIcon('plus', 12), h('span', { text: '选择剩下的物品' })]);
    activate(btn, function () { pickItem(btn, function (id) { var o = Ctx.get('use_remainder') || { count: 1 }; o.id = fullId(id); if (!o.count) o.count = 1; put(o); draw(); }, { onStack: function (st) { NBT_FORCE.use_remainder = true; put(vaultNested(st)); draw(); } }); });
    holder.appendChild(btn);
    if (cur) {
      var cnt = kNumber(cur.count || 1, { min: 1, max: 99, noSlider: true, step: 1, unit: '个', onChange: function (n) { var o = Ctx.get('use_remainder'); o.count = n; put(o); } });
      holder.appendChild(cnt.el);
      holder.appendChild(kBtn('不剩东西', function () { Ctx.disable('use_remainder', { structural: false }); draw(); }, { cls: 'dng' }));
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
    if (vr === 1 || vr === 2) out.push({ v: 'long_' + p, label: name + '（延长）', sub: 'minecraft:long_' + p });
    if (vr === 2 || vr === 3) out.push({ v: 'strong_' + p, label: name + '（II）', sub: 'minecraft:strong_' + p });
  });
  return out;
}
function potionName(id) { var rn = Reg.nameOf2 && Reg.nameOf2('potion', id); if (rn) return rn; id = shortId(id || ''); var m = /^(long|strong)_(.+)$/.exec(id); var base = m ? m[2] : id; var n = EDATA.L.potion[base] || id; return n + (m ? (m[1] === 'long' ? '（延长）' : '（II）') : ''); }
function potionObj() { var v = Ctx.get('potion_contents'); if (v === undefined) return { custom_effects: [] }; if (typeof v === 'string') return { potion: v, custom_effects: [] }; return v; }
CARDS.potion = function () {
  var card = kCard({ id: 'potion', icon: itemIcon('potion', 18), title: '药水', desc: '基础药水种类，再叠加你自定义的效果', comps: ['potion_contents'], span: 2 }, Ctx);
  var v = potionObj();
  function put(fn) { var o = potionObj(); fn(o); if (!o.potion && (!o.custom_effects || !o.custom_effects.length) && o.custom_color === undefined && !o.custom_name) { Ctx.disable('potion_contents', { structural: false }); return; } var out = {}; if (o.potion) out.potion = o.potion; if (o.custom_color !== undefined) out.custom_color = o.custom_color; if (o.custom_effects && o.custom_effects.length) out.custom_effects = o.custom_effects; if (o.custom_name) out.custom_name = o.custom_name; Ctx.setSmart('potion_contents', out, { label: '药水' }); }
  var entries = potionEntries();
  var psel = kRegSelect({ reg: 'potion', value: v.potion ? Reg.full(v.potion) : '', title: '选择基础药水', empty: '无基础药水（只用自定义效果）', allowClear: true, fallback: entries.map(function (e) { return { v: 'minecraft:' + e.v, label: e.label, sub: e.sub }; }), icon: function (e) { return itemIcon('potion', 16); }, onChange: function (x) { put(function (o) { if (x) o.potion = x; else delete o.potion; }); } });
  card.body.appendChild(fieldRow('基础药水', psel.el));
  var col = kColor(typeof v.custom_color === 'number' ? v.custom_color : null, function (c) { put(function (o) { if (c === null) delete o.custom_color; else o.custom_color = c; }); }, { allowNone: true });
  card.body.appendChild(fieldRow('药水液体颜色', col.el, '不选 = 按药水效果自动混色'));
  var fx = kEffectList(function () { return potionObj().custom_effects || []; }, function (l) { put(function (o) { o.custom_effects = l; }); }, { empty: '没有自定义效果' });
  card.body.appendChild(fieldRow('自定义效果', fx.el, '叠加在基础药水之上'));
  card.live.push(function () { var o = potionObj(); psel.set(o.potion ? Reg.full(o.potion) : ''); });
  return card;
};

CARDS.stew = function () {
  var card = kCard({ id: 'stew', icon: itemIcon('suspicious_stew', 18), title: '谜之炖菜效果', desc: '吃下炖菜后获得的效果', comps: ['suspicious_stew_effects'], span: 2 }, Ctx);
  var fx = kEffectList(function () { return Ctx.get('suspicious_stew_effects') || []; }, function (l) { Ctx.setSmart('suspicious_stew_effects', l, { label: '炖菜效果' }); }, { mode: 'stew', empty: '没有效果' });
  card.body.appendChild(fx.el);
  return card;
};

CARDS.deathProtection = function () {
  var card = kCard({ id: 'totem', icon: itemIcon('totem_of_undying', 18), title: '死亡保护', desc: '拿在手里时，致命伤害会被抵消并触发这些效果（图腾）', comps: ['death_protection'], span: 2 }, Ctx);
  var v = Ctx.get('death_protection');
  if (!v) return enableBox(card, ['没有死亡保护', '启用后，致命伤害来临时会消耗它并复活。'], '设为图腾', function () { Ctx.enable('death_protection', { death_effects: [{ type: 'minecraft:clear_all_effects' }, { type: 'minecraft:apply_effects', effects: [{ id: 'minecraft:regeneration', amplifier: 1, duration: 900 }], probability: 1 }] }, '设为图腾'); });
  var ce = kConsumeEffects(function () { var o = Ctx.get('death_protection') || {}; return (o.death_effects || []).slice(); }, function (l) { var o = Ctx.get('death_protection') || {}; o.death_effects = l; Ctx.setSmart('death_protection', o, { label: '死亡保护' }); });
  card.body.appendChild(fieldRow('复活后发生', ce.el));
  card.body.appendChild(kBtn('取消死亡保护', function () { Ctx.disable('death_protection'); }, { cls: 'dng', icon: 'trash' }));
  return card;
};

/* ==================== 容器 ==================== */
var SLOT_COUNT = { chest: 27, trapped_chest: 27, barrel: 27, dispenser: 9, dropper: 9, crafter: 9, hopper: 5, furnace: 3, blast_furnace: 3, smoker: 3, brewing_stand: 5, chiseled_bookshelf: 6, decorated_pot: 1, campfire: 4, soul_campfire: 4 };
/* 容器格数：优先用游戏里真实的 Container 大小（item_meta.container_size）；没到或离线时才用内置表 */
function slotCountFor(id) { var m = Reg.live() ? Reg.itemMeta(id) : false; if (m && typeof m.container_size === 'number') return m.container_size; id = shortId(id); if (SLOT_COUNT[id] !== undefined) return SLOT_COUNT[id]; if (/shelf$/.test(id)) return 3; return 27; }
/* 收纳袋总容量：游戏里的归一化分数（item_meta.bundle_capacity），默认 1 */
function bundleCapacity() { var m = Reg.live() ? Reg.itemMeta(Ctx.doc().id) : false; return m && m.bundle_capacity && m.bundle_capacity.denominator ? m.bundle_capacity.numerator / m.bundle_capacity.denominator : 1; }
function stackWeight(st) { var ms = (protoOf(st.id).max_stack_size || 64); return (st.count || 1) / ms; }
CARDS.container = function () {
  var n = slotCountFor(Ctx.doc().id);
  var card = kCard({ id: 'container', icon: 'chest', title: '里面的物品', desc: '点一个格子放入或修改物品，右键可复制 / 清空', comps: ['container'], span: 2, value: function () { var l = Ctx.get('container'); return l && l.length ? l.length + ' 格有物品' : ''; } }, Ctx);
  function list() { return Ctx.get('container') || []; }
  function save(l) { l.sort(function (a, b) { return a.slot - b.slot; }); if (!l.length) Ctx.disable('container', { structural: false }); else Ctx.setSmart('container', l, { label: '容器内容' }); }
  function stackAt(i) { var l = list(), r = null; l.forEach(function (e) { if (e.slot === i) r = e; }); return r; }
  /* 物品页存的是嵌套格式 {slot, item:{id,count,components}}；格子只认视图，这里做适配 */
  function viewOf(i) { var e = stackAt(i); return e ? { id: e.item.id, count: e.item.count, marked: !!e.item.components, _item: e.item } : null; }
  var grid;
  function edit(cell, i) {
    kStackPop(cell, viewOf(i), {
      closeOnPick: false,
      onPick: function (id) { var l = list(), e = stackAt(i); if (e) { e.item.id = fullId(id); l = l.map(function (x) { return x.slot === i ? e : x; }); } else l.push({ slot: i, item: { id: 'minecraft:' + id, count: 1 } }); save(l); grid.repaint(); },
      onStack: function (st) { var l = list(), item = vaultNested(st); NBT_FORCE.container = true; if (stackAt(i)) l = l.map(function (x) { return x.slot === i ? { slot: i, item: item } : x; }); else l.push({ slot: i, item: item }); save(l); grid.repaint(); },
      onCount: function (v) { var l = list(); l.forEach(function (x) { if (x.slot === i) x.item.count = v; }); save(l); grid.repaint(); },
      onClear: function () { save(list().filter(function (x) { return x.slot !== i; })); grid.repaint(); }
    });
  }
  var ix = []; for (var k0 = 0; k0 < n; k0++) ix.push(k0);
  grid = kSlotGrid({ indices: ix, cols: slotCols(n), col: 34, bare: true, plain: true, noSuffix: true, markTitle: '这个物品带有自己的组件数据',
    stackOf: viewOf, titleOf: function (i) { return '空格子 ' + (i + 1); }, edit: edit, redraw: function () { grid.repaint(); },
    menu: function (i, cell) {
      var e = stackAt(i);
      return [{ label: '编辑…', icon: 'edit', run: function () { edit(cell, i); } },
        { label: '复制到下一个空格', icon: 'copy', dis: !e, run: function () { var l = list(); for (var k = 0; k < n; k++) { if (!stackAt(k)) { l.push({ slot: k, item: clone(e.item) }); break; } } save(l); grid.repaint(); } },
        { sep: 1 },
        { label: '清空', icon: 'trash', danger: 1, dis: !e, run: function () { save(list().filter(function (x) { return x.slot !== i; })); grid.repaint(); } }];
    },
    ref: function (i) {
      return { group: card, i: i, get: function () { return viewOf(i); },
        set: function (st) { var l = list().filter(function (x) { return x.slot !== i; }); if (st && st.id && !st.empty) l.push({ slot: i, item: st._item ? clone(st._item) : { id: st.id, count: st.count || 1 } }); save(l); },
        swap: function (o) { var j = o.i, l = list(); l.forEach(function (x) { if (x.slot === i) x.slot = j; else if (x.slot === j) x.slot = i; }); save(l); } };
    } });
  card.live.push(function () { grid.repaint(); });
  card.body.appendChild(weDndHint());
  card.body.appendChild(grid);
  card.body.appendChild(kBtn('全部清空', function () { Ctx.disable('container', { structural: false }); grid.repaint(); }, { cls: 'dng', icon: 'trash' }));
  return card;
};

CARDS.bundle = function () {
  var card = kCard({ id: 'bundle', icon: 'bag', title: '收纳袋内容', desc: '袋子里装的东西；总重量不能超过 ' + fmtNum(bundleCapacity()) + '（装满）', comps: ['bundle_contents'], span: 2 }, Ctx);
  var row = h('div', { class: 'k-cgrid' }), bar = h('div', { class: 'k-meter' }, [h('i', {})]), eff = kEffect('');
  function list() { return Ctx.get('bundle_contents') || []; }
  function save(l) { if (!l.length) Ctx.disable('bundle_contents', { structural: false }); else Ctx.setSmart('bundle_contents', l, { label: '收纳袋内容' }); }
  function viewOf(i) { var st = list()[i]; return st ? { id: st.id, count: st.count, marked: false, _st: st } : null; }
  function draw() {
    var len = list().length, ix = []; for (var k = 0; k < len; k++) ix.push(k);
    var g = kSlotGrid({ indices: ix, bare: true, plain: true, noSuffix: true, stackOf: viewOf, redraw: draw,
      edit: function (cell, i) {
        var st = list()[i];
        kStackPop(cell, viewOf(i), { pick: false, plain: true, width: 230, maxHeight: null, countLabel: nameOfItem(st.id) + ' 数量', clearLabel: '取出',
          onCount: function (v) { var l = list(); l[i].count = v; save(l); draw(); },
          onClear: function () { var l = list(); l.splice(i, 1); save(l); draw(); } });
      },
      ref: function (i) {
        return { group: card, i: i, get: function () { return viewOf(i); },
          set: function (st) { var l = list(); if (!st || st.empty || !st.id) l.splice(i, 1); else l[i] = st._st ? clone(st._st) : { id: st.id, count: st.count || 1 }; save(l); },
          swap: function (o) { var l = list(), t = l[i]; l[i] = l[o.i]; l[o.i] = t; save(l); } };
      } });
    clear(row); while (g.firstChild) row.appendChild(g.firstChild);
    var add = h('div', { class: 'slot s34 addslot', title: '放入物品' }, [uiIcon('plus', 14)]);
    activate(add, function () { pickItem(add, function (id) { var l = list(); l.push({ id: fullId(id), count: 1 }); save(l); draw(); }, { onStack: function (st) { var l = list(); l.push(vaultNested(st)); NBT_FORCE.bundle_contents = true; save(l); draw(); } }); });
    row.appendChild(add);
    var cap = bundleCapacity(), w = list().reduce(function (s, st) { return s + stackWeight(st); }, 0) / cap;
    bar.firstChild.style.width = Math.min(100, w * 100) + '%'; bar.className = 'k-meter' + (w > 1 ? ' bad' : w > 0.85 ? ' warn' : '');
    eff.set('已占用 ' + Math.round(w * 100) + '%' + (w > 1 ? '：超过 100%，游戏可能无法放入这么多' : ''), w > 1 ? 'warn' : '');
  }
  draw(); card.live.push(draw);
  card.body.appendChild(weDndHint()); card.body.appendChild(row); card.body.appendChild(bar); card.body.appendChild(eff.el);
  return card;
};

/* ==================== 书 ==================== */
CARDS.writtenBook = function () {
  var card = kCard({ id: 'wbook', icon: 'book_open', title: '成书内容', desc: '标题、作者、每一页的文字', comps: ['written_book_content'], span: 2 }, Ctx);
  var v = Ctx.get('written_book_content');
  if (!v) return enableBox(card, ['这是一本空书', '启用后可以写标题和内容。'], '开始写这本书', function () { Ctx.enable('written_book_content', { title: '新书', author: '我', generation: 0, pages: ['第一页'] }, '开始写书'); });
  function str(t) { return typeof t === 'string' ? t : (isObj(t) && typeof t.raw === 'string' ? t.raw : ''); }
  function put(fn) { var o = Ctx.get('written_book_content') || { pages: [] }; fn(o); Ctx.setSmart('written_book_content', o, { label: '成书内容' }); }
  card.body.appendChild(fieldRow('书名', kInput(str(v.title), function (t) { put(function (o) { o.title = t; }); }, { max: 32, placeholder: '最多 32 个字符' })));
  card.body.appendChild(fieldRow('作者', kInput(v.author || '', function (t) { put(function (o) { o.author = t; }); }, { placeholder: '作者名' })));
  card.body.appendChild(fieldRow('版本', kSeg([{ v: 0, label: '原稿' }, { v: 1, label: '副本' }, { v: 2, label: '副本的副本' }, { v: 3, label: '破烂（不可复制）' }], v.generation || 0, function (x) { put(function (o) { o.generation = x; }); }).el, '决定能不能继续复制'));
  var pages = h('div', { class: 'k-sortlist' });
  function draw() {
    clear(pages);
    var o = Ctx.get('written_book_content') || { pages: [] };
    (o.pages || []).forEach(function (p, i) {
      var ta = h('textarea', { class: 'k-input', rows: '4', spellcheck: 'false' }); ta.value = str(p);
      var prev = h('div', { class: 'k-bookprev' });
      function paintPrev() { renderRuns(prev, {}, parseCodes(ta.value), { color: '#000000', placeholder: '（空白页）' }); }
      ta.addEventListener('input', function () { put(function (oo) { oo.pages[i] = ta.value; }); paintPrev(); });
      var rm = h('div', { class: 'k-mini del', text: '×', title: '删除这一页' }); activate(rm, function () { put(function (oo) { oo.pages.splice(i, 1); }); draw(); });
      paintPrev();
      pages.appendChild(h('div', { class: 'k-bookpage k-srow' }, [h('div', { class: 'k-row' }, [kGrip(), h('b', { class: 'ix', text: '第 ' + (i + 1) + ' 页' }), h('div', { class: 'grow' }), rm]), h('div', { class: 'k-bookcols' }, [ta, prev])]));
    });
    if (!(o.pages || []).length) pages.appendChild(xEmpty('还没有内容'));
  }
  kSortable(pages, { onMove: function (from, to) { put(function (o) { var x = o.pages.splice(from, 1)[0]; o.pages.splice(to, 0, x); }); draw(); } });
  var add = xAdd('添加一页');
  activate(add, function () { put(function (o) { (o.pages = o.pages || []).push(''); }); draw(); });
  card.body.appendChild(fieldRow('内容', h('div', { class: 'k-scrollbox tall' }, [pages]), '左边写字，右边是书页上的样子；颜色请用 § 代码（如 §6金色）'));
  card.body.appendChild(add);
  draw();
  return card;
};
CARDS.writableBook = function () {
  var card = kCard({ id: 'wrbook', icon: 'book_open', title: '书与笔内容', desc: '还没署名的书，页数最多 100 页，每页最多 1024 字符', comps: ['writable_book_content'], span: 2 }, Ctx);
  function pagesList() { var v = Ctx.get('writable_book_content'); return v && v.pages ? v.pages.map(function (p) { return typeof p === 'string' ? p : (p.raw || ''); }) : []; }
  function save(l) { Ctx.setSmart('writable_book_content', { pages: l }, { label: '书与笔' }); }
  var pages = h('div', { class: 'k-sortlist' });
  function draw() {
    clear(pages); var l = pagesList();
    l.forEach(function (p, i) {
      var ta = h('textarea', { class: 'k-input', rows: '4', maxlength: '1024', spellcheck: 'false' }); ta.value = p;
      var cnt = h('span', { class: 'k-sub', text: p.length + ' / 1024' });
      ta.addEventListener('input', function () { var l2 = pagesList(); l2[i] = ta.value; save(l2); cnt.textContent = ta.value.length + ' / 1024'; });
      var rm = h('div', { class: 'k-mini del', text: '×' }); activate(rm, function () { var l2 = pagesList(); l2.splice(i, 1); save(l2); draw(); });
      pages.appendChild(h('div', { class: 'k-bookpage k-srow' }, [h('div', { class: 'k-row' }, [kGrip(), h('b', { class: 'ix', text: '第 ' + (i + 1) + ' 页' }), h('div', { class: 'grow' }), cnt, rm]), ta]));
    });
    if (!l.length) pages.appendChild(xEmpty('空白的书'));
  }
  kSortable(pages, { onMove: function (from, to) { var l = pagesList(); var x = l.splice(from, 1)[0]; l.splice(to, 0, x); save(l); draw(); } });
  var add = xAdd('添加一页');
  activate(add, function () { var l = pagesList(); if (l.length >= 100) { toast('最多 100 页', 'error'); return; } l.push(''); save(l); draw(); });
  card.body.appendChild(h('div', { class: 'k-scrollbox tall' }, [pages])); card.body.appendChild(add); draw();
  return card;
};

/* ==================== 烟花 ==================== */
var FW_SHAPES = [{ v: 'small_ball', label: '小球' }, { v: 'large_ball', label: '大球' }, { v: 'star', label: '星形' }, { v: 'creeper', label: '苦力怕脸' }, { v: 'burst', label: '迸发' }];
function kColorList(list, onChange, addLabel) {
  var wrap = h('div', { class: 'k-chips' });
  function draw() {
    clear(wrap);
    list.forEach(function (c, i) {
      var chip = h('div', { class: 'k-chip' }, [h('span', { class: 'k-colorchip small', style: 'background:' + hex6(c) }), hex6(c)]);
      activate(chip, function () { kColorPop(chip, c, function (n) { list[i] = n; onChange(list); draw(); }, { width: 270, extra: [kBtn('删除这个颜色', function () { list.splice(i, 1); onChange(list); kPopClose(); draw(); }, { cls: 'dng', icon: 'trash' })] }); });
      wrap.appendChild(chip);
    });
    var add = h('div', { class: 'k-chip' }, [uiIcon('plus', 12), addLabel || '添加颜色']);
    activate(add, function () { list.push(0xFF5555); onChange(list); draw(); });
    wrap.appendChild(add);
  }
  draw();
  return { el: wrap };
}
function explosionEditor(ex, onChange) {
  var box = h('div', { class: 'k-xbody' });
  var shape = kTiles(FW_SHAPES, ex.shape || 'small_ball', function (x) { ex.shape = x; onChange(); }, { cols: 5 });
  var colors = kColorList(ex.colors || (ex.colors = []), function (l) { ex.colors = l; onChange(); });
  var fade = kColorList(ex.fade_colors || (ex.fade_colors = []), function (l) { ex.fade_colors = l; onChange(); }, '添加渐变色');
  var tr = kToggle(!!ex.has_trail, function (on) { ex.has_trail = on; onChange(); }, '拖尾'), tw = kToggle(!!ex.has_twinkle, function (on) { ex.has_twinkle = on; onChange(); }, '闪烁');
  box.appendChild(fieldRow('形状', shape.el)); box.appendChild(fieldRow('主颜色', colors.el, '可以多选，会随机混合')); box.appendChild(fieldRow('渐变到', fade.el, '爆炸后逐渐变成这些颜色')); box.appendChild(h('div', { class: 'k-row wrap' }, [tr.el, tw.el]));
  return box;
}
CARDS.fireworks = function () {
  var card = kCard({ id: 'fireworks', icon: itemIcon('firework_rocket', 18), title: '烟花火箭', desc: '飞行时间和爆炸效果', comps: ['fireworks'], span: 2 }, Ctx);
  var v = Ctx.get('fireworks') || { flight_duration: 1, explosions: [] };
  function put(fn) { var o = Ctx.get('fireworks') || { flight_duration: 1, explosions: [] }; fn(o); Ctx.setSmart('fireworks', o, { label: '烟花' }); }
  var fd = kNumber(v.flight_duration === undefined ? 1 : v.flight_duration, { min: 0, max: 255, softMax: 5, step: 1, presets: [{ v: 1, label: '1 短' }, { v: 2, label: '2' }, { v: 3, label: '3 长' }], onChange: function (n) { put(function (o) { o.flight_duration = n; }); } });
  card.body.appendChild(fieldRow('飞行时间', fd.el, '数值越大飞得越高越久（原版 1~3）'));
  var list = h('div', { class: 'k-sortlist' }), openIdx = -1;
  function draw() {
    clear(list);
    var o = Ctx.get('fireworks') || { explosions: [] };
    (o.explosions || []).forEach(function (ex, i) {
      var isOpen = openIdx === i;
      var row = xRow({ grip: true, chevron: true, icon: false, title: '爆炸 ' + (i + 1) + ' · ' + (FW_SHAPES.filter(function (s) { return s.v === ex.shape; })[0] || { label: '?' }).label, sub: (ex.colors || []).length + ' 种颜色' + (ex.has_trail ? ' · 拖尾' : '') + (ex.has_twinkle ? ' · 闪烁' : ''), open: isOpen, onHead: function () { openIdx = isOpen ? -1 : i; draw(); } });
      if (isOpen) { var ed = explosionEditor(ex, function () { put(function (oo) { oo.explosions[i] = ex; }); }); ed.appendChild(kBtn('删除这个爆炸', function () { put(function (oo) { oo.explosions.splice(i, 1); }); openIdx = -1; draw(); }, { cls: 'dng', icon: 'trash' })); row.appendChild(ed); }
      list.appendChild(row);
    });
    if (!(o.explosions || []).length) list.appendChild(xEmpty('没有爆炸效果'));
  }
  kSortable(list, { onMove: function (from, to) { put(function (o) { var x = o.explosions.splice(from, 1)[0]; o.explosions.splice(to, 0, x); }); openIdx = -1; draw(); } });
  var add = xAdd('添加一个爆炸');
  activate(add, function () { put(function (o) { (o.explosions = o.explosions || []).push({ shape: 'small_ball', colors: [0xFF5555], fade_colors: [], has_trail: false, has_twinkle: false }); }); openIdx = (Ctx.get('fireworks').explosions || []).length - 1; draw(); });
  card.body.appendChild(fieldRow('爆炸效果', h('div', { class: 'k-scrollbox tall' }, [list]))); card.body.appendChild(add); draw();
  return card;
};
CARDS.fireworkStar = function () {
  var card = kCard({ id: 'fwstar', icon: itemIcon('firework_star', 18), title: '烟火之星', desc: '这颗星星的爆炸效果', comps: ['firework_explosion'], span: 2 }, Ctx);
  var v = Ctx.get('firework_explosion') || { shape: 'small_ball', colors: [0xFF5555] };
  var ed = explosionEditor(clone(v), function () {});
  var ex = clone(v);
  var box = explosionEditor(ex, function () { Ctx.setSmart('firework_explosion', clone(ex), { label: '烟火之星' }); });
  card.body.appendChild(box);
  return card;
};


/* ==================== 使用时的行为（use_effects）：三项设置，不再用通用表单 ==================== */
CARDS.useEffects = function () {
  var cid = 'use_effects';
  var card = kCard({ id: 'use-effects', icon: 'play', title: '使用时的行为', desc: '吃、喝、举盾等使用物品期间，玩家还能不能跑、会不会被振动检测、走得多快', comps: [cid], toggle: true }, Ctx);
  var v = Ctx.get(cid);
  if (!v) return enableBox(card, ['这个物品没有单独的「使用时行为」', '启用后可以改变使用期间能否疾跑、移动速度和振动。'], '启用', function () { Ctx.enable(cid, { can_sprint: false, interact_vibrations: true, speed_multiplier: 0.2 }, '启用使用时行为'); });
  function put(fn, label) { var o = clone(Ctx.get(cid) || {}); fn(o); Ctx.setSmart(cid, o, { label: label || '使用时行为' }); }
  var sprint = kToggle(v.can_sprint === true, function (on) { put(function (o) { o.can_sprint = on; }, '使用中可疾跑'); }, '使用中可以疾跑');
  var vib = kToggle(v.interact_vibrations !== false, function (on) { put(function (o) { o.interact_vibrations = on; }, '使用时发出振动'); }, '使用时发出交互振动（会被幽匿感测体听到）');
  var spd = kNumber(v.speed_multiplier === undefined ? 0.2 : v.speed_multiplier, { min: 0, max: 1, step: 0.05, dec: 2, unit: '倍', presets: [{ v: 0, label: '0 站住' }, { v: 0.2, label: '0.2 默认' }, { v: 0.5, label: '0.5' }, { v: 1, label: '1 不减速' }], onChange: function (n) { put(function (o) { o.speed_multiplier = n; }, '使用中移动倍率'); } });
  card.body.appendChild(sprint.el); card.body.appendChild(vib.el);
  card.body.appendChild(fieldRow('使用中移动速度', spd.el));
  card.live.push(function () { var o = Ctx.get(cid) || {}; sprint.set(o.can_sprint === true); vib.set(o.interact_vibrations !== false); spd.set(o.speed_multiplier === undefined ? 0.2 : o.speed_multiplier); });
  return card;
};

regEnumTable('use_animation', ANIMS, function (x) { return x[0]; }, function (id, n) { return [id, n, 'grid']; });
regEnumTable('firework_shape', FW_SHAPES, function (x) { return x.v; }, function (id, n) { return { v: id, label: n }; });
regEnumTable('consume_effect_type', CE_TYPES, function (x) { return x.v; }, function (id, n) { return { v: id, label: n, sub: '' }; });
