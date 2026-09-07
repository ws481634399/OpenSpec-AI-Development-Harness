# sdd-review Rules

## R1：生命周期约束

- 必须在 `testing` 状态启动；本 Skill 是同态检查点，**不推进 Change 状态**
- review-report.md 双门禁通过后仅置 accepted（经 WorkflowEngine → TransitionService.requestCheckpoint）
- 不调用 patchStatus / 不绕过 Transition Service

## R2：证据约束

- 所有发现必须登记为 evidence.yaml 的 review-finding 条目（不写口头结论）
- target 必须可定位（`spec.md#AC-NNN` / `tasks.md#DU-XXX` / `design.md#<section>` / `文件:symbol`）
- blocker/major 闭环时 resolution 必须引用修复证据（新 code-change/test-run 的 EV id）
- minor 允许开放，但必须留档

## R3：只读分析

- 不直接修改业务代码；修复动作产生的变更走新证据条目记录
- 不修改 spec.md / design.md / implementation.md / tasks.md / test-report.md
- 代码质量 finding 必须有 standards/ 明确依据，无依据不记

## R4：职责边界

- 知识同步检查只输出候选清单（§1.4），沉淀由 sdd-converge 执行
- 与 sdd-test 的边界：sdd-test 产出测试证据，sdd-review 检查证据对 AC 的覆盖
