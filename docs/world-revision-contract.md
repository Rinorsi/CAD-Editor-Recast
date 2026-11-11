# 世界会话版本与重试（2026-11-08）

本条覆盖旧合同中把网络 revision 解释为实时 NBT 内容哈希的说明。网络 revision 现在是服务端生成的64位十六进制**不透明会话版本**：只在 open / 成功 apply / 成功 undo（含 riding）生成。客户端只能保存并原样回传，不得自己计算、修改或从实时 NBT 推测。即使成功保存的内容相同，也会推进版本；自然 tick、读取、拒绝、限流不会改变版本或基线。

这不是又一份 volatile 白名单：版本认证完全不读取 current 的内容哈希。current 只进入身份检查和既有逐路径三方合并；用户未改的未知 timer、乘客 Pos/Motion/Age/InLove/EggLayTime 等变化不会让版本失效。WorldNbt.revision/requireRevision 留作内容指纹/历史探针，不再用于会话版本认证。

## 生命周期（所有写入点）

服务端 WorldEditSessions.State：

1. open：复制一次真实 sessionData 为冻结 baseline，生成 revision。WorldEditor 使用同一份捕获数据构建返回的 snbt/nbt，不再为回执额外保存一份实体当成基线；最终回执 revision 强制取该 State.revision。
2. require：比较请求 revision 与 State.revision，检查 token/目标、真实类型/UUID；不替换 baseline、不重算 live 哈希。
3. saved：成功写入后捕获一次 after，同时用于新的 baseline 和回执 snbt/nbt，生成新 revision。普通 apply/undo 在提交版本前完成真实 saved 快照/传输预算检查；这一步失败会恢复写前状态，避免基线推进而返回不了快照。
4. 拒绝/限流：不调用 saved，baseline/revision 均不变。close/断线/重开/服务器重启按原规则丢弃会话。

Java 客户端 WorldEditorClient（页面不能决定网络版本）：

1. show(opened.world)：保存 canonical slot 和 revision。
2. apply/undo：复制页面可编辑内容，宿主覆盖 slot/op/revision。先登记 pending/request deadline，再 send，避免同步/快速回执到达时尚未登记请求。
3. receive(saved)：只接受匹配 pending.requestId 的回执；先更新宿主 revision，再清 pending、patch world/result。下一笔发出时使用新版本。
4. receive(rejected)，包括 rate_limited：清 pending，保留 revision 和草稿；不会把客户端基线推进到尚未保存的内容。
5. 超时：清 pending，但保留旧基线；若服务端其实已经提交而 ACK 丢失，下一笔会明确 client_revision，须重新打开核对，不能悄悄套用新版本覆盖。
6. close / disconnect：清空 slot/revision/pending；新的 opened 独立建立会话。

## 拒绝形状


    {"status":"rejected","requestId":"w2","code":"target_changed",
     "stale":"client_revision","reason":"页面数据版本太旧；请重新打开并比较草稿"}

stale 枚举：

- client_revision：令牌/目标仍对应会话，但草稿版本不是当前版本。提示重新打开并比较草稿，不能自动把旧草稿改成服务端的新版本后盲目提交。
- identity：实体 UUID/类型或方块/BE 身份变化，同时有 conflicts:[{path:[...]}]，如 ["id"] / ["UUID"] / ["block"]。
- session：会话丢失/旧拒绝分支不能确认当前基线。session_lost 仍保留原 code，并附 stale:session。

真正的逐路径冲突仍是 target_changed + conflicts（最多20项），没有 stale:client_revision。任何 target_changed 都至少具有 conflicts 或 stale，不再只有模糊 reason。


    {"status":"rejected","requestId":"w3","code":"rate_limited",
     "retryAfterMs":327,"reason":"世界修改过于频繁，请稍后再提交"}

retryAfterMs 为距离该玩家下一次可提交还剩的毫秒数，向上取整，范围1..500。被限流的点击**不延长**窗口；open/被允许进入处理的修改仍共享500ms间隔。前端可等待此值后重新发送同一可见草稿，宿主仍使用未变化的会话版本。不能把 client_revision 当成 rate_limited 自动重试。

## 现场排查证据与边界

logs/world-merge2/current-source-before-fix.json 是在本轮版本加固前用当时三方合并源码创建的真实 ServerLevel：马载鸡、开着AI并运动20 tick，打开回执版本等于冻结会话版本，baselineAfterTicks 与 storedBaseline 完全一致，改马 CustomName 成功。因此不能仅凭用户那条文案断定新三方合并存在路径冲突或身份变化。

logs/world-merge2/pre-merge-session-bytecode.log 来自保留的三方合并前编译产物：require 确实先对 current 调 WorldNbt.requireRevision，再对 baseline 调用。在真实马载鸡探针中重放这个旧检查，会得到与用户完全相同的旧 reason，既不经过三方合并也没有 conflicts：真实幼鸡的 InLove 从200变为0、成年骑乘鸡 EggLayTime 下降会被旧实时指纹检查视为变化；Pos/Motion/Age 也确实随tick变化，但这些伴随字段已有旧投影规则，不应冒充它们就是本次指纹变化的原因。当前真实路由对名称、attribute base、Tags 均成功。

现场运行客户端 PID 36224 创建于2026-11-08 01:25:21（北京时间），其 DLI 配置指向本仓库；WorldMerge.java 创建于01:28:36，WorldMergePlan.java 创建于01:31:59，WorldEditSessions 的三方修改为01:31:59。启动参数未发现 javaagent/hotswap。EditorMod.onInitialize 在启动时调用 WorldEditor.initialize，后者静态初始化 WorldEditSessions。磁盘源码/Gradle构建不会热替换该 JVM 已加载的类；当前活着的 runClient 不能当作新编译逻辑验收。证据在 running-client.json、client-runtime-flags.json、client-launch-config-path.txt、source-times.json；未 attach/dump 用户 JVM，也未重启、终止或操控它。

完整真实路由探针以 reply sink 替代网络发包，其他 WorldEditor/WorldEditSessions/WorldMergePlan/真实实体加载写入完全相同；覆盖等tick、马名称/属性/Tags、真实乘客年龄/繁殖/下蛋计时、连续提交（ACK前旧版本、ACK后新版本）、限流后旧版本诊断与新版本成功。原始收据见 logs/world-merge2/captured-server.json，通过后另存 docs/archive/world-revision-samples.json。用户真实客户端及真实网络 ACK 时序仍待用户正常退出旧实例、重新 runClient 后验收。
