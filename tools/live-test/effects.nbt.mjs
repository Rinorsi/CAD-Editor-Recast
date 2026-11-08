// Read-only parser for MCTest blockEntity.nbt receipts. Not a game/editor write path.
// Deliberately rejects unsafe integers and unsupported syntax instead of guessing.
export function parseSnbt(text) {
  let at = 0;
  const ws = () => { while (/\s/.test(text[at] || '') && at < text.length) at++; };
  const fail = () => { throw new Error(`Unsupported SNBT at ${at}: ${text.slice(at, at + 50)}`); };
  function quoted() {
    const quote = text[at++]; let value = '';
    while (at < text.length) {
      const c = text[at++]; if (c === quote) return value;
      if (c === '\\') { const e = text[at++]; if (e === quote || e === '\\') value += e; else fail(); }
      else value += c;
    }
    fail();
  }
  function value() {
    ws(); const c = text[at];
    if (c === '"' || c === "'") return quoted();
    if (c === '{') {
      at++; const obj = Object.create(null); ws();
      while (text[at] !== '}') {
        ws(); let key;
        if (text[at] === '"' || text[at] === "'") key = quoted();
        else { const m = /^[A-Za-z0-9_.+-]+/.exec(text.slice(at)); if (!m) fail(); key = m[0]; at += key.length; }
        ws(); if (text[at++] !== ':') fail(); obj[key] = value(); ws();
        if (text[at] === '}') break; if (text[at++] !== ',') fail();
      }
      at++; return obj;
    }
    if (c === '[') {
      at++; ws(); if (/^[BIL];/i.test(text.slice(at))) at += 2;
      const arr = []; ws();
      while (text[at] !== ']') { arr.push(value()); ws(); if (text[at] === ']') break; if (text[at++] !== ',') fail(); }
      at++; return arr;
    }
    const m = /^[^\s,\]}]+/.exec(text.slice(at)); if (!m) fail(); at += m[0].length;
    const token = m[0];
    if (/^(true|false)$/i.test(token)) return token.toLowerCase() === 'true' ? 1 : 0;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[bslfd]?$/i.test(token)) {
      const n = Number(token.replace(/[bslfd]$/i, ''));
      if (!Number.isFinite(n) || (Number.isInteger(n) && !Number.isSafeInteger(n))) fail(); return n;
    }
    return token;
  }
  const result = value(); ws(); if (at !== text.length) fail(); return result;
}
export function assertSubset(actual, expected, path = '$') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${path}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
    expected.forEach((v, i) => assertSubset(actual[i], v, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    for (const [k, v] of Object.entries(expected)) assertSubset(actual?.[k], v, `${path}.${k}`);
  } else if (actual !== expected) throw new Error(`${path}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
