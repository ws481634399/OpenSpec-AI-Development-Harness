# OpenSpec AI Development Harness Architecture

> Version: v1.0  
> Status: Draft  
> Type: Architecture Design

---

# 1. 架构概述

## 1.1 系统定位

OpenSpec AI Development Harness 是一套面向 AI Coding Agent 的软件工程开发框架。

它不是：

- AI 模型平台；
- Agent Runtime；
- IDE；
- 代码托管平台。

它定位为：

> AI Coding Agent 的工程控制层（Development Harness）。

通过：

- SDD Workflow；
- Knowledge Management；
- Skill System；
- Change Management；
- Evidence Management；

为 AI Agent 提供：

- 项目上下文；
- 开发流程；
- 工程约束；
- 知识沉淀能力。

---

# 2. 整体架构

OpenSpec Harness 采用分层架构：

```
OpenSpec AI Development Harness
                Developer
                    |
                    |
          AI Coding Agent
     (Trae / Cursor / Claude Code)
                    |
                    |
        OpenSpec Harness Layer
 ------------------------------------------------
 |              |              |                |
Workflow     Knowledge      Skill           Governance
 |              |              |                |
 ------------------------------------------------
                    |
                    |
              Implementation
                    |
                    |
                 Git Repo
```

---

# 3. 核心设计原则

## 3.1 Harness 不替代 Agent

OpenSpec 不负责：

- 模型调用；
- 推理执行；
- 代码生成。

这些能力由：

- Trae；
- Cursor；
- Claude Code；
提供。

OpenSpec 负责：

```
告诉 Agent：
做什么
读取什么
遵守什么
输出什么
```

---

## 3.2 知识与代码分离

项目分为四个世界：

```
Standards World
Product World
Delivery World
Implementation World
```

其中：

### Knowledge World

描述：

- 为什么；
- 规则；
- 业务；
- 历史。

### Implementation World

描述：

- 怎么实现；
- 代码；
- 配置；
- 部署。

---

## 3.3 Change 是开发核心对象

任何代码修改必须来源于 Change。

关系：

```
Requirement
      |
      |
     CHG
      |
      |
 -----------------
 |               |
 FCHG          FCHG
      |
      |
 -----------------
 |               |
RCHG           RCHG
      |
      |
Implementation
```

---

# 4. 四世界架构

OpenSpec 使用四个知识空间管理项目。

---

# 4.1 Standards World

目录：

```
standards/
```

职责：

定义：

> 项目必须遵守的规则。

包含：

```
standards/
├── sdd/
├── engineering/
└── project/
```

---

## sdd

通用 SDD 规则：

例如：

- Change流程；
- Skill规范；
- Evidence要求。

---

## engineering

工程规则：

例如：

- Java编码规范；
- API规范；
- 数据库规范。

---

## project

项目规则：

例如：

```
订单取消必须释放库存。
```

来源：

- 人工定义；
- 知识逆向；
- 架构决策。

---

# 4.2 Product World

目录：

```
product/
```

职责：

定义：

> 产品具备什么能力。

结构：

```
product/
├── feature-tree.yaml
├── features/
├── specs/
└── glossary/
```

---

## Feature Tree

管理：

产品能力。

例如：

```
电商平台
├── 用户中心
├── 商品中心
└── 订单中心
    ├── 创建订单
    ├── 查询订单
    └── 取消订单
```

---

## Features

描述：

具体业务能力。

例如：

```
FEAT-ORDER-CANCEL
```

---

## Specs

描述：

已经确认的产品规则。

例如：

```
订单取消必须填写取消原因。
```

---

# 4.3 Delivery World

目录：

```
delivery/
```

职责：

记录：

> 一次变化如何被分析、设计、实现和验证。

结构：

```
delivery/
├── requests/
├── changes/
├── reports/
└── archive/
```

---

核心对象：

## Change

一次业务变化。

例如：

```
CHG-ORDER-001
增加订单取消原因
```

---

## Evidence

记录：

变化依据。

例如：

