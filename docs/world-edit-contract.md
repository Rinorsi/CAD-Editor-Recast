# 已放置方块与世界实体编辑协议（26.1.2）

实现入口：world/WorldEditor、WorldTarget、WorldNbt、WorldEditSessions、WorldWire；客户端 WorldEditorClient。2026-11-07。

实体侧增量见 [world-entity-contract.md](world-entity-contract.md)：动态字段稳定 revision、盔甲架姿态/装备、服务端交易、乘客操作、展示框/画/三种展示实体的规范化 views 与写入；该文覆盖本文早期的实体动态变化冲突限制，附真实专用服采集。

方块侧增量协议见 [world-block-edit.md](world-block-edit.md)：`apply.block_state`、命令块模式 `block_type`、`updateNeighbors`、`views` 规范化写入、`block_state_schema`、包含方块状态的 revision/undo，以及经原版字节码确认的 volatile 字段合并。真实工厂捕获见 [world-block-samples.json](world-block-samples.json)。这些能力已替代本文早期版本中的“状态只读/任意动态变化冲突”限制；真实客户端状态变更/邻居同步仍待专项验收。

## 入口及页面数据

- 默认 I 键统一编辑目标，O 打开保险库；均在原版控制设置中可改键，语言键为 key.cadeditor.edit / key.cadeditor.vault。
- I 顺序：容器界面悬停物品 → Shift 时主手物品／空手自己 → 距离内准星实体（包括玩家） → 带方块实体的方块 → 主手物品 → 空手时带状态属性的普通方块 → 自己。石头等无可编辑内容的普通方块不算目标。服务端拒绝后显示原因，不切换目标。
- 在线玩家的精确接口、服务端原版权限与撤销见 [world-player-contract.md](world-player-contract.md)。
- 客户端命令 /cadeditor block、/cadeditor entity：读取准星目标。/cadeditor block x y z 支持绝对整数坐标，仍受服务器交互距离限制。
- 不解析相对坐标，不允许跨维度编辑，不提供移动目标操作。实体准星命中使用 UUID，网络实体 id 只是提示。
- 网络 open 也可只给实体 id；服务端马上解析为 UUID，后续会话必须使用返回的规范化 slot，防止 id 重用。
- 客户端与服务器都需要模组。没有服务器 request 通道时显示 UNAVAILABLE：服务器未安装物品工坊；不尝试原版创造物品包降级写世界。
- 同一 cadeditor:ui/index.html 页面，世界模式初始数据为 oriel.data.world（**没有 stack**）。UI 应以 world.kind 分支；未接入前界面不保证可用。
- apply / undo 页面消息由宿主在游戏线程转发。目标 slot 与 revision 绑定宿主上一次 opened/saved，页面不能换目标或伪造新基线。
- 保存成功 patch world 与 result；失败只 patch result，保留页面草稿。页面应显示服务端 reason。

## 沿用网络包和 envelope

### 页面内切换在线玩家（2026-11-09）

已打开世界编辑页可发 oriel.send('open_world', {uuid:'目标玩家UUID'})，或 {self:true} 返回自己；二者互斥，不接受页面提供 dim/slot。宿主使用客户端当前维度构造 {kind:'entity',player:'online',uuid,dim} 或 {kind:'entity',player:'self',dim}，沿用现有网络 open、权限和交互距离检查，不需要准星。

仅 opened 成功后在当前 screen patch 'world'（不新开 OrielScreen），页面可用 weSaved(world) 整体换页；宿主同时切换规范化 slot/token/revision，清除旧扩展视图基线。apply/undo 只能使用新目标的 slot，旧目标或旧 token 即使 UUID 相同也拒绝；revision 始终由宿主绑定。切换期间禁止 apply/undo/玩家扩展请求；已有写回或扩展请求尚未完成时，先提示等待，不发送切换请求。页面负责在主动导航前处理自己的未保存草稿。

离线、距离、权限或格式拒绝通过现有 message(...) 提示，不 patch world，不修改原页面/宿主基线。服务端只有每位请求者一份世界会话，成功 open 自然替换旧会话，失败保留；不在请求前 close 旧目标。页面关闭仍发送当前规范化 slot 的 close；若切换回执晚于关页/超时，宿主按回执 slot 关闭新会话，不重开页面，也不覆盖后来已打开的会话。

