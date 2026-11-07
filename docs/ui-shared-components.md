# 界面公共组件与开发规范

本文记录界面层「收敛成一套公共组件」的结果，以及之后写界面时必须遵守的规范。
重构的原则：**界面看起来必须和重构前完全一样**；任何会让页面外观或行为变化的改动，先列出来由用户决定。
文末「给上游 Oriel 的建议」可以直接并入 Oriel 开发文档。

## 一、规范（新增界面元素之前先读）

1. **写行、网格、选择器、弹窗、列表、提示之前，先查「二、公共组件」。** 不够用就扩展它，不要在页面文件里另写一套。
2. **禁止重复定义同名全局。** 界面脚本是全局函数、没有模块系统，后加载的同名定义会悄悄盖掉先加载的。`node tools/ui-lint.cjs` 会检查：同名全局函数、用 `name = function` 覆盖别处声明的函数、`AUTO_BODY.xxx` 重复定义、函数体里无条件调用自己（无限递归），出现就报错。
3. **CSS 改原规则，不要在文件末尾追加覆盖。** 一个视觉元素只保留一套规则。`ui-lint` 会警告「整条被 `display:none` 隐藏、JS 里却仍在生成」的类。
4. **提交信息里写明复用了哪个公共组件**（或为什么现有组件不够）。
5. **不手写游戏数据清单**（物品 / 方块 / 实体 / 组件列表、范围、默认值）。这些来自游戏实时注册表和 Codec。界面中文标签可以手写，但只能放进 `js/labels.js`。
6. **提示文字要少。** 说明性小字默认不显示；只有「为什么这里是空的」这类空状态解释才保留，用 `kHint`。
7. 语法：ES5，`var`，函数声明；不用箭头函数 / `let` / `const` / 模板字符串；不引入模块系统和外部依赖。
8. **批量替换后必须跑 `ui-lint` 和全部测试。** 批量替换曾把 `optLabel` 的函数体替成了调用自己，从第 2 步提交一直留到第 5 步才被组件测试发现；`ui-lint` 现在会拦这类错误。

## 二、公共组件

### 行与控件（`js/xlist.js`、`js/kit.js`）

| 组件 | 用途与参数 |
| --- | --- |
| `xRow(o)` | 一行：图标、标题、副标题、右侧控件；`body` 给了就可展开，`grip` 给了行首出现抓手。其余行组件都建在它上面 |
| `xNum(o)` | 数值行。`{ title, sub, subOf(v), tip, icon, value, def, min, max, softMin, softMax, step, dec, unit, presets, warnMax, warnWhy, noSlider, round, stop, onChange }`；返回行，`row.num` 是 `kNumber` 控件 |
| `xToggle(o)` | 开关行。`{ title, sub, tip, icon, value, onChange(on) }`；`row.toggle` |
| `xText(o)` | 文本行，失焦或回车才提交。`{ title, sub, tip, icon, value, placeholder, cls, style, onCommit(text), onInput(text) }`；`row.input` |
| `xSeg(o)` / `xSelect(o)` | 分段选择行 / 下拉行。`{ title, sub, tip, icon, options:[{v,label}], value, onChange(v), width? }` |
| `xList(cfg)` | 可增删的行列表。`{ items(), row(it,i), empty, add:{text,fn(api)}, selected, sortable+onMove(from,to), context(it,i), scroll, onDrawn }`；返回 `{ el, draw(), select(i), selected() }` |
| `xAdd / xEmpty / xFoot / xField / xSec` | 虚线「＋ 添加」行、空状态、展开区底部提示加删除、字段行、分区 |
| `kInput(value, onChange, o)` | 单行文本。`o.onCommit(text)` 只在失焦或回车时触发，输入过程不打断 |
| `kNumber / kSeg / kToggle / kSelect / kPopover / kSearchBox / kRegSelect / kTiles` | 基础控件 |
| `kColorPop(anchor, value, onChange, o)` | 点开带取色器的小窗。`o = { width, maxHeight, cls, extra:[元素] }`，返回 `kColor` 控件 |
| `kHint(text, tone)` | 提示文字。`tone`：`sub`（默认，灰色小字）/ `note` / `err` / `hint`。新写的提示一律用它，不要再自己选类名 |
| `kSnbtEditor(value, set, validate)` | 带解析和校验的 SNBT 文本框（先校验再写入草稿，有「撤回输入」）。要让用户直接改一段 SNBT 时用它 |

