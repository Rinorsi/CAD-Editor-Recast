# entity_schema：实体变种、属性、效果、装备与原始数据

2026-11-07 增量：entries[0].views 复用世界实体编辑的 pose/item_frame/painting/display/trades/riding schema；既有字段保持。确切字段、真实 loader 探针、服务端限制和捕获见 [world-entity-contract.md](world-entity-contract.md)。不要把 world.views 中的 schema 当作写入值。

版本：Minecraft 26.1.2 / Java 25。所有选择项来自本次运行的实体、注册表、组件 Codec 或官方 setter/常量。下面的采集来自真正的原版工厂与 NBT loader，不是手写实体选项表；尚未启动新的真实游戏客户端验证消息投递。

## 请求与响应

```js
oriel.send('registry', {name:'entity_schema', id:'minecraft:cat'});
// 接收 literal key: registry.entity_schema
// 与 entity_info 一致：按 page.id + generation 区分请求，entries[0] 是 schema。
// 也支持 name:'entity_schema:minecraft:cat'，接收 registry.entity_schema:minecraft:cat。
```

信封沿用 RegistryPages：`{version:1,name,generation,id,offset,total,entries,done}`。普通请求没有逐实体的独立 key，不能监听 `registry.entity_schema:<id>` 来等普通请求。没有全量/分页所有实体的 schema 接口。原版单实体响应小于 24000 UTF-16 字符限制；过大的模组单条响应返回 error，不截断选项冒充完整列表。

客户端线程创建临时实体，不加入世界、不 finalizeSpawn、不 tick。工厂初值先经过一次真实 load/save 正规化（`defaults_source:'factory-load-save'`），避免骆驼科 Strength=0、史莱姆未按 Size 更新属性等构造阶段哨兵值变成不可回读默认值。UUID 被移除。

`EntitySchemaValidation.schema` 按 Level/实体缓存，调用者获得深复制，不能修改缓存。RegistryBridge 的世界、语言、标签/资源代际变化及断开世界会清除；服务端数据包重载清除验证缓存。schema 请求 generation 为 `entity-schema-<代号>`，同代重复请求不重复跑工厂探测。与 entity_info 的逐请求 generation 不同。

离线/未进入世界：空页，保留请求 id，带中文 error；未知/非法实体 id 同样空页+error。已知实体工厂或序列化不可用：返回单条 `{id,available:false,canBePreviewed:false,variants:[],equipment:[],flags:[],preview,warnings}`。不要用原版预置列表补齐。

## Schema 字段

| 字段 | 含义 |
| --- | --- |
| id / available | 完整实体 ID；能否建立并回读默认模板 |
| defaults_source / default_nbt | 正规化来源与 SNBT。用于检查/原始编辑；包含位置等默认字段，创建刷怪配置时应只写 `{id,修改字段}`，不要把整份模板照搬成 SpawnData |
| variants | 经 setter → save diff → 新实体 load/save 验证的有限选择项 |
| equipment | 通过真实 canUseSlot、setItemSlot、save 验证的槽位、路径和掉落概率 |
| flags | `common:true` 为已验证常用控件；其余 `common:false` 原样列出默认 NBT 顶层字段，交给原始编辑 |
| preview | EntityType.getDimensions 得到 width、height、eyeHeight（世界单位） |
| canBePreviewed | 工厂、默认 NBT 可用；不是对每个模组自定义 renderer 或 Oriel 渲染成功的保证 |
| warnings | 不支持/探测失败原因，不根据异常编造选项 |

### variants

每项：`{id,label,kind,registry?,nbt:{path:[...],valueFormat:'snbt',mask?},default,options:[{value,label,snbt}],min?,max?,semanticMin?,semanticMax?}`。`value`、`default` 是实际保存的 NBT 值转 JSON；`snbt` 保留 byte/int/string 等精确类型。label 是真实组件 Codec 值或真实枚举名；没有官方翻译时保持 ID/名称，未杜撰中文名。

- 注册组件：遍历实体 `get(component)`，Holder 从其真实 registry 枚举，Enum 从真实 values 枚举；调用 `setComponent`，验证 setter 的 getter 回读也相等。
- NBT key/path **通过修改前后的保存差分发现**，不根据组件名猜。例如 cat → `variant`，sheep → `Color`，parrot/axolotl → 各自保存字段。
- 补充 API 适配：马 Markings 枚举通过实际私有 setVariantAndMarkings；羊驼 Strength 的真实 setter 极值钳制推导范围；村民职业从 registry、等级从 VillagerData 官方 MIN/MAX；史莱姆 Size 从实际 setter 极值钳制推导。反射绑定的是 26.1.2 API，不是数据选项清单。
- `min/max` 若出现指 **存储值**范围；`semanticMin/Max` 指 getter 的语义范围。例如史莱姆保存 `Size = 实际尺寸 - 1`，不能把显示尺寸当 NBT 值。羊驼等普通整数则二者相同。
- 多个变种共享 NBT 整数时必须合并 mask：`newValue = (oldValue & ~mask) | (option.value & mask)`。马的毛色与斑纹共用 Variant，热带鱼图案/体色/纹色也共用 Variant；不能后写选项覆盖整个整数。mask 由保存值异或差分得到，原版实际组合已测试。
- 未识别的模组专有非枚举组件不猜测；没有可验证选项时 variants=[]。
- 泛型 Boolean 组件通过真实 setter/Codec 探测 false/true。单组件超过256选项则整体省略并明确 warnings，保持原始 NBT 可编辑，不返回截断的假完整下拉列表；这是运行预算，不是游戏数据清单。

