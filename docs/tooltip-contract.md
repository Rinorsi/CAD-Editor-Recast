# 原生物品提示 Tooltip v1（26.1.2 / Java25）

本地页面发送 **tooltip**；接收 patch 顶层字面键 **tooltip.result**。只读预览，不提交物品，不修改玩家背包，不增加服务器页面能力。挂接入口RegistryBridge.attach → TooltipChannel.attach。

## 请求和接线

~~~js
oriel.send('tooltip', {
  requestId:'preview-17', view:'item-preview', advanced:false,
  stack:{id:'minecraft:diamond_sword', count:1, comps:{}, removed:{}}
});
oriel.on('patch', function(p) {
  if (p.key !== 'tooltip.result') return;
  var r = p.value;
  if (r.requestId !== currentTooltipRequestId || r.cancelled) return;
  if (!r.ok) { /* 显示reason；保留草稿，不用猜测提示替代 */ return; }
  // lines已经包含名称行！name是同一行的便捷副本，不能再重复插到lines前。
  // 每个line为run数组；[]是空白行，须保留行高。
  // 按run自身颜色/样式画文字；不要把rarityColor覆盖到每一行。
});
~~~

requestId必填字符串1–128字符；view字符串1–128字符，省略时为tooltip。每Document最多8个固定view，与search的8-view额度独立，不把requestId作为view。advanced默认为false，必须是真正boolean；true使用TooltipFlag.ADVANCED（F3+H样式），false使用NORMAL。整条请求≤8192个UTF-16字符，包含stack及SNBT sidecar。

stack就是apply的完整工作副本：id、count、comps，以及可选removed、component_formats、component_snbt。直接调用同一个StackCodec.decode及官方ItemStack.CODEC、strict验证，不手写组件解释器。component_formats中snbt显式输入优先；component_snbt和当前JSON一致时保留精确NBT类型，JSON有修改时旧sidecar不覆盖新值。必须把当前草稿中的sidecar一起发送，不能先清洗成普通JS数字再期待还原long/数组。

与apply的边界：apply在服务器还会做会话/权限/槽位/世界校验，并可依据会话original保留未改组件；tooltip没有服务器original，也不授予保存许可。请求携带完整有效sidecar时使用相同解码规则；若故意省略sidecar，tooltip无法猜回服务器original才知道的NBT精度。客户端没有同步的服务端专属注册表也不能假装存在：相应解码失败返回INVALID_STACK，不伪造预览。

同Document、同view采用latest-wins：tick执行前的新请求替换旧请求，关闭/新Document丢弃旧队列；发布前复核Document、世界及请求身份。不同view独立。页面仍须检查requestId，已送达的旧patch不能撤回。取消示例：

~~~js
oriel.send('tooltip',{requestId:'cancel-18',view:'item-preview',cancel:true});
~~~

取消无需stack，回复{version:1,requestId:'cancel-18',ok:true,cancelled:true}，不再保证被取消请求有终态。未进入世界或当前玩家不存在返回UNAVAILABLE；排队期间切换世界同样不交付旧世界提示。

## 文本与样式

成功形状：