定向验证（2026-11-09）：Fabric/NeoForge × 26.1/26.2/26.3 compileJava + playerWorldEditTest 全部通过，每目标 47 项；日志 logs/player-extended/open-world-matrix.log。纯 JVM 覆盖 UUID/self 选择器、非法/混合字段、宿主 slot/revision 同步绑定、旧目标与同 UUID 旧 token 拒绝、undo、数据副本隔离、服务端会话替换与旧 close 不误关新会话。

Fabric 26.1.2 隔离专服扩展探针 472 项/97 笔消息通过，其中新增导航相关 9 笔真实往返：打开自己→另一在线玩家→新目标 apply/undo→返回自己；旧会话写入拒绝，远距离/离线目标拒绝后原会话仍可保存。证据 logs/player-extended/open-world-server-receipt.json、open-world-navigation.json、open-world-probe-run.log；机器摘要 open-world-summary.json。本次无新增版本 API 差异，未执行全量验收或客户端实机点击；真实 Oriel 页面 patch 与 Toast 画面由最终集成验收覆盖。

物品的 cadeditor:request / cadeditor:reply 自定义 payload 不变，按 slot.kind 路由。世界数据独立于 ItemStack 会话缓存；复用现有的错误类型、连接寿命、requestId/result 模式，但不把世界 NBT 假装成 ItemStack。为避免重构影响既有物品提交，仅在 EditorMod/EditorClient 添加路由。

所有例子为展开后的 JSON。requestId 最长 80 字符。

打开方块：

```json
{"op":"open","requestId":"w1","slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0}}
```

打开实体：

```json
{"op":"open","requestId":"w2","slot":{"kind":"entity","dim":"minecraft:overworld","uuid":"实际目标 UUID","id":123}}
```

opened / saved：

```json
{"status":"opened","requestId":"w1","world":{"kind":"block","type":"minecraft:chest","block":"minecraft:chest","block_state":{"facing":"north","type":"single","waterlogged":"false"},"slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0,"token":"服务端随机令牌"},"revision":"64位十六进制不透明会话版本","snbt":"完整权威compound","nbt":{},"comps":{},"component_snbt":{},"container":{"size":27,"kind":"minecraft:chest","unresolved_loot":false,"slots":[{"slot":0,"stack":{"empty":true}}]},"views":{},"canUndo":false}}
```

以上是**形状示例**，不是捕获数据。真实默认值、组件、字段大小写一律来自原版保存方法/Codec，不能照抄示例为选项表。真实 JVM 工厂捕获见 logs/world-edit/captured.json（每种测试方块原样 SNBT、revision、helper；测试模式不是实机网络回执）。

world 字段：

|字段|含义|
|---|---|
|type|方块实体/实体注册表 ID；实体页面用它读取 entity_info / entity_schema，后端不复制该 schema|
|snbt|权威完整保存 compound。byte/short/long/float/double、B/I/L数组保留类型|
|nbt|用于只读展示的 JSON 投影；**不可将其 stringify 后当作 SNBT 写回**|
|revision|服务端生成的64位十六进制不透明会话版本；仅open或成功保存/undo推进，tick/拒绝/限流不变；客户端原样回传，不从NBT计算|
|slot|服务端规范化目标，含随机 token；实体同时含 uuid 与 id|
|comps / component_snbt|方块 collectComponents 的实时 Codec 视图及权威类型旁路；只读 helper，不直接作为世界 apply 输入|
|container|运行时 Container 的 size / slots；另支持讲台书和营火实际 items 列表。空格明确为 stack:{empty:true}，非空与物品编辑 StackCodec.snapshot 格式一致|
|views|实际保存字段绑定：存在时导出 LootTable/LootTableSeed、lock/Lock、front_text/back_text、patterns、bees/Bees、Command/auto/conditionMet/powered，值为 {value,snbt}；不存在不杜撰。旗帜/蜂巢等也可能在 comps 中|
|views.sign/banner/beehive/lectern/jukebox/decorated_pot/chiseled_bookshelf/command_block/skull/furnace/brewing_stand/campfire|规范化 {value,snbt,schema}；增量apply.views同名分组，字段/限制见world-block-edit.md|
|block_state_schema / has_block_entity|真实属性定义及当前/默认值；无BE普通方块只支持状态编辑|
|block_type_schema|仅命令块：实时注册的命令块模式方块ID|
|views.spawner_info|现有 SpawnerData.entries，带两种刷怪笼的真实默认值和 Codec 信息|
|views.command_mode|原版命令块 mode；使用 apply.block_type 选择实时注册表中的命令块模式；block_state 可修改 conditional 等真实属性|
|equipment|生物实际 EquipmentSlot 枚举，每项 {slot,stack}；装备编辑使用完整 SNBT（可由 entity_schema 给路径）|
|displayed_item|物品展示框中的实际 ItemStack 快照|
|canUndo|仅表示会话内有一份前像，撤销仍须通过 revision 与权限检查|

