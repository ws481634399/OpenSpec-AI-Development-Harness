请基于当前 OpenSpec Multi-Repository Delivery 设计，对 Delivery Unit Model 做一次增量增强。

本次只调整：

# Delivery Unit 的 Dev 前置实现指导能力

不要改动其他已确定架构，不要重新设计 Git Submodule、Feature Tree、Change Path、Evidence、Workflow 等内容。

目标：

让 Delivery Unit 不只是 Repository-specific Task，还能够在 Task 阶段为后续 Dev 提供足够清晰的：

- Implementation Sketch
- Pseudocode
- Suggested Flow
- Expected Components

从而增强：

```text
sdd-task
    ↓
Delivery Unit
    ↓
sdd-dev
```

# 一、Delivery Unit 定位调整

当前 Delivery Unit 定义：

> Delivery Unit 是一个 Workspace Change 在某个具体 Repository 中的实现交付单元。

在此基础上增强为：

> Delivery Unit 是 Repository-specific executable delivery specification。

Delivery Unit 应描述：

- Goal
- Repository
- Scope
- Design References
- Dependencies
- Acceptance Criteria
- Implementation Guidance
- Verification Guidance

其中：

```
Implementation Guidance
```

用于指导 Dev 阶段如何实现，但不替代真实代码和最终实现结果。

------

# 二、明确 Design / Task / Dev 的职责边界

必须保持：

```
Design
= System-level Technical Design
```

Design 负责：

- Repository Impact
- Architecture
- API Contract
- Event Contract
- Data Contract
- Cross-Repository Dependency
- Integration Boundary

Design 不负责：

- 仓库级详细开发步骤
- Delivery Unit ID
- 具体实现伪代码

------

Task 阶段负责：

```
Design
    ↓
Repository Delivery Decomposition
    ↓
Delivery Unit
```

Task / Delivery Unit 可以将系统设计进一步细化成：

- 仓库级实现目标
- 模块级 Scope
- 实现顺序
- Implementation Sketch
- Pseudocode

------

Dev 阶段负责：

```
Delivery Unit Specification
    ↓
Real Implementation
```

Dev 才真正产生：

- Source Code
- Config
- SQL
- Migration
- Tests
- Commit
- implementation.md
- Evidence

------

# 三、Delivery Unit task.md 增加 Implementation Guidance

Repository-local Delivery Unit：

```
DU-BE-001/
├── metadata.yaml
├── task.md
├── implementation.md
└── evidence/
```

其中：

```
task.md
```

正式增加实现指导章节。

推荐结构：

```
# DU-BE-001

## 1. Goal

描述本 Delivery Unit 的实现目标。


## 2. Repository

backend


## 3. Scope

列出：

- Target Modules
- Components
- Packages
- Services
- APIs
- Data Objects


## 4. Design References

引用 Workspace 的：

- design.md 对应章节
- API Contract
- Event Contract
- Data Contract


## 5. Dependencies

描述：

- 其他 Delivery Unit
- Repository Contract
- External Service
- Migration Dependency


## 6. Acceptance Criteria

描述这个 DU 完成的判定条件。


## 7. Implementation Sketch

给出推荐的仓库级实现方案。

应描述：

- 推荐组件
- 推荐调用关系
- 主要控制流程
- 领域边界
- 数据流
- 错误处理路径

例如：

Controller
    ↓
Application Service
    ↓
Domain Service
    ↓
Gateway
    ↓
Repository


## 8. Pseudocode

当当前 Delivery Unit 涉及：

- 业务流程
- 算法
- 状态机
- 复杂控制逻辑
- 跨组件编排

时，提供伪代码。

例如：

​```text
register(request):

    existing = userRepository.findByEmail(request.email)

    if existing exists:
        throw EmailAlreadyRegistered

    riskResult = riskGateway.check(request)

    if riskResult.rejected:
        throw RegistrationRejected

    user = User.create(
        email = request.email,
        password = passwordEncoder.encode(request.password)
    )

    userRepository.save(user)

    return user.id
```

## 9. Verification

描述 Dev/Test 后需要如何验证：

- Unit Test
- Integration Test
- API Test
- Migration Verification
- Error Case

```
---

# 四、Implementation Sketch 与 Pseudocode 不等价

请明确区分：

## Implementation Sketch

偏结构和实现方案，例如：

​```text
RegisterController
    ↓
RegisterUserApplicationService
    ↓
UserDomainService
    ├── UserRepository
    └── RiskGateway
```

用于说明：

> 应该由哪些组件配合完成这个 DU。

## Pseudocode

偏执行逻辑，例如：

```
if user exists
    reject

check risk

create aggregate

persist aggregate
```

用于说明：

> 关键流程具体应该如何执行。

------

# 五、Pseudocode 应为条件必填，不应所有 DU 强制要求

不要规定：

> 每个 Delivery Unit 都必须包含伪代码。

例如以下 Delivery Unit 通常不需要：

- 修改配置
- 升级依赖
- 修改 CI
- 文档变更
- 简单 SQL 调整
- 静态资源修改

因此定义：

```
Implementation Sketch
= 推荐存在

Pseudocode
= Conditional
```

当：

```
复杂业务流程
算法
状态转换
多组件编排
```

存在时，应填写 Pseudocode。

否则允许：

```
N/A
```

但不能留未解释的 placeholder。

------

# 六、Delivery Unit Contract 增加 implementation-guidance

如果当前 DU 有结构化 schema / metadata contract，请增加类似：

