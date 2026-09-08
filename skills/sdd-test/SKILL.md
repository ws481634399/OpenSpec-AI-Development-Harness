# sdd-test: 独立测试验证

> 阶段: test
> 状态转换: developing → testing
> 产出: evidence/test-report.md（跨仓聚合）+ 各仓 DU 级测试证据
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/coding/persona-test.md

Phase 4.3 S3：**测试独立性**——test Agent 只消费 test-design.md + spec/design，
**不注入 implementation.md**（防「照实现写断言」）；照 TC 逐条执行并记 EVD。
evidence-trace 机检：test-report 中引用的 TC-NNN 必须存在于 test-design.md。

Phase 2.4 多仓语义：测试在各仓 DU 内执行，DU 级结果回传 Workspace，
test-report.md 按仓聚合（每个受影响仓库一个分仓小节）。

## 前置条件
- Change 处于 `developing` 状态
- STORY 级 tasks.md + test-design.md 已完成（双产物），全部 DU 已物化（du-materialized）
- 各仓 DU 状态已通过 `openspec du sync-status` 回传（develop → test 前置 du-fan-in-testing）

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/spec.md`：
- 验收标准（AC-NNN）→ 测试用例的来源（DU Acceptance 按编号引用）

读取 STORY 级 `test-design.md`（Phase 4.3 S3）：
- **TC-NNN 测试用例表** → 照 TC 逐条执行（验证方式 / verified-by AC / 归属 DU）
- TC-NOT-TESTABLE 标注 → 跳过并记录替代验证方式
- 测试策略（§2）→ 分层执行顺序与数据准备

读取 `delivery/changes/<CHG>/design.md`：
- 接口契约 → 测试入参/出参
- **跨仓协作契约（§4）** → 集成测试的跨仓场景
- 业务规则 → 边界 case 设计
- 风险评估 → 高风险项必须有测试覆盖

> **测试独立性（Phase 4.3 S3）：不读 implementation.md**——test Agent 照 test-design 的 TC 逐条运行，
> 不参考实际实现代码（防「照实现写断言」）。DU 状态从 metadata 获取（不读 implementation 正文）。

读取 STORY 级 tasks.md 与 DU metadata：
- DU 清单（仓库/状态/baseline/result）→ 确定各仓测试范围
- DU Acceptance → 每个 DU 的验收测试点

### 2. 执行测试

**Phase 2.4：进入各仓目录执行**（`implementation/<repo>/`），按仓运行该仓测试；
跨仓集成场景按 design.md §4 协作契约执行。

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
| E2E | 用户流程 | 手动/自动化 | spec AC 全部通过 |

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

**spec 验收标准映射：**
每条 AC-NNN 必须有至少一个测试用例覆盖（TC，Phase 4.3 起追踪链机检 tc-coverage）：

```markdown
| AC      | 测试用例                 | 类型       | 状态 |
|---------|--------------------------|------------|------|
| AC-001  | 有效邮箱+密码注册 → 成功 | 单元+集成  | ✅   |
| AC-002  | 已注册邮箱 → 409         | 单元       | ✅   |
| AC-003  | 无效邮箱格式 → 400       | 单元       | ✅   |
| AC-004  | 有效手机号+密码 → 成功   | 集成       | ✅   |
| AC-005  | 密码强度不足 → 400       | 单元       | ✅   |
```

### 3. 记录测试结果（DU 级 + Workspace 聚合）

**DU 级证据**写入该仓 DU 目录 `evidence/`：

- 各仓 `.../DU-XXX/evidence/test-output.log` — 该仓完整测试输出日志
- 各仓 `.../DU-XXX/evidence/evidence.yaml` — 追加 `test-result` 记录（delivery-unit + evidence-ref 指向日志/报告）
- `evidence/screenshots/` — 截图（如 E2E 测试需要，放 Workspace 聚合侧）

**Workspace 聚合**写入 `delivery/changes/<CHG>/evidence/`：

- `evidence/evidence.yaml` — 按 DU 聚合 test-result 记录（evidence-ref 引用各仓 DU 侧证据，不复制正文）
- 各仓 DU 全部进入测试后执行 `openspec du sync-status <CHG> <DU-ID>` 回传状态

### 4. 写 test-report.md

读取模板 `templates/artifacts/evidence/test-report.md`，按结构填写。

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{implementation-source}}`：`<CHG>/implementation.md`
- `{{tested-at}}`：ISO8601 时间戳

