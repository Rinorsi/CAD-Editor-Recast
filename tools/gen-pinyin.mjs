// Reproducible generator: Node >=18 and Python >=3, standard libraries only.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'common/src/main/resources/assets/cadeditor/ui/js/pinyin-data.js');
const revision = 'fe29ad32bdf352b31a02b9936e537f575432e9a6';
const source = 'https://raw.githubusercontent.com/mozillazg/pinyin-data/' + revision + '/';
const temporary = await mkdtemp(join(tmpdir(), 'editor-pinyin-'));
const hash = (data, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const han = /[\p{Unified_Ideograph}\u3007]/u;
async function download(name, url, expected, algorithm = 'sha256', local) {
  let bytes;
  if (local) {
    try { bytes = await readFile(local); } catch {}
    if (bytes && hash(bytes, algorithm) !== expected) bytes = undefined;
  }
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  assert.equal(hash(bytes, algorithm), expected, name + ' checksum');
  await writeFile(join(temporary, name), bytes);
  return bytes.toString('utf8');
}
function parse(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^U\+([0-9A-F]+):\s*([^#]+)/i.exec(line);
    if (match) entries.set(String.fromCodePoint(parseInt(match[1], 16)), match[2].trim().split(','));
  }
  return entries;
}
function normalize(reading) {
  // Preserve diaeresis before stripping tone marks: lǜ -> lv, not lu.
  return reading.trim().toLowerCase().normalize('NFD').replace(/u\u0308/g, 'v').replace(/[\u0300-\u036f]/g, '');
}
function selfCheck(text) {
  assert.match(text, /^\/\*[\s\S]*?\*\/\nvar PINYIN_BY = \{[\s\S]*\};\n$/);
  const context = {};
  runInNewContext(text, context, { timeout: 1000 });
  for (const [character, readings] of [['中', ['zhong']], ['重', ['chong', 'zhong']], ['绿', ['lv']], ['女', ['nv']], ['银', ['yin']]]) {
    for (const reading of readings) assert.ok(context.PINYIN_BY[reading]?.includes(character), character + ': ' + reading);
  }
  return context.PINYIN_BY;
}
try {
  if (process.argv.includes('--check')) {
    const text = await readFile(output, 'utf8');
    const data = selfCheck(text);
    console.log('PASS: ' + Object.keys(data).length + ' readings; ' + Buffer.byteLength(text) + ' bytes; ' + output);
  } else {
    const [pinyinText, commonText, license] = await Promise.all([
      download('pinyin.txt', source + 'pinyin.txt', '2342a6f98c85dbc3c8d26aef31744876a36326c6466e51e9a0f16898c36c2011'),
      download('kMandarin_8105.txt', source + 'kMandarin_8105.txt', '3538219db8ef4809e8de51c82655aedabacbc54f92acbe6a0e6925156f845f76'),
      download('LICENSE', source + 'LICENSE', '9c048697be2502a16e8bcb282d5d465a07295b2def0ffb05a269c5d39dbe1586')
    ]);
    // Exact GB2312 repertoire, not GBK. Big5 common plane is A440..C67E.
    const repertoire = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', [
      'import json',
      'def chars(codec, common=False):',
      ' out=set()',
      ' for hi in range(0xA4 if common else 0xB0, 0xC7 if common else 0xF8):',
      '  for lo in range(0x40 if common else 0xA1, 0xFF):',
      '   if common and (0x7F<=lo<=0xA0 or (hi==0xC6 and lo>0x7E)): continue',
      '   try: out.add(bytes([hi,lo]).decode(codec))',
      '   except UnicodeDecodeError: pass',
      ' return "".join(sorted(out))',
      'print(json.dumps({"gb2312":chars("gb2312"),"big5":chars("big5",True)},ensure_ascii=True))'
    ].join('\n')], { encoding: 'utf8', windowsHide: true }));
    assert.equal([...repertoire.gb2312].length, 6763);
    assert.equal([...repertoire.big5].length, 5401);
    const common = parse(commonText);
    assert.equal(common.size, 8105);
    const selected = new Set([...repertoire.gb2312, ...repertoire.big5, ...common.keys()].filter(c => han.test(c)));
    // Official 26.1.2 asset-index 30, SHA1 b9d6fa3dac4ba9d951b661f712ebf9ca38403be2.
    // Non-English language files are asset objects, absent from merged code JARs.
    for (const [name, sha1] of [['zh_cn', 'bd3b3df108c1eaf78b6b8904c9f0842a7b110d5c'], ['zh_tw', '78d3e3ed6960fb921186c58576e9c1690ce4018a']]) {
      const cached = join(process.env.MC_ASSETS_DIR || join(homedir(), '.gradle/caches/neoformruntime/assets'), 'objects', sha1.slice(0, 2), sha1);
      const text = await download(name + '.json', 'https://resources.download.minecraft.net/' + sha1.slice(0, 2) + '/' + sha1, sha1, 'sha1', cached);
      for (const value of Object.values(JSON.parse(text))) for (const c of value) if (han.test(c)) selected.add(c);
    }
    const all = parse(pinyinText), grouped = new Map(), missing = [];
    for (const character of [...selected].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))) {
      if (!all.has(character)) { missing.push(character); continue; }
      for (const reading of new Set(all.get(character).map(normalize))) {
        assert.match(reading, /^[a-z]+$/, character + ': unsupported reading ' + reading);
        if (!grouped.has(reading)) grouped.set(reading, []);
        grouped.get(reading).push(character);
      }
    }
    assert.equal(missing.length, 0, 'Upstream has no reading for: ' + missing.join(''));
    const header = '/* Generated by tools/gen-pinyin.mjs; pinyin-data 0.16.0 @ ' + revision + '.\n' +
      'GB2312 + TGHZ2013(8105) + Big5 common(5401) + Minecraft 26.1.2 zh_cn/zh_tw.\n' + license.trim() + '\n*/\n';
    const text = header + 'var PINYIN_BY = {\n' + [...grouped.keys()].sort().map(key =>
      '  ' + JSON.stringify(key) + ': ' + JSON.stringify(grouped.get(key).join(''))).join(',\n') + '\n};\n';
    assert.ok(Buffer.byteLength(text) <= 150000, 'Generated file exceeds 150KB');
    selfCheck(text);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, text, 'utf8');
    console.log('PASS: ' + selected.size + ' characters; ' + grouped.size + ' readings; ' + Buffer.byteLength(text) + ' bytes; ' + output);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
