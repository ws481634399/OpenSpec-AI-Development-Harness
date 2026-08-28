---
change-id: "CHG-0001"
title: "用户注册技术设计"
prd-source: "CHG-0001/prd.md"
from-state: "specified"
to-state: "designed"
repos-involved: "main"
repo-impact-count: 1
need-migration: "yes"
---

# 技术设计：用户注册

## §1 当前架构

### 技术栈

- 运行时：Node.js ≥ 20
- 框架：Express 4.x
- ORM：Sequelize 6.x（MySQL 8.0）
- 测试：node:test + node:assert

### 目录结构

```
src/
├── controllers/    # 接口层
├── services/       # 服务层
├── repositories/   # 数据层
├── models/         # 模型定义
├── utils/          # 工具函数
├── config/         # 配置
└── tests/          # 测试
```

### 现有认证

当前无认证模块，本次新增。

参考 `standards/architecture-principles.md`：遵循分层架构 Controller → Service → Repository → Model。

## §2 提议方案

### 新增模块

| 模块路径 | 职责 |
|---------|------|
| `models/user.js` | User 实体定义 |
| `repositories/user-repository.js` | 数据访问 |
| `services/auth/register-service.js` | 注册业务逻辑 |
| `utils/password.js` | 密码哈希工具 |
| `controllers/auth/register-controller.js` | HTTP 端点 |

### 接口设计

```
POST /api/auth/register
```

**入参：**
```json
{
  "email": "string (可选，与 phone 至少一个)",
  "phone": "string (可选，与 email 至少一个)",
  "password": "string (必填，≥8 位，含大小写+数字)"
}
```

**成功响应（201）：**
```json
{
  "userId": "usr_abc123",
  "token": "eyJhbG..."
}
```

**错误响应：**
```json
{
  "error": "邮箱已注册",
  "code": "EMAIL_DUPLICATE"
}
```

错误码：

| HTTP | code | 场景 |
|------|------|------|
| 400 | MISSING_CONTACT | email 和 phone 都为空 |
| 400 | INVALID_EMAIL | 邮箱格式无效 |
| 400 | INVALID_PHONE | 手机号格式无效 |
| 400 | WEAK_PASSWORD | 密码强度不足 |
| 409 | EMAIL_DUPLICATE | 邮箱已注册 |
| 409 | PHONE_DUPLICATE | 手机号已注册 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

### 数据模型

```javascript
// models/user.js
const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  email: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: true,
    validate: { isEmail: true },
  },
  phone: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: true,
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended'),
    defaultValue: 'active',
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'users',
  indexes: [
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['phone'] },
  ],
});
```

约束：email 和 phone 不可同时为 NULL（应用层校验）。

### 密码哈希工具

```javascript
// utils/password.js
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordStrength(password) {
  if (password.length < 8 || password.length > 128) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}
```

### 注册服务流程

```
POST /api/auth/register
  → Controller: 参数校验
    → Service: 检查唯一性
      → Repository: findByEmail / findByPhone
    → Service: 哈希密码 + 创建用户
      → Repository: save
    → Service: 生成 JWT
  → Controller: 返回 201 + { userId, token }
```

## §3 仓库影响

| 仓库 | 模块 | 文件数 | 变更类型 |
|------|------|--------|---------|
| main | models/ | 1 | 新增 |
| main | repositories/ | 1 | 新增 |
| main | services/auth/ | 1 | 新增 |
| main | utils/ | 1 | 新增 |
| main | controllers/auth/ | 1 | 新增 |
| main | routes/ | 1 | 修改 |
| main | tests/auth/ | 1 | 新增 |

## §4 数据变更

需要 Migration：**是**

```sql
-- Migration: 001_create_users_table
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'suspended') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 应用层约束：email 和 phone 不可同时为 NULL
-- 通过 CHECK 约束或应用层校验实现
ALTER TABLE users ADD CONSTRAINT chk_contact CHECK (email IS NOT NULL OR phone IS NOT NULL);
```

向后兼容：新表，不影响现有数据。

## §5 风险评估

| 风险项 | 级别 | 缓解措施 |
|--------|------|---------|
| 密码明文泄露 | 高 | bcrypt 哈希，cost=10，不存明文，不日志输出 |
| 并发重复注册 | 中 | 数据库 UNIQUE 约束 + 事务包裹 |
| 手机号格式多样 | 低 | 正则匹配 + 国际区号支持 |
| JWT Secret 泄露 | 高 | 从环境变量读取，不硬编码，不入库 |
| 注册接口被刷 | 中 | 速率限制（每 IP 每分钟 5 次） |

## §6 待澄清问题

1. **JWT 策略** — 有效期 24h，HS256 算法。Refresh Token 是否本期实现？→ 否，后续独立 Change。
2. **速率限制** — 本期使用内存计数（简单），后续可换 Redis。是否需要？→ 需要，但简化实现。
3. **CHECK 约束** — MySQL 8.0+ 支持 CHECK 约束。如果使用旧版 MySQL，需要应用层兜底。
