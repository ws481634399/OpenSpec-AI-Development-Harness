# 后端数据库访问规范

> 版本：v0.1  
> 类型：后端工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义后端系统数据库访问层的设计和实现规范。


目标：

- 保证业务代码与数据访问解耦；
- 规范 Repository 设计；
- 保证数据库操作安全可靠；
- 提升系统可维护性；
- 指导 AI Coding Agent 正确实现数据访问逻辑。


---

# 2. 数据访问设计原则


## 2.1 数据访问与业务逻辑分离


数据库访问应该由独立的数据访问层负责。


推荐结构：


```
Application Service

↓

Domain Service

↓

Repository

↓

Database
```


避免：

```
Controller

↓

SQL

↓

Database
```


---

## 2.2 面向领域设计数据访问


Repository 应该围绕领域对象设计。


例如：


```
OrderRepository

UserRepository

PaymentRepository
```


而不是：


```
CommonRepository

DataRepository
```


---

## 2.3 隐藏数据存储细节


业务层不应该依赖具体数据库实现。


例如：


领域层关注：

```
保存订单
```


而不是：

```
执行SQL插入订单表
```


---

# 3. Repository设计规范


## 3.1 Repository职责


Repository负责：


- 查询领域对象；
- 保存领域对象；
- 删除领域对象；
- 数据持久化转换。


Repository不负责：


- 业务规则判断；
- 流程编排；
- 权限校验。


---

## 3.2 Repository接口设计


推荐：


```
Domain Layer

OrderRepository(interface)


Infrastructure Layer

OrderRepositoryImpl
```


结构：

```
domain

└── repository

    └── OrderRepository


infrastructure

└── repository

    └── OrderRepositoryImpl
```


---

## 3.3 Repository方法设计


方法应该表达业务意图。


推荐：

```java
findByOrderId()

save()

remove()
```


避免：

```java
executeSql()

queryData()
```


---

# 4. ORM使用规范


## 4.1 ORM职责


ORM用于：

- 对象映射；
- 数据持久化；
- 基础查询。


不应该：

替代业务逻辑。


---

## 4.2 Entity与数据库模型


数据库对象不应该直接作为领域对象。


推荐：


```
Database Entity

↓

Repository转换

↓

Domain Entity
```


---

## 4.3 避免复杂ORM逻辑


不要：

在 ORM Mapper 中编写大量业务判断。


例如：

不推荐：

```
Mapper

包含订单状态流转逻辑
```


---

# 5. SQL规范


## 5.1 SQL职责明确


SQL负责：

- 数据查询；
- 数据更新；
- 数据聚合。


业务规则应该位于：

```
Domain Layer
```


---

## 5.2 避免复杂SQL隐藏业务


避免：

大量业务判断写入SQL。


例如：

```
CASE WHEN

复杂状态计算
```


应该评估：

是否属于业务逻辑。


---

## 5.3 查询优化


数据库查询应该关注：

- 查询效率；
- 索引使用；
- 数据量。


避免：

- 无条件查询全部数据；
- 不必要关联查询。


---

# 6. 事务管理规范


## 6.1 事务位置


事务应该位于业务操作边界。


通常：

```
Application Service
```


负责事务控制。


---

## 6.2 Repository事务原则


Repository：

负责数据操作。


不应该：

自行控制复杂业务事务。


---

## 6.3 事务范围


事务应该：

- 尽可能短；
- 范围明确；
- 避免长时间锁。


---

# 7. 数据一致性规范


## 7.1 单服务数据一致性


单服务内部：

优先使用数据库事务。


---

## 7.2 跨服务数据一致性


跨服务场景：

优先考虑：

- 领域事件；
- 消息机制；
- 最终一致性。


避免：

强依赖跨服务数据库操作。


---

# 8. 缓存使用规范


## 8.1 缓存定位


缓存用于：

- 提升读取性能；
- 降低数据库压力。


不能作为：

唯一数据来源。


---

## 8.2 缓存一致性


使用缓存需要考虑：


- 更新策略；
- 失效策略；
- 数据一致性。


---

# 9. 数据访问安全规范


## 9.1 参数化查询


禁止：

拼接SQL。


避免：

SQL注入风险。


---

## 9.2 数据权限


数据访问应该考虑：

- 用户权限；
- 数据范围；
- 租户隔离。


---

## 9.3 敏感数据


敏感字段：

需要：

- 脱敏；
- 加密；
- 限制访问。


---

# 10. AI Coding Agent 数据访问修改规则


AI 修改数据库访问代码前必须读取：


```
delivery/

design.md

+

database-access-standard.md

+

database-standard.md

+

implementation/
```


确认：

- 数据模型变化；
- 查询影响；
- 性能影响；
- 数据一致性。


---

AI 不应该：


## 10.1 绕过Repository


禁止：

```
Service

直接调用Mapper
```


---

## 10.2 在Repository写业务逻辑


禁止：

```
Repository

处理订单状态规则
```


---

## 10.3 修改数据库结构但没有Migration


数据库变化必须包含：


```
Migration

+

Test

+

Evidence
```


---

# 11. 数据访问检查清单


提交前检查：


```
[ ] Repository职责明确

[ ] 数据访问与业务分离

[ ] SQL符合规范

[ ] ORM使用合理

[ ] 事务边界明确

[ ] 数据一致性考虑完整

[ ] 性能风险已评估

[ ] 测试已验证
```


---

# 12. 与Change流程关系


数据库访问修改属于 Change。


流程：


```
Requirement

↓

Change

↓

Design

↓

Repository Implementation

↓

Migration

↓

Test

↓

Evidence
```


---

# 13. 总结


后端数据库访问规范用于保证：


```
业务逻辑

+

数据访问

+

数据库实现

```


保持清晰边界。


良好的数据访问设计应该：

- 解耦业务与存储；
- 保证数据一致性；
- 易优化；
- 易维护。
