# OpenSpec AI Development Harness

# Phase 1.3 - SDD Lifecycle & Artifact Model Design

> Version: v0.1
> Status: Draft
> Type: Implementation Design
> Phase: Phase 1.3 - SDD Lifecycle & Artifact Model

# 1. 文档目的

本文档定义 OpenSpec AI Development Harness Phase 1.3 的实现方案。

Phase 1.3 的目标：

> 建立 SDD 生命周期领域模型：定义 Requirement、Feature、Change、Artifact、Lifecycle State 以及 Skill Contract，为后续 Skill Framework 和 Workflow Engine 提供基础。
>
> Phase 1.3 = Domain Model Design，不是 Runtime Implementation。

```
Requirement
    ↓
sdd-explore  →  Change (生命周期载体)
    ↓
sdd-prd / sdd-design / sdd-task / sdd-dev / sdd-test / sdd-converge
    （在 Change Context 中依次执行，产出各阶段 Artifact）
```

Phase 1.2 已落地 `openspec init`（Workspace 初始化）。Phase 1.3 在 Workspace 之上建立 SDD 生命周期的统一基础：Change 与 Skill 不是两套平行体系，而是同一生命周期的载体与执行能力。

Phase 1.3 不实现 Agent Runtime、LLM 调用、Prompt Engine、Workflow Engine，也不实现 Skill Runtime（SkillLoader/Executor 与 skills/ 源码属 Phase 1.4），这些均属后续 Phase。

---

# 2. Phase 1.3 定位

OpenSpec Harness 演进：

```
Phase 1.0  Repository Bootstrap
        ↓
Phase 1.1  Workspace Template
        ↓
Phase 1.2  OpenSpec Init
        ↓
Phase 1.3  SDD Lifecycle & Artifact Model   ← 本阶段
        ↓
Phase 1.4  SDD Skill Framework
        ↓
Phase 1.5  Workflow Engine
```

Phase 1.3 = SDD Lifecycle & Artifact Model（Domain Model Design），包含：

```
Requirement Model     需求输入模型
Feature Model         Feature Tree 数据模型（product/feature-tree.yaml）
Change Model          生命周期载体（CHG 容器 + metadata + 状态 + artifact 关联）
Artifact Model        各阶段产物（exploration/prd/design/tasks/evidence/knowledge update）
Lifecycle State       状态流转（created→exploring→...→archived，对齐 change-lifecycle.md）
Skill Contract        Skill 接口契约（id/stage/input/output/requires-state/produces-state）
```

Phase 1.3 只定义领域模型与产物契约，不实现 Skill Runtime 与 Workflow Runtime。

---

# 3. 核心架构

## 3.1 SDD 生命周期

OpenSpec SDD 生命周期：

```
Requirement
    ↓
sdd-explore        理解需求、初始化 Change、建立上下文、判断 Feature 归属
    ↓
Change (CHG-XXX)   生命周期载体，承载后续所有阶段
    ↓
sdd-prd            产出 prd.md
    ↓
sdd-design         产出 design.md
    ↓
sdd-task           产出 tasks.md
    ↓
sdd-dev            产出 implementation.md
    ↓
sdd-test           产出 evidence/
    ↓
sdd-converge       产出 convergence.md
```

## 3.2 核心关系

```
Change = 一个需求从提出到交付的生命周期容器
Skill  = 执行 SDD 生命周期阶段的能力（必须运行在 Change Context 中）
```

关系：

```
Change
  |
  ├── sdd-explore   （创建 Change，产出 exploration.md）
  ├── sdd-prd       （读 Change Context，产出 prd.md）
  ├── sdd-design    （读 prd，产出 design.md）
  ├── sdd-task      （读 design，产出 tasks.md）
  ├── sdd-dev       （读 tasks，产出 implementation.md）
  ├── sdd-test      （读 implementation，产出 evidence/）
  └── sdd-converge  （读 completed change，产出 convergence.md）
```

Skill 不独立运行。Skill 必须运行在 Change Context 中：读取当前 Change 已产出的 Artifact + 按 context-rules 加载 workspace 知识，输出下一阶段 Artifact 写入 Change 目录，并推进 Change 状态。

Phase 1.3 只定义 Skill Interface 契约；7 个 sdd-\* Skill 的实现（SKILL.md/checklist/rules 与执行框架）属 Phase 1.4。

## 3.3 Harness 与 Workspace 分离

依据 Workspace 与 Harness 分离原则（见 [skills/README.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/skills/README.md) v0.1）：

- Workspace 是项目知识载体（standards/product/delivery/implementation），由 `openspec init` 初始化。
- Harness 是能力提供方（cli/core/templates），Workspace 不复制 Harness 源码。
- Skill 源码的存放位置与加载方式在 Phase 1.4 定义（本阶段不涉及）。

---

# 4. 阶段目标

## 4.1 模型定义范围

Phase 1.3 定义 6 个领域模型 + Skill Contract：

```
Requirement Model     需求输入模型
Feature Model         Feature Tree 数据模型
Change Model          生命周期载体（CHG 容器 + metadata + 状态 + artifact 关联）
Artifact Model        各阶段产物（exploration/prd/design/tasks/evidence）
Lifecycle State       状态流转（created→...→archived）
Skill Contract        Skill 接口契约（id/stage/input/output/requires-state/produces-state）
```

不实现 Skill Runtime、不实现 Workflow Runtime、不填充 skills/ 源码。

`openspec change` 命令（若实现）只作为管理操作（list/show/status/archive），不作为 SDD 生命周期入口——入口是 sdd-explore（Phase 1.4）。

## 4.2 定义 Skill Contract

依据 [skill-execution.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/standards/sdd/skill-execution.md) §3 与 [03-Skill-Spec.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/docs/03-Skill-Spec.md) §4，定义 7 个 SDD Skill 的接口契约（skill id/stage/input/output/requires-state/produces-state）。

