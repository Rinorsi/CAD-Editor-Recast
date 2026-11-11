# NBT 类型往返审计 — 2026-11-09

> 以下是修复前的历史审计，失败数据原样保留，不代表当前源码状态。
> 修复后的协议与验收范围见 [NBT 类型保真](nbt-fidelity.md)。不要把旧 JsonOps 反例改成通过，
> 也不要把页面测试通过等同于最终六包和实机全部通过。

**结论：还有同类问题，不能认定已清零。** NoAI 开关与保险库乘客的上一轮修复只覆盖了局部生产入口。本轮未修改生产实现、未替换六个群测包；新增的是审计脚本、失败复现和这份清单。

## 1. 用户看到报错的原因

世界编辑中，页面经常把 NBT 转成普通 JavaScript 对象。这个过程把 byte、short、int、long、float、double 都压成 number，把 byte/int/long 数组压成普通数组。新字段没有旧的类型参照时，提交可能写成 NoAI:1，原版读取后则存成 NoAI:1b。

26.1.2 原生检查确认：CompoundTag.getBoolean 对 1 和 1b 都可读出 true，不能笼统解释成“原版不接受整数开关”。而 WorldNbt.requireEditedFieldsRetained 对 NBT 使用严格相等，1 和 1b 不相等，即使开关含义被保留，也会报“原版加载器未保留修改的字段”。因此这是我们的类型往返和校验衔接问题，不是单人世界没有权限。

另一方面，数组种类、long 精度和未知自定义 NBT 的变化可能真的丢数据，不能把全部校验放宽为数值相等。EntitySchemaValidation 的部分语义比较与 WorldNbt 的严格比较也不是同一种规则：前者通过不代表后者一定通过。

## 2. 本轮实际执行与范围

- 生产 UI 在 Node VM 中运行：112 项断言，47 PASS / 65 FAIL / 0 HARNESS_ERROR。其中 28 项针对性场景为 3 PASS / 25 FAIL，另外 84 项是 12 种可编辑 NBT 类型 × 7 条路径的矩阵。失败项是仍存在的预期违背，没有把错误行为当作通过预期。
- 原生 Minecraft 26.1.2 解析器、Codec 和实际群测 jar 中的后端方法：110 项，51 PASS / 59 FAIL / 0 HARNESS_ERROR。多数为对上述 UI 输出的二次核对，**不能与 UI 失败数相加当作独立 bug 数**。
- 原生检查包括真实 BlockViews.add → 修改蜂箱停留时间 → BlockViews.apply，已证实未编辑的 entity_data 类型改变；不是只推测 JsonOps 有风险。
- 静态索引扫描 common/fabric/neoforge 主源码，共 164 个 JS/Java 文件、413 行转换相关匹配。索引包含只读注册表、预览和消息入口，不是 413 项实机通过。
- 本轮未启动游戏窗口、未改用户世界。没有声称所有界面点击、所有模组组件或 26.2/26.3 原生加载行为都经过实机复测。
- NBT 的 12 种可编辑类型均已进入矩阵。TAG_End 是二进制容器终止标记，没有单独可编辑的 SNBT 值。

本轮使用的后端包：dist/editor-0.99.5-testfix-20261109/cadeditor-fabric-26.1.2-0.99.5.jar。准确 hash、源码 hash 和 UI 与六包一致性见 evidence provenance.json。

证据目录：C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-09/logs/nbt-audit/

- ui-roundtrip.json / ui-roundtrip.log：每案入口、预期、实际、状态。
- native-roundtrip.json / native-roundtrip.log：原生解析与后端结果。
- type-matrix.md：12 种类型、7 条路径的逐格结果。
- boundary-index.json / boundary-index.md：逐文件、逐行的调用点索引。
- provenance.json：代码与产物溯源。

## 3. 已复现问题清单

