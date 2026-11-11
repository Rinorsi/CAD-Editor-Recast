# 世界实体编辑增量协议（26.1.2）

2026-11-07。补充 world-edit-contract.md，覆盖其中“实体全部NBT变化都冲突”的历史限制。方块协议由 world-block-edit.md 负责。原有 open/apply/undo、slot/token/revision、权限、交互距离、已加载区块、边界与保护、500ms速率限制和压缩预算保持。

## 消息和视图

### 2026-11-10 动态值覆盖、速度与移动目标

- 在线世界编辑使用 WorldMerge.applyEdits：主动修改的 Age、PickupDelay、效果时长及其他可写字段采用用户值；未修改路径保留现场值，不冻结实体或世界 tick。身份、页面版本、权限和原版加载保留校验继续生效。旧版下文中同路径动态冲突的描述以本段为准。
- 非玩家实体允许修改真实保存字段 Motion（三个 double）。属性页复用公共数字控件；MC 26.1.2 / 26.2 / 26.3 的 Entity.load 均使用 Vec3.CODEC，任意一轴绝对值大于 10 时该轴归零，因此表单显示每轴 −10..10 格/刻，原始 SNBT 仍经过实际 loader/字段保留校验。原版 load 设置 needsSync，沿用 /data modify entity 的加载路径。摩擦、轨道和后续 tick 仍会自然改变速度。
- 服务端 open 记录非玩家实体的 openingPosition，保存后仍保留最初位置。apply/undo 先认证连接、目标 UUID、token 和 revision，再解析目标。实体仍在交互范围内时保留当前位置；跑出范围时，以当前包围盒平移到 openingPosition 后执行原生交互距离检查，同时检查当前位置与返回位置的区块、边界和区域权限。
- 所有正常 NBT 保护与副本校验完成后，才由服务端把可信 openingPosition 注入最终计划的 Pos；客户端不能借此任意传送或修改 UUID。预览/写入/回执仍在现有事务中，失败回滚到真实写前位置；成功拉回另记 entity_return（player/target/from/to）日志。玩家不走此返回逻辑；移除、卸载或离开维度的目标不加载、不复活。
- 掉落物预览读取完整 Item 栈或当前 normalized 草稿，使用原生物品模型/图标与共享 typed 组件转换；不创建无内容的临时掉落物模型。修改物品及组件后就地更新。
- 本次未执行行为测试或实机；源码、构建结果见 DEV-NOTES-0.99.6.md，不沿用历史探针结果。

### 效果时长与自然倒计时

实体自身及玩家 `cad_player` 的 `active_effects` 合并按唯一效果 ID 匹配。主动修改的时长或其他可写字段采用用户值；未改动的时长沿用现场值，删除效果不会仅因倒计时而被拒绝。SNBT 包装和玩家 JSON 使用同一规则；物品、方块或任意嵌套对象中的同名字段不借用实体效果倒计时推断。

删除最后一个效果时，界面提交的是缺少整个 `active_effects` 键的文档。后端保留这种缺席语义，不补造空列表；在线编辑按主动删除整个字段处理。列表仍存在时按稳定 ID 合并，保留未修改的其他效果。显式 `null`、错误类型不当作删除。

在线编辑不再要求区分自然倒计时、时长刷新或其他来源的同字段变化：实际改变的字段以草稿为准。离线玩家继续使用严格合并及原有的自然倒计时特例。权限、目标身份、原版 Codec 和保存后字段保留门禁保持生效。

普通修改沿用 apply，增加 entity 区段，只发送改变的字段。页面保留 slot/requestId；宿主补 op/revision。网络请求须完整 canonical slot/token/revision。不要把只读 views 整个写回。

    {op:'apply',requestId:'pose-1',slot:canonicalSlot,revision:openedRevision,
     entity:{pose:{Head:[10,20,30],ShowArms:true},
       equipment:[{slot:'mainhand',stack:{id:'minecraft:stick',count:1,comps:{},removed:{}}}]}}

这是形状示例，真实数据见下文捕获。entity 支持：

|键|输入与目标|
|---|---|
|pose|盔甲架 Head/Body/LeftArm/RightArm/LeftLeg/RightLeg，各为三个角度float；ShowArms/Small/Marker/Invisible/NoBasePlate 为严格boolean|
|equipment|LivingEntity 实际 EquipmentSlot 的 {slot,stack} 数组；重复、不可用槽和无效物品拒绝。盔甲架手持应同时 ShowArms:true|
|item_frame|物品/荧光展示框：item 为 StackCodec 或 {empty:true}；ItemRotation 为0..NUM_ROTATIONS-1整数；Invisible/Fixed 为boolean；ItemDropChance 为有限float，原版未规定0..1范围|
|painting|仅 {variant:'注册表ID'}；选项来自当前 painting_variant 注册表，允许手动ID；朝向与悬挂定位锁定|
|display|下表字段，按实体子类限制|
|offers|村民/流浪商人完整交易列表替换；仅真实 ServerLevel，交易界面开启时拒绝。职业/等级/经验继续用现有变种/字段|

允许组合 snbt 和 entity：先验证/rebase完整SNBT，再应用normalized区段。未知区段和错误目标类型拒绝，真实工厂副本加载校验后才写现实目标。

world.views 按类型出现 pose/item_frame/painting/display/trades，所有实体有 riding。每个区段的 schema 是规格/探针，只读。world.equipment/displayed_item 保留兼容。entity_schema.entries[0].views 返回相同schema，供刷怪蛋复用；保留既有 variants/flags/attributes/effects/extras/equipment。

