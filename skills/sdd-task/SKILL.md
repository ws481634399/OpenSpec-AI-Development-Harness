# sdd-task: 逐 DU 任务分解（Per-Delivery-Unit Task Decomposition）

> 阶段: task
> 状态转换: designed → tasked
> 产出: tasks.md + test-design.md（STORY 级双产物）+ Workspace DU 协调记录补全
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/design/persona-task.md

Phase 4.3 起 sdd-task 收窄为 **逐 DU 任务分解 Skill**：
消费 design 阶段（design.md §6 / story-design.md §5）已产出的 **DU 划分表**，
对每个 DU 做任务分解 + Implementation Guidance，不再新造 DU（du-source-of-truth 机检）。
DU 划分决策属 design；task 阶段只回答「每个 DU 具体怎么实现」。

Phase 4.3 S3 起 sdd-task 产出 **双产物**——tasks.md + test-design.md：
- tasks.md：逐 DU 任务分解 + Implementation Guidance（Expected Implementation）
- test-design.md：验证意图（Verification Intent），定义 TC-NNN 测试用例表，在 dev 开始前锁定
- 双产物机检：tasks.md accepted 前必须存在 test-design.md（test-design-exists 机检：blocking）
- 隔离原则：test-design.md 先于任何 dev 执行产出，test 阶段 Agent 不注入 implementation.md（防「照实现写断言」）

Phase 2.5 的 **Delivery Unit Specification**（Implementation Sketch 必填 + Pseudocode 条件必填
+ Verification 必填）保留在 tasks.md 的 per-DU 小节，作为 sdd-dev 的可执行实现指导。

## 前置条件

- Change 处于 `designed` 状态
- design.md 已完成（含 affected-repositories front-matter）
- Change 已绑定 feature-path（metadata.feature-path；未绑定先执行
  `openspec change bind-feature-path <CHG> --story <STORY-ID>`）

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/design.md`。

#### 1.1 信息提取清单

从设计文档提取：

- **DU 划分表**（design.md §6 / story-design.md §5）→ 本阶段权威输入，DU/仓库/covers AC/depends on 已由 design 决定，**tasks.md 只引用不新造**（du-source-of-truth 机检：blocking）
- **affected-repositories**（front-matter）→ 影响仓全集（design 已保证每仓至少 1 个 DU）
- 提议方案（新增/修改模块、接口、数据模型）→ 归入对应 DU 的 Scope
- **仓库影响分仓小节**（§3.x）→ 每个 DU 的 Goal 来源
- **跨仓协作契约**（§4）→ DU 间的 Dependencies 与 Acceptance（须与 DU 划分表 depends on 一致）
- 数据变更 → 如需 Migration，归入对应仓的 DU 子任务
- 风险评估 → 高风险缓解措施纳入 DU 的 Acceptance
- 待澄清问题 → 已解决的转化为 DU 内容，未解决的标注阻塞

### 2. 生成 Delivery Decomposition 草稿

读取模板 `templates/artifacts/tasks.md`（Repository Delivery Decomposition Plan），按结构填写。

产物位置（Phase 2.4）：`delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md`
（STORY 级 artifact，由 metadata.feature-path 决定目录；Agent 按四级路径创建目录写入）

元信息 section（占位符替换）：

- `{{change-id}}`：Change ID
- `{{design-source}}`：`<CHG>/design.md`
- `{{feature-path}}`：`L1 > L2 > L3 > STORY`
- `{{du-count}}`：DU 总数

#### 2.1 DU 分解原则

**硬约束：**

- **DU 划分在 design 已定义**（design.md §6 / story-design.md §5 DU 划分表）；
  tasks.md 的 `### DU-XXX` 小节**只引用不新造**——DU id/仓库/covers AC/depends on 须与 design DU 划分表一致（du-source-of-truth 机检：blocking）
