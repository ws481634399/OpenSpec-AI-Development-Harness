# Review Report

> 阶段：sdd-review 产物（Phase 2.2 同态检查点；Phase 2.4 扩展跨仓审查）
> 位置：<CHG>/review-report.md
> 输入：prd.md + design.md + implementation.md + evidence/test-report.md + evidence/evidence.yaml + standards/ + DU 状态（跨仓）
> 产出状态：testing（检查点，不推进 Change 状态）

本文档记录 converge 前的四项独立检查结论与发现清单。

结构化字段由占位符（{{placeholder}}）填充，
检查结论与发现清单由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- Test Report 来源: {{test-report-source}}
- Evidence 索引: {{evidence-index}}
- 状态流转: testing（检查点，状态不变）
- 检查时间: {{reviewed-at}}

## 1. 检查结论

<!-- 结论摘要：四项检查的整体结论（如：全部通过 / N 项发现已闭环） -->

### 1.1 需求一致性

<!-- PRD AC 逐条对照表：AC / test-run 证据（evidence.yaml covers）/ 结论 -->

### 1.2 设计一致性

<!-- 设计声明 ↔ 实现证据对照：接口/模块/规则是否在 code-change 条目中体现 -->

### 1.3 跨仓一致性（Phase 2.4）

<!-- AI 补充：多仓需求必填；单仓可写"不适用"。
     跨仓契约落实核对：design.md §4 声明的 API/Event/Data Contract 是否在各 DU 实现中闭环；
     各仓 DU baseline/result 与 metadata.repository-baseline/repository-result 一致；
     各仓 DU 状态与 Workspace 协调视图一致。 -->

### 1.4 代码质量

<!-- standards/ 规范对照结果：仅记录有明确规范依据的违规 -->

### 1.5 知识同步候选

<!-- 供 sdd-converge 参考的候选知识项清单（新规范/新术语/新能力），可为"无" -->

## 2. 发现清单

<!-- review-finding 条目映射表：EV id / target / severity / finding / resolution 状态 -->

## 3. 完成确认

- [ ] 四项检查全部执行
- [ ] 全部 blocker/major finding 已闭环（evidence.yaml resolution 非空）
- [ ] minor finding 已记录（允许开放）
- [ ] 知识同步候选已写入 §1.5
- [ ] 跨仓一致性已核对（多仓需求；单仓写"不适用"）
