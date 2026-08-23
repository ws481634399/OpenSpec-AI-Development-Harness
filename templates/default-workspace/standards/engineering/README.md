# 工程规范

> 版本：v0.1  
> 类型：工程通用规范  
> 作用域：OpenSpec Workspace

# 1. 文档目的

本文档是 OpenSpec Workspace 工程规范的总入口。

工程规范用于定义软件系统开发过程中的技术约束和工程实践。

目标：

- 建立统一的软件工程标准；
- 指导 AI Coding Agent 按规范执行开发；
- 提升系统可维护性和扩展能力；
- 保证不同技术领域之间协同一致。

工程规范覆盖：

```
前端工程

+

后端工程

+

AI应用工程

+

数据库工程

+

测试工程
```

---

# 2. 工程规范定位

工程规范关注：

```
软件如何被设计、实现、验证和维护
```

工程规范不负责定义：

- 产品需求；
- 用户价值；
- 业务能力；
- 项目特殊规则。

这些内容属于：

```
product/

standards/project/
```

---

# 3. 工程规范体系

当前工程规范包括：

```
engineering/

├── README.md

│

├── coding-standard.md

├── api-standard.md

├── database-standard.md

├── testing-standard.md

│

├── frontend/

├── backend/

└── ai/
```

---

# 4. 通用工程规范

## 4.1 代码规范

文件：

```
coding-standard.md
```

定义：

- 通用代码质量要求；
- 命名规范；
- 可维护性原则；
- 基础开发约束。

---

## 4.2 API规范

文件：

```
api-standard.md
```

定义：

- API设计原则；
- 接口一致性；
- 请求响应规范；
- 接口生命周期管理。

---

## 4.3 数据库规范

文件：

```
database-standard.md
```

定义：

- 数据模型设计；
- SQL规范；
- 数据迁移；
- 数据安全要求。

---

## 4.4 测试规范

文件：

```
testing-standard.md
```

定义：

- 测试类型；
- 测试要求；
- 验证流程；
- 测试证据管理。

---

# 5. 前端工程规范

目录：

```
frontend/
```

负责定义前端应用开发规范。

包括：

```
coding-standard.md

component-standard.md

state-management-standard.md

router-standard.md

performance-standard.md
```

覆盖：

- 前端代码组织；
- 组件设计；
- 状态管理；
- 路由管理；
- 性能优化。

---

# 6. 后端工程规范

目录：

```
backend/
```

负责定义后端系统开发规范。

包括：

```
architecture-standard.md

service-standard.md

api-design-standard.md

database-access-standard.md

framework-standard.md
```

覆盖：

- 系统架构；
- DDD设计；
- 服务分层；
- 接口实现；
- 数据访问；
- 框架使用。

---

# 7. AI应用工程规范

目录：

```
ai/
```

负责定义 AI 应用开发规范。

包括：

```
prompt-standard.md

agent-standard.md

tool-calling-standard.md

knowledge-standard.md

evaluation-standard.md
```

覆盖：

- Prompt工程；
- Agent设计；
- Tool调用；
- AI知识管理；
- AI能力评估。

---

# 8. 工程规范使用规则

工程规范应该根据开发阶段加载。

---

## 8.1 需求分析阶段

主要读取：

```
standards/sdd/

product/
```

目的：

理解流程和业务。

---

## 8.2 技术设计阶段

读取：

```
standards/sdd/

standards/engineering/

product/

implementation/
```

目的：

生成符合工程要求的设计方案。

---

## 8.3 开发阶段

读取：

```
standards/engineering/

delivery/

implementation/
```

目的：

按照工程规范完成实现。

---

## 8.4 测试阶段

读取：

```
testing-standard.md

+

相关领域规范
```

目的：

完成质量验证。

---

# 9. AI Coding Agent使用规则

AI Coding Agent 在执行工程任务时必须：

```
加载相关工程规范

↓

理解约束

↓

执行开发任务

↓

验证结果

↓

记录证据
```

---

AI 不应该：

- 跳过工程规范；
- 引入未经评估的技术方案；
- 修改受保护知识；
- 未验证直接提交结果。

---

# 10. 工程规范与项目规范关系

工程规范：

定义通用规则。

项目规范：

定义具体项目约束。

关系：

```
工程规范

+

项目规范

↓

实际开发规则
```

例如：

工程规范：

```
接口应该保持统一响应结构。
```

项目规范：

```
本项目所有接口使用 Result<T>。
```

最终规则：

```
Result<T>
```

---

# 11. 工程规范维护

工程规范属于长期知识。

修改流程：

```
提出修改

↓

评审

↓

批准

↓

版本更新
```

已批准规范不得被 AI 自动覆盖。

---

# 12. AI开发体系中的位置

OpenSpec Harness 中：

```
Knowledge

↓

Standards

↓

Skills

↓

Agent

↓

Implementation

↓

Evidence
```

工程规范为 AI 提供：

- 技术约束；
- 设计原则；
- 实现标准；
- 验证要求。

---

# 13. 总结

工程规范体系用于保证：

```
产品需求

+

技术设计

+

代码实现

+

AI能力

+

质量验证
```

形成统一的软件工程体系。

通过 Engineering Standards：

AI Coding Agent 能够按照稳定、可追踪、可维护的方式参与软件开发。
