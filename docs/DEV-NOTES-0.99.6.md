# 0.99.6 开发记录

## 2026-11-10 大 SNBT 容量与前端开销

- 截图为 Oriel 脚本预算耗尽（50M instructions / 1000ms），不是按行数拒绝。Ctx 改为只读取目标组件；名称、属性概览等只读投影不再深拷贝全部组件。Store 修改序号和文档引用共同驱动 WeakMap 缓存，复用组件 SNBT、快照、基线和差异；撤销历史按体积裁减至至少两步。
- SNBT 字符串扫描使用区间匹配与切片；类型快照压缩可重建的数字元数据及同类型数字列表，非标准原文、负零、特殊浮点、精确 long 保留。kCode 同步交付当前文字与单次解析结果，大于 32768 字符不生成全文装饰高亮，保留原生 textarea、选择与撤销；原始物品页复用解析结果，3D 预览延后 250ms，未延后草稿数据更新。
- 公共 xList、通用数组/映射、烟花爆炸与颜色每页 24 项，索引按真实偏移写回；页内拖动换算原索引。大数组的复杂子表单仅展开时创建。超 32768 字符组件不反复遍历前端 schema，应用仍由原生 Codec、权限、目标身份与并发检查裁决。
- StackCodec 每组件及 WorldNbt 单份 SNBT 上限 1,048,576 字符，覆盖 1 MiB UTF-8 原文。世界原有深度 32、保险库深度 96 等保护不变。EditorWire 在现有 request/reply 通道上将大 JSON gzip+base64 分片，完整重组后执行；单片 24000 字符、最多 1024 片、展开消息最多 16 MiB、30 秒期限、连接关闭清理。EditorPackets 单包 32767 上限保持，Fabric/NeoForge 双向共用。大消息要求两端更新；未增加原版指令/原生创造包自身限制的绕过。
- 世界旧 worldEncoding 兼容保留，展开容量 8 MiB；草稿单条 8 MiB、总 64 MiB、最多 8 条，上传按 30 秒无进展判断过期，中间块不覆盖旧草稿。保险库单条 8 MiB、总 64 MiB、本地响应 8 Mi 字符；大编辑历史在页内的单条上限 8 Mi 字符、总上限 16 Mi 字符，小历史落盘的既有 16000 字符预算不变。
- 预算只调整本机 cadeditor:ui/index.html：默认 200M 指令/3000ms，手动放宽重试 600M/6000ms，加载 30000ms，单入口分配 512 MiB；服务端页面不变，原生恢复面板与本机日志保留。
- 版本维持 Editor 0.99.6 / Oriel 0.15.0；仅构建开发产物，未生成新分发交付包。未执行行为测试、未启动/操作游戏，1 MiB 真实游戏往返与峰值耗时仍由用户实机检查，不能用构建替代。
- PASS | node --check（15 个修改 JS）+ git diff --check（本轮修改路径）| 语法和空白检查通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-large-nbt/source-check-final.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | exit 0，当前源码与资源六目标构建通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-large-nbt/assemble-current.log。未执行行为测试、游戏实测或新分发包交付。
- 预算选择按配置对象与重试模式缓存，避免每次 DOM/脚本读取 Limits 时反射重建；普通数字 getter 保持旧的 primitive number 表单接口，未知字段与 typed 值继续保留。



## 2026-11-10 世界动态值覆盖、Motion 与掉落物预览

- WorldMergePlan 改用 WorldMerge.applyEdits：复用逐路径及稳定键列表合并，显式用户变化优先，未改路径保留 current；身份和旧会话检查不放宽。离线玩家仍走严格 WorldMerge.merge。掉落物 Age/PickupDelay、刷怪笼 Delay 及其他可写计时不再因现场 tick 或重置而同路径冲突。Age/效果时长的撤销同样只保留未修改的现场值。
- Motion 从 WorldNbt 身份保护中移出；EntityVolatile 仅对未改 Motion 继承现场速度。属性页增加公共 kNumber 的 X/Y/Z，按 double 写回，支持手输保留精度。只读核对 vanilla-26.1.2-1 / 26.2-2 / 26.3-1 源码 Entity.load：Vec3.CODEC，单轴绝对值 >10 归零，needsSync=true；表单范围 −10..10 格/刻，SNBT 仍走原版保留校验。没有把矿车速度设成额外实时运动 API。
- WorldEditSessions 仅在正常服务器 open 时记录非玩家 openingPosition；WorldEditor 在 resolve 前校验 UUID/token/revision。超出当前交互范围才使用原位平移 AABB 的原生距离检查，并检查当前及返回区块/区域；不加载已卸载实体。保护/副本校验后才把可信原位 Pos 注入最终事务，失败沿用真实写前回滚。成功额外记录 entity_return 的 UUID、原位和现场位置。普通范围内保存不回退位置，玩家不受该路径影响。
- 掉落物使用真实 Item 栈与 normalized 草稿的原生物品模型，组件转换复用 stackUiDoc/vaultNested/nbtComponentTexts，支持移除 patch、typed NBT 以及换物品后的实时预览；普通生物/玩家预览不变。界面说明移除“位置/UUID 可在数据页编辑”的误导。
- 同步更新玩家 CHANGELOG、世界/实体/方块/合并合同，以及已有双箱和 generic 检查的覆盖预期；未执行这些行为检查。版本维持用户指定的 Editor 0.99.6 / Oriel 0.15.0，未修改 Oriel，也未生成新的分发交付包。
- PASS | node --check worldedit.js / worldentity.js | 语法通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-world-live-edits/js-syntax.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | exit 0，六目标构建通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-world-live-edits/assemble-six.log。构建后仅清理 worldedit.js 空行空白并补全文档。
- NOT_RUN | 行为测试、游戏实测；未启动或操作游戏。Java 改动须由用户自行重启客户端/相关服务端后加载。

