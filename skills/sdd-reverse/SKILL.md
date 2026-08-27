# sdd-reverse: 知识逆向

> 阶段: reverse
> 不进 7 状态生命周期（辅助 Skill，旧项目接入）
> 产出: instruction.md + reverse-report.md + standards/ 和 product/ 知识草稿

## 前置条件
- Workspace 已初始化（`openspec init` 已执行，选择 brownfield 模式）
- `implementation/` 目录有现有代码

## 执行步骤

### 1. 扫描 implementation/

遍历 `implementation/` 目录树：
- 跳过 `.git` / `node_modules` / `target` / `build` / `dist`
- 按文件扩展名推断语言/技术栈
- 检测框架标记文件
- 识别核心目录结构

#### 1.1 扫描方法论

**扫描优先级**（按重要性排序）：

1. **框架配置** — `package.json` / `pom.xml` / `go.mod` / `Cargo.toml` / `build.gradle`
   - 提取：技术栈、依赖列表、版本、scripts
   - 判断：前后端分离？单体？微服务？

2. **入口文件** — `main.*` / `index.*` / `app.*` / `server.*`
   - 提取：应用启动流程、中间件链、路由注册
   - 判断：MVC？DDD？分层架构？

3. **路由/控制器** — `routes/` / `controllers/` / `handlers/` / `routers/`
   - 提取：全部 API 端点、请求方法、路径
   - 判断：业务入口点、对外暴露的能力

4. **数据模型** — `models/` / `entities/` / `domain/` / `schemas/`
   - 提取：核心实体、字段、关系
   - 判断：数据模型设计、业务域划分

5. **配置文件** — `config/` / `.env.example` / `docker-compose.yml`
   - 提取：环境变量、服务依赖、部署配置
   - 判断：基础设施依赖

6. **测试目录** — `tests/` / `__tests__/` / `spec/`
   - 提取：测试框架、测试覆盖范围
   - 判断：测试策略

#### 1.2 代码分析策略

**目录结构 → 架构推断：**
```
src/
├── controllers/   → 接口层（API 入口）
├── services/      → 服务层（业务逻辑）
├── models/        → 数据层（实体定义）
├── utils/         → 工具层（辅助函数）
└── config/        → 配置层
```
→ 推断：分层架构，controller → service → model

**路由 → 业务能力推断：**
```
POST /api/auth/register  → 用户认证域 → 注册能力
POST /api/auth/login     → 用户认证域 → 登录能力
GET  /api/orders         → 订单域 → 订单查询能力
POST /api/orders         → 订单域 → 订单创建能力
```
→ 推断：两个业务域（用户认证、订单），四个业务能力

**模型 → 数据结构推断：**
```
User { id, email, phone, password_hash, created_at }
Order { id, user_id, status, total, created_at }
```
→ 推断：用户实体、订单实体，一对多关系

### 2. 创建 reverse Change

```bash
openspec change create --title "Knowledge Reverse — 旧项目接入" --requirement REVERSE
```

记录返回的 CHG-XXXX。

### 3. 生成 Feature Tree（调用 sdd-feature-tree）

读取 `skills/sdd-feature-tree/SKILL.md` 并执行。

#### 3.1 Feature 推断方法

**从路由到 Feature Tree 的映射策略：**
1. 聚类路由（按路径前缀）→ Module 候选
2. 聚类路由（按资源操作）→ Feature 候选
3. 单个路由 → Story 候选

**示例：**
```
路由聚类：
  /api/auth/register + /api/auth/login → Module "用户中心" → Feature "用户认证"
  /api/orders (GET/POST) + /api/orders/:id → Module "订单中心" → Feature "订单管理"

Feature Tree 草稿：
  Product
  ├── Module: 用户中心 (MOD-1)
  │   └── Feature: 用户认证 (FEAT-1)
  │       ├── Story: 用户注册 (STORY-1)
  │       └── Story: 用户登录 (STORY-2)
  └── Module: 订单中心 (MOD-2)
      └── Feature: 订单管理 (FEAT-2)
          ├── Story: 创建订单 (STORY-3)
          └── Story: 查询订单 (STORY-4)
```

**用户确认：** Feature Tree 草稿展示给用户，确认业务域划分是否合理。

### 4. 写 instruction.md

读取模板 `templates/artifacts/instruction.md`，按结构填写。

占位符替换：
- `{{change-id}}`：Change ID
- `{{scanned-at}}`：ISO8601 时间戳
- `{{language-stats}}`：语言统计（如 JS: 120 files, CSS: 15 files）
- `{{framework-files}}`：框架标记文件列表
- `{{directory-tree}}`：核心目录树（深度 ≤ 3）
- `{{file-count}}`：文件总数

写入 `delivery/changes/<CHG>/instruction.md`。

### 5. 提取知识草稿

