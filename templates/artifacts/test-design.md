# Test Design（Verification Intent — 验证意图）

> 阶段：sdd-task 产物（Phase 4.3 S3：与 tasks.md 同批产出的双产物之一）
> 位置：STORY 级 —— `<CHG>/<L1>/<L2>/<L3>/<STORY>/test-design.md`（与 tasks.md 同目录）
> 输入：spec.md（AC-NNN 验收标准）+ design.md（DU 划分表）+ tasks.md（verifies 绑定）
> 产出状态：tasked（双产物机检：tasks.md + test-design.md 同时 accepted 才进 tasked）

本文档定义**验证意图**（Verification Intent），在 dev 开始前锁定测试用例（TC-NNN），
保证 test 阶段的独立性——test Agent 只消费 test-design.md + spec/design，
**不注入 implementation.md**（防「照实现写断言」，context-rules 层面收口）。

## 0. 元信息

- Change ID: {{change-id}}
- Story ID: {{story-id}}
- Spec 来源: {{spec-source}}
- Design 来源: {{design-source}}
- 状态流转: {{from-state}} → {{to-state}}
- Feature Path: {{feature-path}}
- TC 总数: {{tc-count}}

## 1. 测试用例（验证意图，dev 开始前锁定）

<!-- AI 补充：每个 AC-NNN 至少被一个 TC-NNN verified-by（tc-coverage 机检：blocking）。
     允许标注 `TC-NOT-TESTABLE: 理由`（进 warnings，不阻断）。
     verified-by AC 必须引用 story-spec.md / spec.md 中真实存在的 AC-NNN。
     归属 DU 必须引用 design DU 划分表中真实存在的 DU id。
     TC 编号三位递增不复用（TC-001, TC-002, ...）。 -->

| TC     | 验证方式     | verified-by AC | 归属 DU   | 备注                   |
| ------ | ------------ | -------------- | --------- | ---------------------- |
| TC-001 | API 集成测试 | AC-001         | DU-BE-001 |                        |
| TC-002 | E2E          | AC-002         | DU-FE-001 | TC-NOT-TESTABLE 不允许 |

## 2. 测试策略

<!-- AI 补充：分层测试策略（Unit / Integration / API / E2E），各层覆盖范围与不重复原则。
     覆盖策略：哪些 TC 走 Unit、哪些走 Integration/E2E，避免冗余。
     数据准备：测试数据策略（fixture / mock / seed）。
     环境要求：测试运行环境与依赖服务。 -->

## 3. 不可测项标注

<!-- 仅当存在 TC-NOT-TESTABLE 时填写；每条标注不可测的 TC id + 理由 + 替代验证方式。
     机检：标注 TC-NOT-TESTABLE 的 AC 进 warnings 不阻断，但需有明确理由。 -->

## 4. 依赖与前置条件

<!-- AI 补充：测试执行的前置条件（DU 依赖顺序、数据初始化、外部服务 mock 等）。
     跨 DU 依赖：若 TC-002 依赖 TC-001 先通过，在此声明执行顺序约束。 -->
