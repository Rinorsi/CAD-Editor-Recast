# 本机保险库协议（26.1.2 / v1）

## P4-6 方块与玩家预设（2026-11-08）

新增 kind 为 block、player_preset。文件/导出版本升为 3，继续读取 1/2；旧程序与旧合并脚本安全拒绝新版本。消息回执仍 version:1。list.kind 接受四类及 all，默认仍 item；stats 新增 blocks/playerPresets。

保存：`{op:"save",requestId,kind:"block",world:<当前服务端 world 快照>,name?,tags?,note?}`；玩家为 `{op:"save",requestId,kind:"player_preset",world,sections:["inventory","equipment","ender","attributes","effects","game_mode"],name?,tags?,note?}`。sections 必须非空且不重复，可选其中任意子集。装备槽位来自原版 Inventory.EQUIPMENT_SLOT_MAPPING（含副手）；属性/效果/游戏模式候选继续用实时注册表与 schema。

也接受 template 代替 world。方块 template 为 `{block:"minecraft:chest",block_state:{facing:"north",type:"single",waterlogged:"false"},snbt:"{id:...}"}`；完整 typed SNBT 删除顶层 x/y/z，不保存位置或会话。玩家 template 为 `{sections:{effects:[],game_mode:"survival"}}`：inventory/equipment/ender 各为 `{slots:[{slot,stack}]}`，stack 保留完整 component_snbt、空槽为 `{empty:true}`；attributes 为原 player.attributes 数组，effects 为 player.active_effects 数组，game_mode 为 player.playerGameType 字符串。不保存玩家身份、位置、配方、成就或统计。

两类 save 总是新增 UUID，duplicate:false；同名自动加 ` (2)`、` (3)`，不覆盖、不按内容去重。duplicate/import 同样给新增条目分配不冲突名称，import 同 UUID 仍拒绝。旧 item/entity 去重与读取不变。轻量行含 kind、summary（方块注册 ID/状态字段数/NBT字段数，或分区及槽位数），get/export 完整行含 template。update 仅改元数据。大模板用 upload 暂存 `{world,sections?}` 或 `{template}`，save 携带 kind/uploadToken。原配额不变。

套用步骤：

1. 打开现有世界编辑器的对准方块或在线玩家，取得服务端 world（slot/revision）；独立保险库先要求打开目标。
2. 请求 `{op:"preview",requestId,id,world,sections?:[...已保存分区...]}`，缺省套用已保存的全部分区。大 world 可用 uploadToken 暂存 `{world,sections?}`。
3. 回执含 `summary:{kind,target,overwrites:[{section,before,after}]}` 与 `apply:{slot,revision,vault_template:{kind,template,sections?}}`；before/after 是字段数、槽位数或条目数等有界摘要。页面显示摘要，等待用户确认。preview 不写世界，其 ok 不代表服务端已保存。
4. 确认后给 apply 添加新 requestId，发送现有页面 apply 消息。宿主仍绑定真实 slot/revision；服务端在 EditorPolicy、可达性、在线状态和会话校验后展开 vault_template，复用 PlayerWorldEdit.prepare/write 或既有方块写入。回执与撤销沿用 result/world。

方块 block 注册 ID 必须一致，即使共用方块实体类型也拒绝，服务端再次核对；错误码 block_type_mismatch。SNBT 套用时仅补回目标自身 id/x/y/z。玩家未选分区保持原值，权限/离线/冲突错误沿用世界编辑路径；本机 preview 用 wrong_kind、block_type_mismatch、BAD_REQUEST 等。未知字段/分区拒绝。过大 preview 明确 RESPONSE_LIMIT，不裁剪模板。

实现：vault/VaultStore、vault/VaultStacks、registry/VaultChannel。2026-11-07。

## 传输与页面生命周期

页面消息名 **vault**；监听字面 patch key **vault.result**（不是嵌套路径）。只接入本地 DocumentDriver，serverSession 不接入。存储操作不上传；显式give在非创造模式使用现有EditorPackets请求向当前服务器发送一份typed栈（见give节），不提供远程保险库/文件能力。

所有请求：{op,requestId,view?,...}。requestId 必填非空，最长128个UTF-16单元；view 默认 vault，非空且最长128。每页面最多8个固定 list view。list 在客户端 tick 合并，同 view 最新请求覆盖旧请求，包括被限流的新请求；换文档/关闭页面取消待发列表。每tick最多完成一个list，首次打开、切换世界/语言时每tick最多验证8个条目。其他操作按收到顺序执行，不合并写操作。

