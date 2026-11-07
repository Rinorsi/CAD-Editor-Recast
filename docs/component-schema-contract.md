# Component schema · Minecraft 26.1.2

本合同只证明真实 Codec 的字段结构与独立 JVM 校验。没有完成前端消费、联网权限、真实客户端保存重开或玩法验收；不勾选发布门槛。

## 请求与回复

```js
oriel.send('registry', {name:'component_schema', id:'minecraft:max_stack_size'});
oriel.send('registry', {name:'component_schema'}); // 全部有持久 Codec 的组件，不限测试范围
oriel.send('registry', {name:'component_schema:minecraft:food'});
oriel.send('component_validate', {requestId:'food-1', component:'minecraft:food', value:{nutrition:-1,saturation:'invalid'}});
```

前两种请求的顶层 key 是字面量 `registry.component_schema`，带 id 时信封同时带 `id`。冒号形式写入字面量 `registry.component_schema:minecraft:food`。不要按点号拆 key。回复沿用 `RegistryPages`：`version:1,generation,name,offset,total,entries,done`；整页最多24000字符，不截断单行。按generation丢弃旧页，按offset合并entries，done才表示完成。请求JSON最多8192字符，name最多247字符。

新增 `component_validate.result` 保留旧 `validate_component.result` 的全部成功/失败字段；旧消息没有改动。输入使用 component、value，或 snbt 字符串 / format:'snbt'，可选requestId原样回传。成功含ok:true、format、normalized、snbt、json、errors:[]、path_precision:'none'。失败含ok:false、error及errors:[{path,code,message}]。path为 `$`、`$.field`、`$[2].field`、或 `$["minecraft:id"]`；最多16条，每条message最多700字符，发生截断带errors_truncated:true。不能精确定位的错误保留在组件根 `$`，不会从英文错误文本猜路径。SNBT解析或语义失败目前只保证组件级定位。最终保存继续走完整Codec、会话与权限校验。

每个Document每秒最多20次component_validate，输入8192字符，结果24000字符。无世界、超频或超大小返回ok:false/error；code目前统一request_limit，不能仅凭code区分离开世界和限额。serverSession或非对象消息忽略，与旧本地校验一致。

## 来源、字段树和未知值

生产源是当前世界DataComponentType.codec()，不是本JSON快照。采用有界的真实DFU结构适配器，而非按组件ID手写字段表：读取ListCodec、EitherCodec、UnboundedMapCodec、MapCodec/RecordCodecBuilder和OptionalFieldCodec的实际组合；对optional字段以其MapDecoder解码空map，再用实际子Codec编码来获取默认值；枚举取运行期StringRepresentable枚举实例，再用真实Codec验证序列化名；holder和tag取Codec持有的registry key。

数值上下界只在捕获到官方Codec/ExtraCodecs校验器中的两个数字，且端点/相邻边界解码验证成功时导出。字符串长度同样须捕获并核验端点。另做-1/0/1/32768/2147483647/1e30、空/32768字符字符串、空/非空列表、空对象观察。探针只是样本，不能由样本通过推定所有值合法。严格正数但未提取到上下界等情况标unknown:true。

结构深度12、节点160、对象图256的预算；反射不可访问、递归、dispatch、inline holder、outer flatMap/跨字段约束不伪造字段，标unknown:true及reason。导出type可能为int/long/float/double/bool/string/enum/registry/tag/component(text)/list/map/object/union；path、optional必带。fields为object子字段，element为list/map子值，key为map键，alternatives为union分支。min/max只表示已证明的数值界；min_size/max_size是列表长度，min_length/max_length是字符串长度。没有界不代表无限；须看unknown/reason。

`default`仅为该optionalField解码空map得到的真实默认值；`default_absent:true`表示缺省无值。`prototype_examples`是按物品ID排序后从所有实际Item.components()观察到的最多3个不同值；`prototype_item_count`统计带该组件的物品，`prototype_examples_complete`表示是否完整列出不同值。这不是通用组件默认值，例子为空不能自己补默认。

coverage=full只表示导出的字段结构中没有已知unknown节点，不表示穷尽Codec语义或玩法；partial表示部分节点未知；unknown表示根结构本身无法导出。unknown_paths可能重复（union的不同分支）。UI应保留高级JSON/SNBT和手动ID输入。

## 执行、远程与失败

