# 完整玩家编辑页后端验证（2026-11-09）

契约：
- [world-edit-contract.md](world-edit-contract.md)：页面 `open_world` 的 self / online / offline / preset 目标，同形 world.views.player、宿主 slot/token/revision 绑定。
- [vault-contract.md](vault-contract.md)：本地预设编辑、templateRevision 内容 CAS、原有元数据及持久化语义。
- [permission-matrix.md](permission-matrix.md)：离线每笔 EditorPolicy.requirePlayerEdit；本机预设不写世界，套用给真实玩家仍需服务端权限。

## 实现与边界

在线目标继续走原有 WorldTarget 权限、距离、会话和写入路径。离线目标以档案路径 UUID 绑定同一套 WorldEditSessions，原版临时 ServerPlayer 只负责读取、规范化和序列化，不登录或注册实体。Player.load 会恢复构造 GameProfile 的 UUID；随机临时 UUID 保留用于缓存隔离，会话身份独立投影。写入只把原版前后差异投回原文件，校验失败不落盘；最后重查未上线、非房主、文件指纹，先备份，再 ATOMIC_MOVE，保留最近 5 份。

预设以本机 PlayerPresetPage 创建未注册 Player。只允许已保存的分区；稀疏槽位/属性只合并实际变更，不自动扩展模板作用范围。VaultStore.update 内容 CAS 防止另一页覆盖；同时保留最新名称、标签、备注。canUndo:false；saved 的 world.vault 字段保留保险库的异步落盘语义。

原版效果会创建永久属性修饰符；校验使用真实 MobEffect.createModifiers 识别这些 ID，仍检查所有属性基值、非效果修饰符及其他字段。float、Component、效果和修饰符使用原版规范表示，完整保存结果再次原版加载比较。

## 本轮证据

- 六目标 compileJava + playerWorldEditTest + vaultTemplateTest，以及 Fabric 26.1 vaultTest：logs/player-extended/full-player-matrix-final.log。PlayerWorldEditTest 48 项/目标；VaultTemplateTest 63 项/目标；VaultTest 167 项。前一轮通过日志 full-player-matrix-first.log 也保留。
- 隔离 Fabric 26.1.2 专服探针通过：556 项，116 条真实请求/回执，另 1 条本地预设模型回执。logs/player-extended/full-player-server-receipt.json；full-player-server.log；full-player-probe-run-fifth.log。
- A：在线 open → apply → reopen 的 views 完整相等；旧 slot/token 拒绝，undo、返回自己及导航失败保留旧会话。
- B：离线 open → apply → reopen 完整相等，覆盖模式、经验、食物、生命、非整精度能力、文本、标签、效果；随机临时身份不泄露进会话。无权限、上线竞争、房主、非法值、同字段冲突拒绝；未修改字段与此前模式保留；备份字节相同、保留 5 份、最终文件指纹重查。分离回执 full-player-offline-evidence.json。
- C：本机模型 open → apply → reopen 完整相等；与 VaultTemplates 捕获的 JSON 完全相等，含 typed component_snbt；当前元数据保留、内容 CAS 冲突、隐藏字段拒绝、超限不修改库、部分分区和稀疏模板不扩展。直接对比 full-player-preset-roundtrip.json；汇总 full-player-summary.json。
- 物品模板配额：JVM 覆盖同一条目更新、内容 revision、校验失败/64KiB 超限不修改条目；保留原 has_backup 命中、未命中及部分分区回归。

## 修复过程与审查

四次未通过的探针日志 full-player-server-first.log 至 full-player-server-fourth.log 保留，不计为通过：分别定位临时 UUID、原版效果属性副作用、校验异常被错误包装为加载错误、预设物品校验剔除 slot/label 附带字段。最终比较采用实际 JSON 合同表示，避免 Gson Float 与解析数字包装类型的差异；typed SNBT 未放宽。

源码审查已核对：模式切换后的目标绑定与旧会话关闭；原版临时缓存 finally 清理；在线写入和离线写入分离；属性效果副作用；只投影修改字段；备份/原子替换前复查；模板内容 CAS、配额和元数据；候选来自实时注册表/Codec。diff --check 证据：logs/player-extended/full-player-diff-check.log。

三版新访问点一致：ServerPlayerGameMode.setGameModeForPlayer(GameType,GameType) 通过共同 AW/AT 开放，仅隔离对象使用；没有新增 Stonecutter 版本条件。临时成就对象仍沿用 MULTIVERSION.md 差异 #35/#36。

本轮没有运行客户端、没有操作用户游戏、没有执行全量验收。真实页面导航/按钮/分区显示和实际客户端交互由 Lead 最后统一验收；前端应使用 world.player.sections 隐藏未保存分区。