未展开的战利品容器返回 unresolved_loot:true 和空 slots；不调用 unpackLootTable、不生成或消耗战利品。拒绝对此目标提交 normalized container 槽位修改，先在游戏内打开容器。

## 写入与撤销

完整替换：

```json
{"op":"apply","requestId":"w3","slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0,"token":"opened令牌"},"revision":"opened/saved基线","snbt":"包含原身份/坐标字段的完整compound"}
```

容器增量编辑（省略 snbt，未列出的格保留）：

```json
{"op":"apply","requestId":"w4","slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0,"token":"opened令牌"},"revision":"基线","container":{"slots":[{"slot":0,"stack":{"empty":true}},{"slot":1,"stack":{"id":"minecraft:paper","count":1,"comps":{},"removed":{}}}]}}
```

页面发送同形状 apply 消息时可不带 op / revision，宿主自动补充；slot 必须与打开目标一致。建议不组合 snbt 与 container；组合时先加载完整 SNBT，再覆盖列出的格，未列格的游戏变化由三方合并保留。

撤销：页面消息 undo，内容 {requestId,slot}；网络 op:undo，宿主补 revision。成功返回 saved 与 world。每次 apply 存前像一次，下一次 apply 替换该前像；undo 成功后清空前像，没有 redo。关闭、断线、重开或服务端重启会丢弃撤销缓存。

服务器先创建同类型的未放置方块实体副本，用 TagValueInput / loadWithComponents 校验，刷怪笼追加 SpawnerData 校验；实体由真实 EntityType 工厂创建未加入世界的临时副本，用 load 校验。收集 ProblemReporter 错误，拒绝原版加载器忽略或改写的**已编辑**顶层字段。容器逐格使用 ItemStack Codec/strict 校验、数量和原容器 canPlaceItem 限制；讲台用实时 lectern_books 标签，营火用实际营火配方。输出格不接受替换时可清空，不能绕过槽位规则。未知模组的自定义副作用没有兼容保证。

全部校验和快照大小检查通过后，在服务器单线程加载现实目标；方块 setChanged + sendBlockUpdated + 比较器通知；实体通过原版 load 更新同步数据，设备同步仍走原版追踪。不 remove/replace 实体，不插入副本。实际写入抛异常时尝试恢复前像并记录回滚失败；这不是外部模组回调副作用的通用事务。

身份/移动字段锁定：方块 id/x/y/z/keepPacked；实体字段以实体增量协议为准。玩家使用 world-player-contract.md 的在线授权逐项接口；禁止对玩家整份加载 NBT，禁止换方块实体类型。命令块 conditional/facing 使用 block_state；模式由同一 BE 类型的 block_type 操作切换；command/auto 可走规范化视图或 NBT，仍需原版管理员权限。

## 大箱子（普通箱子与陷阱箱）

双联 `ChestBlock` 的 `container` 同时覆盖两个真实方块实体，新增只读 `double` 元数据。单箱仍为 27 格且没有 `double`。`slot`、`snbt`、`nbt`、名称和 `block_state` 仍指点开的那一半；不要把另一半 NBT 拼进 SNBT。

```json
{
  "container": {
    "size": 54,
    "kind": "minecraft:chest",
    "double": {"partner": {"x": 1, "y": 64, "z": 0}, "size": 54, "order": "vanilla"},
    "unresolved_loot": false,
    "slots": [{"slot": 0, "stack": {"empty": true}}, {"slot": 27, "stack": {"empty": true}}, {"slot": 53, "stack": {"empty": true}}]
  }
}
```

