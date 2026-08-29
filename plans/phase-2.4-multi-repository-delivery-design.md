# Phase 2.4 设计：Multi-Repository Delivery Architecture

> 版本：v1.0 Draft（待评审）
> 日期：2026-08-28
> 定位：Phase 2 Architecture Evolution——Phase 1 为 Single/Basic Repository Model，本设计演进为 Multi-Repository Delivery Model
> 编号说明：plans/ 已占用 2.1/2.2/2.3，本次演进取 2.4（总提示词建议 2.0，但时序上 2.1-2.3 已完成，取顺延编号避免阅读混乱）
> 方法：基于 docs/新增.md 总提示词 43 条要求，先全仓扫描（plans/1.1-1.5、standards/sdd/×3、templates/artifacts/×7、skills/×7、core/sdd/×5、.sdd/×2）完成 Consistency Analysis，再增量演进设计。不编码。
> 上游硬约束延续：Transition Service 唯一推进入口 / Machine Gate 仅确定性验证 / 不引入 Agent Runtime / Feature Tree 唯一权威源在 product/feature-tree.yaml

---

## 1. 背景与问题

Phase 1 建立的 Workspace 模型面向单仓/基础多仓场景：

- Change 平铺于 `delivery/changes/CHG-XXXX/`，与 Feature Tree 仅靠 metadata `features: []` 弱关联（[change-model.js](../core/sdd/change-model.js)）
- `implementation/` 是普通目录，repositories.yaml 仅做 id+path 登记，无 Git 边界定义
- task 拆解产物（tasks.md）停在 Workspace，dev/test 产物（implementation.md、evidence/）也全部落在 Workspace CHG 根，没有"实施下沉到代码仓"的机制
- 无跨仓交付单元概念，sdd-dev 隐式面对"一个 CHG 改多个仓"，无法追踪哪个仓改了什么、证据在哪

当需求涉及 backend/frontend/ai 多仓时，上述模型无法回答：需求落在特性树哪个 Story、每个仓负责哪块交付、各仓实施进度与证据如何汇总、最终交付锁定哪些 Commit。

## 2. 目标 / 非目标

### 目标

