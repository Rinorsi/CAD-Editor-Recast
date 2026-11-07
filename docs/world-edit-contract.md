# 已放置方块实体与世界实体编辑协议（26.1.2）

实现入口：world/WorldEditor、WorldTarget、WorldNbt、WorldEditSessions、WorldWire；客户端 WorldEditorClient。2026-11-07。

## 入口及页面数据

- 默认 O 键：编辑准星目标；I 键仍编辑物品。
- 客户端命令 /cadeditor block、/cadeditor entity：读取准星目标。/cadeditor block x y z 支持绝对整数坐标，仍受服务器交互距离限制。
- 不解析相对坐标，不允许跨维度编辑，不提供移动目标操作。实体准星命中使用 UUID，网络实体 id 只是提示。
- 网络 open 也可只给实体 id；服务端马上解析为 UUID，后续会话必须使用返回的规范化 slot，防止 id 重用。
- 客户端与服务器都需要模组。没有服务器 request 通道时显示 UNAVAILABLE：服务器未安装物品工坊；不尝试原版创造物品包降级写世界。
- 同一 cadeditor:ui/index.html 页面，世界模式初始数据为 oriel.data.world（**没有 stack**）。UI 应以 world.kind 分支；未接入前界面不保证可用。
- apply / undo 页面消息由宿主在游戏线程转发。目标 slot 与 revision 绑定宿主上一次 opened/saved，页面不能换目标或伪造新基线。
- 保存成功 patch world 与 result；失败只 patch result，保留页面草稿。页面应显示服务端 reason。