| 编号 | 用户入口 / 触发 | 实际问题 | 证据与范围 |
| --- | --- | --- | --- |
| F01 | 手输一处 NBT，再改其他数字 | 全局缓存按 JSON 值找类型，输入 other:1b 后把另一处 Health 改成 1，输出 Health:1b，覆盖原 float 类型 | UI 02；原生 Tag 不相等 |
| F02 | 原始编辑把 1b 改成 1s | 旧参照优先，仍输出 1b；dirty=false、没有历史记录、没有显式 SNBT 提交 | UI 03、06 |
| F03 | 保险库连续导入数值相同、类型不同的两件物品 | 第一件的 1b 被第二件的 1s 覆盖；容器子物品不能仅按“JSON 相同”识别 | UI 04；原生确认 |
| F04 | 连续输入较多带类型数据 | 超过缓存阈值清空旧记录，先前 1s 变成 1 | UI 05 |
| F05 | 复制组件到另一文档 | 只复制 JSON，不复制源类型；会沿用目标的 short 或退成 int | UI 07；12 类型矩阵 copy |
| F06 | 编辑、另录同值不同类型、撤销 | 撤销恢复 JSON，却使用后来缓存的 long，没恢复原 short | UI 08 |
| F07 | 自动保存草稿后重新打开并恢复 | 草稿没有类型元数据；新增 1s 恢复成 1 | UI 09；矩阵 draft；旧基线未改字段并非全部丢失 |
| F08 | 导入 /give 或物品文本 | 数字后缀与类型化数组丢失，超大 long 还丢精度；例：9007199254740993L → 9007199254740992 | UI 10；原生确认该例输出还成为非法无后缀整数 |
| F09 | 复制命令、导出物品 SNBT | stackString/stackSnbt 忽略 component_snbt；1b → 1 | UI 11、12；矩阵 export |
| F10 | 物品预览 / 高级 SNBT 初始显示 | stackCompsSnbt 和原始编辑初始文本已丢类型，显示不忠实；不能承诺打开后再应用总能保真 | UI 13、15；只打开不会自动改游戏 |
| F11 | 列表重排含相邻超大 long 的对象 | 引用按旧索引走，id 已换顺序，long 原文却绑定到旧位置，值发生串位 | UI 16；原生确认 |
| F12 | 收到旧请求或其他文档的 saved 回执 | 核对 requestId 之前清 NBT_SEEN/NBT_FORCE，当前草稿丢类型参照 | UI 22，实际生产 receiveEditorResult 函数 |
| F13 | 从实体默认字段添加 Health | 默认 SNBT 被普通解析成 JSON，20.0f → 20 | UI 24 |
| F14 | 空数据中新加生命值、盔甲架主手、属性 | Health:10、ShowArms:1、base:2，未写所需 float/byte/double | UI 25–27，使用已采集的真实 entity_schema；原生确认类型差异；各实体最终实机写入仍须回归 |
| F15 | 蜂箱页只改蜜蜂停留时间 | 未编辑的 Health:20.0f → 20b，[I;1,2] → [1b,2b] | native-production-beehive-timer-edit：实际 BlockViews.add/apply；未做放蜂后的行为测试 |
| F16 | 原版嵌套 ItemStack 经过普通 JSON Codec 往返 | 自定义组件内 2s、3L、int array 会变成 byte、普通列表 | native-nested-stack-json-codec；讲台/唱片机/宝库钥匙类字段需逐入口继续验证，不能声称全部出现于普通操作 |
| F17 | 文本含合法回车转义 | SnbtReader 与 nbtParse 转义规则不同，反斜杠 r 被读成字母 r | UI 17；属于文本内容改变 |
| F18 | 导入含完整命名空间的组件名 | minecraft:custom_data 的冒号被命令解析器拒绝；导出模组组件还可能加成 minecraft:example:data | UI 14、23；额外的命令/组件 ID 问题 |
| F19 | NBT 包含名为 __proto__ 的合法键 | 转成普通 JS 对象后该键不在自身键列表，正常 JSON 克隆/保存会丢 | UI 28；只证明数据保真问题，未声称全局原型污染或代码执行 |

两项故障注入/条件风险另外计入针对性断言，但不冒充真实模组/正常输入复现：

- UI 18：未知模组组件若只有 byte 类型参照，nbtHasTyped 忽略 byte，修改走 JSON；当前使用虚拟组件 ID 验证选择逻辑，未安装一个真实第三方模组来验证其 Codec。
- UI 19：人为给出损坏 sidecar，nbtApplyFormats 捕获异常后悄悄退回 JSON；当前证明异常处理行为，没有证明正常宿主必然发送坏 sidecar。

## 4. 全链路入口清单与分级

“局部通过”只针对本轮样本；“代码核对”没有追加实机通过含义。同一个共用函数影响多个入口，不能把每个调用点算成独立 bug。

