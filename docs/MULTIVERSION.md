> 当前构建配置（<!-- editor-version -->0.99.7<!-- /editor-version -->）：六目标使用 Oriel 0.15.0 瘦包 Maven 工件；默认 Jar-in-Jar，`-PorielEmbedded=false` 生成外部依赖版。开发热更新仍使用官方 sourceRoot/dev-sources。下方历史验收按原版本和产物记录，不代表当前包已实测。

# 多版本、多加载器架构

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
5. Oriel 依赖：每个目标使用对应 `dev.oriel:oriel-<loader>-<mc>:0.15.0` 瘦包，默认从 `libs/oriel-maven/` 解析，可用 `-PorielRepository=<目录>` 指定已核验的 Maven 来源。

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
| 31 | 多模块构建 | 初始化脚本默认只作用于主构建 | Gradle -I 同时作用于 included build-logic；六个探针 init 脚本用 findProject 检查目标存在后才配置，避免初始化失败 |
| 32 | 26.1 / 26.2+ | BlockEntityType 的二参数构造器及 supplier 在 26.1 非公开，26.2 起公开 | testFixtures 用 Stonecutter：26.1 反射访问实际私有构造器，26.2+ 调用公开构造器；生产统一使用注册表中类型的 create/isValid，无运行时版本分派、无 access widening |
| 33 | 26.1.2 / 26.2 / 26.3 | entity_info 未暴露默认实体叫声 | 三版解析 jar 的 Mob.getAmbientSound()、LivingEntity.getHurtSound(DamageSource)、getDeathSound() 签名与 protected 可见性一致；common 反射调用真实虚方法（generic 伤害源），取得 SOUND_EVENT 注册 ID，无新增 Stonecutter 分支或加载器 import。反射避免为仅只读元数据扩大生产访问权限，也兼容 NeoForge 的 vanilla JVM 验证运行时；失败只省略 sounds。ArmorStand 实际继承 LivingEntity，保留其真实 hurt/death，ambient 为 null；ItemFrame/Item 全 null |
| 34 | 26.3 | DisplayInfo.getTitle()/getDescription() | DisplayInfo 改为 record，使用 title()/description()；common PlayerExtendedEditor 通过 Stonecutter 条件分支，26.1.2 / 26.2 保留 getter。Language.has/getOrDefault 与 Advancement.display 在三版相同，翻译通道没有加载器分支 |
| 35 | 26.2 / 26.3 | PlayerAdvancements.stopListening() | 改名 clearTriggers()；PlayerProfiles 通过 Stonecutter >=26.2 分支清理临时档案对象的监听。26.1.2 保留 stopListening；两加载器以既有 AW/AT 开放 PlayerList 的 stats/advancements，用于不保存地清理临时缓存 |
| 36 | 26.3 | ServerAdvancementManager 构造即从 ADVANCEMENT 注册表读取定义 | PlayerProfiles.emptyAdvancements 在 >=26.3 提供独立空注册表，旧版构造器初始即为空；防止只读档案时执行数据包自动奖励。六目标玩家 JVM 测试直接检查该工厂为空 |

2026-11-09 entity_info 叫声数据：六目标 `compileJava` / 完整 `codecVerification` 通过（14m 7s，214 tasks）。日志：`Oriel-UI-Workspace/daily/2026-11-09/logs/entity-sounds/matrix.log`。每目标的 client/server 两个 EntitySchemaTest 各增加 67 项声音断言，覆盖 pig/cow/wolf/cat/zombie 注册声音、ArmorStand 真实 hit/break、ItemFrame/Item 全 null、缺实例和声音方法抛异常；均为不启动游戏的 JVM 工厂测试，未运行客户端或最终实机验收。

## 实施约定

