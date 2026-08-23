# 实现世界（Implementation World）

> 版本：v0.1  
> 类型：Workspace 世界定义  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 OpenSpec Workspace 中 Implementation 世界的职责、内容范围和管理规则。


Implementation 世界用于保存：

```
系统真实实现

+

工程代码资产

+

运行所需资源
```


它描述：

```
系统当前实际上如何运行
```


而不是：

```
系统应该如何设计
```


---

# 2. Implementation 世界定位


OpenSpec Workspace 包含四个核心世界：


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


其中：


```
Product

定义目标


Delivery

管理变化


Implementation

承载真实实现
```


---

# 3. Implementation 核心职责


Implementation 是系统实现的唯一真实来源。


负责保存：


```
Source Code

Configuration

Database

API Definition

Test Code

Deployment Resource
```


包括：


- 后端代码；
- 前端代码；
- 数据库脚本；
- 配置文件；
- 接口定义；
- 测试代码；
- 部署文件。


---

# 4. Implementation 与其他世界关系


## 4.1 与 Product 的关系


关系：

```
Product

定义业务目标

↓

Implementation

实现业务能力
```


例如：


Product：

```
支持订单管理能力
```


Implementation：

```
订单服务代码

订单数据库

订单接口
```


---

## 4.2 与 Delivery 的关系


关系：

```
Delivery

指导一次变化

↓

Implementation

产生实际修改
```


例如：

Delivery：

```
CHG-ORDER-REFUND-001

实现订单退款
```


Implementation：

```
修改订单服务

新增退款接口

增加数据字段
```


---

## 4.3 与 Standards 的关系


关系：

```
Standards

约束实现方式

↓

Implementation

遵循工程规则
```


例如：


Engineering Standard：

```
后端采用分层设计
```


Implementation：

```
controller

application

domain

infrastructure
```


---

# 5. Implementation 内容范围


Implementation 保存实际工程资产。


推荐结构：


```
implementation/

├── repositories.yaml

├── repositories/

│
├── generated/

└── README.md
```


---

# 6. repositories.yaml


用于描述接入的代码仓库。


记录：


```yaml
repositories:

  order-service:

    repository:
      url: xxx

    branch:
      main

    commit:
      xxx
```


包含：

- 仓库地址；
- 分支；
- Commit；
- 仓库标识。


---

# 7. repositories/


存放实际接入的代码仓库。


例如：


```
implementation/

└── repositories/

    ├── order-service/

    ├── product-service/

    ├── frontend-web/
    
    └── ai-service/
```


每个仓库保持原始结构。


---

# 8. 实现资产原则


## 8.1 Implementation 是代码真实来源


任何代码事实：

必须以 Implementation 为准。


例如：

代码中实际存在：

```
OrderService
```


这代表：

当前系统存在该实现。


---

## 8.2 不为了知识整理修改实现结构


禁止：


```
为了方便AI理解

移动代码目录

复制代码副本

创建实现快照
```


Implementation 应保持真实。


---

## 8.3 不复制实现世界


禁止生成：


```
implementation-backup

implementation-copy

baseline-code
```


除非明确需要。


---

# 9. 逆向知识提取规则


当已有项目接入 Harness 时：


流程：


```
Implementation

↓

Reverse Analysis

↓

Knowledge Extraction

↓

Standards/Product/Delivery
```


---

# 9.1 Implementation 不承载逆向结果


逆向产生的知识：

不能写回：

```
implementation/
```


应该写入：


```
standards/

product/

delivery/reports/
```


---

# 9.2 代码行为与业务规则区分


代码观察：

```
当前代码存在订单30分钟自动关闭逻辑
```


只能记录为：

```
Observed Behavior
```


不能直接变成：

```
业务规则
```


除非经过确认。


---

# 9.3 冲突处理


逆向过程中发现：


- 文档与代码不一致；
- 多个实现冲突；
- 无法确认规则；


应该记录：


```
delivery/reports/reverse/<REV-ID>/
```


例如：


```
conflicts.md

unresolved.md
```


---

# 10. AI Agent 使用 Implementation 规则


AI Agent 可以读取 Implementation：


用于：

- 理解代码结构；
- 分析实现行为；
- 定位修改位置；
- 验证开发结果。


---

AI Agent 不应该：


## 10.1 根据代码直接推断业务规则


代码：

```
if(status == PAID)
```


不代表：

```
产品规则就是如此
```


需要结合：

```
Product

+

Delivery
```


---

## 10.2 绕过 Delivery 修改代码


正确流程：


```
Requirement

↓

Change

↓

Design

↓

Task

↓

Implementation修改

↓

Evidence
```


---

# 11. Implementation 与版本追踪


每个实现来源应该可追踪：


包括：


```
Repository

Branch

Commit

Version
```


保证：

任何知识结论都能够定位到具体实现。


---

# 12. Implementation 检查清单


接入实现时检查：


```
[ ] 仓库来源明确

[ ] Commit可追踪

[ ] 原始结构保留

[ ] 配置完整

[ ] 测试存在

[ ] 部署资源明确
```


---

# 13. 与 OpenSpec Harness 关系


OpenSpec Harness 中：


```
Standards

↓

Product

↓

Delivery

↓

Implementation
```


形成完整闭环。


其中：

```
Standards

定义规则


Product

定义目标


Delivery

管理变化


Implementation

提供真实系统
```


---

# 14. 总结


Implementation 世界用于保存：

```
系统现在是什么
```


它不是：

- 文档仓库；
- 知识归档库；
- 设计存储区。


它是：

```
真实实现资产
```


AI 通过读取 Implementation：

理解当前系统；

通过 Delivery：

知道为什么修改；

通过 Standards：

知道如何修改；

通过 Product：

理解修改目的。
