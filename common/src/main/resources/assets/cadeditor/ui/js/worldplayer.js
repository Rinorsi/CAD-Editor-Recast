/* 格子网格、点开改物品的小窗、拖动对换（kSlotGrid / kStackPop / weDnd*）在 slots.js。 */

/* ====================== 玩家（在线玩家，docs/world-player-contract.md） ====================== */
WE.pslots = { container: {}, ender: {} };
function wpIs() { return !!(WE.w && WE.w.kind === 'entity' && WE.w.player); }
function wpCommandCaps() { var c = WE.w && WE.w.capabilities; return c && c.backend === 'vanilla_self' ? c : null; }
function wpCommandRestriction(path) {
  var c = wpCommandCaps(); if (!c || (c.editable || []).indexOf(path) >= 0) return '';
  // Older snapshots omit supported. This is protocol field compatibility, not a permission grant.
  var supported = c.supported || ['playerGameType', 'experience.XpLevel', 'experience.XpP', 'commandPosition', 'attributes.base'];
  return supported.indexOf(path) >= 0 ? '缺少对应原版命令或权威查询权限；此处仅保留本地草稿。' : '需要服务端 Editor；此处仅保留本地草稿。';
}
/* User edits after submit are events, not deltas against the old server snapshot.
   Keep their final value/version even when weDraftSet removes a revert-to-old-value delta. */
