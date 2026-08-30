# Prompt工程规范

> 版本：v0.1  
> 类型：AI工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 AI 应用中 Prompt 的设计、管理和维护规范。


目标：

- 提升 Prompt 输出稳定性；
- 保证 AI 行为可控；
- 规范 Prompt 生命周期管理；
- 使 Prompt 成为可维护的工程资产。


Prompt 不只是自然语言描述，而是：

```
AI能力定义

+

任务约束

+

上下文组织

+

输出规范
```


---

# 2. Prompt设计原则


## 2.1 目标明确


Prompt 应该明确描述：

- AI需要完成什么任务；
- 输入信息是什么；
- 输出结果是什么。


避免：

模糊目标。


例如：

不推荐：

```
帮我分析一下订单。
```


推荐：

```
根据订单数据分析异常订单，
输出异常原因、影响范围和处理建议。
```


---

## 2.2 角色明确


复杂任务应该定义 AI 角色。


例如：

```
你是一名资深后端架构师，
负责分析微服务架构设计。
```


角色应该与任务匹配。


---

## 2.3 上下文充分


Prompt 应提供完成任务所需上下文。


包括：

- 背景信息；
- 业务规则；
- 输入数据；
- 约束条件。


避免：

依赖 AI 自行猜测。


---

## 2.4 输出明确


Prompt 应定义输出格式。


例如：


要求输出：

```
1. 问题分析

2. 解决方案

3. 风险说明
```


避免：

只要求：

```
给我答案。
```


---

# 3. Prompt结构规范


推荐 Prompt 结构：


```
Role

↓

Context

↓

Task

↓

Constraints

↓

Output Format

↓

Validation
```


---

## 3.1 Role（角色）


说明：

AI应该以什么身份执行任务。


示例：

```
你是一名系统架构师。
```


---

## 3.2 Context（上下文）


提供任务背景。


例如：

```
当前项目采用微服务架构，
包含订单、库存、支付服务。
```


---

## 3.3 Task（任务）


明确执行目标。


例如：

```
设计订单服务领域模型。
```


---

## 3.4 Constraints（约束）


定义限制条件。


例如：

```
必须遵循DDD设计原则。

不能修改已有接口。
```


---

## 3.5 Output Format（输出格式）


规定结果结构。


例如：

```
输出Markdown文档。

包含：

- 背景

- 方案

- 风险
```


---

## 3.6 Validation（验证）


定义结果检查方式。


例如：

```
检查是否包含：

- 服务边界

- 数据模型

- 接口设计
```


---

# 4. Prompt分类规范


Prompt应该按照用途分类。


推荐：


```
prompts/

├── development/

├── analysis/

├── design/

├── testing/

└── operation/
```


---

## 4.1 分析类Prompt


用于：

- 需求分析；
- 代码分析；
- 问题定位。


---

## 4.2 设计类Prompt


用于：

- 架构设计；
- 技术方案；
- 数据模型设计。


---

## 4.3 开发类Prompt


用于：

- 代码生成；
- 代码修改；
- 重构。


---

## 4.4 测试类Prompt


用于：

- 测试生成；
- 测试分析；
- 缺陷定位。


---

# 5. Prompt版本管理


Prompt属于工程资产。


必须进行版本管理。


版本格式：


```
Major.Minor.Patch
```


例如：

```
order-analysis-prompt

1.0.0
```


---

# 5.1 Patch版本


修复：

- 表达问题；
- 格式问题；
- 小范围优化。


例如：

修改输出格式。


---

# 5.2 Minor版本


增加能力：

例如：

新增一种分析维度。


---

# 5.3 Major版本


重大变化：

例如：

改变任务目标；
改变输出结构。


---

# 6. Prompt文件规范


推荐结构：


```
prompt-name/

├── prompt.md

├── metadata.yaml

├── examples/

└── evaluation.md
```


---

## prompt.md


保存：

实际 Prompt 内容。


---

## metadata.yaml


记录：


```yaml
name: order-analysis

version: 1.0.0

purpose: 分析订单异常

model: xxx

owner: xxx
```


---

## examples/


保存：

- 输入示例；
- 输出示例。


---

## evaluation.md


记录：

- 评估方式；
- 测试结果；
- 已知问题。


---

# 7. Prompt与知识关系


Prompt 不应该包含大量固定知识。


应该通过：


```
Prompt

+

Knowledge Context

+

Tool

```


完成任务。


例如：

业务规则应该存放：

```
product/

standards/

```


而不是硬编码在 Prompt。


---

# 8. Prompt安全规范


Prompt设计需要考虑：


## 数据安全


禁止：

- 泄露敏感信息；
- 暴露内部密钥；
- 输出隐私数据。


---

## 指令安全


需要防止：

- 无效输入影响行为；
- 恶意修改系统规则；
- 绕过权限限制。


---

# 9. AI Coding Agent Prompt规则


AI Agent 使用 Prompt 时必须：


读取：

```
Prompt定义

+

任务上下文

+

项目知识
```


执行：

```
理解任务

↓

加载上下文

↓

执行Prompt

↓

验证输出
```


---

AI 不应该：


## 9.1 随意修改核心Prompt


核心 Prompt 修改需要：

```
Change

↓

Review

↓

Evaluation
```


---

## 9.2 隐藏Prompt变化


Prompt变化必须记录：

- 修改原因；
- 版本变化；
- 效果变化。


---

# 10. Prompt评估规范


Prompt上线前应该验证：


```
[ ] 目标明确

[ ] 输出稳定

[ ] 边界清晰

[ ] 异常输入处理

[ ] 结果符合预期
```


---

# 11. Prompt优化流程


Prompt优化应该遵循：


```
发现问题

↓

分析原因

↓

修改Prompt

↓

测试验证

↓

版本更新
```


---

# 12. 与OpenSpec Change关系


Prompt修改属于 Change。


流程：


```
Requirement

↓

Change

↓

Prompt Design

↓

Implementation

↓

Evaluation

↓

Evidence
```


---

# 13. 总结


Prompt工程规范用于保证：


```
任务定义

+

上下文管理

+

输出控制

+

效果验证
```


形成稳定 AI 能力。


优秀 Prompt 应该：

- 目标明确；
- 上下文完整；
- 输出可控；
- 可持续优化。
