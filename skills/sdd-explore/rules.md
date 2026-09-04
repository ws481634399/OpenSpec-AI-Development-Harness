# sdd-explore Rules

> sdd-explore 约束规则（对齐 SDD 标准）

## R1. Change 驱动

- 每次需求探索必须通过 Change 管理（创建或复用 CHG）
- 不允许跳过 Change 直接修改代码或知识

## R2. Feature 归属必须判定

- 必须读取 product/feature-tree.yaml 判断 Feature 归属
- 命中：记录 feature id
- 未命中：必须创建 Candidate（product/features/FEAT-CANDIDATE-NNNN.md，status:pending）
- 不允许"未判定"状态

## R3. FeatureModel 只读

- FeatureModel（readFeatureTree / findFeature / featurePath）只读
- Candidate 写入由 CandidateRepository.writeCandidate 负责
- 不允许 FeatureModel 同时负责查询与 Candidate 生命周期

## R4. 冲突点检测（含旧需求沿用）

- 必须执行 findChangeByRequirement 查进行中 Change
- 命中进行中 Change → 用户决策（沿用/新建），不自动沿用
- 新建时 runChangeCreate 自动查 archive 写 related-change
- archived 匹配不自动复用，仅记录关联
- 必须检查三类冲突：product/specs/ 已确认规则 / 既有 Change 范围重叠 / feature-tree 已规划 Story 重复
- 有冲突不阻断，但必须给出处理决策（conflict-resolution 必填）

## R5. Skill 不调模型

- sdd-explore 不执行 AI
- 结构化字段由 core/sdd 纯函数填充
- 非结构化分析（需求要点/Story 归属/证据评估/冲突检测/待澄清）由外部 Agent 按 Instruction 补充
- OpenSpec 只装配上下文、生成 Instruction、管理 Artifact

## R6. 状态迁移合法

- 必须经 validateTransition 校验（created → exploring）
- 不允许跳阶段（如 created → specified）
- 状态推进通过 patchStatus 写入 metadata

## R7. Artifact 通过 ArtifactWriter 写入

- requirement.md / exploration.md 通过 ArtifactWriter 写入
- 模板来自 templates/artifacts/（Harness 资产）
- front-matter 用 parseDocument + setIn 改写（保留注释）
- 正文 {{placeholder}} 替换为结构化字段值

## R8. Instruction 必须输出

- InstructionBuilder 生成 Instruction Markdown
- Instruction 写入 <changeDir>/.instruction.md（供外部 Agent 读取）
- Instruction 输出到终端（note）
- Instruction 含推进状态命令提示
