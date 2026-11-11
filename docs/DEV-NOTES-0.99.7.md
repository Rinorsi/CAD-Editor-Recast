# 0.99.7 开发记录

2026-11-10。此文面向开发；玩家日志统一维护根目录 CHANGELOG.md。

- 设置新增“更新日志”标签。复用 modalShell、ed-tabs、foldArrow、uiSlide 和现有主题；480px阅读宽度，小窗口保留完整标签名。版本/日期/当前版本/条目数在标题行，分类和历史版本可折叠，正文正常换行。仅解释行内强调和代码，不将日志作为HTML执行。
- EditorChangelog 只在打开设置日志时读取包内 assets/cadeditor/CHANGELOG.md；先回版本索引，展开某版本才回正文。不请求网络/注册表，不在编辑器启动时创建完整日志DOM；页面关闭注销订阅。请求失败和超时可重试，并在 settings.changelog 日志保留原因。
- 所有目标的 processResources 自动从根 CHANGELOG.md 复制日志，jar 根目录另附原文，避免维护第二份日志。来源以当前安装JAR为准，不受资源包覆写；运行中的旧客户端热加载新UI时提示重启。
- 版本推进至0.99.7，Oriel继续0.15.0。六个Fabric/NeoForge×26.1.2/26.2/26.3 JAR集中在同一交付目录；不把不同加载器混入同一个安装环境。build-all 同时附带 CHANGELOG.md、README.md 与校验清单。
- 按本轮范围运行语法/构建与包内容检查，不启动或操作用户游戏，不运行行为测试。游戏中的排版、交互效果由用户查看，不以构建结果替代实机验收。

检查与交付回执见本节后续记录。

## 本轮交付回执

- PASS | node --check（changelog.js、screens.js）/ PowerShell parser（build-all.ps1）| 日志 ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-changelog-0.99.7/syntax.log。
- PASS | bash tools/gw.sh :fabric:26.1:assemble :fabric:26.2:assemble :fabric:26.3:assemble :neoforge:26.1:assemble :neoforge:26.2:assemble :neoforge:26.3:assemble -PmcTest=false --no-problems-report | 日志 ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-changelog-0.99.7/assemble-six-ready.log。首次重复max-workers参数及随后Java字符串转义错误的失败记录分别在 assemble-six.log / assemble-six-final.log；最终已修正并六目标通过。
- PASS | Python zipfile/hashlib 包内容与复制核对 | 每个JAR的根CHANGELOG.md、assets/cadeditor/CHANGELOG.md与仓库完全一致；日志脚本、设置入口、样式、HTML与最新源码逐字节一致，版本元数据均0.99.7；交付六包SHA256与构建原包一致。日志 ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-changelog-0.99.7/package-audit.log。
- 交付：../Oriel-UI-Workspace/dist/editor-0.99.7-20261110/，平铺六个JAR，附CHANGELOG.md、README.md、SHA256SUMS.txt。
- NOT_RUN | 行为测试、游戏实测；未安装或操作用户游戏。页面排版及折叠交互仍由用户安装本包后查看。

## 玩家日志文案修订

- 删除0.99.7中的集中交付目录、选包步骤及JAR文件组织说明；离线查看合并为功能描述。安装步骤留在交付README。
- 清理0.99.5的开发热加载和外部依赖构建参数，以及0.99.3/0.99.2的测试统计、CI/版本脚本、源码去重和验收文档引用。历史开发证据仍在docs/MULTIVERSION.md等开发文档及Git历史中。
- 本轮仅改日志与界面约定，不改功能，不推进版本。重新组装六包使包内日志同步。

## 折叠修复并回 0.99.7

2026-11-10 用户明确要求保持0.99.7，撤回本轮0.99.8版本推进；保留折叠修复，玩家日志合并至0.99.7。当前版本标记、测试用版本、六目标文件名与包内元数据统一为0.99.7。后续这批修订不自动推进版本。

- releaseNoteFold 在展开前解除隐藏、收起动画结束后隐藏内容，并按最后点击状态决定可见性；不改公共uiSlide约定。
- PASS | node tools/ui-changelog-fold-test.cjs | ../Oriel-UI-Workspace/daily/2026-11-10/logs/editor-changelog-0.99.7/fold-regression.log。
- 未运行全量测试和游戏实测。
- PASS | bash tools/gw.sh 六目标 assemble -PmcTest=false --no-problems-report | 同目录 assemble-six-fold-revision.log。
- PASS | Python 六包元数据、修复脚本、日志与SHA256检查 | 同目录 package-fold-revision.log。
- 六包已替换原 dist/editor-0.99.7-20261110；0.99.8不再作为当前版本交付，历史构建记录保留。
