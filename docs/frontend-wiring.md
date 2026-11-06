# 前端接线手册（Minecraft 26.1.2）

本文按当前 Java 实现说明页面接线，不以 COVERAGE 中旧的“尚未导出”清单判断能力。所有候选都要保留手动输入，未知 ID、错误页、服务器未同步、资源包为空，都不能清空草稿。所有请求仅限本地 Oriel 页面；不是向远程服务器开放的网页 API。

## 0. 消息与分页通用规则

```js
oriel.on('patch', function (p) {
  if (p.key === 'registry.item_meta_one') acceptPage(p.value);
  if (p.key === 'validate_component.result') acceptValidation(p.value);
});
oriel.send('registry', {name: 'item_meta_one', id: 'minecraft:chest'});
```

上面的 key 是**顶层字面键**，包括冒号、斜线、句点；不要按点拆对象。registry 回复通常在 `registry.<请求 name>`，字段如下：

| 字段 | 意义 |
|---|---|
| version | 当前为 1 |
| generation | 不透明字符串；世界、标签、资源或语言变化会失效；实体请求是 entity-递增号 |
| name | 来源名；热缓存回复可能是 minecraft:item 而请求为 item，关联优先看 patch.key |
| offset / total / entries / done | 以条目为单位的偏移、总量、本页数组、是否最后一页 |
| id / field | 单件、标签或关系请求的关联信息（如果该路由支持） |
| error | 非法 ID、未知枚举/注册表、采集/Codec/条目过大等可读错误；一般空 entries、total:0、done:true |
| availability / source / reason | 补充数据的可用性、来源与原因；未提供这些字段不表示不可用 |

每页 ≤24000 UTF-16 字符（含信封）；初始索引目标 20000。服务器主动连续推送全部页，**没有 offset/limit 翻页请求**。以 patch.key + id + field + generation 分桶，按 offset 放入条目；等全部区间齐全后发布，不能只看最后一次 patch，也不能把一个条目的引用截断。实体和 item_meta 单行过大直接错误，不交付截断内容。初始全量推送与主动请求可能交错。

registry 请求 JSON ≤8192 字符、name ≤247 字符。非对象、缺少/错误类型 name、超限、serverSession 会被忽略，可能**没有回复**。某些路由离开世界/预热未就绪时也不回复；页面需要超时提示和重试，不能把超时等同于空注册表。预热等待最多64请求，交互发送队列最多64批，重复请求合并；不要每帧请求。

补充索引和资源索引共享同代64项缓存、最多8项在途；超限返回 error。发送全局每 tick 最多8页、2ms软预算（单页运行不可抢占）。item_meta、entity_info 等不是按此缓存预算做限流，仍应由页面按需查询并缓存，禁止键入每个字符就请求全表。

远程专服没有集成服务器时，loot_table/recipe 的正常回复为 availability:"unavailable"、source:"remote_server"、reason、空数组；trim_patterns 保留图案而模板关联不可用。它们与完整空列表不同。普通注册表、枚举、标签使用当前客户端可见数据；缺失注册表/标签返回 error，**不会统一转换成 unavailable**。entity_info/spawner_info 无世界时尝试产生错误页，但当前桥只在有世界的 tick 推送，离开世界后不保证收到；前端以会话关闭/超时处理。

真实远程降级页（Java 调用 RegistrySupplement.unavailable + 正式分页器，本轮回执）：

```json
{"source":"remote_server","availability":"unavailable","reason":"服务器未向客户端同步完整列表，请手动输入 ID","version":1,"generation":"wiring-test","name":"minecraft:loot_table","offset":0,"total":0,"entries":[],"done":true}
```

## 1. validate_component：只读 Codec 预检

```js
oriel.send('validate_component', {
  requestId: 'edit-7', component: 'minecraft:custom_data',
  format: 'snbt', snbt: '{example:1b}'
});
// JSON: {requestId:'edit-8', component:'damage', format:'json', value:12}
```

回复顶层字面键 validate_component.result，无分页。requestId 原样回传任意 JSON primitive（建议字符串），用于丢弃过期输入的结果。请求字段：

| 字段 | 规则 |
|---|---|
| component | 必填组件 ID；minecraft 命名空间可省，模组组件用完整 ID |
| format | 可选 json / snbt；有 snbt 字段默认 snbt，否则 json |
| value | JSON 值；format:snbt 时也可以是 SNBT 字符串 |
| snbt | SNBT 字符串快捷字段；若 value 与 snbt 同时提供，实际优先 snbt，不要同时传 |

成功：ok:true、component（完整 ID）、format、normalized（与输入格式同形）、snbt（完整规范化字符串）、json（真实 Codec 编码的 JSON）。失败：ok:false、error（最多2000字符），normalized/snbt/json 删除；component/format 可能缺失。只接受有持久化 Codec 的组件。这里的 ok 不代表物品整体有效、刷怪器附加检查通过、权限允许或服务器已保存。

通道限制每个 DocumentDriver 每个整秒窗口最多20次；请求序列化长度 ≤8192，SNBT 本文也≤8192；规范化输出在加 ok 前检查 ≤23980 字符。超频/超长/无世界回复 ok:false + error（无稳定 code）。建议输入停止后 debounce，请求带递增 requestId。

真实成功/失败回执：

```json
{"requestId":"wiring-snbt","component":"minecraft:custom_data","format":"snbt","snbt":"{byte:1b,long:9007199254740993L}","json":{"byte":1,"long":9007199254740993},"normalized":"{byte:1b,long:9007199254740993L}","ok":true}
```
```json
{"requestId":"wiring-snbt","component":"wiring_test:missing","ok":false,"error":"未知组件：wiring_test:missing"}
```

