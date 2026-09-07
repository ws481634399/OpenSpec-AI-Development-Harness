# sdd-design Checklist

sdd-design 执行后，外部 Agent 补充完毕 design.md 前，必须检查以下项：

## 1. 元信息

- [ ] Change ID / spec 来源（{{spec-source}}）/ 状态流转 正确
- [ ] 状态流转：specified → designed
- [ ] front-matter `affected-repositories` 与正文 §3 分仓小节一致

## 2. 设计完整性

- [ ] §1 当前状态：引用了 implementation/ 下的实际代码证据（路径/文件/模块）
- [ ] §2 提议方案：描述了组件/接口/数据流，且能被工程师理解和实现；备选方案对比有结论（业界锚点：Alternatives Considered）
- [ ] §3 仓库影响：每个受影响仓库都有修改概要（不仅仅是清单）
- [ ] §4 跨仓协作：多仓需求给出 API/Event/Data Contract + 依赖方向 + 集成边界（单仓写"无"）
- [ ] §5 数据变更：是否需要 Migration 有明确结论（yes/no + 理由）；yes 时给出 DDL/ALTER 概要与回滚方案
- [ ] §6 风险：识别至少 1 个技术风险（兼容性/性能/安全/数据/依赖），并有缓解措施
- [ ] §7 待澄清：列出了无法自己确认的问题（如有）；需 spec 补充的业务规则已标注

## 3. 边界约束

- [ ] design.md 未出现 DU-XXX 编号（Design 不产生 DU，拆 DU 是 sdd-task 职责）
- [ ] 未出现实现级伪代码（Pseudocode 是 sdd-task 在 DU 层的 Dev Guidance）
- [ ] 方案不与 spec.md 范围矛盾（scope-out 未被设计覆盖；spec 全部 Scope In 项有设计落点）
- [ ] 数据模型覆盖 spec 全部业务规则；每个接口有明确的入参/出参/错误码
- [ ] 接口契约与工程规范（standards/engineering/）一致

## 4. 状态推进

- [ ] `openspec change status <CHG>` 显示 designed
- [ ] 前序 Artifact（spec.md / exploration.md / requirement.md）未被改动