### 格子（`js/slots.js`）

物品页的容器 / 收纳袋、世界页的容器、玩家背包 / 末影箱共用这一套。格子只认「视图」`{ id, count, marked?, empty? }`；栈有线格式 `{ id, count, comps, removed }`（世界页）和物品组件里的嵌套格式 `{ slot, item }`（物品页）两种，嵌套格式由调用方做适配（例子见 `cards3.js` 的容器和收纳袋）。

| 组件 | 用途与参数 |
| --- | --- |
| `kSlotGrid(cfg)` | 一片格子，带点开改物品、右键菜单、拖动对换、双击拿起（点另一格放下，Esc 取消）。`cfg = { indices, cols, col, fluid, tight, bare, stackOf(i), titleOf, ghostOf, clsOf, set(i,视图), edit, menu, ref, redraw, plain, dnd:false }`；返回元素，`grid.repaint()`、`grid.cells[i]` |
| `kStackPop(anchor, cur, o)` | 点开格子后的小窗：选物品 / 数量 / 清空。`o = { pick:false, onPick, onStack, onCount, onClear, clearLabel, countLabel, plain, width, maxHeight }` |
| `kItemBtn(cur, onClick, placeholder)` | 「选择物品」按钮 |
| `kSlotPaint(cell, st, title, o)` | 一格的画法。`o.plain:true` 保持旧外观（不加光池和稀有度发光） |
| `slotCols(n)` | n 格的容器按几列排 |

### 弹窗、顶栏、提示（`js/screens.js`、`js/toastkit.js`）

| 组件 | 用途与参数 |
| --- | --- |
| `modalHead(o)` | 弹窗页头。`{ icon, title, sub, actions }`。所有弹窗都用它，不要手搭 `k-mh` |
| `modalShell(title, sub, body, foot, cls)` | 简单窗口。自己安排主体的窗口改传一个对象：`modalShell({ icon, title, sub, actions, cls, id, body, foot })` |
| `openModal / closeModal` | 弹窗栈。`openModal(node, true)` 叠在当前窗口上，关掉后回到上一个 |
| `edTopHead / edApplyBtn / edMaxBtn / edCloseBtn / edFootChg` | 顶栏左半、「应用修改」按钮、全屏、关闭、底栏「有无未应用修改」。物品页和世界页共用 |
| `edStageHead / edStatsHead` | 左栏「预览」「属性」折叠头；折叠状态存在 `UI.stageOpen` / `UI.statsOpen` |
| `toast(text, kind, key)` / `toastDismiss(key)` | 页面内提示：同一 `key`（默认用文字本身）只留一条；最多同时 3 条；显示时间按文字长短 |
| `tkIcon(level)` / `tkSound(level)` | 提示等级（`info / ok / warn / error`）对应的图标和声音，只在这里定义，`toast()` 与独立提示页 `toast.html` 共用 |

### 名字、标签、草稿

| 组件 | 用途与参数 |
| --- | --- |
| `Labels.*`（`js/labels.js`） | 中文标签字典，共 17 张，原样收纳，旧的全局名（`SLOT_ZH`、`OPS` 等）保留为别名。同一概念在不同位置用不同措辞的（槽位的「头部 / 头盔」、属性操作的 `opShort` 与 `opLong`）分开存放，**不要合并措辞** |
| `nameOf(reg, id)` / `entityName(id)` / `optLabel(e)` / `iconOf(reg, id, size)` | 按注册表取名字和图标 |
| `weDraftGet / weDraftSet(store, g, k, orig)` | 草稿存储：只记和原值不同的字段，改回原值就删；`weSetV` 与实体 / 玩家的 `evSet` 都建在它上面 |
| `weMarkDirty()` | 刷新顶栏和底栏，写草稿后调用 |
| `splitTags(s)` | 按逗号 / 空白切标签 |
| `nbtPrint / msgText / textMsg`（`js/nbt.js`） | NBT 美化输出，宿主消息转文字 |

