# 首页截图

2026-11-11，CAD Editor 0.99.7 当前源码页面。

| 图片 | 展示内容 |
| --- | --- |
| [物品外观](item-editor.png) | 名称、说明文字、稀有度与提示框 |
| [药水效果](potion-effects.png) | 自定义效果、等级与持续时间 |
| [SNBT](snbt-editor.png) | 原始组件、语法高亮、行号与格式化 |

图片由 Oriel 原生离线预览器加载本仓库实际 HTML、CSS、JavaScript 生成，使用固定演示物品，分辨率 1680 × 1120。不是重新绘制的概念稿，也不是游戏实测截图。字体、图标来自本机 Minecraft 26.1.2 资源；离线预览不展示服务端写回结果。

复现：先在相邻 Oriel-UI 工程构建 `:preview:installDist`，再在本仓库运行 `python tools/capture-readme.py`。需要 Java 25 与本机 Minecraft 资源。可追加 `item-editor`、`potion-effects` 或 `snbt-editor` 只生成对应图片；输出在相邻工作区当天的 `screenshots/editor-readme/`。脚本不启动游戏、不修改本仓库页面源码。