### equipment

每项：`{slot,nbtPath:[...],canHold,dropChance?,dropChancePath?,requires?,requiresSnbt?}`。26.1.2 实测保存到 `equipment.<slot>`；这个路径通过放入一个注册表中的真实物品并保存发现。掉落概率从真实 Mob.getDropChances 读取，路径通过 setGuaranteedDrop 后保存差分发现（实测 `drop_chances.<slot>`），不假设旧 HandItems/ArmorItems 数组。

`canHold` 表示默认状态的 canUseSlot，不保证模型有对应可见部位。盔甲架默认双手 false；实际 setShowArms(true) 后支持，导出 `requires:{ShowArms:1}` / `requiresSnbt:'{ShowArms:1b}'`。启用这些手持槽应同时应用前置条件。盔甲架身体/鞍槽未宣称支持。装备 NBT 值是完整 ItemStack（含 id/count/components），由官方 ItemStack Codec 校验并回读。

### flags

常用字段：`{id,key,type,default,present_by_default,common:true,enabledValue,enabledSnbt,min?,max?,max_scope?,babyAge?,adultAge?,roundtrip?}`。

- `type`: byte-bool / int / float / component / string。布尔 default 统一为 JSON boolean，写回用 0/1 或精确 enabledSnbt；原版 entity loader 接受 int 0/1，保存成 byte。
- 字段通过真实 setter 差分发现；false/default 时省略的字段仍可作为 optional common 控件，`present_by_default:false`，不把“省略”解释成“不支持”。
- `enabledValue/enabledSnbt` 是探测样本，供类型证明/开关使用；**CustomName 的 schema probe 文本和 Health 的半血样本不是界面默认值**。控件默认使用 default，名字由用户输入。
- NoAI/PersistenceRequired 仅 Mob；Health 仅可验证的 LivingEntity。普通实体的 Silent、Invulnerable、NoGravity、Glowing、CustomName、CustomNameVisible 均按真实保存结果导出；无字段/无实际持久化则不臆造。
- Health min=0，max 是当前默认实体的 max_health，`max_scope` 表明这是默认值。apply 会先加载实际变种/attributes 再计算最大生命值，例如 Size=4 的史莱姆（实际5级尺寸）可接受 Health=20，不能按默认小史莱姆的 max=1 拒绝。
- CustomName 使用真实 ComponentSerialization.CODEC 可接受的文本组件 JSON，写 SNBT 例如 `{text:'Hello'}`。26.1.2 可能将其正规化为字符串 tag；按组件语义比较，不能要求原始 compound/string tag 结构相同。
- 年龄实体：key 通过 setBaby 保存差分得到 Age；`babyAge/adultAge` 从真实 setter 后的 age 字段读取（原版本次分别 -24000、0），不是硬编码。**客户端 AgeableMob.getAge/save 只能返回 baby 的正负号（-1/1）**，因此 `roundtrip:'baby-sign-only'`。UI 的幼年开关写 babyAge，成年写 adultAge，不要写 enabledValue=-1 来冒充完整成长时长。服务端做精确 Age 回读；僵尸一类则实际 key 为 IsBaby，type=byte-bool。
- 盔甲架另有真实 ShowArms common 开关，便于启用手持槽。其他默认键仍留在 raw 列表。

## 写回校验与保留原则

客户端 apply 与服务端 apply 在 StackCodec.decode 后、修改槽位前调用 `EntitySchemaValidation.validateStack(next,level)`。异常由既有流程返回 `invalid_request` 与中文原因，原物品/草稿保持既有失败处理。ENTITY_DATA 与经典/试炼刷怪器内嵌 SpawnData、SpawnPotentials 的实体都走校验。已有 SpawnerData 的官方刷怪器 Codec/范围校验继续保留。

1. 检查真实实体 ID、已导出变种选项、布尔 0/1、整数/Health 范围。
2. 创建另一份临时实体，官方 TagValueInput 加载，ProblemReporter 报错即拒绝；保存后检查变种/常用开关是否保留（允许数字 tag 类型转换、文本组件等价、客户端 baby 符号语义）。
3. 装备使用官方 ItemStack Codec/validateStrict，并比较加载后的装备；乘客递归校验，最多16层。
4. 未识别的模组字段不重写、不删；按真实 loader 读取并报告其 Codec 错误。无法推断未知字段的额外业务规则，不声称支持模组任意自定义 setter。

验证不会把 loader 正规化后的 NBT 覆写回 ItemStack，因此不丢失原始未知键、数值侧车或组件内容。游戏实际生成实体时再由原版加载。

## 实际覆盖与限制

运行 `pwsh -NoProfile -File tools/entity/schema-test.ps1`。使用已有依赖 classpath，直接 javac 编译当前全部生产 Java 与本测试；不启动 Gradle/Minecraft/图形窗口。客户端语义 Level fixture 覆盖 cat、wolf、horse、llama、parrot、rabbit、fox、axolotl、sheep、villager、zombie_villager、slime、creeper、armor_stand、tropical_fish、pig、chicken、frog、zombie、mooshroom、item。每个选项实际加载/回存，common flags/装备路径同样实际加载，马/热带鱼组合 mask 有额外用例。item 用于验证无变种的通用回退，player 工厂缺失验证 unavailable 回退。