- VCS 活动版本固定 26.3；开发切换后提交前恢复 26.3。原生产文件通过 git mv 迁移到 common。
- Fabric 原有自动化探针包含 Fabric 入口/Mixin，保留 fabric/src/autotest；公共 test/testFixtures 在 common；matrix smoke 在 common/src/smoke，独立测试 jar，不进入发行包。
- tools/build-all.ps1 执行根 build（六目标完整 check），收集六个发行 jar 并写 SHA256SUMS；不会把测试 jar 放进 dist。
- tools/smoke-matrix.ps1 使用独立世界副本、隐藏窗口和游戏内部调用验证打开→页面发送保存→服务端物品→关闭重开；每目标输出 matrix-smoke.json，禁止操作外部输入。
- 实机测试的初始化脚本跳过 included build-logic；live-test 使用独立保险库目录。测试 Mixin 仅模拟隐藏客户端的逻辑鼠标捕获状态以运行原版持续挖掘，不执行原生捕获；页面检查仍断言窗口不可见且无焦点。
- effects 等到可见服务器保存回执与草稿防抖结束才关闭页面；每个夹具通过真实按钮丢弃前一案例草稿；挖掘需在原时限内收到服务端方块确认，并读取服务端 typed NBT 校验实际耐久。
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
- 完整基线仅执行了一次 tools/accept-all.ps1 -Full：Editor/logs/accept-all/20261108-205352-695-d69da54c/report.json。UI、Java、world 首轮通过；其余失败保留原报告，没有改写为成功。随后只重跑失败阶段（以及测试配置改变后的 smoke）。
- acceptance 全阶段复测通过：Editor/logs/accept-all/20261108-213714-769-188f4aa0/report.json；321/321 组件轮次、12/12 世界对象轮次通过；首轮 map_color 第三轮页面就绪超时未复现，原 15 秒时限未放宽，探针新增状态诊断。
- effects：32/32 真实游戏效果通过，Editor/logs/accept-all/20261108-212800-806-4a0b6508/effects/report.json。pages：48/48 页面通过，Editor/logs/accept-all/20261108-213445-746-1ca61757/pages/report.json。测试输入始终通过独立隐藏客户端，不抢系统键鼠。
- 最终 smoke 通过：Editor/logs/accept-all/20261108-215306-935-f7816577/report.json；所有 ownedRemaining / port25599 清理回执为空。
- 旧 autotest 路径也通过：autotestJar / exportAutotestClasspath、server、edit、vanilla。日志在 Oriel-UI-Workspace/daily/2026-11-08/logs/editor-autotest-package-final.log、editor-autotest-server.log、editor-autotest-final-edit.log、editor-autotest-final-vanilla.log；编辑和卸载后数据保留回执在同日 run/editor-ds-client/。脚本按当前模组版本找探针，并从最近的独立测试世界复制，创建窗口前隐藏。
- 最终逐阶段汇总：Oriel-UI-Workspace/daily/2026-11-08/logs/editor-final-summary.json，状态 PASS_AFTER_STAGE_RETRIES；记录首轮失败、每个阶段通过报告及矩阵证据。它是证据索引，不替换原始报告。

| 目标 | build / check / Codec | 隐藏客户端打开、修改、保存 | 完整七阶段基线 |
|---|---|---|---|
| Fabric 26.1（MC 26.1.2） | 通过 | 通过（acceptance + smoke） | 通过（按阶段复测后） |
| Fabric 26.2 | 通过 | 通过（fabric-26.2/matrix-smoke.json） | 未做：基线只要求 26.1.2 |
| Fabric 26.3 | 通过 | 通过（fabric-26.3/matrix-smoke.json） | 未做：基线只要求 26.1.2 |
| NeoForge 26.1（MC 26.1.2） | 通过 | 通过（neoforge-26.1/matrix-smoke.json） | 未做：基线只要求 Fabric |
| NeoForge 26.2 | 通过 | 通过（neoforge-26.2/matrix-smoke.json） | 未做：基线只要求 Fabric |
| NeoForge 26.3 | 通过 | 通过（neoforge-26.3/matrix-smoke.json） | 未做：基线只要求 Fabric |

表内五份 matrix-smoke.json 均位于 Oriel-UI-Workspace/daily/2026-11-08/logs/editor-smoke-204031/；六目标构建任务索引为 editor-matrix/results.json。NeoForge 独立 JVM Codec 检查使用同版本 vanilla NeoForm，真实 FML 集成由各版本客户端保存 smoke 验证。人工视觉验收、其他五目标完整七阶段基线和 NeoForge 独立服务端长期运行未做，不由上述测试代替。