在客户端主线程每tick处理一个未缓存组件，最多排队8个任务；一次bulk要跨多个tick，完成后再按页投递。缓存按世界对象及registry generation失效；离开世界清缓存及待办，不保证发出已排队请求的取消回执。请求繁忙、未知ID、无持久Codec、单行过大、无世界返回空entries页加error。

当前为**本地只读派生**，未实现向远程服务端RPC；在普通远程服使用客户端已同步的registry access。availability:'complete'表示已完成请求组件的推导，并不表示每个字段都已知或服务端资源已同步。此通道目前不会发送availability:'unavailable'；未同步/不可解析的服务端约束只能标unknown或Codec错误，不能把本地结果宣称为远程服务端授权。

## 实际捕获的字段树

以下直接摘自独立JVM真实26.1.2注册表运行生成的 `component-schema-26.1.2.json`，不是手写示例。只摘id/coverage/fields；完整探针和物品原型见快照。

### max_stack_size

```json
{
  "id": "minecraft:max_stack_size",
  "coverage": "full",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "int",
      "probes": [
        {
          "value": -1,
          "ok": false
        },
        {
          "value": 0,
          "ok": false
        },
        {
          "value": 1,
          "ok": true
        },
        {
          "value": 32768,
          "ok": false
        },
        {
          "value": 2147483647,
          "ok": false
        },
        {
          "value": 1e+30,
          "ok": false
        }
      ],
      "min": 1,
      "max": 99,
      "constraint_source": "captured_numeric_validator_and_boundary_decode",
      "fractional_json_accepted": true
    }
  ]
}
```

### enchantments

```json
{
  "id": "minecraft:enchantments",
  "coverage": "partial",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "map",
      "unknown": true,
      "reason": "outer_mapping_or_cross_field_constraint",
      "element": {
        "path": "${value}",
        "optional": false,
        "type": "int",
        "probes": [
          {
            "value": -1,
            "ok": false
          },
          {
            "value": 0,
            "ok": false
          },
          {
            "value": 1,
            "ok": true
          },
          {
            "value": 32768,
            "ok": false
          },
          {
            "value": 2147483647,
            "ok": false
          },
          {
            "value": 1e+30,
            "ok": false
          }
        ],
        "min": 1,
        "max": 255,
        "constraint_source": "captured_numeric_validator_and_boundary_decode",
        "fractional_json_accepted": true
      },
      "key": {
        "path": "${key}",
        "optional": false,
        "type": "registry",
        "registry": "minecraft:enchantment"
      }
    }
  ]
}
```

### attribute_modifiers

