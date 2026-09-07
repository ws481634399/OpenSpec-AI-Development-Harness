# OpenSpec AI Development Harness Workflow

> Version: v1.0  
> Status: Draft  
> Type: Workflow Specification

---

# 1. Workflow Overview

OpenSpec AI Development Harness 使用 SDD（Specification Driven Development）作为核心开发流程。

整体流程：

```
Requirement
↓
Explore
↓
PRD
↓
Design
↓
Task
↓
Development
↓
Test
↓
Converge
↓
Knowledge Update
```

---

# 2. Workflow核心原则

## 2.1 一个需求对应一个 Change

任何开发活动必须有 Change。

关系：

```
User Requirement
        |
        |
       CHG
        |
        |
Feature Change
        |
        |
Repository Change
        |
        |
Implementation
```

---

## 2.2 阶段驱动开发

开发不能直接：

```
需求
↓
代码
```

必须：

```
需求
↓
理解
↓
设计
↓
计划
↓
实现
↓
验证
↓
沉淀
```

---

## 2.3 每个阶段必须有明确产物

每个阶段定义：

- Input；
- Process；
- Output；
- Evidence；
- Gate。

---

# 3. 生命周期总览

```
┌──────────────┐
│ Requirement  │
└──────┬───────┘
       ↓
┌──────────────┐
│   Explore    │
└──────┬───────┘
       ↓
┌──────────────┐
│     PRD      │
└──────┬───────┘
       ↓
┌──────────────┐
│   Design     │
└──────┬───────┘
       ↓
┌──────────────┐
│    Task      │
└──────┬───────┘
       ↓
┌──────────────┐
│     Dev      │
└──────┬───────┘
       ↓
┌──────────────┐
│    Test      │
└──────┬───────┘
       ↓
┌──────────────┐
│  Converge    │
└──────────────┘
```

---

# 4. Requirement阶段

## 目标

登记用户原始需求。

## 输入

用户需求。

例如：

```
增加订单取消原因。
```

---

## 输出

创建：

```
delivery/requests/
```

例如：

```
REQ-ORDER-001.md
```

内容：

```yaml
id:
 REQ-ORDER-001
content:
 增加订单取消原因
source:
 user
```

---

## 注意

Requirement 不进行：

- 产品设计；
- 技术设计；
- 代码修改。

它只是需求入口。

---

# 5. Explore阶段

Skill：

```
sdd-explore
```

---

## 目标

理解需求并确定变化范围。

主要工作：

1. 分析需求；
2. 命中特性树；
3. 创建Change；
4. 判断影响范围。

---

# 输入

```
Requirement
```

以及：

```
product/feature-tree.yaml
standards/
```

---

# 处理流程

## Step 1：Feature Matching

判断：

是否已有Feature。

例如：

已有：

```
订单中心
 └── 订单取消
```

则：

命中：

```
FEAT-ORDER-CANCEL
```

---

如果不存在：

创建：

```
Candidate Feature
```

等待确认。

---

## Step 2：创建Change

生成：

```
CHG-ORDER-001
```

目录：

```
delivery/changes/
└── CHG-ORDER-001
```

---

## Step 3：影响分析

分析：

影响：

- Feature；
- Repository；
- Standards。

---

# 输出

```
CHG
Feature Match
Impact Analysis
```

---

# Gate

必须确认：

- Feature是否正确；
- Change范围是否正确。

---

# 6. PRD阶段

Skill：

```
sdd-prd
```

---

# 目标

将需求转换为产品规格。

---

# 输入

```
CHG
Feature
Requirement
```

---

# 输出

```
delivery/changes/CHG-ID/<L1名>/<L2名>/<L3名>/<STORY名>/
spec.md
```

> Phase 3.5 v0.3：绑定 feature-path 后所有产物落 STORY 目录（业务名四级链，README front-matter id 作锚点）；未绑定或 candidate 时暂存 CHG 根，绑定后由 skeleton 自动迁移。

---

# PRD内容

包括：

## 背景

为什么做。

---

## 用户价值

解决什么问题。

---

## 功能范围

包含：

- 做什么；
- 不做什么。

---

## 业务规则

例如：

```
取消订单必须填写取消原因。
```

---

## 验收标准

