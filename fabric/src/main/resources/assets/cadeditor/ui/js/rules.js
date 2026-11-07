/* 方块规则（可放置于 / 可破坏）与方块状态，行结构和「其它属性加成」同款（xlist.js）。
   规则行点开 → 目标方块 / 方块状态 / 高级条件 / 删除。状态的属性名和可选值读游戏的方块属性表（Reg.blockProps），读不到时才手填。 */
function inDocument(el) {
  while (el && el.parentNode) el = el.parentNode;
  return !!el && (el === document.body || el === document || el === document.documentElement);
}
/* 规则目标 → 方块 ID 列表。#标签 要等宿主返回成员 */
function ruleTargetIds(blocks) {
  if (blocks === undefined) return { ids: [], wait: false };
  if (typeof blocks === 'string' && blocks.charAt(0) === '#') {
    var m = Reg.tagMembers('block', blocks.substring(1));
    return m ? { ids: m, wait: false } : { ids: [], wait: true };
  }
  return { ids: (Array.isArray(blocks) ? blocks : [blocks]).map(function (x) { return Reg.full(x); }), wait: false };
}
/* 合并若干方块的属性表：同名属性取值并集 */
function stateTable(target) {
  var props = {}, known = 0, wait = target.wait, ids = target.ids, bulk = ids.length > 24;
  if (bulk && !Reg.blockPropsAll()) wait = true;
  if (!bulk || !wait) ids.forEach(function (id) {
    var p = Reg.blockProps(id, bulk);
    if (p === null) { wait = true; return; }
    if (!p) return;
    known++;
    Object.keys(p).forEach(function (k) {
      var e = props[k] || (props[k] = { values: [], def: p[k].default });
      (p[k].values || []).forEach(function (x) { if (e.values.indexOf(x) < 0) e.values.push(x); });
    });
  });
  return { wait: wait, props: props, known: known };
}

/* 状态编辑：每行 图标+属性名 | 取值（≤4 个分段按钮，多的下拉）| 移除；底部「添加状态」从属性表里选，另有手动输入 */
function stateEditor(getTarget, value, onChange) {
  var obj = clone(isObj(value) ? value : {}), box = h('div', { class: 'st' }), list = h('div', { class: 'st-list' }), foot = h('div', { class: 'st-foot' });
  var off = Reg.on(function (kind, kinds) { if (!inDocument(box)) { off(); return; } if ((kinds || []).some(function (k) { return k === 'block_properties' || String(k).indexOf('tag:') === 0; })) draw(); });
  function put() { onChange(clone(obj)); }
  function valueCtl(key, cur, info) {
    var vals = info ? info.values.slice() : null;
    if (vals && vals.indexOf(cur) < 0) vals.push(cur);
    if (!vals) { var inp = kInput(cur, function (x) { obj[key] = x; put(); }, { placeholder: '属性值' }); inp.classList.add('st-input'); return inp; }
    if (vals.length <= 4) return kSeg(vals.map(function (x) { return { v: x, label: x }; }), cur, function (x) { obj[key] = x; put(); }).el;
    return kSelect(vals.map(function (x) { return { v: x, label: x }; }), cur, function (x) { obj[key] = x; put(); }).el;
  }
  function manualRow() {
    var row = h('div', { class: 'st-man' }), k = kInput('', function () {}, { placeholder: '属性名，如 facing' }), x = kInput('', function () {}, { placeholder: '属性值，如 north' }), msg = worldError();
    row.appendChild(k); row.appendChild(x);
    row.appendChild(kBtn('添加', function () {
      var name = k.value.trim();
      if (!name) { msg.textContent = '请填写属性名'; return; }
      if (Object.prototype.hasOwnProperty.call(obj, name)) { msg.textContent = '这个属性已经设置了'; return; }
      obj[name] = x.value; put(); draw();
    }));
    return h('div', {}, [row, msg]);
  }
  function draw() {
    var tb = stateTable(getTarget());
    clear(list); clear(foot);
    Object.keys(obj).forEach(function (key) {
      var info = tb.props[key], cur = typeof obj[key] === 'string' ? obj[key] : String(obj[key]);
      var right = h('div', { class: 'x-rt' }, [valueCtl(key, cur, info), kBtn('', function () { delete obj[key]; put(); draw(); }, { icon: 'trash', title: '移除这个状态' })]);
      list.appendChild(xField('sliders', key, right));
    });
    if (tb.wait) { foot.appendChild(h('div', { class: 'k-sub', text: '正在读取方块属性…' })); return; }
    var rest = Object.keys(tb.props).filter(function (k) { return !Object.prototype.hasOwnProperty.call(obj, k); });
    if (rest.length) {
      var add = xAdd('添加状态', function () {
        pickFrom(add, rest.map(function (k) { return { v: k, label: k, sub: tb.props[k].values.join(' / ') }; }), function (e) { obj[e.v] = tb.props[e.v].def !== undefined ? tb.props[e.v].def : tb.props[e.v].values[0]; put(); draw(); }, { width: 240 });
      });
      foot.appendChild(add);
    } else if (tb.known && !Object.keys(obj).length) foot.appendChild(xEmpty('这个方块没有可设置的状态'));
    foot.appendChild(worldFold('手动输入', manualRow(), !tb.known && !Object.keys(obj).length, tb.known ? '属性表里没有的才需要' : '没有读到属性表'));
  }
  draw(); box.appendChild(list); box.appendChild(foot);
  return box;
}

