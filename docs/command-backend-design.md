# 命令后端设计（Minecraft Java 26.1.2）

状态：只读调研与实施设计；尚未实现、编译或实机验收。调研针对当前工作树（其中已有其他工作的未提交修改），不是某个历史提交。本次只写本文及 `logs/command-backend/` 核验产物，没有运行 Gradle、Minecraft、验收脚本或操作 Java 进程。

## 1. 产品边界与待用户拍板的选项

物品工坊是**客户端必装（使用编辑器的人）、服务端选装**的可视化编辑器。无服务端模组时，把玩家本来有权限执行的原版命令转成统一页面操作；不赋予额外权限。普通未安装客户端的玩家仍应可以正常游玩，具体网络兼容核查见第 9 节。

下列四项仍在讨论，**不是既定决策**。本文后续的实施方案是建议，遇到这些取舍均受最终选择约束，不能据此默认开启功能。

| 取舍 | 可选方案与利弊 | 建议倾向（待拍板） |
|---|---|---|
| (a) 无服务端模组时怎样启用 | 自动启用：最顺畅，但用户可能误以为有服务端会话保障；首次使用让用户选择：能说明差异，增加一次交互；默认关闭、手动开启：最保守，但可发现性差。 | 倾向首次使用时说明后选择，并记住每服务器偏好；不是已决定自动启用。 |
| (b) 服务器兼容范围 | 只支持原版服务端：反馈结构可控、验收边界清楚，但排除常见插件服；尽力支持Paper/Spigot：覆盖更多用户，但反馈、权限、限流差异使维护和误判风险增加。 | 倾向首版只承诺原版，插件服后续作为显式实验选项；若选择尽力支持，反馈改写时降级只读并提示。 |
| (c) 无法回读或可靠撤销的操作 | 禁止：不会让用户提交无法确认/恢复的修改，但give、部分玩家专项等受限；允许但标注并写前确认：可用范围更广，但需承担结果未知和不可逆副作用。 | 倾向首版禁止；后续逐项证实语义后允许确认执行。允许也不意味着放开未知字段、残缺NBT或未知槽位映射。 |
| (d) 非OP创造写自己物品例外 | 保留：与现有行为和原版创造能力一致，但需要单独声明创造包策略；移除：权限文案更单一，但属于现有功能收缩，不能称为原版服务器要求。 | 倾向保留。是否保留仍待用户拍板；本次不改变现有已审计服务端权限规则。若选择移除，需另行明确影响范围并审计，不能在后端适配时偷偷改变。 |

不受上述启用选项影响的架构约束：打开页面时，有 `EditorPackets.Request` 通道就绑定 `ServerModBackend`，没有则只允许绑定 `CommandBackend`；启用偏好只决定无通道会话是否具备可执行能力，不能改变为另一后端。同一会话绝不混用、绝不中途回退；服务端后端失败绝不尝试命令。断线结束会话，重新打开才能重新选择。

建议命令模式提示：**「服务器没有安装物品工坊，通过命令修改（无法撤销到服务端会话）」**。顶部和相关页签由统一capabilities/presentation显示。可撤销操作另显示「本次连接内客户端快照撤销」，避免误解为所有操作都无法撤销。无论选择哪种启用方案，已发出的写入无可靠结果时都必须报告结果未知。

若选择保留创造例外，它是固定后端内预先声明的 `creative_inventory` 能力，使用原版创造包；不是命令失败后的回退，也不是第三种后端。无模组时打开阶段按目标与创造资格固定该操作通道；资格变化后拒绝并要求重开。有服务端模组时原有commit/confirm流程不变。证据S1、S2、J8。

技术上不能提供服务端会话级原子合并、跨命令事务、可靠持久撤销、任意玩家 NBT 写入。因此 capabilities 必须表达能力边界，而不能只提供一个 `canEdit=true`。

## 2. 证据索引与核验方法

本文的「可行」表示原版接口机制支持，**不表示完成联网实测**。矩阵每行引用以下证据；「设计」表示拟实现策略；「未验证」明确表示尚未得到目标版本运行行为证据。通用字节码路径成立不等于每个具体子类字段已验证。

### 2.1 已实际执行的 javap

直接读取 `<GRADLE_USER_HOME>/caches/fabric-loom/26.1.2/minecraft-merged.jar`，执行 `javap -p -c -classpath <jar> <类名>`。工具版本与 jar SHA256 见 `provenance.txt`（本地记录）。javap 使用本机 JDK 21 工具读取类文件，未加载或运行游戏。输出以类名保存在 `logs/command-backend`（本地记录），汇总为 `core.javap.txt`、`extra.javap.txt`；错误文件供复核，不把找不到的类当证据。额外类分别核验。

