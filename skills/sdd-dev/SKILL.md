# sdd-dev: 代码实现

> 阶段: dev
> 状态转换: tasked → developing
> 产出: implementation.md（跨仓汇总）+ 各仓 DU 实施（代码/task.md/evidence/）+ evidence/ 聚合
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/coding/persona-dev.md

Phase 2.4 多仓语义：实施正文在各仓 DU 内完成，Workspace 的 implementation.md
只做**跨仓汇总引用**（Reference do not duplicate）。

## 前置条件

- Change 处于 `tasked` 状态
- STORY 级 tasks.md 已完成（`<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md`）
- design.md 已完成（含 affected-repositories front-matter）
- Change 已绑定 feature-path（metadata.feature-path）
- Workspace DU 已注册（`openspec du create`）并已物化（`openspec du materialize <CHG> <DU-ID>`）到各仓

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/design.md`、STORY 级 `tasks.md` 和 DU metadata。

#### 1.1 信息提取清单

从 design.md 提取：

- 接口契约（入参/出参/错误码）→ 实现的接口规范
- **跨仓协作契约（§4）** → 本仓 DU 与其他仓 DU 的依赖方向与集成边界
- 数据模型 → Model/Entity 定义
- 架构约定 → 分层结构、模块边界
- 风险缓解措施 → 实现时必须遵守的约束

从 STORY 级 tasks.md 提取：

- **本仓 DU 的 Goal / Scope / Design References / Acceptance Criteria** → 本仓实施边界
- DU Dependencies → 跨仓 DU 的执行顺序（被依赖仓先完成契约冻结）
- Execution Order / Parallelization → 并行安排

从 DU metadata（各仓 `implementation/<repo>/delivery/.../DU-XXX/metadata.yaml`）提取：

- scope（交付范围）→ 要写/改的文件与模块
- acceptance（验收标准）→ 自测标准
- baseline（基线 commit）→ 变更起点
- implementation-guidance（Phase 2.5）→ 本 DU 是否要求 Pseudocode（pseudocode/complexity-trigger）

从 repo 侧 task.md（各仓 DU 目录内，materialize 生成）提取（Phase 2.5）：

- §7 Implementation Sketch → 推荐组件与调用关系（实施的结构基线）
- §8 Pseudocode → 关键流程执行逻辑（逻辑基线；`N/A` 则跳过）
- §9 Verification → 自测清单（每个 Task 自测 + DU 完成前逐项验证）

> 实施前先读 repo task.md §7/§8/§9，不读则视为未消费 DU Guidance。

从 standards/ 提取：

- 编码规范 → 命名、格式、注释
- 架构约定 → 分层规则、依赖方向
- 测试约定 → 测试框架、命名规则

### 2. 按 DU 在各仓实施代码

进入各仓工作目录 `implementation/<repo>/`，按 DU 的 Scope 写代码。
每个 DU 独立执行：本仓 DU 完成后同步状态，再执行依赖它的其他仓 DU。

#### 2.1 实现策略

**按依赖顺序执行（跨仓视角）：**

1. 被依赖的仓先完成契约（如 backend API 冻结）
2. 数据层（Model/Entity/Migration）
3. 工具层（utils/ helpers/）
4. 服务层（service/ domain/）
5. 接口层（controller/ route/ handler）
6. 测试层（tests/ __tests__/ spec/）

**每个 DU 内按 Task 执行：**

1. 读取 repo 侧 task.md 全 9 节（Goal / Scope / Design References / Dependencies / AC / Sketch / Pseudocode / Verification）和 design.md 对应设计
2. 在该仓内确认目标文件路径和模块
3. 写代码（遵循该仓 standards/ 编码规范；结构参照 §7 Sketch，流程参照 §8 Pseudocode）
4. 自测（按 DU acceptance 与 task.md §9 Verification 清单）
5. Commit（一个 Task 一个 Commit，在该仓的 Git 中提交）

#### 2.2 偏离记录（Deviations，Phase 2.5）

Pseudocode / Sketch 是 **Expected Implementation**，不是强制代码翻译模板。
Dev 可按仓内真实情况调整，但**明显偏离时必须在 repo 侧 `implementation.md` 的 `## Deviations` 固定小节记录**：

```markdown
## Deviations

### DEV-1
- 原 DU 建议: RiskClient 同步调用风控接口
- 实际实现: 复用仓内现有 RiskGateway（反腐败层）
- 原因: Repository 已有统一 Anti-Corruption Layer，避免重复建设
- 影响评估: 不改变对外契约，AC 全覆盖
```

