# P1-0 功能生效测试（开发完成，尚未实机验证）

本项由用户亲自要求。当前实现 **25 个物品组件 + 7 条世界/玩家/保险库用例**，只完成静态检查、DryRun 和假 MCTest WebSocket 自测。按用户要求，这轮没有启动 Minecraft、没有运行 Gradle；首次实机执行留到所有功能做完后统一进行。不能把此文或 DryRun 的 SKIP 报告当作实机通过证据。

```powershell
# 当前允许的开发检查：不启动、不连接游戏
pwsh -NoProfile -File tools/live-test/effects.ps1 -Tier quick -DryRun
pwsh -NoProfile -File tools/live-test/effects.ps1 -Tier full -DryRun
pwsh -NoProfile -File tools/live-test/effects.ps1 -Only attack-damage -DryRun
node tools/live-test/effects.selftest.mjs

# 所有功能完成后统一执行（本轮没有运行）
pwsh -NoProfile -File tools/live-test/effects.ps1 -Tier quick
pwsh -NoProfile -File tools/live-test/effects.ps1 -Tier full
pwsh -NoProfile -File tools/live-test/effects.ps1 -Only attack-damage
```

需要 Node 22+、PowerShell 7、项目既有 Java 25 / MCTest 依赖。驱动直接连接 `ws://127.0.0.1:25599/`，使用 `{id,method,params}`；没有安装 npm 运行依赖。方法参数以 `mctest-mcp@0.3.0` 和本机 `mctest-fabric-26.1.2:26.1.2.1` 为依据，组件 ID 和字段依据 `docs/component-schema-26.1.2.json` 的 26.1.2 运行时 Codec 导出。

## 路径与边界

- 物品：准备未修改的物品 → 按 **I** → 鼠标点「高级」→「物品数据」→真实 textarea 逐字符 `key` + `type` →点「应用 Ctrl+Enter」暂存 → Escape 关高级窗 →点「应用修改」→点「应用到游戏」→世界中观察结果。当前 25 条物品路径覆盖高级编辑控件和应用链路，**尚不代表 25 张专用组件卡片的控件验收**。
- 方块、生物：布置场景、准星对准 → **I** →专用表单控件→点「应用修改」→`block` / `entities` 读回。不会用 `weApply()`、页面事件派发或 `oriel.send` 提交。
- 玩家：空手看天空 → **I** →「状态」→「生命与饥饿」表单。食物用例的初始饥饿值也经这条真实路径设置，随后切回创造模式布置物品，实际食用时切生存模式。
- 保险库：持钻石按 **I** →点保险库→「存入当前物品」→「存入」→「给我」→`player.inventory` 总数由 1 变 2。该流程本来没有「应用修改」按钮，测试按它的实际玩家流程执行。
- 攻击、挖掘、使用、拾取均用 MCTest 的按键映射驱动；场景位置用玩家可用的 `/tp` 命令。没有使用直接伤害/编辑数据的测试接口替代效果。
- 外观数据检查：用玩家可执行的 `/item replace ... from ...` 把改好的物品原样复制到证据箱，再由 `block(source:server)` 读取 SNBT；命令不写预期组件值。解析器比较相应组件的值，避免把命令回显误当成功。
- `PageProbe` 只生成 DOM 选择、文本/输入值和矩形查询，宿主补充只读原生命中检查。没有对页面状态赋值、滚动、focus、click 或调用业务函数的接口。只读拿到坐标后用 MCTest `click`，并验证输入框实际文字。零匹配、多匹配、遮挡、禁用或超出视口全部 FAIL，**不会回退到内部函数**。页面导航和滚轮寻址使用真实 MCTest 输入。

`LivePageProbe.java` uses the existing test-only file bridge. Control inspection additionally uses the host's read-only `DocumentDriver.elementAt` paint hit test: Oriel 0.11.0 does not expose `document.elementFromPoint` to JavaScript. It resolves the exact DOM match index and verifies the native hit belongs to that control; the subsequent input is still an actual MCTest click. It never sends input from the probe. The driver moves the in-game pointer away first to dismiss stale tooltips, navigates the topbar overflow menu, waits for animations and scrolls controls into view with MCTest. The old smoke contains controller-level shortcuts and is not evidence of input authenticity.

## 快速档用例

