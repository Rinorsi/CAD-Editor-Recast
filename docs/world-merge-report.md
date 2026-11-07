# 世界编辑三方合并交付（2026-11-08）

合同：[world-merge-contract.md](world-merge-contract.md)。原始专用服收据：[world-merge-samples.json](world-merge-samples.json)。本报告仅对应三方合并；随后追加的“game master 权限与游戏模式无关”订单单独处理。

- revision/token 认证会话基线，current 不再要求全量 hash 相同。服务端在打开时副本上生成草稿，完整 SNBT 自行逐路径 diff；normalized 操作只投影其真实差异，工厂/loader 补默认值不计为用户编辑。
- compound 增删逐键；列表按唯一 Slot/slot/UUID/uuid/id/Id/entity_data.UUID 合并，Tags 按字符串值。不可识别列表和普通有序字符串列表整表比较；大整数键不转 double。
- 用户未改的路径保留 current，包含未知模组计时、试炼刷怪笼状态、受伤后的 Health、其他槽位等。双方改同一路径且结果不同才冲突；身份（方块ID/BE类型、实体类型/UUID）变化仍拒绝。BE 自己保存的 UUID 普通字段不当成实体身份。
- 回执：code:'target_changed', conflicts:[{path:['Items','[Slot=0]','count']}]，最多20项；玩家投影路径以 player 开头。旧基线校验错误可能不含 conflicts。
- undo 以前一次 saved 为 base、实际写入前 current 为 mine，只还原本次修改路径，保留后来其他路径变化；同一路径后来改变仍冲突。既有 volatile 特殊保护/倒计时语义继续执行。

验证：WorldMergeTest 39项，含未知计时假BE、刷怪笼/试炼刷怪笼树、实体运动/Brain/Health、容器独立槽、效果重排、增删、身份、undo与20条截断。相关 PlayerWorldEditTest、EntityWorldEditTest、WorldEditTest（含BlockWorldEditTest）、EntitySchemaTest、EntitySchemaDetailsTest、EditDispatchTest 全部通过。详见 logs/world-merge/gates.log；全源/测试 javac 输出在 compile.log / compile-tests.log。

真实独立专用服14项通过：20个服务器tick，熔炉燃料/烹饪计时和lit状态保留；箱子 normalized 槽位编辑保留另一个实时改变的槽，undo仍保留后来槽变化；真实移动僵尸被设为9点生命后改名成功，位置/Brain/Health不回退，双方改Health回报路径；带真实乘客的盔甲架姿态可写。输出 logs/world-merge/server-probe.log / captured-server.json。这里调用真实 WorldMergePlan、native load/write，但没有伪称客户端网络验收。

完整 build 与 diff 门禁行见 logs/world-merge/final-gates.log；Gradle输出 gradle-build.log，使用 logs/.gradle.lock.d 原子锁。人工审查记录 manual-review.log；没有可调用的 /review 工具。

未验证：真实刷怪笼/试炼刷怪笼激活、第三方模组loader、多人网络并发与客户端页面。检测到运行中的Java/Minecraft环境，未启动/操作用户客户端；real-client run pending。原版loader不支持的字段仍会明确拒绝，列表无稳定身份时仍可能整列表冲突；相同类型/相同数据的方块被拆掉重放无法单凭NBT识别。

本次文件：

- 新增 world/WorldMerge.java、world/WorldMergePlan.java。
- 修改 world/WorldEditSessions.java、WorldEditor.java、WorldTarget.java、PlayerWorldEdit.java、EntityVolatile.java。
- 新增 registry/WorldMergeTest.java、WorldMergeServerProbe.java；调整 WorldEditTest.java、EntityWorldEditTest.java、BlockWorldEditTest.java 的会话预期；fabric/build.gradle 接入 worldMergeTest/check。
- 新增 tools/world-edit/verify-merge.ps1、probe-merge-server.ps1、final-merge-gate.ps1。
- 更新 docs/world-edit-contract.md、world-block-edit.md、world-entity-contract.md、world-player-contract.md；新增本报告、world-merge-contract.md、world-merge-samples.json。

上述 Java 路径根分别为 fabric/src/main/java/dev/rinorsi/editor/ 和 fabric/src/test/java/dev/rinorsi/editor/。未改 UI、未 add/commit/push；仅按要求执行 git diff --check。