function ruleSummary(p) {
  var st = isObj(p.state) ? Object.keys(p.state).map(function (k) { return k + '=' + p.state[k]; }) : [], adv = ['nbt', 'components', 'predicates'].filter(function (k) { return p[k] !== undefined; }).length;
  var t = st.length ? '状态 ' + st.join('、') : '不限状态'; if (adv) t += ' · 高级条件 ' + adv + ' 项';
  return t;
}
function blockPredList(card, cid, v, what) {
  var arr = clone(v === undefined ? [] : (Array.isArray(v) ? v : [v])).map(function (p) { return typeof p === 'string' ? { blocks: p } : p; });
  var xl;
  function put() { if (!arr.length) { Ctx.disable(cid); closeModal(); return; } autoPut(cid, arr.length === 1 ? clone(arr[0]) : clone(arr)); }
  card.body.appendChild(h('div', { class: 'world-note', text: '仅冒险模式生效，命中任意一条规则即可。' }));
  function ruleIcon(p) {
    if (typeof p.blocks === 'string' && p.blocks.charAt(0) !== '#') return refIcon('block', p.blocks, 16);
    return uiIcon(p.blocks === undefined ? 'grid' : 'tag', 14);
  }
  xl = xList({
    items: function () { return arr; }, selected: arr.length === 1 ? 0 : -1,
    empty: '尚未允许任何方块，点下面添加规则',
    row: function (p, i) {
      var name = worldBlockName(p.blocks);
      return { icon: ruleIcon(p), title: name, sub: ruleSummary(p), tip: name, body: function () { return ruleBody(p, i); } };
    }
  });
  card.body.appendChild(xl.el);
  card.body.appendChild(h('div', { class: 'x-adds' }, [
    xAdd('添加规则', function () { worldBlockPicker(null, function (blocks) { arr.push({ blocks: blocks }); xl.select(arr.length - 1); put(); }, '为新规则选择目标方块'); }),
    xAdd('任意方块', function () { arr.push({}); xl.select(arr.length - 1); put(); })]));
  function ruleBody(p, i) {
    var nodes = [];
    nodes.push(xField('cube', '目标方块', h('div', { class: 'x-rt' }, [kBtn('更换', function () { worldBlockPicker(p.blocks, function (x) { p.blocks = x; put(); xl.draw(); }); }, { icon: 'refresh' })])));
    if (Array.isArray(p.blocks)) nodes.push(h('div', { class: 'k-sub x-tgt', text: p.blocks.map(worldBlockName).join('、') }));
    nodes.push(xSec('sliders', '方块状态', '不填则不限制'));
    nodes.push(stateEditor(function () { return ruleTargetIds(p.blocks); }, p.state, function (x) {
      if (Object.keys(x).length) p.state = x; else delete p.state; put();
    }));
    var adv = h('div', { class: 'world-adv' }), advN = 0;
    [['nbt', '方块实体数据', '方块内部存的数据，如箱子里的物品、告示牌上的文字。普通方块用不到。'], ['components', '必须带有的组件', '要求方块实体带有指定的物品组件及其值。'], ['predicates', '组件需满足的条件', '对方块实体的组件做范围判断，如附魔等级不低于 3。']].forEach(function (f) {
      var key = f[0], set = p[key] !== undefined; if (set) advN++;
      adv.appendChild(worldCond(f[1], f[2], set ? kBtn('移除', function () { delete p[key]; put(); xl.draw(); }) : null, worldRaw(set ? p[key] : {}, function (x) { p[key] = x; put(); })));
    });
    nodes.push(worldFold('高级条件', adv, advN > 0, advN ? '已设置 ' + advN + ' 项' : '一般用不到'));
    var extra = {}; Object.keys(p).forEach(function (k) { if (['blocks', 'state', 'nbt', 'components', 'predicates'].indexOf(k) < 0) extra[k] = p[k]; });
    if (Object.keys(extra).length) nodes.push(worldFold('其他条件（原样保留）', worldRaw(extra, function (x) { worldCompound(x); Object.keys(x).forEach(function (k) { if (['blocks', 'state', 'nbt', 'components', 'predicates'].indexOf(k) >= 0) throw new Error('请在对应字段编辑 ' + k); }); Object.keys(extra).forEach(function (k) { delete p[k]; }); Object.keys(x).forEach(function (k) { p[k] = x[k]; }); extra = x; put(); }), false));
    nodes.push(xFoot('', function () { arr.splice(i, 1); xl.select(-1); put(); }));
    return nodes;
  }
}

