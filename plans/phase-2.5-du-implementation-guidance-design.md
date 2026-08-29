# Phase 2.5 设计：Delivery Unit 的 Dev 前置实现指导能力（Implementation Guidance）

> 状态: Draft v0.1（待用户评审）
> 输入: docs/Delivery Unit 的 Dev 前置实现指导能力.md
> 基线: plans/phase-2.4-multi-repository-delivery-design.md（不篡改其历史内容，本文档为增量演进）
> 范围: 仅调整 DU 的 Dev 前置实现指导能力；Git Submodule / Feature Tree / Change Path / Evidence / Workflow 等已确定架构一律不动
> 性质: 只修改设计，不编码

---

## 0. 一句话结论

把 Delivery Unit 从「仓库级任务清单」升级为「**Repository-specific executable delivery specification**」：
Task 阶段为每个 DU 产出 **Implementation Sketch（必填）+ Pseudocode（条件必填）+ Verification（必填）**，
作为 sdd-dev 的可执行实现指导；Dev 允许偏离但必须记录 Deviations；
Machine Gate 检查「是否完整」，Human Gate / Review 判断「是否合理」。

---

## 1. 现状盘点（对应需求 §十五 同步检查表）

| # | 检查对象 | 当前状态（Phase 2.4 已实现） | 是否需要同步 |
|---|---------|------------------------------|-------------|
| 1 | Multi-Repository Delivery Design（phase-2.4 设计文档） | DU 定义为「仓库级实施交付单元」，DU 描述含 Goal/Scope/Design References/Dependencies/Acceptance，无实现指导 | 不改历史；本文档作为 Phase 2.5 增量演进，定义升级版 |
| 2 | Delivery Unit Model（`core/sdd/delivery-unit.js` + `templates/artifacts/du/*.yaml`） | Workspace/Repository metadata v0.1：无 implementation-guidance 段；repo task.md 模板仅 6 个空字段行 | **需要**：metadata 增段 + 模板升级（§4、§6） |
| 3 | sdd-task（SKILL.md + gate.yaml） | 负责 Repository Decomposition（DU 清单 8 字段 + du create/materialize），无实现指导产出职责 | **需要**（§7） |
| 4 | sdd-dev（SKILL.md） | 按 DU metadata 的 scope/acceptance 实施；无「消费 guidance」「记录偏离」机制 | **需要**（§8） |
| 5 | tasks.md 模板（Workspace STORY 级） | DU 小节 8 字段：目标仓库/Goal/Scope/Design References/Dependencies/Acceptance/Execution Order/Parallelization | **需要**：增 3 字段（§5） |
| 6 | Repository task.md（materialize 生成） | `REPO_TASK_TEMPLATE`：6 行空字段骨架，由 Agent 事后填写 | **需要**：升级为 9 节结构（§6） |
| 7 | Repository implementation.md（materialize 生成） | DU 级实施记录模板，无 Deviations 固定小节 | **需要**：增 `## Deviations` 固定小节（§8） |
| 8 | Task Gate（`gate-validator.js` du-coverage） | 只查 DU 结构完整性（repository/scope/acceptance/dependencies/覆盖），不查实现指导 | **需要**：新增 `du-guidance` 检查项（§9） |
| 9 | Review Skill（sdd-review SKILL.md 检查 2） | 查 Design ↔ code-change 证据一致性（含跨仓契约），无 Design→DU→Implementation 链路检查 | **需要**（§10） |

**结论：** 9 项中 8 项需要同步；phase-2.4 历史设计文档保持原样，由本文档承载增量。

---

## 2. Delivery Unit 定位升级（输出要求 1）

### 2.1 最终定义（v2）

> **Delivery Unit 是 Repository-specific executable delivery specification。**
> 它由 Task 阶段根据已接受的 System Design 生成，包含目标、范围、依赖、验收标准、
> Design 引用，以及在适用情况下的 Implementation Sketch 和 Pseudocode，
> 为 Dev 阶段提供可执行实现指导；真实代码、最终实现结果和 Evidence 仍由 Dev/Test 阶段产生。

