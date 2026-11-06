/* 通用卡片的专门化：这些组件在「附加设置」里仍是一行开关，但展开后用下面的专门控件，而不是自动生成的表单。
   选择项一律读游戏实时注册表，并保留手动输入。 */

function autoPut(cid, v) { Store.set(cid, v, { key: 'f-' + cid, structural: false }); }

/* ---- 声音：破坏音效 / 音符盒音效 ---- */
AUTO_BODY.break_sound = function (card, cid, v) {
  var id = typeof v === 'string' ? v : (v && typeof v.sound_id === 'string' ? v.sound_id : '');
  var f = kSoundField(id, function (x) { if (v && typeof v === 'object') { v = clone(v); v.sound_id = x; } else v = x; autoPut(cid, v); });
  headCtl(card, f.el);
};
AUTO_BODY.note_block_sound = function (card, cid, v) {
  var f = kSoundField(typeof v === 'string' ? v : '', function (x) { autoPut(cid, x); });
  headCtl(card, f.el);
};

/* ---- 乐器 / 唱片 ---- */
AUTO_BODY.instrument = function (card, cid, v) {
  if (typeof v !== 'string') { card.body.appendChild(renderComponentForm(cid, v, function (nv) { autoPut(cid, nv); }, Store.doc())); return; }
  var s = kRegSelect({ reg: 'instrument', value: v, title: '选择乐器', onChange: function (x) { if (x) autoPut(cid, x); } });
  headCtl(card, s.el);
};
AUTO_BODY.jukebox_playable = function (card, cid, v) {
  var obj = v && typeof v === 'object' && typeof v.song === 'string';
  if (!obj && typeof v !== 'string') { card.body.appendChild(renderComponentForm(cid, v, function (nv) { autoPut(cid, nv); }, Store.doc())); return; }
  var s = kRegSelect({ reg: 'jukebox_song', value: obj ? v.song : v, title: '选择唱片曲目', onChange: function (x) { if (!x) return; autoPut(cid, obj ? Object.assign(clone(v), { song: x }) : x); } });
  headCtl(card, s.el);
};

/* ---- 提示框样式：资源包提供的背景/边框，没有候选时直接输入 ID ---- */
AUTO_BODY.tooltip_style = function (card, cid, v) {
  var s = kRegSelect({ reg: 'tooltip_style', value: typeof v === 'string' ? v : '', title: '选择提示框样式', empty: '（未选择）', onChange: function (x) { if (x) autoPut(cid, x); } });
  headCtl(card, s.el);
};