~~~json
{"version":1,"requestId":"preview-17","ok":true,"name":[{"text":"名称","color":"#FFFFFF","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false}],"lines":[],"rarityColor":"#FFFFFF","extra":[],"partial":false}
~~~

name为原生第一名称行的styled runs（通常与lines[0]相同）；每条lines[i]也是runs数组，名称行保留在lines中。每个run总带text及五个boolean；color为#RRGGBB或null（默认文字色）。rarityColor取stack.getRarity().color()，不根据手写物品类别猜色。custom_name的默认斜体、lore默认紫色/斜体、子组件覆盖、显式false与父样式继承均由原生组件渲染路径决定。

宿主在客户端线程执行：

~~~java
stack.getTooltipLines(Item.TooltipContext.of(mc.level), mc.player,
    advanced ? TooltipFlag.ADVANCED : TooltipFlag.NORMAL);
~~~

然后对返回Component逐一调用 **getVisualOrderText().accept(...)**，读取实际Style和Unicode码点，相邻样式相同合并run。选择这条路径而非解析Component JSON，是因为它与Minecraft文字绘制消费的是同一个视觉字符流，已经应用当前Language翻译、keybind解析、继承样式、旧式格式码及双向文字视觉顺序，不需要再实现一遍组件系统。

score/selector/NBT等上下文敏感Component沿用其在原生tooltip生成时已有的解析状态；不会为了预览以命令源重新执行selector或读取服务器NBT。尚未由游戏解析的组件会和当时原生渲染一样显示空值/占位，不能把getVisualOrderText误称为任意服务端数据查询器。输出是**视觉顺序**，包含RTL文字时前端不要再次做双向重排，否则会二次反转。obfuscated只传样式标志，不把每帧随机字形写进text。

模组通过实际Item/Component tooltip或注入getTooltipLines添加的行自动进入结果，没有原版白名单；未知但已安装且有Codec的组件由原生类型处理。不存在的组件类型不会被静默删掉，返回INVALID_STACK。完全绕开ItemStack、仅在其它GUI绘制回调画的模组覆盖层不属于这条原生文本API，不能承诺捕获。

## hidden、图形和partial

使用真实TooltipDisplay和原生行生成，hidden_components不再由JS猜测过滤。hide_tooltip=true时协议强制name=[]、lines=[]、不获取图像，extra仅描述tooltip_display。这也遵守本合同的“隐藏即无文本”要求；原生对某些OP-NBT物品的警告例外不会被用来绕过hide规则。正常隐藏不是丢失数据，所以partial=false。

extra为尽力描述的结构化附加信息：

| type | 数据和含义 |
|---|---|
| tooltip_display | hide_tooltip、hidden_components真实组件ID；不补回被隐藏文本 |
| bundle | 实际BundleTooltip.contents的count、selectedIndex、最多27项{id,count,name}、truncated；没有原生图格、进度条或鼠标选中渲染，partial=true |
| tooltip_component | 其它实际TooltipComponent的Java class名；不编造内部格式，partial=true |
| container | 实际ItemContainerContents的最多27项摘要，textOnly:true；潜影盒内容**文本**已经来自vanilla lines，不声称存在潜影盒原生图格 |
| map | 实际map_id、imageAvailable:false；不传地图像素，partial=true |
| style_features | 遇到自定义font或shadow；当前run合同不表示这些绘制参数，partial=true |

partial=true表示非文本图形/未表达样式或安全限额造成的不完整，不等同请求失败。partial=false也不代表像素级复刻背景、字体度量、行折行、原生图标和GPU效果；本API提供原生文字/样式及附加信息。

## 限额与错误

每Document每秒最多20次非取消请求；tick前先合并同view，最多两个就绪请求/tick。StackCodec解码、原生tooltip及视觉文字读取都留客户端线程，避免错误跨线程读取注册表/玩家。没有把主线程回调称为可抢占：单个模组tooltip/Codec若很慢仍可能超帧，此服务只限制入口和输出，不保证模组API固定执行时间。

输出≤200条lines、≤24000个UTF-16字符；额外总文字码点/样式run有限额，超限保留前部，partial:true，必要时truncated:true。无法把名称本身压进响应上限时返回TOOLTIP_FAILED，而不是超大patch。没有用扩大Oriel脚本预算掩盖文本搬运成本。

失败形状{version:1,requestId,ok:false,error,reason}，reason≤512字符：

| error | 含义 |
|---|---|
| BAD_REQUEST | 请求类型、requestId/view/boolean、stack字段或8192字符大小非法 |
| INVALID_STACK | StackCodec/官方Codec/strict解码失败；reason保留可读原因 |
| UNAVAILABLE | 无世界/玩家或世界已改变；重新进入后再请求 |
| BUSY | 超过8个view或20次/秒；固定view并合并变更后重试 |
| TOOLTIP_FAILED | 模组原生tooltip异常、视觉投影失败或名称超过响应预算 |

## 实际捕获与验证范围

下面是**真实26.1.2 vanilla代码在无窗口JVM中**产出的响应，来自logs/tooltip/jvm-responses.json。不是手写预期，也不是当前客户端/当前玩家的实测回执；语言为该JVM的默认en_us。样例采用两个附魔的书，避免把无玩家上下文的攻击数值误称为玩家最终数值：

~~~json
{"version":1,"requestId":"enchanted_book","ok":true,"name":[{"color":"#55FFFF","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"text":"Enchanted Book"}],"lines":[[{"color":"#55FFFF","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"text":"Enchanted Book"}],[{"color":"#AAAAAA","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"text":"Sharpness III"}],[{"color":"#AAAAAA","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"text":"Unbreaking II"}]],"rarityColor":"#55FFFF","extra":[],"partial":false}
~~~

同次bundle图形摘要实际响应：

~~~json
{"version":1,"requestId":"bundle","ok":true,"name":[{"color":"#FFFFFF","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"text":"Bundle"}],"lines":[[{"color":"#FFFFFF","bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"text":"Bundle"}]],"rarityColor":"#FFFFFF","extra":[{"type":"bundle","count":2,"selectedIndex":-1,"items":[{"id":"minecraft:diamond","count":3,"name":"Diamond"},{"id":"minecraft:apple","count":2,"name":"Apple"}],"truncated":false}],"partial":true}
~~~

纯JVM覆盖钻石剑属性、两个附魔书、自定义效果药水、成书、玩家头、山羊角、装物潜影盒、收纳袋、彩名/lore、hide_tooltip、hidden_components、模组风格custom_data、地图，NORMAL/ADVANCED均与原生getTooltipLines逐行/逐码点/样式比对；额外覆盖精确long/typed数组SNBT、未知类型拒绝、继承/覆盖/五种样式/Unicode/默认颜色/keybind、自定义字体partial、超长提示上限。无世界的datagen registry标签默认未绑定，测试专用工具从实际依赖jar加载全部enchantment tags并绑定，不维护手写附魔排序。反射仅用于测试fixture，不进入生产实现。

入口tools/registry/tooltip-test.ps1；真正Document/当前世界/当前玩家探针TooltipProbe及隐藏/静音/禁抓鼠标脚本tools/registry/tooltip-run.ps1已准备并独立编译。**本轮用户客户端在运行，未启动真客户端、未运行Gradle**；日志logs/tooltip/live-runner.log、build-runner.log、user-game-processes.json。不能把上述JVM回执说成端到端消息链验收。用户关闭游戏后再运行tooltip-run.ps1，并用tooltip-build.ps1补正式tooltipTest+build；后者会以原子logs/.gradle.lock.d目录获取Gradle互斥锁，最多等待20分钟、结束释放，且获取前后都检查用户游戏。

未验证真实模组TooltipComponent renderer、当前玩家属性修正、资源包/语言/字体重载、联网服务器特有上下文和整页UI绘制；这些需后续真实客户端验收。没有修改UI/Oriel。


## 2026-11-07 最终构建补验

此前的“未跑 Gradle / 等用户关游戏”记录是历史状态。最终门禁已将 componentSchemaTest、entitySchemaTest/entitySchemaServerTest、tooltipTest、worldEditTest 接入正式 check，并运行完整 build。完整输出在 logs/final-gate/gradle-build.log；5个 node UI 测试分别在 node-{world,contract,compact,nbt,search}.log。无关的 Oriel-UI 实例不阻塞 Editor，也不修改或终止它们。真实客户端通道补验使用 tools/final-gate/launch.ps1，新复制世界、正常 runClient、实际猫刷怪蛋页面；最新状态以 logs/final-gate/client-receipt.json 为准。该探针仅证明本机真实页面的 schema/tooltip 请求链，不能代替远程服、多人冲突或完整世界目标 apply 验收。
