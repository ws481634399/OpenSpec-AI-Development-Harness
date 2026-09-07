# 交付知识（Delivery Knowledge）

> 版本：v0.1  
> 类型：Workspace 世界定义  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 OpenSpec Workspace 中 Delivery 世界的职责、内容范围和管理规则。


Delivery 世界用于记录：

```
需求如何被实现

+

变更如何被管理

+

开发如何被验证
```


它描述：

```
系统如何从需求走向交付
```


---

# 2. Delivery 世界定位


OpenSpec Workspace 四个核心世界：


```
Standards

规则世界


Product

产品世界


Delivery

交付世界


Implementation

实现世界
```


Delivery 位于：

```
Product

↓

Delivery

↓

Implementation
```


之间。


---

# 3. Delivery 核心职责


Delivery 负责管理软件交付过程中的中间产物。


包括：


```
Change

Design

Task

Test Evidence

Release
```


这些内容用于连接：

```
业务需求

↓

技术设计

↓

代码实现

↓

质量验证
```


---

# 4. Delivery 与其他世界关系


## 4.1 Delivery 与 Product


关系：

```
Product

产生需求

↓

Delivery

管理实现过程
```


例如：


Product：

```
支持订单退款能力
```


Delivery：

```
创建Change

设计方案

拆分任务

验证结果
```


---

## 4.2 Delivery 与 Standards


关系：

```
Standards

约束

Delivery流程
```


例如：

SDD规范定义：

```
Change生命周期

Review流程

Evidence要求
```


Delivery按照这些规则执行。


---

## 4.3 Delivery 与 Implementation


关系：


```
Delivery

指导

Implementation
```


例如：


Delivery：

```
实现订单退款功能
```


Implementation：

```
修改订单服务代码
```


---

# 5. Delivery 内容范围


Delivery 世界主要包含：


```
变更记录

技术设计

任务拆分

验证证据

发布记录
```


---

# 6. 推荐目录结构


默认结构：


```
delivery/

├── README.md

├── changes/

├── archive/

└── reports/
```


---

# 7. 内容说明


## 7.1 changes/


存放当前进行中的 Change。


每个 Change 拥有独立目录，所有相关内容聚合在该目录下：


```
delivery/

└── changes/

    └── CHG-XXXX/

        ├── request.md

        ├── spec.md

        ├── design.md

        ├── tasks.md

        ├── metadata.yaml

        └── evidence/

            └── test-report.md
```


Change 描述：

- 为什么修改；
- 修改目标；
- 影响范围；
- 验收标准。


Change 目录中包含：


|文件/目录|说明|
|-|-|
|request.md|变更请求（需求来源、修改目标、影响范围）|
|spec.md|产品规格（背景、用户价值、范围、业务规则、验收标准）|
|design.md|技术设计（方案、架构影响、数据变化、接口变化、风险）|
|tasks.md|任务拆分（目标仓库、模块、预期变更、验证方式）|
|metadata.yaml|Change 元数据（id、title、status、features、repositories）|
|evidence/|验证证据（test-report.md、api-test-report.md、review-result.md 等）|


---

## 7.2 archive/


存放历史完成的 Change。


例如：

```
archive/

└── CHG-001/
```


已完成并归档的 Change：

- 不应该删除；
- 应保留完整内容；
- 支持历史追溯。


---

## 7.3 reports/


存放分析报告。


结构：

```
reports/

├── reverse/

├── conflicts/

└── unresolved/
```


包含：


|子目录|说明|
|-|-|
|reverse/|知识反向工程报告（从代码/SQL/API 推导出的规则）|
|conflicts/|知识冲突记录（不同来源规则冲突）|
|unresolved/|未解决问题记录（暂时无法确认的问题）|


---

# 8. Change生命周期


Change 是 Delivery 的核心对象。


生命周期：


```
Proposed

↓

Approved

↓

Designed

↓

Implementing

↓

Validated

↓

Completed
```


---

# 9. Delivery 文档原则


## 9.1 面向交付


Delivery 不描述长期规则。


它描述：

```
一次具体变化如何完成
```


---

## 9.2 保持可追踪


每个交付对象应该关联：


```
Product Feature

↓

Change

↓

Design

↓

Task

↓

Evidence
```


形成完整链路。


---

## 9.3 保留历史


已完成交付内容：

不应该删除。


应该：

- 保留；
- 标记状态；
- 支持追溯。


---

# 10. AI 使用 Delivery 知识规则


AI Agent 使用 Delivery 时：


应该用于：

- 理解当前任务；
- 获取设计上下文；
- 判断修改范围；
- 生成实现方案。


---

AI 不应该：


## 10.1 绕过Change直接修改代码


禁止：


```
Requirement

↓

直接修改Implementation
```


应该：


```
Requirement

↓

Change

↓

Design

↓

Implementation
```


---

## 10.2 修改历史交付记录


已完成：

```
Completed Change

Release Evidence
```


不应该被自动覆盖。


---

## 10.3 将实现细节当作设计事实


例如：


代码：

```
当前使用Redis缓存
```


不能直接认为：

```
架构设计必须使用Redis
```


需要依据 Design。


---

# 11. Delivery 与 AI Coding Agent


AI Coding Agent 执行任务流程：


```
读取Change

↓

读取Design

↓

执行Task

↓

修改Implementation

↓

生成Evidence

↓

更新状态
```


---

# 12. Delivery 检查清单


新增交付内容时检查：


```
[ ] 是否有明确Change

[ ] 是否有设计说明

[ ] 是否拆分任务

[ ] 是否有验证证据

[ ] 是否关联产品目标

[ ] 是否符合Standards
```


---

# 13. Delivery 与 SDD关系


Delivery 是 SDD 生命周期的实际承载区域。


关系：


```
Specification

↓

Change

↓

Design

↓

Task

↓

Implementation

↓

Evidence
```


---

# 14. 总结


Delivery 世界用于保存：

```
如何做

+

如何验证
```


它连接：

```
Product

↓

Implementation
```


通过 Delivery 知识：

AI 能够理解：

- 当前正在做什么；
- 为什么这样设计；
- 修改影响是什么；
- 如何证明完成。