`tools/entity/integration.init.gradle` 已把 EntitySchemaTest 加入整套 JVM 门禁；`tools/entity/verification.init.gradle` 另提供 `entitySchemaTest` / `entitySchemaServerTest` 两个任务。Gradle 接线仅静态检查，用户客户端仍在运行时不执行这些任务。

同一套测试另用服务器侧语义 fixture 检查精确年龄等行为；村民交易生成要求真正 ServerLevel，**服务器侧 fixture 跳过 villager**，客户端全部变种已覆盖。这不是启动真实专服或联网验证。没有在这个 bootstrap JVM 加载第三方实体模组，实际模组兼容性尚待真实整合包验证。

还有用户 Minecraft/runClient 正在运行时，依任务限制不启动 Gradle 或新游戏；真实客户端投递、3D renderer 与服务器联网 apply 为 real-client run pending。门禁和完整输出见 `logs/entity-schema/runner.log`、`compile-main.log`、`tests-client.log`、`tests-server.log`、`spawner-apply.log`、`processes.txt`。

## 本次真实采集响应

完整 cat/sheep/zombie/slime/armor_stand/wolf/villager entries 保存在 [entity-schema-examples-26.1.2.json](entity-schema-examples-26.1.2.json)，来自本测试实际工厂采集；wolf 的 `tamed_sample_nbt` 另外记录真实驯服后保存值。它们不是运行时数据源。下列历史 JSON 是原有字段的节选（options 与 flags 为节选，不是完整选项表）；新增字段的完整采集在 `logs/entity-schema/details-client.json`，新节选见文末。

### cat

```json
{
  "id": "minecraft:cat",
  "preview": {
    "width": 0.6,
    "height": 0.7,
    "eyeHeight": 0.35
  },
  "canBePreviewed": true,
  "variants": [
    {
      "id": "minecraft:cat/variant",
      "label": "minecraft:cat/variant",
      "kind": "holder",
      "nbt": {
        "path": [
          "variant"
        ],
        "valueFormat": "snbt"
      },
      "default": "minecraft:black",
      "options": [
        {
          "value": "minecraft:red",
          "snbt": "\"minecraft:red\"",
          "label": "minecraft:red"
        },
        {
          "value": "minecraft:white",
          "snbt": "\"minecraft:white\"",
          "label": "minecraft:white"
        }
      ],
      "registry": "minecraft:cat_variant"
    },
    {
      "id": "minecraft:cat/sound_variant",
      "label": "minecraft:cat/sound_variant",
      "kind": "holder",
      "nbt": {
        "path": [
          "sound_variant"
        ],
        "valueFormat": "snbt"
      },
      "default": "minecraft:classic",
      "options": [
        {
          "value": "minecraft:classic",
          "snbt": "\"minecraft:classic\"",
          "label": "minecraft:classic"
        },
        {
          "value": "minecraft:royal",
          "snbt": "\"minecraft:royal\"",
          "label": "minecraft:royal"
        }
      ],
      "registry": "minecraft:cat_sound_variant"
    },
    {
      "id": "minecraft:cat/collar",
      "label": "minecraft:cat/collar",
      "kind": "enum",
      "nbt": {
        "path": [
          "CollarColor"
        ],
        "valueFormat": "snbt",
        "mask": 15
      },
      "default": 14,
      "options": [
        {
          "value": 0,
          "snbt": "0b",
          "label": "white"
        },
        {
          "value": 1,
          "snbt": "1b",
          "label": "orange"
        }
      ]
    }
  ],
  "equipment": [
    {
      "slot": "mainhand",
      "nbtPath": [
        "equipment",
        "mainhand"
      ],
      "canHold": true,
      "dropChance": 0.085,
      "dropChancePath": [
        "drop_chances",
        "mainhand"
      ]
    },
    {
      "slot": "offhand",
      "nbtPath": [
        "equipment",
        "offhand"
      ],
      "canHold": true,
      "dropChance": 0.085,
      "dropChancePath": [
        "drop_chances",
        "offhand"
      ]
    }
  ],
  "flags": [
    {
      "key": "NoAI",
      "type": "byte-bool",
      "default": false,
      "present_by_default": false,
      "id": "no_ai",
      "common": true,
      "enabledValue": 1,
      "enabledSnbt": "1b"
    },
    {
      "key": "Health",
      "type": "float",
      "default": 10.0,
      "present_by_default": true,
      "id": "health",
      "common": true,
      "enabledValue": 5.0,
      "enabledSnbt": "5.0f",
      "min": 0,
      "max": 10.0,
      "max_scope": "default_entity; apply recomputes after variant/attributes load"
    },
    {
      "key": "Age",
      "type": "int",
      "default": 1,
      "present_by_default": true,
      "id": "baby",
      "common": true,
      "enabledValue": -1,
      "enabledSnbt": "-1",
      "babyAge": -24000,
      "adultAge": 0,
      "roundtrip": "baby-sign-only"
    }
  ]
}
```


### sheep

