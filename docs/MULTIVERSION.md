# 多版本、多加载器架构（目标设计）

目标：**同一份源码**，一个命令导出 Fabric / NeoForge × 26.1.2 / 26.2 / 26.3 共六个 jar。
一个 bug 只在一处修，不在三个版本里各改一遍。

## 参照

Oriel 自己就是这个结构，照着做，不要另发明：
`C:\Storage\Minecraft\project\Mods\Oriel-UI`（`settings.gradle`、`stonecutter.gradle`、`stonecutter.properties.toml`、
`build-logic/`、`common/`、`fabric/`、`neoforge/`）。Oriel 发行包（含六个目标的 jar）在
`C:\Storage\Minecraft\project\Mods\Oriel-UI-Workspace\dist\oriel-0.11.0-20261108\`。

## 目录

```
common/            与加载器无关的全部代码和资源（现在的 fabric/src/main 里绝大部分搬到这里）
  src/main/java    编辑器逻辑：schema、注册表、世界编辑、保险库、网络载荷定义
  src/main/resources  assets/cadeditor/ui/**（HTML/JS/CSS）、语言文件、access widener
  src/test, src/testFixtures, src/smoke
fabric/            只放 Fabric 入口、事件、网络注册、按键、命令的薄层
neoforge/          只放 NeoForge 入口，同上
build-logic/       共用的 Gradle 约定插件（multiloader-common / -loader / -publish）
stonecutter.properties.toml   每个游戏版本的 MC / 加载器 / API / Oriel 版本
```

规则：
1. **业务代码只写一份**，在 `common`。`fabric`、`neoforge` 里不允许出现业务逻辑，只允许把加载器的事件、网络、按键、
   命令注册接到 `common` 的接口上。
2. `common` 里**不得 import `net.fabricmc.*` 或 `net.neoforged.*`**。需要加载器能力时在 `common` 定义一个小接口
   （例如 `Platform`：是否装了某模组、配置目录、发送网络包、注册按键），由两个加载器各实现一次。
3. 游戏版本之间的差异**只用 Stonecutter**（`stonecutter.parameters` 里的 `replacements` 优先，其次 `//? if >=26.2` 条件注释），
   每处差异旁边写一行注释说明是哪个版本改了什么。源码以 vcs 版本（最新，26.3）为准。
4. 每个版本的 MC / 加载器 / API / Oriel jar 版本写在 `stonecutter.properties.toml`，不散落在各 build.gradle。
5. Oriel 依赖：26.1 / 26.2 / 26.3 分别用对应 `oriel-<loader>-<版本>-0.11.0.jar`（放 `libs/`，文件名带版本）。

## 构建与输出

- `./gradlew build` 一次构建全部六个目标；单个目标 `:fabric:26.2:build`。
- jar 命名：`cadeditor-<loader>-<mc>-<版本>.jar`。
- 发行目录：`Oriel-UI-Workspace\dist\editor-<版本>-<日期>\`，含六个 jar、`SHA256SUMS.txt`、README。
- 构建输出仍放 `Oriel-UI-Workspace\daily\<日期>\scratch\...`，不污染仓库。

## 验收

- 现有全套验收（`tools/accept-all`、`tools/ui-check-all.sh`、codecVerification、autotest、world 门禁）必须在
  **Fabric 26.1.2 上与改造前一样全过**，这是回归基线。
- 其余五个目标至少要：编译通过、`codecVerification` 通过、能起隐藏客户端并通过 smoke（打开编辑器、改一个物品并保存）。
- 不同版本的差异要在文档里列表：`docs/MULTIVERSION.md` 末尾「版本差异清单」。

## 版本差异清单

以下均由解析到的 Minecraft / NeoForge jar、实际 Codec 与测试验证，版本号沿用 Oriel 0.11.0 的矩阵。

| # | 版本 | 旧写法 / 行为 | 新写法 / 处理 |
|---|---|---|---|
| 1 | 全部 | Fabric 业务直接注册事件和载荷 | common 的 Platform / ClientPlatform 接口；Fabric、NeoForge ServiceLoader 薄实现 |
| 2 | 全部 | Fabric configDir、模组查询、tag 翻译 | 平台实现调用各加载器官方 API；服务端接口不引用客户端类型 |
| 3 | 26.2+ | EntityType 常量 | EntityTypes；可逆 replacement |
| 4 | 26.2+ | BlockEntityType 常量 | BlockEntityTypes；标记 import 与可逆 replacement |
| 5 | 26.2+ | Minecraft.screen / setScreen / gui.getChat | gui.screen() / gui.setScreen / gui.hud.getChat；replacement |
| 6 | 26.2+ | advancements.criterion | advancements.predicates；replacement |
| 7 | 26.2+ | monster.Slime，岩浆怪继承 Slime | cubemob 包；大小探测用 AbstractCubeMob 条件分支，包含岩浆怪 |
| 8 | 26.2+ | isInstantenous | isInstantaneous；replacement |
| 9 | 26.2+ | WHITE_BANNER 常量 | BANNER.white() 颜色集合；replacement |
| 10 | 26.2+ | ChatFormatting 文本颜色 | 从 TextColor 真实公开颜色字段枚举；不复制颜色表 |
| 11 | 26.3 | VanillaRegistries.createLookup | createWorldLookup；replacement |
| 12 | 26.3 | resources 的 HolderSetCodec / RegistryFileCodec | core.registries.codec；replacement，schema 反射图同步识别新包 |
| 13 | 26.3 | EnderMan / setInvulnerable | Enderman / setPermanentlyInvulnerable；replacement |
| 14 | 26.3 | DataComponentPatch.entrySet | 公共 split() 适配器保留添加、移除两种 patch |
| 15 | 26.3 | 容器 copyStream / Bundle Mutable 构造 | itemCopies / asMutable；ContainerCopies 条件实现 |
| 16 | 26.3 | SignText.DIRECT_CODEC、招牌可点击权限 | SignText.CODEC、SignTextSlot.FRONT/BACK；replacement / 条件分支 |
| 17 | 26.3 | Recipe.CODEC 写 recipe 内容 | DIRECT_CODEC；replacement |
| 18 | 26.3 | InputConstants.isKeyDown(window,key)、GLFW 键常量 | isKeyDown(key)；键常量统一使用 InputConstants |
| 19 | 26.3 | map_color、swing_animation、MaterialAssetGroup | 删除的组件不再导出；trim material 以 palette_id 资源标识符校验 |
| 20 | 26.2 / 26.3 | 测试道具 107 持久组件 | 108 / 119；保留基线 45 件独立清单；新增项取真实物品原型或运行时 Codec schema 生成非默认样例，失败即拒绝发放 |
| 21 | 26.3 | 26.1.2 fixture wire 数据 | 使用原版 DataFixer 从实际 data version 4790 迁移，仍验证每个声称组件非默认及完整 typed NBT 往返 |
| 22 | 26.3 | BlockState 的 Name/Properties 对象 | 原版 id/properties 或字符串；BlockStateWire 保持 UI 合同，持久化使用当前原版 Codec |
| 23 | 26.3 | 熔炉 short 计时、酿造 short/byte | 真实 saveAdditional 改为 int；BlockViews 条件分支，保留严格类型检查 |
| 24 | 26.3 | GLFW 隐藏窗口 | SDL 创建前 HIDDEN / NOT_FOCUSABLE flags；独立 smoke mixin，禁止鼠标捕获 |
| 25 | 26.3 | 测试注册表复制所有对象引用 | bootstrap 的 record 别名须复制为不同 identity；仅测试夹具按 record 实际构造器复制 |
| 26 | 全部 | schema 单行预留固定 1024 字符 | 按真实分页信封长度预留；最大 24000 字符不变，不截断字段、不返回空页 |
| 27 | 全部 | 原始源码直接用于基线 javac 探针 | baseline-sources.ps1 按活动版本选择原始或 Stonecutter 生成的 26.1 源码；先运行 :fabric:26.1:build / autotestClasses，避免切换版本后误读旧生成物 |
| 28 | NeoForge | 直接 JavaExec 启动 patched game 测试 | FML 未启动时 patched 类不可独立引导；Codec JVM 使用同版本 common NeoForm vanilla runtime，生产编译与客户端 smoke 使用真实 NeoForge |
| 29 | NeoForge | 模组构造时立即初始化 HUD | 此时 Minecraft singleton 尚未建立；通过 ClientStartedEvent / Fabric CLIENT_STARTED 平台回调初始化 HUD |
| 30 | 26.2 / NeoForge | GLFW 创建时隐藏即足够 | 26.2 Minecraft 构造器额外 glfwShowWindow；测试 mixin 拦截它。NeoForge 独立测试 config/fml.toml 关闭 earlyWindowControl，避免加载器先打开窗口；26.3 另拦截 EarlyWindowHandoff 的显示调用 |

## 实施约定

- VCS 活动版本固定 26.3；开发切换后提交前恢复 26.3。原生产文件通过 git mv 迁移到 common。
- Fabric 原有自动化探针包含 Fabric 入口/Mixin，保留 fabric/src/autotest；公共 test/testFixtures 在 common；matrix smoke 在 common/src/smoke，独立测试 jar，不进入发行包。
- tools/build-all.ps1 执行根 build（六目标完整 check），收集六个发行 jar 并写 SHA256SUMS；不会把测试 jar 放进 dist。
- tools/smoke-matrix.ps1 使用独立世界副本、隐藏窗口和游戏内部调用验证打开→页面发送保存→服务端物品→关闭重开；每目标输出 matrix-smoke.json，禁止操作外部输入。
- 各版本 schema 与数值范围快照独立存储；-PwriteSchemaSnapshot=true 只用于审阅过的显式更新，普通 build 不自动改快照。
- WorldEditTest 的 26.3 汇总证据超过单消息上限，逐目标验证真实传输往返；生产 192 KiB 展开上限保持不变。
- Gradle 产物、测试运行目录、日志保持 daily/scratch 与 daily/logs；Stonecutter 的源码生成目录沿用 Oriel 默认的 versions/<版本>/build/generated，已被 gitignore 排除。



## 验证记录（2026-11-08）

- 架构里程碑 ba7e422：六目标生产源码编译 / jar 打包；Fabric 26.1.2 完整 build、autotestClasses、exportAutotestClasspath 通过。日志：daily/2026-11-08/logs/editor-baseline-and-jars.log（同次命令的新版本夹具失败已在后续修正，不能把该命令整体称为通过）。
- 新版及 NeoForge 的五目标隐藏客户端 smoke 全部通过：daily/2026-11-08/logs/editor-smoke-204031/results.json，各目标目录有 matrix-smoke.json、stdout.log、stderr.log。每个回执包含 hidden_unfocused、server_mod_channel、server_equal、reopen_equal，均为 true。
- 发行 jar 不含 probe / smoke 类，包含 UI 和平台 services：daily/2026-11-08/logs/editor-jar-layout.json。
- UI 全门禁通过：daily/2026-11-08/logs/editor-final-ui.log；PowerShell 解析通过，基线 acceptance standalone javac 通过：editor-accept-compile-only2.log。
- 六目标最终 build/check（含 codecVerification）全部通过：tools/build-all.ps1，BUILD SUCCESSFUL in 9m 33s，214 actionable tasks。完整日志在 Oriel-UI-Workspace/daily/2026-11-08/logs/editor-matrix/build-all.log，脚本回执 editor-distribution.log。
- 发行目录：Oriel-UI-Workspace/dist/editor-0.99.2-20261108/；六个 cadeditor-<loader>-<mc>-0.99.2.jar、SHA256SUMS.txt、README.md。editor-jar-layout.json 已按发行目录重新校验全部六项 SHA256、UI、平台 services、metadata 和测试探针隔离。
- 完整 Fabric 基线实机验收正在收尾；以上 smoke 不替代完整基线门禁或人工视觉验收。
