# OpenSpec AI Development Harness

# Phase 1.2 - SDD Init Design

> Version: v0.1
> Status: Draft
> Type: Implementation Design
> Phase: Phase 1.2 - SDD Init

# 1. 文档目的

本文档定义 OpenSpec AI Development Harness Phase 1.2 的实现方案。

Phase 1.2 的唯一目标：

> 实现 OpenSpec Workspace 初始化能力。

即 `openspec init` 负责根据 `templates/default-workspace/` 生成一个完整 OpenSpec Workspace。

```
OpenSpec CLI
    ↓
Workspace Initialization
    ↓
OpenSpec Workspace
```

Phase 1.1 已完成 Workspace Template（`templates/default-workspace/`）。Phase 1.2 负责实现 `openspec init` 命令，根据模板生成一个完整 OpenSpec Workspace。

Phase 1.2 不引入 Skill Framework、Workflow Engine、Change Template，这些属于后续 Phase。

---

# 2. Phase 1.2 定位

OpenSpec Harness 演进：

```
Phase 1.0  Repository Bootstrap
        ↓
Phase 1.1  Workspace Template
        ↓
Phase 1.2  OpenSpec Init
        ↓
Phase 1.3  SDD Skill Framework
        ↓
Phase 1.4  Workflow Engine
```

---

# 3. 阶段目标

## 3.1 CLI 初始化能力

提供命令：

```bash
openspec init
```

用于创建 OpenSpec Workspace。

## 3.2 Template 复制能力

读取 `templates/default-workspace/`，生成用户项目 Workspace。

## 3.3 Workspace 配置初始化

初始化 `.sdd/`（workspace.yaml / repositories.yaml / context-rules.yaml / version.yaml），由交互式问答填充。

## 3.4 Workspace 验证

检查目录结构、配置文件、Harness 版本。

---

# 4. 非目标范围

Phase 1.2 不实现以下内容，均属后续 Phase：

| 内容                                                          | 所属阶段               |
| ------------------------------------------------------------- | ---------------------- |
| Skill Framework（Loader / Runtime / skill.yaml）              | Phase 1.3              |
| Workflow Engine / Workflow YAML                               | Phase 1.4              |
| Change Template（request / prd / design / tasks / evidence）  | Change Management 阶段 |
| Agent Runtime（模型调用 / 对话管理 / Agent 状态）             | 后续阶段               |
| 独立诊断命令（openspec doctor / reverse / validate / status） | 后续阶段               |
| npm 发布                                                      | Phase 1.3+             |

Phase 1.2 仅在 init 末尾执行轻量自检（WorkspaceValidator 内核，为后续 `openspec doctor` 预留）。

---

# 5. 系统结构

```
OpenSpec-AI-Development-Harness/
├── cli/
│   └── openspec/                # CLI 入口（commander / @clack 交互 / bin）
├── core/
│   └── workspace/               # 核心逻辑（无 CLI 依赖，可测试与复用）
│       ├── WorkspaceInitializer   # 编排：复制 → 生成 → 自检
│       ├── TemplateLoader         # 模板定位与复制（filter / README 改名 / implementation 条件）
│       └── WorkspaceValidator     # 结构 / 配置 / 版本自检
├── templates/
│   └── default-workspace/        # Phase 1.1 产出，init 复制源
├── schemas/                     # 最小配置 schema（Validator 可选用）
├── scripts/                     # 端到端验证脚本
└── tests/                       # Unit + Integration（node --test）
```

## 5.1 cli/openspec/

CLI 层。技术栈：

```
Node.js + 纯 JavaScript (ESM)
```

依赖：

```
commander        命令解析
@clack/prompts   交互式问答
picocolors       终端着色
yaml             YAML 读写（保留注释）
```

文件操作使用 Node 原生 `node:fs/promises`（cp / rm / mkdir / mkdtemp / copyFile），不引入 fs-extra，规避 CJS 命名导入问题。