请求序列化后最多8192字符，响应最多24000字符；每页面每秒20次（含upload），超限 BAD_REQUEST 或 BUSY。JSON深度最多96。长度按Java/JS UTF-16单元；磁盘配额按UTF-8字节。

成功共同字段：{version:1,requestId,op,ok:true,revision,persisted,readOnly,warning?,storageError?,...}。revision 是进程内修订号；persisted:false 表示内存接受、等待后台落盘，不能显示“磁盘备份完成”。stats 可以轮询；storageError:WRITE_FAILED 表示写失败，内存数据保留并每2秒重试。upload/give有独立回执，没有revision/persisted。

失败：{version:1,requestId,op,ok:false,error,reason}。reason最长512字符，可显示；不要按reason文本分支。首次异步加载未完成返回{ok:false,error:NOT_READY,loading:true,retryAfterMs:250,...}，页面须自动重试，不得当成total=0或展示“空库”。失败回执不含entries/total。关闭/断开时等待加载有5秒上限。

主菜单：通道不要求世界即可list/get/update/delete/restore/duplicate/import/export/tags/stats。无法解析组件时标记compatibilityUnknown:true，不会误报incompatible。物品save/give需要世界；物品save使用当前世界注册表严格验证，否则UNAVAILABLE。生物save无需世界，见生物条目节。物品编辑器入口仍需玩家/世界；独立保险库入口见下节。

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

`prefs` 是 `EditorPrefs.read()` 返回的当前设置（上例空对象仅示意），不是物品/世界快照。页面应按 `mode === 'vault'` 显示独立保险库，不创建物品草稿，不要求 slot/baseline，不默认选择方块编辑。此模式不注册 apply/undo 服务端编辑消息；本机通道仍由 `RegistryBridge.attach` 接入。没有世界的注册表工具应保留其既有 UNAVAILABLE 行为。后续无需世界的工具可复用此页面模式。物品 I / `/cade` 和世界 I / `/cadeditor block|entity` 现在统一按 world-player-contract.md 中的分派顺序选择目标，权限仍由服务器决定。

入口只有默认 O 快捷键（原版控制设置中的 key.cadeditor.vault，可改键），以及世界内 /cadeditor vault 命令。主菜单、暂停菜单和游戏内使用同一个 KeyMapping；聊天、文本框、控制改键及 Oriel 页面不抢键，Ctrl/Alt/Shift 组合不触发。菜单不添加保险库按钮。

Esc 或页面关闭通过 VaultScreen.onClose() 返回原 Screen（主菜单、暂停菜单或游戏），关闭本地通道，不发送物品/世界编辑 close 请求。

`world:null` 表示没有世界编辑目标，即使玩家在世界内从暂停菜单打开也如此；实际世界是否存在仍由宿主判断。因此主菜单中物品 save / give 返回 **UNAVAILABLE**（生物save不受此限制）；世界中 save 可严格验证，give 要求连接和安全空槽位，非创造另需服务端模组及gamemaster命令权限，详见下文。

## 条目与类型保真

磁盘/分享格式现为 {version:2,entries:[Entry,...]}；兼容读取version:1，无kind的旧条目视为item。消息回执version仍为1。Entry字段：

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
|import|entries:[]或text:版本化JSON；version?=1（接受1/2）；offset?=0,limit?=32(1..32)|results:[{index,ok,id?,error?,reason?,incompatible?,compatibilityUnknown?}],nextOffset,done；逐页处理，失败不回滚成功项，同ID拒绝|
|export|ids:[](最多2000)或all:true；offset?=0,limit?=6000(1..6000)|text,offset,nextOffset,total,done,revision；整个JSON的一段，拼完再解析；revision变化须重导。Unicode代理对不切开，必要时片段多1单元|
|tags|offset?=0,limit?=100(1..100)|tags:[{name,count}],total,nextOffset,done；名称排序|
|stats|无|entries,bytes,maxEntries,maxEntryBytes,maxFileBytes,storage；storage只返回实际存储路径末两级（如cadeditor/vault.json），不含用户名；及共同存储状态|

轻量行：{id,name,tags,note,created,updated,mcDataVersion,modVersion,item:{id,count},summary?,translatedName?,incompatible?,compatibilityUnknown?,reason?}。

summary为{enchantCount,hasCustomName,containerSize}，containerSize是非空容器物品项数，不假定所有容器27格。list没有stack/SNBT。

搜索name、note、tags、物品注册ID、当前语言翻译名；复用现有Pinyin数据/匹配器，支持中文、拼音、首字母、混合输入。语言切换失效兼容性和翻译缓存。

