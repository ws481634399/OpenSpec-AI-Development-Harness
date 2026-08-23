# AI 应用工程规范

> 版本：v0.1  
> 类型：AI 工程通用规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 AI 应用开发过程中的工程规范。


目标：

- 建立统一的 AI 应用开发方式；
- 规范 Agent、Prompt、Tool、Knowledge 的设计；
- 提升 AI 系统稳定性和可维护性；
- 指导 AI Coding Agent 和开发人员进行 AI 能力建设。


AI 工程规范主要关注：

```
模型能力

+

AI应用架构

+

知识管理

+

效果评估
```


---

# 2. AI 工程规范定位


AI 工程规范用于定义：

```
AI能力如何被设计、开发、集成和维护
```


主要覆盖：

- Prompt工程；
- Agent设计；
- Tool Calling；
- AI知识管理；
- AI效果评估。


---

# 3. AI 工程规范分类


当前 AI 工程规范包括：


## 3.1 Prompt规范


文件：

```
prompt-standard.md
```


定义：

- Prompt结构；
- 指令设计；
- 上下文组织；
- 输出约束；
- Prompt版本管理。


---

## 3.2 Agent规范


文件：

```
agent-standard.md
```


定义：

- Agent职责；
- Agent边界；
- Agent工作流程；
- Agent状态管理。


---

## 3.3 Tool Calling规范


文件：

```
tool-calling-standard.md
```


定义：

- 工具设计；
- 参数规范；
- 调用流程；
- 权限控制。


---

## 3.4 AI知识规范


文件：

```
knowledge-standard.md
```


定义：

- AI知识来源；
- 知识组织；
- 知识更新；
- 知识生命周期。


---

## 3.5 AI评估规范


文件：

```
evaluation-standard.md
```


定义：

- AI能力测试；
- 输出质量评估；
- Agent效果验证；
- 持续优化。


---

# 4. AI应用开发原则


## 4.1 AI能力工程化


AI能力不应该依赖单次 Prompt。


应该通过：

```
Prompt

+

Workflow

+

Tool

+

Knowledge

+

Evaluation
```

形成稳定能力。


---

## 4.2 明确AI边界


AI应该负责：

- 信息理解；
- 内容生成；
- 推理辅助；
- 自动化执行。


不应该：

- 绕过业务规则；
- 修改受保护知识；
- 执行未经授权操作。


---

## 4.3 可追踪原则


AI执行过程应该能够追踪：

- 输入上下文；
- 使用工具；
- 中间过程；
- 输出结果。


---

# 5. AI工程与OpenSpec关系


AI工程规范服务于 OpenSpec 工作流。


关系：


```
OpenSpec Workflow

        +

AI Engineering

        ↓

AI辅助软件开发
```


例如：


需求阶段：

```
AI分析需求
```


设计阶段：

```
AI辅助方案设计
```


开发阶段：

```
AI辅助代码生成
```


验证阶段：

```
AI辅助测试分析
```


---

# 6. AI Coding Agent 使用规则


AI Agent 工作时必须遵守：


读取：

```
standards/sdd/

+

standards/engineering/ai/

+

project knowledge
```


确认：

- 当前任务目标；
- 可使用能力；
- 输出要求；
- 权限范围。


---

# 7. AI变更要求


AI相关能力修改必须属于 Change。


流程：


```
Requirement

↓

Change

↓

AI Design

↓

Implementation

↓

Evaluation

↓

Evidence
```


---

# 8. 禁止行为


AI系统禁止：


## 8.1 无版本管理的Prompt修改


Prompt属于工程资产。


修改需要：

- 记录变化；
- 验证效果；
- 管理版本。


---

## 8.2 无限制工具调用


Tool调用必须：

- 明确权限；
- 参数校验；
- 结果验证。


---

## 8.3 无验证上线AI能力


AI能力发布前：

应该经过评估。


---

# 9. 与其他工程规范关系


AI工程规范与其他工程规范共同组成完整体系。


关系：


```
Frontend Engineering

+

Backend Engineering

+

Database Engineering

+

AI Engineering

+

Testing Engineering

↓

完整软件工程体系
```


---

# 10. 当前目录结构


```
ai/

├── README.md

├── prompt-standard.md

├── agent-standard.md

├── tool-calling-standard.md

├── knowledge-standard.md

└── evaluation-standard.md
```


---

# 11. 总结


AI 应用工程规范用于保证：


```
模型能力

+

工程流程

+

知识体系

+

质量验证
```


保持一致。


优秀的 AI 应用应该：

- 能力明确；
- 行为可控；
- 结果可验证；
- 持续演进。
