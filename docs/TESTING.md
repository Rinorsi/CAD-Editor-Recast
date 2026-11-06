# 物品工坊测试手册（26.1.2）

此表是待用户验收的操作单，所有复选框均留空。自动化只证明道具合法与发放/清理逻辑，不代替107项界面和世界行为验收。本期只测物品，不测试实体、方块、命令方块和数据包编辑。

## 1. 启动与发放

1. 更新并重启客户端和服务端的Editor jar，安装Fabric API及Oriel 0.11。单人世界打开作弊并切创造，或多人以OP等级≥2使用；同时需满足服务器config/cadeditor.json编辑策略。普通生存玩家即使被放宽编辑策略也不能使用testkit。
2. 手动双击根目录“启动物品工坊预览.bat”，用Editor自己的Loom客户端；或在普通启动器mods放上述三个jar。已有用户游戏不得由自动化关闭或占用。
3. 游戏内输入/cadeditor testkit（等同all）。固定45件道具覆盖107个持久组件，命名“测N·主题”。先填快捷栏、背包36格，再副手，不动盔甲格，不覆盖或丢弃原有物品；通常空背包得到36件直放+副手一个测0潜影盒（其余9件）。空间不足时增加分箱，只有一空格也能取全套；含潜影盒的分箱改用原版木桶，避免潜影盒套潜影盒。多分箱外有一个测0木桶。手动放置/打开测0包装箱取物品（属于原版存取，不是方块编辑验收），先不要放置测18/19等被测数据物品。
4. 37格全部满时命令明确拒绝，不会掉地上/删除/覆盖任何物品；先空一格再发。重复执行会追加另一套，不会替换上一套。
5. 子命令：hotbar只发前9号并仅使用快捷栏空格；inventory发全套但只使用背包36格；all发全套并可用副手；clear递归清理当前背包36格/副手中带测试标记的道具与生成的包装，保留普通物品、容器里的自有物品及原槽位。不扫描盔甲、末影箱、已放置箱子、掉落物或其他玩家。含自有物品的测试箱/袋保留。
6. 测46“模组内容”仅在运行中的真实注册表里存在非minecraft物品/附魔/效果时额外提供，选择实际ID，不会虚构testmod。纯原版注册表会安静跳过。实际加载第三方模组时，该道具中的第三方内容卸载对应第三方模组后不保证保留；前45件全是原版。

清理识别使用原版lore可见说明“物品工坊测试道具 / 26.1.2 / v1”，无隐藏私有组件。改名后仍能clear；请先保留此标记行，删除标记后不会自动清除。不要把相同标记复制给自己的正式物品。测试custom_data的普通样例字段只是组件本身的测试值，不作为清理标记。

## 2. 如何逐项测

把对应道具拿主手，按I或/cade。表中页签按物品种类显示；专门卡片没有显示的组件统一从右上角代码图标“高级”→组件列表搜索组件ID，使用通用表单/原始编辑。Ctrl+K可打开操作搜索，Ctrl+S打开应用确认，Ctrl+Z撤销、Ctrl+Y重做。

每行包含1～4个被测组件，依次只改一个，点“应用修改”→“应用到游戏”，必须看到成功回执；关闭再按I核对已改值，其他组件不应丢。每件另有名称/说明用于标记，测1额外带max_stack_size=1以满足耐久合法性。下表非默认值均已与实际基础物品默认组件比较并通过Codec往返，单位组件{}的“存在”本身就是非默认。

独立核对命令（手持该道具时，含冒号/斜杠的组件键要加双引号）：

```mcfunction
/data get entity @s SelectedItem
/data get entity @s SelectedItem.components."minecraft:damage"
/data get entity @s SelectedItem.components."minecraft:wolf/variant"
```

每行的“核对”都指上述SelectedItem.components下对应minecraft:<组件ID>；Codec会省略组件内的默认子字段，这是正常规范化。表中修改目标以游戏实际可选值和合法范围为准，拒绝时草稿应保留；提示框不足以证明所有组件已落盘，需结合/data与重新打开。

