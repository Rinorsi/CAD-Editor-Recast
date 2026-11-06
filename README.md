# CAD Editor · Recast

Minecraft 物品数据组件编辑器：游戏里悬停或手持物品，按 **I**（或 `/cade`）打开可视化界面，改完写回原版物品。

CAD Editor（Component And Data Editor）的换代重写，界面基于 [Oriel UI](https://github.com/Rinorsi/Oriel-UI)。
**预发布 0.99.x**：功能补全之前不进入 1.0，清单见 [`docs/COVERAGE.md`](docs/COVERAGE.md)。

## 要求

Minecraft 26.1.2 · Fabric Loader ≥ 0.19.5 · Fabric API · Java 25 · **Oriel UI 0.11.x（前置模组）**

## 安装

`mods/` 里放 CAD Editor、Oriel UI、Fabric API。创造模式直接写回；非创造模式，或要改容器里的物品，需要服务端也装本模组并授予权限。

## 开发

**1. 仓库放在哪**

构建输出、运行目录、日志、截图都不在仓库里，而在同级的 `Oriel-UI-Workspace/daily/` 下，所以请这样摆：

```
Mods/
├── CAD-Editor-Recast/      ← 本仓库
├── Oriel-UI/               ← Oriel 源码仓库（只有跑预览 / 截图工具时才需要）
└── Oriel-UI-Workspace/     ← 工作区（不是仓库）
```

**2. 准备**

- JDK 25、Git Bash、Node.js 18+
- 把 Oriel UI 发布包 `oriel-fabric-26.1.2-0.11.0.jar` 放进 `libs/`（不进 git）

**3. 常用命令**（Git Bash，仓库根目录）

```bash
bash tools/gw.sh :fabric:26.1.2:build --no-problems-report   # 构建
node tools/ui-contract-test.cjs                              # 界面测试（另有 ui-world-test / ui-compact-test）
```

调试游戏：双击 `启动物品工坊预览.bat`，保存 CSS / JS 即可热更新。

## 文档

[`DEVELOPMENT`](docs/DEVELOPMENT.md) 开发说明 · [`README-host`](README-host.md) 宿主与写回合同 · [`registry-contract`](docs/registry-contract.md) 数据通道 · [`TESTING`](docs/TESTING.md) 测试 · [`COVERAGE`](docs/COVERAGE.md) 覆盖与 1.0 门槛

## 致谢

[Vellum](https://modrinth.com/mod/vellum-gui)（Max Leiter，MIT）：Oriel UI 基于它，界面引擎的思路也来自它。

## 许可

本项目自己的许可证待定，第三方声明见 [`NOTICE`](NOTICE)。