## 2026-11-10 模组快捷键独立分类

- “编辑目标”和“打开保险库”从原版 INVENTORY 分类移至单独的 CAD Editor 分类。EditorKeyBindings 共享并只注册一次 cadeditor:editor，中文及英文语言包添加实际 Category.label 所用的 key.category.cadeditor.editor。
- 已只读核对 MC 26.1.2 / 26.2 / 26.3 的 KeyMapping.Category 源码，三者均支持 register(Identifier)，标签通过 id.toLanguageKey("key.category") 生成。保留 key.cadeditor.edit / key.cadeditor.vault 名称、默认 I / O 及所有按键处理逻辑，不改用户的已有绑定。
- 同时覆盖 Fabric 与 NeoForge 的共用客户端入口；版本仍为 0.99.6 / Oriel 0.15.0，玩家更新日志已补充。本轮执行六目标 assemble，不跑行为测试或游戏实测；按键分类是 Java 注册，需用户自行重启开发客户端后加载。
- PASS | python -m json.tool zh_cn.json / en_us.json | 语言包语法通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-key-category/lang-syntax.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | exit 0，六目标构建通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-key-category/assemble-six.log。
- PASS | git diff --check（本轮已跟踪文件）| 无空白错误 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-key-category/diff-check.log。
- NOT_RUN | 行为测试、游戏实测；没有操作或重启运行中的游戏。

## 2026-11-10 受限命令复制按钮强提醒

- 特殊数值命令的“复制”和第二次点击的“强制复制”都使用红色实心按钮，初始即醒目显示；普通命令及 JSON 复制保持原样，已有两次复制与跳转逻辑不变。
- k-btn 的 dng strong 组合复用已有 Ore destructive 正常、悬停、按下纹理，不全局改变已有删除按钮。更新玩家日志与共用界面规范，版本保持 0.99.6 / Oriel 0.15.0。
- 本轮仅 JS / CSS 视觉调整，按影响范围做语法检查和 Fabric 26.3 assemble，不跑行为测试或游戏实测；回执见下。
- PASS | node --check screens.js | 语法通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-red-copy/js-syntax.log。
- PASS | bash tools/gw.sh :fabric:26.3:assemble -PmcTest=false --no-problems-report | exit 0，构建通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-red-copy/assemble-fabric-263.log。
- PASS | git diff --check（本轮五文件）| 无空白错误 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-red-copy/diff-check.log。
- NOT_RUN | 行为测试、游戏实测；没有操作或重启运行中的游戏。

## 2026-11-10 特殊数值指令提醒简化

- 按用户截图与纠正，统一短文案“原版指令不支持 ∞ / NaN，请通过编辑器修改。”；界面不再堆叠创造模式、服务端条件或内部字段路径，字段路径仍写诊断日志。
- 复制不再永久拦截：第一次点击提醒，将原按钮改为“强制复制”，再次点击复制相同命令原文，不替换特殊数值。切换命令方式、执行位置、目标或重绘后重置确认；普通命令与 JSON 仍直接复制。底部已有问题入口保留点击跳转，首次复制不再自动弹出问题列表遮挡命令。
- 原版命令实际写回仍在发送前拒绝无法解析的数值，原因缩为相同短句；client.command.unsupported_number 日志另记字段路径和值。原有组件和 typed NBT 保持不变，版本保持 0.99.6 / Oriel 0.15.0。
- 按既有要求仅做语法检查和构建，不跑行为测试、不启动或操作用户游戏；本轮回执另列，不沿用前一修订的结果。
- PASS | node --check core.js / screens.js | 语法通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-copy/js-syntax.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | exit 0，六目标构建通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-copy/assemble-six.log。
- PASS | git diff --check（本轮六文件）| 无空白错误 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-copy/diff-check.log。
- NOT_RUN | 行为测试、游戏实测；源码及构建完成，不以构建代替两次复制与跳转的实机验收。

## 2026-11-10 特殊浮点数与原版指令边界