首轮 map_color 超时根因尚未确定；完整复测同一组件三轮和其余 318 轮均通过，保留原失败及诊断入口，不能称为首轮全绿。

### P4-1 玩家扩展 API 核对

### 存档玩家档案 API（2026-11-09）

差异 #35：PlayerAdvancements 的无保存监听清理在 26.1.2 为 stopListening()，26.2 / 26.3 为 clearTriggers()；PlayerProfiles 使用 Stonecutter >=26.2 分支。ServerPlayer.load、ClientInformation、UUID 本地缓存 get(UUID)、WorldData.getSinglePlayerUUID 在三版共用。

PlayerList 没有“不保存地移除构造缓存”的公开 API，remove 会保存玩家和统计；因此两加载器分别用现有 AW / AT 仅开放 stats、advancements Map。只在服务端线程以随机、不冲突 UUID 构造临时 ServerPlayer，finally 删除该 UUID 的缓存并清监听，不调用 remove/save。缓存删除始终使用构造用随机 UUID，不触碰档案目标的原缓存。Player.load 会恢复构造 GameProfile 的 UUID；完整离线编辑把档案路径 UUID 单独绑定到规范化会话投影，不修改临时对象 UUID。纯 JVM 不需要加载此入口；隔离专服探针携带同一生产 AW。

构造前预放独立 ServerStatsCounter 和 PlayerAdvancements：前者使用不存在的只读路径，后者使用空 ServerAdvancementManager（仍是原版 API）。这样不会经过 locateStatsFile 的旧名字文件迁移，也不会执行真实数据包中无条件成就的 rewards。临时对象从不登录、tick 或调用 save；读取后缓存和监听全部清理。

三版原版 PlayerList.loadPlayerData 均按 getSinglePlayerUUID 选择 owner 的 playerdata 文件，不自行读取遗留 level.dat Player。档案读取使用相同选择规则、NbtIo/DataFixTypes.PLAYER/ServerPlayer.load；不调用会在损坏读取时创建备份的 PlayerDataStorage.load，保证只读不落盘。摘要从加载对象读取，维度用原版 ResourceKey Codec 解析并选择真实 ServerLevel。离线修改原有 detached Player 的字段往返校验仍保留。

位置 teleportTo、RespawnConfig/LevelData.RespawnData、ServerRecipeBook.Packed/loadUntrusted/copyOverData、PlayerAdvancements.award/revoke、ServerStatsCounter、Player.load/saveWithoutId 在 26.1.2 / 26.2 / 26.3 的公开签名一致；本次暂不新增运行时反射或加载器分支。离线使用 detached Player（不是 ServerPlayer），避免构造 ServerPlayer 时污染 PlayerList 的统计/成就缓存。ServerRecipeBook.loadUntrusted 是追加加载，先加载独立书再 copyOverData 替换，确保撤销和取消高亮真实生效。后续编译验证发现的差异追加在此。

### P4-6 保险库模板 API 与验证

VaultTemplates 的 BlockStateEdit、WorldNbt、Inventory.EQUIPMENT_SLOT_MAPPING 和 PlayerWorldEdit 入口在 26.1.2 / 26.2 / 26.3 共用，无新增版本条件或运行时反射。测试初始化继续沿用既有 VanillaRegistries.createLookup/createWorldLookup replacement；生产没有加载器 import。文件版本 3 是保险库格式升级，不是游戏 API 分支；读取 1/2/3，旧程序按版本号拒绝新文件。

- 六目标 compileJava、codecVerificationClasses、vaultTemplateTest 通过：每目标 35 项；新增测试已加入 check/codecVerification。证据：Oriel-UI-Workspace/daily/2026-11-08/logs/vault-templates/matrix.log。
- 原保险库回归通过：VaultTest 167、VaultEntityTest 74、VaultPersistenceTest 41、VaultGlobalTest 28 项；regression-pass.log。
- 独立 Fabric 26.1.2 专用服探针 42 项通过：真实方块/在线玩家的存入→关闭库→重开→套用、原生 undo、同 BE 不同 block ID 拒绝、撤权拒绝及不改目标。server-receipt.json / server.log。使用脱离网络登录的 ServerPlayer 与 RecordingListener，不是客户端视觉验收。
- merge-templates.log / merge-entity.log / merge-legacy.log：新旧离线合并、数值/SNBT 保真、同名编号、幂等与非法输入安全拒绝通过。
- 不启动用户客户端，不执行全量实机验收；前端确认摘要和实际客户端画面由最终统一验收覆盖。