- Change 1:N DU；**DU 1:1 Repository**（跨仓交付必须拆成多个 DU，由 design 决定）
- DU ID 规范：`DU-<REPO别名>-<nnn>`（如 DU-BE-001 / DU-FE-001），
  别名见 `.sdd/repositories.yaml` 的 alias（缺省取 id 前 2-4 字符大写）
- tasks.md 不上浮系统级设计决策（Pseudocode / Implementation Sketch 是 DU 层 Dev Guidance，design 只保留系统级方案 + DU 划分）
- **Implementation Sketch 必填；Pseudocode 条件必填（complexity-trigger 命中时）；Verification 必填**
- 每个任务条目声明 `verifies: TC-NNN`（红绿灯对象；S3 test-design.md 落地 TC 编号，S2 先开字段）

**粒度标准：**

- 每个 DU 是一个仓内可独立交付的实施单元；DU 内部任务（1 Commit 粒度）留给 repo 侧 task.md 细化
- DU 描述包含 Goal / Scope / Design References / Dependencies / Acceptance / Sketch / Pseudocode / Verification，
  Agent 在 repo 侧可直接执行无需回读 Workspace 全文

**依赖分析：**

- 跨仓依赖必须显式声明（如 DU-BE-001 提供 API → DU-FE-001 消费）
- 执行顺序与并行组写明（Parallelization）
- 覆盖检查：affected-repositories 中每个仓都有 DU；design 每个变更点都落入某 DU 的 Scope

#### 2.2 Implementation Guidance 生成（Phase 2.5）

对每个 DU，在分解字段之外产出三段指导：

1. **Implementation Sketch（必填）**：从 design.md §2 提议方案 + §3 分仓小节推导该仓内的
   组件配合关系（如 Controller → Application Service → Domain → Gateway/Repository），
   标注领域边界、数据流、错误处理路径。偏结构：说明「应该由哪些组件配合完成这个 DU」。
2. **Pseudocode（条件必填）**：判定 complexity-trigger——
   `business-flow`（复杂业务流程）/ `algorithm`（算法）/ `state-transition`（状态机）/ `orchestration`（多组件编排）：
   - 命中任一 → 撰写 Pseudocode（覆盖主流程 + 关键异常分支 + 与 §4 契约的交互点）。
     偏逻辑：说明「关键流程具体应该如何执行」。
   - 未命中（如改配置/升级依赖/改 CI/文档/简单 SQL/静态资源）→ 写 `N/A + 理由`，不留空占位。
3. **Verification（必填）**：按 DU Acceptance 推导 Unit / Integration / API /
   Migration Verification / Error Case 清单（供 sdd-test 直接消费）。

Sketch 与 Pseudocode 不等价：Sketch = 结构方案（组件/调用关系），Pseudocode = 执行逻辑（条件/顺序/异常）。
两者都是 **Dev Guidance**（Expected Implementation），不是强制代码翻译模板；
真实代码事实源始终是 sdd-dev 产出的源代码与 implementation.md。

#### 2.3 DU 清单格式

````markdown
### DU-BE-001: 注册服务后端

- 目标仓库: backend
- 目标 Goal: 实现注册 API（校验 → 哈希 → 存储 → token）
- Scope（范围）: models/User, services/auth/, controllers/auth/
- Design References: design.md §2 提议方案 / §4 API Contract
- Dependencies: 无
- Acceptance Criteria: POST /api/auth/register 返回 201；重复邮箱 409；AC-001~3 覆盖
- Execution Order: 1
- Parallelization: 组 A（与 DU-MAIN-001 并行）
- Implementation Sketch:
  ```text
  RegisterController
      ↓
  RegisterApplicationService
      ↓
  UserDomainService
      ├── UserRepository
      └── PasswordEncoder
  ```
- Pseudocode:            # complexity-trigger: business-flow → 必填
  ```text
  register(request):
      existing = userRepository.findByEmail(request.email)
      if existing exists: throw EmailAlreadyRegistered
      user = User.create(email, passwordEncoder.encode(request.password))
      userRepository.save(user)
      return user.id
  ```