| 用户验收 | 道具 | 被测组件与初值 | 页签/卡片 | 操作 | 保存后期望与核对 |
|---|---|---|---|---|---|
| ☐ | 测1·钻石剑耐久（`minecraft:diamond_sword`） | `max_damage`=`384`；`damage`=`17`；`unbreakable`=`{}`；`repair_cost`=`3` | 耐久；未列组件走高级 | 损耗17→18、最大耐久384→400、惩罚3→4；不可破坏关→开；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测2·斧头工具属性（`minecraft:diamond_axe`） | `tool`=`{"rules":[{"blocks":"#minecraft:incorrect_for_copper_tool","correct_for_drops":false},{"blocks":"#minecraft:mineable/axe","correct_for_drops":true,"speed":5}]}`；`weapon`=`{"disable_blocking_for_seconds":4,"item_damage_per_attack":3}`；`attribute_modifiers`=`[{"type":"minecraft:attack_damage","id":"minecraft:verified","amount":2,"operation":"add_value","slot":"mainhand"}]`；`enchantable`=`{"value":1}` | 工具/攻击/附魔；未列组件走高级 | 工具规则速度5→6、武器每次耗耐久3→4、攻击修饰2→3、可附魔性1→2；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测3·攻击范围动作（`minecraft:iron_sword`） | `attack_range`=`{"hitbox_margin":0.125,"max_creative_reach":6.5,"max_reach":4.5,"min_creative_reach":2,"min_reach":2,"mob_factor":0.5}`；`minimum_attack_charge`=`0.4`；`swing_animation`=`{"duration":10}`；`damage_type`=`"minecraft:spear"` | 攻击；未列组件走高级 | 最大攻击范围4.5→5、最低充能0.4→0.5、挥动时长10→12；更换合法伤害类型；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测4·格挡与动能（`minecraft:iron_sword`） | `blocks_attacks`=`{"block_delay_seconds":0.25,"block_sound":"minecraft:item.shield.block","bypassed_by":"#minecraft:bypasses_shield","disabled_sound":"minecraft:item.shield.break","item_damage":{"base":1,"factor":1,"threshold":3}}`；`kinetic_weapon`=`{"damage_conditions":{"max_duration_ticks":250,"min_relative_speed":4.6},"damage_multiplier":0.82,"delay_ticks":13,"dismount_conditions":{"max_duration_ticks":80,"min_speed":12},"forward_movement":0.38,"hit_sound":"minecraft:item.spear.hit","knockback_conditions":{"max_duration_ticks":165,"min_speed":5.1},"sound":"minecraft:item.spear.use"}`；`piercing_weapon`=`{"hit_sound":"minecraft:item.spear.hit","sound":"minecraft:item.spear.attack"}` | 高级→组件列表 | 格挡延迟0.25→0.3、动能倍率0.82→0.9；检查并更换穿刺音效；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测5·染色纹饰装备（`minecraft:leather_chestplate`） | `dyed_color`=`3394815`；`trim`=`{"material":"minecraft:quartz","pattern":"minecraft:sentry"}`；`equippable`=`{"slot":"chest","equip_sound":"minecraft:item.armor.equip_diamond","asset_id":"minecraft:diamond","allowed_entities":["minecraft:player"]}`；`glider`=`{}` | 穿戴与防护；未列组件走高级 | 换染色/纹饰，胸部装备改另一合法槽位；滑翔关→开；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测6·附魔书（`minecraft:enchanted_book`） | `enchantments`=`{"minecraft:sharpness":5}`；`stored_enchantments`=`{"minecraft:sharpness":5}`；`enchantment_glint_override`=`false`；`repairable`=`{"items":"#minecraft:repairs_chain_armor"}` | 附魔/外观；未列组件走高级 | 两个附魔表分别把锋利5→3/4；光效false→true；修改修复材料标签；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测7·名称说明稀有度（`minecraft:paper`） | `custom_name`=`{"text":"核准示例"}`；`item_name`=`{"translate":"item.minecraft.acacia_boat"}`；`lore`=`[{"text":"第一行测试说明"},{"text":"第二行测试说明","color":"gold"}]`；`rarity`=`"epic"` | 外观；未列组件走高级 | 改名称/基础名称/两行说明，史诗→稀有；保留测试标记行；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测8·模型与提示（`minecraft:paper`） | `custom_model_data`=`{"floats":[1.25],"flags":[true],"strings":["sample"],"colors":[3394815]}`；`item_model`=`"minecraft:acacia_boat"`；`tooltip_display`=`{"hidden_components":["minecraft:enchantments"]}`；`tooltip_style`=`"minecraft:stone"` | 外观；未列组件走高级 | 改浮点1.25→2、切换标志、改字符串/颜色；更换模型、隐藏提示、样式ID；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测9·堆叠与耐性（`minecraft:paper`） | `max_stack_size`=`16`；`break_sound`=`"minecraft:entity.experience_orb.pickup"`；`damage_resistant`=`{"types":"#minecraft:is_fire"}` | 堆叠与耐久；未列组件走高级 | 堆叠16→32，换损坏音效与免疫伤害标签；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测10·食用及剩余（`minecraft:golden_apple`） | `food`=`{"nutrition":6,"saturation":0.8}`；`consumable`=`{"consume_seconds":0.8,"animation":"eat","sound":"minecraft:entity.generic.eat"}`；`use_effects`=`{"can_sprint":true,"interact_vibrations":false,"speed_multiplier":0.5}`；`use_remainder`=`{"id":"minecraft:bowl"}` | 食用；未列组件走高级 | 营养6→7，消耗秒数0.8→1，使用速度0.5→0.6、切换布尔；碗换玻璃瓶；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测11·死亡保护（`minecraft:totem_of_undying`） | `death_protection`=`{"death_effects":[{"type":"minecraft:apply_effects","effects":[{"id":"minecraft:regeneration","duration":1200,"amplifier":1}]}]}` | 堆叠与耐久/死亡保护；未列组件走高级 | 再生1200→1400ticks；不要求触发死亡；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测12·炖菜效果（`minecraft:suspicious_stew`） | `suspicious_stew_effects`=`[{"id":"minecraft:night_vision","duration":240}]` | 食用效果；未列组件走高级 | 夜视240→300ticks；增删合法效果；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测13·药水（`minecraft:potion`） | `potion_contents`=`{"potion":"minecraft:swiftness","custom_color":3394815,"custom_effects":[{"id":"minecraft:glowing","duration":600,"amplifier":0}]}`；`potion_duration_scale`=`0.25`；`use_cooldown`=`{"seconds":1}` | 药水；未列组件走高级 | 迅捷换另一药水，发光600→700，改颜色；持续倍率0.25→0.5；冷却1→2秒；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测14·不祥之瓶（`minecraft:ominous_bottle`） | `ominous_bottle_amplifier`=`3` | 高级→组件列表 | 不祥强度3→2；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测15·弩与投射物（`minecraft:crossbow`） | `charged_projectiles`=`[{"id":"minecraft:arrow","count":1}]`；`intangible_projectile`=`{}` | 高级→组件列表 | 修改装填列表；不可拾取标记移除再恢复；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测16·潜影盒内容（`minecraft:shulker_box`） | `container`=`[{"slot":0,"item":{"id":"minecraft:diamond","count":1}}]` | 内容/容器；未列组件走高级 | 内含钻石1→2，增删槽位；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测17·收纳袋内容（`minecraft:bundle`） | `bundle_contents`=`[{"id":"minecraft:emerald","count":8}]` | 内容/收纳袋；未列组件走高级 | 绿宝石8→9，保持容量合法；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测18·箱子数据与锁（`minecraft:chest`） | `block_entity_data`=`{"id":"minecraft:chest","CustomName":"测试箱"}`；`lock`=`{"items":"minecraft:tripwire_hook"}`；`container_loot`=`{"loot_table":"minecraft:chests/simple_dungeon","seed":42}` | 高级→组件列表 | 检查方块实体id，换锁钥匙物品，战利品seed42→43；不放置；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测19·蜂巢状态（`minecraft:beehive`） | `bees`=`[{"entity_data":{"id":"minecraft:bee"},"ticks_in_hive":40,"min_ticks_in_hive":2400}]`；`block_state`=`{"honey_level":"3"}` | 高级→组件列表 | 蜂在巢40→50ticks、蜂蜜3→4；不释放蜜蜂；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测20·桶内数据（`minecraft:tropical_fish_bucket`） | `bucket_entity_data`=`{"Health":6.0,"Age":-24000}` | 高级→组件列表 | Health6→7，修改Age；不倒出鱼；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测21·实体物品数据（`minecraft:armor_stand`） | `entity_data`=`{"id":"minecraft:allay"}` | 高级→组件列表 | 检查实体id并修改一项原版实体字段；不生成实体；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测22·冒险放置破坏（`minecraft:stone`） | `can_break`=`{"blocks":"minecraft:stone"}`；`can_place_on`=`{"blocks":"minecraft:dirt"}` | 高级→组件列表 | 可破坏stone→cobblestone、可放置dirt→grass_block；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测23·调试棒及自定义数据（`minecraft:debug_stick`） | `debug_stick_state`=`{"minecraft:oak_log":"axis"}`；`custom_data`=`{"note":"原版自定义数据样例","level":2}` | 高级→组件列表 | oak_log的axis换另一合法方块属性；自定义level2→3；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测24·头颅与音符盒音效（`minecraft:player_head`） | `profile`=`{"id":[1,2,3,4]}`；`note_block_sound`=`"minecraft:block.note_block.bell"` | 高级→组件列表 | 检查四整数UUID、修改其中一位；更换音符盒音效ID；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测25·陶罐装饰（`minecraft:decorated_pot`） | `pot_decorations`=`["minecraft:angler_pottery_sherd","minecraft:archer_pottery_sherd","minecraft:brick","minecraft:prize_pottery_sherd"]` | 高级→组件列表 | 把第一片angler陶片换另一合法陶片；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测26·盾牌旗帜（`minecraft:shield`） | `banner_patterns`=`[{"pattern":"minecraft:stripe_bottom","color":"blue"}]`；`base_color`=`"red"`；`provides_banner_patterns`=`"#minecraft:pattern_item/bordure_indented"` | 高级→组件列表 | 旗帜红底→蓝底、底条纹蓝→黄；更换提供图案的合法标签；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测27·纹饰材料（`minecraft:amethyst_shard`） | `provides_trim_material`=`"minecraft:quartz"` | 高级→组件列表 | quartz→另一合法纹饰材料（底物仍为紫水晶碎片）；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测28·磁石指南针（`minecraft:compass`） | `lodestone_tracker`=`{"target":{"dimension":"minecraft:overworld","pos":[0,64,0]},"tracked":false}` | 高级→组件列表 | 目标x0→16；保持tracked=false；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测29·地图数据（`minecraft:filled_map`） | `map_id`=`42`；`map_color`=`16763904`；`map_decorations`=`{"sample":{"type":"minecraft:red_marker","x":12.0,"z":24.0,"rotation":90.0}}` | 高级→组件列表 | 地图编号42→43、地图颜色、标记坐标12→16；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测30·配方书（`minecraft:knowledge_book`） | `recipes`=`["minecraft:crafting_table"]` | 高级→组件列表 | 检查工作台配方并添加一个本版本实际存在配方；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测31·书与笔（`minecraft:writable_book`） | `writable_book_content`=`{"pages":["测试第一页","测试第二页"]}` | 内容/书与笔；未列组件走高级 | 改第二页并新增第三页；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测32·成书（`minecraft:written_book`） | `written_book_content`=`{"title":"测试成书","author":"物品工坊","pages":[{"text":"第一章：组件往返"},{"text":"第二章：保存后重开"}],"generation":1,"resolved":true}` | 内容/成书；未列组件走高级 | 改标题/作者/第二页，成书代数1→2；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测33·烟花火箭（`minecraft:firework_rocket`） | `fireworks`=`{"flight_duration":2,"explosions":[{"shape":"star","colors":[16711680,255],"has_trail":true}]}` | 烟花/火箭；未列组件走高级 | 飞行2→3；增删爆炸和颜色；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测34·烟火之星（`minecraft:firework_star`） | `firework_explosion`=`{"shape":"star","colors":[16711680,255],"fade_colors":[16777215],"has_trail":true,"has_twinkle":true}` | 烟花/烟火之星；未列组件走高级 | 星形换其他形状，改红蓝/淡出色，切换拖尾/闪烁；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测35·山羊角（`minecraft:goat_horn`） | `instrument`=`"minecraft:sing_goat_horn"` | 高级→组件列表 | sing_goat_horn换另一合法乐器；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测36·唱片（`minecraft:music_disc_13`） | `jukebox_playable`=`"minecraft:cat"` | 高级→组件列表 | cat换另一合法唱片曲目；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测37·染料（`minecraft:white_dye`） | `dye`=`"red"` | 高级→组件列表 | 红色改蓝色；物品ID仍为white_dye；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测38·狼变种（`minecraft:paper`） | `wolf/variant`=`"minecraft:ashen"`；`wolf/sound_variant`=`"minecraft:angry"`；`wolf/collar`=`"red"` | 高级→组件列表 | 换狼外观、声音与项圈红→蓝；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测39·猫变种（`minecraft:paper`） | `cat/variant`=`"minecraft:all_black"`；`cat/sound_variant`=`"minecraft:classic"`；`cat/collar`=`"blue"` | 高级→组件列表 | 换猫外观、声音与项圈蓝→红；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测40·猪牛变种（`minecraft:paper`） | `pig/variant`=`"minecraft:cold"`；`pig/sound_variant`=`"minecraft:big"`；`cow/variant`=`"minecraft:cold"`；`cow/sound_variant`=`"minecraft:classic"` | 高级→组件列表 | 逐个更换猪牛外观与声音；仅一个声音可选时移除再恢复；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测41·鸡蛙蝾螈（`minecraft:paper`） | `chicken/variant`=`"minecraft:cold"`；`chicken/sound_variant`=`"minecraft:classic"`；`frog/variant`=`"minecraft:cold"`；`axolotl/variant`=`"gold"` | 高级→组件列表 | 逐个改鸡外观/声音、蛙变种、蝾螈变种；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测42·马驼蘑菇狐（`minecraft:paper`） | `horse/variant`=`"black"`；`llama/variant`=`"brown"`；`mooshroom/variant`=`"brown"`；`fox/variant`=`"snow"` | 高级→组件列表 | 逐个改马、羊驼、哞菇、狐狸枚举；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测43·兔鹦鹉画村民（`minecraft:paper`） | `rabbit/variant`=`"gold"`；`parrot/variant`=`"blue"`；`painting/variant`=`"minecraft:alban"`；`villager/variant`=`"minecraft:desert"` | 高级→组件列表 | 逐个改兔/鹦鹉枚举与画/村民注册表项；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测44·热带鱼与鲑鱼（`minecraft:paper`） | `tropical_fish/base_color`=`"orange"`；`tropical_fish/pattern`=`"clayfish"`；`tropical_fish/pattern_color`=`"blue"`；`salmon/size`=`"large"` | 高级→组件列表 | 改鱼双色、花纹clayfish、鲑鱼large→small；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |
| ☐ | 测45·羊潜影鹦鹉螺（`minecraft:paper`） | `sheep/color`=`"lime"`；`shulker/color`=`"purple"`；`zombie_nautilus/variant`=`"minecraft:temperate"` | 高级→组件列表 | 改羊lime、潜影purple和僵尸鹦鹉螺变种；逐个保存 | 成功回执、重开保留；/data逐项核对本行组件新值与未改字段 |

