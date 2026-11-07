# 界面公共组件与开发规范

本文记录界面层「收敛成一套公共组件」的重构进度，以及之后写界面时必须遵守的规范。
重构的原则：**界面看起来必须和现在完全一样**；任何会让页面外观或行为变化的改动，先列出来由用户决定。

## 一、规范（新增界面元素之前先读）

1. **写行、网格、选择器、弹窗、列表之前，先查下面的「现有公共组件」。** 不够用就扩展它，不要在页面文件里另写一套。
2. **禁止重复定义同名全局。** 界面脚本是全局函数、没有模块系统，后加载的同名定义会悄悄盖掉先加载的。`node tools/ui-lint.cjs` 会检查：同名全局函数、用 `name = function` 覆盖别处声明的函数、`AUTO_BODY.xxx` 重复定义，出现就报错。
3. **CSS 改原规则，不要在文件末尾追加覆盖。** 一个视觉元素只保留一套规则。`ui-lint` 会警告「整条被 `display:none` 隐藏、JS 里却仍在生成」的类。
4. **提交信息里写明复用了哪个公共组件**（或为什么现有组件不够）。
5. **不手写游戏数据清单**（物品 / 方块 / 实体 / 组件列表、范围、默认值）。这些来自游戏实时注册表和 Codec；界面中文标签可以手写，但要放进统一的标签文件（`js/labels.js`，建设中）。
6. 语法：ES5，`var`，函数声明；不用箭头函数 / `let` / `const` / 模板字符串；不引入模块系统和外部依赖。

## 二、现有公共组件（节选）

| 类别 | 组件 | 文件 |
| --- | --- | --- |
| 行与列表 | `xRow / xField / xSec / xAdd / xEmpty / xFoot / xList` | `js/xlist.js` |
| 折叠卡片 | `kCard`；`foldify(root, key)` 把 `xSec` 分区自动收成卡片 | `js/kit.js`、`js/xlist.js` |
| 控件 | `kBtn / kNumber / kInput / kSeg / kToggle / kSelect / kPopover / kSearchBox / kRegSelect / kColor / kTiles` | `js/kit.js`、`kit2.js`、`cards2.js`、`picker.js` |
| 选择窗 | `openPicker / openRegPick / pickItem / pickFrom` | `js/picker.js`、`js/kit.js` |
| 弹窗 | `modalShell / openModal / closeModal / windowify` | `js/screens.js` |
| 生物 | `esEntityHeader / esPanel / esGearLayout / esGearGrid / esAttrList / esEffects / heroEntity` | `js/eschema.js` |
| 格子 | `weSlotGrid / weSlotPop / weSlotPaint / weDndBind` | `js/worldplayer.js` |
| 保险库 | `Vault / openVault / openVaultSaveEntity / vaultNested / vaultEntityObj` | `js/vault.js` |
| 提示 | `toast(text, kind, key)`、`toastDismiss(key)` | `js/screens.js` |
| 窗口把手 | `makeSplit / ensureResize` | `js/screens.js` |

## 三、测试与安全网

| 命令（在仓库根目录运行） | 作用 |
| --- | --- |
| `node tools/ui-world-test.cjs` 等四个 `ui-*-test.cjs` | 行为测试 |
| `node tools/ui-snapshot.cjs` | 17 个页面的 DOM 快照，与 `tools/snapshots/*.txt` 逐字比对；`--update` 重写，加场景名只跑一部分 |
| `node tools/ui-lint.cjs` | 重复定义、被隐藏却仍在生成的类 |
| `bash tools/preview/baseline.sh baseline` / `after` | 4 张无头截图存到 `logs/ui/<标签>/`（不入库），并标出和 baseline 字节是否相同 |

`tools/lib/ui-harness.cjs` 是共用的假 DOM 加载器：按 `index.html` 的 `<script>` 顺序载入全部界面脚本，固定 `Date.now` 和 `Math.random`，所以快照可重复。

快照覆盖：物品页（钻石剑、潜影盒、刷怪蛋、刷怪笼，每个页签、卡片全部展开）、世界方块（箱子、告示牌、命令块、熔炉、刷怪笼）、世界生物（盔甲架、村民、展示实体、带乘客的猫）、玩家（五个页签）、保险库（物品、生物）、提示。