```json
{
  "id": "minecraft:sheep",
  "preview": {
    "width": 0.9,
    "height": 1.3,
    "eyeHeight": 1.235
  },
  "canBePreviewed": true,
  "variants": [
    {
      "id": "minecraft:sheep/color",
      "label": "minecraft:sheep/color",
      "kind": "enum",
      "nbt": {
        "path": [
          "Color"
        ],
        "valueFormat": "snbt",
        "mask": 15
      },
      "default": 0,
      "options": [
        {
          "value": 0,
          "snbt": "0b",
          "label": "white"
        },
        {
          "value": 1,
          "snbt": "1b",
          "label": "orange"
        }
      ]
    }
  ],
  "equipment": [
    {
      "slot": "mainhand",
      "nbtPath": [
        "equipment",
        "mainhand"
      ],
      "canHold": true,
      "dropChance": 0.085,
      "dropChancePath": [
        "drop_chances",
        "mainhand"
      ]
    },
    {
      "slot": "offhand",
      "nbtPath": [
        "equipment",
        "offhand"
      ],
      "canHold": true,
      "dropChance": 0.085,
      "dropChancePath": [
        "drop_chances",
        "offhand"
      ]
    }
  ],
  "flags": [
    {
      "key": "NoAI",
      "type": "byte-bool",
      "default": false,
      "present_by_default": false,
      "id": "no_ai",
      "common": true,
      "enabledValue": 1,
      "enabledSnbt": "1b"
    },
    {
      "key": "Health",
      "type": "float",
      "default": 8.0,
      "present_by_default": true,
      "id": "health",
      "common": true,
      "enabledValue": 4.0,
      "enabledSnbt": "4.0f",
      "min": 0,
      "max": 8.0,
      "max_scope": "default_entity; apply recomputes after variant/attributes load"
    },
    {
      "key": "Age",
      "type": "int",
      "default": 1,
      "present_by_default": true,
      "id": "baby",
      "common": true,
      "enabledValue": -1,
      "enabledSnbt": "-1",
      "babyAge": -24000,
      "adultAge": 0,
      "roundtrip": "baby-sign-only"
    }
  ]
}
```


### zombie

```json
{
  "id": "minecraft:zombie",
  "preview": {
    "width": 0.6,
    "height": 1.95,
    "eyeHeight": 1.74
  },
  "canBePreviewed": true,
  "variants": [],
  "equipment": [
    {
      "slot": "mainhand",
      "nbtPath": [
        "equipment",
        "mainhand"
      ],
      "canHold": true,
      "dropChance": 0.085,
      "dropChancePath": [
        "drop_chances",
        "mainhand"
      ]
    },
    {
      "slot": "offhand",
      "nbtPath": [
        "equipment",
        "offhand"
      ],
      "canHold": true,
      "dropChance": 0.085,
      "dropChancePath": [
        "drop_chances",
        "offhand"
      ]
    }
  ],
  "flags": [
    {
      "key": "NoAI",
      "type": "byte-bool",
      "default": false,
      "present_by_default": false,
      "id": "no_ai",
      "common": true,
      "enabledValue": 1,
      "enabledSnbt": "1b"
    },
    {
      "key": "Health",
      "type": "float",
      "default": 20.0,
      "present_by_default": true,
      "id": "health",
      "common": true,
      "enabledValue": 10.0,
      "enabledSnbt": "10.0f",
      "min": 0,
      "max": 20.0,
      "max_scope": "default_entity; apply recomputes after variant/attributes load"
    },
    {
      "key": "IsBaby",
      "type": "byte-bool",
      "default": false,
      "present_by_default": true,
      "id": "baby",
      "common": true,
      "enabledValue": 1,
      "enabledSnbt": "1b"
    }
  ]
}
```


### armor_stand

```json
{
  "id": "minecraft:armor_stand",
  "preview": {
    "width": 0.5,
    "height": 1.975,
    "eyeHeight": 1.7775
  },
  "canBePreviewed": true,
  "variants": [],
  "equipment": [
    {
      "slot": "mainhand",
      "nbtPath": [
        "equipment",
        "mainhand"
      ],
      "canHold": false,
      "requires": {
        "ShowArms": 1
      },
      "requiresSnbt": "{ShowArms:1b}"
    },
    {
      "slot": "offhand",
      "nbtPath": [
        "equipment",
        "offhand"
      ],
      "canHold": false,
      "requires": {
        "ShowArms": 1
      },
      "requiresSnbt": "{ShowArms:1b}"
    }
  ],
  "flags": [
    {
      "key": "Health",
      "type": "float",
      "default": 20.0,
      "present_by_default": true,
      "id": "health",
      "common": true,
      "enabledValue": 10.0,
      "enabledSnbt": "10.0f",
      "min": 0,
      "max": 20.0,
      "max_scope": "default_entity; apply recomputes after variant/attributes load"
    },
    {
      "key": "ShowArms",
      "type": "byte-bool",
      "default": false,
      "present_by_default": true,
      "id": "show_arms",
      "common": true,
      "enabledValue": 1,
      "enabledSnbt": "1b"
    }
  ]
}
```


## 2026-11-07 最终构建补验

此前的“未跑 Gradle / 等用户关游戏”记录是历史状态。最终门禁已将 componentSchemaTest、entitySchemaTest/entitySchemaServerTest、tooltipTest、worldEditTest 接入正式 check，并运行完整 build。完整输出在 logs/final-gate/gradle-build.log；5个 node UI 测试分别在 node-{world,contract,compact,nbt,search}.log。无关的 Oriel-UI 实例不阻塞 Editor，也不修改或终止它们。真实客户端通道补验使用 tools/final-gate/launch.ps1，新复制世界、正常 runClient、实际猫刷怪蛋页面；最新状态以 logs/final-gate/client-receipt.json 为准。该探针仅证明本机真实页面的 schema/tooltip 请求链，不能代替远程服、多人冲突或完整世界目标 apply 验收。

## 2026-11-07 属性、效果与高级实体数据扩展

