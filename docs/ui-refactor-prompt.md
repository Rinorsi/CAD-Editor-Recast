# 任务提示词：把 CAD Editor · Recast 的界面代码收敛成公共组件

把下面整段交给接手的 agent。

---

## 你是谁、在做什么

你接手 **CAD Editor · Recast**（Minecraft Fabric 模组，MC 26.1.2，基于 Oriel UI 0.11，模组 id `cadeditor`）的**界面层重构**。
仓库：`C:\Storage\Minecraft\project\Mods\Editor`（私有 GitHub：Rinorsi/CAD-Editor-Recast，分支 `main`）。
界面代码全部在 `fabric/src/main/resources/assets/cadeditor/ui/`：`index.html`、`editor.css`、`toast.html`、`js/*.js`（**ES5**，Rhino 引擎，全局函数，没有模块系统；脚本加载顺序见 `index.html`）。

**问题**：同一种界面元素被各页面各写了好几套，样式和行为互相不一致，用户为此多次不满。你的任务是把它们收敛到**一套公共组件**，并且**界面看起来必须和现在完全一样**（除非下面明确说要改）。这是重构，不是美化。

## 绝对不能做的事

1. **不要修改 Oriel UI 仓库**（`C:\Storage\Minecraft\project\Mods\Oriel-UI` 以及 `Oriel-UI-Workspace` 里除 `daily/` 输出外的东西）。只读可以。
2. **不要启动、关闭或操作用户的 Minecraft**，不要杀进程，不要模拟鼠标键盘。用户正在用 `启动物品工坊预览.bat`（`:fabric:26.1.2:runClient` + 源码热更新）测试，**你改的界面文件保存后就会被他的游戏读到**。所以：每一步保存前都要确保脚本语法正确、测试通过；不要留下半成品状态；不要在同一个文件里长时间处于"改到一半"。
3. **不要改 Java**（`fabric/src/main/java/**`、`fabric/src/test/**`、`build.gradle`、根包文件）。其他 worker 正在改后端。你只改 `ui/**`、`tools/ui-*.cjs`、`tools/preview/**`、`docs/` 里和界面相关的文档。
4. **不要 `git add -A`**；只 `git add` 你改过的具体路径（`fabric/src/main/resources/assets/cadeditor/ui` 和 `tools/ui-*.cjs`）。每完成一个独立步骤提交一次，提交信息英文、一句话。**不要 push**（由用户决定）。
5. **不要新增手写的游戏数据清单**（物品/方块/实体/组件列表、范围、默认值）。这些来自游戏实时注册表和 Codec。界面文字标签（中文名）可以手写，但要放进统一的标签文件。
6. **不要引入新的外部依赖、构建步骤或模块系统**。ES5，`var`，函数声明，不用箭头函数/`let`/`const`/模板字符串。

## 用户的界面偏好（反复被否决过的，务必遵守）

- 控件**贴合内容**，不要通栏拉伸；标签不要居中；字段区块不要过大；不要"大卡片套小卡片"；不要整页放大。
- 格子/网格**居中**；不要出现大块不该有的空白。
- 提示文字要少，不要啰嗦的说明段落。
- 子页的折叠/展开/箭头**必须有过渡动画**。
- 装备相关用"格子"表现（第一排四件盔甲，第二排主手/副手/身体/鞍），不要做成表单。
- 所有选择器必须同时允许**手动输入 ID**。
- 样式沿用现有词汇：`xRow / xField / xSec / xAdd / xEmpty / xFoot / xList`、带边框的图标框、12px 像素字体、`k-*` 系列类名。

## 现有公共组件（先用它们，不够再扩展，不要另起一套）