7 个 Skill 的实际实现（SKILL.md/checklist/rules/templates 指令文本 + SkillLoader/ContextAssembler/InstructionBuilder 执行框架）属 Phase 1.4。其中 `sdd-explore` 作为生命周期入口将在 Phase 1.4 完整可演示（创建 Change + requirement.md + exploration.md）。

---

# 5. 非目标范围

Phase 1.3 不实现以下内容，均属后续 Phase：

| 内容                                                                            | 所属阶段                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Skill 源码（skills/sdd-\*/SKILL.md/checklist/rules/templates）                  | Phase 1.4                                           |
| Skill 执行框架（SkillLoader/ContextAssembler/InstructionBuilder/SkillRegistry） | Phase 1.4                                           |
| `openspec skill` 命令                                                           | Phase 1.4                                           |
| Workflow Engine（Workflow YAML、阶段自动编排、自动状态推进）                    | Phase 1.5                                           |
| Agent Runtime（模型调用、对话管理、Agent 状态机）                               | 后续                                                |
| LLM 调用 / Prompt Engine                                                        | 后续（Harness 不替代 Agent）                        |
| Knowledge Reverse（`openspec reverse`）                                         | 后续                                                |
| `openspec doctor` / `openspec validate` 独立命令                                | 后续                                                |
| `openspec requirement` 独立命令                                                 | 后续（v0.1 由 sdd-explore 统一需求入口，Phase 1.4） |
| workspace `skills/registry.yaml` init 自动生成                                  | 后续                                                |
| implementation/ 深度上下文读取                                                  | 后续（v0.1 仅列目录概要）                           |
| npm 发布                                                                        | Phase 1.3+                                          |

---

# 6. 系统结构

## 6.1 仓库根目录树（Phase 1.3 新增/修改标注）

```
OpenSpec-AI-Development-Harness/
├── cli/openspec/
│   ├── bin/openspec.js                      # 不变
│   └── src/
│       ├── index.js                         # 改：注册 change 子命令组（管理操作）
│       ├── commands/
│       │   ├── init.js                      # 不变（瘦编排范本）
│       │   └── change.js                    # 新增：change 管理操作（list/show/status/archive）
│       └── lib/
│           ├── prompts.js                   # 不变
│           ├── change-prompts.js            # 新增：change 命令的 @clack 交互封装
│           ├── workspace-resolver.js        # 新增：从 cwd 向上找 .sdd/
│           ├── banner.js                    # 不变
│           └── logger.js                    # 不变
├── core/
│   ├── workspace/                           # 不变（Phase 1.2 既有 7 模块）
│   └── sdd/                                 # 新增：SDD 生命周期领域模型（纯函数）
│       ├── requirement-model.js             # Requirement Model（REQ 解析）
│       ├── feature-model.js                 # Feature Model（feature-tree.yaml 读写）
│       ├── change-model.js                  # Change 数据/目录/metadata
│       ├── change-id-generator.js           # CHG-XXXX 自增编号
│       ├── change-state-machine.js          # Lifecycle State 状态流转
│       ├── change-repository.js             # list/show/findChangeByRequirement 只读扫描
│       └── change-archiver.js               # Completed→Archived 迁移
├── templates/
│   ├── default-workspace/                   # 改：更新 change-lifecycle.md §3 命名
│   │   └── standards/sdd/change-lifecycle.md  # 改：request.md→requirement.md 命名对齐
│   └── artifacts/                            # 新增：阶段产物模板（Harness 资产）
│       ├── metadata.yaml                    # Change 元数据模板（含注释）
│       ├── requirement.md                   # 需求来源原文骨架
│       ├── exploration.md                   # sdd-explore 探索产物骨架
│       ├── prd.md                           # sdd-prd 产物骨架
│       ├── design.md                        # sdd-design 产物骨架
│       ├── tasks.md                         # sdd-task 产物骨架
│       ├── implementation.md               # sdd-dev 产物骨架（修改仓库/模块/Commit/Task 对应）
│       └── convergence.md                   # sdd-converge 产物骨架（知识变化总结/更新判断）
├── skills/                                  # Phase 1.4 才填充（本阶段不创建）
├── tests/
│   ├── init.spec.js                         # 不变
│   ├── integration.spec.js                  # 扩展：lifecycle 端到端
│   ├── change.spec.js                       # 新增：Change Model unit
│   └── feature.spec.js                      # 新增：Feature Model unit
├── plans/
│   └── phase-1.3-sdd-lifecycle-design.md   # 本文档
└── package.json                            # 不变（skills/ 在 Phase 1.4 才加 files）
```

## 6.2 模块职责

| 域       | 模块               | 文件                      | 职责                                            |
| -------- | ------------------ | ------------------------- | ----------------------------------------------- |
| core/sdd | RequirementModel   | `requirement-model.js`    | REQ 结构定义与解析                              |
| core/sdd | FeatureModel       | `feature-model.js`        | feature-tree.yaml 读写/节点查找                 |
| core/sdd | ChangeModel        | `change-model.js`         | Change 目录/metadata 读写 + runChangeCreate     |
| core/sdd | ChangeIdGenerator  | `change-id-generator.js`  | CHG-XXXX 自增编号                               |
| core/sdd | ChangeStateMachine | `change-state-machine.js` | Lifecycle State 流转校验                        |
| core/sdd | ChangeRepository   | `change-repository.js`    | list/show/findChangeByRequirement 只读扫描      |
| core/sdd | ChangeArchiver     | `change-archiver.js`      | Completed→Archived 迁移                         |
| cli      | change 命令组      | `commands/change.js`      | change 管理操作编排（list/show/status/archive） |

模块间依赖单向：