#### 4.1 报告内容方法论

**§1 测试范围：**
- **覆盖 DU 清单**（Phase 2.4：如 DU-BE-001 / DU-FE-001）
- 多仓需求按仓给分仓小节（如 `### 1.1 backend` / `### 1.2 frontend`）
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
| AC      | 测试用例              | 类型       | 状态 |
|---------|-----------------------|------------|------|
| AC-001  | valid_email_register  | 单元+集成  | ✅   |
| AC-002  | duplicate_email       | 单元       | ✅   |
| AC-003  | invalid_email_format  | 单元       | ✅   |
| AC-004  | valid_phone_register  | 集成       | ✅   |
| AC-005  | weak_password         | 单元       | ✅   |
```

**§4 证据清单：**

```markdown
- [test-output.log](evidence/test-output.log) — Workspace 聚合日志
- [screenshots/register-flow.png](evidence/screenshots/register-flow.png) — 注册流程截图
- evidence-ref: backend DU-BE-001 → implementation/backend/delivery/.../DU-BE-001/evidence/test-output.log（不复制正文）
```

**§5 失败项分析（如有）：**
- 失败用例描述
- 失败原因（代码 bug / 测试 bug / 环境问题）
- 处理建议（修复代码 / 修复测试 / 标记 known issue）

写入 `delivery/changes/<CHG>/evidence/test-report.md`。

### 5. 质量自检

产出前自检：
- [ ] tasks.md 中每个 DU 是否都有测试覆盖（du-fan-in-testing）？
- [ ] spec 每条验收标准（AC-NNN）是否有对应测试用例？
- [ ] design.md §4 跨仓协作契约是否有集成测试覆盖？
- [ ] 正常路径和异常路径是否都覆盖？
- [ ] 边界值是否有测试（空值/最小/最大/超长）？
- [ ] design.md 高风险项是否有测试覆盖？
- [ ] 各仓测试日志是否完整保存到该仓 DU evidence/，Workspace 聚合是否一致？
- [ ] DU 状态是否已回传（sync-status）？
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

> 完整示例参考: `templates/artifacts/examples/test-report.md`（含 20 测试/AC 矩阵/覆盖率/性能）

**测试用例（节选）：**

```javascript
// tests/auth/register.spec.js
import test from 'node:test';
import assert from 'node:assert';
import { registerUser } from '../../services/auth/register.js';

test('AC-001: 有效邮箱+密码 → 注册成功', async () => {
  const result = await registerUser({
    email: 'test@example.com',
    password: 'Password123'
  });
  assert.ok(result.userId);
  assert.ok(result.token);
});

test('AC-002: 已注册邮箱 → 返回 409', async () => {
  await assert.rejects(
    () => registerUser({ email: 'existing@example.com', password: 'Password123' }),
    { code: 'DUPLICATE' }
  );
});

test('AC-003: 无效邮箱格式 → 返回 400', async () => {
  await assert.rejects(
    () => registerUser({ email: 'not-an-email', password: 'Password123' }),
    { code: 'INVALID_EMAIL' }
  );
});

test('AC-005: 密码强度不足 → 返回 400', async () => {
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

- 不修改 implementation.md / tasks.md / design.md / spec.md
- 每个 DU 至少一个验收测试（对应 DU Acceptance），每条 spec 验收标准（AC-NNN）必须有至少一个测试用例
- 多仓测试在各仓内执行，Workspace 聚合侧只做 evidence-ref 引用，不复制正文
- 失败项必须有分析和处理建议
- 测试日志必须完整保存到所属仓 DU evidence/

> 通用行为约束（产出草稿供用户确认 / 不直接推进状态等）见 prompts/common/constraints.md。
