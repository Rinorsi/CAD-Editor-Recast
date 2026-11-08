# 窗口缩放后信息隐藏：调查结论与复现

调查日期：2026-11-07。目标：Minecraft 26.1.2 / Oriel UI 0.11.0 / CAD Editor。

## 结论

已复现两个前端因素：响应式规则主动隐藏信息；原生 viewport resize 后只测量一次，而窗口四边有 280ms transition，可能把动画中间宽度对应的模式永久留下。未发现 Oriel 丢失 resize 或 getBoundingClientRect 不刷新布局的证据。

GUI scale 将物理像素换成 GUI/CSS 像素，是正常行为；在 1500×1100、scale=4 下 CSS viewport 只有 375×275，窄布局按现有规则正确触发，但隐藏重要信息属于本项目设计选择。

真实客户端动态缩放实验尚未执行：用户游戏 PID 32952（Editor 26.1.2）和其他会话 PID 40432（Oriel 26.1）正在运行，按任务限制未启动 Gradle/客户端、未操作其窗口。不能把 Preview 结果当成 Minecraft GLFW/GUI-scale 整条链路实测，也不能仅凭截图断言具体 GUI scale。

## 可重复实验

运行 `pwsh -NoProfile -File tools/resize/run-preview.ps1`。直接 javac/java，无 Gradle、无原生窗口、无输入。安装的 Preview 提供资源/字体/绘图，classpath 第一项为本工程 `libs/oriel-fabric-26.1.2-0.11.0.jar`；日志记录 Document 类实际来自该发布 jar。页面为真实 `cadeditor:ui/index.html`，注入 diamond_sword 初始数据夹具。不是新建 HTML 近似页面。

| 物理 viewport / scale | CSS viewport | #win 宽度 | 稳定初始模式 | 信息显示 |
| --- | --- | --- | --- | --- |
| 1500×1100 / 1 | 1500×1100 | 880 | normal（class=ew） | stats/tags/提示预览/预览标题/搜索及添加标签均显示 |
| 1100×800 / 2 | 550×400 | 484 | snug | 上述信息显示；hero 紧凑 |
| 760×560 / 1 | 760×560 | 600 | snug | 上述信息显示 |
| 600×420 / 1 | 600×420 | 528 | snug | 上述信息显示 |
| 460×360 / 1 | 460×360 | 404.8 | narrow | 上述信息全部 display:none；描述省略 |

### 同一 Document，不重开页面

Preview CLI 的动作不提供 viewport resize，因此 Java probe 直接调用正式 Document.setViewport（与宿主使用同一入口）。每步推进 6 帧，每帧 80ms，记录 handler 即时值和 480ms 后值。

| viewport / scale | resize handler 的 #win 宽度 | 480ms 后宽度 / class | 判断 |
| --- | --- | --- | --- |
| 初始 460×360 / 1 | 无事件 | 404.8 / narrow | 正确 |
| 1500×1100 / 1 | 600 | 880 / snug | class 滞后，应 normal |
| 600×420 / 1 | 580 | 528 / snug | 正确 |
| 1500×1100 / 4 | 340 | 340 / narrow | 正确（CSS375×275） |
| 1500×1100 / 1 | 600 | 880 / snug | class 滞后，应 normal |
| 460×360 / 1 | 440 | 404.8 / snug | class 滞后，应 narrow；media 仍隐藏信息 |
| 1500×1100 / 1 | 600 | 880 / snug | class 滞后，应 normal |

六次真实变化产生六个 resize；相同 viewport 不产生事件。每个 handler 的 innerWidth/innerHeight/DPR 都是新值。handler 采样 class 发生于应用 setTimeout 回调前，不能与该回调的最终 class 混用。

对照一：动画完成后手动调用一次 scheduleFit，880px 的 class 从 snug 恢复 ew。对照二：仅在 probe 中注入 `#win { transition:none !important }`，同一 Document 的 small→large→small→large 四次都正确得到 narrow→normal→narrow→normal。说明一次性测量动画几何足以造成滞后，无需假设引擎事件丢失。当前复现的滞后大窗口为 snug，不是 narrow；截图中完整隐藏还可由媒体查询独立触发。

## 引擎源码证据（只读主 checkout）

以下路径相对于 `../Oriel-UI/`：

- `common/src/main/java/dev/oriel/mod/client/OrielScreen.java:44`：screen.init 调用 driver.resize(width,height)。MC 尺寸/GUI scale 重建屏幕后走此入口；最大化属于同一尺寸变化路径，没有单独 page maximize 事件。这里未动态验证 MC 调用时机。
- `common/src/main/java/dev/oriel/mod/client/DocumentDriver.java:229`：resize 保存尺寸并 applyViewport；`:324` 转发 Document.setViewport；`:332` 使用 GUI 尺寸、Minecraft Window.getGuiScale 作为 DPR。
- `engine/src/main/java/dev/oriel/engine/dom/Document.java:324`：三个值相等则返回；否则先写 viewport/DPR，标记 style/layout dirty，再同步派发 resize，无定时 debounce。派发前未主动 layout。
- `script-rhino/src/main/java/dev/oriel/engine/script/WindowBindings.java:47`：innerWidth/innerHeight/devicePixelRatio 直接读 Document 新值；`:51` window 事件监听注册到 Document。
- `engine/src/main/java/dev/oriel/engine/dom/Element.java:665`：getBoundingClientRect 先 flushLayout，返回 paintedRect；`Document.java:389` 的 flushLayout 先更新样式再更新布局。因此 handler 可以读新 viewport 布局，但带 transition 时读到的是当前动画几何，不是最终目标几何。
- `engine/src/main/java/dev/oriel/engine/anim/AnimationEngine.java:52`（styleChanged 方法在 :61）：样式改变建立/重定向过渡；`:79` 起说明 tick 推进动画并派发 transition 事件。`Document.java:350` 起 frame 先跑 scheduler，再 restyle/tick/layout。setTimeout(0) 不意味着等到 280ms 过渡结束。

