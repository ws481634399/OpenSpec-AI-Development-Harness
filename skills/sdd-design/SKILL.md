# sdd-design: 技术设计

> 阶段: design
> 状态转换: specified → designed
> 产出: design.md
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/design/persona-design.md

## 前置条件
- Change 处于 `specified` 状态
- spec.md 已完成

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/spec.md`。

#### 1.1 信息提取清单

从 spec 提取：
- 功能范围（Scope In/Out）→ 确定设计边界
- 验收标准（AC-NNN）→ 推导接口契约和测试点
- 业务规则 → 映射为数据约束和校验逻辑
- 目标用户 → 推断权限/角色设计

从 exploration.md 提取：
- 影响仓库 → 确定设计范围
- Feature 归属 → 理解在产品架构中的位置
- 未知问题（已在 spec 解决的标注，未解决的需在此处理）

### 2. 读取工程上下文

- `standards/` — 技术规范、架构约定、编码规范
- `implementation/` — 现有代码结构（如非空，需分析现有架构）
- `.sdd/repositories.yaml` — 仓库配置
- `product/` — 相关业务域知识

#### 2.1 现有架构分析方法

如 `implementation/` 已有代码：
1. **目录结构扫描** — 识别分层（controller/service/model）、模块划分
2. **入口文件分析** — 理解应用启动流程和路由注册
3. **配置文件分析** — 技术栈、依赖、环境配置
4. **核心模型分析** — 现有数据模型，判断是否可复用

**目的：** 新设计必须与现有架构风格一致，避免引入异构模式。

### 3. 生成技术设计草稿

读取模板 `templates/artifacts/design.md`，按结构填写。

front-matter（Phase 2.4 多仓）：
- `affected-repositories`：受影响仓库 id 列表（对应 `.sdd/repositories.yaml`）
  - 来源：exploration.md 影响分析 + metadata.repositories
  - 必须与 §3 分仓小节一致（task 阶段 `du-coverage` 机检输入）
- **DU 划分是 design 的产物**：§6 产出 DU 划分表（DU/仓库/covers AC/depends on），
  sdd-task 仅消费此表做逐 DU 任务分解，不再新造 DU（du-defined/du-dependency/du-source-of-truth 机检）

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{spec-source}}`：`<CHG>/spec.md`
- `{{repos-involved}}`：metadata.repositories 数组拼接
- `{{repo-impact-count}}`：metadata.repositories.length
- `{{need-migration}}`：初始化 `no`（Agent 分析后改）

#### 3.1 设计方法论

**§1 当前架构：**
- 现有代码结构（目录树，深度 ≤ 3）
- 技术栈（框架、ORM、中间件）
- 模块划分（分层方式、模块边界）
- 关键文件路径（作为设计依据）

**§2 提议方案（设计原则）：**

设计遵循以下原则：
- **单一职责** — 每个模块/类只做一件事
- **开闭原则** — 对扩展开放，对修改关闭
- **依赖倒置** — 高层模块不依赖低层模块，都依赖抽象
- **复用优先** — 优先复用现有模块，避免重复造轮子

方案描述格式：
```
### 新增模块
- 模块路径: auth/
- 职责: 用户注册、登录、认证
- 接口:
  - POST /api/register — 注册端点
    - 入参: { email, password }
    - 出参: { userId, token }
    - 错误: 400(参数无效) / 409(邮箱已存在)
```

**§3 仓库影响（分仓小节）：**

front-matter `affected-repositories` 必须与此处分仓清单一致。每个受影响仓库一个小节：

```markdown
### 3.1 backend
- 技术职责: 注册 API（校验 → 哈希 → 存储 → token 签发）
- 修改概要: 新增 auth/ 模块，修改 models/ 用户表
- 涉及模块: auth/, models/

### 3.2 frontend
- 技术职责: 注册表单 UI 与提交逻辑
- 修改概要: 新增注册页路由与表单组件
- 涉及模块: pages/register/
```

**§4 跨仓协作（多仓需求必填，单仓写"无"）：**