### P4-4 通用注册表 schema

生产 GenericSchema / GenericSchemaChannel 与世界编辑接入全部在 common，无加载器 import、无运行时版本识别。实体/方块实体 create、save/load、NBT Tag 类型、RegistryLookup 和实际 Codec 在三个版本共用；常量重命名沿用已有 Stonecutter replacements。测试构造器可见性差异见上表 #32，26.1 私有访问只存在于隔离测试分支；26.2+ 使用公开 API。26.3 BlockState 的字符串/对象表示由实际 Codec 识别，不复制序列化字段表。

六目标 compileJava / codecVerificationClasses / 完整 codecVerification 通过：`daily/2026-11-08/logs/p4-generic/matrix-reviewed.log`；GenericSchemaTest 每目标 97 项，新增测试接入 check/codecVerification。公共构造器分支补充矩阵见 `fixture-stonecutter.log`。真实注册的测试组件、方块实体、实体覆盖读/改/保存/新实例回读与拒绝/回滚；按版本捕获的完整证据在同目录 `fabric-26.1-evidence.json` 至 `neoforge-26.3-evidence.json`。本轮不启动客户端/专服，不代替最终整合包和页面实机验收。


### 玩家成就显示元数据与客户端翻译（2026-11-09）

- common 的 RegistryBridge / TranslateChannel 查询当前客户端 Language，PlayerExtendedEditor 返回 DisplayInfo 标记及组件翻译键/字面量；无加载器 import。26.3 DisplayInfo record accessor 与旧版 getter 的 Stonecutter 分支见差异 #34；26.1.2 / 26.2 的解析 jar 仍使用 getter。
- 六目标 compileJava + playerWorldEditTest + translateTest 通过：PlayerWorldEditTest 每目标 30 项，TranslateTest 每目标 36 项；新任务接入 check / codecVerification。矩阵日志：Oriel-UI-Workspace/daily/2026-11-09/logs/player-display-translate/matrix.log（BUILD SUCCESSFUL in 1m 5s，75 tasks）。NeoForge JVM 继续使用同版本 common NeoForm vanilla runtime。
- Fabric 26.1.2 隔离专服 JVM 探针 369 项通过：真实 minecraft:story/root 的 has_display/title_key/description_key、内部 recipes 成就无 DisplayInfo、displayed:true 全分页 125 项且 total 精确、query 叠加、默认完整列表、非法布尔值拒绝；server-receipt.json / server.log / probe-run.log 位于同一目录。脚本也重新独立断言回执中的 root/recipes/分页总数。
- 没有启动或操作用户客户端，没有执行前端 JS/CSS 改动或可见客户端翻译消息链验收。此处 JVM 结果不代表客户端画面验收。

### 完整存档玩家 / 预设编辑 API（2026-11-09）

PlayerWorldEdit 的只读投影、schema、prepare 统一使用原版 Player；在线 write 仍接收 ServerPlayer 并发原版同步包。writeDetached 仅用于未连接的临时对象，不调用在线 setGameMode、效果回调、经验同步与广播。原版 MobEffect.addAttributeModifiers/removeAttributeModifiers + activeEffects Map 维护临时效果；实际存档仍通过 ServerPlayer.saveWithoutId/load 校验。

ServerPlayerGameMode.setGameModeForPlayer(GameType,GameType) 在 26.1.2/26.2/26.3 均为 protected：common 的 AW 与 AT 同步开放此方法，只在隔离临时对象上更新模式/能力，不调用 changeGameModeForPlayer 的网络与世界广播。此项为跨版本相同的访问边界，无新增 Stonecutter 分支；临时 ServerPlayer 清理和空成就管理器沿用差异 #35/#36。

完整离线编辑的原版往返比较先统一 float 精度、Component/MobEffect/AttributeModifier Codec 表示和无序 ID 列表，再比较重新加载的规范化值；仅表示差异不会误报保存失败，原版实际丢弃或钳制的修改仍拒绝落盘。