1. 两级 Delivery：Workspace Delivery（需求/跨仓协调）+ Repository Delivery（仓内实施）
2. Git Submodule 多仓模型：Workspace Git + implementation/* Submodules
3. Change 内保存完整四级 Feature Tree Path（目录 + metadata 双表达）
4. Task 阶段正式产生 Delivery Unit（DU），Task 是 Workspace 向 Repository 分解的唯一边界
5. Dev/Test 显式绑定 DU，实施证据归属 Repository Delivery
6. 跨仓 Evidence / Review / Converge 全链路 Traceability（至 Commit 与 Submodule Pointer）

### 非目标

- 不引入第二套 Workspace 状态机（9 态生命周期不变）
- 不引入 Agent Runtime（Workflow 仍为协调器：Prepare/Detect/Gate/Transition/Pause/Resume/Aggregate）
- 不让 Repository 复制完整 SDD 生命周期（repo 无 explore/prd/design/converge）
- 不自动执行 git remote/push/submodule add（均需用户显式行为）
- 不复制 Workspace PRD/Design 到 Repository（Reference, do not duplicate）
- 本阶段不实现全部 Doctor 检查项（仅设计）

## 3. Consistency Report（与既有设计的冲突与关系）

### 3.1 与 Phase 1.1 Workspace Template

| 项 | 结论 |
|----|------|
| 四世界模型 | **兼容**。implementation/ 职责不变，新增"Submodule 挂载点"属性（greenfield 初始仍可为普通目录，显式转 submodule） |
| repositories.yaml | **保留并强化**。它是唯一 OpenSpec Repository Registry（id 解析/Context Loading/Impact/DU Ownership/Evidence Attribution/Review 聚合/Workflow Routing）；`.gitmodules` 是另一维度（Git 映射），二者职责分离、路径需一致（Doctor 校验项）。**不形成两套 Registry** |
| init 流程 | **扩展**。新增 Submodule 检测/注册/显式创建分支（见 §6.3） |

### 3.2 与 Phase 1.3 Lifecycle & Artifact

| 项 | 结论 |
|----|------|
| CHG 平铺模型 | **确认保留**。`delivery/changes/CHG-XXXX/` 是最外层 Delivery 容器——Feature Path 在 CHG **内部**组织，不是 CHG 挂在树下（此点修正了此前 phase-2.4-story-delivery 草案，该草案废止） |
| 9 态状态机 | **不变**。created→…→archived 线性迁移，developing/testing 的进入条件增加 DU 聚合前置（经 Machine Gate 实现，非新状态机） |
| artifact 归属 | **调整**（本文档核心变更之一）：requirement/exploration/prd/design 留 CHG 根；tasks.md 下沉 STORY 目录；implementation.md/evidence 正文下沉 Repository DU；Workspace 保留聚合视图 artifact（语义变为跨仓汇总，文件名不变以保 workflow state-map 稳定） |
| metadata schema | **升级 v2**。新增 `schema-version`、`feature-path`（四级完整链）、`repository-baseline/result`；`features` 扁平列表保留为冗余索引 |

### 3.3 与 Phase 1.4 Skill Framework

| Skill | 结论 |
|-------|------|
| sdd-explore | **职责升级**：Requirement→Story 全路径匹配（L1→L2→L3→Story），允许产出 Candidate（受知识治理约束，Human Gate 审批晋升，不静默改树） |
| sdd-prd | 不变（CHG 根） |
| sdd-design | **职责明确化**：System Design + Repository Impact + Cross-Repository Contract；**禁止创建 DU**。design.md 模板已有"仓库影响"章节（repo-impact-count/summary），需强化为结构化 `affected repositories` 声明 |
| sdd-task | **升级为 Delivery Decomposition Skill**：tasks.md 重定义 Repository Delivery Decomposition Plan；正式创建 DU；gate accepted 后 materialize 到各仓 |
| sdd-dev / sdd-test | **绑定 DU**：一个 Invocation 对应一个 DU，产物落 repo 侧 DU 目录；Workspace 级 implementation.md/test-report 变为跨仓聚合 |
| sdd-review | **跨仓化**：输入扩展（repo 侧 DU/implementation/evidence/commits + submodule baseline/result），检查项新增 DU Coverage/Implementation Consistency/Cross-Repository Integration |
| sdd-converge | **保持 Workspace 层**：聚合 repo results、记录 submodule 最终版本、归档锁 pointer |

### 3.4 与 Phase 1.5 Workflow Engine

- **兼容为主**：Transition Service 仍是唯一推进入口；stage/state-map 表结构不变
- **新增 Fan-out/Fan-in 语义**：developing/testing 的 transition 前置从"单 artifact gate"扩展为"artifact gate + DU 聚合状态 gate"（新增确定性检查项 `du-coverage`、`du-fan-in-complete`，见 §17）
- **artifact 路径解析演进**：state-map 中 `artifact: tasks.md` 等相对路径，解析时按 metadata `feature-path` 物化为 STORY 目录下路径（feature-path 未绑定则 task/dev/test 阶段无法执行——由前序 gate 保证）
- **不违反硬约束**：DU 状态是轻量记录字段，不是 Lifecycle State；其更新不经过 Transition Service，但 Workspace CHG 状态推进仍然唯一走 Transition Service

### 3.5 与 Phase 2.1 Evidence

- 已实施部分**高度可复用**：evidence.yaml（version/change-id/items）、code-change 类型已含 `repo/commit/task/reason/files` 且经 repositories.yaml 白名单校验
- **需扩展**：code-change 增加 `symbol`、`delivery-unit` 字段；新增 DU 侧 evidence 文件归属规则（正文在 repo，Workspace 聚合 reference）；新增 submodule baseline/result 记录（CHG metadata 聚合 + DU metadata 单仓记录）
- 结论：**增量演进，不重构**

### 3.6 与 Phase 2.2 Review

- 同态检查点机制（requestCheckpoint，testing→testing）**保留**
- review-report.md 增加 section：DU Coverage、Implementation Consistency、Cross-Repository Integration、Evidence Completeness、Git Traceability
- review 前置增加 `du-fan-in-complete`（所有必要 DU completed）

### 3.7 概念冲突专项裁定

| 问题 | 裁定 |
|------|------|
| 两套 Feature Model？ | **存在，需演进**。现状：Product→Module→Feature→Story（子节点 3 层，ID 前缀 MOD-/FEAT-/STORY- 独立编号，见 [feature-model.js](../core/sdd/feature-model.js) nodeLevel()）。本设计：Product 根 + L1→L2→L3→Story（子节点 4 层，ID 层级嵌套编码 FEAT-001/FEAT-001-02/FEAT-001-02-03/STORY-001-02-03-01）。演进方案见 §8.4 |
| Story vs DU 概念冲突？ | **无冲突，明确区分**：Story = Feature Tree 最小**产品能力**节点（产品语义，树内唯一权威源）；DU = Change 在一个 Repository 中的**实现交付**单元（交付语义）。禁止把 DU 叫 Story |
| 两套 Repository Registry？ | **不会**（见 3.1） |
| Workspace/Repository Artifact 重复？ | **硬约束禁止**。Workspace DU 只存 Reference/Summary/Status（§13）；repo 侧不复制 PRD/Design（§14） |
| 状态推进绕过 Transition Service？ | **不会**。DU 轻量状态非 Lifecycle State（见 3.4） |
| 应作为 Phase 2 演进而非修改 Phase 1 历史文件？ | **是**。Phase 1 设计文档只读；本设计成为演进权威，需同步的既有文档清单见 §26.4 |

## 4. 总体架构

```
Workspace Delivery                          Repository Delivery
（需求/产品/跨仓协调/知识）                  （仓内实施/证据/Commit）
┌────────────────────────────┐             ┌──────────────────────────┐
│ Requirement → Explore      │             │ DU → Dev → Test          │
│ → PRD → System Design      │   Task      │ → Implementation Evidence│
│ → Task Decomposition       │  ────────▶  │ → Commit                 │
│ → Evidence Aggregate       │  Fan-out    │                          │
│ → Review → Converge        │  ◀────────  │ Fan-in（状态+证据引用）    │
│ → Archive                  │             └──────────────────────────┘
└────────────────────────────┘
        ▲ Task 阶段是分解边界：Design 声明影响面，Task 正式拆 DU
```

核心模型链（本设计的"一句话架构"）：

```
Requirement → Change → Feature Path → Story → 1:N Delivery Unit → 1:1 Repository → Dev/Test → Evidence → Commit → Submodule Pointer
```

## 5. Git Submodule Model

### 5.1 Git 拓扑

```
workspace/ （Workspace Git Repository）
├── .git/
├── .gitmodules
├── .sdd/  standards/  product/  delivery/  skills/  prompts/
└── implementation/
    ├── backend/    Git Submodule（.git 为指向父仓 .git/modules/backend 的文件）
    ├── frontend/   Git Submodule
    └── ai/         Git Submodule
```

- Workspace Git 管理：Workspace 知识、Delivery、`.gitmodules`、各 Submodule 的 Commit Pointer
- Workspace Git **不管理**：各 Submodule 内部分支/Commit/PR 历史
- 每个 Submodule：独立 Repo/Branch/Commit/PR/Repository Delivery
- **注意**：Submodule 工作树中 `.git` 通常是**文件**（gitdir 指针）而非目录；实现探测时不得假设其为目录

### 5.2 职责分离（硬约束）

```
.gitmodules               = Git Repository Mapping（remote URL / local path / commit pointer）
.sdd/repositories.yaml    = OpenSpec Repository Registry（见 §6）
```

Git Submodule **不替代** Registry；Doctor 校验二者 path 一致（§7.3）。

### 5.3 init 与 Git 边界（不猜 Remote）

| 场景 | 行为 |
|------|------|
| 检测到 Existing Submodule | 读取 `.gitmodules` → 自动注册进 repositories.yaml |
| 检测到 Existing Local Git Repo（非 submodule） | 提示用户显式选择：转为 submodule（需 URL）/ 保持普通目录注册 |
| New Submodule | 仅当用户显式提供 `id + git url + target path` 后执行 `git submodule add`；OpenSpec 不猜 URL |
| greenfield 且无 remote | `implementation/<repo>/` 保持普通目录 + repositories.yaml 注册（Phase 1 行为），文档说明后续显式转 submodule 的路径 |
| Workspace 根 git init | brownfield 目录可能已有 git——init 只检测并提示，不自动执行 |

`git remote` / `git push` / `git submodule add` 一律为明确用户行为；CLI 可封装向导但必须用户确认参数。

## 6. Repository Registry Model

repositories.yaml schema v2（向后兼容 v1）：

```yaml
schema-version: 2
mode: multi            # single / multi
repositories:
  - id: backend
    path: implementation/backend
    git:
      submodule: true          # 是否已 submodule 化（探测写入）
      # remote/url 等 Git 事实一律以 .gitmodules 为准，此处不重复维护
```

Registry 承担：Repository ID 解析 / Context Loading / Repository Impact / **Delivery Unit Ownership** / Evidence Attribution / Review Aggregation / Workflow Routing。

## 7. Change Model

### 7.1 目录与归属

```
delivery/changes/CHG-0001/
├── metadata.yaml          # schema v2
├── requirement.md         # Change-level（Workspace/跨仓知识）
├── exploration.md         # Change-level
├── prd.md                 # Change-level
├── design.md              # Change-level（含 Repository Impact + Cross-Repo Contract）
│
└── FEAT-001/…/STORY-001-02-03-01/    # Feature Tree Path（见 §8/§13）
```

- CHG 是一次完整需求变更的**第一追踪 ID**，最外层 Delivery 容器，平铺不挂树
- Change-level artifacts 的判定依据：这些阶段发生在 Workspace/跨仓层，不是某个仓的局部知识

### 7.2 metadata.yaml schema v2（增量）

```yaml
schema-version: 2
id: CHG-0001
title: ...
status: tasked
requirement: REQ-xxx
# —— 新增段 ——
feature-path:               # 完整四级链（权威字段；目录物化是其投影）
  level-1: { id: FEAT-001, name: 用户中心 }
  level-2: { id: FEAT-001-02, name: 账户能力 }
  level-3: { id: FEAT-001-02-03, name: 用户认证 }
  story: { id: STORY-001-02-03-01, name: 用户注册 }
  candidate: false          # explore 产出 Candidate 且未晋升时为 true
repository-baseline:        # DU materialize 时记录（可由 du sync-status 刷新）
  backend: { commit: abc111 }
repository-result:          # DU completed 时记录
  backend: { commit: abc999 }
# —— 保留段 ——
features: [...]             # 扁平冗余索引（兼容旧读者，v2 起由 feature-path 推导）
repositories: [backend, frontend, ai]
artifacts: {...}            # Gate Result 持久化（Phase 1.5 机制不变）
```

- Feature 归属双表达：**Directory Path + metadata.feature-path**，二者一致性属 Doctor 检查项
- `product/feature-tree.yaml` 仍是唯一权威源；Delivery 不维护第二套树（feature-path 是"引用"不是"副本"——树节点改名时 CHG metadata 的 name 允许滞后，以 id 为准）

### 7.3 Doctor / Validation 检查项（本阶段设计）

repositories.yaml ID 唯一 / path 唯一且位于 implementation/ 下 / `.gitmodules` path 一致 / Submodule 已初始化且 HEAD 存在 / Submodule dirty 检测 / Workspace Pointer 与 HEAD 对齐 / DU repository ∈ Registry / feature-path 与 feature-tree.yaml 一致 / 目录路径与 metadata.feature-path 一致。

## 8. Feature Path Model

### 8.1 固定四级

```
Level 1        Level 2           Level 3              Story
FEAT-001   →   FEAT-001-02   →   FEAT-001-02-03   →   STORY-001-02-03-01
用户中心        账户能力            用户认证              用户注册
```

- 目录段一律用稳定 ID，禁止用名称（名称可变，ID 稳定）
- Story 是 Feature Tree 最小产品能力节点

### 8.2 feature-tree.yaml Schema v2

```yaml
product: { name: ..., description: ... }
features:                       # L1 数组
  - id: FEAT-001
    name: 用户中心
    children:                   # L2
      - id: FEAT-001-02
        name: 账户能力
        children:               # L3
          - id: FEAT-001-02-03
            name: 用户认证
            stories:
              - id: STORY-001-02-03-01
                name: 用户注册
                status: planned  # planned / in-progress / delivered
```

### 8.3 Story 状态与 DU 联动（规范，不强制实现）

`story.status = delivered` 的充分条件：该 Story 下全部 DU completed 且所属 CHG completed。作为 converge 阶段的可选自动回写项。

### 8.4 与现状（Schema v1）的演进与兼容

| 维度 | v1 现状 | v2 本设计 |
|------|---------|-----------|
| 子节点层级 | 3 层（modules→features→stories） | 4 层（features→children→children→stories） |
| ID 编码 | MOD-x / FEAT-x / STORY-x 独立编号 | 层级嵌套（FEAT-001-02-03 / STORY-001-02-03-01） |
| 层级判定 | nodeLevel() 按前缀 | 按 ID 段数 + 结构位置双重判定 |

兼容规则：

1. **读取兼容**：feature-model v2 读到 v1 树（含 `modules` 键）时按映射转换视图——module→L1、feature→L2、story 直挂 L2.stories（L3 缺省）；nodeLevel() 识别旧前缀
2. **写入**：统一走 v2；`sdd-feature-tree` 升级后新建节点用嵌套编码；存量节点 ID 不改写（ID 稳定原则），迁移工具可选（§25）
3. CHG v1 metadata（仅 `features` 扁平表）读取时视为"未绑定完整路径"，需要 feature-path 的操作（task/dev/test）提示先补绑（`openspec change bind-feature-path`）

## 9. Story Model

- Story = 最小产品能力节点，Feature Tree 唯一权威源内定义
- CHG ↔ Story = **1:1**（一个 CHG 归属一个最小 Story；跨 Story 大需求拆多个 CHG）——保证 §13 目录结构确定性
- Story 1:N DU（DU 在 §10 定义）
- Story 不承载实施记录；实施痕迹全部在 DU（repo 侧）

## 10. Delivery Unit Model

### 10.1 定义

> Delivery Unit（DU）是一个 Workspace Change 在一个具体 Repository 中的实现交付单元。

```
Story ──1:N──▶ Delivery Unit ──1:1──▶ Repository
```

### 10.2 硬约束

1. Change 1:N DU；DU 1:1 Repository（跨仓交付必须拆成多个 DU）
2. DU 创建时机 = **sdd-task**（Design 阶段禁止创建，见 §11）
3. DU ID 规范：`DU-<REPO-别名>-<nnn>`（如 DU-BE-001 / DU-FE-001 / DU-AI-001），REPO 别名注册于 repositories.yaml（可加 `alias` 字段；缺省取 id 前 2-4 字符大写），Workspace 内唯一
4. Task Gate accepted 后才 materialize 到 Repository（提前创建 repo 侧目录属违规）

### 10.3 Workspace DU（协调记录）metadata

```yaml
id: DU-BE-001
repository: backend
parent: { change: CHG-0001 }
feature-path: { level-1: {...}, level-2: {...}, level-3: {...}, story: {...} }
scope: [user-domain, registration-api]
dependencies: []                # DU-BE-001 /DU-FE-001...
acceptance: [...]               # 验收标准条目
repository-delivery:            # 指向 repo 侧（Reference，不复制正文）
  path: implementation/backend/delivery/CHG-0001/.../DU-BE-001
status: developing              # 轻量状态（§16）
evidence-ref: [...]             # repo 侧 evidence 条目引用
baseline: { commit: abc111 }
result: { commit: abc999 }
```

Workspace DU **不保存** implementation.md 正文 / evidence 正文 / commit log 正文——只存 Reference/Summary/Status。

## 11. Design Stage Responsibility（硬约束）

Design 负责：System Technical Design + Repository Impact + Cross-Repository Contract。

design.md 必须记录（结构化 front-matter + 正文）：

- `affected-repositories: [backend, frontend, ai]`（front-matter，供 du-coverage 机检）
- 每仓技术职责（Repository Impact section——模板已有，强化为分仓小节）
- API / Event / Data Contract、Repository Dependencies、Integration Boundary、Migration Impact、Cross-Repository Sequence

Design **不得产生** DU（DU-XXX 编号不得出现在 design.md）：

> Design 回答"系统如何实现、哪些仓受影响、跨仓如何协作"；Task 才回答"正式拆成哪些交付单元"。

## 12. Task Stage Delivery Decomposition

### 12.1 sdd-task 升级为 Delivery Decomposition Skill

输入：prd.md + design.md + repositories.yaml + feature-path + story。
执行：System Design → Repository Impact Analysis → Delivery Decomposition → Delivery Units。

### 12.2 tasks.md 重定义：Repository Delivery Decomposition Plan

不再只是 checkbox 清单，每个 DU 至少描述：ID / Repository / Goal / Scope / Design References / Dependencies / Acceptance Criteria / Execution Order / Parallelization（结构沿用总提示词 §十四示例格式）。

### 12.3 物化时序

```
tasks.md draft → task machine gate（含 du-coverage）→ human approve
      → Transition: designed → tasked
      → materialize：CHG 内 STORY 目录 + tasks.md + DU 协调目录（Workspace 侧）
                   + 各仓 delivery/.../DU-XXX/（Repository 侧，仅自己的 DU）
```

## 13. Workspace Delivery（全局协调视图）

```
delivery/changes/CHG-0001/
├── metadata.yaml / requirement.md / exploration.md / prd.md / design.md
└── FEAT-001/FEAT-001-02/FEAT-001-02-03/STORY-001-02-03-01/
    ├── tasks.md                 # Decomposition Plan（第一个 STORY 级 artifact）
    ├── DU-BE-001/metadata.yaml  # 协调记录（§10.3）
    ├── DU-FE-001/metadata.yaml
    └── DU-AI-001/metadata.yaml
```

- Workspace 保存**全部 DU** 的全局协调视图（含跨仓依赖）
- STORY 目录物化时机 = task 阶段（此前 requirement/prd/design 都在 CHG 根，无需 STORY 目录存在；Candidate 未晋升的 CHG 无法进入 task，见 §17 gate 链）

## 14. Repository Delivery

### 14.1 结构（完整父路径，不扁平）

```
implementation/backend/delivery/CHG-0001/FEAT-001/FEAT-001-02/FEAT-001-02-03/STORY-001-02-03-01/DU-BE-001/
├── metadata.yaml
├── task.md            # DU 级任务细化（Agent 填写）
├── implementation.md  # DU 级实施记录
└── evidence/          # DU 级证据正文
```

- repo 只 materialize **属于自己的 DU**（backend 不出现 DU-FE-001）
- repo 内 delivery 使用与 Workspace 相同的完整父路径（CHG→L1→L2→L3→Story→DU），单仓打开仍可追溯
- **不复制** Workspace PRD/Design（Reference do not duplicate）；唯一事实源在 Workspace

### 14.2 Repository DU metadata（完整 Parent Chain）

```yaml
id: DU-BE-001
repository: backend
parent: { change: CHG-0001 }
feature-path: { level-1: {...}, level-2: {...}, level-3: {...}, story: {...} }  # 至少含 id
workspace-source:              # workspace 相对引用（不复制正文）
  requirement: delivery/changes/CHG-0001/requirement.md
  prd: delivery/changes/CHG-0001/prd.md
  design: delivery/changes/CHG-0001/design.md
  tasks: delivery/changes/CHG-0001/.../STORY-.../tasks.md
scope: [user-domain, registration-api]
status: developing
baseline: { commit: abc111 }
result: { commit: abc999 }
```

即使 repo 被单独打开，也能追溯 DU→Story→Feature Path→Change。

## 15. Artifact Ownership（总表）

| Artifact | 位置 | 归属 | 说明 |
|----------|------|------|------|
| requirement/exploration/prd/design | CHG 根 | Workspace | Change-level，跨仓知识 |
| tasks.md | CHG/…/STORY/ | Workspace（STORY 级） | Decomposition Plan |
| DU metadata（协调） | CHG/…/STORY/DU-*/ | Workspace | Reference/Status |
| DU metadata（实施） | repo/delivery/…/DU-*/ | Repository | 完整 Parent Chain |
| task.md / implementation.md / evidence 正文 | repo/delivery/…/DU-*/ | Repository | 实施产物 |
| implementation.md（Workspace 根级） | CHG 根 | Workspace | **语义变更**：跨仓实施汇总（引用各 DU implementation.md + baseline/result），不再承载实施正文 |
| evidence/test-report.md（Workspace 级） | CHG/evidence/ | Workspace | 跨仓测试聚合（引用 repo 侧 evidence） |
| review-report.md / convergence.md | CHG 根 | Workspace | 不变 |
| delivery/reports/ delivery/archive/ | Workspace | Workspace | converge 沉淀，不变 |