```
领域模型层:
  ChangeModel
    ├─ ChangeIdGenerator
    └─ ChangeStateMachine
  ChangeRepository（只读，含 findChangeByRequirement）
  ChangeArchiver → ChangeStateMachine + ChangeModel
  RequirementModel / FeatureModel 互相独立，被 CLI 编排
```

沿用 Phase 1.2 模式：core 是纯函数（无 CLI 依赖、无 @clack），CLI 层只编排。core 引用路径 `../../../../core/sdd/`。原生 `node:fs/promises`，yaml 用 `parseDocument`+`setIn` 保留注释。

---

# 7. SDD Lifecycle Model

## 7.1 生命周期总览

```
Requirement（REQ-XXX）
    ↓
sdd-explore        →  创建 CHG-XXX + exploration.md
    ↓
sdd-prd            →  prd.md
    ↓
sdd-design         →  design.md
    ↓
sdd-task           →  tasks.md
    ↓
sdd-dev            →  implementation.md
    ↓
sdd-test           →  evidence/
    ↓
sdd-converge       →  convergence.md + archive
```

## 7.2 Lifecycle State（与 Skill 阶段对齐）

Change 状态流转，每个状态对应一个 SDD 阶段 Skill 的完成：

```
created        CHG 已创建（sdd-explore 入口，exploration 未完成）
   ↓
exploring      sdd-explore 执行中/完成（exploration.md 已产出）
   ↓
specified      sdd-prd 完成（prd.md 已产出）
   ↓
designed       sdd-design 完成（design.md 已产出）
   ↓
tasked         sdd-task 完成（tasks.md 已产出）
   ↓
developing     sdd-dev 执行中（implementation changes 进行中）
   ↓
testing        sdd-test 执行中（evidence 进行中）
   ↓
completed      sdd-converge 完成（knowledge update 已产出）
   ↓
archived       已归档到 delivery/archive/
```

合法迁移表（v0.1 线性前进，不支持回退/取消）：

```
created     → [exploring]
exploring   → [specified]
specified   → [designed]
designed    → [tasked]
tasked      → [developing]
developing  → [testing]
testing     → [completed]
completed   → [archived]
archived    → []   终态
```

`ChangeStateMachine` 导出 `CHANGE_STATUSES` / `validateTransition(from,to)` / `nextStatuses(current)`。非法迁移（跳阶段）报错退出码 1。

状态名以 [change-lifecycle.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/standards/sdd/change-lifecycle.md) §4 为准（小写存储）。

## 7.3 Requirement Model

需求入口。Requirement 是 SDD 流程入口的用户输入。v0.1 不单独引入 requests 目录——Requirement 作为：

- 用户输入（sdd-explore 接收的原始需求文本或 REQ 标识）
- Change metadata 的来源字段（`metadata.requirement`）
- CHG 目录内的 `requirement.md`（记录需求原文）

结构（写入 CHG 目录的 `requirement.md` front-matter）：

```yaml
id: REQ-001
name: 新增智能商品推荐功能
content: <需求原文>
source: user
created-at: <ISO8601>
```

v0.1 实现边界：

- `RequirementModel` 定义 REQ 结构与解析（`parseRequirement(path)` / `requirementId(name)`），不维护独立 requests 目录。
- `sdd-explore` 接受 Requirement 输入：已登记的 `REQ-XXX` 标识，或直接需求文本（此时 sdd-explore 内部写 `requirement.md`）。
- 不单独实现 `openspec requirement` 命令（v0.1 由 sdd-explore 统一需求入口，Phase 1.4 实现；独立命令后续补）。

---

# 8. Change Model

## 8.1 Change 定义

> Change 是一个需求从提出到交付的生命周期容器。

Change 承载：

```
Requirement 信息
Feature Tree 归属
exploration（探索结果）
prd
design
tasks
implementation
evidence
convergence
```

## 8.2 Change 目录结构

```
delivery/
└── changes/
    └── CHG-XXX/
        ├── metadata.yaml          Change 元数据
        ├── requirement.md         需求来源原文（sdd-explore 记录）
        ├── exploration.md         sdd-explore 探索结果（需求理解/Feature 归属/影响分析/未知问题）
        ├── prd.md                  sdd-prd 产物
        ├── design.md              sdd-design 产物
        ├── tasks.md                sdd-task 产物
        ├── implementation.md      sdd-dev 产物（修改仓库/模块/Commit/Task 对应）
        ├── evidence/              sdd-test 产物
        │   └── test-report.md
        └── convergence.md         sdd-converge 产物（知识变化总结/更新判断）
```

注：`requirement.md` 记录需求来源原文，`exploration.md` 记录探索结果（Feature 归属/影响分析）。两者分离：前者是输入沉淀，后者是分析产物。对齐 [change-lifecycle.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/standards/sdd/change-lifecycle.md) §3 的 request.md 角色（本设计改名 `requirement.md` 以更准确表达"需求来源"语义，属 bootstrap 阶段标准对齐，见 §17）。

## 8.3 metadata.yaml schema

```yaml
# OpenSpec Change Metadata
#
# 版本: v0.1
# 类型: Change Metadata（SDD 生命周期载体元信息）
#
# 由 ChangeModel.runChangeCreate 生成（sdd-explore 内部调用，Phase 1.4 实现）。
# Phase 1.3 仅实现 runChangeCreate 纯函数与 list/show/status/archive 管理操作，不暴露 CLI create 入口。
# 后续 status/archive 由 Document API 改写（保留注释）。

id: "" # CHG-XXXX，创建时填
title: "" # 简短标题
summary: "" # 一句话摘要（可选）
status: created # 见 Lifecycle State §7.2
requirement: "" # 需求来源 REQ-XXX（sdd-explore 记录）
created-at: "" # ISO8601
updated-at: "" # ISO8601，每次状态变更更新
features: # 影响的 Feature id 列表（sdd-explore 判定，可空）
  # - FEAT-PRODUCT-RECOMMEND
repositories: # 影响的仓库 id 列表（对应 repositories.yaml，可空）
  # - product-service
related-change: "" # 关联的历史 CHG-XXXX（需求复用 archived Change 时记录，可空）
```

