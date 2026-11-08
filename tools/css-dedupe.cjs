// editor.css 去重分析 / 清理：只删「一定不影响效果」的声明。
//   规则：同一个选择器（完整字符串相同）、同一条属性，后面的规则（顶层，或同一个 @media 里）又写了一遍，前面那条就一定被盖掉，可以删。
//   !important 的优先级照 CSS 规则算（前面是 !important、后面不是的不删）。选择器列表里只有一部分被盖掉的不动（要拆规则，需要人看）。
//   node tools/css-dedupe.cjs            只报告
//   node tools/css-dedupe.cjs --apply    删掉，规则里没有声明了就整条删
//   node tools/css-dedupe.cjs --families 列出同一个选择器出现多次的「规则家族」，给人手工合并时参考
const fs = require('node:fs');
const path = require('node:path');
const file = process.env.CSS_FILE || path.resolve(__dirname, '../common/src/main/resources/assets/cadeditor/ui/editor.css');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n'), src = raw.replace(/\r\n/g, '\n');
const args = process.argv.slice(2), APPLY = args.includes('--apply'), FAM = args.includes('--families');

// ---- 扫描：顶层规则、@media 里的规则；其余 @ 规则（keyframes / font-face …）整块跳过
function skipString(t, i) { const q = t[i]; i++; while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; } return i + 1; }
function skipComment(t, i) { const e = t.indexOf('*/', i + 2); return e < 0 ? t.length : e + 2; }
function findBlockEnd(t, open) { let d = 0, i = open; while (i < t.length) { const c = t[i]; if (c === '"' || c === "'") { i = skipString(t, i); continue; } if (c === '/' && t[i + 1] === '*') { i = skipComment(t, i); continue; } if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return i; } i++; } return t.length - 1; }
const rules = [];   // { sels:[…], media, start, end(含 }), declStart, decls:[{prop, value, important, start, end}] }
function parseDecls(t, a, b) {
  const out = []; let i = a, s = a, depth = 0;
  const flush = e => { const txt = t.slice(s, e); const m = txt.match(/^\s*([-\w]+)\s*:\s*([\s\S]*?)\s*$/); if (m) { const imp = /!\s*important\s*$/i.test(m[2]); out.push({ prop: m[1], value: m[2], important: imp, start: s, end: e }); } };
  while (i < b) {
    const c = t[i];
    if (c === '"' || c === "'") { i = skipString(t, i); continue; }
    if (c === '/' && t[i + 1] === '*') { i = skipComment(t, i); continue; }
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (c === ';' && depth === 0) { flush(i); s = i + 1; }
    i++;
  }
  flush(b);
  return out;
}
function scan(t, from, to, media) {
  let i = from;
  while (i < to) {
    const c = t[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && t[i + 1] === '*') { i = skipComment(t, i); continue; }
    const open = t.indexOf('{', i); if (open < 0 || open >= to) break;
    const head = t.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim(), end = findBlockEnd(t, open);
    if (head[0] === '@') {
      if (/^@media/i.test(head)) scan(t, open + 1, end, head.replace(/\s+/g, ' '));
    } else {
      rules.push({ sels: head.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean), media, start: i, end: end + 1, open, decls: parseDecls(t, open + 1, end) });
    }
    i = end + 1;
  }
}
scan(src, 0, src.length, '');

// ---- 找被后面盖掉的声明
const dead = [];   // { rule, decl, by }
rules.forEach((r, ri) => {
  r.decls.forEach(d => {
    let all = true, by = null;
    for (const sel of r.sels) {
      let hit = null;
      for (let rj = ri + 1; rj < rules.length && !hit; rj++) {
        const o = rules[rj];
        if (!(o.media === '' || o.media === r.media)) continue;
        if (o.sels.indexOf(sel) < 0) continue;
        const od = o.decls.filter(x => x.prop === d.prop).pop();
        if (od && (od.important || !d.important)) hit = o;
      }
      if (!hit) { all = false; break; } by = hit;
    }
    if (all && r.sels.length) dead.push({ rule: r, decl: d, by });
  });
});

const lineOf = pos => src.slice(0, pos).split('\n').length;
if (FAM) {
  const fam = {};
  rules.forEach(r => r.sels.forEach(s => { const k = (r.media ? r.media + ' ⟶ ' : '') + s; (fam[k] = fam[k] || []).push(lineOf(r.start)); }));
  Object.keys(fam).filter(k => fam[k].length > 1).sort((a, b) => fam[b].length - fam[a].length).forEach(k => console.log(fam[k].length + ' 处  ' + k + '  行 ' + fam[k].join(', ')));
  process.exit(0);
}
const byRule = new Map(); dead.forEach(x => { (byRule.get(x.rule) || byRule.set(x.rule, []).get(x.rule)).push(x); });
console.log('规则 ' + rules.length + ' 条，被后面同选择器同属性盖掉的声明 ' + dead.length + ' 个，涉及 ' + byRule.size + ' 条规则');
if (!APPLY) { dead.slice(0, 40).forEach(x => console.log('  行 ' + lineOf(x.decl.start) + '  ' + x.rule.sels[0] + '{ ' + x.decl.prop + ' } ← 行 ' + lineOf(x.by.start))); if (dead.length > 40) console.log('  …'); process.exit(0); }

// ---- 应用：从后往前删，避免位置错乱
let out = src; const edits = [];
byRule.forEach((list, r) => {
  const remaining = r.decls.length - list.length;
  if (remaining === 0) {
    // 整条规则删掉（连前面的换行 / 缩进一起）
    let s = r.start; while (s > 0 && (out[s - 1] === ' ' || out[s - 1] === '\t')) s--;
    let e = r.end; if (src[e] === '\n') e++;
    edits.push([s, e, '']);
  } else {
    list.forEach(x => {
      let s = x.decl.start, e = x.decl.end; if (src[e] === ';') e++;
      while (s > r.open + 1 && /\s/.test(src[s - 1]) && src[s - 1] !== '\n') s--;   // 吃掉前面的空格，保留换行
      edits.push([s, e, '']);
    });
  }
});
edits.sort((a, b) => b[0] - a[0]);
edits.forEach(([s, e, n]) => { out = out.slice(0, s) + n + out.slice(e); });
fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('已删除 ' + dead.length + ' 个声明（' + byRule.size + ' 条规则受影响）');