例如：

```
用户取消订单时必须输入原因。
```

---

# Gate

确认：

- 产品目标明确；
- 范围明确；
- 验收标准明确。

---

# 7. Design阶段

Skill：

```
sdd-design
```

---

# 目标

产生技术设计。

---

# 输入

```
PRD
Standards
Current Specs
Repository
```

---

# 设计原则

设计必须有证据。

不能：

```
因为感觉这样设计。
```

必须：

```
已有代码
已有规则
已有架构
技术依据
```

---

# 输出

```
design.md
```

---

# Design内容

包括：

## 当前状态分析

例如：

```
OrderService 当前负责订单取消。
```

---

## 方案设计

例如：

```
新增cancelReason字段。
```

---

## Repository影响

例如：

```
REPO-ORDER-SERVICE
REPO-WEB
```

---

## 数据变化

例如：

SQL：

```
ALTER TABLE order
ADD cancel_reason
```

---

## 风险

例如：

```
历史订单没有取消原因。
```

---

## 未确认问题

如果：

没有证据：

必须记录。

例如：

```
是否需要支持历史订单补录？
需要业务确认。
```

---

# Gate

必须确认：

- 设计依据充分；
- 无关键未知问题；
- 影响范围明确。

---

# 8. Task阶段

Skill：

```
sdd-task
```

---

# 目标

将设计拆解为执行任务。

---

# 输入

```
Design
```

---

# 输出

```
tasks.md
```

---

# Task结构

例如：

```
TASK-001
修改订单表结构
TASK-002
修改OrderService
TASK-003
增加前端输入框
TASK-004
增加测试
```

---

# Gate

确认：

任务覆盖设计。

---

# 9. Development阶段

Skill：

```
sdd-dev
```

---

# 目标

执行代码修改。

---

# 输入

```
Task
Design
Repository
```

---

# 修改范围

允许：

```
implementation/
```

---

禁止：

直接修改：

```
approved standards
current specs
```

---

# 开发要求

必须：

- 遵循项目规范；
- 保留修改证据；
- 关联RCHG。

---

# 输出

代码变化：

```
implementation/
```

以及：

```
development evidence
```

---

# 10. Test阶段

Skill：

```
sdd-test
```

---

# 目标

验证：

代码是否符合需求。

---

# 输入

```
PRD
Design
Implementation
```

---

# 输出

```
test-report.md
```

包括：

- 测试结果；
- 覆盖范围；
- 问题。

---

# Gate

确认：

功能完成。

---

# 11. Converge阶段

Skill：

```
sdd-converge
```

---

# 目标

将本次变化沉淀为项目知识。

---

# 输入

```
Completed Change
```

---

# 更新内容

可能更新：

## Product

例如：

```
Feature Spec
```

---

## Standards

例如：

```
新增项目规则
```

---

## Delivery

归档：

```
archive/
```

---

# 输出

```
Knowledge Update
Change Archive
```

---

# 12. Change状态流转

```
Created
↓
Exploring
↓
Designed
↓
Tasked
↓
Developing
↓
Testing
↓
Completed
↓
Archived
```

---

# 13. 异常流程

## 13.1 信息不足

进入：

```
unresolved.md
```

等待：

人工确认。

---

## 13.2 设计冲突

进入：

```
conflicts.md
```

记录：

- 冲突内容；
- 影响；
- 待决策项。

---

## 13.3 知识冲突

禁止：

自动覆盖。

必须：

人工确认。

---

# 14. AI Agent使用规则

AI Agent 在不同阶段必须遵守：

## Explore

负责：

理解需求。

禁止：

写代码。

---

## PRD

负责：

产品描述。

禁止：

直接设计技术方案。

---

## Design

负责：

技术设计。

必须：

引用证据。

---

## Dev

负责：

实现代码。

必须：

遵守Change范围。

---

## Test

负责：

验证。

---

# 15. Workflow总结

OpenSpec SDD流程：

```
需求进入
↓
理解变化
↓
确认产品
↓
设计方案
↓
拆解任务
↓
修改代码
↓
验证结果
↓
沉淀知识
```

最终形成：

```
Requirement
+
Knowledge
+
Specification
+
Implementation
+
Evidence
```

闭环。