规则：

- 无偏离时 `## Deviations` 写「无」
- 偏离记录三要素缺一不可：**原 DU 建议 / 实际实现 / 原因**（建议附影响评估）
- 偏离**不阻断** dev 状态推进；合理性由 sdd-review 检查（Design → DU → Implementation Traceability）
- 禁止为「匹配伪代码」而写坏代码

**Commit 规范：**

```
<type>(<scope>): <description>

[可选 body: 详细说明]

DU: DU-XXX-NNN
Task: TASK-NNN
```

- type: feat / fix / refactor / test / docs
- scope: 模块名（如 auth, models）
- description: 简短描述

示例：

```
feat(auth): 实现用户注册端点

- 新增 POST /api/auth/register
- 入参校验（email/phone 至少一个，password 强度）
- 返回 userId + token

DU: DU-BE-001
Task: TASK-003
```

#### 2.2 代码质量要求

**命名规范：**

- 遵循 standards/ 中的命名约定
- 函数名用动词（getUser, validateEmail）
- 布尔值用 is/has/can 前缀（isValid, hasPermission）

**错误处理：**

- 所有外部输入必须校验（参数、请求体、环境变量）
- 错误消息面向用户友好，不泄露技术细节
- 异步操作必须 catch，不允许 unhandled rejection
- 错误分类：参数错误(400) / 未认证(401) / 无权限(403) / 不存在(404) / 冲突(409) / 服务器错误(500)

**安全实践：**

- 密码用 bcrypt 哈希，不存明文
- SQL 用参数化查询，不拼接字符串
- 输出转义防 XSS
- 敏感配置从环境变量读取

**代码注释：**

- 只在"为什么"非显而易见时写注释
- 不解释代码做什么（好命名已经说明）
- 记录约束、不变量、workaround

### 3. 记录实施证据（DU 级 + Workspace 聚合）

**DU 级证据**写入该仓 DU 目录
`implementation/<repo>/delivery/<L1>/<L2>/<L3>/<STORY>/<CHG>/<DU-XXX>/evidence/`：

#### 3.1 evidence/evidence.yaml

每个 Commit 追加一条 `code-change` 记录（含 symbol / delivery-unit / evidence-ref 字段）：

```yaml
evidence:
  - id: EV-CODE-001
    type: code-change
    delivery-unit: DU-BE-001
    symbol: auth/register.js#registerUser
    commit: a1b2c3d
    evidence-ref: changeset.md#DU-BE-001
    created-at: "2026-01-01T00:00:00Z"
```

#### 3.2 evidence/changeset.md（DU 级）

本 DU 修改的文件清单表格：

```markdown
| 仓库    | 模块    | 文件        | 变更类型 | 行数变化 |
| ------- | ------- | ----------- | -------- | -------- |
| backend | auth/   | register.js | 新增     | +85      |
| backend | models/ | User.js     | 新增     | +30      |
```

#### 3.3 evidence/commits.md（DU 级）

```markdown
| Commit  | Task     | 消息                              | 文件数 |
| ------- | -------- | --------------------------------- | ------ |
| a1b2c3d | TASK-001 | feat(models): add User model      | 1      |
| e4f5g6h | TASK-002 | feat(utils): add password hash    | 1      |
| i7j8k9l | TASK-003 | feat(auth): add register endpoint | 3      |
```

#### 3.4 状态回传 Workspace

该仓 DU 完成（或阶段性完成）后，把 baseline/result commit 同步回 Workspace DU：

```bash
openspec du sync-status <CHG> <DU-ID>
```

### 4. 写 implementation.md（跨仓汇总）

读取模板 `templates/artifacts/implementation.md`，按结构填写。
位置：`delivery/changes/<CHG>/implementation.md`（Workspace 级，**只引用不复制**各仓 DU 正文）。

元信息 section（占位符替换）：

- `{{change-id}}`：Change ID
- `{{tasks-source}}`：STORY 级 tasks.md 相对路径（`<L1>/<L2>/<L3>/<STORY>/tasks.md`）
- `{{started-at}}`：ISO8601 时间戳
- `{{primary-repo}}`：metadata.repositories[0]

非结构化段落（Reference do not duplicate）：

