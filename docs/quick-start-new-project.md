# 新项目快速开始指南

> 适用版本：OpenSpec SDD Harness v0.1
> 核心理念：**Agent 读 SKILL.md 自主执行，用户只需 init + 确认草稿**

---

## 1. 前置准备

### 1.1 环境要求

- Node.js >= 20
- AI Coding Agent（Trae / Cursor / Claude Code / 任意支持文件读写的 Agent）

### 1.2 安装

```bash
# 在 Harness 仓库根目录链接全局命令
npm link

# 验证安装
openspec --version
```

---

## 2. 初始化 Workspace（唯一 CLI 命令）

```bash
openspec init my-project
```

CLI 交互式询问项目名称、类型、仓库模式等。完成后：

```bash
cd my-project
openspec doctor    # 验证完整性
```

---

## 3. Agent-First 工作流

**用户不再需要手动运行 CLI 命令。** 直接对 Agent 说要做什么，Agent 读 SKILL.md 执行全流程。

### 3.1 需求探索

对 Agent 说：**"探索需求：用户注册功能"**

Agent 读取 `skills/sdd-explore/SKILL.md`，自动执行：

1. **知识检索** — 读 sdd-knowledge SKILL.md，检索历史知识
2. **创建 Change** — 调用 `openspec change create`
3. **生成 Feature Tree** — 读 sdd-feature-tree SKILL.md，自动创建 Module/Feature/Story
4. **写 requirement.md + exploration.md** 草稿
5. **展示草稿** → 用户确认
6. **Gate + 推进状态** — 调用 `openspec gate check/approve` + `openspec change status --set exploring`

### 3.2 后续阶段

对 Agent 说：**"生成 PRD"** / **"技术设计"** / **"任务分解"** / **"开始开发"** / **"测试"** / **"收敛归档"**

Agent 读对应 SKILL.md 执行：

- 读前序 Artifact → 生成草稿 → 用户确认 → Gate + 推进状态

### 3.3 完整流程

```
用户                    Agent（读 SKILL.md）           CLI 原子命令
 │                         │                              │
 ├── "探索需求 X" ─────────►│ 读 sdd-explore/SKILL.md     │
 │                         ├──────────────────────────────►│ change create
 │                         ├──────────────────────────────►│ feature add
 │                         ├── 写 requirement.md          │
 │                         ├── 写 exploration.md          │
 │                         ├── 展示草稿 ←───────────────── │
 │◄── 确认 ────────────────┤                              │
 │                         ├──────────────────────────────►│ gate check/approve
 │                         ├──────────────────────────────►│ change status --set
 │                         │                              │
 ├── "生成 PRD" ──────────►│ 读 sdd-prd/SKILL.md          │
 │                         ├── 读前序 Artifact            │
 │                         ├── 写 prd.md 草稿             │
 │◄── 确认 ────────────────┤                              │
 │                         ├──────────────────────────────►│ gate + status
 │                         │                              │
 │   ... design → task → dev → test → converge ...        │
 │                         │                              │
 ├── "归档" ───────────────►│──────────────────────────────►│ change archive
```

---

## 4. 10 个 Skill 体系

### 主生命周期（7 状态）

| Skill        | 状态转换            | 产出                             | 调用辅助 Skill                            |
| ------------ | ------------------- | -------------------------------- | ----------------------------------------- |
| sdd-explore  | created→exploring   | requirement.md + exploration.md  | → sdd-feature-tree, → sdd-knowledge(检索) |
| sdd-prd      | exploring→specified | prd.md                           | —                                         |
| sdd-design   | specified→designed  | design.md                        | —                                         |
| sdd-task     | designed→tasked     | tasks.md                         | —                                         |
| sdd-dev      | tasked→developing   | implementation/ 代码 + evidence/ | —                                         |
| sdd-test     | developing→testing  | evidence/test-report.md          | —                                         |
| sdd-converge | testing→completed   | convergence.md + 知识更新        | → sdd-knowledge(沉淀+索引)                |

### 辅助 Skill（不进生命周期）