## 前端修改建议（本 worker 未修改前端）

1. `common/src/main/resources/assets/cadeditor/ui/js/screens.js:180` 两个 class toggle 均能双向更新，不是单向切换错误。`:181` 原生 resize 只执行一次 scheduleFit，而 `:175–176` 的 applyWinStyle 另有 160/520ms 重测。对原生 resize 也执行最终防抖重测（大于 280ms，例如沿用 520ms），或在 #win 的几何 transitionend 后重测。更直接的方案是 viewport resize 时停用窗口边缘过渡，避免读动画宽度。单个 requestAnimationFrame/setTimeout(0) 不足。
2. `editor.css:578` 的 left/right/top/bottom 280ms 过渡是上述测量竞态的条件。保持动画时要处理 resize 连续发生、取消/重定向过渡的最终重测。
3. `editor.css:538–553` 的 `(max-width:540px), (max-height:290px)` 即使没有 narrow class 也隐藏 stats、tags、提示、预览标题、按钮/搜索文本；特别是短而宽的 GUI 也触发。`:831–840` 的 narrow 规则再次隐藏这些内容。需要同时调整两处：重要信息保留，通过换行、滚动或用户可展开区呈现；不能只修 JS class 或只改 420px 阈值。
4. `:874–887` 的 snug 主要缩小 hero，不能把本实验的大窗口 snug 直接说成所有信息隐藏的充分原因。

## 可提交上游的测试覆盖建议（不是已确认引擎 bug）

**Title:** Add conformance coverage for resize dispatch, GUI scale and geometry during transitions

**Environment:** Minecraft 26.1.2; Oriel UI 0.11.0; Java 25. Reproduced in the headless Preview using the release engine jar. Native client resize remains unverified because an existing user client must not be disturbed.

**Motivation / observed:** Our application samples an animated container width once in its resize callback and can retain an intermediate responsive class after the transition completes. Oriel does deliver resize and updates viewport getters. This is currently an application issue; an engine regression test would help distinguish stale layout from permitted intermediate animation geometry.

**Minimal fixture:** A static element with width:80vw and an independently animated panel with left/right:10vw and transition:left 280ms,right 280ms. Record innerWidth, innerHeight, devicePixelRatio and both bounding rects inside window.resize, and record again after advancing animation time. Resize the same Document small→large→small; also change only DPR. Do not rebuild the page between steps.

**Expected:** Exactly one resize per changed viewport tuple, none when unchanged. Getter values must be current in the handler. The unanimated element must lay out at the new width when read. Animated geometry may legitimately be intermediate, but must reach its expected target and emit the documented completion events. No stopped page/script error. The host screen-resize and GUI-scale path must forward the GUI dimensions/DPR to the same Document.

**Actual evidence:** All six changed tuples delivered resize in our probe. Large viewport handler width600 became width880 after animation; resampling then fixes our class. Disabling transitions fixes all four small/large class updates. There is no demonstrated missing-event or stale-unanimated-layout failure. See attached `resize-events.json`, `resize-events-no-transition.json`, `preview-results.json`.

**Conformance test spec:**

1. Engine test without transitions: assert event count, immediate getters, rects and DPR for (460,360,1)→(1500,1100,1)→(375,275,4)→unchanged→(460,360,1). Include a DPR-only change.
2. Engine animated fixture: advance clock deterministically; distinguish intermediate used geometry from final target; assert final rect and completion/cancellation semantics under rapid retargeting.
3. Native client integration: programmatically resize GLFW and change GUI scale on the render thread; after screen re-init verify Document identity, viewport tuple and event log. Exercise small→large→small and maximize/restore. Run only in a separate silent/offscreen instance.
4. Application test separately: animated #win must eventually acquire the mode matching its settled width, and important information must remain reachable at GUI viewport375×275. This is a CAD Editor responsibility.

## 产物与门禁

- `logs/resize/preview-run.log`：全部运行输出；11 条显式断言，17 个采样（5 初始、7 同页变化、1 完成后重测、4 无过渡对照）。每帧另检查页面未 stopped，检查 host 无 runtime error。
- `logs/resize/compile.log`、`runner.log`：直接 javac / runner 门禁。
- `logs/resize/preview-results.json`、`resize-events.json`、`resize-events-no-transition.json`：完整数值。
- `logs/resize/initial-*.png`：五张截图；1500@1 与 460@1 已目视比对，后者重现隐藏信息外观。
- `logs/resize/user-game-processes.txt`：真实客户端实验阻塞证据及命令行；未停止任何进程。
