# 1.0 发布门槛清单

## 自动化证据（不替代发布勾选）

运行 `pwsh -NoProfile -File tools/accept/run.ps1`，详见 [验收工具说明](../tools/accept/README.md)。

- [逐组件机器回执与三轮统计](acceptance/components.md) / [JSON 原始逐轮证据](acceptance/components.json)：真实页面 apply、服务端槽位、关闭重开、类型精确保留、两种组件校验及世界编辑路径。未运行/不可达/拒绝均保留原因。
- [隐藏客户端注册表性能](acceptance/perf.md)：首个可交互页面、暖页面、实际目录尺寸及搜索 p50/p95。
- [仅供人工判断的短清单](acceptance/CHECKLIST-for-user.md)：布局、手感、动画、浅色主题和25项常用组件的呈现。

以上证据只证明记录中的版本、样本及路径；不自动勾选任何组件或功能，不证明所有边界或游戏语义。

## 发布规则与勾选定义

版本从 **0.99.1** 起补全功能；以下 **107个组件及全部非组件功能项**全部勾完，且没有未完成、未核实的阻塞项，才能发布 **1.0**。未勾选表示未达发布门槛，不等于功能完全不存在。

- 每个组件勾选时记录三选一结论：**专用界面 / 通用表单足够 / 明确不支持**，附验收人、证据链接及适用范围。当前界面形态只描述源码入口，不代表验收结论。
- 前两种结论须覆盖增删改、范围/默认值、取消、撤销、保存重开、未知字段保留及游戏行为；通用表单须由用户确认足够，不能凭有输入框勾选。
- “明确不支持”须写明原因、影响、原值保留方式及替代路径，经用户明确批准该发布范围后才能勾选；未实现或仅SNBT不能自动归入此项。未批准的缺功能继续阻塞1.0。
- 候选、类型、范围和默认值来自**游戏实时注册表 / 官方枚举 / 真实Codec**；资源候选来自活动ResourceManager。手写表不能作为在线权威来源，纯图标/中文标签可保留。每个选择器同时支持手动输入，空目录、未知ID不删除原值。
- 勾选须有前端消费、宿主校验及真实客户端回执。接口存在、源码接线、自动测试通过只证明对应层，不能互相替代。

## 107个持久组件

目标固定为MC **26.1.2**。ID和名称以 [data.js](../common/src/main/resources/assets/cadeditor/ui/js/data.js) 为底稿，变种名译成中文；形态对照 [审计脚本](../tools/audit-backend-status.cjs) 输出：CARDS关联为专用卡片，AUTO_BODY/SPEC_FORMS为专用表单，schema及自动头部控件为通用表单。含局部SNBT不等于整项仅SNBT；核不准的写未核实。

component_schema来源只说明独立JVM核验的宿主Codec结构；full不代表玩法验收，partial/unknown仍有未导出约束，前端消费尚待接线。完整证据见 [component-schema-contract](component-schema-contract.md)。

来源列“部分”只证明部分候选已接实时来源，不证明整个组件权威；“否”表示尚有手写数据充当权威来源；“未核实”缺少逐字段来源确认。全部组件仍须与实际持久组件全集、Codec核对；静态107项不能作为模组组件白名单。

