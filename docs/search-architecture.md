# 搜索架构：源码调研、现状审计与新增宿主服务

2026-11-07，CAD Editor Recast，Fabric26.1.2 / Java25 / Oriel0.11。之前完成的是采集/分页/投递优化，**没有把页面搜索移到宿主**。JEI/REI/EMI的关键是长期持有Java数据和搜索结构、缓存可复用信息、丢弃过期搜索、只画可见网格；它们不是每次开窗把全部资料转给另一个脚本VM扫描。

## 八行要点

1. JEI旧版确实用广义后缀树，最新版已换成可替换的Lucene存储，不能混称为同一实现。
2. JEI按名字/模组/标签等字段建立搜索结构，并缓存最终列表、按更新失效。
3. 本次所读JEI过滤/索引入口是同步调用，未发现其独立查询工作线程，不能声称它也靠后台搜索。
4. REI用hashed entry和按参数缓存，把大搜索分区交给最多3条工作线程。
5. REI取消旧future，并在回调回到Minecraft线程时再次核对filter身份。
6. EMI预先bake多个SuffixArray，独立SearchWorker解析和执行查询，仅当前worker可发布结果。
7. 三者保留完整Java匹配结果，再对可见网格分页/裁剪；不是网络式逐条流送全部结果。
8. 我们应让Rhino只接收一小页Java结果，空查询直接切片，查询/重载分代；让Rhino多跑几毫秒解决不了20万条扫描。

## 实际阅读的源码与许可

git clone --depth 1读取真实仓库，再fetch JEI1.16核对历史。副本在.search/research（已忽略），clone/fetch日志在logs/search。调研日期不代表仓库API与26.1.2相同。没有复制三者实现代码。

### JEI

