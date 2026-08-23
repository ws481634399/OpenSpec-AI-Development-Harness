# sdd-explore Skill

> 角色：SDD 需求探索阶段执行者
> 阶段：explore（requires-state: created → produces-state: exploring）
> 定位：流程编排者——调用 core/sdd 基础能力，产出 Artifact，不直接调模型

## 1. 角色与目标

sdd-explore 是 SDD 生命周期的入口 Skill。它的职责是：

- 理解用户需求，沉淀为 requirement.md
- 判断需求是否匹配已有进行中 Change（旧需求沿用策略）
- 创建或复用 CHG 载体
- 判断需求在 Feature Tree 中的归属（命中记录 / 未命中创建 Candidate）
- 产出 exploration.md（结构化字段 + 非结构化分析占位）
- 推进 Change 状态到 exploring
- 生成 Instruction 交外部 Agent 补充非结构化分析

**sdd-explore 不执行 AI。** 结构化字段由 core/sdd 纯函数填充，非结构化段落（需求理解 / 影响分析 / 未知问题）由外部 Agent（Trae / Cursor / Claude Code）按 Instruction 补充。

## 2. 执行流程

```
openspec skill run sdd-explore
    ↓ 1. 收集 Requirement（@clack：已登记 REQ-XXX / 直接输入 title + content）
    ↓ 2. 查找已有 Change（findChangeByRequirement）
    ↓ 3. 创建或复用 CHG（runChangeCreate，内部自动查 archive 写 related-change）
    ↓ 4. Feature Tree 匹配（readFeatureTree + findFeature）
       ├─ 命中 → 记录 feature id，填入 exploration.md 与 metadata.features
       └─ 未命中 → CandidateRepository.writeCandidate（product/features/FEAT-CANDIDATE-NNNN.md）
    ↓ 5. 写 requirement.md（ArtifactWriter，填 front-matter + {{requirement-content}}）
    ↓ 6. 生成 exploration.md（ArtifactWriter，结构化字段填充 + 非结构化段保留占位）
    ↓ 7. 更新 Change State（patchMetadata features + validateTransition + patchStatus exploring）
    ↓ 8. 生成 Instruction（InstructionBuilder，引导外部 AI 补充 exploration.md 非结构化分析）
```

## 3. 旧需求沿用策略

对齐 change-lifecycle.md §8.6：

- 用户提供 REQ-XXX 或 title → `findChangeByRequirement` 查进行中 Change
- 命中进行中 Change → @clack select：沿用现有 CHG / 新建
- 新建 → `runChangeCreate`（内部自动查 archive 写 `related-change`）
- 决策逻辑抽纯函数（候选清单 + 用户选择 → 动作），@clack 只收集选择

## 4. Feature 归属与 Candidate

- `readFeatureTree` + `findFeature` 判定归属（FeatureModel 只读）
- 命中 → 记录 feature id，填入 exploration.md 的 `{{feature-id}}` / `{{feature-path}}` 与 metadata.features
- 未命中 → `CandidateRepository.writeCandidate`（`product/features/FEAT-CANDIDATE-NNNN.md`，status:pending）
- FeatureModel 保持只读，Candidate 生命周期由 CandidateRepository 负责

## 5. Instruction 输出

InstructionBuilder 输出 Instruction Markdown：

- Skill 角色与目标
- Workspace Context 摘要（standards/ + product/ 文件清单）
- 用户输入原文
- Artifact 模板引用（exploration.md 待补充段落：需求理解 / 影响分析 / 未知问题）
- 外部 Agent 执行指引

Instruction 输出到终端（`note`）+ 写入 CHG 目录（`<changeDir>/.instruction.md`，供外部 Agent 读取）。

## 6. 行为规则

### Must

- 遵循 SDD 工作流（created → exploring）
- 加载所需上下文（standards/sdd/ + product/）
- 产出 requirement.md + exploration.md
- 记录 Feature 归属（命中或 Candidate）
- 推进 Change 状态到 exploring
- 生成 Instruction 交外部 Agent

### Must Not

- 不跳过必经阶段
- 不直接调模型（OpenSpec 不执行 AI）
- 不直接写文件（通过 ArtifactWriter / CandidateRepository）
- 不修改 feature-tree.yaml（FeatureModel 只读，Candidate 待人工 review）
- 不假设需求归属（未命中必须创建 Candidate）