- **API Contract** — 仓间同步调用接口：路径/方法/入参/出参/错误码/版本策略
- **Event Contract** — 异步事件：topic、payload schema、投递语义（at-least-once 等）
- **Data Contract** — 共享数据归属：哪个仓拥有写权限，其他仓只读还是同步副本
- **Repository Dependencies** — 仓间依赖方向（如 frontend 依赖 backend API）
- **Integration Boundary** — 集成点清单（网关路径、SDK 版本、环境变量）
- **Cross-Repository Sequence** — 跨仓关键时序（谁先谁后、失败回滚策略）

示例：
```markdown
- 接口契约: frontend → backend `POST /api/auth/register`
  入参 { email|phone, password }，出参 { userId, token }，错误 400/409
- 仓库依赖: frontend 依赖 backend（启动顺序 backend → frontend 联调）
- 跨仓时序: backend API 契约冻结后，frontend 才能进入联调 DU
```

**§5 数据变更：**

判断是否需要 Migration：
- 新增表 → 生成 DDL
- 修改字段 → 生成 ALTER
- 新增字段 → 生成 ALTER + 默认值策略
- 无变更 → 标注 `no`

DDL/DML 概要格式：
```sql
-- Migration: add_user_table
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**§6 DU 划分（Delivery Units）：**

将设计方案拆成 Delivery Unit——每个 DU 是本次 Change 在一个具体仓库中的实施交付单元（DU 1:1 Repository，跨仓交付必须拆多个 DU）。DU 划分是 design 的产物，sdd-task 仅消费此表做逐 DU 任务分解。

DU 拆分三判据（同时满足）：
1. **单仓** — 一个 DU 只落一个仓库（跨仓交付拆多个 DU，不得合并）
2. **可独立红绿灯** — 能独立写出失败测试（不能独立验证的粒度需再切分或合并）
3. **依赖显式** — `depends on` 声明依赖的 DU id，且无环（du-dependency 机检）

DU id 规范：`DU-<REPO别名>-<nnn>`（如 DU-BE-001 / DU-FE-001），别名见 `.sdd/repositories.yaml` 的 alias（缺省取 id 前 2-4 字符大写）。

DU 划分表（写入 design.md §6 / story-design.md §5）：

```markdown
| DU        | 仓库     | 职责（实现哪些 DES）        | covers AC      | depends on |
| --------- | -------- | --------------------------- | -------------- | ---------- |
| DU-BE-001 | backend  | 实现注册 API（DES-001/002） | AC-001         | —          |
| DU-FE-001 | frontend | 注册页面（DES-003）         | AC-001, AC-002 | DU-BE-001  |
```

- `covers AC` 必须引用 spec.md / story-spec.md 中真实存在的 AC-NNN（每 DU 至少 1 个，du-defined 机检）
- `depends on` 为空写 `—`；有依赖填 DU id，多个用逗号分隔
- design 验收后用 `openspec du create` 登记 DU 框架（repository/scope/acceptance/dependencies/complexity）；
  tasked 态 sdd-task 补 tasks 路径。DU 登记时机前移到 design 是为了让 task 阶段只做任务分解

**领域化 Story 拆分判据**（多 Story Change，注入 story-splitting 指令）：

1. **领域边界优先** — Story 划在业务能力/子域边界上（feature-tree L3 即领域锚点），一个 Story 只落一个 L3 节点下的能力增量
2. **独立可验收** — 每个 Story 有独立 AC 集，AC 不得跨 Story 重复
3. **变更局部性** — 一个 Story 的 DU 尽量收敛在少数仓库（跨仓 Story 需在拆分时声明理由）
4. **1 需求 → N Story 是常态** — story-splitting 的默认检查不是「能否合成一个」，而是「按领域切分后每个是否独立可交付」

Story 拆分产出 metadata.stories[] 时，每 Story 条目填写 `domain:` 字段（L3 节点 id + 名；inline 单 Story 由 `bind-feature-path` 自动继承 L3）。机检 `story-domain-boundary`：缺 domain.id → fail（blocking）；多 Story 同 domain → 提示合并评估（advisory）。

**§7 风险评估：**

风险识别维度：
- **兼容性** — 是否影响现有 API/接口
- **性能** — 是否引入慢查询/大计算
- **安全** — 是否引入注入/XSS/越权风险
- **数据** — 是否有数据丢失/不一致风险
- **依赖** — 是否依赖外部服务/库

```markdown
| 风险项 | 级别 | 缓解措施 |
|--------|------|---------|
| 接口兼容性 | 中 | 版本化 API，保留旧端点 |
| 密码存储安全 | 高 | 使用 bcrypt，不存明文 |
| 重复注册并发 | 中 | 数据库唯一约束 + 事务 |
```

**§8 待澄清问题：**
- 需用户确认的设计决策（如缓存策略、限流阈值）
- 需 spec 补充的业务规则（如 spec 未明确的边界 case）
- 需调查的技术可行性（如外部 API 是否可用）

### 4. 质量自检

产出前自检：
- [ ] 设计方案是否覆盖 spec 全部 Scope In 项？
- [ ] 每个接口是否有明确的入参/出参/错误码？
- [ ] 数据模型是否覆盖 spec 全部业务规则？
- [ ] front-matter `affected-repositories` 是否与 §3 分仓小节一致（task 阶段 du-coverage 机检输入）？
- [ ] 多仓需求是否给出跨仓协作契约（API/Event/Data + 依赖方向 + 集成边界）？
- [ ] §6 DU 划分表是否产出？每个 DU 是否覆盖 ≥1 个 AC-NNN（du-defined 机检）？DU depends on 是否无环（du-dependency 机检）？
- [ ] 多 Story Change 是否按领域边界拆分？每 Story 是否填写 `domain`（story-domain-boundary 机检）？
- [ ] 风险评估是否包含兼容性/性能/安全维度？
- [ ] 设计是否与 standards/ 已有约定一致？
- [ ] 是否复用了可复用的现有模块（避免重复造轮子）？
- [ ] Migration（如需）是否考虑了向后兼容？

### 5. 用户交互

展示设计草稿时，主动确认：
- 接口设计是否符合预期？
- 数据模型是否合理？
- 风险缓解措施是否可接受？
- 待澄清问题是否需要现在决定？

写入 `delivery/changes/<CHG>/design.md`。

## 产出草稿
- `delivery/changes/<CHG>/design.md` — 技术设计文档

## 用户确认

展示 design.md 草稿给用户：
- 方案是否合理？
- 接口设计是否清晰？
- 风险是否可控？

确认后：
```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set designed
```

## 工作示例

> 完整示例参考: `templates/artifacts/examples/design.md`（含分层设计/接口定义/数据模型/Migration/风险评估）

**需求：** 用户注册（邮箱/手机号）

**design.md §2 提议方案节选：**
```
### 新增模块: auth/
职责: 用户注册、认证

