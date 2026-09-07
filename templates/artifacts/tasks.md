# Tasks（Repository Delivery Decomposition Plan）

> 阶段：sdd-task 产物（Phase 2.4 升级为 Delivery Decomposition Skill）
> 位置：STORY 级 —— `<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md`（由 metadata.feature-path 决定）
> 输入：spec.md + design.md + .sdd/repositories.yaml + feature-path
> 产出状态：tasked

本文档将设计拆解为 Delivery Unit（DU）——每个 DU 是本次 Change 在一个具体仓库中的实施交付单元（DU 1:1 Repository，跨仓交付必须拆多个 DU）。

结构化字段由 sdd-task 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落（各 DU 细化）由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- Design 来源: {{design-source}}
- 状态流转: {{from-state}} → {{to-state}}
- Feature Path: {{feature-path}}
- DU 总数: {{du-count}}

## Delivery Units

<!-- 每个 DU 至少描述：ID / Repository / Goal / Scope / Design References /
     Dependencies / Acceptance Criteria / Execution Order / Parallelization /
     Implementation Sketch（必填）/ Pseudocode（条件必填）/ Verification（必填）。
     ID 规范：DU-<REPO别名>-<nnn>（如 DU-BE-001），alias 见 repositories.yaml。
     Pseudocode 条件规则：complexity-trigger（business-flow / algorithm /
     state-transition / orchestration）命中时必须写执行逻辑；未命中写 N/A + 理由。
     约束：tasks.md Gate accepted 后才 materialize 到各仓 delivery/。 -->

### DU-<REPO-NNN>: <标题>

- 目标仓库:
- 目标 Goal:
- Scope（范围）:
- Design References（design.md 章节/接口契约引用）:
- Dependencies（依赖的 DU id，可空）:
- Acceptance Criteria（验收标准）:
- Execution Order（执行顺序）:
- Parallelization（可并行组，可空）:
- Implementation Sketch（必填：推荐组件/调用关系/控制流程/领域边界/数据流/错误处理路径）:
- Pseudocode（条件必填：trigger 命中写执行逻辑；未命中写 N/A + 理由）:
- Verification（必填：Unit/Integration/API/Migration Verification/Error Case）:

### DU-<REPO-NNN>: <标题>

- 目标仓库:
- 目标 Goal:
- Scope（范围）:
- Design References（design.md 章节/接口契约引用）:
- Dependencies（依赖的 DU id，可空）:
- Acceptance Criteria（验收标准）:
- Execution Order（执行顺序）:
- Parallelization（可并行组，可空）:
- Implementation Sketch（必填：推荐组件/调用关系/控制流程/领域边界/数据流/错误处理路径）:
- Pseudocode（条件必填：trigger 命中写执行逻辑；未命中写 N/A + 理由）:
- Verification（必填：Unit/Integration/API/Migration Verification/Error Case）:
