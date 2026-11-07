# 主菜单保险库门禁

目标：Minecraft 26.1.2 / Fabric / Java 25 / Oriel 0.11。所有脚本从自身路径定位项目；不修改 Oriel 仓库。

- `pwsh -NoProfile -File tools/vault-menu/test.ps1`：直接 javac 编译本任务拥有的客户端入口和保险库通道源文件；运行真实原版注册表的 `VaultTest`（167项）及独立 `VaultButtonLayoutTest`（97项）。输出 `logs/vault-menu/{compile-main,compile-tests,tests,layout-tests}.log`。
- `pwsh -NoProfile -File tools/vault-menu/build.ps1`：先检测用户 Minecraft 进程，原子取得 `logs/.gradle.lock.d`（最多等待20分钟），运行 `vaultTest`、`vaultButtonLayoutTest` 和完整 `build`。退出时释放锁；完整输出 `logs/vault-menu/gradle-build.log`。共享工作树中其他任务的编译/测试失败也会使完整 build 失败。
- `pwsh -NoProfile -File tools/vault-menu/run.ps1 -UseReleaseJar`：先检测用户游戏；有游戏时返回 `real-client run pending`，不触碰进程。否则把已构建发行 jar 与隔离探针复制到一次性 `daily/YYYY-MM-DD/vault-menu/run-release`，通过 GLFW 提前关闭可见性/聚焦和鼠标捕获，运行隐藏独立客户端，无测试世界，无桌面输入。无 `-UseReleaseJar` 时仅覆盖所拥有的入口/保险库类与语言资源，适合迭代；页面仍来自基础 jar。

隐藏探针验证：实际 TitleScreen 在854×480、1280×720、1920×1080、3840×2160与GUI scale 1..4（遵循原版最小GUI尺寸钳制）的16种布局；向首选位置添加晚注册的模拟模组按钮后重新布局；主菜单按钮打开同一编辑器页面；实际 `oriel.data`；无level/player的全部本地保险库操作；save/give返回UNAVAILABLE；关闭回到原屏幕；在Controls注册的KeyMapping改成B后，旧V不再触发、新B可以触发。主菜单/暂停菜单的纯布局、连续模组按钮以及整屏拥挤隐藏行为另有97项JVM检查。

收据：`daily/YYYY-MM-DD/vault-menu/run[-release]/vault-menu-verification.json`，包含实际请求/响应。完整客户端输出：`daily/YYYY-MM-DD/vault-menu/client.log`。探针、隐藏窗口/禁鼠标Mixin仅装入隔离探针jar，永不进入发行jar。不会读写用户实际保险库或用户游戏目录。

暂停菜单在真实世界内的点击与 `/cadeditor vault` 命令仍需另行实机验证；这里的无世界探针专门验证主菜单路径和通道，而不是前端页面内容验收。