| # | 入口 | 主要实现 | 审计结论 |
| --- | --- | --- | --- |
| E01 | 游戏读取物品 → 页面初始快照 | StackCodec.snapshot、EditorClient、loadStack | 有 JSON 与 component_snbt 双份；原生 sidecar 往返样本通过 |
| E02 | 组件结构化表单 / 原始 fallback | forms.js、cards*.js、Ctx/Store | 语义 Codec 字段和自由 NBT 必须区分；raw 初值有损，新增字段缺类型 |
| E03 | 实体、方块实体、桶、自定义数据组件 | world.js、NBT_RAW | 提交 nbtMerge；受缓存、同值改类型、草稿等 F01–F07 影响 |
| E04 | 手动加字段 / 从默认模板加字段 | worldMap、suggestEntityFields | 手输依赖全局缓存；默认字段未携带类型，F13 |
| E05 | 物品文本 / give 命令导入 | parseStackString、openImport | F08、F18 |
| E06 | 高级整栈 SNBT 编辑 | stackSnbt、advSnbt | 显示与解析往返有损；同值改类型不 dirty |
| E07 | 命令 / SNBT / JSON 导出 | buildCommand、stackString、stackSnbt、stackNbt | F09、F18；纯 JSON 无法完整表达 NBT 类型，不能当无损备份 |
| E08 | 物品 / 实体预览 | stackCompsSnbt、esPreviewAttrs | 预览文本可能有损；预览成功不等于写回通过 |
| E09 | 多物品复制组件 | Store.copyComp | F05 |
| E10 | 撤销 / 重做 / 恢复原值 | snapOf、histPush、restore、revertComp | 历史只记 JSON；F02、F06 |
| E11 | 草稿保存 / 页面重开恢复 | Drafts.flush/offer、Store.replace | F07，类型不是文档持久状态 |
| E12 | 游戏预校验 / 最终提交 | Valid.textOf/run/runHost、nbtApplyFormats | JSON 预校验与最终 SNBT 提交可能不是同一表示；异常退回风险待修 |
| E13 | 保存回执 / 提交后继续编辑 | receiveEditorResult、NBT_FORCE | F12；成功回执不应清其他草稿的类型 |
| E14 | 保险库存取整件物品 / JSON 文件导入导出 | VaultStacks、VaultStore、StackCodec | 服务端整栈 typed sidecar 样本通过；JSON 导入缺 sidecar 无法推回原类型 |
| E15 | 保险库物品放入容器 | cards3.js container、vaultNested | 单件样本通过；同值不同类型多件 F03；草稿/缓存仍有损 |
| E16 | 保险库物品放入束袋 | bundle_contents、vaultNested | 同一共用转换，F03/F04/F07/F12 适用 |
| E17 | 使用后返还物 / 已装填弹药 | use_remainder、charged_projectiles | 同一共用转换；并非只检查 container 一个名称 |
| E18 | 保险库实体 → 刷怪蛋 | spawn.js、vaultEntityObj | 同一全局缓存；已有类型不代表后续多次导入可靠 |
| E19 | 保险库实体 → 普通/试炼刷怪笼当前实体、候选列表 | spawn.js、SpawnData、spawn_potentials | 物品走 nbtApplyFormats，世界走 wePut；均有同值/重排风险 |
| E20 | 保险库实体 → 世界实体套用 | worldedit.js、vaultEntityObj、wePut | 合并成 JSON 后再回 SNBT，受缓存与旧路径参照影响 |
| E21 | 保险库实体 → 新增乘客 | vaultEntityPayload、EntityRiding | 已修的 typed AST 路径本轮样本通过；后端仍接受 JSON 兼容分支，不能称任意旧载荷无损 |
| E22 | 实体保险库持久化 / 根身份与运行字段清理 | VaultEntities、WorldNbt.parse | 代码核对为 typed SNBT，清理字段是业务规则；不是整段扁平化 |
| E23 | 生物常用开关 / Health / 变种 | esFlagRow、esVariant、EntitySchemaValidation | 开关新 boolean 路径已修；新增 float 与数字变种/缺省引用仍要逐类验证 |
| E24 | 生物装备 / 属性 / 效果 / 掉落概率 | esGearGrid、esAttrSet、esEffectList | ShowArms/base 已复现；效果、概率等的缺省与规范化需原生实体实测，不宣称全通过 |
| E25 | 世界完整原始 SNBT 页 | nbtParse/nbtPrint、WorldNbt.parse | 12 类型基本样本通过；完整 SNBT 新语法兼容不是本轮全覆盖结论 |
| E26 | 世界实体/刷怪笼结构化页 → 原始文本 | weObj、wePut、weEntityTab、weSpawnerTab | JSON 工作副本 + 旧 SNBT 参照，F01/F11/F13/F14 适用 |
| E27 | 蜂箱蜜蜂结构化页 | WEV.beehive、BlockViews.add/apply | F15 原生后端复现，优先修 |
| E28 | 讲台书 / 唱片机物品 / 原版宝库钥匙 | wvItem、BlockViews ItemStack.CODEC 字段 | F16 基础 Codec 复现；当前普通选择只建立新物品，不能推断每次点 Page 都破坏 Book |
| E29 | 其他方块语义字段 | BlockViews：BOOL/INT/FLOAT/DOUBLE、颜色、坐标等 Codec | 正常语义字段可由 Codec 重建类型；原生 FLOAT 样本通过；混有自由 NBT 的复杂 Codec 不因此自动安全 |
| E30 | 模组未知实体/方块通用字段 | genericview.js、GenericSchema | 值以独立 SNBT 字符串传输，检查 Tag ID；复杂结构回 raw；代码核对，未安装全量模组样本 |
| E31 | 地面物品 / 容器矿车 / 世界容器格子 / 交易 / 展示实体物品 | EntityViewsSimple/Vehicle、EntityWorldEdit、StackCodec | 主物品写回复用 typed wire；不能与 E28 普通嵌套 JSON 视为同一路径 |
| E32 | 在线/离线玩家属性效果与背包 | PlayerWorldEdit、OfflinePlayerWorld/Edit | 属性效果用语义 Codec/setter，槽位用 StackCodec；原始 NBT 编辑仍受严格校验；未追加完整联机验收 |
| E33 | 保险库玩家预设 / 套用别人的背包 / 自动备份 | VaultTemplates、PlayerPresetValidation、VaultTemplateApply | deepCopy 完整 wire stack，类型 sidecar 没被主动剥离；前轮背包套用联机未完成的问题未在本轮冒称解决 |
| E34 | 保险库方块预设 / 恢复 | VaultTemplates | 原始 SNBT 保留、身份位置字段受保护；代码核对 |
| E35 | 仅客户端物品写回 / 原版命令 | EditorClient、HotbarCommandCodec | 实际 ItemStack → NbtOps 生成命令，与页面“导出命令”不同；若前端已丢数据，该层无法恢复 |
| E36 | 仅客户端自身字段命令 | SelfPlayerCommandPlan/Commands | 语义值与原版命令路径，不支持任意玩家 NBT；这不是单人完整后端误报的根因 |
| E37 | Fabric/NeoForge 传输、会话、快照回包 | 网络桥、EditorSessions、WorldEditSessions | 共用数据模型；未发现其专门按某 loader 擦掉类型的证据；上游丢类型会影响两端 |
| E38 | 注册表、默认值、schema、只读查询 | registry 包、Reg | Codec/默认 SNBT 是权威来源，但转成 JSON 后供“新增字段”使用时仍须把类型带过去 |

