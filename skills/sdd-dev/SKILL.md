# sdd-dev: 代码实现

> 阶段: dev
> 状态转换: tasked → developing
> 产出: implementation.md + implementation/ 代码 + evidence/ 证据

## 前置条件

- Change 处于 `tasked` 状态
- design.md 和 tasks.md 已完成

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/design.md` 和 `tasks.md`。

#### 1.1 信息提取清单

从 design.md 提取：

- 接口契约（入参/出参/错误码）→ 实现的接口规范
- 数据模型 → Model/Entity 定义
- 架构约定 → 分层结构、模块边界
- 风险缓解措施 → 实现时必须遵守的约束

从 tasks.md 提取：

- 任务清单和依赖顺序 → 确定实现顺序
- 每个 Task 的预期变更 → 确定要写/改的文件
- 验证方法 → 确定自测标准

从 standards/ 提取：

- 编码规范 → 命名、格式、注释
- 架构约定 → 分层规则、依赖方向
- 测试约定 → 测试框架、命名规则

### 2. 按任务清单实现代码

按 tasks.md 中的 TASK-NNN 顺序（遵循依赖关系），在 `implementation/` 目录下写代码。

#### 2.1 实现策略

**按依赖顺序执行：**

1. 数据层（Model/Entity/Migration）
2. 工具层（utils/ helpers/）
3. 服务层（service/ domain/）
4. 接口层（controller/ route/ handler）
5. 测试层（tests/ **tests**/ spec/）

**每个 Task 的实现流程：**

1. 读取 Task 描述和 design.md 中的对应设计
2. 确认目标文件路径和模块
3. 写代码（遵循 standards/ 编码规范）
4. 自测（按 Task 的验证方法）
5. Commit（一个 Task 一个 Commit）

**Commit 规范：**

```
<type>(<scope>): <description>

[可选 body: 详细说明]

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

### 3. 记录实施证据

在 `delivery/changes/<CHG>/evidence/` 下记录：

#### 3.1 evidence/changeset.md

修改的文件清单表格：

```markdown
| 仓库 | 模块    | 文件        | 变更类型 | 行数变化 |
| ---- | ------- | ----------- | -------- | -------- |
| main | auth/   | register.js | 新增     | +85      |
| main | auth/   | router.js   | 修改     | +12/-3   |
| main | models/ | User.js     | 新增     | +30      |
```

#### 3.2 evidence/commits.md

Commit 记录表格：

```markdown
| Commit  | Task     | 消息                              | 文件数 |
| ------- | -------- | --------------------------------- | ------ |
| a1b2c3d | TASK-001 | feat(models): add User model      | 1      |
| e4f5g6h | TASK-002 | feat(utils): add password hash    | 1      |
| i7j8k9l | TASK-003 | feat(auth): add register endpoint | 3      |
```

### 4. 写 implementation.md

读取模板 `templates/artifacts/implementation.md`，按结构填写。

元信息 section（占位符替换）：

- `{{change-id}}`：Change ID
- `{{tasks-source}}`：`<CHG>/tasks.md`
- `{{from-state}}`：tasked
- `{{to-state}}`：developing
- `{{started-at}}`：ISO8601 时间戳
- `{{primary-repo}}`：metadata.repositories[0]

非结构化段落：

- §1 修改仓库表格（引用 evidence/changeset.md）
- §2 Commit 记录（引用 evidence/commits.md）
- §3 实现状态 checklist：

```markdown
- [x] TASK-001: User model — 已完成
- [x] TASK-002: 密码哈希工具 — 已完成
- [x] TASK-003: 注册端点 — 已完成
- [ ] TASK-004: 注册测试 — 阻塞（等待测试框架配置）
```

- §4 未完成原因说明（如有阻塞的 Task）

### 5. 质量自检

产出前自检：

- [ ] tasks.md 中的每个 Task 是否都有对应实现？
- [ ] 代码是否遵循 design.md 的接口契约？
- [ ] 代码是否遵循 standards/ 编码规范？
- [ ] 每个 Commit 是否对应一个 Task？
- [ ] 未完成的 Task 是否有明确的阻塞原因？
- [ ] 是否有未 catch 的异步错误？
- [ ] 是否有硬编码的敏感信息（密码、密钥）？
- [ ] evidence/ 下的文件清单是否与实际修改一致？

### 6. 用户交互

展示代码变更和 implementation.md 给用户：

- 代码是否符合设计？
- 是否遵循编码规范？
- Task 完成情况是否如实记录？
- 未完成 Task 的阻塞原因是否需要用户协助？

写入 `delivery/changes/<CHG>/implementation.md`。

## 产出草稿

- `implementation/` — 实际代码
- `delivery/changes/<CHG>/implementation.md` — 修改轨迹
- `delivery/changes/<CHG>/evidence/` — 实施证据

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

**implementation.md §3 实现状态节选：**

```
- [x] TASK-001: User model — 已完成 (commit: a1b2c3d)
- [x] TASK-002: 密码哈希 — 已完成 (commit: e4f5g6h)
- [x] TASK-003: 注册端点 — 已完成 (commit: i7j8k9l)
- [x] TASK-004: 注册测试 — 已完成 (commit: m0n1o2p)
```

## 行为规则

- 不修改 design.md / tasks.md / prd.md
- 不修改 product/ 或 standards/（知识沉淀在 sdd-converge）
- 产出草稿供用户确认，不直接推进状态
- 一个 Task 一个 Commit，不混合多个 Task
- 未完成的 Task 必须记录阻塞原因，不默默跳过
- 代码必须遵循 standards/ 编码规范
