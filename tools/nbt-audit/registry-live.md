# 实时注册表实机增量

当前状态：工具准备；新候选尚未实跑。NBT 9B 历史结果保持独立，不作为实时注册表结果。

1. prepare-registry-pack.ps1 -Evidence <新目录> 从实际 26.1.2 Minecraft jar 提取 sharpness 定义和数据包格式，仅覆盖最高等级到 9；另创建真实 nbt_audit:sharpness_nine 数据包命名空间条目。保留源定义、来源 SHA256 和包内文件 SHA256。
2. 最终 artifact/hash 到达后，执行 run-registry.ps1 -Evidence <全新目录> -EditorJar <正式冻结路径> -ExpectedEditorSha256 <核定hash> -RuntimeClasspath <同包classpath> -ProbeJar <本批probe> -RegistryPack <准备目录/nbt-registry-live>。这是独立单人集成服，继承隐藏/无焦点/禁捕鼠/owner/25782空闲和退出清理门禁，不操作别的实例。
3. 服务端真实加载数据包后，只读遍历动态附魔注册表确认最高 9。真实“升到自然最高”按钮修改，实际应用、单次 requestId 对应 saved、服务端物品 SNBT 和关闭重开一致。
4. 测试探针在 DocumentDriver.patchJson 入口排队、原样释放真实 RegistryBridge 消息，保留完整原始 JSON；不生成事实、不改注册表或缓存。实际公共资源重载会重建 Document，队列保存在独立探针中，向当前真实 Document 释放。分别保留 meta、catalog/default/schema、relation，验证手动 ID、未知最高操作不改值、默认仍 pending，真实事实到达恢复，再保存服务端确认。早期页面内 Reg.ingest 队列随重载丢失的工具 FAIL 已保留。
5. 第二次真实重载后，仅释放新 meta，重放之前记录的原始旧 meta/default/enchant/schema；在新缓存仍空时断言无污染，再释放当前 epoch 实际事实并恢复。记录每个旧消息和 generation。
6. 同一第三场景纳入正式 entity_info/entity_schema（普通请求及 cat suffix）、entity_base_attributes/equipment_slot_groups/spawner_info。真实请求 bee/cat 模板、Health schema，并自然请求不存在的实体产生错误回包；每条成功/错误必须由生产端提供当前 worldGeneration，同时原 entity-N/entity-schema-N 保持独立。旧消息重放不能填新 eschema/einfo/ebase/kinds；随后再次正式请求新 epoch 成功模板/schema，证明没有把实体通道全拒。测试不补造 worldGeneration，不改缓存。此实体新增项目前 NOT_EXECUTED，协议落盘和最终artifact实跑前不能称通过。

截图：自然最高9已保存、延迟期手动ID、真实自定义命名空间候选、恢复保存、新generation恢复。实跑后必须实际打开审阅，不以 DOM 文本代替看图。

限制：当前小数据包不是独立第三方模组安装证据；没有强制多页大目录夹具；Document 消息投递延迟不是原版网络延迟。自定义附魔引用真实 vanilla vanishing 标签（26.1.2 实测92项）触发 supported_ref；原版锋利21项关系内联，不能错误要求它保持 pending。天然分页边界和真正模组注册项另列未执行，不能由 VM、语法或 metadata codec 校验替代。新版选择器变化应报告工具失败，不能放宽真实按钮/单写/saved-ID/权威回读断言。