## 16. Repository Delivery Lifecycle（轻量）

```
pending → developing → testing → completed
```

- 不复制 Workspace 9 态；无 explore/prd/design/converge
- 状态是 DU metadata 的记录字段（Agent 依据工作进展更新），**不是状态机、不经过 Transition Service**——Workspace 9 态唯一走 Transition Service 的约束不受影响
- v0.5 取最小四态（不引入 created/ready 中间态；materialize 即 pending）
- 聚合语义：`developing` = 存在未完成 DU；`testing`（Workspace）= 所有 DU repo 侧 ≥ testing；Fan-in Complete = 所有必要 DU completed

## 17. Workflow Fan-out / Fan-in 与 Gate Impact

### 17.1 Workflow 模型（仍是协调器）

```
Explore → PRD → Design → Task
        → DU Fan-out（materialize）
        ├── DU-BE → Dev → Test（repo 侧）
        ├── DU-FE → Dev → Test
        └── DU-AI → Dev → Test
        → Fan-in（状态/证据引用聚合）
        → Evidence Aggregate → Review → Converge → Archive
```

Prepare / Detect / Gate / Transition / Pause / Resume / Aggregate 职责不变，不执行 AI 推理。

### 17.2 状态衔接（Task accepted 后）

| Workspace 状态 | 进入条件（确定性，Machine Gate 落地） |
|----------------|--------------------------------------|
| tasked | 现有 task gate + `du-coverage` 通过 |
| developing | DU materialize 完成（存在 pending/developing DU 即保持 developing） |
| testing | `du-fan-in-testing`：所有 DU repo 侧 status ≥ testing + workspace 聚合 test-report gate |
| review（同态检查点） | `du-fan-in-complete`：所有必要 DU completed |
| completed | 现有 converge gate + `submodule-pointer-aligned`（repository-result 与 Workspace Submodule Pointer 一致） |

