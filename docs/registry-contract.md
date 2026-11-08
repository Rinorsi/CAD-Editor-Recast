# 实时注册表合同 v1

## 2026-11-07：协商式惰性目录

本地Document第一条registry消息可发{name:"client_features",features:["lazy-catalog-v1"]}。回复顶层字面键registry.client_features，形状{accepted:["lazy-catalog-v1"],lazy:{items:{count:N},...}}；registry.meta新增同形lazy。协商页面不再自动接收items/blocks/sounds、全部tags目录、loot/recipe、五类资源ID以及其它超过600行的目录；未协商页面保留旧信封和全部推送。显式{name:"items"}仍能读取全目录。新search/lookup行保留旧字段并加namespace，协议、固定kind别名、真实回执与内存边界见[search-contract.md](search-contract.md#lazy-catalog-v12026-11-07)。阈值唯一常量LazyCatalog.THRESHOLD=600。按ID defaults、元信息、实体及方块属性接口不受影响。

前端接线与真实回执摘录见 [frontend-wiring.md](frontend-wiring.md)，包括 apply 的 component_formats/component_snbt、29种变种、物品元信息全部字段、刷怪器范围与错误形态。

## 2026-11-07：标签显示名与枚举符号（向后兼容补充）

- tags:<注册表> 条目从 {id,count} 扩展为 {id,count,name,translation_key}。translation_key 直接调用当前 Fabric TagKey.getTranslationKey()，支持模组注册表命名空间与嵌套路径；name 从当前 Language 读取，无翻译严格回退完整标签 ID（不加 #）。不增加 TAG_NAMES 静态翻译表，不承诺每个服务器自定义标签都有中文。tag:<注册表> 的成员仍是 ID 字符串数组，信封、分页、错误和远程可见性不变。
- enum:* 的实际 Java Enum 条目增加 symbol=Enum.name()；id 仍然是 getSerializedName()，前端写组件必须用 id，不能写 symbol 或 ordinal。consume_effect_type 来自真实注册表而非 Java Enum，因此没有 symbol。现有 name/rgb 字段保持。
- 本轮无新增消息通道。MC_COLORS→enum:text_color；HIDE_PARTS→data_component_types；RESIST→tags:damage_type + tag:damage_type；TOOL_GROUPS→tags:block + tag:block；MELEE_SLOTS→equipment_slot_groups；攻击基础值→entity_base_attributes。上述现有接口已足够，不重复增加私有候选表。
- 修复初始发布别名的主动查询：RegistrySnapshot.KINDS 中的 items / data_component_types / trim_materials / painting_variants 等现在也可作为请求 name，读取同一个正式注册表缓存；回复 key 保留请求原名，信封 name 可为规范注册表名。此前这些复数名仅自动推送有效（trim_patterns 已有专门补充路由）；不新增候选映射表。
- 完整 enum 名共18个：use_animation、equipment_slot、equipment_slot_group、attribute_operation、rarity、firework_shape、consume_effect_type、dye_color、text_color、axolotl_variant、horse_variant、llama_variant、mooshroom_variant、fox_variant、rabbit_variant、parrot_variant、tropical_fish_pattern、salmon_size。
- 无客户端世界时，不保证 registry 错误页被实际投递：当前发送队列只在世界 tick 内排空。前端需处理世界退出、页面关闭和超时；不要无限等待回复，也不要将无回复当完整空列表。validate_component 的大小/频率拒绝则在主线程直接 patch 结果。
- 刷怪器附加校验抛普通 IllegalArgumentException，当前 apply 拒绝的稳定 code 是 invalid_request，详细原因在 reason；没有细分刷怪器错误码。validate_component 本身仅检查单组件 Codec，不包含整栈 SpawnerData.validate。
- 验证：独立 Java25 javac（无 Gradle、无窗口）与 FrontendWiringTest；回执 logs/backend-g/wiring-responses.json、完整日志 logs/backend-g/wiring-test.log。包含语言键翻译/缺键/模组注册表回退、全部枚举符号、精确SNBT sidecar、默认蛋实体JSON、远程 unavailable 与正式分页关联检查。无窗口单测不代替客户端消息链验证，后者见下段。

随后本轮追加独立离屏客户端 registry 通道验证：46类请求、849个布尔检查 PASS，包含 tags:block/tags:damage_type 的 name/translation_key、tag:* 成员、enum:symbol、items/data_component_types/trim_materials/painting_variants 主动别名。回执 daily/2026-11-07/registry-supplement/run/registry-supplement-verification.json，条目及部分完整信封 registry-supplement-data.json，启动日志 logs/backend-g/live-runner.log，客户端日志 daily/2026-11-07/registry-supplement/client.log。使用既有基础jar的隔离副本覆盖最新注册表类，没有启动Gradle，也未接管用户客户端；本轮未重测apply服务端保存链、专服真实unavailable或新版发行整包。

## B5–B9：方块属性、世界数据、变种、纹饰和资源（26.1.2）

以下仍发送到 registry 通道，回复顶层字面键 registry.<请求 name>，沿用 version/generation/name/offset/total/entries/done 分页。ID 全部来自当前游戏对象、官方枚举或活动资源包，不按原版固定名单生成候选。前端必须保留手动输入；列表为空、未知 ID、资源未加载均不得清除草稿里的值。补充索引同代缓存最多64项、在途最多8项，与资源索引共用限额；换世界、标签/资源重载失效。非法请求/导出失败返回空页及 error；正常“服务器未同步”使用 availability:"unavailable"、source、reason 区分，不伪报完整空注册表。

### B5 方块属性

- 请求 {name:"block_properties"}，或 {name:"block_properties",id:"minecraft:oak_log"} 仅取一个方块；单件每页保留 id 请求关联。
- 条目 {id,name,properties:{属性序列化名:{values:[序列化字符串],default:序列化字符串}}}。来自 Block.getStateDefinition()/Property.getPossibleValues()/getName() 与 block.defaultBlockState()；包括模组方块、布尔/整数/枚举属性。无属性的方块仍有 properties:{}；未知单件 ID 回空页+error，不会把缺省方块当目标。
- block_state 的属性值从对应方块 properties 读取；debug_stick_state 只从 properties 的键选属性名。运行时合法属性不等于允许任意属性组合，提交仍由组件 Codec/游戏行为校验。
- 全表在客户端按350µs软预算逐条采集（世界变化取消），脱离游戏对象后后台分页；不在一次请求回调中遍历整个方块表。单个模组方块属性读取仍不可强抢占。

示例（响应 registry.block_properties）：

    {"version":1,"generation":"17","name":"block_properties","id":"minecraft:oak_log","offset":0,"total":1,"entries":[{"id":"minecraft:oak_log","name":"橡木原木","properties":{"axis":{"values":["x","y","z"],"default":"y"}}}],"done":true,"source":"block_state_definition","availability":"complete"}

### B6 战利品、配方、维度、地图标记

| 请求 name（别名） | 权威来源 | 远程服务器限制 |
|---|---|---|
| minecraft:loot_table（loot_table / loot_tables） | 集成服线程读取 reloadableRegistries().lookup() 的 LOOT_TABLE 全部键 | 原版协议不向客户端同步完整战利品表，回空页、availability:"unavailable"、source:"remote_server"、reason；必须手动输入，不扫描客户端内置数据假装是服务器内容 |
| minecraft:recipe（recipe / recipes） | 集成服线程读取 RecipeManager.getRecipes() 的真实配方键 | 26.1.2 客户端 RecipeAccess 只有同步属性/切石/显示数据，不能还原完整服务器配方键；同样明确 unavailable，保留手输 |
| minecraft:dimension（dimension / dimensions） | ClientPacketListener.levels()，包括服务器通知的自定义维度 | 不是 dimension_type；无需猜 overworld/nether/the_end，连接无列表时返回实际空列表 |
| minecraft:map_decoration_type | 当前同步/BuiltInRegistries 注册表 | 使用现有通用注册表接口，条目 {id,name}，不手写红标/蓝标清单 |

战利品/配方/维度条目均 {id,name}，没有可靠翻译时 name=id。前两种服务端读取不阻塞等待客户端，不在客户端线程触碰服务器注册表。集成服成功页 source 分别为 integrated_server_loot_registry / integrated_server_recipes；维度为 connection_levels。集成服完整列表反映本次查询的已加载数据包，不能代表远程服或未来重载。

远程降级示例：

    {"version":1,"generation":"17","name":"minecraft:loot_table","offset":0,"total":0,"entries":[],"done":true,"source":"remote_server","availability":"unavailable","reason":"服务器未向客户端同步完整列表，请手动输入 ID"}

### B7 生物变种：逐项来源

每个下表请求实际使用对应注册表，entries=[{id,name}]，不是概括性的“任意注册表”。缺翻译保留完整 ID；未同步/不存在回空页+error。验证探针对每一条候选调用相应 DataComponentType.codec().parse(当前 RegistryOps,id)，并逐个请求检查所有分页完整收到。

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
| painting/variant | minecraft:painting_variant（原有 painting_variants 别名） |

其余15个组件不是独立变种注册表，使用官方枚举值，不能查询一个不存在的注册表代替：

| 组件 | 请求 name / 游戏类型 |
|---|---|
| axolotl/variant | enum:axolotl_variant / Axolotl.Variant |
| horse/variant | enum:horse_variant / equine.Variant |
| llama/variant | enum:llama_variant / Llama.Variant |
| mooshroom/variant | enum:mooshroom_variant / MushroomCow.Variant |
| fox/variant | enum:fox_variant / Fox.Variant |
| rabbit/variant | enum:rabbit_variant / Rabbit.Variant |
| parrot/variant | enum:parrot_variant / Parrot.Variant |
| tropical_fish/pattern | enum:tropical_fish_pattern / TropicalFish.Pattern |
| salmon/size | enum:salmon_size / Salmon.Variant |
| cat/collar、wolf/collar、sheep/color、shulker/color、tropical_fish/base_color、tropical_fish/pattern_color | enum:dye_color（原有，含 rgb） |

这些枚举条目为 {id:官方getSerializedName(),name:翻译或id}；不是实体数值 Variant NBT。选择器应写组件 Codec 接受的字符串，如 {"id":"gold","name":"gold"}，不能把它误写成实体的 packed 变种整数。

### B8 纹饰图标关联

- trim_materials 初始推送与 trim_material / minecraft:trim_material 查询：条目增加 ingredients:[物品ID]，来自当前每个 Item.components().PROVIDES_TRIM_MATERIAL 的 Holder 键反向关联；兼容单图标字段 ingredient 为第一个实际物品 ID，没有提供物品则省略。ingredients 保留多个模组物品；不能假设材料 ID 等于原料物品 ID。
- trim_patterns 初始推送自动补充，或主动查询 trim_patterns / trim_pattern / minecraft:trim_pattern：增加 template_items:[物品ID]、template_status:"complete"；兼容 template_item 为第一个实际模板物品 ID。26.1.2 TrimPattern 不含模板字段，关联来自集成服实际 SmithingTrimRecipe 的 Recipe.CODEC 的 pattern 和 templateIngredient().items()，合并同图案全部模板（包含标签展开和模组配方），不拼接 _armor_trim_smithing_template。
- 普通注册表快照可暂时有 template_items:[]、template_status:"server_required"；初始补充就绪后替换该代 trim_patterns 分页。远程服无法得到完整模板配方关联，保留全部图案条目，template_status:"server_required"，信封 availability:"unavailable" 与 reason；不按命名猜模板、不伪造 ingredient/template_item。
- 示例条目：{"id":"minecraft:quartz","name":"石英材料","ingredients":["minecraft:quartz"],"ingredient":"minecraft:quartz"}；{"id":"minecraft:sentry","name":"哨兵盔甲纹饰","template_items":["minecraft:sentry_armor_trim_smithing_template"],"template_item":"minecraft:sentry_armor_trim_smithing_template","template_status":"complete"}。名称仅示意，以当前语言为准。

### B9 活动资源 ID

存储语义核实：camera_overlay 使用 Equippable.CODEC 的 Identifier.CODEC；Gui#extractCameraOverlays / lambda$extractCameraOverlays$0 在渲染时拼接 textures/<path>.png。profile 的 ResolvableProfile#FULL_CODEC 合入 PlayerSkin.Patch#MAP_CODEC；texture/cape/elytra 都用 ClientAsset.ResourceTexture.CODEC，序列化 id，构造器派生 texturePath=textures/<id.path>.png。因此这四种导出均移除文件前后缀，保留命名空间与子路径；item_model 语义不变。证据日志见 frontend-wiring 第6节；新增 ResourceIdsTest 与运行探针断言，当前有Java进程，按本次任务限制未编译或运行这些新增断言。

请求以下 name，后台枚举活动 ResourceManager（资源包覆盖去重、保留模组命名空间与子目录），每项 {id,name:id,resource:完整文件ID}。不是读取磁盘任意路径，不下载玩家账户皮肤，不保证每个候选的尺寸/渲染语义都适用。目录无文件正常回空页；读取失败回空页+error。所有资源选择器仍需手动输入，以支持资源包自定义目录与运行时动态纹理。

| name | 文件来源 | id 格式 |
|---|---|---|
| camera_overlay | textures/misc/**/*.png 与 textures/gui/**/*.png（候选超集，含原版南瓜遮罩） | 去 textures/ 与 .png 的 ns:path，例如 minecraft:misc/pumpkinblur |
| profile_texture | textures/entity/player/**/*.png | 去 textures/ 与 .png 的 ns:entity/player/... |
| profile_cape | textures/entity/**/*.png 中 cape/capes 路径段或 cape.png | 去 textures/ 与 .png 的资源纹理ID；原版静态资源可能为空，在线下载披风不在此列表 |
| profile_elytra | textures/entity/**/*.png 中 elytra/wings 路径段或 elytra.png | 去 textures/ 与 .png 的资源纹理ID；含 equipment/wings 目录 |
| item_model | items/**/*.json，物品模型定义而非 models/item 网格模型 | 去 items/ 和 .json 的 ns:path，保留子目录；可以没有同名注册物品 |

示例：请求 {name:"item_model"}，条目 {"id":"minecraft:diamond_sword","name":"minecraft:diamond_sword","resource":"minecraft:items/diamond_sword.json"}；请求 {name:"profile_texture"}，期望条目 {"id":"minecraft:entity/player/slim/alex","name":"minecraft:entity/player/slim/alex","resource":"minecraft:textures/entity/player/slim/alex.png"}。camera_overlay/profile_texture/profile_cape/profile_elytra 的 id 是可直接写组件的逻辑纹理ID，resource 才保留 textures/ 和 .png。此前合同的完整文件ID写入说明错误，已按26.1.2实际代码更正。

验证入口：tools/registry/supplement-run.ps1（使用已构建基础 jar 与 runtime-classpath 的独立副本、Java25 javac，无需终止用户 runClient/Gradle）。只读实时数据与 Codec，隔离测试世界；窗口创建前禁用聚焦/显示并设置离屏位置，独立探针禁止抓鼠标。回执与完整数据位于本工程 daily/<日期>/registry-supplement/run/registry-supplement-{verification,data}.json；临时目录不是运行时依赖。当前验证结果以该次回执为准，不把编译通过称为实机通过。

2026-11-07 独立真客户端验证：29个变种组件全部候选逐条通过对应组件 Codec；14类注册表与10类枚举来源实际逐个请求并合并分页。当前环境 cat 11 / cat_sound 2 / wolf 9 / wolf_sound 7 / chicken 3 / chicken_sound 2 / cow 3 / cow_sound 2 / frog 3 / pig 3 / pig_sound 3 / villager_type 7 / zombie_nautilus 2 / painting 51。方块属性1168、战利品1326、配方1515、维度3、地图标记35、纹饰材料11、纹饰图案18；GUI纹理539、静态玩家皮肤18、披风0、鞘翅1、模型定义1507（含仅测试包提供、没有注册物品的嵌套路径模型）。数字是本次回执，不是生产候选清单，不在导出代码里硬编码。远程 unavailable 分支在探针中直接验证“不伪造 ID、保留已有图案”，本轮未另连真实远程服。现有交互式 Gradle runClient 一直运行，因此遵守不并行启动 Gradle 的规则，采用 Java25 javac 编译注册表包并在既有构建 jar 的隔离副本覆盖新类验证；未宣称本轮跑过完整 Gradle build。

## 实体、刷怪器和属性（B1 / B2 / B10，26.1.2）

以下仍经 oriel.send("registry", {...})，回复顶层字面键 registry.+请求 name；沿用 version/generation/offset/total/entries/done 分页信封，单页≤24000 UTF-16字符。按需采集，不加入初始全量预热。带 id 的请求在每页原样返回 id；generation 为 entity-递增序号，按 name+id+generation 合页。只接本地页面，不提供世界实体或方块的修改权限。

- {name:"entity_info",id:"minecraft:cat"}，或 {name:"entity_info:minecraft:cat"}：entries 为单条实体信息。id/name 来自 ENTITY_TYPE；attributes 是 {属性完整id:基础值}，取 DefaultAttributes supplier，player 特别取 Player.createAttributes()，没有 supplier 的类型为 {}。不读取玩家身上的装备、药水或属性修饰符。
- spawn_eggs 为扫描当前 ITEM 注册表的 SpawnEggItem.getType(defaultStack) 得到的完整物品id数组，支持同实体多个蛋；equipment_slots 是临时 LivingEntity.canUseSlot(slot) 判定通过的序列化槽名，非生物为空。该 API 表示底层可用槽，不承诺该生物会捡起/自然穿戴某种装备（26.1.2 部分生物允许所有底层槽）。
- variant_sources 逐一查询实体实际暴露的 DataComponentType 值；Holder 值返回 {component,default,registry}，registry 取 holder ResourceKey.registry()；枚举值返回 {component,default,values:[组件真实Codec编码值]}，无实体→变种手写映射。这也包含项圈颜色等枚举组件。未暴露为 Holder/enum 的自定义复杂变种不会猜测，仍需手动输入/高级组件编辑；Codec 错误以该来源的 error 明示。
- default_nbt 是客户端当前 ClientLevel 中新建临时实体 saveWithoutId(TagValueOutput) 的 SNBT，从不 addEntity、不 tick、不 finalizeSpawn、不调用世界生成/刷怪逻辑。删除随机 UUID 并补实体 id；player 用未入世界的 RemotePlayer。模板代表构造器默认值，不代表按群系/难度随机生成的最终实体。template_available:false 时省略 default_nbt，附 template_error；禁止拿空对象假装模板成功。保存过程报告错误时也不交付不完整模板。
- {name:"entity_base_attributes",id:"minecraft:player"}：entries=[{id,attributes}]；省略 id 则分页返回所有当前 ENTITY_TYPE 的 supplier 基础值。此接口替换前端手写攻击伤害1/攻击速度4，字段按完整属性id读取，缺失属性不可当作0。
- {name:"equipment_slot_groups"}：entries=[{id:"hand",slots:["mainhand","offhand"]},...]，直接 EquipmentSlotGroup.values() × EquipmentSlot.values() 调用 group.test(slot)，替代 MELEE_SLOTS 表。

实体示例（只展示部分属性，实际完整返回）：

    {"id":"minecraft:cat","name":"猫","attributes":{"minecraft:max_health":10.0,"minecraft:attack_damage":3.0},"spawn_eggs":["minecraft:cat_spawn_egg"],"equipment_slots":["mainhand","offhand","feet","legs","chest","head","body","saddle"],"variant_sources":[{"component":"minecraft:cat/variant","default":"minecraft:black","registry":"minecraft:cat_variant"}],"template_available":true,"default_nbt":"{id:'minecraft:cat',Health:10.0f}"}

{name:"spawner_info"} 返回两个条目：

- minecraft:mob_spawner：default_nbt 直接新建 SpawnerBlockEntity.saveCustomOnly；defaults 是其 NBT→JSON（整数无类型，保真用 default_nbt）；fields 按实际保存的 key 枚举 {nbt_type,default,present_by_default}。SpawnData/SpawnPotentials 另附 codec 标识 SpawnData.CODEC / SpawnData.LIST_CODEC，默认值分别编码 new SpawnData() / WeightedList.of()，不伪造实体候选。注意全新刷怪笼的 SpawnData 尚不存在：present_by_default:false，不能把示例默认当成原有 NBT 必填项。
- minecraft:trial_spawner：default_nbt 直接 TrialSpawnerBlockEntity.saveCustomOnly；defaults.normal_config / ominous_config 明确展开官方配置访问器的所有默认值（DIRECT_CODEC 编码会省略默认字段，不能只拿编码后的 {} 展示）。含 spawn_range、total_mobs、simultaneous_mobs、total_mobs_added_per_player、simultaneous_mobs_added_per_player、ticks_between_spawn、spawn_potentials、loot_tables_to_eject、items_to_drop_when_ominous；另有 required_player_range / target_cooldown_length，全部来自 FullConfig.DEFAULT，且导出的展开配置再经 DIRECT_CODEC 解析校验。codec/config_codec/state_codec 是官方类型标识，不是可解析的 schema；界面不能从 Codec.toString() 推断字段或范围。

刷怪笼示例默认（来自26.1.2实时保存）：

    {"id":"minecraft:mob_spawner","defaults":{"Delay":20,"MinSpawnDelay":200,"MaxSpawnDelay":800,"SpawnCount":4,"MaxNearbyEntities":6,"RequiredPlayerRange":16,"SpawnRange":4,"SpawnPotentials":[]},"fields":{"SpawnData":{"codec":"SpawnData.CODEC","default":{"entity":{}},"present_by_default":false}}}

试炼配置示例默认（仅摘取数值；实际同时返回战利品/刷怪列表）：

    {"id":"minecraft:trial_spawner","defaults":{"normal_config":{"spawn_range":4,"total_mobs":6.0,"simultaneous_mobs":2.0,"total_mobs_added_per_player":2.0,"simultaneous_mobs_added_per_player":1.0,"ticks_between_spawn":40,"spawn_potentials":[]},"required_player_range":14,"target_cooldown_length":36000}}

### SpawnData 装备（P2-6，26.1.2）

`spawner_info` 的两个条目均新增 `spawn_data_schema`。经典与试炼共用实际 `SpawnData.CODEC`：

```json
{
  "codec": "SpawnData.CODEC",
  "entity_schema": "entity_schema",
  "equipment": {
    "codec": "EquipmentTable.CODEC",
    "optional": true,
    "loot_table": {"registry":"loot_table","required":true},
    "slot_drop_chances": {
      "codec":"EquipmentTable.DROP_CHANCES_CODEC",
      "optional":true,
      "default":{},
      "formats":["float","slot-map"],
      "slots":["mainhand","offhand","feet","legs","chest","head","body","saddle"]
    },
    "sample": {"loot_table":"minecraft:equipment/trial_chamber","slot_drop_chances":{"head":0.25}}
  }
}
```

`slots` 在运行时由 `EquipmentSlot.values()` 经官方 Codec 编码，并非固定前端清单。`sample` 也经官方 Codec 编码，只是样本，不是自动写入草稿的默认配置。实体可用的格子继续请求 `{name:'entity_schema',id:生物ID}`，使用其 `equipment` 行的 `slot / nbtPath / canHold / requiresSnbt / dropChancePath`，详见 [entity-schema-contract.md](entity-schema-contract.md)。全槽枚举不是某个生物实际可用槽的保证。

两种 **equipment 必须区分**：

| 编辑内容 | 相对每个 SpawnData 的路径 |
| --- | --- |
| 直接放入的完整物品栈 | `entity` + `entity_schema.equipment[].nbtPath`（通常 `entity.equipment.head`） |
| 实体自身掉落概率 | `entity` + `dropChancePath`（通常 `entity.drop_chances.head`） |
| 生成时额外应用的装备战利品表 | `equipment.loot_table`，不是物品格，不是 `entity.equipment.loot_table` |
| 战利品装备的掉落覆盖值 | `equipment.slot_drop_chances`，数字或按槽映射 |

试炼的完整前缀分别为 `normal_config.spawn_potentials[i].data` 与 `ominous_config.spawn_potentials[i].data`；两套配置独立保留。经典前缀为 `SpawnData` 或 `SpawnPotentials[i].data`。试炼状态中的 `spawn_data` 也是 SpawnData，但不是两套配置列表，不要误改。`spawn_potentials` 每项是 `{data:SpawnData,weight:正整数}`。

`EquipmentTable.CODEC` 要求 `loot_table`；其 ID 使用现有 `{name:'loot_table'}` 选择器并允许手输数据包 ID。只填写 `slot_drop_chances` 而没有表是无效的。`slot_drop_chances` 省略时为 `{}`（不覆盖），不是所有槽0；数字形式如 `0.125` 为全部槽统一覆盖，映射形式如 `{head:0.25}` 只覆盖指定槽。Codec 是 `FLOAT` 或 `unboundedMap(EquipmentSlot.CODEC,FLOAT)`，**不是0..1范围 Codec**，不能把产品滑块范围冒充原版限制，也不能丢掉已有大于1的保证掉落值。未知槽或非数值被实际 Codec 拒绝。实体的 `drop_chances` 与此字段独立，不要混为一组路径；运行时战利品装备可能覆盖直接设置的槽，编辑器不能承诺同时设置时物品不被替换。

物品组件 `minecraft:block_entity_data` 的 SNBT 形状示例（不是默认值）：

```snbt
{id:'minecraft:trial_spawner',
 normal_config:{spawn_potentials:[{weight:1,data:{
  entity:{id:'minecraft:zombie',equipment:{head:{id:'minecraft:iron_helmet',count:1,components:{'minecraft:custom_data':{n:9223372036854775807L}}}},drop_chances:{head:0.5f}},
  equipment:{loot_table:'minecraft:equipment/trial_chamber',slot_drop_chances:{head:0.25f}}
 }}]},
 ominous_config:{spawn_potentials:[{weight:1,data:{
  entity:{id:'minecraft:skeleton',equipment:{mainhand:{id:'minecraft:bow',count:1}}}
 }}]}}
```

嵌套原版 ItemStack 使用 `components`，不是编辑器wire栈的 `comps`；从保险库取物品须按 [vault-contract.md](vault-contract.md) 保留完整typed侧车后转为嵌套SNBT。修改列表某格时保留权重、其它生物字段、另一套配置、未知字段与未修改的精确类型。`normal_config` / `ominous_config` 也可能是注册表引用字符串；不得把引用误当空对象覆盖。客户端缺少试炼配置注册表时不能自行展开引用，仍交权威服务端校验。

验证：正式 `check` 包含 `spawnerEquipmentTest`，覆盖两类导出、全部实际槽、必填表/默认空覆盖、数字与映射及越界于0..1的原版有效值、无效槽/数值、typed long 嵌套物品、两套配置的官方 block load/save 与真实注册表分页预算；不生成实体、不启动游戏。实机前端格子留待统一验收。

写回：StackCodec.decode 在原版 ItemStack.validateStrict 后调用 SpawnerData.validate，因此客户端预检和服务端权威解码均执行。BLOCK_ENTITY_DATA 的类型是 MOB_SPAWNER/TRIAL_SPAWNER 才触发；未知及其他方块类型不套用此规则。普通刷怪笼整体没有官方 Codec：SpawnData / SpawnPotentials 用其真实 Codec，实际保存的数值字段校验整数/short持久化范围（Delay允许-1，其余≥0）、MaxSpawnDelay≥MinSpawnDelay。试炼用 FullConfig.MAP_CODEC 和 StateData.Packed.MAP_CODEC，包含配置引用解析及各字段官方范围。SpawnData.entity 内的 id 另外校验当前 ENTITY_TYPE 存在性与字符串类型，乘客最多16层；这是因为 SpawnData 的 CompoundTag Codec 本身不检查实体内部id，会静默修复错误id。实体任意内部自定义NBT语义仍由游戏负责，不承诺完整实体NBT schema校验。失败抛出可读错误，调用方保留原物品/草稿；这里只验证物品组件，不放置方块、不生成实体。

离线/远程服务器：没有宿主时前端不得伪造这些数据；没有客户端世界，entity_info / spawner_info 回 done:true、entries:[]、error；equipment_slot_groups / entity_base_attributes 可读本地已启动的注册表。多人环境用客户端同步的 RegistryAccess；服务端独有、未同步的模组/数据包信息无法凭空获得，配置引用无法解析时返回错误页，用户仍可手输id，但提交时由服务端当前 RegistryAccess 再次校验。无 supplier、无刷怪蛋、无变种应分别保留 {} / []，与模板失败区分。单实体模板超分页预算返回错误页，不截断NBT。

试炼注册表同步限制：TRIAL_SPAWNER_CONFIG 在远程客户端可能不提供；StackCodec 此时只做通用物品/组件Codec检查，跳过试炼的附加配置检查，交给持有该注册表的权威服务端执行 SpawnerData.validate。普通刷怪笼始终执行附加检查。不能把客户端预检通过理解为服务器已接受配置引用。

验证入口：tools/entity/verification.init.gradle 的 entityDataTest / entityProbeJar；独立隐藏客户端 tools/entity/run.ps1。探针jar仅用于自测，发行jar不含探针或窗口Mixin。测试回执和限制见同任务交付报告。

2026-11-07 实际回执：entityDataTest 的106项注册表/属性/槽组/Codec与非法边界断言 PASS（logs/entity-reviewed-build.log）；完整 build PASS（logs/entity-final-build.log）。隐藏客户端逐tick查询当前157种实体，157个模板均成功，944项检查 PASS（run/entity-data-probe/entity-data-verification.json、logs/entity-client.log、logs/entity-client-runner.log），检查每页预算、UUID清除、id关联、世界实体数量未因临时实体增加和窗口不聚焦，测试结束对应Java进程为0。窗口在GLFW创建时隐藏/禁聚焦/移到屏外，单独Mixin禁止鼠标捕获。此结果是原版+Fabric API+Editor/Oriel 的客户端信息导出，不代表任意模组工厂、远程服务器配置引用或用户已验收实际放置后的刷怪行为；测试未放置/生成实体。

## 2026-11-07 B12/B13 增量（覆盖下文旧性能参数）

预热采集改为 350µs 软预算、每 tick 最多 1024 条；source 初始化、采集、目录提交分 tick，新指标 `max_row_ms` / `max_source_ms`。分页和发送节奏现以本文下节「F：分页与交互优先」为准；1500 字符 / 每 tick 一页是已被替换的旧策略。预热等待请求仍每文档每 tick 最多处理一个。此前合成 75000 条/20TPS 的钩子外计时峰 0.4619ms、预热 5206.7898ms，不能当成真客户端硬实时保证。详见 `backend-performance-2026-11-07.md`、`logs/backend-d/stress.json` 与 `registry-load-timeline.md` 的实机复测。

### F：分页与交互优先（2026-11-07）

- `RegistryIndex` 初始缓存页目标 **20000 UTF-16 字符（含信封）**，在后台编码一次并跨 Document 复用。单个条目可以超过目标，但所有页仍严格不超过 v1 的 **24000** 字符；补充/资源回应仍使用 24000 上限。不能将字符数当作 UTF-8 字节数。
- 每文档分离批量目录和交互回应队列，各最多 64 个批次。初始目录/自动富化纹饰走批量队列；`enum:*`、`block_properties`、`tag:*`、`tags:*`、`entity_info`、`item_defaults_one`、战利品表、配方、模型/资源以及显式重取目录等请求，在结果就绪后全部走交互队列。每发一页重新选择，交互优先；同一优先级按批次轮转，单个大请求不会独占余下全部槽位。异步采集尚未就绪时仍允许继续推目录，不会等待 future。
- 同 key+请求上下文（id/field 等）合并在途交互批次，保留游标；批量批次被显式请求提升时也保留进度。不同 id/field 不合并。目录被打断后继续原游标，信封的 version/generation/name/offset/total/entries/done 不变；前端仍按 offset/total/done 合页。自动富化结果可替换尚未送完的同 key 批量快照，从 offset 0 重发完整富化目录。
- 所有文档共用 **2ms 发页启动截止时间**和**每 tick 最多 8 页的硬数量上限**。每页实测 nanoTime 耗时更新下一页预测（至少 50µs，取当前页与上一估计的 3/4 较大值）；剩余预算小于预测时不再开始下一页。快路径可一次发 2–8 页，慢页时会降到 1 页；不会为凑页数突破截止检查。
- **2ms 不是单 tick 墙钟耗时的硬上限。** `DocumentDriver.patchJson` 的同步 JSON 解析/脚本回调不能从 Editor Java 中抢占，单页、GC、OS 抢占均可能越界；截止后不再启动新页，但已在执行的一页必须完成。在“不改 Oriel、游戏/脚本仍在客户端线程”的约束下，无法实现严格的墙钟硬上限。`max_push_tick_ms`、`max_push_page_ms`、`push_budget_overruns` 如实记录越界；`max_push_pages_per_tick` 记录实际突发量。此限制也是任务中硬实时目标的未完成部分，不以页数上限冒充耗时保证。
- 世界/语言/标签/资源重载变代时清空两种待发队列、预热等待请求与补充缓存，重新预热；Document 更换清空待发页并重放当前代目录。预热前排队请求绑定 Document，旧文档的请求不再回放到新文档。普通按需查询使用当前 generation，不再推进全局世界代号。具体实测数字与未测范围见 `registry-load-timeline.md`「改进后」。

草稿分块累计 UTF-8 计数，支持代理对跨块；最终严格 JSON/深度/大小检查保留。偏好首次读取后走内存缓存（外部配置变更需重启），普通 tick 冻结 JSON 后交单线程后台序列化、原子落盘；最多一个在途写入且全局写入间隔至少 500ms，保留每键防抖、失败重试和关闭/退出强制等待 flush。`accepted` 仍仅表示接收进队列。

试听当前页面走 `sound_preview` 宿主通道，调用 Minecraft SoundManager，无短时上限。官方 Cat 资源为流式；仅通过无设备状态机和缓存资产检查，**不代表长音频实际播放验收通过**。最少用户复测步骤见上述回执 B14。

## 试听与资源线索（v1扩展）

- jukebox_songs新增sound_event（完整声音事件id）、length_in_seconds、comparator_output、description（当前语言文本）；instruments新增sound_event、use_duration、range，全部直接读当前注册对象；沿用原name/id，不改变原key。前端可把sound_event交给oriel.playSound试听。
- oriel.send("registry",{name:"tooltip_style"}) → registry.tooltip_style，entries=[{id,name,has_frame}]；枚举ResourceManager的textures/gui/sprites/tooltip/**/*_background.png，去目录与_background.png得到ns:name（保留子路径），同路径_name_frame.png存在时has_frame=true。原版background.png/frame.png没有自定义样式前缀，按此目录合同不伪造一个样式id。含资源包覆盖及模组资源。
- oriel.send("registry",{name:"item_model_hints",id:"minecraft:diamond_sword"}) → registry.item_model_hints，同v1分页信封带id（请求id）；若该id是注册物品，先取Item.components().ITEM_MODEL，否则直接当模型定义id。读取items/<path>.json，递归model对象及models/<reference>.json/parent，合并相同kind/index：entries=[{kind:"flag"|"range"|"select"|"color",index,thresholds?:[number],cases?:[string]}]。condition/range_dispatch/select仅匹配官方custom_model_data属性，color来自custom_model_data tint，缺index取官方缺省0；选择cases支持单字符串/字符串数组，阈值/选项去重。没有资源或没有相应分支返回空页；解析/结构失败回空页+error，不抛入客户端tick。
- 解析器只读JSON：单资源≤1Mi字符、引用资源合计≤4Mi字符、最多256文件/100000节点/96层；循环引用去重。资源结果按generation缓存≤64项，在途最多8个，超限明确错误可重试。资源重载后清空。不执行模型表达式或任何脚本。

## 性能与预热

RegistryBridge.initialize()幂等，只注册tick、客户端标签/资源重载钩子并异步预载纯JSON/JDK代码，不读取世界/注册表、不阻塞启动。首次进入世界后每tick在主线程采集当前holder/本地化快照（700µs软预算，在单个条目边界让出），后台只处理已脱离Minecraft对象的JSON：排序、id索引、search_key=小写本地化名+空格+完整id、分页序列化。大型附魔关系提前用field_ref，避免为每个条目展开大型item tag。各kind异常隔离为错误页，其余kind继续；新代索引准备完成后页面使用该代缓存。

初始页目标 20000 UTF-16 字符，只预编码一次；发送采用上文 F 节的交互优先、2ms 截止检查及每 tick 最多 8 页策略。后台任务队列最多64；过载返回错误页。世界/语言对象变化、客户端TAGS_LOADED、资源重载触发新generation，清空旧待发/资源缓存并重新预热；普通Document重载仅重放当前缓存。meta 最先排队，items 最先进入批量目录，其余kind与后续页轮转到达，前端必须等各自done再判定完整；meta不代表所有页已送达。

合成压力用同一RegistryWarmup/RegistryIndex代码、20TPS节奏，50000物品+20000声音+5000附魔（每附魔8标签/8支持物品/互斥关系）：首次世界预热2120.6928ms，单tick最大0.814ms（采集内计时0.813ms），峰值Java已用heap227.51MiB（相对基线+219.86MiB），取缓存首物品页并解析0.6097ms；logs/registry-stress.json与registry-warmup-final.log留证。这里的heap为测试期采样的JVM已用堆，不是进程RSS，也不等于玩家模组包总体内存；没有伪装成真的注册了75000个Minecraft对象。游戏世界已注册对象序列化另由真客户端探针验证。

纯JSON/JDK第一次类加载曾在冷基准形成24.27ms峰值，现已移到初始化后的辅助线程prime（无游戏数据读取）；上述数字是完成此实际启动预载后首次世界预热，不是忽略冷启动代价。700µs是协作式预算，不是强抢占保证；OS调度/GC/单个模组超重Codec仍可能超过5ms，不能承诺所有模组包绝不卡顿。

真客户端最新回执registry-verification.json：预热1703.3189ms，采集tick峰6.1423ms，推送tick峰9.0016ms（registry.items），整个registry钩子tick峰9.3775ms，缓存打开到首页物品首批可用154.4719ms，page_errors=0、功能验证PASS；**实机单tick峰值尚未达到<5ms目标**，不得用合成压力的0.814ms代替这个事实。此前同代码路径一次实机采集3.9672ms/推送2.1592ms、首页141.1148ms，说明调度/JIT/GC波动仍存在，需要在用户实际大型模组包进一步profiling和把页面解析/监听更新成本分帧。日志registry-warmup-runner.log/registry-client.log；本轮仅独立离屏run，无系统输入，已退出。

## 物品原型默认组件（v1扩展）

- oriel.send("registry",{name:"item_defaults"}) → registry.item_defaults，同v1分页包，每页含信封≤24000 UTF-16字符，entries=[{id,comps,tags}]。
- oriel.send("registry",{name:"item_defaults_one",id:"minecraft:diamond_sword"}) → registry.item_defaults_one，同分页包，额外带id关联请求，entries仅该物品；未知id为空页+error。
- comps直接读取Item.components()的原型完整默认映射，绝不使用新ItemStack的空patch。键沿用StackCodec.snapshot：minecraft:前缀省略，模组组件保留完整id；普通值直接用组件自身Codec与当前RegistryAccess的JsonOps序列化，不做UI schema转换。tags为当前item holder的全部标签id，不带#。
- CustomData值导出SNBT字符串，另带component_formats:{custom_data:"snbt"}（模组键同理），保留byte/long/int-array等NBT类型；普通字符串组件没有此标记。仅网络/瞬态、没有持久化Codec的组件无法可靠转JSON，以unsupported_components:[组件id]显式列出，不伪造默认值。单个物品条目若超出一页预算，回空页+error，不截断；前端可用单件接口独立请求其他物品。

## 组件 Codec 校验与类型保真写回（B3 / B15，2026-11-07）

- 页面发送 `oriel.send("validate_component",{requestId:"唯一关联值",component:"minecraft:entity_data",snbt:"{id:'minecraft:pig',Health:7.0f}"})`；也支持 `{component,format:"snbt",value:SNBT字符串}` 或 `{component,format:"json",value:JSON值}`。组件ID允许省略minecraft命名空间，模组组件沿用其注册ID；不使用固定组件白名单。
- 宿主在客户端线程用当前世界RegistryAccess和该DataComponentType的真实持久化Codec解析，回顶层字面键 `validate_component.result`：成功 `{requestId?,component:完整id,ok:true,format,normalized,snbt:规范SNBT字符串,json:规范JSON值}`；失败 `{requestId?,component?,ok:false,error:诊断文本}`。SNBT模式normalized是SNBT字符串，JSON模式normalized是JSON值。JSON视图无法表达NBT数值/数组类型，不能用它替代SNBT保真提交。无持久化Codec、未知ID、非法引用/格式明确拒绝，不使用partial结果。
- 本地页面消息≤8192 UTF-16字符；每页每秒最多20次校验，规范化回执≤24000字符，错误文本≤2000字符；超限/离开世界返回ok:false。此接口仅只读校验，不写物品、不授予保存权限。组件Codec对于entity_data、block_entity_data内部任意NBT键通常只约束外层复合结构和type id，并不保证Health等任意字段的玩法语义；刷怪笼附加检查见SpawnerData。
- 原有apply的 `comps` 仍兼容JSON值；新增可选 `component_formats:{entity_data:"snbt"}`，对应 `comps.entity_data` 必须是完整组件SNBT字符串。按组件标记，未标记的仍按原JSON协议。宿主在NbtOps里替换相应组件后走原版ItemStack.CODEC、validateStrict、服务端权限/基线/槽位检查及既有两阶段提交；支持六个原始组件与任意有持久化Codec的模组组件。
- StackCodec快照保留原有JSON `comps`，另带 `component_snbt:{组件短id:该组件的规范SNBT字符串}`。这是权威快照的类型保真伴随值；Java解码只在该SNBT经组件Codec重新编码的JSON与当前comps相同时采用，JSON编辑后不匹配的旧伴随值被忽略；显式component_formats优先。用于服务端commit/saved→客户端→创造槽位包的byte/long/typed-array保真，避免仅在首段提交保真、后续回执又丢类型。页面无需把旧伴随值盲目复制到新草稿。
- 前端当前applyToGame尚未传component_formats，需另接；现有JSON编辑流程不因此自动获得手写SNBT的数值类型保真。原版未知组件/未修改值仍按工作副本保留。试炼刷怪器的配置注册表不向客户端同步，客户端只做组件Codec检查，额外FullConfig检查在持有TRIAL_SPAWNER_CONFIG的服务端执行，不能因客户端缺该注册表拒绝合法提交。

## 物品分类事实元信息（B4，2026-11-07）

- 已有item_defaults可直接推导：tool/weapon/kinetic_weapon/piercing_weapon、food/consumable、equippable.slot及属性修饰符、bundle_contents、container、potion_contents、书/烟花/唱片/旗帜等默认组件的存在与值；刷怪蛋默认entity_data.id也能提供默认实体类型。它们表示能力，可同时存在，不应被单一静态类别覆盖。
- 仅靠默认组件不能可靠确定物品Java类型是否BlockItem/SpawnEggItem/ProjectileWeaponItem、物品对应方块/方块实体、空容器真实格数、收纳袋标准容量。空container列表不是0格，也不能从ID名字或默认27推断。新增 `oriel.send("registry",{name:"item_meta"})` / `{name:"item_meta_one",id:"minecraft:hopper"}`，回 `registry.item_meta` / `registry.item_meta_one`，沿用v1 generation/offset/total/entries/done分页信封和≤24000字符页；单件响应额外带请求id；未知id为空页+error。按需导出，推荐单件接口，完整目录会同步遍历当前物品/方块实体。
- entries条目：`{id,block_item:boolean,block?:完整方块id,block_entity_type?:完整id,spawn_egg_entity?:完整实体id,equipment_slot?:序列化槽名,armor_slot?:序列化槽名,tool:boolean,weapon:boolean,ranged_weapon:boolean,food:boolean,consumable:boolean,container_size?:整数,bundle:boolean,bundle_capacity?:{numerator,denominator},bundle_capacity_source?,bundle_reference_item?,bundle_reference_count?,metadata_error?}`。tool等方便标记来自实际默认组件；ranged_weapon读ProjectileWeaponItem，armor_slot仅在equippable与实际ARMOR属性修饰符同时存在时给出，头颅不会只因能戴在head就被称为盔甲。
- block/block_entity_type来自实际BlockItem及其默认方块状态创建的临时BlockEntity，读取后丢弃，不放置、不加入世界、不调用实体tick。container_size读Container.getContainerSize，营火读取其实际getItems().size；箱子是单个方块的格数，不代表连接后的大箱子。依赖世界的模组实体创建失败带metadata_error；无可读容器接口则省略container_size，表示未知/不适用，绝不补27。末影箱的玩家背包不能冒充物品容器。
- bundle_capacity用官方BundleContents.Mutable插入规则饱和取得Fraction（当前原版1/1），不是写死64个物品；reference_item/count是该次运行从实际可收纳物品中选择的容量测量样本，非白名单。source="minecraft:bundle_contents"明确这是官方组件规则，不保证另行覆写交互的模组拥有相同自定义容量。每个物品真实重量仍有原版特殊规则，不能仅用count/max_stack_size代替全部逻辑。
- 后端未改前端静态ikind或SLOT_COUNT；前端须使用item_defaults+item_meta替换，缺失元信息明确未知。

## B3/B4/B15 验证回执

`tools/backend-data/run.ps1 -ClasspathJson <已导出的runtime-classpath.json> -TestWorld <独立测试世界目录>` 使用Java25已解析依赖/最新access-widened Minecraft jar编译当前全部Java，再启动独立 `.backend-b/run` 客户端；仅测试探针的窗口创建前设置hidden/unfocused、移出屏幕并禁止抓鼠标，主音量0，无系统输入，不触碰用户运行目录。探针不进入发行jar。

- `logs/backend-b/backend-data-verification.json`：真实原版注册表/Codec、六类SNBT及试炼刷怪器、session确认、原版NBT持久化、权威快照无original时类型保真、运行时全部物品元信息；详细日志codec.log。
- `logs/backend-b/backend-data-e2e.json`：7个真实applyToGame→Java→集成服务端→重新读取/原版持久化场景（刷怪蛋、刷怪笼、试炼刷怪器、鱼桶、装填弹药、锁、自定义数据），另1个component_formats显式SNBT的真实宿主apply，核对byte/超2^53长整数/int-array经过commit回执与创造槽位包仍精确一致；共8场景PASS，日志client.log/runner.log。验证物品组件，不放置/生成实体，不代表实际刷怪或视觉验收。
- `node tools/audit-backend-status.cjs`从当前index.html真实脚本顺序重核70项数据来源及68项非CARDS组件入口，更新两份STATUS文档，源码SHA256在ui-source-audit.json；后续前端改动须重跑。
- 当前有既有Gradle runClient wrapper进程在运行，遵守不并发启动Gradle规则，本worker没有另跑Gradle；执行全源javac与既有StackCodecTest/EditorSessionsTest/TestKitTest的结果见compile-all.log、regression.log。可在其他Gradle结束后执行 `bash tools/gw.sh -I tools/backend-data/verification.init.gradle :fabric:26.1.2:backendDataTest :fabric:26.1.2:build --no-problems-report` 重跑正式构建。

## 草稿持久化（v1扩展）

初始读取仍为oriel.data.prefs.drafts，形状是{[槽位语义键+物品id]:草稿JSON字符串}；键由前端确定，是不解释执行的opaque字符串，1–1024 UTF-8字节、不得含控制字符。草稿须为严格JSON文本、嵌套≤128层；单条原始文本≤200KiB（204800 UTF-8字节），最多8条，整个drafts map序列化后≤1MiB（1048576 UTF-8字节，含键/JSON转义）。

沿用config/cadeditor-ui.json、500ms合并、同目录临时文件原子替换、失败保留待写值并重试、关闭/退出flush。put和单件get触碰LRU；插入第9条或超过总字节预算时逐出最久未使用条目；LRU由map键插入顺序落盘，重启保留。读取整个map不触碰所有条目。大草稿需要分块，因为页面消息仍≤8192字符。

页面发送oriel.send("drafts", {...})，宿主回顶层字面键drafts.result：{op,status:"accepted"|"rejected",key?,value?,reason?,upload?,offset?,done?}。accepted表示已校验/加入500ms写入队列，不是同步磁盘提交承诺。put/clear/完整get成功时同时driver.patch("prefs",完整偏好)，仍读oriel.data.prefs.drafts，不是字面键prefs.drafts。

- {op:"get"}：完整prefs（含drafts），没有草稿时drafts可缺省为空map。
- {op:"get",key}：drafts.result.value为该草稿原始JSON字符串，不存在为null；同时触碰LRU。
- {op:"put",key,value:JSON字符串}：小草稿保存；原子更新单条，其他草稿保留，超单条限制拒绝且保留原值。
- {op:"clear",key}：删除单条，不存在也成功。
- 大草稿：先{op:"begin",key,upload:"前端唯一token",length:完整字符串UTF-16长度}，再按序{op:"chunk",upload,offset:本块起始UTF-16偏移,value:本块字符串,done:是否最后一块}；每个最终JSON消息本身≤8192字符（建议逐块用JSON.stringify检查并≤7000），每秒≤20条并等回执，最后一块done=true。只有完整长度、UTF-8预算及JSON校验均通过后才更新草稿；中途不会覆盖已有草稿。每页只保留一个上传，begin替换旧上传，30秒超时；upload≤128字符。缺块/乱序/错token/超限/无效JSON均拒绝并丢弃本次临时上传。
- 兼容现有prefs通道：oriel.send("prefs",{key:"drafts",value:完整map})可整体替换，使用相同校验，但超8条/1MiB直接拒绝而不做逐出；仍受8192字符消息限制。推荐单条drafts通道，避免并发覆盖整表。

来源为客户端当前世界 RegistryAccess，回退 BuiltInRegistries。名称使用当前语言；缺翻译保留 id。只读，不使用静态 data.js。

## 传输

Oriel 0.11 patch 的 key 是顶层字面键，不是路径。读取 oriel.data["registry.meta"]；页面自行组装 oriel.data.registry。不会覆盖 stack/prefs。

- registry.meta: {version:1, mc_version, locale, mods:[id], generated_at, counts:{items:..., ...}}。
- registry.<kind>: {version:1,generation,name:"minecraft:item",offset:0,total:1500,entries:[...],done:false}。同 key 后页覆盖前页；页面监听 patch 按 generation+offset 合并。最后页 done=true。
- 每个补丁 JSON <=24000 UTF-16字符。相同 key 各页按序投递。宿主观察到新Document后下一客户端tick推送，不等待动效结束；Document重载后自动重新推全量，因为driver只保存最后页。页面也可发registry请求重取。
- 按需：oriel.send("registry",{name:"minecraft:item"})；任意合法注册表（含模组）都可查询，响应 key 为 registry.+name。未知注册表返回空页和 error。初始种类用下列复数别名。
- 页面消息最多8192字符。发布包 docs/zh/pages.md/java-api.md：服务端数据/patch值100000字符、key256；服务器页客户端另限制累积100000。桥仅接入本地页，仍分页控制单值，覆盖同一key。

## 条目

- items: {id,name}
- enchantments: {id,name,desc,max_level,weight,anvil_cost,min_cost,max_cost,exclusive:[id],supported:[itemId],primary:[itemId],slots:[string],tags:[tagId]}。HolderSet/tag全部展开；tags直接读附魔所属标签。desc是注册表description的本地化文本（原版通常就是名称），不伪造玩法说明。min_cost/max_cost是等级1的成本。
- mob_effects: {id,name,category:beneficial|harmful|neutral,color:整数,instant:布尔}
- attributes: {id,name,default,min,max,sentiment}；非范围属性省略min/max。
- sounds: {id,name,subtitle?}；字幕来自SoundManager的实际字幕Component。
- potions/instruments/jukebox_songs/banner_patterns/trim_materials/trim_patterns/painting_variants/damage_types/entity_types/data_component_types/blocks：{id,name}。任意按需注册表也用此结构。

示例：key=registry.enchantments

    {"version":1,"generation":"1730000000000","name":"minecraft:enchantment","offset":0,"total":1,"entries":[{"id":"example:shock","name":"雷击","desc":"雷击","max_level":3,"weight":5,"anvil_cost":2,"exclusive":["minecraft:sharpness"],"supported":["minecraft:diamond_sword"],"primary":[],"slots":["mainhand"],"tags":["minecraft:in_enchanting_table"]}],"done":true}

初始16类在进入世界后分片预热并按generation缓存；打开页面、Document重载和这些注册表的按需请求复用同代索引及已编码分页，不重新采集。世界/Language对象变化、客户端TAGS_LOADED、资源重载完成时失效并重建；新代就绪前不发送旧代数据。其余小型按需注册表/关系仍按当前世界读取。

### 超大关系

exclusive/supported/primary集合超过64成员或数组序列化超过4000字符时，该字段为[]，并带同名_ref，例如 supported_ref={name:"minecraft:enchantment",id:"example:large",field:"supported",total:3000,tag:"example:weapons"}（tag仅HolderSet本身为命名tag时存在）。这是延迟加载，空数组不能解释为无适用物品。页面发 oriel.send("registry",{name:"minecraft:enchantment",id:"example:large",field:"supported"})；回复registry.relation，仍用分页包，但entries是物品id字符串数组，且额外带id/field以区分并发请求；所有关系都完整分页，不截断。

## 音效

页面直接 oriel.playSound("modid:sound",1,1)，沿用Oriel client.soundsPerSecond/maxSoundVolume。注册事件不保证资源包有声音：资源缺失/空事件/播放器静音可无声。宿主不增加权限。

## 官方选项按需扩展（v1向后兼容）

均沿用同一registry消息与分页信封，不改变已有key；响应顶层key为registry.+请求name。每次读取当前注册表/资源管理器/语言，无固定选项表。选择器应保留手动输入；未知/尚未加载的用户id不应被前端选择列表删除。
若完整name本身对应实际注册表，优先按原通用注册表接口读取，避免模组使用tags/tag/enum命名空间时被前缀解析遮蔽；仅没有同名实际注册表时解释以下扩展。

- `oriel.send("registry",{name:"tags:item"})`：registry.tags:item，entries=[{id:"minecraft:logs",count:成员数}]。同理tags:block、tags:damage_type、tags:enchantment；后缀也支持完整注册表id，例如tags:example:custom。id不带#，选择器自行添加#。空标签仍有count:0。
- `oriel.send("registry",{name:"tag:item",id:"minecraft:logs"})`：registry.tag:item，entries为成员完整id字符串数组；每页额外带id（标签id）/field:"members"。同一注册表多标签请求须按id+generation区别，未知标签返回空页+error并保留id/field。后缀同样支持模组注册表。
- `oriel.send("registry",{name:"equipment_asset"})`：registry.equipment_asset，entries=[{id,name}]，来自当前ResourceManager的equipment/**/*.json，去equipment/前缀和.json后缀，保留命名空间/子目录；资源包覆盖按最终可见资源去重。name=id。列出资源id，不读取任意文件或承诺该JSON一定可加载。
- `oriel.send("registry",{name:"enum:dye_color"})`等：registry.enum:<name>，entries=[{id:序列化名,name:本地化名或id}]；支持use_animation、equipment_slot、equipment_slot_group、attribute_operation、rarity、firework_shape、consume_effect_type、dye_color、text_color。实际枚举直接values()/getSerializedName()；consume_effect_type实际是BuiltInRegistries.CONSUME_EFFECT_TYPE注册表，id带命名空间，包含模组注册类型；text_color只取ChatFormatting.isColor()，不含bold/reset等格式。dye_color带rgb=纹理diffuse RGB的24位整数，text_color带rgb=官方文字RGB整数。烟花形状用官方getName()，颜色使用color.minecraft.<id>翻译，其余无官方翻译时保留序列化id。

## component_schema 与 component_validate（26.1.2）

新增真实Codec结构派生接口，完整字段、限额、未知值和56项真实捕获见 [component-schema-contract.md](component-schema-contract.md)。registry请求 name=component_schema，可选id；或name=component_schema:minecraft:food。字面量顶层key为registry.<name>，使用既有分页信封。不会从测试快照提供生产数据。

component_validate为新增只读消息，输入与validate_component相同，顶层component_validate.result在旧回执基础上增加errors:[{path,code,message}]和path_precision；旧validate_component保持不变。路径来自失败子树的真实Codec再解码；无法定位就返回根$。不会用字段树替代最终保存校验。

本地客户端registry access派生，不访问远端文件；当前没有unavailable回执，availability:complete只表示推导完成，字段仍可能unknown。服务器独有/未同步信息不构成已核实。缓存按世界与generation失效。
