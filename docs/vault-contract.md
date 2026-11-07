# 本机保险库协议（26.1.2 / v1）

实现：vault/VaultStore、vault/VaultStacks、registry/VaultChannel。2026-11-07。

## 传输与页面生命周期

页面消息名 **vault**；监听字面 patch key **vault.result**（不是嵌套路径）。只接入本地 DocumentDriver，serverSession 不接入；没有服务端 payload、上传服务或审计记录。

所有请求：{op,requestId,view?,...}。requestId 必填非空，最长128个UTF-16单元；view 默认 vault，非空且最长128。每页面最多8个固定 list view。list 在客户端 tick 合并，同 view 最新请求覆盖旧请求，包括被限流的新请求；换文档/关闭页面取消待发列表。每tick最多完成一个list，首次打开、切换世界/语言时每tick最多验证8个条目。其他操作按收到顺序执行，不合并写操作。

请求序列化后最多8192字符，响应最多24000字符；每页面每秒20次（含upload），超限 BAD_REQUEST 或 BUSY。JSON深度最多96。长度按Java/JS UTF-16单元；磁盘配额按UTF-8字节。

成功共同字段：{version:1,requestId,op,ok:true,revision,persisted,readOnly,warning?,storageError?,...}。revision 是进程内修订号；persisted:false 表示内存接受、等待后台落盘，不能显示“磁盘备份完成”。stats 可以轮询；storageError:WRITE_FAILED 表示写失败，内存数据保留并每2秒重试。upload/give有独立回执，没有revision/persisted。

失败：{version:1,requestId,op,ok:false,error,reason}。reason最长512字符，可显示；不要按reason文本分支。首次异步加载文件未完成返回NOT_READY，稍后重试。

主菜单：通道不要求世界即可list/get/update/delete/restore/duplicate/import/export/tags/stats。无法解析组件时标记compatibilityUnknown:true，不会误报incompatible。save/give需要世界；save使用当前世界注册表严格验证，否则UNAVAILABLE。物品编辑器入口仍需玩家/世界；独立保险库入口见下节。

## Opening modes / 打开模式

`VaultClient` 打开同一页面 `cadeditor:ui/index.html`，使用 Oriel 0.11 公共 `OrielScreen` / `DocumentDriver` 接口。页面初始 `oriel.data` 的完整键为：

```json
{
  "mode": "vault",
  "world": null,
  "stack": null,
  "prefs": {},
  "hostPrefs": true
}
```

`prefs` 是 `EditorPrefs.read()` 返回的当前设置（上例空对象仅示意），不是物品/世界快照。页面应按 `mode === 'vault'` 显示独立保险库，不创建物品草稿，不要求 slot/baseline，不默认选择方块编辑。此模式不注册 apply/undo 服务端编辑消息；本机通道仍由 `RegistryBridge.attach` 接入。没有世界的注册表工具应保留其既有 UNAVAILABLE 行为。后续无需世界的工具可复用此页面模式。物品 I / `/cade` 和世界 O / `/cadeditor block|entity` 的数据与权限保持原样。

入口：默认 **V**（控制设置中“打开保险库 / Open Vault”，`key.cadeditor.vault`），主菜单及暂停菜单的 **保险库 / Vault** 小按钮，或世界内客户端命令 **`/cadeditor vault`**。V 在正常游戏 tick 与主菜单/暂停菜单 Screen 键盘事件中读取同一 KeyMapping；改键同步生效。聊天、文本输入、控制改键、已有 Oriel 页面不抢键；Ctrl/Alt/Shift+V 不作为菜单快捷键。26.1.2 Fabric API 将旧 `KeyBindingHelper` / `Screens.getButtons` 命名为 `KeyMappingHelper` / `Screens.getWidgets`。

按钮按 GUI 像素布局，优先右上角，每次绘制前检查所有可见原版/模组控件，保留4像素间距及底部文字区；拥挤到无空位时隐藏按钮，保留快捷键入口，不挪动其他控件。Esc 或页面请求关闭通过 `VaultScreen.onClose()` 返回原 Screen（主菜单、暂停菜单或正常游戏），关闭本地通道，不发送物品/世界编辑 close 请求。

