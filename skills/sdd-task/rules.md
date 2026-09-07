# sdd-task Rules

sdd-task 阶段必须遵守的硬约束（Delivery Decomposition + Delivery Unit Specification）。

## R1：生命周期约束

- 必须在 `designed` 状态启动，输出推进到 `tasked`
- patchStatus(tasked) 前必须 validateTransition(designed, tasked)
- 禁止越级

## R2：DU 分解一致性

- Change 1:N DU；**DU 1:1 Repository**（跨仓交付必须拆成多个 DU）
- affected-repositories 的每个仓库至少有 1 个 DU
- 每个 DU 的 Scope 必须能追溯到 design.md §2/§3 的变更点，不允许凭空增加 design 范围外的 DU
- spec 的每条 AC-NNN 必须映射到某 DU 的 Acceptance
- 跨仓依赖必须显式声明且无循环（被依赖仓先完成契约冻结）

## R3：Design/Task 分层

- design.md 中不得出现 DU-XXX 编号与实现级伪代码（Design 不产生 DU）
- Sketch/Pseudocode 属 Task 产物，只写入 tasks.md，禁止上浮 design.md
- Implementation Sketch 必填；Pseudocode 按 complexity-trigger 条件必填；Verification 必填

## R4：Artifact 与目录约束

- 不修改 design.md / spec.md / exploration.md / requirement.md
- 不直接写 implementation/ 代码（实施由 sdd-dev 在 repo 侧执行）
- 不直接创建各仓 delivery/ 目录：统一走 `openspec du create` 注册 + Gate accepted 后 `openspec du materialize` 物化
- feature-path 未绑定时先补绑，禁止跳过

## R5：状态推进约束

- tasks.md 通过双门禁（Machine Gate passed + Human Gate approved）后才推进状态
- 即使 artifact 尚未写完，也不得提前 patchStatus
