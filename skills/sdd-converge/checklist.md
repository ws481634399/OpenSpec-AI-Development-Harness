# sdd-converge Checklist

## 1. 元信息

- [ ] 状态流转：testing → completed
- [ ] 完成时间 completed-at 已记录

## 2. 知识变化判断

- [ ] §1 知识变化总结：明确了知识增量（或明确说明"无增量"）
- [ ] §2 四项（Standards/Product/FeatureTree/Glossary）都已明确 yes/no + 理由
- [ ] 至少 1 个 yes 的情况下，写明了具体更新内容与对应标准/文件路径
- [ ] §3 记录了执行情况：已写回/待后续/为什么

## 3. 完成确认

- [ ] §4 完成确认 checklist 全部打勾：代码完成 ✓ / 测试完成 ✓ / 证据收集 ✓ / 知识更新评估 ✓

## 4. 一致性

- [ ] knowledge-delta 与 prd/design 中实际引入的新模式/新术语/新 Feature 一致
- [ ] 没在 convergence 阶段直接提交到 standards/ 或 product/（除非人工确认后另行 Commit）

## 5. 状态推进

- [ ] status 已到 completed
- [ ] 后续如需归档，执行 `openspec change archive <CHG>`