`world:null` 表示没有世界编辑目标，即使玩家在世界内从暂停菜单打开也如此；实际世界是否存在仍由宿主判断。因此主菜单中 save / give 返回 **UNAVAILABLE**；世界中 save 可严格验证，give 还要求创造模式、连接和安全空槽位，详见下文。

## 条目与类型保真

磁盘/分享格式为 {version:1,entries:[Entry,...]}。Entry字段：

|字段|含义|
|---|---|
|id|规范小写UUID|
|name|用户标签，最多256；save默认当前语言的物品显示名，空白save名称回退默认，update不允许空白|
|tags|最多8个，单个非空且最多24；去首尾空白并去重；筛选为全部标签同时匹配|
|note|最多200|
|created / updated|非负整数Unix毫秒|
|mcDataVersion / modVersion|保存时的数据版本和模组版本|
|stack|{id,count,comps,removed,component_snbt?}；输入也接受component_formats|

实际捕获见 [vault-captured.json](vault-captured.json)，不是手写注册数据。文件内部附加hash仅用于实现，导出/返回行不包含hash。

save调用与apply相同的 StackCodec.decode + ItemStack.validateStrict，然后重新snapshot，移除上下文slot/label。组件保存typed canonical SNBT sidecar；输入接受component_formats:{组件:"snbt"}。get返回的stack可直接交给现有apply/tooltip/world-edit解码器；顶层apply仍需附宿主原有slot/baseline会话字段。

comps只是JSON显示投影，可能受JS Number精度限制，必须连同component_snbt传递。StackCodec对未改动的浏览器数值投影保留精确sidecar；精确long/数组类型编辑请使用显式SNBT。不可将JSON.stringify(comps)当作精确NBT。

容器、束袋、装备、use_remainder、charged_projectiles、刷怪笼装备等字段取出完整stack，不只复制id/count。嵌套字段的外层组件JSON/SNBT仍需遵循现有编辑器的结构和旧sidecar失效规则。

注意：这是编辑器wire格式，原版嵌套ItemStack Codec的字段名是components，不是comps。前端将它放入原版嵌套字段时，须按该字段schema转换：id/count原样保留；每个comps键用component_snbt中对应的完整typed值写入components（minecraft命名空间补全），removed键写为components中的!完整组件ID与空compound。拼出原版物品SNBT后插入外层组件的typed SNBT，再走既有显式SNBT提交路径；不要只把JSON投影映射过去而丢掉类型。本后端没有自动改变当前编辑文档的嵌套字段。

旧条目在当前注册表无法解码时原样保留，标记incompatible:true,reason，不删除、不做DataFixer迁移。结构有效但Codec不兼容的导入条目也保留，并逐项标记；非法元数据、UUID、stack外形则逐项拒绝。主菜单无法验证时标记compatibilityUnknown。

## 操作

下表省略共同请求字段。各存储操作的完整真实请求/响应见 [vault-captured.json](vault-captured.json)。该文件来自VaultTest调用实际存储实现与26.1.2原版注册表，**不是游戏客户端消息捕获**。

真实 Document → vault → vault.result 往返另见 [vault-client-captured.json](vault-client-captured.json)。来自独立隐藏客户端与复制测试世界，status=PASSED；包含全部操作及upload/give。messages键vault-live-0到18保留实际请求/响应。

|op|请求字段|额外成功字段|
|---|---|---|
|list|query?、tags?、offset?=0、limit?=40(1..100)、sort?=recent(recent/name/item)|entries:[轻量行],total,offset,nextOffset,done；行数据预算20000字符，可提前分页|
|get|ids:[]，最多32|entries:[完整行],missing:[UUID]；完整行含stack；过大RESPONSE_LIMIT，不截断|
|save|stack,name?,tags?,note?,force?=false|entry:轻量行,duplicate:boolean；typed hash相同返回原条目，不覆盖标签；force另存|
|update|id,name?,tags?,note?|entry:轻量行；不能替换stack|
|delete|ids:[]，最多50，全部ID须存在|deleted:number,token:UUID,expires:毫秒；替换上一次撤销|
|restore|token|restored:number；30秒内一次，恢复原ID和元数据，重查配额和ID冲突|
|duplicate|id|entry:轻量行；复制stack/标签/名称，新UUID、created/updated|
|import|entries:[]或text:版本化JSON；version?=1；offset?=0,limit?=32(1..32)|results:[{index,ok,id?,error?,reason?,incompatible?,compatibilityUnknown?}],nextOffset,done；逐页处理，失败不回滚成功项，同ID拒绝|
|export|ids:[](最多2000)或all:true；offset?=0,limit?=6000(1..6000)|text,offset,nextOffset,total,done,revision；整个JSON的一段，拼完再解析；revision变化须重导。Unicode代理对不切开，必要时片段多1单元|
|tags|offset?=0,limit?=100(1..100)|tags:[{name,count}],total,nextOffset,done；名称排序|
|stats|无|entries,bytes,maxEntries,maxEntryBytes,maxFileBytes；及共同存储状态|