```
Repo:
REPO-ORDER
Commit:
abc123
Path:
OrderService.java
```

---

## Snapshot

记录：

验证后的版本状态。

---

# 4.4 Implementation World

目录：

```
implementation/
```

职责：

存放：

真实代码。

原则：

## 保持原项目结构

不强制：

- 微服务；
- DDD；
- 特定语言。

例如：

```
implementation/
├── order-service
├── user-service
├── frontend
└── ai-service
```

---

# 5. 核心模块架构

OpenSpec Harness 包含以下核心模块。

---

# 5.1 Workflow Layer

职责：

管理 SDD 开发流程。

流程：

```
Explore
↓
PRD
↓
Design
↓
Task
↓
Dev
↓
Test
↓
Converge
```

负责：

- 当前阶段；
- 阶段输入；
- 阶段输出；
- 阶段检查。

---

# 5.2 Skill Layer

职责：

定义 AI 执行能力。

结构：

```
skills/
├── sdd-explore
├── sdd-prd
├── sdd-design
├── sdd-dev
└── sdd-test
```

每个 Skill 定义：

- 输入；
- 输出；
- 规则；
- 模板；
- 示例。

---

# 5.3 Knowledge Layer

职责：

管理项目长期知识。

包括：

- Standards；
- Product；
- Delivery。

提供：

AI 开发上下文。

---

# 5.4 Repository Layer

职责：

管理代码仓库信息。

支持：

- 单仓；
- 多仓；
- 单仓多模块。

记录：

```
Repository ID
Path
Type
Relation
```

---

# 5.5 Evidence Layer

职责：

保证 AI 输出可信。

任何重要结论需要：

```
Claim
↓
Evidence
↓
Decision
```

Evidence 类型：

- Code Evidence；
- Document Evidence；
- Test Evidence；
- Decision Evidence。

---

# 5.6 Governance Layer

职责：

控制知识生命周期。

管理：

状态：

```
Draft
↓
Pending
↓
Approved
↓
Deprecated
```

保证：

- AI不能覆盖正式规则；
- 修改有记录；
- 冲突可追踪。

---

# 6. 知识流转架构

OpenSpec 知识生命周期：

```
Existing Project
        |
        |
Knowledge Reverse
        |
 ------------------
 |        |        |
Standards Product Delivery
        |
        |
Human Review
        |
        |
Approved Knowledge
        |
        |
Future Development
```

---

# 7. AI开发工作流架构

一次需求：

```
Developer Request
        |
        |
sdd-explore
        |
        |
Feature Matching
        |
        |
Create CHG
        |
        |
PRD
        |
        |
Design
        |
        |
Task
        |
        |
AI Coding Agent
        |
        |
Implementation
        |
        |
Test
        |
        |
Knowledge Update
```

---

# 8. 与 AI Coding Agent 的关系

支持：

- Trae；
- Cursor；
- Claude Code；
- ChatGPT Agent。

集成方式：

```
AI Agent
读取：
├── skills
├── standards
├── product
├── delivery
└── instructions
执行：
代码修改
```

---

# 9. 当前版本边界

OpenSpec Harness v1.x 不包含：

## 不实现 Agent Runtime

模型运行由外部 Agent负责。

---

## 不实现模型管理

不负责：

- GPT；
- Claude；
- 本地模型。

---

## 不实现IDE

依赖：

- Trae；
- Cursor；
- Claude Code。

---

# 10. 后续扩展方向

未来版本可以增加：

## Context Engine

自动构建 AI 上下文。

---

## Plugin System

扩展：

- Git；
- Database；
- Cloud。

---

## Knowledge Graph

建立：

```
Feature
↓
Change
↓
Code
↓
Test
```

---

# 11. 总结

OpenSpec AI Development Harness 的核心架构：

```
AI Coding Agent
        +
SDD Workflow
        +
Knowledge Management
        +
Skill System
        +
Governance
        +
Evidence
```

最终目标：

> 让 AI Coding Agent 从一次性的代码生成工具，升级为具备项目知识、开发流程和工程约束的软件开发协作者。
