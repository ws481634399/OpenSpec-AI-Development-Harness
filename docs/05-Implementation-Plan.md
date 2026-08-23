# OpenSpec AI Development Harness Implementation Plan

> Version: v1.0  
> Status: Draft  
> Type: Implementation Plan

# 1. 实施目标

## 1.1 总体目标

将 OpenSpec AI Development Harness 从设计规范转化为一个可实际使用的 AI 开发辅助框架。

最终目标：

开发者可以：

1. 初始化项目；
2. 接入已有项目；
3. 使用 SDD Workflow 管理需求；
4. 使用 Skill 指导 AI Agent 开发；
5. 沉淀项目知识。

---

# 2. 实施原则

## 2.1 优先可用，而非平台化

初期不开发：

- Agent Runtime；
- 模型平台；
- 自研 IDE；
- Web 管理平台。

依赖：

- Trae；
- Cursor；
- Claude Code。

OpenSpec 负责：

```
规范
+
知识
+
流程
+
工具
```

---

## 2.2 从个人开发场景开始

第一目标用户：

个人开发者。

验证场景：

AI 电商微服务项目。

---

## 2.3 小步迭代

采用：

```
MVP
↓
增强
↓
专业化
```

避免：

一次性设计复杂系统。

---

# 3. 整体实施阶段

```
Phase 0
Architecture Foundation
        ↓
Phase 1
MVP
        ↓
Phase 2
Engineering Enhancement
        ↓
Phase 3
Professional Version
        ↓
Phase 4
Team Version
```

---

# 4. Phase 0：Architecture Foundation

## 目标

完成系统设计冻结。

状态：

已完成。

---

## 主要工作

完成：

```
00-Roadmap.md
01-Architecture.md
02-Workflow.md
03-Skill-Spec.md
04-Knowledge-Model.md
```

---

## 输出

```
OpenSpec Harness Specification v1.0
```

---

# 5. Phase 1：MVP Implementation

## 目标

实现第一个可使用版本。

版本：

```
OpenSpec Harness v0.1
```

核心目标：

> 一个开发者可以在真实项目中使用。

---

# 5.1 Workspace初始化系统

## 目标

提供项目初始化能力。

命令：

```
sdd init
```

---

## 功能

支持：

### 新项目

创建完整 SDD 工作空间。

### 已有项目

接入已有代码。

### 仓库模式

支持：

- 单仓；
- 多仓。

---

## 输出

生成：

```
.sdd/
standards/
product/
delivery/
implementation/
```

---

# 5.2 Workspace Template

## 目标

定义统一项目结构。

实现：

```
templates/
└── default-workspace/
```

包含：

```
.sdd/
standards/
product/
delivery/
implementation/
skills/
```

---

# 5.3 Repository Management

## 目标

管理代码仓库。

实现：

```
.sdd/repositories.yaml
```

示例：

```yaml
repositories:
  - id:
      order-service
    path:
      implementation/order-service
```

支持：

- 单仓；
- 多仓；
- 多模块。

---

# 5.4 Change Management

## 目标

管理需求变化。

实现：

命令：

```
sdd change create
```

生成：

```
delivery/
└── changes/
    └── CHG-001/
```

包含：

```
request.md
prd.md
design.md
tasks.md
evidence/
```

---

# 5.5 Feature Tree

## 目标

管理产品能力。

实现：

```
product/
feature-tree.yaml
```

能力：

- Feature匹配；
- Feature创建；
- Feature状态管理。

---

# 5.6 Core Skills

实现第一批 Skill。

目录：

```
skills/
├── sdd-workflow
├── sdd-explore
├── sdd-feature-tree
├── sdd-prd
├── sdd-design
├── sdd-task
├── sdd-dev
├── sdd-test
└── sdd-converge
```

---

# 5.7 Knowledge Reverse

## 目标

支持旧项目接入。

Skill：

```
sdd-knowledge-reverse
```

---

输入：

```
implementation/
```

