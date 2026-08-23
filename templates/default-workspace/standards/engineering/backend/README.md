# 后端工程规范

> 版本：v0.1  
> 类型：后端工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义后端系统开发过程中的通用工程规范。


目标：

- 建立清晰的后端工程结构；
- 规范服务端代码设计；
- 提升系统可维护性和扩展能力；
- 指导 AI Coding Agent 进行后端开发。


后端工程规范主要关注：

```
服务设计

+

业务实现

+

系统集成

+

工程质量
```


---

# 2. 后端工程规范定位


后端工程规范用于定义：

```
后端服务如何被设计、实现和维护
```


主要覆盖：

- 服务架构设计；
- 分层设计；
- 业务逻辑组织；
- 接口实现；
- 数据访问；
- 框架使用。


---

# 3. 后端规范分类


当前后端工程规范包括：


## 3.1 架构设计规范


文件：

```
architecture-standard.md
```


定义：

- 服务架构；
- 模块边界；
- 分层设计；
- DDD实践。


---

## 3.2 服务设计规范


文件：

```
service-standard.md
```


定义：

- Service职责；
- 业务逻辑组织；
- 领域服务设计；
- 事务边界。


---

## 3.3 API实现规范


文件：

```
api-design-standard.md
```


定义：

- Controller设计；
- DTO设计；
- 参数校验；
- 异常处理。


---

## 3.4 数据访问规范


文件：

```
database-access-standard.md
```


定义：

- Repository设计；
- ORM使用；
- 数据访问隔离；
- 数据一致性处理。


---

## 3.5 框架使用规范


文件：

```
framework-standard.md
```


定义：

- 后端技术框架使用原则；
- 工程配置规范；
- 基础设施集成规范。


---

# 4. 后端开发原则


## 4.1 领域驱动设计


复杂业务系统应优先考虑领域建模。


通过：

```
领域模型

+

业务规则

+

领域边界
```


降低业务复杂度。


---

## 4.2 分层设计


后端系统应该保持职责分离。


推荐结构：


```
Interface Layer

↓

Application Layer

↓

Domain Layer

↓

Infrastructure Layer
```


各层职责明确。


---

## 4.3 业务逻辑集中管理


业务规则应该位于业务层。


避免：

- Controller包含复杂业务；
- 数据访问层包含业务判断；
- 工具类承载核心逻辑。


---

# 5. AI Coding Agent 后端开发规则


AI 修改后端代码时必须读取：


```
delivery/

design.md

+

standards/engineering/backend/

+

implementation/
```


确认：

- 服务影响范围；
- 模块职责；
- 数据影响；
- 接口变化。


---

# 6. 后端变更要求


后端代码修改必须属于 Change。


流程：


```
Requirement

↓

Change

↓

Design

↓

Backend Implementation

↓

Test

↓

Evidence
```


---

# 7. 禁止行为


AI 和开发人员禁止：


## 7.1 跨层调用


例如：

禁止：

```
Controller

直接调用

Repository
```


---

## 7.2 业务逻辑泄露


禁止：

- Controller处理核心业务；
- SQL包含大量业务判断；
- 工具类承载领域规则。


---

## 7.3 随意修改服务边界


微服务之间的职责调整必须经过：

```
Change

+

Design Review
```


---

# 8. 与其他工程规范关系


后端规范与其他规范共同组成工程体系。


关系：


```
Backend

+

Frontend

+

Database

+

Testing

↓

完整工程规范
```


其中：


API规范：

负责前后端协作。


数据库规范：

负责数据设计和变更。


测试规范：

负责质量验证。


---

# 9. 当前目录结构


```
backend/

├── README.md

├── architecture-standard.md

├── service-standard.md

├── api-design-standard.md

├── database-access-standard.md

└── framework-standard.md
```


---

# 10. 总结


后端工程规范用于保证：


```
业务需求

+

系统架构

+

代码实现

+

AI开发行为
```


保持一致。


良好的后端工程应该：

- 边界清晰；
- 职责明确；
- 易扩展；
- 易维护。
