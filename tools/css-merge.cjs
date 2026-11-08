// Merge duplicate selectors in editor.css without changing the cascade.
// usage: node tools/css-merge.cjs <css-file> [--write]
// A later rule B with the same selector (same @media context) is folded into the earlier rule A only if no rule between
// A and B declares a property in the same family as one of B's declarations (shorthand/longhand counted as one family).
// With a rule in between that touches the family, B stays where it is, so cascade order never changes.
const fs = require('node:fs');
const file = process.argv[2], write = process.argv.includes('--write');
if (!file) { console.error('usage: node tools/css-merge.cjs <css-file> [--write]'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');

// ---- tokenizer: top-level items are comment | at-rule block | at-rule statement | rule
function parseBlock(s, i, end) {
  const items = [];
  while (i < end) {
    const m = /^\s*/.exec(s.slice(i, end)); const ws = m[0]; i += ws.length;
    if (i >= end) { if (ws) items.push({ type: 'ws', text: ws }); break; }
    if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i) + 2; items.push({ type: 'comment', text: s.slice(i, e), lead: ws }); i = e; continue; }
    // read prelude up to { or ;
    let j = i, depthParen = 0, q = null;
    for (; j < end; j++) {
      const c = s[j];
      if (q) { if (c === q && s[j - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(') depthParen++; else if (c === ')') depthParen--;
      else if (depthParen === 0 && (c === '{' || c === ';')) break;
    }
    const prelude = s.slice(i, j);
    if (s[j] === ';') { items.push({ type: 'stmt', prelude, lead: ws }); i = j + 1; continue; }
    // matching brace
    let d = 0, k = j; q = null;
    for (; k < end; k++) {
      const c = s[k];
      if (q) { if (c === q && s[k - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k) + 1; continue; }
      if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; }
    }
    const body = s.slice(j + 1, k);
    if (prelude.trim().startsWith('@') && !/^@(font-face|keyframes|-webkit-keyframes)/.test(prelude.trim())) items.push({ type: 'at', prelude, children: parseBlock(s, j + 1, k), lead: ws });
    else items.push({ type: 'rule', prelude, body, lead: ws, atBlock: prelude.trim().startsWith('@') });
    i = k + 1;
  }
  return items;
}
function decls(body) {
  const out = []; let cur = '', paren = 0, q = null, com = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (com) { cur += c; if (c === '/' && body[i - 1] === '*') com = false; continue; }
    if (!q && c === '/' && body[i + 1] === '*') { com = true; cur += c; continue; }
    if (q) { cur += c; if (c === q && body[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(') paren++; if (c === ')') paren--;
    if (c === ';' && paren === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.filter(x => x.trim());
}
const family = d => { const p = (/^\s*(?:\/\*[\s\S]*?\*\/\s*)*([-\w]+)\s*:/.exec(d) || [])[1] || d.trim(); return p.startsWith('--') ? p : p.replace(/^-(webkit|moz|ms)-/, '').split('-')[0]; };
const norm = sel => sel.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();

let merged = 0, kept = 0;
function mergeItems(items) {
  const firstBySel = new Map();
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    if (it.type === 'at') { it.children = mergeItems(it.children); continue; }
    if (it.type !== 'rule' || it.atBlock || it.dead) continue;
    const key = norm(it.prelude);
    const a = firstBySel.get(key);
    if (!a) { firstBySel.set(key, { idx, it }); continue; }
    const fam = new Set(decls(it.body).map(family));
    let blocked = false;
    for (let k = a.idx + 1; k < idx && !blocked; k++) {
      const m = items[k];
      if (m.dead) continue;
      if (m.type === 'at') blocked = true; // an @media in between may override anything
      else if (m.type === 'rule') { if (m.atBlock) { if (/@font-face|@keyframes/.test(m.prelude)) continue; blocked = true; } else if (decls(m.body).some(d => fam.has(family(d)))) blocked = true; }
    }
    if (blocked) { kept++; continue; }
    const tail = a.it.body.replace(/\s*$/, '');
    a.it.body = tail + (tail.endsWith(';') || !tail.trim() ? '' : ';') + it.body.replace(/^\s*/, '\n  ').replace(/\s*$/, '') + '\n';
    it.dead = true; merged++;
  }
  return items.filter(x => !x.dead);
}
function print(items) {
  return items.map(it => {
    if (it.type === 'comment') return it.lead + it.text;
    if (it.type === 'stmt') return it.lead + it.prelude + ';';
    if (it.type === 'ws') return it.text;
    if (it.type === 'at') return it.lead + it.prelude + '{' + print(it.children) + '}';
    return it.lead + it.prelude + '{' + it.body + '}';
  }).join('');
}
const tree = parseBlock(src, 0, src.length);
const roundtrip = print(parseBlock(src, 0, src.length));
if (roundtrip.replace(/\s+/g, '') !== src.replace(/\s+/g, '')) { console.error('parser round-trip differs; refusing'); process.exit(1); }
const out = print(mergeItems(tree));
console.log(`merged ${merged} duplicate rules, ${kept} left in place (a rule in between touches the same property), ${src.length} -> ${out.length} bytes`);
if (write) { fs.writeFileSync(file, out); console.log('written'); }