轻量行：{id,name,tags,note,created,updated,mcDataVersion,modVersion,item:{id,count},summary?,translatedName?,incompatible?,compatibilityUnknown?,reason?}。

summary为{enchantCount,hasCustomName,containerSize}，containerSize是非空容器物品项数，不假定所有容器27格。list没有stack/SNBT。

搜索name、note、tags、物品注册ID、当前语言翻译名；复用现有Pinyin数据/匹配器，支持中文、拼音、首字母、混合输入。语言切换失效兼容性和翻译缓存。

## 大条目上传和完整取出

8Ki字符请求/24Ki字符响应与64KiB条目无法同时用一个消息满足，因此增加upload、export字符分页；**此扩展来自边界冲突**，没有放宽传输上限。

1. 发送 {op:"upload",requestId:"u1",text:"首段"}，开始新暂存，回 {version:1,requestId,op:"upload",ok:true,token,chars,expires}。每页面一个上传，新建替换旧暂存。
2. 发送 {op:"upload",requestId:"u2",token:"回执UUID",text:"下一段"}。单段最多6000 UTF-16单元，同时整个请求含转义仍须<=8192字符，客户端自行缩小段长；每段延长30秒。不要切开Unicode代理对。暂存最多8Mi字符，最终解析最多8MiB。
3. 大stack暂存为stack对象JSON本身；提交 {op:"save",requestId:"s1",uploadToken:"UUID",name:"可选名称"}。
4. 备份暂存为{version:1,entries:[...]} JSON；提交 {op:"import",requestId:"i1",uploadToken:"UUID",offset:0,limit:32}。使用同token+nextOffset继续，提交刷新30秒期限。
5. 大条目get遇RESPONSE_LIMIT：对单ID分页export，拼接后读取entries[0].stack，获得完整保真stack。多个条目get超限先拆批，单条仍超限再export。

upload真实捕获见vault-client-captured.json的vault-live-11、12、13（两段上传再save）；以上仍为易读形状说明。所有文本在本机内存处理，页面不能选路径、任意读写文件或下载URL。

## give 与原版创造模式

请求 {op:"give",requestId:"g1",id:"条目UUID",slot:"inventory"}。slot默认inventory(索引9..35)，也支持hotbar(0..8)。只找空的玩家背包槽，禁止容器界面操作。沿用EditorClient的ServerboundSetCreativeModeSlotPacket路径，不预测修改客户端背包，不需要服务器模组。生存NOT_ALLOWED，未进世界UNAVAILABLE，无空位INVENTORY_FULL。

回执形状 {version:1,requestId,op:"give",ok:true,status:"sent",confirmed:false,inventoryIndex,creativeSlot}。仅确认包已发送，原版服务器未必回显，不能声称到账。未确认空槽保留到实际同步显示占用或重连，避免快速重复give覆盖未同步物品。cursor没有安全已有路径，返回UNSUPPORTED_SLOT。

give创造模式实机回执见vault-client-captured.json的vault-live-15；仅验证包已发送，没有当成服务器确认到账。需要确定到账时可继续用原有背包槽位apply。生存拒绝分支、远程原版服务器到账未实测。

## 持久化和错误

固定路径 <FabricLoader configDir>/cadeditor/vault.json；上一完整版本vault.json.bak；schema=1。最多2000条、每条65536字节、整文件8388608字节（含JSON/元数据）。超限拒绝，不删旧条目腾空间、不截断正文。

500ms防抖，单后台线程临时文件+原子替换，备份也原子替换。后台只用脱离Minecraft的JSON，磁盘I/O不持有主线程操作使用的锁。客户端关闭flush。写失败有日志和storageError，保留内存并重试。