schema.fields 绑定真实保存路径；loaderProbes 是输入、实际保存值、retained或原版错误。不能从有限探针推断连续范围。枚举来自实际 enum.values()；选择器也应允许手动输入。Rotations.CODEC 的三个角度经真实构造器按 %360 正规化，非有限值归零；页面应发送有限数。

## P2-1 驯服关系

已有 schema 覆盖：狼/猫/鹦鹉等 TamableAnimal 的 `extras[id=sitting]` 由真实 setter 探测，26.1.2 实际保存键为 `Sitting`（boolean），不是 `OrderedToSit`；继续按该路径编辑，不新增重复控件。Owner 的 extras 仅为原始 UUID NBT 探针，补充以下关系接口。

`world.views.owner` / `entity_schema.views.owner` 适用全部 TamableAnimal。视图字段 `Owner` 为规范 UUID 字符串或 null；`players` 为当前服务器 PlayerList 的 `{uuid,name}` 列表（跨维度在线玩家），`available` 表示存在服务器列表；这些候选/状态只读。无服务器时列表为空，不冒充完整在线名单。

写入 `entity.owner` 仅接受 `Owner`。新主人必须是提交时仍在线的玩家；原有离线主人允许原样保留；严格校验 UUID 格式；null 清除主人，并由原版 loader 解除驯服，保留 Sitting。UUID/位置仍受 WorldNbt.protect 保护。未知字段、非字符串、缩写 UUID、离线新主人或错误实体类型拒绝，错误沿用实体编辑的 invalid_nbt/参数错误映射。没有手写玩家目录，NBT 经 EntityReference.codec()。

视图示例：
```json
{"owner":{"Owner":null,"players":[{"uuid":"00000000-0000-0000-0000-000000000001","name":"Example"}],"available":true}}
```
Edits 示例（UUID 须替换为当前在线候选；null 可直接清除）：
```json
{"entity":{"owner":{"Owner":null}}}
```

## P2-2 掉落物

`world.views.dropped_item` / `entity_schema.views.dropped_item` 仅 ItemEntity；写入 `entity.dropped_item`。字段 `Item` 是完整 StackCodec 对象（保留组件及移除 patch），必须非空；`PickupDelay`、`Age` 是实际保存类型 short，范围为 Java Short.MIN_VALUE..MAX_VALUE（-32768..32767），只接受整数，不额外杜撰游戏计时范围。未提交字段保持原值；所有字段拒绝 null。物品候选来自实时 item/component 注册表，栈经 ItemStack.CODEC，数量遵守 StackCodec 的实际堆叠限制。未知字段/物品、空栈、数值截断、错误实体类型和 loader 未保留值拒绝。

视图示例：
```json
{"dropped_item":{"Item":{"id":"minecraft:stick","count":1,"comps":{},"removed":{}},"PickupDelay":0,"Age":0}}
```
Edits 示例：
```json
{"entity":{"dropped_item":{"Item":{"id":"minecraft:diamond","count":2,"comps":{},"removed":{}},"PickupDelay":100,"Age":-100}}}
```

## P2-3 下落方块与引信

新增视图和对应 `entity.<视图名>` 写入：

|视图|适用实体|字段与类型、范围|
|---|---|---|
|falling_block|FallingBlockEntity|BlockState：BlockState.CODEC 的 `{Name,Properties?}`；Time/FallHurtMax：保存类型 int；FallHurtAmount：有限 float；DropItem/HurtEntities/CancelDrop：严格 boolean|
|tnt|PrimedTnt|fuse：实际保存 short（-32768..32767），不是旧版本的 Fuse|
|creeper|Creeper|Fuse：short；ExplosionRadius：保存 byte（-128..127）|

int 范围为 Java signed int。存储范围由实时 save 的 Tag 类型决定；不将倒计时伪装为只能非负。所有字段拒绝 null；未提交字段不变。方块与属性候选来自实时 block 注册表及 StateDefinition（复用 block_properties），拒绝未知块、属性、属性值，不手写目录。实体必须匹配视图，未知字段/错误类型/越界/原版未保留值均拒绝。`powered` 已被 entity_schema.extras 覆盖，不在 creeper 视图重复提供；可沿原始验证路径设置 byte-bool。

各视图与 edits 示例：
```json
{"falling_block":{"BlockState":{"Name":"minecraft:sand"},"Time":0,"DropItem":true,"HurtEntities":false,"FallHurtAmount":0,"FallHurtMax":40,"CancelDrop":false}}
```
```json
{"entity":{"falling_block":{"BlockState":{"Name":"minecraft:oak_log","Properties":{"axis":"x"}},"Time":12,"DropItem":false}}}
```
```json
{"tnt":{"fuse":80}}
```
```json
{"entity":{"tnt":{"fuse":120}}}
```
```json
{"creeper":{"Fuse":30,"ExplosionRadius":3}}
```
```json
{"entity":{"creeper":{"Fuse":50,"ExplosionRadius":5}}}
```

## P2-4 大小与末影人

已有通用 schema 变种 `slime/size`（也适用于 MagmaCube）和 `phantom/size`：由实时 setter 在整数端点获取合法范围，再逐值真实 load/save 验证。UI 应使用 options 的保存值和 min/max，不把视觉大小与原始 Size（可能有偏移）混同；不新增重复视图。相关属性仍按 attributes 支持情况编辑，不能绕过 loader 重算属性。

