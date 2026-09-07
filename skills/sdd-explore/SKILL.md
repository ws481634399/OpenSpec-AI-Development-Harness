# sdd-explore: 需求探索

> 阶段: explore
> 状态转换: created → exploring
> 产出: requirement.md + exploration.md
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/explore/persona-explore.md

## 前置条件

- Workspace 已初始化（`openspec init` 已执行）
- Change 处于 `created` 状态（或全新创建）

## 执行步骤

### 0. 检查用户提供的参考文档

询问用户是否有外部文档（需求规格、架构设计、API 文档等）。

**如果用户提供了文档路径（如 `docs/需求.md`）：**

1. 读取指定文档
2. 提取需求信息、技术约束、业务规则
3. 将提取内容作为需求分析的输入上下文
4. 创建 CHG 后，将原始文档复制到 `delivery/changes/<CHG>/references/` 归档
5. 在 exploration.md 的"参考文档"段落列出引用的文件

**如果用户没有外部文档：**

- 直接进入步骤 1，向用户询问需求

> references/ 用途：CHG 创建时自动生成的归档目录，Agent 将用户提供的原始文档复制进去，
> 保持 CHG 自包含、可追溯。用户无需手动操作此目录。

### 1. 询问用户需求

向用户提问，收集以下信息：

- **需求标题**：一句话概括需求（10-30 字）
- **需求来源 ID**：如 REQ-001（可选，无登记时留空）
- **详细描述**：需求的完整内容、背景、目标

#### 1.1 需求收集方法论

用户描述往往不完整或模糊。Agent 需要主动澄清：

**识别需求类型：**

- 新功能开发 — 用户描述了新的产品能力
- 现有功能改进 — 用户描述了对已有功能的修改
- 缺陷修复 — 用户描述了不符合预期的行为
- 技术重构 — 用户描述了代码/架构层面的调整

**主动澄清清单（按需提问，不要一次性全部抛出）：**

- 功能边界：这个功能包含什么操作？不包含什么？
- 触发条件：用户在什么场景下会使用这个功能？
- 预期结果：操作完成后用户看到什么？系统状态如何变化？
- 约束条件：有没有性能、安全、兼容性方面的要求？
- 优先级：这是必须的（P0）、应该有的（P1）、还是可以有的（P2）？

**当需求描述过于模糊时（如"做个用户管理"），Agent 应主动追问：**

- "用户管理具体包含哪些操作？注册、登录、权限分配、资料编辑？"
- "面向什么用户角色？普通用户、管理员、还是两者都有？"
- "有没有参考的竞品或现有系统？"

#### 1.2 需求结构化

将用户描述结构化为：

- **核心动词**：用户要做什么（注册、查询、导出、审批...）
- **操作对象**：操作的目标实体（用户、订单、报表...）
- **业务约束**：隐含的业务规则（权限、时效、唯一性...）
- **利益相关者**：谁提出、谁受影响、谁审批

### 2. 知识检索（调用 sdd-knowledge 能力 D）

读取 `skills/sdd-knowledge/SKILL.md`，执行「能力 D：知识检索」段落。

#### 2.1 检索策略

**关键词提取：**

- 从需求描述中提取 3-5 个关键词（核心动词 + 操作对象 + 业务域）
- 示例：需求"用户注册时发送欢迎邮件" → 关键词：`用户注册`、`邮件通知`、`用户生命周期`

**检索范围：**

- `standards/` — 查找已有的技术规范（编码规范、架构决策）
- `product/` — 查找已有的业务知识（业务流程、领域模型）

**检索目的：**

- 避免重复探索已有知识
- 发现潜在冲突（需求是否与已有 standards 矛盾）
- 复用已有设计决策（如已有的认证方案）

#### 2.2 检索结果处理

- **命中且相关**：将关键结论引用到 exploration.md 的"需求要点"
- **命中但不相关**：记录但不引用
- **未命中**：标记为"无历史知识参考"，需独立探索

### 3. 创建 Change

```bash
openspec change create --title "<需求标题>" --requirement <REQ-XXX>
```

记录返回的 CHG-XXXX 和路径。

