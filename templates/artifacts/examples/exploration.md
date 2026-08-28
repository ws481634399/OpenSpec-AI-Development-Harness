---
change-id: "CHG-0001"
feature-id: "STORY-3"
feature-path: "Product → 用户中心 → 用户认证 → 用户注册"
affected-repos: "main"
matched-change: "none"
archived-change: "none"
reuse-decision: "新建"
---

# 探索分析：用户注册

## 需求理解分析

### 需求本质

表面需求是"注册功能"，实际要解决的问题是**降低用户接入门槛**。当前只有管理员手动创建账号，新用户无法自助完成，导致：

1. 用户增长依赖管理员人力，不可扩展
2. 管理员创建账号时不知道用户偏好（通知方式、界面语言等）
3. 用户没有"拥有感"，对账号价值认知低

### 隐含需求分析

用户描述中未提及但实现必须考虑：

| 隐含需求 | 说明 | 处理方案 |
|---------|------|---------|
| 密码安全存储 | 密码不能明文存储 | 使用 bcrypt 哈希 |
| 邮箱/手机唯一性 | 同一邮箱/手机不可重复注册 | 数据库 UNIQUE 约束 |
| 注册并发 | 同时注册相同邮箱的处理 | 数据库约束 + 事务 |
| 密码强度策略 | 弱密码导致安全问题 | 至少 8 位，含大小写+数字 |

### 知识检索结果

检索 `standards/security-guidelines.md`：
- 密码存储必须用 bcrypt，cost ≥ 10
- 不返回密码哈希给客户端

检索 `standards/coding-standards.md`：
- 错误分类：400 参数无效 / 409 资源冲突
- 命名：camelCase 函数，PascalCase Model

## 影响分析

### 涉及模块

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| models/ | 新增 | User 实体（id/email/phone/password_hash/created_at） |
| services/auth/ | 新增 | 注册业务逻辑 |
| controllers/auth/ | 新增 | POST /api/auth/register 端点 |
| utils/ | 新增 | 密码哈希工具 |
| tests/auth/ | 新增 | 注册接口测试 |

### 影响的现有功能

- 无现有认证模块，不冲突
- 需要新增 User 数据表，不影响现有表
- 不需要数据迁移（新表）

## 未知问题

1. ~~密码强度策略是什么？~~ → 已分析：至少 8 位，含大小写+数字
2. 验证码是否本期实现？ → 标注为 Scope Out，后续迭代
3. 第三方登录是否本期实现？ → 标注为 Scope Out，独立 Change
4. 注册后是否自动登录？ → 需 PRD 确认
