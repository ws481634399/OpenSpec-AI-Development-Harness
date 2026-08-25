# OpenSpec AI Development Harness

# Phase 1.5 - Gate-driven Workflow Engine Design

> Version: v0.3
> Status: Final（已定稿，待实施）
> Type: Implementation Design
> Phase: Phase 1.5 - Gate-driven Workflow Engine
>
> v0.3 变更（相对 v0.2）：
>
> - §8.2 TransitionService 改为通过 workflow state-map 查表定位 Skill/Artifact，不再反查 skill.yaml
> - §10.4 v0.1 不识别 bypassed 推进（视为未通过），数据结构保留待 v0.2
> - §12.5 default.yaml stages 显式声明 from-state/to-state/skill/artifact/gate
> - §12.6 新增 v0.1 Workflow Engine Trade-off 说明
> - §17.2 新增 GateRepository ReadBack 测试 + Phase 1.4 SkillRunner 测试改写策略（已选方案 B：迁移到 integration.spec.js 走完整 TransitionService 链路）
> - §17.3 测试文件表加 skill.spec.js 修改行
> - §19 验收标准增至 18 条（新增 #16-#18）

# 1. 文档目的

本文档定义 OpenSpec AI Development Harness Phase 1.5 的实现方案。

Phase 1.5 的核心定位：

> **实现 Phase 1.3 已定义的 Artifact Gate Model，并通过统一的 Transition Service 将 Machine Gate、Human Gate、Artifact Acceptance、Change Lifecycle Transition 和 Workflow Coordination 串联起来。**

Phase 1.5 不重新发明 Gate Model。它负责将已经定义好的 Gate Model 实现出来，并接入状态推进和 Workflow。

OpenSpec 在 Phase 1.5 仍然：

- 不执行 LLM
- 不实现 Agent Runtime
- 不进行 AI 推理
- 不自动生成语义内容
- 不实现无人值守的完整 7 Skill 自动执行

```
Phase 1.3  SDD Lifecycle & Artifact Model
           定义：Artifact / Gate / Lifecycle
    ↓
Phase 1.4  SDD Skill Framework
           实现：Skill / Invocation / Artifact Producer
    ↓
Phase 1.5  Gate-driven Workflow Engine          ← 本阶段
           实现：Gate / Transition / Workflow Coordination
    ↓
后续        Agent Runtime / LLM / Prompt Engine
```

**Skill 产出不等于阶段完成。** 只有 Artifact 通过双重门禁并被 TransitionService 确认 accepted 后，Change 生命周期状态才推进。

---

# 2. 职责关系

## 2.1 最终职责链

```
Skill            负责产出 Artifact Draft
    ↓
Gate             负责判断 Artifact 是否具备进入下一阶段的资格
    ↓
TransitionService  负责唯一合法的 Change 状态推进
    ↓
Workflow         负责根据当前状态、Artifact 和 Gate 状态协调下一阶段
```

四个职责严格分离，不可交叉：

| 职责              | 负责                                                                       | 不负责             |
| ----------------- | -------------------------------------------------------------------------- | ------------------ |
| Skill             | 产出 Artifact Draft（写文件 + 填结构化字段 + 生成 Instruction）            | 不推进 Change 状态 |
| Gate              | 判断 Artifact 是否具备资格（Machine + Human）                              | 不推进 Change 状态 |
| TransitionService | 唯一合法的状态推进（校验 Gate + Hash + 状态机 → patchStatus）              | 不产出 Artifact    |
| Workflow          | 协调下一阶段（检测 Artifact 就绪 → Gate 评估 → Transition → 选下一 Skill） | 不执行 AI 推理     |

## 2.2 与 Phase 1.3/1.4 的对齐

Phase 1.5 **不改变**：

- Phase 1.3 的 9 态状态机（`CHANGE_STATUSES` 与 `TRANSITIONS`）
- Phase 1.4 的 `skill.yaml` / `SKILL.md` / `checklist.md` / `rules.md` 格式

Phase 1.5 **新增**：

- 每个 Skill 目录加 `gate.yaml`（门禁规则配置，与 `skill.yaml` 同目录，职责不同见 §11）
- `core/sdd/` 新增门禁层 + 推进层 + 编排层纯函数模块
- `metadata.yaml` schema 扩展 `artifacts` 段（Gate Result 持久化）
- `cli/openspec/src/commands/` 新增 `gate.js` + `workflow.js`
- `change.js` 的 `status --set` 改走 TransitionService
- `skill.js` 删除直接 `patchStatus` 调用

## 2.3 Phase 1.3 Gate Model 补充需求

> **Consistency Report 要点**：Phase 1.3 实际文件（`change-lifecycle.md` / `skill-execution.md` / Phase 1.3 设计文档）**尚未包含**明确的 "Artifact Gate Model" / "Artifact Acceptance Rule" / "Lifecycle Advancement Rule" 定义。

Phase 1.5 的实现需要 Phase 1.3 同步补充以下定义（不由 Phase 1.5 重新发明）：

1. **Artifact Gate Model**：Machine Gate + Human Gate → Artifact Accepted 的统一模型
2. **Artifact Acceptance Rule**：`accepted = machine.passed AND human.approved AND hash.match`
3. **Lifecycle Advancement Rule**：只有 accepted Artifact 才允许驱动 Change 状态推进

详见 Consistency Report §2。

---

# 3. 阶段目标

## 3.1 实现范围

- `core/sdd/` 新增门禁层 + 推进层 + 编排层纯函数模块：
  - `gate-config-loader.js` — 加载 `skills/<id>/gate.yaml`
  - `gate-validator.js` — 机门禁确定性校验（纯函数）
  - `gate-repository.js` — Gate Result 持久化（读写 metadata.yaml 的 artifacts 段）
  - `artifact-hash.js` — SHA-256 计算 + 比对
  - `transition-service.js` — 唯一状态推进入口
  - `workflow-loader.js` — 加载 `workflows/<name>.yaml`
  - `workflow-engine.js` — 编排协调（非 AI 执行器）
- 7 个 Skill 目录各加 `gate.yaml`
- `workflows/default.yaml` — 默认 SDD 生命周期编排
- `cli/openspec/src/commands/gate.js` — `openspec gate check/approve/status`
- `cli/openspec/src/commands/workflow.js` — `openspec workflow list/show/run`
- `change.js` 的 `status --set` 改走 TransitionService
- `skill.js` 删除 `patchStatus` 调用（Skill 不推进状态）
- `metadata.yaml` schema 扩展 `artifacts` 段
- `tests/gate.spec.js` + `tests/workflow.spec.js` + `integration.spec.js` 扩展

## 3.2 核心原则

