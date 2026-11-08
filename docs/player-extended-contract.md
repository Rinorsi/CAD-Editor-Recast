# P4-1 玩家扩展协议

所有页面入口（物品页、世界/实体/玩家页、独立保险库窗口）必须经过 `EditorPageHost.open(page, data)`；自定义 `OrielScreen` 子类使用 `EditorPageHost.attachCommon(screen, data)`。
统一宿主负责 `hostClip` / `hostPrefs` 声明、clipboard / prefs 消息和 RegistryBridge；剪贴板仅在主线程且该屏幕仍为当前屏幕时写入，共享每秒 4 次、最多 32767 字符的只写策略。同屏 `open_world` 只 patch 数据，不重复接线。

## 存档玩家档案（2026-11-09）

本轮后端证据：[player-profiles-verification.md](player-profiles-verification.md)。

继续使用 player_extended 消息和 player_extended_result 回执；所有操作要求 EditorPolicy.requirePlayerEdit（拒绝 player_forbidden）。只读名单/导出遵守 500ms 间隔，不替换编辑会话基线。

### 名单

请求：{op:"player_extended",requestId,action:"read",view:"players",target?:{},offset?:0,limit?:32,query?:""}。target 可省略且不影响名单。响应：

    {"status":"opened","requestId":"list-1","playerExtended":{"target":{},"view":"players","revision":null,"value":{"entries":[{"uuid":"UUID","name":null,"online":false,"self":false,"owner":false,"last_played_ms":1794153600000}]},"schema":{"source":"PlayerList / playerdata / singleplayer owner / local profile cache","readOnly":true,"manualId":true},"offset":0,"total":1,"nextOffset":null}}

合并本存档在线玩家、playerdata 下合法 UUID 的 .dat 文件及单人所有者，按 UUID 去重和排序。query 对名字或 UUID 做不区分大小写子串匹配，再分页；limit 1..64。名字只从在线 profile、单人 owner profile 或服务器 UUID 本地缓存读取，不发网络请求；缺失返回 JSON null。self 表示请求者，owner 只表示单人所有者；在线 last_played_ms 为 null，其他为存档文件修改时间（owner 使用 level.dat；文件缺失则 null）。损坏文件在打开时报告错误。players 不接受 apply。

### 离线摘要

offline.value 保留 snbt，新增 summary：

    {"snbt":"{...}","summary":{"name":null,"game_mode":"survival","health":20,"food":20,"xp_level":0,"dimension":"minecraft:overworld","x":0.5,"y":64,"z":0.5,"selected_slot":0,"inventory_count":0,"ender_count":0,"equipment":{"head":null,"chest":null,"legs":null,"feet":null,"offhand":null}}}

摘要由原版加载后的临时 ServerPlayer 读取；inventory_count 是主背包/快捷栏非空槽数（不含装备和副手），ender_count 是末影箱非空槽数。装备为物品注册 ID 或 JSON null。name 遵循名单缓存规则。patch 仍仅 {snbt}，不能回传 summary；原子写入、备份和 owner 离线编辑拒绝不变。

### 导出预设

请求：{op:"player_extended",requestId,action:"export_preset",target:{uuid,offline?:false},sections?:["inventory","equipment","ender","attributes","effects","game_mode"]}；不需要 view/revision/patch。sections 缺省全部，显式值须为六分区的非空、不重复子集。响应：{status:"exported",requestId,template:{sections:{...}},summary:{...}}；summary 同上。失败仍为 {status:"rejected",requestId,code,reason}。

template 与 [vault-contract.md](vault-contract.md) 的 player_preset 完全相同，可用 {op:"save",kind:"player_preset",template,...} 保存：inventory/equipment/ender 为 {slots:[{slot,stack}]}，stack 含完整 component_snbt；attributes、effects 为原投影数组，game_mode 为原版模式名。分区复用 VaultTemplates，物品/属性/效果由原版实时注册表与 Codec 生成。

在线目标必须在线；offline:true 必须不在线，先经原版加载再导出。单人 owner 的离线导出允许只读原版选择的存档，但仍不能离线编辑。已核实 26.1.2 / 26.2 / 26.3 的 PlayerList.loadPlayerData 按 WorldData.getSinglePlayerUUID 选择 playerdata 文件；导出沿用这个 UUID 选择规则，不把遗留 level.dat Player 当作当前权威数据。不登录临时玩家、不注册实体、不写玩家/统计/成就文件、不留下缓存条目。超出原有传输预算报 payload_too_large，可减少 sections 后重试，不截断模板。读取失败沿用 offline_missing / offline_io / invalid_nbt；无效分区返回 invalid_request（预设分区无效或重复）。

