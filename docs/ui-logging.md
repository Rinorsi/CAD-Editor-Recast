# 页面调试日志

`config/cadeditor-ui.json` 的 `debug` 仅接受布尔值，通过 `oriel.data.prefs.debug` 读回。页面仍用 `oriel.send('prefs', {key:'debug', value:true})` 保存；消息和磁盘读取同样严格校验，沿用每键500ms合并、关闭flush和原子写。

页面可发送：

```javascript
oriel.send('log', {level:'debug', msg:'调试信息'});
// level 仅 debug / info / warn / error；msg 必须是字符串。
```

宿主接收不读取/判断 debug 偏好，是否发送由前端决定。`EditorClient` 只在编辑器页面注册该通道，不发送回执、不修改页面。日志使用名为 `CAD-Editor-Recast` 的SLF4J记录器，消息固定前缀 `[CAD-Editor-Recast]`，由Minecraft现有日志配置进入 `logs/latest.log`。只把这个记录器设为DEBUG，避免默认INFO级别把前端显式发送的debug日志吞掉；其他记录器级别不变。

消息至多1500个UTF-16代码单元，超出截断且不截断代理对；控制字符（含CR/LF/TAB/ESC/DEL/NEL）、Unicode行/段分隔符、格式控制字符及无效代理字符替换为空格，防止注入额外日志行。空字符串允许，非法level/msg直接忽略。

每个Editor客户端实例跨页面重开共用滚动1秒最多20条的接收与输出限额；超量直接丢弃，每5秒至多一条WARN汇总“已丢弃 N 条”。汇总也占输出额度，积压恢复时不会突然刷屏。独立守护线程每250ms排出日志，队列最多128条；队列满也计入丢弃。主线程只做严格校验/限频、接受消息的有界清理与入队，不做日志初始化或磁盘写入。客户端退出不等待日志I/O，退出前尚未排出的尾部日志不保证保留。

无窗口验证入口是现有 `prefsTest`（包含 `EditorUiLogTest`）：布尔偏好及重启读回、非法消息、截断与控制字符、滚动限频/5秒汇总/队列上限、实际后台SLF4J→Log4j四级事件和独立临时 `latest.log` 文件输出。测试只写当天scratch临时文件并清理，不读取或修改用户游戏的日志。

```bash
bash tools/gw.sh :fabric:26.1:build --no-problems-report
node tools/ui-contract-test.cjs
```

新Java通道需更新Editor并重启客户端；本轮没有启动游戏，不将日志管线测试当成页面按钮的游戏内验收。
