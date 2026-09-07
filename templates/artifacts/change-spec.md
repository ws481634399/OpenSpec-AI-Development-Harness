# Change Spec（需求总规格）

> 阶段：sdd-prd 产物（Phase 4.2 Change 级）
> 输入：CHG Context（exploration.md + requirement.md）
> 产出状态：specified
> 职责边界（硬约束）：描述**整个需求**的产品总规格——背景/范围/业务规则总纲/Story 拆分总表；
> **不得包含**单 Story 的字段级接口规格（那是 story-spec.md 的职责）。

本文档将需求转化为 Change 级产品总规格，并给出 Story 拆分总表（多 Story 拆分的唯一权威输入）。

结构化字段由 sdd-prd 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落（背景/用户价值/业务规则/验收标准）由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- Requirement: {{requirement}}
- 状态流转: {{from-state}} → {{to-state}}

## 1. 背景

<!-- AI 补充：为什么做这个需求，业务上下文 -->

## 2. 用户价值

<!-- AI 补充：目标用户、解决的痛点、预期价值 -->

- 目标用户: {{target-user}}
- 痛点摘要: {{pain-points}}
- 预期价值: {{expected-value}}

## 3. 功能范围

### 3.1 包含

<!-- AI 补充：本 Change 范围内的功能点。
     编号约定：每个功能点一条，格式 "- [S1] 描述"（S1/S2/... 递增）。
     story-splitting 后各 story-spec.md 通过 front-matter scope-refs 引用本表编号，
     Machine Gate 据此做 Story Scope ⊆ Change Scope 确定性校验。 -->

- 包含范围摘要: {{scope-in}}

### 3.2 不包含

<!-- AI 补充：明确排除的内容 -->

- 不包含范围摘要: {{scope-out}}

### 3.3 Story 拆分总表

<!-- AI 补充：多 Story 需求必填（单 Story inline 可写"见 feature-path"）。
     本表是 story-splitting 阶段的唯一权威输入；每行一个 Story。
     Story ID 必须对齐 product/feature-tree.yaml 中的 Story 节点。
     Hard Constraint：Story 拆分只能在本表范围内细化，扩大范围需回改本文档并重跑 Gate。 -->

| Story ID | 标题 | Scope 摘要 | 依赖 Story | 优先级 |
|----------|------|-----------|-----------|--------|
| STORY-XXX | <!-- 标题 --> | <!-- 本 Story 交付什么 --> | <!-- 可空 --> | P0/P1/P2 |

## 4. 业务规则总纲

<!-- AI 补充：跨 Story 的业务约束、规则、流程（Story 级细化写各 story-spec.md） -->

## 5. 全局验收标准

<!-- AI 补充：整个需求的验收点（Story 级验收标准在各 story-spec.md） -->

- [ ] 验收点 1
- [ ] 验收点 2

## 6. 非功能需求

<!-- AI 补充：性能/安全/兼容性等（可写"无"） -->