## 2. component_formats / component_snbt 与 apply

它们都是**物品对象的字段**，不存在名为 component_formats 的 registry 请求。apply 的 payload 就是物品对象本身，不能包一层 item；基于宿主提供的 slot、id、count、comps、removed 构建，另加唯一 requestId。宿主会补服务端 baseline，不允许用客户端预检替代服务端校验。

```json
{"id":"minecraft:paper","count":1,"comps":{"custom_data":"{byte:1b,long:9007199254740993L}"},"removed":{},"slot":{},"label":"","component_formats":{"custom_data":"snbt"}}
```

以上真实测试物品字段示例省去了页面运行时的 requestId；slot:{} 仅是无世界 Codec 测试夹具，页面必须保留宿主给的实际 slot。发送形式：oriel.send('apply', Object.assign({}, draft, {requestId: nextId}))。

| 字段 | 用法 |
|---|---|
| comps | **覆盖 patch**，不是默认组件全表。minecraft: 前缀可省；自定义命名空间保留 |
| removed | 显式移除的组件键→1；不能与 comps 同时包含同一组件 |
| component_formats | 组件键→"snbt"；仅 SNBT 标记合法。对应 comps 值必须是字符串且键必须存在。格式标记与 comps 使用完全相同的短/完整键 |
| component_snbt | 组件键→原始规范化 SNBT；是 JSON 快照的类型保真 sidecar，不是让 JSON 文本自动当 SNBT 的标记 |

**必须带 component_formats 的场合**：把 validate 的 snbt/normalized SNBT 放进 comps；高级 SNBT 编辑；复制 item_defaults 中已声明 snbt 的组件值。JSON 模式 comps 是真实 JSON 值，不要带该组件的 snbt 格式标记；特别是 JSON 文本组件本身可能是字符串，不能只看值类型判断格式。

snapshot 的 comps 是 JSON，component_snbt 保存每个持久化覆盖组件的精确 NBT 编码；通常没有 component_formats。原样保留并随草稿带回，可保住 byte/short/long/数组类型。JSON 改变后，旧 sidecar 与 JSON 不匹配时后端会忽略它；编辑器仍应删除被编辑组件的旧 sidecar，以避免解析旧数据失败。显式 component_formats 的 SNBT 优先。切换回 JSON 时删除格式标记；移除组件时同步删除其格式和 sidecar。不要把 snapshot.component_snbt 直接整体复制成 component_formats。

真实快照：

```json
{"id":"minecraft:paper","count":1,"comps":{"custom_data":{"byte":1,"long":9007199254740993}},"component_snbt":{"custom_data":"{byte:1b,long:9007199254740993L}"},"removed":{},"slot":{},"label":""}
```

apply 最终回执在顶层 result（不是 validate_component.result）；status:saved / rejected 等，rejected 带 requestId/code/reason，保留草稿。当前通用 Codec 与刷怪器附加校验错误 code 是 invalid_request，不存在 spawner_range 等专用错误码。

apply 还受 Oriel 页面消息默认8192字符、模组网络32767字符限制；按较小的实际限制处理，不以 registry 的24000字符回包预算作为可提交大小。StackCodec 允许 count 1..99，仍须≤该物品实际最大堆叠；comps+removed最多256项。

## 3. item_meta / item_meta_one：物品事实替换静态表

请求 oriel.send('registry', {name:'item_meta'}) 获取全表；单件 {name:'item_meta_one', id:'minecraft:chest'}。回复 registry.item_meta / registry.item_meta_one，单件每页带 id。全表的 id 参数不作筛选，必须使用 _one。世界/资源重载后失效；未知单件回空页+error，无法构造特定方块实体时该行可能只带 metadata_error。

| 条目字段 | 类型/含义 | 替换前端 |
|---|---|---|
| id | 完整物品 ID | ikind 的索引键 |
| tool | boolean，默认组件含 TOOL | 工具类别判定 |
| weapon | boolean，默认含 WEAPON / KINETIC_WEAPON / PIERCING_WEAPON | 近战/武器入口，不猜 _sword 后缀 |
| ranged_weapon | boolean，ProjectileWeaponItem 子类 | 弓/弩等远程武器类别 |
| food / consumable | boolean，默认 FOOD / CONSUMABLE 是否存在 | 食物/消耗物类别；两者不等价 |
| equipment_slot | 可选序列化槽名，来自 EQUIPPABLE | 可穿戴入口 |
| armor_slot | 可选槽名，同时具装备组件和护甲属性修饰符 | 衣服槽/盔甲类别；玩家头颅不是护甲 |
| block_item / block | boolean / 可选完整方块 ID | 方块类别和 block_properties 的查询键 |
| block_entity_type | 可选方块实体类型完整 ID | 刷怪器/容器等专页选择依据 |
| container_size | 可选真实 Container 大小，或篝火物品列表大小 | SLOT_COUNT；缺失不是0，不按物品名称补表 |
| spawn_egg_entity | 可选默认蛋对应实体 ID | 蛋分类/默认实体，不靠蛋名推实体名 |
| bundle | boolean，BundleItem 或有 BUNDLE_CONTENTS | 收纳袋分类 |
| bundle_capacity | 可选 {numerator,denominator} 归一化重量分数 | 收纳袋重量总容量，不是任意物品格数 |
| bundle_capacity_source | 可选 minecraft:bundle_contents | 原版插入规则的来源标识 |
| bundle_reference_item / bundle_reference_count | 可选参考物品 ID / 饱和插入数量 | 解释容量，不是对所有物品统一限64 |
| metadata_error | 可选读取失败原因 | 展示未知，不伪造槽数 |

