# sdd-prd Rules

sdd-prd 阶段必须遵守的硬约束（对应 change-lifecycle.md §7 与 backend/product standards）。

## R1：生命周期约束

- 必须在 `exploring` 状态启动，输出后推进到 `specified`
- 禁止越级（如 created → specified 或 exploring → designed）
- 若 Change 已推进到 exploring 之后的状态，该 Skill 直接抛错拒绝执行

## R2：Artifact 写入约束

- 只写 `spec.md`，不得覆写 exploration.md 或 requirement.md
- 写入使用 ArtifactWriter，保留模板注释与 front-matter（如适用）
- 结构化占位符缺失时以空串填充，不报错（由外部 AI 后续补全）

## R3：知识写入约束

- **禁止直接写入 `product/specs/`**——晋升门槛：① Agent 将需求中确认的产品规则**总结成 SPEC 草稿**（留在 Change 内）；② 人工评审通过后晋升进 specs。Agent 不得绕过人工评审直接写入
- 不得修改 `product/feature-tree.yaml`（Feature 归属在 sdd-explore 阶段已完成）

## R4：状态推进约束

- patchStatus 前必须调用 `validateTransition(current, 'specified')`，不允许绕过
- 即使 artifact 尚未写完，也不得提前推进状态（先写 artifact，再 patchStatus）
