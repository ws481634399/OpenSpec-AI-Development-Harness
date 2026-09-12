# openspec CLI

`openspec` 是 OpenSpec AI Development Harness 的命令行入口。它负责初始化工作区、管理 Change/Story/Delivery Unit、装配 Agent 指令、执行 Gate，并以可断点续跑的状态机推进 SDD 生命周期。

当前 Harness 版本为 `0.4.0`，运行环境要求 Node.js 20 或更高版本。

## 安装与运行

依赖和 `bin` 均由仓库根 `package.json` 管理：

```bash
# 在 Harness 仓库根目录
npm install
npm run openspec -- --help
```

本地开发时也可以直接运行：

```bash
node cli/openspec/bin/openspec.js --help
```

需要全局命令时：

```bash
npm link
openspec --version
```

## 快速开始

```bash
# 1. 初始化工作区
openspec init ./my-project --stack empty

# 2. 在工作区中创建 Change
cd ./my-project
openspec change create

# 3. 推进默认工作流
openspec workflow run default --change CHG-0001

# 4. 按生成的 .instruction.md 让外部 Agent 产出当前阶段文档，然后再次运行
openspec workflow run default --change CHG-0001

# 5. 处理需要人工确认的阶段
openspec approve CHG-0001
```

Workflow 本身不调用模型。产物缺失时，它会装配 Skill、Prompt 和项目上下文并生成执行指令，由 Trae、Cursor、Claude Code、Codex 等外部 Agent 消费。

## 命令总览

| 命令 | 用途 |
| --- | --- |
| `openspec init` | 初始化 greenfield/brownfield 工作区，并选择技术栈模板 |
| `openspec change` | 创建、查询、绑定 Feature、物化骨架、分档、拆 Story 和归档 Change |
| `openspec story` | 查询 Change 下的 Story 及其 Gate、DU 和 Feature Path |
| `openspec workflow` | 查看并运行可断点续跑的 Gate 驱动工作流 |
| `openspec approve` | 扫描待审批项，批准后自动续跑工作流 |
| `openspec gate` | 执行机器门禁、人工审批和 Gate 状态查询的低层命令 |
| `openspec du` | 创建、物化和同步 Delivery Unit |
| `openspec feature` | 管理四级 Feature Tree 及其派生缓存 |
| `openspec skill` | 查询或同步内置 Skill 与 Prompt |
| `openspec context` | 预览某阶段将提供给 Agent 的上下文，不写指令文件 |
| `openspec status` | 查看 Workspace 和 Change 状态全景 |
| `openspec validate` | 校验 Change 状态和 Artifact 完整性 |
| `openspec doctor` | 检查目录、配置、版本、多仓和 IDE 规则健康度 |
| `openspec reverse` | 扫描已有代码并生成知识反向工程指令 |
| `openspec version` | 查看 Harness、Workspace 和 Skill 三层版本差异 |
| `openspec upgrade` | 预览、执行或回滚 Workspace 确定性升级 |
| `openspec ide` | 为 Trae、Cursor、Claude Code 或 Codex 生成项目规则 |

使用 `openspec <command> --help` 查看完整参数。全流程说明见 [`docs/complete-usage-guide.md`](../../docs/complete-usage-guide.md)。

## 初始化选项

```bash
openspec init [project-path]
openspec init --stack spring-cloud
openspec init --stack vue
openspec init --stack ai-agent
openspec init --force
```

交互配置包括：

- 项目名称和 greenfield/brownfield 类型；
- 代码是否已存在及其路径；
- single/multi 仓库模式；
- `empty`、`spring-cloud`、`vue`、`ai-agent` 技术栈模板；
- 多仓模式下的仓库 ID 和路径。

`--force` 只更新允许重建的 Harness 配置和 README，不覆盖四世界知识及业务代码。

## 工作流与审批

默认流程为：

```text
Explore → PRD → Design → Task → Dev → Test → Review → Converge
```

`workflow run` 会持续运行到下一个暂停点：

- `WAITING_FOR_ARTIFACT`：外部 Agent 需要按 Instruction 生成产物；
- `WAITING_FOR_MACHINE_FIX`：机器门禁未通过，需要修复产物；
- `WAITING_FOR_HUMAN`：关键阶段需要人工审批；
- `COMPLETED`：流程已经完成。

PRD 与 Converge 默认保留人工审批。交互式使用推荐：

```bash
openspec approve CHG-0001
```

Agent 或 CI 非交互使用必须显式记录审批人：

```bash
openspec approve CHG-0001 --yes --reviewer alice --json
```

多 Story Change 在 Story 执行阶段使用：

```bash
openspec story list CHG-0001
openspec workflow run default --change CHG-0001 --story STORY-ID
```

## Delivery Unit

DU 是 Story 面向单个仓库的最小交付单元。设计阶段确定 DU 及依赖，任务阶段引用已有 DU，随后物化到目标仓库：

```bash
openspec du create CHG-0001 \
  --id DU-BE-001 \
  --repository REPO-BE \
  --scope "实现 AC-001" \
  --acceptance "AC-001 通过"
openspec du materialize CHG-0001 DU-BE-001
openspec du sync-status CHG-0001
```

Dev/Test 阶段可以用 `--du` 绑定执行范围，使 Agent 只读取目标仓库和 DU 的上下文。

## IDE 规则

```bash
openspec ide trae
openspec ide cursor
openspec ide claude-code
openspec ide codex
```

- Trae/Cursor：生成规则及可用的 Skill 命令文件；
- Claude Code：维护 `CLAUDE.md` 中的 OpenSpec 标记块；
- Codex：维护 `AGENTS.md` 中的 OpenSpec 标记块。

生成操作幂等；非 OpenSpec 管理的同名内容默认不会被覆盖。

## 实现结构

```text
cli/openspec/
├── bin/openspec.js        可执行入口
└── src/
    ├── index.js           Commander 命令装配
    ├── commands/          各命令的交互与编排层
    └── lib/               Prompt、日志、路径解析等 CLI 辅助逻辑

core/
├── workspace/             初始化、验证、版本升级、IDE 适配
└── sdd/                   Change、Story、Workflow、Gate、DU、Context 等领域内核
```

核心层不依赖 Commander 或 Clack，命令层只负责收集参数和展示结果，因此领域逻辑可以被测试或其他入口复用。

## 开发验证

```bash
npm test
npm run openspec -- --version
npm run openspec -- --help
```

截至 2026-09-10，全量测试结果为 499 passed、0 failed、0 skipped。
