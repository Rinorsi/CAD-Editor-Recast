# 隐藏实机验收

使用 Java 25、Minecraft 26.1.2 / Fabric 的真实客户端和本地服务器。

```powershell
pwsh -NoProfile -File tools/accept/run.ps1
# Keep this run and its report separate from other verification sessions.
pwsh -NoProfile -File tools/accept/run.ps1 -EvidenceRoot logs/live-test
# 只编译，不启动游戏
pwsh -NoProfile -File tools/accept/run.ps1 -CompileOnly
# 不覆盖源码，仅测试明确指定的发行 jar
pwsh -NoProfile -File tools/accept/run.ps1 -UseReleaseJar -BaseJar C:/path/to/cadeditor.jar
```

默认从相邻 Oriel-UI-Workspace 的 daily 找最近的基础 jar、runtime-classpath.json 和 Editor-release-test 测试世界。可以通过 `-BaseJar`、`-ClasspathFile`、`-World` 指定。每次复制全新测试世界到独立、唯一的 daily 子目录，运行前检查所有 Minecraft/runClient 进程，有游戏即退出2；不会关闭或修改用户游戏。独立客户端创建前禁用 GLFW 可见性及焦点、取消鼠标捕获；不模拟鼠标键盘。只终止自己启动的超时进程。

默认用 javac 将当前生产源码叠加到基础 jar 的测试副本，编译用 Loom 已加宽访问的 Minecraft jar。探针只在 autotest 目录，永不进入发行 jar。`-UseReleaseJar` 不叠加源码；该模式的证据只属于传入 jar，不能视为当前工作树验收。`-WorldOnly` 只检查12轮世界编辑，用于排障，不能代替全组件验收。

样本按实时物品原型、创造栏、原生方块实体工厂、实时 Codec 结构/默认值/边界试探产生；所有候选先通过真实 Codec。无法合成的组件保留 `unresolved`，不以手写值冒充通过。每个样本在真实打包页面发送 `validate_component` 和 `component_validate`，再通过真实 EditorClient apply、服务端确认和新打开会话读取。SNBT 显式格式避免 JS 数字精度损失；同时保存发送、服务端、重开三份类型 NBT。页面控制器自动化不是控件点击测试，也不证明每种字段值和玩法效果。原型样本可能等于默认值，报告会明确记录来源。

世界路径使用临时箱子、标牌、刷怪笼及固定猪，经过 WorldEditorClient 页面 apply 和重开；比较实际修改字段的 typed NBT，容器比较完整物品 typed NBT。实体/刷怪笼的自主 ticking 字段不视为保存失败。

每次运行日志在 `daily/YYYY-MM-DD/accept/<time-id>/`；完整回执 `run*/acceptance.json`。汇总生成到 `docs/acceptance/`。`COMPLETE` 仅表示运行完所有条目；表内 unresolved、拒绝、超时、相等失败仍是失败，最终退出码1，不能作为发布通过。F28 成功率分母为真正发出的 apply，请同时检查未生成样本数。性能包含页面/tick/轮询开销；暖搜索不混入首次索引构建。

针对失败项可以用 `-OnlyComponents minecraft:custom_data` 重跑（仍同时跑世界路径）。用 `report.ps1 -Receipt <完整回执> -AdditionalReceipt <重跑回执>` 汇总，重跑的组件整组三轮替换旧三轮，保留两个构建与回执来源，避免把不同轮次拼成一次通过。

本工具不调用 Gradle。若需重建基础 jar，须先原子创建 `logs/.gradle.lock.d`，等待占用者释放（最多20分钟），在 finally 删除自己持有的空锁目录；不得删除其他任务的锁。
