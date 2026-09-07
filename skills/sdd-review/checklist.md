# sdd-review Checklist

## 1. 元信息

- [ ] Change 处于 `testing` 状态（检查点，不推进状态）
- [ ] 检查时间 reviewed-at 已记录

## 2. 五项检查

- [ ] §1.1 需求一致性：spec 每条 AC（AC-NNN）都有对照结论（✅/❌），每条 AC 至少有一个 `covers` 包含它的 test-run 证据
- [ ] §1.2 设计一致性：design.md 关键声明都核对了实现证据；Design → DU（Sketch/Pseudocode）→ Implementation 三层链路方向一致
- [ ] §1.3 跨仓一致性：design.md §4 跨仓协作契约被各仓 DU 证据共同满足（API/Event/Data + 依赖方向）
- [ ] §1.4 代码质量：finding 均有明确规范依据（standards/*.md）
- [ ] §1.5 知识同步候选：候选清单已列出（可为"无"）

## 3. 偏离与发现闭环

- [ ] 实现偏离 Sketch/Pseudocode/Design Contract 的，repo implementation.md `## Deviations` 均有记录（未记录 → major）
- [ ] 全部发现已登记为 evidence.yaml 的 review-finding 条目，target 可定位（`spec.md#AC-NNN` / `tasks.md#DU-XXX` / `design.md#<section>`）
- [ ] 全部 blocker/major 的 resolution 非空（findings-closure 机检强制）且引用修复证据（新 code-change/test-run 的 EV id）
- [ ] minor 已记录（允许开放）；修复产生了新的 code-change / test-run 证据条目

## 4. 报告完整性

- [ ] §2 发现清单与 evidence.yaml 条目一一对应
- [ ] §3 完成确认全部勾选
- [ ] 无残留 {{placeholder}}
