# sdd-converge Rules

## R1：生命周期约束

- 必须在 `testing` 状态启动，推进到 `completed`
- `completed` 是接近终态；之后人工决定是否 `openspec change archive` 转为 archived

## R2：知识只读 + 人工确认写入

- 本 Skill **不直接写 standards/ 或 product/**，只在 convergence.md 中记录判断
- 真正的知识写回（新标准、新 Feature、新 SPEC、新术语）需：
  1. 外部 Agent 建议具体改动
  2. 人工 review 并批准
  3. 单独创建 Commit 与 PR 写入

## R3：不回写前序 Artifact

- convergence 阶段只写 convergence.md，不修改前序 6 阶段 Artifact
- 发现前序 Artifact 有误时，在 convergence.md §1 记录说明（不改原文）

## R4：状态推进约束

- patchStatus(completed) 前必须 validateTransition(testing, completed)