本扩展保留原有响应字段、变种、装备与 Health 校验；不增加 UI 文件或第二条协议。新增 `attributes`、`effects`（仅真实保存效果的 LivingEntity）、`extras`、`passengers`、`pose`；驯服动物另有 `tamed_sample_nbt`。原有非 common 的 flags 现在显式标记 `advanced:true`。原始字段仍完整留在 flags，不要求前端把 extras 当作另一份默认 NBT。extras 与 flags 重叠时按顶层 key 去重。

### attributes

每行 `{id,label,base,min?,max?,nbt:{path:['attributes'],idKey:'id',valueKey:'base',modifiersKey:'modifiers'},common,advanced?,effectiveDefaultBase?,roundtrip?,reason?,sample?}`。

- 遍历实时 `BuiltInRegistries.ATTRIBUTE`，只保留该工厂实体真实 `AttributeMap.hasAttribute` 的条目；不维护属性 ID 清单，也不向不具备某属性的实体添加虚假行。第三方注册的属性使用同一条路径。默认 base 从该类型的真实 `DefaultAttributes` supplier 读取；模组注入但 supplier 不包含的实例使用实例 base。label 是 Attribute 的真实翻译 key。
- min/max 来自 `RangedAttribute.getMinValue/getMaxValue`；普通 Attribute 没有可证明范围时只标 advanced。实际 setBaseValue → 保存 → 新工厂实体官方 load → 回存验证，不依据英文名字猜范围。正常 roundtrip=true 的行省略该冗余属性；只有失败行返回 roundtrip:false，并保持该 supplier 属性仍在列表。
- 所有具有真实范围且可往返的属性都 common:true，包含该实体 supplier 实际具有的 scale、max_health、movement_speed、attack_damage、follow_range、armor、armor_toughness、knockback_resistance、step_height、gravity、jump_strength、safe_fall_distance、oxygen_bonus、burning_time、fall_damage_multiplier、explosion_knockback_resistance、water_movement_efficiency、flying_speed 等；某属性未出现代表该实体 supplier 没有它，不能由前端预置一套清单补齐。
- 26.1.2 实测持久化为 `attributes:[{id:'minecraft:scale',base:2.0d}]`，永久 modifier 位于同一条目的 modifiers，格式由 `AttributeInstance.Packed.CODEC` 与 AttributeModifier Codec 校验。更新 base 时按 id 合并并保留 modifiers 及未知条目；不能用新列表覆盖原有所有属性。瞬时 modifier 不属于永久 NBT。
- 史莱姆/岩浆怪的 Size loader 会重新计算 max_health、attack_damage、movement_speed（岩浆怪还会重算 armor）；这些 supplier base 与正规化实体实际默认值不同。它们仍完整导出，但 common:false、advanced:true、roundtrip:false，另外给 effectiveDefaultBase 与原因。前端优先通过 Size 变种改变它们。狼的 max_health 也会在真实驯服状态加载时重算；额外探测改后的 base 不能保留，因此同样 advanced，不能用“默认值恰好相等”冒充可编辑。
- 原版 LivingEntity 在 ClientLevel 加载时跳过 attributes（依赖服务端同步）。本编辑器的脱离世界临时实体在官方 load 前使用**同一个 Packed.LIST_CODEC 与 AttributeMap.apply** 补上这一服务器步骤，再 refreshDimensions；不改真实实体，不伪造 NBT。服务端仍直接走官方加载逻辑。这也让客户端 Health 的最大值校验与服务端一致。
- Health 在新 attributes/变种加载后计算范围。降到 max_health=5 时，vanilla loader 把 Health=20 钳到5；编辑器提交校验延续既有行为，明确拒绝超过新上限的 Health，要求提交者写5，而不悄悄改写草稿。升到 max_health=60 时接受 Health=50。
- `preview.scale={attribute:'minecraft:scale',operation:'multiply',baseline,...}`：预览可用**实际有效 scale / baseline** 乘以 width、height、eyeHeight；modifiers 也影响实际 scale。年龄、史莱姆大小、姿态另算。真实 JVM 用 entity_data 组件提交 scale=2 后，僵尸包围盒从 **0.6×1.95 变为1.2×3.9**，再次保存/加载仍保持。不是只检查 attributes 数字变化。

### effects

`effects={path:['active_effects'],nbt:{path:['active_effects']},registry:'minecraft:mob_effect',common:true,codec:'MobEffectInstance.CODEC',amplifier:{min:0,max:255},duration:{infinite:-1,controlMin:1,codecMin,codecMax,default:0},shape,sample,codecProbes}`。

NBT 形状为 `active_effects:[{id:'minecraft:speed',amplifier:1,duration:200,ambient:1b,show_particles:0b,show_icon:1b}]`。id 必填，其他字段为官方 Codec 的可选字段：amplifier 默认0，duration 默认0，ambient 默认false，show_particles 默认true，show_icon 默认随 show_particles；还有 `hidden_effect` 递归详情 compound（内层没有 id）。选项来源就是现有 mob_effect 注册表选择器，必须保留手动输入 ID，不提供手写效果清单。更新列表时保留 hidden_effect 等高级字段。

