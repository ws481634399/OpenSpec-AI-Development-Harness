# sdd-test: 测试验证

> 阶段: test
> 状态转换: developing → testing
> 产出: evidence/test-report.md

## 前置条件
- Change 处于 `developing` 状态
- implementation.md 和 tasks.md 已完成

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/prd.md`：
- 验收标准（AC-NNN）→ 测试用例的来源

读取 `delivery/changes/<CHG>/design.md`：
- 接口契约 → 测试入参/出参
- 业务规则 → 边界 case 设计
- 风险评估 → 高风险项必须有测试覆盖

读取 `delivery/changes/<CHG>/implementation.md`：
- 已实现的 Task 清单 → 确认测试范围
- Commit 记录 → 确认哪些 Task 有测试 Task

### 2. 执行测试

#### 2.1 测试策略

**测试金字塔：**
```
        / E2E \        ← 少量，验证关键用户流程
       / 集成  \       ← 适中，验证模块间交互
      / 单元测试 \     ← 大量，验证函数/方法逻辑
```

**分层测试范围：**

| 层级 | 范围 | 工具 | 通过标准 |
|------|------|------|---------|
| 单元 | 函数/方法逻辑 | 项目测试框架 | 100% 函数覆盖 |
| 集成 | 模块间接口 | 测试框架 + mock | 关键路径通过 |
| E2E | 用户流程 | 手动/自动化 | PRD AC 全部通过 |

**测试运行命令（按技术栈）：**
- Node.js: `npm test` / `node --test`
- Java: `mvn test`
- Python: `pytest`
- Go: `go test ./...`

#### 2.2 边界分析方法

**等价类划分：**
- 有效等价类 → 正常路径测试
- 无效等价类 → 异常路径测试

**边界值分析：**
- 字符串：空、最小长度、最大长度、超长
- 数字：0、负数、最小值、最大值、超大
- 集合：空、1 个、满、超容

**异常路径 checklist：**
- [ ] 必填项缺失
- [ ] 格式无效（邮箱、手机号、日期）
- [ ] 唯一性冲突（重复注册）
- [ ] 权限不足
- [ ] 并发操作
- [ ] 网络超时/错误
- [ ] 数据库连接失败

**PRD 验收标准映射：**
每条 AC-NNN 必须有至少一个测试用例覆盖：

```markdown
| AC | 测试用例 | 类型 | 状态 |
|----|---------|------|------|
| AC-1 | 有效邮箱+密码注册 → 成功 | 单元+集成 | ✅ |
| AC-2 | 已注册邮箱 → 409 | 单元 | ✅ |
| AC-3 | 无效邮箱格式 → 400 | 单元 | ✅ |
| AC-4 | 有效手机号+密码 → 成功 | 集成 | ✅ |
| AC-5 | 密码强度不足 → 400 | 单元 | ✅ |
```

### 3. 记录测试结果

在 `delivery/changes/<CHG>/evidence/` 下记录：
- `evidence/test-output.log` — 完整测试输出日志
- `evidence/screenshots/` — 截图（如 E2E 测试需要）

### 4. 写 test-report.md

读取模板 `templates/artifacts/evidence/test-report.md`，按结构填写。

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{implementation-source}}`：`<CHG>/implementation.md`
- `{{from-state}}`：developing
- `{{to-state}}`：testing
- `{{tested-at}}`：ISO8601 时间戳

#### 4.1 报告内容方法论

**§1 测试范围：**
- 测试的模块/文件清单
- 测试类型（单元/集成/E2E）
- 测试环境（Node 版本、数据库等）

**§2 执行汇总：**

```markdown
| 类型 | 总数 | 通过 | 失败 | 跳过 | 通过率 |
|------|------|------|------|------|--------|
| 单元 | 25 | 24 | 1 | 0 | 96% |
| 集成 | 5 | 5 | 0 | 0 | 100% |
| E2E  | 2 | 2 | 0 | 0 | 100% |
| 合计 | 32 | 31 | 1 | 0 | 96.9% |
```

