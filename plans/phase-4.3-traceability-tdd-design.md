# Phase 4.3：可追踪规格与执行隔离（Spec-Design-Test Traceability + 领域化拆分 + TDD 并行交付）

> Version: v1.0（Reviewed）  
> Owner: Design Review Required  
> Status: 已评审定稿（2026-09-04，决策记录见 §13）；S1 已交付（2026-09-04，命名统一 + schema v4 + ID 规范 + AC-NNN 表格化），S2-S4 待启动  
> 前置依赖：Phase 4.2 三级规格分层（已落地，见 phase-4.2-three-tier-spec-design.md 附录 A 遗留项）

---

# 1. 背景与动机

## 1.1 当前问题（用户提案 2026-09-04）

| #   | 痛点                 | 现状                                                                                                                                                                    |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Story 拆分无领域约束 | story-splitting 由 Agent 自由裁量，未按领域/子域边界拆分；一个需求对应多 Story 的拆分质量不稳定                                                                         |
| 2   | DU 拆分位置错位      | DU 拆分在 task 阶段（sdd-task「生成 Delivery Decomposition」），但 DU 是设计决策（怎么切实现单元），应属 design 阶段；task 应退化为「每个 DU 的任务清单」，直接指导 dev |
| 3   | Dev 无 TDD、无并行   | dev 按 DU 顺序实施，无红绿灯（先写失败测试再实现）约束；多 DU 之间本可并行，harness 未提供并行子 agent 的协调产物                                                       |
| 4   | 测试不独立           | 测试在 dev 完成后才写（test 阶段才执行），无隔离效果；验证意图应从 Spec 阶段建立，测试设计应独立于开发                                                                  |

## 1.2 核心主张（提案原文归纳）

- **Spec ≠ 一个 prd.md 文件**，而是可追踪的 Requirement / Acceptance Criteria 集合
- **Test ≠ 最后的测试报告**，而是从 Spec 阶段就建立的验证意图
- 三者构成三类「可验证规格」，通过 ID 建立 Traceability：

```text
Spec    定义"要做什么、做到什么算正确"     → prd/spec 中的 Requirements + AC
Design  定义"系统准备怎么实现 Spec"        → design 中的技术决策 + DU
Test    定义"如何证明实现满足 Spec/Design" → 测试用例 + Evidence
```

追踪链：

```text
REQ / AC  →  Design Decision  →  Delivery Unit  →  Implementation  →  Test Case  →  Evidence
(SPEC-AC)    (DES)               (DU)              (代码/commit)       (TC)          (EVD)
```

---

# 2. 核心模型

## 2.1 阶段职责重划（对应提案 1/2/4）

| 阶段               | 现状职责             | 4.3 新职责                                                                                               |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| story-splitting    | 拆 Story（自由裁量） | **领域化拆分**：按业务能力/子域边界拆，产出 Story 领域归属声明（§3）                                     |
| design（Story 级） | 技术设计             | 技术设计 + **DU 划分**（DU 列表、依赖声明、覆盖 AC 映射）——DU 是设计决策的一部分                         |
| task（Story 级）   | 拆 DU + 任务清单     | **逐 DU 任务分解**（消费 design 已定的 DU，不再拆）+ 产出顺序/依赖分层，产物直接指导 dev                 |
| dev                | 按 DU 实施           | **严格按 tasks.md 红绿灯执行**：每任务先写失败测试（红）→ 实现至通过（绿）；支持多 DU 并行子 agent（§5） |
| test               | dev 后执行测试       | **独立验证**：消费 task 阶段锁定的测试用例（TC），由独立上下文执行，产出 EVD 证据（§6）                  |

生命周期不变（Story: pending → specified → designed → tasked → developing → testing → completed），仅各阶段产物内涵调整——tasked 态从「tasks.md 就绪」变为「tasks.md + test-design.md 双产物就绪」。

## 2.2 Traceability ID 体系（对应提案 4）

ID 作用域原则：**各产物内唯一，跨产物用「产物归属 + ID」寻址**（Story 隔离在 story-metadata，Change 汇总不需要全局唯一）。

| ID              | 产物                                                | 含义                 | 下游被引用                         |
| --------------- | --------------------------------------------------- | -------------------- | ---------------------------------- |
| `AC-NNN`        | story-spec.md / spec.md（inline 即 Change 级 spec） | 验收标准             | design 决策 covers、TC verified-by |
| `DES-NNN`       | story-design.md                                     | 关键设计决策         | DU implemented-by 关联             |
| `DU-<REPO>-NNN` | story-design.md（4.3 起）→ tasks.md 引用            | 交付单元             | tasks.md 分解、tasks 按 DU 分组    |
| `TC-NNN`        | test-design.md（新增）                              | 测试用例（验证意图） | dev 红绿灯引用、test 阶段执行      |
| `EVD-<TC-NNN>`  | evidence/test-report.md                             | 执行证据             | convergence 汇总                   |