- Verification: Unit（UserDomainService 单测，覆盖重复邮箱分支）；
  Integration（register API 201/409 两路径）；Error Case（DB 不可用返回 500）
````

简单 DU（未命中触发器）示例：

```markdown
- Implementation Sketch: 复用现有 CI workflow，仅新增 lint job 节点
- Pseudocode: N/A（纯配置变更，无业务流程/算法/状态转换/编排）
- Verification: CI pipeline 全绿
```

#### 2.4 生成 test-design.md（验证意图，Phase 4.3 S3）

读取模板 `templates/artifacts/test-design.md`，与 tasks.md 同批产出。产物位置与 tasks.md 同目录：
`delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/test-design.md`

**test-design.md 是验证意图（Verification Intent），不是测试代码**——在 dev 开始前锁定 TC-NNN 测试用例表，
保证 test 阶段的独立性（test Agent 不读 implementation.md，照 test-design 执行）。

**TC 表构造规则：**

- 每个 spec.md / story-spec.md 中的 AC-NNN 至少被一个 TC-NNN verified-by（tc-coverage 机检：blocking）
- 允许标注 `TC-NOT-TESTABLE: 理由`（不可测的 AC 进 warnings 不阻断，但需有替代验证方式）
- verified-by AC 列必须引用 spec 中真实存在的 AC-NNN
- 归属 DU 列必须引用 design DU 划分表中真实存在的 DU id
- TC 编号三位递增不复用（TC-001, TC-002, ...）

**TC 表格式：**

```markdown
| TC     | 验证方式     | verified-by AC | 归属 DU   | 备注 |
| ------ | ------------ | -------------- | --------- | ---- |
| TC-001 | API 集成测试 | AC-001         | DU-BE-001 |      |
| TC-002 | E2E          | AC-002         | DU-FE-001 |      |
```

**与 tasks.md 的绑定：**

- tasks.md 每个 DU 小节的 `verifies: TC-NNN` 字段必须引用 test-design.md 中定义的 TC id
- 无 TC 的任务只能是 `type: docs/chore`（非功能性任务）
- 此绑定是 dev 红绿灯的执行对象：dev 按 TC-NNN 先写失败测试（红）→ 实现至通过（绿）

**测试策略段（§2）：**

- 分层测试策略（Unit / Integration / API / E2E），各层覆盖范围与不重复原则
- 数据准备策略（fixture / mock / seed）
- 环境要求（测试运行环境与依赖服务）

### 3. 补全 Workspace DU 协调记录

DU 框架已在 design 阶段用 `openspec du create` 登记（见 sdd-design §6）。
本阶段对每个 DU 补全 tasks 路径与 Implementation Guidance 声明：

```bash
# design 阶段已执行（sdd-design）：登记 DU 框架
# openspec du create <CHG> --id DU-BE-001 --repository backend \
#   --scope "user-domain,registration-api" --dependencies "" \
#   --acceptance "AC-001 注册流程可用;AC-002 重复邮箱拒绝" \
#   --complexity "business-flow"

# task 阶段：补全/校验 DU 与 tasks.md 一致性
openspec du sync-status <CHG>   # 刷新 DU 状态与 tasks 路径引用
```

- scope/dependencies/acceptance 是 `du-coverage` 机检输入，design 阶段已填写，本阶段校验与 tasks.md 一致
- tasks.md 中 `### DU-XXX` 小节必须与 design DU 划分表的 DU id 一一对应（du-source-of-truth 机检：blocking）
- `--complexity <triggers>`（business-flow/algorithm/state-transition/orchestration）：
  命中任一则 Pseudocode 必填（metadata.pseudocode 自动置 true）；
  简单 DU 可不传，或显式 `--pseudocode false`
- 未绑定 feature-path 时 du create 会报错（先补绑）

### 4. 质量自检

产出前自检：

