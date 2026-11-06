# 覆盖清单：哪些做了、哪些没做、哪些数据还是手写的

生成于 2026-11-07，数据来自对当前代码的实际统计（`tools` 之外的一次性脚本读取 `data.js` / `cards*.js` / `pages.js`），**不是**旧的 `STATUS-data.md`（那份写于 2026-11-06 20:20，之后改动很多，已过期，需要让审计 worker 重跑）。

图例：`*` = 该组件的结构里含原始 NBT / SNBT 字段（只能手写 SNBT，没有可视化编辑）。

## 1. 107 个物品数据组件的界面状态

### 有专用界面（52 个）
- **专用卡片 39**：custom_name、lore、rarity、enchantment_glint_override、item_model、tooltip_display、dyed_color、damage、max_damage、max_stack_size、repair_cost、repairable、damage_resistant、unbreakable、attack_range、attribute_modifiers、swing_animation、tool、weapon、enchantable、enchantments、stored_enchantments、consumable、death_protection、food、suspicious_stew_effects、use_cooldown、use_effects、use_remainder*、equippable、glider、trim、bundle_contents*、container*、writable_book_content、written_book_content、firework_explosion、fireworks、potion_contents*
- **专用表单 13**（点开独立窗口或卡片头控件）：custom_model_data、item_name、tooltip_style、break_sound、note_block_sound、instrument、jukebox_playable、profile、lodestone_tracker、map_decorations、bees*、can_break*、can_place_on*
- **说明书表单 3**（按字段排好分段、中文名、单位）：blocks_attacks、kinetic_weapon、piercing_weapon