| 编号 | 已核验类.方法与关键字节码事实 |
|---|---|
| J1 | `EntityDataAccessor.getData` → `NbtPredicate.getEntityTagToCompare`，保存实体数据，玩家还提供 SelectedItem 比较投影。`setData` 首先 `instanceof Player` 抛 `commands.data.entity.invalid`；非玩家调用 `Entity.load`，随后恢复写前 UUID。`Entity.load` 读取 Pos/Motion/Rotation/UUID；不是只允许改名称的接口。 |
| J2 | `BlockDataAccessor.getData/setData` 保存带元数据的 BE，`loadWithComponents`、`setChanged`、方块更新；没有逐字段白名单。`DataCommands.mergeData/removeData/manipulateData` 先取完整当前 NBT、改副本、再 `setData`。`CompoundTag.merge` 仅当双方值都是 compound 才递归，其余值 copy/put，故列表和数组整体替换。 |
| J3 | `EntityDataAccessor.getPrintSuccess(Tag)` 生成 `commands.data.entity.query`，参数 `[displayName Component, NbtUtils.toPrettyComponent(tag)]`；block 为 `commands.data.block.query`，参数 `[x,y,z,pretty Component]`。带 scale 的 numeric overload 为 `commands.data.entity.get` / `commands.data.block.get`，不能用来还原原始类型。 |
| J4 | `NbtUtils.toPrettyComponent` 创建 `TextComponentTagVisitor("")`；已另解析 class 常量池确认空字符串，见 `pretty-indent.txt`。`visitString` 使用 `StringTag.quoteAndEscape`；Token 含 `b/s/L/f/d`、`[B;`/`[I;`/`[L;` 与折叠文本 `<...>`。list/compound 深度 >=64 折叠；数值数组最多打印128元素。普通 list 的不换行分支遍历全长，不能声称所有 list 都128截断；compound 分支遍历键，深度仍有限制。 |
| J5 | `ServerboundChatCommandPacket` 构造/写调用无参数 `FriendlyByteBuf.readUtf/writeUtf`，后者默认32767。`Utf8String.read/write` 同时检查编码字节预算与 Java 字符长度。`ClientPacketListener.sendCommand` 按 `SignableCommand` 是否有可签名参数选择普通/签名命令包；此类**没有 sendUnsignedCommand**，另有 `sendUnattendedCommand(String,Screen)`，后者对解析、权限、签名问题打开确认窗。 |
| J6 | `ServerGamePacketListenerImpl.lambda$handleChatCommand$0` 和 signed 对应 lambda 执行命令后都 `detectRateSpam`；构造 `TickThrottler(20,200)`，每服务器 tick 减1，计数 >=200 为超限；`detectRateSpam` 对 `PlayerList.isOp` 和单人房主豁免踢出，其他触发 `disconnect.spam`。 |
| J7 | `GameRules` 注册字符串 `send_command_feedback`。`ServerPlayer$3.acceptsSuccess` 读取该规则，`acceptsFailure` 返回 true；`CommandSourceStack.sendSuccess` 检查 acceptsSuccess/silent，`sendFailure` 有独立路径。故关闭成功反馈不代表命令不执行，错误仍可能回来。 |
| J8 | `LocalPlayer.permissions()` 返回 `PermissionSet`；`setPermissions` 使用 `Permissions.COMMANDS_GAMEMASTER`；handleEntityEvent 更新 level-based 权限。不是旧版 `hasPermissions(int)`。`ServerGamePacketListenerImpl.handleSetCreativeModeSlot` 检查真实玩家创造资格。 |
| J9 | `ItemCommands.register` 只有 replace/modify 分支，没有 item get。`setEntityItem` 使用 `Entity.getSlot` / SlotAccess.set；方块使用 Container.setItem。`Player.getSlot` 将200开始的范围映射到 EnderChestContainer；`SlotRanges` 注册 `enderchest.`（200起）、`hotbar.`、`inventory.`、`container.`。 |
| J10 | `ItemParser$State.readComponents` 遇字符33（!）调用 `visitRemovedComponent`；`=` 分支按组件 codec 解析。`ItemInput.createItemStack` 使用 DataComponentPatch，不能把补丁的删除项丢掉。 |
| J11 | `SetBlockCommand.setBlock` 的 replace 调用 BlockInput.place；`BlockInput.place` 先 setBlock，若提供 tag 则直接 loadWithComponents(tag)，并非与旧 BE NBT 合并。26.1.2 此实现没有旧版本常见的无条件 Clearable.tryClear 调用；不能宣称 replace 一定清空，也不能保证总保留。 |
| J12 | `EntitySelector.findEntities/findPlayers` 名字通过在线 PlayerList、UUID 通过在线/已加载实体查找；`EntityArgument` 的 entity/players 参数及单目标校验。没有通过这些命令编辑离线 playerdata 文件的路径。 |
| J13 | `TeleportCommand` 注册 teleport/tp 并执行传送；`SetSpawnCommand.setSpawn` 建立 RespawnConfig(..., true)，使用当前命令维度与 rotation（yaw/pitch）；无清除重生点分支。`GameModeCommand.setMode` 设置游戏模式。 |
| J14 | `AttributeCommand.register` 有 get/base set/modifier 操作；`EffectCommands.register` give/clear；`ExperienceCommand.register` query/set/add points/levels。它们不是任意 player NBT 写入接口。 |
| J15 | `AdvancementCommands.register` grant/revoke，only 可带 criterion；`RecipeCommand.register` give/take。`ServerPlayer.addAdditionalSaveData` 保存 recipeBook 和 respawn，成就、统计管理器是独立字段，未输出到此实体 NBT。对自身成就/统计的原版客户端同步能覆盖多少，**未验证**。 |
| J16 | `GiveCommand.giveItem` 插入背包并处理剩余掉落；不是指定槽替换，也没有原版事务收据/幂等键。`RideCommand.register/mount/dismount` 是关系操作。`Entity.load` 不重建 Passengers 实体树；`Leashable.readLeashData/writeLeashData` 使用小写 `leash` 与 codec，后续关系解析不是简单字段等价。 |
| J17 | Fabric API 0.155.3+26.1.2 内含 message-api 7.0.5+dae8ce3e4c，已核对嵌套 jar 名并 javap：`ClientReceiveMessageEvents.GAME` 与 `Game.onReceiveGameMessage(Component,boolean)`。NeoForge 26.1.2.126 的 `ClientChatReceivedEvent.System` 继承消息事件，`getMessage()`、`isOverlay()` 可用；源文件与 javap 已留存。取消顺序/其他模组干预的联网行为未验证。 |

### 2.2 已读仓库源码

- S1：`EditorPolicy.require/gameMaster/requirePlayerEdit/allows`；`EditorMod.handle/target`。gamemaster 由服务端 PermissionSet 决定；创造例外、槽位/容量检查、commit/confirm；`EditorPackets` request/reply 是32767字符 JSON codec，此上限与命令包不是同一协议。
- S2：`EditorClient.open/apply/receive` 缓存 `connected=canSend`；无通道只本地读物品、创造包写；`WorldEditorClient.open/openFromPage` 和 `PlayerExtendedClient` 无通道拒绝；`VaultChannel.give` 非创造依赖服务端。`WorldEditorClient.show/apply/receive` 通过 Oriel `onMessage`、`patch("world")`、`patch("result")`，先登记 pending 再发送。
- S3：[world-merge-contract.md](world-merge-contract.md)、[world-revision-contract.md](world-revision-contract.md)、[permission-matrix.md](permission-matrix.md)。世界三方合并、稳定键列表、target_changed/conflicts/stale、服务端不透明 revision 与权限规则是迁移基准，不能声称客户端 revision 具备相同认证能力。
- S4：`BlockViews.fields/add/apply`、`EntityViewsVehicle.views/apply/verify`、`EntityViewsHorse.views/apply/verify`、`EntityViewsVillager.views`、`PlayerExtendedEditor.route/read/prepare`。新视图同时包含保存字段与运行时只读字段；不能整页照搬为 NBT 可写。当前 Stonecutter 工作树活跃源码含26.3分支，例如炉子/酿造计时类型；26.1.2 应用分支和实际 jar 为准。
- S5：`ClientPlatform` 当前提供 keys/commands/tick/lifecycle/disconnect/reload、canSend/send/receive，无游戏消息回调。两端实现分别使用 ClientPlayNetworking.canSend 和 connection.hasChannel。
- S6：`FabricEditor.onInitialize` 注册双向 play payload；`FabricPlatform.receive/send`；`NeoForgeEditor` 使用 `e.registrar("1").optional()` 注册 playToClient/playToServer；`NeoForgeClientPlatform.initialize` 注册客户端接收。两个 metadata 与依赖核查见第9节。

## 3. 逐功能可行性矩阵

记号：**可**=可行；**部**=部分可行，括号说明缺口；**否**=不可行。四项独立判断。所有「可」共同前提：在线、目标已加载、原版命令权限足够、结构反馈可用、值可完整解析且命令长度合规。矩阵描述技术可行性，不代表产品已选择启用；(a)—(d)选项会进一步收窄发布能力。撤销栏的「可」只表示可用逆命令恢复已编辑值，不包含外部世界副作用、时间倒流或服务器原子保证。未知字段持久化、插件反馈和真实网络仍须验收。

### 3.1 物品与保险库（5行）

| 功能 | 读 | 写 | 回读校验 | 撤销 | 命令与依据 |
|---|---|---|---|---|---|
| 自己主手 | 可 | 可 | 可 | 可 | data get entity @s SelectedItem/Inventory；item replace entity @s hotbar.N with …。固定打开时背包槽而不是提交时 weapon.mainhand；J1/J9/J10，S2。 |
| 自己快捷栏 | 可 | 可 | 可 | 可 | Inventory 对应 hotbar.0..8；J9，写前读槽位。 |
| 自己普通背包槽 | 可 | 可 | 可 | 可 | Inventory 对应 inventory.0..26（底层背包索引9..35）；原版槽位映射 J9，禁止把 menu 索引直接当命令槽。 |
| 容器方块槽位 | 部（需方块身份/槽映射） | 部（仅已映射 Container） | 部（双箱两端、未生成战利品） | 部（槽值可逆，物品转移不可逆） | data get block … Items；item replace block … container.N；J2/J9，S4。普通箱子单半、漏斗等可做，双箱必须映射到两个 BE。 |
| 保险库「给我」 | 可（本机模板） | 可 | 部（give 合并/掉落难关联） | 部（指定空槽可逆，give 不可靠） | give @s item[components] count 或显式确认的空槽 item replace；J10/J16、VaultChannel.give。优先固定空槽并前读是建议；若最终禁止不可可靠撤销的操作，则give变体禁用。满背包不自动改用give。 |