**真实 Codec 与产品控件范围有区别，不能把要求中的假设写成原版约束：** 本版本 duration 是 `Codec.INT`，接受0和其他负整数，-1的行为是无限。普通控件只创建 -1 或 >=1 的时长，但 raw/apply 继续接受 vanilla 能接受的 int。amplifier 的有效值为0..255，NBT `UNSIGNED_BYTE` 会先窄化再转无符号，例如整数256实际正规化为0，整数-1正规化为255。codecProbes 是实测证据；apply 不额外拒绝这些 vanilla 可接受的数值。字符串 duration、amplifier、show_icon、未知效果 id、非 compound/非列表等坏形状会被实际 Codec 拒绝，并返回 `active_effects[i]` 路径。测试遍历当前全部注册效果，覆盖 -1/1/200/0/-2/INT_MAX 与 amplifier 两端、所有显示布尔值，以及隐藏效果往返。

### extras、专用数值与高级字段

`extras` 是原始字段的补充元数据：`{key,type,common:false,advanced:true,present_by_default?,default?,nbt?,sample?,sampleSnbt?,storageMin?,storageMax?,probes?,roundtrip?,reason?}`。type 是实际 NBT TagType 名称（例如 SHORT、INT[]、COMPOUND），不是自建类型字典。probe 的 setter/Codec 样本不应作为用户草稿默认值；用户未修改时使用当前 entity_data 或 default。只为探测样本保留 sampleSnbt；已有 flags 中能找到的默认字段不重复一整份 SNBT，以满足真实 registry 传输大小限制。

- Tags：真实 addTag 后保存并往返得到 string list；Fire：setRemainingFireTicks 得到 SHORT ticks；Air：setAirSupply 得到 SHORT。均 advanced，暂不声明安全有界的通用产品控件。storageMin/Max 只是实际 Tag 的存储范围，**不是玩法语义范围**。
- TamableAnimal：真实 setOwnerReference/setTame 后发现 `Owner:[I;0,1,0,2]`（UUID 四个 int），setOrderedToSit 后发现 Sitting byte。Owner 使加载的狼实际 isTame=true；没有额外虚构 Tame NBT 字段。wolf 的真实驯服样本 max_health=40、Health=40；默认工厂 schema 仍是未驯服类型模板，不能把 tamed_sample_nbt 当作所有狼默认值。
- Mob：新增 LeftHanded、CanPickUpLoot 的 common boolean flags，使用真实 setter 差分与回读；原有 equipment.dropChancePath 继续使用真实 drop_chances 路径。DeathLootTable/DeathLootTableSeed 用实体自己的真实默认 loot-table key 做可选加载探测，保存成功才列出 STRING/LONG 高级项，不造选项表。long 的精确值应继续使用 SNBT/既有数值侧车。
- Brain：来自实体真实默认保存，COMPOUND，高级 raw。无法由其 memories 推导有界、安全的通用表单。
- Offers：由真实 MerchantOffers/MerchantOffer/ItemCost Codec 编码，用注册表中的真实物品构造一笔**探测交易**，再交村民工厂加载并读取实际 offers 字段验证。ClientLevel 的 vanilla save 明确跳过 Offers，getOffers 又要求真正 ServerLevel，所以返回 `roundtrip:false`、advanced:true 和原因；不假装客户端保存已证明服务端交易生成。真实 ServerLevel 回存待补验。样本不是村民默认交易，不应自动填入 entity_data。
- VillagerData 的 `{type,profession,level}` 已在原 variants 中提供，type/profession 来自真正注册表，level 来自真实 MIN/MAX，继续复用，不再创建重复选择器。
- slime/magma_cube：既有 slime/size 变种继续使用真实 setter 的范围；本版本实测语义1..127，保存 Size0..126。phantom 新增 phantom/size，实测语义与存储0..64；**真实保存 key 是小写 size**，不按用户示例猜成 Size。所有 options 经工厂 load/save；bounded 变种另附 loaderProbes，记录极端输入正规化/溢出行为，不把它们误称为合法 UI 范围。
- pufferfish PuffState：默认 INT，loader 对高端输入钳到2，但负值实际保留，因此不能宣称原版强制0..2；列为 advanced，返回 -1/0/1/INT_MAX/INT_MIN 的真实 probes。
- creeper：powered BYTE 的可选 true 样本、Fuse SHORT、ExplosionRadius BYTE 都列为 advanced。Fuse 的 INT_MAX 输入回存-1，ExplosionRadius 的 INT_MAX 同样回存-1，这是窄化行为，不是正数安全范围。不会自动创建危险范围滑块。
- zombie CanBreakDoors：真实 setter 发现 BYTE，advanced，附真实数值正规化 probes。其余默认数值/compound 一并以真实类型列入 extras；没有列在 extras 的默认字段仍在原始 flags，不丢字段。
- Pose：通用 Entity.setPose(CROUCHING) 在当前原版这些实体中不持久化，`pose.supported:false`；没有 common Pose 控件。盔甲架的 Pose COMPOUND 是肢体旋转，真实默认保存存在，所以留在高级 raw，不能与通用 Entity 姿态混用。
- Passengers：`passengers={path:['Passengers'],shape:'list<entity compound with id; recursive Passengers>',advanced:true,common:false,typeCompatibilitySupported:false,reason}`。测试通过官方 EntityType.loadEntityRecursive 把猫附着到僵尸并重新保存乘客列表；普通 Entity.load 不附着乘客。能骑/能载受实时状态、座位和实体代码影响，不能可靠列成类型选项表，明确不支持静态兼容目录。既有递归 apply 校验继续执行，深度最多16层；摆放实体直接 load 的路径不能据此宣称已支持新增乘客。

### 扩展的 apply 与门禁

