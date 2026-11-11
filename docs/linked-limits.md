# 数值与属性上限联动

0.99.6 的表单在本地草稿中联动，用户点击应用后才请求服务端写入。

- 玩家 Health / AbsorptionAmount 对应 max_health / max_absorption；实时 schema 提供范围及未持久化修饰符。计算遵循原版三个运算阶段，保留原 modifiers，仅提升达到目标所需的 base。降低上限时按实际有效值同步降低当前值。
- 待提交状态效果变化时暂停玩家上限联动，先应用效果，避免用旧修饰符计算。服务端 native preview 和冲突检查仍为最终准入条件。
- 完整实体表单使用注册表属性范围及实体持久化 modifiers；服务器校验实际加载结果。特殊实体的动态体型或效果可以进一步限制结果，不能仅凭草稿宣称游戏生效。
- 饱和度超出食物量时将食物量提高到向上取整值；反向下调同步降低饱和度，保留对象其他字段。
- 物品剩余耐久超过最大耐久时同时修改 max_damage 与 damage，一次历史记录，保留 typed 未知字段。
- 桶不消费任意完整实体属性，不写入伪造 max_health；食物硬上限、属性 RangedAttribute 硬界及服务端权限不被绕过。
- 旧 Java 实例无 linkedAttributeLimits 时展示更新重启提示。资源热更新不能更新已加载 Java 类。版本仍为 0.99.6，Oriel 仍为内嵌 0.15.0。

验证分层：ui-linked-limits-test 运行生产 DOM handler；linkedAttributeTest 将生产 JS 计算结果交给三个 MC 版本真实 AttributeInstance，比对计算及 modifiers；游戏验收单独留回执、实际原生读回与重开记录。
