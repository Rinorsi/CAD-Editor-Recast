# 存档玩家档案后端验证（2026-11-09）

契约先行提交：1c4d028，见 player-extended-contract.md / vault-contract.md。后端全部在 common；前端由 Lead 接入。本轮仅运行相关编译、玩家/保险库 JVM 测试与隔离专服探针，没有执行全量验收或启动用户客户端。

## 接口

- players：read 返回 opened/playerExtended，revision:null、target:{}、value.entries；条目 uuid/name/online/self/owner/last_played_ms，支持名字或 UUID 子串过滤与 offset/limit 分页。名字仅查 UUID 本地缓存，不使用可能联网的名字解析接口。
- offline：value.snbt 不变，增加 summary；完整字段见契约。通过原版 ServerPlayer.load 取得数据，主背包和末影箱计数为非空槽数；装备返回物品注册 ID 或 null。
- export_preset：不需要 view/revision；返回 exported + 顶层 template/summary。使用 VaultTemplates.capture，六分区及 typed component_snbt 与保险库一致，缺省全部，可选非空子集。
- has_backup：支持 template/world/uploadToken；按请求分区比较规范化 SHA-256，允许已存模板包含更多分区。缓存已存条目的分区哈希，输入每次只规范化一次；不做第二遍完整字符串比较，不改变库 revision。命中是否已落盘仍看 persisted。

## 证据

全部路径相对仓库根。机器汇总：logs/player-extended/profiles-verification-summary.json。

| 检查 | 结果 | 证据 |
|---|---|---|
| Fabric / NeoForge × 26.1 / 26.2 / 26.3 compileJava | 六目标通过 | logs/player-extended/profiles-matrix-final.log |
| 六目标 playerWorldEditTest | 每目标 31 项通过；含隔离空成就管理器、旧玩家协议和显式 null | 同上 |
| 六目标 vaultTemplateTest | 每目标 53 项通过 | 同上；logs/player-extended/{fabric,neoforge}-26.{1,2,3}-vaultTemplateTest-backup-evidence.json |
| Fabric 26.1 vaultTest | 原保险库 167 项通过 | 同上 |
| Fabric 26.1.2 隔离专服 | 扩展 445 项、88 笔真实请求/回执通过 | logs/player-extended/profiles-server-receipt.json、profiles-server-summary.json、server-probe.log、profiles-probe-run.log |
| 补丁空白检查 | git diff --check 通过 | logs/player-extended/profiles-diff-check.log |

专服逐项覆盖：

- players：在线无存档文件仍列出；离线文件、未知 name:null、本地缓存名、大小写不敏感搜索、UUID 子串、分页 total；self/online 的时间 null；离线 mtime；在线/离线 owner 标记；拒绝无权限及名单 apply。6 笔成功名单读取保留在回执中。
- summary：未知名字 null；已缓存名字；原版加载后的 game_mode、health、food、xp_level、维度、坐标、selected_slot、主背包/末影箱非空数、头盔 ID、空装备 null。摘要与真实原玩家对象投影逐字段相等。
- export_preset：在线、离线、选定分区、离线 owner 共 4 笔成功导出。在线与离线模板完全相等，包含背包/装备/末影箱 typed 栈；VaultTemplates 再捕获往返相等。拒绝重复分区、无权限和已上线的离线目标。
- 只读保证：读取前后 playerdata 字节一致；stats/advancements 缓存键及对象引用一致；故意创建 ArchiveReader.json 旧名字统计文件，确认未被迁移，统计/成就目录文件哈希不变；损坏字段加载失败也清理临时缓存。
- 原写入回归：传送、重生点设置/JSON null 清除、配方解锁/撤销、成就、统计三方合并；离线原子替换、原件备份、保留 5 份、未知字段保留、失败不落盘、上线/文件变化冲突和未来 DataVersion 拒绝均继续通过。

保险库 JVM 覆盖：空库未命中、完整命中、返回 id/name、库 revision 不变、重复查询复用哈希、子集命中、未选分区不同仍命中、选中分区不同未命中、槽位数组重排、合法不同物品未命中、越界物品拒绝、超 JS 精度 long 差异仍未命中、非法/重复分区、错误 kind、无世界拒绝、删除后缓存不误命中、仅保存部分分区的命中/不足。

## 版本与安全复查

MULTIVERSION.md 差异 #35：26.1.2 stopListening，26.2/26.3 clearTriggers。差异 #36：26.3 成就管理器构造即读取 ADVANCEMENT 注册表，需提供独立空注册表；旧版新管理器默认空。六目标玩家 JVM 测试验证该分支。

PlayerList.remove 会保存，不能用于只读对象清理。使用既有 AW/AT 开放 stats/advancements Map，构造前注入独立原版计数器和空成就对象，避开旧名字文件迁移与数据包自动奖励；finally 只删除随机临时 UUID，不动目标 UUID 缓存。字段/方法均按已解析原版 jar 核对，无运行时反射或加载器 import。相关 API 字节码核查日志为 logs/player-*-bytecode.txt。

三版 owner 的原版加载都用 WorldData.getSinglePlayerUUID 选 playerdata 文件；不自行读取旧 level.dat Player。离线 owner 仍不可编辑，但允许按此规则只读导出。名单中的 owner 标记来自单人 profile。

首轮记录保留：profiles-matrix.log 为测试漏 import；profiles-matrix-retry.log 为测试误用 2 个潜影盒而触发原版堆叠校验；profiles-matrix-fixed.log 为安全修正与编译交错导致测试引用旧类。最终固定源码重新执行六目标定向门禁，profiles-matrix-final.log 全部通过，不把失败尝试计作通过。

## 复跑与范围

使用 tools/world-edit/verify-player-extended.ps1 的 Tasks 参数传六目标 compileJava/playerWorldEditTest/vaultTemplateTest，另加 :fabric:26.1:vaultTest；专服运行 tools/world-edit/probe-player-extended-server.ps1。两脚本遵守仓库 logs/.gradle.lock.d 锁，专服使用独立临时存档、loopback 随机端口及 --nogui；不操作键鼠，不停止外部进程。

尚未运行：前端实机流程、其他版本/NeoForge 专服集成和全量验收，由 Lead 最终统一执行。上述编译和 JVM 结果不代替这些验收。