## 大条目上传和完整取出

8Ki字符请求/24Ki字符响应与64KiB条目无法同时用一个消息满足，因此增加upload、export字符分页；**此扩展来自边界冲突**，没有放宽传输上限。

1. 发送 {op:"upload",requestId:"u1",text:"首段"}，开始新暂存，回 {version:1,requestId,op:"upload",ok:true,token,chars,expires}。每页面一个上传，新建替换旧暂存。
2. 发送 {op:"upload",requestId:"u2",token:"回执UUID",text:"下一段"}。单段最多6000 UTF-16单元，同时整个请求含转义仍须<=8192字符，客户端自行缩小段长；每段延长30秒。不要切开Unicode代理对。暂存最多8Mi字符，最终解析最多8MiB。
3. 大stack暂存为stack对象JSON本身；提交 {op:"save",requestId:"s1",uploadToken:"UUID",name:"可选名称"}。
4. 备份暂存为{version:2,entries:[...]} JSON；提交 {op:"import",requestId:"i1",uploadToken:"UUID",offset:0,limit:32}。使用同token+nextOffset继续，提交刷新30秒期限。
5. 大条目get遇RESPONSE_LIMIT：对单ID分页export，拼接后读取entries[0].stack，获得完整保真stack。多个条目get超限先拆批，单条仍超限再export。

upload真实捕获见vault-client-captured.json的vault-live-11、12、13（两段上传再save）；以上仍为易读形状说明。所有文本在本机内存处理，页面不能选路径、任意读写文件或下载URL。

## give：创造客户端路径 / 非创造服务端路径（2026-11-08）

页面请求 {op:"give",requestId:"g1",id:"条目UUID",slot:"inventory",inventoryIndex?:整数}。slot默认inventory（9..35），也支持hotbar（0..8）。不指定index选区域内第一空槽；显式inventoryIndex支持0..35，优先于区域。不支持装备/副手/光标。只插空槽，不合并堆叠、不丢地上、不覆盖。主菜单无世界仍UNAVAILABLE。

**创造模式（有无OP均相同）**：严格解码条目，检查自己背包空槽，发送ServerboundSetCreativeModeSlotPacket，并立即把栈写入自己的客户端背包，让创造界面立刻显示。只发服务端更新而不更新客户端曾造成“服务端有、创造界面仍为空”的误导，此路径避免该问题。无需服务端模组；原版服务器最终仍可拒绝/纠正。容器界面未关闭返回NOT_ALLOWED。

创造成功 {version:1,requestId,op:"give",ok:true,code:"ok",path:"creative",status:"sent",confirmed:false,inventoryIndex,creativeSlot,item:{id,count},reason}。表示客户端已显示、原版包已发送，**不等于服务端确认**。宿主弹窗说明放进背包/快捷栏第几格及待服务端处理。reason是用户中文，不用于逻辑分支。

**非创造（生存/冒险/旁观）**：必须安装服务端模组，每笔从ServerPlayer.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)校验权限（OP/单人开作弊）；不要求创造，不信任客户端abilities。内部用既有EditorPackets.Request发送 {op:"vault_give",requestId:"vault-give-UUID",slot,inventoryIndex?,stack:完整typed wire栈}。不发送整个保险库、路径或文件能力。服务端自己的注册表严格解码及校验组件，原版setItem插入后inventoryMenu.sendAllDataToRemote()，有其他打开容器则一并完整同步，再明确发背包槽更新。

非创造成功 {version:1,requestId:原页面ID,op:"give",ok:true,code:"ok",path:"server",status:"given",confirmed:true,inventoryIndex,item:{id,count},reason}。内部ID映射回页面ID，通过字面patch key vault.result回执。宿主弹窗“已放进快捷栏第N格”或“已放进背包第N格（槽位index）”。confirmed表示服务端已插入，不能把纯发送称为到账。创造模式误走内部服务端give返回creative_path_required，不偷换路径。

失败仍为 {version:1,requestId,op:"give",ok:false,error,code,reason}；新增give机器码以小写code为准，error亦保留该码。原本本机错误UNAVAILABLE/INVALID_STACK/NOT_ALLOWED/INVENTORY_FULL/UNSUPPORTED_SLOT仍可见。新增码：permission_denied无gamemaster；not_connected未连服务器或服务端未安装；inventory_full区域已满；slot_changed指定槽被占；invalid_stack组件校验失败；payload_too_large内部请求超过32767字符；request_pending同条目正在等待；request_timeout十秒未收到回执、结果未知；rate_limited每玩家每秒20次或ID配额；request_id_conflict内部ID载荷改变；creative_path_required错误路径。服务端未安装时明确“服务器没有安装物品工坊，生存模式不能写回”，不回退到另一写法。