## 8.4 CHG-XXXX 编号策略

`ChangeIdGenerator`：

```
扫描 delivery/changes/ + delivery/archive/ 下所有目录名
正则 ^CHG-(\d{4})$ 匹配
取最大数字 +1，String(n).padStart(4, '0')
```

- 目录不存在时当 0 处理（首次 create → CHG-0001）。
- 扫描 archive 防止新编号撞旧档案。
- v0.1 假设单 workspace 不超 9999 个 Change。

## 8.5 Change 命令（管理操作）

**sdd-explore 是 SDD 生命周期唯一入口**（Phase 1.4 实现）。sdd-explore 内部完成：创建 CHG-XXX → 写 `requirement.md` → 产出 `exploration.md` → 更新 metadata → 推进 exploring 状态。

`openspec change` 命令（Phase 1.3 实现）只作为**管理操作**，不作为 SDD 生命周期入口：

```bash
openspec change list [--status <state>]        # 列出进行中 Change
openspec change show <CHG-XXXX>                # 查看 metadata + artifacts 清单
openspec change status <CHG-XXXX> [--set <state>]   # 查看/推进状态
openspec change archive <CHG-XXXX>             # 归档（需 completed）
```

Phase 1.3 不实现 `openspec change create`（create 由 Phase 1.4 的 sdd-explore 内部调用 `ChangeModel.runChangeCreate` 完成）。`runChangeCreate` 作为纯函数仍在 Phase 1.3 实现（模型层），供 Phase 1.4 sdd-explore 调用：

```
id = nextChangeId(workspaceRoot)
mkdir delivery/changes/<id>/evidence/
copy artifacts/metadata.yaml → <id>/metadata.yaml
（requirement/exploration/prd/design/tasks 不预创建，由对应阶段产出时写入）
查 archive 关联历史 → 写 related-change（见 §8.6）
writeMetadata(<id>, {id, title, summary, status:created, requirement, createdAt, updatedAt, repositories})
return {id, changeDir}
```

### list / show / status / archive

- `list`：扫描 `delivery/changes/*/metadata.yaml`，按 `updated-at` 倒序，可 `--status` 过滤。
- `show <id>`：读 metadata + 列目录内 artifacts。
- `status <id>`：无 `--set` 显示当前状态 + 合法下一状态；有 `--set` 走 `validateTransition` + `patchStatus`。
- `archive <id>`：`validateTransition(status, archived)`（需 completed）→ `rename` 到 `delivery/archive/<id>` + 置 archived。

## 8.6 旧需求沿用策略

### 8.6.1 问题

同一需求可能多次提出：曾交付（archived）、正在进行中（changes/）、或全新提出。sdd-explore 与 `runChangeCreate` 必须在创建新 Change 前判断：该需求是否已对应一个 Change？

### 8.6.2 匹配依据

v0.1 不实现 LLM 语义匹配，沿用判断基于**结构化字段精确匹配**：

| 输入形态               | 匹配字段                                         | 说明                                             |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------ |
| 已登记 REQ-XXX         | `metadata.requirement` 精确相等                  | 最准：同 REQ-XXX 即同需求来源                    |
| 需求文本（无 REQ-XXX） | `metadata.title` 精确相等（忽略大小写/首尾空白） | 弱匹配：v0.1 仅字面相等，语义匹配留后续 LLM 阶段 |

需求文本无法精确匹配时，v0.1 一律视为新需求，不做猜测。

### 8.6.3 匹配范围与决策

扫描顺序：先进行中（`delivery/changes/`），再已归档（`delivery/archive/`）。

```
找到进行中 Change（changes/）
   ↓
沿用：不新建，提示用户在现有 CHG 上继续推进下一阶段
   （避免同需求开两个活 Change，造成生命周期分裂）

找到已归档 Change（archive/）
   ↓
新建 CHG-XXXX + metadata.related-change = <历史 CHG>
   （旧交付已成档不可改写，新轮次走新 Change，记录历史关联以供追溯）

均未匹配
   ↓
新建 CHG-XXXX（related-change 留空）
```

### 8.6.4 沿用决策需用户确认

匹配到进行中 Change 时，**不自动沿用**——由 sdd-explore 输出候选清单，提示用户选择（@clack 交互，Phase 1.4 实现）：

```
发现进行中 Change 与本需求匹配：
  [1] CHG-0003  新增智能商品推荐功能  (status: prd)
  [2] 新建 Change
请选择:
```

理由：沿用错误的 Change 会污染既有生命周期，属难逆操作，须用户裁决（对齐项目硬约束"对外/难逆操作先问用户"）。

### 8.6.5 纯函数设计

`ChangeRepository.findChangeByRequirement(workspaceRoot, { requirement?, title? })`：

```
扫描 delivery/changes/*/metadata.yaml
匹配 metadata.requirement === requirement 或 metadata.title === title
返回 [{id, title, status, changeDir}] 候选清单（可能多个）
不扫 archive（archived 仅在用户选择"新建"时由 ChangeModel 记 related-change）
```

`ChangeModel.runChangeCreate` 在写 metadata 前：

```
若用户提供 REQ-XXX 或 title，先查 archive 是否有匹配
有 → metadata.related-change = <历史 CHG-XXXX>
无 → related-change 留空
```

### 8.6.6 v0.1 边界

