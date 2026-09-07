# sdd-converge Rules

## R1：生命周期约束

- 必须在 `testing` 状态启动，推进到 `completed`
- `completed` 是接近终态；之后人工决定是否 `openspec change archive` 转为 archived

## R2：知识只读 + 人工确认写入

- 本 Skill **不直接写 standards/ 或 product/specs/**，只在 convergence.md 中记录判断与候选
- Spec 晋升候选、新标准、新 Feature 节点、新术语的真正写回需：
  1. 外部 Agent 在 convergence.md 写明候选内容与落点
  2. 人工 review 并批准
  3. 单独创建 Commit 与 PR 写入（feature-tree 节点走 `openspec` 命令，不手写 yaml）

## R3：不回写前序 Artifact

- convergence 阶段只写 convergence.md，不修改前序各阶段 Artifact
- 发现前序 Artifact 有误时，在 convergence.md §1 记录说明（不改原文）

## R4：全局验收对照

- §4 全局验收标准对照表必须逐条覆盖 change-spec §5（inline 模式 spec.md §5），全部通过是 Human Gate 前置
- 多 Story 模式跨 Story 集成验收点必须给集成证据

## R5：状态推进约束

- patchStatus(completed) 前必须 validateTransition(testing, completed)
