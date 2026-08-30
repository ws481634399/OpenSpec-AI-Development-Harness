# OpenSpec AI Development Harness Roadmap

> Version: v1.0  
> Status: Draft  
> Type: Project Roadmap

---

# 1. 项目定位

## 1.1 项目名称

OpenSpec AI Development Harness

## 1.2 项目定义

OpenSpec AI Development Harness 是一套面向 AI Coding Agent 的软件工程开发框架。

它通过：

- SDD（Specification Driven Development）开发流程；
- 项目知识管理；
- Feature 管理；
- Change 管理；
- Skill 标准化；
- 工程规则约束；

帮助开发者使用 Trae、Cursor、Claude Code 等 AI Coding Agent 进行可控、可持续的软件开发。

---

# 2. 背景与目标

## 2.1 背景

随着 AI Coding Agent 的发展，AI 已经具备：

- 代码生成能力；
- 项目分析能力；
- 自动修改能力；
- 工具调用能力。

但是在真实项目中仍存在问题：

### 项目知识无法长期沉淀

AI 每次会话都是新的上下文。

导致：

- 不知道历史设计；
- 不知道业务规则；
- 不知道项目约束。

---

### 开发过程缺少规范

AI 可以快速生成代码，但是：

- 需求分析不足；
- 架构考虑不足；
- 修改范围不可控；
- 缺少验证。

---

### 代码与业务知识脱节

传统项目：

需求
↓
文档
↓
代码

AI时代需要：

需求
↓
知识
↓
规格
↓
代码
↓
知识更新

---

# 3. 项目目标

OpenSpec Harness 的目标：

建立一个 AI 原生的软件开发工作体系。

核心目标：

## 3.1 让 AI 理解项目

通过：

- Standards
- Product Knowledge
- Delivery History
- Repository Information

建立长期项目上下文。

---

## 3.2 让 AI 按流程开发

通过 SDD Workflow：

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

避免：

直接从需求进入代码。

---

## 3.3 让 AI 修改可追踪

通过：

- Change
- Feature Change
- Repository Change
- Evidence

记录：

为什么修改？

修改什么？

影响哪里？

---

## 3.4 让 AI 开发结果可沉淀

开发完成后：

代码变化

↓

规格更新

↓

知识沉淀

↓

下一次开发复用

形成项目长期记忆。

---

# 4. 核心设计原则

## 4.1 Harness 不替代 AI Agent

OpenSpec Harness 不负责：

- 训练模型；
- 运行模型；
- 替代 IDE。

它负责：

AI Coding Agent +
工程规范 +
项目知识

---

## 4.2 Harness 不管理业务代码结构

Implementation World：

保持：

- 原项目结构；
- 原技术栈；
- 原仓库方式。

Harness 不强制：

- DDD；
- 微服务；
- 单体；
- 特定语言。

---

## 4.3 知识与代码分离

代码：

implementation/

知识：

standards/
product/
delivery/

代码描述：

"怎么实现"

知识描述：

"为什么这么实现"

---

## 4.4 一个需求对应一个 Change

无论：

- 一个仓库；
- 多个仓库；
- 多个 Feature。

统一：

Requirement
↓
CHG
↓
FCHG
↓
RCHG
↓
Implementation

---

# 5. 整体演进路线

OpenSpec Harness 分为五个阶段：

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
↓
Phase 5
Ecosystem Version

---

# 6. Phase 0：Architecture Foundation

## 目标

完成 OpenSpec Harness 的基础设计。

## 主要内容

### Workspace模型

定义：

standards/
product/
delivery/
implementation/

---

### SDD Workflow

定义：

Explore
PRD
Design
Task
Dev
Test
Converge

---

### Change模型

定义：

CHG
FCHG
RCHG

---

### Skill规范

定义：

AI Skill：

- 输入；
- 输出；
- 规则；
- 模板。

---

## 交付物

OpenSpec Harness Specification v1.0

包含：

- Architecture
- Workflow
- Skill Specification
- Knowledge Model

---

# 7. Phase 1：MVP Version

## 目标

让个人开发者可以真实使用。

---

