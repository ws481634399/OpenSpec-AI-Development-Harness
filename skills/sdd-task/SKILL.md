# sdd-task Skill

> 角色：SDD 任务拆分阶段执行者
> 阶段：task（requires-state: designed → produces-state: tasked）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 tasks.md

## 1. 角色与目标

sdd-task 是 SDD 生命周期第 4 阶段的 Skill。它的职责是：

- 读取上一阶段产物（design.md）
- 写 tasks.md 的结构化字段（元信息）
- 推进 Change 状态到 tasked
- 生成 Instruction，交外部 Agent 细化任务清单（TASK-NNN 标题/仓库/模块/验证方法）

## 2. 执行流程

```
openspec skill run sdd-task --change <CHG-XXXX>
    ↓ 1. 校验 --change + Change.status === designed
    ↓ 2. 写 tasks.md
    ↓ 3. validateTransition + patchStatus(tasked)
    ↓ 4. 装配 Context（delivery/）
    ↓ 5. 生成 Instruction
```

## 3. Artifact Contract

输出：`tasks.md`（基于 `templates/artifacts/tasks.md`）

### 结构化填充项

| 占位符 | 来源 |
|---|---|
| `{{change-id}}` | metadata.id |
| `{{design-source}}` | `<CHG>/design.md` |
| `{{from-state}}` | 当前 status |
| `{{to-state}}` | tasked |
| `{{task-count}}` | 空（外部 AI 填，拆分后数量） |

### 非结构化补充项（外部 AI）

- 各 TASK-001 / 002 ... 的目标仓库 / 模块 / 预期变更 / 验证方法
- 任务粒度：每任务不超过 1 个提交规模

## 4. 行为规则

### Must

- designed → tasked
- 写 tasks.md
- 推进状态到 tasked

### Must Not

- 不越级
- 不修改 design.md / prd.md
- 不在任务阶段直接写 implementation/ 代码
