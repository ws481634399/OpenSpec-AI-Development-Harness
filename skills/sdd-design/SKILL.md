# sdd-design: 技术设计

> 阶段: design
> 状态转换: specified → designed
> 产出: design.md

## 前置条件
- Change 处于 `specified` 状态
- prd.md 已完成

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/prd.md`。

#### 1.1 信息提取清单

从 PRD 提取：
- 功能范围（Scope In/Out）→ 确定设计边界
- 验收标准 → 推导接口契约和测试点
- 业务规则 → 映射为数据约束和校验逻辑
- 目标用户 → 推断权限/角色设计

从 exploration.md 提取：
- 影响仓库 → 确定设计范围
- Feature 归属 → 理解在产品架构中的位置
- 未知问题（已在 PRD 解决的标注，未解决的需在此处理）

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

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{prd-source}}`：`<CHG>/prd.md`
- `{{from-state}}`：specified
- `{{to-state}}`：designed
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

**§3 仓库影响：**
```markdown
| 仓库 | 模块 | 文件数 | 变更类型 |
|------|------|--------|---------|
| main | auth/ | 3 | 新增 |
| main | models/ | 2 | 修改 |
```

**§4 数据变更：**

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

**§5 风险评估：**

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

**§6 待澄清问题：**
- 需用户确认的设计决策（如缓存策略、限流阈值）
- 需 PRD 补充的业务规则（如 PRD 未明确的边界 case）
- 需调查的技术可行性（如外部 API 是否可用）

### 4. 质量自检

产出前自检：
- [ ] 设计方案是否覆盖 PRD 全部 Scope In 项？
- [ ] 每个接口是否有明确的入参/出参/错误码？
- [ ] 数据模型是否覆盖 PRD 全部业务规则？
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

**design.md §5 风险评估节选：**
```
| 风险项 | 级别 | 缓解措施 |
|--------|------|---------|
| 密码明文泄露 | 高 | bcrypt 哈希，cost=10 |
| 并发重复注册 | 中 | email/phone UNIQUE 约束 + 事务 |
| 手机号格式多样 | 低 | 正则 + 地区码处理 |
```

## 行为规则
- 不修改 prd.md / requirement.md / exploration.md
- 不修改 standards/（只能引用）
- 不直接写 implementation/ 代码
- 产出草稿供用户确认，不直接推进状态
- 设计必须与现有架构风格一致，避免引入异构模式
- 接口设计必须有明确的入参/出参/错误码