### 2.2 DU Specification 组成（8 要素）

| 要素 | 产生阶段 | 载体 | 完整性机检 |
|------|---------|------|-----------|
| Goal | task | tasks.md DU 小节 / repo task.md §1 | du-coverage（已有，scope 非空隐含） |
| Repository | task | DU metadata.repository | du-coverage（已有） |
| Scope | task | DU metadata.scope + 小节 | du-coverage（已有） |
| Design References | task | tasks.md DU 小节 / repo task.md §4 | 新增 du-guidance |
| Dependencies | task | DU metadata.dependencies | du-coverage（已有） |
| Acceptance Criteria | task | DU metadata.acceptance + 小节 | du-coverage（已有） |
| **Implementation Guidance**（Sketch + 条件 Pseudocode） | task | tasks.md DU 小节 / repo task.md §7/§8 | **新增 du-guidance** |
| **Verification Guidance** | task | tasks.md DU 小节 / repo task.md §9 | **新增 du-guidance** |

### 2.3 三层职责边界（不变式，需求 §二/§十三）

```
Design  = System-level Technical Design
          负责：Repository Impact / Architecture / API·Event·Data Contract /
                Cross-Repository Dependency / Integration Boundary
          不负责：仓库级开发步骤、DU ID、实现伪代码

Task    = Design → Repository Delivery Decomposition → Delivery Unit Specification
          负责：仓库级实现目标、模块级 Scope、实现顺序、
                Implementation Sketch、Pseudocode（条件）、Verification

Dev     = DU Specification → Real Implementation
          产出：Source Code / Config / SQL / Migration / Tests / Commit /
                implementation.md / Evidence
```

硬约束（沿袭 + 新增）：
- design.md 中不得出现 DU-XXX（Phase 2.4 已有）；**design.md 中也不得出现实现级伪代码**（本文档新增，防止 Design 越权下沉）

---

## 3. Implementation Sketch 与 Pseudocode 的区分（需求 §四）

| 维度 | Implementation Sketch | Pseudocode |
|------|----------------------|------------|
| 回答 | 应该由哪些组件配合完成这个 DU | 关键流程具体应该如何执行 |
| 形态 | 组件结构 + 调用关系（结构图） | 执行逻辑（条件/顺序/异常路径） |
| 示例 | `RegisterController → RegisterUserApplicationService → UserDomainService ├─ UserRepository └─ RiskGateway` | `register(request): existing = findByEmail(...) if existing: throw ... check risk create aggregate persist` |
| 必填性 | **必填**（推荐尽早填写，Machine Gate 检查非空） | **条件必填**（见 §4 触发规则） |
| 性质 | Expected Implementation（结构） | Expected Implementation（逻辑） |

两者都是 **Dev Guidance**，不是强制代码翻译模板；真实代码事实源始终是 Dev 产出的源代码与 implementation.md。

---

## 4. DU Contract 变更：metadata 增加 implementation-guidance（输出要求 1 + 需求 §六）

### 4.1 Workspace DU metadata（v0.1 → v0.2）

```yaml
# 新增段（置于 acceptance 之后）
implementation-guidance:
  sketch: true                # Implementation Sketch 必填（恒为 true，占位声明）
  pseudocode: false           # 本 DU 是否要求 Pseudocode（条件，见 4.2）
  complexity-trigger: []      # 命中的复杂度触发器（见 4.2），如 [business-flow]
```

- 不做 DSL：只表达「是否需要实现指导 / 是否需要 Pseudocode」两个布尔 + 触发器记录
- 正文（Sketch/Pseudocode 内容）**不进 metadata**——沿袭「Workspace DU 只保存 Reference / Summary」原则，正文在 tasks.md DU 小节

### 4.2 Pseudocode 条件必填规则（需求 §五）

```
complexity-trigger 命中任一 → pseudocode: true（必须填写）
  - business-flow      复杂业务流程
  - algorithm          算法
  - state-transition   状态机 / 状态转换
  - orchestration      多组件编排 / 跨组件调用链

未命中（如：改配置、升级依赖、改 CI、文档变更、简单 SQL、静态资源）
  → pseudocode: false，Pseudocode 字段写 N/A（附一行理由）
```