- 根因：MC 26.3 的 SnbtGrammar.convertFloat/convertDouble 拒绝非有限结果，NaNf/Infinityf 作为普通未加引号的字符串读取，数值 Codec 因而可报 Not a number。SnbtOperations 只有 bool/uuid 内建操作，没有可用的 float("NaN") 转换。依据本机 vanilla-26.3-1-sources.jar 中的 net/minecraft/nbt/SnbtGrammar.java 和 SnbtOperations.java。
- 本机 Fabric 26.3 latest.log 的 20:02:35 记录了带 blocks_attacks.damage_reductions[0].base:Infinityf 的主手替换命令；该行仅表示设置命令，不是执行成功。本轮未在日志捕获到用户看到的 Not a number 原始行。
- 编辑器的 SpecialFloatingPointSnbt 是本地 typed SNBT 扩展，不会改变原版服务器命令解析器。命令页按最终 typed AST 检查数值，字符串与同名键不误判；底部问题入口提示具体字段，复制动作显示问题并写 command.export.unsupported_number 诊断。检查只在命令页建立时执行，不塞进全局组件校验。
- HotbarCommandCodec 只在原版命令路径检查新组件与原物品谓词中的嵌套 FloatTag/DoubleTag，失败代码 command_special_number；保留槽位及原物品保护条件，不发送命令、不占命令等待租约。ClientInventoryCommands 在编译拒绝时写 client.command.compile_rejected 和槽位日志，保险库命令取出也复用。日志仅含字段路径与错误原因，不写整段 NBT 或命令。
- 不更改 typed SNBT、组件数据或非有限数，不全局禁止编辑。命令页的“应用到游戏”仍走既有正式通道；创造模式包和服务端 Editor 通道不受指令导出限制。版本仍为 0.99.6 / Oriel 0.15.0，更新日志标为待打包。
- 按用户要求仅做语法检查和六目标 assemble（mcTest=false），不跑行为测试、不启动/重启游戏。新增 Java 预检需用户自行重启开发客户端后加载。
- PASS | node --check core.js / screens.js | 仅语法检查 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-commands/js-syntax.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | exit 0，六目标构建通过 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-commands/assemble-six.log。
- PASS | git diff --check（本轮六文件）| 无空白错误 | C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-special-number-commands/diff-check.log。
- NOT_RUN | 行为测试、游戏实测；未替换运行中客户端，也未交付新分发包。

## 2026-11-10 空槽弹窗收窄

- 用户截图中空槽仅有“选择物品”，却沿用了有物品时的 320 宽度。公共 kStackPop 为空槽改用 160 的布局宽度（沿用 kPopover 原有 0.74 系数）；有物品时的名称、数量与操作区保持原宽度。覆盖背包、世界容器和嵌套容器的共用入口，不改物品数据或选择回调。
- CHANGELOG 的“改进与修复”补充玩家说明；版本保持 0.99.6 / Oriel 0.15.0。验证回执见下文，未启动或操作游戏。

- PASS | `node --check common/src/main/resources/assets/cadeditor/ui/js/slots.js` | 语法通过 | `C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-shared-controls/empty-slot-syntax.log`。
- PASS | `bash tools/gw.sh :fabric:26.3:assemble -PmcTest=false --no-problems-report` | exit 0 | `C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-shared-controls/empty-slot-assemble.log`。
- NOT_RUN | 行为测试、游戏实测；本轮仅修改共用 JS 的空槽宽度分支，按影响范围构建 Fabric26.3，未重跑其余目标。

## 2026-11-10 公共数值框与截图布局修订

- `kNumber` 和 `wNum` 共用 `kStepper` 输入外壳。输入区统一 72 CSS px，增减按钮沿用 Ore 纹理；删除附魔、挖掘规则、声音、缩放、格子弹窗、交易、紧凑表单与高级窗口的单页宽度覆盖。compactField 普通与特殊数值使用相同外壳，保留各自原有 typed 解析、范围与提交逻辑。
- 动能武器等详细编辑窗口使用顶部文字标签，避免 max-width:600px 规则隐藏纯文字导航后留下空栏。返回上一级与编辑等按钮不参与挤压；最近编辑提示单独占行。生物装备的完整编辑按钮放到当前物品右侧，标题与图标共用完整物品数据。
- 数值空值默认显示“未设置”。打开详细表单时按需请求该组件的真实 Codec 完整结构；只有在缺失默认值且请求未返回时显示“读取中”，失败显示“读取失败”并记录诊断。已知无默认值不会伪造为 0；默认值到达在原输入框更新，已编辑文本不被覆盖，聚焦但未输入时延迟到失焦更新。
- 世界/玩家草稿恢复后去掉 weApply 的强制比较前置条件。恢复时原有 rebaseText 与最新读取基线、提交时 slot/token/revision 和服务端校验保持；“查看恢复内容”改为可选只读入口，去除“已比较”确认，不新增 force 或跳过服务端校验。
- 只读核对当天 Fabric26.3 客户端 latest.log：19:48:43 的 ED-mwammtus-2 及 19:49:28 的 ED-mwamnsfq-3 仍输出旧恢复面板的“错误编号=”及操作文案，与当前 Java 源码“编号=… preview=…”不同；当前 JVM 未加载此前恢复面板修订。此次没有重启、关闭或操作用户客户端；恢复面板的 Ore 样式与 26.3 左键修订需要用户重启开发客户端后检查。
- 版本仍为 0.99.6 / Oriel 0.15.0；不发布、不安装分发包，不运行行为测试或游戏。构建回执见本节后续记录，构建结果不代表界面实测。

