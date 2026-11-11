# 物品写回日志

默认写入当前游戏实例的 `logs/latest.log`，搜索 `[CAD-Editor-Write]`。
同一笔保存按 `request=` 串联；客户端的 `session=` 区分每次打开编辑器。
服务端安装本模组时，服务器自己的 `logs/latest.log` 也会有同请求号日志。
客户端无法读取插件服内部拒绝原因，不能用没有回执推断权限不足。

## 常见阶段

| stage | 含义 |
| --- | --- |
| `client.open.target` | 已选择目标；记录槽位、物品 ID、数量、创造状态、原版管理员状态、模组通道和菜单编号 |
| `client.page.opened` | 已打开页面 |
| `client.apply.request` | 宿主收到保存请求 |
| `client.apply.decode` / `client.apply.entity_validation` | 此阶段报错表示组件解码或实体数据校验失败，尚未发出写回 |
| `client.apply.validated` | 物品通过客户端校验 |
| `client.creative.sent` | `send` 已返回；记录包名 `ServerboundSetCreativeModeSlotPacket`、背包索引、协议槽位。表示交给客户端网络连接，不证明服务器接收或批准 |
| `client.creative.local_prediction` | 采用原版创造界面的客户端预测显示；返回 sent / confirmed=false，保留草稿，不能当成服务器保存确认 |
| `client.creative.changed_after_submission` | 提交后物品与预测不一致；记录差异组件 ID，来源未知，需重新读取 |
| `client.mod.sent` / `client.mod.reply` | 自定义模组请求发出／回执收到，记录操作、状态、长度与是否匹配当前请求 |
| `server.request.received` / `server.permission.allowed` | 服务端模组收到请求／权限检查通过 |
| `server.reply.sent` / `client.mod.saved` | 服务端发回结果／客户端处理服务端保存确认 |
| `client.command.preflight` | 命令写回前检查；记录服务器命令树是否包含 execute、item，不记录完整命令 |
| `client.command.sent` / `client.command.saved` | 命令提交／现有状态机确认同步结果 |
| `client.command.unconfirmed` | 命令结果未知或目标变化；记录 outcome，不据此断言具体权限问题 |
| `client.apply.rejected` / `client.mod.rejected` | 本地拒绝／服务端拒绝，带 code 与截断后的原因 |
| `client.open.timeout` / `client.apply.timeout` | 打开／保存等待超时；保存记录耗时、当前状态。纯客户端创造通道不等待无保证的原版回传 |
| `client.page.close.pending` / `client.disconnect.pending` | 请求未结束就关闭页面／断开连接，结果需重新读取核对 |
| `client.command.document_stale` | 页面重载使旧命令会话失效 |
| `client.receive.failure` / `client.mod.reply_apply` | 回包解析、路由或处理异常，包含内部异常堆栈 |
| `server.reply.oversize` | 服务端结果过大，无法返回原快照；需要重读确认是否已保存 |

`route=server_mod` 是模组通道，`route=command` 是命令写回，`route=vanilla_creative`
是无服务端模组、无命令会话的候选通道；只有 `client.creative.sent` 才证明执行过创造发包。
`gamemaster=false` 不表示创造写回一定会被拒绝。

原版创造写回不保证向发送者回传同样物品，因此本地预测后返回 sent，界面明确未确认并保留草稿，不再等待可选回传。服务端模组或命令路径的 `client.apply.timeout` 的
`outcome=unknown permission_denial_not_proven=true` 明确表示未确认结果，
可能是未回传、插件拦截、连接或其他原因；关闭后重新读取核对，不自动重发。

## 其他已有诊断

`[CAD-Editor]` 覆盖注册表、索引、搜索、资源、偏好保存及服务端内部异常；
`[CAD-Editor-UI]` 记录 UI 回调和序列化异常；`[CAD-Editor-Perf]` 记录页面加载耗时。
范围和限制见 [DIAGNOSTICS.md](DIAGNOSTICS.md)。

写回阶段日志按用户操作输出，不在等待的每个 tick 刷日志；每个普通日志字段限长并过滤控制字符。
不主动输出整份 NBT、完整命令、背包或服务器地址。拒绝原因和异常堆栈可能包含游戏返回的输入片段。
反馈时提供出错时间、操作、版本、加载器和完整前后日志即可。
