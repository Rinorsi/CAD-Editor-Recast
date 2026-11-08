# 已放置方块编辑增量协议（Minecraft 26.1.2 / Java 25）

继续使用 slot.kind:block、op:open/apply/undo/close 信封，WorldEditorClient 原样转发新字段。所有操作共用原有权限、维度、区块、交互距离、保护区域、token、revision 和限流守卫。

## 状态与更新

页面 apply 示例（宿主补 slot token / revision）：

```json
{"requestId":"state-1","slot":{"kind":"block","dim":"minecraft:overworld","x":0,"y":64,"z":0},"block_state":{"facing":"west","type":"single"},"updateNeighbors":false}
```

block_state 是增量对象，值接受字符串、布尔或整数；属性名、序列化名称和值来自真实 StateDefinition / Property，与 block_properties 同源。未知属性、非法值、非标量或非法组合返回 invalid_block_state。原版允许的属性组合不等于任意环境中都能存活；门 half、箱子 left/right、楼梯 shape 等仍受环境影响，只改选中位置，不批量改另一半。

opened.world.block_state_schema / saved.world.block_state_schema 为数组，每项 {name,type,values,default,current}。type 为 boolean/int/enum，values/default/current 是原版序列化字符串；无需额外请求。选择器也应保留手动输入。

普通已放置方块也可打开，包括门、台阶、楼梯、中继器、红石线。has_block_entity:false 时 snbt/nbt 仅为只读的合成 id/x/y/z 身份，并非原版 BE 保存；只允许状态编辑。空气拒绝。

命令块模式在原版是不同 Block。可选 apply.block_type 接受真实命令块方块 ID，仅允许运行时注册的 CommandBlock 之间切换，不能任意换方块；world.block_type_schema 返回实际 ID。可同时提交 block_state.conditional/facing 与 views.command_block；仍需原版 COMMANDS_GAMEMASTER 命令权限，不要求创造模式。

updateNeighbors 必须为布尔，默认 true。true 使用 flags 3（UPDATE_NEIGHBORS | UPDATE_CLIENTS）；false 使用18（UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE），同时跳过本次比较器通知。flags 2 仍会传播形状更新，因此不用于关闭邻居更新。false 不能冻结以后自然 tick 或其他玩家操作。纯 NBT 写入也使用相应同步 flags。

先校验脱离世界的真实 BE 工厂副本、原版 loadWithComponents、容器/命令文本规则及响应大小，再 Level.setBlock 并恢复 NBT。相同 Block 状态改变走原版保留 BE 路径；命令模式替换后重新取得或创建相同 BE 类型并恢复数据。邻居更新改写请求属性或使目标换成其他方块时拒绝并尝试恢复前像；回滚只覆盖目标，不能撤销所有邻居/第三方回调副作用。

revision 包含方块 ID、状态及稳定 NBT；会话私有包装不进入页面 NBT。替换为另一种方块/BE类型会 target_changed；外部只改朝向按属性路径合并。undo 只恢复用户改过的状态/NBT路径，保留其他 current 值。

## 规范化视图和写入

world.views.GROUP 返回 {value,snbt,schema}。value 为真实 Codec JSON，snbt 保留类型；schema.fields 标明 Codec、nullable、可证实的存储范围及约束，不猜游戏数值范围。short/byte 范围来自原版真实保存类型；原版 Codec 和 detached loader 再校验语义。

页面提交 apply.views.GROUP，直接填 value 内要改的字段，不提交 value/snbt/schema 外壳。未知组/字段拒绝。顺序为完整 SNBT（可选）→规范化字段→动态合并→副本加载→container增量→验证→写入。不要用多个编辑器同时改同一字段。书/唱片字段用原版 ItemStack.CODEC 的 id/count/components JSON，与 container.slots 的工坊 StackCodec 格式不同。

```json
{"views":{"sign":{"front_text":{"messages":["你好","","",""]},"is_waxed":false}}}
```

