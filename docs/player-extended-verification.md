# 玩家扩展后端验收（2026-11-08）

契约：[player-extended-contract.md](player-extended-contract.md)。实现位于 common，Fabric 测试入口只有生命周期适配，无生产加载器分支。

## 专用服务端探针

命令：tools/world-edit/probe-player-extended-server.ps1。真实独立 Fabric 26.1.2 专服、ServerLevel/ServerPlayer、原版注册表、原版玩家文件；记录发包调用，无连接客户端。最新回执 logs/player-extended/captured-server.json，完整日志 server-probe.log；源码生成/编译日志 probe-build.log。历史回执按时间戳保留在同目录。

通过：209 项检查（含下方前端接口对接补验）。覆盖六视图读与写权限拒绝、同维度及跨维度传送、未加载目标区块加载、维度/朝向/边界拒绝、位置冲突、重生点设置/清除/非整数拒绝、配方解锁/高亮/撤销/整批校验、成就条件授予/撤销/禁止编辑别人、统计整数校验和未知 ID 拒绝、持续增长的无关统计保留、同字段冲突、实时分页、原版同步包调用。

离线覆盖：原版 load/save 后写回、原始未知字段保留、原文件备份相等、保留最近 5 份、校验失败原文件字节不变、prepare 后玩家上线时拒绝、文件被外部改变时拒绝、不支持单人 owner 的明确错误、缺失文件、拒绝高版本 DataVersion 降级写入。原子替换通过真实 ATOMIC_MOVE 完成；不支持原子移动的文件系统路径未做故障注入。

测试中的上线竞争通过在 prepare 和 commit 之间修改真实 PlayerList UUID 索引模拟，未做真实网络登录竞争；服务端线程守卫确保正常登录与最终替换不能并发交错。单人 owner 分支用真实服务器 profile 属性验证，不替代集成服完整登录/退出验收。

## 三版本 / 双加载器

完整命令已运行六个 codecVerification（带 --continue）：logs/player-extended/matrix-codec-final.log。六个目标的 compileJava、codecTest、playerWorldEditTest 均通过；完整门禁没有通过，因为六个目标均在其他 worker 的 genericSchemaTest 失败，AssertionError: unknown mod gets fallback。未修改、跳过或削弱该门禁。

此前两次失败也保留：matrix-codec.log 为 VaultTemplateTest 调用非 public EntitySchemaTest.access 的编译错误（后续该 worker 已修复）；matrix-codec-retry.log 为首次通用 schema 断言失败。

收尾后的六目标玩家定向复测命令（compileJava + codecTest + playerWorldEditTest）全部通过，BUILD SUCCESSFUL in 1m 21s，75 actionable tasks；日志见 logs/player-extended/matrix-player-final.log；该日志是最后源码的定向验证，不等同于完整 codecVerification 通过。

API 差异：本次涉及的原版公开 API 在 26.1.2 / 26.2 / 26.3 一致，无新增 Stonecutter 条件分支。docs/MULTIVERSION.md 的「P4-1 玩家扩展 API 核对」记录了签名核对和 ServerRecipeBook 追加加载的语义注意点。

## 复查与剩余边界

代码复查记录：logs/player-extended/review.md；diff 检查与 PowerShell 解析：final-diff-check.log、powershell-parse.log。本轮采用人工代码复查并修复发现项。

未跑全量客户端验收、实际界面接收/展示、NeoForge 专服运行、第三方保护插件集成；由 Lead 统一验收。成就奖励和传送可产生原版副作用，不承诺 undo。离线视图限定为契约列出的玩家字段，不直接修改独立成就/统计文件；单人 owner 在线编辑，不写 level.dat。

## 前端接口对接补验（2026-11-08）

对接前端 d9548e6 的 player_extended / player_extended_result，未修改前端文件。DocumentDriver.patch 发送顶层 player_extended_result 对象，Oriel 的 data 事件收到完整数据和该 key；对象内部 value:null 与 nextOffset:null 不会被 PageData 当成删除顶层字段。

修复了两个桥接问题：WorldWire 的压缩请求现在识别 player_extended 的 target（不再错误要求旧 slot）；Java 宿主最多缓存 4 笔等待请求，一次发送 1 笔，上一笔回执之后至少等待 550ms，保证位置读取后自动读取重生点不会撞服务端 500ms 限流。消息回调排入 Minecraft.schedule，让 JavaScript 在回执到来前先登记 requestId。排队和网络等待总计超过 10 秒会回拒绝；不自动重试写入。

apply 仍绑定 Java 持有的 revision，另外拒绝排队期间已经过期的页面 revision；页面原始 requestId 在回执里恢复。其他玩家显式 UUID 不被替换为自己；自目标缺省 UUID 才取当前玩家。位置保留浮点坐标与角度，重生点校验整数坐标；离线 patch.snbt 原样经类型保真 SNBT 解析。

新增验证：六目标 compileJava + playerWorldEditTest + worldEditTest 全过，logs/player-extended/matrix-wire-integration-final.log（BUILD SUCCESSFUL in 1m 26s）。PlayerWorldEditTest 现在每目标 21 项，包括显式 patch:null、value:null、nextOffset:null、长离线 SNBT 压缩往返和无旧 slot 的解压。初次宿主调度 API 编译错误保留在 matrix-wire-integration.log，已使用目标版本真实公开 schedule 方法修复。

服务端探针的每笔请求/响应现在都经过实际 WorldWire.encode/decode；离线成功案例使用超过 17,000 字符的 SNBT，请求确实走 gzip 分支。原版重生点清除回执断言 value 为显式 JSON null；另加入浮点 yaw/pitch 和指定另一名在线玩家 UUID 的写入检查。各视图完整请求/响应都在 captured-server.json 的 extended.evidence 数组，按 request.view 筛选即可。

宿主排队行为已代码复查并通过三版本双加载器编译；真实 Oriel 页面点击、连接客户端发收仍由 Lead 的统一实机验收覆盖。
