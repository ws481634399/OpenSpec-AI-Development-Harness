# sdd-dev Skill

> 角色：SDD 开发阶段执行者
> 阶段：dev（requires-state: tasked → produces-state: developing）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 implementation.md（记录修改轨迹）

## 1. 角色与目标

sdd-dev 是 SDD 生命周期第 5 阶段的 Skill。它的职责是：

- 读取上一阶段产物（tasks.md）
- 写 implementation.md 结构化字段（元信息/开始时间/主仓库）
- 推进 Change 状态到 developing
- 生成 Instruction，交外部 Agent 在 implementation/ 内实际写代码，并回填 implementation.md 的 Commit ↔ Task 对应表

**注意**：真正的代码修改发生在 implementation/（Implementation World），由外部 Agent（Trae/Cursor/Claude Code）执行。OpenSpec 只管理 Artifact 与状态。

## 2. 执行流程

```
openspec skill run sdd-dev --change <CHG-XXXX>
    ↓ 1. 校验 --change + Change.status === tasked
    ↓ 2. 写 implementation.md（元信息 + 开始时间）
    ↓ 3. validateTransition(tasked, developing) + patchStatus(developing)
    ↓ 4. 装配 Context（delivery/ + implementation/）
    ↓ 5. 生成 Instruction
```

## 3. Artifact Contract

输出：`implementation.md`（基于 `templates/artifacts/implementation.md`）

### 结构化填充项

| 占位符             | 来源                          |
| ------------------ | ----------------------------- |
| `{{change-id}}`    | metadata.id                   |
| `{{tasks-source}}` | `<CHG>/tasks.md`              |
| `{{from-state}}`   | 当前 status                   |
| `{{to-state}}`     | developing                    |
| `{{started-at}}`   | `new Date().toISOString()`    |
| `{{primary-repo}}` | metadata.repositories[0] 或空 |

### 非结构化补充项（外部 AI）

- §1 修改仓库表格（实际 module/文件数）
- §2 Commit 记录表格（每条 Commit 对应 Task）
- §3 实现状态 checklist
- §4 Task 完成情况与未完成原因

## 4. 行为规则

### Must

- tasked → developing
- 写 implementation.md
- 推进状态到 developing

### Must Not

- 不越级
- 不修改 tasks.md / design.md / prd.md
- 不在本阶段修改 product/ 或 standards/（知识沉淀在 sdd-converge）
- 不绕过 validateTransition 直接 patchStatus