## 沿用网络包和 envelope

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
{"status":"opened","requestId":"w1","world":{"kind":"block","type":"minecraft:chest","block":"minecraft:chest","block_state":{"facing":"north","type":"single","waterlogged":"false"},"slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0,"token":"服务端随机令牌"},"revision":"64位十六进制SHA256","snbt":"完整权威compound","nbt":{},"comps":{},"component_snbt":{},"container":{"size":27,"kind":"minecraft:chest","unresolved_loot":false,"slots":[{"slot":0,"stack":{"empty":true}}]},"views":{},"canUndo":false}}
```

以上是**形状示例**，不是捕获数据。真实默认值、组件、字段大小写一律来自原版保存方法/Codec，不能照抄示例为选项表。真实 JVM 工厂捕获见 logs/world-edit/captured.json（每种测试方块原样 SNBT、revision、helper；测试模式不是实机网络回执）。

world 字段：

|字段|含义|
|---|---|
|type|方块实体/实体注册表 ID；实体页面用它读取 entity_info / entity_schema，后端不复制该 schema|
|snbt|权威完整保存 compound。byte/short/long/float/double、B/I/L数组保留类型|
|nbt|用于只读展示的 JSON 投影；**不可将其 stringify 后当作 SNBT 写回**|
|revision|完整保存 NBT 的类型保真 SHA-256；compound 键排序，列表顺序和数值类型有意义|
|slot|服务端规范化目标，含随机 token；实体同时含 uuid 与 id|
|comps / component_snbt|方块 collectComponents 的实时 Codec 视图及权威类型旁路；只读 helper，不直接作为世界 apply 输入|
|container|运行时 Container 的 size / slots；另支持讲台书和营火实际 items 列表。空格明确为 stack:{empty:true}，非空与物品编辑 StackCodec.snapshot 格式一致|
|views|实际保存字段绑定：存在时导出 LootTable/LootTableSeed、lock/Lock、front_text/back_text、patterns、bees/Bees、Command/auto/conditionMet/powered，值为 {value,snbt}；不存在不杜撰。旗帜/蜂巢等也可能在 comps 中|
|views.spawner_info|现有 SpawnerData.entries，带两种刷怪笼的真实默认值和 Codec 信息|
|views.command_mode|原版命令块 mode；block_state 含 conditional 等状态。此版本不允许修改方块状态|
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

页面发送同形状 apply 消息时可不带 op / revision，宿主自动补充；slot 必须与打开目标一致。建议不组合 snbt 与 container；组合时先加载完整 SNBT，再覆盖列出的格，且未列格必须仍与现实目标一致。

撤销：页面消息 undo，内容 {requestId,slot}；网络 op:undo，宿主补 revision。成功返回 saved 与 world。每次 apply 存前像一次，下一次 apply 替换该前像；undo 成功后清空前像，没有 redo。关闭、断线、重开或服务端重启会丢弃撤销缓存。

服务器先创建同类型的未放置方块实体副本，用 TagValueInput / loadWithComponents 校验，刷怪笼追加 SpawnerData 校验；实体由真实 EntityType 工厂创建未加入世界的临时副本，用 load 校验。收集 ProblemReporter 错误，拒绝原版加载器忽略或改写的**已编辑**顶层字段。容器逐格使用 ItemStack Codec/strict 校验、数量和原容器 canPlaceItem 限制；讲台用实时 lectern_books 标签，营火用实际营火配方。输出格不接受替换时可清空，不能绕过槽位规则。未知模组的自定义副作用没有兼容保证。

全部校验和快照大小检查通过后，在服务器单线程加载现实目标；方块 setChanged + sendBlockUpdated + 比较器通知；实体通过原版 load 更新同步数据，设备同步仍走原版追踪。不 remove/replace 实体，不插入副本。实际写入抛异常时尝试恢复前像并记录回滚失败；这不是外部模组回调副作用的通用事务。

身份/移动字段锁定：方块 id/x/y/z/keepPacked；实体 id/UUID/Pos/Motion/Rotation/Dimension/Passengers/RootVehicle/Leash/leash/PortalCooldown/悬挂定位与睡眠定位字段。不提供 moveTo，不编辑玩家，禁止换方块实体类型。命令块 mode/conditional 属于 BlockState，当前只读；command/auto 可走 NBT（仍需原版管理员权限）。

## 权限、保护和冲突

- open 与 apply / undo 都要求存活非旁观，且通过同一 EditorPolicy（创造模式，或配置权限等级；creativeOnly 生效）。读世界 NBT 也不对无权限用户开放。
- 服务器强制当前维度、已加载区块、动态 block/entityInteractionRange、world border、player.mayInteract、level.mayInteract、mayBuild。不会给目标加载区块或传送玩家。
- 命令方块及 onlyOpCanSetNbt 实体追加 canUseGameMasterBlocks（原版创造+游戏管理员），普通创造权限不能借本编辑器改命令块。
- 修改标牌文本且结果包含可执行命令时，同样需要 canUseGameMasterBlocks；不能用普通创造权限写入可执行命令标牌。
- 第三方领地插件若仅在交互/破坏事件拦截、未集成上述原版检查，尚未提供兼容适配；不得宣称适配了所有保护插件。
- 每个玩家只保留一个世界会话；连接绑定，无编辑时长硬超时。打开/写入间隔至少 500ms，关闭不受限。
- 修改前，客户端基线必须同时匹配会话保存的 NBT 和目标当前 NBT；token 必须匹配。任意外部变化都拒绝，不自动重基线、不覆盖。炉子燃烧、刷怪笼计时、实体运动/AI都可能触发冲突；当前没有忽略动态字段或合并编辑策略。
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
|player_target|玩家目标被拒绝|
|protected_field|试图修改身份、位置、关联字段|
|target_changed|revision 已过期，草稿保留|
|session_lost|缓存/token/目标不匹配，须重新打开|
|invalid_nbt|SNBT/原版加载校验/被忽略编辑字段/未改格变化|
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
|命令方块|部分：command/auto等NBT可编辑，mode/conditional只读，不能替换BlockState|JVM加载保存；执行/调度行为待实机|
|刷怪笼|默认/字段helper、SNBT编辑及SpawnerData验证|JVM修改Delay往返|
|试炼刷怪笼|默认/配置helper、SNBT编辑及SpawnerData验证|JVM修改required_player_range往返；动态激活状态可能持续造成revision冲突|
|蜂巢|bees组件/保存字段helper、SNBT编辑|JVM含实际Occupant的保存加载|
|猪与其他生物|类型ID、设备helper、完整SNBT临时实体验证，variant路径由entity_schema提供|JVM猪实际variant、盔甲架装备及改名往返；其他生物未逐种验收|
|物品展示框|displayed_item helper、SNBT验证及写入路径|JVM含附魔物品的展示框改名，物品数据保持|
|画|通用实体路径及entity_schema，禁止变更悬挂定位字段|未做本轮画实体工厂/实机专项测试，标为partial|
|普通非方块实体方块、玩家、未加载/跨维度/远距离目标|不支持/明确拒绝|守卫单测，实际ServerPlayer集成测试待运行|

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