接口设计:
- POST /api/auth/register
  入参: { email?: string, phone?: string, password: string }
  出参: { userId: string, token: string }
  校验: email 或 phone 至少一个；password 强度 ≥ 8
  错误: 400(参数无效) / 409(邮箱或手机已注册)

### 数据模型: User
- id: BIGINT PK
- email: VARCHAR(255) UNIQUE NULL
- phone: VARCHAR(20) UNIQUE NULL
- password_hash: VARCHAR(255) NOT NULL
- created_at: TIMESTAMP
约束: email 和 phone 不可同时为空
```

**design.md §6 风险评估节选：**
```
| 风险项 | 级别 | 缓解措施 |
|--------|------|---------|
| 密码明文泄露 | 高 | bcrypt 哈希，cost=10 |
| 并发重复注册 | 中 | email/phone UNIQUE 约束 + 事务 |
| 手机号格式多样 | 低 | 正则 + 地区码处理 |
```

## 行为规则

- 不修改 spec.md / requirement.md / exploration.md
- 不修改 standards/（只能引用）
- 不直接写 implementation/ 代码
- 产出 DU 划分表（§6）：DU/仓库/covers AC/depends on；design 验收后用 `openspec du create` 登记 DU 框架（sdd-task 仅消费此表做任务分解，不新造 DU）
- 不写实现级伪代码（Pseudocode / Implementation Sketch 是 sdd-task 在 DU 层产出的 Dev Guidance；design 只保留系统级方案 + DU 划分，Phase 2.5）
- front-matter affected-repositories 必须与 §3 分仓小节一致
- 多仓需求必须给出 §4 跨仓协作契约（单仓可写"无"）
- 设计必须与现有架构风格一致，避免引入异构模式
- 接口设计必须有明确的入参/出参/错误码

> 通用行为约束（产出草稿供用户确认 / 不直接推进状态等）见 prompts/common/constraints.md。