主快照：[fb7428472f019a0c13fb3fdc7fb5c4250ae869bc](https://github.com/mezz/JustEnoughItems/tree/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc)。

- [IngredientFilter](https://github.com/mezz/JustEnoughItems/blob/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc/Gui/src/main/java/mezz/jei/gui/ingredients/IngredientFilter.java)：构造时收集元素、创建ElementSearch；ingredientListCached缓存最终列表；dirtyIngredients/dirtySearchIndexes追踪变更，重建有关字段，不在敲键时重采所有材料。getElements同步更新脏状态、过滤、排序/缓存。
- [ElementSearch](https://github.com/mezz/JustEnoughItems/blob/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc/Gui/src/main/java/mezz/jei/gui/search/ElementSearch.java) / [PrefixedSearchable](https://github.com/mezz/JustEnoughItems/blob/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc/Common/src/main/java/mezz/jei/common/search/PrefixedSearchable.java)：按字段创建可替换ISearchStorage，不把所有语法混成一个正则扫描器。
- [LuceneSearchStorage](https://github.com/mezz/JustEnoughItems/blob/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc/Common/src/main/java/mezz/jei/common/search/LuceneSearchStorage.java) / [PluginLoader](https://github.com/mezz/JustEnoughItems/blob/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc/Library/src/main/java/mezz/jei/library/load/PluginLoader.java)：默认工厂为Lucene；内存ByteBuffersDirectory、StringField、stable valueId、WildcardQuery及LRU查询缓存。pending写入、reader刷新、删除支持、字段索引局部更新。每存储缓存最多128项且≤min(4MiB,maxHeap/160)，不是整个JEI只占4MiB。
- [IngredientGridWithNavigationController](https://github.com/mezz/JustEnoughItems/blob/fb7428472f019a0c13fb3fdc7fb5c4250ae869bc/Gui/src/main/java/mezz/jei/gui/overlay/ingredients/IngredientGridWithNavigationController.java)：从可见行/当前页计算firstIndex/endIndex，再subList给固定网格。完整匹配结果仍在Java，不逐条流送UI。
- 线程：IngredientFilter→ElementSearch→storage构建/查询是直接同步调用；JeiGuiStarter在GUI启动时创建它。**这些入口没有证明JEI的build/search在专用后台线程**。不将REI/EMI策略张冠李戴给JEI。
- 内存：字段字符串、Lucene目录、valueId映射、结果集合及查询缓存；没有运行JEI，未测总堆。

历史对照：[1.16 @ 692a451ad2ca68932ab36de9b4f0eb9c5c13b7bd 的GeneralizedSuffixTree](https://github.com/mezz/JustEnoughItems/blob/692a451ad2ca68932ab36de9b4f0eb9c5c13b7bd/src/main/java/mezz/jei/search/suffixtree/GeneralizedSuffixTree.java)是Ukkonen式节点/边索引，沿query路径查找，再取后代关联集合；结果数仍影响输出成本，不能只引用O(query长度)。历史IngredientFilter还有低内存慢搜索分支。JEI项目MIT，**这个历史后缀树文件自身为Apache-2.0、Copyright2012 Alessandro Bahgat Shehata**；不能只保留MIT声明后照抄。

### REI

快照：[2be20928abd9f1164fd9fd251268041c036b580f](https://github.com/shedaniel/RoughlyEnoughItems/tree/2be20928abd9f1164fd9fd251268041c036b580f)，仓库LICENSE及所读文件MIT。

- [EntryRegistryImpl](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/common/entry/type/EntryRegistryImpl.java)：entriesHash按hashExact去重、复杂条目及预过滤列表；startReload/endReload清理/重建注册内容，增删通知监听器。
- [SearchProviderImpl](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/client/search/SearchProviderImpl.java) / [ArgumentCache](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/client/search/argument/ArgumentCache.java)：参数惰性解析/memoize；按参数类型与entry hash缓存；REI-Cache有2线程，是否分区异步取决配置和规模。不是所有字段共用一个后缀树。
- [AsyncSearchManager](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/client/search/AsyncSearchManager.java)：最多min(3,CPU)工作线程，按配置分区，allOf汇总完整列表；取消旧future、每条循环检查filter身份，有同步小列表路径和90s超时。
- [EntryListSearchManager](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/client/gui/widget/entrylist/EntryListSearchManager.java)：同filter结果缓存，排序/折叠后submit回MC线程，再检查当前filter。
- [PaginatedEntryListWidget](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/client/gui/widget/entrylist/PaginatedEntryListWidget.java)按网格页分配槽位；[ScrolledEntryListWidget](https://github.com/shedaniel/RoughlyEnoughItems/blob/2be20928abd9f1164fd9fd251268041c036b580f/runtime/src/main/java/me/shedaniel/rei/impl/client/gui/widget/entrylist/ScrolledEntryListWidget.java)从滚动偏移开始、超可见底边即停止render。**该滚动实现仍可能预分配max(stacks.size*3,可见槽位*3)个widget，不能夸成所有节点严格O(可见行)。**
- 内存：hash包装、每参数缓存、完整结果/分区临时列表、折叠及可能预分配的widget；未测整包堆，没有固定MiB承诺。

### EMI

快照：[aa88611211e445bf35c4f7ff4db317a19308b811](https://github.com/emilyploszaj/emi/tree/aa88611211e445bf35c4f7ff4db317a19308b811)，MIT。

- [EmiStackList](https://github.com/emilyploszaj/emi/blob/aa88611211e445bf35c4f7ff4db317a19308b811/xplat/src/main/java/dev/emi/emi/registry/EmiStackList.java)：注册物品/流体/适配器、namespace分组、严格比较/key索引、隐藏过滤/别名。创造分类updateEntries明确submit到客户端线程，不能据此在任意后台调用所有MC API。
- [EmiSearch](https://github.com/emilyploszaj/emi/blob/aa88611211e445bf35c4f7ff4db317a19308b811/xplat/src/main/java/dev/emi/emi/search/EmiSearch.java)：bake名字/tooltip/mod/alias的Minecraft SuffixArray；TOKENS tokenizer支持前缀、引用、正则、AND/OR/否定，再创建Query组合。
- [EmiReloadManager](https://github.com/emilyploszaj/emi/blob/aa88611211e445bf35c4f7ff4db317a19308b811/xplat/src/main/java/dev/emi/emi/runtime/EmiReloadManager.java)：标签/配方同步协调触发ReloadWorker线程，列表/配方等完成后bake索引。不是开每个选择框重新bake。
- 每次search创建daemon SearchWorker；NameQuery先对suffix array findAll构建命中identity set；worker扫描source做组合判定，每1024条检查currentWorker，仅当前worker可apply不可变最终结果。**不是每命中一条就通知UI重画**，也不是完全不扫描列表。
- [EmiScreenManager](https://github.com/emilyploszaj/emi/blob/aa88611211e445bf35c4f7ff4db317a19308b811/xplat/src/main/java/dev/emi/emi/screen/EmiScreenManager.java)：SidebarPanel/ScreenSpace按pageSize*page偏移渲染、getPage取subList，只画当前页，不为全材料创建Rhino DOM。
- 内存：多套suffix arrays、baked identity set、Query命中set、完整结果与别名；随字符串/命中数增长。未测整包MiB，不能据源码断言比我们省多少。

## 应采用什么

| 原理 | 对本项目的应用 | 本次状态 |
|---|---|---|
| Java长期索引/字段预计算 | 活MC资料先切片脱离对象，后台建立名字/ID/英文/拼音资料，同代复用 | 已新增 |
| 取消旧查询，投递前复核 | requestId + view token + Document身份 + generation；关闭/重载取消 | 已新增 |
| 屏幕只拿小窗口 | Java已排序top-N与total/nextOffset，Rhino不扫20万条 | 接口已新增，UI需接线 |
| 索引更新分代 | 世界/语言/标签/资源重载失效；初始16类预热，其余首用建一次 | 已新增，保守整代失效 |
| 保留权威边界 | 配方/loot在集成服务端采；远程未同步则UNAVAILABLE；不伪造资源目录 | 已保留 |
| 缓存不等于免费内存 | 限kind/行数/字符/估算内存/队列；超限显式错误 | 已新增，仍需整包实测 |
| 可见网格绘制 | UI保留可见80–200行，翻页替换，避免累计DOM | 属前端，未改 |

自主实现1024桶散列bigram BitSet候选索引 + 精确验证，不引入Lucene、不抄后缀树。为完整多音/混写匹配，汉字行有保守候选回退；某些词仍O(N)。这是移除Rhino全扫描和提供有限窗口的一版，不冒充JEI级成熟搜索引擎或任意规模常数延迟。

## 后端优化审计

| 项目 | 接任务之前 | 本次之后 / 未完成 |
|---|---|---|
| 初始采集 | 16类、350µs软切片、世界代缓存；已有离屏报告约8.5s | 复用采集，活MC读取不搬后台；没有宣称消掉8.5s |
| 编码/分页 | 后台RegistryIndex，20k目标页/24k上限、最多8页/tick、2ms软预算、互动优先；已有56页/max tick5.6ms报告 | 保留；非抢占patch不能保证2ms硬上限。非本次新功能 |
| 原search | RegistryIndex.search仅Map.values逐条contains，无拼音/排序，未接页面 | 新search消息、SearchCatalog/SearchIndex，未删除旧方法 |
| 查询线程 | 页面ES5在Rhino单线程扫描，Java无查询服务 | Java查询2线程/队列32，编码也后台，最终小patch回客户端 |
| 索引线程 | 原后台只排序、ID查找、search_key、分页 | 新build1线程/队列32；初始kind预热脱离后建，其它懒建 |
| 匹配/排名 | JS拼音缓存/切片，无宿主排名 | 中文/英文/ID/拼音/混写/多音，exact/prefix/boundary/substring，ID稳定排序 |
| 取消/重载 | JS可取消切片，无宿主token | latest-wins、close/reload/旧Document响应抑制，纯JVM覆盖 |
| 结果量 | registry.*全量入JS，picker扫全量再画80–200行 | 搜索只回≤200行/≤24k、nextOffset；旧全量仍保留 |
| 内存 | JSON、编码页、原始JS列表、归一化缓存多份 | 新索引约165MiB/20万合成行；估算目录384MiB、单kind256MiB准入；非RSS上限，双份存储未迁移 |
| 元信息 | 当前语言名，标签部分导出 | 所有注册表行补真实holder tags；英文en_us映射；namespace/count，namespace不保证=modId |
| UI虚拟化 | JS扫描+DOM；Enter/按钮只改变触发方式 | 未改受保护UI，需前端改用search.result并限制DOM |

56页/8.5s/5.6ms是Lead提供的已有测量，非此次重测；本次测新索引/消息服务，不能把旧30秒分页基线说成当前速度。

## 纯JVM合成负载实测

Java25.0.5+8、-Xmx2G、当前本机。固定400个合成namespace、16标签、80%中文名、真实现有拼音表、英文名/常见ID；不是MC注册表，不写入产品候选。先建索引、GC后测保留堆差（含新建行/字段/索引，不含预先载入拼音表），每词预热8次、采样40次。不是JMH，分位数仅本机样本。日志logs/search/bench.log，入口tools/registry/search-test.ps1 -Bench。

| 行数 | 建索引ms | 新增保留堆MiB | 内部估算MiB |
|---:|---:|---:|---:|
| 1500 | 57.186 | 1.270 | 1.358 |
| 50000 | 546.530 | 41.202 | 45.805 |
| 200000 | 976.464 | 164.776 | 184.815 |

limit=80、offset=0，不含UI、客户端tick或patch解析；单位ms（p50 / p95）：

| query | 1500 | 50000 | 200000 |
|---|---:|---:|---:|
| s（1字符，匹配全部ID） | 0.243 / 0.468 | 11.851 / 15.234 | 39.651 / 49.345 |
| dia（3字符） | 1.001 / 1.817 | 16.111 / 22.722 | 59.720 / 70.177 |
| zsj（首字母） | 0.802 / 1.632 | 13.438 / 18.690 | 50.412 / 57.677 |
| 钻石（中文） | 0.109 / 0.169 | 1.702 / 2.554 | 6.873 / 9.339 |
| chongx（替代读音/混写） | 0.221 / 0.473 | 10.077 / 14.197 | 31.587 / 39.827 |

中文直接用bigram候选；拉丁/多音为不漏结果可能检查大部分汉字行，三字符不必比一字符快。total精确，所以常见词不是只检查前80条就停止。空query无过滤直接切片，不扫描N行。没有保证200k目录每个词≤70ms，也没有500模组包内存/source采集/帧率证据。

## 隐藏真客户端验证

沿用supplement-run创建前隐藏/不聚焦、屏幕外-32000、NoMouseCapture、音量0的独立世界；javac启动，不运行Gradle、不碰用户进程/系统输入。SearchProbe打开最小Oriel本地页、挂真实RegistryBridge/SearchChannel，测试新消息/实际MC来源，不是完整选择窗视觉验收。

已验证：1506真实物品空查询窗口、钻石剑中文、zuansj混写、zsj首字母、diamond sword英文名、minecraft:swords标签成员、tags:item、item_model、集成服loot/recipe、同view旧响应抑制、未知kind错误、ready:false、≤limit/24k、零脚本错误。结果和wall_ms见logs/search/live-verification.json；每客户端tick观察一次，墙钟含50ms量化/初次懒建/主线程调度，不能当算法p95。

首个探针误把歧义首字母前12条必含钻石剑作为通用断言，后改80条窗口并完善替代读音排名；失败回执保留live-first-attempt.json。另一次包装脚本读错回执文件名，已修正重跑，没有把该失败计为通过。

## 大模组包迁移：建议改，暂不破坏旧接口

**应停止把200k行先全部推给Rhino。** 新search是增量部分，若保留旧全量缓存反会增加Java/JS内存，不能宣称整包优化完成。

1. UI先将物品/声音/方块选择器改search窗口，菜单只留kind/count/generation/namespace元信息，保留手动ID及单件defaults/关系/属性查询。
2. 增加明确页面能力协商，例如search-v1，只有声明支持的Document才停发大目录。小枚举/当前物品必要数据可初始交付，老页面保留旧协议。**本次未默认停推，也未提前实现未经前端接线验证的开关。**
3. 协商上线后去掉大目录的JS缓存；Java端采用轻量SearchIndex + 必要按ID资料，减少RegistryIndex JSON/编码页重复常驻，旧页按需兼容。
4. 用300–500实际模组测入世界采集峰值、首次可搜索时间、常驻堆/重载峰值、查询取消和可见帧。若混写回退仍高，用更精确的读音token候选索引；若heap不够，改紧凑列式/可逐出索引，不能靠放大堆掩盖双份存储。

## 验证边界

纯JVM覆盖排名、中文、拼音/首字母/混写/多音/ü、英文、namespace/tag、稳定分页、取消、构建中取消、reload、容量拒绝；全Java源独立javac通过。searchTest已加入Gradle check；实际执行 :fabric:26.1.2:searchTest 与 :fabric:26.1.2:build 通过，完整输出见logs/search/gradle-build.log。运行前检查未发现用户游戏进程，记录见logs/search/pre-gradle-processes.json。

未验证：真实300–500模组包、远程服务器连接、真实资源热重载完整UI恢复、完整选择窗虚拟化/GPU帧率、三款配方查看器运行时总堆。通用mod注册表/其余资源类只有编译与共享实现覆盖，没有逐类真客户端穷举。未改Oriel库。
