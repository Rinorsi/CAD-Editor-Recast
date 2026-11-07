# 世界实体编辑增量协议（26.1.2）

2026-11-07。补充 world-edit-contract.md，覆盖其中“实体全部NBT变化都冲突”的历史限制。方块协议由 world-block-edit.md 负责。原有 open/apply/undo、slot/token/revision、权限、交互距离、已加载区块、边界与保护、500ms速率限制和压缩预算保持。

## 消息和视图

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

revision保持类型保真canonical SHA-256，但实体预先剔除下表tick字段；以真实保存UUID/Pos识别实体。Passengers递归同样处理，类型/UUID/结构/非动态内容仍参与哈希。

骑乘目标的当前vehicle UUID也参与会话revision。它是服务端内部EntitySessionData标记，不向真实NBT杜撰RootVehicle，不出现在world.snbt/nbt；外部dismount/mount仍会target_changed。

|字段|26.1.2依据与处理|
|---|---|
|Pos/Motion/Rotation|Entity.saveWithoutId 与移动/tick；取当前值，草稿相对打开时的主动修改仍protected_field|
|Air/Fire/OnGround/fall_distance/PortalCooldown|Entity保存与baseTick/移动；取当前值。兼容旧FallDistance拼写，不宣称它是26.1.2实际保存名|
|HurtTime/DeathTime/HurtByTimestamp|LivingEntity保存、伤害/死亡tick；取当前值；Health仍严格冲突|
|Brain（含memories）|LivingEntity Brain.Packed.CODEC与Brain tick；完整取当前值，禁止过时草稿改写|
|FallFlying/current_impulse_context_reset_grace_time/current_explosion_impact_pos/last_hurt_by_player/last_hurt_by_player_memory_time/last_hurt_by_mob|Entity/LivingEntity移动、受击记忆保存；取当前值|
|Age/ForcedAge|AgeableMob保存、aiStep朝零计数；Age哈希只保留baby/adult符号。未显式改Age时取当前，baby切换及其undo仍可写；ForcedAge取当前|
|InWaterTime/DrownedConversionTime|Zombie保存与underwater转换tick；取当前|
|active_effects[].duration/hidden_effect.duration|MobEffectInstance.tickDownDuration与Details Codec；哈希仅保留时长符号；未显式改duration时取当前。类型/放大级/结构等仍严格冲突|
|attributes 中无永久modifier、且base精确等于实际DefaultAttributes supplier默认值的条目|真实ServerLevel僵尸走动后，AI首次读取movement_speed导致AttributeMap从空列表变成显式默认条目；两种表示在哈希中相同。非默认base、永久modifier和未知字段仍严格冲突；未编辑attributes时保留当前完整列表|

证据：logs/world-entity/bytecode.log、zombie-effects-bytecode.log、text-display-bytecode.log，均为实际26.1.2 javap -p -c。不是凭旧版本猜全量字段。不忽略Health、装备、交易uses/demand、属性、变种、自定义数据；未知模组timer仍可能target_changed。

先检查当前/打开时稳定revision，再以打开数据检查只读字段防篡改，最后合并当前动态值；undo也不回退运动/Brain。实体走出当前交互距离仍out_of_reach，不因Pos忽略而绕过保护。

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

