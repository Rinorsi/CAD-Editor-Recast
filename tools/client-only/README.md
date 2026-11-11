# Client-only LAN verification (26.1.2 Fabric)

The test launches a real integrated-server host, an Editor/Oriel joiner and an
ordinary observer. Only the joiner has CAD Editor or Oriel. All instances use
fresh directories under the daily evidence folder, copied **test** worlds,
hidden/unfocused GLFW windows and disabled native mouse capture. No OS input is
sent. The host and observer load Fabric API and this independent instrumentation.
Their complete loaded-mod lists, arguments, jar hashes and messages are retained.

Build without competing with production Gradle:

    pwsh -NoProfile -File tools/client-only/build-probe.ps1 -Evidence <new-probe-directory>

Or, when the build owner schedules it:

    ./gradlew.bat -I tools/client-only/launch.init.gradle :fabric:26.1:clientOnlyProbeJar

Run against an explicitly chosen release jar:

    pwsh -NoProfile -File tools/client-only/run.ps1 -ProbeJar <probe.jar> -EditorJar <release.jar> -Evidence <new-run-directory> -Mode expanded

The launcher rejects existing evidence directories and an occupied port 25781.
It cleans up only process objects it created. All errors and prior runs remain.
The probe is a separate jar/sourceSet; it is never included in release artifacts.

The current inventory scope covers authorized survival slots 9/35, fixed hotbar
binding, actual Vault give into the sole empty slot, permission denial, full
inventory refusal and unsupported world/container notices. Vault success requires
the exact requestId, status=saved, confirmed=true and server SNBT readback. A
read-only command audit checks single submission and absence of denied retries.
The expanded mode then runs the first self-player contract: actual self navigation,
mode and XP level controls, Apply/requestId/authority-query receipts, host fields,
no-OP and revoked permissions, mixed drafts, visible Health restrictions, pending
new draft retention and delayed confirmation timeout with no write retry. The
self mode runs only those cases. XpP/total writes, teleport, attributes and effects
remain outside the first contract; their pages must explain the current limits.
The historical blanket self-navigation refusal has been removed from inventory.

Historical scopes -Mode full and -Mode notice retain old product expectations
(slot9/Vault refusals) for archived artifacts only; do not run these as acceptance
of the expanded inventory/Vault product. -Mode extra covers nonselected hotbar
hover/reopen and oversized SNBT refusal. Their result files state scope; they do
not claim to rerun the full suite. Opening a test page explicitly discards a
restorable prior-test draft through its real confirmation button before the next
case starts. Draft-retention assertions inspect the rejected edit before closing.

## Instrumentation and authorization

The isolated host disables online authentication for the offline test identities.
This does not replace command permissions. LAN is published with
allowCommands=false. Since IntegratedServer does not register the dedicated
server's op/deop text commands, setup invokes vanilla PlayerList.op/deop on the
server thread. Both actual server permissions and the client's command tree are
asserted before saving or asserting a permission denial.

Host serverCommand is used only for fixtures, never for the operation being
tested. Saves use the existing Editor screen, Store field setters, real Apply
confirmation button event, existing applyToGame and actual EditorClient networking.
No result is injected. Each save requires a matching real requestId/status=saved,
server inventory readback and close/reopen. Rejected edits require a matching
rejected code and retained draft. Long/byte-array preservation uses server NbtOps
SNBT strings, not JavaScript numeric values.

The optional inventory-delay mixin queues original clientbound inventory packets
on the client thread. It never changes server inventories or fabricates packets.
Timeout tests read actual server state, then release those original packets and
assert that a terminated page does not accept a late saved result or new baseline.

## Evidence

* lan.json: actual network UUIDs/port, integrated/remote flags, mod lists.
* scenarios.json/full-result.json: strict per-scenario receipts and inventory SNBT.
* requests.jsonl: all test RPCs and returned state, hidden/unfocused assertions.
* host/joiner/observer: mods.json, installed-jars.json, java.args, messages.jsonl,
  screenshots, logs, complete stdout/stderr.
* cleanup.json: ownership token and remaining owned processes.
* playerFields RPC: independent server-thread XP/position/mode/abilities/attribute
  snapshots; attribute modifiers include both complete and permanent sets.
* tag-query-replies.jsonl: actual original query transactionIds and relevant NBT
  fields. Only query replies/inventory packets may be delayed; none are fabricated.
* player-sync.jsonl: read-only completed vanilla packet handler epochs, available
  for future field contracts; not an assertion of currently supported fields.

The inventory permission check clicks the persistent footer capability control,
then inspects the expanded reason body; a label/title containing "permission"
never suffices. A single case waits for the initial toast to expire, rebuilds the
real page and verifies the control/body survives. Vault reads its own warning
body in the visible modal. Screenshots still require actual human/agent review.

LAN failures during tool development are retained and must not be counted as
passes. Runtime screenshots require visual review. No test changes gamerules to
suppress feedback. Operator and ordinary-observer message receipts distinguish
actual vanilla recipients; third-party plugins are outside this fixture.


