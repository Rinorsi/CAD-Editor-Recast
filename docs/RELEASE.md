# 发版清单

当前版本：<!-- editor-version -->0.99.8<!-- /editor-version -->。唯一版本定义为根目录 `gradle.properties` 的 `version`；元数据 `${version}` 由 Gradle 展开。新的文档版本引用使用上述标记；历史版本、验收回执、已发布更新日志保持原样。

1. 改版本：大批功能更新交付时推进版本；用户明确指定保持版本时优先遵守。当前修订为0.99.8；原包原样补发无需升版。执行 `pwsh -File tools/bump-version.ps1 -Version <新版本> -DryRun`，审阅后去掉 `-DryRun`。同步 README、docs 当前版本标记、CHANGELOG 未发布章节、元数据模板。补全中文玩家更新日志，删掉开发中占位描述。
2. 全部功能合并后统一验收：`pwsh -File tools/accept-all.ps1 -Full`；其余五目标运行 `tools/smoke-matrix.ps1`。保留失败、重试和最终证据。可选内存采样：`pwsh -File tools/live-test/run.ps1 -Driver memory -MemoryMinutes 3 -EvidenceRoot <新的独立目录>`。
3. 打包：`pwsh -File tools/build-all.ps1`，等待共享 Gradle 锁，不结束别人的进程。输出 `../Oriel-UI-Workspace/dist/editor-<版本>-<日期>/`，六个目标 jar 平铺同一目录，附 CHANGELOG.md、README.md 与 SHA256SUMS.txt。
4. 发行目录运行 `sha256sum -c SHA256SUMS.txt`（Git Bash / Linux），确认恰好六项全部通过；检查 metadata 版本、UI、平台 services 与测试代码隔离。图标/作者/链接元数据与 docs/branding 一致。
5. 提交并审核，确认 CI 六目标 build/check（含 codecVerification）通过，玩家日志与已验收功能一致。
6. 有发布授权的维护者创建并推送 `v<版本>` tag。tag 必须与 gradle.properties 一致；工作流从同一 tag 重建六个 jar，发布 GitHub Release 与 SHA256SUMS.txt。本地脚本不会主动 push。

## CI 的 Oriel 依赖

当前源码依赖 Oriel 0.15.0。本地构建使用正式 Maven 瘦包；云端默认固定至
`49d0410a7a5dae7003b9972e24d7c3349e35fe5b`，已核对该远端提交的核心版本为0.15.0。
2026-11-11 已确认当前 Editor 仓库尚未配置 `ORIEL_READ_TOKEN`；同步源码不代表云端六目标CI已通过，须配置私有依赖的读取权限后运行。
文末已有验收记录属于历史包，不代表新的提交已通过云端构建或已发布。

Oriel 源码目前私有。配置 Actions secret `ORIEL_READ_TOKEN`（Oriel 仓库只读权限），CI 检出 `Rinorsi/Oriel-UI` 并构建前置。仓库变量 `ORIEL_REPOSITORY`、`ORIEL_REF` 可指定维护者确认的来源；所选提交必须提供当前依赖的 0.15.0 API 和对应六目标瘦包。未开放且 secret 未配置时 CI 明确失败；外部 PR 无法读取 secret 时由维护者在可信环境复验。

## 可选平台上传

gradle.properties 的 `modrinth_id`、`curseforge_id` 留空；`oriel_modrinth_id`、`oriel_curseforge_id` 也需填写，以声明必需前置。凭据仅放 Actions secrets `MODRINTH_TOKEN`、`CURSEFORGE_TOKEN` 或同名环境变量。

`./gradlew publishMods -PpublishDryRun` 预览；真实上传仅在显式执行 publishMods 或发布 tag 时发生。各平台缺少项目 ID、Oriel 前置 ID 或 token 时独立跳过，不影响 GitHub Release；网络、认证或 API 错误仍报错。CI 在六目标全部通过、GitHub Release 完成之后，使用 -PpublishArtifactDir=release 上传同一批已校验附件，不重新编译。

## 内存报告

`-Driver memory` 复用隐藏、无焦点客户端、独立世界与原有锁。默认 3 分钟，`-MemoryMinutes` 可调，`-MemoryIntervalSeconds` 默认 5 秒。仅对确认归属的客户端 PID 读取 JVM `GC.heap_info`（不主动 GC），记录 used heap 首值、峰值、末值、线性趋势及原始样本。

增长同时超过 `-MemoryGrowthPercent 30` 与 `-MemoryGrowthMB 200` 时标 WARNING。报告为证据目录 `memory-report.json` / `memory-report.md`；中断或诊断失败记 ERROR。短时采样受 GC 周期影响，不能证明没有泄漏；独立可选，不默默延长全量验收。


## Oriel 内嵌发行与开发热更新

当前 <!-- editor-version -->0.99.8<!-- /editor-version --> 默认使用 Jar-in-Jar 内嵌未修改的 Oriel 0.15.0 瘦包。依赖范围为同 minor（低于0.16），保留库 mod id 及第三方声明。不内嵌完整版、模板、showcase 或开发探针。玩家无需另装 Oriel；Fabric API 仍需安装。

开发环境继续使用官方热更新：Gradle runClient 配置 oriel.sourceRoot 指向 common；直接运行发行 jar 做开发，使用实例自己的 config/oriel/dev-sources.properties。开发路径和配置不放进发行目录。Java 库更新仍需重启。

构建外部依赖版使用 -PorielEmbedded=false；构建模式切换已在同一输出目录核验嵌套清单清除/恢复。平台必需下载声明随模式变化，模组内部的 Oriel 必需依赖始终保留。CI 固定 Oriel 源码提交并只发布瘦包到 MavenLocal。

历史 0.99.5 包曾通过六目标构建/check及159个自定义JavaExec检查；其 Fabric26.1.2 内嵌包实际验证了无Oriel房主/旁观者的背包11项、集成服混合保存及发行jar开发覆盖热更新。上述记录不覆盖后来同版本号下的 NBT、注册表、比例和 Oriel 0.13 改动；新包必须按 SHA256 关联自己的构建与实机报告。其余五目标不以构建结果冒称实机通过。完整前轮自身字段26项属于0.99.4/Oriel0.11，不转记为新包覆盖。
