---
title: 安全指南
tags: [security, owasp, auth, crypto, input-validation]
related-changes: []
created-at: 2026-01-01T00:00:00Z
updated-at: 2026-01-01T00:00:00Z
---

# 安全指南

基于 OWASP Top 10，定义输入校验、认证授权、数据保护、加密存储的安全要求。

## 输入校验

### 原则

- **永远不信任用户输入**
- 所有外部输入（请求体、查询参数、路径参数、Header）必须校验
- 校验在 Controller 层完成，不传入 Service

### 校验清单

```javascript
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^\+?\d{10,15}$/),
  password: z.string().min(8).max(128),
});

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  // ...
});
```

### SQL 注入防护

```javascript
// ✗ 禁止：字符串拼接
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// ✓ 正确：参数化查询
db.query('SELECT * FROM users WHERE email = ?', [email]);

// ✓ 正确：ORM
User.findOne({ where: { email } });
```

### XSS 防护

- 输出时转义 HTML：`<` → `&lt;`, `>` → `&gt;`
- 设置 `Content-Type: application/json`（API 响应）
- CSP Header 限制脚本来源
- 不使用 `innerHTML`，用 `textContent`

### CSRF 防护

- API 使用 SameSite Cookie
- 敏感操作要求 CSRF Token
- 验证 Origin/Referer Header

## 认证与授权

### 密码存储

```javascript
import bcrypt from 'bcrypt';

// 哈希（注册时）
const saltRounds = 10;
const passwordHash = await bcrypt.hash(password, saltRounds);

// 验证（登录时）
const match = await bcrypt.compare(inputPassword, storedHash);
```

**规则：**
- 使用 bcrypt（cost ≥ 10）或 argon2
- 永远不存明文密码
- 永远不返回密码哈希给客户端

### Token 管理

```javascript
// JWT 签发
const token = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '24h', algorithm: 'HS256' }
);

// JWT 验证
const payload = jwt.verify(token, process.env.JWT_SECRET);
```

**规则：**
- Secret 从环境变量读取，不硬编码
- Token 有过期时间（≤ 24h）
- 敏感操作要求二次认证
- Token 撤销：维护黑名单或使用短期 Token + 长期 Refresh Token

### 授权检查

```javascript
// 每个端点必须检查权限
app.delete('/api/users/:id', auth, requireRole('admin'), async (req, res) => {
  // ...
});

// 不信任客户端传入的角色
// ✗ 禁止：用 req.body.role 判断权限
// ✓ 正确：从 JWT payload 读取 role
```

### 会话管理

- 登录后设置 HttpOnly + Secure + SameSite Cookie
- 登出时清除服务端会话
- 限制并发会话数
- 异地登录要求重新认证

## 数据保护

### 敏感数据识别

| 级别 | 示例 | 处理方式 |
|------|------|---------|
| 极密 | 密码、密钥、私钥 | 哈希/加密存储，不日志 |
| 机密 | 手机号、身份证、银行卡 | 脱敏显示（138****1234） |
| 内部 | 邮箱、地址、用户名 | 不对外暴露 |
| 公开 | 昵称、头像 | 自由展示 |

### 日志脱敏

```javascript
// ✗ 禁止：日志中输出密码/Token
logger.info('register', { email, password });  // !

// ✓ 正确：脱敏
logger.info('register', { email, password: '[REDACTED]' });
logger.info('login', { userId, token: '[REDACTED]' });
```

### 数据库加密

- 敏感字段加密存储（AES-256）
- 加密密钥从 KMS/环境变量读取
- 不在数据库明文存储身份证/银行卡

### 传输加密

- 全站 HTTPS
- API 不支持 HTTP（301 重定向到 HTTPS）
- HSTS Header：`Strict-Transport-Security: max-age=31536000`

## 错误处理与信息泄露

### 不泄露的技术信息

- 堆栈跟踪（生产环境）
- SQL 语句
- 数据库表名/字段名
- 文件路径
- 内部 IP/端口

```javascript
// ✗ 错误：直接返回内部错误
app.get('/api/users/:id', async (req, res) => {
  const user = await db.query('...');
  res.json(user);  // 可能暴露内部字段
});

// ✓ 正确：错误兜底
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ error: '服务器内部错误', code: 'INTERNAL_ERROR' });
});
```

## 依赖安全

### 依赖审查

- 新增依赖前检查已知漏洞：`npm audit`
- 锁定版本：使用 lockfile（package-lock.json / yarn.lock）
- 定期更新依赖

### 禁止使用的包

- 已弃用的包（如 `crypto`（已废弃的 randomBytes 同步 API））
- 有已知严重漏洞的包
- 不活跃超过 2 年的包

## 安全 checklist

### 上线前必检

- [ ] 全部输入参数有校验
- [ ] 密码用 bcrypt/argon2 哈希
- [ ] JWT Secret 从环境变量读取
- [ ] 敏感操作有权限检查
- [ ] 日志不输出密码/Token/敏感数据
- [ ] 数据库查询用参数化
- [ ] 错误响应不泄露技术细节
- [ ] HTTPS 强制
- [ ] 依赖无已知漏洞
- [ ] .env 不提交到 Git
