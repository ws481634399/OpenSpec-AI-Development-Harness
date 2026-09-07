# sdd-dev Checklist

sdd-dev 执行后，外部 Agent 在各仓内完成实现前，必须检查以下项：

## 1. Guidance 消费（repo 侧）

- [ ] 已按 DU 逐个实现（DU 1:1 仓库），未跨仓改码
- [ ] repo task.md §7 Test Guidance / §8 Review Guidance / §9 Done Criteria 已逐条消费
- [ ] tasks.md 中本仓 DU 的 Implementation Sketch 已落实为真实代码；命中 complexity-trigger 的 Pseudocode 逻辑方向被遵循（不要求逐行）
- [ ] Design Contract（API/Data/Architecture）未被违反；发现契约错误回到 sdd-design 修正，不在实现侧私改
- [ ] 被依赖仓已完成契约冻结（跨仓 DU 按 Execution Order 实施）

## 2. Deviations 记录（repo 侧）

- [ ] 实现与 Sketch/Pseudocode/Design Contract 的每一处偏离都记入 repo implementation.md `## Deviations`，含偏离原因与影响面
- [ ] 偏离后仍满足本仓 DU Acceptance 与 spec AC（否则不标记完成，回到对应阶段修正）
- [ ] 无"未记录的偏离"（sdd-review 检查 b 项：偏离未记 → major finding）

## 3. 代码质量

- [ ] 代码符合本仓规范与 standards/engineering/；已通过本仓 linter / build
- [ ] 实现级验证（开发自测）已完成，结果记录到 evidence/ 或 Repo Test Report
- [ ] Commit 遵循仓库规范，每个 DU 的 result commit hash 可追溯

## 4. 状态回传与聚合

- [ ] 每个完成 DU 已 `openspec du sync-status <id>` 回传（in_progress→completed，含 result commit 与证据引用）
- [ ] Workspace 聚合 implementation.md：§1 DU 状态总览与各仓实际一致；§2 各仓 evidence-ref 引用（不复制正文）；§3 Commit 记录表完整；§4 Fan-in 状态与 du status 一致
- [ ] 前序 Artifact（tasks.md / design.md / spec.md / exploration.md / requirement.md）未被改动
