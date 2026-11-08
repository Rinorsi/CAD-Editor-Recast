# 权限审计（26.1.2 / 2026-11-08）

服务端权威权限为 ServerPlayer.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)，每笔写入重新检查。管理员不受创造、生存、冒险、旁观影响；非管理员保留既有创造写回，其它模式拒绝。旧配置 permissionLevel / creativeOnly 继续读取兼容旧文件，但不再覆盖该规则。

| 功能 | 旧条件 | 新条件 | 文件:方法（行号供定位） |
|---|---|---|---|
| 共享物品权限 | 创造，或配置权限满足且creativeOnly=false | 创造或实时gamemaster；creativeOnly=true也不能拒绝管理员 | EditorPolicy.java:28 require/gameMaster/allows |
| I / /cade 打开物品 | 玩家/世界存在，目标非空；没有创造门槛 | 不变；真正写入时检查权限 | client/EditorClient.java:open；EditorMod.java:handle(open)/target |
| 主手/快捷栏/背包apply | 创造背包总是commit→原版创造包，其它受旧policy限制 | gamemaster所有模式服务端baseline/slot检查后setItem并同步；无权限创造保留旧commit | EditorMod.java:103 handle；client/EditorClient.java:apply/receive |
| 容器物品apply | 旧policy + menuId/距离/mayPickup/mayPlace/容量 | gamemaster不要求创造；独立槽位/访问安全检查仍保留 | EditorMod.java:target/handle |
| 非创造、无服务端模组 | 本地拒绝，仅创造可写 | not_connected，明确“服务器没有安装物品工坊，生存模式不能写回”；冒险/旁观同样不可用 | client/EditorClient.java:206 apply |
| 创造、无服务端模组 | 原物品比较后发ServerboundSetCreativeModeSlotPacket | 保留，不能当作生存/OP通用写回接口 | client/EditorClient.java:216 apply |
| 旧创造两阶段确认 | confirm/commit要求仍创造且baseline/slot吻合 | 只属于无管理员权限的旧创造路径；管理员直接saved无需此分支 | EditorMod.java:86 handle(confirm)；client/EditorClient.java:255 receive(commit) |
| saved后客户端同步 | 创造收到确认后setItem，非创造靠原版同步 | 保留；服务端追加明确背包槽包，生存不靠本地预测 | client/EditorClient.java:277 receive；EditorMod.java:handle |
| 保险库give：创造 | 发创造包但不更新客户端，造成服务端有、创造界面仍为空 | 始终客户端创造路径：空槽检查→原版包→更新自己客户端背包，立刻可见；无论有无OP | registry/VaultChannel.java:give；vault/InventoryWrites.java:givePath |
| 保险库give：非创造 | 全部NOT_ALLOWED | 有模组并实时gamemaster→服务端严格Codec解码→空槽插入→完整同步；无权限permission_denied | registry/VaultChannel.java:give/receive；vault/VaultGiveServer.java:give |
| give重复点击/重放 | 只有空槽保留，无请求幂等 | 同条目等待时拒绝并行；page ID回放本机回执；服务端内部ID只成功写一次，复用不同载荷拒绝；超时不自动重发 | registry/VaultChannel.java:reply/tick；vault/GiveReceipts.java:execute |
| 保险库save/update/delete/restore | save需世界严格校验；其它本机存储不要求OP/创造 | 不变；restore恢复库条目，不是往背包发放 | registry/VaultChannel.java:reply；vault/VaultStore.java:execute |
| 物品页面撤销/草稿 | 页面生成旧栈重新apply，无独立绕过路径 | 仍沿用相同权限、baseline、槽位、频率校验 | client/EditorClient.java:apply；EditorSessions.java:apply/requireBaseline |
| /cadeditor testkit | creative或LEVEL_GAMEMASTERS，再policy.require | 命令本身模式矩阵已符合；policy更新后管理员不受creativeOnly限制 | TestKitCommand.java:31 allowed/run |
| abilities.instabuild / playerGameType | 玩家数据值，不是通道权限 | 不改变；授权只能来自PermissionSet | world/PlayerWorldEdit.java:37/64/81/96 |
| 世界编辑/undo | WorldEditor每次policy，玩家目标额外gamemaster；undo需版本校验 | 每次重查gamemaster/距离/保护及基线；有权限者改自己为旁观或mayBuild=false后仍能undo | world/WorldEditor.java:route；world/PlayerWorldEdit.java:requirePermission |
| 世界特殊方块/实体/命令标牌 | canUseGameMasterBlocks隐含创造+OP | 应为EditorPolicy.gameMaster；世界worker已在当前树改用该判断，本任务未触碰 | 初始审计 world/WorldTarget.java:46/61/142；world/EntityRiding.java:43 |
| 世界玩家状态/区域门禁（额外审计） | !isAlive或isSpectator、mayBuild可能仍按模式挡管理员 | 已落实：gamemaster允许旁观/冒险/mayBuild=false；非管理员原守卫不变。存活/距离/区块/边界/player.mayInteract/level.mayInteract保留；原版出生点保护按真实OP豁免，不新增区域绕过 | world/WorldTarget.java:34 resolve、约64行area；world/EntityRiding.java:guardTree若有同类门禁 |

