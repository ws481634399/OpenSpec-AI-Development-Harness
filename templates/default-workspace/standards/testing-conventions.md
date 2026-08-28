---
title: 测试规范
tags: [testing, unit, integration, coverage]
related-changes: []
created-at: 2026-01-01T00:00:00Z
updated-at: 2026-01-01T00:00:00Z
---

# 测试规范

定义测试策略、命名约定、结构规则和覆盖率要求。

## 测试金字塔

```
        ╱ E2E ╲         少量（5%）：验证关键用户流程
       ╱ 集成  ╲        适中（25%）：验证模块间交互
      ╱  单元  ╲       大量（70%）：验证函数/方法逻辑
```

## 命名约定

### 测试文件

- 单元测试：`<module>.spec.js` 或 `<module>.test.js`
- 集成测试：`<module>.integration.spec.js`
- E2E 测试：`<flow>.e2e.spec.js`
- 位置：与源文件同目录的 `__tests__/` 或项目根的 `tests/`

### 测试用例

```javascript
// 格式：<AC 编号>: <场景描述> → <预期结果>
test('AC-1: 有效邮箱+密码 → 注册成功', async () => { ... });
test('AC-2: 已注册邮箱 → 返回 409', async () => { ... });
test('AC-3: 无效邮箱格式 → 返回 400', async () => { ... });
```

## 测试结构（AAA 模式）

```javascript
test('AC-1: 有效邮箱+密码 → 注册成功', async () => {
  // Arrange（准备）
  const input = { email: 'test@example.com', password: 'Password123' };

  // Act（执行）
  const result = await registerUser(input);

  // Assert（断言）
  assert.ok(result.userId);
  assert.ok(result.token);
  assert.equal(result.email, input.email);
});
```

## 单元测试

### 范围

- 函数/方法的核心逻辑
- 边界值和异常路径
- 不依赖外部系统（数据库、网络、文件系统）

### Mock 策略

- Mock 外部依赖（数据库、第三方 API）
- 不 Mock 被测对象本身
- Mock 返回值要真实，不返回 `{}` 这种无意义值

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUser } from './register.js';

// Mock Repository
const mockRepo = {
  findByEmail: async () => null,  // 邮箱不存在
  save: async (user) => ({ ...user, id: '123' }),
};

test('AC-1: 有效邮箱+密码 → 注册成功', async () => {
  const result = await registerUser(
    { email: 'test@example.com', password: 'Password123' },
    mockRepo
  );
  assert.ok(result.userId);
});
```

## 集成测试

### 范围

- 模块间接口（Controller → Service → Repository）
- 数据库读写（使用测试数据库或内存数据库）
- HTTP 端点（发送真实请求）

### 环境

- 使用独立的测试数据库（不污染开发库）
- 每个测试套件前清理数据
- 不依赖执行顺序

```javascript
test('集成: POST /api/auth/register → 201 + 返回 token', async () => {
  const res = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'Password123' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);
});
```

## 边界值分析

### 必测边界

| 类型 | 边界值 |
|------|--------|
| 字符串 | 空、1 字符、最大长度、超长、特殊字符 |
| 数字 | 0、负数、最小值、最大值、超大 |
| 集合 | 空、1 个、满、超容 |
| 日期 | 过去、现在、未来、闰年、时区 |

### 异常路径 checklist

- [ ] 必填项缺失
- [ ] 格式无效（邮箱、手机号、日期）
- [ ] 唯一性冲突
- [ ] 权限不足
- [ ] 并发操作
- [ ] 网络超时
- [ ] 数据库连接失败
- [ ] 空值/null/undefined

## 覆盖率

### 要求

| 测试类型 | 覆盖率要求 |
|---------|-----------|
| 单元测试 | 函数覆盖 ≥ 90% |
| 集成测试 | 关键路径 100% |
| E2E 测试 | PRD 验收标准 100% |

### 覆盖率检查

```bash
# Node.js
node --test --experimental-test-coverage tests/*.spec.js

# 生成报告
c8 --reporter=html node --test tests/*.spec.js
```

## 测试数据

### 原则

- 使用有意义的测试数据（不用 "test"、"aaa"、"123"）
- 每个测试用例的 Arrange 阶段自包含
- 不依赖其他测试的副作用

### 测试工厂

```javascript
function createTestUser(overrides = {}) {
  return {
    email: 'test@example.com',
    password: 'Password123',
    ...overrides,
  };
}

test('有效注册', async () => {
  const result = await registerUser(createTestUser());
  assert.ok(result.userId);
});

test('邮箱已存在', async () => {
  await seedUser({ email: 'taken@example.com' });
  const result = registerUser(createTestUser({ email: 'taken@example.com' }));
  await assert.rejects(result, { code: 'EMAIL_DUPLICATE' });
});
```

## 禁止事项

- 禁止测试依赖执行顺序
- 禁止测试间共享状态
- 禁止 mock 被测对象本身
- 禁止 `setTimeout` 等待异步（用 async/await）
- 禁止跳过失败的测试（用 `todo` 标注并说明原因）