不引入构建步骤（无 TypeScript、无打包）。Phase 1.3 命令面扩大后再评估迁移 TS。

## 5.2 core/workspace/

核心层，无 CLI 依赖，可被测试与后续命令复用。按单一职责细粒度拆分：

| 模块                 | 职责                                                                          | 对应源                  |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| HarnessRootResolver  | 向上查找 Harness 根（`.version` + `templates/default-workspace/` 标记）       | harness-root.js         |
| TemplateResolver     | 在 harness 根下定位 `templates/default-workspace/`                            | template-resolver.js    |
| TemplateCopier       | 按规则复制（filter / README 改名 / implementation 条件复制）                  | copier.js               |
| ConfigWriter         | 生成 `workspace.yaml` / `repositories.yaml` + 修补 `version.yaml`（保留注释） | config-writer.js        |
| WorkspaceValidator   | 结构 / 配置 / 版本一致性自检                                                  | validator.js            |
| VersionReader        | `.version` 解析（取首 token、校验格式）                                       | version.js              |
| WorkspaceInitializer | 编排 定位 → 复制 → 生成 → 自检 的完整流程（纯函数，不依赖 CLI）               | 从 init.js 抽出 runInit |

模块间依赖单向：

```
WorkspaceInitializer
    ├─ TemplateResolver  → HarnessRootResolver
    ├─ TemplateCopier
    ├─ ConfigWriter      → VersionReader
    └─ WorkspaceValidator → VersionReader
```

## 5.3 templates/default-workspace/

Phase 1.1 产出，作为 init 的复制源。Phase 1.2 不修改。

## 5.4 schemas/、scripts/、tests/

最小配置 schema、端到端验证脚本、Unit + Integration 测试（Node 原生 `node:test`）。

---

# 6. openspec init 设计

## 6.1 命令形式

基础形式（在当前目录初始化）：

```bash
openspec init
```

指定目录形式：

```bash
openspec init <project-path>
```

示例：

```bash
openspec init ./my-project
```

`<project-path>` 不存在时自动创建；已存在且非空且未指定 `--force` 时提示不覆盖。

## 6.2 选项

```
--force    覆写已存在的 .sdd/*.yaml 与 README-OpenSpec.md
           不触碰 standards/ product/ delivery/ implementation/ skills/
```

## 6.3 运行方式

本地开发：

```bash
node cli/openspec/bin/openspec.js init
```

或经 `npm link` 后：

```bash
npm link
openspec init
```

## 6.4 内部调用链

```
用户
    ↓
openspec init
    ↓
Init Command（cli/openspec）
    ↓
WorkspaceInitializer（core/workspace）
    ├─ HarnessRootResolver   定位 Harness 根
    ├─ TemplateResolver      定位 templates/default-workspace
    ├─ TemplateCopier        按规则复制（filter / README 改名 / implementation 条件）
    ├─ ConfigWriter          生成 workspace.yaml / repositories.yaml / 修补 version.yaml
    └─ WorkspaceValidator   结构 / 配置 / 版本自检
    ↓
OpenSpec Workspace
```

---

# 7. openspec init Interactive Flow

执行 `openspec init` 后的交互流程：

```
openspec init
    ↓
询问 Workspace Name
    ↓
询问 Project Type（greenfield / brownfield）
    ↓
询问 Repository Mode（single / multi）
    ↓
询问 Repository Path
    ↓
生成 Workspace
```

## 7.1 交互步骤

| 步骤 | 内容                  | 类型                         | 触发条件               |
| ---- | --------------------- | ---------------------------- | ---------------------- |
| 1    | 欢迎信息              | 输出                         | 总是                   |
| 2    | Workspace 名称        | 文本输入                     | 总是（默认目录名）     |
| 3    | 项目类型              | 选择 greenfield / brownfield | 总是                   |
| 4    | 代码是否已存在        | 确认 Yes / No                | 仅 brownfield          |
| 5    | 仓库模式              | 选择 single / multi          | 总是                   |
| 6a   | 仓库列表（id + path） | 循环输入                     | 仅 multi               |
| 6b   | 代码路径              | 文本输入                     | 仅 single + brownfield |