### 3.2 方块与特殊方块视图（18行）

| 功能 | 读 | 写 | 回读校验 | 撤销 | 边界与依据 |
|---|---|---|---|---|---|
| 方块状态（含无 BE） | 部（客户端已同步状态；data 无状态查询） | 部（setblock 状态替换） | 部（区块同步或 execute if block 候选验证） | 部（邻居更新不可逆） | J2/J11；保留未改属性须从写前状态组装。execute 条件式回读模板未实测，首版先禁高风险状态。 |
| 通用 BE NBT | 可 | 部（loader会规范化/忽略未知值） | 可 | 部（只恢复保留字段） | J2；data modify/remove，不是全 NBT 随意保存。 |
| 容器整体/双箱 | 部（两半快照非原子） | 部（逐槽/两半非原子） | 部（自动输送并发） | 部（仅仍在原槽的改值） | J2/J9；Items merge 整表替换，禁止单槽编辑时写整个 Items。 |
| 告示牌 | 可 | 部（front/back_text、wax；执行副作用） | 可 | 部（文本可逆、点击执行不可逆） | J2；S4 SignText.CODEC。精确字段持久化/过滤行为未验证，阶段3开放。 |
| 命令方块 | 可 | 部（NBT可写，执行与服务器配置另受限） | 可 | 部（Command可恢复，已执行命令不可逆） | J2、S4 command_block；enable-command-block 的具体运行影响本次未实测。 |
| 刷怪笼 | 可 | 部（配置与运行计时分开） | 部（自然tick改变） | 部（已生成实体不可回滚） | J2、S4 SpawnerBlockEntity；逐字段 loader 保留未验证。 |
| 试炼刷怪笼 | 可 | 部（配置/状态机限制） | 部（活跃状态持续变化） | 部（生成/奖励不可回滚） | J2、S4 TrialSpawnerBlockEntity；逐字段未验证。 |
| 信标 | 可 | 部（效果可尝试；Levels保持只读） | 部（重算覆盖） | 部（仅配置） | J2、S4 beacon，Levels 原版金字塔计算。 |
| 漏斗 | 可 | 部（槽位和 TransferCooldown，持续tick） | 部（可能立刻输送） | 部（转移不回滚） | J2/J9、S4 hopper。 |
| 合成器 | 可 | 部（disabled_slots/triggered与槽位约束） | 部（红石合成会改变） | 部（已产物不可逆） | J2、S4 crafter；triggered 保存 int，不能按UI布尔直接拼NBT。 |
| 宝库方块 | 部（保存数据可读，运行默认值需投影） | 部（只配置；rewarded_players维持只读） | 部（tick/奖励状态） | 部（发奖不可逆） | J2、S4 VaultBlockEntity；客户端没有完整服务端 loot table 候选表，不能伪造校验成功。 |
| 折跃门 | 可 | 部（exit_portal/ExactTeleport等） | 部（Age计时） | 部（已传送不可逆） | J2、S4 end_gateway；逐字段持久化未验证。 |
| 结构方块 | 可 | 部（配置；不承诺执行加载/保存动作） | 可 | 部（结构造成世界变化不可逆） | J2、S4 structure_block。NBT设置不等于按按钮执行。 |
| 拼图方块 | 可 | 部（name/target/pool/final_state/joint） | 可 | 部（生成结构不回滚） | J2、S4 jigsaw；资源池存在性可能只由服务端判定。 |
| 旗帜/饰纹陶罐/头颅 | 可 | 部（各自codec字段） | 可 | 部（未知默认/组件映射待验证） | J2、S4 banner/decorated_pot/skull；头颅profile/custom_name与组件名不同。 |
| 讲台/唱片机/雕纹书架/蜂箱 | 可 | 部（书/唱片/槽位/蜂列表） | 部（播放、蜂释放、槽状态） | 部（世界副作用） | J2/J9、S4；不把 Page 或 bees 当任意无约束值。 |
| 熔炉/酿造台/营火 | 可 | 部（容器、26.1.2类型计时） | 部（自然tick） | 部（已消耗/产出不可逆） | J2、S4 版本分支；精确计时字段需26.1.2逐项验收。 |
| 幽匿感测/尖啸/催发、钟、潮涌核心 | 部（仅保存字段；运行时状态不全） | 部（仅现有可写字段） | 部（动态/未保存状态） | 部（世界副作用） | S4：钟ticks/shaking、核心Active/Hunting运行时值不能从data可靠还原；催发游标原视图只读。 |

### 3.3 非玩家实体与新实体视图（8行）

| 功能 | 读 | 写 | 回读校验 | 撤销 | 边界与依据 |
|---|---|---|---|---|---|
| 名称/Tags/静态持久字段 | 可 | 可 | 可 | 可 | data get/modify/merge/remove entity UUID；J1/J2。首版仅已证实保留字段白名单。 |
| 生物血量/装备/属性/效果/年龄等 | 可 | 部（loader、tick、死亡副作用） | 部（即时变化） | 部（不能复活/倒计时还原） | J1/J14；共享 EntityVolatile 和 S3 语义，Health=0不作普通可撤销字段。 |
| UUID/实体类型 | 可 | 否（UUID恢复，type不转换） | 可（验证仍为原身份） | 否（无合法改动可逆） | J1：setUUID(oldUUID)；Entity.load不是EntityType工厂。 |
| Pos/Motion/Rotation | 可 | 部（原版可load；产品保护动态字段） | 部（移动/维度变化） | 部（不能回退物理过程） | J1；定位操作优先tp，不把 Pos 是全局禁止误写为原版事实；普通NBT页沿用S3只读。 |
| 乘客关系 | 部（Passengers树不是完整双向图） | 部（ride mount/dismount，不能merge重建） | 部（需重新查询每个关系端点） | 否（沿用关系操作不可undo） | J16、S3 EntityRiding；实体消失/循环/玩家骑乘限制由服务器处理。 |
| 拴绳 | 部（leash保存投影） | 部（codec/持有者解析，具体目标未验证） | 部（延迟解析/断绳） | 部（掉落及持有者消失） | J16；首版禁写，需要服务端模组；不得沿用旧大写Leash模板。 |
| 车辆（箱船/矿车/命令矿车） | 可 | 部（容器/DisplayState/Command；船材质类型只读） | 部（运行状态/战利品） | 部（移动、执行、战利品副作用） | S4 EntityViewsVehicle、J1/J9/J16；逐子类加载行为未验证。 |
| 马/驴/羊驼、村民/僵尸村民 | 可 | 部（Owner/Tame/装备/容量/Offers/转化） | 部（容量、交易和转换动态） | 部（交易/转换实体不可逆） | S4 EntityViewsHorse/Villager、J1；交易列表无唯一稳定键则整表冲突，容量缩小不能默默丢物品。 |

### 3.4 在线/离线玩家（13行）