这些事实可重叠，没有唯一 kind 字段。分类优先级属于页面产品规则；保留多能力入口。盔甲、工具、武器、食物同时存在时不应丢组件。书、药水、烟花、地图等可继续依据 item_defaults 的组件判定，不能从本接口期待完整 ikind 字符串。

真实元信息（当前注册表测试摘取）：

```json
[{"id":"minecraft:chest","tool":false,"weapon":false,"food":false,"consumable":false,"ranged_weapon":false,"block_item":true,"block":"minecraft:chest","block_entity_type":"minecraft:chest","container_size":27,"bundle":false},{"id":"minecraft:bundle","tool":false,"weapon":false,"food":false,"consumable":false,"ranged_weapon":false,"block_item":false,"bundle":true,"bundle_capacity":{"numerator":1,"denominator":1},"bundle_capacity_source":"minecraft:bundle_contents","bundle_reference_item":"minecraft:stone","bundle_reference_count":64},{"id":"minecraft:pig_spawn_egg","tool":false,"weapon":false,"food":false,"consumable":false,"ranged_weapon":false,"block_item":false,"spawn_egg_entity":"minecraft:pig","bundle":false},{"id":"minecraft:diamond_chestplate","tool":false,"weapon":false,"food":false,"consumable":false,"ranged_weapon":false,"equipment_slot":"chest","armor_slot":"chest","block_item":false,"bundle":false},{"id":"minecraft:player_head","tool":false,"weapon":false,"food":false,"consumable":false,"ranged_weapon":false,"equipment_slot":"head","block_item":true,"block":"minecraft:player_head","block_entity_type":"minecraft:skull","bundle":false},{"id":"minecraft:crossbow","tool":false,"weapon":false,"food":false,"consumable":false,"ranged_weapon":true,"block_item":false,"bundle":false}]
```

## 4. 29 个生物变种组件

统一请求 oriel.send('registry', {name: 下表请求名})，回复字面键 registry.<该请求名>，条目 {id,name}，枚举另有 symbol、颜色另有 rgb。写组件时写 id；不能把 Java symbol 或实体 Variant 数字写入组件。

| 组件 | 请求 name |
|---|---|
| cat/variant | minecraft:cat_variant |
| cat/sound_variant | minecraft:cat_sound_variant |
| wolf/variant | minecraft:wolf_variant |
| wolf/sound_variant | minecraft:wolf_sound_variant |
| chicken/variant | minecraft:chicken_variant |
| chicken/sound_variant | minecraft:chicken_sound_variant |
| cow/variant | minecraft:cow_variant |
| cow/sound_variant | minecraft:cow_sound_variant |
| frog/variant | minecraft:frog_variant |
| pig/variant | minecraft:pig_variant |
| pig/sound_variant | minecraft:pig_sound_variant |
| villager/variant | minecraft:villager_type |
| zombie_nautilus/variant | minecraft:zombie_nautilus_variant |
| painting/variant | minecraft:painting_variant（或 painting_variants） |
| axolotl/variant | enum:axolotl_variant |
| horse/variant | enum:horse_variant |
| llama/variant | enum:llama_variant |
| mooshroom/variant | enum:mooshroom_variant |
| fox/variant | enum:fox_variant |
| rabbit/variant | enum:rabbit_variant |
| parrot/variant | enum:parrot_variant |
| tropical_fish/pattern | enum:tropical_fish_pattern |
| salmon/size | enum:salmon_size |
| cat/collar、wolf/collar、sheep/color、shulker/color、tropical_fish/base_color、tropical_fish/pattern_color | enum:dye_color |

每类的真实首条响应摘录（不是候选常量表）：

```json
{"cat_variant":{"id":"minecraft:all_black","name":"minecraft:all_black"},"cat_sound_variant":{"id":"minecraft:classic","name":"minecraft:classic"},"wolf_variant":{"id":"minecraft:ashen","name":"minecraft:ashen"},"wolf_sound_variant":{"id":"minecraft:angry","name":"minecraft:angry"},"chicken_variant":{"id":"minecraft:cold","name":"minecraft:cold"},"chicken_sound_variant":{"id":"minecraft:classic","name":"minecraft:classic"},"cow_variant":{"id":"minecraft:cold","name":"minecraft:cold"},"cow_sound_variant":{"id":"minecraft:classic","name":"minecraft:classic"},"frog_variant":{"id":"minecraft:cold","name":"minecraft:cold"},"pig_variant":{"id":"minecraft:cold","name":"minecraft:cold"},"pig_sound_variant":{"id":"minecraft:big","name":"minecraft:big"},"villager_type":{"id":"minecraft:desert","name":"minecraft:desert"},"zombie_nautilus_variant":{"id":"minecraft:temperate","name":"minecraft:temperate"},"painting_variant":{"id":"minecraft:alban","name":"Albanian","search_key":"albanian minecraft:alban"},"enum:axolotl_variant":{"id":"lucy","name":"lucy"},"enum:horse_variant":{"id":"white","name":"white"},"enum:llama_variant":{"id":"creamy","name":"creamy"},"enum:mooshroom_variant":{"id":"red","name":"red"},"enum:fox_variant":{"id":"red","name":"red"},"enum:rabbit_variant":{"id":"brown","name":"brown"},"enum:parrot_variant":{"id":"red_blue","name":"red_blue"},"enum:tropical_fish_pattern":{"id":"kob","name":"kob"},"enum:salmon_size":{"id":"small","name":"small"},"enum:dye_color":{"id":"white","name":"白色","rgb":16383998}}
```