补充边界：测试工具/TestKit 也是索引匹配项，不能把它们算成普通玩家保存入口。版本适配改变原版存储类型时必须按对应版本的 schema/Codec处理，不能把某个版本的 float/short 规则推广到全部版本。

## 5. 为什么原来的自动化没有抓住

1. tools/ui-nbt-test.cjs 曾把“新增 NoAI:1”作为正确字符串预期，没有连到原版加载保存检查。这条断言本身不足以证明最终效果正确。
2. tools/ui-world-test.cjs 对盔甲架只断言 data.ShowArms === 1，对新增属性只断言 JSON base === 2，没有继续检查 byte/double。
3. 嵌套保险库用例只覆盖单件 5L，没有两份 JSON 相同但 NBT 类型不同、跨文档、撤销和重开的组合。
4. 旧基线已有类型时很多修改能通过，但“新增字段没有参照”是另一条路径。把前者的通过推广到后者，是覆盖范围判断错误。
5. 原生 Codec 测试可以通过，页面先变成 JSON 后再交给它却不一定通过；分开测试两个阶段，漏了中间的信息损失。

## 6. 修复顺序与验收要求

1. 把类型变成文档/字段路径自己的状态，和草稿、历史、复制一起保存；移除按 JSON 值猜类型的全局缓存设计。
2. 所有 SNBT、命令、预览、嵌套物品使用同一套带类型序列化；支持精确 long，列表重排带着节点类型走。
3. 默认字段和控件新增值使用真实 schema/Codec 的类型；补齐 Health、自动 ShowArms、属性 base 等同类入口。
4. 蜂箱和包含嵌套自由 NBT 的 Codec 传输携带 typed 数据；保留未改嵌套字段。损坏类型参照要明确报错，不能静默降为 JSON。
5. 先核对请求/文档再处理保存回执；有效 saved 也只能推进该次提交的基线。
6. 保留拒绝真正丢字段的校验；允许的原版规范化须由明确的字段规则/实际 Codec证明，不能全局绕过。
7. 让本轮失败复现逐项变绿后，再双加载器三版本构建，并在独立单人世界与联机里验证新增、重复新增、重开、宿主读回和失败草稿保留。

本清单是“审计已发现什么”，不是“这些新问题已修好”。当前六包仍应视作有已知问题的测试包。