/* 方块状态组件：目标就是这个物品放下后的方块 */
AUTO_BODY.block_state = function (card, id, v) {
  var d = Store.doc(), item = d ? fullId(d.id) : '';
  card.body.appendChild(h('div', { class: 'world-note', text: '放下后，方块会带上这些状态。' }));
  card.body.appendChild(stateEditor(function () { return { ids: item ? [item] : [], wait: false }; }, v, function (x) { autoPut(id, x); }));
};
/* 调试棒状态：每个方块记住一个属性 */
AUTO_BODY.debug_stick_state = function (card, id, v) {
  var obj = clone(isObj(v) ? v : {}), list = h('div', { class: 'k-sortlist' });
  function put() { autoPut(id, clone(obj)); }
  function draw() {
    clear(list);
    Object.keys(obj).forEach(function (blk) {
      var p = Reg.blockProps(blk), names = p ? Object.keys(p) : null, cur = typeof obj[blk] === 'string' ? obj[blk] : '';
      var ctl;
      if (names && names.length) ctl = kSelect(names.map(function (n) { return { v: n, label: n, sub: p[n].values.join(' / ') }; }), cur, function (x) { obj[blk] = x; put(); }, { empty: '选择属性' }).el;
      else { ctl = kInput(cur, function (x) { obj[blk] = x; put(); }, { placeholder: '属性名' }); ctl.classList.add('st-input'); }
      list.appendChild(xRow({
        icon: refIcon('block', blk, 16), title: worldBlockName(blk), sub: '记住的属性', tip: blk,
        right: h('div', { class: 'x-rt' }, [ctl, kBtn('', function () { delete obj[blk]; put(); draw(); }, { icon: 'trash', title: '移除' })])
      }));
    });
    if (!Object.keys(obj).length) list.appendChild(xEmpty('还没有记住任何方块'));
  }
  var off = Reg.on(function (kind, kinds) { if (!inDocument(list)) { off(); return; } if ((kinds || []).indexOf('block_properties') >= 0) draw(); });
  card.body.appendChild(h('div', { class: 'world-note', text: '调试棒对每种方块记住的选中属性。' }));
  card.body.appendChild(list);
  card.body.appendChild(xAdd('添加方块', function () {
    openRegPick({ reg: 'block', title: '选择方块', onPick: function (bid) { var p = Reg.blockProps(bid), n = p ? Object.keys(p)[0] : ''; obj[Reg.full(bid)] = n || ''; put(); draw(); } });
  }));
  draw();
};
