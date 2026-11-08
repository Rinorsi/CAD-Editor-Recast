/* SNBT 代码视图 / 编辑器（类似 VS Code）：语法高亮、行号、按括号折叠、一键格式化 / 压缩、实时检查并定位到出错的行列。
   两种状态：「高亮」是只读的彩色视图（点哪一行就进入编辑），「编辑」是普通文本框（检查在输入时进行）。
   Oriel 没有 caret-color，透明文字叠层的做法行不通，所以高亮和编辑分成两个状态，而不是叠在一起。 */
var KC_NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[bBsSlLfFdD]?$/;
var KC_ID = /^(["'])[a-z0-9_.-]+:[a-z0-9_.\/-]+\1$/;
var KC_CHUNK = 400, KC_INDENT_PX = 7;

/* 词法：不依赖整体能否解析，写到一半的 SNBT 也能上色。token = { t, s }，t：key str sid num bool kw word o0-o2 c0-c2 p ws nl bad */
function kcTokens(text) {
  var out = [], i = 0, n = text.length, depth = 0, j, c;
  function push(t, s) { out.push({ t: t, s: s }); }
  while (i < n) {
    c = text.charAt(i);
    if (c === '\n') { push('nl', c); i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { j = i; while (j < n && ' \t\r'.indexOf(text.charAt(j)) >= 0) j++; push('ws', text.substring(i, j)); i = j; continue; }
    if (c === '"' || c === "'") {
      j = i + 1; while (j < n && text.charAt(j) !== c && text.charAt(j) !== '\n') { if (text.charAt(j) === '\\') j++; j++; }
      var closed = text.charAt(j) === c; j = Math.min(n, closed ? j + 1 : j);
      push(closed ? 'str' : 'bad', text.substring(i, j)); i = j; continue;
    }
    if (c === '{' || c === '[') { push('o' + (depth % 3), c); depth++; i++; continue; }
    if (c === '}' || c === ']') { depth = Math.max(0, depth - 1); push('c' + (depth % 3), c); i++; continue; }
    if (c === ',' || c === ':' || c === ';') { push('p', c); i++; continue; }
    j = i; while (j < n && ' \t\r\n{}[],:;"\''.indexOf(text.charAt(j)) < 0) j++;
    if (j === i) { push('bad', c); i++; continue; }
    push('word', text.substring(i, j)); i = j;
  }
  for (var k = 0; k < out.length; k++) {
    var tk = out[k], nx = k + 1;
    if (tk.t === 'word' || tk.t === 'str') {
      while (nx < out.length && (out[nx].t === 'ws' || out[nx].t === 'nl')) nx++;
      if (out[nx] && out[nx].t === 'p' && out[nx].s === ':') { tk.t = 'key'; continue; }
    }
    if (tk.t === 'str' && KC_ID.test(tk.s)) tk.t = 'sid';
    else if (tk.t === 'word') {
      if (tk.s === 'true' || tk.s === 'false') tk.t = 'bool';
      else if (KC_NUM.test(tk.s)) tk.t = 'num';
      else if (/^[BIL]$/.test(tk.s) && out[k + 1] && out[k + 1].s === ';' && out[k - 1] && out[k - 1].t.charAt(0) === 'o') tk.t = 'kw';
    }
  }
  return out;
}
/* 按行拆开，并算出每一行能折叠到哪一行（那一行里最外层、没在同行闭合的括号） */
function kcLines(tokens) {
  var lines = [[]], stack = [], fold = {};
  tokens.forEach(function (tk) {
    var L = lines.length - 1;
    if (tk.t === 'nl') { lines.push([]); return; }
    lines[L].push(tk);
    if (tk.t.charAt(0) === 'o') stack.push(L);
    else if (tk.t.charAt(0) === 'c' && stack.length) { var from = stack.pop(); if (from < L && (fold[from] === undefined || fold[from] < 0)) fold[from] = L; }
  });
  return { lines: lines, fold: fold };
}
function kcPos(text, pos) { var b = text.substring(0, pos), ln = b.split('\n').length; return { line: ln, col: pos - (b.lastIndexOf('\n') + 1) + 1 }; }
/* 检查：默认用 parseSnbt（不带副作用）；失败时尽量给出位置。返回 null 或 { message, pos, line, col } */
function kcCheck(text, validate) {
  try { if (validate) validate(text); else parseSnbt(text); return null; }
  catch (e) {
    var pos = typeof e.pos === 'number' ? e.pos : null, m = /第 (\d+) 个字符/.exec(e.message || '');
    if (pos === null && m) pos = Math.max(0, +m[1] - 1);
    var p = pos === null ? null : kcPos(text, Math.min(pos, text.length));
    return { message: String(e.message || e).replace(/^SNBT 第 \d+ 个字符：/, ''), pos: pos, line: p ? p.line : null, col: p ? p.col : null };
  }
}
function kcFormat(text, compact) { return nbtPrint(nbtParse(text), !compact); }

/* kCode(o)：o = { value, height, readonly, placeholder, validate(text), onInput(text, err), onApply(), mode:'view'|'edit' }
   返回 { el, get(), set(text), focus(), check() }。 */
function kCode(o) {
  o = o || {};
  var text = o.value === undefined || o.value === null ? '' : String(o.value), mode = o.mode || 'view', err = null, folded = {}, limit = KC_CHUNK, timer = null;
  var root = h('div', { class: 'kc' }), view = h('div', { class: 'kc-view' }), ta = h('textarea', { class: 'ed-snbt kc-ta', spellcheck: 'false', placeholder: o.placeholder || '' });
  var status = h('div', { class: 'kc-st k-sub' });
  var rowEls = {}, rawLines = [], height = o.height || 320; view.style.height = height + 'px'; ta.style.height = height + 'px'; ta.style.minHeight = height + 'px';
  if (o.readonly) ta.setAttribute('readonly', 'true');
  ta.value = text;

  function paintStatus() {
    status.classList.toggle('bad', !!err);
    if (!text.trim()) { status.textContent = ''; return; }
    status.textContent = err ? '✗ ' + (err.line ? '第 ' + err.line + ' 行第 ' + err.col + ' 列：' : '') + err.message : '✓ SNBT 有效 · ' + text.split('\n').length + ' 行';
  }
  function runCheck() { err = text.trim() ? kcCheck(text, o.validate) : null; paintStatus(); return err; }
  function drawView() {
    clear(view);
    if (!text.length) { view.appendChild(h('div', { class: 'kc-empty k-sub', text: o.placeholder || '（空）' })); return; }
    var L = kcLines(kcTokens(text)), lines = L.lines, shown = 0, i = 0;
    rowEls = {}; rawLines = text.split(String.fromCharCode(10));
    while (i < lines.length && shown < limit) {
      var row = h('div', { class: 'kc-r' + (err && err.line === i + 1 ? ' bad' : '') }), foldTo = L.fold[i];
      var fd = h('span', { class: 'kc-fd' });
      if (foldTo !== undefined && foldTo > i) {
        fd.textContent = folded[i] ? '▸' : '▾'; fd.classList.add('on');
        (function (line) { activate(fd, function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); folded[line] = !folded[line]; drawView(); }); })(i);
      }
      row.appendChild(h('span', { class: 'kc-no', text: String(i + 1) })); row.appendChild(fd);
      var code = h('span', { class: 'kc-code' }), toks = lines[i], t0 = 0;
      if (toks.length && toks[0].t === 'ws') { code.appendChild(h('span', { class: 'kc-ind', style: 'width:' + (toks[0].s.replace(/\t/g, '  ').length * KC_INDENT_PX) + 'px' })); t0 = 1; }
      for (var k = t0; k < toks.length; k++) code.appendChild(toks[k].t === 'ws' ? h('span', { text: ' ' }) : h('span', { class: 'kc-' + toks[k].t, text: toks[k].s }));
      if (foldTo !== undefined && foldTo > i && folded[i]) {
        code.appendChild(h('span', { class: 'kc-fold', text: ' … ' + (foldTo - i) + ' 行 ' }));
        var tail = lines[foldTo], ci = 0; while (ci < tail.length && tail[ci].t === 'ws') ci++;
        for (; ci < tail.length; ci++) if (tail[ci].t !== 'ws') code.appendChild(h('span', { class: 'kc-' + tail[ci].t, text: tail[ci].s }));
        i = foldTo;
      }
      row.appendChild(code); rowEls[i] = { row: row, code: code };
      if (!o.readonly) (function (line) { activate(row, function () { editLine(line); }); })(i);
      view.appendChild(row); shown++; i++;
    }
    if (i < lines.length) {
      var more = h('div', { class: 'kc-more k-sub', text: '还有 ' + (lines.length - i) + ' 行 · 点这里再显示 ' + KC_CHUNK + ' 行' });
      activate(more, function () { limit += KC_CHUNK; drawView(); }); view.appendChild(more);
    }
  }
  /* 就地编辑一行：这一行变成输入框，其余行保持彩色。Enter 新起一行（沿用缩进，遇到 { [ 多缩进两格），上下箭头换行，
     行首空行按退格删掉这一行，Esc 放弃这一行的改动。要粘贴多行或大段改动，用「整段」模式。 */
  function applyLines() { text = rawLines.join(String.fromCharCode(10)); ta.value = text; runCheck(); drawView(); if (o.onInput) o.onInput(text, err); }
  function editLine(i) {
    var r = rowEls[i]; if (!r || o.readonly) return;
    var inp = h('input', { class: 'k-input kc-li', type: 'text', spellcheck: 'false', value: rawLines[i] }), done = false;
    clear(r.code); r.code.appendChild(inp); r.row.classList.add('editing');
    inp.focus();
    function go(next, mutate) { done = true; if (mutate) mutate(); applyLines(); if (next !== undefined) editLine(next); }
    inp.addEventListener('keydown', function (e) {
      var k = e.key, v = inp.value;
      if (k === 'Enter') { e.preventDefault(); var ind = /^ */.exec(v)[0] + (/[\[{]\s*$/.test(v) ? '  ' : ''); go(i + 1, function () { rawLines[i] = v; rawLines.splice(i + 1, 0, ind); }); }
      else if (k === 'ArrowDown' && i + 1 < rawLines.length) { e.preventDefault(); go(i + 1, function () { rawLines[i] = v; }); }
      else if (k === 'ArrowUp' && i > 0) { e.preventDefault(); go(i - 1, function () { rawLines[i] = v; }); }
      else if (k === 'Backspace' && v === '' && rawLines.length > 1) { e.preventDefault(); go(Math.max(0, i - 1), function () { rawLines.splice(i, 1); }); }
      else if (k === 'Escape') { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); done = true; drawView(); }
    });
    inp.addEventListener('blur', function () { if (done) return; done = true; if (inp.value !== rawLines[i]) { rawLines[i] = inp.value; applyLines(); } });
  }
  function setMode(m, line) {
    mode = m; seg.set(m);
    view.style.display = m === 'view' ? '' : 'none'; ta.style.display = m === 'edit' ? '' : 'none';
    if (m === 'view') drawView();
    else { ta.value = text; if (line !== undefined && ta.scrollTop !== undefined) ta.scrollTop = Math.max(0, (line - 2) * 14); if (ta.focus) ta.focus(); }
  }
  function set(v, silent) {
    text = v === undefined || v === null ? '' : String(v); ta.value = text; runCheck();
    if (mode === 'view') drawView();
    if (!silent && o.onInput) o.onInput(text, err);
  }
  var seg = kSeg([{ v: 'view', label: '高亮', title: '彩色显示；点哪一行就直接改哪一行' }, { v: 'edit', label: '整段', title: '整段文本编辑，适合粘贴多行或大段修改' }], mode, function (v) { setMode(v); });
  function act(fn) { return function () { try { fn(); } catch (e) { toast('无法处理：' + (e.message || e), 'warn', 'kc-bad'); } }; }
  var bFmt = kBtn('格式化', act(function () { set(kcFormat(text, false)); }), { icon: 'refresh', title: '按层级缩进重新排版（保留所有类型后缀）' });
  var bCmp = kBtn('压缩', act(function () { set(kcFormat(text, true)); }), { icon: 'layers', title: '压成一行，方便粘进命令' });
  var bCopy = kBtn('复制', function () { copyText(text, '（' + text.length + ' 字符）'); }, { icon: 'copy' });
  var bFold = kBtn('', function () {
    var L = kcLines(kcTokens(text)), any = Object.keys(folded).some(function (k) { return folded[k]; });
    folded = {}; if (!any) Object.keys(L.fold).forEach(function (k) { if (+k > 0) folded[k] = true; });
    if (mode !== 'view') setMode('view'); else drawView();
  }, { icon: 'down', title: '折叠 / 展开除最外层以外的所有括号' });
  var bar = h('div', { class: 'kc-bar' }, o.readonly ? [bCopy, bFold] : [seg.el, bFmt, bCmp, bCopy, bFold]);
  ta.addEventListener('input', function () {
    var before = text; text = ta.value;
    if (o.onInput) o.onInput(text, kcCheck(text, o.validate));   // 站点要拿到最新文字，立刻通知
    clearTimeout(timer); timer = setTimeout(function () {
      runCheck();   // 状态栏和出错行稍后再刷新，别每个字符都重画
      /* 一次贴进来一大段单行 SNBT：自动排好版 */
      if (!err && text.length - before.length >= 30 && text.indexOf(String.fromCharCode(10)) < 0 && text.length > 60) { try { set(kcFormat(text, false)); } catch (e) {} }
    }, 180);
  });
  ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && o.onApply) { e.preventDefault(); o.onApply(); } });
  root.appendChild(bar); root.appendChild(view); root.appendChild(ta); root.appendChild(status);
  runCheck(); setMode(mode);
  return { el: root, get: function () { return text; }, set: set, focus: function () { setMode('edit'); }, check: runCheck };
}
