/* SNBT 代码视图 / 编辑器：原生语法高亮、行号、一键格式化 / 压缩、实时检查并定位到出错的行列。
   默认直接使用 Oriel 原生 textarea：点击定位、跨行拖选、剪贴板、方向键 / Home / End、Shift 选区和撤销栈都由同一个原生文本模型处理。
   高亮由同一原生文本模型绘制，不创建第二块只读代码。 */
var KC_NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[bBsSlLfFdD]?$/;
var KC_ID = /^(["'])[a-z0-9_.-]+:[a-z0-9_.\/-]+\1$/;
var KC_CHUNK = 400, KC_INDENT_PX = 7;
function kcFontSize(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 8 && v <= 20 ? v : 12; }

/* 词法：不依赖整体能否解析，写到一半的 SNBT 也能上色。token = { t, s }，t：key str sid num bool kw word o0-o2 c0-c2 p ws nl bad */
function kcTokens(text, language) {
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
      else if (KC_NUM.test(tk.s) || /^[+-]?(?:NaN|Infinity)[fFdD]$/.test(tk.s)) tk.t = 'num';
      else if (/^[BIL]$/.test(tk.s) && out[k + 1] && out[k + 1].s === ';' && out[k - 1] && out[k - 1].t.charAt(0) === 'o') tk.t = 'kw';
    }
  }
  if (language === 'json') out.forEach(function (tk) {
    if (tk.t === 'key' || tk.t === 'str' || tk.t === 'sid') { if (tk.s.charAt(0) !== '"') tk.t = 'bad'; }
    else if (tk.t === 'num' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(tk.s)) tk.t = 'bad';
    else if (tk.s === 'null') tk.t = 'kw';
    else if (tk.t === 'kw' || tk.t === 'word' || tk.s === ';') tk.t = 'bad';
  });
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

/* kCode(o)：o = { value, height, readonly, placeholder, language, validate(text), onInput(text, err), onApply() }
   返回 { el, get(), set(text), focus(), check() }。 */
var KC_COLORS = { key:0xff7fc8ff, str:0xffe6b673, sid:0xff5fd3c0, num:0xffb5e07a, bool:0xffd98cff, kw:0xffd98cff, bad:0xffff6b6b, o0:0xffffd866, c0:0xffffd866, o1:0xffc792ea, c1:0xffc792ea, o2:0xff6ec0ff, c2:0xff6ec0ff };
function kcRanges(text, language) {
  var offset = 0, ranges = [];
  kcTokens(text, language).forEach(function (tk) { var end = offset + tk.s.length; if (KC_COLORS[tk.t] !== undefined) ranges.push({ start:offset, end:end, color:KC_COLORS[tk.t] }); offset = end; });
  return ranges;
}
// Only pending editors are retained. Lifecycle callers flush before replacing their owner.
var PendingCode = { entries: [], flushing:false, flush:function () {
  if (this.flushing) return; this.flushing = true;
  try { this.entries.slice().forEach(function (entry) { entry(); }); } finally { this.flushing = false; }
} };
function flushPendingCode() { PendingCode.flush(); }
document.addEventListener('mousedown', flushPendingCode, true);
function kCode(o) {
  o = o || {};
  var text = o.value === undefined || o.value === null ? '' : String(o.value), err = null, timer = null, nativeError = null, checkedText = null, parsed, pending = false;
  var ownerDoc = typeof Store !== 'undefined' ? Store.doc() : null, ownerWorld = typeof WE !== 'undefined' ? WE.w : null;
  function currentOwner() { return (typeof Store === 'undefined' || Store.doc() === ownerDoc) && (typeof WE === 'undefined' || WE.w === ownerWorld); }
  function cancelPending() { clearTimeout(timer); pending = false; var i = PendingCode.entries.indexOf(flush); if (i >= 0) PendingCode.entries.splice(i, 1); }
  function flush() {
    if (!pending) return; cancelPending();
    if (!currentOwner()) return;
    runCheck(); if (o.onInput) o.onInput(text, err, parsed); highlight();
  }
  var root = h('div', { class: 'kc' }), ta = h('textarea', { class: 'ed-snbt kc-ta', spellcheck: 'false', wrap: 'off', placeholder: o.placeholder || '' });
  var status = h('div', { class: 'kc-st k-sub' });
  var height = o.height || 320; ta.style.height = height + 'px'; ta.style.minHeight = '80px';
  var fontSize = kcFontSize(Prefs.get('codeFontSize', 12)), fontLabel = h('span', { class: 'kc-font-label' });
  function applyFont() {
    root.style.fontSize = fontSize + 'px'; root.style.lineHeight = (fontSize + 2) + 'px';
    // No textarea value assignment, reconstruction, selection or undo reset.
    ta.style.fontSize = fontSize + 'px';
    ta.style.lineHeight = (fontSize + 2) + 'px';
    fontLabel.textContent = String(fontSize);
  }
  function changeFont(delta) { fontSize = Math.max(8, Math.min(20, fontSize + delta)); applyFont(); Prefs.set('codeFontSize', fontSize); }
  applyFont();
  if (o.readonly) ta.setAttribute('readonly', 'true');
  ta.value = text;

  var language = o.language || 'snbt', validator = o.validate || (language === 'json' ? function (v) { JSON.parse(v); } : language === 'plain' ? function () {} : null);
  function highlight() {
    try {
      if (typeof ta.setTextHighlights !== 'function') throw new Error('需要匹配 Oriel 0.15.x 正式依赖');
      if (ta.setTextHighlights(text, language === 'plain' || text.length > 32768 ? [] : kcRanges(text, language), true) !== true) throw new Error('原生模型拒绝过期文本高亮');
      nativeError = null;
      root.setAttribute('data-highlight', 'native');
    } catch (e) {
      root.setAttribute('data-highlight', 'failed');
      if (!nativeError) { nativeError = '原生编辑高亮失败：' + (e.message || e); if (typeof EditorDiag !== 'undefined') EditorDiag.error('code.highlight.api', new Error(nativeError)); }
    }
  }
  var diagnostic = h('div', { class:'kc-diagnostic' }); diagnostic.style.display = 'none';
  activate(status, function () {
    if (!err && !nativeError) return;
    diagnostic.style.display = diagnostic.style.display === 'none' ? '' : 'none';
    if (err && err.pos !== null && typeof ta.setSelectionRange === 'function') { ta.focus(); ta.setSelectionRange(err.pos, Math.min(text.length, err.pos + 1)); }
  });
  function paintStatus() {
    status.classList.toggle('bad', !pending && !!err || !!nativeError);
    diagnostic.textContent = nativeError || (err ? (err.line ? '第 ' + err.line + ' 行第 ' + err.col + ' 列：' : '无法确定错误位置：') + err.message : '');
    if (nativeError) { status.textContent = '高亮不可用 · 查看原因'; return; }
    if (pending) { status.textContent = '待检查'; return; }
    if (!text.trim()) { status.textContent = ''; return; }
    status.textContent = err ? '✗ ' + (err.line ? '第 ' + err.line + ' 行第 ' + err.col + ' 列：' : '') + err.message : '✓ ' + (language === 'json' ? 'JSON' : language === 'plain' ? '文本' : 'SNBT') + ' 有效 · ' + text.split('\n').length + ' 行';
  }
  function runCheck() {
    if (checkedText !== text) {
      parsed = undefined;
      err = text.trim() ? kcCheck(text, function (v) { parsed = validator ? validator(v) : parseSnbt(v); }) : null;
      checkedText = text;
    }
    paintStatus(); if (err && !nativeError) status.textContent = '✗ ' + (err.line ? err.line + ':' + err.col + ' · ' : '') + '查看错误'; return err;
  }
  function set(v, silent) {
    cancelPending();
    text = v === undefined || v === null ? '' : String(v); if (ta.value !== text) ta.value = text; highlight(); runCheck();
    if (!silent && o.onText) o.onText(text);
    if (!silent && o.onInput) o.onInput(text, err, parsed);
  }
  function act(fn) { return function () { try { fn(); } catch (e) { toast('无法处理：' + (e.message || e), 'warn', 'kc-bad'); } }; }
  function tool(action, label, icon, fn, detail) {
    var button = kBtn('', fn, { icon:icon, cls:'kc-tool', title:label + (detail ? '：' + detail : '') });
    button.setAttribute('aria-label', label); button.setAttribute('data-code-action', action);
    return button;
  }
  var bFmt = tool('format', '格式化', 'list', act(function () { set(language === 'json' ? JSON.stringify(JSON.parse(text), null, 2) : kcFormat(text, false)); }), '按层级缩进，保留类型后缀');
  var bCmp = tool('compact', '压缩', 'layers', act(function () { set(language === 'json' ? JSON.stringify(JSON.parse(text)) : kcFormat(text, true)); }), '压成一行');
  var bCopy = tool('copy', '复制', 'copy', function () { copyText(text, '（' + text.length + ' 字符）'); });
  var bar = h('div', { class: 'kc-bar' }, [h('div', { class:'kc-actions' }, o.readonly ? [bCopy] : [bFmt, bCmp, bCopy])]);
  bar.appendChild(h('div', { class: 'kc-fonts', title: '仅调整 SNBT 字号，不改变全局界面比例或内容' }, [
    kBtn('A−', function () { changeFont(-1); }, { cls: 'sm', title: '缩小 SNBT 字号' }), fontLabel,
    kBtn('A+', function () { changeFont(1); }, { cls: 'sm', title: '放大 SNBT 字号' })
  ]));
  ta.addEventListener('input', function () {
    text = ta.value;
    if (o.onText) o.onText(text); // Preserve exact text now; parse only after the input pause.
    if (!pending) PendingCode.entries.push(flush); pending = true; paintStatus();
    clearTimeout(timer); timer = setTimeout(flush, 300);
  });
  ta.addEventListener('blur', flush);
  ta.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && o.onApply) { e.preventDefault(); flush(); o.onApply(); return; }
    if (!o.readonly && e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && document.documentElement.getAttribute('data-editor-code-indent') === 'ready') {
      e.preventDefault(); ta.setAttribute('data-code-indent', e.shiftKey ? 'out' : 'in');
      ta.dispatchEvent(new CustomEvent('ed:code-indent', { bubbles: true }));
    }
  });
  root.appendChild(bar); var surface = h('div', { class:'kc-surface' }, [ta, status]); root.appendChild(surface); root.appendChild(diagnostic);
  highlight(); runCheck();
  return { el: root, surface:surface, toolbar:bar, get: function () { flush(); return text; }, set: set, focus: function () { ta.focus(); }, flush:flush, check:function () { flush(); return runCheck(); } };
}
