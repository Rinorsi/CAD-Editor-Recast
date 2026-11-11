# 自身命令后端第二批（已整合，26项必测实机分轮覆盖）

2026-11-09 已将冻结候选整合进主仓库。六目标发行包构建、23项UI检查及独立26+7项草稿回归通过；整合源码六目标完整check通过（13分42秒，159个JavaExec实际执行）。受测Fabric26.1.2产物SHA256为 `5D15E01A1603D16F29EBD57B82AA2D14A8E13B21A44C0C4C8633EF04C877AAFF`，自身命令26项必测实机已分轮覆盖，最终归档完成，tester正式终态与清理验收通过。各轮失败及后续筛选运行的NOT_RUN保留，不将任何失败轮改称26/26 PASS。

实际覆盖由同哈希的next-0638前10项、next-remainder-0644中13项、next-lifecycle-0651最后3项逐名合并，Lead已核对权威值、请求ID、截图、安装隔离和清理。天然缺失serialized base未找到样本，不计实机通过；精确200ms只读重查期间重载仅由生产调度source harness覆盖。三版本/两加载器的构建与JVM检查，不等于其他五目标也完成LAN。下方完整十合同清单是实现合同和验收步骤，不能直接视为全部组合已实机通过。断线重连实测新页重读服务器值、旧草稿为空，不承诺跨连接草稿恢复。

## 新增操作

| 前端字段 | 命令与实际提交 | 权威前置 / 回读 | 明确限制 |
|---|---|---|---|
| 本等级整数点数，对应 experience.XpP | experience set @s N points；payload 只有 experience.XpP 量化后的 float | 前置比较 NBT 的 XpLevel 和 XpP；回读等级仍相同且 XpP 精确等于 (float)N/(float)needed | needed 来自玩家真实 getXpNeededForNextLevel()；最近整数点、上限 needed-1；不写 XpTotal；等级和点数分开操作。页面等级与点数范围等级不一致时编辑前提示重读 |
| 同维度位置 / 旋转 | 一条 teleport @s X Y Z yaw pitch；payload commandPosition 只含修改的轴，宿主合并当前基线 | 前置及回读解析 Pos 三元 double 和 Rotation 二元 float，yaw wrap；位置误差 <=0.01格，角度 <=0.001度 | 固定自身 / 当前维度，不接维度 ID；有限数，客户端真实建造高度及世界边界校验；需站稳，移动/转头会前置冲突，坠落/服务器改写会结果未知；本轮不跨维度或设置完整重生点 |
| 一个可同步属性的基础值 | attribute @s registered-id base set N；payload 只含 attributes 单行的 id 和 base | 前置从原始查询 attributes 中找唯一同 ID 的实际 base，对比页面基线；回读同 ID base 精确相等 | 真实注册表 + 玩家实例 + isClientSyncable() 筛选；所有 modifiers 字段拒绝。服务端未序列化/回传此属性 base 时不发送命令，不拿客户端默认值代替；页面事先明确这条限制 |

原游戏模式和等级仍支持。每笔最多一条修改命令，位置与旋转合为一个 teleport 操作；多个属性、等级与点数、不同操作混合时，页面提前禁止 Apply，宿主再次验证。Brigadier 数字采用有限数和无指数十进制表示，ID 通过 Identifier 和注册表验证，不接受任意命令片段。

传送的建造高度继续用 BlockPos 检查，但世界边界使用原始 double x/z 调用 WorldBorder.isWithinBounds(x,z)，不能以 floor 后的方块坐标替代。边界为 ±10.5 时，x=10.9 必须拒绝、x=-10.1 必须允许；Z 轴同理。已核对 26.2/26.3 double 重载 API，并对三版本实际解析 jar 的 WorldBorder 执行正负 X/Z 小数内外边界测试，生产边界调用片段从候选源码直接提取；不是只验证复制的布尔式。

## 权限、草稿和协议

- 只有无 Editor Request 通道的自身页启用；单人集成服/双端完整后端没有变化。
- 能力列表继续取服务器实际命令树；无 OP 时进入页即说明权限受限，编辑后底栏持续说明，本地草稿不混入服务器提交。
- XP 控件显示本等级总点数和整数范围。属性控件来自运行时注册表，提供手动 ID 筛选；未同步属性不写。位置页显示当前真实维度，无跨维度假选项。
- 前后 query 都关联原版 transactionId、页面 requestId、Document、连接 / 玩家 / 世界身份。前置不匹配不写。后置旧值每 200ms **只重查**，8s 总 deadline 不续期，修改命令不重发。查询被覆盖或始终不匹配时结果未知，保留草稿。
- Document 重载永久退休旧会话；旧查询、延迟回调和 scheduled readback 都不能继续写入或更新新页。已发送动作的结果明确未知，不宣称撤销。
- 保存后只去掉已提交且确认的局部字段。等待期间新增的 XP/位置/属性/健康/槽位草稿合并到新权威快照；未编辑的 XpTotal 等不会因服务器自然变化被误造为新草稿。