如果已有匹配 REQ-XXX 的 Change：

- 询问用户：沿用现有 CHG 还是新建
- 沿用：确认状态为 `created` 后复用
- 新建：执行上面的 create 命令

### 4. 生成/匹配 Feature Tree（调用 sdd-feature-tree）

读取 `skills/sdd-feature-tree/SKILL.md` 并执行。

Phase 2.4：Feature Tree 为固定四级结构（L1 → L2 → L3 → Story），
ID 采用层级嵌套编码（如 `FEAT-001-02-03` / `STORY-001-02-03-01`）。

#### 4.1 Feature 匹配策略

**匹配优先级：**

1. Story 级匹配 — 是否已有相同 Story（最小产品能力节点）
2. L3 匹配 — 是否属于已有 L3 节点（新增 Story）
3. L2/L1 匹配 — 是否需要新建 L3/L2/L1
4. Candidate 兜底 — 树中找不到合理归属时产出 Candidate（见 §4.2）

**匹配判断方法：**

- 语义相似度：需求核心动词 + 操作对象是否与现有 Story 描述一致
- 功能包含关系：需求是否是现有节点的子能力
- 业务域归属：需求涉及的数据实体是否属于现有分支

**当匹配不确定时：**

- 向用户展示候选 Feature Path（四级链）
- 说明匹配理由
- 请用户确认或指定其他路径

#### 4.2 Candidate 兜底（Phase 2.4 §17.4）

需求无法映射到现有树且用户暂不能确认新建节点时：

- 按 sdd-feature-tree 规则产出 Candidate（product/features/ 下 pending 文件）
- 绑定 Change feature-path 时标记 `--candidate`
- Candidate 未晋升（candidate: true）的 CHG 无法进入 task 阶段（gate 链阻断）
- 用户确认晋升后重新执行 bind-feature-path（不带 --candidate）完成绑定

### 5. 写 requirement.md

读取模板 `templates/artifacts/requirement.md`，按结构填写。

Front-matter 格式：

```yaml
---
id: "REQ-001"
name: "需求标题"
content: "需求描述"
source: user
created-at: "2026-01-01T00:00:00Z"
---
```

正文写入 `## 需求描述` section，内容为用户提供的原始需求文本（保持用户原话，不做改写）。

写入 `delivery/changes/<CHG>/requirement.md`。

### 6. 写 exploration.md

读取模板 `templates/artifacts/exploration.md`，按结构填写。

探索五问（模板五节与此一一对应）：**要点是什么、归属哪、证据够不够、有没有冲突、什么待澄清**。

占位符替换：

- `{{requirement-points}}`：需求要点集（拆解原文，不复述原文）
- `{{feature-id}}`：步骤 4 获取的 Feature ID
- `{{story-id}}`：Story 节点 ID（已存在 / 不存在）
- `{{feature-path}}`：步骤 4 获取的 Feature 路径
- `{{is-new-candidate}}`：是否新建 candidate
- `{{evidence-verdict}}`：证据评估结论（充分 / 不足）
- `{{reuse-decision}}`：与既有 Change 的重叠/沿用判定（匹配进行中 / 匹配归档 / 无）
- `{{conflict-resolution}}`：冲突处理决策（无冲突时写"无"）

#### 6.1 探索分析（正文段落）

**需求要点（§1）：**

- 把原文拆成最小要点集：做什么 / 给谁 / 解决什么问题（表面描述 vs 实际意图）
- 标注隐含需求（用户没说出口的：安全性、性能、兼容性）

**Story 归属判定（§2）：**

- 引用步骤 4 的匹配结论：命中现有 Story / 挂靠现有 Feature 新增 Story / 新建 candidate

**证据评估（§3）：**

- 列出业务依据：用户反馈 / 数据支撑 / 合规要求 / 业务目标对齐
- 证据不足不阻断，但必须写明缺口并列入 §5 待澄清

**冲突点检测（§4）：**

- 与 product/specs/ 已确认产品规则是否冲突？
- 与进行中 / 归档 Change 范围是否重叠（可沿用则记录决策）？
- 与 feature-tree 已规划 Story 是否重复或矛盾？
- 每项冲突给出处理决策