不因 DU 引入第二套 Workspace 状态机。

### 17.3 新增 Machine Gate 检查项（确定性规则）

| 检查项 | 挂靠 gate | 规则 |
|--------|-----------|------|
| `feature-path-bound` | design（specified→designed） | metadata.feature-path 四级完整且 candidate=false（Candidate 须经 Human Gate 晋升并回填） |
| `du-coverage` | task | design.affected-repositories ⊆ DU 覆盖仓集合；每个 DU repository ∈ repositories.yaml；DU 1:1 仓；DU ID 不重复；有 scope 与 acceptance；dependencies 引用有效 |
| `du-materialized` | dev（tasked→developing） | Workspace 全部 DU 已 materialize（repo 侧目录存在） |
| `du-fan-in-testing` | test（developing→testing） | 所有 DU status ≥ testing |
| `du-fan-in-complete` | review（checkpoint 前置） | 所有必要 DU completed |
| `submodule-pointer-aligned` | converge | repository-result commit == Workspace 记录的 Submodule HEAD |

实现挂靠点：gate-validator.js 检查项注册表（现有 7 项机制直接复用）。

### 17.4 Candidate Feature 治理（与 sdd-explore 联动）

- explore 匹配不到完整路径 → 产出 Candidate Feature/Story（仅记录于 exploration.md/metadata.candidate，**不写 feature-tree.yaml**）
- explore Human Gate 审批时确认晋升：approve 后 Agent 调 `sdd-feature-tree` 正式写入树 + 回填 CHG `feature-path.candidate: false`
- 不允许静默覆盖 Current Feature Tree；晋升遵守 knowledge-management.md 的审批治理

