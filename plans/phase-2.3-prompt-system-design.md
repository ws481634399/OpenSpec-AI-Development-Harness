# Phase 2.3 — Prompt 体系设计文档

> 版本: v0.1 (Draft 待评审)
> 日期: 2026-08-28
> 前置: Phase 2.2 sdd-review Skill（已实施，174 测试通过）
> 上游规划: `.trae/documents/phase-2-planning.md` §3.3（决策 D1/D3）

---

# 1. 文档目的

定义 OpenSpec Prompt 片段库（`prompts/`）的完整设计：与 Skill 体系的职责边界、目录结构、引用机制、装配链集成、init/sync 集成、SKILL.md 瘦身方案、测试计划与验收标准。

实施完成后的 Definition of Done = §9 验收标准。

# 2. 阶段目标

实现 Roadmap 6.1：建立 `prompts/` 体系（explore / design / coding / review 四类），作为**可复用提示片段库**，被 Skill 引用而非内嵌重复，提升 Agent 执行的输出稳定性。

非目标（本阶段不做）：

- 不做 Prompt 评估与版本管理平台（prompt-standard.md §6 的 `examples/`、`evaluation.md` 属 Phase 3 专业版范畴）
- 不新增 CLI 命令（复用 `skill sync`；引用一致性由测试保证，不加 gate）
- 不改 context-rules.yaml 的结构与现有装配顺序语义
- Machine Gate 不检查 Prompt 片段内容（Prompt 是提示资产，不是 Artifact，无双门禁）

# 3. 现状分析（探索结论）

## 3.1 Agent 执行路径（Phase 1.4 后）

`skill run` 命令已移除，Agent 执行 Skill 有两条路径：

```
路径 A（主路径）：Agent 直接读 Workspace skills/sdd-xxx/SKILL.md 执行
路径 B（workflow 路径）：openspec workflow run
  → workflow-engine.js:183 buildInstruction(skill, context, userInput)
  → 产出 Instruction（含 SKILL.md 原文 + Workspace Context + 执行指引）
```

`buildInstruction` 唯一生产调用点在 workflow-engine.js；instruction-builder.js 为纯函数（不 IO）。

## 3.2 SKILL.md 重复模式

11 个 SKILL.md 均含「行为规则」section（3-5 条/个），其中以下条目跨 Skill 重复：

- 「产出草稿供用户确认，不直接推进状态」
- 「冲突/未知问题上报用户决定，不擅自处理」
- 「不修改前序 Artifact」

同时各 SKILL.md **均无 persona（角色设定）**——prompt-standard.md §2.2 要求复杂任务定义 AI 角色，当前缺失。

## 3.3 装配链与同步机制现状

- `skill.yaml`：id/stage/requires-state/produces-state/output-artifacts，无 prompts 字段
- `copier.js`：整树复制 `templates/default-workspace/`，`FOUR_WORLDS = ['standards','product','delivery','skills']` 为 --force 保护清单
- `skill-registry.js syncSkills`：仅同步 `skills/` 树
- `prompt-standard.md`（standards/engineering/ai/）：已定义 Prompt 结构规范（Role → Context → Task → Constraints → Output Format → Validation）、metadata 要求（name/version/purpose）、分类规范

# 4. 核心设计决策

## 4.1 决策一：职责边界（上游规划核心问题）

| 内容 | 归属 | 理由 |
| ---- | ---- | ---- |
| 阶段流程（怎么走/产出什么/质量自检/工作示例） | SKILL.md | Skill 特有，无复用价值 |
| persona（角色设定） | prompts/ | 跨 Skill 资产，且当前缺失 |
| 通用行为约束 | prompts/ | 跨 Skill 重复（§3.2），抽取后 SKILL.md 无重复 |
| Artifact 输出格式约定 | prompts/ | 跨 Skill 一致（Markdown/中文/占位符替换/占位符禁残留） |

