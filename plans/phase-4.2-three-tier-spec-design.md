# Phase 4.2：三级规格分层设计（Change Spec → Story Spec → DU Spec）

> Version: v1.0（Delivered）  
> Owner: Design Review Required  
> Status: 已交付（2026-09-04，3 Story 全部完成 + 评审决策落地 + 附录 A 提案归档）  
> 前置依赖：Phase 2.4 Multi-Repo Delivery（已落地）、Phase 4.1 三档轻量化（已落地）

---

# 1. 背景与动机

## 1.1 当前问题

当前架构约束 `CHG ↔ Story = 1:1`（`metadata.yaml` `feature-path` 仅允许引用单个 Story），导致：

| 痛点                  | 说明                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **规格粒度错位**      | `prd.md` / `design.md` 同时承担「整个需求规格」和「单 Story 规格」两个语义，跨 Story 需求必须开多个 CHG，整体规格散落 |
| **缺少 Story 层细化** | Change 级 PRD/Design 粒度粗，直接跳到 DU 拆分缺少「Story 级产品规格 + 技术设计」的中间承接                            |
| **多 Story 协作困难** | 跨 Story 业务规则/接口契约无统一载体，Agent 在 Story 级执行时上下文不完整                                             |
| **知识回流不清晰**    | Change 级已确认的产品规则和 Story 级具体实现边界混杂，`product/specs/` 晋升无层次                                     |

## 1.2 改进目标

将单级 CHG 规格拆分为 **三级递进模型**，每级职责明确、门禁独立、可审计：

```
Change Spec/Design  ── 描述整个需求（跨 Story 视角，产品总规格 + 架构总设计）
       │
       ▼ 拆分
Story Spec/Design   ── 描述最小产品能力（单 Story 产品规格 + 技术设计）
       │
       ▼ 拆分
Delivery Unit Spec  ── 单仓库可直接执行的实现规格（已有，细化约束）
```

---

# 2. 核心分层模型

## 2.1 三层职责边界

### Layer 1：Change 级（整个需求视角）

> Owner：sdd-prd / sdd-design（Change 级 Skill）
> 交付物：`change-prd.md`、`change-design.md`
> 生命周期：created → exploring → **specified(Change PRD)** → **designed(Change Design)** → story-splitting → ...

| 交付物                          | 内容边界                                                                                       | 不应该包含                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Change PRD**（产品总规格）    | 需求全景：背景/用户画像/业务规则总纲/功能范围（In/Out）/Story 拆分总表/全局验收标准/非功能需求 | 单 Story 详细接口、单 Story 字段级规格 |
| **Change Design**（架构总设计） | 整体架构：跨 Story 数据流/跨仓接口契约总表/公共组件抽取/数据模型总览/技术选型/整体风险         | 单 Story 模块改动细节、单仓库具体实现  |

**Hard Constraint**：Change PRD/Design 通过 Gate 后，Story 拆分只能在 Change PRD 的范围内细化，不能扩大范围（若超出需回改 Change PRD 并重跑 Gate）。

---

### Layer 2：Story 级（最小产品能力视角）

> Owner：sdd-prd（Story Spec 子阶段）/ sdd-design（Story Design 子阶段）
> 交付物：`story-spec.md`、`story-design.md`、`tasks.md`
> 生命周期：pending → **specified** → **designed** → tasked → developing → testing → completed

| 交付物                             | 内容边界                                                                                                  | 不应该包含                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Story Spec**（Story 产品规格）   | 从 Change PRD 切分到本 Story：Story 目标/Scope/详细业务规则/接口规格（字段级）/用户故事/本 Story 验收标准 | 其他 Story 的内容、跨 Story 架构决策             |
| **Story Design**（Story 技术设计） | 从 Change Design 细化：本 Story 模块改动/接口契约/数据迁移/本地错误处理/测试策略                          | 公共组件抽取（应放 Change Design）、跨仓协作总表 |
| **tasks.md**（DU 拆分）            | 将 Story Design 拆到各仓库的 DU（不变，已有实现）                                                         | —                                                |

**Hard Constraint**：Story Spec 必须引用 `change-prd.md` 中对应的条目（交叉引用 Gate 检查 cross-reference 从 advisory 升为 blocking for Story）。