新增 `world.views.enderman` / `entity_schema.views.enderman` 仅 EnderMan，写入 `entity.enderman` 的 `carriedBlockState`。类型为 BlockState.CODEC `{Name,Properties?}` 或 null；null 清空携带物。候选/属性范围来自实时 block 注册表及 StateDefinition，同 falling_block；原版过滤空气，显式写空气因不被保留而拒绝，应发送 null。未知字段、无效状态/属性、错误实体类型拒绝。不是根据旧版可搬运方块目录硬编码限制。

视图示例：
```json
{"enderman":{"carriedBlockState":{"Name":"minecraft:oak_log","Properties":{"axis":"z"}}}}
```
Edits 示例：
```json
{"entity":{"enderman":{"carriedBlockState":null}}}
```

## P2-5 其他实体与关系读取

### 可写视图

以下视图同名写入 `entity.<视图名>`；未知字段、错误目标类型、类型/存储越界、Codec 错误、非有限浮点数或实际 loader 未保留请求值均拒绝。省略字段保留原值，除明确标注外 null 非法。signed int/short/double/float 的范围按实时保存 Tag 类型与对应 Java 存储类型；不手写游戏选项目录。各视图的 fields 在 `schema` / `entity_schema.views` 提供类型、路径和存储边界。

|视图|实体|字段|
|---|---|---|
|area_effect_cloud|AreaEffectCloud|Radius/RadiusOnUse/RadiusPerTick：有限 float；Age/Duration/WaitTime/ReapplicationDelay/DurationOnUse：int；potion_contents：PotionContents.CODEC；custom_particle：ParticleTypes.CODEC；potion_duration_scale：有限 float|
|experience_orb|ExperienceOrb|Value：实际保存 short，-32768..32767|
|arrow|AbstractArrow（含普通箭、光灵箭及同基类实体）|damage：有限 double；pickup：实际 Pickup.LEGACY_CODEC 数值，候选为实时 Pickup.values() 经 Codec 编码得到的 `{label,value}`，非合法枚举值/小数拒绝，不能依赖 Codec 的越界回退|
|interaction|Interaction|width/height：有限 float，原版无额外 clamp；response：严格 boolean；不开放 attack/interaction 玩家行为记忆|

药水云的 `potion_contents` 支持 Codec 的 potion、自定义颜色和 custom_effects 等完整结构；药水和效果候选分别来自当前 potion/mob_effect 注册表，效果结构/范围由 MobEffectInstance Codec 决定，不转为过时 Effects 键。粒子及其参数来自 particle_type 与 ParticleTypes.CODEC。三个可选字段 potion_contents/custom_particle/potion_duration_scale 的 null 表示删除覆盖、恢复原版默认；默认空药水或默认 duration scale 若被原版省略，应发送 null，不发送会被省略的显式空对象/默认值。Radius 边界通过真实服务端侧 setter 端点获取，在 schema.fields.Radius.min/max 返回；越界被 clamp 后不相等就拒绝。客户端 fixture 不模拟服务端半径 setter，相关门禁使用不启动/不 tick 的 server-side Level fixture。

视图和 edits 示例：
```json
{"area_effect_cloud":{"Radius":3,"Duration":200,"Age":0,"WaitTime":20,"ReapplicationDelay":20,"DurationOnUse":0,"RadiusOnUse":0,"RadiusPerTick":0,"potion_contents":null,"custom_particle":null,"potion_duration_scale":null}}
```
```json
{"entity":{"area_effect_cloud":{"Radius":4.5,"Duration":200,"potion_contents":{"custom_effects":[{"id":"minecraft:speed","duration":100,"amplifier":1}]}}}}
```
```json
{"experience_orb":{"Value":7}}
```
```json
{"entity":{"experience_orb":{"Value":123}}}
```
```json
{"arrow":{"damage":2,"pickup":0}}
```
```json
{"entity":{"arrow":{"damage":5.25,"pickup":1}}}
```
```json
{"interaction":{"width":1,"height":1,"response":false}}
```
```json
{"entity":{"interaction":{"width":2.5,"height":3,"response":true}}}
```

### 只读关系视图

为保持接近 24KB 上限的村民 entity_schema 可分页，只读 team/leash 的元数据直接内联在 world.views 中，不在 entity_schema.views 重复展开。前端以视图的 readOnly 判断，不能因没有 schema 就显示写入控件。

`team` 适用全部实体，`name` 是实时 Scoreboard 中按 entity.getScoreboardName() 查出的直接队伍名或 null，不把驯服动物的继承主人队伍混为直接成员。`options` 是当前记分板的队伍名列表；`available` 表示记分板可用；`readOnly:true`。不新建/修改队伍，不使用静态队伍目录。不存在记分板时 available:false、name:null、options:[]。

`leash` 适用 Leashable，`data` 为实时 LeashData.CODEC 的 JSON（方块坐标数组或 `{UUID:[四个int]}`），无关系时 null；`readOnly:true` 和 `reason` 明确未实现关系图写入。不会把该 UUID 当作实体身份 UUID 改写。现有 WorldNbt/merge/undo 全程保护 leash，写入需另建关系事务适配，不能通过普通 NBT 降级绕过。**本轮拴绳仅读取，连接/解除尚未实现。**

只读字段无合法 edits；发送下列 edits 必须拒绝，空对象也拒绝，null 不表示允许清除关系：
```json
{"team":{"name":"red","options":["red","blue"],"available":true,"readOnly":true},"leash":{"data":[1,64,2],"readOnly":true,"reason":"Leash relationships are protected; no graph-safe write/undo adapter"}}
```
```json
{"entity":{"team":{"name":null},"leash":{"data":null}}}
```