追踪链机检（Machine Gate 新增，Story 级）：

| 检查项           | 规则                                                                                       | severity                 |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| ac-coverage      | story-design 每个 DU 至少 covers 一个 AC-NNN，且引用的 AC 必须存在于 story-spec            | blocking                 |
| tc-coverage      | 每个 AC-NNN 至少被一个 TC-NNN verified-by（允许标注 `TC-NOT-TESTABLE: 理由`，进 warnings） | blocking                 |
| du-dependency    | DU dependencies 引用存在、无环                                                             | blocking                 |
| evidence-trace   | test-report 每 EVD 对应的 TC-NNN 必须存在于 test-design.md                                 | blocking                 |
| red-green-record | evidence 中每 DU 至少一条红→绿记录                                                         | advisory（防造假靠人审） |

## 2.3 三层规格的追踪关系图

```text
story-spec.md                story-design.md              test-design.md
┌──────────────┐   covers   ┌──────────────┐  decompose  ┌──────────────┐
│ AC-001 ...   │ ◄────────  │ DES-001      │             │ TC-001       │
│ AC-002 ...   │ ────────►  │ DU-BE-001    │ ──────────► │ TC-002       │
└──────────────┘  verified  │ DU-FE-001    │   tasks.md  └──────┬───────┘
        ▲                   └──────┬───────┘  (红绿灯执行)       │ execute（独立）
        │                          ▼                            ▼
        │                   implementation.md          evidence/test-report.md
        └──────────────────────────────────────────────────┘ EVD-TC-001: passed
                     convergence.md 汇总全链追踪表
```

---

# 3. Story 领域化拆分（提案 1）

## 3.1 方法论（注入 story-splitting 指令 / sdd-design SKILL）

拆分判据（按优先级）：

1. **领域边界优先**：Story 划在业务能力/子域边界上（feature-tree L3 即领域锚点），一个 Story 只落一个 L3 节点下的能力增量
2. **独立可验收**：每个 Story 有独立 AC 集，AC 不得跨 Story 重复
3. **变更局部性**：一个 Story 的 DU 尽量收敛在少数仓库（跨仓 Story 需在拆分时声明理由）
4. **1 需求 → N Story 是常态**：story-splitting 的默认检查不是「能否合成一个」，而是「按领域切分后每个是否独立可交付」

## 3.2 产物与机检

- story-splitting 产出 metadata stories[] 时，每 Story 条目新增 `domain:` 字段（填 L3 节点 ID + 名，inline 单 Story 自动继承 feature-path）
- 机检 `story-domain-boundary`（advisory）：多个 Story 的 domain 相同 → 提示合并评估；Story 无 domain → fail（blocking，防遗漏）

---

# 4. DU 拆分前移 design（提案 2）

## 4.1 story-design.md 新增 DU 划分章节

```markdown
## 5. DU 划分（Delivery Units）

| DU        | 仓库     | 职责（实现哪些 DES）        | covers AC      | depends on |
| --------- | -------- | --------------------------- | -------------- | ---------- |
| DU-BE-001 | backend  | 实现注册 API（DES-001/002） | AC-001         | —          |
| DU-FE-001 | frontend | 注册页面（DES-003）         | AC-001, AC-002 | DU-BE-001  |
```

- DU 拆分三判据：**单仓**（一个 DU 只落一个仓库）、**可独立红绿灯**（能独立写出失败测试）、**依赖显式**（depends on 声明，且无环）
- design Machine Gate：`du-defined`（DU 表存在且每 DU 覆盖 ≥1 AC）/ `du-dependency`（引用有效、无环）

## 4.2 task 阶段收窄为「逐 DU 任务分解」

- sdd-task 不再拆 DU：消费 story-design 的 DU 表，产出 `tasks.md`——按 DU 分组的任务清单，每任务声明 `verifies: TC-NNN`（红绿灯对象）
- tasks.md 模板改造：`## Delivery Units` 段从「定义 DU」改为「引用 design DU + 任务分解」，DU 行只允许引用不允许新造
- 机检 `du-source-of-truth`：tasks.md 中出现的 DU 必须与 story-design DU 表一致（blocking）
- `openspec change split-story` / story-metadata v4：DU 列表登记时机移到 design 验收后（tasked 前的 designed 态即可登记 du 框架，tasked 态补 tasks 路径）

