---
change-id: "CHG-0001"
title: "用户注册验证意图"
story-id: "STORY-0001"
spec-source: "CHG-0001/spec.md"
design-source: "CHG-0001/design.md"
from-state: "designed"
to-state: "tasked"
tc-count: 2
---

# 验证意图：用户注册

## 元信息

- Change: CHG-0001
- Story: STORY-0001
- Spec 来源: spec.md（§5 AC-001 ~ AC-007）
- Design 来源: design.md（§5 DU 划分：DU-MAIN-001）
- 状态转换: designed → tasked
- TC 总数: 2

## 1. 测试用例（验证意图，dev 开始前锁定）

<!-- 每个 AC-NNN 至少被一个 TC-NNN verified-by（tc-coverage 机检）。
     AC-001~AC-005 由 TC-001 覆盖（API 集成测试），AC-006~AC-007 由 TC-002 覆盖（E2E）。
     verified-by AC 引用 spec.md §5 真实存在的 AC-NNN。归属 DU 引用 design DU 划分表。 -->

| TC     | 验证方式     | verified-by AC        | 归属 DU     | 备注                          |
| ------ | ------------ | --------------------- | ----------- | ----------------------------- |
| TC-001 | API 集成测试 | AC-001, AC-002, AC-003, AC-004, AC-005 | DU-MAIN-001 | 注册主流程 + 异常分支         |
| TC-002 | E2E          | AC-006, AC-007        | DU-MAIN-001 | 端到端用户旅程                |

## 2. 测试策略

- **Unit 层**：PasswordEncoder（哈希算法）、UserDomainService（邮箱重复校验）——内部逻辑，不在此 TC 表重复登记，dev 红绿灯引用 TC-001
- **Integration 层**：RegisterController + RegisterApplicationService + UserRepository（TC-001，mock 数据库）
- **E2E 层**：注册 → 登录 → 获取用户信息全链路（TC-002，真实 HTTP + 内存 DB）
- **不重复原则**：Unit 已覆盖的纯函数逻辑不在 Integration 层重复断言

## 3. 不可测项标注

无。所有 AC 均有对应 TC 覆盖。

## 4. 依赖与前置条件

- 单 DU（DU-MAIN-001），无跨 DU 依赖顺序约束
- TC-001 前置：内存数据库初始化 + migrations 已执行
- TC-002 前置：TC-001 通过（注册 API 可用）+ 测试 HTTP 服务启动