**前端防重复**：发give后把该条目的“给我/取出”按钮置灰，等对应requestId回执后恢复；宿主也拦同连接同条目并行（包括重开页面），最多8笔等待。相同page requestId回放原本回执，不重新发放。超时不自动重发，并保留同条目锁直到迟到回执或断开连接，提示先核对背包。服务器按玩家+内部requestId保留本连接成功回执，同载荷重放只返回原槽，载荷改变拒绝；每连接最多4096个成功ID，超限拒绝新请求，不驱逐旧ID以免重放。页面成功回执保留至4096条或文档重建；每次服务端重放仍重新检查当前权限。

较大栈仍保留typed component_snbt，不为缩小载荷丢弃类型；超过内部32767字符的give直接拒绝。本机save/import/export原分页/配额不变。前端不要以comps投影代替完整typed栈。

验证：logs/permission/PermissionTest.log为纯JVM模式矩阵、long/float/嵌套容器、空槽/幂等；logs/permission/captured-server.json为隔离专用服、真实ServerPlayer（RecordingListener记录发包，无真实客户端登录），覆盖生存give、重放/撤权/满背包/占用槽、生存主手/容器apply及baseline冲突、冒险/旁观give、错误创造路径。旧vault-client-captured.json是旧创造历史捕获，不代表本次画面验证。用户游戏运行中，未做真实客户端实测。

## 持久化和错误

用户级固定全局目录（同一操作系统用户，所有gameDir、世界、服务器共用）：Windows为%APPDATA%/cadeditor/vault.json，APPDATA缺失才用user.home/AppData/Roaming/cadeditor；macOS为~/Library/Application Support/cadeditor/vault.json；其它系统为$XDG_DATA_HOME/cadeditor/vault.json，未设置时~/.local/share/cadeditor/vault.json。系统属性-Dcadeditor.vault.dir=自选目录优先；相对覆盖目录相对user.home解析，仍不依赖gameDir。上一完整版本vault.json.bak；临时文件、独占锁vault.json.lock都在同目录；schema=1。最多2000条、每条65536字节、整文件8388608字节（含JSON/元数据）。超限拒绝，不删旧条目腾空间、不截断正文。

第一笔未落盘修改后300ms启动后台写；后续连续修改不会重置这个期限（不再是可无限延后的尾沿防抖）。300ms是开始写入的调度期限，不是磁盘/系统停顿下可保证的完成时间。单后台线程写临时文件、FileChannel.force(true)、原子替换，备份也原子替换。后台只用脱离Minecraft的JSON，磁盘I/O不持有主线程操作使用的锁。下一次stats/list立刻反映已完成写入的persisted状态；页面仍需轮询，不能把save回执里的persisted:false永久保存在界面。

VaultStore.flushNow()是同步有界落盘屏障，返回boolean。写屏障等待最多5秒，超时可见FLUSH_TIMEOUT，失败WRITE_FAILED；不会伪装persisted:true，内存条目保留。VaultChannel在页面关闭、ClientPlayConnectionEvents.DISCONNECT、CLIENT_STOPPING调用屏障。加载等待最多5秒加落盘最多5秒；已加载的通常退出只等一次落盘。关闭客户端还会关闭writer，写线程实际结束后释放独占锁。当前读取/保存地址是VaultPaths选择的全局固定Path，不再使用FabricLoader.configDir；切换开发启动器日期/gameDir不会换库。

迁移：初始化持全局锁后，若新位置没有vault.json且未从新位置bak恢复条目，尝试当前configDir/cadeditor/vault.json。完整校验源JSON、schema、所有条目结构/元数据和全部配额后才发布到内存，再通过flushNow原子写新位置；成功后stats返回migration:legacy并记日志（不作为损坏警告）。旧文件不删不改。失败warning=MIGRATION_FAILED并写日志，启动继续，不生成覆盖旧数据的空vault.json。旧版本/缺失mod的组件仍原样保留，在有世界时再按既有Codec标记兼容性，不自动迁移组件。如果新旧均存在且字节内容不同，只记一条“未自动合并”日志；不会自动扫描其它gameDir。