| 功能 | 读 | 写 | 回读校验 | 撤销 | 命令与缺口 |
|---|---|---|---|---|---|
| 在线玩家完整实体NBT | 可 | 否（data禁止Player） | 可 | 否 | data get entity @s/名字/UUID，J1/J12；只能拆为下列专项能力。 |
| 位置/朝向/维度 | 可 | 可 | 可 | 部（传送副作用、原地已变化） | execute in dimension run tp UUID x y z yaw pitch；J13。写后从新维度读。 |
| 重生点 | 可 | 部（spawnpoint不能清空/还原forced=false） | 可 | 部（原值null/非forced不可逆） | J13；26.1.2保存键respawn，rotation含yaw/pitch，不套旧SpawnX字段。 |
| 游戏模式 | 可 | 可 | 可 | 部（模式副作用/能力恢复） | gamemode mode UUID；J13，playerGameType。 |
| 属性 | 可 | 部（base/modifier，非任意内部值） | 可 | 部（临时modifier/副作用） | attribute UUID id base set value / modifier add/remove；J14。 |
| 药水效果 | 可 | 部（give/clear不能表达完整隐藏效果链） | 部（秒/tick/隐藏链差异） | 部（不能精确还原链与耗时） | J14；保留未编辑效果、无限时长另处理。 |
| 经验 | 可 | 部（points/levels不是完整XpTotal/XpP/XpSeed任意设置） | 部（选定投影可验证） | 部（多命令与总经验语义） | experience query/set/add；J14，Player保存Xp字段。 |
| 成就 | 部（自身同步/条件查询，不在data NBT） | 部（grant/revoke可做，沿用仅自己的产品约束） | 部（进度同步/条件验证待实测） | 部（奖励函数/经验不撤销） | J15、S4；不得因命令支持其他玩家而扩大现有advancement_self_only范围。 |
| 配方 | 可（recipeBook） | 部（give/take，highlight不能任意编辑） | 可（known集合） | 部（高亮/提示副作用） | J15；只开放解锁集合，不伪造完整RecipeManager目录。 |
| 玩家背包/装备 | 可 | 可 | 可 | 部（物品使用/装备效果） | item replace entity UUID hotbar.N/inventory.N/armor…；J9/J10，实际槽位按SlotRanges。 |
| 末影箱 | 可 | 可 | 可 | 可 | data get entity UUID EnderItems；item replace entity UUID enderchest.0..26；J9，不能对末影箱方块用Items代替玩家库存。 |
| 统计 | 部（自己原版统计同步，其他人无通用data路径） | 否（无通用原版stats写命令） | 否（无对应写入可验证） | 否 | J15、S4 stats服务端实现；scoreboard统计目标不等于修改玩家stats文件；自有同步范围未验证。 |
| 离线玩家 | 否（选择器不读离线档案） | 否（无playerdata文件写命令） | 否 | 否 | J12；spawnpoint/give/tp/attribute等均要求在线实体；不能借名字参数推断支持离线。 |

统计按每格计算，方便审阅，不把「部」算成功承诺：物品与保险库20格=可14/部6/否0；方块72格=可20/部52/否0；实体32格=可10/部19/否3；玩家52格=可23/部20/否9。整体44个功能行，176格=可67/部97/否12。运行时只读子字段在行内已明确，落地capabilities需拆到字段，不能沿用整行的「部」放行。

## 4. 读路径：从 Component 到可信快照

### 4.1 发什么、如何关联

使用 `data get entity <UUID|@s|在线名字> [path]`、`data get block x y z [path]`，发送字符串不带开头 `/`。自己可用@s，但会话身份固定真实UUID；其他玩家名字只用于首次解析，之后锁UUID。非玩家锁UUID、类型与维度，方块锁维度、坐标、方块ID/BE类型。跨维度使用 `execute in <dimension> run ...`，避免玩家切维度后操作相同坐标的另一块。J1/J2/J12；execute模板的联网验收仍待实施。

`/item` 没有读接口（J9）；它的替换成功消息不是物品序列化。读取玩家栈用Inventory/EnderItems；容器用Items。`SelectedItem`只作主手辅助投影，不能把换手后的它当旧槽位基线。

**一个连接全局只允许一个在途原版命令**，包括所有页面、保险库给物品、前读、写、回读、撤销。队列项保存本地 requestId、连接generation、会话ID、目标身份、预期key、参数结构、查询path、阶段、发送时间、deadline。原版没有回传requestId，也没有通用服务端请求取消。

entity.query只有displayName，没有保证唯一的UUID或查询path；改名、生物重名、用户手输data、其他模组发命令、延迟反馈均可能混淆。不能仅靠名字或时间窗断言来源。只接受结构和目标符合的反馈，原版entity查询来自saveWithoutId，根数据不能保证带实体类型id；UUID可核对，类型还需要已同步客户端实体/已验证的选择器type约束。未获得可靠类型信息时不能宣称完整身份校验，禁用依赖它的写操作。path读取需要与已确认身份、单在途请求配对。未知/重复反馈保留聊天并隔离，不能消耗下一项。超时后冻结该会话，要求重新读取/重开；晚到反馈只记审计，不推进新会话。全局单队列不能阻止别的模组发包，属于明确剩余风险；若检测到干扰则中断，不用自动插入Tags/scoreboard标记污染世界来关联。

### 4.2 解析算法

1. 平台事件给原始 `Component` 与overlay；仅处理非overlay系统消息，在渲染换行前观察。复制/快照必要结构，在客户端线程交给队列。不能从聊天GUI、日志、中文字符串或屏幕截图解析。
2. 检查 `TranslatableContents.getKey/getArgs`：entity.query取args[1]；block.query校验坐标后取args[3]。displayName本身是Component，可能含样式和hover；显示名不是身份令牌。嵌套包装只允许明确识别的原版包装；管理员广播、插件字面量改写不当成本笔响应。scaled numeric `*.get` 不是SNBT反馈，不能进入通用NBT解析器。依据J3。
3. 对**NBT参数子树**调用无格式文本拼接（getString等价遍历contents+sibling），不要拼完整外层翻译，也不要收集hover/click内容。保留转义、引号、空白、大小写和数值后缀。J4：byte `b`、short `s`、long `L`、float `f`、double `d`，int无后缀，typed arrays有前缀；StringTag.quoteAndEscape已负责字符串转义。大整数不得经JS Number或double中转。
4. NbtUtils用空缩进，正常data反馈无排版换行/缩进；聊天GUI自动折行只是显示。字符串中的换行通过SNBT转义表示。不要为“修复换行”删除字符串内容。
5. 以SNBT词法状态机检测**引号外**的 `<...>`，并限制字节、深度、元素数量；字符串字面值 `"<...>"` 不能误判。检测到折叠、非法类型、非完整消费输入，标记 `snapshotIncomplete`，不拿它当基线。用26.1.2 TagParser解析Tag（path读可以是标量/列表）；根读必须compound。规范化再序列化并按NBT类型树比较，不能用原始字符串等价。
6. 完整快照转换为共享编辑投影，保存原始未知字段、稳定键及类型。缺失键和空列表/空compound/默认值区别保存，不能一律补零。

J4证明 pretty 输出可能有损：数值数组>128、深度>=64会折叠；大普通列表并不统一截断，可能产生巨大Component。**不存在从 `<...>` 还原原值的算法**。设计可对已知schema字段/数组索引逐项补读；列表长度可借数字结果/路径探测，但尚未实现、非原子，需独立验收。更深子树可从更近path重读减小pretty深度。普通compound本次未发现按键数截断，若深层未知结构或传输预算仍无法完整读取，则高级整树编辑禁用，仅开放已经完整读取的独立字段。绝不把缺失部分当用户删除。

### 4.3 消息钩子与反馈失效