|group|value / 写入字段|原版权威与边界|
|---|---|---|
|sign|front_text、back_text、is_waxed|SignText.DIRECT_CODEC；每面 messages 为 SignText.LINES 个文本组件，color 来自 DyeColor，has_glowing_text 为布尔；每面对象允许局部字段更新，保留未改面/过滤文本|
|banner|patterns|BannerPatternLayers.CODEC，项为 {pattern,color}；原版 getBaseColor 导出至 schema.base_color，只读|
|beehive|bees|Occupant.LIST_CODEC，entity_data/ticks_in_hive/min_ticks_in_hive；schema 给实际 MAX_OCCUPANTS；蜂箱/蜂巢共用，honey_level 用 block_state|
|lectern|Book、Page|ItemStack.CODEC；Book:null 清空；实际 lectern_books 标签、单本限制及加载保存验证|
|jukebox|RecordItem|ItemStack.CODEC，null 清空；原版唱片槽规则|
|decorated_pot|sherds|PotDecorations.CODEC，原版 back/left/right/front 顺序；内容物用 container.slots|
|chiseled_bookshelf|last_interacted_slot|物品继续用实际 container.slots，schema.items_write_path 指明路径|
|command_block|Command、TrackOutput、auto、powered|原版字段；conditional 用 block_state，模式用 block_type|
|skull|minecraft:profile、minecraft:custom_name|DataComponents.PROFILE/CUSTOM_NAME 实际 Codec，绑定原版隐式组件保存路径 profile/custom_name（schema.saved_path）；null 删除，不误塞进无法驱动 owner 的普通 components map|
|furnace|cooking_time_spent、cooking_total_time、lit_time_remaining、lit_total_time|原版 short，熔炉/烟熏炉/高炉共用|
|brewing_stand|BrewTime、Fuel|实际 short/byte|
|campfire|CookingTimes、CookingTotalTimes|真实 int 数组 Codec，不能保留/被截断的编辑由加载保存检查拒绝|

Book、RecordItem、书架 Items 内容确实变化时，从副本自动更新 has_book / has_record / slot_*_occupied；单独状态编辑不强行覆盖用户值。Book、RecordItem、头颅组件及 nameable.CustomName 可 null，其他字段不允许 null。空旗帜图案/默认陶罐装饰按原版稀疏保存省略。

蜡封标牌改文字须同一笔最终结果 is_waxed:false，否则 sign_waxed；完整 SNBT 同样受限。修改后含可执行命令的文本要求 ServerPlayer.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)，与创造/生存无关。命令方块、结构方块、拼图方块依据原版 GameMasterBlock 标记要求同一权限；有权限+生存允许，无权限+创造拒绝。其他权限/距离/区域保护守卫不变。

end_gateway / structure_block 返回 views.unsupported:{supported:false,reason}，无安全的专用 normalized 写入；保留旧完整 SNBT 及身份保护，不声称已验证传送/结构副作用。

## nameable：自定义名称（P1-1）

仅实际实现 `Nameable` 的 BE 返回此组，不硬编码方块名单。26.1.2 讲台不实现此接口，不返回此组。字段 `CustomName` 为原版 `ComponentSerialization.CODEC` JSON（字符串或文本组件对象），无手写候选；`schema.fields.CustomName.nullable:true`。`null` 删除保存键并恢复原版默认名称，空字符串仍是显式名称。未知组/字段为 `invalid_request`；非法组件或原版加载保存未保留为 `invalid_nbt`；可执行文本仍受现有权限校验。

视图示例（省略运行时 codec 描述）：
```json
{"nameable":{"value":{"CustomName":null},"snbt":"{}","schema":{"fields":{"CustomName":{"nullable":true,"authority":"vanilla_codec_and_loadWithComponents"}}}}}
```

edits 示例：
```json
{"views":{"nameable":{"CustomName":{"text":"工坊","color":"gold"}}}}
```

## hopper：搬运冷却（P1-2）

字段 `TransferCooldown` 是整数 tick，范围来自 `Codec.INT` / 原版 `getIntOr`、`putInt`：`Integer.MIN_VALUE` 至 `Integer.MAX_VALUE`（-2147483648..2147483647），不是正常搬运间隔的硬上限；负数是原版可保留状态，不额外猜测游戏范围。`null` 拒绝，清零用 `0`。非整数、越界、null 为 `invalid_nbt`，未知字段为 `invalid_request`；沿用动态三方合并，不覆盖未编辑的当前计时。

视图示例：
```json
{"hopper":{"value":{"TransferCooldown":-1},"snbt":"{TransferCooldown:-1}","schema":{"fields":{"TransferCooldown":{"nullable":false,"min":-2147483648,"max":2147483647}}}}}
```

edits 示例：
```json
{"views":{"hopper":{"TransferCooldown":0}}}
```

## 动态字段白名单及来源

下表为内部数据指纹和动态合并语义；网络revision为冻结的不透明会话版本，详见 [world-revision-contract.md](world-revision-contract.md)。不因当前计时变化重新计算会话版本。

