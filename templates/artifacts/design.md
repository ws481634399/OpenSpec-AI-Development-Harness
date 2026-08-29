---
affected-repositories: [] # Phase 2.4：受影响仓库 id 列表（对应 .sdd/repositories.yaml，供 task 阶段 du-coverage 机检）
---

# Design

> 阶段：sdd-design 产物
> 输入：prd.md
> 产出状态：designed

本文档制定技术方案。

结构化字段由 sdd-design 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落（现状/方案/影响/风险）由外部 Agent 按 Instruction 补充。

职责边界（硬约束）：Design 回答"系统如何实现、哪些仓受影响、跨仓如何协作"；
**不得产生 DU**（DU-XXX 编号不得出现在本文档）——正式拆分交付单元是 sdd-task 的职责。

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

## 3. 仓库影响（Repository Impact）

<!-- AI 补充：每个受影响仓库一个分仓小节，说明该仓的技术职责与修改概要。
     front-matter.affected-repositories 必须与此处分仓清单一致（du-coverage 机检输入）。 -->

- 受影响仓库数: {{repo-impact-count}}
- 主要修改点: {{repo-impact-summary}}

### 3.1 <repo-id-1>

<!-- 该仓技术职责 / 修改概要 / 涉及模块 -->

### 3.2 <repo-id-2>

<!-- 该仓技术职责 / 修改概要 / 涉及模块 -->

## 4. 跨仓协作（Cross-Repository Contract）

<!-- AI 补充：多仓需求必填；单仓可写"无"。
     API / Event / Data Contract、Repository Dependencies、Integration Boundary、
     Migration Impact、Cross-Repository Sequence。 -->

- 接口契约: {{cross-repo-contract}}
- 仓库依赖: {{repo-dependencies}}
- 集成边界: {{integration-boundary}}
- 跨仓时序: {{cross-repo-sequence}}

## 5. 数据变更

<!-- AI 补充：数据库结构变更、Migration（若有） -->

- 是否需 Migration: {{need-migration}}
- 变更摘要: {{data-change-summary}}

## 6. 风险

<!-- AI 补充：识别的技术风险与缓解措施 -->

- 风险等级: {{risk-level}}
- 主要风险: {{risk-summary}}
- 缓解措施: {{mitigation}}

## 7. 待澄清问题

<!-- AI 补充：设计阶段无法确认的问题 -->