计划给 `ClientPlatform` 增加 `onGameMessage(Consumer<GameMessage>)`，GameMessage含原始Component、overlay、连接generation/接收时间。先做观察型回调，不默认吞聊天；将来隐藏已确认的工具响应须统一的显式消费协议，避免Fabric/NeoForge行为不同。

- Fabric：在FabricClientPlatform注册 `ClientReceiveMessageEvents.GAME`，已核验(Component,boolean)。如其他监听器取消后GAME不触发，需要评估ALLOW_GAME/取消事件或最低限度Mixin；当前取消顺序与覆盖范围**未验证**，不可宣称始终能截获。
- NeoForge：在NeoForgeClientPlatform通过游戏EVENT_BUS监听 `ClientChatReceivedEvent.System`，读取getMessage/isOverlay；是否需要receiveCanceled、事件优先级，在隔离客户端确认。不是普通玩家聊天事件，也不是服务端事件。J17。
- common现有onTick/onDisconnect可复用队列超时和清理；发送命令由common客户端适配器调用当前ClientPacketListener，不新增服务端payload。平台抽象保持物理客户端侧。

打开阶段用真实目标的只读data get探测。新规则名为 `/gamerule minecraft:send_command_feedback`（注册本地名send_command_feedback，默认命名空间）；不自动更改服务器规则。规则false与插件吞消息都可能静默，单靠超时无法区分。给用户提示「未收到原版结构反馈；请检查命令反馈规则、聊天设置或服务器插件」，能力降为只读/不可取得数据；只读探测可以由用户重新触发，不自动重复写。

反馈超长：限制完整Component树和SNBT预算，预读已知小路径优先；大数据按schema补读，达到预算返回 `read_too_large`。`ComponentSerialization`及消息编码本次只完成入口检查，**最大可传完整消息大小、编码失败fallback和插件截断阈值未完整验证**；不能把命令32767上限套用到反馈，也不能声称所有消息“不会截断”。任何无法解析/疑似裁剪均视为不完整，不能保存整树。

## 5. 写路径与命令生成

### 5.1 命令模板

所有模板由类型化 `CommandPlan` 生成，不接受页面原始命令。用户看到目标/字段/不可逆说明并提交；字符串参数均从codec和转义器生成。

| 编辑类别 | 生成方式 | 必须保留的限制 |
|---|---|---|
| 实体/BE标量、compound叶子 | data modify entity UUID path set value SNBT / data modify block x y z path set value SNBT | 只写mine与base不同路径，路径键逐段引用；共享只读字段校验。J1/J2 |
| 小型复合增改 | data merge entity UUID {changed:...} / data merge block ... {changed:...} | merge不会删除遗漏键；list整个替换。未知字段留在服务器当前值。J2 |
| 删除字段 | data remove entity UUID path / data remove block ... path | 缺失与默认值由loader再保存验证；“命令成功”不代表字段永久不存在。J2 |
| 玩家/容器栈 | item replace entity UUID slot with item[components] count；block对应container.N | 以写前当前栈为基础应用编辑，保留未知组件和删除补丁；空栈使用合法空物品路径并做26.1.2验收，不能把count=0硬套正整数参数。J9/J10 |
| 保险库给物品 | 指定已确认空槽replace；或用户明确选择give @s item[components] count | give可能合并或掉落，标不可可靠撤销；没有幂等键。J16 |
| 方块状态 | setblock x y z block[完整合并后属性] replace | BE字段优先data；有BE的状态变更须保留/校验BE，首版禁用未验收组合。J11 |
| 玩家专项 | tp、spawnpoint、gamemode、attribute、effect、experience、advancement grant/revoke only、recipe give/take | 按矩阵裁剪，不提供全量player NBT写回。J13—J15 |
| 骑乘关系 | ride UUID mount UUID / ride UUID dismount | 独立不可撤销操作，不用Passengers NBT冒充关系提交。J16 |

具体示例（展示语法，仍需以服务器注册表解析）:

```text
data get entity @s Inventory
data get block 10 64 20 Items
data modify entity <uuid> CustomName set value {text:"新名字"}
data modify block 10 64 20 CustomName set value {text:"工具箱"}
data remove block 10 64 20 CustomName
item replace entity @s hotbar.0 with minecraft:diamond_sword[minecraft:damage=0,!minecraft:custom_name] 1
item replace entity <player-uuid> enderchest.0 with minecraft:stone 32
execute in minecraft:overworld run tp <player-uuid> 10 70 20 90 0
```

组件的SNBT值来自每个DataComponentType.codec与当前注册表，不是旧版 `item{tag...}`。`!minecraft:custom_name` 表示显式移除该组件；与未提供该组件、恢复物品默认值不同。先从原始 `DataComponentPatch` 生成全部需要保留的补丁，再应用用户差异，用原版Tag/组件codec编写专用命令序列化器，再以 `ItemParser` / `ItemInput.createItemStack` 做本地解析往返验证（本版本ItemInput没有serialize方法）。服务器没有的模组组件不能偷偷丢弃后继续发送。J10。

SNBT生成必须用原版StringTag转义/Tag序列化，NBT path键名用path语法转义；命令参数只允许严格校验UUID、坐标、注册ID、已登记槽位。禁止直接拼JSON、用户输入换行/控制字符或把`/`当成第二条命令边界。文本组件在26.1.2按其codec产生NBT，不统一把它强塞成JSON字符串。

### 5.2 长度、签名和确认

J5已核实普通命令包默认32767个Java UTF-16 code units，UTF-8编码预算最多32767×3字节（Utf8String也检查实际编码长度）；非ASCII、代理对须按实际序列化验证。不是32767个Unicode码点，更不是256字符。完整命令前缀、维度、path、转义均占预算，发送前检查。单个无法分割的物品组件/字符串超长直接拒绝 `command_too_long`，给出需要服务端模组的原因；不能自动截断。可分割的独立叶子只能转换成已明确展示的多步计划。

本版本没有sendUnsignedCommand。统一传输适配器使用 `sendCommand(commandWithoutSlash)`：无可签名参数时普通包，有时签名包。data/item等原版NBT参数本身不是聊天MessageArgument；本次核查注册树未见这些模板有可签名消息参数，不需要聊天签名作为权限证明。不要改发chat字符串或自己构造虚假签名。sendCommand本身不会打开确认窗；sendUnattendedCommand用于另一种自动触发语义，会因权限等弹窗，不适合每一步机械调用。工具的写前确认仍由统一宿主执行，涉及签名/未知插件命令默认不在白名单。服务器最终解析、权限和签名验证照常执行。

### 5.3 合并、列表和状态

`data merge block … {Items:[…]}` 会整体替换Items列表，然后BE重新加载；不会按Slot自动合并。只改一个槽位优先item replace block；按Slot筛选NBT路径仅用于已验证的保存结构，新增/删除空槽需专门规划。双箱跨两个坐标，不制造54槽NBT列表。未展开LootTable的容器不给“空箱”假快照，先要求在游戏中正常展开或禁用。

`setblock replace`风险必须按26.1.2事实描述：当前实现没有无条件clear，但改变方块类型可能移除旧BE，提供片段tag会直接load并使未给字段恢复默认；同类型仅状态变化可能保留BE，**本次未逐类实测**。因此它不是通用BE编辑方法。不能用“先setblock，再写回完整旧NBT”声称无损；期间有tick和邻居副作用。状态操作独立capability，首版只开放验收通过的无BE状态。