并发保护：打开Store时对同目录vault.json.lock持操作系统独占文件锁，贯穿Store寿命；没有取得锁的第二游戏实例只能读取快照，readOnly:true、warning=STORAGE_LOCKED，mutation返回STORAGE_LOCKED，不能覆盖第一实例。锁占用进程退出后系统自动释放，第二实例需重启后重新取得写权限。锁文件残留本身无害，不要用“文件存在”判断锁占用。离线合并工具也对相同锁文件加相同范围独占锁，并在锁内读取现有全局文件、合并与写入。

离线汇总旧gameDir：PowerShell 7运行 tools/vault-persist/merge-legacy.ps1。检测到Minecraft进程就拒绝，不会杀游戏。例：

    pwsh -NoProfile -File tools/vault-persist/merge-legacy.ps1 -Glob 'C:\Storage\Minecraft\project\Mods\Oriel-UI-Workspace\daily\*\run\editor-mod-client\config\cadeditor\vault.json'

多个明确路径用PowerShell命令调用：

    & ./tools/vault-persist/merge-legacy.ps1 -Paths @('C:\old-day1\vault.json','C:\old-day2\vault.json')

默认写到上述用户级全局目录。若游戏使用-Dcadeditor.vault.dir，自行给工具同一个-OutputDirectory目录。现有全局文件也参与合并；所有输入完整结构/配额校验成功后才写，写前原全局文件原子备份为vault.json.bak。工具不执行当前世界Codec（离线可能缺mod），保留typed SNBT字符串和大整数JSON词法值。按条目类型与完整内容SHA256去重，不按UUID去重：物品仍使用完整stack的规范JSON键序；生物使用VaultEntities已规范化的typed SNBT原文，不跨类型去重。离线工具把SNBT作为不透明文本保存，不重新解析NBT、不剔除字段、不执行DataFixer；手写的语义等价但文本不同的SNBT不会合并，需先经游戏内import/export规范化。同内容保留updated最新名称与版本元数据（时间相同保留先读条目，已有目标优先，避免重跑改变冲突UUID），created取最早，tags并集，note按行去重合并。合并超8个标签/200字符note或其它配额会拒绝，绝不截断。不同栈撞UUID则为后一个生成新UUID。输入旧文件始终原样保留。工具返回的目标路径仅在用户本机终端显示，不通过页面泄露用户名。

本轮仅在随机临时目录演示核心合并（3条源记录合成2条，验证名称、tags/note、typed SNBT、大整数、幂等、备份、锁及校验失败回滚）；没有对用户真实旧库或全局库执行合并。游戏运行时完整脚本拒绝分支已测；游戏关闭后的完整脚本写入尚待用户协调执行，不能把核心演示冒充实际迁移用户数据。

硬杀进程不会执行退出钩子，最近尚未完成写入的修改仍可能丢失（通常最后300ms加实际I/O时间；写失败时可覆盖全部尚未持久化修改，不能承诺有固定条目上限）。已成功flushNow或persisted:true的版本经文件force和原子替换保留；不承诺断电时目录元数据的硬件级持久性。WRITE_FAILED/FLUSH_TIMEOUT必须醒目提示并重试。后台捕获IOException及RuntimeException，避免写线程任务异常后只剩永远“正在保存”。

分页offset缺失或JSON null统一为0；负数、非整数、超过各操作范围返回BAD_REQUEST，reason写明允许的最小/最大值；不修改其他字段的null语义。

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
|STORAGE_LOCKED|另一个实例持有全局文件锁或锁目录权限不足；只读，重启/修正权限后重试|

WRITE_FAILED在成功回执的storageError中，不表示内存修改撤回。

## 2026-11-08 持久化问题核查

只读检查用户实际运行目录的vault.json为1217字节、2条；bak为891字节、1条，没有发现该文件被清空。证据摘要logs/vault-persist/disk-evidence.json，不复制用户条目正文。VaultPersistenceTest将该文件复制到临时目录，使用“无世界/UNAVAILABLE验证器”重新list，确认2条仍可读。因此现有证据不支持声称这两条已丢失。

旧实现的用户语义缺陷另已确定：路径挂在每日gameDir的config下，换启动日期/运行目录会打开另一个库，因此跨启动可显示为空，即使旧文件完整。现在已改为上文固定用户全局目录，首次自动迁移当前旧库；多个历史gameDir由离线工具显式汇总。不同gameDir的丢失表象与同一文件损坏应分别核查。

“一直正在保存”有明确时序原因：save和立即发送的stats通常都早于旧500ms后台写，返回persisted:false；后台完成后原通道没有主动回执，未轮询页面便保留旧状态。另有可复现风险：旧每次mutation重排500ms任务可被连续修改无限延后；旧仅CLIENT_STOPPING做flush，无页面关闭/断开屏障；首次NOT_READY会被旧页面当作空列表。主菜单显示空与磁盘有2条并不等价，具体UI问题由前端修复；后端增加重试语义及null offset容错。