---

# 5. Dev 红绿灯 + 并行子 agent（提案 3）

## 5.1 红绿灯执行协议（注入 sdd-dev SKILL）

每个任务条目的执行循环：

```text
红灯：按 TC-NNN 写测试 → 运行确认失败（失败原因必须是"功能未实现"，不是语法/环境错误）
绿灯：最小实现 → 测试通过 → 记录红绿灯证据
重构：绿灯后允许重构，重构后测试必须仍绿
```

- tasks.md 任务条目新增 `verifies: TC-NNN`；无 TC 的任务只能是 `type: docs/chore`（机检）
- evidence（DU 级）新增红绿灯记录表：TC-NNN / 红灯失败输出摘要 / 绿灯通过确认
- 机检 `red-green-record`（advisory）+ 人审抽核

## 5.2 并行子 agent 协调（v0.1 边界：harness 不调用模型）

harness 提供协调产物与状态回流，子 agent 调度由外部 IDE Agent 执行：

| 能力      | 实现                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| DU 指令包 | instruction-builder 按 DU 动态拼装（story 上下文 + 该 DU 任务 + 对应 TC），产出 `du/<DU-ID>/instruction.md` |
| 并行前提  | design 阶段 du-dependency 无环 + task 阶段产出「分层并行计划」（无依赖 DU 同层可并行）                      |
| 状态回流  | 已有 syncDuStatusFromRepos（repo→workspace 单向幂等）复用；子 agent 完成后各仓写 DU 完成标记                |
| 汇总      | dev 收尾执行 `implementation.md` 跨仓汇总 + du-fan-in 机检（已有）                                          |

CLI：`openspec workflow run --story <ID>` 增 `--du <DU-ID>` 提示模式，输出该 DU 的 instruction 包路径与并行计划。

---

# 6. 测试独立性（提案 4）

## 6.1 新增 test-design.md（Story 级，tasked 态产物）

```markdown
## 测试用例（验证意图，dev 开始前锁定）

| TC     | 验证方式     | verified-by AC | 归属 DU   | 备注                   |
| ------ | ------------ | -------------- | --------- | ---------------------- |
| TC-001 | API 集成测试 | AC-001         | DU-BE-001 |                        |
| TC-002 | E2E          | AC-002         | DU-FE-001 | TC-NOT-TESTABLE 不允许 |
```

- **产出时机**：task 阶段与 tasks.md 同批产出（双产物机检通过才进 tasked），先于任何 dev 执行——保证隔离
- **独立性**：test 阶段 Agent 上下文注入 test-design + spec/design，**不注入 implementation.md**（防「照实现写断言」）；执行仅按 TC 逐条运行并记 EVD
- 机检：`tc-coverage`（AC 全覆盖）/ `evidence-trace`（EVD ↔ TC 对齐）/ `test-independence`（test 阶段 instruction 不含 implementation 注入，context-rules 层面收口）

## 6.2 context-rules 改造

- tasked 阶段 read 增加 story-design（DU 表）——task 消费 DU 的来源
- test 阶段 change-artifacts 排除 implementation.md（隔离），新增 test-design.md

---

# 7. 命名统一收口（4.2 遗留项，并入本期）

- `prd.md → spec.md`、`change-prd.md → change-spec.md`：模板改名 + skill/gate/context/doctor 全部引用替换 + upgrade 增加 v3→v4 迁移（存量 CHG 文件改名，hash 失效按 stale 传播既有机制处理）
- 与 Traceability 同批落地的原因：AC 追踪表的宿主文件改名一次到位，避免两次迁移

---

# 8. Schema 与迁移

- metadata schema v3 → v4：stories[].domain；dus[] 移交 story-design 后 metadata dus[] 保留为状态冗余（权威源注释更新）；新增 test-design 产物登记
- upgrade：v3→v4 迁移（prd.md 改名 spec.md + stories[].domain 补默认值），幂等，可 --dry-run

---

# 9. Skill / Gate / CLI 改造矩阵

| Skill        | 改造                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| sdd-design   | + DU 划分章节方法论与示例；+ covers AC 映射；splitting 领域化判据                                                                             |
| sdd-task     | 收窄为逐 DU 任务分解；+ test-design.md 产出；verifies: TC 字段                                                                                |
| sdd-dev      | 红绿灯协议；DU 指令包消费；evidence 红绿灯记录表                                                                                              |
| sdd-test     | 独立验证流程（不读 implementation）；EVD 按 TC 记录                                                                                           |
| sdd-review   | 追踪链抽核（AC→DES→DU→TC→EVD 断链检查）                                                                                                       |
| sdd-converge | 汇总全链追踪表（各 Story 追踪覆盖统计）                                                                                                       |
| gate.yaml    | 新增机检：ac-coverage / tc-coverage / du-dependency / du-source-of-truth / evidence-trace / story-domain-boundary；red-green-record(advisory) |
| CLI          | workflow run --du 提示模式；story show 输出追踪链视图；upgrade v3→v4                                                                          |

