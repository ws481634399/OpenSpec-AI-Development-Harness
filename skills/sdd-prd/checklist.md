# sdd-prd Checklist

sdd-prd 执行后，外部 Agent 补充完毕 spec.md 前，必须检查以下项：

## 1. 元信息完整性

- [ ] `## 0. 元信息` 的 Change ID / Requirement / Feature ID 与 metadata 一致
- [ ] 状态流转正确：exploring → specified

## 2. 内容质量

- [ ] §1 背景：解释了"为什么做"，有业务上下文
- [ ] §2 用户价值：明确了目标用户、痛点、预期价值三点
- [ ] §3 范围：明确区分了包含和不包含，避免含糊
- [ ] §4 业务规则：列出了关键业务约束与流程（若有）
- [ ] §5 验收标准：AC-NNN 表格（AC-001 起三位递增），每一条都是可验证的（不是"体验更好"这类模糊描述）
- [ ] §6 成功指标：给出可观测指标与预期值，或明确标注"本期不度量"

## 3. 一致性

- [ ] spec.md 与 exploration.md 的需求要点/冲突结论一致，不前后矛盾
- [ ] 验收标准可追溯到 scope-in 中的需求点

## 4. 状态推进

- [ ] `openspec change status <CHG>` 确认已推进到 specified
- [ ] 未错误覆写之前阶段的 Artifact（exploration.md / requirement.md 内容未变动）
