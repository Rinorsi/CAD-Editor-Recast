# 通用注册表 schema（P4-4，v1）

业务实现位于 common；无模组 ID 白名单。组件继续使用 component_schema / component_validate，来源为 data_component_type 的实际持久 Codec。

## 读取

`oriel.send('registry',{name:'generic_schema',kind:'entity'|'block_entity',id?:'mod:type'})`，回复字面键 `registry.generic_schema`，沿用 RegistryPages 信封，额外带 kind/id。省略 id 时遍历对应实时注册表；每 tick 至多创建一个类型，未进入世界返回 error。默认实例不加入世界、不 tick、不 finalizeSpawn。方块实体使用实时 block 注册表内 type.isValid(defaultBlockState) 命中的状态，不猜方块名称。

条目为 `{id,kind,schema_version:1,available,source:'runtime_nbt_shape',specialized,editable,editable_reason?,default_snbt?,fields}`。`specialized:true` 表示已有专用视图优先，fields 为空；工厂失败返回 available:false、editable:snbt_only、editable_reason，不以空字段冒充完整支持。默认模板仅用于观察，不能直接覆盖真实实例。

已放置目标在没有专用视图时增加 `world.views.generic = {value,snbt?,schema}`。schema 与上面条目相同但 fields/default_snbt 来自当前实例，因此默认未保存的可选字段仍可能不在目录模板中。value 是以顶层 NBT 键为索引的 **SNBT 字符串** 对象（不是普通 JSON 值）；snbt 是完整原始 compound。超过 18000 字符时不重复携带 snbt，仍使用顶层 world.snbt；schema 超预算明确 available:false、value:{}，不截断数据。

实体的共有 riding/team/leash 区段不算类型专用视图，通用视图可与它们共存。容器、刷怪器、命令块以及现有特定实体视图仍优先。

## 字段

fields 使用现有 block views 的对象映射格式。每个字段包含：

```json
{
  "type":"integer","kind":"integer","nbt_type":"int",
  "nbtPath":["energy"],"default_snbt":"12",
  "editable":"structured","read_only":false,"nullable":false,
  "authority":"runtime_nbt_shape_and_detached_loader"
}
```

- type/kind：integer、number、boolean、string、array、object、stack、block_state、identifier、unknown。nbt_type 为实际 byte/short/int/long/float/double/string/list/compound/byte_array/int_array/long_array。
- 所有字段都有 default_snbt，数值不能经 JS Number 盲转（特别是 long）。integer/number 表示保存类型，不证明玩法范围；byte 的 0/1 无法证明布尔语义，标记 unknown + snbt_only，不猜布尔。boolean 为有额外权威类型证据时预留；当前单样本 NBT 推断不会输出 boolean。
- object 的 fields 递归使用同格式；array 的 elements 描述现有各项，不根据一个样本推断所有未来项。空列表、NBT 数组、深度/节点预算耗尽、歧义节点退回 snbt_only，并带 editable_reason/read_only_reason（中文说明）。集合整体通过 SNBT 编辑，不能用 JSON 覆盖未编辑子项。
- 形状推断预算为 256 节点、8 层；fields_complete / elements_complete 标明嵌套描述是否完整。预算只限制辅助 schema，不改原始 SNBT。单条 schema 超 18000 字符则整体降级，保留 RegistryPages 的 24000 字符分页上限。
- stack/block_state 必须经真实 Codec 解码再编码 **typed NBT 完全相等**；否则保持普通复合结构。
- 26.3 的无属性 BlockState 可保存为裸字符串，此时无法与普通注册表 ID 字符串区分，按 identifier 展示，不臆测使用场景。
- 字符串只有在实际已知注册表中命中才能是 identifier；包含 `registry_matches:[注册表id]`、`candidate_source:{kind:'registry',registries:[注册表id]}`、`allowManual:true`。多注册表命中保留所有来源，不猜其中一个；候选经现有 registry 请求获得，不内嵌手写列表。不命中的字符串仍为 string。
- editable 为 structured / snbt_only / readonly；read_only 表示通用表单不可写。只读原因不代表数据页可越过现有身份/安全限制。id/UUID/位置等现有保护字段不会因新 schema 获得写权限。

## 保存

方块使用已有 apply 的 `views.generic`；实体使用已有 apply 的 `entity.generic`。值为 `{顶层NBT键:完整SNBT字符串}`，只提交实际修改的键，不提交 schema/value 外壳。通用后端严格保持原字段 NBT 类型；不允许通过通用控件新增/删除键，不接受 snbt_only/readonly 字段。复杂字段转数据页，沿用已有完整 `snbt` 提交。

专用视图存在时拒绝 generic 写入。保存复制原始 NBT，仅替换选定键，随后经过原有权限、身份、会话、三方合并、真实 detached loader 和持久化检查。通用写入额外要求加载保存后所有请求字段及未编辑字段均保留原始 typed NBT；不能保留时拒绝并保持原目标。此机制不添加服务端写操作、不绕过 EditorPolicy。

单字段 SNBT ≤8192 字符且必须恰好一个值；不通过包裹 compound 解析，拒绝尾随键和重复键注入。初次 detached loader、最终并发合并后的 loader，以及实际目标写入后的保存结果，都检查全部字段保留，包含未编辑的未知键。实际写入前复制独立期望值，避免模组 loader 原地改动输入 NBT 掩盖差异；检查失败由现有事务回滚并拒绝成功回执。任意模组自身不可逆外部副作用和拒绝回滚的 loader 不在可保证范围内。

## 边界

默认保存无法发现省略的可选字段、tick 后新增字段、服务端限定工厂、外部能力数据或不写 NBT 的状态。工厂/Codec 失败和预算耗尽明确降级；不调用任意模组 setter 试探范围。NBT byte 没有独立 bool 类型，单次样本不足以可靠区分 0/1 计数与布尔。探针使用 testFixtures 内隔离 JVM 注册内容；不代表真实第三方整合包实机验收。

复合、列表和数组目前只导出类型描述，统一在数据页编辑。继承了专用容器/命名等视图的模组类型不会额外叠加通用表单，其附加私有字段仍用数据页。加载器省略默认键、转换类型或无法在 detached 副本回读关系数据（例如带乘客的实体）时，严格保真校验会拒绝通用写入；不把这种正规化冒充无损保存。已有骑乘等专用操作保持原行为。

目录请求为本地客户端只读任务，最多同时排队 8 个任务，全局每 tick 一个工厂。关闭页面、换世界、标签/资源代际变化取消旧任务；候选按真实字符串查注册表，避免每次构造 schema 全量复制所有注册表。预算为协作式，不能抢占任意模组自身耗时工厂。