上例省略其余槽；正常返回完整 0..53（含空格）。位置仅为形状示例，真实伙伴位置通过 `ChestBlock.getConnectedDirection` 和两边状态检查取得；陷阱箱 kind 为其真实 BE 类型。任一半有未展开战利品表时保持原有规则：`unresolved_loot:true`、空 slots，拒绝 normalized 槽位写入，不生成战利品。

编号严格采用原版 `ChestBlock.getBlockType` / `CompoundContainer` 顺序：FIRST 的本地 0..26 对应全局 0..26，SECOND 的本地 0..26 对应全局 27..53。从任意一半打开，完整槽位数组及编号相同。**26.1.2 实际枚举映射为 ChestType.RIGHT → FIRST、ChestType.LEFT → SECOND**；玩家所见左右与状态枚举命名不能直接等同，前端必须按返回的编号绘制，不按枚举名字重新排序。

跨半修改仍使用相同增量请求，不需回传 `double`：

```json
{"op":"apply","requestId":"double-1","slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0,"token":"opened token"},"revision":"opened/saved revision","container":{"slots":[{"slot":0,"stack":{"empty":true}},{"slot":53,"stack":{"id":"minecraft:paper","count":1,"comps":{},"removed":{}}}]}}
```

两半各自从冻结基线生成分离副本，经原版 `loadWithComponents`、物品规则及三方合并校验，再统一写入。另一半同样检查区块、交互距离和区域权限。两半加载完成后才通知比较器；任一半写入或最终响应构建失败时，恢复两半的写前 NBT/状态，版本和撤销缓存不推进。未知模组回调的外部副作用与已有事务一样不保证可撤销；回滚异常记录为 suppressed 异常。

会话基线、内容指纹及 undo 前像包含两半。未编辑的当前槽位保留；任一半同槽不同修改报 `target_changed`，整笔不写。点开半的冲突沿用 `["Items","[Slot=0]",...]`，另一半前缀为 `["container","double","partner","Items","[Slot=0]",...]`，其中 Slot 为该半本地 0..26，按上述顺序映射到页面全局编号。

连接关系（两边位置、方块类型、LEFT/RIGHT、朝向）属于会话身份。拆成单箱、移除任何一半、换块或改变连接/顺序均报 `target_changed`，`stale:"identity"`、`conflicts:[{"path":["container","double"]}]`，不得写入任何一半。双箱会话内改变 `type`/`facing` 使其断连也拒绝；关闭后按新拓扑重新打开。单箱状态编辑仍沿用原协议。undo 同时还原两半本次实际修改的路径，保留后来未冲突的其他槽位。

验证使用 map-backed Level fixture 和真实箱子工厂/原版容器/加载器，覆盖普通及陷阱箱四方向、两边打开、跨半写入、合并、撤销、写入/响应失败回滚与拆除。真实客户端、红石 tick 和网络同步留待统一实机验收，本轮不启动服务器探针。

## 权限、保护和冲突

会话版本、ACK更新点、stale诊断与retryAfterMs精确规则见 [world-revision-contract.md](world-revision-contract.md)。网络revision是冻结会话版本，不再计算实时NBT哈希。

通用三方合并的完整规则、conflicts 回执、undo 与验证边界见 [world-merge-contract.md](world-merge-contract.md)，覆盖旧版全量冲突规则。

