// 从调研基线生成"编辑器覆盖全集"附录。用法：node tools/gen-universe.mjs
// 每个对象一行，带五个待勾选列；调研数据变化后重跑即可，不要手改生成物。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(path.resolve(root, '../Oriel-UI-Workspace/research/editor'), 'minecraft-editor-baseline');
const tasks = c => JSON.parse(fs.readFileSync(path.join(base, 'checklists', c + '.json'), 'utf8')).tasks;
const VERS = ['26.1', '26.1.1', '26.1.2', '26.2', '26.3'];

const OK = new Set(['present', 'persistent', 'documented_source_contract', 'supported_source_contract']);
const NAME = { absent: '不存在', transient_not_serializable: '瞬态不可写' };
function verText(v) {
  if (VERS.every(x => OK.has(v[x]))) return '全版本';
  const has = VERS.filter(x => OK.has(v[x]));
  const states = [...new Set(Object.values(v).filter(s => !OK.has(s)).map(s => NAME[s] || s))];
  if (!has.length) return states.join('/');
  return has.join(',') + '（其余:' + states.join('/') + '）';
}
const BOX = '| ☐ | ☐ | ☐ | ☐ | ☐ |';
const HEAD = '| 研究核准 | 网页实现 | 网页验收 | 游戏验收 | 无客户端验收 |';
const esc = s => String(s ?? '').replace(/\|/g, '/');
const out = [];
const P = s => out.push(s);

P('# 覆盖全集附录（自动生成，勿手改）');
P('');
P('由 `tools/gen-universe.mjs` 从 `research/minecraft-editor-baseline/checklists/` 生成。每个对象一行；五个方框依次是：研究核准 → 网页实现 → 网页验收 → 游戏验收 → **无客户端验收**（没装模组的原版客户端进服，看到和用到改后的结果）。主清单见 [PRODUCT-CHECKLIST.md](../PRODUCT-CHECKLIST.md)。');
P('');
P('"版本"列：全版本 = 26.1/26.1.1/26.1.2/26.2/26.3 均存在。"路线"列只填调研已确定的；没填 = 待调研（见主清单 §6）。');
P('');

// ---- A 物品组件
const comps = tasks('items');
P(`## A. 物品组件（${comps.length}）`);
P('');
P('路线通则：`/give`、`/item replace|modify`、`/data`（容器/实体/方块里的物品）、物品谓词；均写入存档，卸载模组后保持。标"不可写"的是瞬态组件，禁止开放编辑。');
P('');
P('| 组件 | 说明 | 版本 | 路线 ' + HEAD);
P('|---|---|---|---|---|---|---|---|---|');
let transient = 0;
for (const c of comps) {
  const id = c.id.replace('component:', '');
  const tr = Object.values(c.versions).some(s => /transient/.test(s));
  if (tr) transient++;
  P(`| ${id} | ${esc(c.title)} | ${verText(c.versions)} | ${tr ? '不可写' : ''} ${BOX}`);
}
P('');
P(`瞬态/不可写：${transient} 个。`);
P('');

// ---- B 实体
const ents = tasks('entities');
P(`## B. 实体（${ents.length}，含 player）`);
P('');
P('路线通则：`/summon`（新建）、`/data modify entity`（非玩家）、`/attribute`、`/effect`、`/tag`、`/team`、`/item replace entity`、`/ride`、`/rotate`、`/tp`。**player 单独成行：`/data` 对玩家只读，只能走专用命令。**');
P('');
P('| 实体 | 版本 ' + HEAD);
P('|---|---|---|---|---|---|---|');
for (const e of ents) P(`| ${e.title.replace('minecraft:', '')} | ${verText(e.versions)} ${BOX}`);
P('');

// ---- C 方块实体
const bes = tasks('block_entities');
P(`## C. 方块实体（${bes.length}）`);
P('');
P('另需覆盖：方块状态（1286 个方块的属性/枚举，`block[prop=value]`）、方块本身的放置（`/setblock` `/fill` `/clone` `/place`）。方块状态不是 NBT，两者分开编辑。');
P('');
P('| 方块实体 | 版本 ' + HEAD);
P('|---|---|---|---|---|---|---|');
for (const b of bes) P(`| ${esc(b.id.replace(/^[a-z_-]+:/, '').replace('minecraft:', ''))}（${esc(b.title)}） | ${verText(b.versions)} ${BOX}`);
P('');