1. **Skill 产出 ≠ 阶段完成**：`skill run` 只产出 Artifact Draft，不推进状态
2. **Machine Gate 通过 ≠ 阶段完成**：还需 Human Gate
3. **Human Gate 批准 ≠ 自动推进**：TransitionService 必须检查当前 Artifact 版本和生命周期条件
4. **Artifact 内容变化 → 旧审批失效**：Hash 不匹配，Gate Result 自动失效
5. **Change State 只表达已正式接受的阶段结果**，不是"某文件已生成"
6. **patchStatus 是 internal persistence primitive**，不是业务层生命周期 API

---

# 4. 非目标范围

Phase 1.5 不实现以下内容，均属后续 Phase：

| 内容                                                 | 所属阶段                    |
| ---------------------------------------------------- | --------------------------- |
| ❌ Agent Runtime（模型调用、对话管理、Agent 状态机） | 后续                        |
| ❌ LLM API / 模型路由                                | 后续                        |
| ❌ Prompt Engine                                     | 后续                        |
| ❌ AI 语义评分（Machine Gate 只做确定性校验）        | 后续                        |
| ❌ 全自动无人值守 7 Skill 连续执行                   | 后续                        |
| ❌ 跨 Change 编排（多 CHG 联动）                     | 后续                        |
| ❌ Workflow DAG 可视化                               | 后续                        |
| ❌ 门禁规则 DSL / 自定义校验脚本                     | 后续（v0.1 用 YAML 声明式） |
| ❌ rollback / 状态回退                               | 后续（v0.1 线性前进不回退） |

---

# 5. 系统结构

## 5.1 仓库根目录树（Phase 1.5 新增/修改标注）

```
OpenSpec-AI-Development-Harness/
├── cli/openspec/
│   └── src/
│       ├── index.js                         # 改：注册 gate + workflow 子命令
│       └── commands/
│           ├── change.js                    # 改：status --set 走 TransitionService
│           ├── skill.js                     # 改：删除 patchStatus，Skill 不推进状态
│           ├── gate.js                      # 新增：gate check/approve/status
│           └── workflow.js                  # 新增：workflow list/show/run
├── core/
│   └── sdd/                                 # Phase 1.3/1.4 模块不变，新增门禁/推进/编排层
│       ├── gate-config-loader.js           # 新增：加载 skills/<id>/gate.yaml
│       ├── gate-validator.js               # 新增：机门禁确定性校验（纯函数）
│       ├── gate-repository.js              # 新增：Gate Result 读写 metadata.yaml artifacts 段
│       ├── artifact-hash.js                # 新增：SHA-256 计算 + 比对
│       ├── transition-service.js           # 新增：唯一状态推进入口
│       ├── workflow-loader.js              # 新增：加载 workflows/<name>.yaml
│       └── workflow-engine.js              # 新增：编排协调（WAITING/RESUME）
├── skills/                                  # Phase 1.4 既定，每个 Skill 加 gate.yaml
│   ├── sdd-explore/
│   │   ├── skill.yaml                      # 不变
│   │   ├── gate.yaml                        # 新增：explore 门禁规则
│   │   └── ...
│   ├── sdd-prd/
│   │   └── gate.yaml                        # 新增
│   └── ...（其余 5 个同样新增 gate.yaml）
├── workflows/                               # 新增：Workflow 定义
│   └── default.yaml
├── templates/
│   └── artifacts/
│       └── metadata.yaml                    # 改：schema 扩展 artifacts 段
├── tests/
│   ├── gate.spec.js                         # 新增
│   ├── workflow.spec.js                     # 新增
│   └── integration.spec.js                  # 扩展
├── plans/
│   └── phase-1.5-workflow-engine-design.md  # 本文档
└── package.json                             # 改：files 加 "workflows"
```

## 5.2 模块职责

| 域       | 模块              | 文件                    | 职责                                                                                    |
| -------- | ----------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| core/sdd | GateConfigLoader  | `gate-config-loader.js` | 从 `harnessRoot/skills/<id>/gate.yaml` 加载门禁规则                                     |
| core/sdd | GateValidator     | `gate-validator.js`     | 机门禁确定性校验：必填字段/占位符已替换/AI 段非空/引用合法/一致性（纯函数，不 IO）      |
| core/sdd | GateRepository    | `gate-repository.js`    | Gate Result 读写：持久化到 `metadata.yaml` 的 `artifacts.<name>.gates` 段               |
| core/sdd | ArtifactHash      | `artifact-hash.js`      | SHA-256(artifact content) 计算 + 与 Gate 记录的 hash 比对                               |
| core/sdd | TransitionService | `transition-service.js` | **唯一状态推进入口**：校验状态机 + Gate + Hash → patchStatus                            |
| core/sdd | WorkflowLoader    | `workflow-loader.js`    | 从 `harnessRoot/workflows/<name>.yaml` 加载编排定义                                     |
| core/sdd | WorkflowEngine    | `workflow-engine.js`    | 编排协调：检测 Artifact 就绪 → Gate 评估 → Transition → 选下一 Skill，返回 WAITING 状态 |

模块间依赖单向（core 纯函数，无 CLI/@clack 依赖）：

```
workflow.js / gate.js / change.js (CLI 编排)
    ↓ 调用
TransitionService（唯一推进入口）
    ├─ ChangeStateMachine（Phase 1.3：validateTransition）
    ├─ GateRepository（读 Gate Result）
    ├─ ArtifactHash（比对 hash）
    └─ ChangeModel（Phase 1.3：patchStatus — internal primitive）

WorkflowEngine（编排协调）
    ├─ WorkflowLoader
    ├─ SkillLoader（Phase 1.4）
    ├─ ContextAssembler（Phase 1.4）
    ├─ InstructionBuilder（Phase 1.4）
    ├─ ArtifactWriter（Phase 1.4）
    ├─ GateConfigLoader
    ├─ GateValidator
    └─ TransitionService

GateValidator（机门禁）
    ├─ GateConfigLoader
    └─ ArtifactHash
```

沿用 Phase 1.2/1.3/1.4 模式：原生 `node:fs/promises`、yaml Document API 保留注释、`getHarnessRoot()` 定位 Harness 资产、core 引用路径 `../../../../core/sdd/`、核心逻辑写成纯函数便于测试。

---

# 6. Artifact Gate Model

## 6.1 统一模型

```
Artifact Draft（skill run 产出）
    ↓
Machine Gate（自动，确定性校验）
    ↓ machine = passed
Human Gate（人工确认）
    ↓ human = approved
Artifact Accepted
    ↓
TransitionService
    ↓
Change Lifecycle State Advance
```

**Artifact 文件生成完成不代表阶段完成。** 只有：

```
Machine Gate = passed
AND
Human Gate = approved
AND
两次 Gate 都针对当前 Artifact 内容（hash 一致）
```

时，`Artifact = accepted`。只有 accepted Artifact 才允许驱动 Change 状态推进。