#### 5.1 技术规则提取策略

**编码规范推断：**
- 命名风格：camelCase / snake_case / PascalCase（从代码扫描）
- 文件命名：kebab-case / camelCase / snake_case
- 模块组织：by-feature / by-layer / by-type
- 错误处理：try-catch / Result 类型 / 异常类

**架构决策推断：**
- 分层方式：MVC / DDD / Clean Architecture / 六边形
- 依赖注入：构造函数 / 属性 / 容器
- API 风格：RESTful / GraphQL / RPC
- 数据访问：ORM / 原生 SQL / Repository 模式

**技术选型记录：**
- 框架 + 版本（从配置文件提取）
- ORM + 版本
- 测试框架 + 版本
- 中间件（消息队列、缓存、搜索引擎）

#### 5.2 业务能力提取策略

**业务域划分（从目录结构）：**
- 顶层模块 → Module 候选
- 子模块 → Feature 候选
- 具体功能文件 → Story 候选

**核心能力识别（从路由/控制器）：**
- CRUD 操作 → 对应 Story
- 业务流程（多步骤操作）→ 对应 Feature
- 对外暴露的 API → 产品能力清单

### 6. 知识沉淀（调用 sdd-knowledge 能力 A + C）

读取 `skills/sdd-knowledge/SKILL.md`：
- 执行「能力 A」将知识草稿写入 `standards/` 和 `product/`
- 执行「能力 C」重建索引

### 7. 写 reverse-report.md

读取模板 `templates/artifacts/reverse-report.md`，按结构填写。

内容包含：
- 扫描结果摘要（语言、框架、目录结构）
- 提取的技术规则清单（写入 standards/ 的文件和内容摘要）
- 提取的业务能力清单（写入 product/ 的文件和内容摘要）
- Feature Tree 生成结果（新增节点清单）
- 遗留问题（需人工确认的判断）

写入 `delivery/changes/<CHG>/reverse-report.md`。

### 8. 质量自检

产出前自检：
- [ ] 扫描是否覆盖了 6 级优先级全部目录（如存在）？
- [ ] 技术栈判断是否有配置文件证据？
- [ ] 业务域划分是否与目录结构/路由一致？
- [ ] Feature Tree 是否覆盖了全部识别的业务能力？
- [ ] standards 草稿是否包含编码规范 + 架构决策 + 技术选型？
- [ ] product 草稿是否包含业务域 + 核心能力？
- [ ] 遗留问题是否明确列出（如不确定的架构判断）？

## 产出草稿
- `delivery/changes/<CHG>/instruction.md` — 知识提取指令
- `delivery/changes/<CHG>/reverse-report.md` — 知识提取报告
- `standards/<category>.md` — 技术规则草稿
- `product/<domain>.md` — 产品知识草稿
- `standards/INDEX.md` / `product/INDEX.md` — 索引

## 用户确认

展示知识草稿给用户：
- 技术规则提取是否准确？
- 业务能力划分是否合理？
- Feature Tree 是否反映产品结构？

确认后：
```bash
openspec change archive <CHG>
```

## 工作示例

**扫描结果：**
```
技术栈: Node.js + Express + Sequelize ORM
目录: controllers/ services/ models/ utils/
路由: POST /api/auth/register, POST /api/auth/login, GET /api/orders, POST /api/orders
模型: User { id, email, phone, password_hash }, Order { id, user_id, status, total }
```

**推断的 Feature Tree：**
```
Product: 在线商城
├── Module: 用户中心 (MOD-1)
│   └── Feature: 用户认证 (FEAT-1)
│       ├── Story: 用户注册 (STORY-1) — delivered
│       └── Story: 用户登录 (STORY-2) — delivered
└── Module: 订单中心 (MOD-2)
    └── Feature: 订单管理 (FEAT-2)
        ├── Story: 创建订单 (STORY-3) — delivered
        └── Story: 查询订单 (STORY-4) — delivered
```

**提取的 standards 草稿：**
```markdown
# 架构约定
- 分层: Controller → Service → Model
- API: RESTful, JSON 响应
- ORM: Sequelize (MySQL)
- 命名: camelCase 函数, PascalCase Model, kebab-case 文件
```

**提取的 product 草稿：**
```markdown
# 用户中心
## 用户认证
- 用户注册: 邮箱/手机号 + 密码
- 用户登录: 邮箱/手机号 + 密码

# 订单中心
## 订单管理
- 创建订单: 包含商品列表 + 数量
- 查询订单: 支持列表 + 详情
```

## 行为规则
- 不推进 7 状态生命周期
- 不修改 implementation/ 代码
- 知识写入通过 sdd-knowledge 执行
- 产出草稿供用户确认
- 业务域划分必须基于代码证据（目录结构/路由），不猜测
- 遗留问题必须明确列出，不默默跳过
