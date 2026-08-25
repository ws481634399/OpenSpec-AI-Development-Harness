# sdd-design Rules

## R1：生命周期约束

- 必须在 `specified` 状态启动，输出后推进到 `designed`
- 禁止越级（如 exploring → designed）

## R2：工程规范约束

- 设计方案必须引用 `standards/engineering/*.md` 中明确的规范
- 数据库访问、API 设计、分层架构必须遵循 backend standards
- 前端设计必须遵循 frontend/component/router/state standards

## R3：实现代码只读

- 不得在 design 阶段直接修改 implementation/
- 只能读取现有代码作为"当前状态"证据

## R4：数据变更

- 涉及数据库结构变更必须显式写在 §4，不得隐含
- need-migration=yes 必须说明 Migration 范围与回滚方案

## R5：Artifact 写入约束

- 只写 design.md，不得覆写 prd.md / exploration.md / requirement.md
- patchStatus 前 validateTransition(specified, designed)
