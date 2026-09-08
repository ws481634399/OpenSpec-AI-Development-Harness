---
affected-repositories: [] # 本 Story 受影响仓库 id 列表（必须是 change-design.affected-repositories 的子集）
story-id: "" # Story ID（由 sdd-design Story 上下文填充）
change-design-ref: "" # 交叉引用：change-design.md#<章节锚点>（change-ref-bound 机检：blocking）
---

# Story Design（Story 技术设计）

> 阶段：sdd-design 产物（Phase 4.2 Story 级）
> 输入：story-spec.md + change-design.md（§5 Story 设计分派对应行）
> 产出状态：designed（Story 级）
> 职责边界（硬约束）：描述**单个 Story** 的模块级技术方案 + **DU 划分**；
> 公共组件/跨 Story 契约引用 change-design.md §5.1（不得重复定义）；
> **DU 划分是 story-design 的产物**（§5 DU 划分表），sdd-task 仅消费此表做逐 DU 任务分解。

本文档将 Change Design 中本 Story 对应分派细化为模块级技术方案与 DU 划分（sdd-task 逐 DU 任务分解的直接输入）。

结构化字段由 sdd-design 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- Story ID: {{story-id}}
- Change Design 引用: {{change-design-ref}}
- 状态流转: {{from-state}} → {{to-state}}

## 1. 模块改动（Module Changes）

<!-- AI 补充：本 Story 涉及的模块/文件级改动点（对齐 change-design §5 分派行的技术要点） -->

- 涉及仓库: {{repos-involved}}
- 模块改动摘要: {{module-changes}}

### 1.1 <repo-id-1>

<!-- 该仓本 Story 的模块改动细化 -->

### 1.2 <repo-id-2>

<!-- 该仓本 Story 的模块改动细化 -->

## 2. 接口契约细化

<!-- AI 补充：本 Story 实现的接口/事件/数据结构（引用 change-design §2/§4/§5.1 并细化到字段级） -->

## 3. 数据变更

<!-- AI 补充：本 Story 的表结构/数据变更（引用 change-design §6；无则写"无"） -->

- 是否需 Migration: {{need-migration}}
- 变更摘要: {{data-change-summary}}

## 4. 错误处理

<!-- AI 补充：本 Story 的错误场景与处理路径 -->

## 5. DU 划分（Delivery Units）

<!-- AI 补充：将本 Story 设计方案拆成 Delivery Unit（每个 DU 1:1 一个仓库）。
     DU 拆分三判据：单仓 / 可独立红绿灯 / 依赖显式无环。
     covers AC 必须引用 story-spec.md 中真实存在的 AC-NNN。
     design 验收后用 `openspec du create --story <STORY-ID>` 登记 DU 框架。 -->

| DU        | 仓库     | 职责（实现哪些 DES） | covers AC      | depends on |
| --------- | -------- | -------------------- | -------------- | ---------- |
| DU-<REPO>-001 | <repo> | <该 DU 实现目标>     | AC-001         | —          |

## 6. 测试策略

<!-- AI 补充：本 Story 的测试策略（Unit/Integration/API + 边界场景），sdd-test 的输入 -->