---

### Layer 3：DU 级（单仓库可执行视角）

> Owner：sdd-task / sdd-dev
> 交付物：`tasks.md` 内 DU 段落 + `du/<du-id>/workspace-metadata.yaml`
> 已有模型不变，只补充职责边界强化约束：

| DU 条目           | 强制引用                                | 说明                                                   |
| ----------------- | --------------------------------------- | ------------------------------------------------------ |
| Design References | **必须引用 story-design.md 的具体章节** | 禁止只引用 change-design.md（确保粒度足够细）          |
| Scope             | **必须是 Story Scope 的子集**           | Gate 检查：DU Scope × Story Scope = DU Scope（⊂ 关系） |

---

## 2.2 三级关系汇总表

| 层级            | 数量关系                     | 1:1 / 1:N | 关键引用                     |
| --------------- | ---------------------------- | --------- | ---------------------------- |
| Change : Story  | 1 Change 包含 N Story（N≥1） | **1:N**   | Change metadata.stories 列表 |
| Story : DU      | 1 Story 包含 N DU（N≥1）     | **1:N**   | Story metadata.dus 列表      |
| DU : Repository | 1 DU 绑定 1 Repository       | **1:1**   | repositories.yaml id         |

```
CHG-0042（三级规格分层改造）
├── Story 1：metadata schema 升级 + feature-path 解耦
│   ├── DU-BE-001：后端 change-model.js 修改
│   └── DU-FE-001：前端 change detail 页面调整
├── Story 2：Story 级产物模板 + Gate 分发
│   └── DU-BE-002：core/ gate-repository + validator 修改
└── Story 3：Workflow 多 Story 推进 + 向后兼容
    ├── DU-BE-003：workflow-engine 聚合判定
    └── DU-TEST-001：集成测试补齐
```

---

# 3. 目录结构改造

## 3.1 新目录结构（三级形态）

```
delivery/changes/<Module>/<Feature>/<CHG-ID>/
├── metadata.yaml              # v3：Change 级元信息，新增 stories 列表
├── requirement.md             # 不变
├── exploration.md             # 不变
│
├── change-prd.md              # 【新增】Change 级产品总规格（替代原 prd.md 语义）
├── change-design.md           # 【新增】Change 级架构总设计（替代原 design.md 语义）
│
├── stories/                   # 【新增】Story 集合目录
│   ├── STORY-XXXX-01/         # 按 Story ID 命名
│   │   ├── story-metadata.yaml  # 【新增】Story 级元信息：status / gates / dus
│   │   ├── story-spec.md        # 【新增】Story 产品规格
│   │   ├── story-design.md      # 【新增】Story 技术设计
│   │   ├── tasks.md             # 从 CHG 根下移：该 Story 的 DU 拆分
│   │   ├── instruction.md       # 从 CHG 根下移（可选，Story 级执行上下文）
│   │   ├── implementation.md    # 从 CHG 根下移
│   │   ├── test-report.md       # 从 CHG 根下移
│   │   ├── review-report.md     # 从 CHG 根下移
│   │   ├── evidence/            # 从 CHG 根下移（Story 级证据）
│   │   └── du/                  # 从 CHG 根下移（该 Story 的 DU 引用）
│   │
│   └── STORY-XXXX-02/
│       └── ...（同上结构）
│
├── convergence.md             # 不变：Change 级收敛（聚合所有 Story 结果）
├── knowledge-index.json       # 不变：整体知识索引
└── instruction.md             # 【保留】Change 级执行上下文（供 explore/prd/design 阶段用）
```

## 3.2 向后兼容：单 Story 扁平化模式（Light 档默认）

> 兼容现有工作流 + Light 档小改动场景，不强制嵌套目录。

当 Change 仅包含 1 个 Story 且 evidence-tier=light 时，允许**省略 `stories/` 目录**，Story 产物平铺在 CHG 根目录（等价于当前结构）：

```
CHG-0043（单 Story 小改动，light 档）
├── metadata.yaml           # v3：stories: [ { id: STORY-XXX, inline: true } ]
├── requirement.md
├── exploration.md
├── prd.md                  # 同时承担 change-prd.md + story-spec.md（Gate 检查内容完整性）
├── design.md               # 同时承担 change-design.md + story-design.md
├── tasks.md
├── ...（其余不变）
```