约束：
- `pseudocode: true` 时正文**不允许** placeholder（`{{}}` / `TBD` / `N/A` 均判失败）
- `pseudocode: false` 时允许 `N/A`，但必须附未命中理由，不允许留未解释的空占位
- trigger 判定由 sdd-task（Agent）在 Task 阶段做出，属声明而非机检对象

### 4.3 Repository DU metadata（同步 v0.2）

materialize 渲染时带入同样的 `implementation-guidance` 段（值从 Workspace DU 复制），
保证仓库被单独打开时仍可追溯「本 DU 是否声明了 Pseudocode 要求」。

### 4.4 CLI 影响

`openspec du create` 新增两个 option：

```
--pseudocode <true|false>     # 默认 false；与 --complexity 联动
--complexity <triggers>       # 逗号分隔，如 "business-flow,orchestration"
```

- 传了任一 `--complexity` → pseudocode 自动置 true（显式 `--pseudocode false` 可覆盖并告警提示不一致）
- `openspec du show` 输出 implementation-guidance 段

---

## 5. Workspace tasks.md：DU 小节格式升级（输出要求 1）

现有 8 字段后追加 3 个字段（11 字段）：

```markdown
### DU-BE-001: 注册服务后端

- 目标仓库: backend
- 目标 Goal: 实现注册 API（校验 → 哈希 → 存储 → token）
- Scope（范围）: models/User, services/auth/, controllers/auth/
- Design References: design.md §2 提议方案 / §4 API Contract
- Dependencies: 无
- Acceptance Criteria: POST /api/auth/register 返回 201；重复邮箱 409；AC-1~3 覆盖
- Execution Order: 1
- Parallelization: 组 A（与 DU-FE-001 并行）
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
```

简单 DU 示例（Pseudocode 免填）：

```markdown
- Implementation Sketch:
  复用现有 CI workflow，仅新增 lint job 节点
- Pseudocode: N/A（纯配置变更，无业务流程/算法/状态转换/编排）
- Verification: CI pipeline 全绿
```

模板同步：`templates/artifacts/tasks.md` 的 DU 小节骨架与注释更新（注明 Sketch 必填 / Pseudocode 条件 / Verification 必填）。

---

## 6. Repository task.md 模板升级（需求 §三）

materialize 生成的 repo 侧 `task.md` 从 6 行空字段骨架升级为 **9 节结构**：

```markdown
# DU-BE-001

> Repository Delivery 的 DU 级任务细化。
> 权威来源：workspace-source.tasks 中本 DU 小节（Expected Implementation）；
> 本文件是 repo 侧可执行副本，Agent 依据权威来源填写，允许按仓内实际情况微调并保持一致。

## 1. Goal
## 2. Repository
## 3. Scope          # Target Modules / Components / Packages / Services / APIs / Data Objects
## 4. Design References   # 引用 workspace design.md 章节 + API/Event/Data Contract
## 5. Dependencies        # 其他 DU / Repository Contract / External Service / Migration
## 6. Acceptance Criteria
## 7. Implementation Sketch   # 推荐组件 / 调用关系 / 控制流程 / 领域边界 / 数据流 / 错误处理路径
## 8. Pseudocode              # 条件必填（metadata.implementation-guidance.pseudocode=true 时）；否则 N/A + 理由
## 9. Verification            # Unit / Integration / API / Migration Verification / Error Case
```

**实现方式（保持零解析复制）：** materialize 仍只渲染骨架 + `{{du-id}}` +
在文件头注入 `implementation-guidance` 提示行（pseudocode 是否必填），
正文由 Agent 按 workspace-source.tasks 填写。
**不做** markdown 小节自动复制（避免脆弱解析，符合纯函数/零构建约束）。

**职责固定（需求 §十一）：**

| 文件 | 语义 | 内容 |
|------|------|------|
| `task.md`（repo 侧） | **Expected Implementation** | Plan / Sketch / Pseudocode / Verification |
| `implementation.md`（repo 侧） | **Actual Implementation** | 实际修改模块/文件、Commit、Task/DU Mapping、**实现偏离**、完成情况 |

