# OpenSpec SDD Harness 完整使用指导

> 版本：v0.1 Phase 1 MVP
> 核心理念：**先文档后代码，Agent 自主执行，人审批把关**
> 适用读者：使用 OpenSpec 进行 SDD 开发的个人开发者

---

## 目录

1. [什么是 OpenSpec](#1-什么是-openspec)
2. [安装与验证](#2-安装与验证)
3. [核心概念](#3-核心概念)
4. [新项目完整流程](#4-新项目完整流程)
5. [已有项目接入](#5-已有项目接入)
6. [10 个 Skill 详解](#6-10-个-skill-详解)
7. [Gate 门禁系统](#7-gate-门禁系统)
8. [Feature Tree 管理](#8-feature-tree-管理)
9. [知识底座](#9-知识底座)
10. [CLI 命令参考](#10-cli-命令参考)
11. [Agent 协作模式](#11-agent-协作模式)
12. [目录结构](#12-目录结构)
13. [最佳实践](#13-最佳实践)
14. [常见问题](#14-常见问题)

---

## 1. 什么是 OpenSpec

OpenSpec 是一套 **SDD（Spec-Driven Development）框架**，为 AI Coding Agent 提供"先文档后代码"的开发流程。

### 核心理念

```
传统开发：                         SDD 开发：
需求 → 直接写代码 → 测试            需求 → 探索 → PRD → 设计 → 任务 → 开发 → 测试 → 收敛
     ↑ 问题：返工多                   ↑ 优势：每步有文档、有审批、有知识沉淀
```

### 三个角色

| 角色      | 职责                                       | 工具                        |
| --------- | ------------------------------------------ | --------------------------- |
| **用户**  | 提出需求、审批草稿、推进流程               | CLI `openspec init`         |
| **Agent** | 读 SKILL.md 执行全流程，产出 Artifact 草稿 | Trae / Cursor / Claude Code |
| **CLI**   | 原子操作（创建 CHG、校验、推进状态）       | `openspec` 命令             |

### v0.1 设计边界

- ✅ Skill 体系完整（10 个，含方法论+示例）
- ✅ CLI 原子命令完整（10 类命令）
- ✅ 知识底座（5 个 Standards 种子 + 8 个参考 Artifact）
- ⚠️ Skill 产出需 Agent 执行（v0.1 无内置 LLM）

---

## 2. 安装与验证

### 2.1 环境要求

- Node.js >= 20
- AI Coding Agent（Trae / Cursor / Claude Code / 任意支持文件读写的 Agent）

### 2.2 安装

```bash
# 在 Harness 仓库根目录
npm link

# 验证
openspec --version    # 输出 0.1.0
openspec doctor       # 自检
```

### 2.3 验证 Skill 可用

```bash
openspec skill list          # 列出 10 个 Skill
openspec skill show sdd-explore  # 查看 Skill 元数据 + SKILL.md 路径
```

---

## 3. 核心概念

### 3.1 四世界模型

```
┌──────────────────┐  ┌──────────────────┐
│  standards/      │  │  product/        │
│  技术规则世界     │  │  产品知识世界     │
│  （编码/架构/安全）│  │  （业务能力/Feature）│
└──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐
│  delivery/       │  │  skills/         │
│  交付世界         │  │  Skill 世界       │
│  （Change/Artifact）│  │  （SKILL.md/指令）│
└──────────────────┘  └──────────────────┘
```

### 3.2 Change 生命周期（7 状态）

```
created → exploring → specified → designed → tasked → developing → testing → completed → archived
  │          │           │           │          │           │          │          │
  │          │           │           │          │           │          │          └─ 归档
  │          │           │           │          │           │          └─ 知识收敛
  │          │           │           │          │           └─ 测试报告
  │          │           │           │          └─ 代码实施
  │          │           │           └─ 任务分解
  │          │           └─ 技术设计
  │          └─ PRD
  └─ 需求探索
```

### 3.3 人机双重门禁

```
Artifact Draft → Machine Gate（确定性校验）→ Human Gate（人工审批）→ Artifact Accepted → 状态推进
```

- **Machine Gate**：检查 Artifact 结构（必填 section、front-matter、无占位符）
- **Human Gate**：用户审批内容（业务正确性、范围合理性）
- **Hash 绑定**：Gate 结果绑定 Artifact 内容 hash，内容变化则 Gate 自动失效

### 3.4 Agent 自主执行

```
用户: "探索需求 X"
  → Agent 读 skills/sdd-explore/SKILL.md
  → Agent 按 SKILL.md 步骤执行
  → Agent 调用 CLI 原子命令（change create / feature add / gate check）
  → Agent 写 Artifact 草稿
  → Agent 展示草稿给用户确认
  → Agent 调用 gate approve + change status --set
```

---

## 4. 新项目完整流程

### 4.1 初始化（唯一需要手动运行的命令）

```bash
openspec init my-project
```

交互式选择（4 步）：

- 项目名称
- 类型：greenfield（新项目）/ brownfield（已有代码）
- 代码是否已存在（仅 brownfield 询问）
- 仓库模式：single（单仓）/ multi（多仓）

仓库 id 和路径自动生成，无需手动输入：

- single → `main` → `implementation/`
- multi → `repo-1` → `implementation/repo-1`，`repo-2` → `implementation/repo-2`

完成后：

```bash
cd my-project
openspec doctor    # 验证完整性
openspec status    # 查看状态
```

init 自动完成：

- 创建四世界目录（standards/product/delivery/skills）
- 复制 5 个 Standards 种子到 standards/
- 复制 10 个 Skill 到 skills/
- 生成知识索引（INDEX.md + knowledge-index.json）

### 4.2 需求探索（sdd-explore）

对 Agent 说：

```
请执行 skills/sdd-explore/SKILL.md 中的指令。

需求：用户注册功能，支持邮箱和手机号注册。
```

Agent 自动执行：

1. 检索知识（读 knowledge-index.json，匹配相关 Standards）
2. 创建 CHG（`openspec change create`）
3. 匹配/创建 Feature Tree（sdd-feature-tree）
4. 写 requirement.md + exploration.md 草稿
5. 展示草稿 → 用户确认
6. Gate 校验 + 审批 + 推进状态（`openspec gate check/approve` + `openspec change status --set exploring`）

### 4.3 PRD（sdd-prd）

```
请执行 skills/sdd-prd/SKILL.md，为 CHG-0001 生成 PRD 草稿。
```

Agent 读 exploration.md → 用 JTBD 框架分析 → 写 prd.md（含 SMART 验收标准）→ 确认 → Gate + 推进。

### 4.4 技术设计（sdd-design）

```
请执行 skills/sdd-design/SKILL.md，为 CHG-0001 生成技术设计。
```

Agent 读 prd.md → 分析架构 → 写 design.md（含接口定义/数据模型/Migration/风险评估）→ 确认 → Gate + 推进。

### 4.5 任务分解（sdd-task）

```
请执行 skills/sdd-task/SKILL.md，为 CHG-0001 分解任务。
```

Agent 读 design.md → 分解为 Task 列表 → 写 tasks.md（含依赖图/覆盖矩阵）→ 确认 → Gate + 推进。

### 4.6 开发实施（sdd-dev）

```
请执行 skills/sdd-dev/SKILL.md，为 CHG-0001 开始开发。
```

Agent 读 tasks.md → 逐个 Task 实现 → 写代码到 implementation/ → 写 implementation.md（Commit 记录）→ 确认 → Gate + 推进。

### 4.7 测试（sdd-test）

```
请执行 skills/sdd-test/SKILL.md，为 CHG-0001 执行测试。
```

Agent 读 design.md + implementation.md → 写测试用例 → 执行测试 → 写 test-report.md（含 AC 矩阵/覆盖率）→ 确认 → Gate + 推进。

### 4.8 知识收敛（sdd-converge）

```
请执行 skills/sdd-converge/SKILL.md，为 CHG-0001 收敛知识。
```

Agent 读全部 Artifact → 分类知识项 → 调用 sdd-knowledge（沉淀到 standards/product/）→ 更新 Feature Tree Story 状态 → 写 convergence.md → 确认 → Gate + 推进到 completed。

### 4.9 归档

```
请执行 openspec change archive CHG-0001
```

Change 移到 delivery/archive/，生命周期完成。

### 4.10 流程图

```
用户                     Agent（读 SKILL.md）              CLI 原子命令
 │                         │                              │
 ├── openspec init ──────────────────────────────────────►│ 创建 Workspace
 │                         │                              │
 ├── "探索需求" ──────────►│ sdd-explore                  │
 │                         ├──────────────────────────────►│ change create
 │                         ├──────────────────────────────►│ feature add
 │                         ├── 写 requirement.md          │
 │                         ├── 写 exploration.md          │
 │◄── 展示草稿 ────────────┤                              │
 ├── 确认 ───────────────►├──────────────────────────────►│ gate check/approve
 │                         ├──────────────────────────────►│ change status --set
 │                         │                              │
 ├── "生成 PRD" ──────────►│ sdd-prd                      │
 │                         ├── 读 exploration.md          │
 │                         ├── 写 prd.md                  │
 │◄── 展示草稿 ────────────┤                              │
 ├── 确认 ───────────────►├──────────────────────────────►│ gate + status
 │                         │                              │
 │   ... design → task → dev → test → converge ...        │
 │                         │                              │
 ├── "归档" ───────────────►│──────────────────────────────►│ change archive
```

---

## 5. 已有项目接入

### 5.1 初始化

```bash
# 在已有项目根目录
openspec init
# 选择 brownfield → 代码是否已存在 → 仓库模式
# 仓库路径自动生成（implementation/）
```

### 5.2 知识逆向

对 Agent 说：

```
请执行 skills/sdd-reverse/SKILL.md，逆向分析现有代码。
```

Agent 自动执行：

1. 扫描 `implementation/` 代码树（6 级优先级）
2. 推断技术栈、架构、路由、数据模型
3. 创建 reverse CHG
4. 调用 sdd-feature-tree 生成 Feature Tree
5. 提取技术规则 → 写入 standards/ 草稿
6. 提取业务能力 → 写入 product/ 草稿
7. 调用 sdd-knowledge 重建索引
8. 展示知识草稿 → 用户确认 → 归档

### 5.3 验证

```bash
openspec doctor      # 验证 Workspace 完整
openspec status      # 查看知识概览
openspec validate --all  # 校验全部 Change
```

---

## 5.5 导入现有文档（references/ 机制）

每个 CHG 创建时自动生成 `references/` 目录，用于归档用户提供的原始文档。

### 使用方式

用户无需手动操作 references/ 目录。流程如下：

```
1. openspec init                          # 初始化 Workspace
2. 把文档放到任意位置（如 docs/需求.md）
3. 对 Agent 说："执行 sdd-explore，需求文档在 docs/需求.md"
4. Agent 内部自动 openspec change create   # 创建 CHG + references/
5. Agent 读 docs/需求.md → 写 requirement.md + exploration.md
6. Agent 把原始文档复制到 references/ 归档
```

### 归档结构

```
delivery/changes/CHG-0001/
├── references/          ← Agent 自动归档原始文档
│   ├── 需求规格.md
│   ├── 架构设计.md
│   └── API文档.json
├── requirement.md       ← Agent 产出
├── exploration.md
└── ...
```

### 适用场景

| 文档类型     | 用户操作                    | Agent 使用方式                        |
| ------------ | --------------------------- | ------------------------------------- |
| 需求规格/PRD | 放任意位置，告诉 Agent 路径 | sdd-explore 读取 → 归档到 references/ |
| 架构设计     | 放任意位置，告诉 Agent 路径 | sdd-reverse 读取 → 交叉验证代码扫描   |
| API 文档     | 放任意位置，告诉 Agent 路径 | sdd-explore/sdd-design 读取作为约束   |
| 业务流程     | 放任意位置，告诉 Agent 路径 | sdd-explore 读取提取业务规则          |
| 技术标准     | 直接放入 standards/         | sdd-knowledge 索引                    |

> 注：`.docx`/`.pdf` 等非文本格式需先转换为 `.md`/`.txt`。

---

## 6. 10 个 Skill 详解

### 主生命周期 Skill（7 个，按状态推进）

#### sdd-explore（created → exploring）

- **产出**：requirement.md + exploration.md
- **方法论**：需求收集 5W2H + 澄清清单 + JTBD 分析 + 知识检索
- **调用辅助 Skill**：sdd-feature-tree（生成树）+ sdd-knowledge（检索历史知识）
- **完整示例**：`templates/artifacts/examples/exploration.md`

#### sdd-prd（exploring → specified）

- **产出**：prd.md
- **方法论**：JTBD 框架 + SMART 验收标准 + Scope 管理（In/Out）+ 异常处理矩阵
- **完整示例**：`templates/artifacts/examples/prd.md`

#### sdd-design（specified → designed）

- **产出**：design.md
- **方法论**：现有架构分析 + SOLID 原则 + Repository/Factory/Strategy 模式 + 接口设计 + 风险评估
- **完整示例**：`templates/artifacts/examples/design.md`

#### sdd-task（designed → tasked）

- **产出**：tasks.md
- **方法论**：5 层分解策略 + 粒度标准（1 Task = 1 Commit）+ 依赖分析 + AC 覆盖矩阵
- **完整示例**：`templates/artifacts/examples/tasks.md`

#### sdd-dev（tasked → developing）

- **产出**：implementation/ 代码 + evidence/ + implementation.md
- **方法论**：实现策略 + Commit 规范 + 代码质量要求 + 安全实践
- **完整示例**：`templates/artifacts/examples/implementation.md`

#### sdd-test（developing → testing）

- **产出**：evidence/test-report.md
- **方法论**：测试金字塔 + 等价类/边界值分析 + 异常路径 checklist + AC 覆盖矩阵
- **完整示例**：`templates/artifacts/examples/test-report.md`

#### sdd-converge（testing → completed）

- **产出**：convergence.md + standards/ 更新 + product/ 更新
- **方法论**：4 问分类法 + 知识合并原则 + 冲突处理 + Story 状态变更
- **调用辅助 Skill**：sdd-knowledge（沉淀 + 索引）
- **完整示例**：`templates/artifacts/examples/convergence.md`

### 辅助 Skill（3 个，不进生命周期）

#### sdd-feature-tree

- **能力**：需求映射 → Feature Tree 自动生成
- **被调用方**：sdd-explore, sdd-reverse
- **方法论**：4 步映射法 + 层级粒度判断 + ID 规范
- **模板**：`templates/default-workspace/product/feature-tree.yaml`

#### sdd-knowledge

- **四种能力**：
  - A. 知识沉淀（sdd-converge 调用）
  - B. 独立添加知识（用户直接调用）
  - C. 索引构建（自动调用）
  - D. 知识检索（sdd-explore 调用）
- **方法论**：摘要提取规则 + 文件命名规则 + 合并原则 + 匹配评分算法
- **模板**：`templates/artifacts/knowledge-index.json` + `templates/artifacts/INDEX.md`

#### sdd-reverse

- **能力**：旧项目知识接入
- **方法论**：6 级扫描优先级 + 目录→架构推断 + 路由→能力推断 + 模型→数据推断
- **调用辅助 Skill**：sdd-feature-tree + sdd-knowledge

---

## 7. Gate 门禁系统

### 7.1 双重门禁流程

```
Agent 写 Artifact 草稿
  → openspec gate check <CHG>      # Machine Gate（确定性校验）
    → passed: 继续
    → failed: Agent 修复后重新 check
  → openspec gate approve <CHG>    # Human Gate（人工审批）
    → approved: Artifact 被接受
    → rejected: Agent 修改后重新提交
  → openspec change status <CHG> --set <target>  # 推进状态
```

### 7.2 Machine Gate 检查项

每个 Skill 的 `gate.yaml` 声明 Machine Gate 检查规则：

| 检查项                | 说明                          |
| --------------------- | ----------------------------- |
| required-front-matter | front-matter 必填字段是否存在 |
| required-sections     | 必填 section 是否存在         |
| no-placeholder        | 是否残留 `{{}}` 占位符        |
| max-words             | 字数限制                      |

### 7.3 Human Gate 审批

用户审批时关注：

- 业务正确性（PRD 是否符合需求）
- 范围合理性（Scope In/Out 是否恰当）
- 架构合理性（设计是否符合架构原则）
- 验收标准可测性（AC 是否可验证）

### 7.4 Hash 绑定

Gate 结果绑定 Artifact 内容 hash。如果 Artifact 被修改（hash 变化），之前的 Gate 结果自动失效，需要重新校验。

### 7.5 Gate CLI

```bash
openspec gate check <CHG>      # 执行 Machine Gate
openspec gate approve <CHG>    # 执行 Human Gate
openspec gate status <CHG>     # 查看 Gate 状态
```

---

## 8. Feature Tree 管理

### 8.1 四级结构

```
Product（产品）
  └── Module（模块）— MOD-NNN
        └── Feature（功能）— FEAT-NNN
              └── Story（故事）— STORY-NNN
                    状态: planned → in-progress → delivered
```

### 8.2 CLI 命令

```bash
# 查看
openspec feature list                    # 列出整棵树
openspec feature list --module MOD-1     # 只看某模块
openspec feature show STORY-3            # 查看某节点

# 添加
openspec feature add module --name "用户中心"
openspec feature add feature --module MOD-1 --name "用户认证"
openspec feature add story --feature FEAT-1 --name "用户注册"

# 更新
openspec feature update STORY-3 --status delivered

# 删除
openspec feature remove STORY-3         # 需确认
```

### 8.3 自动生成

sdd-explore 和 sdd-reverse 会自动调用 sdd-feature-tree，根据需求自动创建 Feature Tree 节点，无需手动管理。

---

## 9. 知识底座

### 9.1 Standards（技术规则世界）

init 时自带 5 个种子文件：

| 文件                       | 内容                                                   |
| -------------------------- | ------------------------------------------------------ |
| coding-standards.md        | 命名约定、文件组织、格式化、注释、错误处理             |
| architecture-principles.md | 分层架构、SOLID、Repository/Factory/Strategy、API 设计 |
| testing-conventions.md     | 测试金字塔、AAA 模式、边界值、覆盖率                   |
| git-conventions.md         | 分支命名、Commit 格式、PR 流程、.gitignore             |
| security-guidelines.md     | 输入校验、认证授权、密码存储、OWASP Top 10             |

### 9.2 Product（产品知识世界）

init 时为空（项目特定）。随 Change 推进，sdd-converge 逐步沉淀产品知识。

### 9.3 知识索引

三个索引文件，init 时自动生成：

| 文件                      | 用途                       | 格式     |
| ------------------------- | -------------------------- | -------- |
| standards/INDEX.md        | 技术规则索引（人读）       | Markdown |
| product/INDEX.md          | 产品知识索引（人读）       | Markdown |
| .sdd/knowledge-index.json | 机器可读索引（Agent 检索） | JSON     |

### 9.4 参考 Artifact

8 个完整示例（统一"用户注册"案例），位于 `templates/artifacts/examples/`：

| 文件              | 对应 Skill   |
| ----------------- | ------------ |
| requirement.md    | sdd-explore  |
| exploration.md    | sdd-explore  |
| prd.md            | sdd-prd      |
| design.md         | sdd-design   |
| tasks.md          | sdd-task     |
| implementation.md | sdd-dev      |
| test-report.md    | sdd-test     |
| convergence.md    | sdd-converge |

### 9.5 Skill 同步

Harness 更新 SKILL.md 后，旧 Workspace 需同步：

```bash
openspec skill sync    # 从 Harness 复制最新 skills/ 到 Workspace
```

---

## 10. CLI 命令参考

### 10.1 用户命令（手动运行）

| 命令                   | 用途             | 何时使用                 |
| ---------------------- | ---------------- | ------------------------ |
| `openspec init [path]` | 初始化 Workspace | 项目开始时               |
| `openspec skill sync`  | 同步 Skill 更新  | Harness 更新 SKILL.md 后 |

### 10.2 Agent 命令（Agent 自动调用）

| 命令                                                       | 用途                              |
| ---------------------------------------------------------- | --------------------------------- |
| `openspec change create --title <t> [--requirement <r>]`   | 创建 CHG                          |
| `openspec change list [--status <s>]`                      | 列出 Change                       |
| `openspec change show <CHG>`                               | 查看 Change 详情                  |
| `openspec change status <CHG>`                             | 查看 Change 状态                  |
| `openspec change status <CHG> --set <target>`              | 推进状态（经 TransitionService）  |
| `openspec change archive <CHG>`                            | 归档 Change                       |
| `openspec feature list [--module <id>] [--json]`           | 列出 Feature Tree                 |
| `openspec feature show <id>`                               | 查看 Feature 节点                 |
| `openspec feature add module/feature/story ...`            | 添加节点                          |
| `openspec feature update <id> [--name <n>] [--status <s>]` | 更新节点                          |
| `openspec feature remove <id>`                             | 删除节点                          |
| `openspec gate check <CHG>`                                | Machine Gate 校验                 |
| `openspec gate approve <CHG>`                              | Human Gate 审批                   |
| `openspec gate status <CHG>`                               | 查看 Gate 状态                    |
| `openspec skill list`                                      | 列出 Skill                        |
| `openspec skill show <id>`                                 | 查看 Skill 元数据 + SKILL.md 路径 |

### 10.3 工具命令

| 命令                                           | 用途                       |
| ---------------------------------------------- | -------------------------- |
| `openspec doctor`                              | Workspace 自检             |
| `openspec status`                              | 状态概览                   |
| `openspec status --json`                       | 状态概览（JSON，供 Agent） |
| `openspec validate <CHG>`                      | 校验 Change                |
| `openspec validate --all`                      | 校验全部 Change            |
| `openspec workflow list`                       | 列出 Workflow              |
| `openspec workflow show default`               | 查看 Workflow 配置         |
| `openspec workflow run default --change <CHG>` | 执行 Workflow 下一步       |

### 10.4 Workflow 状态

`openspec workflow run` 返回值：

| 状态                    | 含义              | Agent 动作         |
| ----------------------- | ----------------- | ------------------ |
| WAITING_FOR_ARTIFACT    | 等待 Skill 产出   | 读 SKILL.md 执行   |
| WAITING_FOR_MACHINE_FIX | Machine Gate 失败 | 修复 Artifact      |
| WAITING_FOR_HUMAN       | 等待用户审批      | 展示草稿，等待确认 |
| ADVANCED                | 已推进状态        | 继续下一步         |
| COMPLETED               | Change 完成       | 执行归档           |

---

## 11. Agent 协作模式

### 11.1 提示词模板

**启动新需求：**

```
请执行 skills/sdd-explore/SKILL.md 中的指令。

需求：<你的需求描述>
```

**推进下一阶段：**

```
请执行 skills/sdd-prd/SKILL.md，为 CHG-0001 生成 PRD 草稿。
```

**查看 Skill：**

```
openspec skill show sdd-prd
# 输出 SKILL.md 路径，Agent 读取该路径执行
```

### 11.2 Agent 职责

1. 读 SKILL.md 理解执行步骤
2. 读前序 Artifact 提取上下文
3. 读 Standards/参考示例获取知识
4. 调用 CLI 原子命令（change create / feature add / gate check）
5. 写 Artifact 草稿
6. 展示草稿给用户确认
7. 调用 gate approve + change status --set 推进

### 11.3 用户职责

1. 提出需求
2. 审批 Artifact 草稿
3. 确认状态推进

---

## 12. 目录结构

```
my-project/
├── .sdd/
│   ├── workspace.yaml          # 项目元信息
│   ├── repositories.yaml       # 仓库配置
│   ├── context-rules.yaml      # 上下文规则
│   ├── knowledge-index.json    # 知识索引（Agent 检索用）
│   └── version.yaml            # Harness 版本
├── standards/                  # 技术规则世界
│   ├── INDEX.md                # 索引（人读）
│   ├── coding-standards.md     # 编码规范
│   ├── architecture-principles.md  # 架构原则
│   ├── testing-conventions.md  # 测试规范
│   ├── git-conventions.md      # Git 规范
│   └── security-guidelines.md  # 安全指南
├── product/                    # 产品知识世界
│   ├── INDEX.md                # 索引（人读）
│   └── feature-tree.yaml       # 四级 Feature Tree
├── delivery/                   # 交付世界
│   ├── changes/
│   │   └── CHG-0001/           # 一个 Change 的全部 Artifact
│   │       ├── metadata.yaml   # 元信息 + Gate 结果
│   │       ├── requirement.md
│   │       ├── exploration.md
│   │       ├── prd.md
│   │       ├── design.md
│   │       ├── tasks.md
│   │       ├── implementation.md
│   │       ├── convergence.md
│   │       ├── evidence/       # 测试证据
│   │       └── references/     # 用户原始文档
│   └── archive/                # 已归档 Change
├── skills/                     # Skill 世界（10 个）
│   ├── sdd-explore/
│   │   ├── skill.yaml          # Skill 元数据
│   │   ├── SKILL.md            # Agent 可执行指令
│   │   └── gate.yaml           # Gate 规则
│   ├── sdd-prd/
│   ├── sdd-design/
│   ├── sdd-task/
│   ├── sdd-dev/
│   ├── sdd-test/
│   ├── sdd-converge/
│   ├── sdd-feature-tree/       # 辅助：特性树生成
│   ├── sdd-knowledge/          # 辅助：知识管理
│   └── sdd-reverse/            # 辅助：旧项目接入
├── workflows/
│   └── default.yaml            # 默认 Workflow 配置
└── implementation/             # 代码实现
```

---

## 13. 最佳实践

### 13.1 开发流程

1. **只手动运行 `openspec init`** — 其余全交给 Agent
2. **每次确认草稿** — Agent 产出 Artifact 草稿后仔细审阅再确认
3. **不跳过 Gate** — Machine Gate 和 Human Gate 都要走
4. **收敛不跳过** — sdd-converge 沉淀知识到 standards/product/，是 SDD 核心价值
5. **一个 Change 一件事** — 不要在一个 CHG 里塞多个不相关需求

### 13.2 知识管理

1. **定期 sync** — Harness 更新 SKILL.md 后运行 `openspec skill sync`
2. **利用知识检索** — sdd-explore 自动检索历史知识，避免重复探索
3. **Feature Tree 有机生长** — 不需要预先构建，随需求自动创建
4. **Standards 逐步丰富** — 每次 converge 都会沉淀新规则

### 13.3 质量保障

1. **定期 doctor** — `openspec doctor` 确保 Workspace 完整
2. **validate 全部** — `openspec validate --all` 检查所有 Change 一致性
3. **Gate hash 绑定** — Artifact 修改后 Gate 自动失效，确保一致性
4. **参考示例对照** — 不确定 Artifact 格式时，参考 `templates/artifacts/examples/`

---

## 14. 常见问题

### Q: Agent 不知道执行哪个 Skill？

```bash
openspec skill list          # 列出全部 10 个 Skill
openspec skill show sdd-prd # 查看 Skill 元数据 + SKILL.md 路径
```

然后对 Agent 说：`请读取 <输出的 SKILL.md 路径> 并执行`

### Q: Skill 更新后旧项目怎么办？

```bash
openspec skill sync    # 同步最新 skills/ 到 Workspace
```

### Q: Machine Gate 失败怎么办？

Agent 读 `gate status` 输出的失败原因，修复 Artifact 后重新 `gate check`。

### Q: Human Gate 被拒绝怎么办？

Agent 根据用户反馈修改 Artifact 草稿，重新展示给用户确认，然后重新 `gate approve`。

### Q: 如何查看 Change 当前状态？

```bash
openspec change status CHG-0001     # 查看状态
openspec change show CHG-0001       # 查看详情
openspec status                     # 全局概览
```

### Q: Workflow 返回 WAITING_FOR_HUMAN 怎么办？

表示 Artifact 已通过 Machine Gate，等待用户审批。用户审阅草稿后：

```bash
openspec gate approve CHG-0001    # 审批通过
openspec change status CHG-0001 --set <next>  # 推进状态
```

### Q: 已有项目如何接入？

```bash
openspec init          # 选择 brownfield，指向现有代码
# 然后对 Agent 说：请执行 skills/sdd-reverse/SKILL.md
```

### Q: 可以跳过某些阶段吗？

不建议。SDD 的核心价值在于每步有文档和审批。如果确实需要跳过（如简单修复），可以直接在 implementation/ 改代码，然后创建一个只走 dev → test → converge 的 CHG。

### Q: 多个 Change 可以并行吗？

可以。每个 CHG 独立目录，互不影响。但注意 Feature Tree 的 Story 状态和 standards/ 的知识可能需要协调。

---

> **总结**：OpenSpec v0.1 Phase 1 已完整交付。用户只需 `openspec init` 初始化，然后通过 Agent 读 SKILL.md 自主执行全流程。每个 Artifact 经过 Machine Gate + Human Gate 双重校验，知识通过 sdd-converge 沉淀到 standards/product/，形成可复用的知识底座。
