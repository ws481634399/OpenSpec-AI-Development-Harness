# OpenSpec AI Development Harness

# Phase 1.4 - SDD Skill Framework Design

> Version: v0.1
> Status: Draft
> Type: Implementation Design
> Phase: Phase 1.4 - SDD Skill Framework

# 1. 文档目的

本文档定义 OpenSpec AI Development Harness Phase 1.4 的实现方案。

Phase 1.4 的核心定位：

> **Skill Definition & Invocation Framework**——定义 SDD Skill，装配 Invocation Context，生成 Instruction，由外部 Agent 产出 Artifact。

Phase 1.4 不实现 Agent Runtime，不实现 Workflow Engine。

```
Phase 1.3  定义 Artifact（Requirement/Feature/Change/Artifact/Lifecycle/Skill Contract）
    ↓
Phase 1.4  Skill 生产 Artifact（Skill 定义 + 加载 + Invocation + Instruction）  ← 本阶段
    ↓
Phase 1.5  Workflow 编排 Skill（多 Skill 编排 + 自动流程推进）
```

**Skill = Artifact Producer，不是 Skill = Agent。**

Phase 1.3 已落地 6 领域模型 + 7 个纯函数模块 + `openspec change` 管理命令 + 8 个 Artifact 模板（`feat/phase-1.3-sdd-lifecycle`，65/65 测试全绿）。Phase 1.4 在此之上实现 Skill 资产与调用框架，**Skill 输入输出必须与 Phase 1.3 Artifact Model 完全对齐**，不引入新的领域概念。

---

# 2. Phase 1.4 定位

## 2.1 核心定位

Phase 1.4 负责 **Skill Definition & Invocation Framework**：

- Skill 定义（`skill.yaml` / `SKILL.md` / `checklist` / `rules`）
- Skill 加载（SkillLoader）
- Skill 注册与元数据管理（SkillRegistry）
- Skill Invocation Context 装配（ContextAssembler）
- Instruction 生成（InstructionBuilder）
- Artifact 写入（ArtifactWriter）

Phase 1.4 **不负责**：

- Agent Runtime（模型调用、对话管理、Agent 状态机）
- LLM API
- Prompt Engine
- Workflow 编排（多 Skill 串联、自动状态推进）

## 2.2 Skill 执行模型

**OpenSpec 不执行 AI。**

```
openspec skill run
    ↓ 加载 Skill 定义（SkillLoader）
    ↓ 准备 Workspace Context（ContextAssembler）
    ↓ 生成 Instruction（InstructionBuilder）
    ↓ 外部 Agent 执行（Trae / Cursor / Claude Code）
    ↓ 产生 Artifact（写回 CHG 目录）
```

职责划分：

| 角色 | 负责 |
| --- | --- |
| 外部 Agent | 推理、代码生成、文档补充（非结构化分析） |
| OpenSpec | 上下文装配、规范约束、Artifact 管理、状态推进 |

`openspec skill run` 不是"运行 AI"，而是"创建 Skill Invocation Context 并生成执行指令"。

## 2.3 与 Phase 1.3 的对齐