本协议独立于原有 entity.player apply；已有背包/状态页不变。消息走 EditorPackets/WorldWire，服务端线程执行。页面向宿主发送 player_extended，宿主回传 player_extended_result；每笔带 requestId，只在 saved 后清草稿，拒绝/超时保留。

## 请求、响应和会话

    {"op":"player_extended","requestId":"p-1","action":"read","target":{"uuid":"UUID","offline":false},"view":"position","offset":0,"limit":32,"query":""}
    {"status":"opened","requestId":"p-1","playerExtended":{"target":{"uuid":"UUID","offline":false},"view":"position","revision":"opaque","value":{},"schema":{},"offset":0,"total":1,"nextOffset":null}}
    {"op":"player_extended","requestId":"p-2","action":"apply","target":{"uuid":"UUID","offline":false},"view":"position","revision":"opaque","patch":{}}

成功写回同 opened 结构，但 status=saved，revision 更新。失败为 {status:'rejected',requestId,code,reason}。target.uuid 可省略（自己）；offline 默认 false。view 为 position / respawn / recipes / advancements / stats / offline。离线必须显式 uuid、offline:true、view:offline。所有读写均要求 EditorPolicy + 实时 COMMANDS_GAMEMASTER；成就额外仅允许自己的在线数据。

read 建立目标/视图基线，apply 携带最近 read/saved revision。服务端重新读取完整视图，分页不缩小校验范围。位置/重生点和离线文件要求完整基线一致；配方/成就/统计按被改字段三方合并，未改条目及持续增长的游玩时间等计数保留当前值，只有同字段不同修改才拒绝。一次只写一种视图；不提供扩展操作 undo。断开清理会话。每人 read/apply 间隔 500ms；limit 1..64 默认32，query 按 ID 子串过滤。服务端可缩小页面，按 nextOffset 续读。所有选择器须支持手输 ID；手输仍须服务端实时校验。

## 位置、重生点

position.value 和 patch 均为完整 {dimension:'minecraft:overworld',x:0.5,y:64,z:0.5,yaw:0,pitch:0}。schema={source:'MinecraftServer.getAllLevels',dimensions:['...'],manualId:true}。维度取实际 Level 列表；坐标角度有限，pitch -90..90，须在原版边界/高度内。先加载目标区块，再原版 teleportTo。跨维度后以 UUID 定位。

respawn.value 为 null 或 {dimension,x,y,z,yaw,forced}，xyz 为整数；patch 同形，清除提交 null。schema 同位置。使用原版 RespawnConfig / setRespawnPosition；forced=false 仍由原版重生时检查床/锚。

## 配方

recipes.value={entries:[{id:'minecraft:...',unlocked:false,highlighted:false}]}，实时 RecipeManager 全部候选按 ID 排序，包含未解锁项，分页。schema={source:'RecipeManager / ServerRecipeBook',manualId:true}。patch={entries:[{id,unlocked,highlighted}]}，最多64项，ID不重复；highlighted=true 要求 unlocked=true。只改列出的配方，用 ServerRecipeBook 并同步原版配方书。

## 成就

advancements.value={entries:[{id:'minecraft:...',done:false,criteria:[{name:'...',done:false}]}]}，来自 ServerAdvancementManager / PlayerAdvancements。schema={source:'ServerAdvancementManager / PlayerAdvancements',manualId:true,selfOnly:true}。patch={entries:[{id,criteria:[{name,done}]}]}，最多64项，只改列出的条件，条件名来自实时定义。原版 award/revoke 可能触发奖励、公告或后续成就，不可撤销。

成就显示元数据补充：每个 advancements entry 有 has_display:boolean，严格表示定义是否有 DisplayInfo（不判断玩家已解锁或原版隐藏条件）。有 DisplayInfo 时，标题/描述组件直接 contents 为 TranslatableContents，则分别提供 title_key / description_key；否则提供组件 getString() 的 title / description。无显示信息时省略对应字段；同一字段不同时返回 key 和字面值。客户端可用 registry.translate 查询当前语言，服务端不解析为服务器语言。