## 18. Dev / Test Scope（硬约束）

- `sdd-dev` 必须绑定 DU：Invocation Context 显式携带 delivery-unit（概念上 `sdd-dev --delivery-unit DU-BE-001`）；一个 Dev Invocation 对应一个明确 DU；不得隐式跨仓
- `sdd-test` 同样绑定 DU；测试产物进 repo 侧 DU evidence/；repo Test 不直接生成 Workspace Evidence 正文
- Workspace 级 implementation.md / evidence/test-report.md 仅做聚合（引用 + 状态 + baseline/result 表）
- 未来如支持批量 DU，必须显式声明

## 19. Evidence（多仓原生 + Baseline/Result）

### 19.1 Evidence 条目扩展（在 Phase 2.1 模型上增量）

code-change 类型新增字段：`symbol`、`delivery-unit`。完整字段：

```yaml
- id: EVD-BE-001
  type: code-change
  repository: backend
  delivery-unit: DU-BE-001
  provenance: { commit: abc123, file: src/UserService.java, symbol: register }
  reason: 实现 CHG-0001 用户注册逻辑
```

### 19.2 Baseline / Result

- DU materialize 时记录 baseline commit；DU completed 时记录 result commit（DU metadata + repo 侧 metadata 双写）
- CHG metadata 聚合 `repository-baseline` / `repository-result`
- 最终表达：`backend: abc111 → abc999`；converge 时 `submodule-pointer-aligned` 校验 result == Workspace Submodule Pointer

