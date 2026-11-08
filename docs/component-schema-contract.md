# 持久物品组件结构协议（MC 26.1.2 / schema v2）

生产数据由当前注册表的持久 Codec 推导；快照只用于审阅和漂移测试，不是线上白名单或范围表。批量请求遍历全部持久组件，包括 MOD。

## 请求与分页

沿用 registry_request，name 为 component_schema 获取全集，component_schema:minecraft:food 或 component_schema 配合 id:minecraft:food 获取单项。响应保持 registry 信封的 version/generation/name/offset/total/entries/done，单页最多 24000 字符。每 tick 推导一个未缓存组件，离开世界或 generation 改变清缓存。信封 version 仍为 1；条目 schema_version 为 2。

## 条目与编辑策略

source 是 vanilla 或 mod:<namespace>，schema_source 为 runtime_codec_structural_adapter。editable 为 structured 或 snbt_only，并带 editable_reason；readonly 预留给不可写能力，本次持久 Codec 集合无需该降级。validator_route:component_validate 对所有形态有效。自由 NBT 无固定表单字段，使用 snbt_only；不透明 MOD Codec 或超出单行预算同样保留 SNBT 入口，不能跳过或删除组件。

label_key 仅当当前 Language 确有 item.component.<namespace>.<path>，或原版的 item.component.<path> 时输出，否则明确为 null。26.1.2 原版语言资源没有逐组件这些键，本快照全部为 null，不能编造翻译键。

default_from_prototypes 包括 item_count、distinct_value_count、example_count、universal_default:false；具体样本在 prototype_examples。样本是实际物品原型观察，不构成所有物品通用默认。字段 default 来自 optional Codec 解码空对象；default_absent 表示省略，不等于 0。

coverage:full 仅表示导出的字段形状没有未知节点，不代表跨组件约束、玩法、前端消费或发布验收。partial 的 unknown_paths 与 unknown_details 同时列出路径及原因。单组件超出预算时降级为 snbt_only，避免一个 MOD 阻断全集。

## 形状

每个节点保留 type，并增加同值 kind。fields 是对象字段数组；element/key 是列表/映射；alternatives 是普通联合或 holder 内联形式。

| kind | 真实来源与表示 |
|---|---|
| text_component | ComponentSerialization.CODEC；字符串、非空递归文本列表、对象；内容分派 text/translate/score/selector/keybind/nbt，extra 与 Style（含 click_event/hover_event）。flatRestrictedCodec 另带捕获的 max_flat_size。不能压成普通字符串丢掉样式和事件。 |
| identifier | Identifier.CODEC；item_model/tooltip_style 分别带 catalog:item_model / catalog:tooltip_style，与页面资源目录同名。 |
| unit | 实际 unit Codec；空对象表示存在，删除整个组件表示关闭。glider/unbreakable 不是布尔值。 |
| typed_data | TypedEntityData 的真实 typeCodec；必填 id 与自由 NBT 同层。id_registry：block_entity_data 为 minecraft:block_entity_type，entity_data 为 minecraft:entity_type；bees 内嵌值也可导出。 |
| holder | 实际 RegistryFileCodec；registry、allow_inline 和 alternatives 内的内联记录。instrument 含 sound_event/use_duration/range/description。 |
| holder_set | 实际 HolderSetCodec；registry 与 #tag / 单 identifier / identifier 列表；运行时校验 holder 同质性和 tag 查询。 |
| variants | 实际 KeyDispatchCodec 的 discriminator、注册表或真实枚举，以及 variants 内各 discriminator_value 对应分支。包括 consume/death effects、attribute display。 |
| recursive_ref | Codec 身份递归的 ref_path，指回本条目先前同一 Codec 形状；不无限展开 hidden_effect。真正深度/节点预算仍记 unknown。 |
| component_patch | DataComponentPatch.CODEC；ID 键对应实时 component_schema，!id 加空对象表示移除；每个值交注册组件 Codec 校验。 |
| nbt / uuid / resource_path | 官方 Codec 身份适配，保留自由 NBT、实际探测的 UUID 形式、官方路径语法。BlockPos 是长度 3 的整数列表。 |

RGB 是显示语义：potion_contents.custom_color 真实字段使用 Codec.INT，format:rgb 不意味着只接受 0..16777215；ExtraCodecs RGB/ARGB 还可接收浮点通道列表。map_id/map_color 验证 int 存储域两端；JsonOps 截断/缩窄会接受域外 JSON 数，不能把存储域解释为严格拒绝规则。

## P3-5 复杂组件字段约定

