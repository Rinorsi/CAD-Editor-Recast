# 无服务端模组：自己的普通背包命令写回

## 创造模式的独立写回路径（2026-11-09）

创造模式修改自己的背包使用原版 `ServerboundSetCreativeModeSlotPacket`，不以 OP 标记作为前提。原版不保证把同一物品回传给发送者；客户端采用原版创造界面的本地预测，返回 `status=sent`、`confirmed=false` 并保留草稿，不能将发送当作服务器保存确认。服务端模组路径和下述生存命令路径仍等待各自的权威回执。诊断阶段见 [物品写回日志](INVENTORY-WRITE-DIAGNOSTICS.md)。

真实 Paper 26.1.2 build 74、零插件、服务端未装 Editor/Oriel、创造无 OP：自己的槽 0/9/35 通过实际 UI 应用、服务端独立读取和关闭重开验证。自制测试插件允许这三个写入时通过；主动取消第四个写入时，服务端物品不变，客户端保留草稿且没有 saved。使用固定 Editor 0.99.5，SHA256 `9f6d6dc79963c5462ee1b67c432f73eab462a76983da5a5ceeece98c0350bd26`；证据位于 `../Oriel-UI-Workspace/daily/2026-11-09/logs/paper-compat-181912/`。此结论只覆盖该 Paper 版本和该测试插件，不代表所有权限或反作弊插件服；后续新构建的交互验证单独记录。

## 生存模式的原版命令路径及历史验收

最新验收进度（2026-11-09）：整合产物 SHA256 `5D15E01A1603D16F29EBD57B82AA2D14A8E13B21A44C0C4C8633EF04C877AAFF` 已由 Orca Worker tester 完成库存 / Vault 真实 LAN 11/11，通过自己的槽 9/35 保存重开、主手绑定、Document 晚包隔离、无权草稿和持续提示、授权空槽取出、满包拒绝、容器限制及普通观察者消息隔离。房主 / 观察者无 Editor/Oriel，加入者安装新产物及 Oriel 0.11。证据：`../Oriel-UI-Workspace/daily/2026-11-09/logs/client-only-final-inventory-0610/`。Lead 已独立复核五张关键截图；本结论仅覆盖库存 / Vault，不代替自身新增字段、完整后端及新源码完整 check 的终态。下方旧产物记录保留为历史证据。

服务端未安装 CAD Editor 时，非创造玩家可以在现有物品页面编辑自己的普通背包 0..35（第1～36格，包含快捷栏），主手固定为**打开页面时**的快捷栏槽位。服务器必须允许该玩家执行原版 execute 和 item replace；客户端 OP 标记不作为授权。页面打开时说明当前命令能力；服务器命令树缺少任一命令时提示“原版命令不可用或权限不足，需要服务器授予对应权限”。命令树存在仍不保证写入被允许，每笔由服务器重新授权。

只有点击“应用到游戏”才发送一条原版命令，通过正式 sendCommand API，既不发送聊天文本，也不后台查询 data get。命令路径不会预测修改物品。使用原 StackCodec、真实注册表/组件 Codec 及原页面草稿、stack/result 回执；没有另一套页面或字段表。创造模式和服务端模组采用各自写回路径，服务端模组拒绝不会回退到命令。

装备、副手、容器、方块、实体、其他玩家、离线档案和完整玩家数据不在本轮物品命令能力内；原有入口会明确提示需要服务端支持。可在背包或菜单中悬停自己的普通背包格打开；容器内的非玩家槽位不开放。切换当前主手不改变已绑定的目标。

保险库的本地保存、编辑、整理、导入导出不依赖房主安装模组，也不要求原版命令权限；物品数据仍按当前世界的注册表和 Codec 校验。只有“给我”会尝试修改游戏中的背包，需按下述路径授权。

保险库“给我”复用同一命令引擎，在所选区域找自己普通背包的空槽（默认9..35；快捷栏0..8；指定槽仅0..35）。无空槽明确拒绝，不合并、不覆盖、不使用 /give。原版 ItemStackWithSlot 编码产生 Slot 的 BYTE 类型，服务器用 execute unless data entity @s Inventory[{Slot:Nb}] 条件确认该槽条目不存在；不以 air 或 count=0 冒充空槽。写前仍核对空基线、连接、世界、菜单和页面；必须真实 stateId 更新及完整物品栈匹配才确认 saved。跨编辑器和保险库只允许一笔在途；超时结果未知保留保险库条目及元数据，不自动重发，同连接的未知取出会锁定该条目以防重复。