### 验证记录

本轮新增门禁写在 EntityWorldEditTest：每个可写视图覆盖读出、合法写入、非法拒绝；只读队伍/拴绳覆盖实时读取与写入拒绝；已有 Sitting/powered/三类 size 覆盖回归断言。仅运行 compileJava、build、check，日志见 `logs/lane-entities/`。没有启动 Minecraft、客户端、专用服或实机探针；在线新主人分配的真实联网验证仍留给最终统一实机验收。

## 展示实体字段

|entity.display字段|格式与校验|
|---|---|
|transformation|Transformation.EXTENDED_CODEC：{translation:[x,y,z],scale:[x,y,z],left_rotation:[x,y,z,w],right_rotation:[x,y,z,w]}；旋转也支持 {axis:[x,y,z],angle:弧度}。支持16数矩阵表达shear；原版SVD分解保存，没有独立shear NBT字段。矩阵回读允许1e-5误差|
|billboard|实际 Display.BillboardConstraints 序列化名|
|brightness|{block:int,sky:int} 经 Brightness.CODEC；0/15探针成功，-1/16失败；null清除覆盖|
|view_range/shadow_radius/shadow_strength/width/height|有限float和实际loader回读，不伪造推荐范围|
|glow_color_override|signed int，包括原版无覆盖值|
|interpolation_duration/teleport_duration|int；teleport_duration 会clamp，显式修改未保留则拒绝，边界见探针|
|start_interpolation|int瞬时同步触发量，原版不持久化；快照从真实getter读取，副本getter验证；undo不重放触发|
|item/item_display|仅ItemDisplay：StackCodec对象/真实ItemDisplayContext枚举|
|block_state|仅BlockDisplay：BlockState.CODEC 的 {Name,Properties?}，不是lower-case属性映射|
|text|仅TextDisplay：ComponentSerialization.CODEC。原版仅ServerLevel解析文本，客户端fixture会清空；服务端验收必须独立验证|
|line_width/background|仅TextDisplay：signed int|
|alignment|仅TextDisplay：实际Align枚举|
|text_opacity|仅TextDisplay：原版signed byte -128..127；UI显示0..255时按byte转换，-1即255|
|shadow/see_through/default_background|仅TextDisplay：boolean|

## 服务端交易

world.views.trades = {available:true,offers:[...]}。非ServerLevel返回 available:false 和中文reason，不能把客户端缺失Offers当成空交易。没有服务器模组沿用UNAVAILABLE。

    {entity:{offers:[{buy:{id:'minecraft:emerald',count:2,comps:{},removed:{}},
      sell:{id:'minecraft:bread',count:3,comps:{},removed:{}},uses:0,maxUses:12,
      rewardExp:true,xp:5,priceMultiplier:0.05,demand:0,specialPrice:0}]}}

buyB可省略/null；buy/sell不可空。stack沿用StackCodec，支持 comps/removed/component_snbt，数量遵守物品实际最大堆叠。

buy/buyB额外带 cost_predicate_snbt：真实ItemCost精确组件谓词旁路。页面应保留，以防排序、改数量、默认值谓词丢失。编辑组件使旧旁路不匹配时自动失效；新谓词只约束显式patch，不把全部默认组件变成条件。ItemCost不支持移除组件谓词，明确拒绝该输入。

先用真实ItemStack/ItemCost Codec，再用 MerchantOffers.CODEC 解码完整列表，在同类型副本load/save。当前原版数值Codec使用signed int/float，不伪造uses/xp/demand上下限；要求float有限，最多256条并受消息预算。空列表补显式Offers，防止load(absent)重新生成交易；前像/undo保持该语义。普通SNBT交易修改也不能绕过正在交易检查。

## 乘客和骑乘

world.views.riding = {passengers:[{type,uuid,summary,passengers:[...]}],vehicle:{type,uuid,summary}|null,rideCheck:{mode:'try-and-report',staticCanRideList:false,reason}}。

entity_schema.views.riding也明确没有静态canRide名单：合法性依赖状态、冷却、座位、循环与原版虚方法。树最多32层；新增最多256个后代。

骑乘是独立apply，使用顶层riding，不能和snbt/entity/container/views/block_state混合：

    {riding:{action:'add',type:'minecraft:cat',entity_data:'{CustomName:"新乘客"}'}}
    {riding:{action:'remove',uuid:'乘客UUID'}}
    {riding:{action:'eject'}}
    {riding:{action:'dismount'}}

嵌入现有apply envelope。entity_data可省略；接受SNBT compound字符串或新建数据JSON compound（精确NBT类型用SNBT）。由真实EntityType工厂创建，身份/位置/运动/Passengers不可指定；玩家、不可保存类型拒绝，onlyOpCanSetNbt重复管理员校验。副本加载/保留校验后置于目标当前坐标，调用 startRiding(vehicle,false,true)，不force绕过canRide/canAddPassenger，再addFreshEntity。加入失败解除关系并丢弃新副本，错误说明原因。

remove从当前树查UUID，只解除骑乘，不删除实体；eject解除直接乘客，子树保留；dismount使当前目标离开坐骑。受影响实体/子树重复原有目标守卫（玩家拒绝、reach/chunk/area/特殊类型），全部在服务器线程并沿用revision/速率限制。

成功后更新revision并清空前像，canUndo:false。目前不支持关系图undo，避免删除已经参与世界的实体或强制骑乘。普通NBT编辑与undo不会重新实例化乘客。新增错误码 ride_rejected，其余沿用既有code。

## 动态字段与冲突

