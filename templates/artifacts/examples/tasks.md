---
change-id: "CHG-0001"
title: "用户注册任务分解"
design-source: "CHG-0001/design.md"
from-state: "designed"
to-state: "tasked"
task-count: 7
---

# 任务分解：用户注册

## 元信息

- Change: CHG-0001
- 设计来源: design.md
- 状态转换: designed → tasked
- 任务总数: 7

## 任务清单

### TASK-001: 创建 User 数据模型

- 目标仓库: main
- 目标模块: models/
- 预期变更: 新增 user.js，定义 User model（id/email/phone/passwordHash/status/createdAt）
- 验证方法: model 字段断言 + UNIQUE 约束检查
- 依赖: 无
- 预估变更: ~35 行

### TASK-002: 实现 User Repository

- 目标仓库: main
- 目标模块: repositories/
- 预期变更: 新增 user-repository.js（findById/findByEmail/findByPhone/save）
- 验证方法: mock Sequelize，断言调用参数
- 依赖: TASK-001
- 预估变更: ~40 行

### TASK-003: 实现密码哈希工具

- 目标仓库: main
- 目标模块: utils/
- 预期变更: 新增 password.js（hashPassword/verifyPassword/validatePasswordStrength）
- 验证方法: hash → compare 往返测试 + 强度校验各 case
- 依赖: 无
- 预估变更: ~30 行

### TASK-004: 实现注册服务

- 目标仓库: main
- 目标模块: services/auth/
- 预期变更: 新增 register-service.js（校验 → 查重 → 哈希 → 存储 → 生成 Token）
- 验证方法: mock repository + mock password，单元测试（正常/重复/弱密码/缺参）
- 依赖: TASK-002, TASK-003
- 预估变更: ~80 行

### TASK-005: 实现注册端点

- 目标仓库: main
- 目标模块: controllers/auth/
- 预期变更: 新增 register-controller.js + 修改 router.js
- 验证方法: 集成测试（POST /api/auth/register，覆盖 AC-1 ~ AC-7）
- 依赖: TASK-004
- 预估变更: ~50 行

### TASK-006: 数据库 Migration

- 目标仓库: main
- 目标模块: migrations/
- 预期变更: 新增 001_create_users_table.js
- 验证方法: 迁移测试（建表 + UNIQUE 约束 + CHECK 约束）
- 依赖: TASK-001
- 预估变更: ~20 行

### TASK-007: 注册接口单元测试

- 目标仓库: main
- 目标模块: tests/auth/
- 预期变更: 新增 register.spec.js（覆盖 AC-1 ~ AC-7 + 边界 case）
- 验证方法: npm test 全绿
- 依赖: TASK-005
- 预估变更: ~120 行

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

### PRD 验收标准覆盖

| AC | 测试 Task | 测试用例 |
|----|----------|---------|
| AC-1: 有效邮箱注册 | TASK-007 | valid_email_register |
| AC-2: 有效手机号注册 | TASK-007 | valid_phone_register |
| AC-3: 已注册邮箱 | TASK-007 | duplicate_email |
| AC-4: 无效邮箱格式 | TASK-007 | invalid_email_format |
| AC-5: 密码强度不足 | TASK-007 | weak_password |
| AC-6: 邮箱手机都空 | TASK-007 | missing_contact |
| AC-7: 密码含特殊字符 | TASK-007 | password_with_special_chars |

### 风险缓解覆盖

| 风险 | 缓解 Task | 措施 |
|------|----------|------|
| 密码明文泄露 | TASK-003 | bcrypt 哈希 |
| 并发重复注册 | TASK-006 | UNIQUE 约束 |
| JWT Secret 泄露 | TASK-004 | 环境变量读取 |
| 注册接口被刷 | TASK-005 | 速率限制中间件 |