function wpCommandLedger(id) { return { id: id, token: WE.w && WE.w.slot && WE.w.slot.token, fields: {}, slots: { container: {}, ender: {} }, version: WE.commandVersion || 0 }; }
function wpCommandBegin(id) {
  if (!wpCommandCaps()) return;
  WE.commandFlight = wpCommandLedger(id); WE.commandExplicit = wpCommandLedger(null);
}
function wpCommandFlight() {
  if (!wpCommandCaps() || !WE.pending) return null;
  if (!WE.commandFlight || WE.commandFlight.id !== WE.pending) WE.commandFlight = wpCommandLedger(WE.pending);
  return WE.commandFlight.token === (WE.w.slot || {}).token ? WE.commandFlight : null;
}
function wpCommandTrack(key, value, part) {
  if (!wpCommandCaps()) return;
  var flight = wpCommandFlight(), previous = wpG(key);
  function record(child, next) {
    var id = JSON.stringify([key, child === undefined ? null : child]);
    if (!flight) { if (WE.commandExplicit) delete WE.commandExplicit.fields[id]; return; }
    var version = WE.commandVersion = (WE.commandVersion || 0) + 1;
    flight.version = version; flight.fields[id] = { key: key, part: child, value: clone(next), version: version };
  }
  if (key === 'attributes' && Array.isArray(value)) {
    value.forEach(function (row) { var old = (previous || []).filter(function (x) { return x.id === row.id; })[0]; if (part === row.id || (part === undefined && weNorm(old) !== weNorm(row))) record(row.id, row); });
  } else if (['experience', 'commandPosition', 'food', 'abilities'].indexOf(key) >= 0 && value && typeof value === 'object') {
    Object.keys(value).forEach(function (child) { if (part === child || (part === undefined && weNorm((previous || {})[child]) !== weNorm(value[child]))) record(child, value[child]); });
  } else record(undefined, value);
}
function wpCommandTrackSlot(which, i, stack) {
  if (!wpCommandCaps()) return;
  var flight = wpCommandFlight();
  if (!flight) { if (WE.commandExplicit) delete WE.commandExplicit.slots[which][i]; return; }
  flight.version = WE.commandVersion = (WE.commandVersion || 0) + 1;
  flight.slots[which][i] = clone(stack && !stack.empty ? stack : { empty: true });
}
function wpCommandMergeFields(target, fields, original) {
  Object.keys(fields || {}).forEach(function (id) {
    var edit = fields[id], key = edit.key;
    if (edit.part === undefined) target[key] = clone(edit.value);
    else if (key === 'attributes') {
      var rows = target[key] || (target[key] = clone(original[key] || [])), at = rows.findIndex(function (row) { return row.id === edit.part; });
      if (at < 0) rows.push(clone(edit.value)); else rows[at] = clone(edit.value);
    } else { var group = target[key] || (target[key] = clone(original[key] || {})); group[edit.part] = clone(edit.value); }
  });
}
function wpCommandPendingEdits() {
  var f = WE.commandFlight;
  return f && f.id === WE.pending && f.token === ((WE.w && WE.w.slot) || {}).token ? clone(f) : null;
}
function wpCommandRestoreEdits(later, confirmed) {
  if (!later) return;
  WE.commandVersion = Math.max(WE.commandVersion || 0, later.version || 0);
  var keep = WE.commandExplicit && WE.commandExplicit.token === later.token ? clone(WE.commandExplicit) : wpCommandLedger(null);
  keep.id = later.id; keep.version = WE.commandVersion;
  Object.keys(later.fields).forEach(function (id) { if (!keep.fields[id] || keep.fields[id].version <= later.fields[id].version) keep.fields[id] = clone(later.fields[id]); });
  ['container', 'ender'].forEach(function (which) { Object.keys(later.slots[which]).forEach(function (i) { keep.slots[which][i] = clone(later.slots[which][i]); }); });
  if (confirmed) {
    var fresh = evVal('player');
    Object.keys(keep.fields).forEach(function (id) {
      var edit = keep.fields[id], value = fresh[edit.key];
      if (edit.part !== undefined) value = edit.key === 'attributes' ? (value || []).filter(function (row) { return row.id === edit.part; })[0] : (value || {})[edit.part];
      if (weNorm(value) === weNorm(edit.value)) delete keep.fields[id];
    });
    ['container', 'ender'].forEach(function (which) { Object.keys(keep.slots[which]).forEach(function (i) {
      var row = ((fresh[which] || {}).slots || []).filter(function (s) { return s.slot === Number(i); })[0], actual = row ? row.stack : { empty: true }, wanted = keep.slots[which][i];
      if (weNorm(actual) === weNorm(wanted) || actual.empty && wanted.empty) { delete keep.slots[which][i]; delete WE.pslots[which][i]; }
    }); });
  }
  WE.commandExplicit = keep; WE.commandFlight = null;
  if (Object.keys(keep.fields).length) wpCommandMergeFields(WE.ent.player || (WE.ent.player = {}), keep.fields, evVal('player'));
  ['container', 'ender'].forEach(function (which) { Object.keys(keep.slots[which]).forEach(function (i) { WE.pslots[which][i] = clone(keep.slots[which][i]); }); });
}
function wpCommandFinishEdits(id, confirmed) {
  if (id !== WE.pending) return;
  var later = wpCommandPendingEdits(); if (later) wpCommandRestoreEdits(later, confirmed);
}
function wpCommandIntentDirty() {
  if (!wpCommandCaps()) return false;
  var f = WE.commandFlight;
  return !!(f && f.id === WE.pending && (Object.keys(f.fields).length || Object.keys(f.slots.container).length || Object.keys(f.slots.ender).length));
}
/* This table comes from the live host command tree, never from creative mode or UI assumptions. */
function wpCommandPatch() {
  var out = {}, edits = (WE.ent || {}).player || {}, original = evVal('player');
  Object.keys(edits).forEach(function (key) {
    if (key === 'experience' || key === 'commandPosition') {
      var part = {}; Object.keys(edits[key] || {}).forEach(function (k) { if (weNorm(edits[key][k]) !== weNorm((original[key] || {})[k])) part[k] = clone(edits[key][k]); });
      if (Object.keys(part).length) out[key] = part;
    } else if (key === 'attributes') {
      var rows = (edits.attributes || []).filter(function (r) { var old = (original.attributes || []).filter(function (o) { return o.id === r.id; })[0]; return !old || weNorm(old) !== weNorm(r); });
      if (rows.length) out.attributes = clone(rows);
    } else out[key] = clone(edits[key]);
  });
  if (wpCommandCaps() && WE.commandExplicit) wpCommandMergeFields(out, WE.commandExplicit.fields, {});
  var inFlight = wpCommandPendingEdits(); if (inFlight) wpCommandMergeFields(out, inFlight.fields, {});
  return out;
}
function wpCommandProblems() {
  var c = wpCommandCaps(); if (!c) return [];
  var allowed = c.editable || [], problems = [], edits = wpCommandPatch(), count = 0;
  Object.keys(edits).forEach(function (key) {
    if (key === 'experience') Object.keys(edits[key]).forEach(function (part) {
      var path = key + '.' + part; if (allowed.indexOf(path) < 0) problems.push(path + ' 仅保留草稿：' + wpCommandRestriction(path)); else count++;
      if (part === 'XpP' && wpSchema().xpPointsLevel !== (wpV('experience') || {}).XpLevel) problems.push('等级同步已变化，请重新打开读取本级点数范围');
    });
    else if (key === 'attributes') {
      if (allowed.indexOf('attributes.base') < 0) problems.push('属性基础值：' + wpCommandRestriction('attributes.base'));
      edits.attributes.forEach(function (r) {
        if (Object.keys(r).some(function (k) { return k !== 'id' && k !== 'base'; })) problems.push('属性修饰符需要服务端 Editor，不能随基础值提交');
        if (!(wpV('attributes') || []).some(function (o) { return o.id === r.id; })) problems.push(r.id + ' 不在本玩家可同步属性中');
        count++;
      });
    } else if (allowed.indexOf(key) < 0) problems.push(key + ' 仅保留草稿：' + wpCommandRestriction(key)); else count++;
  });
  if (Object.keys(WE.ent || {}).some(function (g) { return g !== 'player'; })) problems.push('仅允许自身玩家字段');
  if (wpSlotsDirty()) problems.push('背包 / 末影箱修改需要独立库存后端，此页只保留草稿');
  if (typeof weDirtyText === 'function' && weDirtyText()) problems.push('原版不支持写入玩家 NBT');
  if (count > 1) problems.push('每次仅提交一个操作；等级、点数、位置、模式、单个属性须分开提交，不是原子操作');
  return problems;
}
function wpCommandMessage(msg) { if (wpCommandCaps() && msg.entity && msg.entity.player) msg.entity.player = wpCommandPatch(); }
function wpCommandNote() {
  var c = wpCommandCaps(); if (!c) return ''; var p = wpCommandProblems(), patch = wpCommandPatch(), note = c.reason;
  if (patch.experience && patch.experience.XpP !== undefined) { var n = wpSchema().xpPointsNeeded; if (n > 0) note += ' 本级将设置为 ' + Math.min(n - 1, Math.round(patch.experience.XpP * n)) + ' / ' + n + ' 点；XpTotal 不变。'; }
  return note + (p.length ? ' 当前限制：' + p.join('；') + '。请先还原这些字段，再提交支持的修改。' : '');
}
function wpCommandPosition(body) {
  var sc = wpSchema(); body.appendChild(xSec('compass', '位置与朝向', '同维度 ' + sc.commandDimension));
  if (wpCommandRestriction('commandPosition')) body.appendChild(kHint(wpCommandRestriction('commandPosition')));
  body.appendChild(kHint('一次 teleport @s 提交位置与朝向；提交前须站稳，移动或转头会使基线冲突。确认精度：坐标 0.01 格、角度 0.001°。移动、坠落或服务器改写位置时可能结果未知，请重读核对。跨维度及重生点需要服务端 Editor。'));
  ['x', 'y', 'z', 'yaw', 'pitch'].forEach(function (key) {
    var current = wpSection('commandPosition');
    body.appendChild(xNum({ title: {x:'X',y:'Y',z:'Z',yaw:'水平朝向',pitch:'俯仰'}[key], value: current[key], noSlider: true, min: key === 'y' ? sc.commandMinY : key === 'pitch' ? -90 : key === 'yaw' ? -360 : -29999999, max: key === 'y' ? sc.commandMaxY : key === 'pitch' ? 90 : key === 'yaw' ? 360 : 29999999, preservePrecision: true, dec: key === 'yaw' || key === 'pitch' ? 1 : 3, step: 1, onChange: function (v) { var next = wpSection('commandPosition'); next[key] = v; evSet('player', 'commandPosition', next, key); } }));
  });
}
function wpReset() { WE.pslots = { container: {}, ender: {} }; WE.commandAttribute = ''; WE.commandFlight = null; WE.commandExplicit = null; }
function wpV(k) { return evVal('player')[k]; }
function wpG(k) { return evGet('player', k); }
function wpSchema() { var g = evGroup('player'); return (g && g.schema) || {}; }
function wpBound(path) { var b = (wpSchema().bounds || {})[path]; return b || {}; }
function wpContainerStack(which, i) {
  var ed = WE.pslots[which][i]; if (ed) return ed;
  var c = wpV(which), s = c && c.slots ? c.slots.filter(function (x) { return x.slot === i; })[0] : null;
  return s ? s.stack : { empty: true };
}
function wpOrigEmpty(which, i) { var c = wpV(which), s = c && c.slots ? c.slots.filter(function (x) { return x.slot === i; })[0] : null; return !s || s.stack.empty; }
function wpSetSlot(which, i, st) {
  if (st && st.id && !st.empty && typeof ItemHistory !== 'undefined') { var hd = { id: st.id, count: st.count || 1, comps: nbtHydrate(st.comps || {}, st.component_snbt || {}), removed: st.removed || {} }; ItemHistory.note(hd, snapOf(hd)); }
  wpCommandTrackSlot(which, i, st);
  if ((!st || st.empty) && wpOrigEmpty(which, i)) delete WE.pslots[which][i]; else WE.pslots[which][i] = st;
  weMarkDirty();
}
function wpSlotsDirty() { return Object.keys(WE.pslots.container).length + Object.keys(WE.pslots.ender).length; }
/* 工作副本只回填当前玩家目标的草稿，最终仍由 weApply 检查权限与 revision。 */
function wpEditSlot(cell, which, i) {
  kWireStackPop(cell, wpContainerStack(which, i), function (st) { wpSetSlot(which, i, st); weRedrawBody(); }, function (st) {
    var world = WE.w, slots = WE.pslots, revision = world.revision;
    openNestedItem(st, { title: (which === 'ender' ? '末影箱' : '背包') + ' · 第 ' + (i + 1) + ' 格',
      valid: function () { return WE.w === world && WE.pslots === slots && world.revision === revision; },
      commit: function (next) { wpSetSlot(which, i, next); }, render: weRender });
  });
}
function wpMsg(out) {
  ['container', 'ender'].forEach(function (k) {
    var ids = Object.keys(WE.pslots[k]); if (!ids.length) return;
    out.player = out.player || {};
    out.player[k] = { slots: ids.map(function (i) { return { slot: Number(i), stack: clone(WE.pslots[k][i]) }; }) };
  });
}
/* 分区标题：和别的页面一样用 xSec，折叠卡片由 foldify 统一生成（见 xlist.js） */
function wpSec(parent, key, icon, title, hint) { parent.appendChild(xSec(icon, title, hint)); return parent; }
var WP_EQ = Labels.slotEquip;
var WP_MODE = Labels.mode;