- open 与 apply / undo 都要求存活；无 game master 权限者仍拒绝旁观，有 game master 权限者允许旁观/冒险及 mayBuild=false，且通过同一 EditorPolicy（创造模式或 game master 命令权限；有 game master 权限不受游戏模式影响，旧配置不能否决该权限）。读世界 NBT 也不对无权限用户开放。有权限玩家将自己改为旁观或 mayBuild=false 后，仍可继续编辑及 undo。原版出生点保护继续由 level.mayInteract 判定；DedicatedServer.isUnderSpawnProtection 本来就豁免 OP，本编辑器不额外绕过区域检查。
- 服务器强制当前维度、已加载区块、动态 block/entityInteractionRange、world border、player.mayInteract、level.mayInteract；无 game master 权限时还要求 mayBuild。不会给目标加载区块或传送玩家。
- 原版 GameMasterBlock 标记方块（含命令方块/结构方块/拼图方块）、onlyOpCanSetNbt 实体及新增此类乘客，额外要求 ServerPlayer.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)。生存模式有该权限允许；创造模式无该权限仍拒绝，不能借创造写命令块。
- 修改标牌文本且结果包含可执行命令时，同样要求 COMMANDS_GAMEMASTER；生存模式有权限可写，创造无权限不可写。通过 EditorPolicy.gameMaster 复用真实 permission set 判断，不调用隐含创造要求的 Player.canUseGameMasterBlocks。距离/区域/存活等其他守卫仍适用。
- 第三方领地插件若仅在交互/破坏事件拦截、未集成上述原版检查，尚未提供兼容适配；不得宣称适配了所有保护插件。
- 每个玩家只保留一个世界会话；连接绑定，无编辑时长硬超时。打开/写入间隔至少 500ms，关闭不受限。
- 修改前，revision 匹配服务端会话基线、token 匹配即可；身份仍须匹配当前目标。base/mine/current 逐路径三方合并，用户未改的路径取 current；双方改同一路径且不同才 target_changed，并返回最多20项 conflicts:[{path:[字符串段]}]。完整 SNBT 由服务端自行 diff。
- 逐次成功写入审计包含玩家 UUID、op、目标、前后 revision；拒绝包含 requestId/code/reason，前缀 [CAD-Editor-World]。不将完整自定义数据写入审计行。

## 限制与错误

SNBT 最长24000字符，深度32；展开网络消息最多192KiB。宿主对大世界消息自动 gzip+base64，网络外壳 {worldEncoding:"gzip-base64",data:"..."}，压缩后不超过30000字符，页面不处理该外壳。拒绝解压炸弹和嵌套压缩；不会扩大原有物品 payload 限制。

rejected 沿用 {status:"rejected",requestId,code,reason}。

|code|含义|
|---|---|
|UNAVAILABLE|客户端发现服务器未提供模组通道|
|not_allowed|权限、玩家状态、命令块/特殊实体管理员要求未通过|
|target_unavailable|目标不存在、被移走、维度不同|
|chunk_unloaded|方块/实体所在区块未加载|
|out_of_reach|超出当前交互距离|
|protected_area|原版保护/边界/建造限制|
|player_target|不支持的玩家类型或通用实体 NBT 路径；在线玩家见专用协议|
|player_forbidden / player_offline|缺少原版游戏管理员权限／玩家离线或不存在|
|protected_field|试图修改身份、位置、关联字段|
|target_changed|旧页面版本附stale:client_revision，身份变化附stale:identity及conflicts；真正路径冲突附conflicts，旧会话分支至少附stale:session；草稿保留|
|session_lost|缓存/token/目标不匹配，须重新打开|
|invalid_nbt|SNBT/原版加载校验/被忽略编辑字段/未改格变化|
|invalid_block_state|未知属性、非法值/组合、非法命令模式类型或环境使目标状态失效|
|sign_waxed|蜡封标牌改文字但未在同笔解蜡|
|slot_invalid|容器槽位或数量/物品类型限制|
|unsupported_target|工厂/容器适配不可用，或战利品未展开|
|undo_unavailable|当前会话没有可撤销前像|
|rate_limited|500ms内重复打开或写入|
|payload_too_large|SNBT、快照或压缩消息超限|
|invalid_request|其他格式错误|
|request_timeout|客户端10秒未获回执，结果未知；先重读核对|

## 验证边界

tools/world-edit/verify.ps1 -ClasspathJson <当前真实运行时classpath.json>：编译全Java源与测试，运行 WorldEditTest、StackCodecTest（含会话/TestKit）、BackendDataTest、ComplexStackRoundTripTest。工具不依赖固定 daily 路径，不运行 Gradle、不启动游戏。测试复用现有 EntitySchemaTestLevel 作为无区块、不tick的纯JVM工厂环境。

JVM覆盖：21种方块工厂/真实加载保存、容器实际格数及多格附魔物品、typed custom_data 及无关格编辑保真；猪variant、盔甲架装备、展示框物品的临时副本改名往返；id/UUID保护、无效SNBT、stale revision、token/close、速率、压缩传输、共享权限及距离/区块/玩家/保护区错误守卫。守卫单测不等于真实ServerPlayer/区块/领地集成验证。

实机窗口、集成服务端放置写入/同步、多人同时编辑、专用服务端和第三方保护插件：尚未验证。用户游戏在运行时不启动第二个客户端或Gradle；交付时必须单列 pending，不能用上述工厂测试冒充真实客户端验收。

