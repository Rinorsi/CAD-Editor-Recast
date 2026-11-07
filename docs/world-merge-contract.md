# 世界编辑三方合并（2026-11-08）

会话版本和拒绝重试增量见 [world-revision-contract.md](world-revision-contract.md)：revision是冻结会话版本，target_changed必含conflicts或stale，rate_limited附retryAfterMs。

本规则覆盖 world-edit、world-block-edit、world-entity、world-player 合同早期的“当前稳定 revision 必须完全一致”限制。权限、在线玩家限制、距离、区块、区域保护、500ms 限流、身份锁定、Codec/loader 校验和大小限制不变。

## 服务端基线与算法

open 保存权威的完整基线。apply 的 revision 必须匹配该会话基线，token 必须匹配；它不是要求此刻整个目标仍与基线相同。每次 saved 后基线更新到实际保存结果。

base = 打开时/上次 saved 的服务端副本；mine = 在 base 的脱离世界副本上应用完整 snbt、normalized views/container/entity/player 后得到的草稿；current = 提交时服务器真实保存。SNBT 的差异由服务器逐路径计算，不接受客户端声明的“已修改字段”作为依据。normalized 省略的字段同样来自 base，不能从 current 生成 mine。

|逐路径条件|结果|
|---|---|
|mine == base|保留 current，包含未知模组字段、计时、进度、伤害、AI 等变化|
|mine == current|接受相同结果|
|current == base|采用 mine|
|双方改变同一路径、结果不同|target_changed，整笔不写入|

compound 按键递归，支持增加和删除。列表优先查找每一版本列表内部均唯一的稳定键：Slot、slot、UUID、uuid、id、Id、entity_data.UUID；已知 Tags 字符串集合采用元素值；普通有序字符串列表（文本行、脚本等）保持整列表比较。UUID 整数数组保持精确值。缺键或重复时尝试下一种键；全部不能识别则将整个列表作为一个值比较。交易列表没有唯一稳定标识时整体比较，不推测交易身份；数组/无标识列表也不按不可靠索引合并。槽位、效果、乘客和有 UUID 的蜂可独立合并。

方块 ID 与 BE 类型、实体类型与 UUID 无论用户是否修改都必须匹配基线。替换成同类型且相同可观察身份/数据的方块无法凭 NBT 识别。方块朝向等状态属性按相同三方规则处理，不再因为游戏改变另一个状态属性而全量拒绝。

Health、装备、容器、属性、交易不再“任意并发变化就冲突”：用户未改 Health 时被打，改名保存后保留受伤后的 Health；用户也改 Health 且双方结果不同时才冲突。这意味着页面显示的旧值不代表保存时会强制覆盖该值。

## 专门动态语义

既有 EntityVolatile / BlockVolatile 继续执行只读位置/运动/Brain 等保护、年龄阶段、效果倒计时、唱片时间等专门语义。效果 duration revision 仍仅保留符号；未显式编辑时保留当前倒计时。它们不再是允许编辑活动目标的白名单：没有列入白名单的路径也会由通用三方规则保留。

玩家投影 cad_player 在服务器作为 JSON 树逐路径合并，保留 boolean/null 类型；前端路径以 player 开始，内部包装字段不暴露。

## 冲突回执


    {"status":"rejected","requestId":"w3","code":"target_changed",
     "reason":"你修改的字段在编辑期间也发生了变化…",
     "conflicts":[{"path":["Items","[Slot=0]","count"]},
                  {"path":["Health"]}]}

conflicts 最多20项，path 是字符串段数组；有稳定键的列表段采用 [键=值]。例如玩家背包： ["player","container","slots","[slot=0]","stack","count"]；状态： ["block_state","facing"]。身份变化用 ["id"] / ["UUID"] / ["block"]。旧页面基线为 stale:client_revision；身份变化附 stale:identity；没有 conflicts 的旧拒绝分支至少有 stale:session，前端按原因区分提示。冲突不覆盖草稿，不自动重试、不自动替用户选胜出方。

## undo

保存的前像为本次实际写入前的 current，undo 基线为本次 saved 后的实际结果。再次执行相同三方合并：仅还原本次保存前后不同的路径；游戏后来改变的其他槽位、血量、计时不回退。本次改过的路径后来又被他人改变则 undo 同样冲突。专门动态语义仍保留 current。关系图 riding 保持独立操作且不可 undo。

## 验证边界

WorldMergeTest 使用真实 NBT/Gson 类型、实际 BlockEntity 子类未知计时字段，覆盖刷怪笼/试炼刷怪笼计时树、未知模组字段、容器独立槽位、effects/UUID/bees、增删、身份、Health、undo 和20条截断。WorldMergeServerProbe 在独立 scratch 专用服对真实 ticking 熔炉、移动僵尸与受伤改名、真实箱子槽位及 undo、带乘客盔甲架 normalized pose 执行 WorldMergePlan 与原版加载/写入。收据见 logs/world-merge/captured-server.json；passed:true 才算通过。

通过的专用服原始收据另存 [world-merge-samples.json](world-merge-samples.json)：真实燃料1583 tick、烹饪进度18 tick；僵尸实际运动且生命值为9时成功改名；Health 冲突路径和14项检查。这是服务端 plan/load/write 验证，不是客户端网络验收。

真实刷怪笼/试炼刷怪笼激活、多客户端 UI/网络并发、第三方模组 loader 兼容性未由该探针证明。用户客户端运行时不启动或操作它。