写后读取刚刚编辑的路径和必要身份/耦合字段，按类型化期望比较；loader规范化有已知投影规则才允许接受。错误反馈、无变更 `commands.data.merge.failed`、规范化未保留均不能简单映射saved：先回读确定是否已达到期望。回读不完整则标 `verification:'unverified'`；无反馈且无法证明是否执行则 `outcome:'unknown'`，两者不同。

## 6. 一致性、撤销、权限与限流

### 6.1 乐观并发的保证边界

复用S3的纯合并算法/字段投影，不复制一份类似算法。base=打开或上次确认的快照，mine=在base脱离副本上应用完整页面草稿，current=提交前重新读取；逐路径规则：mine==base保留current，mine==current接受，current==base采用mine，其余冲突整笔不发送。compound递归，列表使用Slot/slot/UUID/uuid/id/Id/entity_data.UUID等唯一稳定键，Tags用集合；普通有序列表、数组、无唯一键交易列表整值比较。身份固定且所有命令只针对同一身份。维护现有EntityVolatile/BlockVolatile只读和计时语义。

拒绝形态与世界协议一致：

```json
{"status":"rejected","requestId":"w3","code":"target_changed","conflicts":[{"path":["Items","[Slot=0]","count"]}],"reason":"你修改的字段也已变化，草稿已保留"}
```

旧页面revision错误用 `stale:'client_revision'`；身份用 `stale:'identity'` 加conflicts；会话丢失用 `stale:'session'`。本地revision只是宿主冻结基线编号，永远不能发送给服务器当服务端会话版本，也不能用实时NBT hash冒充S3不透明revision。

**写前读与写之间仍有竞态**，甚至读取多个path之间也有tick。原版没有compare-and-swap整个编辑事务，客户端三方合并不能保证绝不覆盖同时写入。只发变更叶子能缩小覆盖面但不消除窗口。状态/容器/运行实体标 `consistency:'optimistic_nonatomic'`。在确定冲突时拒绝，不假装具有服务端强保证。未来可研究execute条件守卫单条写，但NBT匹配的子集/列表语义不能当完整CAS，未验证前不计入保证。

### 6.2 撤销和多步失败

客户端保存实际写前current、实际验证after、操作路径、连接/目标身份。undo以after为base、current为实时值，生成恢复before的差异并再三方合并。只还原本笔改变路径，其他计时、槽位、健康变化保留；相同路径后来变化则target_changed。撤销也必须重新经原版权限判断，不保证撤销把自己变更模式/传走的所有副作用。断线、未知结果、无法确认after时不建立可撤销记录。只在同次连接保留快照，限制数量/大小，不把玩家完整NBT随意写进普通日志。

多命令不是事务：按step保存sent/acknowledged/verified/rejected/unknown/skipped。首个失败或未知后停止后续写，已成功部分原样呈现；不能用一个rejected让用户以为零修改，也不自动补偿或重发。建议仍沿用result消息，增加：

```json
{"status":"rejected","requestId":"w8","code":"partial_apply","outcome":"partial","verification":"partial","steps":[{"id":"s1","state":"verified"},{"id":"s2","state":"rejected"},{"id":"s3","state":"skipped"}],"requiresReopen":true}
```

若第二步超时，outcome可为unknown且steps明确第一步已验证。当前前端没有这些语义时需一次通用协议升级，不能假称完全零前端改动。若用户最终允许未回读操作，成功确认但不能回读时可显示「命令已确认，未回读」；无论选择如何，已经发送的命令都不能展示未经证实的完整新NBT；没有确认则只能「结果未知」。

### 6.3 权限论证

命令后端的UI预判用 `mc.player.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)` 与服务器下发命令树作为提示（J8），但它们可能过时或被插件细分。客户端不做权威放行决定；发送仍是登录玩家自己的原版命令源，服务器每次解析并检查权限。预判错只会造成按钮启用/禁用不准，不会让原版data/item/tp绕过服务器授权。创造例外也由服务器真实creative检查，不能把本地instabuild当授权。S1/J8。

服务端后端继续原有已审计规则，不改权限策略、不绕过token/revision、距离、区域、槽位与codec检查。共享客户端验证可防误操作，但不承担防恶意客户端的服务端安全职责。

错误识别：保留原始Component key/参数与安全长度的原文，按类别映射 `permission_denied`、`command_unavailable`、`invalid_request`、`target_changed`、`feedback_unavailable`。原版命令树隐藏无权限命令时，Brigadier“未知命令”可能同时意味着没权限，**不能精确断言**；显示「命令不可用或权限不足」，不要伪造明确permission_denied。J1的玩家data写失败不是权限不足，应映射unsupported。插件字面错误只展示并终止，不靠中文关键字强判成功。未知命令/插件错误key穷举本次未验证。

### 6.4 节流与超时

J6：命令与聊天共享+20/tick-1的计数，>=200触发阈值；OP/房主豁免踢人不等于应该无限发送。建议连接全局最短间隔**1500ms**、burst=1、至多1在途、每个操作最多32条命令（更多需拆成用户可见分页/批次），普通读/写等待超时**10秒**，批次deadline按步骤数计算并显示进度。20TPS且没有其他聊天时1500ms足以抵消+20；TPS低/其他模组与手输命令仍会共享计数，不能宣称绝对安全。延迟/限流反馈出现即暂停、降频；不按现有服务端模组500ms窗口照搬。可提示慢服手动重试只读步骤，写绝不自动重发。

**读不到反馈 ≠ 命令没执行**。写超时立即标「结果未知」，冻结后续写与undo，允许用户显式刷新核对；重开不能隐式补发上一笔。give没有原版幂等键，即便前端requestId重复去重，也不能跨断线保证一次执行。

## 7. 单一代码路径与防漏设计

### 7.1 一份页面、一份协议、一份编辑规则

所有入口经统一 `EditorPageHost`（另一个worker正在建设；本任务只定义集成要求，不创建竞争实现）。物品、世界、玩家扩展、保险库入口复用同一页面与 `open/apply/undo/result/patch`，禁止增加command专用HTML、JS控制器或第二套保险库界面。前端只根据capabilities/schema/presentation显示、确认和禁用，**不出现 `if (backend === 'command')` 分支**。backend只供日志/诊断数据使用，提示文字也由通用presentation提供。

后端在open开始就选定并存入不可变 `BackendSession`：canSend(Request.TYPE)真→ServerModBackend，否则CommandBackend；这是唯一判定，没有“两边都装”第三种情况。此后不再用canSend重新选后端。通道失效、服务器拒绝、反馈消失只会终止/降级当前会话，不换实现。世界页面内导航打开新目标可建立新的目标会话，但仍通过统一host做完整open，不能在apply时临时替换。

共享 `EditIntent → SharedEditProjection/Validation → MergePlan → Backend.execute → ResultNormalizer → Host.patch`。ServerModBackend包装现有request/reply，服务器权威验证仍执行；CommandBackend只增加命令编译与反馈适配，不复制编辑表单、组件codec规则或三方合并。无法直接复用依赖ServerLevel的现有投影，要提取纯数据schema/转换部分，不能在客户端捏造ServerPlayer/BlockEntity真实世界来调用服务端writer。

### 7.2 capabilities必须四项齐全

每个编辑能力必须登记 `read/write/verify/undo` 四项，每项至少有支持级别、原因、证据/验证版本；缺任一项默认禁用整个能力，未知ID同样拒绝。聚合tab不能覆盖子字段禁用。页面禁用之外，宿主提交时再次校验已固定session能力，防旧页面或导入预设绕过。

