# 规则知识（Standards Knowledge）

> 版本：v0.1  
> 类型：Workspace 世界定义  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 OpenSpec Workspace 中 Standards 世界的职责、内容范围和管理规则。


Standards 世界用于保存：

```
项目开发规范

+

工程约束

+

SDD流程规则

+

项目专属规则
```


它描述：

```
系统应该遵守什么
```


而不是：

```
系统现在如何实现
```


---

# 2. Standards 世界定位


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


其中：

```
Standards
定义应该遵守什么

Product
定义为什么做、做什么

Delivery
定义一次变化如何完成

Implementation
保存真实系统实现
```


Standards 位于知识层顶端，约束其他三个世界的行为。


---

# 3. Standards 核心职责


Standards 负责定义项目开发过程中应遵循的所有规则。


包括：

```
SDD 工作流规则

+

通用工程规范

+

项目专属规范

+

AI 行为约束
```


这些规则用于约束：

```
Product
如何描述需求

Delivery
如何管理变化

Implementation
如何编写代码

AI Agent
如何执行开发
```


---

# 4. Standards 与其他世界关系


## 4.1 Standards 与 Product


关系：

```
Standards
约束
Product 知识形态
```


例如：

Standards：

```
产品规格应包含验收标准
产品规则需经过批准流程
```

Product：

```
按规则组织需求文档
按流程提交规格评审
```


---

## 4.2 Standards 与 Delivery


关系：

```
Standards
约束
Delivery 流程
```


例如：

Standards：

```
Change 生命周期
Review 流程
Evidence 要求
```

Delivery：

```
按 Change 生命周期推进
按 Review 流程评审
按 Evidence 要求验证
```


---

## 4.3 Standards 与 Implementation


关系：

```
Standards
约束
Implementation 实现方式
```


例如：

Standards：

```
后端采用分层架构
API 响应统一结构
数据库变更需 Migration
```

Implementation：

```
controller / application / domain / infrastructure
{code, message, data}
migration 脚本
```


---

# 5. Standards 内容范围


Standards 世界主要包含：

```
SDD 通用规则

工程规范（前端 / 后端 / AI / 数据库 / 测试）

项目专属规则
```


不包括：

```
具体业务规则（属于 Product/specs）

具体技术设计方案（属于 Delivery/design.md）

具体代码实现（属于 Implementation）
```


---

# 6. 推荐目录结构


默认结构：

```
standards/

├── README.md

├── sdd/

├── engineering/

└── project/
```


---

# 7. 内容说明


## 7.1 sdd/


存放 OpenSpec SDD 工作流通用规则。


这些规则适用于所有由 OpenSpec 管理的项目，不区分技术栈。


包含：

```
sdd/

├── README.md

├── change-lifecycle.md

├── knowledge-management.md

└── skill-execution.md
```


|文件|说明|
|-|-|
|change-lifecycle.md|Change 定义、目录结构、生命周期状态、流转规则、完成标准|
|knowledge-management.md|知识生命周期、知识来源、批准规则、冲突处理|
|skill-execution.md|Skill 结构、执行规则、AI 行为约束、输出校验|


sdd/ 规则由 OpenSpec Harness 维护，项目不应修改。


---

## 7.2 engineering/


存放通用工程规范。


按技术领域组织：

```
engineering/

├── README.md

├── coding-standard.md

├── api-standard.md

├── database-standard.md

├── testing-standard.md

├── frontend/

├── backend/

└── ai/
```


|文件/目录|说明|
|-|-|
|coding-standard.md|通用代码质量、命名、可维护性约束|
|api-standard.md|API 设计原则、接口一致性、请求响应规范|
|database-standard.md|数据模型、SQL 规范、迁移、安全要求|
|testing-standard.md|测试类型、要求、验证流程、证据管理|
|frontend/|前端代码组织、组件设计、状态管理、路由、性能|
|backend/|后端架构、DDD 设计、服务分层、接口实现、数据访问、框架|
|ai/|Prompt 工程、Agent 设计、Tool 调用、知识管理、能力评估|


---

## 7.3 project/


存放当前项目专属规则。


初始化：

空目录。


来源：

```
人工维护

+

Knowledge Reverse（知识反向工程）

+

Converge 阶段沉淀
```


