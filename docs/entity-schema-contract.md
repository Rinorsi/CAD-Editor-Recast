# entity_schema：实体变种、装备与基础开关

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

完整 cat/sheep/zombie/armor_stand entries 保存在 [entity-schema-examples-26.1.2.json](entity-schema-examples-26.1.2.json)，来自本测试实际工厂采集；未将它们注册为运行时数据源。下列 JSON 是其中真实字段的节选（options 与 flags 为节选，不是完整选项表），完整原始采集在 `logs/entity-schema/captured-client.json`。

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