证据目录：`C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-shared-controls`。

本轮最终回执：

- PASS | `node --check`（kit/forms/reg/detail/app/screens/eschema/worldedit/drafts 共 9 文件）| 语法通过 | `editor-shared-controls/js-syntax-final.log`。
- PASS | `bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --warning-mode all --no-problems-report` | exit 0，BUILD SUCCESSFUL in 15s；26.1 任务对应 MC26.1.2 | `editor-shared-controls/assemble-six-final.log`。本次包含最后的数字框失焦回显修订，不复用前一轮构建回执。
- FAIL | `git diff --check`（本轮涉及路径）| 已有 `worldedit.js:185: trailing whitespace` 空行尾空格；未借此改动其他既有工作 | `editor-shared-controls/diff-check.log`。
- NOT_RUN | 行为测试、游戏实测；未重启用户客户端，未发布或安装新分发包。

以上日志路径均相对于本节证据目录；恢复面板旧宿主文案摘录为 `running-recovery-old-host.log`。

## Sprite 插入入口与 26.3 启动报错修订（源码，未验证）

- 共用 kRich 工具栏增加 Sprite 选择入口，名称、说明文字、基础名称及世界命名字段共用。记住分段及 UTF-16 选区，插入原生 atlas object，保留前后格式，避免拆开 emoji；插入后光标移到后文。换页、外部设值或移除原分段后拒绝过期回调。
- SpriteCatalog 从当前 AtlasManager 与 TextureAtlas 的实际加载结果逐 tick 采集；仅用 accessor 枚举没有公开迭代 API 的 texturesByName。三版本源码均有同名字段。索引走已有 SearchChannel 后台队列，按图集筛选和分页，只发小窗口；不通过物品 ID 猜测贴图。候选预览沿用原生 AtlasSprite 字形。保留图集/Sprite 手输 ID，关窗取消查询，资源/世界代际变化不接受旧结果；失败写诊断并走现有通知。
- 用户提供 Fabric 26.3 compileJava 日志：EditorPageRecovery 引用 org.lwjgl.glfw.GLFW，但该目标无此包。移除引用并使用 InputConstants.KEY_TAB/KEY_RETURN/KEY_SPACE；已阅读三版原生源码，26.3 对应 SDL 键码，26.1.2/26.2 对应旧键码，不硬编码整数、不添加 GLFW 依赖。
- 本轮仅阅读及修改源码，未执行语法检查、测试、Gradle、游戏、打包或安装。版本 0.99.6 / Oriel 0.15.0 不变。

### 后续构建回执（2026-11-10）

用户澄清“不跑测试”仍需构建后，已执行 Fabric / NeoForge × 26.1.2、26.2、26.3 六目标 assemble（Gradle 的 26.1 项目对应 MC 26.1.2），附加 -PmcTest=false；全部通过，退出码 0，BUILD SUCCESSFUL in 35s。未运行 check、测试、游戏、安装或发布。此次构建包含上述 GLFW 引用修正和 Sprite 插入入口。Fabric 26.3 编译任务复用当前最新输出，其他五目标重新编译。编译器的 deprecation / unchecked 提示仍保留，属于警告。

命令：bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report

完整日志：C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-sprite-build/assemble-six-180237.log

此前“未构建”记录描述其对应源码编辑阶段，以本条构建回执为最新状态；构建通过不代表游戏实测通过。

此文件保留原更新日志中的实现与验证记录，不作为玩家发布说明。

## 0.99.6 (2026-11-10)

### 2026-11-10 本轮补充（仅源码，未执行验证）

- 唱片机只检查实际 jukebox_playable；显式移除优先于原型，默认信息没返回时等待，不按 ID 或物品种类猜测。完整物品选择保留 typed 组件。宿主视图提交增加同一组件检查；已有容器原生 canPlaceItem 保持。
- 最近编辑使用既有撤销快照，避免再次序列化整个物品；32 条 / 共 1 Mi 字符的本页历史。持久偏好独立于 drafts，转义后的总 JSON 限 16000 字符，放不下的完整条目只留本页，不裁剪组件。槽位可完整取用，纯 ID 选择入口仍只取 ID。
- 删除共用头部按钮不创建展开区，覆盖属性、效果、交易、烟花、挖掘规则和刷怪池。取消格子双击拿起、延迟单击和常驻说明；移除格子光池、呼吸、悬停放大、发光阴影，保留静态选中和主手线。
- Sprite 读取原版 object/atlas/sprite/fallback，分段编辑保留对象及资源字体；未知文本结构仍走原始编辑。新增本模组字体别名桥接 FontDescription.AtlasSprite，同一原版字形用于排版和绘制，不修改 Oriel 版本或依赖。宿主 tooltip 也导出 font 别名；玩家头像对象暂不纳入本轮新增显示支持。
- 常驻描述一行省略，公共 tooltip 读取全文；默认值不再重复解释。错误与代码区不截为描述。手动体验命令见 examples/SPRITE-TEXT.md。
- 大量组件可能导致卡顿仅是用户提供的线索，本轮未复现或定位，不能写成已修复。