**判定规则**：跨 2 个以上 Skill 复用的提示文本 → prompts/；仅单 Skill 使用 → 留 SKILL.md。

## 4.2 决策二：引用机制 = skill.yaml 声明 + 双路径消费（三件套）

既然路径 A（Agent 直接读 SKILL.md）是主路径，Prompt 片段必须在两条路径都生效：

```yaml
# ① skills/sdd-dev/skill.yaml 新增字段（机器唯一源）
prompts:                  # 引用 prompts/ 下片段，路径不含 .md 后缀
  - common/persona-sdd
  - common/constraints
  - common/output-format
  - coding/persona-dev
```

```markdown
<!-- ② SKILL.md 顶部引用行（人/Agent 可读，路径 A 生效） -->
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md ·
> prompts/common/output-format.md · prompts/coding/persona-dev.md
> （执行本 Skill 前，先读取上述片段并遵循）
```

```javascript
// ③ instruction-builder 注入（路径 B 生效，workflow-engine 调用前完成解析）
// core/sdd/workflow-engine.js
const resolved = await resolvePrompts(skill, { harnessRoot, workspaceRoot });
const instruction = buildInstruction(skill, context, userInput, resolved.prompts);
```

- `buildInstruction` 增加**第 4 个可选参数** `prompts`（已解析片段数组），保持纯函数；IO 解析在调用方完成
- skill.yaml `prompts:` 字段与 SKILL.md 引用行的一致性由 `checkPromptRefs` 测试保证（确定性校验，非 gate）
- 缺失片段不阻塞：Instruction 中标注 `（缺失: xxx）`，SKILL.md 引用行由 Agent 自行发现文件不存在

**备选（否决）**：

- 仅 SKILL.md 引用：路径 B 的 Instruction 无 persona，Prompt 沦为纯文档约定
- 仅 builder 注入：主路径 A 完全无感，与「Agent 直接执行」架构冲突
- builder 运行时解析 SKILL.md 提取引用：Markdown 解析脆弱，且违反纯函数约束

## 4.3 决策三：目录结构 = 四类职能族 + common，persona 按 Skill 粒度

```
prompts/
├── common/                      # 全部 Skill 共享
│   ├── persona-sdd.md           # SDD 工程协作者基础角色（所有 Skill 引用）
│   ├── constraints.md           # 通用行为约束（从 11 个 SKILL.md 抽取的共性条目）
│   └── output-format.md         # Artifact 输出格式约定
├── explore/                     # 分析族（Roadmap 6.1）
│   ├── persona-explore.md       # sdd-explore：需求分析师
│   ├── persona-prd.md           # sdd-prd：产品经理
│   └── persona-reverse.md       # sdd-reverse：逆向分析师
├── design/                      # 设计族（Roadmap 6.1）
│   ├── persona-design.md        # sdd-design：系统架构师
│   └── persona-task.md          # sdd-task：任务规划师
├── coding/                      # 实现族（Roadmap 6.1）
│   ├── persona-dev.md           # sdd-dev：开发工程师
│   └── persona-test.md          # sdd-test：测试工程师
└── review/                      # 评审与知识族（Roadmap 6.1）
    ├── persona-review.md        # sdd-review：评审工程师
    ├── persona-converge.md      # sdd-converge：知识收敛管理员
    ├── persona-feature-tree.md  # sdd-feature-tree：产品规划助理
    └── persona-knowledge.md     # sdd-knowledge：知识管理员
```

共 14 个片段。四类目录对齐 Roadmap 6.1 命名；`common/` 承载跨 Skill 复用。

**persona 按 Skill 粒度而非严格四类**的理由：sdd-prd 的产品经理视角与 sdd-explore 的分析师视角差异显著，硬套 4 个 persona 会失真；目录仍按四类组织，兼顾 Roadmap 对齐与角色贴合。