同步注册表缺失回 error，非注册表变种读官方枚举；服务器未同步内容不能从原版静态表补成“完整”。模组组件仍可手输并调用 validate_component。

## 5. 纹饰原料与模板

请求 {name:'trim_materials'} / {name:'trim_patterns'}，回复 registry.trim_materials / registry.trim_patterns。材料也可用 trim_material / minecraft:trim_material，图案也可用 trim_pattern / minecraft:trim_pattern；key 始终按请求名。

材料条目 id/name/ingredients:[物品ID]；兼容 ingredient 是实际数组首项，无原料则省略。来自物品 PROVIDES_TRIM_MATERIAL 的反向关联，不是材料名拼物品名。

图案条目 id/name/template_items:[物品ID]/template_status；兼容 template_item 为首项，无项则省略。集成服通过真实 SmithingTrimRecipe 合并所有模板并标 complete；首次快照可能 server_required，后续补充页用新数据替换。远程服保留图案，template_status:server_required、availability:unavailable、source:remote_server、reason；空模板不能解释成此图案不需要模板。

```json
{"trim_material":{"id":"minecraft:quartz","name":"石英质","ingredients":["minecraft:quartz"],"ingredient":"minecraft:quartz","search_key":"石英质 minecraft:quartz"},"trim_patterns":{"id":"minecraft:sentry","name":"哨兵盔甲纹饰","template_items":["minecraft:sentry_armor_trim_smithing_template"],"template_status":"complete","template_item":"minecraft:sentry_armor_trim_smithing_template"}}
```

## 6. 资源 ID

统一请求 {name:下表值}，回复 registry.<name>；每项 id/name/resource，name 通常等于 id。后台枚举活动资源包，缓存和在途限额见第0节。

| name | 来源 | 写入值 |
|---|---|---|
| item_model | items/**/*.json 物品模型**定义** | 去 items/ 与 .json 的 ns:path；不是 models/item 网格名 |
| camera_overlay | textures/misc/**/*.png + textures/gui/**/*.png | 去 textures/ 和 .png 的 ns:path，如 minecraft:misc/pumpkinblur；候选超集，不保证适合作遮罩 |
| profile_texture | textures/entity/player/**/*.png | 去 textures/ 和 .png 的资源纹理ID，如 minecraft:entity/player/slim/alex |
| profile_cape | textures/entity 下 cape/capes 路径或 cape.png | 去 textures/ 和 .png 的资源纹理ID；静态资源可正常为空 |
| profile_elytra | textures/entity 下 elytra/wings 路径或 elytra.png | 去 textures/ 和 .png 的资源纹理ID |

它们不下载玩家账户皮肤/披风，不承诺列出动态纹理；资源为空是完整空页，不用 unavailable。普通远程服仍用当前客户端活动资源包（不代表服务器磁盘资源）。读取失败是 error。profile 的 texture/cape/elytra 字段必须写去掉 textures/ 和 .png 的资源纹理 ID；resource 字段才是完整文件 ID。camera_overlay 同样写逻辑纹理 ID。旧版文档对这四种值的说明错误，禁止继续将旧回执中的完整文件 ID 直接写进组件。

以下为按26.1.2字节码核实转换规则后的**期望条目**，不是新一轮运行回执（当前有Java进程，遵照本次任务约束未运行测试）：

```json
{"camera_overlay":{"id":"minecraft:misc/pumpkinblur","name":"minecraft:misc/pumpkinblur","resource":"minecraft:textures/misc/pumpkinblur.png"},"profile_texture":{"id":"minecraft:entity/player/slim/alex","name":"minecraft:entity/player/slim/alex","resource":"minecraft:textures/entity/player/slim/alex.png"},"profile_elytra":{"id":"minecraft:entity/equipment/wings/elytra","name":"minecraft:entity/equipment/wings/elytra","resource":"minecraft:textures/entity/equipment/wings/elytra.png"}}
```

代码证据（26.1.2，已解析游戏jar）：Equippable.CODEC 的 camera_overlay 字段为 Identifier.CODEC.optionalFieldOf；Gui#extractCameraOverlays 对该ID调用 withPath，其 lambda$extractCameraOverlays$0 拼接 textures/<path>.png 后交给 extractTextureOverlay。Items 的南瓜构造器 lambda$static$16 实际设置 misc/pumpkinblur。profile 经 ResolvableProfile#FULL_CODEC → PlayerSkin.Patch#MAP_CODEC，texture/cape/elytra 都是 ClientAsset.ResourceTexture.CODEC；其 Codec 序列化 id，单参数构造器生成 texturePath=textures/<id.path>.png。不能把texturePath当成序列化id。渲染端 AvatarRenderer#getTextureLocation、CapeLayer#submit、WingsLayer#getPlayerElytraTexture 均读取 ClientAsset.Texture.texturePath()，详见对应字节码日志。字节码与常量完整证据：logs/backend-g/texture-semantics-bytecode.log、texture-semantics-constants.log、profile-render-bytecode.log、vanilla-item-default-bytecode.log。

## 7. 实体信息、基础属性、装备槽组