advancements 的 read / apply 请求可选 displayed:true，仅返回 has_display=true 的条目；默认或 false 保留全部条目，包括 minecraft:recipes/... 内部成就。仅 advancements 支持此字段，且必须为布尔值。它与 query 叠加，在 offset / limit 分页前执行，total 和 nextOffset 都基于过滤后的结果。只影响回执投影，完整会话基线和写入条件校验保持原行为。

## 统计

stats.value={entries:[{type:'minecraft:custom',id:'minecraft:jump',value:0}]}，遍历 BuiltInRegistries.STAT_TYPE 及 StatType.getRegistry，包括未发生的统计。schema={source:'BuiltInRegistries.STAT_TYPE / StatType.getRegistry',manualId:true,min:0,max:2147483647}。query 匹配 type 或 id。patch={entries:[{type,id,value}]}，最多64项，type/id 不重复，value 非负整数。用 ServerStatsCounter.setValue/sendStats，不直接改文件。

## 离线玩家

目标为实际 playerdata/<uuid>.dat，不创建新玩家；UUID 手输，不接受路径。offline.value={snbt:'可编辑字段的类型保真 Compound SNBT'}，schema={source:'vanilla player load/save',editableKeys:['运行时实际存在的受支持键'],backupRetention:5}。patch={snbt:'完整可编辑字段复合'}。支持背包、末影箱、生命、饥饿、经验字段；身份、位置、骑乘、连接、成就和独立统计文件不通过此入口。未暴露/未知原始字段保持原 NBT 值。

先用原版 DataFixer、临时 Player.load/save（避免污染 ServerPlayer 的统计/成就缓存） 验证每个被改字段，再写临时压缩 NBT 并读回校验。写前重查目标不在线、文件指纹未变，备份原文件到 playerdata/cadeditor-backups/<uuid>/（保留最近5份），同目录 ATOMIC_MOVE 替换，不支持则拒绝、不退化覆盖。单人 owner 由原版单人存档身份管理，保留离线编辑拒绝；其他单人访客和专服离线玩家可用。owner 原版文件选择规则见上方档案导出说明。审计记录操作者/目标 UUID、操作、前后指纹、结果，不记录物品内容。

## 错误码

| code | 中文原因 / 处理 |
|---|---|
| player_forbidden | 编辑玩家需要游戏管理员权限 |
| advancement_self_only | 成就只能修改自己的数据 |
| player_offline | 目标玩家不在线或不存在 |
| player_online | 目标玩家已上线，请重新打开在线玩家 |
| offline_owner_unsupported | 单人世界所有者数据由 level.dat 管理，请进入世界后在线编辑 |
| offline_missing | 没有找到此 UUID 的玩家存档 |
| offline_io | 无法读取、备份或原子替换玩家文件，保留草稿 |
| invalid_nbt | 原版加载或序列化校验失败，未落盘 |
| unknown_dimension / unknown_recipe / unknown_advancement / unknown_stat | ID 不在当前实时数据中 |
| chunk_unavailable | 无法加载传送目标区块 |
| teleport_failed | 原版拒绝此次传送 |
| protected_area | 目标超出世界边界或建造高度 |
| session_lost / target_changed | 会话失效/数据变化，保留草稿后重新读取 |
| rate_limited / payload_too_large / invalid_request / protected_field | 请求太快/过大/格式错误/禁止字段 |
| request_timeout | 结果未知，先重新读取，不盲目重试 |
| write_uncertain | 原版回调或写后回执异常，操作可能已生效；保留草稿并重新读取，禁止自动重试 |

示例不是实机证据；验收记录在实现完成后追加。


跨维度传送成功后，扩展视图继续按 UUID 工作。原有背包/状态世界编辑会话仍绑定打开时维度；页面应提示关闭重开后再提交原有页草稿，不应将旧世界会话静默切到新基线。

页面注意：同一视图的 read 会更新宿主持有的基线；有未保存草稿时不要自动轮询 read 或以翻页请求悄悄刷新基线。显式重新读取应先让用户保留/放弃草稿。所有扩展请求由宿主串行发送，并遵守 500ms 服务端间隔。

验收与证据：[player-extended-verification.md](player-extended-verification.md)。

宿主将页面消息排入最多 4 笔等待队列，一次发送 1 笔，回执后间隔至少 550ms；排队与在途合计超时 10 秒。它不会自动重试写操作。apply 的页面 revision 若与 Java 持有值不符会拒绝，不会因排队中的 read 换过基线而静默提交旧草稿。较长离线 SNBT 仍可使用既有 gzip 传输，展开和压缩大小上限不变。