| Skill            | 能力                  | 被调用方                                               |
| ---------------- | --------------------- | ------------------------------------------------------ |
| sdd-feature-tree | Feature Tree 自动生成 | sdd-explore, sdd-reverse                               |
| sdd-knowledge    | 沉淀/添加/索引/检索   | sdd-explore(检索), sdd-converge(沉淀+索引), 用户(添加) |
| sdd-reverse      | 旧项目知识接入        | 用户直接调用                                           |

---

## 5. 给 Agent 的提示词模板

### 启动新需求

```
请执行 skills/sdd-explore/SKILL.md 中的指令。

需求：用户注册功能，支持邮箱和手机号注册。
```

### 推进下一阶段

```
请执行 skills/sdd-prd/SKILL.md，为 CHG-0001 生成 PRD 草稿。
```

### 查看可用 Skill

```bash
openspec skill list        # 列出 10 个 Skill
openspec skill show sdd-prd  # 查看 Skill 元数据 + SKILL.md 路径
```

---

## 6. 已有项目接入

对 Agent 说：**"逆向分析现有代码"**

Agent 读 `skills/sdd-reverse/SKILL.md`，自动执行：

1. 扫描 `implementation/` 代码树
2. 创建 reverse CHG
3. 调用 sdd-feature-tree 生成 Feature Tree
4. 提取技术规则和业务能力草稿
5. 调用 sdd-knowledge 写入 standards/ 和 product/ + 重建索引
6. 展示知识草稿 → 用户确认 → 归档

---

## 7. 常用 CLI 原子命令

这些命令由 Agent 调用，用户通常不需要手动运行：

| 命令                                                     | 用途                                 |
| -------------------------------------------------------- | ------------------------------------ |
| `openspec init`                                          | 初始化 Workspace（**唯一用户命令**） |
| `openspec change create --title <t> [--requirement <r>]` | 创建 CHG                             |
| `openspec change list/show/status/archive`               | Change 管理                          |
| `openspec feature list/show/add/update/remove`           | Feature Tree 管理                    |
| `openspec gate check/approve/status`                     | Gate 校验与审批                      |
| `openspec change status <id> --set <state>`              | 推进状态                             |
| `openspec skill list/show`                               | Skill 元数据查询                     |
| `openspec doctor/status/validate`                        | 工具命令                             |

---

## 8. 目录结构

```
my-project/
├── .sdd/
│   ├── workspace.yaml          # 项目元信息
│   ├── repositories.yaml       # 仓库配置
│   ├── context-rules.yaml      # 上下文规则
│   ├── knowledge-index.json    # 知识索引（Agent 检索）
│   └── version.yaml
├── standards/                  # 技术规则世界
│   └── INDEX.md               # 技术规则索引（人读）
├── product/                    # 产品知识世界
│   ├── feature-tree.yaml       # 四级 Feature Tree
│   └── INDEX.md               # 产品知识索引（人读）
├── delivery/                   # 交付世界
│   ├── changes/
│   │   └── CHG-0001/
│   │       ├── metadata.yaml   # Change 元信息 + Gate 结果
│   │       ├── requirement.md
│   │       ├── exploration.md
│   │       ├── prd.md
│   │       ├── design.md
│   │       ├── tasks.md
│   │       ├── implementation.md
│   │       ├── convergence.md
│   │       └── evidence/
│   └── archive/
├── skills/                     # Skill 世界（10 个 Skill）
│   ├── sdd-explore/
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
│   └── default.yaml
└── implementation/             # 代码实现
```

---

## 9. 最佳实践

1. **只手动运行 `openspec init`** — 其余全交给 Agent
2. **每次确认草稿** — Agent 产出 Artifact 草稿后仔细审阅再确认
3. **利用知识检索** — sdd-explore 自动检索历史知识，避免重复探索
4. **Feature Tree 有机生长** — 不需要预先构建，随需求自动创建
5. **收敛不跳过** — sdd-converge 沉淀知识到 standards/product/，是 SDD 核心价值
6. **定期 doctor** — `openspec doctor` 确保 Workspace 完整
7. **skill list 查看能力** — `openspec skill list` 了解全部 10 个 Skill