### 其他

选择窗 `openPicker / openRegPick / pickItem / pickFrom`、折叠卡片 `kCard / foldify`、生物面板 `esEntityHeader / esPanel / esGearLayout / esGearGrid / esAttrList / esEffects`、保险库 `Vault / openVault / vaultNested`、窗口把手 `makeSplit / ensureResize` 未改动。

## 三、测试与安全网

在仓库根目录运行。

| 命令 | 作用 |
| --- | --- |
| `node tools/ui-world-test.cjs`、`ui-contract-test.cjs`、`ui-compact-test.cjs`、`ui-nbt-test.cjs`、`ui-search-test.cjs`、`ui-components-test.cjs`、`ui-slots-test.cjs` | 行为测试；后两个覆盖公共组件与格子交互 |
| `node tools/ui-snapshot.cjs` | 24 个场景的 DOM 快照，与 `tools/snapshots/*.txt` 逐字比对（比对时忽略换行符差异）；`--update` 重写，加场景名只跑一部分 |
| `node tools/ui-lint.cjs` | 重复定义、赋值覆盖、`AUTO_BODY` 重复、自我递归、被隐藏却仍在生成的类 |
| `bash tools/preview/baseline.sh baseline` / `after` / `wide <标签> [对照标签]` | 无头截图存到 `logs/ui/<标签>/`（不入库）并按字节对比；`wide` 比 `basic` 多 14 个场景（展开的卡片、弹窗、提示、世界页……） |
| `node tools/css-dedupe.cjs [--apply]` | 找出被后面同选择器盖掉的 CSS 声明；`--families` 列出同一选择器出现多次的位置 |

`tools/lib/ui-harness.cjs` 是共用的假 DOM 加载器：按 `index.html` 的 `<script>` 顺序载入全部界面脚本，固定 `Date.now` 和 `Math.random`，所以快照可重复。

**快照与基线不同时：** 要么是改动出错（修掉），要么是明确要求的改动（在提交信息里写明，再 `--update`）。

**没覆盖的：** 弹窗内部的一部分（选择窗、详细编辑、命令面板）、真实 3D 预览、字体渲染、真实游戏里的点击和输入法。这些都只在无头预览和假 DOM 里验证过，**没有在真实游戏里验证**。

**换 Oriel 版本后：** 文本快照不依赖 Oriel 版本，保留；截图基线是按旧版 Oriel 渲染的，和新版不同是 Oriel 版本差异，不是界面改动，要人工看图判断，不要直接更新基线。

## 四、重构结果

每一步一个提交，均未验证真实游戏。