候选节点的 `candidate_source:runtime_registry`、`candidate_route` 指向现有 `registry_request` 名称，客户端按当前世界 generation 查询；`allow_manual_id:true` 要求选择器保留手动 ID 输入。`holder_set` 另有 `tag_candidate_route:tags:<registry>`，标签值提交时加 `#`。不把候选列表内嵌进组件行，也不从快照生成游戏数据。

- `trim`：对象，必填 `material`（holder，`minecraft:trim_material`）与 `pattern`（holder，`minecraft:trim_pattern`）；均允许实时动态注册表 ID 或 Codec 内联对象。材料内联含必填 `asset_name:resource_path`、`description:text_component`，`override_armor_assets` 为装备资产 ID 到资源路径的映射（默认 `{}`）。图案内联字段按导出的 fields 渲染。示例 `{"material":"minecraft:quartz","pattern":"minecraft:sentry"}` 仅用于说明语法，候选必须实时查询。
- `provides_trim_material`：与上述 `material` 相同的 holder，示例 `"minecraft:quartz"`；内联资源路径使用官方 `MaterialAssetGroup.AssetInfo.CODEC`，不再误标为未知字符串约束。两项无通用组件默认值，必填字段不能填 JSON null；可省略字段以 `optional/default/default_absent` 为准。

- `profile`：联合为玩家名字字符串（0..16 字符）或对象；对象的 `name`（0..16）、`id`（UUID 四整数数组）、`texture`/`cape`/`elytra`（identifier）、`model`（真实枚举 slim/wide）均可省略，不能用 null 代替省略。`properties` 默认 `[]`，接受属性名到字符串列表的映射（最多 16 个键，值列表无该项数限制），或最多 16 项的 `{name,value,signature?}` 列表（长度上限分别 64、32767、1024）。例如 `{"properties":[{"name":"textures","value":"<base64>"}]}`；纹理 payload 是不透明字符串，Codec 不验证其 Base64 内容或网络可用性。profile 不来自注册表，不应伪造玩家/皮肤候选目录。

- `lock`：物品谓词对象；可省略 `items:holder_set`（实时 `minecraft:item` 与 `tags:minecraft:item`）、`count`（整数精确值或 `{min?,max?}`，含端点，默认 `{}`，min ≤ max）、`components`（默认 `{}`，组件 ID → 精确值）、`predicates`（默认 `{}`，高级谓词映射）。`components.value_schema_route` 指向既有 `component_schema:<component-id>`，键来自持久组件注册表，禁止 `!id` 删除语法。示例 `{"items":"minecraft:tripwire_hook","count":{"min":1},"components":{"minecraft:damage":0}}`。`predicates` 保留局部 `editable:snbt_only` 与 unknown 原因：键依赖运行时 `data_component_predicate_type` 的专用 Codec，也接受持久 `data_component_type` 的精确匹配回退；值不是普通 ID，也不能当任意 NBT 直接放行。该子树提交仍由完整组件 Codec 校验，因此本组件保持 partial，而其余字段可结构化编辑。

## ranges_for_ui

每个条目含数值字段列表；[完整机器汇总与前端差异](component-schema-ui-ranges-26.1.2.json) 按组件 ID 索引。

示例：{"id":"minecraft:use_cooldown","ranges_for_ui":[{"path":"$.seconds","min":0,"max":3.4028235E38,"default":null,"min_exclusive":true}]}

path 使用 $、.field、[]、{value}。min/max/default 的 null 表示没有已证明的界限或通用默认，不能当零。min_exclusive:true 表示严格大于；unit_hint 未从 Codec 获得时不发明。联合/分派可能在同一 path 下有多组值，需结合原节点所在 variants/alternatives 分支。范围是表单提示，提交仍走 component_validate。UNSIGNED_BYTE 的 [0,255] 是解码值域；256→0 的 JSON 缩窄仍以实际回执为准。

## 覆盖变化

| 范围 | full | partial | unknown | 总计 |
|---|---:|---:|---:|---:|
| 旧快照 | 12 | 32 | 12 | 56 |
| 同一旧范围更新后 | 52 | 4 | 0 | 56 |
| 当前全部持久组件 | 104 | 3 | 0 | 107 |

## 全集结构覆盖与剩余未知