本轮没有运行测试、语法检查、Gradle、游戏或打包，也没有安装新包。版本 0.99.6 / Oriel 0.15.0 不变。

### 当前源码改动（未重新打包，待本地验证）

- 音效名称关联实际 jukebox_song 的 soundEvent 与 description，覆盖音效列表、搜索、字段回显和底部播放器；不手写唱片表，不替原版英文曲名另造中文名称。
- 本机 26.3 日志在 17:02:20 记录 minecraft:music.nether.warped_forest 为 empty soundEvent；这是该次不能试听的明确证据，不用于推断其他客户端的超时。新增空事件/有意静音、零音量、资源缺失、未启动通道及加载超时诊断，记录声音、实际资源和资源包。
- 流式总时长从实际资源包的完整压缩 Ogg 读取，后台队列和单文件大小受限，不解码全曲 PCM；未知或读取失败显示未知总长，不能回退成 1 秒。既有进度条支持点击、拖动松手跳转和方向键，静态声音使用 OpenAL 偏移，流式声音按样本定位后替换自有预览通道的流，清理旧队列和解码器；换曲/关页/过期请求均不得影响游戏其他声音。
- 本地页面错误新增不依赖页面脚本的恢复面板：延长等待并重新加载、复制诊断、强制退出编辑器。仅用户选择重试时，本页脚本预算至少 3000ms/150M 指令，加载预算至少 30s；不自动提交，不从已终止脚本中间继续，不保证恢复未落盘编辑，也不能终止整个 JVM 的真实死锁。内存不足不提供重试。错误编号、预算、最后已知阶段与原始堆栈写入发生问题的客户端日志。

以上新增修改仅完成源码阅读与编辑，未运行测试、语法检查、Gradle、游戏或打包；版本仍为 0.99.6，Oriel 仍为 0.15.0。

- 药水及共用效果列表的统一/单条时长接受 -1 秒，保存为 duration:-1 并显示“永久”；重新选择已有永久效果不会误换算为 -0.05 秒或 -20 刻，支持切回有限时长。
- 修复农作物等没有对应物品的方块预览：读取真实方块模型及当前状态，修改生长阶段后同步更新预览；方块名称优先使用游戏方块注册表译名。
- “通电”改为“激活”。稀有度统一使用“常见 / 少见 / 稀有 / 史诗”，移除重复的“普通 / 优秀”字典；实时枚举译文优先于手写回退，游戏模式和装备时提示读取当前语言包。
- 补齐桶的匹配类型 entity_data 编辑：提供实体属性和自定义 SNBT 字段；普通生物桶生命超限可同步提高最大生命属性，降低上限时同步降低桶内生命，两组件一次撤销。硫方怪成长会重设属性，保留独立提示。

- 攻击伤害等属性数值支持真实 Codec 允许的 NaN / 正负无穷；使用 NaN、∞、−∞ 紧凑显示，并在常用数值后提供快捷项，移除卡片标题里冗长的特殊值说明。数值显示不改变原始 Double / Float 类型。
- 修复新建修饰器中的特殊数值只存在于子字段时，错误走 JSON 校验/提交而变成 null；校验与应用都保留 typed SNBT，旧 JSON 校验回执不能继续阻塞特殊数值草稿。
- 字段范围信息尚未返回时显示读取状态，不再把已有 NaN / Infinity 短暂判成不支持；属性数值能力独立读取，完整结构超出预算时仍保留原生数字能力，读取失败/超时进入底部统一问题入口。
- 物品 2D / 3D 预览使用与编辑器相同的特殊浮点 SNBT 解析，不再丢掉整组属性组件；移除 3D 预览区自建警告，真实解析失败保留日志并接到底部统一问题入口。Oriel 依赖版本不变。
- 应用确认与高级改动对比按具体属性列出原值 → 新值，不重复没改的攻击速度等属性；每项独立排版，避免标题和整组描述互相挤压。
- 高级窗口两条分栏支持拖动、方向键微调、双击恢复并记住宽度，保留左右内容的最小可用宽度。
- 已放置的玩家头颅在输入名字后更新 3D 皮肤预览，沿用游戏自身皮肤读取，兼容墙上头颅与已有完整皮肤数据。
- 刷怪笼选择生物后立即更新当前草稿的名称、图标与生物面板；仅自然倒计时的 Delay 在三方合并前重设基线，倒计时增加、刷怪数据变化等仍保留冲突保护。
- 世界编辑底部错误支持完整换行及点击查看，保留具体冲突字段，不再横向裁掉红字。
- 桶内生命值允许保存合法的自定义 Float；放出限制改为短提示，例如“放出时：100 → 3”，详细规则点击查看。界面规范与项目 Skill 固化到仓库，后续修改先读同一份规则。

本节仅修改源码，未执行构建、测试或新包实机验证。