自身玩家页的命令适配与普通背包写入分开处理；当前字段和确认规则见[自身玩家命令合同](self-player-command-contract.md)。无服务端模组不意味着自身页面一律不可用，也不意味着有命令权限就能直接写任意玩家 NBT。

从已打开编辑器导航至不支持的世界/玩家目标时，原因通过共用 notice 通道显示在本页现有 toast 中（包括即时拒绝、服务端拒绝和切换超时），避免 HUD 被页面遮住；不会伪造保存结果或改变草稿。未打开页面时的快捷键失败仍使用原 HUD。

快捷栏对应内部0..8，其余普通背包对应9..35。只在自己的客户端安装 Editor 和匹配的前置后，可以加入未安装 Editor 的房主：把物品拿在主手，或在背包中悬停自己的物品，按 I 打开，编辑后应用。服务器授予对应命令权限时才会写回；没有权限仍可编辑本地草稿，但应用会拒绝并保留草稿。看到“服务器已确认物品修改”才是已保存；看到“结果未知”须关闭后重读，不能将草稿当成服务器物品。

## 写入与结果边界

- 仅生成固定的自己目标 @s 和 hotbar.0..8 / inventory.0..26（实际背包9..35）；真实原版 SlotArgument 解析验证映射。页面提供的 command 字符串从不执行。物品 ID 和组件键取自实时注册表，值通过真实 Codec 编码为 SNBT，保留未知但合法的持久组件、显式移除和未修改的精确数值。
- 严格检查数量、最大堆叠、组件数和完整命令长度（32767 UTF-16 单元及 UTF-8 编码上限）；整条命令（包括原物品条件及新组件）逐字符通过真实 StringUtil.isAllowedChatCharacter 检查。含 §、DEL 等原版传输非法字符时在本机拒绝并保留草稿，不截断、删除字符或让服务器踢线。
- 打开时绑定连接、世界、玩家对象、容器会话和固定槽位。写前及等待时核对完整物品指纹；已观察到身份或原物品改变后，恢复成原值也不能继续使用旧会话。
- 命令附带原版玩家 Inventory NBT 条件，服务器检查原物品已有字段后才替换。原版 NBT 条件是**部分匹配**，不能完整排除读写间新增字段等竞态；客户端前检和该条件都不是服务端模组的完整 CAS 保证。
- 仅当原版同步后的背包值完全等于期望，且提交后的容器 stateId 已更新，才发 saved。相同本地值、单独的成功聊天、其他格子的同步均不足以确认成功。没有本机 setItem 或隐藏的成功推断。
- 一次只允许一笔提交。命令会话使用唯一超时时钟及绑定的请求 ID，通用传输时钟不参与；失效或已结束请求的迟到同步不能更新宿主基线或发无 ID 的结果。十秒未确认、撤权未及时同步、插件拒绝、断开连接或目标改变时保留草稿；结果不明不会自动重发，该会话必须关闭后重读。关闭/断线会失效会话，不对迟到更新补造成功。
- Oriel Document 重载也使原物品命令会话失效：旧请求不能更新宿主基线，新页持续显示“关闭后重新读取”，并禁止继续提交旧数据。不会用旧请求的 stack 强盖新草稿；即使页面关闭/重载，已发送网络命令的十秒共享租约仍保留。已给出 unknown 的保险库墓碑只锁同连接条目，断线静默清理，不再发第二次终态。
- 物品页面底栏的“写回权限与范围”可展开完整能力说明，状态独立于组件和草稿，恢复草稿或重画后仍可查看；保险库列表上方持续显示当前取出能力。无权限与需要服务端的目标分别说明，不阻止本地草稿/预设编辑。

## 原版消息的受众

不拦截、不猜测关联、不隐藏正常聊天或其他命令，不修改任何 gamerule。原版反馈没有请求 ID，因此不能可靠区分其他来源的相同消息。结果显示在编辑器里，原版仍可能产生少量聊天反馈。

已核对 26.1.2 / 26.2 / 26.3 实际解析 jar 的字节码：

| 受众 | 原版行为 |
| --- | --- |
| 执行者 | send_command_feedback 默认为 true，成功可见；失败由 acceptsFailure=true 处理，不由该成功反馈规则关闭 |
| 其他 OP | ItemCommands 的广播标记为 true；CommandSourceStack 在 send_command_feedback=true 时仅向 PlayerList.isOp 的其他玩家转发管理员消息 |
| 普通非 OP 玩家 | 该原版路径不向他们广播；不能表述为“只有自己看到” |
| 服务端控制台日志 | log_admin_commands 默认为 true，成功管理员消息可记入日志 |
| 插件修改/额外转发 | 未验证，客户端不能保证插件的受众策略；不承诺插件服兼容 |

