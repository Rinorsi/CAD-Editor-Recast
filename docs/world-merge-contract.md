# 世界编辑三方合并（2026-11-10）

会话版本和拒绝重试增量见 [world-revision-contract.md](world-revision-contract.md)：revision是冻结会话版本，target_changed必含conflicts或stale，rate_limited附retryAfterMs。

本规则覆盖 world-edit、world-block-edit、world-entity、world-player 合同早期的全量变化拒绝与同字段冲突限制。权限、在线玩家限制、区块、区域保护、500ms 限流、身份锁定、Codec/loader 校验和大小限制保持；已认证非玩家实体会话可使用打开位置作为交互锚点，详见 world-entity-contract.md。

## 服务端基线与算法

open 保存权威的完整基线。apply 的 revision 必须匹配该会话基线，token 必须匹配；它不是要求此刻整个目标仍与基线相同。每次 saved 后基线更新到实际保存结果。

base = 打开时/上次 saved 的服务端副本；mine = 在 base 的脱离世界副本上应用完整 snbt、normalized views/container/entity/player 后得到的草稿；current = 提交时服务器真实保存。SNBT 的差异由服务器逐路径计算，不接受客户端声明的“已修改字段”作为依据。normalized 省略的字段同样来自 base，不能从 current 生成 mine。

|逐路径条件|结果|
|---|---|
|mine == base|保留 current，包含未知模组字段、计时、进度、伤害、AI 等变化|
|mine == current|接受相同结果|
|current == base|采用 mine|
|双方改变同一路径、结果不同|在线世界编辑采用 mine，直接覆盖用户主动修改的值|

WorldMergePlan 使用 WorldMerge.applyEdits；包括普通方块、双箱两半、非玩家实体和在线玩家。离线玩家仍使用 WorldMerge.merge 的严格同路径冲突规则，避免覆盖外部存档更新。身份变化、旧 token/revision 不因覆盖模式放行。

compound 按键递归，支持增加和删除。列表优先查找每一版本列表内部均唯一的稳定键：Slot、slot、UUID、uuid、id、Id、entity_data.UUID；已知 Tags 字符串集合采用元素值；普通有序字符串列表（文本行、脚本等）保持整列表比较。UUID 整数数组保持精确值。缺键或重复时尝试下一种键；全部不能识别则将整个列表作为一个值比较。交易列表没有唯一稳定标识时整体比较，不推测交易身份；数组/无标识列表也不按不可靠索引合并。槽位、效果、乘客和有 UUID 的蜂可独立合并。

方块 ID 与 BE 类型、实体类型与 UUID 无论用户是否修改都必须匹配基线。替换成同类型且相同可观察身份/数据的方块无法凭 NBT 识别。方块朝向等状态属性按相同三方规则处理，不再因为游戏改变另一个状态属性而全量拒绝。

Health、装备、容器、属性、交易均按同一规则：用户未改 Health 时被打，改名保存后保留受伤后的 Health；用户也改 Health 则写入用户值。这意味着应用覆盖的是草稿实际变化的路径，不是整份打开快照；无稳定键的列表作为一个值，主动修改后整列表以用户草稿为准。

## 专门动态语义

原版蜂箱保存的 occupant 不保证含 UUID。针对实际 id=minecraft:beehive，只有 current 中
整份 bees 列表的长度、顺序以及除 ticks_in_hive 外的全部数据与 base 完全一致，且整数计时
没有倒退时，才把用户未改的计时同步到本次比较用的基线和草稿副本，然后继续逐路径合并。
因此自然 tick 不阻止修改 min_ticks_in_hive 或实体字段；在线世界编辑显式改计时以用户值为准。
离巢、外部替换、可观察的顺序变化及其它实体数据变化不走该例外，不猜测蜜蜂身份。
不修改原始会话基线，不给缺失 UUID 的蜜蜂伪造 UUID，不对其它模组列表开放按索引合并。
撤销同样保留提交时的自然计时。

既有 EntityVolatile / BlockVolatile 继续执行位置/Brain 等保护、效果倒计时和唱片时间等专门语义。Motion 可显式编辑；Age、效果 duration 和 Motion 未改时保留当前值，显式编辑及撤销时采用对应草稿值。效果 duration revision 仍仅保留符号。这些不是允许编辑活动目标的白名单：其他可写路径也按通用三方规则处理。

玩家投影 cad_player 在服务器作为 JSON 树逐路径合并，保留 boolean/null 类型；前端路径以 player 开始，内部包装字段不暴露。

## 身份拒绝与离线冲突回执


    {"status":"rejected","requestId":"w3","code":"target_changed",
     "reason":"目标身份已变化，请重新打开…",
     "stale":"identity","conflicts":[{"path":["UUID"]}]}

conflicts 最多20项，path 是字符串段数组；有稳定键的列表段采用 [键=值]。例如玩家背包： ["player","container","slots","[slot=0]","stack","count"]；状态： ["block_state","facing"]。身份变化用 ["id"] / ["UUID"] / ["block"]。旧页面基线为 stale:client_revision；身份变化附 stale:identity；没有 conflicts 的旧拒绝分支至少有 stale:session，前端按原因区分提示。冲突不覆盖草稿，不自动重试、不自动替用户选胜出方。

## undo

保存的前像为本次实际写入前的 current，undo 基线为本次 saved 后的实际结果。在线目标按相同覆盖规则：仅还原本次保存前后不同的路径；游戏后来改变的其他槽位、血量、计时不回退。本次改过的路径以撤销前像为准。离线玩家维持严格冲突规则。关系图 riding 保持独立操作且不可 undo。

## 验证边界

2026-11-10 覆盖模式修订仅做源码核对、JS 语法与六目标构建；既有双箱/通用字段检查预期已同步修改，未执行。以下旧探针属于此前严格模式的历史证据，不能证明本次覆盖、实体拉回或预览实机通过。

WorldMergeTest 使用真实 NBT/Gson 类型、实际 BlockEntity 子类未知计时字段，覆盖刷怪笼/试炼刷怪笼计时树、未知模组字段、容器独立槽位、effects/UUID/bees、增删、身份、Health、undo 和20条截断。WorldMergeServerProbe 在独立 scratch 专用服对真实 ticking 熔炉、移动僵尸与受伤改名、真实箱子槽位及 undo、带乘客盔甲架 normalized pose 执行 WorldMergePlan 与原版加载/写入。收据见 logs/world-merge/captured-server.json；passed:true 才算通过。

通过的专用服原始收据另存 历史采集回执（仅本地归档：`docs/archive/world-merge-samples.json`，不随仓库分发）：真实燃料1583 tick、烹饪进度18 tick；僵尸实际运动且生命值为9时成功改名；Health 冲突路径和14项检查。这是服务端 plan/load/write 验证，不是客户端网络验收。

真实刷怪笼/试炼刷怪笼激活、多客户端 UI/网络并发、第三方模组 loader 兼容性未由该探针证明。用户客户端运行时不启动或操作它。
