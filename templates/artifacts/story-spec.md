---
story-id: "" # Story ID（对齐 feature-tree.yaml，由 sdd-prd Story 上下文填充）
change-spec-ref: "" # 交叉引用：change-spec.md#<章节锚点>（change-ref-bound 机检：blocking）
scope-refs: [] # 本 Story 覆盖的 Change spec [S<n>] 范围编号，如 [S1, S3]（scope-subset 机检：必须 ⊆ change-spec §3 编号集合）
---

# Story Spec（Story 产品规格）

> 阶段：sdd-prd 产物（Phase 4.2 Story 级，story-splitting 后逐 Story 产出）
> 输入：change-spec.md（§3.3 Story 拆分总表对应行）+ exploration.md
> 产出状态：specified（Story 级）
> 职责边界（硬约束）：描述**单个 Story（最小产品能力）**的完整产品规格；
> 范围必须是 Change spec §3 对应条目的子集；跨 Story 架构决策写 change-design.md。

本文档将 Change spec 中本 Story 对应条目细化为可开发、可验收的产品规格。

结构化字段由 sdd-prd 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- Story ID: {{story-id}}
- Change spec 引用: {{change-spec-ref}}
- 状态流转: {{from-state}} → {{to-state}}

## 1. Story 目标

<!-- AI 补充：本 Story 交付什么产品能力、解决什么问题（对齐 change-spec §3.3 对应行） -->

## 2. Scope（范围）

### 2.1 包含

<!-- AI 补充：本 Story 范围内的功能点（必须是 Change spec §3.1 对应条目的子集） -->

- 包含范围摘要: {{scope-in}}

### 2.2 不包含

<!-- AI 补充：本 Story 明确不做（含"属于其他 Story"的划界说明） -->

- 不包含范围摘要: {{scope-out}}

## 3. 业务规则

<!-- AI 补充：本 Story 的详细业务规则（细化 change-spec §4 总纲中与本 Story 相关的条目） -->

## 4. 接口与字段规格

<!-- AI 补充：本 Story 的字段级接口/数据规格（Change 级不写，此处必须写透）；
     涉及跨 Story 共享契约时引用 change-design.md §5.1，不得重复定义 -->

## 5. Story 验收标准

<!-- AI 补充：本 Story 的可量化验收点（Human Gate story-spec 人审重点）。
     AC-NNN 表格化（追踪链锚点，Phase 4.3）：AC-001 起三位递增，编号稳定不复用，
     design 决策 covers、测试用例 verified-by 均按编号引用 -->

| ID     | 验收标准（可测试） | 备注 |
| ------ | ------------------ | ---- |
| AC-001 | （给定…当…则…）    |      |
| AC-002 | （给定…当…则…）    |      |