## 6.2 Gate Result 状态枚举

### Artifact 状态

```
draft       — Skill 已产出，未通过门禁
accepted    — Machine + Human 双重通过且 hash 一致
```

不增加大量 Artifact 主状态。

### Machine Gate 状态

```
pending     — 未校验
passed      — 确定性校验全通过
failed      — 存在未通过项
```

### Human Gate 状态

```
pending     — 未审批
approved    — 人工批准
rejected    — 人工拒绝
bypassed    — 绕过（需理由，≠ approved，可审计）
```

---

# 7. Gate Result 持久化 + Artifact Hash

## 7.1 持久化位置

Gate Result 持久化到 `metadata.yaml` 的 `artifacts` 段，不额外制造状态文件。

### metadata.yaml schema 扩展

```yaml
# 既有字段不变
id: CHG-0001
title: ...
status: exploring
requirement: REQ-001
created-at: ...
updated-at: ...
features: []
repositories: []
related-change: ""

# Phase 1.5 新增：artifacts 段
artifacts:
  exploration:
    path: exploration.md
    status: accepted # draft / accepted
    gates:
      machine:
        status: passed # pending / passed / failed
        checked-at: "2026-08-25T22:00:00+08:00"
        validator: sdd-explore
        artifact-hash: "sha256:abc123..."
        issues: [] # failed 时的未通过项
      human:
        status: approved # pending / approved / rejected / bypassed
        reviewed-at: "2026-08-25T22:10:00+08:00"
        reviewer: "" # 可空（v0.1 无用户系统）
        artifact-hash: "sha256:abc123..."
        reason: "" # bypassed 时的理由
  prd:
    path: prd.md
    status: draft
    gates:
      machine:
        status: pending
        checked-at: ""
        validator: ""
        artifact-hash: ""
        issues: []
      human:
        status: pending
        reviewed-at: ""
        reviewer: ""
        artifact-hash: ""
        reason: ""
```

## 7.2 Artifact Hash 绑定

Machine Gate 和 Human Gate 的结果**必须绑定当前 Artifact 内容**。

实现：`SHA-256(artifact content)`，记录为 `artifact-hash`。

### 核心规则：Artifact 内容变化 → 旧 Gate 自动失效

```
prd.md
    ↓
Machine Passed (hash: sha256:aaa...)
    ↓
Human Approved (hash: sha256:aaa...)
    ↓
用户修改 prd.md
    ↓
重新计算 hash = sha256:bbb...（与 Gate 记录不一致）
    ↓
Artifact 不再是 accepted
    ↓
必须重新 Machine Gate → 重新 Human Gate
```

**不能出现"审批旧版本 Artifact → 修改文件 → 审批仍有效"。**

### Hash 失效判断逻辑

TransitionService 推进前检查：

1. 读当前 Artifact 文件，计算 `currentHash = SHA-256(content)`
2. 读 Gate Result 的 `machine.artifact-hash` 与 `human.artifact-hash`
3. 若 `currentHash !== machine.artifact-hash` → Machine Gate 失效（需重新校验）
4. 若 `currentHash !== human.artifact-hash` → Human Gate 失效（需重新审批）
5. 只有三者全一致（`currentHash === machine.hash === human.hash`）才视为 accepted

## 7.3 GateRepository API

```js
// core/sdd/gate-repository.js

// 读 Artifact 的 Gate Result
readGateResult(changeDir, artifactName);
// → { status, gates: { machine: {...}, human: {...} } }

// 写 Machine Gate Result
writeMachineGate(changeDir, artifactName, { status, issues, artifactHash });
// → 更新 metadata.yaml artifacts.<name>.gates.machine

// 写 Human Gate Result
writeHumanGate(changeDir, artifactName, {
  status,
  reviewer,
  reason,
  artifactHash,
});
// → 更新 metadata.yaml artifacts.<name>.gates.human

// 更新 Artifact 状态
patchArtifactStatus(changeDir, artifactName, status);
// → 更新 metadata.yaml artifacts.<name>.status
```

用 `parseDocument` + `setIn` 改写（保留模板注释，对齐 Phase 1.3 `patchMetadata` 模式）。

---

# 8. TransitionService（唯一状态推进入口）

## 8.1 定位

`transition-service.js` 是 **Change 生命周期状态推进的唯一合法入口**。

所有状态推进必须经过它：

```
Change CLI (status --set)
    │
Workflow Engine
    │
Other Future Caller
    │
    ↓
TransitionService
    │
┌───────────┼───────────┐
↓           ↓           ↓
StateMachine  Artifact   ArtifactHash
(Phase 1.3)   Gate       (Phase 1.5)
    │           │             │
    └───────────┼───────────┘
                ↓
            patchStatus
```

**任何地方都不得绕过 TransitionService 直接调 `patchStatus`。**

`patchStatus` 保留为底层 internal persistence primitive，不是业务层生命周期 API。

## 8.2 推进逻辑

```js
// core/sdd/transition-service.js

/**
 * 请求状态推进。
 * 唯一合法的 Change 状态推进入口。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} targetState 目标状态
 * @param {object} [opts] { skipHumanGate, harnessRoot }
 * @returns {Promise<{advanced:boolean, reason:string}>}
 */
export async function requestTransition(changeDir, targetState, opts = {}) {
  // 1. 读 metadata
  const meta = await readMetadata(changeDir);
  const current = meta.status || "created";

  // 2. 状态机校验（caller bug 抛错；Gate 未通过在后续步骤返回 advanced:false）
  validateTransition(current, targetState);

  // 3. 通过 Workflow state-map 定位 targetState 对应的 Skill / Artifact
  //    不反查 skill.yaml（避免 state→skill→gate.yaml→artifact 的循环依赖）
  //    state→{skill, artifact} 由 workflows/default.yaml 的 stages 显式声明（见 §12.5）
  const workflow = await loadWorkflow("default", opts.harnessRoot);
  const stage = workflow.stages.find((s) => s["to-state"] === targetState);
  if (!stage) {
    return {
      advanced: false,
      reason: `No stage produces state: ${targetState}`,
    };
  }
  const skillId = stage.skill;
  const artifactName = stage.artifact;
  const gateConfig = await loadGate(skillId, opts.harnessRoot);

  // 4. 确认 Artifact 存在
  const artifactPath = join(changeDir, artifactName);
  if (!(await pathExists(artifactPath))) {
    return {
      advanced: false,
      reason: `WAITING_FOR_ARTIFACT: ${artifactName} not found`,
    };
  }

  // 5. 计算当前 Hash
  const content = await readFile(artifactPath, "utf8");
  const currentHash = sha256(content);

  // 6. 确认 Machine Gate = passed 且 hash 匹配
  const gateResult = await readGateResult(changeDir, artifactName);
  if (
    gateResult.gates.machine.status !== "passed" ||
    gateResult.gates.machine["artifact-hash"] !== currentHash
  ) {
    return {
      advanced: false,
      reason: `WAITING_FOR_MACHINE: gate stale or not passed`,
    };
  }

  // 7. 确认 Human Gate = approved 且 hash 匹配
  //    v0.1 不识别 bypassed 推进（见 §10.4），bypassed 视为未通过
  const humanStatus = gateResult.gates.human.status;
  if (humanStatus !== "approved") {
    return {
      advanced: false,
      reason: `WAITING_FOR_HUMAN: gate ${humanStatus} (v0.1 requires approved)`,
    };
  }
  if (gateResult.gates.human["artifact-hash"] !== currentHash) {
    return {
      advanced: false,
      reason: `WAITING_FOR_HUMAN: gate stale (hash mismatch)`,
    };
  }

  // 8. Artifact status = accepted
  await patchArtifactStatus(changeDir, artifactName, "accepted");

  // 9. 推进状态（唯一 patchStatus 调用点）
  await patchStatus(changeDir, targetState);

  return { advanced: true, reason: `${current} → ${targetState}` };
}
```