## 复审 P2 修复：在途的明确编辑不是旧基线差量

共享 weDraftSet 仍保留原来的“等于旧基线就删 delta”行为，完整后端不变。仅 vanilla_self 在实际 evSet 控件路径记录 requestId、目标 token、递增版本和最后明确值。位置按轴、XP 按子字段、属性按 ID、模式/Health 等按字段、库存按容器槽位记录；真实控件显式传递子字段，因此重复输入相同值也构成后续版本，不靠全对象差分猜测用户改了哪项。

例如 X=1 改8提交后再明确改1，旧 delta 虽被删除，事件记录仍保留 X=1。saved8 到达用新权威基线合并后续明确值，继续留下 X=1 草稿；第三值 C 也同样保留。提交8后又明确输入8仍记录后续版本，但权威回读已达到最终意图8时可以清为干净，不留下无意义的再提交草稿。拒绝/未知时不能仅因等于旧基线清理。连续修改只保留最后一次，不会自动重发。world 快照 patch 与终态 result 之间的新输入同样合并，不被第二次回执抹掉。

未改字段不进入事件记录，尤其不会把旧对象中的自然 XpTotal、未动坐标轴或另一属性值恢复到新快照。拒绝和超时同样恢复明确编辑；页面重开清空事件记录，迟到响应仍由既有 Document 退休规则阻断。库存这里只保留本地槽位草稿，不能因此绕过独立库存后端能力。受限 Health/food/abilities 明确编辑可保留，但仍提前阻止混入命令提交。原始数据页、其他玩家、完整后台不扩大此命令事件机制的范围。

新增回归 node tools/ui-self-player-inflight-test.cjs 使用实际 wpCommandPosition/wpStatusTab/wpAttrTab/wpInventoryTab 控件回调、evSet、weDraftSet、weApply/weSend、weSaved/weResult；覆盖反向输入、重复提交值、连续两次输入、单轴/XP子字段/单属性、模式、Health与属性并存、槽位显式清空、自然未改字段、拒绝/超时、split world/result 时序和不自动重发。测试仅借用 DOM/桥接桩，不复制生产合并算法。

## 无 OP 提示原因合同

capabilities.supported 由宿主列出本次原版适配器实际实现的字段，editable 继续来自当前真实命令树与 query 权限。supported 中但不在 editable 的模式、等级、points、位置、base，其控件 sub 或分区持续提示“缺少对应原版命令或权威查询权限；此处仅保留本地草稿”，不会误称必须安装服务端 Editor。Health/food 等不在 supported 的字段仍明确“需要服务端 Editor”。新增 node tools/ui-self-player-permission-hints-test.cjs 对实际表单 sub/分区文案验证无 OP、有 OP、Health 和完整后台的区别。

旧能力快照没有 supported 字段时，前端按已实现适配器的协议字段映射解释原因；这只是提示兼容，不扩大 editable 或授予权限。独立 reviewer 门禁使用这种旧形状，需同样正确区分等级权限与 Health 完整后台需求。

## 继续限制的字段

Health、AbsorptionAmount、food、独立 abilities、完整 respawn、CustomName / Tags 仍需完整后台；XpTotal 不用多阶段 add/恢复来伪造原子操作。效果隐藏链、独立 ambient/icon flags 和降低效果所需的 clear+give 尚未适配。本轮也未新增配方/成就/统计/存档玩家命令。

属性页显示的是客户端已同步的基础值；提交前的原始 query 才确认服务器实际 base。它不是已打开页面的持续服务器订阅，也不是服务器 CAS。服务端还可能在前置查询后并发修改数据；最终只确认指定字段达到期望值。

## 三版本依据

对 26.1.2、26.2、26.3 解析 jar 执行 javap：Player 的 XpLevel / XpP / XpTotal 和 getXpNeededForNextLevel；Entity Pos 的 Vec3 Codec、Rotation 的 Vec2 Codec；LivingEntity 的 attributes 列表；AttributeInstance.Packed 的 holder id、double base、独立 modifiers Codec；Attribute.isClientSyncable / getDefaultValue，ListTag.getDouble/getFloat，CompoundTag.getList/getString/getDouble 均核对。完整输出位于 logs/self-player-capabilities/版本-next-fields.txt 和 版本-next-nbt.txt。

等级 set 的实际参数为 IntegerArgumentType.integer(0)，接受 0..2147483647；Editor 不再另设 1000000 上限。三版本原版 Player.getXpNeededForNextLevel 在等级 ≥30 时用 int 计算 112+(level-30)*9，238609311 级之后溢出；UI 明示此原版风险。整数点数操作仍取实际玩家 API 的结果并要求正数，不把损坏或溢出的范围当成可提交范围。直接保存原版 float 进度只适用于服务端 Editor，命令路径仍遵循一条命令及整数点数合同。

