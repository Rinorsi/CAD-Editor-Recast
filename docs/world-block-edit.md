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

命令块模式在原版是不同 Block。可选 apply.block_type 接受真实命令块方块 ID，仅允许运行时注册的 CommandBlock 之间切换，不能任意换方块；world.block_type_schema 返回实际 ID。可同时提交 block_state.conditional/facing 与 views.command_block；仍需原版管理员与创造权限。

updateNeighbors 必须为布尔，默认 true。true 使用 flags 3（UPDATE_NEIGHBORS | UPDATE_CLIENTS）；false 使用18（UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE），同时跳过本次比较器通知。flags 2 仍会传播形状更新，因此不用于关闭邻居更新。false 不能冻结以后自然 tick 或其他玩家操作。纯 NBT 写入也使用相应同步 flags。

先校验脱离世界的真实 BE 工厂副本、原版 loadWithComponents、容器/命令文本规则及响应大小，再 Level.setBlock 并恢复 NBT。相同 Block 状态改变走原版保留 BE 路径；命令模式替换后重新取得或创建相同 BE 类型并恢复数据。邻居更新改写请求属性或使目标换成其他方块时拒绝并尝试恢复前像；回滚只覆盖目标，不能撤销所有邻居/第三方回调副作用。

revision 包含方块 ID、状态及稳定 NBT；会话私有包装不进入页面 NBT。外部只改朝向、替换为另一种同 BE 类型方块也会 target_changed。undo 同时恢复状态/命令模式和 NBT，保留 CURRENT 动态字段。

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

Book、RecordItem、书架 Items 内容确实变化时，从副本自动更新 has_book / has_record / slot_*_occupied；单独状态编辑不强行覆盖用户值。Book、RecordItem、头颅组件可 null，其他字段不允许 null。空旗帜图案/默认陶罐装饰按原版稀疏保存省略。

蜡封标牌改文字须同一笔最终结果 is_waxed:false，否则 sign_waxed；完整 SNBT 同样受限。修改后含可执行命令的文本继续要求 canUseGameMasterBlocks。

end_gateway / structure_block 返回 views.unsupported:{supported:false,reason}，无安全的专用 normalized 写入；保留旧完整 SNBT 及身份保护，不声称已验证传送/结构副作用。

## 动态字段白名单及来源

仅下表路径从 revision 排除。其他字段保持严格，包括 Items、文本、命令、配方、蜂 entity_data/min_ticks_in_hive。未知模组 BE 不自动忽略字段。

|BE保存id|volatile路径|26.1.2真实类证据|
|---|---|---|
|minecraft:furnace / smoker / blast_furnace|cooking_time_spent、cooking_total_time、lit_time_remaining、lit_total_time|AbstractFurnaceBlockEntity.saveAdditional 绑定 cookingTimer/cookingTotalTime/litTimeRemaining/litTotalTime，serverTick 增减进度并根据配方/燃料更新总时间|
|minecraft:brewing_stand|BrewTime、Fuel|BrewingStandBlockEntity.saveAdditional/serverTick，倒计时及开始酿造消耗fuel|
|minecraft:hopper|TransferCooldown|HopperBlockEntity.saveAdditional 的 cooldownTime，pushItemsTick 递减/重设|
|minecraft:campfire|CookingTimes|saveAdditional 的 cookingProgress，cookTick 增加、cooldownTick 减少；CookingTotalTimes 保持严格|
|minecraft:mob_spawner|Delay|BaseSpawner.save/load 的 spawnDelay，serverTick/clientTick倒计时及delay重置|
|minecraft:beehive|bees[*].ticks_in_hive|BeeData.tick 的 ticksInHive++，toOccupant 写回当前计数；真实 Occupant.CODEC 捕获证实路径|
|minecraft:beacon|Levels|BeaconBlockEntity.saveAdditional 的 levels，tick 根据底座重算|
|minecraft:jukebox|ticks_since_song_started|JukeboxBlockEntity.saveAdditional 从 JukeboxSongPlayer.getTicksSinceSongStarted 保存，歌曲播放器 tick 增加|

证据为 logs/block-edit/bytecode-*.txt，由已解析的目标 MC jar 执行 javap -p -c 捕获。派生采用任务允许的真实类保存绑定与 ticking 字段路径，没有声称已在 ticking ServerLevel 间隔N tick采样。试炼刷怪笼不在白名单，仍可能严格冲突。

比较稳定 revision 后，以 opened/baseline、请求、CURRENT 三方合并。请求中动态字段未相对 opened 改变时继承 CURRENT，省略 snbt 的增量从 CURRENT 开始。明确改变进度值则视为用户编辑，仍走原版校验；undo 始终保留 CURRENT 动态值。蜂计数仅在列表长度和对应 entity_data 一致且该计数未编辑时按索引合并。蜂进出/换实体继续冲突。更换唱片时清除旧歌曲时间，避免把原唱片播放偏移带给新唱片；是否自动开始播放仍待客户端验收。

活跃熔炉的倒计时不会让名称/容器编辑误判 target_changed，也不会被旧 SNBT 回退；并发非动态字段仍拒绝。物品真正烧成/搬走等有意义变化保持冲突。

## 支持与验收

|类型|后端状态|实际证据/未验收项|
|---|---|---|
|箱子/熔炉/门/台阶/楼梯/中继器/红石线|支持全部真实状态属性、schema、revision/undo|已遍历允许值、BE工厂NBT保真；setBlock/邻居待客户端|
|标牌/悬挂标牌、旗帜、蜂箱/蜂巢、讲台、唱片机、陶罐、头颅|支持规范化视图与写入|真实工厂/Codec往返、典型修改捕获；蜡封拒绝及解蜡编辑已测|
|雕纹书架|支持 last_interacted_slot 及既有 container.slots|工厂/视图往返；真实书架内容和交互待客户端|
|三种命令块|支持 block_type / 状态 / 命令字段|实际注册表模式、副本NBT保留；执行/调度待客户端|
|熔炉/烟熏炉/高炉/酿造台/营火|支持进度视图/Codec写入/动态合并|JVM数据守卫/往返；真实持续tick、配方和声音待客户端|
|折跃门/结构方块|partial：原SNBT；专用normalized不支持|工厂标记捕获；传送/结构行为未验收|
|试炼刷怪笼/未知模组BE|保留原通用路径，无新动态白名单|不声称解决全部tick冲突|

WorldEditTest 原420项保持通过，并调用 BlockWorldEditTest 扩展，覆盖属性遍历、BE保真、模式副本、规范化修改、非法颜色/行数、蜡封规则、动态三方合并、状态冲突、token及共用权限/距离/保护守卫。守卫单测不是 ServerPlayer 集成验收。

复现：tools/world-edit/verify-block.ps1 -ClasspathJson <runtime-classpath.json>；编译目录与完整输出在 logs/block-edit。真实完整工厂/Codec捕获见 [world-block-samples.json](world-block-samples.json)，不是手写默认表。真实客户端请求、远程服、多玩家保护、Level.setBlock邻居传播及持续tick：**real-client run pending**。