自2026-11-08采用 [world-merge-contract.md](world-merge-contract.md) 通用三方合并：全部字段均按 base/mine/current 路径比较，用户未改则保留 current。下表仅保留专门动态语义，不再是编辑活跃目标的白名单。

内部内容指纹仍保持类型保真canonical SHA-256并规范化下表字段；网络revision现在是仅open/成功保存时推进的不透明会话版本，见 [world-revision-contract.md](world-revision-contract.md)，不拿当前实体保存重新计算版本；以真实保存UUID/Pos识别实体。Passengers递归同样处理，类型/UUID/结构/非动态内容仍参与哈希。

骑乘目标的当前vehicle UUID也参与会话revision。它是服务端内部EntitySessionData标记，不向真实NBT杜撰RootVehicle，不出现在world.snbt/nbt；外部dismount/mount 在用户未改关系时保留当前关系；riding 操作仍独立并执行原版动态检查。

|字段|26.1.2依据与处理|
|---|---|
|Pos/Rotation|Entity.saveWithoutId 与移动/tick；取当前值，原始草稿主动修改仍 protected_field；可信会话原位返回另见上文|
|Motion|Entity.saveWithoutId / load 的 Vec3；未改取当前，显式编辑或撤销采用用户值，原版单轴绝对值 >10 归零|
|Air/Fire/OnGround/fall_distance/PortalCooldown|Entity保存与baseTick/移动；取当前值。兼容旧FallDistance拼写，不宣称它是26.1.2实际保存名|
|HurtTime/DeathTime/HurtByTimestamp|LivingEntity保存、伤害/死亡tick；取当前值；在线编辑主动修改 Health 时采用用户值|
|Brain（含memories）|LivingEntity Brain.Packed.CODEC与Brain tick；完整取当前值，禁止过时草稿改写|
|FallFlying/current_impulse_context_reset_grace_time/current_explosion_impact_pos/last_hurt_by_player/last_hurt_by_player_memory_time/last_hurt_by_mob|Entity/LivingEntity移动、受击记忆保存；取当前值|
|Age/ForcedAge|AgeableMob保存、aiStep朝零计数；Age哈希只保留baby/adult符号。未显式改Age时取当前，baby切换及其undo仍可写；ForcedAge取当前|
|InWaterTime/DrownedConversionTime|Zombie保存与underwater转换tick；取当前|
|active_effects[].duration/hidden_effect.duration|MobEffectInstance.tickDownDuration与Details Codec；哈希仅保留时长符号；未显式改duration时取当前。类型/放大级/结构按稳定id逐路径三方合并|
|attributes 中无永久modifier、且base精确等于实际DefaultAttributes supplier默认值的条目|真实ServerLevel僵尸走动后，AI首次读取movement_speed导致AttributeMap从空列表变成显式默认条目；两种表示在哈希中相同。非默认base、永久modifier和未知字段采用逐路径三方合并；未编辑attributes时保留当前完整列表|

证据：logs/world-entity/bytecode.log、zombie-effects-bytecode.log、text-display-bytecode.log，均为实际26.1.2 javap -p -c。不是凭旧版本猜全量字段。Health、装备、交易uses/demand、属性、变种、自定义数据和未知模组timer均参与三方合并；用户未改就保留current。

先校验会话基线revision，再以打开副本生成mine并检查只读字段，最后逐路径合并current并经真实loader校验；未改的运动/Brain 不回退。非玩家实体走出当前交互距离时可按可信原位锚点返回，仍检查原位距离、两端区块及区域；骑乘独立操作不放宽当前距离，玩家不走返回路径。

## 验证与边界

- tools/world-edit/verify-entity.ps1：独立javac编译全源/测试，EntityWorldEditTest、WorldEditTest、EntitySchemaTest、EntitySchemaDetailsTest；日志logs/world-entity/，不启动游戏或Gradle。
- captured-jvm.json：真实工厂六部位姿态、两种展示框、画、三种display、猫骑僵尸、交易Codec。detached-real-factory不是ServerLevel或网络回执。
- EntityWorldEditServerProbe与probe-entity-server.ps1：仅测试模块、新建scratch专用服；采集ServerLevel交易与文本、十个真实tick的僵尸运动/改名、Health冲突。发现用户客户端则延期（明确带editor.autotest标识的独立自动验收进程不冒充用户会话）；成功必须有captured-server.json的passed:true。
- 真实页面apply、网络同步、多人并发、无模组远程服、第三方保护插件仍须单独实机验证；JVM守卫不代替这些。关系图undo明确不支持。

## 2026-11-07 真实专用服捕获摘录

本轮最终门禁：javac全源/测试、EntityWorldEditTest（59 checks）、WorldEditTest（420 checks）、EntitySchemaTest（814 assertions）、EntitySchemaDetailsTest（1661 assertions）通过；真实独立ServerLevel探针passed:true；完整Gradle build通过（含server/client schema gates），输出见logs/world-entity/gradle-build.log。未启动第二个用户客户端、未操作用户窗口或存档；真实客户端页面/网络同步仍pending。

|功能|后端支持|验证范围|
|---|---|---|
|实体动态revision/current值合并|支持|真实tick僵尸运动改名、Health冲突；年龄/效果计数/default属性实例JVM回归|
|盔甲架六部位/五标志/装备|支持|JVM六部位及边界；ServerLevel副本姿态|
|乘客树/add/remove/eject/dismount|支持；关系图undo不支持|真实原版猫骑僵尸、容量/循环与解除关系；完整ServerPlayer请求路径待网络验收|
|村民/流浪商人交易|支持；仅ServerLevel|两类真实ServerLevel对象读写/清空/前像恢复；非ServerLevel拒绝|
|展示框/荧光展示框/画|支持|JVM规范化加载/边界/画注册表；ServerLevel展示框样本|
|Item/Block/Text Display|支持|JVM变换/矩阵shear/亮度与字段；真实ServerLevel文本解析和boolean样式JSON|