**判定规则**：

- `metadata.yaml` `stories` 数组长度 = 1 且 `inline: true` → 扁平化模式
- 扁平化模式下 `change-prd.md / change-design.md` 不允许存在（避免重复）
- 若后续扩展为多 Story，需先 `openspec change split-story <chg>` 命令转换为三级形态（§6.3 迁移工具）

---

# 4. metadata Schema 升级（v3）

## 4.1 Change 级 metadata.yaml（v3 增量）

```yaml
schema-version: 3          # 新增值 3；缺省=2（旧版）；v1→v2 迁移逻辑不变

id: CHG-0042
status: specified          # 不变（Change 级生命周期）
evidence-tier: standard    # 不变：Change 级默认档，Story 可覆盖

# --- 以下不变 ---
requirement: REQ-017
feature-path:              # 【语义变更】v3 起可空；单 Story 时仍写单个（兼容），多 Story 时不写
  # level-1 / level-2 / level-3 / story 仅单 Story 场景填
repositories: [backend, frontend, test-harness]

# --- v3 新增：Story 列表（1:N 关系）---
stories:
  - id: STORY-001-02-03-01   # Story ID（对齐 feature-tree.yaml）
    title: metadata schema 升级
    inline: false            # false = 独立 stories/ 目录；true = 平铺（Light 档）
    evidence-tier: standard  # 可选：不填继承 Change 级
    status: specified        # Story 子状态（同步冗余，权威源是 story-metadata.yaml）
    path: stories/STORY-001-02-03-01/  # inline=false 时填
  - id: STORY-001-02-03-02
    title: Story Gate 分发改造
    ...

# --- 以下不变 ---
repository-baseline: {}
repository-result: {}
artifacts: {}               # 仅 Change 级产物（change-prd / change-design / exploration / convergence）的 Gate 结果
```

## 4.2 Story 级 story-metadata.yaml（新增模板）

```yaml
# Story Metadata —— 单 Story 生命周期 + Gate 载体
schema-version: 1

change-id: CHG-0042
story-id: STORY-001-02-03-01
title: metadata schema 升级 + feature-path 解耦
status: specified # Story 生命周期：pending/specified/designed/tasked/developing/testing/completed
evidence-tier: standard # 继承或覆盖 Change 级
created-at: ""
updated-at: ""

# 引用定位
change-prd-ref: "change-prd.md#3-功能范围" # 交叉引用：Change PRD 中对应条目
feature-path: # Story 级绑定（权威：Story 必绑定单个 Feature 链）
  level-1: { id: FEAT-001, name: 平台能力 }
  level-2: { id: FEAT-001-02, name: SDD 引擎 }
  level-3: { id: FEAT-001-02-03, name: 规格管理 }
  story: { id: STORY-001-02-03-01, name: 三级规格分层 }
  candidate: false

# DU 列表（Story 1:N DU）
dus:
  - id: DU-BE-001
    repo: backend
    status: developing # DU 状态：pending/developing/testing/completed
  - id: DU-FE-001
    repo: frontend
    status: pending

# Story 级 Gate 结果（与 Change 级独立）
artifacts: {}
  # story-spec:
  #   gates: { machine: {...}, human: {...} }
  # story-design:
  #   gates: { machine: {...}, human: {...} }
  # tasks:
  #   gates: { machine: {...}, human: {...} }
  # implementation: ...
  # test-report: ...
  # review-report: ...
```

---

# 5. 生命周期与门禁改造

## 5.1 Change 级生命周期（8 阶段 → 9 阶段）

```
当前 8 阶段：created → exploring → specified → designed → tasked → developing → testing → completed → archived
新增 1 阶段：                         ↑
                              story-splitting（Change Design 通过 → 拆 Story → 逐 Story 推进）
```

