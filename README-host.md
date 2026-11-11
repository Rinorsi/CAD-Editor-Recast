> 当前 0.99.5 构建默认内嵌 Oriel 0.14.0 瘦包，不需另装 Oriel；Fabric API 仍需安装。开发客户端保持源码资源热更新。下文 Oriel 0.11 联机记录属于旧产物，不能代替当前固定包的验收。

# CAD Editor 宿主说明（Java 端）

当前目标为 Minecraft **26.1.2 / 26.2 / 26.3，Fabric / NeoForge**，Java 25；具体前置与目标文件名见[根 README](README.md)。Oriel UI 0.11.x 是独立必需依赖，使用匹配目标的发布包；普通构建不需要 Oriel 源码或额外 engine jar。下方早期运行示例以 Fabric 26.1.2 为例。

## 构建

在此目录执行 `bash tools/gw.sh :fabric:26.1:build --no-problems-report`。包装脚本使用工作区已配置的 JDK/网络方案；不要直连 Gradle 下载。Gradle wrapper 与当前 Oriel 工程一致。

构建产物、测试结果位于 `../Oriel-UI-Workspace/daily/<当天>/scratch/editor-mod/build/`，运行目录位于当天 `run/editor-mod-client` 或 `run/editor-mod-server`。`codecTest` 是真实原版 Codec 的纯 Java 测试，不启动 Minecraft 客户端/服务端。

## 页面与独立运行

页面源码位于 `common/src/main/resources/assets/cadeditor/ui/`，随 Editor jar 打包；不带浏览器 mock、图集或预览夹具。`I` 与 `/cade` 使用同一个真实物品打开流程。页面是否符合用户审美仍由用户验收，自动化验证不代替批准。

双击根目录启动器会用 Editor 自己的 `:fabric:26.1:runClient` 启动。模板中心入口已改为 `/oriel showcase templates` →「我的页面」；其中 item-editor 是注入演示夹具的副本，不写真实物品。真实入口无需模板中心。

## 入口与写入合同

- 默认 **I**，在原版键位设置「物品栏」分类可改；备用客户端命令 **/cade**。
- 悬停已有物品优先，否则取主手；创造物品目录不是持有槽位。换物品需关闭重开。
- 玩家背包创造模式：先校验，再发原版创造槽位包；双端安装时由后续服务端回读确认。
- 原版创造槽位包不会保证向发送客户端回显。收到服务端 `saved` 确认后才同步本地创造物品栏，避免出现界面说已保存但手持物品名称仍旧的情况。
- 容器物品、非创造玩家：双端安装时走服务端会话。核对玩家状态、会话、槽位、旧物品、容器距离/有效性、槽位接纳规则、数量和组件 Codec。
- 只装客户端：创造模式仍走原版玩家背包写回。非创造模式仅支持自己的普通背包 0..35（第1～36格），主手固定为打开页面时的槽；复用现有页面，服务器授权原版 execute/item 命令，缺少命令立即提示不可用或权限不足。必须收到同步才显示成功，结果未知保留草稿、不自动重发。装备、副手、容器、世界/其他玩家需要服务端模组；保险库取出复用命令写回，仅放入自己主背包空槽。
- 命令写回用原版部分匹配条件保护已有字段，不能提供完整服务端 CAS。少量反馈可能由原版发给本人、其他 OP 并记录到控制台；普通非 OP 不走该管理员广播，插件额外转发未知。不会改 gamerule 或吞其他聊天。长度/数量/组件及原版传输非法字符均在发送前检查，无法传输的物品保留草稿并明确拒绝；详见 [client-only-hotbar.md](docs/client-only-hotbar.md)。
- 只装客户端时，自身游戏模式、经验等级还可在真实原版查询权限及对应命令权限均可用时单项修改；必须回查确认，超时保留草稿并提示未知。其它自身字段的具体限制见[自身命令合同](docs/self-player-command-contract.md)。
- 配置 `config/cadeditor.json` 的旧 `permissionLevel` / `creativeOnly` 字段继续读取以兼容旧文件；当前完整服务端写入规则为创造或实时 gamemaster，玩家编辑另需 gamemaster，旧字段不覆盖该规则。见[权限矩阵](docs/permission-matrix.md)。
- 不注册私有物品组件。未编辑的覆盖组件从原栈保留实际值，避免 JSON 往返改变 NBT 数值/数组类型。无法编码的组件会明确阻止打开，保留原物品。
- 页面提交上限受 Oriel 默认 8192 字符限制，模组网络上限 32767 字符。超限不静默保存。