请求 {name:'entity_info',id:'minecraft:cat'} 或 {name:'entity_info:minecraft:cat'}；回复分别在 registry.entity_info / registry.entity_info:minecraft:cat。条目 id/name/attributes/spawn_eggs/equipment_slots/variant_sources/template_available/default_nbt/template_error。

- attributes：完整属性ID→实体 supplier 基础值；没有 supplier 为 {}，不是零。
- spawn_eggs：所有默认刷此实体的蛋 ID 数组，支持多个模组蛋。
- equipment_slots：临时 LivingEntity.canUseSlot 的槽名列表，不保证会拾取或自然穿戴。
- variant_sources：条目 component/default；Holder 还有 registry（用该名查询）；枚举还有 values（真实 Codec 值数组）。失败单项可带 error；不猜复杂自定义变种。
- default_nbt：未入世界临时实体保存的 SNBT，移除 UUID 并补 id；没有 tick/finalizeSpawn，不能当作实际群系刷怪结果。template_available:false 时可能有 template_error，不要生成假空模板。

真实客户端回执的猫条目（完整）：

```json
{"id":"minecraft:cat","name":"猫","attributes":{"minecraft:armor":0.0,"minecraft:armor_toughness":0.0,"minecraft:attack_damage":3.0,"minecraft:attack_knockback":0.0,"minecraft:burning_time":1.0,"minecraft:camera_distance":4.0,"minecraft:explosion_knockback_resistance":0.0,"minecraft:entity_interaction_range":3.0,"minecraft:fall_damage_multiplier":1.0,"minecraft:follow_range":16.0,"minecraft:gravity":0.08,"minecraft:jump_strength":0.41999998688697815,"minecraft:knockback_resistance":0.0,"minecraft:max_absorption":0.0,"minecraft:max_health":10.0,"minecraft:movement_efficiency":0.0,"minecraft:movement_speed":0.30000001192092896,"minecraft:oxygen_bonus":0.0,"minecraft:safe_fall_distance":3.0,"minecraft:scale":1.0,"minecraft:step_height":0.6,"minecraft:tempt_range":10.0,"minecraft:water_movement_efficiency":0.0,"minecraft:waypoint_transmit_range":0.0},"spawn_eggs":["minecraft:cat_spawn_egg"],"equipment_slots":["mainhand","offhand","feet","legs","chest","head","body","saddle"],"variant_sources":[{"component":"minecraft:cat/variant","default":"minecraft:black","registry":"minecraft:cat_variant"},{"component":"minecraft:cat/sound_variant","default":"minecraft:classic","registry":"minecraft:cat_sound_variant"},{"component":"minecraft:cat/collar","default":"red","values":["white","orange","magenta","light_blue","yellow","lime","pink","gray","light_gray","cyan","purple","blue","brown","green","red","black"]}],"default_nbt":"{AbsorptionAmount:0.0f,Age:1,AgeLocked:0b,Air:300s,Brain:{memories:{}},CanPickUpLoot:0b,CollarColor:14b,DeathTime:0s,FallFlying:0b,Fire:0s,ForcedAge:0,Health:10.0f,HurtByTimestamp:0,HurtTime:0s,InLove:0,Invulnerable:0b,LeftHanded:0b,Motion:[0.0d,0.0d,0.0d],OnGround:0b,PersistenceRequired:0b,PortalCooldown:0,Pos:[0.0d,0.0d,0.0d],Rotation:[3.9716644f,0.0f],Sitting:0b,attributes:[],current_impulse_context_reset_grace_time:0,fall_distance:0.0d,id:\"minecraft:cat\",sound_variant:\"minecraft:classic\",variant:\"minecraft:black\"}","template_available":true}
```

请求 {name:'entity_base_attributes',id:'minecraft:player'}，回复 registry.entity_base_attributes，entries:[{id,attributes}]；不传 id 获取全部实体。读取 attributes['minecraft:attack_damage'] / ['minecraft:attack_speed'] 替代硬编码 1/4；不是玩家当前装备/药水修正后的数值。

```json
{"id":"minecraft:player","attributes":{"minecraft:armor":0.0,"minecraft:armor_toughness":0.0,"minecraft:attack_damage":1.0,"minecraft:attack_knockback":0.0,"minecraft:attack_speed":4.0,"minecraft:block_break_speed":1.0,"minecraft:block_interaction_range":4.5,"minecraft:burning_time":1.0,"minecraft:camera_distance":4.0,"minecraft:explosion_knockback_resistance":0.0,"minecraft:entity_interaction_range":3.0,"minecraft:fall_damage_multiplier":1.0,"minecraft:gravity":0.08,"minecraft:jump_strength":0.41999998688697815,"minecraft:knockback_resistance":0.0,"minecraft:luck":0.0,"minecraft:max_absorption":0.0,"minecraft:max_health":20.0,"minecraft:mining_efficiency":0.0,"minecraft:movement_efficiency":0.0,"minecraft:movement_speed":0.10000000149011612,"minecraft:oxygen_bonus":0.0,"minecraft:safe_fall_distance":3.0,"minecraft:scale":1.0,"minecraft:sneaking_speed":0.3,"minecraft:step_height":0.6,"minecraft:submerged_mining_speed":0.2,"minecraft:sweeping_damage_ratio":0.0,"minecraft:water_movement_efficiency":0.0,"minecraft:waypoint_transmit_range":60000000.0,"minecraft:waypoint_receive_range":60000000.0}}
```