### 19.3 归属

Repository Evidence 正文属 Repository Delivery；Workspace evidence.yaml 聚合 reference（条目类型 `evidence-ref` 指向 repo 侧路径）。Phase 2.1 的 evidence-coverage 机检输入扩展接受 repo 侧 evidence 路径。

## 20. Git Traceability（可查询链）

```
Requirement → Change → Feature Path → Story → Delivery Unit
            → Repository → Commit → Evidence → Workspace Submodule Pointer
```

由 OpenSpec metadata / evidence 查询得到（`openspec trace CHG-0001` 设计项，见 §22）。`openspec doctor` 保证基础一致性。

## 21. Review（跨仓）与 Converge

### 21.1 sdd-review 输入扩展

- Workspace：requirement/prd/design/tasks
- Repository：DUs、implementation records、evidence、commits
- Git：submodule baseline / result

检查维度：Requirement Consistency / Design Consistency / **Delivery Unit Coverage** / Implementation Consistency / Code Quality / Evidence Completeness / **Cross-Repository Integration** / Knowledge Convergence Readiness。不只看 Workspace Markdown。

### 21.2 sdd-converge（仅 Workspace 层）

- 聚合 Repository Results → Knowledge Classification → standards/ + product/ + delivery/reports/ + delivery/archive/
- 记录 Submodule 最终版本（CHG: baseline→final per repo）
- Workspace 最终 Git Commit 锁定：Workspace Knowledge State + 全部 Submodule Commit Pointers（系统交付快照）
- Change 全量归档、知识择优晋升、Implementation 不复制——原则不变