## 7.2 路径策略

- **greenfield**：固定 `path = implementation`，创建空 `implementation/`。
- **brownfield**：默认 `path = implementation`，允许用户改为任意相对或绝对路径，原样写入 `repositories.yaml`。
  - 若最终 path 以 `implementation` 开头 → 创建 `implementation/`。
  - 否则 → 不创建 `implementation/`（外部路径由用户自行管理）。

---

# 8. Greenfield / Brownfield 支持

`workspace.yaml` 保留 `workspace.type` 字段，支持 greenfield 与 brownfield。

## 8.1 Greenfield（新项目）

新项目初始化。创建空 `implementation/`，不复制、不移动任何用户代码。

`repositories.yaml`：

```yaml
mode: single
repositories:
  - id: main
    path: implementation
```

## 8.2 Brownfield（已有项目接入）

已有项目接入 OpenSpec。

要求：

- 不复制代码；
- 不移动代码；
- 不修改源码结构。

只生成 Workspace，并记录已有实现路径。

`repositories.yaml`（外部路径示例）：

```yaml
mode: single
repositories:
  - id: main
    path: ../existing-project
```

---

# 9. 初始化结果

执行：

```bash
openspec init my-project
```

生成：

```
my-project/
├── .sdd/
│   ├── workspace.yaml
│   ├── repositories.yaml
│   ├── context-rules.yaml
│   └── version.yaml
├── standards/
├── product/
├── delivery/
├── implementation/
├── skills/
└── README-OpenSpec.md
```

注意：模板根 `README.md` 改名为 `README-OpenSpec.md`，绝不覆盖用户已有的 `README.md`。

---

# 10. Template 处理规则

## 10.1 不修改 Template 源文件

读取 `templates/default-workspace/`，复制到 target workspace，不修改模板源。

## 10.2 保留目录边界

初始化后必须保持 standards / product / delivery / implementation 四世界结构。

## 10.3 静态复制与动态生成

| 类别            | 文件                                                                                                    | 处理                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 静态复制        | `standards/**` `product/**` `delivery/**` `skills/README.md` `.sdd/README.md` `.sdd/context-rules.yaml` | 直接复制                               |
| 静态复制 + 修补 | `.sdd/version.yaml`                                                                                     | 复制后修补 `harness.version`（防漂移） |
| 动态生成        | `.sdd/workspace.yaml` `.sdd/repositories.yaml`                                                          | 由交互输入填充                         |
| 改名复制        | 模板根 `README.md`                                                                                      | → `README-OpenSpec.md`                 |
| 条件复制        | `implementation/README.md`                                                                              | 仅 path 以 `implementation` 开头时复制 |

---

# 11. Repository 配置

`repositories.yaml` 不固定 `mode: single` / `path: implementation`，根据 init 交互生成。支持 single 与 multi。

## 11.1 single 模式

```yaml
mode: single
repositories:
  - id: main
    path: <greenfield 固定 implementation；brownfield 用户输入>
```

## 11.2 multi 模式

```yaml
mode: multi
repositories:
  - id: <用户输入>
    path: <用户输入，默认 implementation/<id>>
  - id: <用户输入>
    path: <用户输入>
```

---

# 12. Workspace 配置生成

配置由交互式问答填充，不留空、不固定默认值。

## 12.1 workspace.yaml

```yaml
workspace:
  name: "<项目名称，来自交互输入>"
  type: "<greenfield 或 brownfield，来自交互选择>"
  harness:
    version: "<Harness 版本，读自 .version 文件>"
```

## 12.2 version.yaml

```yaml
harness:
  version: "<读自 .version>"
workspace-template:
  version: "0.1.0" # 模板原值，不动
schema:
  version: "0.1.0" # 模板原值，不动
```

## 12.3 注释保留

