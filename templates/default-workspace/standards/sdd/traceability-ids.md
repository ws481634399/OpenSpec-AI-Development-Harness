# 追踪链 ID 规范（Traceability IDs）

> 来源：Harness Phase 4.3（plans/phase-4.3-traceability-tdd-design.md §2.2）
> 适用范围：Story 级产物（story-spec / story-design / tasks / test-design / test-report）；
> inline 单 Story 模式下由 spec.md 等价承载。
> 变更规则：本文件由 Harness 升级维护，项目不应手工改写 ID 语义。

## 1. ID 体系总表

| ID              | 产物（定义处）                | 含义                 | 下游被引用                         |
| --------------- | ----------------------------- | -------------------- | ---------------------------------- |
| `AC-NNN`        | story-spec.md / spec.md（inline） | 验收标准         | design 决策 covers、TC verified-by |
| `DES-NNN`       | story-design.md               | 关键设计决策         | DU implemented-by 关联             |
| `DU-<REPO>-NNN` | story-design.md → tasks.md 引用 | 交付单元           | tasks.md 分解、tasks 按 DU 分组    |
| `TC-NNN`        | test-design.md                | 测试用例（验证意图） | dev 红绿灯引用、test 阶段执行      |
| `EVD-<TC-NNN>`  | evidence/test-report.md       | 执行证据             | convergence 汇总                   |

## 2. 编号规则

1. **三位数字递增**：`AC-001`、`AC-002`…（DES/TC 同规则；DU 已有既有规范 `DU-<REPO>-NNN`）。
2. **作用域**：各产物内唯一，跨产物用「产物归属 + ID」寻址（如 `story-spec.md#AC-001`）；
   Story 隔离在各自 story-metadata，Change 汇总不要求全局唯一。
3. **稳定性**：编号一旦确认保持稳定，**删除条目不复用编号**（避免历史证据/报告引用悬空）。
4. **可测试性**：每条 AC 必须可判定（给定…当…则… 或等价描述），拒绝"界面友好"类模糊表述。

## 3. 引用关系（追踪链）

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

## 4. Change 级边界

Change 级 change-spec.md §5「全局验收标准」保持叙述式（不做 AC-NNN 编号化），
Story 级验收标准在 story-spec.md 表格化，避免样板膨胀与双重维护。