- 命令预览中的长组件按可用宽度自动折行，不再把整段属性挤在一条超长横向行；复制、字符计数和应用仍使用原始单行命令。
- Esc 按当前层级返回：候选浮层、子窗口、嵌套物品页依次返回，到主页面才关闭编辑器并回到原背包；输入框已处理的 Esc 不会再次关闭父页，按住 Esc 不会连续越层，未保存的子物品仍先确认保存或放弃。
- 修复纯客户端创造模式提交后，下次打开仍弹出旧草稿：重新读取的完整物品与已提交版本一致时清理提示；服务器回退、提交后继续编辑和未知结果仍保留恢复入口。
- 从背包或容器打开编辑器时保留原窗口及容器会话，在原界面上方显示编辑器；关闭后返回原窗口。玩家、世界、连接或容器变化时不恢复失效窗口。
- 修复编辑器界面比例未覆盖独立提示框：错误、警告、成功和普通通知统一使用编辑器的自动/1～4比例，修改设置时更新已有提示，不改变 Minecraft GUI 比例。

- 玩家生命和伤害吸收超过当前上限时，可联动提高对应属性基础值；按实际永久及临时修饰符计算，保留修饰符，提示将同步修改的上限，点击应用后一起提交。反向降低属性时同步降低超限当前值。
- 修复实体新增属性后原版保存顺序变化导致误报“属性未保留”；只忽略属性行顺序，字段值、类型、修饰符和未知字段仍严格检查。
- 完整实体表单（实体、刷怪蛋、刷怪笼等）的生命及吸收值支持相同联动；仍受游戏注册属性硬上限约束。专用桶标签不读取最大生命属性；额外实体属性需使用匹配类型的 entity_data，入口见当前源码改动。
- 饱和度超过饥饿值时自动提高饥饿值，降低饥饿值时同步降低超限饱和度；正常范围仍由游戏规则决定。
- 剩余耐久超过最大耐久时同步提高最大耐久，两项改动可一次撤销；不再静默只修到原来的满耐久。
- 旧运行实例缺少联动数据时提示更新重启；仅客户端安装仍按服务端实际权限及支持字段处理。

- 补齐仅客户端安装时的自身玩家权限及保存诊断日志：记录命令树能力、提前只读原因、查询与回读次数、是否已发出修改、错误码和具体原因；内部异常保留堆栈，超时不再缺少排查线索，也不把无回执误判为权限不足。
- 补齐玩家/世界页打开、切换、提交、页面失效和回执超时的日志，按请求编号关联；本次不放宽权限或改变可编辑字段。
- 开发 BAT 增加 Fabric / NeoForge × 26.1.2、26.2、26.3 六种启动方案，各版本使用独立运行目录。

- 更新内嵌 Oriel UI 至 0.15.0 瘦包，无需另装 Oriel。
- 整合物品栈命令、可编辑 SNBT 和只读 JSON 视图，改进原生文本高亮及注册表刷新时的焦点、撤销保留。
- 收紧稀有度与附魔光效控件；多选器显示已有选择，取消勾选可移除，并支持在选择时调整挖掘速度、掉落参数。
- 实体数据的类型选择入口支持从保险库取出完整生物；只接受类型的字段明确仅取实体 ID。
- 按游戏版本和物种提供桶字段，补齐蝌蚪年龄锁定、硫磺生物桶的小写年龄字段；生命范围读取游戏数据，保留导入的超限原值，并修复大型实体字段信息的传输。
- 修复效果自然倒计时造成的时长编辑及最后一个效果删除冲突，支持永久时长，同时保留对并发修改的保护。
- 修复保存后快速关闭残留旧物品草稿；保留提交后的继续编辑、未收到结果及被拒绝的草稿，基线变化时允许比较后恢复，不会自动应用。

### Minecraft 26.3 适配与修复

- 修复实体/物品信息异步返回后，SNBT 编辑框失焦、输入被打断及原生撤销失效的问题；刷新时保留正在编辑的原生文本框及其挂载状态。
- 修复生物桶信息异步到达后仍停在外观页的问题，默认进入桶数据页；补齐蝌蚪年龄锁定和硫磺生物桶的 `age` / `age_locked`，按实际加载规则处理生命范围及成长时的生命变化。硫磺桶适配也覆盖 26.2。
- 修复硫磺生物等大型字段信息超过单条传输限制，导致生命范围无法就绪的问题；分片完整重组后再更新表单，读取失败时明确提示，不再一直显示读取中。
- 本包继续包含 0.99.5 已记录的 SDL 输入兼容修复：未绑定 Home 键使用游戏自身的 UNKNOWN 值，避免 26.3 进入世界、捕获鼠标时发生键盘缓冲区负索引崩溃；此项不是 0.99.6 首次新增。

以上输入及桶操作有此前 Fabric 26.3 功能包的实机记录；0.99.6 本次完成六目标构建与包内容核对，未重新执行完整实机矩阵。

## 2026-11-10 后续源码修订