新回归门禁：pwsh -NoProfile -File tools/vault-persist/test.ps1，全源javac、全部测试编译、VaultTest、VaultPersistenceTest。后者通过子JVM Runtime.halt(0)跳过close钩子，分别验证flush后立即硬退出和后台落盘完成后硬退出再从相同路径重开，保留tags/note/typed NBT；另测连续写不延期、写失败内存保留、NOT_READY future超时/完成/异常、所有分页操作的null/缺失/负数/超大offset。完整日志在logs/vault-persist/。实机与Gradle本轮如用户游戏仍在运行则跳过，不沿用上轮实机证据宣称本次通过。

## 验证与未验证

运行 pwsh -NoProfile -File tools/vault/test.ps1：javac+真实原版注册表的纯JVM门禁。日志logs/vault/{compile-main.log,compile-tests.log,tests.log}；捕获logs/vault/jvm-responses.json。Gradle增加vaultTest，check依赖此任务。

覆盖：附魔剑+自定义名/lore/属性修饰符、药水、潜影盒、成书、束袋、byte/short/long/float/double及B/I/L数组、浏览器精度投影、磁盘重开、typed hash去重（键序/不同数值类型）、force、配额、损坏隔离/bak恢复、导入导出、兼容性标记、删除撤销过期、并发保存、真实中文资源/拼音搜索。

最初检测到用户Minecraft，等待其自行退出后才取得Gradle锁运行门禁。未停止用户进程，未操作鼠标键盘。结果：javac+VaultTest **167项通过**；Gradle vaultTest+build通过；发布jar的独立隐藏客户端通过19次消息往返（全部操作、分段上传、JS精度往返、latest-wins、后台落盘、零page errors）。日志logs/vault/gradle-build.log、logs/vault/client-gate.log，客户端日志daily/2026-11-07/vault/client.log。

2026-11-08 保险库入口调整：移除菜单按钮及专用布局类/测试；tools/vault-menu 探针改用 O 菜单键盘事件和 VaultClient.open()，保留 mode:vault、无世界本机通道及关闭回原界面验证，并检查改键 B 后旧 O 失效、组合键不触发。新探针已编译；用户游戏运行时不执行隐藏客户端，真实快捷键验收待后续运行。旧收据属于历史版本，不作为当前快捷键验收依据。运行方法见 tools/vault-menu/README.md。

仍未验证：真实世界内暂停菜单快捷键和 `/cadeditor vault` 命令、生存give拒绝实机分支、远程原版服务器give到账、嵌套字段UI拖放、实机超频限流/切换文档取消。编辑器wire到原版嵌套ItemStack的格式转换由前端接入。

## 生物条目（2026-11-08，磁盘schema 2）

同一vault通道同时保存物品和生物。kind为item/entity；缺省item，包括旧文件和旧导出。list的kind允许item/entity/all，缺省item；标签、分页、排序与搜索规则相同，sort:item按类型ID排序。标签计数跨两类共享。stats新增items/entities，entries是两类总数。两类合计2000项/8MiB；单条含元数据的JSON最多64KiB，实体SNBT输入本身UTF-8也不超过64KiB，嵌套最多96层。没有spawn操作。

磁盘与导出统一写version:2，读取/导入接受1、2。旧版本程序发现2应走已有SCHEMA_VERSION只读逻辑，不回退空库覆盖；使用新程序即可继续读取。未知未来版本仍只读，包括备份文件。离线 `merge-legacy.ps1` 接受schema 1/2，混合合并物品和生物，统一输出schema 2；未知未来版本仍拒绝，校验失败不改目标或备份。用 `pwsh -NoProfile -File tools/vault-persist/merge-test.ps1` 和 `pwsh -NoProfile -File tools/vault-persist/merge-entity-test.ps1` 运行临时目录回归测试，不访问用户库。

公共id始终是保险库条目的UUID，生物类型ID位于entity.id和summary.id，避免两种ID混淆。生物get完整字段：

~~~json
{"id":"条目UUID","kind":"entity","name":"名称","tags":[],"note":"","created":0,"updated":0,"mcDataVersion":1,"modVersion":"版本","snbt":"{id:\"minecraft:zombie\"}","entity":{"id":"minecraft:zombie"},"summary":{"id":"minecraft:zombie","hasCustomName":false,"baby":false,"equipmentCount":0,"attributeCount":0,"effectCount":0},"translatedName":"当前语言类型名称","compatibility":true}
~~~

