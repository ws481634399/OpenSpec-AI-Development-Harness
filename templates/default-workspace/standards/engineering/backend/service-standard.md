# 后端服务设计规范

> 版本：v0.1  
> 类型：后端工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义后端服务层设计规范。


目标：

- 明确不同服务层职责；
- 保证业务逻辑结构清晰；
- 避免业务代码混乱；
- 提升系统可维护性；
- 指导 AI Coding Agent 正确设计和修改服务代码。


---

# 2. 服务设计原则


## 2.1 服务职责单一


Service 应该承担明确职责。


避免：

- 一个 Service 处理多个无关领域；
- Service 成为万能业务入口；
- 大量业务逻辑堆积。


推荐：

```
OrderService

负责订单业务

PaymentService

负责支付业务
```


---

## 2.2 业务逻辑集中


核心业务规则应该集中在业务层。


避免：


```
Controller

↓

复杂业务判断

↓

Repository
```


推荐：


```
Controller

↓

Application Service

↓

Domain Service

↓

Repository
```


---

## 2.3 服务边界清晰


Service 边界应该与业务能力对应。


例如：


```
订单服务

├── 创建订单

├── 取消订单

└── 查询订单
```


而不是：

```
CommonService

处理所有业务
```


---

# 3. 服务分层规范


后端服务推荐：


```
Interface Layer

↓

Application Layer

↓

Domain Layer

↓

Infrastructure Layer
```


不同层具有不同职责。


---

# 4. Application Service规范


## 4.1 职责


Application Service 负责：

- 业务流程编排；
- 调用领域能力；
- 控制事务边界；
- 协调多个领域对象。


例如：

```
CreateOrderApplicationService
```


负责：


```
创建订单流程

↓

库存检查

↓

订单创建

↓

事件发布
```


---

## 4.2 禁止事项


Application Service 不应该：

- 包含复杂业务规则；
- 直接操作数据库；
- 替代领域模型。


错误示例：


```java
if(order.status == PAID){

    // 大量业务判断

}
```


这些应该进入领域层。


---

# 5. Domain Service规范


## 5.1 职责


Domain Service 用于处理：

- 跨实体业务规则；
- 无明确归属实体的领域逻辑。


例如：


```
OrderPricingService
```


负责：

```
订单价格计算规则
```


---

## 5.2 使用原则


只有满足以下情况才使用 Domain Service：


- 业务规则无法归属于单个实体；
- 涉及多个领域对象；
- 具有明确业务含义。


---

## 5.3 禁止事项


不要创建：

```
OrderHelper

BusinessUtil

CommonDomainService
```


作为业务逻辑垃圾桶。


---

# 6. Service与Repository关系


正确关系：


```
Service

↓

Repository

↓

Database
```


Service 负责：

- 业务流程；
- 业务规则。


Repository负责：

- 数据读取；
- 数据保存。


---

禁止：


```
Controller

↓

Repository
```


绕过业务层。


---

# 7. DTO转换规范


## 7.1 DTO职责


DTO 用于：

- 接口数据传输；
- 层之间数据转换。


例如：

```
OrderCreateRequest

OrderDTO

OrderResponse
```


---

## 7.2 禁止直接暴露领域对象


不要：


```
Controller

直接返回

Domain Entity
```


原因：

- 暴露内部模型；
- 增加耦合。


---

# 8. 事务管理规范


## 8.1 事务边界


事务应该位于业务操作边界。


通常：

Application Service


负责事务控制。


---

## 8.2 事务原则


事务应该：

- 范围明确；
- 时间尽量短；
- 避免包含外部耗时调用。


---

## 8.3 分布式事务


跨服务业务：

优先考虑：

- 领域事件；
- 最终一致性。


避免：

默认引入复杂分布式事务。


---

# 9. 异常处理规范


## 9.1 业务异常


业务规则失败：

应该使用业务异常。


例如：

```
OrderCannotCancelException
```


---

## 9.2 技术异常


基础设施异常：

例如：

- 数据库异常；
- 网络异常。


应该进行统一处理。


---

# 10. Service命名规范


## Application Service


推荐：

```
CreateOrderService

CancelOrderService
```


或者：

```
OrderApplicationService
```


---

## Domain Service


推荐：

```
OrderPricingService

InventoryAllocationService
```


---

## Repository


推荐：

```
OrderRepository

UserRepository
```


---

# 11. AI Coding Agent 服务开发规则


AI 修改 Service 前必须读取：


```
delivery/

design.md

+

architecture-standard.md

+

service-standard.md

+

implementation/
```


确认：

- 服务职责；
- 所属层级；
- 业务边界；
- 影响范围。


---

AI 不应该：


## 11.1 在Controller写业务逻辑


禁止：

```
Controller

包含核心业务判断
```


---

## 11.2 创建万能Service


禁止：

```
CommonService

BaseBusinessService
```


承载所有业务。


---

## 11.3 跳过领域设计


复杂业务修改前：

应该分析：

- Entity；
- Value Object；
- Domain Service。


---

# 12. Service设计检查清单


设计评审时检查：


```
[ ] Service职责明确

[ ] 分层关系正确

[ ] 业务逻辑位置合理

[ ] DTO转换清晰

[ ] 事务边界明确

[ ] 异常处理完整

[ ] 测试方案明确
```


---

# 13. 与Change流程关系


Service修改必须属于 Change。


流程：


```
Requirement

↓

Change

↓

Design

↓

Service Implementation

↓

Test

↓

Evidence
```


---

# 14. 总结


服务设计规范用于保证：


```
接口层

+

应用层

+

领域层

+

基础设施层
```


职责清晰。


良好的 Service 设计应该：

- 业务明确；
- 边界清晰；
- 逻辑集中；
- 易测试；
- 易扩展。
