# Exploration

> 阶段：sdd-explore 产物
> 输入：Requirement（requirement.md）
> 产出状态：exploring（推进 Change 状态）

本文档记录 sdd-explore 阶段的探索结果。

结构化字段由 sdd-explore 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落（需求理解 / 影响分析 / 未知问题）由外部 Agent 按 Instruction 补充。

## 1. 需求理解

<!-- AI 补充：用自己的话复述需求意图，确认理解 -->

## 2. Feature 归属

<!-- 读 product/feature-tree.yaml 判断需求归属哪个 Feature -->
<!-- 命中：记录 feature id -->
<!-- 未命中：创建 candidate feature（写入 product/features/，标 pending） -->

- Feature ID: {{feature-id}}
- Feature 路径: {{feature-path}}
- 是否新建 candidate: {{is-new-candidate}}

## 3. 影响分析

<!-- AI 补充：识别受影响的仓库、模块、服务 -->

- 受影响仓库: {{affected-repos}}
- 受影响模块:
- 影响范围:

## 4. 未知问题

<!-- AI 补充：列出探索阶段无法确认的问题，留待后续阶段澄清 -->

-

## 5. 旧需求沿用判断

<!-- 见 change-lifecycle.md §8.6：是否匹配到进行中 Change 或 archived Change -->

- 匹配进行中 Change: {{matched-change}}
- 匹配 archived Change: {{archived-change}}
- 决策: {{reuse-decision}}
