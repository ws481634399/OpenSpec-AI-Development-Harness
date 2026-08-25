# sdd-test Skill

> 角色：SDD 测试阶段执行者
> 阶段：test（requires-state: developing → produces-state: testing）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 evidence/test-report.md

## 1. 角色与目标

sdd-test 是 SDD 生命周期第 6 阶段的 Skill。它的职责是：

- 读取上一阶段产物（implementation.md + tasks.md）
- 写 evidence/test-report.md 结构化字段（元信息/测试执行时间）
- 推进 Change 状态到 testing
- 生成 Instruction，交外部 Agent 实际运行测试并回填测试结果

**注意**：真正的测试执行由外部 Agent 触发（npm test / mvn test / pytest 等）。OpenSpec 只把结果记录在 Artifact。

## 2. 执行流程

```
openspec skill run sdd-test --change <CHG-XXXX>
    ↓ 1. 校验 --change + Change.status === developing
    ↓ 2. 写 evidence/test-report.md
    ↓ 3. validateTransition(developing, testing) + patchStatus(testing)
    ↓ 4. 装配 Context（delivery/ + implementation/）
    ↓ 5. 生成 Instruction
```

## 3. Artifact Contract

输出：`evidence/test-report.md`（基于 `templates/artifacts/evidence/test-report.md`，写入 `<CHG>/evidence/test-report.md`）

### 结构化填充项

| 占位符 | 来源 |
|---|---|
| `{{change-id}}` | metadata.id |
| `{{implementation-source}}` | `<CHG>/implementation.md` |
| `{{from-state}}` | 当前 status |
| `{{to-state}}` | testing |
| `{{tested-at}}` | `new Date().toISOString()` |
| `{{test-scope}}` | 空（外部 AI 填写范围） |
| `{{pass-rate}}` | 空（外部 AI 填执行结果） |

### 非结构化补充项（外部 AI）

- §1 测试范围详细
- §2 执行汇总表（按分类填数）
- §3 证据清单（引用其他证据文件、截图、报告链接）

## 4. 证据目录约定

- 证据文件统一写在 `<CHG>/evidence/` 内（如 screenshots/、logs/）
- test-report.md §3 列出清单（相对路径或链接）
- 不把二进制大文件（截图视频）写进 Git，建议上传并贴链接

## 5. 行为规则

### Must

- developing → testing
- 写 evidence/test-report.md
- 推进状态到 testing

### Must Not

- 不越级
- 不修改 implementation.md / tasks.md / design.md / prd.md
- 不绕过 validateTransition 直接 patchStatus