内容包括：

- 本项目特有的技术约束；
- 本项目特有的命名约定；
- 本项目特有的架构决策；
- 本项目特有的业务规则约束。


例如：

```
project/

├── naming-convention.md

├── architecture-decision.md

└── business-constraints.md
```


project/ 规则属于项目资产，可由项目维护。


---

# 8. Standards 文档原则


## 8.1 面向规则


Standards 文档应描述：

```
应该怎么做

+

不应该怎么做

+

约束依据
```


避免：

```
只描述现象不解释规则
```


---

## 8.2 保持稳定


Standards 中的内容：

应该描述长期规则。


避免：

```
记录临时开发过程

记录一次性决策
```


---

## 8.3 可追踪


重要标准应该包含：

```
来源

版本

状态

适用范围
```


---

## 8.4 通用优先


Standards 应优先描述：

```
跨项目通用规则
```


项目特有规则应放入：

```
standards/project/
```


---

# 9. Standards 知识生命周期


Standards 内容应该经过生命周期管理。


流程：

```
Draft

↓

Review

↓

Approved

↓

Active

↓

Deprecated
```


只有 Approved 状态的规则才能作为开发依据。


---

# 10. AI 使用 Standards 规则


AI Agent 使用 Standards 时：


应该用于：

- 理解项目约束；
- 选择合规方案；
- 校验实现结果；
- 生成符合规范的设计。


---

AI 不应该：


## 10.1 跳过 Standards 直接修改代码


禁止：

```
需求

↓

直接修改 Implementation
```


应该：

```
需求

↓

读取 Standards

↓

设计

↓

修改 Implementation
```


---

## 10.2 修改已批准的 Standards


Approved Standards 内容：

不得被 AI 自动覆盖。


修改应通过：

```
Proposal（提案）

↓

Review（评审）

↓

Approval（批准）

↓

Version Update（版本更新）
```


---

## 10.3 将实现细节当作规则


例如：

代码：

```
当前使用 Redis 缓存
```


不能直接认为：

```
架构规则就是必须使用 Redis
```


需要区分：

```
Observed Behavior（观察行为）

+

Approved Standard（已批准规则）
```


---

# 11. Standards 与 SDD 流程关系


Standards 在 SDD 流程中被加载：


```
explore 阶段

读取 standards/ + product/（feature-tree.yaml / specs / glossary）

↓

prd 阶段

读取 product/（feature-tree.yaml / specs）+ standards/

↓

design 阶段

读取 standards/ + product/（feature-tree.yaml / specs）+ implementation/

↓

task 阶段

读取 standards/ + delivery/

↓

dev 阶段

读取 standards/ + implementation/

↓

test 阶段

读取 standards/ + implementation/

↓

converge 阶段

读取 product/（feature-tree.yaml / specs / glossary）+ standards/
```


完整规则见 [.sdd/context-rules.yaml](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/.sdd/context-rules.yaml)。

注意：`product/features/` 为 feature-tree 的派生缓存（仅 IDE 导航用），任何阶段都不读取。


---

# 12. Standards 检查清单


新增 Standards 内容时检查：

```
[ ] 是否描述规则而非现象

[ ] 是否有明确约束范围

[ ] 是否有版本与状态

[ ] 是否避免技术实现细节

[ ] 是否区分通用与项目专属

[ ] 是否经过批准流程
```


---

# 13. 与 .sdd 的关系


关系：

```
.sdd/
控制 Workspace 配置

standards/
定义开发应遵守规则
```


区别：

|目录|职责|
|-|-|
|.sdd|SDD 控制配置（workspace / repositories / context-rules / version）|
|standards|开发规则（SDD 规则 / 工程规范 / 项目规则）|


.sdd 不存放规则，standards 不存放配置。


---

# 14. 总结


Standards 世界用于保存：

```
应该遵守什么
```


它约束：

```
Product
↓
Delivery
↓
Implementation
```


通过 Standards 知识：

AI 能够：

- 理解项目约束；
- 选择合规方案；
- 避免违规修改；
- 产出符合规范的结果。


Standards 与其他三个世界共同构成 OpenSpec 四世界模型，形成完整的知识驱动开发体系。