`workspace.yaml` / `repositories.yaml` / `version.yaml` 模板含丰富注释（AI 上下文重要部分）。配置生成使用 `yaml` 库 Document API 改写字段，保留全部注释。

---

# 13. 初始化验证

`openspec init` 完成后由 WorkspaceValidator 执行内置自检（不暴露为独立命令）。

## 13.1 Workspace 结构

检查：`.sdd/` `standards/` `product/` `delivery/` `implementation/`（视 path 策略） `skills/`。

## 13.2 配置完整

检查：

```
workspace.yaml        name/type 非空
repositories.yaml     mode 合法、repositories ≥ 1、每项有 id+path
context-rules.yaml    存在
version.yaml          harness.version === .version 读到的值
```

## 13.3 版本兼容

检查：

```
Harness 版本（.version）=== workspace.yaml.harness.version
                                              === version.yaml.harness.version
```

---

# 14. 错误处理

## 14.1 目标已初始化

检测到 `cwd/.sdd/` 存在且未指定 `--force`：

```
Workspace already initialized. Use --force to overwrite.
```

退出码 1。

指定 `--force`：仅覆写 `.sdd/*.yaml` 与 `README-OpenSpec.md`，不动 `standards/ product/ delivery/ implementation/ skills/`。

## 14.2 Template 不存在

```
Workspace template not found. CLI installation incomplete.
```

## 14.3 目标目录非空

`<project-path>` 已存在且非空且未指定 `--force`：

```
Target directory already exists and is not empty.
```

不自动覆盖。

## 14.4 配置初始化失败

```
Initialization failed.
```

---

# 15. 测试要求

## 15.1 Unit Test

验证：

- `.version` 解析（取首 token）；
- 模板复制（filter 规则、README 改名、implementation 条件）；
- 配置生成（workspace / repositories / version 字段填充、注释保留）。

## 15.2 Integration Test

验证：

```
openspec init
    ↓
Workspace 生成
    ↓
结构检查通过
```

覆盖 greenfield + single、brownfield + multi + 外部路径、重复 init + `--force` 三场景。

## 15.3 测试工具

使用 Node 原生 `node --test`，不引入 jest / vitest / mocha。

---

# 16. Phase 1.2 输出

完成后具备 `openspec init` 能力。用户可以：

```
初始化 OpenSpec Workspace
管理项目知识结构
准备 AI 开发环境
```

## 16.1 成功输出示例

```
OpenSpec Workspace initialized.
Project: <name>
Type: <greenfield | brownfield>
Mode: <single | multi> repository
Harness: 0.1.0
Next steps:
1. Configure Feature Tree (product/feature-tree.yaml)
2. Start first Change (Phase 1.3)
3. Begin SDD workflow
```

---

# 17. 验收标准

Phase 1.2 完成后必须支持：

1. `openspec init` 命令可执行；
2. 生成完整 Workspace：`.sdd/` `standards/` `product/` `delivery/` `implementation/` `skills/`；
3. 支持 greenfield；
4. 支持 brownfield；
5. 支持 single repository；
6. 支持 multi repository。

---

# 18. 后续阶段

## 18.1 Phase 1.3：SDD Skill Framework

引入 Skill 执行模型，包含 SDD 全生命周期 Skill：

```
sdd-explore
sdd-prd
sdd-design
sdd-task
sdd-dev
sdd-test
sdd-converge
```

## 18.2 Phase 1.4：Workflow Engine

用于组合 Skill 执行。

## 18.3 Change Management 阶段

`openspec change create` 与 Change Template（request / prd / design / tasks / evidence）在 Change Management 阶段设计落地。Phase 1.2 仅初始化 `delivery/` 目录结构，不创建 Change 文件模板。

---

# 总结

Phase 1.2 的核心目标不是构建完整 AI 开发平台，而是完成：

```
Template
    ↓
openspec init
    ↓
OpenSpec Workspace
```

建立 OpenSpec Harness 的第一个可执行能力。