| 组件 id | 中文名 | 当前界面形态 | 数据来源是否权威 | 是否已验收 |
|---|---|---|---|---|
| `minecraft:custom_model_data` | 自定义模型数据 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:custom_name` | 自定义名称 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:dyed_color` | 染色 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:enchantment_glint_override` | 附魔光效 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:item_model` | 物品模型 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:item_name` | 基础名称 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:lore` | 说明文字 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:rarity` | 稀有度 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:tooltip_display` | 提示框显示 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:tooltip_style` | 提示框样式 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:break_sound` | 损坏音效 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:damage` | 已损耗耐久 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:damage_resistant` | 免疫伤害 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:max_damage` | 最大耐久 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:max_stack_size` | 最大堆叠 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:repair_cost` | 铁砧惩罚 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:repairable` | 可修复材料 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:unbreakable` | 不可破坏 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:attack_range` | 攻击范围 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:attribute_modifiers` | 属性修饰器 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:blocks_attacks` | 格挡 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:damage_type` | 攻击伤害类型 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:kinetic_weapon` | 动能武器 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:minimum_attack_charge` | 最小攻击充能 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:piercing_weapon` | 穿刺武器 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:swing_animation` | 挥动动画 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:tool` | 工具 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:weapon` | 武器 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:enchantable` | 可附魔性 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:enchantments` | 附魔 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:stored_enchantments` | 存储的附魔 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:consumable` | 消耗行为 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:death_protection` | 死亡保护 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:food` | 食物 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:intangible_projectile` | 不可拾取投射物 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:ominous_bottle_amplifier` | 不祥之瓶强度 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:suspicious_stew_effects` | 谜之炖菜效果 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:use_cooldown` | 使用冷却 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:use_effects` | 使用时效果 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:use_remainder` | 使用后剩余 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:banner_patterns` | 旗帜图案 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:base_color` | 盾牌底色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:equippable` | 可装备 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:glider` | 滑翔 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:provides_banner_patterns` | 提供旗帜图案 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:provides_trim_material` | 提供纹饰材料 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:trim` | 盔甲纹饰 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:bees` | 蜜蜂 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:block_entity_data` | 方块实体数据 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:block_state` | 方块状态 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:bucket_entity_data` | 桶内实体数据 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:bundle_contents` | 收纳袋内容 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:can_break` | 可破坏方块 | 专用表单 | authoritative: component_schema（仅高级 predicates 为 partial/SNBT；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:can_place_on` | 可放置于 | 专用表单 | authoritative: component_schema（仅高级 predicates 为 partial/SNBT；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:charged_projectiles` | 已装填弹药 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:container` | 容器内容 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:container_loot` | 容器战利品 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:custom_data` | 自定义数据 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:debug_stick_state` | 调试棒状态 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:entity_data` | 实体数据 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:lock` | 容器锁 | 专用表单 | authoritative: component_schema（仅高级 predicates 为 partial/SNBT；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:pot_decorations` | 陶罐装饰 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:profile` | 头颅档案 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:lodestone_tracker` | 磁石追踪 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:map_color` | 地图颜色 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:map_decorations` | 地图标记 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:map_id` | 地图编号 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:recipes` | 解锁配方 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:writable_book_content` | 书与笔内容 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:written_book_content` | 成书内容 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:dye` | 染料 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:firework_explosion` | 烟花爆炸 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:fireworks` | 烟花 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:instrument` | 乐器 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:jukebox_playable` | 唱片 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:note_block_sound` | 音符盒音效 | 专用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:potion_contents` | 药水内容 | 专用卡片 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：专用界面 |
| `minecraft:potion_duration_scale` | 药水时长倍率 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:axolotl/variant` | 美西螈变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:cat/collar` | 猫项圈颜色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:cat/sound_variant` | 猫声音变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:cat/variant` | 猫变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:chicken/sound_variant` | 鸡声音变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:chicken/variant` | 鸡变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:cow/sound_variant` | 牛声音变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:cow/variant` | 牛变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:fox/variant` | 狐狸变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:frog/variant` | 青蛙变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:horse/variant` | 马变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:llama/variant` | 羊驼变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:mooshroom/variant` | 哞菇变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:painting/variant` | 画变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:parrot/variant` | 鹦鹉变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:pig/sound_variant` | 猪声音变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:pig/variant` | 猪变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:rabbit/variant` | 兔子变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:salmon/size` | 鲑鱼体型 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:sheep/color` | 绵羊颜色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:shulker/color` | 潜影贝颜色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:tropical_fish/base_color` | 热带鱼底色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:tropical_fish/pattern` | 热带鱼图案 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:tropical_fish/pattern_color` | 热带鱼图案颜色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:villager/variant` | 村民变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:wolf/collar` | 狼项圈颜色 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:wolf/sound_variant` | 狼声音变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:wolf/variant` | 狼变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |
| `minecraft:zombie_nautilus/variant` | 僵尸鹦鹉螺变种 | 通用表单 | authoritative: component_schema（结构 full；[Codec证据](component-schema-contract.md)，前端消费/玩法待验） | [ ] 机器通过 3/3 · 2026-11-08 · [回执](acceptance/components.md) · 建议：通用表单足够（**待你确认**） |