```json
{
  "id": "minecraft:attribute_modifiers",
  "coverage": "partial",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "list",
      "min_size": 0,
      "max_size": 2147483647,
      "element": {
        "path": "$[]",
        "optional": false,
        "type": "object",
        "fields": [
          {
            "path": "$[].type",
            "optional": false,
            "type": "registry",
            "registry": "minecraft:attribute",
            "unknown": true,
            "reason": "registry_reference_constraints_checked_by_codec",
            "name": "type"
          },
          {
            "path": "$[].id",
            "optional": false,
            "type": "string",
            "length_probes": [
              {
                "length": 0,
                "ok": true
              },
              {
                "length": 1,
                "ok": true
              },
              {
                "length": 32768,
                "ok": true
              }
            ],
            "unknown": true,
            "reason": "string_mapping_constraints_not_exported",
            "name": "id"
          },
          {
            "path": "$[].amount",
            "optional": false,
            "type": "double",
            "probes": [
              {
                "value": -1,
                "ok": true
              },
              {
                "value": 0,
                "ok": true
              },
              {
                "value": 1,
                "ok": true
              },
              {
                "value": 32768,
                "ok": true
              },
              {
                "value": 2147483647,
                "ok": true
              },
              {
                "value": 1e+30,
                "ok": true
              }
            ],
            "constraint_source": "primitive_codec_no_explicit_range",
            "name": "amount"
          },
          {
            "path": "$[].operation",
            "optional": false,
            "type": "enum",
            "values": [
              "add_multiplied_base",
              "add_multiplied_total",
              "add_value"
            ],
            "name": "operation"
          },
          {
            "path": "$[].slot",
            "optional": true,
            "type": "enum",
            "values": [
              "any",
              "armor",
              "body",
              "chest",
              "feet",
              "hand",
              "head",
              "legs",
              "mainhand",
              "offhand",
              "saddle"
            ],
            "name": "slot",
            "default": "any",
            "default_source": "optional_field_decode_empty_map"
          },
          {
            "path": "$[].display",
            "optional": true,
            "type": "object",
            "unknown": true,
            "reason": "unresolved_map_keys_or_dispatch",
            "name": "display",
            "default": {
              "type": "default"
            },
            "default_source": "optional_field_decode_empty_map",
            "fields": [
              {
                "path": "$[].display.type",
                "optional": false,
                "type": "enum",
                "values": [
                  "default",
                  "hidden",
                  "override"
                ],
                "name": "type"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### food

```json
{
  "id": "minecraft:food",
  "coverage": "full",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "object",
      "fields": [
        {
          "path": "$.nutrition",
          "optional": false,
          "type": "int",
          "probes": [
            {
              "value": -1,
              "ok": false
            },
            {
              "value": 0,
              "ok": true
            },
            {
              "value": 1,
              "ok": true
            },
            {
              "value": 32768,
              "ok": true
            },
            {
              "value": 2147483647,
              "ok": true
            },
            {
              "value": 1e+30,
              "ok": true
            }
          ],
          "min": 0,
          "max": 2147483647,
          "constraint_source": "captured_numeric_validator_and_boundary_decode",
          "fractional_json_accepted": true,
          "name": "nutrition"
        },
        {
          "path": "$.saturation",
          "optional": false,
          "type": "float",
          "probes": [
            {
              "value": -1,
              "ok": true
            },
            {
              "value": 0,
              "ok": true
            },
            {
              "value": 1,
              "ok": true
            },
            {
              "value": 32768,
              "ok": true
            },
            {
              "value": 2147483647,
              "ok": true
            },
            {
              "value": 1e+30,
              "ok": true
            }
          ],
          "constraint_source": "primitive_codec_no_explicit_range",
          "name": "saturation"
        },
        {
          "path": "$.can_always_eat",
          "optional": true,
          "type": "bool",
          "name": "can_always_eat",
          "default": false,
          "default_source": "optional_field_decode_empty_map"
        }
      ]
    }
  ]
}
```

### equippable

```json
{
  "id": "minecraft:equippable",
  "coverage": "partial",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "object",
      "fields": [
        {
          "path": "$.slot",
          "optional": false,
          "type": "enum",
          "values": [
            "body",
            "chest",
            "feet",
            "head",
            "legs",
            "mainhand",
            "offhand",
            "saddle"
          ],
          "name": "slot"
        },
        {
          "path": "$.equip_sound",
          "optional": true,
          "type": "registry",
          "registry": "minecraft:sound_event",
          "unknown": true,
          "reason": "inline_holder_form_not_exported",
          "name": "equip_sound",
          "default": "minecraft:item.armor.equip_generic",
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.asset_id",
          "optional": true,
          "type": "registry",
          "registry": "minecraft:equipment_asset",
          "unknown": true,
          "reason": "optional_default_not_resolved",
          "name": "asset_id"
        },
        {
          "path": "$.camera_overlay",
          "optional": true,
          "type": "string",
          "length_probes": [
            {
              "length": 0,
              "ok": true
            },
            {
              "length": 1,
              "ok": true
            },
            {
              "length": 32768,
              "ok": true
            }
          ],
          "unknown": true,
          "reason": "optional_default_not_resolved",
          "name": "camera_overlay"
        },
        {
          "path": "$.allowed_entities",
          "optional": true,
          "type": "union",
          "registry": "minecraft:entity_type",
          "unknown": true,
          "reason": "optional_default_not_resolved",
          "name": "allowed_entities",
          "alternatives": [
            {
              "path": "$.allowed_entities",
              "optional": false,
              "type": "union",
              "alternatives": [
                {
                  "path": "$.allowed_entities",
                  "optional": false,
                  "type": "tag",
                  "registry": "minecraft:entity_type",
                  "prefix": "#",
                  "unknown": true,
                  "reason": "registry_reference_constraints_checked_by_codec"
                },
                {
                  "path": "$.allowed_entities",
                  "optional": false,
                  "type": "union",
                  "unknown": true,
                  "reason": "outer_mapping_or_cross_field_constraint",
                  "alternatives": [
                    {
                      "path": "$.allowed_entities",
                      "optional": false,
                      "type": "list",
                      "min_size": 0,
                      "max_size": 2147483647,
                      "unknown": true,
                      "reason": "outer_mapping_or_cross_field_constraint",
                      "element": {
                        "path": "$.allowed_entities[]",
                        "optional": false,
                        "type": "registry",
                        "registry": "minecraft:entity_type"
                      }
                    },
                    {
                      "path": "$.allowed_entities",
                      "optional": false,
                      "type": "registry",
                      "registry": "minecraft:entity_type"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "path": "$.dispensable",
          "optional": true,
          "type": "bool",
          "name": "dispensable",
          "default": true,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.swappable",
          "optional": true,
          "type": "bool",
          "name": "swappable",
          "default": true,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.damage_on_hurt",
          "optional": true,
          "type": "bool",
          "name": "damage_on_hurt",
          "default": true,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.equip_on_interact",
          "optional": true,
          "type": "bool",
          "name": "equip_on_interact",
          "default": false,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.can_be_sheared",
          "optional": true,
          "type": "bool",
          "name": "can_be_sheared",
          "default": false,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.shearing_sound",
          "optional": true,
          "type": "registry",
          "registry": "minecraft:sound_event",
          "unknown": true,
          "reason": "inline_holder_form_not_exported",
          "name": "shearing_sound",
          "default": "minecraft:item.shears.snip",
          "default_source": "optional_field_decode_empty_map"
        }
      ]
    }
  ]
}
```

### tool

```json
{
  "id": "minecraft:tool",
  "coverage": "partial",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "object",
      "fields": [
        {
          "path": "$.rules",
          "optional": false,
          "type": "list",
          "min_size": 0,
          "max_size": 2147483647,
          "name": "rules",
          "element": {
            "path": "$.rules[]",
            "optional": false,
            "type": "object",
            "fields": [
              {
                "path": "$.rules[].blocks",
                "optional": false,
                "type": "union",
                "registry": "minecraft:block",
                "unknown": true,
                "reason": "holder_set_lookup_and_homogeneous_list_constraints",
                "name": "blocks",
                "alternatives": [
                  {
                    "path": "$.rules[].blocks",
                    "optional": false,
                    "type": "union",
                    "alternatives": [
                      {
                        "path": "$.rules[].blocks",
                        "optional": false,
                        "type": "tag",
                        "registry": "minecraft:block",
                        "prefix": "#",
                        "unknown": true,
                        "reason": "registry_reference_constraints_checked_by_codec"
                      },
                      {
                        "path": "$.rules[].blocks",
                        "optional": false,
                        "type": "union",
                        "unknown": true,
                        "reason": "outer_mapping_or_cross_field_constraint",
                        "alternatives": [
                          {
                            "path": "$.rules[].blocks",
                            "optional": false,
                            "type": "list",
                            "min_size": 0,
                            "max_size": 2147483647,
                            "unknown": true,
                            "reason": "outer_mapping_or_cross_field_constraint",
                            "element": {
                              "path": "$.rules[].blocks[]",
                              "optional": false,
                              "type": "registry",
                              "registry": "minecraft:block"
                            }
                          },
                          {
                            "path": "$.rules[].blocks",
                            "optional": false,
                            "type": "registry",
                            "registry": "minecraft:block"
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "path": "$.rules[].speed",
                "optional": true,
                "type": "float",
                "probes": [
                  {
                    "value": -1,
                    "ok": false
                  },
                  {
                    "value": 0,
                    "ok": false
                  },
                  {
                    "value": 1,
                    "ok": true
                  },
                  {
                    "value": 32768,
                    "ok": true
                  },
                  {
                    "value": 2147483647,
                    "ok": true
                  },
                  {
                    "value": 1e+30,
                    "ok": true
                  }
                ],
                "unknown": true,
                "reason": "optional_default_not_resolved",
                "name": "speed"
              },
              {
                "path": "$.rules[].correct_for_drops",
                "optional": true,
                "type": "bool",
                "name": "correct_for_drops",
                "unknown": true,
                "reason": "optional_default_not_resolved"
              }
            ]
          }
        },
        {
          "path": "$.default_mining_speed",
          "optional": true,
          "type": "float",
          "probes": [
            {
              "value": -1,
              "ok": true
            },
            {
              "value": 0,
              "ok": true
            },
            {
              "value": 1,
              "ok": true
            },
            {
              "value": 32768,
              "ok": true
            },
            {
              "value": 2147483647,
              "ok": true
            },
            {
              "value": 1e+30,
              "ok": true
            }
          ],
          "constraint_source": "primitive_codec_no_explicit_range",
          "name": "default_mining_speed",
          "default": 1.0,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.damage_per_block",
          "optional": true,
          "type": "int",
          "probes": [
            {
              "value": -1,
              "ok": false
            },
            {
              "value": 0,
              "ok": true
            },
            {
              "value": 1,
              "ok": true
            },
            {
              "value": 32768,
              "ok": true
            },
            {
              "value": 2147483647,
              "ok": true
            },
            {
              "value": 1e+30,
              "ok": true
            }
          ],
          "min": 0,
          "max": 2147483647,
          "constraint_source": "captured_numeric_validator_and_boundary_decode",
          "fractional_json_accepted": true,
          "name": "damage_per_block",
          "default": 1,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.can_destroy_blocks_in_creative",
          "optional": true,
          "type": "bool",
          "name": "can_destroy_blocks_in_creative",
          "default": true,
          "default_source": "optional_field_decode_empty_map"
        }
      ]
    }
  ]
}
```

### container_loot

```json
{
  "id": "minecraft:container_loot",
  "coverage": "partial",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "object",
      "fields": [
        {
          "path": "$.loot_table",
          "optional": false,
          "type": "registry",
          "registry": "minecraft:loot_table",
          "unknown": true,
          "reason": "registry_reference_constraints_checked_by_codec",
          "name": "loot_table"
        },
        {
          "path": "$.seed",
          "optional": true,
          "type": "long",
          "probes": [
            {
              "value": -1,
              "ok": true
            },
            {
              "value": 0,
              "ok": true
            },
            {
              "value": 1,
              "ok": true
            },
            {
              "value": 32768,
              "ok": true
            },
            {
              "value": 2147483647,
              "ok": true
            },
            {
              "value": 1e+30,
              "ok": true
            }
          ],
          "constraint_source": "primitive_codec_no_explicit_range",
          "fractional_json_accepted": true,
          "name": "seed",
          "default": 0,
          "default_source": "optional_field_decode_empty_map"
        }
      ]
    }
  ]
}
```

### written_book_content

```json
{
  "id": "minecraft:written_book_content",
  "coverage": "partial",
  "fields": [
    {
      "path": "$",
      "optional": false,
      "type": "object",
      "fields": [
        {
          "path": "$.title",
          "optional": false,
          "type": "union",
          "name": "title",
          "alternatives": [
            {
              "path": "$.title",
              "optional": false,
              "type": "object",
              "fields": [
                {
                  "path": "$.title.raw",
                  "optional": false,
                  "type": "string",
                  "length_probes": [
                    {
                      "length": 0,
                      "ok": true
                    },
                    {
                      "length": 1,
                      "ok": true
                    },
                    {
                      "length": 32768,
                      "ok": false
                    }
                  ],
                  "min_length": 0,
                  "max_length": 32,
                  "constraint_source": "captured_string_length_validator_and_boundary_decode",
                  "name": "raw"
                },
                {
                  "path": "$.title.filtered",
                  "optional": true,
                  "type": "string",
                  "length_probes": [
                    {
                      "length": 0,
                      "ok": true
                    },
                    {
                      "length": 1,
                      "ok": true
                    },
                    {
                      "length": 32768,
                      "ok": false
                    }
                  ],
                  "min_length": 0,
                  "max_length": 32,
                  "constraint_source": "captured_string_length_validator_and_boundary_decode",
                  "name": "filtered",
                  "unknown": true,
                  "reason": "optional_default_not_resolved"
                }
              ]
            },
            {
              "path": "$.title",
              "optional": false,
              "type": "string",
              "length_probes": [
                {
                  "length": 0,
                  "ok": true
                },
                {
                  "length": 1,
                  "ok": true
                },
                {
                  "length": 32768,
                  "ok": false
                }
              ],
              "min_length": 0,
              "max_length": 32,
              "constraint_source": "captured_string_length_validator_and_boundary_decode"
            }
          ]
        },
        {
          "path": "$.author",
          "optional": false,
          "type": "string",
          "name": "author"
        },
        {
          "path": "$.generation",
          "optional": true,
          "type": "int",
          "probes": [
            {
              "value": -1,
              "ok": false
            },
            {
              "value": 0,
              "ok": true
            },
            {
              "value": 1,
              "ok": true
            },
            {
              "value": 32768,
              "ok": false
            },
            {
              "value": 2147483647,
              "ok": false
            },
            {
              "value": 1e+30,
              "ok": false
            }
          ],
          "min": 0,
          "max": 3,
          "constraint_source": "captured_numeric_validator_and_boundary_decode",
          "fractional_json_accepted": true,
          "name": "generation",
          "default": 0,
          "default_source": "optional_field_decode_empty_map"
        },
        {
          "path": "$.pages",
          "optional": true,
          "type": "list",
          "min_size": 0,
          "max_size": 2147483647,
          "name": "pages",
          "default": [],
          "default_source": "optional_field_decode_empty_map",
          "element": {
            "path": "$.pages[]",
            "optional": false,
            "type": "component(text)",
            "unknown": true,
            "reason": "recursive_text_dispatch_requires_component_codec"
          }
        },
        {
          "path": "$.resolved",
          "optional": true,
          "type": "bool",
          "name": "resolved",
          "default": false,
          "default_source": "optional_field_decode_empty_map"
        }
      ]
    }
  ]
}
```

## 实际字段校验回执

```json
{
  "requestId": "schema-path-test",
  "component": "minecraft:food",
  "ok": false,
  "error": "Not a number: \"invalid\"; Value must be non-negative: -1",
  "errors": [
    {
      "path": "$.nutrition",
      "code": "codec",
      "message": "Value must be non-negative: -1"
    },
    {
      "path": "$.saturation",
      "code": "codec",
      "message": "Not a number: \"invalid\""
    }
  ],
  "path_precision": "field"
}
```

## 覆盖清单

| 组件 | 结构覆盖 | unknown路径（去重） |
|---|---|---|
| minecraft:attribute_modifiers | partial | $[].type, $[].id, $[].display |
| minecraft:banner_patterns | partial | $[].pattern |
| minecraft:base_color | full | — |
| minecraft:block_entity_data | unknown | $ |
| minecraft:blocks_attacks | partial | $.damage_reductions[].horizontal_blocking_angle, $.damage_reductions[].type, $.bypassed_by, $.block_sound, $.disabled_sound |
| minecraft:bucket_entity_data | partial | $ |
| minecraft:bundle_contents | partial | $[], $[].id, $[].components |
| minecraft:can_break | partial | $, $[].blocks, $[].state{value}, $[].nbt, $[].components, $.blocks, $.state{value}, $.nbt, $.components |
| minecraft:can_place_on | partial | $, $[].blocks, $[].state{value}, $[].nbt, $[].components, $.blocks, $.state{value}, $.nbt, $.components |
| minecraft:consumable | partial | $.sound, $.on_consume_effects[], $.on_consume_effects[].type |
| minecraft:container | partial | $[].item, $[].item.id, $[].item.components |
| minecraft:container_loot | partial | $.loot_table |
| minecraft:custom_data | partial | $ |
| minecraft:custom_model_data | partial | $.colors[] |
| minecraft:custom_name | unknown | $ |
| minecraft:damage | full | — |
| minecraft:damage_resistant | partial | $.types |
| minecraft:death_protection | partial | $.death_effects[], $.death_effects[].type |
| minecraft:dyed_color | partial | $ |
| minecraft:enchantable | full | — |
| minecraft:enchantment_glint_override | full | — |
| minecraft:enchantments | partial | $ |
| minecraft:entity_data | unknown | $ |
| minecraft:equippable | partial | $.equip_sound, $.asset_id, $.camera_overlay, $.allowed_entities, $.shearing_sound |
| minecraft:firework_explosion | full | — |
| minecraft:fireworks | partial | $.flight_duration |
| minecraft:food | full | — |
| minecraft:glider | unknown | $ |
| minecraft:instrument | unknown | $ |
| minecraft:item_model | unknown | $ |
| minecraft:item_name | unknown | $ |
| minecraft:jukebox_playable | full | — |
| minecraft:lodestone_tracker | partial | $.target.dimension, $.target.pos |
| minecraft:lore | unknown | $ |
| minecraft:map_color | unknown | $ |
| minecraft:map_decorations | partial | ${value}.type |
| minecraft:map_id | unknown | $ |
| minecraft:max_damage | full | — |
| minecraft:max_stack_size | full | — |
| minecraft:potion_contents | partial | $.potion, $.custom_effects[], $.custom_effects[].id, $ |
| minecraft:profile | partial | $, $.id, $.properties, $.properties[].signature, $.texture, $.cape, $.elytra |
| minecraft:rarity | full | — |
| minecraft:repair_cost | full | — |
| minecraft:repairable | partial | $.items |
| minecraft:stored_enchantments | partial | $ |
| minecraft:suspicious_stew_effects | partial | $[].id |
| minecraft:tool | partial | $.rules[].blocks, $.rules[].speed, $.rules[].correct_for_drops |
| minecraft:tooltip_display | partial | $.hidden_components[] |
| minecraft:tooltip_style | unknown | $ |
| minecraft:trim | partial | $.material, $.pattern |
| minecraft:unbreakable | unknown | $ |
| minecraft:use_cooldown | partial | $.seconds, $.cooldown_group |
| minecraft:use_remainder | partial | $.id, $.components, $ |
| minecraft:weapon | full | — |
| minecraft:writable_book_content | partial | $.pages[].filtered |
| minecraft:written_book_content | partial | $.title.filtered, $.pages[] |

## 与当前手写约束的实测差异

| 字段 | 前端表/校验 | 真实Codec探针 |
|---|---|---|
| minecraft:tool $.rules[0].speed | data.js numeric schema has no min; core.validateValue allows 0 | 拒绝：Value must be positive: 0.0 |
| minecraft:use_cooldown $.seconds | data.js numeric schema has no min; core.validateValue allows 0 | 拒绝：Value must be positive: 0.0 |
| minecraft:written_book_content $.title | data.js title string has no max length; core.validateValue allows 33 chars | 拒绝：Failed to parse either. First: Not a JSON object: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; Second: String "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" is too long: 33, expected range [0-32] |
| minecraft:max_stack_size $ | core.validateValue rejects fractional values for t:int | 接受，规范化为 1 |
| minecraft:fireworks $.flight_duration | data.js int min:0/max:255; core rejects 256 | 接受，规范化为 {} |
| minecraft:container $ | data.js list max:256; core rejects 257 entries (including duplicate slots) | 拒绝：List is too long: 257, expected range [0-256] |

container的257项上限与前端一致，保留为对照项，不能报告成差异。fireworks.flight_duration是BYTE Codec，256被数值缩窄为0并按默认值省略；这不是建议UI放宽到任意数字。JsonOps的整数小数截断同理，服务端最终Codec仍是权威。严格正数、字符串长度、列表界限的测试值记录在logs/backend-g/schema-path-errors.json。

## 测试与快照漂移

`powershell -File tools/registry/component-schema-test.ps1` 使用已导出的runtime-classpath.json运行javac和独立JVM，不启动Gradle/游戏。真实VanillaRegistries.createLookup()含动态注册表，并初始化物品默认组件。测试覆盖56组件、真实物品原型解码、Codec边界、optional默认值、逐字段/嵌套列表路径、旧回执兼容、SNBT降级，以及整份实时推导对快照的漂移比较。

快照更新须显式加 `-UpdateSnapshot`，审核差异后纳入版本控制；测试不读取快照作为生产数据。对比先序列化再解析实际JSON，避免Gson内存Float和解析后小数表示造成虚假漂移；真正差异输出logs/backend-g/schema-drift-actual.json。快照只覆盖固定56组件，bulk生产接口仍覆盖所有持久Codec。

运行中的Minecraft/runClient保留，本轮不执行Gradle、不重启游戏。真实客户端页面收发/保存和专服验证待做。


## 2026-11-07 最终构建补验

此前的“未跑 Gradle / 等用户关游戏”记录是历史状态。最终门禁已将 componentSchemaTest、entitySchemaTest/entitySchemaServerTest、tooltipTest、worldEditTest 接入正式 check，并运行完整 build。完整输出在 logs/final-gate/gradle-build.log；5个 node UI 测试分别在 node-{world,contract,compact,nbt,search}.log。无关的 Oriel-UI 实例不阻塞 Editor，也不修改或终止它们。真实客户端通道补验使用 tools/final-gate/launch.ps1，新复制世界、正常 runClient、实际猫刷怪蛋页面；最新状态以 logs/final-gate/client-receipt.json 为准。该探针仅证明本机真实页面的 schema/tooltip 请求链，不能代替远程服、多人冲突或完整世界目标 apply 验收。
