// 生成 docs/STATUS.md 的组件表。用法：node tools/gen-status.cjs   （每次完成一项后重跑）
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..'), U = path.join(root, 'fabric/src/main/resources/assets/cadeditor/ui/js/');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(U + 'data.js', 'utf8') + ';this.E=EDATA;', ctx);
const E = ctx.E;
let src = ''; for (const f of ['cards1.js', 'cards2.js', 'cards3.js']) src += fs.readFileSync(U + f, 'utf8');
const dedicated = new Set();
for (const m of src.matchAll(/comps:\s*\[([^\]]*)\]/g)) for (const x of m[1].matchAll(/'([a-z_\/]+)'/g)) dedicated.add(x[1]);
// 本表手工维护的补充信息：组件 -> 数据来源状态
for (const x of ['enchantments', 'stored_enchantments', 'use_effects']) dedicated.add(x); // CARDS.enchants 用 comps:[cid] 动态传入
try { for (const m of fs.readFileSync(U + 'cards4.js', 'utf8').matchAll(/AUTO_BODY[.]([a-z_]+)[ ]*=/g)) dedicated.add(m[1]); } catch (e) {}
const live = { enchantments: '附魔列表读实时注册表', stored_enchantments: '附魔列表读实时注册表', use_effects: '效果列表读实时注册表', consumable: '音效读实时注册表', equippable: '音效读实时注册表' };
const rows = E.comps.map(c => {
  const d = dedicated.has(c.id);
  return `| ${c.name} | \`${c.id}\` | ${E.cats && E.cats.find ? ((E.cats.find(x => x.id === c.cat) || {}).name || c.cat) : c.cat} | ${d ? '专门卡片' : '通用表单'} | ${live[c.id] || (d ? '含内置清单（待核对）' : '由 Codec 结构生成')} | ${d ? '待核对' : '有原始编辑'} | ${c.id === 'custom_name' ? '已验证（自动化）' : '未验证'} | 未验收 |`;
});
const nd = E.comps.filter(c => dedicated.has(c.id)).length;
const out = `# 物品工坊 · 产品清单（自动生成，别手改）

更新：${new Date().toISOString().slice(0, 10)} · 重新生成：\`node tools/gen-status.cjs\` · 手写数据→官方来源的落地情况见 [STATUS-data.md](STATUS-data.md)，审计基线见 [audit-registry.md](audit-registry.md)

## 总览

| 范围 | 数量 | 说明 |
|---|---:|---|
| 物品数据组件 | ${E.comps.length} | 专门卡片 ${nd} · 通用表单 ${E.comps.length - nd} · 未做 0 |
| 实体 / 方块 / 命令方块 / 数据包 | 0 | 按决定暂不做（本期只做物品组件） |

列含义：**专门卡片** = 为这个组件单独设计了界面；**通用表单** = 由该组件的 Codec 结构自动生成表单（能编辑、能写回，但没有定制交互）；**未做** = 目前没有。
**Codec 往返**：研究 worker 已核对 107 个持久组件都能无损读写（静态）。**游戏内写回**：目前只有「自定义名称」被自动化测试在游戏里端到端验证过。**验收**：用户尚未验收任何一项，这里不替用户打勾。

## 物品数据组件

| 名称 | 组件 ID | 分类 | 界面 | 数据来源 | 手动输入 | 游戏内写回 | 用户验收 |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
fs.writeFileSync(path.join(root, 'docs/STATUS.md'), out);
console.log('rows', rows.length, 'dedicated', nd);