| 阶段                             | 产物                            | Human Gate                 | Machine Gate 核心项                                                                      |
| -------------------------------- | ------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| exploring                        | exploration.md / requirement.md | skip                       | requirement 格式 / feature-candidate 完整                                                |
| **specified**                    | change-prd.md                   | **required**（需求级人审） | sections 完整 / 含 Story 拆分总表 / affected-repositories 非空                           |
| **designed**                     | change-design.md                | skip                       | sections 完整 / 跨仓 Contract 匹配仓库数 / 公共组件识别                                  |
| **story-splitting**（新增）      | stories/ 目录 + 各 Story 元信息 | skip                       | 所有 Story feature-path 已绑定 / Story Scope 并集 = Change Scope（⊆ 校验）/ 交叉引用存在 |
| tasked                           | 各 Story tasks.md               | skip                       | DU ⊂ Story Scope / Design References 指向 story-design 章节                              |
| developing → testing → completed | 聚合所有 Story 状态             | —                          | **聚合判定**：所有 Story.completed → Change 自动进入 completed（见 §5.3）                |
| converged                        | convergence.md                  | **required**               | 知识回流完成 / conflicts 解决 / evidence 齐全                                            |

**Human Gate 策略（Phase 4.1 兼容）**：保留 prd + converge 两阶段人审，其余 skip。Change 级 prd 人审 = 整个需求规格的唯一人工确认点。

## 5.2 Story 级生命周期（7 阶段）

```
pending → specified → designed → tasked → developing → testing → completed
```

| 阶段               | 产物                                          | Human Gate                         | Machine Gate 核心项                                                                                                                                        |
| ------------------ | --------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| specified          | story-spec.md                                 | **required**（Story 产品规格人审） | cross-reference（必须引用 change-prd 具体章节，**blocking**，Change 级 cross-reference 从 advisory 降级 skip 例外）/ scope ⊆ Change Scope / 验收标准可量化 |
| designed           | story-design.md                               | skip                               | cross-reference（必须引用 change-design 具体章节，blocking）/ 接口契约与 Change 级一致 / 数据迁移声明完整                                                  |
| tasked             | tasks.md                                      | skip                               | DU coverage 完整（Story 涉及的仓库都有 DU）/ DU Scope 是 Story Scope 子集 / Implementation Sketch 非空                                                     |
| developing/testing | implementation.md / test-report.md / evidence | skip                               | evidence-coverage（继承 tier）/ commit 映射                                                                                                                |
| completed          | review-report.md                              | skip                               | findings-closure（blocking）                                                                                                                               |

> Story 级 **story-spec 人审 required，其余 skip**（评审决策 2026-09-02）。Human Gate 完整流程人审点 = Change.prd + N×Story.spec + Change.converge（共 N+2 次，N 为 Story 数）。单 Story inline 模式：prd.md 双语义仅 1 次人审（既作为 Change 级人审也作为 Story 级人审，reviewer 一次签名覆盖两级，机检合并为一次 gate approve）。若 evidence-tier=light，严格模式 story-spec 仍 required 不降级（Story 产品规格确认是质量底线，不因档位跳过）。

## 5.3 聚合推进规则（Workflow Engine 改造点）

**Change 状态推进新规则**（tasked 及之后）：

```
Change.tasked      ←  所有 Story.tasked      （全部 Story 拆完 DU）
Change.developing  ←  任一 Story.developing   （有 Story 在开发即整体在开发）
Change.testing     ←  任一 Story.testing 且 所有 Story ≥ tasked（混合开发+测试期也算 testing）
Change.completed   ←  所有 Story.completed    （全部 Story 完成才算 Change 完成）
```

**Stale 传播扩展**（Phase 4.1 基础上）：

- Change 级 `change-prd.md` / `change-design.md` hash 变更 → 所有未 completed 的 Story 的 story-spec / story-design Gate 自动标记 `stale: true`
- Story 级 `story-design.md` hash 变更 → 该 Story 所有未 completed 的 DU 的 tasks Gate 标记 `stale: true`
- CLI 输出分层 stale 提示（Change 级 / Story 级 / DU 级）

---

# 6. Skill 改造影响

## 6.1 8 阶段 Skill 改造矩阵