## 22. CLI Impact（只列影响）

| 命令 | 变更 |
|------|------|
| `init` | Submodule 检测/注册分支（§5.3）；不再自动建 implementation 仓；`.gitmodules` 一致性提示 |
| `change create` | metadata v2；`--feature-path` 或 explore 后补绑 |
| `change bind-feature-path` | 新增：绑定/回填 feature-path（含 candidate 回填） |
| `change list/show` | 输出 feature-path、DU 概览 |
| `du list / du show` | 新增：按 CHG/仓列出 DU 与状态 |
| `du materialize` | 新增：task gate accepted 后物化 STORY 目录 + repo 侧 DU（原子操作） |
| `du sync-status` | 新增：读取各仓 git HEAD/dirty，刷新 DU status/baseline/result 与 CHG 聚合段 |
| `trace` | 新增（可选）：输出 §20 链路 |
| `doctor` | 新增 §7.3 检查项 |
| `gate check / approve`、`change status`、`workflow run` | 路径解析适配（STORY 级 artifact 定位）；行为语义不变 |

## 23. Schema 汇总

- metadata.yaml v2（§7.2）；DU metadata Workspace/repo 两态（§10.3/§14.2）
- feature-tree.yaml v2（§8.2）+ v1 兼容读取
- repositories.yaml v2（§6，git.submodule 标记）
- evidence 条目扩展（§19.1）+ evidence-ref 类型
- design.md front-matter：affected-repositories
- tasks.md：DU decomposition 结构（沿用示例格式）

## 24. Compatibility & Migration Plan

### 24.1 原则

不硬切：v0.1 Workspace 必须始终可读；新行为对新 Change 生效；迁移工具可选、可跳过。

### 24.2 metadata schema version

- 读：`schema-version` 缺失视为 v1，走兼容路径（features 扁平表 → feature-path 未绑定）
- 写：新 Change 一律 v2；旧 Change 仅在被显式操作（bind-feature-path / du materialize）时升级为 v2

### 24.3 分步迁移（Phase 1 Workspace → Phase 2 Multi-Repository Workspace）

| 步骤 | 内容 | 工具 |
|------|------|------|
| M1 | repositories.yaml → v2（git.submodule 探测标记） | `openspec doctor --fix`（可选） |
| M2 | Git：检测 existing repo/submodule，输出采纳建议清单；submodule add 由用户执行 | doctor 报告 |
| M3 | 旧 CHG feature-path 补绑（逐 CHG 或跳过，跳过者仅能执行 read/archive 类操作） | `change bind-feature-path` |
| M4 | Feature Tree v1→v2（可选；不迁移则走兼容读取） | `feature-tree upgrade`（可选） |
| M5 | tasked 之后的旧 CHG：不支持 du materialize（保持 Phase 1 单仓路径走完生命周期，文档标注 legacy） | 无 |
| M6 | Evidence：旧条目补 delivery-unit 可选（缺省 null 不阻断 evidence-coverage，仅告警） | 无 |