## 8.3 不做的事

TransitionService **不**：

- 产出 Artifact（Skill 的职责）
- 执行 Machine Gate 校验（GateValidator 的职责，TransitionService 只读结果）
- 执行 Human Gate 确认（CLI @clack 的职责，TransitionService 只读结果）
- 编排多 Skill（Workflow Engine 的职责）

---

# 9. Machine Gate（确定性校验）

## 9.1 定位

Machine Gate 是 **Deterministic Validation**——只做机器能可靠判断的校验，不做 AI 语义评分。

### 校验项

| 校验项                       | 说明                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| Artifact 存在                | 文件在 CHG 目录中                                                     |
| 必填 front-matter 字段       | gate.yaml `required-front-matter` 声明的字段非空                      |
| 占位符已替换                 | gate.yaml `required-replacements` 声明的 `{{placeholder}}` 不在正文中 |
| AI required section 非空     | gate.yaml `non-empty-ai-sections` 声明的标题下有内容（非纯注释）      |
| ID/path 引用合法             | 跨阶段引用（如 design.md 的 `{{prd-source}}` 引用的 prd.md 存在）     |
| 前置 Artifact 已 accepted    | 如 sdd-design 要求 prd 的 artifact.status === accepted                |
| Repository 引用合法          | repositories 与 metadata.repositories 一致                            |
| Gate-specific machine checks | gate.yaml `machine-checks` 声明的额外校验                             |

### 不做的事

- ❌ 不扫描 Artifact 全文 `- [ ]` checkbox（见 §9.2）
- ❌ 不做 AI 语义评分（"背景是否充分""方案是否合理"是 Human Gate 的事）
- ❌ 不判断业务正确性

## 9.2 Gate Checklist vs Artifact Domain Checklist

**关键区分**：Artifact 自己可能合法包含待执行的业务 checkbox。

例如 `tasks.md`：

```markdown
- [ ] TASK-001
- [ ] TASK-002
```

这些在 Task 阶段本来就不应该完成。PRD 验收标准也合法是 `- [ ] 用户能够下单`——这不是 PRD 阶段需要打勾的 Gate Checklist。

**Gate Validator 只检查明确声明为 Machine Gate Requirement 的项目**，不基于全文件 `- [ ]` 做粗暴判断。

gate.yaml 明确区分：

```yaml
machine-checks: # Gate 级校验项（Machine Gate 跑）
  - required-front-matter
  - no-placeholder
  - required-sections
  - cross-reference-valid

human-checks: # 人工判断项（Human Gate review）
  - business-scope-correct
  - acceptance-criteria-reasonable
```

## 9.3 GateValidator API

```js
// core/sdd/gate-validator.js

/**
 * 执行机门禁确定性校验。
 * @param {string} changeDir
 * @param {object} gateConfig  gate.yaml 解析结果
 * @returns {Promise<{passed:boolean, issues:string[], artifactHash:string}>}
 */
export async function runMachineGate(changeDir, gateConfig) {
  const issues = [];
  // 1. Artifact 存在
  // 2. required-front-matter 非空
  // 3. required-replacements 的 {{placeholder}} 不在正文
  // 4. non-empty-ai-sections 标题下有内容
  // 5. cross-reference 引用合法
  // 6. 前置 Artifact accepted
  // 7. repositories 一致
  const artifactHash = sha256(content);
  return { passed: issues.length === 0, issues, artifactHash };
}
```

---

# 10. Human Gate（人工确认）

## 10.1 定位

Human Gate 只负责**机器无法可靠判断的决策**：

| 阶段     | Human Gate 判断                                    |
| -------- | -------------------------------------------------- |
| explore  | 需求理解是否正确、影响分析是否充分                 |
| prd      | 业务是否正确、范围是否合理、验收标准是否合理       |
| design   | 架构方案是否接受、风险是否可接受                   |
| task     | Task 拆分是否合理                                  |
| dev      | 实现是否符合设计                                   |
| test     | Evidence 是否足够                                  |
| converge | 哪些知识晋升 standards/product、是否允许 completed |

## 10.2 CLI 交互

```
机门禁通过 ✓
人门禁待确认：请 review CHG-0001/prd.md 的以下段落：
  - §1 背景
  - §2 用户价值
  - §5 验收标准
批准？(approve/reject/bypass) ›
```

CLI 负责：展示待 review 内容 → 收集显式批准/拒绝/绕过 → 记录 Gate Result。

**OpenSpec 不自动代表人类批准。**

## 10.3 Bypass 可审计

`--bypass-human-gate` 不等价于 `approved`。

如果保留绕过机制（见 §10.4 选择），改成语义明确的：

```bash
openspec gate approve CHG-0001 --stage prd --bypass --reason "integration-test"
```

保存：

```yaml
human:
  status: bypassed
  reason: integration-test
  reviewed-at: "2026-08-25T22:10:00+08:00"
  artifact-hash: "sha256:abc123..."
```

**`bypassed ≠ approved`**，在 metadata / workflow output / convergence / audit 中可追踪。

## 10.4 v0.1 Bypass 策略选择

> **选择：v0.1 不向 CLI 暴露 bypass，且 TransitionService 不识别 bypassed 状态推进。**

理由：

1. v0.1 无真实多用户系统，bypass 缺乏责任人
2. 测试层通过依赖注入模拟 Human Approval（直接写 `status: approved`），不需要 bypass 路径
3. 避免误用——bypass 应是受控的例外操作，不是常规流程
4. 避免死代码——若 CLI 不暴露 bypass 但 TransitionService 实现了 bypassed 推进分支，该分支仅被测试覆盖，是过早抽象

实现：

