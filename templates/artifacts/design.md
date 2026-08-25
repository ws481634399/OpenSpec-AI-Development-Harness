# Design

> 阶段：sdd-design 产物
> 输入：prd.md
> 产出状态：designed

本文档制定技术方案。

结构化字段由 sdd-design 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落（现状/方案/影响/风险）由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- PRD 来源: {{prd-source}}
- 状态流转: {{from-state}} → {{to-state}}

## 1. 当前状态

<!-- AI 补充：既有实现/架构现状，引用 implementation/ 下的代码证据 -->

- 当前架构模式: {{current-pattern}}
- 相关仓库: {{repos-involved}}
- 相关模块: {{modules-involved}}

## 2. 提议方案

<!-- AI 补充：技术方案设计 -->

- 方案概要: {{proposal-summary}}
- 关键组件: {{key-components}}
- 接口契约: {{interface-contract}}

## 3. 仓库影响

<!-- AI 补充：列出每个受影响仓库的修改概要 -->

- 受影响仓库数: {{repo-impact-count}}
- 主要修改点: {{repo-impact-summary}}

## 4. 数据变更

<!-- AI 补充：数据库结构变更、Migration（若有） -->

- 是否需 Migration: {{need-migration}}
- 变更摘要: {{data-change-summary}}

## 5. 风险

<!-- AI 补充：识别的技术风险与缓解措施 -->

- 风险等级: {{risk-level}}
- 主要风险: {{risk-summary}}
- 缓解措施: {{mitigation}}

## 6. 待澄清问题

<!-- AI 补充：设计阶段无法确认的问题 -->
