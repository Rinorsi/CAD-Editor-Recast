# 自动化组件验收

状态：COMPLETE

实机完整三轮均通过才记为通过；false 可能表示失败或未到达，具体看原因。默认原型样本只证明该值，不证明所有边界、所有组件字段或游戏行为。

统计：`{"components_total": 107, "components_attempted": 107, "applied": 107, "equal": 107, "typed_exact": 107, "validated": 107, "rejected": 0, "attempts": 321, "success": 321, "timeouts": 0}`

|组件|样本来源|apply 三轮|重开相等|类型精确保留|两种校验|成功/尝试|拒绝/超时|原因|
|---|---|---|---|---|---|---|---|---|
|`minecraft:custom_model_data`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:custom_name`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:dyed_color`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:enchantment_glint_override`|prototype:minecraft:debug_stick|通过|通过|通过|通过|3/3|0/0||
|`minecraft:item_model`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:item_name`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:lore`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:rarity`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:tooltip_display`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:tooltip_style`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:break_sound`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:damage`|prototype:minecraft:bow|通过|通过|通过|通过|3/3|0/0||
|`minecraft:damage_resistant`|prototype:minecraft:ancient_debris|通过|通过|通过|通过|3/3|0/0||
|`minecraft:max_damage`|prototype:minecraft:bow|通过|通过|通过|通过|3/3|0/0||
|`minecraft:max_stack_size`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:repair_cost`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:repairable`|prototype:minecraft:chainmail_boots|通过|通过|通过|通过|3/3|0/0||
|`minecraft:unbreakable`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:attack_range`|prototype:minecraft:copper_spear|通过|通过|通过|通过|3/3|0/0||
|`minecraft:attribute_modifiers`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:blocks_attacks`|prototype:minecraft:shield|通过|通过|通过|通过|3/3|0/0||
|`minecraft:damage_type`|prototype:minecraft:copper_spear|通过|通过|通过|通过|3/3|0/0||
|`minecraft:kinetic_weapon`|prototype:minecraft:copper_spear|通过|通过|通过|通过|3/3|0/0||
|`minecraft:minimum_attack_charge`|prototype:minecraft:copper_spear|通过|通过|通过|通过|3/3|0/0||
|`minecraft:piercing_weapon`|prototype:minecraft:copper_spear|通过|通过|通过|通过|3/3|0/0||
|`minecraft:swing_animation`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:tool`|prototype:minecraft:copper_axe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:weapon`|prototype:minecraft:copper_axe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:enchantable`|prototype:minecraft:book|通过|通过|通过|通过|3/3|0/0||
|`minecraft:enchantments`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:stored_enchantments`|prototype:minecraft:enchanted_book|通过|通过|通过|通过|3/3|0/0||
|`minecraft:consumable`|prototype:minecraft:apple|通过|通过|通过|通过|3/3|0/0||
|`minecraft:death_protection`|prototype:minecraft:totem_of_undying|通过|通过|通过|通过|3/3|0/0||
|`minecraft:food`|prototype:minecraft:apple|通过|通过|通过|通过|3/3|0/0||
|`minecraft:intangible_projectile`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:ominous_bottle_amplifier`|prototype:minecraft:ominous_bottle|通过|通过|通过|通过|3/3|0/0||
|`minecraft:suspicious_stew_effects`|prototype:minecraft:suspicious_stew|通过|通过|通过|通过|3/3|0/0||
|`minecraft:use_cooldown`|prototype:minecraft:chorus_fruit|通过|通过|通过|通过|3/3|0/0||
|`minecraft:use_effects`|prototype:minecraft:acacia_boat|通过|通过|通过|通过|3/3|0/0||
|`minecraft:use_remainder`|prototype:minecraft:beetroot_soup|通过|通过|通过|通过|3/3|0/0||
|`minecraft:banner_patterns`|prototype:minecraft:black_banner|通过|通过|通过|通过|3/3|0/0||
|`minecraft:base_color`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:equippable`|prototype:minecraft:black_carpet|通过|通过|通过|通过|3/3|0/0||
|`minecraft:glider`|prototype:minecraft:elytra|通过|通过|通过|通过|3/3|0/0||
|`minecraft:provides_banner_patterns`|prototype:minecraft:bordure_indented_banner_pattern|通过|通过|通过|通过|3/3|0/0||
|`minecraft:provides_trim_material`|prototype:minecraft:amethyst_shard|通过|通过|通过|通过|3/3|0/0||
|`minecraft:trim`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:bees`|prototype:minecraft:bee_nest|通过|通过|通过|通过|3/3|0/0||
|`minecraft:block_entity_data`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:block_state`|prototype:minecraft:bee_nest|通过|通过|通过|通过|3/3|0/0||
|`minecraft:bucket_entity_data`|runtime_codec_numeric_and_array_boundary_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:bundle_contents`|prototype:minecraft:black_bundle|通过|通过|通过|通过|3/3|0/0||
|`minecraft:can_break`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:can_place_on`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:charged_projectiles`|prototype:minecraft:crossbow|通过|通过|通过|通过|3/3|0/0||
|`minecraft:container`|prototype:minecraft:acacia_shelf|通过|通过|通过|通过|3/3|0/0||
|`minecraft:container_loot`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:custom_data`|runtime_codec_numeric_and_array_boundary_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:debug_stick_state`|prototype:minecraft:debug_stick|通过|通过|通过|通过|3/3|0/0||
|`minecraft:entity_data`|prototype:minecraft:allay_spawn_egg|通过|通过|通过|通过|3/3|0/0||
|`minecraft:lock`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:pot_decorations`|prototype:minecraft:decorated_pot|通过|通过|通过|通过|3/3|0/0||
|`minecraft:profile`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:lodestone_tracker`|live_block_entity_factory:minecraft:suspicious_sand|通过|通过|通过|通过|3/3|0/0||
|`minecraft:map_color`|prototype:minecraft:filled_map|通过|通过|通过|通过|3/3|0/0||
|`minecraft:map_decorations`|prototype:minecraft:filled_map|通过|通过|通过|通过|3/3|0/0||
|`minecraft:map_id`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:recipes`|prototype:minecraft:knowledge_book|通过|通过|通过|通过|3/3|0/0||
|`minecraft:writable_book_content`|prototype:minecraft:writable_book|通过|通过|通过|通过|3/3|0/0||
|`minecraft:written_book_content`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:dye`|prototype:minecraft:black_dye|通过|通过|通过|通过|3/3|0/0||
|`minecraft:firework_explosion`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:fireworks`|prototype:minecraft:firework_rocket|通过|通过|通过|通过|3/3|0/0||
|`minecraft:instrument`|prototype:minecraft:goat_horn|通过|通过|通过|通过|3/3|0/0||
|`minecraft:jukebox_playable`|prototype:minecraft:music_disc_11|通过|通过|通过|通过|3/3|0/0||
|`minecraft:note_block_sound`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:potion_contents`|prototype:minecraft:lingering_potion|通过|通过|通过|通过|3/3|0/0||
|`minecraft:potion_duration_scale`|prototype:minecraft:lingering_potion|通过|通过|通过|通过|3/3|0/0||
|`minecraft:axolotl/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:cat/collar`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:cat/sound_variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:cat/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:chicken/sound_variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:chicken/variant`|prototype:minecraft:blue_egg|通过|通过|通过|通过|3/3|0/0||
|`minecraft:cow/sound_variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:cow/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:fox/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:frog/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:horse/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:llama/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:mooshroom/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:painting/variant`|live_creative_tab:功能方块|通过|通过|通过|通过|3/3|0/0||
|`minecraft:parrot/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:pig/sound_variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:pig/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:rabbit/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:salmon/size`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:sheep/color`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:shulker/color`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:tropical_fish/base_color`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:tropical_fish/pattern`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:tropical_fish/pattern_color`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:villager/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:wolf/collar`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:wolf/sound_variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:wolf/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||
|`minecraft:zombie_nautilus/variant`|runtime_schema_codec_probe|通过|通过|通过|通过|3/3|0/0||

F28：成功 321 / apply 尝试 321（100.00%）；拒绝 0，超时 0。没有发出 apply 的样本失败不计入成功率，请同时看组件覆盖数。

## 世界编辑

|路径|apply|重开相等|类型精确保留|失败原因|
|---|---|---|---|---|
|chest_container|3/3|3/3|3/3|无|
|sign_text|3/3|3/3|3/3|无|
|spawner|3/3|3/3|3/3|无|
|entity_name|3/3|3/3|3/3|无|

发送、服务端、重开 SNBT 与原始逐轮消息见 [components.json](components.json)。补跑会保留被替换回执的来源和旧失败记录，不把旧失败当作最终通过。