---

# 10. 分 Story 交付计划

| Story | 内容                                         | 交付物                                                                                      |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| S1    | 命名统一 + schema v4 + Traceability ID 规范  | spec.md 改名收口 / upgrade 迁移 / ID 规范写入 standards + 各模板 AC-NNN 表格化              |
| S2    | 领域化拆分 + DU 前移 design                  | design/task SKILL + gate du-defined/du-dependency/du-source-of-truth + metadata domain 字段 |
| S3    | test-design 独立验证 + dev 红绿灯 + 并行支持 | test-design 模板与 gate / dev 红绿灯协议 / du 指令包 / context-rules 隔离                   |
| S4    | 追踪链机检收口 + review/converge 汇总视图    | evidence-trace / 追踪链视图 CLI / 文档回写                                                  |

每个 Story 独立 Gate（S1 完成后 2-4 可并行开发——本阶段自身也吃自己的狗粮）。

---

# 11. 风险与缓解

| 风险                                     | 等级 | 缓解                                                                                                       |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| ID 表格化增加 Agent 产物成本（样板膨胀） | 中   | 仅 Story 级强制 ID 表（Change 级 AC 保持叙述式，不强制）；light 档 tc-coverage 允许 `TC-NOT-TESTABLE` 标注 |
| 存量 v3 CHG 迁移破坏进行中状态           | 中   | 迁移只改名+补默认值，不动状态与 hash 语义；改名触发 stale 由既有机制 warn 提示                             |
| 红绿灯证据可造假                         | 低   | 机检 advisory 定位（确定性校验存在性），真实性靠 review 人审抽核                                           |
| 并行子 agent 冲突（同仓多 DU）           | 中   | task 分层计划：同仓同层 DU 串行提示；依赖无环机检前置                                                      |
| 改名（prd→spec）外部引用断裂             | 中   | doctor 报告遗留 prd.md 引用；upgrade 全量替换模板受管面                                                    |

---

# 12. 验收标准（Definition of Done）

- [ ] 追踪链机检：AC→DES→DU→TC→EVD 断链场景 Machine Gate 必 fail；tc-coverage 允许 NOT-TESTABLE 标注进 warnings
- [ ] task 阶段不再拆 DU：tasks.md 出现 design 未定义的 DU → fail；test-design 与 tasks.md 同批产出（双产物机检）
- [ ] dev 红绿灯：SKILL 协议 + evidence 记录表 + advisory 机检；test 阶段上下文不含 implementation.md（context-rules 断言）
- [ ] 并行：du-dependency 无环机检 + DU 指令包生成 + syncDuStatusFromRepos 回流汇总闭环
- [ ] 领域化：stories[].domain 机检 + 拆分判据写入 SKILL；多 Story 域重叠触发 advisory
- [x] 命名统一：新 Workspace 无 prd.md；存量经 upgrade v3→v4 改名后 workflow run 正常（S1 已交付：模板改名 + migrateChangeSchema 产物改名/artifacts 键重写/domain 继承，测试覆盖幂等与回滚审计）
- [ ] 全量测试通过；4.3 全链路集成测试（多 Story 多 DU 并行场景）跑通

---

# 13. 评审决策记录（2026-09-04 已确认）

| #   | 事项                    | 决策                                               | 理由/备注                                                                               |
| --- | ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | test-design 产出时机    | **A. tasked 双产物**                               | 与 tasks.md 同批产出，双产物机检通过才进 tasked；不加生命周期阶段，成本最低且隔离性足够 |
| 2   | Change 级 AC 是否 ID 化 | **A. 仅 Story 级**                                 | story-spec 的 AC-NNN 表格化；Change 级保持叙述式，避免样板膨胀与双重维护                |
| 3   | 红绿灯机检强度          | **A. advisory**                                    | 确定性检查只验存在性，真实性靠 review 人审抽核                                          |
| 4   | 命名统一范围            | **A. prd→spec + change-prd→change-spec，并入 S1**  | AC 宿主文件改名一次到位，避免两次迁移                                                   |
| 5   | 并行调度归属            | **A. harness 出指令包+状态回流，调度归外部 Agent** | 坚守「Workflow Engine 不执行 AI 推理」边界                                              |
