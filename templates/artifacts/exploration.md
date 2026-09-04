# Exploration（需求探索报告）

> 阶段：sdd-explore 产物
> 业界锚点：Discovery 文档（Problem → Evidence → Conflict → Recommendation）
> 输入：requirement.md（原文沉淀；本文件不复述原文，只做分析）
> 产出状态：exploring（推进 Change 状态）

本文档回答探索阶段的五个问题：需求要点是什么、归属哪个 Story（是否已存在）、证据是否充分、有无冲突点、还有什么待澄清。

<!-- 结构化字段（{{placeholder}}）由 sdd-explore 通过 ArtifactWriter 填充；
     非结构化段落由外部 Agent 按 Instruction 补充。 -->

## 1. 需求要点

<!-- 不是复述原文：把需求拆成可引用的最小要点集——做什么 / 给谁 / 解决什么问题。
     后续 story-spec / change-prd 引用这里的要点编号，而不是回贴原文。 -->

- {{requirement-points}}

## 2. Story 归属判定

<!-- 查 product/feature-tree.yaml：先定位 Feature，再判定 Story 节点是否已存在。
     已存在 → 直接挂靠（记录 feature-path）；不存在 → 新建 candidate（标 pending，见 change-lifecycle.md）。 -->

- Feature ID: {{feature-id}}
- Story 节点: {{story-id}}（已存在 / 不存在）
- 是否新建 candidate: {{is-new-candidate}}
- Feature 路径: {{feature-path}}

## 3. 证据评估

<!-- 需求的业务依据是否充分：用户反馈 / 数据支撑 / 合规要求 / 业务目标对齐。
     证据不足不阻断探索，但必须列明缺口（写入 §5 待澄清），供 prd 阶段权衡范围。 -->

- 证据类型与来源:
- 结论: {{evidence-verdict}}（充分 / 不足——不足时在 §5 列明补充项）

## 4. 冲突点检测

<!-- 三类冲突逐项检查：
     a) 与 product/specs/ 已确认产品规则冲突；
     b) 与进行中 / 归档 Change 的范围重叠（可沿用则记录沿用决策，见 change-lifecycle.md）；
     c) 与 feature-tree 已规划 Story 重复或矛盾。
     有冲突不阻断，但必须给出处理决策。 -->

- 与 product/specs/ 规则冲突:
- 与既有 Change 重叠或沿用: {{reuse-decision}}（匹配进行中 / 匹配归档 / 无）
- 与已规划 Story 重复:
- 处理决策: {{conflict-resolution}}

## 5. 待澄清问题

<!-- 探索阶段无法确认的问题（含证据缺口），留待 prd / design 阶段澄清
     （context-rules v0.4 起 exploration 随交接注入下游，此清单会被下游直接看到）。 -->

-