function wpInventoryTab(body) {
  var sc = wpSchema(), eq = {};
  (sc.equipmentSlots || []).forEach(function (e) { eq[e.equipment] = e.slot; });
  var total = (wpV('container') || {}).size || sc.inventorySize || 0;
  var secInv = wpSec(body, 'wp:inv', 'backpack', '背包与装备', total + ' 格');

  var which = 'container', GEAR = ['head', 'chest', 'legs', 'feet', 'offhand', 'body', 'saddle'];
  var sel = typeof wpG('SelectedItemSlot') === 'number' ? wpG('SelectedItemSlot') : 0;
  var gearOf = {}; GEAR.forEach(function (k) { if (eq[k] !== undefined) gearOf[eq[k]] = k; });
  function mk(indices, cols, fluid) {
    return kSlotGrid({ tight: true, bare: true, col: 28, fluid: !!fluid, indices: indices, cols: cols, stackOf: function (i) { return wpContainerStack(which, i); }, set: function (i, st) { wpSetSlot(which, i, st); }, edit: function (cell, i) { wpEditSlot(cell, which, i); },
      ghostOf: function (i) { return gearOf[i] ? (ES_SLOT[gearOf[i]] || [0, 'shield'])[1] : null; },
      clsOf: function (i) { return i === sel && i < 9 ? 'hand' : ''; },
      titleOf: function (i) { return gearOf[i] ? (WP_EQ[gearOf[i]] || gearOf[i]) : (i < 9 ? '快捷栏 ' + (i + 1) + (i === sel ? '（主手）' : '') : '背包 ' + (i - 8)); } });
  }
  var main = [], hot = [], gear = [], i;
  for (i = 9; i < 36 && i < total; i++) main.push(i);
  for (i = 0; i < 9 && i < total; i++) hot.push(i);
  /* 装备两列四行：左列 头 / 胸 / 腿 / 脚（护甲），右列 副手 / 身体 / 鞍（缺的位置留空），高度和右边的 背包 + 快捷栏 对齐 */
  var gcols = [['head', 'offhand'], ['chest', 'body'], ['legs', 'saddle'], ['feet', null]], gcount = 0, g2 = false;
  function gix(k) { return k && eq[k] !== undefined && eq[k] < total ? eq[k] : null; }
  gcols.forEach(function (r) { if (gix(r[1]) !== null) g2 = true; });
  gcols.forEach(function (r) { var a = gix(r[0]), b = gix(r[1]); if (a !== null || b !== null) { gear.push(a); if (g2) gear.push(b); } if (a !== null) gcount++; if (b !== null) gcount++; });
  /* 和原版背包一个版式：左边一列装备，右边上面三行背包、下面一行快捷栏（带手上拿的那格），整片放进同一个下凹的槽里 */
  var right = h('div', { class: 'wp-col' }, [mk(main, 9, true), h('div', { class: 'wp-sep' }), mk(hot, 9, true)]);
  var inv = h('div', { class: 'wp-inv' }, gcount ? [mk(gear, g2 ? 2 : 1), h('div', { class: 'wp-vsep' }), right] : [right]);
  secInv.appendChild(inv);
  /* 兜底：游戏给了 total 个格子，凡是上面没画出来的（名字不认识的装备位、将来新增的位置）都列在这里，保证一格不少 */
  var shown = {};
  main.concat(hot).forEach(function (n) { shown[n] = 1; });
  GEAR.forEach(function (k) { if (eq[k] !== undefined) shown[eq[k]] = 1; });
  var rest = []; for (i = 0; i < total; i++) if (!shown[i]) rest.push(i);
  if (rest.length) { var secRest = wpSec(body, 'wp:rest', 'list', '其他格子', rest.length + ' 格'); secRest.appendChild(mk(rest, Math.min(9, rest.length))); }
  var smax = sc.selectedSlotMax !== undefined ? sc.selectedSlotMax : 8;
  var seg = []; for (i = 0; i <= smax; i++) seg.push({ v: i, label: String(i + 1) });
  var secHand = wpSec(body, 'wp:hand', 'sword', '主手', '当前快捷栏槽位');
  secHand.appendChild(h('div', { class: 'k-row' }, [kSeg(seg, typeof wpG('SelectedItemSlot') === 'number' ? wpG('SelectedItemSlot') : 0, function (v) { evSet('player', 'SelectedItemSlot', v); }).el]));
}
function wpEnderTab(body) {
  var n = (wpV('ender') || {}).size || 27, ix = []; for (var i = 0; i < n; i++) ix.push(i);
  var secEnd = wpSec(body, 'wp:ender', 'chest', '末影箱', n + ' 格');

  secEnd.appendChild(kSlotGrid({ tight: true, indices: ix, cols: 9, stackOf: function (i) { return wpContainerStack('ender', i); }, set: function (i, st) { wpSetSlot('ender', i, st); }, edit: function (cell, i) { wpEditSlot(cell, 'ender', i); } }));
}
function wpNum(label, path, key, obj, o) {
  o = o || {}; var b = wpBound(path);
  return xNum({ title: label, sub: wpCommandRestriction(path) + (o.sub || '') || undefined, range: true, value: obj ? obj[key] : wpG(key), min: b.min, max: b.max, step: o.step, dec: o.dec, preservePrecision: o.dec > 0, unit: o.unit, onChange: o.on });
}
function wpSection(k) { var v = wpG(k); return v && typeof v === 'object' ? clone(v) : {}; }
function wpLinkedAttribute(field) { return field === 'Health' ? 'minecraft:max_health' : field === 'AbsorptionAmount' ? 'minecraft:max_absorption' : null; }
function wpLinkedPlan(field, value) {
  if (weNorm(wpG('active_effects')) !== weNorm(wpV('active_effects'))) throw new Error('请先应用状态效果修改，再联动属性上限，避免使用旧效果计算');
  var id = wpLinkedAttribute(field), def = (wpSchema().attributes || []).filter(function (r) { return r.id === id; })[0];
  var row = (wpG('attributes') || []).filter(function (r) { return r.id === id; })[0];
  return linkedAttributePlan(def, row, value);
}
function wpLinkedNum(label, field) {
  if (wpCommandCaps() || !wpSchema().linkedAttributeLimits) return wpNum(label, field, field, null, { step: 1, dec: 1, sub: wpCommandCaps() ? '' : '当前服务端尚未提供属性联动数据；请更新并重启游戏或服务端后重开此页', on: function (v) { evSet('player', field, v); } });
  var id = wpLinkedAttribute(field), def = (wpSchema().attributes || []).filter(function (r) { return r.id === id; })[0];
  return xNum({ title: label, value: wpG(field), min: 0, max: def ? def.max : wpBound(field).max, step: 1, dec: 1, preservePrecision: true,
    subOf: function () {
      try {
        var current = (wpG('attributes') || []).filter(function (r) { return r.id === id; })[0], original = (wpV('attributes') || []).filter(function (r) { return r.id === id; })[0];
        var before = typeof def.effective === 'number' ? def.effective : linkedAttributeValue(def, original, original.base), after = linkedAttributeValue(def, current, current.base);
        return (before === after ? '当前上限：' + fmtNum(after) : '上限：' + fmtNum(before) + ' → ' + fmtNum(after) + '（应用后同步）') + ' · 游戏上限：' + fmtNum(def.max);
      } catch (e) { return '上限暂不可计算：' + e.message; }
    },
    validate: function (v) { try { wpLinkedPlan(field, v); return ''; } catch (e) { return e.message; } },
    onChange: function (v) {
      var plan = wpLinkedPlan(field, v);
      if (plan.changed) { var rows = clone(wpG('attributes')); rows.forEach(function (r) { if (r.id === id) r.base = plan.base; }); evSet('player', 'attributes', rows, id); }
      evSet('player', field, v);
    } });
}
function wpStatusTab(body) {
  var sc = wpSchema(), cur = body;
  cur = wpSec(body, 'wp:st:生命与饥饿', 'heart', '生命与饥饿');
  cur.appendChild(wpLinkedNum('生命', 'Health'));
  cur.appendChild(wpLinkedNum('伤害吸收', 'AbsorptionAmount'));
  var fd = wpSection('food');
  var satRow;
  function foodHint() { var f = wpSection('food'), old = wpV('food') || {}; return wpCommandRestriction('food.foodLevel') || '范围：' + wpBound('food.foodLevel').min + ' ~ ' + wpBound('food.foodLevel').max + (f.saturation !== old.saturation ? ' · 饱和度：' + fmtNum(old.saturation) + ' → ' + fmtNum(f.saturation) + '（应用后）' : ' · 降低时同步限制饱和度'); }
  function satHint() { var f = wpSection('food'), old = wpV('food') || {}, max = wpBound('food.saturation').max; if (max === undefined) max = wpBound('food.foodLevel').max; return wpCommandRestriction('food.saturation') || '当前上限：' + f.foodLevel + (max === undefined ? ' · 游戏范围读取中' : ' · 可联动至 ' + max) + (f.foodLevel !== old.foodLevel ? '；饥饿值：' + old.foodLevel + ' → ' + f.foodLevel + '（应用后）' : '（同步提高饥饿值）'); }
  var foodRow = xNum({ title: '饥饿值', value: fd.foodLevel, min: wpBound('food.foodLevel').min, max: wpBound('food.foodLevel').max, step: 1,
    subOf: foodHint,
    onChange: function (v) { var f = wpSection('food'); f.foodLevel = v; if (!wpCommandCaps() && f.saturation > v) f.saturation = v; evSet('player', 'food', f, 'foodLevel'); if (satRow && satRow.num) { satRow.num.set(f.saturation); satRow.querySelector('.s').textContent = satHint(); } } });
  cur.appendChild(foodRow);
  satRow = xNum({ title: '饱和度', value: fd.saturation, min: wpBound('food.saturation').min, max: wpBound('food.saturation').max, step: 0.5, dec: 1, preservePrecision: true,
    subOf: satHint,
    onChange: function (v) { var f = wpSection('food'); f.saturation = v; if (!wpCommandCaps() && v > f.foodLevel) f.foodLevel = Math.ceil(v); evSet('player', 'food', f, 'saturation'); if (foodRow.num) { foodRow.num.set(f.foodLevel); foodRow.querySelector('.s').textContent = foodHint(); } } });
  cur.appendChild(satRow);
  cur = wpSec(body, 'wp:st:经验', 'xp', '经验');
  var xp = wpSection('experience');
  var levelBound = wpBound('experience.XpLevel'), levelHint = levelBound.max !== undefined ? '整数范围 ' + levelBound.min + ' ~ ' + levelBound.max + '。' : '';
  if (sc.xpLevelCostOverflowAbove !== undefined) levelHint += '超过 ' + sc.xpLevelCostOverflowAbove + ' 级时，原版升级点数计算会发生整数溢出，获取经验可能异常。';
  cur.appendChild(wpNum('等级', 'experience.XpLevel', 'XpLevel', xp, { sub: levelHint, on: function (v) { var e = wpSection('experience'); e.XpLevel = v; evSet('player', 'experience', e, 'XpLevel'); } }));
  if (wpCommandCaps()) {
    var needed = sc.xpPointsNeeded, ready = needed > 0 && sc.xpPointsLevel === (wpV('experience') || {}).XpLevel;
    if (ready) cur.appendChild(xNum({ title: '当前等级点数', sub: wpCommandRestriction('experience.XpP') + '本级升级需 ' + needed + ' 点；进度按整数点数量化，XpTotal 不变。等级和点数分开应用。', value: Math.min(needed - 1, Math.round((xp.XpP || 0) * needed)), min: 0, max: needed - 1, step: 1, dec: 0, round: true, onChange: function (v) { var e = wpSection('experience'); e.XpP = Math.fround(Math.min(needed - 1, Math.max(0, Math.round(v))) / needed); evSet('player', 'experience', e, 'XpP'); } }));
    else cur.appendChild(kHint('等级同步中，请重新打开读取本级点数范围。'));
  } else cur.appendChild(wpNum('当前等级进度', 'experience.XpP', 'XpP', xp, { step: 0.05, dec: 3, sub: '0 ≤ 进度 < 1，按原版 float 精度保存；步进不限制手动输入的小数位数。', on: function (v) { var e = wpSection('experience'); e.XpP = v; evSet('player', 'experience', e, 'XpP'); } }));
  cur.appendChild(wpNum('经验总量', 'experience.XpTotal', 'XpTotal', xp, { on: function (v) { var e = wpSection('experience'); e.XpTotal = v; evSet('player', 'experience', e, 'XpTotal'); } }));
  var modes = sc.gameModes || ['survival', 'creative', 'adventure', 'spectator'];
  cur = wpSec(body, 'wp:st:游戏模式', 'gamepad', '游戏模式');
  if (wpCommandRestriction('playerGameType')) cur.appendChild(kHint(wpCommandRestriction('playerGameType')));
  cur.appendChild(h('div', { class: 'k-row' }, [kSeg(modes.map(function (m) { return { v: m, label: WP_MODE[m] || m }; }), wpG('playerGameType') || 'survival', function (v) { evSet('player', 'playerGameType', v); }).el]));
  cur.appendChild(kHint('换模式会同时换成该模式的飞行 / 无敌 / 建造能力，除非你在「能力」页里同时指定。'));
  cur = wpSec(body, 'wp:st:名字与标签', 'tag', '名字与标签');
  if (wpCommandCaps()) { cur.appendChild(kHint('名称和标签未由原版同步，不能在此读取或提交；需要服务端 Editor。')); return; }
  cur.appendChild(xText({ title: '自定义名称', value: msgText(wpG('CustomName')), placeholder: '自定义名称（可空）', cls: 'we-in', onCommit: function (v) { evSet('player', 'CustomName', v ? textMsg(v) : null); } }));
  cur.appendChild(xText({ title: '标签', sub: '给 /tag 和选择器用的标签', value: (wpG('Tags') || []).join('，'), placeholder: '标签，用逗号隔开', cls: 'we-in', onCommit: function (v) { evSet('player', 'Tags', splitTags(v)); } }));
}
function wpAbilitiesTab(body) {
  var ab = wpSection('abilities'), sc = wpSchema(), smax = sc.speedMax || 1;
  body.appendChild(xSec('wind', '能力'));
  function setAb(k, v) { var a = wpSection('abilities'); a[k] = v; evSet('player', 'abilities', a, k); }
  [['mayfly', '允许飞行', '双击空格起飞'], ['flying', '正在飞行', ''], ['invulnerable', '无敌', '不受伤害'], ['mayBuild', '可以放置 / 破坏方块', ''], ['instabuild', '创造模式的瞬间破坏', '']].forEach(function (f) {
    if (!(f[0] in ab)) return;
    body.appendChild(xToggle({ title: f[1], sub: f[2], value: ab[f[0]], onChange: function (on) { setAb(f[0], on); } }));
  });
  [['walkSpeed', '行走速度', 'abilities.walkSpeed'], ['flySpeed', '飞行速度', 'abilities.flySpeed']].forEach(function (f) {
    if (!(f[0] in ab)) return;
    var b = wpBound(f[2]);
    body.appendChild(xNum({ title: f[1], sub: '默认 ' + (f[0] === 'walkSpeed' ? '0.1' : '0.05') + ' · 最大 ' + smax, value: ab[f[0]], min: b.min !== undefined ? b.min : 0, max: b.max !== undefined ? b.max : smax, step: 0.01, dec: 3, preservePrecision: true, onChange: function (v) { setAb(f[0], v); } }));
  });
}
function wpAttrTab(body) {
  var sc = wpSchema(), attrs = clone(wpG('attributes') || []), defs = sc.attributes || [];
  body.appendChild(xSec('sword', '属性', '改的是基础值，装备带来的修饰符保持不变'));
  if (wpCommandCaps()) body.appendChild(kHint('只列游戏注册表中本玩家可同步的属性。提交前必须在服务器原始查询中找到同 ID 的实际 base；未回传或值已变时不发送命令，不拿默认值代替。每次一个基础值，修饰符不参与提交。'));
  function baseOf(id) { for (var i = 0; i < attrs.length; i++) if (attrs[i].id === id) return attrs[i].base; return undefined; }
  if (wpCommandCaps()) {
    body.appendChild(xText({ title: '属性 ID 筛选', value: WE.commandAttribute || '', placeholder: '留空显示全部，或手动输入 ID', sub: '列表来自游戏注册表和此玩家可同步属性。输入 ID 后仅显示该属性；留空恢复全部。', onCommit: function (id) { id = id.trim(); var full = id ? fullId(id) : ''; if (full && !(wpSchema().attributes || []).some(function (d) { return d.id === full; })) { toast('该 ID 不在本玩家可同步属性中', 'warn'); return; } WE.commandAttribute = full; weRedrawBody(); } }));
    if (WE.commandAttribute) defs = defs.filter(function (d) { return d.id === WE.commandAttribute; });
  }
  defs.forEach(function (d) {
    var field = d.id === 'minecraft:max_health' ? 'Health' : d.id === 'minecraft:max_absorption' ? 'AbsorptionAmount' : null, linkedNote = '';
    var linked = field && !wpCommandCaps() && wpSchema().linkedAttributeLimits;
    body.appendChild(xNum({ icon: attrIconEl(d.id), title: Reg.nameOf2('attribute', d.id) || attrName(d.id), subOf: function () { return wpCommandRestriction('attributes.base') + (wpCommandCaps() ? '注册默认 ' : '默认 ') + fmtNum(d.base) + (d.min !== undefined ? ' · 范围 ' + fmtNum(d.min) + ' ~ ' + fmtNum(d.max) : '') + (linked ? '；' + (linkedNote || '降低上限时，超限的当前值将同步降低') : ''); }, tip: d.id,
      sub: wpCommandRestriction('attributes.base') + (wpCommandCaps() ? '注册默认 ' : '默认 ') + fmtNum(d.base) + (d.min !== undefined ? ' · 范围 ' + fmtNum(d.min) + ' ~ ' + fmtNum(d.max) : '') + (linked ? '；降低上限时，超限的当前值将同步降低' : ''),
      validate: function (v) { if (!linked) return ''; try { if (weNorm(wpG('active_effects')) !== weNorm(wpV('active_effects'))) throw new Error('请先应用状态效果修改，再联动属性上限，避免使用旧效果计算'); var row = (wpG('attributes') || []).filter(function (r) { return r.id === d.id; })[0] || {}; linkedAttributeValue(d, row, v); return ''; } catch (e) { return e.message; } },
      value: baseOf(d.id), def: d.base, min: d.min, max: d.max, step: (d.max - d.min) > 50 ? 1 : 0.05, dec: 3, preservePrecision: true, onChange: function (v) {
        var list = clone(wpG('attributes') || []), at = -1; list.forEach(function (a, i) { if (a.id === d.id) at = i; });
        if (at >= 0) list[at].base = v; else list.push({ id: d.id, base: v });
        if (linked) { var limit = linkedAttributeValue(d, list.filter(function (r) { return r.id === d.id; })[0], v); linkedNote = ''; if (wpG(field) > limit) { evSet('player', field, limit); linkedNote = '应用时将同步降低' + (field === 'Health' ? '生命' : '伤害吸收') + '至 ' + fmtNum(limit); } }
        evSet('player', 'attributes', list, d.id);
      } }));
  });
  if (!defs.length) body.appendChild(xEmpty('游戏没有给出这个玩家的属性表。'));
  if (wpCommandCaps()) { body.appendChild(kHint('仅修改单个基础值；永久 / 临时修饰符和隐藏效果链不完整，此模式不编辑它们，也不发送 modifiers。')); return; }
  body.appendChild(xSec('flask', '状态效果'));
  var fx = kEffectList(function () { return clone(wpG('active_effects') || []); }, function (l) { evSet('player', 'active_effects', l); }, { empty: '没有效果' });
  body.appendChild(fx.el);
}