- `gate approve` 命令不暴露 `--bypass` 选项（v0.1）
- TransitionService 见 `human.status === bypassed` 时视为未通过，返回 `WAITING_FOR_HUMAN`（与 pending/rejected 同处理）
- GateRepository 数据结构保留 `bypassed` 枚举值（为 v0.2 CLI 暴露做准备），但 v0.1 任何路径都不会写入此值
- 测试模拟 Human Approval 直接写 `status: approved`，不走 bypassed
- v0.2 引入 CLI bypass 时，同步开放 TransitionService 识别 bypassed 推进分支（含 reason + hash 校验）

---

# 11. gate.yaml 配置

## 11.1 与 skill.yaml 的职责划分

| 文件         | 声明                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `skill.yaml` | Skill 元数据与 Artifact Contract（`id/stage/input/output/requires-state/produces-state/output-artifacts`） |
| `gate.yaml`  | 具体门禁规则（Machine Gate 校验项 + Human Gate review 段）                                                 |

**不重复维护同一份规则。** `skill.yaml` 声明"此 Skill 有哪些 Gate"（通过 `produces-state` 隐含），`gate.yaml` 声明"具体 Machine/Human Gate Rules"。

当前 `skill.yaml` **没有** gates 字段，不存在重复。Phase 1.5 不在 `skill.yaml` 加 gates 字段。

## 11.2 gate.yaml Schema

```yaml
# skills/sdd-prd/gate.yaml
stage: prd
artifact: prd.md

machine-checks: # Gate 级校验项（Machine Gate 执行）
  - required-front-matter
  - no-placeholder
  - required-sections
  - cross-reference-valid
  - repositories-match-metadata

required-front-matter: # machine-checks: required-front-matter 的具体字段
  - change-id
  - requirement

required-replacements: # machine-checks: no-placeholder 的具体占位符
  - scope-in
  - scope-out

non-empty-ai-sections: # machine-checks: required-sections 的具体标题
  - "## 1. 背景"
  - "## 2. 用户价值"
  - "## 3.1 包含"
  - "## 3.2 不包含"

human-checks: # Human Gate review 段
  - "## 1. 背景"
  - "## 2. 用户价值"
  - "## 5. 验收标准"
```

## 11.3 7 个 Skill 的 gate.yaml 契约表

| Skill        | artifact                | machine-checks 重点                                                         | human-checks review 段              |
| ------------ | ----------------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| sdd-explore  | exploration.md          | feature-path/decision 已填；§1 需求理解非空                                 | §1 需求理解 / §3 影响分析           |
| sdd-prd      | prd.md                  | scope-in/scope-out 已替换；§1/§2/§5 非空                                    | §1 背景 / §2 用户价值 / §5 验收标准 |
| sdd-design   | design.md               | repos-involved 已填；§1/§2 非空；前置 prd accepted                          | §1 当前状态 / §2 提议方案 / §5 风险 |
| sdd-task     | tasks.md                | design-source 引用合法；每个 TASK 四项非空                                  | TASK 清单完整性                     |
| sdd-dev      | implementation.md       | tasks-source/primary-repo 已填；§2 Commit 表非空；前置 tasks accepted       | §2 Commit×Task / §4 完成情况        |
| sdd-test     | evidence/test-report.md | implementation-source 引用合法；§2 汇总表非空；前置 implementation accepted | §1 测试范围 / §3 证据清单           |
| sdd-converge | convergence.md          | 前序全部 accepted；4 个 need-update 已填；§4 checklist 打勾（见 §15）       | §1 知识增量 / §2 更新判断           |

---

# 12. Workflow Engine（Coordinator）

## 12.1 定位

Workflow Engine 是 **Coordinator**，不是 AI 执行器。

职责：

- Skill Invocation Coordination（协调下一 Skill）
- Artifact Readiness Detection（检测产物是否就绪）
- Gate Evaluation（评估 Gate 状态）
- Lifecycle Transition（调用 TransitionService）
- Next Stage Selection（选下一阶段）
- Pause / Resume（暂停/续跑）

**不负责 AI 推理。** 因为没有 Agent Runtime，Workflow 不能假设调用 `skill run` 后语义 Artifact 就完成。

## 12.2 执行模型

```
openspec workflow run default --change CHG-0001

    ↓
读取 Change 当前状态
    ↓
定位当前需要的 Skill（如 exploring → sdd-prd）
    ↓
检查对应 Artifact 是否存在
    │
    ├── 不存在 / 未完成
    │       ↓
    │   Prepare Skill Invocation
    │   Generate Instruction
    │   return WAITING_FOR_ARTIFACT
    │
    └── Artifact 已存在
            ↓
        Machine Gate
            ↓
        failed → return WAITING_FOR_MACHINE_FIX
            ↓
        passed
            ↓
        Human Gate
            ↓
        pending → return WAITING_FOR_HUMAN
            ↓
        approved / bypassed
            ↓
        TransitionService.requestTransition()
            ↓
        Change State Advance
            ↓
        Next Stage（循环）
```

## 12.3 Workflow Result 状态

Workflow Engine 每次运行返回统一状态：

```
WAITING_FOR_ARTIFACT     — Artifact 不存在或未完成，需外部 Agent 按 Instruction 产出
WAITING_FOR_MACHINE_FIX — Machine Gate failed，需修复 Artifact
WAITING_FOR_HUMAN        — Human Gate pending，需 gate approve
ADVANCED                 — 状态已推进到下一阶段，继续下一 Skill
COMPLETED                — 全部阶段完成，Change 到 completed
```

## 12.4 Persisted State + Resume

Phase 1.5 v0.1 采用 **Persisted State + Resume**，不是常驻 Workflow Process。

Workflow 不通过长时间挂起进程来"等待人类"。每次 `workflow run` 是一次性的：

1. 读当前状态
2. 跑到下一个暂停点
3. 返回 WAITING 状态
4. 进程结束

外部 Agent / 人处理后，再次 `workflow run` 从当前状态续跑：

```
CHG = exploring
    ↓ workflow run
prd.md 不完整 → WAITING_FOR_ARTIFACT
    ↓ 外部 Agent 按 Instruction 完成 prd.md
    ↓ workflow run
Machine Gate passed → Human Gate pending → WAITING_FOR_HUMAN
    ↓ openspec gate approve CHG-0001 --stage prd
    ↓ workflow run
TransitionService: exploring → specified
    ↓ 准备 sdd-design invocation
    ↓ WAITING_FOR_ARTIFACT
```

## 12.5 Workflow 定义

`workflows/default.yaml`：

