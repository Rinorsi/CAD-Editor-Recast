# CAD Editor · Recast

Minecraft 物品数据组件编辑器：游戏里按 **I**（或 `/cade`）打开可视化界面：悬停 / 手持物品改物品，对着方块、实体、玩家改它们，什么都不指就改自己。

CAD Editor（Component And Data Editor）的换代重写，界面基于 [Oriel UI](https://github.com/Rinorsi/Oriel-UI)。
**预发布 0.99.x**：功能补全之前不进入 1.0，清单见 [`docs/COVERAGE.md`](docs/COVERAGE.md)。

## 能改什么

- **物品**：全部 107 个持久数据组件（含其他模组注册的组件）；刷怪蛋 / 刷怪笼（生物外观、体型、属性、状态效果、装备）；提示框预览用游戏自己生成的内容。数值范围来自游戏的真实 Codec，不是手写表。
- **世界里已放置的东西**（对准它按 **I**，或 `/cadeditor block|entity|player`）：方块实体（容器、告示牌、旗帜、蜂箱、讲台、唱片机、陶罐、命令方块、头颅、熔炉 / 酿造台 / 营火的进度……）、方块状态；实体（姿态、装备、属性、展示框 / 画、展示实体、村民交易、乘客）。
- **保险库**（按 **O**，主菜单 / 暂停菜单也有按钮）：把改好的物品存在本机，之后取出放进任意物品槽或字段。

按键都在“控制”设置里（分类：物品栏），可以改：编辑 = I，保险库 = O。按住 Shift 再按 I：只改手里的物品，空手就改自己。

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

世界编辑：[协议](docs/world-edit-contract.md) · [方块](docs/world-block-edit.md) · [实体](docs/world-entity-contract.md)。组件结构：[component-schema](docs/component-schema-contract.md)；保险库：[vault](docs/vault-contract.md)；验收：[docs/acceptance](docs/acceptance/)。

宿主搜索：[源码调研与性能](docs/search-architecture.md) · [search消息契约](docs/search-contract.md)。搜索架构参考 [JEI](https://github.com/mezz/JustEnoughItems)、[REI](https://github.com/shedaniel/RoughlyEnoughItems)、[EMI](https://github.com/emilyploszaj/emi) 的索引、缓存与可见网格思路，采用自主实现，未复制其代码；版本与文件许可见调研报告。

[`DEVELOPMENT`](docs/DEVELOPMENT.md) 开发说明 · [`README-host`](README-host.md) 宿主与写回合同 · [`registry-contract`](docs/registry-contract.md) 数据通道 · [`TESTING`](docs/TESTING.md) 测试 · [`COVERAGE`](docs/COVERAGE.md) 覆盖与 1.0 门槛

## 致谢

[Vellum](https://modrinth.com/mod/vellum-gui)（Max Leiter，MIT）：Oriel UI 基于它，界面引擎的思路也来自它。

## 许可

本项目自己的许可证待定，第三方声明见 [`NOTICE`](NOTICE)。
