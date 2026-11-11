/* 复杂结构的专用表单（在「详细编辑」窗口里使用）：头颅档案等；蜜蜂、地图标记、磁石追踪见 world.js，可破坏 / 可放置见 rules.js */

function numField5(val, def, opts, set) { return kNumber(typeof val === 'number' ? val : def, Object.assign({ min: -1e9, max: 1e9, step: 1, noSlider: true, onChange: set }, opts || {})).el; }

/* ---- 可破坏 / 可放置于（blockPredList 在 rules.js） ---- */
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
  var hd = card.el.firstChild, box = h('div', { class: 'card-head-select' }, [el]);
  card.el.classList.add('head-select-card');
  hd.appendChild(box); card.el.classList.add('flat'); card.onHead = function () { return true; };
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
    headCtl(card, dyeButton(typeof v === 'string' ? v : (Reg.preview() ? sc.en[0] : ''), function (x) { autoPut(cid, x); }));
  } else if (kind === 'reg') {
    headCtl(card, kRegSelect({ reg: sc.reg, value: typeof v === 'string' ? v : '', title: '选择' + c.name, empty: '（未选择）', onChange: function (x) { if (x) autoPut(cid, x); } }).el);
  } else {
    var entries = liveEnumOptions(cid, '') || Reg.schemaEnumOptions(sc);
    headCtl(card, combo({ options: entries, value: typeof v === 'string' ? v : '', free: true, onPick: function (x) { autoPut(cid, x); } }));
  }
}
