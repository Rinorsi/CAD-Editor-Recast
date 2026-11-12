# 首页截图

2026-11-12，CAD Editor 0.99.8 当前源码页面。

| 图片 | 展示内容 |
| --- | --- |
| [物品外观](item-editor.png) | 名称、说明文字、稀有度与提示框 |
| [药水效果](potion-effects.png) | 自定义效果、等级与持续时间 |
| [SNBT](snbt-editor.png) | 原始组件、语法高亮、行号与格式化 |

英文图库使用 [物品外观](en_us/item-editor.png)、[药水效果](en_us/potion-effects.png) 和 [SNBT](en_us/snbt-editor.png)。界面语言与 Minecraft 资源语言均设为 `en_us`，演示物品名称和说明也使用英文。

补充英文编辑页：

| 图片 | 展示内容 |
| --- | --- |
| [书本](en_us/book-editor.png) | 书页文字编辑、预览与分页 |
| [告示牌](en_us/sign-editor.png) | 正反面文本、颜色、发光与涂蜡 |
| [生物](en_us/mob-editor.png) | 驴的驯服、主人与背箱物品 |
| [村民交易](en_us/villager-trades.png) | 玩家支付与获得的物品、交易次数与经验 |

这些图片同样使用实际前端与固定演示数据。离线渲染器不提供真实生物模型，因此生物、村民页面选择编辑器已有的 2D 图标模式。所有上传图片保持 1680 × 1120。图库标题和说明使用相同的简短英文功能名称，来源说明保留在此文档。

仅复现补充图：`python tools/capture-readme.py --locale en_us book-editor sign-editor mob-editor villager-trades`。刷怪笼候选场景可另加 `spawner-editor` 生成；当前单位文字在离线渲染器中裁切，因此不上传这张候选图。

图片由 Oriel 原生离线预览器加载本仓库实际 HTML、CSS、JavaScript 生成，使用固定演示物品，分辨率 1680 × 1120。界面字体随页面设置，物品文字与图标读取本机 Minecraft 26.1.2 资源及 Unifont。不是重新绘制的概念稿，也不是游戏实测截图；离线预览不展示服务端写回结果。

复现：先在相邻 Oriel-UI 工程构建 `:preview:installDist`，再在本仓库运行 `python tools/capture-readme.py`。需要 Java 25 与本机 Minecraft 资源。可追加 `item-editor`、`potion-effects` 或 `snbt-editor` 只生成对应图片；输出在相邻工作区当天的 `screenshots/editor-readme/`。脚本不启动游戏、不修改本仓库页面源码。

英文图运行 `python tools/capture-readme.py --locale en_us`，输出到上述目录的 `en_us/` 子目录，不覆盖中文图。本次英文图使用本机 Oriel 离线预览器 0.15.2；正式 0.99.8 发行包内嵌的是 Oriel 0.15.0。