请求 {name:'equipment_slot_groups'}，回复 registry.equipment_slot_groups，entries:[{id,slots:[槽名]}]；来自 group.test(slot) 替换 MELEE_SLOTS。槽组和单槽不是同一枚举，attribute_modifiers 使用槽组，equippable 使用单槽。

```json
[{"id":"any","slots":["mainhand","offhand","feet","legs","chest","head","body","saddle"]},{"id":"mainhand","slots":["mainhand"]},{"id":"offhand","slots":["offhand"]},{"id":"hand","slots":["mainhand","offhand"]},{"id":"feet","slots":["feet"]},{"id":"legs","slots":["legs"]},{"id":"chest","slots":["chest"]},{"id":"head","slots":["head"]},{"id":"armor","slots":["feet","legs","chest","head","body"]},{"id":"body","slots":["body"]},{"id":"saddle","slots":["saddle"]}]
```

远程服模板只用客户端可见对象；无法获得服务器独有模组/数据包。未知实体或模板过大回错误页，工厂/保存失败可能仅模板不可用而仍保留属性等信息。无世界行为见第0节；每次请求有自己的 entity-generation，切勿与另一次同名请求拼页。

## 8. spawner_info 与写回

请求 {name:'spawner_info'}，回复 registry.spawner_info，entries 两条，以方块实体类型 ID minecraft:mob_spawner / minecraft:trial_spawner 为键，**不是物品 ID minecraft:spawner**。

普通条目 default_nbt（保真）、defaults（JSON）、fields:{字段:{nbt_type?,default,present_by_default,codec?}}。fields 没有自动推导 min/max。真实新建刷怪笼没有 SpawnData，虽然字段描述提供 {entity:{}} 示例默认；不要把它误当现存数据。

| 普通字段 | 本次原版默认 | 写回限制/含义 |
|---|---|---|
| Delay | 20 | 整数 -1..32767，tick；-1 为重置语义 |
| MinSpawnDelay / MaxSpawnDelay | 200 / 800 | 0..32767 整数，且 Max≥Min |
| SpawnCount / MaxNearbyEntities | 4 / 6 | 0..32767 整数 |
| RequiredPlayerRange / SpawnRange | 16 / 4 | 0..32767 整数 |
| SpawnData | 默认未保存 | SpawnData.CODEC；entity 复合标签；可选 custom_spawn_rules/equipment 等依官方 Codec |
| SpawnPotentials | [] | SpawnData.LIST_CODEC，权重条目 {data:SpawnData,weight:正整数} |

试炼条目 default_nbt、defaults、codec/config_codec/state_codec（仅类型标识，不是 schema）。defaults.normal_config 和 ominous_config 都展开官方默认，DIRECT_CODEC 本身可能把默认字段省成 {}。normal_config/ominous_config 写回可为配置对象或注册表引用 ID；完整配置与状态分别经 FullConfig.MAP_CODEC / StateData.Packed.MAP_CODEC 校验。

| 试炼配置字段 | 本次原版默认 | 官方 Codec 范围/结构 |
|---|---|---|
| spawn_range | 4 | 整数1..128 |
| total_mobs / simultaneous_mobs | 6 / 2 | float 0..Float.MAX_VALUE |
| total_mobs_added_per_player / simultaneous_mobs_added_per_player | 2 / 1 | float 0..Float.MAX_VALUE |
| ticks_between_spawn | 40 | 整数0..2147483647，tick |
| spawn_potentials | [] | SpawnData 的加权列表 |
| loot_tables_to_eject | 见真实回执 | 战利品表键的加权列表 |
| items_to_drop_when_ominous | 见真实回执 | 战利品表键 |
| required_player_range（外层） | 14 | 整数1..128 |
| target_cooldown_length（外层） | 36000 | 非负 int，tick |

这些默认数值是本轮回执说明，UI 默认必须从接口读取。状态字段请保留 default_nbt/原草稿，不把 FullConfig 的配置字段当作全部状态 schema。实体内部任意自定义 NBT 没有完整可视化 schema，继续保留高级 SNBT。

```json
[{"id":"minecraft:mob_spawner","default_nbt":"{Delay:20s,MaxNearbyEntities:6s,MaxSpawnDelay:800s,MinSpawnDelay:200s,RequiredPlayerRange:16s,SpawnCount:4s,SpawnPotentials:[],SpawnRange:4s}","defaults":{"MaxNearbyEntities":6,"RequiredPlayerRange":16,"SpawnCount":4,"MaxSpawnDelay":800,"SpawnRange":4,"Delay":20,"MinSpawnDelay":200,"SpawnPotentials":[]},"fields":{"MaxNearbyEntities":{"nbt_type":"SHORT","default":6,"present_by_default":true},"RequiredPlayerRange":{"nbt_type":"SHORT","default":16,"present_by_default":true},"SpawnCount":{"nbt_type":"SHORT","default":4,"present_by_default":true},"MaxSpawnDelay":{"nbt_type":"SHORT","default":800,"present_by_default":true},"SpawnRange":{"nbt_type":"SHORT","default":4,"present_by_default":true},"Delay":{"nbt_type":"SHORT","default":20,"present_by_default":true},"MinSpawnDelay":{"nbt_type":"SHORT","default":200,"present_by_default":true},"SpawnPotentials":{"nbt_type":"LIST","default":[],"codec":"SpawnData.LIST_CODEC","present_by_default":true},"SpawnData":{"codec":"SpawnData.CODEC","default":{"entity":{}},"present_by_default":false}}},{"id":"minecraft:trial_spawner","default_nbt":"{}","codec":"TrialSpawner.FullConfig.MAP_CODEC","defaults":{"normal_config":{"spawn_range":4,"total_mobs":6.0,"simultaneous_mobs":2.0,"total_mobs_added_per_player":2.0,"simultaneous_mobs_added_per_player":1.0,"ticks_between_spawn":40,"spawn_potentials":[],"loot_tables_to_eject":[{"data":"minecraft:spawners/trial_chamber/consumables","weight":1},{"data":"minecraft:spawners/trial_chamber/key","weight":1}],"items_to_drop_when_ominous":"minecraft:spawners/trial_chamber/items_to_drop_when_ominous"},"ominous_config":{"spawn_range":4,"total_mobs":6.0,"simultaneous_mobs":2.0,"total_mobs_added_per_player":2.0,"simultaneous_mobs_added_per_player":1.0,"ticks_between_spawn":40,"spawn_potentials":[],"loot_tables_to_eject":[{"data":"minecraft:spawners/trial_chamber/consumables","weight":1},{"data":"minecraft:spawners/trial_chamber/key","weight":1}],"items_to_drop_when_ominous":"minecraft:spawners/trial_chamber/items_to_drop_when_ominous"},"required_player_range":14,"target_cooldown_length":36000},"config_codec":"TrialSpawnerConfig.DIRECT_CODEC","state_codec":"TrialSpawnerStateData.Packed.MAP_CODEC"}]
```

