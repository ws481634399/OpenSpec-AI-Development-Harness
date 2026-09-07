# Change Lifecycle Standard

> Version: v0.1
> Type: SDD Standard
> Scope: OpenSpec Workspace


## 1. 文档目的

本文档定义 OpenSpec AI Development Harness 中 Change 的生命周期管理规则。

Change 表示从需求到实现再到知识更新的受控软件演进过程。

其目标是确保：

- 每个需求都具备可追溯性；
- 每次实现都具备上下文；
- 每次变更都产生证据；
- 项目知识能够持续演进。


## 2. Change 定义


### 2.1 什么是 Change

Change 是 OpenSpec 管理的软件演进最小独立单元。

一个 Change 连接：

```

需求

↓

产品影响

↓

技术设计

↓

实现

↓

验证

↓

知识更新

```


### 2.2 Change 范围

一个 Change 可以包含：

- 多个 Feature；
- 多个代码仓库；
- 多个服务；
- 多个文件。

默认规则：

```

一个需求

↓

一个 Change

```


## 3. Change 目录结构

每个 Change 应拥有独立目录：

```

delivery/

└── changes/

└── CHG-XXXX/

    ├── metadata.yaml

    ├── requirement.md

    ├── exploration.md

    ├── spec.md

    ├── design.md

    ├── tasks.md

    ├── implementation.md

    ├── evidence/

    │   └── test-report.md

    └── convergence.md

```


## 4. Change 生命周期

```

Created（已创建）

↓

Exploring（探索中）

↓

Specified（已规格化）

↓

Designed（已设计）

↓

Tasked（已拆任务）

↓

Developing（开发中）

↓

Testing（测试中）

↓

Completed（已完成）

↓

Archived（已归档）

```


## 5. Change 状态规则


### Created（已创建）

需求已被登记。

输入：

```

用户需求

```

产出：

```

requirement.md

```

规则：

- 不做技术决策；
- 不修改代码。


### Exploring（探索中）

目的：

理解需求并识别影响。

活动：

- 分析业务意图；
- 匹配 Feature Tree；
- 识别受影响的仓库。


产出：

```

exploration.md

```


AI 禁止：

- 编写实现代码；
- 做最终架构决策。


### Specified（已规格化）

目的：

将需求转化为产品规格。

产出：

```

spec.md

```

PRD 应包含：

- 背景；
- 用户价值；
- 范围；
- 业务规则；
- 验收标准。


### Designed（已设计）

目的：

制定技术方案。

产出：

```

design.md

```

设计必须包含：

- 当前状态；
- 提议方案；
- 仓库影响；
- 数据变更；
- 风险；
- 待澄清问题。


### Tasked（已拆任务）

目的：

将设计拆解为可执行任务。

产出：

```

tasks.md

```

每个任务应定义：

- 目标仓库；
- 目标模块；
- 预期变更；
- 验证方法。


### Developing（开发中）

目的：

实现已批准的设计。

规则：

实现遵循：

```

Design

*

Task

```

允许修改：

```

implementation/

```

禁止修改：

```

approved standards

approved specifications

```

产出：

```

implementation.md

```


### Testing（测试中）

目的：

验证实现。


必做：

- 功能验证；
- 回归验证；
- 需求核对。


产出：

```

evidence/test-report.md

```


### Completed（已完成）

仅当满足以下条件时，Change 才可完成：

- 代码变更已完成；
- 测试已完成；
- 证据已收集；
- 知识更新已评估。


产出：

```

convergence.md

```


### Archived（已归档）

完成后：

```

delivery/archive/

```

历史记录必须保持可查。


## 6. Change 规则


### Rule 1: 无 Change，不实现

任何有意义的修改必须归属于某个 Change。


禁止：

```

无 Change 直接修改代码

```


### Rule 2: Change 必须有证据

每个 Change 应提供：

- 需求证据；
- 设计证据；
- 实现证据；
- 测试证据。


### Rule 3: Change 范围必须可控

一个 Change 不应包含无关的修改。


## 7. Feature 关系


一个 Change 可以影响多个 Feature。


示例：

```

CHG-ORDER-001

Features:

* Order Management
* Inventory Management

```


关系：

```

Change

|

+---- Feature A

|

+---- Feature B

```


## 8. Repository 关系


一个 Change 可以修改多个仓库。


示例：

```

CHG-PAYMENT-001

Repositories:

* backend-service
* frontend
* payment-adapter

```


## 9. AI Agent 规则


AI 必须：

- 理解当前 Change 状态；
- 加载所需上下文；
- 遵循工作流；
- 产出预期制品；
- 提供证据。


AI 禁止：

- 跳过工作流阶段；
- 直接修改已批准的知识；
- 创建无依据的假设；
- 隐藏不确定性。


## 10. Change 元数据


每个 Change 应包含：

```

metadata.yaml

````


示例：

```yaml
id: CHG-ORDER-001

title: Add order cancel reason

status: exploring

requirement: REQ-001

created-at: 2026-08-23T10:00:00Z

updated-at: 2026-08-23T12:00:00Z

features:
  - FEAT-ORDER-CANCEL

repositories:
  - order-service

related-change: ""
````

## 11. 冲突处理

出现冲突时：

不要覆盖已有知识。

创建：

```
delivery/reports/conflicts/
```

## 12. 知识收敛

Change 完成后评估对以下内容的更新。

产出：

```

convergence.md

```

convergence.md 记录：本次 Change 的知识变化总结、是否需更新以下内容的判断、知识沉淀过程。
真正的知识更新发生在 Workspace Knowledge 中（写回 standards/product/），convergence.md 只记录"该不该更新、更新了什么、为什么"。

### Standards

新的工程规则。

### Product

新的 Feature 规格。

### Glossary

新的业务术语。

## 13. 完成检查清单

```
[ ] 需求已确认

[ ] Feature 影响已识别

[ ] PRD 已完成

[ ] Design 已完成

[ ] Tasks 已完成

[ ] 代码已实现

[ ] 测试已通过

[ ] 证据已收集

[ ] 知识更新已评估
```

## 14. 总结

Change 是 OpenSpec SDD 的核心控制单元。

它连接：

```
需求

+

产品知识

+

技术设计

+

实现

+

证据

+

知识演进
```
