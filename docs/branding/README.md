# CAD Editor 品牌资源

2026-11-12，当前带底板图标采用作者在本次对话中提供的 512×512 PNG。平台 512 版保留原文件；256 版与运行包 128 版由该图最近邻缩小，不增加抗锯齿或重新生成图案。

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `icon-plate-512.png` | 512×512 | 当前平台项目图标，保留上传原图 |
| `icon-plate-256.png` | 256×256 | 当前 GitHub README 顶部（显示宽度 128）与 UI 图标 |
| `logo-transparent-512.png` | 512×512 | 历史透明素材，保留供旧引用使用 |
| `logo-transparent-256.png` | 256×256 | 历史透明素材，保留供旧引用使用 |

Fabric、NeoForge 模组列表、Modrinth 项目与 GitHub README 使用当前 **plate** 图标；`ui/logo.png` 与 `icon-plate-256.png` 相同。历史透明素材不表示本次新图标的透明版本。

## 模组元数据

名称保持 **CAD Editor**，作者为 **云诺羲Rinorsi**。

- 主页／源码：https://github.com/Rinorsi/CAD-Editor-Recast
- 问题反馈：https://github.com/Rinorsi/CAD-Editor-Recast/issues
- B站：https://b23.tv/hjUvs0c
- 爱发电：https://afdian.com/a/Rinorsi

运行包图标为 `icon-plate-256.png` 缩小 2 倍的 128×128，写入 `common/src/main/resources/assets/cadeditor/icon.png`。两个加载器均打包为 `assets/cadeditor/icon.png`，不是 UI 目录下的 `logo.png`。Fabric 的 `contact.bilibili`／`contact.afdian` 是附加键，启动器是否展示未验证；NeoForge credits 中的链接是否可点击未验证。

## NeoForge 图标键与路径依据

TOML 使用 `${neoforge_logo_key}`，由 `build-logic/src/main/groovy/multiloader-common.gradle` 的 `processResources` 展开；值只在 `stonecutter.properties.toml` 中按版本选择，沿用 Oriel UI 的机制。

核对本机 Gradle 缓存中的实际依赖（`net.neoforged:neoforge:<版本>:sources`）及对应 FML loader jar：

| Minecraft / NeoForge | FML | 元数据键与依据 |
|---|---|---|
| 26.1.2 / 26.1.2.126 | 11.0.15 | `client/gui/ModListScreen.java` 的 `updateCache()` 读取 `IModInfo.getLogoFile()`；FML `ModInfo` 从 `logoFile` 读取。此版本不读取 `iconFile`。 |
| 26.2 / 26.2.0.88 | 11.0.16 | `client/gui/modlist/DefaultModDisplayInfo.java` 的 `icon()` 读取 `iconFile`；`LogoFileWarningsHandler` 标记旧 `logoFile` 弃用。 |
| 26.3 / 26.3.0.26-beta | 12.0.1 | 同 26.2，使用 `DefaultModDisplayInfo.icon()` 与 `convertPath()`。 |

26.1 的 `ModListScreen` 通过 `PackResources.getRootResource(logoFile)` 读取图标；26.2／26.3 的 `convertPath()` 对不含 `:`／`#` 的路径调用 `ImageResource.packRoot(packId, path)`。因此 `assets/cadeditor/icon.png` 是相对于模组资源包（jar）根目录的路径，不是相对于 `META-INF`，也不需要 `cadeditor:` 前缀。源码核对日志在 `logs/branding/neoforge-26.1-icon-source.log` 与 `logs/branding/neoforge-icon-sources.log`（日志不入库）。未启动游戏，不把源码／打包检查视为列表实机展示验收。

## 门禁

不依赖游戏的源码资源检查：`python tools/branding-test.py`（Python 3.11+）。产物检查追加 `--fabric-jar <jar> --neoforge-jar <jar>`；解析 JSON／TOML、检查占位符已展开、图标存在且与源码 PNG 一致。
