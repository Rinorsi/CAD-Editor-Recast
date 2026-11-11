# 物品工坊（Editor UI，前端部分）

围绕「游戏里选中的那一个物品栈」工作的物品编辑器：玩家悬停/手持物品，按快捷键，宿主调用 `OrielEditor.open({ id, count, comps, label, slot })`。
没有背包页、没有全物品列表；要换物品就关掉重开。

- 页面按物品类别分页（`js/pages.js` 的 `PAGES`），每页只放该类物品用得到的卡片（`CARDS.*`）。
- 「添加设置」：二级窗口，给物品加它本来没有的组件，落在对应页或「附加设置」页（`CARDS.raw` 按 schema 自动生成表单）。
- 「物品栈」：主标签首位，内部命令 / 可编辑物品栈 SNBT / 只读 JSON；首次仍打开常规功能页。单一原生多行文本模型直接彩色编辑 SNBT，工具放在面包屑行，仅工具行内部横滚。详细交互见 [编辑与缩放](EDITOR-INTERACTION.md)。
- 「高级」：二级窗口，左侧竖向导航（全部组件 / 改动对比 / 修改历史）；旧数据和命令入口迁到“物品栈”对应分支。
- 附魔目录是二级窗口，可多选。
- 演示夹具已从游戏资源删除，保存在 `browser/mock.js`，仅浏览器预览使用。引擎预览由 Oriel 项目的 `fixture.stack` 提供物品。
- 数据由 `tools/gen-ui-data.mjs` 生成到 `js/data.js`；图标集由 `tools/extract-mc-icons.mjs` 生成（仅浏览器预览，不进游戏）。
- 校验：`bash tools/oriel.sh oriel_check '{"projectId":"item-editor"}'`；截图：`bash tools/shot.sh <尺寸> <动作文件> <名>`。

- 样式在 `assets/cadeditor/ui/editor.css` 一个文件里：Ore 斜角纹理（窗体、按钮、输入框、物品格、开关、滑块、分页）+ 扁平卡片，字体 `oriel:pixel` 8px，窗口居中、最大 560×296（大 GUI 下放大到 700×410）。带纹理的元素不要设 `-mc-tint`，图标颜色用 `--ico`。
- 左侧物品可在 2D 图标 / 3D 模型间切换。页面不能写磁盘：宿主在打开页面时传 `prefs.heroView` 与 `hostPrefs:true`，切换后页面发 `oriel.send('prefs',{key:'heroView',value:'2d'|'3d'})`，宿主（`EditorPrefs`，`config/cadeditor-ui.json`）保存。没有宿主（文件夹预览）时只在本次打开期间记住，默认 3D。

宿主接线使用 Oriel 0.11 文档中的现有 API：`OrielScreens.open(url, {stack: ...})`，页面读取 `oriel.data.stack` 并调用 `OrielEditor.open`。`comps` 是组件覆盖补丁，非完整默认组件表；`removed` 是 `{短组件ID:1}`；`slot` 是宿主生成的对象，页面原样回传。

`apply` 消息包含 `requestId/id/item/count/comps/removed/slot/command`。宿主以结构化数据和打开时绑定的槽位为准，`command` 仅用于展示/复制，不执行。现有「交给游戏的方式」仍只影响命令文本；它与宿主固定槽位提交的文案差异留待用户确认，不改视觉设计。

宿主通过 `driver.patch('result', result)` 返回 `{requestId,status:'saved',item:{id,count,comps,removed,slot}}` 或 `{requestId,status:'rejected',reason:'明确原因'}`。只有成功回执更新保存基线；拒绝、超时、发送失败保留草稿。提交后继续编辑不会被旧回执覆盖。刷新页面时宿主应先更新保存的 `stack`。

独立契约测试：`node ../Editor-Mod/tools/ui-contract-test.cjs`。游戏接入仍需当前版本的用户验收及独立工程适配器；页面检查不等于游戏验证。
