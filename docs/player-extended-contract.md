# P4-1 玩家扩展协议

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

先用原版 DataFixer、临时 Player.load/save（避免污染 ServerPlayer 的统计/成就缓存） 验证每个被改字段，再写临时压缩 NBT 并读回校验。写前重查目标不在线、文件指纹未变，备份原文件到 playerdata/cadeditor-backups/<uuid>/（保留最近5份），同目录 ATOMIC_MOVE 替换，不支持则拒绝、不退化覆盖。单人 owner 的 level.dat Player 优先于 playerdata，因此拒绝其离线编辑，避免旧内嵌数据覆盖；其他单人访客和专服离线玩家可用。审计记录操作者/目标 UUID、操作、前后指纹、结果，不记录物品内容。

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
