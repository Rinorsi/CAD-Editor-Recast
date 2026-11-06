// 以紧凑形式打印组件的结构定义：node tools/show-schema.mjs tool equippable ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const s = fs.readFileSync(path.join(root, 'fabric/src/main/resources/assets/cadeditor/ui/js/data.js'), 'utf8');
const E = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
function sh(n, d = 0) {
  if (!n) return '?';
  const ind = '  '.repeat(d);
  switch (n.t) {
    case 'obj': return '{\n' + n.f.map(f => ind + '  ' + f.k + (f.r ? '*' : '') + (f.df !== undefined ? '=' + JSON.stringify(f.df) : '') + ': ' + sh(f.s, d + 1) + (f.d ? '  // ' + f.d : '')).join('\n') + '\n' + ind + '}';
    case 'arr': return '[' + sh(n.i, d) + ']' + (n.max ? '≤' + n.max : '');
    case 'map': return 'map<' + sh(n.k, d) + ',' + sh(n.v, d) + '>';
    case 'str': return n.en ? 'enum(' + n.en.join('|') + ')' : 'str' + (n.reg ? '@' + n.reg : '') + (n.tag ? '#' : '');
    case 'int': case 'num': return n.t + (n.min !== undefined || n.max !== undefined ? '(' + (n.min ?? '') + '..' + (n.max ?? '') + ')' : '');
    case 'union': return n.a.map(x => sh(x, d)).join(' | ');
    case 'dunion': return 'by ' + n.disc + ' {\n' + Object.entries(n.br).map(([k, v]) => ind + '  ' + k + ': ' + sh(v, d + 1)).join('\n') + '\n' + ind + '}';
    case 'unit': return 'unit';
    default: return n.t + (n.hint ? ':' + n.hint : '');
  }
}
for (const id of process.argv.slice(2)) {
  const c = E.comps.find(x => x.id === id);
  console.log('## ' + id + '  ' + (c ? c.name : '(无)'));
  if (c) console.log(sh(c.schema));
}