- [ ] affected-repositories 的每个仓库是否都有至少 1 个 DU？（du-coverage 机检）
- [ ] 每个 DU 是否 1:1 对应一个仓库？
- [ ] DU ID 是否符合 `DU-<别名>-<nnn>` 且 Workspace 内唯一？
- [ ] tasks.md 的 `### DU-XXX` 是否全部在 design DU 划分表中定义？（du-source-of-truth 机检：只引用不新造）
- [ ] 每个任务条目是否声明 `verifies: TC-NNN`（无 TC 的任务只能是 docs/chore 类型）？
- [ ] test-design.md 是否与 tasks.md 同批产出？（test-design-exists 机检：blocking）
- [ ] test-design.md 中每个 AC-NNN 是否至少被一个 TC-NNN verified-by？（tc-coverage 机检：blocking）
- [ ] test-design.md 的 verified-by AC 列是否引用 spec 中真实存在的 AC-NNN？
- [ ] test-design.md 的归属 DU 列是否引用 design DU 划分表中的 DU id？
- [ ] 不可测 AC 是否标注 `TC-NOT-TESTABLE: 理由`（进 warnings 不阻断）？
- [ ] design.md 的每个变更点是否落入某个 DU 的 Scope？
- [ ] 每条 spec 验收标准（AC-NNN）是否映射到某 DU 的 Acceptance？
- [ ] 跨仓依赖是否显式声明且无循环？
- [ ] 每个 DU 是否都有非空 Implementation Sketch？（du-guidance 机检）
- [ ] complexity-trigger 判定是否合理（该写伪代码的没偷懒，简单任务没硬凑）？
- [ ] pseudocode: true 的 DU 是否都有完整 Pseudocode（无 placeholder/N/A）？（du-guidance 机检）
- [ ] 未命中触发器的 DU 是否写了 N/A + 理由？
- [ ] Sketch/Pseudocode 是否与 design.md §2/§4 契约一致（未引入新接口/新表）？
- [ ] 是否把本应属于 Design 的系统级决策下沉到了 DU（发现则上浮 design 或标记待澄清）？
- [ ] 每个 DU 是否都有 Verification 清单？（du-guidance 机检）
- [ ] 每个 DU 的描述是否足够详细（repo 侧无需再设计）？
- [ ] 是否已用 `openspec du create` 注册全部 DU（含 --complexity/--pseudocode 声明）？

### 5. 用户交互

展示 DU 清单时，主动确认：

- DU 拆分粒度是否合理（跨仓边界正确？）？
- 跨仓依赖顺序是否正确？
- 是否有遗漏的变更点或影响仓？

**Implementation Guidance Review（Phase 2.5，Human Gate）：**

- DU 是否足够支持 Dev（拿着 spec 不回读 Workspace 能开工吗）？
- Implementation Sketch 是否符合 Design（未违背 §2 方案与 §4 跨仓契约）？
- 是否出现不合理的技术细节（越权下沉系统级决策）？
- Pseudocode 是否违背 API / Data / Architecture Contract？
- 是否遗漏关键异常流程（错误分支 / 边界条件）？
- complexity-trigger 判定是否合理？

> 核心原则：Machine Gate = 是否完整；Human Gate = 是否合理。

## 产出草稿

- `delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md` — Repository Delivery Decomposition Plan
- `delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/test-design.md` — 验证意图（Verification Intent，TC-NNN 表）
- `<STORY>/DU-*/metadata.yaml` — Workspace DU 协调记录（du create 写入）

## 用户确认

展示 tasks.md 草稿给用户：

- DU 拆分与跨仓边界是否合理？
- 依赖关系是否正确？
- 是否有遗漏的影响仓？

确认后：

```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set tasked
```

## 物化（Task Gate accepted 后）

状态推进到 tasked 后，将 DU 物化到各仓（创建 repo 侧交付目录 + 记录 baseline）：

```bash
openspec du materialize <CHG> DU-BE-001
openspec du materialize <CHG> DU-FE-001
openspec du sync-status <CHG>
```