```yaml
id: default
name: SDD 完整生命周期
description: 从需求探索到知识沉淀的完整 SDD 流程

# state-map：每个 stage 显式声明 from-state / to-state / skill / artifact / gate
# TransitionService 通过 to-state 反查此表定位 Skill 和 Artifact，不反查 skill.yaml
#（避免 state→skill→gate.yaml→artifact 的循环依赖，见 §8.2 第 3 步）
stages:
  - skill: sdd-explore
    gate: explore
    from-state: created
    to-state: exploring
    artifact: exploration.md
  - skill: sdd-prd
    gate: prd
    from-state: exploring
    to-state: specified
    artifact: prd.md
  - skill: sdd-design
    gate: design
    from-state: specified
    to-state: designed
    artifact: design.md
  - skill: sdd-task
    gate: task
    from-state: designed
    to-state: tasked
    artifact: tasks.md
  - skill: sdd-dev
    gate: dev
    from-state: tasked
    to-state: developing
    artifact: implementation.md
  - skill: sdd-test
    gate: test
    from-state: developing
    to-state: testing
    artifact: evidence/test-report.md
  - skill: sdd-converge
    gate: converge
    from-state: testing
    to-state: completed
    artifact: convergence.md
```

v0.1 阶段序列由状态机决定（线性 9 态），workflow.yaml 定义阶段 → Skill → Artifact → Gate 显式映射。TransitionService 接收 `targetState` 后查 `stages[].to-state` 拿到对应 Skill + Artifact，无需通过 `skill.yaml` 的 `produces-state` 反查。

## 12.6 v0.1 Trade-off

> **承认：v0.1 Workflow Engine 实际价值有限，主要是 Agent Runtime 出现后的脚手架。**

v0.1 没有 Agent Runtime，Human Gate 必须人工 `openspec gate approve`，因此 `workflow run` 大概率跑 1 步就停在 `WAITING_FOR_HUMAN`，与用户手动 `gate approve` + `change status --set` 在效果上等价。

实施取舍：

- 实现 §12.1-12.5 全部职责（状态机 + Resume），但**不**为 v0.1 单独增加调度优化、并行执行、批处理等
- `workflow run` 在 v0.1 的实际价值：① 让"当前在哪一步、需要什么"显式化（CLI 输出）；② 为后续 Agent Runtime 提供可调用的 Coordinator API
- 后续 Agent Runtime 接入后，Workflow Engine 直接复用，TransitionService 仍是唯一推进入口

---

# 13. openspec 命令设计

## 13.1 gate 命令

```bash
openspec gate check <CHG> --stage <stage>      # 跑 Machine Gate，保存结果，报告通过/未通过项
openspec gate approve <CHG> --stage <stage>     # Human Gate 确认（@clack 交互，保存结果）
openspec gate status <CHG> --stage <stage>     # 查看 Gate 状态（Artifact/Machine/Human/Hash）
```

### gate check

跑 Machine Gate，保存 Gate Result 到 metadata.yaml，**不推进状态**。

### gate approve

Human Gate 确认，保存 Gate Result，**不推进状态**。

只做：

```
Human Gate = approved
保存 reviewer / reviewed-at / artifact-hash
```

不偷偷触发 `patchStatus(specified)`。

### gate status

查看：

```
Artifact: prd.md
Artifact Status: draft

Machine Gate:
  status: passed
  hash: sha256:abc123...
  checked-at: 2026-08-25T22:00:00+08:00

Human Gate:
  status: pending
  hash: -

Current Artifact Hash:
  sha256:abc123...
```

如果 `change show` 已能清晰展示这些信息，可不新增此命令（见 §13.4）。

## 13.2 workflow 命令

```bash
openspec workflow list                        # 列出可用 Workflow
openspec workflow show <name>                 # 显示阶段序列
openspec workflow run <name> --change <CHG>   # 从当前状态跑到下一个暂停点
```

`workflow run` 返回 Workflow Result 状态（WAITING_FOR_ARTIFACT / WAITING_FOR_HUMAN / ADVANCED / COMPLETED）。

## 13.3 change status 增强

`change status --set` 改走 TransitionService：

```js
// change.js status --set（Phase 1.5 改）
const result = await requestTransition(changeDir, opts.set, { harnessRoot });
if (!result.advanced) {
  throw new Error(`Cannot advance: ${result.reason}`);
}
ok(`${id} status: ${result.reason}`);
```

不再直接调 `validateTransition` + `patchStatus`。

## 13.4 skill run 修改

`skill run` **不推进状态**。删除 `runSkillSkeleton` 中的 `validateTransition` + `patchStatus`。

```js
// skill.js runSkillSkeleton（Phase 1.5 改）
// 1. 校验 --change + Change 存在
// 2. 校验 Change.status === requires-state（只读校验，不推进）
// 3. 写 Artifact（ArtifactWriter）
// 4. 可选执行 Machine Gate（gate check）
// 5. 生成 Instruction
// 结束。不调 patchStatus，不调 requestTransition。
```

Skill 执行结束 Artifact 保持 `draft` 状态。

## 13.5 CLI 装配

```js
import { registerGateCommand } from "./commands/gate.js";
import { registerWorkflowCommand } from "./commands/workflow.js";

registerChangeCommand(program); // 改：走 TransitionService
registerSkillCommand(program); // 改：不推进状态
registerGateCommand(program); // 新增
registerWorkflowCommand(program); // 新增
```

---

# 14. Skill 职责边界修正

## 14.1 当前问题（Phase 1.4）

Phase 1.4 的 `skill.js` `runSkillSkeleton` 在产出 Artifact 后直接：

```js
validateTransition(current, producesState);
await patchStatus(changeDir, producesState); // ← 绕过 Human Gate
```

这违反了"Skill 产出 ≠ 阶段完成"原则。

## 14.2 Phase 1.5 修正

删除 `skill.js` 中所有直接 `patchStatus` 调用。`skill run` 的职责变为：

```
openspec skill run sdd-prd --change CHG-0001
    ↓ 加载 Skill 定义
    ↓ 准备 Invocation Context
    ↓ 创建/更新 Artifact Draft
    ↓ 生成 Instruction
    ↓ 可选执行 Machine Gate（gate check）
    ↓ 结束（不推进状态）
```

状态推进只能通过：

- `openspec change status --set <state>` → TransitionService
- `openspec workflow run` → TransitionService

## 14.3 同步修正 sdd-explore

sdd-explore 当前（Phase 1.4）也直接调 `patchStatus`。Phase 1.5 同样删除，sdd-explore 产出 `exploration.md` + `requirement.md` 后结束，状态推进由 TransitionService 在 Gate 通过后执行。

---

# 15. sdd-converge Gate 加强

## 15.1 Machine Gate

`sdd-converge` 不只是"convergence.md 存在"。Machine Gate 至少检查：