**备选（否决）**：严格 4 个 persona 多 Skill 共用（角色失真）；11 个平铺目录无分类（丢失 Roadmap 四类语义）。

## 4.4 决策四：片段文件结构 = 单文件 + front-matter

```markdown
---
name: persona-dev
category: coding
version: 0.1.0
purpose: sdd-dev 阶段开发工程师角色设定
---

## Role

你是一名资深开发工程师，负责在 SDD Change 上下文中执行代码实施。

## Task 方向

- 按 tasks.md 逐任务实现，遵循 design.md 声明的接口与模块边界
- 实现过程遵循 standards/ 中明确声明的编码规范

## Output 倾向

- 修改代码后同步更新 implementation.md（任务状态/Commit 记录）
- 向 evidence/evidence.yaml 追加 code-change 条目（repo/commit/file/symbol/reason）

## Constraints

- 不修改前序 Artifact 的已确认内容
- 发现设计与实现冲突时记录并上报，不擅自变更设计
```

- front-matter 满足 prompt-standard.md §6 的 metadata 要求（name/version/purpose），category 与目录一致
- 正文对齐 prompt-standard.md §3 结构（Role → Context → Task → Constraints → Output Format → Validation 的裁剪版：片段无固定 Context/Validation，Context 由装配链提供）
- **否决目录式**（`prompt-name/prompt.md + metadata.yaml + examples/ + evaluation.md`）：OpenSpec 的 Prompt 是片段库而非独立 AI 能力资产，examples/evaluation 属 Phase 3；遵循「优先可用，而非平台化」

## 4.5 决策五：SKILL.md 瘦身 = 抽共性、留特性

- 从 11 个 SKILL.md「行为规则」中删除通用条目（改为 prompts/common/constraints.md 引用），保留 Skill 特有条目
- 判定规则见 §4.1；实施时逐文件列出删除项（如 sdd-prd 删「产出草稿供用户确认，不直接推进状态」，保留「验收标准必须可测试，拒绝模糊表述」）
- 每个删除条目必须在 prompts/common/constraints.md 有等价表述，由测试断言 constraints.md 包含全部被抽取条目的关键词

**不做**：「用户确认」「质量自检」等 section 不抽取——内容以 Skill 特有为主，强行抽取收益低、改动大。

## 4.6 决策六：init / sync / force 保护集成

| 机制 | 改动 |
| ---- | ---- |
| init 拷贝 | `templates/default-workspace/prompts/` 由 copier 整树复制**自动生效**，零改动 |
| --force 保护 | `copier.js` `FOUR_WORLDS` 数组追加 `'prompts'`（重命名为 `PROTECTED_WORLDS`），force 时不覆盖用户自定义 Prompt |
| sync | `skill-registry.js` 新增 `syncPrompts(harnessRoot, workspaceRoot)`（cp `prompts/` 树，返回 `{synced, details}`）；CLI `skill sync` 同时调用 `syncSkills` + `syncPrompts` |
| Workspace validator | **不**将 prompts/ 加入必需目录校验——缺失时 loader fallback Harness 并告警，不阻塞 |

# 5. 模块设计

## 5.1 core/sdd/prompt-loader.js（新增，与 skill-loader 同构）

```javascript
// PromptLoader：加载 prompts/ 片段（Workspace 优先，fallback Harness）
// 纯函数风格，依赖 node:fs/promises + yaml（front-matter 解析）

/**
 * 加载单个 Prompt 片段。
 * @param {string} root 根目录（Workspace 或 Harness）
 * @param {string} ref 引用路径，如 'common/constraints'（无 .md）
 * @returns {Promise<{ref, name, category, version, purpose, body}>}
 *   文件不存在返回 null（不抛错，由调用方决定告警策略）
 */
export async function loadPrompt(root, ref) { /* ... */ }

/**
 * 按 skill.yaml prompts 字段解析全部片段。
 * Workspace prompts/ 优先，逐条 fallback Harness（与 skill-registry.resolveSkillsRoot 同模式）。
 * @returns {Promise<{prompts: Array, missing: string[]}>}
 */
export async function resolvePrompts(skill, { harnessRoot, workspaceRoot }) { /* ... */ }

/**
 * 引用一致性检查（测试/doctor 可用）。
 * ① 每个含 prompts 字段的 skill.yaml，其条目在 Harness prompts/ 下均有对应文件
 * ② 各 SKILL.md 顶部引用行与 skill.yaml prompts 列表一致
 * @returns {Promise<string[]>} issues（空数组 = 全部一致）
 */
export async function checkPromptRefs(harnessRoot) { /* ... */ }
```