- materialize 前置校验 tasks.md Machine Gate passed + Human Gate approved + hash 一致
- 各仓只见自己的 DU（完整父路径 `delivery/<CHG>/<L1>/<L2>/<L3>/<STORY>/DU-XXX/`）
- 提前物化（Gate 未 accepted）属违规，materialize 会拒绝

## 工作示例

> 完整示例参考: `templates/artifacts/examples/tasks.md`（含 DU 分解/依赖图/覆盖矩阵）

**需求：** 用户注册（邮箱/手机号），影响 backend 与 frontend 两仓

**DU 清单（节选）：**

````markdown
### DU-BE-001: 注册服务后端

- 仓库: backend | 顺序: 1 | 并行组: A
- Goal: 注册 API（校验 → bcrypt 哈希 → 存储 → 返回 token）
- Scope: models/User, services/auth/, controllers/auth/
- Design References: design.md §2 / §4 API Contract
- Dependencies: 无
- Acceptance: POST /api/auth/register 201；重复 409；AC-001~3
- Implementation Sketch:
  ```text
  RegisterController → RegisterApplicationService → UserDomainService
      ├── UserRepository
      └── PasswordEncoder
  ```
- Pseudocode:（complexity-trigger: business-flow → 必填）
  ```text
  register(request):
      existing = userRepository.findByEmail(request.email)
      if existing exists: throw EmailAlreadyRegistered
      user = User.create(email, passwordEncoder.encode(request.password))
      userRepository.save(user); return user.id
  ```
- Verification: Unit（重复邮箱分支）；Integration（201/409 路径）；Error Case（DB 不可用 500）

### DU-FE-001: 注册页面前端

- 仓库: frontend | 顺序: 2 | 并行组: B
- Goal: 注册表单 UI + API 对接
- Scope: pages/register/, api/auth.ts
- Design References: design.md §2 / §4 API Contract
- Dependencies: DU-BE-001（API 可用后联调）
- Acceptance: AC-004 表单校验；AC-005 注册成功跳转
- Implementation Sketch: RegisterPage → useRegisterForm → authApi.register
- Pseudocode: N/A（标准表单提交流程，无复杂业务流程/算法/状态转换/编排）
- Verification: Unit（表单校验规则）；E2E（提交成功跳转）
````

**注册（含 guidance 声明）：**

```bash
openspec du create <CHG> --id DU-BE-001 --repository backend \
  --scope "user-domain,registration-api" --complexity "business-flow"
openspec du create <CHG> --id DU-FE-001 --repository frontend \
  --scope "register-page,api-client" --pseudocode false
```

**覆盖检查：**

- affected-repositories: [backend, frontend] → DU-BE-001 ✓ / DU-FE-001 ✓
- design.md 变更点: model ✓ / service ✓ / endpoint ✓ / page ✓ / api client ✓
- spec 验收标准: AC-001~3 → DU-BE-001 ✓；AC-004~5 → DU-FE-001 ✓

## 行为规则

- 不修改 design.md / spec.md
- 不新造 DU：tasks.md 的 `### DU-XXX` 只引用 design DU 划分表已定义的 DU（du-source-of-truth 机检：blocking）
- 不回写 design.md：Sketch/Pseudocode 属 Task 产物，只写入 tasks.md，禁止把实现级伪代码上浮 design（Phase 2.5）
- 不直接写 implementation/ 代码（实施由 sdd-dev 在 repo 侧执行）
- 不直接创建各仓 delivery/ 目录（统一走 `openspec du materialize`）
- DU 必须先经 `openspec du create` 注册（design 阶段已执行）再物化（guidance 声明经 --pseudocode/--complexity 写入 metadata）
- 跨仓依赖必须显式声明且无循环（须与 design DU 划分表 depends on 一致）
- feature-path 未绑定时先补绑，禁止跳过

> 通用行为约束（产出草稿供用户确认 / 不直接推进状态等）见 prompts/common/constraints.md。
