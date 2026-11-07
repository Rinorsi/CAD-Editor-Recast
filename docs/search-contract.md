# Host search v1（Java → Oriel / Rhino）

增量接口；既有 registry.* 推送继续工作。只有本地编辑器 Document 可调用，不授予服务器页面新能力。生产入口是 RegistryBridge.attach 自动挂接的 SearchChannel；前端切换由 UI 作者完成。

## 请求与响应

发送消息名 **search**；监听 patch 的顶层字面键 **search.result**（不是嵌套路径）。

~~~js
oriel.send('search', {
  requestId: 'items-17', view: 'item-picker', kind: 'items',
  query: 'zsj', offset: 0, limit: 80,
  filters: { namespaces: ['minecraft'], tags: ['minecraft:swords'] }
});
oriel.on('patch', function (p) {
  if (p.key !== 'search.result') return;
  var r = p.value;
  if (r.requestId !== currentRequestId) return;
  if (r.error) { /* 显示错误并保留手动ID输入 */ return; }
  if (!r.ready) { /* 等待：不要把旧列表清空，不必轮询 */ return; }
  // 仅用 r.entries 绘制当前窗口；下一页从 r.nextOffset 继续。
});
~~~

字段约束：requestId必填字符串1–128字符；kind必填字符串≤247字符；view默认使用规范化kind，字符串1–128字符。每Document最多8个view，建议选择窗固定使用 item-picker / sound-picker 等view，别把requestId放进view。query默认空，≤128个UTF-16字符；offset默认0，整数0–10000；limit默认80，整数1–200。整条请求≤8192字符。filters可省略；namespaces/tags各最多32个字符串，单值≤512字符；namespaces取并集，tags取交集，标签ID不带#。

先回应状态（有时同一tick内随后即有结果）：

~~~json
{"version":1,"requestId":"items-17","kind":"minecraft:item","generation":"1","ready":false,"phase":"building","progress":0,"total":1506}
~~~

phase为capturing/building/querying。progress是已采集/构建的行数，**不是0–1百分比**；采集期间total=0表示总量未定；阶段切换progress可能归零。未完成且进度变化时最多每250ms再发状态。最终结果自动送达，不要求页面轮询或重发。初始16类复用世界预热的采集结果，尚未到达该source时进度可能暂时为0。

~~~json
{"version":1,"requestId":"items-17","kind":"minecraft:item","generation":"1","ready":true,"offset":0,"total":1,"entries":[{"id":"minecraft:diamond_sword","name":"钻石剑","namespace":"minecraft"}],"nextOffset":1,"done":true,"namespaces":[{"id":"minecraft","count":1506}],"namespacesTruncated":false}
~~~

- entries为已排序的轻量结果，行字段id/name/namespace，声音等可有subtitle。**不含完整组件、关系或资源元数据**；需要时继续用既有registry接口按ID读取。name来自实际当前语言/注册表，未翻译保留ID。英文名从当前资源管理器的lang/en_us.json读取（对应item/block/entity/effect/enchantment翻译键）；其它类型仍可按英文资源ID搜索。
- total是当前查询及过滤条件匹配的完整行数；namespaces的count是该kind全目录数量，方便过滤器展示，不是当前query计数。
- 一次请求只发一个最终窗口，最多limit行、结果行JSON约14k字符、完整响应≤24k字符；可能因字节预算少于limit，**必须从nextOffset续读**。done只表示本次查询已到末尾，不表示全注册表已传到页面。
- 每次翻页用新requestId、同一view/query/filters，offset=上个nextOffset。不累积绘制所有旧页，保留可见窗口与少量预取窗口。
- offset>10000显式BAD_REQUEST，要求缩小搜索/过滤。这样避免页面为深翻页保留无界top-N缓存。空query无过滤直接按ID切片，O(limit)，可立即显示第一页，不遍历全量。
- namespaces最多512项，按ID稳定排列；更多时namespacesTruncated=true。若命名空间目录使完整响应超24k，则省略namespaces并置truncated；行仍含namespace，允许直接输入namespace过滤。它表示资源命名空间，**不保证等同Fabric modId**。

## 排序、匹配与稳定性

英文不区分大小写；query去空格、英文/弯引号，ü写v，与现有页面拼音习惯一致。字段包含ID全名、去namespace的path、当前显示名、可用英文名、字幕，以及主读音全拼/首字母；多音字、全拼/首字母混写、汉字混写由有限长度动态规划匹配。不展开指数级多音组合，不运行Rhino匹配器。数据读自现有MIT拼音表，未维护另一套手写读音。

排序分组：完全相等 → 前缀 → 词边界 → 子串。主读音拼音键参与该排序；仅在其它字段不命中时，替代读音/混写再按完整/前缀/子串分组；同分按完整ID字典序，生成内固定，不依赖HashMap迭代顺序。不是JEI语法兼容层：不支持任意正则、OR表达式、配方可合成性、跨字段分词AND或自动模组名称解释。限定模组用filters.namespaces，限定标签成员用filters.tags。