attributes 逐条走真实 Packed.CODEC；每个已注册 RangedAttribute 的 base 另按真实 min/max 拒绝越界/非有限值，modifier 形状由官方 Codec 校验，错误如 `attributes[0] 属性无效: base 超出范围 [0.0625, 16.0]`。active_effects 逐条走 MobEffectInstance.CODEC，保留 vanilla 数字正规化；未知模组字段继续按既有原则保留。不会把正规化 NBT 回写到物品而删除用户未知数据。

运行 `pwsh -NoProfile -File tools/entity/schema-test.ps1`：javac 编译全部生产源码，加原测试与 EntitySchemaDetailsTest；分别跑客户端/服务器语义 JVM fixtures；原有 EntitySchemaTest 文件未修改，继续完整回归；SpawnerApplyTest 继续回归。新增测试也已以 entitySchemaDetailsTest/entitySchemaDetailsServerTest 接入正式 Gradle check，集成 JVM 脚本包括新测试。每个完整实测 schema 经过真正 RegistryPages.split 检查（包括其单条22976字符阈值与24000字符总信封），不以裁切选项解决传输超限。

开始工作时已有用户 Minecraft/runClient 运行，期间只做 javac/JVM；最终检查时该进程已自行退出（`logs/entity-schema/processes-extended.json` 为零进程回执）。随后通过 `tools/entity/build.ps1` 原子取得共享目录锁，执行最终 `:fabric:26.1.2:build`，**BUILD SUCCESSFUL**，并正常释放锁。全程未启动、附加、重启或关闭任何游戏。javac/JVM 完整结果见 `logs/entity-schema/extended-runner.log`、`compile-main.log`、`tests-client.log`、`tests-server.log`、`details-client.log`、`details-server.log`、`spawner-apply.log`；Gradle 完整输出 `logs/entity-schema/gradle-final.log`。正式 check 已实际执行新增的客户端/服务端测试及原有测试。第三方属性的实际整合包、真正 ServerLevel 村民交易回存、实体3D渲染/联网 apply 仍为 **real-client run pending**。

### 新字段的真实采集节选
 以下来自最终纯 JVM 采集；完整响应（包括所有属性、全部变种选项与高级元数据）见同目录 entity-schema-examples-26.1.2.json。JSON 只摘取响应中真实存在的字段，不作为静态运行时数据。


#### cat

```json
{
  "id": "minecraft:cat",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "effects": {
    "path": [
      "active_effects"
    ],
    "nbt": {
      "path": [
        "active_effects"
      ]
    },
    "common": true,
    "registry": "minecraft:mob_effect",
    "codec": "MobEffectInstance.CODEC",
    "sample": [
      {
        "duration": 200,
        "show_icon": 1,
        "amplifier": 1,
        "ambient": 1,
        "id": "minecraft:speed",
        "show_particles": 0
      }
    ],
    "amplifier": {
      "min": 0,
      "max": 255
    },
    "duration": {
      "infinite": -1,
      "controlMin": 1,
      "codecMin": -2147483648,
      "codecMax": 2147483647,
      "default": 0
    },
    "shape": "{id:string,amplifier?:int,duration?:int,ambient?:boolean,show_particles?:boolean,show_icon?:boolean,hidden_effect?:compound}",
    "codecProbes": [
      {
        "input": -1,
        "amplifier": 255,
        "duration": -1
      },
      {
        "input": 0,
        "amplifier": 0,
        "duration": 0
      },
      {
        "input": 1,
        "amplifier": 1,
        "duration": 1
      },
      {
        "input": 255,
        "amplifier": 255,
        "duration": 255
      },
      {
        "input": 256,
        "amplifier": 0,
        "duration": 256
      },
      {
        "input": 2147483647,
        "amplifier": 255,
        "duration": 2147483647
      },
      {
        "input": -2147483648,
        "amplifier": 0,
        "duration": -2147483648
      }
    ]
  },
  "extras": [
    {
      "key": "Tags",
      "type": "LIST",
      "nbt": {
        "path": [
          "Tags"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": [
        "schema_probe"
      ],
      "sampleSnbt": "[\"schema_probe\"]",
      "id": "tags",
      "present_by_default": false
    }
  ]
}
```


#### sheep

```json
{
  "id": "minecraft:sheep",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "extras": [
    {
      "key": "Fire",
      "type": "SHORT",
      "nbt": {
        "path": [
          "Fire"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": 100,
      "sampleSnbt": "100s",
      "storageMin": -32768,
      "storageMax": 32767,
      "id": "fire",
      "present_by_default": true,
      "default": 0,
      "probes": [
        {
          "input": -1,
          "saved": -1
        },
        {
          "input": 0,
          "saved": 0
        },
        {
          "input": 1,
          "saved": 1
        },
        {
          "input": 2147483647,
          "saved": -1
        },
        {
          "input": -2147483648,
          "saved": 0
        }
      ]
    },
    {
      "key": "Air",
      "type": "SHORT",
      "nbt": {
        "path": [
          "Air"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": 100,
      "sampleSnbt": "100s",
      "storageMin": -32768,
      "storageMax": 32767,
      "id": "air",
      "present_by_default": true,
      "default": 300,
      "probes": [
        {
          "input": -1,
          "saved": -1
        },
        {
          "input": 0,
          "saved": 0
        },
        {
          "input": 1,
          "saved": 1
        },
        {
          "input": 2147483647,
          "saved": -1
        },
        {
          "input": -2147483648,
          "saved": 0
        }
      ]
    }
  ]
}
```