- §1 Delivery Unit 状态总览表（每个 DU 一行：仓库/状态/baseline/result）
- §2 各仓实施引用（每仓一节，引用该仓 DU 的 implementation.md 相对路径）
- §3 Commit 记录（跨仓聚合，每个 Commit 标注所属 DU）
- §4 Fan-in 状态 checklist（du-materialized / du-fan-in-testing / du-fan-in-complete）

### 5. 质量自检

产出前自检：

- [ ] tasks.md 中每个仓是否至少有一个 DU 已物化并实施（du-materialized）？
- [ ] 每个 DU 的实施是否限定在其 Scope 内，未越仓改动？
- [ ] 实施前是否已读 repo task.md §7/§8/§9（消费 DU Guidance，Phase 2.5）？
- [ ] 与 DU 建议（Sketch/Pseudocode）偏离时是否已记录到 repo implementation.md `## Deviations`（三要素齐全）？
- [ ] 每个 DU 是否已按 task.md §9 Verification 清单逐项验证？
- [ ] 代码是否遵循 design.md 的接口契约与跨仓协作契约？
- [ ] 代码是否遵循该仓 standards/ 编码规范？
- [ ] 每个 Commit 是否对应一个 Task 并标注 DU？
- [ ] DU 级 evidence/evidence.yaml 是否与 Workspace 聚合记录一致？
- [ ] DU baseline/result 是否已通过 `openspec du sync-status` 回传？
- [ ] 未完成的 Task 是否有明确的阻塞原因？
- [ ] 是否有未 catch 的异步错误？
- [ ] 是否有硬编码的敏感信息（密码、密钥）？

### 6. 用户交互

展示代码变更和 implementation.md 给用户：

- 代码是否符合设计？
- 是否遵循编码规范？
- Task 完成情况是否如实记录？
- 未完成 Task 的阻塞原因是否需要用户协助？

写入 `delivery/changes/<CHG>/implementation.md`。

## 产出草稿

- `implementation/<repo>/` — 各仓实际代码（在该仓 Git 中提交）
- `implementation/<repo>/delivery/<...>/DU-XXX/` — 各仓 DU 正文（task.md/implementation.md/evidence/）
- `delivery/changes/<CHG>/implementation.md` — 跨仓实施汇总（引用）
- `delivery/changes/<CHG>/evidence/` — Workspace 级聚合证据

## 用户确认

展示代码变更和 implementation.md 给用户：

- 代码是否符合设计？
- 是否遵循编码规范？
- Task 完成情况是否如实记录？

确认后：

```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set developing
```

## 工作示例

> 完整示例参考: `templates/artifacts/examples/implementation.md`（含 Commit 记录/文件清单/实现状态）

**TASK-003: 注册端点实现**

```javascript
// controllers/auth/register.js
import { registerUser } from "../../services/auth/register.js";

export async function register(req, res) {
  const { email, phone, password } = req.body;

  // 参数校验：email 或 phone 至少一个
  if (!email && !phone) {
    return res.status(400).json({ error: "email 或 phone 至少提供一项" });
  }

  // 密码强度
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "密码长度至少 8 位" });
  }

  try {
    const result = await registerUser({ email, phone, password });
    return res.status(201).json(result);
  } catch (err) {
    if (err.code === "DUPLICATE") {
      return res.status(409).json({ error: "邮箱或手机号已注册" });
    }
    return res.status(500).json({ error: "注册失败" });
  }
}
```

**implementation.md §1 DU 状态总览节选：**

```
| DU         | 仓库    | 状态       | Baseline | Result |
| ---------- | ------- | ---------- | -------- | ------ |
| DU-BE-001  | backend | completed  | f0e1d2c  | a1b2c3d |
| DU-FE-001  | frontend| developing | 9876543  |        |
```

## 行为规则

- 不修改 design.md / tasks.md / prd.md
- 实施严格限定在 DU 的 Scope 与所属仓库内，不越仓改动
- 实施前先读 repo task.md §7/§8/§9，不默默改道；偏离必须记录 Deviations，不为匹配伪代码写坏代码（Phase 2.5）
- Workspace implementation.md 只引用各仓 DU 正文，不复制（Reference do not duplicate）
- DU baseline/result 变化必须通过 `openspec du sync-status` 回传，不手改 metadata
- 一个 Task 一个 Commit，不混合多个 Task
- 未完成的 Task 必须记录阻塞原因，不默默跳过
- 代码必须遵循该仓 standards/ 编码规范

> 通用行为约束（产出草稿供用户确认 / 不修改 product/ 或 standards/ 等）见 prompts/common/constraints.md。