| 步骤 | 内容 |
| --- | --- |
| 0 | 安全网：假 DOM 夹具、17 个页面快照（后来 24 个）、截图基线脚本 |
| 1 | 删死代码：`cards5.js` 里被覆盖的 `list5`、三个 `AUTO_BODY`、`blockPredList`，以及 `ATTR_ICON`、`heroPopBind`、一处空 `if`；靠赋值覆盖的函数改成正式声明；新增 `ui-lint` |
| 前置决定 | 12 处被 `.k-note` 隐藏的提示：3 条空状态解释改为可见（`k-sub`），其余 9 条连同调用一起删除，`.k-note` 的 CSS、`noteEl`、`defaultNote` 一并删除；`ui-lint` 警告清零 |
| 2 | `labels.js` 收纳 17 张中文标签表，文字一个字没改；新增 `nameOf / entityName / optLabel / iconOf` |
| 3 | `xNum / xToggle / xText / xSeg / xSelect`、`kInput onCommit`、`splitTags`，换掉约 22 处手搭的行，DOM 不变 |
| 4 | 新增 `js/slots.js`；物品页容器和收纳袋改用 `kSlotGrid` / `kStackPop`，**新增拖动对换和双击拿起**，外观不变；`kItemBtn` 另换 3 处；`nbtPrint / msgText / textMsg` 移进 `nbt.js` |
| 5 | `modalHead` / `modalShell` 换掉 4 个手搭窗口；`xList` 增加排序、右键、滚动；新增 `kColorPop`；修掉第 2 步引入的 `optLabel` 无限递归 |
| 6 | `edTopHead` 等顶栏 / 左栏零件物品页和世界页共用；`weMarkDirty`；统一草稿存储；`toastkit.js` 让 `toast()` 与 `toast.html` 共用图标和声音；`kHint` 换掉 35 处手搭提示；`kSnbtEditor` 定名 |
| 7a | `editor.css` 删掉 235 个被后面同选择器盖掉的声明（1611 行变 1574 行），14 个宽场景截图与改动前逐字节相同 |

### 会让用户看到变化的地方

- 3 条「为什么这里是空的」解释现在可见（用户已同意）。
- 容器和收纳袋格子**单击要等约 260 毫秒**才弹出编辑窗，因为要先判断是不是双击拿起；这两处卡片没有加使用提示，新功能不易发现。
- 这两处格子保持了原来的朴素样式，没有加世界页的光池和稀有度发光（`plain:true`）；要统一成带光效的另行决定。

### 没替换的和原因

- 数值行 `numField5` / `fieldRow`（约 12 处）、手写带「手动输入」的 `kSelect`：输出和 `xRow` 不同，替换会改变外观。
- 7 份 SNBT 文本框：行为各不相同（有的实时解析、有的是导出文本、有的是命令），统一会改交互，只把带校验的那份定名为 `kSnbtEditor`。
- 约 20 处手搭列表：外层包装和 `xList` 不一样，没迁移。
- 命令面板、`forms.js` 里旧的 `wBool / wNum / wSeg`、`Pop / popOpen / combo`：没动。
- 装备格子的菜单（`eschema.js`）：它是装备菜单，不是数量窗，没合并。
- **第 7 步的第二部分（把同一选择器的多处规则合并进第一处）没有做。** 同一选择器出现多次的有一百多个（`node tools/css-dedupe.cjs --families`），其中不少是有意的主题覆盖和 `@media` 规则；合并要保证中间没有其他规则声明同一属性，改动面大，收益只是整洁，而当前截图基线又是旧版 Oriel 渲染的，没法可靠验证。留作后续单独做。

### 已知的旧问题（未改）

- `forms.js` 里的 `.ed-pop` / `.ed-pop-item` 自初始导入起就是 `display:none`，旧表单里组合框的下拉一直看不见。
- `ui-lint` 的 `ALLOW` 里登记了 6 条有意保留的「CSS 隐藏、JS 生成」，新增必须写原因：`k-numwarn`、`k-redit`、`ed-tcpanel` 由 JS 用 `style.display` 切换，属正常用法；`ed-enrow`、`ed-pop`、`ed-pop-item` 是旧版 `forms.js` 的控件，样式表自初始导入就是 `display:none`，要等旧控件淘汰时一并处理。

## 五、Oriel 0.11.0 升级兼容性审计（只读，2026-11-08）

对象：Oriel-UI `main` 的 `9254278`，新包替换了 `libs/oriel-fabric-26.1.2-0.11.0.jar`（版本号不变，依赖范围 `>=0.11.0 <0.12.0` 不用改）。