- 不做语义相似度匹配（留 LLM 阶段）
- 不做需求文本与 REQ-XXX 的交叉匹配
- 匹配到多个进行中 Change 时全部列出，由用户选择
- archived 匹配仅记录 related-change，不复活旧 Change（对齐硬约束"AI 必须不修改历史交付记录"）

---

# 9. Artifact Model

## 9.1 阶段产物

| 阶段 Skill   | 输入                       | 输出 Artifact                                                             |
| ------------ | -------------------------- | ------------------------------------------------------------------------- |
| sdd-explore  | Requirement                | requirement.md + exploration.md + metadata-update（requirement/features） |
| sdd-prd      | CHG Context（exploration） | prd.md                                                                    |
| sdd-design   | prd                        | design.md                                                                 |
| sdd-task     | design                     | tasks.md                                                                  |
| sdd-dev      | tasks                      | implementation.md                                                         |
| sdd-test     | implementation             | evidence/                                                                 |
| sdd-converge | completed change           | convergence.md                                                            |

## 9.2 Artifact 模板存放

Artifact 模板放 `harnessRoot/templates/artifacts/`（与 `default-workspace/` 平级）。

理由：Artifact 模板是 Harness 能力资产（随版本演进），不属于 workspace 静态知识；与 `skills/` 逻辑一致，由 `getHarnessRoot()` 定位。`package.json files` 已含 `templates`，自动随发布包。

模板内容（v0.1 骨架）：

- `metadata.yaml`：完整注释模板（§8.3）。
- `requirement.md`：需求来源原文骨架（front-matter + 正文）。
- `exploration.md`：探索骨架（需求理解 / Feature 归属 / 影响分析 / 未知问题）。
- `prd.md` / `design.md` / `tasks.md`：对齐 [02-Workflow.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/docs/02-Workflow.md) §6/§7/§8 各阶段产出要求的最小骨架。
- `implementation.md`：dev 阶段产物骨架（修改仓库/模块/Commit 信息/实现状态/与 Task 对应关系）。注：实际代码位于 `implementation/`（Implementation World），本文件只记录"实现了什么/在哪个仓库/哪个 Commit 对应哪个 Task"，不复制代码。
- `convergence.md`：converge 阶段产物骨架（本次 Change 知识变化总结/是否需更新 `standards/`、`product/`、`feature-tree.yaml` 的判断/知识沉淀过程记录）。注：真正的知识更新发生在 Workspace Knowledge 中（写回 standards/product/），本文件只记录"该不该更新、更新了什么、为什么"。

## 9.3 Artifact Lifecycle

Artifact 随 Change 生命周期演进。每个 Artifact 表示当前阶段的系统认知。

```
Requirement
    ↓
exploration.md
    ↓
prd.md
    ↓
design.md
    ↓
tasks.md
    ↓
implementation.md
    ↓
evidence/
    ↓
convergence.md
```

说明：

- Artifact 不是独立 Spec 对象，而是 Change 内部随生命周期不断演进的产物集合。
- 每个 Artifact 表示当前阶段的系统认知：探索期认知 → 规格期认知 → 设计期认知 → 任务期认知 → 实现期认知 → 验证期认知 → 沉淀期认知。
- 后一阶段 Artifact 可引用前一阶段 Artifact（如 design.md 引用 prd.md 的需求编号），但不替换前者——Change 目录保留全部 Artifact 作为可追溯证据链。
- `metadata.yaml` 不参与 Artifact 演进序列，它承载 Change 元数据（id/requirement/features/lifecycle state），随各阶段更新（features 在 explore 后填、status 在每阶段推进）。
- 命名保持 `xxx.md` 风格（非 `xxx.spec.md`）：OpenSpec 的 Specification 体现为 Artifact 生命周期演进，而不是单独 Spec 文件。

---

# 10. Skill Contract

## 10.1 Skill 定义

> Skill 是执行 SDD 生命周期阶段的能力单元，必须运行在 Change Context 中。

依据 [skill-execution.md](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/standards/sdd/skill-execution.md) §2：一个 Skill 包含 Instruction / Context / Process / Output / Validation。

Phase 1.3 只定义 Skill Interface 契约；Skill 的实现（SKILL.md/checklist/rules/templates 指令文本 + SkillLoader/ContextAssembler/InstructionBuilder 执行框架）属 Phase 1.4。

## 10.2 Skill Contract

Phase 1.3 定义每个 Skill 的接口契约（不入库实际源码）：

- skill id（如 sdd-explore）
- stage（对应 SDD 阶段）
- input（输入来源）
- output（产出 Artifact）
- requires-state（前置 Change 状态）
- produces-state（执行完成后推进到的状态）

Skill 源码结构（skill.yaml/SKILL.md/templates/checklist/rules 目录）与 skill.yaml schema 在 Phase 1.4 定义。

## 10.3 七个 Skill 与 Artifact 关系（Skill Contract）

| Skill        | stage    | input                                                  | output                                                  | requires-state | produces-state |
| ------------ | -------- | ------------------------------------------------------ | ------------------------------------------------------- | -------------- | -------------- |
| sdd-explore  | explore  | requirement, product/feature-tree.yaml, standards/sdd/ | requirement.md, exploration.md, change, metadata-update | created        | exploring      |
| sdd-prd      | prd      | CHG Context（exploration）                             | prd.md                                                  | exploring      | specified      |
| sdd-design   | design   | prd, standards, implementation                         | design.md                                               | specified      | designed       |
| sdd-task     | task     | design                                                 | tasks.md                                                | designed       | tasked         |
| sdd-dev      | dev      | tasks, design, repository                              | implementation.md                                       | tasked         | developing     |
| sdd-test     | test     | implementation, prd, design                            | evidence/                                               | developing     | testing        |
| sdd-converge | converge | completed change                                       | convergence.md                                          | testing        | completed      |

