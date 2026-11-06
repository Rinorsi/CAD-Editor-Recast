# 编辑会话、基线与错误回执

## 长时间编辑与会话恢复

服务端会话不设30分钟或其他时长硬超时，生存期绑定连接；每次apply/confirm记录活跃时间。断开、服务端启动/停止仍会清理缓存，close只清理同槽位、同token的当前会话；延迟的旧close不会删除新打开的会话。缓存只是加速及创造模式两阶段提交状态，不能成为丢草稿的理由。

打开和成功保存的item快照新增baseline：原版ItemStack.CODEC的类型保真NBT，经Compound键排序后SHA256。包含物品类型、数量和完整组件，保留NBT数值/数组类型，不使用易损JSON快照作为比较依据。不往物品写入任何私有字段。baseline是乐观并发凭据，不代替权限/槽位/容器可达性检查。

客户端Java宿主持有上次服务端确认的baseline，在页面apply消息转为网络请求时自动补充，不信任页面可变草稿中的baseline。页面现有apply结构无须改变。服务端缓存缺失/被其他open覆盖时，重新定位slot、检查权限，当前物品指纹必须与baseline一致才重建会话，然后继续原有ItemStack.matches(current, original)、原版Codec、槽位容量检查和写回。当前物品改变或被移走时拒绝，绝不自动换基线覆盖。

创造模式仍先commit→原版创造槽位包→confirm，不在confirm中写物品。confirm带baseline（原物品）与commitBaseline（服务端commit快照中待写物品指纹）；若prepared缓存丢失，只在当前物品精确匹配commitBaseline时恢复并确认已经发生的写入，绝不因缓存丢失而再次覆盖物品。缓存存在时仍用ItemStack.matches(current, prepared)确认。

slot按kind/index/menuId语义比较，忽略token和附加展示字段；token仅用于防止旧close清除新会话。inventory忽略menuId。非法类型/越界/不可访问的容器或槽位仍拒绝。

服务端saved/rejected及客户端本地拒绝继续返回requestId。前端仅saved更新基线，rejected/超时保留草稿。断网后的草稿跨页面持久化由前端负责；本次修复不承诺客户端崩溃/退出后的草稿落盘。

## rejected.code

| code | 含义与建议 |
|---|---|
| session_lost | 请求缺少/带无效基线，无法安全恢复；新版宿主自动带基线。保留草稿，提示更新客户端/保留草稿后重新选取物品；不要无条件自动覆盖 |
| item_changed | 当前槽位物品与基线/待确认物品不一致，含移走；提示具体背包/容器槽位，无法判断修改者，保留草稿供比较/复制 |
| slot_invalid | 槽位格式/范围错误，容器关闭或不可访问，槽位拒收/容量不足；保留草稿 |
| not_allowed | 玩家状态或当前权限不允许写入；保留草稿 |
| invalid_request | 其他请求格式、原版Codec校验等失败；按reason展示，保留草稿 |
| payload_too_large | 网络回执超过上限；可能已提交，保留草稿并重新读取核对，不能显示未保存或盲目重发 |
| request_timeout | 客户端等待回执超时，结果未知；保留草稿，先核对当前物品 |

## 根因排查的证据边界

旧实现把SESSIONS.get()==null和完整slot JSON（包括token/附加字段）不相等合并成同一个“编辑会话或槽位已经失效”错误，并且没有恢复路径/清理原因日志；30分钟检查是后续另一分支，提示文本不同。缓存清理入口包括close、断开、服务端启动/停止，open按玩家覆盖旧会话。JSON对象字段顺序本身不影响Gson.equals，不能据此断言是字段顺序错误。

静默测试复现了缓存clear/remove、close后apply、重复open覆盖、token/附加字段变化等原分支触发条件，并验证新版恢复。现存日志未找到这次报错的请求/清理记录，无法追溯断言用户这一次究竟由哪个清理入口触发；不能把30分钟超时或热重载假设当作已证实根因。已新增服务端open/close/disconnect/server-reset/recovery/rejected分类日志，后续可精确定位。

测试入口：现有codecTest调用EditorSessionsTest，真实原版注册表/Codec，注入单调时钟验证31分钟和9小时仍可apply，无需开游戏。完整证据见当天reports/EDITOR-SESSION-RECOVERY.md。