```
implementation-guidance:

  required: true

  pseudocode:
    required: conditional

  complexity-trigger:
    - business-flow
    - algorithm
    - state-transition
    - orchestration
```

不要过度实现 DSL。

v0.5 只需要表达：

- 是否需要实现指导
- 是否需要 Pseudocode

即可。

------

# 七、sdd-task 职责增强

调整 `sdd-task`：

它不仅负责：

```
Repository Decomposition
```

还需要负责：

```
Delivery Unit Specification
```

对于每个 Delivery Unit：

生成：

- Goal
- Scope
- Design Reference
- Dependency
- Acceptance Criteria
- Implementation Sketch
- Conditional Pseudocode
- Verification Guidance

最终：

```
sdd-task
    ↓
DU Specification
    ↓
sdd-dev
```

------

# 八、sdd-task Machine Gate 增加相关校验

在现有人机双重门禁原则下：

Machine Gate 可做确定性检查：

- DU 是否存在 Goal
- Repository 是否有效
- Scope 是否非空
- Design Reference 是否存在
- Acceptance Criteria 是否存在
- Implementation Sketch 是否非空
- Pseudocode 如果声明 required，则必须存在
- Pseudocode 不允许仍然是 placeholder

Machine Gate 不判断：

> 伪代码逻辑是否业务上正确。

这属于 Human Gate / Review。

------

# 九、Human Gate 增加 Implementation Guidance Review

Task Human Gate 应检查：

- DU 是否足够支持 Dev
- Implementation Sketch 是否符合 Design
- 是否出现不合理的技术细节
- Pseudocode 是否违背 API / Data / Architecture Contract
- 是否把本应该属于 Design 的系统级决策下沉到了 DU
- 是否遗漏关键异常流程

核心原则：

```
Machine Gate
= 是否完整

Human Gate
= 是否合理
```

------

# 十、Dev 阶段必须允许偏离 Pseudocode

Pseudocode 是：

```
Expected Implementation
```

不是强制代码翻译模板。

Dev 可以根据真实代码情况调整。

但如果实际实现发生明显偏离：

`implementation.md` 必须记录：

```
## Deviations

原 Delivery Unit 建议：

RiskClient 同步调用

实际实现：

复用现有 RiskGateway

原因：

Repository 已有统一 Anti-Corruption Layer。
```

------

# 十一、implementation.md 与 task.md 职责区分

必须固定：

```
task.md
= Expected Implementation
```

包括：

- Plan
- Sketch
- Pseudocode

```
implementation.md
= Actual Implementation
```

包括：

- 实际修改模块
- 实际修改文件
- Commit
- Task / DU Mapping
- 实现偏离
- 完成情况

不要将两者混为一份文件。

------

# 十二、Review 增加 Design → DU → Implementation Traceability

后续 `sdd-review` 应能够检查：

```
Workspace Design
        ↓
Delivery Unit Implementation Sketch
        ↓
Delivery Unit Pseudocode
        ↓
Actual Implementation
```

Review 重点检查：

- DU 是否符合 Design
- Actual Implementation 是否符合 DU
- 如果偏离是否有合理说明
- 是否仍满足 Acceptance Criteria

不要要求代码逐行匹配伪代码。

------

# 十三、核心边界

必须明确：

> Design 决定系统怎么设计。

> Task 将系统设计转换成 Repository-specific Delivery Specification。

> Delivery Unit 中的 Implementation Sketch / Pseudocode 是 Dev Guidance。

> Dev 负责真实实现。

因此：

```
Design
    ↓
Repository Impact / Contract

Task
    ↓
Delivery Unit
    ↓
Implementation Sketch
    ↓
Pseudocode

Dev
    ↓
Real Code
    ↓
implementation.md
```

------

# 十四、不要做的事情

本次不要：

- 把伪代码提前塞进 Workspace design.md
- 在 Design 阶段创建 DU
- 让伪代码成为真实代码事实源
- 强制所有 DU 都写复杂伪代码
- 让 Machine Gate 做 AI 语义判断
- 因为伪代码存在就自动认为 Dev 完成
- 把 task.md 和 implementation.md 合并

------

# 十五、需要同步检查的设计

请检查当前：

- Multi-Repository Delivery Design
- Delivery Unit Model
- sdd-task
- sdd-dev
- tasks.md
- Repository `task.md`
- Repository `implementation.md`
- Task Gate
- Review Skill

识别是否需要同步。

如果是 Phase 2 架构演进：

不要静默篡改 Phase 1 历史设计。

------

# 十六、输出要求

本次只修改设计，不编码。

请输出：

## 1. 修改后的 Delivery Unit Design

加入：

```
Implementation Sketch
Pseudocode
Verification Guidance
```

## 2. sdd-task Impact

说明：

Task 阶段如何生成 DU Implementation Guidance。

## 3. sdd-dev Impact

说明：

Dev 如何消费 DU，并如何记录 implementation deviation。

## 4. Gate Impact

列出：

- Machine Gate
- Human Gate

需要新增的检查。

## 5. Review Impact

说明：

Design → DU → Implementation 的一致性检查。

------

# 最终定义

最终请将 Delivery Unit 定义为：

> Delivery Unit 是 Repository-specific executable delivery specification。它由 Task 阶段根据已接受的 System Design 生成，包含目标、范围、依赖、验收标准、Design 引用，以及在适用情况下的 Implementation Sketch 和 Pseudocode，为 Dev 阶段提供可执行实现指导；真实代码、最终实现结果和 Evidence 仍由 Dev/Test 阶段产生。

请基于现有设计做增量修改，不重新设计其他架构，完成后等待用户评审。

```

```