两者不得合并（Phase 2.4 语义延续并固化）。

---

## 7. sdd-task Impact（输出要求 2）

sdd-task 职责从「Repository Decomposition」扩展为
「**Repository Decomposition + Delivery Unit Specification**」。

### 7.1 生成流程（在现有步骤 2「生成 DU 清单」内扩展）

对每个 DU，除现有 8 字段外：

1. **产出 Implementation Sketch**：从 design.md §2 提议方案 + §3 分仓小节推导该仓内的
   组件配合关系（Controller → Application Service → Domain → Gateway/Repository 等），
   标注领域边界、数据流、错误处理路径
2. **判定 complexity-trigger**（business-flow / algorithm / state-transition / orchestration）：
   - 命中 → 撰写 Pseudocode（覆盖主流程 + 关键异常分支 + 与 §4 契约的交互点）
   - 未命中 → Pseudocode 写 `N/A + 理由`
3. **产出 Verification Guidance**：按 DU Acceptance 推导 Unit / Integration / API /
   Migration Verification / Error Case 清单（供 sdd-test 直接消费）
4. **注册时写入 metadata**：`openspec du create ... --pseudocode <bool> --complexity <triggers>`

### 7.2 质量自检（追加）

- [ ] 每个 DU 是否都有非空 Implementation Sketch？
- [ ] complexity-trigger 判定是否合理（该写伪代码的没偷懒，简单任务没硬凑）？
- [ ] pseudocode: true 的 DU 是否都有完整 Pseudocode（无 placeholder）？
- [ ] Sketch/Pseudocode 是否与 design.md §2/§4 契约一致（未引入新接口/新表）？
- [ ] 是否把本应属于 Design 的系统级决策下沉到了 DU（发现则上浮 design 或标记待澄清）？
- [ ] 每个 DU 是否都有 Verification 清单？

### 7.3 不变约束

- 仍不写代码、不创建 repo 侧目录（materialize 机制不变）
- Sketch/Pseudocode 属 Task 产物，写入 tasks.md；**不回写 design.md**

---

## 8. sdd-dev Impact（输出要求 3）

### 8.1 消费 DU Guidance

现有「读取 DU metadata 的 scope/acceptance」扩展为「读取 repo 侧 task.md 全 9 节」：

- §1 Goal / §3 Scope → 实施边界（已有语义）
- **§7 Implementation Sketch → 推荐组件与调用关系**（实施的结构基线）
- **§8 Pseudocode → 关键流程执行逻辑**（逻辑基线；`N/A` 则跳过）
- **§9 Verification → 自测清单**（每个 Task 自测 + DU 完成前逐项验证）

### 8.2 允许偏离 + Deviations 记录（需求 §十）

Pseudocode 是 Expected Implementation，不是强制翻译模板。Dev 可按仓内真实情况调整，
但**明显偏离时必须在 repo 侧 `implementation.md` 的固定小节记录**：

```markdown
## Deviations

### DEV-1
- 原 DU 建议: RiskClient 同步调用风控接口
- 实际实现: 复用仓内现有 RiskGateway（反腐败层）
- 原因: Repository 已有统一 Anti-Corruption Layer，避免重复建设
- 影响评估: 不改变对外契约，AC 全覆盖
```

规则：
- `## Deviations` 为 implementation.md 模板固定小节（无偏离写 `无`）
- 偏离记录三要素缺一不可：原建议 / 实际实现 / 原因（+建议附影响评估）
- 偏离**不阻断** dev 状态推进；合理性由 sdd-review 检查（§10）
- Workspace 级 implementation.md（跨仓汇总）在有偏离时聚合引用偏离条目（evidence-ref 同一原则）

### 8.3 行为规则（追加）

- 实施前先读 repo task.md §7/§8/§9，不读则视为未消费 DU Guidance
- 偏离必须记录，不默默改道；禁止为「匹配伪代码」而写坏代码

---

## 9. Gate Impact（输出要求 4）

### 9.1 Task Machine Gate 新增：`du-guidance` 检查项

