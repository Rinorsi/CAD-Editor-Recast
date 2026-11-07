# 世界编辑 game master 权限（2026-11-08）

敏感目标统一通过 EditorPolicy.gameMaster(player)，实际为 ServerPlayer.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)。此判定与创造/生存无关；不再调用隐含“创造+权限”的 Player.canUseGameMasterBlocks。

- WorldTarget.resolve：原版 GameMasterBlock 标记的命令/结构/拼图等方块、onlyOpCanSetNbt 实体均要求该权限。方块分类来自原版标记，不手写第二份列表。
- WorldTarget.checkCommandPrivileges：改标牌文本且最终含可执行命令仍要求该权限；普通文本仍允许按既有策略编辑。
- EntityRiding.add：新增 onlyOpCanSetNbt 乘客同样要求该权限，再执行原版骑乘检查。
- 玩家编辑已有的 player_forbidden 权限判断继续保留。EditorPolicy、存活、距离、区块、世界边界和区域保护不变；有game master权限者不被旁观或mayBuild=false拒绝，无该权限者原行为不变。旧配置不能用游戏模式否决已有 game master 命令权限。

真实独立 ServerLevel + detached ServerPlayer 探针47项通过：创造且没有OP时命令/结构/拼图方块、命令矿车、命令标牌、受保护乘客均拒绝；普通标牌文本不被错误禁止；生存且有原版 game master 权限时上述目标允许，原版 canUseGameMasterBlocks 此时确实为false，证明已解除其创造模式限制；命令标牌经过 native loader/write，新命令矿车乘客通过真实骑乘检查。原始收据：[world-permission-samples.json](world-permission-samples.json)。没有点击执行标牌命令。新增冒险/旁观+GM、显式mayBuild=false+GM、自己改旁观且mayBuild=false后重新resolve及undo恢复的实测；无GM的旁观/冒险/禁建能力仍拒绝。GM旁观仍被距离和世界边界拒绝。专用服启用真实出生点保护半径16：OP按原版豁免，另有OP存在时非OP创造仍被保护阻挡。原版字节码证据见 logs/world-permission/{area-bytecode,entity-area-bytecode,server-player-area-bytecode}.log。

全main/test javac 与 WorldMergeTest、PlayerWorldEditTest、EntityWorldEditTest、WorldEditTest（含BlockWorldEditTest）、EntitySchemaTest、EntitySchemaDetailsTest、EditDispatchTest 通过。日志 logs/world-permission/gates.log、compile.log、compile-tests.log、各同名Test.log；专用服日志 server-probe.log / captured-server.json。完整原子锁 build 与 git diff --check 的最终门禁行见 final-gates.log，完整Gradle输出 gradle-build.log。人工审查见 manual-review.log；没有可调用的 /review 工具。

改动文件：main world/WorldTarget.java、EntityRiding.java；新增 test registry/WorldPermissionServerProbe.java；新增 tools/world-edit/{verify-permission,probe-permission-server,final-permission-gate}.ps1；更新 docs/world-edit-contract.md、world-block-edit.md、world-player-contract.md、permission-matrix.md；新增本报告及真实收据。Java路径根为 fabric/src/main/java/dev/rinorsi/editor/ 和 fabric/src/test/java/dev/rinorsi/editor/。

未验证：用户真实客户端交互/网络同步与第三方权限/领地插件。检测到运行中的Java/Minecraft环境，未启动或操作用户客户端；real-client run pending。未改UI/保险库持久化，未add/commit/push。