## 取消、重载、不可用

同Document、同view的新请求自动使旧token过期；工作线程定期检查，旧结果投递前再检查request token、Document身份及generation。不同view互不取消。显式取消：

~~~js
oriel.send('search', {requestId:'cancel-18', view:'item-picker', kind:'items', cancel:true});
~~~

取消回应含cancelled:true，不承诺发送被取消请求的终态。关闭页面也取消；页面仍应检查requestId，防止早已送到的旧响应更新当前窗口。

沿用RegistryBridge失效来源：世界/语言对象变化、客户端TAGS_LOADED、客户端资源重载完成。所有索引一次换代并取消旧构建/查询；不会交付上代数据。失效时旧pending请求丢弃，前端在新的registry.meta generation到达时重新提交当前搜索。初始16类在预热中自动构建，其它kind首用后同代复用；资源重载后的首次搜索重新构建懒目录。

错误响应含version/requestId/kind/generation、ready:false和error，不含entries：

| error | 含义 / 下一步 |
|---|---|
| BAD_REQUEST | 字段类型、请求大小、分页或查询长度非法；修正请求 |
| UNKNOWN_KIND | 当前客户端没有该注册表/选择来源；保留手动输入 |
| UNAVAILABLE | 未进入世界，或远程服务器未同步完整战利品/配方；手动输入 |
| BUSY | view或工作队列已满；取消旧view，稍后用新requestId重试 |
| INDEX_LIMIT | 目录超过行数/文字/内存/种类预算；不伪装成截断的成功结果 |
| INDEX_FAILED | 采集、词表或构建失败；检查宿主日志，资源重载后重试 |
| QUERY_FAILED | Java查询或编码失败；保留原列表及手动输入，检查宿主日志 |

## kinds与权威来源

规范化kind出现在响应中；请求可用页面原别名。

| 请求kind | 响应kind / 来源 |
|---|---|
| items / item / minecraft:item | minecraft:item，当前世界预热 |
| blocks、entity_types、enchantments、mob_effects、sounds、data_component_types及RegistrySnapshot.KINDS其余别名 | 对应minecraft:注册表，同代预热 |
| 任意实际registry ID | 当前客户端RegistryAccess/BuiltInRegistries；切片采集 |
| tags:item / tags:block / tags:damage_type / tags:mod:registry | tags:minecraft:item等；真实标签列表；filters.tags用于筛选注册表条目的标签成员 |
| camera_overlay、profile_texture、profile_cape、profile_elytra、item_model | 现有ResourceIds定义，资源包覆盖后的资源管理器目录 |
| tooltip_style、equipment_asset | 现有RegistryChoices资源目录 |
| enum:... | 现有RegistryChoices官方枚举/Codec来源 |
| recipe / recipes / minecraft:recipe | 集成服务端RecipeManager；远程服未同步时UNAVAILABLE |
| loot_table / loot_tables / minecraft:loot_table | 集成服务端reloadable loot registry；远程服未同步时UNAVAILABLE |
| dimension / minecraft:dimension | 当前连接同步的维度ID |

block_properties是结构化属性表，继续用旧registry协议，搜索选择目标方块用blocks。模型提示/item defaults/单实体默认NBT不建立全文索引，继续按ID读取。任意模组注册表由实际存在性判断，禁止手写模拟候选。

## 线程与内存边界

活注册表读取仅客户端tick，额外目录采集共350µs软预算（单个API调用不可抢占）；集成服务端配方/loot在服务器线程采集；稳定资源目录在资源工作线程读取。脱离游戏对象后的正规化、拼音预计算、索引、查询、JSON编码均在后台。只把最终小响应切回客户端patch；没有修改Oriel或放宽脚本预算。

搜索索引为ID排序的不可变行数组 + 1024桶散列bigram BitSet候选索引。碰撞必须最终验证，不造成假阳性；中文读音候选有保守回退，常见1字符/多音混写仍可能O(N)，但在Java工作线程，不阻塞渲染。后台构建1线程队列32；查询2线程队列32；资源1线程队列32。每个kind≤250000行、每个字段≤512字符、每行≤4096个标签；单索引估算≤256MiB、索引目录共估算≤384MiB、最多32个kind。超限显式拒绝，不悄悄截断数据。

这些是搜索结构的准入估算，不是JVM RSS硬上限：已有registry JSON/编码页、词表、资源扫描、正在构建的输入、GC与短暂旧generation仍需额外内存。20万合成条目的新增保留堆约165MiB，不能称为低内存方案；减少双份registry传输/存储见search-architecture迁移计划。此阶段不宣称支持任意大小模组包。
