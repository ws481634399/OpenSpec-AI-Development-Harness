# sdd-design Checklist

## 1. 元信息

- [ ] Change ID / PRD 来源 / 状态流转 正确
- [ ] 状态流转：specified → designed

## 2. 设计完整性

- [ ] §1 当前状态：引用了 implementation/ 下的实际代码证据（路径/文件/模块）
- [ ] §2 提议方案：描述了组件/接口/数据流，且能被工程师理解和实现
- [ ] §3 仓库影响：每个受影响仓库都有修改概要（不仅仅是清单）
- [ ] §4 数据变更：是否需要 Migration 有明确结论（yes/no + 理由）
- [ ] §5 风险：识别至少 1 个技术风险，并有缓解措施
- [ ] §6 待澄清：列出了无法自己确认的问题（如有）

## 3. 一致性

- [ ] 方案不与 prd.md 范围矛盾（scope-out 未被设计覆盖）
- [ ] 接口契约与工程规范（standards/engineering/api-design-standard.md）一致

## 4. 状态推进

- [ ] `openspec change status <CHG>` 显示 designed
- [ ] 前序 Artifact（prd.md / exploration.md / requirement.md）未被改动