## 手写表与页面接线

以下为源码接线状态，不代表已通过1.0验收。回退表和UI本地化不得作为在线完整候选的白名单。实际加载顺序优先于单个文件里的定义。

| 前端表/需求 | 当前结论 | 接线与边界 |
|---|---|---|
| MC_COLORS | 已替换为实时数据；保留离线/未到达回退与中文标签 | forms.js mcColors()读取enum:text_color的id/rgb，富文本及颜色盘调用；静态16色保留。 |
| HIDE_PARTS | 保留为UI常用项；完整候选改为实时数据 | 常用chips仍保留；“＋其他组件”通过data_component_type选择，支持未知/模组组件ID。 |
| TAG_NAMES | 保留为中文别名回退 | tags:*的翻译name优先；缺翻译时才取静态中文别名，再回退ID。 |
| RESIST / TOOL_GROUPS | 保留为UI快捷项；接入实时存在性过滤 | keepKnownTags按tags:damage_type / tags:block过滤；离线或目录未返回/为空时仍保留原快捷项，不可视为已核实存在。 |
| TRIM_MATS | 已替换为实时候选；保留离线/未到达回退 | 材料/图案使用实时trim注册表；静态表不是在线候选白名单。 |
| TRIM_ICON / 模板图标 | 已接实时关联；保留静态图标回退 | liveTrimIcon读取trim_materials.ingredients / trim_patterns.template_items；缺关联时仍走静态图标回退。 |
| POTION_VARIANTS / POTION_IDS | 保留为离线回退 | 连接游戏后的药水候选来自实时potions；静态变种表用于离线/无返回时的预览回退。 |
| ANIMS / EQ_SLOTS / FW_SHAPES / CE_TYPES | 已接实时枚举；保留UI说明及离线回退 | syncEnums按enum:use_animation / equipment_slot / firework_shape / consume_effect_type过滤并追加；写入id而非symbol。 |
| 生物变种离线sc.en | 已接实时枚举；保留离线/未到达回退 | liveEnumOptions接9种生物枚举及rarity；小枚举分段/色板等手动输入门槛仍需核对。 |
| ikind | 已接实时事实；保留离线/未到达回退 | liveKind读取item_meta与item_defaults；数据未到仍使用静态分类。 |
| SLOT_COUNT / 收纳袋容量 | 已接实时事实；保留回退 | container_size / bundle_capacity优先；未知格数仍回退固定表或27，袋内特殊重量规则未由容量接口替代。 |
| MELEE_SLOTS / 攻击基础值 | 已接实时事实；保留回退 | equipment_slot_groups / entity_base_attributes优先；未到或缺值仍用mainhand、hand及1/4。 |
| item_model / tooltip_style / equipment_asset | 已接实时资源目录 | 模型改用item_model资源注册表，样式和装备外观保持直连资源目录；手动输入保留。 |
| profile_texture / profile_cape / profile_elytra | 候选通道已接；实际profile表单尚未接通 | cards5.js添加资源选择器，但随后加载的world.js覆盖AUTO_BODY.profile，最终仍为普通输入框；不能记为实际界面已接通。 |
| camera_overlay | 尚未接线 | 仅Reg.DIRECT识别请求名；equippable字段仍未接资源选择器，等待后端语义确认。 |
| 刷怪蛋 / 刷怪笼 / 试炼刷怪器页面 | 已添加专用页面，未作用户/实机验收 | spawn.js与pages.js已接entity_info、item_meta、spawner_info；原始未知字段保留路径仍需往返验收。 |

## 非组件功能

每项满足完成标准并附证据后勾选。“未完成”有已知缺口，“未核实”尚无足够端到端证据。性能数值是发布目标，不是已测成绩；预算未签定前继续阻塞发布。