## 5.2 core/sdd/instruction-builder.js（改造）

```javascript
export function buildInstruction(skill, context, userInput = {}, prompts = []) {
  // ... 现有第 1-2 节不变
  // 新增「## Prompt 片段」section（插在 Skill 角色与目标之后、Workspace Context 之前）：
  //   ### prompts/common/persona-sdd
  //   （category: common · version: 0.1.0 · purpose: ...）
  //   <片段 body 原文>
  //   缺失条目输出：### prompts/xxx （缺失: 文件不存在，请检查 skill.yaml prompts 字段）
  // ... 其余节不变
}
```

第 4 参可选（默认 `[]`），存量调用与测试向后兼容。

## 5.3 core/sdd/workflow-engine.js（改造，1 处）

`buildInstruction` 调用前执行 `resolvePrompts(skill, { harnessRoot, workspaceRoot })`，传入 `resolved.prompts`。resolve 失败不阻塞（missing 标注在 Instruction 中）。

## 5.4 core/workspace/copier.js（改造，1 行）

`FOUR_WORLDS` → `PROTECTED_WORLDS = ['standards', 'product', 'delivery', 'skills', 'prompts']`。

## 5.5 core/sdd/skill-registry.js（新增 syncPrompts）

```javascript
export async function syncPrompts(harnessRoot, workspaceRoot) {
  // cp(harnessRoot/prompts → workspaceRoot/prompts, { recursive, force })
  // 返回 { synced: <文件数>, details: ['prompts: synced (N files)'] }
}
```

## 5.6 cli/openspec/src/commands/skill.js（改造）

- `skill show <id>`：metadata 输出追加 `prompts: <列表>`
- `skill sync`：追加调用 `syncPrompts`，输出合并 details

## 5.7 skills/*/skill.yaml + SKILL.md（11 个文件 × 2 处）

- 每个 skill.yaml 追加 `prompts:` 字段（common 三件 + 各自 persona，共 4 条）
- 每个 SKILL.md 顶部（标题行后）追加「提示片段」引用行

## 5.8 templates/default-workspace/prompts/（新增 14 文件）

内容规范见 §4.4；`constraints.md` 必须覆盖全部被抽取的 SKILL.md 通用条目（等价表述）。

# 6. 端到端流程（Phase 2.3 后）

```
路径 A（主路径）：
  Agent: 执行 sdd-dev
    → 读 skills/sdd-dev/SKILL.md
    → 见顶部引用行 → 读 prompts/common/persona-sdd.md、prompts/coding/persona-dev.md 等
    → 以 persona 角色 + 通用约束执行方法论

路径 B（workflow）：
  openspec workflow run
    → engine 定位 stage → WAITING_FOR_ARTIFACT
    → resolvePrompts（Workspace 优先）→ buildInstruction(..., prompts)
    → Instruction 含「## Prompt 片段」（persona + 约束 + 输出格式）
    → Agent 按 Instruction 执行
```

用户自定义：直接编辑 Workspace `prompts/` 下片段（--force / skill sync 会覆盖，故自定义建议复制新文件并在 skill.yaml 改引用——与 skills 同模式）。

# 7. CLI 变更

无新命令。

