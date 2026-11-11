# NBT 类型保真

编辑、复制、撤销、草稿恢复、保险库套用和热更新不能改变未编辑数据的 NBT 类型或数值。
游戏权限、原生 Codec、字段范围和保存读回校验仍保留；不靠放宽为“数字看起来相同”来消除错误。

## 数据流

- 页面节点用 NBT_META（WeakMap）记录所属类型，不再按全局 JSON 值寻找相似类型。
  普通表单仍读数字；超出 JavaScript 安全整数范围的 long 保留原始文本。
- nbtTake / nbtPut 用于字段在两个对象之间转移，clone 复用带类型的克隆。
  直接按键赋值会丢失附在来源父节点上的数值类型，不能用于自由 NBT 字段搬运。
- 文档快照和持久草稿带 nbt_types，原始宿主快照仍接受 component_snbt。
  应用与原生校验发送同一份带类型文本；未知组件交给游戏注册的 Codec，不主动删除。
- EditorPageController 的热更新状态版本 2 使用 nbtExportDocState / nbtImportDocState，
  保留各文档的未应用修改、基线、历史和当前位置。仍不恢复提交中的请求，仍核对目标槽位／会话。
- 方块视图保持原有 views，对声明 schema.fields.<key>.wire_snbt 的字段另带 views_snbt。
  蜂箱生物、讲台／唱片机物品、原版宝库钥匙及 long 字段走带类型通路。
  后端从 SNBT 解码后执行原有权限、范围和加载器保留性检查，不能用另一份 JSON 绕过限制。
- 组件快速校验的 8192 字符限制与最终写入／保险库存储容量分别执行。
  大条目不得因增加类型快照而退回快速校验的限制；网络总载荷、保险库条目和文件总容量限制继续保留。
- 编辑中的快速校验也必须保留类型：嵌套物品及模组组件含 long、类型化数组等时，
  使用与应用相同的 SNBT 文本，不再让 JSON 投影触发误拒绝。普通数字组件保留逐字段校验。

纯原版 JSON 不包含 NBT 数字后缀或数组种类，不能当成无损备份。命令／SNBT 和保险库的带类型格式承担无损往返。

## 可复跑检查

| 检查 | 覆盖 | 不代表 |
| --- | --- | --- |
| tools/nbt-audit/ui-roundtrip.cjs | 原有 112 项：12 种可编辑 NBT 类型、复制／导入／导出／保险库／草稿及定向失败复现 | 原生存档或实机已通过 |
| tools/ui-nbt-entry-test.cjs | 保险库套用世界实体、刷怪蛋字段拆分合并、蜂箱导入后换类型、合法特殊键和数值对象校验 | 全部第三方模组数据已覆盖 |
| tools/ui-nbt-nested-routes-test.cjs | 分别执行容器、收纳袋、使用后返还物、已装填弹药的控件回调，检查同值不同类型、精确 long／数组、未知组件、复制及撤销重做后的提交 | 保险库网络协议、游戏 Codec 或实机已通过 |
| tools/ui-nbt-reload-test.cjs | 提取真实 Java 控制器脚本，在两个独立页面环境中保存和恢复，检查类型、long、撤销／重做及目标隔离 | 实际游戏热更新已通过 |
| tools/ui-nbt-validation-route-test.cjs | 真实防抖校验路由、嵌套 long／类型化数组与提交文本一致、普通组件仍按字段校验 | 原生 Codec 或实机已通过 |
| tools/nbt-audit/typed-native.ps1 | 真实页面生成 views_snbt → 生产 BlockViews.apply → 原生 Tag 比较 | 真实世界 tick／持久化已通过 |
| codecTest / vaultTest / worldEditTest | 原生组件及方块加载器、大保险库容量、类型快照和无效载荷 | 其余版本和加载器已通过 |
| tools/nbt-audit/run-live.ps1 | 固定 jar hash 的独立单人实例；以生成的请求和权威读回为准 | 未执行的模式、其他 jar 或全版本实机已通过 |

原始 NativeRoundTrip.java 中的 plain JsonOps 反例继续保留：这种转换本身仍然有损。
修复使用新的带类型生产路径，不能把反例的错误输出改成正确预期。

2026-11-09 的过程证据位于工作区 daily/2026-11-09/logs/data-integrity-scale/。
nbt-ui-suite03.log 记录界面套件通过、24 个页面快照与原基线逐字一致；
nbt-current04/roundtrip.log 记录 112 PASS / 0 FAIL / 0 HARNESS_ERROR。
这些是分层证据，最终发布以集成后固定产物的构建和实机结果为准。
