# OpenSpec AI Development Harness

## 简介

OpenSpec AI Development Harness 是一个为 AI Coding Agent 设计的 SDD（规范驱动开发）框架。

它提供：

- 软件开发工作流；
- 项目知识管理；
- 特性管理；
- 变更管理；
- AI Skill 规范；
- 工程治理。

其目标是使 AI Coding Agent，例如：

- Trae
- Cursor
- Claude Code
- Codex

能够带着项目上下文、工程规则和可追溯的交付流程参与软件开发。

---

# 项目愿景

传统 AI 编码：

```
需求

↓

AI

↓

代码
```

存在的问题：

- 缺乏项目记忆；
- 缺乏工程约束；
- 缺乏可追溯性；
- 长期维护困难。

OpenSpec 方式：

```
需求

↓

知识

↓

规范

↓

实现

↓

证据

↓

知识更新
```

---

# 架构概览

OpenSpec Harness 由以下部分组成：

```
OpenSpec AI Development Harness


├── 工作流层（Workflow Layer）

├── 知识层（Knowledge Layer）

├── Skill 层（Skill Layer）

├── 证据层（Evidence Layer）

├── 仓库层（Repository Layer）

└── 治理层（Governance Layer）
```

代码实现采用 `cli/`（命令行交互层）+ `core/`（领域内核，纯函数）分层结构。

---

# 核心概念

## 四个世界（Four Worlds）

OpenSpec 通过四个世界管理项目信息：

### 标准世界（Standards World）

```
standards/
```

项目规则与工程标准。

---

### 产品世界（Product World）

```
product/
```

产品能力与规范，含四级特性树（Product → Module → Feature → Story）。

---

### 交付世界（Delivery World）

```
delivery/
```

需求变更与交付历史。

---

### 实现世界（Implementation World）

```
implementation/
```

实际源代码与运行时资源（多仓时为 Git Submodule 或普通目录注册）。

---

# 开发状态

当前版本：

```
v0.4.0
```

当前阶段：

```
Phase 4.3 可追踪规格与执行隔离 - 已完成
```

已完成能力：

- Phase 1 MVP：工作区初始化、Change 生命周期、特性树、核心 SDD Skill、Gate 驱动工作流引擎；
- Phase 2 工程增强：Prompt 体系、多仓交付（Delivery Unit）、上下文规则、DU 绑定执行；
- Phase 3 Professional：版本管理与升级系统、项目模板（Stack）、IDE 适配；
- Phase 4.1–4.2：Gate 轻量化、Change–Story–DU 三级规格、多 Story 聚合工作流与 Stale 传播；
- Phase 4.3：领域化 Story 拆分、DU 前移到设计阶段、AC–DES–DU–TC–EVD 追踪链、TDD 证据约束与一键人审。

---

# 仓库结构

```
OpenSpec-AI-Development-Harness/

├── cli/          CLI 入口与命令（openspec）

├── core/         领域内核（sdd / workspace，纯函数）

├── docs/         架构与规范文档

├── plans/        各 Phase 设计文档

├── templates/    工作区模板 / 技术栈包 / IDE 规则 / Artifact 模板

├── skills/       11 个 AI Skill 定义

├── workflows/    工作流定义

├── tests/        Node test 测试套件

├── schemas/      数据结构定义

└── scripts/      开发与自动化脚本
```

---

# 快速开始

## 安装

```bash
# Node.js >= 20
npm install
npm run openspec -- --help
```

需要全局使用时：

```bash
npm link
openspec --help
```

## 初始化工作区

```bash
openspec init
```

交互式创建 OpenSpec 工作区：项目名称 → 项目类型 → 代码现状 → 仓库模式（单仓/多仓）→ 技术栈模板（empty / spring-cloud / vue / ai-agent）。

## IDE 适配（可选）

```bash
openspec ide trae          # 生成 .trae/rules
openspec ide cursor        # 生成 .cursor/rules（.mdc）
openspec ide claude-code   # 注入 CLAUDE.md 标记块
openspec ide codex         # 注入 AGENTS.md 标记块（Codex CLI）
```

## 日常命令

| 命令 | 用途 |
| --- | --- |
| `openspec init` | 初始化工作区 |
| `openspec change create/list` | 变更管理 |
| `openspec feature tree` | 特性树管理 |
| `openspec workflow run` | 推进 SDD 流程（Gate 驱动） |
| `openspec approve` | 一键人审：扫描待审批项 → 确认 → 自动续跑（免记 stage/story） |
| `openspec du` | Delivery Unit 管理（多仓交付） |
| `openspec gate` | Gate 评审（machine/human，低层命令） |
| `openspec status` | 变更状态全景 |
| `openspec validate` | Artifact 校验 |
| `openspec doctor` | 工作区健康检查 |
| `openspec context` | 预览 Agent 上下文装配 |
| `openspec skill sync` | 同步/升级 Skill 与 Prompt |
| `openspec reverse` | 知识反向工程 |
| `openspec version` | 版本全景 |
| `openspec upgrade` | 工作区确定性升级（支持 --dry-run / --rollback） |
| `openspec ide` | AI IDE 项目规则生成 |

完整用法见 [docs/complete-usage-guide.md](./docs/complete-usage-guide.md)。

---

# 路线图

## Phase 0

基础设计（已完成）：架构、工作流、Skill 规范、知识模型。

## Phase 1

MVP 实现（已完成）：工作区初始化、变更管理、特性树、核心 Skill、知识反向工程。

## Phase 2

工程增强（已完成）：证据系统、校验、评审工作流、上下文管理、多仓交付。

## Phase 3

Professional（已完成）：版本管理与升级、项目模板、IDE 适配。

## Phase 4

Team Version（进行中）：Gate 轻量化、三级规格、多 Story 工作流和可追踪交付已经落地；更完整的团队协作能力继续演进。

---

# 设计理念

OpenSpec Harness 不替代 AI Coding Agent。

它提供：

```
AI Agent

+

软件工程流程

+

项目知识

+

治理
```

使 AI 成为长期的软件工程协作者。

---

# 许可证

当前仓库尚未提供 LICENSE 文件。在许可证补齐前，请勿假定代码可按某种开源许可证再分发。