**§3 AC 覆盖矩阵：**

```markdown
| AC | 测试用例 | 类型 | 状态 |
|----|---------|------|------|
| AC-1 | valid_email_register | 单元+集成 | ✅ |
| AC-2 | duplicate_email | 单元 | ✅ |
| AC-3 | invalid_email_format | 单元 | ✅ |
| AC-4 | valid_phone_register | 集成 | ✅ |
| AC-5 | weak_password | 单元 | ✅ |
```

**§4 证据清单：**

```markdown
- [test-output.log](evidence/test-output.log) — 完整测试日志
- [screenshots/register-flow.png](evidence/screenshots/register-flow.png) — 注册流程截图
```

**§5 失败项分析（如有）：**
- 失败用例描述
- 失败原因（代码 bug / 测试 bug / 环境问题）
- 处理建议（修复代码 / 修复测试 / 标记 known issue）

写入 `delivery/changes/<CHG>/evidence/test-report.md`。

### 5. 质量自检

产出前自检：
- [ ] PRD 每条验收标准是否有对应测试用例？
- [ ] 正常路径和异常路径是否都覆盖？
- [ ] 边界值是否有测试（空值/最小/最大/超长）？
- [ ] design.md 高风险项是否有测试覆盖？
- [ ] 测试日志是否完整保存到 evidence/？
- [ ] 失败项是否有分析和处理建议？
- [ ] 通过率是否 ≥ 90%（如有失败，需说明原因）？

### 6. 用户交互

展示测试报告时，主动确认：
- 测试覆盖是否充分？
- 失败项是否需要修复后重新测试？
- 通过率是否达标？
- 是否有 skipped 的测试需要补充？

## 产出草稿
- `delivery/changes/<CHG>/evidence/test-report.md` — 测试报告

## 用户确认

展示 test-report.md 给用户：
- 测试覆盖是否充分？
- 失败项是否需要修复？
- 通过率是否达标？

确认后：
```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set testing
```

## 工作示例

**测试用例（节选）：**

```javascript
// tests/auth/register.spec.js
import test from 'node:test';
import assert from 'node:assert';
import { registerUser } from '../../services/auth/register.js';

test('AC-1: 有效邮箱+密码 → 注册成功', async () => {
  const result = await registerUser({
    email: 'test@example.com',
    password: 'Password123'
  });
  assert.ok(result.userId);
  assert.ok(result.token);
});

test('AC-2: 已注册邮箱 → 返回 409', async () => {
  await assert.rejects(
    () => registerUser({ email: 'existing@example.com', password: 'Password123' }),
    { code: 'DUPLICATE' }
  );
});

test('AC-3: 无效邮箱格式 → 返回 400', async () => {
  await assert.rejects(
    () => registerUser({ email: 'not-an-email', password: 'Password123' }),
    { code: 'INVALID_EMAIL' }
  );
});

test('AC-5: 密码强度不足 → 返回 400', async () => {
  await assert.rejects(
    () => registerUser({ email: 'test@example.com', password: '123' }),
    { code: 'WEAK_PASSWORD' }
  );
});
```

**test-report.md §2 执行汇总：**
```
| 类型 | 总数 | 通过 | 失败 | 跳过 | 通过率 |
|------|------|------|------|------|--------|
| 单元 | 10 | 10 | 0 | 0 | 100% |
| 集成 | 3  | 3  | 0 | 0 | 100% |
| 合计 | 13 | 13 | 0 | 0 | 100% |
```

## 行为规则
- 不修改 implementation.md / tasks.md / design.md / prd.md
- 产出草稿供用户确认，不直接推进状态
- 每条 PRD 验收标准必须有至少一个测试用例
- 失败项必须有分析和处理建议
- 测试日志必须完整保存到 evidence/