注：sdd-explore 的 output 含 `requirement.md`（需求来源沉淀）+ `exploration.md`（探索结果）+ change（创建 CHG）+ metadata-update。其余 Skill 契约保持不变。

## 10.4 sdd-explore 职责（Contract 说明，实现属 Phase 1.4）

sdd-explore 是生命周期第一个 Skill。Phase 1.3 定义其职责与产物契约，实现属 Phase 1.4。

输入：

```
Requirement：REQ-001 / 新增智能商品推荐功能
```

执行流程（Phase 1.4 SKILL.md 实现）：

```
1. 判断 Change 归属（见 §8.6 旧需求沿用策略）：
   a. 用户提供 REQ-XXX 或 title → findChangeByRequirement 查进行中 Change
   b. 匹配到 → 提示用户沿用现有 CHG（不新建），跳到步骤2
   c. 未匹配 → ChangeModel.runChangeCreate（内部自动查 archive，命中则记 related-change）
2. 加载上下文：读 standards/、product/，必要时 implementation/
3. 分析需求，写 requirement.md
4. 判断 Feature Tree 归属：读 product/feature-tree.yaml
     命中 → 记录 feature id
     未命中 → 创建 candidate feature（写入 product/features/，标 pending）
5. 输出探索结果到 CHG-XXX/exploration.md（需求理解 / Feature 归属 / 影响分析 / 未知问题）
6. 更新 metadata.yaml（requirement / features）
7. 推进状态：openspec change status CHG-XXX --set exploring
```

---

# 11. Skill Framework（Phase 1.4 预告）

Phase 1.4 实现 SDD Skill Framework，本阶段不实现。Phase 1.4 交付：

- 仓根 `skills/sdd-*/` 指令文本（SKILL.md/checklist.md/rules.md/templates/）
- `core/sdd/` 的 SkillLoader/ContextAssembler/InstructionBuilder（消费 `.sdd/context-rules.yaml` 装配上下文，输出 instruction，不调模型）
- `openspec skill list/show/run` 命令
- sdd-explore 完整可演示，其余 6 个接口骨架

Skill 不调模型，v0.1 由外部 Agent（Trae/Cursor/Claude Code）按 instruction 执行，产出写回 CHG 目录，再用 `openspec change status --set <produces-state>` 推进状态。AI Execution / Output Validation / Evidence Record 由外部 Agent 与后续 Phase 承担。

`context-rules.yaml`（Phase 1.1 已建立，定义各 stage 的 `read` 上下文加载规则）将在 Phase 1.4 被 ContextAssembler 消费——本阶段确保其 stage 名（explore/prd/design/task/dev/test/converge）与本设计的 Lifecycle State 对齐（既有文件已对齐，无需改动）。

---

# 12. CLI 装配

`cli/openspec/src/index.js` 修改：

```js
import { registerInitCommand } from "./commands/init.js";
import { registerChangeCommand } from "./commands/change.js";

registerInitCommand(program);
registerChangeCommand(program); // Phase 1.3 change 管理操作（list/show/status/archive，不含 create 入口）
```

commander 嵌套子命令：

```js
export function registerChangeCommand(program) {
  const change = program.command('change').description('SDD Change 管理操作');
  change.command('list').option('-s, --status <s>')...
  change.command('show <id>')...
  change.command('status <id>').option('--set <status>')...
  change.command('archive <id>')...
  // 注：不含 create 子命令（create 由 Phase 1.4 sdd-explore 内部调用 ChangeModel.runChangeCreate）
}
```

不注册 `openspec skill` 命令（Phase 1.4）。

CLI 层严格遵循 [init.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/commands/init.js) 瘦编排模式：commander action 内 `resolveWorkspaceRoot`→（轻量 info）→@clack 交互 try/catch→调 core 纯函数→`note/ok/warn` 输出→`process.exit(1)` on error。`resolveWorkspaceRoot()` 从 cwd 向上找 `.sdd/`，放 `cli/openspec/src/lib/workspace-resolver.js`（后续 doctor 复用）。

---

# 13. bootstrap 说明

Phase 1.3 自身的实现走 git 分支管理，**不**为本 Phase 的提交创建 CHG 目录（先有鸡先有蛋）。`openspec change` 管理命令（list/show/status/archive）在 Phase 1.3 落地后即可使用；Phase 1.4 起 sdd-explore 入口（含 `ChangeModel.runChangeCreate` 调用链）可演示；Phase 1.5 起 Harness 自身演进才强制走完整 SDD 生命周期流程（即为本 Phase 提交建立 CHG 目录）。

---

# 14. 分支策略与提交切分

## 14.1 仓库状态核实（切换时）

- 当前分支 `feat/phase-1.2-sdd-init`，提交历史：
  - `6d7983a` chore(phase-1.2): package.json 加 files 字段精简发布包
  - `44d4389` feat(phase-1.2): 实现 openspec init 命令
  - `20340e4` feat(phase-1.1): 完成 Workspace Template 设计与实现对齐
- **工作区干净**（交接文档所述"未提交 M package.json"已过时——files 字段已由 `6d7983a` 单独补提交）。
- 仓根 `skills/` 是空目录（git 不跟踪空目录），待填充。

## 14.2 分支策略（建议，需用户确认）

建议先合 master 再从 master 拉 Phase 1.3 分支：

```
git checkout master
git merge feat/phase-1.2-sdd-init        # fast-forward
git push origin master                   # 需用户确认推送
git checkout -b feat/phase-1.3-sdd-lifecycle
```

理由：Phase 1.3 依赖 Phase 1.2 的 `runInit` 产出 workspace 作为运行环境；1.2 是稳定基线应成 master 事实；直接在 1.2 分支拉 1.3 会导致 base 漂移需 rebase。