```bash
openspec skill show sdd-dev   # metadata 追加 prompts 列表
openspec skill sync           # 同步 skills/ + prompts/ 两个树
```

# 8. 测试计划

| 文件 | 内容 |
| ---- | ---- |
| `tests/prompt.spec.js`（新增） | ① loadPrompt：正常加载/front-matter 解析/不存在返回 null；② resolvePrompts：Workspace 优先/Harness fallback/missing 收集；③ buildInstruction 第 4 参：注入 section 位置与内容/缺失标注/不传参向后兼容；④ checkPromptRefs：Harness 全部 11 Skill 零 issues；⑤ syncPrompts：cp 生效且文件数正确 |
| `tests/init.spec.js`（扩展） | init 后 Workspace 含 `prompts/` 且四类目录 + common 就位（14 文件）；--force 重跑后用户修改的 prompts/ 文件不被覆盖 |
| `tests/skill.spec.js`（扩展） | getSkill 返回 yaml 含 prompts 字段；skill sync 后 Workspace prompts/ 存在 |
| 存量回归 | instruction-builder 签名向后兼容（第 4 参默认 []），gate/workflow/integration 全量不回归 |

# 9. 文档更新

- `docs/complete-usage-guide.md`：§3 核心概念补 prompts/ 定位（四世界 → 五目录）；§6 补「Prompt 片段库」小节（目录结构/引用机制/自定义方式）；§10 CLI 参考 skill sync/show 输出更新
- `README.md`：若含目录结构描述则补 prompts/
- `templates/default-workspace/standards/engineering/ai/prompt-standard.md`：不动（它规范用户项目的 Prompt 资产，OpenSpec 自身 prompts/ 是其消费示范，在 usage-guide 说明对齐关系）

# 10. 验收标准

1. `openspec init` 后 Workspace 含 `prompts/`（14 个片段，四类目录 + common）
2. 11 个 skill.yaml 均含 `prompts:` 字段，且与对应 SKILL.md 顶部引用行一致（checkPromptRefs 零 issues）
3. `openspec workflow run` 产出的 Instruction 含「## Prompt 片段」section（persona + 约束注入，缺失条目有标注）
4. Agent 直接读 SKILL.md 路径可通过顶部引用行发现并读取 Prompt 片段
5. `openspec skill sync` 同时同步 skills/ 与 prompts/
6. `--force` 重新 init 不覆盖用户自定义的 prompts/ 内容
7. 11 个 SKILL.md 中不再出现跨 Skill 重复的通用行为约束条目（已抽取至 common/constraints.md 且等价覆盖）
8. 全量测试通过（存量 174 + 新增）
9. 硬约束不破坏：ESM + 纯 JS 零构建；core 逻辑纯函数；Skill/Prompt 不调用模型；Gate 语义与状态机不变

# 11. 待用户评审确认点

| # | 决策 | 备选方案 |
| ---- | ---- | ---- |
| Q1 | 职责边界：persona + 通用约束 + 输出格式进 prompts/，流程方法论留 SKILL.md（§4.1） | 备选：全部提示文本进 prompts/，SKILL.md 仅剩流程索引（改动大） |
| Q2 | 引用机制三件套：skill.yaml 声明 + SKILL.md 引用行 + builder 注入（§4.2） | 备选：仅 SKILL.md 引用行（最小改动，路径 B 无 persona） |
| Q3 | persona 按 Skill 粒度（11 个）而非严格四类共用（§4.3） | 备选：严格 4 个 persona 多 Skill 共用（角色失真） |
| Q4 | 片段 = 单文件 + front-matter（§4.4） | 备选：目录式 prompt.md + metadata.yaml + examples/（对齐 prompt-standard §6 全量，过重） |
| Q5 | SKILL.md 瘦身仅抽「行为规则」通用条目（§4.5） | 备选：用户确认/质量自检 section 也部分抽取（收益低） |