**快照与基线不同时：** 要么是改动出错（修掉），要么是明确要求的改动（在提交信息里写明，再 `--update`）。

快照没覆盖的：弹窗内部（选择窗、详细编辑、命令面板）、拖动和交互状态、真实 3D 预览与字体渲染。

## 四、进度

### 第 0 步：安全网 —— 已完成

- 新增 `tools/lib/ui-harness.cjs`、`tools/ui-snapshot.cjs`、`tools/snapshots/`、`tools/preview/baseline.sh`。
- 截图基线对同一份代码重复渲染字节相同，可以直接按字节比对。

### 第 1 步：死代码与检查脚本 —— 完成，`.k-note` 待用户决定

已删除（核对过确实被别处覆盖或无人使用）：

- `cards5.js`：`list5`（`world.js` 的版本才是实际使用的）、`AUTO_BODY.bees / map_decorations / lodestone_tracker`、`blockPredList`（`rules.js` 的版本才是实际使用的）。
- `world.js` 的 `list5`、`rules.js` 的 `blockPredList` 由「赋值覆盖」改成正式的函数声明。
- `cards2.js`：`ATTR_ICON`（无人读）。
- `cards3.js`：空的 `if (inf) {}`。
- `screens.js` / `worldedit.js`：`heroPopBind` 及其调用、`UI.heroPop`。

验证：四个行为测试通过；17 个快照与基线逐字相同（这些代码删除不影响任何页面输出）。

**审计里有一条核对后不成立：** 「`regEnumTable('attribute_operation')` 注册了两次」。`regEnumTable` 只是往表里追加一项；两处登记的是不同的表（`forms.js` 的 `OPS` 和 `cards2.js` 的 `OPMODES`），各自要同步游戏里的名字，所以不是重复。真正的重复是这两张中文标签表本身，留到第 2 步的 `labels.js` 合并。

**`.k-note { display:none }` 不是 bug，是有意为之：** 样式表里那条规则的注释写着「说明性小字一律不显示：卡片标题下的一行说明保留，其余提示不占版面」，对应用户「提示文字要少」的偏好。因此下面这些 `k-note` 一直是不可见的：

| 位置 | 文字 | 类型 |
| --- | --- | --- |
| `cards1.js:127` | 只影响名称颜色，不改变任何功能。 | 解释性 |
| `cards1.js:214` | 原版默认：…（耐久） | 默认值提示 |
| `cards1.js:221` | 这个物品没有耐久，所以没有磨损值。 | 空状态解释 |
| `cards1.js:396` | 数值越高，附魔台越容易给出更强的附魔… | 解释性 |
| `cards2.js:162` | 属性加成按"装备槽位"生效… | 解释性 |
| `cards2.js:191` | 这个物品没有自带的攻击距离，改动任何一项即启用。 | 空状态解释 |
| `cards2.js:354` | 皮革默认色是棕色 #A06540… | 解释性 |
| `cards3.js:150` | 这一项没有额外设置。 | 空状态解释 |
| `cards3.js:288` | 格子数量按这个容器的种类显示… | 解释性 |
| `kit2.js:181` | 这段文字带有翻译、点击事件等高级内容… | 解释性 |
| `pages.js:264` | `c.app`（组件的应用说明） | 解释性 |
| `screens.js:994` | 支持带数量和 !组件 移除语法… | 命令导入窗的用法说明 |

这一步没有显示也没有删除它们（显示会改变界面，删除会丢信息）。**待用户决定：** 空状态解释类（3 条）要不要显示；其余是否直接删除。统一提示组件 `kHint` 做好后一并处理。

`ui-lint` 目前还有 7 个警告：`.k-note`、`.k-numwarn`、`.k-redit`、`.ed-tcpanel`、`.ed-enrow`、`.ed-pop`、`.ed-pop-item` 被隐藏但 JS 仍在生成，多数在旧版 `forms.js` 里，随第 8 步淘汰旧控件时清理。

### 还没做

第 2 步（`labels.js`、`nameOf / iconOf`、`entityName`）及之后各步尚未开始。
