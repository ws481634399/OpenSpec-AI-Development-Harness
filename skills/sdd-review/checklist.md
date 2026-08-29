# sdd-review Checklist

## 1. 元信息

- [ ] Change 处于 `testing` 状态（检查点，不推进状态）
- [ ] 检查时间 reviewed-at 已记录

## 2. 四项检查

- [ ] §1.1 需求一致性：PRD 每条 AC 都有对照结论（✅/❌）
- [ ] §1.2 设计一致性：design.md 关键声明都核对了实现证据
- [ ] §1.3 代码质量：finding 均有明确规范依据（standards/*.md）
- [ ] §1.4 知识同步候选：候选清单已列出（可为"无"）

## 3. 发现闭环

- [ ] 全部发现已登记为 evidence.yaml 的 review-finding 条目
- [ ] 全部 blocker/major 的 resolution 非空（findings-closure 机检强制）
- [ ] minor 已记录（允许开放）
- [ ] 修复产生了新的 code-change / test-run 证据条目

## 4. 报告完整性

- [ ] §2 发现清单与 evidence.yaml 条目一一对应
- [ ] §3 完成确认全部勾选
- [ ] 无残留 {{placeholder}}