- 行与列表：`xRow / xField / xSec / xAdd / xEmpty / xFoot / xList`（`js/xlist.js`）
- 控件：`kBtn / kNumber / kInput / kSeg / kToggle / kSelect / kPopover / kSearchBox / kRegSelect / kColor / kTiles`（`js/kit.js`、`kit2.js`、`cards2.js`、`picker.js`）
- 选择窗：`openPicker / openRegPick / pickItem / pickFrom`（`js/picker.js`、`kit.js`）
- 卡片：`kCard`（`kit.js`）
- 弹窗：`modalShell / openModal / closeModal / windowify`（`js/screens.js`）
- 生物：`esEntityHeader / esPanel / esGearLayout / esGearGrid / esAttrList / esEffects / heroEntity`（`js/eschema.js`）
- 格子：`weSlotGrid / weSlotPop / weSlotPaint / weDndBind`（`js/worldplayer.js`，含拖动对换、双击拿起）
- 保险库：`Vault / openVault / openVaultSaveEntity / vaultNested / vaultEntityObj`（`js/vault.js`）
- 提示：`toast(text, kind, key)`、`toastDismiss(key)`（`js/screens.js`）
- 左栏/顶栏/底栏：物品页 `drawHero / drawTopbar / drawFooter`（`screens.js`），世界页 `weHero / drawWorldTop / drawWorldFoot`（`worldedit.js`）

## 审计结果（行号是近似值，工作树在变，先自己 grep 确认）

路径相对 `ui/`。共约 220 处重复，可收敛成约 15 个公共组件。

**0. 先处理的 bug / 死代码**
- `editor.css` 里 `.k-note { display:none }`（约 614 行）把所有 `.k-note` 隐藏了；`noteEl()` 的 9 处调用和若干 `k-note` 提示可能一直看不见。**保险库警告和撤销条已改用 `.vt-msg`**；其余的要逐个判断：该显示的改用可见的类，不该显示的删掉。
- 死代码：`js/cards5.js` 里的 `list5`（被 `js/world.js` 的同名函数覆盖）、`AUTO_BODY.bees/map_decorations/lodestone_tracker`（被 `world.js` 覆盖）、`blockPredList`（被 `rules.js` 覆盖）；`ATTR_ICON`（`cards2.js` 约 20 行，无人读）；`heroPopBind`（no-op）；`cards3.js` 约 41 行的 `if (inf) {}`；`regEnumTable('attribute_operation', …)` 注册了两次。
- `.slot.s28` 与 `.slot.s34` 实际都是 24px，名字有误导。
- 弹窗提示图标：页面里的 `toast()` 对 `warn` 用 info 图标，`toast.html` 用 warning 图标，要统一。

**1. 物品格子 / 物品栈弹窗 / "选择物品"按钮（约 24 处）**
- 5 套格子：`weSlotGrid`（worldplayer.js）；`CARDS.container`、`CARDS.bundle`（cards3.js）；`esGearLayout`/`esGearGrid`（eschema.js）；提示框里的收纳袋只读网格（screens.js）。
- 物品栈弹窗（选物品 + 数量 + 清空）4 份：worldplayer.js、cards3.js ×2、eschema.js。
- "选择物品"按钮（图标+名字 或 "+ 选择物品"）手搭 8 次：cards1.js、cards3.js ×2、worldentity.js ×2、worldplayer.js、worldview.js ×2。
- 两种栈格式：线格式 `{id,count,comps}` 与物品组件嵌套格式 `{slot,item:{components}}`（`vaultNested` 做转换），所以容器/收纳袋卡片还不能直接用 `weSlotGrid`。需要一个适配层。
- 列数公式 `n<=5?n:n<=9?3:9` 重复（cards3.js、worldedit.js）。
- 待提交格子的存取：`weSlotStack/weOrigEmpty` 与 `wpContainerStack/wpOrigEmpty/wpSetSlot` 是同一件事。
- 目标：`kSlotGrid({get,set,dnd})` + `kStackPop(stack,{max,onSet})` + `kItemBtn(stack,onPick)`，物品页容器/收纳袋也改用，并获得拖动对换和双击拿起。