**待澄清问题（§5）：**

- 需求中哪些部分不够明确，需要后续阶段（prd 产出 spec.md / design）澄清？
- 证据缺口汇总（context-rules v0.4 起 exploration 会注入下游，此清单下游直接可见）

将步骤 2 检索到的历史知识整合到分析中，标注引用来源。

### 7. 绑定 feature-path（Phase 2.4）

将步骤 4 确认的 Story 绑定到 Change（写入 metadata.feature-path 四级链）：

```bash
openspec change bind-feature-path <CHG> --story <STORY-ID>
```

- 命令从 `product/feature-tree.yaml` 推导完整四级链（含各层 name），无需手动构造
- Candidate 场景加 `--candidate` 标记（§4.2）
- 绑定后 metadata.features 扁平索引自动刷新（v2 兼容字段）
- 未绑定 feature-path 的 Change 无法进入 task/dev/test 阶段

## 产出草稿

- `delivery/changes/<CHG>/requirement.md` — 需求文档
- `delivery/changes/<CHG>/exploration.md` — 探索分析

## 质量自检

产出前自检：

- [ ] 需求标题是否 10-30 字，能独立表达需求意图？
- [ ] 需求描述是否保持用户原话，未做主观改写？
- [ ] Feature Path（四级链）归属是否经用户确认？
- [ ] 是否已执行 `openspec change bind-feature-path`（或明确标记 Candidate）？
- [ ] exploration.md 需求要点是否为拆解分析（不是复述原文）？
- [ ] Story 归属判定是否明确（已存在挂靠 / 新建 candidate）？
- [ ] 证据评估是否给出结论？不足时缺口是否已列入待澄清？
- [ ] 冲突点检测是否覆盖 specs 规则 / 既有 Change / 已规划 Story 三类？
- [ ] 待澄清问题是否明确列出，待 prd 阶段解决？
- [ ] 是否引用了相关历史知识（如有）？

## 用户确认

将 requirement.md 和 exploration.md 草稿展示给用户：

- 需求描述是否准确？
- Story 归属是否合理？
- 证据是否充分？冲突处理决策是否合理？待澄清问题是否需要现在澄清？

用户确认后执行：

```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set exploring
```

## 工作示例

> 完整示例参考: `templates/artifacts/examples/exploration.md`（含需求要点/Story 归属/证据评估/冲突点检测/待澄清）

**用户输入：** "我们需要一个用户注册功能，用户可以用邮箱或手机号注册"

**Agent 分析：**

- 需求类型：新功能开发
- 核心动词：注册
- 操作对象：用户（邮箱/手机号两种入口）
- 业务约束：邮箱格式校验、手机号格式校验、唯一性
- 隐含需求：密码设置、验证码发送、重复注册处理

**Feature 匹配：**

- 现有 Feature Tree 有 Module "用户中心" → Feature "用户认证"
- 新增 Story "用户注册" 挂到 Feature "用户认证" 下

**exploration.md 探索分析节选：**

> **需求要点：** 在用户中心 → 用户认证域下新增注册能力；用户可用邮箱或手机号注册。
>
> **隐含需求：** 密码强度策略 / 验证码真实性校验 / 重复注册处理策略。
>
> **证据评估：** 有用户调研支持（注册转化率瓶颈），结论：充分。
>
> **冲突点检测：** product/specs/ 无冲突规则；无进行中/归档 Change 重叠；"用户注册" Story 未规划，需新增节点。
>
> **待澄清：** 验证码接入的通知服务选型待 design 阶段确认。
>
> 未已知问题：密码强度策略需在 prd 阶段与用户确认；通知服务是否已有，需在设计阶段调查。

## 行为规则

- 不跳过必经阶段
- Feature Tree 不命中时调用 sdd-feature-tree 自动创建
- 利用 sdd-knowledge 检索历史知识，避免重复探索
- 需求模糊时主动追问，不基于猜测继续

> 通用行为约束（产出草稿供用户确认 / 不直接推进状态等）见 prompts/common/constraints.md。