list/save/update/duplicate返回的轻量条目省略snbt，不返回stack/item。get返回snbt供entity_data、SpawnData.entity和其它生物输入字段直接使用；宿主不实例化实体。已注册类型compatibility:true；未知注册ID仍可保存、导入和取出，回执compatibility:false、compatibilityUnknown:true。未知ID默认名称回退ID。主菜单也可save entity，不依赖世界组件注册表。summary按已知现代/旧NBT键提取，不改动属性/装备/效果内容。类型后缀、数组类型与数值保真；SNBT会规范化引号、空白、键顺序和无命名空间ID，并非输入文本逐字保留。

生物保存请求（name/tags/note/force可选）：

~~~json
{"op":"save","requestId":"entity-save","kind":"entity","snbt":"{id:'minecraft:zombie',IsBaby:1b,CustomName:'小僵尸',data:{seed:9223372036854775807L,speed:1.25f,bytes:[B;1b,2b]}}","name":"小僵尸","tags":["战斗"],"note":"精调模板"}
~~~

大SNBT沿用upload，chunk累计内容是JSON对象的文本 {"snbt":"{id:...}"}（不是裸SNBT，不是物品stack）；最后发送 {"op":"save","requestId":"...","kind":"entity","uploadToken":"..."}。upload/import原有30秒、分页及大小约束不变。save的去重依据剔除运行时字段后的规范typed SNBT；force:true跳过去重，不与item跨类去重。save增加stripped:[字段名]、warnings:[警告码]，重复保存也返回本次剔除结果。import每条results同样包含剔除回执。

### 强制剔除根字段

复用world/EntityVolatile.CURRENT，不调用会归一化Age/效果时长的stable()。只剔除根字段；嵌套装备/自定义数据保留，Passengers整棵丢弃，warnings添加PASSENGERS_DROPPED。stripped只列输入中实际存在的字段，按名称排序。

|来源|字段|
|---|---|
|EntityVolatile.CURRENT（随共用审计表更新）|Pos, Motion, Rotation, Air, Fire, OnGround, fall_distance, FallDistance, PortalCooldown, HurtTime, DeathTime, HurtByTimestamp, Brain, FallFlying, current_impulse_context_reset_grace_time, current_explosion_impact_pos, last_hurt_by_player, last_hurt_by_player_memory_time, last_hurt_by_mob, ForcedAge, InWaterTime, DrownedConversionTime|
|模板额外根字段|UUID, UUIDMost, UUIDLeast, Dimension, Passengers, Leash|

### 生物错误码与通用操作

INVALID_ENTITY：SNBT解析失败、不是复合标签、嵌套过深。INVALID_ENTITY_ID：无字符串id或非合法Identifier。ENTRY_TOO_LARGE：超过单条额度。BAD_REQUEST：kind非法或字段类型/长度非法。give针对生物返回小写wrong_kind，连接/权限检查前拒绝，绝不发送物品写回。其余update/delete/restore/duplicate/tags/import/export/flush/文件锁/全局路径与物品共用，删除撤销也可同时包含两类。

以下实体新增行为仅通过真实MC注册表和NBT解析器的纯JVM验证；没有启动/操作用户客户端。真实请求/回执由VaultEntityTest写入logs/vault-entity/captured.json（生成时保留每个op的第一份回执），不是手工示意回执。前端示意形状以上述定义为准；后文补充该次捕获样本。

### 生物真实JVM捕获样本

来自VaultEntityTest（真实26.1.2内置实体注册表；测试时钟、元数据版本为测试配置）。这里只节选save/list/stats/get，其余op请求回执在captured.json中。

save：

