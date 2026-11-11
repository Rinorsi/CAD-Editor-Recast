# 译名与 i18n 源码清单

日期：2026-11-10。仅静态读取源码和缓存原版语言文件，未运行测试、构建或游戏。

- 页面源码（不含样例 data.js）有 3752 处含中文字符串，分布在 37 个文件。
- 其中 359 处原文与原版语言包条目相同；仅是复用候选，不能据文字相同绑定无关键。
- data.js 有 3058 处，单列为浏览器样例。
- labels.js 集中定义 20 组标签/配置。

这是字符串词法清单，不是完整 JS 语法分析或错误译名计数；包含编辑器按钮、说明、诊断、回退及格式片段。完整位置与原文见 locale-inventory.json。

## 本轮已修正

- uncommon：优秀 → 少见；common：普通 → 常见。rare 仍为稀有，epic 仍为史诗。卡片、表单和摘要统一来源。
- 实时游戏枚举译文优先，修复手写标签覆盖译名的问题。
- 游戏模式 4 项使用 gameMode.*；装备属性生效位置 11 项使用 item.modifiers.*。
- 热带鱼图案、烟花形状、染料/文本颜色使用语义匹配的游戏键。
- 方块名称先取 block 注册表，避免 carrots 被英文物品回退名抢先覆盖。
- powered 字段标签按要求改为激活，NBT 字段名不变。

## 本地文案与尚未迁移的类别

- 方块状态名及值、NBT 行为开关和实体字段说明：原版通常没有直接对应的语言键。
- 属性运算短名、候选分类、附魔标签分类、保险库分区属于本地操作文案。
- 稀有度：三版 zh_cn.json 没有 rarity.*；使用 Wiki 术语回退，资源包提供真实译文时优先读取。
- 装备槽短名仍有本地标签；生效位置整句已改用游戏语言键。
- 页面标题、按钮、设置和诊断仍有直接中文；项目尚未完成整套界面的多语言化。

## 权威名称的现有路径

物品、方块、实体、附魔、属性和效果等候选来自当前游戏实时注册表/description；不得用 data.js 或手写别名覆盖实时译文。

## 语言文件

| 版本索引 | zh_cn SHA-1 | 键数 | rarity.* 键数 |
|---|---|---:|---:|
| 26.1.2-30.json | bd3b3df108c1eaf78b6b8904c9f0842a7b110d5c | 8670 | 0 |
| 26.2-32.json | bd3b3df108c1eaf78b6b8904c9f0842a7b110d5c | 8670 | 0 |
| 26.3-34.json | bd3b3df108c1eaf78b6b8904c9f0842a7b110d5c | 8670 | 0 |

## 文件分布

| 文件 | 含中文字符串出现次数 |
|---|---:|
| screens.js | 295 |
| labels.js | 279 |
| worldentity.js | 272 |
| cards3.js | 269 |
| worldview.js | 259 |
| cards2.js | 256 |
| cards1.js | 234 |
| picker.js | 183 |
| pages.js | 174 |
| spawn.js | 163 |
| forms.js | 155 |
| vault.js | 130 |
| world.js | 130 |
| worldplayerx.js | 129 |
| worldplayer.js | 119 |
| worldedit.js | 112 |
| core.js | 77 |
| specs.js | 76 |
| eschema.js | 57 |
| vaultworld.js | 56 |
| kit.js | 50 |
| rules.js | 48 |
| cards4.js | 39 |
| drafts.js | 38 |
| code.js | 26 |
| kit2.js | 26 |
| reg.js | 21 |
| nbt.js | 19 |
| app.js | 12 |
| slots.js | 12 |
| banner.js | 10 |
| detail.js | 10 |
| genericview.js | 5 |
| cards5.js | 4 |
| mobsound.js | 3 |
| xlist.js | 3 |
| search.js | 1 |

## 参考

- https://zh.minecraft.wiki/w/稀有度
- https://zh.minecraft.wiki/w/鳕鱼桶
- https://zh.minecraft.wiki/w/刷怪蛋

Wiki 为术语/机制参考，具体版本行为以实际游戏源码与运行时为准。
