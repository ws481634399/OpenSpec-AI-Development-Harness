# Knowledge Management Standard

> Version: v0.1  
> Type: SDD Standard  
> Scope: OpenSpec Workspace


## 1. 文档目的

本文档定义 OpenSpec AI Development Harness 中项目知识的创建、管理、更新与治理方式。

知识管理的目的在于确保：

- AI Agent 能够理解项目上下文；
- 项目知识能够持续演进；
- 历史决策保持可追溯；
- 生成的知识不污染已批准的知识。


---

# 2. 知识模型


OpenSpec 通过四个世界管理项目知识：


```
Standards World

Product World

Delivery World

Implementation World
```


每个世界承担不同职责。


## Standards World

位置：

```
standards/
```


定义：

- 工程规则；
- 架构规则；
- 项目约束。


---

## Product World

位置：

```
product/
```


定义：

- 产品能力；
- 特性（Feature）；
- 业务规格；
- 领域术语。


---

## Delivery World

位置：

```
delivery/
```


定义：

- 需求；
- 变更（Change）；
- 设计记录；
- 证据（Evidence）。


---

## Implementation World

位置：

```
implementation/
```


包含：

- 源代码；
- 配置；
- SQL；
- 部署资源。


Implementation 是执行结果，而非首要知识来源。


---

# 3. 知识来源


项目知识可来自三种来源。


## 3.1 人工决策（Human Decision）


由开发者、架构师或产品负责人创建的知识。


示例：

- 架构决策；
- 业务规则；
- 工程标准。


人工创建的知识可信度最高。


---

## 3.2 知识反向工程（Knowledge Reverse）


从既有实现中挖掘的知识。


来源：


```
Code

SQL

API

Configuration

Tests

Documentation
```


反向生成的知识不得直接成为已批准知识。


---

## 3.3 Change 收敛（Change Convergence）


Change 完成后生成的知识。


示例：


一个完成的 Change 引入：


```
新业务规则

↓

product/specs/
```


或：


```
新工程规则

↓

standards/project/
```


---

# 4. 知识生命周期


所有知识项应具备生命周期。


```
Discovered（已发现）

↓

Draft（草稿）

↓

Pending（待确认）

↓

Approved（已批准）

↓

Deprecated（已废弃）
```


---

# 5. 知识状态


## 5.1 Discovered（已发现）


定义：

在分析或反向工程中发现的信息。


示例：

- 既有代码行为；
- 既有 API 行为；
- 数据库约束。


特征：

- 未经验证；
- 不可作为最终规则。


---

## 5.2 Draft（草稿）


定义：

初始的结构化知识文档。


示例：


```
standards/project/order-rule.md
```


状态示例：


```yaml
status: reconstructed_draft
```


---

## 5.3 Pending（待确认）


定义：

等待人工确认的知识。


示例：

- 某观察到的行为是否为业务规则；
- 某架构模式是否应成为标准。


---

## 5.4 Approved（已批准）


定义：

已确认的项目知识。


已批准知识可被 AI 作为可靠上下文使用。


示例：

```
standards/project/

product/specs/
```


---

## 5.5 Deprecated（已废弃）


定义：

不再有效但需历史保留的知识。


已废弃知识不应被删除。


---

# 6. 知识更新规则


## Rule 1: 不可自动覆盖已批准知识


AI 不得直接修改：


```
Approved Standards

Approved Specifications
```


变更需通过：


```
Change

↓

Review

↓

Approval

↓

Update
```


---

## Rule 2: 反向知识需经确认


从既有项目生成的知识必须保持标记：


```
reconstructed_draft
```


直至评审完成。


---

## Rule 3: 实现不自动成为知识


代码行为不一定代表业务规则。


示例：


代码：


```
if(status == 3){
    cancelOrder();
}
```


不能直接成为：


```
Order can always be cancelled when status is 3.
```


这需要业务确认。


---

# 7. 知识冲突处理


发现冲突知识时：


不要覆盖。


创建冲突记录：


```
delivery/reports/conflicts/
```


示例：


```
conflict-001.md
```


冲突记录应包含：


- 冲突信息；
- 来源；
- 影响；
- 所需决策。


---

# 8. AI 知识加载规则


AI 应根据工作流阶段加载知识。


## Explore


加载：


```
standards/

product/
```


目的：

理解业务上下文。


---

## PRD


加载：


```
product/

delivery/
```


目的：

创建产品规格。


---

## Design


加载：


```
standards/

product/

implementation/
```


目的：

创建技术方案。


---

## Development


加载：


```
delivery/

implementation/
```


目的：

实现已批准的设计。


---

## Converge


加载：


```
delivery/

implementation/

evidence/
```


目的：

更新项目知识。


---

# 9. 知识证据


重要知识应保留证据。


证据可包含：


- 仓库 ID；
- 提交 ID（Commit ID）；
- 文件路径；
- 代码符号；
- 文档来源。


示例：


```yaml
source:

  repository: order-service

  file: src/order/OrderService.java

  symbol: cancelOrder()
```


---

# 10. 知识目录规则


## Standards


长期项目规则。


位置：


```
standards/
```


示例：


- 架构约束；
- 工程规则。


---

## Product


业务能力知识。


位置：


```
product/
```


示例：


- Feature 定义；
- 业务规格。


---

## Delivery


临时与历史记录。


位置：


```
delivery/
```


示例：


- Change 记录；
- 反向报告。


---

# 11. 知识治理


OpenSpec 遵循：


```
Discover（发现）

↓

Structure（结构化）

↓

Review（评审）

↓

Approve（批准）

↓

Reuse（复用）
```


AI 可在每个环节协助，但不能替代批准决策。


---

# 12. 总结


Knowledge Management Standard 确保：


```
Existing System（既有系统）

↓

Knowledge Discovery（知识发现）

↓

Structured Knowledge（结构化知识）

↓

Human Validation（人工验证）

↓

AI Reuse（AI 复用）
```


OpenSpec 将知识视为一等软件工程资产。
