# Skill Execution Standard

> Version: v0.1  
> Type: SDD Standard  
> Scope: OpenSpec Workspace


## 1. 文档目的

本文档定义 OpenSpec Skill 的执行规则。

Skill 定义 AI Coding Agent 如何执行一项具体的软件工程活动。

Skill 标准化的目的在于确保：

- AI 行为可预测；
- AI 执行遵循工程工作流；
- 生成的制品保持一致；
- 每个动作可追溯。


---

# 2. Skill 定义


Skill 是可复用的 AI 能力模块。


一个 Skill 包含：


```
Skill

├── Instruction

├── Context

├── Process

├── Output

└── Validation
```


Skill 不仅仅是一段 prompt。

它定义：

- AI 应做什么；
- AI 应读什么；
- AI 应产出什么；
- 输出质量如何校验。


---

# 3. Skill 结构


每个 Skill 应遵循：


```
skill-name/

├── skill.yaml

├── SKILL.md

├── templates/

├── examples/

├── checklist.md

└── rules.md
```


---

# 4. Skill 元数据


每个 Skill 应提供元数据。


示例：


```yaml
id: sdd-design

version: 1.0.0

stage: design

description: Generate technical design documents.

input:

  - prd

  - standards

  - repository


output:

  - design.md
```


---

# 5. Skill 执行生命周期


Skill 执行遵循：


```
加载上下文

↓

理解任务

↓

执行指令

↓

生成制品

↓

校验输出

↓

记录证据
```


---

# 6. 上下文加载规则


执行前，AI 必须加载所需上下文。


上下文来源：


## Standards


位置：


```
standards/
```


目的：

理解项目规则。


---

## Product


位置：


```
product/
```


目的：

理解业务能力。


---

## Delivery


位置：


```
delivery/
```


目的：

理解当前 Change。


---

## Implementation


位置：


```
implementation/
```


目的：

理解既有系统行为。


---

# 7. Skill 输入规则


每个 Skill 必须定义：


## 必填输入（Required Input）


执行所需的信息。


示例：


```
sdd-design


Required:

- PRD

- Repository information

- Engineering standards
```


---

## 可选输入（Optional Input）


附加上下文。


示例：


```
Historical design documents
```


---

# 8. Skill 输出规则


每个 Skill 必须产出定义的制品。


示例：


## Explore Skill


输出：


```
Change

Feature Mapping

Impact Analysis
```


---

## Design Skill


输出：


```
design.md
```


---

## Development Skill


输出：


```
Implementation Change

Evidence
```


---

# 9. Skill 行为规则


## Rule 1: 遵循工作流


Skill 必须按 SDD 工作流执行。


示例：


Development Skill 不得在 Design 完成前运行。


---

## Rule 2: 尊重知识边界


AI 不得在没有 Change 流程的情况下修改：


```
approved standards

approved specifications
```


---

## Rule 3: 必须提供证据


重要结论必须提供证据。


证据包括：


- 文件路径；
- 仓库；
- 提交（Commit）；
- 符号；
- 文档来源。


---

## Rule 4: 处理不确定性


信息不足时：


AI 必须创建：


```
unresolved.md
```


或：


```
conflicts.md
```


AI 不得编造无依据的决策。


---

# 10. Skill 阶段规则


Skill 与工作流阶段关联。


---

# Explore 阶段


典型 Skill：


```
sdd-explore
```


目的：


理解需求并识别影响。


允许：


- 需求分析；
- Feature 匹配；
- Change 创建。


禁止：


- 直接修改代码。


---

# PRD 阶段


典型 Skill：


```
sdd-prd
```


目的：


创建产品规格。


允许：


- 定义用户价值；
- 定义业务规则；
- 定义验收标准。


禁止：


- 技术实现决策。


---

# Design 阶段


典型 Skill：


```
sdd-design
```


目的：


创建技术方案。


必做：


- 既有系统分析；
- 设计证据；
- 风险分析。


---

# Task 阶段


典型 Skill：


```
sdd-task
```


目的：


将设计拆解为可执行任务。


必做：


- 明确的实现目标；
- 验证方法。


---

# Development 阶段


典型 Skill：


```
sdd-dev
```


目的：


实现已批准的设计。


允许：


```
implementation/
```


禁止：


直接修改已批准的知识。


---

# Test 阶段


典型 Skill：


```
sdd-test
```


目的：


验证实现。


必做：


- 测试结果；
- 覆盖率；
- 已知限制。


---

# Converge 阶段


典型 Skill：


```
sdd-converge
```


目的：


更新项目知识。


可能的更新：


```
standards/

product/

glossary/
```


---

# 11. Skill 版本管理


Skill 必须使用语义化版本。


格式：


```
Major.Minor.Patch
```


示例：


```
sdd-design

1.0.0
```


---

# 版本变更


## Patch


Bug 修复。


示例：


改进输出格式。


---

## Minor


向后兼容的能力新增。


示例：


新增校验步骤。


---

## Major


破坏性变更。


示例：


变更输出制品结构。


---

# 12. Skill 质量检查清单


Skill 批准前：


```
[ ] 目的明确

[ ] 输入已定义

[ ] 输出已定义

[ ] 上下文规则已定义

[ ] 校验已定义

[ ] 示例已提供

[ ] 版本已定义
```


---

# 13. Skill 治理


Skill 生命周期：


```
Draft（草稿）

↓

Testing（测试中）

↓

Approved（已批准）

↓

Deprecated（已废弃）
```


---

# 14. 总结


Skill Execution Standard 确保：


```
AI Agent

+

Workflow

+

Knowledge

+

Evidence

```


通过标准化执行串联起来。


Skill 让 AI Coding Agent 能够以可重复的工程流程参与软件开发。
