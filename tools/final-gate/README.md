# Editor 最终门禁与保留客户端

完整门禁：

```powershell
./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:build
```

build/check 已包含 componentSchemaTest、entitySchemaTest、entitySchemaServerTest、tooltipTest、worldEditTest 及现有回归。

界面与自身玩家契约统一使用现有入口（仓库根目录，Git Bash / Bash）：

~~~bash
# java 必须在 PATH 中指向 JDK 25；仅设置 JAVA_HOME 不会替换 Node 子进程使用的 java。
export JAVA_HOME=/path/to/jdk-25
export PATH="$JAVA_HOME/bin:$PATH"
bash tools/ui-check-all.sh ../Oriel-UI-Workspace/daily/YYYY-MM-DD/logs/ui-all
~~~

入口保留已有全部 UI、快照和 JS 语法检查，增加以下六项：

| 检查 | 运行方式 / 范围 |
| --- | --- |
| ui-self-player-capabilities-test.cjs | 纯 Node VM：提前能力提示、允许字段与草稿保留 |
| self-player-document-test.cjs | Node 调用 JDK：提取生产 DocumentBinding / 调度方法，验证重载、晚回执及只读回查；不启动 Minecraft |
| ui-self-player-next-test.cjs | 纯 Node：下一批自身玩家字段 UI 契约 |
| self-player-next-codec-test.cjs | Node 调用 JDK：提取生产命令计划代码，验证解析、范围与命令生成；不等同完整六目标编译 |
| ui-self-player-inflight-test.cjs | 纯 Node：在途提交与后续草稿隔离 |
| ui-self-player-permission-hints-test.cjs | 纯 Node：无权限和不可用字段的提前提示 |

第一个参数指定完整日志目录，也可使用 UI_CHECK_LOG_DIR；不指定仍写 /tmp。每项完整输出保存在 ck-脚本名.log，JS 语法输出为 ck-ui-syntax.log。任一失败都使最终退出码为 1，缺少脚本同样失败，不能静默跳过。

新增脚本及对应生产适配尚未整合时，统一入口只算准备就绪，不能声称整组门禁通过。需等冻结补丁整合后实际运行；shell 语法检查、独立候选脚本通过或旧批次结果均不能替代它，也不能替代真实 LAN 验收。

launch.init.gradle 仅添加测试 jar 与可选 runClient 参数，不把自动化/Mixin 打入发行 jar。先编译探针：

```powershell
./gradlew.bat --console=plain -I tools/final-gate/launch.init.gradle :fabric:26.1:finalGateProbeJar
```

launch.ps1 接受有效单人世界目录，复制到全新 Editor-final-gate-时间戳 目录，不打开或改写源世界；启动本工程正常 runClient，读取当日构建输出与最新界面资源。新副本中切创造、放猫刷怪蛋到主手，执行真正的 cade，向实际页面发送 entity_schema minecraft:cat、component_schema minecraft:food、tooltip 请求。回执写 logs/final-gate/client-receipt.json，完整启动日志 runClient.log，准备信息 client-preparation.json。

运行时用独立测试mod在窗口创建前禁显示/禁焦点/禁鼠标捕获，静音；通过后结束一次性探针并恢复用户主动聚焦时的正常鼠标行为，**不关闭客户端**。可以用 Windows 的 SW_SHOWNOACTIVATE + SWP_NOACTIVATE 显示窗口，禁止 SetForegroundWindow 或模拟点击。失败也保留客户端，回执明确FAILED；不做循环重启。

启动脚本应通过 Start-Process pwsh -WindowStyle Hidden 运行，避免终端抢焦点。锁 logs/.gradle.lock.d 在 runClient 整个 Gradle 进程存活期保留，正常关闭后释放；其他 Oriel-UI 实例与 Editor 无关，不拦截、不终止。

测试 jar 只供这次验证使用。后续不带 finalGateWorld 的普通 runClient 会自动将 mods/cadeditor-final-gate-probe.jar 移入本地隔离目录；其来源是本工具明确生成的测试产物，不作为常驻游戏功能。