权限、距离、区块和保护沿用既有路由；本轮新增类型/数值/slot/关系守卫有回归，但这些不等价于带真实联网玩家的逐操作权限和第三方领地验收。

来源：logs/world-entity/captured-server.json，mode=real-dedicated-ServerLevel，passed=true。独立scratch世界，不是网络/页面回执。完整类型保真SNBT和UUID保留在原始回执。

十个真实实体tick的僵尸运动；改名后的坐标严格等于提交时当前坐标：

    before: [0.5d,65.0d,0.5d]
    current: [1.615880708714029d,65.0d,0.5d]
    after: [1.615880708714029d,65.0d,0.5d]

armor_stand 的真实normalized视图：

    {"pose":{"Head":[15.0,25.0,35.0],"Body":[0.0,0.0,0.0],"LeftArm":[-90.0,0.0,0.0],"RightArm":[-15.0,0.0,10.0],"LeftLeg":[-1.0,0.0,-1.0],"RightLeg":[1.0,0.0,1.0],"Marker":false,"Small":true,"ShowArms":true,"Invisible":false,"NoBasePlate":true},"riding":{"passengers":[],"vehicle":null,"rideCheck":{"mode":"try-and-report","staticCanRideList":false,"reason":"canRide/canAddPassenger 动态检查"}}}

item_frame 的真实normalized视图：

    {"item_frame":{"Fixed":true,"Invisible":true,"ItemDropChance":0.5,"ItemRotation":3,"item":{"id":"minecraft:diamond","count":1,"comps":{},"removed":{},"slot":{},"label":""}},"riding":{"passengers":[],"vehicle":null,"rideCheck":{"mode":"try-and-report","staticCanRideList":false,"reason":"canRide/canAddPassenger 动态检查"}}}

text_display 的真实normalized视图：

    {"display":{"glow_color_override":-1,"view_range":1.0,"shadow_strength":1.0,"transformation":{"left_rotation":[0.0,0.0,0.0,1.0],"translation":[1.0,2.0,3.0],"right_rotation":[0.0,0.0,0.0,1.0],"scale":[1.0,1.0,1.0]},"teleport_duration":0,"width":0.0,"interpolation_duration":20,"shadow_radius":0.0,"height":0.0,"billboard":"fixed","brightness":null,"start_interpolation":5,"text_opacity":-1,"see_through":true,"line_width":120,"default_background":false,"text":{"text":"Server text","bold":true},"background":-16777216,"shadow":true,"alignment":"left"},"riding":{"passengers":[],"vehicle":null,"rideCheck":{"mode":"try-and-report","staticCanRideList":false,"reason":"canRide/canAddPassenger 动态检查"}}}

cat_riding_zombie 的真实normalized视图：

    {"riding":{"passengers":[{"type":"minecraft:cat","uuid":"958a3ecd-5b32-4839-bde8-e58548def952","summary":"Cat","passengers":[]}],"vehicle":null,"rideCheck":{"mode":"try-and-report","staticCanRideList":false,"reason":"canRide/canAddPassenger 动态检查"}}}

entity.minecraft.villager 的真实normalized视图：

    {"trades":{"available":true,"offers":[{"buy":{"id":"minecraft:emerald","count":2,"comps":{},"removed":{},"slot":{},"label":"","cost_predicate_snbt":"{}"},"sell":{"id":"minecraft:bread","count":3,"comps":{},"removed":{},"slot":{},"label":""},"uses":3,"maxUses":12,"rewardExp":true,"xp":5,"priceMultiplier":0.05,"demand":0,"specialPrice":0}]},"riding":{"passengers":[],"vehicle":null,"rideCheck":{"mode":"try-and-report","staticCanRideList":false,"reason":"canRide/canAddPassenger 动态检查"}}}

## P3-3 矿车、船与村民

### 已有通用 schema（不重复新增控件）

下列字段继续使用 `entity_schema` 的 variants / extras 及已有 SNBT 编辑通路，真实保存类型、存储范围和 loader probes 以当前 schema 为准。不要把原始 NBT 字段提交到不存在的 `entity.furnace`、`entity.villager` 等区段。

|适用实体|已有字段与来源|
|---|---|
|熔炉矿车|Fuel：真实 short；PushX / PushZ：有限 double；extras 来自实际 save/load 探针|
|TNT 矿车|`fuse`：真实 signed int；26.1.2 不再使用旧名 `TNTFuse`|
|刷怪笼矿车|Delay / MinSpawnDelay / MaxSpawnDelay / SpawnCount / MaxNearbyEntities / RequiredPlayerRange / SpawnRange：真实 short；复用 extras，不推断额外游戏范围。SpawnData 等复杂结构保持高级原始 NBT，本轮不新增结构化刷怪实体编辑器|
|命令方块矿车|TrackOutput：保存 byte boolean，使用已有 extras；不要提交到 minecart_command|
|村民、僵尸村民|VillagerData.type：`minecraft:villager/variant`；VillagerData.profession：`villager/profession`；VillagerData.level：`villager/level`。候选来自实时 VillagerType / VillagerProfession 注册表，等级来自 VillagerData.MIN_VILLAGER_LEVEL / MAX_VILLAGER_LEVEL 并逐值真实加载验证|
|村民、僵尸村民|`Xp`：独立的真实 signed int extras，不是 VillagerData.xp，也不是交易 offers[].xp|

