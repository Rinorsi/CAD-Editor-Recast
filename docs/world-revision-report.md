# 马载鸡：版本冲突排查交付（2026-11-08）

精确协议与完整生命周期：[world-revision-contract.md](world-revision-contract.md)。真实路由收据：[world-revision-samples.json](world-revision-samples.json)。所有门禁和证据在 logs/world-merge2/。

## 根因证据

本轮加固前的当前三方合并源码，在真实 ServerLevel 里打开马载鸡、等待20 tick运动后改马名字成功：returnedRevision == storedRevision，冻结 baseline 未变；收据 current-source-before-fix.json。不是“未知乘客字段导致新三方合并拒绝”，也没有身份变化。

保留的旧 WorldEditSessions 编译产物 require 字节码先校验 current 的内容指纹，再校验 baseline（pre-merge-session-bytecode.log）。在真实马载鸡场景重放这一旧调用流程，幼鸡 InLove 自然变化、成年鸡 EggLayTime 从200到188，都会得到与用户完全相同的旧 reason，且未进入路径合并。Age/Pos/Motion也在变化，但已有旧规范化，不能把它们误称为本次旧指纹失效原因。root-cause-summary.json 汇总原始收据的对应值。

现场仍运行的本仓库 runClient PID36224 创建于01:25:21；WorldMerge.java 创建01:28:36，WorldMergePlan/WorldEditSessions 三方修改为01:31:59，均为北京时间。没有javaagent/hotswap参数。EditorMod.onInitialize 启动即调用 WorldEditor.initialize，静态初始化会话类。磁盘构建不会替换已加载的这些类：当前进程的启动版本早于三方合并。证据为 running-client.json、client-runtime-flags.json、client-launch-config-path.txt、source-times.json。未对用户JVM attach/dump，不冒称读取过其类字节，也未自动重启或终止它。用户须正常退出旧实例并重新 runClient 才能实机验收新编译结果。

## 修正与回执

- 会话版本改为冻结的不透明64位十六进制版本，只在open/成功保存推进，即使no-op成功也推进；不依赖实时NBT哈希或另加计时字段白名单。token、权限和身份/三方合并仍独立验证。
- open/saved 的SNBT和服务端baseline使用同一份捕获。普通修改在版本提交前检查真实saved快照的传输预算，失败恢复写前状态，避免基线推进但无法构建ACK。
- 客户端宿主先登记pending再发送，成功回执先更新revision再清pending/patch；拒绝、限流不改revision，关闭/断开清理。全部更新点已列于合同。
- 真旧页面：target_changed + stale:'client_revision'；身份变化：target_changed + stale:'identity' + conflicts；旧分支至少stale:'session'；真正路径冲突仍conflicts:[{path:[...]}]，最多20条。
- rate_limited + retryAfterMs:1..500（向上取整）。被限流的点击不延长原窗口、不改baseline/revision；前端可等待后重新提交原可见草稿，不应盲目给旧草稿套上新版本。

## 门禁

- javac全main PASS：compile.log。
- javac全test/fixture PASS：compile-tests.log。
- WorldRevisionTest 27项 PASS：WorldRevisionTest.log，含冻结版本、真正stale、nonce/no-op推进、identity/路径/旧分支metadata、非滑动限流与边界。
- WorldMergeTest、PlayerWorldEditTest、EntityWorldEditTest、WorldEditTest（含BlockWorldEditTest）、EntitySchemaTest、EntitySchemaDetailsTest、EditDispatchTest PASS：各同名Test.log；汇总 gates.log。
- probe-revision-server.ps1 真实WorldEditor路由26项 PASS：server-probe.log / captured-server.json。马名称/属性base/Tags均成功，鸡在骑乘中真实运动/年龄/繁殖/下蛋计时；ACK前旧版本/ACK后新版本连续请求有retryAfterMs，限流后真正旧版本client_revision，新版本成功；ACK与服务端冻结baseline/版本逐笔一致。
- gradlew.bat :fabric:26.1:build PASS（原子锁，1m36s）：gradle-build.log；worldRevisionTest已接入check。
- git diff --check PASS：diff-check.log。人工代码审查：manual-review.log；无可调用/review工具。

## 文件与未验证边界

main（common/src/main/java/dev/rinorsi/editor/）：新增 world/WorldEditError.java；修改 world/{WorldEditor,WorldEditSessions,WorldMerge,WorldTarget,WorldNbt}.java、client/WorldEditorClient.java。

test（fabric/src/test/java/dev/rinorsi/editor/registry/）：新增 WorldRevisionTest.java、WorldRevisionServerProbe.java；修改 WorldEditTest.java、EntityWorldEditTest.java、BlockWorldEditTest.java、PlayerWorldEditTest.java，使会话测试使用服务端opaque版本，内容指纹测试保留。

修改 fabric/build.gradle；新增 tools/world-edit/{verify-revision,probe-revision-server,final-revision-gate}.ps1；更新 world-edit、world-entity、world-block、world-player、world-merge 合同；新增本报告、world-revision-contract.md、world-revision-samples.json。

未改 ui/**、vault/**、Java根包，未add/commit/push。探针只用reply sink替代网络，运行真实服务器处理链；真正客户端网络ACK/丢包时序、第三方模组与领地插件未验收。运行中的用户游戏完全未操作；real-client run pending。
