# OpenSpec AI Development Harness Skill Specification

> Version: v1.0  
> Status: Draft  
> Type: Skill Specification

---

# 1. Skill概述

## 1.1 什么是 Skill

Skill 是 OpenSpec Harness 中定义 AI Agent 行为能力的最小执行单元。

Skill 不等同于 Prompt。

Prompt：

> 告诉 AI 怎么回答。

Skill：

> 定义 AI 在某个工程阶段应该如何工作。

一个 Skill 包含：

- 工作目标；
- 输入上下文；
- 执行规则；
- 输出产物；
- 验证标准；
- 使用模板。

---

# 2. Skill在系统中的位置

整体关系：

```
Developer
    |
AI Coding Agent
    |
Skill
    |
Workflow Stage
    |
Knowledge Context
    |
Output Artifact
```

例如：

```
用户需求
↓
sdd-explore
↓
创建CHG
↓
delivery/changes/
```

---

# 3. Skill设计原则

## 3.1 一个Skill对应一个明确职责

正确：

```
sdd-explore
负责需求探索
```

错误：

```
sdd-manager
负责需求、设计、编码、测试全部流程
```

---

## 3.2 Skill必须阶段化

Skill必须绑定：

SDD Workflow阶段。

例如：

|阶段|Skill|
|-|-|
|Explore|sdd-explore|
|PRD|sdd-prd|
|Design|sdd-design|
|Task|sdd-task|
|Dev|sdd-dev|
|Test|sdd-test|
|Converge|sdd-converge|

---

## 3.3 Skill必须有明确输入和输出

不能：

```
帮我分析一下需求
```

必须：

```
输入：
Requirement
输出：
CHG
Feature Match
Impact Analysis
```

---

## 3.4 Skill必须可验证

每个 Skill 必须定义：

完成标准。

例如：

sdd-design：

必须：

- 有设计方案；
- 有证据；
- 有风险说明；
- 有未确认项。

---

# 4. Skill目录规范

所有 Skill 统一结构：

```
skills/
└── skill-name/
    ├── SKILL.md
    ├── skill.yaml
    ├── templates/
    ├── examples/
    ├── checklist.md
    └── rules.md
```

---

# 5. Skill文件说明

## 5.1 skill.yaml

定义 Skill 元信息。

示例：

```yaml
id:
 sdd-design
version:
 1.0.0
stage:
 design
description:
 技术设计阶段Skill
input:
 - requirement
 - prd
 - standards
output:
 - design.md
requires:
 - evidence
```

---

# 5.2 SKILL.md

核心执行说明。

包含：

- Skill目标；
- 执行流程；
- AI行为规则。

示例：

```markdown
# sdd-design
你的角色：
系统架构设计者。
任务：
根据PRD生成技术设计。
必须：
1. 查询已有Standards
2. 分析现有代码
3. 输出设计证据
禁止：
无依据设计。
```

---

# 5.3 templates/

输出模板。

例如：

```
templates/
└── design-template.md
```

用于：

保证输出格式一致。

---

# 5.4 examples/

示例。

例如：

```
examples/
└── order-cancel-example/
```

用于：

指导AI理解标准输出。

---

# 5.5 checklist.md

质量检查。

例如：

```
Design Checklist
[ ] 是否引用现有代码
[ ] 是否说明影响范围
[ ] 是否记录风险
[ ] 是否记录未知问题
```

---

# 5.6 rules.md

约束规则。

例如：

```
禁止：
- 跳过Feature匹配
- 无Change直接修改代码
- 覆盖approved知识
```

---

# 6. Skill生命周期

Skill状态：

```
Draft
↓
Testing
↓
Approved
↓
Deprecated
```

---

## Draft

新创建Skill。

允许：

实验。

---

## Testing

项目验证阶段。

---

## Approved

正式使用。

---

## Deprecated

废弃。

---

# 7. Skill执行模型

一个Skill执行包含：

```
Input
↓
Context Loading
↓
Instruction
↓
AI Execution
↓
Output Validation
↓
Evidence Record
```

---

# 8. Skill输入规范

Skill输入来源：

## 8.1 用户输入

例如：

```
需求描述
```