| 编号 | 功能 | 怎样算完成 | 是否已验收 |
|---|---|---|---|
| F01 | 刷怪蛋页 | 按对应实体展示名称、属性、装备与变种；读取entity_info/实时注册表；未知字段保留；保存重开及实际生成行为符合修改。 | [ ] 未核实 |
| F02 | 刷怪笼 / 试炼刷怪器页 | 在物品编辑范围内编辑实体、权重、延迟、数量、范围、条件及试炼配置；来自官方Codec/宿主导出；写回后在隔离世界放置核对实际行为。 | [ ] 未完成 |
| F03 | 收纳袋内物品组件编辑 | 袋内每件物品可进入组件编辑、撤销及取消；递归保存不丢未知组件/类型；容量按游戏规则计算，覆盖嵌套袋及蜂巢特殊重量。 | [ ] 未核实 |
| F04 | 容器内物品组件编辑 | 任意槽内物品可编辑组件；槽号、数量、嵌套内容及未改组件保留；取消不改原物品；背包与服务端容器路径均验证。 | [ ] 未核实 |
| F05 | 桥梁类型保真提交（component_formats） | 前端按组件发送component_formats:snbt并走宿主保真通道；byte/short/int/long/float/double、三种类型数组、嵌套未知字段往返不变；完整long种子可保存。 | [ ] 未完成 |
| F06 | validate_component接入 | 通用/原始编辑提交前调用真实组件Codec；校验回执关联当前编辑版本；字段错误可见、失败保留草稿；规范化不吞未知值或改变类型。 | [ ] 未核实 |
| F07 | 拼音搜索预算 | 真实Rhino默认预算下，对完整物品/音效目录逐字输入拼音、首字母及汉字混输；无预算错误、停页；热搜索p95≤20ms，或分帧单段≤8ms且取消过期搜索。 | [ ] 未核实 |
| F08 | 静态分类ikind | 由实时item_meta/item_defaults推导类别；原版与模组刷怪蛋、装备、容器等进入正确页；静态表不作为在线分类白名单。 | [ ] 未核实 |
| F09 | 静态格数SLOT_COUNT | 格数来自container_size/实际容器信息；不按名称猜测或兜底27；模组容器通过验证，未知容量明示限制。 | [ ] 未完成 |
| F10 | MC_COLORS / CODE_COLOR | 文字颜色及格式来自官方枚举；富文本、旧表单、颜色控件全部接入；语言/资源切换刷新，离线表不限制在线选项。 | [ ] 未核实 |
| F11 | HIDE_PARTS | 隐藏项来自当前data_component_type注册表，含模组组件、手动输入与未知项保留，不局限固定8项。 | [ ] 未核实 |
| F12 | TAG_NAMES | 标签候选来自实时目录及语言键；别名只做展示，不隐藏真实标签；无翻译显示ID；空标签、模组标签可用。 | [ ] 未核实 |
| F13 | RESIST | 快捷标签按实时damage_type标签存在性过滤；完整候选与手输可达，不凭固定表宣称标签存在。 | [ ] 未核实 |
| F14 | TOOL_GROUPS | 工具快捷组按实时方块标签过滤；规则成员来自注册表/标签；模组标签、手输及重载通过验证。 | [ ] 未核实 |
| F15 | MELEE_SLOTS | 槽位及槽位组匹配来自EquipmentSlotGroup/宿主导出；主手、副手及扩展按实际规则显示和计算。 | [ ] 未核实 |
| F16 | 攻击基础值 / AMT_LIMIT | 读取玩家或目标实体实际基础属性，不写死1/4；范围来自实际属性/Codec，旧入口不再任意限幅±2048；结果与游戏一致。 | [ ] 未完成 |
| F17 | 枚举控件手动输入 | 每个选择器含分段、色板、通用schema及旧附魔/属性入口均可手输；候选来自实时枚举/注册表；刷新保留未知输入，非法值由Codec解释。 | [ ] 未完成 |
| F18 | 29个生物变种组件 | 按registry-contract逐项核对14个注册表组件与15个官方枚举组件；无离线枚举白名单；序列化字符串/颜色正确，模组候选与实体行为通过验收。 | [ ] 未核实 |
| F19 | 纹饰 | 候选及ingredients/template_items图标关联来自实时组件/真实配方，不拼模板ID；远服unavailable明示并可手输；数据包/模组纹饰可保存。 | [ ] 未核实 |
| F20 | 资源ID | item_model、tooltip_style、equipment_asset、camera_overlay、profile皮肤/披风/鞘翅读取活动资源包目录；保留命名空间/子目录；验证空目录、不可用、手输与重载。 | [ ] 未完成 |
| F21 | 方块属性 | block_state/debug_stick_state接block_properties真实属性名、值及默认值；模组方块和非法组合通过验证，不再只能手输猜字段。 | [ ] 未完成 |
| F22 | 战利品 / 配方 / 维度 / 地图标记 | 使用合同中的真实来源；集成服/远服分别测试；未同步明确unavailable，不伪报完整空列表；手输值与long种子保真。 | [ ] 未核实 |
| F23 | 模组组件与实时结构 | 不以离线107项限制组件；实时持久组件可发现，结构/范围由Codec确认；不能结构化的走SNBT+validate_component，不能编辑的明示限制且保留原值。 | [ ] 未完成 |
| F24 | 仿真界面验收 | ui-contract、ui-world、ui-compact等适用测试通过；真实Oriel渲染覆盖全部组件入口、窗口、分页和错误态；无document.error；附截图/日志，不能代替实机。 | [ ] 未核实 |
| F25 | 真实客户端与世界验收 | 按TESTING逐项修改107组件→成功回执→重开→/data核对；补刷怪与嵌套内容；单人、联机、权限拒绝、槽位变化、取消均有独立回执。 | [ ] 未核实 |
| F26 | 首开读取与性能预算 | 固定JDK、资源、视口和数据集，分别记录采集/分页/patch/首次可交互的冷暖开p50/p95；首开读取及可交互数值上限由维护者签定并达标；采集tick峰值<5ms、单patch≤10ms、整批刷新≤1次；开屏不请求默认组件全集。 | [ ] 未核实 |
| F27 | 亮色主题审查 | 全部页面、选择窗、详细窗口、应用确认及错误/禁用/悬停态可读；窄窗无截断；主题持久化、深浅切换及重开通过用户视觉验收。 | [ ] 未核实 |
| F28 | 保存成功率 | 合法样例覆盖107组件及全部写回路径，各至少重复3轮；记录尝试/成功/拒绝/超时及原因；合法样例成功率100%、丢数据0；非法/过期会话应拒绝并保留草稿，另计拒绝率。 | [ ] 未核实 |
| F29 | 草稿 / 撤销 / 生命周期 | 大草稿在20条/秒限频下逐块回执且可恢复；撤销重做、换基线及保存后清理正确；开关20轮不持续泄漏；关闭无页面动画/周期草稿；未知组件保留。 | [ ] 未核实 |
| F30 | 唱片 / 乐器试听 | 实机能播放存在的音源，空事件/缺资源/静音有明确结果；长音乐能力经实测；明确不支持须经用户批准，按钮存在不算通过。 | [ ] 未核实 |