下表保留专门动态语义及 revision 规范化，但不是可编辑性的白名单。全部路径（含未知模组 BE）采用 [world-merge-contract.md](world-merge-contract.md) 的 base/mine/current 三方规则；Items、文本、命令、配方等只有双方改同一路径且不同才冲突。

|BE保存id|volatile路径|26.1.2真实类证据|
|---|---|---|
|minecraft:furnace / smoker / blast_furnace|cooking_time_spent、cooking_total_time、lit_time_remaining、lit_total_time|AbstractFurnaceBlockEntity.saveAdditional 绑定 cookingTimer/cookingTotalTime/litTimeRemaining/litTotalTime，serverTick 增减进度并根据配方/燃料更新总时间|
|minecraft:brewing_stand|BrewTime、Fuel|BrewingStandBlockEntity.saveAdditional/serverTick，倒计时及开始酿造消耗fuel|
|minecraft:hopper|TransferCooldown|HopperBlockEntity.saveAdditional 的 cooldownTime，pushItemsTick 递减/重设|
|minecraft:campfire|CookingTimes|saveAdditional 的 cookingProgress，cookTick 增加、cooldownTick 减少；CookingTotalTimes 按通用三方规则比较|
|minecraft:mob_spawner|Delay|BaseSpawner.save/load 的 spawnDelay，serverTick/clientTick倒计时及delay重置|
|minecraft:beehive|bees[*].ticks_in_hive|BeeData.tick 的 ticksInHive++，toOccupant 写回当前计数；真实 Occupant.CODEC 捕获证实路径|
|minecraft:beacon|Levels|BeaconBlockEntity.saveAdditional 的 levels，tick 根据底座重算|
|minecraft:jukebox|ticks_since_song_started|JukeboxBlockEntity.saveAdditional 从 JukeboxSongPlayer.getTicksSinceSongStarted 保存，歌曲播放器 tick 增加|

证据为 logs/block-edit/bytecode-*.txt，由已解析的目标 MC jar 执行 javap -p -c 捕获。派生采用任务允许的真实类保存绑定与 ticking 字段路径，没有声称已在 ticking ServerLevel 间隔N tick采样。试炼刷怪笼与未知计时字段由通用三方规则保留，无需加入白名单。

校验会话基线后，在 opened 副本上生成 mine，再与 current 逐路径合并并由原版加载器校验。未改的计时、物品烧成/搬走、蜂离巢及未知模组字段保留 current；双方改同一路径才冲突。可唯一识别的列表按 Slot/id/UUID 等稳定键合并，否则整列表比较。详细回执与 undo 规则见 world-merge-contract.md。更换唱片仍执行原有播放时间语义。

## 支持与验收

|类型|后端状态|实际证据/未验收项|
|---|---|---|
|箱子/熔炉/门/台阶/楼梯/中继器/红石线|支持全部真实状态属性、schema、revision/undo|已遍历允许值、BE工厂NBT保真；setBlock/邻居待客户端|
|标牌/悬挂标牌、旗帜、蜂箱/蜂巢、讲台、唱片机、陶罐、头颅|支持规范化视图与写入|真实工厂/Codec往返、典型修改捕获；蜡封拒绝及解蜡编辑已测|
|雕纹书架|支持 last_interacted_slot 及既有 container.slots|工厂/视图往返；真实书架内容和交互待客户端|
|三种命令块|支持 block_type / 状态 / 命令字段|实际注册表模式、副本NBT保留；执行/调度待客户端|
|熔炉/烟熏炉/高炉/酿造台/营火|支持进度视图/Codec写入/动态合并|JVM数据守卫/往返；真实 ticking 熔炉改名与倒计时合并已在独立专用服验证；声音/客户端待验收|
|折跃门/结构方块|partial：原SNBT；专用normalized不支持|工厂标记捕获；传送/结构行为未验收|
|试炼刷怪笼/未知模组BE|保留原通用路径，无新动态白名单|通用三方合并；实际激活/第三方模组 loader 未专项实测|

WorldEditTest 原420项保持通过，并调用 BlockWorldEditTest 扩展，覆盖属性遍历、BE保真、模式副本、规范化修改、非法颜色/行数、蜡封规则、动态三方合并、状态冲突、token及共用权限/距离/保护守卫。守卫单测不是 ServerPlayer 集成验收。

复现：tools/world-edit/verify-block.ps1 -ClasspathJson <runtime-classpath.json>；编译目录与完整输出在 logs/block-edit。真实完整工厂/Codec捕获见 [world-block-samples.json](world-block-samples.json)，不是手写默认表。真实客户端请求、远程服、多玩家保护、Level.setBlock邻居传播及持续tick：**real-client run pending**。

