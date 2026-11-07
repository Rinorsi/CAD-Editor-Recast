# 实机注册表性能

范围：隐藏客户端、打包的真实页面、真实 search 消息；客户端 tick 和 eval 轮询包含在延迟内。冷页面是本进程首次打开；暖页面是同进程后续打开，不代表操作系统磁盘冷缓存。首次查询该目录之前，页面可能已启动索引预热，因此冷查询不是强制清空缓存的索引构建基准。

首个可交互页面：3044.85 ms；暖页面 p50/p95：1007.07/1159.76 ms。

实时索引尺寸：`{"minecraft:item": 1506, "minecraft:enchantment": 43, "minecraft:mob_effect": 40, "minecraft:attribute": 35, "minecraft:sound_event": 1902, "minecraft:potion": 46, "minecraft:instrument": 8, "minecraft:jukebox_song": 21, "minecraft:banner_pattern": 43, "minecraft:trim_material": 11, "minecraft:trim_pattern": 18, "minecraft:painting_variant": 51, "minecraft:damage_type": 50, "minecraft:entity_type": 157, "minecraft:data_component_type": 110, "minecraft:block": 1168, "item_model": -1, "camera_overlay": -1, "profile_texture": -1, "profile_cape": -1, "profile_elytra": -1, "minecraft:loot_table": -1, "minecraft:recipe": -1}`

|目录|冷首次返回 ms|暖搜索 p50 ms|暖搜索 p95 ms|暖样本数|
|---|---|---|---|---|
|items|57.79|101.54|113.86|31|
|blocks|93.87|100.38|116.11|31|