## 自动化验证

完整后端回归范围（2026-11-09）：同一5D15产物由 Orca Worker tester 在 Fabric26.1.2 实际执行单人集成服和双端LAN smoke。正式自身页生命16、饥饿12、饱和0、等级7混合一次Apply，匹配saved编号、服务器读回和重开；fallback修改命令为0。双端真实撤OP后返回player_forbidden，服务器生命仍16、草稿15保留。Lead已独立核对回执和截图。它验证新命令白名单没有限制这些完整后端操作，不代表所有扩展字段已逐项实机回归。双端普通旁观端需要匹配Oriel0.11、无Editor也可连接；无Oriel的首次拒绝保留为安装边界。

新增 node tools/ui-self-player-next-test.cjs、node tools/self-player-next-codec-test.cjs，并更新自身能力 / Document 独立测试以适配新 plan。所有测试在隔离目录运行；依赖原资源时设置 EDITOR_BASE_SOURCE_ROOT 指向主仓库，只读借用未改文件。Codec 测试从候选源码提取生产方法，用临时 JDK source harness 覆盖量化、原始 NBT 解析、NaN/重复 ID/缺字段和 modifiers 不变；不会启动 Minecraft。

已有 world 和 playerx UI 全套使用只读资源映射加载候选文件回归；整合后又以主仓库实际源码执行 UI 检查及独立草稿回归。六目标 jar 已实际构建通过，完整 check 已由唯一 Gradle developer 执行通过；新哈希实机测试由 Orca Worker tester 执行。最终结果须分别以这两个执行通道的终态回执为准，不沿用旧产物的 LAN 结果。

真实 WorldBorder 回归入口为 node tools/self-player-next-codec-test.cjs --border-classpath 路径，参数文件包含该版本已解析 Minecraft jar 和所需库的 classpath。JDK source probe 调用真实 WorldBorder/BlockPos，并执行直接提取的生产检查片段；不启动游戏、不启动 Gradle、不改主线。其他 Codec helper 测试仍是轻量模拟 NBT/Gson，不能据此宣称整个模组已编译。

## LAN 验收步骤（每个声明版本，测试目标始终是操作者本人）

1. 无 Editor 服务端 + Editor 客户端，先无 OP 生存打开自身页。所有新操作提前显示无权限，改草稿不会发修改命令；草稿仍在。由测试服管理员授予 OP，关闭重开，确认命令树实际支持的字段开放。
2. 生存状态稳定等级下记录服务器 XpLevel / XpP / XpTotal。设本级整数点数，观察唯一 experience set @s N points，回读确认后才 saved；检查进度量化与 UI 提示一致、XpTotal 未被此命令修改。等级和点数一起改应提交前阻止。
3. 页面打开期间由测试服改变操作者经验，再提交旧点数。前置查询拒绝，不发送命令，草稿保留，无自动重试。
4. 站在实体方块上，编辑本维度另一处实体方块上方坐标和 yaw/pitch，一笔 teleport，查询坐标/角度在声明容差内才 saved。测试 yaw 360/-180 附近 wrap。编辑期间移动或转头前置拒绝；传到空中坠落允许 unknown，不得凭客户端预测值 saved。
5. 编辑真实存在且可同步、服务端 NBT 中存在的属性（如已实例化的 max_health）。预先记录完整 modifiers，改一个 base，确认请求不带 modifiers；服务器 base 达到目标，modifier ID/amount/operation 完全保持。手动输入 ID 应能筛选到注册表条目；不存在或未同步 ID 页面提示拒绝。
6. 两个属性或 base 混合其他操作应提前受限。编辑期间由测试服改变该 base，前置冲突且不写。属性缺原始序列化 base 时明确拒绝，不从默认值补造成功。
7. 在 prequery、后 query、200ms 重查等待三个时点 reload Document：前者不发修改，后两者未知；迟到回读不能更新新页。新页必须关闭重读后再用命令会话。
8. 保存等待期间把位置8改回旧1、XP/单属性改回旧值，或改第三值C，确认先前请求B后A/C必须仍在。重复输入B也要记录，但新权威值已是B时可以clean。另测连续两次修改取最后值、mode与Health/属性并存、槽位先加后显式清空、world patch 到 result 之间继续输入、拒绝/超时保留；服务器自然变化的 XpTotal 不能成为新草稿，且从不自动重发。
9. 查询被其他原版 debug 查询占用、撤 OP、断线、换世界：无误报 saved、无自动重发修改，8s 内明确未知/未发送。可控调度测试另覆盖首次旧值、第二次目标值且修改发送次数1。
10. 单人集成服与双端完整 Editor：原全部玩家字段、扩展页和权限仍有效，新命令白名单不限制这些后端。