| 用户验收 | 附加场景 | 操作与期望 |
|---|---|---|
| ☐ | 测46·模组内容（若存在） | 记录实际ID；选择对应附魔/效果/物品并保存重开；不存在则记“环境无该内容”，不替用户勾选 |
| ☐ | 撤销/重做/取消 | 用测7改名，撤销→重做→取消应用；物品仍旧名，草稿保留；再次应用后新名出现 |
| ☐ | 错误输入 | 用测1填写非法数量/超范围值（能输入时）；应明确拒绝、保留草稿、不覆盖原物品 |
| ☐ | 长时间编辑 | 测7留页超过31分钟后保存仍可用；后台单元测试还覆盖9小时；真实物品被别人改动则item_changed拒绝并保留草稿 |
| ☐ | 复制命令 | 高级→命令→复制；手动粘贴核对，不要求执行；自动化测试不读写用户剪贴板 |
| ☐ | 偏好与窗口 | 切2D/3D、拖左栏宽度、窗口尺寸/最大化、声音开关、折叠预览/属性；关闭重开检查config/cadeditor-ui.json与界面恢复 |
| ☐ | 列表/添加/删除 | 每种列表新增一条、拖动/改顺序（支持时）、删除；保存重开，确认只改目标项 |
| ☐ | 热重载保草稿 | 先改测7名称不应用，切分页/折叠；改CSS保持控制器，改JS整页恢复已进Store的草稿/分页/折叠；再应用成功 |
| ☐ | 卸载Editor/Oriel | 先保存世界退出，备份该测试存档，用相同MC移除Editor/Oriel后重进；/data与提示核对名称、组件仍是原版；部分纯数据组件没有可见世界行为 |
| ☐ | 满背包与清理 | 背包36+副手全满执行命令应拒绝且原物品不变；空一格得全套，往测试包装塞自有钻石后clear，只移除测试道具，自有钻石与箱/袋保留 |

