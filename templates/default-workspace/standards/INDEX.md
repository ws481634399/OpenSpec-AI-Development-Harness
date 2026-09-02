# Standards 知识索引

> 最后更新: 2026-08-28T00:00:00Z
> 关联 Change: 无（种子知识）
>
> 目录结构：`sdd/`（SDD 流程规则，Harness 维护）· `engineering/`（通用工程规范）· `project/`（项目专属规则）。
> 更新索引：运行 sdd-knowledge 能力 C（索引构建），或 converge 阶段自动重建。

## SDD 流程规则（sdd/）

- [Change 生命周期](sdd/change-lifecycle.md) — Change 定义、目录结构、生命周期状态、流转规则、完成标准
- [知识管理](sdd/knowledge-management.md) — 知识生命周期、知识来源、批准规则、冲突处理
- [Skill 执行](sdd/skill-execution.md) — Skill 结构、执行规则、AI 行为约束、输出校验

## 工程规范（engineering/）

- [工程规范总入口](engineering/README.md) — 工程规范体系导航与使用规则
- [代码规范](engineering/coding-standard.md) — 代码质量原则 + 编码细则速查（命名、组织、格式化、错误处理）
- [API 规范](engineering/api-standard.md) — API 设计原则、接口一致性、请求响应规范
- [数据库规范](engineering/database-standard.md) — 数据模型、SQL 规范、迁移、安全要求
- [测试规范](engineering/testing-standard.md) — 测试原则 + 测试细则速查（金字塔、AAA、边界值、覆盖率）
- [架构原则](engineering/architecture-principles.md) — 分层架构、SOLID 原则、Repository/Factory/Strategy 模式、API 设计规范
- [Git 规范](engineering/git-conventions.md) — 分支命名、Commit 消息格式、PR 流程、.gitignore 基线
- [安全指南](engineering/security-guidelines.md) — 输入校验、认证授权、密码存储、数据保护、OWASP Top 10

## 项目专属规则（project/）

> init 后为空目录。由人工维护、sdd-reverse 知识逆向、converge 阶段沉淀逐步填充。
> 建议命名：`naming-convention.md`、`architecture-decision.md`、`business-constraints.md`。

（暂无条目）
