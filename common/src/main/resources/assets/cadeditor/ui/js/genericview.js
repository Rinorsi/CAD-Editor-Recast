/* 通用字段视图（P4-4）：没有专用视图的方块实体 / 实体（含模组的）。
   字段和类型来自后端对游戏实时注册表里每个类型的默认实例保存出来的 NBT 形状（docs/generic-schema-contract.md），
   值一律是 SNBT 字符串，保存时原样回传，后端严格保持原来的 NBT 类型。推断不准的字段只能去「数据」页改。 */
var GX_INT_RANGE = { byte: [-128, 127], short: [-32768, 32767], int: [-2147483648, 2147483647] };
function gxShort(s) { s = String(s === undefined ? '' : s); return s.length > 40 ? s.slice(0, 40) + '…' : s; }
function gxDecode(s) { try { var v = parseSnbt(String(s)); return typeof v === 'string' ? v : String(s); } catch (e) { return String(s); } }
function gxNote(f) { return f.read_only_reason || f.editable_reason || '请用「数据」页'; }
/* g：视图名；fields：schema.fields；get(g,k) / set(g,k,snbt)：方块和实体各自的草稿读写 */
function gxFields(body, g, fields, get, set) {
  var keys = Object.keys(fields || {});
  if (!keys.length) { body.appendChild(xEmpty('没有可以直接改的字段，请用「数据」页。')); return; }
  keys.forEach(function (key) {
    var f = fields[key] || {}, cur = get(g, key), kind = f.type || f.kind || 'unknown', nt = f.nbt_type || '';
    if (cur === undefined) cur = f.default_snbt === undefined ? '' : f.default_snbt;
    if (f.read_only || (f.editable && f.editable !== 'structured')) {
      body.appendChild(xRow({ icon: false, title: key, sub: gxNote(f), tip: key, right: h('span', { class: 'k-sub', text: gxShort(cur) }) })); return;
    }
    var m = (kind === 'integer' || kind === 'number') && nt !== 'long' ? /^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)([bBsSfFdD]?)\s*$/.exec(String(cur)) : null;
    if (m) {
      var isInt = kind === 'integer', rg = GX_INT_RANGE[nt] || GX_INT_RANGE.int;
      body.appendChild(xNum({ title: key, sub: nt, tip: key, value: Number(m[1]), min: isInt ? rg[0] : undefined, max: isInt ? rg[1] : undefined, step: isInt ? 1 : 0.1, dec: isInt ? 0 : 3, round: isInt, noSlider: true,
        onChange: function (v) { set(g, key, (isInt ? String(Math.round(v)) : String(v)) + m[2]); } }));
    } else if (kind === 'boolean') {
      body.appendChild(xToggle({ title: key, tip: key, value: /^(true|1b)$/.test(String(cur).trim()), onChange: function (on) { set(g, key, on ? 'true' : 'false'); } }));
    } else if (kind === 'string') {
      body.appendChild(xText({ title: key, tip: key, value: gxDecode(cur), cls: 'we-in', onCommit: function (v) { set(g, key, JSON.stringify(v)); } }));
    } else if (kind === 'identifier' && (f.registry_matches || []).length === 1 && typeof Reg !== 'undefined' && Reg.live() && (Reg.options(f.registry_matches[0].replace(/^minecraft:/, '')) || Reg.isLazy(f.registry_matches[0].replace(/^minecraft:/, '')))) {
      var reg = f.registry_matches[0].replace(/^minecraft:/, '');
      body.appendChild(xRow({ icon: false, title: key, sub: f.registry_matches[0], tip: key, right: kRegSelect({ reg: reg, value: gxDecode(cur), title: key, empty: '（未设置）', onChange: function (id) { set(g, key, JSON.stringify(id)); } }).el }));
    } else {
      body.appendChild(xText({ title: key, sub: kind + (nt ? ' · ' + nt : ''), tip: key, value: String(cur), placeholder: 'SNBT', cls: 'we-in',
        onCommit: function (v) {
          var text = v.trim();
          try { parseSnbtUser(text); } catch (e) { toast('「' + key + '」不是有效的 SNBT：' + (e.message || e), 'error', 'gx-bad'); return; }
          set(g, key, text);
        } }));
    }
  });
}
function gxIntro(body, spec) {
  if (spec && spec.available === false) body.appendChild(kHint(spec.editable_reason || '读不到这个类型的字段。', 'note'));
}
WEV.generic = function (body, g) {
  var v = weViews()[g] || {}, sc = v.schema || {};
  gxIntro(body, sc);
  gxFields(body, g, sc.fields, weVal, weSetV);
};
EV_SIMPLE_TAB.generic = function (body) {
  var g = 'generic', v = evGroup(g) || {}, sc = v.schema || {};
  gxIntro(body, sc);
  gxFields(body, g, evFields(g), evGet, evSet);
};