- 世界、玩家与保险库页接入共用声音试听通道；页面关闭或重载时停止自有试听。
- 试听播放器仅放在音效选择窗口列表下方、确认操作栏上方，横跨窗口内容宽度；字段行与列表项内不添加进度或重播按钮，保留原有播放/暂停按钮。暂停后再次播放始终创建新声音，从头开始。早期修订的进度仅供显示；最新源码已补齐完整 Ogg 总时长读取与实际跳转，见本节顶部记录。总时长未知时不显示虚假的百分比，也不允许无依据跳转。
- 玩家页主手名称与当前快捷栏槽位说明统一。
- 图1预算超限的对应调用栈尚未找到；拆分启动时保留注册表回放，优先接收新回复，并增加启动/加载/绘制/草稿阶段日志。不得记作已定位或实机修复。
- 本轮按用户要求未执行语法检查、测试、Gradle、游戏或打包；版本与 Oriel 依赖保持原值。

## 2026-11-10 嵌套编辑、恢复面板及本轮界面修订

此节更新此前源码阶段的状态：按用户补充要求执行语法检查与构建，不运行行为测试，不启动或操作用户游戏，不提交、不发布。Editor 0.99.6 / Oriel 0.15.0 保持不变。

- 跨页编辑：NestedItem 支持通用 commit/valid/commitUnchanged；父页保存真实 DOM 与文档，子页在工作副本里编辑，返回才写父草稿。完整生物编辑复用 esPanel 与 SNBT，覆盖刷怪蛋、刷怪笼、试炼刷怪池、蜂巢、装备、乘客和通用 entity_data；完整物品入口覆盖保险库、容器、装备、交易与弹药。仅接收 ID 的字段不增加虚假的完整 NBT 能力。选中条目最右侧直接编辑，完整物品选择入口标为“所有物品”。保险库取出后编辑不覆盖保险库原条目；父目标改变拒绝回写。
- 物品展示：slots 共用 stackUiDoc/stackUiIcon/stackUiName，将完整组件、移除项和 typed SNBT 传给原生 ItemStack tooltip；数量、耐久不重复绘制。最近编辑上限 48，按完整数据回显自定义名称；本页仍受 1Mi 字符预算、持久 prefs 仍受原有 16000 字符预算，不能保证 48 件超大物品全都跨重启保存。
- 首次颜色：等待真实 text_color 枚举后就地补画色块，不替换 RGB 输入节点；浮层关闭注销监听。
- 草稿消息：本机 latest.log 曾有 Oriel “sending too many messages; dropping some”，默认 burst20/每秒20，旧 ACK 可以递归立即发送完整分块。现按至少 100ms 间隔发送，失败保留原消息并有限重试，按转义后信封长度切分；clear ACK 后清理 clear 意图。保留既有 pagehide 原子落盘，不以发送队列完成为关页保存前提。本轮未重跑游戏，不记为自动保存实测通过。
- 使用文案统一“使用设置 / 完成后效果 / 使用期间”，同步相关依赖提示，不再将 consumable 缺失等同于物品完全不能使用。
- 头部单控件：外观借用与自动单值卡片复用 head-select-card/card-head-select，隐藏无用占位，把选择控件放在最右侧。
- 动画：uiAnimations 布尔偏好写入 cadeditor-ui.json，初始化/返回父页/恢复状态时应用。覆盖全部界面 CSS 动画/过渡、公共 uiSlide 与提示 HUD。modal/pop 关闭时同步失效 ID、焦点与监听，残留节点仅用于 150ms 不可交互的退出动画；替换窗口立即移除，避免返回/提交时序改变。
- 恢复面板：26.3 使用 SDL 左键1，旧代码硬写0导致不响应；改用 InputConstants.MOUSE_BUTTON_LEFT。原生绘制复用 Ore 九宫格纹理和 pixel_12 字体，跟随编辑器比例与浅/深主题，不依赖失败页脚本。复制、重试、退出及过期操作带编号写入日志。设置→高级→恢复面板→体验仅展示原生面板，返回或 Esc 不重载、不触发超时；退出按钮仍会关闭编辑器。入口依赖宿主 recoveryPreview 能力，旧运行实例只显示重启后可用。
- 真实超时证据：本机 18:33:44 在 editor-restore-state 超过 50M/1000ms，旧实现仍无条件记录恢复成功；18:33:46 才停止整页，此时“最后完成 registry.component_schema”不是真正失败位置。恢复状态删除重复整页 rebuild，分辨导入/绘制阶段，只有脚本完成才记成功；恢复面板读取原 Document 的阶段。不能宣称所有大数据卡顿已解决。
- 数字控件：codecNumber 不再在默认值未知时切换到会收缩至20px的 wNum；统一 kNumber，未知值留空可手输或选预设，增减不能凭空从0起步。空框不用数值居中内边距，输入框设最小宽度；异步 set 不覆盖焦点内脏文本，方向键基于当前输入文本增减。NaN/Infinity 保持既有 typed 通路。
- 交易：主列表按玩家视角显示支付/获得、完整图标和自定义名称；点击进入复用 modalShell 的独立编辑页。支付/第二费用/获得按方向排布，复用完整物品选择与 NestedItem，数量就近；次数与经验并排，价格调整按需展开。只改父草稿，仍由世界页 Apply 写入游戏；原字段和 cost_predicate_snbt 随工作副本保留，父目标变更拒绝嵌套写回。
- 警告处理：EntitySchema 泛型、RegistrySnapshot supportedItems、TooltipPreview rarity、WorldAccess 无加载检查及 start.ps1 stderr 输出已调整；LEGACY_CODEC、mayfly 等有语义风险的迁移仍保留明确警告，不为消警告改玩法。

