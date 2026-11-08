# Editor 最终门禁与保留客户端

完整门禁：

```powershell
./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:build
node tools/ui-world-test.cjs
node tools/ui-contract-test.cjs
node tools/ui-compact-test.cjs
node tools/ui-nbt-test.cjs
node tools/ui-search-test.cjs
```

build/check 已包含 componentSchemaTest、entitySchemaTest、entitySchemaServerTest、tooltipTest、worldEditTest 及现有回归。

launch.init.gradle 仅添加测试 jar 与可选 runClient 参数，不把自动化/Mixin 打入发行 jar。先编译探针：

```powershell
./gradlew.bat --console=plain -I tools/final-gate/launch.init.gradle :fabric:26.1:finalGateProbeJar
```

launch.ps1 接受有效单人世界目录，复制到全新 Editor-final-gate-时间戳 目录，不打开或改写源世界；启动本工程正常 runClient，读取当日构建输出与最新界面资源。新副本中切创造、放猫刷怪蛋到主手，执行真正的 cade，向实际页面发送 entity_schema minecraft:cat、component_schema minecraft:food、tooltip 请求。回执写 logs/final-gate/client-receipt.json，完整启动日志 runClient.log，准备信息 client-preparation.json。

运行时用独立测试mod在窗口创建前禁显示/禁焦点/禁鼠标捕获，静音；通过后结束一次性探针并恢复用户主动聚焦时的正常鼠标行为，**不关闭客户端**。可以用 Windows 的 SW_SHOWNOACTIVATE + SWP_NOACTIVATE 显示窗口，禁止 SetForegroundWindow 或模拟点击。失败也保留客户端，回执明确FAILED；不做循环重启。

启动脚本应通过 Start-Process pwsh -WindowStyle Hidden 运行，避免终端抢焦点。锁 logs/.gradle.lock.d 在 runClient 整个 Gradle 进程存活期保留，正常关闭后释放；其他 Oriel-UI 实例与 Editor 无关，不拦截、不终止。

测试 jar 只供这次验证使用。后续不带 finalGateWorld 的普通 runClient 会自动将 mods/cadeditor-final-gate-probe.jar 移入本地隔离目录；其来源是本工具明确生成的测试产物，不作为常驻游戏功能。
