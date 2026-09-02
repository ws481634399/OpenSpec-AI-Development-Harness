# Phase 4.2 Story 3 收尾：多 Story Workflow 集成测试与 3 个缺陷修复

- **日期：** 2026-09-02
- **阶段：** Phase 4.2 Story 3（Workflow 多 Story 推进 + 向后兼容）
- **状态：** completed

## 目标

恢复中断的 Story 3 开发：核实已落盘改动，补齐集成测试（多 Story 跑通 / inline 兼容 / stale 触发），确保 §10 验收标准达成。

## 范围

- core/sdd
- tests

## 摘要

核实 Story 3 全部代码改动已在盘（transition-service 聚合推进、workflow-engine 多 Story 循环、stale 分层传播、CLI --story 支持、change status Story 表格、instruction-builder Story 上下文）。新增 tests/story-workflow.spec.js 12 个集成用例覆盖多 Story 全链路、inline 兼容与 Stale 分层传播。测试暴露并修复 3 个缺陷：(1) gate-validator 的 feature-path-bound 在 story 模式下误读已清空的 Change 级 feature-path，改为优先读 Story 级 story-metadata.yaml；(2) inline 单 Story Change 传 --story 被静默忽略，改为显式拒绝；(3) story-splitting 循环生成 Instruction 时未传 storyId，导致缺少 Story 执行上下文。全量测试 434/434 通过（原 422 + 新增 12），CLI 冒烟（gate check/workflow run --story 帮助输出）通过。

## 修改文件

- core/sdd/gate-validator.js
- core/sdd/workflow-engine.js
- tests/story-workflow.spec.js

## 命令与结果

| 命令 | 结果 | 说明 |
|---|---|---|
| `node --test tests/story-workflow.spec.js` | passed | 首轮 7/12，修复 3 缺陷后 12/12。 |
| `node --test tests/*.spec.js` | passed | 全量 434/434 通过，无回归。 |
| `node cli/openspec/bin/openspec.js gate check --help; workflow run --help; change status --help` | passed | CLI --story 选项正常渲染（控制台中文乱码为 GBK 显示问题，非文件问题）。 |

## 已确认决策

- **feature-path-bound 检查按 Gate 分层分发** — story 模式下 feature-path-bound 检查读取该 Story 的 story-metadata.yaml feature-path；Change 级（inline/拆分前）行为不变。 原因：3-tier 多 Story 拆分后 Change 级 feature-path 清空（splitInlineStory 语义），Story 级成为权威；原实现导致多 Story story-design 机检必然失败。
- **inline 单 Story 显式拒绝 --story** — runWorkflowCore 中 opts.storyId 且非多 Story 时抛错（单 Story 平铺 Change 走 Change 级流程，无需 --story），而非静默忽略。 原因：静默忽略会让使用者误以为 Story 级执行已发生；runStoryWorkflow 中原有的 inline 抛错分支实际不可达。
- **story-splitting 循环 Instruction 携带 storyId** — processStoryStage 调用 prepareSkillInvocation 时以 { ...opts, storyId: story.id } 补齐，使 instruction-builder §3.6 Story 执行上下文在 Change 级拆分循环中同样注入。 原因：Change 级 story-splitting 循环的 opts 无 storyId，外部 Agent 生成的 Instruction 缺少目标 Story 与三级产物路径提示。

## 问题

- 无。

## 未完成事项

- Story 1-3 的全部改动（含本轮）尚未提交，工作树含大量待提交文件
- 全链路验收中「1 Change → 3 Story → 5 DU 完整 lifecycle（含 dev/test/review Story 级执行与 DU 联动）」目前以 2 Story + 状态模拟覆盖核心链路，5 DU 全物化场景可在后续补强

## 下一步

与用户确认是否按 Story 粒度原子化提交（推荐先提交 Story 1，再 Story 2、Story 3），或直接推进 Phase 4.2 后续收尾项。

## 推荐提交

```text
feat(phase-4.2): Story 3 多 Story workflow 聚合推进 + stale 分层传播 + story 级 gate/CLI 支持
```
