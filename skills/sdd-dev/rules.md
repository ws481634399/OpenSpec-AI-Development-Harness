# sdd-dev Rules

## R1：生命周期约束

- 必须在 `tasked` 状态启动，推进到 `developing`

## R2：代码修改与 Artifact 分离

- 代码修改在各仓 implementation/（Implementation World），由外部 Agent 实际执行；按 DU 逐个实施，不跨仓改码
- OpenSpec 本 Skill 只写 implementation.md 记录轨迹（Workspace 聚合 + repo 侧分册），**不直接写实现代码**
- Commit 与 DU 的对应必须 1:1 或 n:1，不允许一个 Commit 跨多个 DU（可接受的反例：跨 DU 共享重构，但要在 repo implementation.md `## Deviations` 说明）
- 实现与 Sketch/Pseudocode/Design Contract 的偏离必须记入 `## Deviations`，禁止未记录偏离

## R3：工程规范

- 代码必须遵循 standards/engineering/* 规范（前端目录结构/后端分层/命名/API 设计）
- 禁止使用 project_memory.md hard_constraints 中明确禁止的模式（如 Controller → Mapper 直连、SQL 拼接、密码/Tokens 日志等）

## R4：Artifact 写入约束

- 不修改 tasks.md 以上阶段的 Artifact
- patchStatus 前 validateTransition(tasked, developing)
- DU 完成必须 `openspec du sync-status` 回传（含 result commit 与证据引用）；未回传不得推进
