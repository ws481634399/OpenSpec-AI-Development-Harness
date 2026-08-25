# sdd-converge Skill

> 角色：SDD 知识沉淀阶段执行者
> 阶段：converge（requires-state: testing → produces-state: completed）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 convergence.md

## 1. 角色与目标

sdd-converge 是 SDD 生命周期第 7 阶段的 Skill。它的职责是：

- 读取全部阶段产物（exploration → prd → design → tasks → implementation → evidence）
- 写 convergence.md 结构化字段（元信息/完成时间/4 个知识项的 need-update 默认值）
- 推进 Change 状态到 completed
- 生成 Instruction，交外部 Agent 判断是否需回写 standards/product/ 知识，并记录知识沉淀过程

**注意**：真正的 standards/product/ 改动由人工 review 后执行（或外部 Agent 建议+人工确认），OpenSpec 本 Skill 只记录判断过程。

## 2. 执行流程

```
openspec skill run sdd-converge --change <CHG-XXXX>
    ↓ 1. 校验 --change + Change.status === testing
    ↓ 2. 写 convergence.md
    ↓ 3. validateTransition(testing, completed) + patchStatus(completed)
    ↓ 4. 装配 Context（delivery/ + implementation/）
    ↓ 5. 生成 Instruction
```

## 3. Artifact Contract

输出：`convergence.md`（基于 `templates/artifacts/convergence.md`）

### 结构化填充项

| 占位符 | 来源 |
|---|---|
| `{{change-id}}` | metadata.id |
| `{{completed-at}}` | `new Date().toISOString()` |
| `{{from-state}}` | 当前 status |
| `{{to-state}}` | completed |
| `{{artifact-count}}` | 空（外部 AI 填写本 Change 产出 Artifact 数） |
| `{{knowledge-delta}}` | 空（外部 AI 总结知识增量） |
| `{{standards-need-update}}` | 初始化 `no`（外部 AI 改） |
| `{{product-need-update}}` | 初始化 `no`（外部 AI 改） |
| `{{featuretree-need-update}}` | 初始化 `no`（外部 AI 改） |
| `{{glossary-need-update}}` | 初始化 `no`（外部 AI 改） |

### 非结构化补充项（外部 AI）

- §1 知识变化总结（新规则/新模式/新术语/新 Feature）
- §2 每个知识项（Standards/Product/FeatureTree/Glossary）的具体更新内容与理由
- §3 知识沉淀过程：已写回/待后续/为什么
- §4 完成确认 checklist 打勾

## 4. 输入前置条件

- 必须 `--change`
- Change.status 必须为 `testing`
- 若 evidence/test-report.md 缺失，不阻塞（warn 即可）

## 5. 行为规则

### Must

- testing → completed
- 写 convergence.md
- 推进状态到 completed

### Must Not

- 不越级
- **不直接修改 standards/ 或 product/**——知识更新需外部 Agent 建议 + 人工确认后执行
- 不修改前序 Artifact
- 不绕过 validateTransition 直接 patchStatus

## 6. 归档建议

推进到 completed 后，可在人工 review 确认收敛完成后执行：
```
openspec change archive <CHG-XXXX>
```
归档后状态为 archived，CHG 目录被移动到 delivery/archive/。
