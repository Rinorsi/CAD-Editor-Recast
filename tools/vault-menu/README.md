# 保险库快捷键门禁

Minecraft 26.1.2 / Fabric / Java 25 / Oriel 0.11。仅保留原版控制设置可改的 O 快捷键和 /cadeditor vault；菜单不添加保险库按钮。

- test.ps1：完整主源与测试源 javac，运行 VaultTest 与 EditDispatchTest；日志 logs/world-player。包含两项按键注册、I/O 默认值、语言键与无按钮注入断言。
- build.ps1：原子取得 logs/.gradle.lock.d（最多20分钟），运行 vaultTest 与完整 build；日志 logs/vault-menu/gradle-build.log。不会启动客户端。
- run.ps1 -UseReleaseJar：先检测用户游戏，正在运行则记录进程ID并跳过。否则使用独立隐藏客户端和隔离游戏目录，不加载世界、不使用桌面输入。O 菜单键盘事件打开 mode:vault 页面，关闭返回原主菜单；改键 B 后旧 O 失效；Ctrl/Alt/Shift 组合不触发；另验证 VaultClient.open() 打开与返回。无 -UseReleaseJar 时先编译当前主源并覆盖测试副本。

隐藏探针保留无世界的本机保险库操作、save/give 返回 UNAVAILABLE、mode/world/stack 与关闭回原界面的断言。收据 daily/YYYY-MM-DD/vault-menu/run[-release]/vault-menu-verification.json，日志同级 client.log。仅更新/编译探针不代表完成实机验证。

暂停菜单的真实世界快捷键、游戏内组合键与命令仍需专项实机验收。不读写用户保险库或现有游戏目录，不修改 Oriel 仓库。
