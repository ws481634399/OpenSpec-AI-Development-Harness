# AI Agent设计规范

> 版本：v0.1  
> 类型：AI工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 AI Agent 的设计、实现和运行规范。


目标：

- 明确 Agent 职责边界；
- 规范 Agent 工作流程；
- 保证 Agent 行为可控；
- 提升 AI 系统稳定性和可维护性；
- 指导 AI Coding Agent 正确设计和使用 Agent。


AI Agent 不只是模型调用，而是：

```
模型能力

+

任务流程

+

工具能力

+

知识上下文

+

结果验证
```


形成的完整智能执行单元。


---

# 2. Agent设计原则


## 2.1 职责单一


一个 Agent 应该负责明确目标。


推荐：

```
需求分析Agent

负责：

分析需求

```


```
代码审查Agent

负责：

代码质量检查
```


避免：

```
万能Agent

负责所有任务
```


---

## 2.2 边界明确


Agent 应明确：

- 可以执行什么；
- 不能执行什么；
- 可以访问什么；
- 输出什么结果。


避免：

Agent 无限制执行操作。


---

## 2.3 工作流驱动


复杂任务应该通过 Workflow 组织。


推荐：


```
Input

↓

Planning

↓

Execution

↓

Validation

↓

Output
```


而不是：

```
Prompt

↓

直接生成结果
```


---

# 3. Agent组成规范


一个完整 Agent 包括：


```
Agent

├── Instruction

├── Model

├── Memory

├── Tools

├── Knowledge

├── Workflow

└── Evaluation
```


---

# 3.1 Instruction


定义 Agent 行为规则。


包括：

- 角色；
- 任务目标；
- 约束；
- 输出要求。


---

# 3.2 Model


定义使用的模型能力。


需要明确：

- 模型类型；
- 使用场景；
- 成本考虑。


模型不应该成为业务逻辑载体。


---

# 3.3 Memory


用于保存 Agent 上下文。


包括：


## 临时记忆


当前任务上下文。


例如：

```
当前对话内容
```


---

## 长期知识


项目长期知识。


例如：

```
standards/

product/

delivery/
```


---

Memory 不应该替代项目知识管理。


---

# 3.4 Tools


Agent 可以调用外部能力。


例如：

- 文件读取；
- 代码搜索；
- 数据查询；
- API调用。


Tool 必须：

- 有明确输入；
- 有明确输出；
- 有权限控制。


---

# 3.5 Knowledge


Agent 使用项目知识。


来源包括：


```
standards/

product/

delivery/

implementation/
```


Agent 应优先使用已有知识，而不是自行推断。


---

# 3.6 Workflow


Workflow 定义 Agent 执行流程。


例如：

```
需求分析Agent


读取需求

↓

分析影响

↓

生成Change

↓

输出结果
```


---

# 3.7 Evaluation


Agent 输出需要验证。


包括：

- 正确性；
- 完整性；
- 稳定性。


---

# 4. Agent与Skill关系


OpenSpec 中：


```
Agent

负责：

执行能力


Skill

负责：

具体工作方法
```


关系：


```
Agent

↓

调用Skill

↓

执行Workflow

↓

产生Artifact
```


---

例如：


开发Agent：

调用：

```
sdd-design Skill

sdd-development Skill

sdd-test Skill
```


完成开发流程。


---

# 5. Agent类型规范


## 5.1 分析Agent


职责：

- 理解信息；
- 发现问题；
- 生成分析结果。


例如：

```
Requirement Analyst Agent
```


---

## 5.2 设计Agent


职责：

- 生成技术方案；
- 分析架构影响。


例如：

```
Architecture Agent
```


---

## 5.3 开发Agent


职责：

- 修改代码；
- 实现任务。


例如：

```
Coding Agent
```


---

## 5.4 验证Agent


职责：

- 执行测试；
- 检查质量。


例如：

```
Review Agent
```


---

# 6. Agent权限规范


Agent 权限应该遵循：

```
最小权限原则
```


---

## 6.1 读取权限


Agent 可以读取：

根据任务需要开放。


例如：

设计Agent：

```
product/

standards/

implementation/
```


---

## 6.2 修改权限


修改权限应该限制。


例如：


开发Agent：

允许：

```
implementation/
```


不允许：

```
approved standards/
```


---

## 6.3 工具权限


Tool调用需要限制：

- 可调用工具；
- 参数范围；
- 执行环境。


---

# 7. Agent状态管理


Agent执行过程应该记录状态。


推荐：


```
Created

↓

Running

↓

Waiting

↓

Completed

↓

Failed
```


---

状态信息包括：

- 当前任务；
- 当前阶段；
- 执行结果；
- 错误信息。


---

# 8. Agent异常处理


Agent执行失败时：

应该记录：


- 失败原因；
- 已完成步骤；
- 未完成任务；
- 建议处理方式。


禁止：

隐藏失败。


---

# 9. AI Coding Agent规则


AI Coding Agent 执行开发任务时必须：


读取：

```
standards/sdd/

+

standards/engineering/

+

project knowledge
```


执行：

```
理解任务

↓

加载上下文

↓

执行Skill

↓

修改实现

↓

验证结果

↓

沉淀知识
```


---

AI Coding Agent 不应该：


## 9.1 跳过规范流程


禁止：

直接从需求生成代码。


---

## 9.2 修改受保护知识


禁止：

直接修改：

```
approved standards

approved specs
```


---

## 9.3 无验证输出


禁止：

未测试情况下声明完成。


---

# 10. Agent版本管理


Agent属于工程资产。


需要版本管理。


版本格式：

```
Major.Minor.Patch
```


例如：

```
coding-agent

1.0.0
```


---

版本变化：


## Patch

修复问题。


## Minor

增加能力。


## Major

改变行为或接口。


---

# 11. Agent评估要求


Agent上线前需要验证：


```
[ ] 任务目标明确

[ ] Workflow完整

[ ] Tool调用正确

[ ] 输出稳定

[ ] 异常处理完整

[ ] 权限符合要求
```


---

# 12. Agent优化流程


Agent优化应该遵循：


```
发现问题

↓

分析原因

↓

修改Agent设计

↓

测试验证

↓

版本更新
```


---

# 13. 与OpenSpec Harness关系


OpenSpec Harness 中：


```
Harness

↓

Agent

↓

Skill

↓

Knowledge

↓

Artifact
```


形成 AI 驱动开发体系。


Agent负责：

```
执行
```


Skill负责：

```
方法
```


Knowledge负责：

```
上下文
```


Artifact负责：

```
结果沉淀
```


---

# 14. 总结


AI Agent设计规范用于保证：


```
模型

+

流程

+

工具

+

知识

+

验证
```


形成可靠的软件开发智能体。


优秀 Agent 应该：

- 职责明确；
- 权限受控；
- 行为可追踪；
- 结果可验证。