| Skill                               | 改造内容                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sdd-explore**                     | 不变（Change 级需求调研）。输出多了 Story 候选拆分建议（写入 exploration.md §6 Story 拆分）                                                       |
| **sdd-prd**（重点改造）             | 阶段产物从 `prd.md` 改为 `change-prd.md`（Change PRD）；新增子任务：为每个 Story 产出 `stories/<id>/story-spec.md`（在 story-splitting 阶段执行） |
| **sdd-design**（重点改造）          | 阶段产物从 `design.md` 改为 `change-design.md`（Change Design）；新增子任务：为每个 Story 产出 `stories/<id>/story-design.md`                     |
| **sdd-task**                        | 从 CHG 根目录 `tasks.md` 改为**逐 Story 生成** `stories/<id>/tasks.md`；新增 Gate：DU Scope ⊆ Story Scope 校验                                    |
| **sdd-dev / sdd-test / sdd-review** | 执行粒度从 Change 级改为 **Story 级**（CLI `--du` 不变，需先指定 Story）；Evidence 目录从 CHG 根下移到 Story 内                                   |
| **sdd-converge**                    | 不变（Change 级收敛）。新增 Gate 检查：所有 Story.completed                                                                                       |

## 6.2 Story 拆分 Skill（或 sdd-task 内嵌子流程）

Story 拆分是新的显式阶段，两种实现方式（**选 A 推荐**）：

**方案 A：sdd-design 输出后内嵌拆分流程（不新增 Skill）**

1. sdd-design accepted → Workflow Engine 进入 story-splitting 阶段
2. instruction-builder 注入「拆 Story」指令，基于 change-prd.md Story 拆分总表 + change-design.md，生成各 `stories/<id>/` 目录和 story-metadata.yaml
3. 然后分别进入 Story 级 sdd-prd（写 story-spec）→ sdd-design（写 story-design）

**方案 B：新增独立 Skill `sdd-story-split`**

- 独立 Skill + 独立 stage，职责单一
- 缺点：Skill 数从 11 → 12，IDE 命令/工作流都要改，侵入较大

## 6.3 新增 CLI 命令

| 命令                                      | 说明                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `openspec change split-story <CHG-ID>`    | 将单 Story 平铺 Change（inline=true）转换为三级形态（生成 stories/ 目录，移动产物）；也用于将 N Story 拆为 N+1 Story（中途加 Story） |
| `openspec story list <CHG-ID>`            | 列出 Change 下所有 Story 及状态                                                                                                      |
| `openspec story show <CHG-ID> <STORY-ID>` | 查看 Story 详情（metadata + gates + dus）                                                                                            |
| `openspec change status`                  | 升级输出：Change 状态行 + Story 状态表格（类似 `docker ps`）                                                                         |

---

# 7. 向后兼容与迁移策略

## 7.1 Schema 版本矩阵

| schema-version          | 形态                    | upgrade 行为                                                                                                   |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1（旧扁平 features 表） | v1                      | 先升 v2（feature-path 升级，既有升级逻辑不变）→ 再升 v3（§7.2）                                                |
| 2（Phase 2.4/3.x/4.x）  | 单 Story 平铺           | upgrade 创建 `stories:` 列表：`[{id: feature-path.story.id, inline: true}]`；status 同步；**不强制改目录结构** |
| 3（本方案）             | 三级形态或单 Story 平铺 | 已是 v3 跳过                                                                                                   |

## 7.2 升级命令改造（openspec upgrade）

`openspec upgrade` 新增 v3 迁移步骤：

```
Step 4（新增，schema migration 子步骤）：
  4a. 扫描所有未 archived 的 CHG
  4b. 若 schema-version < 2 → 先执行 v2 迁移（既有逻辑）
  4c. 若 schema-version = 2：
      - 写 schema-version: 3
      - 从 metadata.feature-path 推导 stories[0]，设 inline=true
      - 原 prd.md / design.md / tasks.md 不移动（inline 语义）
      - artifacts 段不变（仍在 Change 级）
  4d. version.yaml 记录「migrated N changes from v2 to v3」
```

## 7.3 Workflow / Gate 的双态兼容

所有读取 Change 产物的地方（workflow-engine、gate-validator、context-assembler）增加兼容分支：

```
读取 PRD（伪代码）：
  if exists('change-prd.md') → v3 三级形态，读 change-prd.md
  elif exists('prd.md')      → v2/v3 inline 形态，读 prd.md（同时承担 change+story spec）
  else                       → error: 未找到 PRD 产物

读取 Design（伪代码）：
  if exists('change-design.md') → v3 三级形态
  elif exists('design.md')      → v2/v3 inline
  else → error
```