## 核心能力

### Workspace初始化

提供：

sdd init

生成：

.sdd/
standards/
product/
delivery/
implementation/

---

### Repository管理

支持：

- 单仓（mode: single → `implementation/`）；
- 多仓（mode: multi → `implementation/<repo>/` 子仓，repositories.yaml + .gitmodules 对照）；
- 单仓多模块（mode: multi + 普通目录注册：repositories.yaml 中 kind 为目录的条目可指向同一仓内多个 module 子目录，无独立 .git；doctor 对该形态放行——HEAD 检查仅对 git 仓库要求）。

---

### Change管理

支持：

创建：

CHG

管理：

- PRD；
- Design；
- Task；
- Evidence。

---

### 核心Skill

实现：

sdd-workflow（已被 Gate-driven Workflow Engine + `openspec workflow run` 替代，非 Agent Skill——状态推进必须经 Transition Service，见 03-Skill-Spec §10.1 演进说明）
sdd-explore
sdd-prd
sdd-design
sdd-dev
sdd-test
sdd-converge

（实际交付 10 个 Agent Skill：上述 6 个 + Phase 1.3/2.x 增补的 sdd-task / sdd-reverse / sdd-feature-tree / sdd-knowledge）

---

### Feature Tree

支持：

- Feature匹配；
- Feature创建；
- Feature状态管理。

---

### Knowledge Reverse

支持：

旧项目接入：

implementation
↓
standards
product
delivery/archive

---

## 交付物

OpenSpec Harness v1.0 MVP

---

# 8. Phase 2：Engineering Enhancement

## 目标

提升 AI 开发质量。

---

## 增强能力

### Prompt体系

统一：

- Explore Prompt；
- Design Prompt；
- Coding Prompt；
- Review Prompt。

---

### Context规则

定义：

不同阶段：

读取哪些知识。

---

### Evidence体系

记录：

- Repository；
- Commit；
- Path；
- Symbol。

---

### Review能力

增加：

sdd-review

检查：

- 需求一致性；
- 设计一致性；
- 代码质量；
- 知识同步。

---

### Validation

增加：

sdd validate

---

## 交付物

OpenSpec Harness v1.5

---

# 9. Phase 3：Professional Version

## 目标

支持长期稳定使用。

---

## 能力

### Version管理

管理：

- Harness版本；
- Skill版本；
- Schema版本。

---

### Upgrade系统

支持：

- 升级；
- 迁移；
- 回滚。

---

### Template系统

支持：

项目模板：

- Spring Cloud；
- Vue；
- AI Agent；
- Empty。

---

### IDE适配

支持生成：

- Trae Rules；
- Cursor Rules；
- Claude Code Instructions。

---

## 交付物

OpenSpec Harness v2.0

---

# 10. Phase 4：Team Version

## 目标

支持团队协作。

能力：

- Approval流程；
- 权限管理；
- Audit；
- Change协作；
- 冲突管理。

---

# 11. Phase 5：Ecosystem Version

## 目标

形成扩展生态。

能力：

- Plugin系统；
- MCP集成；
- 多模型支持；
- 知识图谱。

---

# 12. 当前推荐实现范围

对于个人开发者：

推荐完成：

Phase 0
Phase 1
Phase 2

即可满足：

- AI辅助开发；
- 项目知识管理；
- SDD流程控制；
- 长期维护。

不建议初期实现：

- Agent Runtime；
- 模型平台；
- 自研IDE；
- 复杂知识图谱。

---

# 13. 后续文档规划

OpenSpec Harness 文档体系：

docs/
├── 00-Roadmap.md
├── 01-Architecture.md
├── 02-Workflow.md
├── 03-Skill-Spec.md
├── 04-Knowledge-Model.md
├── 05-Implementation-Plan.md
└── 06-v0.1-Init-Design.md

---

# 总结

OpenSpec AI Development Harness 的目标不是替代 AI Coding Agent。

而是：

> 为 AI Coding Agent 提供一套可持续的软件工程方法，使 AI 从一次性的代码生成工具，升级为具备项目知识、开发流程和工程约束的软件开发协作者。