玩家 CommandSource.shouldInformAdmins 固定为 true；command_block_output（默认 true）控制命令方块来源，不用于关闭玩家的管理员通知。服务器当前规则可能不同，本客户端不修改它们。

withSuppressedOutput 是服务器端 CommandSourceStack API；execute run 只重定向，条件/fork/store/callback 不给玩家来源设置 silent，withCallback 保留原 silent。原版函数执行可创建抑制输出的来源，但需要既有服务器函数/数据包，不是此客户端可无副作用构造的命令包装。因而本轮保留原版反馈。

26.3 把 ItemCommands 移至 server.commands.item，EntityItemAccessor.getReplaceSuccess 使用 CommandResponseTracker.sendFeedback(source, true, ...)，最终仍到 sendSuccess；替换后的 EntityItemAccessor 仍 broadcastChanges。该变更不要求本业务代码按版本复制。

## 验证证据

### 当前候选：六目标构建与完整 check 通过，Fabric 26.1.2 联机记录 23 项通过

2026-11-09，Orca Worker developer 完成三版本、两加载器的 `jar`、`hotbarCommandTest`、`codecTest`、`vaultTest`，以及 Fabric 26.1.2 的 `clipboardHostTest`：91 tasks，2 分 47 秒。每目标 369 项命令检查、167 项保险库检查；完整日志为 `../Oriel-UI-Workspace/daily/2026-11-09/logs/client-inventory-vault/stable-six-target-gates.log`。页面协议、自身能力、Document/查询调度、world/playerx、lint 与 24 场景 snapshot 也由该 Worker 报告通过，日志为同目录的 `stable-*.log`。

本次 Fabric 26.1.2 候选 SHA256 为 `49143F44FAB953FA1343CD9C2B899F793EA8AA424491167F39AE114BD7232FC9`，包含普通背包、授权保险库取出、持久能力说明、Document 重载隔离，以及自身模式/等级的有界权威查询。其他自身字段的后续适配不在此候选内。Lead 独立核对哈希及 183 个冻结源码文件一致；Orca Worker reviewer 确认已报问题闭环。

Orca Worker tester 的 `client-only-expanded-final-0536/scenarios.json`、`expanded-result.json` 记录 23 项 PASS：普通背包 9/35 保存重开、固定主手槽、Document 重载隔离、无权限保留草稿、本机模板保存、授权空槽取出、无权限及满背包拒绝、容器限制、普通观察者无管理员反馈，以及自身等级/模式写回、撤权、混合字段拒绝、健康字段编辑前提示、保存期间新增草稿保留、查询超时与迟到隔离。房主和普通观察者不装 Editor/Oriel；加入者安装上述正式候选与独立测试探针。

Lead 已独立读取同轮安装哈希、三端身份与连接、房主模组清单及 `cleanup.json`（remaining 为空），核对满背包拒绝、健康字段提前提示和等级保存重开截图。审计为 `../Oriel-UI-Workspace/daily/2026-11-09/logs/client-only-lead/expanded-final-0536-audit.json`。页面底栏长说明会截断，字段内/页面顶部的完整限制正文仍可见。该记录只覆盖 Fabric 26.1.2 和上述候选；第二批经验点数、位置/旋转、属性基础值补丁尚未合入，不能沿用此次通过结论。

Orca Worker developer 随后完成同一冻结源码的六目标实际 `check`（未加 `-x`）：`BUILD SUCCESSFUL in 14m 57s`，229 actionable tasks 中 159 executed、70 up-to-date。159 个自定义 JavaExec 检查全部重新执行：Fabric 每目标 27 个，NeoForge 每目标 26 个；标准 `test` 按工程配置跳过，共享验证源码经 `codecVerificationClasses` 及上述 JavaExec 执行。178 份生产文件前后哈希一致，候选 jar 哈希未变。日志与运行/任务回执为 `logs/client-inventory-vault/stable-full-check.log`、`stable-full-check-receipt.json`、`stable-full-check-task-receipt.json`（当天工作区）。这不覆盖尚未合入的修复或新增字段，也不替代其后续编译和真实联机。

Orca Worker tester 已回报该轮终态：23/23 PASS，742 次 RPC 均隐藏且无焦点，自有 Java/Node 进程无残留，端口 25781 无监听。正式报告为 `../Oriel-UI-Workspace/daily/2026-11-09/reports/client-only-expanded/report.md`；同目录 `artifact-index.json` 索引安装、请求、截图和清理记录。早期 `client-only-expanded-0635` 的满背包提示失败是取证时序：实际拒绝正确，但耗时读取后短提示已消失；最终轮先截图核对提示，再等待验证未重试，未修改生产代码或放宽保存标准。