兼容期内两种形态均合法；v3 inline 形态可随时通过 `split-story` 命令转为三级形态（不可逆转换，记录在 version.yaml upgrade log）。

---

# 8. 实施拆解（推荐 3 个 Story）

## Story 1：Schema 升级 + 元信息改造（底层基础）

- metadata schema v3（Change 级 stories 列表 + 语义变更）
- story-metadata.yaml 模板 + 读写纯函数（story-model.js 新增）
- change-model.js patchMetadata 兼容 v3
- feature-model.js findStoryChain 支持多 Story（现有实现已 OK，仅补测试）
- `openspec change split-story` 命令 + `story list/show` 命令
- upgrade 新增 v2→v3 schema 迁移
- **单测覆盖**：schema version 读写、split-story 转换前后目录一致、upgrade 迁移幂等

## Story 2：产物模板 + Gate 分发（中间层）

- change-prd.md / change-design.md 新模板
- story-spec.md / story-design.md 新模板
- gate-repository.js 支持 Story 级 Gate 读写（路径分发）
- gate-validator.js 新增 scope-⊆ 校验（Story ⊆ Change / DU ⊆ Story）、cross-reference blocking for Story
- gate.yaml 7 个 Skill 的 Gate 配置升级（区分 Change 级检查项和 Story 级检查项）
- context-assembler 三级上下文拼装（Change 级拼 change-prd/design；Story 级拼 story-spec/design + Change 级引用）
- **单测覆盖**：Gate 读写分层、scope 子集校验、cross-reference 正确/错误场景

## Story 3：Workflow 多 Story 推进 + Skill 升级（闭环）

- workflow-engine.js 改造：Change ↔ Story 聚合推进规则（§5.3）+ Stale 分层传播
- 11 个 Skill 的 SKILL.md 修订（sdd-prd/design/task/dev/test/review 重点）
- sdd-prd / sdd-design instruction-builder 注入 Story 拆分/细化指令
- sdd-task 逐 Story 生成 tasks.md
- sdd-dev/test/review 执行粒度改为 Story 级
- `openspec change status` 升级输出（Change 行 + Story 表格）
- **集成测试**：完整三阶段跑通（多 Story 场景）、单 Story inline 场景兼容、stale 传播正确触发

---

# 9. 风险与缓解

| 风险                                                                | 等级 | 缓解                                                                                                                             |
| ------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 改造面大（schema + 8 Skill + workflow + CLI 全链路）                | 高   | 严格分 3 Story 交付，每 Story Gate 独立；v2→v3 inline 兼容保障存量不破坏                                                         |
| Agent 在 Story 级执行时上下文过载（Change 级 + Story 级内容都要读） | 中   | context-assembler 分层注入：Change 级只注入 change-prd/design 的「相关章节」（由 story-spec cross-reference 锚定），不是完整文件 |
| cross-reference 从 advisory 升 blocking（Story 级）导致通过率下降   | 低   | instruction 明确要求写具体章节号；提供 `split-story` 工具预填交叉引用模板                                                        |
| 产品/features/ 派生缓存投影变化                                     | 低   | Phase 3.8 已改为 SSOT→派生缓存；只需 materialize 逻辑不变（Story 级是投影最小单元）                                              |

---

# 10. 验收标准（Definition of Done）

- [x] **Schema**：v3 metadata 能正确读写；stories 列表与目录结构一致；change split-story 命令执行后目录正确 + Gate 历史保留
- [x] **全链路测试**：多 Story 场景（1 Change → 3 Story → 5 DU）完整跑通 lifecycle，Change.completed 仅在所有 Story.completed 时触发
- [x] **向后兼容**：所有现有测试不变或最小修改通过（438/438）；v2 存量 Change 执行 upgrade 后正常 workflow run（含 metadata v2→v3 inline 推导迁移）
- [x] **门禁正确**：Story 级 cross-reference 缺时 Machine Gate 必 fail（blocking）；Change 级 change-prd 修改后未完成 Story 的 Gate 全部报 stale（detectStaleArtifacts 分层传播 Change→Story→DU）
- [x] **轻量化不退化**：单 Story light 档场景步骤数 ≤ 当前流程（inline 模式保证）
- [x] **CLI 冒烟**：`change split-story` / `story list/show` / `change status`（新表格输出）正常工作