/* ---- 基础名称（和自定义名称不同：它是物品自己的“默认名字”，不会显示成斜体） ---- */
AUTO_BODY.item_name = function (card, cid, v) {
  /* 三种写法：① 文字（可上色、加粗…）② 翻译键（游戏按当前语言显示，物品默认名就是这种）③ 高级：直接写 SNBT（带点击事件、extra 等复杂文本） */
  var d = Store.doc(), isBlk = !!(Reg.options("block") && Reg.hasItem && false);
  var defKey = "item.minecraft." + shortId(d.id);
  function isTr(x) { return isObj(x) && typeof x.translate === "string" && Object.keys(x).every(function (k) { return k === "translate" || k === "with" || k === "fallback"; }) && (x.with === undefined || (Array.isArray(x.with) && x.with.every(function (a) { return typeof a === "string"; }))); }
  function modeOf(x) { if (x === undefined || typeof x === "string") return "text"; if (isTr(x)) return "tr"; if (typeof tcSimple === "function" && tcSimple(x)) return "text"; return "raw"; }
  var mode = modeOf(v), body = h("div", { class: "tc-body" });
  var modes = kSeg([{ v: "text", label: "文字" }, { v: "tr", label: "翻译键" }, { v: "raw", label: "高级 SNBT" }], mode, function (m) {
    if (m === mode) return;
    if (m === "tr") v = isTr(v) ? v : { translate: defKey };
    else if (m === "text") v = (typeof v === "string" || (typeof tcSimple === "function" && tcSimple(v))) ? v : "";
    mode = m; if (v !== "") autoPut(cid, v); draw();
  });
  card.body.appendChild(fieldRow("写法", modes.el));
  card.body.appendChild(body);
  function draw() {
    clear(body);
    if (mode === "text") {
      var t = kRich(v === undefined ? "" : v, { placeholder: "输入基础名称", def: { color: itemTone(), italic: false, placeholder: nameOfItem(d.id) }, onChange: function (nv, empty) { if (!empty) { v = nv; autoPut(cid, nv); } } });
      body.appendChild(t.el);
    } else if (mode === "tr") {
      var key = isTr(v) ? v.translate : defKey, args = isTr(v) && v.with ? v.with.slice() : [];
      function put() { var o = { translate: key }; if (args.length) o.with = args.slice(); v = o; autoPut(cid, o); }
      body.appendChild(fieldRow("翻译键", kInput(key, function (x) { key = x; put(); }, { placeholder: defKey }), "游戏按玩家当前语言显示这个键对应的文字；这件物品的默认键是 " + defKey));
      var list = h("div", { class: "k-sortlist" });
      var drawArgs = function () {
        clear(list);
        args.forEach(function (a, n) {
          var rm = h("div", { class: "k-mini del", text: "×", title: "删除" }); activate(rm, function () { args.splice(n, 1); put(); drawArgs(); });
          list.appendChild(h("div", { class: "k-lrow" }, [h("span", { class: "ix", text: "%" + (n + 1) + "$s" }), h("div", { class: "grow" }, [kInput(a, function (x) { args[n] = x; put(); }, { placeholder: "参数" })]), rm]));
        });
        if (!args.length) list.appendChild(h("div", { class: "k-empty", text: "没有参数" }));
      };
      var add = h("div", { class: "k-add" }, [uiIcon("plus", 12), "添加参数"]); activate(add, function () { args.push(""); put(); drawArgs(); });
      drawArgs(); body.appendChild(fieldRow("文字参数", h("div", {}, [list, add]), "替换翻译里的 %s"));
    } else {
      var ta = h("textarea", { class: "ed-snbt tc-raw", spellcheck: "false" }), msg = h("div", { class: "k-sub" });
      ta.value = toSnbt(v === undefined ? "" : v, null, true);
      ta.addEventListener("input", function () { try { var pv = parseSnbtUser(ta.value); v = pv; msg.textContent = ""; autoPut(cid, pv); } catch (e) { msg.textContent = "SNBT 有误：" + (e.message || e); } });
      body.appendChild(ta); body.appendChild(msg);
      setTimeout(function () { if (typeof growable === "function") growable(body); }, 0);
    }
  }
  draw();
};