**2. 生物头部与选择（约 18 处，已部分完成）**
- 已有 `esEntityHeader`（eschema.js），刷怪蛋、刷怪笼当前生物/随机池、蜜蜂、乘客、世界生物页已使用。**"存入保险库"只出现在刷怪蛋卡片和世界里已放置生物页**（用户明确要求：刷怪笼和随机池里不要）。
- 仍重复：名字查找 `spEntityName`（spawn.js）、`nameOfEntity`（worldentity.js）、vault.js 内联、`weName`（worldedit.js）——合并成一个 `entityName(id)`。
- "从保险库取生物"的处理代码 `vaultEntityObj + NBT_FORCE` 在 6 处各写一遍，收敛成一个函数。

**3. 数值行（约 15 个辅助函数 + 内联）**
- 命名辅助：`wvNum`（worldview.js）、`evNum`（worldentity.js，功能最全）、`wpNum`（worldplayer.js）、`spNumRow`（spawn.js，含"刻→秒"换算）；`numField5`（cards5.js）被 `fieldRow` 包装使用约 12 处；另有约 11 处内联 `xRow + kNumber + k-xnum`。
- 目标：`xNum({title,sub,icon,value,min,max,step,dec,unit,soft,ticks,onChange})` 放进 `xlist.js`，范围提示"范围 a ~ b"自动生成。

**4. 开关/文本/分段/下拉行（约 45 处）**
- 开关：`evBool`（worldentity.js）、`wvToggle`（worldview.js）及 8 处内联。
- 文本输入：`kInput` 只在 `input` 事件触发，8 处传空函数后自己挂 `change`；`vInput`（vault.js）。给 `kInput` 加 `onCommit`（change）选项。
- 分段选择约 9 处；`eschema.js` 里手写了带"手动输入"的 `kSelect`，因为 `kSelect` 没有该选项。
- 标签字符串分隔正则 `/[,，\s]+/` 在 5 处重复。
- 目标：`xToggle / xText / xSeg / xSelect` 与 `xNum` 同放 `xlist.js`。

**5. 左栏/顶栏/底栏（物品页 vs 世界页，各两份）**
- `drawHero` ↔ `weHero`、`drawTopbar` ↔ `drawWorldTop`（全屏按钮处理函数逐字重复）、`drawFooter` ↔ `drawWorldFoot`。
- 重绘别名：`evRedraw`/`wvRedraw`=`weRender`；`eggRedraw`、`drawDetailSafe`；"标记已修改"`drawWorldTop(); drawWorldFoot();` 重复 11 次；`weSetV` 与 `evSet` 是同一套"与原值比较的草稿存储"。
- 目标：`edHero(cfg) / edTopbar(cfg) / edFooter(cfg)` + `weMarkDirty()` + 一套草稿存储。**风险最高，视觉必须逐像素对照。**

**6. 提示与文字块**
- 3 套提示：`toast()`（screens.js）、`toast.html`（重复了 `h()/ico()/snd()`）、Java `EditorToast`（不归你，只保证页面协议 `{text,level,title,seq}` 不变）。
- 提示 CSS 叠了 4~5 层。
- 提示/错误/空状态文字有约 8 个类（`k-note/k-sub/ed-hint/ed-err/world-error/world-note/world-hint/k-numerr/k-probline`，空状态 `k-empty/world-empty/ed-empty/ed-pop-empty/k-phint`）。
- 目标：`toast.html` 复用同一套样式和等级图标；`kHint(text,tone)` 取代 8 个类。

**7. 列表（增删排序）约 20 处**
- `xList` 只有 6 处使用，没有拖动排序/抓手/右键/滚动；其余手搭：`cards2.js`（额外属性、工具规则）、`cards3.js`（`kEffectList`、`kConsumeEffects`、烟花、书页）、`cards1.js`（lore、附魔）、`cards4.js`、`forms.js` 里 5 个旧版 `ed-card` 列表（重复了 cards1/2 里已有的卡片）、`worldentity.js`/`worldview.js` 的 `xRow+UIOpen` 手风琴、两个 `list5`。
- 删除"×"小按钮手搭 9 次；带 × 和 + 的标签芯片列表 5 份。
- 目标：扩展 `xList({sortable,onMove,grip,context,scroll,empty})`，吸收 `list5`；一个 `xChips`。

