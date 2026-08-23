# OpenSpec AI Development Harness

## 简介

OpenSpec AI Development Harness 是一个为 AI Coding Agent 设计的 SDD（规范驱动开发）框架。

它提供：

- 软件开发工作流；
- 项目知识管理；
- 特性管理；
- 变更管理；
- AI Skill 规范；
- 工程治理。

其目标是使 AI Coding Agent，例如：

- Trae
- Cursor
- Claude Code

能够带着项目上下文、工程规则和可追溯的交付流程参与软件开发。

---

# 项目愿景

传统 AI 编码：

```
需求

↓

AI

↓

代码
```

存在的问题：

- 缺乏项目记忆；
- 缺乏工程约束；
- 缺乏可追溯性；
- 长期维护困难。

OpenSpec 方式：

```
需求

↓

知识

↓

规范

↓

实现

↓

证据

↓

知识更新
```

---

# 架构概览

OpenSpec Harness 由以下部分组成：

```
OpenSpec AI Development Harness


├── 工作流层（Workflow Layer）

├── 知识层（Knowledge Layer）

├── Skill 层（Skill Layer）

├── 证据层（Evidence Layer）

├── 仓库层（Repository Layer）

└── 治理层（Governance Layer）
```

---

# 核心概念

## 四个世界（Four Worlds）

OpenSpec 通过四个世界管理项目信息：

### 标准世界（Standards World）

```
standards/
```

项目规则与工程标准。

---

### 产品世界（Product World）

```
product/
```

产品能力与规范。

---

### 交付世界（Delivery World）

```
delivery/
```

需求变更与交付历史。

---

### 实现世界（Implementation World）

```
implementation/
```

实际源代码与运行时资源。

---

# 开发状态

当前版本：

```
v0.1
```

当前阶段：

```
Phase 1.0 - Repository Bootstrap
```

状态：

```
Foundation Setup
```

---

# 仓库结构

```
OpenSpec-AI-Development-Harness/

├── docs/

├── plans/

├── templates/

├── skills/

├── tools/

├── scripts/

├── schemas/

└── examples/
```

## docs

架构与规范文档。

## plans

实现计划与开发里程碑。

## templates

OpenSpec 初始化时使用的工作区模板。

## skills

AI Skill 定义。

## tools

CLI 工具与实用程序。

## scripts

开发与自动化脚本。

## schemas

数据结构定义。

## examples

示例项目与使用案例。

---

# 路线图

## Phase 0

基础设计

已完成：

- 架构
- 工作流
- Skill 规范
- 知识模型

---

## Phase 1

MVP 实现

目标：

- 工作区初始化；
- 变更管理；
- 特性树（Feature Tree）；
- 核心 Skill；
- 知识反向工程（Knowledge Reverse）。

---

## Phase 2

工程增强

目标：

- 证据系统；
- 校验；
- 评审工作流；
- 上下文管理。

---

# 快速开始

（当前开发中）

未来用法：

```bash
sdd init
```

初始化一个 OpenSpec 工作区。

---

# 设计理念

OpenSpec Harness 不替代 AI Coding Agent。

它提供：

```
AI Agent

+

软件工程流程

+

项目知识

+

治理
```

使 AI 成为长期的软件工程协作者。

---

# 许可证

详见 LICENSE 文件。
