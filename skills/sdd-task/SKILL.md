# sdd-task: 任务分解

> 阶段: task
> 状态转换: designed → tasked
> 产出: tasks.md

## 前置条件

- Change 处于 `designed` 状态
- design.md 已完成

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/design.md`。

#### 1.1 信息提取清单

从设计文档提取：

- 提议方案（新增/修改模块、接口、数据模型）→ 每个变更点映射为 Task
- 仓库影响表 → 确定每个 Task 的目标仓库和模块
- 数据变更 → 如需 Migration，单独列为 Task
- 风险评估 → 高风险项的缓解措施需作为 Task 或子任务
- 待澄清问题 → 已解决的转化为 Task，未解决的标注阻塞

### 2. 生成任务分解草稿

读取模板 `templates/artifacts/tasks.md`，按结构填写。

元信息 section（占位符替换）：

- `{{change-id}}`：Change ID
- `{{design-source}}`：`<CHG>/design.md`
- `{{from-state}}`：designed
- `{{to-state}}`：tasked
- `{{task-count}}`：拆分后任务数量

#### 2.1 任务分解原则

**粒度标准：**

- 每个 Task 可在 1 个 Commit 内完成（~50-200 行变更）
- 一个 Task 只做一件事（单一职责）
- Task 描述包含足够的细节，Agent 可直接执行无需再设计

**分解策略（按层次）：**

1. **数据层 Task** — 建表/Migration/Model 定义
2. **服务层 Task** — 业务逻辑实现
3. **接口层 Task** — Controller/Route/Endpoint
4. **校验层 Task** — 参数校验、权限检查
5. **测试 Task** — 单元测试、集成测试

**依赖分析：**

- 数据层 → 服务层 → 接口层（纵向依赖）
- 校验层可并行于接口层（横向无依赖）
- 测试 Task 依赖对应实现 Task

**覆盖检查：**

- design.md 的每个变更点必须有对应 Task
- 每个 PRD 验收标准必须有对应测试 Task
- 风险缓解措施必须有对应 Task 或在实现 Task 中标注

#### 2.2 任务清单格式

```markdown
### TASK-001: 创建 User 数据模型

- 目标仓库: main
- 目标模块: models/
- 预期变更: 新增 User.js，定义 User model
- 验证方法: model 字段断言 + 数据库连接测试
- 依赖: 无
- 预估变更: ~30 行

### TASK-002: 实现注册服务

- 目标仓库: main
- 目标模块: services/auth/
- 预期变更: 新增 register.js，实现注册业务逻辑
- 验证方法: 单元测试（mock model）
- 依赖: TASK-001
- 预估变更: ~80 行

### TASK-003: 实现注册端点

- 目标仓库: main
- 目标模块: controllers/auth/
- 预期变更: 新增 register.js，修改 router.js
- 验证方法: 集成测试（POST /api/auth/register）
- 依赖: TASK-002
- 预估变更: ~50 行

### TASK-004: 注册接口单元测试

- 目标仓库: main
- 目标模块: tests/auth/
- 预期变更: 新增 register.spec.js
- 验证方法: npm test 通过
- 依赖: TASK-002
- 预估变更: ~100 行
```

### 3. 质量自检

产出前自检：

- [ ] design.md 的每个变更点是否有对应 Task？
- [ ] 每个 PRD 验收标准是否有对应测试 Task？
- [ ] 任务粒度是否在 1 Commit 范围内？
- [ ] 依赖关系是否无循环依赖？
- [ ] 高风险项的缓解措施是否有对应 Task？
- [ ] 每个 Task 是否可独立执行（描述足够详细）？
- [ ] 测试 Task 是否覆盖正常路径 + 异常路径？

### 4. 用户交互

展示任务清单时，主动确认：

- 任务粒度是否合理（太粗或太细）？
- 依赖顺序是否正确？
- 是否有遗漏的变更点？
- 预估变更量是否合理？

写入 `delivery/changes/<CHG>/tasks.md`。

## 产出草稿

- `delivery/changes/<CHG>/tasks.md` — 任务分解清单

## 用户确认

展示 tasks.md 草稿给用户：

- 任务粒度是否合理？
- 依赖关系是否正确？
- 是否有遗漏的变更点？

确认后：

```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set tasked
```

## 工作示例

> 完整示例参考: `templates/artifacts/examples/tasks.md`（含 7 个 Task/依赖图/覆盖矩阵）

**需求：** 用户注册（邮箱/手机号）

**任务清单（节选）：**

```markdown
### TASK-001: 创建 User 数据模型

- 仓库: main | 模块: models/
- 变更: 新增 User.js（id/email/phone/password_hash/created_at）
- 验证: 字段类型断言 + UNIQUE 约束检查
- 依赖: 无

### TASK-002: 实现密码哈希工具

- 仓库: main | 模块: utils/
- 变更: 新增 password.js（bcrypt 封装：hash/compare）
- 验证: hash → compare 往返测试
- 依赖: 无

### TASK-003: 实现注册服务

- 仓库: main | 模块: services/auth/
- 变更: 新增 register.js（校验 → 哈希 → 存储 → 返回 token）
- 验证: mock model 单元测试（正常/重复/无效格式）
- 依赖: TASK-001, TASK-002

### TASK-004: 注册端点

- 仓库: main | 模块: controllers/auth/
- 变更: 新增 register.js + 修改 router.js
- 验证: 集成测试（POST /api/auth/register）
- 依赖: TASK-003

### TASK-005: 注册接口测试

- 仓库: main | 模块: tests/auth/
- 变更: 新增 register.spec.js（覆盖 AC-1 到 AC-5）
- 验证: npm test 全绿
- 依赖: TASK-004
```

**覆盖检查：**

- design.md 变更点: User model ✓ / register service ✓ / endpoint ✓ / router ✓
- PRD 验收标准: AC-1~5 全部由 TASK-005 覆盖 ✓
- 风险缓解: bcrypt 哈希（TASK-002）✓ / UNIQUE 约束（TASK-001）✓

## 行为规则

- 不修改 design.md / prd.md
- 不直接写 implementation/ 代码
- 产出草稿供用户确认，不直接推进状态
- 每个 Task 必须可独立执行，描述足够详细
- 测试 Task 必须覆盖正常路径和异常路径
- 依赖关系必须无循环