## 内嵌包与热更新验证

run.ps1 自动读取 Fabric 父 jar 的嵌套条目；已内嵌 Oriel 时，不再给操作者/完整后端房主复制独立 Oriel。外部版可显式传 -OrielJar。backend-dual 的无 Editor 旁观端必须显式提供匹配的 -OrielJar。

backend-single 可加 -VerifyHotReload：仅在本次 Evidence 内创建源码夹具，使用官方 dev-sources.properties 绑定命名空间；先完成混合保存，再重新打开页面，修改夹具HTML标记并等待自动重载。不会修改生产源码或正式jar，不会将该开发配置打包。

## 保险库预设套用自己

玩家预设每行右侧提供“套用到自己身上”。入口先通过宿主重新读取 self 目标，再选择预设已保存的分区、预览覆盖内容、检查套用前备份并显式确认。页面有未应用草稿或待确认的写入时不会跳转；套用仍由服务端检查权限和目标 revision。客户端单装时明确提示整份玩家预设需要服务端支持。

正式包实机检查使用 run.ps1 -Mode backend-single -VaultSelfDebug，配合显式 EditorJar、ExpectedEditorSha256、RuntimeClasspath、ProbeJar 和全新 Evidence。仅用自己的隔离世界与保险库，保存背包预设后改变当前背包；从真实行按钮进入并验证预览/备份/取消不写入，确认后要求真实 saved、房主权威物品数量恢复、关闭重开一致。记录 vault-self-result.json、requests.jsonl 和截图。

## 小窗口左栏布局复现

`run.ps1 -Mode backend-single -LayoutDebug -WindowWidth 854 -WindowHeight 480` 配合显式 EditorJar、ExpectedEditorSha256、RuntimeClasspath、ProbeJar、全新 Evidence 运行真实隔离游戏。默认复制当前 UI 源码，通过官方开发热更新映射读取；不操作已有游戏或用户世界。旧样式的预期为 REPRODUCED；修复后加 `-LayoutExpectedFixed`，再加 `-LayoutPackaged` 可直接检查 jar 内页面，不启用源码覆盖。

记录首次小屏、放大、缩回、滚动、重开的真实截图及 DOM 矩形、display、滚动位置和偏好，保存在 layout-debug.json / layout-debug-result.json。修复检查要求属性和提示框保留、两栏不重叠、左栏至少100逻辑像素、右栏至少200逻辑像素，且实际滚动能抵达提示框。

2026-11-09 根因：默认窄屏把 hero 压到68px，hthin 样式将属性/标题/提示框整段 display:none；resize 分类还可能读到改类前的旧宽度。现默认窄屏112px，保留内容并滚动，默认 compact 分类直接依据窗口宽度。`node tools/ui-sidebar-layout-test.cjs` 检查首次旧几何、双向 resize、自定义栏宽及禁止 compact 隐藏正文；已加入统一 UI 检查入口。

## 高级 SNBT 原生文本框实机验证

`backend-single` 可加 `-TextFieldDebug`，必须使用包含当前 autotest probe 源码的独立 `ProbeJar`。它在隐藏、无焦点且不捕获系统键鼠的隔离客户端中，经 `OrielScreen` 的真实输入路径验证：两个横向落点产生不同且单调的插入位置、跨硬换行拖选后输入替换选区、Home / End / Shift 选区、Ctrl+A/C/X/V、Ctrl+Z/Y、长多行粘贴不重建 textarea 或自动格式化，以及只有真实点击「格式化」后才缩进。脚本不触发应用或命令写回。

测试会暂存系统剪贴板、写入固定夹具并在 `finally` 中恢复；原内容不写入验收日志。回执为 `textfield-result.json`、`textfield-scenarios.json`、三张截图和 `requests.jsonl`。入口示例：

    tools/client-only/run.ps1 -Mode backend-single -TextFieldDebug -EditorJar <final-jar> -ExpectedEditorSha256 <hash> -ProbeJar <current-probe.jar> -Evidence <new-directory>

`-UiInteractionDebug` 串联上述文本验收、`nested-item-debug.mjs` 背包完整编辑验收及比例/窗口验收。背包检查实际点击格子与“完整编辑”，用原生键入修改 SNBT；先验证取消和子页保存都不写游戏，再从父背包应用，要求真实 `saved` 回执、服务端 long/short/类型数组保真和重开一致。回执保存在 `nested-item-result.json`、`nested-item-scenarios.json` 及四张截图。

`pagePointer` 默认偏移和 `elementRect` 均为 GUI px；`moveOnly:true` 只调用 Screen 移动路径并返回 `pressed:false/released:false`，拖动终点可离开源元素。文本脚本显式 `pageUnits:true` 时，探针才按 DOM 与 GUI 矩形之比转换偏移；矩形本身不再转换。Tab/Shift+Tab 走 Editor 控制器调用 Oriel `TextSelection.replace/select`，保持单步原生撤销，不写回 textarea.value 或修改 Oriel。