| 名字 | 组件 / 页面 | 独立断言 |
|---|---|---|
| attack-damage | attribute_modifiers | 木棍攻击伤害改为 9，完整蓄力打 NoAI 猪，生命减少 9 |
| sharpness | enchantments | 钻石剑锋利 III，猪生命减少 9 |
| food-nutrition | food | 初始饥饿 4，吃苹果后为 10 |
| consume-fast | consumable | 使用时长改为 0.1 秒，按使用 5 刻后饥饿由 4 到 8 |
| unbreakable-mining | unbreakable | 生存挖掉石头，damage 仍为 0 |
| max-durability | max_damage | 挖石头后 damage=1，maxDamage=2000 |
| damage-mining | damage | 初始磨损 20，挖石头后为 21 |
| tool-wear | tool | 每方块损耗 3，石头消失且 damage=3 |
| weapon-wear | weapon | 打猪扣血 7，剑损耗 4 |
| stack-pickup | max_stack_size | 两堆各 16 的已编辑末影珍珠，扔出一堆再拾取，合并成单堆 32 |
| custom-name | custom_name | tooltip 含 EffectsName |
| lore | lore | tooltip 含 EffectsLore |
| rarity | rarity | 服务端 epic 值和 tooltip 木棍名称行；颜色不在 MCTest 纯文本接口中，未验颜色 |
| item-name | item_name | tooltip 含 EffectsBaseName |
| stored-sharpness | stored_enchantments | 附魔书 tooltip 有锋利行 |
| potion-speed | potion_contents | 饮用后 player.effects 出现 speed |
| use-remainder | use_remainder | 吃苹果后饥饿 8，手中留下碗 |
| equip-head | equippable | 右键后木棍进入头盔槽 39 |
| container-placement | container | 放置箱子后，服务端箱子第 0 格有 3 个钻石 |
| potion-duration | potion_duration_scale | 迅捷药水时长倍率 2，饮用后的 speed 剩余至少 7000 刻 |
| custom-model | custom_model_data | floats=[7] 服务端保存；无游戏效果可观察（本套仅验数据） |
| item-model | item_model | minecraft:diamond 服务端保存；无游戏效果可观察（本套仅验数据） |
| dyed-color | dyed_color | 16711680 服务端保存；无游戏效果可观察（本套仅验数据） |
| map-color | map_color | 65280 服务端保存；无游戏效果可观察（本套仅验数据） |
| glint | enchantment_glint_override | true 服务端保存；无游戏效果可观察（本套仅验数据） |
| block-name | 方块名称表单 | block NBT 含 EffectsChest |
| block-sign | 告示牌第一行输入框 | block NBT 含 EffectsSign |
| entity-name | 生物常用设置 / 名字 | entities.customName=EffectsPig |
| entity-health | 生物常用设置 / 生命值 | entities.health=6 |
| player-health | 玩家状态 / 生命 | player.health=12 |
| player-food | 玩家状态 / 饥饿值 | player.food=7 |
| vault-roundtrip | 保险库存入 / 给我 | 背包钻石总数从 1 到 2 |

## 完整档与扩展方式

`effects.cases.mjs` 是用例表：基础物品、布置命令、真实控件选择器/文字、输入值和效果断言分开记录。新增用例必须给出独立的游戏断言；不认识的 effect kind 会失败，不能静默通过。

`full` 当前运行相同的 32 条可执行用例，并从 26.1.2 schema 枚举剩余 **82 个组件**为 `pending-<组件名>` 的 SKIP，每条说明“待补真实控件路径与独立游戏断言”。它不是已经实现的 107 组件功能验收，也没有隐式调用旧的绕控件数据三轮验收或服务器探针；这些仍由 `tools/accept` 和原有门禁负责。107 个组件没有因为未实现而从报告消失。后续优先补漏斗冷却（冻结时间）、马驯服/鞍、TNT 引信与真实爆炸时机、药水云半径；其中 `entities` 没有任意实体 NBT 字段，需要先选择玩家可观察且能独立读回的效果，不能读编辑器草稿冒充世界状态。

退出码：0=所选实机用例全部通过，1=失败，2=因用户游戏/端口占用跳过，或 full 存在尚未实现的 SKIP。DryRun 成功返回 0；其报告每条都是 SKIP，明确注明未运行。

## 静默与报告

每次使用唯一的 `logs/live-test/effects/<时间>-<PID>/`，内含 `report.md`、机器可读 `report.json`、逐 RPC 耗时/结果 `rpc.jsonl`、只读页面回执 `page.jsonl`、各用例 PNG 和截图回执。报告列出 PASS/FAIL/SKIP、每个操作耗时，失败保留预期/实际及不可点击选择器。启动失败时报告运行错误，未运行用例记 SKIP。编译/启动输出是 `runClient.log`，退出请求记录在 `quit-attempted.json`。

入口沿用 `launch.init.gradle` 的 `liveTestEvidence` 参数及既有隐藏窗口、禁用焦点、禁用鼠标捕获 Mixins。启动前与获取构建锁后各检查一次用户 Java 游戏进程/25599 端口；发现占用直接 SKIP。原子获取 `logs/.gradle.lock.d`，等待已有持锁者，自己持锁才释放；客户端 readiness 后释放构建锁。只清理本次唯一 JVM token 的 Java 进程和自己启动的 launcher/driver，结束前必须先尝试 `mc_quit`（wire method 为 `quit`），不会结束用户游戏或 Gradle daemon。正常一套只有一次客户端启动、一个创造平坦世界，按需短暂切生存做效果检查。

## 首次实机预计要调整的地方

快速档目标仍为全程 ≤6 分钟；**没有实测计时，不能声称达标**。暖构建首次估计 5–8 分钟，冷构建/世界初次加载可能 8–12 分钟；脚本 quick 保护上限 10 分钟。待首次证据出来再缩短等待或换用专用卡片输入，不能通过跳过输入/提交来提速。当前 full 的可执行部分与 quick 接近，82 条是显式 SKIP；107 条完整实现后的 15–20 分钟目标尚无依据可验证。

预计首先需要调整：1280×800 / GUI scale 2 下高级按钮和表单卡片的可见性、折叠/页签状态、动画后的布局时机；猪命中角度和满蓄力时间；珍珠扔出/拾回位置；快速食用的 tick 边界；26.1.2 状态效果 duration、装备槽位及箱子 SNBT 回执；字体语言影响的锋利提示行。稀有度颜色已确认无法由当前 tooltip API 断言，保留视觉缺口。任何控件点不到都先报 FAIL，后续只能调整真实导航/点击步骤，不能使用页面内部函数绕过。