| 校验项                          | 说明                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| 前序全部 accepted               | exploration/prd/design/tasks/implementation/evidence 全部 artifact.status === accepted |
| Evidence 已完成                 | evidence/test-report.md 存在且 accepted                                                |
| Knowledge Classification 已完成 | convergence.md 的 4 个 need-update 字段已填（yes/no）                                  |
| Standards 更新                  | 有更新记录 或 明确 no-update                                                           |
| Product 更新                    | 有更新记录 或 明确 no-update                                                           |
| Implementation 未被复制         | implementation/ 内容未被复制到 Knowledge World                                         |

## 15.2 Human Gate

最终确认：

- 哪些知识晋升 `standards/`
- 哪些知识晋升 `product/`
- 哪些仅保留 `delivery/archive/`
- 是否允许 Change completed

## 15.3 知识沉淀原则（不变）

```
Change
   ↓ sdd-converge
   ├── standards/           长期知识（择优晋升）
   ├── product/             长期知识（择优晋升）
   ├── implementation/      原位，不复制
   ├── delivery/reports/    报告
   └── delivery/archive/    全量归档
```

`convergence.md` 是知识收敛账本，不是长期知识本身。

Archive 仍作为后续显式生命周期动作：`completed → archived`。

---

# 16. 错误处理

沿用 Phase 1.3/1.4 模式：

- 不在 workspace 内：`Not an OpenSpec Workspace (no .sdd/ found). Run 'openspec init' first.`
- Workflow 不存在：`Workflow not found: <name>. Run 'openspec workflow list'.`
- gate.yaml 不存在：`Gate config not found for skill: <id>. Run 'openspec skill show <id>'.`
- Machine Gate failed：`Machine gate failed for <CHG>/<stage>: <issue1>; <issue2>; ...`
- Human Gate 未审批：`Human gate not approved. Run 'openspec gate approve <CHG> --stage <stage>'.`
- Hash 不匹配（Artifact 已修改）：`Gate stale: artifact modified after gate. Re-run 'openspec gate check'.`
- TransitionService 拒绝推进：`Cannot advance to <target>: <reason> (WAITING_FOR_*)`
- @clack 取消：`cancel` + `outro('Canceled.')` + `process.exit(1)`

---

# 17. 测试要求

## 17.1 工具

沿用 Phase 1.2/1.3/1.4：Node 原生 `node --test` + `assert/strict` + `mkdtemp` 临时目录。

## 17.2 新增测试场景

### Gate Persistence

- Machine Gate passed 后 `metadata.artifacts.<artifact>.gates.machine` 正确保存
- Human Gate approved 后 `metadata.artifacts.<artifact>.gates.human.status = approved`

### Human Approval 不推进状态

- `gate approve` 后 Human Gate = approved，**但 Change State 不改变**

### Artifact Hash Invalidation

```
machine passed + human approved
    ↓ 修改 Artifact
    ↓ requestTransition()
→ 失败，提示 Gate 已过期（hash 不匹配）
```

### GateRepository ReadBack

- `writeMachineGate` 后 `readGateResult` 返回的字段值与写入完全一致（status / checked-at / validator / artifact-hash / issues）
- `writeHumanGate` 后 `readGateResult` 同样全字段一致
- 多层嵌套路径写入正确（`artifacts.<name>.gates.machine.*` 和 `artifacts.<name>.gates.human.*`），不会因 `setIn` 路径错位而静默写错位置

### Skill Run 不推进状态

- `skill run` 完成后 Change State **不推进**
- Artifact 保持 `draft`

### Phase 1.4 SkillRunner 测试改写（已选定方案 B）

> **方案选择：B（测试职责清晰化）** —— 状态推进覆盖迁移到 integration.spec.js 走完整 TransitionService 链路。
> 放弃方案 A（仅删 patchStatus 断言）的原因：`runSkillStep` 当前是测试 helper 自己调 `patchStatus`，仅改断言会让 helper 仍然走"绕过门禁推进状态"的旧路径，与 Phase 1.5"唯一推进入口是 TransitionService"的硬约束相违背。

#### tests/skill.spec.js 修改