---

## 8.2 Product Knowledge

例如：

```
Feature Tree
```

---

## 8.3 Standards

例如：

```
DDD规则
```

---

## 8.4 Delivery Context

例如：

```
当前CHG
```

---

## 8.5 Implementation

例如：

```
代码仓库
```

---

# 9. Skill输出规范

输出必须属于：

## Artifact

例如：

```
prd.md
design.md
tasks.md
```

---

## Knowledge Update

例如：

```
Feature更新
Spec更新
```

---

## Evidence

例如：

```
设计依据
代码位置
测试结果
```

---

# 10. 核心Skill定义

OpenSpec Harness v1.x 默认包含：

---

# 10.1 sdd-workflow（已由 Workflow Engine 替代）

> **演进说明**：本 Skill 的「管理开发状态」职责在 Phase 1.5 落地时由
> **Gate-driven Workflow Engine**（`openspec workflow run` 命令族）替代——
> 状态推进必须经 Transition Service，不再是 Agent 可执行的 Skill（避免绕过 Gate）。
> Agent 侧的「当前阶段 / 下一步行动」通过 `openspec status` 与 `openspec workflow run`
> 返回状态（WAITING_FOR_* / ADVANCED / COMPLETED）获取。
> skills/ 目录中因此不再包含 sdd-workflow；后续 Skill 编号从 sdd-explore 起。

---

# 10.2 sdd-explore

## 职责

需求探索。

输入：

```
Requirement
```

输出：

```
CHG
Feature Match
Impact Analysis
```

规则：

必须：

- 命中特性树；
- 判断影响范围；
- 发现未知问题。

---

# 10.3 sdd-feature-tree

## 职责

管理产品能力。

能力：

- Feature匹配；
- Feature创建；
- Feature关系维护。

输入：

```
Requirement
```

输出：

```
Feature Decision
```

---

# 10.4 sdd-prd

## 职责

生成产品规格。

输入：

```
CHG
Feature
```

输出：

```
prd.md
```

---

# 10.5 sdd-design

## 职责

技术方案设计。

输入：

```
PRD
Standards
Repository
```

输出：

```
design.md
```

必须：

- 有证据；
- 有冲突说明；
- 有未确认问题。

---

# 10.6 sdd-task

## 职责

任务拆分。

输入：

```
Design
```

输出：

```
tasks.md
```

---

# 10.7 sdd-dev

## 职责

代码实现。

输入：

```
Task
Design
```

输出：

```
Implementation Change
```

规则：

允许：

```
implementation/
```

禁止：

修改：

```
approved standards
```

---

# 10.8 sdd-test

## 职责

验证实现。

输入：

```
Implementation
PRD
Design
```

输出：

```
test-report.md
```

---

# 10.9 sdd-converge

## 职责

知识收敛。

输入：

```
Completed CHG
```

输出：

```
Updated Knowledge
```

---

# 10.10 sdd-knowledge-reverse

## 职责

旧项目知识逆向。

输入：

```
implementation/
```

扫描：

- Code
- SQL
- API
- Config
- Docs

输出：

```
standards/
product/
delivery/archive/
```

---

# 11. Skill与版本管理

每个Skill独立版本。

例如：

```
sdd-design
v1.0.0
v1.1.0
v2.0.0
```

版本变化：

## Patch

修复问题。

## Minor

增加能力。

## Major

改变输出结构。

---

# 12. Skill开发流程

创建：

```
Draft Skill
```

↓

编写：

```
skill.yaml
SKILL.md
template
```

↓

项目验证

↓

收集反馈

↓

Approved

---

# 13. Skill质量标准

一个合格Skill必须满足：

## 明确性

是否知道：

做什么。

---

## 可执行

是否知道：

怎么做。

---

## 可验证

是否知道：

是否完成。

---

## 可沉淀

是否产生：

长期价值。

---

# 14. 总结

OpenSpec Skill 是：

> AI Coding Agent 在软件工程流程中的标准化能力模块。

通过 Skill：

将：

```
人的开发经验
+
项目规范
+
AI能力
```

结合。

最终实现：

```
AI Agent
按照工程流程
持续开发软件
```