## 3. Oriel 0.11 原生界面热更新

仅放jar的普通安装也可使用。在该游戏目录config/oriel/dev-sources.properties写：

```properties
cadeditor=<本仓库>/fabric/src/main/resources/assets/cadeditor
```

重启一次，I/cade仍打开cadeditor:ui/index.html；保存读过的CSS约1秒更新且不重建控制器，JS/HTML重建并走saveState/restoreState。不用复制、watch脚本或devPage开关。启动器tools/preview/start.ps1会自动确保此映射，只负责启动；用户用的控制台与游戏窗口保持正常可见。PNG/封面仍由jar提供，换图要重建；Java仍需重编重启。尚未提交给Store的输入、光标/临时弹窗不保证恢复。

## 4. 静默自动化与证据

在Editor目录Git Bash：

```bash
bash tools/gw.sh :fabric:26.1.2:build --no-problems-report
node tools/ui-contract-test.cjs
```

现有codecTest已调用TestKitTest：真实26.1.2注册表/Codec，对照独立107项ID清单及运行时所有原版持久组件，逐件非默认样例检查、类型保真NBT往返；生产命令树/权限门槛、hotbar/inventory/all规划、全满拒绝/单空格全套、普通道具与嵌套容器内容保护、clear作用范围。无需启动客户端/服务端，不读写用户剪贴板、不占用输入设备。结果存工作区daily/2026-11-06/logs/editor-testkit-build-final.log、editor-testkit-ui-contract.log。

