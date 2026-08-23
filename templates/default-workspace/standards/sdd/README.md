# SDD Standards

> Version: v0.1  
> Type: OpenSpec Standard  
> Scope: SDD Workflow


## 1. 文档目的

本目录存放 OpenSpec 规范驱动开发（SDD）标准。

这些标准定义所有由 OpenSpec 管理的项目在 AI 辅助软件开发过程中应遵循的通用规则。


其目的在于提供：

- 一致的开发工作流；
- 标准化的 AI 行为；
- 可追溯的变更管理；
- 可靠的知识演进。


---

# 2. SDD 概览


OpenSpec SDD 通过以下流程管理软件开发：


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
```


每个阶段具备：

- 明确的输入；
- 预期的输出；
- 执行规则；
- 校验要求。


---

# 3. SDD 标准分类


本目录包含：


## Change Lifecycle


文件：


```
change-lifecycle.md
```


定义：

- Change 创建；
- Change 状态；
- Change 流转规则；
- Change 完成标准。


---

## Knowledge Management


文件：


```
knowledge-management.md
```


定义：

- 知识生命周期；
- 知识来源；
- 批准规则；
- 冲突处理。


---

## Skill Execution


文件：


```
skill-execution.md
```


定义：

- Skill 结构；
- Skill 执行规则；
- AI 行为约束；
- 输出校验。


---

# 4. SDD 核心原则


## 4.1 Change 驱动开发


每一次有意义的软件变更都应通过 Change 管理。


```
Requirement

↓

Change

↓

Implementation

↓

Evidence

↓

Knowledge Update
```


---

## 4.2 先规格后实现


开发应遵循：


```
Understand

↓

Specify

↓

Design

↓

Implement

↓

Validate
```


AI 不应直接从需求跳到代码。


---

## 4.3 知识优先


AI Agent 应使用项目知识作为上下文。


知识来源包括：


```
standards/

product/

delivery/

implementation/
```


---

## 4.4 基于证据的开发


重要决策应有证据。


证据可包含：


- 仓库；
- 文件路径；
- 代码符号；
- 提交（Commit）；
- 设计文档。


---

# 5. AI Agent 规则


在 OpenSpec 工作空间中运行的 AI Agent 应：


## Must


- 遵循 SDD 工作流；
- 加载所需上下文；
- 尊重项目标准；
- 产出预期制品；
- 记录重要证据。


## Must Not


- 跳过必经阶段；
- 直接修改已批准的知识；
- 做无依据的假设；
- 隐藏冲突或不确定性。


---

# 6. 标准使用方式


SDD 标准由 AI Skill 根据工作流阶段加载。


示例：


Explore：


```
standards/sdd/

+

product/
```


Design：


```
standards/sdd/

+

standards/engineering/

+

product/

+

implementation/
```


Development：


```
standards/sdd/

+

delivery/

+

implementation/
```


---

# 7. 标准维护


SDD 标准由 OpenSpec Harness 维护。


更新应遵循：


```
Proposal（提案）

↓

Review（评审）

↓

Approval（批准）

↓

Version Update（版本更新）
```


已批准的标准不应被静默修改。


---

# 8. 目录结构


当前结构：


```
sdd/

├── README.md

├── change-lifecycle.md

├── knowledge-management.md

└── skill-execution.md
```


---

# 9. 总结


SDD Standards 为 OpenSpec 开发提供基础。


它们确保：


```
AI Capability（AI 能力）

+

Engineering Process（工程流程）

+

Project Knowledge（项目知识）

+

Evidence Tracking（证据追踪）
```


被整合为一个受控的软件开发工作流。
