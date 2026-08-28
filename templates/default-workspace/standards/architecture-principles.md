---
title: 架构原则
tags: [architecture, solid, layered, patterns]
related-changes: []
created-at: 2026-01-01T00:00:00Z
updated-at: 2026-01-01T00:00:00Z
---

# 架构原则

定义项目的架构约定、设计原则和模式选择。新设计必须遵循本规范。

## 分层架构

### 标准分层

```
┌─────────────────────────────────┐
│  Controller / Route / Handler   │  接口层：HTTP 请求/响应
├─────────────────────────────────┤
│  Service / Domain               │  服务层：业务逻辑
├─────────────────────────────────┤
│  Repository / DataAccessor      │  数据层：数据访问
├─────────────────────────────────┤
│  Model / Entity                 │  模型层：数据结构定义
└─────────────────────────────────┘
```

### 依赖规则

- **上层依赖下层**：Controller → Service → Repository → Model
- **下层不依赖上层**：Repository 不 import Controller
- **横向不依赖**：同层模块间通过接口或事件通信，不直接调用
- **依赖倒置**：高层不依赖低层实现，都依赖抽象（接口）

### 职责边界

| 层 | 职责 | 不应做 |
|----|------|--------|
| Controller | 参数校验、调用 Service、格式化响应 | 业务逻辑、直接访问数据库 |
| Service | 业务逻辑、事务编排、调用 Repository | HTTP 相关操作、SQL |
| Repository | 数据访问、查询构造 | 业务逻辑、HTTP |
| Model | 数据结构定义、字段约束 | 业务逻辑、数据访问 |

## SOLID 原则

### S — 单一职责

一个类/模块只做一件事。

```javascript
// ✗ 错误：UserManager 既管用户又管通知
class UserManager {
  createUser() { ... }
  sendNotification() { ... }
}

// ✓ 正确：拆分职责
class UserService { createUser() { ... } }
class NotificationService { send() { ... } }
```

### O — 开闭原则

对扩展开放，对修改关闭。

```javascript
// ✗ 错误：每加一种支付都要改 switch
function processPayment(type) {
  switch (type) {
    case 'wechat': ... break;
    case 'alipay': ... break;
  }
}

// ✓ 正确：策略模式，新支付只加新类
class WechatPayment { process() { ... } }
class AlipayPayment { process() { ... } }
```

### L — 里氏替换

子类必须能替换父类而不影响正确性。

### I — 接口隔离

不要强迫依赖不需要的方法。接口要小而专注。

### D — 依赖倒置

高层不依赖低层，都依赖抽象。

```javascript
// ✗ 错误：Service 直接依赖具体 Repository
class UserService {
  constructor() {
    this.repo = new UserMySqlRepository();  // 硬编码依赖
  }
}

// ✓ 正确：依赖抽象，注入实现
class UserService {
  constructor(userRepository) {  // 注入接口
    this.repo = userRepository;
  }
}
```

## 常用模式

### Repository 模式

数据访问抽象，隔离 ORM/SQL 细节。

```javascript
class UserRepository {
  async findById(id) { ... }
  async findByEmail(email) { ... }
  async save(user) { ... }
  async delete(id) { ... }
}
```

### Factory 模式

对象创建逻辑集中管理。

```javascript
class UserFactory {
  static create({ email, phone, password }) {
    return new User({
      id: generateId(),
      email,
      phone,
      passwordHash: hashPassword(password),
      createdAt: new Date(),
    });
  }
}
```

### Strategy 模式

算法族封装为可互换的策略。

```javascript
class PasswordPolicy {
  constructor(strategies) { this.strategies = strategies; }
  validate(password) {
    return this.strategies.every((s) => s.check(password));
  }
}
const policy = new PasswordPolicy([
  new MinLengthStrategy(8),
  new UppercaseStrategy(),
  new NumberStrategy(),
]);
```

## API 设计规范

### RESTful 约定

```
GET    /api/resources           # 列表
GET    /api/resources/:id       # 详情
POST   /api/resources           # 创建
PUT    /api/resources/:id       # 全量更新
PATCH  /api/resources/:id       # 部分更新
DELETE /api/resources/:id       # 删除
```

### 响应格式

```json
{
  "data": { "id": "123", "name": "test" },
  "meta": { "page": 1, "total": 100 }
}
```

错误响应：
```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND"
}
```

### 版本化

- URL 版本：`/api/v1/users`
- 不破坏旧版本，新版本独立路由

## 模块边界

### 一个模块 = 一个业务域

- 用户模块不直接操作订单表
- 订单模块通过用户模块的接口获取用户信息
- 模块间通信通过接口或事件，不共享数据库表

### 模块目录结构

```
modules/
├── user/
│   ├── user-controller.js
│   ├── user-service.js
│   ├── user-repository.js
│   └── user-model.js
├── order/
│   ├── order-controller.js
│   ├── order-service.js
│   └── ...
```

## 反模式（禁止）

- **上帝类**：一个类什么都管（>500 行）
- **胖 Controller**：Controller 含业务逻辑
- **Service 直接写 SQL**：应在 Repository 层
- **循环依赖**：A 依赖 B，B 又依赖 A
- **全局状态**：用全局变量传数据
- **魔法数字**：代码中直接写数字（用常量）
