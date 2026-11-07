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

- entries为已排序的结果，保留该kind旧目录行的所有字段和值，再增加namespace（例如resource、count、translation_key、tags、search_key及声音字幕）。完整物品组件/defaults、block_properties等独立按ID接口仍需另行读取，不会因为搜索而采集整件元数据。name来自实际当前语言/注册表，未翻译保留ID。英文名从当前资源管理器的lang/en_us.json读取（对应item/block/entity/effect/enchantment翻译键）；其它类型仍可按英文资源ID搜索。
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

搜索索引为ID排序的不可变行数组 + 1024桶散列bigram BitSet候选索引。碰撞必须最终验证，不造成假阳性；中文读音候选有保守回退，常见1字符/多音混写仍可能O(N)，但在Java工作线程，不阻塞渲染。后台构建1线程队列32；查询2线程队列32；资源1线程队列32。每个kind≤250000行、每个字段≤512字符、每行≤4096个标签；单索引估算≤256MiB、索引目录共估算≤768MiB、最多64个kind。超限显式拒绝，不悄悄截断数据。

这些是搜索结构的准入估算，不是JVM RSS硬上限：已有registry JSON/编码页、词表、资源扫描、正在构建的输入、GC与短暂旧generation仍需额外内存。20万合成条目的新增保留堆约165MiB，不能称为低内存方案；减少双份registry传输/存储见search-architecture迁移计划。此阶段不宣称支持任意大小模组包。

## lazy-catalog-v1（2026-11-07）

消息名完全沿用约定：协商仍走 **registry**，回复字面键 **registry.client_features**；目录声明位于 **registry.meta** 的lazy字段；查询和精确ID读取仍走 **search → search.result**。所有能力仅限本地Editor Document。

页面的第一条registry消息必须为：

~~~js
oriel.send('registry', {name:'client_features', features:['lazy-catalog-v1']});
~~~

能力按Document保存；新Document必须重新协商。第一条registry消息已用于其它请求，再协商不接受；不发送协商或只声明未知feature的页面完全沿用旧目录推送和旧信封，不增加meta.lazy字段。search消息不计入“第一条registry消息”。世界/语言/标签/资源重载保留同一Document的能力，目录和索引仍换代。

协商后，宿主先在后台读取固定资源目录和可用的集成服loot/recipe来源，等计数确定（或来源明确不可用）再发client_features回复及初始发布。因此回复可能比发送晚几个tick；不要立即发出旧目录请求作为超时回退。接收accepted后采用搜索窗口。meta.lazy后续可随着实际采集补充，计数不是伪造候选。不可用来源count=0不表示其搜索可用；远程loot/recipe仍返回UNAVAILABLE。

固定LAZY：

| 页面请求/registry键 | 同时声明的规范名或别名 |
|---|---|
| items | minecraft:item |
| blocks | minecraft:block |
| sounds | minecraft:sound_event |
| tags:<registry>，所有真实注册表的标签目录（含空目录） | tags:item和tags:minecraft:item等默认namespace双写；模组注册表用tags:mod:registry |
| loot_table / loot_tables | minecraft:loot_table |
| recipe / recipes | minecraft:recipe |
| item_model、camera_overlay、profile_texture、profile_cape、profile_elytra | 相同名字 |

另外，任何其它实际注册表/资源目录在采集时 **count>600** 即LAZY；唯一阈值常量LazyCatalog.THRESHOLD=600，600仍推送、601停止自动推送。小kind按原接口推送：enchantments、mob_effects、attributes、potions、instruments、jukebox_songs、banner_patterns、trim_materials、trim_patterns、painting_variants、damage_types、entity_types、data_component_types，以及小enum/variant目录。上述初始别名和对应minecraft:<单数注册表路径>均可出现在lazy中。这里只改变自动发布策略；原本按需的小目录不会因为协商变成新的自动推送。

协商Document不会收到LAZY种类的世界预热目录页；宿主也不为它们编码全目录。预热只保留计数占位和后台SearchIndex；行载荷保留为共享schema+值数组，不保留Gson行树。小目录继续原来的缓存和推送。未协商Document才按需后台重建旧的完全相同目录页，并在该Document缓存；与协商Document同世界共存时，这些旧页属于旧Document，后者关闭/重载即释放。