| 组件 | 结构 | unknown 路径与原因 |
|---|---|---|
| minecraft:attack_range | full | — |
| minecraft:attribute_modifiers | full | — |
| minecraft:axolotl/variant | full | — |
| minecraft:banner_patterns | full | — |
| minecraft:base_color | full | — |
| minecraft:bees | full | — |
| minecraft:block_entity_data | full | — |
| minecraft:block_state | full | — |
| minecraft:blocks_attacks | full | — |
| minecraft:break_sound | full | — |
| minecraft:bucket_entity_data | full | — |
| minecraft:bundle_contents | full | — |
| minecraft:can_break | partial | $: outer_mapping_or_cross_field_constraint; $[].state{value}: string_mapping_constraints_not_exported; $[].nbt: string_mapping_constraints_not_exported; $[].predicates: dependent_component_predicate_value_schemas_not_exported; $.state{value}: string_mapping_constraints_not_exported; $.nbt: string_mapping_constraints_not_exported; $.predicates: dependent_component_predicate_value_schemas_not_exported |
| minecraft:can_place_on | partial | $: outer_mapping_or_cross_field_constraint; $[].state{value}: string_mapping_constraints_not_exported; $[].nbt: string_mapping_constraints_not_exported; $[].predicates: dependent_component_predicate_value_schemas_not_exported; $.state{value}: string_mapping_constraints_not_exported; $.nbt: string_mapping_constraints_not_exported; $.predicates: dependent_component_predicate_value_schemas_not_exported |
| minecraft:cat/collar | full | — |
| minecraft:cat/sound_variant | full | — |
| minecraft:cat/variant | full | — |
| minecraft:charged_projectiles | full | — |
| minecraft:chicken/sound_variant | full | — |
| minecraft:chicken/variant | full | — |
| minecraft:consumable | full | — |
| minecraft:container | full | — |
| minecraft:container_loot | full | — |
| minecraft:cow/sound_variant | full | — |
| minecraft:cow/variant | full | — |
| minecraft:custom_data | full | — |
| minecraft:custom_model_data | full | — |
| minecraft:custom_name | full | — |
| minecraft:damage | full | — |
| minecraft:damage_resistant | full | — |
| minecraft:damage_type | full | — |
| minecraft:death_protection | full | — |
| minecraft:debug_stick_state | full | — |
| minecraft:dye | full | — |
| minecraft:dyed_color | full | — |
| minecraft:enchantable | full | — |
| minecraft:enchantment_glint_override | full | — |
| minecraft:enchantments | full | — |
| minecraft:entity_data | full | — |
| minecraft:equippable | full | — |
| minecraft:firework_explosion | full | — |
| minecraft:fireworks | full | — |
| minecraft:food | full | — |
| minecraft:fox/variant | full | — |
| minecraft:frog/variant | full | — |
| minecraft:glider | full | — |
| minecraft:horse/variant | full | — |
| minecraft:instrument | full | — |
| minecraft:intangible_projectile | full | — |
| minecraft:item_model | full | — |
| minecraft:item_name | full | — |
| minecraft:jukebox_playable | full | — |
| minecraft:kinetic_weapon | full | — |
| minecraft:llama/variant | full | — |
| minecraft:lock | partial | $.predicates: dependent_component_predicate_value_schemas_not_exported |
| minecraft:lodestone_tracker | full | — |
| minecraft:lore | full | — |
| minecraft:map_color | full | — |
| minecraft:map_decorations | full | — |
| minecraft:map_id | full | — |
| minecraft:max_damage | full | — |
| minecraft:max_stack_size | full | — |
| minecraft:minimum_attack_charge | full | — |
| minecraft:mooshroom/variant | full | — |
| minecraft:note_block_sound | full | — |
| minecraft:ominous_bottle_amplifier | full | — |
| minecraft:painting/variant | full | — |
| minecraft:parrot/variant | full | — |
| minecraft:piercing_weapon | full | — |
| minecraft:pig/sound_variant | full | — |
| minecraft:pig/variant | full | — |
| minecraft:pot_decorations | full | — |
| minecraft:potion_contents | full | — |
| minecraft:potion_duration_scale | full | — |
| minecraft:profile | full | — |
| minecraft:provides_banner_patterns | full | — |
| minecraft:provides_trim_material | full | — |
| minecraft:rabbit/variant | full | — |
| minecraft:rarity | full | — |
| minecraft:recipes | full | — |
| minecraft:repair_cost | full | — |
| minecraft:repairable | full | — |
| minecraft:salmon/size | full | — |
| minecraft:sheep/color | full | — |
| minecraft:shulker/color | full | — |
| minecraft:stored_enchantments | full | — |
| minecraft:suspicious_stew_effects | full | — |
| minecraft:swing_animation | full | — |
| minecraft:tool | full | — |
| minecraft:tooltip_display | full | — |
| minecraft:tooltip_style | full | — |
| minecraft:trim | full | — |
| minecraft:tropical_fish/base_color | full | — |
| minecraft:tropical_fish/pattern | full | — |
| minecraft:tropical_fish/pattern_color | full | — |
| minecraft:unbreakable | full | — |
| minecraft:use_cooldown | full | — |
| minecraft:use_effects | full | — |
| minecraft:use_remainder | full | — |
| minecraft:villager/variant | full | — |
| minecraft:weapon | full | — |
| minecraft:wolf/collar | full | — |
| minecraft:wolf/sound_variant | full | — |
| minecraft:wolf/variant | full | — |
| minecraft:writable_book_content | full | — |
| minecraft:written_book_content | full | — |
| minecraft:zombie_nautilus/variant | full | — |

