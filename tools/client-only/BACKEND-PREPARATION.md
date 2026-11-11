# 第二批与完整后端回归工具准备

2026-11-09。本文件更新 NEXT-PREPARATION.md 的准备状态；未运行新候选，不能作为 LAN 通过回执。第一批 expanded 23 项标准不变。

## 独立启动模式

- backend-single：一个装正式 Editor/Oriel 的隔离集成服客户端；不开放 LAN，不启动加入者/observer；预留端口25782作冲突检查，不宣称联网。
- backend-dual：房主和加入者装同一指定 Editor jar 与匹配 Oriel0.11；普通 observer 不装两者；发布原版 survival/allowCommands=false，端口25783。
- next：原纯客户端第二批；host/observer无Editor/Oriel，端口25781。

三种模式均要求新 Evidence 目录，复制自己的世界，创建前隐藏/不聚焦/不捕鼠，实际安装列表与hash落盘；finally只清理自身Process，记录cleanup及port-cleanup。backend-driver独立核对双方实际模组、相同hash、UUID与host真实连接记录。不同模式必须独立目录，不能混成一次LAN通过。

命令（取得Leader正式整合path/hash后才运行）：

    tools/client-only/run.ps1 -Mode backend-single -EditorJar <final-jar> -ExpectedEditorSha256 <Lead-final-hash> -ProbeJar <probe14> -Evidence <new-single-directory>
    tools/client-only/run.ps1 -Mode backend-dual -EditorJar <same-final-jar> -ExpectedEditorSha256 <Lead-final-hash> -ProbeJar <probe14> -Evidence <new-dual-directory>
    tools/client-only/run.ps1 -Mode next -EditorJar <same-final-jar> -ExpectedEditorSha256 <Lead-final-hash> -ProbeJar <probe14> -Evidence <new-next-directory>

三个新模式在创建Evidence/启动游戏前强制显式path与64位hash匹配，不能无意默认启动旧artifact。

## 完整后端断言

实际I打开物品页并处理恢复modal，正式self导航；UUID匹配server actor，wpCommandCaps()必须null。真实生命/饥饿值/饱和度/等级控件混合修改，一次实际Apply必须取得同requestId的saved；host server-thread精确回读Health16/food12/目标等级，关闭重开仍一致，页面无剩余dirty。修改命令计数不增加，证明走完整Editor通道，不走vanilla_self白名单。

双端另在打开/编辑后真实PlayerList.deop，提交必须player_forbidden、host不变、Health15草稿保留；不偷偷改用命令。单人owner本身的原版权限不能用假PermissionSet移除，未宣称single-owner拒绝；普通非owner拒绝由双端独立覆盖。原玩家扩展位置尚不在本smoke范围；本轮选择合同允许的Health/food/经验完整后端路径。

## 新补next门禁

- 无OP等级/当前等级点数真实行正文rect/style检查，必须解释命令/查询/权限，不能错误写“需要服务端”；持续顶部正文及toast消失截图保留。
- 真手动ID控件输入不存在ID、从host实际注册表挑选非同步/无玩家实例ID，要求可见拒绝、不改筛选状态、不发apply/修改命令。
- 只读比较host saveWithoutId属性和真实客户端schema，输出natural-missing-base-enumeration.json。仅天然缺席时运行缺base拒绝；没有天然fixture就明确未覆盖，不删改NBT/query。独立候选生产方法source harness已通过missing/duplicate属性、modifier、位置/float规则；它使用轻量NBT stub，不是Minecraft实机。
- 原prequery延迟时真实原版维度传送到下界，旧会话拒绝/命令0/迟到不saved，然后原版命令返回本测试世界坐标。
- 真断线等待8.5s，命令一次；只重连本次127.0.0.1:25781，重新打开真实self页读host提交值，释放旧connection原包不得saved/改变新页基线、不重发。重连后的实际草稿状态原样记录，不预设产品承诺恢复。
- 原pending反向控件模式/等级/X/整数points/base、X第三值C与Health新增/自然XpTotal断言保留。

## 探针与静态证据

最终准备probe14：

    C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-09/logs/client-only-probe-build14/client-only-lan-instrumentation.jar
    SHA256 CB8E355003F47F06AB4CFB4892B81D92E6B4291EB9BFD0358B71E9E1579CC80B

只在独立Evidence standalone javac/jar，未执行Gradle。新增真实属性注册表定义读取和限定本次端口的真实ConnectScreen重连；不构造结果、不修改原查询内容。

精确200ms只读retry时点未造LAN调度通过：已另跑候选 self-player-document-test.cjs，提取生产DocumentBinding及scheduler的Java source harness通过，含旧值后目标值、200ms只读重查、singleWrite、固定8s、查询占用、reload取消scheduled read与晚回读不saved。该测试使用轻量Minecraft/NBT stub，明确属于source harness，不是实机。

仍未覆盖：上述精确retry时点的LAN调度；若无天然missing-base则该项只有source harness；全部新增实机尚未执行。next结果和两种backend结果分别列实际scope/notExecuted。生产源码、资源和用户游戏实例未改动。