/* ---- 自定义模型数据：四组数组，资源包的模型选择读它们 ---- */
AUTO_BODY.custom_model_data = function (card, cid, v) {
  var m = clone(v && typeof v === 'object' ? v : {});
  ['floats', 'flags', 'strings', 'colors'].forEach(function (k) { if (!Array.isArray(m[k])) m[k] = []; });
  function put() { var o = {}; ["floats", "flags", "strings", "colors"].forEach(function (k) { if (m[k].length) o[k] = m[k].slice(); }); autoPut(cid, o); }
  function toInt(x) { return Array.isArray(x) ? ((Math.round(x[0] * 255) << 16) | (Math.round(x[1] * 255) << 8) | Math.round(x[2] * 255)) : x; }
  function setAt(key, idx, val, fill) { while (m[key].length <= idx) m[key].push(fill); m[key][idx] = val; put(); }
  /* ① 这个物品的模型定义（资源包 / 模组里的 items/*.json）实际在读哪些自定义模型数据 */
  var d = Store.doc(), mid = d.comps.item_model !== undefined ? String(d.comps.item_model) : d.id;
  var hints = Reg.hintsOf(Reg.full(mid));
  var top = h("div", { class: "cmd-hints" });
  if (hints === null) top.appendChild(h("div", { class: "k-sub", text: Reg.live() ? "正在读取这个物品的模型定义…" : "未连接游戏，无法读取模型定义；可以直接填下面的原始数组。" }));
  else if (!hints.length) top.appendChild(h("div", { class: "k-sub", text: "这个物品的模型定义里没有用到自定义模型数据（或没有找到模型文件），所以现在填什么都不会改变外观。需要时可以在下面直接填写。" }));
  else {
    top.appendChild(h("div", { class: "k-sub", text: "这个物品的模型会根据下面这些值切换外观：" }));
    hints.forEach(function (hn) {
      var idx = hn.index || 0, row = h("div", { class: "fld" });
      var lab = { flag: "开关 #" + idx, range: "数字 #" + idx, select: "文字 #" + idx, color: "颜色 #" + idx }[hn.kind] || (hn.kind + " #" + idx);
      row.appendChild(h("div", { class: "fl", title: hn.kind + " index " + idx }, [h("div", { class: "fk", text: lab })]));
      var ctl = h("div", { class: "fc" });
      if (hn.kind === "flag") ctl.appendChild(kToggle(!!m.flags[idx], function (on) { setAt("flags", idx, on, false); }, "").el);
      else if (hn.kind === "range") {
        var cur = typeof m.floats[idx] === "number" ? m.floats[idx] : 0, box = h("div", { class: "cmd-rg" });
        box.appendChild(kNumber(cur, { min: -1e9, max: 1e9, step: 1, dec: 4, noSlider: true, onChange: function (nv) { setAt("floats", idx, nv, 0); } }).el);
        if (hn.thresholds && hn.thresholds.length) { var pr = h("div", { class: "k-chips" }); hn.thresholds.forEach(function (t) { var ch = h("div", { class: "k-chip", text: "≥ " + fmtNum(t), title: "模型在数值达到 " + fmtNum(t) + " 时切换" }); activate(ch, function () { setAt("floats", idx, t, 0); }); pr.appendChild(ch); }); box.appendChild(pr); }
        ctl.appendChild(box);
      } else if (hn.kind === "select") {
        var cs = h("div", { class: "k-chips" }), curS = m.strings[idx];
        (hn.cases || []).forEach(function (cv) { var ch = h("div", { class: "k-chip" + (curS === cv ? " on" : ""), text: cv }); activate(ch, function () { setAt("strings", idx, cv, ""); Array.prototype.forEach.call(cs.children, function (x) { x.classList.remove("on"); }); ch.classList.add("on"); }); cs.appendChild(ch); });
        ctl.appendChild(cs);
      } else if (hn.kind === "color") ctl.appendChild(kColor(toInt(m.colors[idx]) || 0xFFFFFF, function (cv) { setAt("colors", idx, cv, 0xFFFFFF); }, {}).el);
      row.appendChild(ctl); top.appendChild(row);
    });
  }
  card.body.appendChild(top);
  /* ② 原始数组：模型没有声明用什么时，或者你想直接编辑时 */
  var raw = h("div", { class: "cmd-raw" });
  function group(key, title, makeCtl, def) {
    var list = h("div", { class: "k-sortlist" });
    function draw() {
      clear(list);
      m[key].forEach(function (val, i) {
        var rm = h("div", { class: "k-mini del", text: "×", title: "删除" }); activate(rm, function () { m[key].splice(i, 1); put(); draw(); });
        list.appendChild(h("div", { class: "k-lrow" }, [h("span", { class: "ix", text: "#" + i }), h("div", { class: "grow" }, [makeCtl(val, function (nv) { m[key][i] = nv; put(); })]), rm]));
      });
      if (!m[key].length) list.appendChild(h("div", { class: "k-empty", text: "空" }));
    }
    var add = kBtn("添加", function () { m[key].push(def()); put(); draw(); }, { icon: "plus" });
    draw(); raw.appendChild(h("div", { class: "l6-h" }, [h("span", { text: title }), add])); raw.appendChild(list);
  }
  group("floats", "数字", function (val, set) { return kNumber(+val, { min: -1e9, max: 1e9, step: 0.1, dec: 4, noSlider: true, onChange: set }).el; }, function () { return 0; });
  group("flags", "开关", function (val, set) { return kToggle(!!val, set, "").el; }, function () { return false; });
  group("strings", "文字", function (val, set) { return kInput(String(val), set, { placeholder: "文字" }); }, function () { return ""; });
  group("colors", "颜色", function (val, set) { return kColor(toInt(val), set, {}).el; }, function () { return 0xFFFFFF; });
  var open = false, head = h("div", { class: "cmd-head" }, [uiIcon("forward", 10), h("span", { text: "原始数组（高级）" })]);
  raw.style.display = "none";
  activate(head, function () { open = !open; raw.style.display = open ? "" : "none"; head.firstChild.src = "oriel:textures/icons/" + (open ? "down" : "forward") + ".png"; });
  card.body.appendChild(head); card.body.appendChild(raw);
};