注册于 `skills/sdd-task/gate.yaml` machine-checks（实现位于 gate-validator，与 du-coverage 同层）：

| 子检查 | 规则（全部确定性） |
|--------|-------------------|
| sketch 非空 | 每个 DU 在 tasks.md 的小节中 Implementation Sketch 非空且非 placeholder |
| pseudocode 条件存在 | Workspace DU metadata `implementation-guidance.pseudocode: true` → 小节 Pseudocode 存在、非空、非 placeholder |
| pseudocode 声明一致 | `pseudocode: false` → 允许 `N/A`，但小节不得为空（必须有 N/A 或正文） |
| 无 placeholder | `pseudocode: true` 时 `{{}}` / `TBD`（独立成值）判失败 |
| verification 非空 | 每个 DU 小节 Verification 非空且非 placeholder |
| metadata 合法 | `implementation-guidance` 段存在；complexity-trigger 取值 ∈ 四个枚举 |

Machine Gate **不判断**：伪代码逻辑是否业务正确、Sketch 是否符合架构——这属于 Human Gate / Review（需求 §八）。

### 9.2 Task Human Gate 新增：Implementation Guidance Review（需求 §九）

用户审批 tasks.md 时，sdd-task 主动呈现并确认：

- DU 是否足够支持 Dev（拿着 spec 不回读 Workspace 能开工吗）
- Implementation Sketch 是否符合 Design（未违背 §2 方案与 §4 跨仓契约）
- 是否出现不合理的技术细节（越权下沉系统级决策）
- Pseudocode 是否违背 API / Data / Architecture Contract
- 是否遗漏关键异常流程（错误分支 / 边界条件）
- complexity-trigger 判定是否合理

核心原则固定：**Machine Gate = 是否完整；Human Gate = 是否合理。**

### 9.3 其他阶段 Gate

- dev / test / converge gate：**无新增 machine check**
  （偏离记录的完整性与合理性属 review 语义检查；不为它加确定性机检，避免机检过度）
- `du-coverage` 现有检查保持不变

---

## 10. Review Impact（输出要求 5）

sdd-review 检查 2「设计一致性」扩展为 **Design → DU → Implementation Traceability**：

```
Workspace Design（§2 方案 / §4 契约）
        ↓ 检查 a
DU Implementation Sketch / Pseudocode（tasks.md + repo task.md）
        ↓ 检查 b
Actual Implementation（code-change 证据 + 源码抽查）
        ↓ 检查 c
Acceptance Criteria 满足
```

| 检查 | 内容 | 偏差处理 |
|------|------|---------|
| a. DU ↔ Design | Sketch/契约引用是否与 design.md 一致；Pseudocode 是否违背契约 | 记 review-finding（target: tasks.md#DU-XXX 或 design.md#section） |
| b. Implementation ↔ DU | 实际实现是否符合 DU spec；**不要求逐行匹配伪代码**，检查逻辑方向与组件职责 | 偏离无 Deviations 记录 → major；有记录且合理 → 通过 |
| c. AC 满足 | 偏离后是否仍满足 DU Acceptance 与 PRD AC | 不满足 → blocker |

补充规则：
- repo 侧 `implementation.md` 的 `## Deviations` 小节为检查 b 的输入；
  「偏离但未记录」直接记 major finding（target: implementation.md#Deviations）
- 知识沉淀联动：可复用的偏离理由（如「仓内已有反腐败层」）列入 §1.4 知识同步候选

---

## 11. 边界与禁止事项（需求 §十四，逐条落实）

| 禁止 | 落实方式 |
|------|---------|
| 把伪代码提前塞进 Workspace design.md | sdd-design 行为规则追加「不写实现级伪代码」；sdd-task 行为规则追加「不回写 design.md」 |
| 在 Design 阶段创建 DU | 沿袭 Phase 2.4 硬约束，不变 |
| 让伪代码成为真实代码事实源 | 语义固定：伪代码 = Expected Implementation；事实源 = 源代码 + implementation.md |
| 强制所有 DU 写复杂伪代码 | 条件必填机制（§4.2），简单 DU 走 N/A + 理由 |
| Machine Gate 做 AI 语义判断 | du-guidance 全部为确定性检查（存在性/非空/枚举/一致性） |
| 因伪代码存在就自动认为 Dev 完成 | DU 完成判定仍走 baseline/result commit + evidence + AC（Phase 2.4 机制，不变） |
| 合并 task.md 与 implementation.md | §6 职责固定表，模板分立 |

