# CAD Editor 品牌资源

以下 PNG 直接复制自已确认的成品，不重新缩放或生成；对比图 `sheet.png` 不入库。

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `icon-plate-512.png` | 512×512 | 带底板，平台项目图标 |
| `icon-plate-256.png` | 256×256 | 带底板，平台较小图标 |
| `logo-transparent-512.png` | 512×512 | 透明，README／横幅的大尺寸素材 |
| `logo-transparent-256.png` | 256×256 | 透明，README 顶部（显示宽度 128）／横幅 |

Fabric、NeoForge 模组列表与 Modrinth、CurseForge 项目图标使用 **plate**；README、横幅使用 **transparent**。32px 以下不要使用这一版，需要另做简化版。

## 模组元数据

名称保持 **CAD Editor**，作者为 **云诺羲Rinorsi**。

- 主页／源码：https://github.com/Rinorsi/CAD-Editor-Recast
- 问题反馈：https://github.com/Rinorsi/CAD-Editor-Recast/issues
- B站：https://b23.tv/hjUvs0c
- 爱发电：https://afdian.com/a/Rinorsi

运行包图标为已确认的 `icon-plate-128.png`（128×128），原样复制到 `common/src/main/resources/assets/cadeditor/icon.png`。两个加载器均打包为 `assets/cadeditor/icon.png`，不是 UI 目录下的 `logo.png`。Fabric 的 `contact.bilibili`／`contact.afdian` 是附加键，启动器是否展示未验证；NeoForge credits 中的链接是否可点击未验证。

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
