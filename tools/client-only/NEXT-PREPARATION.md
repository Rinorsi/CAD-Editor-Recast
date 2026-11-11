# 第二批 LAN 工具准备（尚未运行候选）

后续准备状态及probe14/完整后端入口见 BACKEND-PREPARATION.md；本文件保留第一轮准备记录。

2026-11-09。只改 tools/client-only 与独立 autotest probe。未启动游戏、未执行 Gradle、未应用候选。第一批 expanded 23 项通过标准不变。

入口：tools/client-only/run.ps1 -Mode next -EditorJar <Lead放行的整合jar> -ProbeJar C:/Storage/Minecraft/project/Mods/Oriel-UI-Workspace/daily/2026-11-09/logs/client-only-probe-build12/client-only-lan-instrumentation.jar -Evidence <全新目录>

Probe SHA256 EE1C97B5F252D5061DA5C028A3408A432F028BF9691F8F66F8D318971A218082。只读原 query SNBT / XpP / Pos / Rotation / attributes；host真实saveWithoutId输出SNBT及serializedAttributes.hasBase/baseDecimal；无Editor/Oriel引用。新增独立原版query占用与关闭自身连接动作。生产写入仍只能真实页面Apply。

| 合同 | 已写入 next 的场景 | 尚未准备好/不得冒称覆盖 |
|---|---|---|
| 1 无权 | 真实deop与命令树，无权点数草稿、具体持续正文、toast消失后截图 | 最终jar实际DOM仍需验证 |
| 2 整数点数 | 原query XpP精确float、level/XpTotal保持、saved-ID、重开 | 未执行 |
| 3 经验冲突 | host改等级后旧点数提交不发命令 | 未执行 |
| 4 位置 | 实体平台、同维度X/yaw360/pitch、host容差、移动冲突、真实坠落+held原回读unknown | 自然坠落恰好首读旧值调度不稳定，当前unknown含受控回读延迟 |
| 5 属性 | 真实手输ID筛选、服务端序列化base、永久modifier非空fixture、精确base且全部modifier保持 | 非法/未同步ID可见正文用例尚待追加 |
| 6 混合/缺base | level+points、多属性、host改base前置冲突 | 缺serialized base未找到不篡改NBT的真实fixture；将以host原始hasBase证据寻找，不能删query字段假造 |
| 7 Document | prequery与postquery原包延迟、真reload、旧ID不saved/新页基线不变 | 200ms只读retry时点需更细原包调度；未把post等待假称retry覆盖 |
| 8 在途草稿 | 模式/等级/X轴/整数points/属性base各B提交后host达B，真实控件回A，savedB保留dirtyA，显式第二次Apply才写A；X轴第三值C；Health新增与host真实XpTotal+1不造新draft | 未执行；新增全部使用控件事件，无WE/evSet直接赋值 |
| 9 生命周期 | query被真正DebugQueryHandler查询覆盖、deop、8sunknown晚包不saved不重发；最后实际disconnect屏幕与singleWrite | 换世界、断线后重连恢复草稿尚未准备；disconnect不宣称已验证新页result状态 |
| 10 完整后端 | 原tools/live-test/smoke-matrix可复用 | 单人及双端完整Editor回归未执行，也不计next通过 |

普通observer无管理反馈断言保留，独立截图；与原版OP本人/房主的反馈分开。所有正向要求真实匹配requestId的saved且commandAttempts差1；允许原query次数>2。next结果明确列notExecuted，不作完整十合同通过结论。

## 自检

Node source语法、既有23个adapter生成表达式语法、PowerShell parser、git diff --check、standalone javac/jar PASS。新增next路径尚未进入实际DOM；上述自检仅工具静态验证。独立probe12尚未启动，Mixin注入正确性将由新候选实机确认。

人工review：确认next为独立分流，不改变expanded首批caps两项或库存验收；reverse路径先等host B/原确认包queued，再控件输入A/C，严格第一笔saved-ID+hostB+dirtyA/C+第二笔新ID，未合并两次commandAttempts；所有fixture仅host正常命令；Document不用跨页submit等待器伪造回执。原query与服务器serializedSNBT只读取证，不构造成功包。

当前限制如表，需最终整合path/hash才启动。旧49143 final0536 23/23维持历史通过，新字段尚无LAN通过结论。
