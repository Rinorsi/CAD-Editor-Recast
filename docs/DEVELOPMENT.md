# 开发说明

面向开发者：热更新、Java 页面控制器与动效约定、偏好与剪贴板桥。宿主（Java）与写回合同见 [`README-host.md`](../README-host.md)，注册表通道见 [`registry-contract.md`](registry-contract.md)，测试见 [`TESTING.md`](TESTING.md)。

## 仓库布局与工作区

- 构建输出、运行目录、日志、截图写在 `../Oriel-UI-Workspace/daily/<日期>/`（`fabric/build.gradle`、`stonecutter.gradle` 里是这个相对路径），所以仓库必须与 `Oriel-UI-Workspace` 同级。内部评估报告、阶段交接、状态审计也放在工作区的 `planning/cad-editor-recast/`，不进仓库。
- `tools/gw.sh` 转交给 `Oriel-UI-Workspace/tools/gw.sh`，由它处理 JDK 与下载代理。作者只验证过这条路径；没有工作区时直接用 `./gradlew` 理论上可行但未验证，构建输出会写到上级目录的 `Oriel-UI-Workspace/daily/…`（Gradle 自动创建）。
- Oriel UI 的 jar 获取：源码仓库 <https://github.com/Rinorsi/Oriel-UI>（目前私有）；维护者本机的发布包在 `Oriel-UI-Workspace/dist/oriel-0.11.0-<日期>/`，把六个对应加载器 / 游戏版本的 jar 复制到本仓库 libs/；版本矩阵、构建和 smoke 入口见 [MULTIVERSION.md](MULTIVERSION.md)。
- 来源：CAD Editor 是作者自己的项目，本项目是它的换代重写；界面引擎 Oriel UI 基于 Vellum（MIT，Max Leiter），是外部必需依赖，声明见 `NOTICE`。

## 发布包与运行

Oriel 发布包的维护者副本在 `../Oriel-UI-Workspace/dist/oriel-0.11.0-20261108/`（各目标使用对应 jar）。依赖范围：`>=0.11.0 <0.12.0`。页面随 CAD Editor jar 打包，真实入口为 `cadeditor:ui/index.html`。

客户端运行目录：`../Oriel-UI-Workspace/daily/<今天>/run/editor-mod-client/`。Loom 加载 CAD Editor 开发模组，并安装同一份 Oriel 发布 jar；不要再把 CAD Editor jar 重复放进这个运行目录。普通玩家安装时 mods 里放 CAD Editor、Oriel 与 Fabric API。

修改使用原版 `ItemStack` / `DataComponentPatch` Codec，不注册物品私有组件。创造模式写回走原版创造槽位包，服务端安装本模组时还会校验槽位和会话；非创造模式需要服务端安装并授予权限。原版数据的序列化测试通过，不等于卸载后的游戏验收通过。

`tools/oriel.sh`、`tools/shot.sh`、`tools/preview/shot.sh` 是需要 Oriel 源码（`../Oriel-UI`）的开发脚本，不属于“只有发布 jar”的接入路径；日常启动使用独立 Loom 入口（根目录 `启动物品工坊预览.bat`）。

## 热更新：只使用 Oriel 0.11 原生 dev-sources

在游戏目录的 `config/oriel/dev-sources.properties` 写一行：

```properties
cadeditor=<本仓库>/common/src/main/resources/assets/cadeditor
```

值指向 `assets/cadeditor`，也可写它的父目录 `assets`。配置后重启一次游戏，手持物品按 I 或 `/cade`，真实页面始终是 `cadeditor:ui/index.html`；保存 CSS/JS 即可刷新，不需要启动器、复制页面或监视脚本。启动日志应出现 `Oriel: dev source: 'cadeditor:' pages are read from …`。这是 Oriel 0.11 的原生能力，**不要把开发机路径配置随模组分发给玩家**。

- 缺少的源码文件回退到 jar。CSS 只更新样式，不重建 Document / 控制器；HTML、JS 和页面读取的 JSON 整页重建，控制器恢复已保存的草稿、分页、筛选和折叠状态。未写入 Store 的输入文字、光标及临时弹窗不保证恢复。
- PNG / 封面仍取自 jar，换图须重新构建；翻译、字体、纹理用 F3+T，不能承诺热更新；Java 仍需重编，结构变化可能需要重启。
- 运行后才新建的文件不会主动触发刷新，可保存已有文件或重新开页。
- `tools/preview/start.ps1` 只原子更新运行目录里上述配置（保留其他命名空间）并启动游戏，不复制页面、不开监视进程。Loom 另保留官方 `-Doriel.sourceRoot=<仓库>/common`，用于运行目录在工程外的情况。
- 旧的 `editor.devPage`、`editor-dev.json`、`editor_dev:`、`oriel_mine` 真实编辑器分支已移除，旧配置不再读取。`tools/preview/legacy/` 保留已废弃的同步脚本备份，其中的夹具仅用于测试“真实宿主 apply 不能被覆盖”，不进入游戏或发布 jar。

## 依赖说明：页面控制器与动效