> 交付备注（2026-09-04）：
>
> - Story 1/2/3 按 §8 分批交付，全部合入且测试通过；Harness 版本随文档体系优化一并 bump 至 0.4.0。
> - v0.4 增量：CHG 骨架去 README 锚点（metadata 旧名 rename）+ upgrade 清理四级骨架遗留锚点 README（`findLegacyAnchorReadmes`）。
> - 遗留项：prd.md → spec.md 命名统一延至 Phase 4.3（见附录 A）。

---

# 11. 评审决策记录（2026-09-02 已确认）

| #   | 事项                         | 决策                                | 理由/备注                                                                                                                                           |
| --- | ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Story 拆分形式               | **A 内嵌，不新增 Skill**            | 不新增第 12 个 Skill，story-splitting 作为 sdd-design → Story 级 sdd-prd/sdd-design 的过渡阶段，由 workflow-engine + instruction-builder 驱动       |
| 2   | Story 级 Human Gate 默认策略 | **story-spec required / 其余 skip** | Story 产品规格需人工确认（共 N+2 次人审：Change.prd + N×Story.spec + Change.converge）；单 Story inline 合并为 1 次；light 档 story-spec 人审不降级 |
| 3   | Inline 模式 section 强制两套 | **不强制**（语义存在性机检）        | 只查目标/范围/验收/仓库影响关键信息存在，不强制显式 section 名；避免 light 档单 Story 样板膨胀                                                      |
| 4   | product/specs/ 晋升自动化    | **保持人工迁移**（本期不改）        | 仍 Agent 写草稿 + 人工 review 通过后手动迁入 specs/；自动化草稿生成作为未来 capability                                                              |
| 5   | Story 级 instruction.md 落地 | **不落地，动态拼装**                | instruction-builder 按 Story 上下文动态拼接（Change 级引用 + Story spec/design），减少 IO 和冗余文件                                                |

---

# 附录 A：提案归档——两级 Spec/Design 需求管理模型（2026-09-04）

> 来源：用户在 Phase 4.2 交付确认时提出的「两级 Spec/Design 模型」提案。经比对，该提案与已落地的三级规格分层**同构**，无需额外改造；归档于此作为设计原理佐证。

## A.1 提案原文要点

需求管理采用两级 Spec/Design 模型：

| 提案概念                  | 含义                                                   |
| ------------------------- | ------------------------------------------------------ |
| Requirement Spec          | 需求级规格：这个需求要做什么（目标 / 范围 / 验收标准） |
| Requirement Design        | 需求级设计：这个需求怎么分层实现（方案 / 拆解）        |
| Story Spec                | 每个 Story 的独立规格：该 Story 的验收标准             |
| Story Design              | 每个 Story 的独立设计：该 Story 的实现方案             |
| 1 Requirement → N Stories | 需求拆解为多个 Story，Story 是最小可交付单元           |

## A.2 与 Phase 4.2 实现的同构映射

| 提案概念                  | Phase 4.2 落地物                                                    | 状态      |
| ------------------------- | ------------------------------------------------------------------- | --------- |
| Requirement Spec          | change-prd.md（Change 级规格）                                      | ✅ 已落地 |
| Requirement Design        | change-design.md（Change 级设计）                                   | ✅ 已落地 |
| Story Spec                | story-spec.md（Story 级规格，Story 级 Human Gate 载体）             | ✅ 已落地 |
| Story Design              | story-design.md（Story 级设计）                                     | ✅ 已落地 |
| 1 Requirement → N Stories | `openspec change split-story` 命令 + metadata stories[] 列表        | ✅ 已落地 |
| Story 为最小可交付单元    | DU 挂在 Story 下（Story → DU → Repository），Story 级 workflow 推进 | ✅ 已落地 |

## A.3 遗留项

- **prd.md → spec.md 命名统一**：提案使用 Spec 命名，当前实现沿用 change-prd.md / story-spec.md 混合命名（prd/spec/design）。语义已对齐，仅文件名不统一；延至 **Phase 4.3** 统一（需迁移存量 CHG 目录内文件名 + skill/gate/context 配置引用，独立成阶段控制影响面）。