- **构建与 Java 测试：** `:fabric:26.1.2:build` 通过；强制重跑 `check`，19 个 JavaExec 门禁全部通过。
- **API：** 检查了界面和 Java 侧用到的 18 个 Oriel 类，没有缺失、删除或签名变化，只新增 `Document.inputGeometryVersion()` 和 `Document.lazyImages()`。
- **原生元素与属性没有改名或移除：** `<item> <entity> <model> <sprite> <player-head>`、`rotatable / follow-mouse / player / id`、所用七项 `-mc-*` 属性；字体 `oriel:pixel_12` 和 `ore.css` 逐字节不变。
- **消息协议不变：** `oriel.send / on('data') / close / data` 与 patch key 协议；`OrielHud` 的 `register / isShown / show / push` 签名不变。
- **默认引擎变化是主要风险：** 选择器、层叠、输入、块布局、绘制、前端生态六项默认改为新实现。出问题时给游戏加 JVM 参数 `-Doriel.selector=old -Doriel.cascade=old -Doriel.inputBackend=old -Doriel.layout.block=old -Doriel.paintMode=old -Doriel.ecosystem=old`，可只加其中几项来定位。
- **留意项：** 限高滚动框的布局已修复，`editor.css` 里 `.k-cbody { display:block }` 和 `.k-modal.k-pal { display:block }` 这两处旧绕行可能不再需要（未清理，等实机对照后决定）；未被页面处理的 Esc 会返回上一页，要确认和我们自己的弹窗 Esc 处理不冲突；新增统一的控件音效和全局静音开关，要确认我们自己播放的声音不重复。
- **无法在无头环境验证：** 实体 / 模型拖拽、中文输入法与焦点、滚动裁剪、主题、提示与声音，都要在真实游戏里确认。

## 六、给上游 Oriel 的建议

下面这些在我们的界面里已被反复手搭、最后收敛成一套，适合放进 Oriel 的通用组件库。接口设计的原则：**不绑定 Minecraft 业务**，物品图标、名字、声音由宿主注入。

| 建议组件 | 现状 | 接口设计要点 |
| --- | --- | --- |
| 行组件族（`xRow / xNum / xToggle / xText / xSeg / xSelect`） | 「图标 + 标题 + 副标题 + 右侧控件」是设置类页面的基本单元 | 只依赖标题、副标题、右侧元素；数值的范围、单位、预设由调用方给，不内置游戏数据 |
| 可增删、可排序列表 `xList` | 排序抓手、右键菜单、限高滚动、空状态、末尾「＋ 添加」 | `items()` 和 `row(it,i)` 两个回调；排序只回调 `onMove(from,to)`，不改数据 |
| 弹窗外壳 `modalHead / modalShell` | 手搭窗口曾有 5 种写法 | 页头固定：图标、标题、副标题、操作、关闭；主体和底栏由调用方给 |
| 浮层 `kPopover / kColorPop` | 锚点 + 内容 + 宽高 | 与业务无关，可直接上游 |
| 格子网格 `kSlotGrid / kStackPop` | 拖动对换、双击拿起、右键菜单已验证过 | 格子只认「视图」`{ id, count, ... }`；**图标绘制要做成可注入的 `paint(cell, view)`**，不要内置物品图 |
| 提示组件 `toast` + 等级图标和声音 | 去重、限条数、按文字长度定时长，页面内提示和独立提示页共用 | 等级到图标和声音的映射由宿主提供；声音建议改用 Oriel 0.11 新增的声音令牌，不要直接写游戏事件 ID |
| 提示文字 `kHint` | 4 种语气 | 语气到样式的映射放进主题 |
| 检查：重复全局函数 | 脚本全局共享，后加载的会静默覆盖 | Oriel 0.11.0 的检查器已新增 `duplicate-global-function`，与我们 `ui-lint` 的这一项重合 |
| 检查：被隐藏却仍在生成的类 | 曾有约 12 处提示文字白写 | Oriel 0.11.0 已新增 `hidden-class-created-by-script`，同上 |
| 检查：函数体无条件调用自己 | 批量替换时引入过无限递归 | Oriel 0.11.0 更新日志里只看到上面两条新规则，没有这一项，建议加上；`ui-lint` 的实现可作参考 |
| 检查：赋值覆盖函数声明、`AUTO_BODY` 重复 | 业务相关，可只参考思路 | 不建议直接上游 |