**8. 弹窗与浮层**
- 5 个窗口不经 `modalShell`：`openAdvanced`、`openAddSetting`（screens.js）、`openDetail`（detail.js）、`openPicker`（picker.js）、命令面板。`modalShell` 缺图标/头部按钮位。
- 两套浮层：`Pop/popOpen/combo`（forms.js）与 `KPop/kPopover`（kit.js）。颜色浮层 5 份。
- `forms.js` 里旧控件 `wBool/wNum/wSeg/icon()` 重复 `kToggle/kNumber/kSeg/uiIcon`，带另一套 `ed-*`/`o-*` 样式。
- 目标：`modalShell({icon,actions,kind})`；`kColorPop`；逐步淘汰旧控件。

**9. 名字与图标**
- 名字：`attrName`、`Reg.nameOf2('attribute',…)||humanId`、`potionName`、`nameOfItem` 与 `itemNameOf`；`e.label===e.v?humanId(shortId(e.v)):e.label` 在 picker.js/forms.js 复制 5 次，而 `refName` 已存在。
- 图标：`itemIcon / effectIcon / uiIcon / entityIcon / refIcon / eggIconOf / attrIconEl / compIcon / liveTrimIcon`，图标映射表 `ENCH_ICON / TRIM_ICON / ATTR_VIS / COMP_ITEM`。
- 目标：`nameOf(reg,id)` / `iconOf(reg,id,size)`，其余做薄包装。

**10. 中文标签字典（约 12 张）**
- 槽位 7 张：`SLOT_ZH`、`EQ_SLOTS`、`ES_SLOT`、`WP_EQ`、`SLOT_HEAD`、`ATTR_SLOT_ICON`、`PIECE_ID`；稀有度 5 份；属性操作 `OPS` 与 `OPMODES`；游戏模式 `WP_MODE`；维度 `WE_DIM`（cards5.js 里还有一份）；`ES_VARIANT/ES_FLAG`；`WE_PROP/WE_VAL`；`ENCH_TAG_ZH` 等。
- 目标：单一 `js/labels.js`（`Labels.slot/rarity/op/mode/dim…`），`regEnumTable` 仍从游戏同步。

**11. SNBT / NBT**
- 原始 SNBT 文本框（解析+报错+写入按钮）8 份：`world.js`（`worldRaw`）、cards4.js、cards5.js ×2、screens.js、worldedit.js、vault.js ×2。
- `nbtPrint` 放在 worldedit.js 却被 spawn.js 使用，应放进 `nbt.js`。
- 目标：以 `worldRaw` 为蓝本做 `kSnbtEditor`。

**12. CSS**
- `editor.css` 里同一视觉元素有多层追加（"第 2/3/4 轮"）：`.k-toast`×4（421/895/1568）、`.k-stat`×4、`.k-chead`×4、`.ed-tools`×4、`.ed-tabs`×4、`.addcat`×4、`.detail-pad`×4、`.slot`×2；`.x2r > :last-child` 三处值互相矛盾；`.world-fold/.world-note/.world-empty` 各两处冲突；新类 `.we-in/.world-inline-value/.st-input/.vt-in` 是同一个"行内输入框宽度"；`!important` 8 处。
- 目标：改原规则而不是追加覆盖；每个视觉元素一套规则。**这一项最容易改变外观，放最后，并做截图对比。**

## 工作顺序（先做安全网，再从低风险到高风险）