**注**：merge/push 属对外/难逆操作，须用户确认后执行。也可选择直接从 `feat/phase-1.2-sdd-init` 拉分支。

## 14.3 提交切分

Phase 1.3 是统一的 SDD Lifecycle & Artifact Model，按"领域模型 + 载体骨架 + 管理操作"作为单次提交落地（Skill Framework 全部内容属 Phase 1.4，不在本提交范围）：

| 提交                                            | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| commit 1（Lifecycle & Artifact Model 唯一提交） | `core/sdd/{requirement-model,feature-model,change-model,change-id-generator,change-state-machine,change-repository,change-archiver}.js`、`templates/artifacts/{metadata,requirement,exploration,prd,design,tasks,implementation,convergence}.*`、`templates/default-workspace/standards/sdd/change-lifecycle.md`（`request.md`→`requirement.md` 命名对齐）、`cli/openspec/src/commands/change.js`、`cli/openspec/src/lib/{change-prompts,workspace-resolver}.js`、`cli/openspec/src/index.js`（注册 change）、`tests/{change,feature}.spec.js`、`tests/integration.spec.js` 扩展（仅 Change 端到端）、`plans/phase-1.3-sdd-lifecycle-artifact-design.md` |

**不属 Phase 1.3 提交（迁至 Phase 1.4 Skill Framework）**：

- `skills/sdd-*/**`（7 个 Skill 源码，含 sdd-explore 完整实现）
- `core/sdd/{skill-loader,skill-registry,context-assembler,instruction-builder,fs-walker}.js`
- `cli/openspec/src/commands/skill.js` 与 `cli/openspec/src/index.js` 注册 `skill` 子命令组
- `tests/skill.spec.js`
- `package.json` files 字段添加 `"skills"`

提交同属 `feat/phase-1.3-sdd-lifecycle` 分支。

---

# 15. 测试要求

## 15.1 工具

沿用 Phase 1.2：Node 原生 `node --test` + `assert/strict` + `mkdtemp` 临时目录 + `rmrf`。`package.json scripts.test` 已通配 `tests/*.spec.js`，新文件自动纳入。

## 15.2 Unit Test — `tests/change.spec.js`

| 测试点                                   | 断言                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ChangeIdGenerator                        | 空 workspace → CHG-0001；已有 CHG-0003 → CHG-0004；archive+changes 跨目录取最大+1                                   |
| ChangeStateMachine                       | created→exploring ok；created→designed 报错；archived→任意 报错；from===to 报错                                     |
| ChangeModel.writeMetadata                | 写入后 parse 回读字段一致；模板注释保留                                                                             |
| ChangeModel.runChangeCreate              | 产出 CHG-0001 目录 + metadata.yaml(status:created) + evidence/（不预创建 requirement/exploration/prd/design/tasks） |
| ChangeRepository.listChanges             | 3 个 CHG 按更新倒序；`--status` 过滤                                                                                |
| ChangeRepository.findChangeByRequirement | REQ-XXX 命中 changes/ 内 CHG 返回候选；title 命中（忽略大小写/空白）返回候选；无匹配返回空数组；不扫 archive        |
| ChangeModel.runChangeCreate 复用决策     | 用户提供 REQ-XXX 且 archive 有匹配 → metadata.related-change 写入历史 CHG；无匹配 → related-change 留空             |
| ChangeArchiver                           | completed CHG archive 后 changes/ 无、archive/ 有、status=archived；非 completed 抛错                               |
| RequirementModel                         | parseRequirement 解析 REQ-XXX 字段；requirementId(name) 生成稳定 id                                                 |

## 15.3 Unit Test — `tests/feature.spec.js`

| 测试点                       | 断言                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| FeatureModel.readFeatureTree | 解析 `product/feature-tree.yaml` 返回树结构；空文件返回空树；yaml 注释保留 |
| FeatureModel.findFeature     | 按 id 命中节点；按 name 模糊命中（忽略大小写/空白）；未命中返回 null       |
| FeatureModel.featurePath     | 返回节点在树中的层级路径（如 `商品中心 / 智能推荐`）；根节点返回单层       |

注：`writeCandidate`（未命中时写 `product/features/<candidate-id>.md` pending 文件）属 Phase 1.4 sdd-explore 实现，不在 Phase 1.3 FeatureModel 范围。

## 15.4 Integration Test — `tests/integration.spec.js` 扩展

端到端（仅 Change 生命周期，不含 Skill 执行；Skill 端到端属 Phase 1.4）：

```
runInit(greenfield+single)
  → runChangeCreate 建 CHG-0001 → 断言目录与 metadata
  → runChangeCreate 连续 3 次 → CHG-0001/0002/0003 递增
  → validateTransition + patchStatus 推进 created→exploring→specified → 断言状态与 updated-at
  → archive 一个 completed CHG → 断言迁移
  → findChangeByRequirement(workspaceRoot, { requirement:'REQ-001' }) 命中候选 → 断言返回清单
  → runChangeCreate 复用 archive 命中 → 断言 metadata.related-change 写入
```

`tests/skill.spec.js` 不在本阶段创建（属 Phase 1.4）。

---

# 16. 错误处理

## 16.1 不在 workspace 内

`resolveWorkspaceRoot()` 找不到 `.sdd/`：

```
Not an OpenSpec Workspace (no .sdd/ found). Run 'openspec init' first.
```

退出码 1。change/skill 命令统一前置检查。

## 16.2 Change 不存在

```
Change not found: CHG-0009
```

## 16.3 非法状态迁移

```
Illegal transition: created → designed. Legal next: exploring.
```

## 16.4 archive 非 completed

```
Cannot archive: status is exploring. Only completed can be archived.
```

## 16.5 metadata 缺失/损坏

`change show/status/archive` 读 metadata 时缺失或 yaml 解析失败：

