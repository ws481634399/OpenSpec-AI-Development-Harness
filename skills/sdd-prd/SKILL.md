# sdd-prd Skill

> 角色：SDD 产品规格阶段执行者
> 阶段：prd（requires-state: exploring → produces-state: specified）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 prd.md，不直接调模型

## 1. 角色与目标

sdd-prd 是 SDD 生命周期第 2 阶段的 Skill。它的职责是：

- 读取上一阶段产物（exploration.md + requirement.md）
- 基于 SDD 规范与 Product World 知识，写 prd.md 的结构化字段（元信息/目标用户/范围摘要）
- 推进 Change 状态到 specified
- 生成 Instruction，交外部 Agent 补充非结构化分析（背景/用户价值/范围/业务规则/验收标准）

**sdd-prd 不执行 AI。** 结构化字段由 core/sdd 纯函数填充，非结构化段落由外部 Agent（Trae/Cursor/Claude Code）按 Instruction 补充。

## 2. 执行流程

```
openspec skill run sdd-prd --change <CHG-XXXX>
    ↓ 1. 校验 --change 指定 + Change 存在
    ↓ 2. 校验 Change.status === exploring（requires-state）
    ↓ 3. 读 metadata.requirement / metadata.features 填充元信息
    ↓ 4. 写 prd.md（ArtifactWriter，填结构化占位符 + 保留非结构化段占位）
    ↓ 5. validateTransition(exploring, specified) + patchStatus(specified)
    ↓ 6. 装配 Context（context-rules.yaml[prd].read: product/ + delivery/）
    ↓ 7. 生成 Instruction（含 SKILL.md + checklist + rules）写入 .instruction.md
```

## 3. Artifact Contract

输出：`prd.md`（基于 `templates/artifacts/prd.md`）

### 结构化填充项（sdd-prd 自动填）

| 占位符 | 来源 |
|---|---|
| `{{change-id}}` | metadata.id |
| `{{requirement}}` | metadata.requirement |
| `{{feature-id}}` | metadata.features[0] 或空 |
| `{{from-state}}` | 当前 status（应=exploring） |
| `{{to-state}}` | `specified` |
| `{{target-user}}` | 留空（外部 AI 补） |
| `{{pain-points}}` | 留空 |
| `{{expected-value}}` | 留空 |
| `{{scope-in}}` | 留空 |
| `{{scope-out}}` | 留空 |

### 非结构化补充项（外部 AI 按 Instruction 填）

- §1 背景
- §2 用户价值详细描述
- §3 范围详细清单
- §4 业务规则
- §5 验收标准 checklist

## 4. 输入前置条件

- 必须 `--change <CHG-XXXX>`（CLI 校验）
- Change.status 必须为 `exploring`（由 patchStatus 前 validateTransition 再校验一次）
- CHG 目录必须存在 exploration.md + requirement.md（若缺失则 warn，但不阻塞，继续写 prd.md）

## 5. Instruction 输出

Instruction 包含：
- Skill 角色与目标
- Workspace Context（product/ + delivery/ 文件清单）
- 上一阶段产物引用（exploration.md + requirement.md）
- Artifact prd.md 待补充段落指引
- checklist.md 质量检查项
- rules.md 约束规则
- 推进状态指引：完成后 `openspec change status <CHG> --set specified`（本 Skill 已自动推进，但作为一致性提醒保留）

## 6. 行为规则

### Must

- 遵循 SDD 工作流（exploring → specified）
- 加载所需上下文（product/ + delivery/）
- 产出 prd.md 至 CHG 目录
- 推进 Change 状态到 specified
- 生成 Instruction 并写入 CHG/.instruction.md

### Must Not

- 不跳过必经阶段（禁止 created → specified 越级）
- 不直接调模型（OpenSpec 不执行 AI）
- 不修改已批准的知识（product/specs/ 仅人工 review 后写入）
- 不删除或覆写 exploration.md、requirement.md
- 不绕过 validateTransition 直接 patchStatus
