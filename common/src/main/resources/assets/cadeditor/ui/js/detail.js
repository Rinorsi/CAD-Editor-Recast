/* 详细编辑窗口：结构复杂（嵌套深、字段多、列表套列表）的组件，在窗口里放不下的时候，卡片里只留一行摘要 + 一个按钮，
   点开后在一个大窗口里编辑：左边是目录（分段），右边是这一段的表单。窗口可拖动、可缩放、双击标题全屏。
   - 表单类组件：按「说明书」（SPEC_FORMS）里的分段生成目录；没有说明书就按顶层字段分段
   - 带专用控件的组件（AUTO_BODY / 专用卡片）：整张卡片放进窗口里，宽度充足 */

/* 卡片里只放“摘要 + 编辑按钮”的通用组件 */
var DETAIL_AUTO = { blocks_attacks: 1, kinetic_weapon: 1, piercing_weapon: 1, profile: 1, bees: 1, can_break: 1, can_place_on: 1, map_decorations: 1, lodestone_tracker: 1, custom_model_data: 1 };
/* 专用卡片：保留原样，只在卡片头部多一个“放大”按钮 */
var DETAIL_BIG = { potion: 1, consumable: 1, consumeEffects: 1, tool: 1, equip: 1, deathProtection: 1, writtenBook: 1, writableBook: 1, fireworks: 1, extraAttrs: 1, container: 1, stew: 1 };
var DETAIL_IN = false;   // 正在窗口里构建卡片：不要再加“放大”按钮、通用卡片画完整表单
WORLD_DETAIL.forEach(function (cid) { DETAIL_AUTO[cid] = 1; });
/* 内容很少的数据类组件直接在卡片里展开，不开二级窗口 */
['block_state', 'debug_stick_state', 'lock', 'container_loot', 'pot_decorations', 'recipes', 'lodestone_tracker', 'profile', 'bucket_entity_data', 'custom_data'].forEach(function (cid) { delete DETAIL_AUTO[cid]; });