Phase 1.3 已定义 Skill Contract（`id/stage/input/output/requires-state/produces-state`，见 [phase-1.3 设计 §10](file:///d:/Desktop/OpenSpec-AI-Development-Harness/plans/phase-1.3-sdd-lifecycle-artifact-design.md)）。Phase 1.4 实现这些契约的 Skill 资产与调用框架，复用 `core/sdd/` 7 个纯函数模块（`runChangeCreate`/`patchStatus`/`validateTransition`/`findChangeByRequirement`/`readFeatureTree`/`findFeature` 等），不重写既定模型。

---

# 3. 阶段目标

## 3.1 实现范围

- 仓根 `skills/sdd-{explore,prd,design,task,dev,test,converge}/`（sdd-explore 完整，其余 6 个骨架）
- `core/sdd/` 新增框架层纯函数模块（SkillLoader/SkillRegistry/fs-walker/ContextAssembler/InstructionBuilder/ArtifactWriter/CandidateRepository）
- `cli/openspec/src/commands/skill.js` + `openspec skill list/show/run`
- sdd-explore 完整可演示：`openspec init` → `openspec skill run sdd-explore` → 产出 `requirement.md` + `exploration.md` + 推进 `exploring`
- `package.json` files 加 `"skills"`

## 3.2 sdd-explore 职责边界

sdd-explore 是**流程编排者**，不是产物生成者。基础能力由 `core/sdd` 提供：

```
sdd-explore (CLI 编排)
    ↓ 调用
core/sdd 基础能力（ChangeModel / FeatureModel / CandidateRepository / ArtifactWriter / ContextAssembler / InstructionBuilder）
    ↓ 产生
exploration.md + requirement.md + Instruction
```

- sdd-explore 负责：需求探索流程编排、Feature 匹配调度、Exploration Artifact 生成调度
- sdd-explore 不负责：直接写文件、直接调模型、Feature 查询实现、Candidate 生命周期管理

---

# 4. 非目标范围

Phase 1.4 不实现以下内容，均属后续 Phase：

| 内容 | 所属阶段 |
| --- | --- |
| ❌ Agent Runtime（模型调用、对话管理、Agent 状态机） | 后续 |
| ❌ LLM API / 模型路由 | 后续 |
| ❌ Prompt Engine | 后续 |
| ❌ Workflow YAML / Multi Skill Orchestration | Phase 1.5 |
| ❌ 自动连续执行 explore → prd → design | Phase 1.5 |
| ❌ `openspec requirement` / `doctor` / `validate` / `reverse` 独立命令 | 后续 |
| ❌ workspace `skills/registry.yaml` 自动生成 | 后续 |
| ❌ npm 发布 | Phase 1.4+ |

---

# 5. 系统结构

## 5.1 仓库根目录树（Phase 1.4 新增/修改标注）

```
OpenSpec-AI-Development-Harness/
├── cli/openspec/
│   └── src/
│       ├── index.js                         # 改：注册 skill 子命令组
│       ├── commands/
│       │   └── skill.js                     # 新增：skill list/show/run
│       └── lib/
│           └── skill-prompts.js             # 新增：sdd-explore 的 @clack 交互封装
├── core/
│   └── sdd/                                 # 新增 7 模块（Phase 1.3 的 7 模块不变）
│       ├── skill-loader.js                  # 新增：加载 Skill 定义
│       ├── skill-registry.js                # 新增：list/get Skill
│       ├── fs-walker.js                     # 新增：递归收集 workspace 目录清单
│       ├── context-assembler.js             # 新增：消费 context-rules.yaml 装配 Context
│       ├── instruction-builder.js           # 新增：组装 Instruction（不 IO）
│       ├── artifact-writer.js               # 新增：读模板 + 填字段 + 写 CHG 目录
│       └── candidate-repository.js          # 新增：writeCandidate（FeatureModel 保持只读）
├── skills/                                  # Phase 1.4 填充（Phase 1.1 空目录）
│   ├── sdd-explore/                         # 完整实现
│   │   ├── skill.yaml
│   │   ├── SKILL.md
│   │   ├── checklist.md
│   │   ├── rules.md
│   │   └── templates/                       # skill 专属补充（若有）
│   ├── sdd-prd/                             # 骨架
│   ├── sdd-design/
│   ├── sdd-task/
│   ├── sdd-dev/
│   ├── sdd-test/
│   └── sdd-converge/
├── templates/
│   └── artifacts/
│       ├── feature-candidate.md             # 新增：Feature Candidate 模板（Harness 资产）
│       ├── exploration.md                   # 改：正文加 {{placeholder}} 占位符
│       └── requirement.md                   # 改：正文加 {{placeholder}} 占位符
├── tests/
│   ├── skill.spec.js                        # 新增：框架层单元
│   └── integration.spec.js                  # 扩展：sdd-explore 端到端
├── plans/
│   └── phase-1.4-sdd-skill-framework.md    # 本文档
└── package.json                             # 改：files 加 "skills"
```

## 5.2 模块职责

| 域 | 模块 | 文件 | 职责 |
| --- | --- | --- | --- |
| core/sdd | SkillLoader | `skill-loader.js` | 从 `harnessRoot/skills/<id>/` 加载 skill.yaml + SKILL.md + checklist + rules |
| core/sdd | SkillRegistry | `skill-registry.js` | `listSkills`/`getSkill` 只读扫描（基于 SkillLoader） |
| core/sdd | fs-walker | `fs-walker.js` | 递归收集目录文件清单（路径+类型，不读内容） |
| core/sdd | ContextAssembler | `context-assembler.js` | 读 `.sdd/context-rules.yaml[stage].read`，用 fs-walker 收集，读必要文件，组装 Context |
| core/sdd | InstructionBuilder | `instruction-builder.js` | 纯组装 Skill+Context+用户输入+模板引用 → Instruction Markdown（不 IO） |
| core/sdd | ArtifactWriter | `artifact-writer.js` | 读 `templates/artifacts/<name>.md` + 填 front-matter + 替换 `{{placeholder}}` → 写 CHG 目录 |
| core/sdd | CandidateRepository | `candidate-repository.js` | `writeCandidate` 写 `product/features/FEAT-CANDIDATE-NNNN.md` |

模块间依赖单向（core 纯函数，无 CLI/@clack 依赖）：

```
sdd-explore (CLI 编排)
    ├─ SkillLoader / SkillRegistry
    ├─ ContextAssembler → fs-walker
    ├─ InstructionBuilder
    ├─ ArtifactWriter
    ├─ CandidateRepository
    ├─ ChangeModel（Phase 1.3：runChangeCreate / patchStatus / patchMetadata）
    ├─ ChangeRepository（Phase 1.3：findChangeByRequirement）
    ├─ FeatureModel（Phase 1.3 只读：readFeatureTree / findFeature / featurePath）
    └─ ChangeStateMachine（Phase 1.3：validateTransition）
```

沿用 Phase 1.2/1.3 模式：原生 `node:fs/promises`（不用 fs-extra）、yaml Document API 保留注释、`getHarnessRoot()` 定位 Harness 资产、core 引用路径 `../../../../core/sdd/`、核心逻辑写成纯函数便于测试。

---

# 6. Skill 定义规范

## 6.1 Skill 目录结构

```
skills/
├── sdd-explore/        # 完整实现
│   ├── skill.yaml      # 元数据 + Artifact Contract
│   ├── SKILL.md        # 核心执行说明（角色/目标/流程/规则）
│   ├── checklist.md    # 质量检查清单
│   ├── rules.md        # 约束规则
│   └── templates/      # skill 专属补充子模板（若有，否则空目录）
├── sdd-prd/            # 骨架（skill.yaml + 基础 SKILL.md）
├── sdd-design/
├── sdd-task/
├── sdd-dev/
├── sdd-test/
└── sdd-converge/
```

**原则**：
- Workspace 不复制 Skill 源码（[templates/default-workspace/skills/README.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/skills/README.md) v0.1 既定原则）
- Skill 属于 Harness 能力，由 `getHarnessRoot()` 定位 `harnessRoot/skills/`
- Artifact 模板统一放 `templates/artifacts/`，skill.yaml 用 `output-artifacts` 引用，skill 内 `templates/` 仅放 skill 专属补充

## 6.2 skill.yaml Schema

```yaml
id: sdd-explore
version: 0.1.0
stage: explore
description: 需求探索阶段 Skill——理解需求、判断 Feature 归属、初始化 Change
input:
  - requirement
  - product/feature-tree.yaml
  - standards/sdd/
output:
  - requirement.md
  - exploration.md
  - change
  - metadata-update
requires-state: created
produces-state: exploring
output-artifacts:
  - requirement.md
  - exploration.md
```

字段对齐 Phase 1.3 Skill Contract（`id/stage/input/output/requires-state/produces-state`），新增 `version` 与 `output-artifacts`（Artifact Contract，引用 `templates/artifacts/` 模板名）。

## 6.3 七个 Skill 契约表（对齐 Phase 1.3 §10.3）

| Skill | stage | requires-state | produces-state | output-artifacts |
| --- | --- | --- | --- | --- |
| sdd-explore | explore | created | exploring | requirement.md, exploration.md |
| sdd-prd | prd | exploring | specified | prd.md |
| sdd-design | design | specified | designed | design.md |
| sdd-task | task | designed | tasked | tasks.md |
| sdd-dev | dev | tasked | developing | implementation.md |
| sdd-test | test | developing | testing | evidence/ |
| sdd-converge | converge | testing | completed | convergence.md |

---

# 7. Skill 实现范围

## 7.1 sdd-explore（完整实现）

`sdd-explore/` 完整实现 SKILL.md（角色/目标/执行流程/行为规则）+ skill.yaml + checklist.md + rules.md。

SKILL.md 定义执行流程（对齐 Phase 1.3 §10.4）：
1. 判断 Change 归属（§8.6 旧需求沿用策略）
2. 加载上下文（standards/、product/）
3. 分析需求，写 requirement.md
4. 判断 Feature Tree 归属（命中记录 / 未命中 Candidate）
5. 输出探索结果到 exploration.md
6. 更新 metadata（requirement / features）
7. 推进状态 exploring
8. 生成 Instruction（交外部 Agent 补充非结构化分析）

## 7.2 其余 6 个 Skill（骨架）

sdd-prd / sdd-design / sdd-task / sdd-dev / sdd-test / sdd-converge：
- `skill.yaml`（完整契约 + Artifact Contract）
- 基础 `SKILL.md`（角色 / 目标 / 输入输出 / 禁止项，骨架）
- 不实现完整执行逻辑（后续逐阶段完善）

`openspec skill run` 对这 6 个 Skill 在 v0.1 仅校验状态前置 + 输出 Instruction 骨架，不实际产出 Artifact（提示用户外部 Agent 执行后手动 `openspec change status --set`）。

---

# 8. sdd-explore 完整执行流程

## 8.1 流程

```
openspec skill run sdd-explore
    ↓ 收集 Requirement（@clack：已登记 REQ-XXX / 直接输入 title + content）
    ↓ 查找已有 Change（findChangeByRequirement）
    ↓ 创建或复用 CHG
    ↓ Feature Tree 匹配（readFeatureTree + findFeature）
    ↓ 写 requirement.md（ArtifactWriter）
    ↓ 生成 exploration.md（ArtifactWriter，结构化字段填充 + 非结构化段 placeholder）
    ↓ 更新 Change State（patchMetadata features + validateTransition + patchStatus exploring）
    ↓ 生成 Instruction（InstructionBuilder，引导外部 AI 补充 exploration.md 非结构化分析）
```

## 8.2 旧需求沿用策略（§8.6，@clack 交互）

- 用户提供 REQ-XXX 或 title → `findChangeByRequirement` 查进行中 Change
- 命中 → @clack select：沿用现有 CHG / 新建
- 新建 → `runChangeCreate`（内部自动查 archive 写 `related-change`）
- 决策逻辑抽纯函数（候选清单 + 用户选择 → 动作），@clack 只收集选择，便于单测

## 8.3 Feature 归属与 Candidate

- `readFeatureTree` + `findFeature` 判定归属
- 命中 → 记录 feature id，填入 exploration.md 与 metadata.features
- 未命中 → `CandidateRepository.writeCandidate`（`product/features/FEAT-CANDIDATE-NNNN.md`，status:pending）

## 8.4 Instruction 输出

InstructionBuilder 输出 Instruction Markdown：
- Skill 角色与目标（SKILL.md 摘要）
- Workspace Context 摘要（ContextAssembler 装配的 standards/product 概要）
- 用户输入原文
- Artifact 模板引用（exploration.md 待补充段落：需求理解 / 影响分析 / 未知问题）
- 外部 Agent 执行指引

Instruction 输出到终端（`note`）+ 写入 CHG 目录（`<changeDir>/.instruction.md`，供外部 Agent 读取）。

---

# 9. Feature Candidate 设计

## 9.1 职责分离

- **FeatureModel**（Phase 1.3 既定，保持只读）：`readFeatureTree` / `findFeature` / `featurePath`
- **CandidateRepository**（Phase 1.4 新增）：`writeCandidate`

不让 FeatureModel 同时负责 Feature 查询和 Candidate 生命周期。

## 9.2 CandidateRepository 设计

`writeCandidate(workspaceRoot, { name, sourceChange, harnessRoot })` → `{ candidateId, candidatePath }`：
- 扫 `product/features/` 取 `FEAT-CANDIDATE-NNNN` 最大+1
- 读 `templates/artifacts/feature-candidate.md` 模板（Harness 资产，Phase 1.4 新增）
- 填 front-matter（id/name/status:pending/created-at/source-change）+ 正文骨架
- 写 `product/features/FEAT-CANDIDATE-NNNN.md`
- pending 标记：待人工 review 后并入 `feature-tree.yaml`

---

# 10. ArtifactWriter 设计

## 10.1 职责

读 `templates/artifacts/<name>.md` 模板 + 填 front-matter + 替换正文 `{{placeholder}}` → 写入 CHG 目录对应文件。

## 10.2 API

```js
writeArtifact(changeDir, artifactName, { frontMatter, replacements }, harnessRoot)
// 读 harnessRoot/templates/artifacts/<artifactName>.md
// parseDocument 填 front-matter 字段（保留模板注释）
// 正文 {{key}} 替换为 replacements[key]
// 写入 changeDir/<artifactName>.md
```

## 10.3 模板占位符约定

Phase 1.4 更新 `templates/artifacts/exploration.md` 与 `requirement.md`，正文结构化字段改用 `{{placeholder}}` 占位符（如 `{{feature-id}}` / `{{feature-path}}` / `{{requirement-content}}`）。非结构化段（需求理解 / 影响分析 / 未知问题）保留 `<!-- AI 补充 -->` 注释，由外部 Agent 按 Instruction 填充。

---

# 11. openspec skill 命令

## 11.1 命令形式

```bash
openspec skill list                          # 列出 7 个 skill（id/stage/requires→produces）
openspec skill show <id>                     # 显示 skill.yaml + SKILL.md 摘要 + checklist
openspec skill run <id> [--change <CHG>] [--requirement <REQ>] [--title <text>]
```

## 11.2 skill run 语义

`skill run` **不是运行 AI**，而是"创建 Skill Invocation Context 并生成执行指令"：
- sdd-explore：不需 `--change`（它创建 Change），接收 `--requirement` / `--title` 或交互式输入
- 其余 6 个：需 `--change` 指定上下文（v0.1 骨架，仅校验状态前置 + 输出 Instruction 骨架）

## 11.3 CLI 装配

`cli/openspec/src/index.js` 修改：

```js
import { registerInitCommand } from "./commands/init.js";
import { registerChangeCommand } from "./commands/change.js";
import { registerSkillCommand } from "./commands/skill.js";

registerInitCommand(program);
registerChangeCommand(program); // Phase 1.3
registerSkillCommand(program);  // Phase 1.4
```

CLI 层严格遵循 [change.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/commands/change.js) 瘦编排模式：`resolveWorkspaceRoot` → @clack 交互 try/catch → core 纯函数 → `note/ok/warn` 输出 → `process.exit(1)` on error。

---

# 12. 错误处理

沿用 Phase 1.3 §16 模式：
- 不在 workspace 内：`Not an OpenSpec Workspace (no .sdd/ found). Run 'openspec init' first.`
- Skill 不存在：`Skill not found: <id>. Run 'openspec skill list'.`
- Change 不存在：`Change not found: <CHG-XXXX>`
- 非法状态迁移：`Illegal transition: <from> → <to>. Legal next: <...>.`
- @clack 取消：`cancel` + `outro('Canceled.')` + `process.exit(1)`

---

# 13. 测试要求

## 13.1 工具

沿用 Phase 1.2/1.3：Node 原生 `node --test` + `assert/strict` + `mkdtemp` 临时目录 + `rmrf`。`package.json scripts.test` 通配 `tests/*.spec.js`，新文件自动纳入。

## 13.2 Unit Test — `tests/skill.spec.js`

| 测试点 | 断言 |
| --- | --- |
| SkillLoader | 加载 sdd-explore 返回正确元数据；不存在抛 `Skill not found` |
| SkillRegistry | `listSkills` 返回 7 个；`getSkill` 命中 |
| fs-walker | 递归收集清单；空目录返回空；忽略 `.git`/`node_modules` |
| ContextAssembler | 读 `context-rules.yaml[explore].read` 返回 standards/ + product/ |
| InstructionBuilder | 组装 Instruction 含 SKILL.md 摘要 + Context + 用户输入 |
| ArtifactWriter | 读模板 + 填 front-matter + 替换 placeholder + 写文件；注释保留 |
| CandidateRepository | `writeCandidate` 生成 FEAT-CANDIDATE-0001；连续调用自增 |

## 13.3 Integration Test — `tests/integration.spec.js` 扩展

sdd-explore 端到端：
- `init` → `skill run sdd-explore`（输入需求）→ CHG-0001 + requirement.md + exploration.md + exploring 状态
- 旧需求沿用：预置进行中 CHG → sdd-explore 同 REQ → 决策纯函数返回"沿用"
- archive 沿用：预置 archived CHG → sdd-explore 同 REQ → 新 CHG metadata.related-change 写入
- Feature 未命中：feature-tree.yaml 无匹配 → `product/features/FEAT-CANDIDATE-0001.md` 生成

@clack 交互通过决策纯函数 + 注入返回值测试，不直接 mock @clack。

---

# 14. 分支策略与提交切分

## 14.1 分支策略（已确认）

先合 `feat/phase-1.3-sdd-lifecycle` 回 master，再从 master 拉 `feat/phase-1.4-skill-framework`（对外操作，执行前再确认 push）：

```
git checkout master
git merge feat/phase-1.3-sdd-lifecycle        # fast-forward
git push origin master                        # 需用户确认
git checkout -b feat/phase-1.4-skill-framework
```

理由：Phase 1.4 依赖 Phase 1.3 的 `core/sdd` 与 `templates/artifacts`；1.3 是稳定基线应成 master 事实。

## 14.2 提交切分（已确认）

单次 feat 提交（对齐 Phase 1.3 模式）：
- `core/sdd/` 新增 7 模块
- `skills/sdd-*/` 7 个（sdd-explore 完整 + 6 骨架）
- `cli/openspec/src/commands/skill.js` + `lib/skill-prompts.js` + `index.js` 注册
- `templates/artifacts/feature-candidate.md` + 更新 `exploration.md`/`requirement.md` 占位符
- `tests/skill.spec.js` + `tests/integration.spec.js` 扩展
- `package.json` files 加 `"skills"`
- `plans/phase-1.4-sdd-skill-framework.md`

---

# 15. 验收标准

Phase 1.4 完成后必须支持：

1. `openspec skill list` 显示 7 个 skill，对齐 Skill Contract 表
2. `openspec skill show sdd-explore` 元数据完整（含 output-artifacts）
3. `openspec skill run sdd-explore` 端到端：CHG-0001 + requirement.md + exploration.md + exploring 状态
4. 旧需求沿用：`findChangeByRequirement` 命中 → @clack select（决策纯函数可测）
5. archive 沿用：`runChangeCreate` 自动写 `related-change`
6. Feature 未命中 → `CandidateRepository.writeCandidate` 生成 `FEAT-CANDIDATE-NNNN.md`
7. FeatureModel 保持只读，`writeCandidate` 由 CandidateRepository 负责
8. Skill 不调模型，只生成 Instruction（写入 CHG 目录 + 终端输出）
9. 其余 6 个 Skill `skill.yaml` + 基础 SKILL.md + Artifact Contract 齐备
10. `node --test tests/*.spec.js` 全绿（65 现有 + 新增 skill 测试）
11. `package.json` files 含 `"skills"`
12. Phase 1.4 提交不含 Agent Runtime / LLM / Prompt Engine / Workflow Engine 内容

**不验收（属 Phase 1.5）**：多 Skill 编排、Workflow YAML、自动连续执行 explore → prd → design。

---

# 16. 后续阶段

## 16.1 Phase 1.5：Workflow Engine

组合 Skill 执行完整 SDD 流程：Workflow YAML 定义阶段编排，自动推进 Change 状态，串联 explore → converge。

## 16.2 Agent Runtime / LLM / Prompt Engine

后续实现模型调用与对话管理，使 Skill 可由 Harness 自身驱动（v0.1 由外部 Agent 驱动）。

## 16.3 Skill 内容深化

7 个 Skill 的 SKILL.md/checklist/rules 随各阶段真实用例深化（v0.1 仅 sdd-explore 完整，其余骨架）。

---

# 17. 关键复用函数（core/sdd Phase 1.3 已落地，不重写）

- `runChangeCreate(workspaceRoot, {title, requirement, repositories}, harnessRoot)` → `{id, changeDir}`（[change-model.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/change-model.js)，含 archive 自动写 related-change）
- `patchStatus(changeDir, status)` / `readMetadata(changeDir)` / `patchMetadata(changeDir, patch)`
- `validateTransition(from, to)` / `nextStatuses(current)` / `isValidStatus(status)`（[change-state-machine.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/change-state-machine.js)）
- `findChangeByRequirement(workspaceRoot, {requirement, title})` → 候选清单（[change-repository.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/change-repository.js)）
- `readFeatureTree(workspaceRoot)` / `findFeature(tree, {id, name})` / `featurePath(tree, target)`（[feature-model.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/feature-model.js)，只读）
- `getHarnessRoot()`（[harness-root.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/workspace/harness-root.js)，定位 `harnessRoot/skills/` 与 `templates/artifacts/`）
- `resolveWorkspaceRoot()`（[workspace-resolver.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/lib/workspace-resolver.js)，CLI 层定位 workspace）
- @clack 交互封装范本：[prompts.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/lib/prompts.js) / [change-prompts.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/lib/change-prompts.js)
- CLI 瘦编排范本：[change.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/commands/change.js) / [init.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/commands/init.js)

---

# 18. bootstrap 说明

Phase 1.4 自身的实现走 git 分支管理，**不**为本 Phase 的提交创建 CHG 目录（先有鸡先有蛋，对齐 Phase 1.3 §17）。`openspec skill run sdd-explore` 在 Phase 1.4 落地后即可演示；Phase 1.5 起 Harness 自身演进才强制走完整 SDD 生命周期流程（即为本 Phase 提交建立 CHG 目录）。

---

# 总结

Phase 1.4 = SDD Skill Framework（Skill Definition & Invocation Framework）：

```
Skill 定义（skill.yaml / SKILL.md / checklist / rules）
    +
Skill 加载与注册（SkillLoader / SkillRegistry）
    +
Skill Invocation Context（ContextAssembler / fs-walker）
    +
Instruction 生成（InstructionBuilder）
    +
Artifact 写入（ArtifactWriter / CandidateRepository）
    +
openspec skill list/show/run
    +
sdd-explore 完整可演示（其余 6 骨架）
```

不实现：Agent Runtime、LLM、Prompt Engine、Workflow Engine。

最终架构：

```
Phase 1.3 定义 Artifact
    ↓
Phase 1.4 Skill 生产 Artifact（Skill = Artifact Producer）
    ↓
Phase 1.5 Workflow 编排 Skill
```

Skill 是 SDD 生命周期阶段能力，用于生成和演进 Artifact。OpenSpec 不执行 AI，只装配上下文、生成 Instruction、管理 Artifact；外部 Agent（Trae/Cursor/Claude Code）按 Instruction 执行产生 Artifact，再用 `openspec change status --set` 推进状态。