需要后台真客户端的既有回归可先构建autotestJar/exportAutotestClasspath，再在PowerShell7运行tools/autotest/run.ps1 -Mode live（或edit/server/vanilla）；只用独立editor-ds-*测试目录、内部通道、离屏窗口，不能与其他测试/用户运行目录并用。旧脚本需预置测试世界，且这些模式主要验证改名/控制器/热更新，不代表107组件都已游戏端验收。无独立目录或窗口/光标隔离条件时只做上面的无窗口测试，不自动运行用户bat。

## 5. 范围与限制

- 道具包是显式权限命令，默认不自动塞背包、不随启动给普通玩家发物品；为了只测试全部原版组件，某些组合有意与底物的自然用途不同（如纸上的实体变种、白染料上的红色dye）。它们是合法物品组件，不承诺底物使用时能实现所有附加功能。
- 地图编号42不保证测试世界已经有对应地图；磁石目标是示例坐标；书中配方为实际原版键。tooltip_style的示例ID不附带资源包，不能要求显示额外皮肤；item_model依赖该版本资源。声音/纹理/模型的存在与看起来/听起来正确须人工检查。
- 音效听感、2D/3D预览质量、动效、拖拽手感、所有39个专门卡片和68个通用表单的视觉交互均须人眼验收。自动化不会勾选本表。
- 107项覆盖指物品持久组件的存在、非默认值和Codec往返，不是所有字段边界/组合/全部注册表成员。真实服插件/权限/容器距离、网络断线、多人并发和卸载后的全套世界行为另需人工验证。
- clear只认可见lore标记；删除该行会成为无法自动识别的普通物品，需手工处理。层级超过16的异常用户容器保持不动，避免误删。
- 实体与方块编辑不做；不要用放置、刷怪或击杀来代替本轮组件读写核对。测0包装的原版存取不纳入这些编辑功能。

### 本轮真实命令回归证据

开发探针另有显式-Deditor.testkitProbe=true分支（仅独立autotest jar，不进入发行模组），在独立run/editor-testkit-client的集成服务端实际派发/cadeditor testkit/default/all/inventory/hotbar/clear，验证全满不丢普通物品、一空格包含45件、clear保留36组钻石、inventory不碰副手、hotbar前9件，以及非OP生存拒绝。12项断言PASSED，回执run/editor-testkit-client/editor-autotest-edit.json；日志logs/editor-testkit-client-edit.log。使用现有runner的当天独立副本scratch/editor-mod/run-testkit.ps1 -Mode edit（原tools/autotest未改），启动时窗口移出屏幕、禁止抓鼠标，不模拟系统输入；结束后该运行目录对应Java进程为0。完整build内TestKitTest为109项断言PASS。此回归未逐个点击107组件，不替用户勾选上面的表。

请先从测0包装中取出编号道具，再按I测试；测0本身不是107组件样例，整套嵌套包的快照可能超过页面/网络消息上限。