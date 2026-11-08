// Writes the machine-evidence part of docs/COVERAGE.md (last column) and docs/COVERAGE-signoff.md from
// docs/acceptance/components.json. It never ticks a box: "[x]" is the user's, per the release rules in COVERAGE.md.
// usage: node tools/coverage-sync.cjs [components.json]
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const evFile = process.argv[2] || path.join(root, 'docs/acceptance/components.json');
const ev = JSON.parse(fs.readFileSync(evFile, 'utf8'));
const byId = new Map(ev.components.map(c => [c.component, c]));
const day = (ev.generated_utc || '').slice(0, 10);
const covFile = path.join(root, 'docs/COVERAGE.md');
const lines = fs.readFileSync(covFile, 'utf8').split('\n');
const generic = [], special = [], missing = [];
const out = lines.map(line => {
  if (!line.startsWith('| `minecraft:')) return line;
  const cells = line.split('|'); // ['', id, name, form, source, status, '']
  const id = cells[1].trim().replace(/`/g, ''), form = cells[3].trim(), e = byId.get(id);
  const isGeneric = form === '通用表单';
  let machine;
  if (!e) { machine = '无实机回执'; missing.push(id); }
  else {
    const ok = e.applied_ok && e.reopen_equal && e.typed_fidelity && e.validate_ok && e.success === e.attempts && !e.timeouts && !e.rejected;
    machine = (ok ? '机器通过 ' : '机器未全过 ') + e.success + '/' + e.attempts + ' · ' + day + ' · [回执](acceptance/components.md)';
    if (!ok) missing.push(id);
  }
  (isGeneric ? generic : special).push({ id, name: cells[2].trim(), form, machine, e });
  const verdict = isGeneric ? '建议：通用表单足够（**待你确认**）' : '建议：专用界面';
  cells[5] = ' [ ] ' + machine + ' · ' + verdict + ' ';
  return cells.join('|');
});
fs.writeFileSync(covFile, out.join('\n'));
const md = ['# 1.0 签收清单（你只需要看这一页）', '',
  '由 `node tools/coverage-sync.cjs` 根据 [实机三轮回执](acceptance/components.md) 生成，不会替你勾选。',
  '',
  `机器证据：${ev.summary ? JSON.stringify(ev.summary) : ''}`, '',
  `## 一、要你确认「通用表单够用」的 ${generic.length} 项`, '',
  '这些组件没有专用界面，用的是按游戏 Codec 自动生成的通用表单。机器已证明：能增删改、保存、重开后值相等、类型不丢。',
  '你要判断的只有一件事：**这样用起来够不够顺手**。够用就在 COVERAGE.md 对应行把 `[ ]` 改成 `[x]`；不够就告诉我哪一项要做专用界面。', '',
  '| 组件 | 中文名 | 机器证据 | 你的结论 |', '|---|---|---|---|',
  ...generic.map(g => `| \`${g.id}\` | ${g.name} | ${g.machine} | [ ] 够用 / [ ] 要专用界面 |`), '',
  `## 二、专用界面的 ${special.length} 项`, '',
  '机器证据同上。这些的观感（布局、手感、动画、浅色主题）看 [人工清单](acceptance/CHECKLIST-for-user.md) 即可，不需要逐项勾。', '',
  '| 组件 | 中文名 | 形态 | 机器证据 |', '|---|---|---|---|',
  ...special.map(g => `| \`${g.id}\` | ${g.name} | ${g.form} | ${g.machine} |`), ''];
if (missing.length) md.push('## 三、机器证据不全的组件', '', ...missing.map(m => '- `' + m + '`'), '');
fs.writeFileSync(path.join(root, 'docs/COVERAGE-signoff.md'), md.join('\n'));
console.log(`components ${generic.length + special.length}: generic ${generic.length}, special ${special.length}, without full machine evidence ${missing.length}`);
