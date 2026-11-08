# 玩家扩展后端验收（2026-11-08）

契约：[player-extended-contract.md](player-extended-contract.md)。实现位于 common，Fabric 测试入口只有生命周期适配，无生产加载器分支。

## 专用服务端探针

命令：tools/world-edit/probe-player-extended-server.ps1。真实独立 Fabric 26.1.2 专服、ServerLevel/ServerPlayer、原版注册表、原版玩家文件；记录发包调用，无连接客户端。最新回执 logs/player-extended/captured-server.json，完整日志 server-probe.log；源码生成/编译日志 probe-build.log。历史回执按时间戳保留在同目录。

通过：202 项检查。覆盖六视图读与写权限拒绝、同维度及跨维度传送、未加载目标区块加载、维度/朝向/边界拒绝、位置冲突、重生点设置/清除/非整数拒绝、配方解锁/高亮/撤销/整批校验、成就条件授予/撤销/禁止编辑别人、统计整数校验和未知 ID 拒绝、持续增长的无关统计保留、同字段冲突、实时分页、原版同步包调用。

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