构建记录目录：C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-nested-edit。assemble-six.log 为前一源码阶段六目标通过。assemble-six-recovery-motion.log 保留恢复面板首次构建失败：不可直接访问 GuiGraphicsExtractor.scissorStack；改用 McGui.scissor() 后 assemble-six-recovery-motion-final.log 六目标通过。此后交易/数字等新增改动，以最终构建记录为准；所有记录都不代表游戏验收。

最终回执：

- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --warning-mode all --no-problems-report | 六目标 BUILD SUCCESSFUL；完整日志 C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-nested-edit/assemble-six-delivery.log。
- PASS | node --check（17 个本轮 JS + toast 内联脚本，最后再次检查 worldentity.js）| 仅语法，无行为测试；完整日志 C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-nested-edit/js-syntax-final.log。
- FAIL | git diff --check（整个现有 ui 工作区及本轮 Java/文档）| 检出已有的 cards3.js:331、worldedit.js:185、worldplayer.js:191/:227 空行行尾空格，未据此覆盖其他已有工作；完整日志 C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-10/logs/editor-nested-edit/diff-check-final.log。关键错误：cards3.js:331: trailing whitespace。
- NOT_RUN | 行为测试、游戏实测；不发布、不安装新分发包。新增 Java 恢复面板/消息监听/偏好键需要用户重启开发客户端后加载，源资源热更新本身不能替换运行中的 Java。

## 2026-11-10 输入、局部刷新与增量保存

本轮继续使用 Editor 0.99.6 / Oriel 0.15.0；只构建，不运行行为测试、不启动游戏、不安装或发布分发包。

- 公共 kCode：原生 textarea 每次 input 立即保存原文，停顿300ms后才解析并提交有效数据；失焦、应用、切页、嵌套返回、关闭导出及热重载保存前同步 flush。待处理列表只持有尚未处理的编辑器；回调核对物品/世界归属，避免旧输入写入另一个目标。解析失败的物品原始文本随草稿和热重载状态保留，不当作有效组件提交。
- Store 事件携带 changed component IDs，setLinked 传完整影响集；卡片构建与更新期间收集实际读取的组件依赖，读取全体组件的卡片保留完整刷新。普通字段只更新相关卡片，问题内容未变化不重建节点；页签在原位改数量，结构变化仍重建。普通物品的3D模型节点与旋转保留，只更新其数据属性；生物桶/刷怪蛋及结构变化保留完整预览刷新。
- 未修改组件复用 SNBT文本、类型形状及表单校验缓存；替换宿主快照或未知批量编辑走完整失效。世界 SNBT 修改状态按当前文本与基线缓存规范化结果，避免顶栏/底栏反复解析。
- 撤销以完整起点和有界文本差异表示，保留反向删除文本；最多200步/约3M字符预算、至少两步。大范围替换收益不足时存完整快照。连续同字段输入仍合并；撤销后编辑清理 redo，裁剪时先物化新起点；旧完整快照历史及热重载可读。字符串块比较和分段差异保留 typed NBT、精确long、特殊浮点、未知字段及Unicode原文。生成当前快照仍需完整序列化，不宣称取消了所有大文本工作。
- 物品/世界草稿共用 patch：只从本页已 accepted 的版本生成差异；最多32段，转义后信封不超过7000字符且确实更小时发送。宿主验证页面身份、递增序号、确认基准及当前完整字符串一致，再校验合并后JSON/UTF-8预算；拒绝自动回退完整 put/分块。超时不建立确认基准；旧/重复回执不推进新保存。patch不回传整个prefs，关闭仍独立导出完整快照。磁盘仍用完整偏好文件原子替换，并未改为差异日志文件。
- 热重载状态读取上限64Mi字符；关闭草稿外层JSON上限同步容纳64MiB草稿map的再转义，单条8MiB/总64MiB的实际草稿预算不变。

检查日志目录：../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-incremental-editing/。最终构建及语法结果见下方回执；构建不能替代游戏效果验收。

本轮最终回执：

- PASS | node --check（10个修改的JS）| 日志 ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-incremental-editing/js-syntax-final.log。
- PASS | git diff --check（本轮涉及的JS、Java及文档）| 日志 ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-incremental-editing/diff-check-final.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | 六目标构建通过；最新源码资源日志 ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-incremental-editing/assemble-six-final.log。
- NOT_RUN | 行为测试、游戏实测、安装发布；未测得实际耗时/内存数据，不宣称1MiB复杂NBT已完成实机验收。新增Java草稿patch通道及状态保存上限须重启开发客户端加载；未主动操作用户游戏。
