# 编辑器错误与页面耗时日志

默认启用，不需要玩家开启设置中的调试选项。日志写入当前 Minecraft 实例的 `logs/latest.log`。
游戏退出后也可能归档为日期命名的 `.log.gz`。反馈时说明操作、游戏版本、加载器、
发生时间和是否首次打开；尽量保留出错前后的完整日志，不只截最后一行。

## 如何看

| 标记 | 含义 |
| --- | --- |
| `[CAD-Editor] stage=… context=…` | Java 内部错误／资源警告；后面附异常堆栈 |
| `[CAD-Editor-UI] site=…` | UI 回调、重绘或序列化处理失败；包含错误和截断的 JS 堆栈 |
| `[CAD-Editor-Perf] … stage=boot load_ms=…` | 宿主开始加载页面到执行完成 UI boot 标记的耗时 |
| `[CAD-Editor-Perf] … stage=first_frame_callback load_ms=…` | 同一起点到第一次 requestAnimationFrame 回调的累计耗时 |

两个耗时不是相加的两个阶段。达到 250ms 使用 WARN，其余 INFO；`slow=true` 是诊断阈值，
不代表保存失败。计时采用宿主单调时钟，不相信页面传入的耗时。

计时不包含打开页面前的快捷键／服务器请求等待，也不等于 GPU 已经呈现画面。
日志不是连续帧率监控，不能用“没有慢日志”证明游戏没有卡顿。

## 已接入的路径

- 物品、玩家、实体及独立保险库共用的页面日志通道；每次 Document 加载／重载重新计时，
  同一个 driver 不重复注册消息处理器。
- 注册表启动预热、索引、补充数据、资源与搜索后台任务，以及组件／通用结构生成异常。
- 偏好读取、写入任务和文件写入失败。
- UI 注册表订阅、校验订阅、页面重绘、卡片更新与 NBT 序列化相关 catch。
- 物品、世界对象、玩家扩展请求入口捕获的非 `IllegalArgumentException` 运行异常。
  原有拒绝结果仍会返回，内部故障另外记录堆栈。

权限不足、非法输入等正常拒绝不统一升级为内部 ERROR；任务主动取消不作为故障。
外部语言资源读坏记录 WARN 和资源 ID；队列繁忙、索引容量上限也按警告处理。
这不是全项目所有 catch 的穷尽审计，不能据此断言任何未来故障都必然覆盖。

## 体积与开销

- UI 日志异步写出；入口和输出各限制每秒 20 条，队列上限 128，超限摘要每 5 秒最多一次。
- JS 同站点／级别 5 秒内抑制重复；下次允许上报时附重复计数；每页最多记录 64 个不同站点／级别。
- Java 相同阶段／上下文／异常类 30 秒内去重，去重表最多 128 项；这不是跨不同上下文的全局限流。
- 文本长度有限制，并过滤控制字符；不主动附带整份 NBT、背包或请求正文。
  异常 message 自身仍可能包含输入片段，转发日志前可检查个人信息。
- 日志通道失败不会再次递归报错，也不修改业务数据。突然强制结束进程时，未落盘的异步日志不保证保存。

## 2026-11-09 验证

证据根目录：`../Oriel-UI-Workspace/daily/2026-11-09/logs/data-integrity-scale/`。

- `diagnostics-ui.log`：默认 debug=false、异常位置、重复抑制、回调唯一性、日志通道故障隔离，
  真实 `Reg.flush` / `Valid.fire` 失败路径。
- `java-diagnostics/test.log`：宿主时钟、顺序、重载、异步写出及真实 SLF4J → Log4j 文件日志检查。
- `diagnostics-search.log`：异步搜索失败回调、旧代任务取消、日志接收器故障隔离。
- `diagnostics-snapshots.log`：24 个既有页面场景与本轮改动前基线逐字相同。
- `diagnostics-ui-suite.log`：25 套既有 UI 回归通过；新增诊断测试另跑，之后已加入 `ui-check-all.sh`。
- `diagnostics-matrix.log`：26.1.2、26.2、26.3 × Fabric/NeoForge 构建及已配置校验任务通过。
  使用 `-PmcTest=false`，不能据此声称六组合都做过实机启动。
- `diagnostics-live-02/diagnostics-result.json`：Fabric 26.1.2 正式构建包在隐藏、无焦点的隔离单人实例中，
  物品／玩家／实体／独立保险库，以及两次同 driver 重载，共 6 个场景通过。
  注入有明确 fixture 标识的注册表和校验订阅异常，经生产 catch 与原生异步通道写入 `latest.log`；
  每页两条带堆栈的错误、两个唯一耗时标记，8 次重复不刷屏，没有发出保存请求。
- `diagnostics-live-01` 保留失败：测试脚本漏识别正常 `OrielScreen`；未当成产品错误或通过样本。
- `diagnostics-final-audit-reviewed.log`：58 次 RPC 全部隐藏／无焦点，测试产物 hash 一致，
  两次测试的自有进程均退出、25782 无监听。原始严格审计失败日志也保留：
  测试配置 simulationDistance=2 被原版拒绝，以及离线测试凭证引起的用户属性 401／Realms 认证失败，
  三条环境 ERROR 已逐条分类，没有隐藏或宣称整个 Minecraft 日志零错误。

这里只验证诊断功能；不代表 NBT 类型保真、实时数据源改造或独立 UI 比例已经完成。

## CSS 源位置热点与 0.13

首开采样中 `ComponentValue.column()` 经 `SourceLocation.at()` 为每个组件重复扫描整份 CSS。
Oriel 0.13 为相同源码复用弱引用行索引，索引不持有源码；仍在原调用阶段完成定位，
保留 UTF-16 列号、CRLF 中间偏移及换行/越界语义，不减少组件或推迟样式工作。
性能复核使用冻结资源、独占测量窗口与配对 JVM；原始逐轮记录位于当天工作区
`logs/data-integrity-scale/editor-scale/perf-isolated/`。这属于 CPU 定位实验，不是 GPU 帧率
或真实游戏打开耗时。原生比例的 tooltip、输入法及正式嵌入包还需独立实机验收。

## 打开页面慢的当前证据

原生 Oriel/Rhino CPU 诊断工具：`tools/perf/open-page.ps1`。
使用真实 UI 脚本和 CSS，但字体度量及原生元素是占位，无 Minecraft/GPU/注册表回包，
不能当作玩家实际点击耗时。

`perf-functions` 与 `perf-style-attribution` 显示：`fitTopbar` 首次读取布局触发样式处理，
占约 422–440ms；把样式处理提前仅将约 391–467ms 转移到提前处理阶段，没有减少总耗时。
同批测量中 `buildTabCards` 约 3–4ms，`data.js` 约 10.6ms，不能把主因直接归为“条目太多”。

JFR 样本的 Oriel 顶层帧以 `SourceLocation.at` 为主：CSS `ComponentValue.column()`
为各字段查询列号，每次从整份源码开头扫描，产生重复开销。`CssSyntax.trim` 也有热点样本。
性能修复尚未进入发布包；不能把诊断日志的加入说成加载速度已优化。