客户端需要 Editor 页面与 Oriel；服务端选装，用于完整写入能力。仅服务端安装时没有可操作的前端。安装矩阵与当前功能范围见根 README；本文件末尾的早期验证记录仅说明当时实际覆盖的范围。

完整后端安装注意：Fabric 26.1.2 + 外置 Oriel 0.11 的真实 LAN 中，无 Oriel 的客户端被注册表同步拒绝（缺少两个 `oriel` 注册表项）。房主安装完整后端后，普通参与者也应装匹配 Oriel；不能据“Editor 服务端选装”推导出该服务器一定允许无 Oriel 客户端连接。房主无 Editor/Oriel 的客户端单装场景已独立实测，结果不受此限制影响。

## 游戏验证步骤（用户手动验收）

1. 安装匹配版本的 Fabric API、Oriel、Editor，进入专用测试创造世界。
2. 主手拿钻石剑，按 I 或 `/cade`，修改名称并应用，等明确成功回执。
3. 关闭后重新打开物品，确认名称；取消另一次修改，确认原物品不变。
4. 测试背包悬停、容器悬停、权限拒绝、编辑期间物品改变、无效数量/组件。
5. 保存并退出测试世界，移除 Editor 后重新进入同一世界，确认原版名称仍在。截图与日志写到工作区当天目录。

2026-11-06 已使用独立发布 jar 完成后台自动验证：模板中心列出并打开 item-editor；`/cade` → 页面 JS 修改名称 → 原页面 applyToGame → 宿主 → 原版槽位包 → 服务端确认 → 客户端物品；保存退出后移除 Editor 和 Oriel，再进同一世界读回同名钻石剑。该验证保留 Fabric API 和独立测试探针，没有加载 Editor/Oriel；不是物理按 I 或人工审美验收，也没有覆盖多人、权限拒绝、容器及全部字段。

开发探针位于 `fabric/src/autotest/java/dev/rinorsi/editor/probe/`，单独构建，**不会进入 Editor 发行 jar**。先执行 `bash tools/gw.sh :fabric:26.1:autotestJar :fabric:26.1:exportAutotestClasspath --no-problems-report`，再用 PowerShell 7 执行 `pwsh -NoProfile -File tools/autotest/run.ps1 -Mode server`（或 `edit`、`vanilla`）。客户端测试要求当天已存在 `run/editor-mod-client/saves/Editor-release-test/` 测试世界；不自动创建或触碰用户其他世界。

探针只在 `-Deditor.autotest=edit|vanilla` 时运行；测试 jar 中的专用 Mixin 阻止游戏抓取鼠标。脚本只将自己的测试窗口移到屏幕外（不激活），使用游戏内部 API 交互和截图，保存后自动退出。`vanilla` 会卸载测试目录中的 Editor/Oriel；日常 Loom 运行目录独立，不受影响。所有结果和截图在当天 `run/editor-autotest-client/`，完整日志在当天 `logs/editor-autotest-*.log`。库发布包不含无头预览器，因此没有绕过发布包限制去调用源码版截图工具。

## 会话恢复（当前合同）

详见 [docs/edit-sessions.md](docs/edit-sessions.md)：移除30分钟硬超时，客户端Java宿主自动补原物品baseline；缓存丢失时只在当前物品仍与基线一致时恢复，保留ItemStack.matches保护。confirm丢缓存时只确认匹配commitBaseline的已写物品，不重写。slot按kind/index/menuId比较；rejected新增code便于前端保留草稿并显示对应操作。必须更新并重启两端Java模组才能获得完整恢复能力。前述Oriel 0.10和复制夹具说明已过时，以根README的Oriel 0.11原生dev-sources方式为准。