```
Change metadata corrupted: CHG-0001/metadata.yaml (parse error or missing).
```

退出码 1。`list` 跳过损坏目录并在末尾汇总（"X skipped due to corruption"），避免单条脏数据阻塞整张表；`show/status/archive` 直接报错退出。

## 16.6 交互取消

@clack 取消 → `error` + `outro('Canceled.')` + `process.exit(1)`，沿用 init.js 模式。

---

# 17. 验收标准

Phase 1.3 完成后必须支持：

1. `ChangeModel.runChangeCreate(workspaceRoot, { title, requirement, repositories })` 纯函数创建 `CHG-0001` 载体（产出 metadata.yaml + evidence/，不预创建 requirement/exploration/prd/design/tasks）；
2. `openspec change list/show/status/archive` 管理操作完整可用，瘦编排范本与 init.js 对齐；
3. `openspec change status` 9 态线性流转（created→...→archived），跳阶段报错且退出码 1；
4. `openspec change status CHG-XXXX --set <state>` 推进成功后 metadata.`updated-at` 自动更新；
5. `openspec change archive <CHG-XXXX>` 仅在 status=completed 时通过，迁移至 `delivery/archive/<id>/`；
6. `ChangeRepository.findChangeByRequirement` 在 changes/ 内按 REQ-XXX/title 命中候选；archived 不扫，仅由 `runChangeCreate` 写 `related-change`；
7. `FeatureModel` 读写 `product/feature-tree.yaml` 保留注释；未命中时写 candidate 不污染主树；
8. CHG-XXXX 编号跨 changes + archive 自增不重复；
9. `templates/artifacts/{metadata,requirement,exploration,prd,design,tasks,implementation,convergence}.*` 模板齐备；
10. `templates/default-workspace/standards/sdd/change-lifecycle.md` 与设计对齐（`request.md`→`requirement.md` 命名对齐）；
11. `node --test tests/*.spec.js` 全绿（含 change.spec.js 与 feature.spec.js；不含 skill.spec.js，属 Phase 1.4）；
12. Phase 1.3 提交不含 `skills/` 源码、不含 `skill` 命令、不修改 package.json files 加入 `"skills"`。

**不验收（属 Phase 1.4）**：sdd-explore 入口可演示、`openspec skill list/show/run`、Skill 执行框架、sdd-prd/sdd-design/... 等 7 个 Skill 的实现。

---

# 18. 后续阶段

## 18.1 Phase 1.4：SDD Skill Framework

实现 7 个 sdd-\* Skill 与执行框架：

- 仓根 `skills/sdd-{explore,prd,design,task,dev,test,converge}/`（SKILL.md / checklist.md / rules.md / templates/ / skill.yaml）
- `core/sdd/` 的 SkillLoader / SkillRegistry / ContextAssembler（消费 `.sdd/context-rules.yaml`）/ InstructionBuilder（输出 instruction，不调模型）/ fs-walker
- `cli/openspec/src/commands/skill.js` 与 `openspec skill list/show/run` 命令
- sdd-explore 完整可演示：create → run sdd-explore → 产出 requirement.md + exploration.md + 推进 exploring（含 §8.6 旧需求沿用策略的 @clack 交互）
- 其余 6 个 Skill 接口骨架（sdd-prd ~ sdd-converge）
- `package.json` files 加入 `"skills"`

Skill 不调模型，v0.1 由外部 Agent（Trae/Cursor/Claude Code）按 instruction 执行，产出写回 CHG 目录，再用 `openspec change status --set <produces-state>` 推进状态。

## 18.2 Phase 1.5：Workflow Engine

组合 Skill 执行完整 SDD 流程：Workflow YAML 定义阶段编排，自动推进 Change 状态，串联 explore → converge。

## 18.3 Agent Runtime / LLM / Prompt Engine

后续阶段实现模型调用与对话管理，使 Skill 可由 Harness 自身驱动（v0.1 由外部 Agent 驱动）。

## 18.4 其余命令

`openspec requirement` / `openspec doctor` / `openspec validate` / `openspec reverse` 后续补全。

## 18.5 Skill 内容深化

7 个 Skill 的 SKILL.md/checklist/rules 随各阶段真实用例深化（v0.1 仅 sdd-explore 完整，其余为接口骨架）。

---

# 总结

Phase 1.3 = SDD Lifecycle & Artifact Model（Domain Model Design）：

```
Requirement Model     需求输入模型（REQ-XXX / requirement.md）
    +
Feature Model         Feature Tree 数据模型（product/feature-tree.yaml）
    +
Change Model          生命周期载体（CHG 容器 + metadata + 状态 + artifact 关联）
    +
Artifact Model       各阶段产物（requirement/exploration/prd/design/tasks/evidence）
    +
Lifecycle State      与 Skill 阶段对齐的状态流转（created→...→archived）
    +
Skill Contract       7 个 SDD Skill 的接口契约（id/stage/input/output/requires-state/produces-state）
```

不实现：Skill Runtime、Workflow Runtime、Agent Runtime。

最终架构：

```
Requirement
    ↓
sdd-explore  →  CHG-001（生命周期载体）
    ↓
sdd-prd  →  prd.md
    ↓
sdd-design  →  design.md
    ↓
sdd-task  →  tasks.md
    ↓
sdd-dev  →  implementation.md
    ↓
sdd-test  →  evidence/
    ↓
sdd-converge  →  convergence.md + archive
```

Change 与 Skill 不是两套平行体系，而是 SDD 生命周期的载体与阶段执行能力：Change 承载整个生命周期，Skill 在 Change Context 中依次驱动各阶段。Phase 1.3 建立这一统一领域模型与产物契约，为 Phase 1.4 Skill Framework（实现 7 个 Skill 与执行框架）与 Phase 1.5 Workflow Engine（组合 Skill 执行）奠基。