主文件损坏/截断/超限，先隔离为vault.json.corrupt-时间-UUID，再读bak；坏bak也隔离。warning可为CORRUPT_PRIMARY / RECOVERED_BACKUP / RECOVERY_EMPTY；bak不承诺包含主文件最后一次保存。两份均不可用时明确警告并建空库，隔离文件保留供人工恢复。未来schema不覆盖：SCHEMA_VERSION+readOnly:true；隔离失败：QUARANTINE_FAILED+只读。页面应醒目显示warning/storageError。

|错误码|含义|
|---|---|
|BAD_REQUEST / BAD_ID / UNKNOWN_OP|字段、结构、JSON、深度、类型或操作无效|
|NOT_READY / BUSY|加载中或请求/view超限，稍后重试|
|UNAVAILABLE / NOT_ALLOWED / UNSUPPORTED_SLOT / INVENTORY_FULL|世界、权限、槽位或空位不满足|
|INVALID_STACK|严格原版物品/组件校验失败|
|NOT_FOUND / ID_CONFLICT|条目不存在或导入/恢复UUID冲突|
|UNDO_EXPIRED / UPLOAD_EXPIRED|撤销/上传不存在、过期或token不匹配|
|ENTRY_LIMIT / ENTRY_TOO_LARGE / FILE_LIMIT|条目数/单条大小/文件或导入大小超限|
|RESPONSE_LIMIT|响应超预算，拆批或export分页|
|SCHEMA_VERSION / STORAGE_READ_ONLY / STORAGE_FAILED|文件版本不支持、保护只读或初始化失败|

WRITE_FAILED在成功回执的storageError中，不表示内存修改撤回。

## 验证与未验证

运行 pwsh -NoProfile -File tools/vault/test.ps1：javac+真实原版注册表的纯JVM门禁。日志logs/vault/{compile-main.log,compile-tests.log,tests.log}；捕获logs/vault/jvm-responses.json。Gradle增加vaultTest，check依赖此任务。

覆盖：附魔剑+自定义名/lore/属性修饰符、药水、潜影盒、成书、束袋、byte/short/long/float/double及B/I/L数组、浏览器精度投影、磁盘重开、typed hash去重（键序/不同数值类型）、force、配额、损坏隔离/bak恢复、导入导出、兼容性标记、删除撤销过期、并发保存、真实中文资源/拼音搜索。

最初检测到用户Minecraft，等待其自行退出后才取得Gradle锁运行门禁。未停止用户进程，未操作鼠标键盘。结果：javac+VaultTest **167项通过**；Gradle vaultTest+build通过；发布jar的独立隐藏客户端通过19次消息往返（全部操作、分段上传、JS精度往返、latest-wins、后台落盘、零page errors）。日志logs/vault/gradle-build.log、logs/vault/client-gate.log，客户端日志daily/2026-11-07/vault/client.log。

2026-11-07 主菜单宿主路径追加验证：`tools/vault-menu/run.ps1 -UseReleaseJar` 使用独立隐藏客户端、不加载世界，实际点击 TitleScreen 按钮打开同一页面，确认 mode/world/stack 数据；完成12次真实 Document 消息（全部本机操作，save/give 的 UNAVAILABLE），关闭返回原主菜单，改键B生效且旧V失效。收据 [vault-menu-client-captured.json](vault-menu-client-captured.json)；完整输出 `daily/2026-11-07/vault-menu/client.log`，门禁摘要 `logs/vault-menu/client-release-gate.log`。实际TitleScreen覆盖4种分辨率×4种GUI scale，并在每种布局的首选按钮位置追加模组按钮验证动态避让。另有97项纯JVM布局检查（主菜单/暂停菜单、连续模组按钮与无空位隐藏）。运行方法见 [tools/vault-menu/README.md](../tools/vault-menu/README.md)。此探针验证宿主和通道，不替代页面独立保险库内容的前端验收。

仍未验证：真实世界内暂停菜单点击和 `/cadeditor vault` 命令、生存give拒绝实机分支、远程原版服务器give到账、嵌套字段UI拖放、实机超频限流/切换文档取消。编辑器wire到原版嵌套ItemStack的格式转换由前端接入。

