# 物品自动草稿生命周期

物品草稿继续使用 `config/cadeditor-ui.json` 的 `drafts`，与世界草稿共用既有 `EditorPrefs` 原子写入、容量限制和错误日志。没有新增存储文件或写游戏权限。物品键保持既有 `kind:index:menuId|itemId`；世界草稿仍为独立的 `world|scope|target`，本修复不迁移旧键或把历史物品草稿宣称为跨服务器隔离。

## 保存确认与后续编辑

- 只有 `receiveEditorResult` 匹配当前 `requestId`、状态为 `saved` 且包含物品快照，才更新基线并调用 `Drafts.saved`。
- 清理立即排队，不等待普通编辑的 1500ms 防抖。清理对象是提交文档实际写过的版本与提交键，不是当前选中的文档，也不是整张草稿表。另一个文档已写出的更新版本受所有者检查保护。
- 发送后的 A→B→A/C 编辑立即相对于已确认 B 基线重新持久化，不自动重发。同键后续脏草稿直接用更高版本 put 替换，不先 clear，以免替换上传失败时丢掉上次完整草稿。改变物品 ID 时，仅清此文档写过的中间键；其它槽、其它文档和世界父草稿不受影响。
- `rejected` 不清仍然脏的编辑。`unknown`、未确认的创造提交或缺少快照的 `saved` 保留未知状态；即使用户已改回旧基线，也保留可恢复的草稿。回执不匹配不推进状态。

## 有序协议与重载

每份 Document 的 `Drafts.writer` 与递增安全整数 `seq` 附在 `put/clear/begin/chunk`。同键新意图取消旧队列及等待中的上传；ACK 必须匹配 writer、seq、键、操作、upload，分块还必须匹配原请求 offset。重复或迟到回执不能跳过下一块或清掉新编辑。

`DraftChannel` 从当前实际 Document 的脚本读取 writer。Document.parse 尚未赋回驱动器时到达的写入消息只延迟一次，待完成后重新核对真正 Document；不无限重试。Document 关闭后以及重载后的旧 writer 消息被拒绝。宿主保留逐键版本水位：已清理/覆盖版本的旧 put、begin、chunk 不能复活草稿；重复同版本、同内容 put/clear 幂等。旧消息失败不会取消其它键的正在上传。

收到延迟的 prefs 全量快照时，以本 Document 的最新 put/clear 意图覆盖旧事实。恢复框的按钮重新核对文档和值；旧恢复框不能丢弃或恢复它打开后到达的新版本。

重开后游戏基线不同，不代表本地草稿已成功保存：可能是自己的保存成功但回执丢失，也可能是其他修改。有效同键草稿继续保留，提示“游戏数据已变化”；pending 草稿另提示上次提交结果未知。只有明确丢弃或匹配的成功回执才能退休对应版本，不因基线不同自动 clear。关闭恢复框或选择“稍后”保留原盘快照。恢复由用户明确点击，将完整草稿载入当前权威基线的编辑文档并立即持久化；保留未知标记，不自动 Apply。用户须比较后再决定应用。已恢复的未知文档不被随后 prefs 回包反复弹出恢复框；旧弹框回调还校验打开时的基线。

## 关闭时落盘

Oriel 0.15 的 `Document.close()` 在脚本销毁前派发 `pagehide`；此时 `DocumentDriver.document()` 可以已经为空。`WorldDraftHost` 捕获原 Document，而非关页后驱动器上的引用：

1. 同步读取 `Drafts.exportPackets()` 与独立的 `WorldDrafts.exportPacket()`。导出完整 typed 快照，不依赖尚未完成的分块或 ACK。
2. 对物品 clear 意图和最新脏文档按键合并，最新脏版本优先。世界草稿继续校验宿主权威 scope。
3. 写入同一个 `EditorPrefs` Store 并同步 `flush()`，复用已有临时文件原子替换和在途写入保护。

`NestedItem` 子物品没有原槽的独立写回身份，不导出为玩家原槽物品；父世界草稿始终从独立 WE 状态导出。父页面也是物品时，从最外层 NestedItem 保存的父 docs 读取已提交到 Store 的草稿，不从活动子 Store 读取。序列化、协议、容量、清理及磁盘失败都有 `drafts.*` / `prefs.*` 日志；失败保留上次完整文件与待写状态。ACK 的 accepted 表示已进入偏好 Store，磁盘写入仍依既有 tick/close flush，不冒充 fsync 或强杀进程保证。

## 回归命令与边界

- `node tools/ui-item-drafts-test.cjs [证据目录]`：真实生产 JS handler/Store/回执路径；自动加入 `tools/ui-check-all.sh`。包括原桶场景、快速关闭意图、后续编辑、拒绝/未知、同键换文档、迟到 ACK/prefs、未完分块、恢复框和 typed NBT。宿主回执在此为测试夹具，不是游戏保存验收。
- `tools/entity-feedback/run-item-drafts.ps1 -Evidence <新目录> -ClosePacket <世界草稿测试生成的close-packet.json>`：独立 javac 编译实际生产 Java；真实 Oriel Document/Rhino、pagehide、EditorPrefs 原子磁盘以及第二 JVM 读取。不会启动 Minecraft 或 Gradle。
- `DraftWriteOrderTest` 接入原 `EditorPrefsTest`；`DraftChannelOwnerTest` 用真实 Oriel send 回调检验嵌套读取 writer 和重载失效。

未写入 Store 的临时控件文本不在本次快照范围；容量与原子文件系统限制保持原合同。新包游戏验收须单独核对 hash、实际 saved requestId、关页重开及同槽同 ID 新物品，不以以上非游戏测试替代。