显式oriel.send('registry',{name:'items'})仍返回旧全目录，作为逃生口；协商页面的该次分页只在队列中暂存，不进入持久页缓存。资源目录的显式回复同样不会在协商页面消费后留下LAZY目录缓存。item_defaults_one、item_meta*、entity_info、block_properties、关系及其它单ID业务接口保持原样。

### 当前值精确读取

~~~js
oriel.send('search', {
  requestId:'current-items-1', view:'lookup', kind:'items',
  ids:['minecraft:diamond_sword','mod:missing']
});
~~~

ids最多64项，字符串ID（每项≤512字符、整个请求仍≤8192字符）；65项返回BAD_REQUEST。空数组合法。结果entries按请求顺序保留已找到的行，重复ID也保留；missing按请求顺序列出未知ID，不把未知ID作为错误。total=entries.length、offset=0、done=true；同样有ready:false等待/取消/重载规则。ids模式忽略query及filters，读取的是准确ID，不用query替代查找。

lookup只是示例view名，也占每Document最多8个view的名额；固定使用该view会取消上一个lookup，但不会取消item-picker、sound-picker等其它view。命名空间目录在普通查询、空查询、有filters及lookup结果中均来自整个kind的计数，不随搜索过滤而缩减。

行形状与旧目录完全一致再加namespace，含资源的resource、标签的count/name/translation_key以及声音的subtitle等实际存在字段，不凭空补写缺失字段。结果仍受14k行JSON/24k整包字符预算约束；普通搜索用nextOffset继续。精确读取不静默截断：极端宽行使整组超14k时返回QUERY_FAILED，应分成更小组读取；这不是“未知ID”。

搜索目录总准入预算现在为估算768MiB，单kind仍256MiB、最多64kind（其中23个协议核心来源先预留空槽，避免其它目录挤满后协商无法完成）；提高总预算是为了允许本轮items+blocks+sounds各20万行的有界场景。估算不是RSS或堆硬限制；达到限额返回INDEX_LIMIT。大包仍必须实测，不能把本轮约600MiB索引叫成低内存方案。

### 离屏真实响应摘录

同一个真实世界中打开旧Document和协商Document；以下取自daily/2026-11-07/lazy-catalog/run/lazy-verification.json。features仅省略其它真实注册表/别名的lazy键，数值未改写：

~~~json
{"accepted":["lazy-catalog-v1"],"lazy":{"items":{"count":1506},"blocks":{"count":1168},"sounds":{"count":1902},"tags:item":{"count":471},"item_model":{"count":1507},"camera_overlay":{"count":552},"profile_texture":{"count":18},"profile_cape":{"count":0},"profile_elytra":{"count":1},"loot_table":{"count":1326},"recipe":{"count":1515}}}
~~~

精确资源ID读取的完整search.result（requestId由探针生成）：

~~~json
{"version":1,"requestId":"q4_1","kind":"item_model","generation":"1","ready":true,"offset":0,"total":2,"entries":[{"id":"minecraft:zombified_piglin_spawn_egg","name":"minecraft:zombified_piglin_spawn_egg","resource":"minecraft:items/zombified_piglin_spawn_egg.json","namespace":"minecraft"},{"id":"editor_supplement_probe:nested/only_definition","name":"editor_supplement_probe:nested/only_definition","resource":"editor_supplement_probe:items/nested/only_definition.json","namespace":"editor_supplement_probe"}],"missing":["missing:unknown"],"nextOffset":2,"done":true,"namespaces":[{"id":"editor_supplement_probe","count":1},{"id":"minecraft","count":1506}],"namespacesTruncated":false}
~~~

同次验证另确认：旧页items/blocks/sounds完整逐行一致；协商页这三类及tags:item/item_model的自动推送次数为0；namespace列表在filters.namespaces=['minecraft']时仍包括其它实际命名空间；65个ids收到BAD_REQUEST；显式items逃生口完整返回且未保留页缓存。