服务端物品请求及give每玩家20次/秒，最多32767字符并校验JSON深度。原版创造包仍由原版服务器校验创造资格。拒绝不会偷偷改用另一写法。

证据：logs/permission/PermissionTest.log为纯JVM真实Codec/脱离客户端的容器；logs/permission/captured-server.json为隔离专用服务端、真实ServerLevel/ServerPlayer（脱离实际网络登录，RecordingListener记录发包）。它们不等于客户端画面验收。用户游戏运行中，没有触碰其进程或鼠标键盘；创造界面可见性、真实客户端收到完整同步未实机验证。

## P4-6 保险库模板

| 操作 | 权限与目标检查 | 写入路径 |
|---|---|---|
| 本机 block/player_preset save/preview | 无远程写入；preview 不等于服务端成功 | VaultStore / VaultTemplates |
| 方块预设 apply | WorldTarget 可达/区块/区域检查 + 每次 EditorPolicy.require；相同 block 注册 ID；会话 revision 与基线合并；命令内容仍检查管理员 | WorldEditor → VaultTemplateApply → WorldMergePlan → 原方块写入/undo |
| 在线玩家预设 apply | 上述检查 + PlayerWorldEdit.requirePermission（gamemaster）+ 在线身份；只允许预设选中的分区 | 原 PlayerWorldEdit.prepare/write，不使用 Entity.load |

套用没有新增绕过权限的包；vault_template 只是现有世界 apply 的规范化输入。拒绝类型不匹配、权限撤销或离线时不会写入目标。

## P4-1 玩家扩展（2026-11-08）

2026-11-09 档案只读入口：players 名单、offline.summary、export_preset 在线/离线导出均在 PlayerExtendedEditor.route 先执行 EditorPolicy.requirePlayerEdit；缺少 gamemaster 返回 player_forbidden。导出不执行服务端写入、不记录写审计、不刷新编辑基线。离线必须当前不在线；owner 仅允许导出，编辑依旧拒绝。本机保险库 has_backup 不写世界、不要求管理员，与本机 list/get 相同；物品规范化仍要求当前世界 Codec，失败不算命中。

| 写操作 | 服务端权限与额外条件 | 路径 |
|---|---|---|
| player_extended position | EditorPolicy.requirePlayerEdit，每笔重查 COMMANDS_GAMEMASTER；实时维度、边界/高度、目标区块加载 | PlayerExtendedEditor.route/prepare |
| player_extended respawn / clear | 同上；实时维度与坐标校验；setRespawnPosition | PlayerExtendedEditor.route/prepare |
| player_extended recipes | 同上；实时 RecipeManager ID、整批校验；ServerRecipeBook 同步 | PlayerExtendedEditor.route/prepare |
| player_extended advancements | 同上，且目标 UUID 必须等于请求者；条件来自实时成就定义 | PlayerExtendedEditor.route/prepare |
| player_extended stats | 同上；实时 StatType 及其 registry，非负整数 | PlayerExtendedEditor.route/prepare |
| player_extended offline | 同上；目标不在线，单人 owner 拒绝；受限字段、原版加载/保存校验、文件指纹、备份、原子替换；落盘前再次查在线状态 | OfflinePlayerEdit.read/prepare/replace |

扩展 read 同样需要 requirePlayerEdit，不允许通过只读接口泄露其他玩家数据。扩展目标为明确 UUID 的管理员操作，不使用准星距离门槛；不赋予非管理员任何跨维度/远程编辑能力。成就不可代改其他玩家。所有写操作保留请求者/目标/前后指纹审计；只支持当前视图独立提交，无 undo。