~~~json
{
  "request": {
    "op": "save",
    "requestId": "entity-save",
    "kind": "entity",
    "snbt": "{id:'minecraft:zombie',Age:-10,CustomName:'测试',equipment:{head:{id:'minecraft:stone',count:1}},attributes:[{id:'minecraft:max_health',base:40d}],active_effects:[{id:'minecraft:speed',duration:300}],data:{n:9223372036854775807L,f:1.25f,b:1b,s:2s,d:2.5d,bytes:[B;1b,-2b],ints:[I;1,2],longs:[L;3L,4L]},UUID:[I;1,2,3,4],Pos:[1d,2d,3d],Motion:[0d,0d,0d],Passengers:[{id:'minecraft:pig'}],Brain:{},Leash:{},Dimension:'minecraft:overworld',Air:3s}",
    "name": "僵尸模板",
    "note": "类型保真",
    "tags": [
      "共享"
    ]
  },
  "response": {
    "entry": {
      "id": "b783db5c-468b-4463-8af1-d4e56552dc99",
      "kind": "entity",
      "name": "僵尸模板",
      "tags": [
        "共享"
      ],
      "note": "类型保真",
      "created": 1794076551899,
      "updated": 1794076551899,
      "mcDataVersion": 1,
      "modVersion": "test",
      "entity": {
        "id": "minecraft:zombie"
      },
      "summary": {
        "id": "minecraft:zombie",
        "hasCustomName": true,
        "baby": true,
        "equipmentCount": 1,
        "attributeCount": 1,
        "effectCount": 1
      },
      "translatedName": "Zombie",
      "compatibility": true
    },
    "duplicate": false,
    "stripped": [
      "Air",
      "Brain",
      "Dimension",
      "Leash",
      "Motion",
      "Passengers",
      "Pos",
      "UUID"
    ],
    "warnings": [
      "PASSENGERS_DROPPED"
    ],
    "ok": true,
    "version": 1,
    "op": "save",
    "requestId": "entity-save",
    "revision": 1,
    "persisted": false,
    "readOnly": false
  }
}
~~~

list：

~~~json
{
  "request": {
    "op": "list",
    "requestId": "entity-list",
    "kind": "entity"
  },
  "response": {
    "entries": [
      {
        "id": "b783db5c-468b-4463-8af1-d4e56552dc99",
        "kind": "entity",
        "name": "僵尸模板",
        "tags": [
          "共享"
        ],
        "note": "类型保真",
        "created": 1794076551899,
        "updated": 1794076551899,
        "mcDataVersion": 1,
        "modVersion": "test",
        "entity": {
          "id": "minecraft:zombie"
        },
        "summary": {
          "id": "minecraft:zombie",
          "hasCustomName": true,
          "baby": true,
          "equipmentCount": 1,
          "attributeCount": 1,
          "effectCount": 1
        },
        "translatedName": "Zombie",
        "compatibility": true
      }
    ],
    "total": 1,
    "offset": 0,
    "nextOffset": 1,
    "done": true,
    "ok": true,
    "version": 1,
    "op": "list",
    "requestId": "entity-list",
    "revision": 1,
    "persisted": false,
    "readOnly": false
  }
}
~~~

stats：

~~~json
{
  "request": {
    "op": "stats",
    "requestId": "entity-stats"
  },
  "response": {
    "storage": "global\\vault.json",
    "entries": 4,
    "entities": 3,
    "items": 1,
    "bytes": 1896,
    "maxEntries": 2000,
    "maxEntryBytes": 65536,
    "maxFileBytes": 8388608,
    "ok": true,
    "version": 1,
    "op": "stats",
    "requestId": "entity-stats",
    "revision": 7,
    "persisted": false,
    "readOnly": false
  }
}
~~~

get：

~~~json
{
  "request": {
    "op": "get",
    "requestId": "entity-get",
    "id": "b783db5c-468b-4463-8af1-d4e56552dc99",
    "ids": [
      "b783db5c-468b-4463-8af1-d4e56552dc99"
    ]
  },
  "response": {
    "entries": [
      {
        "id": "b783db5c-468b-4463-8af1-d4e56552dc99",
        "kind": "entity",
        "snbt": "{Age:-10,CustomName:\"测试\",active_effects:[{duration:300,id:\"minecraft:speed\"}],attributes:[{base:40.0d,id:\"minecraft:max_health\"}],data:{b:1b,bytes:[B;1B,-2B],d:2.5d,f:1.25f,ints:[I;1,2],longs:[L;3L,4L],n:9223372036854775807L,s:2s},equipment:{head:{count:1,id:\"minecraft:stone\"}},id:\"minecraft:zombie\"}",
        "name": "僵尸模板",
        "tags": [
          "共享"
        ],
        "note": "类型保真",
        "created": 1794076551899,
        "updated": 1794076551899,
        "mcDataVersion": 1,
        "modVersion": "test",
        "entity": {
          "id": "minecraft:zombie"
        },
        "summary": {
          "id": "minecraft:zombie",
          "hasCustomName": true,
          "baby": true,
          "equipmentCount": 1,
          "attributeCount": 1,
          "effectCount": 1
        },
        "translatedName": "Zombie",
        "compatibility": true
      }
    ],
    "missing": [],
    "ok": true,
    "version": 1,
    "op": "get",
    "requestId": "entity-get",
    "revision": 1,
    "persisted": false,
    "readOnly": false
  }
}
~~~