通用 schema 暴露的 ConversionTime 原始探针不应生成额外可写转化控件；该功能的页面采用下面的只读 zombie_conversion。现有 trades/offers 协议保持不变。

### 新增视图

|视图 / edits|适用实体|字段、类型、范围与 null 语义|
|---|---|---|
|vehicle_container / entity.vehicle_container|实现 ContainerEntity 的箱子矿车、漏斗矿车、箱船、箱筏|视图 size 为真实 getContainerSize()；unresolved_loot 为只读 boolean；slots 为 `{slot,stack}` 数组。edits 仅接受 slots，slot 为 0..size-1 的整数，不重复；stack 为完整 StackCodec，`{empty:true}` 清空。所有 null 拒绝，未提交槽保持原内容|
|minecart_display / entity.minecart_display|全部 AbstractMinecart|DisplayState：BlockState.CODEC `{Name,Properties?}` 或 null（清除自定义方块）；DisplayOffset：signed int 或 null（恢复该实体 getDefaultDisplayOffset()）。显式提交默认偏移会正规化为删除该可选 NBT 键；CustomDisplayTile 是只读派生 boolean，表示 DisplayState 是否存在，26.1.2 没有同名持久化键|
|minecart_command / entity.minecart_command|命令方块矿车|Command：严格 string，空串允许，null 拒绝；LastOutput：只读 Component JSON 或 null（没有输出），不允许 edits|
|boat_type（无合法 edits）|Boat / ChestBoat / Raft / ChestRaft，共同基类 AbstractBoat|entityType：实时实体类型注册表 ID；readOnly:true。木材和船/筏类别由实体类型决定，放置后不通过 NBT 换类型|
|zombie_conversion（无合法 edits）|僵尸村民|ConversionTime：保存 int；ConversionPlayer：原版 UUID NBT 的四 int 数组或 null；readOnly:true。不允许修改计时或转化玩家，null 也不表示清除|

只读 boat_type / zombie_conversion 元数据内联于 world.views，不重复加入 entity_schema.views，避免扩大村民 schema 分页预算。其它新视图的规格由 `schema` / `entity_schema.views` 给出。DisplayState 的方块与 Properties 来自实时 block 注册表及 StateDefinition，复用 block_properties；未知方块、未知属性和值拒绝。

车辆容器沿用项目的 `{slot,stack}` 和 StackCodec 组件/移除 patch 格式；堆叠上限和可放入性来自真实容器。检查库存不展开 LootTable，unresolved_loot:true 时 slots:[] 表示尚不可读，不代表空库存；任何库存 edits 都拒绝，须先在游戏中打开容器。库存修改在分离实体副本完成，并再次用真实实体 loader 校验每个栈；最终所有修改仍通过 EntityWorldEdit 的分离实体加载/保留校验及 WorldNbt.protect。未知区段/字段、错误目标类型、null、小数槽号、越界/重复槽号、无效栈、原版未保留请求值均拒绝，错误沿用实体编辑的参数错误 / invalid_nbt 映射。

视图示例（容量和类型取本次真实返回值；slots 实际列出每个槽）：
```json
{"vehicle_container":{"size":5,"unresolved_loot":false,"slots":[{"slot":0,"stack":{"id":"minecraft:diamond","count":2,"comps":{},"removed":{}}},{"slot":1,"stack":{"empty":true}},{"slot":2,"stack":{"empty":true}},{"slot":3,"stack":{"empty":true}},{"slot":4,"stack":{"empty":true}}]}}
```
Edits 示例：
```json
{"entity":{"vehicle_container":{"slots":[{"slot":4,"stack":{"id":"minecraft:diamond","count":2,"comps":{},"removed":{}}},{"slot":0,"stack":{"empty":true}}]}}}
```
```json
{"minecart_display":{"CustomDisplayTile":false,"DisplayState":null,"DisplayOffset":6}}
```
```json
{"entity":{"minecart_display":{"DisplayState":{"Name":"minecraft:oak_log","Properties":{"axis":"x"}},"DisplayOffset":12}}}
```
```json
{"entity":{"minecart_display":{"DisplayState":null,"DisplayOffset":null}}}
```
```json
{"minecart_command":{"Command":"say hello","LastOutput":null}}
```
```json
{"entity":{"minecart_command":{"Command":"say hello"}}}
```
```json
{"boat_type":{"entityType":"minecraft:bamboo_chest_raft","readOnly":true,"reason":"Wood and boat/raft kind are determined by entity type"}}
```
```json
{"zombie_conversion":{"ConversionTime":-1,"ConversionPlayer":null,"readOnly":true}}
```
以下只读 edits 均拒绝：
```json
{"entity":{"boat_type":{},"zombie_conversion":{"ConversionTime":100},"minecart_command":{"LastOutput":null}}}
```

门禁：独立 `EntityVehicleViewTest` / JavaExec `entityVehicleViewTest` 挂到 check，覆盖真实读取、合法写入、错误实体类型、未知字段、null、容量末槽及越界、完整组件往返、只读拒绝、未展开战利品拒绝及已有 schema 覆盖回归。验证日志在 `logs/lane-vehicle/`；不启动 Minecraft、客户端或服务器探针。


## P3-1 马与羊驼