写入 block_entity_data 时必须带正确 id；高级 SNBT 带 component_formats.block_entity_data:'snbt'。apply 整栈校验后追加 SpawnerData.validate：普通整数/延迟关系、SpawnData/列表 Codec、实体 id 合法性（含最多16层乘客）；试炼再验官方完整配置和状态 Codec。失败仍是 result.status:rejected、code:invalid_request、reason:可读错误（如 MaxSpawnDelay 必须不小于 MinSpawnDelay / 未知刷怪实体 id），没有专用刷怪错误码。validate_component 只验组件本身的 Codec，不包含这些整栈附加规则；因此“预检绿灯”不保证 apply 成功。

远程客户端可能没有 TRIAL_SPAWNER_CONFIG：客户端跳过试炼附加配置检查，由装有模组的服务端权威校验；不能只用客户端创造包宣称试炼引用已验证。导出 spawner_info 本身仍来自本地默认配置，不读取世界已放置刷怪器，不生成实体。

## 9. 方块属性、标签、全部枚举

请求 {name:'block_properties',id:'minecraft:oak_log'}（省 id 为全表），回复 registry.block_properties，entries:[{id,name,properties:{属性名:{values:[字符串],default:字符串}}}]。block_state 从属性值选，debug_stick_state 从 properties 键选；无属性为 {}。350µs软预算逐条采集；未知单件回 error，远程用客户端已知方块定义。

```json
{"id":"minecraft:oak_log","name":"橡木原木","properties":{"axis":{"values":["x","y","z"],"default":"y"}}}
```

请求 {name:'tags:block'} / tags:item / tags:damage_type / tags:enchantment 等，后缀可以完整注册表 ID；回复 registry.tags:<reg>。条目 id（不带#）/count/name/translation_key。name 从活动 Language + Fabric TagKey.getTranslationKey() 获取，缺翻译回完整 id；没有“所有标签必有中文名”的承诺。此处替换 TAG_NAMES，别另写别名表。

```json
[{"id":"minecraft:logs","translation_key":"tag.item.minecraft.logs","name":"minecraft:logs"}]
```

请求 {name:'tag:block',id:'minecraft:mineable/axe'}，回复 registry.tag:block，每页带 id 与 field:'members'；entries 是**完整 ID 字符串数组**，不是 {id,name}。相同通道的多标签须按 id 分桶。RESIST：先 tags:damage_type 得到实际标签，再 tag:damage_type 查询实际伤害成员；TOOL_GROUPS：先 tags:block，再 tag:block 取方块成员。快捷预设只有标签确实存在时显示，完整选择器必须显示全部实际标签，手动输入仍保留。标签不存在是 error，不是空标签；count:0 的存在标签正常。

本轮真实标签响应示例（registry.tags:damage_type 的单条条目摘录，以及 registry.tag:damage_type 的完整分页）：

```json
{"id":"minecraft:always_hurts_ender_dragons","translation_key":"tag.damage_type.minecraft.always_hurts_ender_dragons","name":"minecraft:always_hurts_ender_dragons","count":4}
```

```json
{"id":"minecraft:is_fire","field":"members","version":1,"generation":"1","name":"tag:damage_type","offset":0,"total":7,"entries":["minecraft:campfire","minecraft:fireball","minecraft:hot_floor","minecraft:in_fire","minecraft:lava","minecraft:on_fire","minecraft:unattributed_fireball"],"done":true}
```

enum 请求统一 {name:'enum:<下列名>'}，回复 registry.enum:<名>；条目 id/name，Java Enum 额外 symbol（Enum.name()，例如常量名），dye_color/text_color 额外 rgb（24位整数）。**写入 Codec 的值只能用 id，不用 symbol**；consume_effect_type 是注册表而不是 Java enum，完整命名空间 id，没有 symbol。

全部18个 enum 名：use_animation、equipment_slot、equipment_slot_group、attribute_operation、rarity、firework_shape、consume_effect_type、dye_color、text_color、axolotl_variant、horse_variant、llama_variant、mooshroom_variant、fox_variant、rabbit_variant、parrot_variant、tropical_fish_pattern、salmon_size。未知名称空页+error。没有额外 numeric enum ordinal 协议；需要数字或 packed Variant 的实体原始 NBT 应按实际 NBT/Codec 编辑。