Oriel 锁定 `>=0.11.0 <0.12.0`。`EditorPageController` 使用发布 jar 中的 `PageControllers`、`Shell`、`Motion`；这些 engine / kit 接口**不在下游稳定 API 承诺内**，升级 minor 版本前须重新验证。不需要额外的 engine jar 或库源码。

控制器只注册正式的 `cadeditor:ui/index.html`，每份 Document 仅一次 `Shell.setup`。dev-sources 不改变 URL，因此沿用同一个控制器与真实宿主写回。

动态事件约定（在 Document 上监听，内容反复重绘仍有效）：

- **指示条**：指示条本身设置 `data-ed-indicator` 为选中 tab 的唯一 CSS 选择器；父容器自行定位，指示条自行设定位及 `left` / `width` 的过渡。布局可读后在 document 派发 `CustomEvent("ed:tabs")`。`Motion.indicator` 的第一个参数是指示条本身，不是整个分页栏。
- **折叠**：可折叠内容节点设置 `data-ed-open="true"` 或 `"false"`，节点自己派发 `CustomEvent("ed:toggle", {bubbles:true})`。节点须保留在 DOM 且可测量，不能先 `display:none` 或删除。逻辑折叠状态继续由 JS 维护。
- **数字**：数字节点设 `data-ed-from`、`data-ed-to`、`data-ed-ms`（1–3000）、`data-ed-suffix`，自己派发 `CustomEvent("ed:count", {bubbles:true})`。无控制器时直接写最终值；有控制器时动画只改显示、不改真实业务值。
- 检查 `document.documentElement` 的 `data-editor-controller="ready"` 可判断增强已就绪；首次 attach 在页面脚本之后，初始化动效放 `DOMContentLoaded`，动态重绘后建议 `requestAnimationFrame` 再派发。不要重复安装 Shell / Widgets。

热更新时 CSS-only 的 `Document.reloadStyles()` 保留 Document 和控制器；HTML / JS 的完整重载创建新的 Document 和控制器，`saveState` / `restoreState` 恢复草稿。保存内容：Store 的物品 / 草稿 / 历史、当前索引、UI 的分页 / 筛选等非 DOM 字段、`UIOpen` 折叠状态。只恢复到同一槽位 / 会话 token；等待应用回执时不备份草稿，优先宿主数据；最大 2MB，不落盘。

## 偏好与剪贴板

界面偏好保存在 `config/cadeditor-ui.json`：`heroView` 仅 `2d` / `3d`；`windowMax`、`uiSound`、`stageOpen`、`statsOpen` 仅布尔；`heroWidth` 为 100–320 整数；`winW` 为 320–1600 整数；`winH` 为 200–1000 整数。读取和页面 `prefs` 消息共用严格白名单，不把字符串或布尔转换成数字。同一键最后一次变化后 500ms 合并落盘；页面关闭、断开世界和客户端退出时立即提交未写入值；用同目录临时文件原子替换，失败保留待写值并延迟重试。

宿主通过 `hostClip: true` 提供复制桥：页面发送 `oriel.send('clipboard', {text})`，只接受最多 32767 字符的字符串，由客户端主线程写入玩家剪贴板，不读取剪贴板。只在对应编辑器画面仍打开时有效，跨重开共用每滚动 1 秒最多 4 次的限额。

## 本地预览与截图

`tools/preview/shot.sh` 无头渲染页面（不启动游戏）。依赖：`../Oriel-UI` 已构建的预览器、`../Oriel-UI-Workspace/tools/new-day.sh`。输出到 `../Oriel-UI-Workspace/daily/<日期>/screenshots/`。用法见脚本头部注释。

`dev/browser/mock.js` 与 `tools/extract-mc-icons.mjs` 用于“浏览器预览”：图标图集由脚本从**本机** Minecraft 资源抽取到 `dev/browser/mc/`（Mojang 资源，已被 `.gitignore` 忽略，不进仓库、不进游戏）。

## MCTest 开发期客户端控制

MCTest 让 agent 通过 MCP / 本机 WebSocket 驱动真实 Minecraft 客户端。
仅通过 Loom `localRuntime` 加载，关闭传递依赖，不进入发布 jar 或 POM；本工程另从 `runServer` 类路径排除它。
启动：`./gradlew :fabric:26.1:runClient`（Windows 可使用 `./gradlew.bat`）。
默认启用，控制地址为 `127.0.0.1:25599`；`-PmcTest=false` 从开发运行类路径移除 MCTest，`-PmcTestPort=25600` 为客户端添加 `-Dmctest.port=25600`（不改变启停状态）。例如 `./gradlew :fabric:26.1:runClient -PmcTestPort=25600`。
日常 `启动物品工坊预览.bat` / `tools/preview/start.ps1` 固定传入 `-PmcTest=false`，不开控制端口；自动化 `tools/live-test` 不传该开关，保持默认启用。
不要把控制端口转发到外网。构建通过不代表客户端交互已验收。

## 版本与分发

当前版本：<!-- editor-version -->0.99.2<!-- /editor-version -->。版本唯一来源是根目录 gradle.properties；使用 tools/bump-version.ps1 的 -DryRun 先预览同步，再正式更新。不要手改模组元数据版本模板，不重写历史验收记录中的旧版本。六目标构建、SHA256、tag 发布与可选内存采样见 [RELEASE.md](RELEASE.md)。
