package dev.rinorsi.editor;
/** Audited 26.1.2 Codec fixtures; empty audit values enriched and revalidated at runtime.
 * Source: research/editor/minecraft-editor-baseline/audit/item-components-26.1.2/results.json. */
final class TestKitFixtures {
 static final String JSON = """
[
  {
    "n": 1,
    "title": "钻石剑耐久",
    "base": "minecraft:diamond_sword",
    "keys": [
      "max_damage",
      "damage",
      "unbreakable",
      "repair_cost"
    ],
    "values": {
      "max_damage": 384,
      "damage": 17,
      "unbreakable": {},
      "repair_cost": 3,
      "max_stack_size": 1
    }
  },
  {
    "n": 2,
    "title": "斧头工具属性",
    "base": "minecraft:diamond_axe",
    "keys": [
      "tool",
      "weapon",
      "attribute_modifiers",
      "enchantable"
    ],
    "values": {
      "tool": {
        "rules": [
          {
            "blocks": "#minecraft:incorrect_for_copper_tool",
            "correct_for_drops": false
          },
          {
            "blocks": "#minecraft:mineable/axe",
            "correct_for_drops": true,
            "speed": 5
          }
        ]
      },
      "weapon": {
        "disable_blocking_for_seconds": 4,
        "item_damage_per_attack": 3
      },
      "attribute_modifiers": [
        {
          "type": "minecraft:attack_damage",
          "id": "minecraft:verified",
          "amount": 2,
          "operation": "add_value",
          "slot": "mainhand"
        }
      ],
      "enchantable": {
        "value": 1
      }
    }
  },
  {
    "n": 3,
    "title": "攻击范围动作",
    "base": "minecraft:iron_sword",
    "keys": [
      "attack_range",
      "minimum_attack_charge",
      "swing_animation",
      "damage_type"
    ],
    "values": {
      "attack_range": {
        "hitbox_margin": 0.125,
        "max_creative_reach": 6.5,
        "max_reach": 4.5,
        "min_creative_reach": 2,
        "min_reach": 2,
        "mob_factor": 0.5
      },
      "minimum_attack_charge": 0.4,
      "swing_animation": {
        "duration": 10
      },
      "damage_type": "minecraft:spear"
    }
  },
  {
    "n": 4,
    "title": "格挡与动能",
    "base": "minecraft:iron_sword",
    "keys": [
      "blocks_attacks",
      "kinetic_weapon",
      "piercing_weapon"
    ],
    "values": {
      "blocks_attacks": {
        "block_delay_seconds": 0.25,
        "block_sound": "minecraft:item.shield.block",
        "bypassed_by": "#minecraft:bypasses_shield",
        "disabled_sound": "minecraft:item.shield.break",
        "item_damage": {
          "base": 1,
          "factor": 1,
          "threshold": 3
        }
      },
      "kinetic_weapon": {
        "damage_conditions": {
          "max_duration_ticks": 250,
          "min_relative_speed": 4.6
        },
        "damage_multiplier": 0.82,
        "delay_ticks": 13,
        "dismount_conditions": {
          "max_duration_ticks": 80,
          "min_speed": 12
        },
        "forward_movement": 0.38,
        "hit_sound": "minecraft:item.spear.hit",
        "knockback_conditions": {
          "max_duration_ticks": 165,
          "min_speed": 5.1
        },
        "sound": "minecraft:item.spear.use"
      },
      "piercing_weapon": {
        "hit_sound": "minecraft:item.spear.hit",
        "sound": "minecraft:item.spear.attack"
      }
    }
  },
  {
    "n": 5,
    "title": "染色纹饰装备",
    "base": "minecraft:leather_chestplate",
    "keys": [
      "dyed_color",
      "trim",
      "equippable",
      "glider"
    ],
    "values": {
      "dyed_color": 3394815,
      "trim": {
        "material": "minecraft:quartz",
        "pattern": "minecraft:sentry"
      },
      "equippable": {
        "slot": "chest",
        "equip_sound": "minecraft:item.armor.equip_diamond",
        "asset_id": "minecraft:diamond",
        "allowed_entities": [
          "minecraft:player"
        ]
      },
      "glider": {}
    }
  },
  {
    "n": 6,
    "title": "附魔书",
    "base": "minecraft:enchanted_book",
    "keys": [
      "enchantments",
      "stored_enchantments",
      "enchantment_glint_override",
      "repairable"
    ],
    "values": {
      "enchantments": {
        "minecraft:sharpness": 5
      },
      "stored_enchantments": {
        "minecraft:sharpness": 5
      },
      "enchantment_glint_override": false,
      "repairable": {
        "items": "#minecraft:repairs_chain_armor"
      }
    }
  },
  {
    "n": 7,
    "title": "名称说明稀有度",
    "base": "minecraft:paper",
    "keys": [
      "custom_name",
      "item_name",
      "lore",
      "rarity"
    ],
    "values": {
      "custom_name": {
        "text": "核准示例"
      },
      "item_name": {
        "translate": "item.minecraft.acacia_boat"
      },
      "lore": [
        {
          "text": "第一行测试说明"
        },
        {
          "text": "第二行测试说明",
          "color": "gold"
        }
      ],
      "rarity": "epic"
    }
  },
  {
    "n": 8,
    "title": "模型与提示",
    "base": "minecraft:paper",
    "keys": [
      "custom_model_data",
      "item_model",
      "tooltip_display",
      "tooltip_style"
    ],
    "values": {
      "custom_model_data": {
        "floats": [
          1.25
        ],
        "flags": [
          true
        ],
        "strings": [
          "sample"
        ],
        "colors": [
          3394815
        ]
      },
      "item_model": "minecraft:acacia_boat",
      "tooltip_display": {
        "hidden_components": [
          "minecraft:enchantments"
        ]
      },
      "tooltip_style": "minecraft:stone"
    }
  },
  {
    "n": 9,
    "title": "堆叠与耐性",
    "base": "minecraft:paper",
    "keys": [
      "max_stack_size",
      "break_sound",
      "damage_resistant"
    ],
    "values": {
      "max_stack_size": 16,
      "break_sound": "minecraft:entity.experience_orb.pickup",
      "damage_resistant": {
        "types": "#minecraft:is_fire"
      }
    }
  },
  {
    "n": 10,
    "title": "食用及剩余",
    "base": "minecraft:golden_apple",
    "keys": [
      "food",
      "consumable",
      "use_effects",
      "use_remainder"
    ],
    "values": {
      "food": {
        "nutrition": 6,
        "saturation": 0.8
      },
      "consumable": {
        "consume_seconds": 0.8,
        "animation": "eat",
        "sound": "minecraft:entity.generic.eat"
      },
      "use_effects": {
        "can_sprint": true,
        "interact_vibrations": false,
        "speed_multiplier": 0.5
      },
      "use_remainder": {
        "id": "minecraft:bowl"
      }
    }
  },
  {
    "n": 11,
    "title": "死亡保护",
    "base": "minecraft:totem_of_undying",
    "keys": [
      "death_protection"
    ],
    "values": {
      "death_protection": {
        "death_effects": [
          {
            "type": "minecraft:apply_effects",
            "effects": [
              {
                "id": "minecraft:regeneration",
                "duration": 1200,
                "amplifier": 1
              }
            ]
          }
        ]
      }
    }
  },
  {
    "n": 12,
    "title": "炖菜效果",
    "base": "minecraft:suspicious_stew",
    "keys": [
      "suspicious_stew_effects"
    ],
    "values": {
      "suspicious_stew_effects": [
        {
          "id": "minecraft:night_vision",
          "duration": 240
        }
      ]
    }
  },
  {
    "n": 13,
    "title": "药水",
    "base": "minecraft:potion",
    "keys": [
      "potion_contents",
      "potion_duration_scale",
      "use_cooldown"
    ],
    "values": {
      "potion_contents": {
        "potion": "minecraft:swiftness",
        "custom_color": 3394815,
        "custom_effects": [
          {
            "id": "minecraft:glowing",
            "duration": 600,
            "amplifier": 0
          }
        ]
      },
      "potion_duration_scale": 0.25,
      "use_cooldown": {
        "seconds": 1
      }
    }
  },
  {
    "n": 14,
    "title": "不祥之瓶",
    "base": "minecraft:ominous_bottle",
    "keys": [
      "ominous_bottle_amplifier"
    ],
    "values": {
      "ominous_bottle_amplifier": 3
    }
  },
  {
    "n": 15,
    "title": "弩与投射物",
    "base": "minecraft:crossbow",
    "keys": [
      "charged_projectiles",
      "intangible_projectile"
    ],
    "values": {
      "charged_projectiles": [
        {
          "id": "minecraft:arrow",
          "count": 1
        }
      ],
      "intangible_projectile": {}
    }
  },
  {
    "n": 16,
    "title": "潜影盒内容",
    "base": "minecraft:shulker_box",
    "keys": [
      "container"
    ],
    "values": {
      "container": [
        {
          "slot": 0,
          "item": {
            "id": "minecraft:diamond",
            "count": 1
          }
        }
      ]
    }
  },
  {
    "n": 17,
    "title": "收纳袋内容",
    "base": "minecraft:bundle",
    "keys": [
      "bundle_contents"
    ],
    "values": {
      "bundle_contents": [
        {
          "id": "minecraft:emerald",
          "count": 8
        }
      ]
    }
  },
  {
    "n": 18,
    "title": "箱子数据与锁",
    "base": "minecraft:chest",
    "keys": [
      "block_entity_data",
      "lock",
      "container_loot"
    ],
    "values": {
      "block_entity_data": {
        "id": "minecraft:chest",
        "CustomName": "测试箱"
      },
      "lock": {
        "items": "minecraft:tripwire_hook"
      },
      "container_loot": {
        "loot_table": "minecraft:chests/simple_dungeon",
        "seed": 42
      }
    }
  },
  {
    "n": 19,
    "title": "蜂巢状态",
    "base": "minecraft:beehive",
    "keys": [
      "bees",
      "block_state"
    ],
    "values": {
      "bees": [
        {
          "entity_data": {
            "id": "minecraft:bee"
          },
          "ticks_in_hive": 40,
          "min_ticks_in_hive": 2400
        }
      ],
      "block_state": {
        "honey_level": "3"
      }
    }
  },
  {
    "n": 20,
    "title": "桶内数据",
    "base": "minecraft:tropical_fish_bucket",
    "keys": [
      "bucket_entity_data"
    ],
    "values": {
      "bucket_entity_data": {
        "Health": 6.0,
        "Age": -24000
      }
    }
  },
  {
    "n": 21,
    "title": "实体物品数据",
    "base": "minecraft:armor_stand",
    "keys": [
      "entity_data"
    ],
    "values": {
      "entity_data": {
        "id": "minecraft:allay"
      }
    }
  },
  {
    "n": 22,
    "title": "冒险放置破坏",
    "base": "minecraft:stone",
    "keys": [
      "can_break",
      "can_place_on"
    ],
    "values": {
      "can_break": {
        "blocks": "minecraft:stone"
      },
      "can_place_on": {
        "blocks": "minecraft:dirt"
      }
    }
  },
  {
    "n": 23,
    "title": "调试棒及自定义数据",
    "base": "minecraft:debug_stick",
    "keys": [
      "debug_stick_state",
      "custom_data"
    ],
    "values": {
      "debug_stick_state": {
        "minecraft:oak_log": "axis"
      },
      "custom_data": {
        "note": "原版自定义数据样例",
        "level": 2
      }
    }
  },
  {
    "n": 24,
    "title": "头颅与音符盒音效",
    "base": "minecraft:player_head",
    "keys": [
      "profile",
      "note_block_sound"
    ],
    "values": {
      "profile": {
        "id": [
          1,
          2,
          3,
          4
        ]
      },
      "note_block_sound": "minecraft:block.note_block.bell"
    }
  },
  {
    "n": 25,
    "title": "陶罐装饰",
    "base": "minecraft:decorated_pot",
    "keys": [
      "pot_decorations"
    ],
    "values": {
      "pot_decorations": [
        "minecraft:angler_pottery_sherd",
        "minecraft:archer_pottery_sherd",
        "minecraft:brick",
        "minecraft:prize_pottery_sherd"
      ]
    }
  },
  {
    "n": 26,
    "title": "盾牌旗帜",
    "base": "minecraft:shield",
    "keys": [
      "banner_patterns",
      "base_color",
      "provides_banner_patterns"
    ],
    "values": {
      "banner_patterns": [
        {
          "pattern": "minecraft:stripe_bottom",
          "color": "blue"
        }
      ],
      "base_color": "red",
      "provides_banner_patterns": "#minecraft:pattern_item/bordure_indented"
    }
  },
  {
    "n": 27,
    "title": "纹饰材料",
    "base": "minecraft:amethyst_shard",
    "keys": [
      "provides_trim_material"
    ],
    "values": {
      "provides_trim_material": "minecraft:quartz"
    }
  },
  {
    "n": 28,
    "title": "磁石指南针",
    "base": "minecraft:compass",
    "keys": [
      "lodestone_tracker"
    ],
    "values": {
      "lodestone_tracker": {
        "target": {
          "dimension": "minecraft:overworld",
          "pos": [
            0,
            64,
            0
          ]
        },
        "tracked": false
      }
    }
  },
  {
    "n": 29,
    "title": "地图数据",
    "base": "minecraft:filled_map",
    "keys": [
      "map_id",
      "map_color",
      "map_decorations"
    ],
    "values": {
      "map_id": 42,
      "map_color": 16763904,
      "map_decorations": {
        "sample": {
          "type": "minecraft:red_marker",
          "x": 12.0,
          "z": 24.0,
          "rotation": 90.0
        }
      }
    }
  },
  {
    "n": 30,
    "title": "配方书",
    "base": "minecraft:knowledge_book",
    "keys": [
      "recipes"
    ],
    "values": {
      "recipes": [
        "minecraft:crafting_table"
      ]
    }
  },
  {
    "n": 31,
    "title": "书与笔",
    "base": "minecraft:writable_book",
    "keys": [
      "writable_book_content"
    ],
    "values": {
      "writable_book_content": {
        "pages": [
          "测试第一页",
          {
            "raw": "测试第二页：原文",
            "filtered": "测试第二页：过滤文本"
          }
        ]
      }
    }
  },
  {
    "n": 32,
    "title": "成书",
    "base": "minecraft:written_book",
    "keys": [
      "written_book_content"
    ],
    "values": {
      "written_book_content": {
        "title": "测试成书",
        "author": "物品工坊",
        "pages": [
          {
            "text": "第一章：",
            "color": "#e27845",
            "bold": true,
            "extra": [{"text": "组件往返", "color": "aqua", "italic": true}]
          },
          {
            "raw": {"text": "第二章：保存后重开", "color": "gold"},
            "filtered": {"text": "第二章：过滤文本", "underlined": true}
          }
        ],
        "generation": 1,
        "resolved": true
      }
    }
  },
  {
    "n": 33,
    "title": "烟花火箭",
    "base": "minecraft:firework_rocket",
    "keys": [
      "fireworks"
    ],
    "values": {
      "fireworks": {
        "flight_duration": 2,
        "explosions": [
          {
            "shape": "star",
            "colors": [
              16711680,
              255
            ],
            "has_trail": true
          }
        ]
      }
    }
  },
  {
    "n": 34,
    "title": "烟火之星",
    "base": "minecraft:firework_star",
    "keys": [
      "firework_explosion"
    ],
    "values": {
      "firework_explosion": {
        "shape": "star",
        "colors": [
          16711680,
          255
        ],
        "fade_colors": [
          16777215
        ],
        "has_trail": true,
        "has_twinkle": true
      }
    }
  },
  {
    "n": 35,
    "title": "山羊角",
    "base": "minecraft:goat_horn",
    "keys": [
      "instrument"
    ],
    "values": {
      "instrument": "minecraft:sing_goat_horn"
    }
  },
  {
    "n": 36,
    "title": "唱片",
    "base": "minecraft:music_disc_13",
    "keys": [
      "jukebox_playable"
    ],
    "values": {
      "jukebox_playable": "minecraft:cat"
    }
  },
  {
    "n": 37,
    "title": "染料",
    "base": "minecraft:white_dye",
    "keys": [
      "dye"
    ],
    "values": {
      "dye": "red"
    }
  },
  {
    "n": 38,
    "title": "狼变种",
    "base": "minecraft:paper",
    "keys": [
      "wolf/variant",
      "wolf/sound_variant",
      "wolf/collar"
    ],
    "values": {
      "wolf/variant": "minecraft:ashen",
      "wolf/sound_variant": "minecraft:angry",
      "wolf/collar": "red"
    }
  },
  {
    "n": 39,
    "title": "猫变种",
    "base": "minecraft:paper",
    "keys": [
      "cat/variant",
      "cat/sound_variant",
      "cat/collar"
    ],
    "values": {
      "cat/variant": "minecraft:all_black",
      "cat/sound_variant": "minecraft:classic",
      "cat/collar": "blue"
    }
  },
  {
    "n": 40,
    "title": "猪牛变种",
    "base": "minecraft:paper",
    "keys": [
      "pig/variant",
      "pig/sound_variant",
      "cow/variant",
      "cow/sound_variant"
    ],
    "values": {
      "pig/variant": "minecraft:cold",
      "pig/sound_variant": "minecraft:big",
      "cow/variant": "minecraft:cold",
      "cow/sound_variant": "minecraft:classic"
    }
  },
  {
    "n": 41,
    "title": "鸡蛙蝾螈",
    "base": "minecraft:paper",
    "keys": [
      "chicken/variant",
      "chicken/sound_variant",
      "frog/variant",
      "axolotl/variant"
    ],
    "values": {
      "chicken/variant": "minecraft:cold",
      "chicken/sound_variant": "minecraft:classic",
      "frog/variant": "minecraft:cold",
      "axolotl/variant": "gold"
    }
  },
  {
    "n": 42,
    "title": "马驼蘑菇狐",
    "base": "minecraft:paper",
    "keys": [
      "horse/variant",
      "llama/variant",
      "mooshroom/variant",
      "fox/variant"
    ],
    "values": {
      "horse/variant": "black",
      "llama/variant": "brown",
      "mooshroom/variant": "brown",
      "fox/variant": "snow"
    }
  },
  {
    "n": 43,
    "title": "兔鹦鹉画村民",
    "base": "minecraft:paper",
    "keys": [
      "rabbit/variant",
      "parrot/variant",
      "painting/variant",
      "villager/variant"
    ],
    "values": {
      "rabbit/variant": "gold",
      "parrot/variant": "blue",
      "painting/variant": "minecraft:alban",
      "villager/variant": "minecraft:desert"
    }
  },
  {
    "n": 44,
    "title": "热带鱼与鲑鱼",
    "base": "minecraft:paper",
    "keys": [
      "tropical_fish/base_color",
      "tropical_fish/pattern",
      "tropical_fish/pattern_color",
      "salmon/size"
    ],
    "values": {
      "tropical_fish/base_color": "orange",
      "tropical_fish/pattern": "clayfish",
      "tropical_fish/pattern_color": "blue",
      "salmon/size": "large"
    }
  },
  {
    "n": 45,
    "title": "羊潜影鹦鹉螺",
    "base": "minecraft:paper",
    "keys": [
      "sheep/color",
      "shulker/color",
      "zombie_nautilus/variant"
    ],
    "values": {
      "sheep/color": "lime",
      "shulker/color": "purple",
      "zombie_nautilus/variant": "minecraft:temperate"
    }
  }
]
 """;
 static final String EXPECTED = """
["custom_model_data", "custom_name", "dyed_color", "enchantment_glint_override", "item_model", "item_name", "lore", "rarity", "tooltip_display", "tooltip_style", "break_sound", "damage", "damage_resistant", "max_damage", "max_stack_size", "repair_cost", "repairable", "unbreakable", "attack_range", "attribute_modifiers", "blocks_attacks", "damage_type", "kinetic_weapon", "minimum_attack_charge", "piercing_weapon", "swing_animation", "tool", "weapon", "enchantable", "enchantments", "stored_enchantments", "consumable", "death_protection", "food", "intangible_projectile", "ominous_bottle_amplifier", "suspicious_stew_effects", "use_cooldown", "use_effects", "use_remainder", "banner_patterns", "base_color", "equippable", "glider", "provides_banner_patterns", "provides_trim_material", "trim", "bees", "block_entity_data", "block_state", "bucket_entity_data", "bundle_contents", "can_break", "can_place_on", "charged_projectiles", "container", "container_loot", "custom_data", "debug_stick_state", "entity_data", "lock", "pot_decorations", "profile", "lodestone_tracker", "map_color", "map_decorations", "map_id", "recipes", "writable_book_content", "written_book_content", "dye", "firework_explosion", "fireworks", "instrument", "jukebox_playable", "note_block_sound", "potion_contents", "potion_duration_scale", "axolotl/variant", "cat/collar", "cat/sound_variant", "cat/variant", "chicken/sound_variant", "chicken/variant", "cow/sound_variant", "cow/variant", "fox/variant", "frog/variant", "horse/variant", "llama/variant", "mooshroom/variant", "painting/variant", "parrot/variant", "pig/sound_variant", "pig/variant", "rabbit/variant", "salmon/size", "sheep/color", "shulker/color", "tropical_fish/base_color", "tropical_fish/pattern", "tropical_fish/pattern_color", "villager/variant", "wolf/collar", "wolf/sound_variant", "wolf/variant", "zombie_nautilus/variant"]
 """;
 private TestKitFixtures() {}
}