```json
{"text_color":{"id":"black","name":"Black","symbol":"BLACK","rgb":0},"use_animation":{"id":"none","name":"none","symbol":"NONE"},"equipment_slot":{"id":"mainhand","name":"mainhand","symbol":"MAINHAND"},"firework_shape":{"id":"small_ball","name":"Small Ball","symbol":"SMALL_BALL"},"consume_effect_type":{"id":"minecraft:apply_effects","name":"minecraft:apply_effects"}}
```

## 10. 刷怪蛋默认 entity_data.id

请求 {name:'item_defaults_one',id:'minecraft:pig_spawn_egg'}，回复 registry.item_defaults_one，单条 {id,comps,tags,component_formats?,unsupported_components?}。这是原型组件，snapshot.comps 只含覆盖，不能用空 patch 判断蛋没有实体。

当前26.1.2 entity_data 是有类型的实体数据 Codec，本次真实默认是 JSON 对象：

```json
{"id":"minecraft:pig_spawn_egg","comps.entity_data":{"id":"minecraft:pig"}}
```

因此常规读取 entries[0].comps.entity_data.id；需要完整 namespace 时也兼容 comps['minecraft:entity_data']。不要 JSON.parse 整个 SNBT。若其他组件/扩展返回 component_formats[k]=='snbt'，通过 validate_component 的 snbt 模式取得 result.json 再读取 id；也可直接用 item_meta_one.spawn_egg_entity 作为默认蛋类型。显式草稿 entity_data 覆盖优先，item_meta 只描述默认物品。

## 11. 手写表的逐项结论与本轮补齐

| 前端表/需求 | 结论 | 接线 |
|---|---|---|
| MC_COLORS | 现有接口足够 | enum:text_color，ChatFormatting.isColor()，含rgb；不含 bold/reset，十六进制颜色仍手输 |
| HIDE_PARTS | 现有接口足够 | data_component_types 初始推送，主动查询 minecraft:data_component_type；hidden_components 保存真实组件 ID，不能仅留8个白名单 |
| TAG_NAMES | 需要新增字段，已补齐 | tags:* 新增 name/translation_key；活动语言缺键回ID，不手写翻译 |
| RESIST | 现有接口足够 | tags:damage_type + tag:damage_type，标签成员权威 |
| TOOL_GROUPS | 现有接口足够 | tags:block + tag:block，快捷项按存在性过滤 |
| MELEE_SLOTS | 现有接口足够 | equipment_slot_groups 的slots |
| 攻击基础值 | 现有接口足够 | entity_base_attributes + player ID；缺属性不填0 |
| 枚举控件序列化符号名 | 现有id足够；另补Java常量符号 | 所有 Java Enum 条目增加 symbol；不替代id |
| ANIMS / EQ_SLOTS / FW_SHAPES / CE_TYPES | 现有接口足够 | enum:use_animation / equipment_slot / firework_shape / consume_effect_type |
| ikind / SLOT_COUNT / 袋容量 / 蛋实体 / 衣服槽 | 现有接口足够 | item_meta(_one)，剩余按默认组件能力判断 |

没有新增消息通道或手写候选表；只有向后兼容的响应字段补充。注册表不存在、资源未载入、服务器未同步时一律保留手动输入和草稿。

另修复初始发布复数别名的主动查询：items、data_component_types、trim_materials、painting_variants 等使用同一 KINDS 定义映射到缓存的规范注册表。此前这些名称只在初始推送出现，主动请求会找不到注册表；现在可直接使用，回复 key 不变。trim_patterns 继续走原有模板补充路由。

## 12. 示例证据与验证边界

除第6节明确标注的修正后期望条目外，本文 JSON 示例全部由真实回执摘取，下面明确区分客户端消息与无窗口 Java Codec 测试；不把模拟信封写成真实网络收包。标签成员与计数会随数据包变化，示例不能当常量表：

- S：daily/2026-11-07/registry-supplement/run/registry-supplement-data.json：独立离屏客户端经 registry 通道收到并合页的条目；本轮重新验证并补获标签/枚举/复数别名回执；本文摘变种、纹饰、资源、方块属性与标签成员。
- E：run/entity-data-probe/entity-data-verification.json：此前离屏实体探针157类型的真实条目和刷怪器数据；本文摘猫实体。
- G：logs/backend-g/wiring-responses.json：本轮 FrontendWiringTest，真实26.1.2注册表/Codec、正式分页器，无窗口无世界。用于 validate、类型sidecar、元信息、枚举、标签名称、基础属性、槽组、刷怪器、unavailable。标签翻译测试夹具只用于断言，不写入示例回执。
- 历史整栈保存证明：logs/backend-b/backend-data-e2e.json（10类回执），不是本轮重新跑游戏的证明。

本轮验证：独立 Java25 javac 编译全部主源码；FrontendWiringTest 319项、BackendDataTest 66项、EntityDataTest 106项，以及分页/发送队列回归通过。另用独立离屏静默客户端重跑注册表探针，46类请求、849个布尔检查通过（同一S路径的本轮新回执）；实际覆盖新增标签显示字段、枚举symbol、四种复数别名和标签成员。未跑Gradle、未重启/结束用户进程、未实连远程服、未重测真实服务器apply保存链。Java更新须重启相关端后才对前端生效。