**第 0 步：安全网（不做完不许改代码）**
1. 建 `tools/ui-snapshot.cjs`：用 `tools/ui-world-test.cjs` 里的假 DOM 加载器，对以下页面把渲染出的 DOM 序列化成稳定文本快照（元素标签+类名+文字+关键属性，忽略 id 随机值和时间戳），存到 `tools/snapshots/`：物品页（至少 3 种物品：普通、容器、刷怪蛋）、刷怪蛋卡片、刷怪笼页、世界方块页（箱子、告示牌、命令块、熔炉）、世界生物页（盔甲架、村民、展示实体、带乘客的）、玩家页（五个标签）、保险库窗口（物品页、生物页）、提示弹窗。
2. 对每个页面再用 `tools/preview/shot.sh <WxH> <name>`（环境变量 `FIXTURE`、`POSTJS`、`SCALE=1`；夹具在 `tools/preview/*.js` 与 `logs/ui/preview/*.js`）各截一张基线图存到 `tools/snapshots/png/`（只存文本快照进 git；图片放 `logs/`，不入库）。
3. 之后**每一步**都必须：现有测试全过（`node tools/ui-world-test.cjs`、`ui-contract-test.cjs`、`ui-compact-test.cjs`、`ui-nbt-test.cjs`、`ui-search-test.cjs`，都要在仓库根目录运行）、快照与基线**逐字相同**；若快照不同，要么是你的 bug（修掉），要么是本文明确要求的改动（在提交信息里写明，并更新快照）。

**第 1 步（低风险）**：死代码清理；`.k-note` 逐处处理；重复全局定义检查脚本 `tools/ui-lint.cjs`（同名全局函数/`AUTO_BODY` 键重复定义报错；CSS 里 `display:none` 的类在 JS 里仍被生成时报警）。
**第 2 步**：`labels.js` 合并字典；`nameOf/iconOf`；`entityName`。
**第 3 步**：`xNum/xToggle/xText/xSeg/xSelect` + `kInput onCommit`，再逐个把调用点换成它们。**换的时候输出的 DOM 必须不变**——若现有的几个辅助函数输出略有不同（比如 `wvNum` 与 `evNum` 的副标题格式），**以用户当前看到的版本为准**，不确定就保留现状并在报告里列出差异让用户选。
**第 4 步**：`kSlotGrid/kStackPop/kItemBtn` 与适配层，容器/收纳袋卡片改用（注意这一步会让它们获得拖动对换，属于允许的行为新增；外观不变）。
**第 5 步**：`xList` 扩展与 `list5` 合并；`modalShell` 扩展并换掉 5 个手搭窗口；`kColorPop`。
**第 6 步**：`edHero/edTopbar/edFooter`；提示统一；`kHint`。
**第 7 步（最高风险，最后）**：`editor.css` 去重。每合并一个规则家族就跑快照 + 截图对比。

## 每一步的交付

- 提交（只 add 具体路径，不 push）。
- 一份中文进度说明（追加写入 `docs/ui-shared-components.md`）：新增了哪些公共组件（名字、参数、用法示例）、替换了哪些调用点（文件:行）、仍没有替换的与原因。
- 新增的开发规范也写进同一文档（"写行/网格/选择器/弹窗/列表之前先查公共组件"、"禁止重复定义同名全局"、"CSS 改原规则不追加覆盖"、"新增界面元素的提交需写明复用了哪个公共组件"），格式要能直接并入 Oriel 的开发文档。
- 完成后的总结里区分：**自动验证通过的** 与 **没法在真实游戏里验证的**；不要把"测试通过"说成"界面已验收"。

## 必须诚实汇报

- 哪些改动改变了界面（哪怕细微）；哪些调用点因为输出不同而没有替换；哪些地方你不确定。
- 如果某个公共组件会让现有页面行为变化，先停下来列出，不要自行决定。

## 同时存在的其他工作（避免冲突）

- 后端 worker（be-world3 等）正在改 Java；用户正在游戏里测试并随时反馈界面问题。你和这些并行，所以：小步提交；改动同一个文件前先 `git diff` 看是否有别人的未提交修改，**不要覆盖别人的修改**；遇到文件被别人同时改动，保持你的修改最小、局部。
- 用户随时可能让原作者（Claude）直接修某个界面问题，那是正常的，你重新 `git log` 拉齐即可。