### 24.4 Legacy 兼容读

- CHG 平铺无 STORY 目录：task/dev/test 相关 gate 对 v1 CHG 直接给出"需迁移"确定性错误（不静默降级）
- archive 平铺不变；归档 CHG 永不要求迁移

## 25. Implementation Impact（只列影响，不编码）

**新增模块**：core/sdd/delivery-unit.js（DU 纯函数：metadata 读写/物化/状态聚合）、core/sdd/git-submodule.js（探测/pointer 读取，只读 git）、core/sdd/feature-tree-v2.js（或 feature-model.js 内升级）

**修改模块**：change-model.js（metadata v2/baseline/result）、feature-model.js（四层/嵌套 ID/兼容）、workflow-engine.js（STORY 级 artifact 定位 + DU 聚合前置）、transition-service.js（无状态机变化，前置检查走 gate）、gate-validator.js（6 个新检查项）、evidence-model.js（symbol/delivery-unit/evidence-ref）、instruction-builder.js（DU 绑定上下文注入）、copier/init/prompts（init 分支）、cli 各命令（§22）

**Schema Changes**：§23 全部
**Artifact Changes**：design.md（affected-repositories）、tasks.md（decomposition plan）、implementation.md（聚合语义）、review-report.md（跨仓 section）、新增 DU metadata 模板 ×2
**Skill Changes**：sdd-explore（Story 匹配/Candidate）、sdd-design（禁 DU + 结构化 impact）、sdd-task（DU 分解/物化编排）、sdd-dev/sdd-test（DU 绑定 + repo 侧工作方式）、sdd-review（跨仓）、sdd-converge（pointer 锁定）、sdd-feature-tree（v2 编码）
**Workflow Changes**：default.yaml gate 声明挂新检查项；stage 表不变
**CLI Changes**：§22
**Git Changes**：只读探测 + 用户显式 submodule 操作
**Tests**：§26
**Migration Tooling**：doctor --fix（registry v2）、bind-feature-path、feature-tree upgrade（可选）

## 26. Testing（设计要点）

1. feature-tree v2 解析/嵌套 ID 层级判定/v1 兼容视图
2. metadata v2 读写、v1 兼容读取、feature-path 绑定与回填
3. du-coverage：设计声明仓 vs DU 覆盖（缺仓必须 fail）、DU 1:1、ID 重复、scope/acceptance/依赖引用
4. du materialize：Workspace STORY 目录 + 各仓仅自己的 DU + baseline 记录
5. 状态衔接：developing/testing/review/completed 各聚合前置的通过/阻断矩阵
6. evidence 扩展字段校验 + evidence-ref 聚合 + evidence-coverage 兼容
7. submodule 探测（.git 为文件的场景）、pointer 对齐检查、dirty 检测
8. Migration：v1 workspace 全链路读取兼容、M1-M6 步骤幂等
9. 集成：explore 绑定 → design impact → task 分解 → fan-out → repo dev/test → fan-in → review → converge pointer 校验

## 27. Acceptance Criteria

1. 涉及 3 仓的需求可全流程走通：CHG 平铺创建 → feature-path 四级绑定 → design 声明 3 仓 → task 产出 DU-BE/FE/AI-001 且覆盖机检通过 → materialize 后各仓仅见自己的 DU（完整父路径）→ dev/test 绑定 DU 落 repo 侧 evidence → fan-in 后 review/converge 可执行 → repository-result 与 Submodule Pointer 一致
2. 单仓模式同样走通（一个 DU）
3. v0.1 旧 Workspace：读取/归档不报错；对 tasked 前旧 CHG 执行 task 时收到确定性迁移提示
4. Machine Gate 6 个新检查项全部确定性可复现；无 AI 语义评分
5. 所有 Workspace 状态推进仍唯一经 Transition Service；DU 状态更新不触碰 CHG metadata.status
6. git remote/push/submodule add 无任何自动执行路径
7. 全量测试通过（含既有 190 项不回归）

## 28. 硬约束清单（本设计固化）

即总提示词 §四十一 26 条，全部采纳为本文档约束；其中关键实现映射：#23→Transition Service 不变；#24→gate-validator 注册表；#25→无 Agent Runtime；#4/#3→repositories.yaml 与 .gitmodules 职责分离；#15→§14.1 完整父路径；#19→§13 Workspace DU 仅 Reference。

---

## 附：需后续同步的既有文档

- templates/default-workspace/standards/sdd/change-lifecycle.md（补 DU/两级 delivery 章节）
- templates/default-workspace/standards/sdd/skill-execution.md（补 DU 绑定 Invocation 规范）
- docs/complete-usage-guide.md（多仓流程重写）
- workflows/default.yaml（gate 检查项声明）
- prompts/（sdd-task persona 更新为 Delivery Decomposition）