## 谁来勾与如何重新统计

| 责任人 | 勾选职责 |
|---|---|
| 前端维护者 | 核实入口和实时数据消费，提供仿真截图、交互/错误态证据，填写形态和来源；不能代替用户视觉验收。 |
| 后端维护者 | 核实持久组件全集、注册表/Codec及写回，提供类型保真、权限、联机、性能的真实客户端回执。 |
| 用户 / 用户指定验收人 | 依据TESTING及证据逐项勾选，确认通用表单足够、视觉结果及明确不支持范围；发布负责人复核全表后决定1.0。 |

在仓库根目录运行：

    node tools/audit-backend-status.cjs

输出为被git忽略的docs/STATUS-data.md、docs/STATUS-generic.md；源码哈希证据为logs/backend-b/ui-source-audit.json。脚本不覆盖本清单，也不会自动勾选。对照data.js的107个唯一ID及实际持久组件全集，逐行更新形态/来源；新增或移除组件须说明版本/范围，不能靠改变统计分母消除缺口。

按“是否已验收”列统计：完成勾选为完成，未勾选且标“未完成”为已知缺口，标“未核实”为证据不足；两类未勾选均阻塞1.0。来源列的部分/否/未核实单独复核，不算已验收。勾选后在同一格追加三选一结论、验收人及证据链接。相关实现变化后须重新核实，不能沿用失效证据。

行为操作见 [TESTING](TESTING.md)，数据依据见 [registry-contract](registry-contract.md)。
