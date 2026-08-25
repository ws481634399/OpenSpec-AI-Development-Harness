# sdd-design Skill

> 角色：SDD 技术设计阶段执行者
> 阶段：design（requires-state: specified → produces-state: designed）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 design.md，不直接调模型

## 1. 角色与目标

sdd-design 是 SDD 生命周期第 3 阶段的 Skill。它的职责是：

- 读取上一阶段产物（prd.md + exploration.md）
- 基于工程规范（standards/engineering/）与现有实现代码上下文，写 design.md 的结构化字段（元信息/当前架构摘要/仓库影响数/风险初判）
- 推进 Change 状态到 designed
- 生成 Instruction，交外部 Agent 补充非结构化分析（现状详情/方案/数据变更/风险缓解/待澄清）

**sdd-design 不执行 AI。** 结构化字段由 core/sdd 纯函数填充，非结构化段落由外部 Agent 补充。

## 2. 执行流程

```
openspec skill run sdd-design --change <CHG-XXXX>
    ↓ 1. 校验 --change 指定 + Change 存在
    ↓ 2. 校验 Change.status === specified
    ↓ 3. 写 design.md（ArtifactWriter，填元信息 + 仓库清单等）
    ↓ 4. validateTransition(specified, designed) + patchStatus(designed)
    ↓ 5. 装配 Context（standards/ + product/ + implementation/）
    ↓ 6. 生成 Instruction 写入 .instruction.md
```

## 3. Artifact Contract

输出：`design.md`（基于 `templates/artifacts/design.md`）

### 结构化填充项

| 占位符 | 来源 |
|---|---|
| `{{change-id}}` | metadata.id |
| `{{prd-source}}` | `<CHG>/prd.md` |
| `{{from-state}}` | 当前 status（应=specified） |
| `{{to-state}}` | `designed` |
| `{{repos-involved}}` | metadata.repositories 数组拼接 |
| `{{repo-impact-count}}` | metadata.repositories.length |
| `{{need-migration}}` | 初始化 `no`（外部 AI 确认是否改） |
| 其余（current-pattern/proposal-summary/risk-level/...） | 空串，外部 AI 补 |

### 非结构化补充项（外部 AI）

- §1 当前状态（架构证据）
- §2 提议方案（设计细节）
- §3 仓库影响（每个仓库的修改概要）
- §4 数据变更（Migration）
- §5 风险与缓解
- §6 待澄清问题

## 4. 输入前置条件

- 必须 `--change`
- Change.status 必须为 `specified`
- prd.md 缺失不阻塞（warn 即可）

## 5. 行为规则

### Must

- specified → designed，不越级
- 写 design.md
- 推进状态到 designed
- 生成 Instruction

### Must Not

- 不直接调模型
- 不修改 standards/engineering/*.md（只能引用）
- 不修改 prd.md
- 不绕过 validateTransition 直接 patchStatus