```json
{
  "backend":"command",
  "presentation":{"notice":"服务器没有安装物品工坊，通过命令修改（无法撤销到服务端会话）"},
  "capabilities":{
    "item.inventory.replace":{
      "read":{"level":"supported"},
      "write":{"level":"supported"},
      "verify":{"level":"supported"},
      "undo":{"level":"partial","reason":"仅本次连接内，且槽位未被再次修改"},
      "consistency":"optimistic_nonatomic",
      "requiresConfirmation":false
    },
    "player.offline":{
      "read":{"level":"unsupported","reason":"需要服务端模组"},
      "write":{"level":"unsupported","reason":"原版命令不能编辑离线档案"},
      "verify":{"level":"unsupported"},
      "undo":{"level":"unsupported"}
    }
  }
}
```

这是设计形状，实施时使用枚举/封闭构造器避免拼错字段；只有用户在选项(c)选择允许时，无verify/undo的已支持操作才可用四项完整声明的unsupported+requiresConfirmation表达可执行，否则write也必须禁用。不能用遗漏项表示允许。read/write权限未知可表示 `unavailable`，reason必须说明。写确认由统一Host检查同一CommandPlan摘要，页面不能靠改confirmation字段跳过。

### 7.3 计划新增/调整的类

| 位置/类（计划） | 职责与复用点 |
|---|---|
| common客户端 `EditorPageHost` | 唯一入口、打开时选后端、绑定目标/连接/revision、pending和统一patch、确认能力、导航/关闭；对接现有worker。 |
| `EditorBackend`、`BackendSession`、`BackendCapabilities` | open/apply/undo/close异步接口与完整四项能力声明；接口位于客户端安全的包，服务端不加载Minecraft客户端类。 |
| `ServerModBackend` | 原EditorPackets包装，保留现有服务端token/revision、commit/confirm与权限规则，不创建命令fallback。 |
| `CommandBackend`、`CommandSession` | 冻结基线/身份、共享合并、只读/写/undo计划、客户端快照；creative_inventory为预先固定的内部策略。 |
| `CommandQueue`、`CommandFeedbackDecoder` | 连接全局单在途、节流、超时/晚回执隔离、结构Component解析；从不自动重发写。 |
| `CommandPlanCompiler`、`CommandItemCodec`、`CommandSlotResolver` | 类型化模板、转义/长度、补丁保留、实际槽位映射；未知menu、默认运行值拒绝。 |
| `EditCapabilityRegistry`、共享投影/合并纯函数 | 页面入口和字段注册闭包，缺项默认禁用；复用WorldMerge规则、StackCodec及已存在schema定义，不重建第二套字段语义。 |
| `EditorClient/WorldEditorClient/PlayerExtendedClient/VaultClient/VaultChannel` | 逐步改成Host适配入口；取消各自的后端选择/发包分叉；本机保险库存储不变，给物品通过同一会话后端。 |
| `ClientPlatform`与两端实现 | 增加观察型onGameMessage，复用tick/disconnect；Fabric GAME、NeoForge System事件。 |
| 通用页面数据/结果处理 | 支持四项capabilities、partial/unknown、确认/提示/steps；保留消息名称，一次通用改造，不按backend分叉。 |

### 7.4 同输入双后端一致性与防漏门禁

使用同一fixture目录、同一EditIntent序列、相同26.1.2注册表。两个隔离服务端环境：A安装服务端模组，B为**未安装本模组的原版独立专用服**。同客户端fixture分别走两个后端，不能在一台服务器上强制切换backend冒充自动选择验收。

| 同一批用例 | 两端共同断言 | 有意差异的断言 |
|---|---|---|
| 静态名称/Tags、普通物品数量/组件/删除补丁、已映射箱子槽 | 相同canonical NBT、未改字段保留、目标锁定 | Command显示非原子一致性提示；服务端revision不能被客户端制造。 |
| OP四模式、非OP生存/冒险/旁观、非OP创造自己物品 | 共同支持功能的允许/拒绝相同，真实服务器状态未越权变化 | 创造例外固定策略；预判错误不能使服务器写成功。 |
| 同路径并发、不同路径并发、身份替换、旧revision | 同路径冲突拒绝；不同路径合并；target_changed带conflicts或stale；草稿保留 | 命令测试把并发安排在前读前；另测读写窗口竞态并确认不宣称原子。 |
| undo、undo时字段再次改变 | 仅恢复已编辑路径，冲突拒绝形态一致 | 不支持undo的能力必须显式禁用/确认，不要求虚假的结果等价。 |
| 反馈关闭/权限撤销/插件改写/超长/断线/迟到/多步第二步失败 | 相同result外壳、requestId对应、无自动重发、前端通用提示 | 原版未知命令可能无法区分权限，允许归一为“不可用或权限不足”，不伪造准确原因。 |
| 全部页面入口与新增能力 | 每个入口调用Host；每能力四项完整；缺项拒绝；无backend分支JS | Server-only能力在Command显示“需要服务端模组”。 |
| 服务器通道已存在但请求失败 | 只出现EditorPackets发送，不出现命令发送 | 无任何自动fallback；断线清会话，重开才重选。 |

“相同输入得到相同NBT、权限拒绝一致”只适用于共同支持的语义域；无法回滚奖励/完整药水链等必须在fixture标unsupported并校验能力声明，不能偷偷放宽期望让测试通过。没有服务端CAS意味着不能承诺所有并发调度结果相同，这是协议能力差异，不是应补一份重复实现。

计划接入 `tools/ui-contract-test.cjs`（协议/capabilities/入口检查）与 `tools/world-edit/` 风格的新 `probe-command-backend` / `verify-command-backend` 探针，并纳入现有最终门禁。命令服务端B不得安装本模组测试探针；可用外部控制台/RCON或存档离线快照核对权威状态，MCTest仅在隔离客户端侧静默驱动UI/原版反馈。本次不创建或执行这些脚本。

## 8. 分阶段实施与验收计划

以下均为建议计划，不代表(a)—(d)已选定。涉及插件服、无回读/不可逆操作、创造例外的用例分别覆盖最终选择的“允许”和“禁用”分支；若选默认关闭/首次选择，必须先验证启用门槛，不能因已选CommandBackend就自动发写命令。

创建的实施探针还需记录四项选择对应的功能开关。首版字段白名单之外的功能默认禁用，不能仅靠矩阵里的“可行”上线。

### 阶段0：接口与证据门槛

先完成Host集成契约、四项capabilities注册、固定后端选择、消息事件与原版Component解码纯测试。补录真实26.1.2查询消息fixture（中英文相同key/args、字符串引号/换行、长数组、深层compound、大整数）；核实每个loader事件取消/线程顺序。验收：所有入口只走Host；两边装模组只走ServerModBackend；服务端拒绝时零命令fallback；缺字段能力默认禁用。首版未证实字段统一显示「需要服务端模组」。

### 阶段1：自己的物品 + 准星方块 + 准星非玩家实体

只开放证据闭环：自己的固定背包槽物品替换（组件与删除补丁）、普通BE CustomName、非玩家CustomName/Tags等少量静态字段；纯方块状态仅限经过专门验证的无BE类型，其他状态暂只读。不要以“准星方块”名义一次开放所有新视图。每个字段需真实原版读→前读→写→回读→undo完整证据，之后才启用capability。

在原版26.1.2独立专用服B、Fabric和NeoForge客户端分别以MCTest静默实机验证：四模式OP与非OP、非OP创造例外、换槽/换目标、名字重复、中文转义、反馈false、超长拒绝、写后丢反馈、一次写入不自动重发。并在A用相同fixture比较NBT/拒绝形态；用户正常游戏实例不参与。

