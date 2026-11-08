# 1.0 签收清单（你只需要看这一页）

由 `node tools/coverage-sync.cjs` 根据 [实机三轮回执](acceptance/components.md) 生成，不会替你勾选。

机器证据：{"components_total":107,"components_attempted":107,"applied":107,"equal":107,"typed_exact":107,"validated":107,"rejected":0,"attempts":321,"success":321,"timeouts":0}

## 一、要你确认「通用表单够用」的 39 项

这些组件没有专用界面，用的是按游戏 Codec 自动生成的通用表单。机器已证明：能增删改、保存、重开后值相等、类型不丢。
你要判断的只有一件事：**这样用起来够不够顺手**。够用就在 COVERAGE.md 对应行把 `[ ]` 改成 `[x]`；不够就告诉我哪一项要做专用界面。

| 组件 | 中文名 | 机器证据 | 你的结论 |
|---|---|---|---|
| `minecraft:damage_type` | 攻击伤害类型 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:minimum_attack_charge` | 最小攻击充能 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:intangible_projectile` | 不可拾取投射物 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:ominous_bottle_amplifier` | 不祥之瓶强度 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:base_color` | 盾牌底色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:provides_banner_patterns` | 提供旗帜图案 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:provides_trim_material` | 提供纹饰材料 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:map_id` | 地图编号 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:dye` | 染料 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:potion_duration_scale` | 药水时长倍率 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:axolotl/variant` | 美西螈变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:cat/collar` | 猫项圈颜色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:cat/sound_variant` | 猫声音变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:cat/variant` | 猫变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:chicken/sound_variant` | 鸡声音变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:chicken/variant` | 鸡变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:cow/sound_variant` | 牛声音变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:cow/variant` | 牛变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:fox/variant` | 狐狸变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:frog/variant` | 青蛙变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:horse/variant` | 马变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:llama/variant` | 羊驼变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:mooshroom/variant` | 哞菇变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:painting/variant` | 画变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:parrot/variant` | 鹦鹉变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:pig/sound_variant` | 猪声音变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:pig/variant` | 猪变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:rabbit/variant` | 兔子变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:salmon/size` | 鲑鱼体型 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:sheep/color` | 绵羊颜色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:shulker/color` | 潜影贝颜色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:tropical_fish/base_color` | 热带鱼底色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:tropical_fish/pattern` | 热带鱼图案 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:tropical_fish/pattern_color` | 热带鱼图案颜色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:villager/variant` | 村民变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:wolf/collar` | 狼项圈颜色 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:wolf/sound_variant` | 狼声音变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:wolf/variant` | 狼变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |
| `minecraft:zombie_nautilus/variant` | 僵尸鹦鹉螺变种 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) | [ ] 够用 / [ ] 要专用界面 |

## 二、专用界面的 68 项

机器证据同上。这些的观感（布局、手感、动画、浅色主题）看 [人工清单](acceptance/CHECKLIST-for-user.md) 即可，不需要逐项勾。

| 组件 | 中文名 | 形态 | 机器证据 |
|---|---|---|---|
| `minecraft:custom_model_data` | 自定义模型数据 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:custom_name` | 自定义名称 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:dyed_color` | 染色 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:enchantment_glint_override` | 附魔光效 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:item_model` | 物品模型 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:item_name` | 基础名称 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:lore` | 说明文字 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:rarity` | 稀有度 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:tooltip_display` | 提示框显示 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:tooltip_style` | 提示框样式 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:break_sound` | 损坏音效 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:damage` | 已损耗耐久 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:damage_resistant` | 免疫伤害 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:max_damage` | 最大耐久 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:max_stack_size` | 最大堆叠 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:repair_cost` | 铁砧惩罚 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:repairable` | 可修复材料 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:unbreakable` | 不可破坏 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:attack_range` | 攻击范围 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:attribute_modifiers` | 属性修饰器 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:blocks_attacks` | 格挡 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:kinetic_weapon` | 动能武器 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:piercing_weapon` | 穿刺武器 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:swing_animation` | 挥动动画 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:tool` | 工具 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:weapon` | 武器 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:enchantable` | 可附魔性 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:enchantments` | 附魔 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:stored_enchantments` | 存储的附魔 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:consumable` | 消耗行为 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:death_protection` | 死亡保护 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:food` | 食物 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:suspicious_stew_effects` | 谜之炖菜效果 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:use_cooldown` | 使用冷却 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:use_effects` | 使用时效果 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:use_remainder` | 使用后剩余 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:banner_patterns` | 旗帜图案 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:equippable` | 可装备 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:glider` | 滑翔 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:trim` | 盔甲纹饰 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:bees` | 蜜蜂 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:block_entity_data` | 方块实体数据 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:block_state` | 方块状态 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:bucket_entity_data` | 桶内实体数据 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:bundle_contents` | 收纳袋内容 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:can_break` | 可破坏方块 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:can_place_on` | 可放置于 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:charged_projectiles` | 已装填弹药 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:container` | 容器内容 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:container_loot` | 容器战利品 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:custom_data` | 自定义数据 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:debug_stick_state` | 调试棒状态 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:entity_data` | 实体数据 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:lock` | 容器锁 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:pot_decorations` | 陶罐装饰 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:profile` | 头颅档案 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:lodestone_tracker` | 磁石追踪 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:map_color` | 地图颜色 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:map_decorations` | 地图标记 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:recipes` | 解锁配方 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:writable_book_content` | 书与笔内容 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:written_book_content` | 成书内容 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:firework_explosion` | 烟花爆炸 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:fireworks` | 烟花 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:instrument` | 乐器 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:jukebox_playable` | 唱片 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:note_block_sound` | 音符盒音效 | 专用表单 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
| `minecraft:potion_contents` | 药水内容 | 专用卡片 | 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) |
