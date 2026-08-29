# sdd-task: 任务分解（Delivery Decomposition + Delivery Unit Specification）

> 阶段: task
> 状态转换: designed → tasked
> 产出: tasks.md（STORY 级）+ Workspace DU 协调记录
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/design/persona-task.md

Phase 2.4 起 sdd-task 升级为 **Delivery Decomposition Skill**：
回答"正式拆成哪些交付单元"——把设计拆解为 Delivery Unit（DU），
每个 DU 是本次 Change 在一个具体仓库中的实施交付单元（DU 1:1 Repository）。

Phase 2.5 起进一步升级为 **Delivery Unit Specification**（DU v2：
Repository-specific executable delivery specification）：每个 DU 除分解字段外，
还必须产出 **Implementation Sketch（必填）+ Pseudocode（条件必填）+ Verification（必填）**，
作为 sdd-dev 的可执行实现指导。

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

- **affected-repositories**（front-matter）→ 本 Change 的影响仓全集，每个仓至少 1 个 DU
- 提议方案（新增/修改模块、接口、数据模型）→ 归入对应 DU 的 Scope
- **仓库影响分仓小节**（§3.x）→ 每个 DU 的 Goal
- **跨仓协作契约**（§4）→ DU 间的 Dependencies 与 Acceptance
- 数据变更 → 如需 Migration，单独列为对应仓的 DU 或 DU 内子任务
- 风险评估 → 高风险缓解措施纳入 DU 的 Acceptance
- 待澄清问题 → 已解决的转化为 DU 内容，未解决的标注阻塞

### 2. 生成 Delivery Decomposition 草稿

读取模板 `templates/artifacts/tasks.md`（Repository Delivery Decomposition Plan），按结构填写。

产物位置（Phase 2.4）：`delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md`
（STORY 级 artifact，由 metadata.feature-path 决定目录；Agent 按四级路径创建目录写入）

元信息 section（占位符替换）：

- `{{change-id}}`：Change ID
- `{{design-source}}`：`<CHG>/design.md`
- `{{from-state}}`：designed
- `{{to-state}}`：tasked
- `{{feature-path}}`：`L1 > L2 > L3 > STORY`
- `{{du-count}}`：DU 总数

#### 2.1 DU 分解原则

**硬约束：**

- Change 1:N DU；**DU 1:1 Repository**（跨仓交付必须拆成多个 DU）
- DU ID 规范：`DU-<REPO别名>-<nnn>`（如 DU-BE-001 / DU-FE-001），
  别名见 `.sdd/repositories.yaml` 的 alias（缺省取 id 前 2-4 字符大写）
- design.md 中不得出现 DU-XXX（Design 不产生 DU）；本阶段才开始编号
- design.md 中也不得出现实现级伪代码（Pseudocode 是本阶段在 DU 层产出的 Dev Guidance，不上浮 design）
- **Implementation Sketch 必填；Pseudocode 条件必填（complexity-trigger 命中时）；Verification 必填**

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
- Acceptance Criteria: POST /api/auth/register 返回 201；重复邮箱 409；AC-1~3 覆盖
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

### 3. 注册 Workspace DU 协调记录

tasks.md 草稿完成后，逐个 DU 注册协调记录（STORY 目录下）：

```bash
openspec du create <CHG> --id DU-BE-001 --repository backend \
  --scope "user-domain,registration-api" --dependencies "" \
  --acceptance "AC-1 注册流程可用;AC-2 重复邮箱拒绝" \
  --complexity "business-flow"
```

- scope/dependencies/acceptance 是 `du-coverage` 机检输入，必须填写
- `--complexity <triggers>`（business-flow/algorithm/state-transition/orchestration）：
  命中任一则 Pseudocode 必填（metadata.pseudocode 自动置 true）；
  简单 DU 可不传，或显式 `--pseudocode false`
- 未绑定 feature-path 时 du create 会报错（先补绑）

### 4. 质量自检

产出前自检：

- [ ] affected-repositories 的每个仓库是否都有至少 1 个 DU？（du-coverage 机检）
- [ ] 每个 DU 是否 1:1 对应一个仓库？
- [ ] DU ID 是否符合 `DU-<别名>-<nnn>` 且 Workspace 内唯一？
- [ ] design.md 的每个变更点是否落入某个 DU 的 Scope？
- [ ] 每个 PRD 验收标准是否映射到某 DU 的 Acceptance？
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
- Acceptance: POST /api/auth/register 201；重复 409；AC-1~3
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
- Acceptance: AC-4 表单校验；AC-5 注册成功跳转
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
- PRD 验收标准: AC-1~3 → DU-BE-001 ✓；AC-4~5 → DU-FE-001 ✓

## 行为规则

- 不修改 design.md / prd.md
- 不回写 design.md：Sketch/Pseudocode 属 Task 产物，只写入 tasks.md，禁止把实现级伪代码上浮 design（Phase 2.5）
- 不直接写 implementation/ 代码（实施由 sdd-dev 在 repo 侧执行）
- 不直接创建各仓 delivery/ 目录（统一走 `openspec du materialize`）
- DU 必须先经 `openspec du create` 注册再物化（guidance 声明经 --pseudocode/--complexity 写入 metadata）
- 跨仓依赖必须显式声明且无循环
- feature-path 未绑定时先补绑，禁止跳过

> 通用行为约束（产出草稿供用户确认 / 不直接推进状态等）见 prompts/common/constraints.md。
