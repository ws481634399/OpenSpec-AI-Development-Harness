# Stack: Spring Cloud

> 本文件由 `openspec init --stack spring-cloud` 生成，说明本项目模板启用的技术栈包。

## 启用的栈包

`standards/engineering/backend/`（Java 微服务 / Spring Cloud 场景）：

| 文件 | 说明 |
| --- | --- |
| [README.md](engineering/backend/README.md) | 后端规范包总览 |
| [architecture-standard.md](engineering/backend/architecture-standard.md) | 后端分层架构（controller / application / domain / infrastructure） |
| [api-design-standard.md](engineering/backend/api-design-standard.md) | API 设计原则、响应结构、错误码 |
| [service-standard.md](engineering/backend/service-standard.md) | 服务设计、事务边界、服务间调用 |
| [database-access-standard.md](engineering/backend/database-access-standard.md) | 数据访问、ORM 约束、Migration |
| [framework-standard.md](engineering/backend/framework-standard.md) | 框架使用约定（Spring Boot / Spring Cloud） |

## Standards 世界

通用工程标准（coding / testing / git / security 等）与 SDD 规则（`standards/sdd/`）由 Empty 基座提供，完整世界定义见 [README.md](../README.md)。

本项目专属规则请放入 `standards/project/`。