// ---- D 命令
const CMD = {
  '对象数据': 'data item give summon attribute effect enchant kill damage ride rotate teleport tp experience xp clear loot tag swing spreadplayers gamemode spectate',
  '方块与世界': 'setblock fill fillbiome clone place forceload worldborder setworldspawn spawnpoint time weather gamerule difficulty defaultgamemode',
  '逻辑与计分': 'execute function schedule scoreboard trigger bossbar advancement recipe team datapack reload tick random return test stopwatch waypoint dialog compute',
  '表现与聊天': 'tellraw title particle playsound stopsound posteffect say me msg tell w teammsg tm',
  '查询（只读）': 'locate seed list help version fetchprofile',
  '服务器管理（默认不做）': 'ban ban-ip banlist pardon pardon-ip kick op deop whitelist stop save-all save-off save-on publish unpublish perf jfr setidletimeout transfer debug',
};
const catOf = {};
for (const [k, v] of Object.entries(CMD)) for (const n of v.split(' ')) catOf[n] = k;
const cmds = tasks('commands');
const left = cmds.filter(c => !catOf[c.id.replace('command:', '')]).map(c => c.id);
if (left.length) { console.error('未分类命令:', left); process.exit(1); }
P(`## D. 命令（${cmds.length}，按编辑器用途分类）`);
P('');
P('命令是**编辑器的执行后端**，不是每条都要做成界面：构造器按精确版本的语法树生成，执行前预览、执行后回读。别名（tp/tell/w/tm/xp）归并到主命令的界面。服务器管理类默认不做，除非你另行要求。');
P('');
for (const cat of Object.keys(CMD)) {
  const rows = cmds.filter(c => catOf[c.id.replace('command:', '')] === cat);
  P(`### ${cat}（${rows.length}）`);
  P('');
  P('| 命令 | 作用 | 版本 ' + HEAD);
  P('|---|---|---|---|---|---|---|---|');
  for (const c of rows) P(`| ${c.title} | ${esc(c.expected_result).slice(0, 60)} | ${verText(c.versions)} ${BOX}`);
  P('');
}

// ---- E 数据包定义族
const defs = tasks('definition_families');
P(`## E. 数据包定义族（${defs.length}）——"改规则"类内容，写成数据包文件`);
P('');
P('路线：生成到 `world/datapacks/<编辑器包名>/`，`/reload` 生效；数据包随存档，原版客户端无需模组。需先确认：服务器数据包同步给客户端的范围（附魔、变体、伤害类型等注册表会同步到客户端）。');
P('');
P('| 定义族 | 版本 ' + HEAD);
P('|---|---|---|---|---|---|---|');
for (const d of defs) P(`| ${d.id.replace('data-definition:', '')} | ${verText(d.versions)} ${BOX}`);
P('');

// ---- F–J 共享类
function simple(title, cat, note) {
  const rows = tasks(cat);
  P(`## ${title}（${rows.length}）`);
  P('');
  if (note) { P(note); P(''); }
  P('| 项 | 版本 ' + HEAD);
  P('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const id = r.id.replace(/^[a-z_-]+:/, '').replace('minecraft:', '');
    const t = r.title && r.title !== r.id && r.title !== id ? '（' + esc(r.title).slice(0, 40) + '）' : '';
    P(`| ${esc(id)}${t} | ${verText(r.versions)} ${BOX}`);
  }
  P('');
}
simple('F. 共享格式', 'shared_formats', '文本组件、选择器、NBT 路径、物品堆叠模板等：所有编辑器字段的公共控件，先做。');
simple('G. 状态效果', 'effects');
simple('H. 属性', 'attributes');
simple('I. 附魔', 'enchantments', '附魔既是物品上的数据，也是可在数据包里自定义的定义（见 E 的 enchantment）。');
simple('J. 组件子谓词', 'component_predicates', '用于选择器、谓词、`/clear`、`/execute if items` 等；不是物品组件本身。');

// ---- K 静态注册表
const regs = tasks('registry_families');
P(`## K. 静态注册表（${regs.length}）——主要作"选项来源"`);
P('');
P('这些是游戏内部类型表。绝大多数只提供下拉选项（按服务器**实际**注册表读取，含模组追加项），不直接写入。其中 game_rule、mob_effect、potion、particle_type、sound_event 等与命令/定义直接相关。');
P('');
P('| 注册表 | 版本 ' + HEAD);
P('|---|---|---|---|---|---|---|');
for (const r of regs) P(`| ${r.title.replace('minecraft:', '')} | ${verText(r.versions)} ${BOX}`);
P('');

// ---- L Brain 记忆
simple('L. 生物 Brain 记忆模块', 'brain_memories', '实体 `Brain.memories` 内的键。持久/瞬态分开，瞬态禁止写入。');

fs.writeFileSync(path.join(path.resolve(root, '../Oriel-UI-Workspace/research/editor'), 'appendix/universe.md'), out.join('\n') + '\n');
console.log('lines', out.length);