#### zombie

```json
{
  "id": "minecraft:zombie",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "extras": [
    {
      "key": "CanBreakDoors",
      "type": "BYTE",
      "nbt": {
        "path": [
          "CanBreakDoors"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": 1,
      "sampleSnbt": "1b",
      "storageMin": -128,
      "storageMax": 127,
      "id": "can_break_doors",
      "present_by_default": true,
      "default": 0,
      "probes": [
        {
          "input": -1,
          "saved": 1
        },
        {
          "input": 0,
          "saved": 0
        },
        {
          "input": 1,
          "saved": 1
        },
        {
          "input": 2147483647,
          "saved": 1
        },
        {
          "input": -2147483648,
          "saved": 0
        }
      ]
    }
  ]
}
```


#### slime

```json
{
  "id": "minecraft:slime",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "variants": [
    {
      "id": "slime/size",
      "nbt": {
        "path": [
          "Size"
        ],
        "valueFormat": "snbt",
        "mask": 127
      },
      "min": 0,
      "max": 126,
      "semanticMin": 1,
      "semanticMax": 127,
      "loaderProbes": [
        {
          "input": -2147483648,
          "saved": 0
        },
        {
          "input": -1,
          "saved": 0
        },
        {
          "input": 0,
          "saved": 0
        },
        {
          "input": 1,
          "saved": 1
        },
        {
          "input": 2147483647,
          "saved": 0
        }
      ]
    }
  ]
}
```


#### armor_stand

```json
{
  "id": "minecraft:armor_stand",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "pose": {
    "supported": false,
    "advanced": true,
    "reason": "Entity pose is transient unless the entity serializer persists it; armor stand Pose is limb rotations."
  },
  "extras": [
    {
      "key": "Pose",
      "type": "COMPOUND",
      "common": false,
      "advanced": true,
      "present_by_default": true,
      "default": {}
    }
  ]
}
```


#### wolf

```json
{
  "id": "minecraft:wolf",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "extras": [
    {
      "key": "Owner",
      "type": "INT[]",
      "nbt": {
        "path": [
          "Owner"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": [
        0,
        1,
        0,
        2
      ],
      "sampleSnbt": "[I;0,1,0,2]",
      "id": "owner",
      "present_by_default": false
    },
    {
      "key": "Sitting",
      "type": "BYTE",
      "nbt": {
        "path": [
          "Sitting"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": 1,
      "sampleSnbt": "1b",
      "storageMin": -128,
      "storageMax": 127,
      "id": "sitting",
      "present_by_default": true,
      "default": 0,
      "probes": [
        {
          "input": -1,
          "saved": 1
        },
        {
          "input": 0,
          "saved": 0
        },
        {
          "input": 1,
          "saved": 1
        },
        {
          "input": 2147483647,
          "saved": 1
        },
        {
          "input": -2147483648,
          "saved": 0
        }
      ]
    }
  ],
  "tamed_sample_nbt": "{AbsorptionAmount:0.0f,Age:1,AgeLocked:0b,Air:300s,Brain:{memories:{}},CanPickUpLoot:0b,CollarColor:14b,DeathTime:0s,FallFlying:0b,Fire:0s,ForcedAge:0,Health:40.0f,HurtByTimestamp:0,HurtTime:0s,InLove:0,Invulnerable:0b,LeftHanded:0b,Motion:[0.0d,0.0d,0.0d],OnGround:0b,Owner:[I;0,1,0,2],PersistenceRequired:0b,PortalCooldown:0,Pos:[0.0d,0.0d,0.0d],Rotation:[4.6318026f,0.0f],Sitting:0b,anger_end_time:-1L,attributes:[{base:40.0d,id:\"minecraft:max_health\"}],current_impulse_context_reset_grace_time:0,fall_distance:0.0d,id:\"minecraft:wolf\",sound_variant:\"minecraft:classic\",variant:\"minecraft:pale\"}"
}
```


#### villager

```json
{
  "id": "minecraft:villager",
  "attributes": [
    {
      "id": "minecraft:scale",
      "label": "attribute.name.scale",
      "base": 1.0,
      "common": true,
      "min": 0.0625,
      "max": 16.0,
      "nbt": {
        "path": [
          "attributes"
        ],
        "idKey": "id",
        "valueKey": "base",
        "modifiersKey": "modifiers"
      },
      "sample": {
        "id": "minecraft:scale",
        "base": 1.0
      }
    }
  ],
  "extras": [
    {
      "key": "Offers",
      "type": "COMPOUND",
      "nbt": {
        "path": [
          "Offers"
        ]
      },
      "common": false,
      "advanced": true,
      "sample": {
        "Recipes": [
          {
            "maxUses": 1,
            "buy": {
              "count": 1,
              "id": "minecraft:stone"
            },
            "sell": {
              "count": 1,
              "id": "minecraft:stone"
            }
          }
        ]
      },
      "sampleSnbt": "{Recipes:[{buy:{count:1,id:\"minecraft:stone\"},maxUses:1,sell:{count:1,id:\"minecraft:stone\"}}]}",
      "present_by_default": false,
      "roundtrip": false,
      "reason": "Codec and entity load verified; client save deliberately omits Offers. ServerLevel save pending."
    },
    {
      "key": "Brain",
      "type": "COMPOUND",
      "common": false,
      "advanced": true,
      "present_by_default": true,
      "default": {
        "memories": {}
      }
    }
  ]
}
```
