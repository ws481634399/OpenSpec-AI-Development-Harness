# sdd-task Checklist

sdd-task 执行后，外部 Agent 补充完毕 tasks.md 前，必须检查以下项：

## 1. 元信息

- [ ] Change ID / Design 来源（{{design-source}}）/ 状态流转（designed → tasked）正确
- [ ] 产物位于 STORY 级目录（metadata.feature-path 四级路径下）

## 2. DU 分解质量

- [ ] affected-repositories 中每个仓库至少 1 个 DU（du-coverage 机检）
- [ ] 每个 DU 1:1 对应一个仓库（跨仓交付必须拆成多个 DU）
- [ ] DU ID 符合 `DU-<REPO别名>-NNN` 三位编号且 Workspace 内唯一
- [ ] design.md 每个变更点（模块/接口/数据模型）都落入某个 DU 的 Scope
- [ ] spec 每条验收标准（AC-NNN）都映射到某个 DU 的 Acceptance
- [ ] 跨仓依赖显式声明（Dependencies + Execution Order / Parallelization）且无循环

## 3. Implementation Guidance（DU v2）

- [ ] 每个 DU 都有非空 Implementation Sketch（du-guidance 机检）
- [ ] complexity-trigger 判定合理：business-flow/algorithm/state-transition/orchestration 命中 → Pseudocode 必填（无 placeholder/N/A）
- [ ] 未命中触发器的 DU 写了 `N/A + 理由`，不留空占位
- [ ] 每个 DU 都有 Verification 清单（Unit/Integration/API/Migration/Error Case，供 sdd-test 消费）
- [ ] Sketch/Pseudocode 与 design.md §2 方案 / §4 跨仓契约一致（未引入新接口/新表）
- [ ] 系统级决策未下沉到 DU（发现则上浮 design 或标记待澄清）

## 4. 注册与物化

- [ ] 全部 DU 已通过 `openspec du create` 注册（含 --scope/--acceptance/--complexity 或 --pseudocode 声明）
- [ ] feature-path 已绑定（未绑定先补绑，禁止跳过）
- [ ] Gate accepted 后才执行 `openspec du materialize`（提前物化会被拒绝）

## 5. 状态推进

- [ ] status 已到 tasked
- [ ] 前序 Artifact（design.md / spec.md / exploration.md / requirement.md）未被改动
- [ ] tasks.md 未出现实现级代码提交（实施由 sdd-dev 在 repo 侧执行）