## 与当前手写表的差异

读取并对照 ui/js/data.js 的 schema 和 core.js validateValue；仅记录观察，不修改前端。

| 组件与字段 | 手写范围 | 实际 Codec / 新元数据 |
|---|---|---|
| minecraft:blocks_attacks $.block_delay_seconds | {"min": 0, "max": null} | {"min": 0.0, "max": 3.4028235e+38, "min_exclusive": null} |
| minecraft:blocks_attacks $.disable_cooldown_scale | {"min": 0, "max": null} | {"min": 0.0, "max": 3.4028235e+38, "min_exclusive": null} |
| minecraft:blocks_attacks $.damage_reductions[].horizontal_blocking_angle | {"min": null, "max": null} | {"min": 0, "max": 3.4028235e+38, "min_exclusive": true} |
| minecraft:blocks_attacks $.item_damage.threshold | {"min": 0, "max": null} | {"min": 0.0, "max": 3.4028235e+38, "min_exclusive": null} |
| minecraft:consumable $.consume_seconds | {"min": 0, "max": null} | {"min": 0.0, "max": 3.4028235e+38, "min_exclusive": null} |
| minecraft:consumable $.on_consume_effects[].diameter | {"min": null, "max": null} | {"min": 0, "max": 3.4028235e+38, "min_exclusive": true} |
| minecraft:death_protection $.death_effects[].diameter | {"min": null, "max": null} | {"min": 0, "max": 3.4028235e+38, "min_exclusive": true} |
| minecraft:potion_duration_scale $ | {"min": 0, "max": null} | {"min": 0.0, "max": 3.4028235e+38, "min_exclusive": null} |
| minecraft:tool $.rules[].speed | {"min": null, "max": null} | {"min": 0, "max": 3.4028235e+38, "min_exclusive": true} |
| minecraft:use_cooldown $.seconds | {"min": null, "max": null} | {"min": 0, "max": 3.4028235e+38, "min_exclusive": true} |
| minecraft:weapon $.disable_blocking_for_seconds | {"min": 0, "max": null} | {"min": 0.0, "max": 3.4028235e+38, "min_exclusive": null} |
| minecraft:max_stack_size $ | "core.js rejects fractional int JSON" | "Codec accepts 1.5 and normalizes to 1" |
| minecraft:fireworks $.flight_duration | "data.js [0,255]; core.js rejects 256" | "UNSIGNED_BYTE value domain [0,255], JSON 256 decodes to 0" |
| minecraft:written_book_content $.title | "data.js/core.js no string max-length enforcement" | "Codec string form length [0,32], rejects 33 chars" |

container 的 256 项限制与前端一致，不列作差异。整数 JSON 小数截断和 BYTE 缩窄是实际 Codec 行为，不建议前端取消整数控件。

## 验证与限制

pwsh -NoProfile -File tools/registry/component-schema-test.ps1 使用已导出的 runtime-classpath.json，先 javac、再独立 JVM，不启动游戏。真实 VanillaRegistries lookup 初始化物品原型；测试遍历全部 107 持久组件，覆盖分页、真实范围/默认、原型往返、字段/dispatch 错误路径、旧校验回执兼容及整份快照漂移。只有显式 -UpdateSnapshot 才写快照，同时更新 ranges_for_ui 机器汇总；普通测试也检查该汇总是否漂移。

测试末尾在独立 JVM 的真实 DATA_COMPONENT_TYPE 注册 schema_test:strength 与 schema_test:opaque，证明 bulk 包含 MOD、source:mod:schema_test、真实范围2..9/默认4、未知翻译为null、opaque走snbt_only，以及实际Codec拒绝越界。证据：logs/backend-g/schema-mod-evidence.json。仅在自己的测试 JVM 暂开 registry frozen 标记并绑定新 holder，随后恢复；不触碰运行中的游戏。

日志：logs/backend-g/schema-compile.log、schema-test.log、schema-drift-gate.log、schema-gradle-gate.log；静态审阅为 schema-review.log。范围对照机器文件由本轮快照生成。

本轮未启动、关闭或重载用户 Minecraft；真实客户端通道、资源包语言切换、第三方 MOD 整合包与专服运行待验证。full 是 Codec 形状覆盖，COVERAGE 发布勾选保持不变。
