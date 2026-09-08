---
change-id: "CHG-0001"
title: "用户注册任务分解"
design-source: "CHG-0001/design.md"
from-state: "designed"
to-state: "tasked"
du-count: 1
---

# 任务分解：用户注册

## 元信息

- Change: CHG-0001
- 设计来源: design.md（§5 DU 划分）
- 状态转换: designed → tasked
- DU 总数: 1

## Delivery Units

<!-- 引用 design.md §5 DU 划分表，对每个 DU 做逐 DU 任务分解。
     DU 行只引用不新造（du-source-of-truth 机检：design.md 已定义 DU-MAIN-001）。 -->

### DU-MAIN-001: 注册服务全栈（main）

- 目标仓库: main
- 目标 Goal: 实现注册 API（校验 → 哈希 → 存储 → token）+ 数据模型 + 测试
- Scope（范围）: models/user.js, repositories/user-repository.js, services/auth/register-service.js, utils/password.js, controllers/auth/register-controller.js, migrations/, tests/auth/
- Design References: design.md §2 提议方案 / §3 仓库影响 / §4 数据变更
- Dependencies（须与 design DU 划分表一致）: 无
- Acceptance Criteria（验收标准）: AC-001 ~ AC-007 全覆盖
- Execution Order（执行顺序）: 1
- Parallelization（可并行组，可空）: 无
- verifies（本 DU 对应验证用例，红绿灯对象；S3 test-design.md 落地）: TC-001, TC-002
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

#### 任务清单（DU-MAIN-001 内部，1 Commit 粒度）

| TASK   | 模块               | 变更摘要                                      | verifies | 依赖        |
| ------ | ------------------ | --------------------------------------------- | -------- | ----------- |
| TASK-001 | models/            | 新增 user.js（User model）                    | TC-001   | —           |
| TASK-002 | repositories/      | 新增 user-repository.js（CRUD）               | TC-001   | TASK-001    |
| TASK-003 | utils/             | 新增 password.js（hash/verify/strength）      | TC-002   | —           |
| TASK-004 | services/auth/     | 新增 register-service.js（注册业务逻辑）     | TC-001   | TASK-002, TASK-003 |
| TASK-005 | controllers/auth/  | 新增 register-controller.js + 改 router.js   | TC-001   | TASK-004    |
| TASK-006 | migrations/        | 新增 001_create_users_table.js               | TC-001   | TASK-001    |
| TASK-007 | tests/auth/        | 新增 register.spec.js（覆盖 AC-001~007）     | TC-001, TC-002 | TASK-005 |

## 依赖关系图

```
TASK-001 (User Model)
├── TASK-002 (Repository)
│   └── TASK-004 (Service)
│       └── TASK-005 (Controller)
│           └── TASK-007 (Tests)
└── TASK-006 (Migration)

TASK-003 (Password Utils)
└── TASK-004 (Service)
```

## 覆盖检查

### design.md 变更点覆盖

| 设计变更点 | 对应 Task | 状态 |
|-----------|----------|------|
| User 数据模型 | TASK-001 | ✓ |
| Repository（CRUD） | TASK-002 | ✓ |
| 密码哈希工具 | TASK-003 | ✓ |
| 注册服务逻辑 | TASK-004 | ✓ |
| HTTP 端点 | TASK-005 | ✓ |
| 数据库 Migration | TASK-006 | ✓ |
| 测试覆盖 | TASK-007 | ✓ |

### spec 验收标准覆盖

| AC | 对应 DU | 测试 Task | 测试用例 |
|----|---------|----------|---------|
| AC-001: 有效邮箱注册 | DU-MAIN-001 | TASK-007 | valid_email_register |
| AC-002: 有效手机号注册 | DU-MAIN-001 | TASK-007 | valid_phone_register |
| AC-003: 已注册邮箱 | DU-MAIN-001 | TASK-007 | duplicate_email |
| AC-004: 无效邮箱格式 | DU-MAIN-001 | TASK-007 | invalid_email_format |
| AC-005: 密码强度不足 | DU-MAIN-001 | TASK-007 | weak_password |
| AC-006: 邮箱手机都空 | DU-MAIN-001 | TASK-007 | missing_contact |
| AC-007: 密码含特殊字符 | DU-MAIN-001 | TASK-007 | password_with_special_chars |

### 风险缓解覆盖

| 风险 | 缓解 Task | 措施 |
|------|----------|------|
| 密码明文泄露 | TASK-003 | bcrypt 哈希 |
| 并发重复注册 | TASK-006 | UNIQUE 约束 |
| JWT Secret 泄露 | TASK-004 | 环境变量读取 |
| 注册接口被刷 | TASK-005 | 速率限制中间件 |