已有通用 schema 覆盖：`minecraft:horse/variant`（马颜色）与 `horse/markings`（斑纹）使用真实 enum/setter 探测 `Variant` packed int 及 mask；`minecraft:llama/variant` 使用真实数据组件枚举；`llama/strength` 使用 setter 端点和逐值 load/save 探测 `Strength`（26.1.2 为 1..5）。继续用 variants 的保存路径/值，不新增重复写入字段。`equipment` 已通过真实实体保存探测鞍/身体槽路径，26.1.2 为 `equipment.saddle` / `equipment.body`，不使用旧 `SaddleItem` / `ArmorItem`。

### 可写视图

`world.views.horse` / `entity_schema.views.horse` 适用全部 AbstractHorse：马、驴、骡、骷髅马、僵尸马、羊驼、行商羊驼、骆驼及继承此基类的实体。`world.views.chested` / `entity_schema.views.chested` 仅 AbstractChestedHorse（驴、骡、羊驼、行商羊驼）。分别写入 `entity.horse`、`entity.chested`。

|视图|字段|类型、范围与 null 语义|
|---|---|---|
|horse|Tame|严格 boolean；null 拒绝|
|horse|Temper|实际保存 int，Java signed int（-2147483648..2147483647）；原版 setTemper/load 不 clamp，不将 getMaxTemper 的玩法阈值当成存储范围；null 拒绝|
|horse|Owner|规范 UUID 字符串或 null，经 EntityReference.codec()；只能新设提交时在线的玩家，原有离线主人允许原样保留；null 删除 Owner。马的 Tame 与 Owner 在原版独立保存，清除 Owner 保留 Tame；如需解除驯服，另发 Tame:false|
|chested|ChestedHorse|严格 boolean；null 拒绝|
|chested|Items|完整列表替换，`[{slot:int,stack:StackCodec}]`；slot 从 0 起，必须小于提交数据加载后真实 getInventorySize()，不得重复；stack 非空，保留组件/移除 patch/类型旁路。省略某槽即清空该槽，`[]` 清空整个箱子；null 拒绝|

未提交字段保留原值。`horse.players` 为当前服务器 PlayerList 的 `{uuid,name}` 在线候选（跨维度），`available` 表示服务器列表可用；没有服务器时为 false 和空列表，不接受离线新主人。`chested.capacity` 是实时容器容量，只读；羊驼容量随 Strength 改变。Strength 通过现有 schema/NBT 提交，与 chested 在同一次 apply 内按修改后的容量校验。减小 Strength 或关闭箱子会丢弃旧物品时拒绝；应同次提交合法 Items 替换，拆除非空箱子须显式 `Items:[]`。

### 鞍与身体装备

继续用已有 `world.equipment` 栈视图和 `entity.equipment:[{slot,stack}]` 写入，`stack` 使用完整 StackCodec，`{empty:true}` 清空。`world.views.horse.equipment` 是这一路由的只读元数据：每行含 `slot`、`nbtPath`、`canHold`、`options` 和 `allowManual:true`，不作为 horse 可写字段。`canHold` 来自当前实体 `canUseSlot`（包含真实子类覆盖，不能统一假设所有马都要求先驯服；AbstractHorse 基类会检查鞍的 Tame/年龄等状态）；候选遍历实时 item 注册表并调用 `isEquippableInSlot`，提交时对实际组件栈再次校验，允许手动输入具备合法组件的物品。不会硬编码马铠或地毯目录。可在同次请求先设 Tame:true，再装备 saddle；全部装备写入仍在分离副本上进行并重新 load/save 校验。

所有未知字段、错误实体类型、错误 JSON 类型、整数越界、非法/重复槽、未知物品、Codec 错误、不适配装备和原版未保留请求值均拒绝，沿用 invalid_nbt/参数错误映射。所有 readOnly 元数据均不可回写；UUID、位置与骑乘关系保护不变，骑乘仍用独立 riding 协议。

视图示例（options 仅示意，实际以实时探测为准）：
```json
{"horse":{"Tame":true,"Temper":20,"Owner":null,"players":[],"available":true,"equipment":[{"slot":"saddle","nbtPath":"equipment.saddle","canHold":true,"options":["minecraft:saddle"],"allowManual":true}]},"chested":{"ChestedHorse":true,"capacity":3,"Items":[{"slot":2,"stack":{"id":"minecraft:diamond","count":2,"comps":{},"removed":{}}}]}}
```
Edits 示例：
```json
{"entity":{"horse":{"Tame":true,"Temper":20,"Owner":null},"equipment":[{"slot":"saddle","stack":{"id":"minecraft:saddle","count":1,"comps":{},"removed":{}}}]}}
```
```json
{"entity":{"chested":{"ChestedHorse":true,"Items":[{"slot":0,"stack":{"id":"minecraft:diamond","count":2,"comps":{},"removed":{}}}]}}}
```
```json
{"entity":{"chested":{"ChestedHorse":false,"Items":[]}}}
```

### 验证记录

`EntityHorseViewTest` 的 212 项检查已通过，使用真实原版实体工厂、Codec 和 load/save 覆盖八类实体读取/合法写入/非法拒绝、装备兼容性、离线旧主人保留/清空、箱子容量边界、Strength 增减及物品不静默丢失。装备检查从当前依赖 JAR 加载真实 entity_type 标签，不使用测试白名单。通过 `entityHorseViewTest` JavaExec 挂到 check。字节码依据及 build/check 日志在 `logs/lane-horse/`；未启动 Minecraft、客户端、服务器或实机探针。在线新主人分配的联网验证留待最终统一实机验收。