### 只有“按 Codec 自动生成”的通用表单（52 个，能编辑、能写回，但没有定制界面）
- **含原始 NBT，只能手写 SNBT（6）**：block_entity_data*、bucket_entity_data*、charged_projectiles*、custom_data*、entity_data*、lock*
- **简单字段（46）**：damage_type、minimum_attack_charge、intangible_projectile、ominous_bottle_amplifier、banner_patterns、base_color、provides_banner_patterns、provides_trim_material、block_state、debug_stick_state、container_loot、pot_decorations、map_color、map_id、recipes、dye、potion_duration_scale，以及 29 个生物变种（cat/variant、wolf/variant、sheep/color、tropical_fish/*、villager/variant 等）。这些大多是“一个注册表选择 / 枚举 / 数字”，已经走统一控件（头部控件、色块、选择…），可以认为基本可用。
- **其中真正“缺东西”的**：block_state / debug_stick_state（需要方块的属性名表，宿主还没导出）、container_loot（战利品表没有来源，只能手输）、recipes、charged_projectiles（弩里的箭，只能 SNBT）、lock（锁，只能 SNBT）。

## 2. 特殊物品逐类核对

| 物品类 | 现状 | 缺什么 |
|---|---|---|
| 药水 / 喷溅 / 滞留 / 药箭（4 个，kind=potion） | **做了**：药水分页（基础药水、液体颜色、自定义效果、饮用行为、剩余物、堆叠） | potion_duration_scale 是通用表单；不死图腾以外的“药水类”没有 |
| 不祥之瓶 | 归在“食物”类，有食用页 | ominous_bottle_amplifier 只是通用数字框 |
| **刷怪蛋（87 个，kind=spawn）** | **没做专用界面**：用的是通用分页，entity_data 是“实体类型选择 + SNBT” | 没有刷怪蛋页：看不到可视化的实体数据（名称、血量、装备、属性、变种）；生物变种组件只有零散的选择框 |
| **刷怪笼 / 试炼刷怪器** | **没做**：被分到“物品/方块”通用类，只能靠 block_entity_data 手写 SNBT | 整个刷怪笼编辑（刷什么、延迟、范围、数量、条件）都没有 |
| 箱子 / 木桶 / 潜影盒 / 漏斗 / 发射器 等（61 个，kind=container） | **做了**：“里面的物品”格子（点格子选物品、右键复制 / 清空） | 容器里物品自带的组件不能编辑；container_loot 战利品表没有候选；lock 只能 SNBT；潜影盒颜色用生物变种之外的组合未处理 |
| 收纳袋 | 做了（bundle_contents 卡片） | 同上，袋里物品的组件不能编辑 |
| 陶罐 | 归在容器类 | pot_decorations 是通用列表（现在支持多选添加） |
| 旗帜 / 盾牌 | **做了**：新增“旗帜图案”分页（图案、颜色、提供图案） | 刚做的，预览里没渲染确认 |
| 书与笔 / 成书 | 做了（页面内容、作者、标题） | 文本组件复杂样式只到基础层 |
| 附魔书 | 做了 | — |
| 烟花火箭 / 烟火之星 | 做了 | — |
| 谜之炖菜 | 做了（效果列表 + 多选添加） | — |
| 玩家头颅 | 做了（profile 独立窗口） | 物品被归在“盔甲”类，这个分类不对 |
| 指南针（磁石指南针）/ 地图 | lodestone_tracker、map_decorations 做了窗口 | map_id / map_color 是通用数字；指南针/地图被分到“物品/方块”通用类 |
| 唱片 / 山羊角 | jukebox_playable、instrument 做了头部选择 | 山羊角在“物品/方块”类里；唱片分类用的是通用页 |
| 桶（含水桶里的鱼） | **没做**：bucket_entity_data 只能 SNBT | 鱼种变种、生物数据 |
| 弩 | charged_projectiles 只能 SNBT | 装填的箭 / 烟花的可视化编辑 |
| 命令方块、结构方块等 | custom_data* / block_entity_data* 只能 SNBT | 无 |
| 盔甲架、画（painting）、物品展示框 | 通用类；painting/variant 是选择框 | 无专用页 |
| 工具 / 武器 / 盔甲 / 食物 | 做了（各自分页） | tool 规则、attribute_modifiers 显示方式等窗口内部布局仍是旧的 |

**分类本身也是手写的**：`EDATA.ikind`（1506 个物品→类别）是静态烘焙表，**模组物品一律归“物品/方块”通用类**；刷怪笼、指南针、地图、山羊角、桶、盔甲架等原版物品也因为表里没写而落到通用类。应该改成按物品的实时默认组件推导类别（宿主 `item_defaults` 已能提供）。

## 3. 仍然手写的数据（尚未换成权威来源）

### 3.1 整套静态烘焙（`data.js` 的 `EDATA`）
| 内容 | 数量 | 说明 |
|---|---:|---|
| 组件结构 `comps`（字段、范围、默认值、中文说明） | 107 | 来自研究 worker 对 26.1.2 的导出，不是实时 Codec；**模组新增组件 / 字段不会出现**（只能作为原始数据保留） |
| 物品清单 / 名称 / 类别 / 图标映射 | 1506 | 有宿主时优先用实时注册表，离线才用；类别 `ikind` 始终用静态表 |
| 附魔 / 属性 / 状态效果 / 语言表 | 43 / 35 / 40 / 6 | 有宿主时用注册表，静态表做回退与图标、描述 |
| 方块 `iblk`、`pt`（347） | 922 / 347 | 方块清单、药水类相关表 |

### 3.2 仍然手写、应当改成权威来源（来自状态审计，代码里仍存在；审计由 tools/audit-backend-status.cjs 生成，报告存放在工作区）
- `HIDE_PARTS`（提示框隐藏项，8 个）→ 应读 data_component_type 注册表
- `TAG_NAMES`（15 个标签别名）→ 应读实时标签与语言键
- `RESIST` 快捷项（5 个）、`TOOL_GROUPS`（10 个）→ 快捷项应按实际存在的标签过滤
- `MELEE_SLOTS`、攻击基础值（1 / 4）→ 应读玩家 / 目标实体的实际基础属性
- `AMT_LIMIT` 残留的 ±2048 限幅（旧表单里还有）
- 旧 `wEnchants` 专用表单（forms.js）仍 free:false
- 物品类别 `ikind`（见上）

### 3.3 手写但可以保留（纯 UI 元数据：图标、中文标签、快捷预设）
`TIER_TOOLS`、`ENCH_ICON`、`ATTR_ICON` / `ATTR_VIS` / `ATTR_SLOT_ICON`、`SPR`、`COMP_ITEM`（组件→图标物品）、`LABEL_ICON`、`REG_HINT`、`EFFECT_CAT_ZH`、`SOUND_GROUP_ZH`、`SLOT_ZH` / `SLOTS`。

### 3.4 手写候选，但现在有实时来源、静态表只当离线回退
`POTION_IDS` / `POTION_VARIANTS`、`TRIM_MATS`、`EQ_ASSETS`、`DYE_RGB`（有 enum:dye_color 时用实时）、`MC_COLORS`（文本颜色，有 enum:text_color）。

### 3.5 手写、但对应的权威来源还没做 / 没核对
- `ANIMS`（使用动画 12 种）、`EQ_SLOTS`（装备槽 8 种）、`FW_SHAPES`（烟花形状 5 种）、`CE_TYPES`（消耗效果类型 5 种）：契约里有 `enum:use_animation / equipment_slot / firework_shape / consume_effect_type`，界面是否已同步这些枚举需要核对（`reg.js` 有 `ENUM_TABLES` 管线，但这几处的接线我这次没有逐个验证）。
- 各枚举控件（<=4 项分段、>4 项下拉）**没有“手动输入”入口**（违反铁律的一部分）。

## 4. 下一步建议
1. 重跑 `tools/audit-backend-status.cjs` 更新状态审计报告（它们已过期），并加上第 2 节的特殊物品矩阵。
2. 前端先补的专用界面（按用户可能最常用排序）：刷怪蛋 / 刷怪笼（含后端导出实体和刷怪数据）→ 物品分类改由实时默认组件推导 → 桶 / 弩 / 容器内物品的组件编辑。
3. 把 3.2 里“必须改”的几项和 3.5 的枚举手动输入补完。

## 5. 需要后端（宿主 Java）做的事

分类：**新增导出**（宿主现在没有）/ **需核对**（合同里说“任意按需注册表同结构”，但没确认过每个名字都能出数据）/ **性能与行为**。已确认宿主已有：items、enchantments、mob_effects、attributes、sounds、potions、instruments、jukebox_songs、banner_patterns、trim_materials、trim_patterns、painting_variants、damage_types、entity_types、data_component_types、blocks、`tags:` / `tag:`、`equipment_asset`、`enum:*`（9 个）、`item_defaults(_one)`、`tooltip_style`、`item_model_hints`、草稿通道、log 通道。

### P0 · 不做就没法做的功能
| # | 任务 | 为什么 | 导出内容建议 |
|---|---|---|---|
| B1 | **实体信息**（刷怪蛋 / 实体数据） | 刷怪蛋、`entity_data` 现在只能 SNBT | `entity_info:<实体类型>`：默认属性值（最大生命、移速、攻击…）、可用变种注册表名、是否有装备槽、对应刷怪蛋物品、默认 NBT（客户端创建一个临时实体 `saveWithoutId()` 得到 SNBT 模板，不加入世界） |
| B2 | **刷怪笼 / 试炼刷怪器数据** | 整个刷怪笼编辑没有 | 刷怪笼 SpawnData 的官方 Codec 字段与默认值（SpawnData、SpawnPotentials、延迟、范围、数量、玩家检测范围）；试炼刷怪器的配置字段与默认值；只读导出 + 写回时用 Codec 校验 |
| B3 | **Codec 校验接口** | 所有只能手写 SNBT 的字段（block_entity_data、entity_data、bucket_entity_data、charged_projectiles、custom_data、lock）需要“这段写得对不对” | `validate_component(组件id, snbt|json)` → `{ok, error, normalized}`，直接用该组件的真实 Codec 解析；模组组件同样可用 |
| B4 | **物品分类 / 元信息** | 现在是静态表 `ikind`，模组物品全归通用 | `item_meta`：每个物品的 `block_item`、`block_entity_type`、`spawn_egg_entity`、`armor_slot`、`tool/weapon/food/consumable` 标记、`container_size`（箱子 27、漏斗 5、潜影盒 27…，替代手写 SLOT_COUNT）、`bundle` 容量；也可以让前端用已有的 `item_defaults` 自己推导，需要后端确认哪些信息 `item_defaults` 里拿不到 |

### P1 · 让“手写 / 必须改”的表换成权威来源
| # | 任务 | 替换什么 | 内容 |
|---|---|---|---|
| B5 | **方块属性表** | block_state / debug_stick_state 无法编辑 | `block_properties`：每个方块的属性名→允许值、默认值 |
| B6 | **战利品表 / 配方 / 维度 / 地图标记类型** | container_loot、recipes、lodestone 维度、map_decorations 只能手输 | 注册表 `loot_table`（客户端远程服务器可能拿不到，需说明限制）、`recipe`、`dimension`、`map_decoration_type` |
| B7 | **生物变种注册表核对** | 29 个变种组件的选择框 | 逐个核对 `cat_variant`、`wolf_variant`、`wolf_sound_variant`、`cat_sound_variant`、`chicken_variant`、`cow_variant`、`frog_variant`、`pig_variant`、`villager_type`、`zombie_nautilus_variant` 等是否能出数据（合同只说“任意按需注册表”，没有逐个验证） |
| B8 | **纹饰材料 / 图案的图标来源** | 前端手写 `TRIM_ICON` / `ipt` | `trim_materials` 增加材料物品 `ingredient`、`trim_patterns` 增加对应模板物品 |
| B9 | **资源 ID 列表** | `equippable.camera_overlay`、`profile.texture/cape/elytra`、`item_model` 只能手输 | 按目录列出资源 ID：`textures/gui/...` 叠加层、`textures/entity/player/...` 皮肤、`items/*.json`（物品模型定义，让 item_model 选择器列出真实模型而不只是物品 ID） |
| B10 | **玩家 / 实体基础属性** | 前端手写“攻击基础值 1 / 4”“MELEE_SLOTS” | 按实体类型导出基础属性（至少 player）、`EquipmentSlotGroup` 与槽位的匹配表 |
| B11 | **组件 schema 实时化（长期）** | 前端静态 `comps`（107，26.1.2 烘焙），模组新增组件 / 字段看不到 | 方案 A：导出每个组件 Codec 的结构化描述（字段、类型、范围、默认）；方案 B（折中）：只导出 `data_component_types` 的 `persistent` / 是否有 Codec，模组组件一律走“SNBT + B3 校验”。建议先做 B，A 作后续 |

### P2 · 性能 / 行为
| # | 任务 | 说明 |
|---|---|---|
| B12 | 注册表预热 tick 峰值 | 实机 9.4ms，目标 <5ms（`registry-contract.md` 末尾回执）；需要继续切分采集 / 推送 |
| B13 | PERF P1 的后端侧 | 性能评估报告（草稿序列化、history 内存、推送合并；存放在工作区 planning/cad-editor-recast/PERF.md） |
| B14 | **试听验证** | 唱片 / 山羊角预览能否在库里播放长音乐；如果 `oriel.playSound` 不能播，宿主要提供短预览或明确不支持（需重启游戏后看 `[CAD-Editor-Recast]` 日志） |
| B15 | 写回路径对新数据的覆盖 | 如果前端开始编辑实体数据 / 刷怪笼，`applyToGame` 的写回要覆盖 `entity_data`、`block_entity_data` 的 Codec 往返（目前只有“自定义名称”被游戏内端到端验证过） |

### 建议派工（最多 4 个并行）
1. **Worker A（实体 / 刷怪）**：B1 + B2 + B10
2. **Worker B（校验与分类）**：B3 + B4 + B15
3. **Worker C（注册表补全）**：B5 + B6 + B7 + B8 + B9
4. **Worker D（性能与试听）**：B12 + B13 + B14；B11 先出方案评估

每个 worker 都要：不抢鼠标键盘、静默离屏、只改 Java / 合同文档、更新 `docs/registry-contract.md`、给出实机验证回执，前端不由它们改。
