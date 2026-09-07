# 测试规范

> 版本：v0.1  
> 类型：工程通用规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义软件开发过程中的测试要求、验证流程和测试证据管理规范。


目标：

- 保证代码修改符合预期；
- 降低功能回归风险；
- 建立可追踪的质量验证流程；
- 为 AI Coding Agent 提供明确的测试执行标准。


---

# 2. 测试基本原则


## 2.1 测试是 Change 的一部分


测试不是开发完成后的额外步骤。


每个 Change 都应该包含：

```
需求

↓

实现

↓

验证

↓

证据
```


测试结果属于 Change 的交付证据。


---

## 2.2 测试应该覆盖风险


测试重点应该围绕：

- 业务核心流程；
- 关键数据变化；
- 高风险代码修改；
- 外部接口交互。


不是简单追求测试数量。


---

## 2.3 自动化优先


对于重复执行的验证：

优先使用自动化测试。


例如：

- 单元测试；
- 集成测试；
- API测试；
- 自动化回归测试。


---

# 3. 测试类型


OpenSpec 支持以下测试类型。


---

# 3.1 单元测试


目的：

验证单个模块或组件的正确性。


适用于：

- 方法逻辑；
- 服务层逻辑；
- 工具类。


示例：


```
OrderServiceTest
```


要求：

- 测试逻辑清晰；
- 覆盖关键分支；
- 不依赖外部环境。


---

# 3.2 集成测试


目的：

验证多个模块协作。


适用于：

- 服务调用；
- 数据库交互；
- 消息通信。


例如：


```
OrderServiceIntegrationTest
```


---

# 3.3 API测试


目的：

验证接口行为。


应该验证：


- 请求参数；
- 返回结构；
- 状态码；
- 异常情况。


---

# 3.4 端到端测试


目的：

验证完整业务流程。


例如：


```
用户下单

↓

支付

↓

订单完成
```


适用于：

核心业务流程验证。


---

# 4. 测试设计规范


## 4.1 测试应该对应需求


测试应该能够回答：


```
需求是否被正确实现？
```


示例：


需求：

```
用户可以取消订单
```


测试：

```
订单取消成功

取消后库存恢复

已支付订单不可直接取消
```


---

## 4.2 测试数据明确


测试应该明确：

- 输入数据；
- 执行条件；
- 预期结果。


避免：

依赖不明确的环境状态。


---

## 4.3 测试结果可验证


测试结果应该包含：

- 成功或失败；
- 执行时间；
- 环境信息；
- 失败原因。


---

# 5. 测试命名规范


测试名称应该表达行为。


推荐：

```
shouldCancelOrderWhenStatusIsPending()
```


避免：

```
test1()

testOrder()
```


---

# 6. 测试覆盖要求


测试重点覆盖：


## 核心业务


必须覆盖：

- 正常流程；
- 异常流程；
- 边界情况。


---

## 数据变化


涉及数据修改时：

需要验证：

- 数据正确性；
- 状态变化；
- 一致性。


---

## 接口变化


API修改需要验证：

- 新接口行为；
- 兼容性；
- 错误处理。


---

# 7. AI Coding Agent 测试规则


AI 修改代码后必须考虑测试。


执行流程：


```
读取 Change

↓

理解 Design

↓

修改代码

↓

执行测试

↓

生成测试证据
```


---

AI 不应该：


- 跳过测试验证；
- 声称未执行的测试已通过；
- 删除失败测试隐藏问题。


---

# 8. 测试证据管理


测试结果应该保存在 Change 中。


目录：


```
delivery/

└── changes/

    └── CHG-XXX/

        └── evidence/

            └── test-report.md
```


---

测试报告建议包含：


```markdown
# Test Report


## Change

CHG-XXX


## Test Environment

开发环境


## Executed Tests

- Unit Test

- Integration Test


## Result

PASS


## Notes

无异常
```


---

# 9. 测试失败处理


测试失败时：


不能直接忽略。


应该记录：


- 失败原因；
- 影响范围；
- 修复方案。


必要时创建：


```
delivery/reports/unresolved/
```


---

# 10. 测试与 Change 生命周期


测试对应 Change 流程：


```
Requirement

↓

PRD

↓

Design

↓

Implementation

↓

Testing

↓

Evidence

↓

Converge
```


没有验证证据的 Change 不应进入完成状态。


---

# 11. 测试环境管理


测试环境应该明确：


- 环境类型；
- 配置版本；
- 数据来源；
- 依赖服务。


避免：

测试结果无法复现。


---

# 12. 测试检查清单


提交前检查：


```
[ ] 测试范围明确

[ ] 核心逻辑已验证

[ ] 异常场景已覆盖

[ ] 测试结果已记录

[ ] 测试证据已保存

[ ] 失败问题已处理
```


---

# 13. 总结


测试规范用于保证：

```
需求

+

代码实现

+

质量验证

+

交付证据
```


形成完整闭环。


通过测试规范，AI Coding Agent 能够：

- 理解验证要求；
- 执行正确测试；
- 生成可靠证据；
- 支持持续交付。

---

# 14. 测试细则速查（具体规则）

> 本节为可直接执行的具体规则，与前文原则性规范配合使用。示例以 JavaScript 为主。

## 14.1 测试金字塔

```
        ╱ E2E ╲         少量（5%）：验证关键用户流程
       ╱ 集成  ╲        适中（25%）：验证模块间交互
      ╱  单元  ╲       大量（70%）：验证函数/方法逻辑
```

## 14.2 命名约定

### 测试文件

- 单元测试：`<module>.spec.js` 或 `<module>.test.js`
- 集成测试：`<module>.integration.spec.js`
- E2E 测试：`<flow>.e2e.spec.js`
- 位置：与源文件同目录的 `__tests__/` 或项目根的 `tests/`

### 测试用例

```javascript
// 格式：<AC 编号>: <场景描述> → <预期结果>
test('AC-001: 有效邮箱+密码 → 注册成功', async () => { ... });
test('AC-002: 已注册邮箱 → 返回 409', async () => { ... });
test('AC-003: 无效邮箱格式 → 返回 400', async () => { ... });
```

## 14.3 测试结构（AAA 模式）

```javascript
test('AC-001: 有效邮箱+密码 → 注册成功', async () => {
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

## 14.4 单元测试

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

test('AC-001: 有效邮箱+密码 → 注册成功', async () => {
  const result = await registerUser(
    { email: 'test@example.com', password: 'Password123' },
    mockRepo
  );
  assert.ok(result.userId);
});
```

## 14.5 集成测试

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

## 14.6 边界值分析

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

## 14.7 覆盖率

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

## 14.8 测试数据

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

## 14.9 禁止事项

- 禁止测试依赖执行顺序
- 禁止测试间共享状态
- 禁止 mock 被测对象本身
- 禁止 `setTimeout` 等待异步（用 async/await）
- 禁止跳过失败的测试（用 `todo` 标注并说明原因）
