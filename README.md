# CAD Editor · Recast

> **CAD Editor**（Component And Data Editor）的换代重写：全新的界面（[Oriel UI](https://github.com/Rinorsi/Oriel-UI)）与写回流程。中文副标题“物品工坊”。
> 版本从 **0.99.1** 起，**全部功能补全后才进入 1.0**，发布门槛见 [`docs/COVERAGE.md`](docs/COVERAGE.md)。当前为预发布，接口与界面仍在变化。

游戏里悬停或手持物品，按 **I**（或输入 `/cade`）打开可视化编辑界面，修改物品的数据组件（名称与说明、属性、附魔、食物、容器、方块与实体数据……），改完写回原版物品。修改使用原版 `ItemStack` / `DataComponentPatch` Codec，不注册物品私有组件。

| | |
|---|---|
| 模组 id | `cadeditor` |
| Minecraft | 26.1.2（唯一已声明目标；未适配 NeoForge 或其他版本） |
| 加载器 | Fabric Loader ≥ 0.19.5 + Fabric API |
| Java | 25 |
| 构建 | Stonecutter 0.9.8 + Loom 1.18.2 |
| 前置模组 | **Oriel UI** `>=0.11.0 <0.12.0` |

---

## 前置与仓库位置（先读这一节）

### 前置

| 需要什么 | 版本 | 用在哪里 |
|---|---|---|
| JDK | 25 | 构建与运行 |
| **Oriel UI** 发布包 | 0.11.x | 必需的前置模组，也是构建依赖 |
| Git Bash（Windows） | — | `tools/*.sh` 是 bash 脚本，Windows 上请在 Git Bash 里运行 |
| Node.js | 18+ | 界面契约测试 `tools/*.cjs`、数据生成脚本 |
| Python 3 | 可选 | 仅 `tools/registry/timeline-*.py` 这类分析脚本 |

**Oriel UI 的 jar 不在本仓库里。** 构建需要 `libs/oriel-fabric-26.1.2-0.11.0.jar`：

1. 从 Oriel UI 获得发布包（源码仓库 <https://github.com/Rinorsi/Oriel-UI>，目前为私有；维护者本机的发布包在 `Oriel-UI-Workspace/dist/oriel-0.11.0-<日期>/`，目录里有校验和）。
2. 把 `oriel-fabric-26.1.2-0.11.0.jar` 复制到本仓库的 `libs/`（`.gitignore` 已忽略 `libs/*.jar`，不会被误提交）。

### 仓库放在哪里

构建输出、运行目录、日志、截图**不放在仓库里**，而是放在同级的工作区 `Oriel-UI-Workspace/daily/<日期>/`（`fabric/build.gradle`、`stonecutter.gradle` 里写的是这个相对路径）。所以请这样摆：

```
Mods/                           ← 任意父目录，下面三个必须同级
├── CAD-Editor-Recast/          ← 本仓库（目录名随意，但必须与另外两个同级）
├── Oriel-UI/                   ← Oriel 库的源码仓库（只在跑预览 / 截图工具时需要）
└── Oriel-UI-Workspace/         ← 工作区：不是 git 仓库，放构建输出、日志、截图、报告
```

- `tools/gw.sh` 会转交给 `Oriel-UI-Workspace/tools/gw.sh`，由它处理 JDK 与国内网络下载问题；`tools/preview/shot.sh` 需要 `Oriel-UI`（预览器）和 `Oriel-UI-Workspace/tools/new-day.sh`。
- 没有这个工作区的协作者：构建输出会被写到上级目录的 `Oriel-UI-Workspace/daily/…`（Gradle 会自动创建）。作者只验证过 `tools/gw.sh` 这条路径，直接用 `./gradlew` 理论上可行但未验证。
- 内部评估报告、阶段交接、状态审计不进仓库，存放在工作区的 `planning/cad-editor-recast/`。

---

## 快速开始

### 玩家

把 **CAD Editor**、**Oriel UI**、**Fabric API** 三个 jar 放进 `mods/`。游戏里悬停 / 手持物品按 **I** 或 `/cade`。

- 创造模式写回走原版创造槽位包。
- 非创造模式、或要写容器里的槽位，需要服务端也安装本模组并授予权限。
- 偏好保存在 `config/cadeditor-ui.json`。

### 开发者

在仓库根目录用 Git Bash：

```bash
# 构建
bash tools/gw.sh :fabric:26.1.2:build --no-problems-report

# 界面契约测试（不需要游戏）
node tools/ui-contract-test.cjs
node tools/ui-world-test.cjs
node tools/ui-compact-test.cjs
```

启动游戏调试：双击根目录的 `启动物品工坊预览.bat`（用本工程自己的 Loom `:fabric:26.1.2:runClient` 启动，并配置 Oriel 原生热更新）。保存 CSS / JS 即可刷新界面。详见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

---

## 目录

| 路径 | 内容 |
|---|---|
| `fabric/src/main/java/` | 模组 Java 代码（按键、读写物品、网络、注册表通道、偏好） |
| `fabric/src/main/resources/assets/cadeditor/ui/` | **界面源码**（HTML / CSS / JS）。直接就是模组资源，构建时进 jar，没有第二份拷贝 |
| `fabric/src/test/`、`autotest/`、`testFixtures/` | Java 单元测试、离屏真客户端探针、测试夹具 |
| `tools/` | 构建包装 `gw.sh`、数据生成、界面契约测试、预览与探针脚本 |
| `dev/browser/` | 仅浏览器预览用的 mock，**不进模组、不进游戏** |
| `docs/` | 文档（见下） |
| `libs/` | 放 Oriel UI 发布 jar（不进 git） |
| `启动物品工坊预览.bat` | 一键启动开发用游戏 |

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/COVERAGE.md`](docs/COVERAGE.md) | 组件覆盖情况与 **1.0 发布门槛** |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 热更新、页面控制器与动效约定、偏好与剪贴板桥 |
| [`README-host.md`](README-host.md) | 宿主（Java）说明与写回合同 |
| [`docs/registry-contract.md`](docs/registry-contract.md) | 注册表 / 数据通道合同（页面与宿主之间的消息） |
| [`docs/edit-sessions.md`](docs/edit-sessions.md) | 编辑会话与基线校验 |
| [`docs/TESTING.md`](docs/TESTING.md) | 测试与游戏内验收清单 |
| [`docs/ui.md`](docs/ui.md)、[`docs/ui-logging.md`](docs/ui-logging.md) | 界面包说明、调试日志（日志前缀 `[CAD-Editor-Recast]`） |
| [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md) | 第三方声明 |

## 许可与致谢

- 借鉴 CAD Editor（MIT）的 I 键、`/cade` 与创造槽位包写回思路，没有打包其源码或界面资源。版权声明见 [`NOTICE`](NOTICE) 与 [`LICENSE-CAD-Editor`](LICENSE-CAD-Editor)。
- Oriel UI 基于 Vellum（MIT，作者 Max Leiter），是外部必需依赖，其 jar 自带声明。
- 本项目自己的许可证尚未确定（仓库目前私有）。
- `dev/browser/mc/` 下的图标来自**本机** Minecraft 资源（Mojang），仅供本地浏览器预览，不进仓库、不分发。