### 阶段2：在线玩家

开放固定UUID在线玩家的背包/末影箱、tp、gamemode、可逆属性base；逐步加入有限效果/经验/重生点/配方。respawn清除/forced=false、统计写、离线档案不开放。成就保持自己目标，奖励副作用明确确认。

验收：玩家下线/改名/换维度、目标与操作者不同、权限提交前撤销、末影箱0/26边界、spawnpoint原值null和非forced、效果隐藏链、经验points边界、多命令第二步失败。所有不支持字段在两端相同前端明确禁用而非隐式丢弃；命令后端不能声称支持完整player投影。

### 阶段3：容器映射、保险库与特殊视图

逐容器登记映射，包括双箱两半、箱船/矿车、马/羊驼动态容量与战利品未展开状态；给物品先固定空槽，give作为明确不可逆选项。特殊BE按矩阵逐字段验证codec、写后保留和副作用；静态信标配置/告示牌等先于活动刷怪笼/宝库。插件服仅做兼容样本，不能扩大首版支持承诺。

验收：Items单槽不会覆盖其他槽、漏斗并发、双箱拆开、背包满/合并/掉落、give迟到/断线不重复、车辆实体离开、马容量缩减、村民交易列表冲突、命令方块执行风险、插件取消/改写消息后的只读降级。补普通未装客户端进服矩阵（第9节）。MCTest与tools/world-edit新探针收据分开记录“静态核验/服务器状态/网络/UI”，不能以单元测试替代实机结论。

## 9. 服务端安装、普通客户端未安装时是否透明

### 已核实的源码/依赖事实

- `EditorPackets`只定义play request/reply，没有自定义登录强制握手。`FabricEditor.onInitialize`使用PayloadTypeRegistry.serverboundPlay/clientboundPlay注册，FabricPlatform注册接收；Fabric的此API没有NeoForge式 `.optional()` 参数，注册play接收器本身不表示要求对端安装。客户端检测用ClientPlayNetworking.canSend。底层Fabric握手全链路本次未反编译，因此**不能仅凭这一点宣称实际登录已通过**。
- NeoForgeEditor显式 `registrar("1").optional()`；已读26.1.2.126 `PayloadRegistrar.optional` 源码，复制registrar并设置optional=true。双向play注册，**不是“仅服务端payload”**；可选表示缺少对端通道不作为必须匹配项。NeoForgeClientPlatform只在客户端入口注册Reply处理。
- Fabric metadata `environment:"*"`，main/client入口分开；依赖fabric-api、minecraft、Java>=25、oriel。它不是仅客户端模组，安装它的服务器也需要其声明的依赖。客户端UI由FabricEditorClient进入。
- NeoForge metadata依赖neoforge、minecraft、oriel，`side="BOTH"` 是依赖侧声明，不代表强制远端玩家安装，也不等于仅服务端。当前文件**没有displayTest声明**；不应套用旧Forge配置记忆添加一个未经核验的值。26.1.2 FML服务器列表显示兼容策略与Oriel传递握手仍**未验证**。
- `EditorMod.onInitialize`注册生命周期和请求接收；页面由EditorClient/WorldEditorClient在安装客户端的用户操作时打开。服务端不向所有登录玩家主动发打开UI消息。FabricPlatform/NeoForgePlatform的send当前没有canSend检查，但主路线是收到编辑请求后回复；正常未装客户端不会发EditorPackets.Request。后续若增加登录推送，必须先加通道能力检查。

### 结论与需要补验的部分

**源码层面没有发现物品工坊强迫普通客户端安装的自定义网络要求，NeoForge通道明确可选；预期普通原版客户端可以进入只装服务端功能的服务器并正常游玩。真实登录、服务器列表显示及Oriel等依赖整体兼容本次未验证，不能写成已保证。**

未装客户端的人不会获得Oriel编辑页面、快捷键或保险库界面；但“看不到任何东西”不能按字面保证：他们会看到别人编辑后的真实物品/世界变化；有权限的人可能看到服务器注册命令的补全与管理员命令反馈。`EditorMod.onInitialize → TestKitCommand.register` 会注册服务端命令，这是可见面，需要另做权限可见性审阅。如果需求是“无需安装、无额外UI”，现有结构基本符合；如果要求“所有命令列表/反馈中也完全隐形”，还需限定/移除诊断命令暴露，不能把网络可选性当作隐形保证。

计划核查/修改点：两平台服务端send增加能力守卫以防未来主动推送；审阅Oriel两端metadata和可选网络；核对当前FML受支持的显示兼容机制，有必要才调整metadata；保持Fabric环境双侧，不能为兼容改成client使服务器功能消失。若Oriel实际只是客户端需要，先审计common服务端类依赖再考虑NeoForge side=CLIENT/Fabric侧依赖拆分，不能只改声明掩盖类加载问题。

验收分别使用纯原版客户端→Fabric服务端、纯原版客户端→NeoForge服务端（均安装本模组及必需依赖），普通玩家与OP各一次；检查登录、正常背包/区块同步、无主动UI/未知payload断线、服务器列表状态。另测只装加载器但没装物品工坊客户端。此项属于阶段0/3联网门禁，本次未运行。

## 10. 风险与未决问题

1. **关联协议缺口**：原版data反馈无requestId、entity只给displayName；全局队列不能控制手输和其他模组。需要实机验证隔离/迟到策略，无法消除的场景必须暂停，而不是猜测关联。
2. **并发能力缺口**：前读与写之间无CAS，多步无事务；与ServerModBackend只能在共同语义域和可控制时序做等价测试。不能承诺全面相同保证。
3. **有损或缺失反馈**：pretty深度/数组折叠已证实；网络最大消息、取消事件顺序、插件改写/过滤尚未完整验证。补读只是独立请求，不能制造原子快照。
4. **具体视图覆盖**：通用data的load入口已证实，但特殊BE、马、村民、车辆每字段26.1.2保存/回读尚未逐项实测。当前工作树26.3分支不能用作26.1.2类型证据。阶段1严格白名单，其余显示需要服务端模组。
5. **不可逆副作用**：give掉落、成就奖励、命令方块、刷怪/转换/蜂释放/结构生成、物品消耗不能靠回写NBT撤销。是否允许确认后执行仍是选项(c)；若选择禁止，则这些能力必须关闭。不能把客户端快照叫服务端事务。
6. **权限信息精度**：客户端PermissionSet和命令树只能提示；插件授权、未知命令与权限错误不能总精确区分。安全由原版服务器保证，不为统一错误文案牺牲真实性。
7. **无模组客户端透明性**：可选payload证据已取得；FML显示行为、Oriel依赖、真实混合安装进服未验证。不得在发布说明写成已经实测兼容。
8. **单一路径落地范围**：EditorPageHost在另一个工作中建设，合并前需对齐接口；本设计不创建第二个host。前端需要一次通用capabilities/unknown/partial升级，不能宣称完全不改前端，也不能增加后端条件分支。

首先待用户拍板的是第1节(a)—(d)：启用方式、原版/插件服范围、无回读或不可撤销操作策略、创造写回例外。另可确定阶段1极小字段白名单、1500ms全局间隔/32步预算，以及普通未装客户端“透明”是否包括隐藏诊断命令。固定会话后端、单一页面协议、能力声明防漏是本设计必须遵循的架构约束，不应与四项尚未确定的产品取舍混同。