function detailShort(f) { return f.d ? f.d.split(/[，；;：:（(]/)[0] : f.k; }
/* 一行摘要：从值里挑几项最能说明“现在是什么样”的 */
function detailSummary(cid, v) {
  var c = CIDX[cid]; if (!c || !c.schema || c.schema.t !== 'obj' || !isObj(v)) return Array.isArray(v) ? v.length + ' 项' : '';
  var spec = SPEC_FORMS[cid], parts = [];
  c.schema.f.forEach(function (f) {
    if (parts.length >= 4 || v[f.k] === undefined) return;
    var ov = spec && spec.over && spec.over[f.k] || {}, lab = ov.label || detailShort(f), x = v[f.k];
    if (Array.isArray(x)) parts.push(lab + ' ' + x.length + ' 项');
    else if (typeof x === 'boolean') { if (x) parts.push(lab); }
    else if (typeof x === 'number') parts.push(lab + ' ' + fmtNum(x) + (ov.unit ? ov.unit : ''));
    else if (typeof x === 'string') parts.push(lab + (x.length < 20 ? '：' + (x.indexOf(':') > 0 ? shortId(x) : x) : ''));
    else if (isObj(x)) parts.push(lab + '（' + Object.keys(x).length + ' 项）');
  });
  return parts.length ? parts.join(' · ') : '全部使用默认值';
}

/* 目录：说明书里的分段；没有说明书时，标量字段归“基础”，对象 / 列表字段各占一段 */
function detailSections(cid) {
  var c = CIDX[cid], sc = c.schema, sp = SPEC_FORMS[cid];
  if (!sc || sc.t !== 'obj') return [{ id: 'all', label: c.name, keys: null }];
  var out = [];
  if (sp && sp.order) {
    var cur = null;
    sp.order.forEach(function (e) {
      if (typeof e !== 'string') { cur = { id: 's' + out.length, label: e.sec, keys: [] }; out.push(cur); }
      else { if (!cur) { cur = { id: 's0', label: '基础', keys: [] }; out.push(cur); } cur.keys.push(e); }
    });
    var used = {}; out.forEach(function (s) { s.keys.forEach(function (k) { used[k] = 1; }); });
    var rest = sc.f.filter(function (f) { return !used[f.k]; }).map(function (f) { return f.k; });
    if (rest.length) out.push({ id: 'rest', label: '其他', keys: rest });
    return out;
  }
  var basic = [];
  sc.f.forEach(function (f) {
    var t = f.s && f.s.t, big = t === 'obj' || t === 'arr' || t === 'map' || t === 'dunion' || (t === 'union' && f.s.a && f.s.a.some(function (a) { return a.t === 'arr' || a.t === 'obj'; }));
    if (big) out.push({ id: 'f' + f.k, label: detailShort(f), keys: [f.k] }); else basic.push(f.k);
  });
  if (basic.length) out.unshift({ id: 'basic', label: '基础', keys: basic });
  return out;
}

/* o: { cid, key?: 专用卡片的 makeCard 参数, title, icon } */
function openDetail(o) {
  var cid = o.cid, c = CIDX[cid], title = o.title || (c ? c.name : cid);
  var useCard = !!o.key || !!AUTO_BODY[cid] || !c || !c.schema || c.schema.t !== 'obj';
  var secs = useCard ? [{ id: 'all', label: title, keys: null }] : detailSections(cid), sel = secs[0].id;
  UI.detail = o; UI.detailSel = UI.detailSel && UI.detailCid === cid ? UI.detailSel : sel; UI.detailCid = cid;
  if (!secs.some(function (s) { return s.id === UI.detailSel; })) UI.detailSel = secs[0].id;
  var nav = h('div', { class: 'advnav' }), main = h('div', { class: 'advmain', id: 'detailmain' });
  var rst = h('div', { class: 'k-btn det-reset', title: '放弃这里的修改，使用物品原本的值' }, [h('span', { text: '恢复默认' })]);
  activate(rst, function () { var cs = o.cid ? [o.cid] : []; if (o.key && !cs.length) cs = cardComps(o.key); cs.forEach(function (c) { Ctx.reset(c); }); if (WORLD_DETAIL.indexOf(cid) >= 0 && !Ctx.has(cid)) closeModal(); });
  var win = modalShell({ icon: o.icon || 'edit', title: title, sub: nameOfItem(Store.doc().id), actions: [rst], id: 'detailwin',
    cls: 'advwin detailwin' + (secs.length > 1 ? ' hasnav' : '') + (WORLD_DETAIL.indexOf(cid) >= 0 ? ' worldwin' : '') + (cid === 'banner_patterns' ? ' bannerwin' : ''),
    body: h('div', { class: 'advbody' }, [secs.length > 1 ? nav : null, main]) });
  function paintNav() {
    clear(nav);
    secs.forEach(function (s) { var it = h('div', { class: 'advnav-i' + (UI.detailSel === s.id ? ' on' : '') }, [h('span', { text: s.label })]); activate(it, function () { UI.detailSel = s.id; paintNav(); drawDetail(); }); nav.appendChild(it); });
  }
  UI.detailSecs = secs;
  paintNav(); openModal(win); windowify(win, 'detail'); drawDetail();
}
function drawDetail() {
  var host = $('detailmain'), o = UI.detail; if (!host || !o) return;
  var top = host.scrollTop; clear(host);
  var cid = o.cid, d = Store.doc(), pad = h('div', { class: 'pad detail-pad' });
  host.appendChild(pad);
  var secs = UI.detailSecs || [], sec = secs.filter(function (s) { return s.id === UI.detailSel; })[0] || secs[0];
  if (o.key || AUTO_BODY[cid] || !CIDX[cid] || CIDX[cid].schema.t !== 'obj') {
    DETAIL_IN = true;
    try { var card = makeCard(o.key || ['auto', cid]); if (card) { card.el.classList.add('in-detail'); if (card.setCollapsed) card.setCollapsed(false); pad.appendChild(card.el); UI.detailCard = card; } }
    finally { DETAIL_IN = false; }
  } else {
    var c = CIDX[cid], sp = SPEC_FORMS[cid] || {}, val = d.comps[cid] !== undefined ? d.comps[cid] : clone(Ctx.proto(cid));
    var spec = { order: sec.keys || undefined, over: sp.over, compact: sp.compact, only: true };
    CURCID = cid;
    pad.appendChild(renderNode(c.schema, val, function (v, op) { Store.set(cid, v, { key: 'f-' + cid + (op && op.key ? op.key : ''), structural: false }); }, { compId: cid, path: '', spec: spec }));
  }
  host.scrollTop = top;
  decorate();
}

/* 卡片本身变成一行入口：头部显示摘要，点一下直接打开大窗口（没启用时仍是原来的开关行为） */
function detailize(card, o) {
  var cid = o.cid, head = card.el.firstChild, sum = head && head.querySelector('.k-csum'), chev = head && head.querySelector('.k-chev');
  if (!head || card.el.classList.contains('in-detail')) return;
  var always = o.key === 'trim' || (Array.isArray(o.key) && o.key[0] === 'trim');
  function on() { return always || (!!cid && Ctx.has(cid)); }
  function paint() { card.el.classList.toggle('det-on', on()); if (sum) sum.textContent = ''; }
  card.live.push(paint); paint();
  if (chev) { setTip(chev, '在独立窗口中编辑'); chev.classList.remove('up'); chev.classList.add('det'); clear(chev); chev.appendChild(uiIcon('external', 14)); card.el.classList.add('det-card'); }
  card.onHead = function (e) { if (!on()) return false; openDetail(o); return true; };
}