## 目标支持表（后端实现，不代表已完成实机验收）

|目标|实现状态与边界|本轮证据|
|---|---|---|
|箱子、木桶、漏斗、投掷器、发射器、潜影盒、合成器|容器helper、完整SNBT及原子槽位编辑|JVM实际工厂/加载保存；箱子27格附魔与类型保真物品|
|熔炉、酿造台|容器helper、完整SNBT/槽位编辑，原版canPlaceItem限制保留|JVM工厂/加载保存；实际燃烧/配方tick与网络同步待实机|
|讲台、唱片机、雕纹书架、饰纹陶罐|真实格数/书/唱片helper及写入路径；遵守槽位/标签规则|JVM实际工厂、带内容加载保存|
|营火|实际items helper、完整SNBT/槽位路径；新物品须符合实时营火配方|JVM加载保存；替换后烹饪进度由完整SNBT控制，未做自动重置专用表单|
|标牌、悬挂标牌|front/back文本helper、SNBT编辑；命令文本追加管理员要求|JVM真实SignText Codec文本编辑往返|
|旗帜|patterns/组件helper、SNBT编辑|JVM实际旗帜图案组件往返|
|命令方块|command/auto等规范化字段、block_state.conditional/facing、block_type模式|JVM实际Codec/模式副本NBT保真；执行/调度待实机|
|刷怪笼|默认/字段helper、SNBT编辑及SpawnerData验证|JVM修改Delay往返|
|试炼刷怪笼|默认/配置helper、SNBT编辑及SpawnerData验证|JVM修改required_player_range往返；动态激活状态由逐路径三方合并保留；真实激活 tick 未专项验收|
|蜂巢|bees组件/保存字段helper、SNBT编辑|JVM含实际Occupant的保存加载|
|猪与其他生物|类型ID、设备helper、完整SNBT临时实体验证，variant路径由entity_schema提供|JVM猪实际variant、盔甲架装备及改名往返；其他生物未逐种验收|
|物品展示框|displayed_item helper、SNBT验证及写入路径|JVM含附魔物品的展示框改名，物品数据保持|
|画|通用实体路径及entity_schema，禁止变更悬挂定位字段|未做本轮画实体工厂/实机专项测试，标为partial|
|普通已放置方块|支持状态/schema/revision/undo；无方块实体时不提供NBT编辑|真实属性遍历；实际setBlock待运行|
|空气、未加载/跨维度/远距离目标|明确拒绝|在线玩家的支持范围及真实专用服探针见 world-player-contract.md|

当前不能宣称“世界编辑已实机通过”或“1.0验收完成”。前端接入、真实ServerPlayer/ServerLevel权限保护、网络与同步、多人冲突均须后续实机门禁。

## 本轮实际捕获摘录

以下值来自 WorldEditTest 创建的实际原版标牌工厂与 saveWithFullMetadata，不是完整实机网络回执：

```json
{
  "target": "minecraft:oak_sign",
  "mode": "pure-jvm-factory-capture",
  "snbt": "{back_text:{color:\"black\",has_glowing_text:0b,messages:[\"\",\"\",\"\",\"\"]},components:{},front_text:{color:\"black\",has_glowing_text:1b,messages:[\"原始标牌\",\"\",\"\",\"\"]},id:\"minecraft:sign\",is_waxed:0b,x:0,y:0,z:0}",
  "revision": "4a4605aaf4b7a6c4c643755da0b045ff98943c4384130f93d04ff05df68d5157"
}
```


## 2026-11-07 最终构建补验

此前的“未跑 Gradle / 等用户关游戏”记录是历史状态。最终门禁已将 componentSchemaTest、entitySchemaTest/entitySchemaServerTest、tooltipTest、worldEditTest 接入正式 check，并运行完整 build。完整输出在 logs/final-gate/gradle-build.log；5个 node UI 测试分别在 node-{world,contract,compact,nbt,search}.log。无关的 Oriel-UI 实例不阻塞 Editor，也不修改或终止它们。真实客户端通道补验使用 tools/final-gate/launch.ps1，新复制世界、正常 runClient、实际猫刷怪蛋页面；最新状态以 logs/final-gate/client-receipt.json 为准。该探针仅证明本机真实页面的 schema/tooltip 请求链，不能代替远程服、多人冲突或完整世界目标 apply 验收。
