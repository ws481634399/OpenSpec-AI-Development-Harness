# sdd-converge Checklist

## 1. 元信息

- [ ] 状态流转：testing → completed
- [ ] 完成时间 completed-at 已记录；review-report.md 已 accepted（blocker/major 全部闭环）
- [ ] 全部 DU 已 completed（du-fan-in-complete），result commit 与各仓 HEAD 对齐（submodule-pointer-aligned）

## 2. 知识变化判断

- [ ] §1 知识变化总结：明确了知识增量（或明确说明"无增量"）
- [ ] §2 四类更新判断（Standards / Product / feature-tree.yaml / Glossary）逐项给出 yes/no + 理由
- [ ] Product 判断中已处理 Spec 晋升候选（产品业务规则/验收标准长期化，按 product-spec.md 格式草稿，待人工评审）
- [ ] 至少 1 个 yes 的情况下，写明了具体更新内容与对应标准/文件路径
- [ ] §3 记录了执行情况：已写回/待后续/为什么

## 3. 全局验收标准对照

- [ ] §4 对照表逐条覆盖 change-spec §5 全局验收标准（inline 模式为 spec.md §5），无遗漏
- [ ] 多 Story 模式：每条验收点注明覆盖 Story 与证据引用；跨 Story 集成验收点有集成证据（不得以"各 Story 已通过"替代）
- [ ] §4 全部"通过"是 Human Gate（approved）前置输入；存在"未通过"不得批准

## 4. 完成确认与一致性

- [ ] §5 完成确认 checklist 全部打勾：代码完成 ✓ / 测试完成 ✓ / 证据收集 ✓ / 全局验收对照 ✓ / 知识更新评估 ✓
- [ ] knowledge-delta 与 spec/design 中实际引入的新模式/新术语/新 Feature 一致
- [ ] 没在 convergence 阶段直接提交到 standards/ 或 product/specs/（Agent 只写候选；人工评审通过后另行 Commit）

## 5. 状态推进

- [ ] status 已到 completed
- [ ] 后续如需归档，执行 `openspec change archive <CHG>`
