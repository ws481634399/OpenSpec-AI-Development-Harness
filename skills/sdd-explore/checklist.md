# sdd-explore Checklist

> sdd-explore 执行质量检查清单

## Artifact 产出

- [ ] requirement.md 已写入 CHG 目录
  - [ ] front-matter.id 填充（REQ-XXX 或空）
  - [ ] front-matter.name 填充（与 metadata.title 一致）
  - [ ] front-matter.content 填充（需求原文）
  - [ ] front-matter.created-at 填充（ISO8601）
  - [ ] 正文 {{requirement-content}} 已替换
- [ ] exploration.md 已写入 CHG 目录
  - [ ] {{requirement-points}} 填充（需求要点集）
  - [ ] {{feature-id}} 填充（命中 Feature id 或空）
  - [ ] {{story-id}} 填充（Story 节点 id，已存在/不存在）
  - [ ] {{feature-path}} 填充（Feature 层级路径或空）
  - [ ] {{is-new-candidate}} 填充（yes/no）
  - [ ] {{evidence-verdict}} 填充（充分/不足）
  - [ ] {{reuse-decision}} 填充（匹配进行中/匹配归档/无）
  - [ ] {{conflict-resolution}} 填充（冲突处理决策或"无"）
  - [ ] 非结构化段（证据明细/冲突明细/待澄清）由外部 Agent 补充

## Change 状态

- [ ] metadata.features 已更新（命中 Feature 时填入）
- [ ] metadata.status 已推进到 exploring
- [ ] metadata.updated-at 已更新
- [ ] 状态迁移合法（created → exploring，经 validateTransition 校验）

## Story 归属

- [ ] 已读取 product/feature-tree.yaml
- [ ] 命中 Feature → feature id 记录到 metadata.features 与 exploration.md
- [ ] Story 节点存在性已判定（已存在挂靠 / 不存在新建）
- [ ] 未命中 → CandidateRepository.writeCandidate 已创建 FEAT-CANDIDATE-NNNN.md

## 冲突点检测

- [ ] 已执行 findChangeByRequirement 查进行中 Change
- [ ] 命中进行中 Change → 用户已决策（沿用/新建）
- [ ] 新建时 runChangeCreate 已查 archive 写 related-change（若有匹配）
- [ ] 已检查 product/specs/ 规则冲突与已规划 Story 重复
- [ ] 冲突处理决策（conflict-resolution）已填写

## Instruction

- [ ] InstructionBuilder 已生成 Instruction
- [ ] Instruction 写入 <changeDir>/.instruction.md
- [ ] Instruction 输出到终端
- [ ] Instruction 含外部 Agent 执行指引（推进状态命令）