`runSkillStep` helper（[L392-427](file:///d:/Desktop/OpenSpec-AI-Development-Harness/tests/skill.spec.js#L392-L427)）当前在 L419-424 直接调 `validateTransition` + `patchStatus` 推进状态。修改：

- **删除** L419-424 的 `validateTransition` + `patchStatus` + `metaAfter.status === cfg.to` 断言
- **改为**：仅断言 Artifact 写出 + 内容包含 change-id + `metaAfter.status === cfg.from`（状态保持不变）
- `setupWorkspaceForSkillRunner` + `runSkillStep` 保留作为"Skill 产出 Artifact"的白盒测试

6 个 `SkillRunner: *` 测试（[L429-501](file:///d:/Desktop/OpenSpec-AI-Development-Harness/tests/skill.spec.js#L429-L501)）保留在 skill.spec.js，只验证"Skill 写 Artifact + 不推进状态"。

"7 状态串完整生命周期"测试（[L503-551](file:///d:/Desktop/OpenSpec-AI-Development-Harness/tests/skill.spec.js#L503-L551)）**删除**——其状态推进语义与 Phase 1.5 硬约束相违背，迁移到 integration.spec.js。

#### tests/integration.spec.js 扩展

新增 "TransitionService 端到端 7 状态完整生命周期" 测试：

- `runInit` → `runChangeCreate`（status: created）
- 循环 7 次（每个 Skill）：写 Artifact → `runMachineGate`（设 passed + artifact-hash）→ `writeHumanGate({status:'approved', artifact-hash})` → `requestTransition(changeDir, to-state)` → 验证状态推进 + Artifact status=accepted
- 覆盖 hash mismatch → `advanced:false` + reason 含 "hash mismatch"
- 覆盖 Machine Gate failed → `advanced:false`
- 覆盖 Human Gate pending → `advanced:false` + `WAITING_FOR_HUMAN`
- 覆盖 `skill run` 后状态不推进（Artifact 仍是 draft，需写明这是 v0.1 由外部 Agent 模拟）

这个测试成为 Phase 1.5 端到端验收的核心用例，替代原 skill.spec.js 的"7 状态串"测试。

### TransitionService

- 只有 `Machine passed + Human approved + Hash current` 才成功推进
- 任一条件不满足 → 返回 `{ advanced: false, reason }`

### Bypass

- v0.1 测试**不**通过 `bypassed` 路径模拟 Human Approval，直接写 `status: approved`
- `bypassed` 数据结构在 GateRepository 保留（枚举值存在），但 v0.1 任何代码路径都不会写入
- `bypassed ≠ approved`（v0.1 TransitionService 见 `bypassed` 视为未通过，见 §10.4）
- v0.2 引入 CLI bypass 后，再补充 bypassed 推进分支的测试（含 reason + hash 校验）

### Workflow WAITING

- Artifact 未完成 → `WAITING_FOR_ARTIFACT`
- Human 未审批 → `WAITING_FOR_HUMAN`
- Machine failed → `WAITING_FOR_MACHINE_FIX`
- 重新运行后可续跑

## 17.3 测试文件

| 文件                             | 测试点                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `tests/gate.spec.js`             | GateConfigLoader / GateValidator / GateRepository ReadBack / ArtifactHash           |
| `tests/workflow.spec.js`         | WorkflowLoader / WorkflowEngine（WAITING/RESUME / state-map 查表）                  |
| `tests/integration.spec.js` 扩展 | TransitionService 端到端 / Workflow 断点续跑 / Hash 失效 / 7 状态完整生命周期       |
| `tests/skill.spec.js` 修改       | SkillRunner: 删除状态推进断言 → 改断言状态保持 / Artifact 存在（见 §17.2 改写策略） |

---

# 18. 分支策略与提交切分

## 18.1 分支策略

从 master 拉 `feat/phase-1.5-workflow-engine`：

```bash
git checkout master
git checkout -b feat/phase-1.5-workflow-engine
```

## 18.2 提交切分

单次 feat 提交（对齐 Phase 1.3/1.4 模式）：

- `core/sdd/` 新增 7 模块
- `skills/sdd-*/` 7 个 gate.yaml
- `workflows/default.yaml`
- `cli/openspec/src/commands/gate.js` + `workflow.js` + `index.js` 注册
- `change.js` 改走 TransitionService
- `skill.js` 删除 patchStatus
- `templates/artifacts/metadata.yaml` schema 扩展 artifacts 段
- `tests/gate.spec.js` + `tests/workflow.spec.js` + `integration.spec.js` 扩展
- `package.json` files 加 `"workflows"`
- `plans/phase-1.5-workflow-engine-design.md`

---

# 19. 验收标准

Phase 1.5 完成后必须保证：

1. Gate Model 与 Phase 1.3 定义一致（需 Phase 1.3 同步补充，见 Consistency Report）
2. Gate Result 持久化到 `metadata.yaml` 的 `artifacts` 段
3. Machine Gate 与 Artifact Hash 绑定
4. Human Gate 与 Artifact Hash 绑定
5. Artifact 修改后旧 Gate 自动失效（hash 不匹配）
6. `skill run` 不直接推进 Change State
7. `gate approve` 不直接推进 Change State
8. 所有状态推进统一经过 TransitionService
9. `patchStatus` 不再被 CLI/Workflow 直接作为生命周期 API 使用
10. Machine Gate 不粗暴扫描 Artifact 全部 checkbox（区分 Gate Checklist vs Domain Checklist）
11. Workflow 不执行 AI 推理
12. Workflow 支持 WAITING / BLOCKED / RESUME
13. Human bypass 如存在必须可审计（`bypassed ≠ approved`）
14. sdd-converge Gate 包含知识晋升与冲突处理校验
15. Phase 1.5 不引入 Agent Runtime / LLM / Prompt Engine
16. Workflow `default.yaml` 显式声明 `state→{skill, artifact, gate}` 映射，TransitionService 通过此表查表，不反查 `skill.yaml`
17. v0.1 TransitionService 不识别 `bypassed` 推进（视为未通过），`bypassed` 数据结构保留待 v0.2
18. GateRepository 写入后 readBack 验证全字段一致（多层嵌套路径不静默错位）

**不验收（属后续）**：全自动无人流转、跨 Change 编排、Workflow DAG 可视化、门禁规则 DSL、AI 语义评分、CLI bypass 暴露。

---

# 20. 后续阶段

## 20.1 Agent Runtime / LLM / Prompt Engine

后续实现模型调用与对话管理，使 Skill 可由 Harness 自身驱动。届时 Workflow 可调用 Agent Runtime 执行 Skill，但 TransitionService 仍是唯一推进入口。

## 20.2 全自动无人流转

当 Agent Runtime 成熟、模型产出质量可信时，Human Gate 可配置为可选 bypass（需审计），实现全自动 explore → converge。

## 20.3 Artifact 双角色分离

若 Workflow 需程序化消费结构化字段，评估 front-matter 扩展或内嵌 YAML 块（见 §9 议题，Phase 1.5 v0.1 不做）。

---

# 21. 关键复用函数（core/sdd Phase 1.3/1.4 已落地，不重写）

- `runChangeCreate` / `readMetadata` / `patchMetadata` / `patchStatus`（[change-model.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/change-model.js)）— `patchStatus` 降为 internal primitive
- `validateTransition` / `nextStatuses` / `isValidStatus`（[change-state-machine.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/change-state-machine.js)）
- `loadSkill` / `listSkills`（[skill-loader.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/skill-loader.js)）
- `assembleContext`（[context-assembler.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/context-assembler.js)）
- `buildInstruction`（[instruction-builder.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/instruction-builder.js)）
- `writeArtifact`（[artifact-writer.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/sdd/artifact-writer.js)）
- `getHarnessRoot()`（[harness-root.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/core/workspace/harness-root.js)）
- `resolveWorkspaceRoot()`（CLI 层）
- @clack 交互封装范本：[change-prompts.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/lib/change-prompts.js)
- CLI 瘦编排范本：[change.js](file:///d:/Desktop/OpenSpec-AI-Development-Harness/cli/openspec/src/commands/change.js)

---

# 22. bootstrap 说明

Phase 1.5 自身的实现走 git 分支管理，**不**为本 Phase 的提交创建 CHG 目录（先有鸡先有蛋，对齐 Phase 1.3/1.4）。Phase 1.5 落地后，`openspec workflow run default` 即可演示门禁驱动流转；后续 Harness 自身演进强制走完整 SDD 生命周期流程（用 Phase 1.5 自己的门禁校验自己的产物）。

---

# 总结

Phase 1.5 = Gate-driven Workflow Engine：

```
Skill 产出 Artifact Draft
    ↓
Machine Gate（确定性校验，自动）
    ↓ passed
Human Gate（人工确认，暂停式）
    ↓ approved
Artifact Accepted（hash 绑定，内容变则失效）
    ↓
TransitionService（唯一状态推进入口）
    ↓
Change State Advance
    ↓
Workflow Coordinator（协调下一 Skill，WAITING/RESUME）
```

三个 Phase 的职责最终为：

```
Phase 1.3  定义 Artifact / Gate / Lifecycle
Phase 1.4  实现 Skill / Invocation / Artifact Producer
Phase 1.5  实现 Gate / Transition / Workflow Coordination
```

最终原则：

> Skill 产出不等于阶段完成。
> Machine Gate 通过不等于阶段完成。
> Human Gate 批准后，也必须由统一 TransitionService 检查当前 Artifact 版本和生命周期条件后才能推进。
> Artifact 内容发生变化，旧审批自动失效。
> Workflow 负责协调，不负责 AI 推理。
> Change Lifecycle State 只表达已经正式接受的阶段结果，而不是"某个文件已经生成"。