**历史草稿缺陷，现已修复（2026-11-09）**：旧49143的23项没有覆盖“提交后把同一字段改回原值”，复审曾复现saved到达后丢失后续意图；原证据 `reports/client-only-lead/main-self-revert-proof.cjs` 和 `logs/client-only-lead/main-self-revert-proof.log` 保留。修复已整合进5D15，新哈希真实LAN验证模式、等级、X坐标、整数点数、单属性base反向A及位置第三值C：先确认B后A/C草稿仍在，只有第二次显式Apply新请求才写回，每笔命令一次。不是沿用旧23PASS结论；证据在 `logs/client-only-final-next-remainder-0644/`，整轮其他fixture失败原样保留，各项通过按实际场景归档。

### 历史记录

以下早期构建与 LAN 记录属于各自哈希及当时的能力范围，不代表本轮普通背包、授权保险库取出和自身玩家字段的验收。旧轮中的“普通背包拒绝”“生存保险库拒绝”“自身玩家一律拒绝”已被扩大后的需求取代，不能继续作为这些功能的通过标准。当前候选的通过范围见上节。

字节码、jar SHA256、构建及单元测试日志：../Oriel-UI-Workspace/daily/2026-11-09/logs/hotbar-command-silence/。六目标 jar + hotbarCommandTest + codecTest 均通过（review-fixes-matrix.log，84 tasks，1m38s）；每目标 81 项新检查。HotbarCommandTest 覆盖真实 ItemParser 重读、固定槽位、中文/引号/注入字符、精确 long、默认组件移除、数量与超限、§/DEL 在原物品和新组件中的传输拒绝、重复提交、生命周期、超时未知及同步确认；EditorClient 的实际 pollCommand/usesGenericTimeout 接线测试验证单时钟、有效请求 ID、超时后晚同步不更新宿主基线。没有用单元测试代替真实联网。

2026-11-09，Fabric / Minecraft 26.1.2 历史第一轮 LAN 脚本的 13 个逻辑场景通过：主手保存、真实 saved 请求编号与房主库存回读、关闭重开、切换主手后固定原槽位、组件移除/附魔及精确 long/byte-array 保留、撤权/无权保留草稿、目标变化不覆盖、新旧物品非法字符拒绝且不断线、当时的普通背包槽拒绝、世界导航与保险库取出拒绝、受控超时及迟到同步隔离、消息受众。主机和独立普通旁观者均未加载 Editor/Oriel；加入者加载正式 Editor/Oriel。第三个客户端只用于验证普通非 OP 玩家看不到管理员命令反馈。各请求检查窗口隐藏/无焦点，结束后自有进程清理回执为空。

上述 13 项不包括完整的提示视觉验收。Leader 追加截图复核发现世界导航失败的 HUD 正文被页面遮挡，已撤回该轮的世界/保险库可见性结论。后续通知构建 SHA256 `3E8534517FE061FDA8E2B06E5A862C0D92FC54B04FDEF3C844CAE7BDEFA34E8B` 在 `client-only-lan-044502/notice-result.json` 完成三项真实复测：保存并重开、世界导航拒绝的页内正文可见、保险库真实“给我”按钮拒绝正文在弹窗上方可见。该构建仅验证这三项，且生存保险库拒绝仍属于旧需求；不能称为当前授权取出功能的通过证据。

原始回执：../Oriel-UI-Workspace/daily/2026-11-09/logs/client-only-lan-042742/ 的 full-result.json、requests.jsonl、三端 mods.json、截图及 cleanup.json；Leader 独立核验：logs/client-only-lead/final-lan-audit.json。实际受测生产 jar SHA256 为 9EAFBE4D5147D857B4F3D345021DB92AED9B7BF45B662747AD4E5BBFCD82990C。隔离 LAN 使用离线测试账号并关闭该临时房主的在线认证；命令权限仍走原版 PlayerList.op/deop，未覆盖权限判断，也未修改消息 gamerule。

测试工具位于 tools/client-only/，测试探针不进入发行 jar。本轮使用原先外置 Oriel 的构建，不作为 Oriel 0.12 Jar-in-Jar 版本的客户端验收。26.2 / 26.3 及 NeoForge 的兼容构建不代表已实机验收；Paper/Spigot 及其插件转发行为未验证。