---

## 12. 实施清单（评审通过后执行，本文档阶段不实施）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `core/sdd/delivery-unit.js` | Workspace/Repo metadata 模板增 `implementation-guidance` 段（v0.2）；`REPO_TASK_TEMPLATE` 升级 9 节 + guidance 提示行；`REPO_IMPLEMENTATION_TEMPLATE` 增 `## Deviations` 固定小节；`writeWorkspaceDu` 接收 pseudocode/complexity |
| 2 | `templates/artifacts/du/workspace-metadata.yaml` / `repository-metadata.yaml` | 同步 v0.2 段（注释保留） |
| 3 | `templates/artifacts/tasks.md` | DU 小节骨架增 Sketch/Pseudocode/Verification 三字段 + 条件注释 |
| 4 | `cli/openspec/src/commands/du.js` | `create` 增 `--pseudocode` / `--complexity`；`show` 输出 guidance 段 |
| 5 | `core/sdd/gate-validator.js` | 新增 `du-guidance` 检查（tasks.md 小节解析 + metadata 联动校验） |
| 6 | `skills/sdd-task/gate.yaml` | machine-checks 增 `du-guidance` |
| 7 | `skills/sdd-task/SKILL.md` | §2 扩展为 Delivery Unit Specification 流程（§7.1）；自检/交互/行为规则追加 |
| 8 | `skills/sdd-design/SKILL.md` | 行为规则追加「不写实现级伪代码」 |
| 9 | `skills/sdd-dev/SKILL.md` | §1 消费 repo task.md 全 9 节；新增 Deviations 记录规则（§8） |
| 10 | `skills/sdd-review/SKILL.md` | 检查 2 扩展 Traceability（a/b/c）+ Deviations 输入 |
| 11 | `tests/`（新增 du-guidance.spec.js + 扩展 du/gate 既有用例） | metadata v0.2 / 条件伪代码 / sketch 非空 / N+A 理由 / trigger 枚举 / materialize 渲染 |
| 12 | `docs/complete-usage-guide.md` | §3.5 / §4.5 / §7.2 / §10.2 增量同步 |

---

## 13. 待用户决策点

| # | 问题 | 建议 |
|---|------|------|
| D-1 | Sketch 定位为「推荐存在」还是「必填」？需求 §五写「推荐存在」、§八又要求机检「非空」 | **按必填执行**（机检非空），与 §八 对齐；「推荐」理解为推荐尽早填写 |
| D-2 | Verification 是否纳入机检非空？ | **纳入**（轻量：允许一句话，如「默认测试流程」），理由：它是 sdd-test 的直接输入，空值会使 DU spec 不完整 |
| D-3 | `du create` 是否新增 `--pseudocode/--complexity` 参数？ | **新增**（metadata 声明式，符合「Contract 增加字段」；Agent 也可后补 yaml，机检以 metadata 为准） |
| D-4 | metadata 版本号处理 | DU metadata v0.1 → v0.2（Phase 2.5），旧 v0.1 文件缺段时 gate 报 issue 提示补段，不做自动迁移（量小，手工/AI 补齐即可） |

---

## 14. 评审清单

- [ ] DU v2 定义（§2.1）是否认可？
- [ ] metadata `implementation-guidance` 段设计（§4）是否认可？
- [ ] Pseudocode 条件必填的触发器四分类（§4.2）是否认可？
- [ ] repo task.md 9 节结构 + Agent 填写（不做自动复制）（§6）是否认可？
- [ ] Deviations 记录机制与「偏离不阻断、review 把关」（§8/§10）是否认可？
- [ ] `du-guidance` 机检范围（§9.1）是否过严/过松？
- [ ] §13 四个决策点的建议是否采纳？