扫描：

- 代码；
- SQL；
- API；
- 配置；
- 测试；
- 文档。

---

输出：

```
standards/
product/
delivery/archive/
```

---

# Phase 1 验收标准

完成后必须支持：

## 新项目

```
sdd init
↓
开始SDD开发
```

---

## 已有项目

```
代码放入implementation
↓
knowledge reverse
↓
生成项目知识
```

---

## 新需求

```
Explore
↓
CHG
↓
PRD
↓
Design
↓
Dev
```

---

# 6. Phase 2：Engineering Enhancement

版本：

```
v0.5
```

目标：

提高 AI 开发稳定性。

---

# 6.1 Prompt体系

建立：

```
prompts/
```

包含：

```
explore
design
coding
review
```

---

# 6.2 Context规则

增加：

```
.sdd/context-rules.yaml
```

定义：

不同阶段读取：

- 哪些知识；
- 哪些代码；
- 哪些文档。

---

# 6.3 Evidence体系

统一：

```
Evidence Model
```

记录：

```
Repository
Commit
File
Symbol
Reason
```

---

# 6.4 Review Skill

新增：

```
sdd-review
```

能力：

检查：

- 需求符合度；
- 设计符合度；
- 代码质量；
- 知识同步。

---

# 6.5 Validation

新增：

```
sdd validate
```

检查：

- Change完整性；
- 文件结构；
- 状态合法性。

---

# Phase 2验收标准

AI开发过程具备：

```
可解释
可验证
可追踪
```

---

# 7. Phase 3：Professional Version

版本：

```
v1.0
```

目标：

长期稳定使用。

---

# 7.1 Version Management

增加：

```
.sdd/version.yaml
```

管理：

- Harness版本；
- Skill版本；
- Schema版本。

---

# 7.2 Upgrade System

命令：

```
sdd upgrade
```

支持：

- 模板升级；
- Skill升级；
- 配置迁移。

---

# 7.3 Template System

增加：

```
templates/
├── spring-cloud-ddd
├── vue
├── ai-agent
```

---

# 7.4 IDE Integration

生成：

```
Agent Rules
```

支持：

- Trae；
- Cursor；
- Claude Code。

---

# 8. Phase 4：Team Version

目标：

团队协作。

增加：

## Approval机制

流程：

```
Draft
↓
Review
↓
Approve
```

---

## Audit

记录：

- 谁修改；
- 什么时候修改；
- 为什么修改。

---

## Collaboration

支持：

多人共同维护：

- Feature；
- Standards；
- Change。

---

# 9. 当前不实现内容

## Agent Runtime

原因：

已有：

- Trae；
- Cursor；
- Claude Code。

---

## Model Router

原因：

模型选择由开发工具负责。

---

## Knowledge Graph

原因：

初期 Markdown + YAML 已满足。

---

## Web UI

原因：

个人开发优先。

---

# 10. 推荐开发顺序

实际编码顺序：

```
1. 创建 Harness Repository
        ↓
2. 创建 Workspace Template
        ↓
3. 实现 sdd init
        ↓
4. 实现 Change Management
        ↓
5. 实现 Feature Tree
        ↓
6. 开发核心 Skills
        ↓
7. 开发 Knowledge Reverse
        ↓
8. 用真实项目验证
```

---

# 11. 第一个真实验证项目

使用：

```
AI Commerce Platform
```

验证：

## 初始化

```
sdd init
```

---

## 知识逆向

```
sdd-knowledge-reverse
```

---

## 新需求

例如：

```
订单取消优化
```

完整走：

```
Explore
↓
PRD
↓
Design
↓
Dev
↓
Test
↓
Converge
```

---

# 12. 最终目标

OpenSpec AI Development Harness 最终成为：

```
AI Coding Agent
        +
Software Engineering Knowledge
        +
SDD Workflow
        +
Engineering Governance
```

让 AI 从：

```
代码生成工具
```

升级为：

```
软件工程协作者
```
